// The heads-up display: status bar, quick slots, minimap, buffs, quest tracker, party
// frames, boss bar, toasts, banners, the loading fade and the talk / enter prompts.
import { G } from '../state.js';
import { press, release } from '../core/input.js';
import { SKILLS, CLASSES, xpToNext, manaCost, cooldown } from '../data/game.js';
import { rageCost } from '../data/velscour/skills.js';
import { rarityColor } from '../game/items.js';
import { h, U, A, ICON, clear, esc, fmt, sfx, setText, setCls, setVar } from './dom.js';
import { paintSkill } from './icons.js';

let el = {}, slotViews = [], mm = null, tAcc = { mm: 0, slow: 0, mid: 0 };
const MENU = [['inv', 'Bag', 'I', 'pack'], ['char', 'Hero', 'C', 'view3'], ['skills', 'Skills', 'V', 'book'], ['quests', 'Quests', 'L', 'journal'], ['map', 'Map', 'M', 'map'],
  ['party', 'Party', 'P', 'talk'], ['guild', 'Guild', 'G', 'home'], ['bestiary', 'Bestiary', 'B', 'slot_skull'], ['menu', 'Menu', 'Esc', 'settings']];

// ------------------------------------------------------------------ quick slots (shared with the touch pad)
/** A skill button view. idx(): -1 = the attack skill, 0..7 = bar slot. */
export function makeSlot(idx, key, cls = '') {
  const ic = h('span.ic'), cd = h('span.cd'), cdn = h('span.cdn'), root = h('button.slot' + (cls ? '.' + cls : ''), { type: 'button' }, ic, cd, cdn, key ? h('span.key', key) : null);
  const v = { el: root, ic, cd, cdn, idx: typeof idx === 'function' ? idx : () => idx, id: undefined };
  root.addEventListener('dragover', (e) => e.preventDefault());
  root.addEventListener('drop', (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (!SKILLS[id]) return; const i = v.idx(); if (i < 0) G.game.setBasic(id); else G.game.setBar(i, id); sfx('equip'); });
  slotViews.push(v); return v;
}
export function skillCost(sk) { const P = G.player; return P.cls === 'barbarian' ? rageCost(sk) : manaCost(sk, Math.max(1, G.char.ranks[sk.id] || 1)); }
function updateSlots() {
  const c = G.char, P = G.player;
  for (const v of slotViews) {
    const i = v.idx(), id = (i < 0 ? c.basic : c.bar[i]) || null, sk = id ? SKILLS[id] : null;
    if (id !== v.id) { v.id = id; paintSkill(v.ic, sk); setCls(v.el, 'empty', !sk); v.el.title = sk ? sk.name : ''; }
    if (!sk) { setVar(v.cd, '--p', '0%'); setText(v.cdn, ''); continue; }
    const cd = P.cd[id] || 0, tot = cooldown(sk) || 1;
    setVar(v.cd, '--p', cd > 0 ? Math.min(100, Math.ceil(cd / tot * 50) * 2) + '%' : '0%');
    setText(v.cdn, cd > 0.15 ? (cd >= 9.5 ? String(Math.ceil(cd)) : cd.toFixed(1)) : '');
    setCls(v.el, 'dim', P.mp < skillCost(sk) || P.dead);
  }
}
export function hold(elm, action, also) {
  const up = (e) => { if (elm._h) { elm._h = false; release(action); if (also) release(also); elm.classList.remove('held'); } };
  elm.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault(); try { elm.setPointerCapture(e.pointerId); } catch {} elm._h = true; press(action); if (also) press(also); elm.classList.add('held'); });
  elm.addEventListener('pointerup', up); elm.addEventListener('pointercancel', up); elm.addEventListener('lostpointercapture', up);
  elm.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ------------------------------------------------------------------ build
