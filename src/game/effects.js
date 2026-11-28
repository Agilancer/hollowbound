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

// ------------------------------------------------------------------ projectiles
const SHAPE_OF = (fx) => (/arrow|javelin|spear|thrust|kunai|dagger|lance/.test(fx) ? 'arrow' : /bullet|rocket/.test(fx) ? 'bulletS' : /bolt|laser|lightning|spark|shock|beam|pulsar|starline/.test(fx) ? 'bolt'
  : /shard|frost|ice|bone|spike|thorn|feather|caltrop/.test(fx) ? 'shard' : /rang|chakram|shuriken|blade|axe|hammer|shield|disc|claw/.test(fx) ? 'spinner' : /^n_|note/.test(fx) ? 'note' : 'orb');
/** o: { owner, x, y, vx, vy, dmg:()=>({amount,crit}), el, fx, hopts, range, pierce, home, exp, bounce, ret, grav, size, onHit } */
export function spawnProj(o) {
  const shape = SHAPE_OF(o.fx || 'orb'), col = elemRgb(o.el), core = elemCore(o.el), owner = o.owner;
  const e = { x: o.x, y: o.y, vx: o.vx, vy: o.vy, dist: 0, range: o.range || 620, hitSet: new Set(), bounce: o.bounce || 0, back: false, rot: 0, t: 0, size: o.size || 1, dead: false };
  e.upd = (dt) => {
    e.t += dt;
    if (o.home && !e.back) { const tg = nearestFoe(owner, e.x, e.y, 420, e.hitSet); if (tg) { const sp = Math.hypot(e.vx, e.vy), ang = Math.atan2(tg.cy - e.y, tg.x - e.x), cur = Math.atan2(e.vy, e.vx); let d = ang - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; const na = cur + clamp(d, -6 * dt, 6 * dt); e.vx = Math.cos(na) * sp; e.vy = Math.sin(na) * sp; } }
    if (e.back) { const dx = owner.x - e.x, dy = owner.cy - e.y, d = Math.hypot(dx, dy) || 1, sp = Math.hypot(e.vx, e.vy) || 700; e.vx = dx / d * sp; e.vy = dy / d * sp; if (d < 40 || owner.dead) return false; }
    if (o.grav) e.vy += o.grav * dt;
    const sx = e.vx * dt, sy = e.vy * dt; e.x += sx; e.y += sy; e.dist += Math.hypot(sx, sy); e.rot += dt * 16;
    if (G.frame % 2 === 0 && Math.abs(e.x - G.cam.cx) < G.cam.viewW) G.parts.add({ shape: 'glow', x: e.x, y: e.y, life: 0.25, size: 14 * e.size, size2: 2, col, a: 0.7 });
    for (const t of G.actors) {
      if (!owner.enemyOf(t) || e.hitSet.has(t)) continue;
      if (Math.abs(t.x - e.x) < t.w * 0.5 + 12 * e.size && e.y > t.y - t.h - 8 && e.y < t.y + 8) {
        e.hitSet.add(t);
        const d = o.dmg(); hit(owner, t, d.amount, { ...o.hopts, el: o.el, crit: d.crit, dir: Math.sign(e.vx) || 1 });
        if (o.onHit) o.onHit(t, e);
        if (o.exp) blast({ owner, x: e.x, y: t.cy, r: o.exp, dmg: () => { const q = o.dmg(); q.amount *= 0.6; return q; }, el: o.el, hopts: o.hopts, skip: t, delay: 0 });
        if (e.bounce > 0) { e.bounce--; const n = nearestFoe(owner, e.x, e.y, 460, e.hitSet); if (n) { const sp = Math.hypot(e.vx, e.vy), a = Math.atan2(n.cy - e.y, n.x - e.x); e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp; e.dist = 0; continue; } }
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
    else { spr(rd, SHAPES.glow, e.x, e.y, 54 * s, 54 * s, 0, [col[0], col[1], col[2], 0.9], 1); spr(rd, SHAPES.glow, e.x, e.y, 24 * s, 24 * s, 0, [core[0], core[1], core[2], 1], 1); }
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
  const col = elemRgb(o.el), core = elemCore(o.el), ry = o.ry || o.r * 0.7;
  const e = { t: -(o.delay || 0), done: false };
  e.upd = (dt) => {
    e.t += dt;
    if (!e.done && e.t >= 0) {
      e.done = true;
      for (const t of inEllipse(o.owner, o.x, o.y, o.r, ry, o.max || 12)) { if (t === o.skip) continue; const d = o.dmg(); hit(o.owner, t, d.amount, { ...o.hopts, el: o.el, crit: d.crit, dir: Math.sign(t.x - o.x) || 1 }); if (o.pull) t.body.vx = Math.sign(o.x - t.x) * 420; }
      if (Math.abs(o.x - G.cam.cx) < G.cam.viewW) {
        G.parts.burst(o.x, o.y, o.big ? 26 : 12, { shape: 'glow', speed: o.r * 2.6, life: 0.45, size: o.big ? 30 : 20, col, drag: 2.5 });
        G.parts.burst(o.x, o.y, o.big ? 14 : 6, { shape: 'spark', speed: o.r * 3.4, life: 0.35, size: 30, col: core, orient: true, drag: 2 });
        if (o.big) { G.cam.shake = Math.max(G.cam.shake, 8); G.parts.burst(o.x, o.y, 8, { shape: 'smoke', speed: 90, life: 0.9, size: 50, size2: 110, col: [0.12, 0.1, 0.1], add: 0, a: 0.5, front: false }); }
        if (!o.quiet) sfxAt(o.big ? 'explode' : 'hit_heavy', { x: o.x }, o.big ? 0.8 : 0.4);
      }
    }
    return e.t < 0.32;
  };
  e.draw = (rd) => {
    if (e.t < 0) { const u = 1 + e.t / (o.delay || 1), a = 0.25 + 0.5 * u; spr(rd, SHAPES.ring, o.x, o.y + ry * 0.55, o.r * 2 * (0.5 + 0.5 * u), ry * 0.7, 0, [col[0], col[1], col[2], a], 1); if (o.pillar) spr(rd, SHAPES.pillar, o.x, o.y - 300 + u * 100, 20, 600, 0, [col[0], col[1], col[2], 0.25 * u], 1); return; }
    const u = e.t / 0.32, s = o.r * 2 * (0.45 + u * 0.75);
    spr(rd, SHAPES.glow, o.x, o.y, s * 1.2, s * 1.2 * (ry / o.r), 0, [col[0], col[1], col[2], (1 - u) * 0.9], 1);
    spr(rd, SHAPES.ring, o.x, o.y, s * 1.15, s * 1.15 * (ry / o.r), 0, [core[0], core[1], core[2], (1 - u) * 0.9], 1);
    if (o.pillar) spr(rd, SHAPES.pillar, o.x, o.y - 260, 70 * (1 - u * 0.5), 620, 0, [core[0], core[1], core[2], (1 - u)], 1);
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
/** o: { owner, dur, len, thick, dmg, el, hopts, tick } — sticks to the caster's hand */
export function beam(o) {
  const col = elemRgb(o.el), core = elemCore(o.el), e = { t: 0, tk: 0.05 };
  e.upd = (dt) => {
    const a = o.owner; if (a.dead) return false; e.t += dt; e.tk -= dt;
    if (e.tk <= 0) { e.tk += o.tick || 0.2; const x1 = a.x + a.face * 20; for (const t of inBox(a, x1, x1 + a.face * o.len, a.cy - o.thick, a.cy + o.thick, 10)) { const d = o.dmg(); hit(a, t, d.amount, { ...o.hopts, el: o.el, crit: d.crit, kb: 0.15, silent: true }); puff(t.x, t.cy, col, 3); } }
    return e.t < o.dur;
  };
  e.draw = (rd) => {
    const a = o.owner, x0 = a.x + a.face * 24, y = a.cy - 6, w = o.len, fl = 0.85 + 0.15 * Math.sin(e.t * 50), fade = Math.min(1, (o.dur - e.t) * 6);
    const th = o.thick * 1.5 * fl;
    rd.quad(SHAPES.thrust, a.face > 0 ? x0 : x0 - w, y - th / 2, w, th, [col[0], col[1], col[2], 0.85 * fade], null, 1);
    rd.quad(SHAPES.thrust, a.face > 0 ? x0 : x0 - w, y - th / 5, w, th / 2.5, [core[0], core[1], core[2], fade], null, 1);
    spr(rd, SHAPES.glow, x0, y, th * 1.6, th * 1.6, 0, [core[0], core[1], core[2], fade], 1);
  };
  return add(e);
}

// ------------------------------------------------------------------ chains
export function chainFx(points, el) {
  const col = elemRgb(el), core = elemCore(el), e = { t: 0 };
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) { const [x1, y1] = points[i], [x2, y2] = points[i + 1], n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 46)); let px = x1, py = y1; for (let k = 1; k <= n; k++) { const u = k / n, nx = x1 + (x2 - x1) * u + (k < n ? rnd(-16, 16) : 0), ny = y1 + (y2 - y1) * u + (k < n ? rnd(-16, 16) : 0); segs.push([px, py, nx, ny]); px = nx; py = ny; } }
  e.upd = (dt) => { e.t += dt; return e.t < 0.28; };
  e.draw = (rd) => { const a = 1 - e.t / 0.28; for (const s of segs) { const len = Math.hypot(s[2] - s[0], s[3] - s[1]), ang = Math.atan2(s[3] - s[1], s[2] - s[0]), mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2; spr(rd, SHAPES.spark, mx, my, len * 1.5, 22, ang, [col[0], col[1], col[2], a], 1); spr(rd, SHAPES.spark, mx, my, len * 1.3, 8, ang, [core[0], core[1], core[2], a], 1); } };
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
