/* ═══════════════════════════════════════════════════════════════
   SUIVI ANNUALISATION v3 — coquille de l'application
   Démarrage, connexion, navigation, notifications, recherche.
   ═══════════════════════════════════════════════════════════════ */
import * as C from './core.js';
import { APP_VERSION } from './config.js';
import { initBackend, isDemo, leaveDemo } from './backend.js';
import * as St from './store.js';
import { S, uid, isAdmin, hasPlanning } from './store.js';
import { $, $$, esc, icon, avatar, toast, modal, act, closeTopModal, closeAllModals, confirmDialog, isMobile, fmtTs, statusBadge } from './ui.js';
import { nav } from './nav.js';
import * as dashboard from './views/dashboard.js';
import * as planning from './views/planning.js';
import * as teamView from './views/team.js';
import * as absences from './views/absences.js';
import * as requests from './views/requests.js';
import * as van from './views/van.js';
import * as people from './views/people.js';
import * as alerts from './views/alerts.js';
import * as reports from './views/reports.js';
import * as comms from './views/comms.js';
import * as settings from './views/settings.js';
import * as help from './views/help.js';
import * as profile from './views/profile.js';

/* ─── Table des écrans ─── */
const ROUTES = {
  home:     { title: () => isAdmin() ? 'Tableau de bord' : 'Accueil', icon: 'home', view: dashboard, live: true },
  planning: { title: () => isAdmin() ? 'Plannings individuels' : 'Mon planning', icon: 'cal', view: planning },
  team:     { title: () => 'Planning équipe', icon: 'team', view: teamView },
  absences: { title: () => 'Mes absences', icon: 'leave', view: absences, live: true, need: () => hasPlanning() },
  van:      { title: () => 'Camionnette', icon: 'van', view: van, live: true },
  requests: { title: () => 'Demandes', icon: 'inbox', view: requests, admin: true, live: true },
  alerts:   { title: () => 'Alertes & conformité', icon: 'alert', view: alerts, admin: true },
  people:   { title: () => 'Collaborateurs', icon: 'user', view: people, admin: true },
  reports:  { title: () => 'Rapports & contrôles', icon: 'chart', view: reports, admin: true },
  comms:    { title: () => 'Annonces', icon: 'megaphone', view: comms, admin: true, live: true },
  settings: { title: () => 'Paramètres', icon: 'settings', view: settings, admin: true },
  help:     { title: () => 'Guide des 1607 h', icon: 'book', view: help },
  profile:  { title: () => 'Mon profil', icon: 'user', view: profile }
};
const SHORT = { home: 'Accueil', planning: 'Planning', absences: 'Absences', team: 'Équipe', requests: 'Demandes', people: 'Collab.' };
const menu = () => isAdmin()
  ? [['Pilotage', ['home', 'team', 'requests', 'alerts']],
     ['Gestion', ['people', 'planning', 'reports', 'comms']],
     ...(hasPlanning() ? [['Mon espace', ['absences', 'van']]] : []),
     ['Configuration', ['settings', 'help']]]
  : [['Mon espace', ['home', 'planning', 'absences', 'van']], ['Équipe', ['team']], ['Ressources', ['help']]];
const bottomTabs = () => isAdmin() ? ['home', 'team', 'requests', 'people'] : ['home', 'planning', 'absences', 'team'];
const allowed = name => { const r = ROUTES[name]; return !!r && (!r.admin || isAdmin()) && (!r.need || r.need()); };

function counts() {
  if (!isAdmin()) {
    const seen = +(localStorage.getItem('lastSeenRequests-' + uid()) || 0);
    const news = S.requests.filter(r => ['approved', 'rejected', 'waiting', 'cancelled'].includes(r.status) && (r.processedAt?.seconds || 0) * 1000 > seen).length;
    return { absences: news };
  }
  const al = St.teamAlerts();
  const crit = al.filter(a => a.level === 'critical').length;
  return { requests: St.pendingRequests().length + St.pendingVan().length, alerts: crit || al.filter(a => a.level === 'warning').length, alertsTone: crit ? 'red' : 'amber' };
}

