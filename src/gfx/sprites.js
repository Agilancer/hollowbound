// Sprite sources: monsters as atlas cells, animated slimes, and composed hero looks kept
// in recycled atlas slots (a hero image is redrawn only when its gear changes).
import { G } from '../state.js';
import { SlotPool } from '../gpu/atlas.js';
import { loadLook, composeHero, designsFor, FEET } from './herolook.js';
import { lookOf, lookKey } from '../game/items.js';
import { asset } from '../core/paths.js';

// ------------------------------------------------------------------ monsters
export function mobSprite(def, scope = 'map') {
  const at = G.rd.atlas;
  if (def.slime) {
    const s = def.slime, base = at.get(def.url, scope), sp = { slime: true, base, def, k: def.k, frames: null, w: s.cw, h: s.ch, ax: s.ax, ay: s.ay, faceL: s.face === 'L' };
    return sp;
  }
  const r = at.cell(def.url, def.x, def.y, def.w, def.h, scope);
  return { r, w: def.w, h: def.h, ax: def.fx, ay: def.h, k: def.hw / def.h };
}
const SLIME_FPS = { idle: 5, walk: 8, run: 10, jump: 8, attack: 10, hurt: 10, die: 8, squish: 8 };
/** Region of a slime's current frame. anim: idle|walk|attack|hurt|die */
export function slimeFrame(sp, anim, t) {
  const s = sp.def.slime, base = sp.base; if (base.layer < 0) return null;
  let row = s.rows.indexOf(anim); if (row < 0) row = s.rows.indexOf(anim === 'hurt' ? 'squish' : anim === 'die' ? 'squish' : 'idle'); if (row < 0) row = 0;
  const n = Array.isArray(s.n) ? s.n[row] : s.n || 3, f = Math.floor(t * (SLIME_FPS[anim] || 6)) % n;
  const key = row * 16 + f; sp.frames = sp.frames || {};
  let r = sp.frames[key];
  if (!r || r.layer !== base.layer) r = sp.frames[key] = G.rd.atlas.sub(base, f * s.cw, row * s.ch, s.cw, s.ch);
  return r;
}

// ------------------------------------------------------------------ heroes
const HD = 2;
let pool = null, bigPool = null;
const looks = new Map();          // key -> { key, r, hd, tip, hand, refs, used, ready }
export function heroSprite(hero) {
  const cls = hero.cls, big = hero.isPlayer;
  const designs = designsFor(cls);
  const look = lookOf(cls, hero.equip, designs.helms.length || Object.keys(designs.armor).length ? designs : null);
  const key = (big ? 'B' : '') + lookKey(cls, look);
  if (hero.sprite && hero.sprite.key === key && hero.sprite.ready) { hero.sprite.used = G.frame; return hero.sprite; }
  let e = looks.get(key);
  if (!e) {
    e = { key, r: null, hd: big ? 4 : HD, ready: false, used: G.frame, w: 128, h: 192, ax: 64, ay: FEET, k: 1, hero: true };
    looks.set(key, e);
    loadLook(cls, look).then(() => {
      // the class art may only now be known: resolve designs again and compose
      const l2 = lookOf(cls, hero.equip, designsFor(cls)), c = composeHero(cls, l2, e.hd);
      if (!c) return;
      pool = pool || new SlotPool(G.rd.atlas, 128 * HD, 192 * HD, 21); bigPool = bigPool || new SlotPool(G.rd.atlas, 512, 768, 3);
      const slot = (big ? bigPool : pool).take(); if (!slot) return;
      G.rd.atlas.update(slot, c.canvas);
      e.r = slot; e.pool = big ? bigPool : pool; e.tip = c.tip; e.hand = c.hand; e.ready = true; e.key2 = lookKey(cls, l2);
    }).catch((err) => console.warn('hero look', err.message));
  }
  e.used = G.frame;
  // keep showing the old image until the new one is ready
  if (e.ready || !hero.sprite) hero.sprite = e;
  return hero.sprite;
}
export function sweepLooks() {
  if (looks.size < 70) return;
  for (const [k, e] of looks) if (e.ready && G.frame - e.used > 600) { e.pool.give(e.r); e.ready = false; looks.delete(k); }
}
/** NPC art: { va } vendor portraits, { people } townsfolk strips, { sheet } a character's own painted poses
 *  (assets/sprites/npc/<sheet>.webp + .json, Velscour's cut), { mob } a creature, { hero } an adventurer. */
