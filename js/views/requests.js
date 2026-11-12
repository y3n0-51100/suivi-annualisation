/* ═══════════════════════════════════════════════════════════════
   DEMANDES (direction) — à traiter, toutes, calendrier, camionnette
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S } from '../store.js';
import { $$, esc, icon, avatar, act, empty, toast, confirmDialog, statusBadge, modal, typeBadge, busy, fmtTs } from '../ui.js';
import { nav } from '../nav.js';
import { requestCard, monthNav, argOf, impactHtml } from './shared.js';

const R = { tab: 'todo', status: 'all', user: 'all', type: 'all', period: 'all', sort: 'recent', q: '', month: null, vanFilter: 'all' };
const TABS = [['todo', 'À traiter'], ['all', 'Toutes les demandes'], ['calendar', 'Calendrier des absences'], ['van', 'Camionnette'], ['archived', 'Archives']];

function periodRange(p) {
  const t = C.todayKey();
  if (p === 'upcoming') return [t, null];
  if (p === 'past') return [null, t];
  if (p === 'week') { const m = C.mondayOf(t); return [m, C.addDays(m, 6)]; }
  if (p === 'month') return [t.slice(0, 8) + '01', t.slice(0, 8) + C.pad(new Date(+t.slice(0, 4), +t.slice(5, 7), 0).getDate())];
  return [null, null];
}
function filtered() {
  const q = R.q.trim().toLowerCase();
  const [from, to] = periodRange(R.period);
  let list = S.requests.filter(r => {
    if (R.tab === 'archived') { if (r.status !== 'archived') return false; }
    else if (R.status === 'all') { if (r.status === 'archived') return false; }
    else if (r.status !== R.status) return false;
    if (R.user !== 'all' && r.userId !== R.user) return false;
    if (R.type !== 'all' && r.type !== R.type) return false;
    if (q && ![r.userName, r.userEmail, r.comment, r.type].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
    if (from && (r.dateEnd || r.date) < from) return false;
    if (to && r.date > to) return false;
    return true;
  });
  const by = { dateAsc: (a, b) => (a.date || '').localeCompare(b.date || ''), dateDesc: (a, b) => (b.date || '').localeCompare(a.date || ''), name: (a, b) => (a.userName || '').localeCompare(b.userName || '', 'fr') }[R.sort];
  return by ? list.slice().sort(by) : list;
}

export function render(root, params) {
  if (TABS.some(t => t[0] === params[0])) { R.tab = params[0]; history.replaceState({}, '', '#/requests'); }
  if (R.month === null) R.month = C.currentMonthIndex(S.period);
  const todo = St.pendingRequests(), vanP = St.pendingVan();
  const counts = { todo: todo.length, van: vanP.length };
  let body;
  if (R.tab === 'todo') body = `<div class="card">${todo.length
    ? todo.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(r => requestCard(r)).join('')
    : empty('check', 'Rien à traiter', 'Toutes les demandes d’absence ont reçu une réponse.')}</div>`;
  else if (R.tab === 'calendar') body = calendar();
  else if (R.tab === 'van') body = vanTab();
  else body = listTab();

  root.innerHTML = `
  <div class="page-head">
    <div class="grow"><h2>Demandes</h2><p>Absences et emprunts de la camionnette · mise à jour en direct</p></div>
    <button class="btn btn-primary" data-act="absence-direct">${icon('plus', 16, 2.4)} Saisir une absence</button>
  </div>
  <div class="tabs">${TABS.map(([id, label]) => `<button class="${R.tab === id ? 'on' : ''}" data-act="rq-tab" data-arg="${id}">${label}${counts[id] ? `<span class="n">${counts[id]}</span>` : ''}</button>`).join('')}</div>
  ${body}`;
  root.oninput = e => { if (e.target.id === 'rqSearch') { R.q = e.target.value; clearTimeout(root._t); root._t = setTimeout(() => { const el = document.getElementById('rqList'); if (el) el.innerHTML = listHtml(); }, 180); } };
}

const listHtml = () => { const list = filtered(); return list.length ? `<div class="muted" style="padding:12px 20px 0;font-size:12.5px">${list.length} demande${list.length > 1 ? 's' : ''}</div>` + list.map(r => requestCard(r, { selectable: true })).join('') : empty('inbox', 'Aucune demande', 'Élargissez vos filtres.'); };
function listTab() {
  const sel = (id, value, opts) => `<select class="input sm" style="width:auto" data-act="rq-filter" data-on="change" data-arg="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="card card-pad row wrap" style="margin-bottom:14px;gap:8px">
      <input class="input sm" id="rqSearch" style="max-width:240px" placeholder="Rechercher (nom, commentaire…)" value="${esc(R.q)}">
      ${sel('user', R.user, [['all', 'Tous les collaborateurs'], ...St.team().map(u => [u.username, u.name])])}
      ${sel('type', R.type, [['all', 'Tous les types'], ...C.TYPE_NAMES.map(t => [t, C.TYPES[t].label])])}
      ${R.tab === 'archived' ? '' : sel('status', R.status, [['all', 'Tous les statuts'], ...['pending', 'cancel_pending', 'approved', 'waiting', 'rejected', 'cancelled'].map(s => [s, C.statusLabel(s)])])}
      ${sel('period', R.period, [['all', 'Toutes les dates'], ['upcoming', 'À venir'], ['week', 'Cette semaine'], ['month', 'Ce mois-ci'], ['past', 'Passées']])}
      ${sel('sort', R.sort, [['recent', 'Plus récentes d’abord'], ['dateAsc', 'Date d’absence ↑'], ['dateDesc', 'Date d’absence ↓'], ['name', 'Nom A → Z']])}
      <button class="btn btn-soft btn-sm" data-act="rq-reset">${icon('undo', 14)} Réinitialiser</button>
      ${R.tab === 'archived' ? '' : `<span class="right row" style="gap:8px"><button class="btn btn-ghost btn-sm" data-act="rq-archive-sel">${icon('archive', 14)} Archiver la sélection</button>
        <button class="btn btn-ghost btn-sm" data-act="rq-archive-all">Archiver les demandes traitées</button></span>`}
    </div>
    <div class="card" id="rqList">${listHtml()}</div>`;
}

/* ─── Calendrier des absences ─── */
function calendar() {
  const m = S.period.months[R.month], today = C.todayKey();
  const start = C.mondayOf(m.startKey), end = C.addDays(C.mondayOf(m.endKey), 6);
  const live = S.requests.filter(r => ['approved', 'pending', 'waiting', 'cancel_pending'].includes(r.status));
  const cells = C.rangeKeys(start, end).map(k => {
    const evs = live.filter(r => k >= r.date && k <= (r.dateEnd || r.date) && C.dow(k) !== 0);
    return `<div class="ac ${k < m.startKey || k > m.endKey ? 'out' : ''} ${k === today ? 'today' : ''}"><span class="dnum">${+k.slice(8)}</span>
      ${evs.slice(0, 4).map(r => `<button class="ev t-${C.TYPES[r.type]?.cls || 'aut'} ${r.status === 'approved' ? '' : 'pending'}" data-act="rq-detail" data-arg="${r.id}" title="${esc(r.userName + ' — ' + r.type + ' (' + C.statusLabel(r.status) + ')')}">${esc(r.userName.split(' ')[0])} · ${C.TYPES[r.type]?.short || ''}</button>`).join('')}
      ${evs.length > 4 ? `<span class="muted" style="font-size:10.5px">+${evs.length - 4}</span>` : ''}</div>`;
  }).join('');
  const inMonth = live.filter(r => C.overlaps(r.date, r.dateEnd || r.date, m.startKey, m.endKey));
  return `<div class="row wrap" style="margin-bottom:12px">${monthNav(R.month, 'rq-month')}
      <span class="badge b-muted right">${inMonth.length} absence${inMonth.length > 1 ? 's' : ''} sur le mois</span>
      <div class="legend"><span><i style="background:var(--warn-soft)"></i>Approuvée</span><span><i style="border:1.5px dashed var(--ink-3)"></i>En attente de décision</span></div></div>
    <div class="card" style="overflow:hidden"><div class="acal">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => `<div class="hd">${d}</div>`).join('')}${cells}</div></div>`;
}
act('rq-detail', arg => {
  const r = S.requests.find(x => x.id === arg);
  if (!r) return;
  modal({ title: 'Demande d’absence', iconName: 'leave', size: 'wide', body: `<div style="margin:0 -22px">${requestCard(r)}</div>` });
});

