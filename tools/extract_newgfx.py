#!/usr/bin/env python3
"""Cut the sprite sheets and tilesets in assets/newgfx into game-ready art.

Sprite sheets (magenta background): a "heat map" of how far each pixel is from the key
colour gives the object mask; connected blobs become sprites. Holes that the key colour
punched inside an object (enclosed magenta, magenta-tinted speckle) are filled from the
surrounding pixels so the art stays whole, and the pink fringe on outlines is cleaned.
Each sheet is written as a transparent WebP with the same layout plus rects in
assets/env/new/sprites.json.

Tilesets: only the seamless 128px texture (top-left cell of each material) is taken, packed
ten to a row in assets/env/new/tiles_*.webp with names in tiles.json; the stepped "stairs"
piece of the 100 seamless sets is kept too (stairs.webp).
    python3 tools/extract_newgfx.py
"""
import os, json, glob, csv, re
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = 'assets/newgfx'; OUT = 'assets/env/new'
os.makedirs(OUT + '/sheets', exist_ok=True)

def heat(rgb):
    """0..1: how strongly a pixel is the magenta key (1 = pure key)."""
    r, g, b = [rgb[..., i].astype(np.float32) for i in range(3)]
    pink = np.minimum(r, b) - g                    # magenta = high r and b, low g
    bal = 1 - np.abs(r - b) / 255.0
    return np.clip(pink / 200.0, 0, 1) * np.clip(bal, 0, 1) ** 2

def cut_sheet(path, pack, sprites):
    im = np.array(Image.open(path).convert('RGB')); H, W, _ = im.shape
    h = heat(im)
    bg = h > 0.55
    # the background is what the key colour reaches from the sheet's border
    lab, n = ndi.label(bg); border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border))
    # large key-coloured regions inside an object are real openings (arches, ladder gaps); small ones are damage
    inner = bg & ~outside; ilab, m = ndi.label(inner)
    if m:
        sizes = ndi.sum(inner, ilab, range(1, m + 1)); big = np.isin(ilab, [i + 1 for i, s in enumerate(sizes) if s > 90])
        outside |= big
    solid = ~outside
    solid = ndi.binary_opening(solid, iterations=1) | (solid & ndi.binary_dilation(ndi.binary_erosion(solid, iterations=2), iterations=3))
    rgb = im.astype(np.float32)
    # repair: pixels inside the object that still carry the key colour take the colour of their nearest clean neighbour
    dirty = solid & (h > 0.13)
    clean = solid & ~dirty
    if dirty.any() and clean.any():
        idx = ndi.distance_transform_edt(~clean, return_distances=False, return_indices=True)
        fill = rgb[idx[0], idx[1]]
        near = ndi.distance_transform_edt(~clean) <= 6
        fix = dirty & near
        rgb[fix] = fill[fix] * 0.92                                   # a touch darker: reads as shadowed detail, not a patch
        solid &= ~(dirty & ~near)
    # soft pink halo on the outline: pull the edge pixels toward the interior colour
    edge = solid & ~ndi.binary_erosion(solid, iterations=1)
    halo = edge & (h > 0.08)
    if halo.any():
        core = solid & ~edge
        if core.any():
            idx = ndi.distance_transform_edt(~core, return_distances=False, return_indices=True)
            rgb[halo] = rgb[idx[0], idx[1]][halo] * 0.8
    out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), (solid * 255).astype(np.uint8)])
    # sprites = blobs, with fragments that belong together (a chain and its lamp) merged by a small dilation
    grow = ndi.binary_dilation(solid, iterations=5)
    lab, n = ndi.label(grow)
    name = os.path.splitext(os.path.basename(path))[0]
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab)):
        part = solid[sl] & (lab[sl] == i + 1)
        if part.sum() < 260: 
            out[sl][..., 3][lab[sl] == i + 1] = 0; continue
        ys, xs = np.where(part); y0, x0 = sl[0].start + ys.min(), sl[1].start + xs.min(); y1, x1 = sl[0].start + ys.max() + 1, sl[1].start + xs.max() + 1
        boxes.append([int(x0), int(y0), int(x1 - x0), int(y1 - y0)])
    boxes.sort(key=lambda b: (round((b[1] + b[3] / 2) / (H / 4.0)), b[0]))       # reading order
    rel = f'sheets/{pack}_{name}.webp'
    Image.fromarray(out, 'RGBA').save(f'{OUT}/{rel}', lossless=True, method=4)
    for k, b in enumerate(boxes): sprites.append({'id': f'{pack}/{name}#{k}', 'pack': pack, 'sheet': name, 'src': 'env/new/' + rel, 'rect': b})
    return len(boxes)

