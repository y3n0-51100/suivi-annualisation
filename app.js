/* ═══════════════════════════════════════════════════════════════
   APPLICATION MOBILE — Suivi Annualisation
   Interface dédiée téléphone, branchée sur les mêmes données
   Firestore que l'outil web. Les règles de calcul (heures,
   CP, prorata d'entrée, application au planning) sont identiques.
   ═══════════════════════════════════════════════════════════════ */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBoYVF3gxpnvIkZIi007BQmXdJiOZ3tGT0",
  authDomain: "suivi-annualisation.firebaseapp.com",
  projectId: "suivi-annualisation",
  storageBucket: "suivi-annualisation.firebasestorage.app",
  messagingSenderId: "673966090927",
  appId: "1:673966090927:web:2c2aae68fe847a9e60c25a"
};
const EJS_SERVICE = "service_zyoc9bj";
const EJS_TPL_REQ = "template_qhe6l14";
const EJS_TPL_RESP = "template_q9b7vac";
const EJS_PUBLIC_KEY = "HrKWUniM8t71ICAlu";
const MANAGER_EMAIL = "remi.schaffhauser@but.fr";
const APP_URL = "https://annualisation.pages.dev";

const HOURS_TARGET = 1607;
const PERIOD_START = '2026-06-01';
const PERIOD_END   = '2027-05-31';
const MONTHS = [
  {name:'Juin',      year:2026, month:5},  {name:'Juillet',   year:2026, month:6},
  {name:'Août',      year:2026, month:7},  {name:'Septembre', year:2026, month:8},
  {name:'Octobre',   year:2026, month:9},  {name:'Novembre',  year:2026, month:10},
  {name:'Décembre',  year:2026, month:11}, {name:'Janvier',   year:2027, month:0},
  {name:'Février',   year:2027, month:1},  {name:'Mars',      year:2027, month:2},
  {name:'Avril',     year:2027, month:3},  {name:'Mai',       year:2027, month:4}
];
const DAYS_KEY   = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const DOW_SHORT  = ['D','L','M','M','J','V','S'];
const DOW_LONG   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
// Types décomptés comme absence (non travaillés) — identique à l'outil web
const ABS_EXCL = new Set(['CP','CP Ancienneté','Récupération','Événement Familial','Autre']);

const TYPES = {
  'CP':                 {ic:'sun',   cls:'i-amber',  unit:'jour(s)', hint:'Jours ouvrés posés (lundi → samedi)'},
  'CP Ancienneté':      {ic:'star',  cls:'i-violet', unit:'jour(s)', hint:'Jours supplémentaires liés à votre ancienneté'},
  'Récupération':       {ic:'clock', cls:'i-green',  unit:'heures',  hint:'Heures de récupération à déduire du planning'},
  'Événement Familial': {ic:'heart', cls:'i-red',    unit:'heures',  hint:'Mariage, naissance, décès…'},
  'Maladie':            {ic:'pulse', cls:'i-blue',   unit:'jour(s)', hint:'Nombre de jours d’arrêt'},
  'Formation':          {ic:'book',  cls:'i-navy',   unit:'heures',  hint:'Formation interne ou externe'},
  'Autre':              {ic:'dots',  cls:'i-navy',   unit:'heures',  hint:'Autre motif — précisez en commentaire'}
};

/* ─── État ─── */
let db = null;
let me = null;              // utilisateur connecté
let mySchedule = {};        // planning du collaborateur connecté
let myRequests = [];        // mes demandes
let allUsers = [];
let allRequests = [];       // toutes les demandes (admin)
let holidays = {}, openSundays = {}, lockedMonths = {};
let planMonth = 0;          // index du mois affiché
let absFilter = 'all';      // filtre de la liste des demandes
let teamFilter = 'pending'; // filtre admin
let draft = {};             // brouillon de demande en cours

/* ─── Icônes (jeu maison, tracé unique) ─── */
const ICONS = {
  home:'<path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  leave:'<path d="M4 20V9a2 2 0 012-2h12a2 2 0 012 2v11"/><path d="M9 7V4h6v3"/><path d="M4 14h16"/>',
  team:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a6 6 0 0112 0v1"/><path d="M16.5 5.6a3.2 3.2 0 010 5.8"/><path d="M18 20v-1a6 6 0 00-2-4.4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  heart:'<path d="M12 20s-7-4.4-7-9.3A4 4 0 0112 8a4 4 0 017 2.7C19 15.6 12 20 12 20z"/>',
  pulse:'<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
  book:'<path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H19v3H6.5"/>',
  dots:'<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
  chart:'<path d="M3 20V10M9 20V4M15 20v-7M21 20V8"/>',
  check:'<path d="M4.5 12.5l5 5 10-11"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  left:'<path d="M15 5l-7 7 7 7"/>',
  right:'<path d="M9 5l7 7-7 7"/>',
  chev:'<path d="M9 5l7 7-7 7"/>',
  bell:'<path d="M18 15V10a6 6 0 10-12 0v5l-2 3h16z"/><path d="M10 21h4"/>',
  refresh:'<path d="M20 11a8 8 0 10-1.5 5.7"/><path d="M20 5v6h-6"/>',
  logout:'<path d="M14 8V5H5v14h9v-3"/><path d="M10 12h10M17 8.5l3.5 3.5L17 15.5"/>',
  archive:'<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M5 8.5V20h14V8.5"/><path d="M10 13h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.6"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
  send:'<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8z"/>',
  flag:'<path d="M5 21V4h13l-2.5 4L18 12H5"/>'
};
function ic(n, size = 22, sw = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
}

/* ─── Helpers ─── */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayKey = () => key(new Date());
const disp = s => s ? s.split('-').reverse().join('/') : '';
const num = n => Number.isInteger(n) ? n : parseFloat(Number(n).toFixed(1));
const uid = () => me?.username || me?.id || '';
const isAdmin = () => me?.role === 'admin';

function toast(msg, kind = 'info') {
  const t = $('toast');
  const icons = {ok:'check', err:'x', warn:'info', info:'info'};
  t.className = kind === 'success' ? 'ok' : kind === 'error' ? 'err' : kind;
  t.innerHTML = ic(icons[t.className] || 'info', 19, 2.4) + `<span>${esc(msg)}</span>`;
  t.classList.add('on');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('on'), 3400);
}

