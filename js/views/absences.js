/* ═══════════════════════════════════════════════════════════════
   MES ABSENCES — soldes, nouvelle demande, suivi des demandes
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, uid } from '../store.js';
import { esc, icon, act, kpi, empty, notice, statusBadge } from '../ui.js';
import { nav } from '../nav.js';

const A = { filter: 'active' };
const FILTERS = [['active', 'En cours'], ['approved', 'Validées'], ['all', 'Toutes'], ['archived', 'Archivées']];
const pick = (list, f) => f === 'active' ? list.filter(r => ['pending', 'waiting', 'cancel_pending'].includes(r.status))
  : f === 'approved' ? list.filter(r => r.status === 'approved')
  : f === 'archived' ? list.filter(r => r.status === 'archived') : list.filter(r => r.status !== 'archived');

export function render(root) {
  const st = St.statsOf(S.me);
  const mine = S.requests.filter(r => r.userId === uid());
  if (A.filter === 'active' && !pick(mine, 'active').length) A.filter = 'all';
  const list = pick(mine, A.filter);
  const allPosed = st.cp.left === 0 && st.anc.left === 0;

  root.innerHTML = `
  <div class="page-head">
    <div class="grow"><h2>Mes absences</h2><p>Soldes à jour et suivi de vos demandes · exercice ${S.period.label}</p></div>
    <button class="btn btn-primary" data-act="absence-new">${icon('plus', 16, 2.4)} Nouvelle demande</button>
  </div>
  <div class="grid g4" style="margin-bottom:16px">
    ${kpi({ label: 'Congés payés', value: `${st.cp.left}<small> j restants</small>`, sub: `${st.cp.taken} posé${st.cp.taken > 1 ? 's' : ''} sur ${st.cp.alloc}`, ic: 'sun', tone: 'warn' })}
    ${kpi({ label: 'CP ancienneté', value: `${st.anc.left}<small> j restants</small>`, sub: st.anc.alloc ? `${st.anc.taken} posé${st.anc.taken > 1 ? 's' : ''} sur ${st.anc.alloc}` : 'aucun droit cette année', ic: 'star', tone: 'violet' })}
    ${kpi({ label: 'Récupération disponible', value: `${C.num(st.recup)}<small> ${st.unit}</small>`, sub: st.recup > 0 ? 'heures au-delà de l’objectif' : 'objectif non dépassé', ic: 'clock', tone: st.recup > 0 ? 'ok' : 'muted' })}
    ${kpi({ label: 'Récupération déjà posée', value: `${C.num(st.byType['Récupération'].hours)}<small> h</small>`, sub: `${st.byType['Récupération'].days} journée${st.byType['Récupération'].days > 1 ? 's' : ''} complète${st.byType['Récupération'].days > 1 ? 's' : ''}`, ic: 'undo', tone: 'info' })}
  </div>
  <div style="margin-bottom:16px">${allPosed
    ? notice('ok', 'check', '<b>Compteur fiable.</b> Tous vos congés sont posés : la récupération affichée correspond à votre solde réel.')
    : notice('warn', 'alert', `<b>Il vous reste ${st.cp.left} j de CP${st.anc.left ? ` et ${st.anc.left} j de CP ancienneté` : ''} à poser.</b> Le compteur de récupération ne sera fiable qu’une fois tous vos congés planifiés : posez-les d’abord.`)}</div>

  <div class="card">
    <div class="card-head"><h3>Mes demandes</h3>
      <div class="chips right">${FILTERS.map(([id, label]) => { const n = pick(mine, id).length; return `<button class="chip ${A.filter === id ? 'on' : ''}" data-act="abs-filter" data-arg="${id}">${label}${n ? ' · ' + n : ''}</button>`; }).join('')}</div></div>
    <div class="list" style="margin-top:10px">${list.length ? list.map(r => {
      const t = C.TYPES[r.type] || { cls: 'aut', icon: 'leave', label: r.type };
      const flag = r.status === 'archived' && C.canCancel(r) ? ' · encore annulable' : '';
      return `<button class="li" data-act="req-open" data-arg="${r.id}">
        <span class="ic-b lg t-${t.cls}">${icon(t.icon, 20)}</span>
        <span class="grow"><span class="t" style="display:block">${esc(t.label)} · ${esc(r.qLabel || r.hours + ' h')}</span>
          <span class="s">${esc(r.dateLabel || C.disp(r.date))}${flag}${r.managerComment ? ' · « ' + esc(r.managerComment) + ' »' : ''}</span></span>
        ${statusBadge(r.status)}${icon('right', 15)}</button>`;
    }).join('') : empty('leave', 'Aucune demande', 'Utilisez « Nouvelle demande » pour poser un congé, une récupération ou signaler une absence.')}</div>
  </div>
  <div class="card card-pad" style="margin-top:16px"><h3 style="font-size:14px;margin-bottom:8px">Comment ça marche ?</h3>
    <ol class="soft" style="padding-left:18px;font-size:13.5px;line-height:1.8">
      <li>Vous envoyez votre demande : la direction est prévenue par e-mail et dans son tableau de bord.</li>
      <li>Elle l’approuve, la met en attente ou la refuse — vous êtes notifié par e-mail et ici.</li>
      <li>Une demande approuvée est reportée automatiquement sur votre planning.</li>
      <li>Besoin de changer d’avis ? Ouvrez la demande et demandez son annulation : vos heures d’origine sont rétablies dès acceptation.</li>
    </ol></div>`;
}
act('abs-filter', arg => { A.filter = arg; nav.rerender(); });
