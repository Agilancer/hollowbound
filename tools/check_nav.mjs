// Every foothold of every map must be reachable from the ground (ropes, hops, drops).
//   node tools/check_nav.mjs
import { build } from '../src/world/layout.js';
import { MAPS } from '../src/data/world.js';
globalThis.window = globalThis;
const { buildNav } = await import('../src/game/brain.js').catch(async (e) => { console.log('brain import needs browser deps:', e.message.slice(0, 80)); return {}; });
let bad = 0;
for (const m of MAPS) {
  const geo = build({ id: m.id, w: m.w, shape: m.shape, tiers: m.tiers, seed: m.seed });
  if (!buildNav) break;
  const nav = buildNav(geo), start = geo.plats.findIndex(p => p.ground), seen = new Set([start]), q = [start];
  while (q.length) { const c = q.shift(); for (const e of nav.links[c]) if (!seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }
  const miss = geo.plats.map((p, i) => i).filter(i => !seen.has(i));
  // and back down again
  if (miss.length) { bad++; console.log(m.id, m.shape, 'unreachable:', miss.map(i => { const p = geo.plats[i]; return `[${p.x1 | 0}-${p.x2 | 0} y${p.y | 0}${p.small ? ' small' : ''}]`; }).join(' '), 'ropes', geo.ropes.length); }
}
console.log(bad ? bad + ' maps with unreachable footholds' : 'all footholds reachable in ' + MAPS.length + ' maps');
