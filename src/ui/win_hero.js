// Windows about the hero: bag + equipment paper-doll, the hero sheet, the skill trees.
import { G } from '../state.js';
import { SKILLS, CLASSES, xpToNext, cooldown, describe, skillBaseDamage, weaponCoef, MAX_SKILL_LEVEL, ROW_LEVELS, ELEM } from '../data/game.js';
import { rarityColor, rarityName, STAT_LABEL, SLOT_NAME, SLOTS, itemScore, canEquip } from '../game/items.js';
import { h, U, A, ICON, clear, esc, fmt, sfx, btn, toggle, titleCase } from './dom.js';
import { defineWin } from './windows.js';
import { itemIcon, skillIcon } from './icons.js';
import { skillCost } from './hud.js';

// ------------------------------------------------------------------ item helpers
const statLine = (k, v) => { const L = STAT_LABEL[k] || k; if (k === 'dmg' || k === 'armor') return `${v} ${L}`; if (L[0] === '%') return `+${v}${L}`; return `+${v} ${L}`; };
const ORDER = ['dmg', 'armor', 'block', 'str', 'dex', 'vit', 'int', 'life', 'mana', 'dmgPct', 'crit', 'speed', 'leech', 'regen', 'gf', 'xp'];
/** Tooltip HTML for an item. opts.compare: show deltas against what is worn in that slot. */
export function itemTip(it, opts = {}) {
  if (!it) return '';
  if (it.type === 'potion') return `<div class="tt"><div class="tt-name">${esc(it.name)}</div><div class="tt-sub">${it.pot === 'hp' ? 'Restores 45% of your life.' : 'Restores 50% of your mana.'}</div><div class="tt-val">${fmt(it.price)} gold</div></div>`;
  const col = rarityColor(it.rarity);
  if (it.mystery) return `<div class="tt"><div class="tt-name" style="color:#c9a2ff">Unidentified ${SLOT_NAME[it.slot] || 'Relic'}</div><div class="tt-sub">Fortune favours somebody. Item level ${it.ilvl}.</div><div class="tt-val">${fmt(it.price)} gold</div></div>`;
  const cur = opts.compare !== false && G.char ? G.char.equip[it.slot] : null, cmp = cur && cur !== it && cur.id !== it.id ? cur : null;
  let s = `<div class="tt"><div class="tt-name" style="color:${col}">${esc(it.name)}${it.plus ? ' +' + it.plus : ''}</div><div class="tt-sub">${rarityName(it.rarity)} ${SLOT_NAME[it.slot] || ''}${it.base && it.base !== it.slot ? ' (' + titleCase(it.base) + ')' : ''}  ·  Item level ${it.ilvl}</div><div class="tt-stats">`;
  const keys = ORDER.filter((k) => it.stats[k] || (cmp && cmp.stats[k])).concat(Object.keys(it.stats).filter((k) => !ORDER.includes(k)));
  for (const k of keys) {
    const v = it.stats[k] || 0, d = cmp ? v - (cmp.stats[k] || 0) : 0;
    const delta = cmp && d ? ` <span class="${d > 0 ? 'up' : 'dn'}">(${d > 0 ? '+' : ''}${d})</span>` : '';
    s += v ? `<div class="${k === 'dmg' || k === 'armor' ? 'main' : ''}">${statLine(k, v)}${delta}</div>` : `<div class="lost">${STAT_LABEL[k] || k}${delta}</div>`;
  }
  s += '</div>';
  if (cmp) { const d = Math.round(itemScore(it) - itemScore(cmp)); s += `<div class="tt-cmp ${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '▲ Better' : '▼ Worse'} than ${esc(cmp.name)} (${d >= 0 ? '+' : ''}${d} power)</div>`; }
  else if (G.char && cur === it) s += '<div class="tt-cmp eq">Equipped</div>';
  if (G.char && !canEquip(it, G.char.cls)) s += '<div class="tt-cmp dn">Your class cannot use this.</div>';
  s += `<div class="tt-val">${it.price ? 'Price: ' + fmt(it.price) : 'Sells for ' + fmt(it.value)} gold</div>`;
  if (opts.hint) s += `<div class="tt-hint">${opts.hint}</div>`;
  return s + '</div>';
}
/** A square slot holding an item. onUse(it, e) on click, onMore(it, el) on right-click / touch tap. */
export function itemSlot(it, o = {}) {
  const el = h('button.islot' + (it ? '' : '.empty'), { type: 'button' });
  if (!it) { if (o.ph) el.append(h('img.ph', { src: ICON(o.ph), draggable: false })); if (o.label) el.title = o.label; return el; }
  el.append(itemIcon(it, o.cls));
  el.style.setProperty('--rc', rarityColor(it.rarity));
  if (o.mark && G.char) { const c = G.char; if (!canEquip(it, c.cls)) el.append(h('span.mark.no', '✕')); else if (itemScore(it) > itemScore(c.equip[it.slot]) * 1.02) el.append(h('span.mark.up', '▲')); }
  U.tip(el, () => itemTip(it, { hint: o.hint, compare: o.compare }));
  let touch = false;
  el.addEventListener('pointerdown', (e) => { touch = e.pointerType !== 'mouse'; });
  el.addEventListener('click', (e) => { U.hideTip(); if (touch && o.onMore) o.onMore(it, el); else if (o.onUse) o.onUse(it, e); else if (o.onMore) o.onMore(it, el); });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); U.hideTip(); o.onMore && o.onMore(it, el); });
  return el;
}
/** The item card: details plus what you can do with it. where: 'bag' | 'equip' | 'stash' */
export function itemCard(it, where) {
  const c = G.char, g = G.game; let close;
  const act = (label, fn, cls) => btn(label, () => { close(); fn(); }, cls);
  const acts = h('div.row.wrap.end');
  if (where === 'bag') {
    if (canEquip(it, c.cls)) acts.append(act('Equip', () => g.equip(it.id), 'primary'));
    if (U.shop) acts.append(act(`Sell (${fmt(it.value)}g)`, () => g.sell(it.id)));
    if (U.storage) acts.append(act('Stash', () => g.stash(it.id)));
    acts.append(act('Drop', () => { const go = () => { g.dropItem(it.id); sfx('ui_close'); }; if (it.rarity >= 2) U.confirm({ title: 'Destroy ' + it.name + '?', text: 'It will be gone for good.', yes: 'Destroy', danger: true }, go); else go(); }, 'danger'));
  } else if (where === 'equip') acts.append(act('Unequip', () => { if (c.bag.length >= c.bagMax) U.toast('Your bag is full.'); else g.unequip(it.slot); }));
  else if (where === 'stash') acts.append(act('Take', () => g.unstash(it.id), 'primary'));
  acts.append(act('Close', () => {}));
  close = U.modal(h('div.panel.itemcard', h('div.ic-top', itemIcon(it), h('div', { html: itemTip(it) })), acts), { cls: 'light', block: false });
}

