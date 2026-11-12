/* ═══════════════════════════════════════════════════════════════
   COLLABORATEURS (direction) — fiches, compteurs, création / édition
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, uid } from '../store.js';
import { $, $$, esc, icon, avatar, act, empty, toast, modal, confirmDialog, notice, statusBadge, typeBadge, busy } from '../ui.js';
import { nav } from '../nav.js';

const P = { q: '' };

export function render(root, params) {
  const users = St.team();
  const admins = S.users.filter(u => u.role === 'admin');
  root.innerHTML = `
  <div class="page-head">
    <div class="grow"><h2>Collaborateurs</h2><p>${users.length} profil${users.length > 1 ? 's' : ''} suivi${users.length > 1 ? 's' : ''} · ${admins.length} compte${admins.length > 1 ? 's' : ''} direction</p></div>
    <input class="input" id="peopleQ" style="max-width:230px" placeholder="Rechercher…" value="${esc(P.q)}">
    <button class="btn btn-primary" data-act="user-new">${icon('plus', 16, 2.4)} Nouveau collaborateur</button>
  </div>
  <div class="grid g3" id="peopleGrid">${cards(users)}</div>`;
  root.oninput = e => { if (e.target.id === 'peopleQ') { P.q = e.target.value; $('#peopleGrid').innerHTML = cards(users); } };
  if (params[0] && St.userOf(params[0])) { history.replaceState({}, '', '#/people'); openSheet(params[0]); }
}

function cards(users) {
  const q = P.q.trim().toLowerCase();
  const list = users.filter(u => !q || [u.name, u.username, u.matricule, u.poste].filter(Boolean).join(' ').toLowerCase().includes(q));
  if (!list.length) return `<div class="card" style="grid-column:1/-1">${empty('user', 'Aucun collaborateur', 'Créez un profil avec « Nouveau collaborateur ».')}</div>`;
  return list.map(u => {
    const st = St.statsOf(u);
    const scale = Math.max(st.target, st.total) * 1.05 || 1;
    return `<div class="card user-card">
      <div class="row">${avatar(u, 'lg')}
        <div class="grow"><div class="row" style="gap:6px"><b class="ellipsis" style="font-size:15px">${esc(u.name)}</b>${u.isCadre ? '<span class="badge b-violet">Cadre</span>' : ''}${u.role === 'admin' ? '<span class="badge b-brand">Direction</span>' : ''}</div>
          <div class="muted ellipsis" style="font-size:12.5px">${esc(u.poste || 'Collaborateur')}${u.matricule ? ' · ' + esc(u.matricule) : ''}</div></div>
        <button class="btn btn-soft btn-icon btn-sm" data-act="user-sheet" data-arg="${u.username}" title="Ouvrir la fiche">${icon('eye', 16)}</button>
      </div>
      <div>
        <div class="row" style="font-size:12.5px;margin-bottom:6px"><span class="soft">Planifié ${C.num(st.total)} / ${C.num(st.target)} ${st.unit}${st.prorated ? ' (proratisé)' : ''}</span>
          <span class="badge ${st.gapNet > 14 ? 'b-warn' : st.gapNet < -14 ? 'b-danger' : 'b-ok'} right" title="Écart à l’objectif une fois les CP restants posés (brut : ${st.gap > 0 ? '+' : ''}${C.num(st.gap)})">${st.gapNet > 0 ? '+' : ''}${C.num(st.gapNet)} ${st.unit}</span></div>
        <div class="progress"><i class="${st.gapNet > 14 ? 'warn' : st.gapNet < -14 ? '' : 'ok'}" style="width:${Math.min(100, st.total / scale * 100)}%"></i><span class="mark" style="left:${st.target / scale * 100}%"></span></div>
      </div>
      <div class="meta">
        <div><span class="muted">CP restants</span><b>${st.cp.left} / ${st.cp.alloc} j</b></div>
        <div><span class="muted">Réalisé à date</span><b>${C.num(st.doneToDate)} ${st.unit}</b></div>
        <div><span class="muted">Base hebdo</span><b>${C.num(C.tpWeekTotal(C.tpOf(u)))} ${u.isCadre ? 'dj' : 'h'}</b></div>
      </div>
      <div class="row" style="gap:6px">
        <button class="btn btn-ghost btn-sm grow" data-act="go" data-arg="planning/${u.username}">${icon('cal', 15)} Planning</button>
        <button class="btn btn-ghost btn-sm grow" data-act="user-edit" data-arg="${u.username}">${icon('edit', 15)} Modifier</button>
        <button class="btn btn-soft btn-sm btn-icon" data-act="user-delete" data-arg="${u.username}" title="Supprimer">${icon('trash', 15)}</button>
      </div></div>`;
  }).join('');
}

/* ─── Fiche détaillée ─── */
function openSheet(username) {
  const u = St.userOf(username); if (!u) return;
  const st = St.statsOf(u);
  const { alerts } = C.buildAlerts(u, St.daysOf(username), S.period);
  const reqs = S.requests.filter(r => r.userId === username).slice(0, 6);
  const row = (l, v) => `<tr><td class="soft">${l}</td><td class="num"><b>${v}</b></td></tr>`;
  modal({
    title: esc(u.name), drawer: true,
    body: `<div class="row" style="margin-bottom:14px">${avatar(u, 'lg')}<div><div class="soft">${esc(u.poste || 'Collaborateur')}</div>
        <div class="muted" style="font-size:12.5px">@${esc(u.username)}${u.matricule ? ' · ' + esc(u.matricule) : ''}${u.email ? ' · ' + esc(u.email) : ''}</div></div></div>
      ${alerts.filter(a => a.level !== 'info').slice(0, 3).map(a => notice(a.level === 'critical' ? 'danger' : 'warn', a.icon, `<b>${esc(a.title)}</b><br>${esc(a.detail)}`)).join('<div style="height:8px"></div>')}
      <h4 style="margin:16px 0 6px;font-size:13px">Compteurs ${S.period.label}</h4>
      <table class="tbl compact"><tbody>
        ${row('Objectif' + (st.prorated ? ` (proratisé, contrat ${C.num(st.contract)})` : ''), `${C.num(st.target)} ${st.unit}`)}
        ${row('Planifié sur l’exercice', `${C.num(st.total)} ${st.unit}`)}
        ${row('Réalisé à ce jour', `${C.num(st.doneToDate)} ${st.unit}`)}
        ${row('Attendu à ce stade', `${C.num(st.expectedToDate)} ${st.unit}`)}
        ${row(st.gap >= 0 ? 'Écart brut (avance)' : 'Reste à planifier', `${st.gap > 0 ? '+' : ''}${C.num(st.gap)} ${st.unit}`)}
        ${row(`Écart une fois les ${st.cp.left} j de CP restants posés`, `${st.gapNet > 0 ? '+' : ''}${C.num(st.gapNet)} ${st.unit}`)}
        ${row('Congés payés', `${st.cp.taken} posés · ${st.cp.left} restants`)}
        ${st.anc.alloc ? row('CP ancienneté', `${st.anc.taken} posés · ${st.anc.left} restants`) : ''}
        ${row('Récupération posée', `${C.num(st.byType['Récupération'].hours)} h`)}
        ${row('Maladie', `${st.byType['Maladie'].days} j`)}
        ${row('Formation', `${st.byType['Formation'].days} j`)}
        ${u.dateEntree ? row('Entrée dans l’entreprise', C.disp(u.dateEntree)) : ''}
      </tbody></table>
      <h4 style="margin:16px 0 6px;font-size:13px">Dernières demandes</h4>
      ${reqs.length ? `<div class="list" style="margin:0 -22px">${reqs.map(r => `<div class="li">${typeBadge(r.type)}<span class="grow s">${esc(r.dateLabel || C.disp(r.date))}</span>${statusBadge(r.status)}</div>`).join('')}</div>` : '<p class="muted">Aucune demande.</p>'}`,
    foot: `<button class="btn btn-ghost" data-act="user-edit" data-arg="${username}">${icon('edit', 15)} Modifier</button>
      <button class="btn btn-ghost" data-act="absence-direct" data-arg="${username}">${icon('plus', 15)} Absence</button>
      <button class="btn btn-primary" data-act="go" data-arg="planning/${username}">${icon('cal', 15)} Planning</button>`
  });
}
act('user-sheet', arg => openSheet(arg));

