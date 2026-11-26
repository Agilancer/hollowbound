// Hand-drawn pixel font: 7px caps, 5px x-height, 2px descenders. Variable width.
// Each glyph is rows joined by '/', 'x' = ink. Rendered once per colour into an atlas.

const G = {
  A: '.xxx./x...x/x...x/xxxxx/x...x/x...x/x...x',
  B: 'xxxx./x...x/x...x/xxxx./x...x/x...x/xxxx.',
  C: '.xxx./x...x/x..../x..../x..../x...x/.xxx.',
  D: 'xxxx./x...x/x...x/x...x/x...x/x...x/xxxx.',
  E: 'xxxxx/x..../x..../xxxx./x..../x..../xxxxx',
  F: 'xxxxx/x..../x..../xxxx./x..../x..../x....',
  G: '.xxx./x...x/x..../x.xxx/x...x/x...x/.xxxx',
  H: 'x...x/x...x/x...x/xxxxx/x...x/x...x/x...x',
  I: 'xxx/.x./.x./.x./.x./.x./xxx',
  J: '..xxx/...x./...x./...x./x..x./x..x./.xx..',
  K: 'x...x/x..x./x.x../xx.../x.x../x..x./x...x',
  L: 'x..../x..../x..../x..../x..../x..../xxxxx',
  M: 'x...x/xx.xx/x.x.x/x.x.x/x...x/x...x/x...x',
  N: 'x...x/xx..x/x.x.x/x..xx/x...x/x...x/x...x',
  O: '.xxx./x...x/x...x/x...x/x...x/x...x/.xxx.',
  P: 'xxxx./x...x/x...x/xxxx./x..../x..../x....',
  Q: '.xxx./x...x/x...x/x...x/x.x.x/x..x./.xx.x',
  R: 'xxxx./x...x/x...x/xxxx./x.x../x..x./x...x',
  S: '.xxxx/x..../x..../.xxx./....x/....x/xxxx.',
  T: 'xxxxx/..x../..x../..x../..x../..x../..x..',
  U: 'x...x/x...x/x...x/x...x/x...x/x...x/.xxx.',
  V: 'x...x/x...x/x...x/x...x/x...x/.x.x./..x..',
  W: 'x...x/x...x/x...x/x.x.x/x.x.x/xx.xx/x...x',
  X: 'x...x/x...x/.x.x./..x../.x.x./x...x/x...x',
  Y: 'x...x/x...x/.x.x./..x../..x../..x../..x..',
  Z: 'xxxxx/....x/...x./..x../.x.../x..../xxxxx',
  a: '...../...../.xxx./....x/.xxxx/x...x/.xxxx',
  b: 'x..../x..../xxxx./x...x/x...x/x...x/xxxx.',
  c: '..../..../.xxx/x.../x.../x.../.xxx',
  d: '....x/....x/.xxxx/x...x/x...x/x...x/.xxxx',
  e: '...../...../.xxx./x...x/xxxxx/x..../.xxx.',
  f: '..xx/.x../xxxx/.x../.x../.x../.x..',
  g: '...../...../.xxxx/x...x/x...x/x...x/.xxxx/....x/.xxx.',
  h: 'x..../x..../xxxx./x...x/x...x/x...x/x...x',
  i: 'x/./x/x/x/x/x',
  j: '..x/.../..x/..x/..x/..x/..x/x.x/.x.',
  k: 'x.../x.../x..x/x.x./xx../x.x./x..x',
  l: 'x./x./x./x./x./x./.x',
  m: '...../...../xx.x./x.x.x/x.x.x/x.x.x/x.x.x',
  n: '..../..../xxx./x..x/x..x/x..x/x..x',
  o: '..../..../.xx./x..x/x..x/x..x/.xx.',
  p: '..../..../xxx./x..x/x..x/x..x/xxx./x.../x...',
  q: '..../..../.xxx/x..x/x..x/x..x/.xxx/...x/...x',
  r: '..../..../x.xx/xx../x.../x.../x...',
  s: '..../..../.xxx/x.../.xx./...x/xxx.',
  t: '.x../.x../xxxx/.x../.x../.x../..xx',
  u: '..../..../x..x/x..x/x..x/x..x/.xxx',
  v: '...../...../x...x/x...x/x...x/.x.x./..x..',
  w: '...../...../x...x/x...x/x.x.x/x.x.x/.x.x.',
  x: '..../..../x..x/x..x/.xx./x..x/x..x',
  y: '..../..../x..x/x..x/x..x/x..x/.xxx/...x/.xx.',
  z: '..../..../xxxx/...x/.xx./x.../xxxx',
  0: '.xx./x..x/x..x/x..x/x..x/x..x/.xx.',
  1: '.x./xx./.x./.x./.x./.x./xxx',
  2: '.xx./x..x/...x/..x./.x../x.../xxxx',
  3: 'xxx./...x/...x/.xx./...x/...x/xxx.',
  4: 'x..x/x..x/x..x/xxxx/...x/...x/...x',
  5: 'xxxx/x.../x.../xxx./...x/...x/xxx.',
  6: '.xx./x.../x.../xxx./x..x/x..x/.xx.',
  7: 'xxxx/...x/...x/..x./..x./.x../.x..',
  8: '.xx./x..x/x..x/.xx./x..x/x..x/.xx.',
  9: '.xx./x..x/x..x/.xxx/...x/...x/.xx.',
  '.': '././././././x',
  ',': '././././././x/x',
  '!': 'x/x/x/x/x/./x',
  '?': '.xx./x..x/...x/..x./..x./..../..x.',
  ':': '././x/./././x',
  ';': '././x/./././x/x',
  "'": 'x/x',
  '"': 'x.x/x.x',
  '-': '.../.../.../xxx',
  '+': '.../.../.x./xxx/.x.',
  '=': '.../.../xxx/.../xxx',
  '/': '...x/...x/..x./..x./.x../.x../x.../x...',
  '(': '.x/x./x./x./x./x./.x',
  ')': 'x./.x/.x/.x/.x/.x/x.',
  '[': 'xx/x./x./x./x./x./xx',
  ']': 'xx/.x/.x/.x/.x/.x/xx',
  '<': '.../..x/.x./x../.x./..x',
  '>': '.../x../.x./..x/.x./x..',
  '*': '.../x.x/.x./x.x',
  '%': 'x...x/x..x./...x./..x../.x.../.x..x/x...x',
  '#': '.x.x./xxxxx/.x.x./.x.x./xxxxx/.x.x.',
  '&': '.xx../x..x./.xx../.x..x/x.xx./x..x./.xx.x',
  '_': '..../..../..../..../..../..../xxxx',
  '~': '..../..../.x.x/x.x.',
  '^': '.x./x.x',
  '|': 'x/x/x/x/x/x/x',
};

