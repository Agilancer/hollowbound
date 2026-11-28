// Effect primitives shared by hero skills, summons and monsters: projectiles, blasts,
// ground zones, beams, chains, orbiters. Each effect is { upd(dt) -> alive?, draw(rd) }.
import { G, rnd, clamp } from '../state.js';
import { SHAPES } from '../gfx/fx.js';
import { hit, heal, elemRgb, elemCore, sfxAt } from './combat.js';
import { dropTo } from './body.js';

const TAU = Math.PI * 2;
export const foes = (a) => { const out = []; for (const o of G.actors) if (a.enemyOf(o)) out.push(o); return out; };
export const friends = (a, r = 700) => { const out = []; for (const o of G.actors) if (!o.dead && o.team === a.team && (o.kind === 'hero' || o.kind === 'summon') && Math.abs(o.x - a.x) < r && Math.abs(o.y - a.y) < r * 0.6) out.push(o); return out; };
/** Enemies whose body overlaps an ellipse. */
export function inEllipse(a, x, y, rx, ry, max = 99) {
  const out = [];
  for (const o of G.actors) {
    if (!a.enemyOf(o)) continue;
    const dx = Math.max(0, Math.abs(o.x - x) - o.w * 0.5) / rx, dy = Math.max(0, Math.abs(o.cy - y) - o.h * 0.5) / ry;
    if (dx * dx + dy * dy <= 1) { o._d = Math.abs(o.x - x); out.push(o); }
  }
  if (out.length > max) { out.sort((p, q) => p._d - q._d); out.length = max; }
  return out;
}
export function inBox(a, x1, x2, y1, y2, max = 99) {
  const out = []; if (x1 > x2) { const t = x1; x1 = x2; x2 = t; }
  for (const o of G.actors) { if (!a.enemyOf(o)) continue; if (o.x + o.w * 0.5 >= x1 && o.x - o.w * 0.5 <= x2 && o.y >= y1 && o.y - o.h <= y2) { o._d = Math.abs(o.x - a.x); out.push(o); } }
  if (out.length > max) { out.sort((p, q) => p._d - q._d); out.length = max; }
  return out;
}
export function nearestFoe(a, x, y, range, skip, yTol = 1e9) {
  let best = null, bd = range;
  for (const o of G.actors) { if (!a.enemyOf(o) || (skip && skip.has(o))) continue; if (Math.abs(o.cy - y) > yTol) continue; const d = Math.hypot(o.x - x, (o.cy - y) * 1.6); if (d < bd) { bd = d; best = o; } }
  return best;
}
const add = (e) => { G.effects.push(e); return e; };
/** How loudly an effect is drawn: yours, your party's and the monsters' at full strength, bystanders' quietly. */
export const loud = (o) => { const r = o && (o.owner || o); return !r || r.kind === 'mob' || r.isPlayer || r.inParty && !(G.map.instance && G.map.instance.raid) ? 1 : 0.38; };

