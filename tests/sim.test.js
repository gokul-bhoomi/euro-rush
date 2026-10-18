import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace, stepRace, rank } from '../src/sim.js';
import { makeBerlin, vehX, roadPos, pathOf, curvAt, HAIRPIN_R } from '../src/track.js';
import { TUNE, STEP, laneX, VEH } from '../src/config.js';

const emptyTrack = (extra = {}) => ({ seed: 1, length: 3000, km: 1, works: [], pickups: [], vehicles: [], monuments: [], ...extra });
const veh = (id, lane, y0, v, type = 'car') => ({ id, lane, y0, v, type, c: '#fff', ...VEH[type] });

function racing(track, n = 1) { const r = createRace(track, n); r.phase = 'race'; return r; }
function run(r, inputs, seconds) { for (let i = 0; i < Math.round(seconds / STEP); i++) stepRace(r, inputs, STEP); }
const GAS = { gas: true };

test('countdown then race starts', () => {
  const r = createRace(emptyTrack(), 1);
  run(r, [GAS], 2.9);
  assert.equal(r.phase, 'countdown');
  assert.equal(r.players[0].y, 0);
  run(r, [GAS], 0.2);
  assert.equal(r.phase, 'race');
});

test('accelerating reaches but does not exceed max speed', () => {
  const r = racing(emptyTrack({ length: 99999 }));
  run(r, [GAS], 1);
  assert.ok(r.players[0].v > 40 && r.players[0].v < TUNE.maxSpeed);
  run(r, [GAS], 5);
  assert.ok(r.players[0].v > TUNE.maxSpeed * 0.65, 'quick pull up to cruising speed');
  run(r, [GAS], 7);
  assert.ok(r.players[0].v < TUNE.maxSpeed * 0.97, 'the last stretch to top speed is slow');
  run(r, [GAS], 10);
  assert.equal(r.players[0].v, TUNE.maxSpeed);
  run(r, [{ brake: true }], 2);
  assert.equal(r.players[0].v, 0);
});

test('steering moves sideways and stops at the sidewalk edge', () => {
  const r = racing(emptyTrack({ length: 99999 }));
  run(r, [GAS], 1);
  const x0 = r.players[0].x;
  run(r, [{ gas: true, steer: -1 }], 0.2);
  assert.ok(r.players[0].x < x0);
  run(r, [{ gas: true, steer: -1 }], 5);
  assert.equal(r.players[0].x, 40);
  assert.ok(r.players[0].v <= TUNE.sidewalkMax + 1e-9, 'sidewalk slows you down');
});

test('rear-ending slow traffic costs HP and keeps you behind it', () => {
  const r = racing(emptyTrack({ length: 99999, vehicles: [veh(0, 3, 200, 40)] }));
  run(r, [GAS], 6);
  const p = r.players[0];
  assert.ok(p.hp < 100 && p.hp > 80, `hp ${p.hp}`);
  assert.ok(p.y < 200 + 40 * 6, 'still behind the car');
  assert.ok(p.stats.crashes >= 1);
});

test('head-on with oncoming traffic hurts much more than rear-ending', () => {
  const r = racing(emptyTrack({ vehicles: [veh(0, 3, 400, -75)] }));
  run(r, [GAS], 4);
  const p = r.players[0];
  assert.ok(100 - p.hp >= 20, `damage ${100 - p.hp}`);
  assert.ok(r.veh[0].gone, 'oncoming car spins off');
});

test('snacks heal (capped at 100) and espresso boosts past max speed', () => {
  const r = racing(emptyTrack({ length: 99999, pickups: [
    { id: 0, lane: 3, y: 150, kind: 'doner' }, { id: 1, lane: 3, y: 300, kind: 'pretzel' }, { id: 2, lane: 3, y: 1200, kind: 'espresso' },
  ] }));
  r.players[0].hp = 50;
  run(r, [GAS], 4.5);
  assert.equal(r.players[0].hp, 95);
  run(r, [GAS], 7);
  assert.ok(r.taken.has(2));
  assert.equal(r.players[0].stats.espressos, 1);
  const peak = { v: 0 };
  const r2 = racing(emptyTrack({ length: 99999, pickups: [{ id: 0, lane: 3, y: 600, kind: 'espresso' }] }));
  for (let i = 0; i < 600; i++) { stepRace(r2, [GAS], STEP); peak.v = Math.max(peak.v, r2.players[0].v); }
  assert.ok(peak.v > TUNE.maxSpeed, `peak ${peak.v}`);
});

