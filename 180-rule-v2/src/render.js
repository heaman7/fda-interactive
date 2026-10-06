/* =====================================================================
   180° 法則 v2 — flat illustrated camera renderer
   1960s Hong Kong café on a rainy night (original characters & set)
   World: x = east, y = up, z = south (metres). A sits west, B sits east.
   ===================================================================== */
'use strict';

/* ---------- vector helpers ---------- */
const UP = [0, 1, 0];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const madd = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const centroid = ps => { const c = [0, 0, 0]; for (const p of ps) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return mul(c, 1 / ps.length); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const rad = d => d * Math.PI / 180;
function mulberry(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- palette (fixed "artwork" colours) ---------- */
const PAL = {
  ceiling: '#2A2622',
  paint: '#6E9985', paintLine: '#628A77',
  tile: '#2F5E4F', tileHi: '#3B6D5C', grout: '#244A3D',
  rail: '#5A3925',
  wpaint: '#C79E68', wpaintLine: '#B48C59',
  wood: '#5C3925', woodLine: '#3F2518', woodHi: '#77492F',
  pillar: '#D9C8A5', pillarDk: '#BCA883',
  floorA: '#D8CBB0', floorB: '#4B6558',
  frame: '#24463A', frameHi: '#3A6655',
  sky1: '#142337', sky2: '#24425C',
  bldgFar: '#1F3446', bldgNear: '#2A4560', lit: '#F2C46A', litDim: '#B98B47',
  neonR: '#FF5252', neonG: '#52FFA8', neonP: '#FF72B8', neonC: '#7FE9FF',
  marble: '#EEEAE2', vein: '#BDB4A5', marbleEdge: '#CFC6B6', iron: '#262628',
  chair: '#4E2F1D', chairHi: '#70482F', chairDk: '#381F11',
  lampOut: '#2D5A4A', lampIn: '#FFE4A8', bulb: '#FFF7DA',
  cup: '#FBFAF6', cupRim: '#2E7A5A', coffee: '#4E2E1E',
  counterTop: '#E4D6BE', glassF: 'rgba(170,215,220,0.28)', glassE: 'rgba(235,252,252,0.6)',
  metal: '#ABA79C', metalDk: '#7E7B72', phone: '#A92C2A',
  board: '#F0E3C5', boardInk: '#B0281F',
  paper: '#EEE3C8', inkMid: '#6F7672', inkDark: '#3F4643', seal: '#B5332B',
  gold: '#C9A04A', mirror: '#3A5656',
  stand: '#26282B', softbox: '#FFF5D8',
  ink: '#1F2A36', shadow: 'rgba(22,14,8,0.30)',
  axis: '#7B4DFF', ok: '#2FA36B', bad: '#E5484D',
};

/* ---------- characters (original 1960s couple) ---------- */
const CH = {
  A: { id: 'A', base: [-0.98, 0, 0], F: [1, 0, 0], style: 'man', build: { sh: 0.188, hip: 0.158, arm: 0.18, dep: 0.108 },
    col: { top: '#AE7743', topDk: '#8B5C31', shirt: '#F2EEE5', tie: '#2A2630', skin: '#EDC29C', skinDk: '#D29F78', hair: '#0F0D0C', hairHi: '#4A4440',
      pants: '#2B2A33', pantsDk: '#201F27', leg: '#2B2A33', shoe: '#121113', mouth: '#7C3A33', brow: '#1A1614' } },
  B: { id: 'B', base: [0.98, 0, 0], F: [-1, 0, 0], style: 'woman', build: { sh: 0.158, hip: 0.152, arm: 0.152, dep: 0.096 },
    col: { top: '#2E4D99', topDk: '#223A77', pattern: '#8EADEF', piping: '#ECDDB4', skin: '#F2C9A9', skinDk: '#D7A583', hair: '#21150F', hairHi: '#6B4C3A',
      pants: '#2E4D99', pantsDk: '#223A77', leg: '#E2B796', shoe: '#701E27', mouth: '#B0222E', brow: '#2A1A12', pearl: '#FFF7E6' } },
};
for (const k in CH) CH[k].S = norm(cross(CH[k].F, UP));
const TABLE = { r: 0.42, y: 0.77, th: 0.035 };
const TABLE_Y = TABLE.y;
const HEAD_R = 0.118;
const LAMP = [0, 1.74, 0];

function joints(ch, p) {
  p = p || {};
  const F = ch.F, S = ch.S, b = ch.base, B = ch.build;
  const lean = 0.12 + (p.lean || 0);
  const hip = [b[0], 0.50, b[2]];
  const shC = add(hip, [F[0] * 0.47 * Math.sin(lean), 0.47 * Math.cos(lean), F[2] * 0.47 * Math.sin(lean)]);
  const headC = add(shC, [F[0] * 0.035, 0.218 + (p.breathe || 0) * 0.006, F[2] * 0.035]);
  const yaw = p.headYaw || 0, pitch = p.headPitch || 0;
  const Fy = norm(add(mul(F, Math.cos(yaw)), mul(S, Math.sin(yaw))));
  const Sh = norm(cross(Fy, UP));
  const Fh = norm(add(mul(Fy, Math.cos(pitch)), [0, -Math.sin(pitch), 0]));
  const Uh = norm(cross(Sh, Fh));
  const shL = add(madd(shC, S, -B.arm), [0, -0.012, 0]);
  const shR = add(madd(shC, S, B.arm), [0, -0.012, 0]);
  const elb = (sh, s) => add(add(madd(sh, S, s * 0.04), [0, -0.18, 0]), mul(F, 0.17));
  const hand = s => add(add(madd(b, F, 0.60), [0, 0.80, 0]), mul(S, s * 0.112));
  let hL = hand(-1), hR = hand(1);
  if (p.handR) hR = add(hR, p.handR);
  if (p.handL) hL = add(hL, p.handL);
  const hipL = madd(hip, S, -0.095), hipR = madd(hip, S, 0.095);
  const knee = h => add(madd(h, F, 0.40), [0, 0.03, 0]);
  const kL = knee(hipL), kR = knee(hipR);
  const ank = k => add(madd(k, F, 0.06), [0, -0.45, 0]);
  const aL = ank(kL), aR = ank(kR);
  const toe = a => add(madd(a, F, 0.12), [0, -0.02, 0]);
  const T = [];
  for (const [c, w] of [[hip, B.hip], [shC, B.sh]])
    for (const [ss, ff] of [[-1, -1], [1, -1], [1, 1], [-1, 1]])
      T.push(add(add(c, mul(S, ss * w)), mul(F, ff * B.dep)));
  return { hip, shC, headC, Fh, Uh, Sh, shL, shR, elL: elb(shL, -1), elR: elb(shR, 1), hL, hR, hipL, hipR, kL, kR, aL, aR, tL: toe(aL), tR: toe(aR), T };
}
const TORSO_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const TORSO_FACES = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]];
const HEAD = { A: joints(CH.A).headC, B: joints(CH.B).headC };
const EYE = { A: add(HEAD.A, [0, 0.015, 0]), B: add(HEAD.B, [0, 0.015, 0]) };

/* ---------- camera ---------- */
function makeCam(pos, target, vfov, W, H) {
  const f = norm(sub(target, pos));
  let r = cross(f, UP); if (len(r) < 1e-6) r = [1, 0, 0]; r = norm(r);
  const u = cross(r, f);
  const fpx = (H / 2) / Math.tan(rad(vfov) / 2);
  const cam = { pos, f, r, u, W, H, fpx, near: 0.03, vfov };
  cam.toCam = p => { const d = sub(p, pos); return [dot(d, r), dot(d, u), dot(d, f)]; };
  cam.pc = c => [W / 2 + c[0] / c[2] * fpx, H / 2 - c[1] / c[2] * fpx, c[2]];
  cam.proj = p => { const c = cam.toCam(p); return c[2] < cam.near ? null : cam.pc(c); };
  cam.depth = p => dot(sub(p, pos), f);
  cam.dist = p => len(sub(p, pos));
  return cam;
}

