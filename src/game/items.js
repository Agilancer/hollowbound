// Items: rolled gear (Velscour's rarities, bases and looks), potions, and bag handling.
// A gear item's `look` is [design seed, finish, fx, 2]: the hero compositor turns it into
// one of the class's armor/helmet designs or one of the 50 held designs of its rarity.
import { RARITY } from '../data/items.js';
import { PALETTES } from '../data/gear.js';
import { HELD_PER, heldSetOf } from '../data/held.js';
import { weaponAvg, classWeapon, classOffhand, CLASSES } from '../data/game.js';

export const SLOTS = ['weapon', 'offhand', 'head', 'body', 'ring', 'amulet'];
export const SLOT_NAME = { weapon: 'Weapon', offhand: 'Off-hand', head: 'Helm', body: 'Armor', ring: 'Ring', amulet: 'Amulet' };
const BASE_NAME = {
  mace: ['Mace', 'Cudgel', 'Morningstar', 'Flanged Mace'], sword: ['Sword', 'Longsword', 'Falchion', 'Brand'], axe: ['Axe', 'Cleaver', 'Bearded Axe', 'Hatchet'],
  dagger: ['Dagger', 'Stiletto', 'Kris', 'Shiv'], staff: ['Staff', 'Crook', 'Rod', 'Stave'], wand: ['Wand', 'Sceptre', 'Bone Wand'], bow: ['Bow', 'Longbow', 'Warbow'],
  spear: ['Spear', 'Pike', 'Glaive', 'Lance'], pistol: ['Pistol', 'Handcannon', 'Flintlock'], boomerang: ['Boomerang', 'War Rang', 'Glaive-Rang'], lute: ['Lute', 'Mandola', 'Hurdy'],
  shield: ['Shield', 'Bulwark', 'Aegis', 'Targe'], quiver: ['Quiver'], tome: ['Tome', 'Grimoire', 'Codex'], orb: ['Orb', 'Sphere', 'Eye'], idol: ['Idol', 'Fetish'], skull: ['Skull', 'Reliquary Skull'],
  lantern: ['Lantern', 'Corpse-Lamp'], drum: ['Drum', 'War Drum'], jar: ['Jar', 'Ooze Jar'], rang: ['Off-Rang'], bomb: ['Bomb Satchel', 'Grenado'], nunchaku: ['Nunchaku'],
  head: ['Helm', 'Casque', 'Hood', 'Crown', 'Visor'], body: ['Armor', 'Plate', 'Hauberk', 'Vestments', 'Harness'], ring: ['Ring', 'Band', 'Signet', 'Loop'], amulet: ['Amulet', 'Charm', 'Talisman', 'Pendant'],
};
const PREFIX = ['Ashen', 'Grave', 'Hollow', 'Blighted', 'Vigil', 'Ember', 'Mourning', 'Rusted', 'Sworn', 'Pallid', 'Thornwall', 'Gallows', 'Bell-Warden\'s', 'Carrion', 'Cinder', 'Drowned', 'Ossuary', 'Moonlit', 'Veilscar', 'Penitent', 'Wyrm-Etched', 'Reliquary', 'Black Tide', 'Lampwarden\'s', 'Seventh Seal', 'Fiend-Marked', 'Tessariel\'s', 'Herrington\'s'];
const SUFFIX = ['of the Hollow', 'of Ash', 'of the Ninth Bell', 'of Mourning', 'of the Vigil', 'of Cold Embers', 'of the Barrow', 'of Saint Ivo', 'of the Fiend', 'of the Sacred Flame', 'of Thorns', 'of the Drowned', 'of Six Seals', 'of the Last Watch', 'of Marrow', 'of Dusk', 'of the Rookery', 'of Ruin', 'of Quiet Graves', 'of the Deep'];
const AFFIX = [   // stat, weight, value per ilvl factor, flat
  ['str', 3, 0.5, 2], ['dex', 3, 0.5, 2], ['vit', 3, 0.5, 2], ['int', 3, 0.5, 2], ['life', 3, 4, 12], ['mana', 2, 2, 8],
  ['dmgPct', 2, 0.35, 4], ['crit', 2, 0.08, 2], ['armor', 2, 0.9, 3], ['speed', 1, 0.05, 3], ['leech', 1, 0.03, 1], ['regen', 1, 0.08, 1], ['gf', 1, 0.6, 5], ['xp', 1, 0.1, 2],
];
export const STAT_LABEL = { dmg: 'Damage', armor: 'Armor', str: 'Strength', dex: 'Dexterity', vit: 'Vitality', int: 'Intellect', life: 'Life', mana: 'Mana', dmgPct: '% Damage', crit: '% Critical', speed: '% Move Speed', leech: '% Life Steal', regen: 'Life / sec', gf: '% Gold Find', xp: '% Experience', block: '% Block' };

