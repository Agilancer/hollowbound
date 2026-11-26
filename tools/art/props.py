"""Hollowbound props: village dressing, graves, camp gear, fires, the portal, chests and ores.

Every image here is drawn from scratch with the shared kit (tools/art/kit.py). Run
`python tools/art/props.py` to repaint:
  world/decor, world/garden_decorations, world/alchemy_decor, world/angel_statue,
  world/small_tent, world/wheat, world/tall_grass, world/forge_sawmill,
  world/anim/campfire_sheet, world/anim/campfire_with_food_sheet, world/torch,
  world/anim/portal_sheet, world/chest, world/ores
Props are bottom-anchored: the last row of every rect is the row that touches the ground.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
import math

TAU = math.pi * 2
R = RAMPS
WD, WP, IR, ST, SW = R['wood'], R['wood_pale'], R['iron'], R['stone'], R['stone_warm']
GR, LF, LD, LA = R['grass'], R['leaf'], R['leaf_dark'], R['leaf_autumn']
FI, EM, GO = R['fire'], R['ember'], R['gold']
LIN, LEA = R['cloth_linen'], R['leather']

# darkest tone of the ramp a colour belongs to, for selective outlines
_DARK = {}
for _r in RAMPS.values():
    for _c in _r:
        _DARK.setdefault(_c[:3], _r[0])


def sel_dark(c):
    d = _DARK.get(c[:3])
    if d is None:
        return shade(c, 0.5)
    if d[:3] == c[:3]:
        return shade(c, 0.72)
    return d


# ---------------------------------------------------------------------------- helpers
def edges(cv, diag=False):
    """Opaque pixels that touch transparency or the canvas border."""
    m = cv.mask()
    W, H = cv.w, cv.h
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (-1, 1), (1, -1), (-1, -1)] if diag else [])
    out = []
    for y in range(H):
        for x in range(W):
            if not m[y][x]:
                continue
            for dx, dy in nb:
                xx, yy = x + dx, y + dy
                if xx < 0 or yy < 0 or xx >= W or yy >= H or not m[yy][xx]:
                    out.append((x, y))
                    break
    return out


def ink(cv, col=OUTLINE, diag=False, skip=None):
    """Outline drawn on the shape's own edge pixels, so the prop keeps its exact size.
    col may be a colour or a function colour -> colour (selective outline)."""
    for x, y in edges(cv, diag):
        if skip and skip(x, y):
            continue
        cv.p[x, y] = col(cv.p[x, y]) if callable(col) else col


def stamp(cv, x0, y0, rows, pal):
    """Hand-placed pixels: rows of chars, '.' and ' ' are clear, others index pal."""
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in '. ':
                continue
            cv.px(x0 + i, y0 + j, pal[ch])


def cyl(u):
    """Ramp index across a cylinder lit from the left (u = 0 left edge .. 1 right edge)."""
    if u < 0.1:
        return 2
    if u < 0.2:
        return 3
    if u < 0.34:
        return 4
    if u < 0.52:
        return 3
    if u < 0.72:
        return 2
    if u < 0.88:
        return 1
    return 0


def disc(cv, cx, cy, r, c):
    cv.ellipse(cx, cy, r, r, c)


def layer(w, h):
    return Canvas(w, h)


def paste(dst, src, x, y, flip=False):
    dst.blit(src, x, y, flip)


def shaded_blob(w, h, circles, r, light=(-0.7, -0.75), bands=(0.18, 0.45, 0.78), rim=True):
    """Union of circles/ellipses, re-shaded as a lit volume."""
    cv = Canvas(w, h)
    for c in circles:
        if len(c) == 3:
            cv.ellipse(c[0], c[1], c[2], c[2], r[2])
        else:
            cv.ellipse(c[0], c[1], c[2], c[3], r[2])
    volume(cv, r, light=light, bands=bands, rim=rim)
    return cv


def dots(cv, n, seed, region, cols, test=None):
    x0, y0, w, h = region
    for i in range(n):
        x = x0 + int(hsh(seed, i, 1) * w)
        y = y0 + int(hsh(seed, i, 2) * h)
        if cv.on(x, y) and (test is None or test(x, y)):
            cv.px(x, y, cols[int(hsh(seed, i, 3) * len(cols))])


def lerp(a, b, t):
    return a + (b - a) * t


# ---------------------------------------------------------------------------- crates & barrels
def crate_box(w, h, brace='diag', seed=0):
    """A nailed plank crate: lit top face, framed front, recessed planks and a brace."""
    F, P = WP, WD
    cv = Canvas(w, h)
    top = 3
    cv.rect(0, 0, w, top, F[3])
    cv.hline(0, w - 1, top - 1, F[4])
    for x in range(4 + seed % 3, w - 2, 6):
        cv.px(x, 1, F[2])
        cv.px(x, 2, F[3])
    fy = top
    cv.rect(0, fy, w, h - fy, F[2])
    cv.hline(1, w - 2, fy, F[3])
    cv.vline(1, fy, h - 2, F[3])
    cv.vline(w - 2, fy, h - 2, F[1])
    cv.hline(1, w - 2, h - 2, F[1])
    ix0, iy0, ix1, iy1 = 3, fy + 2, w - 4, h - 4
    for y in range(iy0, iy1 + 1):
        for x in range(ix0, ix1 + 1):
            cv.px(x, y, P[2])
    # planks: 3px tall, seam on top of each, grain dashes
    for y in range(iy0, iy1 + 1):
        k = (y - iy0) % 3
        for x in range(ix0, ix1 + 1):
            if k == 0 and y != iy0:
                cv.px(x, y, P[1])
            elif hsh(x // 3, y, seed) < 0.12:
                cv.px(x, y, P[3] if hsh(x, y, seed, 2) < 0.5 else P[1])
    # recess shadow on the top/left, catch-light bottom/right
    cv.hline(ix0, ix1, iy0, P[0])
    cv.vline(ix0, iy0, iy1, P[1])
    cv.hline(ix0 + 1, ix1, iy1, P[3])
    # brace
    pw, ph = ix1 - ix0, iy1 - iy0
    if brace in ('diag', 'x'):
        lines = [(ix0, iy1, ix1, iy0)]
        if brace == 'x':
            lines.append((ix0, iy0, ix1, iy1))
        for (ax, ay, bx, by) in lines:
            for i in range(pw + 1):
                x = ax + (bx - ax) * i // pw
                y = ay + round((by - ay) * i / pw)
                cv.px(x, y - 1, P[1])
                cv.px(x, y, F[3])
                cv.px(x, y + 1, F[2])
                cv.px(x, y + 2, P[0] if y + 2 <= iy1 else F[2])
    # nails
    for (nx, ny) in [(1, fy + 1), (w - 3, fy + 1), (1, h - 3), (w - 3, h - 3)]:
        cv.px(nx, ny, IR[3])
        cv.px(nx + 1, ny + 1, IR[1])
    ink(cv)
    return cv


def p_crate(w, h):
    return crate_box(w, h, 'diag', 1)


def p_crates(w, h):
    cv = Canvas(w, h)
    bottom = crate_box(w, 16, 'diag', 2)
    paste(cv, bottom, 0, h - 16)
    top = crate_box(21, 18, 'x', 5)
    # a rope tie around the top crate
    paste(cv, top, 2, 0)
    cv.px(23, h - 15, WD[1])
    cv.px(24, h - 15, WD[1])
    cv.px(23, h - 14, WD[2])
    # stencil mark on the top crate
    stamp(cv, 9, 8, ['.ab.', 'abba', '.ab.'], {'a': WD[1], 'b': WD[0]})
    return cv


def p_barrel(w, h):
    return barrel_body(w, h, seed=3)


def p_barrels(w, h):
    cv = Canvas(w, h)
    back = barrel_body(15, h - 1, seed=9)
    back.recolor(lambda c, x, y: shade(c, 0.86) if c != OUTLINE else c)
    paste(cv, back, w - 15, 1)
    front = barrel_body(15, h, seed=4)
    paste(cv, front, 0, 0)
    # contact shadow on the back barrel
    for y in range(6, h - 1):
        if cv.get(15, y) not in (OUTLINE, CLEAR):
            cv.px(15, y, shade(cv.get(15, y), 0.7))
    return cv


# ---------------------------------------------------------------------------- wood
# ---------------------------------------------------------------------------- graves
def stone_face(cv, r, light_cols=1):
    """Flat stone face: lit left/top rim, shaded right/bottom rim, faint mottling."""
    m = cv.mask()
    for y in range(cv.h):
        for x in range(cv.w):
            if not m[y][x]:
                continue
            up = y > 0 and m[y - 1][x]
            lf = x > 0 and m[y][x - 1]
            rt = x < cv.w - 1 and m[y][x + 1]
            dn = y < cv.h - 1 and m[y + 1][x]
            c = r[2]
            if not up or not lf:
                c = r[3]
            if not rt or not dn:
                c = r[1]
            if hsh(x, y, 77) < 0.08 and c == r[2]:
                c = r[1] if hsh(x, y, 78) < 0.5 else r[3]
            cv.p[x, y] = c


def engrave(cv, pts, r):
    """Carved line: dark groove with a lit lower lip."""
    for (x, y) in pts:
        cv.px(x, y, r[0])
    for (x, y) in pts:
        if (x, y + 1) not in pts and cv.on(x, y + 1):
            cv.px(x, y + 1, r[3])


def moss(cv, region, seed, dens=0.5, light_only=True):
    x0, y0, w, h = region
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            if not cv.on(x, y):
                continue
            above = cv.on(x, y - 1)
            t = dens * (1.0 if not above else 0.55)
            if hsh(x, y, seed) < t:
                cv.px(x, y, LF[3] if not above else LF[2])


def grass_base(cv, y, x0, x1, seed, hmax=3, r=GR):
    """A few blades of grass along the foot of a prop (drawn over it)."""
    for x in range(x0, x1 + 1):
        hh = 1 + int(hsh(x, seed) * hmax)
        for k in range(hh):
            c = r[3] if k == hh - 1 else r[2]
            if k == 0:
                c = r[1]
            cv.px(x, y - k, c)


def p_tomb1(w, h):
    cv = Canvas(w, h)
    cx = w / 2.0
    top = 1
    rr = (w - 4) / 2.0
    for y in range(top, h - 1):
        for x in range(2, w - 2):
            xc, yc = x + 0.5, y + 0.5
            if yc < top + rr:
                if (xc - cx) ** 2 + (yc - (top + rr)) ** 2 > rr * rr:
                    continue
            cv.px(x, y, ST[2])
    stone_face(cv, ST)
    # bevel: an inner carved border
    for y in range(top + 3, h - 3):
        for x in range(4, w - 4):
            xc, yc = x + 0.5, y + 0.5
            ok = True
            if yc < top + rr:
                ok = (xc - cx) ** 2 + (yc - (top + rr)) ** 2 <= (rr - 2.2) ** 2
            if ok and not ((xc - cx) ** 2 + (yc - (top + rr)) ** 2 <= (rr - 3.2) ** 2 if yc < top + rr else (4 < x < w - 5)):
                cv.px(x, y, ST[1] if x > cx else ST[1])
    # cross engraving
    pts = set()
    for y in range(6, 14):
        pts.add((int(cx), y))
    for x in range(int(cx) - 2, int(cx) + 3):
        pts.add((x, 8))
    engrave(cv, pts, ST)
    # name lines
    engrave(cv, {(x, 16) for x in range(7, w - 7)}, ST)
    engrave(cv, {(x, 18) for x in range(8, w - 8) if x % 3}, ST)
    # crack from the top right
    for (x, y) in [(15, 3), (15, 4), (14, 5), (14, 6), (15, 7)]:
        cv.px(x, y, ST[0])
    moss(cv, (2, 1, 9, 6), 11, 0.55)
    moss(cv, (2, h - 6, w - 4, 5), 12, 0.22)
    ink(cv)
    grass_base(cv, h - 1, 0, w - 1, 5, 3)
    return cv


def p_tomb2(w, h):
    cv = Canvas(w, h)
    S = SW
    # stepped shoulders and a raised round centre
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            xc, yc = x + 0.5, y + 0.5
            inside = False
            if yc >= 8:
                inside = True
            if abs(xc - w / 2.0) <= 5.6 and (xc - w / 2.0) ** 2 + (yc - 6.5) ** 2 <= 5.6 ** 2:
                inside = True
            if 5.5 <= yc and abs(xc - w / 2.0) <= 5.6:
                inside = True
            # rounded shoulders
            if yc < 10 and (xc < 3 or xc > w - 3):
                inside = (xc - (3 if xc < 3 else w - 3)) ** 2 + (yc - 10) ** 2 <= 4 and inside
            if inside:
                cv.px(x, y, S[2])
    stone_face(cv, S)
    # a carved rim inside the centre arch and two hearts for two names
    for a in range(200, 341, 12):
        t = math.radians(a)
        cv.px(round(w / 2.0 - 0.5 + math.cos(t) * 3.6), round(6.6 + math.sin(t) * 3.6), S[1])
    heart = {(0, 0), (1, 0), (3, 0), (4, 0), (0, 1), (1, 1), (2, 1), (3, 1), (4, 1), (1, 2), (2, 2), (3, 2), (2, 3)}
    engrave(cv, {(x + 3, y + 11) for (x, y) in heart}, S)
    engrave(cv, {(x + 12, y + 11) for (x, y) in heart}, S)
    engrave(cv, {(x, 17) for x in range(4, 9)} | {(x, 17) for x in range(12, 17)}, S)
    engrave(cv, {(x, 19) for x in range(5, 16) if x != 10}, S)
    moss(cv, (12, 1, 8, 9), 21, 0.4)
    ink(cv)
    # ivy up the left edge
    for (x, y) in [(1, 21), (1, 20), (2, 19), (1, 18), (2, 17), (1, 16), (2, 15), (3, 14), (2, 13)]:
        cv.px(x, y, LF[2])
    for (x, y) in [(2, 20), (3, 18), (0, 17), (3, 16), (1, 15), (4, 13), (3, 12)]:
        cv.px(x, y, LF[3])
    # a little bunch of flowers at the foot
    stamp(cv, w - 7, h - 5, ['.a.b.', 'acbcb', '.ddd.', '..d..'], {'a': R['blossom'][3], 'b': R['blossom'][2], 'c': R['blossom'][4], 'd': LF[2]})
    grass_base(cv, h - 1, 0, w - 1, 9, 2)
    return cv


def p_tombCross(w, h):
    cv = Canvas(w, h)
    cx = w // 2
    # plinth
    cv.rect(3, h - 6, w - 6, 5, ST[2])
    cv.rect(1, h - 2, w - 2, 1, ST[2])
    cv.rect(2, h - 3, w - 4, 1, ST[2])
    # shaft and arms
    cv.rect(cx - 2, 1, 5, h - 7, ST[2])
    cv.rect(cx - 8, 5, 17, 4, ST[2])
    # ring
    for y in range(0, 15):
        for x in range(w):
            d = math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - 7)
            if 4.4 <= d <= 6.0:
                cv.px(x, y, ST[2])
    stone_face(cv, ST)
    # knotwork dots in the centre and a pick carved into the plinth
    cv.px(cx, 7, ST[0])
    cv.px(cx, 6, ST[1])
    cv.px(cx - 1, 7, ST[1])
    cv.px(cx + 1, 7, ST[3])
    cv.px(cx, 8, ST[3])
    pick = {(cx - 3, h - 5), (cx - 2, h - 5), (cx - 1, h - 5), (cx, h - 5), (cx + 1, h - 5), (cx + 2, h - 5), (cx + 3, h - 5),
            (cx - 4, h - 4), (cx + 4, h - 4), (cx, h - 4)}
    engrave(cv, pick, ST)
    moss(cv, (cx - 8, 4, 8, 2), 31, 0.6)
    moss(cv, (1, h - 4, w - 2, 3), 32, 0.25)
    ink(cv)
    grass_base(cv, h - 1, 0, w - 1, 13, 2)
    return cv




def barrel_body(w, h, r=WD, hoop=IR, seed=0):
    cv = Canvas(w, h)
    cx = w / 2.0
    top = 2
    spans = {}
    for y in range(top, h):
        t = (y - top) / max(1, (h - 1 - top))
        hw = w / 2.0 - 1.1 + math.sin(math.pi * t) * 1.1
        x0, x1 = cx - hw, cx + hw
        spans[y] = (x0, x1)
        for x in range(w):
            xc = x + 0.5
            if x0 <= xc <= x1:
                u = (xc - x0) / (x1 - x0)
                cv.px(x, y, r[cyl(u)])
        for su in (0.27, 0.5, 0.73):
            sx = int(x0 + su * (x1 - x0))
            if cv.on(sx, y):
                cv.px(sx, y, r[max(0, cyl(su) - 2)])
    for k, y in enumerate((4, 5, h - 5, h - 4)):
        x0, x1 = spans[y]
        for x in range(w):
            xc = x + 0.5
            if x0 <= xc <= x1:
                u = (xc - x0) / (x1 - x0)
                i = min(3, max(1, cyl(u) - (0 if k % 2 == 0 else 1)))
                cv.px(x, y, hoop[i])
        sx = int(x0 + 0.26 * (x1 - x0))
        if k % 2 == 0:
            cv.px(sx, y, hoop[4])
    for i in range(8):
        x = int(hsh(seed, i, 7) * w)
        y = 7 + int(hsh(seed, i, 8) * (h - 12))
        if cv.get(x, y) in (r[2], r[3]):
            cv.px(x, y, r[1])
    # the top: stave ends round a recessed lid
    cv.ellipse(cx, 2.0, w / 2.0 - 1.1, 2.2, r[1])
    cv.ellipse(cx, 2.1, w / 2.0 - 2.6, 1.3, WP[2])
    for x in range(int(cx) - 4, int(cx)):
        if cv.get(x, 1) == WP[2]:
            cv.px(x, 1, WP[3])
    cv.px(int(cx) + 1, 2, WP[1])
    cv.px(int(cx) + 2, 2, WP[1])
    ink(cv)
    return cv


def p_basket(w, h):
    cv = Canvas(w, h)
    B = WP
    for (fx, fy, c) in [(5, 6, R['cloth_red']), (8, 5, R['cloth_red']), (11, 6, R['cloth_orange'])]:
        f = Canvas(w, h)
        f.ellipse(fx + 0.5, fy + 0.5, 2.3, 2.1, c[2])
        f.px(fx - 1, fy - 1, c[3])
        f.px(fx, fy - 1, c[4])
        f.px(fx + 1, fy + 1, c[1])
        ink(f)
        paste(cv, f, 0, 0)
    cv.px(8, 2, LF[3])
    cv.px(9, 2, LF[2])
    for y in range(7, h):
        t = (y - 7) / (h - 8)
        x0, x1 = 0.5 + t * 1.5, w - 0.5 - t * 1.5
        for x in range(w):
            if x0 <= x + 0.5 <= x1:
                u = (x + 0.5 - x0) / (x1 - x0)
                base = cyl(u)
                weave = ((x + (y // 2) * 2) // 2) % 2 if 9 <= y <= h - 3 else 1
                cv.px(x, y, B[max(0, min(4, base - 1 + weave))])
    cv.hline(1, w - 2, 7, B[4])
    cv.hline(1, w - 2, 8, B[2])
    cv.hline(2, w - 3, h - 2, B[1])
    ink(cv)
    # handle: one strand of willow, left side lit
    for a in range(0, 181, 2):
        t = math.radians(a)
        x = round(w / 2.0 - 0.5 + math.cos(t) * 6.2)
        y = round(7.2 - math.sin(t) * 6.6)
        if not cv.on(x, y) or cv.get(x, y) == OUTLINE:
            cv.px(x, y, B[3] if a > 100 else B[1])
    return cv


def p_stumpAxe(w, h):
    cv = Canvas(w, h)
    top, bot = 10, h - 1
    for y in range(top, h):
        t = (y - top) / (bot - top)
        flare = max(0, (t - 0.55) / 0.45) ** 2 * 3.2
        x0, x1 = 3 - flare, w - 3 + flare
        for x in range(w):
            xc = x + 0.5
            if x0 <= xc <= x1:
                u = (xc - x0) / (x1 - x0)
                cv.px(x, y, WD[cyl(u)])
    for gx in (5, 9, 13, 16):
        for y in range(top + 3, h - 1):
            x = gx + (-1 if (y > h - 4 and gx < 10) else (1 if y > h - 4 else 0))
            if cv.on(x, y) and hsh(gx, y, 3) < 0.8:
                cv.px(x, y, WD[max(0, cyl(x / w) - 2)])
    cx, cy = w / 2.0, top + 0.3
    cv.ellipse(cx, cy, w / 2.0 - 3.0, 3.0, WD[1])
    cv.ellipse(cx, cy, w / 2.0 - 4.0, 2.2, WP[3])
    cv.ellipse(cx + 0.5, cy + 0.2, 3.5, 1.2, WP[2])
    cv.ellipse(cx + 0.5, cy + 0.2, 2.0, 0.6, WP[3])
    cv.px(int(cx), int(cy), WP[1])
    for x in range(5, 10):
        if cv.get(x, top - 2) == WP[3]:
            cv.px(x, top - 2, WP[4])
    ink(cv)
    ax = Canvas(w, h)
    ax.thick(9.0, 8.0, 18.4, 1.4, 2.9, WP[2])
    for y in range(h):
        for x in range(w):
            if ax.on(x, y) and not ax.on(x - 1, y - 1):
                ax.p[x, y] = WP[3]
    ink(ax)
    hd = Canvas(w, h)
    stamp(hd, 3, 4, [
        '.aaab.',
        'abbbcb',
        'abccc.',
        '.dccc.',
    ], {'a': R['steel'][4], 'b': R['steel'][3], 'c': IR[2], 'd': IR[1]})
    ink(hd)
    paste(ax, hd, 0, 0)
    for x in range(0, 12):
        if ax.get(x, 8) == OUTLINE and not cv.on(x, 9) is False:
            ax.p[x, 8] = CLEAR
    paste(cv, ax, 0, 0)
    cv.hline(4, 8, 8, WD[0])
    return cv


def p_logs(w, h):
    cv = Canvas(w, h)
    rows = [
        (3.9, [14.0, 23.0, 32.0], 3.9),
        (10.0, [9.5, 18.5, 27.5, 36.5], 4.3),
        (h - 5.0, [5.0, 14.0, 23.0, 32.0, 41.5], 4.5),
    ]
    for ry, xs, rr in rows:
        for x0 in xs:
            j = hsh(int(x0 * 10), int(ry), 4)
            x, y, r = x0 + (j - 0.5) * 0.8, ry + (hsh(int(x0), 2) - 0.5) * 0.6, rr + (j - 0.5) * 0.5
            lg = Canvas(w, h)
            lg.ellipse(x, y, r, r, WD[2])
            lg.ellipse(x + 0.3, y + 0.3, r - 1.2, r - 1.2, WP[3])
            for yy in range(h):
                for xx in range(w):
                    if lg.get(xx, yy) == WP[3]:
                        d = math.hypot(xx + 0.5 - x - 0.3, yy + 0.5 - y - 0.3)
                        if abs(d - (r - 1.2) * 0.55) < 0.5:
                            lg.px(xx, yy, WP[2])
                    elif lg.get(xx, yy) == WD[2] and (xx + 0.5 - x) + (yy + 0.5 - y) > 1.5:
                        lg.px(xx, yy, WD[1])
            lg.px(int(x + 0.3), int(y + 0.3), WP[1])
            lg.px(int(x - r + 1.8), int(y - r + 1.8), WP[4])
            if hsh(int(x0), int(ry), 9) < 0.4:   # a split crack
                lg.px(int(x + 1.5), int(y - 1), WP[1])
                lg.px(int(x + 2.5), int(y - 2), WP[1])
            ink(lg)
            paste(cv, lg, 0, 0)
    return cv


def p_tombBroken(w, h):
    """A miner's slab, cracked and leaning hard, a chip off its crown, a pick laid against it."""
    cv = Canvas(w, h)
    S = ST
    SW_, SH_ = 12.0, 17.0

    def inside(x, y):
        if x < 0 or x > SW_ or y < 0 or y > SH_:
            return False
        r = SW_ / 2
        if y < r and (x - r) ** 2 + (y - r) ** 2 > r * r:
            return False
        if x > 7.0 and y < 2.0 + (x - 7.0) * 0.9 + (0.8 if int(x) % 2 else 0):
            return False
        return True

    a = math.radians(22)
    ca, sa = math.cos(a), math.sin(a)
    pvx, pvy = 9.0, h - 0.5
    slab = Canvas(w, h)
    src = {}
    for y in range(h):
        for x in range(w):
            dx, dy = x + 0.5 - pvx, y + 0.5 - pvy
            sx = dx * ca + dy * sa
            sy = -dx * sa + dy * ca
            u, v = sx, SH_ + sy
            if inside(u, v):
                slab.px(x, y, S[2])
                src[(x, y)] = (u, v)
    stone_face(slab, S)
    for (x, y), (u, v) in src.items():
        if u > 6.5 and v < 9 and not inside(u + 1.0, v - 1.0):
            slab.px(x, y, S[4])
        if (abs(v - 7.0) < 0.5 and 2.8 < u < 8.4) or (abs(u - 5.6) < 0.5 and 7.0 < v < 13.0):
            slab.px(x, y, S[4] if (x + y) % 3 else S[3])
        cxk = 8.0 - (v - 5.0) * 0.28 + 0.7 * math.sin(v * 1.6)
        if 5.0 < v < 16.5 and abs(u - cxk) < 0.5:
            slab.px(x, y, S[0])
    ink(slab)
    paste(cv, slab, 0, 0)
    ch = Canvas(w, h)
    ch.poly([(21.0, h - 0.5), (21.5, h - 3.5), (24.0, h - 5.2), (27.6, h - 3.6), (27.6, h - 0.5)], S[2])
    stone_face(ch, S)
    ch.px(23, h - 4, S[4])
    ch.px(22, h - 3, S[4])
    ink(ch)
    paste(cv, ch, 0, 0)
    pk = Canvas(w, h)
    pk.thick(2.0, h - 1.0, 8.5, h - 14.0, 2.8, WD[3])
    for y in range(h):
        for x in range(w):
            if pk.on(x, y) and pk.on(x - 1, y):
                pk.p[x, y] = WD[2]
    ink(pk)
    hd = Canvas(w, h)
    for i, (x, y) in enumerate([(3, 8), (4, 7), (5, 6), (6, 6), (7, 6), (8, 6), (9, 6), (10, 7), (11, 8), (12, 9), (13, 11)]):
        hd.px(x, y, IR[3] if i < 6 else IR[2])
        hd.px(x, y + 1, IR[2] if i < 6 else IR[1])
    hd.px(2, 9, IR[2])
    hd.px(13, 12, IR[1])
    ink(hd)
    paste(pk, hd, 0, -1)
    paste(cv, pk, 0, 0)
    for (x, y, c) in [(18, h - 2, S[3]), (19, h - 2, S[1])]:
        cv.px(x, y, c)
    cv.hline(17, 20, h - 1, OUTLINE)
    cv.px(17, h - 2, OUTLINE)
    cv.px(18, h - 3, OUTLINE)
    cv.px(19, h - 3, OUTLINE)
    cv.px(20, h - 2, OUTLINE)
    return cv


