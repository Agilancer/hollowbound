"""Contact sheets: every extracted sprite outlined + numbered, with its ground anchor (red) and walkable-top line (cyan).
usage: python3 tools/themes_new/contact.py OUTDIR [pack]"""
import sys, os
from PIL import Image, ImageDraw, ImageFont
from lib import *
out = sys.argv[1]; only = sys.argv[2] if len(sys.argv) > 2 else None
os.makedirs(out, exist_ok=True)
try: F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
except Exception: F = ImageFont.load_default()
def sheet_img(key, scale=1.0):
    sp = BY_SHEET[key]; im = image(sp[0]['src'])
    bg = Image.new('RGBA', im.size, (26, 28, 36, 255)); bg.alpha_composite(im); d = ImageDraw.Draw(bg)
    for i, s in enumerate(sp):
        x, y, w, h = s['rect']; d.rectangle([x, y, x + w - 1, y + h - 1], outline=(90, 90, 110))
        ga = ground_anchor(s['id']); ta = top_anchor(s['id'])
        d.line([x, y + ta[1], x + w, y + ta[1]], fill=(0, 255, 255))
        d.ellipse([x + ga[0] - 4, y + ga[1] - 4, x + ga[0] + 4, y + ga[1] + 4], fill=(255, 40, 40))
        d.rectangle([x, y, x + 30, y + 22], fill=(0, 0, 0)); d.text((x + 2, y), str(i), fill=(255, 255, 0), font=F)
    d.text((4, im.size[1] - 24), key[0] + '/' + key[1], fill=(255, 255, 255), font=F)
    return bg.convert('RGB')
keys = sorted(BY_SHEET)
for pack in ('env', 'acres'):
    if only and only != pack: continue
    for k in keys:
        if k[0] == pack: sheet_img(k).save(os.path.join(out, f'{pack}_{k[1][:28]}.png'))
for pack, per, cols in (('dng40', 6, 2), ('dng100', 12, 4)):
    if only and only != pack: continue
    ks = [k for k in keys if k[0] == pack]
    for n in range(0, len(ks), per):
        ims = [sheet_img(k) for k in ks[n:n + per]]; w, h = ims[0].size
        rows = (len(ims) + cols - 1) // cols
        M = Image.new('RGB', (w * cols, h * rows), (0, 0, 0))
        for i, im in enumerate(ims): M.paste(im, ((i % cols) * w, (i // cols) * h))
        M.save(os.path.join(out, f'{pack}_{n // per:02d}.png'))
