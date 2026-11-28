// Sound, ported from Velscour's src/core/audio.js: its samples (assets/audio/sfx, decoded lazily and cached) with
// procedural Web Audio layers and fallbacks for everything that has no sample, plus streamed music and ambience beds
// that crossfade between two <audio> decks routed into the Web Audio graph (so songs are never fully decoded).
//   audio.init()            build the graph (idempotent); the context resumes on the first pointerdown/keydown
//   audio.setVolume(k, v)   'master' | 'music' | 'sfx' | 'amb', 0..1
//   audio.music(id)         crossfade to a looping track (an id from audio.json, or a MUSIC_FOR key); null stops
//   audio.ambience(id)      crossfade to a looping bed (an id from audio.json, or an AMB_FOR key); null stops
//   audio.sfx(name, opts)   one-shot, opts { vol = 1, rate = 1, pan = 0 }; unknown names are silent
//   audio.list()            { music, amb, sfx }
// Nothing here throws: a missing file, a blocked autoplay or a suspended context just means silence.
import { asset } from './paths.js';

const AUDIO = 'audio/';
const MAX_VOICES = 24;          // simultaneous one-shots; the oldest is faded out past this
const MIN_GAP = 0.04;           // seconds between two plays of the same name
const NAME_VOICES = 4;          // default cap of one name's overlapping voices

// what assets/audio/audio.json lists (replaced by the real manifest once it loads; ids it lacks are skipped)
const KNOWN_MUSIC = ['empty_school', 'hymn_of_the_abyss', 'stone_room_reverberation', 'stone_room_reverberation_2'];
const KNOWN_AMB = ['beach', 'beach_rain', 'beach_storm', 'cave', 'cave_rain', 'cave_storm', 'forest_day', 'forest_day_rain',
  'forest_day_storm', 'forest_night', 'forest_night_rain', 'forest_night_storm', 'inside_day', 'inside_day_rain',
  'inside_day_storm', 'inside_night', 'inside_night_rain', 'inside_night_storm', 'river_loop', 'river_stream_loop', 'sea',
  'sea_rain', 'sea_storm', 'torch_loop', 'waterfall_loop'];

/** Area kind -> music id. Velscour has four songs: the title hymn, the town theme and two "wilds" pieces. */
export const MUSIC_FOR = {
  title: 'hymn_of_the_abyss',
  town: 'empty_school', hall: 'empty_school',
  wilds: 'stone_room_reverberation', forest: 'stone_room_reverberation', march: 'stone_room_reverberation',
  castle: 'stone_room_reverberation',
  graveyard: 'stone_room_reverberation_2', catacombs: 'stone_room_reverberation_2', sewers: 'stone_room_reverberation_2',
  caves: 'stone_room_reverberation_2', dungeon: 'stone_room_reverberation_2',
  breach: 'hymn_of_the_abyss', raid: 'hymn_of_the_abyss', boss: 'hymn_of_the_abyss', arena: 'hymn_of_the_abyss',
};
/** Area kind -> ambience bed id (after Velscour's biome table). The title has none, as in Velscour. */
export const AMB_FOR = {
  title: null,
  town: 'forest_night',            // Velscour's town bed
  wilds: 'forest_day',
  forest: 'forest_night_rain',     // dark_forest
  graveyard: 'forest_night_storm', // necropolis
  catacombs: 'inside_night',       // catacombs
  sewers: 'river_stream_loop',     // sewers
  march: 'forest_day_storm',       // mountainside
  castle: 'inside_night_rain',     // library / blood keep
  caves: 'cave',
  breach: 'inside_night_storm',    // eternal_breach
  dungeon: 'cave_rain',
  raid: 'sea_storm',               // abyss
  boss: 'cave_storm',              // throne
  hall: 'inside_day',              // gilded / keep hall
  arena: 'torch_loop',             // forge: fires around the pit
};
const TRACK_VOL = { hymn_of_the_abyss: 0.9, empty_school: 0.75, stone_room_reverberation: 0.6, stone_room_reverberation_2: 0.6 };
const AMB_LEVEL = 0.7, AMB_DUCK = 0.6;   // beds sit lower while a song plays

let ac = null, master, comp, sfxBus, musicBus, ambBus, noiseBuf, pulseWave;
let hooked = false, unlocked = false;
let manifest = null, manifestAsked = false;
const vols = { master: 0.9, music: 0.6, sfx: 0.8, amb: 0.5 };
const buffers = {};      // sample slug -> AudioBuffer | null (failed)
const loading = {};      // sample slug -> Promise
const last = {};         // name -> ac time of its last play
const live = [];         // one-shot voices: { name, g, end, nodes }
const decks = { music: [], amb: [] };
const cur = { music: null, amb: null };       // { id, deck }
const pending = {};      // music / amb asked for before init()