/* ---------- 2D primitives with clipping ---------- */
function clipNear(cs, n) {
  const out = [];
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i], b = cs[(i + 1) % cs.length];
    const ia = a[2] >= n, ib = b[2] >= n;
    if (ia) out.push(a);
    if (ia !== ib) { const t = (n - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, n]); }
  }
  return out;
}
function clipY(poly, y, above) {
  const out = []; const k = p => above ? p[1] >= y : p[1] <= y;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ia = k(a), ib = k(b);
    if (ia) out.push(a);
    if (ia !== ib) { const t = (y - a[1]) / (b[1] - a[1]); out.push(lerp3(a, b, t)); }
  }
  return out;
}
function polyS(cam, pts) {
  if (!pts || pts.length < 3) return null;
  const cs = clipNear(pts.map(cam.toCam), cam.near);
  return cs.length < 3 ? null : cs.map(cam.pc);
}
function segS(cam, a, b) {
  let ca = cam.toCam(a), cb = cam.toCam(b); const n = cam.near;
  if (ca[2] < n && cb[2] < n) return null;
  if (ca[2] < n) { const t = (n - ca[2]) / (cb[2] - ca[2]); ca = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, n]; }
  else if (cb[2] < n) { const t = (n - cb[2]) / (ca[2] - cb[2]); cb = [cb[0] + (ca[0] - cb[0]) * t, cb[1] + (ca[1] - cb[1]) * t, n]; }
  return [cam.pc(ca), cam.pc(cb)];
}
function path(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
function fillP(ctx, pts, color) { if (!pts || pts.length < 3) return; path(ctx, pts); ctx.fillStyle = color; ctx.fill(); }
function fillRound(ctx, pts, color, w) { if (!pts) return; path(ctx, pts); ctx.fillStyle = color; ctx.fill(); if (w > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(); } }
function hull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function hullOf(cam, verts) {
  const pts = []; for (const v of verts) { const q = cam.proj(v); if (q) pts.push(q); }
  return pts.length >= 3 ? hull2(pts) : null;
}
function ring(c, r, n, y) { const out = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([c[0] + Math.cos(a) * r, y === undefined ? c[1] : y, c[2] + Math.sin(a) * r]); } return out; }
function limb(ctx, cam, a, b, w, color, cap) {
  const s = segS(cam, a, b); if (!s) return;
  const z = cam.depth(mid(a, b)); if (z < cam.near) return;
  ctx.strokeStyle = color; ctx.lineWidth = w * cam.fpx / z; ctx.lineCap = cap || 'round';
  ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); ctx.stroke();
}
function ball(ctx, cam, p, r, color) {
  const q = cam.proj(p); if (!q) return;
  ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(0.4, r * cam.fpx / q[2]), 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function strokePts(ctx, cam, pts, w, color, closed) {
  const q = pts.map(cam.proj); if (q.some(v => !v)) return;
  const z = cam.depth(centroid(pts)); if (z < cam.near) return;
  ctx.strokeStyle = color; ctx.lineWidth = w * cam.fpx / z; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); q.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (closed) ctx.closePath(); ctx.stroke();
}
/* stroke only the part of a polyline that lies above / below a height (for painter's layering at the table top) */
function strokeSplit(ctx, cam, pts, w, color, above, y) {
  y = y === undefined ? TABLE_Y : y;
  const runs = []; let cur = [];
  const keep = p => above ? p[1] >= y : p[1] < y;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0) { const a = pts[i - 1]; if (keep(a) !== keep(p)) { const t = (y - a[1]) / (p[1] - a[1]); const m = lerp3(a, p, t); cur.push(m); if (cur.length > 1 && keep(a)) runs.push(cur); cur = [m]; } }
    if (keep(p)) cur.push(p);
  }
  if (cur.length > 1) runs.push(cur.filter(p => true));
  for (const r of runs) if (r.length > 1) strokePts(ctx, cam, r, w, color, false);
}
function splitY(verts, edges, y) {
  const lo = [], hi = [];
  for (const v of verts) (v[1] < y ? lo : hi).push(v);
  for (const [i, j] of edges) {
    const a = verts[i], b = verts[j];
    if ((a[1] < y) !== (b[1] < y)) { const t = (y - a[1]) / (b[1] - a[1]); const p = lerp3(a, b, t); lo.push(p); hi.push(p); }
  }
  return { lo, hi };
}
function boxV(c, ax, ay, az, hx, hy, hz) {
  const v = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    v.push(add(add(add(c, mul(ax, sx * hx)), mul(ay, sy * hy)), mul(az, sz * hz)));
  return v;
}
const BOX_F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
function drawBox(ctx, cam, v, colors) {
  const bc = centroid(v);
  for (const f of BOX_F) {
    const q = f.map(i => v[i]);
    const c = centroid(q);
    let n = norm(cross(sub(q[1], q[0]), sub(q[3], q[0])));
    if (dot(n, sub(c, bc)) < 0) n = mul(n, -1);
    if (dot(n, sub(cam.pos, c)) <= 0) continue;
    let col = n[1] > 0.7 ? colors.top : n[1] < -0.7 ? (colors.bottom || colors.side) : colors.side;
    if (colors.frontN && dot(n, colors.frontN) > 0.7) col = colors.front;
    else if (colors.sideB && Math.abs(n[0]) > 0.7) col = colors.sideB;
    fillP(ctx, polyS(cam, q), col);
  }
}

/* ---------- room ---------- */
const ROOM = { x0: -4, x1: 4, z0: -3.5, z1: 3.5, h: 3.0 };
const WALLS = {
  N: { o: [-4, 0, -3.5], u: [1, 0, 0], n: [0, 0, 1], L: 8, segs: [[0, 8, 'cool']], dado: 0.7 },
  S: { o: [4, 0, 3.5], u: [-1, 0, 0], n: [0, 0, -1], L: 8, segs: [[0, 8, 'warm']], dado: 1.0 },
  W: { o: [-4, 0, 3.5], u: [0, 0, -1], n: [1, 0, 0], L: 7, segs: [[0, 3.5, 'warm'], [3.5, 7, 'cool']], dado: 1.0 },
  E: { o: [4, 0, -3.5], u: [0, 0, 1], n: [-1, 0, 0], L: 7, segs: [[0, 3.5, 'cool'], [3.5, 7, 'warm']], dado: 1.0 },
};
const wp = (w, u, v, off = 0) => [w.o[0] + w.u[0] * u + w.n[0] * off, v, w.o[2] + w.u[2] * u + w.n[2] * off];
const wq = (w, u0, v0, u1, v1, off = 0) => [wp(w, u0, v0, off), wp(w, u1, v0, off), wp(w, u1, v1, off), wp(w, u0, v1, off)];
function wfill(ctx, cam, w, u0, v0, u1, v1, col, off = 0.004) { fillP(ctx, polyS(cam, wq(w, u0, v0, u1, v1, off)), col); }
function wpoly(ctx, cam, w, uv, col, off = 0.006) { fillP(ctx, polyS(cam, uv.map(([u, v]) => wp(w, u, v, off))), col); }
function wline(ctx, cam, w, u0, v0, u1, v1, col, px, off = 0.004) {
  const s = segS(cam, wp(w, u0, v0, off), wp(w, u1, v1, off)); if (!s) return;
  ctx.strokeStyle = col; ctx.lineWidth = px; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); ctx.stroke();
}
function wellipse(ctx, cam, w, uc, vc, ru, rv, col, off = 0.006, n = 30) {
  const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(wp(w, uc + Math.cos(a) * ru, vc + Math.sin(a) * rv, off)); }
  fillP(ctx, polyS(cam, pts), col);
}
function wtext(ctx, cam, w, u0, v0, u1, v1, text, font, col, glow, S, off) {
  off = off || 0.02;
  const TL = cam.proj(wp(w, u0, v1, off)), TR = cam.proj(wp(w, u1, v1, off)), BL = cam.proj(wp(w, u0, v0, off));
  if (!TL || !TR || !BL) return;
  ctx.save();
  ctx.font = font; ctx.textBaseline = 'top';
  const m = ctx.measureText(text); const tw = m.width || 1, th = parseFloat(font.match(/(\d+)px/)[1]);
  ctx.setTransform((TR[0] - TL[0]) / tw, (TR[1] - TL[1]) / tw, (BL[0] - TL[0]) / th, (BL[1] - TL[1]) / th, TL[0], TL[1]);
  if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 16 * S; ctx.fillStyle = col; ctx.fillText(text, 0, 0); ctx.shadowBlur = 6 * S; ctx.fillText(text, 0, 0); ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.fillText(text, 0, 0); }
  else { ctx.fillStyle = col; ctx.fillText(text, 0, 0); }
  ctx.restore();
}
const HANZI = '700 100px "Noto Sans HK", "Noto Sans CJK HK", "PingFang HK", sans-serif';
function wtextV(ctx, cam, w, u0, v1, size, text, col, glow, S, off) {
  [...text].forEach((ch, i) => wtext(ctx, cam, w, u0, v1 - (i + 1) * size, u0 + size, v1 - i * size, ch, HANZI, col, glow, S, off));
}

/* deterministic street scenes for the two shop windows */
const WIN = [{ u0: 0.95, u1: 3.25 }, { u0: 4.75, u1: 7.05 }];
const WIN_V0 = 0.78, WIN_V1 = 2.5;
const STREET = WIN.map((_, wi) => {
  const rnd = mulberry(21 + wi * 13); const blds = [];
  for (const layer of [0, 1]) {
    let u = -0.02;
    while (u < 1) {
      const w = (layer ? 0.16 : 0.1) + rnd() * (layer ? 0.18 : 0.14);
      const h = (layer ? 0.48 : 0.66) + rnd() * (layer ? 0.36 : 0.3);
      const wins = [];
      const cols = Math.max(2, Math.floor(w / 0.05)), rows = Math.floor(h / 0.08);
      for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) if (rnd() < (layer ? 0.42 : 0.25)) wins.push([u + (c + 0.3) * w / cols, r * 0.08, layer]);
      blds.push({ layer, u0: u, u1: Math.min(1.02, u + w), h, wins });
      u += w + 0.004;
    }
  }
  const rain = []; for (let i = 0; i < 46; i++) rain.push([rnd(), rnd(), 0.05 + rnd() * 0.07]);
  return { blds, rain };
});
const SIGNS = [
  { win: 0, u: 0.72, v: 0.7, txt: '旅店', col: PAL.neonR, size: 0.13 },
  { win: 1, u: 0.12, v: 0.72, txt: '洋服', col: PAL.neonG, size: 0.12 },
  { win: 1, u: 0.68, v: 0.6, txt: '茶樓', col: PAL.neonP, size: 0.12 },
];

