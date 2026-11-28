// The one shared game state. Modules import G and hang their systems off it.
export const G = {
  rd: null, text: null, parts: null,         // renderer, labels, particles
  time: 0, dt: 0, frame: 0,
  map: null,                                  // current map runtime (world/map.js)
  player: null, actors: [], drops: [], effects: [], floaters: [],
  cam: { x: 0, y: 0, zoom: 1, viewW: 1280, viewH: 720, shake: 0 },
  char: null,                                 // save data of the played hero
  roster: null,                               // the simulated players
  party: [],                                  // heroes in the player's party (not the player)
  auto: false,
  settings: { music: 0.5, sfx: 0.7, amb: 0.5, names: true, dmgNumbers: true, quality: 1 },
  ui: null, game: null, best: null,
  events: [],                                 // queued {type, ...} for the UI
  paused: false, mode: 'title',
};
export const emit = (type, data = {}) => { G.events.push({ type, ...data }); };
export const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const chance = (p) => Math.random() < p;
