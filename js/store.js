/* ═══════════════════════════════════════════════════════════════
   STORE — état de l'application et accès aux données
   Collections Firestore (inchangées par rapport à la version 2) :
   users · schedules · absenceRequests · vanRequests · announcements
   auditLog · snapshots · settings/{holidays, openSundays,
   lockedMonths, period, managerAbsences, store}
   ═══════════════════════════════════════════════════════════════ */
import * as C from './core.js';
import { db, F, isDemo, sendMail } from './backend.js';
import { MANAGER_EMAIL, APP_URL, EJS_TPL_REQ, EJS_TPL_RESP, STORE_DEFAULTS } from './config.js';

export const S = {
  me: null,
  users: [],
  schedules: {},            // { username: days }
  schedulesAt: 0,
  requests: [],             // demandes d'absence (toutes pour un admin, les miennes sinon)
  van: [],
  announcements: [],
  holidays: {}, openSundays: {}, locks: {}, mgrAbs: {},
  period: C.buildPeriod(),
  store: { ...STORE_DEFAULTS }
};

/* ─── Mini bus d'événements ─── */
const subs = {};
export const on = (evt, fn) => { (subs[evt] = subs[evt] || []).push(fn); };
export const emit = evt => (subs[evt] || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

export const uid = () => S.me?.username || S.me?.id || '';
export const isAdmin = () => S.me?.role === 'admin';
// Le compte technique « admin » n'a pas de planning suivi
export const hasPlanning = (u = S.me) => !!u && u.username !== 'admin';
export const team = () => S.users.filter(u => u.username !== 'admin').sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));
export const userOf = id => S.users.find(u => u.username === id) || (id === uid() ? S.me : null);
export const daysOf = id => S.schedules[id] || {};
export const myDays = () => daysOf(uid());
export const cpOpts = () => ({ cpMode: S.store.cpMode || 'ouvrables' });
export const statsOf = u => C.computeStats(u, daysOf(u.username), S.period, C.todayKey(), cpOpts());
const col = name => db.collection(name);
const secs = t => t?.seconds || Math.floor(Date.now() / 1000) + 1;   // écriture locale en attente = « maintenant »
const byCreated = (a, b) => secs(b.createdAt) - secs(a.createdAt);
const managerEmail = () => S.store.managerEmail || MANAGER_EMAIL;

/* ═══ Authentification ═══ */
const SESSION = 'annualisation-session';

export async function ensureAdminAccount() {
  const ref = col('users').doc('admin');
  const doc = await ref.get();
  if (doc.exists) return;
  await ref.set({
    id: 'admin', name: 'Administrateur', username: 'admin', password: 'admin123', mustChangePassword: true,
    role: 'admin', email: MANAGER_EMAIL, typePlanning: C.defaultTP(), createdAt: F.ts()
  });
}

async function fetchUser(username) {
  const snap = await col('users').where('username', '==', username).limit(1).get();
  if (!snap.empty) return snap.docs[0].data();
  const direct = await col('users').doc(username).get();
  return direct.exists ? direct.data() : null;
}

export async function login(username, password, remember) {
  const user = await fetchUser(username.trim());
  if (!user || !(await C.checkPassword(user, password))) return false;
  S.me = user;
  sessionStorage.setItem(SESSION, uid());
  if (remember) localStorage.setItem(SESSION, uid()); else localStorage.removeItem(SESSION);
  return true;
}
export async function restoreSession() {
  const name = sessionStorage.getItem(SESSION) || localStorage.getItem(SESSION);
  if (!name) return false;
  const user = await fetchUser(name);
  if (!user) { logout(); return false; }
  S.me = user;
  return true;
}
export function logout() {
  sessionStorage.removeItem(SESSION); localStorage.removeItem(SESSION);
  unsubs.splice(0).forEach(u => { try { u(); } catch (e) { /* déjà fermé */ } });
  S.me = null; S.schedules = {}; S.requests = []; S.van = []; S.users = [];
}
export const verifyMyPassword = pw => C.checkPassword(S.me, pw);
export async function updateMyEmail(email) {
  await col('users').doc(uid()).update({ email, updatedAt: F.ts() });
  S.me = await fetchUser(uid());
  await loadUsers();
}

async function passwordFields(username, password) {
  if (S.store.hashPasswords) return { passwordHash: await C.hashPassword(username, password), password: F.del() };
  return { password, passwordHash: F.del() };
}
export async function changePassword(username, password) {
  const fields = await passwordFields(username, password);
  await col('users').doc(username).update({ ...fields, mustChangePassword: F.del(), updatedAt: F.ts() });
  if (username === uid()) S.me = await fetchUser(username);
  audit('password_change', `Mot de passe modifié pour @${username}`);
}
// Convertit tous les mots de passe en clair en empreintes SHA-256
export async function hashAllPasswords() {
  const snap = await col('users').get();
  let n = 0;
  for (const d of snap.docs) {
    const u = d.data();
    if (u.password === undefined || u.passwordHash) continue;
    await col('users').doc(d.id).update({ passwordHash: await C.hashPassword(u.username || d.id, u.password), password: F.del() });
    n++;
  }
  await saveStore({ hashPasswords: true });
  if (S.me) S.me = await fetchUser(uid());
  audit('security_hash', `${n} mot(s) de passe protégé(s) par empreinte`);
  return n;
}