function drawWallBase(ctx, cam, S, w, u0, u1, kind) {
  const dh = kind === 'cool' ? w.dado : 1.0;
  if (kind === 'cool') {
    wfill(ctx, cam, w, u0, 0, u1, ROOM.h, PAL.paint, 0);
    for (let u = u0 + 0.6; u < u1; u += 1.2) wline(ctx, cam, w, u, dh + 0.06, u, ROOM.h, PAL.paintLine, 1.1 * S);
    wfill(ctx, cam, w, u0, 0, u1, dh, PAL.tile, 0.002);
    for (let v = 0.15; v < dh - 0.01; v += 0.15) wline(ctx, cam, w, u0, v, u1, v, PAL.grout, 1 * S);
    for (let u = u0 + 0.15; u < u1; u += 0.15) wline(ctx, cam, w, u, 0.0, u, dh, PAL.grout, 1 * S);
    wfill(ctx, cam, w, u0, dh, u1, dh + 0.06, PAL.rail, 0.008);
  } else {
    wfill(ctx, cam, w, u0, 0, u1, ROOM.h, PAL.wpaint, 0);
    for (let u = u0 + 0.6; u < u1; u += 1.2) wline(ctx, cam, w, u, dh + 0.06, u, ROOM.h, PAL.wpaintLine, 1.1 * S);
    wfill(ctx, cam, w, u0, 0, u1, dh, PAL.wood, 0.002);
    for (let u = u0 + 0.45; u < u1 - 0.05; u += 0.45) { wfill(ctx, cam, w, u - 0.36, 0.14, u - 0.04, dh - 0.12, PAL.woodHi, 0.004); }
    wfill(ctx, cam, w, u0, dh, u1, dh + 0.06, PAL.rail, 0.008);
  }
  wfill(ctx, cam, w, u0, 0, u1, 0.1, PAL.woodLine, 0.006);
}

function drawWindows(ctx, cam, S, rainT) {
  const N = WALLS.N;
  WIN.forEach((win, wi) => {
    const U = u => win.u0 + (win.u1 - win.u0) * u, V = v => WIN_V0 + (WIN_V1 - WIN_V0) * v;
    const sc = STREET[wi];
    wfill(ctx, cam, N, win.u0, WIN_V0, win.u1, WIN_V1, PAL.sky2, 0.004);
    wfill(ctx, cam, N, win.u0, V(0.55), win.u1, WIN_V1, PAL.sky1, 0.0045);
    for (const b of sc.blds) {
      const top = b.h;
      wfill(ctx, cam, N, U(Math.max(0, b.u0)), V(0), U(Math.min(1, b.u1)), V(Math.min(1, top)), b.layer ? PAL.bldgNear : PAL.bldgFar, 0.005 + b.layer * 0.001);
      for (const [wu, wv] of b.wins) if (wu > 0 && wu < 0.97 && wv < Math.min(1, top) - 0.04) wfill(ctx, cam, N, U(wu), V(wv), U(wu) + 0.04, V(wv) + 0.06, b.layer ? PAL.lit : PAL.litDim, 0.0072);
    }
    // street glow at the bottom
    wfill(ctx, cam, N, win.u0, WIN_V0, win.u1, V(0.08), 'rgba(255,150,70,0.42)', 0.0075);
    // neon signs
    for (const s of SIGNS) if (s.win === wi) {
      const n = [...s.txt].length;
      wfill(ctx, cam, N, U(s.u) - 0.025, V(s.v) - n * s.size - 0.03, U(s.u) + s.size + 0.025, V(s.v) + 0.03, 'rgba(12,16,24,0.85)', 0.0078);
      wtextV(ctx, cam, N, U(s.u), V(s.v), s.size, s.txt, s.col, true, S, 0.0082);
    }
    // rain
    ctx.save(); ctx.strokeStyle = 'rgba(210,230,255,0.45)'; ctx.lineWidth = Math.max(1, 1.1 * S); ctx.lineCap = 'round';
    for (const [ru, rv, rl] of sc.rain) {
      const vv = ((rv - (rainT || 0) * 0.9) % 1 + 1) % 1;
      const a = cam.proj(wp(N, U(ru), V(vv), 0.009)), b = cam.proj(wp(N, U(ru) - 0.025, V(vv) - rl * 1.7, 0.009));
      if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    }
    ctx.restore();
    // frames: outer, mullions, transom with small panes, sill
    const t = 0.07, tv = V(0.78);
    for (const [a, b, c, d] of [[win.u0 - t, WIN_V0 - t, win.u1 + t, WIN_V0], [win.u0 - t, WIN_V1, win.u1 + t, WIN_V1 + t], [win.u0 - t, WIN_V0, win.u0, WIN_V1], [win.u1, WIN_V0, win.u1 + t, WIN_V1]]) wfill(ctx, cam, N, a, b, c, d, PAL.frame, 0.012);
    for (const f of [1 / 3, 2 / 3]) wfill(ctx, cam, N, U(f) - 0.022, WIN_V0, U(f) + 0.022, WIN_V1, PAL.frame, 0.012);
    wfill(ctx, cam, N, win.u0, tv - 0.02, win.u1, tv + 0.02, PAL.frame, 0.012);
    for (let k = 1; k < 9; k++) if (k % 3) wfill(ctx, cam, N, U(k / 9) - 0.01, tv, U(k / 9) + 0.01, WIN_V1, PAL.frameHi, 0.0115);
    wfill(ctx, cam, N, win.u0 - t - 0.05, WIN_V0 - t - 0.045, win.u1 + t + 0.05, WIN_V0 - t, PAL.rail, 0.04);
  });
}

