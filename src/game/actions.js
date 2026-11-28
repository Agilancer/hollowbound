// What the player can do through the UI: talk, trade, gear, skills, parties, guilds,
// duels. Mixed into G.game (methods use `this`).
import { G, emit, rnd, ri, pick, chance, clamp } from '../state.js';
import { audio } from '../core/audio.js';
import { NPCS } from '../data/npcs.js';
import { SKILLS, CLASS_SKILLS, MAX_SKILL_LEVEL } from '../data/game.js';
import { makeGear, itemScore, canEquip, POTIONS, SLOTS } from './items.js';
import * as Q from './quests.js';
import * as S from './social.js';
import { levelFx } from './combat.js';
import { Bot } from './brain.js';

const stock = new Map();
const HALL_UP = {
  hearth: { name: 'The Hearth', desc: '+3% experience per rank', base: 2500 }, armory: { name: 'The Armory', desc: '+2% damage per rank', base: 3000 },
  vault: { name: 'The Vault', desc: '+8 bag slots per rank', base: 2000 }, banner: { name: 'War Banners', desc: '+3% gold find per rank; rivals take notice', base: 1500 },
  chapel: { name: 'Chapel of the Flame', desc: '+4% life per rank', base: 3500 },
};
export const actions = {
  HALL_UP,
  // ---------------------------------------------------------------- talking
  interact() {
    const P = G.player; if (P.dead || G.loading) return;
    const po = this.portalNear(); 
    let best = null, bd = 150;
    for (const a of G.actors) { if (a === P || a.dead) continue; if (a.kind !== 'npc' && !(a.kind === 'hero' && a.fake)) continue; const d = Math.abs(a.x - P.x) + Math.abs(a.y - P.y) * 1.5 + (a.kind === 'hero' ? 40 : 0); if (d < bd) { bd = d; best = a; } }
    if (best && best.kind === 'npc') return this.talk(best);
    if (po) return this.usePortal(po);
    if (best) return emit('playerMenu', { hero: best, info: this.inspect(best) });
  },
  talk(npc) {
    const id = npc.npcId, N = npc.N, advanced = Q.onTalk(id);
    npc.body.face = G.player.x >= npc.x ? 1 : -1; npc.emote = 'happy'; npc.emoteT = 3;
    audio.sfx('ui_open');
    emit('dialog', { npc, id, name: N.name, title: N.title, role: N.role || 'flavor', text: pick(N.greet || ['...']), offers: Q.offersOf(id), turnins: Q.turninsOf(id), active: Q.activeList().filter(q => q.giver === id && !Q.complete(q)), advanced });
  },
  acceptQuest(id) { const q = Q.QUEST_BY_ID.get(id); if (q && Q.canOffer(q)) Q.accept(q); },
  turnInQuest(id) { const q = Q.QUEST_BY_ID.get(id); if (q && Q.complete(q)) Q.turnIn(q); },
  quests() { return Q.activeList().map(q => ({ q, text: Q.stepText(q), done: Q.complete(q) })); },
  questsDone() { return Object.keys(G.char.quests.done).map(id => Q.QUEST_BY_ID.get(id)).filter(Boolean); },
  abandonQuest(id) { delete G.char.quests.active[id]; Q.refreshMarks(); emit('quest', {}); },

  // ---------------------------------------------------------------- trade
  shopStock(role, npcId) {
    const key = npcId + '|' + G.char.lvl; let s = stock.get(key); if (s && G.time - s.t < 300) return s.items;
    const c = G.char, L = c.lvl, items = [], g = (slot, rarity) => { const it = makeGear({ slot, cls: c.cls, ilvl: Math.max(1, L + ri(-1, 2)), rarity }); it.price = Math.round(it.value * 3.2); return it; };
    if (role === 'shop:weapons') { for (let i = 0; i < 5; i++) items.push(g('weapon', i < 2 ? 0 : i < 4 ? 1 : 2)); for (let i = 0; i < 3; i++) items.push(g('offhand', i)); }
    else if (role === 'shop:armor') { for (let i = 0; i < 4; i++) items.push(g('body', Math.min(2, i))); for (let i = 0; i < 4; i++) items.push(g('head', Math.min(2, i))); }
    else if (role === 'shop:gems') { for (let i = 0; i < 4; i++) items.push(g('ring', 1 + (i > 1))); for (let i = 0; i < 4; i++) items.push(g('amulet', 1 + (i > 1))); }
    else if (role === 'gamble') { for (let i = 0; i < 8; i++) { const it = makeGear({ cls: c.cls, ilvl: L + 1, luck: 3 }); it.price = Math.round((40 + L * 26) * 1.0); it.mystery = true; items.push(it); } }
    if (role === 'shop:potions' || role === 'innkeeper') { items.push({ type: 'potion', pot: 'hp', name: POTIONS.hp.name, price: POTIONS.hp.price + L * 2, id: 'hp' }); items.push({ type: 'potion', pot: 'mp', name: POTIONS.mp.name, price: POTIONS.mp.price + L * 2, id: 'mp' }); }
    stock.set(key, { t: G.time, items }); return items;
  },
  buy(entry, n = 1) {
    const c = G.char, cost = entry.price * n; if (c.gold < cost) { emit('toast', { text: 'Not enough gold.' }); audio.sfx('ui_error'); return false; }
    if (entry.type === 'potion') { c.potions[entry.pot] = (c.potions[entry.pot] || 0) + n; }
    else { if (c.bag.length >= c.bagMax) { emit('toast', { text: 'Your bag is full.' }); return false; } entry.mystery = false; delete entry.price; c.bag.push(entry); for (const s of stock.values()) { const i = s.items.indexOf(entry); if (i >= 0) s.items.splice(i, 1); } this.autoEquip(entry); }
    c.gold -= cost; audio.sfx('coin'); emit('bag'); return true;
  },
  sell(id) { const c = G.char, i = c.bag.findIndex(it => it.id === id); if (i < 0) return; const it = c.bag[i]; c.bag.splice(i, 1); c.gold += it.value; audio.sfx('coin'); emit('bag'); },
  sellJunk(quiet) {
    const c = G.char; let n = 0, g = 0;
    for (let i = c.bag.length - 1; i >= 0; i--) { const it = c.bag[i]; if (it.lock) continue; const cur = c.equip[it.slot]; if (it.rarity >= 4) continue; if (!canEquip(it, c.cls) || itemScore(it) <= itemScore(cur)) { c.bag.splice(i, 1); g += it.value; n++; } }
    c.gold += g; if (n) { audio.sfx('coin'); if (!quiet || n) emit('toast', { text: `Sold ${n} item${n > 1 ? 's' : ''} for ${g} gold.` }); emit('bag'); } return n;
  },
  rest() { const c = G.char, cost = 10 + c.lvl * 3; if (c.gold < cost) return emit('toast', { text: 'Not enough gold.' }); c.gold -= cost; const P = G.player; P.hp = P.maxHp; P.mp = P.cls === 'barbarian' ? P.mp : P.maxMp; levelFx(P); c.kindled = G.time + 600; emit('toast', { text: 'Rested. Kindled: +10% experience for a while.' }); emit('bag'); },
  upgradeCost(it) { return Math.round((60 + it.ilvl * 22) * Math.pow(1.6, it.plus || 0) * (1 + it.rarity * 0.5)); },
  upgrade(id) {
    const c = G.char, it = [...c.bag, ...Object.values(c.equip)].find(x => x && x.id === id); if (!it || (it.plus || 0) >= 10) return false; const cost = this.upgradeCost(it); if (c.gold < cost) { emit('toast', { text: 'Not enough gold.' }); return false; }
    c.gold -= cost; it.plus = (it.plus || 0) + 1; for (const k of ['dmg', 'armor']) if (it.stats[k]) it.stats[k] = Math.round(it.stats[k] * 1.09 + 1); it.value = Math.round(it.value * 1.2);
    audio.sfx('equip'); G.player.recompute(); emit('bag'); emit('toast', { text: `${it.name} +${it.plus}` }); return true;
  },
  enchantCost(it) { return Math.round((90 + it.ilvl * 30) * (1 + it.rarity)); },
  enchant(id) {
    const c = G.char, all = [...c.bag, ...Object.values(c.equip)], it = all.find(x => x && x.id === id); if (!it) return false; const cost = this.enchantCost(it); if (c.gold < cost) { emit('toast', { text: 'Not enough gold.' }); return false; }
    c.gold -= cost; const n = makeGear({ slot: it.slot, cls: it.cls || c.cls, ilvl: it.ilvl, rarity: it.rarity }); const keep = {}; for (const k of ['dmg', 'armor', 'block']) if (it.stats[k]) keep[k] = it.stats[k];
    for (const k of ['dmg', 'armor', 'block']) delete n.stats[k]; it.stats = { ...keep, ...n.stats }; audio.sfx('cast_arcane'); G.player.recompute(); emit('bag'); return true;
  },
  stash(id) { const c = G.char; c.stash = c.stash || []; const i = c.bag.findIndex(x => x.id === id); if (i < 0 || c.stash.length >= 60) return; c.stash.push(c.bag.splice(i, 1)[0]); emit('bag'); },
  unstash(id) { const c = G.char; const i = (c.stash || []).findIndex(x => x.id === id); if (i < 0 || c.bag.length >= c.bagMax) return; c.bag.push(c.stash.splice(i, 1)[0]); emit('bag'); },

  // ---------------------------------------------------------------- gear
  equip(id) {
    const c = G.char, i = c.bag.findIndex(it => it.id === id); if (i < 0) return false; const it = c.bag[i];
    if (!canEquip(it, c.cls)) { emit('toast', { text: 'Your class cannot use that.' }); audio.sfx('ui_error'); return false; }
    const old = c.equip[it.slot]; c.bag.splice(i, 1); if (old) c.bag.push(old); c.equip[it.slot] = it;
    G.player.recompute(); audio.sfx('equip'); emit('bag'); return true;
  },
  unequip(slot) { const c = G.char, it = c.equip[slot]; if (!it || c.bag.length >= c.bagMax || slot === 'weapon' && false) return; delete c.equip[slot]; c.bag.push(it); G.player.recompute(); emit('bag'); },
  autoEquip(it) { const c = G.char; if (!c.autoGear || !canEquip(it, c.cls)) return; if (itemScore(it) > itemScore(c.equip[it.slot]) * 1.02) { this.equip(it.id); emit('toast', { text: 'Equipped ' + it.name, kind: 'item', rarity: it.rarity }); } },
  dropItem(id) { const c = G.char, i = c.bag.findIndex(it => it.id === id); if (i >= 0) { c.bag.splice(i, 1); emit('bag'); } },

  // ---------------------------------------------------------------- skills
  canLearn(sk) { const c = G.char; return (c.sp || 0) > 0 && c.lvl >= sk.reqLevel && (c.ranks[sk.id] || 0) < MAX_SKILL_LEVEL && (!sk.prereq || c.ranks[sk.prereq] > 0); },
  learn(id) { const c = G.char, sk = SKILLS[id]; if (!sk || !this.canLearn(sk)) return false; c.ranks[id] = (c.ranks[id] || 0) + 1; c.sp--; if (c.ranks[id] === 1 && c.bar.length < 8 && id !== c.basic && !c.bar.includes(id)) c.bar.push(id); audio.sfx('buff'); emit('skills'); return true; },
  setBar(i, id) { const c = G.char; if (id && !(c.ranks[id] > 0)) return; const j = c.bar.indexOf(id); if (j >= 0) c.bar[j] = c.bar[i]; c.bar[i] = id; for (let k = 0; k < 8; k++) if (c.bar[k] === undefined) c.bar[k] = null; emit('skills'); },
  setBasic(id) { const c = G.char; if (c.ranks[id] > 0) { c.basic = id; emit('skills'); } },
  skillTree() { return CLASS_SKILLS[G.char.cls]; },

  // ---------------------------------------------------------------- party
  inspect(h) { const f = h.fake || {}; return { name: h.name, cls: h.cls, lvl: h.lvl, guild: h.guild, bad: !!f.bad, friend: f.friend || 0, inParty: !!h.inParty, companion: !!f.companion, equip: h.equip, canRecruit: !!G.char.guild && !f.companion && G.roster.filter(x => x.companion).length < 4 }; },
  partyList() { return G.actors.filter(a => a.kind === 'hero' && a.inParty); },
  invite(h) {
    const f = h.fake; if (!f || h.inParty) return;
    if (this.partyList().length >= 4) return emit('toast', { text: 'Your party is full (5).' });
    const ok = !f.bad || f.friend > 2 || chance(0.3);
    if (!ok) { S.say(h, pick(['no thx', 'busy', 'lol no', 'solo only', 'ur gear is bad', 'maybe when ur higher lvl']), 'say'); return; }
    S.say(h, pick(['sure', 'inv', 'ok lets go', 'finally a party', 'where to?', 'ty for inv']), 'party', 'party');
    h.inParty = true; f.inParty = true; h.brain.goal = { type: 'follow', leader: G.player, slot: this.partyList().length }; f.friend++; emit('party'); audio.sfx('quest_accept');
  },
  /** Bring a roster member into the party (dungeon fill, companions). */
  joinParty(f, silent, lvl, temp) {
    const P = G.player, h = S.spawnFake(f, P.x - 50, P.y - 10, lvl || (f.companion ? Math.max(f.lvl, P.lvl - 1) : f.lvl));
    h.inParty = true; f.inParty = true; h.tempParty = !!temp; h.companion = !!f.companion; h.brain.goal = { type: 'follow', leader: P, slot: this.partyList().length };
    G.actors.push(h); emit('party'); return h;
  },
  leaveParty(h, silent) { const f = h.fake; h.inParty = false; if (f) { f.inParty = false; f.data = null; } const i = G.actors.indexOf(h); if (h.tempParty || G.map.instance || true) { if (i >= 0) G.actors.splice(i, 1); for (const s of h.summons) s.dead = true; } emit('party'); },
  kick(h) { if (h.fake && h.fake.companion) { h.fake.companion = false; } this.leaveParty(h); },
  recruit(h) {
    const f = h.fake, c = G.char; if (!f) return; if (!c.guild) return emit('toast', { text: 'Found a guild first: speak with the registrar on Chapel Row.' });
    if (G.roster.filter(x => x.companion).length >= 4) return emit('toast', { text: 'You already travel with four companions.' });
    const ok = f.friend >= 2 || (!f.bad && chance(0.55)) || (f.bad && chance(0.15));
    if (!ok) { S.say(h, S.fill(pick(['i already have a guild... kind of', 'whats the pay', 'ask me again after a dungeon', 'party with me first', 'hmm. no.']), h)); f.friend += 0.5; return; }
    S.say(h, S.fill(pick(S.GUILD.companion_join), h), 'guild', 'guild');
    f.companion = true; f.guild = c.guild.name; h.guild = c.guild.name; h.guildColor = '#7ae0a0'; h.companion = true; if (f.data) f.data.guild = c.guild.name;
    if (!h.inParty) { h.inParty = true; f.inParty = true; h.brain.goal = { type: 'follow', leader: G.player, slot: this.partyList().length }; }
    c.guild.members = (c.guild.members || 0) + 1; emit('party'); audio.sfx('quest_done'); this.save();
  },

  // ---------------------------------------------------------------- guild
  foundGuild(name) {
    const c = G.char; name = (name || '').trim().slice(0, 22);
    if (c.guild) return emit('toast', { text: 'You already lead a guild.' }); if (c.lvl < 10) return emit('toast', { text: 'The registrar wants level 10 and 5,000 gold.' }); if (c.gold < 5000) return emit('toast', { text: 'A charter costs 5,000 gold.' }); if (name.length < 3) return emit('toast', { text: 'Name your guild (3+ letters).' });
    c.gold -= 5000; c.guild = { name, level: 1, renown: 0, up: {}, members: 0 }; G.player.guild = name; G.player.recompute(); audio.sfx('quest_done'); levelFx(G.player);
    emit('toast', { text: `The guild <${name}> is chartered. The Charterhouse is yours.`, kind: 'quest' }); emit('chat', { chan: 'shout', from: 'Town Crier', text: `Hear ye: a new guild, <${name}>, hangs its banner on Chapel Row.` }); emit('bag'); this.save();
  },
  hallCost(k) { const u = G.char.guild?.up[k] || 0; return Math.round(HALL_UP[k].base * Math.pow(1.7, u)); },
  hallUpgrade(k) { const c = G.char, g = c.guild; if (!g || !HALL_UP[k]) return; const u = g.up[k] || 0; if (u >= 5) return; const cost = this.hallCost(k); if (c.gold < cost) return emit('toast', { text: 'Not enough gold.' }); c.gold -= cost; g.up[k] = u + 1; g.level = 1 + Object.values(g.up).reduce((a, b) => a + b, 0); if (k === 'vault') c.bagMax += 8; G.player.recompute(); audio.sfx('quest_done'); emit('bag'); emit('toast', { text: HALL_UP[k].name + ' rank ' + (u + 1) }); },

  // ---------------------------------------------------------------- the pit
  startDuel(n = 1) {
    const M = G.map; if (M.def.kind !== 'arena' || this.duel) return;
    const P = G.player, pool = G.roster.filter(f => !f.inParty && !f.companion).sort((a, b) => Math.abs(a.lvl - P.lvl) - Math.abs(b.lvl - P.lvl)).slice(0, 12);
    G.actors = G.actors.filter(a => !(a.kind === 'hero' && a.fake && !a.inParty));
    this.duel = { foes: [], n };
    for (let i = 0; i < n; i++) { const f = pool.splice(ri(0, pool.length - 1), 1)[0], h = S.spawnFake(f, M.geo.w * 0.7 + i * 60, null, Math.max(1, P.lvl + ri(-1, 0))); h.team = 2; h.brain.goal = { type: 'duel', range: 3000 }; h.duelFoe = true; G.actors.push(h); this.duel.foes.push(h); S.say(h, S.fill(pick(S.SOLO_RIVAL), h), 'evil'); }
    emit('toast', { text: n > 1 ? 'The Pit: guild skirmish!' : 'The Pit: a duel!', kind: 'boss' }); audio.sfx('bell');
  },
  duelCheck() {
    const d = this.duel; if (!d || d.foes.some(h => !h.dead)) return;
    const c = G.char, prize = (120 + c.lvl * 40) * d.n; c.gold += prize; if (c.guild) c.guild.renown = (c.guild.renown || 0) + d.n * 5; c.duelWins = (c.duelWins || 0) + 1;
    emit('toast', { text: `Victory in the Pit: +${prize} gold${c.guild ? ', +' + d.n * 5 + ' renown' : ''}.`, kind: 'quest' }); audio.sfx('quest_done'); levelFx(G.player);
    this.later(4, () => { for (const h of d.foes) { const i = G.actors.indexOf(h); if (i >= 0) G.actors.splice(i, 1); h.fake.data = null; } this.duel = null; S.populate(G.map); emit('bag'); });
  },

  // ---------------------------------------------------------------- chat
  chatSend(text) {
    text = String(text || '').trim().slice(0, 120); if (!text) return; const P = G.player; S.say(P, text, 'say');
    const near = G.actors.filter(a => a.kind === 'hero' && a.fake && !a.dead && Math.abs(a.x - P.x) < 500);
    if (near.length && chance(0.8)) { const h = pick(near); this.later(rnd(1.2, 2.6), () => { if (!h.dead) S.say(h, S.fill(pick(h.inParty ? S.GUILD.companion_idle : S.SOLO_GREET), h), h.inParty ? 'party' : 'say'); }); }
  },
  worldMap() { return { maps: [...G.char.visited || []] }; },
};
