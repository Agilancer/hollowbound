"""Hollowbound characters: a pose rig plus paper-doll layers, drawn from scratch.

Every character is a stack of layer sheets (body, legs, top, hair, hat, held item, back item)
that the engine bakes together at runtime (src/engine/sprite.js). Each sheet is 800x448:
10 columns x 7 rows of 80x64 frames, facing LEFT, feet on the bottom row, rows:
idle 5, walk 8, run 8, jump 4, fall 4, attack 6, death 10.

How it works: every frame is a Pose (joint angles). The pose becomes body parts (limbs, torso,
head) with a depth order. Each layer paints the parts it covers and erases wherever a nearer
body part passes in front, so a sleeve, a hat or a sword composites correctly whatever else the
character wears.

Angles: limbs measure from straight down, torso/head from straight up; positive = forward
(toward the facing side, which is -x in the sheet).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import Canvas, RAMPS, OUTLINE, CLEAR, mix, hexc, save, ramp  # noqa: E402

FW, FH = 80, 64
ROWS = [('idle', 5), ('walk', 8), ('run', 8), ('jump', 4), ('fall', 4), ('attack', 6), ('death', 10)]
GROUND = 62.5          # ankle height when standing (foot pixels reach row 63)
THIGH, SHIN = 7.0, 7.5
UPPER, FORE = 6.0, 5.0
TORSO, HEAD_UP, HEAD_R = 12.0, 7.5, 5.75

# Body proportions in rig units. Layers draw in the standard body's units: head-local and
# torso-local coordinates are normalised to STD, so hats, hair and clothes fit any body.
STD = dict(THIGH=THIGH, SHIN=SHIN, UPPER=UPPER, FORE=FORE, TORSO=TORSO, HEAD_UP=HEAD_UP, HEAD_R=HEAD_R,
           sw=4.6, hw=4.0, wthigh=4.2, wshin=3.6, wupper=3.2, wfore=3.0, rhand=1.7, foot=2.6, neck=3.2, neckL=3.0)
# Gorrak: a hunched brute, shoulders nearly twice as broad, a small head sunk between them,
# forearms and fists heavier than his upper arms.
BRUTE = dict(THIGH=7.2, SHIN=7.0, UPPER=7.0, FORE=6.8, TORSO=15.0, HEAD_UP=4.4, HEAD_R=3.7,
             sw=8.4, hw=5.8, wthigh=6.2, wshin=5.6, wupper=5.0, wfore=6.0, rhand=2.8, foot=4.0, neck=5.6, neckL=1.4)

# local ramps: the wraith's ghost-cyan robe and the ghoul's rusted helmet
GHOST_ROBE = ramp('#1e3448', '#3e6a80', '#7ab8cc', '#bfe8f0', '#eafcff')
GHOST_RIM = hexc('#dff6fa')
RUST = ramp('#24120a', '#4a2614', '#74401e', '#966030', '#b8844e')

# Render scale: pixels per rig unit. 1 for the 80x64 sheets; 2 for the boss and portraits,
# which are drawn natively at twice the resolution (still 1px outlines) instead of upscaled.
RS = 1


def dv(a, L):
    """Vector of length L at angle a (deg) from straight down, + = forward (-x)."""
    r = math.radians(a)
    return (-L * math.sin(r), L * math.cos(r))


def uv(a, L):
    """Vector of length L at angle a (deg) from straight up, + = forward."""
    r = math.radians(a)
    return (-L * math.sin(r), -L * math.cos(r))


def add(p, q, k=1.0):
    return (p[0] + q[0] * k, p[1] + q[1] * k)


class Pose:
    def clone(self, **over):
        q = Pose.__new__(Pose)
        q.__dict__.update(self.__dict__)
        q.__dict__.update(over)
        return q

    def __init__(self, **k):
        self.hip = k.get('hip', (41.0, 48.0))
        self.torso = k.get('torso', 0.0)
        self.head = k.get('head', None)
        self.breath = k.get('breath', 0)
        self.nl = k.get('nl', (4, 0))       # near leg (thigh, shin)
        self.fl = k.get('fl', (-4, 0))      # far leg
        self.na = k.get('na', (8, 20))      # near arm (upper, fore)
        self.fa = k.get('fa', (-6, 6))      # far arm
        self.wpn = k.get('wpn', None)       # held item angle (None: follow forearm)
        self.ground = k.get('ground', True)
        self.lift = k.get('lift', 0)
        self.smear = k.get('smear', None)   # (from_angle, to_angle) swing smear
        self.cape = k.get('cape', 2)        # cape flare (px back)
        self.sway = k.get('sway', 0)        # hair/cape sway phase
        self.anim = k.get('anim', 'idle')
        self.frame = k.get('frame', 0)
        self.grip2 = k.get('grip2', None)  # far hand holds the haft this far below the near hand
        self.expr = k.get('expr', None)    # portrait expression


# ------------------------------------------------------------------ the poses
def poses():
    P = {}
    P['idle'] = []
    for i, b in enumerate([0, 0, 1, 1, 0]):
        s = [0, 0.5, 1, 0.5, 0][i]
        P['idle'].append(Pose(breath=b, nl=(5, 1), fl=(-5, -2), na=(14 + s * 2, 38 + s * 3), fa=(-8 - s, 4), wpn=78 - s * 3, anim='idle', frame=i, sway=s))
    P['walk'] = []
    for i in range(8):
        p = 2 * math.pi * i / 8
        c, s = math.cos(p), math.sin(p)
        nth, fth = 22 * c, -22 * c
        nsh = nth - 38 * max(0, -s)
        fsh = fth - 38 * max(0, s)
        P['walk'].append(Pose(torso=3, nl=(nth, nsh), fl=(fth, fsh), na=(-20 * c + 2, -20 * c + 22), fa=(20 * c, 20 * c + 20),
                              cape=4, sway=s, anim='walk', frame=i))
    P['run'] = []
    for i in range(8):
        p = 2 * math.pi * i / 8
        c, s = math.cos(p), math.sin(p)
        nth, fth = 38 * c + 6, -38 * c + 6
        nsh = nth - 12 - 75 * max(0, -s)
        fsh = fth - 12 - 75 * max(0, s)
        P['run'].append(Pose(torso=13, head=6, nl=(nth, nsh), fl=(fth, fsh), na=(-42 * c + 4, -42 * c + 80), fa=(42 * c + 4, 42 * c + 80),
                             lift=round(1.6 * abs(s)), cape=9, sway=s, wpn=-52 - 30 * c, anim='run', frame=i))
    P['jump'] = [
        # crouch, launch (arm drives up), rise (knees tuck), apex (tucked, sword ready)
        Pose(torso=14, head=6, nl=(58, -34), fl=(46, -44), na=(-34, -14), fa=(-44, -22), wpn=-38, anim='jump', frame=0),
        Pose(torso=4, ground=False, nl=(14, -6), fl=(-16, -34), na=(72, 104), fa=(-46, -26), wpn=150, cape=-2, anim='jump', frame=1),
        Pose(torso=2, ground=False, nl=(54, -8), fl=(24, -44), na=(62, 92), fa=(-34, -12), wpn=132, cape=-1, anim='jump', frame=2),
        Pose(torso=4, ground=False, nl=(64, -18), fl=(40, -56), na=(48, 76), fa=(-24, 0), wpn=112, cape=1, anim='jump', frame=3),
    ]
    P['fall'] = []
    for i in range(4):
        s = math.sin(2 * math.pi * i / 4)
        # arms up and out for balance, near leg reaching for the ground, far leg bent
        P['fall'].append(Pose(torso=-2, ground=False, nl=(22 + 4 * s, 6), fl=(-6 - 4 * s, -38), na=(118 + 8 * s, 140 + 8 * s),
                              fa=(-104 - 8 * s, -84 - 8 * s), wpn=166 + 8 * s, cape=-6, sway=s, anim='fall', frame=i))
    P['attack'] = [
        Pose(torso=5, nl=(12, 0), fl=(-12, -5), na=(40, 92), fa=(10, 40), wpn=122, anim='attack', frame=0),
        Pose(torso=-4, head=-2, nl=(14, 2), fl=(-14, -6), na=(158, 200), fa=(28, 62), wpn=212, anim='attack', frame=1),
        Pose(torso=-8, head=-4, nl=(20, 4), fl=(-16, -8), na=(172, 226), fa=(38, 72), wpn=238, anim='attack', frame=2),
        Pose(torso=12, head=8, nl=(32, 6), fl=(-26, -12), na=(96, 90), fa=(-38, -18), wpn=86, smear=(238, 86), cape=5, anim='attack', frame=3),
        Pose(torso=16, head=10, nl=(32, 6), fl=(-26, -12), na=(56, 36), fa=(-34, -14), wpn=24, smear=(86, 24), cape=5, anim='attack', frame=4),
        Pose(torso=6, nl=(16, 2), fl=(-12, -6), na=(30, 62), fa=(-8, 14), wpn=92, anim='attack', frame=5),
    ]
    P['death'] = [
        Pose(torso=-10, head=-12, nl=(8, 2), fl=(-8, -4), na=(-28, -8), fa=(-10, 6), wpn=40, anim='death', frame=0),
        Pose(torso=-18, head=-16, nl=(14, 4), fl=(-20, -10), na=(-42, -24), fa=(-30, -10), wpn=20, anim='death', frame=1),
        Pose(torso=-6, head=-2, nl=(42, -30), fl=(30, -40), na=(8, 14), fa=(0, 10), wpn=40, anim='death', frame=2),
        Pose(torso=10, head=14, nl=(28, -86), fl=(18, -90), na=(14, 22), fa=(8, 18), wpn=50, anim='death', frame=3),
        Pose(torso=26, head=28, nl=(26, -88), fl=(16, -92), na=(28, 36), fa=(20, 30), wpn=60, anim='death', frame=4),
        Pose(torso=50, head=52, nl=(12, -86), fl=(4, -90), na=(62, 74), fa=(54, 66), wpn=76, anim='death', frame=5),
        Pose(torso=74, head=74, nl=(-38, -82), fl=(-44, -86), na=(80, 88), fa=(74, 84), wpn=88, anim='death', frame=6),
        Pose(torso=90, head=92, nl=(-88, -90), fl=(-90, -92), na=(96, 100), fa=(92, 96), wpn=96, anim='death', frame=7),
        Pose(torso=90, head=96, nl=(-89, -90), fl=(-90, -91), na=(98, 102), fa=(92, 96), wpn=98, anim='death', frame=8),
        Pose(torso=90, head=97, nl=(-89, -90), fl=(-90, -91), na=(98, 102), fa=(92, 96), wpn=98, anim='death', frame=9),
    ]
    return P


def ghoul_poses():
    """A miner gone wrong: hunched about 3px forward, the far arm dangling, the pick dragged."""
    out = {}
    for name, lst in poses().items():
        out[name] = []
        for p in lst:
            if name == 'death':
                out[name].append(p)
                continue
            s = p.sway
            hd = p.head if p.head is not None else p.torso
            lean = 10 if name == 'attack' else 15
            q = p.clone(torso=p.torso + lean, head=hd + lean - 9)
            if name != 'attack':
                q.fa = (-2 + 7 * s, 4 + 9 * s)            # limp, swinging a little
            if name in ('idle', 'walk'):
                q.na = (6 + 3 * s, 16 + 3 * s)
                q.wpn = -30 + 5 * s                        # the pick's head drags behind
            out[name].append(q)
    return out


def brute_poses():
    """Gorrak: hunched and heavy, both hands on a great axe (the far hand grips by IK)."""
    P = {}
    P['idle'] = []
    for i, b in enumerate([0, 0, 1, 1, 0]):
        s = [0, 0.5, 1, 0.5, 0][i]
        P['idle'].append(Pose(torso=16 + s, head=2, breath=b, nl=(14, -4), fl=(-12, -10), na=(30 + s * 2, 118 + s * 3),
                              wpn=148 + s * 2, grip2=7, cape=3, anim='idle', frame=i, sway=s))
    P['walk'] = []
    for i in range(8):
        ph = 2 * math.pi * i / 8
        c, s = math.cos(ph), math.sin(ph)
        nth, fth = 18 * c + 4, -18 * c + 4
        nsh = nth - 6 - 30 * max(0, -s)
        fsh = fth - 6 - 30 * max(0, s)
        P['walk'].append(Pose(torso=18 + 2 * abs(s), head=4, nl=(nth, nsh), fl=(fth, fsh), na=(28 + 4 * c, 114 + 4 * c),
                              wpn=144 + 4 * c, grip2=7, cape=5, sway=s, anim='walk', frame=i))
    P['run'] = []
    for i in range(8):
        ph = 2 * math.pi * i / 8
        c, s = math.cos(ph), math.sin(ph)
        nth, fth = 32 * c + 8, -32 * c + 8
        nsh = nth - 14 - 60 * max(0, -s)
        fsh = fth - 14 - 60 * max(0, s)
        # the charge: horns first, the axe levelled ahead of him like a ram
        P['run'].append(Pose(torso=30, head=14, nl=(nth, nsh), fl=(fth, fsh), na=(36 + 4 * c, 92 + 4 * c), wpn=104 + 4 * c,
                             grip2=7, lift=round(1.4 * abs(s)), cape=9, sway=s, anim='run', frame=i))
    hip = (41.0, 50.0)
    P['jump'] = [
        Pose(torso=26, head=12, nl=(60, -30), fl=(48, -40), na=(14, 64), wpn=46, grip2=6, anim='jump', frame=0),
        Pose(hip=hip, torso=8, ground=False, nl=(20, -10), fl=(-10, -40), na=(140, 172), wpn=210, grip2=6, cape=-2, anim='jump', frame=1),
        Pose(hip=hip, torso=4, ground=False, nl=(50, -10), fl=(20, -46), na=(146, 178), wpn=216, grip2=6, cape=-1, anim='jump', frame=2),
        Pose(hip=hip, torso=6, ground=False, nl=(56, -16), fl=(30, -50), na=(150, 182), wpn=220, grip2=6, cape=1, anim='jump', frame=3),
    ]
    P['fall'] = []
    for i in range(4):
        s = math.sin(2 * math.pi * i / 4)
        P['fall'].append(Pose(hip=hip, torso=10, ground=False, nl=(30 + 4 * s, 0), fl=(-4, -36), na=(138 + 6 * s, 168 + 6 * s),
                              wpn=204 + 6 * s, grip2=6, cape=-6, sway=s, anim='fall', frame=i))
    P['attack'] = [
        Pose(torso=20, head=6, nl=(16, -2), fl=(-14, -10), na=(30, 100), wpn=128, grip2=7, anim='attack', frame=0),
        Pose(torso=6, head=0, nl=(14, 0), fl=(-16, -10), na=(140, 176), wpn=212, grip2=6, anim='attack', frame=1),
        Pose(torso=-6, head=-6, nl=(18, 2), fl=(-20, -12), na=(158, 200), wpn=236, grip2=6, cape=1, anim='attack', frame=2),
        Pose(torso=24, head=14, nl=(34, 4), fl=(-30, -14), na=(100, 96), wpn=92, grip2=6, smear=(236, 92), cape=6, anim='attack', frame=3),
        Pose(torso=36, head=22, nl=(40, 6), fl=(-34, -16), na=(62, 42), wpn=34, grip2=6, smear=(92, 34), cape=6, anim='attack', frame=4),
        Pose(torso=30, head=18, nl=(36, 4), fl=(-30, -14), na=(52, 38), wpn=38, grip2=6, cape=4, anim='attack', frame=5),
    ]
    P['death'] = poses()['death']
    return P


# ------------------------------------------------------------------ parts
class Part:
    """A body part: pixel set, depth, and the skeleton points layers need."""

    def __init__(self, name, z, pix):
        self.name, self.z, self.pix = name, z, pix


def capsule(x0, y0, x1, y1, w):
    x0, y0, x1, y1, w = x0 * RS, y0 * RS, x1 * RS, y1 * RS, w * RS
    r = w / 2.0
    out = set()
    vx, vy = x1 - x0, y1 - y0
    L2 = vx * vx + vy * vy
    for y in range(int(math.floor(min(y0, y1) - r)), int(math.ceil(max(y0, y1) + r)) + 1):
        for x in range(int(math.floor(min(x0, x1) - r)), int(math.ceil(max(x0, x1) + r)) + 1):
            cx, cy = x + 0.5, y + 0.5
            t = 0 if L2 == 0 else max(0.0, min(1.0, ((cx - x0) * vx + (cy - y0) * vy) / L2))
            qx, qy = x0 + vx * t, y0 + vy * t
            if (cx - qx) ** 2 + (cy - qy) ** 2 <= r * r:
                out.add((x, y))
    return out


def polyset(pts):
    pts = [(x * RS, y * RS) for (x, y) in pts]
    out = set()
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
                out.add((x, y))
    return out


def disc(cx, cy, r):
    cx, cy, r = cx * RS, cy * RS, r * RS
    out = set()
    for y in range(int(math.floor(cy - r)), int(math.ceil(cy + r)) + 1):
        for x in range(int(math.floor(cx - r)), int(math.ceil(cx + r)) + 1):
            if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r:
                out.add((x, y))
    return out


class Frame:
    """A pose turned into joints and parts, with a local frame for the head and torso."""

    def __init__(self, pose, body='man', prop=None):
        self.pose = pose
        self.body = body
        self.P = prop or STD
        self.hk = HEAD_R / self.P['HEAD_R']                              # head units -> standard head
        self.tk = (STD['sw'] / self.P['sw'], TORSO / self.P['TORSO'])    # torso units -> standard
        self.S = self.P['sw'] / STD['sw']                                # size factor for accessories
        p = pose
        hx, hy = p.hip
        self.hip = (hx, hy)
        self.build()
        if p.ground:
            self.settle()
        elif p.lift:
            pass
        if p.lift:
            self.shift(0, -p.lift)

    def build(self):
        p = self.pose
        hip = self.hip
        B = self.P
        tl = B['TORSO'] - p.breath
        self.sh = add(hip, uv(p.torso, tl))
        ha = p.torso if p.head is None else p.head
        self.ha = ha
        # head and torso local axes: fwd = (-cos a, sin a), up = (-sin a, -cos a)
        ta = math.radians(p.torso)
        self.tf, self.tu = (-math.cos(ta), math.sin(ta)), (-math.sin(ta), -math.cos(ta))
        hr = math.radians(ha)
        self.hf, self.hu = (-math.cos(hr), math.sin(hr)), (-math.sin(hr), -math.cos(hr))
        self.hc = add(self.sh, uv(ha, B['HEAD_UP']))
        tf, tu = self.tf, self.tu
        k = self.S
        self.nsh = add(add(self.sh, tf, -1.0 * k), tu, -1.5 * k)
        self.fsh = add(add(self.sh, tf, 1.2 * k), tu, -1.5 * k)
        self.nhip = add(hip, tf, -0.8 * k)
        self.fhip = add(hip, tf, 1.2 * k)

        def leg(h, a):
            kn = add(h, dv(a[0], B['THIGH']))
            an = add(kn, dv(a[1], B['SHIN']))
            return h, kn, an

        def arm(s, a):
            e = add(s, dv(a[0], B['UPPER']))
            w = add(e, dv(a[1], B['FORE']))
            hand = add(w, dv(a[1], 1.0 * k))
            return s, e, w, hand

        self.NL = leg(self.nhip, p.nl)
        self.FL = leg(self.fhip, p.fl)
        self.NA = arm(self.nsh, p.na)
        if p.grip2 is not None and p.wpn is not None:
            # two-handed grip: the far hand reaches for the haft below the near hand (2-bone IK)
            self.FA = self.ik(self.fsh, add(self.NA[3], dv(p.wpn, 1.0), -p.grip2))
        else:
            self.FA = arm(self.fsh, p.fa)
        self.parts = self.make_parts()

    def hp(self, u, v):
        """Head-local (standard units) -> pixel: the inverse of hl."""
        k = self.hk
        if abs(self.ha) < 20 and RS == 1:
            dx, dy = -u / k, -v / k
        else:
            dx = (u * self.hf[0] + v * self.hu[0]) / k
            dy = (u * self.hf[1] + v * self.hu[1]) / k
        return (int(math.floor((self.hc[0] + dx) * RS)), int(math.floor((self.hc[1] + dy) * RS)))

    def ik(self, s, target):
        B = self.P
        a_, b_ = B['UPPER'], B['FORE'] + 1.0 * self.S
        dx, dy = target[0] - s[0], target[1] - s[1]
        L = math.hypot(dx, dy)
        d = max(1e-3, min(a_ + b_ - 0.01, L))
        base = math.atan2(dy, dx)
        cos_a = max(-1.0, min(1.0, (a_ * a_ + d * d - b_ * b_) / (2 * a_ * d)))
        ang = base + math.acos(cos_a)              # elbow bends down and back
        e = (s[0] + a_ * math.cos(ang), s[1] + a_ * math.sin(ang))
        tgt = target if L <= a_ + b_ else (s[0] + dx / L * (a_ + b_), s[1] + dy / L * (a_ + b_))
        vx, vy = tgt[0] - e[0], tgt[1] - e[1]
        vl = max(1e-3, math.hypot(vx, vy))
        w = (e[0] + vx / vl * B['FORE'], e[1] + vy / vl * B['FORE'])
        return s, e, w, tgt

    def foot(self, L):
        h, k, an = L
        f = self.P['foot']
        a = math.degrees(math.atan2(-(an[0] - k[0]), an[1] - k[1]))   # shin angle from down
        toe = add(an, dv(a + 90, f))
        return capsule(an[0], an[1], toe[0], toe[1], f)

    def make_parts(self):
        P = {}
        B = self.P
        wide = self.body in ('man', 'devil', 'zombie')
        sw, hw = (B['sw'], B['hw']) if (wide or B is not STD) else (4.0, 3.9)
        c1 = 1.2 * self.S
        sh, hip, tf, tu = self.sh, self.hip, self.tf, self.tu
        torso = polyset([
            add(add(sh, tf, sw - c1), tu, 0.6), add(add(sh, tf, sw), tu, -1.4 * self.S),
            add(hip, tf, hw), add(add(hip, tf, hw - 0.6), tu, -1.2), add(add(hip, tf, -hw + 0.6), tu, -1.2), add(hip, tf, -hw),
            add(add(sh, tf, -sw), tu, -1.4 * self.S), add(add(sh, tf, -sw + c1), tu, 0.6)])
        neck = capsule(sh[0], sh[1], *add(sh, uv(self.ha, B['neckL'])), B['neck'])
        P['torso'] = torso | neck
        hc = self.hc
        P['head'] = disc(hc[0], hc[1], B['HEAD_R'])
        if RS >= 2:
            # at native 2x there is room for a nose: a small bump on the profile below the eyes
            hs = B['HEAD_R'] / HEAD_R
            nz = add(add(hc, self.hf, B['HEAD_R'] - 0.15 * hs), self.hu, -1.5 * hs)
            P['head'] = P['head'] | disc(nz[0], nz[1], 0.95 * hs)
        for tag, L in (('n', self.NL), ('f', self.FL)):
            h, k, an = L
            P[tag + 'thigh'] = capsule(h[0], h[1], k[0], k[1], B['wthigh'])
            P[tag + 'shin'] = capsule(k[0], k[1], an[0], an[1], B['wshin'])
            P[tag + 'foot'] = self.foot(L)
        for tag, A in (('n', self.NA), ('f', self.FA)):
            s, e, w, hand = A
            P[tag + 'upper'] = capsule(s[0], s[1], e[0], e[1], B['wupper'])
            P[tag + 'fore'] = capsule(e[0], e[1], w[0], w[1], B['wfore'])
            P[tag + 'hand'] = disc(hand[0], hand[1], B['rhand'])
        return P

    def shift(self, dx, dy):
        def mv(pt):
            return (pt[0] + dx, pt[1] + dy)
        self.hip = mv(self.hip)
        self.build()

    def settle(self):
        """Put the lowest body pixel on the bottom row (feet, knees, or a body lying down)."""
        low = max(y for s in self.parts.values() for (_, y) in s)
        d = (FH * RS - 1) - low
        if d:
            self.shift(0, d / RS)

    # union helpers
    def limb(self, tag, segs):
        out = set()
        for s in segs:
            out |= self.parts[tag + s]
        return out

    # local point for head-attached drawing: (u forward, v up) in head space
    def hl(self, x, y):
        """Pixel -> head-local (u forward, v up), in standard-head units."""
        cx, cy = self.hc
        k = self.hk
        dx, dy = ((x + 0.5) / RS - cx) * k, ((y + 0.5) / RS - cy) * k
        if abs(self.ha) < 20 and RS == 1:
            # small tilts: keep pixel-perfect shapes, just follow the head
            return (-dx, -dy)
        return (dx * self.hf[0] + dy * self.hf[1], dx * self.hu[0] + dy * self.hu[1])

    def tl(self, x, y, origin=None):
        """Pixel -> torso-local (u forward, v up from the hip), in standard-torso units."""
        cx, cy = origin or self.hip
        dx, dy = (x + 0.5) / RS - cx, (y + 0.5) / RS - cy
        if abs(self.pose.torso) < 20 and RS == 1 and self.P is STD:
            return (-dx, -dy)
        u, v = dx * self.tf[0] + dy * self.tf[1], dx * self.tu[0] + dy * self.tu[1]
        return (u * self.tk[0], v * self.tk[1])

    def head_pixels(self, pred, pad=16):
        cx, cy = self.hc
        pp = pad * RS / self.hk
        out = set()
        for y in range(int(cy * RS - pp), int(cy * RS + pp) + 1):
            for x in range(int(cx * RS - pp), int(cx * RS + pp) + 1):
                u, v = self.hl(x, y)
                if pred(u, v):
                    out.add((x, y))
        return out

    def torso_pixels(self, pred, pad=22, origin=None):
        cx, cy = origin or self.hip
        pp = pad * RS * max(1.0, 1 / min(self.tk))
        out = set()
        for y in range(int(cy * RS - pp), int(cy * RS + pp) + 1):
            for x in range(int(cx * RS - pp), int(cx * RS + pp) + 1):
                u, v = self.tl(x, y, origin)
                if pred(u, v):
                    out.add((x, y))
        return out


# depth of each body part (higher = nearer the viewer)
Z = {'fupper': 1, 'ffore': 1, 'fhand': 1.1, 'fthigh': 2, 'fshin': 2, 'ffoot': 2.1, 'torso': 3,
     'nthigh': 4, 'nshin': 4, 'nfoot': 4.1, 'head': 6, 'nupper': 9, 'nfore': 9, 'nhand': 10}


# ------------------------------------------------------------------ painting
def dilate(s):
    out = set()
    for (x, y) in s:
        out.add((x + 1, y)); out.add((x - 1, y)); out.add((x, y + 1)); out.add((x, y - 1))
    return out - s


def paint_set(cv, pix, r, far=False, flat=False, line=None):
    """Fill pix with ramp r as a lit volume (light from the upper left), then a 1px ring.

    Each horizontal run is banded by position: a lit front strip, the base, and a shaded back
    strip that widens on wide shapes, so a torso reads round and a 3px limb still gets both edges.
    The bottom edge is shaded, the top edge catches light. Far-side parts drop one step.
    """
    if not pix:
        return
    o = 1 if far else 0
    base = r[2 - o]
    lite = r[3 - o]
    dark = r[1 - o]
    deep = r[0]
    rows = {}
    for (x, y) in pix:
        rows.setdefault(y, []).append(x)
    for y, xs in rows.items():
        xs.sort()
        runs, start = [], xs[0]
        for i in range(1, len(xs) + 1):
            if i == len(xs) or xs[i] != xs[i - 1] + 1:
                runs.append((start, xs[i - 1]))
                if i < len(xs):
                    start = xs[i]
        for lo, hi in runs:
            w = hi - lo + 1
            for x in range(lo, hi + 1):
                c = base
                if not flat:
                    t = (x - lo) / max(1, w - 1)
                    if (x, y + 1) not in pix and (x + 1, y + 1) not in pix:
                        c = dark
                    elif x == hi or (w >= 6 and t >= 0.74):
                        c = deep if (w >= 8 and x == hi and not far) else dark
                    elif (x, y - 1) not in pix or x == lo or (w >= 7 and t <= 0.2):
                        c = lite
                cv.px(x, y, c)
    ring = dilate(pix)
    lc = line or mix(r[0], OUTLINE, 0.55)
    for (x, y) in ring:
        cv.px(x, y, lc)


def erase(cv, pix):
    for (x, y) in pix:
        if 0 <= x < cv.w and 0 <= y < cv.h:
            cv.p[x, y] = CLEAR


class Ctx:
    """What a layer sees for one frame: the Frame, the canvas, and the paint queue."""

    def __init__(self, fr, cv):
        self.fr, self.cv = fr, cv
        self.items = []   # (z, kind, pixels, painter)

    def paint(self, z, pix, fn):
        self.items.append((z, 'paint', pix, fn))

    def run(self):
        """Paint this layer's items and erase nearer body parts, in depth order."""
        fr = self.fr
        body = [(Z[n], 'erase', fr.parts[n], None) for n in Z]
        seq = sorted(self.items + body, key=lambda t: (t[0], 0 if t[1] == 'erase' else 1))
        mine = {id(t[2]) for t in self.items}
        for z, kind, pix, fn in seq:
            if kind == 'paint':
                fn(self.cv, pix)
            elif id(pix) not in mine:
                # a nearer body part: clear it and its outline ring so it shows through
                erase(self.cv, pix | dilate(pix))


