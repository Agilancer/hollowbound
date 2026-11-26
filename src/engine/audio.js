// Tiny WebAudio synth: sound effects and three procedural music tracks. No audio files.

let ctx = null, master, sfxBus, musicBus, echo, noiseBuf;
let muted = false;
try { muted = localStorage.getItem('hollowbound-muted') === '1'; } catch (e) { /* storage blocked */ }
const MASTER_VOL = 0.7;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_VOL;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.9;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.55;
  musicBus.connect(master);
  // feedback echo used by the cave bells
  echo = ctx.createDelay(1);
  echo.delayTime.value = 0.36;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(musicBus);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlock() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
}
/** False until a tap or key has woken the audio (a pad press doesn't count as one in most browsers). */
export function soundReady() { return !!ctx && ctx.state === 'running'; }
export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('hollowbound-muted', muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
  if (ctx) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ctx.currentTime, 0.05);
  return muted;
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function env(g, t, vol, attack, dur, release) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone({ type = 'square', f = 440, f2 = null, t = 0, dur = 0.1, vol = 0.1, attack = 0.004, release = null, dest = sfxBus, lp = null, detune = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  o.detune.value = detune;
  const g = ctx.createGain();
  env(g, t, vol, attack, dur, release ?? dur * 0.7);
  let node = o;
  if (lp) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    o.connect(fl);
    node = fl;
  }
  node.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ t = 0, dur = 0.1, vol = 0.1, type = 'bandpass', f = 1000, f2 = null, q = 1, dest = sfxBus, attack = 0.002 }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, vol, attack, dur, dur * 0.8);
  s.connect(fl); fl.connect(g); g.connect(dest);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

