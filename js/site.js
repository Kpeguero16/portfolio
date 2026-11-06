// Khalil Peguero's portfolio. Plain JS, no build step.
// data/prs.js sets window.PRS (every merged Swarms PR). js/vendor/matter.min.js is the physics.
(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const mqFlow = matchMedia('(max-width: 820px), (max-height: 560px)'); // same query as the CSS
let FLOW = mqFlow.matches; // phones and short screens: no pinned zoom
// don't let a slow font file hold the whole hero back
const fontsReady = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]);
const PRS = window.PRS || [];
const M = window.Matter;

/* ── numbers that come from the data ───────────────── */
const counts = { total: PRS.length, code: PRS.filter(p => p.kind === 'code').length, docs: PRS.filter(p => p.kind === 'docs').length };
if (PRS.length) $$('[data-stat]').forEach(el => { el.textContent = counts[el.dataset.stat]; });

/* ── sound (off until asked for) ───────────────────── */
let actx = null, soundOn = false, lastSound = 0;
const soundBtn = $('#sound');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn; soundBtn.setAttribute('aria-pressed', String(soundOn));
  if (soundOn && !actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (soundOn) blip(660, .08, 'sine');
});
function blip(freq, vol = .08, type = 'triangle', dur = .09) {
  if (!soundOn || !actx) return;
  const now = actx.currentTime; if (now - lastSound < .03) return; lastSound = now;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, now); o.frequency.exponentialRampToValueAtTime(freq * .7, now + dur);
  g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(.0001, now + dur);
  o.connect(g).connect(actx.destination); o.start(now); o.stop(now + dur + .02);
}
$$('[data-tick]').forEach(a => a.addEventListener('pointerenter', () => blip(1400, .025, 'sine', .04)));

/* ── the replay a PR's block shows: illustrative steps, real numbers ── */
const slug = s => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36).replace(/-$/, '');
const cmd = t => `<span class="ps">$</span> <span class="cmd">${t}</span>`;
function scriptFor(p) {
  const tag = `<span class="dim">[${esc(p.type)}][${esc(p.sym)}]</span>`;
  const edit = `<span class="dim">  edit · +${p.a} −${p.r}</span>`;
  if (p.kind === 'docs') return [
    [cmd(`git switch -c docs/${slug(p.sym || p.desc)}`)], [edit], [`${cmd('gh pr create')} ${tag}`], [`<span class="drop">✓ merged docs #${p.n}</span>`, p]];
  const first = esc((p.sym || 'tests').split(/[ ,.]/)[0]);
  const q = [[cmd(`git switch -c ${esc(p.type.toLowerCase())}/${slug(p.sym || p.desc)}`)]];
  if (p.type === 'FIX' || p.type === 'FEAT') q.push([`${cmd(`pytest -q -k ${first}`)}  <span class="bad">1 failed</span>`], [edit], [`${cmd(`pytest -q -k ${first}`)}  <span class="ok">1 passed</span>`]);
  else q.push([`${cmd(`rg -w ${first} swarms tests`)}  <span class="dim">no other callers</span>`], [edit], [`${cmd('pytest -q')}  <span class="ok">passed</span>`]);
  q.push([`${cmd('gh pr create')} ${tag}`], [`<span class="drop">✓ merged #${p.n}</span>`, p]);
  return q;
}

