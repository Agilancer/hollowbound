// Combat rules: damage in and out, statuses, knockback, floating numbers, death, drops,
// experience. Skills (skillrun.js) and monster attacks (brain.js) all end up in hit().
import { G, emit, rnd, ri, chance, clamp, pick } from '../state.js';
import { skillBaseDamage, weaponCoef, armorDiv, xpToNext, mobGold, ELEM, MAX_LEVEL } from '../data/game.js';
import { makeGear } from './items.js';
import { grantSkills, autoSpend } from './actor.js';
import { hexRgb, rarityRgb } from '../gfx/draw.js';
import { audio } from '../core/audio.js';
import { pillarFx } from './effects.js';

export const elemRgb = (el) => { const e = ELEM[el] || ELEM.phys; return e._g || (e._g = hexRgb(e.glow)); };
export const elemCore = (el) => { const e = ELEM[el] || ELEM.phys; return e._c || (e._c = hexRgb(e.core)); };
const near = (a) => Math.abs(a.x - G.cam.cx) < G.cam.viewW * 0.7;
export function sfxAt(name, a, vol = 1) { if (!a || near(a)) audio.sfx(name, { vol: vol * (a && !a.isPlayer && a.kind === 'hero' ? 0.45 : 1), pan: a ? clamp((a.x - G.cam.cx) / (G.cam.viewW * 0.6), -1, 1) : 0 }); }

/** Damage of one hit of a hero's skill. Returns { amount, crit }. */
export function skillHit(hero, sk, mul = 1) {
  const rank = hero.rank ? Math.max(1, hero.rank(sk.id)) : 1;
  const base = skillBaseDamage(sk, rank) * rnd(0.85, 1.15) + (hero.weaponDmg || 0) * rnd(0.8, 1.2) * weaponCoef(sk);
  let amt = base * hero.stats.dmgMul * mul * (sk.m.pow || 1) * (hero.status.weaken > 0 ? 0.7 : 1);
  const crit = chance(hero.stats.crit / 100); if (crit) amt *= 1 + hero.stats.critDmg / 100;
  return { amount: Math.max(1, amt), crit };
}

export function floater(x, y, str, style = 'n', scale = 1) { if (G.settings.dmgNumbers || style === 'x' || style === 'h') G.floaters.push({ x: x + rnd(-10, 10), y, str, style, scale, t: 0 }); }