# ------------------------------------------------------------------ layers
LAYERS = {}


def layer(key):
    def deco(fn):
        LAYERS[key] = fn
        return fn
    return deco


def P(r, far=False, flat=False, line=None):
    return lambda cv, pix: paint_set(cv, pix, r, far, flat, line)


# ---- bodies
def body_painter(rkey, face='man', legs=True):
    r = RAMPS[rkey]

    def fn(c):
        fr = c.fr
        for tag, far in (('f', True), ('n', False)):
            arm = fr.limb(tag, ['upper', 'fore'])
            c.paint(Z[tag + 'upper'], arm, P(r, far))
            c.paint(Z[tag + 'hand'], fr.parts[tag + 'hand'], P(r, far))
            if legs:
                c.paint(Z[tag + 'thigh'], fr.limb(tag, ['thigh', 'shin']), P(r, far))
                c.paint(Z[tag + 'foot'], fr.parts[tag + 'foot'], P(r, far))
        c.paint(Z['torso'], fr.parts['torso'], P(r))

        def head(cv, pix):
            paint_set(cv, pix, r)
            draw_face(cv, fr, r, face)
        c.paint(Z['head'], fr.parts['head'], head)
        if not legs:
            # spirits: a tapering wisp instead of legs
            sway = fr.pose.sway
            tail = fr.torso_pixels(lambda u, v: -16 <= v <= 1 and abs(u + (v * v) * 0.012 * (1 + sway)) <= 4.2 + v * 0.22 and not (v < -10 and (int(u) + int(v)) % 2))
            c.paint(Z['fthigh'], tail, P(r, flat=False))
    return fn


