// Talking to people: the NPC dialog with quests and every service (shops, gambling,
// inn, smith, enchanter, storage, guild registrar, arena, dungeon keepers), the dungeon
// gate, the death screen and the dungeon-cleared banner.
import { G } from '../state.js';
import { DUNGEONS } from '../data/world.js';
import * as Q from '../game/quests.js';
import { rarityColor, SLOT_NAME, SLOTS, STAT_LABEL } from '../game/items.js';
import { h, U, ICON, clear, esc, fmt, sfx, btn } from './dom.js';
import { itemIcon } from './icons.js';
import { itemTip, itemSlot, itemCard } from './win_hero.js';
import { rewardRow } from './win_world.js';

let el = {}, D = null;           // D: the open dialog { npc, id, name, title, role, text, view, q, mode }
const SERVICE = { 'shop:weapons': 'Browse weapons', 'shop:armor': 'Browse armour', 'shop:potions': 'Buy potions', 'shop:gems': 'Browse jewellery', gamble: 'Try your luck', innkeeper: 'A bed and provisions', smith: 'Reforge gear', enchant: 'Reroll enchantments', storage: 'Open your strongbox', guild: 'Guild charter', arena: 'Fight in the Pit' };
const isShop = (r) => r.startsWith('shop:') || r === 'gamble' || r === 'innkeeper';

export function initDialog(root) {
  el.name = h('h3'); el.title = h('small'); el.body = h('div.d-body.scroll');
  el.root = h('section#dialog.panel.hide', { role: 'dialog' }, h('header.d-head', h('div.d-who', el.name, el.title), h('button.x', { type: 'button', 'aria-label': 'Close', onclick: () => { closeDialog(); sfx('ui_close'); } }, h('img', { src: ICON('close'), draggable: false }))), el.body);
  el.death = h('div#death.hide'); el.done = h('div#ddone.panel.hide');
  U.layer.put(el.root); root.put(el.done, el.death);          // the dialog shares the windows' z-order, so a bag opened from a shop sits over it
  el.root.addEventListener('pointerdown', () => { el.root.style.zIndex = U.nextZ(); }, true);
  U.closeDialog = closeDialog;
}
function closeDialog() {
  if (!D) return; D = null; el.root.classList.add('hide'); U.popLayer('dialog');
  if (U.shop || U.storage) { U.shop = null; U.storage = false; U.refreshWin('inv'); }
}
function openDialog(e) {
  D = { ...e, view: 'main' }; U.shop = null; U.storage = false;
  el.name.textContent = e.name; el.title.textContent = e.title || '';
  el.root.classList.remove('hide'); el.root.style.zIndex = U.nextZ(); U.pushLayer({ id: 'dialog', close: closeDialog, block: true });
  const t = Q.turninsOf(e.id), o = Q.offersOf(e.id);
  if (t.length) { D.view = 'quest'; D.q = t[0]; D.mode = 'turnin'; }
  else if (o.length && !SERVICE[e.role] && !e.role.startsWith('dungeon:')) { D.view = 'quest'; D.q = o[0]; D.mode = 'offer'; }
  render();
}
const opt = (cls, icon, label, fn, sub) => h('button.opt.' + cls, { type: 'button', onclick: () => { sfx('ui_click'); fn(); } }, h('img', { src: ICON(icon), draggable: false }), h('span', label), sub ? h('small', sub) : null);
function go(view, extra) { Object.assign(D, { view }, extra); if (view === 'service') { U.shop = isShop(D.role) ? { role: D.role } : null; U.storage = D.role === 'storage'; U.refreshWin('inv'); } else if (U.shop || U.storage) { U.shop = null; U.storage = false; U.refreshWin('inv'); } render(); el.body.scrollTop = 0; }

