"""Hollowbound UI, effects and small creatures: HUD frame and fills, icons, coin, emotes, quest
markers, character effects, slimes, pets, the wisp and the Shrine Spirit.

Run `python tools/art/ui.py` to repaint just these sheets into assets/.
"""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
import math

R = RAMPS
TAU = math.pi * 2


# ------------------------------------------------------------------ helpers
def grid(cv, ox, oy, rows, pal):
    """Paint a hand-drawn character grid; characters missing from pal are left clear."""
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            c = pal.get(ch)
            if c is not None:
                cv.px(ox + x, oy + y, c)


def norm3(x, y, z):
    l = math.sqrt(x * x + y * y + z * z)
    return (x / l, y / l, z / l)


LIGHT = norm3(-0.55, -0.68, 0.48)   # upper left, toward the viewer


def band(v, cuts):
    """Index of v among ascending cut points."""
    i = 0
    for c in cuts:
        if v > c:
            i += 1
    return i


def torus(nx, ny, u, k=0.92):
    """Brightness (-1..1) of a raised round ring at radial direction (nx, ny), u=-1 inner .. +1 outer."""
    t = max(-1.0, min(1.0, u)) * k
    z = math.sqrt(max(0.0, 1 - t * t))
    n = (nx * t, ny * t, z)
    return n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]


def sphere(u, v):
    """Brightness (-1..1) of a sphere at unit-disc coords (u, v)."""
    z = math.sqrt(max(0.0, 1 - u * u - v * v))
    return u * LIGHT[0] + v * LIGHT[1] + z * LIGHT[2]


def outline_skip(cv, c=OUTLINE, skip=None, diagonal=False):
    """Canvas.outline, but never into pixels where skip(x, y) is true."""
    m = cv.mask()
    nb = [(1, 0), (-1, 0), (0, 1), (0, -1)] + ([(1, 1), (-1, 1), (1, -1), (-1, -1)] if diagonal else [])
    for y in range(cv.h):
        for x in range(cv.w):
            if m[y][x] or (skip and skip(x, y)):
                continue
            for dx, dy in nb:
                xx, yy = x + dx, y + dy
                if 0 <= xx < cv.w and 0 <= yy < cv.h and m[yy][xx]:
                    cv.p[x, y] = c
                    break


def clear(cv, x, y):
    if cv.inb(x, y):
        cv.p[x, y] = CLEAR


def alpha(c, a):
    return (c[0], c[1], c[2], int(a))


def paste(dst, src, x, y):
    """Copy src into dst at (x, y), replacing pixels (keeps src alpha exactly)."""
    for yy in range(src.h):
        for xx in range(src.w):
            c = src.p[xx, yy]
            if c[3] and dst.inb(x + xx, y + yy):
                dst.p[x + xx, y + yy] = c


def frames_to_sheet(frames, fw, fh, cols=None):
    """frames: list of rows, each a list of Canvas frames (fw x fh)."""
    cols = cols or max(len(r) for r in frames)
    sh = Canvas(cols * fw, len(frames) * fh)
    for r, row in enumerate(frames):
        for c, f in enumerate(row):
            if f is not None:
                paste(sh, f, c * fw, r * fh)
    return sh


# ------------------------------------------------------------------ HUD
ORB_CX, ORB_CY = 32.0, 31.0    # frame coords; ui/red_bar is drawn at +4,+4 (56x54)
GLASS_R = 25.0                  # glass shows inside this radius
GLASS_TINT = (24, 10, 22, 46)   # faint smoked glass over the fill (and the world when it is empty)
STAM = (63, 54, 49, 6)          # stamina slot (x, y, w, h) in the frame
EMBR = (66, 47, 32, 4)          # ember slot


def hud_frame():
    cv = Canvas(116, 64)
    iron, gold, cop = R['iron'], R['gold'], R['copper']

    # --- bar plate (under the orb): two stepped iron straps
    pl = Canvas(116, 64)
    pl.rect(56, 45, 44, 8, iron[2])          # ember strap
    pl.rect(54, 52, 61, 10, iron[2])         # stamina strap
    for (x, y) in [(114, 52), (114, 61)]:
        clear(pl, x, y)
    # shade the straps: lit top edges, dark bottoms, a bright top-left lip
    m = pl.mask()
    for y in range(64):
        for x in range(116):
            if not m[y][x]:
                continue
            up = y > 0 and m[y - 1][x]
            dn = y < 63 and m[y + 1][x]
            rt = x < 115 and m[y][x + 1]
            if not up:
                pl.p[x, y] = iron[3]
            elif not dn:
                pl.p[x, y] = iron[1]
            elif not rt:
                pl.p[x, y] = iron[1]
    pl.hline(56, 70, 45, iron[4])
    pl.outline(OUTLINE)
    # slots: dark lips, then clear interiors
    for (sx, sy, sw, sh) in (STAM, EMBR):
        for y in range(sy - 1, sy + sh + 1):
            for x in range(sx - 1, sx + sw + 1):
                pl.p[x, y] = OUTLINE
        for y in range(sy, sy + sh):
            for x in range(sx, sx + sw):
                pl.p[x, y] = GLASS_TINT
        # lit lower lip catches a thin gleam (the slot is recessed)
        pl.hline(sx, sx + sw - 1, sy + sh + 1, iron[3])
    # stamina dividers: 10 cells of 4px (dash costs 3)
    sx, sy, sw, sh = STAM
    for k in range(9):
        x = sx + 4 + k * 5
        for y in range(sy, sy + sh):
            pl.p[x, y] = alpha(OUTLINE, 200)
    paste(cv, pl, 0, 0)

    # --- the little brazier and flame at the end of the ember slot
    br = Canvas(116, 64)
    fl = R['fire']
    cup = [
        "..ccccccccc..",
        ".cbbbbbbbbbc.",
        "..aaaaaaaaa..",
        "...aaaaaaa...",
        "....aaaaa....",
        ".....aaa.....",
    ]
    grid(br, 100, 45, cup, {'c': gold[3], 'b': gold[2], 'a': iron[2]})
    br.px(101, 46, gold[4]); br.px(102, 46, gold[4])
    br.px(103, 47, iron[3]); br.px(104, 47, iron[3]); br.px(104, 48, iron[3])
    flame = [
        ".....3.......",
        "....33.......",
        "....332...3..",
        "...3332..33..",
        "..334322333..",
        "..3344223332.",
        ".233444433322",
        ".233444443322",
        "..23444443322",
        "..2233443322.",
    ]
    grid(br, 99, 35, flame, {'2': fl[1], '3': fl[2], '4': fl[3]})
    br.px(105, 43, fl[4]); br.px(106, 42, fl[4]); br.px(105, 42, fl[4])
    br.outline(OUTLINE)
    paste(cv, br, 0, 0)

    # --- the orb: smoked glass, copper bevel, riveted iron ring
    for y in range(64):
        for x in range(64):
            dx, dy = x + 0.5 - ORB_CX, y + 0.5 - ORB_CY
            d = math.hypot(dx, dy)
            if d > 31.7:
                continue
            nx, ny = dx / max(d, 1e-6), dy / max(d, 1e-6)
            if d < GLASS_R:
                cv.p[x, y] = GLASS_TINT
            elif d < 26.0:
                cv.p[x, y] = OUTLINE
            elif d < 27.7:
                b = torus(nx, ny, (d - 26.85) / 0.85)
                cv.p[x, y] = cop[[1, 2, 3, 3, 4][band(b, (-0.2, 0.2, 0.55, 0.82))]]
            elif d < 28.3:
                cv.p[x, y] = iron[0]
            elif d < 31.0:
                b = torus(nx, ny, (d - 29.65) / 1.35)
                cv.p[x, y] = iron[[0, 1, 2, 3, 4][band(b, (-0.35, 0.15, 0.55, 0.86))]]
            else:
                cv.p[x, y] = OUTLINE
    # rivets on the iron ring
    for deg in (45, 135, 225, 315, 90, 180, 270):
        a = math.radians(deg)
        rx, ry = ORB_CX + math.cos(a) * 29.6, ORB_CY + math.sin(a) * 29.6
        x0, y0 = int(math.floor(rx - 1)), int(math.floor(ry - 1))
        grid(cv, x0, y0, ["hl", "ls"], {'h': gold[4], 'l': gold[3], 's': gold[1]})
    # glass glints (always on top of the fill)
    for i in range(40):
        a = math.radians(196 + i * 1.4)
        x, y = ORB_CX + math.cos(a) * 21.6, ORB_CY + math.sin(a) * 21.6
        cv.p[int(x), int(y)] = (255, 250, 240, 175)
    for i in range(6):
        a = math.radians(262 + i * 1.6)
        x, y = ORB_CX + math.cos(a) * 21.6, ORB_CY + math.sin(a) * 21.6
        cv.p[int(x), int(y)] = (255, 250, 240, 140)
    for (x, y) in [(15, 17), (16, 16)]:
        cv.p[x, y] = (255, 255, 250, 200)
    for i in range(22):
        a = math.radians(18 + i * 2.2)
        x, y = ORB_CX + math.cos(a) * 23.2, ORB_CY + math.sin(a) * 23.2
        cv.p[int(x), int(y)] = (255, 200, 190, 60)
    return cv


def red_fill():
    """The orb's liquid: lit from the upper left, with light pooling in the bottom of the glass."""
    cv = Canvas(56, 54)
    r, cr = R['slime_red'], R['cloth_red']
    tones = [r[0], r[1], cr[2], r[2], cr[3], r[3], r[4]]
    cx, cy, rad = 28.0, 27.0, 26.6
    cuts = (-0.42, -0.12, 0.2, 0.52, 0.78, 0.93)
    for y in range(54):
        for x in range(56):
            u, v = (x + 0.5 - cx) / rad, (y + 0.5 - cy) / rad
            rr = math.sqrt(u * u + v * v)
            if rr > 1:
                continue
            b = sphere(u * 0.9, v * 0.9)
            # light passing through the liquid pools along the lower inner wall
            if v > 0.25 and 0.7 < rr:
                b += 0.55 * min(1, (v - 0.25) / 0.4) * (1 - abs(rr - 0.86) / 0.16) if abs(rr - 0.86) < 0.16 else 0
            i = band(b, cuts)
            lo = cuts[i - 1] if i > 0 else -9
            if i > 0 and b - lo < 0.06 and dither(x, y, 0.5):
                i -= 1
            cv.p[x, y] = tones[min(i, 4)]
    # glossy crescent on the liquid's upper left
    for y in range(54):
        for x in range(56):
            u, v = (x + 0.5 - cx) / rad, (y + 0.5 - cy) / rad
            d1 = math.hypot(u + 0.28, v + 0.34)
            d2 = math.hypot(u + 0.17, v + 0.22)
            if d1 < 0.44 and d2 > 0.42 and u < 0.1 and v < 0.1:
                cv.p[x, y] = tones[5] if d1 < 0.36 else tones[4]
    for (x, y) in [(13, 15), (14, 14), (15, 13)]:
        cv.p[x, y] = tones[6]
    # rising bubbles
    for (x, y, s) in [(14, 37, 2), (36, 43, 1), (23, 46, 1), (41, 31, 1), (30, 39, 1), (19, 29, 1), (33, 23, 1)]:
        if s == 2:
            grid(cv, x, y, [".h.", "h.h", ".h."], {'h': tones[5]})
        else:
            cv.p[x, y] = tones[5]
            cv.p[x + 1, y + 1] = tones[2]
    return cv


def blue_fill():
    cv = Canvas(49, 6)
    b = R['slime_blue']
    rows = [mix(b[3], b[4], 0.55), b[3], b[3], b[2], b[2], b[1]]
    for y in range(6):
        for x in range(49):
            cv.p[x, y] = rows[y]
    for k in range(10):
        x0 = k * 5
        cv.p[x0, 1] = b[4]
        cv.p[x0, 2] = mix(b[3], b[4], 0.5)
        if x0 + 3 < 49:
            cv.p[x0 + 3, 4] = b[1]
    return cv


