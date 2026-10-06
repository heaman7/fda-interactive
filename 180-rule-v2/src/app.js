/* =====================================================================
   180° 法則 — page logic (views, plans, sections)
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
try { document.documentElement.style.setProperty('--grain', `url(${GRAIN.toDataURL()})`); } catch (e) { /* grain is decorative */ }

/* ============================ view scheduler ============================ */
const VIEWS = new Set();
const TICKERS = new Set();
let rafPending = false;
function kick() { if (!rafPending) { rafPending = true; requestAnimationFrame(frame); } }
function frame(now) {
  rafPending = false;
  for (const f of [...TICKERS]) { let keep = false; try { keep = f(now) === true; } catch (e) { console.error(e); } if (!keep) TICKERS.delete(f); }
  for (const v of VIEWS) if (v.dirty && v.visible) { try { v.render(); } catch (e) { console.error(e); v.dirty = false; } }
  if (TICKERS.size) kick();
}
function addTicker(f) { TICKERS.add(f); kick(); }
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
const viewRO = new ResizeObserver(es => { for (const e of es) { const v = e.target.__view; if (v) v.inval(); } });
const viewIO = new IntersectionObserver(es => { for (const e of es) { const v = e.target.__view; if (!v) continue; v.visible = e.isIntersecting; if (v.visible && v.dirty) kick(); } }, { rootMargin: '300px 0px' });
class View {
  constructor(canvas, o) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); Object.assign(this, o);
    this.dirty = true; this.visible = false; canvas.__view = this;
    VIEWS.add(this); viewRO.observe(canvas); viewIO.observe(canvas);
  }
  inval() { this.dirty = true; kick(); }
  render() {
    const r = this.c.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    let w = Math.round(r.width * DPR()), h = Math.round(r.height * DPR());
    const cap = this.maxW || 1500; if (w > cap) { h = Math.round(h * cap / w); w = cap; }
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; }
    const spec = this.spec(); if (!spec) { this.dirty = false; return; }
    const pose = this.pose ? this.pose() : null;
    this.info = renderScene(this.ctx, w, h, spec, pose, spec.opts || {});
    if (this.overlay) this.overlay(this.ctx, this.info, w, h);
    this.dirty = false;
    if (this.after) this.after(this.info);
  }
}

/* ============================ shared model ============================ */
const SETUPS = {
  std: { c1: [0, 3.0], c2: [1.25, 1.25], c3: [-1.25, 1.25] },
  ots: { c1: [0, 3.0], c2: [1.75, 0.42], c3: [-1.75, 0.42] },
  x3: { c1: [0, 3.0], c2: [1.25, 1.25], c3: [-1.25, -1.25] },
  x2: { c1: [0, 3.0], c2: [1.25, -1.25], c3: [-1.25, 1.25] },
  xm: { c1: [0, -3.0], c2: [1.25, 1.25], c3: [-1.25, 1.25] },
};
const ROLE = { c1: 'master', c2: 'cuA', c3: 'cuB' };
const CAMNAME = { c1: 'Master', c2: 'CU A', c3: 'CU B' };
const SUBJ = { c1: ['A', 'B'], c2: ['A'], c3: ['B'] };
const ARW = { R: '→', L: '←', C: '◎' };
const BGN = { cool: '雨夜窗景', warm: '水吧同餐牌' };
function lensMM(vfov) { const th = Math.tan(rad(vfov) / 2) * 16 / 9; return Math.round(12.45 / th); }
function analyzeSpec(spec, pose) { return analyze(makeCam(spec.pos, spec.target, spec.vfov, 1600, 900), pose || POSE0); }
function subjOf(role) { return role === 'master' ? ['A', 'B'] : role === 'cuA' ? ['A'] : role === 'cuB' ? ['B'] : []; }
function compareShots(x, rx, y, ry) {
  if (x.side === 0 || y.side === 0) return { level: 'neutral', head: '◎ 中性鏡頭', items: ['其中一格喺軸線上面拍，冇左右方向，可以當橋樑過去另一邊'] };
  const sx = subjOf(rx), sy = subjOf(ry), bad = [], good = [];
  if (sx.length === 1 && sy.length === 1 && sx[0] !== sy[0]) {
    const a = x.chars[sx[0]], b = y.chars[sy[0]];
    if (a.inFrame && b.inFrame && a.face && b.face && a.gaze !== 'C' && b.gaze !== 'C') {
      if (a.gaze === b.gaze) bad.push(`${sx[0]} 同 ${sy[0]} 都望 ${ARW[a.gaze]}，唔似對望`);
      else good.push(`${sx[0]} 望 ${ARW[a.gaze]}、${sy[0]} 望 ${ARW[b.gaze]}，視線對得上`);
    }
  }
  for (const id of sx) {
    if (!sy.includes(id)) continue;
    const a = x.chars[id], b = y.chars[id]; if (!a.inFrame || !b.inFrame) continue;
    const pa = a.x < 0 ? '左' : '右', pb = b.x < 0 ? '左' : '右';
    if (pa !== pb) bad.push(`${id} 由畫面${pa}邊跳咗去${pb}邊`); else good.push(`${id} 一直喺畫面${pa}邊`);
    if (a.face && b.face && a.gaze !== 'C' && b.gaze !== 'C') {
      if (a.gaze !== b.gaze) bad.push(`${id} 本來望 ${ARW[a.gaze]}，下一格變咗望 ${ARW[b.gaze]}`);
      else good.push(`${id} 一直望 ${ARW[a.gaze]}`);
    }
  }
  if (x.bg !== y.bg) bad.push(`背景由${BGN[x.bg]}變咗${BGN[y.bg]}`);
  if (x.side !== y.side) return { level: 'bad', head: '✗ 越軸', items: bad.length ? bad : ['兩格喺軸線兩邊拍'] };
  return { level: 'ok', head: '✓ 接得順', items: good.length ? good : ['兩格都喺軸線同一邊'] };
}

