// Hollowbound's levels: Emberwick (town) and Gloamhollow (the mine under the hill).
import { World } from './world.js';
import { MAPS } from './maps.js';
import { T } from '../engine/tiles.js';
import { img, canvas } from '../engine/assets.js';
import { sfx, music } from '../engine/audio.js';
import { input } from '../engine/input.js';
import { PROPS, CAST, PORTRAITS } from './data.js';
import { rand, pick, overlap } from './entity.js';
import { Slime, Ghoul, Wraith, Boss } from './enemies.js';
import { Pickup, Chest, Ore, Torch, Wisp, Campfire, AnimProp, Portal, Exit, Marker, Gate, NPC, Pet } from './actors.js';
import { W, H } from './ui.js';

const TILE_MARKERS = /[PxgbrzwBcCtodHf$vsk]/g;

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function parse(rows) {
  const markers = [];
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if ('PxgbrzwBcCtodHf$vsk'.includes(r[x])) markers.push({ ch: r[x], tx: x, ty: y }); });
  return { rows: rows.map((r) => r.replace(TILE_MARKERS, '.')), markers };
}

export function buildLevel(game, id, spawnKey) {
  return id === 'cave' ? buildCave(game, spawnKey) : buildTown(game, spawnKey);
}

// ====================================================================== shared
function line(who, text, portrait) { return { who, text, portrait }; }

// ====================================================================== town sky / parallax
const SKY = [
  { key: 'world/bg_normal/background_castle', par: 0.04, y0: -36 },
  { key: 'world/bg_normal/layer4', par: 0.08, y0: -28 },
  { key: 'world/bg_normal/layer3', par: 0.16, y0: -10 },
  { key: 'world/bg_normal/layer2', par: 0.26, y0: 4 },
  { key: 'world/bg_normal/layer1', par: 0.4, y0: 22 },
];
const CLOUDS = [
  ['world/cloud6', 40, 18, 0.6], ['world/cloud5', 300, 44, 0.9], ['world/cloud4', 520, 26, 1.2],
  ['world/cloud3', 760, 60, 1.5], ['world/cloud5', 980, 12, 0.8], ['world/cloud4', 1250, 52, 1.1],
];

/** Sun or moon, shaded in three tones with a soft 2px glow instead of a hard ring. */
const orbCache = {};
function skyOrb(kind) {
  if (orbCache[kind]) return orbCache[kind];
  const S = 32, m = 15.5, R = 10.5, [c, g] = canvas(S, S);
  const moon = kind === 'moon';
  const glow = moon ? '232,236,255' : '255,240,170';
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - m, y - m);
      if (d > R) {
        const k = d - R;
        if (k < 3) { g.fillStyle = `rgba(${glow},${k < 1.2 ? 0.3 : k < 2.2 ? 0.18 : 0.07})`; g.fillRect(x, y, 1, 1); }
        continue;
      }
      // light from the upper left: highlight, body, and a shaded lower-right rim
      const l = ((m - x) * 0.6 + (m - y) * 0.8) / R;
      const rim = d > R - 1.3;
      let col;
      if (moon) col = rim && l < 0.2 ? '#a8a4a0' : l > 0.45 ? '#fbf8f0' : l > -0.35 ? '#e6e1d6' : '#c4beb4';
      else col = rim ? '#ffd870' : l > 0.35 ? '#fffdf0' : l > -0.4 ? '#fff3b8' : '#ffe48a';
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
  }
  if (moon) {
    // a few craters, each a darker pixel cluster with a lit lower lip
    for (const [x, y, w] of [[11, 12, 3], [18, 10, 2], [16, 17, 4], [10, 19, 2], [20, 20, 2]]) {
      g.fillStyle = '#bab4aa'; g.fillRect(x, y, w, w > 2 ? 2 : 1);
      g.fillStyle = '#f2eee4'; g.fillRect(x, y + (w > 2 ? 2 : 1), w, 1);
    }
  }
  return (orbCache[kind] = c);
}

