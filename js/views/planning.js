/* ═══════════════════════════════════════════════════════════════
   PLANNING INDIVIDUEL — calendrier mensuel + saisie rapide
   Collaborateur : son planning. Direction : celui de n'importe qui.
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, uid, isAdmin, hasPlanning } from '../store.js';
import { $, $$, esc, icon, avatar, toast, modal, act, confirmDialog, kpi, notice, download, typeBadge, busy } from '../ui.js';
import { nav } from '../nav.js';
import { monthNav, argOf } from './shared.js';
import { monthBars } from './dashboard.js';
import { printPlanning } from './reports.js';

const V = { month: null, mode: localStorage.getItem('planMode') || 'cal', selecting: false, sel: new Set(), user: '' };
const ctxOf = user => ({ period: S.period, locks: S.locks, holidays: S.holidays, user });
// Un administrateur peut toujours saisir (sauf absences posées et jours hors contrat)
function reasonFor(k, e, user) {
  const r = C.lockReason(k, e, ctxOf(user));
  if (!isAdmin()) return r;
  return r.startsWith('Absence') || r.startsWith('Avant') || r.startsWith('Hors') ? r : '';
}

export function render(root, params) {
  let userId = uid();
  if (isAdmin()) userId = St.userOf(params[0]) && params[0] !== 'admin' ? params[0] : (hasPlanning() ? uid() : St.team()[0]?.username);
  if (!userId || !St.userOf(userId)) { root.innerHTML = `<div class="card card-pad">Aucun collaborateur. Créez un premier profil dans <a href="#/people">Collaborateurs</a>.</div>`; return; }
  if (V.user !== userId) { V.user = userId; V.sel.clear(); V.selecting = false; }
  if (params[1] !== undefined && params[1] !== '') { V.month = Math.max(0, Math.min(11, +params[1] || 0)); history.replaceState({}, '', '#/planning' + (isAdmin() ? '/' + userId : '')); }
  if (V.month === null) V.month = C.currentMonthIndex(S.period);
  const user = St.userOf(userId), days = St.daysOf(userId), m = S.period.months[V.month];
  const st = St.statsOf(user), own = userId === uid();
  const dj = st.cadre ? 'dj' : 'h';
  const keys = C.rangeKeys(m.startKey, m.endKey);
  const monthTotal = st.months[V.month];
  const absDays = keys.filter(k => C.TYPES[days[k]?.type]).length;
  const ek = C.entryKey(user, S.period);
  const lockedMonth = C.isMonthLocked(S.locks, V.month);
  const mgr = keys.filter(k => S.mgrAbs[k] && ![0, 3].includes(C.dow(k)));

  root.innerHTML = `
  <div class="page-head">
    <div class="grow row" style="gap:12px">
      ${avatar(user, 'lg')}
      <div><h2>${own ? 'Mon planning' : esc(user.name)}</h2>
        <p>${esc(user.poste || (user.isCadre ? 'Cadre — forfait jours' : 'Collaborateur'))} · objectif ${C.num(st.target)} ${st.unitLong}${st.prorated ? ` (proratisé, entrée le ${C.disp(ek)})` : ''}</p></div>
    </div>
    ${isAdmin() ? `<select class="input" style="width:auto;min-width:200px" data-act="plan-user" data-on="change" aria-label="Collaborateur">
      ${St.team().map(u => `<option value="${u.username}" ${u.username === userId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>` : ''}
    ${own && !isAdmin() ? `<button class="btn btn-primary" data-act="absence-new">${icon('plus', 16, 2.4)} Poser une absence</button>`
      : isAdmin() ? `<button class="btn btn-primary" data-act="absence-direct" data-arg="${userId}">${icon('plus', 16, 2.4)} Saisir une absence</button>` : ''}
  </div>

  <div class="grid g4" style="margin-bottom:16px">
    ${kpi({ label: `${m.name} ${m.year}`, value: `${C.num(monthTotal)}<small> ${st.unit}</small>`, sub: `${absDays} jour${absDays > 1 ? 's' : ''} d’absence`, ic: 'cal', tone: 'teal' })}
    ${kpi({ label: 'Planifié sur l’exercice', value: `${C.num(st.total)}<small> / ${C.num(st.target)} ${st.unit}</small>`, sub: `${st.pct} % de l’objectif`, ic: 'chart', tone: 'info' })}
    ${kpi({ label: 'Réalisé à ce jour', value: `${C.num(st.doneToDate)}<small> ${st.unit}</small>`, sub: `attendu à ce stade : ${C.num(Math.round(st.expectedToDate))} ${st.unit}`, ic: 'check', tone: 'ok' })}
    ${st.gap > 0 ? kpi({ label: 'Récupération prévisionnelle', value: `+${C.num(st.gap)}<small> ${st.unit}</small>`, sub: 'au-delà de l’objectif', ic: 'trendUp', tone: 'warn' })
      : kpi({ label: 'Reste à planifier', value: `${C.num(st.remaining)}<small> ${st.unit}</small>`, sub: st.remaining ? 'pour atteindre l’objectif' : 'objectif atteint', ic: 'hourglass', tone: st.remaining > 14 ? 'brand' : 'ok' })}
  </div>

  <div class="grid g-main">
    <div class="card">
      <div class="card-head">
        ${monthNav(V.month, 'plan-month')}
        <div class="row right wrap" style="gap:8px">
          <div class="seg" role="tablist">
            <button class="${V.mode === 'cal' ? 'on' : ''}" data-act="plan-mode" data-arg="cal">${icon('grid', 14)} Calendrier</button>
            <button class="${V.mode === 'list' ? 'on' : ''}" data-act="plan-mode" data-arg="list">${icon('list', 14)} Saisie rapide</button>
          </div>
          <button class="btn ${V.selecting ? 'btn-dark' : 'btn-ghost'} btn-sm" data-act="plan-select" title="Modifier plusieurs jours d’un coup">${icon('copy', 15)}<span class="hide-m"> Sélection multiple</span></button>
        </div>
      </div>
      <div class="card-body">
        ${lockedMonth && !isAdmin() ? notice('violet', 'lock', 'Une partie de ce mois est verrouillée par la direction : les journées concernées ne sont plus modifiables.') + '<div style="height:10px"></div>' : ''}
        ${ek && m.startKey < ek ? notice('soft', 'info', `Entrée dans l’entreprise le <b>${C.disp(ek)}</b> : les jours antérieurs sont hors contrat.`) + '<div style="height:10px"></div>' : ''}
        ${mgr.length && !isAdmin() ? notice('soft', 'user', `<b>Direction absente :</b> ${mgr.map(k => `${+k.slice(8)} ${C.MONTHS_SHORT[m.month]} (${{ journee: 'journée', matin: 'matin', 'apres-midi': 'après-midi' }[S.mgrAbs[k]]})`).join(' · ')}`) + '<div style="height:10px"></div>' : ''}
        ${V.selecting ? `<div class="notice info no-print" style="margin-bottom:10px;align-items:center">${icon('copy', 17)}<div class="grow"><b id="selCount">${V.sel.size}</b> jour(s) sélectionné(s) — cliquez sur les journées à modifier.</div>
          <button class="btn btn-sm btn-ghost" data-act="plan-sel-week">Jours ouvrés du mois</button>
          <button class="btn btn-sm btn-primary" data-act="plan-sel-edit">Modifier la sélection</button></div>` : ''}
        ${V.mode === 'cal' ? calendar(keys, days, user, dj) : dayList(keys, days, user)}
        <div class="legend" style="margin-top:14px">
          <span><i style="background:var(--work)"></i>Travaillé</span><span><i style="background:var(--off)"></i>Repos</span>
          <span><i style="background:var(--warn-soft)"></i>CP</span><span><i style="background:var(--info-soft)"></i>Récupération</span>
          <span><i style="background:var(--danger-soft)"></i>Maladie</span><span><i style="background:var(--brand)"></i>Modifié avec commentaire</span>
        </div>
      </div>
    </div>

    <div class="stack" style="gap:16px">
      <div class="card">
        <div class="card-head"><h3>Semaines de ${m.name.toLowerCase()}</h3></div>
        <div style="margin-top:8px">${weeks(keys, days, user)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Exercice ${S.period.label}</h3><span class="sub">cliquez sur un mois</span></div>
        <div class="card-body">${monthBars(st, 'plan-month', i => i)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Planning type</h3><span class="sub">${C.num(C.tpWeekTotal(C.tpOf(user)))} ${dj} / semaine</span></div>
        <div class="card-body">
          <div class="tp-grid">${C.WEEK_ORDER.map(d => `<div style="text-align:center"><div class="lbl">${C.cap(d).slice(0, 3)}</div><div style="font-weight:800;font-size:16px">${C.num(C.tpOf(user)[d])}</div></div>`).join('')}</div>
          ${isAdmin() ? `<div class="row wrap" style="margin-top:14px;gap:8px">
            <button class="btn btn-soft btn-sm" data-act="plan-apply-tp" data-arg="month">Réappliquer sur ${m.name.toLowerCase()}</button>
            <button class="btn btn-soft btn-sm" data-act="user-edit" data-arg="${userId}">${icon('edit', 14)} Modifier</button></div>` : '<p class="muted" style="font-size:12.5px;margin-top:10px">Défini par la direction. Il sert de base à votre planning annuel.</p>'}
        </div>
      </div>
      <div class="card card-pad row wrap no-print" style="gap:8px">
        <button class="btn btn-ghost btn-sm" data-act="plan-ics">${icon('download', 15)} Agenda (.ics)</button>
        <button class="btn btn-ghost btn-sm" data-act="plan-print">${icon('print', 15)} Imprimer le mois</button>
      </div>
    </div>
  </div>
  <div class="sheet-print" id="printArea"></div>`;

  root.onchange = e => { if (e.target.classList.contains('dl-h') || e.target.classList.contains('dl-n')) commitRow(e.target); };
  root.onkeydown = e => {
    const el = e.target;
    if (!el.classList?.contains('dl-h')) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 0.5, cur = parseFloat(el.value.replace(',', '.')) || 0;
      el.value = Math.max(0, Math.min(24, cur + (e.key === 'ArrowUp' ? step : -step))) || '';
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const all = $$('.dl-h:not([readonly])', root), i = all.indexOf(el);
      el.blur();
      setTimeout(() => { const n = $$('.dl-h:not([readonly])', root)[i + (e.shiftKey ? -1 : 1)]; if (n && !document.querySelector('.overlay')) { n.focus(); n.select(); } }, 60);
    }
  };
}

/* ─── Calendrier ─── */
function cellInfo(k, days, user) {
  const e = days[k] || {}, state = C.dayState(e), t = C.TYPES[e.type];
  const hol = S.holidays[k], sunOpen = C.dow(k) === 0 && S.openSundays[k];
  const reason = reasonFor(k, e, user);
  let tag = '';
  if (t) tag = t.label;
  else if (hol) tag = hol.name + (hol.open ? ' (ouvert)' : '');
  else if (sunOpen) tag = sunOpen.note || 'Dimanche ouvert';
  else if (e.beforeEntry) tag = 'Hors contrat';
  return { e, state, t, hol, sunOpen, reason, tag };
}
function calendar(keys, days, user, dj) {
  const offset = (C.dow(keys[0]) + 6) % 7, today = C.todayKey();
  let cells = '<div class="cd blank"></div>'.repeat(offset);
  for (const k of keys) {
    const { e, state, t, hol, sunOpen, reason, tag } = cellInfo(k, days, user);
    const cls = ['cd', state === 'abs' ? 'abs t-' + t.cls : state];
    if (k === today) cls.push('today');
    if (reason) cls.push('locked');
    if (e.modifiedByUser) cls.push('mod');
    if (V.sel.has(k)) cls.push('sel');
    const h = C.hoursOf(e);
    cells += `<button class="${cls.join(' ')}" data-act="plan-day" data-arg="${k}" title="${esc(C.cap(C.longDate(k)) + (e.note ? ' — ' + e.note : '') + (reason ? ' — ' + reason : ''))}">
      <span class="dn"><b>${+k.slice(8)}</b></span>
      <span class="flag">${hol ? icon('flag', 12, 2.2) : ''}${sunOpen ? icon('sun', 12, 2.2) : ''}${reason && state !== 'abs' ? icon('lock', 12, 2.2) : ''}</span>
      ${tag ? `<span class="tg">${esc(tag)}</span>` : ''}
      <span class="hh">${state === 'abs' ? (h && t.worked ? C.num(h) + `<small> ${dj}</small>` : t.short) : h ? C.num(h) + `<small> ${dj}</small>` : (e.recupDeducted ? '0' : '—')}</span></button>`;
  }
  return `<div class="cal-dow">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => `<span>${d}</span>`).join('')}</div><div class="cal">${cells}</div>`;
}

