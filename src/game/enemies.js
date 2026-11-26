import { Entity, rand, pick, approach, clamp, overlap, whiteOf } from './entity.js';
import { bake, drawChar, ROWS, Anim } from '../engine/sprite.js';
import { img, canvas } from '../engine/assets.js';
import { T, lineOfSight } from '../engine/tiles.js';
import { sfx } from '../engine/audio.js';
import { CAST } from './data.js';

export class Enemy extends Entity {
  constructor(x, y) {
    super(x, y);
    this.team = 'enemy';
    this.hp = this.maxHp = 3;
    this.flashT = 0; this.stunT = 0;
    this.contact = 1;
    this.dying = false; this.dieT = 0;
    this.coins = 2;
    this.blood = 'blood';
    this.kbResist = 0;
    this.poise = 0;
  }

  hurt(dmg, src, world, o = {}) {
    if (this.dying) return false;
    if (this.invuln) { this.deflect(src, world); return false; }
    this.hp -= dmg;
    this.flashT = 0.12;
    const dir = Math.sign(this.x - src.x) || src.facing || 1;
    if (this.armored && this.armored()) {
      // wind-ups have super-armour: the hit lands and flashes, but the attack is still coming
      world.fx.burst(this.x - dir * this.hw, this.y - this.h * 0.6, 5, { color: ['#ffffff', '#ffb070'], speed: 90, life: 0.2, gravity: 0, glow: true });
    } else {
      this.vx = dir * (o.knock ?? 110) * (1 - this.kbResist);
      if (!this.floats && this.onGround) this.vy = -60 * (1 - this.kbResist);
      this.stunT = 0.22 * (1 - this.kbResist);
    }
    world.fx.text(this.x, this.y - this.h - 6, String(dmg), o.finisher ? '#ffd34a' : '#ffffff');
    world.fx.sprite(this.blood, this.x, this.y, { flip: dir > 0 });
    this.onHurt && this.onHurt(dmg, src, world, o);
    if (this.hp <= 0) this.die(world, src);
    return true;
  }

  die(world) {
    this.dying = true; this.dieT = 0;
    this.vx = 0;
    sfx('enemyDie');
    world.hitstop(0.09);
    world.fx.shake(3, 0.2);
    const s = world.game.save;
    // respawned foes drop a token coin, so dying and re-entering can't be farmed
    const first = !this.uid || !s.killed.includes(this.uid);
    if (this.uid && first) s.killed.push(this.uid);
    world.dropCoins(this.x, this.y - this.h / 2, first ? this.coins : Math.min(1, this.coins));
    s.kills++;
  }

  touchPlayer(world, dmg = this.contact) {
    const p = world.player;
    if (this.dying || p.state === 'dead') return;
    if (overlap(this.box(), p.box())) p.hurt(dmg, this.x, world);
  }

  /** An invulnerable target still answers a hit: a clang and a spray of sparks. */
  deflect(src, world) {
    const dir = Math.sign(this.x - src.x) || 1;
    sfx('clang');
    world.hitstop(0.04);
    world.fx.burst(this.x - dir * this.hw, this.y - this.h * 0.5, 12, { color: ['#ffffff', '#ffe08a', '#c8c8d8'], speed: 150, life: 0.25, gravity: 300, angle: dir > 0 ? Math.PI : 0, spread: 1.6, glow: true });
    world.fx.text(this.x, this.y - this.h - 6, 'clang', '#c8c8d8', { life: 0.5 });
  }

  tick(dt) {
    this.flashT = Math.max(0, this.flashT - dt);
    this.stunT = Math.max(0, this.stunT - dt);
  }

  /** Hit flashes and attack tells draw after the darkness pass, so they read as light, not grey.
   *  Solid white for the first two frames of a hit, then half. */
  drawLit(ctx, cx, cy) {
    if (this.flashT > 0) { this.drawSil(ctx, cx, cy, { white: true, alpha: this.flashT > 0.12 - 2 / 60 ? 1 : 0.5 }); return; }
    const tell = !this.dying && this.tell && this.tell();
    if (tell) this.drawSil(ctx, cx, cy, { tint: tell.rgb, alpha: tell.a * (0.5 - 0.5 * Math.cos(this.t * Math.PI * 2 * 6)) });
  }
}
const TELL_RGB = '255,90,40';

// ------------------------------------------------------------------ slimes
const SLIME = {
  green: { hp: 3, hopV: 190, hopVx: 62, cd: [0.8, 1.5], dmg: 1, coins: 2, light: '120,230,90', blood: 'bloodGreen', goo: ['#7fd34a', '#3e8f2a', '#b8f070'] },
  blue: { hp: 4, hopV: 265, hopVx: 82, cd: [0.9, 1.4], dmg: 1, coins: 3, light: '90,170,255', blood: 'bloodBlue', goo: ['#5ab4ff', '#2a5fb0', '#a8dcff'] },
  red: { hp: 5, hopV: 210, hopVx: 115, cd: [0.35, 0.7], dmg: 2, coins: 4, light: '255,90,70', blood: 'blood', goo: ['#ff5a4a', '#a8231e', '#ffb0a0'] },
};
const HOP_OFF = [0, 0, 6, 10, 12, 10, 6, 0]; // baked rise in the hop frames

export class Slime extends Enemy {
  constructor(x, y, color = 'green') {
    super(x, y);
    this.kind = color;
    this.cfg = SLIME[color];
    this.key = 'mobs/slime_' + color;
    this.hw = 9; this.h = 12;
    this.hp = this.maxHp = this.cfg.hp;
    this.contact = this.cfg.dmg;
    this.coins = this.cfg.coins;
    this.blood = this.cfg.blood;
    this.state = 'idle'; this.t = rand(0, 1);
    this.cd = rand(...this.cfg.cd);
    this.home = x;
  }