// ------------------------------------------------------------------ element dressing
const KIND_OF = (el) => (el === 'fire' ? 'fire' : el === 'cold' ? 'cold' : el === 'light' ? 'light' : el === 'poison' || el === 'acid' ? 'tox' : el === 'shadow' || el === 'blood' ? 'dark' : el === 'holy' ? 'holy' : el === 'phys' ? 'phys' : 'arc');
/** What a spell leaves behind it as it flies. */
export function elemTrail(el, x, y, s = 1, vx = 0, vy = 0) {
  const P = G.parts, col = elemRgb(el), core = elemCore(el), k = KIND_OF(el);
  if (k === 'fire') { P.add({ shape: 'flame', x: x + rnd(-5, 5) * s, y: y + rnd(-5, 5) * s, vx: -vx * 0.12 + rnd(-20, 20), vy: -rnd(30, 90), life: rnd(0.22, 0.4), size: rnd(16, 26) * s, size2: 4, asp: 1.5, col: [1, rnd(0.35, 0.7), 0.08], rot: rnd(-0.4, 0.4) }); if (Math.random() < 0.5) P.add({ shape: 'dot', x, y, vx: rnd(-60, 60), vy: rnd(-90, 20), g: 260, life: rnd(0.4, 0.8), size: rnd(2, 4), col: [1, 0.8, 0.3] }); if (Math.random() < 0.25) P.add({ shape: 'smoke', x, y, vy: -40, life: 0.7, size: 18 * s, size2: 46 * s, col: [0.1, 0.08, 0.08], add: 0, a: 0.35 }); }
  else if (k === 'cold') { P.add({ shape: 'glow', x, y, life: 0.3, size: 16 * s, size2: 3, col, a: 0.7 }); if (Math.random() < 0.6) P.add({ shape: 'shard', x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-40, 40), vy: rnd(-20, 60), g: 200, life: rnd(0.3, 0.6), size: rnd(4, 8), col: core, add: 0.4, spin: rnd(-8, 8) }); if (Math.random() < 0.3) P.add({ shape: 'smoke', x, y, life: 0.6, size: 14, size2: 40, col: [0.6, 0.8, 1], a: 0.18 }); }
  else if (k === 'light') { P.add({ shape: 'zap', x, y, life: 0.09, size: rnd(40, 70) * s, asp: 0.25, col: Math.random() < 0.5 ? core : col, rot: rnd(0, 6.28) }); P.add({ shape: 'glow', x, y, life: 0.15, size: 22 * s, size2: 4, col }); }
  else if (k === 'tox') { P.add({ shape: 'glow', x, y, life: 0.3, size: 14 * s, size2: 3, col, a: 0.7 }); if (Math.random() < 0.6) P.add({ shape: 'dot', x, y, vx: rnd(-30, 30), vy: rnd(0, 60), g: 500, life: 0.6, size: rnd(3, 6), col, add: 0.5 }); }
  else if (k === 'dark') { P.add({ shape: 'smoke', x: x + rnd(-4, 4), y: y + rnd(-4, 4), vx: -vx * 0.1, vy: -vy * 0.1 - 20, life: 0.45, size: 16 * s, size2: 40 * s, col: [col[0] * 0.5, col[1] * 0.3, col[2] * 0.6], add: 0.35, a: 0.6 }); P.add({ shape: 'glow', x, y, life: 0.2, size: 12 * s, size2: 2, col }); }
  else if (k === 'holy') { P.add({ shape: 'glow', x, y, life: 0.28, size: 16 * s, size2: 3, col, a: 0.8 }); if (Math.random() < 0.5) P.add({ shape: 'star', x: x + rnd(-8, 8), y: y + rnd(-8, 8), vy: -30, life: 0.45, size: rnd(6, 13), size2: 1, col: core, spin: rnd(-5, 5) }); }
  else if (k === 'arc') { P.add({ shape: 'glow', x, y, life: 0.3, size: 15 * s, size2: 2, col, a: 0.8 }); if (Math.random() < 0.5) P.add({ shape: 'star', x: x + rnd(-10, 10), y: y + rnd(-10, 10), life: 0.35, size: rnd(5, 10), size2: 1, col: core, spin: 6 }); }
  else P.add({ shape: 'glow', x, y, life: 0.2, size: 10 * s, size2: 2, col, a: 0.5 });
}
/** What a spell does where it lands. */
export function elemBurst(el, x, y, r, big) {
  const P = G.parts, col = elemRgb(el), core = elemCore(el), k = KIND_OF(el), n = big ? 1.6 : 1;
  if (k === 'fire') { for (let i = 0; i < 9 * n; i++) P.add({ shape: 'flame', x: x + rnd(-r, r) * 0.6, y: y + rnd(-r, r) * 0.25, vy: -rnd(120, 340), vx: rnd(-80, 80), life: rnd(0.3, 0.65), size: rnd(26, 52), size2: 6, asp: 1.5, col: [1, rnd(0.3, 0.7), 0.06] }); P.burst(x, y, 10 * n, { shape: 'dot', speed: r * 3.4, life: 0.8, size: 4, col: [1, 0.75, 0.25], g: 500 }); for (let i = 0; i < 3 * n; i++) P.add({ shape: 'smoke', x: x + rnd(-r, r) * 0.5, y, vy: -rnd(40, 90), life: 1.1, size: 40, size2: 110, col: [0.09, 0.07, 0.07], add: 0, a: 0.5, front: false }); }
  else if (k === 'cold') { P.burst(x, y, 12 * n, { shape: 'shard', speed: r * 3.2, life: 0.55, size: 11, col: core, add: 0.35, g: 500, spin: 9 }); for (let i = 0; i < 4 * n; i++) P.add({ shape: 'smoke', x: x + rnd(-r, r) * 0.6, y: y + rnd(-10, 10), vx: rnd(-50, 50), life: 0.9, size: 30, size2: 90, col: [0.6, 0.82, 1], a: 0.22 }); }
  else if (k === 'light') { for (let i = 0; i < 7 * n; i++) P.add({ shape: 'zap', x, y, life: rnd(0.08, 0.2), size: r * rnd(1.2, 2.2), asp: 0.25, col: i % 2 ? core : col, rot: rnd(0, 6.28) }); P.burst(x, y, 8, { shape: 'spark', speed: r * 4, life: 0.25, size: 26, col: core, orient: true }); }
  else if (k === 'tox') { P.burst(x, y, 12 * n, { shape: 'dot', speed: r * 2.6, life: 0.7, size: 6, col, g: 700, add: 0.5 }); for (let i = 0; i < 4 * n; i++) P.add({ shape: 'smoke', x: x + rnd(-r, r) * 0.5, y, vy: -30, life: 1.2, size: 30, size2: 100, col: [col[0] * 0.5, col[1] * 0.6, col[2] * 0.3], add: 0.2, a: 0.4 }); }
  else if (k === 'dark') { for (let i = 0; i < 6 * n; i++) P.add({ shape: 'smoke', x: x + rnd(-r, r) * 0.5, y: y + rnd(-r, r) * 0.3, vx: rnd(-60, 60), vy: -rnd(20, 80), life: 0.9, size: 30, size2: 90, col: [col[0] * 0.45, col[1] * 0.25, col[2] * 0.55], add: 0.3, a: 0.6 }); P.burst(x, y, 4 * n, { shape: 'skull', speed: 70, life: 0.8, size: 15, col, add: 0.3, g: -80 }); }
  else if (k === 'holy') { P.burst(x, y, 10 * n, { shape: 'star', speed: r * 2.6, life: 0.6, size: 15, col: core, spin: 6, drag: 2 }); G.parts.add({ shape: 'pillar', x, y: y - 120, life: 0.35, size: 46, asp: 6, col, a: 0.7 }); }
  else if (k === 'arc') { P.burst(x, y, 10 * n, { shape: 'star', speed: r * 2.8, life: 0.5, size: 12, col: core, spin: 8, drag: 2.5 }); P.burst(x, y, 6, { shape: 'spark', speed: r * 3.6, life: 0.3, size: 28, col, orient: true }); }
}

