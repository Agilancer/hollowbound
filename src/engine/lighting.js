// Darkness overlay with punched-out light pools, rendered at half resolution and
// upscaled with nearest-neighbour so the falloff steps in visible pixel bands.
import { canvas } from './assets.js';

const LIP = 3;      // the top rows of every surface you stand on stay fully lit
const DIM = 0.45;   // how much of a light pool's strength is taken back where it falls on solid earth

export class Lighting {
  constructor(w, h) {
    this.w = w; this.h = h;
    [this.dark, this.g] = canvas(Math.ceil(w / 2), Math.ceil(h / 2));
    this.lights = [];
  }

  begin() { this.lights.length = 0; }

  /** x,y in screen pixels. r radius. a 0..1 strength. warm: tint colour for the glow pass. */
  add(x, y, r, a = 1, warm = null) {
    if (x < -r || y < -r || x > this.w + r || y > this.h + r) return;
    this.lights.push({ x, y, r, a, warm });
  }

  /** ambient: 0 (no darkness) .. 1 (pitch black). terrain, cx, cy (optional): the level's terrain
   *  canvases and the camera, so light pools fall on the open air and only graze the solid earth. */
  draw(ctx, ambient, color = '8,6,18', terrain = null, cx = 0, cy = 0) {
    if (ambient <= 0.001) return;
    const g = this.g, W = this.dark.width, H = this.dark.height;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.fillStyle = `rgba(${color},${ambient})`;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-out';
    for (const L of this.lights) {
      const x = L.x / 2, y = L.y / 2, r = L.r / 2;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(0,0,0,${L.a})`);
      grd.addColorStop(0.45, `rgba(0,0,0,${L.a * 0.75})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.dark, 0, 0, W * 2, H * 2);
    // additive warm glow around coloured lights
    ctx.globalCompositeOperation = 'lighter';
    for (const L of this.lights) {
      if (!L.warm) continue;
      const grd = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.6);
      grd.addColorStop(0, `rgba(${L.warm},${0.16 * L.a})`);
      grd.addColorStop(1, `rgba(${L.warm},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx.restore();
    if (terrain && terrain.rock && this.lights.length) this.dimSolid(ctx, terrain, cx, cy);
  }

  /** Without this a campfire lights the earth under the floor as brightly as the air above it, and
   *  the floor edge melts into a glowing mound. Darken lit solid earth by up to DIM, in proportion to
   *  the light that reached it, except a LIP-pixel band along every top surface. */
  dimSolid(ctx, terrain, cx, cy) {
    const mask = terrain.lightMask || (terrain.lightMask = solidMask(terrain));
    if (!this.dim) {
      [this.dim, this.dg] = canvas(this.dark.width, this.dark.height);
      [this.solid, this.sg] = canvas(this.w, this.h);
    }
    const d = this.dg, W = this.dim.width, H = this.dim.height;
    // how much light got through (1 - darkness), squared so a pool's faint fringe barely touches rock
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, W, H);
    d.fillStyle = `rgba(0,0,0,${DIM})`;
    d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    d.drawImage(this.dark, 0, 0);
    d.drawImage(this.dark, 0, 0);
    // ...kept only over the solid earth on screen
    const s = this.sg;
    s.globalCompositeOperation = 'source-over';
    s.clearRect(0, 0, this.w, this.h);
    s.drawImage(mask, -cx, -cy);
    s.globalCompositeOperation = 'source-in';
    s.drawImage(this.dim, 0, 0, W * 2, H * 2);
    s.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.solid, 0, 0);
  }
}

/** The level's solid earth (solid and fake-wall tiles, where the terrain has pixels) minus a LIP-pixel
 *  band along every top surface, as an opaque mask the size of the level. Built once per level and
 *  kept on the cached terrain object. */
function solidMask(terrain) {
  const { main, fake, rock, tw } = terrain;
  const W = main.width, H = main.height;
  const dm = main.getContext('2d').getImageData(0, 0, W, H).data;
  const df = fake.getContext('2d').getImageData(0, 0, W, H).data;
  const [c, g] = canvas(W, H);
  const out = g.createImageData(W, H), o = out.data;
  const run = new Uint16Array(W);   // solid pixels so far down each column
  for (let y = 0, j = 3; y < H; y++) {
    const row = (y >> 4) * tw;
    for (let x = 0; x < W; x++, j += 4) {
      const solid = rock[row + (x >> 4)] && (dm[j] || df[j]);
      run[x] = solid ? run[x] + 1 : 0;
      if (run[x] > LIP) o[j] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return c;
}
