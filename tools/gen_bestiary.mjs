// Builds assets/bestiary.json from Velscour's data modules: every creature Velscour knows,
// resolved to its atlas file + cell, with its archetype's combat temperament.
//   node tools/gen_bestiary.mjs /path/to/velscour
import fs from 'node:fs';
const V = process.argv[2] || '/home/user/agilancer/velscour';
const b = await import(V + '/src/data/bestiary.js');
const { ARCH } = await import(V + '/src/data/enemies.js');
const man = JSON.parse(fs.readFileSync(V + '/assets/sprites/enemies/enemies.json'));
const rep = JSON.parse(fs.readFileSync(V + '/assets/sprites/replacements/atlas.json'));
const sos = JSON.parse(fs.readFileSync(V + '/assets/tiles/sea_of_sand/pack.json'));
const sosFrames = [...sos.atlases.monster.map(f => ({ ...f, file: 'tiles/sea_of_sand/monster.webp' })), ...sos.atlases.boss.map(f => ({ ...f, file: 'tiles/sea_of_sand/boss.webp' }))];
const files = [], fileIx = new Map();
const fi = (f) => { if (!fileIx.has(f)) { fileIx.set(f, files.length); files.push(f); } return fileIx.get(f); };
const out = [], skipped = {};
const archs = {};
for (const [k, a] of Object.entries(ARCH)) archs[k] = { ai: a.ai, hp: a.hp, dmg: a.dmg, spd: a.spd, gore: a.gore, undead: !!a.undead, fly: !!a.fly, ranged: a.ranged || a.proj || undefined };
for (const [id, e] of Object.entries(b.ART_BY_ID)) {
  let file, x, y, w, h, fx;
  const sheet = e.sheet || '';
  if (id.startsWith('va_')) {
    const c = rep[id.slice(3)]; if (!c) { skipped.va = (skipped.va || 0) + 1; continue; }
    file = 'sprites/replacements/atlas.webp'; ({ x, y, w, h } = c); fx = w / 2;
  } else if (sheet === 'sea_of_sand') {
    const f = sosFrames[e.i]; if (!f) { skipped.sos = (skipped.sos || 0) + 1; continue; }
    file = f.file; ({ x, y, w, h } = f); fx = f.pivot ? f.pivot[0] : w / 2;
  } else if (sheet.startsWith('heavenly')) {
    file = 'tiles/heavenly/grid.webp'; x = (e.i % 8) * 64; y = Math.floor(e.i / 8) * 64; w = 64; h = 64; fx = 32;
  } else {
    const m = man[sheet], c = m && m.cells[e.i]; if (!c) { skipped[sheet] = (skipped[sheet] || 0) + 1; continue; }
    file = 'sprites/enemies/' + m.file; ({ x, y, w, h, fx } = c);
  }
  const grp = id.startsWith('va_') ? 'va' : sheet.split('/')[0];
  const fl = (e.boss ? 1 : 0) | (e.lone ? 2 : 0) | (e.fly ? 4 : 0) | (e.undead ? 8 : 0) | (e.demon ? 16 : 0);
  out.push([id, e.name || id, fi(file), x, y, w, h, Math.round(fx * 10) / 10, e.h || 50, e.arch || '', fl, e.el || '', grp,
    sheet.split('/')[1] || e.family || e.cat || '', e.title || e.family || e.theme || e.cat || e.tier || '']);
}
fs.writeFileSync('assets/bestiary.json', JSON.stringify({ cols: ['id', 'name', 'file', 'x', 'y', 'w', 'h', 'fx', 'ht', 'arch', 'flags', 'el', 'grp', 'sheet', 'tag'], files, archs, rows: out }));
console.log(out.length, 'creatures;', files.length, 'files; skipped', skipped);
const g = {}; for (const r of out) g[r[12]] = (g[r[12]] || 0) + 1; console.log(g);
console.log([...new Set(Object.values(archs).map(a => a.ai))].join(','));
console.log(JSON.stringify(out.filter(r=>r[12]==='va').map(r=>r[0])).slice(0,1500));
