/* ═══════════════════════════════════════════════════════════════
   ACCUEIL — tableau de bord direction / espace collaborateur
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, uid, isAdmin, hasPlanning } from '../store.js';
import { esc, icon, avatar, kpi, ring, empty, typeBadge, statusBadge, notice } from '../ui.js';
import { requestCard } from './shared.js';

const hello = () => { const h = new Date().getHours(); return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'; };
const first = n => (n || '').split(' ')[0];

export function render(root) {
  root.innerHTML = isAdmin() ? adminHome() : employeeHome();
}

/* ─── Effectif sur 14 jours ─── */
function coverage(daysCount = 14) {
  const today = C.todayKey(), users = St.team();
  const keys = C.rangeKeys(today, C.addDays(today, daysCount - 1));
  const max = Math.max(1, users.length);
  const cols = keys.map(k => {
    const need = St.minStaff(k), n = C.presentCount(users, S.schedules, k);
    const closed = !need && n === 0;
    const cls = closed ? 'closed' : need && n < need ? 'low' : need && n === need ? 'edge' : '';
    return `<div class="col ${k === today ? 'today' : ''}" title="${C.cap(C.longDate(k))} — ${n} présent(s)${need ? ', minimum ' + need : ''}">
      <span class="val">${closed ? '–' : n}</span>
      <div class="bar ${cls}" style="height:${closed ? 4 : Math.max(6, Math.round(n / max * 78))}px"></div>
      <span class="day">${C.DAYS_SHORT[C.dow(k)]}<br>${+k.slice(8)}</span></div>`;
  }).join('');
  return `<div class="cov" style="--n:${daysCount}">${cols}</div>
    <div class="legend" style="margin-top:12px"><span><i style="background:var(--ok)"></i>Effectif suffisant</span><span><i style="background:var(--warn)"></i>Au minimum</span><span><i style="background:var(--danger)"></i>Sous le minimum</span></div>`;
}

function upcomingAbsences(limit = 7, onlyOthers = false) {
  const today = C.todayKey(), horizon = C.addDays(today, 21);
  const list = [];
  for (const u of St.team()) {
    if (onlyOthers && u.username === uid()) continue;
    const days = S.schedules[u.username] || {};
    let cur = null;
    for (const k of C.rangeKeys(today, horizon)) {
      const t = C.TYPES[days[k]?.type] ? days[k].type : null;
      if (t && cur && cur.type === t && (C.addDays(cur.to, 1) === k || (C.dow(k) === 1 && C.addDays(cur.to, 2) === k))) cur.to = k;
      else { if (cur) list.push(cur); cur = t ? { user: u, type: t, from: k, to: k } : null; }
    }
    if (cur) list.push(cur);
  }
  list.sort((a, b) => a.from.localeCompare(b.from));
  if (!list.length) return empty('sun', 'Aucune absence prévue', 'Toute l’équipe est planifiée sur les 3 prochaines semaines.');
  return `<div class="list">${list.slice(0, limit).map(a => `<div class="li">${avatar(a.user, 'sm')}
    <div class="grow"><div class="t ellipsis">${esc(a.user.name)}</div><div class="s">${a.from === a.to ? C.cap(C.longDate(a.from)) : `du ${C.shortDate(a.from)} au ${C.shortDate(a.to)}`}</div></div>
    ${typeBadge(a.type)}</div>`).join('')}</div>`;
}

