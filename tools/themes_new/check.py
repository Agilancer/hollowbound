"""Validate src/data/themes.js and render one preview strip per theme.
usage: python3 tools/themes_new/check.py [PREVIEW_DIR]   (needs node on PATH; exits 1 on any error)"""
import sys, os, json, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from lib import ROOT, ASSETS, TILES_DOC, image

out = sys.argv[1] if len(sys.argv) > 1 else None
js = "import('%s/src/data/themes.js').then(m=>console.log(JSON.stringify({T:m.THEMES,P:m.PORTAL_FX,C:m.CHESTS})))" % ROOT
D = json.loads(subprocess.check_output(['node', '-e', js]))
assert D['P'] and D['C'], 'PORTAL_FX / CHESTS missing'
IDS = 'town wilds forest graveyard catacombs sewers march castle caves breach hall arena barrow cistern ossuary gatehouse vault'.split()
TILE_BY = {(t['src'], tuple(t['rect'])): t['id'] for t in TILES_DOC['tiles']}
errs = []
def E(*a): errs.append(' '.join(str(x) for x in a))

def chk_sprite(where, s, need_new=True, anchor=True):
    src = s.get('src'); p = os.path.join(ASSETS, src or '?')
    if not src or not os.path.exists(p): return E(where, 'missing src', src)
    if need_new and not src.startswith('env/new/'): E(where, 'not new art', src)
    im = image(src); r = s.get('rect') or [0, 0, *im.size]; x, y, w, h = r
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > im.size[0] or y + h > im.size[1]: return E(where, 'rect outside image', r, im.size)
    a = np.asarray(im.crop((x, y, x + w, y + h)))[:, :, 3]
    if (a > 40).mean() <= 0.05: E(where, 'rect <=5% opaque', src, r)
    if anchor:
        an = s.get('anchor')
        if not an or not (0 <= an[0] <= w and 0 <= an[1] <= h): E(where, 'anchor outside rect', an, r)

def chk_tex(where, t):
    if not isinstance(t, dict) or (t.get('src'), tuple(t.get('rect', []))) not in TILE_BY: return E(where, 'not a tiles.json TEX', t)
    chk_sprite(where, t, anchor=False)

def rng(where, n, lo, hi):
    if not lo <= n <= hi: E(where, 'count', n, 'not in', lo, '-', hi)

for tid in IDS:
    if tid not in D['T']: E('missing theme', tid)
for tid, t in D['T'].items():
    for k in ('name', 'sky', 'light', 'far', 'rope', 'particles'):
        if k not in t: E(tid, 'missing', k)
    chk_tex(tid + '.ground.top', t['ground']['top']); chk_tex(tid + '.ground.fill', t['ground']['fill']); chk_tex(tid + '.ledge.tex', t['ledge']['tex'])
    if t['backwall']: chk_tex(tid + '.backwall', t['backwall']['tex'])
    if t['stairs']:
        chk_sprite(tid + '.stairs', t['stairs'], anchor=False)
        if t['stairs']['rect'][2:] != [256, 80]: E(tid, 'stairs rect size')
    rng(tid + '.ledgeSprites', len(t['ledgeSprites']), 3, 8); rng(tid + '.bridges', len(t['bridges']), 0, 3)
    rng(tid + '.ladders', len(t['ladders']), 0, 2); rng(tid + '.props', len(t['props']), 18, 34); rng(tid + '.doors', len(t['doors']), 0, 2)
    for i, s in enumerate(t['ledgeSprites']):
        chk_sprite(f'{tid}.ledgeSprites[{i}]', s)
        if s['rect'][2] <= s['rect'][3]: E(tid, 'ledge sprite not wider than tall', s)
    for i, s in enumerate(t['bridges']): chk_sprite(f'{tid}.bridges[{i}]', s)
    for i, s in enumerate(t['ladders']): chk_sprite(f'{tid}.ladders[{i}]', s, anchor=False)
    for i, s in enumerate(t['doors']): chk_sprite(f'{tid}.doors[{i}]', s)
    for i, s in enumerate(t['props']):
        chk_sprite(f'{tid}.props[{i}]', s)
        if s['layer'] not in ('back', 'mid', 'front') or s['on'] not in ('ground', 'ledge', 'any', 'wall', 'hang'): E(tid, 'bad layer/on', s)
        if not 20 <= s['h'] <= 560: E(tid, 'h out of range', s)
        if s['light'] is not None and len(s['light']) != 3: E(tid, 'bad light', s)
    f = t.get('facade')
    if f:
        for k in ('wall', 'roof', 'foundation', 'trim'):
            for v in f[k]: chk_tex(f'{tid}.facade.{k}', v)
        for k in ('doors', 'windows', 'battlements'):
            for v in f.get(k, []): chk_sprite(f'{tid}.facade.{k}', v, need_new=False, anchor=False)
        for v in f.get('signs', []) + f.get('banners', []):
            if not os.path.exists(os.path.join(ASSETS, v)): E(tid, 'facade file missing', v)
        for r in f.get('recipes', []): chk_tex(f'{tid}.recipe.{r["id"]}.wall', r['wall']); chk_tex(f'{tid}.recipe.{r["id"]}.roof', r['roof'])
