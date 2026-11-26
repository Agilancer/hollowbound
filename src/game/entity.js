import { moveX, moveY, grounded } from '../engine/tiles.js';
import { img, canvas } from '../engine/assets.js';

export class Entity {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hw = 6; this.h = 16;
    this.facing = -1;
    this.dead = false;
    this.onGround = false;
    this.hitWall = false;
    this.z = 0;          // draw order within the entity layer
    this.team = 'neutral';
  }

  physics(dt, world, gravity = 900, maxFall = 420, dropping = false) {
    this.vy = Math.min(this.vy + gravity * dt, maxFall);
    this.hitWall = moveX(world.map, this, this.vx * dt);
    if (this.hitWall) this.wallVx = this.vx;
    const r = moveY(world.map, this, this.vy * dt, dropping);
    if (r) this.vy = r === 'floor' ? 0 : Math.max(0, this.vy);
    this.onGround = this.vy >= 0 && grounded(world.map, this);
    return r;
  }

  box() { return { x0: this.x - this.hw, x1: this.x + this.hw, y0: this.y - this.h, y1: this.y }; }
  dist(o) { return Math.hypot(o.x - this.x, (o.y - o.h / 2) - (this.y - this.h / 2)); }
  update() {}
  draw() {}
}

export function overlap(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

const whites = new Map();
/** White silhouette of any sheet (for hit flashes). */
export function whiteOf(key) {
  let c = whites.get(key);
  if (c) return c;
  const src = img(key);
  let g;
  [c, g] = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  whites.set(key, c);
  return c;
}

const darks = new Map();
/** A cold, unlit copy of a sheet (used for the forge before the Hearthstone returns). */
export function darkOf(key) {
  let c = darks.get(key);
  if (c) return c;
  const src = img(key);
  let g;
  [c, g] = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(30,26,38,0.6)';
  g.fillRect(0, 0, c.width, c.height);
  darks.set(key, c);
  return c;
}

/** Draw a rect from PROPS-style spec [key,x,y,w,h], bottom-centre anchored. */
export function drawSpec(ctx, spec, x, y, flip = false, alpha = 1) {
  const [key, sx, sy, w, h] = spec;
  const dx = Math.round(x - w / 2), dy = Math.round(y - h);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(dx + w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img(key), sx, sy, w, h, 0, 0, w, h);
    ctx.restore();
  } else ctx.drawImage(img(key), sx, sy, w, h, dx, dy, w, h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** Draw one frame of an ANIMS entry, bottom-centre anchored at (x, y). */
export function drawAnim(ctx, a, t, x, y, flip = false, alpha = 1, frameOverride = null, dark = false) {
  const i = frameOverride ?? Math.floor(t * a.fps) % a.frames.length;
  const [c, r] = a.frames[i];
  const src = dark ? darkOf(a.key) : img(a.key);
  const dx = Math.round(x - a.fw / 2), dy = Math.round(y - a.fh);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(dx + a.fw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(src, c * a.fw, r * a.fh, a.fw, a.fh, 0, 0, a.fw, a.fh);
    ctx.restore();
  } else ctx.drawImage(src, c * a.fw, r * a.fh, a.fw, a.fh, dx, dy, a.fw, a.fh);
  if (alpha !== 1) ctx.globalAlpha = 1;
}
