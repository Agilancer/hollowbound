// Sprite rectangles, cast outfits and item tables.
import { need } from '../engine/assets.js';
import { layers } from '../engine/sprite.js';

// [sheet, x, y, w, h]
export const PROPS = {
  crates: ['world/decor', 34, 0, 27, 32],
  crate: ['world/decor', 2, 16, 27, 16],
  barrel: ['world/decor', 73, 14, 15, 18],
  barrels: ['world/decor', 98, 14, 29, 18],
  stumpAxe: ['world/decor', 231, 11, 21, 21],
  fruitTable: ['world/decor', 267, 34, 39, 30],
  tentPot: ['world/decor', 0, 57, 95, 71],
  logs: ['world/decor', 201, 75, 47, 21],
  basket: ['world/decor', 328, 81, 17, 15],
  tomb1: ['world/decor', 197, 104, 23, 24],
  tomb2: ['world/decor', 229, 104, 21, 24],
  tombCross: ['world/decor', 293, 101, 21, 27],
  tombBroken: ['world/decor', 321, 106, 28, 22],
  reeds: ['world/decor', 288, 139, 64, 53],
  brickWall: ['world/decor', 359, 141, 50, 51],
  scarecrow: ['world/decor', 300, 197, 40, 59],
  pumpkin1: ['world/decor', 359, 209, 19, 15],
  pumpkin2: ['world/decor', 394, 213, 14, 11],
  pumpkinPile: ['world/decor', 361, 228, 48, 28],
  rocksBig1: ['world/decor', 4, 280, 88, 40],
  rocksMid1: ['world/decor', 36, 237, 52, 19],
  laundry: ['world/decor', 27, 354, 106, 62],
  bushG: ['world/decor', 3, 424, 57, 24],
  bushG2: ['world/decor', 64, 431, 32, 17],
  fernG: ['world/decor', 98, 432, 28, 16],
  bushY: ['world/decor', 3, 456, 57, 24],
  tuft1: ['world/decor', 9, 155, 19, 5],
  tuft2: ['world/decor', 36, 155, 12, 5],
  tuft3: ['world/decor', 73, 155, 12, 5],
  tuft4: ['world/decor', 105, 155, 19, 5],
  tuft5: ['world/decor', 8, 216, 18, 8],
  houseA: ['world/house_a', 20, 0, 184, 224],
  houseB: ['world/house_b', 20, 0, 184, 224],
  potPlant1: ['world/garden_decorations', 36, 7, 23, 25],
  potPlant2: ['world/garden_decorations', 37, 36, 21, 28],
  potSmall: ['world/garden_decorations', 71, 48, 18, 16],
  sunflowers: ['world/alchemy_decor', 163, 21, 27, 43],
  angel: ['world/angel_statue', 0, 0, 64, 64],
  smallTent: ['world/small_tent', 0, 0, 64, 64],
  tree1: ['world/tree1', 0, 0, 256, 208],
  tree2: ['world/tree2', 0, 0, 256, 208],
  willow: ['world/weeping_willow1', 0, 0, 224, 192],
  birch1: ['world/birch1', 0, 0, 80, 112],
  birch2: ['world/birch2', 0, 0, 80, 112],
  flowerTree: ['world/flowering_tree', 0, 0, 96, 112],
  bigPine: ['world/large_pine_tree', 0, 0, 128, 176],
  pine: ['world/pine_trees', 0, 0, 96, 192],
  wheat: ['world/wheat', 96, 0, 32, 32],
  wheat2: ['world/wheat', 128, 0, 32, 32],
  sacks: ['world/wheat', 192, 0, 32, 32],
  tallGrass: ['world/tall_grass', 0, 0, 96, 32],
};
Object.values(PROPS).forEach((p) => need(p[0]));

// Animated props: sheet, frame w/h, frames list [col,row], fps
export const ANIMS = {
  furnace: { key: 'world/forge_sawmill', fw: 64, fh: 64, frames: [0, 1, 2, 3, 4, 5].map((c) => [c, 0]), cold: [6, 0], fps: 8 },
  sawmill: { key: 'world/forge_sawmill', fw: 64, fh: 64, frames: [0, 1, 2, 3, 4, 5].map((c) => [c, 1]), fps: 10 },
  campfire: { key: 'world/anim/campfire_sheet', fw: 32, fh: 32, frames: Array.from({ length: 40 }, (_, i) => [i % 5, Math.floor(i / 5)]), fps: 12 },
  campfireFood: { key: 'world/anim/campfire_with_food_sheet', fw: 32, fh: 32, frames: Array.from({ length: 40 }, (_, i) => [i % 5, Math.floor(i / 5)]), fps: 12 },
  torch: { key: 'world/torch', fw: 32, fh: 32, frames: [0, 1, 2, 3, 4, 5].map((c) => [c, 1]), fps: 10 },
  portal: { key: 'world/anim/portal_sheet', fw: 64, fh: 64, frames: Array.from({ length: 10 }, (_, c) => [c, 0]), fps: 10 },
  wisp: { key: 'pets/wisp', fw: 32, fh: 32, frames: [0, 1, 2, 3, 4].map((c) => [c, 0]), fps: 8 },
  coin: { key: 'ui/coin', fw: 16, fh: 16, frames: Array.from({ length: 12 }, (_, c) => [c, 0]), fps: 14 },
  goddess: { key: 'npc/shrine_spirit', fw: 64, fh: 64, frames: Array.from({ length: 13 }, (_, c) => [c, 0]), fps: 8 },
  water: { key: 'world/anim/water_tiles_sheet', fw: 160, fh: 64, frames: [[0, 0], [0, 1], [0, 2]], fps: 4 },
};
Object.values(ANIMS).forEach((a) => need(a.key));
need('world/chest', 'world/ores', 'world/planks', 'world/spikes', 'ui/icons', 'ui/hp_bar', 'ui/red_bar',
  'ui/blue_bar', 'ui/yellow_bar', 'ui/emotes', 'ui/quest_marker', 'npc/shrine_spirit_portrait',
  'world/floor_tiles1', 'world/floor_tiles2', 'world/cloud4', 'world/cloud5', 'world/cloud6',
  'world/cloud3', 'world/hot_air_balloon',
  'mobs/slime_green', 'mobs/slime_blue', 'mobs/slime_red', 'pets/dog', 'pets/cat', 'pets/fox');
