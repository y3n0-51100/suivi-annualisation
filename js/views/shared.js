/* ═══════════════════════════════════════════════════════════════
   Éléments partagés entre écrans : carte de demande, analyse
   d'impact, formulaire d'absence, fiche d'une demande.
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, uid, isAdmin } from '../store.js';
import { $, esc, icon, avatar, toast, modal, act, confirmDialog, typeBadge, statusBadge, notice, busy, fmtTs } from '../ui.js';
import { nav } from '../nav.js';

/* ─── Analyse d'impact d'une demande sur l'équipe ─── */
export function impactOf(req) {
  const users = St.team();
  const days = C.workingDays(req.date, req.dateEnd || req.date, S.holidays);
  const applied = ['approved', 'cancel_pending'].includes(req.status);
  let worst = null;
  for (const k of days) {
    const need = St.minStaff(k);
    if (!need) continue;
    let present = C.presentCount(users, S.schedules, k);
    const mine = S.schedules[req.userId]?.[k];
    if (!applied && mine && C.hoursOf(mine) > 0 && !C.TYPES[mine.type] && C.isByDay(req.type)) present--;
    if (!worst || present - need < worst.present - worst.need) worst = { k, present, need };
  }
  const others = S.requests.filter(r => r.id !== req.id && r.userId !== req.userId && ['approved', 'pending', 'waiting'].includes(r.status)
    && C.overlaps(req.date, req.dateEnd || req.date, r.date, r.dateEnd || r.date));
  const user = St.userOf(req.userId);
  const st = user ? St.statsOf(user) : null;
  let balance = null;
  if (st && req.type === 'CP') balance = { label: 'CP', left: st.cp.left - (applied ? 0 : req.hours), alloc: st.cp.alloc };
  if (st && req.type === 'CP Ancienneté') balance = { label: 'CP anc.', left: st.anc.left - (applied ? 0 : req.hours), alloc: st.anc.alloc };
  if (st && req.type === 'Récupération') balance = { label: 'Récup.', left: C.r2(st.recup - (applied ? 0 : req.hours)), unit: st.unit };
  return { worst, others, balance };
}
export function impactHtml(req) {
  const { worst, others, balance } = impactOf(req);
  const out = [];
  if (worst) {
    const low = worst.present < worst.need;
    out.push(`<span class="badge ${low ? 'b-danger' : worst.present === worst.need ? 'b-warn' : 'b-ok'}" title="Effectif présent le jour le plus tendu de la période">
      ${icon('team', 13)} ${worst.present} présent${worst.present > 1 ? 's' : ''} le ${C.shortDate(worst.k)} (mini ${worst.need})</span>`);
  }
  if (others.length) out.push(`<span class="badge b-info" title="${esc(others.map(o => `${o.userName} — ${o.type} (${C.statusLabel(o.status)})`).join('\n'))}">
    ${icon('leave', 13)} ${others.length} autre${others.length > 1 ? 's' : ''} absence${others.length > 1 ? 's' : ''} sur la période</span>`);
  if (balance) {
    const neg = balance.left < 0;
    out.push(`<span class="badge ${neg ? 'b-danger' : 'b-muted'}">${icon('clock', 13)} Solde ${balance.label} après : ${C.num(balance.left)} ${balance.unit || 'j'}</span>`);
  }
  return out.length ? `<div class="impact">${out.join('')}</div>` : '';
}