/* ── tooltip ───────────────────────────────────────── */
const tip = $('#tip');
function showTip(p, e) {
  tip.innerHTML = `<span class="title">${p.kind === 'docs' ? 'docs ' : ''}#${p.n} · ${esc(p.desc)}</span>` +
    scriptFor(p).map(([h]) => `<div>${h}</div>`).join('') + '<div class="dim">replay · steps are illustrative</div>';
  tip.classList.add('show'); moveTip(e);
}
function moveTip(e) {
  const x = Math.min(innerWidth - tip.offsetWidth - 12, e.clientX + 14), y = e.clientY - tip.offsetHeight - 14;
  tip.style.left = `${Math.max(8, x)}px`; tip.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => tip.classList.remove('show');

/* ── blocks: one per merged PR, in matter.js physics ── */
const pin = $('#pin'), world = $('#world');
const ordered = PRS.slice().reverse();                    // oldest first
const pool = FLOW ? ordered.slice(-14) : ordered;        // phones get the newest 14
const termCount = FLOW ? 3 : 4, fetchCount = FLOW ? 3 : 10;
const rainList = pool.slice(0, Math.max(0, pool.length - termCount - fetchCount));
const termList = pool.slice(rainList.length, rainList.length + termCount);
const fetchList = pool.slice(rainList.length + termCount);
const onFloor = $('#onFloor');
const prUrl = p => p.url || `https://github.com/kyegomez/swarms/pull/${p.n}`;
let engine = null, W = 0, H = 0, walls = [], drag = null;
const blocks = [];
const partial = pool.length < PRS.length; // phones get only the newest blocks
if (partial) { // say "the newest 14" so it doesn't read as a second total under the hero's count
  const total = $('.readout .count b:last-child');
  total.previousSibling.textContent = ' of the newest ';
  total.textContent = pool.length;
  total.nextSibling.textContent = ' merged PRs';
}

function sizeFor(p) {
  const s = FLOW ? .8 : 1;
  return { w: Math.round(clamp(66 + Math.log2(1 + p.a + p.r) * 11, 74, 150) * s), h: Math.round(40 * s) };
}
function makeBlock(p, x, y, vy = 0, fresh = false) {
  if (!M || blocks.some(b => b.p === p)) return null;
  const { w, h } = sizeFor(p);
  const el = document.createElement('div');
  el.className = `blk t-${p.kind === 'docs' ? 'DOCS' : p.type}${fresh ? ' fresh' : ''}`;
  el.style.width = `${w}px`; el.style.height = `${h}px`;
  el.innerHTML = `<span class="bn">#${p.n}</span><span class="bt">${p.kind === 'docs' ? 'docs' : esc(p.type.toLowerCase())}</span>`;
  el.setAttribute('role', 'link'); el.tabIndex = 0;
  el.setAttribute('aria-label', `${p.kind === 'docs' ? 'Docs PR' : 'PR'} ${p.n}: ${p.desc}`);
  world.appendChild(el);
  const body = M.Bodies.rectangle(x, y, w, h, { chamfer: { radius: 9 }, restitution: .28, friction: .5, frictionAir: .012, density: .0016 });
  M.Body.setAngle(body, (Math.random() - .5) * .6);
  M.Body.setVelocity(body, { x: (Math.random() - .5) * 2, y: vy });
  const b = { el, p, w, h, body };
  body.plugin.block = b;
  M.Composite.add(engine.world, body);
  el.addEventListener('pointerenter', e => { if (fine && !drag) showTip(p, e); });
  el.addEventListener('pointermove', e => { if (fine && tip.classList.contains('show')) moveTip(e); });
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('keydown', e => { if (e.key === 'Enter') open(prUrl(p), '_blank', 'noopener'); });
  blocks.push(b);
  onFloor.textContent = blocks.length;
  return b;
}
function buildWalls() {
  W = pin.clientWidth; H = pin.clientHeight;
  if (!M) return;
  walls.forEach(w => M.Composite.remove(engine.world, w));
  const t = 200;
  walls = [
    M.Bodies.rectangle(W / 2, H + t / 2, W * 3, t, { isStatic: true, friction: .8 }),
    M.Bodies.rectangle(-t / 2, H / 2, t, H * 4, { isStatic: true }),
    M.Bodies.rectangle(W + t / 2, H / 2, t, H * 4, { isStatic: true }),
  ];
  M.Composite.add(engine.world, walls);
  for (const b of blocks) {
    const { x, y } = b.body.position, nx = clamp(x, b.w / 2 + 4, W - b.w / 2 - 4), ny = Math.min(y, H - b.h / 2 - 4);
    if (nx !== x || ny !== y) { M.Body.setPosition(b.body, { x: nx, y: ny }); M.Body.setVelocity(b.body, { x: 0, y: 0 }); }
  }
}
const local = e => { const r = pin.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
if (M) {
  engine = M.Engine.create({ gravity: { y: 1.05 } });
  M.Events.on(engine, 'collisionStart', ev => {
    if (!soundOn) return;
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB, v = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      const blk = a.plugin.block || b.plugin.block;
      if (v < 2.2 || !blk) continue;
      blip(260 + (160 - blk.w) * 3 + Math.random() * 30, Math.min(.12, v * .016)); break;
    }
  });
  world.addEventListener('pointerdown', e => {
    const el = e.target.closest('.blk'); if (!el) return;
    const b = blocks.find(k => k.el === el); if (!b) return;
    const pt = local(e);
    const c = M.Constraint.create({ pointA: pt, bodyB: b.body, pointB: { x: pt.x - b.body.position.x, y: pt.y - b.body.position.y }, stiffness: .18, damping: .08, length: 0 });
    M.Composite.add(engine.world, c);
    drag = { c, b, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    el.setPointerCapture(e.pointerId); hideTip(); e.preventDefault(); e.stopPropagation();
    blip(520, .05, 'sine', .05);
  });
  addEventListener('pointermove', e => {
    if (!drag) return;
    drag.c.pointA = local(e);
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
  });
  const endDrag = () => {
    if (!drag) return;
    M.Composite.remove(engine.world, drag.c);
    if (!drag.moved && performance.now() - drag.t < 350) open(prUrl(drag.b.p), '_blank', 'noopener');
    drag = null;
  };
  addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);
}
function startRain() {
  rainList.forEach((p, i) => setTimeout(() => {
    const { w } = sizeFor(p);
    makeBlock(p, w / 2 + 20 + Math.random() * (W * .97 - w), -60 - Math.random() * 120, 2);
  }, reduce ? 0 : i * 70));
  setTimeout(termStep, reduce ? 0 : 1200);
}
let physicsOn = true, lastT = performance.now();
function physicsFrame(now) {
  const dt = Math.min(1000 / 60, now - lastT); lastT = now;
  if (M && physicsOn) {
    M.Engine.update(engine, dt);
    for (const b of blocks) {
      const { x, y } = b.body.position;
      if (y > H + 300) { M.Body.setPosition(b.body, { x: W * .5, y: -80 }); M.Body.setVelocity(b.body, { x: 0, y: 0 }); }
      b.el.style.transform = `translate(${(x - b.w / 2).toFixed(1)}px, ${(y - b.h / 2).toFixed(1)}px) rotate(${b.body.angle.toFixed(4)}rad)`;
    }
  }
  requestAnimationFrame(physicsFrame);
}
requestAnimationFrame(physicsFrame);

/* ── status line and the rising terminal: replay recent merges ── */
const term = $('#term'), ticker = $('#ticker'), tickerLine = $('#tickerLine');
let termIdx = 0, lineQ = [];
function addLine(html) {
  term.insertAdjacentHTML('beforeend', `<div>${html}</div>`);
  while (term.children.length > 14) term.firstElementChild.remove();
}
function termStep() {
  if (!lineQ.length) {
    const list = termList.length ? termList : ordered.slice(-4);
    if (!list.length) return;
    if (termIdx >= list.length) { termIdx = 0; addLine('<span class="dim">replay</span>'); }
    lineQ = scriptFor(list[termIdx++]);
  }
  const [html, drop] = lineQ.shift();
  addLine(html); tickerLine.innerHTML = html;
  if (drop && !blocks.some(b => b.p === drop)) {
    const tr = ticker.getBoundingClientRect(), pr = pin.getBoundingClientRect();
    makeBlock(drop, tr.left - pr.left + tr.width * (.2 + Math.random() * .6), tr.bottom - pr.top + 26, -3, true);
    blip(880, .07, 'sine', .12);
  }
  setTimeout(termStep, drop ? 1600 : 520 + Math.random() * 380);
}

/* ── the swarm: forms the name, lets go, fetches PRs on click ── */
const sky = $('#sky'), sx = sky.getContext('2d');
const NA = FLOW ? 360 : 820, KEEP = FLOW ? 110 : 250; // all form the name; KEEP stay afterwards
const X = new Float32Array(NA), Y = new Float32Array(NA), VX = new Float32Array(NA), VY = new Float32Array(NA);
const HX = new Float32Array(NA), HY = new Float32Array(NA), TX = new Float32Array(NA), TY = new Float32Array(NA);
const HAS = new Uint8Array(NA), TASK = new Int16Array(NA).fill(-1), ARR = new Uint8Array(NA), SEED = new Float32Array(NA), COL = new Uint8Array(NA);
const palette = ['rgba(255,90,31,.8)', 'rgba(47,107,255,.8)', 'rgba(23,160,93,.8)', 'rgba(122,92,255,.8)', 'rgba(23,21,15,.55)'];
let SW = 0, SH = 0, phase = reduce ? 'free' : 'form', t0 = performance.now(), relAt = 0, rained = false, fetchIdx = 0;
const pointer = { x: -1e4, y: -1e4, on: false };
const tasks = [], rings = [];

function sizeSky() {
  SW = pin.clientWidth; SH = pin.clientHeight; const d = Math.min(2, devicePixelRatio || 1);
  sky.width = SW * d; sky.height = SH * d; sx.setTransform(d, 0, 0, d, 0, 0);
}
function seedSwarm() {
  for (let i = 0; i < NA; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.max(SW, SH) * (.55 + Math.random() * .4);
    X[i] = SW * .5 + Math.cos(a) * d; Y[i] = SH * .4 + Math.sin(a) * d;
    SEED[i] = Math.random(); COL[i] = Math.floor(Math.random() * palette.length);
    HX[i] = Math.random() * SW; HY[i] = Math.random() * SH;
  }
}
function nameTargets() {
  const h1 = $('h1.name'), pr = pin.getBoundingClientRect(), r = h1.getBoundingClientRect();
  const off = document.createElement('canvas'); off.width = Math.ceil(SW); off.height = Math.ceil(SH);
  const o = off.getContext('2d'), cs = getComputedStyle(h1);
  o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  if ('letterSpacing' in o) o.letterSpacing = cs.letterSpacing;
  o.textBaseline = 'middle'; o.fillStyle = '#000';
  o.fillText(h1.textContent, r.left - pr.left, r.top - pr.top + r.height * .54);
  const data = o.getImageData(0, 0, off.width, off.height).data, pts = [], step = FLOW ? 2 : 3;
  for (let y = 0; y < off.height; y += step) for (let x = 0; x < off.width; x += step) if (data[(y * off.width + x) * 4 + 3] > 140) pts.push(x, y);
  const count = pts.length / 2;
  for (let i = 0; i < NA; i++) {
    if (!count) { HAS[i] = 0; continue; }
    const k = Math.floor((i / NA) * count + Math.random() * (count / NA)) % count;
    TX[i] = pts[k * 2]; TY[i] = pts[k * 2 + 1]; HAS[i] = 1;
  }
}
function release() {
  if (phase === 'free' && rained) return;
  if (phase !== 'free') {
    phase = 'free'; relAt = performance.now();
    for (let i = 0; i < NA; i++) { const a = Math.random() * Math.PI * 2, k = 1 + Math.random() * 2.5; VX[i] += Math.cos(a) * k; VY[i] += Math.sin(a) * k; }
  }
  pin.classList.add('ready');
  if (!rained) { rained = true; startRain(); }
}
const field = (x, y, t) => Math.sin(x * .0021 + t * .2) * 2 + Math.cos(y * .0029 - t * .17) * 1.7 + Math.sin((x - y) * .0011 + t * .09) * 1.3;
function spawnTask(x, y) {
  if (tasks.filter(t => !t.done).length >= 4) return;
  const k = tasks.length, need = Math.round(Math.min(60, KEEP / 4));
  const free = []; for (let i = 0; i < KEEP; i++) if (TASK[i] < 0) free.push(i);
  free.sort((a, b) => ((X[a] - x) ** 2 + (Y[a] - y) ** 2) - ((X[b] - x) ** 2 + (Y[b] - y) ** 2));
  const crew = free.slice(0, need);
  crew.forEach(i => { TASK[i] = k; ARR[i] = 0; });
  tasks.push({ x, y, need: crew.length, got: 0, born: performance.now(), done: false, crew });
  blip(440, .05, 'sine', .08);
}
function finishTask(T, k) {
  T.done = true;
  const ring = { x: T.x, y: T.y, born: performance.now(), label: '' };
  rings.push(ring);
  T.crew.forEach(i => { if (TASK[i] !== k) return; TASK[i] = -1; const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3; VX[i] = Math.cos(a) * s; VY[i] = Math.sin(a) * s; });
  const p = fetchList[fetchIdx];
  if (p) { fetchIdx++; makeBlock(p, T.x, T.y, -4, true); ring.label = `#${p.n}`; blip(880, .08, 'sine', .14); }
  else ring.label = partial ? `that's the newest ${pool.length}` : `that's all ${pool.length}, for now`;
}
let skyOn = true, lastS = performance.now();
function skyFrame(now) {
  if (!skyOn) return;
  const dt = Math.min(2, (now - lastS) / 16.67); lastS = now;
  const t = (now - t0) / 1000;
  if (phase === 'form' && t > 2.4) phase = 'hold';
  if (phase === 'hold' && t > 3.4) release();
  sx.clearRect(0, 0, SW, SH);
  const free = phase === 'free', R = Math.min(220, SW * .2), R2 = R * R, kForm = phase === 'form' ? .004 + clamp(t / 2.1) * .05 : .07;
  const fade = free ? clamp((now - relAt) / 1400) : 0;
  const groups = palette.map(() => []), taskers = [], leaving = [];
  for (let i = 0; i < NA; i++) {
    if (free && i >= KEEP && fade >= 1) continue;
    let vx = VX[i], vy = VY[i];
    if (!free && HAS[i]) {
      const damp = phase === 'hold' ? .6 : .78;
      vx = (vx + (TX[i] - X[i]) * kForm) * damp; vy = (vy + (TY[i] - Y[i]) * kForm) * damp;
    } else if (TASK[i] >= 0) {
      const T = tasks[TASK[i]], dx = T.x - X[i], dy = T.y - Y[i], d = Math.hypot(dx, dy) + .01;
      if (d < 26) { if (!ARR[i]) { ARR[i] = 1; T.got++; } vx += -dy / d * .8 + dx / d * .25; vy += dx / d * .8 + dy / d * .25; }
      else { vx += dx / d * .55; vy += dy / d * .55; }
      vx *= .92; vy *= .92;
    } else {
      const a = field(X[i], Y[i], t) + SEED[i] * .6;
      vx += Math.cos(a) * .045 + (HX[i] - X[i]) * .00035; vy += Math.sin(a) * .045 + (HY[i] - Y[i]) * .00035;
      if (pointer.on) {
        const dx = pointer.x - X[i], dy = pointer.y - Y[i], d2 = dx * dx + dy * dy;
        if (d2 < R2) { const d = Math.sqrt(d2) + .01, f = 1 - d / R, pull = d < 30 ? -1 : .26; vx += dx / d * f * pull - dy / d * f * .5; vy += dy / d * f * pull + dx / d * f * .5; }
      }
      vx *= .955; vy *= .955;
      const sp = Math.hypot(vx, vy);
      if (sp > 3.2) { vx *= 3.2 / sp; vy *= 3.2 / sp; } else if (sp < .4) { vx *= .4 / (sp + .001); vy *= .4 / (sp + .001); }
    }
    X[i] += vx * dt; Y[i] += vy * dt; VX[i] = vx; VY[i] = vy;
    if (free) {
      if (X[i] < -20) X[i] += SW + 40; else if (X[i] > SW + 20) X[i] -= SW + 40;
      if (Y[i] < -20) Y[i] += SH + 40; else if (Y[i] > SH + 20) Y[i] -= SH + 40;
    }
    (TASK[i] >= 0 ? taskers : (free && i >= KEEP) ? leaving : groups[COL[i]]).push(i);
  }
  sx.lineCap = 'round'; sx.lineWidth = free ? 1.3 : 2.4;
  const tail = free ? 3.2 : 1.2;
  const stroke = (list, style, alpha, len) => {
    if (!list.length) return;
    sx.strokeStyle = style; sx.globalAlpha = alpha; sx.beginPath();
    for (const i of list) { sx.moveTo(X[i] - VX[i] * len, Y[i] - VY[i] * len); sx.lineTo(X[i] + .01, Y[i]); }
    sx.stroke();
  };
  groups.forEach((g, c) => stroke(g, palette[c], free ? .3 : 1, tail));
  stroke(leaving, palette[4], .45 * (1 - fade), tail);
  stroke(taskers, '#ff5a1f', 1, 3);
  sx.globalAlpha = 1;
  tasks.forEach((T, k) => {
    if (T.done) return;
    const age = (now - T.born) / 1000, prog = T.got / Math.max(1, T.need);
    if (prog >= .8 || age > 3.2) { finishTask(T, k); return; }
    sx.strokeStyle = '#ff5a1f'; sx.globalAlpha = .25; sx.lineWidth = 1;
    sx.beginPath(); sx.arc(T.x, T.y, 30 + Math.sin(age * 6) * 2, 0, Math.PI * 2); sx.stroke();
    sx.globalAlpha = 1; sx.lineWidth = 2.2;
    sx.beginPath(); sx.arc(T.x, T.y, 30, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); sx.stroke();
  });
  for (let r = rings.length - 1; r >= 0; r--) {
    const g = rings[r], a = (now - g.born) / 1000;
    if (a > 1) { rings.splice(r, 1); continue; }
    sx.globalAlpha = 1 - a; sx.strokeStyle = '#ff5a1f'; sx.lineWidth = 2 * (1 - a) + .5;
    sx.beginPath(); sx.arc(g.x, g.y, 30 + a * 90, 0, Math.PI * 2); sx.stroke();
    if (g.label) { sx.fillStyle = '#17150f'; sx.font = '500 12px "IBM Plex Mono", monospace'; sx.textAlign = 'center'; sx.fillText(g.label, g.x, g.y - 40 - a * 26); }
    sx.globalAlpha = 1;
  }
  if (!reduce) requestAnimationFrame(skyFrame);
}
pin.addEventListener('pointermove', e => { const q = local(e); pointer.x = q.x; pointer.y = q.y; pointer.on = true; }, { passive: true });
pin.addEventListener('pointerleave', () => { pointer.on = false; });
pin.addEventListener('pointerdown', e => {
  if (e.target.closest('a,button,.blk')) return;
  if (phase !== 'free') { release(); return; }
  const q = local(e), k = tasks.length;
  spawnTask(q.x, q.y);
  if (reduce && tasks[k]) { finishTask(tasks[k], k); requestAnimationFrame(skyFrame); } // no swarm animation: fetch at once
});
addEventListener('keydown', () => release(), { once: true });
if (!fine) $('#howTo').innerHTML = '<kbd>drag</kbd> to throw · <kbd>tap</kbd> to open · tap empty space for another';

/* ── scroll: the terminal window rises and fills the screen, then experience slides over it ── */
const rise = $('#rise'), nav = $('#nav'), exp = $('#experience');
let geo = null;
function measureRise() {
  if (FLOW) { geo = null; rise.style.transform = ''; return; }
  const prev = rise.style.transform; rise.style.transform = 'none';
  const pr = pin.getBoundingClientRect(), r = rise.getBoundingClientRect();
  rise.style.transform = prev;
  rise.style.transformOrigin = '50% 50%';
  geo = { cx: r.left - pr.left + r.width / 2, cy: r.top - pr.top + r.height / 2, w: r.width, h: r.height };
}
function render() {
  const vh = innerHeight, y = scrollY;
  if (FLOW) {
    pin.style.setProperty('--p', '0'); world.classList.remove('off');
    const on = y < vh; physicsOn = on;
    const was = skyOn; skyOn = on; if (skyOn && !was) { lastS = performance.now(); requestAnimationFrame(skyFrame); }
  } else {
    const p = clamp(y / (vh * 1.1));
    const z = reduce ? (y > vh * .5 ? 1 : 0) : ease(clamp(y / vh));
    if (geo) {
      const vw = pin.clientWidth, ph = pin.clientHeight, S = (vw / geo.w) * 1.02, cy = Math.max(ph / 2, geo.h * S / 2);
      rise.style.transform = `translate(${(vw / 2 - geo.cx) * z}px, ${(cy - geo.cy) * z}px) scale(${1 + (S - 1) * z})`;
    }
    pin.style.setProperty('--p', p.toFixed(4));
    const gone = p > .18; if (gone !== world.classList.contains('off')) { world.classList.toggle('off', gone); if (gone) hideTip(); }
    physicsOn = y < vh * .35;
    const was = skyOn; skyOn = y < vh * .35; if (skyOn && !was) { lastS = performance.now(); requestAnimationFrame(skyFrame); }
  }
  if (y > 10 && phase !== 'free') release();
  nav.classList.toggle('solid', exp.getBoundingClientRect().top < 70);
  requestAnimationFrame(render);
}
function onResize() { FLOW = mqFlow.matches; sizeSky(); measureRise(); buildWalls(); layoutDesk(); }
let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(onResize, 150); });
fontsReady.then(() => {
  sizeSky(); seedSwarm(); measureRise(); buildWalls();
  if (!reduce) nameTargets(); else release();
  t0 = performance.now(); lastS = t0;
  requestAnimationFrame(skyFrame); requestAnimationFrame(render);
});