function render() {
  if (!D) return; const b = el.body, st = b.scrollTop; clear(b);
  el.root.classList.toggle('wide', D.view === 'service');
  if (D.view === 'quest') questView(b); else if (D.view === 'service') serviceView(b); else mainView(b);
  b.scrollTop = st;
}
function mainView(b) {
  const g = G.game, id = D.id, turn = Q.turninsOf(id), offers = Q.offersOf(id), act = Q.activeList().filter((q) => q.giver === id && !Q.complete(q));
  b.put(h('p.d-say', D.text));
  for (const q of D.advanced || []) b.put(h('p.d-note', `Quest updated: ${q.name} — ${Q.stepText(q) || 'done'}`));
  const list = h('div.opts');
  for (const q of turn) list.put(opt('ready', 'quest_ready', q.name, () => go('quest', { q, mode: 'turnin' }), 'Complete'));
  for (const q of offers) list.put(opt('offer', 'quest_offer', q.name, () => go('quest', { q, mode: 'offer' }), `Lv ${q.level || 1}${q.main ? ' · Main story' : ''}`));
  for (const q of act) list.put(opt('busy', 'quest_busy', q.name, () => go('quest', { q, mode: 'active' }), Q.stepText(q)));
  if (SERVICE[D.role]) list.put(opt('svc', D.role === 'storage' ? 'sort' : D.role === 'guild' ? 'home' : D.role === 'arena' ? 'role_dps' : D.role === 'smith' || D.role === 'enchant' ? 'staff' : 'gold', SERVICE[D.role], () => go('service')));
  if (D.role.startsWith('dungeon:')) {
    const did = D.role.slice(8), dg = DUNGEONS.find((d) => d.id === did), here = G.map.portals.some((p) => p.dungeon === did);
    if (dg && here) list.put(opt('svc', 'open', 'Enter ' + dg.name, () => { closeDialog(); gate(dg); }, `${dg.kind === 'raid' ? 'Raid' : 'Dungeon'} · Lv ${dg.level}`));
    else if (dg) b.put(h('p.d-note', `${dg.name} lies elsewhere. Find its gate and I will see you through.`));
  }
  if (D.role === 'travel') b.put(h('p.d-note', 'The roads are walked on foot for now. The cart is spoken for.'));
  list.put(opt('bye', 'shut', 'Farewell', closeDialog));
  b.put(list);
}
function questView(b) {
  const g = G.game, q = D.q, m = D.mode;
  const lines = m === 'turnin' ? q.done : m === 'active' ? q.progress : q.offer;
  b.put(h('div.d-qh', h('img', { src: ICON(m === 'turnin' ? 'quest_ready' : m === 'active' ? 'quest_busy' : 'quest_offer'), draggable: false }), h('div', h('h4', q.name), h('small', `${q.main ? 'Main story' : 'Side quest'} · Level ${q.level || 1}`))),
    (lines || ['...']).map((l) => h('p.d-say', l)));
  if (m === 'active') b.put(h('p.d-note', 'Now: ' + Q.stepText(q)));
  b.put(rewardRow(q));
  const back = () => go('main');
  b.put(h('div.row.end.wrap',
    m === 'offer' ? [btn('Decline', back), btn('Accept', () => { g.acceptQuest(q.id); D.text = 'Off you go, then.'; back(); }, 'primary')] :
    m === 'turnin' ? btn('Complete quest', () => { g.turnInQuest(q.id); const n = Q.turninsOf(D.id)[0] || Q.offersOf(D.id)[0]; if (n) go('quest', { q: n, mode: Q.complete(n) ? 'turnin' : 'offer' }); else back(); }, 'primary') :
    btn('Back', back)));
}