let peopleMeta = null, vaMeta = null;
const sheetMeta = {};
export async function loadNpcMeta() {
  const { NPCS } = await import('../data/npcs.js');
  const sheets = [...new Set(Object.values(NPCS).map(n => n.sprite && n.sprite.sheet).filter(Boolean))];
  [peopleMeta, vaMeta] = await Promise.all([fetch(asset('sprites/people/manifest.json')).then(r => r.json()).catch(() => null), fetch(asset('sprites/replacements/atlas.json')).then(r => r.json()).catch(() => null),
    ...sheets.map(id => fetch(asset('sprites/npc/' + id + '.json')).then(r => r.json()).then(m => { sheetMeta[id] = m; }).catch(() => null))]);
}
export function npcSprite(spec, scope = 'map') {
  const at = G.rd.atlas;
  if (spec.sheet && sheetMeta[spec.sheet]) {   // stand = the figure's painted height; draw him as tall as a vendor (118) and a touch more
    const m = sheetMeta[spec.sheet], [w, h] = m.cell, url = asset('sprites/npc/' + spec.sheet + '.webp');
    const idle = spec.idle || [Object.keys(m.poses)[0]];
    const sp = { sheet: true, url, poses: m.poses, idle, emo: spec.emo || {}, w, h, ax: w / 2, ay: h, k: (spec.ht || 124) / m.stand, cells: {}, scope };
    sp.r = sheetPose(sp, idle[0]);
    return sp;
  }
  if (spec.va && vaMeta && vaMeta[spec.va]) { const c = vaMeta[spec.va]; return { r: at.cell(asset('sprites/replacements/atlas.webp'), c.x, c.y, c.w, c.h, scope), w: c.w, h: c.h, ax: c.w / 2, ay: c.h, k: 118 / c.h }; }
  if (spec.people && peopleMeta) {
    const sh = peopleMeta.sheets.find(s => s.id === spec.people) || peopleMeta.sheets[0];
    const url = asset('sprites/people/' + sh.id + '.webp'), frames = sh.frames || peopleMeta.standardFrames, idleH = sh.idleH || 170;
    const sp = { people: true, url, frames, w: 256, h: 200, ax: 128, ay: 194, k: (sh.kind === 'animal' ? 60 : 112) / idleH, cells: {}, scope };
    sp.r = at.cell(url, 0, 0, 256, 200, scope); sp.cells.idle = sp.r;
    return sp;
  }
  return null;
}
/** One pose of a { sheet } NPC; `name` is a pose or a town emotion (mapped by spec.emo). Falls back to the
 *  first idle pose while a new cell uploads. */
export function sheetPose(sp, name) {
  if (sp.emo[name]) name = sp.emo[name];
  if (!(name in sp.poses)) name = sp.idle[0];
  let r = sp.cells[name];
  if (!r) r = sp.cells[name] = G.rd.atlas.cell(sp.url, sp.poses[name] * sp.w, 0, sp.w, sp.h, sp.scope);
  if (r.layer >= 0) return r;
  const f = sp.cells[sp.idle[0]]; return f && f.layer >= 0 ? f : r;
}
export function peopleFrame(sp, name) {
  let r = sp.cells[name]; if (r) return r.layer >= 0 ? r : sp.cells.idle;
  const i = sp.frames.indexOf(name); if (i < 0) return sp.cells.idle;
  sp.cells[name] = G.rd.atlas.cell(sp.url, i * 256, 0, 256, 200, sp.scope);
  return sp.cells.idle;
}
