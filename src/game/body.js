// Side-scroller body physics on footholds: one-way platforms you jump up through and
// drop down from, ground steps that act as walls, ropes you snap onto and climb.
// Tuned from the classic foothold constants (walk 125, jump 555, gravity 2000, fall 670
// at a 65px character) scaled to a ~100 unit hero.
export const PHYS = { walk: 215, accel: 2300, drag: 1500, air: 620, jump: 830, gravity: 2900, fall: 980, climb: 190, kbx: 260, kby: 520 };

export class Body {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.plat = null; this.rope = null; this.dropFrom = null; this.dropT = 0;
    this.face = 1; this.ropeLock = 0; this.fly = false; this.speed = 1; this.jumpMul = 1;
    this.airT = 0;
  }
  get grounded() { return !!this.plat; }

  /** move: -1..1, want: {jump, up, down, drop}. Returns events: 'jump' | 'land' | null */
  step(map, dt, move, want) {
    let ev = null;
    if (this.ropeLock > 0) this.ropeLock -= dt;
    if (this.dropT > 0) { this.dropT -= dt; if (this.dropT <= 0) this.dropFrom = null; }
    if (this.fly) return this._fly(map, dt, move, want);
    // ---- rope
    if (this.rope) {
      const r = this.rope; this.vx = 0; this.vy = 0; this.x = r.x;
      const c = PHYS.climb * this.speed;
      if (want.up) this.y -= c * dt; else if (want.down) this.y += c * dt;
      if (this.y <= r.y1 + 2 && want.up) { this.y = r.y1; this.rope = null; this.plat = platAt(map, this.x, r.y1); this.ropeLock = 0.25; return 'land'; }
      if (this.y >= r.y2 + 12) { this.rope = null; this.ropeLock = 0.3; }
      if (want.jump && move) { this.rope = null; this.ropeLock = 0.45; this.vx = move * PHYS.walk * 1.15; this.vy = -PHYS.jump * 0.55; this.face = move; return 'jump'; }
      return null;
    }
    if (!this.plat && this.ropeLock <= 0 && (want.up || want.down)) { const r = ropeAt(map, this.x, this.y, 16); if (r && this.y > r.y1 + 6) { this.rope = r; this.plat = null; this.x = r.x; this.vx = this.vy = 0; return null; } }
    if (this.plat && this.ropeLock <= 0) {
      if (want.up) { const r = ropeAt(map, this.x, this.y - 30, 18); if (r && this.y > r.y1 + 6) { this.rope = r; this.plat = null; this.x = r.x; this.y -= 6; return null; } }
      if (want.down && !want.jump) { const r = ropeTop(map, this.x, this.y, 18); if (r) { this.rope = r; this.plat = null; this.x = r.x; this.y = r.y1 + 12; return null; } }
    }
    // ---- horizontal
    const top = PHYS.walk * this.speed;
    if (this.plat) {
      if (move) { this.vx += move * PHYS.accel * dt; if (Math.abs(this.vx) > top) this.vx = Math.sign(this.vx) * Math.max(top, Math.abs(this.vx) - PHYS.drag * dt); this.face = move > 0 ? 1 : -1; }
      else { const d = PHYS.drag * dt; this.vx = Math.abs(this.vx) <= d ? 0 : this.vx - Math.sign(this.vx) * d; }
      if (want.jump) {
        if (want.down && canDrop(map, this)) { this.dropFrom = this.plat; this.dropT = 0.35; this.plat = null; this.vy = 120; ev = 'jump'; }
        else { this.vy = -PHYS.jump * this.jumpMul; this.plat = null; if (move) this.vx = move * Math.max(Math.abs(this.vx), top * 0.9); ev = 'jump'; }
      }
    } else if (move) {
      // a little air control: enough to correct a jump, not enough to turn it round
      const lim = top; this.vx += move * PHYS.air * dt; if (Math.abs(this.vx) > lim) this.vx = Math.sign(this.vx) * Math.max(lim, Math.abs(this.vx) - PHYS.air * dt);
      this.face = move > 0 ? 1 : -1;
    }
    // ---- integrate
    let nx = this.x + this.vx * dt;
    nx = wallClamp(map, this.x, nx, this.y);
    if (nx < 30) { nx = 30; this.vx = 0; } else if (nx > map.w - 30) { nx = map.w - 30; this.vx = 0; }
    if (this.plat) {
      this.x = nx; this.airT = 0;
      if (nx < this.plat.x1 || nx > this.plat.x2) {
        const n = platAt(map, nx, this.plat.y);      // a neighbour at the same height
        if (n) this.plat = n; else this.plat = null;
      }
    } else {
      this.airT += dt;
      this.vy = Math.min(PHYS.fall, this.vy + PHYS.gravity * dt);
      const ny = this.y + this.vy * dt;
      if (this.vy > 0) {
        let land = null;
        for (const p of map.plats) {
          if (p === this.dropFrom) continue;
          if (nx >= p.x1 && nx <= p.x2 && this.y <= p.y + 0.01 && ny >= p.y && (!land || p.y < land.y)) land = p;
        }
        if (land) { this.x = nx; this.y = land.y; this.vy = 0; this.plat = land; this.dropFrom = null; return 'land'; }
      }
      this.x = nx; this.y = ny;
      if (this.y > map.h + 200) { const g = lowest(map, this.x); this.y = g.y; this.plat = g; this.vy = 0; }
    }
    return ev;
  }
  _fly(map, dt, move, want) {
    const top = PHYS.walk * this.speed;
    this.vx += (move * top - this.vx) * Math.min(1, dt * 4);
    const vyT = want.up ? -top * 0.7 : want.down ? top * 0.7 : 0;
    this.vy += (vyT - this.vy) * Math.min(1, dt * 4);
    this.x = Math.max(30, Math.min(map.w - 30, this.x + this.vx * dt));
    this.y = Math.max(120, Math.min(map.groundY - 20, this.y + this.vy * dt));
    if (move) this.face = move > 0 ? 1 : -1;
    return null;
  }
  knock(dir, k = 1) { if (this.rope) return; this.vx = dir * PHYS.kbx * k; this.vy = -PHYS.kby * k; this.plat = null; }
  place(map, x, y) { this.x = x; this.vx = this.vy = 0; this.rope = null; const p = y == null ? lowest(map, x) : (dropTo(map, x, y) || lowest(map, x)); this.plat = p; this.y = p.y; }
}

