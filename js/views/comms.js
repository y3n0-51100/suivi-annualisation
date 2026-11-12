/* ═══════════════════════════════════════════════════════════════
   ANNONCES (direction) — message affiché à la connexion, accusé de lecture
   ═══════════════════════════════════════════════════════════════ */
import * as St from '../store.js';
import { S } from '../store.js';
import { $, esc, icon, avatar, act, empty, toast, confirmDialog, fmtTs, busy } from '../ui.js';
import { nav } from '../nav.js';

export function render(root) {
  const team = St.team();
  root.innerHTML = `
  <div class="page-head"><div class="grow"><h2>Annonces</h2><p>Un message affiché à la connexion de chaque collaborateur, avec accusé de lecture</p></div></div>
  <div class="grid g-main">
    <div class="stack" style="gap:16px">${S.announcements.length ? S.announcements.map(a => {
      const read = team.filter(u => St.ackOf(a, u.username)), unread = team.filter(u => !St.ackOf(a, u.username));
      const pct = team.length ? Math.round(read.length / team.length * 100) : 0;
      return `<div class="card card-pad">
        <div class="row" style="align-items:flex-start"><span class="ic-b lg tone-violet">${icon('megaphone', 19)}</span>
          <div class="grow"><b style="font-size:15px">${esc(a.title || 'Information')}</b>${a.active === false ? ' <span class="badge b-muted">Désactivée</span>' : ''}
            <div class="muted" style="font-size:12.5px">${fmtTs(a.createdAt)} · ${esc(a.createdBy || '')}</div></div>
          <button class="btn btn-soft btn-sm" data-act="ann-toggle" data-arg="${a.id}|${a.active === false ? 1 : 0}">${a.active === false ? 'Réactiver' : 'Désactiver'}</button>
          <button class="btn btn-soft btn-sm btn-icon" data-act="ann-delete" data-arg="${a.id}" title="Supprimer">${icon('trash', 15)}</button></div>
        <div class="quote" style="white-space:pre-wrap;font-size:13.5px;margin-top:12px">${esc(a.message || '')}</div>
        <div class="row" style="margin-top:12px"><div class="progress grow"><i class="${pct === 100 ? 'ok' : ''}" style="width:${pct}%"></i></div><b class="nowrap">${read.length}/${team.length} lus</b></div>
        <details style="margin-top:10px"><summary class="soft" style="cursor:pointer;font-size:12.5px">Voir qui a lu</summary>
          <div class="grid g2" style="margin-top:10px;gap:10px">
            <div><div class="lbl" style="color:var(--ok-ink);margin-bottom:6px">Lu (${read.length})</div>${read.map(u => `<div class="row" style="padding:3px 0;font-size:13px">${avatar(u, 'sm')}${esc(u.name)}<span class="muted" style="font-size:11.5px">${fmtTs(St.ackOf(a, u.username))}</span></div>`).join('') || '<span class="muted">Personne pour l’instant</span>'}</div>
            <div><div class="lbl" style="color:var(--danger-ink);margin-bottom:6px">Non lu (${unread.length})</div>${unread.map(u => `<div class="row" style="padding:3px 0;font-size:13px">${avatar(u, 'sm')}${esc(u.name)}</div>`).join('') || '<span class="muted">Tout le monde a lu</span>'}</div>
          </div></details></div>`;
    }).join('') : `<div class="card">${empty('megaphone', 'Aucune annonce', 'Rédigez votre premier message à l’équipe.')}</div>`}</div>
    <div class="card" style="align-self:start;position:sticky;top:84px">
      <div class="card-head"><h3>Nouvelle annonce</h3></div>
      <div class="card-body stack">
        <div class="field"><label>Titre</label><input class="input" id="annTitle" maxlength="80" placeholder="Ex. : Réunion vendredi 14 h"></div>
        <div class="field"><label>Message</label><textarea class="input" id="annMsg" rows="6" maxlength="1000" placeholder="Votre message…"></textarea></div>
        <button class="btn btn-primary" data-act="ann-send">${icon('send', 16)} Envoyer à toute l’équipe</button>
      </div>
    </div>
  </div>`;
}
act('ann-send', async (_, el) => {
  const msg = $('#annMsg').value.trim();
  if (!msg) return toast('Le message est obligatoire.', 'error');
  await busy(el, () => St.createAnnouncement($('#annTitle').value.trim(), msg));
  toast('Annonce envoyée à toute l’équipe', 'success'); nav.rerender();
});
act('ann-toggle', async arg => { const [id, on] = arg.split('|'); await St.toggleAnnouncement(id, on === '1'); nav.rerender(); });
act('ann-delete', async arg => {
  if (!(await confirmDialog({ title: 'Supprimer l’annonce', text: 'Cette annonce et ses accusés de lecture seront supprimés définitivement.', ok: 'Supprimer', danger: true }))) return;
  await St.deleteAnnouncement(arg); toast('Annonce supprimée', 'success'); nav.rerender();
});
