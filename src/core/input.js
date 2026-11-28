// Input: keyboard, gamepad and touch all feed one action state. `down[a]` is held,
// `hit(a)` is true once per press. Touch controls are DOM buttons (ui/touch.js) that
// call press()/release().
export const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  Space: 'jump', AltLeft: 'jump', AltRight: 'jump', KeyK: 'jump',
  KeyX: 'attack', ControlLeft: 'attack', KeyJ: 'attack',
  KeyZ: 'loot', KeyF: 'interact', Enter: 'chat',
  Digit1: 's1', Digit2: 's2', Digit3: 's3', Digit4: 's4', Digit5: 's5', Digit6: 's6', Digit7: 's7', Digit8: 's8',
  KeyQ: 'potion', KeyE: 'mpotion', KeyT: 'auto',
  KeyI: 'inv', KeyC: 'char', KeyV: 'skills', KeyL: 'quests', KeyM: 'map', KeyG: 'guild', KeyP: 'party', KeyB: 'bestiary',
  Escape: 'menu', Tab: 'map',
};
export const down = Object.create(null);
const pressed = Object.create(null);
let anyInput = 0;
export const lastInput = () => anyInput;
export function press(a) { if (!down[a]) pressed[a] = true; down[a] = true; anyInput = performance.now(); }
export function release(a) { down[a] = false; }
export function hit(a) { if (pressed[a]) { pressed[a] = false; return true; } return false; }
export function endFrame() { for (const k in pressed) pressed[k] = false; }
export let typing = false;
export const setTyping = (v) => { typing = v; if (v) for (const k in down) down[k] = false; };

export function initInput() {
  addEventListener('keydown', (e) => {
    if (typing) return;
    const a = KEYMAP[e.code]; if (!a) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    e.preventDefault(); if (!e.repeat) press(a);
  });
  addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) release(a); });
  addEventListener('blur', () => { for (const k in down) down[k] = false; });
}
const PAD = { 0: 'jump', 2: 'attack', 1: 's1', 3: 's2', 4: 's3', 5: 's4', 6: 'potion', 7: 's5', 8: 'map', 9: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 10: 'auto', 11: 'loot' };
const padState = {};
export function pollPad() {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g) : null; if (!gp) return;
  const want = {};
  gp.buttons.forEach((b, i) => { if (PAD[i] && b.pressed) want[PAD[i]] = true; });
  if (gp.axes[0] < -0.4) want.left = true; if (gp.axes[0] > 0.4) want.right = true;
  if (gp.axes[1] < -0.55) want.up = true; if (gp.axes[1] > 0.55) want.down = true;
  for (const a of Object.values(PAD)) { if (want[a] && !padState[a]) press(a); else if (!want[a] && padState[a]) release(a); padState[a] = !!want[a]; }
}