const clamp01 = (v) => Math.min(1, Math.max(0, +v || 0));
const R = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ context
function wake() {
  if (!ac) return;
  try {
    if (ac.state !== 'running') { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }
    if (!unlocked) {   // iOS: media elements must first play inside a gesture
      unlocked = true;
      for (const k in decks) for (const d of decks[k]) d.unlock();
    }
    for (const k in decks) for (const d of decks[k]) d.retry();   // a play() the autoplay policy refused earlier
  } catch (e) { /* never fatal */ }
}

function init() {
  try {
    if (typeof window === 'undefined') return;
    if (!hooked) {
      hooked = true;
      const gesture = () => { build(); wake(); };
      for (const k of ['pointerdown', 'keydown', 'touchend', 'pointerup', 'click']) window.addEventListener(k, gesture, true);
      // a Home Screen app comes back from the background with its context suspended/'interrupted'
      document.addEventListener('visibilitychange', () => { if (!document.hidden && ac && ac.state !== 'running') { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } });
    }
    build();
    if (ac && ac.state !== 'running') { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }
  } catch (e) { /* no audio */ }
}

function build() {
  if (ac) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  // iOS: play like a media app, not through the ringer (the silent switch would otherwise mute everything)
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
  const c = new AC();
  master = c.createGain(); master.connect(c.destination);
  comp = c.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 6;
  comp.connect(master);
  sfxBus = c.createGain(); sfxBus.connect(comp);
  musicBus = c.createGain(); musicBus.connect(master);
  ambBus = c.createGain(); ambBus.connect(master);
  noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 1.5), c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // 25% pulse, the classic arcade lead
  const n = 32, re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
  pulseWave = c.createPeriodicWave(re, im);
  ac = c;
  applyVolumes();
  decks.music = [new Deck(musicBus), new Deck(musicBus)];
  decks.amb = [new Deck(ambBus), new Deck(ambBus)];
  loadManifest();
  if ('music' in pending) { const m = pending.music; delete pending.music; music(m); }
  if ('amb' in pending) { const a = pending.amb; delete pending.amb; ambience(a); }
}

function applyVolumes() {
  if (!ac) return;
  const t = ac.currentTime;
  for (const [node, v] of [[master, vols.master], [sfxBus, vols.sfx], [musicBus, vols.music], [ambBus, vols.amb]]) {
    try { node.gain.cancelScheduledValues(t); node.gain.setTargetAtTime(v, t, 0.03); } catch (e) { node.gain.value = v; }
  }
}

function setVolume(kind, v) {
  if (!(kind in vols)) return;
  vols[kind] = clamp01(v);
  try { applyVolumes(); } catch (e) { /* ignore */ }
}

function loadManifest() {
  if (manifestAsked) return;
  manifestAsked = true;
  fetch(asset(AUDIO + 'audio.json')).then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (m && m.sfx && m.music && m.amb) manifest = m;
  }).catch(() => {});   // no manifest: every file is simply tried
}

// ------------------------------------------------------------------ procedural sounds (Velscour's synth voices)
let out = null, vEnd = 0;   // the voice being built: where its nodes connect, and when its last node falls silent

function env(g, t, a, peak, dec, sus = 0.0001) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(sus, t + a + dec);
}

function noise(t, dur, { type = 'lowpass', f0 = 1000, f1 = f0, q = 1, vol = 0.5, a = 0.005 } = {}) {
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filt = ac.createBiquadFilter(); filt.type = type; filt.Q.value = q;
  filt.frequency.setValueAtTime(Math.min(20000, f0), t); filt.frequency.exponentialRampToValueAtTime(Math.min(20000, Math.max(20, f1)), t + dur);
  const g = ac.createGain(); env(g, t, a, vol, dur);
  src.connect(filt); filt.connect(g); g.connect(out);
  src.start(t, Math.random() * 0.5); src.stop(t + a + dur + 0.05);
  vEnd = Math.max(vEnd, t + a + dur + 0.05);
}

function tone(t, dur, { wave = 'sine', f0 = 440, f1 = f0, vol = 0.3, a = 0.005, detune = 0 } = {}) {
  const o = ac.createOscillator(); o.detune.value = detune;
  if (wave === 'pulse') o.setPeriodicWave(pulseWave); else o.type = wave;
  o.frequency.setValueAtTime(Math.min(20000, f0), t); o.frequency.exponentialRampToValueAtTime(Math.min(20000, Math.max(20, f1)), t + dur);
  const g = ac.createGain(); env(g, t, a, vol, dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + a + dur + 0.05);
  vEnd = Math.max(vEnd, t + a + dur + 0.05);
}