export function initHud(root) {
  const bar = (cls, lab) => { const fill = h('i'), txt = h('span.bt'), l = h('span.bl', lab); return { root: h('div.gbar.' + cls, fill, l, txt), fill, txt, l }; };
  el.hp = bar('hp', 'HP'); el.mp = bar('mp', 'MP');
  el.lv = h('div.lv', h('small', 'Lv'), h('b', '1')); el.name = h('div.who-name'); el.cls = h('div.who-cls');
  const atk = makeSlot(-1, 'X', 'atk'); hold(atk.el, 'attack');
  const slots = h('div.slots', atk.el);
  for (let i = 0; i < 8; i++) { const s = makeSlot(i, String(i + 1)); hold(s.el, 's' + (i + 1)); slots.append(s.el); }
  const pot = (kind, key, img) => { const n = h('span.cnt', '0'); const b = h('button.pot.' + kind, { type: 'button', title: kind === 'hp' ? 'Blood Draught' : 'Wit Tincture', onclick: () => G.game.usePotion(kind) }, h('img', { src: A('ui/' + img), draggable: false }), n, h('span.key', key)); el['pot_' + kind] = n; el['potb_' + kind] = b; return b; };
  el.auto = h('button#auto', { type: 'button', title: 'Auto-play (T): quests, hunts and loots for you', onclick: () => G.game.toggleAuto() }, h('span.auto-rune'), h('b', 'AUTO'), h('span.key', 'T'));
  el.gold = h('span.gold-n', '0');
  el.xpFill = h('i'); el.xpTxt = h('span');
  el.bar = h('div#bar',
    h('div.who', el.lv, h('div.who-t', el.name, el.cls)),
    h('div.bars', el.hp.root, el.mp.root),
    slots,
    h('div.pots', pot('hp', 'Q', 'potion_red.png'), pot('mp', 'E', 'potion_blue.png')),
    el.auto);
  el.xp = h('div#xp', el.xpFill, el.xpTxt);
  el.menu = h('div#menu', h('div.gold', h('img', { src: ICON('gold'), draggable: false }), el.gold));
  el.badges = {};
  for (const [id, name, key, ic] of MENU) {
    const badge = h('span.badge'); el.badges[id] = badge;
    el.menu.append(h('button.mbtn', { type: 'button', title: `${name} (${key})`, 'aria-label': name, onclick: () => { sfx('ui_click'); U.toggleWin(id); } }, h('img', { src: ICON(ic), draggable: false }), h('span.mk', key), badge));
  }
  // minimap
  el.mmName = h('div.mm-name'); el.mmStreet = h('div.mm-street'); el.mmCanvas = h('canvas', { width: 380, height: 168 });
  el.mm = h('div#mm', { onclick: () => U.toggleWin('map'), title: 'World map (M)' }, h('div.mm-title', el.mmName, el.mmStreet), el.mmCanvas);
  el.buffs = h('div#buffs'); el.tracker = h('div#tracker', { onclick: () => U.openWin('quests') }); el.party = h('div#party');
  el.bossName = h('div.boss-name'); el.bossFill = h('i'); el.bossPct = h('span');
  el.boss = h('div#boss.hide', el.bossName, h('div.boss-bar', el.bossFill, el.bossPct));
  el.toasts = h('div#toasts'); el.flourish = h('div#flourish.hide'); el.taunt = h('div#taunt.hide');
  el.hint = h('button#hint.hide', { type: 'button', onclick: () => { const po = G.game.portalNear(); if (el.hint._portal && po) G.game.usePortal(po); else G.game.interact(); } });
  el.fade = h('div#fade', h('div.fade-in', h('div.fade-rune'), el.fadeName = h('div.fade-name'), h('div.fade-sub', 'travelling')));
  el.root = h('div#hud.hide', el.mm, el.buffs, el.tracker, el.party, el.boss, el.toasts, el.flourish, el.taunt, el.hint, el.menu, el.bar, el.xp);
  root.append(el.root, el.fade);
  U.toast = toast; U.flourish = flourish; U.hudShow = (on) => el.root.classList.toggle('hide', !on);
  U.refreshHud = () => { last.sig = last.party = last.buffs = null; };
}

