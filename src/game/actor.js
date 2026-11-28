// Actors: every body in the world. Heroes (the player, the simulated players, party
// members, duel opponents), monsters, summons and NPCs share one class so that combat,
// skills, AI and drawing treat them alike. team 0 = heroes and their summons, 1 = monsters,
// 2 = the other side of a duel.
import { G, clamp, rnd } from '../state.js';
import { Body } from './body.js';
import { CLASSES, CLASS_SKILLS, SKILLS, GRANTS, xpToNext, armorDiv, refHit, refLife, mobLife, mobDamage, mobXp, HERO_H, isRanged, weaponAvg } from '../data/game.js';

let uid = 1;
export class Actor {
  constructor(kind, x, y) {
    this.uid = uid++; this.kind = kind; this.team = kind === 'mob' ? 1 : 0;
    this.body = new Body(x, y);
    this.name = ''; this.lvl = 1; this.hp = 1; this.maxHp = 1; this.mp = 0; this.maxMp = 0;
    this.h = HERO_H; this.w = 46;                 // hit box (feet-anchored)
    this.dead = false; this.remove = false; this.deadT = 0;
    this.buffs = [];                              // { id, stat:{...}, t, el, pulse? }
    this.status = { stun: 0, freeze: 0, slow: 0, fear: 0, amp: 0, weaken: 0, root: 0 };
    this.dots = [];                               // { t, tick, dmg, el, src }
    this.cd = {};                                 // skill id -> time left
    this.gcd = 0; this.useT = 0;                  // global use lock
    this.inv = 0;                                 // invulnerable time
    // animation state (gfx/draw.js reads these)
    this.animT = rnd(10); this.lunge = 0; this.castT = 0; this.hurtT = 0; this.flash = 0; this.squash = 0; this.spawnT = 0.3; this.emoteT = 0;
    this.spin = 0; this.tilt = 0; this.alpha = 1; this.scale = 1;
    this.say = null; this.sayT = 0; this.sayKind = 'say';
    this.stats = { dmgMul: 1, armor: 0, crit: 5, critDmg: 50, speed: 1, leech: 0, regen: 0, block: 0, thorns: 0, cdr: 0, asMul: 1, res: 0 };
    this.target = null; this.brain = null; this.owner = null;
    this.sprite = null;                           // set by gfx/sprites.js
    this.barT = 0;                                // show hp bar for a while after a hit
  }
  get x() { return this.body.x; } get y() { return this.body.y; }
  get cx() { return this.body.x; } get cy() { return this.body.y - this.h * 0.5; }
  get face() { return this.body.face; }
  get busy() { return this.useT > 0 || this.status.stun > 0 || this.status.freeze > 0; }
  enemyOf(o) { return o && o.team !== this.team && !o.dead && o.kind !== 'npc' && this.kind !== 'npc'; }
  buffSum(k) { let s = 0; for (const b of this.buffs) if (b.stat && b.stat[k]) s += b.stat[k]; return s; }
  speak(text, kind = 'say', t = 4.2) { this.say = text; this.sayT = t; this.sayKind = kind; }

  tickBase(dt) {
    this.animT += dt;
    if (this.lunge > 0) this.lunge = Math.max(0, this.lunge - dt * 4.5);
    if (this.castT > 0) this.castT = Math.max(0, this.castT - dt * 2.6);
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt * 3.2);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    if (this.squash !== 0) { this.squash *= Math.max(0, 1 - dt * 9); if (Math.abs(this.squash) < 0.004) this.squash = 0; }
    if (this.spawnT > 0) this.spawnT = Math.max(0, this.spawnT - dt);
    if (this.spin) { this.spin *= Math.max(0, 1 - dt * 3); if (Math.abs(this.spin) < 0.02) this.spin = 0; }
    if (this.sayT > 0) { this.sayT -= dt; if (this.sayT <= 0) this.say = null; }
    if (this.inv > 0) this.inv -= dt;
    if (this.barT > 0) this.barT -= dt;
    if (this.useT > 0) this.useT -= dt;
    if (this.gcd > 0) this.gcd -= dt;
    const cdk = 1 + this.stats.cdr / 100;
    for (const k in this.cd) { this.cd[k] -= dt * cdk; if (this.cd[k] <= 0) delete this.cd[k]; }
    const s = this.status; for (const k in s) if (s[k] > 0) s[k] = Math.max(0, s[k] - dt);
    let changed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) { const b = this.buffs[i]; b.t -= dt; if (b.t <= 0) { this.buffs.splice(i, 1); changed = true; } }
    if (changed && this.recompute) this.recompute();
    this.body.speed = this.stats.speed * (s.slow > 0 ? 0.55 : 1) * (s.freeze > 0 || s.stun > 0 || s.root > 0 ? 0 : 1);
  }
}

