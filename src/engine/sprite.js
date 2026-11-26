// Layered character sheets (skin + clothes + hair + hat + hand item ...) baked to one canvas.
import { img, need, canvas } from './assets.js';

export const FW = 80, FH = 64;
// Rows of every character layer (drawn by tools/art/chars.py). Sheets face LEFT.
export const ROWS = {
  idle: { row: 0, n: 5, fps: 7 },
  walk: { row: 1, n: 8, fps: 11 },
  run: { row: 2, n: 8, fps: 13 },
  jump: { row: 3, n: 4, fps: 12 },
  fall: { row: 4, n: 4, fps: 12 },
  attack: { row: 5, n: 6, fps: 16 },
  death: { row: 6, n: 10, fps: 11 },
};

const cache = new Map();

/** Declare layer images so they preload. Returns the list unchanged. */
export function layers(...keys) {
  const list = keys.flat().filter(Boolean);
  list.forEach((k) => need(k));
  return list;
}

function layerImage(key) { return img(key); }

/** A solid-colour silhouette of a baked sheet (wind-up tells), cached per colour. */
export function silhouette(baked, rgb) {
  baked.sil = baked.sil || {};
  if (baked.sil[rgb]) return baked.sil[rgb];
  const [c, g] = canvas(baked.sheet.width, baked.sheet.height);
  g.drawImage(baked.sheet, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = `rgb(${rgb})`;
  g.fillRect(0, 0, c.width, c.height);
  baked.sil[rgb] = c;
  return c;
}

/** Bake layers into one sheet (+ a white silhouette for hit flashes). Cached by layer list. */
export function bake(list, tint = null, k = 1) {
  const id = list.join('|') + (tint || '') + 'x' + k;
  let s = cache.get(id);
  if (s) return s;
  // sheets drawn natively at 2x (1600 wide) are used as they are; 800-wide ones are scaled up
  const native = Math.max(1, Math.round((layerImage(list[0]).naturalWidth || layerImage(list[0]).width || 800) / 800));
  let [c, g] = canvas(800 * native, 448 * native);
  for (const key of list) g.drawImage(layerImage(key), 0, 0);
  if (tint) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
  }
  if (k === 2 && native === 1) c = scale2x(c);
  k = Math.max(k, native);
  const [w, wg] = canvas(c.width, c.height);
  wg.drawImage(c, 0, 0);
  wg.globalCompositeOperation = 'source-in';
  wg.fillStyle = '#fff';
  wg.fillRect(0, 0, c.width, c.height);
  s = { sheet: c, white: w, k };
  cache.set(id, s);
  return s;
}

/** Draw a character frame with feet at (x, y). facing: 1 = right, -1 = left. */
export function drawChar(ctx, baked, anim, frame, x, y, facing, opts = {}) {
  const a = ROWS[anim];
  const col = Math.min(frame, a.n - 1);
  const src = opts.tint ? silhouette(baked, opts.tint) : opts.white ? baked.white : baked.sheet;
  const dx = Math.round(x), dy = Math.round(y), k = opts.scale || 1, sk = baked.k || 1;
  const sx = col * FW * sk, sy = a.row * FH * sk, sw = FW * sk, sh = FH * sk;
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (facing > 0) {
    ctx.translate(dx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, sy, sw, sh, -40 * k, dy - FH * k, FW * k, FH * k);
  } else {
    ctx.drawImage(src, sx, sy, sw, sh, dx - 40 * k, dy - FH * k, FW * k, FH * k);
  }
  ctx.restore();
}

/** Simple frame animator. */
export class Anim {
  constructor() { this.name = 'idle'; this.t = 0; this.frame = 0; this.done = false; this.speed = 1; }
  play(name, restart = false) {
    if (this.name === name && !restart) return;
    this.name = name; this.t = 0; this.frame = 0; this.done = false;
  }
  update(dt, def, loop = true) {
    this.t += dt * this.speed;
    const f = Math.floor(this.t * def.fps);
    if (loop) this.frame = f % def.n;
    else { this.frame = Math.min(f, def.n - 1); this.done = f >= def.n; }
  }
}

/** Generic grid sheet frame draw (feet-anchored, centred). */
export function drawCell(ctx, key, fw, fh, col, row, x, y, facing = -1, opts = {}) {
  const im = img(key);
  const dx = Math.round(x), dy = Math.round(y);
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.flipDefault ? facing < 0 : facing > 0) {
    ctx.translate(dx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(im, col * fw, row * fh, fw, fh, -fw / 2, dy - fh, fw, fh);
  } else {
    ctx.drawImage(im, col * fw, row * fh, fw, fh, dx - fw / 2, dy - fh, fw, fh);
  }
  ctx.restore();
}

/** Crop a head-and-shoulders portrait from a baked sheet (idle frame 0). */
export function portrait(baked) {
  const sk = baked.k || 1;
  const [c, g] = canvas(24, 24);
  g.drawImage(baked.sheet, 28 * sk, 16 * sk, 24 * sk, 24 * sk, 0, 0, 24, 24);
  return scale2x(c);
}

/** Scale2x (EPX): doubles pixel art while rounding diagonal steps, so enlarged
 *  sprites keep 1-pixel-wide outlines instead of chunky 2x2 blocks. */
export function scale2x(src) {
  const w = src.width, h = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, w, h);
  const s32 = new Uint32Array(sd.data.buffer);
  const [c, g] = canvas(w * 2, h * 2);
  const od = g.createImageData(w * 2, h * 2);
  const o32 = new Uint32Array(od.data.buffer);
  const W2 = w * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = s32[y * w + x];
      const A = y > 0 ? s32[(y - 1) * w + x] : P;
      const D = y < h - 1 ? s32[(y + 1) * w + x] : P;
      const C = x > 0 ? s32[y * w + x - 1] : P;
      const B = x < w - 1 ? s32[y * w + x + 1] : P;
      const i = y * 2 * W2 + x * 2;
      o32[i] = C === A && C !== D && A !== B ? A : P;
      o32[i + 1] = A === B && A !== C && B !== D ? B : P;
      o32[i + W2] = D === C && D !== B && C !== A ? C : P;
      o32[i + W2 + 1] = B === D && B !== A && D !== C ? D : P;
    }
  }
  g.putImageData(od, 0, 0);
  return c;
}
