// Keyboard + gamepads -> per-player driving input and per-player menu "just pressed" events.
// Gamepad 1 = P1, gamepad 2 = P2 (standard mapping: Xbox / PlayStation / Switch Pro over USB or Bluetooth).
const KEYS = [
  { gas: ['KeyW'], brake: ['KeyS'], left: ['KeyA'], right: ['KeyD'], confirm: ['Space', 'Enter'], back: ['Escape', 'Backspace'], start: ['Enter'], pause: ['Escape', 'KeyP'] },
  { gas: ['ArrowUp'], brake: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], confirm: ['ArrowUp'], back: [], start: [], pause: [] },
];
const MENU = ['up', 'down', 'left', 'right', 'confirm', 'back', 'start', 'pause'];

export function createInput() {
  const down = new Set();
  let prev = [{}, {}];
  addEventListener('keydown', (e) => {
    down.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => down.clear());

  const pads = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);

  function readPad(gp) {
    if (!gp) return {};
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let steer = Math.abs(ax) > 0.18 ? ax : 0;
    if (b(14)) steer = -1;
    if (b(15)) steer = 1;
    return {
      gas: b(0) || b(7), brake: b(1) || b(6), steer,
      up: b(12) || ay < -0.5, down: b(13) || ay > 0.5, left: b(14) || ax < -0.5, right: b(15) || ax > 0.5,
      confirm: b(0), back: b(1), start: b(9), pause: b(9),
    };
  }
  function readKeys(K) {
    const h = (a) => K[a].some((k) => down.has(k));
    return {
      gas: h('gas'), brake: h('brake'), steer: (h('right') ? 1 : 0) - (h('left') ? 1 : 0),
      up: h('gas'), down: h('brake'), left: h('left'), right: h('right'), confirm: h('confirm'), back: h('back'), start: h('start'), pause: h('pause'),
    };
  }

  function poll() {
    const ps = pads();
    const drive = [], menu = [];
    for (let i = 0; i < 2; i++) {
      const k = readKeys(KEYS[i]), g = readPad(ps[i]);
      const cur = {};
      for (const a of MENU) cur[a] = !!(k[a] || g[a]);
      drive.push({ gas: k.gas || !!g.gas, brake: k.brake || !!g.brake, steer: k.steer || g.steer || 0 });
      const m = {};
      for (const a of MENU) m[a] = cur[a] && !prev[i][a];
      menu.push(m);
      prev[i] = cur;
    }
    return { drive, menu, pads: ps.length };
  }

  function rumble(pid, ms, mag) {
    const gp = pads()[pid];
    try { gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: mag, weakMagnitude: mag })?.catch?.(() => {}); } catch { /* not supported */ }
  }

  return { poll, rumble, isDown: (code) => down.has(code) };
}
