// Runs Velscour's skills in a side-scroller. The 684 skills are data
// (src/data/velscour/skilldata.js: "Name|kind|element|fx|mods"); this file gives each of the
// 23 kinds a side-view behaviour and reads the same mods Velscour does.
import { G, rnd, ri, clamp, pick, chance } from '../state.js';
import { SKILLS, SUMMONS, manaCost, cooldown, useTime, buffAmount, skillDuration, TILE, ELEM } from '../data/game.js';
import { hit, heal, skillHit, elemRgb, elemCore, sfxAt, floater } from './combat.js';
import { spawnProj, blast, zone, beam, chainFx, orbit, cyclone, flashFx, pillarFx, inEllipse, inBox, nearestFoe, friends, foes, puff } from './effects.js';
import { Actor } from './actor.js';
import { dropTo, platAt } from './body.js';
import { mobDef, BEST } from './bestiary.js';
import { mobSprite } from '../gfx/sprites.js';

const MELEE_KINDS = new Set(['melee', 'whirl', 'leap', 'dash']);
export const rageCost = (sk) => (sk.m.free || sk.idx === 0 ? 0 : sk.kind === 'whirl' ? 20 : 12 + sk.row * 9);
export function costOf(a, sk) { return a.cls === 'barbarian' ? rageCost(sk) : manaCost(sk, Math.max(1, a.rank(sk.id))); }
export function ready(a, sk) { return !a.dead && !a.busy && !a.cd[sk.id] && !a.body.rope && a.mp >= costOf(a, sk); }
/** How far away a bot should stand to use this (world units). */
export function reach(sk) {
  switch (sk.kind) {
    case 'melee': return 1.5 * TILE * (sk.m.range ?? 1) * (sk.m.r ?? 1) + 26;
    case 'whirl': case 'nova': return 2.4 * TILE * (sk.m.r ?? 1);
    case 'dash': return 4.5 * TILE; case 'leap': case 'blink': return 6 * TILE;
    case 'beam': return 7 * TILE * (sk.m.cone ? 0.5 : 1);
    case 'buff': case 'heal': case 'summon': case 'zone': case 'orbit': return 9 * TILE;
    case 'curse': return sk.m.at === 'self' ? 3.5 * TILE : 8 * TILE;
    case 'fissure': case 'cyclone': return 7 * TILE;
    case 'proj': return 9.5 * TILE * (sk.m.range ?? 1) * (sk.m.ret ? 0.6 : 1);
    default: return 8 * TILE;
  }
}
const hopts = (sk) => { const m = sk.m; return { kb: m.knock ? 1.7 : MELEE_KINDS.has(sk.kind) ? 0.6 : 0.35, stun: m.stun ? 0.9 : 0, freeze: m.freeze ? 1.3 : 0, slow: m.slow ? 2.5 : 0, burn: !!m.burn, poison: !!m.poison, bleed: !!m.bleed, leech: !!m.leech }; };
function aim(a, range, yTol = 170) {
  const t = a.target;
  if (t && a.enemyOf(t) && Math.abs(t.x - a.x) <= range && Math.abs(t.cy - a.cy) < yTol + 60) return t;
  let best = null, bd = range;
  for (const o of G.actors) { if (!a.enemyOf(o)) continue; const dx = (o.x - a.x) * a.face, dy = Math.abs(o.cy - a.cy); if (dy > yTol) continue; const d = dx >= -30 ? Math.abs(dx) : Math.abs(dx) * 2.2 + 60; if (d < bd) { bd = d; best = o; } }
  return best;
}
const groundAt = (x, y) => { const p = dropTo(G.map.geo, x, y - 40); return p ? p.y : y; };
const castSfx = (el) => ({ fire: 'cast_fire', cold: 'cast_cold', light: 'cast_light', holy: 'cast_holy', shadow: 'cast_shadow', blood: 'cast_shadow', poison: 'cast_poison', acid: 'cast_poison', arcane: 'cast_arcane', astral: 'cast_arcane' }[el] || 'cast');

