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

await check('no runtime errors', async () => {
  const errs = await game(() => window.__game.errors);
  expect(errs.length === 0 && problems.length === 0, [...errs, ...problems].join('\n       '));
});

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed (screenshots in test-results/)` : '\nall smoke checks passed');
process.exit(failed ? 1 : 0);