  update(dt, world) {
    this.tick(dt);
    this.t += dt;
    if (this.dying) {
      this.dieT += dt;
      if (this.dieT === dt) world.fx.burst(this.x, this.y - 6, 14, { color: this.cfg.goo, speed: 90, life: 0.6, gravity: 500, up: 60, size: 2, bounce: true, map: world.map });
      if (this.dieT > 0.55) this.dead = true;
      this.physics(dt, world, 800);
      return;
    }
    const p = world.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const aggro = Math.abs(dx) < 150 && Math.abs(dy) < 70 && p.state !== 'dead' && !world.safeAt(p.x, p.y);
    if (this.state === 'idle') {
      this.vx = approach(this.vx, 0, 600 * dt);
      if (this.onGround && this.stunT <= 0) this.cd -= dt * (aggro ? 1.4 : 1);
      if (this.cd <= 0 && this.onGround) { this.state = 'windup'; this.t = 0; }
    } else if (this.state === 'windup') {
      this.vx = 0;
      if (this.t > 0.2) {
        let dir = aggro ? Math.sign(dx) : (Math.abs(this.x - this.home) > 40 ? Math.sign(this.home - this.x) : pick([-1, 1]));
        this.facing = dir || 1;
        this.vy = -this.cfg.hopV * (aggro ? 1 : 0.7);
        this.vx = this.facing * this.cfg.hopVx * (aggro ? 1 : 0.6);
        this.state = 'air'; this.t = 0;
        if (Math.abs(dx) < 260) sfx('slimeHop', 0.8);
      }
    } else if (this.state === 'air') {
      if (this.hitWall) this.vx = -this.wallVx * 0.3;
      if (this.onGround && this.t > 0.05) {
        this.state = 'land'; this.t = 0; this.vx = 0;
        world.fx.burst(this.x, this.y - 1, 4, { color: this.cfg.goo, speed: 30, life: 0.3, gravity: 200, angle: -Math.PI / 2, spread: 2.4 });
      }
    } else if (this.state === 'land') {
      if (this.t > 0.12) { this.state = 'idle'; this.cd = rand(...this.cfg.cd); }
    }
    if (this.stunT > 0 && this.state !== 'air') { this.state = 'idle'; }
    this.physics(dt, world, 800);
    if (this.stunT <= 0) this.touchPlayer(world);
  }

  frame() {
    if (this.dying) return [Math.min(5, Math.floor(this.dieT * 12)), 2];
    if (this.state === 'windup') return [this.t < 0.1 ? 0 : 1, 1];
    if (this.state === 'air') {
      const f = this.vy < -120 ? 2 : this.vy < -30 ? 3 : this.vy < 60 ? 4 : this.vy < 150 ? 5 : 6;
      return [f, 1];
    }
    if (this.state === 'land') return [7, 1];
    return [Math.floor(this.t * 7) % 5, 0];
  }

  /** Floor under an airborne slime (null when grounded). */
  floorY() {
    const [c, r] = this.frame();
    if (!(this.state === 'air' || (r === 1 && HOP_OFF[c] > 0))) return null;
    const m = this.world.map;
    let gy = this.y;
    for (let i = 0; i < 12 && !m.solidAtPx(this.x, gy + 1) && m.get(Math.floor(this.x / T), Math.floor((gy + 1) / T)) !== 2; i++) gy += 8;
    return Math.floor((gy + 1) / T) * T;
  }

  glow(world) {
    if (this.dying) return;
    world.light(this.x, this.y - 6, 20, 0.35, this.cfg.light);
    // its own goo-light pooling on the floor below marks where a hop will land
    const fy = this.floorY();
    if (fy != null) world.light(this.x, fy - 2, 18, Math.max(0.15, 0.45 - (fy - this.y) / 200), this.cfg.light);
  }

  draw(ctx, cx, cy) {
    const [c, r] = this.frame();
    const off = r === 1 ? HOP_OFF[c] : 0;
    const fy = this.floorY();
    if (fy != null) {
      const w = 12 - Math.min(6, Math.round((fy - this.y) / 12));
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(Math.round(this.x - cx - w / 2), Math.round(fy - cy - 1), w, 1);
    }
    const x = Math.round(this.x - cx - 16), y = Math.round(this.y - cy - 32 + off);
    ctx.drawImage(img(this.key), c * 32, r * 32, 32, 32, x, y, 32, 32);
  }

  drawSil(ctx, cx, cy, o) {
    const [c, r] = this.frame();
    const off = r === 1 ? HOP_OFF[c] : 0;
    ctx.globalAlpha = o.alpha;
    ctx.drawImage(whiteOf(this.key), c * 32, r * 32, 32, 32, Math.round(this.x - cx - 16), Math.round(this.y - cy - 32 + off), 32, 32);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ ghoul (dead miner)
export class Ghoul extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.hw = 6; this.h = 34;
    this.hp = this.maxHp = 7;
    this.contact = 1; this.coins = 5;
    this.blood = 'bloodGreen';
    this.kbResist = 0.3;
    this.baked = bake(CAST.ghoul, 'rgba(40,60,30,0.38)');
    this.eyes = bake(CAST.ghoulEyes);
    this.anim = new Anim();
    this.state = 'patrol'; this.t = 0;
    this.facing = pick([-1, 1]);
    this.pauseT = 0; this.groanT = rand(2, 5);
    this.homeX = x;   // dead miners keep to their old shift: they won't follow you far
  }

