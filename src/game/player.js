import { Entity, rand, approach, clamp } from './entity.js';
import { input } from '../engine/input.js';
import { bake, drawChar, ROWS, Anim } from '../engine/sprite.js';
import { onPlank, touchesSpikes, T, SOLID } from '../engine/tiles.js';
import { sfx } from '../engine/audio.js';
import { CAST, SWORDS } from './data.js';
import { EmberWave } from './enemies.js';
import { img, need, canvas } from '../engine/assets.js';

const SLASH = [['#f0e0c0', '#b08a5a'], ['#e8f0ff', '#8aa0c8'], ['#fff0a0', '#e0a030']];

// fx/swing: 3 frames x 2 rows (normal, finisher) of 64x64, facing left, drawn in greys
// (255 edge, 200 core, 140 trail) that are swapped once per sword for its SLASH colours.
need('fx/swing');
const swingSheets = [];
function swingSheet(sword) {
  if (swingSheets[sword]) return swingSheets[sword];
  const src = img('fx/swing');
  const [c, g] = canvas(src.width, src.height);
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  const [core, edge] = (SLASH[sword] || SLASH[0]).map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3] || px[i] > 230) continue;
    const col = px[i] > 170 ? core : edge;
    px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2];
  }
  g.putImageData(d, 0, 0);
  return (swingSheets[sword] = c);
}

const RUN = 118, ACC_G = 1150, DEC_G = 1500, ACC_A = 820, DEC_A = 420;
const JUMP_V = 318, GRAV = 860, FALL_MULT = 1.4, MAX_FALL = 400, CUT = 0.45;
// short cooldown; stamina (3 of 10 per dash) is what limits spam, so dash-in, slash, dash-out works
const DASH_V = 290, DASH_T = 0.19, DASH_CD = 0.2, DASH_COST = 3;
const COYOTE = 0.1, JUMP_BUF = 0.13, DASH_BUF = 0.12;
// per-frame durations of the 6-frame swing; the finisher winds up longer and lunges
const SWING = [0.035, 0.045, 0.045, 0.04, 0.07, 0.1];
const FINISH = [0.05, 0.06, 0.07, 0.05, 0.09, 0.14];
const NULL_INPUT = { down: () => false, pressed: () => false, released: () => false, axisX: () => 0 };

export class Player extends Entity {
  constructor(game, x, y) {
    super(x, y);
    this.game = game;
    this.hw = 6; this.h = 34;
    this.facing = 1;
    this.team = 'player';
    this.state = 'normal';
    this.anim = new Anim();
    this.coyote = 0; this.jumpBuf = 0; this.dashBuf = 0; this.dashAtk = false; this.dashAtkBuf = 0; this.emberQueued = false;
    this.inv = 0; this.flashT = 0;
    this.dashCd = 0; this.dashT = 0; this.airDash = true;
    this.combo = 0; this.atkT = 0; this.atkQueued = false; this.comboT = 0;
    this.hitSet = new Set();
    this.ghosts = []; this.ghostT = 0;
    this.stamina = 10;
    this.lastSafe = { x, y };
    this.dropT = 0; this.downT = 0;
    this.stateT = 0;
    this.wasGround = true; this.prevVy = 0;
    this.locked = false;   // cutscenes / dialog
    this.buf = {};
    this.rebake();
  }

  get s() { return this.game.save; }

  rebake() {
    this.baked = bake(CAST.hero(SWORDS[this.s.sword].id, this.s.lantern));
  }

  /** Called on frozen (hitstop) ticks so presses made during the freeze aren't lost. */
  bufferInputs(world) {
    if (this.locked || world.inputLocked) return;
    for (const a of ['attack', 'jump', 'dash', 'potion']) if (input.pressed(a)) this.buf[a] = true;
    if (input.released('jump')) this.buf.jumpUp = true;
  }

