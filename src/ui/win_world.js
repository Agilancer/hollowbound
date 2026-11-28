// Windows about the world: quest log, world map, party / nearby players, guild, and
// the little menu you get when you greet another player.
import { G } from '../state.js';
import { CLASSES } from '../data/game.js';
import { MAPS, AREAS, DUNGEONS } from '../data/world.js';
import { NPCS } from '../data/npcs.js';
import { mobDef } from '../game/bestiary.js';
import { rarityColor, rarityName, SLOT_NAME, SLOTS } from '../game/items.js';
import { guildOf } from '../game/social.js';
import { h, U, clear, esc, fmt, sfx, btn } from './dom.js';
import { defineWin } from './windows.js';
import { itemIcon } from './icons.js';
import { itemTip } from './win_hero.js';

const MAP = new Map(MAPS.map((m) => [m.id, m]));
const mobName = (id) => mobDef(id)?.name || String(id).replace(/^slime:/, '').replace(/_/g, ' ');

// ------------------------------------------------------------------ quests
export function rewardRow(q) {
  const r = q.reward || {}, out = h('div.rewards', h('span.rw-l', 'Rewards'));
  if (r.xp) out.append(h('span.rw.xp', fmt(r.xp) + ' xp'));
  if (r.gold) out.append(h('span.rw.gold', fmt(r.gold) + ' gold'));
  if (r.item === 'potions') out.append(h('span.rw', 'Potions ×8'));
  else if (r.item && typeof r.item === 'object') out.append(h('span.rw', { style: { color: rarityColor(r.item.rarity ?? 1) } }, `${rarityName(r.item.rarity ?? 1)} ${SLOT_NAME[r.item.slot] || 'gear'}`));
  if (r.skillPoint) out.append(h('span.rw.sp', `+${r.skillPoint} skill point`));
  return out;
}
export function stepLabel(s) {
  switch (s.t) {
    case 'kill': return `Slay ${s.n} ${typeof s.mob === 'string' ? mobName(s.mob) : s.area || (s.mob && s.mob.area) ? 'monsters in ' + (AREAS[s.area || s.mob.area]?.name || 'the area') : 'monsters'}`;
    case 'boss': return 'Slay ' + mobName(s.mob);
    case 'collect': return `Gather ${s.n} × ${s.item}`;
    case 'talk': return 'Speak with ' + (NPCS[s.npc]?.name || s.npc);
    case 'deliver': return `Bring ${s.item || 'it'} to ${NPCS[s.npc]?.name || s.npc}`;
    case 'visit': return 'Travel to ' + (MAP.get(s.map)?.name || s.map);
    case 'dungeon': return 'Clear ' + (DUNGEONS.find((d) => d.id === s.id)?.name || 'the dungeon');
    case 'level': return 'Reach level ' + s.n;
  } return '';
}
let ql = { tab: 'active', sel: null };
defineWin('quests', {
  title: 'Quest Log', icon: 'journal', pos: [0.5, 0.42], on: ['quest', 'bag', 'started'],
  build(body) { ql.tabs = h('div.tabs'); ql.list = h('div.q-list.scroll'); ql.det = h('div.q-det.scroll'); body.append(h('div.quests', ql.tabs, h('div.q-main', ql.list, ql.det))); },
  tick() { if (ql.tab === 'active') this.refresh(); },
  refresh() {
    const g = G.game, act = g.quests(), done = g.questsDone();
    clear(ql.tabs).append(...[['active', `Active (${act.length})`], ['done', `Completed (${done.length})`]].map(([k, l]) => h('button.tab' + (ql.tab === k ? '.on' : ''), { type: 'button', onclick: () => { ql.tab = k; ql.sel = null; sfx('ui_click'); this.refresh(); } }, l)));
    const st = ql.list.scrollTop; clear(ql.list); clear(ql.det);
    const items = ql.tab === 'active' ? act.map((a) => a.q) : done.slice().reverse();
    if (!items.length) { ql.list.append(h('p.note', ql.tab === 'active' ? 'No quests. Look for folk with a lamp over their heads.' : 'Nothing finished yet.')); return; }
    if (!items.some((q) => q.id === ql.sel)) ql.sel = items[0].id;
    for (const q of items) { const a = act.find((x) => x.q === q); ql.list.append(h('button.q-item' + (q.id === ql.sel ? '.on' : '') + (a && a.done ? '.ready' : '') + (q.main ? '.main' : ''), { type: 'button', onclick: () => { ql.sel = q.id; sfx('ui_click'); this.refresh(); } }, h('b', q.name), h('small', a ? a.text : 'Completed'))); }
    ql.list.scrollTop = st;
    const q = items.find((x) => x.id === ql.sel), a = act.find((x) => x.q === q), cur = G.char.quests.active[q.id]?.step ?? q.steps.length;
    ql.det.append(h('h4', q.name), h('div.q-sub', `${q.main ? 'Main story' : 'Side quest'} · Level ${q.level || 1} · from ${NPCS[q.giver]?.name || '?'}${q.area && AREAS[q.area] ? ' · ' + AREAS[q.area].name : ''}`),
      h('div.q-text', (q.offer || []).map((l) => h('p', l))),
      h('div.sec-h', 'Objectives'),
      h('ul.q-steps', q.steps.map((s, i) => h('li' + (i < cur ? '.done' : i === cur ? '.cur' : ''), i === cur && a ? a.text : stepLabel(s))), h('li' + (a && a.done ? '.cur' : !a ? '.done' : ''), 'Return to ' + (NPCS[q.turnin || q.giver]?.name || '?'))),
      rewardRow(q),
      a ? h('div.row.end', btn('Abandon quest', () => U.confirm({ title: 'Abandon "' + q.name + '"?', text: 'Your progress on it will be lost.', yes: 'Abandon', danger: true }, () => g.abandonQuest(q.id)), 'danger')) : null);
  },
});

