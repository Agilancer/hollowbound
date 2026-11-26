// HUD, dialog boxes, shop, toasts, banners, pause menu.
import { drawText, measure, wrap, LINE_H } from '../engine/font.js';
import { img, canvas } from '../engine/assets.js';
import { input } from '../engine/input.js';
import { sfx, isMuted, toggleMute } from '../engine/audio.js';
import { ICON } from './data.js';

export const W = 480, H = 270;
const INK = '#f4ead2', DIM = '#a89a88', GOLD = '#ffd36a', RED = '#ff6b6b';
const HINT_Y = 5, HINT_W = 208;   // text width that clears the HUD on the left (x < 124)

export function panel(ctx, x, y, w, h, a = 0.94) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = `rgba(22,16,26,${a})`;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = '#e2c08a';
  ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1);
  ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
  ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1);
  ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
  ctx.fillStyle = '#5a4030';
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
}

// Icons past the sheet's 8 cells are pixel-drawn here.
const EMBER_ICON = [
  '.....a......',
  '....ab......',
  '....abb..a..',
  '...abbb.ab..',
  '..abbcbbab..',
  '..abbccbbb..',
  '.abbccdcbba.',
  '.abccddccba.',
  '.abcddddcba.',
  '..abcddcba..',
  '...aabbaa...',
  '............',
];
const EMBER_INK = { a: '#7a2414', b: '#d8501c', c: '#ff9a2a', d: '#ffe08a' };
// A cut blue gem (the cave's loose gems): table facet on top, deep pavilion below.
const GEM_ICON = [
  '............',
  '...aaaaaa...',
  '..abccccba..',
  '.abcdddccba.',
  'aabbbbbbbbaa',
  '.abcccbbbba.',
  '..abccbbba..',
  '...abcbba...',
  '....abba....',
  '.....aa.....',
  '............',
  '............',
];
const GEM_INK = { a: '#101e4a', b: '#2a5fb0', c: '#5ab4ff', d: '#e0f6ff' };
const CODE_ICONS = { 8: [EMBER_ICON, EMBER_INK], 9: [GEM_ICON, GEM_INK] };
const codeIcons = {};
function codeIcon(i) {
  if (!codeIcons[i] && CODE_ICONS[i]) {
    const [rows, ink] = CODE_ICONS[i];
    const [c, g] = canvas(12, 12);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ink[ch]) { g.fillStyle = ink[ch]; g.fillRect(x, y, 1, 1); } }));
    codeIcons[i] = c;
  }
  return codeIcons[i];
}
export function icon(ctx, i, x, y) {
  if (i >= 8) { const c = codeIcon(i); if (c) ctx.drawImage(c, Math.round(x), Math.round(y)); return; }
  ctx.drawImage(img('ui/icons'), i * 12, 0, 12, 12, Math.round(x), Math.round(y), 12, 12);
}

/** Big text: render small then scale up by an integer. */
const bigCache = new Map();
export function bigText(ctx, str, x, y, scale, color, shadow = '#1a1014') {
  const id = str + scale + color + shadow;
  let c = bigCache.get(id);
  if (!c) {
    const w = measure(str) + 2, h = 12;
    const [s, g] = canvas(w, h);
    drawText(g, str, 0, 1, shadow); drawText(g, str, 1, 1, shadow); drawText(g, str, 1, 2, shadow); drawText(g, str, 0, 2, shadow);
    drawText(g, str, 0, 0, color);
    c = s;
    bigCache.set(id, c);
  }
  ctx.drawImage(c, 0, 0, c.width, c.height, Math.round(x - (c.width * scale) / 2), Math.round(y), c.width * scale, c.height * scale);
}

export class UI {
  constructor(game) {
    this.game = game;
    this.queue = null;      // active dialog {lines, i, shown, t, done}
    this.shopState = null;
    this.toasts = [];
    this.coinBump = 0; this.stamFlash = 0;
    this.bannerT = 0; this.bannerText = null; this.bannerY = 84; this.bannerDur = 3.6;
    this.boss = null;
    this.hpShown = null;
    this.paused = false; this.pauseSel = 0; this.showControls = false;
    this.hint = null; this.hintT = 0;
  }

  get busy() { return !!(this.queue || this.shopState || this.paused); }