/* ─── Coquille ─── */
function renderChrome() {
  const c = counts();
  const item = name => {
    const r = ROUTES[name];
    const n = c[name];
    return `<button class="nav-item ${nav.current.name === name ? 'on' : ''}" data-act="go" data-arg="${name}">
      ${icon(r.icon, 18)}<span>${r.title()}</span>${n ? `<span class="count ${name === 'alerts' ? c.alertsTone : ''}">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
  };
  $('#sideNav').innerHTML = menu().map(([label, items]) =>
    `<div class="nav-label">${label}</div>${items.filter(allowed).map(item).join('')}`).join('');
  $('#sideUser').innerHTML = `${avatar(S.me)}<div class="grow"><div class="n ellipsis">${esc(S.me.name)}</div>
    <div class="r">${isAdmin() ? 'Direction' : esc(S.me.poste || 'Collaborateur')}</div></div>${icon('right', 15)}`;
  $('#sideStore').textContent = S.store.storeName || '';
  $('#bottomNav').innerHTML = bottomTabs().filter(allowed).map(name => {
    const r = ROUTES[name], n = c[name];
    return `<button class="${nav.current.name === name ? 'on' : ''}" data-act="go" data-arg="${name}">
      <span class="pill">${icon(r.icon, 20)}</span><span>${SHORT[name] || r.title()}</span>${n ? `<span class="count">${n}</span>` : ''}</button>`;
  }).join('') + `<button data-act="more"><span class="pill">${icon('menu', 20)}</span><span>Plus</span></button>`;
  const total = notifications().length;
  $('#bellDot').textContent = total; $('#bellDot').classList.toggle('hidden', !total);
  $('#themeBtn').innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon', 18);
}

function route() {
  if (!S.me) return;
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
  let name = parts[0] || 'home';
  if (!allowed(name)) name = 'home';
  nav.current = { name, params: parts.slice(1) };
  const r = ROUTES[name];
  $('#pageTitle').textContent = r.title();
  $('#crumb').textContent = `${S.store.storeName || ''} · Exercice ${S.period.label}`;
  document.title = `${r.title()} — Suivi Annualisation`;
  renderChrome();
  const view = $('#view');
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
  view.onchange = view.oninput = view.onkeydown = null;
  try { r.view.render(view, nav.current.params); }
  catch (e) { console.error(e); view.innerHTML = `<div class="card card-pad">Une erreur est survenue à l’affichage de cet écran.<br><span class="muted">${esc(e.message)}</span></div>`; }
  if (name === 'absences' && !isAdmin()) { localStorage.setItem('lastSeenRequests-' + uid(), String(Date.now())); }
}
nav.rerender = () => { const y = window.scrollY; route(); window.scrollTo(0, y); };
nav.refreshChrome = renderChrome;
window.addEventListener('hashchange', () => { closeAllModals(); route(); window.scrollTo(0, 0); });

// Mise à jour en direct : rafraîchit l'écran courant s'il n'y a pas de saisie en cours
let liveTimer = null;
function onLive() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    if (!S.me) return;
    renderChrome();
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (ROUTES[nav.current.name]?.live && !document.querySelector('.overlay') && !typing) nav.rerender();
  }, 150);
}
['requests', 'van', 'announcements'].forEach(e => St.on(e, onLive));