// ------------------------------------------------------------------ world map
// Where each area's cluster sits on the chart (column, row); anything new flows in after.
const AT = { wilds: [0, 1], hollow: [1, 1], forest: [2, 1], graveyard: [3, 1], march: [4, 0], castle: [4, 1], sewers: [1, 2], caves: [2, 2], catacombs: [3, 2], breach: [0, 0], guildhall: [1, 0], pit: [2, 0] };
let wm = {};
defineWin('map', {
  title: 'World Map', icon: 'map', pos: [0.5, 0.45], on: ['mapChanged', 'started'],
  build(body) {
    wm.info = h('div.wm-info', 'Select a place to read about it.'); wm.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); wm.svg.classList.add('wm-lines');
    wm.chart = h('div.wm-chart', wm.svg); wm.nodes = {};
    const fields = MAPS.filter((m) => m.kind !== 'dungeon' && m.kind !== 'raid'), byArea = {};
    for (const m of fields) (byArea[m.area] = byArea[m.area] || []).push(m);
    let extra = 0;
    for (const [aid, maps] of Object.entries(byArea)) {
      const A = AREAS[aid] || { name: aid, level: [1, 1] }, at = AT[aid] || [extra++ % 5, 3];
      const box = h('div.wm-area.a-' + aid + (A.under ? '.under' : ''), { style: { gridColumn: at[0] + 1, gridRow: at[1] + 1 } }, h('div.wm-an', A.name, maps.some((m) => m.level) ? h('small', ` Lv ${A.level[0]}–${A.level[1]}`) : null));
      const row = h('div.wm-maps');
      for (const m of maps) {
        row.append(wm.nodes[m.id] = h('button.wm-node.k-' + m.kind + (m.boss ? '.boss' : ''), { type: 'button', onclick: () => info(m) }, m.level ? h('i', String(m.level)) : null, h('span', m.kind === 'town' ? m.street || m.name : m.name)));
        for (const p of m.portals) if (p.dungeon) { const D = DUNGEONS.find((d) => d.id === p.dungeon); if (D) row.append(wm.nodes['d:' + D.id] = h('button.wm-node.k-' + D.kind, { type: 'button', onclick: () => info(null, D) }, h('i', String(D.level)), h('span', D.name))); }
      }
      box.append(row); wm.chart.append(box);
    }
    wm.wrap = h('div.wm-wrap.scroll', wm.chart);
    body.append(h('div.wm', wm.wrap, h('div.wm-foot', h('div.wm-legend', h('span.lg.town', 'Town'), h('span.lg.field', 'Wilds'), h('span.lg.boss', 'Lair of a named foe'), h('span.lg.dungeon', 'Dungeon'), h('span.lg.raid', 'Raid'), h('span.lg.here', 'You are here')), wm.info)));
  },
  refresh() {
    const M = G.map; for (const k in wm.nodes) wm.nodes[k].classList.remove('here');
    const here = M.instance ? wm.nodes['d:' + M.instance.id] : wm.nodes[M.def.id];
    if (here) { here.classList.add('here'); info(M.instance ? null : M.def, M.instance ? DUNGEONS.find((d) => d.id === M.instance.id) : null); }
    requestAnimationFrame(() => { lines(); if (here && wm.wrap.scrollWidth > wm.wrap.clientWidth) { const r = here.getBoundingClientRect(), w = wm.wrap.getBoundingClientRect(); wm.wrap.scrollLeft += r.left - w.left - w.width / 2 + r.width / 2; wm.wrap.scrollTop += r.top - w.top - w.height / 2; } });
  },
});
function lines() {
  const c = wm.chart.getBoundingClientRect(), k = wm.chart.offsetWidth / (c.width || 1), seen = new Set(); let s = '';
  const mid = (el) => { const r = el.getBoundingClientRect(); return [(r.left - c.left + r.width / 2) * k, (r.top - c.top + r.height / 2) * k]; };
  for (const m of MAPS) { const a = wm.nodes[m.id]; if (!a) continue;
    for (const p of m.portals) { const b = p.dungeon ? wm.nodes['d:' + p.dungeon] : wm.nodes[p.to]; if (!b) continue; const key = [m.id, p.dungeon ? 'd:' + p.dungeon : p.to].sort().join('>'); if (seen.has(key)) continue; seen.add(key);
      const [x1, y1] = mid(a), [x2, y2] = mid(b), cross = !p.dungeon && MAP.get(p.to)?.area !== m.area;
      s += `<path class="${p.dungeon ? 'dg' : cross ? 'cross' : ''}" d="M${x1.toFixed(0)},${y1.toFixed(0)} L${x2.toFixed(0)},${y2.toFixed(0)}"/>`; } }
  wm.svg.setAttribute('width', wm.chart.scrollWidth); wm.svg.setAttribute('height', wm.chart.scrollHeight); wm.svg.innerHTML = s;
}
function info(m, D) {
  for (const k in wm.nodes) wm.nodes[k].classList.remove('sel');
  if (D) { wm.nodes['d:' + D.id]?.classList.add('sel'); wm.info.innerHTML = `<b>${esc(D.name)}</b> · ${D.kind === 'raid' ? 'Raid for up to ' + D.party : 'Dungeon for a party of ' + D.party} · Level ${D.level}<br><span>Entrance: ${esc(MAP.get(D.entrance)?.name || '?')} · ${D.rooms.length} chambers · Master: <em>${esc(D.boss?.name || '?')}</em></span>`; return; }
  wm.nodes[m.id]?.classList.add('sel');
  const mobs = (m.mobs || []).map((x) => mobName(x[0])).slice(0, 6).join(', '), folk = (m.npcs || []).map((n) => NPCS[n.id]?.name).filter(Boolean).slice(0, 8).join(', ');
  wm.info.innerHTML = `<b>${esc(m.name)}</b>${m.street ? ' · ' + esc(m.street) : ''}${m.level ? ' · Level ' + m.level : ''}${m.boss ? ' · <em>' + esc(m.boss.name) + '</em>' : ''}<br><span>${mobs ? 'Haunted by: ' + esc(mobs) + '. ' : ''}${folk ? 'Folk: ' + esc(folk) + '.' : ''}${!mobs && !folk ? 'Leads to ' + esc(m.portals.map((p) => MAP.get(p.to)?.name).filter(Boolean).join(', ')) + '.' : ''}</span>`;
}