for (const l of ['layer1', 'layer2', 'layer3', 'layer4', 'layer5', 'background_castle']) need(`world/bg_normal/${l}`);

const C = 'char/';
const L = (...ks) => layers(...ks.map((k) => k && C + k));
const BLADE = { wooden_sword: 'sword_wood', iron_sword: 'sword_iron', golden_sword: 'sword_gold' };
// Back items first: each layer only erases the body parts in front of it, so stacking order matters.
export const CAST = {
  hero: (sword = 'wooden_sword', lantern = false) => L(
    lantern && 'back/lantern', 'body/man_tan', 'legs/boots_brown', 'legs/pants_brown', 'top/tunic_blue', 'extras/scarf_red',
    'hair/hero_brown', 'hand/' + BLADE[sword]),
  peddler: L('back/pack_big', 'body/man_tan', 'legs/shoes', 'legs/pants_orange', 'top/shirt_green', 'hair/shaggy_black', 'hat/cap_green'),
  elder: L('body/woman_pale', 'legs/boots_dark', 'top/dress_purple', 'hair/long_grey', 'hat/witch'),
  smith: L('body/man_tan', 'legs/boots_brown', 'legs/pants_brown', 'top/shirt_linen', 'top/apron', 'hair/beard_red', 'arms/gloves_leather', 'hand/hammer'),
  merchant: L('body/woman_tan', 'legs/boots_brown', 'legs/skirt_brown', 'top/bodice_green', 'hair/braid_red', 'hand/basket'),
  farmer: L('body/man_brown', 'legs/shoes', 'legs/hose_linen', 'top/shirt_linen', 'hair/short_blond', 'hat/straw', 'hand/hoe'),
  guard: L('back/shield_round', 'body/man_dark', 'legs/boots_iron', 'legs/pants_navy', 'top/chainmail', 'hat/helmet_iron', 'hand/sword_iron'),
  tobinTied: L('body/man_pale', 'legs/pants_brown', 'top/shirt_linen', 'hair/curly_black', 'extras/rope_bound', 'extras/blindfold'),
  tobin: L('body/man_pale', 'legs/boots_brown', 'legs/pants_brown', 'top/shirt_linen', 'hair/tufts_black', 'hat/mining_helmet', 'hand/pickaxe'),
  // the ghoul and Gorrak have rigs of their own (a hunched miner; a brute drawn natively at 2x)
  ghoul: L('ghoul/body/zombie', 'ghoul/legs/pants_torn', 'ghoul/top/shirt_torn', 'ghoul/hat/mining_helmet_dented', 'ghoul/hand/pickaxe'),
  ghoulEyes: L('ghoul/glow/eyes_green'),
  wraith: L('body/ghost', 'top/robe_ghost', 'face/plague_mask'),
  boss: L('boss/back/cape_red', 'boss/body/devil', 'boss/legs/boots_iron', 'boss/legs/pants_brown', 'boss/top/chainmail',
    'boss/top/pauldrons', 'boss/hat/horned_helmet', 'boss/arms/gloves_red', 'boss/hand/greataxe'),
  bossEyes: L('boss/glow/eyes_gold'),
};
// Arms-up frames (jump/fall rows) would flare the cape over his shoulders; he wears it tucked there.
CAST.bossNoCape = CAST.boss.filter((k) => !k.includes('cape'));
// Dialogue busts, drawn natively at 2x with their own expressions (tools/art/chars.py BUSTS).
export const PORTRAITS = {
  Maren: 'npc/portrait_maren', Brann: 'npc/portrait_brann', Lise: 'npc/portrait_lise', Odo: 'npc/portrait_odo',
  Hal: 'npc/portrait_hal', Tobin: 'npc/portrait_tobin', Pip: 'npc/portrait_pip', TobinRescued: 'npc/portrait_tobin_rescued',
};
Object.values(PORTRAITS).forEach((k) => need(k));
// Preload every hero sword variant.
for (const s of ['wooden_sword', 'iron_sword', 'golden_sword']) CAST.hero(s, true);

export const SWORDS = [
  { id: 'wooden_sword', name: 'Wooden Sword', dmg: 1, icon: 5, spark: ['#c8a070', '#8a5a32'] },
  { id: 'iron_sword', name: 'Iron Sword', dmg: 2, icon: 5, spark: ['#ffffff', '#b8c0d0'] },
  { id: 'golden_sword', name: 'Golden Sword', dmg: 3, icon: 5, spark: ['#ffe680', '#e8a830'] },
];

// icons.png cells (12x12)
export const ICON = { heart: 0, heartEmpty: 1, potion: 2, key: 3, relic: 4, sword: 5, coins: 6, lantern: 7, ember: 8, gem: 9 };   // 8+ are drawn in code (ui.js)

// emoji.png rows (16x16 cells, 19 columns: pop-in, hold..., pop-out)
export const EMOTE = { question: 0, exclaim: 1, dots: 2, skull: 3, laugh: 4, smile: 5, angry: 6, sad: 7, love: 8, shock: 9, worried: 10, heart: 11, happy: 12, content: 13, blank: 14 };