test('destroyed car is towed with a 10s penalty, then comes back', () => {
  const r = racing(emptyTrack({ vehicles: [veh(0, 3, 400, -75)] }));
  r.players[0].hp = 5;
  run(r, [GAS], 4);
  const p = r.players[0];
  assert.ok(p.tow > 0 || p.invuln > 0);
  assert.equal(p.penalty, TUNE.towPenalty);
  assert.equal(p.stats.towed, 1);
  run(r, [GAS], TUNE.towTime + 0.1);
  assert.equal(p.tow, 0);
  assert.equal(p.hp, TUNE.towHp);
});

test('side bump: the car that steered in is the rammer', () => {
  const r = racing(emptyTrack({ length: 99999 }), 2);
  const [a, b] = r.players;
  a.x = laneX(2) + 10; b.x = laneX(3) - 10; a.y = b.y = 100; a.v = b.v = 100; // overlapping side by side
  stepRace(r, [{ gas: true, steer: 1 }, { gas: true }], STEP);
  assert.equal(b.hp, 94, 'victim');
  assert.equal(a.hp, 97, 'rammer');
  assert.equal(a.stats.bumps, 1);
  assert.ok(b.v < a.v);
  assert.ok(b.wobble > 0);
  const hp = [a.hp, b.hp];
  a.x = b.x - 10; // still touching during the cooldown: no extra damage
  stepRace(r, [{ gas: true, steer: 1 }, { gas: true }], STEP);
  assert.deepEqual([a.hp, b.hp], hp);
});

test('finishing records time incl. penalty; the other player has 30s grace then DNF', () => {
  const r = racing(emptyTrack({ length: 500 }), 2);
  r.players[0].penalty = 10;
  run(r, [GAS, {}], 6);
  assert.ok(r.players[0].finish > 10);
  assert.equal(rank(r, r.players[0]), 1);
  assert.notEqual(r.deadline, null);
  run(r, [GAS, {}], TUNE.finishGrace);
  assert.equal(r.phase, 'done');
  assert.equal(r.players[1].dnf, true);
});

test('construction barrier stops you', () => {
  const r = racing(emptyTrack({ length: 99999, works: [{ lane: 3, y0: 400, y1: 550 }] }));
  run(r, [GAS], 6);
  const p = r.players[0];
  assert.ok(p.y < 400, `y ${p.y}`);
  assert.ok(p.hp < 100);
});

test('pushing against a barrier at low speed does not keep draining HP', () => {
  const r = racing(emptyTrack({ length: 99999, works: [{ lane: 3, y0: 400, y1: 550 }] }));
  run(r, [GAS], 6);
  const hp = r.players[0].hp;
  assert.ok(hp < 100, 'the first impact hurts');
  run(r, [GAS], 5);
  assert.equal(r.players[0].hp, hp);
});

test('oncoming cars merge into the other lane through construction', () => {
  const tr = emptyTrack({ works: [{ lane: 0, y0: 1000, y1: 1200 }] });
  const v = veh(0, 0, 0, -75);
  assert.equal(vehX(tr, v, 1100), laneX(1));
  assert.equal(vehX(tr, v, 2000), laneX(0));
  assert.equal(vehX(tr, v, 500), laneX(0));
});

test('Berlin track is deterministic per seed and traffic never overlaps in a lane', () => {
  assert.equal(JSON.stringify(makeBerlin(5)), JSON.stringify(makeBerlin(5)));
  assert.notEqual(JSON.stringify(makeBerlin(5)), JSON.stringify(makeBerlin(6)));
  const t = makeBerlin(3);
  const byLane = (f) => t.vehicles.filter(f).sort((a, b) => a.y0 - b.y0);
  for (const list of [byLane((v) => v.lane === 2), byLane((v) => v.lane === 3), byLane((v) => v.v < 0)]) {
    for (let i = 1; i < list.length; i++) {
      assert.ok(list[i].y0 - list[i - 1].y0 > (list[i].h + list[i - 1].h) / 2 + 20, 'gap between vehicles');
    }
  }
  const run2 = () => { const r = racing(makeBerlin(9), 2); run(r, [GAS, { gas: true, steer: -0.3 }], 20); return JSON.stringify(r.players); };
  assert.equal(run2(), run2());
});