// ------------------------------------------------------------------ party / social
const guildTag = (name) => name ? h('span.gtag', { style: { color: guildOf(name)?.color || '#7ae0a0' } }, `<${name}>`) : null;
function personRow(a, acts) {
  const C = CLASSES[a.cls] || {};
  return h('div.person' + (a.dead ? '.dead' : ''), h('span.p-lv', String(a.lvl)), h('div.p-t', h('b', a.name), ' ', guildTag(a.guild), h('small', { style: { color: C.color } }, C.name || '')),
    a.maxHp ? h('span.p-hp', h('i', { style: { '--w': Math.max(0, a.hp / a.maxHp * 100) + '%' } })) : null, h('div.p-acts', acts));
}
let ps = {};
defineWin('party', {
  title: 'Party & Players', icon: 'talk', pos: [0.24, 0.42], on: ['party', 'mapChanged', 'started'],
  build(body) { ps.party = h('div'); ps.near = h('div'); ps.ph = h('div.sec-h'); body.append(h('div.social', ps.ph, ps.party, h('div.sec-h', 'Players nearby'), ps.near)); },
  tick() { this.refresh(); },
  refresh() {
    const g = G.game, P = G.player, list = g.partyList();
    ps.ph.textContent = list.length > 4 ? `Raid (${list.length + 1})` : `Party (${list.length + 1} / 5)`;
    clear(ps.party).append(personRow(P, h('span.note', 'Leader')));
    for (const p of list) ps.party.append(personRow(p, [btn('Inspect', () => playerMenu(p), 'sm'), btn('Kick', () => g.kick(p), 'sm danger')]));
    if (!list.length) ps.party.append(h('p.note', 'You travel alone. Invite someone below, or step into a dungeon: its gate gathers a party for you.'));
    const near = G.actors.filter((a) => a.kind === 'hero' && a.fake && !a.inParty && !a.dead && a.team !== 2).sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x)).slice(0, 14);
    clear(ps.near);
    if (!near.length) ps.near.append(h('p.note', 'Nobody about.'));
    for (const a of near) ps.near.append(personRow(a, [btn('Inspect', () => playerMenu(a), 'sm'), btn('Invite', () => g.invite(a), 'sm'), G.char.guild ? btn('Recruit', () => g.recruit(a), 'sm') : null]));
  },
});
/** The menu over another player: gear, invite, recruit. */
export function playerMenu(hero, infoIn) {
  const g = G.game; let info = infoIn || g.inspect(hero), close; const C = CLASSES[info.cls] || {};
  const gear = h('div.pm-gear');
  for (const s of SLOTS) { const it = info.equip && info.equip[s]; const row = h('div.pm-item', it ? itemIcon(it, info.cls) : h('div.iticon.none'), h('div', h('small', SLOT_NAME[s]), it ? h('b', { style: { color: rarityColor(it.rarity) } }, it.name + (it.plus ? ' +' + it.plus : '')) : h('b.none', 'Empty'))); if (it) U.tip(row, () => itemTip(it, { compare: false })); gear.append(row); }
  const acts = h('div.row.wrap.end');
  if (!hero.isPlayer) {
    if (info.inParty) acts.append(btn('Remove from party', () => { close(); g.kick(hero); }, 'danger'));
    else acts.append(btn('Invite to party', () => { close(); g.invite(hero); }, 'primary'));
    if (info.canRecruit) acts.append(btn('Recruit to guild', () => { close(); g.recruit(hero); }));
  }
  acts.append(btn('Close', () => close()));
  close = U.modal(h('div.panel.pmenu', h('div.pm-head', h('img', { src: new URL(`../../assets/sprites/select/${info.cls}.webp`, import.meta.url).href, draggable: false }),
    h('div', h('h3', info.name), guildTag(info.guild), h('div', { style: { color: C.color } }, `Level ${info.lvl} ${C.name || ''}`), h('small.note', info.companion ? 'Your sworn companion' : info.inParty ? 'In your party' : info.friend >= 2 ? 'Thinks well of you' : info.bad ? 'Has a sour look' : 'A stranger'))),
    h('div.sec-h', 'Gear'), gear, acts), { cls: 'light', id: 'pmenu', block: false });
}