// ------------------------------------------------------------------ services
function serviceView(b) {
  const g = G.game, c = G.char, r = D.role;
  const head = (t, note) => b.put(h('div.sv-head', btn('‹ Back', () => go('main'), 'sm'), h('h4', t), h('span.grow'), h('span.goldline', h('img', { src: ICON('gold') }), h('b', fmt(c.gold)))), note ? h('p.d-note', note) : null);
  if (isShop(r)) {
    head(SERVICE[r], r === 'gamble' ? 'Unidentified wares. What you get is what you get.' : 'Open your bag to sell: right-click or tap an item there.');
    if (r === 'innkeeper') { const cost = 10 + c.lvl * 3; b.put(h('div.shop-row.rest', h('div.iticon.bed', '☾'), h('div.sr-t', h('b', 'Rest by the fire'), h('small', 'Restores life and mana. Kindled: +10% experience for ten minutes.')), h('span.price', fmt(cost)), dis(btn('Rest', () => g.rest(), 'sm primary'), c.gold < cost))); }
    const items = g.shopStock(r, D.id), list = h('div.shop-list');
    for (const it of items) {
      const pot = it.type === 'potion', row = h('div.shop-row', itemIcon(it), h('div.sr-t', h('b', { style: { color: pot ? '' : it.mystery ? '#c9a2ff' : rarityColor(it.rarity) } }, it.mystery ? 'Unidentified ' + SLOT_NAME[it.slot] : it.name), h('small', pot ? (it.pot === 'hp' ? `Restores life · you carry ${c.potions.hp || 0}` : `Restores mana · you carry ${c.potions.mp || 0}`) : it.mystery ? `Item level ${it.ilvl}` : statBrief(it))), h('span.price', fmt(it.price)),
        pot ? h('span.row', [1, 5, 10].map((n) => dis(btn('×' + n, () => g.buy(it, n), 'sm'), c.gold < it.price * n))) : dis(btn('Buy', () => g.buy(it), 'sm primary'), c.gold < it.price));
      U.tip(row.firstChild, () => itemTip(it)); list.put(row);
    }
    if (!items.length) list.put(h('p.note', 'Sold out. Come back later.'));
    b.put(list, h('div.row.end.wrap', btn('Open bag', () => U.openWin('inv')), btn('Sell junk', () => { if (!g.sellJunk()) U.toast('Nothing worth less than what you wear.'); })));
  } else if (r === 'smith' || r === 'enchant') {
    const up = r === 'smith';
    head(up ? 'The Forge' : 'The Enchanter', up ? 'Each tempering adds +1 (to +10): more damage or armour.' : 'Rerolls an item\'s magical properties. Its damage and armour stay.');
    const all = [...SLOTS.map((s) => c.equip[s]).filter(Boolean), ...c.bag], list = h('div.shop-list');
    for (const it of all) {
      const maxed = up && (it.plus || 0) >= 10, cost = up ? g.upgradeCost(it) : g.enchantCost(it), worn = c.equip[it.slot] === it;
      const row = h('div.shop-row', itemIcon(it), h('div.sr-t', h('b', { style: { color: rarityColor(it.rarity) } }, it.name + (it.plus ? ' +' + it.plus : '')), h('small', (worn ? 'Worn · ' : '') + statBrief(it, up ? 2 : 6))), h('span.price', maxed ? '—' : fmt(cost)),
        dis(btn(maxed ? 'Max' : up ? 'Temper' : 'Reroll', () => (up ? g.upgrade(it.id) : g.enchant(it.id)), 'sm primary'), maxed || c.gold < cost || (!up && it.rarity < 1)));
      U.tip(row.firstChild, () => itemTip(it, { compare: false })); list.put(row);
    }
    b.put(list);
  } else if (r === 'storage') {
    head('Strongbox', 'Click an item to move it. The strongbox holds sixty.');
    const stash = c.stash || [], bg = h('div.bag-grid'), sg = h('div.bag-grid');
    for (let i = 0; i < Math.max(c.bagMax, c.bag.length); i++) bg.put(itemSlot(c.bag[i], { mark: true, onUse: (x) => g.stash(x.id), onMore: (x) => itemCard(x, 'bag') }));
    for (let i = 0; i < 60; i++) sg.put(itemSlot(stash[i], { onUse: (x) => g.unstash(x.id), onMore: (x) => itemCard(x, 'stash') }));
    b.put(h('div.storage', h('div', h('div.sec-h', `Bag ${c.bag.length} / ${c.bagMax}`), bg), h('div', h('div.sec-h', `Strongbox ${stash.length} / 60`), sg)));
  } else if (r === 'guild') {
    head('The Charter Desk');
    if (c.guild) b.put(h('p.d-say', `<${c.guild.name}> is on the rolls: level ${c.guild.level}, renown ${fmt(c.guild.renown || 0)}. The Charterhouse door is two along.`), h('div.row.end', btn('Open guild ledger', () => U.openWin('guild'), 'primary')));
    else {
      const inp = h('input.inp', { type: 'text', maxLength: 22, placeholder: 'Name your guild', spellcheck: false }), ok = c.lvl >= 10 && c.gold >= 5000;
      b.put(h('p.d-say', 'A charter wants a hero of the tenth level, five thousand gold, and a name that will not embarrass the town.'),
        h('ul.q-steps', h('li' + (c.lvl >= 10 ? '.done' : '.cur'), `Level 10 (you are ${c.lvl})`), h('li' + (c.gold >= 5000 ? '.done' : '.cur'), `5,000 gold (you carry ${fmt(c.gold)})`)),
        h('div.row.wrap', inp, dis(btn('Found the guild', () => { g.foundGuild(inp.value); if (G.char.guild) { inp.blur(); render(); } }, 'primary'), !ok)));
    }
  } else if (r === 'arena') {
    head('The Pit of Small Mercies', 'Win gold, and renown for your guild. Losing costs only pride.');
    const inPit = G.map.def.kind === 'arena';
    b.put(h('div.row.wrap', dis(btn('Duel · 1 v 1', () => { closeDialog(); g.startDuel(1); }, 'primary'), !inPit || !!g.duel), dis(btn('Skirmish · 1 v 3', () => { closeDialog(); g.startDuel(3); }), !inPit || !!g.duel)), !inPit ? h('p.note', 'Bouts are fought down in the Pit itself.') : g.duel ? h('p.note', 'A bout is already under way.') : null);
  }
}
const dis = (b, off) => { b.disabled = !!off; return b; };
function statBrief(it, n = 3) { const ks = Object.keys(it.stats); return ks.slice(0, n).map((k) => { const L = STAT_LABEL[k] || k, v = it.stats[k]; return k === 'dmg' || k === 'armor' ? `${v} ${L}` : L[0] === '%' ? `+${v}${L}` : `+${v} ${L}`; }).join(' · ') + (ks.length > n ? ' …' : ''); }

