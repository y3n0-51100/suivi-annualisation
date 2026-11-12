/* ═══════════════════════════════════════════════════════════════
   RAPPORTS & CONTRÔLES (direction)
   Bilan · export Excel / CSV · vérification feuille d'heures ·
   impression des plannings
   ═══════════════════════════════════════════════════════════════ */
import * as C from '../core.js';
import * as St from '../store.js';
import { S } from '../store.js';
import { $, esc, icon, act, empty, toast, kpi, download, busy, notice } from '../ui.js';
import { nav } from '../nav.js';
import { loadScript } from '../backend.js';
import { CDN } from '../config.js';

const R = { tab: 'overview', user: '', mode: 'dates', from: '', to: '', w1: '', w2: '', ppUser: 'all', ppPeriod: 'next15', ppFrom: '', ppTo: '' };
const TABS = [['overview', 'Bilan de l’équipe'], ['check', 'Vérification feuille d’heures'], ['print', 'Impression des plannings']];

export function render(root, params) {
  if (TABS.some(t => t[0] === params[0])) { R.tab = params[0]; history.replaceState({}, '', '#/reports'); }
  root.innerHTML = `
  <div class="page-head"><div class="grow"><h2>Rapports & contrôles</h2><p>Bilan d’annualisation, exports pour la paie et documents à signer</p></div></div>
  <div class="tabs">${TABS.map(([id, l]) => `<button class="${R.tab === id ? 'on' : ''}" data-act="rp-tab" data-arg="${id}">${l}</button>`).join('')}</div>
  ${R.tab === 'overview' ? overview() : R.tab === 'check' ? check() : printTab()}`;
  root.onchange = e => {
    const map = { vfUser: 'user', vfMode: 'mode', vfFrom: 'from', vfTo: 'to', vfW1: 'w1', vfW2: 'w2', ppUser: 'ppUser', ppPeriod: 'ppPeriod', ppFrom: 'ppFrom', ppTo: 'ppTo' };
    if (map[e.target.id]) { R[map[e.target.id]] = e.target.value; if (e.target.id === 'vfW1' && R.w2 < R.w1) R.w2 = R.w1; nav.rerender(); }
  };
}

