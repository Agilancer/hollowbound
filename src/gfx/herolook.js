// The hero compositor, ported from Velscour (src/core/gearart.js, src/gfx/heldart.js,
// src/core/helmetfit.js). A hero is one still image: the armor cell IS the body, recoloured
// by a palette ("finish"); a helmet cell is fitted over the head; the weapon and off-hand
// are laid in the fists from the baked held-gear sets. All of Velscour's fit data is used
// as-is (gear.json head offsets, helmet index/placements, held index fists + per-design offs).
import { PALETTES } from '../data/gear.js';
import { HELD_PER, HELD_START, heldSetOf } from '../data/held.js';

import { ASSETS } from '../core/paths.js';
const BASE = ASSETS + 'sprites/gear/', HELD = ASSETS + 'sprites/held/';
const MARTIAL = new Set(['monk', 'rogue', 'ninja']);
const FINISH_K = { ninja: 0.35, rogue: 0.5 };
export const FW = 128, FH = 192, FEET = 183, HEAD_TOP = 75;
export const ELEMENT_COL = {
  holy: [255, 216, 96], fire: [255, 106, 32], cold: [122, 208, 255], light: [170, 190, 255], poison: [138, 255, 80],
  shadow: [160, 112, 255], arcane: [74, 168, 255], acid: [80, 255, 144], blood: [255, 48, 64], astral: [200, 210, 255], phys: [255, 216, 160],
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mk = (w, h) => new OffscreenCanvas(w, h);

async function img(url) { const r = await fetch(url); if (!r.ok) throw new Error(url); return createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); }
function pixels(im) { const c = mk(im.width, im.height), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height); }
const json = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.json(); });

const classes = new Map();      // cls -> { meta, armor(ImageData), amask(Uint8Array) }
const helmSets = {};            // 'helmet' | 'martial' -> { meta, atlas(ImageData), placements, boxes }
const heldSets = new Map();     // set -> { meta, img, data(ImageData) }
let heldIndex = null;
const pending = new Map();
const once = (k, fn) => { let p = pending.get(k); if (!p) { p = fn(); pending.set(k, p); } return p; };

function atlasBoxes(atlas, meta) {
  const [cw, ch] = meta.frame, boxes = [];
  for (let row = 0; row < meta.designs.length; row++) for (let col = 0; col < meta.cols; col++) {
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (!atlas.data[((row * ch + y) * atlas.width + col * cw + x) * 4 + 3]) continue;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    boxes[row * meta.cols + col] = x1 >= 0 ? [x0, y0, x1 + 1, y1 + 1] : [0, 0, 0, 0];
  }
  return boxes;
}
const helmKind = (cls) => (MARTIAL.has(cls) ? 'martial' : 'helmet');
const loadHelms = (kind) => once('helm:' + kind, async () => {
  const dir = BASE + (kind === 'martial' ? 'helmets_martial/' : 'helmets/');
  const [meta, im, placements] = await Promise.all([json(dir + 'index.json'), img(dir + 'atlas.webp'), json(dir + 'placements.json').catch(() => ({ classes: {} }))]);
  const atlas = pixels(im);
  helmSets[kind] = { meta, atlas, placements, boxes: atlasBoxes(atlas, meta) };
});
export const loadHeldIndex = () => once('heldindex', async () => { heldIndex = await json(HELD + 'index.json'); });
const loadHeldSet = (set) => once('held:' + set, async () => {
  const [meta, im] = await Promise.all([json(HELD + set + '.json'), img(HELD + set + '.webp')]);
  heldSets.set(set, { meta, img: im, data: pixels(im) });
});

/** Load everything needed to compose `cls` wearing `look`. */
export function loadLook(cls, look) {
  const jobs = [once('cls:' + cls, async () => {
    const dir = BASE + cls + '/';
    const [meta, armor, mask] = await Promise.all([json(dir + 'gear.json'), img(dir + 'armor.webp'), img(dir + 'armor_mask.png')]);
    const md = pixels(mask).data, amask = new Uint8Array(md.length / 4);
    for (let i = 0; i < amask.length; i++) amask[i] = md[i * 4];
    classes.set(cls, { cls, meta, armor: pixels(armor), amask });
  }), loadHeldIndex()];
  if (look?.helm) jobs.push(loadHelms(helmKind(cls)));
  for (const slot of ['weapon', 'offhand']) {
    const it = look?.[slot], set = it && heldSetOf(it.base, slot, cls);
    if (set) jobs.push(loadHeldSet(set));
  }
  return Promise.all(jobs);
}
export const gearMeta = (cls) => classes.get(cls)?.meta || null;
export const helmMeta = (cls) => helmSets[helmKind(cls)]?.meta || null;

