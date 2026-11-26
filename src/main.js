// Boot: load images, run a fixed 60 Hz simulation, present with a sharp upscale.
import { loadAll } from './engine/assets.js';
import { input, setupTouch } from './engine/input.js';
import { unlock } from './engine/audio.js';
import { Game } from './game/game.js';
import { W, H } from './game/ui.js';

const screen = document.getElementById('screen');
const sctx = screen.getContext('2d');
const buffer = document.createElement('canvas');
buffer.width = W; buffer.height = H;
const ctx = buffer.getContext('2d');
ctx.imageSmoothingEnabled = false;

// Sharp scaling: blow the 480x270 frame up by a whole number with nearest-neighbour,
// then let CSS shrink it the last little bit smoothly so pixels stay even at any size.
function resize() {
  const vw = innerWidth, vh = innerHeight;
  const s = Math.min(vw / W, vh / H);
  const cssW = Math.floor(W * s), cssH = Math.floor(H * s);
  const k = Math.max(1, Math.min(6, Math.ceil(s * (devicePixelRatio || 1))));
  if (screen.width !== W * k) { screen.width = W * k; screen.height = H * k; }
  screen.style.width = cssW + 'px';
  screen.style.height = cssH + 'px';
}
addEventListener('resize', resize);
resize();

function present() {
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(buffer, 0, 0, screen.width, screen.height);
}

function drawLoading(p) {
  ctx.fillStyle = '#0e0a14'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a2c40'; ctx.fillRect(W / 2 - 80, H / 2 - 3, 160, 6);
  ctx.fillStyle = '#ffb84a'; ctx.fillRect(W / 2 - 80, H / 2 - 3, Math.round(160 * p), 6);
  present();
}

const unlockOnce = () => { unlock(); };
addEventListener('pointerdown', unlockOnce);
addEventListener('keydown', unlockOnce);
setupTouch(document.getElementById('touch'));

drawLoading(0);
await loadAll(drawLoading);

const game = new Game();
window.game = game;
// a controller dropping out mid-run (battery, Bluetooth) pauses rather than leaving the hero running
input.pads.onLost = () => {
  if (game.state === 'play' && !game.ui.busy) { game.ui.paused = true; game.ui.pauseSel = 0; }
};

const STEP = 1 / 60;
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (window.__pause) return;
  input.poll();   // pad presses between steps are latched, not lost
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 5) { game.update(STEP); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  game.draw(ctx);
  present();
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- test helpers (console)
// sim(frames, held=[], pressed=[]): step the game by hand with actions held / tapped.
window.sim = (frames = 1, held = [], pressed = []) => {
  for (let i = 0; i < frames; i++) {
    held.forEach((a) => input.keys.add(a));
    if (i === 0) pressed.forEach((a) => input.queued.add(a));
    game.update(STEP);
  }
  held.forEach((a) => input.keys.delete(a));
  game.draw(ctx);
  present();
  const p = game.world && game.world.player;
  return p ? { x: Math.round(p.x), y: Math.round(p.y), state: p.state, hp: game.save.hp } : game.state;
};
// snap(name, scale=2): save the current frame to shots/<name>.png through tools/serve.py.
window.snap = async (name = 'shot', scale = 2) => {
  game.draw(ctx);
  const [c, g] = [document.createElement('canvas'), null];
  c.width = W * scale; c.height = H * scale;
  const cg = c.getContext('2d');
  cg.imageSmoothingEnabled = false;
  cg.drawImage(buffer, 0, 0, c.width, c.height);
  await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: c.toDataURL('image/png') });
  return name;
};
// go(level, spawn) or go(x, y) to teleport inside the current level.
window.go = (a, b) => {
  if (typeof a === 'string') { game.enter(a, b, false); game.world.fadeA = 0; game.world.fadeDir = 0; return; }
  const p = game.world.player;
  p.x = a; p.y = b; p.vx = 0; p.vy = 0;
  game.world.cam.snap(p.x, p.y, game.world.bounds, game.world.def.camFrame);
};
