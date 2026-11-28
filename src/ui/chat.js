// The chat log: bottom-left, translucent, fading when idle, with channel tabs and an
// input that takes the keyboard away from the game while it has focus.
import { G } from '../state.js';
import { guildOf } from '../game/social.js';
import { h, U, clear, sfx } from './dom.js';

const MAX = 60, TABS = [['all', 'All'], ['party', 'Party'], ['guild', 'Guild'], ['shout', 'World']];
let el = {}, lines = [], tab = 'all', idle = 0, stick = true;

export function initChat(root) {
  el.log = h('div.chat-log.scroll'); el.tabs = h('div.chat-tabs');
  el.input = h('input.chat-in', { type: 'text', maxLength: 120, placeholder: 'Press Enter to speak…', autocomplete: 'off', spellcheck: false, enterKeyHint: 'send' });
  for (const [k, l] of TABS) el.tabs.append(h('button' + (k === tab ? '.on' : ''), { type: 'button', data: { k }, onclick: () => { tab = k; for (const b of el.tabs.children) b.classList.toggle('on', b.dataset.k === k); rebuild(); wake(); sfx('ui_click'); } }, l));
  el.root = h('div#chat.hide', el.tabs, el.log, h('div.chat-row', el.input, h('button.chat-send', { type: 'button', 'aria-label': 'Send', onclick: send }, '➤')));
  root.append(el.root);
  el.input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { send(); el.input.blur(); } else if (e.key === 'Escape') { el.input.value = ''; el.input.blur(); } });
  el.input.addEventListener('focus', () => { el.root.classList.add('open'); wake(); });
  el.input.addEventListener('blur', () => { el.root.classList.remove('open'); });
  el.log.addEventListener('scroll', () => { stick = el.log.scrollTop + el.log.clientHeight >= el.log.scrollHeight - 12; wake(); }, { passive: true });
  el.root.addEventListener('pointerenter', wake); el.root.addEventListener('pointerdown', wake);
  el.log.addEventListener('click', () => { if (document.body.classList.contains('touch')) el.input.focus(); });
  U.chatFocus = () => { el.input.focus(); };
  U.chatLine = (text, chan = 'sys') => push({ chan, text });
}
function send() { const t = el.input.value.trim(); el.input.value = ''; if (t && G.game) G.game.chatSend(t); }
function wake() { idle = 0; el.root.classList.remove('idle'); }
const shows = (l) => tab === 'all' || l.chan === tab;
function lineEl(l) {
  const d = h('div.cl.c-' + l.chan);
  if (l.from) { const tag = { shout: '[World] ', party: '[Party] ', guild: '[Guild] ' }[l.chan]; if (tag) d.append(h('span.ch', tag)); if (l.guild) d.append(h('span.g', { style: { color: guildOf(l.guild)?.color || '#7ae0a0' } }, `<${l.guild}> `)); d.append(h('b', l.from + ': ')); }
  d.append(l.text); return d;
}
function push(l) {
  lines.push(l); if (lines.length > MAX) lines.shift();
  if (shows(l)) { el.log.append(lineEl(l)); while (el.log.children.length > MAX) el.log.firstChild.remove(); if (stick) el.log.scrollTop = el.log.scrollHeight; }
  wake();
}
function rebuild() { clear(el.log); for (const l of lines) if (shows(l)) el.log.append(lineEl(l)); el.log.scrollTop = el.log.scrollHeight; stick = true; }
export function chatEvent(e) {
  switch (e.type) {
    case 'started': lines = []; rebuild(); el.root.classList.remove('hide'); push({ chan: 'sys', text: 'You wake in Velscour. Press Enter to speak.' }); break;
    case 'chat': push({ chan: e.chan || 'say', from: e.from, text: e.text, guild: e.guild }); break;
    case 'gotItem': if (e.item) push({ chan: 'sys', text: 'You receive: ' + e.item.name + '.' }); break;
    case 'levelUp': push({ chan: 'sys', text: 'You have reached level ' + e.lvl + '.' }); break;
    case 'quest': if (e.q && (e.what === 'accept' || e.what === 'done')) push({ chan: 'sys', text: (e.what === 'done' ? 'Quest complete: ' : 'Quest accepted: ') + e.q.name }); break;
    case 'taunt': push({ chan: 'evil', from: 'Velscour', text: (e.lines || []).join(' ') }); break;
  }
}
export function chatFrame(dt) { if (document.activeElement === el.input) { idle = 0; return; } idle += dt; if (idle > 9 && !el.root.classList.contains('idle')) el.root.classList.add('idle'); }
export const chatShow = (on) => el.root.classList.toggle('hide', !on);