  ledgeAhead(world) {
    const ax = this.x + this.facing * (this.hw + 4);
    const tx = Math.floor(ax / T), ty = Math.floor((this.y + 2) / T);
    return !world.map.solid(tx, ty) && world.map.get(tx, ty) !== 2;
  }

  /** Is the drop ahead only one tile deep? */
  dropAhead(world) {
    const tx = Math.floor((this.x + this.facing * (this.hw + 4)) / T), ty = Math.floor((this.y + 2) / T);
    return world.map.solid(tx, ty + 1) || world.map.get(tx, ty + 1) === 2;
  }

  /** Is the wall ahead only one tile tall, with headroom above it? */
  stepAhead(world) {
    const m = world.map, tx = Math.floor((this.x + this.facing * (this.hw + 2)) / T), ty = Math.floor((this.y - 1) / T);
    return m.solid(tx, ty) && !m.solid(tx, ty - 1) && !m.solid(tx, ty - 2) && !m.solid(tx, ty - 3);
  }

  update(dt, world) {
    this.tick(dt);
    this.t += dt;
    if (this.dying) {
      this.dieT += dt;
      this.anim.update(dt, ROWS.death, false);
      this.physics(dt, world);
      if (this.dieT > 1.6) this.dead = true;
      return;
    }
    const p = world.player;
    const dx = p.x - this.x, ady = Math.abs(p.y - this.y);
    const sees = Math.abs(dx) < 170 && ady < 50 && p.state !== 'dead' && !world.safeAt(p.x, p.y) && lineOfSight(world.map, this.x, this.y - 24, p.x, p.y - 20);
    this.groanT -= dt;
    if (this.groanT < 0 && Math.abs(dx) < 220) { this.groanT = rand(3, 6); sfx('roar', 0.18); }

    if (this.stunT > 0) {
      this.vx = approach(this.vx, 0, 500 * dt);
    } else if (this.state === 'patrol') {
      if (this.pauseT > 0) { this.pauseT -= dt; this.vx = 0; }
      else {
        if (Math.abs(this.x - this.homeX) > 120) this.facing = Math.sign(this.homeX - this.x);
        this.vx = this.facing * 20;
        if (this.hitWall || this.ledgeAhead(world)) { this.facing *= -1; this.pauseT = rand(0.6, 1.4); }
        if (Math.random() < dt * 0.15) this.pauseT = rand(0.8, 1.6);
      }
      if (sees) { this.state = 'chase'; this.t = 0; world.emote(this, 'exclaim'); }
    } else if (this.state === 'chase') {
      this.facing = Math.sign(dx) || this.facing;
      // a one-tile drop is fine mid-chase; a real ledge stops it
      const blocked = this.ledgeAhead(world) && !this.dropAhead(world);
      this.vx = blocked ? 0 : this.facing * 36;
      // a one-tile step is no obstacle: clamber up it instead of grinding against the wall
      if (this.hitWall && this.onGround && this.stepAhead(world)) { this.vy = -215; this.vx = this.facing * 40; }
      if (Math.abs(dx) < 32 && ady < 30) { this.state = 'windup'; this.t = 0; this.vx = 0; }
      if (!sees && this.t > 2) this.state = 'patrol';
      // lost you to a campfire's calm, or stuck at a real wall: give up and wander back
      const leashed = Math.abs(this.x - this.homeX) > 150 && Math.sign(dx) === Math.sign(this.x - this.homeX);
      if (world.safeAt(p.x, p.y) || leashed || (this.hitWall && this.onGround && !this.stepAhead(world))) {
        this.state = 'patrol'; this.pauseT = rand(0.8, 1.4); this.facing = Math.sign(this.homeX - this.x) || -this.facing;
      }
    } else if (this.state === 'windup') {
      this.vx = 0;
      if (this.t > 0.5) { this.state = 'strike'; this.t = 0; sfx('swing'); }
    } else if (this.state === 'strike') {
      this.vx = this.facing * 40;
      const box = this.facing > 0 ? { x0: this.x, x1: this.x + 34, y0: this.y - 44, y1: this.y - 4 } : { x0: this.x - 34, x1: this.x, y0: this.y - 44, y1: this.y - 4 };
      if (overlap(box, p.box())) p.hurt(2, this.x, world);
      if (this.t > 0.14) { this.state = 'recover'; this.t = 0; }
    } else if (this.state === 'recover') {
      this.vx = 0;
      if (this.t > 0.55) { this.state = 'chase'; this.t = 0; }
    }
    this.physics(dt, world);
    if (this.stunT <= 0 && this.state !== 'strike') this.touchPlayer(world);

    // animation
    if (this.state === 'windup') { this.anim.play('attack'); this.anim.frame = Math.min(2, Math.floor(this.t / 0.17)); }
    else if (this.state === 'strike') { this.anim.play('attack'); this.anim.frame = this.t < 0.07 ? 3 : 4; }
    else if (this.state === 'recover') { this.anim.play('attack'); this.anim.frame = 5; }
    else if (Math.abs(this.vx) > 2) { this.anim.play('walk'); this.anim.speed = Math.abs(this.vx) / 45; this.anim.update(dt, ROWS.walk); }
    else { this.anim.play('idle'); this.anim.speed = 0.7; this.anim.update(dt, ROWS.idle); }
  }

  die(world, src) {
    super.die(world, src);
    this.anim.play('death', true);
  }

  glow(world) { if (!this.dying) world.light(this.x - this.facing * 3, this.y - 30, 12, 0.3, '150,255,110'); }