  update(dt, world) {
    const raw = this.locked || world.inputLocked ? NULL_INPUT : input;
    const buf = this.buf; this.buf = {};
    const inp = {
      down: (a) => raw.down(a),
      pressed: (a) => raw.pressed(a) || !!buf[a],
      released: (a) => raw.released(a) || (a === 'jump' && !!buf.jumpUp),
      axisX: () => raw.axisX(),
    };
    this.inv = Math.max(0, this.inv - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.comboT = Math.max(0, this.comboT - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.stateT += dt;
    if (this.state !== 'dash') this.stamina = Math.min(10, this.stamina + dt * 4.5);
    this.ghosts.forEach((g) => (g.t += dt));
    this.ghosts = this.ghosts.filter((g) => g.t < 0.22);
    if (this.swing && (this.swing.t += dt) >= this.swing.dt * 3) this.swing = null;

    if (this.state === 'dead') return this.updateDead(dt, world);
    if (this.state === 'drink') {
      this.vx = approach(this.vx, 0, DEC_G * dt);
      this.physics(dt, world, GRAV, MAX_FALL);
      this.anim.play('idle');
      this.anim.update(dt, ROWS.idle);
      if (this.stateT > 0.45) this.state = 'normal';
      return;
    }

    if (inp.pressed('jump')) this.jumpBuf = JUMP_BUF;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    // a dash pressed at any point in a swing is held until the swing's cancel window opens,
    // then decays like any other buffer (so a press you couldn't afford doesn't fire much later)
    if (inp.pressed('dash')) this.dashBuf = DASH_BUF;
    else if (this.state !== 'attack' || this.anim.frame >= 4) this.dashBuf = Math.max(0, this.dashBuf - dt);
    if (!this.dashBuf) this.dashAtkBuf = 0;   // an attack waiting on a dash dies with the dash press
    if (this.onGround) { this.coyote = COYOTE; this.airDash = true; }
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.state === 'normal') this.updateNormal(dt, world, inp);
    else if (this.state === 'attack') this.updateAttack(dt, world, inp);
    else if (this.state === 'dash') this.updateDash(dt, world, inp);
    else if (this.state === 'hurt') {
      this.physics(dt, world, GRAV, MAX_FALL);
      this.vx = approach(this.vx, 0, 300 * dt);
      if (this.stateT > 0.28) this.state = 'normal';
    }

    // landing feedback
    if (this.onGround && !this.wasGround && this.prevVy > 160) {
      sfx('land');
      world.fx.burst(this.x, this.y - 1, 6, { color: world.dustColor, speed: 40, life: 0.35, gravity: 60, angle: -Math.PI / 2, spread: 2.6 });
    }
    this.wasGround = this.onGround;
    this.prevVy = this.vy;

    // hazards
    if (touchesSpikes(world.map, this)) this.hazard(world, 2);
    else if (this.y - this.h > world.map.ph + 40) this.hazard(world, 2);
    else if (this.onGround && this.state === 'normal') this.markSafe(world);

    // camera look-down
    if (this.onGround && inp.down('down') && Math.abs(this.vx) < 5) this.downT += dt; else this.downT = 0;
  }

  markSafe(world) {
    const m = world.map, ty = Math.floor((this.y + 1) / T);
    const l = m.get(Math.floor((this.x - this.hw - 4) / T), ty), r = m.get(Math.floor((this.x + this.hw + 4) / T), ty);
    if (l === SOLID && r === SOLID) this.lastSafe = { x: this.x, y: this.y };
  }

  hazard(world, dmg) {
    if (this.state === 'dead' || world.fading) return;
    const alive = this.hurt(dmg, this.x - this.facing, world, true);
    if (alive) world.respawnSafe();
  }

  updateNormal(dt, world, inp) {
    const ax = inp.axisX();
    const target = ax * RUN;
    const acc = this.onGround ? (ax ? ACC_G : DEC_G) : (ax ? ACC_A : DEC_A);
    // turning on the ground is snappier than speeding up
    const turning = ax && Math.sign(ax) !== Math.sign(this.vx) && this.vx !== 0;
    this.vx = approach(this.vx, target, acc * (turning ? 1.6 : 1) * dt);
    if (ax) this.facing = ax;

    // drop through planks
    if (this.onGround && inp.down('down') && this.jumpBuf > 0 && onPlank(world.map, this)) {
      this.dropT = 0.22; this.jumpBuf = 0; this.coyote = 0; this.y += 1;
    } else if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = -JUMP_V; this.jumpBuf = 0; this.coyote = 0; this.onGround = false;
      sfx('jump');
      world.fx.burst(this.x, this.y - 1, 5, { color: world.dustColor, speed: 30, life: 0.3, gravity: 40, angle: Math.PI / 2, spread: 2 });
    }
    if (inp.released('jump') && this.vy < -60) this.vy *= CUT;

    let g = this.vy > 0 ? GRAV * FALL_MULT : GRAV;
    if (Math.abs(this.vy) < 45 && inp.down('jump')) g *= 0.55; // a little hang at the apex
    this.physics(dt, world, g, MAX_FALL, this.dropT > 0);

    // dash + attack together (same tick, or attack while a dash press is buffered) is a dash-attack,
    // not a rooted swing: dash now and latch the attack, or wait out the last sliver of cooldown
    if (inp.pressed('attack') && this.dashBuf > 0) {
      if (this.tryDash(world, inp, inp.pressed('dash'))) { this.dashAtk = true; return; }
      if (this.dashCd > 0 && this.dashCd <= this.dashBuf && this.stamina >= DASH_COST && (this.onGround || this.airDash)) {
        this.dashBuf = Math.max(this.dashBuf, this.dashCd + 0.02);   // committed: outlive the cooldown
        this.dashAtkBuf = this.dashBuf; return;
      }
    }
    if (inp.pressed('attack') && inp.down('up') && this.s.ember >= 10) return this.emberStrike(world);
    if (inp.pressed('attack') || (this.atkQueued && this.comboT > 0)) return this.startAttack(world);
    if (this.dashBuf > 0) this.tryDash(world, inp, inp.pressed('dash'));
    if (inp.pressed('potion')) this.drink(world);

    // animation
    if (this.onGround) {
      const sp = Math.abs(this.vx);
      if (sp < 10) this.anim.play('idle');
      else if (sp < 80) this.anim.play('walk');
      else this.anim.play('run');
      this.anim.speed = this.anim.name === 'run' ? clamp(sp / RUN, 0.6, 1.1) : 1;
      const prev = this.anim.frame;
      this.anim.update(dt, ROWS[this.anim.name]);
      if ((this.anim.name === 'run' || this.anim.name === 'walk') && prev !== this.anim.frame && (this.anim.frame === 1 || this.anim.frame === 5)) {
        sfx('step');
        if (this.anim.name === 'run' && Math.random() < 0.5) world.fx.burst(this.x - this.facing * 4, this.y - 1, 2, { color: world.dustColor, speed: 16, life: 0.3, gravity: 20, angle: -Math.PI / 2, spread: 1.5 });
      }
    } else {
      this.anim.speed = 1;
      if (this.vy < 0) { this.anim.play('jump'); this.anim.frame = this.vy < -200 ? 1 : this.vy < -90 ? 2 : 3; }
      else { this.anim.play('fall'); this.anim.update(dt, ROWS.fall); }
    }
  }