function drawRoom(ctx, cam, S, opts) {
  const N = WALLS.N, So = WALLS.S, W = WALLS.W, E = WALLS.E;
  for (const k in WALLS) { const w = WALLS[k]; for (const [u0, u1, kind] of w.segs) drawWallBase(ctx, cam, S, w, u0, u1, kind); }
  // pillars at the split
  for (const w of [W, E]) {
    wfill(ctx, cam, w, 3.33, 0, 3.67, ROOM.h, PAL.pillar, 0.014);
    wfill(ctx, cam, w, 3.33, 0, 3.4, ROOM.h, PAL.pillarDk, 0.016);
    wfill(ctx, cam, w, 3.6, 0, 3.67, ROOM.h, PAL.pillarDk, 0.016);
  }
  drawWindows(ctx, cam, S, opts.rainT);
  // pier clock between the windows
  wellipse(ctx, cam, N, 4, 1.9, 0.22, 0.22, PAL.rail, 0.01);
  wellipse(ctx, cam, N, 4, 1.9, 0.18, 0.18, '#F6EEDA', 0.012);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; wellipse(ctx, cam, N, 4 + Math.cos(a) * 0.145, 1.9 + Math.sin(a) * 0.145, 0.012, 0.012, PAL.ink, 0.014, 8); }
  wline(ctx, cam, N, 4, 1.9, 4, 2.02, PAL.ink, 2.4 * S, 0.016);
  wline(ctx, cam, N, 4, 1.9, 4.09, 1.85, PAL.ink, 2.4 * S, 0.016);
  // west wall (cool half): hanging scroll
  const sc0 = 4.75, sc1 = 5.45;
  wline(ctx, cam, W, (sc0 + sc1) / 2, 2.68, sc0 + 0.05, 2.52, PAL.inkDark, 1.2 * S, 0.008);
  wline(ctx, cam, W, (sc0 + sc1) / 2, 2.68, sc1 - 0.05, 2.52, PAL.inkDark, 1.2 * S, 0.008);
  wfill(ctx, cam, W, sc0, 1.22, sc1, 2.52, PAL.paper, 0.01);
  wfill(ctx, cam, W, sc0, 2.36, sc1, 2.52, '#7E8B6E', 0.012);
  wfill(ctx, cam, W, sc0, 1.22, sc1, 1.32, '#7E8B6E', 0.012);
  wpoly(ctx, cam, W, [[sc0 + 0.05, 1.45], [sc0 + 0.2, 1.95], [sc0 + 0.32, 1.72], [sc0 + 0.46, 2.12], [sc1 - 0.05, 1.45]], PAL.inkMid, 0.014);
  wpoly(ctx, cam, W, [[sc0 + 0.05, 1.45], [sc0 + 0.14, 1.66], [sc0 + 0.26, 1.55], [sc0 + 0.4, 1.78], [sc1 - 0.05, 1.45]], PAL.inkDark, 0.015);
  wfill(ctx, cam, W, sc1 - 0.16, 2.18, sc1 - 0.1, 2.24, PAL.seal, 0.016);
  for (const v of [2.52, 1.22]) wfill(ctx, cam, W, sc0 - 0.04, v - 0.025, sc1 + 0.04, v + 0.025, PAL.woodLine, 0.018);
  // west wall (warm half): bottle shelves
  for (const v of [1.4, 1.92]) {
    wfill(ctx, cam, W, 0.9, v - 0.04, 2.75, v, PAL.rail, 0.04);
    const rnd = mulberry(Math.round(v * 100) + 3);
    let u = 0.98;
    while (u < 2.62) {
      const bw = 0.055 + rnd() * 0.04, bh = 0.17 + rnd() * 0.13; const c = ['#3D7A55', '#6B3B22', '#B9D6D2', '#8A2C2A', '#D9B25A'][Math.floor(rnd() * 5)];
      wfill(ctx, cam, W, u, v, u + bw, v + bh, c, 0.05);
      wfill(ctx, cam, W, u + bw * 0.32, v + bh, u + bw * 0.68, v + bh + 0.07, c, 0.05);
      wfill(ctx, cam, W, u + 0.008, v + bh * 0.3, u + bw - 0.008, v + bh * 0.6, '#EFE3C4', 0.052);
      u += bw + 0.025 + (rnd() < 0.12 ? 0.1 : 0);
    }
  }
  // east wall (cool half): oval mirror + sconce
  wellipse(ctx, cam, E, 1.75, 1.75, 0.5, 0.42, PAL.gold, 0.01);
  wellipse(ctx, cam, E, 1.75, 1.75, 0.44, 0.36, PAL.mirror, 0.012);
  wpoly(ctx, cam, E, [[1.45, 1.55], [1.62, 1.55], [1.95, 2.02], [1.8, 2.04]], 'rgba(255,255,255,0.14)', 0.014);
  wfill(ctx, cam, E, 0.52, 1.82, 0.62, 1.86, PAL.gold, 0.02);
  wpoly(ctx, cam, E, [[0.45, 1.86], [0.69, 1.86], [0.64, 2.05], [0.5, 2.05]], '#F4E2B6', 0.04);
  // east wall (warm half): door with frosted glass + mirrored lettering
  wfill(ctx, cam, E, 4.35, 0, 5.45, 2.2, PAL.woodLine, 0.006);
  wfill(ctx, cam, E, 4.42, 0, 5.38, 2.14, PAL.wood, 0.008);
  wfill(ctx, cam, E, 4.55, 1.2, 5.25, 1.98, 'rgba(225,238,236,0.86)', 0.01);
  wtext(ctx, cam, E, 5.15, 1.45, 4.65, 1.75, '冰室', HANZI, '#B48A3C', false, S, 0.012);
  wfill(ctx, cam, E, 4.55, 0.18, 5.25, 1.0, PAL.woodHi, 0.01);
  wellipse(ctx, cam, E, 5.25, 1.05, 0.035, 0.035, PAL.gold, 0.03, 12);
  // south wall: neon + menu boards
  wfill(ctx, cam, So, 1.3, 1.72, 2.3, 2.24, 'rgba(20,10,10,0.55)', 0.008);
  wtext(ctx, cam, So, 1.38, 1.78, 2.22, 2.18, '冰室', HANZI, PAL.neonP, true, S, 0.012);
  const menu = [['咖啡', 2.35], ['奶茶', 2.65], ['檸茶', 2.95], ['多士', 4.85], ['紅豆冰', 5.15], ['西餅', 5.45]];
  for (const [t, u] of menu) {
    const n = [...t].length, top = 2.12, h = 0.17 * n + 0.08;
    wfill(ctx, cam, So, u - 0.015, top - h - 0.015, u + 0.235, top + 0.015, PAL.rail, 0.01);
    wfill(ctx, cam, So, u, top - h, u + 0.22, top, PAL.board, 0.012);
    wtextV(ctx, cam, So, u + 0.035, top - 0.04, 0.15, t, PAL.boardInk, false, S, 0.014);
  }
  // floor: checker tiles
  fillP(ctx, polyS(cam, [[-4, 0, -3.5], [4, 0, -3.5], [4, 0, 3.5], [-4, 0, 3.5]]), PAL.floorA);
  const T = 0.5;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 14; j++) {
    if ((i + j) % 2) continue;
    const x0 = -4 + i * T, z0 = -3.5 + j * T;
    fillP(ctx, polyS(cam, [[x0, 0.001, z0], [x0 + T, 0.001, z0], [x0 + T, 0.001, z0 + T], [x0, 0.001, z0 + T]]), PAL.floorB);
  }
  // zones and tape
  if (opts.zones) {
    const s = opts.refSide || 1;
    fillP(ctx, polyS(cam, [[-4, 0.004, 0], [4, 0.004, 0], [4, 0.004, 3.5 * s], [-4, 0.004, 3.5 * s]]), 'rgba(47,200,120,0.22)');
    fillP(ctx, polyS(cam, [[-4, 0.004, 0], [4, 0.004, 0], [4, 0.004, -3.5 * s], [-4, 0.004, -3.5 * s]]), 'rgba(240,70,75,0.22)');
  }
  if (opts.tape !== false) fillP(ctx, polyS(cam, [[-4, 0.005, -0.03], [4, 0.005, -0.03], [4, 0.005, 0.03], [-4, 0.005, 0.03]]), PAL.axis);
  // contact shadows
  for (const [c, r] of [[[0, 0, 0], 0.36], [[-1.02, 0, 0], 0.33], [[1.02, 0, 0], 0.33], [[2.75, 0, 2.35], 0.38], [[-2.75, 0, 2.45], 0.38], [[3.62, 0, 2.3], 0.18]])
    fillP(ctx, polyS(cam, ring(add(c, [0, 0.006, 0]), r, 24)), PAL.shadow);
  // table light pool on the floor
  fillP(ctx, polyS(cam, ring([0, 0.007, 0], 1.25, 36)), 'rgba(255,214,140,0.14)');
}

