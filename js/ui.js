/* ═══════════════════════════════════════════════════════════════
   UI — icônes, notifications, modales, délégation d'événements
   ═══════════════════════════════════════════════════════════════ */
import { TYPES, STATUS, num } from './core.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ─── Icônes (tracé 24 px) ─── */
const I = {
  home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1a6 6 0 0112 0v1"/><path d="M16.5 5.6a3.2 3.2 0 010 5.8"/><path d="M18 20v-1a6 6 0 00-2-4.4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0114 0v1"/>',
  inbox: '<path d="M3 13l2.6-7.2A2 2 0 017.5 4.5h9a2 2 0 011.9 1.3L21 13v5a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  leave: '<path d="M4 20V9a2 2 0 012-2h12a2 2 0 012 2v11"/><path d="M9 7V4h6v3"/><path d="M4 14h16"/>',
  van: '<path d="M2 7h11v9H2z"/><path d="M13 10h4.5l3.5 3.5V16h-8z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  megaphone: '<path d="M4 10v4a1 1 0 001 1h2l5 4V5L7 9H5a1 1 0 00-1 1z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.8 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 14.1H3a2 2 0 110-4h.1A1.7 1.7 0 004.3 7.2l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 3.1V3a2 2 0 114 0v.1a1.7 1.7 0 002.8 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9 1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H19v3H6.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.4 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 0010.5 10.5z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.3A4 4 0 0112 8a4 4 0 017 2.7C19 15.6 12 20 12 20z"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
  dots: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', down: '<path d="M5 9l7 7 7-7"/>',
  bell: '<path d="M18 15V10a6 6 0 10-12 0v5l-2 3h16z"/><path d="M10 21h4"/>',
  refresh: '<path d="M20 11a8 8 0 10-1.5 5.7"/><path d="M20 5v6h-6"/>',
  logout: '<path d="M14 8V5H5v14h9v-3"/><path d="M10 12h10M17 8.5l3.5 3.5L17 15.5"/>',
  archive: '<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M5 8.5V20h14V8.5"/><path d="M10 13h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
  send: '<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.8 18-3.7-7.5L3 9.8z"/>',
  flag: '<path d="M5 21V4h13l-2.5 4L18 12H5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 017.5-2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  print: '<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="9" rx="2"/><path d="M7 14h10v6H7z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z"/><path d="M9 12l2.2 2.2L15 10.5"/>',
  database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  history: '<path d="M4 12a8 8 0 108-8 8 8 0 00-6.3 3"/><path d="M4 4v4h4M12 8v4.5l3 1.8"/>',
  trendUp: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  scale: '<path d="M12 4v16M6 20h12M5 8h14"/><path d="M5 8l-2.5 6a2.7 2.7 0 005 0zM19 8l-2.5 6a2.7 2.7 0 005 0z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 010 12"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
  pause: '<path d="M9 5v14M15 5v14"/>'
};
export const icon = (name, size = 18, sw = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || I.info}</svg>`;

/* ─── Petits rendus réutilisables ─── */
const AV = ['#F26B1D', '#3B6FE0', '#0E9F6E', '#7C5CE0', '#D6478F', '#0C9AA6', '#D98A06', '#5B6680', '#C2410C', '#4F46E5'];
export function avatar(u, cls = '') {
  const name = (u?.name || '?').trim();
  const parts = name.split(/\s+/).filter(p => /^\p{L}/u.test(p));
  const ini = ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="avatar ${cls}" style="background:${AV[h % AV.length]}" title="${esc(name)}">${esc(ini)}</span>`;
}
export const typeBadge = t => `<span class="badge t-${TYPES[t]?.cls || 'aut'}">${icon(TYPES[t]?.icon || 'leave', 13, 2.2)}${esc(TYPES[t]?.label || t)}</span>`;
export const statusBadge = s => `<span class="badge b-${STATUS[s]?.cls || 'muted'}">${esc(STATUS[s]?.label || s)}</span>`;
export const empty = (ic, title, text = '') => `<div class="empty"><div class="ic-b">${icon(ic, 24, 1.8)}</div><h4>${esc(title)}</h4>${text ? `<p>${text}</p>` : ''}</div>`;
export const notice = (kind, ic, html) => `<div class="notice ${kind}">${icon(ic, 17, 2.1)}<div>${html}</div></div>`;
export const kpi = ({ label, value, sub = '', ic = 'info', tone = 'muted', act = '', arg = '' }) =>
  `<${act ? `button data-act="${act}" data-arg="${esc(arg)}"` : 'div'} class="card kpi">
     <div class="k"><span class="ic-b tone-${tone}">${icon(ic, 16, 2.1)}</span>${esc(label)}</div>
     <div class="v tnum">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}
   </${act ? 'button' : 'div'}>`;
