// The simulated MMO: a standing roster of fake players with names, classes, guilds and
// tempers, who populate the maps, grind, loiter, trade-spam, chat in bubbles, hold little
// conversations, shout across the world, react to what you do, join your party or guild.
import { G, emit, rnd, ri, pick, chance, clamp } from '../state.js';
import { CLASS_IDS, className } from '../data/game.js';
import { SOLO } from '../data/chatter_solo.js';
import { CONVOS, PARTY, GUILD } from '../data/chatter_convo.js';
import { BARKS, CHATS } from '../data/velscour/townscripts.js';
import { NPCS } from '../data/npcs.js';
import { MAPS, AREAS, DUNGEONS } from '../data/world.js';
import { Hero, autoSpend } from './actor.js';
import { Bot } from './brain.js';
import { kitFor } from './items.js';

export const GUILDS = [
  ['Ashen Vow', '#d8b46a'], ['The Ninth Bell', '#9fd0a0'], ['Gravewake', '#b9a8d8'], ['Hollow Crown', '#e8c860'], ['Carrion Court', '#c86a6a'], ['Lampwardens', '#7ae0a0'], ['Black Tide', '#6a8ad0'],
  ['Mourning Veil', '#d0a0c8'], ['Thornwall Irregulars', '#a8c070'], ['The Unburied', '#b0b0a0'], ['Seventh Seal', '#ff8a5a'], ['Bonepickers Union', '#e0d8b8'], ['Cinder Saints', '#ffa040'], ['Quiet Watch', '#8ab8c8'],
  ['Pennyless', '#c8c8c8'], ['Rookery Rats', '#a89070'], ['Oathrot', '#90c060'], ['Vigil of Embers', '#ffb070'], ['Widowmakers', '#e06080'], ['Last Lantern', '#f0e090'], ['Dusk Lancers', '#a090e0'], ['Marrow & Sons', '#e8e0c0'],
  ['Sworn of Nothing', '#9a9aa8'], ['Wyrmtax Collectors', '#70c8b0'],
].map(([name, color], i) => ({ name, color, id: i }));
GUILDS.forEach((g, i) => { g.rival = GUILDS[(i * 7 + 5) % GUILDS.length].name; });
const NA = ['Grave', 'Ash', 'Bone', 'Hollow', 'Mourn', 'Cinder', 'Thorn', 'Dusk', 'Rot', 'Vigil', 'Marrow', 'Gallow', 'Wyrm', 'Raven', 'Crow', 'Sorrow', 'Blight', 'Ember', 'Pale', 'Grim', 'Dread', 'Rust', 'Moth', 'Wick', 'Bell', 'Nettle', 'Shiv', 'Loot', 'Stab', 'Doom'];
const NB = ['maw', 'widow', 'grinder', 'thane', 'wright', 'picker', 'caller', 'sworn', 'bane', 'fang', 'shade', 'mantle', 'lord', 'lass', 'wick', 'born', 'heart', 'hand', 'eater', 'monger', 'smith', 'walker', 'singer', 'biter', 'hoarder'];
const NC = ['Thessaly', 'Aldric', 'Mirelle', 'Osric', 'Ysolde', 'Bram', 'Corvin', 'Elspeth', 'Fenwick', 'Greta', 'Hobb', 'Isolde', 'Jory', 'Kestrel', 'Lucan', 'Maeve', 'Ned', 'Odo', 'Perrin', 'Quill', 'Rosette', 'Silas', 'Tamsin', 'Ulf', 'Varric', 'Wynn', 'Yorick', 'Zeb', 'Cassius', 'Halvard', 'Brina', 'Dain', 'Ottilie', 'Roderick', 'Anselm', 'Marta', 'Finn', 'Hilda', 'Tomas', 'Ilse'];
const FUN = ['SirLootsalot', 'NoHealsForYou', 'xXAshenXx', 'potionpls', 'OneMoreCrypt', 'AFKatWell', 'DefinitelyNotABot', 'GrandmaWren', 'TwoHandedTom', 'stabsworth', 'BigRedCritz', 'healerLFhusband', 'Wolfpelt9', 'lowrolls', 'Velscourslayer3', 'SoupOfBones', 'mrTeeth', 'KnightOfNaps', 'pls_no_ks', 'TankyMcShield', 'iPullEverything', 'Sevenseals', 'crowmother', 'ratking', 'OldManHollow', 'justbrowsing', 'BardWasTaken', 'SlimeDaddy', 'ElderGoblin', 'notTobin'];
function nameFor(i, r) { const t = r(); if (t < 0.22 && FUN.length) return FUN.splice(Math.floor(r() * FUN.length), 1)[0]; if (t < 0.5) return pick(NC) + (r() < 0.35 ? pick(['', 'x', 'z', '_', 'y']) + (r() < 0.4 ? ri(2, 99) : '') : ''); const n = pick(NA) + pick(NB); return r() < 0.3 ? n.toLowerCase() + (r() < 0.5 ? ri(1, 99) : '') : r() < 0.15 ? 'x' + n + 'x' : n; }
const STYLE = ['grinder', 'grinder', 'grinder', 'social', 'trader', 'lfg', 'grinder', 'social'];
const fieldMaps = () => MAPS.filter(m => m.kind === 'field' && !m.special && m.level);
const townMaps = () => MAPS.filter(m => m.kind === 'town');