/* ─── Saisie rapide (liste) ─── */
function dayList(keys, days, user) {
  const today = C.todayKey();
  return `<div class="daylist card" style="box-shadow:none">${keys.map(k => {
    const { e, state, t, reason, tag } = cellInfo(k, days, user);
    const d = C.dow(k), h = C.hoursOf(e);
    const ro = reason ? 'readonly' : '';
    return `<div class="dl ${d === 0 ? 'sun' : d === 6 ? 'we' : ''} ${k === today ? 'today' : ''}">
      ${V.selecting && !reason ? `<input type="checkbox" data-act="plan-day" data-arg="${k}" ${V.sel.has(k) ? 'checked' : ''} aria-label="Sélectionner">` : '<span></span>'}
      <div><b>${C.cap(C.DAYS[d])} ${+k.slice(8)}</b>${tag ? ` <span class="badge ${t ? 't-' + t.cls : 'b-muted'}" style="margin-left:4px">${esc(t ? t.short : tag)}</span>` : ''}${e.modifiedByUser ? ` <span class="badge b-brand" title="${esc(e.modifComment || '')}">modifié</span>` : ''}</div>
      <span class="wk">S${C.isoWeek(k)}</span>
      <input class="input dl-h" data-k="${k}" inputmode="decimal" value="${state === 'abs' && !t.worked ? t.short : (h || '')}" placeholder="0" ${ro} ${reason ? `title="${esc(reason)}"` : ''} aria-label="Heures du ${C.longDate(k)}">
      <input class="input dl-n note" data-k="${k}" value="${esc(e.note || '')}" placeholder="Note…" ${ro} aria-label="Note">
      <span></span></div>`;
  }).join('')}</div>
  <p class="muted" style="font-size:12px;margin-top:8px">Astuce : ↑ ↓ ajustent de 0,5 h (Maj : 1 h), Entrée valide et passe au jour suivant.</p>`;
}
async function commitRow(el) {
  const k = el.dataset.k, userId = V.user, ex = St.daysOf(userId)[k] || {};
  if (el.classList.contains('dl-n')) {
    if ((ex.note || '') !== el.value) await St.editDays(userId, [k], { note: el.value });
    return;
  }
  const v = Math.max(0, Math.min(24, parseFloat(el.value.replace(',', '.')) || 0));
  if (v === C.hoursOf(ex)) { el.value = v || ''; return; }
  let comment = '';
  if (!isAdmin()) {
    const res = await confirmDialog({
      title: 'Commentaire obligatoire', iconName: 'edit', ok: 'Valider',
      text: `Modification du <b>${C.longDate(k)}</b> : ${C.num(C.hoursOf(ex))} h → <b>${C.num(v)} h</b>. Indiquez la raison, elle sera visible par la direction.`,
      input: { label: 'Commentaire', placeholder: 'Raison de la modification…', required: true, requiredMsg: 'Le commentaire est obligatoire.' }
    });
    if (res === false) { el.value = C.hoursOf(ex) || ''; return; }
    comment = res;
  }
  await St.editDays(userId, [k], { hours: v, comment });
  toast('Journée enregistrée', 'success');
  const y = window.scrollY; nav.rerender(); window.scrollTo(0, y);
}

