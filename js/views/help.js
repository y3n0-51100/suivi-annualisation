/* ═══════════════════════════════════════════════════════════════
   GUIDE DES 1607 H — situation personnelle + questions fréquentes
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S, hasPlanning } from '../store.js';
import { $, esc, icon, ring, notice } from '../ui.js';
import { INFO_1607_FAQ } from '../faq.js';

let q = '';
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function faq() {
  const n = norm(q.trim());
  const html = INFO_1607_FAQ.map(cat => {
    const items = cat.items.filter(i => !n || norm(i.q + ' ' + i.a).includes(n));
    if (!items.length) return '';
    return `<h3 style="font-size:14px;margin:20px 0 10px">${esc(cat.cat)}</h3>` + items.map(i =>
      `<details class="faq-q" ${n ? 'open' : ''}><summary>${esc(i.q)}</summary><div class="a">${i.a}${i.ref ? `<br><span class="ref">${esc(i.ref)}</span>` : ''}</div></details>`).join('');
  }).join('');
  return html || '<div class="empty">Aucune question ne correspond à votre recherche.</div>';
}

export function render(root) {
  let mine = '';
  if (hasPlanning()) {
    const st = St.statsOf(S.me);
    const msg = st.gap > 0 ? `Vous avez <b>${C.num(st.gap)} ${st.unit} de récupération</b> prévisionnelle.`
      : st.remaining > 0 ? `Il reste <b>${C.num(st.remaining)} ${st.unit}</b> à planifier pour atteindre votre objectif.` : 'Votre planning atteint exactement votre objectif.';
    mine = `<div class="card card-pad row wrap" style="gap:22px;margin-bottom:16px">
      ${ring(st.pct, 104, st.gap > 0 ? 'var(--ok)' : 'var(--brand)', 'de l’objectif', 'var(--surface-3)')}
      <div class="grow"><h3 style="font-size:16px;margin-bottom:6px">Votre situation</h3>
        <div class="row wrap" style="gap:22px">
          <div><div class="muted" style="font-size:12px">Objectif${st.prorated ? ' (proratisé)' : ''}</div><b style="font-size:18px">${C.num(st.target)} ${st.unit}</b></div>
          <div><div class="muted" style="font-size:12px">Planifié</div><b style="font-size:18px">${C.num(st.total)} ${st.unit}</b></div>
          <div><div class="muted" style="font-size:12px">Réalisé à ce jour</div><b style="font-size:18px">${C.num(st.doneToDate)} ${st.unit}</b></div>
          <div><div class="muted" style="font-size:12px">CP restants</div><b style="font-size:18px">${st.cp.left} j</b></div>
        </div><p class="soft" style="margin-top:8px">${msg}</p></div></div>`;
  }
  root.innerHTML = `
  <div class="page-head"><div class="grow"><h2>Tout sur les 1607 heures</h2><p>Comprendre l’annualisation, vos droits et vos obligations — commerce de détail non alimentaire</p></div></div>
  ${mine}
  <div class="card card-pad">
    <div class="row" style="gap:10px"><span class="muted">${icon('search', 18)}</span>
      <input class="input" id="faqQ" placeholder="Rechercher une question (heures sup, congés, dimanche…)" value="${esc(q)}"></div>
    <div id="faqList">${faq()}</div>
    <div style="margin-top:18px">${notice('soft', 'scale', '<b>Sources :</b> Code du travail (articles cités) et convention collective nationale du commerce de détail non alimentaire (IDCC 1517). Pour toute situation particulière, rapprochez-vous de la direction ou des représentants du personnel.')}</div>
  </div>`;
  root.oninput = e => { if (e.target.id === 'faqQ') { q = e.target.value; $('#faqList').innerHTML = faq(); } };
}