  /** The eyes glow: drawn after the darkness pass so they read in the dark. */
  drawLit(ctx, cx, cy) {
    super.drawLit(ctx, cx, cy);
    if (this.flashT > 0) return;
    const a = this.dying ? Math.max(0, 1 - this.dieT / 0.6) : 1;
    if (a > 0) drawChar(ctx, this.eyes, this.anim.name, this.anim.frame, this.x - cx, this.y - cy, this.facing, { alpha: a });
  }

  armored() { return this.state === 'windup'; }
  tell() { return this.state === 'windup' ? { rgb: TELL_RGB, a: 0.55 } : null; }

  draw(ctx, cx, cy) {
    const a = this.dying && this.dieT > 1.1 ? 1 - (this.dieT - 1.1) / 0.5 : 1;
    drawChar(ctx, this.baked, this.anim.name, this.anim.frame, this.x - cx, this.y - cy, this.facing, { alpha: a });
  }

  drawSil(ctx, cx, cy, o) {
    drawChar(ctx, this.baked, this.anim.name, this.anim.frame, this.x - cx, this.y - cy, this.facing, o);
  }
}

// ------------------------------------------------------------------ wraith
export class Wraith extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.hw = 7; this.h = 30;
    this.hp = this.maxHp = 4;
    this.contact = 2; this.coins = 4;
    this.blood = 'bloodBlue';
    this.floats = true;
    this.baked = bake(CAST.wraith);
    this.state = 'drift'; this.t = rand(0, 3); this.cd = 1;
    this.home = { x, y };
    this.anim = new Anim();
  }

  update(dt, world) {
    this.tick(dt);
    this.t += dt;
    this.anim.update(dt, ROWS.idle);
    if (this.dying) {
      this.dieT += dt;
      this.y -= 20 * dt;
      if (Math.random() < 0.6) world.fx.burst(this.x + rand(-6, 6), this.y - rand(4, 30), 2, { color: ['#a8f0ff', '#5fc8e8'], speed: 20, life: 0.6, gravity: -40, glow: true });
      if (this.dieT > 0.7) this.dead = true;
      return;
    }
    const p = world.player;
    const px = p.x, py = p.y - 10;
    const dx = px - this.x, dy = py - this.y, d = Math.hypot(dx, dy);
    this.cd = Math.max(0, this.cd - dt);
    if (this.stunT > 0) {
      this.vx *= 1 - 4 * dt; this.vy *= 1 - 4 * dt;
    } else if (this.state === 'drift') {
      const leashed = Math.hypot(px - this.home.x, py - this.home.y) > 150;
      const near = d < 230 && p.state !== 'dead' && !leashed;
      const tx = near ? px : this.home.x + Math.sin(this.t * 0.5) * 40;
      const ty = near ? py - 8 : this.home.y;
      const ang = Math.atan2(ty - this.y, tx - this.x);
      const sp = near ? 34 : 18;
      this.vx = approach(this.vx, Math.cos(ang) * sp, 80 * dt);
      this.vy = approach(this.vy, Math.sin(ang) * sp + Math.sin(this.t * 3) * 14, 80 * dt);
      if (near) this.facing = Math.sign(dx) || 1;
      if (near && d < 95 && this.cd <= 0 && !this.inRock(world)) { this.state = 'tell'; this.t = 0; sfx('whoosh', 0.6); }
    } else if (this.state === 'tell') {
      this.vx *= 1 - 6 * dt; this.vy *= 1 - 6 * dt;
      if (this.t > 0.55) {
        const ang = Math.atan2(dy, dx);
        this.vx = Math.cos(ang) * 155; this.vy = Math.sin(ang) * 155;
        this.state = 'charge'; this.t = 0;
      }
    } else if (this.state === 'charge') {
      if (Math.random() < 0.7) world.fx.burst(this.x, this.y - 16, 1, { color: '#7fe0ff', speed: 6, life: 0.4, gravity: 0, glow: true });
      if (this.t > 0.6) { this.state = 'drift'; this.cd = rand(1.6, 2.4); this.t = 0; }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    // never stray more than ~140px from home (keeps it out of the boss arena)
    const hx = this.x - this.home.x, hy = this.y - this.home.y, hd = Math.hypot(hx, hy);
    if (hd > 140) { this.x = this.home.x + hx / hd * 140; this.y = this.home.y + hy / hd * 140; }
    this.x = clamp(this.x, 16, world.map.pw - 16);
    this.rock = this.inRock(world);
    if (this.stunT <= 0) this.touchPlayer(world);
    if (Math.random() < dt * 8) world.fx.burst(this.x + rand(-5, 5), this.y - 2, 1, { color: '#6fd6f0', speed: 8, life: 0.7, gravity: -15, glow: true });
  }

  inRock(world) { return world.map.solidAtPx(this.x, this.y - 14); }

  glow(world) { if (!this.dying && !this.rock) world.light(this.x, this.y - 22, 28, 0.45, '120,220,255'); }

  armored() { return this.state === 'tell'; }
  tell() { return this.state === 'tell' ? { rgb: '170,240,255', a: 0.6 } : null; }

  pose() {
    const anim = this.state === 'tell' || this.state === 'charge' ? 'fall' : 'idle';
    const fr = anim === 'fall' ? Math.floor(this.t * 12) % 4 : this.anim.frame;
    const jit = this.state === 'tell' ? Math.round(Math.sin(this.t * 60)) : 0;
    return [anim, fr, jit];
  }

  draw(ctx, cx, cy) {
    const flick = 0.62 + Math.sin(this.t * 9) * 0.08;
    let alpha = this.dying ? flick * (1 - this.dieT / 0.7) : flick;
    if (this.rock) alpha *= 0.3;   // only a faint shimmer while passing through stone
    const [anim, fr, jit] = this.pose();
    drawChar(ctx, this.baked, anim, fr, this.x - cx + jit, this.y - cy, this.facing, { alpha });
  }

  drawSil(ctx, cx, cy, o) {
    const [anim, fr, jit] = this.pose();
    drawChar(ctx, this.baked, anim, fr, this.x - cx + jit, this.y - cy, this.facing, { ...o, alpha: o.alpha * (this.rock ? 0.3 : 0.8) });
  }
}

