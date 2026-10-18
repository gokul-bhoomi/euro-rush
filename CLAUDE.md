# Euro Rush

Two-player split-screen retro racer: plain browser ES modules with no build step. Live at https://gokul-bhoomi.github.io/euro-rush/ (GitHub Pages serves `main`, so anything pushed to `main` is public right away).

## Before every commit: run the verify skill

Run the `verify` skill (`.claude/skills/verify/SKILL.md`) after any change and **before every commit**. At a minimum, `npm run verify` (unit tests + headless-Chrome smoke test) must pass. The pre-commit hook and GitHub Actions enforce this. Never commit with `--no-verify`.

`main` is protected, so nobody can push to it directly, admins included. Work on a branch, push it, open a pull request, and merge once the `verify` check is green. Merging to `main` publishes the game, because GitHub Pages serves `main`.

## Design intent: don't drift from what the owner asked for

`tests/intent.test.js` and the `intent:` checks in `tests/smoke.mjs` lock in the owner's design decisions: both players race at once in split-screen, time to finish (with penalties) decides the winner, towing costs +10 s, oncoming lanes are emptier but faster with traffic in both lanes, construction only closes oncoming lanes, Berlin snacks are Brezel/Döner and Italia snacks croissant/pizza, plus espresso, 330 km/h top speed that is hard to reach, a short race of about 2 minutes, a few hairpin switchbacks instead of lots of bends, mild drift, the Riviera Pop palette from the mockup, WASD/arrow/gamepad controls, two playable tracks (Berlin, and Italia from the Amalfi coast to the Colosseo, added at the owner's request on 2026-10-18), and music + sound with M to mute.

**If an intent test fails, your change goes against a design decision.** Don't edit or delete the test to make it pass. Stop and ask the owner. Change the test only after they agree, and say in the commit/PR which decision changed. Not built yet on purpose (don't add these without asking): other countries, speed cameras/penalties, ghost or take-turns mode, horn, online play.

## Tests for new work

- New or changed game rules (`src/sim.js`, `src/track.js`) need a test in `tests/sim.test.js`.
- New screens or features need a check in `tests/smoke.mjs`.
- Visual changes also need the manual browser steps in the verify skill (screenshots), because the automated checks can't judge looks.

## Layout

- `src/sim.js`: race rules. Pure and deterministic, with a fixed 1/60 s step.
- `src/track.js`: the seeded Berlin and Italia tracks and their road path (hairpins, sweepers).
- `src/render.js`, `src/screens.js`: drawing on a 480x270 canvas.
- `src/audio.js`: WebAudio music and sound.
- `src/input.js`: gamepads and keyboard.
- `src/main.js`: game loop, screens and the `window.__game.debug` API used by the tests.
- `mockup/`: the original UI mockup, kept as the visual reference.