// ------------------------------------------------------------------ bag + equipment
const PH = { weapon: 'slot_main', offhand: 'slot_off', head: 'slot_head', body: 'slot_chest', ring: 'slot_ring', amulet: 'slot_neck' };
let bag = {};
defineWin('inv', {
  title: 'Bag & Equipment', icon: 'pack', pos: [0.74, 0.42], on: ['bag', 'gotItem', 'started'],
  build(body) {
    bag.doll = h('div.doll'); bag.grid = h('div.bag-grid'); bag.count = h('span'); bag.gold = h('b'); bag.etc = h('div.etc'); bag.pots = h('div.bag-pots'); bag.sum = h('div.doll-sum'); bag.ctx = h('div.bag-ctx');
    body.append(h('div.inv',
      h('div.inv-l', bag.doll, bag.sum),
      h('div.inv-r',
        h('div.sec-h', 'Bag ', bag.count, h('span.grow'), h('span.goldline', h('img', { src: ICON('gold') }), bag.gold)),
        bag.grid, bag.ctx,
        h('div.row.wrap', bag.pots, h('span.grow'), toggle('Auto-equip better gear', () => G.char.autoGear, (v) => { G.char.autoGear = v; })),
        h('div.sec-h', 'Quest items'), bag.etc)));
  },
  refresh() {
    const c = G.char, g = G.game, P = G.player;
    clear(bag.doll).append(h('img.doll-art', { src: A('sprites/select/' + c.cls + '.webp'), draggable: false }));
    for (const s of SLOTS) {
      const it = c.equip[s], el = itemSlot(it, { ph: PH[s], label: SLOT_NAME[s], compare: false, hint: 'Click: unequip', onUse: (x) => { if (c.bag.length >= c.bagMax) U.toast('Your bag is full.'); else g.unequip(s); }, onMore: (x) => itemCard(x, 'equip') });
      bag.doll.append(h('div.doll-slot.s-' + s, el, h('small', SLOT_NAME[s])));
    }
    clear(bag.sum).append(stat('Power', Math.round(SLOTS.reduce((a, s) => a + itemScore(c.equip[s]), 0))), stat('Life', P.maxHp), stat('Armor', Math.round(P.stats.armor)), stat('Damage', '×' + P.stats.dmgMul.toFixed(2)));
    clear(bag.grid);
    const n = Math.max(c.bagMax, c.bag.length);
    for (let i = 0; i < n; i++) {
      const it = c.bag[i];
      bag.grid.append(itemSlot(it, { mark: true, hint: U.shop ? 'Click: equip · Right-click: sell, drop' : 'Click: equip · Right-click: more', onUse: (x) => { if (canEquip(x, c.cls)) g.equip(x.id); else itemCard(x, 'bag'); }, onMore: (x) => itemCard(x, 'bag') }));
    }
    bag.count.textContent = `${c.bag.length} / ${c.bagMax}`; bag.gold.textContent = fmt(c.gold);
    clear(bag.ctx);
    if (U.shop) bag.ctx.append(h('span.note', 'Trading: right-click or tap an item to sell it.'), btn('Sell junk', () => { if (!g.sellJunk()) U.toast('Nothing worth less than what you wear.'); }));
    else if (U.storage) bag.ctx.append(h('span.note', 'Storage open: right-click or tap an item to stash it.'));
    clear(bag.pots).append(h('span.potline', h('img', { src: A('ui/potion_red.png') }), `Blood Draught ×${c.potions.hp || 0}`), h('span.potline', h('img', { src: A('ui/potion_blue.png') }), `Wit Tincture ×${c.potions.mp || 0}`));
    clear(bag.etc); const names = Object.keys(c.etc || {});
    if (!names.length) bag.etc.append(h('span.note', 'Nothing. Quest spoils gather here.'));
    for (const k of names) bag.etc.append(h('span.etc-i', k, h('b', '×' + c.etc[k])));
  },
});
const stat = (k, v, cls) => h('div.stat' + (cls ? '.' + cls : ''), h('span', k), h('b', String(v)));

