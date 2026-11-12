/* ═══════════════════════════════════════════════════════════════
   MOTEUR MÉTIER — fonctions pures (aucun accès DOM / réseau)
   Dates, période d'annualisation, compteurs, application des
   absences au planning, alertes. Testé par tests/core.test.mjs.
   ═══════════════════════════════════════════════════════════════ */

export const DAYS       = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
export const DAYS_LABEL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
export const DAYS_SHORT = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
export const DAYS_MIN   = ['D','L','M','M','J','V','S'];
export const WEEK_ORDER = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
export const MONTHS_FR  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
export const MONTHS_SHORT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

/* ─── Dates ─── */
export const pad = n => String(n).padStart(2, '0');
export const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = k => new Date(String(k).slice(0, 10) + 'T12:00:00');
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return key(d); };
export const dow = k => parseKey(k).getDay();
export const disp = k => k ? String(k).slice(0, 10).split('-').reverse().join('/') : '';
export const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
// « lundi 12 novembre »
export const longDate = (k, withYear = false) => {
  const d = parseKey(k);
  return `${DAYS[d.getDay()]} ${d.getDate() === 1 ? '1er' : d.getDate()} ${MONTHS_FR[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`;
};
export const shortDate = k => { const d = parseKey(k); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; };

// La date du jour peut être figée (tests, mode démo) via globalThis.__TODAY = 'YYYY-MM-DD'
export const todayKey = () => globalThis.__TODAY || key(new Date());

export const daysInclusive = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000) + 1;

export function isoWeek(k) {
  const s = parseKey(k);
  const d = new Date(Date.UTC(s.getFullYear(), s.getMonth(), s.getDate()));
  const n = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - n);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - y0) / 86400000) + 1) / 7);
}
// Lundi de la semaine contenant k
export const mondayOf = k => addDays(k, -((dow(k) + 6) % 7));

export function rangeKeys(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

// Nombre : 2 décimales max, format français (1 607 · 7,5)
export const num = n => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/[  ]/g, ' ');
};
export const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

/* ─── Période d'annualisation ─── */
export function buildPeriod(cfg = {}) {
  const sm = Number.isInteger(cfg.startMonth) ? cfg.startMonth : 5;
  const sy = cfg.startYear || 2026;
  const months = [];
  for (let i = 0; i < 12; i++) {
    const m = (sm + i) % 12, y = sy + Math.floor((sm + i) / 12);
    const n = new Date(y, m + 1, 0).getDate();
    months.push({
      idx: i, year: y, month: m, days: n,
      name: cap(MONTHS_FR[m]), short: cap(MONTHS_SHORT[m]),
      startKey: `${y}-${pad(m + 1)}-01`, endKey: `${y}-${pad(m + 1)}-${pad(n)}`
    });
  }
  const startKey = months[0].startKey, endKey = months[11].endKey;
  return {
    months, startKey, endKey,
    hoursTarget: cfg.hoursTarget || 1607,
    label: months[0].year === months[11].year ? String(sy) : `${months[0].year}–${months[11].year}`,
    longLabel: `${months[0].name} ${months[0].year} → ${months[11].name} ${months[11].year}`,
    totalDays: daysInclusive(startKey, endKey)
  };
}
export const inPeriod = (period, k) => k >= period.startKey && k <= period.endKey;
export const monthIndexOf = (period, k) => period.months.findIndex(m => k >= m.startKey && k <= m.endKey);
// Mois de la période contenant aujourd'hui (borné à la période)
export function currentMonthIndex(period, today = todayKey()) {
  if (today < period.startKey) return 0;
  if (today > period.endKey) return 11;
  return Math.max(0, monthIndexOf(period, today));
}

/* ─── Types d'absence ───
   worked : le type compte comme travail effectif (heures comptées)
   unit   : la demande se saisit en jours ('j') ou en heures ('h')        */