export function makeRoster(seed = 7) {
  let s = seed; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const used = new Set(), list = [], fm = fieldMaps(), tm = townMaps();
  for (let i = 0; i < 170; i++) {
    let name; do { name = nameFor(i, r); } while (used.has(name.toLowerCase()) || name.length > 16); used.add(name.toLowerCase());
    const lvl = clamp(Math.round(1 + Math.pow(r(), 1.5) * 34), 1, 40), g = r() < 0.72 ? GUILDS[Math.floor(r() * GUILDS.length)] : null;
    const f = { id: i, name, cls: CLASS_IDS[Math.floor(r() * CLASS_IDS.length)], lvl, guild: g ? g.name : '', bad: r() < 0.24, style: STYLE[Math.floor(r() * STYLE.length)], friend: 0, map: null, xpT: 0, seed: Math.floor(r() * 1e9) };
    assign(f, fm, tm, r); list.push(f);
  }
  return list;
}
function assign(f, fm, tm, r = Math.random) {
  if (f.style === 'trader' || f.style === 'social' || r() < 0.3) { f.map = tm[Math.floor(r() * tm.length)].id; return; }
  const ok = fm.filter(m => Math.abs(m.level - f.lvl) <= 3); const m = ok.length ? ok[Math.floor(r() * ok.length)] : fm[Math.floor(r() * fm.length)];
  f.map = m.id;
}
export const guildOf = (name) => GUILDS.find(g => g.name === name);

