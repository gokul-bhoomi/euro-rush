// Menu screens: title, track select, results, pause, countdown, solo panel.
import { W, H, HW, PAL, KMH } from './config.js';
import { mod, rng, shade } from './util.js';
import { R, disc, ell, frame, txt, spr, car, fmt, setCtx, drawWorld } from './render.js';

const STARS = (() => { const r = rng(5), a = []; for (let i = 0; i < 40; i++) a.push({ x: r() * W, y: r() * 80, ph: r() * 6 }); return a; })();
const CONF = (() => { const r = rng(9), a = []; for (let i = 0; i < 70; i++) a.push({ x: r() * W, ph: r(), sp: 30 + r() * 50, k: Math.floor(r() * 3), w: r() * 6 }); return a; })();

function skyline() {
  const c = PAL.sil;
  for (const [x, h] of [[0, 24], [14, 36], [30, 20], [44, 30], [80, 26], [96, 40], [188, 30], [204, 22]]) R(x, 170 - h, 16, h, c);
  R(58, 92, 5, 78, c); disc(60, 104, 9, c); R(59, 70, 2, 26, c);
  R(118, 142, 62, 8, c); R(132, 134, 34, 8, c); R(144, 126, 10, 8, c); for (let k = 0; k < 6; k++) R(121 + k * 11, 150, 4, 20, c);
  R(286, 124, 96, 46, c); R(286, 116, 70, 8, c); R(356, 120, 10, 4, c);
  disc(452, 140, 15, c); R(437, 140, 31, 30, c); R(450, 118, 4, 8, c);
  ell(272, 150, 4, 20, c); ell(394, 152, 4, 18, c); ell(474, 154, 3, 16, c);
  const ar = shade(c, -0.35);
  for (let tier = 0; tier < 3; tier++) for (let k = 0; k < (tier === 0 ? 7 : 9); k++) {
    const ax = tier === 0 ? 290 + k * 9 : 290 + k * 10, ay = tier === 0 ? 118 : 128 + (tier - 1) * 14;
    if (ax < 380) R(ax, ay, 4, 7, ar);
  }
}

export function pad(x, y, c) {
  R(x + 1, y, 14, 8, c); R(x, y + 1, 16, 5, c); R(x + 2, y + 7, 3, 2, c); R(x + 11, y + 7, 3, 2, c);
  R(x + 3, y + 3, 4, 1, '#111'); R(x + 4, y + 2, 1, 3, '#111'); R(x + 11, y + 2, 2, 2, '#111'); R(x + 13, y + 4, 1, 1, '#111');
}