const SYN = {
  // --- combat
  swing: (t, p) => noise(t, 0.14, { type: 'bandpass', f0: 3000 * p, f1: 600, q: 2, vol: 0.25 }),
  whoosh: (t, p) => { noise(t, 0.3, { type: 'bandpass', f0: 1500 * p, f1: 240, q: 1.6, vol: 0.32, a: 0.03 }); tone(t, 0.22, { wave: 'triangle', f0: 130 * p, f1: 55, vol: 0.14, a: 0.02 }); },
  hit: (t, p) => { noise(t, 0.09, { f0: 1800 * p, f1: 300, vol: 0.35 }); tone(t, 0.1, { f0: 160 * p, f1: 60, vol: 0.3 }); },
  thud: (t, p) => { tone(t, 0.25, { f0: 110 * p, f1: 35, vol: 0.5, wave: 'triangle' }); noise(t, 0.25, { f0: 700, f1: 60, vol: 0.4 }); },
  hit_heavy: (t, p) => { SYN.hit(t, p * 0.8); SYN.thud(t, p); },
  critping: (t) => { tone(t, 0.08, { wave: 'square', f0: 1400, f1: 700, vol: 0.06 }); tone(t + 0.03, 0.16, { f0: 2100, f1: 2000, vol: 0.05 }); },
  crit: (t, p) => { SYN.hit(t, p); SYN.critping(t); },
  shoot: (t, p) => { tone(t, 0.12, { wave: 'triangle', f0: 320 * p, f1: 180, vol: 0.2 }); noise(t, 0.08, { type: 'bandpass', f0: 2000, f1: 900, q: 3, vol: 0.15 }); },
  block: (t, p) => { tone(t, 0.12, { wave: 'square', f0: 900 * p, f1: 600, vol: 0.08 }); noise(t, 0.06, { type: 'highpass', f0: 3000, vol: 0.2 }); },
  explode: (t, p) => { noise(t, 0.7, { f0: 1600 * p, f1: 60, vol: 0.7, a: 0.004 }); tone(t, 0.5, { f0: 90 * p, f1: 30, vol: 0.5, wave: 'triangle' }); },
  dash: (t, p) => { noise(t, 0.2, { type: 'bandpass', f0: 900 * p, f1: 5200 * p, q: 1.4, vol: 0.3, a: 0.02 }); noise(t + 0.05, 0.16, { type: 'highpass', f0: 5000, f1: 2200, vol: 0.1, a: 0.02 }); },
  // --- magic: one voice per element
  cast: (t, p) => { noise(t, 0.34, { type: 'bandpass', f0: 420 * p, f1: 2300 * p, q: 3, vol: 0.24, a: 0.07 }); tone(t, 0.3, { wave: 'triangle', f0: 330 * p, f1: 880 * p, vol: 0.08, a: 0.04 }); },
  fire: (t, p) => { noise(t, 0.35, { f0: 2400 * p, f1: 300, vol: 0.35, a: 0.03 }); tone(t, 0.3, { wave: 'triangle', f0: 140 * p, f1: 60, vol: 0.12, a: 0.03 }); },
  cold: (t, p) => { tone(t, 0.25, { f0: 2200 * p, f1: 3400 * p, vol: 0.07 }); noise(t, 0.2, { type: 'highpass', f0: 5000, f1: 2500, vol: 0.18 }); for (let i = 0; i < 3; i++) tone(t + 0.05 + i * 0.045, 0.07, { f0: R(3200, 5200) * p, vol: 0.035 }); },
  light: (t, p) => {
    const o = ac.createOscillator(); o.type = 'sawtooth';
    const g = ac.createGain(); env(g, t, 0.003, 0.12, 0.2);
    for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(R(150, 1800) * p, t + i * 0.02);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25); vEnd = Math.max(vEnd, t + 0.3);
    noise(t, 0.15, { type: 'highpass', f0: 3000, vol: 0.2 });
  },
  thunder: (t, p) => { SYN.light(t, p); noise(t, 1.2, { f0: 1400 * p, f1: 60, vol: 0.22, a: 0.004 }); tone(t, 0.9, { f0: 55, f1: 28, vol: 0.16 }); },
  holy: (t, p) => { [523, 659, 784].forEach((f, i) => tone(t + i * 0.02, 0.5, { f0: f * p, vol: 0.07, a: 0.03 })); tone(t + 0.06, 0.6, { f0: 1568 * p, vol: 0.03, a: 0.08 }); noise(t, 0.45, { type: 'highpass', f0: 6000, vol: 0.05, a: 0.12 }); },
  shadow: (t, p) => { tone(t, 0.4, { wave: 'sawtooth', f0: 220 * p, f1: 55, vol: 0.12 }); tone(t, 0.4, { wave: 'sawtooth', f0: 233 * p, f1: 58, vol: 0.06 }); noise(t, 0.3, { f0: 600, f1: 100, vol: 0.2 }); },
  poison: (t, p) => { for (let i = 0; i < 5; i++) tone(t + i * 0.04, 0.06, { f0: R(200, 500) * p, f1: R(400, 800), vol: 0.07 }); },
  acid: (t, p) => { noise(t, 0.25, { type: 'bandpass', f0: 500 * p, f1: 200, q: 8, vol: 0.4 }); SYN.poison(t, p * 0.7); },
  arcane: (t, p) => { tone(t, 0.3, { f0: 500 * p, f1: 1400 * p, vol: 0.12 }); tone(t, 0.3, { f0: 750 * p, f1: 2100 * p, vol: 0.06, wave: 'triangle' }); },
  arcane_full: (t, p) => { SYN.arcane(t, p); noise(t, 0.12, { type: 'bandpass', f0: 2600, f1: 1200, q: 4, vol: 0.12 }); },
  heal: (t, p) => { [660, 880, 1100].forEach((f, i) => tone(t + i * 0.07, 0.4, { f0: f * p, vol: 0.07 })); },
  buff: (t, p) => { tone(t, 0.5, { f0: 300 * p, f1: 900 * p, vol: 0.1, a: 0.05 }); noise(t, 0.4, { type: 'highpass', f0: 4000, vol: 0.08, a: 0.1 }); },
  summon: (t, p) => { noise(t, 0.5, { type: 'bandpass', f0: 300 * p, f1: 1500 * p, q: 4, vol: 0.3, a: 0.1 }); tone(t, 0.4, { f0: 200 * p, f1: 600 * p, vol: 0.06 }); tone(t + 0.3, 0.5, { wave: 'sawtooth', f0: 82 * p, f1: 62 * p, vol: 0.07, a: 0.1 }); },
  portal: (t, p) => { noise(t, 1.0, { type: 'bandpass', f0: 200 * p, f1: 2400 * p, q: 3, vol: 0.4, a: 0.2 }); tone(t, 1.0, { f0: 200 * p, f1: 800 * p, vol: 0.08, a: 0.2 }); },
  // --- bodies
  jump: (t, p) => { tone(t, 0.13, { f0: 250 * p, f1: 540 * p, vol: 0.1, a: 0.01 }); noise(t, 0.1, { type: 'bandpass', f0: 700, f1: 1900, q: 1.5, vol: 0.09, a: 0.01 }); },
  land: (t, p) => { tone(t, 0.12, { wave: 'triangle', f0: 95 * p, f1: 40, vol: 0.28 }); noise(t, 0.1, { f0: 800 * p, f1: 120, vol: 0.2 }); },
  step: (t, p) => noise(t, 0.05, { f0: 700 * p, f1: 200, vol: 0.06 }),
  hurt: (t, p) => { tone(t, 0.15, { wave: 'square', f0: 220 * p, f1: 140 * p, vol: 0.08 }); noise(t, 0.1, { f0: 1200, f1: 300, vol: 0.2 }); },
  die: (t, p) => { tone(t, 1.4, { wave: 'sawtooth', f0: 300 * p, f1: 40, vol: 0.25 }); noise(t, 1.0, { f0: 1000, f1: 50, vol: 0.3 }); },
  squish: (t, p) => { noise(t, 0.22, { f0: 900 * p, f1: 120, q: 4, vol: 0.4 }); tone(t, 0.18, { f0: 90, f1: 40, vol: 0.2, wave: 'triangle' }); },
  bones: (t, p) => { for (let i = 0; i < 4; i++) tone(t + i * 0.035, 0.05, { wave: 'square', f0: R(700, 1300) * p, f1: 300, vol: 0.06 }); },
  mob_die: (t, p) => { SYN.squish(t, p); SYN.bones(t + 0.06, p); },
  boss_roar: (t, p) => {
    tone(t, 1.2, { wave: 'sawtooth', f0: 90 * p, f1: 40, vol: 0.3, a: 0.1 }); noise(t, 1.2, { f0: 800, f1: 100, vol: 0.4, a: 0.1 });
    tone(t + 0.05, 0.9, { wave: 'sawtooth', f0: 140 * p, f1: 70, vol: 0.18, a: 0.08 }); noise(t + 0.05, 0.9, { type: 'bandpass', f0: 520, f1: 240, q: 2, vol: 0.3, a: 0.08 });
  },
  // --- loot, rewards
  coin: (t) => { for (let i = 0; i < 3; i++) tone(t + i * 0.05, 0.12, { f0: R(2400, 3600), vol: 0.06, wave: 'triangle' }); },
  loot: (t, p) => { tone(t, 0.07, { f0: 660 * p, vol: 0.12 }); tone(t + 0.07, 0.1, { f0: 990 * p, vol: 0.12 }); },
  loot_rare: (t, p) => { SYN.loot(t, p); [784, 988, 1175, 1568].forEach((f, i) => tone(t + 0.16 + i * 0.06, 0.4, { f0: f * p, vol: 0.07, wave: 'triangle' })); noise(t + 0.16, 0.5, { type: 'highpass', f0: 6000, vol: 0.05, a: 0.1 }); },
  potion: (t, p) => { for (let i = 0; i < 4; i++) tone(t + i * 0.06, 0.08, { f0: R(300, 600) * p, f1: R(150, 300), vol: 0.12 }); },
  chest: (t, p) => { SYN.thud(t, 1.4 * p); SYN.loot(t + 0.1, p); },
  // the triumphant arpeggio over Velscour's level-up toll: sub boom, a cracked low bell
  levelup: (t) => {
    noise(t, 0.3, { type: 'bandpass', f0: 160, f1: 1200, q: 2, vol: 0.16, a: 0.2 });
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.09, 0.5, { f0: f, vol: 0.12, wave: 'triangle' }));
    const ts = t + 0.45;
    tone(ts, 1.0, { f0: 70, f1: 30, vol: 0.4, a: 0.003 });
    [[1, 0.1], [2, 0.07], [2.74, 0.04], [4, 0.035], [5.4, 0.02]].forEach(([m, v], i) => tone(ts, 2.2 - i * 0.3, { f0: 196 * m, f1: 196 * m * 0.99, vol: v, a: 0.004, detune: i % 2 ? 6 : -6 }));
    [523, 784, 1046].forEach((f) => tone(ts, 1.4, { f0: f, vol: 0.05, a: 0.05 }));
  },
  quest_accept: (t) => { tone(t, 0.14, { wave: 'triangle', f0: 392, vol: 0.12 }); tone(t + 0.11, 0.3, { wave: 'triangle', f0: 587, vol: 0.12 }); tone(t + 0.11, 0.4, { f0: 1174, vol: 0.03, a: 0.03 }); },
  quest_done: (t) => { [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.05, 0.45, { f0: f, vol: 0.09, wave: 'triangle' })); [523, 659, 784].forEach((f) => tone(t + 0.3, 0.9, { f0: f * 2, vol: 0.04, a: 0.04 })); },
  bell: (t, p) => { [[1, 0.16, 2.4], [2.0, 0.09, 1.6], [2.76, 0.07, 1.2], [5.4, 0.04, 0.7], [0.5, 0.06, 2.8]].forEach(([k, v, d]) => tone(t, d, { wave: 'sine', f0: 392 * k * p, f1: 392 * k * p * 0.995, vol: v, a: 0.004 })); },
  // --- interface
  ui_click: (t, p) => tone(t, 0.05, { wave: 'triangle', f0: 900 * p, f1: 700 * p, vol: 0.1 }),
  ui_open: (t, p) => { tone(t, 0.09, { wave: 'triangle', f0: 520 * p, f1: 880 * p, vol: 0.09 }); noise(t, 0.07, { type: 'highpass', f0: 4000, vol: 0.03 }); },
  ui_close: (t, p) => { tone(t, 0.09, { wave: 'triangle', f0: 820 * p, f1: 440 * p, vol: 0.09 }); noise(t, 0.06, { f0: 1200, f1: 300, vol: 0.03 }); },
  ui_error: (t, p) => { tone(t, 0.18, { wave: 'square', f0: 130 * p, f1: 110 * p, vol: 0.08 }); tone(t + 0.09, 0.14, { wave: 'square', f0: 104 * p, f1: 92 * p, vol: 0.07 }); },
  equip: (t, p) => { tone(t, 0.07, { wave: 'square', f0: 1100 * p, f1: 700, vol: 0.05 }); noise(t, 0.08, { type: 'bandpass', f0: 2400, f1: 900, q: 3, vol: 0.2 }); },
  chat: (t, p) => { tone(t, 0.05, { f0: 1050 * p, vol: 0.06 }); tone(t + 0.045, 0.07, { f0: 1400 * p, vol: 0.05 }); },
  shout: (t, p) => { tone(t, 0.2, { wave: 'pulse', f0: 392 * p, vol: 0.07, a: 0.01 }); tone(t + 0.1, 0.32, { wave: 'pulse', f0: 587 * p, vol: 0.07, a: 0.01 }); },
  rope: (t, p) => { noise(t, 0.12, { type: 'bandpass', f0: 520 * p, f1: 340 * p, q: 9, vol: 0.3, a: 0.02 }); tone(t, 0.1, { wave: 'triangle', f0: 170 * p, f1: 130 * p, vol: 0.06, a: 0.02 }); },
  door: (t, p) => SYN.thud(t, 0.7 * p),
  gate: (t, p) => { tone(t, 0.8, { wave: 'sawtooth', f0: 70 * p, f1: 50, vol: 0.12 }); noise(t, 0.8, { type: 'bandpass', f0: 900, f1: 400, q: 6, vol: 0.2 }); },
};

