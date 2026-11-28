"""Shared helpers for the theme generator: sprite index, alpha analysis, anchors."""
import json, os, functools
import numpy as np
from PIL import Image
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ASSETS = os.path.join(ROOT, 'assets')
SPR = json.load(open(os.path.join(ASSETS, 'env/new/sprites.json')))['sprites']
TILES_DOC = json.load(open(os.path.join(ASSETS, 'env/new/tiles.json')))
TILES = {t['id']: t for t in TILES_DOC['tiles']}
BY_ID = {s['id']: s for s in SPR}
BY_SHEET = {}
for s in SPR: BY_SHEET.setdefault((s['pack'], s['sheet']), []).append(s)

@functools.lru_cache(maxsize=64)
def image(src):
    return Image.open(os.path.join(ASSETS, src)).convert('RGBA')

@functools.lru_cache(maxsize=None)
def alpha(sid):
    s = BY_ID[sid]; x, y, w, h = s['rect']
    return np.asarray(image(s['src']).crop((x, y, x + w, y + h)))[:, :, 3] > 40

def crop(sid):
    s = BY_ID[sid]; x, y, w, h = s['rect']
    return image(s['src']).crop((x, y, x + w, y + h))

def ground_anchor(sid, sink=4):
    """bottom-centre of the lowest opaque band (the object's base), sunk a few px."""
    a = alpha(sid); h, w = a.shape
    rows = np.where(a.any(axis=1))[0]
    bot = int(rows[-1])
    band = a[max(0, bot - max(6, h // 14)):bot + 1]
    cols = np.where(band.any(axis=0))[0]
    cx = int(round((cols[0] + cols[-1]) / 2))
    return [cx, max(0, bot + 1 - sink)]

def top_anchor(sid, frac=0.6):
    """walkable top: first row from the top whose opaque coverage exceeds frac of the sprite's opaque width."""
    a = alpha(sid); h, w = a.shape
    cols = np.where(a.any(axis=0))[0]
    span = cols[-1] - cols[0] + 1
    cov = a.sum(axis=1) / float(span)
    idx = np.where(cov >= frac)[0]
    if len(idx) == 0: idx = np.where(cov >= cov.max() * 0.9)[0]
    return [int(round((cols[0] + cols[-1]) / 2)), int(idx[0]) + 2]

def hang_anchor(sid):
    a = alpha(sid); rows = np.where(a.any(axis=1))[0]; top = int(rows[0])
    cols = np.where(a[top:top + 6].any(axis=0))[0]
    return [int(round((cols[0] + cols[-1]) / 2)), top + 1]

def wall_anchor(sid):
    s = BY_ID[sid]; return [s['rect'][2] // 2, s['rect'][3] // 2]