export function ring(pct, size = 116, color = 'var(--brand-2)', label = 'de l’objectif', track = 'rgba(255,255,255,.14)') {
  const r = size / 2 - 8, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${track}" stroke-width="9" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c - c * p / 100}"/>
  </svg><div class="c"><div class="p">${pct}%</div><div class="l">${label}</div></div></div>`;
}
export const fmtTs = (t, withTime = true) => t?.seconds
  ? new Date(t.seconds * 1000).toLocaleString('fr-FR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }) : '—';
export const hrs = (n, unit = 'h') => `${num(n)} ${unit}`;

/* ─── Notifications ─── */
export function toast(msg, kind = 'info') {
  const k = { success: 'ok', error: 'err', warning: 'warn' }[kind] || kind;
  const box = $('#toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + k;
  t.setAttribute('role', 'status');
  t.innerHTML = icon({ ok: 'check', err: 'x', warn: 'alert', info: 'info' }[k] || 'info', 18, 2.4) + `<span>${esc(msg)}</span>`;
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, k === 'err' ? 5200 : 3200);
}

/* ─── Modales ─── */
const stack = [];
export function modal({ title, body, foot = '', size = '', drawer = false, iconName = '', onClose = null }) {
  const ov = document.createElement('div');
  ov.className = 'overlay' + (drawer ? ' drawer' : '');
  ov.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head">${iconName ? `<span class="ic-b tone-brand">${icon(iconName, 17, 2.1)}</span>` : ''}<h3>${title}</h3>
      <button class="btn btn-soft btn-icon btn-sm" data-close aria-label="Fermer">${icon('x', 16, 2.4)}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : '<div style="height:16px"></div>'}</div>`;
  const api = {
    el: ov,
    close(result) { ov.remove(); const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); if (!stack.length) document.body.style.overflow = ''; onClose && onClose(result); },
    set(html) { $('.modal-body', ov).innerHTML = html; }
  };
  ov.addEventListener('mousedown', e => { if (e.target === ov) api.close(); });
  ov.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close(); });
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  stack.push(api);
  const first = $('[autofocus]', ov) || $('.modal-body input, .modal-body select, .modal-body textarea', ov);
  if (first && !matchMedia('(max-width:860px)').matches) setTimeout(() => first.focus(), 40);
  return api;
}
export const closeTopModal = () => { const m = stack[stack.length - 1]; if (m) { m.close(); return true; } return false; };
export const closeAllModals = () => { while (stack.length) stack[stack.length - 1].close(); };

/* Confirmation. input : { label, placeholder, required, type, value, textarea }
   Renvoie false si annulé, true (ou la saisie) si confirmé. */
export function confirmDialog({ title, text = '', ok = 'Confirmer', danger = false, input = null, iconName = '' }) {
  return new Promise(resolve => {
    let done = false;
    const field = input ? `<div class="field" style="margin-top:14px"><label>${esc(input.label || '')}</label>${input.textarea
      ? `<textarea class="input" rows="3" id="cfIn" placeholder="${esc(input.placeholder || '')}">${esc(input.value || '')}</textarea>`
      : `<input class="input" id="cfIn" type="${input.type || 'text'}" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}" autocomplete="off">`}</div>` : '';
    const m = modal({
      title, iconName: iconName || (danger ? 'alert' : 'info'),
      body: `<div class="soft" style="font-size:14px;line-height:1.6">${text}</div>${field}`,
      foot: `<button class="btn btn-ghost" data-close>Annuler</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cfOk">${esc(ok)}</button>`,
      onClose: () => { if (!done) resolve(false); }
    });
    const submit = () => {
      const v = input ? $('#cfIn', m.el).value.trim() : true;
      if (input?.required && !v) { toast(input.requiredMsg || 'Ce champ est obligatoire.', 'error'); $('#cfIn', m.el).focus(); return; }
      done = true; m.close(); resolve(input ? (v || true) : true);
    };
    $('#cfOk', m.el).addEventListener('click', submit);
    m.el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); } });
  });
}

/* ─── Délégation d'événements ───
   <button data-act="nom" data-arg="…">  →  act('nom', (arg, el, event) => …)
   data-on="change|input" déclenche l'action sur l'événement correspondant. */
const actions = {};
export const act = (name, fn) => { actions[name] = fn; };
function dispatch(e, type) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const want = el.dataset.on || 'click';
  if (want !== type) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (type === 'click' && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') e.preventDefault();
  Promise.resolve().then(() => fn(el.dataset.arg, el, e)).catch(err => { console.error(err); toast(err.message || 'Une erreur est survenue.', 'error'); });
}
['click', 'change', 'input'].forEach(t => document.addEventListener(t, e => dispatch(e, t)));

// Bouton occupé pendant une action asynchrone
export async function busy(btn, fn) {
  if (!btn) return fn();
  const html = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px"></span>';
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
}

export function download(name, content, mime = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const isMobile = () => matchMedia('(max-width:860px)').matches;