export function drawTownSky(ctx, camX, camY, t, dusk = 0, moon = false) {
  ctx.drawImage(img('world/bg_normal/layer5'), 0, 0, 1024, 346, 0, 0, W, H);
  // sun by day, moon for the title and the dusk after the quest
  ctx.drawImage(skyOrb(moon || dusk ? 'moon' : 'sun'), Math.round(150 - camX * 0.01), Math.round(30 - camY * 0.02));
  for (const [k, x0, y, sp] of CLOUDS) {
    const im = img(k);
    const span = 1400;
    const x = ((x0 - camX * 0.03 + t * sp * 4) % span + span) % span - 200;
    ctx.drawImage(im, Math.round(x), Math.round(y - camY * 0.03));
  }
  // a balloon far away
  ctx.drawImage(img('world/hot_air_balloon'), Math.round(((620 - camX * 0.02 + t * 2) % 900 + 900) % 900 - 100), Math.round(70 + Math.sin(t * 0.4) * 3 - camY * 0.03));
  for (const L of SKY) {
    const im = img(L.key);
    const y = Math.round(L.y0 - (camY - 90) * L.par * 0.6);
    let x = -Math.round((camX * L.par) % 1024);
    if (x > 0) x -= 1024;
    for (; x < W; x += 1024) ctx.drawImage(im, x, y);
    if (y + 346 < H) { ctx.fillStyle = sampleBottom(im); ctx.fillRect(0, y + 346, W, H - y - 346); }
  }
  if (dusk > 0) {
    ctx.fillStyle = `rgba(40,20,70,${0.45 * dusk})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/** A mine-mouth timber frame (two posts and a lintel), `shade` 0..1 brightness. */
function mineFrame(ctx, x, y, shade) {
  const k = (r, g, b) => `rgb(${Math.round(r * shade)},${Math.round(g * shade)},${Math.round(b * shade)})`;
  const post = (px) => {
    ctx.fillStyle = k(40, 26, 18); ctx.fillRect(px, y + 4, 8, 5 * T - 4);
    ctx.fillStyle = k(112, 78, 48); ctx.fillRect(px + 1, y + 4, 6, 5 * T - 4);
    ctx.fillStyle = k(140, 100, 62); ctx.fillRect(px + 1, y + 4, 2, 5 * T - 4);
    ctx.fillStyle = k(84, 56, 34); for (let i = 12; i < 5 * T; i += 17) ctx.fillRect(px + 3, y + i, 3, 1);
  };
  post(x + 2); post(x + 58);
  ctx.fillStyle = k(40, 26, 18); ctx.fillRect(x - 4, y - 1, 76, 9);
  ctx.fillStyle = k(124, 86, 52); ctx.fillRect(x - 3, y, 74, 7);
  ctx.fillStyle = k(150, 108, 66); ctx.fillRect(x - 3, y, 74, 2);
  ctx.fillStyle = k(70, 46, 30); for (const bx of [x + 4, x + 60]) ctx.fillRect(bx, y + 3, 4, 2);
}

const bottomCache = new Map();
function sampleBottom(im) {
  let c = bottomCache.get(im);
  if (c) return c;
  const [cv, g] = canvas(1, 1);
  g.drawImage(im, 10, 345, 1, 1, 0, 0, 1, 1);
  const d = g.getImageData(0, 0, 1, 1).data;
  c = `rgb(${d[0]},${d[1]},${d[2]})`;
  bottomCache.set(im, c);
  return c;
}

// ====================================================================== small pixel sprites
/** A caged miner's lantern: handle, cap, glass panes either side of a bar, flame at the core. */
const LANTERN = {
  rows: [
    '..ddd..',
    '..d.d..',
    '.dmmmd.',
    'dmhmmmd',
    'dyydyyd',
    'dyydyyd',
    'dywwwyd',
    'dyowoyd',
    'doodood',
    'dmmmmmd',
    '.ddddd.',
  ],
  pal: { d: '#1e1612', m: '#4a3626', h: '#8a6a44', y: '#ffd36a', o: '#e8923a', w: '#fff4c8' },
};
function drawPix(ctx, spr, x, y, swap = null) {
  spr.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      ctx.fillStyle = (swap && swap[ch]) || spr.pal[ch];
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  });
}

// ====================================================================== earth texture
/** The tilesets' earth is one flat colour. Give it depth: darkening with depth, faint strata,
 *  buried pebbles in two hues, and (above ground) roots hanging under the turf. */
function texturize(map, terrain, seed, cave = false) {
  const g = terrain.main.getContext('2d');
  const solid = (x, y) => map.get(x, y) === 1;
  // 1. darken with depth below the nearest open tile above
  g.save();
  g.globalCompositeOperation = 'source-atop';
  for (let tx = 0; tx < map.w; tx++) {
    let d = 0;
    for (let ty = 0; ty < map.h; ty++) {
      d = solid(tx, ty) ? d + 1 : 0;
      if (d > 1) { g.fillStyle = `rgba(0,0,0,${Math.min(0.25, (d - 1) * 0.05)})`; g.fillRect(tx * T, ty * T, T, T); }
    }
  }
  g.restore();
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (!solid(tx, ty)) continue;
      const interior = solid(tx - 1, ty) && solid(tx + 1, ty) && solid(tx, ty - 1) && solid(tx, ty + 1);
      // 4. roots under the turf
      if (!cave && !solid(tx, ty - 1) && map.get(tx, ty - 1) !== 2) {
        for (let i = 0; i < 2; i++) {
          if (hash(tx, ty + i * 31) < 0.45) continue;
          let x = tx * T + 2 + Math.floor(hash(tx + i, ty, 4) * 12);
          const len = 4 + Math.floor(hash(tx, ty + i, 5) * 7);
          for (let k = 0; k < len; k++) {
            g.fillStyle = k < len - 2 ? 'rgba(92,62,38,0.95)' : 'rgba(92,62,38,0.5)';
            g.fillRect(x, ty * T + 8 + k, 1, 1);
            if (hash(x, k, 6) < 0.25) x += hash(k, x) < 0.5 ? -1 : 1;
          }
        }
      }
      if (!interior) continue;
      // 2. strata every third row
      if ((ty + (seed & 1)) % 3 === 0) {
        g.fillStyle = 'rgba(0,0,0,0.22)';
        for (let x = 0; x < T; x++) {
          const yy = ty * T + 6 + Math.round(Math.sin((tx * T + x) * 0.11 + ty) * 2);
          if (hash(tx * T + x, ty, 8) < 0.8) g.fillRect(tx * T + x, yy, 1, 1);
        }
      }
      // 3. pebbles with clipped corners
      const h = hash(tx + seed, ty);
      if (h < 0.42) {
        const x = tx * T + 1 + Math.floor(hash(tx, ty + 7) * 10), y = ty * T + 1 + Math.floor(hash(tx + 3, ty) * 10);
        const w = 3 + Math.floor(hash(tx + 9, ty) * 3), hh = 2 + Math.floor(hash(tx, ty + 9) * 2);
        const warm = hash(tx, ty, 2) < 0.6;
        const body = warm ? 'rgba(255,226,190,0.10)' : (cave ? 'rgba(160,150,200,0.09)' : 'rgba(180,200,210,0.08)');
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 1, y + hh, w - 2, 1);
        g.fillStyle = body;
        g.fillRect(x + 1, y, w - 2, 1); g.fillRect(x, y + 1, w, hh - 1);
        g.fillStyle = warm ? 'rgba(255,236,210,0.12)' : 'rgba(210,220,240,0.10)'; g.fillRect(x + 1, y, w - 2, 1);
      }
      for (let i = 0; i < 3; i++) {
        const x = tx * T + Math.floor(hash(tx * 3 + i, ty + seed) * 16), y = ty * T + Math.floor(hash(tx, ty * 5 + i) * 16);
        g.fillStyle = i % 2 ? 'rgba(0,0,0,0.3)' : 'rgba(255,226,190,0.05)';
        g.fillRect(x, y, 1, 1);
      }
    }
  }
}

/** Little iron brackets under the ends of every plank run so they don't float. */
function plankBrackets(map, terrain) {
  const g = terrain.main.getContext('2d');
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (map.get(tx, ty) !== 2) continue;
      const l = map.get(tx - 1, ty) !== 2, r = map.get(tx + 1, ty) !== 2;
      for (const [end, bx] of [[l, tx * T + 3], [r, tx * T + 12]]) {
        if (!end) continue;
        g.fillStyle = '#2a2026'; g.fillRect(bx - 1, ty * T + 7, 3, 5);
        g.fillStyle = '#6a5e66'; g.fillRect(bx, ty * T + 7, 1, 4);
        g.fillStyle = '#2a2026'; g.fillRect(bx - 2, ty * T + 11, 5, 1);
      }
    }
  }
}

// ====================================================================== TOWN
function buildTown(game, spawnKey) {
  const { rows, markers } = parse(MAPS.town);
  const s = game.save;
  const surf = (tx) => { for (let y = 0; y < rows.length; y++) if (rows[y][tx] === '#' || rows[y][tx] === '=') return y * T; return rows.length * T; };
  const X = (tx) => tx * T + 8;
  const dusk = s.flags.questDone ? 1 : 0;

  const def = {
    id: 'town', rows, title: 'EMBERWICK', subtitle: 'a mining village at the edge of the wood',
    style: { sheet: 'world/floor_tiles1', grass: true }, music: 'town', dark: 0, camFrame: 0.84,
    dust: '#c8b890',
    background(ctx, w, cx, cy) { drawTownSky(ctx, cx, cy, w.time, dusk); },
    midground(ctx, w, cx, cy) {
      // tunnel mouth: darkness deepening into the hill
      const x0 = 134 * T - cx, y0 = 12 * T - cy, x1 = 152 * T - cx;
      const g = ctx.createLinearGradient(x0, 0, x0 + 170, 0);
      g.addColorStop(0, '#2a1e18'); g.addColorStop(0.45, '#140e10'); g.addColorStop(1, '#060406');
      ctx.fillStyle = g;
      ctx.fillRect(Math.round(x0), Math.round(y0), Math.round(x1 - x0), 5 * T);
      // rough rock ceiling inside the mouth
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = 0; x < x1 - x0; x += 3) ctx.fillRect(Math.round(x0 + x), Math.round(y0), 3, 3 + Math.floor(hash(x, 4) * 5));
      // mine-cart rails running into the dark
      const fy = Math.round(17 * T - cy);
      for (let x = Math.round(x0 - 40); x < x1; x += 7) {
        const fade = Math.max(0.15, 1 - Math.max(0, x - x0) / 170);
        ctx.fillStyle = `rgba(74,52,34,${fade})`; ctx.fillRect(x, fy - 2, 5, 2);
      }
      for (let x = Math.round(x0 - 42); x < x1; x++) {
        const fade = Math.max(0.12, 1 - Math.max(0, x - x0) / 170);
        ctx.fillStyle = `rgba(150,140,140,${fade})`; ctx.fillRect(x, fy - 4, 1, 1);
        ctx.fillStyle = `rgba(70,62,64,${fade})`; ctx.fillRect(x, fy - 3, 1, 1);
      }
      // timber frames: one at the mouth, two fading into the dark
      for (const [off, shade] of [[150, 0.25], [70, 0.5], [0, 1]]) mineFrame(ctx, Math.round(x0 + off), Math.round(y0), shade);
      // a lantern hanging from the lintel
      const lx = Math.round(x0 + 36), ly = Math.round(y0 + 8 + Math.sin(w.time * 1.3));
      ctx.fillStyle = '#3a2a20'; ctx.fillRect(lx, ly, 1, 4);
      drawPix(ctx, LANTERN, lx - 3, ly + 4, Math.sin(w.time * 11) > 0.6 ? { w: '#ffe9a8' } : null);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const rg = ctx.createRadialGradient(lx, ly + 10, 1, lx, ly + 10, 34);
      rg.addColorStop(0, 'rgba(255,190,100,0.35)'); rg.addColorStop(1, 'rgba(255,190,100,0)');
      ctx.fillStyle = rg; ctx.fillRect(lx - 34, ly - 24, 68, 68);
      ctx.restore();
      // bridge: posts down into the creek and a sagging rope rail
      const bx0 = 57 * T, bx1 = 73 * T, deck = 20 * T;
      for (let x = bx0 + 6; x < bx1; x += 48) {
        const px = Math.round(x - cx);
        ctx.fillStyle = '#2e2016'; ctx.fillRect(px - 2, Math.round(deck - 14 - cy), 5, 3 * T + 18);
        ctx.fillStyle = '#6b4a2e'; ctx.fillRect(px - 1, Math.round(deck - 14 - cy), 3, 3 * T + 18);
        ctx.fillStyle = '#8a6440'; ctx.fillRect(px - 1, Math.round(deck - 14 - cy), 1, 3 * T + 18);
      }
      ctx.fillStyle = '#c8b090';
      for (let x = bx0 + 6; x + 48 < bx1 + 40; x += 48) {
        for (let k = 0; k <= 48 && x + k < bx1 - 4; k++) {
          const sag = Math.round(Math.sin((k / 48) * Math.PI) * 4);
          ctx.fillRect(Math.round(x + k - cx), Math.round(deck - 13 + sag - cy), 1, 1);
        }
      }
    },
    foreground(ctx, w, cx, cy) {
      // creek water, drawn over anyone wading
      const a = PROPS && w.time;
      const top = 21 * T + 5, x0 = 59 * T, x1 = 71 * T;
      const f = Math.floor(w.time * 4) % 3;
      ctx.globalAlpha = 0.82;
      for (let x = x0; x < x1; x += 160) {
        const wdt = Math.min(160, x1 - x);
        ctx.drawImage(img('world/anim/water_tiles_sheet'), 0, f * 64, wdt, 23 * T - top, Math.round(x - cx), Math.round(top - cy), wdt, 23 * T - top);
      }
      ctx.globalAlpha = 1;
    },
    overlay(ctx, w) {
      // warm late-afternoon wash from the top
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, dusk ? 'rgba(255,140,80,0.10)' : 'rgba(255,214,150,0.10)');
      g.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (dusk) { ctx.fillStyle = 'rgba(30,14,60,0.28)'; ctx.fillRect(0, 0, W, H); }
    },
    update(dt, w) {
      const p = w.player;
      // wading in the creek
      if (p.x > 59 * T && p.x < 71 * T && p.y > 21 * T + 6) {
        p.vx = Math.max(-62, Math.min(62, p.vx));
        if (!p.wading) { p.wading = true; sfx('land'); w.fx.burst(p.x, 21 * T + 6, 10, { color: ['#bfe8ff', '#6ab0d8'], speed: 70, life: 0.5, gravity: 400, angle: -Math.PI / 2, spread: 1.4 }); }
        if (Math.abs(p.vx) > 20 && Math.random() < dt * 8) w.fx.burst(p.x, 21 * T + 6, 2, { color: '#cfefff', speed: 30, life: 0.3, gravity: 300, angle: -Math.PI / 2, spread: 1.2 });
      } else p.wading = false;
      // the guard bars the tunnel until you carry a light
      if (!s.lantern && p.x > guard.x - 16) { p.x = guard.x - 16; p.vx = Math.min(0, p.vx); if (!w.guardBarked) { w.guardBarked = true; guard.def.talk(w, guard); } }
      if (p.x < guard.x - 60) w.guardBarked = false;
      // the first ledge east of the forge needs a jump
      if (!s.flags.jumpHint && p.x > 97 * T && p.x < 102 * T) {
        s.flags.jumpHint = true;
        w.ui.showHint(`${input.label('jump')} to jump. Hold it to jump higher.`, 4);
      }
      // dusk lanterns after the quest
      if (dusk && Math.random() < dt * 3) w.fx.burst(rand(w.cam.x, w.cam.x + W), w.cam.y + rand(40, 200), 1, { color: '#ffe08a', speed: 6, life: 2, gravity: -4, glow: true });
    },
  };

  const w = new World(game, def);
  if (w.terrain.fresh) texturize(w.map, w.terrain, 0);
  const back = w.props.back, front = w.props.front;
  const add = (list, name, tx, opts = {}) => list.push({ spec: PROPS[name], x: opts.px ?? X(tx), y: opts.y ?? surf(Math.floor(opts.px ? opts.px / T : tx)) + (opts.dy || 0), flip: opts.flip, par: opts.par, alpha: opts.alpha });

  // --- far-back trees
  add(back, 'pine', 2, { dy: 0 }); add(back, 'bigPine', 5);
  add(back, 'tree2', 21); add(back, 'tree1', 101); add(back, 'willow', 108);
  add(back, 'birch1', 119); add(back, 'birch2', 122); add(back, 'flowerTree', 127);
  add(back, 'pine', 138, { y: 6 * T }); add(back, 'bigPine', 142, { y: 3 * T }); add(back, 'pine', 146, { y: 3 * T }); add(back, 'bigPine', 150, { y: 3 * T });
  // --- farm
  for (let tx = 1; tx < 18; tx += 2) add(back, (tx * 7) % 3 ? 'wheat' : 'wheat2', tx, { px: tx * T + 8 });
  add(back, 'scarecrow', 9); add(back, 'pumpkinPile', 15); add(back, 'pumpkin1', 17); add(back, 'pumpkin2', 18);
  add(back, 'sacks', 19); add(back, 'bushY', 23);
  // --- Maren's house + laundry
  add(back, 'houseA', 33, { dy: 24 }); add(back, 'potPlant1', 37); add(back, 'potSmall', 38.5, { px: 38.5 * T });
  add(back, 'laundry', 43); add(back, 'sunflowers', 45.5, { px: 45.5 * T });
  // --- market + shrine
  add(back, 'tentPot', 48); add(back, 'fruitTable', 50.5, { px: 50.5 * T }); add(back, 'basket', 46);
  add(back, 'angel', 53); add(back, 'potPlant2', 56.5, { px: 56.5 * T });
  // --- creek
  add(back, 'reeds', 59, { px: 59 * T + 20, y: 23 * T }); add(back, 'reeds', 70, { px: 70 * T - 4, y: 23 * T, flip: true });
  // --- forge
  add(back, 'brickWall', 73.5, { px: 73.5 * T }); add(back, 'logs', 85); add(back, 'barrels', 86.5, { px: 86.5 * T }); add(back, 'stumpAxe', 83.5, { px: 83.5 * T });
  // --- house B
  add(back, 'houseB', 92, { dy: 24 }); add(back, 'crates', 99); add(back, 'barrel', 97.5, { px: 97.5 * T });
  // --- hill, graves, camp
  add(back, 'rocksBig1', 104); add(back, 'tomb1', 112); add(back, 'rocksMid1', 116);
  add(back, 'smallTent', 124); add(back, 'crate', 130); add(back, 'barrels', 131.5, { px: 129 * T });
  // --- foreground greenery and tufts
  add(front, 'bushG', 26); add(front, 'fernG', 62.5, { px: 57 * T, dy: 0 }); add(front, 'bushG2', 100); add(front, 'bushG', 110); add(front, 'bushG2', 121);
  add(front, 'tallGrass', 4); add(front, 'tallGrass', 103);
  for (let tx = 1; tx < 150; tx++) {
    const hh = hash(tx, 3);
    if (hh < 0.3 && !(tx >= 57 && tx <= 72) && tx < 132) add(front, pick(['tuft1', 'tuft2', 'tuft3', 'tuft4', 'tuft5']), tx, { px: tx * T + Math.floor(hh * 16) });
  }

  // --- animated props
  w.spawn(new AnimProp(73.5 * T, surf(73), 'furnace', { light: 70, cold: () => !s.relic }));
  w.spawn(new AnimProp(78 * T, surf(78), 'sawmill'));
  w.spawn(new AnimProp(128 * T, surf(128), 'campfireFood', { light: 60, z: -6 }));
  w.spawn(new AnimProp(134 * T + 15, 13 * T + 14, 'torch', { light: 50 }));
  // forge glow is a light even in daylight (used by the dusk ending)

  // --- graves you can read
  w.spawn(new Marker(X(114), surf(114), PROPS.tombCross, ['Here lies DURN THE DELVER.', '"The best seams hide behind walls that only look solid."'], 'Gravestone'));
  w.spawn(new Marker(X(118), surf(118), PROPS.tomb2, ['Brenna & Col. Lost to the dark, found by the light.'], 'Gravestone'));

  // --- people
  const P = (who) => w.npcs[who].portrait;
  w.npcs = {};
  const elder = w.npcs.elder = w.spawn(new NPC(X(40.5), surf(40), {
    name: 'Maren', layers: CAST.elder,
    marker: () => (!s.lantern ? 'exclaim' : (s.flags.tobinFreed && !s.flags.questDone ? 'question' : null)),
    talk(w) {
      if (!s.lantern) {
        w.ui.dialog([
          line('Maren', 'Ah... a traveler, at last. I am Maren, keeper of Emberwick\'s old stories.', P('elder')),
          line('Maren', 'Three days ago our miner, Tobin, went down into Gloamhollow. He never came back up.', P('elder')),
          line('Maren', 'Since then the mine crawls with slimes... and worse. The miners we buried don\'t rest easy.', P('elder')),
          line('Maren', 'Take my lantern. It\'s dark as a crow\'s pocket down there. Please, bring Tobin home.', P('elder')),
          line('Maren', "And this purse. Brann's steel will serve you better than that stick.", P('elder')),
        ], () => {
          s.lantern = true; s.flags.gotLantern = true; w.player.rebake();
          w.dropCoins(elder.x, elder.y - 30, 15);
          sfx('fanfare');
          w.ui.toast('Got Maren\'s Lantern', 'lantern');
          w.after(1.2, () => w.ui.showHint('The mine is east, past the bridge and the forge.', 5));
          game.writeSave();
        });
      } else if (s.flags.tobinFreed && !s.flags.questDone) {
        const lines = [line('Maren', 'Tobin stumbled in an hour ago, half-starved and grinning. You did it!', P('elder'))];
        if (s.relic) lines.push(line('Maren', 'And the Hearthstone! Our forge has been cold since that brute stole it. Emberwick will burn bright tonight.', P('elder')));
        lines.push(line('Maren', 'Take this purse. It isn\'t much, but it\'s honestly given.', P('elder')));
        w.ui.dialog(lines, () => {
          s.flags.questDone = true;
          // straight into the purse: the ending card counts it and the town rebuild can't eat it
          s.coins += 25;
          w.fx.text(w.player.x, w.player.y - 44, '+25', '#ffd34a', { life: 1.4 });
          w.fx.burst(w.player.x, w.player.y - 30, 14, { color: ['#ffd34a', '#fff0a0'], speed: 70, life: 0.6, gravity: 200, up: 40, glow: true });
          sfx('coin');
          sfx('fanfare');
          w.after(1.6, () => game.startEnding());
        });
      } else if (s.flags.questDone) {
        w.ui.say('Maren', pick(['Emberwick will be telling this story for years.', s.relic ? 'The forge is roaring again. Listen to that hammer!' : 'Tobin is home. That is what matters.', 'Come back whenever the road gets lonely.']));
      } else {
        w.ui.say('Maren', pick([
          'The mine is east, past the bridge and Brann\'s forge. Hal guards the way in.',
          'Coins you find below will buy proper steel from Brann.',
          'If the dark gets heavy, rest by a fire. Fire remembers you.',
        ]));
      }
    },
  }));
  if (s.flags.tobinFreed) {
    w.npcs.tobin = w.spawn(new NPC(X(37), surf(37), {
      name: 'Tobin', layers: CAST.tobin, facing: 1,
      talk(w) { w.ui.say('Tobin', pick(['You saved my life. That horned brute kept me tied up for days!', 'I\'m never going back down there. Well... maybe next week.', 'Gorrak had horns like a bull and a temper like two.'])); },
    }));
  }
  w.npcs.merchant = w.spawn(new NPC(X(48.5), surf(48), {
    name: 'Lise', layers: CAST.merchant,
    talk(w) {
      w.ui.dialog([{ who: 'Lise', portrait: P('merchant'), text: pick(['Apples, draughts, and gossip! Two of those cost coin.', 'Fresh from the orchard and the alchemist both!']),
        choices: [
          { label: 'Shop', fn: () => w.ui.shop('Lise\'s Stall', [
            { name: 'Healing Draught', icon: 'potion', price: 8, desc: `Restores 5 health. Drink with ${input.label('potion')}. Carry up to 5.`, blocked: () => s.potions >= 5 && 'Your satchel is full.', buy: () => { s.potions++; } },
            { name: 'Crisp Apple', icon: 'heart', price: 2, desc: 'Restores 2 health right away.', blocked: () => s.hp >= s.maxHp && 'You look hale enough.', buy: () => { s.hp = Math.min(s.maxHp, s.hp + 2); } },
          ]) },
          { label: 'Gossip', fn: () => w.ui.say('Lise', pick([
            'Slimes hop at you, so step back and swing when they land.',
            'Those dead miners wind up their swings. When they flash, get clear!',
            'Old Durn swore there\'s a passage at the far west of the deep mine. Never found it myself.',
            'Hit a wall of wind? That\'s your dash. You can dash in the air once, too.',
          ])) },
          { label: 'Bye', fn: null },
        ] }]);
    },
  }));
  w.npcs.smith = w.spawn(new NPC(X(80), surf(80), {
    name: 'Brann', layers: CAST.smith,
    talk(w) {
      w.ui.dialog([{ who: 'Brann', portrait: P('smith'), text: !s.relic ? "Forge has been cold since that horned brute took our Hearthstone. I'm working off old embers." : s.sword >= 1 ? 'Keep that edge clean.' : 'Brann. I make swords, not small talk.',
        choices: [
          { label: 'Shop', fn: () => w.ui.shop('Brann\'s Forge', [
            { name: 'Iron Sword', icon: 'sword', price: 30, desc: 'Honest steel. Damage 2 (your stick does 1).', blocked: () => s.sword >= 1 && 'You already carry finer steel.', buy: () => game.buySword(), thanks: 'Mind the edge. It bites.' },
            { name: 'Heart Charm', icon: 'heart', price: 45, desc: 'Ember-forged charm. Max health +2.', blocked: () => s.flags.charm && 'One charm per heart, friend.', buy: () => { s.flags.charm = true; s.maxHp += 2; s.hp += 2; } },
          ]) },
          { label: 'Bye', fn: null },
        ] }]);
    },
  }));
  w.npcs.farmer = w.spawn(new NPC(X(12), surf(12), {
    name: 'Odo', layers: CAST.farmer, wander: 48,
    talk(w) { w.ui.say('Odo', pick(['Crows won\'t come near my scarecrow. Neither will I, honestly.', 'Pumpkins this year are big enough to live in.', 'Since the mine went bad, the fox keeps eyeing my hens.'])); },
  }));
  const guard = w.npcs.guard = w.spawn(new NPC(X(133.5), 17 * T, {
    name: 'Hal', layers: CAST.guard, fixedFacing: true, facing: -1,
    talk(w) {
      if (!s.lantern) w.ui.say('Hal', 'Halt. Nobody goes into Gloamhollow without a light. Go see Maren, by the house with the laundry.');
      else if (!s.flags.bossDead) w.ui.say('Hal', pick(['That\'s Maren\'s lantern. Good luck down there.', 'Slimes are slow. The dead ones aren\'t. Watch for the flash before they swing.', 'If you fall in the dark, you\'ll wake by the last fire you rested at.']));
      else w.ui.say('Hal', 'You beat the horned one? I\'ll be buying your drinks for a year.');
    },
  }));
  w.npcs.goddess = w.spawn(new NPC(X(55.5), surf(55), {
    name: 'Shrine Spirit', layers: CAST.elder, portrait: img('npc/shrine_spirit_portrait'), prompt: 'Pray',
    talk(w, n) {
      w.ui.dialog([line('Shrine Spirit', 'Rest, wanderer. The light of Emberwick watches over you.', n.portrait)], () => {
        n.spawnKey = 'shrine';
        game.rest(n, 'Your wounds close. Progress saved.');
      });
    },
    draw(ctx, cx, cy, n) {
      const a = { key: 'npc/shrine_spirit', fw: 64, fh: 64 };
      const f = Math.floor(n.t * 8) % 13;
      const bob = Math.round(Math.sin(n.t * 2) * 2) - 2;
      ctx.drawImage(img(a.key), f * 64, 0, 64, 64, Math.round(n.x - cx - 32), Math.round(n.y - cy - 64 + bob), 64, 64);
    },
    tick(dt, w, n) { if (Math.random() < dt * 5) w.fx.burst(n.x + rand(-10, 10), n.y - rand(10, 44), 1, { color: ['#fff6c0', '#ffd8f0'], speed: 6, life: 1, gravity: -12, glow: true }); },
  }));

  // --- animals
  const dog = w.spawn(new Pet(X(95), surf(95), 'dog', { mode: 'follow', name: 'Biscuit', prompt: 'Pet Biscuit', lines: ['Biscuit wags so hard he nearly falls over.', 'Biscuit licks your hand. It tastes like adventure.', 'Biscuit sits. Good boy.'] }));
  dog.leash = 130 * T;
  w.spawn(new Pet(X(31), surf(31), 'cat', { mode: 'sit', prompt: 'Pet cat', lines: ['The cat permits one (1) pat.', 'Purrrrr.', 'The cat looks at you like you owe it money.'] }));
  w.spawn(new Pet(X(6), surf(6), 'fox', { mode: 'skittish' }));

  // --- exits
  const ex = w.spawn(new Exit(149 * T, 17 * T, 24, 5 * T, 'cave', 'entrance'));
  ex.guard = () => !s.lantern;

  // --- spawn
  const spawns = {
    start: { x: X(8), y: surf(8), facing: 1 },
    cave: { x: X(145), y: 17 * T, facing: -1 },
    shrine: { x: X(53), y: surf(53), facing: 1 },
    portal: { x: X(52), y: surf(52), facing: 1 },
  };
  w.start(spawns[spawnKey] || spawns.start);
  if (spawnKey === 'cave' || spawnKey === 'portal') { s.checkpoint = { level: 'town', spawn: s.fires.town || spawnKey }; game.writeSave(); }
  if (spawnKey === 'cave' || spawnKey === 'portal') { dog.x = w.player.x - 30; dog.y = w.player.y; }
  if (spawnKey === 'portal') { w.fx.flashScreen(0.6, '255,230,170'); sfx('portal'); }
  if (!s.flags.intro && spawnKey === 'start') {
    s.flags.intro = true;
    w.after(3.8, () => w.ui.showHint(`Move with ${input.label('move')}. Talk to people with ${input.label('interact')}.`, 5));
  }
  if (s.flags.tobinFreed && !s.flags.questDone) w.after(1, () => w.ui.showHint('Tell Maren the news.', 4));
  return w;
}

// ====================================================================== CAVE
let caveTex = null;
/** Tileable back wall: small dark cobbles, hairline cracks. Deliberately quieter than the
 *  rock you can stand on. */
function caveTexture() {
  if (caveTex) return caveTex;
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#100c18'; g.fillRect(0, 0, S, S);
  const ell = (x, y, rw, rh, col) => {
    g.fillStyle = col;
    for (let yy = -Math.floor(rh); yy <= Math.floor(rh); yy++) {
      const half = Math.round(rw * Math.sqrt(Math.max(0, 1 - (yy / rh) ** 2)));
      g.fillRect(Math.round(x - half), Math.round(y + yy), half * 2, 1);
    }
  };
  // cool violet, lifted a step above the warm rock you stand on
  const bases = ['#1c1729', '#191426', '#1e192d', '#161221', '#201a30'];
  for (let i = 0; i < 520; i++) {
    const x = hash(i, 1) * S, y = hash(i, 2) * S, r = 2.5 + hash(i, 3) * 3.5, sq = 0.55 + hash(i, 4) * 0.35;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      const X = x + dx, Y = y + dy;
      if (X < -12 || X > S + 12 || Y < -12 || Y > S + 12) continue;
      ell(X, Y, r * 1.3, r * sq, bases[i % bases.length]);
      ell(X - 1, Y - r * sq * 0.4, r * 0.8, Math.max(0.6, r * sq * 0.3), 'rgba(90,72,110,0.10)');
    }
  }
  // hairline cracks: short random walks
  g.fillStyle = '#08050b';
  for (let i = 0; i < 26; i++) {
    let x = hash(i, 11) * S, y = hash(i, 12) * S;
    for (let k = 0; k < 24; k++) {
      g.fillRect(((x % S) + S) % S | 0, ((y % S) + S) % S | 0, 1, 1);
      x += hash(i, k) < 0.5 ? 1 : 0; y += 1; if (hash(k, i) < 0.3) x -= 1;
    }
  }
  for (let i = 0; i < 700; i++) {
    g.fillStyle = hash(i, 5) < 0.6 ? 'rgba(0,0,0,0.35)' : 'rgba(110,90,130,0.07)';
    g.fillRect((hash(i, 6) * S) | 0, (hash(i, 7) * S) | 0, 1, 1);
  }
  caveTex = c;
  return c;
}

/** Light the upward-facing contour of the terrain so every surface you can stand on reads. */
function litEdges(cv, color) {
  const g = cv.getContext('2d');
  const d = g.getImageData(0, 0, cv.width, cv.height);
  const a = d.data, w = cv.width;
  const [R, G, B] = color;
  for (let y = 1; y < cv.height; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (a[i + 3] < 200 || a[i - w * 4 + 3] > 40) continue;
      a[i] = (a[i] + R * 2) / 3; a[i + 1] = (a[i + 1] + G * 2) / 3; a[i + 2] = (a[i + 2] + B * 2) / 3;
      const j = i + w * 4;   // and a softer second pixel underneath
      if (y + 1 < cv.height && a[j + 3] > 200) { a[j] = (a[j] * 2 + R) / 3; a[j + 1] = (a[j + 1] * 2 + G) / 3; a[j + 2] = (a[j + 2] * 2 + B) / 3; }
    }
  }
  g.putImageData(d, 0, 0);
}

/** Stalactites, pebbles and glowing mushrooms baked onto the terrain canvas. Returns mushroom lights. */
function decorateCave(map, terrain) {
  const g = terrain.main.getContext('2d');
  const shrooms = [];
  for (let ty = 1; ty < map.h - 1; ty++) {
    for (let tx = 1; tx < map.w - 1; tx++) {
      const v = map.get(tx, ty);
      const h = hash(tx, ty);
      if (v === 1 && map.get(tx, ty + 1) === 0 && map.get(tx, ty + 2) === 0 && h < 0.33) {
        const len = 4 + Math.floor(hash(tx, ty + 99) * 10), x = tx * T + 3 + Math.floor(hash(tx, 5) * 9), y = (ty + 1) * T;
        for (let i = 0; i < len; i++) {
          const wdt = Math.max(1, Math.round(3 * (1 - i / len)));
          g.fillStyle = i < 2 ? '#2a2131' : '#221a29';
          g.fillRect(x - Math.floor(wdt / 2), y + i - 1, wdt, 1);
        }
        g.fillStyle = '#3c3046'; g.fillRect(x, y, 1, Math.floor(len * 0.6));
        if (hash(tx, 77) < 0.3) { g.fillStyle = '#6fd6f0'; g.fillRect(x, y + len - 1, 1, 1); }
      }
      if (v === 0 && map.get(tx, ty + 1) === 1 && map.get(tx, ty - 1) === 0) {
        if (h < 0.12) {
          const x = tx * T + 2 + Math.floor(hash(tx, 6) * 11), y = (ty + 1) * T;
          const n = 1 + Math.floor(hash(tx, 8) * 3);
          for (let i = 0; i < n; i++) {
            const sx = x + i * 3 - 2, sh = 3 + Math.floor(hash(tx + i, 9) * 4);
            g.fillStyle = '#d8eef0'; g.fillRect(sx + 1, y - sh, 1, sh);
            g.fillStyle = i % 2 ? '#4fd8c8' : '#6fb8ff'; g.fillRect(sx, y - sh - 2, 3, 2);
            g.fillStyle = '#c8fff8'; g.fillRect(sx + 1, y - sh - 2, 1, 1);
          }
          shrooms.push([x + 1, y - 6]);
        } else if (h < 0.3) {
          const x = tx * T + Math.floor(hash(tx, 6) * 14), y = (ty + 1) * T;
          g.fillStyle = '#3a2e40'; g.fillRect(x, y - 2, 3, 2);
          g.fillStyle = '#4e4058'; g.fillRect(x + 1, y - 3, 2, 1);
        }
      }
    }
  }
  return shrooms;
}

const LOOT = {
  // wooden -> iron (bought from Brann or Pip) -> golden, the reward for finding Durn's secret passage
  'c-62-4': { coins: 12, item: 'potion' },
  'c-68-20': { coins: 20, item: 'potion' },
  'c-3-35': { coins: 25, item: 'golden_sword' },
  'c-65-30': { coins: 10, item: 'heart' },
  'C-91-35': { coins: 40, item: 'relic' },
};

function buildCave(game, spawnKey) {
  const { rows, markers } = parse(MAPS.cave);
  const s = game.save;
  let boss = null, gate = null, tobin = null, goldChest = null;
  const arenaTorches = [];
  const ARENA_X0 = 73 * T, ARENA_X1 = 98 * T;

  const def = {
    id: 'cave', rows, title: 'GLOAMHOLLOW', subtitle: 'the old mine beneath the hill', closedTop: true,
    style: { sheet: 'world/floor_tiles2', grass: false, moss: 0.18, mossTint: 'rgba(34,40,30,0.55)' }, music: 'cave', dark: 0.72, darkColor: '6,4,12', camFrame: 0.6,
    dust: '#6a5a68',
    background(ctx, w, cx, cy) {
      const tex = caveTexture();
      const ox = -Math.round(cx * 0.85) % 256, oy = -Math.round(cy * 0.85) % 256;
      for (let x = ox - 256; x < W; x += 256) for (let y = oy - 256; y < H; y += 256) ctx.drawImage(tex, x, y);
      // the rock you can stand on casts a soft shadow onto the back wall
      ctx.globalAlpha = 0.35; ctx.drawImage(shadow, -cx + 6, -cy + 8);
      ctx.globalAlpha = 0.55; ctx.drawImage(shadow, -cx + 3, -cy + 4);
      ctx.globalAlpha = 1;
      // distant gloom gradient toward the deep
      const depth = Math.min(1, cy / (w.map.ph - H));
      ctx.fillStyle = `rgba(4,2,8,${0.12 + depth * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    },
    update(dt, w) {
      const p = w.player;
      // drips
      if (Math.random() < dt * 0.8) {
        const x = w.cam.x + rand(0, W);
        let y = w.cam.y;
        if (w.map.solidAtPx(x, y)) {
          while (y < w.cam.y + H && w.map.solidAtPx(x, y)) y += 4;
          if (y < w.cam.y + H) { w.fx.burst(x, y, 1, { color: '#7ab8d8', speed: 0, life: 1.2, gravity: 420 }); sfx('drip'); }
        }
      }
      // dust motes in the lantern light
      if (Math.random() < dt * 4) w.fx.burst(p.x + rand(-90, 90), p.y - rand(0, 80), 1, { color: '#c8b8a0', speed: 4, life: 2.5, gravity: 2 });
      // boss arena
      if (boss && !s.flags.bossDead && !w.bossStarted && p.x > ARENA_X0 + 2 * T && p.onGround) startBoss(w);
      // teach combat the moment the first slime is in view, not on a timer
      if (!s.flags.caveIntro && p.x > 12 * T) {
        s.flags.caveIntro = true;
        w.ui.showHint(`${input.label('attack')} to swing (tap again to combo). ${input.label('dash')} to dash through danger.`, 6);
      }
      // first time on a plank: teach drop-through
      if (!s.flags.plankHint && p.onGround && w.map.get(Math.floor(p.x / T), Math.floor((p.y + 1) / T)) === 2) {
        s.flags.plankHint = true;
        w.ui.showHint(`Hold Down and press ${input.label('jump')} to drop through planks.`, 4);
      }
      // secret: a draft of dust from the false wall
      if (!s.flags.secret && Math.random() < dt * 3) w.fx.burst(9 * T, rand(31, 36) * T, 1, { color: '#a89a88', speed: 14, life: 1.2, gravity: -4, angle: 0, spread: 0.6 });
    },
  };

  const w = new World(game, def);
  w.arenaX0 = ARENA_X0; w.arenaX1 = ARENA_X1; w.arenaTop = 27 * T;
  // terrain canvases are cached per level (see World), so dress them only the first time
  if (w.terrain.fresh) {
    texturize(w.map, w.terrain, 50, true);
    // warm the solid rock (#131116 -> ~#1e1716) so it separates from the cool back wall by temperature
    // (the fake wall gets the same tint, or the secret would give itself away)
    for (const cv of [w.terrain.main, w.terrain.fake]) { const g = cv.getContext('2d'); g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(70,46,20,0.24)'; g.fillRect(0, 0, cv.width, cv.height); g.restore(); }
    w.terrain.shrooms = decorateCave(w.map, w.terrain);
    litEdges(w.terrain.main, [138, 122, 128]);
    plankBrackets(w.map, w.terrain);
    const [sh, sg] = canvas(w.terrain.main.width, w.terrain.main.height);
    sg.drawImage(w.terrain.main, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = '#000'; sg.fillRect(0, 0, sh.width, sh.height);
    w.terrain.shadow = sh;
  }
  const shrooms = w.terrain.shrooms, shadow = w.terrain.shadow;
  w.spawn({ z: -10, dead: false, update() {}, draw() {}, glow(world) { for (const [x, y] of shrooms) world.light(x, y, 22, 0.55, '90,220,230'); } });

  const spawns = {};
  for (const m of markers) {
    const x = m.tx * T + 8, y = (m.ty + 1) * T, uid = `${m.ch}-${m.tx}-${m.ty}`;
    switch (m.ch) {
      case 'P': spawns.entrance = { x: x + 24, y, facing: 1 }; break;
      case 'x': w.spawn(new Exit(m.tx * T + 4, y, 10, 4 * T, 'town', 'cave')); break;
      case 'g': w.spawn(new Slime(x, y, 'green')).uid = uid; break;
      case 'b': w.spawn(new Slime(x, y, 'blue')).uid = uid; break;
      case 'r': w.spawn(new Slime(x, y, 'red')).uid = uid; break;
      case 'z': w.spawn(new Ghoul(x, y)).uid = uid; break;
      case 'w': w.spawn(new Wraith(x, y)).uid = uid; break;
      case 'B': if (!s.flags.bossDead) boss = w.spawn(new Boss(x, y)); break;
      case 'c': w.spawn(new Chest(x, y, `c-${m.tx}-${m.ty}`, LOOT[`c-${m.tx}-${m.ty}`] || { coins: 10 })); break;
      case 'C': goldChest = w.spawn(new Chest(x, y, `C-${m.tx}-${m.ty}`, LOOT[`C-${m.tx}-${m.ty}`], true)); goldChest.locked = !s.flags.bossDead; break;
      case 't': {
        const tor = w.spawn(new Torch(x, m.ty * T + 26));
        if (m.tx > 72 && m.ty >= 27 && !s.flags.bossDead) { tor.unlit = true; arenaTorches.push(tor); }
        break;
      }
      case 'o': w.spawn(new Ore(x, y, `o-${m.tx}-${m.ty}`, 'gold')); break;
      case 'd': w.spawn(new Ore(x, y, `o-${m.tx}-${m.ty}`, 'diamond')); break;
      case 'f': {
        const f = w.spawn(new Campfire(x, y)); f.spawnKey = m.tx > 50 ? 'campfire2' : 'campfire';
        // the nook fire sits against its east wall, so you wake on its west side
        spawns[f.spawnKey] = { x: f.spawnKey === 'campfire2' ? x - 26 : x + 24, y, facing: 1 };
        // Pip camps outside the foreman's door: his stock is the last call before Gorrak
        if (f.spawnKey === 'campfire2') spawnPeddler(w, 70 * T + 8, 36 * T);
        break;
      }
      case '$': { if (s.taken.includes(uid)) break; const c = w.spawn(new Pickup(x, y - 2, 'coin', 1)); c.vx = 0; c.vy = 0; c.age = 1; c.uid = uid; break; }
      case 'v': w.spawn(new Wisp(x, y)); break;
      case 's': w.spawn(new Marker(x, y, PROPS.tombBroken, ['A miner\'s marker, scratched with a knife:', '"GLOAMHOLLOW. Dig deep. Mind the dark. Rest by the fires."'], 'Marker')); break;
      case 'H':
        if (!s.flags.tobinFreed) {
          tobin = w.spawn(new NPC(x, y, {
            name: 'Tobin', layers: CAST.tobinTied, portrait: img(PORTRAITS.TobinRescued), fixedFacing: true, facing: -1, prompt: 'Untie',
            // only once the portal he talks about is actually open
            canTalk: () => !!s.flags.portalOpen,
            marker: () => (s.flags.portalOpen ? 'exclaim' : null),
            talk(w, n) {
              const pr = n.portrait;
              w.ui.dialog([
                line('Tobin', 'Mmmf! ...Is it gone? Stars above, it\'s gone!', pr),
                line('Tobin', 'I\'m Tobin. That horned brute, Gorrak, caught me digging and kept me for a hostage.', pr),
                line('Tobin', 'He hoarded everything shiny, even the Hearthstone he stole from our forge. It\'s in that chest!', pr),
                line('Tobin', 'I\'ll run ahead and tell Maren. That portal looks like it goes home. See you topside!', pr),
              ], () => {
                s.flags.tobinFreed = true;
                game.writeSave();
                sfx('portal');
                w.fx.burst(n.x, n.y - 20, 24, { color: ['#c06aff', '#ffd8f0', '#fff'], speed: 80, life: 0.8, gravity: -20, glow: true });
                n.hidden = true; n.dead = true;
              });
            },
          }));
        }
        break;
      default: break;
    }
  }
  // gate across the arena mouth (the map has barrier tiles there; open them now)
  gate = w.spawn(new Gate(0, 0, 72, 31, 35));
  gate.set(w, false);
  if (s.flags.bossDead) { s.flags.portalOpen = true; spawnPortal(w); }   // also covers quitting mid-death

  function startBoss(w) {
    w.bossStarted = true;
    gate.set(w, true);
    sfx('door'); w.fx.shake(4, 0.3);
    music('boss');
    // nothing else gets to join the duel
    for (const e of w.entities) if (e.team === 'enemy' && e !== boss && e.x > ARENA_X0 - 6 * T && e.y > 26 * T) { e.dead = true; w.fx.burst(e.x, e.y - 10, 10, { color: '#8a7a88', speed: 40, life: 0.5 }); }
    if (s.flags.bossSeen) {
      // retries skip the ceremony
      arenaTorches.forEach((t) => t.ignite(w));
      boss.wake(w);
      w.ui.boss = boss;
      return;
    }
    s.flags.bossSeen = true;
    w.inputLocked = true;
    arenaTorches.forEach((t, i) => w.after(0.2 + i * 0.28, () => { t.ignite(w); sfx('whoosh', 0.6); }));
    w.after(1.1, () => { boss.wake(w); w.ui.banner('GORRAK', 'the horned foreman', { y: 16, dur: 2.0 }); });
    w.after(2.3, () => { w.inputLocked = false; w.ui.boss = boss; });
  }
  w.spawnAdds = () => {
    // fixed ids, so retries pay a token coin like any other respawn
    w.spawn(new Slime(ARENA_X0 + 24, 36 * T, 'green')).uid = 'add-1';
    w.spawn(new Slime(ARENA_X1 - 24, 36 * T, 'green')).uid = 'add-2';
  };
  w.onBossDefeated = () => {
    s.flags.bossDead = true;
    s.flags.portalOpen = true;
    w.ui.boss = null;
    gate.set(w, false);
    if (goldChest) goldChest.locked = false;
    music('cave');
    sfx('fanfare');
    w.ui.toast('The foreman falls. The gate grinds open.', 'key');
    spawnPortal(w);
    game.writeSave();
  };

  // each level remembers its own last fire: back in the mine, you wake by the fire you last rested at
  if (s.checkpoint.level !== 'cave') { s.checkpoint = { level: 'cave', spawn: s.fires.cave || 'entrance' }; game.writeSave(); }
  w.start(spawns[spawnKey] || spawns.entrance);
  return w;
}

/** Pip sells the town's basics outside Gorrak's gate, at a markup, so coins found below are spendable below. */
function spawnPeddler(w, x, y) {
  const s = w.game.save;
  const pip = w.spawn(new NPC(x, y, {
    name: 'Pip', layers: CAST.peddler, facing: -1, prompt: 'Trade',
    talk(w, n) {
      w.ui.dialog([{ who: 'Pip', portrait: n.portrait, text: pick(["Pip's the name, peddling's the game. Prices are higher down here. So's the danger.", 'You look like someone who needs a draught. Everyone at this door does.', "Gorrak's through there. I'm out here. Prices reflect the location."]),
        choices: [
          { label: 'Trade', fn: () => w.ui.shop("Pip's Pack", [
            { name: 'Healing Draught', icon: 'potion', price: 10, desc: `Restores 5 health. Drink with ${input.label('potion')}. Carry up to 5.`, blocked: () => s.potions >= 5 && 'Your satchel is full.', buy: () => { s.potions++; } },
            { name: 'Iron Sword', icon: 'sword', price: 36, desc: 'Damage 2. Brann sells it cheaper, but Brann is up there.', blocked: () => s.sword >= 1 && 'You already carry finer steel.', buy: () => w.game.buySword(), thanks: 'Pleasure doing business.' },
            { name: 'Ember Tonic', icon: 'ember', price: 14, desc: `Fills your ember bar. Then Up + ${input.label('attack')}.`, blocked: () => s.ember >= 10 && 'Your ember is already roaring.', buy: () => { s.ember = 10; }, thanks: 'Mind your eyebrows.' },
            { name: 'Lucky Locket', icon: 'heart', price: 60, desc: 'A miner\'s keepsake. Max health +2.', blocked: () => s.flags.locket && 'Only the one, sorry.', buy: () => { s.flags.locket = true; s.maxHp += 2; s.hp += 2; } },
          ]) },
          { label: 'Bye', fn: null },
        ] }]);
    },
  }));
  pip.calm = true;   // nothing starts a fight while you browse
  return pip;
}

function spawnPortal(w) {
  w.spawn(new Portal(96 * T + 8, 36 * T, 'town', 'portal'));
}
