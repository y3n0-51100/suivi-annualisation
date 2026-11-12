/* ═══════════════════════════════════════════════════════════════
   PARAMÈTRES (direction)
   Général · Période · Fériés & dimanches · Verrouillages ·
   Présence direction · Sauvegardes · Historique · Sécurité
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S } from '../store.js';
import { $, $$, esc, icon, act, empty, toast, confirmDialog, notice, fmtTs, busy, download } from '../ui.js';
import { nav } from '../nav.js';
import { APP_VERSION } from '../config.js';

const P = { tab: 'general', mgrMonth: null, auditQ: '' };
const TABS = [['general', 'Général', 'settings'], ['period', 'Période', 'cal'], ['holidays', 'Fériés & dimanches', 'flag'], ['locks', 'Verrouillages', 'lock'],
  ['presence', 'Présence direction', 'user'], ['backups', 'Sauvegardes', 'database'], ['history', 'Historique', 'history'], ['security', 'Sécurité', 'shield']];
let asyncData = { snaps: null, audit: null };

export function render(root, params) {
  if (TABS.some(t => t[0] === params[0])) { P.tab = params[0]; history.replaceState({}, '', '#/settings'); }
  root.innerHTML = `
  <div class="page-head"><div class="grow"><h2>Paramètres</h2><p>Configuration du magasin et de l’exercice ${S.period.label}</p></div></div>
  <div class="tabs">${TABS.map(([id, l, ic]) => `<button class="${P.tab === id ? 'on' : ''}" data-act="st-tab" data-arg="${id}">${icon(ic, 15)} ${l}</button>`).join('')}</div>
  <div id="stBody">${({ general, period, holidays, locks, presence, backups, history: historyTab, security })[P.tab]()}</div>`;
  if (P.tab === 'backups' && !asyncData.snaps) St.listSnapshots().then(l => { asyncData.snaps = l; if (P.tab === 'backups') nav.rerender(); }).catch(() => { asyncData.snaps = []; });
  if (P.tab === 'history' && !asyncData.audit) St.loadAudit().then(l => { asyncData.audit = l; if (P.tab === 'history') nav.rerender(); }).catch(() => { asyncData.audit = []; });
  root.oninput = e => { if (e.target.id === 'auditQ') { P.auditQ = e.target.value; $('#auditList').innerHTML = auditRows(); } };
}
act('st-tab', arg => { P.tab = arg; if (arg === 'backups') asyncData.snaps = null; if (arg === 'history') asyncData.audit = null; nav.rerender(); });

/* ─── Général ─── */
function general() {
  return `<div class="card" style="max-width:760px"><div class="card-head"><h3>Magasin</h3></div><div class="card-body stack">
    <div class="form-grid">
      <div class="field"><label>Nom affiché</label><input class="input" id="gName" value="${esc(S.store.storeName || '')}"></div>
      <div class="field"><label>E-mail de réception des demandes</label><input class="input" id="gMail" type="email" value="${esc(S.store.managerEmail || '')}" placeholder="adresse de la direction (par défaut)"></div>
      <div class="field"><label>Délai minimum pour la camionnette (heures)</label><input class="input" id="gVan" type="number" min="0" max="240" value="${S.store.vanMinHours ?? 48}"></div>
      <div class="field"><label>Décompte des congés payés</label><select class="input" id="gCp">
        <option value="ouvrables" ${S.store.cpMode !== 'planning' ? 'selected' : ''}>Jours ouvrables : lundi → samedi (règle actuelle)</option>
        <option value="planning" ${S.store.cpMode === 'planning' ? 'selected' : ''}>Jours habituellement travaillés du collaborateur</option></select>
        <small>S’applique aux prochaines demandes approuvées. Les fériés fermés ne sont jamais décomptés.</small></div>
    </div>
    <div><div class="lbl" style="margin-bottom:8px">Effectif minimum présent par jour <span class="muted" style="font-weight:400">— sert aux alertes du planning équipe et à l’analyse des demandes (0 = pas de contrôle)</span></div>
      <div class="tp-grid">${C.WEEK_ORDER.map(d => `<div class="field"><label>${C.cap(d).slice(0, 3)}</label><input class="input g-min" data-d="${d}" type="number" min="0" max="50" value="${S.store.minStaff[d] ?? 0}"></div>`).join('')}</div>
      <small class="muted">Le seuil du dimanche s’applique uniquement aux dimanches ouverts.</small></div>
    <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" data-act="st-save-general">${icon('check', 16, 2.4)} Enregistrer</button></div>
  </div></div>`;
}
act('st-save-general', async (_, el) => {
  await busy(el, () => St.saveStore({
    storeName: $('#gName').value.trim(), managerEmail: $('#gMail').value.trim(), vanMinHours: Math.max(0, parseInt($('#gVan').value) || 0), cpMode: $('#gCp').value,
    minStaff: Object.fromEntries($$('.g-min').map(i => [i.dataset.d, Math.max(0, parseInt(i.value) || 0)]))
  }));
  toast('Paramètres enregistrés', 'success'); nav.rerender();
});