  /** A failed dash changes nothing (no turn, no combo reset). fresh: the press is this tick's. */
  tryDash(world, inp, fresh = true) {
    if (this.dashCd > 0 || this.stamina < DASH_COST) { if (fresh && this.stamina < DASH_COST) world.ui.flashStamina(); return false; }
    if (!this.onGround && !this.airDash) return false;
    if (!this.onGround) this.airDash = false;
    const ax = inp ? inp.axisX() : 0;
    if (ax) this.facing = ax;   // dash where the stick points, so a dash-cancel can retreat
    this.dashAtk = this.dashAtkBuf > 0; this.dashBuf = 0; this.dashAtkBuf = 0;
    this.state = 'dash'; this.stateT = 0; this.dashT = DASH_T;
    this.stamina -= DASH_COST;
    this.vx = this.facing * DASH_V; this.vy = 0;
    sfx('dash'); input.rumble('dash');
    world.fx.burst(this.x, this.y - 10, 8, { color: ['#dfe8ff', '#9fb4e8'], speed: 50, life: 0.3, gravity: 0, angle: this.facing > 0 ? Math.PI : 0, spread: 1 });
    return true;
  }

  updateDash(dt, world, inp) {
    this.dashT -= dt;
    this.vx = this.facing * DASH_V;
    this.vy = 0;
    this.physics(dt, world, 0, MAX_FALL, this.dropT > 0);
    this.ghostT -= dt;
    if (this.ghostT <= 0) { this.ghostT = 0.03; this.ghosts.push({ x: this.x, y: this.y, f: this.facing, t: 0, anim: 'run', frame: 2 }); }
    this.anim.play('run'); this.anim.frame = 2;
    // an attack pressed anywhere in the dash is latched: it cancels the dash as soon as the
    // window opens (0.076s in), or comes out the moment the dash ends
    if (inp.pressed('attack')) this.dashAtk = true;
    const over = this.dashT <= 0 || this.hitWall;
    if (over) {
      this.state = 'normal'; this.dashCd = DASH_CD; this.vx *= 0.55;
      this.inv = Math.max(this.inv, 0.05);
    }
    if (this.dashAtk && (over || this.dashT < DASH_T * 0.6)) {
      this.dashAtk = false;
      this.state = 'normal'; this.dashCd = DASH_CD;
      if (inp.down('up') && this.s.ember >= 10) this.emberStrike(world); else this.startAttack(world);
    }
  }