/* ═══ Chargement ═══ */
const unsubs = [];
const setting = async (id, field, fallback = {}) => {
  try { const d = await col('settings').doc(id).get(); return d.exists ? (field ? (d.data()[field] ?? fallback) : d.data()) : fallback; }
  catch (e) { console.warn('settings/' + id, e); return fallback; }
};

export async function loadSettings() {
  const [holidays, openSundays, locks, period, mgrAbs, store] = await Promise.all([
    setting('holidays', 'list'), setting('openSundays', 'list'), setting('lockedMonths', 'locks'),
    setting('period', null, null), setting('managerAbsences', 'days'), setting('store', null, {})
  ]);
  Object.assign(S, { holidays, openSundays, locks, mgrAbs });
  S.period = C.buildPeriod(period || {});
  S.store = { ...STORE_DEFAULTS, ...store, minStaff: { ...STORE_DEFAULTS.minStaff, ...(store.minStaff || {}) } };
}

export async function loadUsers() {
  const snap = await col('users').get();
  // les mots de passe des autres comptes ne sont jamais conservés en mémoire
  S.users = snap.docs.map(d => { const u = d.data(); const { password, passwordHash, ...safe } = u; return { ...safe, username: u.username || d.id }; });
}

export async function loadSchedule(userId) {
  const ref = col('schedules').doc(userId);
  const doc = await ref.get();
  if (doc.exists) { S.schedules[userId] = doc.data().days || {}; return S.schedules[userId]; }
  const user = userOf(userId) || { username: userId };
  let days = {};
  C.rangeKeys(S.period.startKey, S.period.endKey).forEach(k => { days[k] = C.emptyDay(k, user, S.period); });
  if (userId !== 'admin') days = C.applyTypePlanning(days, user, S.period, { holidays: S.holidays });
  await ref.set({ userId, days });
  S.schedules[userId] = days;
  return days;
}

export async function loadAllSchedules(force = false) {
  if (!force && Date.now() - S.schedulesAt < 45000) return;
  const snap = await col('schedules').get();
  const next = {};
  snap.docs.forEach(d => { next[d.id] = d.data().days || {}; });
  S.schedules = next;
  S.schedulesAt = Date.now();
}

