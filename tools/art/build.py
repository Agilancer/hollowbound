"""Repaint every Hollowbound asset from code: python tools/art/build.py [module ...]

Each module in tools/art/ draws one family of art and writes PNGs into assets/:
  chars  - the character pose rig and every paper-doll layer (assets/char/)
  world  - terrain tiles, skies, houses, trees, water (assets/world/)
  props  - town and cave props, animated fires, torches, portal, chests, ores
  ui     - HUD frames, icons, coins, emotes, effects, slimes, pets, the shrine spirit
No outside sprite packs are used; everything is drawn by these scripts.
"""
import importlib
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
MODULES = ['chars', 'world', 'props', 'ui']

if __name__ == '__main__':
    want = sys.argv[1:] or MODULES
    t0 = time.time()
    for name in want:
        t = time.time()
        mod = importlib.import_module(name)
        out = mod.build()
        n = len(out) if hasattr(out, '__len__') else '?'
        print(f'{name:6s} {n} outputs  {time.time() - t:.1f}s')
    print(f'done in {time.time() - t0:.1f}s')
