// VELSCOUR : HOLLOWBOUND - WebGPU renderer.
// Everything in the world is one instanced draw call: every sprite lives in a single
// texture array (the atlas, see atlas.js), so there are no texture switches and no
// per-sprite state. A frame is: sky pass (procedural, full screen) + N sprite batches
// (each batch = one camera + one contiguous range of instances).
import { Atlas } from './atlas.js';

const FLOATS = 20;                      // floats per sprite instance (5 x vec4)
const MAX_SPRITES = 24000;

const SPRITE_WGSL = /* wgsl */`
struct Cam { scale: vec2f, offset: vec2f };
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d_array<f32>;

struct Inst {
  @location(0) xy: vec4f,     // X axis (xy), Y axis (zw) of the quad in world px
  @location(1) tl: vec4f,     // origin xy, atlas layer, additive 0..1
  @location(2) uv: vec4f,     // u0 v0 u1 v1
  @location(3) tint: vec4f,   // multiply colour, alpha
  @location(4) flash: vec4f,  // flash colour rgb, amount
};
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) layer: u32,
  @location(2) @interpolate(flat) tint: vec4f,
  @location(3) @interpolate(flat) flash: vec4f,
  @location(4) @interpolate(flat) add: f32,
};
@vertex fn vs(@builtin(vertex_index) vi: u32, i: Inst) -> VOut {
  var c = array<vec2f, 4>(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(1, 1));
  let q = c[vi];
  let w = i.tl.xy + i.xy.xy * q.x + i.xy.zw * q.y;
  var o: VOut;
  o.pos = vec4f(w * cam.scale + cam.offset, 0, 1);
  o.uv = mix(i.uv.xy, i.uv.zw, q);
  o.layer = u32(i.tl.z);
  o.tint = i.tint;
  o.flash = i.flash;
  o.add = i.tl.w;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  // "sharp bilinear": crisp texels when magnified, plain bilinear when minified
  let px = v.uv * 2048.0;
  let fw = max(fwidth(px), vec2f(0.0001));
  let seam = floor(px + 0.5);
  let sp = seam + clamp((px - seam) / fw, vec2f(-0.5), vec2f(0.5));
  var c = textureSampleLevel(tex, samp, sp / 2048.0, v.layer, 0.0);   // premultiplied
  let rgb = mix(c.rgb * v.tint.rgb, v.flash.rgb * c.a, v.flash.a) * v.tint.a;
  return vec4f(rgb, c.a * v.tint.a * (1.0 - v.add));
}`;

// Procedural sky: vertical gradient, drifting fog bands, a moon/sun disc, embers/stars,
// and a vignette. Cheap (a handful of noise taps), and it never needs texture memory.
const SKY_WGSL = /* wgsl */`
struct Sky {
  top: vec4f, mid: vec4f, bot: vec4f, fog: vec4f,     // fog.a = density
  orb: vec4f,                                         // x, y (0..1), radius, glow
  orbCol: vec4f,
  misc: vec4f,                                        // time, camX, camY, stars
  res: vec4f,                                         // w, h, vignette, dark(0..1)
};
@group(0) @binding(0) var<uniform> s: Sky;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var c = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: VOut; o.pos = vec4f(c[vi], 0, 1); o.uv = c[vi] * vec2f(0.5, -0.5) + 0.5; return o;
}
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn noise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2f(1, 0)), u.x), mix(hash(i + vec2f(0, 1)), hash(i + vec2f(1, 1)), u.x), u.y);
}
fn fbm(p: vec2f) -> f32 { return noise(p) * 0.55 + noise(p * 2.1 + 7.3) * 0.3 + noise(p * 4.3 + 1.7) * 0.15; }
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  let asp = s.res.x / max(s.res.y, 1.0);
  let y = v.uv.y;
  var col = mix(s.top.rgb, s.mid.rgb, smoothstep(0.0, 0.55, y));
  col = mix(col, s.bot.rgb, smoothstep(0.5, 1.0, y));
  // stars
  let sp = vec2f(v.uv.x * asp + s.misc.y * 0.00002, y) * 70.0;
  let cell = floor(sp); let st = hash(cell);
  let sub = fract(sp) - vec2f(0.5 + (hash(cell + 7.1) - 0.5) * 0.6, 0.5 + (hash(cell + 3.3) - 0.5) * 0.6);
  let tw = 0.55 + 0.45 * sin(s.misc.x * (1.0 + st * 3.0) + st * 40.0);
  let sd = smoothstep(0.09 + st * 0.05, 0.0, length(sub));
  col += vec3f(step(0.9, st) * sd * tw * s.misc.w * (1.0 - y * 1.2));
  // orb (moon / dead sun)
  let op = vec2f((v.uv.x - s.orb.x) * asp, y - s.orb.y);
  let od = length(op);
  col += s.orbCol.rgb * (smoothstep(s.orb.z, s.orb.z * 0.92, od) + s.orb.w * exp(-od * 7.0));
  // fog bands that drift, thicker toward the ground
  let fp = vec2f(v.uv.x * asp * 1.6 + s.misc.y * 0.00035 + s.misc.x * 0.012, y * 3.0 + s.misc.z * 0.0002);
  let f = fbm(fp) * smoothstep(0.15, 0.95, y) * s.fog.a;
  col = mix(col, s.fog.rgb, clamp(f, 0.0, 1.0));
  let vg = length((v.uv - 0.5) * vec2f(1.0, 1.15));
  col *= 1.0 - s.res.z * smoothstep(0.35, 0.95, vg);
  col *= 1.0 - s.res.w;
  return vec4f(col, 1.0);
}`;