/* ============================ overlays ============================ */
function drawArrow(ctx, x0, y0, x1, y1, col, w) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 2) return;
  const ux = dx / L, uy = dy / L, hl = Math.min(L * 0.5, w * 3.3), hw = w * 2.2;
  const bx = x1 - ux * hl, by = y1 - uy * hl;
  const tri = () => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx - uy * hw, by + ux * hw); ctx.lineTo(bx + uy * hw, by - ux * hw); ctx.closePath(); };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = w * 2.1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx, by); ctx.stroke();
  ctx.lineWidth = w * 1.1; tri(); ctx.stroke(); ctx.fill();
  ctx.strokeStyle = ctx.fillStyle = col; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx, by); ctx.stroke(); tri(); ctx.fill();
  ctx.restore();
}
function drawPill(ctx, x, y, text, bg, fg, s) {
  ctx.save();
  ctx.font = `700 ${Math.round(14 * s)}px Fredoka, "Noto Sans HK", "Noto Sans CJK HK", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 14 * s, h = 22 * s;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2) : ctx.rect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = bg; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 4 * s; ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = fg; ctx.fillText(text, x, y + 0.5 * s); ctx.restore();
}
const GAZE_COL = { A: '#FFAE2E', B: '#4F8FFF' };
const OS = W => Math.max(W / 800, 0.72 * DPR());
function ovGaze(ctx, info, ids, W) {
  const s = OS(W);
  for (const id of ids) {
    const c = info.chars[id]; if (!c || !c.inFrame || !c.face) continue;
    if (c.gaze === 'C') {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 5 * s; ctx.setLineDash([6 * s, 5 * s]);
      ctx.beginPath(); ctx.arc(c.px, c.py, c.rpx * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#8B6CFF'; ctx.lineWidth = 3 * s; ctx.stroke(); ctx.restore();
      continue;
    }
    const dir = c.gaze === 'R' ? 1 : -1;
    const L = clamp(c.rpx * 1.5, Math.max(W * 0.07, 34 * s), W * 0.16);
    const y = c.py + c.rpx * 0.02;
    const x0 = c.px + dir * c.rpx * 1.25;
    drawArrow(ctx, x0, y, x0 + dir * L, y, GAZE_COL[id], Math.max(2.5, 5 * s));
  }
}
function ovTags(ctx, info, ids, W) {
  const s = OS(W), H = info.cam.H;
  for (const id of ids) {
    const c = info.chars[id]; if (!c || !c.inFrame) continue;
    let y = c.py - c.rpx * 1.75;
    if (y < 16 * s) y = Math.min(H - 14 * s, c.py + c.rpx * 2.1);
    drawPill(ctx, c.px, y, id, id === 'A' ? '#E7A33D' : '#3868BA', id === 'A' ? '#241A08' : '#FFFFFF', s * 1.05);
  }
}

/* ============================ floor plan (SVG) ============================ */
const SVGNS = 'http://www.w3.org/2000/svg';
function E(tag, attrs, parent, text) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
const PL = { floor: '#E6DCC6', floorB: '#D6CDB5', plank: '#DAC09C', rug: '#3A5A68', rugRing: '#E9DABD', cool: '#2F5E4F', warm: '#6B432C', win: '#A9CCDD', label: '#F3EBDC', muted: '#C3CCD4', table: '#EEEAE2', tableEdge: '#BDB4A5', chair: '#4E2F1D', chairDk: '#381F11', axis: '#7B4DFF', ok: '#34C77D', bad: '#F0464B', neutral: '#8B6CFF', ink: '#14202B', counter: '#5C3925', leaf: '#4F8F5E', pot: '#C86A45', halo: '#14202B' };
const CAMCOL = { c1: '#4A5A6B', c2: '#E7A33D', c3: '#3E70C4' };
const txt = (g, x, y, s, attrs) => E('text', Object.assign({ x, y, 'font-size': 24, fill: PL.label, 'font-weight': 700, 'font-family': 'var(--font-body)', 'paint-order': 'stroke', stroke: PL.halo, 'stroke-width': 5, 'stroke-linejoin': 'round' }, attrs || {}), g, s);
const n2 = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const cr2 = (u, v) => u[0] * v[1] - u[1] * v[0];
function clipHalf(poly, a, u, s) {
  const f = p => s * cr2(u, [p[0] - a[0], p[1] - a[1]]); const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], fp = f(P), fq = f(Q);
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
function lineRect(a, u, r) {
  let t0 = -1e9, t1 = 1e9;
  for (const [p, d, lo, hi] of [[a[0], u[0], r[0], r[1]], [a[1], u[1], r[2], r[3]]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; }
    else { let ta = (lo - p) / d, tb = (hi - p) / d; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); }
  }
  return t0 > t1 ? null : [[a[0] + u[0] * t0, a[1] + u[1] * t0], [a[0] + u[0] * t1, a[1] + u[1] * t1]];
}
const P100 = p => p.map(v => (v * 100).toFixed(1)).join(',');

class Plan {
  constructor(svg, o) {
    this.svg = svg;
    this.o = Object.assign({ view: [-4.35, -3.9, 8.7, 7.8], room: true, furniture: true, arcR: 1.9, show: {}, cams: {}, textScale: 1 }, o);
    this.show = Object.assign({ zones: true, arc: true, axis: true, gaze: true, fov: true, tri: false, labels: true, camLabels: true }, this.o.show);
    const v = this.o.view; svg.setAttribute('viewBox', `${v[0] * 100} ${v[1] * 100} ${v[2] * 100} ${v[3] * 100}`);
    this.chars = this.o.chars || { A: { x: CH.A.base[0], z: 0, seated: true }, B: { x: CH.B.base[0], z: 0, seated: true } };
    this.cams = this.o.cams;
    const defs = E('defs', {}, svg);
    const pid = 'hatch' + Math.random().toString(36).slice(2, 7); this.hatchId = pid;
    const pat = E('pattern', { id: pid, width: 22, height: 22, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    E('rect', { width: 22, height: 22, fill: 'rgba(240,70,75,.13)' }, pat);
    E('line', { x1: 0, y1: 0, x2: 0, y2: 22, stroke: 'rgba(232,64,70,.38)', 'stroke-width': 4 }, pat);
    E('rect', { x: v[0] * 100, y: v[1] * 100, width: v[2] * 100, height: v[3] * 100, fill: 'transparent' }, svg);
    for (const k of ['room', 'zones', 'arc', 'fov', 'furn', 'axis', 'extra', 'tri', 'chars', 'gaze', 'cams', 'labels']) this['g_' + k] = E('g', { class: 'lay-' + k }, svg);
    if (this.o.room) this.drawRoom();
    this.camEls = {}; this.charEls = {};
    this.render();
  }
  drawRoom() {
    const g = this.svg.querySelector('.lay-room'), T = this.o.textScale;
    const defs = this.svg.querySelector('defs');
    const cid = 'chk' + Math.random().toString(36).slice(2, 7);
    const pat = E('pattern', { id: cid, width: 100, height: 100, patternUnits: 'userSpaceOnUse', x: -400, y: -350 }, defs);
    E('rect', { width: 100, height: 100, fill: PL.floor }, pat);
    E('rect', { width: 50, height: 50, fill: PL.floorB }, pat); E('rect', { x: 50, y: 50, width: 50, height: 50, fill: PL.floorB }, pat);
    E('rect', { x: -400, y: -350, width: 800, height: 700, fill: `url(#${cid})` }, g);
    if (!this.o.simple) E('circle', { cx: 0, cy: 0, r: 125, fill: 'rgba(255,200,110,.28)' }, g);
    const W = 18;
    E('rect', { x: -409, y: -350 - W, width: 818, height: W, fill: PL.cool }, g);
    E('rect', { x: -409, y: 350, width: 818, height: W, fill: PL.warm }, g);
    E('rect', { x: -400 - W, y: -368, width: W, height: 368, fill: PL.cool }, g);
    E('rect', { x: -400 - W, y: 0, width: W, height: 368, fill: PL.warm }, g);
    E('rect', { x: 400, y: -368, width: W, height: 368, fill: PL.cool }, g);
    E('rect', { x: 400, y: 0, width: W, height: 368, fill: PL.warm }, g);
    for (const [a, b] of [[-305, -75], [75, 305]]) {
      E('rect', { x: a, y: -363, width: b - a, height: 11, rx: 2, fill: PL.win }, g);
      for (let x = a + (b - a) / 3; x < b - 5; x += (b - a) / 3) E('line', { x1: x, y1: -363, x2: x, y2: -352, stroke: '#24463A', 'stroke-width': 4 }, g);
    }
    E('rect', { x: -270, y: 353, width: 100, height: 10, rx: 3, fill: '#FF72B8' }, g);
    for (const x of [-170, -140, -110, 40, 70, 100]) E('rect', { x, y: 352, width: 22, height: 12, fill: '#F0E3C5' }, g);
    E('rect', { x: 400 - 3, y: 85, width: 6, height: 110, fill: PL.floor }, g);
    E('path', { d: 'M400,85 A110,110 0 0 0 290,195', fill: 'none', stroke: '#8A5A3A', 'stroke-width': 4, 'stroke-dasharray': '8 6' }, g);
    if (this.o.simple) return;
    E('rect', { x: -190, y: 294, width: 380, height: 56, rx: 4, fill: PL.counter }, g);
    E('rect', { x: -190, y: 294, width: 380, height: 10, rx: 3, fill: '#E4D6BE' }, g);
    for (let i = 0; i < 5; i++) E('circle', { cx: -150 + i * 24, cy: 326, r: 7, fill: ['#E2574C', '#F2C14E', '#7CC29B', '#E98FB3', '#8E6A4E'][i] }, g);
    E('circle', { cx: 362, cy: 230, r: 13, fill: '#2F4F44', stroke: '#1D332B', 'stroke-width': 3 }, g);
    for (const [x, z] of [[275, 235], [-275, 245]]) {
      const s = E('g', { transform: `translate(${x} ${z})` }, g);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; E('line', { x1: 0, y1: 0, x2: Math.cos(a) * 34, y2: Math.sin(a) * 34, stroke: '#26282B', 'stroke-width': 5, 'stroke-linecap': 'round' }, s); }
      const ang = Math.atan2(-z, -x) * 180 / Math.PI;
      E('rect', { x: -12, y: -26, width: 24, height: 52, rx: 4, fill: '#FFF5D8', stroke: '#26282B', 'stroke-width': 4, transform: `rotate(${ang})` }, s);
    }
    const V = this.o.view, inV = (x, z) => x > V[0] * 100 && x < (V[0] + V[2]) * 100 && z > V[1] * 100 + 10 && z < (V[1] + V[3]) * 100 - 4;
    if (this.show.labels) {
      if (inV(0, -378)) txt(g, 0, -378, '窗（雨夜街景）', { 'text-anchor': 'middle', 'font-size': 22 * T, fill: PL.muted, stroke: 'none' });
      if (inV(0, 392)) txt(g, 0, 392, '水吧 · 餐牌', { 'text-anchor': 'middle', 'font-size': 22 * T, fill: PL.muted, stroke: 'none' });
      txt(g, 275, 300, '燈', { 'text-anchor': 'middle', 'font-size': 20 * T });
      txt(g, -275, 310, '燈', { 'text-anchor': 'middle', 'font-size': 20 * T });
    }
  }
  headOf(id) {
    const c = this.chars[id];
    if (c.seated) { const h = HEAD[id]; return [h[0], h[2]]; }
    return [c.x, c.z];
  }
  axis() {
    const a = this.headOf('A'), b = this.headOf('B');
    const u = n2([b[0] - a[0], b[1] - a[1]]);
    let ref = 1;
    const refId = this.o.refCam && this.cams[this.o.refCam] ? this.o.refCam : null;
    if (this.o.refSide) ref = this.o.refSide;
    else if (refId) { const p = this.cams[refId].pos; const d = cr2(u, [p[0] - a[0], p[1] - a[1]]); if (Math.abs(d) > 0.15) ref = Math.sign(d); else ref = this._lastRef || 1; }
    this._lastRef = ref;
    return { a, b, u, n: [-u[1], u[0]], m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ref };
  }
  sideOfPt(p, ax) { const d = cr2(ax.u, [p[0] - ax.a[0], p[1] - ax.a[1]]); return Math.abs(d) < 0.15 ? 0 : Math.sign(d); }
  specOf(id) { const c = this.cams[id]; return c.spec ? c.spec() : rig(c.role, c.pos[0], c.pos[1]); }
  toWorld(ev) {
    const pt = this.svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const q = pt.matrixTransform(this.svg.getScreenCTM().inverse()); return [q.x / 100, q.y / 100];
  }
  dragify(el, onMove) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const move = ev => onMove(this.toWorld(ev));
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); if (this.o.onDragEnd) this.o.onDragEnd(); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }
  keyify(el, get, set) {
    el.addEventListener('keydown', e => {
      const d = e.shiftKey ? 0.3 : 0.1; const p = get().slice();
      if (e.key === 'ArrowLeft') p[0] -= d; else if (e.key === 'ArrowRight') p[0] += d; else if (e.key === 'ArrowUp') p[1] -= d; else if (e.key === 'ArrowDown') p[1] += d; else return;
      e.preventDefault(); set(p);
    });
  }
  render() {
    const ax = this.axis(), V = this.o.view, T = this.o.textScale;
    const rect = this.o.room ? [-4, 4, -3.5, 3.5] : [V[0], V[0] + V[2], V[1], V[1] + V[3]];
    const poly = [[rect[0], rect[2]], [rect[1], rect[2]], [rect[1], rect[3]], [rect[0], rect[3]]];
    const nS = [ax.n[0] * ax.ref, ax.n[1] * ax.ref];
    // zones
    const gz = this.g_zones; gz.replaceChildren();
    if (this.show.zones) {
      const safe = clipHalf(poly, ax.a, ax.u, ax.ref), bad = clipHalf(poly, ax.a, ax.u, -ax.ref);
      if (safe.length > 2) E('polygon', { points: safe.map(P100).join(' '), fill: 'rgba(46,204,128,.30)' }, gz);
      if (bad.length > 2) E('polygon', { points: bad.map(P100).join(' '), fill: `url(#${this.hatchId})` }, gz);
    }
    // arc
    const ga = this.g_arc; ga.replaceChildren();
    if (this.show.arc) {
      const r = this.o.arcR, m = ax.m;
      const p1 = [m[0] + ax.u[0] * r, m[1] + ax.u[1] * r], p2 = [m[0] - ax.u[0] * r, m[1] - ax.u[1] * r];
      const cw = [-ax.u[1], ax.u[0]]; const sweep = (cw[0] * nS[0] + cw[1] * nS[1]) > 0 ? 1 : 0;
      E('path', { d: `M${P100(p1)} A${r * 100},${r * 100} 0 0 ${sweep} ${P100(p2)}`, fill: 'none', stroke: '#2FA36B', 'stroke-width': 4, 'stroke-dasharray': '10 8', class: 'arcpath' }, ga);
      const lp = [m[0] + nS[0] * (r + 0.02), m[1] + nS[1] * (r + 0.02)];
      const lg = E('g', { transform: `translate(${lp[0] * 100} ${lp[1] * 100})` }, ga);
      E('rect', { x: -38 * T, y: -17 * T, width: 76 * T, height: 34 * T, rx: 17 * T, fill: '#2FA36B' }, lg);
      E('text', { x: 0, y: 8 * T, 'text-anchor': 'middle', 'font-size': 24 * T, 'font-weight': 700, fill: '#fff', 'font-family': 'Fredoka, var(--font-body)' }, lg, '180°');
    }
    // fov
    const gf = this.g_fov; gf.replaceChildren();
    if (this.show.fov) for (const id in this.cams) {
      const c = this.cams[id]; if (c.hideFov) continue;
      const sp = this.specOf(id);
      const d = n2([sp.target[0] - sp.pos[0], sp.target[2] - sp.pos[2]]);
      const h = Math.atan(Math.tan(rad(sp.vfov) / 2) * 16 / 9);
      const L = Math.hypot(sp.target[0] - sp.pos[0], sp.target[2] - sp.pos[2]) * 1.12;
      const rot = a => [d[0] * Math.cos(a) - d[1] * Math.sin(a), d[0] * Math.sin(a) + d[1] * Math.cos(a)];
      const e1 = rot(h), e2 = rot(-h), p = c.pos;
      const col = c.col || CAMCOL[id] || '#888';
      E('polygon', { points: [p, [p[0] + e1[0] * L, p[1] + e1[1] * L], [p[0] + e2[0] * L, p[1] + e2[1] * L]].map(P100).join(' '), fill: col, 'fill-opacity': .2, stroke: col, 'stroke-opacity': .75, 'stroke-width': 2.5, 'stroke-dasharray': '7 6' }, gf);
    }
    // furniture
    const gF = this.g_furn;
    if (!this._furnDone) {
      this._furnDone = true;
      if (this.o.furniture) {
        for (const id of ['A', 'B']) {
          const ch = CH[id], b = ch.base, ang = Math.atan2(ch.F[2], ch.F[0]) * 180 / Math.PI;
          const cg = E('g', { transform: `translate(${b[0] * 100} ${b[2] * 100}) rotate(${ang})` }, gF);
          E('circle', { cx: -3, cy: 0, r: 21, fill: PL.chair }, cg);
          E('path', { d: 'M-20,-18 A20,20 0 0 0 -20,18', fill: 'none', stroke: PL.chairDk, 'stroke-width': 6, transform: 'translate(-4 0)' }, cg);
        }
        E('circle', { cx: 0, cy: 0, r: 44, fill: PL.table, stroke: PL.tableEdge, 'stroke-width': 3 }, gF);
        for (const [x, z] of [[-20, 10], [22, -8]]) { E('circle', { cx: x, cy: z, r: 7.5, fill: '#fff', stroke: '#2E7A5A', 'stroke-width': 2 }, gF); E('circle', { cx: x, cy: z, r: 4, fill: '#4E2E1E' }, gF); }
        E('rect', { x: 11, y: -30, width: 18, height: 8, rx: 2, fill: '#E3CDA6' }, gF);
      }
    }
    // axis
    const gx = this.g_axis; gx.replaceChildren();
    if (this.show.axis) {
      const seg = lineRect(ax.a, ax.u, [V[0] - 1, V[0] + V[2] + 1, V[1] - 1, V[1] + V[3] + 1]);
      if (seg) {
        const ag = E('g', { class: 'ax' }, gx);
        E('line', { x1: seg[0][0] * 100, y1: seg[0][1] * 100, x2: seg[1][0] * 100, y2: seg[1][1] * 100, stroke: '#fff', 'stroke-width': 11, 'stroke-linecap': 'round', opacity: .9 }, ag);
        E('line', { x1: seg[0][0] * 100, y1: seg[0][1] * 100, x2: seg[1][0] * 100, y2: seg[1][1] * 100, stroke: PL.axis, 'stroke-width': 6, 'stroke-dasharray': '18 10' }, ag);
      }
    }
    // extra (custom drawing)
    this.g_extra.replaceChildren();
    if (this.o.extra) this.o.extra(this.g_extra, ax, this);
    // triangle
    const gt = this.g_tri; gt.replaceChildren();
    if (this.show.tri && this.cams.c1 && this.cams.c2 && this.cams.c3) {
      const pts = ['c1', 'c2', 'c3'].map(id => this.cams[id].pos);
      const anyBad = ['c2', 'c3'].some(id => this.sideOfPt(this.cams[id].pos, ax) === -ax.ref) || this.sideOfPt(pts[0], ax) === 0;
      E('polygon', { points: pts.map(P100).join(' '), fill: 'none', stroke: anyBad ? PL.bad : '#F3EBDC', 'stroke-width': 3, 'stroke-dasharray': '4 9', 'stroke-linecap': 'round', opacity: .9 }, gt);
    }
    // characters
    for (const id of ['A', 'B']) this.drawChar(id, ax);
    // gaze
    const gg = this.g_gaze; gg.replaceChildren();
    if (this.show.gaze) {
      for (const [id, oid] of [['A', 'B'], ['B', 'A']]) {
        const h = this.headOf(id), o2 = this.headOf(oid);
        const d = n2([o2[0] - h[0], o2[1] - h[1]]), L = Math.hypot(o2[0] - h[0], o2[1] - h[1]);
        const s0 = [h[0] + d[0] * 0.2, h[1] + d[1] * 0.2], s1 = [h[0] + d[0] * Math.min(L * 0.45, 0.8), h[1] + d[1] * Math.min(L * 0.45, 0.8)];
        const col = id === 'A' ? '#FFAE2E' : '#4F8FFF';
        E('line', { x1: s0[0] * 100, y1: s0[1] * 100, x2: s1[0] * 100, y2: s1[1] * 100, stroke: col, 'stroke-width': 5, 'stroke-dasharray': '3 8', 'stroke-linecap': 'round' }, gg);
        const bx = s1[0] * 100, by = s1[1] * 100, px = -d[1], py = d[0];
        E('polygon', { points: `${bx + d[0] * 14},${by + d[1] * 14} ${bx + px * 8},${by + py * 8} ${bx - px * 8},${by - py * 8}`, fill: col }, gg);
      }
    }
    // cameras
    for (const id in this.cams) this.drawCam(id, ax);
    for (const id in this.camEls) if (!this.cams[id]) { this.camEls[id].g.remove(); delete this.camEls[id]; }
    // labels
    const gl = this.g_labels; gl.replaceChildren();
    if (this.show.labels && this.show.axis && Math.abs(ax.u[1]) < 0.3) {
      const vr = [Math.max(rect[0], V[0]) + 0.14, Math.min(rect[1], V[0] + V[2]) - 0.14, Math.max(rect[2], V[1]) + 0.3, Math.min(rect[3], V[1] + V[3]) - 0.3];
      const seg = lineRect(ax.a, ax.u, vr);
      if (seg) {
        const left = seg[0][0] <= seg[1][0] ? seg[0] : seg[1], right = seg[0][0] <= seg[1][0] ? seg[1] : seg[0];
        const offBad = [-nS[0] * 0.26, -nS[1] * 0.26], offOk = [nS[0] * 0.3, nS[1] * 0.3];
        txt(gl, (left[0] + offBad[0]) * 100, (left[1] + offBad[1]) * 100 + 8, '軸線 THE LINE', { 'font-size': 23 * T, fill: '#CDBBFF', 'text-anchor': 'start' });
        if (this.show.zones) {
          txt(gl, (right[0] + offOk[0]) * 100, (right[1] + offOk[1]) * 100 + 8, '✓ 攝影機嗰邊', { 'font-size': 23 * T, fill: '#9FF0C4', 'text-anchor': 'end' });
          txt(gl, (right[0] + offBad[0]) * 100, (right[1] + offBad[1]) * 100 + 8, '✗ 越軸區', { 'font-size': 23 * T, fill: '#FFB0B3', 'text-anchor': 'end' });
        }
      }
    }
  }
  drawChar(id, ax) {
    const st = this.chars[id], ch = CH[id], col = ch.col, T = this.o.textScale;
    let el = this.charEls[id];
    if (!el) {
      const g = E('g', { class: 'char' + (this.o.dragChars ? ' drag' : '') }, this.g_chars);
      const body = E('g', {}, g), head = E('g', {}, g);
      const arms = E('g', {}, body);
      const woman = ch.style === 'woman';
      for (const s of [-1, 1]) { E('line', { x1: 4, y1: s * 17, x2: 58, y2: s * 12, stroke: woman ? col.skin : col.top, 'stroke-width': woman ? 8 : 10, 'stroke-linecap': 'round' }, arms); if (woman) E('line', { x1: 4, y1: s * 17, x2: 16, y2: s * 16, stroke: col.top, 'stroke-width': 10, 'stroke-linecap': 'round' }, arms); E('circle', { cx: 60, cy: s * 12, r: 6, fill: col.skin }, arms); }
      E('ellipse', { cx: 0, cy: 0, rx: 13, ry: woman ? 19 : 22, fill: col.top, stroke: 'rgba(0,0,0,.3)', 'stroke-width': 2 }, body);
      if (woman) { for (const [x, y] of [[-4, -9], [5, 6], [-6, 10], [6, -12], [0, 0]]) E('circle', { cx: x, cy: y, r: 2.2, fill: col.pattern }, body); }
      else { E('path', { d: 'M13,-6 L5,0 L13,6 Z', fill: col.shirt }, body); E('line', { x1: 7, y1: 0, x2: 13, y2: 0, stroke: col.tie, 'stroke-width': 3 }, body); }
      E('circle', { cx: 0, cy: 0, r: woman ? 15 : 13, fill: col.hair }, head);
      E('path', { d: woman ? 'M5,-11.6 A13,13 0 0 1 5,11.6 Z' : 'M3,-12.6 A13,13 0 0 1 3,12.6 Z', fill: col.skin }, head);
      if (!woman) E('path', { d: 'M-8,-6 Q2,-12 9,-8', fill: 'none', stroke: col.hairHi, 'stroke-width': 2.5 }, head);
      else for (const s of [-1, 1]) E('circle', { cx: 2, cy: s * 13.5, r: 2.6, fill: col.pearl }, head);
      E('circle', { cx: 15, cy: 0, r: 3.6, fill: col.skinDk }, head);
      const lab = E('g', {}, g);
      E('circle', { cx: 0, cy: 0, r: 17 * T, fill: id === 'A' ? '#E7A33D' : '#3868BA', stroke: PL.halo, 'stroke-width': 3 }, lab);
      E('text', { x: 0, y: 7.5 * T, 'text-anchor': 'middle', 'font-size': 22 * T, 'font-weight': 700, fill: id === 'A' ? '#241A08' : '#fff', 'font-family': 'Fredoka, var(--font-body)' }, lab, id);
      if (this.o.dragChars) {
        E('circle', { cx: 0, cy: 0, r: 40, fill: 'transparent' }, g);
        g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', `角色 ${id}：拖動或者用方向鍵移動`);
        this.dragify(g, p => this.o.onChar(id, p));
        this.keyify(g, () => [this.chars[id].x, this.chars[id].z], p => this.o.onChar(id, p));
      }
      el = this.charEls[id] = { g, body, head, arms, lab };
    }
    const oh = this.headOf(id === 'A' ? 'B' : 'A');
    const pos = st.seated ? [ch.base[0], ch.base[2]] : [st.x, st.z];
    const bodyAng = st.seated ? Math.atan2(ch.F[2], ch.F[0]) : (st.face != null ? st.face : Math.atan2(oh[1] - pos[1], oh[0] - pos[0]));
    const hp = st.seated ? this.headOf(id) : pos;
    const headAng = st.headFace != null ? st.headFace : Math.atan2(oh[1] - hp[1], oh[0] - hp[0]);
    el.g.setAttribute('transform', `translate(${pos[0] * 100} ${pos[1] * 100}) scale(${this.o.charScale || 1})`);
    el.body.setAttribute('transform', `rotate(${bodyAng * 180 / Math.PI})`);
    el.arms.style.display = st.seated ? '' : 'none';
    const k = this.o.charScale || 1;
    el.head.setAttribute('transform', `translate(${(hp[0] - pos[0]) * 100 / k} ${(hp[1] - pos[1]) * 100 / k}) rotate(${headAng * 180 / Math.PI})`);
    const bo = st.seated ? 0.52 : 0.62;
    const back = [-Math.cos(bodyAng) * bo, -Math.sin(bodyAng) * bo];
    el.lab.setAttribute('transform', `translate(${back[0] * 100 / k} ${back[1] * 100 / k}) scale(${1 / k})`);
  }
  drawCam(id, ax) {
    const c = this.cams[id], T = this.o.textScale;
    let el = this.camEls[id];
    const col = c.col || CAMCOL[id] || '#777';
    if (!el) {
      const g = E('g', { class: 'cam' }, this.g_cams);
      const hit = E('circle', { r: 44, fill: 'transparent' }, g);
      const body = E('g', {}, g);
      const sc = c.small ? 0.8 : 1;
      E('rect', { x: -23 * sc, y: -16 * sc, width: 32 * sc, height: 32 * sc, rx: 8 * sc, fill: col, stroke: PL.ink, 'stroke-width': 3.5, class: 'cam-ring' }, body);
      E('path', { d: `M${9 * sc},${-9 * sc} L${27 * sc},${-17 * sc} L${27 * sc},${17 * sc} L${9 * sc},${9 * sc} Z`, fill: col, stroke: PL.ink, 'stroke-width': 3.5, 'stroke-linejoin': 'round' }, body);
      const num = E('text', { 'text-anchor': 'middle', 'font-size': 21 * sc, 'font-weight': 700, fill: id === 'c2' || c.darkText ? '#241A08' : '#fff', 'font-family': 'Fredoka, var(--font-body)', 'pointer-events': 'none' }, g, c.num || id.slice(1));
      const badge = E('g', { 'pointer-events': 'none' }, g);
      const bc = E('circle', { r: 13 * T, stroke: PL.halo, 'stroke-width': 3 }, badge);
      const bt = E('text', { y: 6 * T, 'text-anchor': 'middle', 'font-size': 18 * T, 'font-weight': 800, fill: '#fff', 'font-family': 'var(--font-body)' }, badge);
      const lab = this.show.camLabels ? txt(g, 0, 0, c.label || CAMNAME[id] || '', { 'text-anchor': 'middle', 'font-size': 20 * T, 'pointer-events': 'none' }) : null;
      if (c.draggable) {
        g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
        g.setAttribute('aria-label', `${c.label || CAMNAME[id]} 攝影機：拖動或者用方向鍵移動`);
        this.dragify(g, p => this.o.onCam(id, p));
        this.keyify(g, () => this.cams[id].pos, p => this.o.onCam(id, p));
      } else g.style.pointerEvents = 'none';
      el = this.camEls[id] = { g, body, num, badge, bc, bt, lab, hit };
    }
    const sp = this.specOf(id);
    const d = n2([sp.target[0] - sp.pos[0], sp.target[2] - sp.pos[2]]);
    const ang = Math.atan2(d[1], d[0]) * 180 / Math.PI;
    const p = c.pos;
    el.g.setAttribute('transform', `translate(${p[0] * 100} ${p[1] * 100})`);
    el.body.setAttribute('transform', `rotate(${ang})`);
    el.num.setAttribute('x', (-d[0] * 7).toFixed(1)); el.num.setAttribute('y', (-d[1] * 7 + 7.5).toFixed(1));
    let st = c.status;
    if (!st) { const s = this.sideOfPt(p, ax); st = c.isRef ? 'ref' : s === 0 ? 'neutral' : s === ax.ref ? 'ok' : 'bad'; }
    el.status = st;
    const bcol = st === 'ok' ? PL.ok : st === 'bad' ? PL.bad : st === 'neutral' ? PL.neutral : st === 'ref' ? '#F3EBDC' : null;
    el.badge.style.display = bcol ? '' : 'none';
    if (bcol) {
      el.badge.setAttribute('transform', `translate(${26 * T} ${-26 * T})`);
      el.bc.setAttribute('fill', bcol);
      el.bt.textContent = st === 'ok' ? '✓' : st === 'bad' ? '✗' : st === 'neutral' ? '◎' : '★';
      el.bt.setAttribute('fill', st === 'ref' ? '#14202B' : '#fff');
    }
    if (el.lab) { el.lab.setAttribute('x', 0); el.lab.setAttribute('y', 52 * T); }
  }
}