/** Make the live hero for a roster entry. */
export function spawnFake(f, x, y, lvl) {
  if (!f.data || (lvl && f.data.lvl !== lvl) || f.data.lvl !== (lvl || f.lvl)) { const L = lvl || f.lvl; f.data = { name: f.name, cls: f.cls, lvl: L, equip: kitFor(f.cls, L, f.bad ? 0 : chance(0.2) ? 1 : 0), ranks: {}, bar: [], guild: f.guild, sp: Math.max(0, L - 1) }; const h0 = new Hero(f.data, 0, 0); autoSpend(f.data); }
  const h = new Hero(f.data, x, y); h.fake = f; h.guild = f.guild; h.guildColor = guildOf(f.guild)?.color; h.brain = new Bot(h); h.chatT = rnd(3, 30); h.spawnT = 0.3;
  h.body.place(G.map.geo, x, y); f.live = h;
  return h;
}
/** Fill a map with the players who are "there". */
export function populate(M) {
  const def = M.def, P = G.player; if (M.instance || def.kind === 'dungeon' || def.kind === 'raid') return;
  const here = G.roster.filter(f => f.map === def.id && !f.inParty && !f.companion);
  const want = def.kind === 'town' ? 16 : def.kind === 'hall' ? 0 : def.kind === 'arena' ? 6 : def.special === 'breach' ? 4 : 5;
  // people drift: top the map up from elsewhere, send the surplus away
  while (here.length < want) { const pool = G.roster.filter(f => f.map !== def.id && !f.inParty && !f.companion && (def.kind === 'town' || Math.abs(f.lvl - (def.level || P.lvl)) <= 5)); if (!pool.length) break; const f = pick(pool); f.map = def.id; here.push(f); }
  here.length = Math.min(here.length, want + 3);
  for (const f of here) {
    if (f.live && G.actors.includes(f.live)) continue;
    const p = pick(M.geo.plats.filter(q => !q.small)), x = rnd(p.x1 + 80, p.x2 - 80);
    const h = spawnFake(f, x, p.y - 10);
    h.brain.goal = def.kind === 'town' || def.kind === 'arena' ? { type: 'town' } : { type: 'grind', range: 1500 };
    G.actors.push(h);
  }
}