/* ─── Actions globales ─── */
act('go', arg => { closeAllModals(); nav.go(arg); });
act('more', () => {
  modal({
    title: 'Menu', iconName: 'menu',
    body: `<div class="list" style="margin:0 -22px">${menu().map(([label, items]) =>
      `<div class="nav-label" style="color:var(--ink-3);padding:12px 22px 4px">${label}</div>` + items.filter(allowed).map(n =>
        `<button class="li" data-act="go" data-arg="${n}"><span class="ic-b tone-muted">${icon(ROUTES[n].icon, 16)}</span><span class="t grow">${ROUTES[n].title()}</span>${icon('right', 15)}</button>`).join('')).join('')}
      <div class="nav-label" style="color:var(--ink-3);padding:12px 22px 4px">Compte</div>
      <button class="li" data-act="go" data-arg="profile"><span class="ic-b tone-muted">${icon('user', 16)}</span><span class="t grow">Mon profil</span>${icon('right', 15)}</button>
      <button class="li" data-act="logout"><span class="ic-b tone-danger">${icon('logout', 16)}</span><span class="t grow" style="color:var(--danger-ink)">Se déconnecter</span></button></div>`
  });
});
act('theme', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  document.querySelector('meta[name="theme-color"]').content = next === 'dark' ? '#0A111E' : '#0E1A30';
  renderChrome();
});
act('logout', async () => {
  St.logout();
  closeAllModals();
  location.hash = '';
  $('#app').style.display = 'none';
  showLogin();
});
act('refresh', async (_, el) => {
  el.classList.add('spin-once');
  await Promise.all([St.loadSettings(), St.loadUsers(), St.loadAllSchedules(true)]);
  nav.rerender();
  toast('Données à jour', 'success');
});
act('leave-demo', () => { leaveDemo(); location.href = location.pathname; });

/* ─── Notifications (cloche) ─── */
function notifications() {
  const out = [];
  if (isAdmin()) {
    St.pendingRequests().forEach(r => out.push({
      ic: r.status === 'cancel_pending' ? 'undo' : 'leave', tone: r.status === 'cancel_pending' ? 'danger' : 'warn',
      t: `${r.userName} — ${r.status === 'cancel_pending' ? 'annulation demandée' : r.type}`, s: r.dateLabel || C.disp(r.date), go: 'requests'
    }));
    St.pendingVan().forEach(r => out.push({ ic: 'van', tone: 'info', t: `${r.userName} — emprunt camionnette`, s: C.fmtDateTime(r.dateStart), go: 'requests/van' }));
    const crit = St.teamAlerts().filter(a => a.level === 'critical');
    if (crit.length) out.push({ ic: 'alert', tone: 'danger', t: `${crit.length} alerte${crit.length > 1 ? 's' : ''} critique${crit.length > 1 ? 's' : ''}`, s: 'Annualisation et durée du travail', go: 'alerts' });
  } else {
    const seen = +(localStorage.getItem('lastSeenRequests-' + uid()) || 0);
    S.requests.filter(r => (r.processedAt?.seconds || 0) * 1000 > seen && ['approved', 'rejected', 'waiting', 'cancelled'].includes(r.status))
      .forEach(r => out.push({ ic: 'leave', tone: r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'danger' : 'info', t: `${r.type} — ${C.statusLabel(r.status).toLowerCase()}`, s: r.dateLabel || C.disp(r.date), go: 'absences' }));
    St.pendingAnnouncements().forEach(a => out.push({ ic: 'megaphone', tone: 'violet', t: a.title || 'Information', s: 'Annonce de la direction', ann: a.id }));
  }
  return out;
}
act('bell', () => {
  const pop = $('#bellPop');
  if (!pop.classList.contains('hidden')) { pop.classList.add('hidden'); return; }
  const list = notifications();
  pop.innerHTML = `<div class="card-head"><h3>Notifications</h3></div><div class="list" style="margin-top:8px">${list.length ? list.map(n =>
    `<button class="li" data-act="${n.ann ? 'show-ann' : 'go'}" data-arg="${n.ann || n.go}"><span class="ic-b tone-${n.tone}">${icon(n.ic, 16)}</span>
       <span class="grow"><span class="t ellipsis" style="display:block">${esc(n.t)}</span><span class="s">${esc(n.s)}</span></span></button>`).join('')
    : `<div class="empty" style="padding:26px"><div class="ic-b">${icon('check', 22)}</div><h4>Tout est à jour</h4></div>`}</div>`;
  pop.classList.remove('hidden');
});
document.addEventListener('click', e => { if (!e.target.closest('#bellWrap')) $('#bellPop')?.classList.add('hidden'); });
act('show-ann', () => { $('#bellPop').classList.add('hidden'); showAnnouncements(); });