// ------------------------------------------------------------------ hero sheet
let hero = {};
defineWin('char', {
  title: 'Hero', icon: 'view3', pos: [0.24, 0.42], on: ['bag', 'skills', 'levelUp', 'started'],
  build(body) { hero.body = body; },
  tick() { this.refresh(); },
  refresh() {
    const c = G.char, P = G.player, C = CLASSES[c.cls], st = P.stats, a = P.attr, rage = c.cls === 'barbarian';
    const need = xpToNext(c.lvl), t = Math.round((c.playT || 0) + (G.time - (c._t0 || G.time)));
    const AT = { str: ['Strength', 'Armour, and the weight behind a blow'], dex: ['Dexterity', 'Attack speed and critical strikes'], vit: ['Vitality', '+6 life a point, and life regeneration'], int: ['Intellect', '+2 mana a point'] };
    clear(hero.body).append(h('div.sheet',
      h('div.sheet-top', h('img.sheet-art', { src: A('sprites/select/' + c.cls + '.webp'), draggable: false }),
        h('div', h('div.sheet-name', c.name), h('div.sheet-cls', { style: { color: C.color } }, `Level ${c.lvl} ${C.name}`), c.guild ? h('div.sheet-guild', `<${c.guild.name}>`) : null,
          h('div.gbar.xpb', h('i', { style: { '--w': Math.min(100, c.xp / need * 100) + '%' } }), h('span.bt', `${fmt(c.xp)} / ${fmt(need)} xp`)),
          h('p.blurb', C.desc))),
      h('div.sec-h', 'Attributes'),
      h('div.attrs', Object.keys(AT).map((k) => h('div.attr' + (C.primary === k ? '.prime' : ''), { title: AT[k][1] }, h('b', String(Math.round(a[k]))), h('span', AT[k][0]), h('small', C.primary === k ? 'Primary: +0.28% damage a point' : AT[k][1])))),
      h('div.sec-h', 'In battle'),
      h('div.stats2',
        stat('Life', `${Math.ceil(P.hp)} / ${P.maxHp}`), stat(rage ? 'Rage' : 'Mana', `${Math.floor(P.mp)} / ${P.maxMp}`),
        stat('Weapon damage', Math.round(P.weaponDmg)), stat('Damage', '+' + Math.round((st.dmgMul - 1) * 100) + '%'),
        stat('Critical chance', st.crit.toFixed(1) + '%'), stat('Critical damage', '+' + st.critDmg + '%'),
        stat('Attack speed', '+' + Math.round((st.asMul - 1) * 100) + '%'), stat('Move speed', Math.round(st.speed * 100) + '%'),
        stat('Armor', Math.round(st.armor)), stat('Block', Math.round(st.block) + '%'),
        stat('Life steal', (st.leech || 0).toFixed(1) + '%'), stat('Life regen', st.regen.toFixed(1) + ' /s'),
        stat('Gold find', '+' + Math.round(st.gf || 0) + '%'), stat('Experience', '+' + Math.round(st.xp || 0) + '%')),
      h('div.sec-h', 'Deeds'),
      h('div.stats2', stat('Slain', fmt(c.kills || 0)), stat('Deaths', fmt(c.deaths || 0)), stat('Quests done', Object.keys(c.quests.done).length), stat('Time played', `${Math.floor(t / 3600)}h ${Math.floor(t / 60) % 60}m`), c.duelWins ? stat('Pit victories', c.duelWins) : null)));
  },
});

