// Bestiary and Settings.
import { G } from '../state.js';
import { audio } from '../core/audio.js';
import { ELEM } from '../data/velscour/elem.js';
import { BEST } from '../game/bestiary.js';
import { h, U, clear, sfx, btn, toggle, titleCase, loadImg } from './dom.js';
import { defineWin } from './windows.js';

// ------------------------------------------------------------------ bestiary
const GROUP = { set1: 'Old Foes', set2: 'The Restless', set3: 'Horrors Abroad', va: 'Named & Notable', slimes: 'Slimes', castle: 'Thornwall', depths_edge: "Depth's Edge", dungeon_horrors: 'Dungeon Horrors', breach: 'The Breach', phobos: 'Phobos', sand: 'The Sands', sand2: 'Deep Sands', sea_of_sand: 'Sea of Sand', heavenly: 'The Heavens', air: 'Things of the Air', familiars: 'Familiars', minions: 'Minions' };
const PER = 40;
let be = { grp: null, page: 0, q: '' };
function thumb(d) {
  const c = h('canvas', { width: 128, height: 128 });
  loadImg(d.url).then((img) => {
    if (!img || !c.isConnected) return; const g = c.getContext('2d');
    const [x, y, w, hh] = d.slime ? [0, 0, d.slime.cw, d.slime.ch] : [d.x, d.y, d.w, d.h];
    const k = Math.min(120 / w, 120 / hh, 4); g.imageSmoothingEnabled = k < 2; g.drawImage(img, x, y, w, hh, (128 - w * k) / 2, 124 - hh * k, w * k, hh * k);
  });
  return c;
}
defineWin('bestiary', {
  title: 'Bestiary', icon: 'slot_skull', pos: [0.5, 0.42],
  build(body) {
    be.groups = h('div.be-groups.scroll'); be.grid = h('div.be-grid.scroll'); be.pager = h('div.be-pager');
    be.search = h('input.inp', { type: 'search', placeholder: 'Search every creature…', maxLength: 30, oninput: () => { be.q = be.search.value.trim().toLowerCase(); be.page = 0; this.refresh(); } });
    body.put(h('div.bestiary', h('div.be-top', be.search, be.pager), be.groups, be.grid));
  },
  refresh() {
    const keys = Object.keys(BEST.groups).sort((a, b) => (Object.keys(GROUP).indexOf(a) + 99) % 99 - (Object.keys(GROUP).indexOf(b) + 99) % 99);
    if (!be.grp || !BEST.groups[be.grp]) be.grp = keys.includes('slimes') ? 'slimes' : keys[0];
    clear(be.groups);
    for (const k of keys) be.groups.put(h('button.chip' + (k === be.grp && !be.q ? '.on' : ''), { type: 'button', onclick: () => { be.grp = k; be.page = 0; be.q = ''; be.search.value = ''; sfx('ui_click'); this.refresh(); } }, GROUP[k] || titleCase(k), h('small', String(BEST.groups[k].length))));
    const list = be.q ? BEST.list.filter((d) => d.name.toLowerCase().includes(be.q)) : BEST.groups[be.grp] || [];
    const pages = Math.max(1, Math.ceil(list.length / PER)); be.page = Math.max(0, Math.min(pages - 1, be.page));
    const go = (d) => { be.page += d; sfx('ui_click'); this.refresh(); be.grid.scrollTop = 0; };
    const prev = btn('‹', () => go(-1), 'sm'), next = btn('›', () => go(1), 'sm'); prev.disabled = be.page <= 0; next.disabled = be.page >= pages - 1;
    clear(be.pager).put(prev, h('span', `${be.page + 1} / ${pages}`), next, h('small', `${list.length.toLocaleString('en-US')} of ${BEST.list.length.toLocaleString('en-US')}`));
    clear(be.grid);
    if (!list.length) be.grid.put(h('p.note', 'No creature answers to that name.'));
    for (const d of list.slice(be.page * PER, be.page * PER + PER)) {
      const E = ELEM[d.el] || ELEM.phys, tags = [d.boss && ['Boss', 'boss'], d.undead && ['Undead'], d.demon && ['Demon'], d.fly && ['Flying'], d.lone && ['Solitary'], d.arch && [titleCase(d.arch)]].filter(Boolean).slice(0, 3);
      be.grid.put(h('div.be-card' + (d.boss ? '.boss' : ''), thumb(d), h('b', d.name), h('div.be-tags', h('span.tg', { style: { color: E.glow, borderColor: E.dark } }, E.name), tags.map(([t, c]) => h('span.tg' + (c ? '.' + c : ''), t)))));
    }
  },
});