// ------------------------------------------------------------------ the sound table
const n3 = (base, n) => Array.from({ length: n }, (_, i) => `${base}_${i + 1}`);
const STEP = (kind) => ({ s: [...n3(`${kind}_walk`, 5), ...n3(`${kind}_run`, 5)], v: 0.2, max: 2, syn: 'step' });
// name -> { s: sample slugs (one at random), v: sample gain, r: sample base rate, smax: voices of the sample itself,
//           layer: SYN voice played on top of the sample, lv: its gain, syn: SYN voice while there is no sample
//           (default: the layer, or the SYN of the same name), max: voices of this name, fixed: no pitch jitter }
const DEFS = {
  hit: { s: [...n3('sword_impact_hit', 3), ...n3('bow_impact_hit', 3), ...n3('torch_impact', 2)], v: 0.55 },
  hit_heavy: { s: n3('sword_impact_hit', 3), v: 0.7, r: 0.72, layer: 'thud', lv: 0.7 },
  crit: { s: n3('sword_impact_hit', 3), v: 0.75, layer: 'critping', syn: 'crit' },
  swing: { s: n3('sword_attack', 3), v: 0.5 },
  swing_heavy: { s: n3('torch_attack_strike', 2), v: 0.6, r: 0.8, layer: 'whoosh', lv: 0.7 },
  shoot: { s: n3('bow_attack', 2), v: 0.55 },
  block: { s: [...n3('sword_blocked', 3), ...n3('sword_parry', 3), ...n3('bow_blocked', 3)], v: 0.55 },
  explode: { s: [...n3('rock_meteor_throw', 2), ...n3('rock_meteor_swarm', 2)], v: 0.55, layer: 'explode', max: 3 },
  dash: {},
  cast: {},
  cast_fire: { s: [...n3('fireball', 3), ...n3('firespray', 2)], v: 0.45, syn: 'fire' },
  cast_cold: { s: [...n3('ice_throw', 2), ...n3('ice_freeze', 2), ...n3('ice_barrage', 2)], v: 0.45, syn: 'cold' },
  cast_light: { s: ['thunder_crack'], v: 0.3, r: 1.5, smax: 1, layer: 'light', lv: 1, syn: 'thunder' },
  cast_holy: { syn: 'holy' },
  cast_shadow: { syn: 'shadow' },
  cast_poison: { s: n3('waterspray', 2), v: 0.3, r: 1.25, smax: 2, layer: 'poison', lv: 1, syn: 'acid' },
  cast_arcane: { s: n3('spell_impact', 3), v: 0.5, layer: 'arcane', lv: 0.6, syn: 'arcane_full' },
  heal: { max: 3 },
  buff: { s: n3('firebuff', 2), v: 0.35, smax: 1, layer: 'buff', lv: 0.8, max: 3 },
  summon: { s: n3('rock_wall', 2), v: 0.25, smax: 1, layer: 'summon', lv: 1, max: 3 },
  portal: { max: 2 },
  jump: { max: 3 },
  land: { s: n3('dirt_run', 5), v: 0.4, r: 0.75, layer: 'land', lv: 0.6, max: 3 },
  step: { s: [...n3('dirt_walk', 5), ...n3('stone_walk', 5)], v: 0.2, max: 3 },
  step_stone: STEP('stone'), step_dirt: STEP('dirt'), step_water: STEP('water'), step_wood: STEP('wood'),
  hurt: {},
  die: { max: 2 },
  mob_die: {},
  boss_roar: { max: 1 },
  coin: {},
  loot: {},
  loot_rare: { max: 2 },
  potion: { max: 2 },
  levelup: { max: 1, fixed: true },
  quest_accept: { max: 1, fixed: true },
  quest_done: { max: 1, fixed: true },
  ui_click: { fixed: true },
  ui_open: { max: 2, fixed: true },
  ui_close: { max: 2, fixed: true },
  ui_error: { max: 2, fixed: true },
  equip: { s: ['lock_unlock'], v: 0.5, r: 1.15, max: 2 },
  chat: { max: 2, fixed: true },
  shout: { max: 2, fixed: true },
  rope: { s: n3('wood_walk', 5), v: 0.3, r: 1.25, layer: 'rope', lv: 0.5, max: 2 },
  chest: { s: [...n3('chest_open', 2), 'lock_unlock'], v: 0.7, max: 1 },
  bell: { max: 2, fixed: true },
  // extras Velscour has samples for
  door: { s: [...n3('door_open', 2), ...n3('door_close', 2)], v: 0.45, max: 2 },
  gate: { s: ['gate_open', 'gate_close'], v: 0.7, max: 1 },
  thunder: { s: ['thunder_crack'], v: 0.6, max: 1 },
};
for (const k in DEFS) { const d = DEFS[k]; if (!d.syn) d.syn = d.layer && !d.s ? d.layer : (SYN[k] ? k : d.layer); }

