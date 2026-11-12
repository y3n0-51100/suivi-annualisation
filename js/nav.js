/* Navigation partagée entre la coquille et les écrans (évite les imports circulaires) */
export const nav = {
  current: { name: '', params: [] },
  go(path) { const h = '#/' + path; if (location.hash === h) nav.rerender(); else location.hash = h; },
  rerender() {},          // remplacé par app.js
  refreshChrome() {}      // remplacé par app.js (badges, menu)
};