export const TYPES = {
  'CP':                 { label: 'Congés payés',        short: 'CP',  cls: 'cp',  icon: 'sun',   unit: 'j', worked: false, hint: 'Jours ouvrables posés (lundi → samedi, hors fériés fermés)' },
  'CP Ancienneté':      { label: 'CP ancienneté',       short: 'ANC', cls: 'anc', icon: 'star',  unit: 'j', worked: true,  hint: 'Jours supplémentaires liés à votre ancienneté' },
  'Récupération':       { label: 'Récupération',        short: 'RÉC', cls: 'rec', icon: 'clock', unit: 'h', worked: false, hint: 'Heures de récupération à déduire du planning' },
  'Événement Familial': { label: 'Événement familial',  short: 'FAM', cls: 'fam', icon: 'heart', unit: 'h', worked: false, hint: 'Mariage, naissance, décès…' },
  'Maladie':            { label: 'Maladie',             short: 'MAL', cls: 'mal', icon: 'pulse', unit: 'j', worked: true,  hint: 'Nombre de jours d’arrêt' },
  'Formation':          { label: 'Formation',           short: 'FOR', cls: 'for', icon: 'book',  unit: 'h', worked: true,  hint: 'Formation interne ou externe' },
  'Autre':              { label: 'Autre absence',       short: 'ABS', cls: 'aut', icon: 'dots',  unit: 'h', worked: false, hint: 'Autre motif — précisez en commentaire' }
};
export const TYPE_NAMES = Object.keys(TYPES);
export const isAbsType = t => !!TYPES[t];
export const isByDay = t => TYPES[t]?.unit === 'j';
// Une entrée compte dans les heures travaillées sauf CP / Récup / Évén. familial / Autre
export const isWorked = e => !e || !TYPES[e.type] || TYPES[e.type].worked;
export const qtyLabel = (type, q) => isByDay(type) ? `${num(q)} jour${q > 1 ? 's' : ''}` : `${num(q)} h`;

export const STATUS = {
  pending:        { label: 'En attente',          cls: 'warn' },
  cancel_pending: { label: 'Annulation demandée', cls: 'danger' },
  approved:       { label: 'Approuvée',           cls: 'ok' },
  waiting:        { label: 'En cours',            cls: 'info' },
  rejected:       { label: 'Refusée',             cls: 'danger' },
  cancelled:      { label: 'Annulée',             cls: 'muted' },
  archived:       { label: 'Archivée',            cls: 'muted' }
};
export const statusLabel = s => STATUS[s]?.label || s;

