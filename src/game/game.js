// The flow of the game: boot, new/continue, the frame loop, the player's hands on the
// hero, portals, dungeons and raids, death, saving. UI lives in src/ui and talks to this
// module through G.game (see src/ui/README in the header of ui/ui.js) and G.events.
import { G, emit, rnd, ri, pick, chance, clamp } from '../state.js';
import { down, hit as pressed, endFrame, pollPad, lastInput } from '../core/input.js';
import { audio } from '../core/audio.js';
import { Hero, autoSpend, grantSkills } from './actor.js';
import { Bot, tickMob } from './brain.js';
import { cast, ready, tickSummon } from './skillrun.js';
import { tickDots, tickDrops, heal, floater, levelFx, sfxAt } from './combat.js';
import { SKILLS, xpToNext, CLASSES, classWeapon } from '../data/game.js';
import { loadMap, tickMap, bossAdds, MAP_BY_ID, DUNGEON_BY_ID } from '../world/map.js';
import { MAPS, DUNGEONS } from '../data/world.js';
import { NPCS } from '../data/npcs.js';
import { loadBestiary, mobDef, BEST } from './bestiary.js';
import { bakeShapes, Particles, SHAPES } from '../gfx/fx.js';
import { Text } from '../gfx/text.js';
import { drawActor, drawOverlay, drawShadow, drawDrop } from '../gfx/draw.js';
import { drawBack, drawTerrain, drawFront, ambient } from '../gfx/scene.js';
import { loadNpcMeta, sweepLooks, heroSprite, mobSprite } from '../gfx/sprites.js';
import { loadHeldIndex } from '../gfx/herolook.js';
import * as Q from './quests.js';
import * as S from './social.js';
import { kitFor, makeGear, itemScore, canEquip, POTIONS, setNextItemId } from './items.js';
import { TAUNTS, MILESTONES } from '../data/velscour/taunts.js';
import { actions } from './actions.js';
import { Director } from './director.js';