/* ─── Carte d'une demande d'absence (vue direction) ─── */
export function requestCard(r, { selectable = false } = {}) {
  const u = St.userOf(r.userId) || { name: r.userName };
  const cancel = r.status === 'cancel_pending', arch = r.status === 'archived';
  let acts;
  if (cancel) acts = `
    <button class="btn btn-ok btn-sm" data-act="cancel-decide" data-arg="${r.id}|approved">${icon('check', 15, 2.4)} Accepter l’annulation</button>
    <button class="btn btn-danger-soft btn-sm" data-act="cancel-decide" data-arg="${r.id}|rejected">${icon('x', 15, 2.4)} Refuser</button>`;
  else if (arch) acts = `<button class="btn btn-ghost btn-sm" data-act="req-unarchive" data-arg="${r.id}">${icon('undo', 15)} Restaurer</button>`;
  else acts = `
    ${r.status !== 'approved' ? `<button class="btn btn-ok btn-sm" data-act="req-decide" data-arg="${r.id}|approved">${icon('check', 15, 2.4)} Approuver</button>` : ''}
    ${r.status !== 'waiting' ? `<button class="btn btn-warn-soft btn-sm" data-act="req-decide" data-arg="${r.id}|waiting" title="Mettre en attente">${icon('pause', 15, 2.4)}<span class="hide-m"> Attente</span></button>` : ''}
    ${r.status !== 'rejected' ? `<button class="btn btn-danger-soft btn-sm" data-act="req-decide" data-arg="${r.id}|rejected">${icon('x', 15, 2.4)} Refuser</button>` : ''}
    ${r.status !== 'pending' ? `<button class="btn btn-soft btn-sm btn-icon" data-act="req-archive" data-arg="${r.id}" title="Archiver">${icon('archive', 15)}</button>` : ''}`;
  return `<div class="req ${cancel ? 'alert' : ''}">
    ${selectable && !arch && r.status !== 'pending' ? `<input type="checkbox" class="req-check" value="${r.id}" style="margin-top:10px;width:16px;height:16px;accent-color:var(--brand)" aria-label="Sélectionner">` : ''}
    ${avatar(u)}
    <div class="grow">
      <div class="row wrap" style="gap:8px"><span class="who">${esc(r.userName)}</span>${statusBadge(r.status)}
        ${r.createdByAdmin ? '<span class="badge b-muted">Saisie directe</span>' : ''}${r.previousStatus === 'archived' && cancel ? '<span class="badge b-muted">issue des archives</span>' : ''}</div>
      <div class="meta">${typeBadge(r.type)}<b>${esc(r.dateLabel || C.disp(r.date))}</b><span>·</span><span>${esc(r.qLabel || r.hours + ' h')}</span>
        <span class="muted">· demandé le ${fmtTs(r.createdAt, false)}</span></div>
      ${r.comment ? `<div class="quote">« ${esc(r.comment)} »</div>` : ''}
      ${cancel ? `<div class="quote" style="background:var(--danger-soft);color:var(--danger-ink)"><b>Annulation demandée.</b> ${r.cancelReason ? 'Motif : ' + esc(r.cancelReason) : 'Aucun motif précisé.'} En acceptant, les journées retrouvent leurs heures d’origine.</div>` : ''}
      ${r.managerComment ? `<div class="quote">Réponse de la direction : ${esc(r.managerComment)}</div>` : ''}
      ${['pending', 'waiting', 'cancel_pending'].includes(r.status) ? impactHtml(r) : ''}
    </div>
    <div class="acts">${acts}</div>
  </div>`;
}

act('req-decide', async (arg, el) => {
  const [id, status] = arg.split('|');
  let comment = '';
  if (status !== 'approved') {
    const res = await confirmDialog({
      title: status === 'rejected' ? 'Refuser la demande' : 'Mettre la demande en attente',
      text: 'Vous pouvez ajouter un message : il sera transmis au collaborateur par e-mail et affiché dans son espace.',
      ok: status === 'rejected' ? 'Refuser' : 'Mettre en attente', danger: status === 'rejected',
      input: { label: 'Message (facultatif)', textarea: true, placeholder: 'Ex. : période d’inventaire, merci de proposer d’autres dates.' }
    });
    if (res === false) return;
    if (typeof res === 'string') comment = res;
  }
  await busy(el, async () => {
    const r = await St.decideRequest(id, status, comment);
    toast(`Demande de ${r.userName} : ${C.statusLabel(status).toLowerCase()}`, 'success');
  });
  nav.rerender();
});
act('cancel-decide', async (arg, el) => {
  const [id, decision] = arg.split('|');
  await busy(el, () => St.decideCancel(id, decision));
  toast(decision === 'approved' ? 'Annulation acceptée — planning rétabli' : 'Annulation refusée — absence maintenue', decision === 'approved' ? 'success' : 'info');
  nav.rerender();
});
act('req-archive', async arg => { await St.archiveRequests([arg]); toast('Demande archivée', 'success'); nav.rerender(); });
act('req-unarchive', async arg => { await St.unarchiveRequest(arg); toast('Demande restaurée', 'success'); nav.rerender(); });

/* ─── Formulaire de demande d'absence ───
   userId : collaborateur concerné · direct : saisie par la direction (approuvée d'office) */
