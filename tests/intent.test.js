// Design-intent tests: the decisions the game's owner made, written down as tests so a later change
// can't quietly drift away from them. sim.test.js checks that the mechanics work; this file checks
// that the game is still the game that was asked for. Each test quotes or paraphrases the decision.
//
// If one of these fails, your change goes against a design decision. Don't just edit the test: ask
// the owner first, and change the test only once they agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRace, stepRace, rank } from '../src/sim.js';
import { makeBerlin, makeItalia, roadPos, pathOf, SAME_SPEED, ONC_SPEED } from '../src/track.js';
import { TUNE, DMG, HEAL, STEP, KMH, W, H, HW, MID, PAL, laneX } from '../src/config.js';

const SEEDS = [1, 2, 3, 7, 42];
const racing = (track, n = 2) => { const r = createRace(track, n); r.phase = 'race'; return r; };
const run = (r, inputs, s) => { for (let i = 0; i < Math.round(s / STEP); i++) stepRace(r, inputs, STEP); };
const empty = (extra = {}) => ({ seed: 1, length: 99999, km: 1, works: [], pickups: [], vehicles: [], monuments: [], ...extra });

// A careful driver on an empty road: flat out, braking for hairpins, keeping to lane 3.
function cleanLap(track) {
  const r = racing({ ...track, vehicles: [] }, 1), p = r.players[0];
  while (p.finish == null && r.t < 600) {
    const hp = track.curves.find((c) => c.kind === 'hairpin' && c.s1 > p.y);
    const d = hp ? hp.s0 - p.y : Infinity;
    const target = hp && (d < 0 || d < (p.v * p.v - 6400) / 300 + 40) ? 80 : Infinity;
    stepRace(r, [{ gas: p.v < target, brake: p.v > target + 5, steer: Math.max(-1, Math.min(1, (164 - p.x) / 20)) }], STEP);
  }
  return p.finish;
}

// ---------- how a race works ----------

test('intent: both players race at the same time (not taking turns)', () => {
  const r = racing(empty());
  run(r, [{ gas: true }, { gas: true }], 3);
  assert.ok(r.players.every((p) => p.y > 100), 'both cars move in the same race');
});

test('intent: the score is the time to the finish, penalties included, and the fastest time wins', () => {
  const r = racing(empty({ length: 600 }));
  r.players[0].penalty = 10; // P1 got towed once
  run(r, [{ gas: true }, { gas: true }], 20);
  const [p1, p2] = r.players;
  assert.ok(p1.finish - p2.finish > 9, 'the penalty is added to the finish time');
  assert.equal(rank(r, p2), 1, 'the lower total time ranks first');
});

test('intent: a destroyed car is towed with a +10 s penalty and keeps racing (nobody is knocked out)', () => {
  assert.equal(TUNE.towPenalty, 10);
  const r = racing(empty(), 1), p = r.players[0];
  p.hp = 0.5; p.v = 100;
  r.players[0].hp = 0; stepRace(r, [{}], STEP);
  run(r, [{}], TUNE.towTime + 0.5);
  assert.ok(p.hp > 0 && p.tow === 0 && p.finish == null && !p.dnf, 'back in the race after the tow');
  assert.equal(p.penalty, 10);
});

test('intent: players can crash into each other to slow each other down', () => {
  const r = racing(empty());
  const [a, b] = r.players;
  a.x = laneX(3); b.x = laneX(3) - 18; a.y = b.y = 500; a.v = b.v = 120;
  run(r, [{ gas: true }, { gas: true, steer: 1 }], 0.5);
  assert.ok(a.stats.bumps + b.stats.bumps > 0, 'a bump happened');
  assert.ok(a.hp < 100, 'the car that got rammed took damage');
});

test('intent: controls are just accelerate, brake and steer', () => {
  const r = racing(empty(), 1), p = r.players[0];
  run(r, [{ gas: true }], 2); const fast = p.v;
  run(r, [{ gas: true, steer: -1 }], 0.3); assert.ok(p.x < laneX(3), 'steer moves sideways');
  run(r, [{ brake: true }], 0.5); assert.ok(p.v < fast, 'brake slows down');
  assert.ok(fast > 50, 'gas speeds up');
});

