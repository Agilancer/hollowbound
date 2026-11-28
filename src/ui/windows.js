// Window manager: name-tagged, draggable windows (full-screen sheets on phones), a layer
// stack so Esc closes the top thing, tooltips, modals and confirms.
import { G } from '../state.js';
import { h, U, ICON, clear, sfx, btn, isPhone } from './dom.js';

const defs = {}, wins = {}, layers = [];
let layerEl, tipEl, z = 20, dirty = new Set(), tickT = 0;

export function defineWin(id, def) { defs[id] = def; }

export function initWindows(root) {
  layerEl = h('div#wins'); tipEl = h('div#tip.hide'); root.put(layerEl, tipEl);
  Object.assign(U, { openWin, closeWin, toggleWin, closeTop, isOpen: (id) => !!wins[id]?.open, refreshWin: (id) => dirty.add(id), tip, hideTip, modal, confirm, pushLayer, popLayer,
    blocking: () => layers.some((l) => l.block), anyOpen: () => layers.length > 0, closeAll, layer: layerEl, nextZ: () => ++z });
}
function pushLayer(l) { popLayer(l.id); layers.push(l); return l; }
function popLayer(id) { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); }
function closeTop() { const l = layers[layers.length - 1]; if (!l) return false; if (l.locked) return true; l.close(); sfx('ui_close'); return true; }
function closeAll() { for (const l of layers.slice().reverse()) if (!l.locked) l.close(); hideTip(); }

function openWin(id, arg) {
  const def = defs[id]; if (!def || G.mode !== 'play') return;
  let w = wins[id];
  if (!w) {
    const body = h('div.win-b.scroll'), title = h('h3', def.title);
    const head = h('header.win-h', def.icon ? h('img.win-ic', { src: ICON(def.icon), draggable: false }) : null, title, h('button.x', { type: 'button', 'aria-label': 'Close', onclick: () => { closeWin(id); sfx('ui_close'); } }, h('img', { src: ICON('close'), draggable: false })));
    const el = h('section.win.w-' + id, { role: 'dialog', 'aria-label': def.title }, head, body);
    w = wins[id] = { el, body, head, title, open: false, placed: false };
    el.addEventListener('pointerdown', () => front(w), true);
    drag(w);
    def.build && def.build(body, w);
  }
  if (!w.open) { layerEl.put(w.el); w.open = true; sfx('ui_open'); }
  front(w); pushLayer({ id: 'win:' + id, close: () => closeWin(id) });
  def.open && def.open(arg); def.refresh && def.refresh();
  if (!w.placed) { w.placed = true; place(w, def); }
  if (def.pause) G.paused = true;
}
function place(w, def) {
  const r = w.el.getBoundingClientRect(), p = def.pos || [0.5, 0.42];
  w.el.style.left = Math.round(Math.max(8, Math.min(innerWidth - r.width - 8, innerWidth * p[0] - r.width / 2))) + 'px';
  w.el.style.top = Math.round(Math.max(8, Math.min(innerHeight - r.height - 8, innerHeight * p[1] - r.height / 2))) + 'px';
}
function front(w) { w.el.style.zIndex = ++z; }
function closeWin(id) {
  const w = wins[id]; if (!w || !w.open) return; w.open = false; w.el.remove(); popLayer('win:' + id); hideTip();
  const def = defs[id]; def.close && def.close(); if (def.pause) G.paused = false;
}
function toggleWin(id) { if (wins[id]?.open) { closeWin(id); sfx('ui_close'); } else openWin(id); }
function drag(w) {
  let sx, sy, ox, oy, on = false;
  w.head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || isPhone() || e.button > 0) return;
    on = true; sx = e.clientX; sy = e.clientY; ox = w.el.offsetLeft; oy = w.el.offsetTop; w.head.setPointerCapture(e.pointerId);
  });
  w.head.addEventListener('pointermove', (e) => { if (!on) return; w.el.style.left = Math.max(-w.el.offsetWidth + 80, Math.min(innerWidth - 80, ox + e.clientX - sx)) + 'px'; w.el.style.top = Math.max(0, Math.min(innerHeight - 40, oy + e.clientY - sy)) + 'px'; });
  const up = () => { on = false; }; w.head.addEventListener('pointerup', up); w.head.addEventListener('pointercancel', up);
}
export function winEvent(e) {
  if (e.type === 'started') { for (const id in wins) closeWin(id); return; }
  for (const id in wins) if (wins[id].open && defs[id].on && defs[id].on.includes(e.type)) dirty.add(id);
}
export function winFrame(dt) {
  if (dirty.size) { for (const id of dirty) if (wins[id]?.open) { try { defs[id].refresh && defs[id].refresh(); } catch (err) { console.error(err); } } dirty.clear(); }
  tickT += dt; if (tickT > 0.5) { tickT = 0; for (const id in wins) if (wins[id].open && defs[id].tick) defs[id].tick(); }
}

// ------------------------------------------------------------------ tooltip
let tipOwner = null;
function tip(el, fn) {
  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse') return; const c = fn(); if (!c) return; tipOwner = el; clear(tipEl); if (typeof c === 'string') tipEl.innerHTML = c; else tipEl.put(c); tipEl.classList.remove('hide'); moveTip(e); });
  el.addEventListener('pointermove', (e) => { if (tipOwner === el) moveTip(e); });
  el.addEventListener('pointerleave', () => { if (tipOwner === el) hideTip(); });
  return el;
}
function moveTip(e) {
  const w = tipEl.offsetWidth, hh = tipEl.offsetHeight; let x = e.clientX + 18, y = e.clientY + 14;
  if (x + w > innerWidth - 6) x = e.clientX - w - 14; if (y + hh > innerHeight - 6) y = Math.max(6, innerHeight - hh - 6);
  tipEl.style.transform = `translate(${Math.max(4, x)}px,${y}px)`;
}
function hideTip() { tipOwner = null; tipEl.classList.add('hide'); }

// ------------------------------------------------------------------ modals
let mid = 0;
/** A centred modal over a dim backdrop. Returns close(). opts: { cls, block, locked, onClose, backdropClose } */
function modal(node, opts = {}) {
  const id = 'modal:' + (opts.id || ++mid), back = h('div.modal-back' + (opts.cls ? '.' + opts.cls : ''), node);
  const close = () => { if (!back.isConnected) return; back.remove(); popLayer(id); opts.onClose && opts.onClose(); };
  if (opts.backdropClose !== false && !opts.locked) back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  popLayer(id); document.getElementById('ui').put(back); back.style.zIndex = opts.z || 400;
  pushLayer({ id, close, block: opts.block !== false, locked: !!opts.locked });
  hideTip();
  return close;
}
function confirm(o, onYes) {
  let close; const box = h('div.panel.confirm', h('h3', o.title || 'Are you sure?'), o.text ? h('p', o.text) : null,
    h('div.row.end', btn(o.no || 'Cancel', () => close()), btn(o.yes || 'Confirm', () => { close(); onYes && onYes(); }, o.danger ? 'danger' : 'primary')));
  close = modal(box, { z: 600 }); return close;
}