export function drawTitle(G, now, joined, soundOn, pads) {
  const sk = G.createLinearGradient(0, 0, 0, 170);
  PAL.sky.forEach((c, i, a) => sk.addColorStop(i / (a.length - 1), c));
  G.fillStyle = sk; G.fillRect(0, 0, W, 170);
  disc(440, 40, 16, PAL.sunC[0]); disc(440, 40, 13, PAL.sunC[1]);
  for (const [cx, cy, s] of [[80, 40, 1], [200, 62, 0.8], [330, 30, 0.9]]) {
    const x = mod(cx + now * 6 * s, W + 80) - 40;
    R(x, cy, 34 * s, 6, '#ffffff'); R(x + 6 * s, cy - 5, 18 * s, 6, '#ffffff'); R(x + 4, cy + 6, 26 * s, 3, '#dbeeff');
  }
  skyline();
  G.save(); G.translate(414, 170); G.rotate(0.1); R(-6, -66, 12, 66, PAL.sil); R(-4, -74, 8, 8, PAL.sil); G.restore();
  for (let y = 170; y < H; y++) {
    const d = y - 169, band = Math.floor(90 / d + now * 6) % 2 === 0, half = 10 + d * 2.1, rw = 1 + d * 0.18;
    G.fillStyle = band ? PAL.g1 : PAL.g2; G.fillRect(0, y, W, 1);
    G.fillStyle = band ? '#ffffff' : PAL.p1; G.fillRect(240 - half - rw, y, (half + rw) * 2, 1);
    G.fillStyle = band ? PAL.road : shade(PAL.road, 0.06); G.fillRect(240 - half, y, half * 2, 1);
    if (band) { const lw = Math.max(1, d * 0.05); G.fillStyle = '#f0f0f0'; G.fillRect(240 - lw / 2, y, lw, 1); }
  }
  const lg = G.createLinearGradient(0, 34, 0, 66); lg.addColorStop(0, PAL.accent); lg.addColorStop(1, PAL.p1);
  for (let k = 5; k > 0; k--) txt('EURO RUSH', 240 + k, 34 + k, shade(PAL.p1, -0.55), 'center', 32);
  txt('EURO RUSH', 240, 34, lg, 'center', 32, PAL.ui);
  txt('BERLIN · ITALIA', 240, 78, PAL.text, 'center', 8, PAL.ui);
  if (mod(now, 1) < 0.65) { R(168, 190, 144, 20, 'rgba(0,0,0,.6)'); txt('PRESS START', 240, 196, '#ffffff', 'center'); }
  txt('P1 WASD  P2 ARROWS  F FULLSCREEN', 240, 218, '#ffffff', 'center', 8, 'rgba(0,0,0,.55)');
  const slot = (x, c, on, label) => {
    R(x, 238, 140, 24, PAL.ui); frame(x, 238, 140, 24, on ? c : PAL.ui2); pad(x + 8, 246, on ? c : PAL.dim);
    if (on || mod(now, 1) < 0.6) txt(label, x + 30, 246, on ? c : PAL.dim);
  };
  slot(16, PAL.p1, joined[0], 'P1 READY');
  // P2 joins with A on the second controller or the Up arrow key
  slot(324, PAL.p2, joined[1], joined[1] ? 'P2 READY' : mod(now, 2) < 1 ? 'P2 PRESS A' : 'P2 PRESS UP');
  txt(`PADS: ${pads}`, 240, 244, pads ? PAL.text : PAL.dim, 'center', 8, PAL.ui);
  txt(soundOn ? 'M: SOUND ON' : 'M: SOUND OFF', 240, 256, PAL.text, 'center', 8, PAL.ui);
}

