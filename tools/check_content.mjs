#!/usr/bin/env node
// Content validator for src/data/world.js, npcs.js, quests.js.  Usage: node tools/check_content.mjs [-v]
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const json = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const verbose = process.argv.includes("-v");

const errs = [], warns = [];
const err = (m) => errs.push(m), warn = (m) => warns.push(m);

const { AREAS, MAPS, DUNGEONS } = await imp("src/data/world.js");
const { NPCS } = await imp("src/data/npcs.js");
const { QUESTS, xpToNext } = await imp("src/data/quests.js");

// ── reference data ──
const best = json("assets/bestiary.json");
const C = Object.fromEntries(best.cols.map((c, i) => [c, i]));
const BEAST = new Map(best.rows.map((r) => [r[C.id], { flags: r[C.flags], grp: r[C.grp] }]));
const SLIMES = json("assets/sprites/slimes/slimes.json");
const PEOPLE = new Set(json("assets/sprites/people/manifest.json").sheets.map((s) => s.id));
const VA = json("assets/sprites/replacements/atlas.json");
const CLASSES = new Set("paladin ranger wizard necromancer barbarian dragoon totem_master death_knight arcane_sorcerer carrion_witch bard slime_lord boomerang_knight lancer dragon_knight gunner monk rogue ninja".split(" "));
const LATE = new Set(["sand", "sand2", "sea_of_sand", "air", "heavenly", "breach", "phobos"]);
const NOT_MONSTER = new Set(["familiars", "minions"]);

const mobOk = (id) => typeof id === "string" && (id.startsWith("slime:") ? id.slice(6) in SLIMES : BEAST.has(id));
const isBoss = (id) => BEAST.has(id) && (BEAST.get(id).flags & 1) === 1;
const checkMob = (id, where, { boss = false } = {}) => {
  if (!mobOk(id)) return err(`${where}: unknown mob "${id}"`);
  if (id.startsWith("slime:")) { if (boss) err(`${where}: slime used as boss`); return; }
  const b = BEAST.get(id);
  if (NOT_MONSTER.has(b.grp) || (b.grp === "va" && !/^va_velscour/.test(id))) err(`${where}: "${id}" (${b.grp}) is not a monster`);
  if (LATE.has(b.grp)) err(`${where}: "${id}" belongs to later-act group ${b.grp}`);
  if (boss && !isBoss(id)) warn(`${where}: boss "${id}" lacks the boss flag`);
  if (!boss && isBoss(id)) err(`${where}: boss-flagged "${id}" used as a regular mob/elite`);
};

// ── maps ──
const KINDS = new Set(["town", "field", "dungeon", "raid", "hall", "arena"]);
const SHAPES = new Set(["town", "field", "tiers", "tower", "cavern", "arena", "hall"]);
const byId = new Map();
for (const m of MAPS) { if (byId.has(m.id)) err(`duplicate map id ${m.id}`); byId.set(m.id, m); }
const dById = new Map(DUNGEONS.map((d) => [d.id, d]));
const mobMaps = new Map();       // mob -> Set(mapId)
const areaMobs = new Map();      // area -> Set(mob) (incl. elites and bosses)
const npcPlaced = new Map();
const addAreaMob = (area, id) => { if (!areaMobs.has(area)) areaMobs.set(area, new Set()); areaMobs.get(area).add(id); };

