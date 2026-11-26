// Pickups, props you can interact with, NPCs and animals.
import { Entity, rand, pick, approach, clamp, overlap, whiteOf, drawSpec, drawAnim } from './entity.js';
import { bake, drawChar, ROWS, Anim, portrait } from '../engine/sprite.js';
import { img } from '../engine/assets.js';
import { T } from '../engine/tiles.js';
import { sfx } from '../engine/audio.js';
import { input } from '../engine/input.js';
import { ANIMS, PROPS, CAST, ICON, PORTRAITS } from './data.js';
import { icon } from './ui.js';

// ------------------------------------------------------------------ pickups
export class Pickup extends Entity {
  constructor(x, y, kind = 'coin', value = 1) {
    super(x, y);
    this.kind = kind; this.value = value;
    this.hw = 4; this.h = 8;
    this.t = rand(0, 1); this.age = 0;
    this.vx = rand(-70, 70); this.vy = rand(-200, -120);
    this.z = 5;
  }
  update(dt, world) {
    this.t += dt; this.age += dt;
    const p = world.player;
    const dx = p.x - this.x, dy = (p.y - 16) - (this.y - 4), d = Math.hypot(dx, dy);
    if (this.age > 0.35 && d < 52 && p.state !== 'dead') {
      const k = (1 - d / 52) * 900 + 200;
      this.vx += (dx / d) * k * dt; this.vy += (dy / d) * k * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= 0.92; this.vy *= 0.92;
    } else {
      const wasAir = !this.onGround;
      this.physics(dt, world, 650, 380);
      if (this.onGround) {
        if (wasAir && this.vy === 0 && Math.abs(this.lastVy || 0) > 90) { this.vy = -this.lastVy * 0.4; this.onGround = false; }
        this.vx = approach(this.vx, 0, 400 * dt);
      }
      this.lastVy = this.vy;
      if (this.hitWall) this.vx = -this.wallVx * 0.5;
    }
    if (this.age > 0.2 && d < 14) this.collect(world);
    if (this.age > 40) this.dead = true;
  }
  collect(world) {
    this.dead = true;
    const s = world.game.save;
    if (this.uid && !s.taken.includes(this.uid)) s.taken.push(this.uid);
    if (this.kind === 'coin') { s.coins += this.value; sfx('coin', 0.8); world.ui.bumpCoins(); }
    else if (this.kind === 'gem') { s.coins += this.value; sfx('gem'); world.ui.bumpCoins(); world.fx.text(this.x, this.y - 12, `+${this.value}`, '#9fe8ff'); }
    else if (this.kind === 'heart') { s.hp = Math.min(s.maxHp, s.hp + this.value); sfx('heal'); world.fx.text(this.x, this.y - 12, `+${this.value}`, '#7dff8a'); }
    world.fx.burst(this.x, this.y - 4, 5, { color: this.kind === 'gem' ? ['#bff4ff', '#5ab4ff'] : ['#fff6b0', '#ffd34a'], speed: 40, life: 0.3, gravity: 0, glow: true });
  }
  draw(ctx, cx, cy) {
    const blink = this.age > 34 && Math.floor(this.age * 8) % 2;
    if (blink) return;
    if (this.kind === 'coin') drawAnim(ctx, ANIMS.coin, this.t, this.x - cx, this.y - cy + 3);
    else {
      const bob = Math.round(Math.sin(this.t * 4) * 1);
      icon(ctx, this.kind === 'gem' ? ICON.gem : ICON.heart, this.x - cx - 6, this.y - cy - 11 + bob);
    }
  }
  glow(world) { if (this.kind === 'gem') world.light(this.x, this.y - 5, 26, 0.6, '120,200,255'); }
}