function subscribe(query, apply, evt) {
  return new Promise(resolve => {
    let first = true;
    const un = query.onSnapshot(snap => {
      apply(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (first) { first = false; resolve(); } else emit(evt);
    }, err => { console.error(evt, err); if (first) { first = false; resolve(); } });
    unsubs.push(un);
  });
}

export async function loadSession() {
  await loadSettings();
  await loadUsers();
  const jobs = [
    subscribe(isAdmin() ? col('absenceRequests') : col('absenceRequests').where('userId', '==', uid()),
      list => { S.requests = list.sort(byCreated); }, 'requests'),
    subscribe(col('vanRequests'), list => { S.van = list.sort(byCreated); }, 'van'),
    subscribe(col('announcements'), list => { S.announcements = list.sort(byCreated); }, 'announcements')
  ];
  if (hasPlanning()) jobs.push(loadSchedule(uid()));
  await Promise.all(jobs);
  await loadAllSchedules(true);
  // un collaborateur sans planning (profil créé par une ancienne version) en reçoit un
  for (const u of team()) if (!S.schedules[u.username] && (isAdmin() || u.username === uid())) await loadSchedule(u.username);
}

/* ═══ Plannings ═══ */
// Écrit uniquement les journées modifiées (pas d'écrasement des saisies concurrentes)
export async function saveDays(userId, patch) {
  const upd = {};
  for (const k in patch) upd['days.' + k] = patch[k];
  if (!Object.keys(upd).length) return;
  await col('schedules').doc(userId).update(upd);
  S.schedules[userId] = { ...daysOf(userId), ...patch };
  emit('schedule');
}
export async function replaceSchedule(userId, days) {
  await col('schedules').doc(userId).set({ userId, days });
  S.schedules[userId] = days;
  emit('schedule');
}
const freshDays = async userId => {
  const doc = await col('schedules').doc(userId).get();
  return doc.exists ? (doc.data().days || {}) : await loadSchedule(userId);
};
const diffPatch = (before, after, from, to) => {
  const patch = {};
  for (const k of C.rangeKeys(from, to)) if (JSON.stringify(before[k]) !== JSON.stringify(after[k]) && after[k]) patch[k] = after[k];
  return patch;
};

/* Saisie d'une ou plusieurs journées.
   comment : obligatoire pour un collaborateur (traçabilité), facultatif pour la direction. */
export async function editDays(userId, keys, { hours, note, comment }) {
  const days = daysOf(userId);
  const patch = {};
  const byAdmin = isAdmin();
  for (const k of keys) {
    const ex = days[k] || { hours: 0, type: 'normal', note: '' };
    if (ex.absenceId || C.TYPES[ex.type]) continue;
    const h = hours === undefined ? C.hoursOf(ex) : hours;
    const e = { hours: h, type: h > 0 ? 'normal' : 'repos', note: note !== undefined ? note : (ex.note || '') };
    if (ex.holidayClosed) e.holidayClosed = true;
    if (comment && !byAdmin) { e.modifiedByUser = true; e.modifComment = comment; e.note = '🟠 ' + comment; }
    else if (ex.modifiedByUser && hours === undefined) { e.modifiedByUser = true; e.modifComment = ex.modifComment || ''; }
    patch[k] = e;
  }
  await saveDays(userId, patch);
  const n = Object.keys(patch).length;
  if (n) {
    const who = userId === uid() ? S.me.name : `${S.me.name} (pour ${userOf(userId)?.name || userId})`;
    audit(n > 1 ? 'bulk_modif' : 'modif_heure', n > 1
      ? `${who} a modifié ${n} jours : ${C.num(hours ?? 0)} h${comment ? ' — ' + comment : ''}`
      : `${who} a modifié le ${C.disp(keys[0])} : ${C.num(patch[keys[0]]?.hours ?? 0)} h${comment ? ' — ' + comment : ''}`);
  }
  return n;
}

export async function reapplyTypePlanning(userId, opts = {}) {
  const user = userOf(userId);
  const before = await freshDays(userId);
  const after = C.applyTypePlanning(before, user, S.period, { holidays: S.holidays, ...opts });
  await replaceSchedule(userId, after);
  audit('apply_type_planning', `Planning type réappliqué pour ${user?.name || userId}${opts.from ? ' à partir du ' + C.disp(opts.from) : ''}${opts.to ? ' jusqu’au ' + C.disp(opts.to) : ''}`);
}

/* ═══ Demandes d'absence ═══ */
const reqLabel = r => `${r.type} ${r.dateLabel || C.disp(r.date)}`;
const LIVE = ['pending', 'approved', 'waiting', 'cancel_pending'];

// Contrôles communs. Renvoie '' si la demande est recevable, sinon le message d'erreur.
export function checkAbsence({ userId, type, start, end, qty }) {
  const user = userOf(userId);
  if (!type || !start) return 'Choisissez un type et une date.';
  if (start > end) return 'La date de fin doit suivre la date de début.';
  if (!qty || qty <= 0) return 'Indiquez une quantité.';
  if (!C.inPeriod(S.period, start) || !C.inPeriod(S.period, end)) return `Dates hors période (${S.period.longLabel}).`;
  const ek = C.entryKey(user, S.period);
  if (ek && start < ek) return `Entrée dans l’entreprise le ${C.disp(ek)} : rien ne peut être posé avant.`;
  const clash = S.requests.find(r => r.userId === userId && LIVE.includes(r.status) && C.overlaps(start, end, r.date, r.dateEnd || r.date));
  if (clash) return `Chevauchement avec « ${clash.type} » ${clash.dateLabel || C.disp(clash.date)} (${C.statusLabel(clash.status).toLowerCase()}).`;
  return '';
}

export async function submitAbsence({ userId = uid(), type, start, end, qty, comment = '', direct = false }) {
  end = end || start;
  const err = checkAbsence({ userId, type, start, end, qty });
  if (err) throw new Error(err);
  const user = userOf(userId);
  const id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const req = {
    id, userId, userName: user.name, userEmail: user.email || '',
    type, date: start, dateEnd: end, hours: qty, qLabel: C.qtyLabel(type, qty),
    dateLabel: start === end ? C.disp(start) : `du ${C.disp(start)} au ${C.disp(end)}`,
    comment, status: direct ? 'approved' : 'pending', createdAt: F.ts(), source: 'v3'
  };
  if (direct) Object.assign(req, { createdByAdmin: true, processedAt: F.ts(), processedBy: S.me.name });
  await col('absenceRequests').doc(id).set(req);
  if (direct) {
    await applyToSchedule(req);
    mailEmployeeDecision(req, 'approved', 'Absence enregistrée directement par la direction.');
    audit('absence_direct', `Absence saisie par la direction pour ${user.name} (${reqLabel(req)})`);
  } else {
    sendMail(EJS_TPL_REQ, {
      to_email: managerEmail(), reply_to: req.userEmail,
      subject: `Demande d'absence — ${req.userName} — ${req.type}`, employee_name: req.userName,
      status_message: `📋 DEMANDE D'ABSENCE\n\nCollaborateur : ${req.userName}\nType : ${req.type}\nDate(s) : ${req.dateLabel}\nDurée : ${req.qLabel}\nCommentaire : ${req.comment || 'Aucun'}\n\nConnectez-vous pour traiter cette demande : ${APP_URL}`,
      approve_url: `${APP_URL}/?action=approve&requestId=${id}`, reject_url: `${APP_URL}/?action=reject&requestId=${id}`,
      waiting_url: `${APP_URL}/?action=waiting&requestId=${id}`, request_id: id, manager_url: `${APP_URL}/?page=manager-requests`
    });
  }
  return id;
}

async function getRequest(id) {
  const doc = await col('absenceRequests').doc(id).get();
  if (!doc.exists) throw new Error('Demande introuvable.');
  return { id: doc.id, ...doc.data() };
}

async function applyToSchedule(req) {
  const user = userOf(req.userId);
  if (!user) return;
  const before = await freshDays(req.userId);
  const after = C.applyAbsence(before, req, user, S.holidays, cpOpts());
  await saveDays(req.userId, diffPatch(before, after, req.date, req.dateEnd || req.date));
}
async function removeFromSchedule(req) {
  const user = userOf(req.userId);
  if (!user) return;
  const before = await freshDays(req.userId);
  const after = C.removeAbsence(before, req, user, S.holidays, S.period);
  if (after) await saveDays(req.userId, diffPatch(before, after, req.date, req.dateEnd || req.date));
}

function mailEmployeeDecision(req, status, comment = '') {
  if (!req.userEmail) return;
  const msg = { approved: 'approuvée ✅', rejected: 'refusée ❌', waiting: 'mise en attente ⏸' }[status] || status;
  sendMail(EJS_TPL_RESP, {
    to_email: req.userEmail, reply_to: managerEmail(),
    subject: `Votre demande d'absence (${req.type}) a été ${msg}`, employee_name: req.userName,
    status_message: `📋 RÉPONSE À VOTRE DEMANDE D'ABSENCE\n\nBonjour ${req.userName},\n\nVotre demande d'absence a été : ${msg.toUpperCase()}\n\nType : ${req.type}\nDate(s) : ${req.dateLabel || C.disp(req.date)}\nDurée : ${req.qLabel || req.hours + 'h'}\n${comment ? `\nMessage de la direction : ${comment}\n` : ''}\nConsultez vos demandes : ${APP_URL}`,
    app_url: APP_URL
  });
}

// Décision de la direction : approved | rejected | waiting
export async function decideRequest(id, status, comment = '') {
  const before = await getRequest(id);
  const upd = { status, processedAt: F.ts(), processedBy: S.me.name };
  if (comment) upd.managerComment = comment;
  await col('absenceRequests').doc(id).update(upd);
  const req = { ...before, status };
  if (status === 'approved') await applyToSchedule(req);
  else if (before.status === 'approved' || status === 'rejected') await removeFromSchedule(req);
  mailEmployeeDecision(req, status, comment);
  audit('request_' + status, `Demande de ${req.userName} (${reqLabel(req)}) → ${C.statusLabel(status)}${comment ? ' — ' + comment : ''}`);
  return req;
}

export async function cancelPending(id) {
  await col('absenceRequests').doc(id).update({ status: 'cancelled', cancelApproved: false, cancelledAt: F.ts() });
}

export async function requestCancel(id, reason = '') {
  const r = await getRequest(id);
  const upd = { status: 'cancel_pending', previousStatus: r.status || 'approved', cancelReason: reason, cancelRequestedAt: F.ts() };
  // demande archivée : on garde le statut d'avant archivage pour pouvoir la restaurer en cas de refus
  if (r.status === 'archived') upd.archivedPreviousStatus = r.previousStatus || 'approved';
  await col('absenceRequests').doc(id).update(upd);
  sendMail(EJS_TPL_REQ, {
    to_email: managerEmail(), reply_to: r.userEmail,
    subject: `Demande d'annulation d'absence — ${r.userName} — ${r.type}`, employee_name: r.userName,
    status_message: `⚠️ DEMANDE D'ANNULATION D'ABSENCE\n\nCollaborateur : ${r.userName}\nType : ${r.type}\nPériode concernée : ${r.dateLabel || C.disp(r.date)}\nDurée : ${r.qLabel || r.hours + 'h'}\nMotif d'annulation : ${reason || 'Non précisé'}\n\nEn acceptant, le planning du collaborateur est rétabli automatiquement sur les journées concernées.\n\nConnectez-vous pour traiter cette demande : ${APP_URL}`,
    approve_url: `${APP_URL}/?action=approve_cancel&requestId=${id}`, reject_url: `${APP_URL}/?action=reject_cancel&requestId=${id}`,
    waiting_url: `${APP_URL}/?page=manager-requests`, request_id: id, manager_url: `${APP_URL}/?page=manager-requests`
  });
  audit('cancel_requested', `Demande d'annulation d'absence par ${r.userName} (${reqLabel(r)})`);
}

export async function decideCancel(id, decision) {
  const req = await getRequest(id);
  const ok = decision === 'approved';
  if (ok) {
    await col('absenceRequests').doc(id).update({ status: 'cancelled', cancelApproved: true, cancellationProcessedAt: F.ts(), processedAt: F.ts() });
    await removeFromSchedule(req);
  } else {
    const prev = req.previousStatus || 'approved';
    const upd = { status: prev, cancelApproved: false, cancelRejectedAt: F.ts(), processedAt: F.ts() };
    if (prev === 'archived') upd.previousStatus = req.archivedPreviousStatus || 'approved';
    await col('absenceRequests').doc(id).update(upd);
  }
  if (req.userEmail) sendMail(EJS_TPL_RESP, {
    to_email: req.userEmail, reply_to: managerEmail(),
    subject: `Votre demande d'annulation d'absence (${req.type}) a été ${ok ? 'acceptée ✅' : 'refusée ❌'}`, employee_name: req.userName,
    status_message: `📋 RÉPONSE À VOTRE DEMANDE D'ANNULATION D'ABSENCE\n\nBonjour ${req.userName},\n\nVotre demande d'annulation a été : ${ok ? 'ACCEPTÉE ✅' : 'REFUSÉE ❌'}\n\nType : ${req.type}\nDate(s) : ${req.dateLabel || C.disp(req.date)}\nDurée : ${req.qLabel || req.hours + 'h'}\n\n${ok ? '✅ Vos journées ont été rétablies telles qu’elles étaient avant l’absence.' : '❌ L’absence reste maintenue sur votre planning.'}\n\nConsultez votre planning : ${APP_URL}`,
    app_url: APP_URL
  });
  audit(ok ? 'cancel_request_approved' : 'cancel_request_rejected', `Demande d'annulation ${ok ? 'acceptée' : 'refusée'} pour ${req.userName} (${reqLabel(req)})`);
}

export async function archiveRequests(ids, collection = 'absenceRequests') {
  const src = collection === 'absenceRequests' ? S.requests : S.van;
  await Promise.all(ids.map(id => {
    const r = src.find(x => x.id === id);
    return col(collection).doc(id).update({ status: 'archived', previousStatus: r?.status || 'rejected', archivedAt: F.ts() });
  }));
}
export async function unarchiveRequest(id, collection = 'absenceRequests') {
  const src = collection === 'absenceRequests' ? S.requests : S.van;
  const r = src.find(x => x.id === id);
  await col(collection).doc(id).update({ status: r?.previousStatus || 'rejected', archivedAt: null });
}

/* ═══ Emprunt de la camionnette ═══ */
export async function submitVan({ start, end, parking = '', comment = '' }) {
  const s = new Date(start), e = new Date(end);
  if (!start || !end || isNaN(s) || isNaN(e)) throw new Error('Indiquez le départ et le retour.');
  if (e <= s) throw new Error('Le retour doit être après le départ.');
  const minH = S.store.vanMinHours ?? 48;
  if (!isAdmin() && (s - new Date()) < minH * 3600000) throw new Error(`Réservation impossible : il faut réserver au moins ${minH} h à l’avance.`);
  if (C.vanNeedsParking(start, end) && !parking) throw new Error('Indiquez le lieu de stationnement de la camionnette la nuit.');
  const clash = S.van.find(r => r.status === 'approved' && new Date(r.dateStart) < e && new Date(r.dateEnd) > s);
  if (clash) throw new Error(`Camionnette déjà réservée sur ce créneau (${clash.userName} · ${C.fmtDateTime(clash.dateStart)} → ${C.fmtDateTime(clash.dateEnd)}).`);
  const id = 'van_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const req = {
    id, userId: uid(), userName: S.me.name, userEmail: S.me.email || '', dateStart: start, dateEnd: end, parking, comment,
    dateLabel: `${C.fmtDateTime(start)} → ${C.fmtDateTime(end)}`, status: 'pending', createdAt: F.ts()
  };
  await col('vanRequests').doc(id).set(req);
  sendMail(EJS_TPL_REQ, {
    to_email: managerEmail(), reply_to: req.userEmail, subject: `Demande d'emprunt camionnette — ${req.userName}`, employee_name: req.userName,
    status_message: `🚐 DEMANDE D'EMPRUNT DE LA CAMIONNETTE\n\nCollaborateur : ${req.userName}\nDépart : ${C.fmtDateTime(start)}\nRetour : ${C.fmtDateTime(end)}\nStationnement la nuit : ${parking || '— (non requis)'}\nMotif : ${comment || 'Aucun'}\n\nConnectez-vous pour traiter cette demande : ${APP_URL}`,
    approve_url: `${APP_URL}/?action=approve&kind=van&requestId=${id}`, reject_url: `${APP_URL}/?action=reject&kind=van&requestId=${id}`,
    waiting_url: `${APP_URL}/?action=waiting&kind=van&requestId=${id}`, request_id: id, manager_url: `${APP_URL}/?page=van-requests`
  });
  return S.van.some(r => r.id !== id && ['pending', 'waiting'].includes(r.status) && new Date(r.dateStart) < e && new Date(r.dateEnd) > s);
}
export async function cancelVan(id) {
  await col('vanRequests').doc(id).update({ status: 'cancelled', cancelledAt: F.ts() });
}
export async function decideVan(id, status, comment = '') {
  const upd = { status, processedAt: F.ts(), processedBy: S.me.name };
  if (comment) upd.managerComment = comment;
  await col('vanRequests').doc(id).update(upd);
  const req = S.van.find(r => r.id === id) || (await col('vanRequests').doc(id).get()).data();
  const msg = { approved: 'approuvée ✅', rejected: 'refusée ❌', waiting: 'mise en attente ⏸' }[status] || status;
  if (req?.userEmail) sendMail(EJS_TPL_RESP, {
    to_email: req.userEmail, reply_to: managerEmail(), subject: `Votre demande d'emprunt de la camionnette a été ${msg}`, employee_name: req.userName,
    status_message: `🚐 RÉPONSE À VOTRE DEMANDE D'EMPRUNT\n\nBonjour ${req.userName},\n\nVotre demande d'emprunt de la camionnette a été : ${msg.toUpperCase()}\n\nDépart : ${C.fmtDateTime(req.dateStart)}\nRetour : ${C.fmtDateTime(req.dateEnd)}\n${req.parking ? `Stationnement la nuit : ${req.parking}\n` : ''}${comment ? `\nMessage de la direction : ${comment}\n` : ''}\nConsultez vos demandes : ${APP_URL}`,
    app_url: APP_URL
  });
  audit('van_' + status, `Emprunt camionnette de ${req?.userName} (${req?.dateLabel || req?.dateStart}) → ${C.statusLabel(status)}`);
}

