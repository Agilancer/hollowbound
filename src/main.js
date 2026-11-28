// VELSCOUR : HOLLOWBOUND — entry point.
import { G } from './state.js';
import { Renderer } from './gpu/renderer.js';
import { initInput } from './core/input.js';
import { audio } from './core/audio.js';
import { game } from './game/game.js';
import { initUI } from './ui/ui.js';

const canvas = document.getElementById('game');
async function boot() {
  const ui = initUI();
  try { G.rd = await Renderer.create(canvas); }
  catch (e) { ui.fatal('This game needs WebGPU', String(e.message || e) + ' Use a current Chrome, Edge or Safari (iOS/macOS 26+), or Firefox on Windows.'); return; }
  G.game = game; window.HOLLOWBOUND = { G, game };
  initInput(); audio.init();
  const fit = () => game.resize(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, G.settings.quality >= 1 ? 2 : 1.25));
  addEventListener('resize', fit); addEventListener('orientationchange', fit); fit();
  await game.boot();
  ui.ready();
  // dev: ?cls=paladin[&lvl=12][&map=wilds_1][&auto=1] starts straight into a test hero
  const q = new URLSearchParams(location.search); if (q.get('speed')) window.HB_SPEED = +q.get('speed');
  if (q.get('cls')) { await game.newGame({ name: q.get('name') || 'Tester', cls: q.get('cls') }); if (q.get('lvl')) { const c = G.char; c.lvl = +q.get('lvl'); c.sp = c.lvl - 1; const { kitFor } = await import('./game/items.js'); const { grantSkills, autoSpend } = await import('./game/actor.js'); c.equip = kitFor(c.cls, c.lvl, 1); grantSkills(c); autoSpend(c); c.gold = 9999; G.player.recompute(true); } if (q.get('map')) await game.travel(q.get('map'), null); if (q.get('auto')) game.toggleAuto(true); }
  let last = performance.now(), acc = 0;
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    // fixed 1/120 steps keep the foothold physics the same on a 60 Hz phone and a 144 Hz monitor
    acc += dt * (window.HB_SPEED || 1); let n = 0; while (acc >= 1 / 120 && n < 8 * (window.HB_SPEED || 1)) { game.update(1 / 120); acc -= 1 / 120; n++; } if (n >= 8 * (window.HB_SPEED || 1)) acc = 0;
    game.render(); ui.frame(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  addEventListener('beforeunload', () => game.save());
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
}
boot();