/** Apply damage. opts: { el, crit, kb (0..), dir, sk, stun, freeze, slow, burn, poison, bleed, leech, silent } */
export function hit(src, tgt, amount, opts = {}) {
  if (!tgt || tgt.dead || tgt.kind === 'npc') return 0;
  if (tgt.inv > 0 && !opts.dot) return 0;
  const el = opts.el || 'phys';
  let amt = amount;
  if (tgt.kind === 'hero' || tgt.kind === 'summon') {
    if (!opts.dot && tgt.stats.block && chance(tgt.stats.block / 100)) { floater(tgt.x, tgt.cy - 30, 'BLOCK', 's', 0.8); sfxAt('block', tgt); tgt.flash = 0.3; return 0; }
    if (el === 'phys') amt *= 1 - tgt.stats.armor / (tgt.stats.armor + armorDiv(tgt.lvl));
    else amt *= 1 - clamp(tgt.stats.res, 0, 75) / 100;
  } else {
    amt *= 1 - tgt.stats.armor / (tgt.stats.armor + armorDiv(tgt.lvl) * 2.5);
    if (el === 'holy' && tgt.def && (tgt.def.undead || tgt.def.demon)) amt *= 1.5;
    if (src && src.lvl < tgt.lvl - 5) amt *= Math.max(0.35, 1 - (tgt.lvl - 5 - src.lvl) * 0.08);   // punching far above your level
  }
  if (tgt.status.amp > 0) amt *= 1.3;
  amt = Math.max(1, Math.round(amt));
  tgt.hp -= amt; tgt.barT = 3; tgt.flash = 0.5; tgt.flashCol = null; tgt.hurtT = Math.max(tgt.hurtT, opts.dot ? 0.2 : 0.7);
  // numbers stack upward while hits keep landing on the same target
  const now = G.time; if (now - (tgt._fT || 0) > 0.35) tgt._fRow = 0; tgt._fT = now; const row = tgt._fRow = (tgt._fRow || 0) + 1;
  const mine = src && (src.isPlayer || src.owner === G.player);
  if (near(tgt)) floater(tgt.x, tgt.cy - tgt.h * 0.5 - row * 17, String(amt), tgt.isPlayer ? 'p' : opts.crit ? 'c' : mine ? 'n' : 's', (opts.crit ? 1.15 : 1) * (mine || tgt.isPlayer ? 1 : 0.72));
  if (!opts.dot && !opts.silent) {
    sfxAt(opts.crit ? 'crit' : 'hit', tgt, mine || tgt.isPlayer ? 1 : 0.5);
    const c = elemRgb(el);
    G.parts.burst(tgt.x, tgt.cy, opts.crit ? 9 : 5, { shape: 'spark', speed: 260, life: 0.28, size: 22, col: c, orient: true, drag: 3 });
    if (tgt.kind === 'mob' && el === 'phys') G.parts.burst(tgt.x, tgt.cy, 4, { shape: 'dot', speed: 190, life: 0.5, size: 5, col: tgt.def && tgt.def.undead ? [0.85, 0.8, 0.7] : [0.6, 0.04, 0.04], g: 900, add: 0, floor: tgt.y });
  }
  if (tgt.isPlayer) { G.rd.post.flash = Math.min(0.35, 0.12 + amt / tgt.maxHp); G.rd.post.flashCol = [0.5, 0, 0]; G.cam.shake = Math.max(G.cam.shake, 5); sfxAt('hurt', tgt); }
  // statuses
  if (!tgt.boss || opts.dot) {
    if (opts.stun) tgt.status.stun = Math.max(tgt.status.stun, tgt.boss ? 0 : opts.stun);
    if (opts.freeze) tgt.status.freeze = Math.max(tgt.status.freeze, opts.freeze);
  }
  if (opts.slow) tgt.status.slow = Math.max(tgt.status.slow, opts.slow);
  for (const k of ['burn', 'poison', 'bleed']) if (opts[k] && tgt.dots.length < 6) tgt.dots.push({ t: 3, tick: 0.5, dmg: amt * 0.12, el: k === 'burn' ? 'fire' : k === 'poison' ? 'poison' : 'blood', src });
  if (src && src.stats.leech && !opts.dot) heal(src, amt * src.stats.leech / 100, true);
  if (opts.leech && src) heal(src, amt * 0.06, true);
  if (src && tgt.stats.thorns && !opts.dot && src.kind === 'mob') hit(tgt, src, amt * tgt.stats.thorns / 100, { dot: true, el: 'phys' });
  // knockback: monsters are shoved along the ground (hit-stun), heroes take the classic backward hop
  const kb = opts.kb ?? (opts.dot ? 0 : 0.5);
  if (kb > 0 && !tgt.body.rope) {
    const dir = opts.dir || (src ? Math.sign(tgt.x - src.x) || 1 : 1);
    if (tgt.kind === 'mob') { if (!tgt.boss) { tgt.body.vx = dir * 150 * kb * (tgt.elite ? 0.4 : 1); tgt.stagger = 0.22; } }
    else if (tgt.isPlayer || tgt.kind === 'hero') { if (!opts.noHop && src && src.kind === 'mob') { tgt.body.knock(dir, 0.75); tgt.inv = tgt.isPlayer ? 1.3 : 0.5; tgt.hurtInv = true; } }
  }
  if (tgt.kind === 'mob' && src) {
    const root = src.owner || src;
    tgt.threat.set(root, (tgt.threat.get(root) || 0) + amt * (root.taunt || 1));
    if (!tgt.aggro || tgt.aggro.dead || (tgt.threat.get(root) > (tgt.threat.get(tgt.aggro) || 0) * 1.3)) tgt.aggro = root;
    tgt.aggroT = 12; tgt.tagged = tgt.tagged || root;
    if (root.cls === 'barbarian') root.mp = Math.min(100, root.mp + 6);
  }
  if (tgt.hp <= 0) die(tgt, src, opts);
  return amt;
}
export function heal(a, amount, quiet) {
  if (a.dead || amount <= 0) return;
  const v = Math.min(a.maxHp - a.hp, Math.round(amount)); if (v <= 0) return;
  a.hp += v; if (!quiet && near(a)) { floater(a.x, a.cy - 40, '+' + v, 'h', 0.9); G.parts.burst(a.x, a.cy, 6, { shape: 'glow', speed: 60, life: 0.7, size: 16, col: [0.4, 1, 0.5], g: -120 }); }
}
export function tickDots(a, dt) {
  for (let i = a.dots.length - 1; i >= 0; i--) {
    const d = a.dots[i]; d.t -= dt; d.tick -= dt;
    if (d.tick <= 0) { d.tick += 0.5; hit(d.src, a, d.dmg, { dot: true, el: d.el, kb: 0 }); if (a.dead) return; }
    if (d.t <= 0) a.dots.splice(i, 1);
  }
}