/* ── experience timeline ───────────────────────────── */
const tl = $('#tl');
$('#tlLatest').innerHTML = PRS.filter(p => p.kind === 'code').slice(0, 3)
  .map(p => `<a href="${prUrl(p)}" target="_blank" rel="noopener"><code>#${p.n}</code><span class="what">${esc(p.desc)}</span></a>`).join('');
if (reduce) tl.classList.add('go');
else new IntersectionObserver(([en], ob) => { if (en.isIntersecting) { tl.classList.add('go'); ob.disconnect(); } }, { threshold: .1 }).observe(tl);

/* ── pop-in ────────────────────────────────────────── */
const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: .12 });
$$('.pop').forEach((el, i) => { el.style.transitionDelay = `${(i % 3) * 70}ms`; io.observe(el); });

/* ── projects: windows on a desktop ────────────────── */
const desk = $('#desk'), wins = $$('.win', desk), dockBtns = $$('.dock button', desk);
let zTop = 50; // above the starting stack
const narrow = () => mqFlow.matches;
function layoutDesk() {
  if (narrow()) { // the phone layout has no dock, so nothing may stay closed
    desk.style.height = '';
    wins.forEach(w => { w.classList.remove('closed'); w.inert = false; });
    syncDock(); return;
  }
  const dw = desk.clientWidth, ww = clamp(dw * .31, 300, 390);
  wins.forEach(w => { w.style.width = `${ww}px`; });
  // three windows across the top, two below them; the second row clears the first row's links
  const row1 = [[.02, 40], [.345, 92], [.67, 28]], row2 = [.16, .53];
  let bottom1 = 0;
  wins.slice(0, 3).forEach((w, i) => {
    if (!w.dataset.moved) { w.style.left = `${row1[i][0] * dw}px`; w.style.top = `${row1[i][1]}px`; w.style.zIndex = 10 + i; }
    bottom1 = Math.max(bottom1, row1[i][1] + w.offsetHeight);
  });
  wins.slice(3).forEach((w, i) => {
    if (!w.dataset.moved) { w.style.left = `${row2[i] * dw}px`; w.style.top = `${bottom1 - 16 + i * 30}px`; w.style.zIndex = 13 + i; }
  });
  desk.style.height = `${Math.max(...wins.map(w => w.offsetTop + w.offsetHeight)) + 90}px`;
}
const syncDock = () => dockBtns.forEach((b, i) => b.classList.toggle('open', !wins[i].classList.contains('closed')));
const focusWin = w => { w.style.zIndex = ++zTop; };
layoutDesk(); addEventListener('resize', layoutDesk);
fontsReady.then(layoutDesk);
wins.forEach(w => {
  w.addEventListener('pointerdown', () => focusWin(w));
  const bar = $('.win-bar', w);
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || narrow()) return;
    const sx0 = e.clientX, sy0 = e.clientY, l = w.offsetLeft, t = w.offsetTop;
    bar.setPointerCapture(e.pointerId); w.classList.add('dragging'); w.dataset.moved = '1'; blip(520, .04, 'sine', .05);
    const mv = ev => {
      w.style.left = `${clamp(l + ev.clientX - sx0, -w.offsetWidth * .5, desk.clientWidth - w.offsetWidth * .5)}px`;
      w.style.top = `${clamp(t + ev.clientY - sy0, 0, desk.clientHeight - 70)}px`;
    };
    const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); w.classList.remove('dragging'); blip(330, .05, 'triangle', .07); };
    bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
  });
  $('.win-close', w).addEventListener('click', e => { e.stopPropagation(); w.classList.add('closed'); w.inert = true; syncDock(); blip(300, .05, 'sine', .08); });
});
dockBtns.forEach((b, i) => b.addEventListener('click', () => {
  const w = wins[i]; w.classList.remove('closed'); w.inert = false; focusWin(w);
  w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); syncDock(); blip(700, .06, 'sine', .08);
}));

