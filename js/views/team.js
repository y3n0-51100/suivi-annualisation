/* ═══════════════════════════════════════════════════════════════
   PLANNING ÉQUIPE — mois / semaine / exercice + effectif par jour
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, uid, isAdmin } from '../store.js';
import { esc, icon, avatar, act, empty } from '../ui.js';
import { nav } from '../nav.js';
import { monthNav, argOf } from './shared.js';
import { openDayEditor } from './planning.js';

const T = { view: 'month', month: null, monday: null };
// Motifs personnels masqués aux collègues (seule la direction voit le détail)
const PRIVATE = new Set(['Maladie', 'Événement Familial', 'Autre']);

export function render(root, params) {
  if (['month', 'week', 'year'].includes(params[0])) T.view = params[0];
  if (T.month === null) T.month = C.currentMonthIndex(S.period);
  if (!T.monday) T.monday = C.mondayOf(C.inPeriod(S.period, C.todayKey()) ? C.todayKey() : S.period.startKey);
  const users = St.team();
  root.innerHTML = `
  <div class="page-head">
    <div class="grow"><h2>Planning équipe</h2><p>${users.length} collaborateur${users.length > 1 ? 's' : ''} · ${isAdmin() ? 'cliquez sur une case pour la modifier' : 'vue d’ensemble en lecture seule'}</p></div>
    <div class="seg">
      <button class="${T.view === 'week' ? 'on' : ''}" data-act="team-view" data-arg="week">Semaine</button>
      <button class="${T.view === 'month' ? 'on' : ''}" data-act="team-view" data-arg="month">Mois</button>
      <button class="${T.view === 'year' ? 'on' : ''}" data-act="team-view" data-arg="year">Exercice</button>
    </div>
    ${isAdmin() ? `<button class="btn btn-primary" data-act="absence-direct">${icon('plus', 16, 2.4)} Saisir une absence</button>` : ''}
  </div>
  ${!users.length ? `<div class="card">${empty('team', 'Aucun collaborateur', isAdmin() ? 'Créez un premier profil dans « Collaborateurs ».' : '')}</div>`
    : T.view === 'year' ? yearView(users) : gridView(users)}`;
}

function cell(u, k, big) {
  const e = S.schedules[u.username]?.[k] || {};
  const t = C.TYPES[e.type], h = C.hoursOf(e), d = C.dow(k);
  const ek = C.entryKey(u, S.period);
  let cls = '', txt = '', tip = '';
  if (ek && k < ek) { cls = 'pre'; txt = '·'; tip = 'Avant l’entrée dans l’entreprise'; }
  else if (t) {
    const hide = !isAdmin() && u.username !== uid() && PRIVATE.has(e.type);
    cls = hide ? 't-aut' : 't-' + t.cls; txt = hide ? 'ABS' : t.short; tip = hide ? 'Absent(e)' : t.label;
    if (big && !hide) txt = t.label;
  }
  else if (h > 0) { cls = 'work'; txt = C.num(h) + (big ? (u.isCadre ? ' dj' : ' h') : ''); if (e.recupDeducted) tip = e.note || ''; }
  else if (d === 0 && !S.openSundays[k]) { cls = 'sun'; }
  else { cls = 'off'; txt = big ? 'Repos' : ''; }
  if (e.modifiedByUser) { cls += ' mod'; tip = 'Modifié : ' + (e.modifComment || ''); }
  if (k === C.todayKey()) cls += ' today';
  const edit = isAdmin() && !(ek && k < ek);
  return `<td class="c ${cls} ${edit ? 'edit' : ''}" ${edit ? `data-act="team-cell" data-arg="${u.username}|${k}"` : ''} ${tip ? `title="${esc(tip)}"` : ''}>${txt}</td>`;
}

function gridView(users) {
  const week = T.view === 'week';
  const m = S.period.months[T.month];
  const keys = week ? C.rangeKeys(T.monday, C.addDays(T.monday, 6)).filter(k => C.inPeriod(S.period, k)) : C.rangeKeys(m.startKey, m.endKey);
  const today = C.todayKey();
  const groups = [];
  keys.forEach(k => { const w = C.isoWeek(k); if (!groups.length || groups[groups.length - 1].w !== w) groups.push({ w, n: 0 }); groups[groups.length - 1].n++; });
  const head = keys.map(k => {
    const d = C.dow(k), hol = S.holidays[k];
    const cls = hol ? (hol.open ? 'holo' : 'hol') : d === 0 ? (S.openSundays[k] ? 'suno' : 'sunh') : '';
    const tip = hol ? `${hol.name} — ${hol.open ? 'ouvert' : 'fermé'}` : S.openSundays[k]?.note || '';
    return `<th class="${cls} ${k === today ? 'today' : ''}" ${tip ? `title="${esc(tip)}"` : ''}>${week ? C.DAYS_SHORT[d] : C.DAYS_MIN[d]}<br>${+k.slice(8)}${week ? ' ' + C.MONTHS_SHORT[+k.slice(5, 7) - 1] : ''}</th>`;
  }).join('');
  const rows = users.map(u => {
    const days = S.schedules[u.username] || {};
    const tot = keys.reduce((s, k) => s + (C.isWorked(days[k]) ? C.hoursOf(days[k]) : 0), 0);
    return `<tr><td class="name"><div class="row" style="gap:8px">${avatar(u, 'sm')}
      ${isAdmin() ? `<a href="#/planning/${u.username}" class="ellipsis" style="color:inherit">${esc(u.name)}</a>` : `<span class="ellipsis">${esc(u.name)}</span>`}</div></td>
      ${keys.map(k => cell(u, k, week)).join('')}
      <td class="tot">${C.num(u.isCadre ? tot / 2 : tot)} ${u.isCadre ? 'j' : 'h'}</td></tr>`;
  }).join('');
  const foot = keys.map(k => {
    const need = St.minStaff(k), n = C.presentCount(users, S.schedules, k);
    const cls = !need ? '' : n < need ? 'low' : n === need ? 'edge' : 'good';
    return `<td class="${cls} ${k === today ? 'today' : ''}" title="${n} présent(s)${need ? ' — minimum ' + need : ''}">${need || n ? n : ''}</td>`;
  }).join('');
  const lowDays = keys.filter(k => { const need = St.minStaff(k); return need && C.presentCount(users, S.schedules, k) < need; });

  return `
  <div class="row wrap" style="margin-bottom:12px;gap:10px">
    ${week ? `<div class="row" style="gap:6px">
        <button class="btn btn-ghost btn-icon btn-sm" data-act="team-week" data-arg="-1" aria-label="Semaine précédente">${icon('left', 16, 2.4)}</button>
        <b style="min-width:210px;text-align:center">Semaine ${C.isoWeek(T.monday)} · ${C.shortDate(T.monday)} → ${C.shortDate(C.addDays(T.monday, 6))}</b>
        <button class="btn btn-ghost btn-icon btn-sm" data-act="team-week" data-arg="1" aria-label="Semaine suivante">${icon('right', 16, 2.4)}</button>
        <button class="btn btn-soft btn-sm" data-act="team-week" data-arg="0">Aujourd’hui</button></div>`
      : monthNav(T.month, 'team-month')}
    ${lowDays.length ? `<span class="badge b-danger right">${icon('alert', 13)} ${lowDays.length} jour${lowDays.length > 1 ? 's' : ''} sous l’effectif minimum</span>` : `<span class="badge b-ok right">${icon('check', 13, 2.4)} Effectif minimum respecté</span>`}
  </div>
  <div class="tgrid-wrap"><table class="tgrid ${week ? 'week' : ''}">
    <thead><tr><th class="name wkh" style="text-align:left;padding:0 12px">${week ? 'Semaine ' + C.isoWeek(T.monday) : m.name + ' ' + m.year}</th>
      ${week ? `<th class="wkh" colspan="${keys.length}"></th>` : groups.map(g => `<th class="wkh" colspan="${g.n}">S${g.w}</th>`).join('')}<th class="tot wkh">Total</th></tr>
      <tr><th class="name" style="text-align:left;padding:0 12px">Collaborateur</th>${head}<th class="tot"></th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td class="name">Présents / jour</td>${foot}<td class="tot"></td></tr></tfoot>
  </table></div>
  <div class="legend" style="margin-top:12px">
    <span><i style="background:var(--work)"></i>Travaillé (heures)</span><span><i style="background:var(--off)"></i>Repos</span>
    <span><i style="background:var(--warn-soft)"></i>CP</span><span><i style="background:var(--violet-soft)"></i>CP ancienneté</span>
    <span><i style="background:var(--info-soft)"></i>Récupération</span><span><i style="background:var(--teal-soft)"></i>Formation</span>
    <span><i style="background:var(--muted-soft)"></i>Autre absence</span><span><i style="background:var(--brand)"></i>Modifié (trait orange)</span>
  </div>`;
}

function yearView(users) {
  const rows = users.map(u => {
    const st = St.statsOf(u);
    return `<tr ${isAdmin() ? `style="cursor:pointer" data-act="go" data-arg="planning/${u.username}"` : ''}>
      <td><div class="row" style="gap:8px">${avatar(u, 'sm')}<span style="font-weight:600" class="ellipsis">${esc(u.name)}</span>${u.isCadre ? '<span class="badge b-violet">Cadre</span>' : ''}</div></td>
      ${st.months.map(v => `<td class="num">${C.num(Math.round(v * 10) / 10)}</td>`).join('')}
      <td class="num"><b>${C.num(st.total)}</b> ${st.unit}</td><td class="num muted">${C.num(st.target)}</td>
      <td class="num"><span class="badge ${st.gapNet > 14 ? 'b-warn' : st.gapNet < -14 ? 'b-danger' : 'b-ok'}" title="Écart à l’objectif une fois les CP restants posés (brut : ${st.gap > 0 ? '+' : ''}${C.num(st.gap)})">${st.gapNet > 0 ? '+' : ''}${C.num(st.gapNet)}</span></td>
      <td class="num">${st.cp.taken}/${st.cp.alloc}</td></tr>`;
  }).join('');
  return `<div class="card"><div class="card-head"><h3>Synthèse de l’exercice ${S.period.label}</h3><span class="sub">heures (ou jours pour les cadres) planifiées par mois</span></div>
    <div class="table-wrap" style="margin-top:10px"><table class="tbl compact">
      <thead><tr><th>Collaborateur</th>${S.period.months.map(m => `<th class="num">${m.short}</th>`).join('')}<th class="num">Total</th><th class="num">Objectif</th><th class="num" title="Écart à l’objectif une fois les CP restants posés">Écart prév.</th><th class="num">CP</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`;
}

act('team-view', arg => { T.view = arg; nav.rerender(); });
act('team-month', (arg, el) => { T.month = Math.max(0, Math.min(11, argOf(arg, el))); nav.rerender(); });
act('team-week', arg => {
  const next = +arg === 0 ? C.mondayOf(C.todayKey()) : C.addDays(T.monday, 7 * +arg);
  if (C.addDays(next, 6) < S.period.startKey || next > S.period.endKey) return;
  T.monday = next; nav.rerender();
});
act('team-cell', arg => { const [u, k] = arg.split('|'); openDayEditor(u, [k]); });