function openSheet(id, html) {
  if (html !== undefined) $(id).innerHTML = html;
  $('sheetBg').classList.add('on');
  $(id).classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeSheets() {
  ['sheetDay','sheetReq','sheetProfile'].forEach(i => $(i).classList.remove('on'));
  $('sheetBg').classList.remove('on');
  document.body.style.overflow = '';
}
function sheetShell(title, body, iconName = 'info') {
  return `<div class="sheet-grip"></div>
    <div class="sheet-hd">
      <div class="row-ic i-navy" style="width:34px;height:34px;border-radius:11px">${ic(iconName, 18, 2.2)}</div>
      <h3>${title}</h3>
      <button class="close-b" onclick="closeSheets()">${ic('x', 17, 2.6)}</button>
    </div>
    <div class="sheet-bd">${body}</div>`;
}

/* ─── Règles métier (identiques à l'outil web) ─── */
const worked = d => !ABS_EXCL.has(d?.type);
const entryKey = u => {
  const s = String(u?.dateEntree || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s > PERIOD_START ? s : '';
};
const daysInclusive = (a, b) =>
  Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000) + 1;
function contractTarget(u) { return u?.isCadre ? (u?.daysTarget || 218) : (u?.hoursTarget || HOURS_TARGET); }
function effectiveTarget(u) {
  const ek = entryKey(u);
  if (!ek) return contractTarget(u);
  if (ek > PERIOD_END) return 0;
  const ratio = daysInclusive(ek, PERIOD_END) / daysInclusive(PERIOD_START, PERIOD_END);
  const full = contractTarget(u);
  return u?.isCadre ? Math.round(full * ratio * 2) / 2 : Math.round(full * ratio);
}
function yearTotal(sched) {
  return Object.values(sched || {}).reduce((s, d) => s + (worked(d) ? (parseFloat(d.hours) || 0) : 0), 0);
}
function monthTotal(sched, m) {
  let t = 0;
  const n = new Date(m.year, m.month + 1, 0).getDate();
  for (let i = 1; i <= n; i++) {
    const e = sched[key(new Date(m.year, m.month, i))];
    if (worked(e)) t += parseFloat(e?.hours) || 0;
  }
  return t;
}
function cpStats(sched) {
  let days = 0, daysAnc = 0;
  Object.values(sched || {}).forEach(d => {
    if (d.type === 'CP') days++;
    if (d.type === 'CP Ancienneté') daysAnc++;
  });
  return {days, daysAnc};
}
function workingDays(a, b) {
  let n = 0;
  const cur = new Date(a), end = new Date(b);
  while (cur <= end) { if (cur.getDay() !== 0) n++; cur.setDate(cur.getDate() + 1); }
  return n;
}
function statusLabel(s) {
  return {pending:'En attente', cancel_pending:'Annulation demandée', approved:'Approuvée',
          rejected:'Refusée', waiting:'En cours', cancelled:'Annulée', archived:'Archivée'}[s] || s;
}
// Une absence reste annulable si elle est approuvée / en cours, ou archivée
// alors que la date concernée est aujourd'hui ou à venir.
function canCancel(r) {
  if (!r) return false;
  if (r.status === 'approved' || r.status === 'waiting') return true;
  if (r.status !== 'archived') return false;
  const prev = r.previousStatus || '';
  if (prev !== 'approved' && prev !== 'waiting') return false;
  return (r.dateEnd || r.date || '') >= todayKey();
}

/* ─── Démarrage ─── */
async function boot() {
  try { emailjs.init(EJS_PUBLIC_KEY); } catch (e) { console.warn('EmailJS', e); }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
  } catch (e) {
    $('splash').classList.add('hidden');
    $('login').classList.remove('hidden');
    showLoginError('Connexion impossible. Vérifiez votre réseau puis relancez l’application.');
    return;
  }
  const saved = localStorage.getItem('appUser');
  if (saved) {
    try { me = JSON.parse(saved); await enterApp(); return; } catch (e) { localStorage.removeItem('appUser'); }
  }
  $('splash').classList.add('hidden');
  $('login').classList.remove('hidden');
}

