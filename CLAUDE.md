# VELSCOUR : HOLLOWBOUND — notes for Claude sessions

A side-scrolling action RPG (classic 2D-MMO feel: footholds, ropes, portals, parties) built on Velscour's
art and data. Plain JavaScript ES modules, **WebGPU** renderer, DOM UI, no build step, no dependencies.
GitHub Pages serves `main` at https://agilancer.github.io/hollowbound/.

## Run / test
```bash
python3 -m http.server 8200              # from the repo root
# http://localhost:8200/?cls=wizard&lvl=12&map=forest_2&auto=1&speed=4   (dev: start straight into a hero)
node tools/check_content.mjs -v          # world / npc / quest data cross-checks
node tools/check_nav.mjs                 # every foothold of every map reachable
node tools/gen_bestiary.mjs /path/to/velscour   # rebuild assets/bestiary.json from Velscour's data modules
```
Headless Chromium in the cloud container cannot present a WebGPU canvas. Add `?offscreen` and the renderer
draws to a texture and reads it back onto a 2D canvas (`src/gpu/renderer.js`); launch Chromium with
`--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader --use-vulkan=swiftshader`.
`window.HOLLOWBOUND = { G, game }` is the debug hook (`await game.travel('cata_3')`, `game.enterDungeon('barrow')`,
`game.toggleAuto(true)`, `window.HB_SPEED = 4`).

## Layout
- `src/gpu/` renderer (one instanced sprite pipeline + procedural sky + post pass) and the atlas (one rgba8
  texture array; `keep` pages for heroes/UI/FX, `map` pages wiped on map change; monsters upload as cells).
- `src/gfx/herolook.js` the hero compositor ported from Velscour (armor recolour by palette, helmet fit,
  held weapons in the fists) — uses Velscour's `assets/sprites/gear` + `held` data unchanged.
  `sprites.js` sprite sources, `draw.js` the transform "animation" (bob, squash, lunge, cast, topple),
  `scene.js` terrain/far layers/props/facades baked per map from `src/data/themes.js`, `fx.js`, `text.js`.
- `src/data/velscour/` Velscour's own modules, copied as they are: classes, skilldata (684 skills as
  `"Name|kind|element|fx|mods"`), skills formulas, summons, taunts, town scripts. `src/data/game.js` re-exports
  them with this game's numbers (levels, monster scaling). `world.js` maps/areas/dungeons, `npcs.js`,
  `quests.js`, `themes.js`, `chatter_solo.js`, `chatter_convo.js`.
- `src/world/layout.js` seeded foothold generator (town/field/tiers/tower/cavern/arena/hall), `map.js` map runtime.
- `src/game/` `body.js` foothold physics, `actor.js` Hero/Mob, `combat.js`, `effects.js` + `skillrun.js`
  (the 23 skill kinds in side view), `brain.js` (monster AI, platform graph, hero Bot), `director.js`
  (auto-play), `social.js` (the 170 simulated players, guilds, chatter), `quests.js`, `items.js`,
  `actions.js` (everything the UI can ask for), `game.js` (loop, travel, dungeons, save).
- `src/ui/` DOM HUD, windows and touch controls. The UI reads `G` and `G.events` and calls `G.game.*`.

## Rules of thumb
- World units: the hero is ~100 tall; Velscour tiles are 62 units (`TILE`); Velscour creature heights ×1.8.
- Art has no animation frames (slimes excepted): all motion is transform-based in `gfx/draw.js`.
- Never recolour or refit hero gear by hand: change data in Velscour and re-copy.
- Assets under `assets/` come from the velscour, bellmourn and bm repos (see `tools/`); keep additions lean.