  startAttack(world) {
    if (this.state === 'attack') return;
    if (this.comboT <= 0) this.combo = 0;
    this.atkQueued = false;
    this.dashBuf = 0;   // a new swing is a new commitment: stale dash presses don't carry into it
    this.state = 'attack'; this.stateT = 0; this.atkT = 0; this.swung = false;
    this.hitSet.clear();
    this.anim.play('attack', true);
    const fin = this.combo === 2;
    sfx(fin ? 'swing3' : 'swing');
    if (this.onGround) this.vx *= 0.35;
  }

  enemyNear(world, r) {
    for (const e of world.entities) {
      if (e.team !== 'enemy' || e.dead || e.dying) continue;
      if (Math.sign(e.x - this.x) === this.facing && Math.abs(e.x - this.x) - (e.hw || 8) < r && Math.abs(e.y - this.y) < 40) return true;
    }
    return false;
  }

  /** Up + Attack with a full ember meter: a fiery crescent that flies across the screen. */
  emberStrike(world) {
    if (this.s.ember < 10) return;
    this.s.ember = 0;
    input.rumble('crit', 1.2);
    this.atkQueued = false;
    this.startAttack(world);
    this.combo = 2;
    // twice the blade plus two: 4 / 6 / 8 by sword, worth more than the combo it costs
    world.spawn(new EmberWave(this.x + this.facing * 16, this.y - 4, this.facing, SWORDS[this.s.sword].dmg * 2 + 2));
    sfx('whoosh');
    world.fx.shake(3, 0.2);
    world.fx.flashScreen(0.25, '255,170,80');
  }

