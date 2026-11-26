// Game controllers. Built for an Xbox pad on Windows (Chromium and Firefox read it through XInput in the W3C
// "standard" layout) and for whatever an iPhone or iPad pairs (Xbox, DualSense, MFi, Backbone): Safari hands every
// one of them over through GameController.framework in that same layout, so one button map serves them all.
//
//  - Sampled every animation frame and every sim step; presses are latched until the game reads them, so a tap
//    that starts and ends inside a long frame or a hit-stop still lands.
//  - Left stick: radial dead zone with hysteresis, and sectors that lean horizontal. Down + A drops through planks
//    and Up + X spends the ember bar, so a sloppy run must never read as Down or Up; a deliberate push still does.
//  - Spring-back filter: a stick let go from full tilt overshoots past centre for a frame; that ghost is dropped.
//  - Analog triggers with their own press / release points (RT dash, LT potion).
//  - Menus: d-pad and stick auto-repeat (320 ms, then every 75 ms), and a stick already held when a menu opens
//    has to come back to centre first, so nothing scrolls by itself.
//  - Rumble where the browser offers it (Chrome / Edge on Windows), mixed from overlapping pulses.
//  - Screen wake lock while a pad is in use: on an iPhone nobody touches the screen, so it would dim and lock.

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const MAP = {
  [BTN.A]: ['jump', 'confirm'], [BTN.X]: ['attack'], [BTN.Y]: ['interact'],
  [BTN.B]: ['dash'], [BTN.RB]: ['dash'], [BTN.RT]: ['dash'],
  [BTN.LB]: ['potion'], [BTN.LT]: ['potion'],
  [BTN.MENU]: ['pause'], [BTN.VIEW]: ['pause'],
};
const DPAD = { [BTN.UP]: 'up', [BTN.DOWN]: 'down', [BTN.LEFT]: 'left', [BTN.RIGHT]: 'right' };
const DZ_ON = 0.3, DZ_OFF = 0.24;              // radial dead zone (engage / release)
const TRIG_ON = 0.3, TRIG_OFF = 0.18;          // analog triggers: a resting finger never dashes, a half pull does
const H_ON = 62, H_OFF = 70;                   // degrees off level that still count as left / right
const DN_ON = 40, DN_OFF = 32, DN_MAG = 0.5;   // degrees below level before Down engages
const UP_ON = 56, UP_OFF = 48, UP_MAG = 0.55;  // Up is stricter still: Up + X spends the ember bar
const REBOUND_MS = 90, REBOUND_HOLD = 40, REBOUND_MAG = 0.75;
const REPEAT_DELAY = 320, REPEAT_RATE = 75;
// rumble: s = strong (low, heavy) motor, w = weak (high, crisp) motor, ms, decay = fades out
const FEEL = {
  hit: { s: 0.1, w: 0.4, ms: 55 },
  crit: { s: 0.5, w: 0.8, ms: 120, decay: 1 },
  hurt: { s: 0.8, w: 0.5, ms: 190, decay: 1 },
  death: { s: 1, w: 0.7, ms: 650, decay: 1 },
  dash: { s: 0, w: 0.22, ms: 50 },
  heal: { s: 0, w: 0.22, ms: 150, decay: 1 },
  loot: { s: 0.05, w: 0.32, ms: 90 },
  quake: { s: 0.9, w: 0.55, ms: 380, decay: 1 },
};
const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));

export function padFamily(id = '') {
  const s = id.toLowerCase();
  if (/054c|dualsense|dualshock|playstation/.test(s)) return 'ps';
  if (/057e|nintendo|pro controller|joy-?con/.test(s)) return 'nin';
  return 'xbox';   // Xbox, XInput and everything else: the standard layout uses Xbox letters
}