// ------------------------------------------------------------------ settings
const KEYS = [['Move', '← → / A D'], ['Climb, enter portals', '↑ / W'], ['Drop down', '↓ + Jump'], ['Jump', 'Space / Alt / K'], ['Attack', 'X / Ctrl / J'], ['Skills', '1 – 8'], ['Potions', 'Q life · E mana'], ['Talk, use', 'F'], ['Pick up loot', 'Z'], ['Auto-play', 'T'], ['Chat', 'Enter'],
  ['Bag · Hero · Skills', 'I · C · V'], ['Quests · Map · Party', 'L · M · P'], ['Guild · Bestiary', 'G · B'], ['Close / Menu', 'Esc']];
let se = {};
defineWin('menu', {
  title: 'Menu', icon: 'settings', pos: [0.5, 0.42], pause: true,
  build(body) { se.body = body; },
  refresh() {
    const S = G.settings, g = G.game, keep = () => { if (G.char) G.char.settings = { ...S }; };
    const slider = (label, k) => { const out = h('output', Math.round(S[k] * 100) + '%'); return h('label.slider', h('span', label), h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(S[k] * 100), oninput: (e) => { S[k] = e.target.value / 100; out.textContent = e.target.value + '%'; try { audio.setVolume(k, S[k]); } catch {} keep(); }, onchange: () => { if (k === 'sfx') sfx('coin'); } }), out); };
    clear(se.body).put(h('div.settings',
      h('div.set-col',
        h('div.sec-h', 'Sound'), slider('Music', 'music'), slider('Effects', 'sfx'), slider('Ambience', 'amb'),
        h('div.sec-h', 'Display'),
        toggle('Show names over heads', () => S.names, (v) => { S.names = v; keep(); }),
        toggle('Damage numbers', () => S.dmgNumbers, (v) => { S.dmgNumbers = v; keep(); }),
        h('div.row', h('span', 'Quality'), h('div.seg', [['High', 1], ['Low', 0]].map(([l, v]) => h('button.tab' + ((S.quality >= 1) === (v >= 1) ? '.on' : ''), { type: 'button', onclick: () => { S.quality = v; keep(); sfx('ui_click'); dispatchEvent(new Event('resize')); this.refresh(); } }, l)))),
        h('div.sec-h', 'Game'),
        h('div.col', btn('Resume', () => U.closeWin('menu'), 'primary wide'), btn('Save now', () => { g.save(); U.toast('Game saved.'); }, 'wide'),
          btn('Return to title', () => { g.save(); U.closeAll(); U.toTitle(); }, 'wide'),
          btn('Delete save…', () => U.confirm({ title: 'Delete this hero?', text: `${G.char.name}, level ${G.char.lvl}, will be erased from this device for good.`, yes: 'Delete forever', danger: true }, () => { g.deleteSave(); U.closeAll(); U.toTitle(true); }), 'wide danger'))),
      h('div.set-col', h('div.sec-h', 'Controls'), h('table.keys', KEYS.map(([a, k]) => h('tr', h('td', a), h('td', k)))),
        h('p.note', 'Gamepad: stick or d-pad to move, A jump, X attack, B/Y/LB/RB skills, LT potion. On a phone: the left stick moves (push up to climb or enter), the right-hand ring holds your skills.'))));
  },
});