/* ─── Bilan ─── */
function overview() {
  const users = St.team();
  const rows = users.map(u => ({ u, st: St.statsOf(u) }));
  const tot = t => rows.reduce((s, r) => s + r.st.byType[t].days, 0);
  // taux d'absentéisme : jours maladie + autre / jours planifiés (travaillés + absences), hors congés
  let worked = 0, sick = 0;
  users.forEach(u => { const d = St.daysOf(u.username); for (const k in d) { if (!C.inPeriod(S.period, k) || k > C.todayKey()) continue; const e = d[k]; if (['Maladie', 'Autre'].includes(e.type)) sick++; else if (!C.TYPES[e.type] && C.hoursOf(e) > 0) worked++; } });
  const rate = worked + sick ? Math.round(sick / (worked + sick) * 1000) / 10 : 0;
  const monthly = S.period.months.map((m, i) => rows.reduce((s, r) => s + (r.st.cadre ? 0 : r.st.months[i]), 0));
  const max = Math.max(1, ...monthly), cur = C.currentMonthIndex(S.period);
  return `
  <div class="grid g4" style="margin-bottom:16px">
    ${kpi({ label: 'Jours de CP posés', value: tot('CP'), sub: `sur ${rows.reduce((s, r) => s + r.st.cp.alloc, 0)} jours acquis`, ic: 'sun', tone: 'warn' })}
    ${kpi({ label: 'Jours de maladie', value: tot('Maladie'), sub: `absentéisme à date : ${C.num(rate)} %`, ic: 'pulse', tone: 'danger' })}
    ${kpi({ label: 'Récupération posée', value: `${C.num(rows.reduce((s, r) => s + r.st.byType['Récupération'].hours, 0))}<small> h</small>`, sub: `${C.num(rows.reduce((s, r) => s + (r.st.cadre ? 0 : r.st.recup), 0))} h encore disponibles`, ic: 'clock', tone: 'info' })}
    ${kpi({ label: 'Jours de formation', value: tot('Formation'), sub: 'comptés comme travail effectif', ic: 'book', tone: 'teal' })}
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-head"><h3>Bilan par collaborateur</h3><span class="sub">exercice ${S.period.label}</span>
      <div class="row right" style="gap:8px"><button class="btn btn-ghost btn-sm" data-act="rp-csv">${icon('file', 15)} CSV du mois (paie)</button>
        <button class="btn btn-primary btn-sm" data-act="rp-xlsx">${icon('download', 15)} Export Excel complet</button></div></div>
    <div class="table-wrap" style="margin-top:10px"><table class="tbl compact">
      <thead><tr><th>Collaborateur</th><th class="num">Objectif</th><th class="num">Planifié</th><th class="num">Réalisé à date</th><th class="num" title="Écart à l’objectif une fois les CP restants posés">Écart prév.</th>
        <th class="num">CP</th><th class="num">Anc.</th><th class="num">Récup. (h)</th><th class="num">Maladie</th><th class="num">Formation</th><th class="num">Évén. fam.</th></tr></thead>
      <tbody>${rows.map(({ u, st }) => `<tr><td><b>${esc(u.name)}</b>${u.matricule ? `<span class="muted"> · ${esc(u.matricule)}</span>` : ''}</td>
        <td class="num">${C.num(st.target)} ${st.unit}</td><td class="num">${C.num(st.total)}</td><td class="num">${C.num(st.doneToDate)}</td>
        <td class="num"><span class="badge ${st.gapNet > 14 ? 'b-warn' : st.gapNet < -14 ? 'b-danger' : 'b-ok'}" title="Écart à l’objectif une fois les CP restants posés (brut : ${st.gap > 0 ? '+' : ''}${C.num(st.gap)})">${st.gapNet > 0 ? '+' : ''}${C.num(st.gapNet)}</span></td>
        <td class="num">${st.cp.taken}/${st.cp.alloc}</td><td class="num">${st.anc.taken}/${st.anc.alloc}</td><td class="num">${C.num(st.byType['Récupération'].hours)}</td>
        <td class="num">${st.byType['Maladie'].days} j</td><td class="num">${st.byType['Formation'].days} j</td><td class="num">${st.byType['Événement Familial'].days} j</td></tr>`).join('')}</tbody></table></div>
  </div>
  <div class="card"><div class="card-head"><h3>Heures planifiées par mois</h3><span class="sub">toute l’équipe, hors cadres au forfait</span></div>
    <div class="card-body"><div class="bars">${S.period.months.map((m, i) => `<div class="b ${i < cur ? 'past' : i === cur ? 'cur' : 'fut'}" title="${m.name} : ${C.num(monthly[i])} h">
      <em class="tnum">${C.num(Math.round(monthly[i]))}</em><i style="height:${Math.round(monthly[i] / max * 100)}px"></i><span>${m.short.replace('.', '')}</span></div>`).join('')}</div></div></div>`;
}