const H = 9; // atlas cell height (7 + 2 descender)
export const LINE_H = 11;
const glyphs = {};
let atlasW = 0;
for (const [ch, def] of Object.entries(G)) {
  const rows = def.split('/');
  const w = Math.max(...rows.map((r) => r.length));
  glyphs[ch] = { rows, w, x: atlasW };
  atlasW += w + 1;
}
const SPACE = 3;
const atlases = new Map();

function atlas(color) {
  let c = atlases.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = atlasW;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = color;
  for (const gl of Object.values(glyphs)) {
    gl.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'x') g.fillRect(gl.x + x, y, 1, 1);
    });
  }
  atlases.set(color, c);
  return c;
}

export function measure(str) {
  let w = 0;
  for (const ch of str) {
    if (ch === ' ') w += SPACE + 1;
    else w += (glyphs[ch] || glyphs['?']).w + 1;
  }
  return Math.max(0, w - 1);
}

/** Draw text; y is the top of capital letters. opts: align ('left'|'center'|'right'), shadow colour. */
export function drawText(ctx, str, x, y, color = '#f4ead2', opts = {}) {
  str = String(str);
  const w = measure(str);
  if (opts.align === 'center') x -= Math.floor(w / 2);
  else if (opts.align === 'right') x -= w;
  x = Math.round(x);
  y = Math.round(y);
  if (opts.shadow) drawRaw(ctx, str, x + 1, y + 1, opts.shadow);
  if (opts.outline) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawRaw(ctx, str, x + dx, y + dy, opts.outline);
  }
  drawRaw(ctx, str, x, y, color);
  return w;
}

function drawRaw(ctx, str, x, y, color) {
  const a = atlas(color);
  for (const ch of str) {
    if (ch === ' ') { x += SPACE + 1; continue; }
    const gl = glyphs[ch] || glyphs['?'];
    ctx.drawImage(a, gl.x, 0, gl.w, H, x, y, gl.w, H);
    x += gl.w + 1;
  }
}

/** Greedy word wrap to a pixel width. Keeps explicit \n breaks. */
export function wrap(str, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? line + ' ' + word : word;
      if (measure(next) > maxW && line) { out.push(line); line = word; }
      else line = next;
    }
    out.push(line);
  }
  return out;
}