/* ---------- props ---------- */
const VEINS = [[[-0.3, 0.12], [-0.12, 0.05], [0.05, 0.1], [0.24, -0.02]], [[-0.2, -0.25], [-0.05, -0.12], [0.1, -0.2], [0.3, -0.12]], [[0.12, 0.3], [0.18, 0.15], [0.32, 0.12]]];
function drawTableTop(ctx, cam) {
  const top = ring([0, TABLE.y, 0], TABLE.r, 48), bot = ring([0, TABLE.y - TABLE.th, 0], TABLE.r * 0.985, 48);
  fillP(ctx, hullOf(cam, top.concat(bot)), PAL.marbleEdge);
  const tp = polyS(cam, top); if (!tp) return;
  fillP(ctx, tp, PAL.marble);
  ctx.save(); path(ctx, tp); ctx.clip();
  for (const v of VEINS) { const pts = v.map(([x, z]) => [x, TABLE.y + 0.001, z]); strokePts(ctx, cam, pts, 0.004, PAL.vein, false); }
  ctx.restore();
}
function tableBaseItem(cam, low) {
  low.push({ d: cam.dist([0, 0.35, 0]), draw: c => {
    for (const a of [90, 210, 330]) { const d = [Math.cos(rad(a)), 0, Math.sin(rad(a))]; strokePts(c, cam, [[0, 0.1, 0], add(mul(d, 0.16), [0, 0.04, 0]), add(mul(d, 0.27), [0, 0.012, 0])], 0.03, PAL.iron, false); }
    limb(c, cam, [0, 0.08, 0], [0, TABLE.y - TABLE.th, 0], 0.055, PAL.iron);
    fillP(c, hullOf(cam, ring([0, 0.46, 0], 0.045, 12).concat(ring([0, 0.4, 0], 0.045, 12))), PAL.iron);
    fillP(c, hullOf(cam, ring([0, 0.735, 0], 0.11, 14).concat(ring([0, 0.7, 0], 0.06, 14))), PAL.iron);
  } });
}
function cupItem(cam, pos, out) {
  out.push({ d: cam.dist(pos), draw: ctx => {
    fillP(ctx, polyS(cam, ring(add(pos, [0, 0.004, 0]), 0.078, 22)), '#DCD5C8');
    const sau = polyS(cam, ring(add(pos, [0, 0.008, 0]), 0.072, 22)); fillP(ctx, sau, PAL.cup);
    if (sau) { path(ctx, polyS(cam, ring(add(pos, [0, 0.009, 0]), 0.064, 22))); ctx.strokeStyle = PAL.cupRim; ctx.lineWidth = Math.max(0.8, 0.005 * cam.fpx / cam.depth(pos)); ctx.stroke(); }
    fillP(ctx, hullOf(cam, ring(add(pos, [0, 0.01, 0]), 0.032, 16).concat(ring(add(pos, [0, 0.082, 0]), 0.044, 16))), '#F3F0E8');
    fillP(ctx, hullOf(cam, ring(add(pos, [0, 0.066, 0]), 0.0415, 16).concat(ring(add(pos, [0, 0.074, 0]), 0.043, 16))), PAL.cupRim);
    strokePts(ctx, cam, [add(pos, [0.04, 0.07, 0]), add(pos, [0.064, 0.064, 0]), add(pos, [0.062, 0.035, 0]), add(pos, [0.038, 0.03, 0])], 0.008, '#ECE7DD', false);
    fillP(ctx, polyS(cam, ring(add(pos, [0, 0.083, 0]), 0.044, 18)), PAL.cup);
    fillP(ctx, polyS(cam, ring(add(pos, [0, 0.084, 0]), 0.037, 18)), PAL.coffee);
  } });
}
function tableProps(cam, high) {
  // sugar jar
  const sj = [-0.02, TABLE.y, -0.2];
  high.push({ d: cam.dist(sj), draw: c => {
    fillP(c, hullOf(cam, ring(sj, 0.035, 14).concat(ring(add(sj, [0, 0.11, 0]), 0.035, 14))), 'rgba(205,230,235,0.75)');
    fillP(c, hullOf(cam, ring(sj, 0.033, 14).concat(ring(add(sj, [0, 0.055, 0]), 0.033, 14))), '#FFFFFF');
    fillP(c, hullOf(cam, ring(add(sj, [0, 0.11, 0]), 0.037, 14).concat(ring(add(sj, [0, 0.15, 0]), 0.022, 14))), PAL.metal);
  } });
  // handbag
  const hb = [0.2, TABLE.y + 0.052, -0.27];
  high.push({ d: cam.dist(hb), draw: c => {
    drawBox(c, cam, boxV(hb, [1, 0, 0], UP, [0, 0, 1], 0.09, 0.05, 0.035), { top: '#E3CDA6', side: '#CDB088', sideB: '#BB9C74' });
    strokePts(c, cam, [add(hb, [-0.05, 0.05, 0]), add(hb, [-0.03, 0.1, 0]), add(hb, [0.03, 0.1, 0]), add(hb, [0.05, 0.05, 0])], 0.008, '#8C6A44', false);
    ball(c, cam, add(hb, [0, 0.035, -0.037]), 0.009, PAL.gold);
    ball(c, cam, add(hb, [0, 0.035, 0.037]), 0.009, PAL.gold);
  } });
}
function chairItems(cam, ch, low, high) {
  const F = ch.F, S = ch.S, b = ch.base;
  const cc = add(madd(b, F, -0.03), [0, 0.46, 0]);
  const back = madd(cc, F, -0.185);
  const arch = (w, h, n) => { const pts = []; for (let i = 0; i <= n; i++) { const th = Math.PI * i / n; pts.push(add(add(back, mul(S, w * Math.cos(th))), [0, h * Math.sin(th), 0])); } return pts; };
  const outer = arch(0.17, 0.54, 16), inner = arch(0.1, 0.37, 12);
  const legs = [45, 135, 225, 315].map(a => { const r = rad(a); const dir = add(mul(F, Math.cos(r)), mul(S, Math.sin(r))); const top = madd(add(cc, [0, -0.03, 0]), dir, 0.16); return [top, madd([top[0], 0, top[2]], dir, 0.05)]; });
  low.push({ d: cam.dist(cc), draw: ctx => {
    for (const [t, bt] of legs) limb(ctx, cam, t, bt, 0.028, PAL.chair);
    strokePts(ctx, cam, ring(add(cc, [0, -0.27, 0]), 0.165, 20), 0.014, PAL.chairDk, true);
    fillP(ctx, hullOf(cam, ring(cc, 0.205, 20).concat(ring(add(cc, [0, -0.035, 0]), 0.2, 20))), PAL.chairDk);
    fillP(ctx, polyS(cam, ring(cc, 0.205, 20)), PAL.chairHi);
    strokeSplit(ctx, cam, outer, 0.03, PAL.chair, false);
    strokeSplit(ctx, cam, inner, 0.022, PAL.chair, false);
  } });
  high.push({ d: cam.dist(add(back, [0, 0.35, 0])), draw: ctx => {
    strokeSplit(ctx, cam, outer, 0.03, PAL.chair, true);
    strokeSplit(ctx, cam, inner, 0.022, PAL.chair, true);
  } });
}
function lampItem(cam, high) {
  high.push({ d: cam.dist([0, 1.85, 0]) + 0.05, draw: ctx => {
    limb(ctx, cam, [0, 3.0, 0], [0, 1.97, 0], 0.01, '#1C1C1C');
    fillP(ctx, hullOf(cam, ring([0, 1.98, 0], 0.05, 16).concat(ring([0, 1.75, 0], 0.25, 28))), PAL.lampOut);
    strokePts(ctx, cam, ring([0, 1.752, 0], 0.25, 28), 0.012, '#E7E0C8', true);
    if (cam.pos[1] < 1.75) { fillP(ctx, polyS(cam, ring([0, 1.749, 0], 0.235, 28)), PAL.lampIn); ball(ctx, cam, [0, 1.78, 0], 0.042, PAL.bulb); }
  } });
}
function standItem(cam, base, high) {
  const aim = norm(sub([0, 1.2, 0], add(base, [0, 1.95, 0])));
  const ah = norm([aim[0], 0, aim[2]]);
  const right = norm(cross(ah, UP));
  high.push({ d: cam.dist(add(base, [0, 1, 0])), draw: ctx => {
    const hub = add(base, [0, 0.55, 0]);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; limb(ctx, cam, hub, add(base, [Math.cos(a) * 0.38, 0.01, Math.sin(a) * 0.38]), 0.022, PAL.stand); }
    limb(ctx, cam, add(base, [0, 0.4, 0]), add(base, [0, 1.95, 0]), 0.03, PAL.stand);
    const c = madd(add(base, [0, 1.95, 0]), ah, 0.05);
    drawBox(ctx, cam, boxV(c, right, UP, ah, 0.33, 0.33, 0.14), { top: '#35383C', side: '#2A2C30', front: PAL.softbox, frontN: ah });
  } });
}
function umbrellaItem(cam, base, high) {
  high.push({ d: cam.dist(add(base, [0, 0.4, 0])), draw: ctx => {
    fillP(ctx, hullOf(cam, ring(base, 0.12, 16).concat(ring(add(base, [0, 0.5, 0]), 0.13, 16))), '#2F4F44');
    fillP(ctx, polyS(cam, ring(add(base, [0, 0.5, 0]), 0.13, 16)), '#1D332B');
    for (const [dx, dz, col] of [[-0.03, 0.02, '#1B1B1E'], [0.04, -0.02, '#8A2B2B']]) {
      const s0 = add(base, [dx, 0.45, dz]), s1 = add(base, [dx * 2.5, 1.0, dz * 2.5]);
      fillP(ctx, hullOf(cam, [add(s0, [0.05, 0, 0.05]), add(s0, [-0.05, 0, -0.05]), add(s0, [0.05, 0, -0.05]), add(s0, [-0.05, 0, 0.05]), s1]), col);
      strokePts(ctx, cam, [s1, add(s1, [0, 0.09, 0]), add(s1, [0.04, 0.12, 0]), add(s1, [0.07, 0.09, 0])], 0.014, '#6B4428', false);
    }
  } });
}
function counterItem(cam, low) {
  const c = [0, 0.5, 3.22];
  low.push({ d: cam.dist(c) + 0.3, draw: ctx => {
    drawBox(ctx, cam, boxV(c, [1, 0, 0], UP, [0, 0, 1], 1.9, 0.5, 0.28), { top: PAL.counterTop, side: PAL.wood });
    // front panels (face at z = 2.94)
    if (cam.pos[2] < 2.94) for (let x = -1.8; x < 1.8; x += 0.45) fillP(ctx, polyS(cam, [[x + 0.05, 0.14, 2.938], [x + 0.4, 0.14, 2.938], [x + 0.4, 0.86, 2.938], [x + 0.05, 0.86, 2.938]]), PAL.woodHi);
    drawBox(ctx, cam, boxV([0, 1.015, 3.2], [1, 0, 0], UP, [0, 0, 1], 1.95, 0.02, 0.31), { top: PAL.counterTop, side: '#CDBEA3' });
    // display case with jars
    for (let i = 0; i < 5; i++) {
      const p = [-1.5 + i * 0.24, 1.035, 3.24];
      fillP(ctx, hullOf(cam, ring(p, 0.07, 12).concat(ring(add(p, [0, 0.2, 0]), 0.07, 12))), 'rgba(235,245,240,0.6)');
      fillP(ctx, hullOf(cam, ring(p, 0.066, 12).concat(ring(add(p, [0, 0.12, 0]), 0.066, 12))), ['#E2574C', '#F2C14E', '#7CC29B', '#E98FB3', '#8E6A4E'][i]);
      fillP(ctx, hullOf(cam, ring(add(p, [0, 0.2, 0]), 0.074, 12).concat(ring(add(p, [0, 0.235, 0]), 0.07, 12))), PAL.metal);
    }
    drawBox(ctx, cam, boxV([-1.02, 1.21, 3.24], [1, 0, 0], UP, [0, 0, 1], 0.62, 0.175, 0.22), { top: PAL.glassF, side: PAL.glassF });
    // cash register
    drawBox(ctx, cam, boxV([0.45, 1.17, 3.25], [1, 0, 0], UP, [0, 0, 1], 0.22, 0.14, 0.17), { top: PAL.metal, side: PAL.metalDk });
    drawBox(ctx, cam, boxV([0.45, 1.36, 3.33], [1, 0, 0], UP, [0, 0, 1], 0.16, 0.06, 0.05), { top: '#2E2E2E', side: '#3A3A3A' });
    // phone
    drawBox(ctx, cam, boxV([1.08, 1.09, 3.2], [1, 0, 0], UP, [0, 0, 1], 0.1, 0.055, 0.1), { top: PAL.phone, side: '#8A2322' });
    limb(ctx, cam, [1.0, 1.17, 3.2], [1.16, 1.17, 3.2], 0.04, '#1E1E1E');
    // radio
    drawBox(ctx, cam, boxV([1.55, 1.15, 3.25], [1, 0, 0], UP, [0, 0, 1], 0.2, 0.12, 0.12), { top: '#7A4E33', side: '#5C3925' });
    if (cam.pos[2] < 3.13) { fillP(ctx, polyS(cam, ring([1.5, 1.15, 3.128], 0.07, 14).map(p => [p[0], 1.15 + (p[2] - 3.128), 3.128])), '#E7D7B4'); }
  } });
}