/* ============================ HERO ============================ */
function initHero() {
  const cv = $('#heroCanvas'); const screen = $('#heroScreen');
  const tags = { line: $('#tagLine'), ok: $('#tagOk'), bad: $('#tagBad') };
  let t0 = performance.now(), tt = 6;
  const specAt = t => {
    const s = REDUCED ? 0.5 : 0.5 + 0.5 * Math.sin(t / 5.5);
    return { pos: [lerp(-0.1, 1.25, s), 1.95, 3.25], target: [0.06, 0.74, -0.12], vfov: 41, opts: { arAxis: true, zones: true, refSide: 1, tape: false, rainT: t } };
  };
  const v = new View(cv, {
    maxW: 1400,
    spec: () => specAt(tt),
    pose: () => poseAt((tt % 24 + 24) % 24),
    after: info => {
      const cam = info.cam, W = cam.W, H = cam.H;
      const place = (el, p) => { const q = cam.proj(p); if (!q || q[0] < W * 0.06 || q[0] > W * 0.94 || q[1] < H * 0.06 || q[1] > H * 0.94) { el.style.opacity = 0; return; } el.style.opacity = 1; el.style.left = (q[0] / W * 100) + '%'; el.style.top = (q[1] / H * 100) + '%'; };
      const d = norm(sub(EYE.B, EYE.A));
      place(tags.line, add(madd(EYE.B, d, 0.8), [0, 0.26, 0]));
      place(tags.ok, [1.05, 0, 0.42]);
      place(tags.bad, [1.7, 0, -2.2]);
    },
  });
  if (!REDUCED) {
    let vis = false;
    new IntersectionObserver(es => { vis = es[0].isIntersecting; if (vis) addTicker(tick); }).observe(screen);
    let lastF = 0;
    const tick = now => { if (!vis) return false; if (now - lastF > 31) { lastF = now; tt = 6 + (now - t0) / 1000; v.inval(); } return true; };
  }
}

