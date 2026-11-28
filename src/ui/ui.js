// VELSCOUR : HOLLOWBOUND — the DOM user interface. Everything the player reads or presses
// that is not the world itself lives here, laid over the WebGPU canvas.
//
//   initUI() -> { fatal(title, msg), ready(), frame(dt) }
//
// The UI reads G (state.js), calls G.game (game/game.js + game/actions.js) and consumes
// G.events once a frame. Modules:
//   dom.js       helpers and the `U` registry      hud.js      bars, slots, minimap, tracker, banners
//   icons.js     skill and item icons               chat.js     the chat log
//   windows.js   window manager, tooltips, modals   dialog.js   NPC talk, services, gate, death
//   win_hero.js  bag, hero sheet, skills            touch.js    virtual stick and buttons
//   win_world.js quests, world map, party, guild    title.js    title screen and class select
//   win_misc.js  bestiary, settings
import { G } from '../state.js';
import { down, typing, setTyping, KEYMAP } from '../core/input.js';
import { U, h } from './dom.js';
import { initWindows, winEvent, winFrame } from './windows.js';
import { initHud, hudEvent, hudFrame } from './hud.js';
import { initChat, chatEvent, chatFrame, chatShow } from './chat.js';
import { initDialog, dialogEvent, dialogFrame } from './dialog.js';
import { initTouch, touchFrame } from './touch.js';
import { initTitle, titleEvent, titleReady, titleFatal } from './title.js';
import './win_hero.js';
import { initWorld } from './win_world.js';
import './win_misc.js';

const WIN_KEYS = { inv: 'inv', char: 'char', skills: 'skills', quests: 'quests', map: 'map', guild: 'guild', party: 'party', bestiary: 'bestiary' };
const UI_ACTIONS = [...Object.keys(WIN_KEYS), 'menu', 'chat'];
const prev = {}, byKey = {};

function act(a) {
  if (G.mode !== 'play') return;
  if (a === 'menu') { if (!U.closeTop()) U.openWin('menu'); return; }
  if (a === 'chat') { if (!U.blocking()) U.chatFocus(); return; }
  if (U.blocking() && !U.isOpen(a)) return;          // a modal conversation is up
  U.toggleWin(WIN_KEYS[a]);
}

export function initUI() {
  const root = document.getElementById('ui');
  U.chatShow = chatShow;
  initTitle(root); initHud(root); initChat(root); initWindows(root); initDialog(root); initTouch(root); initWorld();

  // keys that open things (edge-polled in frame() too, for the gamepad)
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey) return;
    const inField = e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    if (inField) { if (e.code === 'Escape') e.target.blur(); return; }
    const a = KEYMAP[e.code]; if (!a || !UI_ACTIONS.includes(a)) return;
    if (a === 'chat' && e.target && e.target.tagName === 'BUTTON') return;      // Enter on a focused button presses it
    e.preventDefault(); byKey[a] = true; act(a);
  });
  // typing in any field takes the keyboard from the game
  root.addEventListener('focusin', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') setTyping(true); });
  root.addEventListener('focusout', (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) setTyping(false); });
  // buttons should not keep focus (Space would press them again while playing)
  root.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b && document.activeElement === b) b.blur(); });
  root.addEventListener('contextmenu', (e) => { if (!/INPUT|TEXTAREA/.test(e.target.tagName)) e.preventDefault(); });
  document.addEventListener('dragstart', (e) => { if (e.target.tagName === 'IMG') e.preventDefault(); });

  return {
    fatal(title, msg) { titleFatal(title, msg); },
    ready() {
      titleReady();
      // developer shortcut: ?cls=wizard[&name=..][&lvl=20][&map=wilds_1][&auto=1] starts a hero straight away
      const q = new URLSearchParams(location.search);
      if (q.get('cls') && G.game) G.game.newGame({ name: q.get('name') || 'Tester', cls: q.get('cls') }).then(() => { if (q.get('auto')) G.game.toggleAuto(true); if (q.get('lvl')) { G.char.lvl = +q.get('lvl'); G.char.sp = +q.get('lvl'); G.player.recompute(true); } if (q.get('map')) G.game.travel(q.get('map'), null); });
    },
    frame(dt) {
      const ev = G.events;
      if (ev.length) {
        for (let i = 0; i < ev.length; i++) { const e = ev[i]; try { titleEvent(e); hudEvent(e); chatEvent(e); winEvent(e); dialogEvent(e); } catch (err) { console.error('ui event', e.type, err); } }
        ev.length = 0;
      }
      if (G.mode !== 'play') return;
      if (!typing) for (const a of UI_ACTIONS) { const d = !!down[a]; if (d && !prev[a] && !byKey[a]) act(a); if (!d) byKey[a] = false; prev[a] = d; }
      hudFrame(dt); chatFrame(dt); dialogFrame(dt); touchFrame(dt); winFrame(dt);
    },
  };
}