# ---------------------------------------------------------------------------- creek & farm
def p_reeds(w, h):
    cv = Canvas(w, h)
    blades = []
    for i in range(54):
        u = (hsh(i, 1) + hsh(i, 2)) / 2
        bx = 3 + u * (w - 6)
        edge = abs(bx - w / 2) / (w / 2)
        height = 12 + hsh(i, 3) * (h - 14) * (1 - edge * 0.55)
        lean = (bx - w / 2) / (w / 2) * 6 + (hsh(i, 4) - 0.5) * 9
        blades.append((hsh(i, 5), bx, height, lean, i))
    blades.sort()
    cats = [(18.5, 46, -2.0), (27.5, 51, 1.0), (36.0, 43, 3.0), (44.5, 38, 4.5), (23.0, 33, -4.0)]
    for depth, bx, height, lean, i in blades:
        rr = LD if depth < 0.3 else (LF if depth < 0.68 else GR)
        n = int(height)
        for k in range(n):
            t = k / n
            x = bx + lean * t * t
            y = h - 1 - k
            wide = t < 0.5
            if k < 2:
                c0, c1 = rr[0], rr[1]
            elif t > 0.82:
                c0 = c1 = rr[3] if depth > 0.5 else rr[2]
            else:
                c0, c1 = rr[3], rr[2]
            cv.px(int(x), y, c0)
            if wide:
                cv.px(int(x) + 1, y, c1)
    for (bx, ht, lean) in cats:
        n = ht
        hx = None
        for k in range(n):
            t = k / n
            x = bx + lean * t * t
            y = h - 1 - k
            cv.px(int(x), y, LF[1] if k < n * 0.4 else LF[2])
            if abs(t - 0.78) < 0.001 or (hx is None and t > 0.78):
                hx = (int(x), y)
        x, y = hx
        head = Canvas(w, h)
        for j in range(7):
            head.px(x - 1, y - j, WD[3] if j > 0 else WD[2])
            head.px(x, y - j, WD[2])
            head.px(x + 1, y - j, WD[1])
        head.px(x - 1, y - 5, WD[4])
        head.px(x - 1, y - 4, WD[4])
        ink(head, WD[0])
        paste(cv, head, 0, 0)
        cv.vline(x, y - 10, y - 8, LF[2])
    return cv


def pumpkin(w, h, r=None, seed=0, stem=True, leaf=True):
    r = r or R['cloth_orange']
    cv = Canvas(w, h)
    top = 3 if stem else 1
    bh = h - top
    cx, cy = w / 2.0, top + bh / 2.0
    rx, ry = w / 2.0 - 0.3, bh / 2.0
    for y in range(h):
        for x in range(w):
            xc, yc = x + 0.5, y + 0.5
            dip = 1.2 * max(0, 1 - abs(xc - cx) / (rx * 0.5)) if yc < cy else 0
            if ((xc - cx) / rx) ** 2 + ((yc - cy - dip * 0.0) / ry) ** 2 <= 1 and yc > top + dip:
                cv.px(x, y, r[2])
    volume(cv, r, bands=(0.22, 0.5, 0.8))
    # ribs: meridians, dark groove with a lit lobe beside it
    for s in (-0.82, -0.36, 0.36, 0.82):
        for y in range(top, h):
            yc = y + 0.5
            k = 1 - ((yc - cy) / ry) ** 2
            if k <= 0:
                continue
            x = int(cx + s * rx * math.sqrt(k))
            if cv.on(x, y) and cv.on(x, y - 1) and cv.on(x, y + 1):
                c = cv.get(x, y)
                i = r.index(c) if c in r else 2
                cv.px(x, y, r[max(0, i - 1)])
                if s < 0 and cv.on(x + 1, y):
                    j = r.index(cv.get(x + 1, y)) if cv.get(x + 1, y) in r else 2
                    cv.px(x + 1, y, r[min(4, j + 1)])
    ink(cv)
    if stem:
        sx = int(cx)
        stamp(cv, sx - 1, 0, ['.ab', 'ab.', 'cb.', 'cc.'], {'a': LF[3], 'b': LF[2], 'c': LF[1]})
        if leaf:
            stamp(cv, sx + 1, 1, ['.aab', 'abbc', '.cc.'], {'a': LF[4], 'b': LF[3], 'c': LF[1]})
    return cv


def p_pumpkin1(w, h):
    return pumpkin(w, h, seed=1)


def p_pumpkin2(w, h):
    pale = [R['gold'][0], R['cloth_orange'][2], R['gold'][2], R['gold'][3], R['gold'][4]]
    return pumpkin(w, h, pale, seed=2, leaf=False)


def p_pumpkinPile(w, h):
    cv = Canvas(w, h)
    # straw underneath
    for x in range(1, w - 1):
        for k in range(1 + int(hsh(x, 5) * 3)):
            cv.px(x, h - 1 - k, R['thatch'][2 + (k == 0) - (x % 3 == 0)] if k < 2 else R['thatch'][3])
    pale = [R['gold'][0], R['cloth_orange'][2], R['gold'][2], R['gold'][3], R['gold'][4]]
    green = [LD[1], LF[1], LF[2], LF[3], LF[4]]
    pieces = [
        (pumpkin(16, 14, seed=3), 6, 1, 0.84),
        (pumpkin(17, 15, pale, seed=4, leaf=False), 21, 0, 0.84),
        (pumpkin(19, 16, seed=5), 1, h - 17, 1.0),
        (pumpkin(13, 11, green, seed=6, stem=True, leaf=False), 18, h - 12, 1.0),
        (pumpkin(18, 15, seed=7, leaf=True), 29, h - 16, 1.0),
    ]
    for pc, x, y, k in pieces:
        if k != 1.0:
            pc.recolor(lambda c, xx, yy, k=k: c if c == OUTLINE else shade(c, k))
        paste(cv, pc, x, y)
    # a trailing vine
    for (x, y) in [(42, h - 2), (43, h - 3), (44, h - 3), (45, h - 4), (46, h - 4)]:
        cv.px(x, y, LF[2])
    stamp(cv, 44, h - 7, ['.aa', 'abb', 'bb.'], {'a': LF[4], 'b': LF[2]})
    return cv