// ------------------------------------------------------------------ toasts and banners
function toast(text, kind, rarity) {
  const t = h('div.toast' + (kind ? '.' + kind : ''), { text });
  if (kind === 'item' && rarity != null) t.style.color = rarityColor(rarity);
  el.toasts.append(t); while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
  setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
}
const fq = []; let fBusy = false;
function flourish(title, sub, cls = '', ms = 2300) { fq.push({ title, sub, cls, ms }); if (fq.length > 4) fq.splice(0, fq.length - 4); if (!fBusy) nextFlourish(); }
function nextFlourish() {
  const f = fq.shift(); if (!f) { fBusy = false; el.flourish.classList.add('hide'); return; }
  fBusy = true; el.flourish.className = f.cls; clear(el.flourish).append(h('div.fl-rule'), h('div.fl-title', f.title), f.sub ? h('div.fl-sub', f.sub) : null, h('div.fl-rule'));
  void el.flourish.offsetWidth; el.flourish.classList.add('show'); setTimeout(nextFlourish, f.ms);
}
let tauntT = 0;
function taunt(lines, lvl) {
  clear(el.taunt).append(h('div.ta-who', 'Velscour, the Demon Lord'), lines.filter(Boolean).map((l) => h('div.ta-line', l.trim())));
  el.taunt.classList.remove('hide', 'show'); void el.taunt.offsetWidth; el.taunt.classList.add('show');
  clearTimeout(tauntT); tauntT = setTimeout(() => el.taunt.classList.add('hide'), 4600);
}

export function hudEvent(e) {
  switch (e.type) {
    case 'started': el.root.classList.remove('hide'); last.sig = last.party = last.buffs = null; mm = null; identity(); break;
    case 'loading': if (e.on) { setText(el.fadeName, e.name || ''); el.fade.classList.add('on'); } else el.fade.classList.remove('on'); break;
    case 'mapChanged': mm = null; break;
    case 'toast': toast(e.text, e.kind, e.rarity); break;
    case 'levelUp': flourish('Level ' + e.lvl, 'You grow stronger. A skill point is yours to spend.', 'gold'); identity(); break;
    case 'taunt': setTimeout(() => taunt(e.lines || [], e.lvl), 1500); break;
    case 'quest': last.sig = null; if (e.what === 'done') flourish('Quest Complete', e.q ? e.q.name : '', 'gold'); break;
    case 'roomCleared': flourish('Room Cleared', 'The way onward is open.', 'pale', 1900); break;
    case 'bossSpawn': flourish(e.name, 'A great foe stirs', 'blood', 2600); break;
    case 'bossDown': flourish(e.name, 'has fallen', 'gold', 2600); break;
    case 'rareDrop': if (e.item) toast('Rare find: ' + e.item.name, 'item', e.item.rarity); break;
    case 'party': last.party = null; break;
    case 'skills': identity(); break;
  }
}
function identity() {
  const c = G.char; if (!c) return; const C = CLASSES[c.cls];
  setText(el.name, c.name); setText(el.cls, C.name + (c.guild ? '  ·  <' + c.guild.name + '>' : '')); el.cls.style.color = C.color;
  const rage = c.cls === 'barbarian'; el.mp.root.classList.toggle('rage', rage); setText(el.mp.l, rage ? 'RAGE' : 'MP');
}

