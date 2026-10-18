---
name: verify
description: Verify a change to the Euro Rush game actually works - run the simulation unit tests, launch the game in the browser pane, drive it through its debug API (menus, driving, crashes, bumps, snacks, towing, finish, pause), check for console errors, take screenshots, and report what passed and what could not be checked. Use after any change to the game, before every commit, and before telling the user something works.
---

# Verify Euro Rush

The game is this repo (plain ES modules, no build step; run commands from the repo root). `src/sim.js` + `src/track.js` are pure and deterministic, so you test logic in Node. Everything else is checked in the browser pane through `window.__game.debug`.

Do every step below, in order, unless it clearly cannot be affected by the change. Never report a step as passed that you did not run.

## 1. Automated checks (required before every commit)

```bash
npm install      # once: installs playwright-core and turns on the pre-commit hook
npm run verify   # unit tests (tests/sim.test.js) + headless-Chrome smoke test (tests/smoke.mjs)
```

Both must pass. The pre-commit hook (`.githooks/pre-commit`) runs the same checks and blocks the commit if they fail, and GitHub Actions (`.github/workflows/verify.yml`) runs them on every push and pull request. Never bypass them with `--no-verify`. `main` is protected and requires the `verify` check, so changes land through a pull request from a branch.

- **Intent tests** (`tests/intent.test.js`, and the `intent:` checks in `tests/smoke.mjs`) encode the owner's design decisions. If one fails, don't change the test to make it pass. Report which decision the change breaks and ask the owner; update the test only after they agree.
- Changed or added rules in `sim.js` / `track.js` (damage, speeds, pickups, bumps, finishing, curves)? **Add or update a test in `tests/sim.test.js` first** and make sure it fails without your change.
- Added a screen, menu flow or visible feature? **Add a check to `tests/smoke.mjs`** that drives it through the debug API. Note that `d.step(n)` renders only once, after the n steps, so step one frame at a time to exercise drawing at many positions.

The smoke test cannot judge how things look, so for visual changes also do the manual steps below.

## 2. Launch

- `preview_start` with name `euro-rush` (defined in `.claude/launch.json`; serves the repo on port 5173).
- Game: `http://localhost:5173/`. UI mockup (design reference only): `http://localhost:5173/mockup/`.
- Useful URL params: `?screen=race&players=2&seed=7&skip=1` (start a race straight away, fixed seed, no countdown), `&players=1` (solo), `&pause=1` (start with the sim frozen), `&track=italia` (race or preselect Italia), `?screen=tracks`, `?screen=results`.

## 3. Drive it through the debug API

The browser pane is often hidden, which throttles timers. **Always freeze the sim and step it by hand** so results are deterministic:

```js
const d = __game.debug;
d.pause();                          // freeze the real-time loop
d.step(60);                         // advance exactly 60 sim steps (1 s) and render
d.setInput(0, { gas: true, steer: -1 });  // override P1 driving input (P2 = 1); null to release
d.clearInput();
d.press('confirm', 0);              // one-shot menu press: up/down/left/right/confirm/back/start/pause, for player 0 or 1
d.startRace({ players: 2, seed: 7, skipCountdown: true, track: 'italia' }); // track defaults to the one selected
d.teleport(0, 19900);               // move P1 to road distance y (and optional x)
d.set(1, { hp: 5 });                // poke any player field
d.pickups(); d.works();             // untaken pickups / construction zones of the current race
d.noTraffic();                      // remove all traffic from the current race (speed/visual checks)
d.curves(); d.pos(s, x);            // turns [{s0,s1,k,kind:'hairpin'|'sweep'}] (k>0 = right) and the map position {x,y,a} of road point (s, x)
d.snapshot();                       // JSON: screen, paused, joined, audio, fx texts, race phase/t, per-player x/y/v/hp/boost/tow/penalty/finish/rank/stats
__game.errors;                      // uncaught errors from the game loop - must be []
```

World units: pixels. Positions are road coordinates: `y` = distance along the road, `x` = across it, lane centres always x = 68, 100 (oncoming), 132, 164 (our side), even in turns. The renderer bends the road onto a north-up map (`d.pos`). Track length is `snapshot().race.length` (Berlin 20000 = 5.6 km, Italia 21000 = 5.9 km). Speeds are px/s (HUD km/h = x1.5). Top speed is 220 = 330 km/h and is meant to be hard to reach: ~170 (255 km/h) after 6 s of gas, the full 220 only after ~20 s without a crash; espresso allows 260 (390 km/h). Near top speed the view shows speed streaks, a light rumble, the camera pulls back 12px and the km/h readout flashes.

### Scenarios (run the ones the change could touch; run all for big changes)

Use `javascript_exec` with `await` and return `d.snapshot()` so the result is visible. Check the numbers, not just "no error".