/* ─── Création / modification ─── */
function openUserForm(username = null) {
  const edit = !!username;
  const u = edit ? St.userOf(username) : { role: 'employee', hoursTarget: S.period.hoursTarget, daysTarget: 218, cpDays: 25, cpAnciennete: 0, typePlanning: C.defaultTP() };
  if (!u) return toast('Collaborateur introuvable.', 'error');
  const tp = C.tpOf(u);
  const m = modal({
    title: edit ? `Modifier — ${esc(u.name)}` : 'Nouveau collaborateur', iconName: 'user', size: 'wide',
    body: `<div class="form-grid">
        <div class="field"><label>Nom complet *</label><input class="input" id="ufName" value="${esc(u.name || '')}" placeholder="Prénom Nom"></div>
        <div class="field"><label>Poste / rayon</label><input class="input" id="ufPoste" value="${esc(u.poste || '')}" placeholder="Ex. : Conseiller de vente — Literie"></div>
        <div class="field"><label>Identifiant *</label><input class="input" id="ufUser" value="${esc(u.username || '')}" placeholder="prenom.nom" ${edit ? 'readonly' : ''} autocapitalize="none">
          <small>${edit ? 'Non modifiable après création.' : 'Sert à se connecter.'}</small></div>
        <div class="field"><label>${edit ? 'Nouveau mot de passe' : 'Mot de passe *'}</label><input class="input" id="ufPass" type="text" autocomplete="off" placeholder="${edit ? 'Laisser vide pour ne pas changer' : 'Mot de passe temporaire'}"></div>
        <div class="field"><label>E-mail</label><input class="input" id="ufEmail" type="email" value="${esc(u.email || '')}" placeholder="prenom.nom@exemple.fr"><small>Pour les notifications de demandes.</small></div>
        <div class="field"><label>Matricule</label><input class="input" id="ufMat" value="${esc(u.matricule || '')}"></div>
        <div class="field"><label>Rôle</label><select class="input" id="ufRole"><option value="employee" ${u.role !== 'admin' ? 'selected' : ''}>Collaborateur</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Direction (administrateur)</option></select></div>
        <div class="field"><label>Date d’entrée dans l’entreprise</label><input class="input" id="ufEntry" type="date" max="${S.period.endKey}" value="${esc(String(u.dateEntree || '').slice(0, 10))}">
          <small>Vide = présent sur toute la période.</small></div>
      </div>
      <div id="ufProrata" style="margin-top:10px"></div>
      <h4 style="margin:18px 0 10px;font-size:13px">Contrat</h4>
      <label class="check" style="margin-bottom:12px"><input type="checkbox" id="ufCadre" ${u.isCadre ? 'checked' : ''}> Cadre au forfait jours (saisie en demi-journées : 2 = 1 jour)</label>
      <div class="form-grid">
        <div class="field" id="ufHoursRow"><label>Objectif annuel (heures)</label><input class="input" id="ufHours" type="number" min="100" max="3000" value="${u.hoursTarget || S.period.hoursTarget}"><small>Temps plein : ${S.period.hoursTarget} h.</small></div>
        <div class="field" id="ufDaysRow"><label>Forfait annuel (jours)</label><input class="input" id="ufDays" type="number" min="1" max="365" value="${u.daysTarget || 218}"></div>
        <div class="field"><label>Congés payés / an (jours)</label><input class="input" id="ufCp" type="number" min="0" max="60" step="0.5" value="${u.cpDays ?? 25}"></div>
        <div class="field"><label>CP ancienneté / an (jours)</label><input class="input" id="ufAnc" type="number" min="0" max="30" step="0.5" value="${u.cpAnciennete || 0}"></div>
      </div>
      <h4 style="margin:18px 0 10px;font-size:13px">Planning type hebdomadaire <span class="muted" id="ufTpTotal" style="font-weight:500"></span></h4>
      <div class="tp-grid">${C.WEEK_ORDER.map(d => `<div class="field"><label>${C.cap(d).slice(0, 3)}</label><input class="input uf-tp" data-d="${d}" type="number" min="0" max="12" step="0.5" value="${tp[d]}"></div>`).join('')}</div>
      <div id="ufReapply" class="hidden" style="margin-top:12px">
        ${notice('warn', 'alert', `<b>Le planning type a changé.</b> Que faire des heures déjà planifiées ?
          <div class="stack" style="gap:6px;margin-top:8px">
            <label class="check"><input type="radio" name="ufRe" value="future" checked> Réappliquer à partir de demain (recommandé — le passé est conservé)</label>
            <label class="check"><input type="radio" name="ufRe" value="all"> Réappliquer sur toute la période (écrase les heures saisies)</label>
            <label class="check"><input type="radio" name="ufRe" value=""> Ne pas toucher au planning existant</label></div>`)}
      </div>`,
    foot: `<button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" id="ufSave">${icon('check', 16, 2.4)} ${edit ? 'Enregistrer' : 'Créer le profil'}</button>`
  });
  const el = id => $('#' + id, m.el);
  const readTP = () => Object.fromEntries($$('.uf-tp', m.el).map(i => [i.dataset.d, parseFloat(i.value) || 0]));
  const sync = () => {
    const cadre = el('ufCadre').checked;
    el('ufHoursRow').classList.toggle('hidden', cadre); el('ufDaysRow').classList.toggle('hidden', !cadre);
    const t = readTP();
    el('ufTpTotal').textContent = `· ${C.num(C.tpWeekTotal(t))} ${cadre ? 'demi-journées' : 'h'} / semaine`;
    if (edit) el('ufReapply').classList.toggle('hidden', JSON.stringify(t) === JSON.stringify(tp));
    const fake = { dateEntree: el('ufEntry').value, isCadre: cadre, hoursTarget: +el('ufHours').value, daysTarget: +el('ufDays').value };
    const ek = C.entryKey(fake, S.period);
    el('ufProrata').innerHTML = ek ? notice('violet', 'info', `Le planning démarrera le <b>${C.disp(ek)}</b> ; les jours antérieurs restent à 0 et non modifiables. Présence sur <b>${Math.round(C.prorataRatio(ek, S.period) * 100)} %</b> de la période → objectif suivi <b>${C.num(C.effectiveTarget(fake, S.period))} ${cadre ? 'jours' : 'h'}</b> (proratisé automatiquement).`) : '';
  };
  m.el.addEventListener('input', sync); m.el.addEventListener('change', sync); sync();
  el('ufSave').addEventListener('click', async ev => {
    const cadre = el('ufCadre').checked;
    const data = {
      name: el('ufName').value.trim(), poste: el('ufPoste').value.trim(), email: el('ufEmail').value.trim(), matricule: el('ufMat').value.trim(),
      role: el('ufRole').value, dateEntree: el('ufEntry').value || '', isCadre: cadre,
      hoursTarget: cadre ? 0 : (parseInt(el('ufHours').value) || S.period.hoursTarget), daysTarget: cadre ? (parseInt(el('ufDays').value) || 218) : 0,
      cpDays: parseFloat(el('ufCp').value) || 0, cpAnciennete: parseFloat(el('ufAnc').value) || 0, typePlanning: readTP()
    };
    const password = el('ufPass').value;
    try {
      await busy(ev.currentTarget, async () => {
        if (edit) {
          const changed = JSON.stringify(data.typePlanning) !== JSON.stringify(tp);
          const reapply = changed ? ($('input[name="ufRe"]:checked', m.el)?.value || null) : null;
          await St.updateUser(username, data, { password, reapply });
        } else await St.createUser({ ...data, username: el('ufUser').value }, password);
      });
      m.close(); toast(edit ? `Profil de ${data.name} mis à jour` : `Profil de ${data.name} créé`, 'success'); nav.rerender();
    } catch (e) { toast(e.message || 'Enregistrement impossible.', 'error'); }
  });
}
act('user-new', () => openUserForm());
act('user-edit', arg => openUserForm(arg));
act('user-delete', async arg => {
  const u = St.userOf(arg); if (!u) return;
  if (arg === uid()) return toast('Vous ne pouvez pas supprimer votre propre compte.', 'error');
  const ok = await confirmDialog({
    title: 'Supprimer le collaborateur', danger: true, ok: 'Supprimer définitivement',
    text: `Le profil et le planning de <b>${esc(u.name)}</b> seront supprimés. Ses demandes d’absence restent dans l’historique. Pour confirmer, saisissez son identifiant : <b>${esc(u.username)}</b>`,
    input: { label: 'Identifiant', placeholder: u.username, required: true }
  });
  if (ok === false) return;
  if (ok !== u.username) return toast('Identifiant incorrect — suppression annulée.', 'error');
  await St.deleteUser(arg); toast('Profil supprimé', 'success'); nav.rerender();
});