// ------------------------------------------------------------------ frame
const last = {};
export function hudFrame(dt) {
  const P = G.player, c = G.char; if (!P || !c || G.mode !== 'play') return;
  // status
  const hp = Math.max(0, Math.ceil(P.hp)), mp = Math.floor(P.mp);
  setVar(el.hp.fill, '--w', Math.round(P.hp / P.maxHp * 200) / 2 + '%'); setText(el.hp.txt, hp + ' / ' + P.maxHp);
  setVar(el.mp.fill, '--w', Math.round(P.mp / Math.max(1, P.maxMp) * 200) / 2 + '%'); setText(el.mp.txt, mp + ' / ' + P.maxMp);
  setCls(el.hp.root, 'low', P.hp < P.maxHp * 0.25);
  setText(el.lv.lastChild, String(c.lvl));
  const need = xpToNext(c.lvl), xp = Math.min(1, c.xp / need);
  setVar(el.xpFill, '--w', Math.round(xp * 1000) / 10 + '%'); setText(el.xpTxt, 'EXP ' + (xp * 100).toFixed(1) + '%');
  setText(el.pot_hp, String(c.potions.hp || 0)); setText(el.pot_mp, String(c.potions.mp || 0));
  setCls(el.potb_hp, 'none', !(c.potions.hp > 0)); setCls(el.potb_mp, 'none', !(c.potions.mp > 0) || c.cls === 'barbarian');
  setText(el.gold, fmt(c.gold)); setCls(el.auto, 'on', G.auto);
  setText(el.badges.skills, c.sp > 0 ? String(c.sp) : ''); setCls(el.badges.skills, 'on', c.sp > 0);
  updateSlots();
  pinHint();
  tAcc.mm += dt; if (tAcc.mm >= 0.1) { tAcc.mm = 0; drawMinimap(); party(false); bossBar(); buffs(); }
  tAcc.slow += dt; if (tAcc.slow >= 0.5 || last.sig === null || last.party === null) { tAcc.slow = 0; tracker(); party(true); identityCheck(); findHint(); }
}
let idSig = '';
function identityCheck() { const c = G.char, s = c.name + c.cls + (c.guild ? c.guild.name : ''); if (s !== idSig) { idSig = s; identity(); } }

// talk / enter prompt, pinned over the thing it is about
let hintTarget = null;
function findHint() {
  const P = G.player, M = G.map; hintTarget = null; if (!M || P.dead || G.loading) return;
  let best = null, bd = 150;
  for (const a of G.actors) { if (a === P || a.dead) continue; if (a.kind !== 'npc' && !(a.kind === 'hero' && a.fake)) continue; const d = Math.abs(a.x - P.x) + Math.abs(a.y - P.y) * 1.5 + (a.kind === 'hero' ? 40 : 0); if (d < bd) { bd = d; best = a; } }
  const po = G.game.portalNear();
  if (best && best.kind === 'npc') hintTarget = { a: best, text: 'Talk', key: 'F', sub: best.name };
  else if (po) hintTarget = { po, text: po.dungeon ? 'Enter' : 'Enter', key: '↑', sub: po.label, portal: true };
  else if (best && bd < 90) hintTarget = { a: best, text: 'Greet', key: 'F', sub: best.name };
}
function pinHint() {
  const t = hintTarget, on = !!t && !U.blocking(); setCls(el.hint, 'hide', !on); if (!on) return;
  const sig = t.key + t.text + t.sub; if (el.hint._s !== sig) { el.hint._s = sig; el.hint._portal = !!t.portal; el.hint.innerHTML = `<kbd>${t.key}</kbd><span class="tapk">Tap</span> <b>${t.text}</b> <em>${esc(t.sub || '')}</em>`; }
  const [x, y] = t.a ? G.game.toScreen(t.a.x, t.a.y - (t.a.h || 100) - 62) : G.game.toScreen(t.po.x, t.po.y - 150);
  const X = Math.round(Math.max(70, Math.min(innerWidth - 70, x))), Y = Math.round(Math.max(60, Math.min(innerHeight - 120, y)));
  if (el.hint._x !== X || el.hint._y !== Y) { el.hint._x = X; el.hint._y = Y; el.hint.style.transform = `translate(${X}px,${Y}px) translate(-50%,-100%)`; }
}