// ---------------------------------------------------------------- palettes (as Velscour)
const lutCache = new Map();
function luts(pi) {
  let L = lutCache.get(pi); if (L) return L; L = {};
  for (const [m, stops] of Object.entries(PALETTES[pi].ramps)) {
    const rgb = stops.map(hexToRgb), n = rgb.length - 1, t = new Float32Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const u = (i / 255) * n, j = Math.min(n - 1, Math.floor(u)), f = u - j;
      for (let c = 0; c < 3; c++) t[i * 3 + c] = (rgb[j][c] * (1 - f) + rgb[j + 1][c] * f) / 255;
    }
    L[m] = t;
  }
  lutCache.set(pi, L); return L;
}
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function recolorPx(d, i, L, k) {
  const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn, s = mx > 0 ? dd / mx : 0;
  let h = 0;
  if (dd > 1e-6) h = mx === r ? (((g - b) / dd) % 6 + 6) % 6 * 60 : mx === g ? ((b - r) / dd + 2) * 60 : ((r - g) / dd + 4) * 60;
  const lum = r * 0.299 + g * 0.587 + b * 0.114, warm = h >= 12 && h <= 62 ? 1 : 0;
  let wT = ss(0.35, 0.55, s) * ss(0.42, 0.62, mx) * warm;
  let wL = ss(0.25, 0.45, s) * (1 - ss(0.42, 0.62, mx)) * warm;
  const wN = (1 - ss(0.2, 0.42, s)) * (1 - wT) * (1 - wL);
  const rest = Math.max(0, 1 - wT - wN - wL), bright = ss(0.42, 0.62, mx), wC = rest * (1 - warm);
  wT += rest * warm * bright; wL += rest * warm * (1 - bright);
  const li = Math.round(clamp((lum - 0.02) * 1.2, 0, 1) * 255) * 3;
  let nr = 0, ng = 0, nb = 0;
  if (wN > 0) { nr += L.metal[li] * wN; ng += L.metal[li + 1] * wN; nb += L.metal[li + 2] * wN; }
  if (wC > 0) { nr += L.cloth[li] * wC; ng += L.cloth[li + 1] * wC; nb += L.cloth[li + 2] * wC; }
  if (wT > 0) { nr += L.trim[li] * wT; ng += L.trim[li + 1] * wT; nb += L.trim[li + 2] * wT; }
  if (wL > 0) { nr += L.leather[li] * wL; ng += L.leather[li + 1] * wL; nb += L.leather[li + 2] * wL; }
  const nl = nr * 0.299 + ng * 0.587 + nb * 0.114, f = (lum + 0.01) / (nl + 0.01);
  d[i] = (r * (1 - k) + Math.min(1, nr * f) * k) * 255;
  d[i + 1] = (g * (1 - k) + Math.min(1, ng * f) * k) * 255;
  d[i + 2] = (b * (1 - k) + Math.min(1, nb * f) * k) * 255;
}
function toCanvas(px, w, h) { const c = mk(w, h); c.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0); return c; }

