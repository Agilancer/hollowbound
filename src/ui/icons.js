// Icons. Skills: painted sheets for five classes, procedural glyphs (element colour +
// a mark per skill kind) for the rest. Items: the held-gear icon rects for weapons and
// off-hands, the replacement atlas for armour and jewellery.
import { G } from '../state.js';
import { ELEM } from '../data/velscour/elem.js';
import { HELD_START, HELD_PER, heldSetOf } from '../data/held.js';
import { rarityColor } from '../game/items.js';
import { h, A, loadImg, loadJson } from './dom.js';

const SHEET = new Set(['monk', 'necromancer', 'paladin', 'ranger', 'wizard']);
const procCache = new Map();

const GLYPH = {
  melee(g) { g.beginPath(); g.arc(22, 44, 30, -1.45, 0.1); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(22, 44, 21, -1.3, -0.1); g.stroke(); },
  proj(g) { line(g, 14, 50, 46, 18); g.beginPath(); g.moveTo(50, 14); g.lineTo(34, 18); g.lineTo(46, 30); g.closePath(); g.fill(); g.lineWidth = 2; line(g, 12, 38, 22, 28); line(g, 26, 52, 36, 42); },
  nova(g) { g.beginPath(); g.arc(32, 32, 11, 0, 7); g.stroke(); g.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(g, 32 + Math.cos(a) * 16, 32 + Math.sin(a) * 16, 32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24); } },
  aoe(g) { g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? 9 : 22; g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 33 + Math.sin(a) * r); } g.closePath(); g.fill(); },
  beam(g) { g.lineWidth = 7; line(g, 12, 46, 52, 20); g.lineWidth = 2; line(g, 12, 34, 46, 12); line(g, 20, 54, 54, 32); },
  chain(g) { g.lineJoin = 'miter'; g.beginPath(); g.moveTo(12, 16); g.lineTo(30, 24); g.lineTo(22, 34); g.lineTo(44, 38); g.lineTo(36, 46); g.lineTo(54, 52); g.stroke(); },
  wall(g) { g.lineWidth = 6; line(g, 18, 18, 18, 48); line(g, 32, 14, 32, 48); line(g, 46, 18, 46, 48); g.lineWidth = 2; line(g, 10, 52, 54, 52); },
  zone(g) { g.beginPath(); g.ellipse(32, 44, 22, 8, 0, 0, 7); g.stroke(); g.lineWidth = 3; line(g, 22, 32, 22, 22); line(g, 32, 28, 32, 12); line(g, 42, 32, 42, 22); },
  orbit(g) { g.lineWidth = 2; g.beginPath(); g.ellipse(32, 32, 22, 12, -0.5, 0, 7); g.stroke(); dot(g, 32, 32, 6); dot(g, 13, 42, 4); dot(g, 51, 22, 4); dot(g, 40, 44, 3); },
  cyclone(g) { g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i * 0.36, r = 2 + i * 0.55; g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r * 0.8); } g.stroke(); },
  whirl(g) { g.beginPath(); g.arc(32, 32, 18, 0.3, 2.6); g.stroke(); g.beginPath(); g.arc(32, 32, 18, 3.44, 5.74); g.stroke(); tri(g, 49, 37, 12, 1.0); tri(g, 15, 27, 12, 4.14); },
  leap(g) { g.setLineDash([5, 5]); g.beginPath(); g.arc(30, 48, 26, Math.PI, -0.35); g.stroke(); g.setLineDash([]); tri(g, 52, 44, 15, 1.7); g.lineWidth = 2; line(g, 40, 54, 60, 54); },
  dash(g) { line(g, 10, 22, 34, 22); line(g, 6, 32, 40, 32); line(g, 10, 42, 34, 42); tri(g, 50, 32, 18, 0); },
  blink(g) { diamond(g, 16, 44, 8, false); diamond(g, 46, 20, 11, true); g.lineWidth = 2; g.setLineDash([3, 4]); line(g, 22, 38, 38, 26); g.setLineDash([]); },
  summon(g) { g.beginPath(); g.arc(32, 28, 15, Math.PI * 0.85, Math.PI * 0.15); g.lineTo(40, 46); g.lineTo(24, 46); g.closePath(); g.fill(); g.globalCompositeOperation = 'destination-out'; dot(g, 26, 28, 4.2); dot(g, 38, 28, 4.2); g.fillRect(31, 36, 2, 6); g.globalCompositeOperation = 'source-over'; },
  buff(g) { chev(g, 32, 20); chev(g, 32, 32); chev(g, 32, 44); },
  curse(g) { g.beginPath(); g.moveTo(8, 32); g.quadraticCurveTo(32, 8, 56, 32); g.quadraticCurveTo(32, 56, 8, 32); g.stroke(); dot(g, 32, 32, 7); },
  heal(g) { g.lineWidth = 10; g.lineCap = 'butt'; line(g, 32, 14, 32, 50); line(g, 14, 32, 50, 32); },
  trap(g) { g.lineJoin = 'miter'; g.beginPath(); g.moveTo(8, 26); for (let i = 0; i < 6; i++) g.lineTo(12 + i * 8 + 4, i % 2 ? 26 : 36), g.lineTo(12 + i * 8 + 8, 26); g.stroke(); g.beginPath(); g.moveTo(8, 46); for (let i = 0; i < 6; i++) g.lineTo(12 + i * 8, i % 2 ? 46 : 38), g.lineTo(12 + i * 8 + 4, 46); g.stroke(); },
  rain(g) { for (const [x, y] of [[18, 12], [34, 8], [50, 14], [26, 30], [42, 30]]) { line(g, x, y, x - 6, y + 14); } g.lineWidth = 2; line(g, 10, 54, 54, 54); },
  strike(g) { g.beginPath(); g.moveTo(36, 6); g.lineTo(22, 30); g.lineTo(31, 30); g.lineTo(24, 50); g.lineTo(44, 24); g.lineTo(34, 24); g.closePath(); g.fill(); g.lineWidth = 2; line(g, 12, 56, 52, 56); },
  fissure(g) { g.lineJoin = 'miter'; g.beginPath(); g.moveTo(6, 40); g.lineTo(18, 34); g.lineTo(24, 44); g.lineTo(34, 30); g.lineTo(42, 42); g.lineTo(58, 32); g.stroke(); g.lineWidth = 2; line(g, 20, 26, 20, 16); line(g, 34, 20, 34, 10); line(g, 46, 26, 46, 16); },
  corpse(g) { g.lineWidth = 6; line(g, 16, 16, 48, 48); line(g, 48, 16, 16, 48); for (const [x, y] of [[13, 19], [19, 13], [45, 51], [51, 45], [51, 19], [45, 13], [13, 45], [19, 51]]) dot(g, x, y, 4); },
};
function line(g, a, b, c, d) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
function dot(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
function tri(g, x, y, s, a) { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(-s / 2, -s / 2); g.lineTo(-s / 2, s / 2); g.closePath(); g.fill(); g.restore(); }
function diamond(g, x, y, r, fill) { g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * 0.7, y); g.lineTo(x, y + r); g.lineTo(x - r * 0.7, y); g.closePath(); fill ? g.fill() : g.stroke(); }
function chev(g, x, y) { g.beginPath(); g.moveTo(x - 13, y + 6); g.lineTo(x, y - 6); g.lineTo(x + 13, y + 6); g.stroke(); }