// ---------- traffic and obstacles ----------

test('intent: oncoming lanes are emptier but their traffic is faster (high risk, high damage)', () => {
  assert.ok(Math.abs(ONC_SPEED) > Math.max(...SAME_SPEED), 'oncoming cars are faster');
  assert.ok(DMG.headOn > DMG.rearEnd * 2, 'a head-on crash hurts much more than a rear-end');
  for (const seed of SEEDS) {
    const t = makeBerlin(seed);
    const onc = t.vehicles.filter((v) => v.v < 0 && v.y0 < t.length).length;
    const same = t.vehicles.filter((v) => v.v > 0 && v.y0 < t.length).length;
    assert.ok(onc < same, `seed ${seed}: ${onc} oncoming vs ${same} in our direction`);
  }
});

test('intent: oncoming traffic is spread over both oncoming lanes, not all in one', () => {
  for (const seed of SEEDS) {
    const onc = makeBerlin(seed).vehicles.filter((v) => v.v < 0);
    const share = onc.filter((v) => v.lane === 0).length / onc.length;
    assert.ok(onc.every((v) => v.lane === 0 || v.lane === 1), 'oncoming traffic only uses the two left lanes');
    assert.ok(share > 0.3 && share < 0.7, `seed ${seed}: ${Math.round(share * 100)}% in lane 0`);
  }
});

test('intent: the road is not too busy (calm enough to read on a TV)', () => {
  for (const seed of SEEDS) {
    const t = makeBerlin(seed);
    const perKm = t.vehicles.filter((v) => v.y0 < t.length).length / t.km;
    assert.ok(perKm < 40, `seed ${seed}: ${perKm.toFixed(0)} vehicles per km`);
  }
});

test('intent: construction zones close an oncoming lane, never ours', () => {
  for (const seed of SEEDS) {
    const w = makeBerlin(seed).works;
    assert.ok(w.length >= 3, `seed ${seed}: only ${w.length} construction zones`);
    assert.ok(w.every((z) => z.lane === 0 || z.lane === 1));
  }
});

// ---------- snacks ----------

test('intent: Berlin snacks are Brezel and Döner (heal damage) plus espresso (speed boost)', () => {
  for (const seed of SEEDS) {
    const kinds = new Set(makeBerlin(seed).pickups.map((k) => k.kind));
    assert.deepEqual([...kinds].sort(), ['doner', 'espresso', 'pretzel'], `seed ${seed}`);
  }
  assert.ok(HEAL.doner > HEAL.pretzel && HEAL.pretzel > 0, 'Döner heals more than a Brezel');
  assert.ok(TUNE.boostMax > TUNE.maxSpeed, 'espresso takes you past normal top speed');
});

// ---------- speed and feel ----------

test('intent: top speed is 330 km/h and should feel hard to reach', () => {
  assert.equal(TUNE.maxSpeed * KMH, 330);
  const r = racing(empty(), 1), p = r.players[0];
  run(r, [{ gas: true }], 8);
  assert.ok(p.v < TUNE.maxSpeed * 0.97, `already at ${Math.round(p.v * KMH)} km/h after 8 s`);
});

test('intent: the race is short enough for quick rounds (about 2 minutes on a clean run)', () => {
  for (const seed of [1, 7, 42]) {
    const t = makeBerlin(seed);
    assert.ok(t.km <= 6, `${t.km} km`);
    const time = cleanLap(t);
    assert.ok(time > 90 && time < 140, `seed ${seed}: clean run takes ${time.toFixed(0)} s`);
  }
});

// ---------- curves ----------