function armorPixels(src, id, pi) {
  const { meta, armor, amask } = src, [fw, fh] = meta.frame;
  id = clamp(id | 0, 1, meta.armor.n);
  const sx = ((id - 1) % meta.cols) * fw, sy = Math.floor((id - 1) / meta.cols) * fh, aw = armor.width;
  const out = new Uint8ClampedArray(fw * fh * 4), pal = PALETTES[pi] || PALETTES[0], L = pal.k ? luts(pi) : null;
  const k = pal.k * (FINISH_K[src.cls] ?? 1);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const si = (sy + y) * aw + sx + x, o = (y * fw + x) * 4;
    if (!armor.data[si * 4 + 3]) continue;
    out[o] = armor.data[si * 4]; out[o + 1] = armor.data[si * 4 + 1]; out[o + 2] = armor.data[si * 4 + 2]; out[o + 3] = armor.data[si * 4 + 3];
    if (L && !amask[si]) recolorPx(out, o, L, k);
  }
  return out;
}
function helmetPixels(cls, id, pi) {
  const data = helmSets[helmKind(cls)], [cw, ch] = data.meta.frame;
  const hc = data.meta.classes.includes(cls) ? cls : 'barbarian', col = data.meta.classes.indexOf(hc);
  const sx = col * cw, sy = (id - 1) * ch, aw = data.atlas.width;
  const out = new Uint8ClampedArray(cw * ch * 4), pal = PALETTES[pi] || PALETTES[0], L = pal.k ? luts(pi) : null;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const si = (sy + y) * aw + sx + x, o = (y * cw + x) * 4;
    if (!data.atlas.data[si * 4 + 3]) continue;
    out[o] = data.atlas.data[si * 4]; out[o + 1] = data.atlas.data[si * 4 + 1]; out[o + 2] = data.atlas.data[si * 4 + 2]; out[o + 3] = data.atlas.data[si * 4 + 3];
    if (L) recolorPx(out, o, L, pal.k * (FINISH_K[cls] ?? 1));
  }
  return { px: out, box: data.boxes[(id - 1) * data.meta.cols + col] || [0, 0, cw, ch], hc };
}
// src/core/helmetfit.js
function resolveHelmetFit(meta, placements, cls, design, headTop) {
  const f = meta.fit, [w] = meta.frame;
  const fb = { x: f.xAnchor - w * f.scaleX / 2 + (f.xOffset || 0),
    y: headTop + f.baselineOffset - (f.sourceBaseline || 0) * f.scaleY + (f.yOffset || 0), scaleX: f.scaleX, scaleY: f.scaleY, rotation: 0 };
  return { ...fb, ...(placements?.classes?.[cls]?.[String(design)] || {}) };
}

// ---------------------------------------------------------------- held gear
const MAT = { 1: 'metal', 2: 'trim', 3: 'leather' };
function heldSprite(S, d, finish, element) {
  const [x, y, w, h] = d.held, mr = d.mask, aw = S.data.width, src = S.data.data;
  const out = new Uint8ClampedArray(w * h * 4);
  const L = finish && PALETTES[finish]?.ramps ? luts(finish) : null, k = finish ? PALETTES[finish].k : 0;
  const ec = ELEMENT_COL[element] || ELEMENT_COL.arcane;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const si = ((y + j) * aw + x + i) * 4, mi = ((mr[1] + j) * aw + mr[0] + i) * 4, o = (j * w + i) * 4;
    if (!src[si + 3]) continue;
    let r = src[si] / 255, g = src[si + 1] / 255, b = src[si + 2] / 255;
    out[o + 3] = src[si + 3];
    const code = src[mi + 3] ? Math.round(src[mi] / 40) : 0, lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (code === 4) {
      const s = Math.min(1.35, lum * 1.7), wh = Math.max(0, lum - 0.72) * 2.4;
      out[o] = Math.min(255, ec[0] * s * (1 - wh) + 255 * wh); out[o + 1] = Math.min(255, ec[1] * s * (1 - wh) + 255 * wh); out[o + 2] = Math.min(255, ec[2] * s * (1 - wh) + 255 * wh);
    } else if (L && MAT[code]) {
      const t = L[MAT[code]] || L.metal, li = Math.round(lum * 255) * 3, nr = t[li], ng = t[li + 1], nb = t[li + 2];
      const f = (lum + 0.01) / (nr * 0.299 + ng * 0.587 + nb * 0.114 + 0.01);
      out[o] = (r * (1 - k) + Math.min(1, nr * f) * k) * 255; out[o + 1] = (g * (1 - k) + Math.min(1, ng * f) * k) * 255; out[o + 2] = (b * (1 - k) + Math.min(1, nb * f) * k) * 255;
    } else { out[o] = r * 255; out[o + 1] = g * 255; out[o + 2] = b * 255; }
  }
  return toCanvas(out, w, h);
}
/** A held design's bag icon (48x48 canvas), recolour-free. */
export function heldIconRect(set, idx) { const S = heldSets.get(set); const d = S?.meta.designs[idx]; return d ? { img: S.img, rect: d.icon } : null; }

