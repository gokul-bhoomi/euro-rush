import { rng, clamp, clamp01 } from './util.js';
import { VEH, laneX, LANE } from './config.js';

const CAR_COLS = ['#efe6c8', '#3a6ea5', '#1f1f22', '#c9c9c9', '#f2c14e', '#9a2f2f', '#e8e8e8', '#2f7d4f', '#7a7f8c'];

export const SAME_SPEED = [0, 0, 48, 66]; // lanes 2 and 3 (trams/trucks are slower in lane 2)
export const ONC_SPEED = -75;            // both oncoming lanes share one speed so merges never overlap
export const HAIRPIN_R = 90;            // centre-line radius of a hairpin (px); legs of a switchback sit 2R apart
const RAMP = 40;                         // curvature eases in/out over this distance so grip loads up smoothly

// A turn of `angle` radians (+ = right) with centre-line radius R, starting at s0.
const turn = (s0, angle, R, kind) => ({ s0, s1: s0 + Math.abs(angle) * R + RAMP, k: Math.sign(angle) / R, ramp: RAMP, kind });

// The road is a real path: long straights, a few gentle sweepers you can take flat out, and
// switchbacks (a 180-degree hairpin, a short leg back down the screen, a hairpin the other way)
// that you have to brake for. Every feature ends heading north again.
// Each feature is built from s = 0, then they're spread out with long straights in between.
function layout(r, order, START, END) {
  const feats = order.map((f) => {
    const dir = r() < 0.5 ? -1 : 1;
    if (f === 'sweep') {
      const a = (0.45 + r() * 0.25) * dir, R = 450 + Math.floor(r() * 250);
      const c1 = turn(0, a, R, 'sweep');
      return [c1, turn(c1.s1 + 300 + Math.floor(r() * 400), -a, R, 'sweep')];
    }
    const h1 = turn(0, Math.PI * dir, HAIRPIN_R, 'hairpin');
    return [h1, turn(h1.s1 + 300 + Math.floor(r() * 120), -Math.PI * dir, HAIRPIN_R, 'hairpin')];
  });
  const gap = (END - START - feats.reduce((n, f) => n + f[1].s1, 0)) / (feats.length - 1);
  const curves = [], parks = [];
  let s = START;
  for (const f of feats) {
    const placed = f.map((c) => ({ ...c, s0: c.s0 + s, s1: c.s1 + s }));
    curves.push(...placed);
    if (placed[0].kind === 'hairpin') parks.push({ s0: placed[0].s0 - 800, s1: placed[1].s1 + 800 });
    s = placed[1].s1 + gap * (0.8 + r() * 0.2); // never longer than `gap`, so the last one always fits
  }
  return { curves, parks };
}
const inZones = (zones, y, m = 0) => zones.some((z) => y > z.s0 - m && y < z.s1 + m);

// construction zones close one oncoming lane; oncoming cars merge around them
function roadworks(r, L, curves) {
  const works = [];
  for (let y = 2400; y < L - 1600; y += 2200 + Math.floor(r() * 1800)) {
    const w = { lane: r() < 0.55 ? 0 : 1, y0: y, y1: y + 150 + Math.floor(r() * 90) };
    if (!curves.some((c) => c.kind === 'hairpin' && w.y1 > c.s0 - 250 && w.y0 < c.s1 + 250)) works.push(w);
  }
  return works;
}

// two snacks that heal (small, big) and espresso for a boost
function snacks(r, L, works, [small, big]) {
  const pickups = [];
  for (let y = 1300; y < L - 700; y += 600 + Math.floor(r() * 600)) {
    const k = r();
    const kind = k < 0.38 ? small : k < 0.66 ? big : 'espresso';
    let lane = Math.floor(r() * 4);
    if (works.some((w) => w.lane === lane && y > w.y0 - 80 && y < w.y1 + 80)) lane = (lane + 2) % 4;
    pickups.push({ id: pickups.length, lane, y, kind });
  }
  return pickups;
}

