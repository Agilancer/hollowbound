// Drawing actors. The art has no animation frames, so every motion is a transform of the
// one image: walk bob and rock, squash and stretch on jumps and landings, a lunge for
// attacks, a lift and lean-back for casts, recoil when hurt, a topple on death.
import { G, clamp } from '../state.js';
import { SHAPES } from './fx.js';
import { heroSprite, slimeFrame, peopleFrame } from './sprites.js';
import { dropTo } from '../game/body.js';
import { rarityColor } from '../game/items.js';

const M = [1, 0, 0, 1, 0, 0], TINT = [1, 1, 1, 1], FL = [1, 1, 1, 0];
const sstep = (t) => t * t * (3 - 2 * t);

export function drawShadow(rd, a) {
  const b = a.body; let gy = b.y;
  if (!b.plat) { const p = dropTo(G.map.geo, b.x, b.y); if (!p) return; gy = p.y; }
  const d = Math.min(1, (gy - b.y) / 260), w = Math.max(30, a.w * 1.35) * (1 - d * 0.5);
  rd.quad(SHAPES.shadow, b.x - w / 2, gy - w * 0.11, w, w * 0.26, [1, 1, 1, (a.alpha) * (0.9 - d * 0.6)]);
}

export function drawActor(rd, a, light) {
  let sp = a.sprite;
  if (a.kind === 'hero') sp = heroSprite(a);
  if (!sp) return;
  let r = sp.r;
  const b = a.body, t = a.animT, moving = Math.abs(b.vx) > 20 && b.plat;
  if (sp.slime) { r = slimeFrame(sp, a.dead ? 'die' : a.hurtT > 0.3 ? 'hurt' : a.lunge > 0.2 ? 'attack' : moving ? 'walk' : 'idle', a.dead ? Math.min(0.55, a.deadT) : t); }
  else if (sp.people) r = peopleFrame(sp, a.dead ? 'dead' : a.emote && a.emoteT > 0 ? a.emote : 'idle');
  if (!r || r.layer < 0) return;
  let dir = b.face < 0 ? -1 : 1; if (sp.faceL) dir = -dir;
  let k = sp.k * (a.scale || 1), sx = 1, sy = 1, rot = 0, lift = 0, ox = 0;
  const run = 11 * Math.min(1.5, Math.abs(b.vx) / 215 + 0.35);
  if (b.rope) { rot = Math.sin(t * 9) * (Math.abs(b.vy) + 1 > 0 ? 0.05 : 0); sx = 0.94; const cl = Math.sin(a.y * 0.09); rot = cl * 0.07; lift = Math.abs(cl) * 2; }
  else if (b.fly) { lift = Math.sin(t * 3) * 5; sy = 1 + Math.sin(t * 6) * 0.03; rot = clamp(b.vx / 900, -0.12, 0.12) * dir; }
  else if (!b.plat) { const v = clamp(b.vy / 900, -1, 1); sy = 1 + Math.abs(v) * 0.09; sx = 1 - Math.abs(v) * 0.06; rot = (v < 0 ? 0.08 : -0.05) * dir * (Math.abs(b.vx) > 30 ? 1 : 0.3); }
  else if (moving) {
    if (a.def && a.def.hop) { const h = Math.abs(Math.sin(t * 7)); lift = h * 10; sy = 1 + (h - 0.5) * 0.24; sx = 1 - (h - 0.5) * 0.18; }
    else { lift = Math.abs(Math.sin(t * run)) * (a.kind === 'hero' ? 4.6 : 3); const s = Math.sin(t * run * 2) * 0.045; sy = 1 + s; sx = 1 - 0.6 * s; rot = Math.sin(t * run) * 0.05 * dir + 0.06 * dir; }
  } else { const br = Math.sin(t * 2.1); sy = 1 + 0.014 * br; sx = 1 - 0.007 * br; }
  if (a.squash) { sy *= 1 + a.squash; sx *= 1 - a.squash * 0.7; }
  if (a.lunge > 0) { const L = a.lunge; ox += dir * Math.sin(Math.min(1, L) * Math.PI * 0.5) * 16; rot += dir * L * 0.2; sy *= 1 - L * 0.05; sx *= 1 + L * 0.05; }
  if (a.castT > 0) { const c = a.castT; lift += Math.sin(c * Math.PI) * 9; rot -= dir * c * 0.11; sy *= 1 + c * 0.05; }
  if (a.hurtT > 0) { rot -= dir * a.hurtT * 0.22; ox -= dir * a.hurtT * 7; }
  if (a.status.stun > 0) rot += Math.sin(t * 22) * 0.06;
  if (a.spin) sx *= Math.cos(a.spin * 9);
  if (a.spawnT > 0) k *= sstep(1 - a.spawnT / 0.3);
  let alpha = a.alpha;
  if (a.dead) {
    const u = Math.min(1, a.deadT * 2.4);
    if (a.kind === 'hero') { rot = -dir * sstep(u) * 1.45; lift = 6 * u; alpha *= a.deadT > 4 ? Math.max(0, 1 - (a.deadT - 4)) : 1; }
    else if (!sp.slime) { rot = -dir * sstep(u) * 1.3; sy *= 1 - u * 0.25; alpha *= Math.max(0, 1 - Math.max(0, a.deadT - 0.5) * 1.8); }
    else alpha *= Math.max(0, 1 - Math.max(0, a.deadT - 0.4) * 2.5);
  }
  if (a.inv > 0 && a.kind === 'hero' && !a.dead && a.hurtInv) alpha *= 0.55 + 0.35 * Math.sin(t * 30);
  const c = Math.cos(rot), s = Math.sin(rot), kx = dir * sx * k, ky = sy * k;
  M[0] = c * kx; M[1] = s * kx; M[2] = -s * ky; M[3] = c * ky; M[4] = b.x + ox; M[5] = b.y - lift;
  const fz = a.status.freeze > 0, dk = a.dead && a.kind === 'mob' ? 0.55 : 1;
  TINT[0] = light[0] * dk * (fz ? 0.6 : 1); TINT[1] = light[1] * dk * (fz ? 0.85 : 1); TINT[2] = light[2] * dk * (fz ? 1.3 : 1); TINT[3] = alpha;
  if (a.aura) {   // transform buffs and elites wear a soft glow behind them
    const g = a.aura, gs = a.h * 1.7 * (1 + Math.sin(t * 4) * 0.05);
    rd.quad(SHAPES.glow, b.x - gs / 2, b.y - a.h * 0.5 - gs / 2 - lift, gs, gs, [g[0], g[1], g[2], 0.42 * alpha], null, 1);
  }
  let flash = null;
  if (a.flash > 0) { FL[0] = a.flashCol ? a.flashCol[0] : 1; FL[1] = a.flashCol ? a.flashCol[1] : 1; FL[2] = a.flashCol ? a.flashCol[2] : 1; FL[3] = Math.min(0.5, a.flash * 1.1); flash = FL; }
  rd.affine(r, M, -sp.ax, -sp.ay, sp.w, sp.h, TINT, flash, 0);
  a._top = b.y - lift - a.h * (a.scale > 1 ? 1 : 1) - 6;     // where bars and bubbles sit
}