const rnd = (a, b) => a + Math.random() * (b - a), ri = (a, b) => Math.floor(rnd(a, b + 1)), pick = (a) => a[Math.floor(Math.random() * a.length)];
let nextId = 1;
export const setNextItemId = (n) => { nextId = Math.max(nextId, n); };

export function rollRarity(ilvl, luck = 0) {
  let total = 0; const w = RARITY.map((r) => { const v = r.id > 5 || ilvl < r.minIlvl ? 0 : r.weight * (r.id >= 2 ? 1 + luck : 1); total += v; return v; });
  let x = Math.random() * total;
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
  return 0;
}
function finishFor(rarity, force) {
  if (!force && Math.random() < 0.12) return 0;
  const ok = []; PALETTES.forEach((p, i) => { if (i && p.tier <= rarity && p.tier >= rarity - 2) ok.push(i); });
  return ok.length ? pick(ok) : 0;
}
/** Roll a piece of gear. opts: { slot, cls (whose weapon bases), ilvl, rarity } */
export function makeGear(opts) {
  const ilvl = Math.max(1, opts.ilvl | 0), cls = opts.cls || 'paladin';
  const slot = opts.slot || pick(['weapon', 'weapon', 'offhand', 'head', 'body', 'body', 'ring', 'amulet']);
  const rarity = opts.rarity ?? rollRarity(ilvl, opts.luck || 0);
  let base = slot;
  if (slot === 'weapon') base = classWeapon(cls); else if (slot === 'offhand') base = classOffhand(cls) || 'shield';
  const R = RARITY[rarity], stats = {};
  const power = (1 + R.bonus * 0.09);
  if (slot === 'weapon') stats.dmg = Math.round(weaponAvg(ilvl) * power);
  else if (slot === 'offhand') { if (base === 'shield') { stats.armor = Math.round((4 + ilvl * 1.5) * power); stats.block = 6 + rarity * 2; } else stats.dmg = Math.round(weaponAvg(ilvl) * 0.28 * power); }
  else if (slot === 'head') stats.armor = Math.round((3 + ilvl * 1.2) * power);
  else if (slot === 'body') stats.armor = Math.round((6 + ilvl * 2.2) * power);
  const nAff = [0, 1, 2, 3, 4, 5, 6][rarity] + (slot === 'ring' || slot === 'amulet' ? 1 : 0);
  const pool = AFFIX.slice();
  for (let i = 0; i < nAff && pool.length; i++) {
    let tot = 0; for (const a of pool) tot += a[1]; let x = Math.random() * tot, k = 0;
    for (; k < pool.length; k++) { x -= pool[k][1]; if (x <= 0) break; }
    const a = pool.splice(Math.min(k, pool.length - 1), 1)[0];
    stats[a[0]] = (stats[a[0]] || 0) + Math.max(1, Math.round((a[3] + a[2] * ilvl) * rnd(0.7, 1.15) * (1 + R.bonus * 0.12)));
  }
  const bn = pick(BASE_NAME[base] || BASE_NAME[slot] || ['Relic']);
  const name = rarity === 0 ? bn : rarity === 1 ? `${pick(PREFIX)} ${bn}` : `${pick(PREFIX)} ${bn} ${pick(SUFFIX)}`;
  const visual = slot === 'weapon' || slot === 'offhand' || slot === 'head' || slot === 'body';
  const it = { id: nextId++, type: 'gear', slot, base, cls: slot === 'weapon' || slot === 'offhand' ? cls : null, name, rarity, ilvl, stats,
    look: visual ? [ri(0, 999), finishFor(rarity, slot === 'head'), -1, 2] : null, value: Math.round((8 + ilvl * 4) * (1 + rarity * 1.4)) };
  return it;
}
export const itemScore = (it) => { if (!it) return 0; let s = 0; const st = it.stats; s += (st.dmg || 0) * 3 + (st.armor || 0) * 1.2 + (st.str || 0) + (st.dex || 0) + (st.vit || 0) + (st.int || 0) + (st.life || 0) * 0.15 + (st.mana || 0) * 0.08 + (st.dmgPct || 0) * 2 + (st.crit || 0) * 2.5 + (st.block || 0) + (st.leech || 0) * 3 + (st.speed || 0) + (st.regen || 0) * 2; return s; };
export const rarityColor = (r) => RARITY[Math.min(6, r | 0)].color;
export const rarityName = (r) => RARITY[Math.min(6, r | 0)].name;
/** Can `cls` use this weapon/off-hand? (class weapon bases; armor and jewellery fit everyone) */
export function canEquip(it, cls) {
  if (it.slot === 'weapon') return it.base === classWeapon(cls);
  if (it.slot === 'offhand') return it.base === (classOffhand(cls) || '?');
  return true;
}
/** The compositor look for an equip set: resolves seeds against the class's art. */
export function lookOf(cls, equip, designs) {
  const body = equip.body, head = equip.head, RN = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const look = { armor: [1, 0], helm: null, weapon: null, offhand: null };
  if (designs) {
    const band = body ? (designs.armor[RN[Math.min(5, body.rarity)]] || designs.armor.common || [1]) : (designs.armor.common || [1]);
    look.armor = body ? [band[body.look[0] % band.length], body.look[1]] : [band[0], 0];
    if (head && designs.helms.length) {
      const top = Math.max(...designs.helms.map(d => d.rarity)), r = Math.min(head.rarity, top);
      const ok = designs.helms.filter(d => d.rarity === r); const pool = ok.length ? ok : designs.helms;
      look.helm = [pool[head.look[0] % pool.length].id, head.look[1]];
    }
  }
  for (const slot of ['weapon', 'offhand']) {
    const it = equip[slot]; if (!it || !heldSetOf(it.base, slot, cls)) continue;
    const R = Math.min(5, it.rarity);
    look[slot] = { base: it.base, rarity: R, idx: it.look ? it.look[0] % HELD_PER[R] : 0, finish: it.look ? it.look[1] : 0, element: it.el || null };
  }
  return look;
}
export const lookKey = (cls, l) => cls + '|' + l.armor.join(',') + '|' + (l.helm ? l.helm.join(',') : '-') + '|' + ['weapon', 'offhand'].map(s => l[s] ? l[s].base + l[s].rarity + '.' + l[s].idx + '.' + l[s].finish : '-').join('|');

