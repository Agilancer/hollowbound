// A map at runtime: geometry from its descriptor, portals, spawn points, NPCs, and the
// rules of what lives there (fields respawn, dungeon rooms must be cleared, the Breach
// throws the whole bestiary at you).
import { G, emit, rnd, ri, pick, chance, clamp } from '../state.js';
import { MAPS, AREAS, DUNGEONS } from '../data/world.js';
import { NPCS } from '../data/npcs.js';
import { build, rng, hashStr } from './layout.js';
import { buildNav } from '../game/brain.js';
import { Actor, Mob } from '../game/actor.js';
import { mobDef, BEST, isEnemy } from '../game/bestiary.js';
import { mobSprite, npcSprite } from '../gfx/sprites.js';
import { buildScene } from '../gfx/scene.js';
import { dropTo, lowest } from '../game/body.js';
import { audio, MUSIC_FOR, AMB_FOR } from '../core/audio.js';

export const MAP_BY_ID = new Map(MAPS.map(m => [m.id, m]));
export const DUNGEON_BY_ID = new Map(DUNGEONS.map(d => [d.id, d]));
const PORTAL_COL = { down: [0.4, 0.95, 0.6], dungeon: [1, 0.55, 0.2], raid: [1, 0.25, 0.2], breach: [0.75, 0.35, 1], hall: [0.4, 1, 0.6], arena: [1, 0.4, 0.3] };

function portalPos(geo, at, tier, r) {
  const topTier = geo.plats.filter(p => !p.ground && !p.small).sort((a, b) => a.y - b.y)[0];
  let x, p;
  if (at === 'top' && topTier) { p = topTier; x = (p.x1 + p.x2) / 2; }
  else {
    x = at === 'left' ? 190 : at === 'right' ? geo.w - 190 : at === 'mid' || at === 'top' ? geo.w / 2 : clamp(+at || 0.5, 0.03, 0.97) * geo.w;
    if (tier) { const c = geo.plats.filter(q => !q.ground && !q.small && Math.round(q.tier) === tier).sort((a, b) => Math.abs((a.x1 + a.x2) / 2 - x) - Math.abs((b.x1 + b.x2) / 2 - x))[0]; if (c) { p = c; x = clamp(x, c.x1 + 70, c.x2 - 70); } }
    if (!p) p = geo.plats.filter(q => q.ground && x >= q.x1 && x <= q.x2)[0] || lowest(geo, x);
    x = clamp(x, p.x1 + 80, p.x2 - 80);
  }
  return { x, y: p.y, plat: p };
}