function showLoginError(msg) {
  const el = $('loginErr');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function doLogin() {
  const u = $('lgUser').value.trim();
  const p = $('lgPass').value;
  const btn = $('lgBtn');
  $('loginErr').classList.add('hidden');
  if (!u || !p) { showLoginError('Renseignez votre identifiant et votre mot de passe.'); return; }
  btn.disabled = true;
  btn.innerHTML = '<div class="spin"></div>';
  try {
    let data = null;
    const snap = await db.collection('users').where('username', '==', u).limit(1).get();
    if (!snap.empty) data = snap.docs[0].data();
    else {
      const direct = await db.collection('users').doc(u).get();
      if (direct.exists) data = direct.data();
    }
    if (!data || data.password !== p) {
      showLoginError('Identifiant ou mot de passe incorrect.');
      return;
    }
    me = data;
    localStorage.setItem('appUser', JSON.stringify(me));
    $('login').classList.add('hidden');
    await enterApp();
  } catch (e) {
    console.error(e);
    showLoginError('Erreur de connexion au serveur. Réessayez.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Se connecter</span>' + ic('right', 19, 2.4);
  }
}

function logout() {
  localStorage.removeItem('appUser');
  location.reload();
}

async function enterApp() {
  $('splash').classList.remove('hidden');
  await loadAll();
  $('splash').classList.add('hidden');
  $('login').classList.add('hidden');
  $('app').style.display = 'block';
  buildNav();
  planMonth = Math.max(0, MONTHS.findIndex(m => {
    const n = new Date();
    return m.year === n.getFullYear() && m.month === n.getMonth();
  }));
  paintHeader();
  go('home');
}

async function loadAll() {
  const jobs = [
    db.collection('schedules').doc(uid()).get().then(d => { mySchedule = d.exists ? (d.data().days || {}) : {}; }),
    db.collection('absenceRequests').where('userId', '==', uid()).get()
      .then(s => { myRequests = s.docs.map(d => ({id: d.id, ...d.data()}))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); }),
    db.collection('settings').doc('holidays').get().then(d => { holidays = d.exists ? (d.data().list || {}) : {}; }),
    db.collection('settings').doc('openSundays').get().then(d => { openSundays = d.exists ? (d.data().list || {}) : {}; }),
    db.collection('settings').doc('lockedMonths').get().then(d => { lockedMonths = d.exists ? (d.data().list || {}) : {}; })
  ];
  if (isAdmin()) {
    jobs.push(db.collection('users').get().then(s => { allUsers = s.docs.map(d => d.data()); }));
    jobs.push(db.collection('absenceRequests').get().then(s => {
      allRequests = s.docs.map(d => ({id: d.id, ...d.data()}))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }));
  }
  try { await Promise.all(jobs); } catch (e) { console.error('load', e); toast('Certaines données n’ont pas pu être chargées.', 'warn'); }
}

async function refresh(silent) {
  await loadAll();
  paintHeader();
  render();
  if (!silent) toast('Données à jour', 'success');
}

/* ─── En-tête et navigation ─── */
function paintHeader() {
  const h = new Date().getHours();
  const hello = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  const first = (me.name || '').split(' ')[0];
  $('hdAvatar').textContent = (me.name || '?').charAt(0).toUpperCase();
  $('hdTitle').textContent = `${hello}, ${first}`;
  $('hdSub').textContent = isAdmin() ? 'Espace administrateur' : (me.matricule ? `Matricule ${me.matricule}` : 'Collaborateur');
  const pend = isAdmin()
    ? allRequests.filter(r => r.status === 'pending' || r.status === 'cancel_pending').length
    : myRequests.filter(r => r.status === 'pending' || r.status === 'cancel_pending').length;
  const b = $('hdBadge');
  b.textContent = pend;
  b.classList.toggle('hidden', !pend);
}

const TABS = [
  {id:'home', label:'Accueil',  icon:'home'},
  {id:'plan', label:'Planning', icon:'cal'},
  {id:'abs',  label:'Absences', icon:'leave'}
];
function buildNav() {
  const tabs = TABS.concat(isAdmin()
    ? [{id:'team', label:'Équipe', icon:'team'}]
    : [{id:'team', label:'Profil', icon:'user'}]);
  $('nav').innerHTML = tabs.map(t =>
    `<button data-tab="${t.id}" onclick="go('${t.id}')">
       <span class="nb">${ic(t.icon, 21, 2)}</span><span>${t.label}</span>
     </button>`).join('');
}

let current = 'home';
function go(tab) {
  current = tab;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
  $('sc-' + tab).classList.add('on');
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('fab').classList.toggle('hidden', tab !== 'abs');
  window.scrollTo({top: 0});
  render();
}
function render() {
  if (current === 'home') paintHome();
  if (current === 'plan') paintPlan();
  if (current === 'abs') paintAbs();
  if (current === 'team') isAdmin() ? paintTeam() : paintProfileScreen();
}

document.addEventListener('DOMContentLoaded', boot);

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 1 — ACCUEIL
   ═══════════════════════════════════════════════════════════════ */
function paintHome() {
  const cadre = !!me.isCadre;
  const target = effectiveTarget(me);
  const doneRaw = yearTotal(mySchedule);
  const done = cadre ? doneRaw / 2 : doneRaw;
  const unit = cadre ? 'j' : 'h';
  const diff = done - target;
  const over = diff > 0;
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  const cp = cpStats(mySchedule);
  const cpLeft = Math.max(0, (me.cpDays || 25) - cp.days);
  const cpAncLeft = Math.max(0, (me.cpAnciennete || 0) - cp.daysAnc);
  const waiting = myRequests.filter(r => r.status === 'pending' || r.status === 'cancel_pending').length;
  const next = nextAbsence();

  // Anneau de progression
  const R = 46, C = 2 * Math.PI * R;
  const ring = `
    <div class="ring">
      <svg width="104" height="104">
        <circle cx="52" cy="52" r="${R}" stroke="rgba(255,255,255,.16)" stroke-width="9" fill="none"/>
        <circle cx="52" cy="52" r="${R}" stroke="${over ? '#34D399' : '#FB923C'}" stroke-width="9" fill="none"
          stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C - (C * pct / 100)}"/>
      </svg>
      <div class="ring-txt">
        <div class="ring-pct">${pct}%</div>
        <div class="ring-sub">de l’objectif</div>
      </div>
    </div>`;

  const adminBlock = isAdmin() ? adminHomeBlock() : '';

  $('sc-home').innerHTML = `
    <div class="ring-card">
      ${ring}
      <div class="ring-info">
        <div class="k">Heures réalisées</div>
        <div class="v">${num(done)}<span style="font-size:15px;font-weight:700;color:#9BB0D0"> / ${num(target)} ${unit}</span></div>
        <div class="d ${over ? 'up' : ''}">
          ${ic(over ? 'check' : 'clock', 14, 2.6)}
          ${over ? `+${num(diff)} ${unit} de récup` : `${num(target - done)} ${unit} restantes`}
        </div>
      </div>
    </div>

    <div class="tiles">
      <button class="tile" onclick="go('abs')">
        <div class="tile-ic i-amber">${ic('sun', 20, 2.2)}</div>
        <div><div class="tile-v">${cpLeft}</div><div class="tile-l">CP restants sur ${me.cpDays || 25}</div></div>
      </button>
      <button class="tile" onclick="go('abs')">
        <div class="tile-ic i-violet">${ic('star', 20, 2.2)}</div>
        <div><div class="tile-v">${cpAncLeft}</div><div class="tile-l">CP ancienneté restants</div></div>
      </button>
      <button class="tile" onclick="go('abs')">
        <div class="tile-ic ${waiting ? 'i-orange' : 'i-navy'}">${ic('bell', 20, 2.2)}</div>
        <div><div class="tile-v">${waiting}</div><div class="tile-l">Demande${waiting > 1 ? 's' : ''} en attente</div></div>
      </button>
      <button class="tile" onclick="go('plan')">
        <div class="tile-ic i-green">${ic('clock', 20, 2.2)}</div>
        <div><div class="tile-v">${num(monthTotal(mySchedule, MONTHS[planMonth]))}</div>
        <div class="tile-l">Heures en ${MONTHS[planMonth].name.toLowerCase()}</div></div>
      </button>
    </div>

    ${next ? `
    <div class="sec-t">Prochaine absence</div>
    <div class="card">
      <button class="row" onclick="openRequest('${next.id}')">
        <div class="row-ic ${TYPES[next.type]?.cls || 'i-navy'}">${ic(TYPES[next.type]?.ic || 'leave', 19, 2.2)}</div>
        <div class="row-b">
          <div class="row-t">${esc(next.type)}</div>
          <div class="row-s">${esc(next.dateLabel || disp(next.date))} · ${esc(next.qLabel || next.hours + 'h')}</div>
        </div>
        <span class="pill p-${next.status}">${statusLabel(next.status)}</span>
      </button>
    </div>` : ''}

    <div class="sec-t">Ma semaine <span class="more" onclick="go('plan')">Voir le mois</span></div>
    <div class="week">${weekStrip()}</div>

    ${adminBlock}

    <div style="height:20px"></div>`;
}

// Prochaine absence validée ou en attente à partir d'aujourd'hui
function nextAbsence() {
  const t = todayKey();
  return myRequests
    .filter(r => ['approved', 'waiting', 'pending', 'cancel_pending'].includes(r.status))
    .filter(r => (r.dateEnd || r.date) >= t)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
}

// Bandeau des 7 jours autour d'aujourd'hui
function weekStrip() {
  const out = [];
  const base = new Date(); base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() - 2);
  for (let i = 0; i < 9; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i);
    const k = key(d), e = mySchedule[k] || {};
    const h = parseFloat(e.hours) || 0;
    const isAbs = e.type && e.type !== 'normal' && e.type !== 'repos';
    const cls = ['wd'];
    if (k === todayKey()) cls.push('today');
    if (isAbs) cls.push('abs');
    if (!h && !isAbs) cls.push('off');
    out.push(`<div class="${cls.join(' ')}">
      <div class="n">${DOW_SHORT[d.getDay()]}</div>
      <div class="d">${d.getDate()}</div>
      <div class="h">${isAbs ? (TYPES[e.type] ? e.type.slice(0, 3) : 'abs') : (h ? num(h) + 'h' : '—')}</div>
    </div>`);
  }
  return out.join('');
}

