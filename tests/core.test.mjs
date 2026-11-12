// Tests du moteur métier — lancer avec : npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/core.js';

globalThis.__TODAY = '2026-11-12';
const P = C.buildPeriod({ startMonth: 5, startYear: 2026, hoursTarget: 1607 });
const user = (extra = {}) => ({ username: 'u', name: 'Test User', hoursTarget: 1607, cpDays: 25, cpAnciennete: 2, typePlanning: { lundi: 7, mardi: 7, mercredi: 0, jeudi: 7, vendredi: 7, samedi: 7, dimanche: 0 }, ...extra });
const fullYear = (u, holidays = {}) => {
  let d = {};
  C.rangeKeys(P.startKey, P.endKey).forEach(k => { d[k] = C.emptyDay(k, u, P); });
  return C.applyTypePlanning(d, u, P, { holidays });
};

test('période : juin 2026 → mai 2027, 365 jours, 12 mois', () => {
  assert.equal(P.startKey, '2026-06-01');
  assert.equal(P.endKey, '2027-05-31');
  assert.equal(P.totalDays, 365);
  assert.equal(P.months.length, 12);
  assert.equal(P.months[7].name, 'Janvier');
  assert.equal(C.monthIndexOf(P, '2026-11-12'), 5);
  assert.equal(P.label, '2026–2027');
});

test('semaine ISO et dates', () => {
  assert.equal(C.isoWeek('2026-11-12'), 46);
  assert.equal(C.isoWeek('2027-01-01'), 53);
  assert.equal(C.isoWeek('2027-01-04'), 1);
  assert.equal(C.mondayOf('2026-11-12'), '2026-11-09');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.disp('2026-11-12'), '12/11/2026');
  assert.equal(C.num(1607), '1 607');
  assert.equal(C.num(7.5), '7,5');
});

test('objectif proratisé à la date d’entrée (même formule que la version précédente)', () => {
  const u = user({ dateEntree: '2026-09-14' });
  const ratio = C.daysInclusive('2026-09-14', P.endKey) / 365;
  assert.equal(C.effectiveTarget(u, P), Math.round(1607 * ratio));
  assert.equal(C.entryKey(user({ dateEntree: '2020-01-01' }), P), '');
  assert.equal(C.effectiveTarget(user({ dateEntree: '2020-01-01' }), P), 1607);
  const cadre = user({ isCadre: true, daysTarget: 218, dateEntree: '2026-12-01' });
  assert.equal(C.effectiveTarget(cadre, P), Math.round(218 * C.daysInclusive('2026-12-01', P.endKey) / 365 * 2) / 2);
});

