// Tile map, quarter-tile autotiling, and AABB-vs-tile movement.
import { img, canvas } from './assets.js';

export const T = 16;
export const EMPTY = 0, SOLID = 1, ONEWAY = 2, SPIKES = 3, FAKE = 4, BARRIER = 5;
const CHARS = { '#': SOLID, '=': ONEWAY, '^': SPIKES, '%': FAKE, '|': BARRIER };

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Earth colours and shapes for TileMap.deepen(). up/side/down: what a pixel of distance costs in
// each direction (down 0: in town, depth counts only from the sky and the cliff faces).
const EARTH = {
  town: {
    up: 3, side: 5, down: 0, bands: [12, 26, 44, 68, 100], mix: [0.1, 0.2, 0.29, 0.37, 0.45], deep: [36, 20, 26],
    period: 26, slope: 0, topsoil: 12, seam: 0.62, lit: [134, 98, 62], flat: 0.38,
    beds: [[98, 68, 44], [118, 86, 56], [80, 54, 38], [128, 98, 66], [88, 58, 42], [108, 72, 46]],
    pebble: [[150, 132, 108], [106, 92, 80], [50, 34, 26]],
    stone: [[40, 32, 32], [70, 58, 54], [102, 88, 78], [136, 120, 104], [170, 156, 134]], angular: 0, boulders: 0.5,
    root: [[46, 28, 18], [86, 58, 36], [122, 86, 54]],
    lip: [[22, 48, 26], [36, 80, 42], [58, 122, 52], [90, 162, 62]], lipLen: 3,
  },
  cave: {
    up: 3, side: 4, down: 4, bands: [8, 20, 36, 58, 90], mix: [0.12, 0.22, 0.32, 0.41, 0.5], deep: [6, 4, 7],
    period: 30, slope: 0.12, topsoil: 5, seam: 0.5, lit: [58, 48, 42], flat: 0.38,
    beds: [[30, 24, 21], [40, 32, 28], [22, 18, 16], [36, 30, 28], [46, 38, 32], [26, 21, 20]],
    pebble: [[72, 62, 56], [44, 37, 34], [10, 8, 9]],
    stone: [[12, 10, 11], [28, 22, 21], [42, 35, 32], [60, 51, 46], [84, 72, 64]], angular: 0.5, boulders: 0.55,
    root: null,
    lip: [[22, 28, 20], [32, 40, 28], [46, 56, 38], [60, 72, 46]], lipLen: 5,
  },
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export class TileMap {
  /** rows: array of strings. Non-tile characters are left to the caller (entities). */
  constructor(rows, opts = {}) {
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.data = new Uint8Array(this.w * this.h);
    this.closedTop = !!opts.closedTop;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) this.data[y * this.w + x] = CHARS[row[x]] || EMPTY;
    });
    this.pw = this.w * T;
    this.ph = this.h * T;
  }

  get(tx, ty) {
    if (tx < 0 || tx >= this.w) return BARRIER;
    if (ty < 0) return this.closedTop ? BARRIER : EMPTY;
    if (ty >= this.h) return EMPTY;
    return this.data[ty * this.w + tx];
  }
  set(tx, ty, v) { if (tx >= 0 && ty >= 0 && tx < this.w && ty < this.h) this.data[ty * this.w + tx] = v; }
  solid(tx, ty) { const v = this.get(tx, ty); return v === SOLID || v === BARRIER; }
  /** For autotiling: fake walls and off-map count as rock so edges blend. */
  rocky(tx, ty) {
    if (tx < 0 || tx >= this.w || ty >= this.h) return true;
    if (ty < 0) return this.closedTop;
    const v = this.data[ty * this.w + tx];
    return v === SOLID || v === FAKE;
  }
  solidAtPx(px, py) { return this.solid(Math.floor(px / T), Math.floor(py / T)); }

  /**
   * Pre-render terrain. style: { sheet, grass: bool, moss: 0..1 } -> {main, fake} canvases.
   * Quarter-tile autotiling: each 16px tile is four 8px quarters picked from the sheet's 6x6 block
   * (outer corners, edges, interior) and its hole block (inner corners).
   */
  render(style) {
    const sheet = img(style.sheet);
    const planks = img('world/planks');
    const spikes = img('world/spikes');
    const [main, g] = canvas(this.pw, this.ph);
    const [fake, fg] = canvas(this.pw, this.ph);
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const v = this.data[ty * this.w + tx];
        if (v === SOLID || v === FAKE) this.drawRock(v === FAKE ? fg : g, sheet, tx, ty, style);
        else if (v === ONEWAY) {
          const l = this.get(tx - 1, ty) === ONEWAY, r = this.get(tx + 1, ty) === ONEWAY;
          const piece = !l ? 0 : !r ? 32 : 16;
          g.drawImage(planks, piece, 0, 16, 8, tx * T, ty * T, 16, 8);
        } else if (v === SPIKES) {
          g.drawImage(spikes, tx * T, ty * T);
        }
      }
    }
    this.deepen(main, fake, style);
    // which tiles are rock (solid or fake), for masks built from the terrain later (Lighting)
    const rock = new Uint8Array(this.w * this.h);
    for (let i = 0; i < rock.length; i++) rock[i] = this.data[i] === SOLID || this.data[i] === FAKE ? 1 : 0;
    return { main, fake, rock, tw: this.w };
  }

  /**
   * Large-scale structure for big masses of earth, baked once per level by render(). The autotile
   * interior is one repeating 16px pattern, so on its own a deep hill reads as flat wallpaper.
   * Adds dithered bands that darken with depth below the open air, strata seams, gravel beds,
   * buried boulders, roots (town) and grass or moss lips spilling over ledge corners.
   * Fake walls get exactly the same treatment, so a secret passage never gives itself away.
   */
  deepen(main, fake, style) {
    const E = style.grass ? EARTH.town : EARTH.cave;
    const W = this.pw, H = this.ph, tw = this.w;
    const im = main.getContext('2d').getImageData(0, 0, W, H), M = im.data;
    const hasFake = this.data.includes(FAKE);
    const imf = hasFake ? fake.getContext('2d').getImageData(0, 0, W, H) : null, FK = imf && imf.data;
    const bufAt = (x, y) => (hasFake && this.data[(y >> 4) * tw + (x >> 4)] === FAKE ? FK : M);

    // 1. chamfer distance (in thirds of a pixel) from every earth pixel to the open air: down from
    //    above and across the sides, and in the cave up from below too
    const D = new Uint16Array(W * H);
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        const v = this.data[ty * tw + tx];
        if (v !== SOLID && v !== FAKE) continue;
        const a = v === FAKE ? FK : M;
        for (let py = 0; py < T; py++) {
          for (let i = (ty * T + py) * W + tx * T, e = i + T; i < e; i++) if (a[i * 4 + 3]) D[i] = 65535;
        }
      }
    }
    const { up, side, down } = E;
    const sweep = (r) => {
      for (let i = r + 1, e = r + W; i < e; i++) if (D[i - 1] + side < D[i]) D[i] = D[i - 1] + side;
      for (let i = r + W - 2; i >= r; i--) if (D[i + 1] + side < D[i]) D[i] = D[i + 1] + side;
    };
    const pull = (y, dy, c) => {   // take distances from the row at y + dy
      const r = y * W, q = (y + dy) * W, cd = Math.round(Math.hypot(c, side));
      for (let x = 0; x < W; x++) {
        const i = r + x;
        if (!D[i]) continue;
        let v = D[q + x] + c;
        if (x > 0 && D[q + x - 1] + cd < v) v = D[q + x - 1] + cd;
        if (x < W - 1 && D[q + x + 1] + cd < v) v = D[q + x + 1] + cd;
        if (v < D[i]) D[i] = v;
      }
    };
    if (!this.closedTop) for (let x = 0; x < W; x++) if (D[x]) D[x] = up;
    sweep(0);
    for (let y = 1; y < H; y++) { pull(y, -1, up); sweep(y * W); }
    if (down) for (let y = H - 2; y >= 0; y--) { pull(y, 1, down); sweep(y * W); }
    const earth = (x, y) => x >= 0 && y >= 0 && x < W && y < H && D[y * W + x] > 0;
    const depth = (x, y) => Math.min(255, D[y * W + x] / 3);

    // slow sideways wobble for the depth bands, and the strata's rise and fall (and dip)
    const wob = new Int8Array(W), sof = new Int16Array(W);
    for (let x = 0; x < W; x++) {
      wob[x] = Math.round(Math.sin(x * 0.043 + 1.3) * 3 + Math.sin(x * 0.117 + 4.1) * 2);
      sof[x] = Math.round(Math.sin(x * 0.019 + 0.7) * 5 + Math.sin(x * 0.061 + 2.2) * 2 + x * E.slope);
    }
    const F = new Uint8Array(W * H);   // 1: stone or root (no strata over it), 2: soil shaded by a stone
    const put = (x, y, c, k = 1) => {
      const a = bufAt(x, y), o = (y * W + x) * 4;
      a[o] += (c[0] - a[o]) * k; a[o + 1] += (c[1] - a[o + 1]) * k; a[o + 2] += (c[2] - a[o + 2]) * k;
    };

    // 2. buried boulders, lit from the upper left, with the soil shaded under them
    const S = E.stone, CW = 46, CH = 38;
    for (let gy = 0; gy * CH < H; gy++) {
      for (let gx = 0; gx * CW < W; gx++) {
        if (hash(gx, gy, 41) >= E.boulders) continue;
        const rx = 5 + Math.floor(hash(gx, gy, 42) * 9);
        const ry = Math.max(3, Math.round(rx * (0.6 + hash(gx, gy, 43) * 0.3)));
        const cx = gx * CW + rx + 3 + Math.floor(hash(gx, gy, 44) * (CW - 2 * rx - 6));
        const cy = gy * CH + ry + 3 + Math.floor(hash(gx, gy, 45) * (CH - 2 * ry - 6));
        if (!earth(cx, cy) || depth(cx, cy) < Math.max(rx, ry) + 8) continue;
        let ok = true;   // wholly inside rock, with no ceiling just under it
        for (let ty = (cy - ry - 3) >> 4; ty <= (cy + ry + 4) >> 4 && ok; ty++) {
          for (let tx = (cx - rx - 3) >> 4; tx <= (cx + rx + 3) >> 4 && ok; tx++) ok = ty >= 0 && ty < this.h && this.rocky(tx, ty);
        }
        if (!ok) continue;
        const ph = hash(gx, gy, 46) * 6.283, ang = E.angular;
        const shape = (x, y) => {
          const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, t = Math.atan2(v, u);
          const r = (1 - ang) * Math.hypot(u, v) + ang * (Math.abs(u) + Math.abs(v)) * 0.75;
          return r - 0.08 * Math.sin(t * 3 + ph) - 0.05 * Math.sin(t * 5 + ph * 2);
        };
        for (let y = cy - ry - 2; y <= cy + ry + 3; y++) {
          for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
            if (!earth(x, y)) continue;
            const r = shape(x, y);
            if (r > 1) { if (r < 1.32 && y > cy) F[y * W + x] = 2; continue; }
            const l = -(((x + 0.5 - cx) / rx) * 0.62 + ((y + 0.5 - cy) / ry) * 0.78) + (1 - r) * 0.4;
            let c;
            if (shape(x + 1, y) > 1 || shape(x, y + 1) > 1) c = S[0];
            else if (shape(x - 1, y) > 1 || shape(x, y - 1) > 1) c = l > 0.3 ? S[3] : S[1];
            else if (l > 0.66) c = S[4];
            else if (l > 0.5) c = (x + y) & 1 ? S[4] : S[3];
            else if (l > 0.18) c = S[3];
            else if (l > -0.32) c = S[2];
            else c = l > -0.42 && (x + y) & 1 ? S[2] : S[1];
            put(x, y, c);
            F[y * W + x] = 1;
          }
        }
        if (rx >= 6) {   // a crack down the bigger ones
          let x = cx + Math.round(rx * (hash(gx, gy, 47) - 0.5) * 0.6);
          for (let y = cy - ry + 2; y < cy + ry - 1 && shape(x, y) < 0.75; y++) {
            put(x, y, S[1]);
            if (hash(x, y, 48) < 0.4) x += hash(y, x, 49) < 0.5 ? -1 : 1;
          }
        }
      }
    }

    // 3. roots reaching down from the turf (town)
    if (E.root) {
      const R = E.root;
      const root = (x, y, len, thick, dir, seed) => {
        for (let s = 0; s < len; s++, y++) {
          if (s && hash(x, y, seed) < 0.32) x += dir;
          if (hash(y, x, seed + 1) < 0.1) dir = -dir;
          if (!earth(x - 1, y) || !earth(x + 1, y) || !earth(x, y + 2)) return;
          const i = y * W + x;
          if (F[i] === 1) return;   // it meets a buried stone
          put(x, y, R[1], len - s <= 2 ? 0.5 : 1);
          F[i] = 1;
          if (s < thick) { put(x - 1, y, R[2]); put(x + 1, y, R[0]); F[i - 1] = F[i + 1] = 1; }
          if (s === len >> 1 && len > 14 && hash(x, y, seed + 2) < 0.6) root(x - dir, y + 1, len >> 1, 0, -dir, seed + 5);
        }
      };
      for (let ty = 0; ty < this.h; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          if (!this.rocky(tx, ty) || this.rocky(tx, ty - 1) || this.get(tx, ty - 1) === ONEWAY) continue;
          for (let k = 0; k < 2; k++) {
            if (hash(tx, ty, 50 + k) > 0.3) continue;
            const len = 10 + Math.floor(hash(tx, ty, 54 + k) * 26);
            root(tx * T + 3 + Math.floor(hash(tx, ty, 52 + k) * 10), ty * T + 9, len,
              hash(tx, ty, 56 + k) < 0.5 ? len * 0.4 : 0, hash(tx, ty, 58 + k) < 0.5 ? -1 : 1, 60 + k * 9);
          }
        }
      }
    }

    // 4. strata seams, bed tints and gravel, then dithered bands darkening with depth
    const [dr, dg, db] = E.deep, B = E.bands, MX = E.mix, P = E.pebble;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!D[i]) continue;
        const a = bufAt(x, y), o = i * 4;
        let r = a[o], g = a[o + 1], b = a[o + 2];
        const d = D[i] === 65535 ? 255 : D[i] / 3;
        if (F[i] !== 1 && d >= E.topsoil + wob[x]) {
          const s = y + sof[x], L = Math.floor(s / E.period), fy = s - L * E.period;
          // each bed has its own tone, and evens out the small repeating texture under it
          const c = E.beds[Math.floor(hash(L, 7, 71) * E.beds.length)], k = E.flat;
          r += (c[0] - r) * k; g += (c[1] - g) * k; b += (c[2] - b) * k;
          const gap = hash(x >> 2, L, 72) < 0.16;
          if (fy === 0 && !gap) { r *= E.seam; g *= E.seam; b *= E.seam; }
          else if (fy === 1 && !gap) { r += (E.lit[0] - r) * 0.3; g += (E.lit[1] - g) * 0.3; b += (E.lit[2] - b) * 0.3; }
          else if (fy >= 3) {
            // pebbles: packed in gravel beds, scattered elsewhere
            const px = x + L * 5, cx = Math.floor(px / 6), cy = Math.floor((fy - 3) / 4), lx = px - cx * 6, ly = fy - 3 - cy * 4;
            if (hash(cx, cy, L + 90) < (hash(L, 3, 73) < 0.4 ? 0.34 : 0.05)) {
              const w = hash(cx, cy, L + 91) < 0.5 ? 2 : 3;
              const pc = ly === 0 && lx >= 1 && lx <= w ? P[0] : ly === 1 && lx >= 1 && lx <= w ? P[1] : ly === 2 && lx >= 2 && lx <= w ? P[2] : null;
              if (pc) { const kk = pc === P[2] ? 0.45 : 1; r += (pc[0] - r) * kk; g += (pc[1] - g) * kk; b += (pc[2] - b) * kk; }
            }
          }
        }
        if (F[i] === 2) { r *= 0.8; g *= 0.8; b *= 0.8; }
        const dd = d + wob[x] + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * 7;
        let lv = 0;
        while (lv < B.length && dd >= B[lv]) lv++;
        if (lv) { const k = MX[lv - 1]; r += (dr - r) * k; g += (dg - g) * k; b += (db - b) * k; }
        a[o] = r; a[o + 1] = g; a[o + 2] = b;
      }
    }

    // 5. grass or moss spilling over ledge corners, and (town) roots dangling from ceilings
    const paint = (x, y, c) => {
      if (x < 0 || y < 0 || x >= W || y >= H || D[y * W + x]) return false;
      const o = (y * W + x) * 4;
      if (M[o + 3]) return false;
      M[o] = c[0]; M[o + 1] = c[1]; M[o + 2] = c[2]; M[o + 3] = 255;
      return true;
    };
    const Lc = E.lip;
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        if (!this.rocky(tx, ty) || this.rocky(tx, ty - 1) || this.get(tx, ty - 1) === ONEWAY) continue;
        if (!style.grass && !(style.moss && hash(tx >> 1, ty, 3) < style.moss)) continue;   // as drawRock picks mossy tops
        for (const sd of [-1, 1]) {
          if (this.rocky(tx + sd, ty)) continue;
          // a clump bulging out over the edge, tapering into a strand: each row fills from the turf
          // (the corner is rounded) out past the tile edge
          const x0 = tx * T, y0 = ty * T + 1, a = bufAt(x0, y0);
          const h1 = hash(tx, ty, 80 + sd), h2 = hash(tx, ty, 83 + sd), h3 = hash(tx, ty, 86 + sd);
          const n = 4 + Math.floor(h1 * E.lipLen) + (h3 < 0.4 ? 2 + Math.floor(h2 * 5) : 0);
          for (let k = 0; k < n; k++) {
            const y = y0 + k;
            let e = sd < 0 ? x0 : x0 + T - 1;
            while (e >= x0 && e < x0 + T && !a[(y * W + e) * 4 + 3]) e -= sd;
            if (e < x0 || e >= x0 + T) continue;
            const far = (sd < 0 ? x0 : x0 + T - 1) + sd * (k === 0 ? 0 : k < 4 ? 1 + (k === 2 && h2 < 0.5 ? 1 : 0) : 1);
            for (let x = e + sd; sd < 0 ? x >= far : x <= far; x += sd) {
              const outer = x === far;
              paint(x, y, k === n - 1 || (outer && k >= 2) ? Lc[0] : k === 0 ? Lc[3] : k === 1 ? (outer ? Lc[1] : Lc[2]) : Lc[1]);
            }
          }
        }
      }
    }
    if (E.root) {
      for (let ty = 0; ty < this.h - 1; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          if (!this.rocky(tx, ty) || this.rocky(tx, ty + 1) || this.get(tx, ty + 1) === ONEWAY) continue;
          for (let k = 0; k < 2; k++) {
            if (hash(tx, ty, 90 + k) > 0.45) continue;
            let x = tx * T + 2 + Math.floor(hash(tx, ty, 92 + k) * 12), y = (ty + 1) * T;
            while (y > ty * T + 8 && !earth(x, y - 1)) y--;
            const len = 3 + Math.floor(hash(tx, ty, 94 + k) * 10);
            for (let s = 0; s < len; s++, y++) {
              if (s > 1 && hash(x, y, 96) < 0.22) x += hash(y, x, 97) < 0.5 ? -1 : 1;
              if (!paint(x, y, s < len * 0.6 ? E.root[1] : E.root[0])) break;
            }
          }
        }
      }
    }
    main.getContext('2d').putImageData(im, 0, 0);
    if (imf) fake.getContext('2d').putImageData(imf, 0, 0);
  }

  drawRock(g, sheet, tx, ty, style) {
    const up = this.rocky(tx, ty - 1), dn = this.rocky(tx, ty + 1);
    const lf = this.rocky(tx - 1, ty), rt = this.rocky(tx + 1, ty);
    const v = Math.floor(hash(tx, ty) * 4);
    const v2 = Math.floor(hash(tx, ty, 7) * 4);
    const mossy = style.grass || (style.moss && hash(tx >> 1, ty, 3) < style.moss);
    const quarters = [
      [0, 0, up, lf, this.rocky(tx - 1, ty - 1)],
      [1, 0, up, rt, this.rocky(tx + 1, ty - 1)],
      [0, 1, dn, lf, this.rocky(tx - 1, ty + 1)],
      [1, 1, dn, rt, this.rocky(tx + 1, ty + 1)],
    ];
    for (const [qx, qy, V, H, D] of quarters) {
      let sx, sy, flip = false;
      const top = qy === 0, left = qx === 0;
      if (!V && !H) {
        if (top && !mossy) { sx = left ? 0 : 5; sy = 5; flip = true; } // grassless top corner: flipped bottom corner
        else { sx = left ? 0 : 5; sy = top ? 0 : 5; }
      } else if (!V && H) {
        if (top && !mossy) { sx = 8 + (v & 1); sy = 4; } // hole floor: rocky top edge
        else { sx = 1 + v; sy = top ? 0 : 5; }
      } else if (V && !H) {
        sx = left ? 0 : 5; sy = 1 + v2;
      } else if (!D) {
        sx = left ? 10 : 7; sy = top ? 4 : 1;
      } else {
        sx = 1 + v; sy = 1 + v2;
      }
      const qsx = sx * T + qx * 8, dx = tx * T + qx * 8, dy = ty * T + qy * 8;
      if (flip) {
        // take the bottom quarter and mirror it vertically into the top slot
        g.save();
        g.translate(dx, dy + 8);
        g.scale(1, -1);
        g.drawImage(sheet, qsx, sy * T + 8, 8, 8, 0, 0, 8, 8);
        g.restore();
      } else {
        g.drawImage(sheet, qsx, sy * T + qy * 8, 8, 8, dx, dy, 8, 8);
        if (style.mossTint && mossy && top && !V) {
          // cave moss: the grass tile, muted down so it doesn't outshine the floor
          g.save();
          g.globalCompositeOperation = 'source-atop';
          g.fillStyle = style.mossTint;
          g.fillRect(dx, dy, 8, 8);
          g.restore();
        }
      }
    }
  }
}