// ------------------------------------------------------------------ heroes
export class Hero extends Actor {
  /** data: { name, cls, lvl, xp, equip, ranks, bar, guild, title } (the save shape for the player) */
  constructor(data, x, y) {
    super('hero', x, y);
    this.data = data; this.cls = data.cls; this.name = data.name; this.lvl = data.lvl || 1;
    this.C = CLASSES[this.cls]; this.ranged = isRanged(this.cls);
    this.isPlayer = false; this.fake = null; this.guild = data.guild || ''; this.gold = 0;
    this.h = 100; this.w = 44;
    this.summons = [];
    grantSkills(data);
    this.recompute(true);
  }
  get equip() { return this.data.equip; }
  rank(id) { return this.data.ranks[id] || 0; }
  recompute(full) {
    const d = this.data, C = this.C, L = this.lvl = d.lvl;
    const a = { str: C.base.str, dex: C.base.dex, vit: C.base.vit, int: C.base.int };
    // 5 points a level, placed as Velscour's auto-allocation does: primary and vitality 6:4
    const pts = (L - 1) * 5; a[C.primary] += Math.round(pts * 0.6); a.vit += Math.round(pts * 0.4);
    const g = { dmg: 0, armor: 0, life: 0, mana: 0, dmgPct: 0, crit: 0, speed: 0, leech: 0, regen: 0, block: 0, gf: 0, xp: 0, offDmg: 0 };
    for (const slot in d.equip) { const it = d.equip[slot]; if (!it) continue; for (const k in it.stats) { if (k in a) a[k] += it.stats[k]; else if (k === 'dmg' && slot !== 'weapon') g.offDmg += it.stats[k]; else g[k] = (g[k] || 0) + it.stats[k]; } }
    if (d.guild && d.guild.up) { const u = d.guild.up; g.dmgPct += (u.armory || 0) * 3.4; g.xp += (u.hearth || 0) * 3; g.gf += (u.banner || 0) * 3; g.lifePct = (u.chapel || 0) * 4; }
    this.attr = a; this.gear = g;
    const B = (k) => this.buffSum(k);
    this.maxHp = Math.round((C.life + (L - 1) * C.lifeLvl + 0.45 * (L - 1) * (L - 1) + a.vit * 6 + g.life) * (1 + (B('life') + (g.lifePct || 0)) / 100));
    this.maxMp = Math.round(C.mana + (L - 1) * C.manaLvl + a.int * 2 + g.mana);
    if (this.cls === 'barbarian') this.maxMp = 100;
    const st = this.stats;
    this.weaponDmg = (g.dmg || weaponAvg(1) * 0.6) + g.offDmg;
    st.dmgMul = (1 + (a[C.primary] * 0.28 + g.dmgPct * 0.6) / 100) * (1 + B('dmg') / 100);
    st.armor = (g.armor + a.str + (L - 1) * 1.5) * (1 + B('armor') / 100);
    st.crit = Math.min(75, 5 + a.dex * 0.1 + g.crit + B('crit'));
    st.critDmg = 50;
    st.speed = (this.cls === 'barbarian' ? 1.1 : 1) * (1 + (g.speed + B('speed')) / 100);
    st.leech = g.leech + B('leech'); st.regen = a.vit * 0.08 + g.regen + B('regen') * 0.4;
    st.block = Math.min(60, g.block + B('block')); st.thorns = B('thorns'); st.cdr = Math.min(60, B('cdr'));
    st.asMul = 1 + Math.min(150, a.dex * 0.3 + B('as')) / 100; st.res = Math.min(60, B('res') * 0.5);
    st.gf = g.gf; st.xp = g.xp;
    if (full) { this.hp = this.maxHp; this.mp = this.cls === 'barbarian' ? 0 : this.maxMp; }
    this.hp = Math.min(this.hp, this.maxHp); this.mp = Math.min(this.mp, this.maxMp);
  }
  /** Skills this hero can use, best first for the bots: [{sk, rank}] */
  known() { const out = []; for (const sk of CLASS_SKILLS[this.cls]) { const r = this.rank(sk.id); if (r > 0) out.push(sk); } return out; }
}
export function grantSkills(d) {
  d.ranks = d.ranks || {}; d.bar = d.bar || [];
  const extra = d.cls === 'dragoon' ? [[1, 3, 0], [2, 3, 1], [4, 3, 2]] : d.cls === 'rogue' ? [[1, 0, 1]] : [];
  for (const [lv, t, i] of [...GRANTS, ...extra]) {
    if (d.lvl < lv) continue;
    const id = `${d.cls}.${t}.${i}`; if (!SKILLS[id]) continue;
    if (!d.ranks[id]) { d.ranks[id] = 1; if (d.bar.length < 8 && !d.bar.includes(id) && d.basic !== id) { if (!d.basic) d.basic = id; else d.bar.push(id); } }
  }
  if (!d.basic) d.basic = `${d.cls}.0.0`;
}
/** Spend points the way a sensible player would (simulated players, and the Auto button). */
export function autoSpend(d) {
  let guard = 0;
  while ((d.sp || 0) > 0 && guard++ < 400) {
    const opts = CLASS_SKILLS[d.cls].filter(sk => d.lvl >= sk.reqLevel && (d.ranks[sk.id] || 0) < 20 && (!sk.prereq || d.ranks[sk.prereq] > 0));
    if (!opts.length) break;
    // prefer new skills (variety), then raising what is on the bar
    const fresh = opts.filter(sk => !d.ranks[sk.id]);
    const sk = fresh.length && Math.random() < 0.55 ? fresh[Math.floor(Math.random() * fresh.length)] : opts[Math.floor(Math.random() * opts.length)];
    d.ranks[sk.id] = (d.ranks[sk.id] || 0) + 1; d.sp--;
    if (d.ranks[sk.id] === 1 && d.bar.length < 8 && sk.id !== d.basic) d.bar.push(sk.id);
  }
}