// lane 2 / lane 3 / oncoming: each type(k) picks a vehicle from one random number
function traffic(r, L, cols, [slow, fast, onc]) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const vehicles = [];
  const add = (lane, y, v, type, c) => vehicles.push({ id: vehicles.length, lane, y0: y, v, type, c, w: VEH[type].w, h: VEH[type].h });
  for (let y = 520; y < L + 400;) {
    const type = slow(r());
    add(2, y, SAME_SPEED[2], type, pick(cols));
    y += VEH[type].h + 240 + Math.floor(r() * 260);
  }
  for (let y = 760; y < L + 400;) {
    const type = fast(r());
    add(3, y, SAME_SPEED[3], type, pick(cols));
    y += VEH[type].h + 280 + Math.floor(r() * 300);
  }
  // enough oncoming traffic for a ~5 minute race
  for (let y = 900; y < L - ONC_SPEED * 420;) {
    const type = onc(r());
    add(r() < 0.5 ? 0 : 1, y, ONC_SPEED, type, pick(cols));
    y += VEH[type].h + 380 + Math.floor(r() * 520);
  }
  return vehicles;
}

// Alexanderplatz -> Brandenburger Tor. Everything is generated from the seed.
export function makeBerlin(seed = 1) {
  const r = rng(seed);
  const L = 20000;
  const START = 2400, END = L - 1700; // straight start (TV tower) and straight run to the gate
  const { curves, parks } = layout(r, ['sweep', 'switch', 'sweep', 'switch'], START, END);

  // East Side Gallery: a long painted wall on a stretch without switchbacks
  const GAL = 3000;
  let g0 = 4500;
  while (g0 < L - GAL - 1000 && (inZones(parks, g0) || inZones(parks, g0 + GAL) || parks.some((z) => z.s0 > g0 && z.s0 < g0 + GAL))) g0 += 250;

  const works = roadworks(r, L, curves);
  const pickups = snacks(r, L, works, ['pretzel', 'doner']);
  const vehicles = traffic(r, L, CAR_COLS, [
    (k) => (k < 0.22 ? 'tram' : k < 0.45 ? 'truck' : 'car'),
    (k) => (k < 0.2 ? 'truck' : 'car'),
    (k) => (k < 0.18 ? 'truck' : 'car'),
  ]);

  return {
    id: 'berlin', name: 'BERLIN', finish: 'BRANDENBURGER TOR', km: 5.6, seed, length: L, road: '#4b4c56',
    curves, parks, works, pickups, vehicles,
    monuments: [{ kind: 'tower', y: 1100 }, { kind: 'gallery', y0: g0, y1: g0 + GAL }, { kind: 'gate', y: L }],
  };
}

const ITALIA_COLS = ['#d9534f', '#9fd8c9', '#e6c229', '#f4f1e8', '#7fd1b9', '#3a6ea5', '#c9c9c9', '#2f7d4f', '#f2a65a'];

// Amalfi coast -> Colosseo. The coast road runs along the sea (left) under cliffs with houses and
// lemon trees (right), with sweepers along the sea; three switchbacks climb through the hills; the last stretch runs into Rome.
export function makeItalia(seed = 1) {
  const r = rng(seed ^ 0x5eed17a);
  const L = 21000;
  const START = 2200, END = L - 2200; // coast at the start, a long straight through Rome at the end
  const { curves, parks } = layout(r, ['sweep', 'switch', 'switch', 'switch'], START, END);
  const rome = { s0: END + 400, s1: L + 900 };

  // the Leaning Tower stands on the cliffs halfway, away from the switchbacks
  let pisa = Math.round(L * 0.45);
  while (pisa < END && (inZones(parks, pisa, 300) || curves.some((c) => pisa > c.s0 - 200 && pisa < c.s1 + 200))) pisa += 200;

  const works = roadworks(r, L, curves);
  const pickups = snacks(r, L, works, ['croissant', 'pizza']);
  const vehicles = traffic(r, L, ITALIA_COLS, [
    (k) => (k < 0.22 ? 'bus' : k < 0.62 ? 'fiat' : 'car'),
    (k) => (k < 0.3 ? 'vespa' : k < 0.7 ? 'fiat' : 'car'),
    (k) => (k < 0.25 ? 'vespa' : k < 0.6 ? 'fiat' : k < 0.7 ? 'truck' : 'car'),
  ]);

  return {
    id: 'italia', name: 'ITALIA', finish: 'COLOSSEO, ROMA', km: 5.9, seed, length: L, road: '#58534d',
    curves, parks, rome, works, pickups, vehicles,
    monuments: [{ kind: 'pisa', y: pisa }, { kind: 'colosseum', y: L - 700 }, { kind: 'arch', y: L }],
  };
}