// ------------------------------------------------------------------ chests
export class Chest extends Entity {
  constructor(x, y, id, loot, gold = false) {
    super(x, y);
    this.id = id; this.loot = loot; this.gold = gold;
    this.hw = 11; this.h = 18; this.t = 0; this.z = -1;
    this.opened = false; this.openT = 0;
    this.locked = gold;
    this.prompt = 'Open';
  }
  init(world) {
    if (world.game.save.chests.includes(this.id)) { this.opened = true; this.openT = 1; this.looted = true; }
  }
  // the foreman's chest can't be fiddled with mid-fight (a dialog there would just be a free pause)
  get interactable() { return !this.opened && !(this.locked && this.world && this.world.ui.boss); }
  interact(world) {
    if (this.locked) { world.ui.say(null, 'A heavy lock bears the foreman\'s mark. It will not budge.'); sfx('deny'); return; }
    this.opened = true; this.openT = 0;
    input.rumble('loot');
    sfx('chest');
    world.fx.shake(2, 0.15);
    world.game.save.chests.push(this.id);
    world.game.save.treasure++;
    world.after(0.3, () => {
      world.fx.burst(this.x, this.y - 12, 16, { color: ['#fff6b0', '#ffd34a', '#ffffff'], speed: 90, life: 0.7, gravity: 120, up: 80, glow: true });
      world.game.giveLoot(this.loot, this);
    });
  }
  update(dt, world) {
    this.t += dt;
    if (this.opened) this.openT += dt;
    if (!this.opened && Math.random() < dt * 2) world.fx.burst(this.x + rand(-9, 9), this.y - rand(4, 16), 1, { color: '#fff6c0', speed: 4, life: 0.6, gravity: -10, glow: true });
  }
  glow(world) {
    if (!this.opened) world.light(this.x, this.y - 8, this.gold ? 56 : 34, 0.55, '255,210,120');
    else if (this.openT < 2) world.light(this.x, this.y - 12, 60 * (1 - this.openT / 2), 0.8, '255,210,120');
  }
  draw(ctx, cx, cy) {
    const f = this.opened ? (this.looted ? 1 : Math.min(3, 1 + Math.floor(this.openT * 9))) : 0;
    const row = this.gold ? 1 : 0;
    const wob = !this.opened && this.t % 3 < 0.25 ? Math.round(Math.sin(this.t * 50)) : 0;
    ctx.drawImage(img('world/chest'), f * 24, row * 20, 24, 20, Math.round(this.x - cx - 12 + wob), Math.round(this.y - cy - 20), 24, 20);
  }
}

// ------------------------------------------------------------------ ore nodes
export class Ore extends Entity {
  constructor(x, y, id, kind = 'gold') {
    super(x, y);
    this.id = id; this.kind = kind;
    this.hw = 14; this.h = 26; this.z = -2;
    this.hp = kind === 'diamond' ? 4 : 3;
    this.team = 'breakable';
    this.shakeT = 0; this.flashT = 0;
    this.cell = kind === 'diamond' ? [1, 1] : [0, 1];
  }
  init(world) { if (world.game.save.ores.includes(this.id)) this.dead = true; }
  hurt(dmg, src, world) {
    this.hp -= 1;
    this.shakeT = 0.15; this.flashT = 0.08;
    sfx('clang');
    world.fx.burst(this.x - src.facing * 6, this.y - 14, 6, { color: this.kind === 'diamond' ? ['#bff4ff', '#5ab4ff', '#fff'] : ['#ffe680', '#e8a830', '#fff'], speed: 90, life: 0.4, gravity: 400, glow: true });
    world.dropCoins(this.x, this.y - 20, 1);
    if (this.hp <= 0) {
      this.dead = true;
      sfx('rock');
      world.fx.shake(3, 0.2);
      world.fx.burst(this.x, this.y - 12, 18, { color: ['#8a7a6a', '#5a4a40', '#b0a090'], speed: 110, life: 0.7, gravity: 500, up: 60, size: 2, bounce: true, map: world.map });
      world.game.save.ores.push(this.id);
      if (this.kind === 'diamond') world.spawn(new Pickup(this.x, this.y - 16, 'gem', 15));
      world.dropCoins(this.x, this.y - 16, this.kind === 'diamond' ? 3 : 6);
    }
    return true;
  }
  update(dt) { this.shakeT = Math.max(0, this.shakeT - dt); this.flashT = Math.max(0, this.flashT - dt); }
  glow(world) {
    const tw = 0.5 + Math.sin(world.time * 3 + this.x) * 0.15;
    world.light(this.x, this.y - 14, this.kind === 'diamond' ? 44 : 34, tw, this.kind === 'diamond' ? '120,200,255' : '255,200,90');
  }
  draw(ctx, cx, cy) {
    const sx = this.shakeT > 0 ? Math.round(Math.sin(this.shakeT * 90) * 1.5) : 0;
    const [c, r] = this.cell;
    const x = Math.round(this.x - cx - 32 + sx), y = Math.round(this.y - cy - 60);
    ctx.drawImage(img('world/ores'), c * 64, r * 64, 64, 64, x, y, 64, 64);
    if (this.flashT > 0) { ctx.globalAlpha = 0.7; ctx.drawImage(whiteOf('world/ores'), c * 64, r * 64, 64, 64, x, y, 64, 64); ctx.globalAlpha = 1; }
  }
}