/**
 * Compose a hero. look = { armor:[design,finish], helm:[design,finish]|null,
 *   weapon:{base,rarity,idx,finish,element}|null, offhand:{...}|null }.
 * Returns { canvas, hd, tip:[x,y]|null (weapon tip, art px), hand:[x,y] } — canvas is FW*hd x FH*hd.
 * Everything must have been loaded with loadLook first.
 */
export function composeHero(cls, look, hd = 2) {
  const src = classes.get(cls); if (!src) return null;
  const { meta } = src, [fw, fh] = meta.frame;
  const a = look.armor || [1, 0];
  const c = mk(fw * hd, fh * hd), x = c.getContext('2d');
  const body = toCanvas(armorPixels(src, a[0], a[1] | 0), fw, fh);
  // held pieces
  const fists = heldIndex?.fists?.[cls], F = fists ? fists[clamp(a[0], 1, fists.length) - 1] : null;
  const pcs = [];
  if (F) for (const slot of ['weapon', 'offhand']) {
    const it = look[slot]; if (!it) continue;
    const set = heldSetOf(it.base, slot, cls), S = set && heldSets.get(set); if (!S) continue;
    const R = clamp(it.rarity | 0, 0, 5), i = HELD_START[R] + clamp(it.idx | 0, 0, HELD_PER[R] - 1), d = S.meta.designs[i];
    if (!d || pcs.some(p => p.hand === S.meta.hand)) continue;
    const f = F[S.meta.hand];
    pcs.push({ S, d, hand: S.meta.hand, x: f[0] + d.off[0], y: f[1] + d.off[1], f, behind: +S.meta.behind || 0, shadow: S.meta.shadow,
      spr: heldSprite(S, d, it.finish | 0, it.element || d.element), slot });
  }
  x.imageSmoothingEnabled = false;
  const drawPiece = (p) => x.drawImage(p.spr, p.x * hd, p.y * hd, p.spr.width * hd, p.spr.height * hd);
  for (const p of pcs) if (p.behind) drawPiece(p);
  x.drawImage(body, 0, 0, fw * hd, fh * hd);
  if (look.helm && helmSets[helmKind(cls)]) {
    const H = helmSets[helmKind(cls)], id = clamp(look.helm[0] | 0, 1, H.meta.designs.length);
    const { px, box, hc } = helmetPixels(cls, id, look.helm[1] | 0);
    const f = resolveHelmetFit(H.meta, H.placements, hc, id, meta.headTop ?? 75);
    const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const [hdx, hdy] = meta.armor?.head?.[a[0] - 1] || [0, 0];
    x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.scale(hd, hd); x.translate(f.x + cx * f.scaleX + hdx, f.y + cy * f.scaleY + hdy); x.rotate((f.rotation || 0) * Math.PI / 180);
    x.scale(f.scaleX, f.scaleY); x.drawImage(toCanvas(px, ...H.meta.frame), -cx, -cy); x.restore();
    x.imageSmoothingEnabled = false;
  }
  for (const p of pcs) {           // contact shadow, darkening only the hero under the piece
    const sh = p.shadow; if (!sh || p.behind) continue;
    const t = mk(p.spr.width, p.spr.height), tx = t.getContext('2d');
    tx.drawImage(p.spr, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#0c0806'; tx.fillRect(0, 0, t.width, t.height);
    x.globalAlpha = sh[2]; x.globalCompositeOperation = 'source-atop';
    x.drawImage(t, (p.x + sh[0]) * hd, (p.y + sh[1]) * hd, t.width * hd, t.height * hd);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }
  for (const p of pcs) if (!p.behind) drawPiece(p);
  const w = pcs.find(p => p.slot === 'weapon');
  const tip = w && w.d.pts?.tip ? [w.f[0] + w.d.pts.tip[0], w.f[1] + w.d.pts.tip[1]] : null;
  return { canvas: c, hd, tip, hand: w ? w.f : F ? F.R : [48, 133] };
}

/** Design choices available to a class: armor bands by rarity name and helmet ids by rarity. */
export function designsFor(cls) {
  const m = gearMeta(cls), h = helmMeta(cls);
  return { armor: m?.armor.bands || {}, helms: h ? h.designs.map(d => ({ id: d.id, rarity: d.rarity })) : [] };
}