function tracker() {
  const qs = G.game.quests(), sig = qs.map((q) => q.q.id + q.text + q.done).join('|');
  if (sig === last.sig) return; last.sig = sig;
  clear(el.tracker); if (!qs.length) { el.tracker.classList.add('hide'); return; } el.tracker.classList.remove('hide');
  qs.sort((a, b) => (b.done - a.done) || ((b.q.main ? 1 : 0) - (a.q.main ? 1 : 0)));
  el.tracker.append(h('div.tr-head', 'Quests', h('small', qs.length > 4 ? ` +${qs.length - 4} more` : '')));
  for (const q of qs.slice(0, 4)) el.tracker.append(h('div.tr-q' + (q.done ? '.done' : '') + (q.q.main ? '.main' : ''), h('div.tr-name', q.q.name), h('div.tr-step', q.text)));
}

let partyViews = [];
function party(rebuild) {
  if (rebuild || last.party === null) {
    const list = G.game.partyList(), sig = list.map((p) => p.uid).join(',');
    if (sig !== last.party) {
      last.party = sig; clear(el.party); partyViews = []; el.party.classList.toggle('raid', list.length > 5);
      for (const p of list) {
        const fill = h('i'), nm = h('span.pf-name', p.name), lv = h('span.pf-lv', String(p.lvl));
        const root = h('button.pf', { type: 'button', onclick: () => U.playerMenu(p) }, lv, h('span.pf-body', nm, h('span.pf-cls', { text: CLASSES[p.cls]?.name || '', style: { color: CLASSES[p.cls]?.color } }), h('span.pf-hp', fill)));
        el.party.append(root); partyViews.push({ p, fill, root, lv });
      }
    }
  }
  for (const v of partyViews) { setVar(v.fill, '--w', Math.max(0, Math.round(v.p.hp / v.p.maxHp * 50) * 2) + '%'); setCls(v.root, 'dead', v.p.dead); setText(v.lv, String(v.p.lvl)); }
}

function bossBar() {
  const P = G.player; let b = null, bd = 1400;
  for (const a of G.actors) if (a.kind === 'mob' && a.boss && !a.dead) { const d = Math.abs(a.x - P.x); if (d < bd) { bd = d; b = a; } }
  setCls(el.boss, 'hide', !b); if (!b) return;
  setText(el.bossName, b.name + '  ·  Lv ' + b.lvl); const f = Math.max(0, b.hp / b.maxHp);
  setVar(el.bossFill, '--w', Math.round(f * 1000) / 10 + '%'); setText(el.bossPct, Math.ceil(f * 100) + '%');
}

let buffViews = [];
function buffs() {
  const P = G.player, c = G.char, list = P.buffs.slice(0, 12).map((b) => ({ id: b.id, name: b.name || 'Blessing', t: b.t, dur: b.dur || b.t || 1, ref: b }));
  if (c.kindled > G.time) list.push({ id: '_kindled', name: 'Kindled: +10% experience', t: c.kindled - G.time, dur: 600 });
  const sig = list.map((b) => b.id).join(',');
  if (sig !== last.buffs) {
    last.buffs = sig; clear(el.buffs); buffViews = [];
    for (const b of list) { const ic = h('span.ic'), n = h('span.bn'); if (SKILLS[b.id]) paintSkill(ic, SKILLS[b.id]); else ic.classList.add('flame'); const root = h('div.buff', { title: b.name }, ic, h('span.ring'), n); el.buffs.append(root); buffViews.push({ root, n }); }
  }
  list.forEach((b, i) => { const v = buffViews[i]; if (!v) return; setVar(v.root, '--p', Math.round(Math.max(0, Math.min(1, b.t / b.dur)) * 50) * 2 + '%'); setText(v.n, b.t >= 60 ? Math.ceil(b.t / 60) + 'm' : Math.ceil(b.t) + ''); });
}