// ------------------------------------------------------------------ samples: fetched and decoded on first use
function loadSample(slug) {
  if (slug in buffers) return null;
  if (loading[slug]) return loading[slug];
  if (manifest && !manifest.sfx.includes(slug)) { buffers[slug] = null; return null; }
  return (loading[slug] = fetch(asset(`${AUDIO}sfx/${slug}.mp3`))
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((data) => new Promise((ok, no) => { const p = ac.decodeAudioData(data, ok, no); if (p && p.catch) p.catch(no); }))
    .then((buf) => { buffers[slug] = buf; })
    .catch(() => { buffers[slug] = null; })   // that sound stays procedural
    .then(() => { delete loading[slug]; }));
}

// ------------------------------------------------------------------ one-shots
function endVoice(v) {
  const i = live.indexOf(v);
  if (i >= 0) live.splice(i, 1);
  try { v.g.disconnect(); if (v.pan) v.pan.disconnect(); } catch (e) { /* gone */ }
}
function steal(v) {   // fade the voice out in 30 ms and unplug it
  const i = live.indexOf(v);
  if (i >= 0) live.splice(i, 1);
  try {
    const t = ac.currentTime;
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + 0.03);
  } catch (e) { /* ignore */ }
  setTimeout(() => { try { v.g.disconnect(); if (v.pan) v.pan.disconnect(); } catch (e) { /* gone */ } }, 80);
}

