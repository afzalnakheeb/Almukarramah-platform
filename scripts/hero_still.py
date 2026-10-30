"""Homepage hero still life: real product cut-outs (from scripts/product_photos.py) staged in a dark emerald
gallery: a prayer mat hung on the wall like a textile, perfumes and oud on a stone ledge, warm light from the left.
The left side is kept dark and empty for the headline.

Usage: python scripts/hero_still.py <cut-out folder> <output.jpg> [rtl]
With rtl the scene is mirrored (products on the left) for the Arabic page; the products themselves are not flipped.
"""
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

CUT, OUT = sys.argv[1].rstrip("/") + "/products/", sys.argv[2]
RTL = len(sys.argv) > 3 and sys.argv[3] == "rtl"
W, H = 2400, 1200
LEDGE = int(H * 0.80)
WALL = [("kaaba-door-prayer-mat-1.webp", 860, 0.875, 60)]  # name, height, centre x (share of width), top
LEDGE_ITEMS = [  # name, height, centre x, drop below the ledge line
    ("aam/pearl-oud-75-ml-1.webp", 330, 0.515, 40),
    ("aam/oud-maattar-maliki-3-tola-1.webp", 370, 0.622, 52),
    ("aam/zumar-60-ml-1.webp", 440, 0.727, 40),
]

y, x = np.mgrid[0:H, 0:W].astype(float)
if RTL:
    x = W - 1 - x  # mirror the room and the light; products are placed at mirrored positions below
    WALL = [(n, h, 1 - cx, top) for n, h, cx, top in WALL]
    LEDGE_ITEMS = [(n, h, 1 - cx, dr) for n, h, cx, dr in LEDGE_ITEMS]
d = np.sqrt(((x - W * 0.72) / (W * 0.55)) ** 2 + ((y - H * 0.42) / (H * 0.75)) ** 2)
t = np.clip(d, 0, 1) ** 1.3
img = np.array((24, 72, 58), float) * (1 - t[..., None]) + np.array((6, 24, 19), float) * t[..., None]
beam = np.exp(-(((x - W * 0.30) * 0.80 - y * 0.62) / (W * 0.09)) ** 2) * np.clip(1 - y / H * 0.9, 0, 1)
img += beam[..., None] * np.array((70, 58, 30)) * 0.55
led = (y > LEDGE).astype(float)
img = img * (1 - 0.38 * led[..., None]) + led[..., None] * np.array((10, 30, 25)) * 0.38
img += np.exp(-((y - LEDGE) / 3.0) ** 2)[..., None] * np.array((120, 100, 60)) * 0.35
img += np.random.default_rng(3).normal(0, 1.4, img.shape)
bg = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")

# faint gold eight-point stars on the wall
lat = Image.new("RGBA", (W, H), (0, 0, 0, 0))
dl = ImageDraw.Draw(lat)
for cy in range(0, LEDGE, 90):
    for cx in range((cy // 90) % 2 * 45, W, 90):
        for ang in (0, 45):
            pts = [(cx + 14 * math.cos(math.radians(ang + k * 90)), cy + 14 * math.sin(math.radians(ang + k * 90))) for k in range(4)]
            dl.polygon(pts, outline=(201, 164, 104, 22))
bg = Image.alpha_composite(bg, lat)


def layer(im, xy):
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    L.paste(im, xy, im)
    return L


def load(name, h):
    it = Image.open(CUT + name).convert("RGBA")
    it = it.resize((int(it.width * h / it.height), h), Image.LANCZOS)
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(it.convert("RGB")).enhance(1.04)).enhance(0.96)
    return Image.merge("RGBA", (*rgb.split(), it.split()[3]))


for name, h, cx, top in WALL:
    it = load(name, h)
    x0 = int(W * cx - it.width / 2)
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sh.paste(Image.new("RGBA", it.size, (0, 0, 0, 255)), (x0 + 26, top + 30), it.split()[3].point(lambda v: int(v * 0.55)))
    bg = Image.alpha_composite(bg, sh.filter(ImageFilter.GaussianBlur(24)))
    bg = Image.alpha_composite(bg, layer(it, (x0, top)))

for name, h, cx, drop in LEDGE_ITEMS:
    it = load(name, h)
    base = LEDGE + drop
    x0, y0 = int(W * cx - it.width / 2), base - it.height
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((x0 + it.width * 0.05, base - 14, x0 + it.width * 0.95, base + 16), fill=(0, 0, 0, 140))
    bg = Image.alpha_composite(bg, sh.filter(ImageFilter.GaussianBlur(16)))
    rf = it.transpose(Image.FLIP_TOP_BOTTOM)
    a = np.array(rf.split()[3]).astype(float) * np.clip(1 - np.arange(rf.height) / (rf.height * 0.35), 0, 1)[:, None] * 0.16
    rf.putalpha(Image.fromarray(a.astype(np.uint8)))
    bg = Image.alpha_composite(bg, layer(rf, (x0, base + 2)).filter(ImageFilter.GaussianBlur(2)))
    bg = Image.alpha_composite(bg, layer(it, (x0, y0)))

arr = np.array(bg.convert("RGB")).astype(float)
arr += np.exp(-(((x - W * 0.74) / (W * 0.25)) ** 2 + ((y - H * 0.70) / (H * 0.30)) ** 2))[..., None] * np.array((40, 32, 14))
arr *= np.clip(1 - 0.45 * (np.sqrt(((x - W * 0.6) / (W * 0.75)) ** 2 + ((y - H * 0.5) / (H * 0.8)) ** 2)) ** 2, 0.4, 1)[..., None]
Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(OUT, quality=86, optimize=True, progressive=True)
print("hero written", OUT)
