// Browser smoke test: serves the game, opens it in headless Chrome and drives it through the debug
// API (menus, a 2-player race, a hairpin, a crash, a snack, the finish and the results screen).
// Fails on any wrong state, page error or console error. Run with `npm run smoke`.
// Uses the installed Google Chrome (or CHROME_PATH), so no browser download is needed.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = join(ROOT, 'test-results');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  if (req.url === '/favicon.ico') return res.writeHead(204).end();
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try {
    const body = await readFile(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
// fake gamepads: tests press buttons with __pad(index, button, on) / move sticks with __axis(index, axis, value)
await page.addInitScript(() => {
  const pads = [];
  const make = (index) => ({ index, id: 'fake pad', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
  const get = (i) => { while (pads.length <= i) pads.push(make(pads.length)); return pads[i]; };
  window.__pad = (i, b, on) => { get(i).buttons[b] = { pressed: on, value: on ? 1 : 0 }; };
  window.__axis = (i, a, v) => { get(i).axes[a] = v; };
  navigator.getGamepads = () => pads;
});
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) problems.push(`console error: ${m.text()}`); });
await mkdir(SHOTS, { recursive: true });

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); await page.screenshot({ path: join(SHOTS, `fail-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {}); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
async function open(query) {
  await page.goto(base + query);
  await page.waitForFunction(() => window.__game?.debug, null, { timeout: 10000 });
}
const game = (fn, arg) => page.evaluate(fn, arg);

console.log('Euro Rush smoke test');

await check('title screen loads', async () => {
  await open('');
  await page.waitForTimeout(500);
  expect(await game(() => window.__game.screen) === 'title', 'not on the title screen');
  await page.screenshot({ path: join(SHOTS, 'title.png') });
});

await check('menus: P2 joins and Berlin starts a race', async () => {
  const s = await game(() => {
    const d = window.__game.debug;
    d.pause(); d.press('confirm', 1); d.step(1); // P2 joins
    const joined = d.snapshot().joined[1];
    d.press('confirm', 0); d.step(1); // -> track select
    const tracks = d.snapshot().screen;
    d.press('confirm', 0); d.step(1); // Berlin
    return { joined, tracks, screen: d.snapshot().screen, players: d.snapshot().race?.players.length };
  });
  expect(s.joined, 'P2 did not join');
  expect(s.tracks === 'tracks', `expected track select, got ${s.tracks}`);
  expect(s.screen === 'race' && s.players === 2, `expected a 2-player race, got ${s.screen} with ${s.players}`);
});

await check('countdown, then both cars drive', async () => {
  await open('?screen=race&players=2&seed=7&pause=1');
  const s = await game(() => {
    const d = window.__game.debug;
    const before = d.snapshot().race.phase;
    d.noTraffic(); d.setInput(0, { gas: true }); d.setInput(1, { gas: true }); d.step(60 * 9);
    return { before, race: d.snapshot().race };
  });
  expect(s.before === 'countdown', `race started in phase ${s.before}`);
  expect(s.race.phase === 'race', `phase ${s.race.phase}`);
  for (const p of s.race.players) expect(p.v > 100 && p.y > 300, `P${p.id + 1} only reached v=${p.v} y=${p.y}`);
});

await check('hairpin: slow is clean, too fast slides wide', async () => {
  await open('?screen=race&players=2&seed=7&skip=1&pause=1');
  const s = await game(() => {
    const d = window.__game.debug;
    d.noTraffic();
    const h = d.curves().find((c) => c.kind === 'hairpin');
    d.teleport(0, h.s0 - 150, 164); d.set(0, { v: 80 }); d.setInput(0, {});
    d.teleport(1, h.s0 - 250, 132); d.set(1, { v: 220 }); d.setInput(1, { gas: true });
    let slowDrift = 0, fastDrift = 0, slowDev = 0;
    for (let i = 0; i < 90; i++) {
      d.step(5);
      const [a, b] = d.snapshot().race.players;
      slowDrift = Math.max(slowDrift, a.drift); fastDrift = Math.max(fastDrift, b.drift); slowDev = Math.max(slowDev, Math.abs(a.x - 164));
    }
    return { slowDrift, fastDrift, slowDev, hairpins: d.curves().filter((c) => c.kind === 'hairpin').length };
  });
  expect(s.hairpins === 4, `expected 4 hairpins, got ${s.hairpins}`);
  expect(s.slowDrift === 0 && s.slowDev < 3, `slow car drifted ${s.slowDrift} / strayed ${s.slowDev}px`);
  expect(s.fastDrift > 0.15, 'fast car did not drift');
  await page.screenshot({ path: join(SHOTS, 'hairpin.png') });
});

await check('every part of the track renders (both views, with traffic)', async () => {
  await open('?screen=race&players=2&seed=7&skip=1&pause=1');
  const n = await game(() => {
    const d = window.__game.debug, L = d.snapshot().race.length;
    let frames = 0;
    for (let s = 0; s < L + 200; s += 200) { // d.step renders once per call, so step one frame at a time
      d.teleport(0, s, 164); d.teleport(1, Math.max(0, s - 700), 132); d.set(0, { v: 150 }); d.set(1, { v: 150 });
      d.step(1); frames++;
    }
    return frames;
  });
  expect(n > 90, `only rendered ${n} frames`);
});

await check('traffic crashes happen and a Döner heals', async () => {
  await open('?screen=race&players=1&seed=7&skip=1&pause=1');
  const s = await game(() => {
    const d = window.__game.debug;
    const k = d.pickups().find((p) => p.kind === 'doner' && p.y > 3000);
    d.noTraffic(); d.teleport(0, k.y - 60, k.x); d.set(0, { hp: 50, v: 60 }); d.setInput(0, { gas: true }); d.step(60);
    const healed = d.snapshot().race.players[0];
    d.startRace({ players: 1, seed: 3, skipCountdown: true }); d.setInput(0, { gas: true }); d.step(60 * 60);
    return { healed, crashed: d.snapshot().race.players[0] };
  });
  expect(s.healed.stats.snacks === 1 && s.healed.hp === 80, `snack not taken: hp ${s.healed.hp}, snacks ${s.healed.stats.snacks}`);
  expect(s.crashed.stats.crashes > 0, 'a minute of flat-out driving through traffic should hit something');
});

await check('traffic you hit is shoved forward and knocked sideways', async () => {
  await open('?screen=race&players=1&seed=7&skip=1&pause=1');
  const s = await game(() => {
    const d = window.__game.debug;
    // a car in lane 3 well into the race: rear-end it hard, rendering every frame of the crash
    const c = d.traffic(6000, 3000).find((v) => v.type === 'car' && v.lane === 3);
    d.teleport(0, c.y - 40, c.x); d.set(0, { v: 180 }); d.setInput(0, {});
    for (let i = 0; i < 40; i++) d.step(1);
    const rear = d.traffic(c.y, 200).find((v) => v.id === c.id);
    // then pull alongside a car in lane 2 and steer into it
    const b = d.traffic(9000, 3000).find((v) => v.type === 'car' && v.lane === 2);
    d.teleport(0, b.y, 164); d.set(0, { v: b.v, hp: 100 }); d.setInput(0, { steer: -1 });
    let kx = 0;
    for (let i = 0; i < 30; i++) { d.step(1); kx = Math.min(kx, d.traffic(b.y, 300).find((v) => v.id === b.id).kx); }
    return { rear, kx, p: d.snapshot().race.players[0] };
  });
  expect(s.rear.dy > 10, `rear-ended car was not shoved forward (dy ${s.rear.dy})`);
  expect(s.kx < -3, `side-swiped car was not knocked sideways (kx ${s.kx})`);
  expect(s.p.stats.crashes >= 2, `expected two crashes, got ${s.p.stats.crashes}`);
});

await check('finish line, then the results screen', async () => {
  await open('?screen=race&players=2&seed=7&skip=1&pause=1');
  const s = await game(() => {
    const d = window.__game.debug;
    const L = d.snapshot().race.length;
    d.noTraffic(); d.teleport(0, L - 60); d.teleport(1, L - 60, 132); d.setInput(0, { gas: true }); d.setInput(1, { gas: true });
    d.step(300);
    const race = d.snapshot().race;
    d.step(150);
    return { race, screen: d.snapshot().screen };
  });
  expect(s.race.phase === 'done', `phase ${s.race.phase}`);
  expect(s.race.players.every((p) => p.finish != null), 'not everyone finished');
  expect(s.screen === 'results', `screen ${s.screen}`);
  await page.screenshot({ path: join(SHOTS, 'results.png') });
});

await check('Italia: every part of the track renders, a croissant heals, and the race ends at the Colosseo', async () => {
  await open('?screen=race&track=italia&players=2&seed=7&skip=1&pause=1');
  const s = await game(() => {
    const d = window.__game.debug, L = d.snapshot().race.length;
    let frames = 0;
    for (let s = 0; s < L + 200; s += 200) {
      d.teleport(0, s, 164); d.teleport(1, Math.max(0, s - 700), 132); d.set(0, { v: 150 }); d.set(1, { v: 150 });
      d.step(1); frames++;
    }
    d.startRace({ players: 2, seed: 7, track: 'italia', skipCountdown: true }); d.noTraffic();
    const k = d.pickups().find((p) => p.kind === 'croissant');
    d.teleport(0, k.y - 60, k.x); d.set(0, { hp: 50, v: 60 }); d.setInput(0, { gas: true }); d.step(60);
    const healed = d.snapshot().race.players[0];
    d.teleport(0, L - 60, 164); d.teleport(1, L - 60, 132); d.setInput(1, { gas: true });
    d.step(450);
    return { frames, healed, track: d.snapshot().race.track, screen: d.snapshot().screen };
  });
  expect(s.frames > 100, `only rendered ${s.frames} frames`);
  expect(s.healed.stats.snacks === 1 && s.healed.hp === 65, `croissant not taken: hp ${s.healed.hp}`);
  expect(s.track === 'italia' && s.screen === 'results', `expected Italia results, got ${s.track} ${s.screen}`);
  await page.screenshot({ path: join(SHOTS, 'italia-results.png') });
});

// ---------- design intent: decisions the owner made (see tests/intent.test.js for the rules) ----------
const tap = async (key) => { await page.keyboard.down(key); await game(() => window.__game.debug.step(1)); await page.keyboard.up(key); await game(() => window.__game.debug.step(1)); };
const hold = async (keys, frames) => { for (const k of keys) await page.keyboard.down(k); await game((n) => window.__game.debug.step(n), frames); for (const k of keys) await page.keyboard.up(k); };
const snap = () => game(() => window.__game.debug.snapshot());

await check('intent: full screen shows only the game (the page is just the canvas)', async () => {
  await open('');
  const els = await game(() => [...document.body.children].map((e) => e.tagName));
  expect(JSON.stringify(els) === '["CANVAS","SCRIPT"]', `page has ${els.join(', ')}`);
  const box = await game(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.width, r.height]; });
  expect(box[0] === 960 && box[1] === 540, `canvas does not fill the window: ${box}`);
});

await check('intent: keyboard - P1 drives with WASD, P2 with the arrow keys, P2 joins with Up', async () => {
  await open('?pause=1');
  await tap('ArrowUp');
  expect((await snap()).joined[1], 'Up arrow did not join P2');
  await game(() => window.__game.debug.startRace({ players: 2, seed: 7, skipCountdown: true }));
  await game(() => window.__game.debug.noTraffic());
  await hold(['KeyW', 'ArrowUp'], 120);
  let [a, b] = (await snap()).race.players;
  expect(a.v > 50 && b.v > 50, `W / Up did not accelerate: P1 ${a.v}, P2 ${b.v}`);
  const x0 = [a.x, b.x];
  await hold(['KeyA', 'ArrowRight'], 15);
  [a, b] = (await snap()).race.players;
  expect(a.x < x0[0] && b.x > x0[1], 'A / Right arrow did not steer');
  await hold(['KeyS', 'ArrowDown'], 60);
  [a, b] = (await snap()).race.players;
  expect(a.v < 20 && b.v < 20, `S / Down did not brake: ${a.v}, ${b.v}`);
});

await check('intent: controllers - pad 1 is P1, pad 2 is P2; A/RT gas, B/LT brake, stick steers, Start pauses', async () => {
  await open('?pause=1');
  const pad = (i, b, on) => game(([i, b, on]) => window.__pad(i, b, on), [i, b, on]);
  await pad(1, 0, true); await game(() => window.__game.debug.step(1)); await pad(1, 0, false); await game(() => window.__game.debug.step(1));
  expect((await snap()).joined[1], 'A on pad 2 did not join P2');
  await game(() => { const d = window.__game.debug; d.startRace({ players: 2, seed: 7, skipCountdown: true }); d.noTraffic(); });
  await pad(0, 0, true); await pad(1, 7, true); await game(() => window.__game.debug.step(120)); // A on pad 1, RT on pad 2
  let [a, b] = (await snap()).race.players;
  expect(a.v > 50 && b.v > 50, `A / RT did not accelerate: P1 ${a.v}, P2 ${b.v}`);
  const x0 = a.x;
  await game(() => window.__axis(0, 0, -1)); await game(() => window.__game.debug.step(15)); await game(() => window.__axis(0, 0, 0));
  expect((await snap()).race.players[0].x < x0, 'left stick did not steer P1');
  await pad(0, 0, false); await pad(1, 7, false); await pad(0, 1, true); await pad(1, 6, true); await game(() => window.__game.debug.step(60)); // B / LT
  [a, b] = (await snap()).race.players;
  expect(a.v < 20 && b.v < 20, `B / LT did not brake: ${a.v}, ${b.v}`);
  await pad(0, 1, false); await pad(1, 6, false);
  await pad(0, 9, true); await game(() => window.__game.debug.step(1)); await pad(0, 9, false);
  const t0 = (await snap()).race.t; await game(() => window.__game.debug.step(60));
  const s = await snap();
  expect(s.paused && s.race.t === t0, `Start did not pause (paused ${s.paused}, clock ${t0} -> ${s.race.t})`);
});

await check('intent: Esc pauses and freezes the race clock', async () => {
  await open('?screen=race&players=2&seed=7&skip=1&pause=1');
  await game(() => window.__game.debug.step(30));
  await tap('Escape');
  const t0 = (await snap()).race.t; await game(() => window.__game.debug.step(120));
  const s = await snap();
  expect(s.paused && s.race.t === t0, 'race kept running while paused');
});

await check('intent: both tracks are playable - Berlin on the left, Italia on the right', async () => {
  await open('?screen=tracks&pause=1');
  await tap('KeyD'); await tap('Space');
  let s = await snap();
  expect(s.screen === 'race' && s.race.track === 'italia' && s.race.length === 21000, `Italia did not start (${s.screen}, ${s.race?.track})`);
  await open('?screen=tracks&pause=1');
  await tap('Space');
  s = await snap();
  expect(s.screen === 'race' && s.race.track === 'berlin' && s.race.length === 20000, 'Berlin did not start');
});

await check('intent: there is music and sound - menu music, race music, M mutes', async () => {
  await open('?pause=1');
  await tap('Space'); // any key unlocks audio (browsers need a key press first)
  let s = await snap();
  expect(s.audio.running && s.audio.music === 'menu', `menu music not playing: ${JSON.stringify(s.audio)}`);
  await tap('Space'); await tap('Space'); // -> tracks -> Berlin
  s = await snap();
  expect(s.screen === 'race' && s.audio.music === 'race', `race music not playing: ${s.screen} ${JSON.stringify(s.audio)}`);
  const m0 = s.audio.muted;
  await tap('KeyM');
  s = await snap();
  expect(s.audio.muted === !m0, 'M did not toggle mute');
  await tap('KeyM');
});

await check('no runtime errors'
, async () => {
  const errs = await game(() => window.__game.errors);
  expect(errs.length === 0 && problems.length === 0, [...errs, ...problems].join('\n       '));
});

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed (screenshots in test-results/)` : '\nall smoke checks passed');
process.exit(failed ? 1 : 0);