/* ── how i work: a PR token runs past the five stations ── */
const stations = $$('.station'), runner = $('#runner'), track = $('#track');
let runT = 0, lastHit = -1, runOn = false;
new IntersectionObserver(([en]) => { runOn = en.isIntersecting; }).observe(track);
(function run() {
  if (runOn && !reduce && !FLOW) {
    runT = (runT + 1 / 420) % 1;
    const rw = runner.offsetWidth, x = ease(clamp(runT / .85)) * (track.clientWidth - rw);
    runner.style.transform = `translateX(${x}px)`;
    const idx = Math.floor((x + rw / 2) / (track.clientWidth / 5));
    if (runT > .97) { stations.forEach(s => s.classList.remove('hit')); lastHit = -1; }
    else if (idx !== lastHit && idx < 5) { lastHit = idx; stations[idx].classList.add('hit'); blip(600 + idx * 120, .05, 'sine', .08); }
  }
  requestAnimationFrame(run);
})();

/* ── say hello: letters hop when you touch them ────── */
const say = $('#say');
say.setAttribute('aria-label', say.textContent);
say.innerHTML = [...say.textContent].map(ch => ch === ' ' ? ' ' : `<span aria-hidden="true">${ch}</span>`).join('');
$$('#say span').forEach((s, i) => s.addEventListener('pointerenter', () => {
  s.classList.add('up'); blip(500 + i * 60, .05, 'sine', .07);
  setTimeout(() => s.classList.remove('up'), 160);
}));

