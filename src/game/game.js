// Top-level state: title, play, ending. Save data, level travel, loot.
import { input } from '../engine/input.js';
import { sfx, music, unlock, toggleMute, soundReady, isMuted } from '../engine/audio.js';
import { drawText } from '../engine/font.js';
import { UI, W, H, panel, bigText, icon } from './ui.js';
import { buildLevel, drawTownSky } from './levels.js';
import { SWORDS, ICON } from './data.js';

const KEY = 'hollowbound-save-v1';

export function freshSave() {
  return {
    v: 1, hp: 10, maxHp: 10, coins: 0, potions: 1, sword: 0, lantern: false, ember: 0, relic: false,
    chests: [], ores: [], taken: [], killed: [], fires: {}, flags: {}, kills: 0, deaths: 0, treasure: 0, time: 0,
    checkpoint: { level: 'town', spawn: 'start' },
  };
}

export class Game {
  constructor() {
    this.ui = new UI(this);
    this.state = 'title';
    this.save = freshSave();
    this.world = null;
    this.t = 0;
    this.titleSel = 0;
    this.hasSave = false;
    try { this.hasSave = !!localStorage.getItem(KEY); } catch (e) { /* storage blocked: play without saves */ }
    this.endT = 0;
  }

  // ------------------------------------------------------------ save
  writeSave() {
    try { localStorage.setItem(KEY, JSON.stringify(this.save)); this.hasSave = true; } catch (e) { /* private mode */ }
  }
  readSave() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return Object.assign(freshSave(), s); } catch (e) { /* corrupt */ }
    return null;
  }

  newGame() {
    this.save = freshSave();
    this.writeSave();
    this.enter('town', 'start', true);
  }
  continueGame() {
    this.save = this.readSave() || freshSave();
    this.save.hp = this.save.maxHp;
    const cp = this.save.checkpoint;
    this.enter(cp.level, cp.spawn, true);
  }
  toTitle() {
    this.writeSave();
    this.state = 'title'; this.world = null; this.titleSel = 0;
    music('town');
  }

  enter(level, spawn, banner = true) {
    this.world = buildLevel(this, level, spawn);
    this.state = 'play';
    this.ui.boss = null;
    this.ui.queue = null; this.ui.shopState = null; this.ui.hintT = 0; this.ui.paused = false;
    if (banner) this.ui.banner(this.world.def.title, this.world.def.subtitle);
    else this.ui.bannerText = null;
    music(this.world.def.music);
    input.swallow();
  }

  travel(level, spawn) {
    const w = this.world;
    if (!w || w.travelling) return;
    w.travelling = true;
    w.fadeOut(() => {
      this.writeSave();
      this.enter(level, spawn, level !== w.id);
    }, 2.6);
  }

  rest(src, msg) {
    const s = this.save;
    s.hp = s.maxHp;
    s.potions = Math.max(s.potions, 2);   // a fire always sends you off with two draughts
    s.checkpoint = { level: this.world.id, spawn: src.spawnKey || 'campfire' };
    s.fires[this.world.id] = s.checkpoint.spawn;   // remembered per level, so a trip to town keeps it
    this.writeSave();
    sfx('heal');
    this.world.fx.sprite('buff', this.world.player.x, this.world.player.y, { follow: this.world.player });
    this.ui.toast(msg, 'heart');
  }

  onPlayerDeath() {
    const w = this.world;
    w.fadeOut(() => {
      this.save.hp = this.save.maxHp;
      this.save.potions = Math.max(this.save.potions, 2);
      const cp = this.save.checkpoint;
      this.enter(cp.level, cp.spawn, false);
      this.ui.toast('You wake, aching, by a warm light.', 'heart');
    }, 1.2);
  }

  onSecret() {
    sfx('gem');
    this.ui.toast('A hidden passage!', 'key');
  }

  swordSpark() { return SWORDS[this.save.sword].spark; }

  giveLoot(loot, from) {
    const s = this.save, w = this.world;
    if (loot.coins) w.dropCoins(from.x, from.y - 14, loot.coins);
    const item = loot.item;
    if (!item) return;
    sfx('fanfare');
    if (item === 'potion') {
      if (s.potions >= 5) { w.dropCoins(from.x, from.y - 14, 8); this.ui.toast('Satchel full. The draught was worth 8 coins.', 'coins'); }
      else { s.potions++; this.ui.toast('Found a Healing Draught!', 'potion'); }
    }
    else if (item === 'heart') { s.maxHp += 2; s.hp = s.maxHp; this.ui.toast('Heart Charm! Max health +2', 'heart'); }
    else if (item === 'golden_sword') {
      s.sword = 2; w.player.rebake();
      this.ui.dialog([{ who: null, text: 'You found the GOLDEN SWORD! Old Durn\'s blade, light as a feather and twice as sharp. (Damage 3)' }]);
    } else if (item === 'relic') {
      s.relic = true;
      this.ui.dialog([{ who: null, text: 'You recovered the HEARTHSTONE! Warm as a sleeping cat. Emberwick\'s forge-fire will burn again.' }]);
    }
  }

  buySword() {
    this.save.sword = Math.max(this.save.sword, 1);
    this.world.player.rebake();
    this.ui.toast('Equipped the Iron Sword (Damage 2)', 'sword');
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    this.t += dt;
    input.menuMode = this.state === 'title' || this.ui.busy;   // pad directions auto-repeat in menus
    input.pads.playing = this.state !== 'title';
    input.update();
    if (input.pressed('mute')) toggleMute();
    if (this.state === 'title') return this.updateTitle(dt);
    if (this.state === 'ending') return this.updateEnding(dt);
    const w = this.world;
    if (!this.ui.busy) this.save.time += dt;   // the clock on the end card is play time only
    if (input.pressed('pause') && !this.ui.queue && !this.ui.shopState && !this.ui.paused) {
      this.ui.paused = true; this.ui.pauseSel = 0; sfx('pause'); input.swallow();
    }
    this.ui.update(dt);
    w.update(dt);
    if (w.next) { const n = w.next; w.next = null; n(); }
  }

  titleOptions() {
    if (this.confirmNew) {
      return [
        { label: 'Cancel', fn: () => { this.confirmNew = false; this.titleSel = 0; } },
        { label: 'Erase save, start over', fn: () => { this.confirmNew = false; this.newGame(); } },
      ];
    }
    const o = [];
    if (this.hasSave) o.push({ label: 'Continue', fn: () => this.continueGame() });
    o.push({ label: 'New Game', fn: () => (this.hasSave ? ((this.confirmNew = true), (this.titleSel = 0)) : this.newGame()) });
    return o;
  }

  updateTitle() {
    const o = this.titleOptions();
    if (input.pressed('up')) { this.titleSel = (this.titleSel + o.length - 1) % o.length; sfx('select'); }
    if (input.pressed('down')) { this.titleSel = (this.titleSel + 1) % o.length; sfx('select'); }
    this.titleSel = Math.min(this.titleSel, o.length - 1);
    if (input.ok()) { unlock(); sfx('confirm'); o[this.titleSel].fn(); input.swallow(); }
  }

  startEnding() {
    this.state = 'ending'; this.endT = 0;
    this.world.inputLocked = true;   // the town plays on behind the card, but the hero stands still
    this.ui.queue = null; this.ui.shopState = null; this.ui.paused = false; this.ui.showControls = false;
    music('victory');
    this.writeSave();
  }

  updateEnding(dt) {
    this.endT += dt;
    this.world.update(dt);
    if (this.endT > 4 && input.ok()) {
      // rebuild the town so it's dusk, the forge is lit and everyone's where they should be
      const p = this.world.player, at = { x: p.x, y: p.y, facing: p.facing };
      this.enter('town', 'start', false);
      const np = this.world.player;
      np.x = at.x; np.y = at.y; np.facing = at.facing;
      this.world.cam.snap(np.x, np.y, this.world.bounds, this.world.def.camFrame);
      this.world.fadeA = 0; this.world.fadeDir = 0;
    }
  }

  // ------------------------------------------------------------ draw
  draw(ctx) {
    ctx.imageSmoothingEnabled = false;
    if (this.state === 'title') return this.drawTitle(ctx);
    const w = this.world;
    w.draw(ctx);
    if (this.state !== 'ending') {
      this.ui.drawHUD(ctx, w);
      this.ui.drawDialog(ctx);
      this.ui.drawShop(ctx);
    }
    w.drawFade(ctx);
    if (this.state === 'ending') this.drawEnding(ctx);
    this.ui.drawPause(ctx);
  }

  drawTitle(ctx) {
    drawTownSky(ctx, this.t * 14, 40, this.t, 0, true);
    ctx.fillStyle = 'rgba(14,10,20,0.35)';
    ctx.fillRect(0, 0, W, H);
    const bob = Math.round(Math.sin(this.t * 1.5) * 2);
    bigText(ctx, 'HOLLOWBOUND', W / 2, 52 + bob, 4, '#ffe6b0', '#3a1c14');
    drawText(ctx, 'a tale of Emberwick and the mine below', W / 2, 108, '#e8d8c0', { align: 'center', shadow: '#1a1014' });
    const o = this.titleOptions();
    if (this.confirmNew) drawText(ctx, 'Start over? Your saved journey will be lost.', W / 2, 134, '#ffb0a0', { align: 'center', shadow: '#1a1014' });
    o.forEach((op, i) => {
      const sel = i === this.titleSel;
      const y = 150 + i * 18;
      if (sel) { panel(ctx, W / 2 - 60, y - 5, 120, 17, 0.8); }
      drawText(ctx, op.label, W / 2, y, sel ? '#ffd36a' : '#c8b8a0', { align: 'center', shadow: '#1a1014' });
    });
    if (!this.confirmNew && Math.floor(this.t * 2) % 2 === 0) drawText(ctx, `Press ${input.label('jump')} to begin`, W / 2, 210, '#f4ead2', { align: 'center', shadow: '#1a1014' });
    // browsers only start sound for a tap or a key, never a controller button
    if (input.lastDevice === 'pad' && !soundReady() && !isMuted()) drawText(ctx, 'Tap the screen or press any key to turn on sound', W / 2, 226, '#c8a878', { align: 'center', shadow: '#1a1014' });
    const L = (a) => input.label(a);
    drawText(ctx, `Move: ${L('move')}   Jump: ${L('jump')}   Attack: ${L('attack')}   Dash: ${L('dash')}   Talk: ${L('interact')}   Potion: ${L('potion')}`, W / 2, H - 14, '#a89a88', { align: 'center', shadow: '#1a1014' });
  }

  drawEnding(ctx) {
    const t = this.endT;
    const a = Math.min(0.72, t * 0.4);
    ctx.fillStyle = `rgba(10,6,14,${a})`;
    ctx.fillRect(0, 0, W, H);
    if (t < 1) return;
    ctx.globalAlpha = Math.min(1, (t - 1) / 1);
    bigText(ctx, 'EMBERWICK IS SAFE', W / 2, 48, 3, '#ffe6b0', '#3a1c14');
    const s = this.save;
    const mins = Math.floor(s.time / 60), secs = Math.floor(s.time % 60);
    const rows = [
      ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
      ['Treasure found', `${s.treasure} / 5`],
      ['Secrets', s.flags.secret ? '1 / 1' : '0 / 1'],
      ['Coins', String(s.coins)],
      ['Foes felled', String(s.kills)],
      ['Falls', String(s.deaths)],
    ];
    panel(ctx, W / 2 - 100, 92, 200, rows.length * 13 + 14, 0.85);
    rows.forEach(([k, v], i) => {
      drawText(ctx, k, W / 2 - 88, 100 + i * 13, '#c8b8a0');
      drawText(ctx, v, W / 2 + 88, 100 + i * 13, '#ffd36a', { align: 'right' });
    });
    drawText(ctx, 'Thank you for playing.', W / 2, 190, '#f4ead2', { align: 'center' });
    if (t > 4 && Math.floor(t * 2) % 2 === 0) drawText(ctx, `Press ${input.label('jump')} to keep exploring`, W / 2, 210, '#a89a88', { align: 'center' });
    ctx.globalAlpha = 1;
  }
}
