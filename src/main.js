import { W, H, HW, MID, STEP, CAR_H, PAL } from './config.js';
import { makeBerlin, roadPos } from './track.js';
import { createRace, stepRace, rank } from './sim.js';
import { setCtx, R, txt, drawWorld, drawHud, drawBanner, drawMid } from './render.js';
import { drawTitle, drawTracks, drawResults, drawPause, drawCountdown, drawSoloPanel } from './screens.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { vehY, vehX } from './track.js';

const cv = document.getElementById('screen');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const off = document.createElement('canvas'); off.width = HW; off.height = H;
const octx = off.getContext('2d');

const input = createInput();
const audio = createAudio();
const qs = new URLSearchParams(location.search);
const POP = { pretzel: 'BREZEL +HP', doner: 'DÖNER +HP', espresso: 'ESPRESSO!' };

const S = {
  screen: 'title', joined: [true, false], trackSel: 0, menuSel: 0, pauseSel: 0, paused: false,
  race: null, seed: Number(qs.get('seed')) || 1 + Math.floor(Math.random() * 1e6),
  fx: [], shake: [0, 0], drifting: [false, false], now: 0, clock: 0, screenAt: 0, doneTimer: 0, lastBeep: 0, lockedFlash: -9, errors: [],
};
const preview = createRace(makeBerlin(77), 1);
const DBG = { paused: qs.get('pause') === '1', override: [null, null], menu: [] };

function startRace(o = {}) {
  const n = o.players ?? (S.joined[1] ? 2 : 1);
  S.race = createRace(makeBerlin(o.seed ?? S.seed++), n);
  if (o.skipCountdown) { S.race.countdown = 0; S.race.phase = 'race'; }
  Object.assign(S, { screen: 'race', fx: [], shake: [0, 0], paused: false, doneTimer: 0, lastBeep: 0 });
  audio.playMusic('race');
  audio.startEngines(n);
}

function toMenu(screen) {
  S.screen = screen; S.menuSel = 0; S.paused = false; S.screenAt = S.now;
  audio.stopEngines(); audio.playMusic('menu');
}

function onEvent(e) {
  const now = S.clock; // game clock: stops while paused, so effects freeze too
  if (e.type === 'go') audio.play('beep', true);
  if (e.type === 'crash') {
    const big = e.kind === 'headon';
    S.fx.push({ kind: 'spark', x: e.x, y: e.y + CAR_H / 2, t0: now }, { kind: 'pop', x: e.x, y: e.y, text: `-${Math.round(e.dmg)} HP`, color: '#e8402e', t0: now });
    S.shake[e.pid] = big ? 0.35 : 0.15;
    audio.play('crash', big);
    input.rumble(e.pid, big ? 300 : 120, big ? 1 : 0.5);
  }
  if (e.type === 'bump') {
    S.fx.push({ kind: 'spark', x: e.x, y: e.y, t0: now }, { kind: 'big', x: e.x, y: e.y, text: 'BUMP!', color: PAL.accent, t0: now });
    S.shake = [0.3, 0.3];
    audio.play('bump');
    input.rumble(0, 150, 0.7); input.rumble(1, 150, 0.7);
  }
  if (e.type === 'pickup') {
    S.fx.push({ kind: 'pop', x: e.x, y: e.y, text: POP[e.kind], color: PAL.accent, t0: now });
    audio.play(e.kind === 'espresso' ? 'espresso' : 'pickup');
  }
  if (e.type === 'tow') { audio.play('tow'); S.shake[e.pid] = 0.4; }
  if (e.type === 'finish') audio.play('finish');
}