function sfx(name, opts) {
  try {
    if (!ac || !Object.prototype.hasOwnProperty.call(DEFS, name)) return;
    const d = DEFS[name];
    if (d.s) for (const k of d.s) loadSample(k);           // first call: start decoding (the synth voice covers it)
    if (ac.state !== 'running' || vols.sfx <= 0 || vols.master <= 0) return;
    const now = ac.currentTime;
    if (now - (last[name] ?? -1) < MIN_GAP) return;
    const o = opts || {};
    const vol = Math.min(2, Math.max(0, o.vol ?? 1)), rate = Math.min(4, Math.max(0.25, o.rate ?? 1)), pan = Math.min(1, Math.max(-1, o.pan ?? 0));
    if (!(vol > 0)) return;
    // voice caps: this name's own, then the global one (oldest voice gives way)
    let mine = 0, oldest = null;
    for (let i = live.length - 1; i >= 0; i--) {
      const v = live[i];
      if (v.end <= now) { endVoice(v); continue; }
      if (v.name === name) { mine++; oldest = v; }
    }
    if (mine >= (d.max || NAME_VOICES)) { if (!oldest) return; steal(oldest); }
    while (live.length >= MAX_VOICES) steal(live[0]);
    last[name] = now;

    const p = rate * (d.fixed ? 1 : 0.92 + Math.random() * 0.16);
    const g = ac.createGain(); g.gain.value = vol;
    let pn = null;
    if (pan && ac.createStereoPanner) { pn = ac.createStereoPanner(); pn.pan.value = pan; g.connect(pn); pn.connect(sfxBus); } else g.connect(sfxBus);
    const v = { name, g, pan: pn, end: now + 0.1, sampleEnd: 0 };
    const prevOut = out, prevEnd = vEnd;
    out = g; vEnd = now;
    try {
      let played = false;
      const ready = d.s ? d.s.filter((k) => buffers[k]) : null;
      if (ready && ready.length) {
        let busy = 0;
        if (d.smax) for (const w of live) if (w.name === name && w.sampleEnd > now) busy++;
        if (!d.smax || busy < d.smax) {
          const buf = buffers[ready[Math.floor(Math.random() * ready.length)]];
          const sp = p * (d.r || 1);
          const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = sp;
          const sg = ac.createGain(); sg.gain.value = d.v ?? 0.5;
          src.connect(sg); sg.connect(g); src.start(now);
          v.sampleEnd = now + buf.duration / sp;
          vEnd = Math.max(vEnd, v.sampleEnd + 0.05);
          played = true;
        }
        if (d.layer && SYN[d.layer]) {
          const lg = ac.createGain(); lg.gain.value = d.lv ?? 0.6; lg.connect(g); out = lg;
          SYN[d.layer](now, p);
          out = g; played = true;
        }
      }
      if (!played && SYN[d.syn]) SYN[d.syn](now, p);
      v.end = vEnd + 0.05;
    } finally { out = prevOut; vEnd = prevEnd; }
    live.push(v);
    // unplug the voice once it is over: left wired in, a long session piles up finished nodes
    setTimeout(() => endVoice(v), Math.max(50, (v.end - now) * 1000 + 150));
  } catch (e) { /* audio errors are never fatal */ }
}