async function exportXlsx() {
  if (!window.XLSX) await loadScript(CDN.xlsx);
  const X = window.XLSX, users = St.team();
  const synth = [['Matricule', 'Nom', 'Identifiant', 'Poste', 'Statut', 'Objectif', 'Unité', 'Planifié exercice', '% objectif', 'Réalisé à date', 'Attendu à date', 'Écart à date', 'Écart fin d’exercice (brut)', 'Écart après CP restants',
    'CP posés', 'CP acquis', 'CP anc. posés', 'CP anc. acquis', 'Récup. posée (h)', 'Jours maladie', 'Jours formation', 'Jours évén. familial']];
  users.forEach(u => { const st = St.statsOf(u); synth.push([u.matricule || '', u.name, u.username, u.poste || '', st.cadre ? 'Cadre' : 'Non-cadre', st.target, st.unit, st.total, st.pct + '%', st.doneToDate, st.expectedToDate, st.gapToDate, st.gap, st.gapNet,
    st.cp.taken, st.cp.alloc, st.anc.taken, st.anc.alloc, st.byType['Récupération'].hours, st.byType['Maladie'].days, st.byType['Formation'].days, st.byType['Événement Familial'].days]); });
  const monthly = [['Nom', ...S.period.months.map(m => `${m.short} ${m.year}`), 'Total']];
  users.forEach(u => { const st = St.statsOf(u); monthly.push([u.name, ...st.months, st.total]); });
  const detail = [['Date', 'Jour', 'Semaine', 'Nom', 'Matricule', 'Heures', 'Type', 'Compté travaillé', 'Note']];
  users.forEach(u => { const d = St.daysOf(u.username); C.rangeKeys(S.period.startKey, S.period.endKey).forEach(k => { const e = d[k]; if (!e || (!C.hoursOf(e) && !C.TYPES[e.type])) return;
    detail.push([k, C.DAYS[C.dow(k)], C.isoWeek(k), u.name, u.matricule || '', C.hoursOf(e), C.TYPES[e.type] ? e.type : 'Travail', C.isWorked(e) ? 'oui' : 'non', e.note || '']); }); });
  const reqs = [['Collaborateur', 'Type', 'Du', 'Au', 'Quantité', 'Statut', 'Commentaire', 'Réponse direction']];
  S.requests.forEach(r => reqs.push([r.userName, r.type, r.date, r.dateEnd || r.date, r.qLabel || r.hours, C.statusLabel(r.status), r.comment || '', r.managerComment || '']));
  const al = [['Collaborateur', 'Niveau', 'Alerte', 'Détail']];
  St.teamAlerts().forEach(a => al.push([a.user.name, { critical: 'Critique', warning: 'Vigilance', info: 'Info' }[a.level], a.title, a.detail]));
  const wb = X.utils.book_new();
  [['Synthèse', synth], ['Mensuel', monthly], ['Détail journalier', detail], ['Demandes', reqs], ['Alertes', al]].forEach(([name, rows]) => {
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.min(40, Math.max(10, ...rows.slice(0, 60).map(r => String(r[i] ?? '').length + 2))) }));
    X.utils.book_append_sheet(wb, ws, name);
  });
  X.writeFile(wb, `annualisation_${S.period.label.replace('–', '-')}_${C.todayKey()}.xlsx`);
}
act('rp-xlsx', async (_, el) => {
  try { await busy(el, exportXlsx); toast('Fichier Excel généré', 'success'); }
  catch (e) { console.error(e); toast('Export impossible (bibliothèque Excel inaccessible).', 'error'); }
});
act('rp-csv', () => {
  const i = C.currentMonthIndex(S.period), m = S.period.months[i];
  const lines = [['Matricule', 'Nom', 'Mois', 'Heures travaillees', 'Jours CP', 'Jours CP anciennete', 'Heures recuperation', 'Jours maladie', 'Jours formation', 'Jours evenement familial'].join(';')];
  St.team().forEach(u => {
    const d = St.daysOf(u.username), abs = C.absencesIn(d, m.startKey, m.endKey), w = C.sumWorked(d, m.startKey, m.endKey);
    const rec = C.rangeKeys(m.startKey, m.endKey).reduce((s, k) => s + (d[k]?.absType === 'Récupération' ? (parseFloat(d[k].recupDeducted) || 0) : 0), 0);
    const fr = n => String(C.r2(n)).replace('.', ',');
    lines.push([u.matricule || '', u.name, `${m.name} ${m.year}`, fr(u.isCadre ? w.total / 2 : w.total), abs['CP']?.days || 0, abs['CP Ancienneté']?.days || 0, fr(rec), abs['Maladie']?.days || 0, abs['Formation']?.days || 0, abs['Événement Familial']?.days || 0].join(';'));
  });
  download(`paie_${m.year}-${C.pad(m.month + 1)}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast(`CSV de ${m.name.toLowerCase()} téléchargé`, 'success');
});

/* ─── Vérification vs feuille d'heures ─── */
function weeksList() {
  const out = [];
  for (let k = C.mondayOf(S.period.startKey); k <= S.period.endKey; k = C.addDays(k, 7)) {
    const from = k < S.period.startKey ? S.period.startKey : k, to = C.addDays(k, 6) > S.period.endKey ? S.period.endKey : C.addDays(k, 6);
    out.push({ id: k, n: C.isoWeek(k), from, to });
  }
  return out;
}
function check() {
  const users = St.team(), wk = weeksList();
  if (!R.user || !St.userOf(R.user)) R.user = users[0]?.username || '';
  const cur = wk.find(w => C.todayKey() >= w.from && C.todayKey() <= w.to) || wk[0];
  if (!R.w1) { R.w1 = cur.id; R.w2 = cur.id; }
  if (!R.from) { const m = S.period.months[C.currentMonthIndex(S.period)]; R.from = m.startKey; R.to = m.endKey; }
  const from = R.mode === 'weeks' ? wk.find(w => w.id === R.w1)?.from : R.from;
  const to = R.mode === 'weeks' ? wk.find(w => w.id === R.w2)?.to : R.to;
  const opt = w => `<option value="${w.id}">S${w.n} — du ${C.disp(w.from)} au ${C.disp(w.to)}</option>`;
  const form = `<div class="card card-pad" style="margin-bottom:16px"><div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="field"><label>Collaborateur</label><select class="input" id="vfUser">${users.map(u => `<option value="${u.username}" ${u.username === R.user ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Type de période</label><select class="input" id="vfMode"><option value="dates" ${R.mode === 'dates' ? 'selected' : ''}>Par dates</option><option value="weeks" ${R.mode === 'weeks' ? 'selected' : ''}>Par numéro de semaine</option></select></div>
      ${R.mode === 'weeks'
        ? `<div class="field"><label>Semaine de début</label><select class="input" id="vfW1">${wk.map(opt).join('').replace(`value="${R.w1}"`, `value="${R.w1}" selected`)}</select></div>
           <div class="field"><label>Semaine de fin</label><select class="input" id="vfW2">${wk.filter(w => w.id >= R.w1).map(opt).join('').replace(`value="${R.w2}"`, `value="${R.w2}" selected`)}</select></div>`
        : `<div class="field"><label>Du</label><input class="input" type="date" id="vfFrom" min="${S.period.startKey}" max="${S.period.endKey}" value="${R.from}"></div>
           <div class="field"><label>Au</label><input class="input" type="date" id="vfTo" min="${S.period.startKey}" max="${S.period.endKey}" value="${R.to}"></div>`}
    </div></div>`;
  const user = St.userOf(R.user);
  if (!user || !from || !to || from > to) return form + `<div class="card">${empty('search', 'Choisissez une période valide', '')}</div>`;
  const days = St.daysOf(R.user), conv = v => user.isCadre ? v / 2 : v, unit = user.isCadre ? 'j' : 'h';
  const per = C.sumWorked(days, from, to), cum = C.sumWorked(days, S.period.startKey, to), year = C.sumWorked(days, S.period.startKey, S.period.endKey);
  const target = C.effectiveTarget(user, S.period), rest = target - conv(cum.total);
  const pct = target > 0 ? Math.min(100, Math.round(conv(cum.total) / target * 100)) : 0;
  const abs = C.absencesIn(days, from, to);
  const rows = C.rangeKeys(from, to).map(k => {
    const e = days[k]; if (!e) return '';
    const h = C.hoursOf(e), t = C.TYPES[e.type];
    if (!h && !t) return '';
    return `<tr><td>${C.disp(k)}</td><td>${C.cap(C.DAYS[C.dow(k)])}</td><td class="num">S${C.isoWeek(k)}</td><td class="num"><b>${C.num(h)}</b></td>
      <td>${t ? `<span class="badge t-${t.cls}">${esc(t.label)}</span>${C.isWorked(e) ? '' : ' <span class="muted">non compté</span>'}` : '—'}</td><td class="soft">${esc(e.note || '')}</td></tr>`;
  }).join('');
  return form + `
  <div class="grid g4" style="margin-bottom:16px">
    ${kpi({ label: 'Réalisé sur la période', value: `${C.num(conv(per.total))}<small> ${unit}</small>`, sub: `${per.days} jour${per.days > 1 ? 's' : ''} travaillé${per.days > 1 ? 's' : ''} · du ${C.disp(from)} au ${C.disp(to)}`, ic: 'clock', tone: 'teal' })}
    ${kpi({ label: `Cumul depuis le ${C.disp(S.period.startKey)}`, value: `${C.num(conv(cum.total))}<small> ${unit}</small>`, sub: `jusqu’au ${C.disp(to)}`, ic: 'chart', tone: 'info' })}
    ${kpi({ label: rest < 0 ? 'Avance / récupération' : 'Restant à faire sur l’exercice', value: `${rest < 0 ? '+' : ''}${C.num(Math.abs(rest))}<small> ${unit}</small>`, sub: `objectif ${C.num(target)} ${unit}`, ic: rest < 0 ? 'trendUp' : 'hourglass', tone: rest < 0 ? 'ok' : 'brand' })}
    ${kpi({ label: 'Progression', value: pct + ' %', sub: `total planifié sur l’exercice : ${C.num(conv(year.total))} ${unit}`, ic: 'check', tone: 'ok' })}
  </div>
  ${Object.keys(abs).length ? `<div class="card card-pad row wrap" style="margin-bottom:16px;gap:8px"><b>Absences sur la période :</b>${Object.entries(abs).map(([t, v]) => `<span class="badge t-${C.TYPES[t].cls}">${esc(C.TYPES[t].label)} · ${v.days} j</span>`).join('')}</div>` : ''}
  <div class="card"><div class="card-head"><h3>Détail jour par jour — ${esc(user.name)}</h3><button class="btn btn-ghost btn-sm right" data-act="rp-print-range">${icon('print', 15)} Imprimer</button></div>
    <div class="table-wrap" style="margin-top:10px"><table class="tbl compact"><thead><tr><th>Date</th><th>Jour</th><th class="num">Sem.</th><th class="num">Heures</th><th>Type</th><th>Commentaire</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="muted" style="padding:20px;text-align:center">Aucune journée saisie sur cette période.</td></tr>`}</tbody>
      <tfoot><tr><td colspan="3"><b>Total période</b></td><td class="num"><b>${C.num(conv(per.total))} ${unit}</b></td><td colspan="2"></td></tr></tfoot></table></div></div>`;
}
act('rp-print-range', () => {
  const wk = weeksList();
  const from = R.mode === 'weeks' ? wk.find(w => w.id === R.w1)?.from : R.from, to = R.mode === 'weeks' ? wk.find(w => w.id === R.w2)?.to : R.to;
  printPlanning([St.userOf(R.user)], from, to);
});

/* ─── Impression ─── */
function ppRange() {
  const t = C.todayKey();
  if (R.ppPeriod === 'next15') { const s = C.dow(t) === 1 ? t : C.addDays(C.mondayOf(t), 7); return [s, C.addDays(s, 13)]; }
  if (R.ppPeriod === 'past15') { const e = C.addDays(C.mondayOf(t), -1); return [C.addDays(e, -13), e]; }
  if (R.ppPeriod === 'month') { const m = S.period.months[C.currentMonthIndex(S.period)]; return [m.startKey, m.endKey]; }
  if (R.ppPeriod === 'nextmonth') { const m = S.period.months[Math.min(11, C.currentMonthIndex(S.period) + 1)]; return [m.startKey, m.endKey]; }
  return [R.ppFrom || t, R.ppTo || t];
}
function printTab() {
  const [from, to] = ppRange();
  const users = R.ppUser === 'all' ? St.team() : St.team().filter(u => u.username === R.ppUser);
  const valid = from <= to;
  return `<div class="card card-pad" style="margin-bottom:16px"><div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      <div class="field"><label>Collaborateur</label><select class="input" id="ppUser"><option value="all">Toute l’équipe</option>${St.team().map(u => `<option value="${u.username}" ${u.username === R.ppUser ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Période</label><select class="input" id="ppPeriod">${[['next15', '2 prochaines semaines'], ['past15', '2 dernières semaines'], ['month', 'Mois en cours'], ['nextmonth', 'Mois prochain'], ['custom', 'Personnalisée…']]
        .map(([v, l]) => `<option value="${v}" ${R.ppPeriod === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${R.ppPeriod === 'custom' ? `<div class="field"><label>Du</label><input class="input" type="date" id="ppFrom" value="${R.ppFrom}"></div><div class="field"><label>Au</label><input class="input" type="date" id="ppTo" value="${R.ppTo}"></div>` : '<span></span><span></span>'}
    </div>
    <div class="row wrap" style="margin-top:14px"><span class="soft">${valid ? `Du <b>${C.disp(from)}</b> au <b>${C.disp(to)}</b> · ${users.length} feuille${users.length > 1 ? 's' : ''} (une page par collaborateur, avec zones de signature)` : 'Dates invalides'}</span>
      <button class="btn btn-primary right" data-act="rp-print" ${valid ? '' : 'disabled'}>${icon('print', 16)} Imprimer / enregistrer en PDF</button></div></div>
  ${valid && users[0] ? `<div class="card card-pad"><div class="lbl" style="margin-bottom:10px">Aperçu — ${esc(users[0].name)}</div><div class="pp-preview">${sheetHtml(users[0], from, to)}</div></div>` : ''}
  ${notice('soft', 'info', 'L’impression utilise la boîte de dialogue du navigateur : choisissez « Enregistrer au format PDF » pour obtenir un fichier.')}`;
}
function sheetHtml(u, from, to) {
  const days = St.daysOf(u.username);
  let tot = 0;
  const rows = C.rangeKeys(from, to).map(k => {
    const e = days[k] || {}, t = C.TYPES[e.type], h = C.hoursOf(e);
    if (C.isWorked(e)) tot += h;
    return `<tr class="${C.dow(k) === 0 ? 'sun' : ''} ${e.modifiedByUser ? 'mod' : ''}"><td class="l">${C.DAYS_SHORT[C.dow(k)]} ${+k.slice(8)} ${C.MONTHS_SHORT[+k.slice(5, 7) - 1]}</td><td>S${C.isoWeek(k)}</td>
      <td><b>${t && !t.worked ? t.short : C.num(h) + (u.isCadre ? ' dj' : ' h')}</b></td><td>${t ? esc(t.label) : h > 0 ? 'Travail' : 'Repos'}</td><td class="l">${esc(e.note || '')}</td></tr>`;
  }).join('');
  const parts = (u.name || '').trim().split(' ');
  return `<div class="pp"><h2>Planning de travail</h2><div class="sub">${esc(S.store.storeName || '')} · du ${C.disp(from)} au ${C.disp(to)}</div>
    <div class="id"><div><b>Nom :</b> ${esc(parts.slice(1).join(' ') || '')}</div><div><b>Prénom :</b> ${esc(parts[0] || '')}</div><div><b>Matricule :</b> ${esc(u.matricule || '—')}</div></div>
    <table class="tbl compact"><thead><tr><th class="l">Jour</th><th>Sem.</th><th>Heures</th><th>Type</th><th class="l">Note</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td class="l" colspan="2"><b>Total travaillé</b></td><td><b>${C.num(u.isCadre ? tot / 2 : tot)} ${u.isCadre ? 'j' : 'h'}</b></td><td colspan="2"></td></tr></tfoot></table>
    <div class="sig"><div>Signature de la direction<br><br>Date : __ / __ / ____</div><div>Signature du collaborateur<br><br>Date : __ / __ / ____</div></div></div>`;
}
// Imprime une feuille par collaborateur (utilisé aussi depuis le planning individuel)
export function printPlanning(users, from, to) {
  users = users.filter(Boolean);
  if (!users.length || !from || !to || from > to) return toast('Période invalide.', 'error');
  document.getElementById('printSheets')?.remove();
  const box = document.createElement('div');
  box.id = 'printSheets'; box.className = 'sheet-print';
  box.innerHTML = users.map(u => sheetHtml(u, from, to)).join('');
  $('#view').appendChild(box);
  setTimeout(() => window.print(), 80);
}
act('rp-print', () => { const [from, to] = ppRange(); printPlanning(R.ppUser === 'all' ? St.team() : [St.userOf(R.ppUser)], from, to); });
act('rp-tab', arg => { R.tab = arg; nav.rerender(); });