test('jours fériés générés = liste historique de l’outil', () => {
  const h = C.holidaysForPeriod(P);
  const expected = ['2026-07-14', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25', '2027-01-01', '2027-03-29', '2027-05-01', '2027-05-06', '2027-05-08', '2027-05-17'];
  assert.deepEqual(Object.keys(h).sort(), expected);
  assert.equal(h['2027-03-29'].name, 'Lundi de Pâques');
  assert.equal(h['2027-05-06'].name, 'Ascension');
  assert.equal(h['2027-05-17'].name, 'Lundi de Pentecôte');
});

test('planning type : 35 h par semaine, fériés fermés à 0, avant entrée à 0', () => {
  const hol = C.holidaysForPeriod(P);
  const d = fullYear(user(), hol);
  assert.equal(d['2026-11-09'].hours, 7);            // lundi
  assert.equal(d['2026-11-11'].hours, 0);            // mercredi (repos + férié)
  assert.equal(d['2026-12-25'].holidayClosed, true); // Noël, vendredi
  assert.equal(d['2026-12-25'].hours, 0);
  const late = user({ dateEntree: '2026-09-14' });
  const d2 = fullYear(late, hol);
  assert.equal(d2['2026-09-11'].beforeEntry, true);
  assert.equal(d2['2026-09-11'].hours, 0);
  assert.equal(d2['2026-09-14'].hours, 7);
});

test('compteurs : CP non compté, CP ancienneté / maladie / formation comptés', () => {
  const d = {
    '2026-06-01': { hours: 7, type: 'normal' }, '2026-06-02': { hours: 7, type: 'CP' }, '2026-06-03': { hours: 7, type: 'CP Ancienneté' },
    '2026-06-04': { hours: 7, type: 'Maladie' }, '2026-06-05': { hours: 7, type: 'Formation' }, '2026-06-06': { hours: 0, type: 'Récupération' },
    '2026-06-08': { hours: 0, type: 'Événement Familial' }, '2026-06-09': { hours: 3, type: 'Autre' }, '2027-06-01': { hours: 99, type: 'normal' } /* hors période */
  };
  const st = C.computeStats(user(), d, P);
  assert.equal(st.total, 28);
  assert.equal(st.cp.taken, 1); assert.equal(st.cp.left, 24);
  assert.equal(st.anc.taken, 1); assert.equal(st.anc.left, 1);
  assert.equal(st.months[0], 28);
  assert.equal(st.byType['Maladie'].days, 1);
  const cadre = C.computeStats(user({ isCadre: true, daysTarget: 218 }), { '2026-06-01': { hours: 2, type: 'normal' }, '2026-06-02': { hours: 1, type: 'normal' } }, P);
  assert.equal(cadre.total, 1.5); assert.equal(cadre.unit, 'j'); assert.equal(cadre.target, 218);
});

test('parité avec l’ancien calcul du total annuel sur un planning complet', () => {
  const hol = C.holidaysForPeriod(P);
  let d = fullYear(user(), hol);
  d = C.applyAbsence(d, { id: 'r1', type: 'CP', date: '2026-08-03', dateEnd: '2026-08-15', hours: 11 }, user(), hol);
  d = C.applyAbsence(d, { id: 'r2', type: 'Maladie', date: '2026-10-05', dateEnd: '2026-10-07', hours: 3 }, user(), hol);
  const EXCL = new Set(['CP', 'Récupération', 'Événement Familial', 'Autre']);
  const legacy = Object.values(d).reduce((s, e) => s + (!EXCL.has(e?.type) ? (parseFloat(e.hours) || 0) : 0), 0);
  assert.equal(C.computeStats(user(), d, P).total, legacy);
});

test('réalisé à date et attendu à date', () => {
  const d = fullYear(user());
  const st = C.computeStats(user(), d, P, '2026-11-12');
  assert.ok(st.doneToDate > 0 && st.doneToDate < st.total);
  assert.equal(st.total, C.r2(st.doneToDate + st.ahead));
  assert.equal(st.progressPct, Math.round(C.daysInclusive(P.startKey, '2026-11-12') / 365 * 100));
});

test('CP : lundi → samedi, férié fermé exclu, état d’origine mémorisé puis restauré', () => {
  const hol = C.holidaysForPeriod(P);
  const u = user();
  let d = fullYear(u, hol);
  d['2026-12-22'] = { hours: 9, type: 'normal', note: '🟠 Renfort', modifiedByUser: true, modifComment: 'Renfort' };
  const req = { id: 'r1', type: 'CP', date: '2026-12-21', dateEnd: '2026-12-27', hours: 5 };
  assert.deepEqual(C.workingDays(req.date, req.dateEnd, hol), ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-26']);
  const a = C.applyAbsence(d, req, u, hol);
  assert.equal(a['2026-12-21'].type, 'CP'); assert.equal(a['2026-12-21'].absenceId, 'r1'); assert.equal(a['2026-12-21'].hours, 7);
  assert.equal(a['2026-12-25'].holidayClosed, true, 'Noël reste un férié, pas un CP');
  assert.equal(a['2026-12-27'].type, 'repos', 'dimanche non touché');
  assert.equal(C.computeStats(u, a, P).cp.taken, 5);
  const b = C.removeAbsence(a, req, u, hol, P);
  assert.deepEqual(b['2026-12-22'], d['2026-12-22'], 'les 9 h saisies à la main sont restaurées');
  assert.deepEqual(b['2026-12-21'], d['2026-12-21']);
  assert.equal(d['2026-12-21'].type, 'normal', 'l’objet d’origine n’est pas muté');
});

test('annulation d’une absence posée par l’ancienne version (sans prev) : retour au planning type', () => {
  const u = user();
  const d = { '2026-11-09': { hours: 7, type: 'CP', note: 'CP approuvé', absenceId: 'old' }, '2026-11-11': { hours: 7, type: 'CP', note: 'CP approuvé', absenceId: 'old' } };
  const b = C.removeAbsence(d, { id: 'old', type: 'CP', date: '2026-11-09', dateEnd: '2026-11-11' }, u, {}, P);
  assert.deepEqual(b['2026-11-09'], { hours: 7, type: 'normal', note: '' });
  assert.deepEqual(b['2026-11-11'], { hours: 0, type: 'repos', note: '' });
  assert.equal(C.removeAbsence({}, { id: 'x', type: 'CP', date: '2026-11-09', dateEnd: '2026-11-09' }, u, {}, P), null);
});

test('récupération : heures déduites, reliquat reporté sur les jours travaillés', () => {
  const u = user();
  const d = fullYear(u);
  // lundi 7 h, mardi 7 h, mercredi repos : 14 h de récup doivent solder lundi + mardi
  const a = C.applyAbsence(d, { id: 'r', type: 'Récupération', date: '2026-11-09', dateEnd: '2026-11-11', hours: 14 }, u, {});
  assert.equal(a['2026-11-09'].hours, 0); assert.equal(a['2026-11-09'].type, 'Récupération');
  assert.equal(a['2026-11-10'].hours, 0); assert.equal(a['2026-11-11'].recupDeducted, 0);
  const before = C.computeStats(u, d, P).total, after = C.computeStats(u, a, P).total;
  assert.equal(before - after, 14);
  // récup partielle : 3 h sur une journée de 7 h
  const p = C.applyAbsence(d, { id: 'p', type: 'Récupération', date: '2026-11-12', dateEnd: '2026-11-12', hours: 3 }, u, {});
  assert.equal(p['2026-11-12'].hours, 4); assert.equal(p['2026-11-12'].type, 'normal'); assert.equal(p['2026-11-12'].recupDeducted, 3);
  assert.equal(C.computeStats(u, p, P).byType['Récupération'].hours, 3);
  const back = C.removeAbsence(p, { id: 'p', type: 'Récupération', date: '2026-11-12', dateEnd: '2026-11-12' }, u, {}, P);
  assert.equal(back['2026-11-12'].hours, 7);
});

test('maladie valorisée aux heures prévues, formation comptée comme travail', () => {
  const u = user();
  const d = fullYear(u);
  const m = C.applyAbsence(d, { id: 'm', type: 'Maladie', date: '2026-11-09', dateEnd: '2026-11-14', hours: 6 }, u, {});
  assert.equal(m['2026-11-09'].hours, 7); assert.equal(m['2026-11-11'].hours, 0, 'jour de repos : 0 h');
  assert.equal(C.computeStats(u, m, P).total, C.computeStats(u, d, P).total, 'la maladie ne change pas le total');
  const f = C.applyAbsence(d, { id: 'f', type: 'Formation', date: '2026-11-09', dateEnd: '2026-11-10', hours: 14 }, u, {});
  assert.equal(f['2026-11-09'].type, 'Formation'); assert.equal(f['2026-11-09'].hours, 7);
  assert.equal(C.computeStats(u, f, P).total, C.computeStats(u, d, P).total);
  const c = C.applyAbsence({}, { id: 'c', type: 'CP Ancienneté', date: '2026-11-09', dateEnd: '2026-11-09', hours: 1 }, user({ isCadre: true }), {});
  assert.equal(c['2026-11-09'].hours, 2, 'cadre : 1 jour = 2 demi-journées');
});

test('verrouillage : absence, férié fermé, mois clôturé, avant entrée', () => {
  const ctx = { period: P, locks: { 5: { from: '2026-11-01', to: '2026-11-15' } }, holidays: { '2026-12-25': { name: 'Noël', open: false }, '2026-11-11': { name: 'Armistice', open: true } }, user: user({ dateEntree: '2026-07-01' }) };
  assert.match(C.lockReason('2026-11-10', { hours: 7, type: 'normal' }, ctx), /verrouillée/);
  assert.equal(C.lockReason('2026-11-20', { hours: 7, type: 'normal' }, ctx), '');
  assert.match(C.lockReason('2026-12-25', { hours: 0 }, ctx), /férié/);
  assert.match(C.lockReason('2026-11-20', { hours: 7, type: 'CP', absenceId: 'x' }, ctx), /Absence/);
  assert.match(C.lockReason('2026-06-15', { hours: 0 }, ctx), /entrée/);
  assert.match(C.lockReason('2028-01-01', {}, ctx), /Hors période/);
  assert.equal(C.isMonthLocked(ctx.locks, 5), true); assert.equal(C.isMonthLocked({ 3: true }, 3), true); assert.equal(C.isMonthLocked(ctx.locks, 4), false);
});

test('contrôles durée du travail', () => {
  const d = {};
  ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].forEach(k => { d[k] = { hours: 10, type: 'normal' }; });
  d['2026-11-14'] = { hours: 11, type: 'normal' }; d['2026-11-15'] = { hours: 4, type: 'normal' };
  const issues = C.legalChecks(d, '2026-11-09', '2026-11-22');
  assert.ok(issues.some(i => i.code === 'week'), 'semaine > 48 h');
  assert.ok(issues.some(i => i.code === 'day'), 'journée > 10 h');
  assert.ok(issues.some(i => i.code === 'rest'), '7 jours consécutifs');
  assert.equal(C.legalChecks({ '2026-11-09': { hours: 7, type: 'normal' } }, '2026-11-09', '2026-11-15').length, 0);
});

test('alertes : dépassement, déficit, aucune saisie, CP dépassé', () => {
  const u = user();
  const d = fullYear(u);
  const base = C.buildAlerts(u, d, P, '2026-11-12');
  assert.equal(typeof base.st.total, 'number');
  const empty = C.buildAlerts(u, {}, P, '2026-11-12');
  assert.equal(empty.alerts[0].title, 'Aucune heure planifiée');
  const over = { ...d };
  C.rangeKeys('2026-06-01', '2026-09-30').forEach(k => { if (C.dow(k) === 3) over[k] = { hours: 7, type: 'normal' }; });
  assert.ok(C.buildAlerts(u, over, P, '2026-11-12').alerts.some(a => a.title.startsWith('Dépassement')));
  const under = { ...d };
  C.rangeKeys('2027-01-01', '2027-03-31').forEach(k => { under[k] = { hours: 0, type: 'repos' }; });
  assert.ok(C.buildAlerts(u, under, P, '2026-11-12').alerts.some(a => a.title.startsWith('Planning annuel sous')));
  const noCp = C.buildAlerts(user({ cpDays: 0 }), C.applyAbsence(d, { id: 'x', type: 'CP', date: '2026-11-09', dateEnd: '2026-11-09', hours: 1 }, u, {}), P, '2026-11-12');
  assert.ok(noCp.alerts.some(a => a.title === 'Solde de CP dépassé'));
});

test('demandes : annulable ou non, camionnette, libellés', () => {
  assert.equal(C.canCancel({ status: 'approved' }), true);
  assert.equal(C.canCancel({ status: 'pending' }), false);
  assert.equal(C.canCancel({ status: 'archived', previousStatus: 'approved', date: '2026-12-01', dateEnd: '2026-12-05' }, '2026-11-12'), true);
  assert.equal(C.canCancel({ status: 'archived', previousStatus: 'approved', date: '2026-10-01', dateEnd: '2026-10-05' }, '2026-11-12'), false);
  assert.equal(C.canCancel({ status: 'archived', previousStatus: 'rejected', date: '2026-12-01' }, '2026-11-12'), false);
  assert.equal(C.vanNeedsParking('2026-11-20T10:00', '2026-11-20T16:00'), false);
  assert.equal(C.vanNeedsParking('2026-11-20T10:00', '2026-11-21T09:00'), true);
  assert.equal(C.vanNeedsParking('2026-11-21T14:00', '2026-11-21T19:00'), true, 'samedi soir');
  assert.equal(C.qtyLabel('CP', 5), '5 jours'); assert.equal(C.qtyLabel('Récupération', 7), '7 h'); assert.equal(C.qtyLabel('CP Ancienneté', 1), '1 jour');
});

test('export agenda (.ics)', () => {
  const ics = C.buildICS(user(), { '2026-11-09': { hours: 7, type: 'normal' }, '2026-11-10': { hours: 7, type: 'CP' }, '2026-11-11': { hours: 0, type: 'repos' } }, P, 'Magasin');
  assert.match(ics, /BEGIN:VCALENDAR/); assert.match(ics, /DTSTART;VALUE=DATE:20261109/); assert.match(ics, /SUMMARY:Congés payés/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
});

test('mots de passe : clair (historique) et empreinte', async () => {
  assert.equal(await C.checkPassword({ username: 'a', password: 'secret' }, 'secret'), true);
  assert.equal(await C.checkPassword({ username: 'a', password: 'secret' }, 'nope'), false);
  const h = await C.hashPassword('a', 'secret');
  assert.equal(h.length, 64);
  assert.equal(await C.checkPassword({ username: 'a', passwordHash: h }, 'secret'), true);
  assert.equal(await C.checkPassword({ username: 'b', passwordHash: h }, 'secret'), false, 'empreinte liée à l’identifiant');
  assert.equal(await C.checkPassword({ username: 'a' }, undefined), false);
});

test('base de démonstration : même API que Firestore', async () => {
  globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const { createDemoDb, F } = await import('../js/demo.js');
  const db = createDemoDb(true);
  const users = await db.collection('users').get();
  assert.ok(users.size >= 10);
  const one = await db.collection('users').where('username', '==', 'camille.martin').limit(1).get();
  assert.equal(one.docs[0].data().name, 'Camille Martin');
  await db.collection('schedules').doc('camille.martin').update({ 'days.2026-11-12': { hours: 3, type: 'normal', note: 'x' } });
  const s = (await db.collection('schedules').doc('camille.martin').get()).data();
  assert.equal(s.days['2026-11-12'].hours, 3);
  assert.ok(Object.keys(s.days).length >= 365, 'les autres journées sont intactes');
  await db.collection('users').doc('camille.martin').update({ passwordHash: 'h', password: F.del(), updatedAt: F.ts() });
  const u = (await db.collection('users').doc('camille.martin').get()).data();
  assert.equal(u.password, undefined); assert.ok(u.updatedAt.seconds > 0);
  const pend = await db.collection('absenceRequests').where('status', 'in', ['pending', 'cancel_pending']).get();
  assert.ok(pend.size >= 3);
  const ordered = await db.collection('snapshots').orderBy('createdAtMs', 'desc').limit(1).get();
  assert.equal(ordered.size, 1);
  let fired = 0;
  const un = db.collection('vanRequests').onSnapshot(() => { fired++; });
  await new Promise(r => setTimeout(r, 5));
  await db.collection('vanRequests').doc('x').set({ id: 'x', status: 'pending' });
  await new Promise(r => setTimeout(r, 5));
  un();
  assert.equal(fired, 2);
  await assert.rejects(() => db.collection('users').doc('inconnu').update({ a: 1 }));
  // identifiant contenant un point : le chemin segmenté ne doit pas créer de champ imbriqué
  await db.collection('announcements').doc('ann_demo_2').update(F.path('acknowledgedBy', 'camille.martin'), F.ts());
  const ann = (await db.collection('announcements').doc('ann_demo_2').get()).data();
  assert.ok(ann.acknowledgedBy['camille.martin'].seconds > 0); assert.equal(ann.acknowledgedBy.camille, undefined);
  // chaque demande approuvée de la démo est bien reportée sur le planning
  const dump = db.__dump();
  for (const r of Object.values(dump.absenceRequests).filter(r => r.status === 'approved')) {
    const days = dump.schedules[r.userId].days;
    assert.ok(C.rangeKeys(r.date, r.dateEnd).some(k => days[k]?.absenceId === r.id), `${r.id} appliquée`);
  }
});
