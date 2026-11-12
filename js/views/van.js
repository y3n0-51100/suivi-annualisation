/* ═══════════════════════════════════════════════════════════════
   CAMIONNETTE — demande d'emprunt et disponibilité
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, uid, isAdmin } from '../store.js';
import { $, esc, icon, act, empty, toast, notice, statusBadge, confirmDialog, busy } from '../ui.js';
import { nav } from '../nav.js';

const localISO = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function render(root) {
  const minH = S.store.vanMinHours ?? 48;
  const min = localISO(new Date(Date.now() + (isAdmin() ? 0 : minH) * 3600000));
  const mine = S.van.filter(r => r.userId === uid());
  const booked = S.van.filter(r => r.status === 'approved' && new Date(r.dateEnd) >= new Date()).sort((a, b) => a.dateStart.localeCompare(b.dateStart));
  root.innerHTML = `
  <div class="page-head"><div class="grow"><h2>Emprunt de la camionnette</h2><p>Réservation soumise à l’accord de la direction</p></div></div>
  <div class="grid g-main">
    <div class="stack" style="gap:16px">
      <div class="card">
        <div class="card-head"><h3>Nouvelle demande</h3></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="field"><label>Départ (date et heure)</label><input class="input" type="datetime-local" id="vanStart" min="${min}"></div>
            <div class="field"><label>Retour (date et heure)</label><input class="input" type="datetime-local" id="vanEnd" min="${min}"></div>
            <div class="field full hidden" id="vanParkRow"><label>Lieu de stationnement la nuit</label>
              <input class="input" id="vanParking" placeholder="Ex. : domicile — 12 rue des Lilas"><small>Obligatoire pour un emprunt sur plusieurs jours ou à partir du samedi soir.</small></div>
            <div class="field full"><label>Motif (facultatif)</label><input class="input" id="vanComment" placeholder="Ex. : déménagement, transport de matériel…"></div>
          </div>
          <div id="vanClash" style="margin-top:12px"></div>
          <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn btn-primary" data-act="van-submit">${icon('send', 16)} Envoyer la demande</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Mes demandes</h3></div>
        <div class="list" style="margin-top:8px">${mine.length ? mine.map(r => `<div class="li"><span class="ic-b lg tone-info">${icon('van', 20)}</span>
          <div class="grow"><div class="t">${esc(C.fmtDateTime(r.dateStart))} → ${esc(C.fmtDateTime(r.dateEnd))}</div>
            <div class="s">${r.parking ? 'Stationnement : ' + esc(r.parking) : ''}${r.parking && r.comment ? ' · ' : ''}${esc(r.comment || '')}${r.managerComment ? ' · Réponse : « ' + esc(r.managerComment) + ' »' : ''}</div></div>
          ${statusBadge(r.status)}
          ${['pending', 'approved', 'waiting'].includes(r.status) ? `<button class="btn btn-soft btn-sm" data-act="van-cancel" data-arg="${r.id}">Annuler</button>` : ''}</div>`).join('')
          : empty('van', 'Aucune demande', 'Vos demandes d’emprunt apparaîtront ici.')}</div>
      </div>
    </div>
    <div class="stack" style="gap:16px">
      <div class="card"><div class="card-head"><h3>Créneaux déjà réservés</h3></div>
        <div class="list" style="margin-top:8px">${booked.length ? booked.map(r => `<div class="li"><span class="ic-b tone-muted">${icon('lock', 15)}</span>
          <div class="grow"><div class="t">${esc(C.fmtDateTime(r.dateStart))}</div><div class="s">jusqu’au ${esc(C.fmtDateTime(r.dateEnd))} · ${esc(r.userName)}</div></div></div>`).join('')
          : empty('check', 'Camionnette disponible', 'Aucun créneau réservé à venir.')}</div></div>
      <div class="card card-pad"><h3 style="font-size:14px;margin-bottom:8px">Bon à savoir</h3>
        <ul class="soft" style="padding-left:18px;font-size:13.5px;line-height:1.8">
          <li>Demande à faire <b>au moins ${minH} h à l’avance</b>.</li>
          <li>Le <b>lieu de stationnement la nuit</b> est obligatoire dès que l’emprunt couvre une nuit ou le samedi soir.</li>
          <li>La direction approuve ou refuse ; vous êtes notifié par e-mail.</li>
        </ul></div>
    </div>
  </div>`;
  root.onchange = e => {
    if (!['vanStart', 'vanEnd'].includes(e.target.id)) return;
    const s = $('#vanStart').value, en = $('#vanEnd').value;
    $('#vanParkRow').classList.toggle('hidden', !C.vanNeedsParking(s, en));
    const clash = s && en && S.van.find(r => r.status === 'approved' && new Date(r.dateStart) < new Date(en) && new Date(r.dateEnd) > new Date(s));
    $('#vanClash').innerHTML = clash ? notice('danger', 'alert', `Créneau déjà réservé par ${esc(clash.userName)} (${esc(C.fmtDateTime(clash.dateStart))} → ${esc(C.fmtDateTime(clash.dateEnd))}).`) : '';
  };
}
act('van-submit', async (_, el) => {
  try {
    const other = await busy(el, () => St.submitVan({ start: $('#vanStart').value, end: $('#vanEnd').value, parking: $('#vanParking').value.trim(), comment: $('#vanComment').value.trim() }));
    toast(other ? 'Demande envoyée — une autre demande non traitée chevauche ce créneau, la direction arbitrera.' : 'Demande d’emprunt envoyée', other ? 'warning' : 'success');
    nav.rerender();
  } catch (e) { toast(e.message, 'error'); }
});
act('van-cancel', async arg => {
  if (!(await confirmDialog({ title: 'Annuler la demande', text: 'Annuler cette demande d’emprunt de la camionnette ?', ok: 'Annuler la demande', danger: true }))) return;
  await St.cancelVan(arg); toast('Demande annulée', 'success'); nav.rerender();
});