// Annonces non lues : affichées une à une, accusé de lecture obligatoire
function showAnnouncements() {
  const list = St.pendingAnnouncements();
  if (!list.length || !hasPlanning()) return;
  const a = list[0];
  const m = modal({
    title: esc(a.title || 'Information'), iconName: 'megaphone',
    body: `<div style="white-space:pre-wrap;font-size:14.5px;line-height:1.65">${esc(a.message || '')}</div>
      <div class="muted" style="font-size:12px;margin-top:14px">${a.createdBy ? 'De ' + esc(a.createdBy) + ' · ' : ''}${fmtTs(a.createdAt)}${list.length > 1 ? ` · ${list.length} annonces à lire` : ''}</div>`,
    foot: `<button class="btn btn-primary" id="annOk">${icon('check', 16, 2.4)} J’ai compris</button>`
  });
  $('#annOk', m.el).addEventListener('click', async () => { await St.ackAnnouncement(a.id); a.acknowledgedBy = { ...(a.acknowledgedBy || {}), [uid()]: { seconds: Date.now() / 1000 } }; m.close(); renderChrome(); setTimeout(showAnnouncements, 120); });
}

/* ─── Recherche / palette de commandes (Ctrl+K) ─── */
act('palette', openPalette);
function openPalette() {
  if (document.querySelector('.palette')) return;
  const items = [];
  Object.keys(ROUTES).filter(allowed).forEach(n => items.push({ label: ROUTES[n].title(), hint: 'Écran', ic: ROUTES[n].icon, go: n }));
  if (isAdmin()) {
    St.team().forEach(u => items.push({ label: u.name, hint: 'Planning', ic: 'cal', go: 'planning/' + u.username, user: u }));
    St.team().forEach(u => items.push({ label: 'Fiche de ' + u.name, hint: 'Collaborateur', ic: 'user', go: 'people/' + u.username }));
    [['Paramètres › Période', 'settings/period'], ['Paramètres › Jours fériés et dimanches', 'settings/holidays'], ['Paramètres › Verrouillages', 'settings/locks'],
     ['Paramètres › Sauvegardes', 'settings/backups'], ['Paramètres › Historique', 'settings/history'], ['Rapports › Export Excel', 'reports'],
     ['Rapports › Vérification feuille d’heures', 'reports/check'], ['Rapports › Impression des plannings', 'reports/print'], ['Demandes › Camionnette', 'requests/van'],
     ['Demandes › Calendrier des absences', 'requests/calendar']].forEach(([label, go]) => items.push({ label, hint: 'Raccourci', ic: 'right', go }));
  }
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal palette"><input placeholder="Rechercher un écran, un collaborateur…" autocomplete="off"><div class="res"></div></div>`;
  document.body.appendChild(ov);
  const input = $('input', ov), res = $('.res', ov);
  let sel = 0, shown = [];
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const paint = () => {
    const q = norm(input.value.trim());
    shown = items.filter(i => !q || norm(i.label).includes(q)).slice(0, 9);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    res.innerHTML = shown.length ? shown.map((i, n) => `<button class="${n === sel ? 'sel' : ''}" data-i="${n}">${i.user ? avatar(i.user, 'sm') : `<span class="ic-b tone-muted">${icon(i.ic, 15)}</span>`}<span>${esc(i.label)}</span><span class="hint">${i.hint}</span></button>`).join('')
      : '<div class="empty" style="padding:22px">Aucun résultat</div>';
  };
  const close = () => ov.remove();
  const pick = i => { close(); if (shown[i]) nav.go(shown[i].go); };
  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
    else if (e.key === 'Enter') pick(sel);
    else if (e.key === 'Escape') close();
  });
  res.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pick(+b.dataset.i); });
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  paint(); input.focus();
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.me) { e.preventDefault(); openPalette(); }
  else if (e.key === 'Escape') { const p = document.querySelector('.palette'); if (p) p.parentElement.remove(); else closeTopModal(); }
});

