# Hollowbound

A small 2D action platformer. Explore the mining village of Emberwick, then go down into
Gloamhollow, the old mine beneath the hill, to bring back the Hearthstone from Gorrak, the
Horned Foreman.

**Play it in the browser:** https://agilancer.github.io/hollowbound/

Runs on desktop and phones (touch controls appear on touch screens). Xbox, PlayStation and
Switch-style controllers work on desktop browsers and on iPhone/iPad.

## Controls

| Action   | Keyboard              | Controller |
|----------|-----------------------|------------|
| Move     | Arrows / WASD         | Left stick or d-pad |
| Jump     | Z, Space or K         | A |
| Attack   | X or J                | X |
| Dash     | C, L or Shift         | B, RB or RT |
| Talk     | E                     | Y |
| Potion   | Q or H                | LB or LT |
| Pause    | Esc or P              | Menu / View |

## Run it locally

No build step: it's plain JavaScript modules.

```
python tools/serve.py
```

Then open http://localhost:8420. Add `--lan` to let phones on your Wi-Fi connect.

## Art

Every sprite, tile, background and UI piece is original and drawn by code in `tools/art/`:

- `kit.py`: the shared palette, style guide and pixel tools
- `chars.py`: a pose rig plus paper-doll layers (bodies, clothes, hair, hats, held items) for every character,
  rig variants for the ghoul and for Gorrak (drawn natively at twice the resolution), and the dialogue portraits
- `world.py`: terrain autotiles, parallax skies, houses, trees and water
- `props.py`: town and cave props, fires, torches, chests, ores and the portal
- `ui.py`: the HUD, icons, emotes, effects, slimes, pets and the shrine spirit

To repaint everything into `assets/` (needs Python 3 and Pillow):

```
python tools/art/build.py
```

Sound effects are synthesized at runtime with the Web Audio API.
