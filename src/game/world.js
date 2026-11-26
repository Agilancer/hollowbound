// One loaded level: map, entities, camera, effects, lighting.
import { TileMap, T, FAKE, lineOfSight } from '../engine/tiles.js';
import { FX, Camera } from '../engine/fx.js';
import { Lighting } from '../engine/lighting.js';
import { input } from '../engine/input.js';
import { img } from '../engine/assets.js';
import { drawText, measure } from '../engine/font.js';
import { sfx } from '../engine/audio.js';
import { overlap, drawSpec, rand } from './entity.js';
import { Pickup } from './actors.js';
import { Player } from './player.js';
import { EMOTE } from './data.js';
import { W, H, panel } from './ui.js';

const TERRAIN = new Map();

export class World {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.id = def.id;
    this.ui = game.ui;
    this.map = new TileMap(def.rows, { closedTop: def.closedTop });
    // Terrain never changes at runtime, so render each level once and reuse it on every
    // death/re-entry instead of piling up multi-megabyte canvases (iOS canvas memory).
    let terrain = TERRAIN.get(def.id);
    if (terrain) terrain.fresh = false;
    else { terrain = this.map.render(def.style); terrain.fresh = true; TERRAIN.set(def.id, terrain); }
    this.terrain = terrain;
    this.entities = [];
    this.fx = new FX();
    this.cam = new Camera(W, H);
    this.lighting = new Lighting(W, H);
    this.lights = [];
    this.time = 0; this.stopT = 0; this.slowT = 0;
    this.timers = [];
    this.emotes = [];
    this.bounds = { x0: 0, y0: 0, x1: this.map.pw, y1: this.map.ph };
    this.dustColor = def.dust || '#b8a888';
    this.fakeAlpha = 1;
    this.fading = false; this.fadeA = 1; this.fadeDir = -1;
    this.inputLocked = false;
    this.props = { back: [], front: [] };
    this.player = null;
  }

  /** Called by levels.js after construction. */
  start(spawn) {
    this.player = this.spawn(new Player(this.game, spawn.x, spawn.y));
    this.player.facing = spawn.facing || 1;
    this.player.z = 1;
    this.cam.snap(this.player.x, this.player.y, this.bounds, this.def.camFrame);
    this.fadeA = 1; this.fadeDir = -1;
  }

  spawn(e) {
    e.world = this;
    this.entities.push(e);
    e.init && e.init(this);
    return e;
  }

  light(x, y, r, a = 1, warm = null) { this.lights.push([x, y, r, a, warm]); }
  /** Within 128px of a campfire or Pip (same floor band, in plain sight) nothing picks a fight.
   *  The sight line keeps a calm zone from reaching through walls or the shut boss gate. */
  safeAt(x, y) {
    for (const e of this.entities) {
      if (!(e.prompt === 'Rest' || e.calm) || Math.abs(e.x - x) >= 128 || Math.abs(e.y - y) >= 40) continue;
      if (lineOfSight(this.map, e.x, e.y - 12, x, y - 12)) return true;
    }
    return false;
  }

  hitstop(t) { this.stopT = Math.max(this.stopT, t); }
  slowmo(t) { this.slowT = Math.max(this.slowT, t); }
  after(t, fn) { this.timers.push({ t, fn }); }
  emote(e, kind) { this.emotes = this.emotes.filter((m) => m.e !== e); this.emotes.push({ e, row: EMOTE[kind], t: 0 }); }

  dropCoins(x, y, n) {
    for (let i = 0; i < n; i++) {
      const c = this.spawn(new Pickup(x + rand(-4, 4), y, 'coin', 1));
      c.vx = rand(-80, 80); c.vy = rand(-230, -120);
    }
  }

  hitEnemies(box, dmg, src, o = {}) {
    let n = 0;
    for (const e of this.entities) {
      if ((e.team !== 'enemy' && e.team !== 'breakable') || e.dead || e.dying) continue;
      if (o.hitSet && o.hitSet.has(e)) continue;
      if (!overlap(box, e.box())) continue;
      o.hitSet && o.hitSet.add(e);
      if (e.hurt(dmg, src, this, o)) {
        if (e.team === 'enemy') {
          n++;   // breakables (ore) don't count: they shouldn't feed the ember meter
          this.hitstop(o.finisher ? 0.085 : 0.055);
          this.fx.shake(o.finisher ? 3 : 1.5, 0.12);
          input.rumble(o.finisher ? 'crit' : 'hit');
          sfx(e.kind ? 'squish' : 'hit');
          const sp = this.game.swordSpark();
          this.fx.burst((box.x0 + box.x1) / 2 + (e.x - (box.x0 + box.x1) / 2) * 0.5, e.y - e.h / 2, 8, { color: sp, speed: 120, life: 0.25, gravity: 200, glow: true });
        }
      }
    }
    return n;
  }

  respawnSafe() {
    this.fading = true; this.fadeDir = 1;
    this.inputLocked = true;
    this.after(0.35, () => {
      const p = this.player;
      p.x = p.lastSafe.x; p.y = p.lastSafe.y; p.vx = 0; p.vy = 0;
      if (p.state !== 'dead') p.state = 'normal';
      this.cam.snap(p.x, p.y, this.bounds, this.def.camFrame);
      this.fadeDir = -1;
      this.after(0.3, () => { this.fading = false; this.inputLocked = false; });
    });
  }

  fadeOut(cb, speed = 3) {
    this.fading = true; this.fadeDir = 1; this.fadeSpeed = speed;
    this.inputLocked = true;
    this.fadeCb = cb;
  }

  interactTarget() {
    const p = this.player;
    if (!p.onGround || p.state !== 'normal') return null;
    let best = null, bd = 1e9;
    for (const e of this.entities) {
      if (!e.interactable || e === p) continue;
      const dx = Math.abs(e.x - p.x), dy = Math.abs((e.y - e.h / 2) - (p.y - p.h / 2));
      const reach = (e.hw || 8) + 16;
      if (dx < reach && dy < 30 && dx < bd) { best = e; bd = dx; }
    }
    return best;
  }

  update(dt) {
    // fade
    if (this.fadeDir !== 0) {
      this.fadeA = Math.min(1, Math.max(0, this.fadeA + this.fadeDir * dt * (this.fadeSpeed || 3)));
      if (this.fadeDir > 0 && this.fadeA >= 1 && this.fadeCb) { const cb = this.fadeCb; this.fadeCb = null; cb(); }
      if (this.fadeDir < 0 && this.fadeA <= 0) this.fadeDir = 0;
    }
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    due.forEach((t) => t.fn());

    if (this.ui.busy) { this.fx.update(dt * 0.0); return; }
    if (this.stopT > 0) { this.stopT -= dt; this.player && this.player.bufferInputs(this); return; }
    let sdt = dt;
    if (this.slowT > 0) { this.slowT -= dt; sdt = dt * 0.3; }
    this.time += sdt;

    for (const e of this.entities) if (!e.dead) e.update(sdt, this);
    this.entities = this.entities.filter((e) => !e.dead);
    this.def.update && this.def.update(sdt, this);
    this.fx.update(sdt);
    for (const m of this.emotes) m.t += sdt;
    this.emotes = this.emotes.filter((m) => m.t < 1.6 && !m.e.dead);

    const p = this.player;
    this.cam.follow(p, dt, this.bounds, { lookDown: p.downT > 0.35 ? 60 : 0, frame: this.def.camFrame });

    // fake walls fade when you are inside them
    const inside = this.map.get(Math.floor(p.x / T), Math.floor((p.y - 12) / T)) === FAKE;
    this.fakeAlpha += ((inside ? 0.3 : 1) - this.fakeAlpha) * Math.min(1, dt * 8);
    if (inside && !this.game.save.flags.secret) { this.game.save.flags.secret = true; this.game.onSecret(); }

    // interaction
    this.target = this.inputLocked ? null : this.interactTarget();
    if (this.target && input.pressed('interact')) {
      const t = this.target;
      this.target = null;
      t.interact(this);
    }
  }

  draw(ctx) {
    const [sx, sy] = this.fx.shakeOffset();
    const cx = Math.round(this.cam.x) + sx, cy = Math.round(this.cam.y) + sy;
    this.def.background(ctx, this, cx, cy);
    for (const pr of this.props.back) this.drawProp(ctx, pr, cx, cy);
    this.def.midground && this.def.midground(ctx, this, cx, cy);
    ctx.drawImage(this.terrain.main, -cx, -cy);
    const sorted = this.entities.slice().sort((a, b) => a.z - b.z);
    for (const e of sorted) {
      if (e.x + 80 < cx || e.x - 80 > cx + W || e.y + 40 < cy || e.y - 120 > cy + H) continue;
      e.draw(ctx, cx, cy);
    }
    for (const pr of this.props.front) this.drawProp(ctx, pr, cx, cy);
    if (this.fakeAlpha < 0.999) ctx.globalAlpha = this.fakeAlpha;
    ctx.drawImage(this.terrain.fake, -cx, -cy);
    ctx.globalAlpha = 1;
    this.fx.draw(ctx, cx, cy);
    this.def.foreground && this.def.foreground(ctx, this, cx, cy);

    // lighting
    if (this.def.dark > 0) {
      const L = this.lighting;
      L.begin();
      const s = this.game.save, p = this.player;
      const [lx, ly] = p.lightPos();
      const fl = 1 + Math.sin(this.time * 9) * 0.025 + Math.sin(this.time * 23) * 0.015;
      if (s.lantern) { L.add(lx - cx, ly - cy, 140 * fl, 1, '255,190,110'); L.add(lx - cx, ly - cy, 40, 1); }
      else L.add(lx - cx, ly - cy, 46, 0.7);
      for (const e of this.entities) e.glow && e.glow(this);
      for (const [x, y, r, a, w] of this.lights) L.add(x - cx, y - cy, r, a, w);
      L.draw(ctx, this.def.dark, this.def.darkColor, this.terrain, cx, cy);
    }
    this.lights.length = 0;
    this.def.overlay && this.def.overlay(ctx, this, cx, cy);
    for (const e of sorted) e.drawLit && e.drawLit(ctx, cx, cy);
    this.fx.drawGlow(ctx, cx, cy);

    // emotes & quest markers
    for (const m of this.emotes) {
      const col = Math.min(18, Math.floor(m.t / 1.6 * 19));
      ctx.drawImage(img('ui/emotes'), col * 16, m.row * 16, 16, 16, Math.round(m.e.x - cx - 8), Math.round(m.e.y - m.e.h - cy - 22), 16, 16);
    }
    for (const e of this.entities) {
      const mk = e.def && e.def.marker && e.def.marker(this, e);
      if (!mk || e.hidden) continue;
      const row = mk === 'question' ? 0 : 1;
      const f = Math.floor(this.time * 10) % 16;
      ctx.drawImage(img('ui/quest_marker'), f * 32, row * 32, 32, 32, Math.round(e.x - cx - 16), Math.round(e.y - e.h - cy - 44), 32, 32);
    }
    this.fx.drawTexts(ctx, cx, cy);

    // interaction prompt
    if (this.target && !this.ui.busy && this.game.state === 'play') {
      const t = this.target;
      const label = `${input.label('interact')}  ${t.prompt || 'Use'}`;
      const w = measure(label) + 10;
      // above whichever is taller, the thing or the player, so it never sits on a face
      const top = Math.min(t.y - t.h - (t.lift || 0), this.player.y - this.player.h);
      const px = Math.round(t.x - cx - w / 2), py = Math.round(top - cy - 18 + Math.sin(this.time * 5) * 1.2);
      panel(ctx, px, py, w, 14, 0.85);
      drawText(ctx, input.label('interact'), px + 5, py + 4, '#ffd36a');
      drawText(ctx, t.prompt || 'Use', px + 5 + measure(input.label('interact')) + 4, py + 4, '#f4ead2');
    }
    this.fx.drawFlash(ctx, W, H);
  }

  drawProp(ctx, pr, cx, cy) {
    const w = pr.spec[3], h = pr.spec[4];
    const px = pr.x - cx * (pr.par ?? 1), py = pr.y - cy * (pr.par ?? 1);
    if (px + w / 2 < 0 || px - w / 2 > W || py < 0 || py - h > H) return;
    drawSpec(ctx, pr.spec, px, py, pr.flip, pr.alpha ?? 1);
  }

  drawFade(ctx) {
    if (this.fadeA > 0) { ctx.fillStyle = `rgba(6,4,10,${this.fadeA})`; ctx.fillRect(0, 0, W, H); }
  }
}