def draw_face(cv, fr, r, face):
    """Eyes and features on a 3/4 face turned left."""
    eye = OUTLINE
    if face == 'zombie':
        eye = hexc('#d8e0a0')
    if face == 'ghost':
        eye = hexc('#e8ffff')
    if face == 'devil':
        eye = hexc('#ffd84a')
    head = fr.parts['head']

    def at(pred, col):
        for (x, y) in fr.head_pixels(pred, pad=8):
            if (x, y) in head:
                cv.px(x, y, col)

    # head-local: u forward (toward the face), v up; eyes sit just below the centre line
    EV = (-1.6, 0.4)
    def eye_at(u0):
        return lambda u, v: u0 <= u < u0 + 1.0 and EV[0] <= v < EV[1]
    at(lambda u, v: -1.0 <= u < 0.0 and -2.2 <= v < 0.0, r[1])          # ear
    at(lambda u, v: -0.6 <= u < 0.4 and -1.6 <= v < -0.6, r[3])         # ear rim light
    if fr.pose.expr:
        return      # a portrait: portrait_face() paints an expressive face over the finished bust
    if face in ('zombie', 'ghost', 'devil'):
        # sunken sockets above glowing eyes
        at(lambda u, v: (3.5 <= u < 4.5 or 0.6 <= u < 1.6) and 0.4 <= v < 1.4, r[1])
    at(eye_at(3.5), eye)
    at(eye_at(0.6), eye)
    if face == 'woman':
        at(lambda u, v: 4.5 <= u < 5.5 and 0.4 <= v < 1.4, OUTLINE)        # lashes
    if face == 'zombie':
        at(lambda u, v: 1.6 <= u < 4.6 and -4.0 <= v < -3.0, OUTLINE)       # slack mouth
        at(lambda u, v: 2.6 <= u < 3.6 and -5.0 <= v < -4.0, r[0])
    elif face == 'devil':
        at(lambda u, v: 1.6 <= u < 4.6 and -4.0 <= v < -3.0, r[0])          # grin
        at(lambda u, v: 3.6 <= u < 4.6 and -3.0 <= v < -2.0, hexc('#f4ead0'))   # fang
    elif face == 'ghost':
        at(lambda u, v: 2.2 <= u < 3.2 and -4.0 <= v < -2.0, r[1])
    else:
        at(lambda u, v: 2.2 <= u < 3.6 and -4.0 <= v < -3.0, r[1])          # mouth
        at(lambda u, v: 4.4 <= u < 5.4 and -3.0 <= v < -2.0, mix(r[3], hexc('#e05050'), 0.3))   # cheek


SKINS = {'man_pale': ('skin_pale', 'man'), 'man_tan': ('skin_tan', 'man'), 'man_brown': ('skin_brown', 'man'),
         'man_dark': ('skin_dark', 'man'), 'woman_pale': ('skin_pale', 'woman'), 'woman_tan': ('skin_tan', 'woman'),
         'zombie': ('skin_zombie', 'zombie'), 'devil': ('skin_devil', 'devil')}
for _k, (_r, _f) in SKINS.items():
    layer('body/' + _k)(body_painter(_r, _f))
layer('body/ghost')(body_painter('skin_ghost', 'ghost', legs=False))