for (const m of MAPS) {
  const W = `map ${m.id}`;
  if (!AREAS[m.area]) err(`${W}: unknown area ${m.area}`);
  if (!KINDS.has(m.kind)) err(`${W}: bad kind ${m.kind}`);
  if (!SHAPES.has(m.shape)) err(`${W}: bad shape ${m.shape}`);
  if (!(m.w >= 2400 && m.w <= 7200)) err(`${W}: w ${m.w} out of 2400..7200`);
  if (!m.name) err(`${W}: no name`);
  if (m.kind !== "town" && m.kind !== "hall" && m.kind !== "arena") {
    const [lo, hi] = AREAS[m.area]?.level ?? [0, 0];
    if (typeof m.level !== "number") err(`${W}: missing level`);
    else if (m.special !== "breach" && (m.level < lo || m.level > hi)) err(`${W}: level ${m.level} outside area range ${lo}-${hi}`);
  }
  // mobs
  if (m.special === "breach") { if (m.mobs) err(`${W}: breach map must not list mobs`); }
  else if (m.kind === "field") {
    if (!Array.isArray(m.mobs)) err(`${W}: field without mobs`);
    else {
      if (m.mobs.length < 3 || m.mobs.length > 5) err(`${W}: ${m.mobs.length} mob kinds (want 3-5)`);
      const tot = m.mobs.reduce((s, x) => s + x[1], 0);
      if (tot < 14 || tot > 26) err(`${W}: ${tot} spawn points (want 14-26)`);
    }
  }
  const seen = new Set();
  for (const [id, n] of m.mobs ?? []) {
    checkMob(id, W);
    if (seen.has(id)) err(`${W}: mob ${id} listed twice`); seen.add(id);
    if (!(n > 0)) err(`${W}: bad spawn count for ${id}`);
    addAreaMob(m.area, id);
  }
  if (m.elite) { checkMob(m.elite, `${W} elite`); seen.add(m.elite); addAreaMob(m.area, m.elite); }
  if (m.boss) { checkMob(m.boss.id, `${W} boss`, { boss: true }); seen.add(m.boss.id); addAreaMob(m.area, m.boss.id); if (!m.boss.name) err(`${W}: boss without name`); }
  for (const id of seen) { if (!mobMaps.has(id)) mobMaps.set(id, new Set()); mobMaps.get(id).add(m.id); }
  // portals
  const targets = new Set();
  if (!m.portals?.length) err(`${W}: no portals`);
  for (const p of m.portals ?? []) {
    const okAt = ["left", "right", "mid", "top"].includes(p.at) || (typeof p.at === "number" && p.at >= 0 && p.at <= 1);
    if (!okAt) err(`${W}: bad portal at ${p.at}`);
    if ((p.to == null) === (p.dungeon == null)) { err(`${W}: portal needs exactly one of to/dungeon`); continue; }
    const tgt = p.to ?? dById.get(p.dungeon)?.rooms[0];
    if (p.dungeon && !dById.has(p.dungeon)) { err(`${W}: portal to unknown dungeon ${p.dungeon}`); continue; }
    if (p.dungeon && dById.get(p.dungeon).entrance !== m.id) err(`${W}: dungeon ${p.dungeon} entrance mismatch (${dById.get(p.dungeon).entrance})`);
    if (!byId.has(tgt)) { err(`${W}: portal to unknown map ${tgt}`); continue; }
    if (tgt === m.id) err(`${W}: portal to itself`);
    if (targets.has(tgt)) err(`${W}: two portals to ${tgt}`); targets.add(tgt);
    const back = byId.get(tgt).portals?.some((q) => (q.to ?? dById.get(q.dungeon)?.rooms[0]) === m.id);
    if (!back) err(`${W}: portal to ${tgt} has no return portal`);
  }
  // npcs
  for (const n of m.npcs ?? []) {
    if (!NPCS[n.id]) err(`${W}: unknown npc ${n.id}`);
    if (npcPlaced.has(n.id)) err(`npc ${n.id} placed twice (${npcPlaced.get(n.id)}, ${m.id})`);
    npcPlaced.set(n.id, m.id);
    if (!(n.at >= 0 && n.at <= 1)) err(`${W}: npc ${n.id} bad at`);
  }
}
for (const [id, set] of mobMaps) if (set.size > 3) err(`mob ${id} used in ${set.size} maps (${[...set].join(",")})`);

// level rises with distance from town (BFS depth within each area, along same-area portals from the area's entry maps)
const adj = (m) => (m.portals ?? []).map((p) => p.to ?? dById.get(p.dungeon)?.rooms[0]).filter((t) => byId.has(t));
const reach = new Set(["hh_square"]); const order = ["hh_square"]; const from = new Map();
for (let i = 0; i < order.length; i++) for (const t of adj(byId.get(order[i]))) if (!reach.has(t)) { reach.add(t); order.push(t); from.set(t, order[i]); }
for (const m of MAPS) if (!reach.has(m.id)) err(`map ${m.id} unreachable from hh_square`);
for (const m of MAPS) {
  if (m.kind !== "field" || m.special) continue;
  for (const t of adj(m)) { const o = byId.get(t); if (o.area === m.area && from.get(t) === m.id && o.level < m.level) err(`map ${t} (lv ${o.level}) is further from town than ${m.id} (lv ${m.level}) but lower level`); }
}