export function die(a, src, opts = {}) {
  if (a.dead) return;
  a.dead = true; a.deadT = 0; a.hp = 0; a.buffs.length = 0; a.dots.length = 0; a.say = null;
  const root = src ? src.owner || src : null;
  if (a.kind === 'mob') {
    sfxAt(a.boss ? 'boss_roar' : 'mob_die', a, 0.9);
    a.body.vx = (opts.dir || (src ? Math.sign(a.x - src.x) : 1)) * 120; if (!a.body.fly) { a.body.vy = -260; a.body.plat = null; }
    const c = a.def && a.def.undead ? [0.85, 0.8, 0.68] : [0.55, 0.03, 0.05];
    G.parts.burst(a.x, a.cy, a.boss ? 60 : 14, { shape: 'dot', speed: a.boss ? 420 : 250, life: 0.8, size: 7, col: c, g: 1000, add: 0, floor: a.y });
    G.parts.burst(a.x, a.cy, 6, { shape: 'smoke', speed: 50, life: 0.8, size: 46, size2: 90, col: [0.15, 0.1, 0.12], add: 0, a: 0.6 });
    if (a.boss) { G.cam.shake = 22; G.rd.post.flash = 0.5; G.rd.post.flashCol = [1, 0.9, 0.7]; }
    const side = root && (root === G.player || root.inParty || G.map.instance);     // the player's side made the kill
    const tagMine = a.tagged === G.player || (a.tagged && a.tagged.inParty) || G.map.instance;
    if (side || tagMine) {
      const share = 1;      // party kills pay in full: grinding together is the point
      gainXp(G.player, a.xp * share * lvlPenalty(G.player.lvl, a.lvl));
      dropLoot(a);
      G.game.onKill(a);
    } else if (root && root.fake) { root.fake.kills = (root.fake.kills || 0) + 1; }
    if (a.spawn) { a.spawn.alive = false; a.spawn.t = a.spawn.respawn || rnd(6, 11); }
  } else if (a.kind === 'hero') {
    sfxAt('die', a); G.parts.burst(a.x, a.cy, 16, { shape: 'smoke', speed: 70, life: 1, size: 40, size2: 80, col: [0.2, 0.2, 0.25], add: 0, a: 0.5 });
    for (const s of a.summons) if (!s.dead) die(s, null);
    if (a.isPlayer) { emit('playerDied', { by: root ? root.name : 'the dark' }); G.rd.post.flash = 0.7; G.rd.post.flashCol = [0.4, 0, 0]; }
    else G.game.onHeroDied(a, root);
  } else if (a.kind === 'summon') { G.parts.burst(a.x, a.cy, 10, { shape: 'smoke', speed: 60, life: 0.7, size: 30, size2: 60, col: [0.3, 0.3, 0.4], add: 0, a: 0.5 }); }
}
const lvlPenalty = (pl, ml) => (pl > ml + 5 ? Math.max(0.1, 1 - (pl - ml - 5) * 0.12) : 1);

export function gainXp(p, amount) {
  const d = p.data; if (d.lvl >= MAX_LEVEL) return;
  amount = Math.round(amount * (1 + (p.stats.xp || 0) / 100) * (G.char.kindled ? 1.1 : 1)); if (amount <= 0) return;
  d.xp = (d.xp || 0) + amount;
  floater(p.x, p.cy - 70, '+' + amount + 'XP', 'x', 0.7);
  let up = false;
  while (d.lvl < MAX_LEVEL && d.xp >= xpToNext(d.lvl)) { d.xp -= xpToNext(d.lvl); d.lvl++; d.sp = (d.sp || 0) + 1; up = true; }
  if (up) levelUp(p);
}
export function levelUp(p) {
  grantSkills(p.data); if (p.data.autoSkills || !p.isPlayer) autoSpend(p.data);
  p.recompute(true);
  levelFx(p);
  if (p.isPlayer) { emit('levelUp', { lvl: p.lvl }); G.game.onLevel(p.lvl); }
}
export function levelFx(a) {
  sfxAt('levelup', a, a.isPlayer ? 1 : 0.4);
  const col = [1, 0.86, 0.4];
  pillarFx({ follow: a, col, dur: 1.4, w: 110 });
  for (let i = 0; i < 26; i++) G.parts.add({ shape: 'star', x: a.x + rnd(-40, 40), y: a.y - rnd(0, 30), vy: -rnd(120, 420), vx: rnd(-40, 40), life: rnd(0.6, 1.3), size: rnd(8, 20), col, spin: rnd(-4, 4) });
  G.floaters.push({ x: a.x, y: a.y - a.h - 40, str: 'LEVEL UP!', style: 'x', scale: 1.5, t: 0, slow: true });
}

