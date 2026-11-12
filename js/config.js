/* ═══════════════════════════════════════════════════════════════
   CONFIGURATION — identifiants des services (inchangés)
   ═══════════════════════════════════════════════════════════════ */
export const APP_VERSION = '3.0.0';

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBoYVF3gxpnvIkZIi007BQmXdJiOZ3tGT0",
  authDomain: "suivi-annualisation.firebaseapp.com",
  projectId: "suivi-annualisation",
  storageBucket: "suivi-annualisation.firebasestorage.app",
  messagingSenderId: "673966090927",
  appId: "1:673966090927:web:2c2aae68fe847a9e60c25a"
};

export const EJS_SERVICE    = "service_zyoc9bj";
export const EJS_TPL_REQ    = "template_qhe6l14";
export const EJS_TPL_RESP   = "template_q9b7vac";
export const EJS_PUBLIC_KEY = "HrKWUniM8t71ICAlu";
export const MANAGER_EMAIL  = "remi.schaffhauser@but.fr";
export const APP_URL        = "https://suivi-annualisation.pages.dev";

// Bibliothèques externes (chargées à la demande)
export const CDN = {
  firebaseApp:       "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js",
  firebaseFirestore: "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js",
  emailjs:           "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js",
  xlsx:              "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
};

// Valeurs par défaut du magasin (modifiables dans Paramètres › Général)
export const STORE_DEFAULTS = {
  storeName: 'Magasin 17',
  minStaff: { lundi: 3, mardi: 3, mercredi: 3, jeudi: 3, vendredi: 3, samedi: 4, dimanche: 0 },
  vanMinHours: 48,
  cpMode: 'ouvrables'   // 'ouvrables' : lundi → samedi (règle historique) · 'planning' : jours habituellement travaillés
};
