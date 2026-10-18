# Euro Rush

A two-player retro top-down racing game for the couch. Plug a laptop into the TV, grab two controllers, and race split-screen from Alexanderplatz to the Brandenburger Tor, past the TV tower and the East Side Gallery and through mountain-style hairpins.

Runs in the browser. No install and no build step.

## Play now

**https://gokul-bhoomi.github.io/euro-rush/**

Open the link in Chrome, Edge or Firefox. Nothing to install.

## Run it locally

The game uses JavaScript modules, so it has to be served over HTTP. Opening `index.html` straight from disk won't work.

```bash
git clone https://github.com/gokul-bhoomi/euro-rush.git
cd euro-rush
python3 -m http.server 5173
```

Then open **http://localhost:5173** in Chrome, Edge or Firefox.

To play on the TV, connect the laptop by HDMI, open the game and press **F** for fullscreen. Fullscreen shows only the race.

## Players and controllers

- **Player 1** presses A (or Space/Enter) on the title screen.
- **Player 2** joins on the title or track screen by pressing **A on the second controller** or the **Up arrow** on the keyboard. The title screen shows how many controllers it sees ("PADS: n"). If a pad isn't counted, press any button on it to wake it up.
- The first controller connected is P1 and the second is P2. Any standard Xbox, PlayStation or Switch Pro controller (USB or Bluetooth) works.
- Playing alone is fine too. The empty half of the screen just shows a panel.

| | Controller | P1 keyboard | P2 keyboard |
|---|---|---|---|
| Gas | A or RT | W | Up arrow |
| Brake | B or LT | S | Down arrow |
| Steer | Left stick or d-pad | A / D | Left / Right arrow |
| Confirm (menus) | A | Space or Enter | Up arrow |
| Pause | Start | Esc or P | |

Press **F** for fullscreen and **M** to mute or unmute.

## How to win

Both players race at the same time. **The fastest time to the finish wins.** Once the first car crosses the line, the other player has 30 seconds to finish or gets a DNF.

- **Traffic:** your side of the road has slow trams, trucks and cars to overtake. The oncoming lanes on the left are emptier, but the cars there are fast and a head-on crash hurts a lot.
- **Construction zones** close an oncoming lane. Don't drive into the barriers.
- **Hairpins:** yellow signs and a flashing `<<<` / `>>>` HAIRPIN warning come before each switchback. Brake! On the inside lane you're safe at about 120 km/h. Go in much faster and you slide wide onto the kerb and the wall. The outside line is longer but can be taken faster. The gentle sweeping curves can be taken flat out.
- **Bumping:** you can shove the other player. The car that steers into the other one does more damage.
- **Damage:** when your HP runs out, your car is towed. You lose a few seconds and get a **+10 s penalty**.
- **Snacks:** a Brezel heals +15 HP and a Döner heals +30 HP. An **espresso** gives a short speed boost.
- **Top speed** is 330 km/h, and it takes a long, clean run to get there.

## For developers

You need Node 18+ and Google Chrome.

```bash
npm install      # once: installs the test tool and turns on the pre-commit hook
npm run verify   # unit tests + a headless-Chrome smoke test that plays through the game
```

**Every commit must pass `npm run verify`.** The pre-commit hook runs it automatically and blocks the commit if anything fails. GitHub Actions runs it again on every push and pull request. `main` is protected: make changes on a branch, open a pull request, and it can merge once the `verify` check passes. Some tests (`tests/intent.test.js` and the `intent:` checks in the smoke test) lock in the game's design decisions, like emptier-but-faster oncoming lanes, Brezel/Döner/espresso, hairpin switchbacks, a short race and the colour palette. If one fails, talk to the owner before changing it. Changed a game rule? Add a test in `tests/sim.test.js`. Added a screen or feature? Add a check in `tests/smoke.mjs`. If you use Claude Code, run the `verify` skill before committing.

- `src/sim.js`: the race rules (pure and deterministic).
- `src/track.js`: track generation and road path.
- `src/render.js` and `src/screens.js`: drawing.
- `src/audio.js`: synthesized music and sound.
- `src/input.js`: controllers and keyboard.
- `mockup/`: the original UI mockup.

Coming later: the Italia track (croissants, pizza and Vespas), more countries, and more.
