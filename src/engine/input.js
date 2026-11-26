// Keyboard + gamepad + touch, folded into named actions.
// down(a): held now. pressed(a): went down this tick. released(a): went up this tick.
import { Pads } from './gamepad.js';

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
  KeyX: 'attack', KeyJ: 'attack',
  KeyC: 'dash', KeyL: 'dash', ShiftLeft: 'dash', ShiftRight: 'dash',
  KeyE: 'interact', Enter: 'confirm',
  KeyQ: 'potion', KeyH: 'potion',
  Escape: 'pause', KeyP: 'pause',
  KeyM: 'mute',
};
// Standard-layout positions named the way each pad prints them (Nintendo swaps A/B and X/Y by position).
const PAD_LABELS = {
  xbox: { jump: 'A', attack: 'X', dash: 'B', dash2: 'RB / RT', interact: 'Y', potion: 'LB', potion2: 'LB / LT', pause: 'Menu', up: 'Up', move: 'the stick' },
  ps: { jump: 'Cross', attack: 'Square', dash: 'Circle', dash2: 'R1 / R2', interact: 'Triangle', potion: 'L1', potion2: 'L1 / L2', pause: 'Options', up: 'Up', move: 'the stick' },
  nin: { jump: 'B', attack: 'Y', dash: 'A', dash2: 'R / ZR', interact: 'X', potion: 'L', potion2: 'L / ZL', pause: '+', up: 'Up', move: 'the stick' },
};
const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'interact', 'confirm', 'pause', 'mute', 'potion'];

class Input {
  constructor() {
    this.keys = new Set();          // keyboard actions held
    this.touch = new Set();         // touch actions held
    this.pads = new Pads();         // controllers (src/engine/gamepad.js)
    this.pads.onActive = () => this.setDevice('pad');
    this.menuMode = false;          // set by the game: a menu is open, so pad directions auto-repeat
    this.now = new Set();
    this.prev = new Set();
    this.queued = new Set();        // presses that started and ended between ticks
    this.lastDevice = 'keyboard';
    this.anyKeyHandlers = [];
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        e.preventDefault();
        if (!e.repeat) { this.keys.add(a); this.queued.add(a); }
      }
      this.setDevice('keyboard');
      this.anyKeyHandlers.forEach((f) => f(e));
    });
    addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) { e.preventDefault(); this.keys.delete(a); }
    });
    addEventListener('blur', () => { this.keys.clear(); this.touch.clear(); });
  }

  /** Call once per fixed tick before game logic. */
  update() {
    this.pads.sample(this.menuMode);
    for (const a of this.pads.take()) this.queued.add(a);
    this.prev = this.now;
    this.now = new Set([...this.keys, ...this.touch, ...this.pads.held, ...this.queued]);
    this.queued.clear();
  }

  /** Call every animation frame: pad presses between steps are latched, not lost. */
  poll() { this.pads.sample(this.menuMode); }

  /** The last thing the player touched picks the button names and whether the touch buttons show. */
  setDevice(kind) {
    if (this.lastDevice === kind) return;
    this.lastDevice = kind;
    if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('pad', kind === 'pad');
  }

  rumble(name, k = 1) { if (this.lastDevice === 'pad') this.pads.rumble(name, k); }

  down(a) { return this.now.has(a); }
  pressed(a) { return this.now.has(a) && !this.prev.has(a); }
  released(a) { return !this.now.has(a) && this.prev.has(a); }
  axisX() { return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0); }
  /** Any confirm-ish press (menus, dialog). */
  ok() { return this.pressed('jump') || this.pressed('attack') || this.pressed('interact') || this.pressed('confirm'); }

  /** Clears edges so a press that closed a menu doesn't also act in-game. */
  swallow() { this.prev = new Set([...this.prev, ...this.now]); }

  setTouch(action, on) {
    if (on) { this.touch.add(action); this.queued.add(action); this.setDevice('touch'); }
    else this.touch.delete(action);
  }

  /** Label for a prompt, e.g. promptFor('interact') -> 'E'. */
  label(a) {
    if (this.lastDevice === 'pad') return this.padLabel(a);
    if (this.lastDevice === 'touch') return { jump: 'JUMP', attack: 'ATK', dash: 'DASH', interact: 'TALK', pause: 'II', potion: 'POT', up: 'Up', move: 'the stick' }[a] || a;
    return { jump: 'Z', attack: 'X', dash: 'C', interact: 'E', pause: 'Esc', up: 'Up', potion: 'Q', move: 'Arrows/WASD' }[a] || a;
  }

  /** Button names for the pad in hand (the controls card shows these whatever was used last). */
  padLabel(a) {
    return (PAD_LABELS[this.pads.family] || PAD_LABELS.xbox)[a] || a;
  }
}

export const input = new Input();
export { ACTIONS };

/** Wire the on-screen touch pad (only shown on touch devices). */
export function setupTouch(root) {
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!isTouch && !location.search.includes('touch=1')) return;
  root.hidden = false;
  const stick = root.querySelector('.stick');
  const knob = root.querySelector('.knob');
  let stickId = null;
  const setStick = (dx, dy) => {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.setTouch('left', dx < -14);
    input.setTouch('right', dx > 14);
    input.setTouch('up', dy < -22);
    input.setTouch('down', dy > 22);
  };
  const stickMove = (e) => {
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy), lim = r.width * 0.35;
    if (m > lim) { dx *= lim / m; dy *= lim / m; }
    setStick(dx, dy);
  };
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
  const end = (e) => { if (e.pointerId === stickId) { stickId = null; setStick(0, 0); } };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  for (const btn of root.querySelectorAll('[data-act]')) {
    const a = btn.dataset.act;
    const on = (e) => { e.preventDefault(); btn.setPointerCapture(e.pointerId); btn.classList.add('on'); input.setTouch(a, true); };
    const off = (e) => { e.preventDefault(); btn.classList.remove('on'); input.setTouch(a, false); };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
  }
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}