1. **Boot**: load `/`, wait ~1.5 s. Expect `screen: 'title'`, `__game.errors` empty, no errors in `read_console_messages`.
2. **Menus**: `press('confirm',1)` → `joined: [true,true]`; `press('confirm',0)` → `screen: 'tracks'`; `press('right')` + `press('confirm')` → `screen: 'race'` with `race.track: 'italia'`; back on tracks, `press('left')` + `press('confirm')` → Berlin, `phase: 'countdown'`; `step(200)` → `phase: 'race'`. `press('back')` on tracks → title.
3. **Driving**: for speed checks remove traffic: `d.startRace({players:1, seed:7, skipCountdown:true}); d.noTraffic(); d.setInput(0,{gas:true})`, then sample `v` every `step(60)`. Expect ~255 km/h at 6 s and 330 km/h only after ~20 s of gas. Steer left for 5 s at speed → `x` hits 40 and `v` ≤ 55 (sidewalk slows you down gradually).
4. **Oncoming traffic**: seed 7, P1 gas + steer into lane 0 (`d.set(0,{x:68})` each few steps or `setInput(0,{gas:true, steer:-1})` then neutral), step ~20 s → `stats.crashes` > 0 and `hp` < 100; the HUD HP bar and `-N HP` pop show in a screenshot.
5. **Bump**: `d.set(0,{x:150,y:500,v:100}); d.set(1,{x:162,y:500,v:100}); d.setInput(0,{gas:true,steer:1}); d.step(1)` → `snapshot().fx` contains `'BUMP!'`, P2 `hp` 94, P1 `hp` 97, P1 `stats.bumps` 1.
6. **Tow**: `d.set(0,{hp:1})` then cause any crash → `tow` > 0, `penalty` 10, `stats.towed` 1; `step(160)` → `hp` 60.
7. **Snacks / espresso**: `d.pickups()` lists untaken pickups `{kind, lane, x, y}`; teleport 60px behind one in its lane (`d.teleport(0, k.y-60, k.x)`), gas, `step(60)` → `stats.snacks` or `stats.espressos` +1, `hp` up (Brezel +15, Döner +30) or `boost` > 0 for espresso. `d.works()` lists construction zones.
8. **Finish + results**: `const L=d.snapshot().race.length; d.teleport(0,L-50); d.teleport(1,L-50); setInput both gas; step(300)` → both have `finish`, `phase: 'done'`, then `step(150)` → `screen: 'results'`. Screenshot it. Solo: `players:1` gives "NICE RUN!".
9. **Hairpins & drift**: Berlin has two switchbacks (two 180° hairpins each, legs side by side, through a park with no buildings) and two pairs of gentle sweepers. Sweepers are flat out (no drift at 330 km/h). Hairpins: lane 3 on the inside is safe at ~120 km/h, slides a bit at ~150, and much faster slides across to the outer wall/kerb (kerb limit 165 km/h); the outside line holds ~225 km/h. Check: `d.noTraffic()`, `h = d.curves().filter(c=>c.kind==='hairpin')[0]`, put P1 at `h.s0-250` lane 3 with `v:180` + gas and P2 at `h.s0-150` in lane **2** (same lane = they bump), `step(6)` at a time logging `drift`/`x`/`v`. Screenshot mid-turn: the road must form a U around a green island with red/white kerbs, no gaps or seams in the slices, cars rotated along the road, `<<<`/`>>>` + HAIRPIN warning while one is <700px ahead, two yellow signs before it. Step on to the return leg: the car drives down the screen pointing down and stays clear of the HUD. Also check a sweeper (road and buildings at an angle) and the finish gate. Traffic is drawn at its map position, so cars in a hairpin keep their size and turn with the road, and a tram bends section by section. **Italia** (`track: 'italia'`) has three switchbacks through green hills and one pair of sweepers along the coast: check the sea + promenade on the left and cliff houses/lemon trees on the right, the Leaning Tower halfway, Rome (ochre buildings, Colosseum) on the last stretch and the SPQR arch at the finish. FPS with both views in hairpins should stay at display rate (count rAF over 2s).
10. **Pause**: `press('pause')` in a race → `paused: true` and sim time stops advancing; `press('confirm')` resumes.

## 4. Look at it

Show the Browser pane first (`show_pane` preview): while it is hidden, screenshots can be a stale frame even though `snapshot()` is already on the next screen. Take screenshots (`computer` screenshot, or `zoom` on the canvas) of every screen the change touches: title, tracks, race (both halves + middle strip), results, pause. Check:

- nothing overlaps the HUD or gets clipped, text is readable, both halves look the same apart from their player
- the palette is the chosen **Riviera Pop** (sand HUD, P1 pink-red, P2 blue)
- the effect you changed is actually visible (freeze with `d.pause()` and `d.step(n)` to catch a moment, e.g. a bump at the frame it happens)

Then `read_console_messages` with `onlyErrors: true` and confirm `__game.errors` is still `[]`.

## 5. What you cannot verify here (say so in the report)

- **Sound/music**: the AudioContext only starts after a real key press or click. A `computer` key press in the pane unlocks it, after which `snapshot().audio.running` should be `true` and `music` `'menu'` or `'race'`. You cannot hear it: tell the user to listen. (The user disliked the first buzzy engine sound; the current one is a soft geared rumble, so keep it soft.)
- **Gamepads**: a physical controller cannot be simulated. Ask the user to try two controllers (P1 = first pad connected).
- **Fullscreen / TV**: `requestFullscreen` needs a real user gesture. Ask the user to press F on the TV.

## 6. Report

Short list: each step → passed / failed / not run (and why). For failures include the `snapshot()` JSON, the console error and a screenshot. Reset the viewport (`resize_window` preset `desktop`) if you changed it.