export async function loadMap(id, from, inst) {
  const def = MAP_BY_ID.get(id); if (!def) throw new Error('no map ' + id);
  const area = AREAS[def.area] || { name: def.name, theme: 'wilds', level: [1, 1] };
  G.rd.atlas.reset('map');
  const geo = build({ id: def.id, w: def.w, shape: def.shape, tiers: def.tiers, seed: def.seed });
  const M = { def, area, geo, nav: buildNav(geo), portals: [], spawns: [], npcSpots: [], npcs: [], instance: inst || null, kills: 0, t: 0, level: def.level || area.level?.[0] || 1, cleared: false };
  const r = rng(hashStr(def.id) + 17);
  for (const po of def.portals || []) {
    const pos = portalPos(geo, po.at, po.tier, r), tgt = po.to ? MAP_BY_ID.get(po.to) : null, dg = po.dungeon ? DUNGEON_BY_ID.get(po.dungeon) : null;
    const kind = dg ? (dg.kind === 'raid' ? 'raid' : 'dungeon') : po.style || (tgt && tgt.special === 'breach' ? 'breach' : tgt && tgt.kind === 'hall' ? 'hall' : tgt && tgt.kind === 'arena' ? 'arena' : null);
    if (def.kind === 'town' && pos.plat.ground) { const roof = geo.plats.find(q => !q.ground && !q.small && pos.x > q.x1 - 60 && pos.x < q.x2 + 60); if (roof) { const lx = roof.x1 - 150, rx = roof.x2 + 150; pos.x = Math.abs(pos.x - lx) < Math.abs(pos.x - rx) && lx > 220 ? lx : Math.min(geo.w - 220, rx); } }      // a town portal stands in the open street, not on a doorstep
    M.portals.push({ ...po, ...pos, label: po.label || (dg ? dg.name : tgt ? (tgt.area !== def.area && AREAS[tgt.area] ? AREAS[tgt.area].name : tgt.name) : '?'), color: PORTAL_COL[kind] || [0.45, 0.62, 1], kind, found: !po.hidden });
  }
  // NPCs
  for (const n of def.npcs || []) {
    const N = NPCS[n.id]; if (!N) continue;
    const pos = portalPos(geo, n.at, def.kind === 'town' ? 0 : n.tier, r); M.npcSpots.push(pos.x);
    const a = new Actor('npc', pos.x, pos.y); a.npcId = n.id; a.N = N; a.name = N.name; a.title = N.title || ''; a.body.plat = pos.plat; a.h = 112; a.w = 50;
    a.body.face = pos.x > geo.w / 2 ? -1 : 1; a.spec = N.sprite || {}; a.barkT = rnd(6, 40);
    M.npcs.push(a);
  }
  // spawn points: spread over the footholds by length, away from the doors
  const plats = geo.plats.filter(p => !p.small && (def.kind !== 'town'));
  const total = plats.reduce((s, p) => s + (p.x2 - p.x1), 0);
  const scale = inst ? (inst.raid ? 1.5 : 1.15) : 1;
  const place = (mobId, opts = {}) => {
    for (let tries = 0; tries < 12; tries++) {
      let t = r() * total, p = plats[0]; for (const q of plats) { t -= q.x2 - q.x1; if (t <= 0) { p = q; break; } }
      const x = p.x1 + 50 + r() * (p.x2 - p.x1 - 100);
      if (M.portals.some(po => Math.abs(po.x - x) < 330 && Math.abs(po.y - p.y) < 60) && tries < 10) continue;
      if (M.spawns.some(s => s.plat === p && Math.abs(s.x - x) < 70) && tries < 8) continue;
      const s = { mob: mobId, x, y: p.y, plat: p, alive: false, t: 0, respawn: inst ? Infinity : 0, ...opts }; M.spawns.push(s); return s;
    }
  };
  if (def.special === 'breach') { for (let i = 0; i < 24; i++) place(null, { breach: true }); M.breachPool = BEST.list.filter(d => isEnemy(d) && !d.boss && !d.slime); M.breachBosses = BEST.list.filter(d => isEnemy(d) && d.boss); }
  else for (const [mobId, n] of def.mobs || []) { if (!mobDef(mobId)) { console.warn('unknown mob', mobId, 'in', def.id); continue; } for (let i = 0; i < Math.round(n * scale); i++) place(mobId); }
  if (def.elite && mobDef(def.elite)) { const s = place(def.elite, { elite: true }); if (s) { s.respawn = 150; if (!inst && chance(0.55)) s.t = rnd(20, 90); } }
  if (def.boss && mobDef(def.boss.id)) { const g0 = geo.plats.filter(p => p.ground).sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1))[0]; M.spawns.push({ mob: def.boss.id, x: inst ? geo.w * 0.62 : (g0.x1 + g0.x2) / 2, y: g0.y, plat: g0, alive: false, t: 0, boss: true, name: def.boss.name, respawn: inst ? Infinity : def.boss.respawn || 300 }); }
  G.map = M;
  G.actors = G.actors.filter(a => a === G.player || (a.kind === 'hero' && a.inParty)); G.drops.length = 0; G.effects.length = 0; G.floaters.length = 0;
  for (const h of G.actors) { h.summons.length = 0; h.target = null; }
  for (const n of M.npcs) { n.sprite = npcSprite(n.spec, 'map'); if (!n.sprite && n.spec.mob && mobDef(n.spec.mob)) { const d = mobDef(n.spec.mob); n.sprite = mobSprite(d, 'map'); n.h = Math.min(150, d.hw); n.sprite = { ...n.sprite, k: n.h / d.h }; } if (!n.sprite) n.heroSpec = n.spec.hero || 'paladin'; G.actors.push(n); }
  await buildScene(M);
  // where the player comes in
  let entry = M.portals.find(p => from && (p.to === from || p.dungeon === from)) || (def.kind === 'town' ? null : M.portals[0]);
  const P = G.player; const ex = entry ? entry.x : geo.w * 0.5, ey = entry ? entry.y : null;
  P.body.place(geo, ex, ey == null ? null : ey - 10); P.inv = 1.5; P.hurtInv = false;
  let i = 0; for (const h of G.actors) if (h.kind === 'hero' && h !== P) { h.body.place(geo, ex - 40 - 30 * i++, ey == null ? null : ey - 10); h.spawnT = 0.3; }
  for (const s of M.spawns) if (!s.t && (s.boss || s.elite || inst || chance(0.8))) spawnAt(M, s);
  const mk = inst ? (inst.raid ? 'raid' : def.kind === 'arena' || def.shape === 'arena' ? 'boss' : 'dungeon') : def.area in MUSIC_FOR ? def.area : def.kind === 'town' ? 'town' : def.kind === 'hall' ? 'hall' : def.kind === 'arena' ? 'arena' : 'wilds';
  audio.music(MUSIC_FOR[mk] || MUSIC_FOR.wilds); audio.ambience(AMB_FOR[mk] || null);
  emit('mapChanged', { id });
  return M;
}