// ---------------------------------------------------------------- movement
// Bodies: { x (centre), y (feet), hw (half width), h (height) }. Occupies [x-hw, x+hw) x [y-h, y).

export function moveX(map, b, dx) {
  if (!dx) return false;
  const top = b.y - b.h + 0.5, bot = b.y - 0.5;
  const ty0 = Math.floor(top / T), ty1 = Math.floor(bot / T);
  const nx = b.x + dx;
  const edge = dx > 0 ? nx + b.hw : nx - b.hw;
  const tx = Math.floor((dx > 0 ? edge - 0.001 : edge) / T);
  for (let ty = ty0; ty <= ty1; ty++) {
    if (map.solid(tx, ty)) {
      b.x = dx > 0 ? tx * T - b.hw : (tx + 1) * T + b.hw;
      return true;
    }
  }
  b.x = nx;
  return false;
}

/** Returns 'floor', 'ceil' or null. dropping: fall through one-way planks. */
export function moveY(map, b, dy, dropping = false) {
  if (!dy) return null;
  const l = b.x - b.hw + 0.5, r = b.x + b.hw - 0.5;
  const tx0 = Math.floor(l / T), tx1 = Math.floor(r / T);
  const ny = b.y + dy;
  if (dy > 0) {
    const ty = Math.floor((ny - 0.001) / T);
    const prevRow = Math.floor((b.y - 0.001) / T);
    for (let tx = tx0; tx <= tx1; tx++) {
      const v = map.get(tx, ty);
      if (v === SOLID || v === BARRIER || (v === ONEWAY && !dropping && ty > prevRow - 0 && b.y <= ty * T + 0.01)) {
        b.y = ty * T;
        return 'floor';
      }
    }
  } else {
    const ty = Math.floor((ny - b.h) / T);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (map.solid(tx, ty)) {
        b.y = (ty + 1) * T + b.h;
        return 'ceil';
      }
    }
  }
  b.y = ny;
  return null;
}

