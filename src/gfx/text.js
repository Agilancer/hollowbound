// Text in the world, drawn by the GPU like everything else: strings are rasterised once
// on a small canvas into recycled atlas slots (name tags, chat bubbles, floating words),
// and damage numbers are assembled from pre-baked digit glyphs.
import { SlotPool } from '../gpu/atlas.js';

const FONT = '"Cinzel", "Trajan Pro", Georgia, serif';
const BODY = '"Alegreya Sans", "Segoe UI", system-ui, sans-serif';
const S = 2;        // labels are rasterised at 2x world units

export class Text {
  constructor(atlas) {
    this.atlas = atlas;
    this.tags = new SlotPool(atlas, 300, 44, 60);
    this.bubbles = new SlotPool(atlas, 400, 168, 20);
    this.cache = new Map();          // key -> { r, w, h, used }
    this.cv = new OffscreenCanvas(400, 168); this.cx = this.cv.getContext('2d');
    this.frame = 0;
    this.digits = {};
    this._bakeDigits();
  }
  _bakeDigits() {
    // styles: n = hit on a foe, c = crit, p = damage to you, h = heal, x = exp/gold
    const styles = { n: ['#ffb640', '#b12d06', 34], c: ['#ff5ad0', '#5a0a6a', 44], p: ['#c79bff', '#2a0c4a', 34], h: ['#7dff8a', '#0b4a1a', 32], x: ['#ffe9a0', '#5a3a00', 26], s: ['#d8f0ff', '#12364a', 30] };
    const chars = '0123456789MISS!+-KLVUPEXGBOCRTAD%Z';
    for (const k in styles) {
      const [fill, edge, px] = styles[k];
      const cw = Math.ceil(px * 0.78), ch = Math.ceil(px * 1.25);
      const c = new OffscreenCanvas(cw * chars.length, ch), g = c.getContext('2d');
      g.font = `900 ${px}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (let i = 0; i < chars.length; i++) {
        const x = i * cw + cw / 2, y = ch / 2 + 1;
        g.lineWidth = Math.max(4, px * 0.2); g.strokeStyle = edge; g.strokeText(chars[i], x, y);
        g.lineWidth = 1.5; g.strokeStyle = '#000'; g.strokeText(chars[i], x, y);
        const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0.2, '#fff'); gr.addColorStop(0.5, fill); gr.addColorStop(1, edge);
        g.fillStyle = gr; g.fillText(chars[i], x, y);
      }
      const base = this.atlas.addCanvas(c, 'keep'), map = {};
      for (let i = 0; i < chars.length; i++) map[chars[i]] = this.atlas.sub(base, i * cw, 0, cw, ch);
      this.digits[k] = { map, cw: cw / S, ch: ch / S, adv: cw * 0.74 / S };
    }
  }
  /** Draw a number/word with glyph style k, centred at x,y. scale & alpha animate it. */
  glyphs(rd, str, k, x, y, scale = 1, alpha = 1) {
    const d = this.digits[k] || this.digits.n, n = str.length, adv = d.adv * scale;
    let px = x - (n * adv) / 2 - (d.cw * scale - adv) / 2;
    const tint = [1, 1, 1, alpha];
    for (let i = 0; i < n; i++) {
      const r = d.map[str[i]];
      if (r) rd.quad(r, px, y - d.ch * scale / 2 + ((i & 1) ? 1.5 : -1.5) * scale, d.cw * scale, d.ch * scale, tint);
      px += adv;
    }
  }

  _slot(key, pool, w, h, paint) {
    let e = this.cache.get(key);
    if (!e) {
      const r = pool.take(); if (!r) return null;
      const g = this.cx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 400, 168);
      const size = paint(g) || [w, h];
      const c = new OffscreenCanvas(pool.w, pool.h), cg = c.getContext('2d');
      cg.drawImage(this.cv, 0, 0);
      this.atlas.update(r, c);
      e = { r: this.atlas.sub({ ...r, x: r.x, y: r.y }, 0, 0, Math.min(pool.w, Math.ceil(size[0])), Math.min(pool.h, Math.ceil(size[1]))), slot: r, pool, w: size[0] / S, h: size[1] / S };
      // sub() adds base x/y again, so rebuild from the slot directly
      e.r = { layer: r.layer, u0: r.u0, v0: r.v0, u1: r.u0 + Math.min(pool.w, Math.ceil(size[0])) / 2048, v1: r.v0 + Math.min(pool.h, Math.ceil(size[1])) / 2048 };
      this.cache.set(key, e);
    }
    e.used = this.frame;
    return e;
  }
  /** A name tag: dark pill, coloured name, optional second line (guild). */
  tag(name, color = '#fff', sub = '', subColor = '#c9b27a') {
    return this._slot('t|' + name + '|' + color + '|' + sub, this.tags, 300, 44, (g) => {
      g.font = `600 ${11 * S}px ${BODY}`; g.textBaseline = 'middle'; g.textAlign = 'center';
      const w1 = Math.min(292, g.measureText(name).width + 14);
      let w2 = 0; if (sub) { g.font = `600 ${9.5 * S}px ${BODY}`; w2 = Math.min(292, g.measureText(sub).width + 14); }
      const w = Math.max(w1, w2), cx = w / 2;
      g.fillStyle = 'rgba(8,6,10,0.62)'; rr(g, cx - w1 / 2, 0, w1, 22, 5); g.fill();
      g.font = `600 ${11 * S}px ${BODY}`; g.fillStyle = color; g.fillText(name, cx, 12, 280);
      if (sub) { g.fillStyle = 'rgba(8,6,10,0.5)'; rr(g, cx - w2 / 2, 23, w2, 20, 5); g.fill(); g.font = `600 ${9.5 * S}px ${BODY}`; g.fillStyle = subColor; g.fillText(sub, cx, 34, 280); }
      return [w, sub ? 44 : 23];
    });
  }
  /** A chat bubble with wrapped text. kind: 'say' | 'shout' | 'npc' | 'evil' */
  bubble(text, kind = 'say') {
    return this._slot('b|' + kind + '|' + text, this.bubbles, 400, 168, (g) => {
      g.font = `500 ${12 * S}px ${BODY}`; g.textBaseline = 'top'; g.textAlign = 'left';
      const maxW = 330, words = text.split(' '), lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur);
      if (lines.length > 5) { lines.length = 5; lines[4] = lines[4].replace(/.{3}$/, '...'); }
      const tw = Math.max(40, ...lines.map(l => g.measureText(l).width)), w = tw + 28, h = lines.length * 27 + 16;
      const col = { say: ['#f4efe4', '#1a1410', '#6b5a40'], shout: ['#ffe9b0', '#2a1500', '#b0721a'], npc: ['#e9e2d0', '#15110c', '#8a6a2a'], evil: ['#2a0a10', '#ffb9b0', '#8a1a22'], party: ['#e4f0ff', '#0c1a2a', '#3a6aa8'], guild: ['#eadcff', '#1c0c30', '#7a4ab8'] }[kind] || ['#f4efe4', '#1a1410', '#6b5a40'];
      g.fillStyle = col[0]; g.strokeStyle = col[2]; g.lineWidth = 2.5;
      rr(g, 2, 2, w - 4, h - 4, 12); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 9, h - 3); g.lineTo(w / 2, h + 12); g.lineTo(w / 2 + 9, h - 3); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(w / 2 - 9, h - 2); g.lineTo(w / 2, h + 12); g.lineTo(w / 2 + 9, h - 2); g.stroke();
      g.fillStyle = col[0]; g.fillRect(w / 2 - 8, h - 6, 16, 5);
      g.fillStyle = col[1]; lines.forEach((l, i) => g.fillText(l, 14, 10 + i * 27));
      return [w, h + 14];
    });
  }
  /** Free-form floating words (quest names, LEVEL UP...). */
  word(text, color = '#ffe9a0', px = 16) {
    return this._slot('w|' + text + '|' + color + '|' + px, this.tags, 300, 44, (g) => {
      g.font = `800 ${px * S}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center'; g.lineJoin = 'round';
      const w = Math.min(296, g.measureText(text).width + 12);
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, w / 2, 22, 290);
      g.fillStyle = color; g.fillText(text, w / 2, 22, 290);
      return [w, 44];
    });
  }
  /** Draw a cached label centred on x with its top at y. */
  draw(rd, e, x, y, alpha = 1, scale = 1) { if (e) rd.quad(e.r, x - e.w * scale / 2, y, e.w * scale, e.h * scale, alpha < 1 ? [1, 1, 1, alpha] : null); }

  /** Recycle labels that have not been drawn for a while. Call once a frame. */
  tick() {
    this.frame++;
    if (this.frame % 120) return;
    for (const [k, e] of this.cache) if (this.frame - e.used > 240) { e.pool.give(e.slot); this.cache.delete(k); }
  }
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