// ------------------------------------------------------------------ projectiles
const SHAPE_OF = (fx) => (/arrow|javelin|spear|thrust|kunai|dagger|lance/.test(fx) ? 'arrow' : /bullet|rocket/.test(fx) ? 'bulletS' : /bolt|laser|lightning|spark|shock|beam|pulsar|starline/.test(fx) ? 'bolt'
  : /shard|frost|ice|bone|spike|thorn|feather|caltrop/.test(fx) ? 'shard' : /rang|chakram|shuriken|blade|axe|hammer|shield|disc|claw/.test(fx) ? 'spinner' : /^n_|note/.test(fx) ? 'note' : 'orb');
/** o: { owner, x, y, vx, vy, dmg:()=>({amount,crit}), el, fx, hopts, range, pierce, home, exp, bounce, ret, grav, size, onHit } */
export function spawnProj(o) {
  const shape = SHAPE_OF(o.fx || 'orb'), col = elemRgb(o.el), core = elemCore(o.el), owner = o.owner, PL = loud(owner);
  const e = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, dist: 0, range: o.range || 620, hitSet: new Set(), bounce: o.bounce || 0, back: false, rot: 0, t: 0, size: o.size || 1, dead: false };
  e.upd = (dt) => {
    e.t += dt;
    if (o.home && !e.back) { const tg = nearestFoe(owner, e.x, e.y, 420, e.hitSet); if (tg) { const sp = Math.hypot(e.vx, e.vy), ang = Math.atan2(tg.cy - e.y, tg.x - e.x), cur = Math.atan2(e.vy, e.vx); let d = ang - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; const na = cur + clamp(d, -6 * dt, 6 * dt); e.vx = Math.cos(na) * sp; e.vy = Math.sin(na) * sp; } }
    if (e.back) { const dx = owner.x - e.x, dy = owner.cy - e.y, d = Math.hypot(dx, dy) || 1, sp = Math.hypot(e.vx, e.vy) || 700; e.vx = dx / d * sp; e.vy = dy / d * sp; if (d < 40 || owner.dead) return false; }
    if (o.grav) e.vy += o.grav * dt;
    const sx = e.vx * dt, sy = e.vy * dt; e.x += sx; e.y += sy; if (!o.grav && e.vy > 0) { const fp = dropTo(G.map.geo, e.x, e.y - 60); if (fp && e.y > fp.y - 14) { e.y = fp.y - 14; e.vy = 0; } } e.dist += Math.hypot(sx, sy); e.rot += dt * 16;
    if (G.frame % (PL < 1 ? 5 : 2) === 0 && Math.abs(e.x - G.cam.cx) < G.cam.viewW) { if (shape === 'orb' || shape === 'bolt' || shape === 'shard') elemTrail(o.el, e.x, e.y, e.size, e.vx, e.vy); else G.parts.add({ shape: 'glow', x: e.x, y: e.y, life: 0.25, size: 14 * e.size, size2: 2, col, a: 0.7 }); }
    for (const t of G.actors) {
      if (!owner.enemyOf(t) || e.hitSet.has(t)) continue;
      if (Math.abs(t.x - e.x) < t.w * 0.5 + 12 * e.size && e.y > t.y - t.h - 8 && e.y < t.y + 8) {
        e.hitSet.add(t);
        const d = o.dmg(); hit(owner, t, d.amount, { ...o.hopts, el: o.el, crit: d.crit, dir: Math.sign(e.vx) || 1 });
        if (o.onHit) o.onHit(t, e);
        if (o.exp) blast({ owner, x: e.x, y: t.cy, r: o.exp, dmg: () => { const q = o.dmg(); q.amount *= 0.6; return q; }, el: o.el, hopts: o.hopts, skip: t, delay: 0 });
        if (e.bounce > 0) { e.bounce--; const n = nearestFoe(owner, e.x, e.y, 460, e.hitSet); if (n) { const sp = Math.hypot(e.vx, e.vy), a = Math.atan2(n.cy - e.y, n.x - e.x); e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp; e.dist = 0; continue; } }
        if (PL === 1 && Math.abs(e.x - G.cam.cx) < G.cam.viewW) elemBurst(o.el, e.x, e.y, 34 * e.size, false);
        if (!o.pierce) { if (o.ret) { e.back = true; e.hitSet.clear(); e.hitSet.add(t); } else { puff(e.x, e.y, col); return false; } }
      }
    }
    if (e.dist > e.range) { if (o.ret && !e.back) { e.back = true; e.hitSet.clear(); } else if (!e.back) return false; }
    if (e.x < -50 || e.x > G.map.geo.w + 50 || e.y > G.map.geo.h + 100 || e.y < -400) return false;
    if (o.grav && e.vy > 0) { const p = dropTo(G.map.geo, e.x, e.y - 30); if (p && e.y >= p.y) { if (o.exp) blast({ owner, x: e.x, y: p.y - 20, r: o.exp, dmg: o.dmg, el: o.el, hopts: o.hopts }); return false; } }
    return true;
  };
  e.draw = (rd) => {
    const ang = Math.atan2(e.vy, e.vx), s = e.size;
    if (shape === 'arrow') spr(rd, SHAPES.arrow, e.x, e.y, 62 * s, 12 * s, ang, [1, 1, 1, 1], 0), spr(rd, SHAPES.glow, e.x, e.y, 30 * s, 30 * s, 0, [col[0], col[1], col[2], 0.6], 1);
    else if (shape === 'bulletS') spr(rd, SHAPES.spark, e.x, e.y, 46 * s, 9 * s, ang, [1, 0.9, 0.6, 1], 1);
    else if (shape === 'bolt') spr(rd, SHAPES.bolt, e.x, e.y, 84 * s, 26 * s, ang, [col[0], col[1], col[2], 1], 1), spr(rd, SHAPES.bolt, e.x, e.y, 60 * s, 12 * s, ang, [core[0], core[1], core[2], 1], 1);
    else if (shape === 'shard') spr(rd, SHAPES.shard, e.x, e.y, 16 * s, 34 * s, ang + Math.PI / 2, [core[0], core[1], core[2], 1], 0), spr(rd, SHAPES.glow, e.x, e.y, 34 * s, 34 * s, 0, [col[0], col[1], col[2], 0.55], 1);
    else if (shape === 'spinner') spr(rd, SHAPES.slash, e.x, e.y, 54 * s, 54 * s, e.rot * 1.4, [core[0], core[1], core[2], 1], 0.6), spr(rd, SHAPES.star, e.x, e.y, 30 * s, 30 * s, e.rot, [col[0], col[1], col[2], 1], 1);
    else if (shape === 'note') spr(rd, SHAPES.star, e.x, e.y + Math.sin(e.t * 20) * 6, 26 * s, 26 * s, e.rot * 0.4, [col[0], col[1], col[2], 1], 1), spr(rd, SHAPES.dot, e.x, e.y + Math.sin(e.t * 20) * 6, 9, 9, 0, [1, 1, 1, 1], 1);
    else if (o.el === 'fire') { const fl = 1 + 0.15 * Math.sin(e.t * 40); spr(rd, SHAPES.glow, e.x, e.y, 80 * s, 80 * s, 0, [1, 0.35, 0.05, 0.75], 1); spr(rd, SHAPES.flame, e.x - Math.cos(ang) * 16 * s, e.y - Math.sin(ang) * 16 * s, 40 * s * fl, 74 * s * fl, ang + Math.PI / 2, [1, 0.5, 0.08, 1], 1); spr(rd, SHAPES.flame, e.x - Math.cos(ang) * 6 * s, e.y - Math.sin(ang) * 6 * s, 24 * s, 46 * s, ang + Math.PI / 2, [1, 0.9, 0.55, 1], 1); spr(rd, SHAPES.glow, e.x, e.y, 22 * s, 22 * s, 0, [1, 1, 0.9, 1], 1); }
    else { const pu = 1 + 0.12 * Math.sin(e.t * 30); spr(rd, SHAPES.glow, e.x, e.y, 64 * s * pu, 64 * s * pu, 0, [col[0], col[1], col[2], 0.85], 1); spr(rd, SHAPES.arc, e.x, e.y, 40 * s, 40 * s, e.rot, [core[0], core[1], core[2], 0.9], 1); spr(rd, SHAPES.arc, e.x, e.y, 30 * s, 30 * s, -e.rot * 1.4, [col[0], col[1], col[2], 0.9], 1); spr(rd, SHAPES.glow, e.x, e.y, 22 * s, 22 * s, 0, [core[0], core[1], core[2], 1], 1); }
  };
  return add(e);
}
export function spr(rd, r, x, y, w, h, rot, tint, addv) {
  const c = Math.cos(rot), s = Math.sin(rot);
  rd.affine(r, [c, s, -s, c, x, y], -w / 2, -h / 2, w, h, tint, null, addv);
}
export function puff(x, y, col, n = 6) { G.parts.burst(x, y, n, { shape: 'glow', speed: 150, life: 0.3, size: 16, col }); }