export function openAbsenceForm({ userId = uid(), direct = false, start = '', end = '' } = {}) {
  const draft = { userId, type: '', start, end: end || start, qty: '', comment: '', auto: true };
  const pickUser = direct;
  const m = modal({
    title: direct ? 'Saisir une absence' : 'Nouvelle demande d’absence', iconName: 'leave', size: 'wide',
    body: '<div id="afBody"></div>',
    foot: `<button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="afSend">${icon(direct ? 'check' : 'send', 16, 2.2)} ${direct ? 'Enregistrer l’absence' : 'Envoyer la demande'}</button>`
  });
  const body = $('#afBody', m.el);

  const summary = () => {
    const user = St.userOf(draft.userId);
    if (!draft.type || !draft.start || !user) return notice('soft', 'info', 'Choisissez un type et des dates pour voir l’impact de la demande.');
    const end = draft.end || draft.start;
    const err = St.checkAbsence({ userId: draft.userId, type: draft.type, start: draft.start, end, qty: parseFloat(draft.qty) || 0 });
    const byDay = C.isByDay(draft.type) && draft.type !== 'Maladie';
    const wd = (byDay ? C.leaveDays(draft.start, end, S.holidays, user, St.cpOpts().cpMode) : C.workingDays(draft.start, end, S.holidays)).length;
    const planningMode = byDay && St.cpOpts().cpMode === 'planning';
    const st = St.statsOf(user);
    const q = parseFloat(draft.qty) || 0;
    const lines = [planningMode ? `<b>${wd}</b> jour${wd > 1 ? 's' : ''} habituellement travaillé${wd > 1 ? 's' : ''} sur la période (hors fériés fermés)` : `<b>${wd}</b> jour${wd > 1 ? 's' : ''} ouvrable${wd > 1 ? 's' : ''} sur la période (lundi → samedi, hors fériés fermés)`];
    let warn = '';
    if (draft.type === 'CP') { lines.push(`Solde CP après la demande : <b>${C.num(st.cp.left - q)}</b> / ${st.cp.alloc} j`); if (q > st.cp.left) warn = 'La demande dépasse votre solde de congés payés.'; }
    if (draft.type === 'CP Ancienneté') { lines.push(`Solde CP ancienneté après : <b>${C.num(st.anc.left - q)}</b> / ${st.anc.alloc} j`); if (q > st.anc.left) warn = 'La demande dépasse le solde de CP ancienneté.'; }
    if (draft.type === 'Récupération') { lines.push(`Récupération disponible : <b>${C.num(st.recup)} ${st.unit}</b>`); if (q > st.recup) warn = 'La récupération demandée dépasse les heures disponibles à ce jour.'; }
    const fake = { id: '_draft', userId: draft.userId, type: draft.type, date: draft.start, dateEnd: end, hours: q, status: 'pending' };
    const imp = impactOf(fake);
    if (imp.others.length) lines.push(`Déjà absent${imp.others.length > 1 ? 's' : ''} sur la période : ${imp.others.map(o => esc(o.userName.split(' ')[0])).join(', ')}`);
    if (imp.worst && imp.worst.present < imp.worst.need) warn = warn || `Effectif tendu le ${C.shortDate(imp.worst.k)} : ${imp.worst.present} présent(s) pour ${imp.worst.need} attendus.`;
    return (err ? notice('danger', 'alert', esc(err)) : notice('info', 'info', lines.join('<br>')))
      + (warn && !err ? `<div style="height:8px"></div>${notice('warn', 'alert', esc(warn) + (direct ? '' : ' Vous pouvez quand même envoyer la demande : la direction arbitrera.'))}` : '');
  };

  const paint = () => {
    const user = St.userOf(draft.userId);
    const t = C.TYPES[draft.type];
    const types = C.TYPE_NAMES.filter(n => n !== 'CP Ancienneté' || (user?.cpAnciennete || 0) > 0 || direct);
    body.innerHTML = `
      ${pickUser ? `<div class="field" style="margin-bottom:14px"><label>Collaborateur</label>
        <select class="input" id="afUser">${St.team().map(u => `<option value="${u.username}" ${u.username === draft.userId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>` : ''}
      <div class="lbl" style="margin-bottom:8px">Type d’absence</div>
      <div class="grid g3 type-grid" style="gap:8px;margin-bottom:16px">${types.map(n => `
        <button class="chip ${draft.type === n ? 'on' : ''}" data-type="${esc(n)}" style="height:44px;justify-content:flex-start;gap:9px">
          <span class="ic-b t-${C.TYPES[n].cls}" style="width:26px;height:26px">${icon(C.TYPES[n].icon, 14, 2.2)}</span>${esc(C.TYPES[n].label)}</button>`).join('')}</div>
      <div class="form-grid">
        <div class="field"><label>Du</label><input class="input" type="date" id="afStart" min="${S.period.startKey}" max="${S.period.endKey}" value="${draft.start}"></div>
        <div class="field"><label>Au (inclus)</label><input class="input" type="date" id="afEnd" min="${S.period.startKey}" max="${S.period.endKey}" value="${draft.end}"></div>
        <div class="field"><label>${t ? (t.unit === 'j' ? 'Nombre de jours' : 'Nombre d’heures') : 'Quantité'}</label>
          <input class="input" type="number" inputmode="decimal" step="0.5" min="0" id="afQty" value="${draft.qty}" placeholder="${t?.unit === 'j' ? 'Ex. : 5' : 'Ex. : 7'}" ${t ? '' : 'disabled'}>
          <small>${t ? esc(t.hint) : 'Choisissez d’abord un type.'}</small></div>
        <div class="field"><label>Commentaire (facultatif)</label><textarea class="input" rows="2" id="afComment" placeholder="Précisez si nécessaire…">${esc(draft.comment)}</textarea></div>
      </div>
      <div style="margin-top:14px" id="afSum">${summary()}</div>
      ${direct ? `<div style="margin-top:10px">${notice('violet', 'shield', 'Saisie directe : l’absence est enregistrée comme <b>approuvée</b> et appliquée immédiatement au planning. Le collaborateur est prévenu par e-mail.')}</div>` : ''}`;
  };
  const autoQty = () => {
    if (!draft.auto || !draft.type || !draft.start) return;
    const end = draft.end || draft.start;
    if (end < draft.start) return;
    const wd = C.workingDays(draft.start, end, S.holidays);
    if (C.isByDay(draft.type)) draft.qty = String((draft.type === 'Maladie' ? wd : C.leaveDays(draft.start, end, S.holidays, St.userOf(draft.userId), St.cpOpts().cpMode)).length || 1);
    else {
      // heures prévues sur la période (proposition modifiable)
      const days = St.daysOf(draft.userId), tp = C.tpOf(St.userOf(draft.userId));
      const h = wd.reduce((s, k) => { const e = days[k]; return s + (e && !C.TYPES[e.type] ? C.hoursOf(e) : (parseFloat(tp[C.DAYS[C.dow(k)]]) || 0)); }, 0);
      draft.qty = h ? String(C.r2(h)) : '';
    }
  };
  body.addEventListener('click', e => {
    const b = e.target.closest('[data-type]');
    if (b) { draft.type = b.dataset.type; draft.auto = true; autoQty(); paint(); }
  });
  body.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'afUser') { draft.userId = e.target.value; autoQty(); paint(); }
    if (id === 'afStart') { draft.start = e.target.value; if (!draft.end || draft.end < draft.start) draft.end = draft.start; autoQty(); paint(); }
    if (id === 'afEnd') { draft.end = e.target.value; autoQty(); paint(); }
  });
  body.addEventListener('input', e => {
    if (e.target.id === 'afQty') { draft.qty = e.target.value; draft.auto = false; $('#afSum', body).innerHTML = summary(); }
    if (e.target.id === 'afComment') draft.comment = e.target.value;
  });
  $('#afSend', m.el).addEventListener('click', async e => {
    try {
      await busy(e.currentTarget, () => St.submitAbsence({
        userId: draft.userId, type: draft.type, start: draft.start, end: draft.end || draft.start,
        qty: parseFloat(draft.qty) || 0, comment: draft.comment.trim(), direct
      }));
      m.close();
      toast(direct ? 'Absence enregistrée et appliquée au planning' : 'Demande envoyée à la direction', 'success');
      nav.rerender();
    } catch (err) { toast(err.message || 'Envoi impossible.', 'error'); }
  });
  autoQty(); paint();
}
act('absence-new', arg => openAbsenceForm(arg ? { start: arg } : {}));
act('absence-direct', arg => openAbsenceForm({ userId: arg || St.team()[0]?.username, direct: true }));

/* ─── Fiche d'une demande (vue collaborateur) ─── */
export function openRequest(id) {
  const r = S.requests.find(x => x.id === id);
  if (!r) return;
  const steps = [['Demande envoyée', r.createdAt], ...(r.processedAt ? [[`Décision : ${C.statusLabel(r.previousStatus && ['archived', 'cancel_pending'].includes(r.status) ? r.previousStatus : r.status).toLowerCase()}`, r.processedAt]] : []),
    ...(r.cancelRequestedAt ? [['Annulation demandée', r.cancelRequestedAt]] : []), ...(r.cancelledAt ? [['Demande retirée', r.cancelledAt]] : [])];
  let foot = '<button class="btn btn-ghost" data-close>Fermer</button>';
  let extra = '';
  if (r.userId === uid() || isAdmin()) {
    if (C.canCancel(r)) {
      extra = `<div class="field" style="margin-top:14px"><label>Motif de l’annulation (facultatif)</label><textarea class="input" rows="2" id="rqReason" placeholder="Expliquez brièvement pourquoi…"></textarea></div>
        <div style="margin-top:10px">${notice('info', 'info', 'La direction est prévenue par e-mail. Dès acceptation, vos journées retrouvent leurs heures d’origine.')}</div>`;
      foot += `<button class="btn btn-danger-soft" id="rqCancel">${icon('undo', 16)} Demander l’annulation</button>`;
    } else if (r.status === 'pending') foot += `<button class="btn btn-danger-soft" id="rqDrop">${icon('x', 16, 2.4)} Retirer la demande</button>`;
  }
  const m = modal({
    title: esc(C.TYPES[r.type]?.label || r.type), iconName: C.TYPES[r.type]?.icon || 'leave',
    body: `<div class="row wrap" style="margin-bottom:14px">${statusBadge(r.status)}<b>${esc(r.dateLabel || C.disp(r.date))}</b><span class="muted">${esc(r.qLabel || '')}</span></div>
      ${r.comment ? `<div class="quote" style="margin:0 0 10px">« ${esc(r.comment)} »</div>` : ''}
      ${r.managerComment ? notice('soft', 'megaphone', `<b>Réponse de la direction :</b> ${esc(r.managerComment)}`) + '<div style="height:10px"></div>' : ''}
      ${r.status === 'cancel_pending' ? notice('warn', 'hourglass', `<b>Annulation en cours de traitement.</b>${r.cancelReason ? ' Motif : ' + esc(r.cancelReason) : ''}`) + '<div style="height:10px"></div>' : ''}
      ${r.status === 'archived' && C.canCancel(r) ? notice('soft', 'archive', '<b>Demande archivée.</b> L’absence n’a pas encore eu lieu : elle reste annulable.') + '<div style="height:10px"></div>' : ''}
      <div class="timeline">${steps.map(([t, ts]) => `<div class="ev"><span class="dot"></span><div class="grow"><b>${esc(t)}</b><div class="muted">${fmtTs(ts)}</div></div></div>`).join('')}</div>
      ${extra}`,
    foot
  });
  $('#rqCancel', m.el)?.addEventListener('click', async e => {
    await busy(e.currentTarget, () => St.requestCancel(r.id, ($('#rqReason', m.el)?.value || '').trim()));
    m.close(); toast('Demande d’annulation envoyée', 'success'); nav.rerender();
  });
  $('#rqDrop', m.el)?.addEventListener('click', async e => {
    await busy(e.currentTarget, () => St.cancelPending(r.id));
    m.close(); toast('Demande retirée', 'success'); nav.rerender();
  });
}
act('req-open', arg => openRequest(arg));

/* ─── Sélecteur de mois (‹ Mois année ›) ─── */
export const monthNav = (idx, action) => {
  const m = S.period.months[idx];
  return `<div class="row" style="gap:6px">
    <button class="btn btn-ghost btn-icon btn-sm" data-act="${action}" data-arg="${idx - 1}" ${idx === 0 ? 'disabled' : ''} aria-label="Mois précédent">${icon('left', 16, 2.4)}</button>
    <select class="input sm" data-act="${action}" data-on="change" style="width:auto;font-weight:700;min-width:150px" aria-label="Mois">
      ${S.period.months.map(x => `<option value="${x.idx}" ${x.idx === idx ? 'selected' : ''}>${x.name} ${x.year}${C.isMonthLocked(S.locks, x.idx) ? ' 🔒' : ''}</option>`).join('')}</select>
    <button class="btn btn-ghost btn-icon btn-sm" data-act="${action}" data-arg="${idx + 1}" ${idx === 11 ? 'disabled' : ''} aria-label="Mois suivant">${icon('right', 16, 2.4)}</button>
  </div>`;
};
// valeur d'un sélecteur ou d'un bouton
export const argOf = (arg, el) => +(el.tagName === 'SELECT' ? el.value : arg);