// ------------------------------------------------------------------ skills
let sk = { tree: 0, sel: null };
function dmgOf(s, rank) {
  const P = G.player, base = skillBaseDamage(s, rank); if (!(base > 0)) return null; const wc = weaponCoef(s) || 0, w = P.weaponDmg || 0, m = P.stats.dmgMul;
  return [Math.max(1, Math.round((base * 0.85 + w * 0.8 * wc) * m)), Math.max(1, Math.round((base * 1.15 + w * 1.2 * wc) * m))];
}
const descOf = (s, rank) => { try { return describe(s, rank, dmgOf(s, rank)); } catch { return ''; } };
export function skillTip(s) {
  if (!s) return ''; const r = G.char.ranks[s.id] || 0, cd = cooldown(s), cost = skillCost(s);
  return `<div class="tt sk"><div class="tt-name">${esc(s.name)}</div><div class="tt-sub">${(ELEM[s.el] || ELEM.phys).name} · Rank ${r}/${MAX_SKILL_LEVEL}</div><div class="tt-desc">${descOf(s, Math.max(1, r))}</div><div class="tt-val">${cost ? cost + (G.char.cls === 'barbarian' ? ' rage' : ' mana') : 'No cost'}${cd ? ' · ' + cd + 's cooldown' : ''}</div></div>`;
}
defineWin('skills', {
  title: 'Skills', icon: 'book', pos: [0.5, 0.42], on: ['skills', 'levelUp', 'started', 'bag'],
  build(body) {
    sk.pts = h('b.pts'); sk.tabs = h('div.tabs'); sk.grid = h('div.sk-grid'); sk.det = h('div.sk-det'); sk.strip = h('div.sk-strip');
    body.append(h('div.skills',
      h('div.row.wrap', h('span.sp', 'Skill points: ', sk.pts), h('span.grow'), toggle('Auto-spend points', () => G.char.autoSkills, (v) => { G.char.autoSkills = v; })),
      sk.tabs, h('div.sk-main', sk.grid, sk.det),
      h('div.sec-h', 'Quick slots', h('small', '  select a learned skill, then tap a slot (or drag it there)')), sk.strip));
  },
  open() { sk.sel = null; },
  refresh() {
    const c = G.char, g = G.game, C = CLASSES[c.cls], all = g.skillTree();
    sk.pts.textContent = String(c.sp || 0); sk.pts.classList.toggle('have', c.sp > 0);
    clear(sk.tabs); C.trees.forEach((name, t) => { const pts = all.filter((s) => s.tree === t).reduce((a, s) => a + (c.ranks[s.id] || 0), 0); sk.tabs.append(h('button.tab' + (t === sk.tree ? '.on' : ''), { type: 'button', onclick: () => { sk.tree = t; sk.sel = null; sfx('ui_click'); this.refresh(); } }, name, h('small', pts ? ' ' + pts : ''))); });
    clear(sk.grid);
    const list = all.filter((s) => s.tree === sk.tree);
    if (!sk.sel || SKILLS[sk.sel]?.tree !== sk.tree) sk.sel = (list.find((s) => c.ranks[s.id] > 0) || list[0]).id;
    for (let row = 0; row < 3; row++) {
      sk.grid.append(h('div.sk-rowl' + (c.lvl >= ROW_LEVELS[row] ? '' : '.locked'), 'Lv ' + ROW_LEVELS[row]));
      for (const s of list.filter((x) => x.row === row)) {
        const r = c.ranks[s.id] || 0, can = g.canLearn(s), locked = c.lvl < s.reqLevel || (s.prereq && !(c.ranks[s.prereq] > 0));
        const cell = h('div.sk-cell' + (r ? '.known' : '') + (locked ? '.locked' : '') + (s.id === sk.sel ? '.sel' : ''), { draggable: r > 0, onclick: () => { sk.sel = s.id; sfx('ui_click'); this.refresh(); } },
          skillIcon(s), h('span.sk-rank', `${r}/${MAX_SKILL_LEVEL}`), h('span.sk-name', s.name),
          can ? h('button.plus', { type: 'button', title: 'Learn', onclick: (e) => { e.stopPropagation(); sk.sel = s.id; g.learn(s.id); } }, '+') : null);
        if (r > 0) cell.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', s.id); e.dataTransfer.effectAllowed = 'copy'; U.hideTip(); });
        sk.grid.append(cell);
      }
    }
    // detail
    const s = SKILLS[sk.sel], r = c.ranks[s.id] || 0, cd = cooldown(s), cost = skillCost(s), pre = s.prereq ? SKILLS[s.prereq] : null;
    clear(sk.det).append(
      h('div.sk-dh', skillIcon(s, 'big'), h('div', h('div.sk-dn', s.name), h('div.sk-ds', `${C.trees[s.tree]} · ${(ELEM[s.el] || ELEM.phys).name} · ${titleCase(s.kind)}`), h('div.sk-dr', `Rank ${r} / ${MAX_SKILL_LEVEL}`))),
      h('p.sk-desc', { html: descOf(s, Math.max(1, r)) }),
      r > 0 && r < MAX_SKILL_LEVEL ? h('p.sk-next', { html: '<b>Next rank:</b> ' + descOf(s, r + 1) }) : null,
      h('div.sk-meta', h('span', cost ? `${cost} ${c.cls === 'barbarian' ? 'rage' : 'mana'}` : 'No cost'), h('span', cd ? `${cd}s cooldown` : 'No cooldown')),
      c.lvl < s.reqLevel ? h('div.req.bad', `Requires level ${s.reqLevel}`) : null,
      pre && !(c.ranks[pre.id] > 0) ? h('div.req.bad', `Requires ${pre.name}`) : null,
      h('div.row.wrap', (() => { const b = btn(r ? 'Raise rank' : 'Learn', () => g.learn(s.id), 'primary'); b.disabled = !g.canLearn(s); return b; })(),
        r > 0 ? btn('Set as attack', () => { g.setBasic(s.id); sfx('equip'); }) : null));
    // quick slots
    clear(sk.strip);
    const mk = (i, key) => { const id = i < 0 ? c.basic : c.bar[i], q = SKILLS[id]; const b = h('button.slot.mini' + (i < 0 ? '.atk' : '') + (q ? '' : '.empty'), { type: 'button', onclick: () => { const cur = SKILLS[sk.sel]; if (!cur || !(c.ranks[cur.id] > 0)) return U.toast('Learn the skill first.'); if (i < 0) g.setBasic(cur.id); else g.setBar(i, cur.id); sfx('equip'); } }, skillIcon(q, 'ic'), h('span.key', key));
      b.addEventListener('dragover', (e) => e.preventDefault()); b.addEventListener('drop', (e) => { e.preventDefault(); const id2 = e.dataTransfer.getData('text/plain'); if (!SKILLS[id2]) return; if (i < 0) g.setBasic(id2); else g.setBar(i, id2); sfx('equip'); });
      if (q) U.tip(b, () => skillTip(q)); return b; };
    sk.strip.append(mk(-1, 'X')); for (let i = 0; i < 8; i++) sk.strip.append(mk(i, String(i + 1)));
  },
});