export function drawTracks(G, now, sel, joined, previews, off, octx) {
  R(0, 0, W, H, PAL.ui); G.fillStyle = PAL.ui2;
  for (let x = 0; x < W; x += 16) G.fillRect(x, 0, 1, H);
  for (let y = mod(now * 8, 16); y < H; y += 16) G.fillRect(0, Math.round(y), W, 1);
  txt('CHOOSE YOUR ROAD', 240, 12, PAL.accent, 'center', 16, PAL.ui);
  const cards = [
    { name: 'BERLIN', sub: 'ALEX > BRANDENBURG', tags: 'TRAMS + BAUSTELLE', km: '5.6 KM', flag: ['#111111', '#dd1f1f', '#ffcc00'], v: false, snacks: ['pretzel', 'doner', 'espresso'] },
    { name: 'ITALIA', sub: 'AMALFI > COLOSSEO', tags: 'VESPAS + CLIFFS', km: '5.9 KM', flag: ['#159947', '#f4f4f4', '#d42a2a'], v: true, snacks: ['croissant', 'pizza', 'espresso'] },
  ];
  cards.forEach((T, i) => {
    const x = i ? 256 : 34, y = 48, w = 190, h = 186, on = sel === i;
    R(x, y, w, h, shade(PAL.ui, 0.04)); frame(x, y, w, h, on ? PAL.text : PAL.ui2);
    setCtx(octx); drawWorld(previews[i], 600 + mod(now * 90, 4000), now, [], { t: now, noPlayers: true }); setCtx(G);
    G.drawImage(off, 23, 120, 186, 110, x + 2, y + 2, 186, 110);
    if (!on) { G.globalAlpha = 0.55; R(x + 2, y + 2, 186, 110, PAL.ui); G.globalAlpha = 1; }
    txt(T.name, x + 8, y + 120, on ? PAL.text : PAL.dim, 'left', 16);
    const fx = x + w - 30, fy = y + 121;
    for (let s = 0; s < 3; s++) { if (T.v) R(fx + s * 7, fy, 7, 14, T.flag[s]); else R(fx, fy + s * 5, 21, 5, T.flag[s]); }
    frame(fx - 1, fy - 1, 23, 16, '#000', 1);
    txt(T.sub, x + 8, y + 142, PAL.dim);
    txt(T.tags, x + 8, y + 156, PAL.dim);
    T.snacks.forEach((k, j) => spr(k, x + 8 + j * 16, y + 170));
    txt(T.km, x + w - 8, y + 172, PAL.accent, 'right');
    if (on) {
      frame(x - 4, y - 4, w + 8, h + 8, PAL.p1, 2);
      if (joined[1]) frame(x - 8, y - 8, w + 16, h + 16, PAL.p2, 2);
      if (mod(now, 1) < 0.7) {
        R(x - 4, y - 14, 22, 10, PAL.p1); txt('P1', x + 7, y - 13, PAL.ui, 'center');
        if (joined[1]) { R(x + w - 18, y - 18, 22, 10, PAL.p2); txt('P2', x + w - 7, y - 17, PAL.ui, 'center'); }
      }
    }
  });
  const btn = (x, c, l) => { disc(x, 255, 6, c); txt(l[0], x + 1, 252, PAL.ui, 'center'); txt(l.slice(2), x + 12, 252, PAL.dim); };
  btn(110, '#4be36a', 'A START'); btn(230, '#ff4b4b', 'B BACK');
  if (!joined[1]) txt(mod(now, 2) < 1 ? 'P2: PRESS A' : 'P2: PRESS UP', 350, 252, PAL.p2);
}

export function drawResults(G, race, sel, now) {
  R(0, 0, W, H, PAL.ui);
  for (const c of CONF) { const y = mod(c.ph * 300 + now * c.sp, 300) - 20; R(c.x + Math.sin(now * 2 + c.w) * 4, y, 3, 3, [PAL.p1, PAL.p2, PAL.accent][c.k]); }
  for (let i = 0; i < W; i += 6) for (let j = 0; j < 2; j++) R(i, j * 6, 6, 6, ((i / 6) + j + Math.floor(now * 4)) % 2 ? '#111' : '#fff');
  txt('FINISH!', 240, 22, PAL.accent, 'center', 24, PAL.ui);
  txt(race.track.finish, 240, 52, PAL.dim, 'center');
  const ps = race.players, solo = ps.length === 1;
  const times = ps.map((p) => p.finish);
  let win = null;
  if (solo) win = ps[0].finish != null ? ps[0] : null;
  else if (times[0] != null || times[1] != null) {
    if (times[1] == null || (times[0] != null && times[0] < times[1])) win = ps[0];
    else if (times[0] == null || times[1] < times[0]) win = ps[1];
  }
  const wc = win ? (win.id === 0 ? PAL.p1 : PAL.p2) : PAL.dim;
  R(30, 70, 180, 150, shade(PAL.ui, 0.05)); frame(30, 70, 180, 150, wc);
  if (win) { G.save(); G.translate(70, 84); G.scale(3, 3); car(8, 0, wc, false, true); G.restore(); }
  const tx = 140, ty = 96;
  R(tx, ty, 18, 12, '#ffd23f'); R(tx - 4, ty + 2, 4, 6, '#ffd23f'); R(tx + 18, ty + 2, 4, 6, '#ffd23f'); R(tx + 2, ty + 2, 4, 8, '#fff3a0');
  R(tx + 7, ty + 12, 4, 6, '#e0b020'); R(tx + 2, ty + 18, 14, 4, '#c8961a');
  const label = solo ? (win ? 'NICE RUN!' : 'DNF') : win ? `P${win.id + 1} WINS!` : times[0] != null && times[0] === times[1] ? 'DRAW!' : 'NO WINNER';
  txt(label, 120, 180, wc, 'center', 16, PAL.ui);

  R(226, 70, 230, 150, shade(PAL.ui, 0.05)); frame(226, 70, 230, 150, PAL.ui2);
  const cols = solo ? [440] : [372, 440];
  ps.forEach((p, i) => txt(`P${i + 1}`, cols[i], 80, i ? PAL.p2 : PAL.p1, 'right'));
  const rows = [
    ['TIME', (p) => (p.finish != null ? p.finish : Infinity), (p) => (p.finish != null ? fmt(p.finish) : 'DNF'), -1],
    ['CRASHES', (p) => p.stats.crashes, null, -1],
    ['BUMPED RIVAL', (p) => p.stats.bumps, null, 1],
    ['SNACKS', (p) => p.stats.snacks, null, 1],
    ['ESPRESSOS', (p) => p.stats.espressos, null, 1],
    ['TOP SPEED', (p) => Math.round(p.stats.topSpeed * KMH), null, 1],
    ['TOWED', (p) => p.stats.towed, null, -1],
  ];
  rows.forEach(([l, val, show, better], k) => {
    const y = 98 + k * 16; txt(l, 236, y, PAL.dim);
    const vs = ps.map(val);
    ps.forEach((p, i) => {
      const best = !solo && vs[i] !== vs[1 - i] && (better > 0 ? vs[i] > vs[1 - i] : vs[i] < vs[1 - i]);
      txt(show ? show(p) : String(vs[i]), cols[i], y, best ? PAL.accent : PAL.text, 'right');
    });
  });
  ['REMATCH', 'TRACKS', 'TITLE'].forEach((l, k) => {
    const x = 110 + k * 130, on = k === sel;
    R(x - 50, 232, 100, 22, on ? PAL.accent : PAL.ui2); txt(l, x, 239, on ? PAL.ui : PAL.dim, 'center');
    if (on && mod(now, 1) < 0.6) { G.fillStyle = PAL.accent; G.beginPath(); G.moveTo(x - 62, 236); G.lineTo(x - 55, 243); G.lineTo(x - 62, 250); G.fill(); }
  });
}