/** Name tags, guild tags, hp bars and chat bubbles: drawn after all bodies. */
export function drawOverlay(rd, a) {
  const T = G.text, b = a.body;
  if (a.dead && a.kind !== 'hero') return;
  const top = (a._top ?? (b.y - a.h)) - (a.kind === 'mob' ? 8 : 4);
  if (a.kind === 'mob') {
    if (a.barT > 0 || a.boss || a.elite) {
      const w = clamp(a.w * 1.1, 44, 150), f = clamp(a.hp / a.maxHp, 0, 1), x = b.x - w / 2, y = top - 8;
      rd.rect(x - 1.5, y - 1.5, w + 3, 8, [0, 0, 0, 0.75]); rd.rect(x, y, w * f, 5, a.elite ? [1, 0.72, 0.15, 1] : [0.86, 0.14, 0.12, 1]);
      if (G.settings.names || a.elite) T.draw(rd, T.tag('Lv.' + a.lvl + ' ' + a.name, a.elite ? '#ffc04a' : a.lvl > G.player.lvl + 4 ? '#ff7a6a' : '#e8e0d0'), b.x, y - 26, Math.min(1, a.barT + (a.elite ? 1 : 0)));
    }
  } else if (a.kind === 'hero') {
    const col = a.isPlayer ? '#ffe9a0' : a.inParty ? '#9fd0ff' : a.team === 2 ? '#ff8a7a' : a.fake && a.fake.bad ? '#e8d0d0' : '#ffffff';
    const e = T.tag(a.name, col, a.guild ? '<' + a.guild + '>' : '', a.guildColor || '#c9b27a');
    let ty = b.y + 5; if (e) { const tags = G._tags || (G._tags = []); for (let k = 0; k < 3; k++) { if (tags.some(q => Math.abs(q[0] - b.x) < (q[2] + e.w) / 2 && Math.abs(q[1] - ty) < 20)) ty += 22; else break; } tags.push([b.x, ty, e.w]); }
    T.draw(rd, e, b.x, ty, a.alpha);
    if (a.isPlayer) rd.quad(SHAPES.shard, b.x - 5, (a._top ?? b.y - a.h) - 20 + Math.sin(G.time * 4) * 2, 10, 14, [1, 0.85, 0.3, 0.9]);
    if (!a.isPlayer && (a.inParty || a.barT > 0 || a.team === 2) && !a.dead) {
      const w = 54, f = clamp(a.hp / a.maxHp, 0, 1), x = b.x - w / 2, y = top - 4;
      rd.rect(x - 1.5, y - 1.5, w + 3, 7, [0, 0, 0, 0.7]); rd.rect(x, y, w * f, 4, a.team === 2 ? [0.9, 0.2, 0.15, 1] : [0.25, 0.85, 0.35, 1]);
    }
  } else if (a.kind === 'npc') {
    { const e = T.tag(a.name, '#ffd98a', a.title || '', '#b8a888'); let ty = b.y + 5; if (e) { const tags = G._tags || (G._tags = []); for (let k = 0; k < 3; k++) { if (tags.some(q => Math.abs(q[0] - b.x) < (q[2] + e.w) / 2 && Math.abs(q[1] - ty) < 30)) ty += 34; else break; } tags.push([b.x, ty, e.w]); } T.draw(rd, e, b.x, ty); }
    if (a.mark) { const m = SHAPES[a.mark], bob = Math.sin(G.time * 3.2) * 4; rd.quad(SHAPES.glow, b.x - 30, top - 66 + bob, 60, 60, a.mark === 'book' ? [0.6, 0.6, 0.6, 0.25] : [1, 0.8, 0.2, 0.4], null, 1); rd.quad(m, b.x - 17, top - 62 + bob, 34, 34 * m.h / m.w); }
  } else if (a.kind === 'summon' && a.barT > 0) {
    const w = 40, f = clamp(a.hp / a.maxHp, 0, 1); rd.rect(b.x - w / 2, top - 4, w * f, 3, [0.3, 0.8, 0.9, 0.9]);
  }
  if (a.say) {
    const e = T.bubble(a.say, a.sayKind);
    if (e) { const al = Math.min(1, a.sayT * 3), pop = Math.min(1, (a.sayDur - a.sayT) * 8 || 1); T.draw(rd, e, b.x, top - e.h - (a.kind === 'mob' ? 22 : 8), al, 1); }
  }
}