// ------------------------------------------------------------------ lights & set dressing
export class Torch extends Entity {
  constructor(x, y) { super(x, y); this.t = rand(0, 2); this.z = -5; }
  update(dt, world) {
    this.t += dt;
    if (this.unlit) return;
    if (Math.random() < dt * 4) world.fx.burst(this.x + rand(-1, 1), this.y - 26, 1, { color: ['#ffd36a', '#ff8a3a'], speed: 12, life: 0.5, gravity: -40, glow: true });
  }
  ignite(world) {
    this.unlit = false;
    world.fx.burst(this.x, this.y - 24, 16, { color: ['#fff0b0', '#ffb04a', '#ff6a2a'], speed: 70, life: 0.5, gravity: -60, glow: true });
  }
  glow(world) {
    if (this.unlit) return;
    const f = 0.85 + Math.sin(this.t * 13) * 0.06 + Math.sin(this.t * 7.3) * 0.05;
    world.light(this.x, this.y - 22, 86 * f, 0.95, '255,150,60');
  }
  draw(ctx, cx, cy) {
    if (!this.unlit) { drawAnim(ctx, ANIMS.torch, this.t, this.x - cx, this.y - cy); return; }
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.fillStyle = '#2a1e18'; ctx.fillRect(x - 1, y - 20, 3, 12);
    ctx.fillStyle = '#4a3428'; ctx.fillRect(x - 3, y - 22, 7, 3);
  }
}

export class Wisp extends Entity {
  constructor(x, y) { super(x, y); this.t = rand(0, 6); this.home = { x, y }; this.z = 4; }
  update(dt, world) {
    this.t += dt;
    this.x = this.home.x + Math.sin(this.t * 0.7) * 22;
    this.y = this.home.y + Math.sin(this.t * 1.3) * 8;
    if (Math.random() < dt * 6) world.fx.burst(this.x, this.y - 12, 1, { color: '#8fe8ff', speed: 6, life: 0.8, gravity: -6, glow: true });
  }
  glow(world) { world.light(this.x, this.y - 14, 64 + Math.sin(this.t * 5) * 4, 0.85, '110,210,255'); }
  draw(ctx, cx, cy) { drawAnim(ctx, ANIMS.wisp, this.t, this.x - cx, this.y - cy, Math.sin(this.t * 0.7 + 1.57) > 0); }
}

