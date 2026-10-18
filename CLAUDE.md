# Euro Rush

Two-player split-screen retro racer: plain browser ES modules with no build step. Live at https://gokul-bhoomi.github.io/euro-rush/ (GitHub Pages serves `main`, so anything pushed to `main` is public right away).

## Before every commit: run the verify skill

Run the `verify` skill (`.claude/skills/verify/SKILL.md`) after any change and **before every commit**. At a minimum, `npm run verify` (unit tests + headless-Chrome smoke test) must pass. The pre-commit hook and GitHub Actions enforce this. Never commit with `--no-verify`.

`main` is protected, so nobody can push to it directly, admins included. Work on a branch, push it, open a pull request, and merge once the `verify` check is green. Merging to `main` publishes the game, because GitHub Pages serves `main`.

- New or changed game rules (`src/sim.js`, `src/track.js`) need a test in `tests/sim.test.js`.
- New screens or features need a check in `tests/smoke.mjs`.
- Visual changes also need the manual browser steps in the verify skill (screenshots), because the automated checks can't judge looks.

## Layout

- `src/sim.js`: race rules. Pure and deterministic, with a fixed 1/60 s step.
- `src/track.js`: the seeded Berlin track and its road path (hairpins, sweepers).
- `src/render.js`, `src/screens.js`: drawing on a 480x270 canvas.
- `src/audio.js`: WebAudio music and sound.
- `src/input.js`: gamepads and keyboard.
- `src/main.js`: game loop, screens and the `window.__game.debug` API used by the tests.
- `mockup/`: the original UI mockup, kept as the visual reference.
