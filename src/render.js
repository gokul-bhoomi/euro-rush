// Drawing helpers + the race world for one split-screen half (232x270). Ported from mockup/index.html.
import { H, HW, MID, ROAD_X, LANE, ROAD_W, ROAD_R, laneX, CAM_Y, CAR_H, KMH, PAL, TUNE } from './config.js';
import { mod, rng, shade } from './util.js';
import { vehY, vehX, curvAt, roadPos, ROAD_MID } from './track.js';

export const FONT = '"Press Start 2P", monospace';
let G = null;
export const setCtx = (g) => { G = g; };

// ---------- primitives ----------
export function R(x, y, w, h, c) { G.fillStyle = c; G.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
export function disc(cx, cy, r, c) {
  G.fillStyle = c;
  for (let dy = -r; dy <= r; dy++) { const hw = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8)); G.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1); }
}
export function ell(cx, cy, rx, ry, c) {
  G.fillStyle = c;
  for (let dy = -ry; dy <= ry; dy++) { const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)) + 0.3); G.fillRect(Math.round(cx - hw), Math.round(cy + dy), hw * 2 + 1, 1); }
}
export function frame(x, y, w, h, c, th = 2) { R(x, y, w, th, c); R(x, y + h - th, w, th, c); R(x, y, th, h, c); R(x + w - th, y, th, h, c); }
export function txt(s, x, y, c, al = 'left', sz = 8, ol = null) {
  G.font = `${sz}px ${FONT}`; G.textAlign = al; G.textBaseline = 'top';
  if (ol) { G.fillStyle = ol; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) G.fillText(s, Math.round(x) + dx, Math.round(y) + dy); }
  G.fillStyle = c; G.fillText(s, Math.round(x), Math.round(y));
}
export function fmt(s) { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r.toFixed(2).padStart(5, '0')}`; }

// ---------- sprites ----------
export const SPR = {
  pretzel: { map: { b: '#a0521d', w: '#ffffff' }, rows: ['..bbb.bbb..', '.b...b...b.', 'b..w.b.w..b', 'b...b.b...b', '.b.b...b.b.', '..b.....b..', '..bw...wb..', '...bbbbb...'] },
  doner: { map: { c: '#e8c07a', g: '#5bc23f', r: '#e8402e', m: '#9a5a30' }, rows: ['.ccccccc.', 'cgrmgmrgc', 'cmgmrmgmc', '.cmgmmgc.', '.cmrmgmc.', '..cmgmc..', '..ccmcc..', '...ccc...', '....c....'] },
  croissant: { map: { o: '#b5651d', y: '#f2b44a' }, rows: ['....oyyo....', '..yyoyyoyy..', '.yyoyyyyoyy.', 'yyo......oyy', 'yo........oy', 'o..........o'] },
  pizza: { map: { c: '#c97b2e', y: '#ffd34a', r: '#d6322b' }, rows: ['cccccccccc', 'cyyyyyyyyc', '.yrryyyry.', '.yrryyyyy.', '..yyyrry..', '..yyyrry..', '...yyyy...', '...yryy...', '....yy....', '....y.....'] },
  espresso: { map: { w: '#ffffff', k: '#5a3215', s: '#d9d9d9', g: '#b0b0b0' }, rows: ['..s..s....', '...s..s...', '..s..s....', '.wwwwwww..', '.wkkkkkwww', '.wwwwwww.w', '..wwwww.w.', 'wwwwwwwwww', '.gggggggg.'] },
};
export function spr(n, x, y, s = 1) {
  SPR[n].rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== '.') R(x + i * s, y + j * s, s, s, SPR[n].map[ch]); } });
}
export const sprW = (n) => SPR[n].rows[0].length, sprH = (n) => SPR[n].rows.length;

// ---------- vehicles (x = centre, y = screen top) ----------
export function car(cx, y, c, down, player) {
  const w = player ? 16 : 14, h = player ? 26 : 24, x = Math.round(cx - w / 2);
  R(x + 2, y + 3, w, h, 'rgba(0,0,0,.28)');
  for (const wy of [y + 4, y + h - 9]) { R(x - 1, wy, 2, 5, '#141414'); R(x + w - 1, wy, 2, 5, '#141414'); }
  R(x, y + 1, w, h - 2, shade(c, -0.4)); R(x + 1, y, w - 2, h, shade(c, -0.4)); R(x + 1, y + 1, w - 2, h - 2, c);
  R(x + 2, y + 2, 1, h - 4, shade(c, 0.3));
  if (player) R(x + w / 2 - 2, y + 1, 4, h - 2, '#ffffff');
  const f = down ? y + h - 10 : y + 6, rr = down ? y + 4 : y + h - 8;
  R(x + 2, f, w - 4, 4, '#a8dcff'); R(x + 3, rr, w - 6, 3, '#6c9fc4');
  R(x + 3, down ? y + 8 : y + 10, w - 6, 6, shade(c, -0.12));
  if (player) R(x + w / 2 - 2, down ? y + 8 : y + 10, 4, 6, '#e8e8e8');
  const fy = down ? y + h - 2 : y, by = down ? y : y + h - 1;
  R(x + 2, fy, 3, 2, '#fff4b0'); R(x + w - 5, fy, 3, 2, '#fff4b0'); R(x + 2, by, 3, 1, '#ff2a2a'); R(x + w - 5, by, 3, 1, '#ff2a2a');
}
function truck(cx, y, c, down) {
  const w = 16, h = 42, x = Math.round(cx - w / 2);
  R(x + 2, y + 3, w, h, 'rgba(0,0,0,.28)');
  for (const wy of [y + 4, y + h - 14, y + h - 7]) { R(x - 1, wy, 2, 5, '#141414'); R(x + w - 1, wy, 2, 5, '#141414'); }
  const cabY = down ? y + h - 12 : y, trY = down ? y : y + 13;
  R(x, cabY, w, 12, shade(c, -0.35)); R(x + 1, cabY + 1, w - 2, 10, c); R(x + 2, down ? cabY + 7 : cabY + 2, w - 4, 3, '#a8dcff');
  R(x, trY, w, 29, '#9a9a9a'); R(x + 1, trY + 1, w - 2, 27, '#e2e2e2'); R(x + 1, trY + 12, w - 2, 4, c);
  const fy = down ? y + h - 2 : y; R(x + 2, fy, 3, 2, '#fff4b0'); R(x + w - 5, fy, 3, 2, '#fff4b0');
}
function tram(cx, y) {
  const w = 18, x = Math.round(cx - w / 2);
  R(x + 2, y + 3, w, 88, 'rgba(0,0,0,.28)');
  for (let k = 0; k < 3; k++) {
    const s = y + k * 30;
    R(x, s, w, 28, '#b48f00'); R(x + 1, s + 1, w - 2, 26, '#f3c300'); R(x + 4, s + 6, w - 8, 14, '#d9dad6'); R(x + 5, s + 8, w - 10, 3, '#9fa19c');
    if (k < 2) R(x + 3, s + 28, w - 6, 2, '#3a3a3a');
  }
  R(x + 3, y + 1, w - 6, 3, '#30353f'); R(x + 5, y + 38, 8, 1, '#333'); R(x + 8, y + 34, 2, 8, '#333');
}
function vehicle(v, cx, y) {
  const down = v.v < 0;
  if (v.type === 'truck') truck(cx, y, v.c, down);
  else if (v.type === 'tram') tram(cx, y);
  else car(cx, y, v.c, down);
}

// ---------- scenery (generated per 600px chunk, cached) ----------
const CH = 600, cache = new Map();
const ROOFS = ['#8b8f98', '#9a8a78', '#a07462', '#b3ada3'];
function chunk(track, c) {
  const key = track.seed * 100000 + c;
  let k = cache.get(key);
  if (k) return k;
  const r = rng(key * 7919 + 13), y0 = c * CH;
  const gal = track.monuments.find((m) => m.kind === 'gallery');
  const inGal = (y) => gal && y > gal.y0 - 30 && y < gal.y1 + 30;
  const bld = (skipGal) => {
    const out = [];
    for (let y = y0 + 4; ;) {
      const h = 56 + Math.floor(r() * 60);
      if (y + h > y0 + CH - 3) break;
      if (skipGal && (inGal(y) || inGal(y + h))) { y += 20; continue; }
      out.push({ y, h, w: 26 + Math.floor(r() * 10), c: ROOFS[Math.floor(r() * ROOFS.length)], d: r() });
      y += h + 3;
    }
    return out;
  };
  // switchbacks run through a park: no buildings (the road legs sit side by side), lots of trees
  const inPark = (y) => (track.parks || []).some((z) => y > z.s0 && y < z.s1);
  const bl = bld(false).filter((b) => !inPark(b.y) && !inPark(b.y + b.h)), br = bld(true).filter((b) => !inPark(b.y) && !inPark(b.y + b.h)), trees = [], specks = [];
  for (let y = y0 + 30; y < y0 + CH - 20; y += 90 + Math.floor(r() * 40)) { trees.push({ x: 42, y }); if (!inGal(y + 18)) trees.push({ x: 190, y: y + 18 }); }
  for (let y = y0 + 10; y < y0 + CH - 10; y += 22 + Math.floor(r() * 18)) if (inPark(y)) trees.push({ x: 8 + Math.floor(r() * 24), y }, { x: 202 + Math.floor(r() * 24), y: y + 11 });
  const lamps = [{ x: 50, y: y0 + 60, l: 1 }, { x: 50, y: y0 + 360, l: 1 }, { x: 182, y: y0 + 210, l: 0 }, { x: 182, y: y0 + 510, l: 0 }];
  for (let i = 0; i < 60; i++) specks.push({ x: ROAD_X + 4 + r() * 120, y: y0 + r() * CH, c: r() < 0.5 ? shade(track.road, -0.08) : shade(track.road, 0.05) });
  k = { bl, br, trees, lamps, specks };
  cache.set(key, k);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return k;
}

let cam = 0, camS = CAM_Y;
const sY = (wy) => camS - (wy - cam); // world y -> screen y inside a half

function roof(x, y, w, h, c, d) {
  R(x + 2, y + 3, w, h, 'rgba(0,0,0,.22)'); R(x, y, w, h, shade(c, -0.35)); R(x + 1, y + 1, w - 2, h - 2, c);
  if (d < 0.12) { R(x + 3, y + 3, w - 6, h - 6, '#6f9a52'); return; }
  R(x + 1, y + Math.floor(h / 2), w - 2, 1, shade(c, -0.18));
  if (d > 0.6) R(x + 4, y + 4, 4, 4, shade(c, -0.3));
  if (d > 0.85) R(x + w - 10, y + h - 11, 6, 7, '#7fb0d4');
}
function tvTower(cx, y) {
  G.fillStyle = 'rgba(0,0,0,.22)';
  for (let k = 0; k < 64; k++) G.fillRect(Math.round(cx + 3 + k * 0.4), Math.round(y + 32 + k), 4, 1);
  R(cx - 6, y + 92, 12, 6, '#9aa0aa'); R(cx - 2, y + 30, 4, 64, '#d9dce2'); R(cx + 1, y + 30, 1, 64, '#a9aeb8');
  disc(cx, y + 28, 9, '#b9bec8'); disc(cx - 2, y + 25, 5, '#e9ecf1'); R(cx - 9, y + 27, 18, 3, '#4b515e');
  for (let k = 0; k < 6; k++) R(cx - 1, y + k * 3, 2, 3, k % 2 ? '#ffffff' : '#e03030');
}
function gate(y) {
  const x0 = 30, w = 172, c = '#d9c497', e = '#a48d61';
  R(x0, y + 22, w, 10, 'rgba(0,0,0,.28)');
  for (const px of [32, 48, 82, 113, 146, 178, 194]) R(px, y + 21, 6, 5, e);
  R(x0, y, w, 22, e); R(x0 + 1, y + 1, w - 2, 20, c); R(x0 + 1, y + 4, w - 2, 1, e); R(x0 + 1, y + 17, w - 2, 1, e);
  R(106, y + 7, 20, 9, '#3f8f74'); for (let k = 0; k < 4; k++) R(107 + k * 5, y + 4, 3, 4, '#2f7a60'); R(112, y + 12, 8, 3, '#2c6b55');
}
function checker(wy) { const y = sY(wy); for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) R(ROAD_X + i * 4, y + j * 4, 4, 4, (i + j) % 2 ? '#111' : '#fff'); }
function coneTop(x, y) { R(x - 2, y - 2, 5, 5, '#ff6a00'); R(x - 1, y - 1, 3, 3, '#ffffff'); R(x, y, 1, 1, '#ff6a00'); }
function bake(x, y) { R(x, y, 4, 10, '#ffffff'); R(x, y + 2, 4, 2, '#e02020'); R(x, y + 6, 4, 2, '#e02020'); R(x - 1, y + 10, 6, 2, '#222'); }
function stripeBar(x, y, w, h) { for (let i = 0; i < w; i += 4) R(x + i, y, 4, h, (i / 4) % 2 ? '#ffffff' : '#e02020'); }
function works(w, now, SH = H) {
  const top = sY(w.y1), bot = sY(w.y0), len = bot - top;
  if (top > SH + 40 || bot < -40) return;
  const zl = ROAD_X + w.lane * LANE + 2, zw = LANE - 4, toRight = w.lane === 0;
  R(zl, top, zw, len, 'rgba(255,170,0,.14)');
  for (let k = 0; k < 5; k++) coneTop(toRight ? zl + 2 + k * 6 : zl + zw - 2 - k * 6, top - 34 + k * 7);
  for (let k = 0; k < len; k += 14) { bake(zl + zw - 3, top + k); if (!toRight) bake(zl - 1, top + k); }
  stripeBar(zl, top, zw, 4); stripeBar(zl, bot - 4, zw, 4);
  disc(zl + 12, top + 22, 7, '#d6b06a'); disc(zl + 10, top + 20, 4, '#e7c98a');
  if (len > 110) {
    const dx = zl + 4, dy = top + 60, a = Math.sin(now * 2) * 2;
    R(dx, dy, 3, 16, '#2a2a2a'); R(dx + 13, dy, 3, 16, '#2a2a2a'); R(dx + 2, dy + 2, 12, 12, '#f5b800'); R(dx + 3, dy + 3, 6, 6, '#3a3a3a'); R(dx + 4, dy + 4, 4, 2, '#9fd8ff');
    R(dx + 9, dy - 12 + a, 3, 14, '#e0a800'); R(dx + 7, dy - 16 + a, 7, 4, '#555');
  }
  R(zl + 9, bot - 20, 10, 8, '#ffd000'); R(zl + 10, bot - 19, 8, 6, '#111'); R(zl + 12, bot - 18, 4, 4, '#ffd000');
}

// ---------- one half of the race ----------
// The road is drawn as one long straight strip (everything on or beside the road, exactly as on a
// straight) and then bent onto its real path on the map: straight runs are copied as one block,
// turns slice by slice, each slice rotated to the road heading. The map stays north-up and the camera
// looks ahead along the road, so a switchback shows as a U on screen. Players, monuments and
// effects are drawn afterwards at their map positions.
const SMAX = 2400;
let SC = null, SG = null;
function strip() { if (!SC) { SC = document.createElement('canvas'); SC.width = HW; SC.height = SMAX; SG = SC.getContext('2d'); } return SG; }
const VIEW_Y = 152; // screen row the camera centre maps to (middle of the area below the HUD)

// road distance where the current straight/turn ends
function runEnd(T, s) {
  for (const c of T.curves || []) { if (c.s1 <= s) continue; return s < c.s0 ? c.s0 : c.s1; }
  return Infinity;
}

export function drawWorld(race, camY, now, fx, opt = {}) {
  const T = race.track, t = opt.t ?? race.t, sv = camY;
  // camera: centre of the road at the viewer, pushed ahead along where the road is going
  const c0p = roadPos(T, sv);
  let ax = 0, ay = 0;
  for (let k = 0; k <= 8; k++) { const a = roadPos(T, sv + 20 + k * 25).a; ax += Math.sin(a); ay += Math.cos(a); }
  const look = CAM_Y - VIEW_Y + (opt.shift || 0);
  ax /= 9; ay /= 9;
  // look less far when heading down the screen, so the car stays clear of the HUD
  const camX = Math.round(c0p.x + ax * look * 0.55), camYm = Math.round(c0p.y + ay * look * (ay < 0 ? 0.55 : 1));
  const toScr = (q) => [HW / 2 + (q.x - camX), VIEW_Y - (q.y - camYm)];

  // which stretch of road is on screen (a switchback can bring a later leg into view)
  let sA = Infinity, sB = -Infinity;
  for (let s = sv - 500; s < sv + 1800; s += 8) {
    const [x, y] = toScr(roadPos(T, s));
    if (x > -130 && x < HW + 130 && y > -130 && y < H + 130) { sA = Math.min(sA, s); sB = Math.max(sB, s); }
  }
  sA = Math.floor(sA) - 40; sB = Math.min(Math.ceil(sB) + 40, sA + SMAX);
  const SH = sB - sA;
  cam = sA; camS = SH; // sY(wy) = row in the strip
  const wTop = sB, wBot = sA;
  const c0 = Math.floor(wBot / CH), c1 = Math.floor(wTop / CH);
  const target = G;
  G = strip();

  // sides
  R(0, 0, HW, SH, '#5f8a4a');
  for (const sx of [38, 180]) { R(sx, 0, 14, SH, '#aaa59c'); for (let wy = Math.floor(wBot / 16) * 16; wy < wTop; wy += 16) R(sx, sY(wy), 14, 1, '#96918a'); }
  R(50, 0, 2, SH, '#d2cec6'); R(180, 0, 2, SH, '#d2cec6');
  for (let c = c0; c <= c1; c++) {
    const k = chunk(T, c);
    for (const b of k.bl) { const y = sY(b.y + b.h); if (y < SH && y + b.h > 0) roof(36 - b.w, y, b.w, b.h, b.c, b.d); }
    for (const b of k.br) { const y = sY(b.y + b.h); if (y < SH && y + b.h > 0) roof(196, y, b.w, b.h, b.c, b.d); }
  }
  const gal = T.monuments.find((m) => m.kind === 'gallery');
  if (gal && gal.y0 < wTop && gal.y1 > wBot) {
    const a = Math.max(gal.y0, wBot), b = Math.min(gal.y1, wTop);
    R(199, sY(b), 33, b - a, '#3b78a8');
    const cols = ['#ff4f4f', '#ffd23f', '#3fc1ff', '#7bd35a', '#ff8ad8', '#ffffff', '#ff8a2a'];
    for (let wy = Math.floor(a / 8) * 8; wy < b; wy += 8) R(194, sY(wy + 8), 5, 8, cols[mod(wy / 8, cols.length)]);
    for (let wy = Math.floor(a / 37) * 37; wy < b; wy += 37) R(203 + mod(wy * 13, 26), sY(wy), 4, 1, '#6aa6d4');
    R(198, sY(b), 1, b - a, 'rgba(0,0,0,.3)');
  }
  for (let c = c0; c <= c1; c++) {
    const k = chunk(T, c);
    for (const tr of k.trees) { const y = sY(tr.y); if (y < -8 || y > SH + 8) continue; disc(tr.x + 2, y + 2, 6, 'rgba(0,0,0,.25)'); disc(tr.x, y, 6, '#356e33'); disc(tr.x - 2, y - 2, 3, '#57a04c'); }
    for (const l of k.lamps) { const y = sY(l.y); if (y < -4 || y > SH + 4) continue; R(l.x - 1, y - 1, 3, 3, '#3a3a40'); R(l.x + (l.l ? 1 : -4), y, 4, 2, '#e8e2c8'); }
  }
  // hairpins: red/white kerbs on both sidewalks, a stone wall with chevrons on the outside,
  // and two yellow warning boards on the right before each one
  for (const cv of T.curves || []) {
    if (cv.kind !== 'hairpin') continue;
    for (const d of [300, 180]) { const y = sY(cv.s0 - d); if (y > -12 && y < SH + 12) bendSign(187, y, Math.sign(cv.k)); }
    if (cv.s1 < wBot || cv.s0 > wTop) continue;
    const a = Math.max(cv.s0 - 20, wBot), b = Math.min(cv.s1 + 20, wTop);
    for (let wy = Math.floor(a / 8) * 8; wy < b; wy += 8) { const c = (wy / 8) % 2 ? '#ffffff' : '#e02020'; R(40, sY(wy + 8), 12, 8, c); R(180, sY(wy + 8), 12, 8, c); }
    const wx = cv.k > 0 ? 36 : 192; // outside of the turn
    R(wx, sY(b), 4, b - a, '#8d8478'); R(wx + (cv.k > 0 ? 3 : 0), sY(b), 1, b - a, '#6d655b');
    for (let wy = Math.ceil(a / 40) * 40; wy < b; wy += 40) chevron(cv.k > 0 ? 44 : 187, sY(wy), Math.sign(cv.k));
  }

  // road
  R(ROAD_X, 0, ROAD_W, SH, T.road);
  for (let c = c0; c <= c1; c++) for (const s of chunk(T, c).specks) { const y = sY(s.y); if (y >= 0 && y < SH) R(s.x, y, 1, 1, s.c); }
  R(ROAD_X + 2, 0, 2, SH, '#eeeeee'); R(ROAD_R - 4, 0, 2, SH, '#eeeeee');
  for (const lx of [84, 148]) for (let wy = Math.floor(wBot / 40) * 40; wy < wTop; wy += 40) R(lx - 1, sY(wy + 18), 2, 18, '#eeeeee');
  R(113, 0, 2, SH, '#eeeeee'); R(117, 0, 2, SH, '#eeeeee');
  for (const rx of [91, 107]) { R(rx, 0, 2, SH, '#33343b'); R(rx, 0, 1, SH, '#8e9099'); }
  checker(22); checker(T.length + 8);

  for (const w of T.works) works(w, now, SH);

  for (const k of T.pickups) {
    if (race.taken.has(k.id)) continue;
    const y = sY(k.y);
    if (y < -20 || y > SH + 20) continue;
    const cx = laneX(k.lane);
    G.globalAlpha = 0.35; disc(cx, y, Math.round(8 + Math.sin(now * 6) * 1.5), PAL.accent); G.globalAlpha = 1;
    spr(k.kind, Math.round(cx - sprW(k.kind) / 2), Math.round(y - sprH(k.kind) / 2));
  }

  const vis = []; // vehicles, for the oncoming warnings below
  for (const v of race.veh) {
    const vy = vehY(v, v.gone ? v.goneAt : t);
    if (!v.gone && v.v < 0 && vy > sv && vy < sv + 500) vis.push([v, vy]);
    if (vy - v.h / 2 > wTop || vy + v.h / 2 < wBot) continue;
    const x = vehX(T, v, vy), top = sY(vy + v.h / 2);
    if (v.gone) {
      const e = t - v.goneAt;
      if (e > 0.9) continue;
      G.save(); G.globalAlpha = 1 - e / 0.9; G.translate(x + v.spin * e * 50, top + v.h / 2); G.rotate(v.spin * e * 7);
      vehicle(v, 0, -v.h / 2); G.restore();
    } else vehicle(v, x, top);
  }
  // speed streaks: road-anchored, longer and brighter the faster the viewer goes
  const sp = Math.max(0, ((opt.speed || 0) - 150) / (TUNE.maxSpeed - 150));
  if (sp > 0) {
    const len = 8 + sp * 30;
    G.globalAlpha = Math.min(0.6, 0.15 + sp * 0.4);
    for (let wy = Math.floor((sv - 120) / 23) * 23; wy < sv + 320; wy += 23) R(40 + mod(wy * 37, 152), sY(wy), 1, len, '#ffffff');
    G.globalAlpha = 1;
  }

  // bend the strip onto the map. Pass 1 draws everything; where switchback legs sit side by side,
  // pass 2 redraws just the road + sidewalks so no leg's scenery covers another leg's road.
  G = target;
  R(0, 0, HW, H, '#5f8a4a');
  const twoPass = (T.parks || []).some((z) => z.s1 > sA && z.s0 < sB);
  for (const [xa, xb] of twoPass ? [[0, HW], [36, 196]] : [[0, HW]]) {
    for (let s = sA; s < sB;) {
      const k = curvAt(T, s + 1), ak = Math.abs(k);
      const h = Math.min(sB - s, k === 0 ? Math.max(4, runEnd(T, s + 1) - s) : ak > 1 / 200 ? 2 : 4);
      const q = roadPos(T, s), [x, y] = toScr(q);
      // on the inside of a tight turn, stop before the centre of the turn (it would fold over)
      const lim = ak ? 0.85 / ak : Infinity;
      const l = Math.max(xa, k < 0 ? ROAD_MID - lim : 0), r = Math.min(xb, k > 0 ? ROAD_MID + lim : HW);
      const hd = h * (1 + ak * ROAD_MID) + 1; // a little taller so the outside of a turn has no gaps
      const row = sB - s - h;
      if (q.a === 0) G.drawImage(SC, l, row, r - l, h, Math.round(x) - ROAD_MID + l, Math.round(y) - h, r - l, h);
      else { G.save(); G.translate(x, y); G.rotate(q.a); G.drawImage(SC, l, row, r - l, h, l - ROAD_MID, -hd, r - l, hd); G.restore(); }
      s += h;
    }
  }

  const at = (s, lx = ROAD_MID) => { const q = roadPos(T, s, lx), [x, y] = toScr(q); return { x, y, a: q.a }; };
  for (const f of fx) {
    if (f.kind !== 'skid') continue;
    const a = 0.55 * (1 - (now - f.t0) / 3), q = at(f.y, f.x);
    if (a > 0 && q.y > -4 && q.y < H) R(q.x - 1, q.y, 2, 3, `rgba(25,25,30,${a.toFixed(2)})`);
  }
  // oncoming traffic about to come into view: red marker at the edge of the screen
  if (mod(now * 6, 2) < 1.4) for (const [v, vy] of vis) {
    const q = at(vy - v.h / 2, vehX(T, v, vy));
    if (q.x > 0 && q.x < HW && q.y > 34 && q.y < H) continue;
    warn(Math.max(8, Math.min(HW - 8, q.x)), Math.max(37, Math.min(H - 12, q.y)));
  }
  // flashing <<< / >>> while a hairpin is coming up for the viewer
  const nb = (T.curves || []).find((c) => c.kind === 'hairpin' && c.s0 > sv && c.s0 - sv < 700);
  if (nb && mod(now * 4, 2) < 1.3) { txt(nb.k < 0 ? '<<<' : '>>>', 116, 40, '#ffd000', 'center', 16, '#222'); txt('HAIRPIN', 116, 58, '#ffd000', 'center', 8, '#222'); }
  if (!opt.noPlayers) for (const p of race.players) drawPlayer(p, now, at(p.y, p.x));

  const onRoad = (s, fn) => {
    const q = at(s);
    if (q.x < -260 || q.x > HW + 260 || q.y < -260 || q.y > H + 260) return;
    const keep = [cam, camS];
    cam = s; camS = 0;
    G.save(); G.translate(q.x, q.y); G.rotate(q.a); G.translate(-ROAD_MID, 0); fn(); G.restore();
    [cam, camS] = keep;
  };
  for (const m of T.monuments) {
    if (m.kind === 'tower') onRoad(m.y, () => tvTower(20, sY(m.y + 98)));
    if (m.kind === 'gate') onRoad(m.y, () => gate(sY(m.y + 30)));
  }

  for (const f of fx) {
    if (f.kind === 'skid') continue;
    const age = now - f.t0, q = at(f.y, f.x), y = q.y;
    const tx = f.text ? Math.max(f.text.length * (f.kind === 'big' ? 8 : 4) + 2, Math.min(HW - f.text.length * (f.kind === 'big' ? 8 : 4) - 2, q.x)) : q.x; // keep text on screen
    if (f.kind === 'pop' && age < 1) txt(f.text, tx, y - 24 - age * 18, f.color, 'center', 8, PAL.ui);
    if (f.kind === 'spark' && age < 0.5) {
      for (let k = 0; k < 16; k++) { const a = k * 2.4, d = age * 90 * (0.4 + ((k * 37) % 10) / 12); R(q.x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, 2, 2, ['#ffffff', '#ffd23f', '#ff7a2a'][k % 3]); }
    }
    if (f.kind === 'big' && age < 1) txt(f.text, tx, y - 40 - age * 14, f.color, 'center', 16, PAL.ui);
  }
  R(0, 0, HW, H, PAL.tint);
}

function chevron(x, y, dir) {
  R(x - 4, y - 4, 9, 8, '#e02020');
  for (let r = -2; r <= 2; r++) R(x - 1 + dir * (1 - Math.abs(r)), y + r, 2, 1, '#ffffff');
}

function bendSign(x, y, dir) {
  R(x - 1, y + 5, 2, 6, '#3a3a40');
  R(x - 5, y - 5, 11, 11, '#222'); R(x - 4, y - 4, 9, 9, '#ffd000');
  for (let r = -2; r <= 2; r++) R(x - 1 + dir * (1 - Math.abs(r)), y + r, 2, 1, '#111'); // chevron < or >
}

function warn(x, y = 37) { G.fillStyle = '#e8402e'; for (let i = 0; i < 5; i++) G.fillRect(Math.round(x - 5 + i), Math.round(y) + i, 11 - i * 2, 1); R(x - 1, y + 7, 2, 2, '#e8402e'); }

// q = the car's screen position and the road heading there; everything is drawn in the car's frame
function drawPlayer(p, now, q) {
  const c = p.id === 0 ? PAL.p1 : PAL.p2;
  if (q.y > H + 30 || q.y < -30 || q.x < -30 || q.x > HW + 30) return;
  const k = 0.8 - p.wobble, drifting = p.drift > 0.08;
  // the car points where it is going; drifting, the nose turns a little into the curve
  const yaw = Math.atan2(p.lat + p.vx, Math.max(p.v, 40)) * 0.6;
  const rot = q.a + yaw + (p.wobble > 0 ? 0.55 * Math.exp(-k * 2.5) * Math.sin(k * 14) : 0) + (drifting ? Math.max(-0.3, Math.min(0.3, p.slip * 0.004)) : 0);
  G.save(); G.translate(Math.round(q.x), Math.round(q.y)); if (rot) G.rotate(rot);
  if (p.boost > 0 && p.tow <= 0) {
    for (let j = 0; j < 5; j++) R(-8 + j * 4, 15 + mod(now * 90 + j * 7, 14), 1, 6 + (j % 3) * 3, 'rgba(255,255,255,.7)');
    disc(0, 16, 2 + (mod(now * 20, 2) < 1 ? 1 : 0), '#ffb030');
  }
  if (drifting) for (let i = 0; i < 3; i++) {
    const a = mod(now * 3 + i * 0.33, 1); G.globalAlpha = 0.45 * (1 - a);
    disc((i % 2 ? 6 : -6) - p.slip * 0.04 * a, 13 + a * 12, 2 + Math.round(a * 3), '#d8d8d8');
  }
  G.globalAlpha = p.invuln > 0 && mod(now * 12, 2) < 1 ? 0.35 : 1;
  car(0, -13, c, false, true);
  G.globalAlpha = 1;
  if (p.tow > 0) {
    R(-8, -13, 16, 26, 'rgba(40,40,40,.45)');
    for (let i = 0; i < 4; i++) { const a = mod(now * 1.5 + i * 0.25, 1); G.globalAlpha = 1 - a; disc(-3 + i * 2, -13 - a * 26, 3 + Math.round(a * 4), '#8a8a8a'); }
    G.globalAlpha = 1;
  }
  G.restore();
}

// ---------- HUD ----------
export function drawHud(i, p, race, rk) {
  const pc = i ? PAL.p2 : PAL.p1;
  R(0, 0, HW, 34, PAL.ui); R(0, 33, HW, 1, pc);
  R(4, 4, 22, 12, pc); txt(`P${i + 1}`, 15, 6, PAL.ui, 'center');
  txt(fmt(p.finish != null ? p.finish : race.t), 32, 6, PAL.text);
  if (p.penalty > 0) txt(`+${p.penalty}`, 92, 6, '#e8402e');
  const left = Math.max(0, ((race.track.length - p.y) / race.track.length) * race.track.km);
  txt(`${left.toFixed(1)}KM`, 152, 6, PAL.dim, 'center');
  if (rk) txt(rk === 1 ? '1ST' : '2ND', 228, 6, rk === 1 ? PAL.accent : PAL.dim, 'right');
  txt('HP', 4, 20, PAL.dim);
  const seg = Math.ceil(p.hp / 10);
  for (let k = 0; k < 10; k++) R(22 + k * 7, 19, 6, 8, k < seg ? (seg > 6 ? '#4be36a' : seg > 3 ? '#ffc93c' : '#ff4b4b') : PAL.ui2);
  if (p.hitCd > 0) frame(20, 17, 73, 12, '#ff4b4b', 1);
  R(94, 17, 14, 12, '#b07a52'); spr('espresso', 96, 18);
  const pips = Math.ceil(p.boost);
  for (let k = 0; k < 3; k++) R(110 + k * 6, 21, 4, 4, k < pips ? PAL.accent : PAL.ui2);
  const flat = p.v >= TUNE.maxSpeed * 0.98 || p.boost > 0;
  txt(`${Math.round(p.v * KMH)} KM/H`, 228, 20, flat ? (mod(race.t * 6, 2) < 1 ? PAL.accent : '#e8402e') : PAL.text, 'right');
}

export function drawBanner(p, race) {
  const panel = (y, h, c) => { R(16, y, 200, h, PAL.ui); frame(16, y, 200, h, c); };
  if (p.tow > 0) { panel(100, 44, '#e8402e'); txt('TOWED!', 116, 108, '#e8402e', 'center', 16); txt('+10 SEC', 116, 130, PAL.text, 'center'); }
  else if (p.finish != null) {
    panel(96, 56, PAL.accent); txt('FINISH!', 116, 104, PAL.accent, 'center', 16); txt(fmt(p.finish), 116, 126, PAL.text, 'center');
    if (race.phase !== 'done' && race.players.length > 1) txt(`WAITING ${Math.max(0, Math.ceil(race.deadline - race.t))}`, 116, 140, PAL.dim, 'center');
  } else if (p.dnf) { panel(100, 40, PAL.dim); txt('DNF', 116, 112, PAL.dim, 'center', 16); }
  else if (race.deadline != null) txt(`HURRY! ${Math.max(0, Math.ceil(race.deadline - race.t))}`, 116, 40, '#e8402e', 'center', 8, PAL.ui);
}

export function drawMid(race) {
  const x = HW;
  R(x, 0, MID, H, PAL.ui); R(x, 0, 1, H, PAL.ui2); R(x + MID - 1, 0, 1, H, PAL.ui2);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) R(x + 4 + i * 2, 6 + j * 2, 2, 2, (i + j) % 2 ? '#111' : '#fff');
  R(x + 7, 16, 2, 238, PAL.dim);
  for (const f of [0.25, 0.5, 0.75]) R(x + 5, 254 - f * 238, 6, 1, PAL.dim);
  for (const p of [...race.players].reverse()) {
    const c = p.id === 0 ? PAL.p1 : PAL.p2, y = 254 - Math.min(1, p.y / race.track.length) * 238;
    R(x + 2, y - 3, 12, 7, shade(c, -0.45)); R(x + 3, y - 2, 10, 5, c);
  }
}