/** Starter kit for a class at a level (heroes, fake players). */
export function kitFor(cls, lvl, quality = 0) {
  const eq = {};
  const r = (b) => Math.max(0, Math.min(5, b + (Math.random() < 0.3 ? 1 : 0)));
  const base = lvl < 4 ? 0 : lvl < 10 ? 1 : lvl < 20 ? 2 : lvl < 32 ? 2 : 3;
  eq.weapon = makeGear({ slot: 'weapon', cls, ilvl: lvl, rarity: r(base + quality) });
  if (classOffhand(cls)) eq.offhand = makeGear({ slot: 'offhand', cls, ilvl: lvl, rarity: r(base + quality) });
  eq.body = makeGear({ slot: 'body', cls, ilvl: lvl, rarity: r(base + quality) });
  eq.head = makeGear({ slot: 'head', cls, ilvl: lvl, rarity: r(base + quality) });
  if (lvl >= 8) eq.ring = makeGear({ slot: 'ring', cls, ilvl: lvl, rarity: r(base) });
  if (lvl >= 14) eq.amulet = makeGear({ slot: 'amulet', cls, ilvl: lvl, rarity: r(base) });
  return eq;
}
export const POTIONS = { hp: { name: 'Blood Draught', price: 20, pct: 0.45 }, mp: { name: 'Wit Tincture', price: 24, pct: 0.5 } };
