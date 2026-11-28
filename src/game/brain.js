// Brains. Monsters wander their foothold, wake when struck (or when you come too close to
// the nasty ones) and chase along their platform. Heroes that are not under your thumb
// (auto-play, simulated players, party members, duel foes) are driven by Bot, which finds
// its way over ropes, drops and ledges with a small platform graph.
import { G, rnd, ri, clamp, pick, chance } from '../state.js';
import { TILE, SKILLS } from '../data/game.js';
import { hit, heal, sfxAt } from './combat.js';
import { spawnProj, blast, zone, nearestFoe, flashFx } from './effects.js';
import { cast, ready, reach, costOf } from './skillrun.js';
import { dropTo } from './body.js';

// ------------------------------------------------------------------ monsters
const AGGRESSIVE = new Set(['brute', 'charger', 'exploder', 'swarm', 'boss', 'nova']);
export function tickMob(m, dt) {
  const b = m.body, geo = G.map.geo, st = m.status;
  if (m.stagger > 0) { m.stagger -= dt; b.step(geo, dt, 0, {}); b.vx *= 0.9; return; }
  // who am I angry at
  if (m.aggro && (m.aggro.dead || m.aggro.remove || Math.abs(m.aggro.x - m.x) > 1500)) m.aggro = null;
  if (m.aggro) { m.aggroT -= dt; if (m.aggroT <= 0 && !m.boss) { m.aggro = null; m.threat.clear(); } }
  if (!m.aggro && (m.boss || m.elite || AGGRESSIVE.has(m.ai) || G.map.instance)) {
    m.lookT = (m.lookT || 0) - dt;
    if (m.lookT <= 0) { m.lookT = 0.5; const r = m.boss || G.map.instance ? 900 : 300; const t = nearestFoe(m, m.x, m.cy, r, null, m.boss || b.fly || G.map.instance ? 500 : 110); if (t) { m.aggro = t; m.aggroT = 10; } }
  }
  let move = 0; const want = {};
  const tg = m.aggro;
  if (st.fear > 0 && tg) move = tg.x > m.x ? -1 : 1;
  else if (tg) {
    const dx = tg.x - m.x, adx = Math.abs(dx), dy = tg.cy - m.cy, keep = m.rangedAtk ? 330 : m.w * 0.5 + 34;
    const samePlat = b.fly || !b.plat || (tg.body.plat === b.plat) || Math.abs(tg.y - m.y) < 40;
    if (adx > keep + 12) move = Math.sign(dx); else if (m.rangedAtk && adx < keep - 120 && samePlat) move = -Math.sign(dx); else b.face = dx >= 0 ? 1 : -1;
    if (b.fly) { want.up = dy < -24; want.down = dy > 24; }
    // stay on the foothold unless the quarry is below and we have waited at the edge
    if (!b.fly && b.plat && move) {
      const nx = m.x + move * 26;
      if (nx < b.plat.x1 + 8 || nx > b.plat.x2 - 8) {
        const next = geo.plats.find(p => p.ground && b.plat.ground && Math.abs((move > 0 ? p.x1 - b.plat.x2 : b.plat.x1 - p.x2)) < 2);
        if (next && next.y < b.plat.y) { want.jump = true; }                         // a ground step up: hop it
        else if (next) { /* step down: walk off */ }
        else if (tg.y > m.y + 60) { m.edgeT = (m.edgeT || 0) + dt; if (m.edgeT < 1.2) move = 0; }
        else move = 0;
      } else m.edgeT = 0;
    }
    attack(m, tg, dt, adx, dy);
  } else {
    // idle wander: every ~1.6s pick stand / left / right; turn at the edge of the foothold
    m.thinkT -= dt;
    if (m.thinkT <= 0) { m.thinkT = rnd(1.1, 2.4); m.move = pick([0, 0, -1, 1]); }
    move = m.move;
    if (b.plat && move) { const nx = m.x + move * 30; if (nx < b.plat.x1 + 12 || nx > b.plat.x2 - 12) { m.move = move = -move; } }
    if (m.spawn && Math.abs(m.x - m.spawn.x) > 520) m.move = move = Math.sign(m.spawn.x - m.x);
    if (b.fly) { const hy = (m.spawn ? m.spawn.y : geo.groundY) - 130; want.up = m.y > hy + 30; want.down = m.y < hy - 30; }
  }
  if (st.stun > 0 || st.freeze > 0 || m.windup > 0) move = 0;
  const walk = tg ? 1 : 0.45;
  b.speed = m.stats.speed * walk * (st.slow > 0 ? 0.55 : 1) * (st.fear > 0 ? 1.3 : 1);
  b.step(geo, dt, move, want);
  // touch: brushing against a monster hurts (the hop and the blink of invulnerability follow)
  if (!m.dead && st.stun <= 0 && st.freeze <= 0) {
    for (const h of G.heroes) {
      if (h.dead || h.inv > 0 || h.team === m.team) continue;
      if (Math.abs(h.x - m.x) < (m.w + h.w) * 0.42 && h.y > m.y - m.h && h.y - h.h < m.y) hit(m, h, m.dmg * 0.4, { el: 'phys', kb: 1 });
    }
  }
}
function attack(m, tg, dt, adx, dy) {
  if (m.windup > 0) { m.windup -= dt; if (m.windup <= 0 && m.pending) { const f = m.pending; m.pending = null; if (!m.dead && m.status.stun <= 0 && m.status.freeze <= 0) f(); } return; }
  m.atkT -= dt; if (m.atkT > 0 || m.status.stun > 0 || m.status.freeze > 0) return;
  const el = m.el, dmg = () => ({ amount: m.dmg * rnd(0.85, 1.15) * (m.status.weaken > 0 ? 0.7 : 1), crit: false });
  const tele = (t, f) => { m.windup = t; m.pending = f; m.flash = 0.6; m.flashCol = [1, 0.3, 0.2]; m.castT = 1; };
  if (m.boss) return bossAttack(m, tg, adx, dy, dmg, tele);
  const reachM = m.w * 0.5 + 58;
  if (m.ai === 'ranged' || m.ai === 'beamer') {
    if (adx < 560 && Math.abs(dy) < 150) { m.atkT = rnd(1.8, 3); tele(0.35, () => { m.lunge = 0.8; const a = Math.atan2(tg.cy - m.cy, tg.x - m.x), sp = 430; spawnProj({ owner: m, x: m.x + m.face * 20, y: m.cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, el, fx: el === 'phys' ? 'arrow' : 'orb', hopts: { kb: 0.6 }, range: 640 }); sfxAt('shoot', m, 0.4); }); }
  } else if (m.ai === 'caster') {
    if (adx < 620 && Math.abs(dy) < 260) { m.atkT = rnd(2.4, 3.6); const x = tg.x, y = tg.y; tele(0.2, () => { blast({ owner: m, x, y: y - 40, r: 95, dmg, el, hopts: { kb: 0.8 }, delay: 0.85, pillar: true, big: true }); sfxAt('cast', m, 0.5); }); }
  } else if (m.ai === 'nova') {
    if (adx < 150 && Math.abs(dy) < 110) { m.atkT = rnd(2.2, 3.2); tele(0.55, () => { blast({ owner: m, x: m.x, y: m.cy, r: 170, ry: 110, dmg, el, hopts: { kb: 1 }, big: true }); }); }
  } else if (m.ai === 'exploder') {
    if (adx < 70 && Math.abs(dy) < 90) { m.atkT = 9; tele(0.6, () => { blast({ owner: m, x: m.x, y: m.cy, r: 150, dmg: () => ({ amount: m.dmg * 1.8, crit: false }), el: 'fire', hopts: { kb: 1.4 }, big: true }); m.hp = 0; m.dead = true; m.deadT = 0.4; if (m.spawn) { m.spawn.alive = false; m.spawn.t = rnd(6, 11); } }); }
  } else if (m.ai === 'charger') {
    if (adx < 420 && adx > 120 && Math.abs(dy) < 60) { m.atkT = rnd(3, 4.5); const f = Math.sign(tg.x - m.x) || 1; tele(0.5, () => { m.body.vx = f * 720; m.lunge = 1; m.stagger = 0.01; let t = 0; const seen = new Set(); G.effects.push({ upd(d) { t += d; m.body.vx = f * 720 * (1 - t / 0.5); for (const h of G.heroes) { if (seen.has(h) || h.dead || h.team === m.team) continue; if (Math.abs(h.x - m.x) < 60 && Math.abs(h.cy - m.cy) < 80) { seen.add(h); hit(m, h, m.dmg * 1.4, { el: 'phys', kb: 1.4 }); } } return t < 0.5 && !m.dead; }, draw() {} }); }); }
    else if (adx < reachM && Math.abs(dy) < 90) melee(m, tg, dmg, reachM);
  } else if (adx < reachM && Math.abs(dy) < 90) melee(m, tg, dmg, reachM);
}
function melee(m, tg, dmg, reachM) {
  m.atkT = rnd(1.1, 1.9) / (m.ai === 'swarm' ? 1.5 : 1); m.windup = 0.28; m.lunge = 0.5;
  m.pending = () => { m.lunge = 1; if (!tg.dead && Math.abs(tg.x - m.x) < reachM + 30 && Math.abs(tg.cy - m.cy) < 110) { const d = dmg(); hit(m, tg, d.amount, { el: 'phys', kb: 0.9 }); } flashFx({ shape: 'slash', follow: m, ox: m.face * m.w * 0.5, oy: 0, w: m.w + 60, h: m.h * 0.9, flip: m.face < 0, col: [1, 0.85, 0.7], dur: 0.15, a: 0.7 }); };
}
function bossAttack(m, tg, adx, dy, dmg, tele) {
  const raid = G.map.instance && G.map.instance.raid, k = (m.pat = (m.pat || 0) + 1) % 5, el = m.el;
  m.atkT = rnd(2.2, 3.2) * (m.hp < m.maxHp * 0.35 ? 0.7 : 1);
  if (k === 0 || (adx < m.w * 0.5 + 90 && k !== 3)) {            // slam around itself
    tele(0.75, () => { blast({ owner: m, x: m.x, y: m.y - 50, r: m.w * 0.5 + 170, ry: 130, dmg: () => ({ amount: m.dmg * 1.5, crit: false }), el, hopts: { kb: 1.5 }, big: true }); G.cam.shake = 12; m.squash = -0.2; });
    flashFx({ shape: 'ring', x: m.x, y: m.y - 30, w: (m.w * 0.5 + 170) * 2, h: 90, col: [1, 0.2, 0.15], dur: 0.75, grow: 0.05, a: 0.7 });
  } else if (k === 1) {                                          // a fan of bolts
    tele(0.5, () => { const base = Math.atan2(tg.cy - m.cy, tg.x - m.x); for (let i = -2; i <= 2; i++) spawnProj({ owner: m, x: m.x + m.face * 30, y: m.cy, vx: Math.cos(base + i * 0.2) * 460, vy: Math.sin(base + i * 0.2) * 460, dmg, el, fx: 'orb', hopts: { kb: 0.8 }, range: 900, size: 1.4 }); sfxAt('cast_shadow', m, 0.7); });
  } else if (k === 2) {                                          // the ground erupts under several heroes
    const list = G.heroes.filter(h => !h.dead && h.team !== m.team && Math.abs(h.x - m.x) < 1100); const n = raid ? 7 : 3;
    tele(0.3, () => { for (let i = 0; i < n; i++) { const h = list.length ? list[(i * 3 + ri(0, 9)) % list.length] : tg; blast({ owner: m, x: h.x + rnd(-40, 40), y: h.y - 40, r: 105, dmg: () => ({ amount: m.dmg * 1.25, crit: false }), el, hopts: { kb: 1 }, delay: 0.95 + i * 0.12, pillar: true, big: true }); } });
  } else if (k === 3) {                                          // call its brood
    tele(0.6, () => { G.game.bossAdds(m, raid ? 4 : 2); sfxAt('boss_roar', m, 0.8); });
  } else {                                                       // a hazard that lingers
    tele(0.5, () => { const x = tg.x; zone({ owner: m, x, y: tg.y, rx: 150, ry: 90, dur: 5, tick: 0.6, dmg: () => ({ amount: m.dmg * 0.5, crit: false }), el, hopts: {}, style: 'field' }); });
  }
}