/* ============================ §1 axis ============================ */
function initAxisFig() {
  const svg = $('#plan1');
  const st = { A: { x: -1.1, z: 0.0, seated: false }, B: { x: 1.1, z: 0.0, seated: false } };
  const cam = { m: { role: 'master', pos: [0.2, 2.6], col: CAMCOL.c1, num: '1', label: 'Master', draggable: true, isRef: true, spec: null } };
  const specM = () => {
    const a = [st.A.x, st.A.z], b = [st.B.x, st.B.z], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const p = cam.m.pos; const T = [m[0], 1.0, m[1]]; const dd = Math.hypot(T[0] - p[0], T[2] - p[1]);
    return { pos: [p[0], 1.36, p[1]], target: T, vfov: clamp(2 * Math.atan(1.3 / dd) * 180 / Math.PI, 20, 75) };
  };
  cam.m.spec = specM;
  const read = $('#p1Read');
  const clampRoom = p => [clamp(p[0], -3.6, 3.6), clamp(p[1], -3.1, 3.1)];
  const plan = new Plan(svg, {
    furniture: false, simple: true, chars: st, cams: cam, refCam: 'm', dragChars: true, arcR: 1.55, view: [-3.5, -2.85, 7.0, 6.35], charScale: 1.45, textScale: 1.1,
    show: { tri: false },
    onChar: (id, p) => {
      p = clampRoom(p); const o = st[id === 'A' ? 'B' : 'A'];
      const d = Math.hypot(p[0] - o.x, p[1] - o.z); if (d < 0.9) { const k = 0.9 / (d || 1); p = [o.x + (p[0] - o.x) * k, o.z + (p[1] - o.z) * k]; }
      st[id].x = p[0]; st[id].z = p[1]; plan.render(); update();
    },
    onCam: (id, p) => { p = clampRoom(p); for (const c of ['A', 'B']) { const d = Math.hypot(p[0] - st[c].x, p[1] - st[c].z); if (d < 0.45) { const k = 0.45 / (d || 1); p = [st[c].x + (p[0] - st[c].x) * k, st[c].z + (p[1] - st[c].z) * k]; } } cam.m.pos = p; plan.render(); update(); },
  });
  function update() {
    const ax = plan.axis();
    const s = plan.sideOfPt(cam.m.pos, ax);
    read.textContent = s === 0 ? '攝影機企咗喺條線上：冇左右之分（中性鏡頭）。' : '綠色半邊就係你揀咗嘅 180°，之後每部機都留喺呢邊。';
  }
  update();
  $('#p1Reset').addEventListener('click', () => { st.A.x = -1.1; st.A.z = 0; st.B.x = 1.1; st.B.z = 0; cam.m.pos = [0.2, 2.6]; plan.render(); update(); });
  $('#p1Play').addEventListener('click', () => {
    svg.classList.remove('play'); void svg.getBoundingClientRect(); svg.classList.add('play');
    clearTimeout(svg._pt); svg._pt = setTimeout(() => svg.classList.remove('play'), 4600);
  });
}

