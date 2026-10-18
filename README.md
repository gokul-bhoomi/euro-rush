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

```bash
npm test        # unit tests for the race simulation (Node 18+)
```

- `src/sim.js`: the race rules (pure and deterministic).
- `src/track.js`: track generation and road path.
- `src/render.js` and `src/screens.js`: drawing.
- `src/audio.js`: synthesized music and sound.
- `src/input.js`: controllers and keyboard.
- `mockup/`: the original UI mockup.

Coming later: the Italia track (croissants, pizza and Vespas), more countries, and more.
