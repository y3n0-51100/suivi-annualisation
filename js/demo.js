/* ═══════════════════════════════════════════════════════════════
   MODE DÉMO — base en mémoire compatible avec l'API Firestore
   utilisée par l'application (collection / doc / where / orderBy /
   limit / onSnapshot / batch). Données 100 % fictives.
   Ouvrir l'application avec ?demo=1 (ou ?demo=reset pour repartir
   d'un jeu de données neuf). Rien n'est envoyé au serveur.
   ═══════════════════════════════════════════════════════════════ */
import * as C from './core.js';

const SS_KEY = 'annualisation-demo-db-v3';
const TS = '__ts__', DEL = '__del__';
export const F = { ts: () => ({ [TS]: true }), del: () => ({ [DEL]: true }), path: (...seg) => ({ __path: seg }) };

const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const now = () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 });
const resolve = v => {
  if (v && typeof v === 'object') {
    if (v[TS]) return now();
    if (Array.isArray(v)) return v.map(resolve);
    const o = {};
    for (const k in v) { if (!(v[k] && v[k][DEL])) o[k] = resolve(v[k]); }
    return o;
  }
  return v;
};
const getPath = (o, path) => path.split('.').reduce((a, p) => (a == null ? undefined : a[p]), o);

export function createDemoDb(reset = false) {
  let data = null;
  if (!reset) { try { data = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null'); } catch (e) { data = null; } }
  if (!data) data = seed();
  const listeners = [];
  const persist = () => { try { sessionStorage.setItem(SS_KEY, JSON.stringify(data)); } catch (e) { /* quota : la démo reste en mémoire */ } };
  const notify = name => { persist(); listeners.filter(l => l.name === name).forEach(l => queueMicrotask(() => l.fire())); };
  const col = name => (data[name] = data[name] || {});
  const snapDoc = (name, id) => {
    const raw = col(name)[id];
    return { id, exists: raw !== undefined, data: () => clone(raw), ref: docRef(name, id) };
  };

  function docRef(name, id) {
    return {
      id,
      get: async () => snapDoc(name, id),
      set: async (value, opts) => { col(name)[id] = opts?.merge ? { ...(col(name)[id] || {}), ...resolve(value) } : resolve(value); notify(name); },
      update: async (patch, value) => {
        const cur = col(name)[id];
        if (cur === undefined) throw new Error(`No document to update: ${name}/${id}`);
        const entries = patch && patch.__path ? [[patch.__path, value]] : Object.keys(patch).map(p => [p.split('.'), patch[p]]);
        for (const [segments, v0] of entries) {
          const parts = [...segments];
          let o = cur;
          while (parts.length > 1) { const p = parts.shift(); if (typeof o[p] !== 'object' || o[p] === null) o[p] = {}; o = o[p]; }
          if (v0 && v0[DEL]) delete o[parts[0]]; else o[parts[0]] = resolve(v0);
        }
        notify(name);
      },
      delete: async () => { delete col(name)[id]; notify(name); }
    };
  }

  function query(name, filters = [], order = null, max = 0) {
    const run = () => {
      let ids = Object.keys(col(name));
      for (const [f, op, v] of filters) {
        ids = ids.filter(id => {
          const x = getPath(col(name)[id], f);
          return op === '==' ? x === v : op === 'in' ? v.includes(x) : true;
        });
      }
      if (order) ids.sort((a, b) => {
        const x = getPath(col(name)[a], order[0]), y = getPath(col(name)[b], order[0]);
        const xv = x?.seconds ?? x ?? 0, yv = y?.seconds ?? y ?? 0;
        return (xv < yv ? -1 : xv > yv ? 1 : 0) * (order[1] === 'desc' ? -1 : 1);
      });
      if (max) ids = ids.slice(0, max);
      const docs = ids.map(id => snapDoc(name, id));
      return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn) };
    };
    return {
      where: (f, op, v) => query(name, [...filters, [f, op, v]], order, max),
      orderBy: (f, dir = 'asc') => query(name, filters, [f, dir], max),
      limit: n => query(name, filters, order, n),
      get: async () => run(),
      onSnapshot: (cb) => {
        const l = { name, fire: () => cb(run()) };
        listeners.push(l); queueMicrotask(l.fire);
        return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
      },
      doc: id => docRef(name, id),
      add: async value => { const id = 'auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); col(name)[id] = resolve(value); notify(name); return docRef(name, id); }
    };
  }

  return {
    __demo: true,
    __dump: () => clone(data),
    collection: name => query(name),
    batch: () => {
      const ops = [];
      return {
        set: (ref, v) => ops.push(() => ref.set(v)), update: (ref, v) => ops.push(() => ref.update(v)),
        delete: ref => ops.push(() => ref.delete()),
        commit: async () => { for (const op of ops) await op(); }
      };
    }
  };
}

/* ─── Jeu de données fictif ─── */
function seed() {
  const today = C.todayKey();
  // période contenant aujourd'hui (juin → mai)
  const t = C.parseKey(today);
  const startYear = t.getMonth() >= 5 ? t.getFullYear() : t.getFullYear() - 1;
  const period = C.buildPeriod({ startMonth: 5, startYear, hoursTarget: 1607 });
  const ts = daysAgo => ({ seconds: Math.floor(Date.now() / 1000) - daysAgo * 86400, nanoseconds: 0 });
  const tp = (l, ma, me, j, v, s, d = 0) => ({ lundi: l, mardi: ma, mercredi: me, jeudi: j, vendredi: v, samedi: s, dimanche: d });

  const people = [
    ['camille.martin', 'Camille Martin',  'Conseillère de vente — Salon',  tp(7, 7, 0, 7, 7, 7), {}],
    ['lucas.bernard',  'Lucas Bernard',   'Conseiller de vente — Literie', tp(0, 7, 7, 7, 7, 7), { cpAnciennete: 2 }],
    ['sarah.petit',    'Sarah Petit',     'Hôtesse d’accueil',             tp(6, 0, 6, 0, 6, 6), { hoursTarget: 1102 }],
    ['thomas.leroy',   'Thomas Leroy',    'Magasinier — Dépôt',            tp(7, 7, 7, 7, 7, 0), { cpAnciennete: 3 }],
    ['ines.moreau',    'Inès Moreau',     'Conseillère de vente — Cuisine', tp(7, 0, 7, 7, 7, 7), {}],
    ['hugo.fontaine',  'Hugo Fontaine',   'Responsable de rayon',          tp(2, 2, 0, 2, 2, 2), { isCadre: true, daysTarget: 218, hoursTarget: 0 }],
    ['manon.girard',   'Manon Girard',    'Conseillère de vente — Déco',   tp(7, 7, 7, 0, 7, 7), { dateEntree: C.addDays(period.startKey, 105) }],
    ['julien.robert',  'Julien Robert',   'Chauffeur-livreur',             tp(7, 7, 7, 7, 7, 0), { cpAnciennete: 1 }],
    ['emma.dubois',    'Emma Dubois',     'Conseillère de vente — Électro', tp(0, 7, 7, 7, 7, 7), {}]
  ];
  const users = {
    admin: { id: 'admin', username: 'admin', name: 'Direction (démo)', role: 'admin', password: 'demo', email: 'direction@exemple.fr', typePlanning: C.defaultTP(), createdAt: ts(160) }
  };
  people.forEach(([username, name, poste, typePlanning, extra], i) => {
    users[username] = {
      id: username, username, name, role: 'employee', password: 'demo', email: `${username}@exemple.fr`,
      matricule: 'M17-' + String(101 + i).padStart(4, '0'), poste, hoursTarget: 1607, daysTarget: 0, isCadre: false,
      cpDays: 25, cpAnciennete: 0, dateEntree: '', typePlanning, createdAt: ts(160), ...extra
    };
  });

  const holidays = C.holidaysForPeriod(period);
  // un férié « ouvert » pour illustrer
  const nov11 = Object.keys(holidays).find(k => k.endsWith('-11-11')); if (nov11) holidays[nov11].open = true;
  const dec = period.months.find(m => m.month === 11);
  const openSundays = {};
  if (dec) C.rangeKeys(dec.startKey, dec.endKey).filter(k => C.dow(k) === 0 && +k.slice(8) >= 6 && +k.slice(8) <= 21)
    .forEach(k => { openSundays[k] = { note: 'Ouverture de Noël' }; });

  const schedules = {};
  Object.values(users).forEach(u => {
    let days = {};
    C.rangeKeys(period.startKey, period.endKey).forEach(k => { days[k] = C.emptyDay(k, u, period); });
    days = C.applyTypePlanning(days, u, period, { holidays });
    schedules[u.username] = { userId: u.username, days };
  });
  // dimanches ouverts : une partie de l'équipe travaille
  Object.keys(openSundays).forEach((k, i) => {
    ['camille.martin', 'lucas.bernard', 'ines.moreau', 'emma.dubois'].filter((_, j) => (i + j) % 2 === 0)
      .forEach(u => { schedules[u].days[k] = { hours: 7, type: 'normal', note: 'Dimanche ouvert' }; });
  });
  // quelques journées ajustées à la main (inventaire, renfort, départ anticipé)
  const tweak = (u, k, hours, comment) => {
    const e = schedules[u]?.days[k];
    if (!e || e.beforeEntry || e.holidayClosed || !C.inPeriod(period, k)) return;
    schedules[u].days[k] = { hours, type: hours > 0 ? 'normal' : 'repos', note: '🟠 ' + comment, modifiedByUser: true, modifComment: comment };
  };
  const nextDow = (from, d) => { let k = from; while (C.dow(k) !== d) k = C.addDays(k, 1); return k; };
  tweak('camille.martin', nextDow(C.addDays(today, -20), 6), 9, 'Renfort opération commerciale');
  tweak('thomas.leroy', nextDow(C.addDays(today, -12), 2), 9.5, 'Réception camion — inventaire');
  tweak('lucas.bernard', nextDow(C.addDays(today, -6), 4), 5, 'Départ anticipé — RDV médical');
  tweak('ines.moreau', nextDow(C.addDays(today, 3), 5), 8.5, 'Livraison cuisine exposition');
  tweak('emma.dubois', nextDow(C.addDays(today, -30), 6), 9, 'Black Friday — préparation');
  // une semaine très chargée pour illustrer les alertes de durée du travail
  const hot = nextDow(C.addDays(today, 8), 1);
  [0, 1, 2, 3, 4, 5].forEach(i => tweak('julien.robert', C.addDays(hot, i), i === 5 ? 7 : 9, 'Tournées de livraison de fin d’année'));

  const requests = {};
  let n = 0;
  const mk = (userId, type, date, dateEnd, hours, status, ageDays, extra = {}) => {
    if (!C.inPeriod(period, date) || !C.inPeriod(period, dateEnd)) return null;
    const u = users[userId];
    const id = `req_demo_${++n}`;
    const r = {
      id, userId, userName: u.name, userEmail: u.email, type, date, dateEnd, hours,
      qLabel: C.qtyLabel(type, hours), dateLabel: date === dateEnd ? C.disp(date) : `du ${C.disp(date)} au ${C.disp(dateEnd)}`,
      comment: '', status, createdAt: ts(ageDays), ...extra
    };
    requests[id] = r;
    const live = status === 'approved' || status === 'cancel_pending' || (status === 'archived' && extra.previousStatus === 'approved');
    if (live) schedules[userId].days = C.applyAbsence(schedules[userId].days, r, u, holidays);
    return r;
  };
  const wd = (a, b) => C.workingDays(a, b, holidays).length;
  const monday = k => C.mondayOf(k);
  // passées (archivées / approuvées)
  let a = monday(C.addDays(period.startKey, 42));
  mk('camille.martin', 'CP', a, C.addDays(a, 12), wd(a, C.addDays(a, 12)), 'archived', 120, { previousStatus: 'approved', processedAt: ts(118) });
  a = monday(C.addDays(period.startKey, 56));
  mk('thomas.leroy', 'CP', a, C.addDays(a, 19), wd(a, C.addDays(a, 19)), 'archived', 125, { previousStatus: 'approved', processedAt: ts(121) });
  a = monday(C.addDays(period.startKey, 70));
  mk('lucas.bernard', 'CP', a, C.addDays(a, 12), wd(a, C.addDays(a, 12)), 'archived', 110, { previousStatus: 'approved', processedAt: ts(108) });
  mk('ines.moreau', 'CP', C.addDays(a, 7), C.addDays(a, 19), wd(C.addDays(a, 7), C.addDays(a, 19)), 'archived', 104, { previousStatus: 'approved', processedAt: ts(100) });
  a = monday(C.addDays(today, -24));
  mk('sarah.petit', 'Maladie', a, C.addDays(a, 3), 4, 'approved', 26, { comment: 'Arrêt transmis au service paie', processedAt: ts(25) });
  mk('emma.dubois', 'Formation', C.addDays(a, 8), C.addDays(a, 9), 14, 'approved', 30, { comment: 'Formation produits électroménager', processedAt: ts(28) });
  mk('julien.robert', 'Récupération', C.addDays(today, -9), C.addDays(today, -9), 7, 'approved', 16, { processedAt: ts(14) });
  // en cours aujourd'hui / cette semaine
  mk('hugo.fontaine', 'CP', C.addDays(today, -1), C.addDays(today, 3), wd(C.addDays(today, -1), C.addDays(today, 3)), 'approved', 35, { processedAt: ts(33) });
  mk('manon.girard', 'Événement Familial', C.addDays(today, 1), C.addDays(today, 1), 7, 'approved', 6, { comment: 'Mariage', processedAt: ts(5) });
  // à venir
  a = monday(C.addDays(today, 40));
  mk('thomas.leroy', 'CP', a, C.addDays(a, 5), wd(a, C.addDays(a, 5)), 'cancel_pending', 20,
    { previousStatus: 'approved', cancelReason: 'Changement de dates de vacances scolaires', cancelRequestedAt: ts(1), processedAt: ts(18) });
  mk('emma.dubois', 'CP', C.addDays(a, 7), C.addDays(a, 12), wd(C.addDays(a, 7), C.addDays(a, 12)), 'approved', 15, { processedAt: ts(12) });
  // à traiter
  mk('camille.martin', 'CP', a, C.addDays(a, 5), wd(a, C.addDays(a, 5)), 'pending', 1, { comment: 'Vacances en famille' });
  mk('lucas.bernard', 'Récupération', C.addDays(today, 6), C.addDays(today, 6), 7, 'pending', 0);
  mk('ines.moreau', 'CP', C.addDays(a, 2), C.addDays(a, 5), wd(C.addDays(a, 2), C.addDays(a, 5)), 'pending', 2, { comment: 'Pont de fin d’année' });
  mk('sarah.petit', 'CP', monday(C.addDays(today, 75)), C.addDays(monday(C.addDays(today, 75)), 5), 6, 'waiting', 9, { processedAt: ts(7), managerComment: 'En attente du planning des inventaires' });
  mk('julien.robert', 'CP', monday(C.addDays(today, 12)), C.addDays(monday(C.addDays(today, 12)), 5), 6, 'rejected', 12, { processedAt: ts(10), managerComment: 'Période de fortes livraisons' });

  const day = (k, h, m) => `${k}T${C.pad(h)}:${C.pad(m)}`;
  const vanRequests = {
    van_demo_1: { id: 'van_demo_1', userId: 'julien.robert', userName: 'Julien Robert', userEmail: users['julien.robert'].email,
      dateStart: day(C.addDays(today, 9), 18, 30), dateEnd: day(C.addDays(today, 11), 9, 0), parking: 'Domicile — cour fermée', comment: 'Déménagement',
      dateLabel: '', status: 'pending', createdAt: ts(1) },
    van_demo_2: { id: 'van_demo_2', userId: 'camille.martin', userName: 'Camille Martin', userEmail: users['camille.martin'].email,
      dateStart: day(C.addDays(today, 16), 12, 0), dateEnd: day(C.addDays(today, 16), 17, 0), parking: '', comment: 'Transport d’un canapé',
      dateLabel: '', status: 'approved', createdAt: ts(6), processedAt: ts(5) }
  };
  Object.values(vanRequests).forEach(v => { v.dateLabel = `${C.fmtDateTime(v.dateStart)} → ${C.fmtDateTime(v.dateEnd)}`; });

  const locks = {};
  period.months.forEach(m => { if (m.endKey < C.addDays(today, -40)) locks[m.idx] = { from: m.startKey, to: m.endKey }; });

  const mgr = {};
  [5, 12].forEach(d => { const k = C.addDays(today, d); if (![0, 3].includes(C.dow(k))) mgr[k] = d === 5 ? 'journee' : 'matin'; });

  const ack = {}; ['camille.martin', 'lucas.bernard', 'thomas.leroy', 'ines.moreau', 'emma.dubois'].forEach((u, i) => { ack[u] = ts(2 - i * 0.2); });
  const announcements = {
    ann_demo_1: { id: 'ann_demo_1', title: 'Inventaire annuel', message: 'L’inventaire aura lieu le dernier dimanche du mois. Merci de vérifier votre planning et de signaler toute indisponibilité avant vendredi.', createdAt: ts(3), createdBy: 'Direction (démo)', active: true, acknowledgedBy: ack },
    ann_demo_2: { id: 'ann_demo_2', title: 'Nouvelle version de l’outil', message: 'Votre espace a été entièrement repensé : tableau de bord, planning en calendrier, demandes d’absence simplifiées.', createdAt: ts(0.2), createdBy: 'Direction (démo)', active: true, acknowledgedBy: {} }
  };
  const auditLog = {};
  [['request_approved', 'Demande de Hugo Fontaine (CP) → Approuvée', 33], ['modif_heure', 'Thomas Leroy a modifié une journée : 9,5 h — Réception camion — inventaire', 12],
   ['snapshot_auto', 'Sauvegarde automatique quotidienne (10 plannings)', 1], ['request_rejected', 'Demande de Julien Robert (CP) → Refusée', 10],
   ['annonce_creee', 'Annonce créée : Inventaire annuel', 3]].forEach(([action, message, age], i) => {
    auditLog['log_' + i] = { action, message, userId: 'admin', userName: 'Direction (démo)', timestamp: ts(age) };
  });
  const snapshots = {
    snap_demo_1: { id: 'snap_demo_1', createdAt: ts(1), createdAtMs: Date.now() - 86400000, createdBy: 'Direction (démo)', createdById: 'admin', type: 'auto', userCount: Object.keys(schedules).length, schedules: clone(schedules) }
  };

  return {
    users, schedules, absenceRequests: requests, vanRequests, announcements, auditLog, snapshots,
    settings: {
      holidays: { list: holidays }, openSundays: { list: openSundays }, lockedMonths: { locks },
      period: { startMonth: 5, startYear, hoursTarget: 1607 }, managerAbsences: { days: mgr },
      store: { storeName: 'Magasin démo', minStaff: { lundi: 4, mardi: 4, mercredi: 4, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0 } }
    }
  };
}