/* ─── Contrat, date d'entrée, objectif ─── */
// Date d'entrée contraignante pour la période ('' si présent depuis le début)
export function entryKey(user, period) {
  const s = String(user?.dateEntree || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s > period.startKey ? s : '';
}
export const contractTarget = (u, period) =>
  u?.isCadre ? (u?.daysTarget || 218) : (u?.hoursTarget || period.hoursTarget);
export function prorataRatio(ek, period) {
  if (!ek) return 1;
  if (ek > period.endKey) return 0;
  return daysInclusive(ek, period.endKey) / period.totalDays;
}
// Objectif réellement suivi : proratisé si entrée en cours de période
export function effectiveTarget(u, period) {
  const full = contractTarget(u, period);
  const ratio = prorataRatio(entryKey(u, period), period);
  if (ratio >= 1) return full;
  return u?.isCadre ? Math.round(full * ratio * 2) / 2 : Math.round(full * ratio);
}
export const defaultTP = () => ({ lundi: 7, mardi: 7, mercredi: 7, jeudi: 7, vendredi: 7, samedi: 0, dimanche: 0 });
export const tpOf = u => ({ ...defaultTP(), ...(u?.typePlanning || {}) });
export const tpWeekTotal = tp => WEEK_ORDER.reduce((s, d) => s + (parseFloat(tp?.[d]) || 0), 0);

/* ─── Lecture d'une journée ─── */
export const hoursOf = e => parseFloat(e?.hours) || 0;
// 'abs' (absence posée), 'work' (heures > 0), 'off' (repos)
export function dayState(e) {
  if (e && TYPES[e.type]) return 'abs';
  return hoursOf(e) > 0 ? 'work' : 'off';
}

/* ─── Verrouillage ─── */
export function isDateLocked(locks, period, k) {
  const info = locks?.[monthIndexOf(period, k)];
  if (!info) return false;
  if (typeof info === 'boolean') return info;
  return !!(info.from && info.to && k >= info.from && k <= info.to);
}
export function isMonthLocked(locks, idx) {
  const info = locks?.[idx];
  if (!info) return false;
  return typeof info === 'boolean' ? info : !!(info.from && info.to);
}
// Raison pour laquelle un collaborateur ne peut pas saisir ce jour ('' = modifiable)
export function lockReason(k, e, ctx) {
  const { period, locks, holidays, user } = ctx;
  if (!inPeriod(period, k)) return 'Hors période';
  const ek = entryKey(user, period);
  if (ek && k < ek) return 'Avant l’entrée dans l’entreprise';
  if (e?.absenceId || TYPES[e?.type]) return 'Absence posée — passez par une demande d’annulation';
  const h = holidays?.[k];
  if ((h && !h.open) || e?.holidayClosed) return 'Jour férié — magasin fermé';
  if (isDateLocked(locks, period, k)) return 'Période verrouillée par la direction';
  return '';
}

/* ─── Jours ouvrables d'une demande ─── */
const closedHoliday = (holidays, k) => !!(holidays?.[k] && !holidays[k].open);
// Lundi → samedi, hors jours fériés fermés
export function workingDays(from, to, holidays = {}) {
  if (!from || !to || from > to) return [];
  return rangeKeys(from, to).filter(k => dow(k) !== 0 && !closedHoliday(holidays, k));
}
/* Jours décomptés pour une absence saisie en jours (CP, CP ancienneté).
   cpMode 'ouvrables' (défaut, règle historique) : lundi → samedi.
   cpMode 'planning' : uniquement les jours habituellement travaillés du collaborateur. */
export function leaveDays(from, to, holidays, user, cpMode = 'ouvrables') {
  const wd = workingDays(from, to, holidays);
  if (cpMode !== 'planning') return wd;
  const tp = tpOf(user);
  const own = wd.filter(k => (parseFloat(tp[DAYS[dow(k)]]) || 0) > 0);
  return own.length ? own : wd;
}
// Heures de travail « consommées » en moyenne par un jour de CP restant à poser
export function hoursPerLeaveDay(user, cpMode = 'ouvrables') {
  const tp = tpOf(user), week = tpWeekTotal(tp);
  const worked = WEEK_ORDER.filter(d => (parseFloat(tp[d]) || 0) > 0).length;
  return cpMode === 'planning' ? (worked ? week / worked : 0) : week / 6;
}

/* ─── Compteurs d'un collaborateur ─── */
export function periodProgress(period, ek = '', today = todayKey()) {
  const from = ek || period.startKey;
  if (today < from) return 0;
  if (today >= period.endKey) return 1;
  return daysInclusive(from, today) / daysInclusive(from, period.endKey);
}

export function computeStats(user, days, period, today = todayKey(), opts = {}) {
  const cadre = !!user?.isCadre;
  const conv = v => cadre ? v / 2 : v;           // cadre : 2 demi-journées = 1 jour
  let total = 0, toDate = 0;
  const months = period.months.map(() => 0);
  const byType = {};
  TYPE_NAMES.forEach(t => { byType[t] = { days: 0, hours: 0 }; });
  for (const k in (days || {})) {
    if (k < period.startKey || k > period.endKey) continue;
    const e = days[k]; if (!e) continue;
    const h = hoursOf(e);
    if (TYPES[e.type]) { byType[e.type].days++; byType[e.type].hours += h; }
    // heures déduites sur une journée partiellement travaillée (récup, évén. familial…)
    if (e.recupDeducted && e.absType && TYPES[e.absType]) byType[e.absType].hours += parseFloat(e.recupDeducted) || 0;
    if (isWorked(e)) {
      total += h;
      const mi = monthIndexOf(period, k);
      if (mi >= 0) months[mi] += h;
      if (k <= today) toDate += h;
    }
  }
  const target = effectiveTarget(user, period);
  const ek = entryKey(user, period);
  const progress = periodProgress(period, ek, today);
  const done = conv(total), doneToDate = conv(toDate);
  const expectedToDate = r2(target * progress);
  const cpAlloc = user?.cpDays ?? 25, ancAlloc = user?.cpAnciennete || 0;
  // CP restant à poser : ils feront baisser le total planifié le jour où ils seront posés
  const cpReserve = r2(conv(Math.max(0, cpAlloc - byType['CP'].days) * hoursPerLeaveDay(user, opts.cpMode)));
  return {
    cadre, unit: cadre ? 'j' : 'h', unitLong: cadre ? 'jours' : 'heures',
    target, contract: contractTarget(user, period), prorated: !!ek, entry: ek,
    total: r2(done),                        // planifié sur toute la période (réalisé + à venir)
    doneToDate: r2(doneToDate),             // réalisé jusqu'à aujourd'hui inclus
    ahead: r2(done - doneToDate),           // planifié à venir
    expectedToDate, gapToDate: r2(doneToDate - expectedToDate),
    gap: r2(done - target),                 // > 0 : récupération prévisionnelle ; < 0 : reste à planifier
    cpReserve, gapNet: r2(done - target - cpReserve),   // écart une fois les CP restants posés
    remaining: r2(Math.max(0, target - done)),
    recup: r2(Math.max(0, done - target)),
    pct: target > 0 ? Math.round(done / target * 100) : 0,
    pctToDate: target > 0 ? Math.round(doneToDate / target * 100) : 0,
    progressPct: Math.round(progress * 100),
    months: months.map(conv).map(r2),
    byType,
    cp:  { taken: byType['CP'].days, alloc: cpAlloc, left: Math.max(0, cpAlloc - byType['CP'].days) },
    anc: { taken: byType['CP Ancienneté'].days, alloc: ancAlloc, left: Math.max(0, ancAlloc - byType['CP Ancienneté'].days) }
  };
}

// Total travaillé sur un intervalle (heures brutes, non converties cadre)
export function sumWorked(days, from, to) {
  let total = 0, n = 0;
  for (const k in (days || {})) {
    if (k < from || k > to) continue;
    const e = days[k];
    if (!isWorked(e)) continue;
    const h = hoursOf(e);
    if (h > 0) { total += h; n++; }
  }
  return { total: r2(total), days: n };
}
export function absencesIn(days, from, to) {
  const res = {};
  for (const k in (days || {})) {
    if (k < from || k > to) continue;
    const e = days[k];
    if (!e || !TYPES[e.type]) continue;
    (res[e.type] = res[e.type] || { days: 0, hours: 0 });
    res[e.type].days++; res[e.type].hours += hoursOf(e);
  }
  return res;
}

/* ─── Planning type ─── */
export function emptyDay(k, user, period) {
  const ek = entryKey(user, period);
  return ek && k < ek ? { hours: 0, type: 'repos', note: '', beforeEntry: true } : { hours: 0, type: 'normal', note: '' };
}
/* Applique le planning type hebdomadaire.
   opts.from / opts.to : bornes (par défaut toute la période)
   opts.keepModified   : ne pas écraser les jours modifiés à la main avec commentaire
   Jamais écrasés : absences, fériés fermés. Avant l'entrée : 0 h. */
export function applyTypePlanning(days, user, period, opts = {}) {
  const tp = opts.tp || tpOf(user);
  const from = opts.from && opts.from > period.startKey ? opts.from : period.startKey;
  const to = opts.to && opts.to < period.endKey ? opts.to : period.endKey;
  const ek = entryKey(user, period);
  const out = { ...(days || {}) };
  // La date d'entrée s'applique toujours à toute la période
  if (ek) for (const k of rangeKeys(period.startKey, addDays(ek, -1) > period.endKey ? period.endKey : addDays(ek, -1))) {
    if (!out[k]?.absenceId) out[k] = { hours: 0, type: 'repos', note: out[k]?.note || '', beforeEntry: true };
  }
  for (const k of rangeKeys(from, to)) {
    const ex = out[k];
    if (ek && k < ek) continue;
    if (ex && (ex.absenceId || TYPES[ex.type])) continue;
    if (ex?.holidayClosed || closedHoliday(opts.holidays, k)) {
      if (!ex?.holidayClosed && closedHoliday(opts.holidays, k)) out[k] = { hours: 0, type: 'normal', note: `${opts.holidays[k].name} — fermé`, holidayClosed: true };
      continue;
    }
    if (opts.keepModified && ex?.modifiedByUser) continue;
    const h = parseFloat(tp[DAYS[dow(k)]]) || 0;
    out[k] = { hours: h, type: h === 0 ? 'repos' : 'normal', note: ex?.modifiedByUser ? '' : (ex?.note || '') };
  }
  return out;
}

/* ─── Application d'une absence approuvée au planning ───
   Renvoie un NOUVEL objet days. Chaque jour touché mémorise son état
   d'origine dans `prev` pour pouvoir être restauré à l'identique.     */
const snapshotOf = e => (e && !e.absenceId ? { hours: hoursOf(e), type: e.type || 'normal', note: e.note || '', ...(e.modifiedByUser ? { modifiedByUser: true, modifComment: e.modifComment || '' } : {}) } : null);

export function applyAbsence(days, req, user, holidays = {}, opts = {}) {
  const out = { ...(days || {}) };
  const tp = tpOf(user);
  const cadre = !!user?.isCadre;
  const from = req.date, to = req.dateEnd || req.date;
  let wd = req.type === 'CP' || req.type === 'CP Ancienneté' ? leaveDays(from, to, holidays, user, opts.cpMode) : workingDays(from, to, holidays);
  if (!wd.length) wd = [from];                    // week-end / férié seul : on pose quand même sur le 1er jour
  // heures prévues ce jour-là : saisie existante (hors absence) sinon planning type
  const planned = k => {
    const ex = out[k];
    if (ex && !ex.absenceId && !TYPES[ex.type] && ex.hours !== undefined) return hoursOf(ex);
    return parseFloat(tp[DAYS[dow(k)]]) || 0;
  };
  const base = k => {
    const ex = out[k];
    const prev = ex?.absenceId ? (ex.prev || null) : snapshotOf(ex);
    return { absenceId: req.id, absType: req.type, ...(prev ? { prev } : {}) };
  };
  const dayValue = cadre ? 2 : 7;                 // 1 journée = 7 h (ou 2 demi-journées pour un cadre)
  const type = req.type;

  if (type === 'CP' || type === 'CP Ancienneté') {
    wd.forEach(k => { out[k] = { hours: dayValue, type, note: `${type} approuvé`, ...base(k) }; });
  } else if (type === 'Maladie') {
    // maintenu : valorisé aux heures qui étaient prévues (0 h sur un jour de repos)
    wd.forEach(k => { out[k] = { hours: planned(k), type, note: 'Maladie', ...base(k) }; });
  } else if (type === 'Formation') {
    // travail effectif : la journée garde ses heures (ou reçoit sa part si jour de repos)
    const share = r2((parseFloat(req.hours) || 0) / wd.length);
    wd.forEach(k => { const p = planned(k); out[k] = { hours: p > 0 ? p : share, type, note: 'Formation', ...base(k) }; });
  } else {
    // Récupération / Événement familial / Autre : heures déduites des heures prévues
    const plan = wd.map(k => ({ k, p: planned(k), t: 0 }));
    const active = plan.filter(x => x.p > 0);
    let left = parseFloat(req.hours) || 0;
    if (active.length) {
      const share = left / active.length;
      active.forEach(x => { x.t = Math.min(x.p, share); left -= x.t; });
      for (const x of active) {                    // report du reliquat sur les jours qui ont encore de la marge
        if (left <= 0.001) break;
        const add = Math.min(x.p - x.t, left); x.t += add; left -= add;
      }
    }
    plan.forEach(x => {
      const taken = r2(x.t), rest = r2(Math.max(0, x.p - x.t));
      out[x.k] = {
        hours: rest, type: rest > 0 ? 'normal' : type,
        note: rest > 0 ? `${num(taken)} h de ${type} — ${num(rest)} h travaillées` : `${type} approuvé`,
        recupDeducted: taken, ...base(x.k)
      };
    });
  }
  return out;
}

// Retire une absence du planning et restaure l'état d'origine
export function removeAbsence(days, req, user, holidays = {}, period = null) {
  const out = { ...(days || {}) };
  const tp = tpOf(user);
  const ek = period ? entryKey(user, period) : '';
  let changed = false;
  for (const k of rangeKeys(req.date, req.dateEnd || req.date)) {
    const e = out[k];
    if (!e) continue;
    const mine = e.absenceId === req.id || (!e.absenceId && e.type === req.type);
    if (!mine) continue;
    changed = true;
    if (ek && k < ek) { out[k] = { hours: 0, type: 'repos', note: '', beforeEntry: true }; continue; }
    if (closedHoliday(holidays, k)) { out[k] = { hours: 0, type: 'normal', note: `${holidays[k].name} — fermé`, holidayClosed: true }; continue; }
    if (e.prev) { out[k] = { ...e.prev }; continue; }
    const h = parseFloat(tp[DAYS[dow(k)]]) || 0;   // absence posée par l'ancienne version : retour au planning type
    out[k] = { hours: h, type: h > 0 ? 'normal' : 'repos', note: '' };
  }
  return changed ? out : null;
}

/* ─── Effectif présent ─── */
export function presentCount(users, schedules, k) {
  let n = 0;
  for (const u of users) {
    const e = schedules[u.username]?.[k];
    if (e && hoursOf(e) > 0 && (!TYPES[e.type] || e.type === 'Formation')) n++;
  }
  return n;
}
export function absentList(users, schedules, k) {
  return users.filter(u => TYPES[schedules[u.username]?.[k]?.type])
    .map(u => ({ user: u, type: schedules[u.username][k].type }));
}

/* ─── Contrôles durée du travail (non-cadres) ───
   Analyse une fenêtre de dates et signale : journée > 10 h, semaine > 48 h,
   plus de 6 jours travaillés consécutifs, moyenne > 44 h sur 12 semaines.  */
export function legalChecks(days, from, to) {
  const issues = [];
  const start = mondayOf(from);
  let streak = 0, streakStart = '';
  const weeks = [];
  for (let k = start; k <= to; k = addDays(k, 1)) {
    const e = days?.[k];
    const h = isWorked(e) && !TYPES[e?.type] ? hoursOf(e) : 0;
    if (dow(k) === 1) weeks.push({ monday: k, total: 0 });
    if (weeks.length) weeks[weeks.length - 1].total += h;
    if (h > 10 && k >= from) issues.push({ code: 'day', level: 'warning', date: k, title: 'Journée de plus de 10 h', detail: `${longDate(k)} : ${num(h)} h planifiées (maximum légal : 10 h)` });
    if (h > 0) { if (!streak) streakStart = k; streak++; if (streak === 7) issues.push({ code: 'rest', level: 'critical', date: k, title: 'Repos hebdomadaire non respecté', detail: `7 jours travaillés d’affilée à partir du ${disp(streakStart)}` }); }
    else streak = 0;
  }
  weeks.forEach(w => {
    if (w.total > 48) issues.push({ code: 'week', level: 'critical', date: w.monday, title: 'Semaine de plus de 48 h', detail: `Semaine ${isoWeek(w.monday)} (du ${disp(w.monday)}) : ${num(w.total)} h planifiées` });
  });
  for (let i = 0; i + 12 <= weeks.length; i++) {
    const avg = weeks.slice(i, i + 12).reduce((s, w) => s + w.total, 0) / 12;
    if (avg > 44) { issues.push({ code: 'avg', level: 'warning', date: weeks[i].monday, title: 'Moyenne supérieure à 44 h sur 12 semaines', detail: `${num(avg)} h en moyenne à partir de la semaine ${isoWeek(weeks[i].monday)}` }); break; }
  }
  return issues;
}

/* ─── Alertes d'annualisation ─── */
export function buildAlerts(user, days, period, today = todayKey(), opts = {}) {
  const st = computeStats(user, days, period, today, opts);
  const out = [];
  const u = st.unit;
  const daysToEnd = daysInclusive(today, period.endKey) - 1;
  const ending = daysToEnd > 0 && daysToEnd <= 90;
  const big = st.target * 0.05;

  if (st.progressPct >= 10 && st.total === 0) {
    out.push({ level: 'critical', icon: 'ban', title: 'Aucune heure planifiée', detail: `Période entamée à ${st.progressPct} % et aucun planning saisi` });
    return { st, alerts: out };
  }
  // l'écart est jugé une fois les CP restants posés (sinon tout le monde paraît « en avance »)
  const net = st.gapNet, cpNote = st.cp.left > 0 ? ` (après pose des ${st.cp.left} j de CP restants)` : '';
  if (net < -14) out.push({
    level: net <= -big ? 'critical' : 'warning', icon: 'trendDown',
    title: 'Planning annuel sous l’objectif',
    detail: `Il manquera ${num(-net)} ${u} pour atteindre ${num(st.target)} ${u}${cpNote}`
  });
  if (net > 14) out.push({
    level: net >= big ? 'critical' : 'warning', icon: 'trendUp',
    title: 'Dépassement prévisionnel de l’objectif',
    detail: `+${num(net)} ${u} au-delà de ${num(st.target)} ${u}${cpNote} — récupération à planifier`
  });
  else if (net > 0) out.push({ level: 'info', icon: 'clock', title: 'Récupération prévisionnelle', detail: `+${num(net)} ${u} au-dessus de l’objectif${cpNote}` });
  const lim = st.target * 0.07;
  if (st.expectedToDate > 0 && st.gapToDate <= -lim) out.push({
    level: 'warning', icon: 'hourglass', title: 'Retard sur le réalisé à date',
    detail: `${num(st.doneToDate)} ${u} réalisées pour ${num(st.expectedToDate)} ${u} attendues à ce stade (${num(st.gapToDate)} ${u})`
  });
  if (st.cp.taken > st.cp.alloc) out.push({ level: 'critical', icon: 'sun', title: 'Solde de CP dépassé', detail: `${st.cp.taken} jours posés pour ${st.cp.alloc} jours acquis` });
  if (ending && st.cp.left > 0) {
    const pct = st.cp.alloc ? Math.round(st.cp.taken / st.cp.alloc * 100) : 100;
    if (pct < 70 || daysToEnd <= 30) out.push({
      level: daysToEnd <= 30 ? 'critical' : 'warning', icon: 'sun', title: 'CP non soldés',
      detail: `${st.cp.left} jour${st.cp.left > 1 ? 's' : ''} à poser — ${daysToEnd} jours avant la fin de période`
    });
  }
  if (ending && st.anc.left > 0) out.push({ level: 'warning', icon: 'star', title: 'CP ancienneté à solder', detail: `${st.anc.taken} / ${st.anc.alloc} jours posés` });
  if (!st.cadre) {
    const from = today > period.startKey ? addDays(today, -28) : period.startKey;
    const to = addDays(today, 56) < period.endKey ? addDays(today, 56) : period.endKey;
    if (from <= to) legalChecks(days, from < period.startKey ? period.startKey : from, to)
      .forEach(i => out.push({ level: i.level, icon: 'scale', title: i.title, detail: i.detail, date: i.date }));
  }
  return { st, alerts: out };
}

/* ─── Jours fériés français ─── */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
export function frenchHolidays(year) {
  const e = easter(year);
  return {
    [`${year}-01-01`]: 'Jour de l’An', [addDays(e, 1)]: 'Lundi de Pâques',
    [`${year}-05-01`]: 'Fête du Travail', [`${year}-05-08`]: 'Victoire 1945',
    [addDays(e, 39)]: 'Ascension', [addDays(e, 50)]: 'Lundi de Pentecôte',
    [`${year}-07-14`]: 'Fête nationale', [`${year}-08-15`]: 'Assomption',
    [`${year}-11-01`]: 'Toussaint', [`${year}-11-11`]: 'Armistice 1918', [`${year}-12-25`]: 'Noël'
  };
}
export function holidaysForPeriod(period) {
  const out = {};
  const y0 = period.months[0].year, y1 = period.months[11].year;
  for (let y = y0; y <= y1; y++) {
    const h = frenchHolidays(y);
    Object.keys(h).filter(k => inPeriod(period, k)).forEach(k => { out[k] = { name: h[k], open: false }; });
  }
  return out;
}

/* ─── Emprunt camionnette ─── */
export function vanNeedsParking(startStr, endStr) {
  if (!startStr || !endStr) return false;
  const s = new Date(startStr), e = new Date(endStr);
  if (isNaN(s) || isNaN(e) || e <= s) return false;
  if (s.toDateString() !== e.toDateString()) return true;      // nuitée
  return s.getDay() === 6 && e.getHours() >= 18;               // samedi soir
}
export const fmtDateTime = s => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? String(s) : d.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/* ─── Demandes ─── */
// Une absence reste annulable si approuvée / en cours, ou archivée mais pas encore passée
export function canCancel(r, today = todayKey()) {
  if (!r) return false;
  if (r.status === 'approved' || r.status === 'waiting') return true;
  if (r.status !== 'archived') return false;
  const prev = r.previousStatus || '';
  if (prev !== 'approved' && prev !== 'waiting') return false;
  return (r.dateEnd || r.date || '') >= today;
}
export const overlaps = (a1, a2, b1, b2) => a1 <= b2 && a2 >= b1;

/* ─── Export iCalendar du planning ─── */
export function buildICS(user, days, period, storeName = 'Magasin') {
  const esc = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Suivi Annualisation//FR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Planning ${esc(user.name)}`];
  for (const k of rangeKeys(period.startKey, period.endKey)) {
    const e = days?.[k]; if (!e) continue;
    const h = hoursOf(e), abs = TYPES[e.type];
    if (!abs && h <= 0) continue;
    const title = abs ? abs.label : `Travail — ${num(h)} ${user.isCadre ? 'demi-j.' : 'h'}`;
    lines.push('BEGIN:VEVENT', `UID:${k}-${user.username}@suivi-annualisation`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${k.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(k, 1).replace(/-/g, '')}`,
      `SUMMARY:${esc(title)}`, `LOCATION:${esc(storeName)}`, ...(e.note ? [`DESCRIPTION:${esc(e.note)}`] : []),
      'TRANSP:' + (abs ? 'TRANSPARENT' : 'OPAQUE'), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/* ─── Mot de passe (SHA-256 salé, optionnel) ─── */
export async function hashPassword(username, password) {
  const data = new TextEncoder().encode(`suivi-annualisation|${username}|${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function checkPassword(user, password) {
  if (user?.passwordHash) return user.passwordHash === await hashPassword(user.username || user.id, password);
  return user?.password !== undefined && user.password === password;
}