// Screen-space finishing pass drawn over the world: vignette + darkness + damage flash.
const POST_WGSL = /* wgsl */`
struct P { a: vec4f, b: vec4f };   // a: vignette, dark, flashAmt, time ; b: flash rgb, lowHp
@group(0) @binding(0) var<uniform> p: P;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var c = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
  var o: VOut; o.pos = vec4f(c[vi], 0, 1); o.uv = c[vi] * 0.5 + 0.5; return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  let d = length((v.uv - 0.5) * vec2f(1.0, 1.2));
  let vg = p.a.x * smoothstep(0.38, 0.98, d);
  let low = p.b.a * smoothstep(0.3, 0.9, d) * (0.6 + 0.4 * sin(p.a.w * 5.0));
  var a = clamp(vg + p.a.y, 0.0, 1.0);
  var rgb = vec3f(0.0);
  rgb = mix(rgb, vec3f(0.45, 0.0, 0.02), clamp(low, 0.0, 1.0));
  a = max(a, low * 0.8);
  rgb = mix(rgb, p.b.rgb, p.a.z);
  a = max(a, p.a.z);
  return vec4f(rgb * a, a);
}`;

export class Renderer {
  static async create(canvas) {
    if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      || await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter was found on this device.');
    const device = await adapter.requestDevice();
    const r = new Renderer();
    r.canvas = canvas; r.device = device; r.adapter = adapter;
    // ?offscreen: test mode for headless browsers that cannot present a WebGPU canvas.
    // Frames render to a texture and are read back onto a 2D canvas.
    r.offscreen = /[?&]offscreen/.test(location.search);
    if (r.offscreen) { r.format = 'rgba8unorm'; r.ctx2d = canvas.getContext('2d'); }
    else {
      r.ctx = canvas.getContext('webgpu');
      r.format = navigator.gpu.getPreferredCanvasFormat();
      r.ctx.configure({ device, format: r.format, alphaMode: 'opaque' });
    }
    r.lost = false;
    device.addEventListener('uncapturederror', (e) => console.error('WebGPU:', e.error.message));
    device.lost.then(info => { r.lost = true; console.error('WebGPU device lost:', info.reason, info.message); r.onLost && r.onLost(info); });
    r._init();
    return r;
  }