const SFX = {
  jump: (t) => tone({ type: 'square', f: 260, f2: 520, t, dur: 0.09, vol: 0.05, lp: 2400 }),
  land: (t) => noise({ t, dur: 0.07, vol: 0.12, type: 'lowpass', f: 500 }),
  step: (t) => noise({ t, dur: 0.035, vol: 0.035, type: 'lowpass', f: 700 + Math.random() * 300 }),
  swing: (t) => noise({ t, dur: 0.13, vol: 0.1, f: 900, f2: 3200, q: 2 }),
  swing3: (t) => { noise({ t, dur: 0.18, vol: 0.13, f: 600, f2: 2600, q: 2 }); tone({ type: 'sine', f: 180, f2: 90, t, dur: 0.12, vol: 0.06 }); },
  hit: (t) => { noise({ t, dur: 0.06, vol: 0.18, f: 1800, q: 0.8 }); tone({ type: 'sine', f: 170, f2: 55, t, dur: 0.13, vol: 0.28 }); },
  squish: (t) => { tone({ type: 'sine', f: 320, f2: 120, t, dur: 0.12, vol: 0.14 }); noise({ t, dur: 0.08, vol: 0.08, type: 'lowpass', f: 900 }); },
  clang: (t) => { tone({ type: 'square', f: 1200, f2: 900, t, dur: 0.08, vol: 0.04, lp: 3000 }); noise({ t, dur: 0.1, vol: 0.08, f: 4000, q: 4 }); },
  enemyDie: (t) => { tone({ type: 'square', f: 420, f2: 70, t, dur: 0.28, vol: 0.06, lp: 1400 }); noise({ t: t + 0.02, dur: 0.2, vol: 0.08, type: 'lowpass', f: 1200, f2: 200 }); },
  slimeHop: (t) => tone({ type: 'sine', f: 180, f2: 360, t, dur: 0.07, vol: 0.05 }),
  coin: (t) => { tone({ type: 'square', f: 988, t, dur: 0.05, vol: 0.045, lp: 4000 }); tone({ type: 'square', f: 1319, t: t + 0.05, dur: 0.16, vol: 0.045, lp: 4000 }); },
  gem: (t) => [1319, 1568, 2093].forEach((f, i) => tone({ type: 'triangle', f, t: t + i * 0.05, dur: 0.22, vol: 0.06 })),
  chest: (t) => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, t: t + i * 0.07, dur: 0.3, vol: 0.08 })); noise({ t, dur: 0.12, vol: 0.06, type: 'lowpass', f: 600 }); },
  fanfare: (t) => { [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [988, 0.6], [1047, 0.72]].forEach(([f, d]) => { tone({ type: 'square', f, t: t + d, dur: 0.22, vol: 0.05, lp: 3000 }); tone({ type: 'triangle', f: f / 2, t: t + d, dur: 0.25, vol: 0.06 }); }); },
  hurt: (t) => { tone({ type: 'sawtooth', f: 240, f2: 90, t, dur: 0.22, vol: 0.1, lp: 1600 }); noise({ t, dur: 0.1, vol: 0.12, f: 900 }); },
  dash: (t) => noise({ t, dur: 0.16, vol: 0.09, type: 'highpass', f: 800, f2: 3000 }),
  talk: (t) => tone({ type: 'square', f: 520 + Math.random() * 140, t, dur: 0.025, vol: 0.022, lp: 2000 }),
  select: (t) => tone({ type: 'triangle', f: 880, t, dur: 0.05, vol: 0.06 }),
  confirm: (t) => { tone({ type: 'triangle', f: 660, t, dur: 0.06, vol: 0.07 }); tone({ type: 'triangle', f: 990, t: t + 0.06, dur: 0.1, vol: 0.07 }); },
  deny: (t) => { tone({ type: 'square', f: 200, t, dur: 0.08, vol: 0.05, lp: 900 }); tone({ type: 'square', f: 150, t: t + 0.09, dur: 0.12, vol: 0.05, lp: 900 }); },
  heal: (t) => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone({ type: 'sine', f, t: t + i * 0.06, dur: 0.4, vol: 0.06 })),
  portal: (t) => { tone({ type: 'sine', f: 110, f2: 440, t, dur: 0.7, vol: 0.12 }); noise({ t, dur: 0.7, vol: 0.06, f: 300, f2: 3000, q: 3 }); },
  door: (t) => { noise({ t, dur: 0.3, vol: 0.08, type: 'lowpass', f: 400, f2: 150 }); tone({ type: 'sine', f: 90, t, dur: 0.25, vol: 0.1 }); },
  rock: (t) => { noise({ t, dur: 0.16, vol: 0.16, type: 'lowpass', f: 1400, f2: 300 }); tone({ type: 'square', f: 140, f2: 70, t, dur: 0.08, vol: 0.05, lp: 600 }); },
  roar: (t) => { tone({ type: 'sawtooth', f: 110, f2: 70, t, dur: 0.9, vol: 0.14, lp: 700 }); tone({ type: 'sawtooth', f: 113, f2: 66, t, dur: 0.9, vol: 0.12, lp: 600 }); noise({ t, dur: 0.8, vol: 0.06, type: 'lowpass', f: 500 }); },
  slam: (t) => { noise({ t, dur: 0.45, vol: 0.28, type: 'lowpass', f: 380, f2: 80 }); tone({ type: 'sine', f: 80, f2: 35, t, dur: 0.4, vol: 0.35 }); },
  whoosh: (t) => noise({ t, dur: 0.3, vol: 0.08, f: 400, f2: 1600, q: 1.5 }),
  // Gorrak's wind-ups: a chesty grunt (cleave), a boot dragging on stone (charge), a rising heave (leap)
  grunt: (t) => { tone({ type: 'sawtooth', f: 150, f2: 92, t, dur: 0.24, vol: 0.12, lp: 650 }); noise({ t, dur: 0.16, vol: 0.05, type: 'lowpass', f: 420 }); },
  scrape: (t) => { noise({ t, dur: 0.5, vol: 0.11, f: 260, f2: 900, q: 3 }); noise({ t: t + 0.18, dur: 0.3, vol: 0.07, f: 700, f2: 300, q: 4 }); },
  rise: (t) => { tone({ type: 'sine', f: 110, f2: 300, t, dur: 0.36, vol: 0.14 }); noise({ t, dur: 0.36, vol: 0.06, f: 300, f2: 2200, q: 2 }); },
  death: (t) => [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', f, t: t + i * 0.18, dur: 0.3, vol: 0.09 })),
  drip: (t) => tone({ type: 'sine', f: 1400 + Math.random() * 900, f2: 700, t, dur: 0.06, vol: 0.03, dest: echo }),
  pause: (t) => tone({ type: 'triangle', f: 440, f2: 330, t, dur: 0.1, vol: 0.06 }),
};

