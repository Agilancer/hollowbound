// Quests: offered by NPCs with a lamp over their heads, tracked step by step, turned in
// for experience, gold and gear. Steps: kill, collect, talk, visit, boss, dungeon, level, deliver.
import { G, emit, chance } from '../state.js';
import { QUESTS } from '../data/quests.js';
import { NPCS } from '../data/npcs.js';
import { makeGear } from './items.js';
import { gainXp, floater } from './combat.js';
import { mobDef } from './bestiary.js';
import { audio } from '../core/audio.js';
import { MAP_BY_ID } from '../world/map.js';

export const QUEST_BY_ID = new Map(QUESTS.map(q => [q.id, q]));
const st = () => G.char.quests;
export const isDone = (id) => !!st().done[id];
export const isActive = (id) => !!st().active[id];
export const stepOf = (q) => q.steps[st().active[q.id]?.step ?? 0];
export const complete = (q) => isActive(q.id) && st().active[q.id].step >= q.steps.length;
export const canOffer = (q) => !isDone(q.id) && !isActive(q.id) && G.char.lvl >= (q.level || 1) - 1 && (!q.after || isDone(q.after));
export const offersOf = (npc) => QUESTS.filter(q => q.giver === npc && canOffer(q));
export const turninsOf = (npc) => QUESTS.filter(q => complete(q) && (q.turnin || q.giver) === npc);
export const activeList = () => QUESTS.filter(q => isActive(q.id));
export function accept(q) {
  st().active[q.id] = { step: 0, n: 0 }; audio.sfx('quest_accept'); emit('quest', { q, what: 'accept' }); emit('toast', { text: 'Quest accepted: ' + q.name, kind: 'quest' });
  check(q); refreshMarks();
}
export function turnIn(q) {
  const c = G.char, r = q.reward || {};
  delete st().active[q.id]; st().done[q.id] = true;
  for (const s of q.steps) if (s.t === 'collect' && c.etc[s.item]) { c.etc[s.item] = Math.max(0, c.etc[s.item] - s.n); if (!c.etc[s.item]) delete c.etc[s.item]; }
  if (r.gold) c.gold += r.gold;
  if (r.item === 'potions') { c.potions.hp += 5; c.potions.mp += 3; }
  else if (r.item && typeof r.item === 'object') { const it = makeGear({ slot: r.item.slot, rarity: r.item.rarity ?? 1, ilvl: Math.max(1, q.level || c.lvl), cls: c.cls }); c.bag.push(it); emit('gotItem', { item: it }); G.game.autoEquip(it); }
  if (r.skillPoint) c.sp = (c.sp || 0) + r.skillPoint;
  audio.sfx('quest_done'); emit('quest', { q, what: 'done' }); emit('toast', { text: 'Quest complete: ' + q.name, kind: 'quest' });
  G.floaters.push({ x: G.player.x, y: G.player.y - 170, word: 'QUEST COMPLETE', color: '#ffd24a', t: 0, scale: 1.3, slow: true });
  if (r.xp) gainXp(G.player, r.xp);
  emit('bag'); refreshMarks();
}
function advance(q) {
  const a = st().active[q.id]; a.step++; a.n = 0;
  if (a.step >= q.steps.length) { emit('toast', { text: q.name + ': return to ' + (NPCS[q.turnin || q.giver]?.name || 'the quest giver'), kind: 'quest' }); audio.sfx('quest_accept'); }
  else check(q);
  emit('quest', { q, what: 'step' }); refreshMarks();
}
/** Steps that can already be satisfied when they come up (level reached, items in the bag, standing in the place). */
function check(q) {
  const a = st().active[q.id]; if (!a || a.step >= q.steps.length) return;
  const s = q.steps[a.step];
  if (s.t === 'level' && G.char.lvl >= s.n) advance(q);
  else if (s.t === 'collect') { a.n = Math.min(s.n, G.char.etc[s.item] || 0); if (a.n >= s.n) advance(q); }
  else if (s.t === 'visit' && G.map && G.map.def.id === s.map) advance(q);
}
const matches = (s, m) => { const id = m.def.id, t = s.mob; if (typeof t === 'string') return t === id; const area = (t && t.area) || s.area; if (area) return G.map.def.area === area; return !!((t && t.any) || s.any); };
export function onKill(m) {
  for (const q of activeList()) { const s = stepOf(q); if (!s) continue; const a = st().active[q.id];
    if ((s.t === 'kill' && matches(s, m)) || (s.t === 'boss' && (s.mob === m.def.id))) { a.n++; if (a.n >= (s.n || 1)) advance(q); else emit('quest', { q, what: 'progress' }); } }
}
export function questDrops(m) {
  const out = [];
  for (const q of activeList()) { const s = stepOf(q); if (!s || s.t !== 'collect') continue; const f = s.from; const ok = typeof f === 'string' ? f === m.def.id : f && f.area ? G.map.def.area === f.area : true; if (!ok) continue;
    const pending = G.drops.filter(d => d.kind === 'etc' && d.name === s.item).length; if ((G.char.etc[s.item] || 0) + pending >= s.n) continue; if (chance(s.chance || 0.45)) out.push({ item: s.item, quest: q.id }); }
  return out;
}
export function onCollect() { for (const q of activeList()) check(q); }
export function onMap() { for (const q of activeList()) check(q); refreshMarks(); }
export function onLevel() { for (const q of activeList()) check(q); refreshMarks(); }
export function onDungeon(id) { for (const q of activeList()) { const s = stepOf(q); if (s && s.t === 'dungeon' && s.id === id) advance(q); } }
/** Talking to an NPC may finish talk/deliver steps. Returns the quests it advanced. */
export function onTalk(npc) { const out = []; for (const q of activeList()) { const s = stepOf(q); if (s && (s.t === 'talk' || s.t === 'deliver') && s.npc === npc) { advance(q); out.push(q); } } return out; }
export function refreshMarks() {
  if (!G.map) return;
  for (const n of G.map.npcs) {
    const id = n.npcId;
    n.mark = turninsOf(id).length ? 'done' : offersOf(id).length ? 'bulb' : activeList().some(q => { const s = stepOf(q); return s && (s.t === 'talk' || s.t === 'deliver') && s.npc === id; }) ? 'done' : activeList().some(q => q.giver === id) ? 'book' : null;
  }
}
export function stepText(q) {
  const a = st().active[q.id]; if (!a) return '';
  if (a.step >= q.steps.length) return 'Return to ' + (NPCS[q.turnin || q.giver]?.name || '?');
  const s = q.steps[a.step], nm = (id) => mobDef(id)?.name || id;
  switch (s.t) {
    case 'kill': return `Slay ${typeof s.mob === 'string' ? nm(s.mob) : 'monsters'} ${a.n}/${s.n}`;
    case 'boss': return 'Slay ' + nm(s.mob);
    case 'collect': return `${s.item} ${Math.min(s.n, G.char.etc[s.item] || 0)}/${s.n}`;
    case 'talk': return 'Speak with ' + (NPCS[s.npc]?.name || s.npc);
    case 'deliver': return `Bring ${s.item || 'it'} to ${NPCS[s.npc]?.name || s.npc}`;
    case 'visit': return 'Go to ' + (MAP_BY_ID.get(s.map)?.name || s.map);
    case 'dungeon': return 'Clear the dungeon';
    case 'level': return 'Reach level ' + s.n;
  } return '';
}
/** Where should auto-play go for this quest? { map, npc?, mob?, portalDungeon? } */
export function objective(q) {
  const a = st().active[q.id]; if (!a) return null;
  if (a.step >= q.steps.length) return { npc: q.turnin || q.giver };
  const s = q.steps[a.step];
  if (s.t === 'talk' || s.t === 'deliver') return { npc: s.npc };
  if (s.t === 'visit') return { map: s.map };
  if (s.t === 'kill' || s.t === 'boss') return typeof s.mob === 'string' ? { mob: s.mob } : { area: (s.mob && s.mob.area) || s.area || q.area };
  if (s.t === 'collect') return typeof s.from === 'string' ? { mob: s.from } : { area: (s.from && s.from.area) || q.area };
  if (s.t === 'dungeon') return { dungeon: s.id };
  if (s.t === 'level') return { grind: true };
  return null;
}