  _init() {
    const d = this.device;
    this.atlas = new Atlas(d);
    this.data = new Float32Array(MAX_SPRITES * FLOATS);
    this.count = 0;
    this.batches = [];               // { cam, start, count }
    this.instBuf = d.createBuffer({ size: this.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const mod = d.createShaderModule({ code: SPRITE_WGSL });
    this.spriteLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 16 } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '2d-array' } },
    ] });
    const attrs = [0, 1, 2, 3, 4].map(i => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' }));
    this.spritePipe = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.spriteLayout] }),
      vertex: { module: mod, entryPoint: 'vs', buffers: [{ arrayStride: FLOATS * 4, stepMode: 'instance', attributes: attrs }] },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: this.format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] },
      primitive: { topology: 'triangle-strip' },
    });
    this.camBuf = d.createBuffer({ size: 256 * 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.camData = new Float32Array(64 * 8);
    this._bindVersion = -1;

    const sky = d.createShaderModule({ code: SKY_WGSL });
    this.skyBuf = d.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.skyData = new Float32Array(32);
    this.skyPipe = d.createRenderPipeline({ layout: 'auto',
      vertex: { module: sky, entryPoint: 'vs' },
      fragment: { module: sky, entryPoint: 'fs', targets: [{ format: this.format }] } });
    this.skyBind = d.createBindGroup({ layout: this.skyPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.skyBuf } }] });

    const post = d.createShaderModule({ code: POST_WGSL });
    this.postBuf = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.postData = new Float32Array(8);
    this.postPipe = d.createRenderPipeline({ layout: 'auto',
      vertex: { module: post, entryPoint: 'vs' },
      fragment: { module: post, entryPoint: 'fs', targets: [{ format: this.format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] } });
    this.postBind = d.createBindGroup({ layout: this.postPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.postBuf } }] });
    this.sky = { top: [0.02, 0.02, 0.04], mid: [0.07, 0.06, 0.1], bot: [0.12, 0.09, 0.1], fog: [0.2, 0.18, 0.2, 0.5],
      orb: [0.75, 0.2, 0.05, 0.25], orbCol: [0.7, 0.7, 0.8], stars: 1, vignette: 0.55, dark: 0 };
    this.post = { vignette: 0.5, dark: 0, flash: 0, flashCol: [1, 1, 1], lowHp: 0 };
    this.stats = { sprites: 0, batches: 0 };
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr)), h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.w = w; this.h = h;
  }

  _offTarget() {
    if (!this._off || this._off.width !== this.w || this._off.height !== this.h) {
      this._off = this.device.createTexture({ size: [this.w, this.h], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      this._offBuf = this.device.createBuffer({ size: Math.ceil(this.w * 4 / 256) * 256 * this.h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    }
    return this._off;
  }
  _readback(enc, tex) {
    const w = this.w, h = this.h, bpr = Math.ceil(w * 4 / 256) * 256, buf = this._offBuf;
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, h]);
    this._reading = true;
    this._pendingMap = () => buf.mapAsync(GPUMapMode.READ).then(() => {
      const src = new Uint8Array(buf.getMappedRange()), img = this.ctx2d.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(src.subarray(y * bpr, y * bpr + w * 4), y * w * 4);
      buf.unmap(); this.ctx2d.putImageData(img, 0, 0); this._reading = false;
    }).catch(() => { this._reading = false; });
  }

  begin() { this.count = 0; this.batches.length = 0; this._batch = null; }

  // Start a batch. cam: { x, y, zoom } = world point at the screen's top-left and px scale.
  camera(x, y, zoom) {
    const b = { x, y, zoom, start: this.count, count: 0 };
    this.batches.push(b); this._batch = b;
  }

  // Axis-aligned sprite. r = atlas region {u0,v0,u1,v1,layer}.
  quad(r, x, y, w, h, tint, flash, add) {
    if (!r || this.count >= MAX_SPRITES) return;
    const o = this.count++ * FLOATS, f = this.data;
    f[o] = w; f[o + 1] = 0; f[o + 2] = 0; f[o + 3] = h;
    f[o + 4] = x; f[o + 5] = y; f[o + 6] = r.layer; f[o + 7] = add || 0;
    f[o + 8] = r.u0; f[o + 9] = r.v0; f[o + 10] = r.u1; f[o + 11] = r.v1;
    if (tint) { f[o + 12] = tint[0]; f[o + 13] = tint[1]; f[o + 14] = tint[2]; f[o + 15] = tint[3]; }
    else { f[o + 12] = 1; f[o + 13] = 1; f[o + 14] = 1; f[o + 15] = 1; }
    if (flash) { f[o + 16] = flash[0]; f[o + 17] = flash[1]; f[o + 18] = flash[2]; f[o + 19] = flash[3]; }
    else { f[o + 16] = 0; f[o + 17] = 0; f[o + 18] = 0; f[o + 19] = 0; }
  }

  // Sprite under a 2x3 affine m = [a,b,c,d,tx,ty] (maps local px to world), with the
  // sprite's local rect (lx,ly,w,h). flipU mirrors the texture.
  affine(r, m, lx, ly, w, h, tint, flash, add, flipU) {
    if (!r || this.count >= MAX_SPRITES) return;
    const o = this.count++ * FLOATS, f = this.data;
    f[o] = m[0] * w; f[o + 1] = m[1] * w; f[o + 2] = m[2] * h; f[o + 3] = m[3] * h;
    f[o + 4] = m[0] * lx + m[2] * ly + m[4]; f[o + 5] = m[1] * lx + m[3] * ly + m[5];
    f[o + 6] = r.layer; f[o + 7] = add || 0;
    if (flipU) { f[o + 8] = r.u1; f[o + 10] = r.u0; } else { f[o + 8] = r.u0; f[o + 10] = r.u1; }
    f[o + 9] = r.v0; f[o + 11] = r.v1;
    if (tint) { f[o + 12] = tint[0]; f[o + 13] = tint[1]; f[o + 14] = tint[2]; f[o + 15] = tint[3]; }
    else { f[o + 12] = 1; f[o + 13] = 1; f[o + 14] = 1; f[o + 15] = 1; }
    if (flash) { f[o + 16] = flash[0]; f[o + 17] = flash[1]; f[o + 18] = flash[2]; f[o + 19] = flash[3]; }
    else { f[o + 16] = 0; f[o + 17] = 0; f[o + 18] = 0; f[o + 19] = 0; }
  }

  // Solid colour rectangle (uses the atlas's white texel).
  rect(x, y, w, h, tint, add) { this.quad(this.atlas.white, x, y, w, h, tint, null, add); }

  end(time, camX, camY) {
    const d = this.device;
    if (this.lost) return;
    if (this._batch) this._batch.count = this.count - this._batch.start;
    for (let i = 0; i < this.batches.length - 1; i++) this.batches[i].count = this.batches[i + 1].start - this.batches[i].start;
    this.atlas.flush();
    if (this._bindVersion !== this.atlas.version) {
      this.spriteBind = d.createBindGroup({ layout: this.spriteLayout, entries: [
        { binding: 0, resource: { buffer: this.camBuf, size: 16 } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.atlas.view() } ] });
      this._bindVersion = this.atlas.version;
    }
    if (this.count) d.queue.writeBuffer(this.instBuf, 0, this.data, 0, this.count * FLOATS);
    const nb = Math.min(this.batches.length, 8);
    for (let i = 0; i < nb; i++) {
      const b = this.batches[i], o = i * 64;          // 256-byte aligned slots
      const sx = 2 * b.zoom / this.w, sy = -2 * b.zoom / this.h;
      this.camData[o] = sx; this.camData[o + 1] = sy;
      this.camData[o + 2] = -1 - b.x * sx; this.camData[o + 3] = 1 - b.y * sy;
    }
    d.queue.writeBuffer(this.camBuf, 0, this.camData, 0, nb * 64);
    const s = this.sky, sd = this.skyData;
    sd.set(s.top, 0); sd[3] = 1; sd.set(s.mid, 4); sd[7] = 1; sd.set(s.bot, 8); sd[11] = 1;
    sd.set(s.fog, 12); sd.set(s.orb, 16); sd.set(s.orbCol, 20); sd[23] = 1;
    sd[24] = time; sd[25] = camX; sd[26] = camY; sd[27] = s.stars;
    sd[28] = this.w; sd[29] = this.h; sd[30] = s.vignette; sd[31] = s.dark;
    d.queue.writeBuffer(this.skyBuf, 0, sd);
    const p = this.post, pd = this.postData;
    pd[0] = p.vignette; pd[1] = p.dark; pd[2] = p.flash; pd[3] = time;
    pd[4] = p.flashCol[0]; pd[5] = p.flashCol[1]; pd[6] = p.flashCol[2]; pd[7] = p.lowHp;
    d.queue.writeBuffer(this.postBuf, 0, pd);

    const enc = d.createCommandEncoder();
    const target = this.offscreen ? this._offTarget() : this.ctx.getCurrentTexture();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(),
      loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    if (!(globalThis.SKIP & 1)) { pass.setPipeline(this.skyPipe); pass.setBindGroup(0, this.skyBind); pass.draw(3); }
    pass.setPipeline(this.spritePipe); pass.setVertexBuffer(0, this.instBuf);
    for (let i = 0; i < nb; i++) {
      if (globalThis.SKIP & 2) break;
      const b = this.batches[i];
      if (b.post && !globalThis.NOPOST) { pass.setPipeline(this.postPipe); pass.setBindGroup(0, this.postBind); pass.draw(3);
        pass.setPipeline(this.spritePipe); pass.setVertexBuffer(0, this.instBuf); }
      if (!b.count) continue;
      pass.setBindGroup(0, this.spriteBind, [i * 256]);
      pass.draw(4, b.count, 0, b.start);
    }
    pass.end();
    if (this.offscreen && !this._reading) this._readback(enc, target);
    d.queue.submit([enc.finish()]);
    if (this._pendingMap) { const f = this._pendingMap; this._pendingMap = null; f(); }
    this.stats.sprites = this.count; this.stats.batches = nb;
  }
}