/* ─── Camionnette ─── */
function vanTab() {
  const f = R.vanFilter;
  const list = S.van.filter(r => f === 'archived' ? r.status === 'archived' : f === 'all' ? r.status !== 'archived' : r.status === f);
  const upcoming = S.van.filter(r => r.status === 'approved' && new Date(r.dateEnd) >= new Date()).sort((a, b) => a.dateStart.localeCompare(b.dateStart));
  return `<div class="grid g-main">
    <div class="card">
      <div class="card-head"><h3>Demandes d’emprunt</h3><div class="chips right">${[['all', 'Toutes'], ['pending', 'En attente'], ['approved', 'Approuvées'], ['rejected', 'Refusées'], ['archived', 'Archives']]
        .map(([id, l]) => `<button class="chip ${f === id ? 'on' : ''}" data-act="rq-van-filter" data-arg="${id}">${l}</button>`).join('')}</div></div>
      <div style="margin-top:10px">${list.length ? list.map(r => {
        const u = St.userOf(r.userId) || { name: r.userName }, arch = r.status === 'archived';
        const clash = S.van.find(o => o.id !== r.id && o.status === 'approved' && new Date(o.dateStart) < new Date(r.dateEnd) && new Date(o.dateEnd) > new Date(r.dateStart));
        return `<div class="req">${avatar(u)}<div class="grow">
          <div class="row wrap" style="gap:8px"><span class="who">${esc(r.userName)}</span>${statusBadge(r.status)}</div>
          <div class="meta">${icon('van', 15)}<b>${esc(C.fmtDateTime(r.dateStart))}</b> → <b>${esc(C.fmtDateTime(r.dateEnd))}</b></div>
          ${r.parking ? `<div class="meta">Stationnement de nuit : <b>${esc(r.parking)}</b></div>` : ''}
          ${r.comment ? `<div class="quote">« ${esc(r.comment)} »</div>` : ''}
          ${clash && r.status === 'pending' ? `<div class="impact"><span class="badge b-danger">${icon('alert', 13)} Chevauche l’emprunt approuvé de ${esc(clash.userName)}</span></div>` : ''}
        </div><div class="acts">${arch ? `<button class="btn btn-ghost btn-sm" data-act="van-unarchive" data-arg="${r.id}">${icon('undo', 15)} Restaurer</button>` : `
          ${r.status !== 'approved' ? `<button class="btn btn-ok btn-sm" data-act="van-decide" data-arg="${r.id}|approved">${icon('check', 15, 2.4)} Approuver</button>` : ''}
          ${r.status !== 'rejected' ? `<button class="btn btn-danger-soft btn-sm" data-act="van-decide" data-arg="${r.id}|rejected">${icon('x', 15, 2.4)} Refuser</button>` : ''}
          ${r.status !== 'pending' ? `<button class="btn btn-soft btn-sm btn-icon" data-act="van-archive" data-arg="${r.id}" title="Archiver">${icon('archive', 15)}</button>` : ''}`}</div></div>`;
      }).join('') : empty('van', 'Aucune demande', '')}</div>
    </div>
    <div class="card"><div class="card-head"><h3>Réservations à venir</h3></div>
      <div class="list" style="margin-top:8px">${upcoming.length ? upcoming.map(r => `<div class="li"><span class="ic-b tone-info">${icon('van', 16)}</span>
        <div class="grow"><div class="t">${esc(r.userName)}</div><div class="s">${esc(C.fmtDateTime(r.dateStart))} → ${esc(C.fmtDateTime(r.dateEnd))}</div></div></div>`).join('')
        : empty('van', 'Camionnette disponible', 'Aucune réservation approuvée à venir.')}</div></div>
  </div>`;
}
act('van-decide', async (arg, el) => {
  const [id, status] = arg.split('|');
  let comment = '';
  if (status === 'rejected') {
    const res = await confirmDialog({ title: 'Refuser l’emprunt', text: 'Vous pouvez ajouter un message pour le collaborateur.', ok: 'Refuser', danger: true, input: { label: 'Message (facultatif)', textarea: true } });
    if (res === false) return;
    if (typeof res === 'string') comment = res;
  }
  await busy(el, () => St.decideVan(id, status, comment));
  toast(`Emprunt ${C.statusLabel(status).toLowerCase()}`, 'success'); nav.rerender();
});
act('van-archive', async arg => { await St.archiveRequests([arg], 'vanRequests'); nav.rerender(); });
act('van-unarchive', async arg => { await St.unarchiveRequest(arg, 'vanRequests'); nav.rerender(); });
act('rq-van-filter', arg => { R.vanFilter = arg; nav.rerender(); });