def yellow_fill():
    cv = Canvas(32, 4)
    e = R['ember']
    for x in range(32):
        cv.p[x, 0] = e[4]
        cv.p[x, 1] = e[4] if x % 6 == 2 else e[3]
        cv.p[x, 2] = e[3]
        cv.p[x, 3] = e[2] if x % 6 != 5 else e[3]
    return cv


# ------------------------------------------------------------------ icons (12x12 cells)
def icon_cells():
    cv = Canvas(96, 12)
    _heart(cv, 0, filled=True)
    _heart(cv, 12, filled=False)
    _potion(cv, 24)
    _key(cv, 36)
    _relic(cv, 48)
    _sword(cv, 60)
    _coins(cv, 72)
    _lantern(cv, 84)
    return cv


def _heart(cv, ox, filled=True):
    red, cr = R['slime_red'], R['cloth_red']
    rows = [
        "............",
        "..ooo..ooo..",
        ".ohlroorrro.",
        "ohllrrrlrrso",
        "olrrrrrrrrso",
        "orrrrrrrrsso",
        ".orrrrrrsso.",
        "..orrrrsso..",
        "...orrsso...",
        "....osso....",
        ".....oo.....",
        "............",
    ]
    if filled:
        pal = {'o': OUTLINE, 'h': red[4], 'l': red[3], 'r': cr[3], 's': red[2]}
    else:
        pal = {'o': OUTLINE, 'h': R['stone'][3], 'l': R['stone'][2], 'r': R['stone_cave'][3], 's': R['stone_cave'][2]}
    grid(cv, ox, 0, rows, pal)
    if filled:
        cv.px(ox + 9, 6, red[1]); cv.px(ox + 8, 7, red[1]); cv.px(ox + 7, 8, red[1])


def _potion(cv, ox):
    p, gl, cork = R['cloth_purple'], R['steel'], R['wood_pale']
    rows = [
        "....oooo....",
        "....okko....",
        "....oddo....",
        "...oggggo...",
        "...ogwwgo...",
        "..oowggwoo..",
        ".oghllppppo.",
        "ohlllppppsso",
        "olllpppppsso",
        "olpppppppsso",
        ".opppppssso.",
        "..oooooooo..",
    ]
    pal = {'o': OUTLINE, 'k': cork[3], 'd': cork[1], 'g': gl[2], 'w': gl[4],
           'h': (255, 255, 255, 255), 'l': p[4], 'p': p[3], 's': p[2]}
    grid(cv, ox, 0, rows, pal)
    cv.px(ox + 5, 1, cork[4])
    cv.px(ox + 7, 9, p[4]); cv.px(ox + 6, 8, p[4])


def _key(cv, ox):
    g = R['gold']
    rows = [
        "............",
        "...oooo.....",
        "..ohllso....",
        ".ohl..sso...",
        ".ol....so...",
        ".ol....so...",
        ".osl..sso...",
        "..osssso....",
        "...ooslo....",
        "....oslo....",
        "....oslooo..",
        "....osllllo.",
    ]
    rows = [
        "...oooo.....",
        "..ohhlso....",
        ".ohl..lso...",
        ".ol....so...",
        ".ol....so...",
        ".oss..sso...",
        "..ossssoo...",
        "...oslo.....",
        "...oslooo...",
        "...osllllo..",
        "...oslooo...",
        "...osllo....",
    ]
    pal = {'o': OUTLINE, 'h': g[4], 'l': g[3], 's': g[2]}
    grid(cv, ox, 0, rows, pal)
    cv.px(ox + 4, 11, g[1])


def _relic(cv, ox):
    """The Hearthstone: a rounded ember-stone with a white-hot heart."""
    e, f = R['ember'], R['fire']
    rows = [
        "............",
        "....oooo....",
        "...ohhllo...",
        "..ohhlllso..",
        ".ohllwwllso.",
        ".ohlwwwwlso.",
        ".ollwwwwlso.",
        ".ollswwlssd.",
        "..olllssdo..",
        "...ossddo...",
        "....oooo....",
        "............",
    ]
    rows[7] = ".olllwwlsso."
    pal = {'o': OUTLINE, 'w': f[4], 'h': e[4], 'l': e[3], 's': e[2], 'd': e[1]}
    grid(cv, ox, 0, rows, pal)
    cv.px(ox + 5, 5, (255, 255, 255, 255))
    cv.px(ox + 4, 3, (255, 255, 240, 255))
    # a soft ember glow around the stone
    halo = alpha(f[3], 90)
    for (x, y) in [(3, 1), (8, 1), (1, 3), (10, 3), (0, 6), (11, 6), (1, 9), (10, 9), (3, 11), (8, 11)]:
        cv.px(ox + x, y, halo)


def _sword(cv, ox):
    s, w, g = R['steel'], R['wood'], R['gold']
    rows = [
        "........ooo.",
        ".......ohwo.",
        "......ohlso.",
        ".....ohlso..",
        "....ohlso...",
        ".oo.ohlso...",
        ".ogoolso....",
        "..ogsso.....",
        "..oogo......",
        ".oaoogo.....",
        "oaao.ogo....",
        "ooo...oo....",
    ]
    rows = [
        ".........ooo",
        "........ohwo",
        ".......ohlso",
        "......ohlso.",
        ".....ohlso..",
        "..oo.hlso...",
        "..ogolso....",
        "...ogso.....",
        "...oogo.....",
        "..oaooggo...",
        ".oaao..oo...",
        ".ooo........",
    ]
    pal = {'o': OUTLINE, 'h': s[4], 'w': (255, 255, 255, 255), 'l': s[3], 's': s[2], 'g': g[3], 'a': w[3]}
    grid(cv, ox, 0, rows, pal)
    cv.px(ox + 5, 5, OUTLINE)


def _coins(cv, ox):
    """A face-on coin leaning on a little stack."""
    g = R['gold']
    st = Canvas(12, 12)
    for y in (9, 7, 5):
        st.hline(5, 10, y, g[3]); st.hline(5, 10, y + 1, g[1])
        st.px(5, y, g[4]); st.px(10, y + 1, g[0])
    st.hline(6, 9, 2, g[4]); st.hline(5, 10, 3, g[3]); st.hline(6, 9, 4, g[2])
    st.px(5, 3, g[4]); st.px(10, 3, g[2])
    st.outline(OUTLINE)
    fc = Canvas(12, 12)
    for y in range(12):
        for x in range(9):
            u, v = (x + 0.5 - 4.0) / 3.5, (y + 0.5 - 7.5) / 3.5
            q = u * u + v * v
            if q > 1:
                continue
            lit = -u * 0.6 - v * 0.8
            if q > 0.4:
                col = g[4] if lit > 0.3 else g[3] if lit > -0.35 else g[1]
            else:
                col = g[2]
            fc.p[x, y] = col
    fc.px(4, 8, g[4]); fc.px(4, 7, g[1]); fc.px(3, 7, g[1])
    fc.outline(OUTLINE)
    paste(st, fc, 0, 0)
    paste(cv, st, ox, 0)


def _lantern(cv, ox):
    i, f = R['iron'], R['fire']
    rows = [
        ".....oo.....",
        "....o..o....",
        "....oooo....",
        "...ohiiio...",
        "..oooooooo..",
        "..ohyffyso..",
        "..oiyfwyso..",
        "..oifwwfso..",
        "..oiyffyso..",
        "..oooooooo..",
        "...ohiiso...",
        "....oooo....",
    ]
    pal = {'o': OUTLINE, 'h': i[3], 'i': i[2], 's': i[1], 'y': f[2], 'f': f[3], 'w': f[4]}
    grid(cv, ox, 0, rows, pal)
    cv.px(ox + 5, 0, i[2]); cv.px(ox + 6, 0, i[2])


# ------------------------------------------------------------------ coin (12 frames of 16x16)
# A flat stamped disc, not a ball: even face colour, a dark 1px rim, an inner ring, and the glint
# inside the face at the upper left (a glint on the outer edge reads as a lit fuse).
COIN_FACE = [
    "..dddd..",
    ".dwfffd.",
    "dwiiiifd",
    "dficcifd",
    "dficcifd",
    "dfiiiifd",
    ".dfffsd.",
    "..dddd..",
]


def coin_sheet():
    sh = Canvas(192, 16)
    g = R['gold']
    glint = mix(g[4], WHITE, 0.6)
    for i in range(12):
        th = i * TAU / 12
        c = Canvas(16, 16)
        w = int(round(8 * abs(math.cos(th))))
        top = 4                                   # body rows 4..11; outline ends on row 12 (drawn at y+3)
        if w <= 1:
            # edge-on: a thin milled bar
            c.vline(7, top + 1, top + 6, g[3]); c.vline(8, top + 1, top + 6, g[2])
            c.px(7, top, g[1]); c.px(8, top, g[1]); c.px(7, top + 7, g[1]); c.px(8, top + 7, g[1])
        else:
            x0 = 8 - (w + 1) // 2
            front = math.cos(th) >= 0
            pal = {'d': g[1], 'f': g[3], 'i': g[2], 'c': g[3], 's': g[2],
                   'w': (glint if i == 0 else g[4]) if front else g[3]}
            for y in range(8):
                for x in range(w):
                    col = int(round(x * 7 / (w - 1))) if w > 1 else 0
                    ch = COIN_FACE[y][col]
                    if ch in pal:
                        c.px(x0 + x, top + y, pal[ch])
            # the coin's thickness: a dark sliver hugging the rim on the side turning away
            if w < 8:
                ex = x0 + w if math.sin(th) > 0 else x0 - 1
                c.vline(ex, top + 2, top + 5, g[1])
        c.outline(OUTLINE)
        paste(sh, c, i * 16, 0)
    return sh


# ------------------------------------------------------------------ emotes (19 frames x 15 rows of 16x16)
EMOTES = ['question', 'exclaim', 'dots', 'skull', 'laugh', 'smile', 'angry', 'sad', 'love', 'shock',
          'worried', 'heart', 'happy', 'content', 'blank']
BUB = R['cloth_linen']
WHITE = (255, 255, 255, 255)


def bubble(c, fw, fh, dx=0, dy=0, fill=None, shade=None, tail=True):
    """A speech bubble whose fill is fw x fh, bottom row at y=10+dy, centred on x=8 (+dx)."""
    fill = fill or BUB[4]
    shade = shade or BUB[3]
    x0 = 8 - fw // 2 + dx
    y1 = 10 + dy
    y0 = y1 - fh + 1
    rad = 2 if min(fw, fh) >= 7 else 1 if min(fw, fh) >= 3 else 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x0 + fw):
            i, j = x - x0, y - y0
            if min(i, fw - 1 - i) + min(j, fh - 1 - j) < rad:
                continue
            c.px(x, y, shade if y == y1 else fill)
    if tail and fh >= 5:
        c.px(6 + dx, y1, fill); c.px(7 + dx, y1, fill)
        c.px(6 + dx, y1 + 1, fill); c.px(7 + dx, y1 + 1, shade)
        c.px(6 + dx, y1 + 2, shade)
    c.outline(OUTLINE)
    if fh >= 5:
        c.px(x0 + 1, y0 + 1, WHITE)
        if rad >= 2:
            c.px(x0 + 2, y0, WHITE)


