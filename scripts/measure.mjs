// Measures the numbers a redesign must not make worse, in a real Chrome. Needs Node 22+ (built-in WebSocket).
//
//   python3 -m http.server 8765            # from the repo root, in one terminal
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 \
//     --user-data-dir="$(mktemp -d)" --hide-scrollbars about:blank   # in another
//   node scripts/measure.mjs http://127.0.0.1:8765/ [chrome debugging port, default 9333]
//
// For each size it prints when the name is first fully visible, the readout under the hero after 6 s,
// the widest sideways overflow, and any page errors. On desktop it also scrolls with real wheel events
// (window.scrollTo leaves the pinned hero's screenshots out of date) until the Experience heading is
// under the nav. Lighthouse and axe-core cover scores and contrast; see the README.
const [url, port = '9333'] = process.argv.slice(2);
if (!url) { console.error('usage: node scripts/measure.mjs <url> [port]'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(w, h) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let id = 0; const pend = new Map(), errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  for (const d of ['Network', 'Page', 'Runtime', 'Log']) await send(`${d}.enable`);
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  return { ws, send, ev, errors, close: async () => { ws.close(); await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`); } };
}

async function hero(w, h) {
  const p = await open(w, h), start = Date.now();
  await p.send('Page.navigate', { url });
  let nameMs = null, sideways = 0, readout = null;
  while (Date.now() - start < 6000) {
    const s = await p.ev(`(() => { const n = document.querySelector('h1.name'), c = document.querySelector('.readout .count');
      return { name: n ? +getComputedStyle(n).opacity : 0, side: document.documentElement.scrollWidth - innerWidth, readout: c ? c.textContent.trim() : null }; })()`);
    if (s) { if (nameMs === null && s.name >= .99) nameMs = Date.now() - start; sideways = Math.max(sideways, s.side); readout = s.readout; }
    await sleep(100);
  }
  await p.close();
  return { size: `${w}x${h}`, nameVisibleMs: nameMs, readoutAt6s: readout, sidewaysPx: sideways, errors: p.errors };
}

async function scrollToExperience(w, h) {
  const p = await open(w, h);
  await p.send('Page.navigate', { url }); await sleep(4500);
  let y = null;
  for (let i = 0; i < 400; i++) {
    if (await p.ev(`document.getElementById('exp-title').getBoundingClientRect().top`) <= 120) { y = await p.ev('scrollY'); break; }
    await p.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: w / 2, y: h / 2, deltaX: 0, deltaY: 20 }); await sleep(25);
  }
  await p.close();
  return { size: `${w}x${h}`, scrollToExperiencePx: y, screens: y === null ? null : +(y / h).toFixed(2) };
}

for (const [w, h] of [[320, 640], [390, 844], [1440, 900]]) console.log(JSON.stringify(await hero(w, h)));
for (const [w, h] of [[1440, 900], [390, 844]]) console.log(JSON.stringify(await scrollToExperience(w, h)));
process.exit(0);