// ------------------------------------------------------------------ platform graph
export function buildNav(geo) {
  const P = geo.plats, links = P.map(() => []);
  const ix = new Map(P.map((p, i) => [p, i]));
  const add = (a, b, l) => { if (a !== b && a >= 0 && b >= 0) links[a].push({ to: b, ...l }); };
  const grounds = P.filter(p => p.ground).sort((a, b) => a.x1 - b.x1);
  for (let i = 0; i < grounds.length - 1; i++) { const a = ix.get(grounds[i]), b = ix.get(grounds[i + 1]), x = grounds[i].x2; add(a, b, { type: 'step', x: x - 30, dir: 1, up: grounds[i + 1].y < grounds[i].y }); add(b, a, { type: 'step', x: x + 30, dir: -1, up: grounds[i].y < grounds[i + 1].y }); }
  for (const r of geo.ropes) {
    const top = P.findIndex(p => Math.abs(p.y - r.y1) < 3 && r.x >= p.x1 && r.x <= p.x2), bp = dropTo(geo, r.x, r.y2), bot = bp ? ix.get(bp) : -1;
    add(bot, top, { type: 'rope', x: r.x, up: true, rope: r }); add(top, bot, { type: 'rope', x: r.x, up: false, rope: r });
  }
  P.forEach((p, i) => {
    if (p.ground) return;
    for (const x of [p.x1 - 24, p.x2 + 24]) { const q = dropTo(geo, clamp(x, 40, geo.w - 40), p.y + 6); if (q) add(i, ix.get(q), { type: 'walkoff', x, dir: x < p.x1 ? -1 : 1 }); }
    for (const f of [0.25, 0.5, 0.75]) { const x = p.x1 + (p.x2 - p.x1) * f; let q = null; for (const o of P) if (o !== p && x >= o.x1 && x <= o.x2 && o.y > p.y + 10 && (!q || o.y < q.y)) q = o; if (q) add(i, ix.get(q), { type: 'drop', x }); }
    // hop up onto this ledge from something just below it
    for (const o of P) { if (o === p || o.y <= p.y || o.y - p.y > 104) continue; const lo = Math.max(o.x1, p.x1 - 70), hi = Math.min(o.x2, p.x2 + 70); if (lo < hi) { const x = clamp((p.x1 + p.x2) / 2, lo, hi); add(ix.get(o), i, { type: 'jump', x, tx: clamp(x, p.x1 + 16, p.x2 - 16) }); } }
  });
  return { links, ix, P, cache: new Map() };
}
function nextLink(nav, from, to) {
  const key = from * 1000 + to; let l = nav.cache.get(key); if (l !== undefined) return l;
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) { const c = q.shift(); if (c === to) break; for (const e of nav.links[c]) if (!prev.has(e.to)) { prev.set(e.to, [c, e]); q.push(e.to); } }
  if (!prev.has(to)) { nav.cache.set(key, null); return null; }
  let c = to, first = null; while (prev.get(c)) { first = prev.get(c)[1]; c = prev.get(c)[0]; }
  nav.cache.set(key, first); return first;
}