function update(dt) {
  const inp = input.poll();
  for (let i = 0; i < 2; i++) if (DBG.override[i]) inp.drive[i] = { ...DBG.override[i] };
  while (DBG.menu.length) { const { pid, action } = DBG.menu.shift(); inp.menu[pid][action] = true; }
  const m = inp.menu, any = (a) => m[0][a] || m[1][a];
  S.pads = inp.pads;
  if (m.some((x) => Object.values(x).some(Boolean))) audio.unlock();
  S.shake = S.shake.map((v) => Math.max(0, v - dt));
  S.fx = S.fx.filter((f) => S.clock - f.t0 < (f.kind === 'skid' ? 3 : 1.2));

  if (S.screen !== 'race' && audio.mode !== 'menu') audio.playMusic('menu');
  if (S.screen === 'title') {
    if (!S.joined[1] && (m[1].confirm || m[1].start)) { S.joined[1] = true; audio.play('select'); }
    else if (S.joined[1] && m[1].back) S.joined[1] = false;
    else if (m[0].confirm || m[0].start || (S.joined[1] && (m[1].confirm || m[1].start))) { S.screen = 'tracks'; audio.play('select'); }
  } else if (S.screen === 'tracks') {
    if (!S.joined[1] && (m[1].confirm || m[1].start)) { S.joined[1] = true; audio.play('select'); }
    else if (any('left') || any('right')) { S.trackSel = 1 - S.trackSel; audio.play('blip'); }
    else if (m[0].confirm || m[0].start || (S.joined[1] && (m[1].confirm || m[1].start))) {
      if (S.trackSel === 0) { audio.play('select'); startRace(); } else { S.lockedFlash = S.now; audio.play('blip'); }
    } else if (any('back')) S.screen = 'title';
  } else if (S.screen === 'race') {
    const race = S.race;
    if (S.paused) {
      if (any('up') || any('down')) { S.pauseSel = 1 - S.pauseSel; audio.play('blip'); }
      else if (any('confirm')) { if (S.pauseSel === 0) S.paused = false; else toMenu('title'); audio.play('select'); }
      else if (any('back') || any('pause')) S.paused = false;
      audio.updateEngines(race.players, false);
      return;
    }
    if (any('pause')) { S.paused = true; S.pauseSel = 0; audio.play('blip'); return; }
    S.clock += dt;
    stepRace(race, inp.drive, dt);
    if (race.phase === 'countdown') {
      const n = Math.ceil(race.countdown);
      if (n !== S.lastBeep) { S.lastBeep = n; audio.play('beep', false); }
    }
    for (const e of race.events.splice(0)) onEvent(e);
    race.players.forEach((p, i) => {
      if (p.drift > 0.08 && Math.round(S.clock * 60) % 2 === 0) S.fx.push({ kind: 'skid', x: p.x - 5, y: p.y - 11, t0: S.clock }, { kind: 'skid', x: p.x + 5, y: p.y - 11, t0: S.clock });
      if (p.drift > 0.15 && !S.drifting[i]) S.fx.push({ kind: 'pop', x: p.x, y: p.y, text: 'DRIFT!', color: '#ffd000', t0: S.clock });
      S.drifting[i] = p.drift > 0.15;
    });
    audio.updateEngines(race.players, race.phase !== 'countdown');
    if (race.phase === 'done' && (S.doneTimer += dt) > 2.2) toMenu('results');
  } else if (S.screen === 'results') {
    if (S.now - S.screenAt < 1) return; // ignore gas buttons still held from the race
    if (any('left')) { S.menuSel = (S.menuSel + 2) % 3; audio.play('blip'); }
    else if (any('right')) { S.menuSel = (S.menuSel + 1) % 3; audio.play('blip'); }
    else if (any('confirm') || any('start')) {
      audio.play('select');
      if (S.menuSel === 0) startRace(); else toMenu(S.menuSel === 1 ? 'tracks' : 'title');
    }
  }
}

function drawRaceScreen() {
  const race = S.race, n = race.players.length;
  for (let i = 0; i < 2; i++) {
    const ox = i ? HW + MID : 0;
    const v = race.players[i]?.v || 0;
    const sh = S.shake[i] > 0 ? [Math.round(Math.random() * 4 - 2), Math.round(Math.random() * 4 - 2)]
      : v > 190 && !S.paused && Math.random() < (v - 190) / 60 ? [0, Math.random() < 0.5 ? -1 : 1] : [0, 0]; // rumble near top speed
    ctx.save(); ctx.translate(ox + sh[0], sh[1]); ctx.beginPath(); ctx.rect(-sh[0], -sh[1], HW, H); ctx.clip();
    if (i < n) {
      const p = race.players[i];
      drawWorld(race, p.y, S.clock, S.fx, { speed: p.v, shift: Math.max(0, Math.min(1, (p.v - 130) / 90)) * 12 });
      drawBanner(p, race);
      drawHud(i, p, race, n > 1 ? rank(race, p) : 0);
    } else drawSoloPanel(S.now);
    ctx.restore();
  }
  drawMid(race);
  if (race.phase === 'countdown' || race.t < 0.8) drawCountdown(race);
  if (S.paused) drawPause(S.pauseSel);
}

