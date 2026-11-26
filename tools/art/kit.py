"""Hollowbound art kit: the shared palette and pixel tools every art module draws with.

All of Hollowbound's art is drawn by code in tools/art/ (no outside sprite packs). Run
`python tools/art/build.py` to repaint everything into assets/.

STYLE GUIDE (keep every module consistent)
- Native 1x pixel art. The game renders at 480x270 and scales up with nearest-neighbour.
- Light comes from the upper left. Every form gets 3-5 tones from one RAMP: deep shade,
  shade, base, light, highlight. Shadows shift cool (toward violet), highlights warm (toward yellow).
- Outlines: 1px. Characters and pickups use OUTLINE (warm near-black violet) on the outside;
  big scenery (trees, houses, rocks) uses the darkest tone of its own ramp ("selective outline")
  so it sits back from the characters. Never pure black, never anti-aliased blur.
- No smooth gradients: skies band in flat steps, soft edges use ordered dither (dither()).
- Saturation: town is warm and bright; the cave is dark, cool, and lit by firelight. Props that
  live in both should read on both.
- Characters face LEFT in their sheets (the engine mirrors them).
"""
import math
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', '..', 'assets'))


def hexc(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def ramp(*hexes):
    return [hexc(h) for h in hexes]


CLEAR = (0, 0, 0, 0)
OUTLINE = hexc('#1c1420')
OUTLINE_SOFT = hexc('#2e2230')

# Every ramp runs darkest -> lightest. Use r[0] for deep shade/selective outline, r[-1] for highlight.
RAMPS = {
    # people
    'skin_pale':   ramp('#7a4a48', '#b87a6a', '#e8b49a', '#f6d2b8', '#fff0de'),
    'skin_tan':    ramp('#6a3e32', '#a8684c', '#d69a72', '#ecbc92', '#f8dcb8'),
    'skin_brown':  ramp('#4a2a26', '#7a4634', '#a86a4a', '#c88e66', '#e0b088'),
    'skin_dark':   ramp('#2e1a1e', '#4e2e2a', '#6e4434', '#8e5e46', '#ac7c5e'),
    'skin_zombie': ramp('#283028', '#465440', '#6a7a5a', '#8e9c74', '#b2bc94'),
    'skin_ghost':  ramp('#3a4a6a', '#6a84a8', '#9cb8d8', '#c8def0', '#eef8ff'),
    'skin_devil':  ramp('#3a1018', '#6e1e22', '#a8322c', '#d0523a', '#ec8456'),
    'hair_brown':  ramp('#2a1610', '#4a2a18', '#6e4224', '#925e34', '#b07e4c'),
    'hair_black':  ramp('#121018', '#22202e', '#363244', '#4c485e', '#666078'),
    'hair_blond':  ramp('#6a4a1e', '#a07830', '#d0a848', '#ecd070', '#fff0a8'),
    'hair_red':    ramp('#4a1410', '#7e2a18', '#b04a24', '#d87030', '#f09a4c'),
    'hair_grey':   ramp('#3a3640', '#605a66', '#8a8490', '#b4b0b8', '#dcdae0'),
    'hair_white':  ramp('#6a6878', '#9a98a8', '#c4c2d0', '#e4e2ec', '#ffffff'),
    # cloth
    'cloth_blue':   ramp('#141a3a', '#22306a', '#34509a', '#4a72c0', '#7aa0e0'),
    'cloth_navy':   ramp('#10122a', '#1c2248', '#2a3466', '#3c4a86', '#5a6aa8'),
    'cloth_green':  ramp('#142414', '#24401e', '#3a6028', '#5a8634', '#86ae4a'),
    'cloth_red':    ramp('#2a0c12', '#5a1418', '#8e2220', '#c03a26', '#e0663a'),
    'cloth_purple': ramp('#1e1030', '#382056', '#563480', '#7650a8', '#9a7ac8'),
    'cloth_orange': ramp('#3a1a0c', '#6e3414', '#a85a1e', '#d8842c', '#f0b050'),
    'cloth_brown':  ramp('#22140e', '#3e2618', '#5e3c24', '#7e5634', '#a07448'),
    'cloth_linen':  ramp('#5a4a44', '#8a7a6c', '#b8a890', '#dcd0b4', '#f4ecd6'),
    'cloth_grey':   ramp('#1e1e26', '#363844', '#525666', '#727888', '#9aa0ae'),
    'leather':      ramp('#1e120c', '#3a2214', '#5a3820', '#7c5230', '#9c6e44'),
    # materials
    'iron':   ramp('#1a1c26', '#3a3e4e', '#626878', '#9aa2b2', '#dce4f0'),
    'steel':  ramp('#22283a', '#46506a', '#7a86a0', '#b4c0d4', '#f0f6ff'),
    'gold':   ramp('#4a2a0a', '#8a5414', '#c88a22', '#ecc040', '#fff0a0'),
    'copper': ramp('#3a160c', '#6e2c14', '#a8502a', '#d47a44', '#f0a870'),
    'wood':   ramp('#2a1810', '#4a2c1a', '#6e4428', '#92623a', '#b48452'),
    'wood_pale': ramp('#4a3420', '#7a5a36', '#a8804e', '#c8a46a', '#e4c88c'),
    'stone':  ramp('#24222c', '#403e4a', '#605e6a', '#86848e', '#b0aeb4'),
    'stone_warm': ramp('#2a2220', '#4a3c36', '#6c5a50', '#8e7a6c', '#b4a08e'),
    'stone_cave': ramp('#120e1a', '#221c2e', '#342c44', '#4a4060', '#665a80'),
    'brick':  ramp('#2e1410', '#5a2a1e', '#88442c', '#b06640', '#d08e60'),
    'slate':  ramp('#161a26', '#262e40', '#3a465e', '#52627e', '#7286a0'),
    'thatch': ramp('#3a2a10', '#6a4e1e', '#9a7a30', '#c4a448', '#e8cc6c'),
    # nature
    'grass':      ramp('#16301a', '#24502a', '#3a7a34', '#5aa23e', '#8ec85a'),
    'leaf':       ramp('#102414', '#1c3e1e', '#2e6028', '#4a8a34', '#7ab04a'),
    'leaf_dark':  ramp('#0c1a14', '#14301e', '#1e4628', '#2e6032', '#46803e'),
    'leaf_autumn': ramp('#3a160c', '#6a2c12', '#a4521c', '#d48a2c', '#f4c050'),
    'pine':       ramp('#0a1a18', '#122c26', '#1c4234', '#2a5c40', '#40784e'),
    'blossom':    ramp('#5a2a44', '#9a4a6e', '#d07a9a', '#f0a8c0', '#ffd8e6'),
    'dirt':       ramp('#1e140e', '#38261a', '#5a3e28', '#7a5838', '#9c7a52'),
    'sand':       ramp('#5a4628', '#8a7040', '#b89a5c', '#dcc07c', '#f4dea0'),
    'water':      ramp('#0e2440', '#1a3e66', '#2a6290', '#4a90b8', '#8ccce0'),
    'sky':        ramp('#3a6aa8', '#5a8cc4', '#7eaed8', '#a6cce6', '#d2e8f2'),
    'mountain':   ramp('#2a3450', '#3e4a6a', '#56648a', '#7484a8', '#9aaac6'),
    'cloud':      ramp('#8a9ab8', '#b0c0d6', '#d4e0ec', '#eef4fa', '#ffffff'),
    # light
    'fire':   ramp('#6a1a0c', '#b8360e', '#ec6a14', '#ffaa2a', '#fff0a0'),
    'ember':  ramp('#3a0e08', '#7a1e0c', '#c84a14', '#f08a2a', '#ffd070'),
    'magic':  ramp('#1a1050', '#3a2a9a', '#5a5ad8', '#8a9cf4', '#d0e4ff'),
    'spirit': ramp('#12324a', '#1e5a7a', '#3a90a8', '#76c8d0', '#d0fff4'),
    # creatures
    'slime_green': ramp('#123a12', '#25661e', '#3e8f2a', '#7fd34a', '#c8f890'),
    'slime_blue':  ramp('#101e4a', '#1e3e88', '#2a5fb0', '#5ab4ff', '#c0e8ff'),
    'slime_red':   ramp('#3a0a10', '#6e1418', '#a8231e', '#ff5a4a', '#ffc0b0'),
    'fur_tan':     ramp('#3a2414', '#6a4424', '#9a6a3a', '#c49460', '#e8c48c'),
    'fur_orange':  ramp('#3a160a', '#6e2e12', '#b0561e', '#e0863a', '#f8be78'),
    'fur_grey':    ramp('#26242a', '#46424c', '#6a6672', '#928e9a', '#c0bcc6'),
}


def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))