/* ─── Période ─── */
function period() {
  const m0 = S.period.months[0];
  return `<div class="card" style="max-width:760px"><div class="card-head"><h3>Exercice d’annualisation</h3><span class="sub">${S.period.longLabel}</span></div><div class="card-body stack">
    <div class="form-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
      <div class="field"><label>Mois de début</label><select class="input" id="pMonth">${C.MONTHS_FR.map((n, i) => `<option value="${i}" ${i === m0.month ? 'selected' : ''}>${C.cap(n)}</option>`).join('')}</select></div>
      <div class="field"><label>Année de début</label><input class="input" id="pYear" type="number" min="2024" max="2040" value="${m0.year}"></div>
      <div class="field"><label>Objectif annuel par défaut (h)</label><input class="input" id="pTarget" type="number" min="100" max="3000" value="${S.period.hoursTarget}"></div>
    </div>
    ${notice('warn', 'alert', 'Changer la période déplace la fenêtre de 12 mois sur laquelle sont calculés les compteurs. Les plannings déjà saisis ne sont pas supprimés. Pour un <b>nouvel exercice</b>, créez d’abord une sauvegarde, puis changez l’année : les jours manquants sont créés à partir du planning type à la prochaine ouverture de chaque planning.')}
    <div class="row" style="justify-content:flex-end"><button class="btn btn-primary" data-act="st-save-period">${icon('check', 16, 2.4)} Appliquer</button></div>
  </div></div>`;
}
act('st-save-period', async () => {
  const cfg = { startMonth: +$('#pMonth').value, startYear: +$('#pYear').value, hoursTarget: parseInt($('#pTarget').value) || 1607 };
  if (!(cfg.startYear >= 2024)) return toast('Année invalide.', 'error');
  const next = C.buildPeriod(cfg);
  const ok = await confirmDialog({ title: 'Modifier la période', text: `Nouvel exercice : <b>${next.longLabel}</b>, objectif <b>${cfg.hoursTarget} h</b>. Les compteurs de tous les collaborateurs seront recalculés sur cette période.`, ok: 'Appliquer' });
  if (!ok) return;
  const changed = next.startKey !== S.period.startKey;
  await St.savePeriod(cfg);
  if (changed) {
    // complète les plannings avec les jours de la nouvelle période qui n'existent pas encore
    await St.loadAllSchedules(true);
    for (const u of St.team()) {
      const days = { ...St.daysOf(u.username) };
      const missing = C.rangeKeys(next.startKey, next.endKey).filter(k => !days[k]);
      if (!missing.length) continue;
      missing.forEach(k => { days[k] = C.emptyDay(k, u, next); });
      const filled = C.applyTypePlanning(days, u, next, { holidays: S.holidays });
      const patch = {}; missing.forEach(k => { patch[k] = filled[k]; });
      await St.saveDays(u.username, patch);
    }
  }
  toast('Période mise à jour', 'success'); nav.rerender();
});

