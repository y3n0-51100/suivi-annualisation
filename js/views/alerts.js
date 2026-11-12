/* ═══════════════════════════════════════════════════════════════
   ALERTES & CONFORMITÉ (direction)
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S } from '../store.js';
import { esc, icon, avatar, act, empty, kpi } from '../ui.js';
import { nav } from '../nav.js';

const A = { level: 'all' };
const LV = { critical: ['Critique', 'danger'], warning: ['Vigilance', 'warn'], info: ['Info', 'info'] };

export function render(root) {
  const all = St.teamAlerts();
  const n = l => all.filter(a => a.level === l).length;
  const users = St.team();
  const okUsers = users.filter(u => !all.some(a => a.user.username === u.username && a.level !== 'info')).length;
  const list = A.level === 'all' ? all : all.filter(a => a.level === A.level);
  const prog = Math.round(C.periodProgress(S.period) * 100);
  root.innerHTML = `
  <div class="page-head"><div class="grow"><h2>Alertes & conformité</h2>
    <p>Calcul automatique sur l’annualisation, les congés et la durée du travail · exercice écoulé à ${prog} %</p></div>
    <button class="btn btn-ghost" data-act="go" data-arg="reports">${icon('download', 16)} Exporter le bilan</button></div>
  <div class="grid g4" style="margin-bottom:16px">
    ${kpi({ label: 'Critiques', value: n('critical'), sub: 'action nécessaire', ic: 'alert', tone: 'danger' })}
    ${kpi({ label: 'Vigilance', value: n('warning'), sub: 'à surveiller', ic: 'eye', tone: 'warn' })}
    ${kpi({ label: 'Informations', value: n('info'), sub: 'à noter', ic: 'info', tone: 'info' })}
    ${kpi({ label: 'Collaborateurs conformes', value: `${okUsers}<small> / ${users.length}</small>`, sub: 'sans alerte critique ni vigilance', ic: 'shield', tone: 'ok' })}
  </div>
  <div class="card">
    <div class="card-head"><h3>Détail</h3>
      <div class="chips right">${[['all', 'Toutes'], ['critical', 'Critiques'], ['warning', 'Vigilance'], ['info', 'Infos']].map(([id, l]) =>
        `<button class="chip ${A.level === id ? 'on' : ''}" data-act="al-level" data-arg="${id}">${l}</button>`).join('')}</div></div>
    <div class="list" style="margin-top:10px">${list.length ? list.map(a => `<button class="li" data-act="go" data-arg="planning/${a.user.username}${a.date ? '/' + Math.max(0, C.monthIndexOf(S.period, a.date)) : ''}">
      <span class="ic-b lg tone-${LV[a.level][1]}">${icon(a.icon, 19)}</span>${avatar(a.user, 'sm')}
      <span class="grow"><span class="t" style="display:block">${esc(a.user.name)} — ${esc(a.title)}</span><span class="s">${esc(a.detail)}</span></span>
      <span class="badge b-${LV[a.level][1]}">${LV[a.level][0]}</span>${icon('right', 15)}</button>`).join('')
      : empty('shield', 'Aucune alerte', 'Tout est conforme pour ce niveau.')}</div>
  </div>
  <div class="card card-pad" style="margin-top:16px"><h3 style="font-size:14px;margin-bottom:8px">Ce qui est contrôlé</h3>
    <ul class="soft" style="padding-left:18px;font-size:13.5px;line-height:1.8">
      <li><b>Objectif annuel</b> : planning total de l’exercice au-dessus ou en dessous de l’objectif (seuil 14 h ; critique au-delà de 5 %).</li>
      <li><b>Réalisé à date</b> : retard de plus de 7 % de l’objectif par rapport à l’avancement de la période.</li>
      <li><b>Congés</b> : solde dépassé, CP et CP ancienneté non soldés dans les 90 derniers jours de l’exercice.</li>
      <li><b>Durée du travail</b> (4 semaines passées, 8 à venir) : journée de plus de 10 h, semaine de plus de 48 h, 7 jours travaillés d’affilée, moyenne supérieure à 44 h sur 12 semaines.</li>
    </ul></div>`;
}
act('al-level', arg => { A.level = arg; nav.rerender(); });
