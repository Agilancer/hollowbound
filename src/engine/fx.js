// Particles, sprite effects, floating numbers, camera shake.
import { img, need } from './assets.js';
import { drawText } from './font.js';
import { input } from './input.js';

const FX_SHEETS = {
  blood: 'fx/blood',
  bloodGreen: 'fx/blood_green',
  bloodBlue: 'fx/blood_blue',
  stars: 'fx/stars',
  starsWhite: 'fx/stars_white',
  buff: 'fx/buff',
  hearts: 'fx/hearts',
  linesYellow: 'fx/lines_yellow',
  debuff: 'fx/debuff_black',
  curved: 'fx/curved_orange',
};
Object.values(FX_SHEETS).forEach((k) => need(k));

export class FX {
  constructor() {
    this.parts = [];
    this.sprites = [];
    this.texts = [];
    this.shakeT = 0; this.shakeMag = 0;
    this.flash = 0; this.flashColor = '255,255,255';
  }

  /** count particles at x,y. o: {color(s), speed, life, gravity, size, spread, up, drag, glow} */
  burst(x, y, count, o = {}) {
    const colors = Array.isArray(o.color) ? o.color : [o.color || '#fff'];
    for (let i = 0; i < count; i++) {
      const ang = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread ?? Math.PI * 2) : Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 60) * (0.4 + Math.random() * 0.8);
      this.parts.push({
        x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (o.up ?? 0),
        life: (o.life ?? 0.5) * (0.6 + Math.random() * 0.6), t: 0,
        g: o.gravity ?? 300, size: o.size ?? 1, drag: o.drag ?? 0,
        color: colors[(Math.random() * colors.length) | 0], glow: !!o.glow, bounce: !!o.bounce, map: o.map,
      });
    }
  }

  /** Play one of the 5-frame 80x64 character effect sheets centred on feet (x, y). */
  sprite(kind, x, y, opts = {}) {
    this.sprites.push({ key: FX_SHEETS[kind], x, y, t: 0, fps: opts.fps ?? 14, follow: opts.follow, oy: opts.follow ? y - opts.follow.y : 0, flip: opts.flip });
  }

  text(x, y, str, color = '#fff', opts = {}) {
    this.texts.push({ x, y, str, color, t: 0, life: opts.life ?? 0.8, vy: opts.vy ?? -34, big: opts.big });
  }

  shake(mag, time = 0.2) {
    if (mag >= 4) input.rumble('quake', Math.min(1.2, mag / 7));   // slams, roars, the gate: felt in the hands too
    if (mag >= this.shakeMag * (this.shakeT > 0 ? 1 : 0)) { this.shakeMag = mag; this.shakeT = time; }
  }

  flashScreen(a = 0.6, color = '255,255,255') { this.flash = a; this.flashColor = color; }

  shakeOffset() {
    if (this.shakeT <= 0) return [0, 0];
    const m = this.shakeMag * Math.min(1, this.shakeT * 8);
    return [Math.round((Math.random() * 2 - 1) * m), Math.round((Math.random() * 2 - 1) * m)];
  }

  update(dt) {
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    for (const p of this.parts) {
      p.t += dt;
      p.vy += p.g * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.bounce && p.map && p.map.solidAtPx(nx, ny)) {
        if (p.map.solidAtPx(p.x, ny)) { p.vy *= -0.35; p.vx *= 0.7; } else p.vx *= -0.5;
      } else { p.x = nx; p.y = ny; }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    for (const s of this.sprites) s.t += dt;
    this.sprites = this.sprites.filter((s) => s.t * s.fps < 5);
    for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; t.vy *= 1 - 3 * dt; }
    this.texts = this.texts.filter((t) => t.t < t.life);
  }

  draw(ctx, cx, cy) {
    for (const s of this.sprites) {
      const f = Math.floor(s.t * s.fps);
      const x = s.follow ? s.follow.x : s.x, y = s.follow ? s.follow.y + s.oy : s.y;
      ctx.save();
      if (s.flip) { ctx.translate(Math.round(x - cx), 0); ctx.scale(-1, 1); ctx.drawImage(img(s.key), f * 80, 0, 80, 64, -40, Math.round(y - cy - 64), 80, 64); }
      else ctx.drawImage(img(s.key), f * 80, 0, 80, 64, Math.round(x - cx - 40), Math.round(y - cy - 64), 80, 64);
      ctx.restore();
    }
    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.fillStyle = p.color;
      const s = p.size >= 2 && a < 0.4 ? p.size - 1 : p.size;
      ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), s, s);
    }
    ctx.globalAlpha = 1;
  }

  drawGlow(ctx, cx, cy) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (!p.glow) continue;
      const a = (1 - p.t / p.life) * 0.5;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.fillRect(Math.round(p.x - cx) - 1, Math.round(p.y - cy) - 1, p.size + 2, p.size + 2);
    }
    ctx.restore();
  }

  drawTexts(ctx, cx, cy) {
    for (const t of this.texts) {
      const a = t.t > t.life * 0.6 ? 1 - (t.t - t.life * 0.6) / (t.life * 0.4) : 1;
      ctx.globalAlpha = a;
      const pop = t.t < 0.08 ? -2 : 0;
      drawText(ctx, t.str, t.x - cx, t.y - cy + pop, t.color, { align: 'center', outline: '#1a1014' });
    }
    ctx.globalAlpha = 1;
  }

  drawFlash(ctx, w, h) {
    if (this.flash <= 0) return;
    ctx.fillStyle = `rgba(${this.flashColor},${this.flash})`;
    ctx.fillRect(0, 0, w, h);
  }
}

export class Camera {
  constructor(w, h) { this.w = w; this.h = h; this.x = 0; this.y = 0; this.look = 0; }
  snap(tx, ty, bounds, frame = 0.62) { this.x = tx - this.w / 2; this.y = ty - this.h * frame; this.look = 0; this.clamp(bounds); }
  follow(target, dt, bounds, opts = {}) {
    // lookahead in facing/moving direction, eased
    const want = (target.facing || 0) * 36 + (target.vx || 0) * 0.12;
    this.look += (want - this.look) * Math.min(1, dt * 2.2);
    const tx = target.x + this.look - this.w / 2;
    let ty = target.y - this.h * (opts.frame || 0.62) + (opts.lookDown || 0);
    const k = 1 - Math.pow(0.0008, dt);
    this.x += (tx - this.x) * k;
    // vertical: lazy unless the target leaves the middle band
    const dy = ty - this.y;
    const band = 28;
    if (Math.abs(dy) > band || target.onGround) this.y += (dy - Math.sign(dy) * (target.onGround ? 0 : band)) * Math.min(1, dt * (target.onGround ? 4 : 6));
    this.clamp(bounds);
  }
  clamp(b) {
    this.x = Math.max(b.x0, Math.min(b.x1 - this.w, this.x));
    this.y = Math.max(b.y0, Math.min(b.y1 - this.h, this.y));
    if (b.x1 - b.x0 < this.w) this.x = (b.x0 + b.x1 - this.w) / 2;
  }
}
