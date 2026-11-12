/* ═══════════════════════════════════════════════════════════════
   MON PROFIL — informations, mot de passe, apparence, installation
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, uid, isAdmin, hasPlanning } from '../store.js';
import { $, esc, icon, avatar, act, toast, notice, busy } from '../ui.js';
import { nav } from '../nav.js';
import { APP_VERSION } from '../config.js';
import { isDemo } from '../backend.js';

export function render(root) {
  const u = S.me, st = hasPlanning() ? St.statsOf(u) : null;
  const row = (l, v) => `<div class="li" style="padding:11px 20px"><span class="soft grow">${l}</span><b>${v}</b></div>`;
  const weak = u.password === 'admin123' || u.mustChangePassword;
  root.innerHTML = `
  <div class="page-head"><div class="grow row" style="gap:14px">${avatar(u, 'lg')}<div><h2>${esc(u.name)}</h2>
    <p>${isAdmin() ? 'Direction' : esc(u.poste || 'Collaborateur')} · @${esc(u.username)}</p></div></div>
    <button class="btn btn-danger-soft" data-act="logout">${icon('logout', 16)} Se déconnecter</button></div>
  <div class="grid g2">
    <div class="stack" style="gap:16px">
      ${st ? `<div class="card"><div class="card-head"><h3>Mon contrat</h3></div><div class="list" style="margin-top:8px">
        ${row('Objectif de l’exercice', `${C.num(st.target)} ${st.unitLong}${st.prorated ? ' (proratisé)' : ''}`)}
        ${row('Planifié / réalisé à ce jour', `${C.num(st.total)} / ${C.num(st.doneToDate)} ${st.unit}`)}
        ${row('Congés payés', `${st.cp.taken} posés sur ${st.cp.alloc} j`)}
        ${st.anc.alloc ? row('CP ancienneté', `${st.anc.taken} posés sur ${st.anc.alloc} j`) : ''}
        ${row('Base hebdomadaire', `${C.num(C.tpWeekTotal(C.tpOf(u)))} ${u.isCadre ? 'demi-journées' : 'h'}`)}
        ${u.matricule ? row('Matricule', esc(u.matricule)) : ''}
        ${u.dateEntree ? row('Entrée dans l’entreprise', C.disp(u.dateEntree)) : ''}</div></div>` : ''}
      <div class="card"><div class="card-head"><h3>Coordonnées</h3></div><div class="card-body stack">
        <div class="field"><label>E-mail (réponses à vos demandes)</label><input class="input" id="pfMail" type="email" value="${esc(u.email || '')}" placeholder="prenom.nom@exemple.fr"></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" data-act="pf-mail">Enregistrer</button></div></div></div>
    </div>
    <div class="stack" style="gap:16px">
      <div class="card"><div class="card-head"><h3>Mot de passe</h3></div><div class="card-body stack">
        ${weak ? notice('warn', 'key', '<b>Mot de passe par défaut.</b> Choisissez un mot de passe personnel.') : ''}
        <div class="field"><label>Mot de passe actuel</label><input class="input" id="pfOld" type="password" autocomplete="current-password"></div>
        <div class="form-grid"><div class="field"><label>Nouveau mot de passe</label><input class="input" id="pfNew" type="password" autocomplete="new-password"></div>
          <div class="field"><label>Confirmation</label><input class="input" id="pfNew2" type="password" autocomplete="new-password"></div></div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" data-act="pf-pass">${icon('key', 16)} Changer le mot de passe</button></div></div></div>
      <div class="card"><div class="card-head"><h3>Application</h3></div><div class="list" style="margin-top:8px">
        <button class="li" data-act="theme"><span class="ic-b tone-muted">${icon('moon', 16)}</span><span class="grow"><span class="t" style="display:block">Thème clair / sombre</span><span class="s">Actuellement : ${document.documentElement.dataset.theme === 'dark' ? 'sombre' : 'clair'}</span></span>${icon('right', 15)}</button>
        <div class="li"><span class="ic-b tone-muted">${icon('phone', 16)}</span><span class="grow"><span class="t" style="display:block">Installer sur le téléphone</span>
          <span class="s">iPhone : Safari › Partager › « Sur l’écran d’accueil ». Android : Chrome › menu ⋮ › « Installer l’application ».</span></span></div>
        <button class="li" data-act="refresh"><span class="ic-b tone-muted">${icon('refresh', 16)}</span><span class="t grow">Actualiser les données</span>${icon('right', 15)}</button>
        ${isDemo ? `<button class="li" data-act="leave-demo"><span class="ic-b tone-violet">${icon('sparkle', 16)}</span><span class="t grow">Quitter le mode démonstration</span>${icon('right', 15)}</button>` : ''}
      </div></div>
      <p class="muted" style="text-align:center;font-size:12px">Suivi Annualisation · version ${APP_VERSION}</p>
    </div>
  </div>`;
}
act('pf-mail', async (_, el) => {
  const email = $('#pfMail').value.trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return toast('Adresse e-mail invalide.', 'error');
  await busy(el, () => St.updateMyEmail(email));
  toast('E-mail enregistré', 'success'); nav.rerender();
});
act('pf-pass', async (_, el) => {
  const old = $('#pfOld').value, n1 = $('#pfNew').value, n2 = $('#pfNew2').value;
  if (!(await St.verifyMyPassword(old))) return toast('Mot de passe actuel incorrect.', 'error');
  if (n1.length < 6) return toast('Le nouveau mot de passe doit contenir au moins 6 caractères.', 'error');
  if (n1 !== n2) return toast('Les deux saisies ne correspondent pas.', 'error');
  if (n1 === 'admin123') return toast('Choisissez un mot de passe différent de celui par défaut.', 'error');
  await busy(el, () => St.changePassword(uid(), n1));
  toast('Mot de passe modifié', 'success'); nav.rerender();
});
