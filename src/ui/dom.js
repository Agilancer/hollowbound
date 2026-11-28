// Small DOM helpers shared by every UI module, plus `U`: the registry the modules hang
// their public functions on (openWin, toast, confirm, tip ...) so they need not import
// each other in circles.
import { audio } from '../core/audio.js';
import { asset } from '../core/paths.js';

export const U = { shop: null, storage: false };
export const A = asset;
export const KIT = (p) => asset('ui/kit/' + p);
export const ICON = (n) => asset('ui/kit/icons/' + n + '.webp');

/** h('div.a.b#id', {props}, ...children) */
export function h(sel, props, ...kids) {
  const m = sel.split(/(?=[.#])/), el = document.createElement(m[0] || 'div');
  for (let i = 1; i < m.length; i++) { if (m[i][0] === '#') el.id = m[i].slice(1); else el.classList.add(m[i].slice(1)); }
  if (props != null && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  if (props) for (const k in props) {
    const v = props[k]; if (v == null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else for (const s in v) { if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; } }
    else if (k === 'data') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, v); } }
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}
export function add(el, kids) { for (const k of kids) { if (k == null || k === false) continue; if (Array.isArray(k)) add(el, k); else el.append(k.nodeType ? k : document.createTextNode(String(k))); } return el; }
// el.put(...kids): like append(), but skips null/false and flattens arrays (what every builder here wants)
Element.prototype.put = function (...kids) { add(this, kids); return this; };
export const clear = (el) => { el.textContent = ''; return el; };
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
export const sfx = (n, o) => { try { audio.sfx(n, o); } catch {} };
/** Set text only when it changed (frame-rate safe). */
export function setText(el, v) { if (el._t !== v) { el._t = v; el.textContent = v; } }
export function setCls(el, cls, on) { on = !!on; const k = '_c' + cls; if (el[k] !== on) { el[k] = on; el.classList.toggle(cls, on); } }
export function setVar(el, name, v) { const k = '_v' + name; if (el[k] !== v) { el[k] = v; el.style.setProperty(name, v); } }
/** A button with the click sound. */
export function btn(label, fn, cls = '') {
  const b = h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button' }, label);
  b.addEventListener('click', (e) => { if (b.disabled) return; sfx('ui_click'); fn && fn(e); });
  return b;
}
export function toggle(label, get, set) {
  const box = h('span.chk'), el = h('label.toggle', { role: 'switch', tabIndex: 0 }, box, h('span', label));
  const sync = () => el.classList.toggle('on', !!get());
  el.addEventListener('click', () => { set(!get()); sync(); sfx('ui_click'); }); sync(); el.sync = sync;
  return el;
}
export const isPhone = () => matchMedia('(max-width: 760px), (max-height: 520px)').matches;
export const titleCase = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// image cache for canvas crops
const imgs = new Map();
export function loadImg(url) {
  let p = imgs.get(url);
  if (!p) { p = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; }); imgs.set(url, p); }
  return p;
}
const jsons = new Map();
export function loadJson(url) { let p = jsons.get(url); if (!p) { p = fetch(url).then((r) => r.json()).catch(() => null); jsons.set(url, p); } return p; }
/** A canvas showing a rect of an image, fitted and centred. */
export function cropCanvas(url, rect, size = 48, cls = '') {
  const c = h('canvas' + (cls ? '.' + cls : ''), { width: size, height: size });
  loadImg(url).then((img) => {
    if (!img) return; const [x, y, w, hh] = rect || [0, 0, img.naturalWidth, img.naturalHeight];
    const k = Math.min(size / w, size / hh), dw = w * k, dh = hh * k, g = c.getContext('2d');
    g.imageSmoothingQuality = 'high'; g.drawImage(img, x, y, w, hh, (size - dw) / 2, (size - dh) / 2, dw, dh);
  });
  return c;
}