/* ═══ Collaborateurs ═══ */
export async function createUser(data, password) {
  const username = data.username.trim().toLowerCase().replace(/\s+/g, '.');
  if (!data.name || !username || !password) throw new Error('Nom, identifiant et mot de passe sont obligatoires.');
  if (data.dateEntree && data.dateEntree > S.period.endKey) throw new Error(`La date d’entrée dépasse la fin de la période (${C.disp(S.period.endKey)}).`);
  const existing = await col('users').doc(username).get();
  if (existing.exists) throw new Error('Cet identifiant est déjà utilisé.');
  const pw = S.store.hashPasswords ? { passwordHash: await C.hashPassword(username, password) } : { password };
  const user = { ...data, id: username, username, ...pw, createdAt: F.ts() };
  await col('users').doc(username).set(user);
  await loadUsers();
  let days = {};
  C.rangeKeys(S.period.startKey, S.period.endKey).forEach(k => { days[k] = C.emptyDay(k, user, S.period); });
  days = C.applyTypePlanning(days, user, S.period, { holidays: S.holidays });
  await replaceSchedule(username, days);
  audit('create_user', `Profil créé : ${data.name} (@${username}${data.isCadre ? ' — cadre' : ''}${data.dateEntree ? ' — entrée le ' + C.disp(data.dateEntree) : ''})`);
  return username;
}