# ---- legs
def pants(rkey, torn=False, tight=False):
    r = RAMPS[rkey]

    def fn(c):
        fr = c.fr
        for tag, far in (('f', True), ('n', False)):
            leg = fr.limb(tag, ['thigh', 'shin'])
            if torn:
                k = fr.NL[1] if tag == 'n' else fr.FL[1]
                leg = {p for p in leg if p[1] <= k[1] + 2 or (p[0] + p[1]) % 3 == 0}
            c.paint(Z[tag + 'thigh'], leg, P(r, far))
        # waistband over the hips
        band = fr.torso_pixels(lambda u, v: -1.5 <= v <= 1.2 and abs(u) <= 4.2)
        c.paint(Z['torso'] + 0.1, band & (fr.parts['torso'] | dilate(fr.parts['torso'])), P(r))
    return fn


def boots(rkey, high=4.0):
    r = RAMPS[rkey]

    def fn(c):
        fr = c.fr
        for tag, far, L in (('f', True, fr.FL), ('n', False, fr.NL)):
            h, k, an = L
            top = add(an, (k[0] - an[0], k[1] - an[1]), high / SHIN)
            shaft = capsule(an[0], an[1], top[0], top[1], 4.0)
            c.paint(Z[tag + 'foot'] + 0.01, shaft | fr.parts[tag + 'foot'], P(r, far))
    return fn


def shoes(rkey):
    r = RAMPS[rkey]

    def fn(c):
        fr = c.fr
        for tag, far in (('f', True), ('n', False)):
            c.paint(Z[tag + 'foot'] + 0.01, fr.parts[tag + 'foot'], P(r, far))
    return fn


layer('legs/pants_brown')(pants('cloth_brown'))
layer('legs/pants_orange')(pants('cloth_orange'))
layer('legs/pants_navy')(pants('cloth_navy'))
layer('legs/hose_linen')(pants('cloth_linen', tight=True))
layer('legs/pants_torn')(pants('cloth_grey', torn=True))
layer('legs/boots_brown')(boots('leather'))
layer('legs/boots_dark')(boots('cloth_grey', 3.5))
layer('legs/boots_iron')(boots('iron', 4.5))
layer('legs/shoes')(shoes('leather'))


def skirt(rkey, length=12.0, flare=2.5, z=5):
    """A skirt/dress lower: spans the legs' spread so it swings with the stride."""
    r = RAMPS[rkey]

    def fn(c):
        fr = c.fr
        hip = fr.hip
        pts = [fr.NL[1], fr.FL[1], fr.NL[2], fr.FL[2]]
        xs = [p[0] for p in pts]
        bot = hip[1] + length
        lo, hi = min(xs + [hip[0] - 4]) - flare, max(xs + [hip[0] + 4]) + flare
        poly = [(hip[0] - 4.2, hip[1] - 2), (hip[0] + 4.2, hip[1] - 2), (hi, bot), (lo, bot)]
        if abs(fr.pose.torso) > 30:
            sk = fr.torso_pixels(lambda u, v: -length <= v <= 2 and abs(u) <= 4.4 + (-v) * 0.25)
        else:
            sk = polyset(poly)
            # hem scallop
            sk = {p for p in sk if not (p[1] >= bot - 1 and (p[0] % 4 == 0))}
        c.paint(z, sk, P(r))
    return fn


# ---- tops
def top(rkey, sleeves='short', hem=2.0, belt=None, pattern=None, collar=None):
    r = RAMPS[rkey]

    def fn(c):
        fr = c.fr
        tor = fr.parts['torso']
        neckline = fr.head_pixels(lambda u, v: v < -HEAD_R + 0.5) if False else set()
        body = {p for p in tor if p not in neckline}
        # don't cover the neck: drop pixels above the shoulder line
        body = body & fr.torso_pixels(lambda u, v: v <= TORSO - fr.pose.breath - 0.6 + (0.0 if abs(u) > 2 else -0.4))

        def paint_body(cv, pix):
            paint_set(cv, pix, r)
            if pattern:
                pattern(cv, pix, r)
        c.paint(Z['torso'] + 0.2, body, paint_body)
        if hem > 0:
            h = fr.torso_pixels(lambda u, v: -hem <= v <= 0.5 and abs(u) <= 4.3 + (-v) * 0.3)
            c.paint(4.5, h, paint_body)
        if belt:
            br = RAMPS[belt]
            b = fr.torso_pixels(lambda u, v: 0.0 <= v <= 1.6 and abs(u) <= 4.6)
            c.paint(4.6, b, P(br, line=mix(br[0], OUTLINE, 0.6)))
            buckle = fr.torso_pixels(lambda u, v: 0.0 <= v <= 1.6 and 1.5 <= u <= 3.0)
            c.paint(4.61, buckle, P(RAMPS['gold'], flat=True, line=mix(br[0], OUTLINE, 0.6)))
        segs = {'none': [], 'short': ['upper'], 'long': ['upper', 'fore']}[sleeves]
        for tag, far in (('f', True), ('n', False)):
            if segs:
                sl = fr.limb(tag, segs)
                c.paint(Z[tag + 'upper'] + 0.05, sl, P(r, far))
    return fn


