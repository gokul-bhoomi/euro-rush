import { rng, clamp, clamp01 } from './util.js';
import { VEH, laneX, LANE } from './config.js';

const CAR_COLS = ['#efe6c8', '#3a6ea5', '#1f1f22', '#c9c9c9', '#f2c14e', '#9a2f2f', '#e8e8e8', '#2f7d4f', '#7a7f8c'];

export const SAME_SPEED = [0, 0, 48, 66]; // lanes 2 and 3 (trams/trucks are slower in lane 2)
export const ONC_SPEED = -75;            // both oncoming lanes share one speed so merges never overlap
export const HAIRPIN_R = 90;            // centre-line radius of a hairpin (px); legs of a switchback sit 2R apart
const RAMP = 40;                         // curvature eases in/out over this distance so grip loads up smoothly

// A turn of `angle` radians (+ = right) with centre-line radius R, starting at s0.
const turn = (s0, angle, R, kind) => ({ s0, s1: s0 + Math.abs(angle) * R + RAMP, k: Math.sign(angle) / R, ramp: RAMP, kind });

// Alexanderplatz -> Brandenburger Tor. Everything is generated from the seed.
export function makeBerlin(seed = 1) {
  const r = rng(seed);
  const L = 30000;
  const pick = (a) => a[Math.floor(r() * a.length)];

  // The road is a real path: long straights, a few gentle sweepers you can take flat out, and two
  // switchbacks (a 180-degree hairpin, a short leg back down the screen, a hairpin the other way)
  // that you have to brake for. Every feature ends heading north again.
  const curves = [], parks = [];
  let s = 2600;
  for (const f of ['sweep', 'switch', 'sweep', 'switch', 'sweep']) {
    const dir = r() < 0.5 ? -1 : 1;
    if (f === 'sweep') {
      const a = (0.45 + r() * 0.25) * dir, R = 450 + Math.floor(r() * 250);
      const c1 = turn(s, a, R, 'sweep'), c2 = turn(c1.s1 + 300 + Math.floor(r() * 400), -a, R, 'sweep');
      curves.push(c1, c2); s = c2.s1;
    } else {
      const h1 = turn(s, Math.PI * dir, HAIRPIN_R, 'hairpin');
      const h2 = turn(h1.s1 + 300 + Math.floor(r() * 120), -Math.PI * dir, HAIRPIN_R, 'hairpin');
      curves.push(h1, h2); parks.push({ s0: h1.s0 - 800, s1: h2.s1 + 800 }); s = h2.s1;
    }
    s += 3300 + Math.floor(r() * 1200);
  }
  const inPark = (y, m = 0) => parks.some((z) => y > z.s0 - m && y < z.s1 + m);
  const nearHairpin = (y0, y1, m) => curves.some((c) => c.kind === 'hairpin' && y1 > c.s0 - m && y0 < c.s1 + m);

  // East Side Gallery: 4km of painted wall on a stretch without switchbacks
  let g0 = 12000;
  while (inPark(g0, 0) || inPark(g0 + 4000, 0) || parks.some((z) => z.s0 > g0 && z.s0 < g0 + 4000)) g0 += 250;

  // construction zones close one oncoming lane; oncoming cars merge around them
  const works = [];
  for (let y = 2400; y < L - 1600; y += 2200 + Math.floor(r() * 1800)) {
    const w = { lane: r() < 0.55 ? 0 : 1, y0: y, y1: y + 150 + Math.floor(r() * 90) };
    if (!nearHairpin(w.y0, w.y1, 250)) works.push(w);
  }
  const inWorks = (lane, y, m = 0) => works.some((w) => w.lane === lane && y > w.y0 - m && y < w.y1 + m);

  const pickups = [];
  for (let y = 1300; y < L - 700; y += 600 + Math.floor(r() * 600)) {
    const k = r();
    const kind = k < 0.38 ? 'pretzel' : k < 0.66 ? 'doner' : 'espresso';
    let lane = Math.floor(r() * 4);
    if (inWorks(lane, y, 80)) lane = (lane + 2) % 4;
    pickups.push({ id: pickups.length, lane, y, kind });
  }

  const vehicles = [];
  const add = (lane, y, v, type, c) => vehicles.push({ id: vehicles.length, lane, y0: y, v, type, c, w: VEH[type].w, h: VEH[type].h });
  for (let y = 520; y < L + 400;) {
    const k = r(), type = k < 0.22 ? 'tram' : k < 0.45 ? 'truck' : 'car';
    add(2, y, SAME_SPEED[2], type, pick(CAR_COLS));
    y += VEH[type].h + 240 + Math.floor(r() * 260);
  }
  for (let y = 760; y < L + 400;) {
    const type = r() < 0.2 ? 'truck' : 'car';
    add(3, y, SAME_SPEED[3], type, pick(CAR_COLS));
    y += VEH[type].h + 280 + Math.floor(r() * 300);
  }
  // enough oncoming traffic for a ~7 minute race
  for (let y = 900; y < L - ONC_SPEED * 420;) {
    const type = r() < 0.18 ? 'truck' : 'car';
    add(r() < 0.5 ? 0 : 1, y, ONC_SPEED, type, pick(CAR_COLS));
    y += VEH[type].h + 380 + Math.floor(r() * 520);
  }

  return {
    name: 'BERLIN', finish: 'BRANDENBURGER TOR', km: 8.4, seed, length: L, road: '#4b4c56',
    curves, parks, works, pickups, vehicles,
    monuments: [{ kind: 'tower', y: 1100 }, { kind: 'gallery', y0: g0, y1: g0 + 4000 }, { kind: 'gate', y: L }],
  };
}

export const vehY = (v, t) => v.y0 + v.v * t;

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
  let x = laneX(v.lane);
  if (v.v >= 0) return x;
  const other = v.lane === 0 ? 1 : 0;
  for (const w of track.works) {
    if (w.lane !== v.lane || y < w.y0 - 90 || y > w.y1 + 130) continue;
    const m = clamp01((w.y1 + 120 - y) / 50) * clamp01((y - (w.y0 - 85)) / 50);
    x += m * (other - v.lane) * LANE;
  }
  return x;
}