def shade(c, k):
    """Multiply rgb by k (k<1 darker), keep alpha."""
    return (max(0, min(255, int(c[0] * k))), max(0, min(255, int(c[1] * k))), max(0, min(255, int(c[2] * k))), c[3])


def hsh(*a):
    """Deterministic 0..1 hash of integers (stable across runs, no random module)."""
    h = 2166136261
    for v in a:
        h ^= (int(v) & 0xffffffff)
        h = (h * 16777619) & 0xffffffff
        h ^= h >> 13
        h = (h * 1274126177) & 0xffffffff
    return (h & 0xffffff) / 0x1000000


BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def dither(x, y, t):
    """Ordered dither: True on about t (0..1) of pixels, in a fine 4x4 pattern."""
    return (BAYER4[y & 3][x & 3] + 0.5) / 16 < t


class Canvas:
    """A small RGBA pixel canvas with the drawing verbs the art modules share."""

    def __init__(self, w, h, fill=CLEAR):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), fill)
        self.p = self.im.load()

    # ---- basics
    def inb(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def px(self, x, y, c):
        x, y = int(x), int(y)
        if c is None or not self.inb(x, y):
            return
        if len(c) == 4 and c[3] < 255:
            if c[3] == 0:
                return
            self.p[x, y] = blend(self.p[x, y], c)
        else:
            self.p[x, y] = c if len(c) == 4 else (c[0], c[1], c[2], 255)

    def get(self, x, y):
        return self.p[x, y] if self.inb(x, y) else CLEAR

    def on(self, x, y):
        return self.inb(x, y) and self.p[x, y][3] > 0

    def rect(self, x, y, w, h, c):
        for yy in range(int(y), int(y + h)):
            for xx in range(int(x), int(x + w)):
                self.px(xx, yy, c)

    def hline(self, x0, x1, y, c):
        for x in range(int(min(x0, x1)), int(max(x0, x1)) + 1):
            self.px(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(int(min(y0, y1)), int(max(y0, y1)) + 1):
            self.px(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        """Bresenham line, endpoints included."""
        x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def thick(self, x0, y0, x1, y1, w, c):
        """A capsule from (x0,y0) to (x1,y1) of width w (pixel-exact, no AA)."""
        r = w / 2.0
        minx, maxx = int(math.floor(min(x0, x1) - r)), int(math.ceil(max(x0, x1) + r))
        miny, maxy = int(math.floor(min(y0, y1) - r)), int(math.ceil(max(y0, y1) + r))
        vx, vy = x1 - x0, y1 - y0
        L2 = vx * vx + vy * vy
        for y in range(miny, maxy + 1):
            for x in range(minx, maxx + 1):
                cx, cy = x + 0.5, y + 0.5
                t = 0 if L2 == 0 else max(0, min(1, ((cx - x0) * vx + (cy - y0) * vy) / L2))
                qx, qy = x0 + vx * t, y0 + vy * t
                if (cx - qx) ** 2 + (cy - qy) ** 2 <= r * r:
                    self.px(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c):
        """Filled ellipse centred on (cx, cy); pixel centres inside are filled."""
        for y in range(int(math.floor(cy - ry)), int(math.ceil(cy + ry)) + 1):
            for x in range(int(math.floor(cx - rx)), int(math.ceil(cx + rx)) + 1):
                if rx <= 0 or ry <= 0:
                    continue
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                    self.px(x, y, c)

    def poly(self, pts, c):
        """Filled polygon (even-odd), sampled at pixel centres."""
        ys = [p[1] for p in pts]
        n = len(pts)
        for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
            sy = y + 0.5
            xs = []
            for i in range(n):
                (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
                if (ay <= sy < by) or (by <= sy < ay):
                    xs.append(ax + (sy - ay) * (bx - ax) / (by - ay))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(math.ceil(xs[i] - 0.5)), int(math.floor(xs[i + 1] - 0.5)) + 1):
                    self.px(x, y, c)

    def blit(self, other, x, y, flip=False):
        for yy in range(other.h):
            for xx in range(other.w):
                c = other.p[other.w - 1 - xx if flip else xx, yy]
                if c[3]:
                    self.px(x + xx, y + yy, c)

    # ---- masks and finishing
    def mask(self):
        return [[self.p[x, y][3] > 0 for x in range(self.w)] for y in range(self.h)]

    def outline(self, c=OUTLINE, diagonal=False, only_below=None):
        """Draw a 1px outline outside every opaque pixel (4-neighbour, or 8 with diagonal)."""
        m = self.mask()
        nb = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (-1, 1), (1, -1), (-1, -1)] if diagonal else [])
        for y in range(self.h):
            for x in range(self.w):
                if m[y][x]:
                    continue
                if only_below is not None and y < only_below:
                    continue
                for dx, dy in nb:
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < self.w and 0 <= yy < self.h and m[yy][xx]:
                        self.p[x, y] = c
                        break

    def recolor(self, fn):
        for y in range(self.h):
            for x in range(self.w):
                c = self.p[x, y]
                if c[3]:
                    o = fn(c, x, y)
                    if o is not None:
                        self.p[x, y] = o

    def save(self, key):
        save(self.im, key)

    def crop(self, x, y, w, h):
        c = Canvas(w, h)
        c.im.paste(self.im.crop((x, y, x + w, y + h)), (0, 0))
        c.p = c.im.load()
        return c


def blend(dst, src):
    a = src[3] / 255.0
    if dst[3] == 0:
        return src
    oa = a + dst[3] / 255.0 * (1 - a)
    if oa <= 0:
        return CLEAR
    return (
        int((src[0] * a + dst[0] * dst[3] / 255.0 * (1 - a)) / oa),
        int((src[1] * a + dst[1] * dst[3] / 255.0 * (1 - a)) / oa),
        int((src[2] * a + dst[2] * dst[3] / 255.0 * (1 - a)) / oa),
        int(oa * 255),
    )


def volume(cv, r, light=(-0.7, -0.75), rim=True, bands=(0.18, 0.45, 0.78), x0=0, y0=0, w=None, h=None):
    """Re-shade the opaque pixels of a region as a lit volume using ramp r.

    Each pixel looks a few px toward the light and away from it: near the lit edge it brightens,
    near the far edge it darkens, so blobs (bushes, slimes, rocks, canopies) read as round.
    """
    w = cv.w if w is None else w
    h = cv.h if h is None else h
    m = [[cv.on(x0 + x, y0 + y) for x in range(w)] for y in range(h)]

    def inside(x, y):
        return 0 <= x < w and 0 <= y < h and m[y][x]

    lx, ly = light
    out = {}
    for y in range(h):
        for x in range(w):
            if not m[y][x]:
                continue
            # distance to the edge toward the light, and away from it
            dl = 0
            while dl < 6 and inside(int(round(x + lx * (dl + 1))), int(round(y + ly * (dl + 1)))):
                dl += 1
            dd = 0
            while dd < 6 and inside(int(round(x - lx * (dd + 1))), int(round(y - ly * (dd + 1)))):
                dd += 1
            v = (dd + 1) / (dl + dd + 2)   # 0 = far side, 1 = lit side
            i = 0
            for b in bands:
                if v > b:
                    i += 1
            i = min(len(r) - 1, i + (1 if len(r) > 4 else 0))
            if rim and dd == 0:
                i = 0 if len(r) > 4 else 0
            if dl == 0 and v > 0.5:
                i = len(r) - 1
            out[(x, y)] = r[i]
    for (x, y), c in out.items():
        cv.p[x0 + x, y0 + y] = c


def save(im, key):
    path = os.path.join(ASSETS, *key.split('/')) + '.png'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    return path


def sheet(w, h):
    return Canvas(w, h)