export function platAt(map, x, y) { for (const p of map.plats) if (Math.abs(p.y - y) < 3 && x >= p.x1 && x <= p.x2) return p; return null; }
export function dropTo(map, x, y) { let b = null; for (const p of map.plats) if (x >= p.x1 && x <= p.x2 && p.y >= y - 4 && (!b || p.y < b.y)) b = p; return b; }
export function lowest(map, x) { let b = null; for (const p of map.plats) if (x >= p.x1 && x <= p.x2 && (!b || p.y > b.y)) b = p; return b || map.plats[0]; }
function canDrop(map, b) { if (b.plat.ground) return false; for (const p of map.plats) if (p !== b.plat && b.x >= p.x1 && b.x <= p.x2 && p.y > b.plat.y + 10) return true; return false; }
export function ropeAt(map, x, y, tol) { for (const r of map.ropes) if (Math.abs(r.x - x) <= tol && y >= r.y1 - 4 && y <= r.y2 + 60) return r; return null; }
function ropeTop(map, x, y, tol) { for (const r of map.ropes) if (Math.abs(r.x - x) <= tol && Math.abs(r.y1 - y) < 4) return r; return null; }
// ground segments are solid earth: you can't walk into the side of a higher one
function wallClamp(map, x, nx, y) {
  for (const p of map.plats) {
    if (!p.ground || p.y >= y - 6) continue;
    if (x <= p.x1 && nx > p.x1 - 14) return p.x1 - 14;
    if (x >= p.x2 && nx < p.x2 + 14) return p.x2 + 14;
  }
  return nx;
}