/** Is there ground (solid or plank) directly under the body? */
export function grounded(map, b) {
  const l = b.x - b.hw + 0.5, r = b.x + b.hw - 0.5;
  const ty = Math.floor((b.y + 0.5) / T);
  if (Math.abs(b.y - ty * T) > 0.6) return false;
  for (let tx = Math.floor(l / T); tx <= Math.floor(r / T); tx++) {
    const v = map.get(tx, ty);
    if (v === SOLID || v === BARRIER || v === ONEWAY) return true;
  }
  return false;
}

/** Standing on a plank only (so down+jump drops through)? */
export function onPlank(map, b) {
  const ty = Math.floor((b.y + 0.5) / T);
  let plank = false;
  for (let tx = Math.floor((b.x - b.hw + 0.5) / T); tx <= Math.floor((b.x + b.hw - 0.5) / T); tx++) {
    const v = map.get(tx, ty);
    if (v === SOLID || v === BARRIER) return false;
    if (v === ONEWAY) plank = true;
  }
  return plank;
}

export function touchesSpikes(map, b) {
  const l = b.x - b.hw + 2, r = b.x + b.hw - 2;
  const top = b.y - b.h, bot = b.y - 1;
  for (let ty = Math.floor(top / T); ty <= Math.floor(bot / T); ty++) {
    for (let tx = Math.floor(l / T); tx <= Math.floor(r / T); tx++) {
      if (map.get(tx, ty) === SPIKES && bot > ty * T + 7) return true;
    }
  }
  return false;
}

/** Is a fake-wall tile overlapping this rect? (used to fade secret passages) */
export function inFake(map, x, y) {
  return map.get(Math.floor(x / T), Math.floor(y / T)) === FAKE;
}

export function lineOfSight(map, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (map.solidAtPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}