// ------------------------------------------------------------------ boss
export class Boss extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.name = 'GORRAK, THE HORNED FOREMAN';
    this.hw = 15; this.h = 68; this.scale = 2;
    this.z = 2;   // in front of the hostage and the props when the fight moves east
    this.hp = this.maxHp = 52;
    this.contact = 1; this.coins = 30;
    this.kbResist = 0.85;
    this.baked = bake(CAST.boss, null, 2);
    this.bakedNoCape = bake(CAST.bossNoCape, null, 2);
    this.eyes = bake(CAST.bossEyes, null, 2);
    this.anim = new Anim();
    this.state = 'dormant'; this.t = 0;
    this.phase = 1; this.staggerAcc = 0; this.staggerCd = 0;
    this.facing = -1;
    this.lastMove = null;
  }

  wake(world) {
    if (this.state !== 'dormant') return;
    this.state = 'roar'; this.t = 0;
    sfx('roar');
    world.fx.shake(5, 0.9);
  }

  onHurt(dmg, src, world) {
    this.staggerAcc += dmg;
    if (this.phase === 1 && this.hp <= this.maxHp / 2 && this.hp > 0) {
      this.phase = 2; this.state = 'roar'; this.t = 0; this.invuln = true;
      sfx('roar'); world.fx.shake(6, 1); world.fx.flashScreen(0.4, '255,80,40');
      world.spawnAdds && world.spawnAdds();
      return;
    }
    if (this.staggerAcc >= 10 && this.staggerCd <= 0 && ['walk', 'idle', 'cleaveRec', 'slamRec'].includes(this.state)) {
      this.staggerAcc = 0; this.staggerCd = 4; this.state = 'stagger'; this.t = 0;
      world.fx.sprite('stars', this.x, this.y - 44, { follow: this });
    }
  }

  choose(world) {
    const p = world.player, adx = Math.abs(p.x - this.x);
    this.facing = Math.sign(p.x - this.x) || this.facing;
    let next;
    if (adx < 70) next = 'cleaveWind';
    else if (this.phase === 2 && adx > 90 && this.lastMove !== 'chargeWind' && Math.random() < 0.5) next = 'chargeWind';
    else if (adx > 100 && Math.random() < 0.6 && this.lastMove !== 'leapWind') next = 'leapWind';
    else next = 'walk';
    this.state = next; this.t = 0; this.lastMove = next;
    this.windSound(next);
  }

  /** Each wind-up has its own voice, so you can hear what's coming while watching your blade. */
  windSound(st) {
    if (st === 'cleaveWind') sfx('grunt');
    else if (st === 'chargeWind') sfx('scrape');
    else if (st === 'leapWind') sfx('rise');
  }

  update(dt, world) {
    this.tick(dt);
    this.t += dt;
    this.staggerCd = Math.max(0, this.staggerCd - dt);
    const p = world.player;
    const spd = this.phase === 2 ? 1.25 : 1;
    if (this.dying) {
      this.dieT += dt;
      this.anim.update(dt, ROWS.death, false);
      this.physics(dt, world, 900, 500, true);   // planks can't hold him even now
      if (Math.random() < 0.5) world.fx.burst(this.x + rand(-20, 20), this.y - rand(0, 70), 2, { color: ['#ff8a3a', '#ffd36a', '#ff4a2a'], speed: 60, life: 0.6, gravity: -50, glow: true });
      if (this.dieT > 2.4 && !this.reported) { this.reported = true; world.onBossDefeated(this); }
      return;
    }
    const st = this.state;
    if (st === 'dormant') { this.anim.play('idle'); this.anim.update(dt, ROWS.idle); this.physics(dt, world); return; }
    if (st === 'roar') {
      this.vx = 0;
      this.anim.play('fall'); this.anim.update(dt, ROWS.fall);
      if (Math.random() < 0.5) world.fx.burst(this.x + rand(-60, 60), world.arenaTop + 4, 1, { color: ['#4a3a40', '#6a5a5a'], speed: 10, life: 1, gravity: 300, size: 2 });
      if (this.t > 1.3) { this.invuln = false; this.choose(world); }
    } else if (st === 'idle') {
      this.vx = 0;
      if (this.t > (this.phase === 2 ? 0.25 : 0.5)) this.choose(world);
    } else if (st === 'walk') {
      this.facing = Math.sign(p.x - this.x) || this.facing;
      this.vx = this.facing * 48 * spd;
      if (Math.abs(p.x - this.x) < 66 || this.t > 1.6) { this.state = Math.abs(p.x - this.x) < 66 ? 'cleaveWind' : 'idle'; this.t = 0; this.windSound(this.state); }
    } else if (st === 'cleaveWind') {
      this.vx = 0;
      if (this.t > 0.55 / spd) { this.state = 'cleave'; this.t = 0; sfx('swing3'); }
    } else if (st === 'cleave') {
      this.vx = this.facing * 160;
      const box = this.facing > 0 ? { x0: this.x, x1: this.x + 76, y0: this.y - 96, y1: this.y } : { x0: this.x - 76, x1: this.x, y0: this.y - 96, y1: this.y };
      if (overlap(box, p.box())) p.hurt(3, this.x, world);
      if (this.t > 0.13) { this.state = 'cleaveRec'; this.t = 0; world.fx.shake(3, 0.15); world.fx.burst(this.x + this.facing * 56, this.y - 2, 16, { color: ['#d8c8a8', '#8a7a68'], speed: 70, life: 0.5, gravity: 300, angle: -Math.PI / 2, spread: 2 }); }
    } else if (st === 'cleaveRec') {
      this.vx = approach(this.vx, 0, 900 * dt);
      if (this.t > 0.6 / spd) { this.state = 'idle'; this.t = 0; }
    } else if (st === 'leapWind') {
      this.vx = 0;
      if (this.t > 0.38) {
        const air = 0.78;
        this.vy = -330;
        this.vx = clamp((p.x - this.x) / air, -230, 230);
        this.state = 'leap'; this.t = 0;
        sfx('jump');
      }
    } else if (st === 'leap') {
      if (this.onGround && this.t > 0.1) {
        this.state = 'slamRec'; this.t = 0; this.vx = 0;
        sfx('slam'); world.fx.shake(7, 0.4);
        world.fx.burst(this.x, this.y - 2, 22, { color: ['#c8b8a0', '#7a6a58', '#4a3a30'], speed: 110, life: 0.6, gravity: 400, angle: -Math.PI / 2, spread: 2.8, size: 2 });
        world.spawn(new Shockwave(this.x - 18, this.y, -1));
        world.spawn(new Shockwave(this.x + 18, this.y, 1));
        const n = this.phase === 2 ? 5 : 3;
        for (let i = 0; i < n; i++) world.spawn(new FallingRock(rand(world.arenaX0 + 16, world.arenaX1 - 16), world.arenaTop, rand(0.2, 0.9)));
      }
    } else if (st === 'slamRec') {
      if (this.t > 0.7 / spd) { this.state = 'idle'; this.t = 0; }
    } else if (st === 'chargeWind') {
      this.vx = 0;
      this.facing = Math.sign(p.x - this.x) || this.facing;
      if (Math.random() < 0.5) world.fx.burst(this.x - this.facing * 8, this.y - 1, 1, { color: '#8a7a68', speed: 30, life: 0.4, gravity: 0, angle: this.facing > 0 ? Math.PI : 0, spread: 0.6 });
      if (this.t > 0.6) { this.state = 'charge'; this.t = 0; sfx('roar', 0.5); }
    } else if (st === 'charge') {
      this.vx = this.facing * 215;
      if (overlap(this.box(), p.box())) p.hurt(3, this.x, world);
      if (this.hitWall || this.t > 2) {
        this.state = 'stunned'; this.t = 0; this.vx = -this.facing * 80; this.vy = -120;
        sfx('slam'); world.fx.shake(8, 0.5);
        world.fx.sprite('stars', this.x, this.y - 44, { follow: this });
        for (let i = 0; i < 3; i++) world.spawn(new FallingRock(rand(world.arenaX0 + 16, world.arenaX1 - 16), world.arenaTop, rand(0.1, 0.6)));
      }
    } else if (st === 'stunned') {
      this.vx = approach(this.vx, 0, 300 * dt);
      if (this.t > 0.5 && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) world.fx.sprite('stars', this.x, this.y - 44, { follow: this });
      if (this.t > 1.6) { this.state = 'idle'; this.t = 0; }
    } else if (st === 'stagger') {
      this.vx = approach(this.vx, 0, 400 * dt);
      if (this.t > 0.5) { this.state = 'idle'; this.t = 0; this.staggerAcc = 0; }
    }
    // he's far too heavy for the planks: always passes through, so there's no perch above the player
    this.physics(dt, world, 900, 500, true);
    // body contact only hurts while he's moving with intent; punishing him in recovery is safe
    if (['walk', 'leap', 'cleaveWind', 'chargeWind', 'leapWind'].includes(this.state)) this.touchPlayer(world);

    // animation
    const a = this.anim;
    if (st === 'cleaveWind') { a.play('attack'); a.frame = Math.min(2, Math.floor(this.t / (0.19 / spd))); }
    else if (st === 'cleave') { a.play('attack'); a.frame = this.t < 0.065 ? 3 : 4; }
    else if (st === 'cleaveRec') { a.play('attack'); a.frame = 5; }
    else if (st === 'leapWind') { a.play('jump'); a.frame = 0; }
    else if (st === 'leap') { if (this.vy < 0) { a.play('jump'); a.frame = 2; } else { a.play('fall'); a.update(dt, ROWS.fall); } }
    else if (st === 'charge') { a.play('run'); a.speed = 1.4; a.update(dt, ROWS.run); }
    else if (st === 'chargeWind') { a.play('run'); a.frame = 0; }
    else if (st === 'walk') { a.play('walk'); a.speed = spd; a.update(dt, ROWS.walk); }
    else if (st === 'stunned' || st === 'stagger') { a.play('death'); a.frame = 1; }
    else if (st !== 'roar') { a.play('idle'); a.speed = 1; a.update(dt, ROWS.idle); }
  }

  die(world, src) {
    super.die(world, src);
    world.game.save.flags.bossDead = true;   // settled the moment he falls, even if you quit mid-animation
    this.anim.play('death', true);
    world.slowmo(1.4);
    world.fx.flashScreen(0.7);
    sfx('roar');
  }

  glow(world) {
    if (this.state === 'dormant' || this.dead) return;
    world.light(this.x, this.y - 40, 64, 0.5, this.phase === 2 ? '255,110,60' : '255,170,110');
  }

  /** Arms-up rows flare the cape into lobes, so those frames use the cape-less sheet. */
  sheet() { const n = this.anim.name; return n === 'jump' || n === 'fall' ? this.bakedNoCape : this.baked; }

  tell() {
    // the charge (the one you dash through rather than away from) gets its own gold
    if (this.state === 'chargeWind') return { rgb: '255,200,80', a: 0.5 };
    return this.state === 'cleaveWind' || this.state === 'leapWind' ? { rgb: TELL_RGB, a: 0.5 } : null;
  }

  draw(ctx, cx, cy) {
    const b = this.sheet();
    // phase-2 ember aura
    if (this.phase === 2 && !this.dying) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + Math.sin(this.t * 10) * 0.06;
      drawChar(ctx, b, this.anim.name, this.anim.frame, this.x - cx - 1, this.y - cy, this.facing, { tint: '255,120,60', scale: 2 });
      drawChar(ctx, b, this.anim.name, this.anim.frame, this.x - cx + 1, this.y - cy, this.facing, { tint: '255,120,60', scale: 2 });
      ctx.restore();
    }
    drawChar(ctx, b, this.anim.name, this.anim.frame, this.x - cx, this.y - cy, this.facing, { scale: 2 });
  }

  drawSil(ctx, cx, cy, o) {
    drawChar(ctx, this.sheet(), this.anim.name, this.anim.frame, this.x - cx, this.y - cy, this.facing, { ...o, scale: 2 });
  }

  /** His eyes burn even before he wakes: drawn after the darkness pass. */
  drawLit(ctx, cx, cy) {
    super.drawLit(ctx, cx, cy);
    if (this.flashT > 0 || this.dead) return;
    drawChar(ctx, this.eyes, this.anim.name, this.anim.frame, this.x - cx, this.y - cy, this.facing, { scale: 2 });
  }
}

