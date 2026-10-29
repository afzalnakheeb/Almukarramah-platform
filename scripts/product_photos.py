"""Studio product photos: removes the background from each product photo and places the product on one consistent,
premium background with a soft shadow, at 1200 x 1500 (the 4:5 shape the shop uses).

Two looks:
  ivory  - warm ivory-to-sand studio light (default for the shop)
  night  - deep navy with a soft gold glow (matches the site's dark sections)

Usage (runs in GitHub Actions, see .github/workflows/photos.yml):
  python scripts/product_photos.py --out photo-out --looks ivory,night --compare <image path or URL> ...
"""
import argparse
import io
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from rembg import new_session, remove

W, H = 1200, 1500


def load(src: str) -> Image.Image:
    if src.startswith("http"):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=60).read()
        return Image.open(io.BytesIO(data)).convert("RGB")
    return Image.open(src).convert("RGB")


def radial(w, h, inner, outer, cx=0.5, cy=0.42, power=1.6):
    y, x = np.mgrid[0:h, 0:w]
    d = np.sqrt(((x - cx * w) / (0.75 * w)) ** 2 + ((y - cy * h) / (0.75 * h)) ** 2)
    t = np.clip(d, 0, 1) ** power
    inner, outer = np.array(inner, float), np.array(outer, float)
    img = inner[None, None, :] * (1 - t[..., None]) + outer[None, None, :] * t[..., None]
    return Image.fromarray(img.astype(np.uint8), "RGB")


def background(look: str) -> Image.Image:
    if look == "night":
        bg = radial(W, H, (26, 33, 96), (7, 11, 44), power=1.2)
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        g = ImageDraw.Draw(glow)
        g.ellipse((W * 0.12, H * 0.10, W * 0.88, H * 0.78), fill=(201, 164, 92, 70))
        glow = glow.filter(ImageFilter.GaussianBlur(160))
        bg = Image.alpha_composite(bg.convert("RGBA"), glow)
        # thin gold arch line, very faint, for the house look
        arch = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        a = ImageDraw.Draw(arch)
        m = 70
        a.rounded_rectangle((m, m, W - m, H - m), radius=40, outline=(201, 164, 92, 46), width=2)
        a.arc((m, m, W - m, W - 2 * m + m), 180, 360, fill=(201, 164, 92, 60), width=2)
        return Image.alpha_composite(bg, arch)
    bg = radial(W, H, (255, 253, 248), (234, 223, 203), power=1.8)
    # soft floor: slightly warmer band at the bottom
    floor = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    f = ImageDraw.Draw(floor)
    f.rectangle((0, int(H * 0.80), W, H), fill=(214, 199, 172, 60))
    floor = floor.filter(ImageFilter.GaussianBlur(90))
    return Image.alpha_composite(bg.convert("RGBA"), floor)


def cutout(img: Image.Image, session) -> Image.Image:
    rgba = remove(img, session=session, post_process_mask=True)
    a = np.array(rgba.split()[-1])
    ys, xs = np.where(a > 12)
    if not len(xs):
        raise ValueError("nothing found in the photo")
    pad = 4
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(rgba.width, xs.max() + pad), min(rgba.height, ys.max() + pad))
    return rgba.crop(box)


def compose(item: Image.Image, look: str) -> Image.Image:
    bg = background(look)
    max_w, max_h = W * 0.76, H * 0.70
    s = min(max_w / item.width, max_h / item.height)
    item = item.resize((max(1, int(item.width * s)), max(1, int(item.height * s))), Image.LANCZOS)
    x = (W - item.width) // 2
    y = int(H * 0.47 - item.height / 2)
    y = max(int(H * 0.08), min(y, int(H * 0.86) - item.height))

    # soft contact shadow under the product and a gentle drop shadow from its own shape
    dark = 110 if look == "night" else 70
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    base_y = y + item.height
    sd.ellipse((x + item.width * 0.08, base_y - 18, x + item.width * 0.92, base_y + 26), fill=(40, 30, 20, dark))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    drop = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    mask = item.split()[-1].point(lambda v: int(v * (0.32 if look == "night" else 0.22)))
    drop.paste(Image.new("RGBA", item.size, (30, 22, 14, 255)), (x + 14, y + 22), mask)
    drop = drop.filter(ImageFilter.GaussianBlur(26))

    out = Image.alpha_composite(bg, shadow)
    out = Image.alpha_composite(out, drop)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(item, (x, y), item)
    return Image.alpha_composite(out, layer).convert("RGB")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--looks", default="ivory")
    p.add_argument("--compare", action="store_true", help="also write a before/after sheet per photo")
    p.add_argument("--names", default="", help="comma-separated output names, same order as the sources")
    p.add_argument("--list", help="file with one 'name source' per line")
    p.add_argument("sources", nargs="*")
    a = p.parse_args()
    if a.list:
        pairs = [l.split() for l in open(a.list) if l.strip() and not l.startswith("#")]
        a.names = ",".join(x[0] for x in pairs)
        a.sources = [x[1] for x in pairs]
    os.makedirs(a.out, exist_ok=True)
    looks = [l.strip() for l in a.looks.split(",") if l.strip()]
    names = [n for n in a.names.split(",") if n] or [os.path.splitext(os.path.basename(s.split("?")[0]))[0] for s in a.sources]
    session = new_session("isnet-general-use")
    failed = 0
    for src, name in zip(a.sources, names):
        try:
            img = load(src)
            item = cutout(img, session)
            outs = []
            for look in looks:
                o = compose(item, look)
                o.save(os.path.join(a.out, f"{name}--{look}.jpg"), quality=86, optimize=True, progressive=True)
                outs.append(o)
            if a.compare:
                before = img.copy()
                before.thumbnail((W, H))
                canvas = Image.new("RGB", (W * (1 + len(outs)) // 2, H // 2), (255, 255, 255))
                b = Image.new("RGB", (W, H), (255, 255, 255))
                b.paste(before, ((W - before.width) // 2, (H - before.height) // 2))
                for i, im in enumerate([b] + outs):
                    canvas.paste(im.resize((W // 2, H // 2)), (i * W // 2, 0))
                canvas.save(os.path.join(a.out, f"{name}--compare.jpg"), quality=80)
            print("ok", name)
        except Exception as e:  # keep going; report at the end
            failed += 1
            print("FAILED", name, e, file=sys.stderr)
    print(f"done, {failed} failed")


if __name__ == "__main__":
    main()