test('intent: curves are a few mountain-style hairpin switchbacks, not lots of frequent bends', () => {
  for (const seed of SEEDS) {
    const t = makeBerlin(seed), c = t.curves;
    assert.ok(c.length <= 8, `seed ${seed}: ${c.length} turns is too many`);
    assert.ok(c.filter((x) => x.kind === 'hairpin').length >= 4, 'at least two switchbacks (two hairpins each)');
    // features (a switchback or a pair of sweepers) are separated by long straights
    const feats = [];
    for (let i = 0; i < c.length; i += 2) feats.push([c[i].s0, c[i + 1].s1]);
    for (let i = 1; i < feats.length; i++) assert.ok(feats[i][0] - feats[i - 1][1] > 1500, `seed ${seed}: straight before feature ${i} too short`);
  }
});

test('intent: a switchback really turns around: the road runs back down the screen, side by side with itself', () => {
  for (const seed of SEEDS) {
    const t = makeBerlin(seed), P = pathOf(t);
    for (const h of t.curves.filter((c) => c.kind === 'hairpin').filter((_, i) => i % 2 === 0)) {
      const mid = roadPos(t, h.s1 + 50);
      assert.ok(Math.abs(Math.abs(mid.a) - Math.PI) < 0.05, `seed ${seed}: heading after the hairpin is ${mid.a.toFixed(2)}, not back down`);
      // the leg going down runs next to the leg coming up (like the photo), not far away
      const up = roadPos(t, h.s0 - 50);
      assert.ok(Math.abs(Math.abs(mid.x - up.x) - 180) < 10, 'legs ~180px apart');
    }
    assert.ok(P.n > 0);
  }
});

test('intent: drift only happens when you take a hairpin too fast; it is mild, not a spin-out', () => {
  // flat out (normal top speed, no espresso) through a whole track, braking for hairpins: no drift
  // anywhere. Above top speed on an espresso boost a sweeper may slide a little - that is allowed.
  const t = makeBerlin(7), r = racing({ ...t, vehicles: [], pickups: [] }, 1), p = r.players[0];
  let drift = 0;
  while (p.finish == null && r.t < 600) {
    const hp = t.curves.find((c) => c.kind === 'hairpin' && c.s1 > p.y);
    const d = hp ? hp.s0 - p.y : Infinity;
    const target = hp && (d < 0 || d < (p.v * p.v - 6400) / 300 + 40) ? 80 : Infinity;
    stepRace(r, [{ gas: p.v < target, brake: p.v > target + 5, steer: Math.max(-1, Math.min(1, (164 - p.x) / 20)) }], STEP);
    drift = Math.max(drift, p.drift);
  }
  assert.equal(drift, 0, 'sweepers and well-braked hairpins never drift');
  // too fast into a hairpin: you slide wide and lose speed, but you are not wrecked
  const h = { s0: 1000, s1: 1000 + Math.PI * 90 + 40, k: 1 / 90, ramp: 40, kind: 'hairpin' };
  const r2 = racing(empty({ curves: [h] }), 1), q = r2.players[0];
  q.y = 700; q.v = TUNE.maxSpeed;
  while (q.y < h.s1 + 200) stepRace(r2, [{ gas: true }], STEP);
  assert.ok(q.hp >= 90, `lost ${100 - q.hp} HP from one bad hairpin`);
  assert.ok(q.v > 30, 'still moving afterwards');
});

// ---------- Berlin ----------

test('intent: Berlin runs from Alexanderplatz past famous monuments to the Brandenburger Tor', () => {
  const t = makeBerlin(1), m = Object.fromEntries(t.monuments.map((x) => [x.kind, x]));
  assert.ok(m.tower && m.tower.y < 2000, 'Fernsehturm (TV tower) near the start');
  assert.ok(m.gallery && m.gallery.y1 - m.gallery.y0 >= 2000, 'East Side Gallery along the way');
  assert.ok(m.gate && m.gate.y === t.length, 'Brandenburger Tor at the finish line');
  assert.equal(t.finish, 'BRANDENBURGER TOR');
  assert.equal(t.name, 'BERLIN');
});

// ---------- Italia ----------

