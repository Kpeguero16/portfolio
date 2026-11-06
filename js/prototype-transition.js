// PROTOTYPE(transition): throwaway. Compares hero-to-experience transitions on the real page.
//   A  the current one: the hero pins, the terminal zooms to fill the screen, experience slides over it
//   B  floor gives way: no pin; the first scroll drops the PR blocks down across experience and off the screen
//   C  no transition: the hero is one screen and experience starts under it, like the phone layout
// Serve the repo (python3 -m http.server 8765) and open http://127.0.0.1:8765/?variant=B, or flip with the
// bar at the bottom or the ← → keys. It does nothing off localhost, so a stray merge can't change the live site.
// Delete this file, css/prototype-transition.css and the PROTOTYPE(transition) lines once a variant wins.
(() => {
  const local = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!local) return;
  const VARIANTS = { A: 'current · terminal zoom', B: 'floor gives way', C: 'no transition' };
  const keys = Object.keys(VARIANTS);
  const asked = new URLSearchParams(location.search).get('variant');
  const cur = keys.includes(asked) ? asked : 'A';
  document.documentElement.dataset.variant = cur;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // every switch starts at the hero
  const go = step => {
    const u = new URL(location.href);
    u.searchParams.set('variant', keys[(keys.indexOf(cur) + step + keys.length) % keys.length]); u.hash = '';
    location.replace(u);
  };
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.className = 'proto-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Prototype variant');
    bar.innerHTML = `<button type="button" aria-label="Previous variant">←</button><span><b>${cur}</b> · ${VARIANTS[cur]}</span><button type="button" aria-label="Next variant">→</button>`;
    const [prev, next] = bar.querySelectorAll('button');
    prev.addEventListener('click', () => go(-1)); next.addEventListener('click', () => go(1));
    document.body.appendChild(bar);
    console.info(`[prototype] transition variant ${cur}: ${VARIANTS[cur]}`);
  });
  addEventListener('keydown', e => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable], [role="tab"]')) return;
    go(e.key === 'ArrowLeft' ? -1 : 1);
  });
})();