// ── dungeons ──
for (const d of DUNGEONS) {
  const W = `dungeon ${d.id}`;
  const kind = d.kind === "raid" ? "raid" : "dungeon";
  if (d.party !== (kind === "raid" ? 20 : 5)) err(`${W}: party ${d.party}`);
  if (d.rooms.length !== (kind === "raid" ? 3 : 4)) err(`${W}: ${d.rooms.length} rooms`);
  d.rooms.forEach((r, i) => {
    const m = byId.get(r); if (!m) return err(`${W}: unknown room ${r}`);
    if (m.kind !== kind) err(`${W}: room ${r} kind ${m.kind}`);
    if (m.dungeon !== d.id) err(`${W}: room ${r} lacks dungeon:"${d.id}"`);
    if (m.level !== d.level) err(`${W}: room ${r} level ${m.level} != ${d.level}`);
    const last = i === d.rooms.length - 1;
    if (last && (m.shape !== "arena" || m.boss?.id !== d.boss.id)) err(`${W}: last room must be the boss arena`);
    if (!last && !adj(m).includes(d.rooms[i + 1])) err(`${W}: room ${r} does not lead to ${d.rooms[i + 1]}`);
  });
  checkMob(d.boss.id, `${W} boss`, { boss: true });
  if (!byId.get(d.entrance)?.portals.some((p) => p.dungeon === d.id)) err(`${W}: entrance map ${d.entrance} has no dungeon portal`);
  if (d.keeper && (NPCS[d.keeper]?.role !== `dungeon:${d.id}` || npcPlaced.get(d.keeper) !== d.entrance)) err(`${W}: keeper ${d.keeper} role/placement wrong`);
}
for (const m of MAPS) if (m.dungeon && !dById.get(m.dungeon)?.rooms.includes(m.id)) err(`map ${m.id}: not listed in dungeon ${m.dungeon}`);

// ── npcs ──
const ROLES = /^(shop:(weapons|armor|potions|gems)|smith|enchant|gamble|storage|guild|arena|quest|flavor|innkeeper|travel|dungeon:(\w+))$/;
for (const [id, n] of Object.entries(NPCS)) {
  const W = `npc ${id}`;
  if (!npcPlaced.has(id)) err(`${W}: not placed in any map`);
  if (!n.name || !n.title) err(`${W}: missing name/title`);
  const r = ROLES.exec(n.role ?? ""); if (!r) err(`${W}: bad role ${n.role}`); else if (r[3] && !dById.has(r[3])) err(`${W}: role for unknown dungeon ${r[3]}`);
  const s = n.sprite ?? {};
  if (s.va) { if (!(s.va in VA)) err(`${W}: va sprite ${s.va} not in atlas`); }
  else if (s.people) { if (!PEOPLE.has(s.people)) err(`${W}: people sheet ${s.people} missing`); }
  else if (s.mob) { if (!mobOk(s.mob)) err(`${W}: mob sprite ${s.mob} missing`); }
  else if (s.hero) { if (!CLASSES.has(s.hero)) err(`${W}: hero class ${s.hero} unknown`); }
  else err(`${W}: no sprite`);
  if (!(n.greet?.length >= 5)) err(`${W}: ${n.greet?.length ?? 0} greet lines (<5)`);
  if (!(n.idle?.length >= 7)) err(`${W}: ${n.idle?.length ?? 0} idle lines (<7)`);
  for (const l of [...(n.greet ?? []), ...(n.idle ?? [])]) if (typeof l !== "string" || !l.trim()) err(`${W}: empty line`);
}
for (const role of ["guild", "arena", "storage", "innkeeper", "travel", "smith", "enchant", "gamble", "shop:weapons", "shop:armor", "shop:potions", "shop:gems"])
  if (!Object.values(NPCS).some((n) => n.role === role)) err(`no npc with role ${role}`);

