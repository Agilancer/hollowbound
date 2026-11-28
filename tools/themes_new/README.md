# themes_new - generator for src/data/themes.js (side-view art from assets/env/new)

    python3 tools/themes_new/gen.py                 # spec.py + base.json -> src/data/themes.js
    python3 tools/themes_new/check.py /tmp/previews # validate (exit 1 on error) + one preview strip per theme
    python3 tools/themes_new/contact.py /tmp/cs     # numbered contact sheets of every extracted sprite (to pick codes for spec.py)

- `spec.py`   the hand classification: per theme the tiles, ledge sprites, bridges, ladders, props (code, height, layer, placement, weight, light).
- `base.json` the fields carried over unchanged from the old themes.js (name, sky, light, far, rope, particles, lip, facade structure, PORTAL_FX, CHESTS).
- `lib.py`    sprite index + anchor maths (ground = bottom-centre of the lowest opaque band, sunk 4px; ledge top = first row with >=60% coverage,
              bridges 85% so railings are skipped; `code ay=N` in spec.py overrides a walkable-top y).
Needs python3 with Pillow + numpy, and node for check.py.