// ------------------------------------------------------------------ hero bot
export class Bot {
  constructor(h) { this.h = h; this.goal = { type: 'idle' }; this.t = rnd(0.5); this.stuckT = 0; this.lastX = h.x; this.potT = 0; this.move = 0; this.want = {}; this.wait = 0; this.sk = null; }
  /** Walk toward (x, plat). Returns true when there. */
  go(x, plat, tol = 26) {
    const h = this.h, b = h.body, nav = G.map.nav, w = this.want;
    if (b.rope) {                       // on a rope: keep climbing the way the route wants
      const l = this.link;
      if (l && l.type === 'rope') { if (l.up) w.up = true; else w.down = true; } else w.up = true;
      return false;
    }
    const cur = b.plat; if (!cur) { this.move = Math.sign(x - h.x) * (Math.abs(x - h.x) > 20 ? 1 : 0); return false; }
    if (!plat || plat === cur) { this.link = null; const dx = x - h.x; if (Math.abs(dx) <= tol) return true; this.move = Math.sign(dx); this.unstick(); return false; }
    const l = this.link = nextLink(nav, nav.ix.get(cur), nav.ix.get(plat));
    if (!l) { const dx = x - h.x; this.move = Math.abs(dx) > tol ? Math.sign(dx) : 0; return Math.abs(dx) <= tol; }
    const dx = l.x - h.x;
    if (l.type === 'rope') { if (Math.abs(dx) > 9) this.move = Math.sign(dx); else { this.move = 0; b.vx = 0; if (l.up) w.up = true; else w.down = true; } }
    else if (l.type === 'drop') { if (Math.abs(dx) > 30) this.move = Math.sign(dx); else { w.down = true; w.jump = true; } }
    else if (l.type === 'walkoff') { this.move = l.dir; }
    else if (l.type === 'step') { this.move = l.dir; if (l.up && Math.abs(dx) < 60) w.jump = true; }
    else if (l.type === 'jump') { if (Math.abs(dx) > 34) this.move = Math.sign(dx); else { w.jump = true; this.move = Math.sign(l.tx - h.x) || h.face; } }
    this.unstick();
    return false;
  }
  unstick() { const h = this.h; if (this.move && Math.abs(h.x - this.lastX) < 0.5 && h.body.plat) { this.stuckT += G.dt; if (this.stuckT > 0.35) { this.want.jump = true; this.stuckT = 0; } } else this.stuckT = 0; this.lastX = h.x; }

