# Velscour : Hollowbound

A grimdark 2D side-scrolling action RPG with a simulated MMO around you: the world, classes, monsters
and art of **Velscour**, played as a platforming, portal-hopping, party-running side-scroller.

**Play:** https://agilancer.github.io/hollowbound/  (needs WebGPU: current Chrome/Edge, Safari on iOS/macOS 26+, Firefox on Windows)

You start in **Herrington Hollow**. Take work from the townsfolk, hunt the Forsaken Wilds, the Dark
Forest, the Cathedral Graveyard, the Fetid Sewers and Skull-Lined Catacombs beneath them, Depth's
Edge Caverns, the Veilscar March and the road to Thornwall. Other "players" are everywhere: grinding
your spot, selling junk in the square, forming parties, arguing between guilds. Team up with four of
them for a dungeon or nineteen for the raid, recruit up to four as companions, charter your own guild
and furnish its hall, and settle things in the Pit.

- 19 classes with all 684 of Velscour's skills, run in side view
- Velscour's armor / helmet / weapon overlays and fit data, composed live on every hero
- 3,100+ creatures from Velscour's bestiary (the Eternal Breach throws all of them at you)
- 69 maps, 4 party dungeons, 1 raid, 93 quests, ~8,000 lines of chatter
- Auto-play (T): quests, hunts, loots, shops and runs dungeons on its own
- Saves in the browser

## Controls

| | Keyboard | Touch |
|---|---|---|
| Move / climb | Arrows or WASD | left stick |
| Jump (Down+Jump drops through) | Space / Alt | Jump |
| Attack | X / Ctrl | Attack |
| Skills | 1-8 | skill arc |
| Potions | Q / E | potion buttons |
| Enter portal | Up | stick up |
| Talk / interact | F | Talk |
| Loot | Z (or walk over it) | walk over it |
| Auto-play | T | AUTO |
| Bag / Hero / Skills / Quests / Map / Party / Guild / Bestiary | I C V L M P G B | menu row |

## Run it locally

No build step: plain ES modules.

```
python3 -m http.server 8200
```

Then open http://localhost:8200. See `CLAUDE.md` for the layout of the code and the tests.