test('intent: Italia runs from the Amalfi coast to the Colosseo, with croissant, pizza and espresso', () => {
  const t = makeItalia(1), m = Object.fromEntries(t.monuments.map((x) => [x.kind, x]));
  assert.equal(t.name, 'ITALIA');
  assert.equal(t.finish, 'COLOSSEO, ROMA');
  assert.ok(m.colosseum && m.arch && m.arch.y === t.length, 'Colosseum and the finish arch in Rome');
  assert.ok(t.curves[0].s0 > 1500 && !t.parks.some((z) => z.s0 < 3000), 'starts on the coast, not in the hills');
  for (const seed of SEEDS) {
    const kinds = new Set(makeItalia(seed).pickups.map((k) => k.kind));
    assert.deepEqual([...kinds].sort(), ['croissant', 'espresso', 'pizza'], `seed ${seed}`);
  }
  assert.ok(HEAL.pizza > HEAL.croissant && HEAL.croissant > 0, 'pizza heals more than a croissant');
});

test('intent: Italia keeps the same rules - emptier/faster oncoming lanes, calm traffic, roadworks only oncoming', () => {
  for (const seed of SEEDS) {
    const t = makeItalia(seed);
    const onc = t.vehicles.filter((v) => v.v < 0 && v.y0 < t.length), same = t.vehicles.filter((v) => v.v > 0 && v.y0 < t.length);
    assert.ok(onc.length < same.length, `seed ${seed}: ${onc.length} oncoming vs ${same.length}`);
    const share = onc.filter((v) => v.lane === 0).length / onc.length;
    assert.ok(share > 0.3 && share < 0.7, `seed ${seed}: ${Math.round(share * 100)}% in lane 0`);
    assert.ok((onc.length + same.length) / t.km < 40, `seed ${seed}: too busy`);
    assert.ok(t.works.length >= 3 && t.works.every((z) => z.lane === 0 || z.lane === 1), `seed ${seed}: roadworks`);
  }
});

test('intent: Italia is also a short race with a few hairpin switchbacks', () => {
  for (const seed of [1, 7, 42]) {
    const t = makeItalia(seed), c = t.curves;
    assert.ok(t.km <= 6, `${t.km} km`);
    assert.ok(c.length <= 8, `seed ${seed}: ${c.length} turns is too many`);
    assert.ok(c.filter((x) => x.kind === 'hairpin').length >= 4, 'at least two switchbacks');
    const feats = [];
    for (let i = 0; i < c.length; i += 2) feats.push([c[i].s0, c[i + 1].s1]);
    for (let i = 1; i < feats.length; i++) assert.ok(feats[i][0] - feats[i - 1][1] > 1500, `seed ${seed}: straight before feature ${i} too short`);
    const time = cleanLap(t);
    assert.ok(time > 90 && time < 140, `seed ${seed}: clean run takes ${time.toFixed(0)} s`);
  }
});

// ---------- look ----------

test('intent: retro pixel look, split-screen for two players on one TV', () => {
  assert.deepEqual([W, H], [480, 270], '16:9 low-res pixel canvas');
  assert.equal(HW * 2 + MID, W, 'two equal halves with a progress strip in the middle');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /image-rendering:\s*pixelated/, 'pixels are scaled up crisp, not blurred');
  assert.match(html, /Press\+Start\+2P/, 'pixel font');
});

test('intent: colours are the Riviera Pop palette chosen in the mockup', () => {
  const mock = readFileSync(new URL('../mockup/index.html', import.meta.url), 'utf8');
  const block = mock.slice(mock.indexOf('riviera:{'), mock.indexOf('night:{'));
  for (const key of ['sil', 'ui', 'ui2', 'text', 'accent', 'dim', 'p1', 'p2', 'g1', 'g2', 'road']) {
    const want = block.match(new RegExp(`\\b${key}:'(#[0-9a-f]{6})'`))?.[1];
    assert.equal(PAL[key], want, `PAL.${key}`);
  }
  assert.ok(block.includes(PAL.sky.map((c) => `'${c}'`).join(',')), 'sky gradient');
});