// ------------------------------------------------------------------ blasts
/** A (possibly delayed, telegraphed) explosion. o: { owner, x, y, r, ry, dmg, el, hopts, delay, skip, heal, max, big, pillar } */
export function blast(o) {
  const col = elemRgb(o.el), core = elemCore(o.el), ry = o.ry || o.r * 0.7, L = loud(o.owner);
  const e = { t: -(o.delay || 0), done: false };
  if (o.delay > 0.3 && o.owner && o.owner.team !== 0) e.danger = { x: o.x, y: o.y, r: o.r + 40 };       // telegraphed: heroes on auto step out of it
  e.upd = (dt) => {
    e.t += dt;
    if (!e.done && e.t >= 0) { e.danger = null;
      e.done = true;
      for (const t of inEllipse(o.owner, o.x, o.y, o.r, ry, o.max || 12)) { if (t === o.skip) continue; const d = o.dmg(); hit(o.owner, t, d.amount, { ...o.hopts, el: o.el, crit: d.crit, dir: Math.sign(t.x - o.x) || 1 }); if (o.pull) t.body.vx = Math.sign(o.x - t.x) * 420; }
      if (Math.abs(o.x - G.cam.cx) < G.cam.viewW) {
        if (L === 1) { G.parts.burst(o.x, o.y, o.big ? 26 : 12, { shape: 'glow', speed: o.r * 2.6, life: 0.45, size: o.big ? 30 : 20, col, drag: 2.5 });
        G.parts.burst(o.x, o.y, o.big ? 14 : 6, { shape: 'spark', speed: o.r * 3.4, life: 0.35, size: 30, col: core, orient: true, drag: 2 }); }
        if (L === 1) elemBurst(o.el, o.x, o.y, o.r, o.big);
        if (o.big && L === 1) { G.cam.shake = Math.max(G.cam.shake, 8); G.parts.burst(o.x, o.y, 8, { shape: 'smoke', speed: 90, life: 0.9, size: 50, size2: 110, col: [0.12, 0.1, 0.1], add: 0, a: 0.5, front: false }); }
        if (!o.quiet) sfxAt(o.big ? 'explode' : 'hit_heavy', { x: o.x }, o.big ? 0.8 : 0.4);
      }
    }
    return e.t < 0.32;
  };
  e.draw = (rd) => {
    if (e.t < 0) { const u = 1 + e.t / (o.delay || 1), a = 0.25 + 0.5 * u; if (e.gy === undefined) { const gp = dropTo(G.map.geo, o.x, o.y - 70); e.gy = gp && gp.y - o.y < 200 ? gp.y : o.y + ry * 0.55; } spr(rd, SHAPES.ring, o.x, e.gy - 5, o.r * 2 * (0.5 + 0.5 * u), Math.min(34, ry * 0.4), 0, [col[0], col[1], col[2], a], 1); if (o.pillar) spr(rd, SHAPES.pillar, o.x, o.y - 300 + u * 100, 20, 600, 0, [col[0], col[1], col[2], 0.25 * u], 1); return; }
    const u = e.t / 0.32, s = o.r * 2 * (0.45 + u * 0.75);
    spr(rd, SHAPES.glow, o.x, o.y, s * 1.2, s * 1.2 * (ry / o.r), 0, [col[0], col[1], col[2], (1 - u) * 0.5 * L], 1);
    spr(rd, SHAPES.ring, o.x, o.y, s * 1.15, s * 1.15 * (ry / o.r), 0, [col[0] * 0.6 + core[0] * 0.4, col[1] * 0.6 + core[1] * 0.4, col[2] * 0.6 + core[2] * 0.4, (1 - u) * 0.7 * L], 1);
    if (o.pillar) spr(rd, SHAPES.pillar, o.x, o.y - 260, 70 * (1 - u * 0.5) * (L < 1 ? 0.6 : 1), 620, 0, [core[0], core[1], core[2], (1 - u) * L], 1);
  };
  return add(e);
}