/* ---------- characters ---------- */
function capRegion(cam, Hc, R, axis, alpha, P) {
  const ca = Math.cos(alpha), sa = Math.sin(alpha);
  let e1 = cross(axis, UP); if (len(e1) < 1e-4) e1 = cross(axis, [1, 0, 0]); e1 = norm(e1);
  const e2 = cross(axis, e1);
  const N = 40, cap = [];
  for (let i = 0; i < N; i++) {
    const th = i / N * Math.PI * 2;
    const d = add(mul(axis, ca), add(mul(e1, sa * Math.cos(th)), mul(e2, sa * Math.sin(th))));
    const p = madd(Hc, d, R);
    cap.push({ p, v: dot(d, sub(cam.pos, p)) > 0 });
  }
  if (cap.every(c => !c.v)) return null;
  if (cap.every(c => c.v)) return cap.map(c => P(c.p)).filter(Boolean);
  let s = 0; for (let i = 0; i < N; i++) if (cap[i].v && !cap[(i - 1 + N) % N].v) { s = i; break; }
  const arc = []; for (let j = 0; j < N; j++) { const c = cap[(s + j) % N]; if (!c.v) break; arc.push(c.p); }
  const v = norm(sub(cam.pos, Hc));
  let w1 = cross(v, UP); if (len(w1) < 1e-4) w1 = cross(v, [1, 0, 0]); w1 = norm(w1);
  const w2 = cross(v, w1);
  const M = 56, sil = [];
  for (let i = 0; i < M; i++) { const ph = i / M * Math.PI * 2; const d = add(mul(w1, Math.cos(ph)), mul(w2, Math.sin(ph))); sil.push({ p: madd(Hc, d, R), in: dot(d, axis) > ca }); }
  let s2 = -1; for (let i = 0; i < M; i++) if (sil[i].in && !sil[(i - 1 + M) % M].in) { s2 = i; break; }
  const run = []; if (s2 >= 0) for (let j = 0; j < M; j++) { const c = sil[(s2 + j) % M]; if (!c.in) break; run.push(c.p); }
  const A = arc.map(P).filter(Boolean); if (A.length < 2) return null;
  let Rn = run.map(P).filter(Boolean);
  if (Rn.length) { const e = A[A.length - 1]; const d0 = (Rn[0][0] - e[0]) ** 2 + (Rn[0][1] - e[1]) ** 2, d1 = (Rn[Rn.length - 1][0] - e[0]) ** 2 + (Rn[Rn.length - 1][1] - e[1]) ** 2; if (d1 < d0) Rn.reverse(); }
  return A.concat(Rn);
}

function drawHead(ctx, cam, ch, J, pose) {
  const Hc = J.headC, R = HEAD_R, col = ch.col, woman = ch.style === 'woman';
  const pc = cam.proj(Hc); if (!pc) return;
  const k = cam.fpx / pc[2];
  const SY = 1.07;
  const P = p => { const q = cam.proj(p); return q ? [q[0], pc[1] + (q[1] - pc[1]) * SY] : null; };
  const v = norm(sub(cam.pos, Hc));
  const { Fh, Uh, Sh } = J;
  const facing = d => { const p = madd(Hc, d, R); return dot(d, norm(sub(cam.pos, p))); };
  const dirOf = (f, u, s) => norm(add(add(mul(Fh, f), mul(Uh, u)), mul(Sh, s)));
  const blink = pose.blink || 0, mouth = pose.mouth || 0;
  const headPath = () => { ctx.beginPath(); ctx.ellipse(pc[0], pc[1], R * k, R * k * SY, 0, 0, Math.PI * 2); };
  // hair volume behind the head
  ctx.fillStyle = col.hair;
  let hvp = null;
  if (woman) {
    const hv = P(add(add(Hc, mul(Uh, -0.03)), mul(Fh, -0.022)));
    if (hv) { hvp = [hv[0], hv[1], R * k * 1.2, R * k * SY * 1.1]; }
  } else {
    const hv = P(add(add(Hc, mul(Uh, 0.016)), mul(Fh, -0.014)));
    if (hv) { hvp = [hv[0], hv[1], R * k * 1.06, R * k * SY * 1.05]; }
  }
  if (hvp) { ctx.beginPath(); ctx.ellipse(hvp[0], hvp[1], hvp[2], hvp[3], 0, 0, Math.PI * 2); ctx.fill(); }
  headPath(); ctx.fill();
  // face cap
  const Fc = norm(add(mul(Fh, Math.cos(woman ? 0.4 : 0.34)), mul(Uh, -Math.sin(woman ? 0.4 : 0.34))));
  const face = capRegion(cam, Hc, R, Fc, rad(woman ? 66 : 69), P);
  ctx.save(); headPath(); ctx.clip();
  if (face && face.length > 2) { path(ctx, face); ctx.fillStyle = col.skin; ctx.fill(); }
  // lamp shading: the half of the head turned away from the lamp
  const Lh = norm(sub(LAMP, Hc));
  const shade = capRegion(cam, Hc, R, mul(Lh, -1), rad(90), P);
  if (shade && shade.length > 2) { path(ctx, shade); ctx.fillStyle = 'rgba(48,22,36,0.22)'; ctx.fill(); }
  // cheeks
  if (woman) for (const s of [-1, 1]) {
    const d = dirOf(0.74, -0.3, 0.5 * s), f = facing(d);
    if (f > 0.2) { const q = P(madd(Hc, d, R)); if (q) { ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.02 * k * clamp(f, 0.4, 1), 0.013 * k, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(226,104,104,0.26)'; ctx.fill(); } }
  }
  // eyes (white + pupil looking at the other character + highlight), brows, lashes
  const look = pose.lookAt || EYE[ch.id === 'A' ? 'B' : 'A'];
  for (const s of [-1, 1]) {
    const d = dirOf(0.88, 0.12, 0.4 * s), f = facing(d);
    if (f <= 0.08) continue;
    const pe = madd(Hc, d, R), q = P(pe); if (!q) continue;
    const fx = clamp(f * 1.2, 0.3, 1);
    const ex = 0.02 * k * fx, ey = Math.max(0.6, 0.022 * k * (1 - blink * 0.9));
    ctx.beginPath(); ctx.ellipse(q[0], q[1], ex, ey, 0, 0, Math.PI * 2); ctx.fillStyle = '#FFFDF7'; ctx.fill();
    if (blink < 0.7) {
      const g = norm(sub(look, pe)), q2 = P(madd(pe, g, 0.25));
      let ox = 0, oy = 0;
      if (q2) { const vx = q2[0] - q[0], vy = q2[1] - q[1], vl = Math.hypot(vx, vy) || 1; const sinT = Math.sqrt(Math.max(0, 1 - dot(g, norm(sub(cam.pos, pe))) ** 2)); ox = vx / vl * sinT * ex * 0.55; oy = vy / vl * sinT * ey * 0.4; }
      ctx.save(); ctx.beginPath(); ctx.ellipse(q[0], q[1], ex, ey, 0, 0, Math.PI * 2); ctx.clip();
      ctx.beginPath(); ctx.ellipse(q[0] + ox, q[1] + oy, 0.0125 * k * fx, 0.0135 * k, 0, 0, Math.PI * 2); ctx.fillStyle = '#20160F'; ctx.fill();
      ctx.beginPath(); ctx.arc(q[0] + ox - 0.004 * k, q[1] + oy - 0.005 * k, Math.max(0.5, 0.004 * k), 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.restore();
    }
    // upper lid line
    ctx.strokeStyle = woman ? '#1A100C' : 'rgba(40,24,18,0.75)'; ctx.lineWidth = (woman ? 0.0065 : 0.004) * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(q[0], q[1], ex * 1.04, ey * 1.04, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    if (woman && f > 0.3) { const outer = q[0] + s * 0 + (dot(Sh, cam.r) * s > 0 ? 1 : -1) * ex * 0.95; ctx.beginPath(); ctx.moveTo(outer, q[1] - ey * 0.4); ctx.lineTo(outer + (outer > q[0] ? 1 : -1) * 0.012 * k, q[1] - ey * 0.95); ctx.stroke(); }
    const db = dirOf(0.8, 0.42 + (pose.brow || 0), 0.42 * s), qb = P(madd(Hc, db, R));
    if (qb && f > 0.25) {
      const bw = 0.021 * k * clamp(f, 0.3, 1); const tilt = pose.worry ? s * 0.005 * k * (dot(Sh, cam.r) > 0 ? 1 : -1) : 0;
      ctx.strokeStyle = col.brow; ctx.lineWidth = (woman ? 0.0065 : 0.011) * k;
      ctx.beginPath(); ctx.moveTo(qb[0] - bw, qb[1] + tilt + (woman ? 0.002 * k : 0)); ctx.quadraticCurveTo(qb[0], qb[1] - (woman ? 0.008 : 0.003) * k, qb[0] + bw, qb[1] - tilt + (woman ? 0.002 * k : 0)); ctx.stroke();
    }
  }
  // mouth
  {
    const d = dirOf(0.84, -0.54, 0), f = facing(d);
    if (f > 0.12) {
      const q = P(madd(Hc, d, R));
      if (q) {
        const w = (woman ? 0.034 : 0.03) * k * clamp(f * 1.15, 0.3, 1), h = ((woman ? 0.008 : 0.004) + 0.02 * mouth) * k;
        ctx.beginPath(); ctx.ellipse(q[0], q[1], w / 2, Math.max(0.7, h / 2), 0, 0, Math.PI * 2); ctx.fillStyle = col.mouth; ctx.fill();
      }
    }
  }
  // woman: side-swept fringe over the forehead
  if (woman) {
    const d = dirOf(0.6, 0.66, 0.42), q = P(madd(Hc, d, R * 1.02));
    if (q && dot(d, v) > -0.2) { ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.075 * k, 0.036 * k, -0.35 * Math.sign(dot(Sh, cam.r) || 1), 0, Math.PI * 2); ctx.fillStyle = col.hair; ctx.fill(); }
  }
  ctx.restore();
  // ears (+ pearl earrings)
  for (const s of [-1, 1]) {
    const d = dirOf(-0.1, -0.08, 0.965 * s);
    if (dot(d, v) > -0.18) {
      const q = P(madd(Hc, d, R * 0.98));
      if (q) {
        if (!woman || dot(d, v) > 0.25) { ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.02 * k, 0.03 * k, 0, 0, Math.PI * 2); ctx.fillStyle = col.skin; ctx.fill(); ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.009 * k, 0.016 * k, 0, 0, Math.PI * 2); ctx.fillStyle = col.skinDk; ctx.fill(); }
        if (woman) { ctx.beginPath(); ctx.arc(q[0], q[1] + 0.034 * k, Math.max(0.6, 0.011 * k), 0, Math.PI * 2); ctx.fillStyle = col.pearl; ctx.fill(); }
      }
    }
  }
  // nose (can poke out of the silhouette in profile)
  {
    const d = dirOf(0.97, -0.22, 0), p = madd(Hc, d, R * 1.1), q = P(p);
    if (q) {
      const outside = Math.hypot(q[0] - pc[0], (q[1] - pc[1]) / SY) > R * k * 0.98;
      if (dot(d, v) > 0 || outside) { ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.017 * k, 0.015 * k, 0, 0, Math.PI * 2); ctx.fillStyle = outside ? col.skin : col.skinDk; ctx.fill(); }
    }
  }
  // man: slick pompadour + side part + shine
  if (!woman) {
    const d = dirOf(0.48, 0.88, 0.05), q = P(madd(Hc, d, R * 1.03));
    if (q) { ctx.beginPath(); ctx.ellipse(q[0], q[1], 0.06 * k, 0.034 * k, 0, 0, Math.PI * 2); ctx.fillStyle = col.hair; ctx.fill(); }
    const shine = []; for (let i = 0; i <= 6; i++) { const t = i / 6; const dd = dirOf(0.5 - 1.15 * t, 0.86, 0.24); if (dot(dd, v) > 0.05) shine.push(P(madd(Hc, dd, R * 1.04))); }
    if (shine.length > 1 && shine.every(Boolean)) { ctx.strokeStyle = col.hairHi; ctx.globalAlpha = 0.8; ctx.lineWidth = 0.009 * k; ctx.lineCap = 'round'; ctx.beginPath(); shine.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.globalAlpha = 1; }
  } else {
    const shine = []; for (let i = 0; i <= 6; i++) { const t = i / 6; const dd = dirOf(0.3 - 1.0 * t, 0.9, -0.28); if (dot(dd, v) > 0.05) shine.push(P(madd(Hc, dd, R * 1.08))); }
    if (shine.length > 1 && shine.every(Boolean)) { ctx.strokeStyle = col.hairHi; ctx.globalAlpha = 0.8; ctx.lineWidth = 0.012 * k; ctx.lineCap = 'round'; ctx.beginPath(); shine.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.globalAlpha = 1; }
  }
}