/* ─── Direction ─── */
function adminHome() {
  const today = C.todayKey(), users = St.team();
  const present = users.filter(u => { const e = S.schedules[u.username]?.[today]; return e && C.hoursOf(e) > 0 && !C.TYPES[e.type]; });
  const absent = C.absentList(users, S.schedules, today);
  const pend = St.pendingRequests(), vanP = St.pendingVan();
  const alerts = St.teamAlerts();
  const crit = alerts.filter(a => a.level === 'critical'), warn = alerts.filter(a => a.level === 'warning');
  const need = St.minStaff(today);
  const prog = Math.round(C.periodProgress(S.period) * 100);
  const stats = users.map(u => ({ u, st: St.statsOf(u) }));
  const defaultPw = S.me.password === 'admin123' || S.me.mustChangePassword;

  return `
  <div class="page-head">
    <div class="grow"><h2>${hello()}, ${esc(first(S.me.name))}</h2>
      <p>${C.cap(C.longDate(today, true))} · exercice ${S.period.label} écoulé à ${prog} %</p></div>
    <button class="btn btn-ghost" data-act="absence-direct">${icon('plus', 16, 2.4)} Saisir une absence</button>
    <button class="btn btn-primary" data-act="go" data-arg="team">${icon('team', 16)} Planning équipe</button>
  </div>
  ${defaultPw ? `<div style="margin-bottom:16px">${notice('warn', 'key', '<b>Mot de passe par défaut.</b> Le compte direction utilise encore le mot de passe d’origine. <a href="#/profile">Le changer maintenant</a>.')}</div>` : ''}

  <div class="grid g4" style="margin-bottom:16px">
    ${kpi({ label: 'Présents aujourd’hui', value: `${present.length}<small> / ${users.length}</small>`, sub: need ? (present.length < need ? `⚠ minimum attendu : ${need}` : `minimum attendu : ${need}`) : 'magasin fermé ou sans seuil', ic: 'team', tone: need && present.length < need ? 'danger' : 'ok', act: 'go', arg: 'team' })}
    ${kpi({ label: 'Absents aujourd’hui', value: absent.length, sub: absent.length ? esc(absent.slice(0, 3).map(a => first(a.user.name)).join(', ')) + (absent.length > 3 ? '…' : '') : 'personne', ic: 'leave', tone: 'info', act: 'go', arg: 'requests/calendar' })}
    ${kpi({ label: 'Demandes à traiter', value: pend.length + vanP.length, sub: `${pend.length} absence${pend.length > 1 ? 's' : ''} · ${vanP.length} camionnette`, ic: 'inbox', tone: pend.length + vanP.length ? 'brand' : 'muted', act: 'go', arg: 'requests' })}
    ${kpi({ label: 'Alertes', value: crit.length + warn.length, sub: `${crit.length} critique${crit.length > 1 ? 's' : ''} · ${warn.length} vigilance`, ic: 'alert', tone: crit.length ? 'danger' : warn.length ? 'warn' : 'ok', act: 'go', arg: 'alerts' })}
  </div>

  <div class="grid g-main">
    <div class="stack" style="gap:16px">
      <div class="card">
        <div class="card-head"><h3>À traiter</h3><span class="sub">${pend.length ? 'décision en un clic, impact sur l’effectif affiché' : ''}</span>
          <button class="btn btn-soft btn-sm right" data-act="go" data-arg="requests">Toutes les demandes</button></div>
        <div style="margin-top:8px">${pend.length ? pend.slice(0, 4).map(r => requestCard(r)).join('')
          : empty('check', 'Rien à traiter', 'Toutes les demandes de l’équipe sont à jour.')}</div>
        ${vanP.length ? `<button class="li" style="display:flex;gap:12px;padding:12px 20px;width:100%;border-top:1px solid var(--line);align-items:center;text-align:left" data-act="go" data-arg="requests/van">
          <span class="ic-b tone-info">${icon('van', 16)}</span><span class="grow"><b>${vanP.length} demande${vanP.length > 1 ? 's' : ''} d’emprunt de la camionnette</b></span>${icon('right', 15)}</button>` : ''}
      </div>
      <div class="card">
        <div class="card-head"><h3>Effectif des 14 prochains jours</h3><span class="sub">collaborateurs présents par jour</span></div>
        <div class="card-body">${coverage(14)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Compteurs de l’équipe</h3><span class="sub">planifié sur l’exercice · le trait marque l’objectif</span>
          <button class="btn btn-soft btn-sm right" data-act="go" data-arg="people">Détail</button></div>
        <div class="table-wrap" style="margin-top:8px"><table class="tbl compact">
          <thead><tr><th>Collaborateur</th><th style="min-width:150px">Avancement</th><th class="num">Planifié</th><th class="num">Objectif</th><th class="num" title="Écart à l’objectif une fois les CP restants posés">Écart prév.</th><th class="num">CP restants</th></tr></thead>
          <tbody>${stats.map(({ u, st }) => {
            const scale = Math.max(st.target, st.total) * 1.05 || 1;
            return `<tr style="cursor:pointer" data-act="go" data-arg="planning/${u.username}">
              <td><div class="row">${avatar(u, 'sm')}<span class="ellipsis" style="font-weight:600">${esc(u.name)}</span></div></td>
              <td><div class="progress" title="Réalisé à date : ${C.num(st.doneToDate)} ${st.unit}"><i class="${st.gapNet > 14 ? 'warn' : st.gapNet < -14 ? '' : 'ok'}" style="width:${Math.min(100, st.total / scale * 100)}%"></i><span class="mark" style="left:${st.target / scale * 100}%"></span></div></td>
              <td class="num">${C.num(st.total)} ${st.unit}</td><td class="num muted">${C.num(st.target)}</td>
              <td class="num"><span class="badge ${st.gapNet > 14 ? 'b-warn' : st.gapNet < -14 ? 'b-danger' : 'b-ok'}" title="Écart à l’objectif une fois les CP restants posés (brut : ${st.gap > 0 ? '+' : ''}${C.num(st.gap)})">${st.gapNet > 0 ? '+' : ''}${C.num(st.gapNet)}</span></td>
              <td class="num">${st.cp.left} j</td></tr>`;
          }).join('')}</tbody></table></div>
      </div>
    </div>
    <div class="stack" style="gap:16px">
      <div class="card">
        <div class="card-head"><h3>Aujourd’hui au magasin</h3></div>
        <div class="card-body">
          <div class="lbl" style="margin-bottom:8px">Présents (${present.length})</div>
          <div class="row wrap" style="gap:6px;margin-bottom:14px">${present.length ? present.map(u => `<span class="badge b-ok" style="height:28px;padding:0 9px 0 3px">${avatar(u, 'sm')}&nbsp;${esc(first(u.name))} · ${C.num(C.hoursOf(S.schedules[u.username][today]))}${u.isCadre ? ' dj' : ' h'}</span>`).join('') : '<span class="muted">Personne de planifié.</span>'}</div>
          <div class="lbl" style="margin-bottom:8px">Absents (${absent.length})</div>
          <div class="row wrap" style="gap:6px">${absent.length ? absent.map(a => `<span class="badge t-${C.TYPES[a.type].cls}" style="height:28px">${esc(first(a.user.name))} · ${C.TYPES[a.type].short}</span>`).join('') : '<span class="muted">Aucune absence.</span>'}</div>
          ${S.mgrAbs[today] ? `<div style="margin-top:12px">${notice('violet', 'user', `Direction absente aujourd’hui (${{ journee: 'journée', matin: 'matin', 'apres-midi': 'après-midi' }[S.mgrAbs[today]]}).`)}</div>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Absences à venir</h3><span class="sub">3 semaines</span></div>
        <div style="margin-top:8px">${upcomingAbsences(7)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Alertes prioritaires</h3><button class="btn btn-soft btn-sm right" data-act="go" data-arg="alerts">Tout voir</button></div>
        <div style="margin-top:8px">${[...crit, ...warn].length ? `<div class="list">${[...crit, ...warn].slice(0, 5).map(a => `<button class="li" data-act="go" data-arg="planning/${a.user.username}">
          <span class="ic-b tone-${a.level === 'critical' ? 'danger' : 'warn'}">${icon(a.icon, 16)}</span>
          <span class="grow"><span class="t" style="display:block">${esc(a.user.name)} — ${esc(a.title)}</span><span class="s">${esc(a.detail)}</span></span></button>`).join('')}</div>`
          : empty('shield', 'Aucune alerte', 'Les compteurs de l’équipe sont conformes.')}</div>
      </div>
    </div>
  </div>`;
}

/* ─── Collaborateur ─── */
function employeeHome() {
  const today = C.todayKey();
  const st = St.statsOf(S.me), days = St.myDays();
  const waiting = S.requests.filter(r => ['pending', 'cancel_pending', 'waiting'].includes(r.status));
  const next = S.requests.filter(r => ['approved', 'waiting', 'pending', 'cancel_pending'].includes(r.status) && (r.dateEnd || r.date) >= today)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0];
  const mon = C.mondayOf(today);
  const week = C.rangeKeys(mon, C.addDays(mon, 6));
  const weekTotal = week.reduce((s, k) => s + (C.isWorked(days[k]) ? C.hoursOf(days[k]) : 0), 0);
  const dj = st.cadre ? ' dj' : ' h';
  const strip = week.map(k => {
    const e = days[k] || {}, state = C.dayState(e), t = C.TYPES[e.type];
    return `<button class="wd ${k === today ? 'today' : ''} ${state === 'abs' ? 't-' + t.cls : state}" data-act="go" data-arg="planning">
      <div class="n">${C.DAYS_SHORT[C.dow(k)]}</div><div class="d">${+k.slice(8)}</div>
      <div class="h">${state === 'abs' ? t.short : state === 'work' ? C.num(C.hoursOf(e)) + dj : S.holidays[k] && !S.holidays[k].open ? 'Férié' : 'Repos'}</div></button>`;
  }).join('');
  const todayE = days[today] || {};
  const todayTxt = C.TYPES[todayE.type] ? C.TYPES[todayE.type].label : C.hoursOf(todayE) > 0 ? `${C.num(C.hoursOf(todayE))}${dj} prévues aujourd’hui` : 'Repos aujourd’hui';
  const anns = St.pendingAnnouncements();

  return `
  <div class="hero" style="margin-bottom:16px">
    ${ring(st.pct, 120, st.gap > 0 ? '#34D399' : 'var(--brand-2)')}
    <div class="grow" style="position:relative;z-index:1">
      <h2>${hello()}, ${esc(first(S.me.name))}</h2>
      <p>${C.cap(C.longDate(today))} · ${todayTxt}</p>
      <div class="facts">
        <div class="fact"><div class="n tnum">${C.num(st.total)}<small> / ${C.num(st.target)} ${st.unit}</small></div><div class="d">planifiées sur l’exercice${st.prorated ? ' (proratisé)' : ''}</div></div>
        <div class="fact"><div class="n tnum">${C.num(st.doneToDate)}<small> ${st.unit}</small></div><div class="d">réalisées à ce jour</div></div>
        <div class="fact"><div class="n tnum" style="color:${st.gap > 0 ? '#6EE7B7' : '#fff'}">${st.gap > 0 ? '+' + C.num(st.gap) : C.num(st.remaining)}<small> ${st.unit}</small></div><div class="d">${st.gap > 0 ? 'de récupération' : 'restant à planifier'}</div></div>
      </div>
    </div>
    <button class="btn btn-primary btn-lg" data-act="absence-new" style="position:relative;z-index:1">${icon('plus', 18, 2.4)} Poser une absence</button>
  </div>

  ${anns.length ? `<div style="margin-bottom:16px">${notice('violet', 'megaphone', `<b>${anns.length} annonce${anns.length > 1 ? 's' : ''} à lire.</b> <a href="#" data-act="show-ann">Afficher</a>`)}</div>` : ''}

  <div class="grid g4" style="margin-bottom:16px">
    ${kpi({ label: 'CP restants', value: `${st.cp.left}<small> / ${st.cp.alloc} j</small>`, sub: `${st.cp.taken} posé${st.cp.taken > 1 ? 's' : ''}`, ic: 'sun', tone: 'warn', act: 'go', arg: 'absences' })}
    ${st.anc.alloc ? kpi({ label: 'CP ancienneté', value: `${st.anc.left}<small> / ${st.anc.alloc} j</small>`, sub: `${st.anc.taken} posé${st.anc.taken > 1 ? 's' : ''}`, ic: 'star', tone: 'violet', act: 'go', arg: 'absences' })
      : kpi({ label: 'Cette semaine', value: `${C.num(weekTotal)}<small>${dj}</small>`, sub: `semaine ${C.isoWeek(today)}`, ic: 'cal', tone: 'teal', act: 'go', arg: 'planning' })}
    ${kpi({ label: 'Récupération disponible', value: `${C.num(st.recup)}<small> ${st.unit}</small>`, sub: st.recup > 0 ? 'au-delà de l’objectif' : 'objectif non dépassé', ic: 'clock', tone: st.recup > 0 ? 'ok' : 'muted', act: 'go', arg: 'absences' })}
    ${kpi({ label: 'Demandes en cours', value: waiting.length, sub: waiting.length ? 'en attente de réponse' : 'aucune en attente', ic: 'inbox', tone: waiting.length ? 'brand' : 'muted', act: 'go', arg: 'absences' })}
  </div>

  <div class="grid g-main">
    <div class="stack" style="gap:16px">
      <div class="card">
        <div class="card-head"><h3>Ma semaine</h3><span class="sub">semaine ${C.isoWeek(today)} · ${C.num(weekTotal)}${dj}</span>
          <button class="btn btn-soft btn-sm right" data-act="go" data-arg="planning">Voir le mois</button></div>
        <div class="card-body"><div class="weekstrip">${strip}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Mon exercice ${S.period.label}</h3><span class="sub">${st.unitLong} par mois</span></div>
        <div class="card-body">${monthBars(st)}</div>
      </div>
    </div>
    <div class="stack" style="gap:16px">
      <div class="card">
        <div class="card-head"><h3>Prochaine absence</h3></div>
        ${next ? `<div class="list" style="margin-top:8px"><button class="li" data-act="req-open" data-arg="${next.id}">
          <span class="ic-b lg t-${C.TYPES[next.type]?.cls || 'aut'}">${icon(C.TYPES[next.type]?.icon || 'leave', 20)}</span>
          <span class="grow"><span class="t" style="display:block">${esc(C.TYPES[next.type]?.label || next.type)}</span><span class="s">${esc(next.dateLabel || C.disp(next.date))} · ${esc(next.qLabel || '')}</span></span>
          ${statusBadge(next.status)}</button></div>` : empty('sun', 'Aucune absence prévue', 'Posez vos congés depuis « Mes absences ».')}
      </div>
      <div class="card">
        <div class="card-head"><h3>Absences dans l’équipe</h3><span class="sub">3 semaines</span></div>
        <div style="margin-top:8px">${upcomingAbsences(6, true)}</div>
      </div>
    </div>
  </div>`;
}

export function monthBars(st, action = 'go', argFn = i => `planning/${uid()}/${i}`) {
  const max = Math.max(1, ...st.months);
  const cur = C.currentMonthIndex(S.period);
  return `<div class="bars">${S.period.months.map((m, i) => `
    <button class="b ${i < cur ? 'past' : i === cur ? 'cur' : 'fut'}" data-act="${action}" data-arg="${argFn(i)}" title="${m.name} ${m.year} : ${C.num(st.months[i])} ${st.unit}">
      <em class="tnum">${C.num(Math.round(st.months[i]))}</em><i style="height:${Math.round(st.months[i] / max * 100)}px"></i><span>${m.short.replace('.', '')}</span></button>`).join('')}</div>`;
}