/* ─── Récapitulatif par semaine ─── */
function weeks(keys, days, user) {
  const groups = [];
  for (const k of keys) {
    const w = C.isoWeek(k);
    if (!groups.length || groups[groups.length - 1].w !== w) groups.push({ w, monday: C.mondayOf(k) });
  }
  const base = C.tpWeekTotal(C.tpOf(user));
  return `<div class="list">${groups.map(g => {
    const all = C.rangeKeys(g.monday, C.addDays(g.monday, 6));
    const tot = all.reduce((s, k) => s + (C.isWorked(days[k]) && !C.TYPES[days[k]?.type] ? C.hoursOf(days[k]) : 0), 0);
    const abs = all.filter(k => C.TYPES[days[k]?.type]).length;
    const over = !user.isCadre && tot > 48;
    return `<div class="li"><span class="ic-b tone-${over ? 'danger' : 'muted'}" style="font-size:11px;font-weight:800">S${g.w}</span>
      <div class="grow"><div class="t">${C.shortDate(g.monday)} → ${C.shortDate(C.addDays(g.monday, 6))}</div>
        <div class="s">${abs ? `${abs} j d’absence · ` : ''}base ${C.num(base)} ${user.isCadre ? 'dj' : 'h'}${over ? ' · <b style="color:var(--danger-ink)">dépasse 48 h</b>' : ''}</div></div>
      <b class="tnum">${C.num(tot)} ${user.isCadre ? 'dj' : 'h'}</b></div>`;
  }).join('')}</div>`;
}