/* reapply : null (ne pas toucher aux heures) | 'future' (à partir de demain) | 'all' (toute la période) */
export async function updateUser(username, data, { password = '', reapply = null } = {}) {
  if (!data.name) throw new Error('Le nom est obligatoire.');
  if (data.dateEntree && data.dateEntree > S.period.endKey) throw new Error(`La date d’entrée dépasse la fin de la période (${C.disp(S.period.endKey)}).`);
  const before = userOf(username) || {};
  const upd = { ...data, updatedAt: F.ts() };
  if (password) Object.assign(upd, await passwordFields(username, password));
  await col('users').doc(username).update(upd);
  await loadUsers();
  if (username === uid()) S.me = await fetchUser(username);
  const user = userOf(username);
  const entryChanged = (before.dateEntree || '') !== (data.dateEntree || '');
  if (username !== 'admin' && (entryChanged || reapply)) {
    const days = { ...(await freshDays(username)) };
    const ek = C.entryKey(user, S.period), tp = C.tpOf(user);
    // jours redevenus « dans le contrat » après un changement de date d'entrée
    for (const k in days) if (days[k]?.beforeEntry && (!ek || k >= ek)) {
      const h = parseFloat(tp[C.DAYS[C.dow(k)]]) || 0;
      days[k] = { hours: h, type: h > 0 ? 'normal' : 'repos', note: '' };
    }
    const from = reapply === 'all' ? S.period.startKey : reapply === 'future' ? C.addDays(C.todayKey(), 1) : C.addDays(S.period.endKey, 1);
    await replaceSchedule(username, C.applyTypePlanning(days, user, S.period, { holidays: S.holidays, from }));
  }
  audit('update_user', `Profil modifié : ${data.name} (@${username})${reapply ? ' — planning type réappliqué (' + (reapply === 'all' ? 'toute la période' : 'à partir de demain') + ')' : ''}`);
}

