// Map layouts. A map is footholds (one-way platforms), ropes and portal pads, in world
// units (the hero is ~100 units tall, jumps ~110 high and ~230 far).
// Maps in src/data/maps.js are compact descriptors; build() turns one into geometry with
// a seeded generator so the same map is always the same place.
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = (a) => a[Math.floor(r() * a.length)];
  r.chance = (p) => r() < p;
  return r;
}
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const TIER = 190;          // vertical gap between rope-linked tiers
const STEP = 80;                  // a jumpable step

/**
 * desc: { id, w, shape:'town'|'field'|'tiers'|'tower'|'cavern'|'arena'|'hall', tiers, seed }
 * returns { w, h, groundY, plats:[{x1,x2,y,ground,tier}], ropes:[{x,y1,y2,ladder}], walls }
 */
export function build(desc) {
  const r = rng(desc.seed || hashStr(desc.id));
  const shape = desc.shape || 'field';
  const tiers = desc.tiers ?? ({ town: 1, field: 2, tiers: 3, tower: 6, cavern: 2, arena: 1, hall: 0 }[shape]);
  const w = desc.w || ({ town: 4600, field: 5200, tiers: 4400, tower: 2000, cavern: 4800, arena: 2600, hall: 3000 }[shape]);
  const top = 420;                                   // headroom above the highest tier
  const h = top + tiers * TIER + 520;
  const groundY = h - 300;
  const plats = [], ropes = [];
  // ---- ground: a run of segments with small jumpable steps
  let x = 0, y = groundY;
  const flat = shape === 'town' || shape === 'arena' || shape === 'hall';
  while (x < w) {
    let len = flat ? w : r.int(700, 1500);
    if (x + len > w - 500) len = w - x;
    plats.push({ x1: x, x2: x + len, y, ground: true, tier: 0 });
    x += len;
    if (!flat) { const d = r.pick([-STEP, -STEP, 0, STEP, STEP]); y = Math.max(groundY - STEP * 2, Math.min(groundY + STEP, y + d)); if (y === plats[plats.length - 1].y) y -= STEP * (r.chance(0.5) ? 1 : -1); y = Math.max(groundY - STEP * 2, Math.min(groundY + STEP, y)); }
  }
  const surfaceBelow = (px, py) => { let best = null; for (const p of plats) if (px >= p.x1 + 20 && px <= p.x2 - 20 && p.y > py + 20 && (!best || p.y < best.y)) best = p; return best; };
  // ---- tiers of floating ledges, each joined to what lies under it by a rope or ladder
  for (let t = 1; t <= tiers; t++) {
    const ty = groundY - STEP - t * TIER + (shape === 'tower' ? 0 : r.int(-20, 20));
    let px = shape === 'tower' ? r.int(80, 300) : r.int(150, 700);
    const made = [];
    while (px < w - 500) {
      const len = shape === 'town' ? r.int(380, 620) : shape === 'tower' ? r.int(500, 900) : r.int(520, 1250);
      const x2 = Math.min(w - 140, px + len);
      if (x2 - px > 300) { const p = { x1: px, x2, y: ty, tier: t }; plats.push(p); made.push(p); }
      px = x2 + (shape === 'town' ? r.int(500, 1100) : shape === 'tower' ? r.int(160, 320) : r.int(260, 720));
    }
    if (!made.length) { const p = { x1: w / 2 - 400, x2: w / 2 + 400, y: ty, tier: t }; plats.push(p); made.push(p); }
    for (const p of made) {
      // rope down from somewhere along the ledge; retry until it lands on something
      for (let k = 0; k < 14; k++) {
        // a few random tries, then walk along the ledge until something lies beneath
        const rx = Math.round(k < 6 ? p.x1 + 60 + r() * (p.x2 - p.x1 - 120) : p.x1 + 40 + (k - 6) * (p.x2 - p.x1 - 80) / 7);
        const below = surfaceBelow(rx, p.y);
        if (!below) continue;
        if (ropes.some(q => Math.abs(q.x - rx) < 170 && q.y1 < below.y && q.y2 > p.y - 250) && k < 12) continue;
        ropes.push({ x: rx, y1: p.y, y2: below.y - 14, ladder: r.chance(0.4) });
        if (p.x2 - p.x1 > 900 && k === 0 && r.chance(0.6)) continue;   // long ledges get a second rope
        break;
      }
      // a stepping ledge half-way up beside some ledges (jump route as well as the rope)
      if (shape !== 'tower' && r.chance(0.45)) {
        const sx = p.x1 - r.int(240, 320), below = surfaceBelow(sx + 80, p.y);
        const gap = below ? below.y - p.y : 0;
        if (below && sx > 100 && gap > 150 && gap < 200) plats.push({ x1: sx, x2: sx + 170, y: below.y - Math.round(gap / 2), tier: t - 0.5, small: true });
      }
    }
  }
  // step ledges that are still too high above the ground get a second stone under them
  plats.sort((a, b) => b.y - a.y);
  return { w, h, groundY, plats, ropes, tiers, shape };
}

/** The highest surface at x that is at or below y (what a thing dropped there lands on). */
export function surfaceAt(map, x, y) {
  let best = null;
  for (const p of map.plats) if (x >= p.x1 && x <= p.x2 && p.y >= y - 2 && (!best || p.y < best.y)) best = p;
  return best;
}
/** Ground platform under x (lowest). */
export function groundAt(map, x) {
  let best = null;
  for (const p of map.plats) if (p.ground && x >= p.x1 && x <= p.x2) best = p;
  return best || map.plats[0];
}
