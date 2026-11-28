// The atlas: one rgba8 texture array that holds every sprite, baked terrain chunk and
// text label in the game. Regions are shelf-packed with a 1px transparent gutter.
// Pages belong to a scope: 'keep' pages live for the whole session (heroes, gear, UI, FX),
// 'map' pages are wiped when the player changes map (monsters, terrain, backdrops).
export const PAGE = 2048;
const GUT = 1;
let ZERO = null;

class Page {
  constructor(layer, scope) { this.layer = layer; this.scope = scope; this.shelves = []; this.y = 0; this.dirty = false; }
  alloc(w, h) {
    for (const s of this.shelves) {
      if (h <= s.h && h >= s.h * 0.7 && s.x + w <= PAGE) { const x = s.x; s.x += w; return [x, s.y]; }
    }
    if (this.y + h > PAGE || w > PAGE) return null;
    const s = { y: this.y, h, x: w }; this.shelves.push(s); this.y += h; return [0, s.y];
  }
}

export class Atlas {
  constructor(device) {
    this.device = device;
    this.layers = 6;
    this.maxLayers = Math.min(64, device.limits.maxTextureArrayLayers);
    this.tex = this._make(this.layers);
    this.version = 0;
    this.pages = [];
    this.urls = new Map();          // url -> region
    this.loading = 0;
    const c = new OffscreenCanvas(4, 4), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4);
    this.white = this.addCanvas(c, 'keep');
    // sample the middle so linear filtering never reaches the gutter
    const m = (this.white.u0 + this.white.u1) / 2, n = (this.white.v0 + this.white.v1) / 2;
    this.white.u0 = this.white.u1 = m; this.white.v0 = this.white.v1 = n;
  }

  _make(n) {
    return this.device.createTexture({ size: [PAGE, PAGE, n], format: 'rgba8unorm', dimension: '2d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT });
  }
  view() { return this.tex.createView({ dimension: '2d-array' }); }
  flush() {}

  _grow() {
    const n = Math.min(this.maxLayers, this.layers * 2);
    if (n === this.layers) return false;
    const t = this._make(n), enc = this.device.createCommandEncoder();
    enc.copyTextureToTexture({ texture: this.tex }, { texture: t }, [PAGE, PAGE, this.layers]);
    this.device.queue.submit([enc.finish()]);
    const old = this.tex; this.tex = t; this.layers = n; this.version++;
    // destroy after the copy has surely run
    this.device.queue.onSubmittedWorkDone().then(() => old.destroy());
    return true;
  }

  _place(w, h, scope) {
    const W = w + GUT * 2, H = h + GUT * 2;
    if (W > PAGE || H > PAGE) return null;
    for (const p of this.pages) {
      if (p.scope !== scope) continue;
      const at = p.alloc(W, H); if (at) return [p, at[0] + GUT, at[1] + GUT];
    }
    let p = this.pages.find(q => q.scope === null);
    if (!p) {
      if (this.pages.length >= this.layers && !this._grow()) return null;
      p = new Page(this.pages.length, null); this.pages.push(p);
    }
    p.scope = scope;
    if (p.dirty) {
      ZERO = ZERO || new Uint8Array(PAGE * PAGE * 4);
      this.device.queue.writeTexture({ texture: this.tex, origin: [0, 0, p.layer] }, ZERO, { bytesPerRow: PAGE * 4 }, [PAGE, PAGE, 1]);
      p.dirty = false;
    }
    const at = p.alloc(W, H);
    return at ? [p, at[0] + GUT, at[1] + GUT] : null;
  }

  _region(r, p, x, y, w, h) {
    r.layer = p.layer; r.x = x; r.y = y; r.w = w; r.h = h;
    r.u0 = x / PAGE; r.v0 = y / PAGE; r.u1 = (x + w) / PAGE; r.v1 = (y + h) / PAGE;
    r.scope = p.scope;
    return r;
  }

  // Upload a canvas / ImageBitmap (optionally a sub-rect of it). Returns a region.
  addCanvas(src, scope = 'map', sx = 0, sy = 0, sw = src.width, sh = src.height, into) {
    const r = into || { layer: -1 };
    const at = this._place(sw, sh, scope);
    if (!at) { console.warn('atlas full', sw, sh); return r; }
    this.device.queue.copyExternalImageToTexture({ source: src, origin: [sx, sy] },
      { texture: this.tex, origin: [at[1], at[2], at[0].layer], premultipliedAlpha: true }, [sw, sh]);
    return this._region(r, at[0], at[1], at[2], sw, sh);
  }

  // Overwrite an existing region's pixels (label slots).
  update(r, src) {
    if (r.layer < 0) return;
    this.device.queue.copyExternalImageToTexture({ source: src },
      { texture: this.tex, origin: [r.x, r.y, r.layer], premultipliedAlpha: true }, [Math.min(src.width, r.w), Math.min(src.height, r.h)]);
  }

  // Region for an image URL; drawable (layer >= 0) once it has loaded. w/h are known then.
  get(url, scope = 'map') {
    let r = this.urls.get(url);
    if (r && (r.layer >= 0 || r.pending)) return r;
    if (!r) { r = { layer: -1, w: 0, h: 0, url, scope }; this.urls.set(url, r); }
    r.pending = true; this.loading++;
    r.promise = fetch(url).then(q => { if (!q.ok) throw new Error(q.status + ' ' + url); return q.blob(); })
      .then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then(bm => { r.iw = bm.width; r.ih = bm.height; if (!r.dead) this.addCanvas(bm, scope, 0, 0, bm.width, bm.height, r); bm.close && bm.close(); return r; })
      .catch(e => { r.failed = true; console.warn('sprite failed', url, e.message); return r; })
      .finally(() => { r.pending = false; this.loading--; });
    return r;
  }
  load(url, scope) { const r = this.get(url, scope); return r.promise || Promise.resolve(r); }

  // A sheet image cut into named frames: frames = { name: [x,y,w,h] }. Returns
  // { name: region } once loaded. The sheet is uploaded once; frames share it.
  async sheet(url, frames, scope = 'map') {
    const key = 'sheet:' + url;
    let s = this.urls.get(key);
    if (s && s.layer >= 0) return s.frames;
    if (s && s.promise) return s.promise;
    s = { layer: -1, url: key }; this.urls.set(key, s);
    s.promise = this.load(url, scope).then(base => {
      const out = {};
      if (base.layer >= 0) for (const k in frames) {
        const f = frames[k];
        out[k] = { layer: base.layer, w: f[2], h: f[3], x: base.x + f[0], y: base.y + f[1],
          u0: (base.x + f[0]) / PAGE, v0: (base.y + f[1]) / PAGE, u1: (base.x + f[0] + f[2]) / PAGE, v1: (base.y + f[1] + f[3]) / PAGE };
      }
      s.frames = out; s.layer = base.layer; s.scope = base.scope; return out;
    });
    return s.promise;
  }

  // One cell of a big sheet: the sheet is decoded once (a few bitmaps are kept), and only
  // the cell's pixels go into the atlas. This is how monsters load: a map uploads the
  // creatures it spawns, not the 1024-wide sheets they were cut from.
  cell(url, x, y, w, h, scope = 'map') {
    const key = url + '#' + x + ',' + y + ',' + w + ',' + h;
    let r = this.urls.get(key);
    if (r) return r;
    r = { layer: -1, w, h, url: key, scope }; this.urls.set(key, r);
    r.pending = true; this.loading++;
    r.promise = this.bitmap(url).then(bm => { if (!r.dead) this.addCanvas(bm, scope, x, y, Math.min(w, bm.width - x), Math.min(h, bm.height - y), r); return r; })
      .catch(e => { r.failed = true; console.warn('cell failed', url, e.message); return r; })
      .finally(() => { r.pending = false; this.loading--; });
    return r;
  }
  bitmap(url) {
    this.bitmaps = this.bitmaps || new Map();
    let e = this.bitmaps.get(url);
    if (e) { this.bitmaps.delete(url); this.bitmaps.set(url, e); return e; }
    e = fetch(url).then(q => { if (!q.ok) throw new Error(q.status + ' ' + url); return q.blob(); })
      .then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
    this.bitmaps.set(url, e);
    if (this.bitmaps.size > 14) { const [k, old] = this.bitmaps.entries().next().value; this.bitmaps.delete(k); old.then(b => setTimeout(() => b.close && b.close(), 4000)).catch(() => {}); }
    return e;
  }

  // Sub-region of a loaded region (pixel rect inside it).
  sub(r, x, y, w, h) {
    return { layer: r.layer, w, h, x: r.x + x, y: r.y + y,
      u0: (r.x + x) / PAGE, v0: (r.y + y) / PAGE, u1: (r.x + x + w) / PAGE, v1: (r.y + y + h) / PAGE };
  }

  // Wipe every page of a scope (called on map change).
  reset(scope) {
    for (const p of this.pages) if (p.scope === scope) { p.scope = null; p.shelves = []; p.y = 0; p.dirty = true; }
    for (const [k, r] of this.urls) if (r.scope === scope) { r.layer = -1; r.frames = null; r.promise = null; r.dead = true; this.urls.delete(k); }
  }
  usage() { return this.pages.filter(p => p.scope).length + '/' + this.layers; }
}

// Fixed-size slots carved from 'keep' pages, handed out and recycled: name tags, chat
// bubbles, anything whose pixels change during play.
export class SlotPool {
  constructor(atlas, w, h, perBlock = 32) {
    this.atlas = atlas; this.w = w; this.h = h; this.per = perBlock; this.free = [];
    this.blank = new OffscreenCanvas(w, h);
  }
  take() {
    if (!this.free.length) {
      const cols = Math.max(1, Math.floor((PAGE - 2) / (this.w + 2))), rows = Math.ceil(this.per / cols);
      const c = new OffscreenCanvas(Math.min(PAGE - 2, cols * (this.w + 2)), rows * (this.h + 2));
      c.getContext('2d');
      const base = this.atlas.addCanvas(c, 'keep');
      if (base.layer < 0) return null;
      for (let i = 0; i < cols * rows; i++) {
        const x = (i % cols) * (this.w + 2) + 1, y = Math.floor(i / cols) * (this.h + 2) + 1;
        this.free.push(this.atlas.sub(base, x, y, this.w, this.h));
      }
    }
    return this.free.pop();
  }
  give(r) { if (r) this.free.push(r); }
}