export async function deleteUser(username) {
  const u = userOf(username);
  await col('users').doc(username).delete();
  await col('schedules').doc(username).delete();
  delete S.schedules[username];
  await loadUsers();
  audit('delete_user', `Profil supprimé : ${u?.name || username}`);
}

/* ═══ Paramètres ═══ */
export async function saveStore(patch) {
  S.store = { ...S.store, ...patch };
  const { vanMinHours, ...toSave } = S.store;
  await col('settings').doc('store').set({ ...toSave, vanMinHours: vanMinHours ?? 48 });
}
export async function savePeriod(cfg) {
  await col('settings').doc('period').set(cfg);
  S.period = C.buildPeriod(cfg);
  audit('config_period', `Période modifiée : ${S.period.longLabel}, objectif ${cfg.hoursTarget} h`);
}

// Applique (ou lève) la fermeture d'un jour férié sur tous les plannings
async function applyHolidayToAll(date, name, closed) {
  await loadAllSchedules(true);
  await Promise.all(team().map(async u => {
    const ex = daysOf(u.username)[date];
    if (!ex || ex.absenceId || ex.beforeEntry) return;
    let e;
    if (closed) e = { hours: 0, type: 'normal', note: `${name} — fermé`, holidayClosed: true };
    else { const h = parseFloat(C.tpOf(u)[C.DAYS[C.dow(date)]]) || 0; e = { hours: h, type: h > 0 ? 'normal' : 'repos', note: `${name} — ouvert (férié)` }; }
    await saveDays(u.username, { [date]: e });
  }));
}
export async function setHoliday(date, name, open) {
  const was = S.holidays[date];
  S.holidays = { ...S.holidays, [date]: { name, open } };
  await col('settings').doc('holidays').set({ list: S.holidays });
  if (C.inPeriod(S.period, date) && (!was || was.open !== open)) await applyHolidayToAll(date, name, !open);
  audit('holiday', `Jour férié ${name} (${C.disp(date)}) : ${open ? 'ouvert' : 'fermé'}`);
}
export async function deleteHoliday(date) {
  const was = S.holidays[date];
  const next = { ...S.holidays }; delete next[date];
  S.holidays = next;
  await col('settings').doc('holidays').set({ list: next });
  if (was && !was.open && C.inPeriod(S.period, date)) await applyHolidayToAll(date, was.name, false);
}
export async function loadDefaultHolidays() {
  const defaults = C.holidaysForPeriod(S.period);
  const added = Object.keys(defaults).filter(k => !S.holidays[k]);
  if (!added.length) return 0;
  S.holidays = { ...S.holidays, ...Object.fromEntries(added.map(k => [k, defaults[k]])) };
  await col('settings').doc('holidays').set({ list: S.holidays });
  for (const k of added) await applyHolidayToAll(k, defaults[k].name, true);
  audit('holiday', `${added.length} jour(s) férié(s) chargé(s) pour ${S.period.label}`);
  return added.length;
}
export async function setOpenSunday(date, note) {
  const next = { ...S.openSundays };
  if (note === null) delete next[date]; else next[date] = { note: note || 'Dimanche ouvert' };
  S.openSundays = next;
  await col('settings').doc('openSundays').set({ list: next });
}
export async function setLock(idx, range) {
  const next = { ...S.locks };
  if (range) next[idx] = range; else delete next[idx];
  S.locks = next;
  await col('settings').doc('lockedMonths').set({ locks: next });
  audit('lock', `${S.period.months[idx].name} ${range ? `verrouillé du ${C.disp(range.from)} au ${C.disp(range.to)}` : 'déverrouillé'}`);
}
export async function setMgrAbs(patch) {
  const next = { ...S.mgrAbs };
  for (const k in patch) { if (patch[k]) next[k] = patch[k]; else delete next[k]; }
  S.mgrAbs = next;
  await col('settings').doc('managerAbsences').set({ days: next });
}