  pickTarget(range = 900) {
    const h = this.h, f = this.goal.filter; let best = null, bs = 1e9;
    for (const o of G.actors) {
      if (!h.enemyOf(o)) continue; if (f && !f(o)) continue;
      const dx = Math.abs(o.x - h.x), dy = Math.abs(o.y - h.y); if (dx > range) continue;
      let s = dx + dy * 2.2; if (o.body.plat === h.body.plat) s -= 260; if (o.aggro === h) s -= 300; if (o.boss && !G.map.instance) s += 400;
      if (h.fake && o.tagged && o.tagged !== h && o.tagged.kind === 'hero' && !h.fake.bad && !h.inParty) s += 500;   // polite players leave your kills alone
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }
  chooseSkill(tg, dist) {
    const h = this.h, d = h.data; let best = null;
    const nearby = () => { let n = 0; for (const o of G.actors) if (h.enemyOf(o) && Math.abs(o.x - h.x) < 240 && Math.abs(o.y - h.y) < 120) n++; return n; };
    let crowd = -1;
    for (const id of d.bar) {
      const sk = SKILLS[id]; if (!sk || !ready(h, sk)) continue;
      if (sk.kind === 'buff') { if (!h.buffs.some(b => b.id === id)) return sk; continue; }
      if (sk.kind === 'heal') { if (h.hp < h.maxHp * 0.6) return sk; continue; }
      if (sk.kind === 'summon') { const cap = Math.min(10, sk.m.max || Math.max(sk.m.n || 1, 3)); if (h.summons.filter(s => !s.dead && s.skId === id).length < Math.min(cap, sk.m.n || 1)) return sk; continue; }
      if (sk.kind === 'zone' && (sk.m.heal || sk.m.follow)) { if (dist < 200) best = best || sk; continue; }
      if (h.cls !== 'barbarian' && h.mp < h.maxMp * 0.2 && costOf(h, sk) > 0) continue;
      if (dist > reach(sk)) continue;
      if (['nova', 'whirl'].includes(sk.kind)) { if (crowd < 0) crowd = nearby(); if (crowd >= 2 || tg.boss) return sk; continue; }
      if (['dash', 'leap', 'blink'].includes(sk.kind)) { if (dist > 150 && !h.ranged) return sk; continue; }
      if (!best || sk.row > best.row || (sk.row === best.row && Math.random() < 0.4)) best = sk;
    }
    if (best && (Math.random() < 0.75 || tg.boss)) return best;
    const basic = SKILLS[d.basic]; return basic && ready(h, basic) && dist <= reach(basic) ? basic : (best || null);
  }
  /** Fight tg: close in, keep range if ranged, throw skills. */
  fight(tg) {
    const h = this.h, dx = tg.x - h.x, adx = Math.abs(dx), dy = Math.abs(tg.y - h.y), basic = SKILLS[h.data.basic];
    const want = h.ranged ? Math.min(380, reach(basic) * 0.75) : Math.max(60, reach(basic) - 34 + tg.w * 0.35);
    h.target = tg;
    if (tg.body.plat && h.body.plat && tg.body.plat !== h.body.plat && dy > 50 && !tg.body.fly) { this.go(tg.x, tg.body.plat, want); if (!(h.ranged && adx < 460 && dy < 150)) return; }
    else if (adx > want) this.move = Math.sign(dx);
    else if (h.ranged && adx < 130 && !tg.boss && this.t > 0) this.move = -Math.sign(dx);
    else { this.move = 0; }
    if (h.busy || h.body.rope) return;
    if (adx <= want + 60 || h.ranged) {
      const sk = this.chooseSkill(tg, adx); if (!sk) return;
      if (dy > 150 && !['buff', 'heal', 'summon'].includes(sk.kind)) return;
      h.body.face = dx >= 0 ? 1 : -1;
      cast(h, sk, tg);
    }
  }
  potions() {
    const h = this.h; this.potT -= G.dt; if (this.potT > 0 || h.dead) return;
    if (h.isPlayer) { const c = G.char; if (h.hp < h.maxHp * 0.42 && c.potions.hp > 0) { G.game.usePotion('hp'); this.potT = 1.2; } else if (h.cls !== 'barbarian' && h.mp < h.maxMp * 0.22 && c.potions.mp > 0) { G.game.usePotion('mp'); this.potT = 1.2; } }
    else if (h.hp < h.maxHp * 0.35) { heal(h, h.maxHp * 0.4); this.potT = h.inParty ? 6 : 9; sfxAt('potion', h, 0.3); }
    else if (h.mp < h.maxMp * 0.15 && h.cls !== 'barbarian') { h.mp = Math.min(h.maxMp, h.mp + h.maxMp * 0.5); this.potT = 7; }
  }
  tick(dt) {
    const h = this.h, g = this.goal; this.move = 0; this.want = {}; this.t -= dt; if (this.t < -1) this.t = rnd(0.5, 1.5);
    if (h.dead) return;
    this.potions();
    if (this.wait > 0) { this.wait -= dt; }
    else if (g.type === 'grind' || g.type === 'duel') {
      let tg = h.target; this.scan = (this.scan || 0) - dt;
      if (!tg || tg.dead || tg.remove || !h.enemyOf(tg) || this.scan <= 0 || (g.filter && !g.filter(tg))) { this.scan = 0.6; const n = this.pickTarget(g.range || 1400); if (n && (!tg || tg.dead || tg.remove || n.aggro === h || Math.abs(n.x - h.x) + 200 < Math.abs(tg.x - h.x))) tg = n; if (tg && (tg.dead || tg.remove)) tg = null; h.target = tg; }
      if (tg) this.fight(tg);
      else if (g.home) { if (this.go(g.home.x, g.home.plat, 60)) { if (chance(0.01)) g.home = this.roam(); } }
      else { this.roamT = (this.roamT || 0) - dt; if (!this.roamTo || this.roamT <= 0) { this.roamTo = this.roam(); this.roamT = 8; } if (this.go(this.roamTo.x, this.roamTo.plat, 50)) this.roamTo = null; }
    } else if (g.type === 'follow') {
      const L = g.leader; let tg = L.target && !L.target.dead && h.enemyOf(L.target) ? L.target : null;
      if (!tg) { const n = this.pickTarget(520); if (n && (n.aggro || G.map.instance || n.kind === 'hero')) tg = n; }
      const far = Math.abs(L.x - h.x) > (tg ? 900 : 190 + (g.slot || 0) * 46) || Math.abs(L.y - h.y) > 150;
      if (tg && Math.abs(L.x - h.x) < 1100) this.fight(tg);
      else if (far && !L.dead) { if (Math.abs(L.x - h.x) > 1500 || (Math.abs(L.y - h.y) > 520 && L.body.plat)) { h.body.place(G.map.geo, L.x - L.face * 40, L.y - 10); h.spawnT = 0.25; } else this.go(L.x - L.face * (60 + (g.slot || 0) * 40), L.body.plat || h.body.plat, 50); }
    } else if (g.type === 'goto') { if (this.go(g.x, g.plat, g.tol || 24)) { const f = g.then; this.goal = { type: 'idle' }; if (f) f(); } }
    else if (g.type === 'town') {
      // loiter: drift to a spot, stand a while, maybe hop for no reason
      if (!g.to) { g.to = this.roam(true); g.stay = rnd(4, 22); }
      if (this.go(g.to.x, g.to.plat, 30)) { g.stay -= dt; if (chance(0.004)) this.want.jump = true; if (g.stay <= 0) g.to = null; h.body.face = g.faceTo ? Math.sign(g.faceTo.x - h.x) || 1 : h.body.face; }
    }
    if (h.body.rope && !this.want.up && !this.want.down) { this.want.jump = true; if (!this.move) this.move = h.face; }   // nothing to climb for: let go
    if (h.status.stun > 0 || h.status.freeze > 0) { this.move = 0; this.want = {}; }
    if (h.useT > 0 && !h.whirl) this.move *= h.ranged ? 0.25 : 0.4;
    const ev = h.body.step(G.map.geo, dt, this.move, this.want);
    if (ev === 'land') h.squash = -0.14; else if (ev === 'jump') h.squash = 0.1;
  }
  roam(town) { const geo = G.map.geo, ps = geo.plats.filter(p => (town ? !p.small : !p.small || chance(0.3))), p = pick(ps); return { x: rnd(p.x1 + 60, p.x2 - 60), plat: p }; }
}