/* ── project window demos: small illustrative loops ── */
const C = { ink: '#17150f', ink2: '#5b564a', line: '#ddd5c3', orange: '#ff5a1f', blue: '#2f6bff', green: '#17a05d', violet: '#7a5cff', card: '#fffdf8', paper: '#f3efe6', yellow: '#ffc933' };
const MONO = '"IBM Plex Mono", monospace';
function demo(cv) {
  const kind = cv.dataset.demo, c = cv.getContext('2d');
  let w = 0, h = 0, on = false, t = 0;
  const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = w * d; cv.height = h * d; c.setTransform(d, 0, 0, d, 0, 0); };
  size(); new ResizeObserver(() => { size(); if (reduce && on) draw(); }).observe(cv);
  const label = s => { c.fillStyle = C.ink2; c.font = `500 10.5px ${MONO}`; c.textAlign = 'left'; c.fillText(s, 10, 17); };
  const candles = []; let v = 50;
  const pushCandle = () => { const o = v; v += (Math.random() - .47) * 4; candles.push({ o, c: v, hi: Math.max(o, v) + Math.random() * 2, lo: Math.min(o, v) - Math.random() * 2 }); };
  for (let i = 0; i < 40; i++) pushCandle();
  const minutes = ['Fundraiser → Friday', 'Dues due the 15th', 'Alumni mixer, 7pm', 'Ana books venue'];
  const outs = [['event', 'Friday'], ['task', 'dues, 15th'], ['event', 'mixer 7pm'], ['task', 'venue']];
  function draw() {
    if (!on) return; t = reduce ? 180 : t + 1;
    c.clearRect(0, 0, w, h); c.textAlign = 'left';
    if (kind === 'flow') {
      label('trade flow · illustrative');
      const steps = ['quote', 'sign', 'verify', 'co-sign', 'submit'], n = steps.length, y = h * .56;
      const x = i => w * (.1 + .8 * i / (n - 1)), k = (t / 70) % (n + 1.5);
      c.strokeStyle = C.line; c.lineWidth = 2; c.beginPath(); c.moveTo(x(0), y); c.lineTo(x(n - 1), y); c.stroke();
      steps.forEach((s, i) => {
        const lit = k >= i; c.fillStyle = lit ? C.orange : C.card; c.strokeStyle = lit ? C.orange : C.line;
        c.beginPath(); c.arc(x(i), y, 9, 0, Math.PI * 2); c.fill(); c.stroke();
        c.fillStyle = lit ? C.ink : C.ink2; c.font = `500 10.5px ${MONO}`; c.textAlign = 'center'; c.fillText(s, x(i), y + 28);
      });
      if (k > n) { c.fillStyle = C.green; c.font = `500 12px ${MONO}`; c.textAlign = 'center'; c.fillText('✓ submitted once', w / 2, h * .28); }
    } else if (kind === 'candles') {
      label('backtest · illustrative');
      if (t % 14 === 0) { pushCandle(); candles.shift(); }
      const lo = Math.min(...candles.map(k => k.lo)) - 2, hi = Math.max(...candles.map(k => k.hi)) + 2;
      const Y = val => h - 12 - ((val - lo) / (hi - lo)) * (h - 40), cw = w / candles.length;
      candles.forEach((k, i) => {
        const up = k.c >= k.o, cx = i * cw + cw / 2; c.strokeStyle = c.fillStyle = up ? C.green : C.orange; c.lineWidth = 1;
        c.beginPath(); c.moveTo(cx, Y(k.hi)); c.lineTo(cx, Y(k.lo)); c.stroke();
        c.fillRect(cx - cw * .3, Math.min(Y(k.o), Y(k.c)), cw * .6, Math.max(1, Math.abs(Y(k.o) - Y(k.c))));
      });
    } else if (kind === 'minutes') {
      label('minutes → calendar · illustrative');
      const shown = Math.floor(t / 45) % (minutes.length + 3), lh = (h - 34) / minutes.length;
      minutes.forEach((m, i) => {
        if (i >= shown) return;
        const y = 36 + i * lh;
        c.fillStyle = C.ink2; c.font = `10.5px ${MONO}`; c.fillText(m, 10, y + 6);
        const [type, txt] = outs[i], bx = w * .56, bw = w * .41;
        c.fillStyle = type === 'event' ? 'rgba(47,107,255,.12)' : 'rgba(23,160,93,.12)';
        c.fillRect(bx, y - 8, bw, 20);
        c.fillStyle = type === 'event' ? C.blue : C.green; c.font = `500 10px ${MONO}`; c.fillText(`${type} · ${txt}`, bx + 6, y + 6);
      });
    } else if (kind === 'tree') {
      label('decision path · illustrative');
      const levels = [1, 2, 4, 6];
      const pos = levels.map((n, l) => Array.from({ length: n }, (_, k) => ({ x: w * (k + 1) / (n + 1), y: h * (.2 + l * .23) })));
      const step = Math.floor(t / 36) % (levels.length + 2);
      const path = [0]; for (let l = 1; l < levels.length; l++) path.push(Math.min(levels[l] - 1, path[l - 1] * 2 + ((Math.floor(t / 216) + l) % 2)));
      for (let l = 1; l < levels.length; l++) pos[l].forEach((n, k) => {
        const pk = Math.min(pos[l - 1].length - 1, Math.floor(k / 2)), par = pos[l - 1][pk], lit = path[l] === k && path[l - 1] === pk && step >= l;
        c.strokeStyle = lit ? C.violet : C.line; c.lineWidth = lit ? 2.5 : 1.5;
        c.beginPath(); c.moveTo(par.x, par.y); c.bezierCurveTo(par.x, (par.y + n.y) / 2, n.x, (par.y + n.y) / 2, n.x, n.y); c.stroke();
      });
      pos.forEach((lv, l) => lv.forEach((n, k) => {
        const lit = path[l] === k && step >= l;
        c.fillStyle = lit ? C.violet : C.card; c.strokeStyle = lit ? C.violet : C.line; c.lineWidth = 2;
        c.beginPath(); c.arc(n.x, n.y, lit ? 6.5 : 5, 0, Math.PI * 2); c.fill(); c.stroke();
      }));
    } else if (kind === 'days') {
      const cols = 27, rows = 14, gap = 2, cell = Math.min((w - 20) / cols, (h - 34) / rows) - gap;
      const filled = Math.floor(t * 1.4) % 420, n = Math.min(365, filled);
      label(`day ${Math.max(1, n)} of 365 · illustrative`);
      const ox = (w - cols * (cell + gap)) / 2;
      for (let i = 0; i < 365; i++) {
        const cx = ox + (i % cols) * (cell + gap), cy = 28 + Math.floor(i / cols) * (cell + gap);
        c.fillStyle = i < n ? (i === n - 1 ? C.orange : 'rgba(255,201,51,.85)') : C.paper;
        c.fillRect(cx, cy, cell, cell);
      }
    }
    if (!reduce) requestAnimationFrame(draw);
  }
  new IntersectionObserver(([en]) => { const was = on; on = en.isIntersecting; if (on && !was) requestAnimationFrame(draw); }).observe(cv);
}
$$('[data-demo]').forEach(demo);

/* ── compose: opens the visitor's mail app ─────────── */
const compose = $('#compose'), toast = $('#toast');
compose.addEventListener('submit', e => {
  e.preventDefault();
  const f = new FormData(compose);
  location.href = `mailto:${f.get('to')}?subject=${encodeURIComponent(f.get('subject'))}&body=${encodeURIComponent(f.get('body'))}`;
});
$('#copyAddr').addEventListener('click', () => {
  const v = compose.elements.to.value;
  const done = msg => { toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1500); };
  (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => done('Copied!'), () => done(v));
});
window.__siteReady = true; // tells the fallback in index.html the page set itself up
})();