/* ============================ §2 sandbox ============================ */
const SB = { pos: JSON.parse(JSON.stringify(SETUPS.std)), opts: { gaze: true, fov: true, tape: true, zones: false } };
const sbListeners = [];
function sbRef() { return sideOf([SB.pos.c1[0], 1.3, SB.pos.c1[1]]) || 1; }
function sbSpec(id) { const p = SB.pos[id]; const s = rig(ROLE[id], p[0], p[1]); s.opts = { tape: SB.opts.tape, zones: SB.opts.zones, refSide: sbRef() }; return s; }
function constrainCam(p) {
  let x = clamp(p[0], -3.75, 3.75), z = clamp(p[1], -3.2, 3.2);
  const K = [[0, 0, 0.64], [-1.0, 0, 0.5], [1.0, 0, 0.5], [-1.24, 0, 0.36], [1.24, 0, 0.36]];
  for (let it = 0; it < 4; it++) for (const [cx, cz, r] of K) {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
    if (d < r) { if (d < 1e-4) { x = cx + r; } else { x = cx + dx / d * r; z = cz + dz / d * r; } }
  }
  return [x, z];
}
function polarLerp(a, b, t) {
  const ra = Math.hypot(a[0], a[1]), rb = Math.hypot(b[0], b[1]);
  const aa = Math.atan2(a[1], a[0]), ab = Math.atan2(b[1], b[0]);
  let d = ab - aa; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  if (Math.abs(Math.abs(d) - Math.PI) < 1e-3) d = -Math.PI;
  const r = lerp(ra, rb, t), an = aa + d * t;
  return [r * Math.cos(an), r * Math.sin(an)];
}
function initSandbox() {
  const svg = $('#plan2');
  const cams = {};
  for (const id of ['c1', 'c2', 'c3']) cams[id] = { role: ROLE[id], pos: SB.pos[id], col: CAMCOL[id], label: CAMNAME[id], draggable: true, isRef: id === 'c1', spec: () => sbSpec(id) };
  const plan = new Plan(svg, {
    cams, refCam: 'c1', arcR: 1.9, view: [-3.7, -2.75, 7.4, 6.55], textScale: 1.12, show: { tri: true },
    onCam: (id, p) => { SB.pos[id] = constrainCam(p); setPresetBtn(null); changed(); },
  });
  const mons = {};
  for (const id of ['c1', 'c2', 'c3']) {
    const m = $('#m' + id.slice(1));
    mons[id] = { el: m, chip: $('[data-chip]', m), lens: $('[data-lens]', m), read: $('[data-read]', m),
      view: new View($('canvas', m), {
        spec: () => sbSpec(id),
        overlay: (ctx, info, W) => { if (SB.opts.gaze) ovGaze(ctx, info, SUBJ[id], W); },
        after: info => updateMon(id, info),
      }) };
  }
  function updateMon(id, info) {
    const M = mons[id]; const ref = sbRef();
    const st = id === 'c1' ? 'ref' : info.side === 0 ? 'neutral' : info.side === ref ? 'ok' : 'bad';
    M.chip.className = 'chip ' + st;
    M.chip.textContent = st === 'ref' ? '★ 基準' : st === 'ok' ? '✓ 同一邊' : st === 'bad' ? '✗ 越軸' : '◎ 軸線上';
    M.el.classList.toggle('bad', st === 'bad'); M.el.classList.toggle('neutral', st === 'neutral');
    M.lens.textContent = lensMM(sbSpec(id).vfov) + 'mm';
    const parts = [];
    for (const cid of SUBJ[id]) {
      const c = info.chars[cid];
      if (!c.inFrame) { parts.push(`<span>${cid} 唔喺畫面</span>`); continue; }
      const side = c.x < 0 ? '左' : '右';
      const g = !c.face ? '背住鏡頭' : c.gaze === 'C' ? '望鏡頭 ◎' : '望 ' + ARW[c.gaze];
      parts.push(`<span class="${cid === 'A' ? 'ga' : 'gb'}">${cid}</span><span>喺${side}邊・${g}</span>`);
    }
    if (st === 'bad') parts.push('<span class="warn">越咗軸</span>');
    M.read.innerHTML = parts.join('');
  }
  const verdict = $('#sbVerdict');
  function updateVerdict() {
    const ref = sbRef();
    const sides = {}; for (const id of ['c2', 'c3']) sides[id] = sideOf([SB.pos[id][0], 1.2, SB.pos[id][1]]);
    const bad = ['c2', 'c3'].filter(id => sides[id] !== 0 && sides[id] !== ref);
    const neu = ['c2', 'c3'].filter(id => sides[id] === 0);
    const refInfo = analyzeSpec(sbSpec('c1'));
    if (!bad.length && !neu.length) {
      const i2 = analyzeSpec(sbSpec('c2')), i3 = analyzeSpec(sbSpec('c3'));
      const r = compareShots(i2, 'cuA', i3, 'cuB');
      verdict.className = 'verdict-bar';
      verdict.innerHTML = `<span class="vi">✓</span><span>三部機都喺同一邊，點剪都接得上。${r.level === 'ok' && r.items[0] ? '（' + r.items[0] + '）' : ''}</span>`;
    } else {
      verdict.className = 'verdict-bar' + (bad.length ? ' bad' : '');
      const msgs = [];
      for (const id of bad) {
        const other = id === 'c2' ? 'c3' : 'c2';
        const partner = sides[other] === ref ? other : 'c1';
        const ia = analyzeSpec(sbSpec(partner)), ib = analyzeSpec(sbSpec(id));
        const r = compareShots(ia, ROLE[partner], ib, ROLE[id]);
        msgs.push(`<strong>Cam ${id.slice(1)} 越咗軸</strong>：同 Cam ${partner.slice(1)} 一剪，${r.items.slice(0, 2).join('；')}。`);
      }
      for (const id of neu) msgs.push(`<strong>Cam ${id.slice(1)} 喺軸線上</strong>：中性鏡頭，冇左右方向。`);
      verdict.innerHTML = `<span class="vi">${bad.length ? '✗' : '◎'}</span><span>${msgs.join(' ')}</span>`;
    }
    void refInfo;
  }
  function changed() {
    for (const id in cams) cams[id].pos = SB.pos[id];
    plan.render();
    for (const id in mons) mons[id].view.inval();
    updateVerdict();
    for (const f of sbListeners) f();
  }
  const btns = $$('#presetBtns [data-preset]');
  function setPresetBtn(key) { for (const b of btns) b.classList.toggle('on', b.dataset.preset === key); }
  let tw = null;
  function tweenTo(key) {
    const target = SETUPS[key], from = JSON.parse(JSON.stringify(SB.pos)), t0 = performance.now(), ms = REDUCED ? 1 : 1100;
    setPresetBtn(key);
    const me = {}; tw = me;
    addTicker(now => {
      if (tw !== me) return false;
      const t = clamp((now - t0) / ms, 0, 1), e = ease(t);
      for (const id in target) SB.pos[id] = polarLerp(from[id], target[id], e);
      changed(); return t < 1;
    });
  }
  for (const b of btns) b.addEventListener('click', () => tweenTo(b.dataset.preset));
  const bindOpt = (id, key, planKey) => $(id).addEventListener('change', e => {
    SB.opts[key] = e.target.checked;
    if (planKey) { plan.show[planKey] = e.target.checked; }
    changed();
  });
  bindOpt('#optGaze', 'gaze', 'gaze'); bindOpt('#optFov', 'fov', 'fov'); bindOpt('#optTape', 'tape'); bindOpt('#optZones', 'zones');
  changed();
}