// ------------------------------------------------------------------ zones (ground fields, walls, traps)
/** o: { owner, x, y, rx, ry, dur, tick, dmg, el, hopts, follow, heal, style:'field'|'wall'|'trap'|'aura', armed } */
export function zone(o) {
  const col = elemRgb(o.el), core = elemCore(o.el);
  const e = { t: 0, tk: o.first ?? 0.1, x: o.x, y: o.y, sprung: false };
  e.upd = (dt) => {
    e.t += dt; if (o.follow) { if (o.follow.dead) return false; e.x = o.follow.x; e.y = o.follow.y; }
    if (o.style === 'trap') {
      if (e.t < 0.5) return true;
      if (inEllipse(o.owner, e.x, e.y - 30, o.rx * 0.6, 70, 1).length) { blast({ owner: o.owner, x: e.x, y: e.y - 30, r: o.rx, dmg: o.dmg, el: o.el, hopts: o.hopts, big: true }); return false; }
      return e.t < (o.dur || 20);
    }
    e.tk -= dt;
    if (e.tk <= 0) {
      e.tk += o.tick || 0.5;
      for (const t of inEllipse(o.owner, e.x, e.y - (o.ry || 50) * 0.6, o.rx, o.ry || 70, 10)) { const d = o.dmg(); hit(o.owner, t, d.amount, { ...o.hopts, el: o.el, crit: d.crit, kb: 0, silent: true }); }
      if (o.heal) for (const f of friends(o.owner, o.rx + 40)) if (Math.abs(f.x - e.x) < o.rx) heal(f, f.maxHp * o.heal, true);
      if (Math.abs(e.x - G.cam.cx) < G.cam.viewW) for (let i = 0; i < 3; i++) G.parts.add({ shape: o.style === 'wall' ? 'glow' : 'star', x: e.x + rnd(-o.rx, o.rx), y: e.y - rnd(0, 12), vy: -rnd(60, o.style === 'wall' ? 260 : 120), life: rnd(0.4, 0.9), size: rnd(8, o.style === 'wall' ? 26 : 14), size2: 2, col: Math.random() < 0.3 ? core : col });
    }
    return e.t < o.dur;
  };
  e.draw = (rd) => {
    const fade = Math.min(1, e.t * 4, (o.dur - e.t) * 2), pulse = 0.75 + 0.25 * Math.sin(e.t * 5);
    if (o.style === 'trap') { spr(rd, SHAPES.rune, e.x, e.y - 3, 46, 14, 0, [col[0], col[1], col[2], e.t < 0.5 ? 0.4 : 0.9], 1); spr(rd, SHAPES.dot, e.x, e.y - 8, 10, 10, 0, [core[0], core[1], core[2], 0.6 + 0.4 * Math.sin(e.t * 9)], 1); return; }
    if (o.style === 'wall') { for (let i = -2; i <= 2; i++) spr(rd, SHAPES.pillar, e.x + i * o.rx * 0.42, e.y - 60, 46, 150 + Math.sin(e.t * 9 + i) * 18, 0, [col[0], col[1], col[2], 0.55 * fade], 1); spr(rd, SHAPES.glow, e.x, e.y - 8, o.rx * 2.4, 46, 0, [core[0], core[1], core[2], 0.5 * fade], 1); return; }
    spr(rd, SHAPES.rune, e.x, e.y - 2, o.rx * 2, o.rx * 0.5, 0, [col[0], col[1], col[2], 0.75 * fade * pulse], 1);
    spr(rd, SHAPES.glow, e.x, e.y - 6, o.rx * 2.3, o.rx * 0.7, 0, [col[0], col[1], col[2], 0.32 * fade], 1);
  };
  e.back = true;
  return add(e);
}