/* ─── Éditeur de journée(s) ─── */
export function openDayEditor(userId, keys) {
  const user = St.userOf(userId), days = St.daysOf(userId);
  keys = [...keys].sort();
  const single = keys.length === 1, k = keys[0];
  const e = days[k] || {}, t = C.TYPES[e.type];
  const cadre = !!user.isCadre, unit = cadre ? 'demi-journées' : 'heures';
  const editable = keys.filter(x => !reasonFor(x, days[x], user));
  const reason = single ? reasonFor(k, e, user) : '';
  const hol = single && S.holidays[k], sunOpen = single && C.dow(k) === 0 && S.openSundays[k];
  const tpH = single ? (parseFloat(C.tpOf(user)[C.DAYS[C.dow(k)]]) || 0) : null;
  const cur = single ? C.hoursOf(e) : '';
  const quick = cadre ? [0, 1, 2] : [...new Set([0, tpH || 7, 4, 7, 8, 9])].sort((a, b) => a - b);
  const req = single && e.absenceId ? S.requests.find(r => r.id === e.absenceId) : null;

  let body = `<div style="text-align:center;padding:2px 0 14px">
      <div style="font-size:24px;font-weight:800;letter-spacing:-.03em">${single ? C.cap(C.longDate(k, true)) : `${keys.length} journées`}</div>
      <div class="muted">${single ? `Semaine ${C.isoWeek(k)} · ${esc(user.name)}` : `${esc(user.name)} · du ${C.disp(keys[0])} au ${C.disp(keys[keys.length - 1])}`}</div></div>`;
  if (hol) body += notice(hol.open ? 'warn' : 'danger', 'flag', `<b>Jour férié :</b> ${esc(hol.name)} — magasin ${hol.open ? 'ouvert' : 'fermé'}`) + '<div style="height:8px"></div>';
  if (sunOpen) body += notice('violet', 'sun', `<b>Dimanche ouvert :</b> ${esc(sunOpen.note || '')}`) + '<div style="height:8px"></div>';
  if (single && t) body += notice('soft', t.icon, `<b>${esc(t.label)}</b>${e.note ? ' — ' + esc(e.note) : ''}${e.prev ? `<br>Avant l’absence : ${C.num(e.prev.hours)} ${cadre ? 'dj' : 'h'} prévues.` : ''}`) + '<div style="height:8px"></div>';
  if (single && !t && e.recupDeducted) body += notice('info', 'clock', esc(e.note || '')) + '<div style="height:8px"></div>';
  if (single && e.modifiedByUser) body += notice('soft', 'edit', `<b>Modifié par le collaborateur :</b> ${esc(e.modifComment || '')}`) + '<div style="height:8px"></div>';
  let foot = '<button class="btn btn-ghost" data-close>Fermer</button>';

  if (single && reason) {
    body += notice('warn', 'lock', esc(reason));
    if (t && isAdmin()) foot += `<button class="btn btn-danger-soft" id="deRemove">${icon('undo', 16)} Retirer l’absence de ce jour</button>`;
    if (req) foot += `<button class="btn btn-soft" data-act="${isAdmin() ? 'go' : 'req-open'}" data-arg="${isAdmin() ? 'requests' : req.id}">Voir la demande</button>`;
  } else if (!editable.length) {
    body += notice('warn', 'lock', 'Aucune des journées sélectionnées n’est modifiable (absences, fériés fermés ou période verrouillée).');
  } else {
    if (!single && editable.length < keys.length) body += notice('soft', 'info', `${keys.length - editable.length} journée(s) ignorée(s) : absence, férié fermé ou période verrouillée.`) + '<div style="height:8px"></div>';
    body += `<div class="field"><label>${cadre ? 'Demi-journées travaillées' : 'Heures travaillées'}</label>
        <div class="row" style="gap:8px">
          <button class="btn btn-soft btn-icon" id="deMinus" aria-label="Moins">–</button>
          <input class="input" id="deHours" type="number" inputmode="decimal" step="${cadre ? 1 : 0.5}" min="0" max="${cadre ? 2 : 24}" value="${cur}" placeholder="0" style="text-align:center;font-size:20px;font-weight:800;height:48px" autofocus>
          <button class="btn btn-soft btn-icon" id="dePlus" aria-label="Plus">+</button></div>
        <div class="chips" style="margin-top:8px">${quick.map(q => `<button class="chip" data-q="${q}">${q === 0 ? 'Repos' : C.num(q) + (cadre ? ' dj' : ' h')}${single && q === tpH && q > 0 ? ' · type' : ''}</button>`).join('')}</div>
        <small>0 = jour de repos. ${cadre ? '2 demi-journées = 1 jour travaillé.' : ''}</small></div>
      ${isAdmin() ? `<div class="field" style="margin-top:12px"><label>Note (facultative)</label><input class="input" id="deNote" value="${single ? esc(e.modifiedByUser ? '' : (e.note || '')) : ''}" placeholder="Visible sur le planning"></div>`
        : `<div class="field" style="margin-top:12px"><label>Commentaire (obligatoire)</label><textarea class="input" id="deComment" rows="2" placeholder="Raison de la modification — visible par la direction"></textarea></div>`}`;
    foot += `<button class="btn btn-primary" id="deSave">${icon('check', 16, 2.4)} Enregistrer</button>`;
  }
  const m = modal({ title: single ? 'Journée' : 'Modifier plusieurs journées', iconName: 'cal', body, foot });
  const inp = $('#deHours', m.el);
  const step = cadre ? 1 : 0.5, max = cadre ? 2 : 24;
  const bump = d => { inp.value = Math.max(0, Math.min(max, (parseFloat(inp.value) || 0) + d)); };
  $('#deMinus', m.el)?.addEventListener('click', () => bump(-step));
  $('#dePlus', m.el)?.addEventListener('click', () => bump(step));
  m.el.addEventListener('click', ev => { const q = ev.target.closest('[data-q]'); if (q) inp.value = q.dataset.q; });
  $('#deSave', m.el)?.addEventListener('click', async ev => {
    const hours = Math.max(0, Math.min(max, parseFloat(inp.value) || 0));
    const comment = ($('#deComment', m.el)?.value || '').trim();
    const note = $('#deNote', m.el)?.value;
    if (!isAdmin() && !comment) { toast('Le commentaire est obligatoire.', 'error'); $('#deComment', m.el).focus(); return; }
    const n = await busy(ev.currentTarget, () => St.editDays(userId, editable, { hours, comment, ...(isAdmin() && note !== undefined && (single || note) ? { note } : {}) }));
    m.close(); V.sel.clear(); V.selecting = false;
    toast(n > 1 ? `${n} journées enregistrées` : 'Journée enregistrée', 'success');
    nav.rerender();
  });
  $('#deRemove', m.el)?.addEventListener('click', async ev => {
    await busy(ev.currentTarget, async () => {
      const after = C.removeAbsence(days, { id: e.absenceId || '_', type: e.type, date: k, dateEnd: k }, user, S.holidays, S.period);
      if (after) await St.saveDays(userId, { [k]: after[k] });
      St.audit('absence_day_removed', `${S.me.name} a retiré « ${e.type} » du ${C.disp(k)} pour ${user.name}`);
    });
    m.close(); toast('Absence retirée de cette journée', 'success'); nav.rerender();
  });
}