export class Campfire extends Entity {
  constructor(x, y) { super(x, y); this.t = 0; this.hw = 12; this.h = 20; this.prompt = 'Rest'; this.z = -3; }
  get interactable() { return true; }
  interact(world) { world.game.rest(this, 'Rested by the fire. Your progress is saved.'); }
  update(dt, world) {
    this.t += dt;
    if (Math.random() < dt * 10) world.fx.burst(this.x + rand(-4, 4), this.y - 10, 1, { color: ['#ffd36a', '#ff8a3a', '#ff5a2a'], speed: 14, life: 0.8, gravity: -50, glow: true });
  }
  glow(world) {
    const f = 0.9 + Math.sin(this.t * 11) * 0.06 + Math.sin(this.t * 5.1) * 0.05;
    world.light(this.x, this.y - 10, 120 * f, 1, '255,140,50');
  }
  draw(ctx, cx, cy) { drawAnim(ctx, ANIMS.campfire, this.t, this.x - cx, this.y - cy + 2); }
}

export class AnimProp extends Entity {
  constructor(x, y, anim, opts = {}) { super(x, y); this.a = ANIMS[anim]; this.t = rand(0, 2); this.flip = !!opts.flip; this.z = opts.z ?? -6; this.lightR = opts.light; this.lightC = opts.lightColor; this.cold = opts.cold; }
  update(dt, world) {
    this.t += dt;
    if (this.cold && this.cold() && Math.random() < dt * 0.6) world.fx.burst(this.x + rand(-4, 4), this.y - 40, 1, { color: '#6a6470', speed: 6, life: 1.6, gravity: -14 });
  }
  glow(world) { if (this.lightR && !(this.cold && this.cold())) world.light(this.x, this.y - 20, this.lightR * (0.92 + Math.sin(this.t * 9) * 0.08), 0.8, this.lightC || '255,150,60'); }
  draw(ctx, cx, cy) {
    if (this.cold && this.cold()) {
      // a sheet with its own cold frame draws it as-is; otherwise fall back to the dark wash
      const c = this.a.cold;
      drawAnim(ctx, c ? (this.coldA ||= { ...this.a, frames: [c] }) : this.a, 0, this.x - cx, this.y - cy, this.flip, 1, 0, !c);
      return;
    }
    drawAnim(ctx, this.a, this.t, this.x - cx, this.y - cy, this.flip);
  }
}

export class Portal extends Entity {
  constructor(x, y, dest, spawn) { super(x, y); this.dest = dest; this.spawnAt = spawn; this.t = 0; this.hw = 14; this.h = 48; this.prompt = 'Return to Emberwick'; }
  get interactable() { return true; }
  interact(world) { sfx('portal'); world.game.travel(this.dest, this.spawnAt); }
  update(dt, world) {
    this.t += dt;
    if (Math.random() < dt * 14) world.fx.burst(this.x + rand(-14, 14), this.y - rand(0, 40), 1, { color: ['#fff6c0', '#ffd34a', '#ffffff'], speed: 10, life: 0.8, gravity: -30, glow: true });
  }
  glow(world) { world.light(this.x, this.y - 28, 90, 0.9, '255,220,150'); }
  draw(ctx, cx, cy) { drawAnim(ctx, ANIMS.portal, this.t, this.x - cx, this.y - cy); }
}

/** Walk-into trigger (level exits). */
export class Exit extends Entity {
  constructor(x, y, w, h, dest, spawn) { super(x, y); this.hw = w / 2; this.h = h; this.dest = dest; this.spawnAt = spawn; }
  update(dt, world) {
    if (!world.fading && overlap(this.box(), world.player.box()) && world.player.state !== 'dead') {
      if (this.guard && this.guard()) return;
      sfx('door');
      world.game.travel(this.dest, this.spawnAt);
    }
  }
}

/** Readable marker (tombstone / crude sign). */
export class Marker extends Entity {
  constructor(x, y, spec, lines, name = null) { super(x, y); this.spec = spec; this.lines = lines; this.hw = 10; this.h = 20; this.prompt = 'Read'; this.name = name; this.z = -4; }
  get interactable() { return true; }
  interact(world) { world.ui.dialog(this.lines.map((t) => ({ who: this.name, text: t }))); }
  draw(ctx, cx, cy) { drawSpec(ctx, this.spec, this.x - cx, this.y - cy); }
}