function charItems(cam, ch, pose, low, high) {
  const J = joints(ch, pose);
  const col = ch.col, woman = ch.style === 'woman', F = ch.F, S = ch.S, B = ch.build;
  const { lo, hi } = splitY(J.T, TORSO_EDGES, TABLE_Y);
  const front = (t, s) => add(madd(lerp3(J.hip, J.shC, t), F, B.dep + 0.004), mul(S, s));
  const backP = (t, s) => add(madd(lerp3(J.hip, J.shC, t), F, -B.dep - 0.004), mul(S, s));
  const visFront = dot(F, norm(sub(cam.pos, J.shC))) > 0.04;
  const above = pts => clipY(pts, TABLE_Y + 0.004, true);
  low.push({ d: cam.dist(J.hip), draw: ctx => {
    const dHip = cam.depth(J.hip);
    const legs = [[J.hipL, J.kL, J.aL, J.tL], [J.hipR, J.kR, J.aR, J.tR]];
    const order = cam.depth(legs[0][1]) > cam.depth(legs[1][1]) ? [0, 1] : [1, 0];
    const thighFront = cam.depth(mid(J.kL, J.kR)) < dHip;
    const lowerTorso = () => { const h = hullOf(cam, lo); if (h) fillRound(ctx, h, col.top, 0.04 * cam.fpx / Math.max(dHip, 0.1)); };
    if (thighFront) lowerTorso();
    order.forEach((i, n) => {
      const L = legs[i]; const pcol = n === 0 ? col.pantsDk : col.pants;
      limb(ctx, cam, L[0], L[1], woman ? 0.13 : 0.14, pcol);
      if (woman) { limb(ctx, cam, L[1], lerp3(L[1], L[2], 0.25), 0.115, pcol); limb(ctx, cam, lerp3(L[1], L[2], 0.22), L[2], 0.085, col.leg); }
      else limb(ctx, cam, L[1], L[2], 0.11, pcol);
      limb(ctx, cam, L[2], L[3], woman ? 0.07 : 0.085, col.shoe);
    });
    if (!thighFront) lowerTorso();
  } });
  const tc = centroid(hi);
  high.push({ d: cam.dist(tc), draw: ctx => {
    const dT = cam.depth(tc), kT = cam.fpx / Math.max(dT, 0.1);
    const arms = [{ s: J.shL, e: J.elL, h: J.hL, side: -1 }, { s: J.shR, e: J.elR, h: J.hR, side: 1 }];
    for (const a of arms) { a.d = cam.depth(centroid([a.s, a.e, a.h])); a.far = a.d > dT; }
    const drawArm = a => {
      const c = a.far ? col.topDk : col.top, sk = a.far ? col.skinDk : col.skin;
      if (woman) {
        const capEnd = lerp3(a.s, a.e, 0.32);
        limb(ctx, cam, capEnd, a.e, 0.078, sk); limb(ctx, cam, a.e, a.h, 0.07, sk);
        limb(ctx, cam, a.s, capEnd, 0.1, c);
        if (a.side > 0) limb(ctx, cam, lerp3(a.e, a.h, 0.82), lerp3(a.e, a.h, 0.86), 0.075, PAL.gold, 'butt');
      } else {
        limb(ctx, cam, a.s, a.e, 0.102, c); limb(ctx, cam, a.e, lerp3(a.e, a.h, 0.84), 0.09, c);
        limb(ctx, cam, lerp3(a.e, a.h, 0.82), lerp3(a.e, a.h, 0.93), 0.074, col.shirt, 'butt');
      }
      ball(ctx, cam, a.h, woman ? 0.038 : 0.044, sk);
    };
    arms.filter(a => a.far).sort((x, y) => y.d - x.d).forEach(drawArm);
    limb(ctx, cam, J.shC, madd(J.headC, J.Uh, -0.07), woman ? 0.07 : 0.082, col.skinDk);
    const h = hullOf(cam, hi); if (h) fillRound(ctx, h, col.top, 0.05 * kT);
    // lamp shading on the torso faces turned away from the lamp
    const tcen = centroid(J.T);
    for (const f of TORSO_FACES) {
      let q = f.map(i => J.T[i]); const c = centroid(q);
      let n = norm(cross(sub(q[1], q[0]), sub(q[3], q[0]))); if (dot(n, sub(c, tcen)) < 0) n = mul(n, -1);
      if (dot(n, sub(cam.pos, c)) <= 0) continue;
      const lit = dot(n, norm(sub(LAMP, c)));
      if (lit < 0.05) { q = above(q); fillP(ctx, polyS(cam, q), `rgba(28,14,30,${clamp(0.1 + (0.05 - lit) * 0.3, 0.1, 0.3).toFixed(3)})`); }
    }
    if (woman) {
      // cheongsam pattern dots
      const rnd = mulberry(5);
      for (let i = 0; i < 34; i++) {
        const t = 0.6 + rnd() * 0.38, s = (rnd() - 0.5) * 2 * (B.sh - 0.02), onFront = rnd() < 0.6;
        const p = onFront ? front(t, s) : backP(t, s);
        const n = onFront ? F : mul(F, -1);
        const r = 0.0045 + rnd() * 0.004, big = rnd() < 0.35;
        if (p[1] < TABLE_Y + 0.01 || dot(n, sub(cam.pos, p)) <= 0) continue;
        if (big) { for (let a = 0; a < 5; a++) { const ang = a / 5 * Math.PI * 2; ball(ctx, cam, add(p, add(mul(S, Math.cos(ang) * 0.009), [0, Math.sin(ang) * 0.009, 0])), 0.0045, col.pattern); } ball(ctx, cam, p, 0.004, col.piping); }
        else ball(ctx, cam, p, r, col.pattern);
      }
      if (visFront) {
        // mandarin collar, diagonal piping and frog buttons
        const nb = add(J.shC, [0, 0.03, 0]);
        fillP(ctx, hullOf(cam, ring(nb, 0.058, 16).concat(ring(add(nb, [0, 0.055, 0]), 0.054, 16))), col.top);
        const topRing = ring(add(nb, [0, 0.055, 0]), 0.055, 16).filter(p => dot(sub(p, nb), F) > -0.01);
        strokePts(ctx, cam, topRing.sort((a, b) => dot(sub(a, nb), S) - dot(sub(b, nb), S)), 0.008, col.piping, false);
        const pip = [front(0.985, 0.0), front(0.95, 0.06), front(0.9, 0.11), add(madd(J.shC, S, B.sh - 0.005), [0, -0.1, 0])];
        strokePts(ctx, cam, pip.map(p => [p[0], Math.max(p[1], TABLE_Y + 0.01), p[2]]), 0.008, col.piping, false);
        for (const t of [0.4, 0.75]) { const p = lerp3(pip[Math.floor(t * 3)], pip[Math.floor(t * 3) + 1], (t * 3) % 1); ball(ctx, cam, p, 0.012, col.piping); }
      }
    } else if (visFront) {
      // shirt V, lapels, tie, collar points, button
      const V = above([front(1.0, -0.058), front(1.0, 0.058), front(0.64, 0)]);
      fillP(ctx, polyS(cam, V), col.shirt);
      for (const s of [-1, 1]) {
        fillP(ctx, polyS(cam, above([front(1.0, 0.058 * s), front(0.93, 0.14 * s), front(0.66, 0.012 * s), front(0.64, 0)])), col.topDk);
        fillP(ctx, polyS(cam, [add(J.shC, add(mul(S, 0.065 * s), mul(F, 0.05))), front(0.955, 0.048 * s), front(0.99, 0.006 * s)]), col.shirt);
      }
      fillP(ctx, polyS(cam, above([front(0.985, -0.012), front(0.985, 0.012), front(0.7, 0.021), front(0.665, 0), front(0.7, -0.021)])), col.tie);
      fillP(ctx, polyS(cam, [front(1.0, -0.016), front(1.0, 0.016), front(0.965, 0.011), front(0.965, -0.011)]), '#3A3540');
      const bt = front(0.6, 0); if (bt[1] > TABLE_Y + 0.008) ball(ctx, cam, bt, 0.011, col.topDk);
    }
    arms.filter(a => !a.far).sort((x, y) => y.d - x.d).forEach(drawArm);
    drawHead(ctx, cam, ch, J, pose);
  } });
  return J;
}

