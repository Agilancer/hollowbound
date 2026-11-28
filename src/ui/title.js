// Title screen and class select.
import { G } from '../state.js';
import { CLASSES, CLASS_IDS } from '../data/game.js';
import { ATTRS } from '../data/velscour/classes.js';
import { h, U, A, clear, sfx, btn } from './dom.js';

const NAMES = ['Aldric', 'Mirelle', 'Osric', 'Ysolde', 'Bram', 'Corvin', 'Elspeth', 'Maeve', 'Silas', 'Tamsin', 'Varric', 'Halvard', 'Brina', 'Ottilie', 'Anselm', 'Isolde', 'Lucan', 'Kestrel'];
let el = {}, pick = CLASS_IDS[0], ready = false, busy = false;

export function initTitle(root) {
  const embers = h('div.embers'); for (let i = 0; i < 28; i++) embers.append(h('i', { style: { left: (Math.random() * 100).toFixed(1) + '%', animationDuration: (7 + Math.random() * 9).toFixed(1) + 's', animationDelay: (-Math.random() * 16).toFixed(1) + 's', '--dx': (Math.random() * 120 - 60).toFixed(0) + 'px', '--s': (0.5 + Math.random()).toFixed(2) } }));
  el.actions = h('div.title-actions', h('div.title-loading', h('span.spin'), 'Waking the Hollow…'));
  el.main = h('div.title-main', h('img.title-logo', { src: A('ui/title_hollowbound.webp'), alt: 'Velscour: Hollowbound', draggable: false }), h('p.tagline', 'A world built upon something that should have stayed dead.'), el.actions,
    h('p.title-foot', 'Keyboard, gamepad or touch  ·  your hero is saved on this device'));
  el.grid = h('div.cs-grid.scroll'); el.det = h('div.cs-det');
  el.select = h('div.title-select.hide', h('h2', 'Choose who wakes'), h('div.cs-main', el.grid, el.det));
  el.root = h('div#title', h('div.title-bg', h('div.fog.f1'), h('div.fog.f2'), h('div.moon'), embers, h('div.vignette')), el.main, el.select);
  root.append(el.root);
  U.toTitle = (deleted) => { if (deleted) G.char = null; G.mode = 'title'; G.paused = false; U.hudShow(false); U.chatShow(false); el.root.classList.remove('hide', 'out'); showMain(); };
}
export function titleFatal(title, msg) {
  if (!el.root) return; el.root.classList.remove('hide');
  clear(el.actions).append(h('div.fatal', h('h3', title), h('p', msg)));
}
export function titleReady() { ready = true; showMain(); }
function showMain() {
  if (!ready) return; el.select.classList.add('hide'); el.main.classList.remove('hide'); clear(el.actions); busy = false;
  const g = G.game, info = g.hasSave() ? g.saveInfo() : null;
  if (info) el.actions.append(h('button.tbtn.primary', { type: 'button', onclick: () => start(() => g.loadGame()) }, h('b', 'Continue'), h('small', `${info.name}  ·  Level ${info.lvl} ${CLASSES[info.cls]?.name || ''}${info.map ? '  ·  ' + info.map : ''}`)));
  el.actions.append(h('button.tbtn' + (info ? '' : '.primary'), { type: 'button', onclick: () => { sfx('ui_open'); showSelect(); } }, h('b', 'New Game'), info ? h('small', 'Begin again with a new hero') : h('small', 'Nineteen callings. One Hollow.')));
}
async function start(fn) {
  if (busy) return; busy = true; sfx('ui_click'); el.root.classList.add('out');
  try { await fn(); } catch (e) { console.error(e); busy = false; el.root.classList.remove('out'); U.toast && U.toast('That save could not be read.'); }
}
function showSelect() {
  el.main.classList.add('hide'); el.select.classList.remove('hide'); clear(el.grid);
  for (const id of CLASS_IDS) { const C = CLASSES[id]; el.grid.append(h('button.cs-card' + (id === pick ? '.on' : ''), { type: 'button', data: { id }, style: { '--cc': C.color }, onclick: () => { pick = id; sfx('ui_click'); for (const c of el.grid.children) c.classList.toggle('on', c.dataset.id === id); detail(); } }, h('img', { src: A('sprites/select/' + id + '.webp'), alt: '', draggable: false, loading: 'lazy' }), h('span', C.name))); }
  if (!el.name) el.name = h('input.inp.cs-name', { type: 'text', maxLength: 14, placeholder: 'Name your hero', spellcheck: false, autocomplete: 'off', value: NAMES[Math.floor(Math.random() * NAMES.length)] });
  detail();
}
function detail() {
  const C = CLASSES[pick], g = G.game;
  const begin = () => { const name = el.name.value.trim().replace(/\s+/g, ' ').slice(0, 14) || 'Hero'; const go = () => start(() => g.newGame({ name, cls: pick })); if (g.hasSave()) U.confirm({ title: 'Begin a new hero?', text: 'Your saved hero will be replaced once the new one sets out.', yes: 'Begin anew', danger: true }, go); else go(); };
  el.name.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') begin(); };
  clear(el.det).append(
    h('img.cs-art', { src: A('sprites/select/' + pick + '.webp'), alt: C.name, draggable: false }),
    h('div.cs-info',
      h('h3', { style: { color: C.color } }, C.name), h('div.cs-prim', `Primary attribute: ${ATTRS[C.primary]?.name || C.primary}  ·  ${C.weapon ? C.weapon[0].toUpperCase() + C.weapon.slice(1) : ''}${C.offhand ? ' & ' + C.offhand : ''}`),
      h('p', C.desc),
      h('div.cs-trees', C.trees.map((t) => h('span', t))),
      h('div.cs-go', el.name, btn('Begin', begin, 'primary big')),
      h('div.row', btn('‹ Back', () => showMain(), 'sm'))));
}
export function titleEvent(e) { if (e.type === 'started') { el.root.classList.add('hide'); el.root.classList.remove('out'); busy = false; } }