/* ═══ Annonces ═══ */
export async function createAnnouncement(title, message) {
  const id = 'ann_' + Date.now();
  await col('announcements').doc(id).set({ id, title: title || 'Information', message, createdAt: F.ts(), createdBy: S.me?.name || 'Direction', active: true, acknowledgedBy: {} });
  audit('annonce_creee', `${S.me.name} a créé une annonce : ${title || 'Information'}`);
}
export const toggleAnnouncement = (id, active) => col('announcements').doc(id).update({ active });
export const deleteAnnouncement = id => col('announcements').doc(id).delete();
// Le chemin est passé segment par segment : avec « acknowledgedBy.prenom.nom », Firestore créerait
// un champ imbriqué { prenom: { nom } } et l'accusé de lecture ne serait jamais retrouvé.
export const ackAnnouncement = id => col('announcements').doc(id).update(F.path('acknowledgedBy', uid()), F.ts());
// Accusé de lecture d'un collaborateur (tolère les anciens accusés enregistrés en champ imbriqué)
export function ackOf(a, username) {
  const ack = a?.acknowledgedBy || {};
  if (ack[username]) return ack[username];
  const nested = username.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), ack);
  return nested && nested.seconds ? nested : null;
}
export const pendingAnnouncements = () => S.announcements
  .filter(a => a.active !== false && !ackOf(a, uid()))
  .sort((a, b) => secs(a.createdAt) - secs(b.createdAt));

