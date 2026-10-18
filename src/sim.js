// Pure race simulation: no DOM, deterministic for a given track + inputs. Unit-tested in tests/sim.test.js.
import { TUNE, DMG, HEAL, CAR_W, CAR_H, laneX, ROAD_X, ROAD_R, LANE } from './config.js';
import { clamp, clamp01 } from './util.js';
import { vehY, vehX, curvAt, ROAD_MID } from './track.js';

export function createRace(track, nPlayers = 2) {
  const players = [];
  for (let i = 0; i < nPlayers; i++) {
    players.push({
      id: i, x: laneX(i === 0 ? 3 : 2), y: 0, prevY: 0, v: 0, vx: 0, lat: 0, slip: 0, drift: 0, hp: 100, boost: 0,
      tow: 0, invuln: 0, hitCd: 0, wobble: 0, penalty: 0, finish: null, dnf: false,
      stats: { crashes: 0, bumps: 0, snacks: 0, espressos: 0, topSpeed: 0, towed: 0 },
    });
  }
  return {
    track, t: 0, phase: 'countdown', countdown: 3, players,
    veh: track.vehicles.map((v) => ({ ...v, gone: false, goneAt: 0, spin: 1 })),
    taken: new Set(), bumpCd: 0, deadline: null, events: [],
  };
}

// inputs: [{gas, brake, steer:-1..1}, ...] indexed by player id
export function stepRace(R, inputs, dt) {
  if (R.phase === 'countdown') {
    R.countdown -= dt;
    if (R.countdown <= 0) { R.phase = 'race'; R.events.push({ type: 'go' }); }
    return;
  }
  if (R.phase === 'done') return;
  R.t += dt;
  for (const p of R.players) stepPlayer(R, p, racing(p) ? inputs[p.id] || {} : { brake: true }, dt);
  if (R.players.length > 1) playerBump(R, inputs, dt);

  const active = R.players.filter(racing);
  if (active.length === 0 || (R.deadline != null && R.t >= R.deadline)) {
    for (const p of active) p.dnf = true;
    R.phase = 'done';
    R.events.push({ type: 'done' });
  }
}

const racing = (p) => p.finish == null && !p.dnf;

function stepPlayer(R, p, inp, dt) {
  const T = TUNE;
  p.invuln = Math.max(0, p.invuln - dt); p.hitCd = Math.max(0, p.hitCd - dt);
  p.wobble = Math.max(0, p.wobble - dt); p.boost = Math.max(0, p.boost - dt);
  if (p.tow > 0) {
    p.tow -= dt; p.v = 0; p.vx = 0; p.lat = 0; p.drift = 0;
    if (p.tow <= 0) {
      p.tow = 0; p.hp = T.towHp; p.invuln = T.invuln; p.x = laneX(3);
      R.events.push({ type: 'towed-back', pid: p.id });
    }
    return;
  }
  const k = curvAt(R.track, p.y);
  const kerb = Math.abs(k) > 1 / 300; // in hairpins the sidewalk is a red/white kerb you can run wide onto
  const offRoad = p.x < ROAD_X + 2 || p.x > ROAD_R - 2;
  const vmax = offRoad ? (kerb ? T.kerbMax : T.sidewalkMax) : p.boost > 0 ? T.boostMax : T.maxSpeed;
  if (inp.gas && p.v < vmax) p.v = Math.min(vmax, p.v + T.accel * Math.pow(1 - p.v / (vmax + T.accelHeadroom), 1.5) * (p.boost > 0 ? 1.6 : 1) * dt);
  if (inp.brake) p.v -= T.brake * dt;
  else if (!inp.gas) p.v -= T.drag * dt;
  if (p.v > vmax) p.v = Math.max(vmax, p.v - T.overspeedDecel * dt);
  p.v = Math.max(0, p.v);

  // Positions are (distance along the road, x across it). In a turn the road pulls the car outwards
  // with v^2 * curvature of its own line; the tyres hold it in lane up to `grip`. Too fast for the
  // turn -> the excess pushes the car wide (drift) until you brake or hit the wall.
  const steer = clamp(inp.steer || 0, -1, 1);
  const d = p.x - ROAD_MID, bend = Math.max(0.25, 1 - k * d); // < 1 on the inside of the turn
  const grip = T.grip * (1 - T.gripFade * (p.v / T.maxSpeed) ** 2) * dt;
  const want = steer * T.steer * clamp01(p.v / T.steerFull);
  const pull = (p.v * p.v * k / bend) * dt; // a right turn (k > 0) pulls the car left
  p.lat -= pull;
  p.slip = want - p.lat;
  p.lat += clamp(p.slip, -grip, grip);
  const sliding = Math.abs(p.slip) > grip && Math.abs(p.slip) > T.driftMin && Math.abs(pull) > grip * 0.6;
  p.drift = sliding && p.v > T.driftSpeed ? p.drift + dt : 0;
  if (p.drift > 0.15) p.v -= p.v * T.driftScrub * dt;

  const lo = 40, hi = 192; // buildings / walls stop you at the edge of the sidewalk
  const wasAtWall = p.x <= lo + 0.01 || p.x >= hi - 0.01;
  p.x += (p.lat + p.vx) * dt;
  p.vx *= Math.pow(T.knockDecay, dt);
  if (p.x < lo || p.x > hi) {
    if (!wasAtWall && Math.abs(p.lat + p.vx) > 60 && racing(p)) hurt(R, p, DMG.wall, 'wall');
    if (kerb) p.v -= p.v * T.wallScrub * dt; // scraping round a hairpin on the wall is slow
    p.x = clamp(p.x, lo, hi); p.lat = 0; p.vx = 0;
  }
  p.prevY = p.y;
  p.y += p.v * dt / Math.max(0.25, 1 - k * (p.x - ROAD_MID)); // the inside line of a turn is shorter
  p.stats.topSpeed = Math.max(p.stats.topSpeed, p.v);

  if (!racing(p)) return;
  hitTraffic(R, p);
  hitWorks(R, p);
  grabPickups(R, p);
  if (p.hp <= 0) startTow(R, p);
  else if (p.y >= R.track.length) {
    p.finish = R.t + p.penalty;
    R.events.push({ type: 'finish', pid: p.id, time: p.finish });
    if (R.deadline == null) R.deadline = R.t + T.finishGrace;
  }
}