// ------------------------------------------------------------------ guild
let gd = {};
defineWin('guild', {
  title: 'Guild', icon: 'home', pos: [0.5, 0.42], on: ['bag', 'party', 'mapChanged', 'started'],
  build(body) { gd.body = body; },
  refresh() {
    const c = G.char, g = G.game, gu = c.guild, b = clear(gd.body);
    if (!gu) {
      b.append(h('div.guild', h('h4', 'You answer to no banner'), h('p', 'A guild is a charter, a hall and a handful of sworn companions who walk with you. The registrar on Chapel Row, in Herrington Hollow, will write one for a hero of standing.'),
        h('ul.q-steps', h('li' + (c.lvl >= 10 ? '.done' : '.cur'), `Reach level 10 (you are ${c.lvl})`), h('li' + (c.gold >= 5000 ? '.done' : '.cur'), `Bring 5,000 gold (you carry ${fmt(c.gold)})`), h('li.cur', 'Speak with the registrar and name your guild')),
        h('p.note', 'A chartered guild opens the Charterhouse, lets you recruit up to four companions, and its hall can be improved for lasting boons.')));
      return;
    }
    const inHall = G.map.def.kind === 'hall', comps = G.roster.filter((f) => f.companion);
    const up = h('div.hall-ups');
    for (const k in g.HALL_UP) { const U2 = g.HALL_UP[k], r = gu.up[k] || 0, cost = g.hallCost(k), bb = btn(r >= 5 ? 'Complete' : `${fmt(cost)} gold`, () => g.hallUpgrade(k), 'sm primary'); bb.disabled = !inHall || r >= 5 || c.gold < cost;
      up.append(h('div.hall-up', h('div', h('b', U2.name), h('small', U2.desc)), h('span.pips', Array.from({ length: 5 }, (_, i) => h('i' + (i < r ? '.on' : '')))), bb)); }
    b.append(h('div.guild',
      h('div.g-banner', h('div.g-crest', gu.name.slice(0, 1).toUpperCase()), h('div', h('h4', `<${gu.name}>`), h('div.g-stats', h('span', 'Level ', h('b', String(gu.level))), h('span', 'Renown ', h('b', fmt(gu.renown || 0))), h('span', 'Companions ', h('b', `${comps.length} / 4`))))),
      h('div.sec-h', 'Sworn companions'),
      comps.length ? comps.map((f) => { const a = G.actors.find((x) => x.fake === f); return h('div.person', h('span.p-lv', String(a ? a.lvl : f.lvl)), h('div.p-t', h('b', f.name), h('small', { style: { color: CLASSES[f.cls]?.color } }, CLASSES[f.cls]?.name || '')), h('div.p-acts', a ? btn('Dismiss', () => U.confirm({ title: 'Dismiss ' + f.name + '?', text: 'They will leave your guild and your party.', yes: 'Dismiss', danger: true }, () => g.kick(a)), 'sm danger') : h('span.note', 'away'))); })
        : h('p.note', 'None yet. Greet another player (F) and choose Recruit; those you have fought beside agree more readily.'),
      h('div.sec-h', 'The Charterhouse'), up,
      h('p.note', inHall ? 'You stand in your hall: improvements may be bought.' : 'Improvements are bought inside the Charterhouse, through the door on Chapel Row.')));
  },
});
export function initWorld() { U.playerMenu = playerMenu; }
