"""Hollowbound world art: terrain autotiles, planks, spikes, the town sky and parallax, clouds,
the far balloon, creek water, the two village houses and the trees.

Run `python tools/art/world.py` to repaint just these into assets/.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

R = RAMPS


def hsh(*a):
    """Well-mixed 0..1 hash of integers (murmur-style finaliser per value). Shadows kit.hsh,
    whose low bits barely change with later arguments, which striped the dirt."""
    h = 0x9E3779B9
    for v in a:
        h = ((h ^ (int(v) & 0xffffffff)) * 0x85EBCA6B) & 0xffffffff
        h ^= h >> 13
        h = (h * 0xC2B2AE35) & 0xffffffff
        h ^= h >> 16
    return h / 4294967296.0


def dith(x, y, t, a, b):
    """a on about t of pixels (ordered), else b."""
    return a if dither(x, y, t) else b


def rgb(c):
    return (c[0], c[1], c[2], 255)


def put(cv, x, y, c):
    """Fast opaque write (no blending), bounds-checked."""
    if c is not None and 0 <= x < cv.w and 0 <= y < cv.h:
        cv.p[x, y] = c if len(c) == 4 else (c[0], c[1], c[2], 255)


# =====================================================================================
# 1. TERRAIN AUTOTILES
# =====================================================================================
#
# drawRock() in src/engine/tiles.js builds every 16px tile out of four 8x8 quarters, and a
# quarter is always copied to the same quarter position it had in its sheet cell. So any
# texture that is a function of (x mod 16, y mod 16) joins seamlessly in every combination.
# The sheet is painted as: a periodic background + edge shading by distance to open space
# (kept inside 5px, well within a quarter) + small features that never touch a quarter border.

ISL = (0, 0, 96, 96)          # island block: cells 0-5 x 0-5
HOLE = (112, 16, 64, 64)      # hole block: cells 7-10 x 1-4, open middle cells 8-9 x 2-3


def _block_mask(kind):
    """Return (w, h, ox, oy, solid(x, y) in block coords)."""
    if kind == 'island':
        x0, y0, w, h = ISL
        cut = [3, 1, 1]      # rounded outer corners: px removed per row from each corner

        def solid(x, y):
            if not (0 <= x < w and 0 <= y < h):
                return False
            for i, c in enumerate(cut):
                if (y == i or y == h - 1 - i) and (x < c or x >= w - c):
                    return False
            return True
        return w, h, x0, y0, solid
    x0, y0, w, h = HOLE

    def solid(x, y):
        if not (0 <= x < w and 0 <= y < h):
            return True      # the hole block sits in endless rock
        return not (16 <= x < 48 and 16 <= y < 48)
    return w, h, x0, y0, solid


def _edge_info(solid, w, h, cap=12):
    """Per solid pixel: straight distances to open space up/down/left/right (0 = touching),
    and the distance/direction to the nearest open pixel (for inner corners)."""
    info = {}
    for y in range(h):
        for x in range(w):
            if not solid(x, y):
                continue
            d = []
            for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                k = 0
                while k < cap and solid(x + dx * (k + 1), y + dy * (k + 1)):
                    k += 1
                d.append(k)
            best, bx, by = 99.0, 0, 0
            for yy in range(-4, 5):
                for xx in range(-4, 5):
                    if (xx or yy) and not solid(x + xx, y + yy):
                        dd = math.hypot(xx, yy)
                        if dd < best:
                            best, bx, by = dd, xx, yy
            info[(x, y)] = (d[0], d[1], d[2], d[3], best, bx, by)
    return info


def _classify(inf):
    """-> (category, distance) of the nearest edge, or (None, 99)."""
    dU, dD, dL, dR, de, bx, by = inf
    cands = [('top', dU), ('left', dL), ('right', dR), ('bottom', dD)]
    cat, d = min(cands, key=lambda c: c[1])
    if d >= 8 and de < 5:
        # inner corner: it belongs to the wall face beside it
        cat = 'left' if bx < 0 else 'right'
        d = max(1, int(round(de - 1)))
    if d >= 8:
        return None, 99
    return cat, d


def _paint_blocks(cv, shade_px):
    """Run shade_px(X, Y, info, cat, d) -> (colour|None, is_edge) over both blocks. Returns
    the set of pixels that got edge treatment (features stay off those quarters)."""
    edge = set()
    for kind in ('island', 'hole'):
        w, h, ox, oy, solid = _block_mask(kind)
        info = _edge_info(solid, w, h)
        for (x, y), inf in info.items():
            X, Y = ox + x, oy + y
            cat, d = _classify(inf)
            c, is_edge = shade_px(X, Y, inf, cat, d)
            if is_edge:
                edge.add((X, Y))
            if c is not None:
                cv.p[X, Y] = rgb(c)
    return edge


def _cells():
    return [(cx, cy) for cy in range(6) for cx in range(6)] + \
           [(cx, cy) for cy in range(1, 5) for cx in range(7, 11) if not (8 <= cx <= 9 and 2 <= cy <= 3)]


def _periodic16(seed, recipe, ysym=False):
    """A 16x16 wrap-around grid of small marks. recipe: [(count, [mark, ...])], a mark being a
    list of (dx, dy, value). ysym mirrors rows 0-7 into 8-15."""
    g = [[0] * 16 for _ in range(16)]
    n = 0
    for count, marks in recipe:
        for i in range(count):
            cx = int(hsh(seed, n, 1) * 16)
            cy = int(hsh(seed, n, 2) * (8 if ysym else 16))
            mk = marks[int(hsh(seed, n, 3) * len(marks))]
            for (dx, dy, val) in mk:
                g[(cy + dy) & 15][(cx + dx) & 15] = val
            n += 1
    if ysym:
        for v in range(8):
            g[15 - v] = list(g[v])
    return g


def _quarter_ok(cv, edge, x0, y0, w=8, h=8):
    return not any((x0 + i, y0 + j) in edge or cv.p[x0 + i, y0 + j][3] == 0
                   for i in range(w) for j in range(h))


def _town_features(cv, edge):
    """Pebbles, clods and root threads inside quarters, never touching a quarter border."""
    D = R['dirt']
    st = R['stone_warm']
    for (cx, cy) in _cells():
        for qy in range(2):
            for qx in range(2):
                x0, y0 = cx * 16 + qx * 8, cy * 16 + qy * 8
                if not _quarter_ok(cv, edge, x0, y0):
                    continue

                def k(n):
                    return hsh(cx, cy, qx, qy, 41, n)
                hq = k(0)
                if hq < 0.22:
                    # a small buried stone, lit from the upper left, shadow under it
                    sw = 3 + int(k(1) * 3)
                    sh = 2 + int(k(2) * 2)
                    sx = x0 + 1 + int(k(3) * (6 - sw + 1))
                    sy = y0 + 1 + int(k(4) * (5 - sh + 1))
                    cool = k(5) < 0.35
                    rr = R['stone'] if cool else st
                    for j in range(sh):
                        for i in range(sw):
                            if sw > 3 and sh > 2 and i in (0, sw - 1) and j in (0, sh - 1):
                                continue
                            if sw <= 3 and i == sw - 1 and j == 0:
                                continue
                            c = rr[2]
                            if j == 0 or (i == 0 and j < sh - 1):
                                c = rr[3]
                            if j == sh - 1 or (i == sw - 1 and j > 0):
                                c = rr[1]
                            cv.p[sx + i, sy + j] = rgb(c)
                    if sy + sh <= y0 + 6:
                        for i in range(1, sw):
                            cv.p[sx + i, sy + sh] = rgb(D[1])
                elif hq < 0.3:
                    # a root thread wandering down
                    sx = x0 + 2 + int(k(7) * 4)
                    c = mix(D[1], D[2], 0.25)
                    for n in range(5 + int(k(8) * 2)):
                        cv.p[sx, y0 + 1 + n] = rgb(c)
                        if k(20 + n) < 0.45:
                            sx = max(x0 + 1, min(x0 + 6, sx + (1 if k(30 + n) < 0.5 else -1)))
                elif hq < 0.36:
                    # a worm-hole: dark dot with a lit lower lip
                    sx = x0 + 2 + int(k(9) * 4)
                    sy = y0 + 2 + int(k(10) * 4)
                    cv.p[sx, sy] = rgb(D[1])
                    cv.p[sx + 1, sy] = rgb(D[1])
                    cv.p[sx, sy + 1] = rgb(mix(D[2], D[3], 0.6))
                    cv.p[sx + 1, sy + 1] = rgb(mix(D[2], D[3], 0.6))


def _cave_features(cv, edge):
    """Chunky chiselled stone: lit lips, dark crevices and the odd quartz glint."""
    C = CAVE
    body = mix(C[1], C[2], 0.4)
    for (cx, cy) in _cells():
        for qy in range(2):
            for qx in range(2):
                x0, y0 = cx * 16 + qx * 8, cy * 16 + qy * 8
                if not _quarter_ok(cv, edge, x0, y0):
                    continue

                def k(n):
                    return hsh(cx, cy, qx, qy, 43, n)
                hq = k(0)
                if hq < 0.5:
                    # one stone chunk
                    sw = 4 + int(k(1) * 3)
                    sh = 3 + int(k(2) * 3)
                    sx = x0 + 1 + int(k(3) * (7 - sw))
                    sy = y0 + 1 + int(k(4) * (7 - sh))
                    for j in range(sh):
                        for i in range(sw):
                            corner = i in (0, sw - 1) and j in (0, sh - 1)
                            if corner and not (i == 0 and j == 0 and k(5) < 0.5):
                                continue
                            c = body
                            if j == 0 or i == 0:
                                c = C[2]
                            if (j == 0 and i == 1) or (i == 0 and j == 1):
                                c = C[3]
                            if j == sh - 1 or i == sw - 1:
                                c = C[0]
                            cv.p[sx + i, sy + j] = rgb(c)
                elif hq < 0.62:
                    # two pebbles
                    for n in range(2):
                        px_ = x0 + 1 + int(k(10 + n) * 4)
                        py_ = y0 + 1 + n * 3 + int(k(12 + n) * 2)
                        cv.p[px_, py_] = rgb(C[2])
                        cv.p[px_ + 1, py_] = rgb(body)
                        cv.p[px_ + 1, py_ + 1] = rgb(C[0])
                        cv.p[px_, py_ + 1] = rgb(C[0])
                elif hq < 0.68:
                    # quartz glint
                    sx = x0 + 2 + int(k(9) * 4)
                    sy = y0 + 2 + int(k(11) * 4)
                    cv.p[sx, sy] = rgb(C[4])
                    cv.p[sx + 1, sy] = rgb(C[3])
                    cv.p[sx, sy + 1] = rgb(C[2])
        # chiselled cracks: they may cross quarter lines (a crack that stops looks natural)
        for n in range(2):
            if hsh(cx, cy, 77, n) < 0.45:
                continue
            x = cx * 16 + 3 + int(hsh(cx, cy, 78, n) * 10)
            y = cy * 16 + 2 + int(hsh(cx, cy, 79, n) * 6)
            ln = 4 + int(hsh(cx, cy, 80, n) * 6)
            for s in range(ln):
                if (x, y) in edge or not (cx * 16 + 1 <= x < cx * 16 + 15 and cy * 16 + 1 <= y < cy * 16 + 15):
                    break
                cv.p[x, y] = rgb(C[0])
                if (x + 1, y + 1) not in edge and cv.p[x + 1, y + 1][3]:
                    cv.p[x + 1, y + 1] = rgb(C[2])
                y += 1
                r = hsh(cx, cy, s, n, 81)
                x += -1 if r < 0.3 else (1 if r > 0.6 else 0)


# turf columns (16-periodic): bottom row of the grass per column, and where blade tips stand
TURF_DEPTH = [5, 5, 6, 6, 7, 6, 5, 5, 5, 4, 5, 6, 6, 5, 5, 5]
TURF_TIPS = {1, 2, 5, 8, 9, 10, 13}
TURF_STROKE = {3, 7, 11, 14}


def terrain_town():
    cv = Canvas(288, 576)
    D = R['dirt']
    G = R['grass']
    base = D[2]
    light_soil = mix(D[2], D[3], 0.5)
    shadow = D[1]
    tex = _periodic16(5, [
        (5, [[(0, 0, 2), (1, 0, 2), (0, 1, 1), (1, 1, 1), (2, 1, 1)],     # a lit lump
             [(0, 0, 2), (0, 1, 1), (1, 1, 1)]]),
        (6, [[(0, 0, 1), (1, 0, 1)], [(0, 0, 1), (0, 1, 1)], [(0, 0, 1)]]),  # darker clods
        (5, [[(0, 0, 3)]]),                                                   # deep specks
        (3, [[(0, 0, 4), (1, 0, 4)], [(0, 0, 4)]]),                           # sandy flecks
    ])
    tone = {0: base, 1: mix(D[1], D[2], 0.5), 2: mix(D[2], D[3], 0.55), 3: D[1], 4: mix(D[2], R['sand'][1], 0.45)}

    def bg(x, y):
        return tone[tex[y & 15][x & 15]]

    profiles = {
        'left':   [D[0], D[3], ('L', .5), ('L', .2)],
        'right':  [D[0], D[1], ('S', .5), ('S', .2)],
        'bottom': [D[0], D[1], D[1], ('S', .5), ('S', .25)],
        'top':    [D[0], D[3], ('L', .5), ('L', .2)],
    }

    def shade_px(X, Y, inf, cat, d):
        dU, dD, dL, dR, de = inf[:5]
        c = bg(X, Y)
        edge = False
        if cat and d < len(profiles[cat]):
            p = profiles[cat][d]
            if isinstance(p, tuple):
                c = (light_soil if p[0] == 'L' else shadow) if dither(X, Y, p[1]) else c
            else:
                c = p
            edge = True
        u = X & 15
        gd = TURF_DEPTH[u]
        side = min(dL, dR)
        if dU <= gd:
            edge = True
            if dU == 0:
                c = (G[4] if u in (2, 9) else G[3]) if u in TURF_TIPS else None
            elif dU == 1:
                c = G[3] if (u in TURF_STROKE and u & 1) else G[4]
            elif dU == 2:
                c = G[3] if u not in (0, 6, 12) else G[4]
            elif dU == gd:
                c = G[1]
            elif dU == gd - 1:
                c = G[2] if dU <= 3 else dith(X, Y, 0.5, G[1], G[2])
            elif u in TURF_STROKE:
                c = G[2]
            else:
                c = G[3] if dU == 3 else G[2]
            # rounded over the side, with its own dark edge
            if side == 0:
                c = None if dU <= 1 else G[0]
            elif side == 1:
                if dU == 0:
                    c = None
                elif dU == 1:
                    c = G[3] if dL == 1 else G[2]
                elif dL != 1 and dU >= 2:
                    c = G[1]
        elif dU == gd + 1 and dU <= 7 and side > 0:
            c = shadow       # contact shadow under the turf
            edge = True
        elif dU <= 7 and side == 0:
            c = G[0]         # the turf skirt hangs a little over the side
            edge = True
        return c, edge

    edge = _paint_blocks(cv, shade_px)
    _town_features(cv, edge)
    return cv


# dark warm-grey cave stone (the old rock was near-black; the cave warms it a little in code)
CAVE = [hexc('#0d0a0b'), hexc('#1a1411'), hexc('#28201b'), hexc('#3e342d'), hexc('#5c4c40')]


def terrain_cave():
    cv = Canvas(288, 576)
    C = CAVE
    base = C[1]
    tex = _periodic16(9, [
        (2, [[(0, 0, 1), (1, 0, 1), (1, 1, 2)], [(0, 0, 1), (0, 1, 1), (1, 1, 2)]]),
        (3, [[(0, 0, 1)]]),
        (2, [[(0, 0, 3), (1, 0, 3)]]),
    ], ysym=True)
    tone = {0: base, 1: C[0], 2: mix(C[1], C[2], 0.6), 3: mix(C[1], C[2], 0.5)}

    def bg(x, y):
        return tone[tex[y & 15][x & 15]]

    # top and bottom share one bevel (a grassless top corner is the bottom corner, flipped)
    profiles = {
        'top':    [C[0], C[3], ('H', .45), ('H', .15)],
        'bottom': [C[0], C[3], ('H', .45), ('H', .15)],
        'left':   [C[0], C[4], C[2], ('H', .3)],
        'right':  [C[0], C[0], ('S', .45), ('S', .15)],
    }

    def shade_px(X, Y, inf, cat, d):
        c = bg(X, Y)
        if cat and d < len(profiles[cat]):
            p = profiles[cat][d]
            if isinstance(p, tuple):
                yy = (15 - (Y & 15)) if cat == 'bottom' else Y
                c = (C[2] if p[0] == 'H' else C[0]) if dither(X, yy, p[1]) else c
            else:
                c = p
            return c, True
        return c, False

    edge = _paint_blocks(cv, shade_px)
    _cave_features(cv, edge)
    return cv


# =====================================================================================
# 2. PLANKS AND SPIKES
# =====================================================================================

def planks():
    """48x8: left end, middle (repeats), right end. Top surface rows 0-2, front face below."""
    W = R['wood']
    I = R['iron']
    cv = Canvas(48, 8)
    for x in range(48):
        piece, u = x // 16, x % 16
        for y in range(8):
            if y == 0:
                c = W[4] if (x * 7) % 11 else W[3]
            elif y == 1:
                c = W[3]
            elif y == 2:
                c = W[2] if not dither(x, y, 0.25) else W[3]
            elif y == 7:
                c = W[0]
            else:
                c = W[2]
                # grain: long thin streaks on the face
                g = hsh(x // 5, y, 3)
                if (y in (4, 5)) and g < 0.35:
                    c = W[1]
                elif y == 6:
                    c = mix(W[1], W[2], 0.5)
            cv.p[x, y] = rgb(c)
        # board joints every 16px (at the end of each board), lit lip just right of it
    for piece in range(3):
        x0 = piece * 16
        if piece < 2:
            jx = x0 + 15
            for y in range(1, 8):
                cv.p[jx, y] = rgb(W[0])
            cv.p[jx, 0] = rgb(W[2])
        # nails near both ends of each board
        for nx in (x0 + 2, x0 + 12):
            cv.p[nx, 4] = rgb(I[3])
            cv.p[nx, 5] = rgb(I[1])
    # left end: end grain with a rounded corner
    for y in range(8):
        cv.p[0, y] = rgb(W[0])
    cv.p[0, 0] = CLEAR
    cv.p[1, 0] = rgb(W[3])
    for y in range(1, 7):
        cv.p[1, y] = rgb(W[3] if y < 3 else mix(W[2], W[3], 0.5))
    # right end
    for y in range(8):
        cv.p[47, y] = rgb(W[0])
    cv.p[47, 0] = CLEAR
    for y in range(1, 7):
        cv.p[46, y] = rgb(W[1])
    cv.p[46, 0] = rgb(W[2])
    return cv


def spikes():
    """16x16: three heavy iron spikes (about 10px) on a riveted base strip."""
    I = R['iron']
    rust = R['copper']
    cv = Canvas(16, 16)
    # spikes: (centre, tip row, half-width at the base)
    for cx, tip, hwb in ((2.5, 5, 3.0), (8.0, 2, 3.4), (13.5, 5, 3.0)):
        for y in range(tip, 13):
            t = (y - tip + 1) / (13 - tip)
            hw = max(0.5, hwb * t ** 0.85)
            l, r = int(math.floor(cx - hw + 0.5)), int(math.ceil(cx + hw - 0.5)) - 1
            if r < l:
                r = l
            for x in range(l, r + 1):
                if not (0 <= x < 16):
                    continue
                rel = (x + 0.5 - (cx - hw)) / (2 * hw)
                if x == r and r > l:
                    c = I[0]
                elif rel < 0.34:
                    c = I[3]
                elif rel < 0.6:
                    c = I[2]
                else:
                    c = I[1]
                if y == tip:
                    c = I[4]
                elif y == tip + 1 and rel < 0.6:
                    c = I[3]
                # a little rust creeping up from the base
                if y > 10 and hsh(x, y, 5) < 0.2 and 0.2 < rel < 0.8:
                    c = rust[1] if rel > 0.5 else rust[2]
                cv.p[x, y] = rgb(c)
    # base strip with rivets
    for x in range(16):
        cv.p[x, 12] = rgb(I[2])
        cv.p[x, 13] = rgb(I[1])
        cv.p[x, 14] = rgb(I[1] if x % 8 not in (3, 4) else I[0])
        cv.p[x, 15] = rgb(I[0])
    for rx in (3, 11):
        cv.p[rx, 13] = rgb(I[3])
        cv.p[rx, 14] = rgb(I[0])
    return cv


# =====================================================================================
# 3. TOWN SKY AND PARALLAX (1024 x 346, every layer tiles horizontally)
# =====================================================================================

PW, PH = 1024, 346


def wput(cv, x, y, c):
    if 0 <= y < cv.h:
        cv.p[int(x) % cv.w, int(y)] = c if len(c) == 4 else (c[0], c[1], c[2], 255)


def wnoise(x, period, seed, octaves=((1, 1.0),)):
    """Smooth periodic noise from integer-frequency sines (tiles every `period` px)."""
    v = 0.0
    for k, amp in octaves:
        ph = hsh(seed, k) * math.tau
        v += amp * math.sin(math.tau * k * x / period + ph)
    return v


def sky():
    bands = [(0, '#3c6cab'), (44, '#4677b4'), (82, '#5183bd'), (114, '#5d8fc5'), (141, '#6a9ccd'),
             (164, '#78a9d4'), (184, '#87b6dc'), (201, '#97c2e2'), (216, '#a8cee7'), (229, '#bad8eb'),
             (241, '#cbe2ee'), (252, '#d9e9ee'), (263, '#e5efec'), (276, '#ecf1e6')]
    cv = Canvas(PW, PH)
    for y in range(PH):
        c = None
        for y0, hx in bands:
            if y >= y0:
                c = hexc(hx)
        for x in range(PW):
            cv.p[x, y] = c
    return cv


def _peak_layer(cv, peaks, cols, seed, jag=1.0, snow=None, spine_tilt=0.3, base_rows=None):
    """Paint a range of peaks back to front. Each peak: (cx, apex_y, slope_l, slope_r).
    cols: dict lit/body/shade (+ edge). Left of each peak's spine is lit, right is shade."""
    # draw tallest first so lower foothills sit in front
    for i, (cx, ay, sl, sr) in sorted(enumerate(peaks), key=lambda e: e[1][1]):
        span_l = int((PH - ay) / sl) + 2
        span_r = int((PH - ay) / sr) + 2
        for dx in range(-span_l, span_r + 1):
            x = cx + dx
            s = sl if dx < 0 else sr
            top = ay + abs(dx) * s
            # jagged rock edge, periodic so the layer still tiles
            top += jag * (wnoise(x, PW, seed + i, ((37, 1.2), (61, 0.8), (113, 0.6))) +
                          (1.5 if hsh(int(x) % PW, seed, i) < 0.15 else 0))
            top = int(round(top))
            spine = cx + (top - ay) * spine_tilt * (0.7 + 0.3 * wnoise(x, PW, seed + 9, ((23, 1),)))
            for y in range(max(0, top), PH):
                sp = cx + (y - ay) * spine_tilt + 2 * wnoise(y, 64, seed + i, ((1, 1), (2, 0.6)))
                lit = x < sp
                c = cols['lit'] if lit else cols['shade']
                if y > top + 26 + 6 * wnoise(x, PW, seed + 3, ((11, 1),)):
                    c = cols['body'] if lit else mix(cols['body'], cols['shade'], 0.5)
                if snow and y < ay + snow[0] + 3 * wnoise(x, PW, seed + 5, ((53, 1), (97, 0.7))):
                    c = snow[1] if lit else snow[2]
                if y == top and 'edge' in cols:
                    c = cols['edge']
                wput(cv, x, y, c)
            # gullies: short dithered streaks of shade running down the lit faces
            if dx < -3 and hsh(int(x) % PW, seed, 77) < 0.05:
                gl = 6 + int(hsh(int(x) % PW, seed, 78) * 12)
                for k in range(gl):
                    if dither(x, top + 4 + k, 0.5):
                        wput(cv, x + k // 3, top + 4 + k, cols['shade'])


def castle_layer():
    cv = Canvas(PW, PH)
    far = {'lit': hexc('#b6c5df'), 'body': hexc('#a6b7d5'), 'shade': hexc('#98aacb')}
    # far range: low, very hazy
    peaks = []
    for i in range(14):
        cx = int(i * PW / 14 + hsh(i, 1, 5) * 50)
        if 180 < cx < 420:
            continue
        ay = 152 + int(hsh(i, 2, 5) * 24)
        peaks.append((cx, ay, 0.45 + hsh(i, 3, 5) * 0.3, 0.5 + hsh(i, 4, 5) * 0.3))
    # the castle's mountain, around x 300 so it is on screen in town (see report)
    CX = 300
    peaks.append((CX + 2, 131, 0.42, 0.38))
    peaks.append((CX - 64, 156, 0.5, 0.55))
    peaks.append((CX + 70, 160, 0.45, 0.5))
    _peak_layer(cv, peaks, far, 31, jag=0.7, spine_tilt=0.3)
    # a level summit for the castle to stand on
    ledge_y = 134
    for x in range(CX - 18, CX + 19):
        for y in range(ledge_y - 8, ledge_y):
            cv.p[x % PW, y] = CLEAR
        for y in range(ledge_y, ledge_y + 2):
            cv.p[x % PW, y] = rgb(far['lit'] if x < CX + 3 else far['shade'])
    _castle(cv, CX, ledge_y)
    return cv


def _castle(cv, cx, base):
    """A small hazy castle: curtain wall, a tall keep and towers with pointed roofs."""
    lit, body, shd = hexc('#c2cee3'), hexc('#adbbd7'), hexc('#9aaacb')
    roof_l, roof_d = hexc('#97a1c6'), hexc('#848fb7')
    win = hexc('#8696ba')

    def tower(x0, w, top, roof_h, flag=False, windows=True):
        for y in range(top, base + 1):
            for x in range(x0, x0 + w):
                c = body
                if x == x0:
                    c = lit
                elif x >= x0 + w - max(1, w // 3):
                    c = shd
                put(cv, x, y, c)
        mid = x0 + (w - 1) / 2.0
        for k in range(roof_h):
            hw = (w / 2.0 + 0.6) * (k + 1) / roof_h
            y = top - roof_h + k
            for x in range(int(math.floor(mid - hw + 0.5)), int(math.ceil(mid + hw - 0.5)) + 1):
                put(cv, x, y, roof_l if x <= mid else roof_d)
        if flag:
            fx = int(round(mid))
            for y in range(top - roof_h - 4, top - roof_h):
                put(cv, fx, y, shd)
            put(cv, fx + 1, top - roof_h - 4, hexc('#c89aa6'))
            put(cv, fx + 2, top - roof_h - 4, hexc('#c89aa6'))
            put(cv, fx + 1, top - roof_h - 3, hexc('#b88896'))
        if windows:
            for wy in range(top + 3, base - 5, 6):
                put(cv, int(mid), wy, win)

    # curtain wall with merlons
    for x in range(cx - 15, cx + 16):
        for y in range(base - 7, base + 1):
            c = body if x < cx + 8 else shd
            if y == base - 7:
                c = lit if x < cx + 8 else body
            put(cv, x, y, c)
        if (x - cx) % 3 == 0:
            put(cv, x, base - 8, lit if x < cx + 8 else body)
    for y in range(base - 3, base + 1):
        for x in range(cx - 1, cx + 1):
            put(cv, x, y, win)
    tower(cx - 17, 5, base - 13, 5)
    tower(cx + 13, 5, base - 14, 6)
    tower(cx - 8, 4, base - 17, 5, windows=False)
    tower(cx - 2, 7, base - 24, 8, flag=True)
    tower(cx + 7, 4, base - 16, 5, windows=False)


def layer4():
    cv = Canvas(PW, PH)
    cols = {'lit': hexc('#9aaccd'), 'body': hexc('#8a9dc2'), 'shade': hexc('#7b8eb6')}
    snow = (12, hexc('#dbe4f1'), hexc('#b9c6df'))
    peaks = []
    # keep a low saddle around x 200-470 so the castle hill shows through
    xs = [40, 120, 175, 505, 575, 650, 730, 800, 870, 945, 1000]
    for i, cx in enumerate(xs):
        ay = 128 + int(hsh(i, 2, 6) * 26)
        peaks.append((cx, ay, 0.6 + hsh(i, 3, 6) * 0.35, 0.55 + hsh(i, 4, 6) * 0.4))
    for i, cx in enumerate((250, 330, 420)):
        peaks.append((cx, 168 + i * 3, 0.35, 0.4))
    _peak_layer(cv, peaks, cols, 41, jag=1.0, snow=snow, spine_tilt=0.28)
    # haze band at the foot of the range
    for x in range(PW):
        for y in range(PH):
            c = cv.p[x, y]
            if c[3] and y > 196 + 3 * wnoise(x, PW, 3, ((7, 1),)):
                cv.p[x, y] = rgb(mix(c, hexc('#a3b6d2'), 0.45 if y < 204 else 0.6))
    return cv


def _pine_shape(h, w, seed, tiers=None):
    """Silhouette rows of a conifer: list of (dy, left, right) offsets from the trunk axis."""
    tiers = tiers or max(3, h // 7)
    rows = []
    for dy in range(h):
        t = dy / max(1, h - 1)
        tier_t = (dy * tiers / h) % 1.0
        hw = (0.5 + t * w / 2.0) * (0.62 + 0.38 * tier_t)
        if dy < 2:
            hw = 0.5
        jl = 1 if hsh(seed, dy, 1) < 0.25 else 0
        jr = 1 if hsh(seed, dy, 2) < 0.25 else 0
        rows.append((dy, -int(round(hw)) + jl, int(round(hw)) - jr))
    return rows


def _forest(cv, base_y, trees, cols, seed, light_frac=0.45, tier_shadow=True):
    """Draw pines (x, height, width) standing on base_y(x)."""
    for i, (tx, th, tw) in enumerate(trees):
        by = int(round(base_y(tx)))
        top = by - th
        shape = _pine_shape(th, tw, seed + i)
        tiers = max(3, th // 7)
        for dy, l, r in shape:
            y = top + dy
            w = r - l + 1
            for x in range(l, r + 1):
                rel = (x - l) / max(1, w - 1)
                c = cols['lit'] if rel < light_frac else cols['shade']
                tier_t = (dy * tiers / th) % 1.0
                if tier_shadow and tier_t > 0.82 and rel > 0.25:
                    c = cols['dark']
                if dy < 3 or (x == l and rel < light_frac):
                    c = cols['hi'] if 'hi' in cols else cols['lit']
                wput(cv, tx + x, y, c)


def _fill_below(cv, top_fn, col_fn):
    for x in range(PW):
        t = int(top_fn(x))
        for y in range(max(0, t), PH):
            c = col_fn(x, y, t)
            if c is not None:
                cv.p[x, y] = rgb(c)


def layer3():
    """Far pine forest: hazy blue-green, small dense pines on rolling hills."""
    cv = Canvas(PW, PH)
    cols = {'lit': hexc('#7da2b0'), 'shade': hexc('#6990a1'), 'dark': hexc('#62889a'), 'hi': hexc('#8aaeb9')}
    ground = lambda x: 178 + 6 * wnoise(x, PW, 51, ((2, 1), (5, 0.6), (9, 0.3)))
    trees = []
    x = 0
    n = 0
    while x < PW:
        h = 10 + int(hsh(n, 1, 7) * 12)
        trees.append((x, h, int(h * 0.55)))
        x += 4 + int(hsh(n, 2, 7) * 5)
        n += 1
    _fill_below(cv, lambda x: ground(x) - 4, lambda x, y, t: hexc('#6990a1') if y < t + 30 else hexc('#6b91a2'))
    _forest(cv, ground, trees, cols, 300, light_frac=0.45, tier_shadow=False)
    return cv


def layer2():
    """Nearer pine forest: greener, bigger pines with tiered boughs."""
    cv = Canvas(PW, PH)
    cols = {'lit': hexc('#5d8f74'), 'shade': hexc('#4a7b66'), 'dark': hexc('#3f6d5b'), 'hi': hexc('#6c9c7c')}
    ground = lambda x: 190 + 7 * wnoise(x, PW, 61, ((1, 1), (3, 0.7), (7, 0.4)))
    trees = []
    x = 3
    n = 0
    while x < PW:
        h = 18 + int(hsh(n, 1, 8) * 22)
        if hsh(n, 3, 8) < 0.15:
            h += 12
        trees.append((x, h, int(h * 0.5)))
        x += 7 + int(hsh(n, 2, 8) * 9)
        n += 1
    # back row first, slightly darker and lower, to fill gaps
    back = [(tx + 5, int(th * 0.7), int(tw * 0.8)) for (tx, th, tw) in trees]
    bcols = {'lit': hexc('#4f8068'), 'shade': hexc('#42715d'), 'dark': hexc('#3a6554'), 'hi': hexc('#588a70')}
    _fill_below(cv, lambda x: ground(x) - 6, lambda x, y, t: hexc('#42715d'))
    _forest(cv, lambda x: ground(x) - 3, back, bcols, 500, tier_shadow=False)
    _forest(cv, ground, trees, cols, 400)
    return cv


def _blob(cv, cx, cy, rx, ry, cols, seed):
    """A rounded canopy clump, lit from the upper left, bumpy rim."""
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            ang = math.atan2(dy, dx)
            bump = 0.08 * math.sin(ang * 7 + seed) + 0.05 * math.sin(ang * 13 + seed * 2)
            d = math.hypot(dx, dy)
            if d > 1 + bump:
                continue
            l = -(dx * 0.6 + dy * 0.8)          # light from the upper left
            if d > 0.86 + bump and l < -0.1:
                c = cols['deep']
            elif l > 0.55:
                c = cols['hi']
            elif l > 0.15:
                c = cols['lit']
            elif l > -0.35:
                c = cols['body']
            else:
                c = cols['shade']
            if l > 0.15 and dither(x, y, 0.25) and l < 0.3:
                c = cols['body']
            wput(cv, x, y, c)


def layer1():
    """Closest tree line: round broadleaf crowns and a few pines over a dark wooded hill."""
    cv = Canvas(PW, PH)
    cols = {'hi': hexc('#5a8a52'), 'lit': hexc('#447646'), 'body': hexc('#33633f'),
            'shade': hexc('#2a5338'), 'deep': hexc('#22452f')}
    pcols = {'lit': hexc('#3f7046'), 'shade': hexc('#2c573a'), 'dark': hexc('#244a32'), 'hi': hexc('#4e8050')}
    ground = lambda x: 196 + 8 * wnoise(x, PW, 71, ((1, 1), (2, 0.8), (5, 0.4)))
    floor = hexc('#1d3a2b')
    under = hexc('#244834')
    _fill_below(cv, lambda x: ground(x) - 10,
                lambda x, y, t: under if y < t + 14 else (floor if y < t + 60 else hexc('#1b3528')))
    # a darker, taller back row so the line is dense and uneven
    bcols = {'hi': hexc('#4f8050'), 'lit': hexc('#3f7046'), 'body': hexc('#30603e'),
             'shade': hexc('#285236'), 'deep': hexc('#224730')}
    n = 0
    x = 0
    while x < PW:
        r = 7 + int(hsh(n, 1, 19) * 7)
        gy = ground(x)
        _blob(cv, x, gy - r * 1.5 - 8 - hsh(n, 4, 19) * 7, r * 1.25, r, bcols, n + 40)
        x += int(r * (1.0 + hsh(n, 3, 19) * 0.8))
        n += 1
    n = 0
    x = 0
    crowns = []
    while x < PW:
        r = 7 + int(hsh(n, 1, 9) * 9)
        kind = 'pine' if hsh(n, 2, 9) < 0.22 else 'oak'
        crowns.append((x, r, kind, n))
        x += int(r * (1.1 + hsh(n, 3, 9) * 0.6))
        n += 1
    # trunks first (seen under the crowns)
    trunk, trunk_l = hexc('#2a3326'), hexc('#3a4430')
    for (tx, r, kind, n) in crowns:
        if kind != 'oak':
            continue
        gy = int(ground(tx))
        for y in range(gy - r - 4, gy + 2):
            wput(cv, tx, y, trunk_l)
            wput(cv, tx + 1, y, trunk)
    for (tx, r, kind, n) in crowns:
        gy = ground(tx)
        if kind == 'pine':
            h = int(r * 3.2)
            _forest(cv, lambda _x, gy=gy: int(gy) + 2, [(tx, h, int(h * 0.48))], pcols, 700 + n)
        else:
            cy = gy - r * 1.4 - 2 - hsh(n, 5, 9) * 8
            _blob(cv, tx, cy, r * 1.25, r, cols, n)
            # a second, smaller lobe for a lumpy crown
            _blob(cv, tx + r * 0.6, cy + r * 0.35, r * 0.8, r * 0.7, cols, n + 3)
    # the wooded slope below: darker trunks and lit tufts so it isn't a flat slab
    for i in range(160):
        bx = int(hsh(i, 1, 11) * PW)
        gy = int(ground(bx))
        by = gy + 6 + int(hsh(i, 2, 11) * 44)
        ln = 3 + int(hsh(i, 3, 11) * 6)
        for k in range(ln):
            wput(cv, bx, by - k, hexc('#17301f'))
        if hsh(i, 4, 11) < 0.6:
            for dx in (-1, 0, 1):
                wput(cv, bx + dx, by - ln, hexc('#2a4c34'))
            wput(cv, bx - 1, by - ln - 1, hexc('#355c3c'))
    for x in range(PW):
        gy = int(ground(x))
        for y in range(gy + 2, PH):
            if y > gy + 40 and dither(x, y, 0.06 + min(0.3, (y - gy - 40) / 200.0)):
                wput(cv, x, y, hexc('#182f22'))
    # bushes along the foot
    for i in range(70):
        bx = int(hsh(i, 1, 10) * PW)
        gy = ground(bx)
        _blob(cv, bx, gy - 3, 6 + hsh(i, 2, 10) * 6, 5 + hsh(i, 3, 10) * 3,
              {'hi': hexc('#4f7f46'), 'lit': hexc('#3d6e40'), 'body': hexc('#2f5c39'),
               'shade': hexc('#264c32'), 'deep': hexc('#1f402c')}, i)
    return cv


# =====================================================================================
# 4. CLOUDS, BALLOON, WATER
# =====================================================================================

CLOUD = [hexc('#9aa6c6'), hexc('#bcc7de'), hexc('#dde5f1'), hexc('#f3f6fb'), hexc('#fffcf4')]


def _cloud(w, h, puffs, flat=None):
    """Puffs (cx, cy, r) as spheres in one height field: each pixel takes the frontmost sphere
    surface, lit from the upper left and the front. Where lobes meet a soft crease forms. The
    bottom is cut flat and the underside sits in cool shade."""
    cv = Canvas(w, h)
    base = h - 1
    L = (-0.5, -0.72, 0.48)
    ln = math.sqrt(sum(v * v for v in L))
    L = tuple(v / ln for v in L)
    flat = flat or (min(p[0] - p[2] * 0.8 for p in puffs), max(p[0] + p[2] * 0.8 for p in puffs))
    hit = {}
    for y in range(h):
        for x in range(w):
            best = None
            for i, (cx, cy, r) in enumerate(puffs):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                q = r * r - dx * dx - dy * dy
                if q <= 0:
                    continue
                z = math.sqrt(q) + (cy - r) * -0.15     # higher puffs sit a touch forward
                if best is None or z > best[0]:
                    best = (z, i, dx / r, dy / r, math.sqrt(q) / r)
            if best is None and flat[0] <= x <= flat[1] and y >= base - 4:
                best = (0, -1, 0, 0.6, 0.8)
            if best:
                hit[(x, y)] = best
    # fill pin-holes inside the mass (between lobes near the base)
    for _ in range(2):
        for y in range(h):
            for x in range(1, w - 1):
                if (x, y) in hit:
                    continue
                if (x - 1, y) in hit and any((x + k, y) in hit for k in range(1, 14)) and                         any((x, y - k) in hit for k in range(1, 8)):
                    hit[(x, y)] = (0, -1, 0.2, 0.7, 0.5)
    ys = [y for (_, y) in hit]
    xs = [x for (x, _) in hit]
    gx0, gx1, gy0 = min(xs), max(xs), min(ys)
    for (x, y), (z, i, nx, ny, nz) in hit.items():
        l = nx * L[0] + ny * L[1] + nz * L[2]
        # whole-cloud light: the upper left of the mass is brighter than the lower right
        gx = (x - gx0) / max(1, gx1 - gx0) - 0.5
        gy = (y - gy0) / max(1, base - gy0) - 0.5
        l = l * 0.75 - (gx * 0.35 + gy * 0.55) * 0.5 + 0.06
        if l > 0.78:
            k = 4
        elif l > 0.5:
            k = 3
        elif l > 0.18:
            k = 2
        else:
            k = 1
        # soft transitions
        if k == 4 and l < 0.82 and dither(x, y, 0.5):
            k = 3
        if k == 3 and l < 0.55 and dither(x, y, 0.4):
            k = 2
        # crease where a different lobe takes over
        for ddx, ddy in ((1, 0), (0, 1)):
            o = hit.get((x - ddx, y - ddy))
            if o and o[1] != i and o[0] > z + 1.5:
                k = min(k, 2)
        # underside: the lower rows sink into shade
        if y >= base - 2:
            k = min(k, 2 if y < base - 1 else 1)
        cv.p[x, y] = CLOUD[k]
    for x in range(w):
        if cv.p[x, base][3]:
            cv.p[x, base] = CLOUD[0] if dither(x, base, 0.5) else CLOUD[1]
    return cv


def clouds():
    out = {}
    out['cloud3'] = _cloud(55, 16, [(10, 12, 6), (21, 8, 8), (33, 8, 7.5), (44, 11, 6.5), (27, 14, 6)])
    out['cloud4'] = _cloud(73, 29, [(11, 22, 9), (24, 15, 12), (40, 12, 11), (54, 18, 10), (64, 23, 8),
                                    (34, 24, 9)])
    out['cloud5'] = _cloud(110, 35, [(12, 27, 9), (26, 20, 12), (43, 14, 13.5), (61, 16, 14), (78, 22, 12),
                                     (95, 26, 10), (52, 28, 10), (34, 28, 9)])
    puffs = [(18, 88, 15), (38, 78, 19), (62, 70, 21), (88, 72, 21), (114, 78, 19), (138, 86, 16),
             (152, 92, 11), (48, 54, 18), (72, 44, 21), (98, 50, 18), (62, 24, 16), (84, 21, 14),
             (74, 32, 17), (120, 62, 15), (28, 94, 11), (102, 90, 14), (70, 90, 14), (40, 92, 12)]
    out['cloud6'] = _cloud(165, 101, puffs)
    return out


def balloon():
    """A far-away hot air balloon (20x35): striped envelope, ropes, wicker basket. Hazy."""
    cv = Canvas(20, 35)
    red = [hexc('#7c3a3e'), hexc('#a4504a'), hexc('#c46c58'), hexc('#d88e72')]
    cream = [hexc('#a0948e'), hexc('#c4b8a4'), hexc('#ddd2ba'), hexc('#efe6d0')]
    cx, cy, rx, ry = 9.5, 10.0, 8.6, 9.8
    for y in range(0, 24):
        for x in range(20):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if dy > 0:
                # taper into the neck
                dx = dx / max(0.25, 1 - dy * 0.55)
            if dx * dx + dy * dy > 1:
                continue
            stripe = int(((x + 0.5 - cx) / max(1.5, rx * math.sqrt(max(0.05, 1 - min(1, dy * dy)))) + 1) * 2.5) % 2
            rr = red if stripe == 0 else cream
            l = -(dx * 0.7 + dy * 0.6)
            i = 3 if l > 0.55 else 2 if l > -0.05 else 1 if l > -0.6 else 0
            cv.p[x, y] = rr[i]
    # outline in the envelope's own deep tone
    cv.outline(hexc('#5a3036'))
    # ropes and basket
    rope = hexc('#6e6260')
    for y in range(24, 29):
        put(cv, 7 + (y - 24) // 4, y, rope)
        put(cv, 12 - (y - 24) // 4, y, rope)
    wood = R['wood']
    for y in range(29, 34):
        for x in range(7, 13):
            c = wood[3] if x < 9 else wood[2]
            if y == 29:
                c = wood[4] if x < 11 else wood[3]
            if y == 33 or x == 12:
                c = wood[1]
            put(cv, x, y, c)
    put(cv, 9, 31, wood[1])
    put(cv, 10, 31, wood[1])
    return cv


def water_sheet():
    """160x192: three 160x64 frames of creek water. Only the top ~27 rows show in game; the
    sheet tiles every 160px and the frames loop."""
    cv = Canvas(160, 192)
    surf_hi = (226, 248, 252, 240)
    surf = (150, 210, 232, 215)
    for f in range(3):
        ph = f * math.tau / 3
        oy = f * 64
        for x in range(160):
            # surface undulation: one long wave and one short one, both periodic in 160
            wv = math.sin(math.tau * x / 40 + ph) + 0.6 * math.sin(math.tau * x / 32 - ph * 1)
            top = 0
            for y in range(64):
                d = y - top
                if d == 0:
                    c = surf_hi if wv < 0.3 else (surf if wv > 0.9 else (surf_hi if x % 2 else surf))
                elif d == 1:
                    c = surf
                elif d < 4:
                    c = (92, 160, 200, 190)
                elif d < 12:
                    c = (52, 116, 170, 165)
                elif d < 22:
                    c = (40, 96, 150, 172)
                else:
                    c = (30, 72, 120, 182)
                cv.p[x, oy + y] = c
        # glints and ripple dashes drifting along, periodic so frames and tiles both loop
        for row, per, ln, spd, col in ((3, 32, 5, 1, (190, 232, 245, 200)), (6, 40, 7, -1, (140, 200, 228, 170)),
                                       (10, 32, 4, 1, (120, 182, 220, 150)), (15, 40, 6, -1, (110, 170, 210, 130)),
                                       (21, 80, 9, 1, (100, 160, 200, 120))):
            for k in range(160 // per):
                start = int(k * per + hsh(row, 5) * (per - ln) + spd * f * per / 3.0) % 160
                for i in range(ln):
                    x = (start + i) % 160
                    if i in (0, ln - 1) and dither(x, row, 0.5):
                        continue
                    cv.p[x, oy + row] = col
    return cv


# =====================================================================================
# 5. HOUSES (224x224; the game shows x 20..203, ground line at row 200)
# =====================================================================================

PLASTER = R['cloth_linen']
WOOD = R['wood']
GROUND = 200


def _fill(cv, x0, y0, x1, y1, fn):
    """fn(x, y) -> colour for every pixel of the inclusive rect."""
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            c = fn(x, y)
            if c is not None:
                put(cv, x, y, c)


def _plaster(cv, x0, y0, x1, y1, tint=None):
    P = PLASTER
    base, lt, sh = P[3], P[4], P[2]
    if tint:
        base, lt, sh = mix(base, tint, 0.18), mix(lt, tint, 0.12), mix(sh, tint, 0.2)

    def f(x, y):
        h = hsh(x, y, 17)
        if h < 0.05:
            return sh
        if h > 0.96:
            return lt
        # faint stains low on the wall
        if y > y1 - 4 and dither(x, y, 0.35):
            return sh
        return base
    _fill(cv, x0, y0, x1, y1, f)


def _beam(cv, x0, y0, x1, y1, vertical=False, ramp=None):
    W = ramp or WOOD

    def f(x, y):
        if vertical:
            if x == x0:
                return W[3]
            if x == x1:
                return W[0]
            g = hsh(x, y // 6, 23)
            return W[1] if g < 0.3 else W[2]
        if y == y0:
            return W[3]
        if y == y1:
            return W[0]
        g = hsh(x // 7, y, 23)
        return W[1] if g < 0.3 else W[2]
    _fill(cv, x0, y0, x1, y1, f)


def _brace(cv, xa, ya, xb, yb, w=3):
    """A diagonal timber brace (lit top edge, dark lower edge)."""
    W = WOOD
    tmp = Canvas(cv.w, cv.h)
    tmp.thick(xa, ya, xb, yb, w, W[2])
    for y in range(min(ya, yb) - 3, max(ya, yb) + 4):
        for x in range(min(xa, xb) - 3, max(xa, xb) + 4):
            if not tmp.on(x, y):
                continue
            c = W[2]
            if not tmp.on(x, y - 1):
                c = W[3]
            elif not tmp.on(x, y + 1):
                c = W[0]
            put(cv, x, y, c)


def _stone_wall(cv, x0, y0, x1, y1, seed, ramp=None):
    """Fieldstone courses: rounded stones, lit top-left, in dark mortar."""
    S = ramp or R['stone_warm']
    mortar = S[0]
    _fill(cv, x0, y0, x1, y1, lambda x, y: mortar)
    y = y0
    row = 0
    while y <= y1:
        hgt = 5 + int(hsh(seed, row, 1) * 3)
        x = x0 - int(hsh(seed, row, 2) * 8)
        k = 0
        while x <= x1:
            wdt = 7 + int(hsh(seed, row, k, 3) * 9)
            tone = hsh(seed, row, k, 4)
            body = S[2] if tone < 0.6 else (S[3] if tone < 0.8 else mix(S[1], S[2], 0.5))
            for yy in range(y, min(y + hgt - 1, y1 + 1)):
                for xx in range(x, x + wdt - 1):
                    if not (x0 <= xx <= x1):
                        continue
                    corner = (xx in (x, x + wdt - 2)) and (yy in (y, y + hgt - 2))
                    if corner:
                        continue
                    c = body
                    if yy == y or xx == x:
                        c = S[4] if body == S[3] else S[3]
                    if yy == y + hgt - 2 or xx == x + wdt - 2:
                        c = S[1]
                    put(cv, xx, yy, c)
            x += wdt
            k += 1
        y += hgt
        row += 1


def _window(cv, x0, y0, w, h, glow=False, shutters=True, box=None, arch=False):
    """A casement window: deep frame, four panes, sill; shutters and a flower box optional."""
    W = WOOD
    x1, y1 = x0 + w - 1, y0 + h - 1
    # frame
    _fill(cv, x0 - 1, y0 - 1, x1 + 1, y1 + 1, lambda x, y: W[0])
    _fill(cv, x0, y0, x1, y1, lambda x, y: W[2])
    gx0, gy0, gx1, gy1 = x0 + 2, y0 + 2, x1 - 2, y1 - 2
    mx, my = (gx0 + gx1) // 2, (gy0 + gy1) // 2 + (1 if glow else 0)
    for y in range(gy0, gy1 + 1):
        for x in range(gx0, gx1 + 1):
            if glow:
                # warm lamplight, brightest low in the middle
                d = abs(x - (gx0 + gx1) / 2) / max(1, (gx1 - gx0) / 2) + abs(y - gy1) / max(1, gy1 - gy0) * 0.6
                c = hexc('#fff0b0') if d < 0.5 else hexc('#ffd070') if d < 0.95 else hexc('#f0a040')
                if y == gy0:
                    c = hexc('#c8702a')
            else:
                # dark glass with the sky in it: a lighter band across the upper left
                c = hexc('#2c3a5a')
                if (x - gx0) + (y - gy0) < (gx1 - gx0) * 0.6 and (x - gx0) + (y - gy0) > (gx1 - gx0) * 0.25:
                    c = hexc('#4a6488')
                if y == gy0 or x == gx0:
                    c = hexc('#1e2840')
                # curtains hint
                if y < gy0 + 4 and (x <= gx0 + 1 or x >= gx1 - 1):
                    c = hexc('#8a4a4a')
            put(cv, x, y, c)
    # mullions
    for y in range(gy0, gy1 + 1):
        put(cv, mx, y, W[1] if not glow else W[0])
    for x in range(gx0, gx1 + 1):
        put(cv, x, my, W[1] if not glow else W[0])
    # glints
    if not glow:
        put(cv, gx0 + 1, gy0 + 1, hexc('#a8c4e0'))
        put(cv, mx + 1, gy0 + 1, hexc('#7f9cc0'))
    # frame light / shade
    for x in range(x0, x1 + 1):
        put(cv, x, y0, W[3])
    for y in range(y0, y1 + 1):
        put(cv, x0, y, W[3])
    # sill
    _fill(cv, x0 - 3, y1 + 2, x1 + 3, y1 + 3, lambda x, y: W[3] if y == y1 + 2 else W[1])
    put(cv, x0 - 3, y1 + 3, W[0])
    put(cv, x1 + 3, y1 + 3, W[0])
    if shutters:
        sw = max(5, w // 3)
        for sx0 in (x0 - sw - 2, x1 + 3):
            sh_r = box and box.get('shutter') or R['cloth_green']
            _fill(cv, sx0, y0 - 1, sx0 + sw - 1, y1 + 1,
                  lambda x, y, sx0=sx0: sh_r[0] if (x in (sx0, sx0 + sw - 1) or y in (y0 - 1, y1 + 1))
                  else (sh_r[3] if x == sx0 + 1 else (sh_r[1] if (y - y0) % 5 == 4 else sh_r[2])))
    if box:
        bx0, bx1, by = x0 - 2, x1 + 2, y1 + 4
        # flowers first (they stand in the box)
        for x in range(bx0 + 1, bx1):
            hgt = 2 + int(hsh(x, by, 5) * 3)
            for y in range(by - hgt, by):
                put(cv, x, y, R['leaf'][2] if hsh(x, y, 6) < 0.6 else R['leaf'][3])
        flw = box.get('flowers', [hexc('#e8505a'), hexc('#ffd0d8'), hexc('#f0a030')])
        for i, x in enumerate(range(bx0 + 1, bx1, 3)):
            yy = by - 3 - int(hsh(x, 9) * 3)
            c = flw[i % len(flw)]
            put(cv, x, yy, c)
            put(cv, x + 1, yy, c)
            put(cv, x, yy - 1, mix(c, hexc('#ffffff'), 0.4))
        _fill(cv, bx0, by, bx1, by + 4, lambda x, y: WOOD[0] if y == by + 4 or x in (bx0, bx1)
              else (WOOD[3] if y == by else WOOD[2]))


def _door(cv, x0, y0, w, h, ramp=None):
    """Plank door with an arched head, strap hinges, a ring handle and a stone step."""
    W = ramp or R['wood']
    I = R['iron']
    x1, y1 = x0 + w - 1, y0 + h - 1
    cx = (x0 + x1) / 2.0
    r = w / 2.0
    # stone surround
    for y in range(y0 - 3, y1 + 1):
        for x in range(x0 - 3, x1 + 4):
            dy = y - (y0 + r)
            inside_arch = dy >= 0 or (x + 0.5 - cx) ** 2 + dy ** 2 <= (r + 3) ** 2
            if not inside_arch:
                continue
            S = R['stone_warm']
            c = S[3] if x < cx else S[2]
            if (y + (x // 4)) % 6 == 0:
                c = S[1]
            put(cv, x, y, c)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            dy = y - (y0 + r)
            if dy < 0 and (x + 0.5 - cx) ** 2 + dy ** 2 > r ** 2:
                continue
            u = x - x0
            c = W[2]
            if u % 5 == 0:
                c = W[0]                 # plank seams
            elif u % 5 == 1:
                c = W[3]
            if dy < 0 and (x + 0.5 - cx) ** 2 + dy ** 2 > (r - 1) ** 2:
                c = W[0]
            put(cv, x, y, c)
    # recess shadow along the top-left inside
    for y in range(int(y0 + r), y1 + 1):
        put(cv, x0, y, W[0])
    # hinges and handle
    for hy in (y0 + int(r) + 3, y1 - 7):
        for x in range(x0, x0 + w - 5):
            put(cv, x, hy, I[1])
        put(cv, x0 + 1, hy, I[2])
    put(cv, x1 - 3, y0 + h // 2 + 2, I[3])
    put(cv, x1 - 3, y0 + h // 2 + 3, I[1])
    put(cv, x1 - 4, y0 + h // 2 + 4, I[1])
    put(cv, x1 - 2, y0 + h // 2 + 4, I[1])
    put(cv, x1 - 3, y0 + h // 2 + 5, I[1])


def _step(cv, x0, x1, y0):
    """A worn stone doorstep from row y0 down to the ground line."""
    S = R['stone_warm']
    for y in range(y0, GROUND + 3):
        for x in range(x0 - (y - y0), x1 + 1 + (y - y0)):
            c = S[2]
            if y == y0:
                c = S[4]
            elif y == y0 + 1:
                c = S[3]
            if x in (x0 - (y - y0), x1 + (y - y0)):
                c = S[1]
            put(cv, x, y, c)


def _slate_roof(cv, inside, y0, y1, seed):
    """Fill pixels where inside(x, y) with rows of slate, each slate lit on its top edge."""
    S = R['slate']
    blue = [mix(c, hexc('#4a6aa0'), 0.25) for c in S]
    for y in range(y0, y1 + 1):
        row = (y - y0) // 5
        v = (y - y0) % 5
        off = (row * 4 + int(hsh(seed, row) * 3)) % 9
        for x in range(cv.w):
            if not inside(x, y):
                continue
            u = (x + off) % 9
            k = hsh(seed, row, (x + off) // 9)
            c = blue[2] if k < 0.55 else (blue[3] if k < 0.8 else mix(blue[1], blue[2], 0.5))
            if v == 0:
                c = blue[3] if k < 0.8 else blue[4]
            if v == 4:
                c = blue[0]
            elif u == 0:
                c = blue[1]
            put(cv, x, y, c)


def _clay_roof(cv, inside, y0, y1, seed, axis=None):
    """Rows of rounded clay tiles (each course scalloped along its lower edge)."""
    B = R['brick']
    tiles = [B[0], B[1], mix(B[1], B[2], 0.5), B[2], mix(B[2], B[3], 0.6), B[3]]
    for y in range(y0, y1 + 1):
        row = (y - y0) // 6
        v = (y - y0) % 6
        off = 3 if row % 2 else 0
        for x in range(cv.w):
            if not inside(x, y):
                continue
            u = (x + off) % 6
            k = hsh(seed, row, (x + off) // 6)
            ci = 3 if k < 0.5 else (4 if k < 0.75 else 2)
            # each tile is a little barrel: lit left, shaded right
            if u == 0:
                ci = 1
            elif u == 1:
                ci = min(5, ci + 1)
            elif u == 5:
                ci = max(1, ci - 1)
            if v == 5 and u not in (2, 3):
                ci = 0
            elif v == 5:
                ci = 1
            if v == 0:
                ci = max(1, ci - 1)
            put(cv, x, y, tiles[ci])


def house_a():
    """Two storeys, timber frame on plaster, a fieldstone plinth and a steep slate-blue hip roof
    with a small front gable. Maren's house (the laundry hangs to its right)."""
    cv = Canvas(224, 224)
    W = WOOD
    L, Rr = 46, 178           # wall span
    # --- roof (hip): eave at row 98, ridge at row 34
    ey, ry = 98, 30
    ex0, ex1 = 28, 196
    rx0, rx1 = 78, 146

    def roof_in(x, y):
        if y < ry or y > ey:
            return False
        t = (y - ry) / (ey - ry)
        return rx0 - (rx0 - ex0) * t <= x <= rx1 + (ex1 - rx1) * t

    # walls first (roof overhangs them)
    _stone_wall(cv, L - 4, 191, Rr + 4, 223, 3)
    # stone plinth cap
    _fill(cv, L - 5, 188, Rr + 5, 190, lambda x, y: R['stone_warm'][4] if y == 188 else R['stone_warm'][2] if y == 189 else R['stone_warm'][0])
    _plaster(cv, L, 140, Rr, 187)
    _plaster(cv, L - 4, 102, Rr + 4, 133)
    # ground floor frame
    _beam(cv, L, 140, Rr, 143)
    _beam(cv, L, 184, Rr, 187)
    for px in (L, L + 46, 132, Rr - 3):
        _beam(cv, px, 140, px + 3, 187, vertical=True)
    _brace(cv, L + 4, 184, L + 22, 145)
    _brace(cv, Rr - 4, 184, Rr - 22, 145)
    # jetty: the upper floor sticks out over a row of joists
    _beam(cv, L - 6, 134, Rr + 6, 139)
    for jx in range(L - 2, Rr + 3, 9):
        _fill(cv, jx, 138, jx + 3, 140, lambda x, y: W[3] if x == jx else W[1] if x < jx + 3 else W[0])
    # upper floor frame
    for px in (L - 4, L + 34, 92, 129, Rr - 34, Rr + 1):
        _beam(cv, px, 102, px + 3, 133, vertical=True)
    _beam(cv, L - 4, 102, Rr + 4, 104)
    _beam(cv, L - 4, 118, L + 34, 120)
    _beam(cv, Rr - 34, 118, Rr + 4, 120)
    _brace(cv, L + 1, 117, L + 33, 106)
    _brace(cv, Rr - 1, 117, Rr - 33, 106)
    _brace(cv, L + 1, 121, L + 33, 132)
    _brace(cv, Rr - 1, 121, Rr - 33, 132)
    # windows
    box = {'flowers': [hexc('#e8505a'), hexc('#fff0f0'), hexc('#f0b030')], 'shutter': R['cloth_blue']}
    _window(cv, 60, 150, 20, 22, box=box)
    _window(cv, 150, 150, 20, 22, box=box)
    _window(cv, 100, 107, 22, 20, shutters=False)
    _door(cv, 103, 153, 22, 44)
    _step(cv, 98, 130, 196)
    # --- the roof
    _slate_roof(cv, roof_in, ry, ey, 11)
    # front gable rising from the eave: plaster face, framed, an attic window
    gx0, gx1, gy_top, gy_bot = 84, 140, 44, 99
    gcx = (gx0 + gx1) / 2.0

    def gable_in(x, y, grow=0):
        if y > gy_bot + grow or y < gy_top - grow:
            return False
        hw = (gx1 - gx0) / 2.0 * (y - gy_top) / (gy_bot - gy_top) + grow
        return abs(x + 0.5 - gcx) <= hw + 0.5
    # its roof: a thick slate verge
    _slate_roof(cv, lambda x, y: gable_in(x, y, 7) and not gable_in(x, y), gy_top - 7, gy_bot + 3, 12)
    for y in range(gy_top, gy_bot + 1):
        for x in range(gx0, gx1 + 1):
            if gable_in(x, y):
                put(cv, x, y, PLASTER[3] if hsh(x, y, 4) > 0.06 else PLASTER[2])
    _beam(cv, int(gcx) - 1, gy_top + 4, int(gcx) + 2, gy_bot, vertical=True)
    _window(cv, int(gcx) - 9, 66, 18, 18, shutters=False)
    # verge boards along the gable edges
    for y in range(gy_top - 7, gy_bot + 4):
        for x in range(gx0 - 10, gx1 + 11):
            if gable_in(x, y, 7) and not gable_in(x, y, 6):
                put(cv, x, y, W[0])
            elif gable_in(x, y, 1) and not gable_in(x, y):
                put(cv, x, y, W[1])
    # eave board and its shadow on the wall
    _fill(cv, ex0, ey + 1, ex1, ey + 3, lambda x, y: W[3] if y == ey + 1 else W[1] if y == ey + 2 else W[0])
    for x in range(L - 4, Rr + 5):
        for y in range(ey + 4, ey + 8):
            c = cv.get(x, y)
            if c[3] and (y < ey + 6 or dither(x, y, 0.5)):
                put(cv, x, y, shade(c, 0.72))
    # ridge cap and roof outline
    _fill(cv, rx0, ry - 2, rx1, ry, lambda x, y: R['slate'][3] if y == ry - 2 else R['slate'][1])
    _hip_outline(cv, roof_in, R['slate'][0])
    # under the jetty: a shadow band on the ground floor
    for x in range(L, Rr + 1):
        for y in range(144, 148):
            c = cv.get(x, y)
            if c[3] and (y < 146 or dither(x, y, 0.5)):
                put(cv, x, y, shade(c, 0.8))
    # side shading: the right end of the house turns away from the light
    _side_shade(cv, Rr - 1, Rr + 6, 100, 185)
    _ivy(cv, L + 1, 199, 104, 5)
    _wall_outline(cv)
    return cv


def _ivy(cv, x0, y0, y1, seed):
    """Ivy climbing a wall corner: a wandering stem with clumps of small lit leaves."""
    G = R['leaf']
    x = x0
    pts = []
    for y in range(y0, y1, -1):
        if hsh(seed, y, 1) < 0.3:
            x += -1 if hsh(seed, y, 2) < 0.5 else 1
            x = max(x0 - 4, min(x0 + 5, x))
        put(cv, x, y, G[0])
        pts.append((x, y))
    for i, (x, y) in enumerate(pts):
        t = i / len(pts)
        if i % 2 == 0 and hsh(seed, i, 3) < 0.95 - t * 0.6:
            side = -1 if hsh(seed, i, 4) < 0.5 else 1
            lx = x + side * (1 + int(hsh(seed, i, 5) * (7 - t * 4)))
            for dx, dy, k in ((0, 0, 2), (1, 0, 2), (0, -1, 3), (1, -1, 2), (1, 1, 1), (0, 1, 1),
                              (-1, 0, 3), (2, 0, 1)):
                put(cv, lx + dx, y + dy, G[k])
            put(cv, lx - 1, y - 1, G[4])


def _hip_outline(cv, inside, c):
    for y in range(cv.h):
        for x in range(cv.w):
            if inside(x, y) and (not inside(x - 1, y) or not inside(x + 1, y) or not inside(x, y - 1)):
                put(cv, x, y, c)


def _side_shade(cv, x0, x1, y0, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            c = cv.get(x, y)
            if c[3]:
                put(cv, x, y, shade(c, 0.82))


def _wall_outline(cv):
    """Selective outline: darken the outermost pixel of the silhouette toward its own colour."""
    m = cv.mask()
    for y in range(cv.h):
        for x in range(cv.w):
            if not m[y][x]:
                continue
            edge = any(not (0 <= x + dx < cv.w and 0 <= y + dy < cv.h) or not m[y + dy][x + dx]
                       for dx, dy in ((1, 0), (-1, 0), (0, -1)))
            if edge:
                c = cv.p[x, y]
                cv.p[x, y] = rgb(shade(mix(c, hexc('#1c1420'), 0.45), 0.8))


def house_b():
    """Two storeys under a steep front gable of red-brown clay tiles: half-timbering inside the
    gable, one window glowing with lamplight, and a brick chimney."""
    cv = Canvas(224, 224)
    W = WOOD
    L, Rr = 44, 180
    _stone_wall(cv, L - 4, 191, Rr + 4, 223, 7)
    _fill(cv, L - 5, 188, Rr + 5, 190, lambda x, y: R['stone_warm'][4] if y == 188 else R['stone_warm'][2] if y == 189 else R['stone_warm'][0])
    ochre = hexc('#e0b070')
    _plaster(cv, L, 138, Rr, 187, tint=ochre)
    # ground floor timbers: a bold X in each side panel
    _beam(cv, L, 138, Rr, 141)
    _beam(cv, L, 184, Rr, 187)
    for px in (L, L + 42, Rr - 45, Rr - 3):
        _beam(cv, px, 138, px + 3, 187, vertical=True)
    for (a, b) in ((L + 4, L + 41), (Rr - 44, Rr - 4)):
        _brace(cv, a, 142, b, 183)
        _brace(cv, b, 142, a, 183)
    # door in the middle bay, window beside it
    _door(cv, 96, 152, 22, 45, ramp=R['cloth_green'])
    _window(cv, 126, 152, 16, 22, shutters=False,
            box={'flowers': [hexc('#ffe070'), hexc('#ff8a50'), hexc('#ffffff')]})
    _step(cv, 91, 123, 197)
    # lantern bracket by the door
    I = R['iron']
    _fill(cv, 86, 158, 90, 158, lambda x, y: I[1])
    _fill(cv, 86, 159, 86, 161, lambda x, y: I[1])
    _fill(cv, 84, 162, 88, 168, lambda x, y: I[0])
    _fill(cv, 85, 163, 87, 167, lambda x, y: hexc('#ffd070'))
    put(cv, 86, 164, hexc('#fff4c8'))
    # jetty
    _beam(cv, L - 6, 132, Rr + 6, 137)
    for jx in range(L - 2, Rr + 3, 9):
        _fill(cv, jx, 136, jx + 3, 138, lambda x, y: W[3] if x == jx else W[1] if x < jx + 3 else W[0])
    # --- the gable: roof slabs from the apex down to the eaves
    ax, ay = 112, 8
    ex0, ex1, ey = 22, 202, 140
    slab = 17

    def outer(x, y):
        if y < ay or y > ey:
            return False
        hw = (ex1 - ex0) / 2.0 * (y - ay) / (ey - ay)
        return abs(x + 0.5 - ax) <= hw + 0.5

    def inner(x, y):
        # the gable wall, inset by the slab thickness measured across the slope
        yy = y - slab * 1.15
        if yy < ay or y > ey - 6:
            return False
        hw = (ex1 - ex0) / 2.0 * (yy - ay) / (ey - ay)
        return abs(x + 0.5 - ax) <= hw - 1

    # chimney behind the right slope: drawn first, the roof slab covers its foot
    cx0, cx1, ctop = 138, 150, 16
    for x in range(cx0, cx1 + 1):
        for y in range(ctop, 112):
            course = (y - ctop) // 4
            bh = (y - ctop) % 4 == 3
            col = (x - cx0 + (3 if course % 2 else 0)) % 7 == 6
            c = R['brick'][3] if x < cx0 + 4 else (R['brick'][2] if x < cx1 - 3 else R['brick'][1])
            if x == cx0:
                c = R['brick'][4]
            if bh or col:
                c = mix(R['brick'][0], R['brick'][1], 0.5)
            if x == cx1:
                c = R['brick'][0]
            put(cv, x, y, c)
    _fill(cv, cx0 - 2, ctop - 3, cx1 + 2, ctop, lambda x, y: R['stone_warm'][4] if y == ctop - 3 else R['stone_warm'][2] if y < ctop else R['stone_warm'][0])
    _fill(cv, cx0 + 3, ctop - 5, cx1 - 3, ctop - 4, lambda x, y: R['stone_warm'][1])
    for x in (cx0 - 2, cx1 + 2):
        for y in range(ctop - 3, ctop + 1):
            put(cv, x, y, R['stone_warm'][0])
    # gable wall: plaster with half-timbering
    for y in range(ay, ey + 1):
        for x in range(cv.w):
            if inner(x, y):
                put(cv, x, y, mix(PLASTER[3], ochre, 0.18) if hsh(x, y, 5) > 0.05 else PLASTER[2])

    def clip_beam(x0, y0, x1, y1, vertical=False):
        tmp = Canvas(224, 224)
        _beam(tmp, x0, y0, x1, y1, vertical=vertical)
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if inner(x, y) and tmp.p[x, y][3]:
                    put(cv, x, y, tmp.p[x, y])

    clip_beam(30, 128, 194, 131)
    clip_beam(40, 92, 184, 95)
    clip_beam(70, 60, 154, 62)
    for px in (58, 86, 110, 134, 162):
        clip_beam(px, 40, px + 3, 131, vertical=True)
    # braces in the outer bays (clipped to the wall)
    tmp = Canvas(224, 224)
    _brace(tmp, 62, 127, 85, 97)
    _brace(tmp, 162, 127, 139, 97)
    _brace(tmp, 90, 91, 109, 64)
    _brace(tmp, 134, 91, 115, 64)
    for y in range(224):
        for x in range(224):
            if tmp.p[x, y][3] and inner(x, y):
                cv.p[x, y] = tmp.p[x, y]
    # windows inside the gable: one glowing with lamplight
    _window(cv, 90, 100, 17, 22, glow=True, shutters=False,
            box={'flowers': [hexc('#e8505a'), hexc('#ffd0d8')]})
    _window(cv, 116, 100, 17, 22, shutters=False,
            box={'flowers': [hexc('#c070e0'), hexc('#ffffff')]})
    _window(cv, 104, 66, 15, 16, shutters=False)
    # roof slabs
    _clay_roof(cv, lambda x, y: outer(x, y) and not inner(x, y), ay, ey, 21)
    # barge boards: a dark edge along the inner line, lit edge on the outer line
    for y in range(ay, ey + 1):
        for x in range(cv.w):
            if outer(x, y) and not inner(x, y):
                if inner(x - 1, y) or inner(x + 1, y) or inner(x, y - 1):
                    put(cv, x, y, R['brick'][0])
                elif not outer(x - 1, y) and x < ax:
                    put(cv, x, y, R['brick'][4])
                elif not outer(x + 1, y) and x > ax:
                    put(cv, x, y, R['brick'][1])
    # shadow of the right slab falling on the gable wall
    for y in range(ay, ey):
        for x in range(cv.w):
            if inner(x, y) and not inner(x + 1, y - 2) and x > ax:
                for k in range(3):
                    c = cv.get(x - k, y)
                    if inner(x - k, y) and (k < 2 or dither(x - k, y, 0.5)):
                        put(cv, x - k, y, shade(c, 0.75))
    # eaves: tile ends along the bottom of each slab
    for x in range(cv.w):
        for y in (ey, ey + 1):
            if outer(x, ey) and not inner(x, ey - 1):
                put(cv, x, y, R['brick'][0] if y == ey + 1 or x % 6 == 0 else R['brick'][2])
    _side_shade(cv, Rr - 1, Rr + 6, 132, 185)
    _wall_outline(cv)
    return cv


# =====================================================================================
# 6. TREES (bottom-anchored: trunk base centred on the bottom row)
# =====================================================================================

BARK = [hexc('#22160f'), hexc('#3c2a1e'), hexc('#5a4030'), hexc('#7a5a40'), hexc('#9a7a58')]


def _trunk(cv, xb, yb, ytop, wb, wt, ramp=BARK, lean=0.0, curve=0.0, flare=8, seed=0, marks=None):
    """A tapered trunk from (xb, yb) up to ytop. Lit on the left, bark streaks, root flare."""
    H = yb - ytop
    for y in range(ytop, yb + 1):
        t = (yb - y) / max(1, H)
        cx = xb + lean * (yb - y) + curve * math.sin(t * math.pi)
        hw = (wb + (wt - wb) * t) / 2.0
        k = yb - y
        if k < flare:
            hw += (flare - k) ** 2 * 0.09
        l, r = int(math.floor(cx - hw + 0.5)), int(math.ceil(cx + hw - 0.5))
        for x in range(l, r + 1):
            rel = (x - l) / max(1, r - l)
            if rel < 0.18:
                c = ramp[3]
            elif rel < 0.55:
                c = ramp[2]
            elif rel < 0.85:
                c = ramp[1]
            else:
                c = ramp[0]
            if x == l or x == r:
                c = ramp[0]
            # bark: vertical fissures broken into runs
            elif hsh(x - int(cx), (y + int(hsh(x, seed) * 9)) // 7, seed) < 0.22 and 0.1 < rel < 0.9:
                c = ramp[max(0, ramp.index(c) - 1)] if c in ramp else c
            if marks:
                c = marks(x, y, rel, c) or c
            put(cv, x, y, c)


def _limb(cv, x0, y0, x1, y1, w0, w1, ramp=BARK):
    """A tapered branch: shaded across its width (lit on the upper/left side), bark streaks."""
    L = max(1, int(math.hypot(x1 - x0, y1 - y0)))
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    nx, ny = -uy, ux                       # normal; pick the side facing the upper left
    if nx * -0.6 + ny * -0.8 < 0:
        nx, ny = -nx, -ny
    best = {}
    for i in range(L + 1):
        t = i / L
        x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        r = (w0 + (w1 - w0) * t) / 2.0
        for yy in range(int(y - r) - 1, int(y + r) + 2):
            for xx in range(int(x - r) - 1, int(x + r) + 2):
                dx, dy = xx + 0.5 - x, yy + 0.5 - y
                if dx * dx + dy * dy <= r * r + 0.3:
                    side = (dx * nx + dy * ny) / max(0.5, r)       # +1 lit side, -1 shade side
                    along = i
                    if (xx, yy) not in best or abs(side) < abs(best[(xx, yy)][0]):
                        best[(xx, yy)] = (side, along, r)
    for (x, y), (side, along, r) in best.items():
        if side > 0.55:
            c = ramp[3]
        elif side > -0.1:
            c = ramp[2]
        elif side > -0.65:
            c = ramp[1]
        else:
            c = ramp[0]
        if r > 2.5 and hsh(int(side * 3), along // 5, x0, y0) < 0.25 and -0.6 < side < 0.5:
            c = ramp[max(0, ramp.index(c) - 1)]
        put(cv, x, y, c)


def _canopy(w, h, lobes, ramp, seed, spacing=6, rad=(4, 7), holes=(), light=(0.62, 0.78),
            hi=None, glow_top=0.0, droop=0.0, outline=True):
    """Return a Canvas with foliage. lobes: [(cx, cy, rx, ry)]. ramp: dark -> light (5 tones),
    hi: an extra sunlit tone. Clusters are painted bottom-up so every clump's shaded lower rim
    overlaps the lit top of the clump beneath it."""
    cv = Canvas(w, h)
    tones = list(ramp) + ([hi] if hi else [])
    nt = len(tones)

    def inside(x, y):
        for (cx, cy, rx, ry) in lobes:
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                return True
        return False
    bx0 = int(min(l[0] - l[2] for l in lobes)) - 8
    bx1 = int(max(l[0] + l[2] for l in lobes)) + 8
    by0 = int(min(l[1] - l[3] for l in lobes)) - 8
    by1 = int(max(l[1] + l[3] for l in lobes)) + 8
    gw, gh = bx1 - bx0, by1 - by0
    pts = []
    n = 0
    for gy in range(by0, by1, spacing):
        for gx in range(bx0, bx1, spacing):
            jx = gx + (hsh(seed, gx, gy, 1) - 0.5) * spacing * 0.9
            jy = gy + (hsh(seed, gx, gy, 2) - 0.5) * spacing * 0.9
            if inside(jx, jy):
                r = rad[0] + hsh(seed, gx, gy, 3) * (rad[1] - rad[0])
                pts.append((jx, jy, r, n))
                n += 1
    pts.sort(key=lambda p: (-p[1], p[0]))
    lx, ly = light
    for (cx, cy, r, i) in pts:
        ph = hsh(seed, i, 7) * 6.28
        for y in range(int(cy - r) - 1, int(cy + r * (1 + droop)) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                dx, dy = x + 0.5 - cx, y + 0.5 - cy
                if dy > 0:
                    dy /= (1 + droop)
                d = math.hypot(dx, dy)
                ang = math.atan2(dy, dx)
                rr = r * (1 + 0.16 * math.sin(ang * 5 + ph) + 0.08 * math.sin(ang * 9 + ph * 2))
                if d > rr or not (0 <= x < w and 0 <= y < h):
                    continue
                local = -(dx * lx + dy * ly) / rr                 # -1 .. 1
                gx = (x - bx0) / gw - 0.5
                gy = (y - by0) / gh - 0.5
                glob = -(gx * lx + gy * ly) * 2.2                 # about -1 .. 1
                v = 0.5 + 0.28 * local + 0.32 * glob + glow_top * (0.5 - (y - by0) / gh)
                if d > rr - 1.2 and local < -0.2:
                    v -= 0.22                                     # shaded rim of the clump
                k = int(v * (nt - 1) + 0.5)
                k = max(1, min(nt - 1, k))
                cv.p[x, y] = tones[k]
    for hi_, (hx, hy, hr) in enumerate(holes):
        # a gap is a few small overlapping openings, ragged at the edge
        parts = [(hx, hy, hr * 0.75)] + [(hx + (hsh(seed, hi_, k, 1) - 0.5) * hr * 1.8,
                                          hy + (hsh(seed, hi_, k, 2) - 0.5) * hr * 1.0,
                                          hr * (0.35 + hsh(seed, hi_, k, 3) * 0.35)) for k in range(3)]
        for y in range(int(hy - hr * 2) - 1, int(hy + hr * 2) + 2):
            for x in range(int(hx - hr * 2.2) - 1, int(hx + hr * 2.2) + 2):
                if not (0 <= x < w and 0 <= y < h):
                    continue
                for (px_, py_, pr) in parts:
                    if (x + 0.5 - px_) ** 2 + (y + 0.5 - py_) ** 2 <= pr * pr * (0.85 + 0.3 * hsh(x, y, seed)):
                        cv.p[x, y] = CLEAR
                        break
        # the leaves around a gap fall into shade on its upper side
        for y in range(int(hy - hr) - 3, int(hy + hr) + 3):
            for x in range(int(hx - hr * 1.3) - 3, int(hx + hr * 1.3) + 3):
                if cv.on(x, y) and not cv.on(x, y + 1) and y < hy + hr:
                    cv.p[x, y] = tones[1]
    if outline:
        cv.outline(ramp[0])
    return cv


def _overlay(dst, src, below=None):
    """Composite src over dst (opaque pixels)."""
    for y in range(src.h):
        for x in range(src.w):
            c = src.p[x, y]
            if c[3]:
                dst.p[x, y] = c


LEAF = R['leaf']
LEAF_HI = hexc('#a8cc5c')


def tree1():
    """A big round oak: one full crown on a stout trunk with roots gripping the ground."""
    W_, H_ = 256, 208
    cv = Canvas(W_, H_)
    xb, yb = 128, 207
    _trunk(cv, xb, yb, 100, 24, 14, flare=14, curve=-2, seed=3)
    _limb(cv, 124, 128, 84, 78, 10, 4)
    _limb(cv, 134, 120, 176, 70, 10, 4)
    _limb(cv, 128, 110, 122, 50, 9, 4)
    _limb(cv, 100, 98, 70, 96, 5, 2)
    _limb(cv, 160, 92, 196, 92, 5, 2)
    lobes = [(128, 74, 92, 62), (70, 96, 50, 40), (188, 92, 52, 42), (128, 40, 66, 36),
             (92, 52, 44, 34), (166, 54, 44, 34), (128, 112, 70, 30)]
    crown = _canopy(W_, H_, lobes, LEAF, 101, spacing=9, rad=(7, 12), hi=LEAF_HI,
                    holes=[(100, 110, 5), (158, 104, 5), (126, 126, 4)])
    _overlay(cv, crown)
    _roots(cv, xb, yb, 24)
    return cv


def _roots(cv, xb, yb, wb):
    """A couple of roots running out along the ground line."""
    for side in (-1, 1):
        for k in range(2):
            x0 = xb + side * (wb // 2 - 2 - k * 3)
            ln = 10 - k * 4
            for i in range(ln):
                x = x0 + side * i
                y = yb - max(0, (ln - i) // 4)
                c = BARK[1] if side > 0 else BARK[2]
                put(cv, x, y, c)
                put(cv, x, y - 1, BARK[0] if side > 0 or i > ln - 3 else BARK[3])


def tree2():
    """A wide-spreading oak: three heavy lobes on a forked trunk, darker, cooler leaves."""
    W_, H_ = 256, 208
    cv = Canvas(W_, H_)
    xb, yb = 128, 207
    ramp = [hexc('#0e2216'), hexc('#1a3a22'), hexc('#2a5a2c'), hexc('#3e7a36'), hexc('#5c9a44')]
    _trunk(cv, xb, yb, 150, 26, 22, flare=16, curve=3, seed=8)
    _limb(cv, 120, 156, 70, 96, 15, 6)
    _limb(cv, 138, 154, 190, 92, 15, 6)
    _limb(cv, 128, 150, 132, 66, 12, 5)
    _limb(cv, 82, 112, 46, 104, 6, 2)
    _limb(cv, 180, 106, 218, 100, 6, 2)
    lobes = [(64, 84, 54, 36), (192, 80, 54, 36), (130, 50, 62, 44), (128, 90, 52, 24),
             (32, 96, 26, 18), (226, 94, 24, 18), (96, 38, 40, 28), (164, 34, 40, 28)]
    crown = _canopy(W_, H_, lobes, ramp, 202, spacing=9, rad=(7, 12), hi=hexc('#7eb452'),
                    holes=[(92, 100, 5), (170, 96, 6), (60, 108, 3), (206, 104, 3)])
    _overlay(cv, crown)
    _roots(cv, xb, yb, 26)
    return cv


def _curtain(cv, x0, x1, xb, crown_bottom, G, seed, back=False, gap=0.3, open_w=0):
    """A willow curtain: 2px strands side by side, each lit on its left edge, with ragged tips
    and the odd missing strand so the light shows through."""
    for x in range(x0, x1 + 1):
        cb = crown_bottom(x)
        if cb is None:
            continue
        g = x // 2
        top = int(cb) - 22
        far = abs(x - xb) / float(max(xb - x0, x1 - xb))
        span = (70 + 60 * (1 - far) ** 0.6) * (0.78 + 0.22 * hsh(seed, g, 1))
        if back:
            span *= 0.9
        end = int(top + span)
        miss = hsh(seed, g, 2) < gap
        miss_from = int(top + 26 + span * 0.7 * hsh(seed, g, 3))
        lit_side = x < xb + 6
        base = (3 if hsh(seed, g, 4) < 0.6 else 2) if lit_side else (2 if hsh(seed, g, 4) < 0.5 else 1)
        if back:
            base = max(1, base - 1)
        for y in range(top, end + 1):
            if miss and y >= miss_from:
                break
            if open_w and abs(x - xb) < open_w and y > cb + 4 + abs(x - xb) * 1.6:
                break
            k = base
            if x % 2 == 0 and not back:
                k = min(4, k + (1 if lit_side else 0))
            elif x % 2 == 1:
                k = max(1, k - 1)
            t = (y - top) / max(1, end - top)
            if t > 0.85:
                k = max(1, k - 1)
                if x % 2 == 1:
                    continue                 # tips thin to a single pixel
            if hsh(seed, x, y // 3) < 0.08:
                k = max(1, k - 1)
            put(cv, x, y, G[k])
        # leaf ticks along the strand edge
        for y in range(top + 20, end, 5):
            if open_w and abs(x - xb) < open_w + 2:
                break
            if hsh(seed, g, y, 6) < 0.35:
                put(cv, x + (-1 if x % 2 == 0 else 1), y, G[min(4, base + (1 if lit_side else 0))])


def weeping_willow():
    """224x192: a dome crown whose leaves pour down in a long curtain nearly to the ground."""
    W_, H_ = 224, 192
    cv = Canvas(W_, H_)
    xb, yb = 112, 191
    G = [hexc('#18301a'), hexc('#2a5226'), hexc('#3e7432'), hexc('#5c9a3e'), hexc('#86c05a')]
    lobes = [(112, 50, 84, 36), (56, 66, 40, 26), (168, 64, 40, 26), (112, 28, 56, 22)]

    def crown_bottom(x):
        best = None
        for (cx, cy, rx, ry) in lobes:
            if abs(x - cx) < rx:
                yb_ = cy + ry * math.sqrt(1 - ((x - cx) / rx) ** 2)
                best = yb_ if best is None else max(best, yb_)
        return best
    _curtain(cv, 22, 202, xb, crown_bottom, [G[0], G[1], G[1], G[2], G[2]], 14, back=True, gap=0.2)
    _trunk(cv, xb, yb, 70, 20, 12, flare=12, curve=-4, seed=12)
    _limb(cv, 108, 96, 70, 56, 8, 3)
    _limb(cv, 116, 90, 150, 50, 8, 3)
    _limb(cv, 112, 80, 108, 36, 7, 3)
    front = Canvas(W_, H_)
    _curtain(front, 24, 200, xb, crown_bottom, G, 15, gap=0.42, open_w=16)
    crown = _canopy(W_, H_, lobes, G, 303, spacing=7, rad=(5, 9), hi=hexc('#b0dc72'), outline=False,
                    droop=0.5)
    _overlay(cv, front)
    _overlay(cv, crown)
    # a few cascades pouring over the crown's lower half so it flows into the curtain
    over = Canvas(W_, H_)
    for i in range(16):
        sx = 40 + int(hsh(i, 1, 16) * 144)
        if abs(sx - xb) < 14:
            continue
        cb = crown_bottom(sx)
        if cb is None:
            continue
        y0 = int(cb) - 16 - int(hsh(i, 4, 16) * 12)
        for x in (sx, sx + 1):
            for y in range(y0, int(cb) + 4):
                lit = x < xb
                put(over, x, y, G[(3 if lit else 2) if x == sx else (2 if lit else 1)])
    _overlay(cv, over)
    cv.outline(G[0])
    return cv


BIRCH_BARK = [hexc('#3a3434'), hexc('#8a8280'), hexc('#c8c2b8'), hexc('#ece6da'), hexc('#fbf8f0')]


def _birch_marks(seed):
    def f(x, y, rel, c):
        # horizontal dark lenticels, darker toward the root, and a few knots
        if hsh(y, seed, 1) < 0.16 and rel < 0.95 and hsh(x, y, seed) < 0.75:
            return hexc('#2a2424') if rel > 0.3 else hexc('#5a5250')
        if hsh(y // 3, seed, 2) < 0.07 and 0.25 < rel < 0.75:
            return hexc('#1e1a1a')
        if y > 100 and hsh(x, y, 4) < (y - 100) / 14.0:
            return hexc('#3a3434')
        return None
    return f


BIRCH_LEAF = [hexc('#1c3a1c'), hexc('#2e5e26'), hexc('#4a8a30'), hexc('#72b040'), hexc('#a4d460')]


def birch(variant):
    """80x112: a slim white-barked birch with an airy crown of small leaf clumps."""
    W_, H_ = 80, 112
    cv = Canvas(W_, H_)
    xb, yb = 40, 111
    if variant == 1:
        _trunk(cv, xb, yb, 12, 7, 3, ramp=BIRCH_BARK, flare=4, curve=3, seed=21, marks=_birch_marks(1))
        limbs = [(41, 72, 20, 54), (42, 60, 62, 42), (41, 46, 24, 28), (41, 36, 58, 20), (42, 26, 34, 10)]
        lobes = [(20, 52, 12, 9), (60, 40, 13, 9), (24, 28, 12, 9), (56, 20, 12, 9), (38, 12, 12, 8),
                 (42, 38, 10, 9), (32, 44, 8, 7), (50, 54, 8, 6)]
        holes = [(36, 52, 2), (46, 28, 2)]
    else:
        # two stems from one root, the second leaning out to the right
        _trunk(cv, xb - 3, yb, 14, 6, 3, ramp=BIRCH_BARK, flare=4, lean=0.05, curve=-2, seed=22,
               marks=_birch_marks(2))
        _trunk(cv, xb + 2, yb - 8, 30, 5, 2, ramp=BIRCH_BARK, flare=0, lean=-0.2, seed=23,
               marks=_birch_marks(3))
        limbs = [(36, 70, 18, 56), (55, 52, 68, 40), (34, 40, 20, 26), (36, 30, 50, 16), (58, 40, 52, 28)]
        lobes = [(18, 54, 11, 8), (66, 38, 11, 9), (22, 26, 12, 9), (48, 14, 12, 8), (34, 14, 10, 8),
                 (56, 28, 10, 8), (36, 34, 9, 8), (62, 52, 8, 6)]
        holes = [(30, 44, 2), (52, 40, 2)]
    for (x0, y0, x1, y1) in limbs:
        _limb(cv, x0, y0, x1, y1, 2.5, 1, ramp=BIRCH_BARK)
    crown = _canopy(W_, H_, lobes, BIRCH_LEAF, 400 + variant, spacing=5, rad=(3, 5), hi=hexc('#d4ec88'),
                    holes=holes, droop=0.3)
    _overlay(cv, crown)
    return cv


def flowering_tree():
    W_, H_ = 96, 112
    cv = Canvas(W_, H_)
    xb, yb = 48, 111
    B = R['blossom']
    _trunk(cv, xb, yb, 52, 9, 5, flare=6, curve=-3, seed=31)
    _limb(cv, 46, 70, 26, 52, 5, 2)
    _limb(cv, 50, 66, 70, 50, 5, 2)
    _limb(cv, 48, 60, 50, 36, 4, 2)
    lobes = [(48, 40, 36, 26), (24, 54, 18, 14), (72, 52, 18, 14), (48, 22, 24, 16), (48, 62, 24, 10)]
    crown = _canopy(W_, H_, lobes, B, 501, spacing=5, rad=(3, 6), hi=hexc('#fff4f8'),
                    holes=[(36, 64, 3), (60, 62, 3), (48, 70, 2)])
    # a little fresh green peeking out under the blossom clumps
    for y in range(1, H_):
        for x in range(W_):
            if crown.p[x, y] == B[1] and crown.p[x, y - 1] not in (B[1], CLEAR) and hsh(x // 3, y // 2, 9) < 0.3:
                crown.p[x, y] = rgb(R['leaf'][2])
    _overlay(cv, crown)
    # petals drifting down
    for i in range(14):
        px_ = 14 + int(hsh(i, 1, 33) * 68)
        py_ = 74 + int(hsh(i, 2, 33) * 34)
        if not cv.on(px_, py_):
            put(cv, px_, py_, B[3] if i % 3 else B[4])
    return cv


def _conifer(W_, H_, xb, yb, height, width, tiers, seed, trunk_h=14):
    """A layered pine: overlapping tiers of drooping boughs (bottom tier drawn first), each lit on
    its upper left, shaded under its hem, with needle teeth and branch striations."""
    P = [hexc('#0b1c18'), hexc('#143028'), hexc('#1e4636'), hexc('#2c6044'), hexc('#427a52'), hexc('#5e9662')]
    cv = Canvas(W_, H_)
    _trunk(cv, xb, yb, yb - trunk_h - 24, 9, 6, flare=5, seed=seed)
    top = yb - height
    span = (yb - trunk_h) - top
    ends = [top + int(span * ((t + 1) / tiers) ** 1.08) for t in range(tiers)]
    fol = Canvas(W_, H_)
    for t in range(tiers - 1, -1, -1):
        ye = ends[t]
        prev = ends[t - 1] if t else top
        ys = top if t == 0 else max(top, int(ye - (ye - prev) * 2.0))
        f = (t + 1) / tiers
        hw_l = width / 2.0 * (0.2 + 0.8 * f ** 0.9) * (0.92 + 0.14 * hsh(seed, t, 1))
        hw_r = width / 2.0 * (0.2 + 0.8 * f ** 0.9) * (0.92 + 0.14 * hsh(seed, t, 2))
        for y in range(ys, ye + 3):
            ry = (y - ys) / max(1, ye - ys)
            for x in range(int(xb - hw_l) - 2, int(xb + hw_r) + 3):
                hw = hw_l if x < xb else hw_r
                hwy = max(0.8, hw * min(1.0, ry) ** 0.8)
                dx = (x + 0.5 - xb) / hwy
                if abs(dx) > 1:
                    continue
                hem = ye - 6 * (1 - abs(dx)) ** 1.4
                tooth = 2 if ((x + t) % 3 == 0) else (1 if (x + t) % 3 == 1 else 0)
                if y > hem + tooth:
                    continue
                v = 0.62 - 0.32 * dx - 0.3 * (ry - 0.35)
                if y > hem - 2:
                    v -= 0.32
                st = (y - ys) - abs(x + 0.5 - xb) * 0.55 + hsh(seed, t, x // 3) * 2
                if int(st) % 6 == 0:
                    v -= 0.12
                elif int(st) % 6 == 1 and dx < 0.2:
                    v += 0.1
                if dx < -0.8 and ry < 0.8:
                    v += 0.15
                k = max(1, min(5, int(v * 5.5)))
                if 0 <= x < W_ and 0 <= y < H_:
                    fol.p[x, y] = P[k]
    fol.outline(P[0])
    _overlay(cv, fol)
    return cv


def large_pine():
    return _conifer(128, 176, 64, 175, 168, 116, 7, 61, trunk_h=12)


def pine_trees():
    cv = Canvas(672, 192)
    one = _conifer(96, 192, 48, 191, 186, 84, 8, 71, trunk_h=16)
    _overlay(cv, one)
    return cv


# =====================================================================================
# build
# =====================================================================================

def build():
    """Paint every world asset into assets/; returns the keys written."""
    jobs = [
        ('world/floor_tiles1', terrain_town),
        ('world/floor_tiles2', terrain_cave),
        ('world/planks', planks),
        ('world/spikes', spikes),
        ('world/bg_normal/layer5', sky),
        ('world/bg_normal/background_castle', castle_layer),
        ('world/bg_normal/layer4', layer4),
        ('world/bg_normal/layer3', layer3),
        ('world/bg_normal/layer2', layer2),
        ('world/bg_normal/layer1', layer1),
        ('world/hot_air_balloon', balloon),
        ('world/anim/water_tiles_sheet', water_sheet),
        ('world/house_a', house_a),
        ('world/house_b', house_b),
        ('world/tree1', tree1),
        ('world/tree2', tree2),
        ('world/weeping_willow1', weeping_willow),
        ('world/birch1', lambda: birch(1)),
        ('world/birch2', lambda: birch(2)),
        ('world/flowering_tree', flowering_tree),
        ('world/large_pine_tree', large_pine),
        ('world/pine_trees', pine_trees),
    ]
    keys = []
    for key, fn in jobs:
        fn().save(key)
        keys.append(key)
    for name, cv in clouds().items():
        cv.save('world/' + name)
        keys.append('world/' + name)
    return keys


if __name__ == '__main__':
    build()