export function spawnAt(M, s) {
  let def = s.mob ? mobDef(s.mob) : null, lvl = M.level, opts = { spawn: s, elite: !!s.elite, boss: !!s.boss, name: s.name };
  if (s.breach) { def = pick(M.breachPool); lvl = Math.max(1, G.player.lvl + ri(-1, 1)); if (chance(0.06)) opts.elite = true; }
  if (!def) return null;
  if (M.instance) { opts.dungeon = !M.instance.raid; opts.raid = !!M.instance.raid; opts.hpMul = s.boss ? 1 : (M.instance.raid ? 13 : 5); lvl = M.instance.level || lvl; }
  opts.lvl = lvl + (opts.elite ? 1 : 0) + (opts.boss && !M.instance ? 2 : 0);
  const m = new Mob(def, s.x + rnd(-20, 20), s.y, opts);
  m.sprite = mobSprite(def, 'map'); m.body.plat = s.plat; m.body.y = s.y; if (m.body.fly) { m.body.plat = null; m.body.y = s.y - rnd(90, 170); }
  m.body.face = chance(0.5) ? 1 : -1; if (opts.elite) m.aura = [0.9, 0.6, 0.1]; if (opts.boss) m.aura = [0.8, 0.12, 0.1];
  s.alive = true; s.actor = m; G.actors.push(m);
  if (opts.boss && M.t > 2) emit('bossSpawn', { name: m.name });
  return m;
}
/** Extra monsters a boss calls to its side. */
export function bossAdds(M, boss, n) {
  const kinds = (M.def.mobs || []).map(x => x[0]).filter(id => mobDef(id)); const alive = G.actors.filter(a => a.kind === 'mob' && !a.dead && a.add).length;
  for (let i = 0; i < n && alive + i < 8; i++) { const def = kinds.length ? mobDef(pick(kinds)) : pick(BEST.groups.set1); const x = clamp(boss.x + rnd(-300, 300), 80, M.geo.w - 80), p = dropTo(M.geo, x, boss.y - 30) || boss.body.plat; if (!p) continue; const m = new Mob(def, x, p.y, { lvl: boss.lvl - 2, hpMul: M.instance ? (M.instance.raid ? 3 : 1.6) : 1 }); m.sprite = mobSprite(def, 'map'); m.body.plat = p; m.add = true; m.aggro = boss.aggro; m.aggroT = 30; G.actors.push(m); }
}
export function tickMap(M, dt) {
  M.t += dt;
  M.spT = (M.spT || 0) - dt; if (M.spT > 0) return; M.spT = 1;
  let alive = 0;
  for (const s of M.spawns) {
    if (s.alive) { alive++; if (s.actor && s.actor.remove) s.alive = false; continue; }
    if (s.respawn === Infinity) continue;
    if (s.t > 0) { s.t -= 1; if (s.respawn && s.t <= 0) s.t = 0; continue; }
    // do not pop into being right on top of the player
    if (Math.abs(s.x - G.player.x) < 170 && Math.abs(s.y - G.player.y) < 120) continue;
    if (s.justDied) { s.justDied = false; s.t = s.respawn || rnd(6, 11); continue; }
    spawnAt(M, s);
  }
  if (M.instance && !M.cleared && M.t > 1.5 && !G.actors.some(a => a.kind === 'mob' && !a.dead)) { M.cleared = true; emit('roomCleared', {}); }
}