act('rq-tab', arg => { R.tab = arg; nav.rerender(); });
act('rq-month', (arg, el) => { R.month = Math.max(0, Math.min(11, argOf(arg, el))); nav.rerender(); });
act('rq-filter', (arg, el) => { R[arg] = el.value; nav.rerender(); });
act('rq-reset', () => { Object.assign(R, { status: 'all', user: 'all', type: 'all', period: 'all', sort: 'recent', q: '' }); nav.rerender(); });
act('rq-archive-sel', async () => {
  const ids = $$('.req-check:checked').map(c => c.value);
  if (!ids.length) return toast('Cochez au moins une demande traitée.', 'warning');
  await St.archiveRequests(ids); toast(`${ids.length} demande(s) archivée(s)`, 'success'); nav.rerender();
});
act('rq-archive-all', async () => {
  const list = S.requests.filter(r => !['archived', 'pending', 'cancel_pending'].includes(r.status));
  if (!list.length) return toast('Aucune demande traitée à archiver.', 'warning');
  if (!(await confirmDialog({ title: 'Archiver les demandes traitées', text: `${list.length} demande(s) seront archivées. Les demandes en attente sont conservées. Une absence archivée reste appliquée au planning.`, ok: 'Archiver' }))) return;
  await St.archiveRequests(list.map(r => r.id)); toast(`${list.length} demande(s) archivée(s)`, 'success'); nav.rerender();
});
export { impactHtml, typeBadge, fmtTs };