function procIcon(sk) {
  let url = procCache.get(sk.id); if (url) return url;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), E = ELEM[sk.el] || ELEM.phys;
  const cx = [20, 44, 44, 20][sk.tree % 4], cy = [22, 22, 44, 44][sk.tree % 4];
  g.fillStyle = '#0c0a10'; g.fillRect(0, 0, 64, 64);
  const rg = g.createRadialGradient(cx, cy, 2, 32, 32, 46); rg.addColorStop(0, E.glow); rg.addColorStop(0.45, E.dark); rg.addColorStop(1, '#07060a');
  g.globalAlpha = 0.8; g.fillStyle = rg; g.fillRect(0, 0, 64, 64); g.globalAlpha = 1;
  // a few scratches so no two icons of a kind read the same
  let s = 0; for (const ch of sk.id + sk.name) s = (s * 31 + ch.charCodeAt(0)) >>> 0; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.strokeStyle = E.glow; g.globalAlpha = 0.22; g.lineWidth = 1.5; for (let i = 0; i < 5; i++) { const x = r() * 64, y = r() * 64, a = r() * 6.3, l = 10 + r() * 22; line(g, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l); }
  g.globalAlpha = 1;
  g.save(); g.translate(32, 32); g.rotate((r() - 0.5) * 0.35); if (r() < 0.5 && !['buff', 'heal', 'rain', 'strike', 'wall', 'zone', 'fissure', 'summon'].includes(sk.kind)) g.scale(-1, 1); g.scale(0.9, 0.9); g.translate(-32, -32);
  g.strokeStyle = g.fillStyle = E.core; g.lineWidth = 4.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = E.glow; g.shadowBlur = 9;
  (GLYPH[sk.kind] || GLYPH.aoe)(g); g.restore();
  // rank row pips
  g.fillStyle = E.core; g.globalAlpha = 0.85; for (let i = 0; i <= sk.row; i++) { g.beginPath(); g.arc(8 + i * 7, 57, 2.2, 0, 7); g.fill(); }
  url = c.toDataURL(); procCache.set(sk.id, url); return url;
}
/** Paint a skill's icon into an element as a background. */
export function paintSkill(el, sk) {
  if (!sk) { el.style.backgroundImage = ''; return el; }
  if (SHEET.has(sk.classId)) { el.style.backgroundImage = `url(${A('ui/skills/' + sk.classId + '_skills.png')})`; el.style.backgroundSize = '900% 400%'; el.style.backgroundPosition = `${sk.idx / 8 * 100}% ${sk.tree / 3 * 100}%`; }
  else { el.style.backgroundImage = `url(${procIcon(sk)})`; el.style.backgroundSize = '100% 100%'; el.style.backgroundPosition = '0 0'; }
  return el;
}
export const skillIcon = (sk, cls = '') => paintSkill(h('div.skicon' + (cls ? '.' + cls : '')), sk);