export const TRACKS = { berlin: makeBerlin, italia: makeItalia };

export const vehY = (v, t) => v.y0 + v.v * t + (v.dy || 0); // dy = how far a crash shoved it

// Road curvature at distance s (1/px, + = turning right). Eases in and out over each turn's ramp.
export function curvAt(track, s) {
  const c = track.curves;
  if (!c || !c.length) return 0;
  let lo = 0, hi = c.length - 1, idx = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].s0 <= s) { idx = m; lo = m + 1; } else hi = m - 1; }
  if (idx < 0) return 0;
  const q = c[idx];
  if (s >= q.s1) return 0;
  return q.k * Math.min(1, (s - q.s0) / q.ramp, (q.s1 - s) / q.ramp);
}

// The road centre line in map coordinates (X east, Y north), sampled every PSTEP px of road.
// Positions on the road are (s, x): distance along it and the same x as on a straight (lane centres 68..164).
export const PSTEP = 4, ROAD_MID = 116;
const paths = new WeakMap();
export function pathOf(track) {
  let P = paths.get(track);
  if (P) return P;
  const s0 = -800, n = Math.ceil((track.length + 1600 - s0) / PSTEP) + 1;
  P = { s0, n, x: new Float64Array(n), y: new Float64Array(n), a: new Float64Array(n) };
  let x = 0, y = s0, a = 0;
  for (let i = 0; i < n; i++) {
    P.x[i] = x; P.y[i] = y; P.a[i] = a;
    const s = s0 + i * PSTEP, am = a + curvAt(track, s + PSTEP / 2) * PSTEP / 2;
    a += curvAt(track, s + PSTEP / 2) * PSTEP;
    x += Math.sin(am) * PSTEP; y += Math.cos(am) * PSTEP;
  }
  paths.set(track, P);
  return P;
}
// Map position + heading (radians clockwise from north) of road point (s, lateral x).
export function roadPos(track, s, lx = ROAD_MID) {
  const P = pathOf(track);
  const f = clamp((s - P.s0) / PSTEP, 0, P.n - 1.001), i = Math.floor(f), u = f - i;
  const a = P.a[i] + (P.a[i + 1] - P.a[i]) * u, d = lx - ROAD_MID;
  return { x: P.x[i] + (P.x[i + 1] - P.x[i]) * u + Math.cos(a) * d, y: P.y[i] + (P.y[i + 1] - P.y[i]) * u - Math.sin(a) * d, a };
}

// Lateral position; oncoming cars merge into the other oncoming lane around construction.
export function vehX(track, v, y) {
  let x = laneX(v.lane) + (v.kx || 0); // kx = sideways knock from a crash
  if (v.v >= 0) return x;
  const other = v.lane === 0 ? 1 : 0;
  for (const w of track.works) {
    if (w.lane !== v.lane || y < w.y0 - 90 || y > w.y1 + 130) continue;
    const m = clamp01((w.y1 + 120 - y) / 50) * clamp01((y - (w.y0 - 85)) / 50);
    x += m * (other - v.lane) * LANE;
  }
  return x;
}