export class Shockwave extends Entity {
  constructor(x, y, dir) {
    super(x, y); this.dir = dir; this.hw = 6; this.h = 14; this.t = 0; this.team = 'hazard';
  }
  update(dt, world) {
    this.t += dt;
    this.x += this.dir * 165 * dt;
    if (world.map.solidAtPx(this.x + this.dir * 6, this.y - 6) || this.t > 1.3) this.dead = true;
    if (Math.random() < 0.9) world.fx.burst(this.x, this.y - 2, 2, { color: ['#ffb04a', '#ff7a2a', '#d8c8a8'], speed: 40, life: 0.35, gravity: 200, angle: -Math.PI / 2, spread: 1.2, glow: true });
    const p = world.player;
    if (overlap(this.box(), p.box())) p.hurt(2, this.x - this.dir * 10, world);
  }
  draw(ctx, cx, cy) {
    // a ripple of stone shards bursting up through the floor, newest tallest
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    for (let i = 0; i < 4; i++) {
      const sx = x - this.dir * i * 6;
      const h = Math.max(0, Math.round((14 - i * 3.5) * (0.85 + 0.15 * Math.sin(this.t * 40 + i))));
      for (let r = 0; r < h; r++) {
        const wdt = Math.max(1, Math.round((1 - r / h) * 5));
        ctx.fillStyle = r < 2 ? '#ff9a3a' : r < h * 0.5 ? '#9a8a78' : '#c8b8a0';
        ctx.fillRect(sx - (wdt >> 1), y - r - 1, wdt, 1);
      }
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(sx - 2, y - 1, 4, 1);
    }
  }
  glow(world) { world.light(this.x, this.y - 4, 26, 0.7, '255,150,60'); }
}