test('Berlin has two switchbacks and two sweepers, never crosses itself, and ends heading north', () => {
  for (const seed of [1, 4, 9]) {
    const t = makeBerlin(seed);
    assert.equal(t.curves.filter((c) => c.kind === 'hairpin').length, 4, 'two switchbacks = four hairpins');
    assert.equal(t.curves.filter((c) => c.kind === 'sweep').length, 4);
    assert.equal(t.length, 20000);
    for (let i = 1; i < t.curves.length; i++) assert.ok(t.curves[i].s0 > t.curves[i - 1].s1, 'turns never overlap');
    assert.ok(t.curves.at(-1).s1 < t.length - 1500, 'straight run to the finish');
    assert.ok(Math.abs(roadPos(t, t.length).a) < 1e-6, 'finish line faces north');
    assert.equal(curvAt(t, 0), 0);
    // no two parts of the road (sidewalks included, 156px wide) overlap
    const P = pathOf(t);
    for (let i = 0; i < P.n; i += 6) for (let j = i + 90; j < P.n; j += 6) assert.ok(Math.hypot(P.x[i] - P.x[j], P.y[i] - P.y[j]) > 160);
    for (const w of t.works) assert.ok(!t.curves.some((c) => c.kind === 'hairpin' && w.y1 > c.s0 - 200 && w.y0 < c.s1 + 200), 'no roadworks in hairpins');
  }
});

const turnTrack = (k, angle) => emptyTrack({ length: 99999, curves: [{ s0: 1000, s1: 1000 + Math.abs(angle / k) + 40, k, ramp: 40, kind: 'x' }] });
function throughTurn(track, v, lane = 3) {
  const r = racing(track);
  const p = r.players[0];
  p.y = p.prevY = 600; p.x = laneX(lane); p.v = v;
  let maxDev = 0, drift = 0;
  for (let i = 0; p.y < track.curves[0].s1 + 200 && i < 5000; i++) {
    stepRace(r, [{ gas: p.v < v }], STEP);
    maxDev = Math.max(maxDev, Math.abs(p.x - laneX(lane)));
    drift = Math.max(drift, p.drift);
  }
  return { maxDev, drift, p };
}
const HAIRPIN = turnTrack(1 / HAIRPIN_R, Math.PI), SWEEP = turnTrack(1 / 450, 0.7);

test('sweepers can be taken flat out without drifting', () => {
  const { maxDev, drift, p } = throughTurn(SWEEP, TUNE.maxSpeed);
  assert.ok(maxDev < 1, `strayed ${maxDev}px`);
  assert.equal(drift, 0);
  assert.ok(p.v > TUNE.maxSpeed - 1);
});

test('a hairpin at ~120 km/h follows the lane by itself', () => {
  const { maxDev, drift } = throughTurn(HAIRPIN, 80);
  assert.ok(maxDev < 2, `strayed ${maxDev}px`);
  assert.equal(drift, 0);
});

test('a little too fast in a hairpin slides a bit wide, much too fast ends on the wall and costs speed', () => {
  const bit = throughTurn(HAIRPIN, 100);
  assert.ok(bit.drift > 0.15 && bit.maxDev > 4 && bit.maxDev < 40, `slid ${bit.maxDev}px`);
  const flat = throughTurn(HAIRPIN, TUNE.maxSpeed);
  assert.ok(flat.maxDev > 100, 'slid across to the outside wall');
  assert.ok(flat.p.v < 80, `kept ${flat.p.v}`);
});

test('the outside line of a hairpin can be taken faster, the inside line is shorter', () => {
  const left = turnTrack(-1 / HAIRPIN_R, -Math.PI); // lane 3 is on the outside of a left hairpin
  assert.equal(throughTurn(left, 130).drift, 0);
  const tIn = (() => { const r = racing(HAIRPIN); const p = r.players[0]; p.y = 900; p.v = 60; let n = 0; while (p.y < 1500) { stepRace(r, [{ gas: p.v < 60 }], STEP); n++; } return n; })();
  const tOut = (() => { const r = racing(left); const p = r.players[0]; p.y = 900; p.v = 60; let n = 0; while (p.y < 1500) { stepRace(r, [{ gas: p.v < 60 }], STEP); n++; } return n; })();
  assert.ok(tIn < tOut * 0.6, `inside ${tIn} vs outside ${tOut} steps at the same speed`);
});

test('sliding into the buildings costs a little HP once, not continuously', () => {
  const r = racing(emptyTrack({ length: 99999 }));
  run(r, [GAS], 4);
  run(r, [{ gas: true, steer: 1 }], 3);
  const p = r.players[0];
  assert.equal(p.x, 192);
  assert.equal(100 - p.hp, 4);
});

test('traffic and pickups stay in their lanes through a turn', () => {
  const tr = turnTrack(1 / 450, 0.7);
  assert.equal(vehX(tr, veh(0, 2, 0, 48), 1200), laneX(2));
  const r = racing({ ...tr, pickups: [{ id: 0, lane: 3, y: 1200, kind: 'doner' }] });
  run(r, [GAS], 12);
  assert.equal(r.players[0].stats.snacks, 1, 'stayed in lane through the turn and got the snack');
});
