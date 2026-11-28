// The bestiary: every creature Velscour has art for (assets/bestiary.json, built by
// tools/gen_bestiary.mjs), plus the 60 animated slimes. def.hw is the creature's height
// in world units (Velscour's `h` is in a world where the hero stands 60 tall; ours is 108).
import { asset } from '../core/paths.js';

export const BEST = { byId: new Map(), list: [], groups: {}, ready: false, slimes: {} };
const K = 1.8;
export async function loadBestiary() {
  const [b, sl] = await Promise.all([fetch(asset('bestiary.json')).then(r => r.json()), fetch(asset('sprites/slimes/slimes.json')).then(r => r.json()).catch(() => ({}))]);
  for (const r of b.rows) {
    const [id, name, fi, x, y, w, h, fx, ht, arch, fl, el, grp, sheet, tag] = r;
    const boss = !!(fl & 1);
    const hw = Math.max(34, Math.min(boss ? 400 : 250, ht * K));
    const d = { id, name, url: asset(b.files[fi]), x, y, w, h, fx, hw, ww: w * hw / h, arch, A: b.archs[arch] || null, boss, lone: !!(fl & 2), fly: !!(fl & 4), undead: !!(fl & 8), demon: !!(fl & 16), el, grp, sheet, tag };
    BEST.byId.set(id, d); BEST.list.push(d); (BEST.groups[grp] = BEST.groups[grp] || []).push(d);
  }
  for (const [key, s] of Object.entries(sl)) {
    const hw = Math.max(40, Math.min(74, s.bh * 1.9)), k = hw / s.bh;
    const d = { id: 'slime:' + key, name: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Slime', url: asset('sprites/slimes/' + key + '.webp'), slime: s, hw, ww: s.cw * k * 0.6, k,
      arch: 'slime', A: b.archs.slime || { hp: 0.8, dmg: 0.8, spd: 2.2, ai: 'melee' }, boss: false, lone: false, fly: false, undead: false, demon: false, el: 'acid', grp: 'slimes', sheet: 'slimes', tag: s.kind, hop: true };
    BEST.byId.set(d.id, d); BEST.list.push(d); (BEST.groups.slimes = BEST.groups.slimes || []).push(d);
  }
  BEST.ready = true;
  return BEST;
}
export const mobDef = (id) => BEST.byId.get(id) || null;
/** Enemy creatures only (no pets, summons, icons). */
export const isEnemy = (d) => !['familiars', 'minions', 'va', 'slimes'].includes(d.grp) && !/slime/i.test(d.name) && d.sheet !== 'slimes' || /^va_(velscour|deathknight|claygolem|bonecolossus|wraith|abomination|plaguebearer|hydra)$/.test(d.id);