// ------------------------------------------------------------------ dungeon gate, death, dungeon done
function gate(dg) {
  if (!dg) return; let close; const raid = dg.kind === 'raid';
  close = U.modal(h('div.panel.gate' + (raid ? '.raid' : ''), h('div.gate-kind', raid ? 'Raid' : 'Dungeon'), h('h3', dg.name),
    h('div.gate-facts', h('div', h('small', 'Level'), h('b', String(dg.level))), h('div', h('small', raid ? 'Raid size' : 'Party'), h('b', raid ? 'up to ' + dg.party : String(dg.party))), h('div', h('small', 'Chambers'), h('b', String(dg.rooms.length)))),
    h('div.gate-boss', h('small', 'Its master'), h('b', dg.boss?.name || 'Unknown')),
    h('p.note', `The ${raid ? 'raid' : 'party'} fills from players looking for a group. Each chamber seals until it is cleared.${G.char.lvl < dg.level - 2 ? ' You are below its level: tread carefully.' : ''}`),
    h('div.row.end', btn('Cancel', () => close()), btn('Enter', () => { close(); G.game.enterDungeon(dg.id); }, 'primary'))), { id: 'gate' });
}
let dead = null;
function showDeath(by) {
  dead = { t: 0, auto: 5, shown: false, by };
}
function buildDeath() {
  const auto = h('div.death-auto'); dead.autoEl = auto; dead.shown = true; G.paused = true;
  clear(el.death).put(h('div.death-in', h('div.death-rule'), h('h1', 'You have fallen'), h('p', 'Slain by ', h('b', dead.by || 'the dark')), h('p.small', 'A little of your experience bleeds away into the Hollow.'),
    btn('Return to Herrington Hollow', respawn, 'primary big'), auto));
  el.death.classList.remove('hide'); U.pushLayer({ id: 'death', close() {}, block: true, locked: true });
}
function respawn() {
  if (!dead) return; dead = null; el.death.classList.add('hide'); U.popLayer('death'); G.paused = false; G.game.respawn();
}
function dungeonDone(dg) {
  clear(el.done).put(h('div.gate-kind', dg?.kind === 'raid' ? 'Raid conquered' : 'Dungeon cleared'), h('h3', dg?.name || 'The depths fall silent'), h('p.note', 'Spoils are shared and the purse is heavier. Gather what has dropped before you go.'),
    h('div.row.end', btn('Stay a while', () => el.done.classList.add('hide')), btn('Leave', () => { el.done.classList.add('hide'); G.game.leaveDungeon(); }, 'primary')));
  el.done.classList.remove('hide'); U.flourish(dg?.kind === 'raid' ? 'Raid Conquered' : 'Dungeon Cleared', dg?.name || '', 'gold', 2800);
}

export function dialogEvent(e) {
  switch (e.type) {
    case 'dialog': openDialog(e); break;
    case 'playerMenu': U.playerMenu(e.hero, e.info); break;
    case 'dungeonGate': gate(e.dungeon); break;
    case 'dungeonDone': dungeonDone(e.dungeon); break;
    case 'playerDied': closeDialog(); showDeath(e.by); break;
    case 'bag': case 'quest': case 'skills': if (D && (D.view === 'service' || (e.type === 'quest' && D.view === 'main'))) render(); break;
    case 'loading': if (e.on) { closeDialog(); el.done.classList.add('hide'); } break;
    case 'started': closeDialog(); dead = null; el.death.classList.add('hide'); el.done.classList.add('hide'); U.popLayer('death'); break;
  }
}
let chk = 0;
export function dialogFrame(dt) {
  if (D) { chk += dt; if (chk > 0.25) { chk = 0; const P = G.player, n = D.npc; if (!n || !G.actors.includes(n) || Math.abs(n.x - P.x) > 420 || Math.abs(n.y - P.y) > 300 || P.dead) closeDialog(); } }
  if (dead) {
    dead.t += dt;
    if (!dead.shown && dead.t > 1.1) buildDeath();
    if (dead && dead.shown) {
      if (!G.player.dead) { dead = null; el.death.classList.add('hide'); U.popLayer('death'); G.paused = false; return; }
      if (G.auto) { dead.auto -= dt; const s = Math.max(0, Math.ceil(dead.auto)); if (dead.autoEl._t !== s) { dead.autoEl._t = s; dead.autoEl.textContent = `Auto-play is on: rising again in ${s}…`; } if (dead.auto <= 0) respawn(); }
      else if (dead.autoEl._t !== '') { dead.autoEl._t = ''; dead.autoEl.textContent = ''; }
    }
  }
}
