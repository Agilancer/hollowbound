// The look of a map: terrain baked from the theme's textures, procedural far silhouettes
// behind a shader sky, props from Velscour's packs, town facades, ropes and portals.
// Everything is baked once on canvases when the map loads and lives in 'map' atlas pages.
import { G, clamp } from '../state.js';
import { THEMES } from '../data/themes.js';
import { rng, hashStr } from '../world/layout.js';
import { asset } from '../core/paths.js';
import { SHAPES } from './fx.js';

const CH = 1016;                 // chunk width
const GROUND_H = 210;
const mk = (w, h) => { const c = new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); return [c, c.getContext('2d')]; };
const rgb = (c, a = 1) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${a})`;
const bmCache = new Map();
const texKey = (t) => (typeof t === 'string' ? t : t.src + '#' + (t.rect || []).join(','));
/** A texture source: a path, or { src, rect } (one tile cut from a sheet). */
const bitmap = (tex) => {
  if (!tex) return Promise.resolve(null);
  if (typeof tex === 'string') return bitmapFile(tex);
  const k = texKey(tex); let p = bmCache.get(k);
  if (!p) { p = bitmapFile(tex.src).then(bm => (bm && tex.rect ? createImageBitmap(bm, tex.rect[0], tex.rect[1], tex.rect[2], tex.rect[3]) : bm)).catch(() => null); bmCache.set(k, p); }
  return p;
};
const bitmapFile = (path) => { let p = bmCache.get(path); if (!p) { p = fetch(asset(path)).then(r => { if (!r.ok) throw new Error(path); return r.blob(); }).then(b => createImageBitmap(b)).catch(() => null); bmCache.set(path, p); if (bmCache.size > 90) bmCache.delete(bmCache.keys().next().value); } return p; };
function tile(g, bm, x, y, w, h, scale = 1, ox = 0) {
  if (!bm) { g.fillStyle = '#2a2622'; g.fillRect(x, y, w, h); return; }
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.imageSmoothingEnabled = false;
  const tw = bm.width * scale, th = bm.height * scale;
  for (let ty = y; ty < y + h; ty += th) for (let tx = x - ((ox % tw) + tw) % tw; tx < x + w; tx += tw) g.drawImage(bm, tx, ty, tw, th);
  g.restore();
}

export async function buildScene(M) {
  const at = G.rd.atlas, geo = M.geo, th = THEMES[M.area.theme] || THEMES.wilds, r = rng(hashStr(M.def.id) ^ 0x9e3779b9);
  const S = { theme: th, platSprites: [], stairs: [], chunks: [], far: [], props: { back: [], mid: [], front: [] }, buildings: [], lights: [], ropes: [], deep: null, wall: null, light: th.light || [1, 1, 1] };
  Object.assign(G.rd.sky, { top: th.sky.top, mid: th.sky.mid, bot: th.sky.bot, fog: th.sky.fog, orb: th.sky.orb, orbCol: th.sky.orbCol, stars: th.sky.stars, vignette: th.sky.vignette, dark: 0 });
  const [top, fill, ledge, wall] = await Promise.all([bitmap(th.ground.top), bitmap(th.ground.fill), bitmap(th.ledge.tex), th.backwall ? bitmap(th.backwall.tex) : null]);
  const town = M.def.kind === 'town';

  // ---- ground: fill body, a top band of the walk surface, a lip, and side cliffs where it steps
  const grounds = geo.plats.filter(p => p.ground);
  for (let gi = 0; gi < grounds.length; gi++) {
    const p = grounds[gi], L = grounds[gi - 1], R = grounds[gi + 1];
    for (let x = p.x1; x < p.x2; x += CH) {
      const w = Math.min(CH, p.x2 - x), [c, g] = mk(w, GROUND_H);
      tile(g, fill, 0, 0, w, GROUND_H, 1, x);
      tile(g, top, 0, 0, w, 34, 1, x);
      const sh = g.createLinearGradient(0, 0, 0, GROUND_H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.16, 'rgba(0,0,0,0.12)'); sh.addColorStop(0.2, 'rgba(0,0,0,0.42)'); sh.addColorStop(1, 'rgba(0,0,0,0.86)');
      g.fillStyle = sh; g.fillRect(0, 0, w, GROUND_H);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 33, w, 3);
      g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(0, 0, w, 2);
      lip(g, th.ground, w, r);
      // cliff shading on a side that drops to lower ground, or at the map's edge
      const edge = (left) => { const gr = g.createLinearGradient(left ? 0 : w, 0, left ? 26 : w - 26, 0); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(left ? 0 : w - 26, 0, 26, GROUND_H); };
      if (x === p.x1 && L && L.y > p.y) edge(true);
      if (x + w >= p.x2 && R && R.y > p.y) edge(false);
      S.chunks.push({ r: at.addCanvas(c, 'map'), x, y: p.y - 5, w, h: GROUND_H, x2: x + w });
    }
  }
  if (th.stairs && th.stairs.rect) { const st = propSprite({ src: th.stairs.src, rect: th.stairs.rect, h: 80 }); for (let gi = 0; gi < grounds.length - 1; gi++) { const a = grounds[gi], b = grounds[gi + 1]; if (a.y === b.y) continue; const up = b.y < a.y; S.stairs.push({ s: st, x: a.x2, y: Math.max(a.y, b.y), up, h: Math.abs(a.y - b.y) }); } }
  { const [c, g] = mk(512, 512); tile(g, fill, 0, 0, 512, 512, 1, 0); g.fillStyle = 'rgba(0,0,0,0.86)'; g.fillRect(0, 0, 512, 512); S.deep = { r: at.sub(at.addCanvas(c, 'map'), 1, 1, 510, 510), grounds }; }

  // ---- ledges
  for (const p of geo.plats) {
    if (p.ground) continue;
    if (town && !p.small) { p.roof = true; continue; }               // town ledges are rooftops (drawn with the building)
    const len = p.x2 - p.x1, LS = th.ledgeSprites || [], BR = th.bridges || [];
    // a sprite is only used near its own pixel size (never stretched into mush)
    const fits = (list) => list.filter(q => q.rect && (len + 16) / q.rect[2] >= 0.6 && (len + 16) / q.rect[2] <= 1.3);
    const fl = fits(LS), fb = fits(BR);
    const pick = p.small && fl.length ? fl[Math.floor(r() * fl.length)] : !p.small && fb.length && r() < 0.6 ? fb[Math.floor(r() * fb.length)] : !p.small && fl.length && len <= 420 ? fl[Math.floor(r() * fl.length)] : null;
    if (pick && pick.rect) { const sp = propSprite({ ...pick, h: 100 }), k = (len + 16) / pick.rect[2]; sp.k = k; S.platSprites.push({ s: sp, x: (p.x1 + p.x2) / 2, y: p.y, k, ax: pick.anchor ? pick.anchor[0] : pick.rect[2] / 2, ay: pick.anchor ? pick.anchor[1] : 8 }); continue; }
    for (let x = p.x1; x < p.x2; x += CH) {
      const w = Math.min(CH, p.x2 - x), H = 78, [c, g] = mk(w, H);
      ledgeArt(g, ledge, th.ledge.style, w, H, x === p.x1, x + w >= p.x2, r, x);
      S.chunks.push({ r: at.addCanvas(c, 'map'), x, y: p.y - 6, w, h: H, x2: x + w, ledge: true });
    }
  }
  // ---- backwall (interiors)
  if (wall) { const [c, g] = mk(512, 512); tile(g, wall, 0, 0, 512, 512, wall.width < 200 ? 2 : 1, 0); const t = th.backwall.tint; g.globalCompositeOperation = 'multiply'; g.fillStyle = rgb(t); g.fillRect(0, 0, 512, 512); g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 512, 512); S.wall = { r: at.sub(at.addCanvas(c, 'map'), 1, 1, 510, 510), alpha: th.backwall.alpha ?? 1 }; }
  // ---- far silhouettes
  for (const f of th.far || []) { const [c, g] = mk(1016, 420); silhouette(g, f.kind, 1016, 420, r); S.far.push({ r: at.addCanvas(c, 'map'), color: f.color, parallax: f.parallax, height: f.height }); }
  // ---- ropes
  S.ropeTex = at.addCanvas(ropeArt(th.rope), 'map'); S.ropeKind = th.rope;
  S.ladder = th.ladders && th.ladders.length ? propSprite({ ...th.ladders[0], h: 100 }) : null;
  // ---- town facades under the rooftops
  if (town && th.facade) await facades(S, M, th, r);
  // ---- props
  placeProps(S, M, th, r);
  // ---- portal frames + rune disc
  const doors = th.doors || [];
  for (const po of M.portals) { po.door = null; po.doorH = 0; }
  M.scene = S;
  return S;
}

function lip(g, gr, w, r) {
  const c = gr.lipColor || [0.3, 0.4, 0.2];
  if (gr.lip === 'grass' || gr.lip === 'moss') {
    for (let x = 0; x < w; x += 3) { const h = gr.lip === 'moss' ? 3 + r() * 6 : 4 + r() * 11, k = 0.55 + r() * 0.6; g.fillStyle = rgb([c[0] * k, c[1] * k, c[2] * k]); g.fillRect(x, 1 - (gr.lip === 'grass' ? h * 0.55 : 0), 2 + r() * 2, h); }
    g.fillStyle = rgb([c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], 0.8); g.fillRect(0, 3, w, 3);
  } else if (gr.lip === 'slime') { for (let x = 0; x < w; x += 9 + r() * 22) { const h = 5 + r() * 26; g.fillStyle = rgb(c, 0.75); g.beginPath(); g.roundRect(x, 0, 5 + r() * 6, h, 4); g.fill(); } g.fillStyle = rgb(c, 0.8); g.fillRect(0, 0, w, 4); }
  else if (gr.lip === 'snow') { g.fillStyle = rgb(c); for (let x = 0; x < w; x += 14) { g.beginPath(); g.ellipse(x + 7, 3, 12, 5 + r() * 5, 0, 0, 7); g.fill(); } }
  else if (gr.lip === 'bone') { for (let x = 8; x < w; x += 26 + r() * 60) { g.fillStyle = rgb(c, 0.9); g.beginPath(); g.arc(x, 4, 4 + r() * 3, 0, 7); g.fill(); g.fillRect(x + 6, 3, 9 + r() * 10, 3); } }
  else if (gr.lip === 'ash') { for (let x = 0; x < w; x += 4) { g.fillStyle = rgb(c, 0.25 + r() * 0.4); g.fillRect(x, 0, 4, 2 + r() * 4); } }
  else if (gr.lip === 'stone') { g.fillStyle = rgb(c, 0.55); g.fillRect(0, 0, w, 3); for (let x = 30; x < w; x += 60 + r() * 120) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 0, 2, 5); } }
}
function ledgeArt(g, tex, style, w, H, capL, capR, r, ox) {
  const T = 30;
  g.save(); g.beginPath(); g.roundRect(0, 5, w, T, [capL ? 4 : 0, capR ? 4 : 0, capR ? 7 : 0, capL ? 7 : 0]); g.clip();
  tile(g, tex, 0, 5, w, T, 1, ox);
  const sh = g.createLinearGradient(0, 5, 0, 5 + T); sh.addColorStop(0, 'rgba(255,255,255,0.16)'); sh.addColorStop(0.18, 'rgba(0,0,0,0)'); sh.addColorStop(0.6, 'rgba(0,0,0,0.3)'); sh.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = sh; g.fillRect(0, 5, w, T); g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 2; g.beginPath(); g.roundRect(1, 6, w - 2, T - 1, [capL ? 4 : 0, capR ? 4 : 0, capR ? 7 : 0, capL ? 7 : 0]); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.38)'; g.fillRect(capL ? 4 : 0, 6, w - (capL ? 4 : 0) - (capR ? 4 : 0), 2); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 14, w, 2);
  // what hangs beneath
  const y0 = 5 + T;
  if (style === 'wood') { for (let x = 28; x < w - 10; x += 150) { g.fillStyle = '#1c130c'; g.fillRect(x, y0, 9, 22); g.beginPath(); g.moveTo(x + 9, y0); g.lineTo(x + 36, y0); g.lineTo(x + 9, y0 + 22); g.fill(); } }
  else if (style === 'root') { for (let x = 6; x < w; x += 14 + r() * 30) { const h = 8 + r() * 38; g.strokeStyle = `rgba(${30 + r() * 20},${22 + r() * 12},14,0.95)`; g.lineWidth = 1.5 + r() * 3; g.beginPath(); g.moveTo(x, y0 - 2); g.quadraticCurveTo(x + (r() - 0.5) * 22, y0 + h * 0.6, x + (r() - 0.5) * 16, y0 + h); g.stroke(); } }
  else if (style === 'bone') { for (let x = 10; x < w; x += 22 + r() * 44) { g.fillStyle = `rgba(${170 + r() * 50},${160 + r() * 40},${130 + r() * 30},0.9)`; const h = 5 + r() * 16; g.beginPath(); g.moveTo(x - 3, y0 - 1); g.lineTo(x + 3, y0 - 1); g.lineTo(x, y0 + h); g.fill(); } }
  else if (style === 'iron') { for (let x = 12; x < w; x += 34) { g.fillStyle = '#0c0c0e'; g.beginPath(); g.arc(x, 20, 3.2, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(x - 1, 19, 1.2, 0, 7); g.fill(); } for (let x = 40; x < w - 20; x += 190) { g.strokeStyle = '#0e0e10'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + 30); g.stroke(); } }
  else { for (let x = 8; x < w; x += 18 + r() * 46) { const h = 4 + r() * 14, wd = 6 + r() * 16; g.fillStyle = `rgba(${12 + r() * 14},${12 + r() * 12},${12 + r() * 12},0.95)`; g.beginPath(); g.moveTo(x, y0 - 1); g.lineTo(x + wd, y0 - 1); g.lineTo(x + wd * 0.5 + (r() - 0.5) * 6, y0 + h); g.fill(); } }
  // a soft shadow cast down from the ledge
  const sd = g.createLinearGradient(0, y0, 0, H); sd.addColorStop(0, 'rgba(0,0,0,0.34)'); sd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sd; g.fillRect(6, y0, w - 12, H - y0);
}
function ropeArt(kind) {
  const [c, g] = mk(26, 64);
  if (kind === 'chain') { g.strokeStyle = '#8a8a90'; g.lineWidth = 3; for (let y = 0; y < 64; y += 16) { g.beginPath(); g.ellipse(13, y + 5, 4, 7, 0, 0, 7); g.stroke(); g.beginPath(); g.moveTo(13, y + 10); g.lineTo(13, y + 17); g.stroke(); } }
  else if (kind === 'ladder_wood' || kind === 'ladder_iron') { g.fillStyle = kind === 'ladder_iron' ? '#3a3d44' : '#5a3c22'; g.fillRect(2, 0, 4, 64); g.fillRect(20, 0, 4, 64); g.fillStyle = kind === 'ladder_iron' ? '#6a6e78' : '#8a6238'; for (let y = 6; y < 64; y += 16) g.fillRect(2, y, 22, 4); }
  else if (kind === 'vine' || kind === 'root') { g.strokeStyle = kind === 'vine' ? '#2f5a26' : '#4a3422'; g.lineWidth = 5; g.beginPath(); g.moveTo(13, 0); g.bezierCurveTo(4, 16, 22, 32, 13, 64); g.stroke(); if (kind === 'vine') { g.fillStyle = '#4f8a36'; for (let y = 6; y < 64; y += 15) { g.beginPath(); g.ellipse(y % 30 ? 6 : 20, y, 6, 3, 0.6, 0, 7); g.fill(); } } }
  else { g.fillStyle = '#2a1e10'; g.fillRect(7, 0, 12, 64); g.fillStyle = '#a8875a'; g.fillRect(9, 0, 8, 64); g.fillStyle = '#d8bc8a'; g.fillRect(9, 0, 3, 64); g.strokeStyle = '#4a361e'; g.lineWidth = 2; for (let y = -8; y < 64; y += 8) { g.beginPath(); g.moveTo(9, y + 8); g.lineTo(17, y); g.stroke(); } return c; }
  if (false) { g.fillStyle = '#7a6140'; g.fillRect(10, 0, 6, 64); g.strokeStyle = '#3d2f1c'; g.lineWidth = 1.5; for (let y = -6; y < 64; y += 7) { g.beginPath(); g.moveTo(10, y + 6); g.lineTo(16, y); g.stroke(); } g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(10, 0, 2, 64); }
  return c;
}

// ---- far layers: white silhouettes, tinted at draw time. Tile horizontally.
function silhouette(g, kind, W, H, r) {
  g.fillStyle = '#fff';
  const wrap = (fn) => { for (const dx of [-W, 0, W]) { g.save(); g.translate(dx, 0); fn(); g.restore(); } };
  const base = (y0, amp, step) => { const pts = []; for (let x = 0; x <= W; x += step) pts.push([x, y0 + (r() - 0.5) * amp]); pts[pts.length - 1][1] = pts[0][1]; return pts; };
  const fillPts = (pts) => { g.beginPath(); g.moveTo(0, H); for (const p of pts) g.lineTo(p[0], p[1]); g.lineTo(W, H); g.fill(); };
  if (kind === 'mountains') { const pts = []; let x = 0, up = true; const y0 = H * 0.75; pts.push([0, y0]); while (x < W - 60) { x += 50 + r() * 120; pts.push([Math.min(x, W - 30), up ? H * (0.08 + r() * 0.4) : H * (0.5 + r() * 0.3)]); up = !up; } pts.push([W, y0]); fillPts(pts); return; }
  fillPts(base(H * 0.86, 14, 60));
  const items = [];
  const n = { town: 9, ruins: 8, deadtrees: 12, forest: 26, spires: 7, graves: 20, pillars: 7, cave: 16, pipes: 6, castle: 3 }[kind] || 8;
  for (let i = 0; i < n; i++) items.push((i + r() * 0.7) * W / n);
  wrap(() => { const rr = rng(1234 + kind.length * 77);
    for (const x of items) {
      const y = H * 0.87;
      if (kind === 'town') { const w = 60 + rr() * 70, h = 60 + rr() * 90; g.fillRect(x, y - h, w, h + 40); g.beginPath(); g.moveTo(x - 8, y - h); g.lineTo(x + w / 2, y - h - 30 - rr() * 50); g.lineTo(x + w + 8, y - h); g.fill(); if (rr() < 0.5) g.fillRect(x + w * 0.7, y - h - 50, 10, 40); if (rr() < 0.2) { g.fillRect(x + 10, y - h - 150, 18, 150); g.beginPath(); g.moveTo(x + 4, y - h - 150); g.lineTo(x + 19, y - h - 215); g.lineTo(x + 34, y - h - 150); g.fill(); } }
      else if (kind === 'ruins') { const h = 70 + rr() * 150, w = 18 + rr() * 14; g.fillRect(x, y - h, w, h + 30); if (rr() < 0.6) { const s = 60 + rr() * 60; g.fillRect(x + s, y - h * 0.8, w, h + 30); g.beginPath(); g.arc(x + (s + w) / 2, y - h * 0.8, (s + w) / 2, Math.PI, Math.PI * (1.5 + rr() * 0.5)); g.lineTo(x + (s + w) / 2, y - h * 0.8); g.fill(); } g.fillRect(x - 6, y - h, w + 12, 8); }
      else if (kind === 'deadtrees') { const h = 90 + rr() * 170; g.lineWidth = 5 + rr() * 6; g.strokeStyle = '#fff'; g.lineCap = 'round'; const br = (bx, by, len, ang, d) => { const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len; g.lineWidth = Math.max(1, d * 2.2); g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke(); if (d > 1) { br(ex, ey, len * 0.66, ang - 0.4 - rr() * 0.5, d - 1); br(ex, ey, len * 0.62, ang + 0.3 + rr() * 0.6, d - 1); } }; br(x, y + 10, h * 0.42, -Math.PI / 2 + (rr() - 0.5) * 0.2, 4); }
      else if (kind === 'forest') { const h = 110 + rr() * 200, w = 34 + rr() * 30; g.fillRect(x - 3, y - h * 0.3, 6, h * 0.3 + 20); for (let k = 0; k < 4; k++) { const yy = y - h * 0.2 - k * h * 0.2, ww = w * (1 - k * 0.2); g.beginPath(); g.moveTo(x - ww, yy); g.lineTo(x, yy - h * 0.32); g.lineTo(x + ww, yy); g.fill(); } }
      else if (kind === 'spires') { const h = 150 + rr() * 220, w = 26 + rr() * 30; g.fillRect(x, y - h, w, h + 40); g.beginPath(); g.moveTo(x - 6, y - h); g.lineTo(x + w / 2, y - h - 70 - rr() * 60); g.lineTo(x + w + 6, y - h); g.fill(); g.fillRect(x - 30, y - h * 0.45, w + 60, h * 0.45 + 30); for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - 30 + k * 30, y - h * 0.45); g.lineTo(x - 22 + k * 30, y - h * 0.45 - 26); g.lineTo(x - 14 + k * 30, y - h * 0.45); g.fill(); } }
      else if (kind === 'graves') { const t = rr(); if (t < 0.45) { g.fillRect(x, y - 44, 7, 50); g.fillRect(x - 11, y - 34, 29, 7); } else if (t < 0.85) { g.beginPath(); g.roundRect(x, y - 38, 26, 46, [12, 12, 0, 0]); g.fill(); } else { g.fillRect(x, y - 110, 34, 116); g.beginPath(); g.moveTo(x - 6, y - 110); g.lineTo(x + 17, y - 140); g.lineTo(x + 40, y - 110); g.fill(); } }
      else if (kind === 'pillars') { const w = 34 + rr() * 26; g.fillRect(x, 0, w, H); g.fillRect(x - 10, 0, w + 20, 26); g.fillRect(x - 8, H * 0.8, w + 16, 30); if (rr() < 0.5) { g.beginPath(); g.arc(x + w + 70, 30, 70, Math.PI, 0); g.lineTo(x + w + 140, 0); g.lineTo(x + w, 0); g.fill(); } }
      else if (kind === 'cave') { const w = 20 + rr() * 50, h = 40 + rr() * 170; g.beginPath(); g.moveTo(x - w, 0); g.lineTo(x + w, 0); g.lineTo(x + (rr() - 0.5) * 12, h); g.fill(); if (rr() < 0.6) { const h2 = 30 + rr() * 110, xx = x + 40; g.beginPath(); g.moveTo(xx - w * 0.8, H); g.lineTo(xx + w * 0.8, H); g.lineTo(xx, H - h2 - 40); g.fill(); } }
      else if (kind === 'pipes') { const yy = 40 + rr() * (H * 0.6), t = 16 + rr() * 22; g.fillRect(x, yy, 120 + rr() * 160, t); g.fillRect(x + 30, yy, t, H); g.fillRect(x + 22, yy + 60, t + 16, 10); g.beginPath(); g.arc(x + 200, H * 0.9, 90, Math.PI, 0); g.rect(x + 100, 0, 20, H); g.fill('evenodd'); }
      else if (kind === 'castle') { const w = 300; g.fillRect(x, y - 120, w, 160); for (let k = 0; k < w; k += 24) g.fillRect(x + k, y - 136, 14, 18); for (const tx of [x - 30, x + w - 30]) { const h = 210 + rr() * 80; g.fillRect(tx, y - h, 62, h + 30); for (let k = 0; k < 62; k += 22) g.fillRect(tx + k, y - h - 16, 14, 18); if (rr() < 0.6) { g.beginPath(); g.moveTo(tx - 6, y - h - 14); g.lineTo(tx + 31, y - h - 90); g.lineTo(tx + 68, y - h - 14); g.fill(); } } }
    } });
  // fade the top edge detail slightly and thicken the base
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.0)');
}

// ---- props
function propSprite(d) {
  const at = G.rd.atlas, url = asset(d.src);
  if (d.rect) { const [x, y, w, h] = d.rect; return { r: at.cell(url, x, y, w, h, 'map'), w, h, ax: d.anchor ? d.anchor[0] : w / 2, ay: d.anchor ? d.anchor[1] : h, k: d.h / h, def: d }; }
  const r = at.get(url, 'map'); const sp = { r, w: 0, h: 0, ax: d.anchor ? d.anchor[0] : null, ay: d.anchor ? d.anchor[1] : null, k: 1, def: d, full: true };
  return sp;
}
const pickW = (list, r) => { let t = 0; for (const p of list) t += p.weight || 1; let x = r() * t; for (const p of list) { x -= p.weight || 1; if (x <= 0) return p; } return list[0]; };
function placeProps(S, M, th, r) {
  const geo = M.geo, props = th.props || [], cache = new Map();
  const sp = (d) => { let s = cache.get(d); if (!s) { s = propSprite(d); cache.set(d, s); } return s; };
  const by = (layer, on) => props.filter(p => p.layer === layer && (on.includes(p.on) || p.on === 'any'));
  const put = (layer, d, x, y, flip) => { const s = sp(d); S.props[layer].push({ s, x, y, flip, d }); if (d.light) S.lights.push({ x, y: y - d.h * 0.72, col: d.light, r: Math.max(120, d.h * 1.5), seed: r() * 9 }); };
  const busy = (x) => M.portals.some(p => Math.abs(p.x - x) < 150) || M.npcSpots.some(n => Math.abs(n - x) < 70);
  for (const p of geo.plats) {
    const on = p.ground ? ['ground'] : ['ledge'], len = p.x2 - p.x1;
    if (p.roof) continue;
    const back = by('back', on), mid = by('mid', on), front = by('front', on);
    if (back.length && !S.theme.backwall || back.length && p.ground) for (let x = p.x1 + 60 + r() * 200; x < p.x2 - 60; x += (p.ground ? 210 : 330) + r() * 330) { const d = pickW(back, r); if (!p.ground && d.h > 260) continue; if (M.def.kind === 'town' && S.buildings.some(b => x > b.x - 30 && x < b.x + b.w + 30)) continue; put('back', d, x, p.y + 2, r() < 0.5); }
    if (mid.length) for (let x = p.x1 + 120 + r() * 300; x < p.x2 - 90; x += 420 + r() * 640) { if (busy(x)) continue; const d = pickW(mid, r); if (!p.ground && d.h > 200) continue; put('mid', d, x, p.y + 2, r() < 0.5); }
    if (front.length) for (let x = p.x1 + 200 + r() * 500; x < p.x2 - 100; x += 700 + r() * 1100) { if (busy(x)) continue; put('front', pickW(front, r), x, p.y + 8, r() < 0.5); }
    const hang = props.filter(q => q.on === 'hang');
    if (!p.ground && hang.length && len > 300) for (let x = p.x1 + 80 + r() * 200; x < p.x2 - 60; x += 300 + r() * 500) put('back', pickW(hang, r), x, p.y + 30, false);
  }
  const wallP = props.filter(q => q.on === 'wall');
  if (wallP.length) for (let x = 200 + r() * 300; x < geo.w - 150; x += 380 + r() * 420) { const g0 = geo.plats.find(p => p.ground && x >= p.x1 && x <= p.x2); if (!g0) continue; const d = pickW(wallP, r); put('back', d, x, g0.y - 190 - r() * 160 + d.h * 0.5, false); }
}

// ---- town facades
async function facades(S, M, th, r) {
  const F = th.facade, at = G.rd.atlas, geo = M.geo, roofs = geo.plats.filter(p => p.roof);
  const recipes = F.recipes || [];
  let i = 0;
  for (const p of roofs) {
    const g0 = geo.plats.find(q => q.ground && p.x1 >= q.x1 - 1 && p.x1 <= q.x2) || geo.plats.find(q => q.ground);
    const w = Math.min(640, p.x2 - p.x1 - 30), x = (p.x1 + p.x2) / 2 - w / 2, bodyH = g0.y - p.y, rec = recipes.length ? recipes[i % recipes.length] : null; i++;
    const roofH = 110 + r() * 50, H = bodyH + roofH, [c, g] = mk(w + 60, H);
    const wallT = await bitmap(rec?.wall || F.wall[i % F.wall.length]), roofT = await bitmap(rec?.roof || F.roof[i % F.roof.length]), found = await bitmap(F.foundation[0]), trim = await bitmap(F.trim[0]);
    const X = 30;
    tile(g, wallT, X, roofH, w, bodyH, 1, 0);
    tile(g, found, X, H - 34, w, 34, 0.6, 0);
    // timber frame
    g.fillStyle = '#1d140c'; for (const tx of [X, X + w - 10, X + w * 0.5 - 5]) g.fillRect(tx, roofH, 10, bodyH - 34); g.fillRect(X, roofH + bodyH * 0.42, w, 9); g.fillRect(X, roofH, w, 10);
    // shade: darker toward the ground and edges so it sits behind the street
    const sh = g.createLinearGradient(0, roofH, 0, H); sh.addColorStop(0, 'rgba(0,0,0,0.28)'); sh.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = sh; g.fillRect(X, roofH, w, bodyH);
    // roof: a gable whose ridge is the walkable rooftop line
    g.save(); g.beginPath(); g.moveTo(0, roofH + 16); g.lineTo(X + 26, 6); g.lineTo(X + w - 26, 6); g.lineTo(w + 60, roofH + 16); g.closePath(); g.clip(); tile(g, roofT, 0, 0, w + 60, roofH + 16, 1, 0);
    const rs = g.createLinearGradient(0, 0, 0, roofH + 16); rs.addColorStop(0, 'rgba(255,255,255,0.1)'); rs.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = rs; g.fillRect(0, 0, w + 60, roofH + 16); g.restore();
    g.fillStyle = '#120c08'; g.fillRect(X + 20, 0, w - 40, 8); g.fillRect(0, roofH + 10, w + 60, 8);
    // windows (lit) and the door
    const wins = F.windows || [], nW = Math.max(1, Math.floor(w / 190));
    for (let k = 0; k < nW; k++) { const wx = X + (k + 0.5) * w / nW + (nW === 1 ? w * 0.22 : 0), wy = roofH + bodyH * 0.2, ww = 46, wh = 60; const lit = r() < 0.7; g.fillStyle = lit ? '#e8a84a' : '#141a26'; g.fillRect(wx - ww / 2, wy, ww, wh); if (lit) { const gl = g.createRadialGradient(wx, wy + wh / 2, 4, wx, wy + wh / 2, 70); gl.addColorStop(0, 'rgba(255,190,90,0.5)'); gl.addColorStop(1, 'rgba(255,190,90,0)'); g.fillStyle = gl; g.fillRect(wx - 80, wy - 50, 160, 160); } g.strokeStyle = '#1d140c'; g.lineWidth = 5; g.strokeRect(wx - ww / 2, wy, ww, wh); g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx, wy + wh); g.moveTo(wx - ww / 2, wy + wh / 2); g.lineTo(wx + ww / 2, wy + wh / 2); g.lineWidth = 3; g.stroke(); if (lit) S.lights.push({ x: x + wx - X, y: p.y + (wy - roofH) + wh / 2, col: [1, 0.72, 0.35], r: 150, seed: r() * 9, soft: true }); }
    const dk = rec?.door ? F.doors.find(d => d._key && d._key.includes(rec.door)) : null, dd = dk || F.doors[i % F.doors.length], dbm = await bitmap(dd.src);
    if (dbm) { const dh = 150, dw = dbm.width * dh / dbm.height; g.imageSmoothingEnabled = false; g.drawImage(dbm, X + w * 0.28 - dw / 2, H - dh - 2, dw, dh); }
    const signPath = rec?.sign ? (F.signs.find(s => s.includes(rec.sign)) || rec.sign) : F.signs[i % F.signs.length], sbm = signPath && await bitmap(signPath.startsWith('env/') ? signPath : 'env/textures/biome/signs/' + signPath + '.png');
    if (sbm) { const sh2 = 62, sw = sbm.width * sh2 / sbm.height; g.fillStyle = '#120c08'; g.fillRect(X + w * 0.28 + 44, H - 186, 46, 5); g.drawImage(sbm, X + w * 0.28 + 52, H - 182, sw, sh2); }
    S.buildings.push({ r: at.addCanvas(c, 'map'), x: x - 30, y: p.y - 8 - 0, w: w + 60, h: H, top: p.y });
    // the building's canvas top is the ridge (roof line) = walkable; align so the ridge sits on the platform
    S.buildings[S.buildings.length - 1].y = p.y - 7; S.buildings[S.buildings.length - 1].h = H; S.buildings[S.buildings.length - 1].gy = g0.y;
    S.buildings[S.buildings.length - 1].h = g0.y - (p.y - 7) + 2;
  }
}
// ------------------------------------------------------------------ drawing
const T4 = [1, 1, 1, 1];
export function drawBack(rd, M) {
  const S = M.scene, cam = G.cam, geo = M.geo; if (!S) return;
  const vx0 = cam.x, vx1 = cam.x + cam.viewW, vy1 = cam.y + cam.viewH;
  // far silhouettes: anchored to the horizon, scrolling slower than the world
  for (const f of S.far) {
    if (f.r.layer < 0) continue;
    const h = cam.viewH * f.height * 1.25, w = h * 1016 / 420, y = cam.y + cam.viewH * (S.theme.backwall ? 1 : 0.94) - h + (geo.groundY - (cam.y + cam.viewH * 0.75)) * f.parallax * 0.25;
    const off = -((cam.x * f.parallax) % w);
    T4[0] = f.color[0]; T4[1] = f.color[1]; T4[2] = f.color[2]; T4[3] = 1;
    for (let x = cam.x + off - w; x < vx1; x += w - 1) rd.quad(f.r, x, y, w, h, T4);
    rd.rect(cam.x, y + h - 1, cam.viewW, cam.viewH, T4);
  }
  if (S.wall) { const s = 510, a = [1, 1, 1, S.wall.alpha]; for (let x = Math.floor(vx0 / s) * s; x < vx1; x += s) for (let y = Math.floor(cam.y / s) * s; y < vy1; y += s) rd.quad(S.wall.r, x, y, s + 0.5, s + 0.5, a); }
  for (const b of S.buildings) if (b.x < vx1 && b.x + b.w > vx0) rd.quad(b.r, b.x, b.y, b.w, b.h);
  drawProps(rd, S.props.back, S, 0.72, vx0, vx1);
  // light pools behind everything solid
  for (const l of S.lights) { if (l.x < vx0 - l.r || l.x > vx1 + l.r) continue; const fl = l.soft ? 1 : 0.85 + 0.15 * Math.sin(G.time * 9 + l.seed) * Math.sin(G.time * 5.3 + l.seed * 2); rd.quad(SHAPES.glow, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2, [l.col[0], l.col[1], l.col[2], 0.36 * fl], null, 1); }
}
export function drawTerrain(rd, M) {
  const S = M.scene, cam = G.cam; if (!S) return;
  const vx0 = cam.x, vx1 = cam.x + cam.viewW, vy1 = cam.y + cam.viewH;
  for (const p of S.deep.grounds) { if (p.x2 < vx0 || p.x1 > vx1) continue; const y0 = p.y - 5 + GROUND_H - 1; if (y0 > vy1) continue; for (let x = Math.max(p.x1, Math.floor(vx0 / 510) * 510); x < Math.min(p.x2, vx1); x += 510) { const x0 = Math.max(x, p.x1), w = Math.min(x + 510, p.x2) - x0; for (let y = y0; y < vy1; y += 510) rd.quad(S.deep.r, x0, y, w + 0.5, 510.5); } }
  for (const c of S.chunks) if (c.x < vx1 && c.x2 > vx0 && c.y < vy1 && c.r.layer >= 0) rd.quad(c.r, c.x, c.y, c.w, c.h);
  const LT = [S.light[0], S.light[1], S.light[2], 1];
  for (const q of S.platSprites) { const r = q.s.r; if (!r || r.layer < 0 || q.x < vx0 - 500 || q.x > vx1 + 500) continue; rd.affine(r, [q.k, 0, 0, q.k, q.x, q.y], -q.ax, -q.ay, q.s.w, q.s.h, LT); }
  for (const q of S.stairs) { const r = q.s.r; if (!r || r.layer < 0 || q.x < vx0 - 300 || q.x > vx1 + 300) continue; const k = q.h / 80, hw = 128;       // half of the stepped piece, rising toward the higher ground
    const half = { layer: r.layer, u0: q.up ? r.u0 : (r.u0 + r.u1) / 2, u1: q.up ? (r.u0 + r.u1) / 2 : r.u1, v0: r.v0, v1: r.v1 };
    rd.quad(half, q.up ? q.x - hw * k : q.x, q.y - q.h, hw * k, 80 * k, LT); }
  // ropes
  const rt = S.ropeTex, lad = S.ropeKind.startsWith('ladder');
  for (const r of M.geo.ropes) { if (r.x < vx0 - 30 || r.x > vx1 + 30) continue; const w = lad ? 34 : 22;
    if (r.ladder && S.ladder && S.ladder.r.layer >= 0) { const L = S.ladder, lw = 46, k = lw / L.w, seg = L.h * k; for (let y = r.y1 - 6; y < r.y2; y += seg - 2) { const hgt = Math.min(seg, r.y2 - y), rr = L.r; rd.quad({ layer: rr.layer, u0: rr.u0, v0: rr.v0, u1: rr.u1, v1: rr.v0 + (rr.v1 - rr.v0) * hgt / seg }, r.x - lw / 2, y, lw, hgt, LT); } continue; } for (let y = r.y1 - 4; y < r.y2; y += 64) { const h = Math.min(64, r.y2 - y); rd.quad({ layer: rt.layer, u0: rt.u0, v0: rt.v0, u1: rt.u1, v1: rt.v0 + (rt.v1 - rt.v0) * h / 64 }, r.x - w / 2, y, w, h, [S.light[0], S.light[1], S.light[2], 1]); } }
  drawProps(rd, S.props.mid, S, 1, vx0, vx1);
  // portals: Velscour's free-standing vortex — rune rings on the ground, nested arcs of light sweeping
  // round a tall ellipse, a bright heart, motes rising
  for (const po of M.portals) {
    if (po.x < vx0 - 300 || po.x > vx1 + 300 || po.hidden && !po.found) continue;
    drawPortal(rd, po.x, po.y, po.color || [1, 0.31, 0.12], po.kind === 'breach' || po.kind === 'raid');
    const e = G.text.word(po.label, po.dungeon ? '#ffb86a' : '#e8dcc0', 12.5); G.text.draw(rd, e, po.x, po.y - 214);
  }
}
export function drawPortal(rd, x, y, col, rift) {
  const t = G.time, S2 = 2.9, cy = y - 34 * S2, pulse = 0.85 + 0.15 * Math.sin(t * 3 + x);
  const ell = (shape, rx, ry, ang, tint, add = 1, oy = 0) => { const c = Math.cos(ang), s = Math.sin(ang); rd.affine(SHAPES[shape], [rx * c / 64, ry * s / 64, -rx * s / 64, ry * c / 64, x, cy + oy], -64, -64, 128, 128, tint, null, add); };
  // ground: a soft pool of light and two rune rings turning against each other
  rd.quad(SHAPES.glow, x - 130, y - 34, 260, 62, [col[0], col[1], col[2], 0.5 * pulse], null, 1);
  ell('ring', 104, 30, t * 0.9, [col[0], col[1], col[2], 0.75], 1, 34 * S2 - 3);
  ell('rune', 150, 40, -t * 0.5, [col[0], col[1], col[2], 0.5], 1, 34 * S2 - 3);
  // the tear itself: a dark heart (deeper for rifts), then the light
  ell('glow', rift ? 92 : 70, rift ? 150 : 118, 0, [0, 0, 0, rift ? 0.95 : 0.6], 0);
  rd.quad(SHAPES.glow, x - 105, cy - 150, 210, 300, [col[0], col[1], col[2], 0.55 * pulse], null, 1);
  for (let i = 0; i < 7; i++) {
    const k = 1 - i * 0.12, sp = (2 + i * 0.6) * (i % 2 ? 1 : -0.8), w = i % 2 ? col : [1, 1, 1];
    ell('arc', 54 * k * S2 / 2.6, 92 * k * S2 / 2.6, t * sp + i * 1.3, [w[0], w[1], w[2], 0.75 - i * 0.07]);
  }
  ell('glow', 30, 62, 0, [1, 0.96, 0.9, 0.55 + 0.25 * Math.sin(t * 5 + x)]);
  if (rift) for (let i = 0; i < 3; i++) { const a = t * (1.3 + i * 0.4) + i * 2.1; rd.quad(SHAPES.shard, x + Math.cos(a) * 92 - 7, cy + Math.sin(a) * 120 - 14, 14, 28, [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 1]); }
  if (G.frame % 4 === 0) G.parts.add({ shape: Math.random() < 0.5 ? 'star' : 'glow', x: x + (Math.random() - 0.5) * 120, y: y - Math.random() * 16, vy: -70 - Math.random() * 130, vx: (Math.random() - 0.5) * 30, life: 1.4, size: 6 + Math.random() * 8, size2: 1, col, front: Math.random() < 0.4 });
}
export function drawFront(rd, M) { const S = M.scene; if (S) drawProps(rd, S.props.front, S, 0.5, G.cam.x, G.cam.x + G.cam.viewW); }
function drawProps(rd, list, S, k, vx0, vx1) { const L = S.light, t = [L[0] * k, L[1] * k, L[2] * k, 1]; for (const p of list) { if (p.x < vx0 - 420 || p.x > vx1 + 420) continue; drawProp(rd, p.s, p.x, p.y, p.flip, p.d.light ? [1, 1, 1, 1] : t); } }
function drawProp(rd, s, x, y, flip, tint) {
  const r = s.r; if (!r || r.layer < 0) return;
  if (s.full && !s.w) { s.w = r.w; s.h = r.h; s.k = s.def.h / r.h; if (s.ax == null) { s.ax = r.w / 2; s.ay = r.h; } }
  const k = s.k, fx = flip ? -1 : 1;
  rd.affine(r, [k * fx, 0, 0, k, x, y], -s.ax, -s.ay, s.w, s.h, tint);
}

/** Drifting motes for the theme (embers, spores, snow...). */
export function ambient(M, dt) {
  const kind = M.scene?.theme.particles; if (!kind || kind === 'none') return;
  const cam = G.cam, n = { ember: 0.5, ash: 0.5, spore: 0.35, snow: 0.9, leaf: 0.18, firefly: 0.22, drip: 0.25, dust: 0.3, mist: 0.12 }[kind] || 0.2;
  if (Math.random() > n * dt * 60 * 0.25) return;
  const x = cam.x + Math.random() * cam.viewW, y = cam.y + Math.random() * cam.viewH;
  const P = G.parts;
  if (kind === 'ember') P.add({ shape: 'glow', x, y: cam.y + cam.viewH, vx: 20 - Math.random() * 60, vy: -40 - Math.random() * 90, life: 4, size: 5 + Math.random() * 5, col: [1, 0.45, 0.12], front: false });
  else if (kind === 'ash') P.add({ shape: 'dot', x, y: cam.y - 10, vx: -20 - Math.random() * 30, vy: 30 + Math.random() * 40, life: 7, size: 3 + Math.random() * 3, col: [0.5, 0.48, 0.47], add: 0, a: 0.6 });
  else if (kind === 'spore') P.add({ shape: 'glow', x, y, vx: (Math.random() - 0.5) * 20, vy: -8 - Math.random() * 16, life: 5, size: 5 + Math.random() * 6, col: [0.5, 0.9, 0.4], a: 0.6, front: false });
  else if (kind === 'snow') P.add({ shape: 'dot', x, y: cam.y - 10, vx: -30 + Math.random() * 20, vy: 60 + Math.random() * 60, life: 9, size: 3 + Math.random() * 4, col: [0.9, 0.95, 1], add: 0 });
  else if (kind === 'leaf') P.add({ shape: 'shard', x, y: cam.y - 10, vx: -40 - Math.random() * 40, vy: 50 + Math.random() * 40, life: 9, size: 7, col: [0.5, 0.32, 0.12], add: 0, spin: 3 });
  else if (kind === 'firefly') P.add({ shape: 'glow', x, y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 30, life: 3, size: 8, col: [0.8, 1, 0.4], front: Math.random() < 0.5 });
  else if (kind === 'drip') P.add({ shape: 'spark', x, y: cam.y, vy: 520, life: 1.6, size: 16, col: [0.4, 0.6, 0.7], orient: true, a: 0.5 });
  else if (kind === 'dust') P.add({ shape: 'dot', x, y, vx: (Math.random() - 0.5) * 14, vy: 4 + Math.random() * 8, life: 6, size: 2.5, col: [0.8, 0.75, 0.6], add: 0.5, a: 0.4, front: false });
  else if (kind === 'mist') P.add({ shape: 'smoke', x, y: cam.y + cam.viewH * (0.6 + Math.random() * 0.3), vx: 12 + Math.random() * 20, life: 9, size: 160, size2: 260, col: [0.5, 0.55, 0.62], add: 0, a: 0.13, front: Math.random() < 0.3 });
}