// ------------------------------------------------------------------ items
const ATLAS = A('sprites/replacements/atlas');
const GEMS = ['gem_ruby', 'gem_sapphire', 'gem_emerald', 'gem_amethyst', 'gem_topaz', 'gem_onyx', 'gem_opal', 'gem_bloodstone', 'gem_moonstone', 'gem_sunstone'];
function drawFit(c, img, x, y, w, hh, pad = 3) { const S = c.width - pad * 2, k = Math.min(S / w, S / hh), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(img, x, y, w, hh, pad + (S - w * k) / 2, pad + (S - hh * k) / 2, w * k, hh * k); }
async function drawAtlas(c, key) { const [j, img] = await Promise.all([loadJson(ATLAS + '.json'), loadImg(ATLAS + '.webp')]); const r = j && j[key]; if (r && img) drawFit(c, img, r.x, r.y, r.w, r.h, 6); }
async function drawHeld(c, it, cls) {
  const set = heldSetOf(it.base, it.slot, it.cls || cls); if (!set) return drawAtlas(c, it.slot === 'offhand' ? 'item_armor' : 'gem_onyx');
  const base = A('sprites/held/' + set), [j, img] = await Promise.all([loadJson(base + '.json'), loadImg(base + '.webp')]); if (!j || !img) return;
  const R = Math.min(5, it.rarity | 0), d = j.designs[HELD_START[R] + ((it.look ? it.look[0] : 0) % HELD_PER[R])] || j.designs[0];
  if (d && d.icon) drawFit(c, img, ...d.icon, 2);
}
export function atlasIcon(key, size = 48) { const c = h('canvas', { width: size * 2, height: size * 2 }); drawAtlas(c, key); return c; }
/** A framed item icon (rarity-coloured). `it` may be a shop potion entry. */
export function itemIcon(it, cls) {
  const el = h('div.iticon');
  if (!it) return el;
  if (it.type === 'potion') { el.append(h('img', { src: A(it.pot === 'hp' ? 'ui/potion_red.png' : 'ui/potion_blue.png'), draggable: false })); return el; }
  el.style.setProperty('--rc', rarityColor(it.rarity));
  if (it.mystery) { el.classList.add('mystery'); el.append(h('span.q', '?')); return el; }
  const c = h('canvas', { width: 96, height: 96 }); el.append(c);
  if (it.slot === 'weapon' || it.slot === 'offhand') drawHeld(c, it, cls || G.char?.cls);
  else drawAtlas(c, it.slot === 'body' ? 'item_armor' : it.slot === 'head' ? 'item_helm' : it.slot === 'ring' ? 'ring_' + (it.id % 3) : GEMS[it.id % GEMS.length]);
  if (it.plus) el.append(h('span.plus', '+' + it.plus));
  return el;
}