const lastPlay = {};
export function sfx(name, vol = 1) {
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (lastPlay[name] && now - lastPlay[name] < 0.03) return; // de-dupe stacked hits
  lastPlay[name] = now;
  const f = SFX[name];
  if (!f) return;
  if (vol !== 1) {
    const prev = sfxBus;
    const g = ctx.createGain();
    g.gain.value = vol;
    g.connect(prev);
    sfxBus = g;
    try { f(now); } finally { sfxBus = prev; }
  } else f(now);
}

// ---------------------------------------------------------------- music
const CH = { D: [62, 66, 69], Bm: [59, 62, 66], G: [55, 59, 62], A: [57, 61, 64], Em: [52, 55, 59], C: [48, 52, 55] };
const TOWN_PROG = ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'G', 'A'];
const TOWN_MEL = [
  [[0, 74, 6], [6, 76, 2], [8, 78, 4], [12, 76, 4]],
  [[0, 74, 4], [4, 71, 4], [8, 69, 8]],
  [[0, 71, 4], [4, 74, 4], [8, 76, 6], [14, 74, 2]],
  [[0, 73, 8], [8, 69, 8]],
  [[0, 78, 4], [4, 81, 4], [8, 78, 4], [12, 76, 4]],
  [[0, 74, 6], [6, 76, 2], [8, 71, 8]],
  [[0, 79, 4], [4, 78, 4], [8, 76, 4], [12, 74, 4]],
  [[0, 76, 8], [8, 73, 4], [12, 69, 4]],
];
const CAVE_SCALE = [69, 72, 74, 76, 79, 81, 84];
const BOSS_BASS = [40, 40, 43, 40, 45, 40, 47, 45];

