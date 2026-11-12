/* Tests de bout en bout (mode démo) — nécessite Playwright.
   1) npm start (ou PORT=4173 node server.js)   2) node tests/e2e.cjs
   Variables : BASE (http://localhost:4173), SHOTS (dossier de captures, facultatif),
   VENDOR (dossier node_modules contenant firebase@10.7.1 et xlsx pour les tests hors ligne). */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:4173';
const SHOTS = process.env.SHOTS || '';
const VENDOR = process.env.VENDOR || '';
let pass = 0, fail = 0;
const errors = [];
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓', label); } else { fail++; console.log('  ✗ ÉCHEC :', label); } };
const section = t => console.log('\n■ ' + t);

async function shot(page, name, full = false) {
  if (!SHOTS) return;
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });
}
function watch(page, tag) {
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${tag}] console: ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${tag}] ${e.message}`));
}
const login = async (page, u, p, query = '') => {
  await page.goto(BASE + '/' + query);
  await page.waitForSelector('#lgUser', { state: 'visible' });
  await page.fill('#lgUser', u); await page.fill('#lgPass', p); await page.click('#lgBtn');
};
const go = async (page, r) => { await page.evaluate(h => { location.hash = h; }, '#/' + r); await page.waitForTimeout(300); };
const demo = (page, fn, arg) => page.evaluate(fn, arg);
const toastText = async page => { await page.waitForSelector('.toast', { timeout: 5000 }); return page.$$eval('.toast', l => l.map(t => t.innerText).join(' | ')); };
const clearToasts = page => page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));

(async () => {
  const browser = await chromium.launch();

  /* ═════════ DIRECTION — ordinateur ═════════ */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1, acceptDownloads: true, locale: 'fr-FR' });
  if (VENDOR) await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', r => r.fulfill({ path: path.join(VENDOR, 'xlsx/dist/xlsx.full.min.js'), contentType: 'text/javascript' }));
  const page = await ctx.newPage(); watch(page, 'admin');

  section('Connexion');
  await page.goto(BASE + '/?demo=reset');
  await page.waitForSelector('#lgUser', { state: 'visible' });
  await shot(page, '01-connexion');
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPass', 'mauvais'); await page.click('#lgBtn');
  await page.waitForSelector('#lgErr:not(.hidden)');
  ok((await page.innerText('#lgErr')).includes('incorrect'), 'mot de passe erroné refusé');
  await page.fill('#lgPass', 'demo'); await page.click('#lgBtn');
  await page.waitForSelector('#app', { state: 'visible' });
  ok(await page.isVisible('#sideNav'), 'tableau de bord direction affiché');
  ok((await page.innerText('#sideNav')).includes('Collaborateurs'), 'menu direction complet');
  await page.waitForTimeout(500);
  await shot(page, '02-tableau-de-bord');
  await shot(page, '02b-tableau-de-bord-complet', true);

  section('Décisions sur les demandes');
  const pend0 = await demo(page, () => __demo.St.pendingRequests().map(r => ({ id: r.id, userId: r.userId, type: r.type, date: r.date, status: r.status })));
  ok(pend0.length === 4, `4 demandes à traiter (${pend0.length})`);
  const lucas = pend0.find(r => r.userId === 'lucas.bernard');
  await page.click(`[data-act="req-decide"][data-arg="${lucas.id}|approved"]`);
  ok((await toastText(page)).includes('approuvée'), 'approbation en un clic');
  let d = await demo(page, a => ({ r: __demo.S.requests.find(r => r.id === a.id), e: __demo.St.daysOf('lucas.bernard')[a.date] }), lucas);
  ok(d.r.status === 'approved' && d.e.absenceId === lucas.id && d.e.recupDeducted === 7 && d.e.hours === 0 && d.e.prev.hours === 7, 'récupération reportée sur le planning (7 h déduites, état d’origine mémorisé)');
  await clearToasts(page);
  const ines = pend0.find(r => r.userId === 'ines.moreau');
  await page.click(`[data-act="req-decide"][data-arg="${ines.id}|rejected"]`);
  await page.waitForSelector('#cfIn'); await page.fill('#cfIn', 'Période de fortes ventes'); await page.click('#cfOk');
  await toastText(page);
  d = await demo(page, id => __demo.S.requests.find(r => r.id === id), ines.id);
  ok(d.status === 'rejected' && d.managerComment === 'Période de fortes ventes', 'refus avec message transmis au collaborateur');
  await clearToasts(page);
  const thomas = pend0.find(r => r.status === 'cancel_pending');
  const before = await demo(page, a => __demo.St.daysOf(a.userId)[a.date], thomas);
  ok(before.type === 'CP', 'absence de Thomas présente avant annulation');
  await go(page, 'requests'); await shot(page, '06-demandes-a-traiter');
  await page.click(`[data-act="cancel-decide"][data-arg="${thomas.id}|approved"]`);
  await toastText(page);
  d = await demo(page, a => ({ r: __demo.S.requests.find(r => r.id === a.id), e: __demo.St.daysOf(a.userId)[a.date] }), thomas);
  ok(d.r.status === 'cancelled' && !d.e.absenceId && d.e.hours === 7 && d.e.type === 'normal', 'annulation acceptée : heures d’origine rétablies');
  const mails = await demo(page, async () => (await import('./js/backend.js')).sentMails.length);
  ok(mails >= 3, `e-mails de réponse générés (${mails})`);
  await clearToasts(page);

  section('Demandes : liste, filtres, calendrier, camionnette');
  await page.click('[data-act="rq-tab"][data-arg="all"]'); await page.waitForTimeout(200);
  const nAll = await page.$$eval('#rqList .req', l => l.length);
  await page.selectOption('[data-act="rq-filter"][data-arg="user"]', 'camille.martin'); await page.waitForTimeout(200);
  const nCam = await page.$$eval('#rqList .req', l => l.length);
  ok(nAll > nCam && nCam >= 1, `filtre par collaborateur (${nAll} → ${nCam})`);
  await page.fill('#rqSearch', 'zzzz'); await page.waitForTimeout(350);
  ok((await page.innerText('#rqList')).includes('Aucune demande'), 'recherche sans résultat');
  await page.click('[data-act="rq-reset"]'); await page.waitForTimeout(200);
  await page.click('[data-act="rq-tab"][data-arg="calendar"]'); await page.waitForTimeout(250);
  ok(await page.$$eval('.acal .ev', l => l.length) > 3, 'calendrier des absences rempli');
  await shot(page, '07-calendrier-absences');
  await page.click('[data-act="rq-tab"][data-arg="van"]'); await page.waitForTimeout(250);
  await shot(page, '08-camionnette-direction');
  await page.click('[data-act="van-decide"][data-arg="van_demo_1|approved"]');
  await toastText(page);
  ok(await demo(page, () => __demo.S.van.find(v => v.id === 'van_demo_1').status) === 'approved', 'emprunt camionnette approuvé');
  await clearToasts(page);

  section('Planning équipe');
  await go(page, 'team'); await shot(page, '03-planning-equipe');
  ok(await page.$$eval('.tgrid tbody tr', l => l.length) === 9, 'grille : 9 collaborateurs');
  const today = await demo(page, () => __demo.C.todayKey());
  const target = await demo(page, t => { const C = __demo.C; let k = C.addDays(t, 4); while (C.dow(k) !== 2) k = C.addDays(k, 1); return k; }, today);
  await page.click(`[data-act="team-cell"][data-arg="emma.dubois|${target}"]`);
  await page.waitForSelector('#deHours'); await shot(page, '04-edition-journee');
  await page.fill('#deHours', '8.5'); await page.fill('#deNote', 'Inventaire'); await page.click('#deSave');
  await toastText(page);
  d = await demo(page, k => __demo.St.daysOf('emma.dubois')[k], target);
  ok(d.hours === 8.5 && d.note === 'Inventaire' && !d.modifiedByUser, 'case modifiée par la direction depuis la grille');
  await clearToasts(page);
  await page.click('[data-act="team-view"][data-arg="week"]'); await page.waitForTimeout(250); await shot(page, '03b-planning-equipe-semaine');
  ok(await page.$$eval('.tgrid.week thead tr:nth-child(2) th', l => l.length) === 9, 'vue semaine : 7 jours');
  await page.click('[data-act="team-view"][data-arg="year"]'); await page.waitForTimeout(250); await shot(page, '03c-planning-equipe-exercice');
  ok((await page.innerText('#view')).includes('Synthèse de l’exercice'), 'vue exercice');
  await page.click('[data-act="team-view"][data-arg="month"]');

  section('Planning individuel (direction)');
  await go(page, 'planning/camille.martin'); await shot(page, '05-planning-individuel');
  ok(await page.$$eval('.cal .cd:not(.blank)', l => l.length) === 30, 'calendrier de novembre : 30 jours');
  await page.click('[data-act="plan-mode"][data-arg="list"]'); await page.waitForTimeout(250);
  const k2 = await demo(page, t => { const C = __demo.C; let k = C.addDays(t, 6); while (C.dow(k) !== 5) k = C.addDays(k, 1); return k; }, today);
  await page.fill(`.dl-h[data-k="${k2}"]`, '6'); await page.press(`.dl-h[data-k="${k2}"]`, 'Enter');
  await toastText(page);
  ok(await demo(page, k => __demo.St.daysOf('camille.martin')[k].hours, k2) === 6, 'saisie rapide : heures enregistrées au clavier');
  await clearToasts(page); await shot(page, '05b-saisie-rapide');
  await page.click('[data-act="plan-mode"][data-arg="cal"]'); await page.waitForTimeout(200);
  await page.click('[data-act="plan-select"]'); await page.waitForTimeout(200);
  const two = await demo(page, t => { const C = __demo.C; const out = []; let k = C.addDays(t, 12); while (out.length < 2) { if ([1, 2].includes(C.dow(k)) && k.slice(0, 7) === t.slice(0, 7)) out.push(k); k = C.addDays(k, 1); if (k.slice(0, 7) !== t.slice(0, 7)) break; } return out; }, today);
  for (const k of two) await page.click(`.cd[data-arg="${k}"]`);
  await page.click('[data-act="plan-sel-edit"]'); await page.waitForSelector('#deHours');
  await page.fill('#deHours', '5'); await page.click('#deSave'); await toastText(page);
  const hs = await demo(page, ks => ks.map(k => __demo.St.daysOf('camille.martin')[k].hours), two);
  ok(two.length === 2 && hs.every(h => h === 5), 'sélection multiple : 2 journées modifiées d’un coup');
  await clearToasts(page);

  section('Saisie directe d’une absence');
  await go(page, 'home');
  await page.click('[data-act="absence-direct"]'); await page.waitForSelector('#afUser');
  await page.selectOption('#afUser', 'emma.dubois');
  await page.click('[data-type="Maladie"]');
  const sick = await demo(page, t => { const C = __demo.C; let k = C.addDays(t, 20); while (C.dow(k) !== 2) k = C.addDays(k, 1); return [k, C.addDays(k, 2)]; }, today);
  await page.fill('#afStart', sick[0]); await page.dispatchEvent('#afStart', 'change');
  await page.fill('#afEnd', sick[1]); await page.dispatchEvent('#afEnd', 'change');
  ok(await page.inputValue('#afQty') === '3', 'nombre de jours calculé automatiquement');
  await shot(page, '09-saisie-absence');
  await page.click('#afSend'); await toastText(page);
  d = await demo(page, k => __demo.St.daysOf('emma.dubois')[k], sick[0]);
  ok(d.type === 'Maladie' && d.hours === 7 && d.absenceId, 'maladie saisie par la direction, comptée aux heures prévues');
  await clearToasts(page);

  section('Collaborateurs');
  await go(page, 'people'); await shot(page, '10-collaborateurs');
  await page.click('[data-act="user-new"]'); await page.waitForSelector('#ufName');
  await page.fill('#ufName', 'Zoé Testeur'); await page.fill('#ufUser', 'zoe.testeur'); await page.fill('#ufPass', 'secret1'); await page.fill('#ufPoste', 'Renfort saisonnier');
  await page.fill('#ufEntry', await demo(page, t => __demo.C.addDays(t, 10), today)); await page.dispatchEvent('#ufEntry', 'change');
  ok((await page.innerText('#ufProrata')).includes('proratisé'), 'aperçu de l’objectif proratisé');
  await shot(page, '11-fiche-collaborateur');
  await page.click('#ufSave'); await toastText(page);
  d = await demo(page, t => { const u = __demo.St.userOf('zoe.testeur'), days = __demo.St.daysOf('zoe.testeur'); return { u: !!u, n: Object.keys(days).length, pre: days[t]?.beforeEntry, st: __demo.St.statsOf(u).target }; }, today);
  ok(d.u && d.n === 365 && d.pre === true && d.st < 1607, 'profil créé : planning généré, jours avant l’entrée neutralisés, objectif proratisé');
  await clearToasts(page);
  const manual = await demo(page, () => { const C = __demo.C, d = __demo.St.daysOf('camille.martin'); return Object.keys(d).find(k => d[k].modifiedByUser && k < C.todayKey()); });
  await page.click('[data-act="user-edit"][data-arg="camille.martin"]'); await page.waitForSelector('#ufName');
  await page.fill('#ufEmail', 'camille@exemple.fr'); await page.click('#ufSave'); await toastText(page);
  d = await demo(page, k => ({ e: __demo.St.daysOf('camille.martin')[k], mail: __demo.St.userOf('camille.martin').email }), manual);
  ok(d.mail === 'camille@exemple.fr' && d.e.modifiedByUser && d.e.hours === 9, 'modifier un e-mail ne réécrit plus le planning (heures saisies conservées)');
  await clearToasts(page);
  await page.click('[data-act="user-edit"][data-arg="camille.martin"]'); await page.waitForSelector('#ufName');
  await page.fill('.uf-tp[data-d="mercredi"]', '4'); await page.dispatchEvent('.uf-tp[data-d="mercredi"]', 'input');
  ok(await page.isVisible('#ufReapply'), 'changement de planning type : choix du périmètre proposé');
  await page.click('#ufSave'); await toastText(page);
  d = await demo(page, a => { const C = __demo.C, dd = __demo.St.daysOf('camille.martin'); let f = C.addDays(a.t, 1); while (C.dow(f) !== 3 || dd[f].absenceId || dd[f].holidayClosed) f = C.addDays(f, 1); let p = C.addDays(a.t, -1); while (C.dow(p) !== 3 || dd[p].holidayClosed) p = C.addDays(p, -1); return { fut: dd[f].hours, past: dd[p].hours, man: dd[a.manual].hours }; }, { t: today, manual });
  ok(d.fut === 4 && d.past === 0 && d.man === 9, 'planning type réappliqué à partir de demain uniquement');
  await clearToasts(page);
  await page.click('[data-act="user-delete"][data-arg="zoe.testeur"]'); await page.waitForSelector('#cfIn');
  await page.fill('#cfIn', 'zoe.testeur'); await page.click('#cfOk'); await toastText(page);
  ok(await demo(page, () => !__demo.St.userOf('zoe.testeur')), 'suppression confirmée par saisie de l’identifiant');
  await clearToasts(page);
  await page.click('[data-act="user-sheet"][data-arg="thomas.leroy"]'); await page.waitForSelector('.overlay.drawer'); await shot(page, '11b-fiche-detail');
  await page.keyboard.press('Escape');

  section('Alertes, rapports, exports');
  await go(page, 'alerts'); await shot(page, '12-alertes');
  ok(await page.$$eval('#view .list .li', l => l.length) > 0, 'alertes calculées');
  ok((await page.innerText('#view')).includes('Semaine de plus de 48 h'), 'contrôle durée du travail (semaine > 48 h) détecté');
  await go(page, 'reports'); await shot(page, '13-rapports');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="rp-csv"]')]);
  const csvTxt = fs.readFileSync(await csv.path(), 'utf8');
  ok(csvTxt.includes('Camille Martin') && csvTxt.split('\n').length === 10, 'export CSV paie du mois (9 collaborateurs)');
  await clearToasts(page);
  if (VENDOR) {
    const [xl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('[data-act="rp-xlsx"]')]);
    const size = fs.statSync(await xl.path()).size;
    ok(xl.suggestedFilename().endsWith('.xlsx') && size > 20000, `export Excel généré (${Math.round(size / 1024)} Ko)`);
    await clearToasts(page);
  }
  await page.click('[data-act="rp-tab"][data-arg="check"]'); await page.waitForTimeout(250);
  ok((await page.innerText('#view')).includes('Réalisé sur la période'), 'vérification feuille d’heures');
  await page.selectOption('#vfMode', 'weeks'); await page.waitForTimeout(250);
  ok(await page.isVisible('#vfW1'), 'sélection par numéro de semaine');
  await shot(page, '14-verification-feuille-heures');
  await page.click('[data-act="rp-tab"][data-arg="print"]'); await page.waitForTimeout(250);
  ok(await page.isVisible('.pp-preview .pp table'), 'aperçu de la feuille à signer'); await shot(page, '15-impression');
  await go(page, 'planning/camille.martin');
  const [ics] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="plan-ics"]')]);
  ok(fs.readFileSync(await ics.path(), 'utf8').startsWith('BEGIN:VCALENDAR'), 'export agenda .ics');
  await clearToasts(page);

  section('Annonces');
  await go(page, 'comms');
  await page.fill('#annTitle', 'Réunion d’équipe'); await page.fill('#annMsg', 'Réunion vendredi à 9 h en salle de pause.'); await page.click('[data-act="ann-send"]');
  await toastText(page); await page.waitForTimeout(300);
  ok((await page.innerText('#view')).includes('Réunion d’équipe'), 'annonce créée et listée'); await shot(page, '16-annonces');
  await clearToasts(page);

  section('Paramètres');
  await go(page, 'settings'); await shot(page, '17-parametres');
  await page.fill('.g-min[data-d="samedi"]', '7'); await page.selectOption('#gCp', 'planning'); await page.click('[data-act="st-save-general"]'); await toastText(page);
  ok(await demo(page, () => __demo.S.store.minStaff.samedi === 7 && __demo.S.store.cpMode === 'planning'), 'effectif minimum et décompte des CP enregistrés');
  await clearToasts(page);
  await page.click('[data-act="st-tab"][data-arg="holidays"]'); await page.waitForTimeout(250); await shot(page, '17b-feries');
  const h11 = await demo(page, () => Object.keys(__demo.S.holidays).find(k => k.endsWith('-11-11')));
  await page.click(`[data-act="st-hol-toggle"][data-arg="${h11}"]`); await toastText(page);
  d = await demo(page, k => __demo.St.team().map(u => __demo.St.daysOf(u.username)[k]).filter(e => !e.absenceId && !e.beforeEntry), h11);
  ok(d.length > 0 && d.every(e => e.hours === 0 && e.holidayClosed), 'férié passé en « fermé » : 0 h appliqué à tous les plannings');
  await clearToasts(page);
  await page.click('[data-act="st-tab"][data-arg="locks"]'); await page.waitForTimeout(250); await shot(page, '17c-verrouillages');
  await page.click('[data-act="st-lock"][data-arg="5|full"]'); await toastText(page);
  ok(await demo(page, () => __demo.C.isMonthLocked(__demo.S.locks, 5)), 'mois verrouillé'); await clearToasts(page);
  await page.click('[data-act="st-lock"][data-arg="5|off"]'); await toastText(page); await clearToasts(page);
  await page.click('[data-act="st-tab"][data-arg="presence"]'); await page.waitForTimeout(250);
  ok(await page.$$eval('#stBody .li', l => l.length) > 20, 'présence direction');
  await page.click('[data-act="st-tab"][data-arg="backups"]'); await page.waitForSelector('[data-act="st-snap-restore"]');
  const n0 = await page.$$eval('[data-act="st-snap-restore"]', l => l.length);
  await page.click('[data-act="st-snap-new"]'); await toastText(page); await page.waitForTimeout(500);
  const n1 = await page.$$eval('[data-act="st-snap-restore"]', l => l.length);
  ok(n1 === n0 + 1, `sauvegarde manuelle créée (${n0} → ${n1})`); await shot(page, '17d-sauvegardes'); await clearToasts(page);
  // modification puis restauration
  await demo(page, async t => { await __demo.St.editDays('sarah.petit', [t], { hours: 11 }); }, today);
  await page.click('[data-act="st-snap-restore"]'); await page.waitForSelector('#cfIn'); await page.fill('#cfIn', 'restaurer'); await page.click('#cfOk');
  await toastText(page);
  ok(await demo(page, t => __demo.St.daysOf('sarah.petit')[t].hours !== 11, today), 'restauration d’une sauvegarde (avec sauvegarde de sécurité préalable)');
  await clearToasts(page);
  await page.click('[data-act="st-tab"][data-arg="history"]'); await page.waitForSelector('#auditList .ev');
  ok(await page.$$eval('#auditList .ev', l => l.length) > 10, 'historique des actions alimenté'); await shot(page, '17e-historique');
  await page.click('[data-act="st-tab"][data-arg="security"]'); await page.waitForTimeout(250); await shot(page, '17f-securite');
  await page.click('[data-act="st-hash"]'); await page.waitForSelector('#cfOk'); await page.click('#cfOk'); await toastText(page);
  d = await demo(page, async () => { const snap = await (await import('./js/backend.js')).db.collection('users').get(); return snap.docs.map(x => x.data()).every(u => u.password === undefined && /^[0-9a-f]{64}$/.test(u.passwordHash)); });
  ok(d, 'mots de passe convertis en empreintes (plus aucun mot de passe en clair)');
  await clearToasts(page);

  section('Recherche, liens e-mail, déconnexion');
  await page.keyboard.press('Control+k'); await page.waitForSelector('.palette input');
  await page.keyboard.type('thomas'); await page.waitForTimeout(150); await shot(page, '18-recherche'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => location.hash)).includes('planning/thomas.leroy'), 'palette Ctrl+K → planning de Thomas');
  const cam = pend0.find(r => r.userId === 'camille.martin');
  await page.goto(`${BASE}/?action=approve&requestId=${cam.id}`); await page.waitForSelector('#app', { state: 'visible' });
  await page.waitForFunction(id => window.__demo && __demo.S.requests.find(r => r.id === id)?.status === 'approved', cam.id, { timeout: 8000 });
  d = await demo(page, a => { const C = __demo.C, dd = __demo.St.daysOf('camille.martin'), tp = C.tpOf(__demo.St.userOf('camille.martin')); const cp = C.rangeKeys(a.date, C.addDays(a.date, 6)).filter(k => dd[k].type === 'CP'); return { n: cp.length, worked: cp.every(k => tp[C.DAYS[C.dow(k)]] > 0), noel: dd[a.date.slice(0, 8) + '25']?.type }; }, cam);
  ok(d.n === 5 && d.worked && d.noel !== 'CP', `lien « Approuver » de l’e-mail traité ; ${d.n} CP posés sur les jours travaillés, férié de Noël non décompté`);
  ok(!(await page.evaluate(() => location.search)), 'paramètres retirés de l’adresse après traitement');
  await go(page, 'profile'); await shot(page, '19-profil');
  await page.click('#view [data-act="logout"]'); await page.waitForSelector('#lgUser', { state: 'visible' });
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPass', 'demo'); await page.click('#lgBtn');
  await page.waitForSelector('#app', { state: 'visible' });
  ok(true, 'reconnexion après conversion des mots de passe en empreintes');
  await page.evaluate(() => document.querySelector('[data-act="theme"]').click()); await go(page, 'home');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'thème sombre'); await shot(page, '20-theme-sombre');
  await go(page, 'team'); await shot(page, '20b-theme-sombre-equipe');
  await page.evaluate(() => document.querySelector('[data-act="theme"]').click());
  // la session et la base de démo sont partagées avec l'onglet « collaborateur » (même contexte)

  /* ═════════ COLLABORATEUR — téléphone ═════════ */
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 3 : 1, isMobile: true, hasTouch: true, locale: 'fr-FR', acceptDownloads: true });
  const m = await mctx.newPage(); watch(m, 'mobile');
  section('Collaborateur sur téléphone');
  await m.goto(BASE + '/app.html?demo=reset');
  await m.waitForSelector('#lgUser', { state: 'visible' });
  ok(m.url().includes('index.html'), 'app.html (application Android) redirige vers l’interface unique');
  await shot(m, 'm01-connexion');
  await m.fill('#lgUser', 'camille.martin'); await m.fill('#lgPass', 'demo'); await m.click('#lgBtn');
  await m.waitForSelector('#app', { state: 'visible' });
  await m.waitForSelector('#annOk', { timeout: 5000 });
  ok(true, 'annonce non lue affichée à la connexion'); await shot(m, 'm02-annonce');
  await m.click('#annOk'); await m.waitForTimeout(400);
  ok(await m.$('#annOk') === null && await m.evaluate(() => !!__demo.S.announcements.find(a => a.id === 'ann_demo_2').acknowledgedBy['camille.martin']), 'accusé de lecture enregistré sous l’identifiant complet (« prenom.nom »)');
  ok(await m.isVisible('#bottomNav') && !(await m.isVisible('.side')), 'navigation mobile en bas d’écran');
  ok(!(await m.innerText('#bottomNav')).includes('Collab'), 'aucun accès direction pour un collaborateur');
  await shot(m, 'm03-accueil'); await shot(m, 'm03b-accueil-complet', true);
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'aucun défilement horizontal sur l’accueil');
  await m.evaluate(() => { location.hash = '#/people'; }); await m.waitForTimeout(300);
  ok((await m.innerText('#pageTitle')) === 'Accueil', 'écran direction inaccessible par l’adresse');

  await m.click('#bottomNav [data-arg="planning"]'); await m.waitForTimeout(300); await shot(m, 'm04-planning');
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'planning sans défilement horizontal');
  const tk = await m.evaluate(() => { const C = __demo.C; let k = C.addDays(C.todayKey(), 1); const d = __demo.St.myDays(); while (C.dow(k) === 0 || C.dow(k) === 3 || d[k].absenceId) k = C.addDays(k, 1); return k; });
  await m.click(`.cd[data-arg="${tk}"]`); await m.waitForSelector('#deHours'); await shot(m, 'm05-saisie-journee');
  await m.fill('#deHours', '9'); await m.click('#deSave');
  ok((await toastText(m)).includes('obligatoire'), 'commentaire obligatoire pour un collaborateur'); await clearToasts(m);
  await m.fill('#deComment', 'Fermeture tardive'); await m.click('#deSave'); await toastText(m);
  d = await m.evaluate(k => __demo.St.myDays()[k], tk);
  ok(d.hours === 9 && d.modifiedByUser && d.modifComment === 'Fermeture tardive', 'heures modifiées avec commentaire tracé'); await clearToasts(m);
  const lockedK = await m.evaluate(() => { const C = __demo.C, S = __demo.S; return Object.keys(__demo.St.myDays()).sort().find(k => C.isDateLocked(S.locks, S.period, k) && C.dow(k) === 1 && !__demo.St.myDays()[k].absenceId); });
  await m.evaluate(() => { location.hash = '#/planning/camille.martin/0'; }); await m.waitForTimeout(400);
  await m.click(`.cd[data-arg="${lockedK}"]`); await m.waitForSelector('.modal');
  ok((await m.innerText('.modal')).includes('verrouillée') && !(await m.$('#deSave')), 'journée d’un mois verrouillé non modifiable');
  await m.click('.modal [data-close]');

  await m.click('#bottomNav [data-arg="absences"]'); await m.waitForTimeout(300); await shot(m, 'm06-absences');
  await m.click('[data-act="absence-new"]'); await m.waitForSelector('[data-type="CP"]');
  await m.click('[data-type="CP"]');
  const cp = await m.evaluate(() => { const C = __demo.C; const k = C.mondayOf(C.addDays(C.todayKey(), 100)); return [k, C.addDays(k, 5)]; });
  await m.fill('#afStart', cp[0]); await m.dispatchEvent('#afStart', 'change'); await m.fill('#afEnd', cp[1]); await m.dispatchEvent('#afEnd', 'change');
  ok(await m.inputValue('#afQty') === '6', 'CP lundi → samedi : 6 jours ouvrables (règle historique par défaut)');
  ok((await m.innerText('#afSum')).includes('Solde CP après'), 'solde après la demande affiché avant envoi'); await shot(m, 'm07-nouvelle-demande');
  await m.click('#afSend'); await toastText(m); await clearToasts(m);
  d = await m.evaluate(s => __demo.S.requests.find(r => r.date === s && r.status === 'pending'), cp[0]);
  ok(!!d && d.qLabel === '6 jours' && d.userId === 'camille.martin', 'demande envoyée (en attente)');
  await m.click('[data-act="absence-new"]'); await m.waitForSelector('[data-type="CP"]'); await m.click('[data-type="CP"]');
  await m.fill('#afStart', cp[0]); await m.dispatchEvent('#afStart', 'change');
  ok((await m.innerText('#afSum')).includes('Chevauchement'), 'chevauchement détecté avant l’envoi');
  await m.click('.modal [data-close]');
  await m.click(`[data-act="req-open"][data-arg="${d.id}"]`); await m.waitForSelector('#rqDrop'); await shot(m, 'm08-detail-demande');
  await m.click('#rqDrop'); await toastText(m); await clearToasts(m);
  ok(await m.evaluate(id => __demo.S.requests.find(r => r.id === id).status, d.id) === 'cancelled', 'demande en attente retirée par le collaborateur');
  // demande d'annulation d'une absence approuvée (créée ici côté direction via le store)
  const apId = await m.evaluate(async () => { const C = __demo.C, St = __demo.St, S = __demo.S; const me = S.me; S.me = { ...me, role: 'admin' }; const k = C.mondayOf(C.addDays(C.todayKey(), 130));
    const id = await St.submitAbsence({ userId: 'camille.martin', type: 'CP', start: k, end: C.addDays(k, 1), qty: 2, direct: true }); S.me = me; return id; });
  await m.waitForTimeout(400); await m.evaluate(() => { location.hash = '#/absences'; }); await m.waitForTimeout(300);
  await m.click('[data-act="abs-filter"][data-arg="approved"]'); await m.waitForTimeout(200);
  await m.click(`[data-act="req-open"][data-arg="${apId}"]`); await m.waitForSelector('#rqCancel');
  await m.fill('#rqReason', 'Changement de programme'); await m.click('#rqCancel'); await toastText(m); await clearToasts(m);
  d = await m.evaluate(id => __demo.S.requests.find(r => r.id === id), apId);
  ok(d.status === 'cancel_pending' && d.previousStatus === 'approved' && d.cancelReason === 'Changement de programme', 'demande d’annulation transmise à la direction');

  await m.click('#bottomNav [data-arg="team"]'); await m.waitForTimeout(300); await shot(m, 'm09-equipe');
  ok(await m.$$eval('.tgrid td.edit', l => l.length) === 0, 'planning équipe en lecture seule pour un collaborateur');
  ok(await m.evaluate(() => { const C = __demo.C; return ![...document.querySelectorAll('.tgrid td')].some(td => ['MAL', 'FAM'].includes(td.textContent.trim())); }), 'motifs personnels des collègues masqués (affichés « ABS »)');
  await m.click('[data-act="more"]'); await m.waitForSelector('.modal'); await shot(m, 'm10-menu');
  await m.click('.modal [data-arg="van"]'); await m.waitForTimeout(300);
  const vs = await m.evaluate(() => { const d = new Date(Date.now() + 5 * 86400000); d.setHours(18, 0, 0, 0); const e = new Date(d.getTime() + 40 * 3600000); const f = x => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); return [f(d), f(e)]; });
  await m.fill('#vanStart', vs[0]); await m.dispatchEvent('#vanStart', 'change'); await m.fill('#vanEnd', vs[1]); await m.dispatchEvent('#vanEnd', 'change');
  ok(await m.isVisible('#vanParking'), 'stationnement de nuit demandé pour un emprunt sur plusieurs jours');
  await m.click('[data-act="van-submit"]'); ok((await toastText(m)).includes('stationnement'), 'stationnement obligatoire'); await clearToasts(m);
  await m.fill('#vanParking', 'Domicile'); await shot(m, 'm11-camionnette'); await m.click('[data-act="van-submit"]'); await toastText(m); await clearToasts(m);
  ok(await m.evaluate(() => __demo.S.van.some(v => v.userId === 'camille.martin' && v.parking === 'Domicile' && v.status === 'pending')), 'demande d’emprunt envoyée');
  const soon = await m.evaluate(() => { const d = new Date(Date.now() + 5 * 3600000); const f = x => new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); return [f(d), f(new Date(d.getTime() + 3600000))]; });
  await m.fill('#vanStart', soon[0]); await m.dispatchEvent('#vanStart', 'change'); await m.fill('#vanEnd', soon[1]); await m.dispatchEvent('#vanEnd', 'change');
  await m.click('[data-act="van-submit"]'); ok((await toastText(m)).includes('48 h'), 'règle des 48 h appliquée'); await clearToasts(m);

  await m.evaluate(() => { location.hash = '#/help'; }); await m.waitForTimeout(300);
  await m.fill('#faqQ', 'dimanche'); await m.waitForTimeout(200);
  ok(await m.$$eval('.faq-q', l => l.length) >= 1 && await m.$$eval('.faq-q', l => l.length) < 30, 'guide 1607 h : recherche dans les questions'); await shot(m, 'm12-guide');
  await m.evaluate(() => { location.hash = '#/profile'; }); await m.waitForTimeout(300);
  await m.fill('#pfOld', 'demo'); await m.fill('#pfNew', 'nouveau1'); await m.fill('#pfNew2', 'nouveau1'); await m.click('[data-act="pf-pass"]'); await toastText(m); await clearToasts(m);
  await m.click('#view [data-act="logout"]'); await m.waitForSelector('#lgUser', { state: 'visible' });
  await m.fill('#lgUser', 'camille.martin'); await m.fill('#lgPass', 'demo'); await m.click('#lgBtn'); await m.waitForSelector('#lgErr:not(.hidden)');
  await m.fill('#lgPass', 'nouveau1'); await m.click('#lgBtn'); await m.waitForSelector('#app', { state: 'visible' });
  ok(true, 'changement de mot de passe : ancien refusé, nouveau accepté');
  await m.reload(); await m.waitForSelector('#app', { state: 'visible' });
  ok(await m.evaluate(() => __demo.S.me.username) === 'camille.martin', 'session conservée après rechargement');
  await m.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await m.evaluate(() => { location.hash = '#/home'; }); await m.waitForTimeout(300); await shot(m, 'm13-sombre');

  /* ═════════ SDK FIREBASE RÉEL (chargement et validation, sans réseau) ═════════ */
  if (VENDOR) {
    section('SDK Firebase réel (hors démo)');
    const fctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await fctx.route('https://www.gstatic.com/firebasejs/10.7.1/*', r => r.fulfill({ path: path.join(VENDOR, 'firebase', path.basename(new URL(r.request().url()).pathname)), contentType: 'text/javascript' }));
    await fctx.route(/firestore\.googleapis\.com|firebaseinstallations|googleapis\.com/, r => r.abort());
    const f = await fctx.newPage();
    const ferr = []; f.on('pageerror', e => ferr.push(e.message));
    await f.goto(BASE + '/');
    await f.waitForFunction(() => window.firebase && firebase.apps.length === 1, null, { timeout: 15000 });
    ok(true, 'SDK Firebase 10.7.1 chargé et initialisé avec la configuration du projet');
    const v = await f.evaluate(async () => {
      const db = firebase.firestore(), FV = firebase.firestore.FieldValue, out = {};
      const probe = (name, fn) => { try { const p = fn(); if (p && p.catch) p.catch(() => {}); out[name] = 'ok'; } catch (e) { out[name] = e.message; } };
      probe('updateDotted', () => db.collection('schedules').doc('x').update({ 'days.2026-11-12': { hours: 7, type: 'normal', note: '', prev: { hours: 7, type: 'normal', note: '' } }, 'days.2026-11-13': { hours: 0, type: 'repos', note: '' } }));
      probe('updateDelete', () => db.collection('users').doc('x').update({ passwordHash: 'h', password: FV.delete(), mustChangePassword: FV.delete(), updatedAt: FV.serverTimestamp() }));
      probe('ackFieldPath', () => db.collection('announcements').doc('a').update(new firebase.firestore.FieldPath('acknowledgedBy', 'camille.martin'), FV.serverTimestamp()));
      probe('queryIn', () => { const u = db.collection('absenceRequests').where('userId', '==', 'x').onSnapshot(() => {}, () => {}); u(); return null; });
      probe('orderLimit', () => db.collection('snapshots').orderBy('createdAtMs', 'desc').limit(1).get());
      probe('batch', () => { const b = db.batch(); b.delete(db.collection('users').doc('x')); return b.commit(); });
      probe('setDays', () => db.collection('schedules').doc('x').set({ userId: 'x', days: { '2026-11-12': { hours: 7, type: 'CP', note: 'CP approuvé', absenceId: 'r', absType: 'CP', prev: { hours: 7, type: 'normal', note: '', modifiedByUser: true, modifComment: 'x' } } } }));
      return out;
    });
    Object.entries(v).forEach(([k, r]) => ok(r === 'ok', `écriture acceptée par le SDK réel : ${k}${r === 'ok' ? '' : ' → ' + r}`));
    await f.waitForSelector('#lgErr:not(.hidden), #lgUser', { timeout: 30000 });
    ok(ferr.length === 0, 'aucune erreur JavaScript hors démo' + (ferr.length ? ' : ' + ferr[0] : ''));
    await fctx.close();
  }

  console.log(`\n══ ${pass} vérifications réussies, ${fail} échec(s) ══`);
  if (errors.length) { console.log('Erreurs console :'); [...new Set(errors)].forEach(e => console.log('  ' + e)); }
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('ARRÊT :', e.message.split('\n').slice(0, 6).join('\n')); console.log(`(${pass} réussies, ${fail} échec(s) avant l’arrêt)`); process.exit(2); });
