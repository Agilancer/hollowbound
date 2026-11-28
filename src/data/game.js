// Game rules glue: Velscour's classes and skills (imported as they are) plus the numbers
// that turn them into a side-scroller: levels, damage, monster scaling.
export { CLASSES, ATTRS } from './velscour/classes.js';
export { SKILLS, CLASS_SKILLS, GRANTS, ROW_LEVELS, MAX_SKILL_LEVEL, skillBaseDamage, manaCost, cooldown, useTime, weaponCoef, buffAmount, curseAmount, skillDuration, skillRange, grantedSkillsAt, describe } from './velscour/skills.js';
export { SUMMONS } from './velscour/summons.js';
export { ELEM, elem } from './velscour/elem.js';
import { CLASSES } from './velscour/classes.js';

export const CLASS_IDS = Object.keys(CLASSES);
export const MAX_LEVEL = 100;
export const TILE = 62;                 // one Velscour tile in world units (skill ranges and radii)
export const HERO_H = 108;              // hero art crown-to-sole, world units

export const xpToNext = (L) => Math.round((45 * L * L + 35 * L) * (1 + Math.pow(L / 25, 1.25)));
export const weaponAvg = (ilvl) => 6 + ilvl * 1.8 + 0.022 * ilvl * ilvl;
export const armorDiv = (L) => 40 + 14 * L + 0.12 * L * L;
const rankAt = (L) => Math.max(1, Math.min(20, 1 + Math.floor(L / 4)));
const lvf = (r) => 1 + 0.12 * (r - 1) + 0.0025 * (r - 1) * (r - 1);
/** What a typical hero of level L hits for with a basic skill: the yardstick monsters are built on. */
export const refHit = (L) => (8 * lvf(rankAt(L)) + weaponAvg(L) * 0.8) * (1 + (24 + 3 * (L - 1)) * 0.0028);
/** A typical hero's life at level L. */
export const refLife = (L) => 95 + 18 * (L - 1) + 0.45 * (L - 1) * (L - 1) + (24 + 2 * (L - 1)) * 6;
export const mobLife = (L, hp = 1) => Math.round(refHit(L) * 4.2 * hp);
export const mobDamage = (L, dmg = 1) => Math.max(2, Math.round(refLife(L) / 21 * dmg));
export const mobXp = (L) => Math.max(3, Math.round(xpToNext(L) / (10 + L * 3.2)));
export const mobGold = (L) => Math.round(3 + L * 2.2);

// the base each class holds (Velscour's classes.js weapon/offhand; dual-wielders hold a second weapon)
export const classWeapon = (cls) => (cls === 'ninja' ? 'sword' : CLASSES[cls].weapon === 'katana' ? 'sword' : CLASSES[cls].weapon);
export const classOffhand = (cls) => ({ barbarian: 'axe', rogue: 'dagger' }[cls] || CLASSES[cls].offhand || null);
export const isRanged = (cls) => ['ranger', 'wizard', 'necromancer', 'arcane_sorcerer', 'carrion_witch', 'gunner', 'bard', 'totem_master', 'boomerang_knight'].includes(cls);
export const className = (cls) => CLASSES[cls]?.name || cls;