// ------------------------------------------------------------------ beams
/** o: { owner, dur, len, thick, dmg, el, hopts, tick, origin:()=>[x,y], ang (rad, 0 = straight ahead, + = downward), breath } */
export function beam(o) {
  const col = elemRgb(o.el), core = elemCore(o.el), e = { t: 0, tk: 0.05 }, ang = o.ang || 0;
  const org = () => (o.origin ? o.origin() : [o.owner.x + o.owner.face * 24, o.owner.cy - 6]);
  e.upd = (dt) => {
    const a = o.owner; if (a.dead) return false; e.t += dt; e.tk -= dt;
    const [x0, y0] = org(), f = a.face, dx = Math.cos(ang) * f, dy = Math.sin(ang);
    if (e.tk <= 0) { e.tk += o.tick || 0.2; const seen = new Set(); for (let d = 40; d <= o.len; d += 70) { const w = o.breath ? o.thick * (0.5 + d / o.len) : o.thick; for (const t of inEllipse(a, x0 + dx * d, y0 + dy * d, 46, w + 30, 6)) { if (seen.has(t)) continue; seen.add(t); const q = o.dmg(); hit(a, t, q.amount, { ...o.hopts, el: o.el, crit: q.crit, kb: 0.15, silent: true }); elemBurst(o.el, t.x, t.cy, 26, false); } } }
    if (o.breath && Math.abs(x0 - G.cam.cx) < G.cam.viewW) for (let i = 0; i < 5; i++) {      // a roiling cone of the element
      const sp = rnd(520, 820), da = rnd(-0.16, 0.16), vx = Math.cos(ang + da) * f * sp, vy = Math.sin(ang + da) * sp, life = o.len / sp * rnd(0.8, 1.05);
      const fire = o.el === 'fire';
      G.parts.add({ shape: fire ? 'flame' : 'glow', x: x0, y: y0, vx, vy, life, size: rnd(14, 22), size2: rnd(60, 96), asp: fire ? 1.3 : 1, rot: Math.atan2(vy, vx) + Math.PI / 2, col: fire ? [1, rnd(0.3, 0.75), 0.06] : (i % 3 ? col : core), a: 0.85, drag: 0.6 });
      if (i === 0) G.parts.add({ shape: 'dot', x: x0, y: y0, vx: vx * 1.1, vy: vy * 1.1 - 40, g: 300, life: life * 1.2, size: 4, col: core });
      if (i === 1 && fire) G.parts.add({ shape: 'smoke', x: x0 + dx * o.len * 0.7, y: y0 + dy * o.len * 0.7, vy: -60, life: 0.8, size: 30, size2: 90, col: [0.1, 0.08, 0.08], add: 0, a: 0.3, front: false });
    }
    return e.t < o.dur;
  };
  e.draw = (rd) => {
    const a = o.owner, [x0, y0] = org(), f = a.face, fade = Math.min(1, (o.dur - e.t) * 6), fl = 0.85 + 0.15 * Math.sin(e.t * 50);
    spr(rd, SHAPES.glow, x0, y0, 70 * fl, 70 * fl, 0, [core[0], core[1], core[2], fade], 1);
    if (o.breath) return;
    const th = o.thick * 1.5 * fl, rot = f > 0 ? ang : Math.PI - ang, cx = Math.cos(ang) * f, sy = Math.sin(ang), mx = x0 + cx * o.len / 2, my = y0 + sy * o.len / 2, k = KIND_OF(o.el);
    // a wide soft sheath, the coloured body, and a hot core; then what the element does along it
    spr(rd, SHAPES.thrust, mx, my, o.len * 1.04, th * 3.4, rot, [col[0], col[1], col[2], 0.3 * fade], 1);
    spr(rd, SHAPES.thrust, mx, my, o.len, th * 1.6, rot, [col[0], col[1], col[2], 0.9 * fade], 1);
    spr(rd, SHAPES.thrust, mx, my, o.len * 0.98, th * 0.55, rot, [core[0], core[1], core[2], fade], 1);
    spr(rd, SHAPES.glow, x0 + cx * o.len, y0 + sy * o.len, th * 4, th * 4, 0, [core[0], core[1], core[2], 0.8 * fade], 1);
    if (k === 'arc' || k === 'holy') for (let i = 1; i <= 3; i++) { const u = ((e.t * 1.6 + i / 3) % 1); spr(rd, SHAPES.ring, x0 + cx * o.len * u, y0 + sy * o.len * u, th * 0.9, th * 3.2, rot, [core[0], core[1], core[2], 0.8 * fade * (1 - u)], 1); }
    if (k === 'dark') { const pu = 0.5 + 0.5 * Math.sin(e.t * 14); for (let i = 0; i < 5; i++) { const u = (i + ((e.t * 2) % 1)) / 5; spr(rd, SHAPES.glow, x0 + cx * o.len * (1 - u), y0 + sy * o.len * (1 - u), th * (1.6 + pu), th * (1.6 + pu), 0, [col[0], col[1] * 0.4, col[2] * 0.5, 0.8 * fade], 1); } }
    if (Math.abs(x0 - G.cam.cx) < G.cam.viewW && G.frame % 2 === 0) { const u = Math.random(); elemTrail(o.el, x0 + cx * o.len * u + rnd(-4, 4), y0 + sy * o.len * u + rnd(-th, th) * 0.6, 0.9, cx * 300, sy * 300); }
    if (o.el === 'light') for (let i = 0; i < 3; i++) spr(rd, SHAPES.zap, x0 + Math.cos(ang) * f * o.len * (0.2 + i * 0.3), y0 + Math.sin(ang) * o.len * (0.2 + i * 0.3) + rnd(-8, 8), o.len * 0.36, 30, rot, [1, 1, 1, fade], 1);
  };
  return add(e);
}