  updateAttack(dt, world, inp) {
    const fin = this.combo === 2;
    const tl = fin ? FINISH : SWING;
    this.atkT += dt;
    let acc = 0, f = 0;
    for (f = 0; f < tl.length; f++) { acc += tl[f]; if (this.atkT < acc) break; }
    const ax = inp.axisX();
    if (ax && f <= 1) this.facing = ax;

    if (this.onGround) {
      if (fin && (f === 3 || f === 4)) this.vx = this.enemyNear(world, 28) ? 0 : this.facing * 105;
      else if (f >= 3 && f <= 4) this.vx = this.facing * 30;
      else this.vx = approach(this.vx, 0, 900 * dt);
    } else {
      this.vx = approach(this.vx, ax * RUN, ACC_A * 0.6 * dt);
    }
    const g = this.vy > 0 ? GRAV * 1.1 : GRAV;
    this.physics(dt, world, this.onGround ? GRAV : g * (f >= 3 && f <= 4 ? 0.5 : 1), MAX_FALL, this.dropT > 0);

    if (inp.pressed('attack')) {
      this.atkQueued = true;
      // Up + Attack mid-combo: the ember strike replaces the next swing
      if (inp.down('up') && this.s.ember >= 10) this.emberQueued = true;
    }
    if (inp.pressed('jump')) this.jumpBuf = JUMP_BUF;

    // active frames
    if (f === 3 || f === 4) {
      const reach = fin ? 42 : 38;   // fx/swing's outer edge is drawn on exactly this line (see drawSlash)
      if (!this.swung) {
        this.swung = true;
        this.swing = { t: 0, dt: fin ? 0.06 : 0.05, fin, facing: this.facing, sword: this.s.sword };
      }
      const box = this.facing > 0
        ? { x0: this.x + 2, x1: this.x + reach, y0: this.y - 52, y1: this.y - 2 }
        : { x0: this.x - reach, x1: this.x - 2, y0: this.y - 52, y1: this.y - 2 };
      const dmg = SWORDS[this.s.sword].dmg + (fin ? 1 : 0);
      const hits = world.hitEnemies(box, dmg, this, { knock: fin ? 190 : 55, hitSet: this.hitSet, finisher: fin });
      if (hits > 0) {
        const was = this.s.ember;
        this.s.ember = Math.min(10, this.s.ember + hits * (fin ? 1 : 0.75));
        if (was < 10 && this.s.ember >= 10 && !this.s.flags.emberHint) {
          this.s.flags.emberHint = true;
          world.ui.showHint(`Ember full! Hold Up and press ${input.label('attack')} to unleash it.`, 5);
        }
        if (!this.onGround && this.vy > -40) this.vy = -120; // a little air-juggle hop
      }
    }
    this.anim.frame = Math.min(f, 5);

    const total = tl.reduce((a, b) => a + b, 0);
    // cancels
    if (f >= 5 && this.jumpBuf > 0 && this.coyote > 0) {
      this.state = 'normal'; this.combo = 0; this.comboT = 0;
      this.vy = -JUMP_V; this.jumpBuf = 0; this.coyote = 0; sfx('jump');
      return;
    }
    // dash-cancel from the swing's recovery; presses from earlier in the swing are buffered
    if (f >= 4 && this.dashBuf > 0 && this.tryDash(world, inp, inp.pressed('dash'))) { this.combo = 0; this.emberQueued = false; return; }
    if (this.atkT >= total) {
      this.state = 'normal';
      if (this.emberQueued) { this.emberQueued = false; this.emberStrike(world); }
      else if (this.atkQueued && this.combo < 2) { this.combo++; this.comboT = 0.2; this.startAttack(world); }
      else { this.combo = this.combo < 2 ? this.combo + 1 : 0; this.comboT = this.combo ? 0.32 : 0; this.atkQueued = false; }
    }
  }

  drink(world) {
    const s = this.s;
    if (s.potions <= 0) { world.ui.toast('No potions left', 'potion'); sfx('deny'); return; }
    if (s.hp >= s.maxHp) { world.ui.toast('Already at full health', 'heart'); sfx('deny'); return; }
    s.potions--;
    s.hp = Math.min(s.maxHp, s.hp + 5);
    input.rumble('heal');
    this.state = 'drink'; this.stateT = 0;
    sfx('heal');
    world.fx.sprite('buff', this.x, this.y, { follow: this });
    world.fx.text(this.x, this.y - 44, '+5', '#7dff8a');
  }