// ------------------------------------------------------------------ drops
export function spawnDrop(d, x, y, i = 0) {
  const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
  G.drops.push({ ...d, x, y: y - 20, vx: side * 55 + rnd(-12, 12), vy: -rnd(430, 560), rot: 0, spin: rnd(-9, 9), landed: false, t: 75, seed: rnd(9), pick: 0.45 });
}
function dropLoot(m) {
  const P = G.player, L = m.lvl; let i = 0;
  const gf = 1 + (P.stats.gf || 0) / 100;
  if (m.boss || chance(0.62)) spawnDrop({ kind: 'gold', amount: Math.round(mobGold(L) * rnd(0.6, 1.5) * gf * (m.boss ? 25 : m.elite ? 6 : 1)) }, m.x, m.y, i++);
  if (chance(m.boss ? 1 : 0.07)) spawnDrop({ kind: 'potion', pot: chance(0.6) ? 'hp' : 'mp', n: m.boss ? 5 : 1, color: [0.9, 0.2, 0.2], rarity: 0 }, m.x, m.y, i++);
  const n = m.boss ? ri(3, 5) : m.elite ? ri(1, 2) : chance(0.085) ? 1 : 0;
  for (let k = 0; k < n; k++) {
    const it = makeGear({ ilvl: L, cls: P.cls, luck: m.boss ? 4 : m.elite ? 1.5 : 0, rarity: m.boss && k === 0 ? Math.max(2, Math.min(4, 2 + (chance(0.3) ? 1 : 0))) : undefined });
    spawnDrop({ kind: 'item', item: it, rarity: it.rarity, color: rarityRgb(it.rarity) }, m.x, m.y, i++);
    if (it.rarity >= 3) emit('rareDrop', { item: it });
  }
  for (const q of G.game.questDrops(m)) spawnDrop({ kind: 'etc', name: q.item, quest: q.quest, color: [0.95, 0.85, 0.5], rarity: 1 }, m.x, m.y, i++);
}
export function tickDrops(dt) {
  const P = G.player, map = G.map.geo;
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i]; d.t -= dt; d.pick -= dt;
    if (d.fly) {                 // flying into the player's hands
      d.fly += dt; const u = Math.min(1, d.fly / 0.32); d.x += (P.x - d.x) * u * 0.5; d.y += (P.cy - d.y) * u * 0.5; d.rot += dt * 14;
      if (u >= 1) { collect(d); G.drops.splice(i, 1); }
      continue;
    }
    if (!d.landed) {
      d.vy += 1900 * dt; d.x += d.vx * dt; const ny = d.y + d.vy * dt; d.rot += d.spin * dt;
      d.x = clamp(d.x, 40, map.w - 40);
      if (d.vy > 0) { let land = null; for (const p of map.plats) if (d.x >= p.x1 && d.x <= p.x2 && d.y <= p.y + 1 && ny >= p.y && (!land || p.y < land.y)) land = p; if (land) { d.y = land.y; d.landed = true; d.rot = 0; continue; } }
      d.y = ny; if (d.y > map.h + 100) { G.drops.splice(i, 1); }
      continue;
    }
    if (d.t <= 0) { G.drops.splice(i, 1); continue; }
    if (d.pick <= 0 && !P.dead && Math.abs(d.x - P.x) < (G.auto ? 150 : 46) && Math.abs(d.y - P.y) < 70) {
      if (d.kind === 'item' && G.char.bag.length >= G.char.bagMax) { if (!d.warned) { d.warned = true; emit('toast', { text: 'Your bag is full.' }); } continue; }
      d.fly = 0.001; sfxAt(d.kind === 'gold' ? 'coin' : d.rarity >= 3 ? 'loot_rare' : 'loot', P, 0.8);
    }
  }
}
function collect(d) {
  const c = G.char;
  if (d.kind === 'gold') { c.gold += d.amount; floater(G.player.x, G.player.cy - 50, '+' + d.amount + 'G', 'x', 0.7); }
  else if (d.kind === 'potion') { c.potions[d.pot] = (c.potions[d.pot] || 0) + d.n; }
  else if (d.kind === 'etc') { c.etc[d.name] = (c.etc[d.name] || 0) + 1; G.game.onCollect(d.name); }
  else if (d.kind === 'item') { c.bag.push(d.item); emit('gotItem', { item: d.item }); G.game.autoEquip(d.item); }
  emit('bag');
}