// ------------------------------------------------------------------ minimap
function drawMinimap() {
  const M = G.map; if (!M || !M.geo) return; const cv = el.mmCanvas, W = cv.width, H = cv.height, geo = M.geo, pad = 10;
  if (!mm || mm.M !== M) {
    let y0 = Infinity, y1 = -Infinity; for (const p of geo.plats) { if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; } y0 -= 190; y1 += 50;
    const sx = (W - pad * 2) / geo.w, sy = Math.min((H - pad * 2) / (y1 - y0), sx * 5), oy = (H - (y1 - y0) * sy) / 2;
    const st = document.createElement('canvas'); st.width = W; st.height = H; const g = st.getContext('2d');
    mm = { M, st, X: (x) => pad + x * sx, Y: (y) => oy + (y - y0) * sy };
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(190,170,130,.5)'; g.lineWidth = 2; for (const r of geo.ropes || []) { g.beginPath(); g.moveTo(mm.X(r.x), mm.Y(r.y1)); g.lineTo(mm.X(r.x), mm.Y(r.y2)); g.stroke(); }
    for (const p of geo.plats) { g.strokeStyle = p.ground ? '#d8cba8' : '#a39678'; g.lineWidth = p.ground ? 4 : 3; g.beginPath(); g.moveTo(mm.X(p.x1), mm.Y(p.y)); g.lineTo(mm.X(p.x2), mm.Y(p.y)); g.stroke(); }
    setText(el.mmName, M.def.name + (M.def.level ? '  ·  Lv ' + (M.instance ? M.instance.level : M.def.level) : '')); setText(el.mmStreet, M.instance ? M.instance.name : (M.def.street || ''));
  }
  const g = cv.getContext('2d'), X = mm.X, Y = mm.Y; g.clearRect(0, 0, W, H); g.drawImage(mm.st, 0, 0);
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 260);
  for (const po of M.portals) { const c = po.color || [0.45, 0.62, 1], col = `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`; g.fillStyle = col; g.globalAlpha = 0.35; g.beginPath(); g.arc(X(po.x), Y(po.y) - 7, 9 + pulse * 2, 0, 7); g.fill(); g.globalAlpha = 1; g.beginPath(); g.arc(X(po.x), Y(po.y) - 7, 5, 0, 7); g.fill(); }
  let me = null;
  for (const a of G.actors) {
    if (a.dead) continue; const x = X(a.x), y = Y(a.y) - 5;
    if (a.isPlayer) { me = a; continue; }
    if (a.kind === 'npc') { g.fillStyle = a.mark === 'done' ? '#ffe45a' : a.mark === 'bulb' ? '#ffb02a' : '#e9d8a0'; g.fillRect(x - 3.5, y - 5, 7, 9); if (a.mark === 'done' || a.mark === 'bulb') { g.fillRect(x - 1.5, y - 15, 3, 6); } }
    else if (a.kind === 'mob') { g.fillStyle = a.boss ? '#ff2a2a' : a.elite ? '#ff9a3a' : '#d24a3a'; const r = a.boss ? 6.5 : a.elite ? 4.5 : 3; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); if (a.boss) { g.strokeStyle = '#ffd0a0'; g.lineWidth = 1.5; g.stroke(); } }
    else if (a.kind === 'hero') { g.fillStyle = a.team === 2 ? '#ff5a8a' : a.inParty ? '#5ab4ff' : '#f2f2f2'; g.beginPath(); g.arc(x, y, 3.6, 0, 7); g.fill(); }
    else if (a.kind === 'summon') { g.fillStyle = '#8fd0a0'; g.fillRect(x - 2, y - 2, 4, 4); }
  }
  if (me) { const x = X(me.x), y = Y(me.y) - 6; g.strokeStyle = 'rgba(255,214,90,' + (0.35 + pulse * 0.4) + ')'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 10, 0, 7); g.stroke(); g.fillStyle = '#ffd65a'; g.strokeStyle = '#2a1c00'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill(); g.stroke(); }
}