// ------------------------------------------------------------------ monsters
export class Mob extends Actor {
  /** def: bestiary entry (game/bestiary.js), opts: { lvl, elite, boss, raid, hpMul } */
  constructor(def, x, y, opts = {}) {
    super('mob', x, y);
    this.def = def; this.name = opts.name || def.name; this.lvl = opts.lvl || 1;
    const A = def.A || { hp: 1, dmg: 1, spd: 2.5, ai: 'melee' };
    this.ai = def.fly ? 'fly' : A.ai || 'melee';
    this.elite = !!opts.elite; this.boss = !!opts.boss;
    const size = this.boss ? 1 : this.elite ? 1.25 : 1;
    this.h = Math.max(36, def.hw * size); this.w = Math.max(34, Math.min(def.ww * size * 0.62, this.h * 1.5));
    this.scale = size;
    const hpK = (this.boss ? (opts.raid ? 520 : opts.dungeon ? 90 : 30) : this.elite ? 6 : 1) * (opts.hpMul || 1);
    this.maxHp = this.hp = Math.round(mobLife(this.lvl, clamp(A.hp || 1, 0.5, 2.2)) * hpK * (0.9 + Math.min(1.2, def.hw / 220)));
    this.dmg = mobDamage(this.lvl, clamp(A.dmg || 1, 0.6, 1.6)) * (this.boss ? 1.4 : this.elite ? 1.25 : 1);
    this.xp = Math.round(mobXp(this.lvl) * (this.boss ? 30 : this.elite ? 6 : 1) * (0.8 + Math.min(1, def.hw / 240)));
    this.stats.speed = clamp((A.spd || 2.5) / 3.2, 0.45, 1.25) * (this.boss ? 0.9 : 1);
    this.stats.armor = this.lvl * 2;
    this.body.fly = this.ai === 'fly';
    this.rangedAtk = ['ranged', 'caster', 'beamer'].includes(A.ai);
    this.el = def.el || 'phys';
    this.aggro = null; this.aggroT = 0; this.atkT = rnd(1, 2); this.thinkT = rnd(0, 1.5); this.move = 0; this.spawn = opts.spawn || null;
    this.threat = new Map();
  }
}
export const heroPower = (L) => refHit(L);
export const heroLife = (L) => refLife(L);
export { xpToNext, armorDiv };