export function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
  const ox = (aw + bw) / 2 - Math.abs(ax - bx), oy = (ah + bh) / 2 - Math.abs(ay - by);
  return ox > 0 && oy > 0 ? { ox, oy } : null;
}

function hurt(R, p, d, kind) {
  if (p.hitCd > 0 || p.invuln > 0) return;
  p.hp = Math.max(0, p.hp - d);
  p.stats.crashes++;
  p.hitCd = TUNE.hitCd;
  R.events.push({ type: 'crash', pid: p.id, kind, dmg: d, x: p.x, y: p.y });
}

function hitTraffic(R, p) {
  if (p.invuln > 0) return;
  for (const v of R.veh) {
    if (v.gone) continue;
    const vy = vehY(v, R.t);
    if (Math.abs(vy - p.y) > 80) continue;
    const vx = vehX(R.track, v, vy);
    const o = overlap(p.x, p.y, CAR_W, CAR_H, vx, vy, v.w, v.h);
    if (!o) continue;
    if (v.v < 0) {
      // oncoming: the other car spins off the road, we lose most of our speed
      const glancing = o.ox < 6;
      const d = (DMG.headOn + (p.v - v.v) * DMG.headOnK) * (glancing ? DMG.sideSwipe : 1);
      v.gone = true; v.goneAt = R.t; v.spin = p.x < vx ? 1 : -1;
      p.v *= glancing ? 0.6 : 0.15;
      p.vx = (p.x < vx ? -1 : 1) * 70;
      p.wobble = 0.8;
      hurt(R, p, d, glancing ? 'swipe' : 'headon');
    } else if (o.ox < o.oy) {
      const s = p.x < vx ? -1 : 1;
      p.x += s * o.ox; p.vx = s * 80; p.v *= 0.9;
      hurt(R, p, DMG.sideScrape, 'scrape');
    } else if (p.y < vy) {
      const rel = Math.max(0, p.v - v.v);
      p.y = vy - (v.h + CAR_H) / 2 - 0.5;
      p.v = Math.min(p.v, v.v * 0.8);
      if (rel >= DMG.nudge) hurt(R, p, DMG.rearEnd + rel * DMG.rearEndK, 'rear'); // gentle touches are free
    } else {
      // traffic ran into us from behind (we were slow)
      p.y = vy + (v.h + CAR_H) / 2 + 0.5;
      p.v = Math.max(p.v, v.v);
      hurt(R, p, DMG.rearEnd, 'rear');
    }
  }
}