// ------------------------------------------------------------------ streamed tracks
let silentUrl = null;
function silence() {   // a 0.05 s silent WAV, used to unlock the media elements inside the first gesture
  if (silentUrl) return silentUrl;
  const n = 2205, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true);
  v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  return (silentUrl = URL.createObjectURL(new Blob([b], { type: 'audio/wav' })));
}

/** One <audio> element -> gain -> bus. fade() ramps the gain; the element itself always plays at full volume. */
class Deck {
  constructor(bus) {
    this.el = new Audio(); this.el.preload = 'auto';
    this.g = ac.createGain(); this.g.gain.value = 0; this.g.connect(bus);
    try { ac.createMediaElementSource(this.el).connect(this.g); } catch (e) { this.direct = true; }
    this.name = null; this.gen = 0; this.url = null;
    this.el.addEventListener('error', () => { /* a missing file: this deck stays silent */ });
  }
  unlock() {
    if (this.name) return;
    try { this.el.src = silence(); this.url = null; const p = this.el.play(); if (p) p.then(() => { if (!this.name) this.el.pause(); }).catch(() => {}); } catch (e) { /* ignore */ }
  }
  retry() {
    if (!this.name || !this.el.paused) return;
    try { const p = this.el.play(); if (p) p.catch(() => {}); } catch (e) { /* ignore */ }
  }
  load(name, url, at = 0) {
    this.gen++; this.name = name;
    try {
      this.el.loop = true;
      if (this.url !== url) { this.el.src = url; this.url = url; }
      try { this.el.currentTime = at; } catch (e) { /* not seekable yet */ }
      const p = this.el.play(); if (p) p.catch(() => {});
    } catch (e) { /* ignore */ }
    const t = ac.currentTime;
    this.g.gain.cancelScheduledValues(t); this.g.gain.setValueAtTime(0, t);
  }
  fade(v, sec) {
    const g = this.g.gain, t = ac.currentTime;
    try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + Math.max(0.02, sec)); } catch (e) { g.value = v; }
    if (this.direct) this.el.volume = Math.min(1, v);
  }
  stop(sec) {
    const gen = ++this.gen; this.fade(0, sec);
    setTimeout(() => { if (this.gen === gen) { try { this.el.pause(); } catch (e) { /* ignore */ } this.name = null; } }, sec * 1000 + 60);
  }
}