export class Gate extends Entity {
  constructor(x, y, tx, ty0, ty1) {
    // placed on its tiles (feet at the bottom bar) so the world's off-screen cull sees it where it is
    super(tx * T + 8, (ty1 + 1) * T);
    this.hw = 8; this.h = (ty1 - ty0 + 1) * T;
    this.tx = tx; this.ty0 = ty0; this.ty1 = ty1; this.closed = false; this.t = 0; this.amount = 0; this.z = 6;
  }
  set(world, closed) {
    this.closed = closed;
    for (let ty = this.ty0; ty <= this.ty1; ty++) world.map.set(this.tx, ty, closed ? 5 : 0);
  }
  update(dt) { this.amount = approach(this.amount, this.closed ? 1 : 0, dt * 4); }
  draw(ctx, cx, cy) {
    if (this.amount <= 0) return;
    const x = Math.round(this.tx * T - cx), top = Math.round(this.ty0 * T - cy);
    const h = Math.round((this.ty1 - this.ty0 + 1) * T * this.amount);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#1a1418'; ctx.fillRect(x + i * 4, top, 3, h);
      ctx.fillStyle = '#6a6470'; ctx.fillRect(x + i * 4 + 1, top, 1, h);
    }
    ctx.fillStyle = '#2a2228'; ctx.fillRect(x - 1, top + h - 3, 17, 3);
    ctx.fillStyle = '#1a1418'; ctx.fillRect(x - 1, top + 8, 17, 2);
  }
}

// ------------------------------------------------------------------ NPCs
export class NPC extends Entity {
  constructor(x, y, def) {
    super(x, y);
    this.def = def;
    this.name = def.name;
    this.hw = 7; this.h = 34;
    // hats stick up past the body box; lift the talk prompt clear of them
    this.lift = def.lift ?? (def.layers.some((k) => k.includes('witch_hat')) ? 12 : def.layers.some((k) => /hat\/|helmet/.test(k)) ? 6 : 0);
    this.baked = bake(def.layers);
    this.portrait = def.portrait || (PORTRAITS[def.name] ? img(PORTRAITS[def.name]) : portrait(this.baked));
    this.anim = new Anim(); this.anim.t = rand(0, 1);
    this.facing = def.facing ?? -1;
    this.home = x; this.t = rand(0, 3);
    this.prompt = def.prompt || 'Talk';
    this.walkT = rand(2, 5); this.walkDir = 0;
    this.alpha = 1;
  }
  get interactable() { return !this.hidden && (!this.def.canTalk || this.def.canTalk()); }
  interact(world) {
    this.facing = Math.sign(world.player.x - this.x) || this.facing;
    this.def.talk(world, this);
  }
  update(dt, world) {
    this.t += dt;
    if (this.hidden) return;
    const p = world.player;
    const near = Math.abs(p.x - this.x) < 60 && Math.abs(p.y - this.y) < 40;
    if (this.def.wander && !near && !world.ui.busy) {
      this.walkT -= dt;
      if (this.walkT <= 0) { this.walkDir = this.walkDir ? 0 : pick([-1, 1]); this.walkT = this.walkDir ? rand(1, 2.5) : rand(2, 5); }
      if (Math.abs(this.x + this.walkDir * 10 - this.home) > this.def.wander) this.walkDir = Math.sign(this.home - this.x);
      this.vx = this.walkDir * 22;
      if (this.walkDir) this.facing = this.walkDir;
    } else {
      this.vx = 0;
      if (near && !this.def.fixedFacing) this.facing = Math.sign(p.x - this.x) || this.facing;
    }
    this.physics(dt, world);
    if (Math.abs(this.vx) > 1) { this.anim.play('walk'); this.anim.update(dt, ROWS.walk); }
    else { this.anim.play('idle'); this.anim.update(dt, ROWS.idle); }
    this.def.tick && this.def.tick(dt, world, this);
  }
  draw(ctx, cx, cy) {
    if (this.hidden) return;
    if (this.def.draw) return this.def.draw(ctx, cx, cy, this);
    drawChar(ctx, this.baked, this.anim.name, this.anim.frame, this.x - cx, this.y - cy, this.facing, { alpha: this.alpha });
  }
}