export function drawPause(sel) {
  R(0, 0, W, H, 'rgba(43,29,61,.55)');
  R(150, 80, 180, 110, PAL.ui); frame(150, 80, 180, 110, PAL.accent);
  txt('PAUSED', 240, 92, PAL.accent, 'center', 16);
  ['RESUME', 'QUIT TO MENU'].forEach((l, k) => {
    const on = k === sel; R(170, 124 + k * 28, 140, 20, on ? PAL.accent : PAL.ui2); txt(l, 240, 130 + k * 28, on ? PAL.ui : PAL.dim, 'center');
  });
}

export function drawCountdown(race) {
  const n = Math.ceil(race.countdown);
  const label = race.phase === 'countdown' ? String(n) : 'GO!';
  R(190, 94, 100, 48, PAL.ui); frame(190, 94, 100, 48, label === 'GO!' ? '#4be36a' : PAL.accent);
  txt(label, 240, 102, label === 'GO!' ? '#2a9c48' : PAL.accent, 'center', 32);
  for (let k = 0; k < 3; k++) disc(214 + k * 26, 82, 6, race.phase !== 'countdown' ? '#4be36a' : k < 4 - n ? '#e8402e' : '#5a4a5a');
}

export function drawSoloPanel(now) {
  R(0, 0, HW, H, PAL.ui); R(0, 0, HW, 34, PAL.ui2);
  txt('SOLO RUN', 116, 13, PAL.text, 'center');
  txt('BEAT YOUR', 116, 100, PAL.dim, 'center'); txt('OWN TIME', 116, 114, PAL.dim, 'center');
  car(116, 140, PAL.p2, false, true);
  if (mod(now, 1) < 0.6) txt('P2 CAN JOIN', 116, 190, PAL.p2, 'center');
  txt('ON THE TITLE', 116, 204, PAL.dim, 'center');
}

