// Visual effects: a handful of procedural shapes baked once into the atlas (glow, spark,
// ring, slash arc, smoke, shard, beam, rune circle, bolt) and a pooled particle system
// that tints, spins and scales them. Everything is additive or alpha through the one
// sprite pipeline.
const TAU = Math.PI * 2;
export const SHAPES = {};

export function bakeShapes(atlas) {
  const mk = (w, h, fn) => { const c = new OffscreenCanvas(w, h), g = c.getContext('2d'); fn(g, w, h); return atlas.addCanvas(c, 'keep'); };
  SHAPES.glow = mk(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  SHAPES.dot = mk(16, 16, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(8, 8, 6, 0, TAU); g.fill(); });
  SHAPES.px = mk(8, 8, (g) => { g.fillStyle = '#fff'; g.fillRect(1, 1, 6, 6); });
  SHAPES.spark = mk(64, 16, (g) => { const r = g.createLinearGradient(0, 0, 64, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.ellipse(32, 8, 32, 3.2, 0, 0, TAU); g.fill(); });
  SHAPES.ring = mk(128, 128, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 7; g.shadowColor = '#fff'; g.shadowBlur = 10; g.beginPath(); g.arc(64, 64, 50, 0, TAU); g.stroke(); });
  SHAPES.slash = mk(192, 192, (g) => {            // a crescent sweep, opening to the right
    for (let i = 0; i < 26; i++) { const t = i / 25; g.strokeStyle = `rgba(255,255,255,${0.05 + 0.9 * t * t})`; g.lineWidth = 3 + 16 * t; g.lineCap = 'round'; g.beginPath(); const a0 = -1.25 + t * 1.6; g.arc(70, 96, 78, a0, a0 + 0.42); g.stroke(); }
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(52, 96, 70, 0, TAU); g.fill();
  });
  SHAPES.thrust = mk(192, 48, (g) => { const r = g.createLinearGradient(0, 0, 192, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.75, 'rgba(255,255,255,0.95)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(0, 24); g.quadraticCurveTo(120, 0, 192, 24); g.quadraticCurveTo(120, 48, 0, 24); g.fill(); });
  SHAPES.smoke = mk(64, 64, (g) => { for (let i = 0; i < 9; i++) { const a = i * 2.4, x = 32 + Math.cos(a) * 11, y = 32 + Math.sin(a) * 11; const r = g.createRadialGradient(x, y, 0, x, y, 19); r.addColorStop(0, 'rgba(255,255,255,0.4)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); } });
  SHAPES.shard = mk(24, 48, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(12, 0); g.lineTo(22, 30); g.lineTo(12, 48); g.lineTo(2, 30); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(12, 0); g.lineTo(12, 48); g.lineTo(2, 30); g.closePath(); g.fill(); });
  SHAPES.bolt = mk(96, 32, (g) => { const r = g.createLinearGradient(0, 0, 96, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,0.7)'); r.addColorStop(1, '#fff'); g.fillStyle = r; g.beginPath(); g.moveTo(0, 16); g.quadraticCurveTo(60, 2, 96, 16); g.quadraticCurveTo(60, 30, 0, 16); g.fill(); const q = g.createRadialGradient(80, 16, 0, 80, 16, 14); q.addColorStop(0, '#fff'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(60, 0, 36, 32); });
  SHAPES.arrow = mk(72, 14, (g) => { g.strokeStyle = '#d8c8a8'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(4, 7); g.lineTo(60, 7); g.stroke(); g.fillStyle = '#f2f2f2'; g.beginPath(); g.moveTo(72, 7); g.lineTo(58, 2); g.lineTo(58, 12); g.fill(); g.fillStyle = '#9a8a70'; g.beginPath(); g.moveTo(0, 1); g.lineTo(12, 7); g.lineTo(0, 13); g.fill(); });
  SHAPES.rune = mk(192, 192, (g) => {
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.translate(96, 96);
    g.beginPath(); g.arc(0, 0, 88, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.save(); g.rotate(a); g.beginPath(); g.moveTo(72, -5); g.lineTo(86, 0); g.lineTo(72, 5); g.stroke(); g.restore(); }
    g.beginPath(); for (let i = 0; i < 7; i++) { const a = i * (TAU * 3 / 7) - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 68, Math.sin(a) * 68); } g.closePath(); g.stroke();
  });
  SHAPES.star = mk(64, 64, (g) => { g.translate(32, 32); g.fillStyle = '#fff'; for (let k = 0; k < 2; k++) { g.rotate(k * Math.PI / 4); const s = k ? 0.55 : 1; g.beginPath(); g.moveTo(0, -30 * s); g.quadraticCurveTo(2, -2, 30 * s, 0); g.quadraticCurveTo(2, 2, 0, 30 * s); g.quadraticCurveTo(-2, 2, -30 * s, 0); g.quadraticCurveTo(-2, -2, 0, -30 * s); g.fill(); } });
  SHAPES.pillar = mk(64, 256, (g) => { const r = g.createLinearGradient(0, 0, 64, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,0.95)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 256); g.globalCompositeOperation = 'destination-in'; const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, '#000'); v.addColorStop(1, '#000'); g.fillStyle = v; g.fillRect(0, 0, 64, 256); });
  SHAPES.shadow = mk(64, 24, (g) => { const r = g.createRadialGradient(32, 12, 0, 32, 12, 32); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.setTransform(1, 0, 0, 0.375, 0, 0); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  SHAPES.coin = mk(20, 20, (g) => { g.fillStyle = '#b8860b'; g.beginPath(); g.arc(10, 10, 9, 0, TAU); g.fill(); g.fillStyle = '#ffd95a'; g.beginPath(); g.arc(9, 9, 7, 0, TAU); g.fill(); g.fillStyle = '#fff3b0'; g.fillRect(6, 5, 3, 6); });
  SHAPES.skull = mk(40, 44, (g) => { g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(20, 18, 16, 0, TAU); g.fill(); g.fillRect(11, 26, 18, 14); g.fillStyle = '#18120e'; g.beginPath(); g.arc(13, 18, 5, 0, TAU); g.arc(27, 18, 5, 0, TAU); g.fill(); g.fillRect(18, 25, 4, 6); for (let i = 0; i < 3; i++) g.fillRect(13 + i * 6, 34, 2, 6); });
  SHAPES.tomb = mk(56, 72, (g) => { g.fillStyle = '#6f6a66'; g.beginPath(); g.roundRect(6, 4, 44, 66, [22, 22, 3, 3]); g.fill(); g.fillStyle = '#8d8781'; g.beginPath(); g.roundRect(9, 7, 34, 60, [17, 17, 2, 2]); g.fill(); g.fillStyle = '#3d3936'; g.fillRect(25, 18, 5, 30); g.fillRect(17, 26, 21, 5); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(6, 60, 44, 10); });
  SHAPES.bulb = mk(40, 56, (g) => { g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(20, 20, 16, 0, TAU); g.fill(); g.fillRect(13, 32, 14, 10); g.fillStyle = '#8a6a2a'; g.fillRect(14, 42, 12, 8); g.fillStyle = '#3a2a00'; g.font = '900 26px Georgia'; g.textAlign = 'center'; g.fillText('!', 20, 29); });
  SHAPES.book = mk(44, 40, (g) => { g.fillStyle = '#5a7ad0'; g.fillRect(2, 6, 40, 30); g.fillStyle = '#f4efe0'; g.fillRect(6, 4, 15, 28); g.fillRect(23, 4, 15, 28); g.fillStyle = '#20305a'; g.font = '900 22px Georgia'; g.textAlign = 'center'; g.fillText('?', 22, 27); });
  SHAPES.done = mk(44, 44, (g) => { g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(22, 22, 20, 0, TAU); g.fill(); g.strokeStyle = '#3a2a00'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(11, 23); g.lineTo(19, 31); g.lineTo(33, 14); g.stroke(); });
}

const MAXP = 5000;
export class Particles {
  constructor() { this.p = []; this.n = 0; for (let i = 0; i < MAXP; i++) this.p.push({ life: 0 }); this.next = 0; }
  /** o: {shape,x,y,vx,vy,g,life,size,size2,rot,spin,col:[r,g,b],a,add,drag,orient} */
  add(o) {
    const p = this.p[this.next]; this.next = (this.next + 1) % MAXP;
    p.shape = SHAPES[o.shape || 'glow']; p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.g = o.g || 0;
    p.life = p.max = o.life || 0.5; p.s0 = o.size || 10; p.s1 = o.size2 ?? p.s0; p.rot = o.rot || 0; p.spin = o.spin || 0;
    p.r = o.col ? o.col[0] : 1; p.gc = o.col ? o.col[1] : 1; p.b = o.col ? o.col[2] : 1; p.a = o.a ?? 1; p.add = o.add ?? 1; p.drag = o.drag || 0;
    p.orient = !!o.orient; p.asp = o.asp || (p.shape ? p.shape.h / p.shape.w : 1); p.front = o.front !== false; p.floor = o.floor ?? null;
    return p;
  }
  burst(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = (o.dir ?? 0) + (Math.random() - 0.5) * (o.arc ?? TAU), s = (o.speed || 120) * (0.4 + Math.random() * 0.8);
      this.add({ ...o, x: x + (Math.random() - 0.5) * (o.spread || 0), y: y + (Math.random() - 0.5) * (o.spread || 0), vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: (o.life || 0.5) * (0.6 + Math.random() * 0.7), size: (o.size || 8) * (0.6 + Math.random() * 0.8), rot: o.orient ? a : Math.random() * TAU });
    }
  }
  update(dt) {
    for (let i = 0; i < MAXP; i++) {
      const p = this.p[i]; if (p.life <= 0) continue;
      p.life -= dt; p.vy += p.g * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      if (p.floor != null && p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.6; p.spin *= 0.5; }
      if (p.orient && (p.vx || p.vy)) p.rot = Math.atan2(p.vy, p.vx);
    }
  }
  draw(rd, front, x0, x1) {
    const m = [0, 0, 0, 0, 0, 0], tint = [0, 0, 0, 0];
    for (let i = 0; i < MAXP; i++) {
      const p = this.p[i]; if (p.life <= 0 || p.front !== front || !p.shape || p.x < x0 || p.x > x1) continue;
      const t = 1 - p.life / p.max, s = p.s0 + (p.s1 - p.s0) * t, fade = p.a * Math.min(1, (1 - t) * 2.5);
      const w = s, h = s * p.asp, c = Math.cos(p.rot), sn = Math.sin(p.rot);
      m[0] = c; m[1] = sn; m[2] = -sn; m[3] = c; m[4] = p.x; m[5] = p.y;
      tint[0] = p.r; tint[1] = p.gc; tint[2] = p.b; tint[3] = fade;
      rd.affine(p.shape, m, -w / 2, -h / 2, w, h, tint, null, p.add);
    }
  }
}