  /** Returns false if this killed the player. */
  hurt(dmg, srcX, world, ignoreInv = false) {
    if (this.state === 'dead') return false;
    if (!ignoreInv && (this.inv > 0 || this.state === 'dash')) return true;
    if (!ignoreInv && world.inputLocked && !world.fading) return true;   // no cheap hits during cutscenes
    const s = this.s;
    s.hp = Math.max(0, s.hp - dmg);
    this.inv = 1.0; this.flashT = 0.12;
    const dir = Math.sign(this.x - srcX) || -this.facing;
    this.vx = dir * 150; this.vy = -170;
    this.state = 'hurt'; this.stateT = 0; this.combo = 0; this.emberQueued = false; this.atkQueued = false;
    sfx('hurt'); input.rumble('hurt');
    world.fx.shake(4, 0.25);
    world.hitstop(0.07);
    world.fx.flashScreen(0.25, '255,40,40');
    world.fx.sprite('blood', this.x, this.y);
    world.fx.text(this.x, this.y - 44, `-${dmg}`, '#ff6b6b');
    if (s.hp <= 0) { this.die(world); return false; }
    return true;
  }

  die(world) {
    this.state = 'dead'; this.stateT = 0; this.vx = 0;
    this.anim.play('death', true);
    sfx('death'); input.rumble('death');
    world.hitstop(0.25);
    this.s.deaths++;
  }

  updateDead(dt, world) {
    this.physics(dt, world, GRAV, MAX_FALL);
    this.anim.update(dt, ROWS.death, false);
    if (this.stateT > 2.2 && !world.fading) world.game.onPlayerDeath();
  }

  lightPos() { return [this.x + this.facing * 5, this.y - 16]; }

  draw(ctx, cx, cy) {
    for (const g of this.ghosts) {
      drawChar(ctx, this.baked, g.anim, g.frame, g.x - cx, g.y - cy, g.f, { white: true, alpha: 0.35 * (1 - g.t / 0.22) });
    }
    const blink = this.inv > 0 && this.state !== 'dead' && Math.floor(this.inv * 14) % 2 === 0;
    let anim = this.anim.name, frame = this.anim.frame;
    if (this.state === 'hurt') { anim = 'fall'; frame = 0; }
    drawChar(ctx, this.baked, anim, frame, this.x - cx, this.y - cy, this.facing, { alpha: blink ? 0.45 : 1 });
    if (this.flashT > 0) drawChar(ctx, this.baked, anim, frame, this.x - cx, this.y - cy, this.facing, { white: true, alpha: 0.8 });
  }

  /** Drawn after the darkness pass so the blade trail always reads. */
  drawLit(ctx, cx, cy) { this.drawSlash(ctx, cx, cy); }

  /** The swing crescent (fx/swing), spawned on the first hit frame and played for 3 frames.
   *  The sheet's pivot (46, 32) goes on the hitbox's back edge (x -/+ 2) at its middle (y - 27),
   *  which puts the crescent's outer edge exactly on the hitbox: 38 px ahead (42 on the finisher),
   *  y - 52 .. y - 2. The sheet faces left; it is mirrored when the swing faced right. */
  drawSlash(ctx, cx, cy) {
    const sw = this.swing;
    if (!sw) return;
    const fr = Math.min(2, Math.floor(sw.t / sw.dt));
    ctx.save();
    ctx.translate(Math.round(this.x - cx) + sw.facing * 2, Math.round(this.y - cy) - 27);
    if (sw.facing > 0) ctx.scale(-1, 1);
    ctx.drawImage(swingSheet(sw.sword), fr * 64, sw.fin ? 64 : 0, 64, 64, -46, -32, 64, 64);
    ctx.restore();
  }
}