/* ─── Connexion ─── */
function showLogin(error = '') {
  $('#splash').classList.add('hidden');
  $('#login').classList.remove('hidden');
  $('#lgErr').textContent = error; $('#lgErr').classList.toggle('hidden', !error);
  $('#lgDemo').classList.toggle('hidden', !isDemo);
  $('#lgVersion').textContent = 'Version ' + APP_VERSION;
}
async function doLogin() {
  const u = $('#lgUser').value.trim(), p = $('#lgPass').value;
  if (!u || !p) return showLogin('Renseignez votre identifiant et votre mot de passe.');
  const btn = $('#lgBtn');
  btn.disabled = true;
  try {
    if (!(await St.login(u, p, $('#lgRemember').checked))) return showLogin('Identifiant ou mot de passe incorrect.');
    $('#lgPass').value = '';
    await enterApp();
  } catch (e) { console.error(e); showLogin('Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.'); }
  finally { btn.disabled = false; }
}
$('#lgBtn').addEventListener('click', doLogin);
$('#login').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

let pendingAction = null;
async function enterApp() {
  $('#login').classList.add('hidden');
  $('#splash').classList.remove('hidden');
  await St.loadSession();
  $('#splash').classList.add('hidden');
  $('#app').style.display = 'block';
  $('#demoTag').classList.toggle('hidden', !isDemo);
  if (isDemo) window.__demo = { S, St, C };   // accès aux données pour les tests automatisés (mode démo uniquement)
  const todo = pendingAction;      // lien reçu par e-mail (Approuver / Refuser / ouvrir une page)
  pendingAction = null;
  if (todo?.page && isAdmin()) location.hash = '#/' + ({ 'manager-requests': 'requests', 'van-requests': 'requests/van' }[todo.page] || 'requests');
  route();
  if (isAdmin()) {
    setTimeout(() => St.maybeAutoSnapshot(), 3000);
    if (todo?.action) setTimeout(() => runEmailAction(todo), 400);
    if (S.me.password === 'admin123' || S.me.mustChangePassword) setTimeout(() => toast('Mot de passe par défaut détecté : changez-le dans Mon profil.', 'warning'), 900);
  } else setTimeout(showAnnouncements, 500);
}

// Boutons Approuver / Refuser / Attente des e-mails
async function runEmailAction({ action, requestId, kind }) {
  try {
    if (kind === 'van') {
      const s = { approve: 'approved', reject: 'rejected', waiting: 'waiting' }[action];
      if (!s) return;
      await St.decideVan(requestId, s); nav.go('requests/van');
    } else if (action === 'approve_cancel' || action === 'reject_cancel') {
      await St.decideCancel(requestId, action === 'approve_cancel' ? 'approved' : 'rejected'); nav.go('requests');
    } else {
      const s = { approve: 'approved', reject: 'rejected', waiting: 'waiting' }[action];
      if (!s) return;
      const r = await St.decideRequest(requestId, s);
      toast(`Demande de ${r.userName} : ${C.statusLabel(s).toLowerCase()}`, 'success'); nav.go('requests');
    }
  } catch (e) { toast(e.message || 'Traitement impossible.', 'error'); }
}

/* ─── Démarrage ─── */
async function boot() {
  const theme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  const p = new URLSearchParams(location.search);
  if (p.get('action') && p.get('requestId')) pendingAction = { action: p.get('action'), requestId: p.get('requestId'), kind: p.get('kind') || 'absence' };
  else if (p.get('page')) pendingAction = { page: p.get('page') };
  if (p.toString() && !p.has('demo')) history.replaceState({}, '', location.pathname + location.hash);
  try {
    await initBackend();
    await St.ensureAdminAccount();
  } catch (e) {
    console.error(e);
    return showLogin('Connexion au serveur impossible. Vérifiez votre réseau puis rechargez la page.');
  }
  if (p.has('demo')) history.replaceState({}, '', location.pathname + location.hash);
  try { if (await St.restoreSession()) return await enterApp(); }
  catch (e) { console.error(e); }
  showLogin();
}
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
export { confirmDialog, statusBadge, isMobile };