/* ============================ §3 eyeline ============================ */
function initEyeline() {
  const A_POS = SETUPS.std.c2, B_OK = SETUPS.std.c3, B_BAD = SETUPS.x3.c3;
  const st = { t: 0, crossed: false };
  const c3pos = () => polarLerp(B_OK, B_BAD, ease(st.t));
  const vA = new View($('#eyeA'), { spec: () => rig('cuA', A_POS[0], A_POS[1]), overlay: (ctx, info, W) => { ovGaze(ctx, info, ['A'], W); } });
  const vB = new View($('#eyeB'), { spec: () => { const p = c3pos(); return rig('cuB', p[0], p[1]); }, overlay: (ctx, info, W) => { ovGaze(ctx, info, ['B'], W); } });
  const cams = { c2: { role: 'cuA', pos: A_POS, col: CAMCOL.c2, label: 'CU A' }, c3: { role: 'cuB', pos: c3pos(), col: CAMCOL.c3, label: 'CU B' } };
  const plan = new Plan($('#plan3'), { view: [-2.55, -2.05, 5.1, 3.9], room: true, cams, refSide: 1, arcR: 1.2, textScale: 0.8, show: { tri: false, labels: false, camLabels: false } });
  const mid = $('#eyeMid'), arrB = $('#eyeArrB'), lab = $('#eyeBLab'), mind = $('#mindSvg'), mindTxt = $('#mindTxt');
  function drawMind(crossed) {
    mind.replaceChildren();
    const fig = (x, y, dir, col, name, ghost) => {
      const g = E('g', { transform: `translate(${x} ${y}) scale(1.25)`, opacity: ghost ? .45 : 1 }, mind);
      E('ellipse', { cx: 0, cy: 0, rx: 9, ry: 16, fill: col, transform: `rotate(${dir > 0 ? 0 : 180})` }, g);
      E('circle', { cx: dir * 3, cy: 0, r: name === 'B' ? 11.5 : 10, fill: ghost ? '#8792A0' : (name === 'A' ? '#0F0D0C' : '#21150F'), stroke: '#C9B79A', 'stroke-width': 1.6 }, g);
      E('circle', { cx: dir * 13, cy: 0, r: 3, fill: '#F4C7A3' }, g);
      E('text', { x: 0, y: 36, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: 'currentColor', 'font-family': 'Fredoka, var(--font-body)' }, g, name);
      E('path', { d: `M${dir * 20},0 l${dir * 26},0`, stroke: col, 'stroke-width': 3, 'stroke-dasharray': '3 4', 'stroke-linecap': 'round' }, g);
      E('path', { d: `M${dir * 50},0 l${-dir * 8},-5 l0,10 z`, fill: col }, g);
    };
    if (!crossed) { fig(40, 48, 1, '#B07A43', 'A'); fig(180, 48, -1, '#2E4D99', 'B'); }
    else { fig(28, 48, 1, '#B07A43', 'A'); fig(112, 48, 1, '#2E4D99', 'B'); const g = E('g', { transform: 'translate(196 48) scale(1.25)', opacity: .55 }, mind); E('circle', { r: 13, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-dasharray': '3 3' }, g); E('text', { y: 6, 'text-anchor': 'middle', 'font-size': 17, 'font-weight': 800, fill: 'currentColor' }, g, '?'); }
    mind.style.color = 'var(--ink-2)';
    mindTxt.innerHTML = crossed ? '兩個都望右：<span class="b-txt">B</span> 好似背住 <span class="a-txt">A</span>，望住畫外另一個人。' : '<span class="a-txt">A</span> 同 <span class="b-txt">B</span> 面對面，喺度對話。';
  }
  function setVerdict() {
    const crossed = st.t > 0.5;
    mid.className = 'eye-mid ' + (crossed ? 'bad' : 'ok'); mid.textContent = crossed ? '✗ 冇對望' : '對望 ✓';
    arrB.classList.toggle('flip', crossed);
    lab.textContent = crossed ? 'CAM 3 · CU B（過咗線）' : 'CAM 3 · CU B';
    drawMind(crossed);
  }
  function go(crossed) {
    $('#eyeOk').classList.toggle('on', !crossed); $('#eyeBad').classList.toggle('on', crossed);
    const from = st.t, to = crossed ? 1 : 0, t0 = performance.now(), ms = REDUCED ? 1 : 1000;
    const me = {}; st.tw = me;
    addTicker(now => {
      if (st.tw !== me) return false;
      const k = clamp((now - t0) / ms, 0, 1); st.t = lerp(from, to, k);
      cams.c3.pos = c3pos(); plan.render(); vB.inval();
      if (k >= 1) setVerdict();
      return k < 1;
    });
  }
  $('#eyeOk').addEventListener('click', () => go(false));
  $('#eyeBad').addEventListener('click', () => go(true));
  setVerdict(); void vA;
}

/* ============================ §4 failure cases ============================ */
const INS_SPEC = s => rig('free', 0.05, 0.92 * s, { h: 1.02, target: [0.0, 0.78, 0.02], vfov: 30 });
const SHOT = (role, p, extra) => Object.assign({ role, pos: p, spec: () => rig(role, p[0], p[1]) }, extra || {});
const CUP_FROM = [-0.26, TABLE.y, 0.1], CUP_TO = [0.18, TABLE.y, 0.02];
const CASES = [
  { rows: { ok: [SHOT('cuA', [1.25, 1.25]), SHOT('cuB', [-1.25, 1.25])], bad: [SHOT('cuA', [1.25, 1.25]), SHOT('cuB', [-1.25, -1.25])] },
    notes: { ok: 'CU A 剪去 CU B', bad: 'CU A 剪去過咗線嘅 CU B' },
    labs: { ok: ['CAM 2 · CU A', 'CAM 3 · CU B'], bad: ['CAM 2 · CU A', 'CAM 3′ · CU B'] },
    feel: '兩個人唔似對住講嘢：A 望右，B 都望右，好似同畫外另一個人講。',
    also: '觀眾講唔出原因，但會覺得怪；一諗，就出戲。',
    plan: [['c2', [1.25, 1.25], 'cuA', 'ok', '2'], ['c3', [-1.25, 1.25], 'cuB', 'ok', '3'], ['x3', [-1.25, -1.25], 'cuB', 'bad', '3′']] },
  { rows: { ok: [SHOT('master', [0, 3]), SHOT('cuB', [-1.25, 1.25])], bad: [SHOT('master', [0, 3]), SHOT('cuB', [-1.25, -1.25])] },
    notes: { ok: 'Master 剪去 CU B', bad: 'Master 剪去過咗線嘅 CU B' },
    labs: { ok: ['CAM 1 · MASTER', 'CAM 3 · CU B'], bad: ['CAM 1 · MASTER', 'CAM 3′ · CU B'] },
    feel: 'B 瞬間移咗位：Master 入面佢坐右邊，下一格突然喺左邊。',
    also: '注意力由對白跌咗落「邊個喺邊」，節奏即刻斷。',
    plan: [['c1', [0, 3], 'master', 'ok', '1'], ['c3', [-1.25, 1.25], 'cuB', 'ok', '3'], ['x3', [-1.25, -1.25], 'cuB', 'bad', '3′']] },
  { anim: true,
    rows: { ok: [SHOT('master', [0, 3]), { role: 'insert', pos: [0.05, 0.92], spec: () => INS_SPEC(1) }], bad: [SHOT('master', [0, 3]), { role: 'insert', pos: [0.05, -0.92], spec: () => INS_SPEC(-1) }] },
    notes: { ok: 'Master 剪去插入鏡頭', bad: 'Master 剪去過咗線嘅插入鏡頭' },
    labs: { ok: ['CAM 1 · MASTER', 'INSERT · 杯'], bad: ['CAM 1 · MASTER', 'INSERT′ · 杯'] },
    feel: 'A 將杯咖啡推過去，近鏡入面杯咖啡好似推返轉頭。',
    also: '追車、行出畫面都一樣：越軸令動作方向反轉。',
    plan: [['c1', [0, 3], 'master', 'ok', '1'], ['in', [0.05, 0.92], 'insert', 'ok', '插'], ['xin', [0.05, -0.92], 'insert', 'bad', '插′']] },
  { rows: { ok: [SHOT('master', [0, 3]), SHOT('master', [1.55, 2.55])], bad: [SHOT('master', [0, 3]), SHOT('master', [0, -3])] },
    notes: { ok: 'Master 剪去同一邊嘅全景', bad: 'Master 剪去過咗線嘅全景' },
    labs: { ok: ['CAM 1 · MASTER', 'CAM 1b · WIDE'], bad: ['CAM 1 · MASTER', 'CAM 1′ · WIDE'] },
    feel: '好似去咗第二個地方：雨夜窗景變咗水吧同餐牌，兩個人仲左右調轉。',
    also: '仲會影埋燈架：工作人員同器材通常就喺「另一邊」。',
    plan: [['c1', [0, 3], 'master', 'ok', '1'], ['w2', [1.55, 2.55], 'master', 'ok', '1b'], ['xm', [0, -3], 'master', 'bad', '1′']] },
];
function initCases() {
  let idx = 0, t0 = performance.now(), animT = 0, running = false;
  const panel = $('#casePanel');
  const pose = () => { if (!CASES[idx].anim) return null; const k = smooth(0.1, 0.62, animT % 1); return { A: {}, B: {}, cupA: [lerp(CUP_FROM[0], CUP_TO[0], k), TABLE.y, lerp(CUP_FROM[2], CUP_TO[2], k)] }; };
  const views = {};
  for (const key of ['ok0', 'ok1', 'bad0', 'bad1']) {
    const row = key.slice(0, -1), i = +key.slice(-1);
    views[key] = new View($(`[data-v="${key}"]`, panel), {
      spec: () => CASES[idx].rows[row][i].spec(),
      pose,
      overlay: (ctx, info, W) => {
        const sh = CASES[idx].rows[row][i];
        const ids = subjOf(sh.role);
        if (CASES[idx].anim) {
          const a = info.cam.proj(CUP_FROM), b = info.cam.proj(CUP_TO);
          if (a && b) { const s = OS(W); const y = Math.min(a[1], b[1]) - 34 * s; const dir = Math.sign(b[0] - a[0]); const cx = (a[0] + b[0]) / 2; const L = clamp(Math.abs(b[0] - a[0]) * 0.9, 50 * s, 220 * s); drawArrow(ctx, cx - dir * L / 2, y, cx + dir * L / 2, y, row === 'ok' || i === 0 ? '#2FA36B' : '#E5484D', 6 * s); }
          ovTags(ctx, info, ids, W);
        } else { ovGaze(ctx, info, ids, W); ovTags(ctx, info, ids, W); }
      },
    });
  }
  const cams = {};
  const plan = new Plan($('#plan4'), { view: [-3.0, -3.45, 6.0, 6.95], cams, refSide: 1, arcR: 1.5, textScale: 1.0, show: { tri: false, labels: false, camLabels: false, gaze: true } });
  function setCase(i) {
    idx = i;
    $$('.tab').forEach(t => t.setAttribute('aria-selected', String(+t.dataset.case === i)));
    const C = CASES[i];
    $('[data-note="ok"]', panel).textContent = C.notes.ok; $('[data-note="bad"]', panel).textContent = C.notes.bad;
    for (const key of ['ok0', 'ok1', 'bad0', 'bad1']) { const row = key.slice(0, -1), j = +key.slice(-1); $(`[data-lab="${key}"]`, panel).textContent = C.labs[row][j]; views[key].inval(); }
    $('[data-feel]', panel).textContent = C.feel; $('[data-also]', panel).textContent = C.also;
    for (const k in cams) delete cams[k];
    for (const [id, pos, role, status, num] of C.plan) cams[id] = { role, pos, status, num, col: status === 'bad' ? '#E5484D' : (role === 'cuA' ? CAMCOL.c2 : role === 'cuB' ? CAMCOL.c3 : CAMCOL.c1), small: role === 'insert', spec: role === 'insert' ? () => INS_SPEC(pos[1] > 0 ? 1 : -1) : null, darkText: role === 'cuA' };
    for (const id in plan.camEls) { plan.camEls[id].g.remove(); delete plan.camEls[id]; }
    plan.render();
    // verdict lines
    for (const row of ['ok', 'bad']) {
      const el = $(`[data-res="${row}"]`, panel);
      const [s0, s1] = C.rows[row];
      if (C.anim) {
        const dirOf = sp => { const c = makeCam(sp.pos, sp.target, sp.vfov, 1600, 900); const a = c.proj(CUP_FROM), b = c.proj(CUP_TO); return b[0] > a[0] ? '由左去右 →' : '由右去左 ←'; };
        const d0 = dirOf(s0.spec()), d1 = dirOf(s1.spec());
        el.innerHTML = row === 'ok' ? `<span class="ri ok-txt">✓</span><span>兩格入面杯咖啡都係<strong>${d0}</strong>：動作方向一致。</span>` : `<span class="ri bad-txt">✗</span><span>Master 入面<strong>${d0}</strong>，近鏡入面變咗<strong>${d1}</strong>：方向反轉。</span>`;
      } else {
        const r = compareShots(analyzeSpec(s0.spec()), s0.role, analyzeSpec(s1.spec()), s1.role);
        el.innerHTML = `<span class="ri ${r.level === 'bad' ? 'bad-txt' : 'ok-txt'}">${r.level === 'bad' ? '✗' : '✓'}</span><span>${r.items.slice(0, 3).join('；')}。</span>`;
      }
    }
    if (C.anim && !running && !REDUCED) { running = true; t0 = performance.now(); addTicker(tick); }
  }
  let vis = false;
  new IntersectionObserver(es => { vis = es[0].isIntersecting; if (vis && CASES[idx].anim && !running && !REDUCED) { running = true; addTicker(tick); } }).observe(panel);
  const tick = now => {
    if (!CASES[idx].anim || !vis) { running = false; return false; }
    animT = ((now - t0) / 2600) % 1;
    for (const k in views) views[k].inval();
    return true;
  };
  if (REDUCED) animT = 0.8;
  $$('.tab').forEach(t => t.addEventListener('click', () => setCase(+t.dataset.case)));
  $('.tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = (idx + (e.key === 'ArrowRight' ? 1 : 3)) % 4; setCase(n); $(`.tab[data-case="${n}"]`).focus();
  });
  setCase(0);
}

/* ============================ §5 edit suite ============================ */
const DUR = 24, FPS = 24;
const LINES = [
  { who: 'A', t0: 1.0, t1: 3.2, text: '落咁大雨，你仲要走？' },
  { who: 'B', t0: 4.1, t1: 5.9, text: '尾班船十一點。' },
  { who: 'A', t0: 6.9, t1: 9.4, text: '坐多陣啦，杯咖啡都未飲完。' },
  { who: 'B', t0: 10.3, t1: 12.4, text: '你每次都係咁講。' },
  { who: 'A', t0: 13.9, t1: 16.9, text: '咁今次呢？你想我點講？' },
  { who: 'B', t0: 21.6, t1: 23.3, text: '……等雨停咗先講。' },
];
const EDL0 = [{ t: 0, cam: 1 }, { t: 3.7, cam: 3 }, { t: 6.5, cam: 2 }, { t: 9.8, cam: 3 }, { t: 13.5, cam: 2 }, { t: 17.3, cam: 3 }, { t: 21.2, cam: 1 }];
function poseAt(t) {
  const P = { A: {}, B: {} };
  for (const id of ['A', 'B']) {
    const q = P[id]; q.breathe = Math.sin(t * 1.6 + (id === 'A' ? 0 : 1.3));
    const per = id === 'A' ? 3.3 : 4.1, bt = (t + (id === 'A' ? 0.7 : 1.9)) % per;
    q.blink = bt < 0.15 ? Math.sin(bt / 0.15 * Math.PI) : 0;
  }
  for (const L of LINES) {
    if (t >= L.t0 && t <= L.t1) {
      const q = P[L.who]; const env = clamp(Math.min(t - L.t0, L.t1 - t) / 0.12, 0, 1);
      q.mouth = env * (0.25 + 0.75 * Math.abs(Math.sin(t * 13.7) * Math.sin(t * 5.3 + 0.7)));
      q.headPitch = (q.headPitch || 0) + 0.03 * Math.sin(t * 4.2);
      q.headYaw = 0.03 * Math.sin(t * 2.3);
    }
  }
  const k = smooth(17.5, 18.2, t) * (1 - smooth(19.9, 20.6, t));
  P.B.headPitch = (P.B.headPitch || 0) + 0.32 * k;
  if (k > 0.35) P.B.lookAt = [0.22, 0.8, -0.08];
  P.B.worry = t > 10 && t < 23.5;
  P.A.lean = 0.05 * smooth(15, 16.5, t) * (1 - smooth(22.5, 23.8, t));
  const nod = smooth(12.5, 12.8, t) * (1 - smooth(12.9, 13.3, t)) + smooth(5.95, 6.15, t) * (1 - smooth(6.15, 6.5, t));
  P.A.headPitch = (P.A.headPitch || 0) + 0.12 * nod;
  return P;
}
const tcOf = t => { const f = Math.floor(t * FPS + 1e-6); const ff = f % FPS, s = Math.floor(f / FPS) % 60, m = Math.floor(f / FPS / 60); const p = n => String(n).padStart(2, '0'); return `00:${p(m)}:${p(s)}:${p(ff)}`; };
function initEdit() {
  const E_ = { cuts: EDL0.map(c => ({ ...c })), t: 0, playing: false, ver: 'std', cmp: true, sel: -1, last: 0 };
  const VERN = { std: '✓ 跟足 180°', x3: '✗ Cam 3 越軸', xm: '✗ Master 越軸', sb: '你喺第 2 部分擺嘅機位' };
  const posOf = ver => ver === 'sb' ? SB.pos : SETUPS[ver];
  const specOf = (ver, cam) => { const id = 'c' + cam, p = posOf(ver)[id]; return rig(ROLE[id], p[0], p[1]); };
  const camAt = t => { let c = E_.cuts[0].cam; for (const k of E_.cuts) { if (k.t <= t + 1e-6) c = k.cam; else break; } return c; };
  const clipIdx = t => { let i = 0; for (let k = 0; k < E_.cuts.length; k++) if (E_.cuts[k].t <= t + 1e-6) i = k; return i; };
  let evals = { std: [], cur: [] };
  function evalVer(ver) {
    const out = [];
    for (let i = 1; i < E_.cuts.length; i++) {
      const a = E_.cuts[i - 1], b = E_.cuts[i];
      if (a.cam === b.cam) { out.push(null); continue; }
      out.push(compareShots(analyzeSpec(specOf(ver, a.cam)), ROLE['c' + a.cam], analyzeSpec(specOf(ver, b.cam)), ROLE['c' + b.cam]));
    }
    return out;
  }
  const suite = $('#suite');
  const pgs = { ref: $('#pgRef'), cur: $('#pgCur') };
  const pgViews = {};
  for (const k of ['ref', 'cur']) {
    const el = pgs[k];
    pgViews[k] = new View($('canvas', el), {
      maxW: 1500,
      spec: () => specOf(k === 'ref' ? 'std' : E_.ver, camAt(E_.t)),
      pose: () => poseAt(E_.t),
    });
  }
  const angViews = {};
  $$('#angles .angle').forEach(btn => {
    const cam = +btn.dataset.cam;
    angViews[cam] = { btn, st: $('[data-st]', btn), view: new View($('canvas', btn), { maxW: 700, spec: () => specOf(E_.ver, cam), pose: () => poseAt(E_.t) }) };
    btn.addEventListener('click', () => switchTo(cam));
  });
  function setSub(el, t) {
    const L = LINES.find(l => t >= l.t0 && t <= l.t1 + 0.25);
    el.innerHTML = L ? `<span class="who ${L.who}">${L.who}：</span>${L.text}` : '';
  }
  const tcEl = $('#tc');
  function refreshStatic() {
    const cur = camAt(E_.t);
    for (const c in angViews) angViews[c].btn.classList.toggle('live', +c === cur);
    for (const k of ['ref', 'cur']) {
      $('[data-cam]', pgs[k]).textContent = `CAM ${cur} · ${CAMNAME['c' + cur]}`;
      setSub($('[data-sub]', pgs[k]), E_.t);
    }
    tcEl.innerHTML = `${tcOf(E_.t)} <small>/ ${tcOf(DUR)}</small>`;
    $('#playhead').style.left = (E_.t / DUR * 100) + '%';
  }
  function invalAll() { for (const k in pgViews) pgViews[k].inval(); for (const c in angViews) angViews[c].view.inval(); }
  // ------- timeline -------
  const ruler = $('#tlRuler'), laneV = $('#laneV'), laneA = $('#laneA'), laneB = $('#laneB');
  (function buildStatic() {
    for (let s = 0; s <= DUR; s++) {
      E_.t = E_.t;
      const tk = document.createElement('div'); tk.className = 'tl-tick' + (s % 2 === 0 ? ' major' : ''); tk.style.left = (s / DUR * 100) + '%'; ruler.appendChild(tk);
      if (s % 4 === 0 && s < DUR) { const l = document.createElement('div'); l.className = 'tl-tick-l' + (s % 8 ? ' minor' : ''); l.style.left = (s / DUR * 100) + '%'; l.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; if (s === 0) l.style.transform = 'none'; ruler.appendChild(l); }
    }
    LINES.forEach((L, i) => {
      const el = document.createElement('div'); el.className = 'aclip ' + L.who;
      el.style.left = (L.t0 / DUR * 100) + '%'; el.style.width = ((L.t1 - L.t0) / DUR * 100) + '%';
      const cv = document.createElement('canvas'); cv.width = 240; cv.height = 40; el.appendChild(cv);
      const g = cv.getContext('2d'); const rnd = mulberry(40 + i); g.fillStyle = L.who === 'A' ? '#5A3A06' : '#0D2A5A';
      for (let x = 0; x < 240; x += 3) { const a = (0.25 + 0.75 * rnd()) * Math.sin(Math.PI * x / 240) ** 0.3 * 17; g.fillRect(x, 20 - a, 2, a * 2); }
      const sp = document.createElement('span'); sp.textContent = L.text; el.appendChild(sp);
      (L.who === 'A' ? laneA : laneB).appendChild(el);
    });
  })();
  function buildTimeline() {
    laneV.replaceChildren();
    $$('.tl-mark', ruler).forEach(m => m.remove());
    const clips = E_.cuts.map((c, i) => ({ t0: c.t, t1: i + 1 < E_.cuts.length ? E_.cuts[i + 1].t : DUR, cam: c.cam, i }));
    const laneW = laneV.getBoundingClientRect().width || 800;
    for (const c of clips) {
      const b = document.createElement('button'); b.className = `clip k${c.cam}` + (c.i === E_.sel ? ' sel' : '');
      const w = (c.t1 - c.t0) / DUR;
      b.style.left = (c.t0 / DUR * 100) + '%'; b.style.width = `calc(${w * 100}% - 2px)`;
      if (w * laneW < 96) b.classList.add('narrow');
      b.setAttribute('aria-label', `片段 ${tcOf(c.t0)}：Cam ${c.cam} ${CAMNAME['c' + c.cam]}`);
      const cv = document.createElement('canvas'); b.appendChild(cv);
      const sp = document.createElement('span'); sp.className = 'cl'; sp.textContent = `${c.cam} ${CAMNAME['c' + c.cam]}`; b.appendChild(sp);
      b.addEventListener('click', () => { pause(); E_.sel = c.i; seek(c.t0 + 0.001); buildTimeline(); });
      laneV.appendChild(b);
      requestAnimationFrame(() => {
        const r = cv.getBoundingClientRect(); if (r.width < 4) return;
        cv.width = Math.round(r.width * DPR()); cv.height = Math.round(r.height * DPR());
        renderScene(cv.getContext('2d'), cv.width, cv.height, specOf(E_.ver, c.cam), poseAt(c.t0 + 0.3), { grain: false });
      });
    }
    const ev = evals.cur;
    for (let i = 1; i < E_.cuts.length; i++) {
      const r = ev[i - 1]; if (!r) continue;
      const m = document.createElement('button'); m.className = 'tl-mark ' + r.level; m.style.left = (E_.cuts[i].t / DUR * 100) + '%';
      m.textContent = r.level === 'bad' ? '✗' : r.level === 'neutral' ? '◎' : '✓';
      m.title = `${tcOf(E_.cuts[i].t)} ${r.head}：${r.items[0]}`;
      m.setAttribute('aria-label', m.title);
      m.addEventListener('pointerdown', e => e.stopPropagation());
      m.addEventListener('click', e => { e.stopPropagation(); replayCut(i); });
      ruler.appendChild(m);
      if (r.level === 'bad') { const cl = document.createElement('div'); cl.className = 'cutline'; cl.style.left = (E_.cuts[i].t / DUR * 100) + '%'; laneV.appendChild(cl); }
    }
    buildCutList();
    // angle status (is this angle on the other side of the master?)
    const ref = sideOf([posOf(E_.ver).c1[0], 1.3, posOf(E_.ver).c1[1]]) || 1;
    for (const c in angViews) {
      const p = posOf(E_.ver)['c' + c], s = sideOf([p[0], 1.2, p[1]]);
      const bad = +c !== 1 && s !== 0 && s !== ref;
      angViews[c].st.innerHTML = +c === 1 ? '<span class="chip ref">★ 基準</span>' : bad ? '<span class="chip bad">✗ 越軸</span>' : s === 0 ? '<span class="chip neutral">◎</span>' : '<span class="chip ok">✓</span>';
    }
  }
  const list = $('#cutlist');
  function buildCutList() {
    list.replaceChildren();
    const ev = evals.cur; let nBad = 0, nAll = 0;
    const h = document.createElement('h3'); list.appendChild(h);
    for (let i = 1; i < E_.cuts.length; i++) {
      const r = ev[i - 1]; if (!r) continue; nAll++; if (r.level === 'bad') nBad++;
      const a = E_.cuts[i - 1].cam, b = E_.cuts[i].cam;
      const it = document.createElement('div'); it.className = 'cut-item ' + r.level; it.setAttribute('role', 'button'); it.tabIndex = 0;
      it.innerHTML = `<span class="tcs">${tcOf(E_.cuts[i].t).slice(3)}</span><span class="pair">${CAMNAME['c' + a]} → ${CAMNAME['c' + b]}</span><span class="why"><b>${r.head}</b>：${r.items.slice(0, 2).join('；')}</span>`;
      it.title = '撳一下重播呢一刀';
      it.addEventListener('click', () => replayCut(i));
      it.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); replayCut(i); } });
      list.appendChild(it);
    }
    h.innerHTML = `剪接點檢查（${VERN[E_.ver]}）：${nAll} 個剪接點，` + (nBad ? `<span style="color:#FF8A8F">✗ ${nBad} 個越軸</span>` : `<span style="color:#7FE0AE">✓ 全部接得順</span>`);
  }
  function reEval() { evals.cur = evalVer(E_.ver); evals.std = evalVer('std'); buildTimeline(); }
  // ------- playback -------
  const playBtn = $('#tPlay');
  function setPlayUI() { playBtn.innerHTML = E_.playing ? '<svg width="16" height="16" aria-hidden="true"><use href="#i-pause"/></svg><span>暫停</span>' : '<svg width="16" height="16" aria-hidden="true"><use href="#i-play"/></svg><span>播放</span>'; }
  function seek(t) { E_.t = clamp(t, 0, DUR); refreshStatic(); invalAll(); }
  function pause() { E_.playing = false; setPlayUI(); }
  function play() {
    if (E_.t >= DUR - 0.01) E_.t = 0;
    E_.playing = true; E_.last = performance.now(); setPlayUI();
    addTicker(now => {
      if (!E_.playing) return false;
      const dt = Math.min(0.1, (now - E_.last) / 1000); E_.last = now;
      const prev = E_.t; E_.t = Math.min(DUR, E_.t + dt);
      for (let i = 1; i < E_.cuts.length; i++) { const c = E_.cuts[i]; if (prev < c.t && E_.t >= c.t) onCut(i); }
      refreshStatic(); invalAll();
      if (E_.t >= DUR) { pause(); return false; }
      return true;
    });
  }
  const timers = {};
  function showCallout(k, r) {
    const el = pgs[k]; if (el.hidden) return;
    const co = $('[data-callout]', el), fl = $('[data-flash]', el);
    co.className = 'callout show ' + r.level;
    co.innerHTML = `<span>${r.head}</span><span style="font-weight:600">${r.items.slice(0, 2).join('；')}</span>`;
    fl.className = 'flash ' + (r.level === 'bad' ? 'bad' : r.level === 'ok' ? 'ok' : '');
    clearTimeout(timers[k]); timers[k] = setTimeout(() => { co.classList.remove('show'); fl.className = 'flash'; }, 2300);
  }
  function onCut(i) {
    const r = evals.cur[i - 1]; if (r) showCallout('cur', r);
    const r2 = evals.std[i - 1]; if (r2 && !pgs.ref.hidden) showCallout('ref', r2);
  }
  function replayCut(i) { pause(); seek(Math.max(0, E_.cuts[i].t - 1.6)); play(); }
  function switchTo(cam) {
    const t = E_.t;
    if (E_.playing) {
      const k = clipIdx(t);
      if (E_.cuts[k].cam === cam) return;
      if (t - E_.cuts[k].t < 0.35) E_.cuts[k].cam = cam;
      else E_.cuts.splice(k + 1, 0, { t: Math.round(t * FPS) / FPS, cam });
    } else {
      const k = clipIdx(t); E_.cuts[k].cam = cam; E_.sel = k;
    }
    merge(); reEval(); refreshStatic(); invalAll();
  }
  function merge() { for (let i = E_.cuts.length - 1; i > 0; i--) if (E_.cuts[i].cam === E_.cuts[i - 1].cam) E_.cuts.splice(i, 1); if (E_.sel >= E_.cuts.length) E_.sel = -1; }
  playBtn.addEventListener('click', () => E_.playing ? pause() : play());
  $('#tStart').addEventListener('click', () => { pause(); seek(0); });
  const cutTimes = () => E_.cuts.slice(1).map(c => c.t);
  $('#tPrev').addEventListener('click', () => { pause(); const ts = cutTimes().filter(x => x < E_.t - 0.05); seek(ts.length ? ts[ts.length - 1] : 0); });
  $('#tNext').addEventListener('click', () => { pause(); const ts = cutTimes().filter(x => x > E_.t + 0.05); seek(ts.length ? ts[0] : DUR); });
  $('#tBlade').addEventListener('click', () => {
    pause(); const t = Math.round(E_.t * FPS) / FPS; const k = clipIdx(t);
    if (t - E_.cuts[k].t < 0.3 || (k + 1 < E_.cuts.length && E_.cuts[k + 1].t - t < 0.3) || t > DUR - 0.3) return;
    const nextCam = [1, 2, 3].find(c => c !== E_.cuts[k].cam && c !== (E_.cuts[k + 1] || {}).cam) || 1;
    E_.cuts.splice(k + 1, 0, { t, cam: nextCam }); E_.sel = k + 1; reEval(); refreshStatic(); invalAll();
  });
  $('#tReset').addEventListener('click', () => { pause(); E_.cuts = EDL0.map(c => ({ ...c })); E_.sel = -1; reEval(); seek(0); });
  // scrub
  const tl = $('#tl');
  const scrubFrom = ev => { const r = laneV.getBoundingClientRect(); seek((ev.clientX - r.left) / r.width * DUR); };
  ruler.addEventListener('pointerdown', e => { pause(); ruler.setPointerCapture(e.pointerId); scrubFrom(e); const mv = ev => scrubFrom(ev); const up = () => { ruler.removeEventListener('pointermove', mv); ruler.removeEventListener('pointerup', up); }; ruler.addEventListener('pointermove', mv); ruler.addEventListener('pointerup', up); });
  for (const lane of [laneA, laneB]) lane.addEventListener('click', e => { pause(); scrubFrom(e); });
  // versions
  const verBtns = $$('#verBtns [data-ver]');
  const cmp = $('#cmpToggle');
  function setVer(v) {
    E_.ver = v; for (const b of verBtns) b.classList.toggle('on', b.dataset.ver === v);
    $('[data-vername]', pgs.cur).textContent = VERN[v];
    layoutPrograms(); reEval(); refreshStatic(); invalAll();
  }
  function layoutPrograms() {
    const two = cmp.checked && E_.ver !== 'std';
    pgs.ref.hidden = !two; $('#programs').classList.toggle('two', two); $('.edit-view').classList.toggle('two', two);
    $('#cmpWrap').style.opacity = E_.ver === 'std' ? .5 : 1;
  }
  for (const b of verBtns) b.addEventListener('click', () => setVer(b.dataset.ver));
  cmp.addEventListener('change', () => { layoutPrograms(); invalAll(); });
  let sbT = 0;
  sbListeners.push(() => { if (E_.ver !== 'sb') return; clearTimeout(sbT); sbT = setTimeout(() => { reEval(); invalAll(); }, 160); });
  // keyboard
  let suiteVis = false;
  new IntersectionObserver(es => { suiteVis = es[0].intersectionRatio > 0.2; }, { threshold: [0, 0.2, 0.5] }).observe(suite);
  document.addEventListener('keydown', e => {
    if (!suiteVis || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === '1' || e.key === '2' || e.key === '3') { e.preventDefault(); switchTo(+e.key); }
    else if (e.key === ' ' || e.code === 'Space') { if (tag === 'BUTTON' || document.activeElement.getAttribute('role') === 'button' || document.activeElement.getAttribute('role') === 'tab') return; e.preventDefault(); E_.playing ? pause() : play(); }
    else if (e.key === 'ArrowLeft' && !document.activeElement.closest('svg')) { e.preventDefault(); $('#tPrev').click(); }
    else if (e.key === 'ArrowRight' && !document.activeElement.closest('svg')) { e.preventDefault(); $('#tNext').click(); }
  });
  new ResizeObserver(() => buildTimeline()).observe(laneV);
  layoutPrograms(); reEval(); refreshStatic(); setPlayUI();
}