/* ---------- scene ---------- */
const GRAIN = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 192;
  const g = c.getContext('2d'); const img = g.createImageData(192, 192);
  const rnd = mulberry(7);
  for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 230; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0); return c;
})();
let GRAIN_PAT = null;
const POSE0 = { A: {}, B: {}, cup: null };

function lighting(ctx, cam, W, H, S) {
  ctx.save();
  // warm pool from the pendant lamp
  const q = cam.proj([0, 1.25, 0]);
  if (q) {
    const k = cam.fpx / q[2], r = Math.max(W * 0.35, 2.0 * k);
    const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], r);
    g.addColorStop(0, 'rgba(255,200,120,0.34)'); g.addColorStop(0.5, 'rgba(255,175,95,0.12)'); g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // night grade: slight green in the shadows, then vignette
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgb(236,244,236)'; ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.78);
  v.addColorStop(0, 'rgb(255,255,255)'); v.addColorStop(1, 'rgb(136,142,148)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function renderScene(ctx, W, H, spec, pose, opts) {
  pose = pose || POSE0; opts = opts || {};
  const cam = makeCam(spec.pos, spec.target, spec.vfov, W, H);
  const S = W / 800;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = PAL.ceiling; ctx.fillRect(0, 0, W, H);
  drawRoom(ctx, cam, S, opts);
  const low = [], high = [];
  tableBaseItem(cam, low);
  chairItems(cam, CH.A, low, high);
  chairItems(cam, CH.B, low, high);
  charItems(cam, CH.A, pose.A || {}, low, high);
  charItems(cam, CH.B, pose.B || {}, low, high);
  cupItem(cam, pose.cupA || [-0.2, TABLE.y, 0.1], high);
  cupItem(cam, [0.22, TABLE.y, -0.08], high);
  tableProps(cam, high);
  lampItem(cam, high);
  standItem(cam, [2.75, 0, 2.35], high);
  standItem(cam, [-2.75, 0, 2.45], high);
  umbrellaItem(cam, [3.62, 0, 2.3], high);
  counterItem(cam, low);
  low.sort((a, b) => b.d - a.d); for (const it of low) it.draw(ctx);
  drawTableTop(ctx, cam);
  high.sort((a, b) => b.d - a.d); for (const it of high) it.draw(ctx);
  lighting(ctx, cam, W, H, S);
  if (opts.arAxis) drawARAxis(ctx, cam, S);
  if (opts.grain !== false && GRAIN) {
    if (!GRAIN_PAT) GRAIN_PAT = ctx.createPattern(GRAIN, 'repeat');
    const gs = Math.max(1, S * 1.1);
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.13; ctx.fillStyle = GRAIN_PAT;
    ctx.setTransform(gs, 0, 0, gs, 0, 0); ctx.fillRect(0, 0, W / gs + 1, H / gs + 1); ctx.restore();
  }
  return analyze(cam, pose);
}

function drawARAxis(ctx, cam, S) {
  const d = norm(sub(EYE.B, EYE.A));
  const s = segS(cam, madd(EYE.A, d, -7), madd(EYE.B, d, 7)); if (!s) return;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 7 * S; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); ctx.stroke();
  ctx.strokeStyle = PAL.axis; ctx.lineWidth = 4 * S; ctx.setLineDash([16 * S, 10 * S]);
  ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); ctx.stroke();
  ctx.restore();
}

/* ---------- analysis (what the audience reads from the frame) ---------- */
function sideOf(pos) {
  const u = sub(HEAD.B, HEAD.A), v = sub(pos, HEAD.A);
  const c = (u[0] * v[2] - u[2] * v[0]) / Math.hypot(u[0], u[2]);
  return c > 0.15 ? 1 : c < -0.15 ? -1 : 0;
}
function bgOf(cam) {
  const f = norm([cam.f[0], 0, cam.f[2]]); const p = cam.pos;
  let best = Infinity;
  if (f[0] > 1e-6) best = Math.min(best, (ROOM.x1 - p[0]) / f[0]);
  if (f[0] < -1e-6) best = Math.min(best, (ROOM.x0 - p[0]) / f[0]);
  if (f[2] > 1e-6) best = Math.min(best, (ROOM.z1 - p[2]) / f[2]);
  if (f[2] < -1e-6) best = Math.min(best, (ROOM.z0 - p[2]) / f[2]);
  return p[2] + f[2] * best < 0 ? 'cool' : 'warm';
}
function analyze(cam, pose) {
  const info = { side: sideOf(cam.pos), chars: {}, bg: bgOf(cam), cam };
  for (const id of ['A', 'B']) {
    const J = joints(CH[id], (pose && pose[id]) || {});
    const H = J.headC, p = cam.proj(H);
    if (!p) { info.chars[id] = { inFrame: false }; continue; }
    const eye = madd(H, J.Uh, 0.015);
    const pe = cam.proj(eye), pg = cam.proj(madd(eye, J.Fh, 0.4));
    const gx = pe && pg ? pg[0] - pe[0] : 0, gy = pe && pg ? pg[1] - pe[1] : 0;
    const rpx = HEAD_R * cam.fpx / p[2];
    const facing = dot(J.Fh, norm(sub(cam.pos, H)));
    const x = (p[0] - cam.W / 2) / (cam.W / 2), y = (cam.H / 2 - p[1]) / (cam.H / 2);
    info.chars[id] = { inFrame: Math.abs(x) < 0.97 && Math.abs(y) < 1.02, x, y, px: p[0], py: p[1], rpx, gx, gy, facing,
      face: facing > 0.02, gaze: Math.abs(gx) < rpx * 0.3 ? 'C' : (gx > 0 ? 'R' : 'L') };
  }
  return info;
}

/* ---------- camera rigs ---------- */
function rig(role, x, z, o) {
  o = o || {};
  if (role === 'master') {
    const pos = [x, o.h || 1.36, z];
    const T = o.target || [0, 0.98, 0];
    const d = len(sub(T, pos));
    return { pos, target: T, vfov: clamp(2 * Math.atan((o.frameH || 1.95) / 2 / d) * 180 / Math.PI, 16, 75) };
  }
  if (role === 'free') return { pos: [x, o.h || 1.3, z], target: o.target, vfov: o.vfov || 30 };
  const subj = role === 'cuA' ? 'A' : 'B', other = subj === 'A' ? 'B' : 'A';
  const h = o.h || 1.24;
  const pos = [x, h, z];
  const eyes = EYE[subj];
  const d = len(sub(eyes, pos));
  const vfov = 2 * Math.atan((o.frameH || 0.6) / 2 / d) * 180 / Math.PI;
  const f0 = norm([eyes[0] - x, 0, eyes[2] - z]);
  const r0 = norm(cross(f0, UP));
  const gaze = norm([HEAD[other][0] - HEAD[subj][0], 0, HEAD[other][2] - HEAD[subj][2]]);
  const gs = dot(gaze, r0);
  const tx = Math.tan(rad(vfov) / 2) * 16 / 9;
  const delta = Math.atan(0.33 * tx) * clamp(gs * 5, -1, 1);
  const fh = norm(add(mul(f0, Math.cos(delta)), mul(r0, Math.sin(delta))));
  const hd = Math.hypot(eyes[0] - x, eyes[2] - z);
  const eps = Math.atan(0.2 * Math.tan(rad(vfov) / 2));
  const pitch = Math.atan2(eyes[1] - h, hd) - eps;
  const f = norm(add(mul(fh, Math.cos(pitch)), [0, Math.sin(pitch), 0]));
  return { pos, target: madd(pos, f, d), vfov };
}
