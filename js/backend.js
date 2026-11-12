/* ═══════════════════════════════════════════════════════════════
   BACKEND — Firestore (production) ou base de démonstration
   ═══════════════════════════════════════════════════════════════ */
import { FIREBASE_CONFIG, CDN, EJS_PUBLIC_KEY, EJS_SERVICE } from './config.js';

export let db = null;
export let F = null;          // F.ts() : horodatage serveur · F.del() : suppression de champ · F.path(a, b) : chemin de champ sans découpage sur les points
export let isDemo = false;

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.dataset.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error('Chargement impossible : ' + src)); };
    document.head.appendChild(s);
  });
}

export async function initBackend() {
  const p = new URLSearchParams(location.search);
  const demoParam = p.get('demo');
  if (demoParam !== null) sessionStorage.setItem('annualisation-demo', '1');
  isDemo = sessionStorage.getItem('annualisation-demo') === '1';
  if (isDemo) {
    const m = await import('./demo.js');
    db = m.createDemoDb(demoParam === 'reset');
    F = m.F;
    return;
  }
  await loadScript(CDN.firebaseApp);
  await loadScript(CDN.firebaseFirestore);
  const fb = window.firebase;
  if (!fb.apps.length) fb.initializeApp(FIREBASE_CONFIG);
  db = fb.firestore();
  F = { ts: () => fb.firestore.FieldValue.serverTimestamp(), del: () => fb.firestore.FieldValue.delete(), path: (...seg) => new fb.firestore.FieldPath(...seg) };
}

export function leaveDemo() {
  sessionStorage.removeItem('annualisation-demo');
  sessionStorage.removeItem('annualisation-demo-db-v3');
}

/* ─── E-mails (EmailJS) — jamais bloquant ─── */
let mailReady = null;
export const sentMails = [];   // journal local (visible en démo / tests)
export async function sendMail(template, params) {
  sentMails.push({ template, params, at: Date.now() });
  if (isDemo) return;
  try {
    if (!mailReady) mailReady = loadScript(CDN.emailjs).then(() => window.emailjs.init(EJS_PUBLIC_KEY));
    await mailReady;
    await window.emailjs.send(EJS_SERVICE, template, params);
  } catch (e) { console.warn('EmailJS :', e); }
}