/* ─── Actions ─── */
act('plan-month', (arg, el) => { V.month = Math.max(0, Math.min(11, argOf(arg, el))); V.sel.clear(); nav.rerender(); });
act('plan-mode', arg => { V.mode = arg; localStorage.setItem('planMode', arg); nav.rerender(); });
act('plan-user', (_, el) => { V.sel.clear(); nav.go('planning/' + el.value); });
act('plan-select', () => { V.selecting = !V.selecting; V.sel.clear(); nav.rerender(); });
act('plan-day', (k, el) => {
  if (!V.selecting) return openDayEditor(V.user, [k]);
  if (V.sel.has(k)) V.sel.delete(k); else V.sel.add(k);
  if (el.classList.contains('cd')) el.classList.toggle('sel', V.sel.has(k));
  const c = $('#selCount'); if (c) c.textContent = V.sel.size;
});
act('plan-sel-week', () => {
  const m = S.period.months[V.month], user = St.userOf(V.user), days = St.daysOf(V.user);
  C.rangeKeys(m.startKey, m.endKey).filter(k => C.dow(k) !== 0 && !reasonFor(k, days[k], user) && C.hoursOf(days[k]) > 0).forEach(k => V.sel.add(k));
  nav.rerender();
});
act('plan-sel-edit', () => { if (!V.sel.size) return toast('Sélectionnez au moins une journée.', 'warning'); openDayEditor(V.user, [...V.sel]); });
act('plan-apply-tp', async () => {
  const m = S.period.months[V.month], user = St.userOf(V.user);
  const ok = await confirmDialog({
    title: 'Réappliquer le planning type', ok: 'Réappliquer', danger: true,
    text: `Les heures de <b>${m.name.toLowerCase()} ${m.year}</b> de ${esc(user.name)} seront remplacées par son planning type. Les absences et les jours fériés fermés sont conservés.`
  });
  if (!ok) return;
  await St.reapplyTypePlanning(V.user, { from: m.startKey, to: m.endKey });
  toast('Planning type appliqué sur le mois', 'success'); nav.rerender();
});
act('plan-ics', () => {
  const user = St.userOf(V.user);
  download(`planning-${user.username}-${S.period.label}.ics`, C.buildICS(user, St.daysOf(V.user), S.period, S.store.storeName), 'text/calendar;charset=utf-8');
  toast('Fichier agenda téléchargé — ouvrez-le pour l’ajouter à votre calendrier', 'success');
});
act('plan-print', () => { const m = S.period.months[V.month]; printPlanning([St.userOf(V.user)], m.startKey, m.endKey); });
