// All sound is synthesised with WebAudio: chiptune music, per-player engine hum (P1 left speaker, P2 right) and effects.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 8-bar melody over C - G - Am - F. Each note: [step (16ths), midi, length in steps]
const ROOTS = [48, 43, 45, 41];
const LEAD = [
  [[0, 72, 2], [2, 76, 2], [4, 79, 4], [8, 76, 2], [10, 79, 2], [12, 84, 4]],
  [[0, 83, 2], [2, 79, 2], [4, 74, 4], [8, 79, 2], [10, 83, 2], [12, 86, 4]],
  [[0, 84, 2], [2, 81, 2], [4, 76, 4], [8, 81, 2], [10, 79, 2], [12, 76, 4]],
  [[0, 77, 4], [4, 81, 4], [8, 84, 2], [10, 81, 2], [12, 79, 4]],
  [[0, 79, 2], [2, 84, 2], [4, 88, 6], [12, 86, 2], [14, 84, 2]],
  [[0, 83, 4], [4, 79, 2], [6, 81, 2], [8, 83, 4], [12, 86, 4]],
  [[0, 84, 2], [2, 83, 2], [4, 81, 2], [6, 79, 2], [8, 76, 4], [12, 79, 4]],
  [[0, 77, 2], [2, 79, 2], [4, 81, 4], [8, 79, 6], [14, 74, 2]],
];