/* ─── Fériés & dimanches ─── */
function holidays() {
  const hol = Object.entries(S.holidays).sort((a, b) => a[0].localeCompare(b[0]));
  const sun = Object.entries(S.openSundays).sort((a, b) => a[0].localeCompare(b[0]));
  return `<div class="grid g2">
    <div class="card"><div class="card-head"><h3>Jours fériés</h3>
        <button class="btn btn-soft btn-sm right" data-act="st-hol-defaults">${icon('download', 14)} Charger les fériés ${S.period.label}</button></div>
      <div class="card-body">
        <div class="row wrap" style="gap:8px;align-items:flex-end">
          <div class="field"><label>Date</label><input class="input sm" type="date" id="hDate" min="${S.period.startKey}" max="${S.period.endKey}"></div>
          <div class="field grow"><label>Nom</label><input class="input sm" id="hName" placeholder="Ex. : Noël"></div>
          <div class="field"><label>Magasin</label><select class="input sm" id="hOpen"><option value="0">Fermé</option><option value="1">Ouvert</option></select></div>
          <button class="btn btn-primary btn-sm" data-act="st-hol-add">${icon('plus', 15, 2.4)} Ajouter</button></div>
        <p class="muted" style="font-size:12.5px;margin-top:8px">Un férié <b>fermé</b> passe la journée à 0 h et la verrouille pour tous les collaborateurs. Le repasser en <b>ouvert</b> rétablit les heures du planning type.</p>
      </div>
      <div class="list">${hol.length ? hol.map(([d, h]) => `<div class="li"><span class="ic-b tone-${h.open ? 'warn' : 'danger'}">${icon('flag', 15)}</span>
        <div class="grow"><div class="t">${esc(h.name)}</div><div class="s">${C.cap(C.longDate(d, true))}</div></div>
        <button class="btn btn-sm ${h.open ? 'btn-ok-soft' : 'btn-danger-soft'}" data-act="st-hol-toggle" data-arg="${d}" title="Basculer ouvert / fermé">${h.open ? 'Ouvert' : 'Fermé'}</button>
        <button class="btn btn-soft btn-sm btn-icon" data-act="st-hol-del" data-arg="${d}" title="Supprimer">${icon('trash', 14)}</button></div>`).join('') : empty('flag', 'Aucun jour férié', 'Utilisez « Charger les fériés » pour démarrer.')}</div>
    </div>
    <div class="card"><div class="card-head"><h3>Dimanches ouverts</h3></div>
      <div class="card-body"><div class="row wrap" style="gap:8px;align-items:flex-end">
        <div class="field"><label>Date</label><input class="input sm" type="date" id="sDate" min="${S.period.startKey}" max="${S.period.endKey}"></div>
        <div class="field grow"><label>Note</label><input class="input sm" id="sNote" placeholder="Ex. : Soldes, Noël…"></div>
        <button class="btn btn-primary btn-sm" data-act="st-sun-add">${icon('plus', 15, 2.4)} Ajouter</button></div>
        <p class="muted" style="font-size:12.5px;margin-top:8px">Signalés dans tous les plannings ; l’effectif minimum du dimanche s’y applique.</p></div>
      <div class="list">${sun.length ? sun.map(([d, v]) => `<div class="li"><span class="ic-b tone-violet">${icon('sun', 15)}</span>
        <div class="grow"><div class="t">${esc(v.note || 'Dimanche ouvert')}</div><div class="s">${C.cap(C.longDate(d, true))}</div></div>
        <button class="btn btn-soft btn-sm btn-icon" data-act="st-sun-del" data-arg="${d}" title="Supprimer">${icon('trash', 14)}</button></div>`).join('') : empty('sun', 'Aucun dimanche ouvert', '')}</div>
    </div></div>`;
}
act('st-hol-defaults', async (_, el) => { const n = await busy(el, () => St.loadDefaultHolidays()); toast(n ? `${n} jour(s) férié(s) ajouté(s) — plannings mis à jour` : 'Tous les fériés sont déjà chargés', n ? 'success' : 'info'); nav.rerender(); });
act('st-hol-add', async (_, el) => {
  const d = $('#hDate').value, name = $('#hName').value.trim();
  if (!d || !name) return toast('Date et nom sont obligatoires.', 'error');
  await busy(el, () => St.setHoliday(d, name, $('#hOpen').value === '1')); toast(`Férié « ${name} » enregistré`, 'success'); nav.rerender();
});
act('st-hol-toggle', async (d, el) => { const h = S.holidays[d]; await busy(el, () => St.setHoliday(d, h.name, !h.open)); toast(`${h.name} : magasin ${!h.open ? 'ouvert — heures du planning type rétablies' : 'fermé — 0 h appliqué à tous'}`, 'success'); nav.rerender(); });
act('st-hol-del', async d => { if (await confirmDialog({ title: 'Supprimer le jour férié', text: `Supprimer « ${esc(S.holidays[d]?.name)} » du ${C.disp(d)} ?`, ok: 'Supprimer', danger: true })) { await St.deleteHoliday(d); nav.rerender(); } });
act('st-sun-add', async () => {
  const d = $('#sDate').value;
  if (!d) return toast('Sélectionnez une date.', 'error');
  if (C.dow(d) !== 0) return toast('Cette date n’est pas un dimanche.', 'error');
  await St.setOpenSunday(d, $('#sNote').value.trim()); toast('Dimanche ouvert ajouté', 'success'); nav.rerender();
});
act('st-sun-del', async d => { await St.setOpenSunday(d, null); nav.rerender(); });