/** A 12px lumpy boulder lit from the upper left. Drawn in 90-degree steps so the spin stays pixel-exact. */
let boulderCv = null;
function boulder() {
  if (boulderCv) return boulderCv;
  const S = 12, [c, g] = canvas(S, S), m = 5.5;
  const pal = ['#241a1e', '#43363a', '#64554f', '#8a7a6a', '#b4a48e'];
  const inside = (x, y) => {
    const dx = x - m, dy = y - m, a = Math.atan2(dy, dx);
    const r = 5.2 + Math.sin(a * 3 + 1) * 0.45 + Math.cos(a * 5) * 0.3;
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      const l = 0.45 + ((m - x) * 0.55 + (m - y) * 0.8) / 8;
      g.fillStyle = edge ? pal[0] : pal[1 + Math.max(0, Math.min(3, Math.floor(l * 4)))];
      g.fillRect(x, y, 1, 1);
    }
  }
  // a crack and a chip so the spin reads
  g.fillStyle = pal[1]; g.fillRect(6, 4, 1, 1); g.fillRect(7, 5, 1, 2); g.fillRect(3, 7, 2, 1);
  g.fillStyle = pal[4]; g.fillRect(3, 3, 1, 1);
  boulderCv = c;
  return c;
}

export class FallingRock extends Entity {
  constructor(x, top, delay) {
    super(x, top); this.delay = delay; this.t = 0; this.hw = 6; this.h = 10; this.falling = false; this.team = 'hazard';
    this.groundY = null;
    this.spin = Math.random() < 0.5 ? 1 : -1;
  }