export function createAudio() {
  let ctx = null, master, music, sfx, noise, timer = null, mode = null, step = 0, nextT = 0;
  let muted = false;
  try { muted = localStorage.getItem('euro-rush-muted') === '1'; } catch { /* storage blocked */ }
  const engines = [];

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
      music = ctx.createGain(); music.gain.value = 0.16; music.connect(master);
      sfx = ctx.createGain(); sfx.gain.value = 0.5; sfx.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (mode) { const m = mode; mode = null; playMusic(m); }
    }
    if (ctx.state === 'suspended') ctx.resume();
  }
  const ready = () => !!ctx && ctx.state === 'running';

  function tone(freq, t, dur, type, vol, dest = sfx, slideTo = null) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(t, dur, vol, filt, freq, dest = sfx) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = filt; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t); s.stop(t + dur + 0.02);
  }

  // ---------- music ----------
  function scheduleStep(i, t, race) {
    const s = i % 16, bar = Math.floor(i / 16), root = ROOTS[bar % 4];
    if (s % 2 === 0) tone(mtof(root + (s % 4 === 0 ? 0 : 12)), t, 0.14, 'triangle', 0.9, music);
    if (race) {
      if (s % 4 === 0) { tone(140, t, 0.14, 'sine', 1.1, music, 45); }
      if (s === 4 || s === 12) { burst(t, 0.12, 0.6, 'bandpass', 1800, music); }
      if (s % 2 === 1) burst(t, 0.03, 0.25, 'highpass', 7000, music);
    } else {
      if (s === 0 || s === 8) tone(140, t, 0.14, 'sine', 0.8, music, 45);
      if (s % 4 === 2) burst(t, 0.03, 0.2, 'highpass', 7000, music);
    }
    for (const [st, m, len] of LEAD[bar % 8]) {
      if (st === s) tone(mtof(m), t, len * stepDur() * 0.9, race ? 'square' : 'triangle', race ? 0.32 : 0.45, music);
    }
    if (s === 0) for (const k of [0, 4, 7]) tone(mtof(root + 24 + k), t, stepDur() * 14, 'sine', 0.12, music);
  }
  const stepDur = () => 60 / (mode === 'race' ? 150 : 118) / 4;
  function playMusic(m) {
    if (mode === m) return;
    mode = m; step = 0;
    if (!ctx) return;
    clearInterval(timer);
    nextT = ctx.currentTime + 0.05;
    timer = setInterval(() => {
      while (nextT < ctx.currentTime + 0.15) { scheduleStep(step, nextT, mode === 'race'); nextT += stepDur(); step++; }
    }, 25);
  }
  function stopMusic() { clearInterval(timer); timer = null; mode = null; }

  // ---------- engines ----------
  // Soft, low rumble: triangle + sine sub through a gentle lowpass, with a "putt-putt" tremolo.
  // Pitch climbs within each gear and drops on the shift, so speeding up sounds like going through gears.
  const GEARS = [0, 50, 95, 140, 185, 230, 999];
  function startEngines(n) {
    stopEngines();
    if (!ctx) return;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), sub = ctx.createOscillator(), f = ctx.createBiquadFilter();
      const trem = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain();
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.type = 'triangle'; sub.type = 'sine'; f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 0.7;
      lfo.type = 'sine'; lfo.frequency.value = 10; depth.gain.value = 0.25; trem.gain.value = 0.75; g.gain.value = 0;
      o.connect(f); sub.connect(f); f.connect(trem); trem.connect(g);
      lfo.connect(depth); depth.connect(trem.gain);
      if (pan) { pan.pan.value = n > 1 ? (i ? 0.6 : -0.6) : 0; g.connect(pan); pan.connect(sfx); } else g.connect(sfx);
      // tyre screech while drifting: looped noise through a narrow band-pass
      const sq = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), sg = ctx.createGain();
      sq.buffer = noise; sq.loop = true; bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 5; sg.gain.value = 0;
      sq.connect(bp); bp.connect(sg); sg.connect(pan || sfx);
      o.start(); sub.start(); lfo.start(); sq.start();
      engines.push({ o, sub, f, lfo, g, sq, sg, bp });
    }
  }
  function updateEngines(players, on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    players.forEach((p, i) => {
      const e = engines[i]; if (!e) return;
      let gear = 0;
      while (p.v >= GEARS[gear + 1]) gear++;
      const rpm = Math.min(1, (p.v - GEARS[gear]) / (GEARS[gear + 1] - GEARS[gear]));
      const f = (36 + gear * 4 + rpm * 40) * (p.boost > 0 ? 1.08 : 1);
      e.o.frequency.setTargetAtTime(f, t, 0.04); e.sub.frequency.setTargetAtTime(f / 2, t, 0.04);
      e.lfo.frequency.setTargetAtTime(f / 4, t, 0.04);
      e.f.frequency.setTargetAtTime(220 + gear * 40 + rpm * 500 + (p.boost > 0 ? 300 : 0), t, 0.05);
      e.g.gain.setTargetAtTime(on && p.tow <= 0 && p.finish == null ? 0.05 + rpm * 0.02 : 0, t, 0.08);
      e.sg.gain.setTargetAtTime(on && p.drift > 0.08 ? 0.18 : 0, t, 0.05);
      e.bp.frequency.setTargetAtTime(2000 + Math.min(800, Math.abs(p.slip) * 8), t, 0.05);
    });
  }
  function stopEngines() { for (const e of engines.splice(0)) { try { e.o.stop(); e.sub.stop(); e.lfo.stop(); e.sq.stop(); } catch { /* already stopped */ } } }

  // ---------- effects ----------
  const fx = {
    crash: (big) => { const t = ctx.currentTime; burst(t, big ? 0.5 : 0.25, big ? 0.9 : 0.6, 'lowpass', big ? 900 : 1500); tone(110, t, 0.25, 'square', 0.5, sfx, 40); },
    bump: () => { const t = ctx.currentTime; tone(90, t, 0.15, 'sine', 0.9, sfx, 50); tone(620, t, 0.12, 'square', 0.25, sfx, 300); burst(t, 0.1, 0.4, 'bandpass', 2500); },
    pickup: () => { const t = ctx.currentTime; [72, 76, 79, 84].forEach((m, i) => tone(mtof(m), t + i * 0.05, 0.1, 'square', 0.35)); },
    espresso: () => { const t = ctx.currentTime; tone(200, t, 0.5, 'sawtooth', 0.3, sfx, 900); burst(t, 0.4, 0.3, 'highpass', 3000); },
    beep: (go) => tone(go ? 880 : 440, ctx.currentTime, go ? 0.5 : 0.18, 'square', 0.4),
    finish: () => { const t = ctx.currentTime; [72, 76, 79, 84, 79, 84].forEach((m, i) => tone(mtof(m), t + i * 0.11, i === 5 ? 0.6 : 0.12, 'square', 0.4)); },
    tow: () => { const t = ctx.currentTime; tone(400, t, 0.7, 'triangle', 0.4, sfx, 80); },
    blip: () => tone(660, ctx.currentTime, 0.06, 'square', 0.25),
    select: () => { const t = ctx.currentTime; tone(660, t, 0.06, 'square', 0.3); tone(990, t + 0.06, 0.1, 'square', 0.3); },
  };
  const play = (name, arg) => { if (ready() && fx[name]) fx[name](arg); };

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('euro-rush-muted', muted ? '1' : '0'); } catch { /* storage blocked */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
  }

  return {
    unlock, playMusic, stopMusic, startEngines, updateEngines, stopEngines, play, toggleMute,
    get muted() { return muted; }, get running() { return ready(); }, get mode() { return mode; },
  };
}