/* ─── Verrouillages ─── */
function locks() {
  return `${notice('soft', 'lock', 'Un mois verrouillé empêche les collaborateurs de modifier leurs heures sur la période choisie (clôture de paie). La direction garde la main.')}
  <div class="grid g4" style="margin-top:14px">${S.period.months.map(m => {
    const info = S.locks[m.idx], lk = C.isMonthLocked(S.locks, m.idx);
    const from = typeof info === 'object' ? info.from : (lk ? m.startKey : ''), to = typeof info === 'object' ? info.to : (lk ? m.endKey : '');
    return `<div class="card card-pad stack" style="gap:10px;${lk ? 'border-color:var(--violet)' : ''}">
      <div class="row"><b>${m.name} ${m.year}</b><span class="badge ${lk ? 'b-violet' : 'b-muted'} right">${icon(lk ? 'lock' : 'unlock', 12)} ${lk ? 'Verrouillé' : 'Ouvert'}</span></div>
      <div class="row" style="gap:6px"><input class="input sm" type="date" id="lf${m.idx}" value="${from}" min="${m.startKey}" max="${m.endKey}" aria-label="Du"><input class="input sm" type="date" id="lt${m.idx}" value="${to}" min="${m.startKey}" max="${m.endKey}" aria-label="Au"></div>
      <div class="row" style="gap:6px">${lk ? `<button class="btn btn-soft btn-sm grow" data-act="st-lock" data-arg="${m.idx}|range">Modifier</button><button class="btn btn-ok-soft btn-sm" data-act="st-lock" data-arg="${m.idx}|off">${icon('unlock', 14)} Ouvrir</button>`
        : `<button class="btn btn-dark btn-sm grow" data-act="st-lock" data-arg="${m.idx}|full">${icon('lock', 14)} Mois complet</button><button class="btn btn-soft btn-sm" data-act="st-lock" data-arg="${m.idx}|range">Période</button>`}</div></div>`;
  }).join('')}</div>`;
}
act('st-lock', async arg => {
  const [i, mode] = arg.split('|'), m = S.period.months[+i];
  if (mode === 'off') await St.setLock(+i, null);
  else if (mode === 'full') await St.setLock(+i, { from: m.startKey, to: m.endKey });
  else {
    const from = $('#lf' + i).value, to = $('#lt' + i).value;
    if (!from || !to || from > to) return toast('Renseignez deux dates valides (du / au).', 'error');
    await St.setLock(+i, { from, to });
  }
  toast(mode === 'off' ? `${m.name} déverrouillé` : `${m.name} verrouillé`, 'success'); nav.rerender();
});

