// Auto-play. With AUTO on, the director decides what the hero is doing (the next quest
// step, a level-appropriate hunting ground, a trip to the alchemist) and finds the way
// there across maps; the Bot (brain.js) does the walking and the fighting.
import { G, emit, pick, chance } from '../state.js';
import { MAPS, DUNGEONS } from '../data/world.js';
import { NPCS } from '../data/npcs.js';
import { QUESTS } from '../data/quests.js';
import * as Q from './quests.js';
import { MAP_BY_ID } from '../world/map.js';

const npcMap = new Map(), mobMaps = new Map(), adj = new Map();
for (const m of MAPS) {
  for (const n of m.npcs || []) npcMap.set(n.id, m.id);
  if (!m.dungeon) for (const [id] of m.mobs || []) { if (!mobMaps.has(id)) mobMaps.set(id, []); mobMaps.get(id).push(m.id); }
  if (m.boss && !m.dungeon) { if (!mobMaps.has(m.boss.id)) mobMaps.set(m.boss.id, []); mobMaps.get(m.boss.id).push(m.id); }
  if (m.elite && !m.dungeon) { if (!mobMaps.has(m.elite)) mobMaps.set(m.elite, []); mobMaps.get(m.elite).push(m.id); }
  if (!m.dungeon) adj.set(m.id, (m.portals || []).filter(p => p.to && !MAP_BY_ID.get(p.to)?.dungeon).map(p => p.to));
}
function route(from, ok) {            // BFS over portals; returns [path of map ids] to the nearest map where ok(id)
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) { const c = q.shift(); if (ok(c)) { const path = []; for (let x = c; x; x = prev.get(x)) path.unshift(x); return path; } for (const n of adj.get(c) || []) { if (prev.has(n)) continue; const d = MAP_BY_ID.get(n); if (d.kind === 'hall' && !G.char.guild) continue; prev.set(n, c); q.push(n); } }
  return null;
}
export class Director {
  constructor(h) { this.h = h; this.t = 0; this.key = ''; this.idle = 0; }
  set(key, goal) { if (this.key === key) return; this.key = key; this.h.bot.goal = goal; this.h.bot.roamTo = null; }
  /** Walk to the portal that leads toward `path[1]`, and take it. */
  hop(path) {
    const M = G.map, next = path[1], po = M.portals.find(p => p.to === next); if (!po) return this.grind();
    this.set('hop:' + next, { type: 'goto', x: po.x, plat: po.plat, tol: 30, then: () => { this.key = ''; G.game.usePortal(po); } });
  }
  grind(filter, key = 'grind') { this.set(key + G.map.def.id, { type: 'grind', filter, range: 6000 }); }
  toMap(ok) { const path = route(G.map.def.id, ok); if (!path) return false; if (path.length > 1) { this.hop(path); return true; } return false; }
  bestGround() {
    const L = this.h.lvl; let best = null;
    for (const m of MAPS) { if (m.kind !== 'field' || m.special || m.hidden || !m.level || m.level > L + 1) continue; if (!best || m.level > best.level) best = m; }
    return best ? best.id : 'wilds_1';
  }
  npc(id, then) {
    const mid = npcMap.get(id); if (!mid) return this.hunt();
    if (G.map.def.id !== mid) { if (!this.toMap(m => m === mid)) this.hunt(); return; }
    const a = G.map.npcs.find(n => n.npcId === id); if (!a) return this.hunt();
    this.set('npc:' + id + (then ? ':t' : ''), { type: 'goto', x: a.x + (this.h.x < a.x ? -50 : 50), plat: a.body.plat, tol: 30, then: () => { this.key = ''; then(a); } });
  }
  hunt() { const id = this.bestGround(); if (G.map.def.id !== id && !G.map.instance) { if (this.toMap(m => m === id)) return; } this.grind(); }
  tick(dt) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const P = this.h, c = G.char, M = G.map; if (P.dead || G.loading) return;
    // inside a dungeon: clear the room, then on through the far door
    if (M.instance) {
      const inst = M.instance, i = inst.rooms.indexOf(M.def.id);
      if (!M.cleared) return this.grind(null, 'inst');
      const next = inst.rooms[i + 1], po = next ? M.portals.find(p => p.to === next) : null;
      if (po) return this.set('door' + next, { type: 'goto', x: po.x, plat: po.plat, tol: 30, then: () => { this.key = ''; G.game.usePortal(po); } });
      if (G.drops.length && (this.idle += 0.5) < 8) return;
      this.idle = 0; this.key = ''; G.game.leaveDungeon(); return;
    }
    if (M.def.kind === 'town') { if (c.bag.length > c.bagMax - 8) G.game.sellJunk(true); }
    // potions
    if (c.potions.hp < 4 && c.gold >= 150) return this.npc('wren', () => { const s = G.game.shopStock('shop:potions', 'wren'); const hp = s.find(x => x.pot === 'hp'), mp = s.find(x => x.pot === 'mp'); const n = Math.max(1, Math.min(15, Math.floor(c.gold * 0.5 / hp.price))); G.game.buy(hp, n); if (P.cls !== 'barbarian' && c.potions.mp < 6) G.game.buy(mp, Math.max(1, Math.min(8, Math.floor(c.gold * 0.3 / mp.price)))); G.game.sellJunk(true); });
    // quests ready to hand in, then quests in progress, then new ones
    const act = Q.activeList().sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0));
    const done = act.find(q => Q.complete(q)); if (done) return this.npc(done.turnin || done.giver, (a) => { a.speak(pick(done.done || ['Well done.']), 'npc', 5); a.sayDur = 5; G.game.turnInQuest(done.id); });
    for (const q of act) {
      const o = Q.objective(q); if (!o) continue;
      if (o.npc) return this.npc(o.npc, (a) => { a.speak(pick(q.progress || ['...']), 'npc', 4); a.sayDur = 4; Q.onTalk(o.npc); });
      if (o.map) { const tl = MAP_BY_ID.get(o.map)?.level || 1; if (tl > P.lvl + 4) continue; if (this.toMap(m => m === o.map)) return; continue; }
      if (o.mob) { const maps = mobMaps.get(o.mob) || []; if (!maps.length) continue; const lv = MAP_BY_ID.get(maps[0]).level || 1; if (lv > P.lvl + 3) continue; if (!maps.includes(M.def.id)) { if (this.toMap(m => maps.includes(m))) return; continue; } return this.grind(a => a.def && a.def.id === o.mob, 'q' + o.mob); }
      if (o.area) { if (M.def.area !== o.area || M.def.kind !== 'field') { const L = P.lvl; if (this.toMap(m => { const d = MAP_BY_ID.get(m); return d.area === o.area && d.kind === 'field' && !d.special && (d.level || 1) <= L + 2; }) ) return; if (o.area === 'breach' && this.toMap(m => m === 'breach')) return; continue; } return this.grind(); }
      if (o.dungeon) { const D = DUNGEONS.find(d => d.id === o.dungeon); if (!D || D.level > P.lvl + 2) continue; if (M.def.id !== D.entrance) { if (this.toMap(m => m === D.entrance)) return; continue; } const po = M.portals.find(p => p.dungeon === D.id); if (!po) continue; return this.set('dg' + D.id, { type: 'goto', x: po.x, plat: po.plat, tol: 30, then: () => { this.key = ''; G.game.enterDungeon(D.id); } }); }
    }
    const offers = QUESTS.filter(q => Q.canOffer(q) && npcMap.has(q.giver) && (q.level || 1) <= P.lvl + 1).sort((a, b) => (b.main ? 1 : 0) - (a.main ? 1 : 0) || (a.level || 1) - (b.level || 1));
    const off = offers.find(q => q.main) || (act.length < 4 ? offers[0] : null);
    if (off && (act.length < 5)) return this.npc(off.giver, (a) => { a.speak(pick(off.offer || ['I have work for you.']), 'npc', 5); a.sayDur = 5; G.game.acceptQuest(off.id); });
    this.hunt();
  }
}