// ------------------------------------------------------------------ animals
const PET = {
  dog: { key: 'pets/dog', idle: [0, 5], run: [1, 6] },
  cat: { key: 'pets/cat', idle: [0, 6], run: [1, 6] },
  fox: { key: 'pets/fox', idle: [0, 5], run: [1, 6] },
};

export class Pet extends Entity {
  constructor(x, y, kind, opts = {}) {
    super(x, y);
    this.kind = kind; this.cfg = PET[kind];
    this.hw = 8; this.h = 14; this.t = rand(0, 2);
    this.home = x; this.mode = opts.mode || 'wander';
    this.facing = -1; this.state = 'idle'; this.stateT = rand(1, 3);
    this.name = opts.name; this.prompt = opts.prompt || 'Pet';
    this.lines = opts.lines;
    this.z = 3;
  }
  get interactable() { return !!this.lines; }
  interact(world) {
    world.fx.sprite('hearts', this.x, this.y + 20);
    world.emote(this, 'love');
    sfx('confirm');
    world.ui.toast(pick(this.lines));
    if (this.kind === 'dog') this.hop = 0.3;
  }
  update(dt, world) {
    this.t += dt;
    const p = world.player;
    if (this.mode === 'follow' && !world.ui.busy) {
      const target = p.x - p.facing * 26;
      const dx = target - this.x;
      if (Math.abs(dx) > 40 || (Math.abs(dx) > 8 && this.state === 'run')) {
        this.state = 'run';
        this.vx = approach(this.vx, Math.sign(dx) * Math.min(150, Math.abs(dx) * 3), 500 * dt);
        this.facing = Math.sign(dx);
        if (this.hitWall && this.onGround) this.vy = -230;
      } else { this.state = 'idle'; this.vx = approach(this.vx, 0, 600 * dt); if (Math.abs(p.x - this.x) > 2) this.facing = Math.sign(p.x - this.x); }
      if (this.x > (this.leash ?? 1e9)) { this.x = this.leash; this.state = 'idle'; this.vx = 0; this.facing = 1; }
      if (Math.abs(p.x - this.x) > 400 && p.onGround) { this.x = p.x - p.facing * 30; this.y = p.y; }
    } else if (this.mode === 'skittish' && Math.abs(p.x - this.x) < 50 && Math.abs(p.y - this.y) < 40) {
      this.state = 'run'; this.facing = Math.sign(this.x - p.x) || 1; this.vx = this.facing * 120; this.stateT = 1;
    } else {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.state = this.state === 'idle' && this.mode !== 'sit' ? 'run' : 'idle';
        this.stateT = this.state === 'run' ? rand(0.6, 1.4) : rand(2, 5);
        if (this.state === 'run') this.facing = Math.abs(this.x - this.home) > 60 ? Math.sign(this.home - this.x) : pick([-1, 1]);
      }
      this.vx = this.state === 'run' ? this.facing * 55 : approach(this.vx, 0, 400 * dt);
    }
    if (this.hop > 0) { this.hop -= dt; if (this.onGround) this.vy = -150; }
    this.physics(dt, world, 800);
  }
  draw(ctx, cx, cy) {
    const [row, n] = this.state === 'run' && Math.abs(this.vx) > 5 ? this.cfg.run : this.cfg.idle;
    const f = Math.floor(this.t * (row ? 12 : 6)) % n;
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    ctx.save();
    if (this.facing > 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(img(this.cfg.key), f * 32, row * 32, 32, 32, -16, y - 32, 32, 32); }
    else ctx.drawImage(img(this.cfg.key), f * 32, row * 32, 32, 32, x - 16, y - 32, 32, 32);
    ctx.restore();
  }
}

export { portrait };