/** A dropped item or coin pile. */
export function drawDrop(rd, d) {
  const bob = d.landed ? Math.sin(G.time * 3 + d.seed) * 3 : 0, al = d.t < 2 ? d.t / 2 : 1;
  if (d.kind === 'gold') { const n = d.amount > 200 ? 3 : d.amount > 40 ? 2 : 1; for (let i = 0; i < n; i++) rd.quad(SHAPES.coin, d.x - 8 + (i - (n - 1) / 2) * 9, d.y - 17 - bob - (i % 2) * 4, 16, 16, [1, 1, 1, al]); return; }
  const c = d.color;
  if (d.rarity >= 2) { const gs = 46 + d.rarity * 8; rd.quad(SHAPES.glow, d.x - gs / 2, d.y - 14 - gs / 2 - bob, gs, gs, [c[0], c[1], c[2], 0.5 * al], null, 1); if (d.rarity >= 3) rd.quad(SHAPES.pillar, d.x - 9, d.y - 150, 18, 150, [c[0], c[1], c[2], 0.5 * al], null, 1); }
  const m = [Math.cos(d.rot), Math.sin(d.rot), -Math.sin(d.rot), Math.cos(d.rot), d.x, d.y - 14 - bob];
  if (d.icon && d.icon.layer >= 0) rd.affine(d.icon, m, -13, -13, 26, 26, [1, 1, 1, al]);
  else rd.affine(SHAPES.shard, m, -6, -12, 12, 24, [c[0], c[1], c[2], al]);
}
export const hexRgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const rarityRgb = (r) => hexRgb(rarityColor(r));
