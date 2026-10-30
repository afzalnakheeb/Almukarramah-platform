"""Editorial scenes for the website, built from real product cut-outs (scripts/product_photos.py):
a warm limestone wall lit by sunlight through an arched window (with the faint shadow of a mashrabiya screen),
products standing on a travertine ledge with soft shadows that fall away from the light.

Usage: python scripts/editorial.py <cut-out folder> <output folder>
Writes hero.jpg and hero-rtl.jpg (2400 x 1200, products on one side, space for the headline on the other)
and door-perfume.jpg, door-prayer.jpg, door-gifts.jpg (1200 x 1500) for the homepage category doors.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

CUT = sys.argv[1].rstrip("/") + "/products/"
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)


def arch_mask(w, h, cx, top, aw, ah):
    """An arched window shape (pointed arch on a rectangle), as a soft light patch."""
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    x0, x1 = cx - aw / 2, cx + aw / 2
    spring = top + aw * 0.55
    d.rectangle((x0, spring, x1, top + ah), fill=255)
    # pointed arch: two circle segments meeting at the top
    r = aw * 0.85
    for side in (-1, 1):
        ccx = cx - side * (r - aw / 2)
        bbox = (ccx - r, spring - r, ccx + r, spring + r)
        sub = Image.new("L", (w, h), 0)
        ImageDraw.Draw(sub).ellipse(bbox, fill=255)
        half = Image.new("L", (w, h), 0)
        ImageDraw.Draw(half).rectangle((x0 if side == -1 else cx, top - 10, cx if side == -1 else x1, spring), fill=255)
        m = Image.composite(Image.new("L", (w, h), 255), m, Image.fromarray(np.minimum(np.array(sub), np.array(half))))
    # mashrabiya screen: a faint lattice of eight-point stars inside the light
    lat = Image.new("L", (w, h), 0)
    dl = ImageDraw.Draw(lat)
    s = aw / 7
    for gy in np.arange(top, top + ah, s):
        for gx in np.arange(x0, x1, s):
            for ang in (0, 45):
                pts = [(gx + s / 2 + s * 0.34 * math.cos(math.radians(ang + k * 90)), gy + s / 2 + s * 0.34 * math.sin(math.radians(ang + k * 90))) for k in range(4)]
                dl.polygon(pts, outline=255, width=max(2, int(s * 0.07)))
    arr = np.array(m).astype(float) - np.array(lat).astype(float) * 0.55
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def scene(w, h, ledge, light, items, mirror=False):
    y, x = np.mgrid[0:h, 0:w].astype(float)
    xx = (w - 1 - x) if mirror else x
    # limestone wall: warm, slightly darker away from the light
    t = np.clip(np.sqrt(((xx - w * 0.30) / (w * 1.1)) ** 2 + ((y - h * 0.15) / (h * 1.2)) ** 2), 0, 1)
    wall = np.array((238, 230, 216), float) * (1 - t[..., None]) + np.array((214, 202, 182), float) * t[..., None]
    rng = np.random.default_rng(11)
    grain = Image.fromarray(np.clip(rng.normal(128, 30, (h // 4, w // 4)), 0, 255).astype(np.uint8)).resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(2))
    wall += (np.array(grain).astype(float)[..., None] - 128) * 0.035
    # sunlight through the arched window, cast on the wall
    cx, top, aw, ah = light
    if mirror:
        cx = w - cx
    lm = arch_mask(w, h, cx, top, aw, ah).filter(ImageFilter.GaussianBlur(int(aw * 0.03)))
    # skew the light slightly, as late-afternoon sun would
    lm = lm.transform((w, h), Image.AFFINE, (1, 0.18 if not mirror else -0.18, -h * 0.05 * (1 if not mirror else -1), 0, 1, 0), resample=Image.BICUBIC)
    L = np.array(lm).astype(float)[..., None] / 255
    img = wall * (1 - 0.55 * L) + np.array((255, 244, 222), float) * 0.55 * L + L * np.array((10, 6, 0))
    # travertine ledge
    led = (y > ledge).astype(float)[..., None]
    top_face = ((y > ledge) & (y < ledge + h * 0.035)).astype(float)[..., None]
    img = img * (1 - led) + led * (np.array((226, 216, 198), float) - (y[..., None] - ledge) * 0.06)
    img = img * (1 - top_face) + top_face * np.array((236, 228, 212), float)
    img += np.exp(-((y - ledge) / 1.5) ** 2)[..., None] * np.array((-28, -26, -22))
    img += rng.normal(0, 1.0, img.shape)
    bg = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")

    for name, ih, icx, drop in items:
        it = Image.open(CUT + name).convert("RGBA")
        it = it.resize((int(it.width * ih / it.height), ih), Image.LANCZOS)
        rgb = ImageEnhance.Brightness(it.convert("RGB")).enhance(1.02)
        it = Image.merge("RGBA", (*rgb.split(), it.split()[3]))
        icx = 1 - icx if mirror else icx
        base = ledge + int(h * 0.02) + drop
        x0, y0 = int(w * icx - it.width / 2), base - it.height
        a = it.split()[3]
        # long soft shadow falling away from the light, plus a tight contact shadow
        sh = Image.new("L", (w, h), 0)
        sk = it.height * 0.55
        flat = a.resize((it.width, max(1, int(it.height * 0.28))))
        sh.paste(flat, (x0 + int(sk * (-0.55 if mirror else 0.55)), base - flat.height + 6))
        sh = sh.filter(ImageFilter.GaussianBlur(max(6, it.height // 16)))
        shadow = Image.new("RGBA", (w, h), (70, 52, 32, 0))
        shadow.putalpha(sh.point(lambda v: int(v * 0.30)))
        bg = Image.alpha_composite(bg, shadow)
        c = Image.new("L", (w, h), 0)
        ImageDraw.Draw(c).ellipse((x0 + it.width * 0.08, base - 8, x0 + it.width * 0.92, base + 10), fill=150)
        contact = Image.new("RGBA", (w, h), (50, 38, 24, 0))
        contact.putalpha(c.filter(ImageFilter.GaussianBlur(8)))
        bg = Image.alpha_composite(bg, contact)
        L2 = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        L2.paste(it, (x0, y0), it)
        bg = Image.alpha_composite(bg, L2)
    return bg.convert("RGB")


def hanging(bg, name, ih, icx, top, mirror=False):
    """A prayer mat hung on the wall like a textile, with a soft shadow behind it."""
    w, h = bg.size
    it = Image.open(CUT + name).convert("RGBA")
    it = it.resize((int(it.width * ih / it.height), ih), Image.LANCZOS)
    icx = 1 - icx if mirror else icx
    x0 = int(w * icx - it.width / 2)
    sh = Image.new("RGBA", (w, h), (60, 44, 28, 0))
    m = Image.new("L", (w, h), 0)
    m.paste(it.split()[3], (x0 + (-22 if mirror else 22), top + 26))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(22)).point(lambda v: int(v * 0.32)))
    out = Image.alpha_composite(bg.convert("RGBA"), sh)
    L = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    L.paste(it, (x0, top), it)
    return Image.alpha_composite(out, L).convert("RGB")


def save(im, name):
    im.save(os.path.join(OUT, name), quality=86, optimize=True, progressive=True)
    print("wrote", name)


# Homepage hero: products on the right, the left kept calm for the headline
for mirror, fn in ((False, "hero.jpg"), (True, "hero-rtl.jpg")):
    W, H = 2400, 1200
    hero = scene(W, H, int(H * 0.80), (W * 0.70, 90, 560, 900), [], mirror)
    hero = hanging(hero, "kaaba-door-prayer-mat-1.webp", 760, 0.70, 120, mirror)
    hero = Image.fromarray(np.array(hero))
    items = [("aam/pearl-oud-75-ml-1.webp", 300, 0.575, 0), ("aam/oud-maattar-maliki-3-tola-1.webp", 340, 0.70, 6), ("aam/zumar-60-ml-1.webp", 410, 0.85, 0)]
    # draw the ledge items on top of the hung mat
    ledge_layer = scene(W, H, int(H * 0.80), (W * 0.70, 90, 560, 900), items, mirror)
    empty = scene(W, H, int(H * 0.80), (W * 0.70, 90, 560, 900), [], mirror)
    diff = np.abs(np.array(ledge_layer).astype(int) - np.array(empty).astype(int)).sum(2) > 6
    out = np.array(hero)
    out[diff] = np.array(ledge_layer)[diff]
    save(Image.fromarray(out), fn)

# Category doors (portrait)
W, H = 1200, 1500
save(scene(W, H, int(H * 0.74), (W * 0.52, 120, 520, 1100), [
    ("aam/oud-maattar-maliki-3-tola-1.webp", 330, 0.30, 0), ("aam/zumar-60-ml-1.webp", 470, 0.56, 0), ("aam/pearl-oud-75-ml-1.webp", 300, 0.80, 0)]), "door-perfume.jpg")
save(hanging(scene(W, H, int(H * 0.80), (W * 0.48, 80, 600, 1200), []), "mihrab-an-nabi-3d-woven-rug-1.webp", 960, 0.50, 120), "door-prayer.jpg")
save(scene(W, H, int(H * 0.74), (W * 0.50, 120, 520, 1100), [
    ("prophets-mosque-door-seal-gift-box-1.webp", 520, 0.36, 0), ("aam/qarnain-1.webp", 300, 0.72, 0)]), "door-gifts.jpg")