export function cast(a, sk, target) {
  if (!ready(a, sk)) return false;
  const rank = Math.max(1, a.rank(sk.id)), m = sk.m;
  a.mp -= costOf(a, sk);
  const as = a.stats.asMul || 1, ut = useTime(sk) / as;
  a.cd[sk.id] = Math.max(cooldown(sk), ut * 0.95);
  a.useT = Math.max(0.12, ut * (sk.kind === 'buff' || sk.kind === 'summon' ? 0.6 : 0.8));
  if (target && a.enemyOf(target) && Math.abs(target.x - a.x) > 6) a.body.face = target.x > a.x ? 1 : -1;
  if (target) a.target = target;
  if (MELEE_KINDS.has(sk.kind) || sk.attack) a.lunge = 1; else a.castT = 1;
  if (!MELEE_KINDS.has(sk.kind)) { const c = elemRgb(sk.el); G.parts.burst(a.x + a.face * 22, a.cy - 6, 6, { shape: 'glow', speed: 90, life: 0.35, size: 16, col: c }); }
  sfxAt(sk.kind === 'melee' ? (m.cleave || m.n > 2 ? 'swing_heavy' : 'swing') : sk.kind === 'proj' && sk.attack ? 'shoot' : sk.kind === 'buff' ? 'buff' : sk.kind === 'heal' ? 'heal' : sk.kind === 'summon' ? 'summon' : sk.kind === 'dash' || sk.kind === 'blink' ? 'dash' : castSfx(sk.el), a, a.isPlayer ? 0.9 : 0.35);
  if (a.isPlayer && sk.row >= 1 && sk.id !== a.data.basic) G.floaters.push({ x: a.x, y: a.y - a.h - 26, str: null, word: sk.name, color: ELEM[sk.el]?.glow || '#fff', t: 0, scale: 1 });
  (KIND[sk.kind] || KIND.proj)(a, sk, rank, m, target);
  return true;
}