  // ------------------------------------------------ requests
  toast(text, iconName = null) {
    this.toasts.push({ text, icon: iconName != null ? ICON[iconName] : null, t: 0 });
    if (this.toasts.length > 3) this.toasts.shift();
  }
  bumpCoins() { this.coinBump = 0.25; }
  flashStamina() { this.stamFlash = 0.4; }
  banner(title, sub, o = {}) { this.bannerText = [title, sub]; this.bannerT = 0; this.bannerY = o.y ?? 84; this.bannerDur = o.dur ?? 3.6; }
  say(who, text, onDone) { this.dialog([{ who, text }], onDone); }
  /** lines: [{who, text, portrait, choices:[{label, fn}]}] */
  dialog(lines, onDone) {
    this.queue = { lines, i: 0, shown: 0, t: 0, onDone, sel: 0 };
    // a place-name banner shouldn't hang over the conversation: jump it to its fade-out
    if (this.bannerText) this.bannerT = Math.max(this.bannerT, this.bannerDur - 0.7);
    input.swallow();
  }
  shop(title, items, onClose) {
    this.shopState = { title, items, sel: 0, onClose, msg: null, msgT: 0 };
    input.swallow();
    sfx('select');
  }
  showHint(text, t = 4) { this.hint = text; this.hintT = t; }
  get bannerUp() { return !!(this.bannerText && this.bannerT < this.bannerDur); }

  // ------------------------------------------------ update
  update(dt) {
    this.coinBump = Math.max(0, this.coinBump - dt);
    this.stamFlash = Math.max(0, this.stamFlash - dt);
    this.bannerT += dt;
    // a hint waits out a banner (they share the top of the screen) instead of being lost under it
    if (!this.bannerUp) this.hintT = Math.max(0, this.hintT - dt);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 3.2);