// ------------------------------------------------------------------ talk
const areaKey = () => (G.map.def.area in SOLO.per_area ? G.map.def.area : null);
function fill(text, h, extra = {}) {
  const M = G.map, mobs = (M.def.mobs || []).map(m => m[0]), f = h && h.fake;
  const mobName = () => { const a = G.actors.find(o => o.kind === 'mob' && !o.dead); return a ? a.name : 'ghoul'; };
  return text.replace(/\{(\w+)\}/g, (_, k) => {
    switch (k) {
      case 'me': return h ? h.name : ''; case 'you': return G.player.name; case 'cls': return className(h ? h.cls : G.player.cls);
      case 'map': return M.def.name; case 'mob': return mobName(); case 'item': return pick(['Ashen Greaves', 'Vigil Casque', 'Gallows Falchion', 'Mourning Signet', 'Bell-Warden\'s Plate', 'Wyrm-Etched Bow', 'Reliquary Orb', 'Thornwall Aegis', 'Pallid Hood', 'Cinder Rod']);
      case 'gold': return String(pick([40, 120, 250, 500, 800, 1200, 2500, 4000, 9000])); case 'guild': return (f && f.guild) || 'my guild'; case 'rival': return guildOf(f && f.guild)?.rival || pick(GUILDS).name;
      case 'lvl': return String(h ? h.lvl : 1); case 'npc': return pick(Object.values(NPCS)).name; case 'boss': return extra.boss || 'the boss'; case 'dungeon': return extra.dungeon || pick(DUNGEONS).name;
      case 'a': case 'b': case 'c': case 'd': return extra.names ? extra.names['abcd'.indexOf(k)] || 'you' : 'friend';
    } return '';
  });
}
export function say(h, text, kind = 'say', chan = 'say') {
  h.speak(text, kind, clamp(2.4 + text.length * 0.055, 3, 7)); h.sayDur = h.sayT;
  if (Math.abs(h.x - G.player.x) < 1300) emit('chat', { chan, from: h.name, text, guild: h.guild });
}
function soloLine(h) {
  const M = G.map.def, f = h.fake, town = M.kind === 'town' || M.kind === 'arena';
  const r = Math.random(); let cat;
  if (town) cat = f.style === 'trader' && r < 0.6 ? 'trade' : r < 0.3 ? 'town_idle' : r < 0.42 ? 'trade' : r < 0.52 ? 'lore' : r < 0.62 ? (f.bad ? 'rude' : 'kind') : r < 0.72 ? 'lfg' : r < 0.8 ? 'afk' : r < 0.9 && f.guild ? 'rival' : 'town_idle';
  else cat = h.hp < h.maxHp * 0.3 ? 'low_hp' : r < 0.45 ? 'grind' : r < 0.6 && areaKey() ? 'area' : r < 0.7 ? (f.bad ? 'rude' : 'kind') : r < 0.78 ? 'ks' : r < 0.86 ? 'lfg' : r < 0.93 ? 'lore' : 'grind';
  if (r > 0.94) { const pc = SOLO.per_class[h.cls]; if (pc) return pick(pc); }
  const pool = cat === 'area' ? SOLO.per_area[areaKey()] : SOLO[cat]; return pick(pool || SOLO.grind);
}
let convo = null, shoutT = 14, gossipT = 20, guildT = 30, partyT = 6;
export function tickSocial(dt) {
  const M = G.map, P = G.player; if (!M) return;
  const fakes = G.actors.filter(a => a.kind === 'hero' && a.fake && !a.dead);
  // a running conversation plays line by line
  if (convo) { convo.t -= dt; if (convo.t <= 0) { const l = convo.lines[convo.i++]; if (!l) convo = null; else { const sp = convo.cast[l[0]]; if (sp && !sp.dead && G.actors.includes(sp)) { say(sp, fill(l[1], sp, { names: convo.names }), convo.kind); const o = convo.cast[(l[0] + 1) % convo.cast.length]; if (o) sp.body.face = o.x >= sp.x ? 1 : -1; } convo.t = 2.2 + l[1].length * 0.04; } } }
  for (const h of fakes) {
    if (h.inParty || h.team === 2) continue;
    h.chatT -= dt;
    if (h.chatT <= 0) {
      h.chatT = rnd(14, 46) * (M.def.kind === 'town' ? 1 : 1.3);
      if (Math.abs(h.x - P.x) > 1200) continue;
      // near the player? sometimes speak to them
      if (Math.abs(h.x - P.x) < 240 && Math.abs(h.y - P.y) < 120 && chance(0.25)) { say(h, fill(pick(SOLO.greet_player), h)); continue; }
      // near another player? sometimes start a little scene
      if (!convo && chance(0.33)) { const others = fakes.filter(o => o !== h && !o.inParty && Math.abs(o.x - h.x) < 420 && Math.abs(o.y - h.y) < 80); if (others.length) { startConvo(h, others); continue; } }
      say(h, fill(soloLine(h), h));
    }
  }
  // NPCs mutter and gossip
  gossipT -= dt;
  if (gossipT <= 0) {
    gossipT = rnd(9, 22); const ns = M.npcs.filter(n => Math.abs(n.x - P.x) < 1100);
    if (ns.length) { const n = pick(ns);
      if (!convo && ns.length > 1 && chance(0.3)) { const o = ns.filter(q => q !== n).sort((a, b) => Math.abs(a.x - n.x) - Math.abs(b.x - n.x))[0]; const src = chance(0.6) ? pick(CONVOS.npc_gossip) : pick(CHATS); convo = { cast: [n, o], lines: src.lines.filter(l => l[0] < 2), i: 0, t: 0.5, kind: 'npc', names: [n.name, o.name] }; }
      else { const lines = n.N.idle && n.N.idle.length ? n.N.idle : BARKS.any.map(b => b[0]); n.speak(pick(lines), 'npc', 4.5); n.sayDur = 4.5; n.emote = pick(['happy', 'point', 'thinking', 'curious', 'proud', 'worried']); n.emoteT = 4; } }
  }
  // the town crier's horn: world shouts
  shoutT -= dt; if (shoutT <= 0) { shoutT = rnd(16, 40); const f = pick(G.roster); emit('chat', { chan: 'shout', from: f.name, guild: f.guild, text: fill(pick(SOLO.shout), { name: f.name, fake: f, cls: f.cls, lvl: f.lvl }) }); }
  if (G.char.guild) { guildT -= dt; if (guildT <= 0) { guildT = rnd(18, 50); const mates = G.roster.filter(f => f.guild === G.char.guild.name || f.companion); if (mates.length) { const f = pick(mates); emit('chat', { chan: 'guild', from: f.name, text: fill(pick(M.def.kind === 'hall' ? GUILD.hall : GUILD.chat), { name: f.name, fake: f, cls: f.cls, lvl: f.lvl }) }); } } }
  // party banter
  const party = G.actors.filter(a => a.kind === 'hero' && a.inParty && !a.dead);
  if (party.length) { partyT -= dt; if (partyT <= 0) { partyT = rnd(7, 16) * (party.length > 8 ? 0.45 : 1); const h = pick(party), boss = G.actors.find(a => a.kind === 'mob' && a.boss && !a.dead), fighting = G.actors.some(a => a.kind === 'mob' && !a.dead && a.aggro);
    const cat = h.companion && !M.instance ? (fighting ? 'companion_fight' : 'companion_idle') : null;
    const pool = cat ? GUILD[cat] : M.instance && M.instance.raid && chance(0.6) ? PARTY.raid : boss ? (boss.hp < boss.maxHp * 0.3 ? PARTY.boss_low : chance(0.5) ? PARTY.boss_start : PARTY.mid) : fighting ? PARTY.mid : PARTY.idle;
    say(h, fill(pick(pool), h, { boss: boss ? boss.name : null, dungeon: M.instance ? M.instance.name : null }), 'party', 'party'); } }
}
function startConvo(h, others) {
  const M = G.map.def, f = h.fake, o = others[0];
  let pool = M.kind === 'town' ? CONVOS.town : CONVOS.field; const r = Math.random();
  if (M.kind === 'town' && r < 0.2) pool = CONVOS.trade; else if (f.guild && o.fake.guild && f.guild !== o.fake.guild && r < 0.45) pool = CONVOS.rivals; else if (Math.abs(h.x - G.player.x) < 380 && r > 0.8) pool = CONVOS.with_player;
  const c = pick(pool), need = Math.max(...c.lines.map(l => l[0])) + 1, cast = [h, ...others.slice(0, need - 1)]; if (cast.length < need) return;
  for (const a of cast) { a.chatT = rnd(18, 40); if (a.brain && a.brain.goal.type === 'town') { a.brain.wait = c.lines.length * 2.6; } }
  convo = { cast, lines: c.lines, i: 0, t: 0.2, kind: pool === CONVOS.rivals ? 'evil' : 'say', names: cast.map(a => a.name) };
}
/** Bystanders react to something that happened to someone. kind: levelup | death | rare */
export function react(kind, who) {
  const cat = { levelup: 'react_levelup', death: 'react_death', rare: 'react_rare_drop' }[kind]; let n = 0;
  for (const h of G.actors) { if (n >= 3) break; if (h.kind !== 'hero' || !h.fake || h.dead || h === who || Math.abs(h.x - who.x) > 700) continue; if (chance(0.7)) { n++; const d = 0.5 + n * 0.9; G.game.later(d, () => { if (!h.dead && G.actors.includes(h)) say(h, fill(pick(SOLO[cat]), h), h.inParty ? 'party' : 'say'); }); } }
}
export function partyLine(cat, extra) { const party = G.actors.filter(a => a.kind === 'hero' && a.inParty && !a.dead); let i = 0; for (const h of party) { if (i++ >= 3) break; G.game.later(0.4 + i * 1.1, () => { if (!h.dead) say(h, fill(pick(PARTY[cat] || PARTY.idle), h, extra), 'party', 'party'); }); } }
/** Time passes for people off-screen: they level slowly and wander between maps. */
export function driftRoster(dt) {
  const fm = fieldMaps(), tm = townMaps();
  for (const f of G.roster) { if (f.inParty || f.companion) continue; f.xpT += dt * (0.6 + (f.seed % 10) / 10); if (f.xpT > 900 + f.lvl * 240) { f.xpT = 0; if (f.lvl < 40) f.lvl++; } if (f.map !== G.map.def.id && chance(dt / 240)) assign(f, fm, tm); }
}
export { fill, GUILD, PARTY };
export const SOLO_RIVAL = SOLO.rival, SOLO_GREET = SOLO.greet_player;