/* ─── Présence direction ─── */
function presence() {
  if (P.mgrMonth === null) P.mgrMonth = C.currentMonthIndex(S.period);
  const m = S.period.months[P.mgrMonth];
  const LBL = { journee: 'Absent la journée', matin: 'Absent le matin', 'apres-midi': 'Absent l’après-midi' };
  const rows = C.rangeKeys(m.startKey, m.endKey).filter(k => C.dow(k) !== 0).map(k => {
    const a = S.mgrAbs[k];
    return `<div class="li" style="padding:8px 20px"><b style="width:120px">${C.cap(C.DAYS[C.dow(k)])} ${+k.slice(8)}</b>
      <span class="grow">${a ? `<span class="badge b-violet">${LBL[a]}</span>` : '<span class="muted">Présent</span>'}</span>
      ${a ? `<button class="btn btn-soft btn-sm" data-act="st-mgr" data-arg="${k}|">Retirer</button>` : ['journee', 'matin', 'apres-midi'].map(t => `<button class="btn btn-ghost btn-sm" data-act="st-mgr" data-arg="${k}|${t}">${{ journee: 'Journée', matin: 'Matin', 'apres-midi': 'Après-midi' }[t]}</button>`).join('')}</div>`;
  }).join('');
  return `${notice('soft', 'user', 'Vos absences saisies ici sont affichées aux collaborateurs dans leur planning (bandeau « Direction absente »).')}
  <div class="card" style="margin-top:14px;max-width:820px"><div class="card-head"><h3>${m.name} ${m.year}</h3>
    <div class="row right" style="gap:6px"><button class="btn btn-ghost btn-icon btn-sm" data-act="st-mgr-month" data-arg="-1" ${P.mgrMonth === 0 ? 'disabled' : ''}>${icon('left', 16, 2.4)}</button>
      <button class="btn btn-ghost btn-icon btn-sm" data-act="st-mgr-month" data-arg="1" ${P.mgrMonth === 11 ? 'disabled' : ''}>${icon('right', 16, 2.4)}</button></div></div>
    <div class="list" style="margin-top:8px">${rows}</div></div>`;
}
act('st-mgr', async arg => { const [k, t] = arg.split('|'); await St.setMgrAbs({ [k]: t || null }); nav.rerender(); });
act('st-mgr-month', arg => { P.mgrMonth = Math.max(0, Math.min(11, P.mgrMonth + +arg)); nav.rerender(); });