const dm = (a, sk, mul = 1) => () => skillHit(a, sk, mul);
const KIND = {
  melee(a, sk, rank, m) {
    const n = Math.min(8, m.n || 1), around = m.arc >= 300 || m.spin, wide = m.cleave || m.arc || around;
    const rx = reach(sk), col = elemRgb(sk.el), thrust = /thrust|spear|javelin|lance|dagger/.test(sk.fx);
    let left = n, t = 0;
    const strike = () => {
      const f = a.face, list = around ? inBox(a, a.x - rx, a.x + rx, a.y - a.h - 40, a.y + 20, 8) : inBox(a, a.x - 18 * f, a.x + rx * f, a.y - a.h - 34, a.y + 24, wide ? 6 : n > 1 ? 2 : 3);
      for (const tg of list) { const d = skillHit(a, sk, n > 1 ? 1 : 1); hit(a, tg, d.amount, { ...hopts(sk), el: sk.el, crit: d.crit, dir: around ? Math.sign(tg.x - a.x) || f : f }); if (m.exp) blast({ owner: a, x: tg.x, y: tg.cy, r: 1.3 * TILE, dmg: dm(a, sk, 0.5), el: sk.el, hopts: {}, skip: tg, quiet: true }); }
      const up = (n - left) % 2 === 1;
      if (thrust) flashFx({ shape: 'thrust', follow: a, ox: f * (rx * 0.55), oy: -6 + rnd(-8, 8), w: rx * 1.25, h: 34, flip: f < 0, col, dur: 0.14 });
      else flashFx({ shape: 'slash', follow: a, ox: f * (around ? 0 : rx * 0.42), oy: -4, w: rx * (around ? 2.1 : 1.35), h: (around ? 1.0 : 1.25) * Math.max(100, rx * 0.9), flip: f < 0, rot: (up ? 0.5 : -0.25) * f, col, dur: 0.17, grow: 0.2, a: 0.72 });
      if (around) flashFx({ shape: 'slash', follow: a, ox: 0, oy: -4, w: rx * 2.1, h: rx, flip: f > 0, col, dur: 0.17, grow: 0.2, a: 0.72 });
      a.lunge = Math.max(a.lunge, 0.75);
    };
    strike(); left--;
    if (left > 0) G.effects.push({ upd(dt) { if (a.dead) return false; t += dt; while (t >= 0.085 && left > 0) { t -= 0.085; left--; strike(); sfxAt('swing', a, 0.4); } return left > 0; }, draw() {} });
  },
  proj(a, sk, rank, m, target) {
    const n = Math.min(24, m.n || 1), tg = target && a.enemyOf(target) ? target : aim(a, reach(sk) * 1.1), f = a.face;
    const sp = clamp((m.spd || 11) * TILE * 1.05, 420, 1050), range = reach(sk);
    let base = 0; if (tg) base = clamp(Math.atan2(tg.cy - (a.cy - 8), Math.abs(tg.x - a.x) + 1), -0.65, 0.65);
    const full = m.ring || m.nova;
    const step = full ? (Math.PI * 2) / n : Math.min(0.16, (m.spread ? 0.9 : 0.5) / Math.max(1, n - 1));
    for (let i = 0; i < n; i++) {
      const off = full ? i * step : (i - (n - 1) / 2) * step, ang = base + off;
      const vx = Math.cos(ang) * sp * (full ? 1 : f), vy = Math.sin(ang) * sp;
      spawnProj({ owner: a, x: a.x + f * 26, y: a.cy - 8, vx, vy: vy + (m.lob ? -260 : 0), grav: m.lob ? 900 : 0, dmg: dm(a, sk), el: sk.el, fx: sk.fx, hopts: hopts(sk), range,
        pierce: !!m.pierce, home: !!m.home, exp: m.exp ? 1.5 * TILE : 0, bounce: m.bounce || (m.ricochet ? Math.min(m.ricochet, 2 + Math.floor((rank - 1) / 4)) : 0) || (m.chain ? 3 : 0), ret: !!m.ret, size: /meteor|fireball|comet|sun|quasar|nuke|rocket/.test(sk.fx) ? 1.5 : 1 });
    }
  },
  nova(a, sk, rank, m) {
    const r = 3.1 * TILE * (m.r ?? 1), col = elemRgb(sk.el);
    blast({ owner: a, x: a.x, y: a.cy, r, ry: r * 0.62, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), pull: !!m.pull, big: sk.row > 0, max: 14 });
    flashFx({ shape: 'ring', x: a.x, y: a.cy, w: r * 1.2, h: r * 0.75, col, dur: 0.3, grow: 0.9 });
    if (m.heal) for (const f of friends(a, r)) heal(f, f.maxHp * 0.08);
  },
  aoe(a, sk, rank, m, target) {
    const tg = target && a.enemyOf(target) ? target : aim(a, reach(sk)), n = Math.min(8, m.n || 1), r = 2.1 * TILE * (m.r ?? 1);
    const x = tg ? tg.x : a.x + a.face * 4 * TILE, y = tg ? tg.cy : a.cy;
    for (let i = 0; i < n; i++) blast({ owner: a, x: x + (n > 1 ? rnd(-r * 0.5, r * 0.5) : 0), y, r, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), delay: (m.delay ?? 0.22) + i * ((m.dur || n * 0.45) / n), big: true, pillar: /pillar|star|meteor|holy|smash|sun|hammer/.test(sk.fx) });
  },
  corpse(a, sk, rank, m, target) { KIND.aoe(a, sk, rank, { ...m, r: (m.r ?? 1) * 1.15 }, target); },
  beam(a, sk, rank, m) {
    const dur = m.dur || 1.2, ticks = Math.max(3, Math.round(dur / 0.2));
    beam({ owner: a, dur, len: reach(sk), thick: m.cone ? 70 : 30, dmg: dm(a, sk, 2.4 / ticks), el: sk.el, hopts: hopts(sk), tick: dur / ticks });
    a.useT = Math.max(a.useT, dur * 0.55);
  },
  chain(a, sk, rank, m, target) {
    let tg = target && a.enemyOf(target) ? target : aim(a, reach(sk)); if (!tg) { puff(a.x + a.face * 60, a.cy, elemRgb(sk.el)); return; }
    const seen = new Set(), pts = [[a.x + a.face * 22, a.cy - 8]]; let mul = 1;
    for (let i = 0; i < (m.n || 5) && tg; i++) { seen.add(tg); pts.push([tg.x, tg.cy]); const d = skillHit(a, sk, mul); hit(a, tg, d.amount, { ...hopts(sk), el: sk.el, crit: d.crit }); mul *= 0.88; tg = nearestFoe(a, tg.x, tg.cy, 5 * TILE, seen); }
    chainFx(pts, sk.el);
  },
  wall(a, sk, rank, m, target) {
    const tg = target && a.enemyOf(target) ? target : aim(a, reach(sk)), x = tg ? tg.x : a.x + a.face * 3 * TILE;
    zone({ owner: a, x, y: groundAt(x, tg ? tg.y : a.y), rx: 1.7 * TILE * (m.r ?? 1), ry: 120, dur: m.dur || 4, tick: 0.5, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), style: 'wall' });
  },
  zone(a, sk, rank, m, target) {
    const self = m.follow || m.at === 'self' || m.heal, tg = self ? null : (target && a.enemyOf(target) ? target : aim(a, reach(sk))), x = tg ? tg.x : a.x;
    zone({ owner: a, x, y: groundAt(x, tg ? tg.y : a.y), rx: 2.6 * TILE * (m.r ?? 1), ry: 90, dur: m.dur || 5, tick: 0.5, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), follow: m.follow ? a : null, heal: m.heal ? 0.015 : 0, style: 'field' });
  },
  trap(a, sk, rank, m) { const n = Math.min(4, m.n || 1); for (let i = 0; i < n; i++) { const x = a.x + a.face * (40 + i * 70); zone({ owner: a, x, y: groundAt(x, a.y), rx: 2 * TILE * (m.r ?? 1), dur: 25, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), style: 'trap' }); } },
  orbit(a, sk, rank, m) { orbit({ owner: a, n: Math.min(10, m.n || 3), dur: m.dur || 6, radius: m.spiral ? 50 : 1.6 * TILE * (m.r ?? 1), grow: m.spiral ? 85 : 0, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk) }); },
  cyclone(a, sk, rank, m) { const n = Math.min(4, m.n || 1); for (let i = 0; i < n; i++) cyclone({ owner: a, x: a.x + a.face * (50 + i * 40), y: a.y, dir: i % 2 && n > 1 ? -a.face : a.face, speed: (m.spd || 3.2) * TILE * (1 + i * 0.15), dur: m.dur || 3.5, r: 1.1 * TILE * (m.r ?? 1), dmg: dm(a, sk), el: sk.el, hopts: hopts(sk) }); },
  whirl(a, sk, rank, m) {
    const dur = m.dur || 2, r = 1.9 * TILE * (m.r ?? 1), col = elemRgb(sk.el); let t = 0, tk = 0; a.useT = 0.1; a.whirl = dur;
    G.effects.push({ upd(dt) { if (a.dead) return false; t += dt; tk -= dt; a.spin = 1; a.whirl = dur - t; if (tk <= 0) { tk += 0.24; for (const tg of inEllipse(a, a.x, a.cy, r, 80, 8)) { const d = skillHit(a, sk); hit(a, tg, d.amount, { ...hopts(sk), el: sk.el, crit: d.crit, kb: 0.3 }); } flashFx({ shape: 'slash', follow: a, ox: 0, oy: 0, w: r * 2, h: r * 0.9, flip: (t * 8 | 0) % 2 === 0, col, dur: 0.2 }); sfxAt('swing', a, 0.3); } return t < dur; }, draw() {} });
  },
  leap(a, sk, rank, m, target) {
    const tg = target && a.enemyOf(target) ? target : aim(a, reach(sk), 260), b = a.body, dx = tg ? clamp(tg.x - a.x, -6.5 * TILE, 6.5 * TILE) : a.face * 4 * TILE;
    b.plat = null; b.rope = null; b.vy = -760; b.vx = dx / 0.52; a.inv = Math.max(a.inv, 0.6); a.hurtInv = false; a.useT = 0.5; let t = 0; a.leaping = true;
    G.effects.push({ upd(dt) { t += dt; if (a.dead) return false; if (t < 0.12 || !b.plat) { if (t > 1.6) { a.leaping = false; return false; } b.vx = dx / 0.52; return true; }
      a.leaping = false; b.vx = 0; a.squash = -0.25; blast({ owner: a, x: a.x, y: a.y - 30, r: 2.3 * TILE * (m.r ?? 1), ry: 90, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), big: true }); return false; }, draw() {} });
  },
  dash(a, sk, rank, m) {
    const dist = 4.6 * TILE * (m.range ?? 1), dur = 0.2, f = a.face, seen = new Set(), col = elemRgb(sk.el); let t = 0; a.inv = Math.max(a.inv, 0.3); a.hurtInv = false; a.useT = dur;
    G.effects.push({ upd(dt) { if (a.dead) return false; t += dt; a.body.vx = f * dist / dur; a.lunge = 1;
      for (const tg of inBox(a, a.x - 30, a.x + f * 60, a.y - a.h - 20, a.y + 20, 8)) { if (seen.has(tg)) continue; seen.add(tg); const d = skillHit(a, sk); hit(a, tg, d.amount, { ...hopts(sk), el: sk.el, crit: d.crit, dir: f }); if (m.exp) blast({ owner: a, x: tg.x, y: tg.cy, r: 1.3 * TILE, dmg: dm(a, sk, 0.5), el: sk.el, hopts: {}, skip: tg, quiet: true }); }
      G.parts.add({ shape: 'thrust', x: a.x - f * 30, y: a.cy, life: 0.25, size: 120, asp: 0.5, col, rot: f > 0 ? 0 : Math.PI });
      if (t >= dur) { a.body.vx = f * 120; return false; } return true; }, draw() {} });
  },
  blink(a, sk, rank, m, target) {
    const tg = target && a.enemyOf(target) ? target : aim(a, reach(sk), 300), geo = G.map.geo, col = elemRgb(sk.el), ox = a.x, oy = a.cy;
    let nx = tg ? tg.x - Math.sign(tg.x - a.x || 1) * 60 : a.x + a.face * 5 * TILE; nx = clamp(nx, 50, geo.w - 50);
    const p = tg && tg.body.plat ? tg.body.plat : (a.body.plat && nx >= a.body.plat.x1 && nx <= a.body.plat.x2 ? a.body.plat : dropTo(geo, nx, a.y - 30));
    puff(ox, oy, col, 10);
    if (p) { a.body.x = clamp(nx, p.x1 + 10, p.x2 - 10); a.body.y = p.y; a.body.plat = p; a.body.vx = a.body.vy = 0; a.body.rope = null; }
    a.spawnT = 0.15; a.inv = Math.max(a.inv, 0.25); a.hurtInv = false; puff(a.x, a.cy, col, 10);
    flashFx({ shape: 'thrust', x: (ox + a.x) / 2, y: oy, w: Math.abs(a.x - ox) + 40, h: 30, flip: a.x < ox, col, dur: 0.22 });
    if ((m.dmg ?? 1) > 0 && tg) blast({ owner: a, x: a.x, y: a.cy, r: 1.6 * TILE, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk) });
  },
  rain(a, sk, rank, m, target) {
    const tg = target && a.enemyOf(target) ? target : aim(a, reach(sk)), n = Math.min(30, m.n || 12), R = 3 * TILE * (m.r ?? 1), cx = tg ? tg.x : a.x + a.face * 4 * TILE, cy = tg ? tg.y : a.y;
    for (let i = 0; i < n; i++) { const x = cx + rnd(-R, R), gy = groundAt(x, cy); blast({ owner: a, x, y: gy - 30, r: 1.05 * TILE, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), delay: 0.25 + i * (1.5 / n), pillar: true, quiet: i % 3 !== 0 }); }
  },
  strike(a, sk, rank, m) {
    const n = Math.min(12, m.n || 3), list = foes(a).filter(o => Math.abs(o.x - a.x) < 8 * TILE && Math.abs(o.cy - a.cy) < 320).sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
    for (let i = 0; i < n; i++) { const tg = list.length ? list[i % list.length] : null; if (!tg && i > 2) break; if (tg && i >= list.length * 3) break; const x = tg ? tg.x : a.x + a.face * (100 + i * 80), y = tg ? tg.cy : a.cy; blast({ owner: a, x, y, r: 1.1 * TILE, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), delay: 0.12 + i * 0.1, pillar: true, big: i === 0 }); }
  },
  fissure(a, sk, rank, m) {
    const f = a.face, steps = Math.round(9 * (m.range ?? 1)), y0 = a.y, plat = a.body.plat; let i = 0, t = 0;
    G.effects.push({ upd(dt) { t += dt; while (t >= 0.06 && i < steps) { t -= 0.06; i++; const x = a.x0 + f * i * 0.85 * TILE; if (x < 30 || x > G.map.geo.w - 30) return false; const gy = groundAt(x, y0); if (Math.abs(gy - y0) > 100) return false; blast({ owner: a, x, y: gy - 28, r: 0.95 * TILE, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), quiet: i % 3 !== 0, pillar: i % 2 === 0 }); } return i < steps; }, draw() {} });
    a.x0 = a.x;
  },
  heal(a, sk, rank, m) { const amt = (0.2 + 0.012 * rank) * (m.amt ? m.amt / 25 : 1); const list = m.party || true ? friends(a, 600) : [a]; for (const f of list) if (f.kind === 'hero' || f === a) heal(f, f.maxHp * amt); },
  buff(a, sk, rank, m) {
    const amt = buffAmount(sk, rank), dur = skillDuration(sk, rank), stat = {};
    for (const k of m.buff || ['dmg']) stat[k] = (stat[k] || 0) + (k === 'regen' ? amt * 0.5 : k === 'leech' ? Math.max(2, amt * 0.15) : k === 'block' ? amt * 0.5 : k === 'speed' ? Math.min(40, amt * 0.6) : k === 'crit' ? amt * 0.5 : amt);
    const col = elemRgb(sk.el), list = m.party ? friends(a, 700).filter(f => f.kind === 'hero') : [a];
    for (const f of list) {
      const old = f.buffs.findIndex(b => b.id === sk.id); if (old >= 0) f.buffs.splice(old, 1);
      f.buffs.push({ id: sk.id, name: sk.name, stat, t: dur, dur, el: sk.el, aura: m.transform ? col : null });
      if (f.recompute) f.recompute();
      pillarFx({ follow: f, col, dur: 0.6, w: 70 }); if (f !== a && f.isPlayer) floater(f.x, f.cy - 60, null, 'x');
    }
    if (m.pulse || (sk.el !== 'holy' && (m.slow || m.burn))) { let t = 0, tk = 1; const r = 2.4 * TILE; G.effects.push({ upd(dt) { if (a.dead) return false; t += dt; tk -= dt; if (tk <= 0) { tk += 1; blast({ owner: a, x: a.x, y: a.cy, r, ry: r * 0.6, dmg: dm(a, sk), el: sk.el, hopts: hopts(sk), quiet: true }); } return t < dur; }, draw() {} }); }
  },
  curse(a, sk, rank, m, target) {
    const self = m.at === 'self', tg = self ? null : (target && a.enemyOf(target) ? target : aim(a, reach(sk))), x = tg ? tg.x : a.x, y = tg ? tg.cy : a.cy;
    const r = 3.4 * TILE * (m.r ?? 1), dur = skillDuration(sk, rank), col = elemRgb(sk.el), kinds = m.curse || ['amp'];
    for (const t of inEllipse(a, x, y, r, r * 0.6, 12)) {
      const d = skillHit(a, sk); hit(a, t, d.amount, { el: sk.el, crit: d.crit, kb: 0, silent: true });
      for (const k of kinds) { if (k === 'slow') t.status.slow = dur; else if (k === 'weaken') t.status.weaken = dur; else if (k === 'fear') t.status.fear = t.boss ? 0 : Math.min(3, dur); else if (k === 'stun' || k === 'charm' || k === 'confuse') { if (!t.boss) t.status.stun = 1.4; } else if (k === 'freeze') { if (!t.boss) t.status.freeze = 1.6; } else if (k === 'decay' || k === 'doom' || k === 'bomb') t.dots.push({ t: Math.min(8, dur), tick: 0.5, dmg: d.amount * 0.35, el: sk.el, src: a }); else t.status.amp = dur; }
      G.parts.burst(t.x, t.cy - t.h * 0.4, 5, { shape: 'skull', speed: 50, life: 0.9, size: 16, col, g: -60, add: 0.3 });
    }
    flashFx({ shape: 'rune', x, y: y + 30, w: r * 1.1, h: r * 0.34, col, dur: 0.6, grow: 0.25, a: 0.6 });
  },
  summon(a, sk, rank, m) {
    const key = m.sum, S = SUMMONS[key]; if (!S) { KIND.buff(a, sk, rank, m); return; }
    const n = Math.min(8, m.n || 1), cap = Math.min(10, m.max || Math.max(n, 3));
    const mine = a.summons.filter(s => !s.dead && s.skId === sk.id);
    while (mine.length + n > cap && mine.length) { const old = mine.shift(); old.hp = 0; old.dead = true; old.deadT = 0; }
    for (let i = 0; i < n; i++) spawnSummon(a, sk, S, m.dur || 35, i, n);
  },
};