function render() {
  setCtx(ctx); ctx.setTransform(1, 0, 0, 1, 0, 0);
  R(0, 0, W, H, '#000');
  if (S.screen === 'title') drawTitle(ctx, S.now, S.joined, !audio.muted, S.pads || 0);
  else if (S.screen === 'tracks') drawTracks(ctx, S.now, S.trackSel, S.joined, preview, off, octx, S.lockedFlash);
  else if (S.screen === 'race') drawRaceScreen();
  else if (S.screen === 'results') drawResults(ctx, S.race, S.menuSel, S.now);
  if (!audio.running && !audio.muted && S.screen !== 'race') txt('PRESS ANY KEY FOR SOUND', 240, 2, '#ffffff', 'center', 8, 'rgba(0,0,0,.6)');
  if (S.screen === 'title' && !S.pads) txt('CONTROLLERS: PRESS ANY BUTTON TO CONNECT', 240, 12, '#ffffff', 'center', 8, 'rgba(0,0,0,.6)');
}

addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'KeyF') {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
  }
  if (e.code === 'KeyM') audio.toggleMute();
});
addEventListener('pointerdown', () => audio.unlock());
addEventListener('error', (e) => S.errors.push(String(e.error?.stack || e.message)));

// ---------- debug API (used by the verify skill) ----------
const r1 = (v) => Math.round(v * 10) / 10;
window.__game = {
  get screen() { return S.screen; },
  errors: S.errors,
  debug: {
    pause() { DBG.paused = true; }, resume() { DBG.paused = false; },
    step(n = 1) { for (let i = 0; i < n; i++) update(STEP); render(); },
    setInput(pid, inp) { DBG.override[pid] = inp; }, clearInput() { DBG.override = [null, null]; },
    press(action, pid = 0) { DBG.menu.push({ pid, action }); },
    startRace(o = {}) { startRace(o); },
    teleport(pid, y, x) { const p = S.race.players[pid]; p.y = p.prevY = y; if (x != null) p.x = x; },
    set(pid, fields) { Object.assign(S.race.players[pid], fields); },
    pickups() { return S.race.track.pickups.filter((k) => !S.race.taken.has(k.id)).map((k) => ({ ...k, x: 68 + k.lane * 32 })); },
    works() { return S.race.track.works; },
    noTraffic() { S.race.veh.length = 0; },
    // same-direction traffic near road distance y, with its crash knock state (dy = shoved forward, kx = knocked sideways)
    traffic(y, range = 400) { return S.race.veh.filter((v) => v.v >= 0 && Math.abs(vehY(v, S.race.t) - y) < range).map((v) => ({ id: v.id, type: v.type, lane: v.lane, y: r1(vehY(v, S.race.t)), x: r1(vehX(S.race.track, v, vehY(v, S.race.t))), v: v.v, dy: r1(v.dy), kx: r1(v.kx), wob: r1(v.wob) })); },
    curves() { return S.race.track.curves; },
    pos(s, x) { return roadPos(S.race.track, s, x); },
    snapshot() {
      const race = S.race;
      return {
        screen: S.screen, paused: S.paused, joined: S.joined, trackSel: S.trackSel, menuSel: S.menuSel,
        audio: { running: audio.running, muted: audio.muted, music: audio.mode }, fx: S.fx.map((f) => f.text || f.kind),
        race: race && {
          phase: race.phase, t: r1(race.t), countdown: r1(race.countdown), deadline: race.deadline, length: race.track.length,
          players: race.players.map((p) => ({
            id: p.id, x: r1(p.x), y: r1(p.y), v: r1(p.v), hp: r1(p.hp), boost: r1(p.boost), tow: r1(p.tow), drift: r1(p.drift),
            penalty: p.penalty, finish: p.finish && r1(p.finish), dnf: p.dnf, rank: rank(race, p), stats: { ...p.stats, topSpeed: r1(p.stats.topSpeed) },
          })),
        },
      };
    },
  },
};

if (qs.get('screen') === 'race') { S.joined[1] = qs.get('players') !== '1'; startRace({ skipCountdown: qs.get('skip') === '1' }); }
else if (['tracks', 'results'].includes(qs.get('screen'))) S.screen = qs.get('screen');

let last = performance.now(), acc = 0;
function frame(ts) {
  const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000)); last = ts; S.now += dt;
  try {
    if (!DBG.paused) { acc += dt; while (acc >= STEP) { update(STEP); acc -= STEP; } }
    render();
  } catch (e) { S.errors.push(String(e?.stack || e)); console.error(e); }
  requestAnimationFrame(frame);
}
Promise.race([document.fonts.load('8px "Press Start 2P"'), new Promise((r) => setTimeout(r, 1500))]).finally(() => requestAnimationFrame(frame));