const SAVE_KEY = 'velscour_hollowbound_v1';
// Pets: Velscour's 730 familiars trot behind their owners; yours also fetches loot.
function givePet(h, id, scope) { const def = mobDef(id); if (!def) return; const hw = Math.max(26, Math.min(46, def.hw * 0.62)); h.pet = { def, x: h.x - 40, y: h.y, t: Math.random() * 9, face: 1, sp: mobSprite(def, scope), k: hw / def.h, hop: 0 }; }
function tickPet(h, dt) {
  const p = h.pet, tx = h.x - h.face * 46, dx = tx - p.x; p.t += dt;
  if (Math.abs(dx) > 14) { p.x += Math.sign(dx) * Math.min(Math.abs(dx), (Math.abs(dx) > 300 ? 900 : 250) * dt); p.face = dx > 0 ? 1 : -1; p.hop = Math.abs(Math.sin(p.t * 9)) * 7; } else p.hop *= 0.8;
  p.y += (h.y - p.y) * Math.min(1, dt * 8);
}
function drawPet(rd, h, light) {
  const p = h.pet, sp = p.sp, r = sp.r; if (!r || r.layer < 0) return;
  const k = p.k * (1 + Math.sin(p.t * 2.2) * 0.02), f = p.face;
  rd.quad(SHAPES.shadow, p.x - 16, p.y - 4, 32, 9, [1, 1, 1, 0.7]);
  rd.affine(r, [k * f, 0, 0, k, p.x, p.y - p.hop], -sp.ax, -sp.ay, sp.w, sp.h, [light[0], light[1], light[2], h.alpha]);
}
export { givePet };
const dust = (a, n) => G.parts.burst(a.x, a.y - 2, n, { shape: 'smoke', speed: 70, life: 0.4, size: 14, size2: 34, col: [0.55, 0.5, 0.45], add: 0, a: 0.35, dir: -Math.PI / 2, arc: Math.PI, front: false });
const timers = [];
export const game = {
  ...actions,
  async boot() {
    bakeShapes(G.rd.atlas); G.text = new Text(G.rd.atlas); G.parts = new Particles();
    await Promise.all([loadBestiary(), loadNpcMeta(), loadHeldIndex()]);
    G.heroes = []; G.roster = S.makeRoster(7);
  },
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } },
  saveInfo() { try { const c = JSON.parse(localStorage.getItem(SAVE_KEY)); return c ? { name: c.name, cls: c.cls, lvl: c.lvl, map: MAP_BY_ID.get(c.map)?.name } : null; } catch { return null; } },
  save() {
    const c = G.char; if (!c) return;
    c.map = G.map && !G.map.instance ? G.map.def.id : c.map; c.playT = (c.playT || 0) + (G.time - (c._t0 || G.time)); c._t0 = G.time;
    c.roster = G.roster.map(f => [f.id, f.lvl, f.map, f.friend, f.companion ? 1 : 0, f.guild]);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(c, (k, v) => (k === '_t0' ? undefined : v))); } catch (e) { console.warn('save failed', e); }
  },
  deleteSave() { try { localStorage.removeItem(SAVE_KEY); } catch {} },
  async newGame({ name, cls }) {
    const c = { v: 1, name: name || 'Hero', cls, lvl: 1, xp: 0, sp: 0, equip: {}, ranks: {}, bar: [], autoSkills: true, gold: 60, bag: [], bagMax: 40, potions: { hp: 8, mp: 5 }, etc: {},
      quests: { active: {}, done: {} }, map: 'hh_square', guild: null, kills: 0, deaths: 0, settings: { ...G.settings }, autoGear: true };
    c.pet = pick(['bs1_0', 'bs1_3', 'wf0', 'bs2_1', 'bs1_7']);
    const kit = kitFor(cls, 1); c.equip = { weapon: kit.weapon, body: kit.body }; if (kit.offhand) c.equip.offhand = kit.offhand;
    for (const k in c.equip) c.equip[k].rarity = 0;
    await this.begin(c);
  },
  async loadGame() {
    const c = JSON.parse(localStorage.getItem(SAVE_KEY)); let mx = 1; for (const it of [...c.bag, ...Object.values(c.equip)]) if (it && it.id >= mx) mx = it.id + 1; setNextItemId(mx);
    for (const r of c.roster || []) { const f = G.roster[r[0]]; if (f) { f.lvl = r[1]; f.map = r[2]; f.friend = r[3]; f.companion = !!r[4]; f.guild = r[5] ?? f.guild; } }
    Object.assign(G.settings, c.settings || {});
    await this.begin(c);
  },
  async begin(c) {
    G.char = c; c._t0 = G.time;
    const P = G.player = new Hero(c, 0, 0); P.isPlayer = true; P.guild = c.guild ? c.guild.name : ''; P.guildColor = '#7ae0a0'; P.bot = new Bot(P); P.director = new Director(P);
    G.actors = [P]; G.party = []; G.auto = !!c.auto;
    for (const k of ['music', 'sfx', 'amb']) audio.setVolume(k, G.settings[k]);
    await this.travel(MAP_BY_ID.has(c.map) ? c.map : 'hh_square', null);
    // companions walk with you from the start
    for (const f of G.roster) if (f.companion) this.joinParty(f, true);
    G.mode = 'play'; emit('started', {});
    if (!Object.keys(c.quests.done).length && !Object.keys(c.quests.active).length) { const t = G.map.npcs.find(n => n.npcId === 'tobin'); if (t) { P.body.place(G.map.geo, t.x + 150); P.body.face = -1; G.cam.x = P.x - G.cam.viewW / 2; this.clampCam(); } }
    if (!Object.keys(c.quests.done).length && !Object.keys(c.quests.active).length) this.later(1.2, () => emit('toast', { text: 'Welcome to Herrington Hollow. Speak with Old Tobin.', kind: 'quest' }));
  },
  later(t, fn) { timers.push({ t, fn }); },

  // ---------------------------------------------------------------- travel
  async travel(id, from, inst) {
    G.loading = true; emit('loading', { on: true, name: MAP_BY_ID.get(id)?.name });
    G.rd.post.dark = 1;
    const M = await loadMap(id, from, inst || null);
    S.populate(M); Q.onMap(); Q.refreshMarks();
    G.heroes = G.actors.filter(a => a.kind === 'hero');
    const fam = BEST.groups.familiars || [];
    if (fam.length) for (const h of G.heroes) { const id = h.isPlayer ? G.char.pet : h.fake && (h.fake.seed % 100) < 38 ? fam[h.fake.seed % fam.length].id : null; if (id) givePet(h, id, 'map'); }
    const cam = G.cam; cam.x = G.player.x - cam.viewW / 2; cam.y = G.player.y - cam.viewH * 0.76; this.clampCam();
    G.loading = false; emit('loading', { on: false }); audio.sfx('portal');
    if (!inst) { G.char.map = id; const v = G.char.visited = G.char.visited || []; if (!v.includes(id)) v.push(id); this.save(); }
    if (M.def.kind === 'town') { const P = G.player; P.hp = P.maxHp; if (P.cls !== 'barbarian') P.mp = P.maxMp; }
    return M;
  },
  portalNear() { const P = G.player; let best = null; for (const po of G.map.portals) if (Math.abs(po.x - P.x) < 62 && Math.abs(po.y - P.y) < 30) best = po; return best; },
  async usePortal(po) {
    if (G.loading || !po) return;
    const M = G.map, inst = M.instance;
    if (po.dungeon) { emit('dungeonGate', { dungeon: DUNGEON_BY_ID.get(po.dungeon) }); return; }
    if (inst) {
      const i = inst.rooms.indexOf(M.def.id), ti = inst.rooms.indexOf(po.to);
      if (ti > i && !M.cleared) { emit('toast', { text: 'The way is sealed until the room is cleared.' }); audio.sfx('ui_error'); return; }
      if (ti < 0) { await this.leaveDungeon(); return; }
      inst.i = ti; await this.travel(po.to, M.def.id, inst); S.partyLine(ti === inst.rooms.length - 1 ? 'boss_start' : 'pull', { boss: inst.bossName, dungeon: inst.name }); return;
    }
    const tgt = MAP_BY_ID.get(po.to); if (!tgt) return;
    if (tgt.kind === 'hall' && !G.char.guild) { emit('toast', { text: 'The Charterhouse opens only to chartered guilds. Speak with the registrar.' }); audio.sfx('ui_error'); return; }
    await this.travel(po.to, M.def.id);
  },
  async enterDungeon(id) {
    const D = DUNGEON_BY_ID.get(id); if (!D) return;
    const P = G.player, size = D.party || 5, raid = D.kind === 'raid';
    // fill the party from players looking for a group
    const have = G.actors.filter(a => a.kind === 'hero' && a.inParty).length + 1;
    const pool = G.roster.filter(f => !f.inParty && !f.companion).sort(() => Math.random() - 0.5);
    const want = ['paladin', 'lancer', 'bard', 'totem_master'];      // a wall and a mender first, if any are about
    pool.sort((a, b) => (want.includes(b.cls) ? 1 : 0) - (want.includes(a.cls) ? 1 : 0));
    for (let i = have; i < size && pool.length; i++) { const f = pool.shift(); this.joinParty(f, false, Math.max(D.level, Math.min(P.lvl, D.level + 4)) + ri(-1, 1), true); }
    const inst = { id, name: D.name, raid, level: Math.max(D.level, Math.min(P.lvl - 1, D.level + 6)), rooms: D.rooms, i: 0, bossName: D.boss?.name, from: G.map.def.id };
    emit('toast', { text: (raid ? 'Raid formed: ' : 'Party formed: ') + D.name, kind: 'quest' });
    await this.travel(D.rooms[0], G.map.def.id, inst);
    S.partyLine('form', { dungeon: D.name, boss: inst.bossName });
  },
  async leaveDungeon() {
    const inst = G.map.instance; if (!inst) return;
    for (const h of G.actors.filter(a => a.kind === 'hero' && a.inParty && a.tempParty)) this.leaveParty(h, true);
    await this.travel(inst.from, inst.id);
  },
  bossAdds(m, n) { bossAdds(G.map, m, n); },

  // ---------------------------------------------------------------- hooks from combat
  onKill(m) {
    const c = G.char; c.kills++; G.map.kills++; Q.onKill(m);
    if (G.map.def.special === 'breach' && G.map.kills % 40 === 0) { const d = pick(G.map.breachBosses), s = { mob: d.id, x: clamp(G.player.x + 400, 200, G.map.geo.w - 200), y: G.player.y, plat: G.player.body.plat || G.map.geo.plats[0], boss: true, respawn: Infinity }; G.map.spawns.push(s); import('../world/map.js').then(mm => mm.spawnAt(G.map, s)); emit('toast', { text: 'The Breach tears wider. Something vast steps through.', kind: 'boss' }); }
    if (m.boss) { emit('bossDown', { name: m.name }); S.partyLine('win', {}); if (G.map.instance && G.map.def.id === G.map.instance.rooms.at(-1)) { const id = G.map.instance.id; this.later(1.5, () => { Q.onDungeon(id); emit('dungeonDone', { dungeon: DUNGEON_BY_ID.get(id) }); const P = G.player; G.char.gold += 150 * G.map.instance.level; }); } }
  },
  questDrops: (m) => Q.questDrops(m),
  onCollect: (n) => Q.onCollect(n),
  onLevel(lvl) {
    Q.onLevel(); S.react('levelup', G.player); this.save();
    // Velscour notices
    const ms = MILESTONES && MILESTONES[lvl], pool = TAUNTS[pick(Object.keys(TAUNTS))];
    const line = (ms ? ms[1] : pick(pool)).replace(/\{name\}/g, G.char.name).replace(/\{class\}/g, CLASSES[G.char.cls].name).replace(/\{level\}/g, lvl);
    emit('taunt', { lines: line.split('|'), lvl });
  },
  onHeroDied(h) {
    S.react('death', h);
    if (h.inParty || h.companion) { this.later(G.map.instance ? 9 : 6, () => { if (!G.actors.includes(h)) return; h.dead = false; h.deadT = 0; h.hp = h.maxHp * 0.6; h.alpha = 1; h.inv = 2; const L = G.player; h.body.place(G.map.geo, L.x - 40, L.y - 10); levelFx(h); }); if (G.map.instance) S.partyLine('wipe', {}); }
    else if (h.team === 2) { this.duelCheck(); }
    else this.later(7, () => { if (!G.actors.includes(h)) return; h.dead = false; h.deadT = 0; h.hp = h.maxHp; h.alpha = 1; const po = G.map.portals[0]; h.body.place(G.map.geo, po ? po.x : 200, po ? po.y - 10 : null); h.spawnT = 0.3; });
  },
  async respawn() {
    const P = G.player, c = G.char; c.deaths++;
    c.xp = Math.max(0, c.xp - Math.round(xpToNext(c.lvl) * 0.04));
    P.dead = false; P.deadT = 0; P.alpha = 1; P.recompute(true); P.inv = 3; P.hurtInv = false; P.buffs.length = 0; P.dots.length = 0;
    if (G.map.instance) await this.leaveDungeon();
    if (G.map.def.kind !== 'town') await this.travel('hh_square', null); else P.body.place(G.map.geo, G.map.geo.w / 2);
    emit('toast', { text: 'You awaken in Herrington Hollow.' });
  },
  usePotion(kind) {
    const c = G.char, P = G.player; if (P.dead || (P.potT || 0) > 0 || !(c.potions[kind] > 0)) return false;
    if (kind === 'hp') { if (P.hp >= P.maxHp) return false; heal(P, P.maxHp * POTIONS.hp.pct); } else { if (P.cls === 'barbarian' || P.mp >= P.maxMp) return false; P.mp = Math.min(P.maxMp, P.mp + P.maxMp * POTIONS.mp.pct); floater(P.x, P.cy - 40, '+', 's'); }
    c.potions[kind]--; P.potT = 0.6; audio.sfx('potion'); emit('bag'); return true;
  },

  // ---------------------------------------------------------------- frame
  update(dt) {
    G.dt = dt; G.time += dt; G.frame++;
    pollPad();
    for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } } }
    if (G.mode !== 'play' || G.loading || !G.map) { endFrame(); return; }
    const M = G.map, P = G.player, geo = M.geo;
    if (G.paused) { this.camera(dt); endFrame(); return; }
    if (G.hitStop > 0) { G.hitStop -= dt; G.parts.update(dt * 0.2); this.camera(dt); return; }       // a breath of freeze on a telling blow
    G.heroes = G.actors.filter(a => a.kind === 'hero' && !a.dead);
    this.controlPlayer(dt);
    for (let i = G.actors.length - 1; i >= 0; i--) {
      const a = G.actors[i];
      a.tickBase(dt);
      if (a.dead) { a.deadT += dt; if (a.kind === 'mob' || a.kind === 'summon') { if (!a.body.fly) a.body.step(geo, dt, 0, {}); if (a.deadT > 1.3) { a.remove = true; G.actors.splice(i, 1); if (a.owner) { const k = a.owner.summons.indexOf(a); if (k >= 0) a.owner.summons.splice(k, 1); } } } else if (a.kind === 'hero') a.body.step(geo, dt, 0, {}); continue; }
      if (a.dots.length) tickDots(a, dt);
      if (a.kind === 'mob') { if (Math.abs(a.x - P.x) < 2600 || a.aggro) tickMob(a, dt); }
      else if (a.kind === 'summon') tickSummon(a, dt);
      else if (a.kind === 'hero') {
        // regeneration; rage ebbs away out of battle
        if (a.cls === 'barbarian') { if (!a.target) a.mp = Math.max(0, a.mp - dt * 3); } else a.mp = Math.min(a.maxMp, a.mp + (a.maxMp * 0.012 + 0.6) * dt);
        a.hp = Math.min(a.maxHp, a.hp + (a.stats.regen + (G.map.def.kind === 'town' ? a.maxHp * 0.05 : 0)) * dt);
        if (a.potT > 0) a.potT -= dt;
        if (a !== P && a.brain) a.brain.tick(dt);
      }
    }
    for (const h of G.heroes) if (h.pet) tickPet(h, dt);
    for (let i = G.effects.length - 1; i >= 0; i--) { let alive = false; try { alive = G.effects[i].upd(dt); } catch (e) { console.error(e); } if (!alive) G.effects.splice(i, 1); }
    tickDrops(dt); G.parts.update(dt); ambient(M, dt);
    for (let i = G.floaters.length - 1; i >= 0; i--) { const f = G.floaters[i]; f.t += dt; f.y -= (f.slow ? 26 : 44) * dt; if (f.t > (f.slow ? 2 : f.word ? 1.2 : 0.95)) G.floaters.splice(i, 1); }
    tickMap(M, dt); S.tickSocial(dt); S.driftRoster(dt);
    this.camera(dt);
    const post = G.rd.post; post.flash = Math.max(0, post.flash - dt * 1.6); post.dark = Math.max(0, post.dark - dt * 2.2); post.lowHp = !P.dead && P.hp < P.maxHp * 0.25 ? 1 - P.hp / (P.maxHp * 0.25) : 0;
    this.saveT = (this.saveT || 0) + dt; if (this.saveT > 30) { this.saveT = 0; this.save(); }
    if (G.frame % 300 === 0) sweepLooks();
    G.text.tick();
    endFrame();
  },
  controlPlayer(dt) {
    const P = G.player, b = P.body, geo = G.map.geo; if (P.dead) return;
    const manual = down.left || down.right || down.attack || down.jump || down.up || down.down;
    if (pressed('auto')) this.toggleAuto();
    if (manual) this.manualT = 1.2; else if (this.manualT > 0) this.manualT -= dt;
    if (pressed('potion')) this.usePotion('hp'); if (pressed('mpotion')) this.usePotion('mp');
    if (pressed('interact')) this.interact();
    if (pressed('loot')) for (const d of G.drops) if (Math.abs(d.x - P.x) < 150 && Math.abs(d.y - P.y) < 90) d.pick = 0, d.fly = d.landed && !d.fly ? 0.001 : d.fly;
    if (G.auto && !(this.manualT > 0)) { P.director.tick(dt); P.bot.tick(dt); this.footsteps(dt); return; }
    let move = (down.right ? 1 : 0) - (down.left ? 1 : 0);
    const want = { jump: pressed('jump'), up: down.up, down: down.down };
    if (down.up && b.plat && !b.rope) { const po = this.portalNear(); if (po && pressed('up')) { this.usePortal(po); return; } }
    if (P.status.stun > 0 || P.status.freeze > 0) { move = 0; want.jump = false; }
    if (P.useT > 0 && b.plat && !P.whirl && !P.leaping) move *= 0.15;         // committed to the swing
    if (!P.leaping) { const ev = b.step(geo, dt, move, want); if (ev === 'jump') { P.squash = 0.12; audio.sfx('jump', { vol: 0.5 }); dust(P, 4); } else if (ev === 'land') { P.squash = -0.16; audio.sfx('land', { vol: 0.5 }); dust(P, 7); } }
    else b.step(geo, dt, 0, {});
    if (!b.rope) {
      if (down.attack) { const sk = SKILLS[G.char.basic]; if (sk && ready(P, sk)) cast(P, sk, null); }
      for (let i = 0; i < 8; i++) if (down['s' + (i + 1)]) { const sk = SKILLS[G.char.bar[i]]; if (sk) { if (ready(P, sk)) cast(P, sk, null); else if (pressed('s' + (i + 1)) && !P.cd[sk.id] && !P.busy) { emit('toast', { text: P.cls === 'barbarian' ? 'Not enough rage.' : 'Not enough mana.' }); audio.sfx('ui_error'); } } }
    }
    this.footsteps(dt);
  },
  footsteps(dt) { const P = G.player; if (P.body.plat && Math.abs(P.body.vx) > 80) { this.stepT = (this.stepT || 0) - dt; if (this.stepT <= 0) { this.stepT = 0.3; audio.sfx('step', { vol: 0.25 }); } } },
  toggleAuto(v) { G.auto = v ?? !G.auto; G.char.auto = G.auto; emit('auto', { on: G.auto }); audio.sfx('ui_click'); if (G.auto) emit('toast', { text: 'Auto-play on: questing, hunting, looting.' }); },
  camera(dt) {
    const cam = G.cam, P = G.player, tx = P.x - cam.viewW / 2 + P.face * 40, ty = P.y - cam.viewH * 0.76;
    const k = 1 - Math.exp(-dt * 5.5);
    if (Math.abs(tx - cam.x) > 4) cam.x += (tx - cam.x) * k; if (Math.abs(ty - cam.y) > 4) cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 4));
    this.clampCam();
    if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 40);
    cam.cx = cam.x + cam.viewW / 2;
  },
  clampCam() { const cam = G.cam, geo = G.map.geo; cam.x = geo.w <= cam.viewW ? (geo.w - cam.viewW) / 2 : clamp(cam.x, 0, geo.w - cam.viewW); cam.y = clamp(cam.y, Math.min(0, geo.h - 150 - cam.viewH), geo.h - 150 - cam.viewH); cam.cx = cam.x + cam.viewW / 2; },

  render() {
    const rd = G.rd, cam = G.cam, M = G.map;
    rd.begin();
    if (G.mode !== 'play' || !M || !M.scene) { rd.camera(0, 0, 1); rd.end(G.time, G.time * 30, 0); return; }
    const sx = cam.shake ? (Math.random() - 0.5) * cam.shake : 0, sy = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
    rd.camera(cam.x + sx, cam.y + sy, cam.zoom);
    const light = M.scene.light, vx0 = cam.x - 300, vx1 = cam.x + cam.viewW + 300;
    drawBack(rd, M);
    for (const e of G.effects) if (e.back) e.draw(rd);
    G.parts.draw(rd, false, vx0, vx1);
    drawTerrain(rd, M);
    const vis = G.actors.filter(a => a.x > vx0 && a.x < vx1);
    for (const a of vis) if (!a.body.fly) drawShadow(rd, a);
    for (const d of G.drops) if (d.x > vx0 && d.x < vx1) drawDrop(rd, d);
    const order = { npc: 0, mob: 1, summon: 2, hero: 3 };
    vis.sort((p, q) => (p.isPlayer ? 9 : order[p.kind]) - (q.isPlayer ? 9 : order[q.kind]) || p.y - q.y);
    for (const a of vis) if (a.pet && a.kind === 'hero' && !a.dead) drawPet(rd, a, light);
    for (const a of vis) { if (a.kind === 'npc' && !a.sprite) { a.cls = a.heroSpec; a.equip = a.equip || kitFor(a.cls, 12); a.kind = 'hero'; heroSprite(a); a.kind = 'npc'; } drawActor(rd, a, light); }
    for (const e of G.effects) if (!e.back) e.draw(rd);
    G.parts.draw(rd, true, vx0, vx1);
    drawFront(rd, M);
    for (const a of vis) drawOverlay(rd, a);
    const T = G.text;
    for (const f of G.floaters) { const al = Math.min(1, (f.slow ? 2 : f.word ? 1.2 : 0.95) - f.t) * 2.2, pop = f.t < 0.12 ? 0.6 + f.t / 0.12 * 0.6 : 1.2 - Math.min(0.2, (f.t - 0.12) * 1.2); if (f.word) T.draw(rd, T.word(f.word, f.color || '#fff', 15), f.x, f.y, Math.min(1, al), f.scale || 1); else if (f.str) T.glyphs(rd, f.str, f.style, f.x, f.y, (f.scale || 1) * pop, Math.min(1, al)); }
    // screen finish
    rd.camera(0, 0, 1); rd.batches[rd.batches.length - 1].post = true; rd.rect(-10, -10, 1, 1, [0, 0, 0, 0]);
    rd.end(G.time, cam.x, cam.y);
  },
  resize(w, h, dpr) {
    const cam = G.cam; G.rd.resize(w, h, dpr);
    const viewH = h < 520 ? 600 : h < 760 ? 680 : 760;
    cam.zoom = (h * dpr) / viewH; cam.viewH = viewH; cam.viewW = (w * dpr) / cam.zoom; cam.cssZoom = h / viewH;
    if (cam.viewW < 760) { cam.viewW = 760; cam.zoom = (w * dpr) / 760; cam.viewH = (h * dpr) / cam.zoom; cam.cssZoom = w / 760; }
  },
  /** World point -> CSS pixel (for the UI to pin things to actors). */
  toScreen(x, y) { const c = G.cam; return [(x - c.x) * c.cssZoom, (y - c.y) * c.cssZoom]; },
};
