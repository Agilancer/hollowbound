// Touch controls: a virtual stick on the left, and on the right a big Attack, Jump, an arc
// of skill buttons (four at a time, with a page toggle), potions, interact and AUTO. Each
// control captures its own pointer, so moving, attacking and jumping at once just works.
import { G } from '../state.js';
import { press, release } from '../core/input.js';
import { h, A, ICON, sfx, setText, setCls } from './dom.js';
import { makeSlot, hold } from './hud.js';

let el = {}, page = 0, on = false;
const DIRS = ['left', 'right', 'up', 'down'];

export function initTouch(root) {
  // ---- stick
  el.nub = h('div.stick-nub'); el.base = h('div.stick-base', el.nub); el.stick = h('div#stick', el.base);
  let pid = null, held = {};
  const set = (want) => { for (const d of DIRS) { if (want[d] && !held[d]) press(d); else if (!want[d] && held[d]) release(d); held[d] = !!want[d]; } };
  const move = (e) => {
    const r = el.base.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const d = Math.hypot(dx, dy), m = R * 0.62;
    if (d > m) { dx *= m / d; dy *= m / d; }
    el.nub.style.transform = `translate(${dx.toFixed(0)}px,${dy.toFixed(0)}px)`;
    const nx = dx / m, ny = dy / m; set({ left: nx < -0.34, right: nx > 0.34, up: ny < -0.6, down: ny > 0.6 });
  };
  const end = (e) => { if (e.pointerId !== pid) return; pid = null; set({}); el.nub.style.transform = ''; el.stick.classList.remove('held'); };
  el.stick.addEventListener('pointerdown', (e) => { if (pid !== null) return; e.preventDefault(); pid = e.pointerId; try { el.stick.setPointerCapture(pid); } catch {} el.stick.classList.add('held'); move(e); });
  el.stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
  el.stick.addEventListener('pointerup', end); el.stick.addEventListener('pointercancel', end); el.stick.addEventListener('lostpointercapture', end);
  el.stick.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- right cluster
  const b = (cls, action, kids, also) => { const x = h('button.tb.' + cls, { type: 'button' }, kids); hold(x, action, also); return x; };
  const atk = makeSlot(-1, '', 'tb.t-atk'); hold(atk.el, 'attack');
  const pad = h('div#pad', atk.el, b('t-jump', 'jump', [h('img', { src: ICON('jump'), draggable: false }), h('span', 'Jump')]));
  el.sk = [];
  for (let i = 0; i < 4; i++) {
    const s = makeSlot(() => page * 4 + i, '', 'tb.t-sk.k' + i), num = h('span.key', String(i + 1)); s.el.append(num); s.num = num; s.i = i;
    const up = () => { if (s.el._a) { release(s.el._a); s.el._a = null; s.el.classList.remove('held'); } };
    s.el.addEventListener('pointerdown', (e) => { e.preventDefault(); try { s.el.setPointerCapture(e.pointerId); } catch {} s.el._a = 's' + (page * 4 + i + 1); press(s.el._a); s.el.classList.add('held'); });
    s.el.addEventListener('pointerup', up); s.el.addEventListener('pointercancel', up); s.el.addEventListener('lostpointercapture', up); s.el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.sk.push(s); pad.append(s.el);
  }
  el.hpN = h('span.cnt'); el.mpN = h('span.cnt'); el.pageN = h('b', '1–4');
  el.hpB = b('t-o.o1', 'potion', [h('img', { src: A('ui/potion_red.png'), draggable: false }), el.hpN]);
  el.mpB = b('t-o.o2', 'mpotion', [h('img', { src: A('ui/potion_blue.png'), draggable: false }), el.mpN]);
  el.auto = b('t-o.o5.t-auto', 'auto', [h('b', 'AUTO')]);
  pad.append(b('t-o.o0', 'interact', [h('img', { src: ICON('take'), draggable: false })], 'loot'), el.hpB, el.mpB,
    h('button.tb.t-o.o3.t-page', { type: 'button', 'aria-label': 'Next skills', onclick: () => { page = 1 - page; setText(el.pageN, page ? '5–8' : '1–4'); for (const s of el.sk) setText(s.num, String(page * 4 + s.i + 1)); sfx('ui_click'); } }, h('span', '⟳'), el.pageN),
    el.auto);
  el.pad = pad;
  root.append(el.stick, pad);

  // ---- when to show
  const show = (v) => { if (on === v) return; on = v; document.body.classList.toggle('touch', v); if (!v) set({}); dispatchEvent(new Event('resize')); };
  if (matchMedia('(pointer: coarse)').matches) show(true);
  addEventListener('touchstart', () => show(true), { passive: true, capture: true });
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') show(true); }, { passive: true, capture: true });
  addEventListener('keydown', (e) => { if (!on || /INPUT|TEXTAREA/.test(e.target.tagName) || e.key === 'Unidentified' || e.isComposing) return; show(false); });
  if (new URLSearchParams(location.search).has('touch')) show(true);
}
export function touchFrame() {
  if (!on || G.mode !== 'play' || !G.char) return; const c = G.char;
  setText(el.hpN, String(c.potions.hp || 0)); setText(el.mpN, String(c.potions.mp || 0)); setCls(el.auto, 'on', G.auto);
  setCls(el.mpB, 'none', c.cls === 'barbarian' || !(c.potions.mp > 0)); setCls(el.hpB, 'none', !(c.potions.hp > 0));
}