function hitWorks(R, p) {
  if (p.invuln > 0) return;
  for (const w of R.track.works) {
    if (p.y + CAR_H / 2 < w.y0 || p.y - CAR_H / 2 > w.y1) continue;
    const zl = ROAD_X + w.lane * LANE + 2, zr = zl + LANE - 4;
    if (p.x + CAR_W / 2 <= zl || p.x - CAR_W / 2 >= zr) continue;
    const impact = p.v;
    if (p.prevY + CAR_H / 2 <= w.y0 + 1) {
      // drove nose-first into the barrier
      p.y = w.y0 - CAR_H / 2 - 0.5;
      p.v = Math.min(p.v, 20);
    } else {
      const toR = zr + CAR_W / 2 + 1, toL = zl - CAR_W / 2 - 1;
      const s = Math.abs(p.x - toR) < Math.abs(p.x - toL) ? 1 : -1;
      p.x = s > 0 ? toR : toL;
      p.vx = s * 60;
      p.v *= 0.7;
    }
    if (impact > DMG.nudge * 2) hurt(R, p, DMG.works, 'works'); // creeping into the barrier is free
  }
}

function grabPickups(R, p) {
  for (const k of R.track.pickups) {
    const kx = laneX(k.lane);
    if (R.taken.has(k.id) || Math.abs(k.y - p.y) > 20 || Math.abs(kx - p.x) > 15) continue;
    R.taken.add(k.id);
    if (k.kind === 'espresso') { p.boost = TUNE.boostTime; p.v += TUNE.boostKick; p.stats.espressos++; }
    else { p.hp = Math.min(100, p.hp + HEAL[k.kind]); p.stats.snacks++; }
    R.events.push({ type: 'pickup', pid: p.id, kind: k.kind, x: kx, y: k.y });
  }
}

function startTow(R, p) {
  p.tow = TUNE.towTime; p.penalty += TUNE.towPenalty; p.stats.towed++;
  p.v = 0; p.boost = 0;
  R.events.push({ type: 'tow', pid: p.id, x: p.x, y: p.y });
}

function playerBump(R, inputs, dt) {
  R.bumpCd = Math.max(0, R.bumpCd - dt);
  const [a, b] = R.players;
  if (!racing(a) || !racing(b) || a.tow > 0 || b.tow > 0 || a.invuln > 0 || b.invuln > 0) return;
  const o = overlap(a.x, a.y, CAR_W, CAR_H, b.x, b.y, CAR_W, CAR_H);
  if (!o) return;
  let victim = null;
  if (o.ox < o.oy) {
    // side by side: push apart; whoever steered into the other is the rammer
    const s = a.x < b.x ? -1 : 1;
    a.x += (s * o.ox) / 2; b.x -= (s * o.ox) / 2;
    if (R.bumpCd > 0) return;
    a.vx = s * 90; b.vx = -s * 90;
    const ia = (inputs[a.id]?.steer || 0) * -s, ib = (inputs[b.id]?.steer || 0) * s;
    victim = ia > ib ? b : ib > ia ? a : null;
    if (victim) {
      const rammer = victim === a ? b : a;
      victim.v *= 0.75; victim.wobble = 0.8; victim.hp -= DMG.bumpVictim;
      rammer.hp -= DMG.bumpRammer; rammer.stats.bumps++;
    } else {
      a.v *= 0.88; b.v *= 0.88; a.wobble = b.wobble = 0.4;
      a.hp -= DMG.bumpRammer; b.hp -= DMG.bumpRammer;
    }
  } else {
    // nose to tail: the one behind loses speed, the one in front gets nudged forward
    const [back, front] = a.y < b.y ? [a, b] : [b, a];
    back.y = front.y - CAR_H - 0.5;
    if (R.bumpCd > 0) return;
    front.v += 10; front.wobble = 0.5;
    back.v = Math.max(0, Math.min(back.v, front.v) - 15);
    back.hp -= DMG.rearBump; front.hp -= DMG.rearBump; back.stats.bumps++;
    victim = front;
  }
  a.hp = Math.max(0, a.hp); b.hp = Math.max(0, b.hp);
  R.bumpCd = TUNE.bumpCd;
  R.events.push({ type: 'bump', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, victim: victim ? victim.id : null });
}

// 1 = leading. Finished players rank by time, everyone else by distance.
export function rank(R, p) {
  let r = 1;
  for (const o of R.players) {
    if (o === p) continue;
    if (o.finish != null ? p.finish == null || o.finish < p.finish : p.finish == null && !o.dnf && (p.dnf || o.y > p.y)) r++;
  }
  return r;
}