def p_scarecrow(w, h):
    cv = Canvas(w, h)
    TH = R['thatch']
    BL = R['cloth_blue']
    RD = R['cloth_red']
    SA = R['sand']
    # post and crossbar
    post = Canvas(w, h)
    post.rect(19, 16, 3, h - 16, WD[2])
    post.vline(19, 16, h - 1, WD[3])
    post.vline(21, 16, h - 1, WD[1])
    post.rect(4, 24, 32, 2, WD[2])
    post.hline(4, 35, 24, WD[3])
    ink(post)
    paste(cv, post, 0, 0)
    # straw from the sleeves and the hem
    straw = Canvas(w, h)
    for (x0, y0, dx) in [(7, 25, -1), (32, 25, 1)]:
        for i in range(6):
            yy = y0 - 2 + i
            ln = 2 + int(hsh(x0, i) * 3)
            for k in range(ln):
                straw.px(x0 + dx * k, yy + (k * (i - 2.5) / 6.0), TH[3] if k < ln - 1 else TH[4])
    for i in range(10):
        x = 14 + i
        ln = 2 + int(hsh(i, 7) * 4)
        for k in range(ln):
            straw.px(x + (k if i > 6 else (-k // 2 if i < 3 else 0)) * 0.5, 41 + k, TH[3] if k < ln - 1 else TH[4])
    ink(straw, TH[1])
    paste(cv, straw, 0, 0)
    # shirt
    sh = Canvas(w, h)
    sh.poly([(13, 21), (27, 21), (26, 42), (14, 42)], BL[2])
    sh.poly([(13, 21), (7, 22), (7, 28), (14, 28)], BL[2])
    sh.poly([(27, 21), (33, 22), (33, 28), (26, 28)], BL[2])
    # ragged hem
    for x in range(14, 27):
        if hsh(x, 11) < 0.45:
            sh.px(x, 42, BL[2])
        if hsh(x, 12) < 0.3:
            sh.px(x, 41, CLEAR)
    for y in range(h):
        for x in range(w):
            if not sh.on(x, y):
                continue
            c = BL[2]
            if not sh.on(x, y - 1) or not sh.on(x - 1, y):
                c = BL[3]
            if not sh.on(x + 1, y) or not sh.on(x, y + 1):
                c = BL[1]
            if (x in (17, 23) and 29 < y < 41):
                c = BL[1]
            if (x in (16, 22) and 29 < y < 41):
                c = BL[3]
            if 26 <= y <= 27 and (x < 13 or x > 27):
                c = BL[1]
            sh.p[x, y] = c
    # a red patch with stitches, belt of rope, buttons
    sh.rect(21, 31, 4, 4, RD[2])
    sh.hline(21, 24, 31, RD[3])
    for (x, y) in [(20, 31), (20, 33), (25, 32), (25, 34), (22, 35), (24, 35)]:
        sh.px(x, y, LIN[4])
    sh.hline(14, 26, 37, TH[2])
    sh.hline(14, 26, 38, TH[1])
    sh.px(19, 38, TH[3])
    sh.px(20, 39, TH[2])
    sh.px(20, 40, TH[1])
    for y in (24, 28, 33):
        sh.px(20, y, LIN[4])
    ink(sh)
    paste(cv, sh, 0, 0)
    # head: a burlap sack
    hd = Canvas(w, h)
    hd.ellipse(20.5, 15.5, 6.2, 5.8, SA[2])
    for y in range(h):
        for x in range(w):
            if hd.on(x, y):
                c = SA[2]
                if ((x + y) % 2 == 0) and hsh(x, y, 4) < 0.3:
                    c = SA[1]
                if x + y < 30 and hd.on(x, y) and not hd.on(x - 2, y - 1):
                    c = SA[3]
                if x > 23 and not hd.on(x + 2, y + 1):
                    c = SA[1]
                hd.p[x, y] = c
    # button eyes and a stitched grin
    for (ex, ey) in [(18, 14), (23, 14)]:
        hd.px(ex, ey, OUTLINE)
        hd.px(ex + 1, ey, OUTLINE)
        hd.px(ex, ey - 1, OUTLINE_SOFT)
        hd.px(ex + 1, ey - 1, OUTLINE_SOFT)
        hd.px(ex, ey - 1, LIN[1])
    for x in range(17, 26):
        hd.px(x, 18 if x in (17, 25) else 19, OUTLINE_SOFT)
    for x in (18, 20, 22, 24):
        hd.px(x, 18, OUTLINE_SOFT)
        hd.px(x, 20, OUTLINE_SOFT)
    ink(hd)
    paste(cv, hd, 0, 0)
    # neck tie
    cv.hline(17, 24, 21, TH[1])
    cv.px(24, 22, TH[2])
    cv.px(25, 23, TH[2])
    # straw hat
    ht = Canvas(w, h)
    ht.poly([(15, 5), (17, 2), (24, 2), (26, 5), (26, 9), (15, 9)], TH[2])
    ht.poly([(8, 10), (11, 8), (30, 8), (33, 10), (31, 11), (10, 11)], TH[2])
    for y in range(h):
        for x in range(w):
            if not ht.on(x, y):
                continue
            c = TH[2]
            if not ht.on(x, y - 1) or not ht.on(x - 1, y):
                c = TH[3]
            if not ht.on(x + 1, y) or not ht.on(x, y + 1):
                c = TH[1]
            if (x + 2 * y) % 5 == 0 and c == TH[2]:
                c = TH[1]
            ht.p[x, y] = c
    ht.hline(15, 26, 7, RD[2])
    ht.hline(15, 26, 8, RD[1])
    ht.px(16, 7, RD[3])
    ht.px(17, 7, RD[3])
    # a tear in the brim
    ht.p[29, 9] = CLEAR
    ht.p[29, 10] = CLEAR
    ink(ht)
    paste(cv, ht, 0, 0)
    # a crow on the right arm, looking out
    BK = R['hair_black']
    crow = Canvas(w, h)
    stamp(crow, 31, 15, [
        '..aab..',
        '.abbbc.',
        'abbbbcd',
        'abbbbb.',
        '.abbbb.',
        '..bbbb.',
        '...bb..',
    ], {'a': BK[3], 'b': BK[1], 'c': BK[2], 'd': GO[3]})
    crow.px(34, 16, LIN[4])
    crow.px(32, 22, BK[1])
    crow.px(31, 22, BK[1])
    ink(crow)
    crow.px(37, 17, GO[3])
    crow.px(38, 17, GO[2])
    crow.px(33, 23, GO[2])
    crow.px(35, 23, GO[2])
    paste(cv, crow, 0, 0)
    # tuft of grass at the foot
    grass_base(cv, h - 1, 16, 24, 21, 3)
    return cv


# ---------------------------------------------------------------------------- rocks
def facet_rock(w, h, pts, r=ST, seed=0, mossy=0.0, nseeds=6):
    cv = Canvas(w, h)
    cv.poly(pts, r[2])
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    rx, ry = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    seeds = []
    for i in range(nseeds):
        a = TAU * (i / nseeds) + hsh(seed, i) * 0.8
        k = 0.4 + hsh(seed, i, 2) * 0.45
        seeds.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k))
    seeds.append((cx - rx * 0.15, cy - ry * 0.2))
    lx, ly = -0.68, -0.73
    tone = []
    for (sx, sy) in seeds:
        nx, ny = (sx - cx) / max(1, rx), (sy - cy) / max(1, ry)
        tone.append(nx * lx + ny * ly)
    fid = {}
    for y in range(h):
        for x in range(w):
            if not cv.on(x, y):
                continue
            best, bi = 1e9, 0
            for i, (sx, sy) in enumerate(seeds):
                dd = (x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2
                if dd < best:
                    best, bi = dd, i
            fid[(x, y)] = bi
            d = tone[bi]
            i = 3 if d > 0.3 else (2 if d > -0.3 else 1)
            cv.p[x, y] = r[i]
    for (x, y), i in fid.items():
        for dx, dy in ((-1, 0), (0, -1)):
            j = fid.get((x + dx, y + dy))
            if j is not None and j != i and tone[i] < tone[j] and cv.p[x, y] in r:
                cv.p[x, y] = r[max(0, r.index(cv.p[x, y]) - 1)]
    for (x, y) in edges(cv):
        up = cv.on(x, y - 1)
        lf = cv.on(x - 1, y)
        if not up and (x + 0.5 - cx) < rx * 0.5:
            cv.p[x, y] = r[4]
        elif not lf and (y + 0.5 - cy) < ry * 0.3:
            cv.p[x, y] = r[3]
    for y in range(h):
        for x in range(w):
            if cv.on(x, y) and y > max(ys) - 3 and cv.get(x, y) in r[2:]:
                if hsh(x, y, seed, 8) < 0.5:
                    cv.p[x, y] = r[r.index(cv.get(x, y)) - 1]
    for i in range(int(rx * ry / 7)):
        x = int(cx - rx + hsh(seed, i, 3) * rx * 2)
        y = int(cy - ry + hsh(seed, i, 4) * ry * 2)
        if cv.on(x, y) and cv.on(x + 1, y) and cv.get(x, y) in r[1:]:
            j = r.index(cv.get(x, y))
            cv.px(x, y, r[j - 1])
            if cv.on(x, y + 1) and cv.get(x, y + 1) in r[:4] and j < 4:
                cv.px(x, y + 1, r[min(4, j + 1)])
    if mossy:
        for (x, y) in list(fid.keys()):
            if not cv.on(x, y - 1) and hsh(x, seed, 5) < mossy and (x + 0.5 - cx) < rx * 0.7:
                cv.px(x, y, LF[3])
                if cv.on(x, y + 1) and hsh(x, y, seed) < 0.6:
                    cv.px(x, y + 1, LF[2])
                if cv.on(x, y + 2) and hsh(x, y, seed, 2) < 0.25:
                    cv.px(x, y + 2, LF[1])
    ink(cv, sel_dark)
    return cv


def rock_pts(cx, by, rx, ry, seed, n=7, flat=True):
    pts = []
    for i in range(n):
        a = math.pi + math.pi * i / (n - 1)
        k = 0.8 + hsh(seed, i) * 0.32
        kk = 0.78 + hsh(seed, i, 1) * 0.3
        pts.append((cx + math.cos(a) * rx * k, by + math.sin(a) * ry * 2 * kk))
    pts.append((cx + rx * 0.98, by))
    pts.append((cx - rx * 0.98, by))
    return pts


def p_rocksBig1(w, h):
    cv = Canvas(w, h)
    parts = [
        (60, 40, 19, 13, 11, 0.4),
        (31, 40, 27, 19, 12, 0.5),
        (78, 40, 10, 7, 13, 0.6),
        (9, 40, 9, 6, 14, 0.5),
        (47, 40, 8, 4, 15, 0.3),
    ]
    for (cx, by, rx, ry, seed, ms) in parts:
        pts = rock_pts(cx, by - 0.5, rx, ry, seed)
        rk = facet_rock(w, h, pts, ST, seed, mossy=ms, nseeds=7)
        paste(cv, rk, 0, 0)
    grass_base(cv, h - 1, 0, w - 1, 41, 3)
    return cv


def p_rocksMid1(w, h):
    cv = Canvas(w, h)
    parts = [
        (34, 19, 15, 9, 21, 0.45),
        (14, 19, 13, 8, 22, 0.4),
        (46, 19, 6, 4, 23, 0.3),
        (25, 19, 6, 3, 24, 0.2),
    ]
    for (cx, by, rx, ry, seed, ms) in parts:
        pts = rock_pts(cx, by - 0.5, rx, ry, seed)
        rk = facet_rock(w, h, pts, ST, seed, mossy=ms, nseeds=5)
        paste(cv, rk, 0, 0)
    grass_base(cv, h - 1, 0, w - 1, 43, 2)
    return cv


# ---------------------------------------------------------------------------- the ruined wall
def p_brickWall(w, h):
    B, M = R['brick'], SW
    cv = Canvas(w, h)
    keys = [(-1, 10), (4, 2), (9, 0), (14, 6), (19, 13), (24, 17), (29, 12), (34, 8), (39, 5), (44, 11), (50, 16)]

    def prof(x):
        for (ax, ay), (bx, by) in zip(keys, keys[1:]):
            if ax <= x <= bx:
                return ay + (by - ay) * (x - ax) / (bx - ax)
        return keys[-1][1]
    CH, BLK = 4, 8
    bricks = []
    for ci in range((h + CH - 1) // CH):
        y0 = h - CH * (ci + 1)
        off = 0 if ci % 2 == 0 else 4
        for k in range(-1, w // BLK + 2):
            bx0 = k * BLK - off
            ccx = bx0 + 3
            if ccx < -2 or ccx > w + 1:
                continue
            if y0 + 1 < prof(min(w - 1, max(0, ccx))) - 0.5:
                continue
            bricks.append((bx0, y0, ci, k))
    for (bx0, y0, ci, k) in bricks:
        # mortar bed (top) and joint (right)
        for x in range(bx0 - 1, bx0 + 8):
            cv.px(x, y0, M[3] if hsh(x, y0) < 0.8 else M[2])
        for y in range(y0, y0 + 4):
            cv.px(bx0 + 7, y, M[2])
    for (bx0, y0, ci, k) in bricks:
        hole = hsh(ci, k, 3) < 0.06 and 2 < ci < 10
        v = hsh(ci, k, 1)
        if hole:
            for y in range(y0 + 1, y0 + 4):
                for x in range(bx0, bx0 + 7):
                    cv.px(x, y, B[0] if y > y0 + 1 else M[1])
            continue
        base = 2 if v < 0.62 else (3 if v < 0.86 else 1)
        for y in range(y0 + 1, y0 + 4):
            for x in range(bx0, bx0 + 7):
                j = y - y0 - 1
                i = base
                if j == 0 or x == bx0:
                    i = min(4, base + 1)
                if j == 2 or x == bx0 + 6:
                    i = max(1, base - 1)
                if y > h - 7:
                    i = max(1, i - 1)
                if hsh(x, y, 9) < 0.07:
                    i = max(0, i - 1)
                cv.px(x, y, B[i])
        if v > 0.93:  # a weathered, greyed brick
            for y in range(y0 + 1, y0 + 4):
                for x in range(bx0, bx0 + 7):
                    cv.px(x, y, mix(cv.get(x, y), M[2], 0.5))
    # chip the ruined top: knock corners off the highest bricks
    for x in range(w):
        for y in range(h):
            if cv.on(x, y):
                if hsh(x, 99) < 0.25:
                    cv.p[x, y] = CLEAR
                break
    # ivy hanging over the top-left
    def leaf(x, y, i):
        cv.px(x, y, LF[3] if i % 3 else LF[4])
        cv.px(x + 1, y, LF[2])
        cv.px(x, y + 1, LF[1])
    vine = [(3, 9), (4, 11), (4, 13), (5, 15), (5, 17), (4, 19), (4, 21), (5, 23), (6, 25), (6, 27), (5, 29)]
    vine2 = [(10, 2), (11, 4), (11, 6), (12, 8), (13, 10), (13, 12), (12, 14), (12, 16)]
    for path in (vine, vine2):
        for (a, b) in zip(path, path[1:]):
            cv.line(a[0], a[1], b[0], b[1], LF[1])
        for i, (x, y) in enumerate(path):
            if cv.on(x, y):
                leaf(x + (1 if i % 2 else -1), y, i)
    for x in range(0, 16):
        y = int(prof(x)) + (1 if x % 3 else 0)
        while y < h and not cv.on(x, y):
            y += 1
        if y < h:
            cv.px(x, y, LF[3])
            if hsh(x, 5) < 0.5:
                cv.px(x, y + 1, LF[2])
    ink(cv, sel_dark)
    # rubble and grass at the foot
    rb = Canvas(w, h)
    for (x, y, c) in [(40, h - 2, B[3]), (41, h - 2, B[2]), (42, h - 2, B[2]), (41, h - 3, B[3]), (44, h - 2, B[2]), (45, h - 2, B[1]),
                      (9, h - 2, B[2]), (10, h - 2, B[1])]:
        rb.px(x, y, c)
    ink(rb, sel_dark)
    paste(cv, rb, 0, 0)
    grass_base(cv, h - 1, 0, w - 1, 61, 3)
    return cv


# ---------------------------------------------------------------------------- washing line
def cloth_piece(cv, cols, rp, top_fn, kind, seed):
    """Fill a hanging garment. cols: dict x -> (top, bottom). Folds run vertically."""
    for x, (t, b) in cols.items():
        for y in range(t, b + 1):
            ph = math.sin(x * 1.3 + seed) + 0.5 * math.sin(x * 0.55 + seed * 2)
            i = 2 + (1 if ph > 0.9 else 0) - (1 if ph < -0.8 else 0)
            cv.px(x, y, rp[i])
    xs = sorted(cols)
    for x in xs:
        t, b = cols[x]
        cv.px(x, t, rp[3])
        cv.px(x, b, rp[1])
    cv.vline(xs[0], cols[xs[0]][0], cols[xs[0]][1], rp[3])
    cv.vline(xs[-1], cols[xs[-1]][0], cols[xs[-1]][1], rp[1])


def p_laundry(w, h):
    cv = Canvas(w, h)
    x0, x1 = 3, w - 4
    sag = 6.0

    def rope(x):
        u = (x - x0) / (x1 - x0)
        return 5 + sag * 4 * u * (1 - u)
    # posts
    pst = Canvas(w, h)
    for px_ in (x0 - 1, x1 - 1):
        pst.rect(px_, 2, 3, h - 2, WD[2])
        pst.vline(px_, 2, h - 1, WD[3])
        pst.vline(px_ + 2, 2, h - 1, WD[1])
        pst.rect(px_ - 1, 4, 5, 2, WD[2])
        pst.hline(px_ - 1, px_ + 3, 4, WD[3])
    ink(pst)
    paste(cv, pst, 0, 0)
    # rope
    for x in range(x0 + 2, x1):
        cv.px(x, round(rope(x)), LIN[1])
    pieces = Canvas(w, h)
    BL, RD, GN = R['cloth_blue'], R['cloth_red'], R['cloth_green']

    def hang(xa, xb, length_fn):
        cols = {}
        for x in range(xa, xb + 1):
            t = round(rope(x)) + 1
            cols[x] = (t, t + length_fn(x - xa))
        return cols
    # 1: a linen shirt hung by the shoulders, sleeves hanging at its sides
    sx = 9
    g = Canvas(w, h)
    t0 = round(rope(sx + 8)) + 1
    for x in range(sx + 3, sx + 14):
        t = round(rope(x)) + 1
        for y in range(t, t0 + 15):
            g.px(x, y, LIN[3])
    for (a_, b_) in ((sx, sx + 3), (sx + 14, sx + 17)):
        for x in range(a_, b_):
            t = round(rope(x)) + 2
            for y in range(t, t0 + 10):
                g.px(x, y, LIN[2] if x in (sx + 2, sx + 16) else LIN[3])
    for y in range(t0 + 3, t0 + 10):
        g.px(sx + 3, y, LIN[1])
        g.px(sx + 13, y, LIN[1])
    for x in (sx + 6, sx + 11):
        for y in range(t0 + 4, t0 + 14):
            g.px(x, y, LIN[2])
    for y in range(t0, t0 + 15):
        g.px(sx + 4, y, LIN[4])
    g.hline(sx + 3, sx + 13, t0 + 14, LIN[2])
    for (x, y) in [(sx + 7, t0), (sx + 8, t0 + 1), (sx + 9, t0)]:
        g.px(x, y, LIN[1])
    for y in (t0 + 4, t0 + 7, t0 + 10):
        g.px(sx + 8, y, LIN[1])
    ink(g, sel_dark)
    paste(pieces, g, 0, 0)
    # 2: blue trousers hung by the waist
    tx = 31
    g = Canvas(w, h)
    cols = {}
    for i in range(11):
        x = tx + i
        t = round(rope(x)) + 1
        if 4 <= i <= 6:
            cols[x] = (t, t + 5)
        else:
            cols[x] = (t, t + 18 + (1 if i in (0, 10) else 0))
    cloth_piece(g, cols, BL, None, 'trousers', 2)
    for i in range(11):
        x = tx + i
        g.px(x, round(rope(x)) + 2, BL[1])
    ink(g, sel_dark)
    paste(pieces, g, 0, 0)
    # 3: a big striped sheet
    sx = 46
    g = Canvas(w, h)
    cols = hang(sx, sx + 21, lambda i: 23 + int(1.5 * math.sin(i * 0.9)))
    cloth_piece(g, cols, LIN, None, 'sheet', 3)
    for x in range(sx, sx + 22):
        t, b = cols[x]
        for y in (b - 4, b - 3):
            if t < y < b:
                g.px(x, y, RD[2] if g.get(x, y) != LIN[1] else RD[1])
        if (x - sx) in (4, 5, 16, 17):
            for y in range(t + 1, b - 5):
                g.px(x, y, mix(g.get(x, y), RD[3], 0.45))
    ink(g, sel_dark)
    paste(pieces, g, 0, 0)
    # 4: a green apron
    sx = 72
    g = Canvas(w, h)
    cols = hang(sx, sx + 9, lambda i: 14 + (i % 3 == 0))
    cloth_piece(g, cols, GN, None, 'apron', 4)
    for x in range(sx + 2, sx + 8):
        g.px(x, cols[x][0] + 7, GN[1])
        g.px(x, cols[x][0] + 8, GN[3])
    ink(g, sel_dark)
    paste(pieces, g, 0, 0)
    # 5: a pair of red socks
    for sxx in (86, 91):
        g = Canvas(w, h)
        t = round(rope(sxx)) + 1
        g.rect(sxx, t, 3, 7, RD[2])
        g.rect(sxx - 2, t + 5, 3, 2, RD[2])
        g.vline(sxx, t, t + 6, RD[3])
        g.hline(sxx, sxx + 2, t, RD[4])
        g.hline(sxx, sxx + 2, t + 1, LIN[3])
        ink(g, sel_dark)
        paste(pieces, g, 0, 0)
    paste(cv, pieces, 0, 0)
    # clothespins
    for x in (10, 25, 32, 41, 47, 56, 67, 73, 81, 87, 92):
        y = round(rope(x))
        cv.px(x, y, WP[3])
        cv.px(x, y + 1, WP[2])
        cv.px(x, y - 1, WP[4])
    grass_base(cv, h - 1, 0, 6, 71, 3)
    grass_base(cv, h - 1, w - 7, w - 1, 72, 3)
    return cv


# ---------------------------------------------------------------------------- greenery
def bush(w, h, r, seed, bumps=7, flowers=None, nflow=0):
    """Overlapping leaf clumps, each lit as its own ball; back clumps sit a tone darker."""
    cv = Canvas(w, h)
    clumps = []
    nb = max(2, bumps // 2)
    for i in range(nb):
        t = (i + 0.5) / nb
        arch = math.sin(math.pi * (0.15 + 0.7 * t))
        rad = h * 0.36 * (0.75 + 0.35 * arch) + hsh(seed, i) * 1.5
        x = w * (0.18 + 0.64 * t) + (hsh(seed, i, 2) - 0.5) * 3
        y = h - rad - (h - 2 * rad) * arch * 0.9
        clumps.append((0, x, y, rad, i))
    nf = bumps - nb + 1
    for i in range(nf):
        t = (i + 0.5) / nf
        rad = h * 0.3 * (0.8 + 0.4 * math.sin(math.pi * t)) + hsh(seed, i, 3) * 1.2
        x = rad * 0.8 + t * (w - rad * 1.6) + (hsh(seed, i, 4) - 0.5) * 2
        y = h - rad * 0.85
        clumps.append((1, x, y, rad, i + 10))
    for row, x, y, rad, i in clumps:
        c = Canvas(w, h)
        c.ellipse(x, y, rad * 1.08, rad, r[2])
        rr = r if row else [r[0], r[0], r[1], r[2], r[3]]
        volume(c, rr, bands=(0.2, 0.45, 0.72))
        # leaf scallops on the lit half, shadow ticks on the dark half
        for k in range(int(rad * rad * 0.5)):
            lx = int(x - rad + hsh(seed, i, k, 5) * rad * 2)
            ly = int(y - rad + hsh(seed, i, k, 6) * rad * 2)
            if not (c.on(lx, ly) and c.on(lx + 2, ly) and c.on(lx + 1, ly + 1) and c.on(lx, ly - 1)):
                continue
            col = c.get(lx, ly)
            j = rr.index(col) if col in rr else 2
            if j <= 1:
                continue
            dk = rr[j - 1]
            c.px(lx, ly, dk)
            c.px(lx + 2, ly, dk)
            c.px(lx + 1, ly + 1, dk)
            if j >= 3 and hsh(seed, i, k, 7) < 0.5:
                c.px(lx + 1, ly - 1, rr[min(4, j + 1)])
        ink(c, rr[1] if row else rr[0])
        paste(cv, c, 0, 0)
    ink(cv, lambda c: r[0] if c != r[0] else shade(r[0], 0.75))
    for x in range(w):
        if cv.on(x, h - 2):
            cv.px(x, h - 2, r[1])
    if flowers:
        for i in range(nflow):
            x = int(4 + hsh(seed, i, 21) * (w - 8))
            y = int(2 + hsh(seed, i, 22) * (h - 7))
            if cv.on(x, y) and cv.on(x, y - 1) and cv.on(x + 1, y) and cv.get(x, y) not in (OUTLINE,):
                cv.px(x, y, flowers[0])
                cv.px(x + 1, y, flowers[1])
                cv.px(x, y + 1, flowers[1])
    return cv


YG = [LD[0], LF[1], mix(LF[3], LA[3], 0.5), mix(LF[4], LA[4], 0.6), LA[4]]


def p_bushG(w, h):
    return bush(w, h, LF, 31, 8, (LIN[4], LIN[2]), 5)


def p_bushG2(w, h):
    return bush(w, h, LF, 32, 5)


def p_bushY(w, h):
    return bush(w, h, YG, 33, 8, (LA[3], LA[2]), 6)


def p_fernG(w, h):
    cv = Canvas(w, h)
    bx, by = w / 2.0, h - 1.0
    fronds = [(-13.5, 9.0, 0), (13.5, 9.5, 0), (-12.0, 4.0, 0), (12.0, 4.5, 0), (-8.0, 1.0, 1), (8.5, 1.5, 1),
              (-3.5, 0.0, 1), (4.0, 0.5, 1), (-10.5, 8.0, 1), (11.0, 8.5, 1)]
    for (tx, ty, front) in fronds:
        rr = GR if front else LF
        p0 = (bx + tx * 0.08, by)
        p2 = (bx + tx, ty)
        p1 = (bx + tx * 0.3, ty - 4)
        n = 20
        pts = [bez(p0, p1, p2, i / n) for i in range(n + 1)]
        for i in range(n):
            u = i / n
            x, y = pts[i]
            x2, y2 = pts[i + 1]
            cv.px(int(x), int(y), rr[1] if u < 0.3 else (rr[2] if u < 0.7 else rr[3]))
            if i > 2 and i % 2 == 0 and u < 0.97:
                dx, dy = x2 - x, y2 - y
                L = math.hypot(dx, dy) or 1
                nx, ny = -dy / L, dx / L
                ln = max(1, int(round(4.0 * math.sin(math.pi * min(1, u * 1.2)))))
                for s in (-1, 1):
                    for j in range(1, ln + 1):
                        lx = x + nx * s * j + dx / L * j * 0.6
                        ly = y + ny * s * j + dy / L * j * 0.6
                        up = ly < y
                        cv.px(int(lx), int(ly), rr[3] if up else rr[2])
                        if j == ln and up:
                            cv.px(int(lx), int(ly), rr[4])
    for x in range(int(bx) - 3, int(bx) + 4):
        cv.px(x, h - 1, LF[1])
    return cv


def tuft(w, h, seed, flower=None):
    cv = Canvas(w, h)
    n = max(3, int(w * 0.8))
    for i in range(n):
        x = (i + hsh(seed, i) * 0.8) * (w - 1) / n
        edge = 1 - abs(x - w / 2) / (w / 2)
        ht = 1 + int((h - 1) * (0.35 + 0.65 * edge) * (0.5 + 0.5 * hsh(seed, i, 2)))
        lean = (hsh(seed, i, 3) - 0.5) * 2 + (x - w / 2) / w * 2
        for k in range(ht):
            t = k / max(1, ht)
            xx = int(x + lean * t)
            c = GR[2] if k == 0 else (GR[4] if k == ht - 1 else GR[3])
            if k == ht - 1 and hsh(seed, i, 4) < 0.4:
                c = GR[3]
            cv.px(xx, h - 1 - k, c)
    if flower:
        fx = int(w * 0.6)
        cv.px(fx, h - 1 - (h - 2), flower[0])
        cv.px(fx - 1, h - (h - 2), flower[1])
        cv.px(fx + 1, h - (h - 2), flower[1])
        cv.px(fx, h - (h - 3), flower[1])
        cv.px(fx, h - (h - 2), GO[3])
    return cv


def p_tuft1(w, h):
    return tuft(w, h, 1)


def p_tuft2(w, h):
    return tuft(w, h, 2)


def p_tuft3(w, h):
    return tuft(w, h, 3)


def p_tuft4(w, h):
    return tuft(w, h, 4)


def p_tuft5(w, h):
    return tuft(w, h, 5, flower=(LIN[4], LIN[3]))


# ---------------------------------------------------------------------------- the market
def fruit(cv, x, y, r, rad=2.2, leaf=False):
    f = Canvas(cv.w, cv.h)
    f.ellipse(x + 0.5, y + 0.5, rad, rad * 0.95, r[2])
    f.px(x - 1, y, r[3])
    f.px(x - 1, y - 1, r[4])
    f.px(x, y - 1, r[3])
    f.px(x + 1, y + 1, r[1])
    f.px(x, y + 1, r[1]) if rad > 2.4 else None
    ink(f)
    if leaf:
        f.px(x + 1, y - 2, LF[3])
    paste(cv, f, 0, 0)


def p_fruitTable(w, h):
    cv = Canvas(w, h)
    RD, OR, PU = R['cloth_red'], R['cloth_orange'], R['cloth_purple']
    tb = Canvas(w, h)
    for lx in (3, w - 6):
        tb.rect(lx, 17, 3, h - 17, WD[2])
        tb.vline(lx, 17, h - 1, WD[3])
        tb.vline(lx + 2, 17, h - 1, WD[1])
    tb.rect(2, 25, w - 4, 2, WD[1])
    tb.hline(2, w - 3, 25, WD[2])
    ink(tb)
    paste(cv, tb, 0, 0)
    under = Canvas(w, h)
    under.rect(10, h - 7, 19, 7, WP[2])
    under.hline(10, 28, h - 7, WP[3])
    under.hline(10, 28, h - 4, WP[1])
    under.vline(10, h - 7, h - 1, WP[3])
    ink(under)
    paste(cv, under, 0, 0)
    cab = [LF[1], LF[2], LF[3], LF[4], GR[4]]
    fruit_pile(cv, [(14.0, h - 8.5), (24.0, h - 8.5), (19.0, h - 9.5)], cab, 3.0, stems=False)
    top = Canvas(w, h)
    top.rect(0, 15, w, 3, WD[2])
    top.hline(0, w - 1, 15, WD[4])
    top.hline(0, w - 1, 16, WD[3])
    for x in range(4, w, 9):
        top.px(x, 16, WD[1])
    ink(top)
    paste(cv, top, 0, 0)
    cl = Canvas(w, h)
    for x in range(1, w - 1):
        bot = 21 + (1 if (x % 6) in (2, 3) else 0)
        for y in range(17, bot + 1):
            c = LIN[3]
            if y >= bot - 1:
                c = RD[2] if y == bot - 1 else RD[1]
            if (x % 6) == 5 and y < bot - 1:
                c = LIN[2]
            if (x % 6) == 0 and y < bot - 1:
                c = LIN[4]
            cl.px(x, y, c)
    ink(cl, sel_dark)
    paste(cv, cl, 0, 0)
    # left: a wicker basket heaped with apples
    fruit_pile(cv, [(4.0, 8.5), (8.0, 7.5), (11.5, 8.5), (6.0, 5.0), (10.0, 5.0)], RD, 2.4)
    bk = Canvas(w, h)
    for y in range(9, 15):
        t = (y - 9) / 5
        x0, x1 = 1 + t, 14 - t
        for x in range(w):
            if x0 <= x + 0.5 <= x1:
                u = (x + 0.5 - x0) / (x1 - x0)
                weave = ((x + (y // 2) * 2) // 2) % 2
                bk.px(x, y, WP[max(0, min(4, cyl(u) - 1 + weave))])
    bk.hline(1, 13, 9, WP[4])
    ink(bk)
    paste(cv, bk, 0, 0)
    cv.px(8, 2, LF[3])
    cv.px(9, 2, LF[2])
    # middle: a pyramid of oranges
    fruit_pile(cv, [(17.5, 12.0), (22.5, 12.0), (27.0, 12.5), (20.0, 8.5), (24.5, 8.5), (22.0, 5.0)], OR, 2.4, stems=False)
    cv.px(22, 2, LF[3])
    cv.px(23, 2, LF[2])
    # right: a crate of pears and grapes
    for (x, y) in [(31, 6), (34, 5)]:
        p = Canvas(w, h)
        p.ellipse(x + 0.5, y + 1.5, 2.0, 2.4, LF[3])
        p.ellipse(x + 0.5, y - 0.5, 1.3, 1.5, LF[3])
        p.px(x - 1, y + 1, GR[4])
        p.px(x, y - 1, GR[4])
        p.px(x + 1, y + 3, LF[2])
        p.px(x + 2, y + 2, LF[2])
        ink(p)
        p.px(x, y - 3, WD[1])
        paste(cv, p, 0, 0)
    gr = Canvas(w, h)
    for (x, y) in [(31, 9), (33, 9), (35, 9), (32, 11), (34, 11), (36, 10), (33, 13)]:
        gr.px(x, y, PU[3])
        gr.px(x + 1, y, PU[2])
        gr.px(x, y + 1, PU[2])
        gr.px(x + 1, y + 1, PU[1])
    gr.px(31, 9, PU[4])
    gr.px(35, 9, PU[4])
    ink(gr)
    paste(cv, gr, 0, 0)
    cr = Canvas(w, h)
    cr.rect(29, 11, 10, 4, WP[2])
    cr.hline(29, 38, 11, WP[4])
    cr.vline(29, 11, 14, WP[3])
    cr.px(33, 13, WP[1])
    ink(cr)
    paste(cv, cr, 0, 0)
    return cv


def p_tentPot(w, h):
    cv = Canvas(w, h)
    RD, L = R['cloth_red'], LIN
    cx = w / 2.0
    # back wall of dark boards, in the canopy's shadow
    bk = Canvas(w, h)
    bk.rect(6, 20, w - 12, h - 20, WD[1])
    for x in range(6, w - 6):
        if (x - 6) % 6 == 5:
            bk.vline(x, 20, h - 1, WD[0])
        elif (x - 6) % 6 == 0:
            bk.vline(x, 20, h - 1, WD[2] if hsh(x, 3) < 0.5 else WD[1])
    for y in range(20, 29):
        for x in range(6, w - 6):
            if y < 25 or dither(x, y, 0.5):
                bk.px(x, y, WD[0])
    for i in range(30):
        x, y = 7 + int(hsh(i, 41) * (w - 14)), 28 + int(hsh(i, 42) * (h - 30))
        if bk.get(x, y) == WD[1]:
            bk.px(x, y, WD[0] if i % 2 else WD[2])
    # shelves
    for (sx0, sx1, sy) in [(8, 42, 38), (62, 87, 36)]:
        bk.hline(sx0, sx1, sy, WD[3])
        bk.hline(sx0, sx1, sy + 1, WD[2])
        bk.hline(sx0, sx1, sy + 2, WD[0])
        for bx in (sx0 + 2, sx1 - 2):
            bk.px(bx, sy + 3, WD[2])
            bk.px(bx, sy + 4, WD[2])
            bk.px(bx + 1, sy + 3, WD[2])
    paste(cv, bk, 0, 0)
    # goods on the shelves
    def jar(x, y, rp, hgt=5, wid=4, neck=True):
        j = Canvas(w, h)
        j.rect(x, y - hgt, wid, hgt, rp[2])
        j.vline(x, y - hgt, y - 1, rp[3])
        j.px(x, y - hgt + 1, rp[4])
        j.vline(x + wid - 1, y - hgt, y - 1, rp[1])
        if neck:
            j.rect(x + 1, y - hgt - 2, wid - 2, 2, rp[2])
            j.px(x + 1, y - hgt - 2, LIN[3])
        ink(j)
        paste(cv, j, 0, 0)
    jar(10, 38, R['slime_green'], 6, 4)
    jar(16, 38, R['copper'], 4, 5, False)
    jar(23, 38, R['slime_blue'], 5, 3)
    jar(28, 38, GO, 4, 4)
    jar(35, 38, R['cloth_purple'], 6, 4)
    # bread and a cheese wheel on the right shelf
    for x in (63, 69):
        b = Canvas(w, h)
        b.ellipse(x + 2.5, 34.0, 3.0, 2.0, WP[3])
        b.px(x + 1, 33, WP[4])
        b.px(x + 2, 33, WP[4])
        b.px(x + 3, 34, WP[1])
        b.px(x + 1, 34, WP[1])
        ink(b)
        paste(cv, b, 0, 0)
    ch = Canvas(w, h)
    ch.ellipse(80.5, 32.5, 4.5, 3.5, GO[3])
    ch.hline(77, 84, 33, GO[2])
    ch.hline(77, 84, 34, GO[2])
    ch.hline(77, 84, 30, GO[4])
    ink(ch)
    paste(cv, ch, 0, 0)
    # the cooking pot: on three stones over embers
    fire = Canvas(w, h)
    for (x, y, c) in [(18, 64, EM[3]), (19, 64, EM[4]), (20, 65, EM[3]), (22, 64, EM[2]), (23, 64, EM[4]), (25, 65, EM[3]),
                      (27, 64, EM[2]), (28, 64, EM[3]), (21, 63, FI[3]), (24, 63, FI[3]), (26, 63, FI[2]), (21, 62, FI[2]),
                      (24, 62, FI[4]), (24, 61, FI[3]), (19, 63, FI[2])]:
        fire.px(x, y, c)
    paste(cv, fire, 0, 0)
    for (sx, sw_, sh_) in [(11, 9, 6), (20, 8, 4), (29, 10, 6)]:
        s = Canvas(w, h)
        s.ellipse(sx + sw_ / 2.0, h - 1.0, sw_ / 2.0, sh_ * 0.9, ST[2])
        volume(s, ST, x0=sx - 1, y0=h - sh_ - 2, w=sw_ + 2, h=sh_ + 2)
        for x in range(sx, sx + sw_):
            for y in range(h - sh_ - 1, h - sh_ + 2):
                if s.on(x, y) and not s.on(x, y - 1):
                    s.px(x, y, mix(ST[3], EM[3], 0.35) if 15 < x < 34 else ST[3])
        ink(s)
        paste(cv, s, 0, 0)
    pot = Canvas(w, h)
    pot.ellipse(24.0, 54.5, 10.5, 7.5, IR[2])
    pot.rect(12, 46, 25, 3, CLEAR)
    CAUL = [OUTLINE_SOFT, IR[0], IR[1], IR[2], IR[3]]
    volume(pot, CAUL, x0=12, y0=47, w=25, h=17)
    # bottom glows from the embers
    for x in range(14, 34):
        for y in range(58, 63):
            if pot.on(x, y) and not pot.on(x, y + 1):
                pot.px(x, y, mix(IR[1], EM[3], 0.45))
    pot.ellipse(24.0, 48.5, 10.0, 2.2, IR[2])
    pot.ellipse(24.0, 48.8, 8.6, 1.4, R['cloth_brown'][2])
    pot.hline(18, 28, 48, R['cloth_brown'][3])
    pot.px(21, 48, R["cloth_orange"][3])
    pot.px(26, 49, R['cloth_orange'][3])
    pot.px(19, 49, LF[3])
    for (x, y) in [(12, 51), (12, 52), (36, 51), (36, 52)]:
        pot.px(x, y, IR[1])
    ink(pot)
    paste(cv, pot, 0, 0)
    ld = Canvas(w, h)
    ld.thick(27.5, 48.5, 34.5, 39.5, 2.6, WP[2])
    for y in range(h):
        for x in range(w):
            if ld.on(x, y) and not ld.on(x - 1, y):
                ld.p[x, y] = WP[3]
    ink(ld)
    paste(cv, ld, 0, 0)
    # steam, a soft dithered wisp
    st_c = (236, 240, 246, 150)
    for y in range(32, 47):
        for x in range(16, 32):
            t = (46 - y) / 14.0
            sx = 22 + math.sin(y * 0.55) * 2.5 + t * 3
            if abs(x + 0.5 - sx) < 1.6 - t * 0.6 and dither(x, y, 0.75 - t * 0.5):
                cv.px(x, y, st_c)
    # poles
    pl = Canvas(w, h)
    for px_ in (2, w - 6):
        pl.rect(px_, 4, 4, h - 4, WD[2])
        pl.vline(px_, 4, h - 1, WD[3])
        pl.vline(px_ + 1, 4, h - 1, WD[3])
        pl.vline(px_ + 3, 4, h - 1, WD[1])
        pl.rect(px_ - 1, 1, 6, 3, WD[3])
        pl.hline(px_ - 1, px_ + 4, 1, WD[4])
    ink(pl)
    paste(cv, pl, 0, 0)
    # canopy: stripes fanning slightly, lit along the top
    cn = Canvas(w, h)
    t0, t1 = 3, 15
    for y in range(t0, t1 + 1):
        k = (y - t0) / (t1 - t0)
        xa, xb = lerp(7, 0, k), lerp(w - 8, w - 1, k)
        for x in range(int(xa), int(math.ceil(xb))):
            u = (x + 0.5 - xa) / (xb - xa)
            idx = int(u * 11)
            rp = RD if idx % 2 == 0 else L
            tone = 3 if y < t0 + 4 else 2
            if y == t0:
                tone = 4 if rp is L else 3
            if (u * 11) % 1 < 0.12 and y > t0 + 1:
                tone -= 1
            cn.px(x, y, rp[tone])
    # valance: scalloped flaps
    for i in range(11):
        xa, xb = i * w / 11.0, (i + 1) * w / 11.0
        rp = RD if i % 2 == 0 else L
        fc = (xa + xb) / 2
        for x in range(int(xa), int(math.ceil(xb))):
            d = (x + 0.5 - fc) / ((xb - xa) / 2)
            if abs(d) > 1:
                continue
            bot = 19 + 2.6 * math.sqrt(max(0, 1 - d * d))
            for y in range(16, int(bot) + 1):
                tone = 2
                if y == 16:
                    tone = 1
                if y == int(bot):
                    tone = 1
                if d < -0.55 and 16 < y < int(bot):
                    tone = 3
                cn.px(x, y, rp[tone])
    ink(cn, sel_dark)
    # stitched seam where canopy meets valance
    paste(cv, cn, 0, 0)
    # wares hanging from the valance
    hg = Canvas(w, h)
    def string(x, y0, y1):
        for y in range(y0, y1 + 1):
            hg.px(x, y, R['thatch'][1])
    string(13, 21, 23)
    for i in range(5):
        y = 24 + i * 2
        x = 12 + (i % 2) * 2
        hg.ellipse(x + 0.5, y + 0.5, 1.6, 1.3, L[4])
        hg.px(x, y + 1, L[2])
        hg.px(x + 1, y - 1, L[3])
    string(22, 21, 24)
    for (x, y, c) in [(20, 25, LF[3]), (21, 25, LF[2]), (22, 25, LF[3]), (23, 25, LF[2]), (24, 25, LF[3]),
                      (20, 26, LF[2]), (21, 26, LF[4]), (22, 26, LF[2]), (23, 26, LF[3]), (24, 26, LF[1]),
                      (21, 27, LF[3]), (22, 27, LF[2]), (23, 27, LF[2]), (21, 28, LF[2]), (22, 28, LF[3]), (23, 28, LF[1]),
                      (22, 29, LF[2]), (22, 30, LF[1]), (21, 24, R['thatch'][3]), (22, 24, R['thatch'][2]), (23, 24, R['thatch'][3])]:
        hg.px(x, y, c)
    string(34, 21, 25)
    hg.ellipse(34.5, 29.5, 3.2, 3.2, R['copper'][2])
    hg.ellipse(34.0, 29.0, 2.0, 2.0, R['copper'][3])
    hg.px(33, 28, R['copper'][4])
    hg.px(36, 31, R['copper'][1])
    for i, x in enumerate(range(68, 83)):
        y = 22 + int(3 * math.sin((x - 68) / 14.0 * math.pi))
        hg.px(x, y, R['thatch'][1])
        if i % 4 == 1:
            hg.rect(x, y + 1, 2, 4, R['brick'][3])
            hg.px(x, y + 1, R['brick'][4])
            hg.px(x + 1, y + 4, R['brick'][2])
    string(86, 21, 23)
    for (x, y) in [(85, 25), (87, 25), (86, 27)]:
        hg.ellipse(x + 0.5, y + 0.5, 1.7, 1.6, R['cloth_purple'][3])
        hg.px(x, y - 1, R['cloth_purple'][4])
    ink(hg, sel_dark)
    paste(cv, hg, 0, 0)
    return cv


# ---------------------------------------------------------------------------- garden
TC = R['copper']   # terracotta


def clay_pot(w, h, top, rim_w, bot_w, rim_h=3, r=TC, x_off=0):
    """A terracotta pot from row `top` to the bottom, rim on top, tapering body."""
    cv = Canvas(w, h)
    cx = w / 2.0 + x_off
    for y in range(top, h):
        if y < top + rim_h:
            hw = rim_w / 2.0
        else:
            t = (y - top - rim_h) / max(1, (h - 1 - top - rim_h))
            hw = lerp(rim_w / 2.0 - 1, bot_w / 2.0, t)
        x0, x1 = cx - hw, cx + hw
        for x in range(w):
            xc = x + 0.5
            if x0 <= xc <= x1:
                u = (xc - x0) / (x1 - x0)
                i = cyl(u)
                if y < top + rim_h:
                    i = min(4, i + (1 if y == top else 0))
                cv.px(x, y, r[i])
    for x in range(w):
        if cv.on(x, top + rim_h):
            cv.px(x, top + rim_h, r[max(0, cyl((x + 0.5 - (cx - rim_w / 2.0 + 1)) / max(1, rim_w - 2)) - 2)])
    # a painted band
    by = top + rim_h + 3
    for x in range(w):
        if cv.on(x, by) and by < h - 2:
            c = cv.get(x, by)
            j = r.index(c) if c in r else 2
            cv.px(x, by, r[max(0, j - 1)])
    ink(cv)
    return cv


def p_potPlant1(w, h):
    cv = Canvas(w, h)
    pl = bush(w - 2, 15, LF, 51, 6)
    paste(cv, pl, 1, 0)
    RD = R['cloth_red']
    for (x, y) in [(5, 4), (11, 2), (16, 5), (8, 8), (14, 9), (3, 9), (18, 9)]:
        stamp(cv, x - 1, y - 1, ['.ab', 'abc', 'bcc'], {'a': RD[4], 'b': RD[3], 'c': RD[2]})
    pot = clay_pot(w, h, 13, 17, 11)
    paste(cv, pot, 0, 0)
    return cv


def p_potPlant2(w, h):
    cv = Canvas(w, h)
    PU = R['cloth_purple']
    # lavender: grey-green leaves at the base, purple spikes above
    lv = Canvas(w, h)
    for i in range(13):
        bx = 4 + i * 1.05
        ht = 8 + int(hsh(i, 61) * 8) + (3 if 4 < i < 9 else 0)
        lean = (bx - w / 2) * 0.35
        for k in range(ht):
            t = k / ht
            x = int(bx + lean * t)
            y = 15 - k
            if t > 0.55:
                lv.px(x, y, PU[3] if (k + i) % 2 else PU[2])
                if hsh(i, k) < 0.5:
                    lv.px(x + 1, y, PU[1])
            else:
                lv.px(x, y, LF[2] if i % 2 else R['skin_zombie'][3])
    for x in range(3, w - 3):
        for y in range(11, 16):
            if hsh(x, y, 62) < 0.55:
                lv.px(x, y, R['skin_zombie'][2] if hsh(x, y) < 0.5 else R['skin_zombie'][3])
    for i in range(13):
        bx = 4 + i * 1.05
        if hsh(i, 63) < 0.6:
            lv.px(int(bx), 0 + int(hsh(i, 61) * 4) + (0 if 4 < i < 9 else 3), PU[4])
    ink(lv, sel_dark)
    paste(cv, lv, 0, 0)
    pot = clay_pot(w, h, 14, 17, 10, 3)
    paste(cv, pot, 0, 0)
    return cv


def p_potSmall(w, h):
    cv = Canvas(w, h)
    pl = Canvas(w, h)
    for i, (x, y) in enumerate([(4, 6), (8, 4), (13, 6), (10, 7), (6, 8), (12, 9)]):
        pl.vline(x, y, 10, LF[2])
    for (x, y) in [(3, 8), (5, 7), (11, 8), (14, 8), (7, 9), (9, 9)]:
        pl.px(x, y, LF[3])
        pl.px(x + 1, y, LF[2])
    for (x, y) in [(4, 5), (8, 3), (13, 5)]:
        stamp(pl, x - 1, y - 1, ['.a.', 'aba', '.a.'], {'a': LIN[4], 'b': GO[3]})
    ink(pl, sel_dark)
    paste(cv, pl, 0, 0)
    pot = clay_pot(w, h, 9, 16, 12, 2)
    paste(cv, pot, 0, 0)
    return cv


def sunflower_head(cv, cx, cy, rad, face=-0.3):
    hd = Canvas(cv.w, cv.h)
    n = 11
    for y in range(int(cy - rad - 2), int(cy + rad + 3)):
        for x in range(int(cx - rad - 2), int(cx + rad + 3)):
            dx, dy = x + 0.5 - cx, (y + 0.5 - cy) / 0.92
            d = math.hypot(dx, dy)
            a = math.atan2(dy, dx)
            petal = 0.5 + 0.5 * math.cos(n * (a - 0.2))
            if d > rad * (0.74 + 0.3 * petal):
                continue
            up = -(dx * 0.7 + dy * 0.75) / max(d, 0.1)
            c = GO[4] if up > 0.45 else (GO[3] if up > -0.35 else GO[2])
            if petal < 0.2 and d > rad * 0.62:
                c = GO[2] if up > 0 else GO[1]
            hd.px(x, y, c)
    ink(hd, GO[1])
    dr = rad * 0.47
    for y in range(int(cy - dr - 1), int(cy + dr + 2)):
        for x in range(int(cx - dr - 1), int(cx + dr + 2)):
            dx, dy = x + 0.5 - cx - face, y + 0.5 - cy
            if dx * dx + dy * dy <= dr * dr:
                c = WD[1] if (x + y) % 2 else WD[2]
                if dx + dy < -dr * 0.5:
                    c = WD[3]
                if dx + dy > dr * 0.9:
                    c = WD[0]
                hd.px(x, y, c)
    paste(cv, hd, 0, 0)


def p_sunflowers(w, h):
    cv = Canvas(w, h)
    stems = [(8, 7, 11.5), (19, 4, 7.5), (14, 17, 13.5)]
    st = Canvas(w, h)
    for (hx, hy, bx) in stems:
        for y in range(hy, h):
            t = (y - hy) / (h - hy)
            x = int(round(lerp(hx, bx, t) + math.sin(t * 3) * 0.6))
            st.px(x, y, LF[3])
            st.px(x + 1, y, LF[1])
    # broad leaves
    for (x, y, d) in [(12, 26, -1), (14, 32, 1), (20, 21, 1), (10, 36, -1), (16, 38, 1)]:
        lf = Canvas(w, h)
        for k in range(7):
            t = k / 6.0
            yy = y - int(math.sin(t * math.pi) * 2.2) + int(t * 2)
            th = int(math.sin(t * math.pi) * 2.2) + 1
            for j in range(th):
                lf.px(x + d * k, yy + j, LF[3] if j == 0 else LF[2])
        lf.px(x + d * 2, y, LF[4])
        ink(lf, sel_dark)
        paste(st, lf, 0, 0)
    ink(st, sel_dark, skip=lambda x, y: True)
    paste(cv, st, 0, 0)
    sunflower_head(cv, 19.5, 5.5, 4.8)
    sunflower_head(cv, 7.5, 8.5, 5.2)
    sunflower_head(cv, 14.0, 18.0, 4.2)
    grass_base(cv, h - 1, 4, w - 5, 81, 3)
    return cv


# ---------------------------------------------------------------------------- the shrine
def feather_wing(w, h, pts, root, tip, r, seed, flip=False):
    """A raised stone wing: filled outline, then rows of scalloped feathers toward the tip."""
    cv = Canvas(w, h)
    cv.poly(pts, r[2])
    volume(cv, r, bands=(0.25, 0.5, 0.78))
    rx, ry = root
    tx, ty = tip
    # feather scallops: arcs across the wing, spaced from root to tip
    for row in range(1, 4):
        t = row / 4.0
        fx, fy = lerp(rx, tx, t), lerp(ry, ty, t)
        for k in range(-8, 9):
            ang = math.atan2(ty - ry, tx - rx) + math.pi / 2
            x = fx + math.cos(ang) * k * 1.6
            y = fy + math.sin(ang) * k * 1.6
            # scallop dips
            if cv.on(int(x), int(y)):
                cv.px(int(x), int(y), r[1])
                if cv.on(int(x), int(y) - 1):
                    cv.px(int(x), int(y) - 1, r[3])
    return cv


def p_angel(w, h):
    cv = Canvas(w, h)
    S = ST
    # wings rise from behind the shoulders
    wl = stone_wing(w, h, (29.0, 21.0), (19.0, 2.0), (5.0, 6.0), -1)
    wr = stone_wing(w, h, (35.0, 21.0), (45.0, 2.0), (58.0, 7.0), 1)
    # weathering: a chipped primary on the right wing
    for (x, y) in [(56, 26), (57, 26), (56, 25), (57, 27)]:
        if wr.on(x, y):
            wr.p[x, y] = CLEAR
    paste(cv, wr, 0, 0)
    paste(cv, wl, 0, 0)
    # robed figure
    fg = Canvas(w, h)
    fg.poly([(27.0, 19), (37.0, 19), (38.8, 27), (40.0, 35), (42.0, 43.6), (22.0, 43.6), (24.0, 35), (25.2, 27)], S[2])
    fg.ellipse(32.0, 14.0, 4.6, 5.2, S[2])
    volume(fg, S, bands=(0.2, 0.45, 0.75))
    # hood opening and a bowed face in its shadow
    for (x, y) in [(31, 12), (32, 12), (33, 12), (30, 13), (31, 13), (32, 13), (33, 13), (30, 14), (31, 14), (32, 14), (33, 14),
                   (30, 15), (31, 15), (32, 15), (33, 15), (31, 16), (32, 16), (33, 16), (32, 17)]:
        fg.px(x, y, S[1])
    fg.px(31, 15, S[2])
    fg.px(31, 16, S[2])
    fg.px(32, 16, S[2])
    fg.px(31, 14, S[2])
    fg.px(30, 12, S[3])
    fg.px(29, 13, S[3])
    fg.px(29, 14, S[3])
    # robe folds
    for (x0, y0, x1, y1) in [(28, 29, 26, 43), (32, 30, 32, 43), (36, 29, 38, 43), (30, 35, 29, 43)]:
        fg.line(x0, y0, x1, y1, S[1])
        if x0 < 33:
            fg.line(x0 - 1, y0 + 1, x1 - 1, y1, S[3])
    fg.hline(23, 41, 43, S[1])
    sl = Canvas(w, h)
    sl.poly([(25.5, 21), (29, 23), (31, 27), (33, 28), (38.5, 27), (38.5, 22.5), (35, 22), (33, 25), (30, 22)], S[2])
    volume(sl, S, bands=(0.25, 0.5, 0.8))
    ink(sl, S[1])
    paste(fg, sl, 0, 0)
    bowl = Canvas(w, h)
    bowl.ellipse(32.5, 26.5, 3.2, 1.6, S[3])
    bowl.hline(30, 35, 26, S[4])
    ink(bowl, S[1])
    paste(fg, bowl, 0, 0)
    for (x, y, c) in [(31, 25, GO[3]), (32, 25, GO[4]), (33, 25, GO[3]), (32, 24, GO[4]), (32, 23, GO[3])]:
        fg.px(x, y, c)
    ink(fg, sel_dark)
    paste(cv, fg, 0, 0)
    # plinth
    pl = Canvas(w, h)
    pl.rect(19, 46, 26, 12, S[2])
    pl.rect(17, 43, 30, 3, S[2])
    pl.rect(16, 58, 32, 6, S[2])
    stone_face(pl, S)
    pl.hline(17, 46, 43, S[4])
    pl.hline(17, 46, 45, S[1])
    pl.hline(16, 47, 58, S[4])
    pl.hline(19, 44, 57, S[1])
    for y in range(48, 56):
        for x in range(23, 41):
            if y in (48, 55) or x in (23, 40):
                pl.px(x, y, S[1] if (y == 48 or x == 23) else S[3])
    flame = {(32, 49), (31, 50), (32, 50), (31, 51), (32, 51), (33, 51), (30, 52), (31, 52), (33, 52), (34, 52), (30, 53), (34, 53), (31, 54), (32, 54), (33, 54)}
    engrave(pl, flame, S)
    for (x, y) in [(42, 47), (42, 48), (41, 49), (42, 50), (43, 51), (20, 60), (21, 61), (21, 62)]:
        pl.px(x, y, S[0])
    moss(pl, (17, 43, 30, 2), 91, 0.45)
    moss(pl, (16, 58, 32, 2), 92, 0.3)
    moss(pl, (19, 55, 26, 3), 93, 0.12)
    ink(pl, sel_dark)
    paste(cv, pl, 0, 0)
    # moss on the upper surfaces of the wings and shoulders, a few lichen spots
    for y in range(4, 40):
        for x in range(w):
            if cv.on(x, y) and not cv.on(x, y - 1) and cv.on(x, y + 1) and hsh(x, y, 95) < 0.3:
                if cv.get(x, y + 1) in S:
                    cv.px(x, y + 1, LF[3] if hsh(x, y, 96) < 0.6 else LF[2])
    for i in range(10):
        x, y = 8 + int(hsh(i, 97) * 50), 8 + int(hsh(i, 98) * 30)
        if cv.get(x, y) in S[1:]:
            cv.px(x, y, mix(LF[4], GO[3], 0.4))
    # offerings: candles and a posy at the foot
    for (x, ht) in [(12, 5), (14, 3)]:
        cd = Canvas(w, h)
        cd.rect(x, h - ht, 2, ht, LIN[4])
        cd.vline(x + 1, h - ht, h - 1, LIN[2])
        ink(cd)
        cd.px(x, h - ht - 1, FI[3])
        cd.px(x, h - ht - 2, FI[4])
        cd.px(x + 1, h - ht - 1, FI[2])
        paste(cv, cd, 0, 0)
    stamp(cv, 48, h - 6, ['.a.b.', 'acbcb', 'b.d.a', '.ddd.', '..d..', '..d..'],
          {'a': R['blossom'][3], 'b': LIN[4], 'c': GO[4], 'd': LF[2]})
    grass_base(cv, h - 1, 8, 56, 99, 2)
    return cv


# ---------------------------------------------------------------------------- the camp
def p_smallTent(w, h):
    cv = Canvas(w, h)
    L = LIN
    # side slope (in shade), receding to the right
    ax_, ay_ = 22.0, 26.0          # front apex
    bx_, by_ = 49.0, 29.0          # back apex
    side = Canvas(w, h)
    side.poly([(ax_, ay_), (bx_, by_), (60.5, h - 1.0), (41.5, h - 1.0)], L[2])
    for y in range(h):
        for x in range(w):
            if side.on(x, y):
                c = L[1]
                # seams running down the slope
                for s in (0.33, 0.66):
                    sx0 = lerp(ax_, bx_, s)
                    sy0 = lerp(ay_, by_, s)
                    sx1 = lerp(41.5, 60.5, s)
                    t = (y - sy0) / max(1, (h - 1 - sy0))
                    if 0 <= t <= 1 and abs(x - lerp(sx0, sx1, t)) < 0.5:
                        c = L[0]
                side.p[x, y] = c
    # a patch on the side
    side.poly([(47, 44), (53, 43), (54, 49), (48, 50)], R['cloth_brown'][2])
    for (x, y) in [(47, 44), (49, 44), (51, 43), (53, 45), (54, 47), (52, 49), (50, 50), (48, 48)]:
        side.px(x, y, L[3])
    side.hline(int(ax_) + 1, int(bx_), int(ay_) + 0, L[3])
    ink(side, sel_dark)
    paste(cv, side, 0, 0)
    # front triangle (lit)
    fr = Canvas(w, h)
    fr.poly([(ax_, ay_ - 0.5), (42.5, h - 0.5), (2.5, h - 0.5)], L[3])
    for y in range(h):
        for x in range(w):
            if fr.on(x, y):
                c = L[3]
                if not fr.on(x - 1, y) or not fr.on(x, y - 1):
                    c = L[4]
                if (x + y) % 7 == 0 and c == L[3] and y > ay_ + 4:
                    c = L[2]
                fr.p[x, y] = c
    # doorway: dark interior with a tied-back flap
    door = [(ax_, ay_ + 8), (31.5, h - 0.5), (13.5, h - 0.5)]
    fr.poly(door, OUTLINE_SOFT)
    for y in range(h):
        for x in range(w):
            if fr.get(x, y) == OUTLINE_SOFT and y > h - 7:
                fr.px(x, y, R['cloth_red'][1] if y > h - 4 else R['cloth_red'][2])
            if fr.get(x, y) == OUTLINE_SOFT and dither(x, y, 0.3) and y > ay_ + 14:
                fr.px(x, y, R['cloth_brown'][0])
    fr.poly([(ax_ - 0.5, ay_ + 8), (13.5, h - 0.5), (9.5, h - 0.5), (16.5, ay_ + 22)], L[2])
    fr.line(int(ax_) - 1, int(ay_) + 9, 14, h - 2, L[4])
    fr.px(14, int(ay_) + 25, R['thatch'][2])
    fr.px(15, int(ay_) + 25, R['thatch'][1])
    ink(fr, sel_dark)
    paste(cv, fr, 0, 0)
    # ridge pole ends and a pennant
    pl = Canvas(w, h)
    pl.rect(int(ax_) - 1, int(ay_) - 6, 2, 7, WD[2])
    pl.vline(int(ax_) - 1, int(ay_) - 6, int(ay_), WD[3])
    pl.rect(int(bx_) - 1, int(by_) - 3, 2, 4, WD[1])
    ink(pl)
    paste(cv, pl, 0, 0)
    pn = Canvas(w, h)
    pn.poly([(ax_ + 0.5, ay_ - 6.5), (ax_ + 9.5, ay_ - 4.5), (ax_ + 0.5, ay_ - 2.0)], R['cloth_red'][2])
    for x in range(w):
        if pn.on(x, int(ay_) - 6):
            pn.px(x, int(ay_) - 6, R['cloth_red'][3])
    ink(pn, sel_dark)
    paste(cv, pn, 0, 0)
    # guy ropes and pegs
    for (x0, y0, x1, y1) in [(ax_ - 1, ay_ + 1, 1, h - 2), (bx_ + 1, by_ + 1, 62, h - 2)]:
        n = int(max(abs(x1 - x0), abs(y1 - y0)))
        for i in range(n + 1):
            t = i / n
            x = lerp(x0, x1, t)
            y = lerp(y0, y1, t) + math.sin(t * math.pi) * 1.5
            if not cv.on(round(x), round(y)):
                cv.px(round(x), round(y), L[1])
    for px_ in (1, 62):
        cv.vline(px_, h - 3, h - 1, WD[2])
        cv.px(px_, h - 4, WD[3])
    grass_base(cv, h - 1, 0, w - 1, 101, 2)
    return cv


def p_sacks(w, h):
    cv = Canvas(w, h)
    SA = R['sand']
    B = [SA[0], SA[1], SA[2], SA[3], SA[4]]

    def sack(x0, y0, sw, sh, seed, mark=False):
        s = Canvas(w, h)
        cx = x0 + sw / 2.0
        for y in range(y0, y0 + sh):
            t = (y - y0) / max(1, sh - 1)
            if t < 0.22:
                hw = lerp(1.5, sw / 2.0 - 1.5, t / 0.22)
            else:
                hw = sw / 2.0 - 0.3 - (0.8 if t > 0.92 else 0)
            for x in range(w):
                if abs(x + 0.5 - cx) <= hw:
                    s.px(x, y, B[2])
        # neck and tuft
        s.rect(int(cx) - 1, y0 - 2, 3, 3, B[2])
        s.rect(int(cx) - 2, y0 - 4, 5, 2, B[3])
        volume(s, B, bands=(0.2, 0.45, 0.78))
        for y in range(y0, y0 + sh):
            for x in range(w):
                if s.get(x, y) in B[1:4] and ((x * 3 + y) % 4 == 0) and hsh(x, y, seed) < 0.6:
                    j = B.index(s.get(x, y))
                    s.px(x, y, B[j - 1])
        s.hline(int(cx) - 2, int(cx) + 2, y0 - 1, R['thatch'][1])
        s.px(int(cx) + 2, y0, R['thatch'][1])
        # folds near the neck
        s.px(int(cx) - 2, y0 + 1, B[1])
        s.px(int(cx) + 1, y0 + 2, B[1])
        if mark:
            stamp(s, int(cx) - 2, y0 + sh // 2 - 2, ['..a..', '.a.a.', '..a..', '.a.a.', '..a..', '..a..'], {'a': WD[1]})
        ink(s)
        paste(cv, s, 0, 0)
    sack(8, 8, 15, 13, 1)
    sack(0, 17, 15, 15, 2, True)
    sack(16, 18, 15, 14, 3)
    for (x, y) in [(14, h - 1), (15, h - 1), (30, h - 1), (13, h - 2)]:
        cv.px(x, y, GO[3])
    return cv


def wheat_clump(w, h, seed):
    cv = Canvas(w, h)
    T = R['thatch']
    stalks = []
    for i in range(11):
        bx = 2 + (i + hsh(seed, i) * 0.7) * (w - 4) / 11
        ht = 18 + hsh(seed, i, 2) * (h - 22)
        lean = (hsh(seed, i, 3) - 0.5) * 6 + (bx - w / 2) * 0.12
        stalks.append((hsh(seed, i, 4), bx, ht, lean, i))
    stalks.sort()
    for depth, bx, ht, lean, i in stalks:
        n = int(ht)
        k_dark = depth < 0.4
        for k in range(n):
            t = k / n
            x = int(round(bx + lean * t * t))
            y = h - 1 - k
            if t < 0.3:
                c = mix(LF[2], T[2], t / 0.3)
            else:
                c = T[2] if k_dark else T[3]
            cv.px(x, y, c)
        # head: kernels on alternating sides with awns
        hx, hy = int(round(bx + lean)), h - 1 - n
        for j in range(6):
            yy = hy + j
            xx = hx - int(lean * 0.12 * j)
            cv.px(xx - 1, yy, T[4] if not k_dark else T[3])
            cv.px(xx, yy, T[3] if not k_dark else T[2])
            cv.px(xx + 1, yy, T[2] if not k_dark else T[1])
            if j % 2 == 0 and j < 5:
                cv.px(xx - 2, yy - 1, T[3])
                cv.px(xx + 2, yy - 1, T[2])
        cv.px(hx, hy - 1, T[4])
        cv.px(hx, hy - 2, T[3])
        # a leaf
        if i % 3 == 0:
            ly = h - 1 - int(n * 0.35)
            for k in range(5):
                cv.px(int(bx) + (k if i % 2 else -k), ly + k // 2, LF[3] if k < 3 else T[3])
    for x in range(w):
        for y in range(h - 2, h):
            if cv.on(x, y):
                cv.px(x, y, LF[1])
    return cv


def p_wheat(w, h):
    return wheat_clump(w, h, 1)


def p_wheat2(w, h):
    return wheat_clump(w, h, 7)


def p_tallGrass(w, h):
    cv = Canvas(w, h)
    blades = []
    for i in range(170):
        x = hsh(i, 1) * (w - 2) + 1
        edge = min(x, w - x) / 22.0
        edge = min(1.0, edge)
        ht = (4 + hsh(i, 2) * (h - 6)) * (0.35 + 0.65 * edge)
        lean = (hsh(i, 3) - 0.45) * 7
        blades.append((hsh(i, 4), x, ht, lean, i))
    blades.sort()
    for depth, x, ht, lean, i in blades:
        rr = LF if depth < 0.4 else GR
        n = max(2, int(ht))
        for k in range(n):
            t = k / n
            xx = int(round(x + lean * t * t))
            y = h - 1 - k
            if k == 0:
                c = rr[1]
            elif t > 0.75:
                c = rr[4] if depth > 0.7 else rr[3]
            else:
                c = rr[3] if depth > 0.55 else rr[2]
            cv.px(xx, y, c)
        if hsh(i, 5) < 0.08 and n > 14:
            tx, ty = int(round(x + lean)), h - 1 - n
            for j in range(4):
                cv.px(tx, ty + j, R['thatch'][3] if j % 2 else R['thatch'][4])
    for i, (fx, fc) in enumerate([(18, LIN[4]), (37, R['cloth_purple'][3]), (55, GO[4]), (70, LIN[4]), (83, R['cloth_purple'][3])]):
        fy = h - 9 - int(hsh(i, 9) * 9)
        cv.vline(fx, fy + 1, h - 1, GR[2])
        stamp(cv, fx - 1, fy - 1, ['.a.', 'aba', '.a.'], {'a': fc, 'b': GO[3] if fc != GO[4] else GO[2]})
    return cv


# ---------------------------------------------------------------------------- fire
def flame_mask(tongues, t, N):
    """Union of flickering tongues. Each tongue: (bx, by, half_w, height, sway, phase, kf).
    Every motion is a whole number of cycles per N frames, so the loop is seamless."""
    m = {}
    for (bx, by, hw, ht, sway, ph, kf) in tongues:
        a = TAU * (kf * t / N + ph)
        H = ht * (1 + 0.2 * math.sin(a) + 0.08 * math.sin(2 * a + 1.3))
        Hi = max(1, int(round(H)))
        for dy in range(Hi + 1):
            f = dy / H
            if f > 1:
                break
            width = hw * (1 - f) ** 0.8 * min(1.0, 0.8 + f * 2.0)
            cx = bx + sway * math.sin(a + f * 2.6) * f ** 1.3
            for x in range(int(cx - width - 2), int(cx + width + 3)):
                if abs(x + 0.5 - cx) <= width + 0.05:
                    y = by - dy
                    m[(x, y)] = max(m.get((x, y), 0), 1 - f)
    return m


def paint_flame(cv, m, base_y, r=FI, boost_rows=1):
    """Colour a flame mask by depth: red-orange skin, orange, amber, and a pale core low down."""
    def inside(x, y):
        return (x, y) in m or y > base_y
    for (x, y), heat in m.items():
        d = 0
        for k in range(1, 6):
            if inside(x - k, y) and inside(x + k, y) and inside(x, y - k):
                d = k
            else:
                break
        lvl = d + (1 if base_y - y < boost_rows else 0)
        cap = 3 if heat > 0.45 else (2 if heat > 0.2 else 1)
        lvl = min(lvl, cap)
        c = (r[1], r[2], r[3], r[4])[lvl]
        if d == 0 and heat < 0.12:
            c = r[0]
        cv.px(x, y, c)


def licks(cv, t, N, items, r=FI):
    """Detached flame licks drifting up off the tips and shrinking."""
    for (bx, by, P, off, rise, size, drift) in items:
        ph = ((t + off) % P) / P
        s = size * (1 - ph)
        if s < 0.5:
            continue
        x = bx + drift * math.sin(ph * TAU * 0.5)
        y = by - ph * rise
        cv.ellipse(x, y, s * 0.6, s, r[1] if s < 1.2 else r[2])
        if s >= 1.4:
            cv.px(int(x), int(y), r[3])


def sparks(cv, t, N, items, r=EM):
    for (bx, by, P, off, rise, drift) in items:
        ph = ((t + off) % P) / P
        if ph > 0.92:
            continue
        x = bx + drift * math.sin(ph * TAU) * ph
        y = by - ph * rise
        c = r[4] if ph < 0.3 else (r[3] if ph < 0.6 else r[2])
        cv.px(int(round(x)), int(round(y)), c)


def smoke(cv, t, N, items):
    for (bx, by, P, off, rise, drift, rad) in items:
        ph = ((t + off) % P) / P
        x = bx + drift * ph
        y = by - ph * rise
        rr = rad * (0.6 + ph * 0.8)
        a = int(150 * (1 - ph))
        if a < 20:
            continue
        for yy in range(int(y - rr) - 1, int(y + rr) + 2):
            for xx in range(int(x - rr) - 1, int(x + rr) + 2):
                if (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= rr * rr and dither(xx, yy, 0.6 - ph * 0.3):
                    lit = (xx + 0.5 - x) + (yy + 0.5 - y) < 0
                    c = ST[3] if lit else ST[2]
                    cv.px(xx, yy, (c[0], c[1], c[2], a))


def log_piece(w, h, x0, y0, x1, y1, th, r=WD, char=True):
    lg = Canvas(w, h)
    lg.thick(x0, y0, x1, y1, th, r[2])
    vx, vy = x1 - x0, y1 - y0
    L = math.hypot(vx, vy)
    nx, ny = -vy / L, vx / L
    if ny > 0:
        nx, ny = -nx, -ny     # normal pointing up
    for y in range(h):
        for x in range(w):
            if not lg.on(x, y):
                continue
            px_, py_ = x + 0.5 - x0, y + 0.5 - y0
            s = px_ * nx + py_ * ny   # +: upper side
            i = 3 if s > th * 0.18 else (2 if s > -th * 0.15 else 1)
            if hsh(x, y, 5) < 0.12:
                i = max(0, i - 1)
            lg.p[x, y] = r[i]
    ink(lg)
    return lg


def stone(w, h, cx, cy, rx, ry, r=ST, seed=0, warm=0.0):
    s = Canvas(w, h)
    s.ellipse(cx, cy, rx, ry, r[2])
    volume(s, r, x0=max(0, int(cx - rx) - 1), y0=max(0, int(cy - ry) - 1), w=int(rx * 2) + 3, h=int(ry * 2) + 3)
    if warm:
        for y in range(h):
            for x in range(w):
                if s.on(x, y) and not s.on(x, y - 2):
                    s.px(x, y, mix(s.get(x, y), EM[4], warm))
    ink(s)
    return s


def campfire_frame(t, N, food=False):
    w = h = 32
    cv = Canvas(w, h)
    flick = 0.5 + 0.3 * math.sin(TAU * 4 * t / N) + 0.2 * math.sin(TAU * 10 * t / N)
    warm = 0.3 + 0.12 * flick
    # ash bed
    for x in range(3, 29):
        for y in range(27, 32):
            if abs(x + 0.5 - 16) / 13.0 + abs(y + 0.5 - 29.5) / 2.6 < 1.1:
                cv.px(x, y, R['stone_cave'][1] if (x * 3 + y) % 4 else R['stone_cave'][2])
    # back stones
    for (cx, cy, rx, ry, sd) in [(4.0, 26.0, 3.2, 2.8, 1), (28.0, 26.0, 3.2, 2.8, 2), (9.5, 24.5, 2.6, 2.2, 3), (22.5, 24.5, 2.6, 2.2, 4)]:
        paste(cv, stone(w, h, cx, cy, rx, ry, ST, sd, warm), 0, 0)
    # crossed logs, charred where they meet
    paste(cv, log_piece(w, h, 5.0, 28.0, 21.0, 20.5, 4.0), 0, 0)
    paste(cv, log_piece(w, h, 27.0, 28.0, 11.0, 20.5, 4.0), 0, 0)
    for (x, y) in [(13, 24), (14, 23), (15, 22), (17, 22), (18, 23), (19, 24), (12, 25), (20, 25), (15, 25), (16, 25), (16, 23), (14, 25)]:
        k = 0.5 + 0.5 * math.sin(TAU * (2 * t / N) + x * 1.7 + y)
        cv.px(x, y, EM[3] if k > 0.65 else (EM[2] if k > 0.3 else EM[1]))
    base = 25
    if food:
        tongues = [
            (16.0, base, 3.8, 9.5, 1.8, 0.00, 4),
            (12.5, base + 1, 2.4, 7.0, 1.4, 0.35, 5),
            (19.5, base + 1, 2.4, 7.5, 1.4, 0.70, 5),
            (9.5, base + 2, 1.5, 4.0, 0.8, 0.15, 8),
            (22.5, base + 2, 1.5, 4.5, 0.8, 0.55, 8),
        ]
        lk = [(15.0, 16.0, 10, 0, 4, 1.5, 1.0), (18.0, 17.0, 10, 5, 4, 1.2, -1.0)]
    else:
        tongues = [
            (16.0, base, 4.0, 15.0, 2.2, 0.00, 4),
            (12.3, base + 1, 2.6, 9.5, 1.6, 0.30, 5),
            (19.7, base + 1, 2.6, 10.5, 1.6, 0.65, 5),
            (9.5, base + 2, 1.6, 5.0, 1.0, 0.15, 8),
            (22.5, base + 2, 1.6, 5.5, 1.0, 0.55, 8),
            (15.0, base - 1, 1.9, 11.0, 1.6, 0.85, 10),
        ]
        lk = [(15.5, 8.0, 10, 0, 6, 1.7, 1.0), (18.5, 12.0, 8, 4, 6, 1.3, -1.2), (12.0, 14.0, 20, 9, 7, 1.3, 0.8)]
    fl = Canvas(w, h)
    paint_flame(fl, flame_mask(tongues, t, N), base)
    licks(fl, t, N, lk)
    paste(cv, fl, 0, 0)
    # front stones
    for (cx, cy, rx, ry, sd) in [(4.5, 29.5, 3.6, 2.6, 5), (11.0, 30.0, 3.4, 2.3, 6), (17.5, 30.3, 3.4, 2.3, 7), (23.5, 29.9, 3.2, 2.4, 8), (28.5, 29.2, 3.0, 2.6, 9)]:
        paste(cv, stone(w, h, cx, cy, rx, ry, ST, sd, warm * 0.8), 0, 0)
    if food:
        food_parts(cv, t, N)
        sp = [(13.0, 17.0, 20, 0, 15, -2.0), (20.0, 17.0, 20, 9, 14, 2.5), (16.0, 18.0, 40, 21, 17, 1.0)]
    else:
        sp = [(15.0, 13.0, 20, 0, 12, 2.0), (18.0, 12.0, 20, 7, 11, -2.5), (13.0, 15.0, 40, 13, 15, 3.0),
              (17.0, 14.0, 40, 29, 14, -1.5), (16.0, 11.0, 10, 3, 9, 1.5)]
    sparks(cv, t, N, sp)
    return cv


def food_parts(cv, t, N):
    w = h = 32
    # forked stakes
    st = Canvas(w, h)
    for sx in (2, 27):
        st.rect(sx, 12, 3, h - 12, WD[2])
        st.vline(sx, 12, h - 1, WD[3])
        st.vline(sx + 2, 12, h - 1, WD[1])
        st.rect(sx - 1, 9, 2, 3, WD[2])
        st.rect(sx + 2, 9, 2, 3, WD[2])
        st.px(sx - 1, 9, WD[3])
        st.px(sx + 2, 9, WD[3])
    ink(st)
    paste(cv, st, 0, 0)
    # spit rod and a crank
    for x in range(1, 31):
        cv.px(x, 11, IR[3])
        cv.px(x, 12, IR[1])
    cv.vline(30, 12, 15, IR[2])
    cv.px(31, 15, IR[3])
    cv.px(31, 16, IR[1])
    # the roast: a haunch on the bone, turning
    mt = Canvas(w, h)
    MR = [R['cloth_brown'][0], R['brick'][1], R['copper'][1], R['copper'][2], R['cloth_orange'][3]]
    mt.ellipse(14.0, 13.0, 6.0, 4.2, MR[2])
    mt.ellipse(19.0, 12.5, 3.0, 2.8, MR[2])
    volume(mt, MR, x0=6, y0=7, w=18, h=12)
    turn = TAU * 2 * t / N
    hx = 13.5 + math.cos(turn) * 3.5
    if math.sin(turn) < 0.4:
        for y in range(10, 13):
            for x in range(int(hx) - 1, int(hx) + 2):
                if mt.on(x, y) and mt.on(x, y - 1):
                    mt.px(x, y, MR[4] if y < 12 else MR[3])
    for (x, y) in [(10, 15), (13, 16), (17, 15), (11, 12), (16, 11)]:
        if mt.on(x, y) and mt.on(x, y + 1):
            mt.px(x, y, MR[1])
    ink(mt)
    stamp(mt, 22, 10, ['..ab', 'aaab', 'bbbb', '..ab'], {'a': LIN[4], 'b': LIN[2]})
    ink(mt, skip=lambda x, y: x < 22)
    paste(cv, mt, 0, 0)
    # a drip of fat falls into the fire and flares
    ph = (t % 20) / 20.0
    if ph < 0.4:
        cv.px(14, 18 + int(ph * 15), GO[4])
    elif ph < 0.55:
        cv.px(13, 21, FI[4])
        cv.px(15, 20, FI[3])
        cv.px(14, 19, FI[2])


def build_campfires():
    N = 40
    for key, food in (('world/anim/campfire_sheet', False), ('world/anim/campfire_with_food_sheet', True)):
        sh = Canvas(160, 256)
        for i in range(N):
            paste(sh, campfire_frame(i, N, food), (i % 5) * 32, (i // 5) * 32)
        sh.save(key)


# ---------------------------------------------------------------------------- torch
def torch_frame(t, N, lit=True):
    w = h = 32
    cv = Canvas(w, h)
    # wall plate with rivets, an arm, and a ring around the shaft
    pl = Canvas(w, h)
    pl.rect(13, 18, 7, 6, IR[1])
    pl.hline(13, 19, 18, IR[2])
    pl.vline(13, 18, 23, IR[2])
    for (x, y) in [(14, 19), (18, 19), (14, 22), (18, 22)]:
        pl.px(x, y, IR[3])
    ink(pl)
    paste(cv, pl, 0, 0)
    sh = Canvas(w, h)
    sh.rect(15, 12, 3, 13, WD[2])
    sh.vline(15, 12, 24, WD[3])
    sh.vline(17, 12, 24, WD[1])
    sh.px(16, 20, WD[1])
    sh.px(16, 14, WD[3])
    ink(sh)
    paste(cv, sh, 0, 0)
    rg = Canvas(w, h)
    rg.rect(14, 15, 5, 2, IR[2])
    rg.hline(14, 18, 15, IR[3])
    ink(rg)
    paste(cv, rg, 0, 0)
    # flared iron cup with a pitch-soaked wrap
    cp = Canvas(w, h)
    cp.poly([(12.5, 9.0), (20.5, 9.0), (18.5, 12.6), (14.5, 12.6)], IR[2])
    cp.hline(13, 19, 9, IR[3])
    cp.px(13, 10, IR[3])
    cp.px(14, 11, IR[3])
    cp.px(18, 10, IR[1])
    cp.px(19, 10, IR[1])
    cp.px(16, 10, IR[1])
    cp.px(16, 11, IR[1])
    ink(cp)
    paste(cv, cp, 0, 0)
    if not lit:
        for x in range(14, 19):
            cv.px(x, 9, R['cloth_brown'][1])
        return cv
    for x in range(14, 19):
        k = 0.5 + 0.5 * math.sin(TAU * t / N * 2 + x * 2.1)
        cv.px(x, 9, EM[4] if k > 0.6 else EM[3])
    tongues = [
        (16.5, 9, 3.4, 10.0, 1.2, 0.0, 1),
        (14.6, 9, 1.8, 6.0, 0.9, 0.33, 2),
        (18.4, 9, 1.8, 6.5, 0.9, 0.66, 2),
        (16.5, 8, 1.6, 8.0, 1.4, 0.5, 3),
    ]
    fl = Canvas(w, h)
    paint_flame(fl, flame_mask(tongues, t, N), 8, boost_rows=0)
    licks(fl, t, N, [(16.0, 0.5, 6, 0, 3, 1.2, 0.6), (17.0, 2.0, 3, 1, 2, 0.9, -0.5)])
    paste(cv, fl, 0, 0)
    sparks(cv, t, N, [(16.0, 3.0, 6, 2, 3, 1.0)])
    return cv


def build_torch():
    N = 6
    sh = Canvas(192, 128)
    for i in range(N):
        paste(sh, torch_frame(i, N), i * 32, 32)
        paste(sh, torch_frame(i, N), i * 32, 96)
    sh.save('world/torch')


# ---------------------------------------------------------------------------- the smithy furnace
def ashlar(cv, mask_fn, r, seed, bw=8, bh=5, x0=0, y0=0):
    """Fill mask with dressed stone blocks (offset courses), each block lit on its top-left."""
    for y in range(cv.h):
        for x in range(cv.w):
            if not mask_fn(x, y):
                continue
            row = (y - y0) // bh
            off = (bw // 2) * (row % 2)
            bx = (x - x0 + off) // bw
            lx = (x - x0 + off) % bw
            ly = (y - y0) % bh
            v = hsh(bx, row, seed)
            base = 2 if v < 0.7 else (3 if v < 0.85 else 1)
            if ly == bh - 1 or lx == bw - 1:
                c = r[0] if ly == bh - 1 and lx == bw - 1 else r[1]
            elif ly == 0 or lx == 0:
                c = r[min(4, base + 1)]
            else:
                c = r[base]
                if hsh(x, y, seed) < 0.06:
                    c = r[max(1, base - 1)]
            cv.px(x, y, c)


def furnace_frame(t, N, cold=False):
    """The smithy forge. cold=True is the dead forge before the Hearthstone comes home:
    grey ash, a few dull embers, soot round the arch, no flame and no smoke."""
    w = h = 64
    cv = Canvas(w, h)
    S = ST
    B = R['brick']
    SOOT = OUTLINE_SOFT
    flick = 0.5 + 0.35 * math.sin(TAU * t / N) + 0.15 * math.sin(TAU * 3 * t / N + 1)
    if not cold:
        sm = Canvas(w, h)
        smoke(sm, t, N, [(32.0, 6.0, 6, 0, 7, -2.0, 2.0), (31.0, 6.0, 6, 3, 7, 1.5, 1.6)])
        paste(cv, sm, 0, 0)
    body = Canvas(w, h)

    def in_body(x, y):
        xc = x + 0.5
        if 34 <= y <= 63:
            return 9 <= xc <= 55
        if 20 <= y < 34:
            k = (y - 20) / 14.0
            return lerp(24, 13, k) <= xc <= lerp(40, 51, k)
        if 7 <= y < 20:
            return 25 <= xc <= 39
        return False
    ashlar(body, in_body, S, 7, 8, 5, 1, 4)
    body.rect(23, 5, 18, 3, S[2])
    body.hline(23, 40, 5, S[4])
    body.hline(23, 40, 7, S[1])
    body.rect(8, 33, 49, 2, S[2])
    body.hline(8, 56, 33, S[4])
    body.hline(8, 56, 34, S[1])
    for y in range(h):
        for x in range(w):
            c = body.get(x, y)
            if body.on(x, y) and x > 47 and c in S and c != S[0]:
                body.px(x, y, S[max(0, S.index(c) - 1)])
    mcx, mtop, mbot = 32.0, 38.0, 56
    rad = 9.5

    def in_mouth(x, y, grow=0.0):
        xc, yc = x + 0.5, y + 0.5
        if yc > mbot + 0.5:
            return False
        if yc >= mtop + rad:
            return abs(xc - mcx) <= rad + grow
        return (xc - mcx) ** 2 + (yc - (mtop + rad)) ** 2 <= (rad + grow) ** 2
    # brick voussoirs ringing the arch: fire-lit when burning, sooted when cold
    for y in range(h):
        for x in range(w):
            if in_mouth(x, y, 3.0) and not in_mouth(x, y) and y <= mbot:
                ang = math.atan2(y + 0.5 - (mtop + rad), x + 0.5 - mcx)
                seg = int((ang + math.pi) / (math.pi / 9))
                d = math.hypot(x + 0.5 - mcx, y + 0.5 - (mtop + rad))
                edge = (int(d) == int(rad + 2.9)) or (abs(((ang + math.pi) / (math.pi / 9)) % 1) < 0.12)
                c = B[1] if edge else (B[3] if seg % 2 else B[2])
                if d < rad + 1.2:
                    c = mix(B[1], SOOT, 0.45) if cold else mix(B[3], FI[3], 0.25 + 0.15 * flick)
                elif cold and y < mtop + rad:
                    c = mix(c, SOOT, 0.3)
                body.px(x, y, c)
    for y in range(h):
        for x in range(w):
            if in_mouth(x, y):
                body.px(x, y, R['stone_cave'][0])
    if cold:
        # a soot plume licked up the stone above the arch, heaviest at the arch
        for y in range(24, int(mtop) + 3):
            for x in range(18, 47):
                c = body.get(x, y)
                if not body.on(x, y) or in_mouth(x, y):
                    continue
                hw_ = 3.0 + (y - 24) * 0.5 + (1 if hsh(y, 41) < 0.4 else 0)
                k = 1 - abs(x + 0.5 - mcx) / hw_
                if k <= 0:
                    continue
                up = (y - 24) / (mtop - 24)
                amt = 0.5 if (k > 0.45 and up > 0.35) else 0.3
                body.px(x, y, mix(c, SOOT, amt))
    else:
        for y in range(30, 62):
            for x in range(8, 57):
                c = body.get(x, y)
                if not body.on(x, y) or in_mouth(x, y, 3.0):
                    continue
                d = math.hypot(x + 0.5 - mcx, (y + 0.5 - 50) * 1.3)
                k = max(0, 1 - (d - 12) / (10 + 3 * flick))
                if k > 0 and c in S:
                    body.px(x, y, mix(c, EM[3], 0.38 * k))
    # hearth ledge
    body.rect(18, 57, 29, 3, S[2])
    body.hline(18, 46, 57, S[3] if cold else mix(S[4], EM[4], 0.35 + 0.2 * flick))
    body.hline(18, 46, 59, S[1])
    if cold:
        for x in range(22, 43):
            if hsh(x, 57, 5) < 0.45:
                body.px(x, 57, S[1] if x % 3 else S[2])
    ink(body, sel_dark)
    paste(cv, body, 0, 0)
    fl = Canvas(w, h)
    if cold:
        # grey ash heaped in the hearth, two charred stubs, a few dull embers
        for x in range(22, 43):
            for y in range(51, 57):
                if not in_mouth(x, y):
                    continue
                top = 53 + abs(x + 0.5 - mcx) * 0.22 + (1 if hsh(x, 3) < 0.3 else 0)
                if y >= top:
                    fl.px(x, y, S[2] if (y == int(top) and hsh(x, y) < 0.6) else (S[1] if (x + y) % 3 else R['stone_cave'][2]))
        for (x0, y0, x1, y1) in [(25, 54, 31, 52), (33, 53, 39, 55)]:
            fl.line(x0, y0, x1, y1, SOOT)
            fl.line(x0, y0 - 1, x1, y1 - 1, R['stone_cave'][1])
        DULL = hexc('#5a2a1a')
        for (x, y) in [(30, 54), (35, 55), (28, 55)]:
            fl.px(x, y, DULL)
        paste(cv, fl, 0, 0)
    else:
        for y in range(int(mtop), mbot + 1):
            for x in range(w):
                if in_mouth(x, y):
                    dd = (mbot - y) / (mbot - mtop)
                    if dd < 0.5 and dither(x, y, 0.5 - dd):
                        fl.px(x, y, EM[1])
        for x in range(23, 42):
            for y in range(52, 57):
                if in_mouth(x, y) and (y - 52) + abs(x + 0.5 - mcx) * 0.25 > 1.0:
                    k = 0.5 + 0.5 * math.sin(TAU * (t / N) * 2 + x * 1.9 + y * 2.3)
                    fl.px(x, y, EM[4] if k > 0.75 else (EM[3] if k > 0.35 else EM[2]))
        tongues = [
            (32.0, 53, 4.0, 11.0, 1.8, 0.0, 1),
            (27.0, 54, 2.8, 8.0, 1.3, 0.33, 2),
            (37.0, 54, 2.8, 8.5, 1.3, 0.66, 2),
            (24.5, 55, 1.6, 4.5, 0.8, 0.2, 3),
            (39.5, 55, 1.6, 4.5, 0.8, 0.7, 3),
        ]
        fm = flame_mask(tongues, t, N)
        fm = {k: v for k, v in fm.items() if in_mouth(k[0], k[1])}
        paint_flame(fl, fm, 53)
        paste(cv, fl, 0, 0)
    # bellows on the left, nozzle into the side
    bl = Canvas(w, h)
    bl.poly([(1, 47), (10, 44), (10, 56), (1, 54)], LEA[2])
    for y in range(h):
        for x in range(w):
            if bl.on(x, y):
                c = LEA[2] if (x % 3) else LEA[1]
                if y < 48 and x < 6:
                    c = LEA[3]
                bl.p[x, y] = c
    bl.rect(0, 44, 11, 2, WD[3])
    bl.rect(0, 55, 11, 2, WD[2])
    bl.rect(10, 49, 3, 2, IR[2])
    bl.px(10, 49, IR[3])
    bl.rect(0, 42, 2, 3, WD[2])
    ink(bl)
    paste(cv, bl, 0, 0)
    # tongs hung on the right, a quench bucket below
    tg = Canvas(w, h)
    tg.px(58, 36, IR[3])
    tg.line(57, 37, 56, 49, IR[2])
    tg.line(59, 37, 60, 49, IR[2])
    tg.px(57, 38, IR[3])
    tg.px(56, 50, IR[1])
    tg.px(60, 50, IR[1])
    ink(tg)
    paste(cv, tg, 0, 0)
    bk = Canvas(w, h)
    bk.poly([(53.5, 55), (62.5, 55), (61.5, 63.5), (54.5, 63.5)], WD[2])
    for y in range(55, 64):
        for x in range(53, 63):
            if bk.on(x, y):
                bk.px(x, y, WD[cyl((x - 53.5) / 9.0)])
    bk.hline(54, 62, 57, IR[2])
    bk.hline(54, 61, 61, IR[2])
    bk.hline(54, 62, 55, R['water'][3])
    bk.px(55, 55, R['water'][4])
    ink(bk)
    paste(cv, bk, 0, 0)
    if not cold:
        sparks(cv, t, N, [(31.0, 6.0, 6, 0, 5, 1.0), (33.0, 6.0, 3, 1, 4, -1.0)])
    return cv


# ---------------------------------------------------------------------------- the sawmill bench
# dull steel for the saw: no white, so the blade never outshines the forge
SAW = [IR[0], IR[1], IR[2], mix(IR[2], IR[3], 0.5), IR[3]]


def saw_blade(cv, cx, cy, rad, rot, teeth=16, r=SAW):
    b = Canvas(cv.w, cv.h)
    for y in range(int(cy - rad - 2), int(cy + rad + 3)):
        for x in range(int(cx - rad - 2), int(cx + rad + 3)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            a = math.atan2(dy, dx)
            tooth = (((a - rot) / TAU * teeth) % 1.0)
            if d > rad + 1.0:
                continue
            if d > rad - 0.6 and tooth > 0.55:
                continue
            i = 2
            if d > rad - 1.6:
                i = 4 if tooth < 0.3 else 3
            elif d > rad - 2.6:
                i = 1
            else:
                s = -(dx * 0.7 + dy * 0.75) / max(1.0, d)
                if s > 0.5 and rad * 0.3 < d < rad * 0.8:
                    i = 3
                elif s < -0.5:
                    i = 1
            if d < 2.4:
                i = 1
            b.px(x, y, r[i])
    for k in range(3):
        a0 = rot + k * TAU / 3
        for j in range(4):
            a = a0 + j * 0.12
            b.px(int(cx + math.cos(a) * rad * 0.62), int(cy + math.sin(a) * rad * 0.62), r[1])
    b.ellipse(cx, cy, 1.6, 1.6, IR[2])
    b.px(int(cx) - 1, int(cy) - 1, IR[3])
    ink(b)
    paste(cv, b, 0, 0)


def spoked_wheel(cv, cx, cy, rad, rot, spokes=6, r=WD):
    wh = Canvas(cv.w, cv.h)
    for y in range(int(cy - rad - 1), int(cy + rad + 2)):
        for x in range(int(cx - rad - 1), int(cx + rad + 2)):
            d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            if rad - 2.2 <= d <= rad:
                lit = (x + 0.5 - cx) + (y + 0.5 - cy) < 0
                wh.px(x, y, r[3] if lit else r[2])
    for k in range(spokes):
        a = rot + k * TAU / spokes
        for i in range(int(rad - 1)):
            wh.px(int(cx + math.cos(a) * i), int(cy + math.sin(a) * i), r[2])
    wh.ellipse(cx, cy, 1.6, 1.6, IR[2])
    ink(wh)
    paste(cv, wh, 0, 0)


def sawmill_frame(t, N):
    w = h = 64
    cv = Canvas(w, h)
    # sawdust heap under the saw table
    heap = Canvas(w, h)
    heap.ellipse(22.0, 64.0, 12.0, 5.0, WP[3])
    for y in range(h):
        for x in range(w):
            if heap.on(x, y):
                heap.px(x, y, WP[4] if (x + y * 2) % 5 == 0 else (WP[3] if y < 62 else WP[2]))
    ink(heap, sel_dark)
    paste(cv, heap, 0, 0)
    # drive wheel and the belt running up into the saw table
    rot = TAU * (t / N) / 6 * 2
    spoked_wheel(cv, 47.0, 53.0, 9.0, rot, 6)
    bx0, by0, bx1, by1 = 21.0, 45.0, 47.0, 53.0
    for (oy0, oy1) in ((-2.5, -9.0), (2.5, 9.0)):
        n = 30
        for i in range(n + 1):
            u = i / n
            x = lerp(bx0, bx1, u)
            y = lerp(by0 + oy0, by1 + oy1, u)
            dash = ((i + t * (1 if oy0 < 0 else -1) * 2) % 5) == 0
            cv.px(int(x), int(y), LEA[1] if dash else LEA[2])
    # the blade, sunk in the table: only its top arc rises through the slot
    srot = TAU * (t / N) * (2.0 / 14)
    saw_blade(cv, 21.0, 45.5, 10.0, srot, 14)
    # trestles, table top, and a boarded skirt that hides the rest of the blade
    bn = Canvas(w, h)
    for (lx, rx_) in ((5, 14), (48, 57)):
        bn.line(lx, 63, (lx + rx_) // 2, 43, WD[2])
        bn.line(lx + 1, 63, (lx + rx_) // 2 + 1, 43, WD[3])
        bn.line(rx_, 63, (lx + rx_) // 2, 43, WD[1])
        bn.line(rx_ + 1, 63, (lx + rx_) // 2 + 1, 43, WD[2])
    bn.rect(7, 42, 30, 15, WD[1])
    for x in range(7, 37):
        if (x - 7) % 6 == 0:
            bn.vline(x, 42, 56, WD[0])
        elif (x - 7) % 6 == 1:
            bn.vline(x, 42, 56, WD[2])
    bn.hline(7, 36, 56, WD[0])
    bn.hline(8, 35, 49, WD[2])
    bn.rect(19, 45, 4, 3, IR[1])
    bn.px(19, 45, IR[2])
    bn.rect(2, 40, 60, 3, WD[2])
    bn.hline(2, 61, 40, WD[4])
    bn.hline(2, 61, 42, WD[1])
    for x in range(6, 60, 11):
        bn.px(x, 41, WD[1])
    ink(bn)
    paste(cv, bn, 0, 0)
    # the log being fed in from the right, biting into the blade
    lg = Canvas(w, h)
    lg.rect(28, 33, 34, 7, WD[2])
    for y in range(33, 40):
        for x in range(28, 62):
            u = (y - 33) / 6.0
            i = 4 if u < 0.15 else (3 if u < 0.35 else (2 if u < 0.7 else 1))
            if hsh(x // 2, y, 3) < 0.12:
                i = max(0, i - 1)
            lg.px(x, y, WD[i])
    for x in range(31, 62, 5):
        lg.px(x, 35 + (x % 2), WD[1])
        lg.px(x + 1, 35 + (x % 2), WD[1])
    ink(lg)
    lg.vline(28, 34, 38, WP[3])
    lg.vline(29, 34, 38, WP[2])
    paste(cv, lg, 0, 0)
    # sawdust kicked up and back off the teeth
    for k in range(7):
        P = 6
        ph = ((t + k * 0.85) % P) / P
        a = math.radians(205 + k * 9)
        sp = 4 + ph * 13
        x = 25 + math.cos(a) * sp
        y = 36 + math.sin(a) * sp * 0.7 + ph * ph * 10
        if 0 <= x < w and 0 <= y < h:
            cv.px(int(x), int(y), WP[4] if k % 2 else WP[3])
    return cv


def build_forge_sawmill():
    """Row 0: six lit forge frames, then the cold forge at column 6. Row 1: the sawmill."""
    N = 6
    sh = Canvas(448, 128)
    for i in range(N):
        paste(sh, furnace_frame(i, N), i * 64, 0)
        paste(sh, sawmill_frame(i, N), i * 64, 64)
    paste(sh, furnace_frame(0, N, cold=True), 6 * 64, 0)
    sh.save('world/forge_sawmill')
    old = os.path.join(ASSETS, 'world', 'furnace_and_sawmill.png')
    if os.path.exists(old):
        os.remove(old)


# ---------------------------------------------------------------------------- the way home
def portal_frame(t, N):
    w = h = 64
    cv = Canvas(w, h)
    cx, cy = 32.0, 33.5
    rx, ry = 13.5, 22.5
    G = GO
    WH = (255, 251, 236, 255)
    spin = TAU * (t / N) / 3.0      # three arms: a third of a turn per loop
    # ground glow: a pool of light on the floor
    for y in range(56, 64):
        for x in range(4, 60):
            d = ((x + 0.5 - cx) / 26.0) ** 2 + ((y + 0.5 - 61.0) / 3.2) ** 2
            if d <= 1:
                k = 1 - d
                c = G[4] if k > 0.75 else (G[3] if k > 0.45 else G[2])
                if dither(x, y, min(1.0, k * 1.6)):
                    cv.px(x, y, (c[0], c[1], c[2], 200))
    # outer halo, dithered
    for y in range(h):
        for x in range(w):
            e = ((x + 0.5 - cx) / (rx + 3.5)) ** 2 + ((y + 0.5 - cy) / (ry + 3.5)) ** 2
            e0 = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
            if e <= 1 and e0 > 1:
                pulse = 0.5 + 0.5 * math.sin(TAU * t / N + math.atan2(y - cy, x - cx) * 2)
                if dither(x, y, 0.3 + 0.2 * pulse):
                    cv.px(x, y, (G[3][0], G[3][1], G[3][2], 170))
    # the swirl
    for y in range(h):
        for x in range(w):
            nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            rr = math.hypot(nx, ny)
            if rr > 1:
                continue
            ang = math.atan2(ny, nx)
            arm = math.sin(3 * (ang - spin) + rr * 7.5)
            v = (1 - rr) * 1.3 + arm * 0.32
            if rr > 0.84:
                i = 3 if rr < 0.93 else 1
                if rr > 0.84 and arm > 0.6:
                    i = 4
            elif v > 1.05:
                i = 5
            elif v > 0.7:
                i = 4
            elif v > 0.38:
                i = 3
            else:
                i = 2
            cv.px(x, y, WH if i == 5 else G[i])
    # rim sparkles running round the edge
    for k in range(6):
        a = TAU * k / 6 + TAU * t / N / 2
        x = cx + math.cos(a) * (rx - 0.5)
        y = cy + math.sin(a) * (ry - 0.5)
        cv.px(int(x), int(y), WH)
        cv.px(int(x) + 1, int(y), G[4])
    # motes rising off the portal
    for k in range(8):
        P = 10 if k % 2 else 5
        ph = ((t + k * 1.3) % P) / P
        x = cx + (hsh(k, 1) - 0.5) * 34 + math.sin(ph * TAU + k) * 1.5
        y = 58 - ph * (30 + hsh(k, 2) * 20)
        if ph < 0.9:
            c = WH if ph < 0.35 else (G[4] if ph < 0.7 else G[3])
            cv.px(int(x), int(y), c)
    # standing stones flanking the base, so it rests on the ground
    for (sx, sy, srx, sry, sd) in [(15.5, 60.0, 4.5, 4.0, 1), (48.5, 60.0, 4.5, 4.0, 2), (21.0, 62.5, 3.0, 2.0, 3), (43.0, 62.5, 3.0, 2.0, 4)]:
        s = Canvas(w, h)
        s.ellipse(sx, sy, srx, sry, ST[2])
        s.rect(0, 64, w, 1, CLEAR)
        volume(s, ST, x0=int(sx - srx) - 1, y0=int(sy - sry) - 1, w=int(srx * 2) + 3, h=int(sry * 2) + 3)
        for y in range(h):
            for x in range(w):
                if s.on(x, y) and not s.on(x, y - 1):
                    s.px(x, y, mix(ST[4], G[4], 0.5))
                elif s.on(x, y) and abs(x + 0.5 - cx) < abs(sx - cx) and not s.on(x + (1 if sx < cx else -1), y):
                    s.px(x, y, mix(ST[3], G[3], 0.4))
        ink(s)
        paste(cv, s, 0, 0)
    return cv


def build_portal():
    N = 10
    sh = Canvas(640, 64)
    for i in range(N):
        paste(sh, portal_frame(i, N), i * 64, 0)
    sh.save('world/anim/portal_sheet')


# ---------------------------------------------------------------------------- chests
def chest_frame(frame, gold=False):
    w, h = 24, 20
    cv = Canvas(w, h)
    if gold:
        Wr = [R['cloth_red'][0], R['cloth_red'][1], R['cloth_red'][2], R['cloth_red'][3], R['cloth_orange'][3]]
        Bd = GO
    else:
        Wr = WD
        Bd = IR
    x0, x1 = 2, 21            # body spans these columns
    by0 = 10                  # top of the box
    # inside of the box (seen once the lid lifts)
    if frame > 0:
        ins = Canvas(w, h)
        ins.rect(x0 + 1, by0 - 1, x1 - x0 - 1, 2, Wr[0])
        if frame >= 2:
            for x in range(x0 + 2, x1 - 1):
                ins.px(x, by0 - 1, GO[3] if (x * 3) % 5 < 2 else GO[2])
                ins.px(x, by0 - 2, GO[4] if x % 4 == 1 else (GO[3] if x % 3 == 0 else CLEAR))
            if frame == 3:
                for (x, y) in [(8, by0 - 3), (14, by0 - 3), (11, by0 - 4)]:
                    ins.px(x, y, GO[4])
                ins.px(16, by0 - 3, R['slime_blue'][3])
                ins.px(17, by0 - 3, R['slime_blue'][4])
        paste(cv, ins, 0, 0)
    # lid
    lid = Canvas(w, h)
    if frame == 0:
        top = 3
        lid.rect(x0, top + 2, x1 - x0 + 1, by0 - top - 1, Wr[2])
        lid.rect(x0 + 1, top + 1, x1 - x0 - 1, 1, Wr[2])
        lid.rect(x0 + 2, top, x1 - x0 - 3, 1, Wr[2])
        for y in range(top, by0 + 1):
            for x in range(x0, x1 + 1):
                if lid.on(x, y):
                    u = (y - top) / (by0 - top)
                    i = 4 if u < 0.2 else (3 if u < 0.45 else (2 if u < 0.8 else 1))
                    lid.px(x, y, Wr[i])
        lid.hline(x0, x1, by0, Wr[1])
        for bx in (x0 + 2, x1 - 3):
            for y in range(top, by0 + 1):
                if lid.on(bx, y):
                    lid.px(bx, y, Bd[3] if y < top + 3 else Bd[2])
                    lid.px(bx + 1, y, Bd[2] if y < top + 3 else Bd[1])
        lid.hline(x0, x1, by0, Bd[1])
    elif frame == 1:
        # lid lifted a crack: tilted back, a dark gap at the front
        top = 2
        lid.rect(x0, top + 2, x1 - x0 + 1, 5, Wr[2])
        lid.rect(x0 + 1, top + 1, x1 - x0 - 1, 1, Wr[2])
        lid.rect(x0 + 2, top, x1 - x0 - 3, 1, Wr[2])
        for y in range(top, top + 7):
            for x in range(x0, x1 + 1):
                if lid.on(x, y):
                    u = (y - top) / 6.0
                    i = 4 if u < 0.2 else (3 if u < 0.5 else 2)
                    lid.px(x, y, Wr[i])
        lid.hline(x0, x1, top + 6, Wr[1])
        for bx in (x0 + 2, x1 - 3):
            for y in range(top, top + 7):
                if lid.on(bx, y):
                    lid.px(bx, y, Bd[3] if y < top + 3 else Bd[2])
                    lid.px(bx + 1, y, Bd[2] if y < top + 3 else Bd[1])
    else:
        # lid swung up and back: we see its inner face, foreshortened then upright
        hgt = 5 if frame == 2 else 8
        top = by0 - 1 - hgt
        lid.rect(x0 + 1, top, x1 - x0 - 1, hgt, Wr[1])
        for y in range(top, top + hgt):
            for x in range(x0 + 1, x1):
                i = 1 if (x % 4) else 0
                if y == top:
                    i = 3
                lid.px(x, y, Wr[i])
        for bx in (x0 + 2, x1 - 3):
            lid.vline(bx, top, top + hgt - 1, Bd[1])
            lid.px(bx, top, Bd[3])
        if frame == 3:
            # treasure light on the inner face
            for x in range(x0 + 3, x1 - 2):
                lid.px(x, top + hgt - 1, mix(Wr[2], GO[3], 0.5))
    ink(lid)
    paste(cv, lid, 0, 0)
    # box
    bx_ = Canvas(w, h)
    bx_.rect(x0, by0, x1 - x0 + 1, h - by0, Wr[2])
    for y in range(by0, h):
        for x in range(x0, x1 + 1):
            u = (y - by0) / (h - 1 - by0)
            i = 3 if u < 0.15 else (2 if u < 0.75 else 1)
            if (y - by0) % 4 == 3:
                i = 1
            bx_.px(x, y, Wr[i])
    bx_.vline(x0 + 1, by0, h - 1, Wr[3])
    for bx in (x0 + 2, x1 - 3):
        for y in range(by0, h):
            bx_.px(bx, y, Bd[2])
            bx_.px(bx + 1, y, Bd[1])
        bx_.px(bx, by0, Bd[3])
    bx_.hline(x0, x1, by0, Bd[3] if frame else Bd[2])
    bx_.hline(x0, x1, h - 2, Bd[1])
    # corner caps
    for (cx_, cy_) in [(x0, by0), (x1, by0), (x0, h - 2), (x1, h - 2)]:
        bx_.px(cx_, cy_, Bd[3])
    # lock plate (hasp hangs from the lid when shut)
    lx = (x0 + x1) // 2 - 1
    if frame == 0:
        stamp(bx_, lx - 1, by0 - 2, ['abba', 'abbc', 'bddc', 'abbc', '.cc.'], {'a': Bd[4], 'b': Bd[3], 'c': Bd[1], 'd': OUTLINE})
    else:
        stamp(bx_, lx - 1, by0 + 1, ['abbc', 'bddc', '.cc.'], {'a': Bd[4], 'b': Bd[3], 'c': Bd[1], 'd': OUTLINE})
    if gold:
        bx_.px(lx, by0 + (0 if frame == 0 else 1), R['slime_blue'][4])
    ink(bx_)
    paste(cv, bx_, 0, 0)
    if frame == 1:
        # the dark gap under the lifted lid
        for x in range(x0 + 1, x1):
            if cv.get(x, by0 - 1) != OUTLINE or True:
                cv.px(x, by0 - 1, Wr[0])
        cv.hline(x0, x1, by0 - 2, OUTLINE)
    return cv


def build_chest():
    sh = Canvas(96, 40)
    for row, gold in ((0, False), (1, True)):
        for f in range(4):
            paste(sh, chest_frame(f, gold), f * 24, row * 20)
    sh.save('world/chest')


# ---------------------------------------------------------------------------- ore lumps
def ore_rock(seed, pts):
    w = h = 64
    rk = facet_rock(w, h, pts, ST, seed, mossy=0.0, nseeds=8)
    # re-ink with the shared outline so the lump pops off the cave wall
    for (x, y) in edges(rk):
        rk.p[x, y] = OUTLINE
    return rk


def p_ore_gold():
    w = h = 64
    pts = [(17.5, 61.0), (16.0, 52.0), (19.0, 44.0), (25.0, 38.0), (31.0, 35.5), (38.0, 37.0), (44.0, 42.0), (47.5, 49.0), (48.0, 56.0), (46.5, 61.0)]
    cv = ore_rock(3, pts)
    vein = [(20, 56), (24, 52), (28, 49), (31, 46), (35, 43), (39, 40), (43, 44), (45, 49)]
    for (a, b) in zip(vein, vein[1:]):
        for i in range(8):
            u = i / 7.0
            x, y = int(round(lerp(a[0], b[0], u))), int(round(lerp(a[1], b[1], u)))
            if cv.get(x, y) not in (OUTLINE, CLEAR):
                cv.px(x, y, GO[3])
                if cv.get(x, y + 1) not in (OUTLINE, CLEAR):
                    cv.px(x, y + 1, GO[1])
    nug = [
        (22, 51, ['.ab.', 'abbc', 'bbcc', '.cd.']),
        (29, 45, ['..ab..', '.abbc.', 'abbbcc', 'bbbccd', '.bccd.']),
        (37, 40, ['.ab', 'abc', 'bcd']),
        (40, 51, ['.ab.', 'abbc', '.ccd']),
        (26, 40, ['ab', 'bc']),
        (33, 55, ['.ab', 'abc', '.cd']),
    ]
    for (x, y, rows) in nug:
        stamp(cv, x, y, rows, {'a': GO[4], 'b': GO[3], 'c': GO[2], 'd': GO[1]})
    for (x, y) in [(30, 45), (22, 51), (41, 51), (37, 40)]:
        cv.px(x, y, (255, 255, 240, 255))
    for (x, y, c) in [(14, 61, ST[2]), (15, 61, ST[1]), (49, 61, ST[2]), (50, 61, ST[1]), (51, 61, ST[1])]:
        cv.px(x, y, c)
    for x in range(13, 53):
        if cv.on(x, 61) and not cv.on(x, 62):
            cv.px(x, 62, OUTLINE)
    return cv


def crystal(cv, bx, by, ln, ang, wid, r):
    """A hexagonal prism pointing along ang (radians, 0 = right, -pi/2 = up): lit and shaded faces."""
    c = Canvas(cv.w, cv.h)
    dx, dy = math.cos(ang), math.sin(ang)
    nx, ny = -dy, dx
    tip = (bx + dx * ln, by + dy * ln)
    sh = ln - wid * 1.1
    p1 = (bx + nx * wid, by + ny * wid)
    p2 = (bx + nx * wid + dx * sh, by + ny * wid + dy * sh)
    p3 = (bx - nx * wid + dx * sh, by - ny * wid + dy * sh)
    p4 = (bx - nx * wid, by - ny * wid)
    c.poly([p1, p2, tip, p3, p4], r[2])
    for y in range(c.h):
        for x in range(c.w):
            if not c.on(x, y):
                continue
            px_, py_ = x + 0.5 - bx, y + 0.5 - by
            s = px_ * nx + py_ * ny          # across the prism
            along = px_ * dx + py_ * dy
            lit_side = (nx * -0.7 + ny * -0.75) > 0
            left = s > 0 if lit_side else s < 0
            i = 3 if left else 2
            if abs(s) < 0.6:
                i = 4
            if along > sh:
                i = 4 if left else 3
            c.p[x, y] = r[i]
    ink(c, r[0])
    paste(cv, c, 0, 0)


def p_ore_diamond():
    w = h = 64
    pts = [(16.5, 61.0), (15.5, 54.0), (18.0, 47.0), (23.0, 43.0), (30.0, 41.5), (37.0, 42.0), (44.0, 45.0), (48.5, 52.0), (48.0, 61.0)]
    cv = ore_rock(9, pts)
    BL = R['slime_blue']
    for (bx, by, ln, deg, wid) in [(27.0, 47.0, 14.0, -112, 2.6), (35.0, 46.0, 18.0, -82, 3.2), (42.0, 50.0, 11.0, -45, 2.4),
                                   (21.0, 52.0, 9.0, -150, 2.0), (31.0, 49.0, 8.0, -98, 1.8)]:
        crystal(cv, bx, by, ln, math.radians(deg), wid, BL)
    for (x, y) in [(34, 32), (26, 37), (35, 31), (42, 43)]:
        cv.px(x, y, (255, 255, 255, 255))
    # small chips of crystal in the rock face
    for (x, y) in [(22, 56), (39, 57), (44, 55)]:
        cv.px(x, y, BL[3])
        cv.px(x + 1, y, BL[2])
        cv.px(x, y - 1, BL[4])
    for (x, y, c) in [(13, 61, ST[2]), (14, 61, ST[1]), (49, 61, ST[2]), (50, 61, ST[1])]:
        cv.px(x, y, c)
    for x in range(12, 52):
        if cv.on(x, 61) and not cv.on(x, 62):
            cv.px(x, 62, OUTLINE)
    return cv


def build_ores():
    sh = Canvas(128, 128)
    paste(sh, p_ore_gold(), 0, 64)
    paste(sh, p_ore_diamond(), 64, 64)
    sh.save('world/ores')


def fruit_pile(cv, items, r, rad=2.3, stems=True):
    """Fruit drawn back to front on one layer and outlined once, so a pile reads as a pile."""
    f = Canvas(cv.w, cv.h)
    for (x, y) in items:
        for yy in range(int(y - rad - 1), int(y + rad + 2)):
            for xx in range(int(x - rad - 1), int(x + rad + 2)):
                dx, dy = xx + 0.5 - x, yy + 0.5 - y
                d2 = dx * dx + dy * dy
                if d2 > rad * rad:
                    continue
                c = r[2]
                if dx + dy > rad * 0.75:
                    c = r[1]
                elif dx + dy < -rad * 0.55:
                    c = r[3]
                f.px(xx, yy, c)
        f.px(int(x - rad * 0.45), int(y - rad * 0.45), r[4])
    ink(f)
    if stems:
        for (x, y) in items[-3:]:
            f.px(int(x), int(y - rad) - 0, WD[1])
    paste(cv, f, 0, 0)


def bez(p0, p1, p2, u):
    return ((1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * p1[0] + u * u * p2[0],
            (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * p1[1] + u * u * p2[1])


def stone_wing(w, h, p0, p1, p2, side, r=ST, nf=7):
    """A raised wing: a covert band along the leading edge and long feathers hanging from it.
    side = -1 for the wing on the left of the figure, +1 for the right."""
    cv = Canvas(w, h)
    feathers = []
    for k in range(nf):
        u = 0.18 + 0.82 * k / (nf - 1)
        bx, by = bez(p0, p1, p2, u)
        tilt = math.radians(lerp(2, 16, u)) * side
        ln = lerp(11, 21, u)
        ex, ey = bx + math.sin(tilt) * ln, by + math.cos(tilt) * ln
        feathers.append((u, bx, by, ex, ey))
    for (u, bx, by, ex, ey) in reversed(feathers):
        f = Canvas(w, h)
        f.thick(bx, by, ex, ey, 4.6 - u * 0.8, r[2])
        for y in range(h):
            for x in range(w):
                if not f.on(x, y):
                    continue
                c = r[2]
                if not f.on(x - 1, y):
                    c = r[3]
                if not f.on(x + 1, y):
                    c = r[1]
                if y > ey - 1.5 and not f.on(x, y + 1):
                    c = r[1]
                f.p[x, y] = c
        ink(f, r[1])
        paste(cv, f, 0, 0)
    # covert band
    band = Canvas(w, h)
    for i in range(40):
        u = i / 39.0
        x, y = bez(p0, p1, p2, u)
        band.ellipse(x, y + 1.5, 3.2 - u * 1.2, 3.2 - u * 1.2, r[2])
    for y in range(h):
        for x in range(w):
            if not band.on(x, y):
                continue
            c = r[3] if side < 0 else r[2]
            if not band.on(x, y - 1) or not band.on(x, y - 2):
                c = r[4]
            if not band.on(x, y + 1):
                c = r[1]
            band.p[x, y] = c
    # scallops along the covert band's lower edge
    for i in range(1, 9):
        u = i / 9.0
        x, y = bez(p0, p1, p2, u)
        x, y = int(x), int(y + 3.2 - u * 1.0)
        if band.on(x, y):
            band.px(x, y, r[1])
            band.px(x + side, y - 1, r[1])
    paste(cv, band, 0, 0)
    ink(cv, sel_dark)
    return cv


# ---------------------------------------------------------------------------- sheets
DECOR = {
    'crates': (34, 0, 27, 32), 'crate': (2, 16, 27, 16), 'barrel': (73, 14, 15, 18), 'barrels': (98, 14, 29, 18),
    'stumpAxe': (231, 11, 21, 21), 'fruitTable': (267, 34, 39, 30), 'tentPot': (0, 57, 95, 71), 'logs': (201, 75, 47, 21),
    'basket': (328, 81, 17, 15), 'tomb1': (197, 104, 23, 24), 'tomb2': (229, 104, 21, 24), 'tombCross': (293, 101, 21, 27),
    'tombBroken': (321, 106, 28, 22), 'reeds': (288, 139, 64, 53), 'brickWall': (359, 141, 50, 51),
    'scarecrow': (300, 197, 40, 59), 'pumpkin1': (359, 209, 19, 15), 'pumpkin2': (394, 213, 14, 11),
    'pumpkinPile': (361, 228, 48, 28), 'rocksBig1': (4, 280, 88, 40), 'rocksMid1': (36, 237, 52, 19),
    'laundry': (27, 354, 106, 62), 'bushG': (3, 424, 57, 24), 'bushG2': (64, 431, 32, 17), 'fernG': (98, 432, 28, 16),
    'bushY': (3, 456, 57, 24), 'tuft1': (9, 155, 19, 5), 'tuft2': (36, 155, 12, 5), 'tuft3': (73, 155, 12, 5),
    'tuft4': (105, 155, 19, 5), 'tuft5': (8, 216, 18, 8),
}


def sheet_of(size, rects):
    sh = Canvas(*size)
    for name, (x, y, w, h) in rects.items():
        pc = globals()['p_' + name](w, h)
        assert (pc.w, pc.h) == (w, h), name
        paste(sh, pc, x, y)
    return sh


def build():
    out = []

    def put(cv, key):
        cv.save(key)
        out.append(key)
    put(sheet_of((416, 544), DECOR), 'world/decor')
    put(sheet_of((224, 128), {'potPlant1': (36, 7, 23, 25), 'potPlant2': (37, 36, 21, 28), 'potSmall': (71, 48, 18, 16)}), 'world/garden_decorations')
    put(sheet_of((192, 64), {'sunflowers': (163, 21, 27, 43)}), 'world/alchemy_decor')
    put(sheet_of((64, 64), {'angel': (0, 0, 64, 64)}), 'world/angel_statue')
    put(sheet_of((64, 64), {'smallTent': (0, 0, 64, 64)}), 'world/small_tent')
    # wheat.png: the farm plants two crop clumps (cells 3 and 4) and the sack pile (cell 6)
    put(sheet_of((256, 32), {'wheat': (96, 0, 32, 32), 'wheat2': (128, 0, 32, 32), 'sacks': (192, 0, 32, 32)}), 'world/wheat')
    put(sheet_of((96, 32), {'tallGrass': (0, 0, 96, 32)}), 'world/tall_grass')
    build_forge_sawmill()
    build_campfires()
    build_torch()
    build_portal()
    build_chest()
    build_ores()
    out += ['world/forge_sawmill', 'world/anim/campfire_sheet', 'world/anim/campfire_with_food_sheet',
            'world/torch', 'world/anim/portal_sheet', 'world/chest', 'world/ores']
    return out


if __name__ == '__main__':
    build()
