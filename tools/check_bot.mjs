// Drives the hero Bot over every map with the real physics: from the ground to every
// foothold and back again. Any route it cannot finish is printed.
//   node tools/check_bot.mjs [mapId]
import { build } from '../src/world/layout.js';
import { MAPS } from '../src/data/world.js';
globalThis.window = globalThis;
const { G } = await import('../src/state.js');
const { Body } = await import('../src/game/body.js');
const { buildNav, Bot } = await import('../src/game/brain.js');
const only = process.argv[2]; let fails = 0, routes = 0, worst = 0;
for (const m of MAPS) {
  if (only && m.id !== only) continue;
  const geo = build({ id: m.id, w: m.w, shape: m.shape, tiers: m.tiers, seed: m.seed }), nav = buildNav(geo);
  G.map = { geo, nav, def: m }; G.actors = []; G.dt = 1 / 120;
  const ground = geo.plats.filter(p => p.ground).sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1))[0];
  const run = (from, fx, to, tx) => {
    const body = new Body(fx, from.y); body.plat = from;
    const h = { body, get x() { return body.x; }, get y() { return body.y; }, get face() { return body.face; }, status: {}, useT: 0 };
    const bot = new Bot(h);
    for (let i = 0; i < 120 * 90; i++) {
      bot.move = 0; bot.want = {};
      if (bot.go(tx, to, 30) && body.plat === to) return i / 120;
      if (body.rope && !bot.want.up && !bot.want.down) { bot.want.jump = true; if (!bot.move) bot.move = body.face; }
      if (bot.move) bot.lastMove = bot.move;
      body.step(geo, 1 / 120, bot.move, bot.want);
    }
    return -1;
  };
  for (const p of geo.plats) {
    if (p === ground) continue;
    const tx = (p.x1 + p.x2) / 2, gx = (ground.x1 + ground.x2) / 2;
    for (const [a, ax, b, bx, dir] of [[ground, gx, p, tx, 'up'], [p, tx, ground, gx, 'down']]) {
      routes++; const t = run(a, ax, b, bx);
      if (t < 0) { fails++; if (fails <= 25) console.log(`FAIL ${m.id} ${dir} [${p.x1 | 0}-${p.x2 | 0} y${p.y | 0}${p.small ? ' small' : ''}${p.ground ? ' ground' : ''}]`); } else worst = Math.max(worst, t);
    }
  }
}
console.log(`${routes} routes, ${fails} failed, slowest ${worst.toFixed(1)}s`);
process.exit(fails ? 1 : 0);