def chain_pattern(cv, pix, r):
    for (x, y) in pix:
        if (x + y) % 2 == 0 and (x + 1, y) in pix and (x, y + 1) in pix and (x - 1, y) in pix:
            cv.px(x, y, r[1] if (y // 2) % 2 else r[3])


def torn_pattern(cv, pix, r):
    for (x, y) in pix:
        h = (x * 7 + y * 13) % 11
        if h == 0:
            cv.px(x, y, r[0])
        elif h == 5 and (x, y + 1) in pix:
            cv.px(x, y, RAMPS['skin_zombie'][2])


layer('top/tunic_blue')(top('cloth_blue', 'short', hem=3.0, belt='leather'))
layer('top/shirt_green')(top('cloth_green', 'long', hem=2.0, belt='leather'))
layer('top/shirt_linen')(top('cloth_linen', 'short', hem=1.5))
layer('top/shirt_torn')(top('cloth_linen', 'short', hem=1.5, pattern=torn_pattern))
layer('top/chainmail')(top('iron', 'short', hem=4.0, belt='leather', pattern=chain_pattern))
layer('top/bodice_green')(top('cloth_green', 'short', hem=0, belt='cloth_brown'))
layer('top/dress_purple')(lambda c: (top('cloth_purple', 'long', hem=0, belt='cloth_grey')(c), skirt('cloth_purple', 15.0, 3.0)(c)))
layer('legs/skirt_brown')(skirt('cloth_brown', 11.0, 2.0, z=4.8))


@layer('top/apron')
def _apron(c):
    fr = c.fr
    r = RAMPS['leather']
    # a heavy leather apron from the chest to the knees, with a neck strap
    ap = fr.torso_pixels(lambda u, v: -9 <= v <= TORSO - 3 and -1.5 <= u <= 4.6 - max(0, -v) * 0.05)
    c.paint(4.7, ap, P(r))
    strap = fr.torso_pixels(lambda u, v: TORSO - 4 <= v <= TORSO - 0.5 and -2.6 <= u <= -1.4)
    c.paint(4.71, strap, P(r))


@layer('top/robe_ghost')
def _robe(c):
    """The wraith's tattered robe and hood: ghost-cyan with a pale rim, so it reads as cold light."""
    fr = c.fr
    r = GHOST_ROBE
    sway = fr.pose.sway
    robe = fr.torso_pixels(lambda u, v: -15 <= v <= TORSO - 0.5 and abs(u + max(0, -v) * 0.08 * (1 + sway)) <= 4.8 + max(0, -v) * 0.18
                           and not (v < -12 and (int(u * 2) + int(v)) % 3 == 0))
    c.paint(5, robe, P(r, line=GHOST_RIM))
    for tag, far in (('f', True), ('n', False)):
        c.paint(Z[tag + 'upper'] + 0.05, fr.limb(tag, ['upper', 'fore']), P(r, far, line=GHOST_RIM))
    hood = fr.head_pixels(lambda u, v: (u * u) / 7.4 ** 2 + ((v - 0.8) ** 2) / 7.2 ** 2 <= 1 and not (u > 0.5 and -3.5 <= v <= 2.5 and u * u / 5.2 ** 2 + (v + 0.5) ** 2 / 4.2 ** 2 <= 1) and u < 6.6)
    c.paint(8, hood, P(r, line=GHOST_RIM))


# ---- armour
@layer('top/pauldrons')
def _pauldrons(c):
    """Rounded iron shoulder plates with a gold rim; the near one carries two short spikes."""
    fr = c.fr
    k = fr.S
    for tag, far, sh in (('f', True, fr.fsh), ('n', False, fr.nsh)):
        ctr = add(sh, fr.tu, 0.6 * k)
        pts = []
        for i in range(17):
            t = math.pi * i / 16
            pts.append(add(add(ctr, fr.tf, 2.2 * k * math.cos(t)), fr.tu, 1.7 * k * math.sin(t)))
        pts += [add(add(ctr, fr.tf, -2.2 * k), fr.tu, -1.5 * k), add(add(ctr, fr.tf, 2.2 * k), fr.tu, -1.5 * k)]
        plate = polyset(pts)
        rim = polyset([add(add(ctr, fr.tf, -2.3 * k), fr.tu, -1.5 * k), add(add(ctr, fr.tf, 2.3 * k), fr.tu, -1.5 * k),
                       add(add(ctr, fr.tf, 2.3 * k), fr.tu, -0.8 * k), add(add(ctr, fr.tf, -2.3 * k), fr.tu, -0.8 * k)])
        spikes = set()
        if not far:
            for off in (-0.9, 0.7):
                b0 = add(add(ctr, fr.tf, (off - 0.45) * k), fr.tu, 1.3 * k)
                b1 = add(add(ctr, fr.tf, (off + 0.45) * k), fr.tu, 1.3 * k)
                tip = add(add(ctr, fr.tf, (off - 0.6) * k), fr.tu, 2.9 * k)
                spikes |= polyset([b0, b1, tip])
        z = Z[tag + 'upper'] + 0.08
        c.paint(z, plate | spikes, P(RAMPS['iron'], far))
        c.paint(z + 0.01, rim, P(RAMPS['gold'], far))


# ---- arms
def gloves(rkey):
    r = RAMPS[rkey]

    def fn(c):
        fr = c.fr
        for tag, far, A in (('f', True, fr.FA), ('n', False, fr.NA)):
            s, e, w, hand = A
            mid = add(e, (w[0] - e[0], w[1] - e[1]), 0.45)
            cuff = capsule(mid[0], mid[1], w[0], w[1], 3.6)
            c.paint(Z[tag + 'fore'] + 0.06, cuff, P(r, far))
            c.paint(Z[tag + 'hand'] + 0.01, fr.parts[tag + 'hand'], P(r, far))
    return fn


layer('arms/gloves_leather')(gloves('leather'))
layer('arms/gloves_red')(gloves('cloth_red'))


# ---- hair (head-local: u forward, v up; head radius 5.75)
def hair(rkey, style):
    r = RAMPS[rkey]

    def inside_head(u, v, k=0.0):
        return u * u + v * v <= (HEAD_R + k) ** 2

    def pred(u, v):
        # face zone to keep clear: eyes at u 0.6..4.5, v -1.6..0.4; ear at u -1..0
        if style == 'hero':     # short, tousled, swept forward, two pointed locks over the brow
            cap = inside_head(u, v, 1.0) and v >= 1.4 + (0.6 if u > 0 and int(u + 9) % 2 else 0)
            back = inside_head(u, v, 1.0) and u <= -1.2 and v >= -3.4
            flick = (u + 6.0) ** 2 + (v + 2.4) ** 2 <= 1.5 ** 2 or (u + 5.4) ** 2 + (v - 2.6) ** 2 <= 1.6 ** 2
            locks = 0.5 <= v <= 1.6 and (abs(u - 2.4) <= (v - 0.4) * 0.8 or abs(u - 5.0) <= (v - 0.4) * 0.8)
            swoop = 5.0 <= u <= 7.4 and 1.4 <= v <= 3.8 - (u - 5.0) * 0.7
            spikes = 5.4 < v <= 7.8 and (abs(u + 1.5) <= 1.3 - (v - 5.4) * 0.5 or abs(u - 1.8) <= 1.1 - (v - 5.4) * 0.45)
            return cap or back or flick or locks or swoop or spikes
        if style == 'shaggy':   # longer, over the ears and down the nape
            cap = inside_head(u, v, 1.2) and v >= 1.0
            back = inside_head(u, v, 1.4) and u <= -1.2 and v >= -5.0
            nape = -3.6 <= u <= -1.2 and -6.8 <= v <= -4 and (int((u + 9) * 1.5) % 2 == 0)
            fringe = 0.6 <= v <= 1.2 and int((u + 9) * 1.2) % 2 == 0 and 0.4 <= u <= 6.0
            return cap or back or nape or fringe
        if style == 'curly':
            bumps = any(((u - a) ** 2 + (v - b) ** 2) <= 2.5 ** 2 for a, b in ((-4.2, 2.2), (-4.8, -1.0), (-2.8, -3.6), (-1.0, 4.8), (2.0, 5.2), (4.4, 3.2), (6.0, 1.6)))
            return (inside_head(u, v, 1.0) and v >= 1.8) or (bumps and not (u > 0.4 and v < 1.4) and not (-1.0 <= u <= 0 and v < 0))
        if style == 'short':
            return (inside_head(u, v, 0.9) and v >= 2.0) or (inside_head(u, v, 0.9) and u <= -1.2 and v >= -2.6)
        if style == 'long':     # past the shoulders, with a lock framing the face
            top = inside_head(u, v, 1.0) and v >= 1.2
            fall = -7.2 <= u <= -1.2 and -13.5 <= v <= 2 and (u + 4.2) ** 2 / 3.2 ** 2 + max(0, -v - 9) ** 2 / 4.6 ** 2 <= 1.0
            front = 4.9 <= u <= 6.8 and -5.0 <= v <= 1.4
            return top or fall or front
        if style == 'braid':
            top = inside_head(u, v, 1.0) and v >= 1.4
            back = inside_head(u, v, 1.0) and u <= -1.2 and v >= -3.0
            links = any(((u - a) ** 2 / 1.7 ** 2 + (v - b) ** 2 / 1.4 ** 2) <= 1 for a, b in ((-5.8, -3.5), (-6.4, -6.2), (-6.6, -8.9), (-6.6, -11.4)))
            tuft = (u + 6.6) ** 2 + (v + 13.4) ** 2 <= 1.5 ** 2
            return top or back or links or tuft
        if style == 'beard':    # bald: a full beard wrapping the jaw up to the ear, and a moustache
            # chin beard below the mouth, sideburns down the jaw, a moustache above the mouth
            beard = inside_head(u, v, 1.3) and v >= -8.0 and ((v <= -4.1 and u >= -2.6) or (-2.6 <= u <= -0.4 and v <= -0.8)
                                                              or (-0.4 <= u <= 1.4 and v <= -2.6))
            stache = 1.4 <= u <= 5.9 and -3.1 <= v <= -2.3
            return beard or stache
        if style == 'tufts':    # under a hat: the back and the sides only
            return inside_head(u, v, 1.0) and u <= -1.2 and -3.2 <= v <= 2.4
        return False

    def fn(c):
        fr = c.fr
        pix = fr.head_pixels(pred)
        eyes = fr.head_pixels(lambda u, v: 0.4 <= u < 4.6 and -1.6 <= v < 0.4)

        def paint(cv, pix):
            paint_set(cv, pix, r)
            # strand lines: a darker step every few pixels for texture
            for (x, y) in pix:
                if (x * 3 + y) % 5 == 0 and (x + 1, y) in pix and (x, y + 1) in pix and (x - 1, y) in pix:
                    cv.px(x, y, r[1 if len(r) < 5 else 2])
            # keep the eyes clear: the outline ring of brows and fringes must not cross them
            for (x, y) in eyes - pix:
                if 0 <= x < cv.w and 0 <= y < cv.h:
                    cv.p[x, y] = CLEAR
            if style == 'beard' and not fr.pose.expr:
                # a bald head needs brows to read as a face: low and heavy
                for (x, y) in fr.head_pixels(lambda u, v: (3.2 <= u < 5.0 or 0.4 <= u < 1.8) and 0.9 <= v < 1.9, pad=8) & fr.parts['head']:
                    cv.px(x, y, r[1])
        c.paint(7, pix, paint)
    return fn


for _k, (_r, _s) in {'hero_brown': ('hair_brown', 'hero'), 'shaggy_black': ('hair_black', 'shaggy'), 'curly_black': ('hair_black', 'curly'),
                     'short_blond': ('hair_blond', 'short'), 'long_grey': ('hair_grey', 'long'), 'braid_red': ('hair_red', 'braid'),
                     'beard_red': ('hair_red', 'beard'), 'tufts_black': ('hair_black', 'tufts')}.items():
    layer('hair/' + _k)(hair(_r, _s))


# ---- hats (head-local)
def hat_layer(fn_pred, rkey, extras=None, z=8):
    r = RAMPS[rkey]

    def fn(c):
        fr = c.fr
        pix = fr.head_pixels(fn_pred, pad=22)

        def paint(cv, pix):
            paint_set(cv, pix, r)
            if extras:
                extras(cv, fr, pix)
        c.paint(z, pix, paint)
    return fn


def witch(u, v):
    brim = -9.5 <= u <= 9.5 and 3.0 <= v <= 4.6 + (0 if abs(u) < 7 else -0.8)
    lean = (v - 4.5) * 0.42
    cone = 4.4 <= v <= 17.5 and abs(u + lean) <= max(0.6, 5.2 - (v - 4.4) * 0.36)
    tip = ((u + 7.6) ** 2 + (v - 17.0) ** 2) <= 1.6 ** 2
    return brim or cone or tip


def witch_extra(cv, fr, pix):
    band = fr.head_pixels(lambda u, v: 4.6 <= v <= 6.0 and abs(u + (v - 4.5) * 0.42) <= 5.3, pad=22) & pix
    for (x, y) in band:
        cv.px(x, y, RAMPS['cloth_navy'][2])
    for (x, y) in fr.head_pixels(lambda u, v: 4.6 <= v <= 6.0 and 0.6 <= u <= 2.4, pad=22) & pix:
        cv.px(x, y, RAMPS['gold'][3])


def straw(u, v):
    brim = -10 <= u <= 10 and 2.6 <= v <= 4.0 - (0.6 if abs(u) > 8 else 0)
    crown = abs(u + 0.3) <= 5.0 and 3.6 <= v <= 8.4 and (u + 0.3) ** 2 / 5.2 ** 2 + (v - 3.6) ** 2 / 4.8 ** 2 <= 1
    return brim or crown


def straw_extra(cv, fr, pix):
    for (x, y) in pix:
        if (x + y * 2) % 4 == 0:
            cv.px(x, y, RAMPS['thatch'][1])
    for (x, y) in fr.head_pixels(lambda u, v: 4.0 <= v <= 5.2 and abs(u + 0.3) <= 5.0, pad=22) & pix:
        cv.px(x, y, RAMPS['cloth_red'][2])


def cap(u, v):
    dome = (u + 0.8) ** 2 / 6.4 ** 2 + (v - 2.6) ** 2 / 5.8 ** 2 <= 1 and v >= 2.0
    slouch = -9.0 <= u <= -3 and 0.5 <= v <= 6 and (u + 6) ** 2 / 3.4 ** 2 + (v - 3) ** 2 / 3.0 ** 2 <= 1
    peak = 4.0 <= u <= 7.2 and 1.8 <= v <= 3.2
    return dome or slouch or peak


def cap_extra(cv, fr, pix):
    feather = fr.head_pixels(lambda u, v: -9 <= u <= -3 and abs(v - (6.5 + (-u - 3) * 0.9)) <= 0.8, pad=22)
    for (x, y) in feather:
        cv.px(x, y, RAMPS['cloth_red'][3])
    for (x, y) in fr.head_pixels(lambda u, v: abs(v - (6.5 + (-u - 3) * 0.9)) <= 0.2 and -9 <= u <= -3, pad=22):
        cv.px(x, y, RAMPS['cloth_red'][4])


def helm(u, v):
    dome = u * u / 6.6 ** 2 + (v - 1.6) ** 2 / 6.4 ** 2 <= 1 and v >= 1.4
    brim = -8.6 <= u <= 8.6 and 1.0 <= v <= 2.6
    return dome or brim


def helm_extra(cv, fr, pix):
    for (x, y) in fr.head_pixels(lambda u, v: abs(u) <= 0.6 and v >= 2.6, pad=22) & pix:
        cv.px(x, y, RAMPS['iron'][1])
    for (x, y) in fr.head_pixels(lambda u, v: (abs(u - 4) <= 0.5 or abs(u + 4) <= 0.5) and 2.8 <= v <= 3.6, pad=22) & pix:
        cv.px(x, y, RAMPS['iron'][4])


def mining(u, v):
    dome = u * u / 6.4 ** 2 + (v - 1.8) ** 2 / 6.0 ** 2 <= 1 and v >= 1.6
    brim = -7.0 <= u <= 7.8 and 1.0 <= v <= 2.4
    lamp = 5.0 <= u <= 8.2 and 3.4 <= v <= 6.4
    return dome or brim or lamp


def mining_extra(cv, fr, pix):
    for (x, y) in fr.head_pixels(lambda u, v: 6.2 <= u <= 8.2 and 4.2 <= v <= 5.8, pad=22) & pix:
        cv.px(x, y, RAMPS['fire'][4])
    for (x, y) in fr.head_pixels(lambda u, v: 5.4 <= u <= 6.2 and 4.2 <= v <= 5.8, pad=22) & pix:
        cv.px(x, y, RAMPS['fire'][3])


def horned(u, v):
    dome = u * u / 6.8 ** 2 + (v - 1.4) ** 2 / 6.6 ** 2 <= 1 and v >= 1.0
    band = -7.4 <= u <= 7.4 and 0.4 <= v <= 2.2
    def horn(sgn):
        # a curved horn rising from the side, sweeping out and up
        for t in range(0, 11):
            tt = t / 10.0
            hx = sgn * (5.6 + 4.2 * tt + 1.2 * math.sin(tt * 3))
            hy = 4.0 + 7.0 * tt * tt + 2.4 * tt
            if (u - hx) ** 2 + (v - hy) ** 2 <= (1.9 - 1.4 * tt) ** 2:
                return True
        return False
    return dome or band or horn(1) or horn(-1)


def horned_extra(cv, fr, pix):
    bone = RAMPS['wood_pale']
    for (x, y) in pix:
        u, v = fr.hl(x, y)
        if abs(u) > 6.0 and v > 3.2:
            cv.px(x, y, bone[3] if v - abs(u) * 0.4 > 2 else bone[2])
    for (x, y) in fr.head_pixels(lambda u, v: 0.8 <= v <= 1.8 and int(u + 9) % 4 == 0, pad=22) & pix:
        cv.px(x, y, RAMPS['iron'][4])


def mining_dented(u, v):
    dent = (u - 1.6) ** 2 + (v - 8.6) ** 2 <= 2.0 ** 2
    tilt = v - 1.8 + u * 0.08        # knocked askew
    dome = u * u / 6.4 ** 2 + tilt ** 2 / 6.0 ** 2 <= 1 and tilt >= -0.2 and not dent
    brim = -7.0 <= u <= 7.4 and 1.0 + u * 0.08 <= v <= 2.4 + u * 0.08
    lamp = 5.0 <= u <= 7.8 and 3.6 <= v <= 6.2
    return dome or brim or lamp


def mining_dented_extra(cv, fr, pix):
    # the lamp is out: a cracked dark lens; a crease runs from the dent
    for (x, y) in fr.head_pixels(lambda u, v: 5.6 <= u <= 7.8 and 4.2 <= v <= 5.8, pad=22) & pix:
        cv.px(x, y, hexc('#2a2a30'))
    for (x, y) in fr.head_pixels(lambda u, v: abs(v - 5.0 - (u - 6.2) * 0.9) < 0.45 and 5.8 <= u <= 7.4, pad=22) & pix:
        cv.px(x, y, hexc('#5a5a66'))
    for (x, y) in fr.head_pixels(lambda u, v: abs(u - 1.2 + (v - 6.4) * 0.5) < 0.5 and 3.6 <= v <= 6.6, pad=22) & pix:
        cv.px(x, y, RUST[0])


def rust_hat(fn_pred, extras):
    def fn(c):
        fr = c.fr
        pix = fr.head_pixels(fn_pred, pad=22)

        def paint(cv, pix):
            paint_set(cv, pix, RUST)
            extras(cv, fr, pix)
        c.paint(8, pix, paint)
    return fn


layer('hat/mining_helmet_dented')(rust_hat(mining_dented, mining_dented_extra))
layer('hat/witch')(hat_layer(witch, 'cloth_purple', witch_extra))
layer('hat/straw')(hat_layer(straw, 'thatch', straw_extra))
layer('hat/cap_green')(hat_layer(cap, 'cloth_green', cap_extra))
layer('hat/helmet_iron')(hat_layer(helm, 'iron', helm_extra))
layer('hat/mining_helmet')(hat_layer(mining, 'gold', mining_extra))
layer('hat/horned_helmet')(hat_layer(horned, 'iron', horned_extra))


# ---- glowing eyes: a sheet of their own that the game draws after the darkness pass
def glow_eyes(core, edge, wide=0.0):
    core, edge = hexc(core), hexc(edge)

    def fn(c):
        fr = c.fr
        if fr.pose.anim == 'death' and fr.pose.frame >= 7:
            return      # the light goes out of them
        pix = fr.head_pixels(lambda u, v: (3.5 - wide <= u < 4.5 + wide or 0.6 - wide <= u < 1.6 + wide) and -1.6 <= v < 0.4,
                             pad=8) & fr.parts['head']

        def paint(cv, ps):
            for (x, y) in ps:
                u, v = fr.hl(x, y)
                cv.px(x, y, core if v >= -1.0 else edge)
        c.paint(6.5, pix, paint)
    return fn


layer('glow/eyes_green')(glow_eyes('#e4ff9a', '#8cd84a'))
layer('glow/eyes_gold')(glow_eyes('#fff6b0', '#ffae2a', wide=0.25))


# ---- face pieces
@layer('extras/blindfold')
def _blindfold(c):
    fr = c.fr
    band = fr.head_pixels(lambda u, v: -1.8 <= v <= 1.0 and u * u + v * v <= (HEAD_R + 0.8) ** 2)
    knot = fr.head_pixels(lambda u, v: -8.2 <= u <= -5 and -3.4 <= v <= 0.2 and (abs(v + 1.6 - (u + 6) * 0.4) <= 1.0 or abs(v + 1.6 + (u + 6) * 0.4) <= 1.0))
    c.paint(7.5, band | knot, P(RAMPS['cloth_linen']))


@layer('extras/rope_bound')
def _rope(c):
    """Rope coils around the chest and arms (the tied-up miner)."""
    fr = c.fr
    r = RAMPS['wood_pale']
    rope = fr.torso_pixels(lambda u, v: abs(u) <= 6.6 and (abs(v - 3.5) <= 0.9 or abs(v - 7.0) <= 0.9))
    def paint(cv, pix):
        paint_set(cv, pix, r)
        for (x, y) in pix:
            if (x + y) % 3 == 0:
                cv.px(x, y, r[1])
    c.paint(9.6, rope, paint)


@layer('face/plague_mask')
def _mask(c):
    """A bone-white beaked mask; two dark sockets with a cold glow inside."""
    fr = c.fr
    r = RAMPS['cloth_linen']
    face = fr.head_pixels(lambda u, v: u >= 0.5 and u * u + v * v <= (HEAD_R + 0.3) ** 2 and -4 <= v <= 3)
    beak = fr.head_pixels(lambda u, v: 4.0 <= u <= 11.5 and (-4.2 + (u - 4) * 0.42) <= v <= (-0.4 - (u - 4) * 0.08) and v <= 0.5)

    def paint(cv, pix):
        paint_set(cv, pix, r)
        sockets = fr.head_pixels(lambda u, v: (2.6 <= u < 4.6 or 0.0 <= u < 1.6) and -1.6 <= v < 0.4) & pix
        for (x, y) in sockets:
            cv.px(x, y, hexc('#160c1a'))
        glow = fr.head_pixels(lambda u, v: (3.2 <= u < 4.2 or 0.4 <= u < 1.4) and -1.6 <= v < -0.6) & pix
        for (x, y) in glow:
            cv.px(x, y, RAMPS['spirit'][4])
        # stitched seam down the beak
        for (x, y) in fr.head_pixels(lambda u, v: 4.6 <= u <= 10.5 and abs(v - (-2.4 + (u - 4) * 0.17)) < 0.5) & pix:
            if (x + y) % 2 == 0:
                cv.px(x, y, r[1])
    c.paint(7.6, face | beak, paint)


@layer('extras/scarf_red')
def _scarf(c):
    """The hero's scarf: a wrap at the neck and two tails that stream with speed."""
    fr = c.fr
    p = fr.pose
    r = RAMPS['cloth_red']
    tl_ = TORSO - p.breath
    wrap = fr.torso_pixels(lambda u, v: tl_ - 1.4 <= v <= tl_ + 1.9 and -3.4 <= u <= 2.6 + (v - tl_) * 0.3)
    c.paint(9.05, wrap, P(r))     # over the near shoulder, under the hand
    ang, amp = {'idle': (-40, 5), 'walk': (-58, 8), 'run': (-84, 12), 'jump': (-36, 8), 'fall': (-150, 10),
                'attack': (-46, 6), 'death': (-70, 3)}[p.anim]
    if p.anim == 'attack' and p.frame in (3, 4):
        ang, amp = -80, 10
    stretch = {'run': 1.25, 'fall': 1.15}.get(p.anim, 1.0)
    base = add(add(fr.sh, fr.tf, -3.6), fr.tu, 0.4)
    pix, light = set(), set()
    for k, (L, da, w) in enumerate(((11.0, 0, 3.2), (8.5, -16, 2.7))):
        q, a = base, ang + da
        L *= stretch
        for i in range(4):
            a2 = a + amp * math.sin(p.frame * 1.9 + i * 1.4 + k * 2.1)
            q2 = add(q, dv(a2, L / 4))
            sg = capsule(q[0], q[1], q2[0], q2[1], max(1.6, w - i * 0.3))
            pix |= sg
            if i % 2 == 1:
                light |= sg
            q = q2

    def tails(cv, ps):
        # light and dark bands along the tails, so the scarf reads as cloth in motion
        paint_set(cv, ps, r, far=True)
        for (x, y) in light & ps:
            if (x + 1, y) in ps and (x - 1, y) in ps and (x, y - 1) in ps and (x, y + 1) in ps:
                cv.px(x, y, r[3])
    c.paint(0.5, pix, tails)


# ---- back items (z 0: behind the body; nearer parts erase them)
def back_offset(fr, u, v, origin=None):
    return fr.torso_pixels(lambda uu, vv: u(uu, vv), origin=origin)


@layer('back/cape_red')
def _cape_red(c):
    cape(c, 'cloth_red')


def cape(c, rkey):
    fr = c.fr
    r = RAMPS[rkey]
    sh = fr.sh
    fl = fr.pose.cape
    sway = fr.pose.sway
    # hangs from the shoulders, falls by gravity (not with the torso), flares back with speed
    k, tk = fr.S, fr.P['TORSO'] / TORSO      # broader bodies get a broader, longer cape
    top = (sh[0] + 1.0 * k, sh[1] + 0.5)
    L = (17.0 if fl >= 0 else 14.0) * tk
    if fl < 0:   # rising: the cape lifts above the shoulders
        tip = (top[0] + (6 + sway * 2) * k, top[1] + fl * 1.4)
    else:
        tip = (top[0] + (4 + fl + sway * 1.5) * k, top[1] + L - fl * 0.35)
    pts = [(top[0] - 2.6 * k, top[1] - 0.8), (top[0] + 2.6 * k, top[1] - 1.2), (tip[0] + 3.2 * k, tip[1]), (tip[0] - (2.6 + fl * 0.25) * k, tip[1] + 0.8)]
    if fr.pose.anim == 'death' and fr.pose.frame >= 5:
        pts = [(fr.sh[0] + 1, fr.sh[1] - 3), (fr.hip[0] + 4, fr.hip[1] - 4), (fr.hip[0] + 8, fr.hip[1] - 1), (fr.sh[0] + 2, fr.sh[1] - 1)]
    pix = polyset(pts)

    def paint(cv, pix):
        paint_set(cv, pix, r, far=True)
        # a fold line down the middle
        for (x, y) in pix:
            if (x - int(top[0]) - (y - int(top[1])) * 0.25) % 5 == 0 and (x + 1, y) in pix and (x - 1, y) in pix:
                cv.px(x, y, r[1])
    c.paint(0, pix, paint)


def pack(c, rope=False):
    fr = c.fr
    r = RAMPS['leather']
    bag = fr.torso_pixels(lambda u, v: -10.4 <= u <= -2.0 and 1.0 <= v <= 12.4 and not ((u < -9.0) and (v < 2.2 or v > 11.2)))
    roll = fr.torso_pixels(lambda u, v: -11.2 <= u <= -1.6 and 12.0 <= v <= 15.4 and not (u < -10.2 and (v < 12.8 or v > 14.6)))
    flap = fr.torso_pixels(lambda u, v: -10.6 <= u <= -2.6 and 9.2 <= v <= 11.2)

    def paint(cv, pix):
        paint_set(cv, pix, r)
    c.paint(0, bag, paint)
    c.paint(0.01, flap, P(RAMPS['cloth_brown']))
    c.paint(0.02, roll, P(RAMPS['cloth_red'] if not rope else RAMPS['cloth_grey']))
    if rope:
        coil = fr.torso_pixels(lambda u, v: ((u + 7.2) ** 2 + (v - 5.6) ** 2) <= 3.6 ** 2 and ((u + 7.2) ** 2 + (v - 5.6) ** 2) >= 1.4 ** 2)

        def rp(cv, pix):
            paint_set(cv, pix, RAMPS['wood_pale'])
            for (x, y) in pix:
                if (x + y) % 2 == 0:
                    cv.px(x, y, RAMPS['wood_pale'][1])
        c.paint(0.03, coil, rp)
    else:
        pot = fr.torso_pixels(lambda u, v: ((u + 10.8) ** 2 / 2.0 ** 2 + (v - 4.0) ** 2 / 1.8 ** 2) <= 1)
        c.paint(0.03, pot, P(RAMPS['copper']))


@layer('back/pack_big')
def _pack_big(c):
    pack(c)


@layer('back/pack_rope')
def _pack_rope(c):
    pack(c, rope=True)


@layer('back/shield_round')
def _shield(c):
    fr = c.fr
    disc_ = fr.torso_pixels(lambda u, v: (u + 4.6) ** 2 + (v - 7.0) ** 2 <= 6.2 ** 2)

    def paint(cv, pix):
        paint_set(cv, pix, RAMPS['wood'])
        ring = fr.torso_pixels(lambda u, v: 5.0 ** 2 <= (u + 4.6) ** 2 + (v - 7.0) ** 2 <= 6.0 ** 2) & pix
        for (x, y) in ring:
            cv.px(x, y, RAMPS['iron'][2])
        boss = fr.torso_pixels(lambda u, v: (u + 4.6) ** 2 + (v - 7.0) ** 2 <= 1.6 ** 2) & pix
        for (x, y) in boss:
            cv.px(x, y, RAMPS['iron'][3])
    c.paint(0, disc_, paint)


@layer('back/lantern')
def _lantern(c):
    """Maren's lantern hung at the hero's back hip, swinging a little."""
    fr = c.fr
    sw = fr.pose.sway
    o = add(fr.hip, fr.tf, -4.6 - sw * 0.6)
    hook = capsule(o[0], o[1] - 2, o[0], o[1] + 1, 1.0)
    body = {(x, y) for x in range(int(o[0]) - 2, int(o[0]) + 2) for y in range(int(o[1]) + 1, int(o[1]) + 7)}

    def paint(cv, pix):
        paint_set(cv, pix, RAMPS['iron'])
        cx, cy = int(o[0]), int(o[1])
        for (x, y) in ((cx - 1, cy + 3), (cx, cy + 3), (cx - 1, cy + 4), (cx, cy + 4)):
            cv.px(x, y, RAMPS['fire'][4] if y == cy + 3 else RAMPS['fire'][3])
        cv.px(cx - 2, cy + 2, RAMPS['fire'][2]); cv.px(cx + 1, cy + 5, RAMPS['fire'][2])
    c.paint(0, hook | body, paint)


# ---- held items (z 9.5: over the arm, under the gripping hand)
def item_layer(kind, **o):
    def fn(c):
        fr = c.fr
        A = fr.NA
        g = A[3]
        a = fr.pose.wpn
        if a is None:
            a = fr.pose.na[1] + 90
        if kind in ('hoe', 'pickaxe_tool', 'hammer') and fr.pose.anim in ('idle', 'walk') and not o.get('swing'):
            a = 168 if kind != 'hammer' else 150
        if kind == 'basket':
            basket(c, g)
            return
        draw_item(c, kind, g, a, o)
        if fr.pose.smear and kind in ('sword', 'axe', 'greataxe', 'pickaxe', 'hammer'):
            smear(c, g, fr.pose.smear, o.get('len', 12) + 3, o.get('smearr', 'steel'))
    return fn


def seg(g, a, t0, t1, w):
    d = dv(a, 1.0)
    p0, p1 = add(g, d, t0), add(g, d, t1)
    return capsule(p0[0], p0[1], p1[0], p1[1], w)


def draw_item(c, kind, g, a, o):
    d = dv(a, 1.0)
    n = dv(a - 90, 1.0)          # the leading side of the swing
    if kind == 'sword':
        L = o.get('len', 12)
        br, hr = RAMPS[o.get('blade', 'steel')], RAMPS[o.get('hilt', 'leather')]
        blade = seg(g, a, 2.2, 2.2 + L - 1.5, o.get('w', 2.4)) | seg(g, a, 2.2 + L - 1.6, 2.2 + L, 1.4)
        grip = seg(g, a, -2.2, 1.2, 1.8)
        gp = add(g, d, 1.9)
        guard = capsule(*add(gp, n, -o.get('guard', 2.6)), *add(gp, n, o.get('guard', 2.6)), 1.7)
        pom = disc(*add(g, d, -2.6), 1.2)

        def pb(cv, pix):
            paint_set(cv, pix, br)
            # a bright edge along the blade's lit side
            for k in range(3 * RS, int(L) * RS + 1):
                q = add(add(g, d, k / RS), n, -0.7 if math.sin(math.radians(a)) > 0 else 0.7)
                qx, qy = int(q[0] * RS), int(q[1] * RS)
                if (qx, qy) in pix:
                    cv.px(qx, qy, br[-1])
        c.paint(9.5, blade, pb)
        c.paint(9.51, grip | pom, P(hr))
        c.paint(9.52, guard, P(RAMPS[o.get('guardr', 'iron')]))
    elif kind == 'axe':
        L = o.get('len', 13)
        haft = seg(g, a, -3, L, 2.0)
        hp = [add(add(g, d, L - 5.4), n, 0.6), add(add(g, d, L - 6.6), n, 5.2), add(add(g, d, L - 3.4), n, 7.0),
              add(add(g, d, L + 1.6), n, 6.2), add(add(g, d, L + 0.6), n, 0.6)]
        back = [add(add(g, d, L - 4), n, -0.4), add(add(g, d, L - 3), n, -3.0), add(add(g, d, L - 0.6), n, -3.0), add(add(g, d, L), n, -0.4)]
        c.paint(9.5, haft, P(RAMPS['wood']))
        hr = RAMPS[o.get('head', 'iron')]

        def ph(cv, pix):
            paint_set(cv, pix, hr)
            edge = polyset([add(add(g, d, L - 6.6), n, 5.2), add(add(g, d, L - 3.4), n, 7.0), add(add(g, d, L + 1.6), n, 6.2),
                            add(add(g, d, L + 0.4), n, 5.0), add(add(g, d, L - 3.4), n, 5.8)])
            for (x, y) in edge & pix:
                cv.px(x, y, hr[-1])
        c.paint(9.51, polyset(hp) | polyset(back), ph)
    elif kind == 'greataxe':
        L = o.get('len', 17)
        haft = seg(g, a, -5, L + 0.8, 2.3)

        def at_(t, k):
            return add(add(g, d, t), n, k)
        hc_ = L - 4.2
        # a half moon: the convex cutting edge, horns that sweep back toward the haft, a hollowed back
        R_, ck = 8.6, -1.2
        edge = [at_(hc_ + R_ * math.sin(math.radians(t)), ck + R_ * math.cos(math.radians(t))) for t in range(-56, 57, 8)]
        back = [at_(hc_ + 4.6, 1.2), at_(hc_ + 2.0, 2.6), at_(hc_ - 2.0, 2.6), at_(hc_ - 4.6, 1.2)]
        blade = polyset(edge + back)
        socket = polyset([at_(hc_ - 2.6, -1.4), at_(hc_ - 2.6, 1.9), at_(hc_ + 2.6, 1.9), at_(hc_ + 2.6, -1.4)])
        spike = polyset([at_(hc_ - 1.4, -1.2), at_(hc_ - 0.2, -4.6), at_(hc_ + 0.8, -1.2)])
        rings = seg(g, a, -0.6, 0.4, 2.8) | seg(g, a, -5.4, -4.4, 2.8)
        hr = RAMPS['iron']
        ox, oy = at_(hc_, ck)

        def pblade(cv, pix):
            paint_set(cv, pix, hr)
            # a two-step bevel along the cutting edge
            for (x, y) in pix:
                r_ = math.hypot((x + 0.5) / RS - ox, (y + 0.5) / RS - oy)
                if r_ >= R_ - 0.6:
                    cv.px(x, y, RAMPS['steel'][4])
                elif r_ >= R_ - 1.4:
                    cv.px(x, y, RAMPS['steel'][3])
        c.paint(9.5, haft, P(RAMPS['wood']))
        c.paint(9.505, rings, P(RAMPS['gold']))
        c.paint(9.51, blade | spike, pblade)
        c.paint(9.52, socket, P(RAMPS['gold']))
    elif kind == 'pickaxe':
        L = 12
        haft = seg(g, a, -3, L, 2.0)
        head = set()
        for t in range(-6, 7):
            q = add(add(g, d, L - 0.6 - abs(t) * abs(t) * 0.06), n, t)
            head |= disc(q[0], q[1], 1.2 if abs(t) < 5 else 0.8)
        c.paint(9.5, haft, P(RAMPS['wood']))
        c.paint(9.51, head, P(RAMPS['iron']))
    elif kind == 'hoe':
        L = 15
        haft = seg(g, a, -5, L, 1.8)
        blade = set()
        for t in range(0, 5):
            q = add(add(g, d, L - t * 0.5), n, t + 0.5)
            blade |= disc(q[0], q[1], 1.1)
        c.paint(9.5, haft, P(RAMPS['wood_pale']))
        c.paint(9.51, blade, P(RAMPS['iron']))
    elif kind == 'hammer':
        L = 10
        haft = seg(g, a, -2, L, 2.0)
        hc = add(g, d, L)
        head = polyset([add(add(hc, n, 3.4), d, -2.2), add(add(hc, n, 3.4), d, 2.2), add(add(hc, n, -3.0), d, 2.2), add(add(hc, n, -3.0), d, -2.2)])
        c.paint(9.5, haft, P(RAMPS['wood']))
        c.paint(9.51, head, P(RAMPS['iron']))


def smear(c, g, sm, L, rkey):
    """A crescent tracing the blade's path: a bright leading rim that thins and fades inward."""
    a0, a1 = sm
    r = RAMPS[rkey]
    lo, hi = min(a0, a1), max(a0, a1)
    R0, R1 = L * 0.45 * RS, (L + 0.8) * RS
    pix = {}
    gx, gy = g[0] * RS, g[1] * RS
    for y in range(int(gy - R1) - 1, int(gy + R1) + 2):
        for x in range(int(gx - R1) - 1, int(gx + R1) + 2):
            dx, dy = x + 0.5 - gx, y + 0.5 - gy
            d = math.hypot(dx, dy)
            if not (R0 <= d <= R1):
                continue
            a = math.degrees(math.atan2(-dx, dy))       # from straight down, + forward
            while a < lo - 180:
                a += 360
            while a > lo + 180:
                a -= 360
            if a < lo - 360 or not (lo <= a <= hi or lo <= a + 360 <= hi):
                continue
            aa = a if lo <= a <= hi else a + 360
            # 0 at the trailing end of the swing, 1 at the blade's new position
            t = (aa - a0) / (a1 - a0) if a1 != a0 else 1
            depth = (d - R0) / (R1 - R0)             # 0 inner, 1 outer rim
            k = depth * (0.35 + 0.65 * t)
            if k < 0.22:
                continue
            pix[(x, y)] = k

    def paint(cv, ps):
        for (x, y) in ps:
            k = pix[(x, y)]
            if k > 0.72:
                cv.px(x, y, (r[-1][0], r[-1][1], r[-1][2], 235))
            elif k > 0.45:
                cv.px(x, y, (r[-2][0], r[-2][1], r[-2][2], 170))
            elif (x + y) % 2 == 0:
                cv.px(x, y, (r[-2][0], r[-2][1], r[-2][2], 110))
    c.paint(5.9, set(pix), paint)     # behind the head and the sword arm, over the body


def basket(c, g):
    x, y = g
    body = polyset([(x - 4.5, y + 3), (x + 4.5, y + 3), (x + 3.5, y + 8.5), (x - 3.5, y + 8.5)])
    handle = set()
    for t in range(0, 12):
        a0, a1 = math.pi * t / 12, math.pi * (t + 1) / 12
        handle |= capsule(x - 4 * math.cos(a0), y + 3 - 4.6 * math.sin(a0), x - 4 * math.cos(a1), y + 3 - 4.6 * math.sin(a1), 1.0)

    def paint(cv, pix):
        paint_set(cv, pix, RAMPS['wood_pale'])
        for (px_, py_) in pix:
            if (px_ + py_) % 2 == 0 and py_ > (y + 4) * RS:
                cv.px(px_, py_, RAMPS['wood_pale'][1])
        for (fx, fy, col) in ((x - 2, y + 2, RAMPS['cloth_red'][3]), (x + 1, y + 2, RAMPS['cloth_red'][3]),
                              (x - 1, y + 1, RAMPS['cloth_red'][3]), (x, y + 2, RAMPS['grass'][3])):
            for q in disc(fx + 0.5, fy + 0.5, 0.5 + 0.2 * (RS > 1)):
                cv.px(q[0], q[1], col)
    c.paint(9.5, body | handle, paint)


layer('hand/sword_wood')(item_layer('sword', len=10, blade='wood_pale', w=2.8, guard=2.0, guardr='wood', smearr='wood_pale'))
layer('hand/sword_iron')(item_layer('sword', len=13, blade='steel', smearr='steel'))
layer('hand/sword_gold')(item_layer('sword', len=14, blade='gold', hilt='cloth_red', guardr='gold', guard=3.2, w=2.6, smearr='gold'))
layer('hand/greataxe')(item_layer('greataxe', len=17, smearr='steel'))
layer('hand/pickaxe')(item_layer('pickaxe', smearr='iron'))
layer('hand/hoe')(item_layer('hoe'))
layer('hand/hammer')(item_layer('hammer', smearr='iron'))
layer('hand/basket')(item_layer('basket'))


# ------------------------------------------------------------------ build
def body_kind(key):
    if 'woman' in key:
        return 'woman'
    for k in ('zombie', 'devil', 'ghost'):
        if k in key:
            return k
    return 'man'


# Rig variants: (render scale, proportions, poses). The standard rig draws every layer; a variant
# draws only its own cast into char/<variant>/..., with its own posture (and for Gorrak, his own
# body drawn natively at 2x: a 1600x896 sheet of 160x128 frames that the engine uses unscaled).
RIGS = {
    '': (1, STD, poses),
    'ghoul/': (1, STD, ghoul_poses),
    'boss/': (2, BRUTE, brute_poses),
}
RIG_LAYERS = {
    'ghoul/': ['body/zombie', 'legs/pants_torn', 'top/shirt_torn', 'hat/mining_helmet_dented', 'hand/pickaxe', 'glow/eyes_green'],
    'boss/': ['back/cape_red', 'body/devil', 'legs/boots_iron', 'legs/pants_brown', 'top/chainmail', 'top/pauldrons',
              'hat/horned_helmet', 'arms/gloves_red', 'hand/greataxe', 'glow/eyes_gold'],
}
# drawn only for their variant (or only ever worn by it)
RIG_ONLY = {'hat/mining_helmet_dented', 'hand/greataxe', 'glow/eyes_green', 'glow/eyes_gold', 'top/pauldrons',
            'body/zombie', 'legs/pants_torn', 'top/shirt_torn', 'body/devil', 'back/pack_rope', 'back/cape_red',
            'hat/horned_helmet', 'arms/gloves_red'}
FRAMES = {}


def set_rs(rs):
    global RS
    RS = rs


def frames(rig=''):
    if rig not in FRAMES:
        rs, prop, pose_fn = RIGS[rig]
        P_ = pose_fn()
        FRAMES[rig] = {name: [Frame(P_[name][i], prop=prop) for i in range(n)] for name, n in ROWS}
    return FRAMES[rig]


def render_layer(key, rig=''):
    rs = RIGS[rig][0]
    set_rs(rs)
    try:
        fn = LAYERS[key]
        sheet = Canvas(800 * rs, 448 * rs)
        F = frames(rig)
        for row, (name, n) in enumerate(ROWS):
            for col in range(n):
                fr = F[name][col]
                cv = Canvas(FW * rs, FH * rs)
                c = Ctx(fr, cv)
                fn(c)
                c.run()
                sheet.im.paste(cv.im, (col * FW * rs, row * FH * rs))
    finally:
        set_rs(1)
    sheet.p = sheet.im.load()
    return sheet


# ------------------------------------------------------------------ dialogue portraits
# Busts drawn natively at 2x (the same layers, twice the detail) with a face of their own.
BUSTS = {
    'maren': (['body/woman_pale', 'top/dress_purple', 'hair/long_grey', 'hat/witch'],
              dict(kind='smile', skin='skin_pale', brow='hair_grey', blush=True)),
    'brann': (['body/man_tan', 'top/shirt_linen', 'top/apron', 'hair/beard_red'],
              dict(kind='stern', skin='skin_tan', brow='hair_red')),
    'lise': (['body/woman_tan', 'top/bodice_green', 'hair/braid_red'],
             dict(kind='grin', skin='skin_tan', brow='hair_red', blush=True)),
    'odo': (['body/man_brown', 'top/shirt_linen', 'hair/short_blond', 'hat/straw'],
            dict(kind='sleepy', skin='skin_brown', brow='hair_blond', blush=True)),
    'hal': (['back/shield_round', 'body/man_dark', 'top/chainmail', 'hat/helmet_iron'],
            dict(kind='flat', skin='skin_dark', brow='hair_black', heavy=True)),
    'tobin': (['body/man_pale', 'top/shirt_linen', 'hair/tufts_black', 'hat/mining_helmet'],
              dict(kind='smile', skin='skin_pale', brow='hair_black')),
    'tobin_rescued': (['body/man_pale', 'top/shirt_linen', 'hair/curly_black'],
                      dict(kind='worried', skin='skin_pale', brow='hair_black')),
    'pip': (['back/pack_big', 'body/man_tan', 'top/shirt_green', 'hair/shaggy_black', 'hat/cap_green'],
            dict(kind='smirk', skin='skin_tan', brow='hair_black')),
}
BUST = 48


def portrait_face(cv, fr, e):
    """Eyes, brows, nose shade, mouth and cheeks for a 2x bust. Paints only on bare skin."""
    skin = RAMPS[e['skin']]
    bare = {tuple(cv.p[x, y][:3]) for x, y in fr.parts['head'] if 0 <= x < cv.w and 0 <= y < cv.h and cv.p[x, y][3]}
    bare &= {tuple(c_[:3]) for c_ in skin}
    brow = RAMPS[e['brow']][1]
    lip = mix(skin[0], hexc('#6a1c22'), 0.45)
    white = hexc('#fbf4e6')
    kind = e['kind']

    def dot(u, v, col):
        x, y = fr.hp(u, v)
        if 0 <= x < cv.w and 0 <= y < cv.h and tuple(cv.p[x, y][:3]) in bare:
            cv.px(x, y, col)

    def line(u0, v0, u1, v1, col):
        n_ = max(1, int(max(abs(u1 - u0), abs(v1 - v0)) * 2 * 2))
        for i in range(n_ + 1):
            t = i / n_
            dot(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t, col)

    eyes = (4.05, 1.15)          # front eye, back eye (head-local u of each centre)
    # eyes
    for uc in eyes:
        if kind == 'sleepy':
            dot(uc - 0.5, -0.9, OUTLINE); dot(uc, -0.4, OUTLINE); dot(uc + 0.5, -0.9, OUTLINE)
            continue
        for du in (-0.25, 0.25):
            for v in (-1.2, -0.7, -0.2):
                dot(uc + du, v, OUTLINE)
        dot(uc + 0.25, -0.2, white)                      # catchlight toward the light
        if kind == 'worried':
            dot(uc - 0.75, -0.7, white)                  # wide-eyed
    # brows (the front eye's inner end is its back end, and the other way round)
    lift = {'grin': 0.4, 'worried': 0.2}.get(kind, 0.0)
    for j, uc in enumerate(eyes):
        inner, outer = (uc - 0.8, uc + 0.8) if j == 0 else (uc + 0.8, uc - 0.8)
        vi = vo = 0.95 + lift
        if kind == 'stern':
            vi -= 0.5
        elif kind == 'worried':
            vi += 0.5
        elif kind == 'smirk' and j == 0:
            vi += 0.5; vo += 0.5
        line(inner, vi, outer, vo, brow)
        if e.get('heavy') or kind == 'stern':
            line(inner, vi + 0.5, outer, vo + 0.5, brow)
    # nose: a shade under the tip
    dot(5.1, -2.6, skin[1]); dot(4.6, -2.6, skin[1])
    # mouth
    if kind == 'smile':
        dot(2.0, -3.3, lip); line(2.5, -3.8, 3.5, -3.8, lip); dot(4.0, -3.3, lip)
    elif kind == 'sleepy':
        dot(2.3, -3.4, lip); line(2.8, -3.8, 3.4, -3.8, lip); dot(3.9, -3.4, lip)
    elif kind == 'grin':
        line(2.0, -3.4, 4.2, -3.4, white)
        line(2.2, -3.9, 4.0, -3.9, lip)
        dot(1.7, -3.1, lip); dot(4.5, -3.1, lip)
    elif kind == 'stern':
        line(2.0, -3.7, 3.9, -3.7, lip)
    elif kind == 'flat':
        line(2.2, -3.8, 3.7, -3.8, lip); dot(1.8, -4.1, lip)
    elif kind == 'worried':
        for (u, v) in ((2.8, -3.6), (3.3, -3.6), (2.8, -4.1), (3.3, -4.1)):
            dot(u, v, lip)
        dot(2.8, -4.1, OUTLINE)
    elif kind == 'smirk':
        line(2.1, -3.9, 3.4, -3.9, lip); dot(3.9, -3.5, lip); dot(4.3, -3.1, lip)
    if e.get('blush'):
        blush = mix(skin[3], hexc('#e05a5a'), 0.35)
        dot(4.6, -2.0, blush); dot(5.1, -2.0, blush)


def render_bust(name):
    from PIL import Image
    keys, e = BUSTS[name]
    set_rs(2)
    try:
        pose = Pose(anim='idle', frame=0, na=(4, 8), fa=(-4, 4), head=-3, expr=e)
        fr = Frame(pose)
        full = Image.new('RGBA', (FW * 2, FH * 2), (0, 0, 0, 0))
        for k in keys:
            cv = Canvas(FW * 2, FH * 2)
            c = Ctx(fr, cv)
            LAYERS[k](c)
            c.run()
            full = Image.alpha_composite(full, cv.im)
        out = Canvas(FW * 2, FH * 2)
        out.im.paste(full, (0, 0))
        out.p = out.im.load()
        portrait_face(out, fr, e)
        cx, cy = int(fr.hc[0] * 2), int(fr.hc[1] * 2)
        x0, y0 = cx - BUST // 2 + 1, cy - BUST // 2 + 6
        bust = out.im.crop((x0, y0, x0 + BUST, y0 + BUST)).transpose(Image.FLIP_LEFT_RIGHT)   # face the dialogue
    finally:
        set_rs(1)
    return bust


def build(only=None):
    done = []
    for rig in RIGS:
        keys = RIG_LAYERS.get(rig) or [k for k in LAYERS if k not in RIG_ONLY]
        for k in keys:
            if only and not any(o in rig + k for o in only):
                continue
            render_layer(k, rig).save('char/' + rig + k)
            done.append(rig + k)
    for name in BUSTS:
        if only and not any(o in 'portrait_' + name for o in only):
            continue
        save(render_bust(name), 'npc/portrait_' + name)
        done.append('npc/portrait_' + name)
    if only is None:
        # a full build owns assets/char: drop sheets no layer draws any more
        import kit
        root = os.path.join(kit.ASSETS, 'char')
        keep = {os.path.normpath(os.path.join(root, *k.split('/')) + '.png') for k in done}
        for dp, _, fs in os.walk(root):
            for f in fs:
                fp = os.path.normpath(os.path.join(dp, f))
                if f.endswith('.png') and fp not in keep:
                    os.remove(fp)
    return done


if __name__ == '__main__':
    import time
    t = time.time()
    ks = build(sys.argv[1:] or None)
    print(len(ks), 'layers in', round(time.time() - t, 1), 's')