def emote_symbol(c, kind, k, dx, dy):
    """Draw the emote's face/symbol into the full bubble; k = 0..11 through the hold."""
    K = OUTLINE
    red, blu, pink, gold, sr = R['cloth_red'], R['water'], R['blossom'], R['gold'], R['slime_red']

    def P(x, y, col):
        c.px(x + dx, y + dy, col)

    def G(x, y, rows, pal):
        grid(c, x + dx, y + dy, rows, pal)

    def face_px(pts):
        for (x, y) in pts:
            P(x, y, K)

    if kind == 'question':
        b = R['cloth_blue']
        tilt = 1 if k % 6 in (2, 3, 4) else 0
        G(5, 2 + tilt, [".xxxx.", "xx..xx", "....xx", "...xx.", "..xx..", "......", "..xx.."][:7 - tilt] if tilt == 0 else
          [".xxxx.", "xx..xx", "....xx", "...xx.", "..xx..", "..xx.."], {'x': b[2]})
        P(6, 2 + tilt, b[3]); P(5, 3 + tilt, b[3])
    elif kind == 'exclaim':
        G(7, 2, ["xx", "xx", "xx", "xx", "xx", "..", "xx"], {'x': red[3]})
        P(7, 2, sr[3]); P(7, 3, sr[3])
        if k < 4:   # little red shock ticks outside the top corners as it lands (inside they read as brows)
            for (x, y, t) in [(0, 0, 4), (1, 1, 3), (15, 0, 4), (14, 1, 3)]:
                P(x, y, sr[t])
    elif kind == 'dots':
        n = 1 + (k // 3) % 3
        for i in range(n):
            G(3 + i * 4, 6, ["xx", "xx"], {'x': R['stone'][1]})
    elif kind == 'skull':
        jaw = 1 if k % 4 in (1, 2) else 0
        G(4, 2, ["..xxxx..", ".xxxxxxx", "xxxxxxxx", "xkkxxkkx", "xkkxxkkx", ".xxxkxxs"],
          {'x': BUB[4], 'k': K, 's': BUB[2]})
        G(4, 2, ["..ww....", ".w......"], {'w': WHITE})
        G(5, 8 + jaw, ["xsxsxs"], {'x': BUB[3], 's': BUB[1]})
    elif kind == 'smile':
        face_px([(5, 4), (5, 5), (10, 4), (10, 5), (5, 7), (10, 7), (6, 8), (7, 8), (8, 8), (9, 8)])
        P(3, 6, pink[2]); P(12, 6, pink[2])
        if k in (7, 8):    # blink
            P(5, 4, BUB[4]); P(10, 4, BUB[4])
    elif kind == 'happy':
        face_px([(4, 5), (5, 4), (6, 5), (9, 5), (10, 4), (11, 5)])
        G(5, 7, ["kkkkkk", ".krrk.", "..kk.."], {'k': K, 'r': red[3]})
        P(3, 7, pink[2]); P(12, 7, pink[2])
    elif kind == 'laugh':
        G(4, 3, ["k......k", ".k....k.", "k......k"], {'k': K})
        G(4, 7, ["kwwkkwwk", "krrrrrrk", ".kkkkkk."], {'k': K, 'r': red[3], 'w': WHITE})
    elif kind == 'angry':
        face_px([(4, 3), (5, 4), (11, 3), (10, 4), (5, 5), (6, 5), (9, 5), (10, 5),
                 (6, 8), (7, 8), (8, 8), (9, 8), (5, 9), (10, 9)])
        v = sr[3]
        if k % 4 < 2:
            G(11, 1, ["x.x", "...", "x.x"], {'x': v})
        else:
            G(10, 0, ["x...x", ".x.x.", ".....", ".x.x.", "x...x"], {'x': v})
    elif kind == 'sad':
        face_px([(4, 4), (5, 3), (10, 3), (11, 4), (5, 5), (10, 5),
                 (6, 8), (7, 8), (8, 8), (9, 8), (5, 9), (10, 9)])
        if k < 9:
            ty = 6 + min(3, k // 2)
            P(5, ty, blu[3]); P(5, ty + 1, blu[2])
    elif kind == 'love':
        big = k % 4 < 2
        for hx in (3, 9):
            if big:
                G(hx - 1, 3, ["rr.rr", "rhrrr", ".rrr.", "..r.."], {'r': sr[3], 'h': sr[4]})
            else:
                G(hx, 4, ["r.r", "rrr", ".r."], {'r': sr[3]})
        face_px([(5, 8), (10, 8), (6, 9), (7, 9), (8, 9), (9, 9)])
        P(3, 8, pink[2]); P(12, 8, pink[2])
    elif kind == 'shock':
        G(4, 3, ["kkk", "k.k", "kkk"], {'k': K})
        G(9, 3, ["kkk", "k.k", "kkk"], {'k': K})
        G(6, 7, [".kk.", "k..k", ".kk."], {'k': K})
    elif kind == 'worried':
        face_px([(4, 3), (5, 2), (10, 2), (11, 3), (5, 5), (10, 5),
                 (5, 8), (6, 7), (7, 8), (8, 7), (9, 8), (10, 7)])
        if k < 10:
            G(12, 1 + min(4, k // 2), [".b", "bb", "bB"], {'b': blu[3], 'B': blu[4]})
    elif kind == 'heart':
        if k % 6 in (0, 2):
            G(4, 2, [".rr.rr.", "rhrrrrr", "rrrrrrs", ".rrrrs.", "..rrs..", "...s..."],
              {'r': sr[3], 'h': sr[4], 's': sr[2]})
        else:
            G(5, 3, [".r.r.", "rhrrr", "rrrrs", ".rrs.", "..s.."], {'r': sr[3], 'h': sr[4], 's': sr[2]})
    elif kind == 'content':
        face_px([(4, 5), (5, 5), (6, 5), (9, 5), (10, 5), (11, 5), (6, 8), (7, 8), (8, 8), (9, 8), (5, 7), (10, 7)])
        for x in (3, 4, 11, 12):
            P(x, 7, pink[2])
        ny = 1 if k % 6 < 3 else 2
        G(12, ny, [".x", ".x", "xx"], {'x': R['cloth_blue'][2]})
    elif kind == 'blank':
        face_px([(5, 5), (10, 5), (6, 8), (7, 8), (8, 8), (9, 8)])


def emote_sheet():
    sh = Canvas(304, 240)
    for row, kind in enumerate(EMOTES):
        fill = shade = None
        if kind == 'skull':
            fill, shade = R['stone_cave'][2], R['stone_cave'][1]
        if kind == 'angry':
            fill, shade = mix(BUB[4], R['slime_red'][3], 0.22), mix(BUB[3], R['slime_red'][3], 0.3)
        for f in range(19):
            c = Canvas(16, 16)
            if f in (0, 17):
                bubble(c, 4, 3, fill=fill, shade=shade, tail=False)
            elif f in (1, 16):
                bubble(c, 9, 6, fill=fill, shade=shade)
            elif f == 2:
                bubble(c, 14, 10, fill=fill, shade=shade)
                emote_symbol(c, kind, 0, 0, -1)
            elif f <= 15:
                k = min(11, f - 3)
                dx = dy = 0
                if kind == 'laugh':
                    dy = -1 if k % 2 == 0 else 0
                if kind == 'shock' and k < 6:
                    dx = (1, -1)[k % 2]
                if kind == 'angry' and k % 3 == 0:
                    dx = 1 if k % 6 == 0 else -1
                bubble(c, 12, 9, dx, dy, fill=fill, shade=shade)
                emote_symbol(c, kind, k, dx, dy)
            else:
                c.px(7, 9, BUB[3]); c.px(8, 9, BUB[4])
                c.outline(alpha(OUTLINE, 160))
            paste(sh, c, f * 16, row * 16)
    return sh


# ------------------------------------------------------------------ quest marker (16 frames x 2 rows of 32x32)
QMARK = [
    "..xxxxxx..",
    ".xxxxxxxx.",
    "xxxx..xxxx",
    "xxx....xxx",
    ".......xxx",
    "......xxxx",
    "....xxxxx.",
    "...xxxxx..",
    "...xxxx...",
    "...xxx....",
    "..........",
    "...xxxx...",
    "...xxxx...",
    "...xxx....",
]
EMARK = [
    ".xxxx.",
    "xxxxxx",
    "xxxxxx",
    "xxxxxx",
    ".xxxx.",
    ".xxxx.",
    ".xxxx.",
    "..xx..",
    "..xx..",
    "......",
    ".xxxx.",
    ".xxxx.",
    "..xx..",
]


def glyph_canvas(rows, ramp, glint=None):
    """Bevelled glyph: lit top-left edges, shaded bottom-right, then outlined."""
    h, w = len(rows), len(rows[0])
    c = Canvas(w + 2, h + 2)

    def on(x, y):
        return 0 <= x < w and 0 <= y < h and rows[y][x] == 'x'

    for y in range(h):
        for x in range(w):
            if not on(x, y):
                continue
            col = ramp[3]
            if not on(x - 1, y) or not on(x, y - 1):
                col = ramp[4]
            if not on(x + 1, y) or not on(x, y + 1):
                col = ramp[2]
            if not on(x, y + 1) and not on(x + 1, y):
                col = ramp[1]
            if glint is not None and 0 <= (x + y) - glint < 2:
                col = (255, 255, 240, 255)
            c.px(x + 1, y + 1, col)
    c.outline(OUTLINE)
    return c


def quest_sheet():
    sh = Canvas(512, 64)
    g = R['gold']
    for row, rows in enumerate((QMARK, EMARK)):
        h = len(rows)
        for f in range(16):
            bob = round(math.sin(f / 16 * TAU) * 2)
            glint = (f - 9) * 3 if 9 <= f <= 14 else None
            gc = glyph_canvas(rows, g, glint)
            c = Canvas(32, 32)
            gx = 16 - gc.w // 2
            gy = 29 - gc.h - bob
            # a thin warm halo hugging the outline
            halo = Canvas(32, 32)
            paste(halo, gc, gx, gy)
            halo.outline(alpha(g[4], 80))
            for y in range(32):
                for x in range(32):
                    if halo.p[x, y][3] == 80:
                        c.p[x, y] = halo.p[x, y]
            paste(c, gc, gx, gy)
            if f in (10, 11, 12):
                sx, sy = gx + gc.w - 2, gy + 1
                c.px(sx, sy, WHITE)
                if f == 11:
                    for (x, y) in [(sx - 1, sy), (sx + 1, sy), (sx, sy - 1), (sx, sy + 1)]:
                        c.px(x, y, alpha(g[4], 230))
            paste(sh, c, f * 32, row * 32)
    return sh


# ------------------------------------------------------------------ character effects (5 frames of 80x64)
# fx.js plays all 5 frames at 14 fps, bottom-centred on the feet. Unflipped sheets act toward the LEFT
# (the engine mirrors them for hits from the other side).
def droplet(c, x, y, r, tones):
    """A glossy drop: dark rim lower right, body, lit upper left, one specular pixel. tones = (rim, body, lit, spec)."""
    xi, yi = int(round(x)), int(round(y))
    rim, body, lit, spec = tones
    if r < 0.9:
        c.px(xi, yi, lit)
        return
    if r < 1.4:
        c.px(xi, yi, lit); c.px(xi + 1, yi, body); c.px(xi, yi + 1, body); c.px(xi + 1, yi + 1, rim)
        return
    cx, cy = xi + 0.5, yi + 0.5
    c.ellipse(cx + 0.7, cy + 0.7, r, r, rim)
    c.ellipse(cx, cy, r, r, body)
    c.ellipse(cx - r * 0.25, cy - r * 0.25, r * 0.62, r * 0.62, lit)
    c.px(int(cx - r * 0.45), int(cy - r * 0.45), spec)


def spray(tones, seed, goo=False):
    """Hit spray toward the left from the body (origin ~20px above the feet)."""
    sh = Canvas(400, 64)
    ox, oy = 40, 44
    n = 11 if goo else 16
    parts = []
    for i in range(n):
        h1, h2, h3 = hsh(seed, i, 1), hsh(seed, i, 2), hsh(seed, i, 3)
        back = i < 2
        if back:
            a = -0.5 + h1 * 0.8
            sp = 0.25 + h2 * 0.2
        else:
            a = math.pi + (-0.38 + h1 * 1.05)     # mostly level and up-left
            sp = 0.5 + h2 * 0.65
        size = (1.5 + h3 * 2.0) if goo else (0.8 + h3 * 1.5)
        parts.append((a, sp, size))

    def pos(a, sp, t):
        d = sp * 40 * (1 - (1 - t) ** 2)
        return ox + math.cos(a) * d, oy + math.sin(a) * d * 0.75 + 13 * t * t

    for f in range(5):
        c = Canvas(80, 64)
        t = (f + 0.6) / 5.0
        # streaks first (motion smear on the early frames)
        if f <= 2:
            for (a, sp, size) in parts:
                x0, y0 = pos(a, sp, max(0, t - 0.14))
                x1, y1 = pos(a, sp, t)
                c.line(x0, y0, x1, y1, tones[1] if f < 2 else tones[0])
        # the impact splat
        if f == 0:
            for k in range(7):
                a = k / 7 * TAU + 0.4
                L = 4 + 3 * hsh(seed, k, 9)
                c.line(ox, oy, ox + math.cos(a) * L, oy + math.sin(a) * L * 0.8, tones[2])
            c.ellipse(ox + 0.5, oy + 0.5, 3.2, 2.8, tones[2])
            c.ellipse(ox, oy, 1.8, 1.6, tones[3])
            c.px(ox - 1, oy - 1, tones[3])
        elif f == 1 and goo:
            c.ellipse(ox + 0.5, oy + 0.5, 2.5, 2.0, tones[1])
            c.ellipse(ox, oy, 1.5, 1.2, tones[2])
        for (a, sp, size) in parts:
            x, y = pos(a, sp, t)
            r = size * (1.15 - 0.62 * t)
            if f == 4 and size < 1.4:
                continue
            droplet(c, x, y, r, tones)
            if goo and f >= 2 and size > 2.6:      # stringy goo trailing the big blobs
                c.px(int(x) + 1, int(y) - 2, tones[1]); c.px(int(x) + 2, int(y) - 3, tones[1])
        if goo and f >= 2:   # drips falling straight off the body
            for k, dx in enumerate((-3, 2)):
                yy = oy + 2 + (f - 2) * 5 + k * 2
                c.vline(ox + dx, yy, yy + 2, tones[2])
                c.px(ox + dx, yy + 2, tones[3])
        paste(sh, c, f * 80, 0)
    return sh


def sparkle(c, x, y, arm, core, mid, tip):
    """A four-point twinkle with arms of length arm."""
    for i in range(1, arm + 1):
        col = mid if i < arm else tip
        for (dx, dy) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            c.px(x + dx * i, y + dy * i, col)
    c.px(x, y, core)
    if arm >= 3:
        for (dx, dy) in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
            c.px(x + dx, y + dy, mid)


STAR7 = ["...x...", "..xxx..", "xxxxxxx", ".xxxxx.", "..xxx..", ".xx.xx.", ".x...x."]
STAR5 = ["..x..", ".xxx.", "xxxxx", ".xxx.", ".x.x."]
STAR3 = [".x.", "xxx", ".x."]
HEART7 = [".xx.xx.", "xxxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."]
HEART5 = ["xx.xx", "xxxxx", ".xxx.", "..x.."]
HEART3 = ["x.x", "xxx", ".x."]


def dizzy_stars():
    """Three stars circling a dazed head (the boss plays this 44px above his feet)."""
    sh = Canvas(400, 64)
    g = R['gold']
    back = [g[0], g[1], g[1], g[2], g[3]]
    for f in range(5):
        c = Canvas(80, 64)
        cx, cy, rx, ry = 40, 27, 16, 4.5
        stars = []
        for i in range(3):
            th = f * 0.8 + i * TAU / 3
            stars.append((math.sin(th), th))
        for depth, th in sorted(stars):
            front = depth > -0.15
            x, y = cx + math.cos(th) * rx, cy + math.sin(th) * ry
            # little trail behind each star
            for k, (dth, col) in enumerate(((-0.35, g[3]), (-0.62, g[2]))):
                tx, ty = cx + math.cos(th + dth) * rx, cy + math.sin(th + dth) * ry
                c.px(int(round(tx)), int(round(ty)), col if front else g[1])
            rows = STAR7 if front and f > 0 else STAR5 if front or f > 0 else STAR3
            gc = glyph_canvas(rows, g if front else back)
            paste(c, gc, int(round(x - gc.w / 2)), int(round(y - gc.h / 2)))
        paste(sh, c, f * 80, 0)
    return sh


def impact_stars():
    """A white impact flash that bursts into twinkles."""
    sh = Canvas(400, 64)
    s = R['steel']
    ox, oy = 40, 40
    for f in range(5):
        c = Canvas(80, 64)
        if f == 0:
            sparkle(c, ox, oy, 9, WHITE, s[4], s[3])
            c.rect(ox - 1, oy - 1, 3, 3, WHITE)
        elif f == 1:
            sparkle(c, ox, oy, 5, WHITE, s[4], s[3])
        elif f == 2:
            sparkle(c, ox, oy, 2, s[4], s[3], s[2])
        rad = [0, 9, 15, 20, 23][f]
        if f:
            for k in range(6):
                a = k / 6 * TAU + 0.3
                x, y = int(round(ox + math.cos(a) * rad)), int(round(oy + math.sin(a) * rad * 0.8))
                if f == 1:
                    sparkle(c, x, y, 2, WHITE, s[4], s[3])
                elif f == 2:
                    sparkle(c, x, y, 2, WHITE, s[3], s[2])
                elif f == 3:
                    sparkle(c, x, y, 1, s[4], s[3], s[3])
                else:
                    c.px(x, y, s[3])
        paste(sh, c, f * 80, 0)
    return sh


def buff_sparkles():
    """Rising green-gold healing motes around the body, from a ring at the feet."""
    sh = Canvas(400, 64)
    gr, g = R['slime_green'], R['gold']
    parts = [(-12, 0.0, 'plus'), (10, 0.3, 'star'), (-4, 0.55, 'plus'), (14, 0.8, 'dot'), (3, 0.15, 'star'),
             (-15, 0.7, 'star'), (7, 0.95, 'plus'), (-8, 1.2, 'dot'), (12, 1.35, 'plus'), (0, 1.1, 'star')]
    for f in range(5):
        c = Canvas(80, 64)
        if f <= 3:
            rx, ry = 8 + f * 4, 2 + f * 0.7
            for k in range(40):
                a = k / 40 * TAU
                x, y = int(round(40 + math.cos(a) * rx)), int(round(61 + math.sin(a) * ry))
                if f < 3 or k % 2:
                    c.px(x, y, gr[4] if math.sin(a) > 0 else gr[3])
        for (dx, ph, kind) in parts:
            y = 62 - (ph * 22 + f * 9)
            if not (6 < y < 62):
                continue
            x = 40 + dx + (1 if (f + int(ph * 10)) % 4 == 0 else 0)
            fade = y < 16
            xi, yi = int(round(x)), int(round(y))
            if kind == 'plus':
                pc = Canvas(5, 5)
                grid(pc, 1, 1, [".x.", "xwx", ".x."], {'x': gr[3] if not fade else gr[2], 'w': gr[4]})
                pc.outline(gr[1])
                paste(c, pc, xi - 2, yi - 2)
            elif kind == 'star':
                sparkle(c, xi, yi, 1 if fade else 2, WHITE, g[4], g[3])
            else:
                c.px(xi, yi, g[4]); c.px(xi, yi + 1, g[3])
        paste(sh, c, f * 80, 0)
    return sh


def heart_burst():
    """Hearts popping up from a happy pet (the game plays this 20px below the pet's feet)."""
    sh = Canvas(400, 64)
    sr = R['slime_red']
    pink = [R['blossom'][0], R['blossom'][1], R['blossom'][2], R['blossom'][3], R['blossom'][4]]
    hs = [(-9, 38, 0, sr), (8, 36, 0, pink), (0, 32, 1, sr), (-14, 30, 2, pink), (13, 28, 2, sr)]
    for f in range(5):
        c = Canvas(80, 64)
        for (dx, y0, delay, ramp) in hs:
            age = f - delay
            if age < 0:
                continue
            y = y0 - age * 6 - (age * age) * 0.5
            x = 40 + dx + (1 if age % 2 else 0) * (1 if dx >= 0 else -1)
            if age == 0:
                rows = HEART3
            elif age == 1:
                rows = HEART5
            elif age < 4:
                rows = HEART7
            else:
                rows = HEART5
            gc = glyph_canvas(rows, ramp)
            paste(c, gc, int(round(x - gc.w / 2)), int(round(y - gc.h / 2)))
        paste(sh, c, f * 80, 0)
    return sh


def alert_lines():
    """Yellow surprise lines fanning out above the head."""
    sh = Canvas(400, 64)
    g = R['gold']
    spans = [(11, 14), (10, 17), (11, 20), (14, 21), (17, 21)]
    for f in range(5):
        c = Canvas(80, 64)
        r0, r1 = spans[f]
        cx, cy = 40, 26
        for deg in (200, 235, 270, 305, 340):
            a = math.radians(deg)
            x0, y0 = cx + math.cos(a) * r0, cy + math.sin(a) * r0
            x1, y1 = cx + math.cos(a) * r1, cy + math.sin(a) * r1
            c.thick(x0, y0, x1, y1, 2.2 if f < 4 else 1.6, g[3])
            c.line(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, g[4])
        c.outline(OUTLINE)
        paste(sh, c, f * 80, 0)
    return sh


def puff(c, x, y, r, tones):
    """One soft smoke ball: lit cap upper left, body, a darker underside. No hard outline."""
    lo, body, lit, hi = tones
    c.ellipse(x + 0.4, y + 0.6, r, r * 0.86, lo)
    c.ellipse(x, y, r * 0.92, r * 0.8, body)
    if r >= 2:
        c.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.42, lit)
    if r >= 3:
        c.px(int(x - r * 0.45), int(y - r * 0.45), hi)


def smoke_puffs():
    """A dark curse-smoke cloud billowing up from the feet and tearing apart as it rises."""
    sh = Canvas(400, 64)
    k, sc, pur = R['hair_black'], R['stone_cave'], R['cloth_purple']
    ramp = [k[1], sc[2], sc[3], sc[4], mix(sc[4], pur[4], 0.5)]
    # per frame: clouds, each a list of (dx, y, r) balls that merge into one silhouette
    frames = [
        [[(-6, 58, 3.5), (0, 57, 4.5), (6, 58, 3.5)]],
        [[(-8, 55, 4.5), (0, 52, 6.0), (8, 55, 4.5), (-3, 58, 3.5), (4, 58, 3.5)]],
        [[(-7, 46, 5.0), (1, 43, 6.0), (8, 47, 4.5), (-1, 50, 4.5)], [(-12, 56, 2.5), (11, 55, 2.0)]],
        [[(-9, 36, 4.0), (-3, 33, 4.5)], [(6, 34, 4.0), (10, 37, 3.0)], [(-1, 44, 2.5)]],
        [[(-10, 26, 3.0), (-5, 24, 2.5)], [(8, 24, 2.5)], [(1, 32, 1.8)]],
    ]
    for f, clouds in enumerate(frames):
        c = Canvas(80, 64)
        for cl in clouds:
            body = Canvas(80, 64)
            for (dx, y, r) in cl:
                body.ellipse(40 + dx, y, r, r * 0.88, ramp[2])
            volume(body, ramp)
            if f >= 3:   # the last of it thins at the edges
                for yy in range(64):
                    for xx in range(80):
                        if body.p[xx, yy][3] and body.p[xx, yy][:3] == ramp[0][:3]:
                            body.p[xx, yy] = alpha(ramp[1], 255)
            paste(c, body, 0, 0)
        for m in range(5):
            mx = 40 + int((hsh(m, 5) - 0.5) * 34)
            my = 56 - f * 9 - int(hsh(m, 6) * 14)
            if 4 < my < 62 and (m + f) % 3:
                c.px(mx, my, pur[4]); c.px(mx, my + 1, pur[2])
        paste(sh, c, f * 80, 0)
    return sh


def crescent(c, cx, cy, Ro, th, colors, cut=None):
    """Fill the crescent between a circle (cx, cy, Ro) and the same circle pushed th px right.
    colors(q, x, y) picks a colour from q = 0 (leading edge) .. 1 (trailing edge)."""
    ix, Ri = cx + th, Ro - 0.4
    for y in range(64):
        for x in range(80):
            do = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            di = math.hypot(x + 0.5 - ix, y + 0.5 - cy)
            if do > Ro or di <= Ri:
                continue
            if cut and cut(x, y):
                continue
            a, b = Ro - do, di - Ri
            col = colors(a / (a + b + 1e-6), x, y)
            if col:
                c.p[x, y] = col


def ember_wave():
    """The Ember Wave: a big crescent of fire flying LEFT, with fading afterimages behind it.
    Drawn additively ('lighter'), so every pixel is light; dark reds only glow faintly."""
    sh = Canvas(400, 64)
    fi, e = R['fire'], R['ember']
    # (scale, thickness, afterimages)
    specs = [(0.72, 6.0, 0), (1.0, 8.5, 1), (1.0, 8.0, 2), (1.0, 7.0, 2), (0.98, 5.5, 2)]
    for f in range(5):
        c = Canvas(80, 64)
        sc, th, ghosts = specs[f]
        Ro = 26.0 * sc
        cx, cy = 26 + Ro + (1 - sc) * 10, 38 + (1 - sc) * 6
        # afterimages: thin echoes of the arc trailing to the right
        for g in range(ghosts, 0, -1):
            gx = cx + 5 * g + (1 if f >= 3 else 0)
            tone = fi[2] if g == 1 else fi[1]

            def gcol(q, x, y, tone=tone, g=g):
                if q > 0.55:
                    return None
                if g == 2 and not dither(x, y, 0.5):
                    return None
                return tone
            crescent(c, gx, cy, Ro - g * 0.6, 3.2, gcol)

        def col(q, x, y):
            if q < 0.17:
                return WHITE if f in (1, 2) else fi[4]
            if q < 0.34:
                return fi[4] if q < 0.26 or dither(x, y, 0.4) else fi[3]
            if q < 0.62:
                return fi[3]
            if q < 0.84:
                return fi[2]
            return fi[1] if dither(x, y, 0.55) else e[1]
        # the trailing edge flickers: notch it with a few flame-shaped gaps
        notch = []
        for k in range(5):
            ny = cy - Ro * 0.7 + (k + 0.5) / 5 * Ro * 1.4 + (hsh(k, f, 1) - 0.5) * 4
            notch.append((ny, 1.2 + hsh(k, f, 2) * 1.6))

        def cut(x, y):
            for (ny, w) in notch:
                if abs(y + 0.5 - ny) < w:
                    di = math.hypot(x + 0.5 - (cx + th), y + 0.5 - cy)
                    if di - (Ro - 0.4) < 1.6:
                        return True
            return False
        crescent(c, cx, cy, Ro, th, col, cut)
        # embers shed behind it
        for k in range(2 + f * 2):
            ex = cx - Ro * 0.25 + 6 + hsh(k, 11) * 20 + f * 2
            ey = cy - 20 + hsh(k, 12) * 40 - f * 1.5
            if 0 <= ex < 80 and 0 <= ey < 64:
                c.px(int(ex), int(ey), fi[3] if (k + f) % 2 else fi[4])
        paste(sh, c, f * 80, 0)
    return sh


# ------------------------------------------------------------------ sword swing crescent (3 frames x 2 rows of 64x64)
# Faces LEFT like every sheet; row 0 = normal swings, row 1 = the finisher. The pivot sits on the
# hitbox's back edge (player x -/+ 2) at its middle (player y - 27), so the ellipse's outer edge lands
# exactly on the hitbox: 36 px ahead of the pivot (reach 38) or 40 (reach 42), and 25 px above/below
# (y - 52 .. y - 2). Nothing is drawn past that edge. Drawn in three greys that the game swaps for
# each sword's colours: 255 = the bright leading edge, 200 = core, 140 = trailing inner edge.
SWING_PIVOT = (46, 32)
SWING_SPECS = [   # rx, ry, max thickness, sweep start, sweep end (elliptic angle: 0 = straight ahead, + = down)
    (36.0, 25.0, 7.0, -1.75, 1.15),
    (40.0, 25.0, 9.5, -1.85, 1.25),
]


def swing_frame(row, f):
    rx, ry, T, a0, a1 = SWING_SPECS[row]
    px, py = SWING_PIVOT
    s = (0.0, 0.3, 0.55)[f]        # how much of the tail has already faded
    tk = (1.0, 0.7, 0.42)[f]
    al = (255, 235, 185)[f]
    c = Canvas(64, 64)
    for y in range(64):
        for x in range(64):
            nu, nv = (px - (x + 0.5)) / rx, ((y + 0.5) - py) / ry
            e = math.hypot(nu, nv)
            if e > 1 or e < 0.4:
                continue
            phi = math.atan2(nv, nu)
            t = (phi - a0) / (a1 - a0)
            if not (s <= t <= 1):
                continue
            w = (t - s) / (1 - s)
            prof = math.sin(math.pi * min(1.0, w ** 0.8)) ** 0.75
            th = max(1.0, T * tk * prof)
            d = (1 - e) * math.hypot(rx * math.cos(phi), ry * math.sin(phi))   # px in from the outer edge
            g = None
            if d < th:
                g = 255 if d < 1.0 and th >= 2.0 else 200 if d < th * 0.62 else 140
                if f and w < 0.2 and not dither(x, y, 0.5):
                    g = None                          # the fading tail breaks up
            elif row == 1 and f < 2 and 0.3 < w < 0.9 and abs(d - th - 2.5) < 0.6:
                g = 140                               # the finisher's inner echo
            if g:
                c.px(x, y, (g, g, g, al))
    return c


def swing_sheet():
    sh = Canvas(192, 128)
    for row in range(2):
        for f in range(3):
            paste(sh, swing_frame(row, f), f * 64, row * 64)
    return sh


def fx_sheets():
    cr, sr, sg, sb = R['cloth_red'], R['slime_red'], R['slime_green'], R['slime_blue']
    return {
        'fx/blood': spray((cr[1], cr[2], sr[3], sr[4]), 3),
        'fx/blood_green': spray((sg[1], sg[2], sg[3], sg[4]), 5, goo=True),
        'fx/blood_blue': spray((sb[1], sb[2], sb[3], sb[4]), 7, goo=True),
        'fx/stars': dizzy_stars(),
        'fx/stars_white': impact_stars(),
        'fx/buff': buff_sparkles(),
        'fx/hearts': heart_burst(),
        'fx/lines_yellow': alert_lines(),
        'fx/debuff_black': smoke_puffs(),
        'fx/curved_orange': ember_wave(),
    }


# ------------------------------------------------------------------ slimes (8 cols x 3 rows of 32x32)
# Row 0 idle (5 frames), row 1 hop (8 frames: windup x2, launch, rise, apex, fall, fall fast, land),
# row 2 death (6 frames). Drawn front-on (the game never mirrors them). The hop frames carry the
# rise baked in (HOP_OFF in enemies.js), which the game cancels when it draws them.
HOP_OFF = [0, 0, 6, 10, 12, 10, 6, 0]


def slime_blob(W, H, bottom, ramp, air=0.0, cx=16.0, wob=0.0):
    """A glossy jelly dome W x H whose lowest row is `bottom`. air rounds the underside (0..1)."""
    c = Canvas(32, 32)
    top = bottom - H + 1
    c0 = 0.34 + 0.12 * air            # height (from the bottom) of the widest point
    pts = []
    for y in range(top, bottom + 1):
        h = (bottom + 1 - (y + 0.5)) / H
        if h >= c0:
            q = (h - c0) / (1 - c0)
            f = max(0.0, 1 - q ** 2.1) ** 0.5
        else:
            q = (c0 - h) / c0
            f = max(0.0, 1 - (0.32 + 0.6 * air) * q * q) ** 0.5
        hw = W / 2 * f + wob * math.sin(h * 6)
        for x in range(32):
            if abs(x + 0.5 - cx) <= hw:
                pts.append((x, y))
    ys = (top + bottom + 1) / 2
    for (x, y) in pts:
        u = (x + 0.5 - cx) / (W / 2)
        v = (y + 0.5 - ys) / (H / 2)
        b = sphere(max(-1, min(1, u)) * 0.85, max(-1, min(1, v)) * 0.85)
        i = band(b, (-0.25, 0.25, 0.62))     # 0..3 -> ramp[0..3]
        c.p[x, y] = ramp[[1, 1, 2, 3][i]] if i else ramp[1]
    m = c.mask()

    def on(x, y):
        return 0 <= x < 32 and 0 <= y < 32 and m[y][x]

    for (x, y) in pts:
        u = (x + 0.5 - cx) / (W / 2)
        v = (y + 0.5 - ys) / (H / 2)
        # translucent glow: light passing through pools inside the lower right rim
        if v > 0.25 and u > -0.1 and (not on(x + 2, y) or not on(x + 1, y + 2)) and on(x + 1, y) and on(x, y + 1):
            c.p[x, y] = ramp[3]
        if not on(x, y + 1) or (not on(x + 1, y) and v > -0.2):
            c.p[x, y] = ramp[0] if v > 0.3 else ramp[1]
        # specular: a bright curved streak and a dot, upper left
        d = math.hypot(u + 0.42, v + 0.38)
        if 0.16 < d < 0.32 and u < -0.3 and v < -0.15:
            c.p[x, y] = ramp[4]
    sx, sy = int(cx - W * 0.16), int(top + H * 0.2)
    if H >= 8:
        c.px(sx, sy, ramp[4])
    return c, top


def slime_face(c, W, H, top, kind, mood='idle', cx=16.0):
    if H < 4 or mood == 'gone':
        return
    K = OUTLINE
    ey = top + max(2, int(round(H * 0.42)))
    gap = max(2, int(round(W * 0.17)))
    lx, rx = int(cx) - gap - 1, int(cx) + gap - 1      # left edge of each 2px-wide eye
    eh = 3 if H >= 11 else 2 if H >= 7 else 1
    if mood == 'dead':
        for ex in (lx - 1, rx):
            grid(c, ex, ey - 1, ["x.x", ".x.", "x.x"], {'x': K})
        return
    for ex in (lx, rx):
        for yy in range(eh):
            c.px(ex, ey + yy, K)
            c.px(ex + 1, ey + yy, K)
        if eh >= 2:
            c.px(ex, ey, WHITE)
    my = ey + eh + 1
    if kind == 'green':        # a happy little open mouth
        c.px(15, my, K); c.px(16, my, K)
        if H >= 10:
            c.px(15, my + 1, R['slime_red'][2]); c.px(16, my + 1, R['slime_red'][2])
    elif kind == 'blue':       # a calm smile
        c.px(14, my, K); c.px(17, my, K); c.px(15, my + 1, K); c.px(16, my + 1, K)
    else:                      # red: angry brows and a set frown
        for (x, y) in [(lx - 1, ey - 2), (lx, ey - 2), (lx + 1, ey - 1), (rx + 2, ey - 2), (rx + 1, ey - 2), (rx, ey - 1)]:
            c.px(x, y, K)
        c.px(15, my, K); c.px(16, my, K); c.px(14, my + 1, K); c.px(17, my + 1, K)


def slime_frame(kind, W, H, rise=0, air=0.0, mood='idle', extra=None):
    ramp = R['slime_' + kind]
    bottom = 30 - rise
    c, top = slime_blob(W, H, bottom, ramp, air)
    slime_face(c, W, H, top, kind, mood)
    if extra:
        extra(c, ramp, top, bottom)
    c.outline(OUTLINE)
    return c


def slime_sheet(kind):
    frames = [[], [], []]
    # idle: a slow breath
    for i in range(5):
        s = math.sin(i / 5 * TAU)
        H = 12 + int(round(s * 0.8 + 0.2))
        W = 18 - int(round(s * 0.8 + 0.2)) + (1 if i == 3 else 0)
        frames[0].append(slime_frame(kind, W, H))
    # hop
    hop = [(20, 10, 0.0), (23, 8, 0.0), (13, 17, 0.5), (15, 15, 0.7), (18, 13, 0.9), (16, 14, 0.8), (14, 16, 0.6), (24, 8, 0.0)]
    for i, (W, H, air) in enumerate(hop):
        frames[1].append(slime_frame(kind, W, H, HOP_OFF[i], air))
    # death: splat, melt into a puddle, pop
    def drips(c, ramp, top, bottom, n=2):
        for k, dx in enumerate((-6, 5, -1)[:n]):
            yy = top - 2 - k * 2
            c.px(16 + dx, yy, ramp[3]); c.px(16 + dx, yy + 1, ramp[2])

    def bubbles(c, ramp, top, bottom):
        for dx in (-5, 3, 8):
            c.px(16 + dx, top - 1, ramp[3])

    death = [(21, 10, 'dead', None), (23, 7, 'dead', None), (25, 5, 'idle', bubbles), (25, 3, 'none', drips),
             (23, 2, 'none', None), (17, 1, 'none', None)]
    for (W, H, mood, ex) in death:
        frames[2].append(slime_frame(kind, W, H, 0, 0.0, mood if mood != 'none' else 'gone', ex))
    return frames_to_sheet(frames, 32, 32, cols=8)


# ------------------------------------------------------------------ pets (32x32: row 0 idle, row 1 run; facing LEFT)
# actors.js Pet mirrors the sheet when facing right. Feet stand on row 30 (outline on 31).
def rimshade(c, t):
    """Shade a flat part: lit top edge (brightest at its top-left), shaded underside and right side."""
    m = c.mask()

    def on(x, y):
        return 0 <= x < c.w and 0 <= y < c.h and m[y][x]

    for y in range(c.h):
        for x in range(c.w):
            if not m[y][x]:
                continue
            col = t[2]
            if not on(x, y - 1):
                col = t[4] if not on(x - 1, y) else t[3]
            elif not on(x, y + 1):
                col = t[1]
            elif not on(x + 1, y):
                col = t[1]
            c.p[x, y] = col


def part(c, tones, draw):
    """Draw a silhouette with draw(p), shade it, and lay it over c."""
    p = Canvas(c.w, c.h)
    draw(p)
    rimshade(p, tones)
    paste(c, p, 0, 0)
    return p


def lighter(t, k=1):
    return tuple([t[min(len(t) - 1, i + k)] for i in range(len(t))])


def darker(t, k=1):
    return tuple([t[max(0, i - k)] for i in range(len(t))])


def leg(p, hip, foot, w=2, paw=True):
    p.thick(hip[0], hip[1], foot[0], foot[1], w, (255, 0, 0, 255))
    if paw and w >= 2:
        p.px(int(foot[0]) - 2, int(foot[1]), (255, 0, 0, 255))


# run cycle: (front near dx, front far dx, back near dx, back far dx, front lift, back lift, body dy)
GALLOP = [(-4, -3, 4, 3, 1, 1, 0), (-2, -1, 2, 3, 0, 2, 0), (1, 2, -1, 0, 1, 0, -1),
          (2, 3, -2, -1, 2, 2, -2), (-1, 0, 0, 1, 2, 1, -1), (-3, -2, 3, 2, 1, 0, 0)]


RED = (255, 0, 0, 255)   # placeholder ink for silhouettes (always re-shaded)


def dog_frame(by=0, tail=60, tongue=False, ear='hang', run=None, breath=0.0):
    """Biscuit: a friendly brown dog with a red collar."""
    t = R['fur_tan']
    T = (t[0], t[1], t[2], t[3], t[4])
    c = Canvas(32, 32)
    fnd, ffd, bnd, bfd, fl, bl, rdy = run if run else (0, 0, 0, 0, 0, 0, 0)
    by += rdy
    hipy = 25 + by
    part(c, darker(T), lambda p: (leg(p, (14.5, hipy), (14.5 + ffd, 30.5 - fl)), leg(p, (20.5, hipy), (20.5 + bfd, 30.5 - bl))))
    part(c, T, lambda p: (leg(p, (12, hipy), (12 + fnd, 30.5 - fl)), leg(p, (23, hipy), (23 + bnd, 30.5 - bl))))
    a = math.radians(tail)
    tx, ty = 24.5 + 5 * math.cos(a), 20.5 + by - 5 * math.sin(a)
    part(c, T, lambda p: p.thick(23.5, 21.5 + by, tx, ty, 2.2, RED))
    c.px(int(tx), int(ty), t[4])
    part(c, T, lambda p: (p.ellipse(18, 22.8 + by, 7.0 + breath, 3.5 + breath * 0.5, RED),
                          p.ellipse(13, 23.2 + by, 3.6, 3.6, RED)))
    # white chest blaze
    for (x, y) in [(10, 22), (10, 23), (11, 23), (10, 24), (11, 24), (11, 25)]:
        c.px(x, y + by, t[4])
    # head: skull, muzzle, ear
    hy = 17.2 + by + (1 if run and rdy < -1 else 0)
    part(c, T, lambda p: p.ellipse(10, hy, 4.2, 3.8, RED))
    part(c, lighter(T), lambda p: p.ellipse(6.4, hy + 1.8, 2.9, 2.0, RED))
    E = darker(T, 1)
    if ear == 'hang':
        part(c, E, lambda p: p.poly([(10.5, hy - 3.6), (14.2, hy - 3.0), (14.4, hy + 3.2), (11.6, hy + 3.8)], RED))
    else:
        part(c, E, lambda p: p.poly([(11, hy - 3.4), (14, hy - 3.8), (18, hy - 1.4), (13.5, hy + 0.4)], RED))
    yy = int(hy)
    c.px(8, yy - 1, OUTLINE); c.px(8, yy, OUTLINE)            # eye
    c.px(7, yy - 2, t[1])                                      # brow
    c.px(3, yy + 1, OUTLINE); c.px(4, yy + 1, OUTLINE)        # nose
    c.px(4, yy + 2, t[1])
    c.px(5, yy + 3, t[1]); c.px(6, yy + 3, t[1])              # mouth line
    if tongue:
        c.px(6, yy + 4, R['blossom'][2]); c.px(7, yy + 4, R['blossom'][3])
    cr = R['cloth_red']
    for (x, y) in [(11, yy + 3), (12, yy + 3), (13, yy + 3), (14, yy + 2)]:
        c.px(x, y, cr[3])
    c.px(12, yy + 4, R['gold'][4])
    c.outline(OUTLINE)
    return c


def dog_sheet():
    idle = [dog_frame(0, 55, False, breath=0.0), dog_frame(0, 82, True, breath=0.3), dog_frame(0, 58, True, breath=0.4),
            dog_frame(0, 84, False, breath=0.2), dog_frame(0, 66, True, breath=0.0)]
    run = [dog_frame(0, 25 + (k % 2) * 8, k % 3 == 0, 'flap', GALLOP[k]) for k in range(6)]
    return frames_to_sheet([idle, run], 32, 32, cols=6)


TROT = [(-2, -1, 2, 1, 1, 0, 0), (-1, 0, 1, 2, 0, 1, -1), (1, 1, -1, 0, 0, 1, -1),
        (2, 1, -2, -1, 1, 0, 0), (0, -1, 0, -1, 1, 0, -1), (-1, -2, 1, 2, 0, 1, -1)]


def cat_frame(sit=True, breath=0.0, tail=0, blink=False, ear=0, run=None):
    """A fat orange tabby. Sitting for idle, a waddling trot for run."""
    o = R['fur_orange']
    T = (o[0], o[1], o[2], o[3], o[4])
    L = R['cloth_linen']
    CR = (L[1], L[2], L[3], L[4], L[4])
    c = Canvas(32, 32)
    if sit:
        # tail curling up behind
        tips = [(28.5, 20.5), (29.5, 18.5), (28.0, 18.0)]
        tx, ty = tips[tail]
        part(c, T, lambda p: (p.thick(24, 28.5, 27.6, 26.5, 2.4, RED), p.thick(27.6, 26.5, tx, ty, 2.2, RED)))
        c.px(int(tx), int(ty), o[4])
        part(c, T, lambda p: (p.ellipse(18.5, 25.2 - breath * 0.5, 7.4 + breath, 5.6 + breath * 0.5, RED),
                              p.ellipse(13.4, 24.6, 4.2, 5.4, RED)))
        # tabby stripes on the haunch
        for (x, y) in [(20, 21), (20, 22), (23, 22), (23, 23), (17, 21)]:
            c.px(x, y, o[1])
        # cream chest and front paws
        for (x, y) in [(10, 22), (10, 23), (11, 23), (10, 24), (11, 24), (10, 25), (11, 26)]:
            c.px(x, y, L[4])
        part(c, CR, lambda p: (p.rect(10, 29, 3, 2, RED), p.rect(13, 29, 3, 2, RED)))
        c.px(12, 30, L[2]); c.px(15, 30, L[2])
        hx, hy = 12.0, 16.6
    else:
        fnd, ffd, bnd, bfd, fl, bl, rdy = run
        hipy = 26 + rdy
        part(c, darker(T), lambda p: (leg(p, (14.5, hipy), (14.5 + ffd, 30.5 - fl), paw=False),
                                      leg(p, (21, hipy), (21 + bfd, 30.5 - bl), paw=False)))
        part(c, T, lambda p: (leg(p, (12, hipy), (12 + fnd, 30.5 - fl), paw=False),
                              leg(p, (23.5, hipy), (23.5 + bnd, 30.5 - bl), paw=False)))
        tw = (rdy + 1) * 0.6
        part(c, T, lambda p: (p.thick(24.5, 22 + rdy, 27.5, 18.5 + rdy, 2.4, RED), p.thick(27.5, 18.5 + rdy, 27 + tw, 14.5 + rdy, 2.2, RED)))
        part(c, T, lambda p: (p.ellipse(18.2, 23.2 + rdy, 8.0, 4.4, RED), p.ellipse(12.5, 23.4 + rdy, 4.0, 4.0, RED)))
        for (x, y) in [(18, 20), (18, 21), (21, 20), (21, 21), (15, 20)]:
            c.px(x, y + rdy, o[1])
        for x in range(13, 23):
            c.px(x, 27 + rdy, L[3])
        for (x, y) in [(10, 23), (10, 24), (11, 24), (11, 25)]:
            c.px(x, y + rdy, L[4])
        hx, hy = 10.5, 18.2 + rdy
    # head (big and round), ears, muzzle
    eo = ear

    def ears(p):
        p.poly([(hx - 3.6, hy - 2.0), (hx - 2.8, hy - 6.4 + eo), (hx - 0.4, hy - 3.2)], RED)
        p.poly([(hx + 0.6, hy - 3.4), (hx + 2.6, hy - 6.6), (hx + 3.8, hy - 2.0)], RED)
    part(c, T, ears)
    part(c, T, lambda p: (p.ellipse(hx, hy, 4.8, 4.0, RED), p.ellipse(hx + 0.4, hy + 1.4, 5.0, 2.8, RED)))
    c.px(int(hx - 3), int(hy - 4 + eo), R['blossom'][2])
    c.px(int(hx + 2), int(hy - 4), R['blossom'][2])
    # forehead stripes
    for (dx, dy) in [(0, -3), (1, -3), (0, -2)]:
        c.px(int(hx) + dx, int(hy) + dy, o[1])
    part(c, CR, lambda p: p.ellipse(hx - 2.6, hy + 1.8, 2.3, 1.5, RED))
    yy = int(hy)
    x0 = int(hx)
    c.px(x0 - 5, yy + 1, R['blossom'][2])                      # nose
    c.px(x0 - 4, yy + 2, OUTLINE)                               # mouth
    if blink:
        c.px(x0 - 3, yy, OUTLINE); c.px(x0 - 2, yy, OUTLINE)
        c.px(x0 + 1, yy, OUTLINE); c.px(x0 + 2, yy, OUTLINE)
    else:
        for ex in (x0 - 3, x0 + 1):
            c.px(ex, yy - 1, R['leaf'][4]); c.px(ex, yy, OUTLINE)
            c.px(ex + 1, yy - 1, OUTLINE); c.px(ex + 1, yy, OUTLINE)
    c.outline(OUTLINE)
    return c


def cat_sheet():
    idle = [cat_frame(True, 0.0, 0), cat_frame(True, 0.4, 0), cat_frame(True, 0.5, 1, ear=1),
            cat_frame(True, 0.3, 2), cat_frame(True, 0.0, 0, blink=True), cat_frame(True, 0.0, 1)]
    run = [cat_frame(False, run=TROT[k]) for k in range(6)]
    return frames_to_sheet([idle, run], 32, 32, cols=6)


def fox_frame(tail=0.0, ear=0, head=0, run=None):
    """A red fox: slender, black socks, a white-tipped brush of a tail."""
    h = R['hair_red']
    T = (h[0], h[1], h[2], h[3], h[4])
    L = R['cloth_linen']
    W = (L[1], L[2], L[3], L[4], L[4])
    k = R['hair_black']
    D = (k[0], k[0], k[1], k[2], k[3])
    c = Canvas(32, 32)
    fnd, ffd, bnd, bfd, fl, bl, rdy = run if run else (0, 0, 0, 0, 0, 0, 0)
    hipy = 24 + rdy
    legs_far = lambda p: (leg(p, (14.5, hipy), (14.5 + ffd, 30.5 - fl), 1.8, False), leg(p, (20.5, hipy), (20.5 + bfd, 30.5 - bl), 1.8, False))
    legs_near = lambda p: (leg(p, (12, hipy), (12 + fnd, 30.5 - fl), 1.8, False), leg(p, (22.5, hipy), (22.5 + bnd, 30.5 - bl), 1.8, False))
    for fn, tones in ((legs_far, darker(T)), (legs_near, T)):
        p = Canvas(32, 32)
        fn(p)
        rimshade(p, tones)
        for y in range(27 + rdy - (1 if fl or bl else 0), 32):
            for x in range(32):
                if p.p[x, y][3]:
                    p.p[x, y] = D[2] if tones is T else D[1]
        paste(c, p, 0, 0)
    # the brush: thick, sweeping down and back, white tip
    if run:
        tb, tt = (23.5, 21 + rdy), (29.5, 19.5 + rdy - tail)
    else:
        tb, tt = (23.5, 21.5), (28.2, 26.2 - tail)
    part(c, T, lambda p: (p.thick(tb[0], tb[1], tt[0], tt[1], 3.6, RED), p.thick(tb[0] + 1, tb[1] + 0.5, (tb[0] + tt[0]) / 2 + 1, (tb[1] + tt[1]) / 2, 4.4, RED)))
    part(c, W, lambda p: p.ellipse(tt[0] + 0.6, tt[1] + 0.4, 1.9, 1.7, RED))
    part(c, T, lambda p: (p.ellipse(18, 22.2 + rdy, 6.4, 3.0, RED), p.ellipse(13.2, 22.6 + rdy, 3.2, 3.2, RED)))
    for (x, y) in [(11, 22), (11, 23), (12, 24), (11, 24), (12, 25)]:
        c.px(x, y + rdy, L[4])
    # head: pointed snout, tall ears with dark tips, white jaw
    hy = 16.8 + rdy + head
    ec = ear

    def ears(p):
        p.poly([(8.2, hy - 2.0), (8.8 + ec, hy - 7.2 + abs(ec)), (11.2, hy - 2.6)], RED)
        p.poly([(10.8, hy - 2.6), (12.6 + ec, hy - 7.4 + abs(ec)), (13.6, hy - 1.6)], RED)
    ep = part(c, T, ears)
    part(c, T, lambda p: (p.ellipse(10.2, hy, 3.4, 3.0, RED), p.poly([(8.4, hy - 1.4), (2.6, hy + 1.8), (8.6, hy + 2.6)], RED)))
    part(c, W, lambda p: p.poly([(9.6, hy + 1.0), (3.4, hy + 2.0), (8.4, hy + 3.0), (11, hy + 2.6)], RED))
    # dark ear tips (top two rows of each ear)
    tops = {}
    for y in range(32):
        for x in range(32):
            if ep.p[x, y][3]:
                tops.setdefault(x, y)
    for x, y in tops.items():
        if c.p[x, y][3]:
            c.p[x, y] = D[2]
            if c.p[x, y + 1][3] and y + 1 < hy - 4:
                c.p[x, y + 1] = D[3]
    yy = int(hy)
    c.px(8, yy - 1, OUTLINE); c.px(7, yy - 1, OUTLINE)       # narrow eye
    c.px(2, yy + 1, OUTLINE); c.px(3, yy + 1, OUTLINE)       # nose
    c.outline(OUTLINE)
    return c


def fox_sheet():
    idle = [fox_frame(0.0), fox_frame(1.0), fox_frame(1.6, ear=1), fox_frame(0.8), fox_frame(0.0, head=1)]
    run = [fox_frame(0.6 * (k % 2), ear=1, run=GALLOP[k]) for k in range(6)]
    return frames_to_sheet([idle, run], 32, 32, cols=6)


# ------------------------------------------------------------------ wisp (5 frames of 32x32, facing LEFT)
def wisp_frame(f):
    """A pale-blue spirit flame: round glowing head, a flickering tail streaming back to the right."""
    wa, gh = R['water'], R['skin_ghost']
    ramp = [wa[1], wa[3], wa[4], gh[3], gh[4]]
    ph = f / 5 * TAU
    c = Canvas(32, 32)
    hx, hy = 13.5, 18.0 + (1 if f in (1, 2) else 0)
    # spine of the tail: from the head back and up, wobbling
    spine = []
    for i in range(13):
        s = i / 12
        x = hx + 11.5 * s
        y = hy - 7.5 * s - 2.0 * math.sin(math.pi * s) + 1.3 * s * math.sin(ph + s * 7)
        r = 4.6 * (1 - s) ** 0.85 + 0.35
        spine.append((x, y, r))
    q = {}
    for y in range(32):
        for x in range(32):
            best = 9
            for (sx, sy, r) in spine:
                d = math.hypot(x + 0.5 - sx, y + 0.5 - sy) / r
                if d < best:
                    best = d
            if best <= 1:
                q[(x, y)] = best
    for (x, y), v in q.items():
        dh = math.hypot(x + 0.5 - hx + 0.8, y + 0.5 - hy + 0.8) / 4.6
        if dh < 0.45:
            col = ramp[4]
        elif v < 0.55 or dh < 0.75:
            col = ramp[3]
        elif v < 0.82:
            col = ramp[2]
        else:
            col = ramp[1]
        c.p[x, y] = col
    # a spark or two breaking off the tail tip
    for k in range(2):
        sx = int(hx + 12 + k * 2 + (f + k) % 3)
        sy = int(hy - 10 - k * 3 - (f % 3))
        if (f + k) % 2 == 0:
            c.px(sx, sy, ramp[3])
    # eyes
    ex, ey = int(hx) - 2, int(hy) - 1
    for x in (ex, ex + 3):
        c.px(x, ey, wa[0]); c.px(x, ey + 1, wa[0])
    c.outline(alpha(ramp[1], 255))
    # soft glow: two flat rings of light
    g1 = Canvas(32, 32)
    paste(g1, c, 0, 0)
    g1.outline(alpha(ramp[2], 110))
    g2 = Canvas(32, 32)
    paste(g2, g1, 0, 0)
    g2.outline(alpha(ramp[2], 45))
    paste(g2, g1, 0, 0)
    return g2


def wisp_sheet():
    return frames_to_sheet([[wisp_frame(f) for f in range(5)]], 32, 32)


# ------------------------------------------------------------------ the Shrine Spirit (13 frames of 64x64) and portrait
def spirit_ramps():
    pu, bl, li = R['cloth_purple'], R['blossom'], R['cloth_linen']
    robe = [mix(pu[3], pu[4], 0.6), mix(pu[4], bl[4], 0.55), mix(bl[4], li[4], 0.55), mix(li[4], WHITE, 0.5), WHITE]
    sp = R['skin_pale']
    skin = [sp[1], sp[2], sp[3], sp[4], WHITE]
    hb = R['hair_blond']
    hair = [hb[1], hb[2], hb[3], hb[4], mix(hb[4], WHITE, 0.6)]
    return robe, skin, hair


def glow_rings(c, col, a1=90, a2=40):
    """Two flat rings of light around everything on c (soft glow without blur)."""
    g1 = Canvas(c.w, c.h)
    paste(g1, c, 0, 0)
    g1.outline(alpha(col, a1))
    g2 = Canvas(c.w, c.h)
    paste(g2, g1, 0, 0)
    g2.outline(alpha(col, a2))
    paste(g2, g1, 0, 0)
    return g2


def halo(c, cx, cy, r, n):
    """A thin golden ring behind the figure (painted only where nothing is drawn yet)."""
    g = R['gold']
    for k in range(n):
        a = k / n * TAU
        x, y = int(cx + math.cos(a) * r), int(cy + math.sin(a) * r)
        lit = -0.7 * math.cos(a) - 0.7 * math.sin(a)
        if c.inb(x, y) and c.p[x, y][3] == 0:
            c.p[x, y] = alpha(g[4] if lit > 0.25 else g[3], 230 if lit > 0.25 else 170)


def face_shade(fc, skin, cx, cy, rx, ry):
    """Soft face light: warm highlight upper left, one shade step on the right edge and under the chin."""
    m = fc.mask()
    for y in range(fc.h):
        for x in range(fc.w):
            if not m[y][x]:
                continue
            u, v = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            col = skin[3]
            if u < -0.15 and v < 0.1:
                col = skin[4] if u + v < -0.75 else skin[3]
            if x + 1 >= fc.w or not m[y][x + 1] or y + 1 >= fc.h or not m[y + 1][x]:
                col = skin[2]
            fc.p[x, y] = col


def spirit_frame(f):
    ph = f / 13 * TAU
    robe, skin, hair = spirit_ramps()
    g, fi = R['gold'], R['fire']
    c = Canvas(64, 64)
    drift = math.sin(ph)
    # long hair falling behind the shoulders
    hb = Canvas(64, 64)
    hb.ellipse(32, 19.2, 5.6, 6.0, RED)
    d = drift * 1.3
    hb.poly([(26.6, 18), (24.6, 29), (23.4 + d, 39.5), (25.6 + d, 41), (27.8, 34), (28.5, 26)], RED)
    hb.poly([(37.4, 18), (39.4, 29), (40.6 + d, 39.5), (38.4 + d, 41), (36.2, 34), (35.5, 26)], RED)
    volume(hb, hair)
    paste(c, hb, 0, 0)
    # the gown: fitted bodice, flaring skirt that frays into four flame-like tails
    gw = Canvas(64, 64)
    tips = []
    for k, (tx, ty) in enumerate([(41.0, 56.5), (35.6, 60.0), (29.4, 59.0), (23.4, 56.0)]):
        tips.append((tx + 1.7 * math.sin(ph + k * 0.95), ty + 0.6 * math.sin(ph * 2 + k)))
    notch = [(38.4, 52.0), (32.4, 53.0), (26.6, 52.0)]
    pts = [(25.2, 27.6), (38.8, 27.6), (37.6, 36.0), (42.4, 47.5), (43.8, 50.8),
           tips[0], notch[0], tips[1], notch[1], tips[2], notch[2], tips[3], (20.2, 50.8), (21.6, 47.5), (26.4, 36.0)]
    gw.poly(pts, RED)
    gw.ellipse(32, 28.2, 7.2, 1.8, RED)
    volume(gw, robe)
    # folds: shadowed creases with a lit edge beside them
    for (x0, x1, y1, s) in [(29.6, 28.8, 56, tips[2][0] - 29.4), (34.6, 35.2, 58, tips[1][0] - 35.6)]:
        for y in range(38, int(y1)):
            t = (y - 38) / (y1 - 38)
            x = x0 + (x1 - x0) * t + s * t * t * 0.6
            if gw.p[int(x), y][3]:
                gw.p[int(x), y] = robe[1]
                if gw.p[int(x) - 1, y][3]:
                    gw.p[int(x) - 1, y] = robe[3]
    # golden sash
    for x in range(26, 39):
        if gw.p[x, 36][3]:
            gw.p[x, 36] = g[3] if x < 33 else g[2]
            gw.p[x, 37] = g[2] if x < 33 else g[1]
    for (x, y) in [(31, 38), (31, 39), (32, 38), (32, 40)]:
        gw.p[x, y] = g[2]
    paste(c, gw, 0, 0)
    # bell sleeves meeting at the clasped hands
    sl = Canvas(64, 64)
    sw = 0.6 * math.sin(ph + 1.0)
    sl.poly([(25.4, 28), (22.8, 32), (21.6 + sw, 39.5), (24.6 + sw, 41.2), (28.4, 37.6), (31.0, 34.6), (29.4, 30)], RED)
    sl.poly([(38.6, 28), (41.2, 32), (42.4 + sw, 39.5), (39.4 + sw, 41.2), (35.6, 37.6), (33.0, 34.6), (34.6, 30)], RED)
    volume(sl, [robe[0], robe[1], robe[2], robe[3], robe[4]])
    outline_skip(sl, robe[0])
    paste(c, sl, 0, 0)
    # hands cupping a little ember (the light of Emberwick)
    for (x, y, col) in [(30, 34, skin[2]), (31, 34, skin[3]), (32, 34, skin[3]), (33, 34, skin[2]),
                        (30, 33, skin[3]), (33, 33, skin[2]), (31, 35, skin[1]), (32, 35, skin[1])]:
        c.px(x, y, col)
    flick = [["..4.", ".43.", ".43.", "432."], [".4..", ".44.", "433.", "432."], ["..4.", ".34.", ".43.", "432."]][f % 3]
    grid(c, 30, 29, flick, {'4': fi[4], '3': fi[3], '2': fi[2]})
    c.px(31, 32, WHITE)
    # collar trim
    for (x, y) in [(28, 28), (29, 29), (30, 30), (35, 28), (34, 29), (33, 30), (31, 31), (32, 31)]:
        c.px(x, y, g[3])
    # neck and face
    c.rect(31, 25, 2, 2, skin[1])
    fc = Canvas(64, 64)
    fc.ellipse(32, 20.6, 3.8, 4.4, RED)
    face_shade(fc, skin, 32, 20.6, 3.8, 4.4)
    paste(c, fc, 0, 0)
    # hair in front: bangs parted in the middle, locks framing the face
    hf = Canvas(64, 64)
    hf.poly([(27.6, 18.6), (28.0, 15.4), (31.2, 14.2), (32.0, 16.6), (29.6, 17.0)], RED)
    hf.poly([(36.4, 18.6), (36.0, 15.4), (32.8, 14.2), (32.0, 16.6), (34.4, 17.0)], RED)
    hf.poly([(27.4, 17.0), (28.8, 18.0), (28.8, 25.5), (27.6 + d * 0.4, 27.6), (26.8, 24.0)], RED)
    hf.poly([(36.6, 17.0), (35.2, 18.0), (35.2, 25.5), (36.4 + d * 0.4, 27.6), (37.2, 24.0)], RED)
    volume(hf, hair)
    paste(c, hf, 0, 0)
    # circlet with an ember stone
    for x in range(29, 35):
        if c.p[x, 17][3]:
            c.p[x, 17] = g[3]
    c.px(31, 16, fi[4]); c.px(32, 16, fi[3]); c.px(31, 17, fi[3]); c.px(32, 17, fi[2])
    # serene closed eyes, soft mouth, a little blush
    lil = R['cloth_purple'][1]
    for (x, y) in [(29, 21), (30, 21), (33, 21), (34, 21), (29, 20), (34, 20)]:
        c.px(x, y, lil if y == 21 else skin[1])
    c.px(31, 23, R['blossom'][2]); c.px(32, 23, R['blossom'][2])
    c.px(29, 22, R['blossom'][3]); c.px(34, 22, R['blossom'][3])
    outline_skip(c, OUTLINE_SOFT)
    halo(c, 32, 19.5, 8.6, 64)
    # halo twinkle
    if f in (3, 4, 9):
        sx, sy = (25, 13) if f != 9 else (39, 14)
        sparkle(c, sx, sy, 2 if f == 4 else 1, WHITE, g[4], g[3])
    a1 = 85 + int(20 * math.sin(ph))
    return glow_rings(c, R['gold'][4], a1, 35)


def spirit_sheet():
    return frames_to_sheet([[spirit_frame(f) for f in range(13)]], 64, 64)


def scale2x(cv):
    """EPX: doubles pixel art while rounding diagonal steps (matches the engine's portrait scaler)."""
    w, h = cv.w, cv.h
    o = Canvas(w * 2, h * 2)
    for y in range(h):
        for x in range(w):
            P = cv.p[x, y]
            A = cv.p[x, y - 1] if y > 0 else P
            D = cv.p[x, y + 1] if y < h - 1 else P
            C = cv.p[x - 1, y] if x > 0 else P
            B = cv.p[x + 1, y] if x < w - 1 else P
            o.p[2 * x, 2 * y] = A if (C == A and C != D and A != B) else P
            o.p[2 * x + 1, 2 * y] = B if (A == B and A != C and B != D) else P
            o.p[2 * x, 2 * y + 1] = C if (D == C and D != B and C != A) else P
            o.p[2 * x + 1, 2 * y + 1] = D if (B == D and B != A and D != C) else P
    return o


def expand_48_to_64(cv):
    """The dialog draws this 64x64 portrait into a 48x48 box with nearest-neighbour sampling. Of each
    group of 4 source pixels it takes the 1st, the 4th, and the 2nd or 3rd (that sample sits exactly
    on their shared edge, so rounding decides). Doubling the middle art pixel into both makes the
    48px art come back untouched either way."""
    o = Canvas(64, 64)

    def src(i):
        return (i // 4) * 3 + (0, 1, 1, 2)[i % 4]

    for y in range(64):
        for x in range(64):
            o.p[x, y] = cv.p[src(x), src(y)]
    return o


def spirit_portrait_24():
    robe, skin, hair = spirit_ramps()
    g, fi = R['gold'], R['fire']
    c = Canvas(24, 24)
    hb = Canvas(24, 24)
    hb.ellipse(12, 10, 7.0, 7.4, RED)
    hb.poly([(5.2, 10), (3.4, 18), (2.8, 24), (8, 24), (8, 14)], RED)
    hb.poly([(18.8, 10), (20.6, 18), (21.2, 24), (16, 24), (16, 14)], RED)
    volume(hb, hair)
    paste(c, hb, 0, 0)
    sh = Canvas(24, 24)
    sh.poly([(4, 24), (5.4, 19.6), (9, 18.2), (15, 18.2), (18.6, 19.6), (20, 24)], RED)
    volume(sh, robe)
    paste(c, sh, 0, 0)
    for (x, y) in [(9, 18), (10, 19), (11, 20), (14, 18), (13, 19), (12, 20)]:
        c.px(x, y, g[3])
    c.px(11, 21, fi[3]); c.px(12, 21, fi[4])
    c.rect(11, 16, 2, 2, skin[1])
    fc = Canvas(24, 24)
    fc.ellipse(12, 11.2, 4.9, 5.6, RED)
    face_shade(fc, skin, 12, 11.2, 4.9, 5.6)
    paste(c, fc, 0, 0)
    hf = Canvas(24, 24)
    hf.poly([(6.8, 10.2), (7.2, 6.2), (11.2, 4.4), (12.0, 7.2), (9.0, 7.6)], RED)
    hf.poly([(17.2, 10.2), (16.8, 6.2), (12.8, 4.4), (12.0, 7.2), (15.0, 7.6)], RED)
    hf.poly([(6.6, 8.0), (8.0, 9.0), (8.0, 17.5), (6.6, 19.0), (5.8, 14.0)], RED)
    hf.poly([(17.4, 8.0), (16.0, 9.0), (16.0, 17.5), (17.4, 19.0), (18.2, 14.0)], RED)
    volume(hf, hair)
    paste(c, hf, 0, 0)
    for x in range(8, 16):
        if c.p[x, 7][3] and c.p[x, 7] != skin[3]:
            c.p[x, 7] = g[3]
    c.px(11, 6, fi[4]); c.px(12, 6, fi[3]); c.px(11, 7, fi[3]); c.px(12, 7, fi[2])
    # gentle eyes with a glint (amber, like embers), lashes, soft mouth, blush
    lil = R['cloth_purple'][1]
    for lx in (9, 14):
        c.px(lx, 10, lil); c.px(lx + 1, 10, lil)
        c.px(lx, 11, WHITE); c.px(lx + 1, 11, lil)
        c.px(lx, 12, lil); c.px(lx + 1, 12, fi[2])
    c.px(8, 10, lil); c.px(16, 10, lil)
    c.px(12, 13, skin[2])
    c.px(11, 15, R['blossom'][2]); c.px(12, 15, R['blossom'][2])
    c.px(8, 14, R['blossom'][3]); c.px(15, 14, R['blossom'][3])
    outline_skip(c, OUTLINE_SOFT)
    halo(c, 12, 10.5, 9.6, 48)
    return c


def spirit_portrait():
    return expand_48_to_64(scale2x(spirit_portrait_24()))


def build():
    out = dict(fx_sheets())
    out['fx/swing'] = swing_sheet()
    out['ui/hp_bar'] = hud_frame()
    out['ui/red_bar'] = red_fill()
    out['ui/blue_bar'] = blue_fill()
    out['ui/yellow_bar'] = yellow_fill()
    out['ui/icons'] = icon_cells()
    out['ui/coin'] = coin_sheet()
    out['ui/emotes'] = emote_sheet()
    out['ui/quest_marker'] = quest_sheet()
    for kind in ('green', 'blue', 'red'):
        out['mobs/slime_' + kind] = slime_sheet(kind)
    out['pets/dog'] = dog_sheet()
    out['pets/cat'] = cat_sheet()
    out['pets/fox'] = fox_sheet()
    out['pets/wisp'] = wisp_sheet()
    out['npc/shrine_spirit'] = spirit_sheet()
    out['npc/shrine_spirit_portrait'] = spirit_portrait()
    for k, cv in out.items():
        cv.save(k)
    return list(out)


if __name__ == '__main__':
    build()