function crossfade(kind, id, url, vol, sec, at) {
  const c = cur[kind];
  if (c && c.id === id) return;
  if (c) c.deck.stop(sec);
  cur[kind] = null;
  if (id == null) return;
  const deck = decks[kind].find((d) => !c || d !== c.deck) || decks[kind][0];
  deck.load(id, url, at);
  deck.fade(vol, sec);
  cur[kind] = { id, deck };
}
const ambLevel = () => AMB_LEVEL * (cur.music ? AMB_DUCK : 1);

function music(id) {
  try {
    if (id != null && Object.prototype.hasOwnProperty.call(MUSIC_FOR, id)) id = MUSIC_FOR[id];
    if (id === undefined) id = null;
    if (!ac) { pending.music = id; return; }
    if (id != null && !(manifest ? id in manifest.music : KNOWN_MUSIC.includes(id))) return;   // unknown: keep what plays
    const had = !!cur.music;
    crossfade('music', id, id == null ? null : asset(`${AUDIO}music/${id}.mp3`), TRACK_VOL[id] ?? 0.7, 1.5, 0);
    if (cur.amb && had !== !!cur.music) cur.amb.deck.fade(ambLevel(), 3);   // duck under songs, swell without
  } catch (e) { /* never fatal */ }
}

function ambience(id) {
  try {
    if (id != null && Object.prototype.hasOwnProperty.call(AMB_FOR, id)) id = AMB_FOR[id];
    if (id === undefined) id = null;
    if (!ac) { pending.amb = id; return; }
    if (id != null && !(manifest ? id in manifest.amb : KNOWN_AMB.includes(id))) return;
    const dur = (manifest && manifest.amb[id]) || (id === 'torch_loop' ? 10 : 60);
    crossfade('amb', id, id == null ? null : asset(`${AUDIO}amb/${id}.mp3`), ambLevel(), 3, Math.random() * Math.max(0, dur - 10));
  } catch (e) { /* never fatal */ }
}

function list() {
  return {
    music: manifest ? Object.keys(manifest.music) : [...KNOWN_MUSIC],
    amb: manifest ? Object.keys(manifest.amb) : [...KNOWN_AMB],
    sfx: Object.keys(DEFS),
  };
}

export const audio = { init, setVolume, music, ambience, sfx, list };

/** For tests and tooling: what is loaded and playing, and which files the tables above reference. */
export function audioDebug() {
  const sfxFiles = [...new Set(Object.values(DEFS).flatMap((d) => d.s || []))].sort();
  return {
    state: ac ? ac.state : 'none',
    decoded: Object.keys(buffers).filter((k) => buffers[k]).sort(),
    failed: Object.keys(buffers).filter((k) => buffers[k] === null),
    loading: Object.keys(loading).length,
    voices: live.length,
    music: cur.music && { id: cur.music.id, paused: cur.music.deck.el.paused, t: cur.music.deck.el.currentTime, gain: cur.music.deck.g.gain.value },
    amb: cur.amb && { id: cur.amb.id, paused: cur.amb.deck.el.paused, t: cur.amb.deck.el.currentTime, gain: cur.amb.deck.g.gain.value },
    manifest: !!manifest,
    defs: Object.fromEntries(Object.entries(DEFS).map(([k, d]) => [k, { samples: d.s || [], layer: d.s ? d.layer || null : null, synth: d.syn || null }])),
    files: {
      sfx: sfxFiles.map((k) => `sfx/${k}.mp3`),
      music: [...new Set(Object.values(MUSIC_FOR).filter(Boolean))].map((k) => `music/${k}.mp3`),
      amb: [...new Set(Object.values(AMB_FOR).filter(Boolean))].map((k) => `amb/${k}.mp3`),
    },
  };
}