print('\n'.join(errs) if errs else 'OK: %d themes valid' % len(D['T']))

# ---------- previews ----------
if out:
    os.makedirs(out, exist_ok=True)
    try: F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
    except Exception: F = ImageFont.load_default()
    def cut(s):
        im = image(s['src']); x, y, w, h = s.get('rect') or [0, 0, *im.size]
        return im.crop((x, y, x + w, y + h))
    SC = 0.55   # px per world unit
    for tid, t in D['T'].items():
        W = 1900; rows = []      # each row: (height, [(img, x, y)], lines)
        im = Image.new('RGBA', (W, 4000), (22, 24, 30, 255)); d = ImageDraw.Draw(im)
        d.text((6, 4), f'{tid}  -  {t["name"]}   ground top | fill | ledge tex | backwall | stairs      ledgeSprites (cyan = walkable top), bridges, ladders', fill=(255, 255, 255), font=F)
        x = 6
        for tx in (t['ground']['top'], t['ground']['fill'], t['ledge']['tex'], (t['backwall'] or {}).get('tex')):
            if tx: c = cut(tx); im.alpha_composite(c, (x, 24)); im.alpha_composite(c, (x, 152))
            x += 134
        if t['stairs']: im.alpha_composite(cut(t['stairs']), (x - 130, 290))
        y0 = 24
        for grp, col in ((t['ledgeSprites'], (0, 255, 255)), (t['bridges'], (255, 255, 0))):
            for s in grp:
                c = cut(s); k = 200 / c.size[0] if grp is t['ledgeSprites'] else min(1, 420 / c.size[0])
                c2 = c.resize((max(1, int(c.size[0] * k)), max(1, int(c.size[1] * k))), Image.NEAREST)
                if x + c2.size[0] > W - 6: x = 550; y0 += 150
                im.alpha_composite(c2, (x, y0)); ay = y0 + int(s['anchor'][1] * k)
                d.line([x - 3, ay, x + c2.size[0] + 3, ay], fill=col); ax = x + int(s['anchor'][0] * k); d.line([ax, ay - 6, ax, ay + 6], fill=col)
                x += c2.size[0] + 14
        for s in t['ladders']:
            c = cut(s); k = 60 / c.size[0]; c2 = c.resize((60, int(c.size[1] * k)), Image.NEAREST).crop((0, 0, 60, min(140, int(c.size[1] * k))))
            if x + 70 > W: x = 550; y0 += 150
            im.alpha_composite(c2, (x, y0)); x += 70
        # props on baselines
        y = max(y0 + 160, 390); x = 60; rowh = 0; base = None
        def newrow(h):
            global y, x, rowh, base
            y += rowh + 40; x = 60; rowh = h; base = y + h
        items = sorted(t['props'] + [dict(dd, layer='door', on='ground', light=None) for dd in t['doors']], key=lambda s: (s['on'], -s['h']))
        cur = None
        for s in items:
            c = cut(s); k = s['h'] * SC / c.size[1]; c2 = c.resize((max(1, int(c.size[0] * k)), max(1, int(c.size[1] * k))), Image.LANCZOS)
            if cur != s['on'] or x + c2.size[0] > W - 10:
                if cur != s['on'] or True:
                    rowh_new = int(s['h'] * SC) + 10
                    y = (y + rowh + 44) if cur is not None else y; x = 60; rowh = rowh_new
                    d.text((4, y), s['on'], fill=(255, 200, 120), font=F)
                    if s['on'] in ('ground', 'ledge', 'any'):
                        d.line([0, y + rowh, W, y + rowh], fill=(120, 60, 60)); d.rectangle([8, y + rowh - int(100 * SC), 8 + int(45 * SC), y + rowh], outline=(90, 200, 90))
                    elif s['on'] == 'hang': d.line([0, y + 16, W, y + 16], fill=(120, 60, 60))
                cur = s['on']
            ax, ay = s['anchor'][0] * k, s['anchor'][1] * k
            if s['on'] == 'hang': py = y + 16 - ay
            elif s['on'] == 'wall': py = y + rowh / 2 - ay
            else: py = y + rowh - ay
            im.alpha_composite(c2, (int(x), int(max(0, py))))
            lab = f'{s["h"]}{s["layer"][0]}' + ('*' if s['light'] else '')
            d.text((int(x), y + rowh + 3), lab, fill=tuple(int(255 * v) for v in s['light']) if s['light'] else (170, 170, 170), font=F)
            d.ellipse([x + ax - 2, py + ay - 2, x + ax + 2, py + ay + 2], fill=(255, 0, 0))
            x += c2.size[0] + 12
        im.crop((0, 0, W, y + rowh + 24)).convert('RGB').save(os.path.join(out, tid + '.png'))
    print('previews in', out)
sys.exit(1 if errs else 0)