// Raccourci administrateur sur l'accueil
function adminHomeBlock() {
  const pend = allRequests.filter(r => r.status === 'pending').length;
  const cancels = allRequests.filter(r => r.status === 'cancel_pending').length;
  if (!pend && !cancels) {
    return `<div class="sec-t">Équipe</div>
      <div class="card"><div class="row">
        <div class="row-ic i-green">${ic('check', 19, 2.4)}</div>
        <div class="row-b"><div class="row-t">Rien à traiter</div>
        <div class="row-s">Toutes les demandes de l’équipe sont à jour.</div></div>
      </div></div>`;
  }
  return `<div class="sec-t">À traiter <span class="more" onclick="go('team')">Tout voir</span></div>
    <div class="tiles">
      <button class="tile" onclick="teamFilter='pending';go('team')">
        <div class="tile-ic i-orange">${ic('bell', 20, 2.2)}</div>
        <div><div class="tile-v">${pend}</div><div class="tile-l">Demande${pend > 1 ? 's' : ''} à valider</div></div>
      </button>
      <button class="tile" onclick="teamFilter='cancel_pending';go('team')">
        <div class="tile-ic i-red">${ic('refresh', 20, 2.2)}</div>
        <div><div class="tile-v">${cancels}</div><div class="tile-l">Annulation${cancels > 1 ? 's' : ''} demandée${cancels > 1 ? 's' : ''}</div></div>
      </button>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 2 — PLANNING
   ═══════════════════════════════════════════════════════════════ */
function paintPlan() {
  const m = MONTHS[planMonth];
  const first = new Date(m.year, m.month, 1);
  const nbDays = new Date(m.year, m.month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // grille démarrant le lundi
  const locked = !!lockedMonths[planMonth];

  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cd empty"></div>';
  for (let d = 1; d <= nbDays; d++) {
    const date = new Date(m.year, m.month, d);
    const k = key(date);
    const e = mySchedule[k] || {};
    const h = parseFloat(e.hours) || 0;
    const isAbs = e.type && e.type !== 'normal' && e.type !== 'repos';
    const cls = ['cd'];
    if (holidays[k]) cls.push('holi');
    else if (isAbs) cls.push('abs');
    else if (h > 0) cls.push('work');
    else cls.push('off');
    if (k === todayKey()) cls.push('today');
    cells += `<button class="${cls.join(' ')}" onclick="openDay('${k}')">
      <span class="n">${d}</span>
      <span class="h">${holidays[k] ? 'fér.' : isAbs ? (e.type || '').slice(0, 3).toLowerCase() : (h ? num(h) : '—')}</span>
    </button>`;
  }

  const total = monthTotal(mySchedule, m);
  // Toute journée non travaillée « normalement » : congés, maladie, formation…
  const prefix = `${m.year}-${String(m.month + 1).padStart(2, '0')}`;
  const absCount = Object.keys(mySchedule).filter(k => {
    const t = mySchedule[k]?.type;
    return k.startsWith(prefix) && t && t !== 'normal' && t !== 'repos';
  }).length;

  $('sc-plan').innerHTML = `
    <div class="cal-head">
      <button class="cal-nav" onclick="moveMonth(-1)" ${planMonth === 0 ? 'disabled' : ''}>${ic('left', 18, 2.4)}</button>
      <div class="m">${m.name} ${m.year}</div>
      <button class="cal-nav" onclick="moveMonth(1)" ${planMonth === 11 ? 'disabled' : ''}>${ic('right', 18, 2.4)}</button>
    </div>

    <div class="tiles">
      <div class="tile">
        <div class="tile-ic i-green">${ic('clock', 20, 2.2)}</div>
        <div><div class="tile-v">${num(total)}h</div><div class="tile-l">Travaillées ce mois</div></div>
      </div>
      <div class="tile">
        <div class="tile-ic i-amber">${ic('leave', 20, 2.2)}</div>
        <div><div class="tile-v">${absCount}</div><div class="tile-l">Jour${absCount > 1 ? 's' : ''} d’absence</div></div>
      </div>
    </div>

    ${locked ? `<div class="notice soft">${ic('archive', 17, 2.2)}<div><b>Mois clôturé.</b> Les heures ne sont plus modifiables.</div></div><div style="height:12px"></div>` : ''}

    <div class="cal">
      <div class="cal-dow">${['L','M','M','J','V','S','D'].map(d => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-foot">
        <span class="lg"><i style="background:#A7E0C8"></i>Travaillé</span>
        <span class="lg"><i style="background:#FCD9BD"></i>Absence</span>
        <span class="lg"><i style="background:#DDD3FB"></i>Férié</span>
        <span class="lg"><i style="background:#E2E8F0"></i>Repos</span>
      </div>
    </div>
    <div style="height:24px"></div>`;
}

function moveMonth(step) {
  planMonth = Math.min(11, Math.max(0, planMonth + step));
  paintPlan();
}

/* Feuille de détail d'une journée — saisie des heures possible */
function openDay(k) {
  const e = mySchedule[k] || {};
  const d = new Date(k + 'T12:00:00');
  const locked = !!lockedMonths[MONTHS.findIndex(m => m.year === d.getFullYear() && m.month === d.getMonth())];
  const holi = holidays[k];
  const sunOpen = openSundays[k];
  const h = parseFloat(e.hours) || 0;
  const isAbs = ABS_EXCL.has(e.type) || (e.type && e.type !== 'normal' && e.type !== 'repos');

  const body = `
    <div style="text-align:center;padding:4px 0 16px">
      <div style="font-size:34px;font-weight:800;letter-spacing:-1.4px">${d.getDate()} ${MONTHS.find(m => m.month === d.getMonth())?.name || ''}</div>
      <div style="color:var(--ink2);font-weight:600;margin-top:2px">${DOW_LONG[d.getDay()]} ${d.getFullYear()}</div>
    </div>

    ${holi ? `<div class="notice info">${ic('flag', 17, 2.2)}<div><b>Jour férié :</b> ${esc(holi.name || '')}</div></div>` : ''}
    ${sunOpen ? `<div class="notice info">${ic('sun', 17, 2.2)}<div><b>Dimanche ouvert :</b> ${esc(sunOpen.note || '')}</div></div>` : ''}
    ${isAbs ? `<div class="notice warn">${ic('leave', 17, 2.2)}<div><b>${esc(e.type)}</b>${e.note ? '<br>' + esc(e.note) : ''}</div></div>` : ''}

    ${locked
      ? `<div class="notice soft">${ic('archive', 17, 2.2)}<div>Mois clôturé par l’administration : la saisie est bloquée.</div></div>`
      : isAbs
        ? `<div class="notice soft">${ic('info', 17, 2.2)}<div>Cette journée provient d’une demande d’absence validée. Pour la modifier, passez par une demande d’annulation.</div></div>`
        : `<div class="f-lbl">Heures travaillées</div>
           <input class="f-in" id="dayHours" type="number" inputmode="decimal" step="0.5" min="0" max="14"
             value="${h || ''}" placeholder="0">
           <div class="hint">Laissez vide ou 0 pour un jour de repos.</div>
           <div class="acts">
             <button class="btn b-ghost" onclick="closeSheets()">Annuler</button>
             <button class="btn b-navy" onclick="saveDay('${k}')">${ic('check', 18, 2.6)} Enregistrer</button>
           </div>`}
    <div style="height:8px"></div>`;

  openSheet('sheetDay', sheetShell('Journée', body, 'cal'));
}

async function saveDay(k) {
  const v = parseFloat($('dayHours').value) || 0;
  if (v < 0 || v > 14) { toast('Saisissez entre 0 et 14 heures.', 'error'); return; }
  mySchedule[k] = {hours: v, type: v > 0 ? 'normal' : 'repos', note: ''};
  try {
    await db.collection('schedules').doc(uid()).update({days: mySchedule});
    closeSheets();
    toast('Journée enregistrée', 'success');
    paintPlan();
  } catch (e) {
    console.error(e);
    toast('Enregistrement impossible.', 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 3 — MES ABSENCES
   ═══════════════════════════════════════════════════════════════ */
const ABS_FILTERS = [
  {id:'all',      label:'Toutes'},
  {id:'active',   label:'En cours'},
  {id:'approved', label:'Validées'},
  {id:'archived', label:'Archivées'}
];

function paintAbs() {
  let list = myRequests.slice();
  if (absFilter === 'active')   list = list.filter(r => ['pending','waiting','cancel_pending'].includes(r.status));
  if (absFilter === 'approved') list = list.filter(r => r.status === 'approved');
  if (absFilter === 'archived') list = list.filter(r => r.status === 'archived');
  if (absFilter === 'all')      list = list.filter(r => r.status !== 'archived');

  const chips = ABS_FILTERS.map(f => {
    const n = f.id === 'all' ? myRequests.filter(r => r.status !== 'archived').length
      : f.id === 'active' ? myRequests.filter(r => ['pending','waiting','cancel_pending'].includes(r.status)).length
      : myRequests.filter(r => r.status === f.id).length;
    return `<button class="chip ${absFilter === f.id ? 'on' : ''}" onclick="absFilter='${f.id}';paintAbs()">
      ${f.label}${n ? ` · ${n}` : ''}</button>`;
  }).join('');

  const cp = cpStats(mySchedule);
  const cpLeft = Math.max(0, (me.cpDays || 25) - cp.days);

  $('sc-abs').innerHTML = `
    <div class="tiles">
      <div class="tile">
        <div class="tile-ic i-amber">${ic('sun', 20, 2.2)}</div>
        <div><div class="tile-v">${cpLeft}</div><div class="tile-l">CP encore disponibles</div></div>
      </div>
      <div class="tile">
        <div class="tile-ic i-navy">${ic('leave', 20, 2.2)}</div>
        <div><div class="tile-v">${myRequests.filter(r => r.status !== 'archived').length}</div>
        <div class="tile-l">Demandes cette période</div></div>
      </div>
    </div>
    <div class="chips">${chips}</div>
    ${list.length ? `<div class="card">${list.map(reqRow).join('')}</div>`
      : `<div class="empty">
           <div class="e-ic">${ic('leave', 28, 1.9)}</div>
           <h4>Aucune demande</h4>
           <p>Appuyez sur « Demander » pour poser un congé, une récupération ou signaler une absence.</p>
         </div>`}
    <div style="height:90px"></div>`;
}

function reqRow(r) {
  const t = TYPES[r.type] || {ic:'leave', cls:'i-navy'};
  const flag = r.status === 'cancel_pending' ? ' · annulation demandée'
    : (r.status === 'archived' && canCancel(r)) ? ' · encore annulable' : '';
  return `<button class="row" onclick="openRequest('${r.id}')">
    <div class="row-ic ${t.cls}">${ic(t.ic, 19, 2.2)}</div>
    <div class="row-b">
      <div class="row-t">${esc(r.type)}</div>
      <div class="row-s">${esc(r.dateLabel || disp(r.date))} · ${esc(r.qLabel || r.hours + 'h')}${flag}</div>
    </div>
    <span class="pill p-${r.status}">${statusLabel(r.status)}</span>
  </button>`;
}

/* Détail d'une demande + actions du collaborateur */
function openRequest(id) {
  const r = myRequests.find(x => x.id === id) || allRequests.find(x => x.id === id);
  if (!r) return;
  const t = TYPES[r.type] || {ic:'leave', cls:'i-navy'};

  let actions = '';
  if (canCancel(r)) {
    actions = `${r.status === 'archived' ? `<div class="notice soft">${ic('archive', 17, 2.2)}
        <div><b>Demande archivée.</b> L’absence n’a pas encore eu lieu : vous pouvez toujours en demander l’annulation.</div></div>` : ''}
      <div class="f-lbl">Motif de l’annulation (facultatif)</div>
      <textarea class="f-in" id="cancelReason" rows="3" placeholder="Expliquez brièvement pourquoi…"></textarea>
      <div class="notice info">${ic('info', 17, 2.2)}<div>Votre responsable est prévenu par e-mail. Dès acceptation, votre planning d’origine est rétabli automatiquement.</div></div>
      <div class="acts">
        <button class="btn b-ghost" onclick="closeSheets()">Fermer</button>
        <button class="btn b-soft-red" id="btnCancelReq" onclick="sendCancel('${r.id}')">${ic('refresh', 18, 2.4)} Demander l’annulation</button>
      </div>`;
  } else if (r.status === 'pending') {
    actions = `<div class="notice info">${ic('clock', 17, 2.2)}<div>Demande transmise, en attente de validation par votre responsable.</div></div>
      <div class="acts">
        <button class="btn b-ghost" onclick="closeSheets()">Fermer</button>
        <button class="btn b-soft-red" onclick="dropPending('${r.id}')">${ic('x', 18, 2.4)} Retirer la demande</button>
      </div>`;
  } else if (r.status === 'cancel_pending') {
    actions = `<div class="notice warn">${ic('refresh', 17, 2.2)}
        <div><b>Annulation en cours de traitement.</b>${r.cancelReason ? '<br>Motif : ' + esc(r.cancelReason) : ''}</div></div>
      <div class="acts"><button class="btn b-ghost" onclick="closeSheets()">Fermer</button></div>`;
  } else {
    actions = `<div class="acts"><button class="btn b-ghost" onclick="closeSheets()">Fermer</button></div>`;
  }

  const body = `
    <div style="display:flex;align-items:center;gap:13px;padding:2px 0 16px">
      <div class="tile-ic ${t.cls}" style="width:46px;height:46px;border-radius:15px">${ic(t.ic, 24, 2.2)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:19px;font-weight:800;letter-spacing:-.4px">${esc(r.type)}</div>
        <div style="color:var(--ink2);font-size:13.5px;font-weight:600">${esc(r.qLabel || r.hours + 'h')}</div>
      </div>
      <span class="pill p-${r.status}">${statusLabel(r.status)}</span>
    </div>
    <div class="card">
      <div class="row"><div class="row-b"><div class="row-s">Période</div>
        <div class="row-t">${esc(r.dateLabel || disp(r.date))}</div></div></div>
      ${r.comment ? `<div class="row"><div class="row-b"><div class="row-s">Commentaire</div>
        <div class="row-t" style="font-weight:600;font-size:14px">${esc(r.comment)}</div></div></div>` : ''}
      <div class="row"><div class="row-b"><div class="row-s">Demandé le</div>
        <div class="row-t">${r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('fr-FR') : '—'}</div></div></div>
    </div>
    ${actions}
    <div style="height:8px"></div>`;

  openSheet('sheetReq', sheetShell('Ma demande', body, t.ic));
}

async function sendCancel(id) {
  const r = myRequests.find(x => x.id === id);
  if (!r) return;
  const reason = ($('cancelReason')?.value || '').trim();
  const btn = $('btnCancelReq');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin" style="border-color:rgba(185,28,28,.3);border-top-color:#B91C1C"></div>'; }
  try {
    const upd = {
      status: 'cancel_pending',
      previousStatus: r.status || 'approved',
      cancelReason: reason,
      cancelRequestedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    // Conserve le statut d'avant archivage pour pouvoir restaurer en cas de refus
    if (r.status === 'archived') upd.archivedPreviousStatus = r.previousStatus || 'approved';
    await db.collection('absenceRequests').doc(id).update(upd);
    try {
      emailjs.send(EJS_SERVICE, EJS_TPL_REQ, {
        to_email: MANAGER_EMAIL, reply_to: r.userEmail,
        subject: `Demande d'annulation d'absence — ${r.userName} — ${r.type}`,
        employee_name: r.userName,
        status_message:
          `🔄 DEMANDE D'ANNULATION D'ABSENCE (depuis l'application mobile)\n\n` +
          `Collaborateur : ${r.userName}\nType : ${r.type}\n` +
          `Date(s) : ${r.dateLabel || disp(r.date)}\nDurée : ${r.qLabel || r.hours + 'h'}\n` +
          `Motif d'annulation : ${reason || 'Non précisé'}\n\n` +
          `Traitez la demande ici : ${APP_URL}`,
        request_id: r.id, manager_url: `${APP_URL}/?page=manager-requests`
      });
    } catch (e) { console.warn('EmailJS', e); }
    closeSheets();
    toast('Demande d’annulation envoyée', 'success');
    await refresh(true);
  } catch (e) {
    console.error(e);
    toast('Envoi impossible. Réessayez.', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Demander l’annulation'; }
  }
}

async function dropPending(id) {
  try {
    await db.collection('absenceRequests').doc(id).update({
      status: 'cancelled', cancelApproved: false,
      cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeSheets();
    toast('Demande retirée', 'success');
    await refresh(true);
  } catch (e) { console.error(e); toast('Action impossible.', 'error'); }
}

/* ─── Nouvelle demande ─── */
function openNewRequest() {
  draft = {type: '', start: '', end: '', qty: '', comment: ''};
  renderNewRequest();
}

function renderNewRequest() {
  const t = draft.type ? TYPES[draft.type] : null;
  const body = `
    <div class="f-lbl">Type de demande</div>
    <div class="type-grid">
      ${Object.keys(TYPES).map(k => `
        <button class="type-b ${draft.type === k ? 'on' : ''}" onclick="pickType('${k.replace(/'/g, "\\'")}')">
          <span class="ti ${TYPES[k].cls}">${ic(TYPES[k].ic, 17, 2.2)}</span>
          <span>${k}</span>
        </button>`).join('')}
    </div>

    ${draft.type ? `
      <div class="f-lbl">Du / au</div>
      <div class="f-two">
        <input class="f-in" type="date" id="nrStart" min="${PERIOD_START}" max="${PERIOD_END}"
          value="${draft.start}" onchange="onDates()">
        <input class="f-in" type="date" id="nrEnd" min="${PERIOD_START}" max="${PERIOD_END}"
          value="${draft.end}" onchange="onDates()">
      </div>

      <div class="f-lbl">Quantité — ${t.unit}</div>
      <input class="f-in" type="number" inputmode="decimal" step="0.5" min="0" id="nrQty"
        value="${draft.qty}" placeholder="Ex : ${t.unit.startsWith('jour') ? '3' : '7'}"
        oninput="draft.qty=this.value">
      <div class="hint">${t.hint}</div>

      <div class="f-lbl">Commentaire (facultatif)</div>
      <textarea class="f-in" rows="3" id="nrComment" placeholder="Précisez si nécessaire…"
        oninput="draft.comment=this.value">${esc(draft.comment)}</textarea>

      <div class="acts">
        <button class="btn b-ghost" onclick="closeSheets()">Annuler</button>
        <button class="btn b-orange" id="nrSend" onclick="submitRequest()">${ic('send', 18, 2.4)} Envoyer</button>
      </div>`
    : `<div class="notice soft" style="margin-top:18px">${ic('info', 17, 2.2)}
        <div>Choisissez d’abord le type de demande.</div></div>`}
    <div style="height:8px"></div>`;

  openSheet('sheetReq', sheetShell('Nouvelle demande', body, 'plus'));
}

function pickType(k) {
  draft.type = k;
  renderNewRequest();
}

// Pré-remplit la quantité en jours ouvrés pour les types comptés à la journée
function onDates() {
  draft.start = $('nrStart').value;
  draft.end = $('nrEnd').value;
  if (draft.start && !draft.end) { draft.end = draft.start; $('nrEnd').value = draft.start; }
  if (draft.start && draft.end && draft.start <= draft.end &&
      ['CP', 'CP Ancienneté', 'Maladie'].includes(draft.type)) {
    draft.qty = String(workingDays(draft.start, draft.end));
    $('nrQty').value = draft.qty;
  }
}

async function submitRequest() {
  const type = draft.type;
  const start = $('nrStart').value, end = $('nrEnd').value || $('nrStart').value;
  const qty = parseFloat($('nrQty').value);
  const comment = ($('nrComment').value || '').trim();

  if (!type || !start) { toast('Choisissez un type et une date.', 'error'); return; }
  if (start > end) { toast('La date de fin doit suivre la date de début.', 'error'); return; }
  if (!qty || qty <= 0) { toast('Indiquez une quantité.', 'error'); return; }
  if (start < PERIOD_START || end > PERIOD_END) { toast('Dates hors période juin 2026 – mai 2027.', 'error'); return; }
  const ek = entryKey(me);
  if (ek && start < ek) { toast(`Vous êtes entré le ${disp(ek)} : rien ne peut être posé avant.`, 'error'); return; }

  // Chevauchement avec une demande déjà déposée
  const clash = myRequests.find(r =>
    ['pending', 'approved', 'waiting', 'cancel_pending'].includes(r.status) &&
    start <= (r.dateEnd || r.date) && end >= r.date);
  if (clash) {
    toast(`Chevauchement avec « ${clash.type} » du ${disp(clash.date)}.`, 'error');
    return;
  }

  const btn = $('nrSend');
  btn.disabled = true;
  btn.innerHTML = '<div class="spin"></div>';

  const byDay = ['CP', 'CP Ancienneté', 'Maladie'].includes(type);
  const id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const req = {
    id, userId: uid(), userName: me.name, userEmail: me.email || '',
    type, date: start, dateEnd: end, hours: qty,
    qLabel: byDay ? qty + ' jour(s)' : qty + 'h',
    dateLabel: start === end ? disp(start) : `du ${disp(start)} au ${disp(end)}`,
    comment, status: 'pending', source: 'mobile',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    await db.collection('absenceRequests').doc(id).set(req);
    try {
      emailjs.send(EJS_SERVICE, EJS_TPL_REQ, {
        to_email: MANAGER_EMAIL, reply_to: req.userEmail,
        subject: `Demande d'absence — ${req.userName} — ${req.type}`,
        employee_name: req.userName,
        status_message:
          `📋 DEMANDE D'ABSENCE (depuis l'application mobile)\n\n` +
          `Collaborateur : ${req.userName}\nType : ${req.type}\n` +
          `Date(s) : ${req.dateLabel}\nDurée : ${req.qLabel}\n` +
          `Commentaire : ${req.comment || 'Aucun'}\n\n` +
          `Traitez la demande ici : ${APP_URL}`,
        approve_url: `${APP_URL}/?action=approve&requestId=${id}`,
        reject_url: `${APP_URL}/?action=reject&requestId=${id}`,
        waiting_url: `${APP_URL}/?action=waiting&requestId=${id}`,
        request_id: id, manager_url: `${APP_URL}/?page=manager-requests`
      });
    } catch (e) { console.warn('EmailJS', e); }
    closeSheets();
    toast('Demande envoyée à votre responsable', 'success');
    await refresh(true);
    go('abs');
  } catch (e) {
    console.error(e);
    toast('Envoi impossible. Réessayez.', 'error');
    btn.disabled = false;
    btn.innerHTML = 'Envoyer';
  }
}

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 4a — ÉQUIPE (administrateur)
   ═══════════════════════════════════════════════════════════════ */
const TEAM_FILTERS = [
  {id:'pending',        label:'À valider'},
  {id:'cancel_pending', label:'Annulations'},
  {id:'approved',       label:'Validées'},
  {id:'all',            label:'Tout'}
];

function paintTeam() {
  let list = allRequests.filter(r => r.status !== 'archived');
  if (teamFilter !== 'all') list = list.filter(r => r.status === teamFilter);
  list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const chips = TEAM_FILTERS.map(f => {
    const n = f.id === 'all' ? allRequests.filter(r => r.status !== 'archived').length
      : allRequests.filter(r => r.status === f.id).length;
    return `<button class="chip ${teamFilter === f.id ? 'on' : ''}" onclick="teamFilter='${f.id}';paintTeam()">
      ${f.label}${n ? ` · ${n}` : ''}</button>`;
  }).join('');

  const pend = allRequests.filter(r => r.status === 'pending').length;
  const cancels = allRequests.filter(r => r.status === 'cancel_pending').length;
  const team = allUsers.filter(u => u.username !== 'admin').length;

  $('sc-team').innerHTML = `
    <div class="tiles">
      <div class="tile">
        <div class="tile-ic ${pend ? 'i-orange' : 'i-green'}">${ic('bell', 20, 2.2)}</div>
        <div><div class="tile-v">${pend}</div><div class="tile-l">À valider</div></div>
      </div>
      <div class="tile">
        <div class="tile-ic ${cancels ? 'i-red' : 'i-navy'}">${ic('refresh', 20, 2.2)}</div>
        <div><div class="tile-v">${cancels}</div><div class="tile-l">Annulations demandées</div></div>
      </div>
      <div class="tile wide">
        <div style="display:flex;align-items:center;gap:12px">
          <div class="tile-ic i-navy">${ic('team', 20, 2.2)}</div>
          <div><div class="tile-v" style="font-size:20px">${team} collaborateurs</div>
          <div class="tile-l">suivis sur la période 2026–2027</div></div>
        </div>
      </div>
    </div>
    <div class="chips">${chips}</div>
    ${list.length ? `<div class="card">${list.map(teamRow).join('')}</div>`
      : `<div class="empty">
           <div class="e-ic">${ic('check', 28, 2.2)}</div>
           <h4>Rien à traiter</h4>
           <p>Aucune demande dans cette catégorie.</p>
         </div>`}
    <div style="height:30px"></div>`;
}

function teamRow(r) {
  const t = TYPES[r.type] || {ic:'leave', cls:'i-navy'};
  return `<button class="row" onclick="openTeamRequest('${r.id}')">
    <div class="row-ic ${t.cls}">${ic(t.ic, 19, 2.2)}</div>
    <div class="row-b">
      <div class="row-t">${esc(r.userName)}</div>
      <div class="row-s">${esc(r.type)} · ${esc(r.dateLabel || disp(r.date))} · ${esc(r.qLabel || r.hours + 'h')}</div>
    </div>
    <span class="pill p-${r.status}">${statusLabel(r.status)}</span>
  </button>`;
}

/* Traitement d'une demande par l'administrateur */
function openTeamRequest(id) {
  const r = allRequests.find(x => x.id === id);
  if (!r) return;
  const t = TYPES[r.type] || {ic:'leave', cls:'i-navy'};
  const isCancel = r.status === 'cancel_pending';

  const actions = isCancel
    ? `<div class="notice warn">${ic('refresh', 17, 2.2)}
         <div><b>Annulation demandée par le collaborateur.</b>
         ${r.cancelReason ? '<br>Motif : ' + esc(r.cancelReason) : '<br>Aucun motif précisé.'}
         ${r.previousStatus === 'archived' ? '<br><i>Demande issue des archives.</i>' : ''}
         <br>En acceptant, le planning revient automatiquement aux heures prévues à l’origine.</div></div>
       <div class="acts">
         <button class="btn b-red" onclick="decideCancel('${r.id}','rejected')">${ic('x', 18, 2.4)} Refuser</button>
         <button class="btn b-green" onclick="decideCancel('${r.id}','approved')">${ic('check', 18, 2.6)} Accepter</button>
       </div>`
    : `<div class="acts">
         <button class="btn b-red" onclick="decide('${r.id}','rejected')">${ic('x', 18, 2.4)} Refuser</button>
         <button class="btn b-green" onclick="decide('${r.id}','approved')">${ic('check', 18, 2.6)} Approuver</button>
       </div>
       <div class="acts" style="margin-top:9px">
         <button class="btn b-ghost" onclick="decide('${r.id}','waiting')">${ic('clock', 18, 2.2)} Mettre en attente</button>
       </div>`;

  const body = `
    <div style="display:flex;align-items:center;gap:13px;padding:2px 0 16px">
      <div class="avatar" style="border-radius:15px">${esc((r.userName || '?').charAt(0).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:19px;font-weight:800;letter-spacing:-.4px">${esc(r.userName)}</div>
        <div style="color:var(--ink2);font-size:13px">${esc(r.userEmail || '')}</div>
      </div>
      <span class="pill p-${r.status}">${statusLabel(r.status)}</span>
    </div>
    <div class="card">
      <div class="row">
        <div class="row-ic ${t.cls}">${ic(t.ic, 19, 2.2)}</div>
        <div class="row-b"><div class="row-t">${esc(r.type)}</div>
        <div class="row-s">${esc(r.qLabel || r.hours + 'h')}</div></div>
      </div>
      <div class="row"><div class="row-b"><div class="row-s">Période</div>
        <div class="row-t">${esc(r.dateLabel || disp(r.date))}</div></div></div>
      ${r.comment ? `<div class="row"><div class="row-b"><div class="row-s">Commentaire</div>
        <div class="row-t" style="font-weight:600;font-size:14px">${esc(r.comment)}</div></div></div>` : ''}
    </div>
    ${actions}
    <div style="height:8px"></div>`;

  openSheet('sheetReq', sheetShell('Demande de l’équipe', body, t.ic));
}

async function decide(id, status) {
  const r = allRequests.find(x => x.id === id);
  if (!r) return;
  closeSheets();
  toast('Traitement en cours…', 'warn');
  try {
    await db.collection('absenceRequests').doc(id).update({
      status, processedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (status === 'approved') await applyToSchedule(r);
    if (status === 'rejected') await removeFromSchedule(r);
    notifyEmployee(r, status);
    toast(`Demande ${statusLabel(status).toLowerCase()}`, 'success');
    await refresh(true);
  } catch (e) { console.error(e); toast('Traitement impossible.', 'error'); }
}

async function decideCancel(id, decision) {
  const r = allRequests.find(x => x.id === id);
  if (!r) return;
  closeSheets();
  toast('Traitement en cours…', 'warn');
  try {
    if (decision === 'approved') {
      await db.collection('absenceRequests').doc(id).update({
        status: 'cancelled', cancelApproved: true,
        cancellationProcessedAt: firebase.firestore.FieldValue.serverTimestamp(),
        processedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await removeFromSchedule(r);
      toast('Annulation acceptée — planning rétabli', 'success');
    } else {
      const prev = r.previousStatus || 'approved';
      const upd = {
        status: prev, cancelApproved: false,
        cancelRejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
        processedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      // Retour aux archives : on restaure le statut d'avant archivage
      if (prev === 'archived') upd.previousStatus = r.archivedPreviousStatus || 'approved';
      await db.collection('absenceRequests').doc(id).update(upd);
      toast('Annulation refusée', 'info');
    }
    notifyCancelDecision(r, decision);
    await refresh(true);
  } catch (e) { console.error(e); toast('Traitement impossible.', 'error'); }
}

/* Application au planning — même règle que l'outil web */
async function applyToSchedule(req) {
  try {
    const doc = await db.collection('schedules').doc(req.userId).get();
    if (!doc.exists) return;
    const days = doc.data().days || {};
    const start = new Date(req.date + 'T12:00:00');
    const end = new Date((req.dateEnd || req.date) + 'T12:00:00');
    const workDays = [];
    for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      if (cur.getDay() !== 0) workDays.push(new Date(cur));   // dimanche exclu
    }
    const userDoc = await db.collection('users').doc(req.userId).get();
    const tp = userDoc.exists ? (userDoc.data().typePlanning || {}) : {};
    const byDay = ['CP', 'CP Ancienneté', 'Maladie'].includes(req.type);
    const deductible = ['Récupération', 'Événement Familial', 'Autre', 'Formation'].includes(req.type);

    if (byDay) {
      workDays.forEach(d => {
        days[key(d)] = {hours: 7, type: req.type, note: `${req.type} approuvé`, absenceId: req.id};
      });
    } else if (deductible) {
      const perDay = workDays.length ? req.hours / workDays.length : req.hours;
      workDays.forEach(d => {
        const k = key(d);
        const planned = parseFloat(tp[DAYS_KEY[d.getDay()]]) || parseFloat(days[k]?.hours) || 0;
        const taken = Math.min(Math.round(perDay * 100) / 100, planned);
        const left = Math.max(0, Math.round((planned - taken) * 100) / 100);
        days[k] = {
          hours: left, type: left > 0 ? 'normal' : req.type,
          note: `${taken}h de ${req.type} — ${left}h travaillées`,
          absenceId: req.id, recupDeducted: taken
        };
      });
    } else {
      const perDay = workDays.length ? req.hours / workDays.length : req.hours;
      workDays.forEach(d => {
        days[key(d)] = {hours: Math.round(perDay * 100) / 100, type: req.type,
          note: `${req.type} approuvé`, absenceId: req.id};
      });
    }
    if (!workDays.length) {
      days[req.date] = {hours: req.hours, type: req.type, note: `${req.type} approuvé`, absenceId: req.id};
    }
    await db.collection('schedules').doc(req.userId).update({days});
    if (req.userId === uid()) mySchedule = days;
  } catch (e) { console.error('applyToSchedule', e); }
}

async function removeFromSchedule(req) {
  try {
    const doc = await db.collection('schedules').doc(req.userId).get();
    if (!doc.exists) return;
    const days = doc.data().days || {};
    const userDoc = await db.collection('users').doc(req.userId).get();
    const tp = userDoc.exists ? (userDoc.data().typePlanning || {}) : {};
    const start = new Date(req.date + 'T12:00:00');
    const end = new Date((req.dateEnd || req.date) + 'T12:00:00');
    let changed = false;
    for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      const k = key(cur);
      if (days[k]?.absenceId === req.id || (days[k] && days[k].type === req.type)) {
        const restored = parseFloat(tp[DAYS_KEY[cur.getDay()]]) || 0;
        days[k] = {hours: restored, type: restored > 0 ? 'normal' : 'repos', note: ''};
        changed = true;
      }
    }
    if (changed) {
      await db.collection('schedules').doc(req.userId).update({days});
      if (req.userId === uid()) mySchedule = days;
    }
  } catch (e) { console.error('removeFromSchedule', e); }
}

function notifyEmployee(req, status) {
  if (!req.userEmail) return;
  try {
    emailjs.send(EJS_SERVICE, EJS_TPL_RESP, {
      to_email: req.userEmail,
      subject: `Votre demande d'absence (${req.type}) — ${statusLabel(status)}`,
      employee_name: req.userName,
      status_message:
        `Bonjour ${req.userName},\n\n` +
        `Votre demande a été traitée : ${statusLabel(status).toUpperCase()}.\n\n` +
        `Type : ${req.type}\nDate(s) : ${req.dateLabel || disp(req.date)}\nDurée : ${req.qLabel || req.hours + 'h'}\n\n` +
        `Consultez votre planning : ${APP_URL}`
    });
  } catch (e) { console.warn('EmailJS', e); }
}

function notifyCancelDecision(req, decision) {
  if (!req.userEmail) return;
  try {
    emailjs.send(EJS_SERVICE, EJS_TPL_RESP, {
      to_email: req.userEmail,
      subject: `Votre demande d'annulation (${req.type}) a été ${decision === 'approved' ? 'acceptée' : 'refusée'}`,
      employee_name: req.userName,
      status_message:
        `Bonjour ${req.userName},\n\n` +
        `Votre demande d'annulation a été ${decision === 'approved' ? 'ACCEPTÉE' : 'REFUSÉE'}.\n\n` +
        `Type : ${req.type}\nDate(s) : ${req.dateLabel || disp(req.date)}\n\n` +
        (decision === 'approved'
          ? `Votre planning d'origine a été rétabli sur les journées concernées.\n\n`
          : `L'absence est donc maintenue.\n\n`) +
        `Consultez votre planning : ${APP_URL}`
    });
  } catch (e) { console.warn('EmailJS', e); }
}

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 4b — PROFIL (collaborateur)
   ═══════════════════════════════════════════════════════════════ */
function paintProfileScreen() {
  $('sc-team').innerHTML = profileBody();
}

function profileBody() {
  const cadre = !!me.isCadre;
  const target = effectiveTarget(me);
  const done = cadre ? yearTotal(mySchedule) / 2 : yearTotal(mySchedule);
  const cp = cpStats(mySchedule);
  const ek = entryKey(me);
  return `
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="padding:18px 15px">
        <div class="avatar" style="width:52px;height:52px;border-radius:17px;font-size:21px">
          ${esc((me.name || '?').charAt(0).toUpperCase())}</div>
        <div class="row-b">
          <div class="row-t" style="font-size:17px">${esc(me.name)}</div>
          <div class="row-s">${esc(me.email || '')}</div>
        </div>
      </div>
    </div>

    <div class="sec-t">Mon contrat</div>
    <div class="card">
      <div class="row"><div class="row-b"><div class="row-s">Objectif de la période</div>
        <div class="row-t">${num(target)} ${cadre ? 'jours' : 'heures'}${ek ? ' (proratisé)' : ''}</div></div></div>
      <div class="row"><div class="row-b"><div class="row-s">Heures réalisées</div>
        <div class="row-t">${num(done)} ${cadre ? 'j' : 'h'}</div></div></div>
      <div class="row"><div class="row-b"><div class="row-s">Congés payés posés</div>
        <div class="row-t">${cp.days} / ${me.cpDays || 25} jours</div></div></div>
      ${(me.cpAnciennete || 0) ? `<div class="row"><div class="row-b"><div class="row-s">CP ancienneté posés</div>
        <div class="row-t">${cp.daysAnc} / ${me.cpAnciennete} jours</div></div></div>` : ''}
      ${me.matricule ? `<div class="row"><div class="row-b"><div class="row-s">Matricule</div>
        <div class="row-t">${esc(me.matricule)}</div></div></div>` : ''}
      ${me.dateEntree ? `<div class="row"><div class="row-b"><div class="row-s">Entrée dans l’entreprise</div>
        <div class="row-t">${disp(String(me.dateEntree).slice(0, 10))}</div></div></div>` : ''}
    </div>

    <div class="sec-t">Application</div>
    <div class="card">
      <button class="row" onclick="refresh()">
        <div class="row-ic i-blue">${ic('refresh', 19, 2.2)}</div>
        <div class="row-b"><div class="row-t">Actualiser les données</div>
        <div class="row-s">Recharger planning et demandes</div></div>
        <span class="chev">${ic('chev', 17, 2.4)}</span>
      </button>
      <button class="row" onclick="window.open('${APP_URL}','_blank')">
        <div class="row-ic i-navy">${ic('chart', 19, 2.2)}</div>
        <div class="row-b"><div class="row-t">Ouvrir la version complète</div>
        <div class="row-s">Tableaux détaillés, exports, documents</div></div>
        <span class="chev">${ic('chev', 17, 2.4)}</span>
      </button>
      <button class="row" onclick="logout()">
        <div class="row-ic i-red">${ic('logout', 19, 2.2)}</div>
        <div class="row-b"><div class="row-t" style="color:#B91C1C">Se déconnecter</div></div>
      </button>
    </div>
    <div style="text-align:center;color:var(--ink3);font-size:11.5px;margin:18px 0 30px">
      Suivi Annualisation · version application 1.0
    </div>`;
}

/* Feuille profil, accessible depuis l'en-tête sur tous les écrans */
function paintProfileSheet() {
  openSheet('sheetProfile', sheetShell('Mon profil', profileBody(), 'user'));
}