/* ═══ Historique ═══ */
export async function audit(action, message) {
  try { await col('auditLog').add({ action, message, userId: uid(), userName: S.me?.name || '?', timestamp: F.ts() }); }
  catch (e) { /* l'historique ne doit jamais bloquer une action */ }
}
export async function loadAudit(max = 300) {
  const snap = await col('auditLog').orderBy('timestamp', 'desc').limit(max).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ═══ Sauvegardes ═══ */
const SNAP_RETENTION = 30;
export async function createSnapshot(kind = 'manual') {
  const snap = await col('schedules').get();
  const schedules = {};
  snap.docs.forEach(d => { schedules[d.id] = d.data() || {}; });
  const n = new Date();
  const id = `snap_${n.getFullYear()}${C.pad(n.getMonth() + 1)}${C.pad(n.getDate())}_${C.pad(n.getHours())}${C.pad(n.getMinutes())}${C.pad(n.getSeconds())}_${Math.random().toString(36).slice(2, 6)}`;
  const doc = { id, createdAt: F.ts(), createdAtMs: Date.now(), createdBy: S.me?.name || '?', createdById: uid(), type: kind, userCount: Object.keys(schedules).length, schedules };
  await col('snapshots').doc(id).set(doc);
  try {
    const all = await col('snapshots').orderBy('createdAtMs', 'desc').get();
    await Promise.all(all.docs.slice(SNAP_RETENTION).map(d => col('snapshots').doc(d.id).delete()));
  } catch (e) { console.warn('purge sauvegardes', e); }
  audit('snapshot_' + kind, `Sauvegarde ${kind === 'auto' ? 'automatique quotidienne' : 'manuelle'} (${doc.userCount} plannings)`);
  return doc;
}
export async function maybeAutoSnapshot() {
  try {
    const last = await col('snapshots').orderBy('createdAtMs', 'desc').limit(1).get();
    if (!last.empty && Date.now() - (last.docs[0].data().createdAtMs || 0) < 24 * 3600 * 1000) return;
    await createSnapshot('auto');
  } catch (e) { console.warn('sauvegarde auto', e); }
}
export async function listSnapshots() {
  const snap = await col('snapshots').orderBy('createdAtMs', 'desc').get();
  return snap.docs.map(d => d.data());
}
export async function restoreSnapshot(id) {
  const doc = await col('snapshots').doc(id).get();
  if (!doc.exists) throw new Error('Sauvegarde introuvable.');
  const schedules = doc.data().schedules || {};
  if (!Object.keys(schedules).length) throw new Error('Sauvegarde vide.');
  await createSnapshot('manual');                 // filet de sécurité avant restauration
  let n = 0;
  for (const username of Object.keys(schedules)) { await col('schedules').doc(username).set(schedules[username] || {}); n++; }
  await loadAllSchedules(true);
  audit('snapshot_restore', `Restauration de la sauvegarde ${id} — ${n} plannings`);
  return n;
}
export const deleteSnapshot = id => col('snapshots').doc(id).delete();

/* ═══ Zone dangereuse ═══ */
export async function resetAllHours() {
  await createSnapshot('manual');
  for (const u of team()) {
    const days = {};
    C.rangeKeys(S.period.startKey, S.period.endKey).forEach(k => { days[k] = C.emptyDay(k, u, S.period); });
    await replaceSchedule(u.username, days);
  }
  audit('reset_hours', 'Remise à zéro des heures de tous les collaborateurs');
}
export async function wipeEverything() {
  for (const name of ['users', 'schedules', 'absenceRequests', 'vanRequests', 'announcements', 'auditLog']) {
    const snap = await col(name).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = db.batch();
      snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
  }
  for (const id of ['holidays', 'openSundays', 'lockedMonths', 'period', 'managerAbsences', 'store']) {
    try { await col('settings').doc(id).delete(); } catch (e) { /* absent */ }
  }
  await ensureAdminAccount();
}

/* ═══ Indicateurs transverses ═══ */
export const pendingRequests = () => S.requests.filter(r => r.status === 'pending' || r.status === 'cancel_pending');
export const pendingVan = () => S.van.filter(r => r.status === 'pending');
export function teamAlerts() {
  const out = [];
  for (const u of team()) {
    const { st, alerts } = C.buildAlerts(u, daysOf(u.username), S.period, C.todayKey(), cpOpts());
    alerts.forEach(a => out.push({ ...a, user: u, st }));
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
// Effectif minimum attendu un jour donné (0 = pas de contrôle : dimanche non ouvert, férié fermé)
export function minStaff(k) {
  const d = C.dow(k);
  if (S.holidays[k] && !S.holidays[k].open) return 0;
  if (d === 0) return S.openSundays[k] ? (S.store.minStaff.dimanche || S.store.minStaff.samedi || 0) : 0;
  return S.store.minStaff[C.DAYS[d]] || 0;
}
export { isDemo };