def main():
    sprites = []
    packs = [('env', 'Hollowbound_Environment_Sprite_Sheets'), ('acres', 'Hollowbound_Fallow_Acres_50_Terrain_Sprites'), ('dng40', 'Hollowbound_40_Dungeon_Sprite_Sheets'), ('dng100', 'Hollowbound_100_More_Dungeon_Sprite_Sheets')]
    for pack, d in packs:
        n = 0
        for p in sorted(glob.glob(f'{SRC}/{d}/*.png')): n += cut_sheet(p, pack, sprites)
        print(pack, n, 'sprites')
    json.dump({'sprites': sprites}, open(OUT + '/sprites.json', 'w'), separators=(',', ':'))
    # ---- tiles
    tiles = []; briefs = {}
    cp = f'{SRC}/Hollowbound_100_Multi_Material_Tilesets/Material_Index.csv'
    if os.path.exists(cp):
        for r in csv.DictReader(open(cp)): briefs[(r['sheet'], int(r['slot']))] = r['texture brief']
    cells = []
    for p in sorted(glob.glob(f'{SRC}/Hollowbound_100_Seamless_Dungeon_Tilesets/*.png')):
        im = Image.open(p).convert('RGBA'); nm = os.path.splitext(os.path.basename(p))[0]
        cells.append((('s_' + nm).lower(), nm[4:].replace('_', ' '), im.crop((0, 0, 128, 128))))
    stairs = []
    for p in sorted(glob.glob(f'{SRC}/Hollowbound_100_Seamless_Dungeon_Tilesets/*.png')):
        im = Image.open(p).convert('RGBA'); stairs.append(im.crop((256, 288, 512, 368)))
    for p in sorted(glob.glob(f'{SRC}/Hollowbound_100_Multi_Material_Tilesets/*.png')):
        im = Image.open(p).convert('RGBA'); nm = os.path.splitext(os.path.basename(p))[0]
        for s in range(6):
            cx, cy = (s % 3) * 512, (s // 3) * 512
            cells.append((f'm_{nm}_{s + 1}'.lower(), briefs.get((nm + '.png', s + 1), nm[4:].replace('_', ' ')), im.crop((cx, cy, cx + 128, cy + 128))))
    per = 100
    for a in range(0, len(cells), per):
        chunk = cells[a:a + per]; sheet = Image.new('RGBA', (1280, 128 * ((len(chunk) + 9) // 10)))
        for i, (tid, brief, t) in enumerate(chunk):
            x, y = (i % 10) * 128, (i // 10) * 128; sheet.paste(t, (x, y))
            px = np.array(t.convert('RGB')).reshape(-1, 3).mean(0)
            tiles.append({'id': tid, 'name': brief, 'src': f'env/new/tiles_{a // per}.webp', 'rect': [x, y, 128, 128], 'color': [int(v) for v in px]})
        sheet.save(f'{OUT}/tiles_{a // per}.webp', lossless=True, method=4)
    st = Image.new('RGBA', (2560, 80 * 10))
    for i, s in enumerate(stairs): st.paste(s, ((i % 10) * 256, (i // 10) * 80))
    st.save(f'{OUT}/stairs.webp', lossless=True, method=4)
    json.dump({'tiles': tiles, 'stairs': {'src': 'env/new/stairs.webp', 'cell': [256, 80], 'cols': 10, 'order': [c[0] for c in cells[:100]]}}, open(OUT + '/tiles.json', 'w'), separators=(',', ':'))
    print(len(tiles), 'tiles')

if __name__ == '__main__': main()