// ------------------------------------------------------------------ chains
export function chainFx(points, el) {
  const col = elemRgb(el), core = elemCore(el), e = { t: 0 };
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) { const [x1, y1] = points[i], [x2, y2] = points[i + 1], n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 46)); let px = x1, py = y1; for (let k = 1; k <= n; k++) { const u = k / n, nx = x1 + (x2 - x1) * u + (k < n ? rnd(-16, 16) : 0), ny = y1 + (y2 - y1) * u + (k < n ? rnd(-16, 16) : 0); segs.push([px, py, nx, ny]); px = nx; py = ny; } }
  e.upd = (dt) => { e.t += dt; return e.t < 0.28; };
  e.draw = (rd) => { const a = 1 - e.t / 0.28; for (const s of segs) { const len = Math.hypot(s[2] - s[0], s[3] - s[1]), ang = Math.atan2(s[3] - s[1], s[2] - s[0]), mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2; spr(rd, SHAPES.spark, mx, my, len * 1.5, 26, ang, [col[0], col[1], col[2], a], 1); spr(rd, SHAPES.zap, mx, my, len * 1.25, 22, ang, [core[0], core[1], core[2], a], 1); } };
  return add(e);
}

// ------------------------------------------------------------------ orbiters / cyclones
/** o: { owner, n, dur, radius, grow, dmg, el, hopts } */
export function orbit(o) {
  const col = elemRgb(o.el), core = elemCore(o.el), e = { t: 0, last: new Map() };
  const pos = (i) => { const a = o.owner, ang = e.t * 4.6 + i * TAU / o.n, r = o.radius + (o.grow || 0) * e.t; return [a.x + Math.cos(ang) * r, a.cy + Math.sin(ang) * r * 0.55, Math.sin(ang)]; };
  e.upd = (dt) => {
    if (o.owner.dead) return false; e.t += dt;
    for (let i = 0; i < o.n; i++) { const [x, y] = pos(i); for (const t of inEllipse(o.owner, x, y, 34, 40, 3)) { if (G.time - (e.last.get(t) || 0) < 0.45) continue; e.last.set(t, G.time); const d = o.dmg(); hit(o.owner, t, d.amount, { ...o.hopts, el: o.el, crit: d.crit, kb: 0.3 }); } }
    return e.t < o.dur;
  };
  e.draw = (rd) => { const fade = Math.min(1, (o.dur - e.t) * 3); for (let i = 0; i < o.n; i++) { const [x, y] = pos(i); spr(rd, SHAPES.glow, x, y, 46, 46, 0, [col[0], col[1], col[2], 0.8 * fade], 1); spr(rd, SHAPES.star, x, y, 30, 30, e.t * 9, [core[0], core[1], core[2], fade], 1); } };
  return add(e);
}
/** o: { owner, x, y, dir, speed, dur, r, dmg, el, hopts } — a travelling whirl on the ground */
export function cyclone(o) {
  const col = elemRgb(o.el), e = { t: 0, x: o.x, y: o.y, dir: o.dir, tk: 0 };
  e.upd = (dt) => {
    e.t += dt; e.x += e.dir * o.speed * dt; e.tk -= dt;
    const p = dropTo(G.map.geo, e.x, e.y - 20); if (!p || Math.abs(p.y - e.y) > 90 || e.x < 60 || e.x > G.map.geo.w - 60) e.dir *= -1; else e.y = p.y;
    if (e.tk <= 0) { e.tk += 0.3; for (const t of inEllipse(o.owner, e.x, e.y - 60, o.r, 90, 8)) { const d = o.dmg(); hit(o.owner, t, d.amount, { ...o.hopts, el: o.el, crit: d.crit, kb: 0.4 }); } }
    if (G.frame % 2 === 0) G.parts.add({ shape: 'smoke', x: e.x + rnd(-o.r, o.r) * 0.5, y: e.y - rnd(0, 120), vx: rnd(-200, 200), vy: -rnd(40, 160), life: 0.4, size: 30, col, a: 0.5 });
    return e.t < o.dur;
  };
  e.draw = (rd) => { const fade = Math.min(1, (o.dur - e.t) * 3, e.t * 5); for (let i = 0; i < 5; i++) { const w = (o.r * 0.6 + i * o.r * 0.32) * (1 + 0.12 * Math.sin(e.t * 14 + i)); spr(rd, SHAPES.ring, e.x + Math.sin(e.t * 11 + i * 1.3) * 8, e.y - 14 - i * 30, w * 2, w * 0.55, 0, [col[0], col[1], col[2], 0.55 * fade], 1); } };
  return add(e);
}
/** A one-shot picture: slash arcs, thrusts, rings. o: { shape, x, y, w, h, rot, flip, col, dur, grow, follow, ox, oy, add } */
export function flashFx(o) {
  const e = { t: 0 }, dur = o.dur || 0.2;
  e.upd = (dt) => { e.t += dt; return e.t < dur; };
  e.draw = (rd) => {
    const u = e.t / dur, s = 1 + (o.grow || 0) * u, x = o.follow ? o.follow.x + (o.ox || 0) : o.x, y = o.follow ? o.follow.cy + (o.oy || 0) : o.y;
    const c = Math.cos(o.rot || 0), sn = Math.sin(o.rot || 0), fx = o.flip ? -1 : 1, w = o.w * s, h = o.h * s;
    rd.affine(SHAPES[o.shape], [c * fx, sn * fx, -sn, c, x, y], -w / 2, -h / 2, w, h, [o.col[0], o.col[1], o.col[2], (1 - u * u) * (o.a ?? 1)], null, o.add ?? 1);
  };
  return add(e);
}
export function pillarFx(o) {       // level-ups, strikes from the sky
  const e = { t: 0, kind: 'pillar' }, dur = o.dur || 0.5;
  e.upd = (dt) => { e.t += dt; return e.t < dur; };
  e.draw = (rd) => { const u = e.t / dur, x = o.follow ? o.follow.x : o.x, y = o.follow ? o.follow.y : o.y, w = (o.w || 90) * (1 - u * 0.4); rd.quad(SHAPES.pillar, x - w / 2, y - 640, w, 640, [o.col[0], o.col[1], o.col[2], (1 - u)], null, 1); spr(rd, SHAPES.ring, x, y - 4, w * 2.4 * (0.5 + u), 26, 0, [o.col[0], o.col[1], o.col[2], 1 - u], 1); };
  return add(e);
}