// ── quests ──
const qById = new Map();
for (const q of QUESTS) { if (qById.has(q.id)) err(`duplicate quest ${q.id}`); qById.set(q.id, q); }
const allMobs = new Set(mobMaps.keys());
// dungeon areas count as part of the region holding their entrance
const regionMobs = (area) => {
  const s = new Set(areaMobs.get(area) ?? []);
  for (const d of DUNGEONS) if (byId.get(d.entrance).area === area) for (const x of areaMobs.get(d.area) ?? []) s.add(x);
  return s;
};
const SLOTS = new Set(["weapon", "offhand", "head", "body", "ring", "amulet"]);
for (const q of QUESTS) {
  const W = `quest ${q.id}`;
  for (const k of ["giver", "turnin"]) if (!NPCS[q[k]]) err(`${W}: unknown ${k} ${q[k]}`);
  if (!AREAS[q.area]) err(`${W}: unknown area ${q.area}`);
  if (q.after != null && !qById.has(q.after)) err(`${W}: after unknown quest ${q.after}`);
  if (!(q.offer?.length >= 2 && q.offer.length <= 5)) err(`${W}: offer needs 2-5 lines`);
  if (!(q.progress?.length >= 1 && q.progress.length <= 2)) err(`${W}: progress needs 1-2 lines`);
  if (!(q.done?.length >= 2 && q.done.length <= 4)) err(`${W}: done needs 2-4 lines`);
  if (!q.steps?.length) err(`${W}: no steps`);
  const free = q.main || q.area === "hollow";
  const pool = free ? allMobs : regionMobs(q.area);
  const mobRef = (id, s) => { if (!mobOk(id)) err(`${W}: unknown mob ${id}`); else if (!pool.has(id)) err(`${W}: ${s.t} target ${id} does not spawn in ${free ? "any map" : q.area}`); };
  for (const s of q.steps ?? []) {
    switch (s.t) {
      case "kill":
        if (!(s.n > 0)) err(`${W}: kill without n`);
        if (s.mob) mobRef(s.mob, s); else if (s.area) { if (!AREAS[s.area]) err(`${W}: kill area ${s.area}`); } else if (!s.any) err(`${W}: kill needs mob|area|any`);
        break;
      case "collect":
        if (!s.item || !(s.n > 0) || !(s.chance > 0 && s.chance <= 1)) err(`${W}: collect needs item,n,chance`);
        if (typeof s.from === "string") mobRef(s.from, s); else if (!AREAS[s.from?.area]) err(`${W}: collect from bad area`);
        break;
      case "talk": if (!NPCS[s.npc]) err(`${W}: talk to unknown npc ${s.npc}`); break;
      case "deliver": if (!NPCS[s.npc] || !s.item) err(`${W}: bad deliver`); break;
      case "visit": if (!byId.has(s.map)) err(`${W}: visit unknown map ${s.map}`); break;
      case "boss": mobRef(s.mob, s); if (mobOk(s.mob) && !isBoss(s.mob)) err(`${W}: boss step on non-boss ${s.mob}`); break;
      case "dungeon": if (!dById.has(s.id)) err(`${W}: unknown dungeon ${s.id}`); break;
      case "level": if (!(s.n > 0)) err(`${W}: bad level step`); break;
      default: err(`${W}: unknown step type ${s.t}`);
    }
  }
  const r = q.reward ?? {};
  const ratio = r.xp / xpToNext(q.level);
  if (!(ratio >= 0.59 && ratio <= 1.21)) err(`${W}: xp ${r.xp} is ${ratio.toFixed(2)}x xpToNext(${q.level})`);
  if (!(r.gold >= 0)) err(`${W}: bad gold`);
  if (!(r.item === null || r.item === "potions" || (SLOTS.has(r.item?.slot) && r.item.rarity >= 0 && r.item.rarity <= 3))) err(`${W}: bad reward item`);
}
// acyclic `after`
for (const q of QUESTS) { const seen = new Set(); for (let c = q; c; c = qById.get(c.after)) { if (seen.has(c.id)) { err(`quest ${q.id}: after-chain cycle`); break; } seen.add(c.id); } }
// main chain is a single line
const main = QUESTS.filter((q) => q.main);
main.forEach((q, i) => { if ((i === 0 ? null : main[i - 1].id) !== q.after) err(`main quest ${q.id}: after should be ${i ? main[i - 1].id : null}`); if (i && q.level < main[i - 1].level) err(`main quest ${q.id}: level drops`); });

// ── report ──
const distinct = new Set([...allMobs]);
console.log(`maps ${MAPS.length} (town ${MAPS.filter((m) => m.kind === "town").length}, field ${MAPS.filter((m) => m.kind === "field").length}, dungeon ${MAPS.filter((m) => m.kind === "dungeon").length}, raid ${MAPS.filter((m) => m.kind === "raid").length}) · dungeons ${DUNGEONS.length} · npcs ${Object.keys(NPCS).length} · quests ${QUESTS.length} (main ${main.length}) · distinct monsters ${distinct.size}`);
if (verbose) {
  for (const a of Object.keys(AREAS)) console.log(`  ${a.padEnd(10)} ${MAPS.filter((m) => m.area === a).map((m) => `${m.name}${m.level ? ` (${m.level})` : ""}`).join(", ")}`);
  const per = {}; for (const q of QUESTS) per[q.area] = (per[q.area] ?? 0) + 1; console.log("  quests per area:", per);
}
for (const w of warns) console.log("warn:", w);
for (const e of errs) console.log("ERROR:", e);
console.log(errs.length ? `FAILED with ${errs.length} error(s)` : "OK");
process.exit(errs.length ? 1 : 0);