export function spawnSummon(owner, sk, S, dur, i = 0, n = 1) {
  const look = S.look || {}; let art = look.art; if (Array.isArray(art)) art = pick(art);
  let def = art && mobDef(art);
  if (owner.cls === 'slime_lord' || (look.sprite === 'slime')) { const kind = (sk.m.sum || '').replace(/^sl_/, ''), all = BEST.groups.slimes || []; const fit = all.filter(d => d.tag === kind); const pool = fit.length ? fit : all; if (pool.length) def = pool[(owner.uid * 7 + (sk.idx || 0) * 3 + Math.floor(Math.random() * pool.length)) % pool.length]; }
  if (!def) def = mobDef(S.ai === 'ranged' ? 'ns_archer' : 'ns_warrior');
  const still = !S.spd || S.spd <= 0;
  const s = new Actor('summon', owner.x + owner.face * (50 + i * 34) * (i % 2 ? -1 : 1), owner.y - 4);
  s.team = owner.team; s.owner = owner; s.skId = sk.id; s.name = S.name; s.lvl = owner.lvl; s.S = S; s.sk = sk; s.def = def; s.still = still;
  const hw = clamp(look.h ? look.h * 1.8 : def.hw * 0.9, 44, 150);
  s.h = hw; s.w = Math.max(30, def.ww * hw / def.hw * 0.6); s.sprite = mobSprite(def, 'map'); if (!def.slime) s.sprite = { ...s.sprite, k: hw / (s.sprite.h || def.h) }; else { s.h = Math.max(40, def.hw); s.w = 40; }
  s.maxHp = s.hp = Math.round(owner.maxHp * clamp(S.hp || 0.4, 0.15, 3)); s.life = dur; s.atkT = rnd(0.2, 0.8);
  s.stats.speed = still ? 0 : clamp((S.spd || 3) / 3.2, 0.6, 1.3); s.stats.armor = owner.stats.armor * 0.5;
  s.body.fly = /hawk|raven|bird|drone|wraith|wyvern|whelp|cloud|skull|lantern|rune/.test(sk.m.sum || '') && !still;
  s.body.place(G.map.geo, clamp(s.x, 50, G.map.geo.w - 50), owner.y - 30); if (s.body.fly) { s.body.plat = null; s.body.y = owner.y - 120; }
  s.aura = sk.el !== 'phys' ? elemRgb(sk.el).map(v => v * 0.6) : null;
  owner.summons.push(s); G.actors.push(s);
  puff(s.x, s.cy, elemRgb(sk.el), 10);
  return s;
}
/** Per-frame brain for a summon: stay near the owner, strike what it can reach. */
export function tickSummon(s, dt) {
  const o = s.owner, S = s.S; s.life -= dt;
  if (s.life <= 0 || !o || o.dead && s.life > 2) { s.dead = true; s.deadT = 0; return; }
  const ranged = S.ai === 'ranged' || (S.atk && S.atk.type !== 'melee') || s.still, range = ranged ? 7 * TILE : 70 + s.w * 0.5;
  let tg = s.target; if (!tg || tg.dead || Math.abs(tg.x - s.x) > 9 * TILE) tg = s.target = nearestFoe(s, s.x, s.cy, 8 * TILE, null, s.body.fly || ranged ? 330 : 150);
  let move = 0; const want = {};
  if (!s.still) {
    if (tg) { const dx = tg.x - s.x; if (Math.abs(dx) > range * 0.85) move = Math.sign(dx); else s.body.face = dx > 0 ? 1 : -1; if (s.body.fly) { want.up = tg.cy < s.cy - 20; want.down = tg.cy > s.cy + 20; } }
    else { const dx = o.x - o.face * 70 - s.x; if (Math.abs(dx) > 90) move = Math.sign(dx); if (s.body.fly) { want.up = o.cy - 70 < s.cy - 20; want.down = o.cy - 70 > s.cy + 20; } }
    if (Math.abs(o.x - s.x) > 900 || (!s.body.fly && Math.abs(o.y - s.y) > 260 && o.body.plat)) { s.body.place(G.map.geo, o.x - o.face * 50, o.y - 20); s.spawnT = 0.2; }
  } else if (tg) s.body.face = tg.x > s.x ? 1 : -1;
  if (s.status.stun > 0 || s.status.freeze > 0) move = 0;
  s.body.step(G.map.geo, dt, move, want);
  s.atkT -= dt;
  if (tg && s.atkT <= 0 && Math.abs(tg.x - s.x) <= range && Math.abs(tg.cy - s.cy) < (ranged ? 300 : 130)) {
    const A = S.atk || { type: 'melee', cd: 1 }; s.atkT = (A.cd || 1) * rnd(0.9, 1.15); s.lunge = 1;
    const dmgf = () => skillHit(o, s.sk, clamp(S.dmg || 1, 0.3, 2.5) * 0.9), el = A.el || S.el || s.sk.el, ho = { burn: !!A.burn, bleed: !!A.bleed, slow: A.slow ? 2 : 0, kb: 0.3 };
    if (A.type === 'heal' || A.type === 'buff') { for (const f of friends(s, 500)) if (f.kind === 'hero') heal(f, f.maxHp * 0.04, true); puff(s.x, s.cy, [0.4, 1, 0.5], 8); }
    else if (ranged && A.type !== 'nova') { const ang = Math.atan2(tg.cy - s.cy, tg.x - s.x), sp = 680; if (A.type === 'chain' || A.type === 'beam' || A.type === 'strike') { const d = dmgf(); hit(o, tg, d.amount, { ...ho, el, crit: d.crit }); if (A.type === 'strike') blast({ owner: o, x: tg.x, y: tg.cy, r: 60, dmg: () => ({ amount: 0.0001 }), el, pillar: true, quiet: true }); else chainFx([[s.x, s.cy], [tg.x, tg.cy]], el); } else spawnProj({ owner: s, x: s.x, y: s.cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, dmg: dmgf, el, fx: A.fx || 'orb', hopts: ho, range: 8 * TILE, pierce: !!A.pierce }); }
    else if (A.type === 'nova') blast({ owner: s, x: s.x, y: s.cy, r: 2 * TILE, dmg: dmgf, el, hopts: ho });
    else { const d = dmgf(); hit(s, tg, d.amount, { ...ho, el: 'phys', crit: d.crit }); }
  }
}
export const skillById = (id) => SKILLS[id];