// Drops the spring-back ghost: after a direction is let go, its opposite only counts if pushed hard or held a moment.
class Rebound {
  constructor() { this.out = 0; this.leftT = -1e9; this.leftDir = 0; this.candT = 0; }
  step(raw, mag, now) {
    if (raw === this.out) { this.candT = 0; return raw; }
    if (this.out !== 0) { this.leftT = now; this.leftDir = this.out; }
    if (raw !== 0 && raw === -this.leftDir && now - this.leftT < REBOUND_MS && mag < REBOUND_MAG) {
      if (!this.candT) this.candT = now;
      if (now - this.candT < REBOUND_HOLD) { this.out = 0; return 0; }
    }
    this.candT = 0; this.out = raw; return raw;
  }
}

export class Pads {
  constructor() {
    this.per = new Map();          // gamepad.index -> previous pressed state per button
    this.held = new Set();         // actions held right now
    this.edges = new Set();        // presses since the game last read them
    this.stick = { on: false, rx: 0, rv: 0 };
    this.fx = new Rebound(); this.fv = new Rebound();
    this.mdir = ''; this.mnext = 0; this.menuLatch = ''; this.wasMenu = false;
    this.family = 'xbox'; this.activeIndex = -1; this.lastT = -1e9; this.settle = false;
    this.rumbleOn = true; this.pulses = []; this.sent = null;
    this.lock = null; this.playing = false; this.onActive = null; this.onLost = null;
    try { this.rumbleOn = localStorage.getItem('hollowbound-rumble') !== '0'; } catch (e) { /* storage blocked */ }
    addEventListener('gamepadconnected', () => { this.settle = true; });
    addEventListener('gamepaddisconnected', (e) => {
      this.per.delete(e.gamepad.index);
      if (e.gamepad.index === this.activeIndex) { this.activeIndex = -1; this.pulses.length = 0; this.sent = null; }
      if (!this.list().some((g) => g.index !== e.gamepad.index)) { this.release(); if (this.onLost) this.onLost(); }
    });
    // leaving the page: let go of everything, stop buzzing, and don't count buttons still held on return as presses
    const away = () => { this.settle = true; this.release(); this.stopRumble(); };
    addEventListener('blur', away);
    addEventListener('focus', () => { this.settle = true; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { away(); this.wake(false); } else { this.settle = true; }
    });
    // iOS: a pad press may not count as a user gesture, so any real tap or key is a chance to take the wake lock
    for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { if (performance.now() - this.lastT < 5000) this.wake(true, true); }, true);
  }

  list() {
    let raw = [];
    try { raw = window.__fakePads || (navigator.getGamepads ? navigator.getGamepads() : []) || []; } catch (e) { /* insecure page: no pads */ }
    const all = [];
    for (const g of raw) if (g && g.connected !== false) all.push(g);
    const std = all.filter((g) => g.mapping === 'standard');   // wheels and flight sticks report raw layouts
    return std.length ? std : all;
  }
  connected() { return this.list().length > 0; }
  release() {
    this.held.clear(); this.mdir = ''; this.stick = { on: false, rx: 0, rv: 0 };
    this.fx = new Rebound(); this.fv = new Rebound();
  }

  /** Read every pad. menu: a menu is open, so directions come out as repeating taps instead of holds. */
  sample(menu = false) {
    const now = performance.now(), pads = this.list(), btnHeld = new Set(), btnDown = new Set();
    let sx = 0, sy = 0, sm = 0, active = null;
    for (const g of pads) {
      let prev = this.per.get(g.index);
      if (!prev) this.per.set(g.index, (prev = []));
      const cur = [];
      for (let i = 0; i < g.buttons.length; i++) {
        const b = g.buttons[i], v = typeof b === 'number' ? b : (b && b.value) || 0;
        const on = i === BTN.LT || i === BTN.RT ? v > (prev[i] ? TRIG_OFF : TRIG_ON)
          : typeof b === 'number' ? b > 0.5 : !!(b && (b.pressed || v > 0.5));
        cur[i] = on;
        if (on) btnHeld.add(i);
        if (on && !prev[i]) { btnDown.add(i); active = g; }
      }
      this.per.set(g.index, cur);
      const lx = +g.axes[0] || 0, ly = +g.axes[1] || 0, m = Math.hypot(lx, ly);
      if (m > sm) { sm = m; sx = lx; sy = ly; }
      if (m > 0.5) active = active || g;   // a real push counts as picking the pad up; drift doesn't
    }
    if (this.settle) { this.settle = false; btnDown.clear(); active = null; }

    // left stick -> 8 directions, leaning horizontal
    const mag = Math.min(1, sm), nx = sm > 1e-6 ? sx / sm : 0, ny = sm > 1e-6 ? sy / sm : 0, S = this.stick;
    let rx = 0, rv = 0;
    S.on = mag > (S.on ? DZ_OFF : DZ_ON);
    if (S.on) {
      const elev = Math.atan2(-ny, Math.abs(nx)) * 180 / Math.PI;   // +90 straight up, 0 level, -90 straight down
      if (Math.abs(elev) < (S.rx ? H_OFF : H_ON)) rx = Math.sign(nx);
      if (elev < -(S.rv === -1 ? DN_OFF : DN_ON) && mag > (S.rv === -1 ? DN_MAG - 0.1 : DN_MAG)) rv = -1;
      else if (elev > (S.rv === 1 ? UP_OFF : UP_ON) && mag > (S.rv === 1 ? UP_MAG - 0.1 : UP_MAG)) rv = 1;
    }
    S.rx = rx; S.rv = rv;
    const fx = this.fx.step(rx, mag, now), fv = this.fv.step(rv, mag, now);
    const dx = (btnHeld.has(BTN.RIGHT) ? 1 : 0) - (btnHeld.has(BTN.LEFT) ? 1 : 0);
    const dv = (btnHeld.has(BTN.UP) ? 1 : 0) - (btnHeld.has(BTN.DOWN) ? 1 : 0);
    const x = dx || fx, v = dv || fv;

    this.held.clear();
    for (const i of btnHeld) if (MAP[i]) MAP[i].forEach((a) => this.held.add(a));
    for (const i of btnDown) if (MAP[i]) MAP[i].forEach((a) => this.edges.add(a));

    // directions: held in play; in menus one of four, as a tap that auto-repeats
    let md = dv === 1 ? 'up' : dv === -1 ? 'down' : dx === 1 ? 'right' : dx === -1 ? 'left' : '';
    if (!md && mag > (this.mdir ? 0.35 : 0.5)) md = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'right' : 'left') : (ny > 0 ? 'down' : 'up');
    if (menu && !this.wasMenu) this.menuLatch = md;   // a stick already held as the menu opens must let go first
    this.wasMenu = menu;
    if (this.menuLatch && md !== this.menuLatch) this.menuLatch = '';
    if (menu) {
      if (md !== this.mdir) { this.mdir = md; this.mnext = now + REPEAT_DELAY; if (md && !this.menuLatch) this.edges.add(md); }
      else if (md && !this.menuLatch && now >= this.mnext) { this.edges.add(md); this.mnext = Math.max(this.mnext + REPEAT_RATE, now + REPEAT_RATE / 2); }
    } else {
      this.mdir = md; this.mnext = now + REPEAT_DELAY;
      if (x < 0) this.held.add('left');
      if (x > 0) this.held.add('right');
      if (v > 0) this.held.add('up');
      if (v < 0) this.held.add('down');
      // a d-pad tap shorter than a step still registers
      for (const i of btnDown) if (DPAD[i]) this.edges.add(DPAD[i]);
    }

    if (active) {
      this.activeIndex = active.index; this.lastT = now; this.family = padFamily(active.id);
      if (this.onActive) this.onActive();
      this.wake(true);
    }
    if (this.lock && (now - this.lastT > 180000 || !this.playing)) this.wake(false);   // idle three minutes, or back on the title
    this.tickRumble(now);
  }

  /** Presses latched since the last call, handed over and cleared. */
  take() { const e = this.edges; this.edges = new Set(); return e; }

  // --------------------------------------------------------------- rumble
  pad() { return this.activeIndex < 0 ? null : this.list().find((g) => g.index === this.activeIndex) || null; }
  canRumble() { const g = this.pad(); return !!(g && ((g.vibrationActuator && g.vibrationActuator.playEffect) || (g.hapticActuators && g.hapticActuators[0]))); }
  setRumble(on) {
    this.rumbleOn = on;
    try { localStorage.setItem('hollowbound-rumble', on ? '1' : '0'); } catch (e) { /* storage blocked */ }
    if (!on) this.stopRumble();
  }
  rumble(name, k = 1) {
    const f = FEEL[name];
    if (!f || !this.rumbleOn || this.activeIndex < 0 || performance.now() - this.lastT > 20000) return;
    const now = performance.now(), a = Math.min(1.4, Math.max(0, k));
    this.pulses.push({ s: f.s * a, w: f.w * a, t0: now, end: now + f.ms, decay: f.decay });
    if (this.pulses.length > 12) this.pulses.shift();
    this.tickRumble(now);   // start now: the hit-stop that usually follows must not delay the kick
  }
  tickRumble(now) {
    this.pulses = this.pulses.filter((p) => p.end > now);
    if (!this.pulses.length) { this.sent = null; return; }
    let s = 0, w = 0, next = Infinity;
    for (const p of this.pulses) {
      const f = p.decay ? (p.end - now) / (p.end - p.t0) : 1;
      s = Math.max(s, p.s * f); w = Math.max(w, p.w * f);
      next = Math.min(next, p.decay ? now + 45 : p.end);   // fades are stepped every 45 ms
    }
    const last = Math.max(...this.pulses.map((p) => p.end)), o = this.sent;
    const moved = !o || Math.abs(o.s - s) > 0.05 || Math.abs(o.w - w) > 0.05;
    if (!moved && now < o.until - 6) return;
    const stop = Math.min(next, last);
    this.send(s, w, stop - now + (stop < last ? 30 : 0));   // overlap the next step so there's no gap
    this.sent = { s, w, until: stop };
  }
  send(s, w, ms) {
    const g = this.pad();
    if (!g) return;
    const dur = Math.max(16, Math.min(5000, Math.round(ms)));
    try {
      const va = g.vibrationActuator;
      if (va && va.playEffect) {
        const p = va.playEffect('dual-rumble', { startDelay: 0, duration: dur, strongMagnitude: clamp01(s), weakMagnitude: clamp01(w) });
        if (p && p.catch) p.catch(() => {});
      } else if (g.hapticActuators && g.hapticActuators[0] && g.hapticActuators[0].pulse) {
        const p = g.hapticActuators[0].pulse(clamp01(Math.max(s, w)), dur);
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) { /* no motors */ }
  }
  stopRumble() {
    this.pulses.length = 0;
    if (!this.sent) return;
    this.sent = null;
    try { const g = this.pad(); const p = g && g.vibrationActuator && g.vibrationActuator.reset && g.vibrationActuator.reset(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
  }

  // --------------------------------------------------------------- screen wake lock
  async wake(on, gesture = false) {
    if (on === !!this.lock || this.waking) return;
    if (on && (!navigator.wakeLock || document.hidden || !this.playing || (!gesture && performance.now() < (this.wakeRetry || 0)))) return;
    this.waking = true;
    try {
      if (on) {
        const l = await navigator.wakeLock.request('screen');
        this.lock = l;
        if (l.addEventListener) l.addEventListener('release', () => { if (this.lock === l) this.lock = null; });
      } else { const l = this.lock; this.lock = null; if (l) await l.release(); }
    } catch (e) { this.wakeRetry = performance.now() + 8000; }   // refused (no gesture yet): try again later
    this.waking = false;
  }
}