    if (this.paused) return this.updatePause();
    if (this.shopState) return this.updateShop(dt);
    if (this.queue) return this.updateDialog(dt);
  }

  updateDialog(dt) {
    const q = this.queue, line = q.lines[q.i];
    const len = line.text.length;
    q.t += dt;
    if (q.shown < len) {
      const before = Math.floor(q.shown);
      q.shown = Math.min(len, q.shown + dt * 52);
      if (Math.floor(q.shown) !== before && Math.floor(q.shown) % 3 === 0 && line.text[Math.floor(q.shown)] !== ' ') sfx('talk');
      if (input.ok() && q.t > 0.12) q.shown = len;
      return;
    }
    if (line.choices) {
      if (input.pressed('up') || input.pressed('left')) { q.sel = (q.sel + line.choices.length - 1) % line.choices.length; sfx('select'); }
      if (input.pressed('down') || input.pressed('right')) { q.sel = (q.sel + 1) % line.choices.length; sfx('select'); }
      if (input.pressed('jump') || input.pressed('interact') || input.pressed('confirm') || input.pressed('attack')) {
        const c = line.choices[q.sel];
        sfx('confirm');
        this.queue = null;
        input.swallow();
        c.fn && c.fn();
      }
      return;
    }
    if (input.ok()) {
      q.i++; q.shown = 0; q.t = 0;
      if (q.i >= q.lines.length) {
        const cb = q.onDone;
        this.queue = null;
        input.swallow();
        cb && cb();
      } else sfx('select');
    }
  }

  updateShop() {
    const s = this.shopState;
    const n = s.items.length + 1;
    if (input.pressed('up')) { s.sel = (s.sel + n - 1) % n; sfx('select'); }
    if (input.pressed('down')) { s.sel = (s.sel + 1) % n; sfx('select'); }
    const close = () => { this.shopState = null; input.swallow(); s.onClose && s.onClose(); };
    if (input.pressed('dash') || input.pressed('pause')) return close();
    if (input.pressed('jump') || input.pressed('interact') || input.pressed('confirm') || input.pressed('attack')) {
      if (s.sel === s.items.length) return close();
      const it = s.items[s.sel];
      const why = it.blocked && it.blocked();
      if (why) { s.msg = why; sfx('deny'); return; }
      if (this.game.save.coins < it.price) { s.msg = 'Not enough coins.'; sfx('deny'); return; }
      this.game.save.coins -= it.price;
      sfx('chest');
      it.buy();
      s.msg = it.thanks || 'Thank you kindly!';
      this.bumpCoins();
    }
  }

  updatePause() {
    const opts = this.pauseOptions();
    if (this.showControls) { if (input.ok() || input.pressed('pause') || input.pressed('dash')) { this.showControls = false; sfx('select'); } return; }
    if (input.pressed('up')) { this.pauseSel = (this.pauseSel + opts.length - 1) % opts.length; sfx('select'); }
    if (input.pressed('down')) { this.pauseSel = (this.pauseSel + 1) % opts.length; sfx('select'); }
    if (input.pressed('pause') || input.pressed('dash')) { this.paused = false; sfx('pause'); input.swallow(); return; }
    if (input.pressed('jump') || input.pressed('interact') || input.pressed('confirm') || input.pressed('attack')) { sfx('confirm'); opts[this.pauseSel].fn(); }
  }

  pauseOptions() {
    return [
      { label: 'Resume', fn: () => { this.paused = false; input.swallow(); } },
      { label: `Sound: ${isMuted() ? 'Off' : 'On'}`, fn: () => toggleMute() },
      ...(input.pads.connected() && input.pads.canRumble() ? [{ label: `Rumble: ${input.pads.rumbleOn ? 'On' : 'Off'}`, fn: () => { input.pads.setRumble(!input.pads.rumbleOn); if (input.pads.rumbleOn) input.rumble('hit', 1.5); } }] : []),
      { label: 'Controls', fn: () => { this.showControls = true; } },
      { label: 'Save & Quit to Title', fn: () => { this.paused = false; this.game.toTitle(); } },
    ];
  }

  // ------------------------------------------------ draw
  drawHUD(ctx, world) {
    const s = this.game.save, p = world.player;
    // HP orb + bars
    if (this.hpShown == null) this.hpShown = s.hp;
    this.hpShown += (s.hp - this.hpShown) * 0.12;
    const fx = 3, fy = 2;
    const frac = Math.max(0, s.hp / s.maxHp);
    const red = img('ui/red_bar');
    // ghost (recent damage) fill
    const gfrac = Math.max(frac, Math.min(1, this.hpShown / s.maxHp));
    const gh = Math.round(54 * gfrac);
    ctx.globalAlpha = 0.45;
    ctx.drawImage(red, 0, 54 - gh, 56, gh, fx + 4, fy + 4 + 54 - gh, 56, gh);
    ctx.globalAlpha = 1;
    const fh = Math.round(54 * frac);
    ctx.drawImage(red, 0, 54 - fh, 56, fh, fx + 4, fy + 4 + 54 - fh, 56, fh);
    if (frac <= 0.3 && Math.floor(world.time * 4) % 2) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff'; ctx.drawImage(red, 0, 54 - fh, 56, fh, fx + 4, fy + 4 + 54 - fh, 56, fh); ctx.globalAlpha = 1; }
    // stamina (blue, segmented) and ember (yellow)
    const stam = p.stamina / 10;
    ctx.drawImage(img('ui/blue_bar'), 0, 0, Math.round(49 * stam), 6, fx + 63, fy + 54, Math.round(49 * stam), 6);
    const emb = Math.min(1, s.ember / 10);
    ctx.drawImage(img('ui/yellow_bar'), 0, 0, Math.round(32 * emb), 4, fx + 66, fy + 47, Math.round(32 * emb), 4);
    ctx.drawImage(img('ui/hp_bar'), fx, fy);
    if (this.stamFlash > 0 && Math.floor(this.stamFlash * 16) % 2) { ctx.fillStyle = 'rgba(255,80,80,0.6)'; ctx.fillRect(fx + 63, fy + 54, 49, 6); }
    if (emb >= 1) { const a = 0.4 + Math.sin(world.time * 8) * 0.3; ctx.fillStyle = `rgba(255,240,160,${a})`; ctx.fillRect(fx + 66, fy + 47, 32, 4); }
    drawText(ctx, `${Math.ceil(s.hp)}/${s.maxHp}`, fx + 32, fy + 27, INK, { align: 'center', outline: '#2a0a0e' });

    // coins / potions / sword column to the right of the frame
    let x = fx + 66, y = fy + 6;
    const cw = Math.max(measure(String(s.coins)), measure(String(s.potions))) + (s.relic ? 34 : 22);
    panel(ctx, x - 3, y - 3, cw, 30, 0.6);
    icon(ctx, ICON.coins, x, y);
    drawText(ctx, String(s.coins), x + 15, y + 2 - (this.coinBump > 0 ? 1 : 0), this.coinBump > 0 ? GOLD : INK, { outline: '#1a1014' });
    y += 14;
    icon(ctx, ICON.potion, x, y);
    drawText(ctx, `${s.potions}`, x + 15, y + 2, INK, { outline: '#1a1014' });
    y += 14;
    if (s.relic) { icon(ctx, ICON.relic, x + 26, fy + 20); }

    // boss bar
    if (this.boss && !this.boss.dead) {
      const b = this.boss, bw = 220, bx = (W - bw) / 2, by = H - 22;
      panel(ctx, bx - 4, by - 12, bw + 8, 22, 0.85);
      drawText(ctx, b.name, W / 2, by - 9, '#ffb0a0', { align: 'center' });
      ctx.fillStyle = '#3a1418'; ctx.fillRect(bx, by + 1, bw, 5);
      if (b.shownHp == null) b.shownHp = b.hp;
      b.shownHp += (Math.max(0, b.hp) - b.shownHp) * 0.08;
      ctx.fillStyle = '#ffd0a0'; ctx.fillRect(bx, by + 1, Math.round(bw * b.shownHp / b.maxHp), 5);
      ctx.fillStyle = b.phase === 2 ? '#ff5a2a' : '#d8282e'; ctx.fillRect(bx, by + 1, Math.round(bw * Math.max(0, b.hp) / b.maxHp), 5);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(bx, by + 1, Math.round(bw * Math.max(0, b.hp) / b.maxHp), 1);
    }

    // toasts
    const hl = this.hintLines(), toastY = hl ? HINT_Y + hl.length * 10 + 12 : 6;
    this.toasts.forEach((t, i) => {
      const a = t.t < 0.2 ? t.t / 0.2 : t.t > 2.7 ? (3.2 - t.t) / 0.5 : 1;
      const w = measure(t.text) + (t.icon != null ? 18 : 0) + 14;
      // top-right, clear of the HUD and of whatever you just opened (and below a hint)
      const ty = toastY + i * 20 - (t.t < 0.2 ? (1 - t.t / 0.2) * 6 : 0);
      const tx0 = W - w - 6 + (t.t < 0.2 ? (1 - t.t / 0.2) * 10 : 0);
      ctx.globalAlpha = Math.max(0, a);
      panel(ctx, tx0, ty, w, 17, 0.9);
      let tx = tx0 + 7;
      if (t.icon != null) { icon(ctx, t.icon, tx, ty + 3); tx += 17; }
      drawText(ctx, t.text, tx, ty + 5, INK);
      ctx.globalAlpha = 1;
    });

    // area banner
    if (this.bannerText && this.bannerT < this.bannerDur) {
      const t = this.bannerT, D = this.bannerDur, by = this.bannerY;
      const a = t < 0.5 ? t / 0.5 : t > D - 0.7 ? (D - t) / 0.7 : 1;
      ctx.globalAlpha = Math.max(0, a);
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(10,6,14,0)'); g.addColorStop(0.25, 'rgba(10,6,14,0.6)'); g.addColorStop(0.75, 'rgba(10,6,14,0.6)'); g.addColorStop(1, 'rgba(10,6,14,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, by, W, 46);
      ctx.fillStyle = '#e2c08a'; ctx.fillRect(W / 2 - 90, by + 2, 180, 1); ctx.fillRect(W / 2 - 90, by + 43, 180, 1);
      bigText(ctx, this.bannerText[0], W / 2, by + 8, 2, '#ffe6b0');
      drawText(ctx, this.bannerText[1], W / 2, by + 33, '#c8b8a0', { align: 'center' });
      ctx.globalAlpha = 1;
    }

    // contextual hint: top centre, between the HUD and the toasts, so it never hides the floor
    if (hl) {
      ctx.globalAlpha = Math.min(1, this.hintT * 2) * 0.8;
      const w = Math.max(...hl.map((l) => measure(l))) + 14;
      panel(ctx, Math.round((W - w) / 2), HINT_Y, w, hl.length * 10 + 7, 0.85);
      hl.forEach((l, i) => drawText(ctx, l, W / 2, HINT_Y + 5 + i * 10, INK, { align: 'center' }));
      ctx.globalAlpha = 1;
    }
  }

  /** The current hint wrapped to fit the gap between the HUD and the toasts (null if none). */
  hintLines() {
    if (!(this.hintT > 0) || this.queue || !this.hint || this.bannerUp) return null;
    if (this.hintWrap && this.hintWrap.src === this.hint) return this.hintWrap.lines;
    const lines = [];
    let cur = '';
    for (const word of this.hint.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (cur && measure(t) > HINT_W) { lines.push(cur); cur = word; } else cur = t;
    }
    if (cur) lines.push(cur);
    // two lines: move the break so both halves are close in width instead of one long, one stub
    if (lines.length === 2) {
      const words = this.hint.split(' ');
      let best = null;
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
        const wa = measure(a), wb = measure(b);
        if (wa > HINT_W || wb > HINT_W) continue;
        const score = Math.max(wa, wb);
        if (!best || score < best[0]) best = [score, a, b];
      }
      if (best) { lines[0] = best[1]; lines[1] = best[2]; }
    }
    this.hintWrap = { src: this.hint, lines };
    return lines;
  }

  drawDialog(ctx) {
    const q = this.queue;
    if (!q) return;
    const line = q.lines[q.i];
    const bx = 30, by = H - 74, bw = W - 60, bh = 66;
    panel(ctx, bx, by, bw, bh);
    let tx = bx + 10;
    if (line.portrait) {
      ctx.fillStyle = '#0e0a12'; ctx.fillRect(bx + 8, by + 8, 50, 50);
      ctx.fillStyle = '#5a4030'; ctx.fillRect(bx + 7, by + 7, 52, 1); ctx.fillRect(bx + 7, by + 58, 52, 1); ctx.fillRect(bx + 7, by + 7, 1, 52); ctx.fillRect(bx + 58, by + 7, 1, 52);
      const pr = line.portrait;
      ctx.drawImage(pr, 0, 0, pr.width, pr.height, bx + 9, by + 9, 48, 48);
      tx = bx + 68;
    }
    if (line.who) {
      const nw = measure(line.who) + 12;
      panel(ctx, tx - 4, by - 9, nw, 15);
      drawText(ctx, line.who, tx + 2, by - 5, GOLD);
    }
    const shown = line.text.slice(0, Math.floor(q.shown));
    const lines = wrap(line.text, bx + bw - tx - 12);
    let left = shown.length;
    lines.forEach((l, i) => {
      const part = l.slice(0, Math.max(0, left));
      left -= l.length + 1;
      drawText(ctx, part, tx, by + 12 + i * LINE_H, INK);
    });
    if (q.shown >= line.text.length) {
      if (line.choices) {
        const cw = Math.max(...line.choices.map((c) => measure(c.label))) + 28;
        const ch = line.choices.length * 13 + 8;
        const cx = bx + bw - cw - 4, cy = by - ch - 4;
        panel(ctx, cx, cy, cw, ch);
        line.choices.forEach((c, i) => {
          const sel = i === q.sel;
          if (sel) drawText(ctx, '>', cx + 7 + (Math.floor(q.t * 4) % 2), cy + 6 + i * 13, GOLD);
          drawText(ctx, c.label, cx + 16, cy + 6 + i * 13, sel ? GOLD : DIM);
        });
      } else if (Math.floor(q.t * 3) % 2 === 0) {
        drawText(ctx, 'v', bx + bw - 14, by + bh - 14, GOLD);
      }
    }
  }

  drawShop(ctx) {
    const s = this.shopState;
    if (!s) return;
    const w = 280, rows = s.items.length + 1, h = 60 + rows * 18;   // room for a two-line description
    const x = (W - w) / 2, y = Math.max(68, (H - h) / 2 - 6);   // below the HUD bars
    panel(ctx, x, y, w, h);
    drawText(ctx, s.title, x + w / 2, y + 8, GOLD, { align: 'center' });
    icon(ctx, ICON.coins, x + w - 52, y + 6);
    drawText(ctx, String(this.game.save.coins), x + w - 37, y + 8, INK);
    s.items.forEach((it, i) => {
      const iy = y + 26 + i * 18, sel = i === s.sel;
      if (sel) { ctx.fillStyle = 'rgba(255,211,106,0.12)'; ctx.fillRect(x + 6, iy - 3, w - 12, 16); }
      icon(ctx, ICON[it.icon], x + 12, iy - 1);
      const blocked = it.blocked && it.blocked();
      drawText(ctx, it.name, x + 30, iy + 1, blocked ? DIM : sel ? GOLD : INK);
      drawText(ctx, blocked ? '--' : String(it.price), x + w - 14, iy + 1, this.game.save.coins >= it.price && !blocked ? INK : RED, { align: 'right' });
    });
    const ly = y + 26 + s.items.length * 18;
    if (s.sel === s.items.length) { ctx.fillStyle = 'rgba(255,211,106,0.12)'; ctx.fillRect(x + 6, ly - 3, w - 12, 16); }
    drawText(ctx, 'Leave', x + 30, ly + 1, s.sel === s.items.length ? GOLD : DIM);
    const desc = s.msg || (s.items[s.sel] ? s.items[s.sel].desc : 'Come back any time.');
    wrap(desc, w - 24).slice(0, 2).forEach((l, i) => drawText(ctx, l, x + 12, y + h - 28 + i * LINE_H, s.msg ? GOLD : DIM));
  }

  drawPause(ctx) {
    if (!this.paused) return;
    ctx.fillStyle = 'rgba(8,6,12,0.6)';
    ctx.fillRect(0, 0, W, H);
    if (this.showControls) return this.drawControls(ctx);
    bigText(ctx, 'PAUSED', W / 2, 60, 2, '#ffe6b0');
    const opts = this.pauseOptions();
    const w = 170, h = opts.length * 16 + 14, x = (W - w) / 2, y = 100;
    panel(ctx, x, y, w, h);
    opts.forEach((o, i) => {
      const sel = i === this.pauseSel;
      drawText(ctx, o.label, W / 2, y + 9 + i * 16, sel ? GOLD : DIM, { align: 'center' });
      if (sel) drawText(ctx, '>', x + 12, y + 9 + i * 16, GOLD);
    });
    const s = this.game.save;
    const stats = `Treasure ${s.treasure}/5    Foes felled ${s.kills}    Falls ${s.deaths}`;
    const sw = measure(stats) + 16;
    panel(ctx, W / 2 - sw / 2, y + h + 6, sw, 15, 0.85);
    drawText(ctx, stats, W / 2, y + h + 10, DIM, { align: 'center' });
  }

  drawControls(ctx) {
    const P = (a) => input.padLabel(a);   // named for the pad in hand: Xbox letters, PlayStation shapes, Nintendo letters
    const rows = [
      ['Move', 'Arrows / WASD', 'Stick / D-pad'],
      ['Jump', 'Z / Space', P('jump')],
      ['Attack (x3 combo)', 'X / J', P('attack')],
      ['Dash', 'C / Shift', `${P('dash')} / ${P('dash2')}`],
      ['Talk / Open', 'E', P('interact')],
      ['Drink potion', 'Q', P('potion2')],
      ['Ember strike (bar full)', 'Up + X', `Up + ${P('attack')}`],
      ['Drop through plank', 'Down + Jump', `Down + ${P('jump')}`],
      ['Pause', 'Esc', P('pause')],
      ['Mute', 'M', ''],
    ];
    const w = 404, h = rows.length * 13 + 36, x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
    panel(ctx, x, y, w, h);
    drawText(ctx, 'Controls', W / 2, y + 8, GOLD, { align: 'center' });
    drawText(ctx, 'Keyboard', x + 176, y + 20, DIM); drawText(ctx, 'Controller', x + 278, y + 20, DIM);
    rows.forEach((r, i) => {
      const ry = y + 32 + i * 13;
      drawText(ctx, r[0], x + 12, ry, INK);
      drawText(ctx, r[1], x + 176, ry, '#d8c8a8');
      drawText(ctx, r[2], x + 278, ry, '#d8c8a8');
    });
  }
}