const TRACKS = {
  town: {
    bpm: 92,
    step(t, i, spb) {
      const bar = Math.floor(i / 16) % 8, s = i % 16;
      const ch = CH[TOWN_PROG[bar]];
      if (s === 0 || s === 8) tone({ type: 'sine', f: mtof(ch[0] - 12), t, dur: spb * 7, vol: 0.16, dest: musicBus });
      if (s % 2 === 0) {
        const n = ch[(s / 2) % 3] + (s >= 8 ? 12 : 0);
        tone({ type: 'triangle', f: mtof(n), t, dur: spb * 1.6, vol: 0.035, dest: musicBus });
      }
      if (Math.floor(i / 128) % 2 === 1 || i >= 128) {
        for (const [st, m, len] of TOWN_MEL[bar]) {
          if (st === s) {
            tone({ type: 'square', f: mtof(m), t, dur: spb * len * 0.95, vol: 0.03, lp: 2200, attack: 0.02, dest: musicBus });
            tone({ type: 'triangle', f: mtof(m), t, dur: spb * len, vol: 0.04, attack: 0.02, dest: echo });
          }
        }
      }
      if (s === 4 || s === 12) noise({ t, dur: 0.03, vol: 0.012, type: 'highpass', f: 6000, dest: musicBus });
    },
  },
  cave: {
    bpm: 66,
    start(t) {
      // low drone: two detuned saws through a slow-moving lowpass
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 3);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = 110;
      lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency);
      const oscs = [45, 45.08, 52].map((m) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.connect(lp);
        o.start(t);
        return o;
      });
      lp.connect(g); g.connect(musicBus);
      lfo.start(t);
      return () => {
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setTargetAtTime(0.0001, n, 0.4);
        oscs.forEach((o) => o.stop(n + 2));
        lfo.stop(n + 2);
      };
    },
    step(t, i, spb) {
      const s = i % 16;
      if (s % 4 === 0 && Math.random() < 0.42) {
        const m = CAVE_SCALE[Math.floor(Math.random() * CAVE_SCALE.length)];
        tone({ type: 'sine', f: mtof(m), t, dur: 1.6, vol: 0.05, attack: 0.005, dest: echo });
        tone({ type: 'sine', f: mtof(m + 12), t, dur: 0.6, vol: 0.012, dest: echo });
      }
      if (s === 0 && Math.floor(i / 16) % 2 === 0) tone({ type: 'sine', f: mtof(33), t, dur: spb * 12, vol: 0.09, attack: 0.6, dest: musicBus });
      if (Math.random() < 0.03) noise({ t, dur: 0.05, vol: 0.02, f: 2500 + Math.random() * 2000, q: 8, dest: echo });
    },
  },
  boss: {
    bpm: 138,
    step(t, i, spb) {
      const s = i % 16, bar = Math.floor(i / 16) % 4;
      if (s % 2 === 0) {
        const m = BOSS_BASS[(s / 2) % 8] + (bar === 3 ? 3 : 0);
        tone({ type: 'sawtooth', f: mtof(m), t, dur: spb * 1.8, vol: 0.07, lp: 700, dest: musicBus });
      }
      if (s % 4 === 0) { tone({ type: 'sine', f: 120, f2: 40, t, dur: 0.15, vol: 0.22, dest: musicBus }); }
      if (s === 4 || s === 12) noise({ t, dur: 0.12, vol: 0.09, f: 1800, q: 0.7, dest: musicBus });
      if (s % 2 === 1) noise({ t, dur: 0.03, vol: 0.025, type: 'highpass', f: 7000, dest: musicBus });
      const stab = { 0: 64, 6: 67, 10: 71, 14: 69 }[s];
      if (stab && bar % 2 === 1) tone({ type: 'square', f: mtof(stab), t, dur: spb * 1.5, vol: 0.025, lp: 2600, dest: musicBus });
    },
  },
  victory: {
    bpm: 100,
    step(t, i, spb) {
      const bar = Math.floor(i / 16) % 8, s = i % 16;
      const ch = CH[TOWN_PROG[bar]];
      if (s === 0) ch.forEach((m) => tone({ type: 'triangle', f: mtof(m), t, dur: spb * 15, vol: 0.035, attack: 0.1, dest: musicBus }));
      if (s % 4 === 0) tone({ type: 'sine', f: mtof(ch[0] - 12), t, dur: spb * 3, vol: 0.12, dest: musicBus });
      for (const [st, m, len] of TOWN_MEL[bar]) if (st === s) tone({ type: 'triangle', f: mtof(m + 12), t, dur: spb * len, vol: 0.05, dest: echo });
    },
  },
};

let current = null, stepIdx = 0, nextTime = 0, stopper = null;
export function music(name) {
  if (!ensure() || current === name) return;
  if (stopper) { stopper(); stopper = null; }
  current = name;
  stepIdx = 0;
  nextTime = ctx.currentTime + 0.12;
  const tr = TRACKS[name];
  if (tr && tr.start) stopper = tr.start(nextTime);
}
export function currentMusic() { return current; }

setInterval(() => {
  if (!ctx || !current || ctx.state !== 'running') return;
  const tr = TRACKS[current];
  if (!tr) return;
  const spb = 60 / tr.bpm / 4;
  if (nextTime < ctx.currentTime - 0.5) nextTime = ctx.currentTime + 0.05; // resumed after a stall
  while (nextTime < ctx.currentTime + 0.2) {
    tr.step(nextTime, stepIdx, spb);
    nextTime += spb;
    stepIdx++;
  }
}, 30);