/* ============================ §6 crossing ============================ */
function initCrossing() {
  // A: moving camera across the line
  const D = { t: 0 };
  const R = 2.6, TH0 = rad(68), TH1 = rad(-68);
  const dollyPos = () => { const th = lerp(TH0, TH1, D.t); return [R * Math.cos(th), R * Math.sin(th)]; };
  const dollySpec = () => { const p = dollyPos(); return rig('master', p[0], p[1], { frameH: 2.1 }); };
  const dv = new View($('#dollyCv'), { maxW: 900, spec: dollySpec, overlay: (ctx, info, W) => { ovTags(ctx, info, ['A', 'B'], W); } });
  const dcams = { d: { role: 'master', pos: dollyPos(), col: CAMCOL.c1, num: '1', spec: dollySpec, isRef: true } };
  const dplan = new Plan($('#planDolly'), {
    view: [-3.15, -3.15, 6.3, 6.3], cams: dcams, refCam: 'd', arcR: 1.35, textScale: 1.35,
    show: { tri: false, labels: false, camLabels: false, gaze: false },
    extra: g => {
      const pts = []; for (let i = 0; i <= 40; i++) { const th = lerp(TH0, TH1, i / 40); pts.push([R * Math.cos(th) * 100, R * Math.sin(th) * 100]); }
      E('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: '#F3EBDC', 'stroke-width': 5, 'stroke-dasharray': '2 12', 'stroke-linecap': 'round', opacity: .9 }, g);
      const e = pts[pts.length - 1], e2 = pts[pts.length - 3];
      const d = n2([e[0] - e2[0], e[1] - e2[1]]);
      E('polygon', { points: `${e[0] + d[0] * 16},${e[1] + d[1] * 16} ${e[0] - d[1] * 11},${e[1] + d[0] * 11} ${e[0] + d[1] * 11},${e[1] - d[0] * 11}`, fill: '#F3EBDC' }, g);
    },
  });
  const dbtn = $('#dollyPlay');
  dbtn.addEventListener('click', () => {
    const from = D.t, to = D.t < 0.5 ? 1 : 0, t0 = performance.now(), ms = REDUCED ? 1 : 4200;
    $('span', dbtn).textContent = to === 1 ? '播緊…' : '播緊…';
    const me = {}; D.tw = me;
    addTicker(now => {
      if (D.tw !== me) return false;
      const k = clamp((now - t0) / ms, 0, 1); D.t = lerp(from, to, ease(k));
      dcams.d.pos = dollyPos(); dplan.render(); dv.inval();
      if (k >= 1) $('span', dbtn).textContent = to === 1 ? '播返轉頭' : '播：Steadicam 繞過去';
      return k < 1;
    });
  });
  // B: neutral shot strip
  const nspec = [() => rig('cuB', -1.25, 1.25), () => rig('free', -1.55, 0, { h: 1.52, target: EYE.B, vfov: 14 }), () => rig('cuB', -1.25, -1.25)];
  ['#nv1', '#nv2', '#nv3'].forEach((s, i) => new View($(s), { maxW: 700, spec: nspec[i], overlay: (ctx, info, W) => ovGaze(ctx, info, ['B'], W) }));
  // C: character walks, the line turns
  const W = { t: 0 };
  const path = [[0.98, 0.0], [1.35, 0.3], [1.95, -0.55], [1.75, -1.75], [1.05, -2.5]];
  const walkPos = t => {
    const segs = path.length - 1, x = clamp(t, 0, 1) * segs, i = Math.min(segs - 1, Math.floor(x)), f = x - i;
    const a = path[i], b = path[i + 1];
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), Math.atan2(b[1] - a[1], b[0] - a[0])];
  };
  const wchars = { A: { x: CH.A.base[0], z: 0, seated: true, headFace: null }, B: { x: 0.98, z: 0, seated: true } };
  const wcams = { c1: { role: 'master', pos: [0, 3.0], col: CAMCOL.c1, num: '1', isRef: true, hideFov: true } };
  const wplan = new Plan($('#planWalk'), {
    view: [-3.4, -3.25, 7.2, 6.85], chars: wchars, cams: wcams, refCam: 'c1', arcR: 1.6, textScale: 1.1,
    show: { tri: false, camLabels: false, fov: false, labels: false },
    extra: (g, ax) => {
      if (W.t > 0.02) {
        E('line', { x1: -400, y1: 0, x2: 400, y2: 0, stroke: '#F3EBDC', 'stroke-width': 4, 'stroke-dasharray': '6 10', opacity: .55 }, g);
        txt(g, -320, -16, '舊軸線', { 'font-size': 26, fill: '#F3EBDC', opacity: .85 });
      }
      if (W.t > 0.98) { const m = ax.m; txt(g, (m[0] - 0.3) * 100, (m[1] - 0.2) * 100, '新軸線', { 'font-size': 28, fill: '#CDBBFF', 'text-anchor': 'end' }); }
    },
  });
  const wbtn = $('#walkPlay');
  wbtn.addEventListener('click', () => {
    const from = W.t, to = W.t < 0.5 ? 1 : 0, t0 = performance.now(), ms = REDUCED ? 1 : 4600;
    const me = {}; W.tw = me;
    addTicker(now => {
      if (W.tw !== me) return false;
      const k = clamp((now - t0) / ms, 0, 1); W.t = lerp(from, to, ease(k));
      if (W.t < 0.02) { wchars.B = { x: 0.98, z: 0, seated: true }; }
      else {
        const [x, z, ang] = walkPos(W.t);
        const a = [HEAD.A[0], HEAD.A[2]];
        const faceA = Math.atan2(a[1] - z, a[0] - x);
        const blend = smooth(0.85, 1, W.t);
        const walkAng = to === 1 ? ang : ang + Math.PI;
        wchars.B = { x, z, seated: false, face: blend > 0.5 ? faceA : walkAng };
      }
      wplan.chars = wchars; wplan.render();
      if (k >= 1) $('span', wbtn).textContent = to === 1 ? '播：B 坐返埋位' : '播：B 起身行去窗邊';
      return k < 1;
    });
  });
  // D: insert
  new View($('#insertCv'), { maxW: 900, spec: () => rig('free', -0.16, 0.44, { h: 1.1, target: [-0.2, 0.8, 0.1], vfov: 21 }) });
}

/* ============================ table of contents ============================ */
function initToc() {
  const links = $$('.toc a'); const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(es => {
    for (const e of es) if (e.isIntersecting) { for (const a of links) a.classList.remove('on'); const a = map.get(e.target.id); if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } }
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const id of map.keys()) { const s = document.getElementById(id); if (s) io.observe(s); }
}

/* ============================ boot ============================ */
function boot() {
  initHero(); initAxisFig(); initSandbox(); initEyeline(); initCases(); initEdit(); initCrossing(); initToc();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const v of VIEWS) v.inval(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