  /** 0..1: how loud the warning is right now. */
  warn() {
    if (this.groundY == null) return 0;
    return this.falling ? clamp(1 - (this.groundY - this.y) / 140, 0.75, 1) : clamp((this.t - this.delay + 0.45) / 0.7, 0, 0.75);
  }
  update(dt, world) {
    this.t += dt;
    if (this.groundY == null) {
      let y = this.y;
      while (y < world.map.ph && !world.map.solidAtPx(this.x, y) && world.map.get(Math.floor(this.x / T), Math.floor(y / T)) !== 2) y += 4;
      this.groundY = Math.floor(y / T) * T;
    }
    if (!this.falling) {
      if (Math.random() < 0.4) world.fx.burst(this.x + rand(-6, 6), this.y + 2, 1, { color: '#6a5a50', speed: 5, life: 0.5, gravity: 200 });
      if (this.t > this.delay + 0.55) { this.falling = true; this.vy = 0; }
      return;
    }
    this.vy += 900 * dt; this.y += this.vy * dt;
    const p = world.player;
    if (overlap(this.box(), p.box())) { p.hurt(2, this.x, world); this.shatter(world); }
    if (this.y >= this.groundY) { this.y = this.groundY; this.shatter(world); }
  }
  shatter(world) {
    this.dead = true;
    sfx('rock', 0.7);
    world.fx.burst(this.x, this.y - 4, 10, { color: ['#8a7a6a', '#5a4a40', '#b0a090'], speed: 80, life: 0.6, gravity: 500, up: 40, size: 2, bounce: true, map: world.map });
  }
  draw() {}   // drawn after the darkness pass (drawLit): a hazard you can't see isn't fair

  drawBoulder(ctx, cx, cy) {
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy - 6);
    // loosening in the ceiling (a 1px shiver), then a spinning fall
    const jit = !this.falling && this.t > this.delay ? Math.round(Math.sin(this.t * 50)) : 0;
    const rot = this.falling ? (Math.floor(this.t * 14) * this.spin) & 3 : 0;
    ctx.save();
    ctx.translate(x + jit, y);
    ctx.rotate(rot * Math.PI / 2);
    ctx.drawImage(boulder(), -6, -6);
    ctx.restore();
  }

  glow(world) {
    const k = this.warn();
    if (k > 0) world.light(this.x, this.groundY - 3, 30, 0.8 * k, '232,216,176');
    if (this.falling) world.light(this.x, this.y - 6, 16, 0.4);
  }

  /** The warning is light, not shadow: a pale mark on the floor and dust sifting down to it. */
  drawLit(ctx, cx, cy) {
    this.drawBoulder(ctx, cx, cy);
    const k = this.warn();
    if (k <= 0) return;
    const x = Math.round(this.x - cx), gy = Math.round(this.groundY - cy);
    // a splash of light on the floor: 6 -> 14px wide, a brighter core, a softer row above it
    const w = Math.round(6 + 8 * k);
    ctx.fillStyle = '#e8d8b0';
    ctx.globalAlpha = 0.3 + 0.5 * k;
    ctx.fillRect(x - (w >> 1), gy - 1, w, 1);
    ctx.globalAlpha = (0.3 + 0.5 * k) * 0.45;
    ctx.fillRect(x - (w >> 1) + 2, gy - 2, w - 4, 1);
    ctx.fillStyle = '#fff6dc';
    ctx.globalAlpha = Math.min(1, 0.5 + 0.5 * k);
    ctx.fillRect(x - 2, gy - 1, 4, 1);
    if (!this.falling) {
      // grit sifting down from the loose stone to the spot it will land
      const top = Math.round(this.y - cy), len = gy - 3 - top;
      ctx.fillStyle = '#d8c8a8';
      for (let i = 0; i < 14; i++) {
        const yy = top + ((i * 23 + this.t * 80) % len);
        ctx.globalAlpha = (0.25 + 0.45 * k) * (1 - 0.6 * Math.abs((yy - top) / len - 0.5));
        ctx.fillRect(x + ((i * 3) % 5) - 2, Math.round(yy), 1, 2);
      }
    }
    ctx.globalAlpha = 1;
  }
}

export class EmberWave extends Entity {
  constructor(x, y, dir, dmg = 3) {
    super(x, y); this.dir = dir; this.facing = dir; this.hw = 12; this.h = 40; this.t = 0; this.team = 'playerShot';
    this.dmg = dmg;
    this.hitSet = new Set();
  }
  update(dt, world) {
    this.t += dt;
    this.x += this.dir * 230 * dt;
    if (world.hitEnemies(this.box(), this.dmg, this, { knock: 140, hitSet: this.hitSet, finisher: true }) && !this.struck) {
      // the first thing it hits gets a proper beat
      this.struck = true;
      world.hitstop(0.1);
      world.fx.flashScreen(0.3, '255,200,120');
      world.fx.shake(4, 0.2);
    }
    if (Math.random() < 0.9) world.fx.burst(this.x - this.dir * 6, this.y - rand(4, 36), 1, { color: ['#ffd36a', '#ff8a3a'], speed: 20, life: 0.4, gravity: -30, glow: true });
    if (this.t > 0.55 || world.map.solidAtPx(this.x + this.dir * 10, this.y - 20)) this.dead = true;
    world.light(this.x, this.y - 20, 70, 0.8, '255,150,60');
  }
  draw(ctx, cx, cy) {
    const f = Math.min(4, Math.floor(this.t * 12));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const x = Math.round(this.x - cx), y = Math.round(this.y - cy);
    if (this.dir > 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.drawImage(img('fx/curved_orange'), f * 80, 0, 80, 64, -40, y - 60, 80, 64); }
    else ctx.drawImage(img('fx/curved_orange'), f * 80, 0, 80, 64, x - 40, y - 60, 80, 64);
    ctx.restore();
  }
}