/* ─── Sauvegardes ─── */
function backups() {
  const list = asyncData.snaps;
  return `<div class="card" style="margin-bottom:16px"><div class="card-pad row wrap">
      <span class="ic-b lg tone-info">${icon('database', 19)}</span>
      <div class="grow"><b>Sauvegarde de tous les plannings</b><div class="muted" style="font-size:12.5px">Une sauvegarde automatique est créée chaque jour à la première connexion de la direction. Les 30 dernières sont conservées.</div></div>
      <button class="btn btn-primary" data-act="st-snap-new">${icon('plus', 16, 2.4)} Sauvegarder maintenant</button></div></div>
    <div class="card"><div class="card-head"><h3>Sauvegardes disponibles</h3><span class="sub">${list ? list.length : '…'}</span></div>
      <div class="list" style="margin-top:8px">${!list ? '<div class="empty"><div class="spinner dark" style="margin:0 auto"></div></div>' : list.length ? list.map(s => `<div class="li">
        <span class="ic-b tone-${s.type === 'auto' ? 'muted' : 'brand'}">${icon(s.type === 'auto' ? 'refresh' : 'database', 15)}</span>
        <div class="grow"><div class="t">${new Date(s.createdAtMs || 0).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</div>
          <div class="s">${s.type === 'auto' ? 'Automatique' : 'Manuelle'} · ${s.userCount || 0} plannings · ${esc(s.createdBy || '')}</div></div>
        <button class="btn btn-ghost btn-sm" data-act="st-snap-dl" data-arg="${s.id}">${icon('download', 14)}<span class="hide-m"> JSON</span></button>
        <button class="btn btn-warn-soft btn-sm" data-act="st-snap-restore" data-arg="${s.id}">${icon('undo', 14)} Restaurer</button>
        <button class="btn btn-soft btn-sm btn-icon" data-act="st-snap-del" data-arg="${s.id}" title="Supprimer">${icon('trash', 14)}</button></div>`).join('')
        : empty('database', 'Aucune sauvegarde', 'Créez-en une avant toute opération importante.')}</div></div>`;
}
act('st-snap-new', async (_, el) => { const d = await busy(el, () => St.createSnapshot('manual')); toast(`Sauvegarde créée (${d.userCount} plannings)`, 'success'); asyncData.snaps = null; nav.rerender(); });
act('st-snap-dl', arg => { const s = asyncData.snaps?.find(x => x.id === arg); if (s) download(`${s.id}.json`, JSON.stringify(s, null, 2), 'application/json'); });
act('st-snap-del', async arg => { if (await confirmDialog({ title: 'Supprimer la sauvegarde', text: 'Cette sauvegarde sera définitivement supprimée.', ok: 'Supprimer', danger: true })) { await St.deleteSnapshot(arg); asyncData.snaps = null; nav.rerender(); } });
act('st-snap-restore', async arg => {
  const s = asyncData.snaps?.find(x => x.id === arg);
  const res = await confirmDialog({
    title: 'Restaurer une sauvegarde', danger: true, ok: 'Restaurer',
    text: `Tous les plannings seront remplacés par leur état du <b>${new Date(s?.createdAtMs || 0).toLocaleString('fr-FR')}</b>. Une sauvegarde de sécurité est créée juste avant. Tapez <b>RESTAURER</b> pour confirmer.`,
    input: { label: 'Confirmation', placeholder: 'RESTAURER', required: true }
  });
  if (res === false) return;
  if (String(res).toUpperCase() !== 'RESTAURER') return toast('Confirmation incorrecte — rien n’a été modifié.', 'error');
  try { const n = await St.restoreSnapshot(arg); toast(`Restauration terminée (${n} plannings)`, 'success'); asyncData.snaps = null; nav.rerender(); }
  catch (e) { toast(e.message, 'error'); }
});

/* ─── Historique ─── */
const auditRows = () => {
  const q = P.auditQ.trim().toLowerCase();
  const list = (asyncData.audit || []).filter(e => !q || `${e.userName} ${e.message}`.toLowerCase().includes(q));
  return list.length ? list.map(e => `<div class="ev"><span class="dot"></span><div class="grow"><b>${esc(e.userName || '?')}</b> <span class="muted" style="font-size:12px">${fmtTs(e.timestamp)}</span><div class="soft">${esc(e.message || '')}</div></div></div>`).join('')
    : '<div class="empty">Aucune entrée</div>';
};
function historyTab() {
  return `<div class="card" style="max-width:900px"><div class="card-head"><h3>Dernières actions</h3><span class="sub">300 plus récentes</span>
      <input class="input sm right" id="auditQ" style="max-width:240px" placeholder="Filtrer…" value="${esc(P.auditQ)}"></div>
    <div class="card-body"><div class="timeline" id="auditList">${asyncData.audit ? auditRows() : '<div class="empty"><div class="spinner dark" style="margin:0 auto"></div></div>'}</div></div></div>`;
}

/* ─── Sécurité & zone dangereuse ─── */
function security() {
  return `<div class="stack" style="gap:16px;max-width:820px">
    <div class="card"><div class="card-head"><h3>Mots de passe</h3></div><div class="card-body stack">
      ${S.store.hashPasswords
        ? notice('ok', 'shield', '<b>Protection active.</b> Les mots de passe sont enregistrés sous forme d’empreinte (SHA-256) : ils ne sont plus lisibles dans la base.')
        : notice('warn', 'alert', `<b>Les mots de passe sont enregistrés en clair</b> (fonctionnement historique). Activez la protection pour les remplacer par une empreinte illisible.<br><span style="font-size:12.5px">À activer une fois cette version en production : l’ancienne version de l’outil ne sait pas lire les empreintes.</span>`)}
      ${S.store.hashPasswords ? '' : `<div class="row"><button class="btn btn-dark" data-act="st-hash">${icon('shield', 16)} Protéger tous les mots de passe</button></div>`}
      <p class="muted" style="font-size:12.5px">Chaque utilisateur peut changer son mot de passe depuis « Mon profil ». Version ${APP_VERSION}.</p>
    </div></div>
    <div class="card" style="border-color:var(--danger)"><div class="card-head"><h3 style="color:var(--danger-ink)">Zone dangereuse</h3></div>
      <div class="list" style="margin-top:8px">
        <div class="li"><div class="grow"><div class="t">Remettre toutes les heures à zéro</div><div class="s">Vide les plannings de tous les collaborateurs sur l’exercice (une sauvegarde est créée avant).</div></div>
          <button class="btn btn-danger-soft btn-sm" data-act="st-reset-hours">Remettre à zéro</button></div>
        <div class="li"><div class="grow"><div class="t">Tout supprimer</div><div class="s">Collaborateurs, plannings, demandes, annonces, historique et paramètres. Les sauvegardes sont conservées.</div></div>
          <button class="btn btn-danger btn-sm" data-act="st-wipe">Tout supprimer</button></div>
      </div></div></div>`;
}
async function askPassword(title, text) {
  const pw = await confirmDialog({ title, text, danger: true, ok: 'Confirmer', input: { label: 'Votre mot de passe', type: 'password', required: true } });
  if (pw === false) return false;
  if (!(await St.verifyMyPassword(String(pw)))) { toast('Mot de passe incorrect — action annulée.', 'error'); return false; }
  return true;
}
act('st-hash', async (_, el) => {
  if (!(await confirmDialog({ title: 'Protéger les mots de passe', text: 'Tous les mots de passe seront remplacés par une empreinte. Les identifiants et mots de passe actuels continuent de fonctionner. <b>Opération irréversible</b> : l’ancienne version de l’outil ne pourra plus authentifier les comptes.', ok: 'Protéger' }))) return;
  const n = await busy(el, () => St.hashAllPasswords()); toast(`${n} mot(s) de passe protégé(s)`, 'success'); nav.rerender();
});
act('st-reset-hours', async () => {
  if (!(await askPassword('Remettre toutes les heures à zéro', 'Les plannings de tous les collaborateurs seront vidés. Saisissez votre mot de passe pour confirmer.'))) return;
  await St.resetAllHours(); toast('Toutes les heures ont été remises à zéro', 'success'); nav.rerender();
});
act('st-wipe', async () => {
  if (!(await askPassword('Tout supprimer', '<b>Dernière confirmation.</b> Toutes les données seront supprimées et un compte direction vierge sera recréé (identifiant <b>admin</b>, mot de passe <b>admin123</b> à changer aussitôt).'))) return;
  await St.wipeEverything(); toast('Toutes les données ont été supprimées', 'warning');
  setTimeout(() => { St.logout(); location.href = location.pathname; }, 1200);
});
