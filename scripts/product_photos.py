"""Studio product photos: removes the background from each product photo and places the product on one consistent,
premium background with a soft shadow, at 1200 x 1500 (the 4:5 shape the shop uses).

Two looks:
  ivory  - warm ivory-to-sand studio light
  night  - deep navy with a soft gold glow (matches the site's dark sections)

Two steps, so the slow part (background removal) runs once and the look can be chosen afterwards:
  cut      python scripts/product_photos.py cut --list scripts/photo-all.txt --shard 3/12 --out photo-cut
           -> photo-cut/<local path>.webp (transparent cut-out), photo-cut/report-<shard>.json, review sheets
  compose  python scripts/product_photos.py compose --cut photo-cut --look ivory --dest public
           -> public/<local path> (same file names the shop already uses, so no database change is needed)

Photos where the product runs off the edge of the frame (close-ups, cropped shots) or where nothing could be
separated cleanly are reported as "keep" and are left as the original photo.
"""
import argparse
import io
import json
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage
from scipy.spatial import ConvexHull

W, H = 1200, 1500


MIRROR = "https://almukarramah.com"


def load(src: str, path: str = "") -> Image.Image:
    try:
        return _load(src)
    except Exception:
        # some partner photos are served in formats Pillow cannot read; the shop's own resized copy always works
        if path and src.startswith("http"):
            return _load(MIRROR + path)
        raise


def _load(src: str) -> Image.Image:
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


_BG = {}


def background(look: str) -> Image.Image:
    if look in _BG:
        return _BG[look].copy()
    if look == "night":
        bg = radial(W, H, (26, 33, 96), (7, 11, 44), power=1.2)
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        g = ImageDraw.Draw(glow)
        g.ellipse((W * 0.12, H * 0.10, W * 0.88, H * 0.78), fill=(201, 164, 92, 70))
        glow = glow.filter(ImageFilter.GaussianBlur(160))
        bg = Image.alpha_composite(bg.convert("RGBA"), glow)
        arch = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        a = ImageDraw.Draw(arch)
        m = 70
        a.rounded_rectangle((m, m, W - m, H - m), radius=40, outline=(201, 164, 92, 46), width=2)
        a.arc((m, m, W - m, W - 2 * m + m), 180, 360, fill=(201, 164, 92, 60), width=2)
        out = Image.alpha_composite(bg, arch)
    else:
        bg = radial(W, H, (255, 253, 248), (234, 223, 203), power=1.8)
        floor = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        f = ImageDraw.Draw(floor)
        f.rectangle((0, int(H * 0.80), W, H), fill=(214, 199, 172, 60))
        floor = floor.filter(ImageFilter.GaussianBlur(90))
        out = Image.alpha_composite(bg.convert("RGBA"), floor)
    _BG[look] = out
    return out.copy()


def solid_mask(alpha: np.ndarray, flat: bool) -> np.ndarray:
    """Background removal can punch holes in light parts of a product (white patterns on a rug).
    Holes enclosed by the product are always filled. For flat items (prayer mats, rugs) each piece
    is made solid along its outline (convex hull), which also fixes light areas touching the edge."""
    solid = alpha > 40
    filled = ndimage.binary_fill_holes(solid)
    if not flat:
        return filled
    labels, n = ndimage.label(filled)
    out = np.zeros_like(filled)
    total = filled.sum()
    for i in range(1, n + 1):
        part = labels == i
        if part.sum() < total * 0.02:
            continue
        ys, xs = np.nonzero(part)
        step = max(1, len(xs) // 20000)
        pts = np.stack([xs[::step], ys[::step]], 1)
        try:
            hull = ConvexHull(pts)
        except Exception:
            out |= part
            continue
        poly = Image.new("L", (alpha.shape[1], alpha.shape[0]), 0)
        ImageDraw.Draw(poly).polygon([tuple(pts[v]) for v in hull.vertices], fill=1)
        out |= np.array(poly).astype(bool)
    return out


def check(alpha: np.ndarray, edges_matter: bool = True) -> str:
    """Returns '' when the cut-out is usable, otherwise why the original photo should be kept."""
    m = alpha > 128
    cover = m.mean()
    if cover < 0.03:
        return "nothing found"
    if cover > 0.88:
        return "fills the frame"
    if not edges_matter:
        return ""
    edges = {"top": m[:3].any(0).mean(), "bottom": m[-3:].any(0).mean(), "left": m[:, :3].any(1).mean(), "right": m[:, -3:].any(1).mean()}
    cut = [k for k, v in edges.items() if v > 0.10]
    if cut:
        return "runs off the " + "/".join(cut) + " edge"
    return ""


def cutout(img: Image.Image, session, flat: bool = False, edges_matter: bool = True):
    from rembg import remove

    rgba = remove(img, session=session, post_process_mask=True)
    alpha = np.array(rgba.split()[-1])
    fill = solid_mask(alpha, flat)
    inner = ndimage.binary_erosion(fill, iterations=2)
    alpha = np.where(inner, 255, np.where(fill, np.maximum(alpha, 160), alpha)).astype(np.uint8)
    why = check(alpha, edges_matter)
    rgba = Image.merge("RGBA", (*img.convert("RGB").split(), Image.fromarray(alpha)))
    ys, xs = np.where(alpha > 12)
    if not len(xs):
        return None, why or "nothing found"
    pad = 4
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(rgba.width, xs.max() + pad), min(rgba.height, ys.max() + pad))
    return rgba.crop(box), why


def compose(item: Image.Image, look: str) -> Image.Image:
    bg = background(look)
    max_w, max_h = W * 0.76, H * 0.70
    s = min(max_w / item.width, max_h / item.height)
    item = item.resize((max(1, int(item.width * s)), max(1, int(item.height * s))), Image.LANCZOS)
    x = (W - item.width) // 2
    y = int(H * 0.47 - item.height / 2)
    y = max(int(H * 0.08), min(y, int(H * 0.86) - item.height))

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


def read_list(path):
    rows = []
    for line in open(path):
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split()
        rows.append({"path": parts[0], "src": parts[1], "flat": len(parts) > 2 and parts[2] == "flat"})
    return rows


def font(size):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/dejavu/DejaVuSans.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def sheet(entries, out_path):
    """Review sheet: per photo, original | ivory | night, three photos per row."""
    tw, th, gap, label = 240, 300, 8, 34
    per_row = 3
    rows = (len(entries) + per_row - 1) // per_row
    cell_w = tw * 3 + gap * 2
    canvas = Image.new("RGB", (per_row * cell_w + (per_row + 1) * 24, rows * (th + label + 24) + 24), (250, 250, 250))
    d = ImageDraw.Draw(canvas)
    f = font(15)
    for i, (name, orig, ivory, night, why) in enumerate(entries):
        cx = 24 + (i % per_row) * (cell_w + 24)
        cy = 24 + (i // per_row) * (th + label + 24)
        for j, im in enumerate([orig, ivory, night]):
            box = Image.new("RGB", (tw, th), (255, 255, 255))
            if im is not None:
                t = im.copy()
                t.thumbnail((tw, th))
                box.paste(t, ((tw - t.width) // 2, (th - t.height) // 2))
            canvas.paste(box, (cx + j * (tw + gap), cy))
        txt = f"{i + 1}. {name}" + (f"  KEEP ORIGINAL: {why}" if why else "")
        d.text((cx, cy + th + 8), txt[:110], fill=(180, 0, 0) if why else (20, 20, 20), font=f)
    canvas.save(out_path, quality=78)


def cmd_cut(a):
    from rembg import new_session

    rows = read_list(a.list)
    i, n = (int(x) for x in a.shard.split("/"))
    rows = rows[i - 1 :: n]
    os.makedirs(a.out, exist_ok=True)
    sheets_dir = os.path.join(a.out, "sheets")
    os.makedirs(sheets_dir, exist_ok=True)
    session = new_session(os.environ.get("PHOTO_MODEL", "birefnet-general"))
    report, review = [], []
    for r in rows:
        name = r["path"].split("/")[-1].rsplit(".", 1)[0]
        try:
            img = load(r["src"], r["path"])
            # partner packshots sit on white with soft shadows that can touch the frame; only our own photos are checked
            item, why = cutout(img, session, r["flat"], edges_matter=not r["path"].startswith("/products/aam/"))
            if item is not None and not why:
                dest = os.path.join(a.out, r["path"].lstrip("/").rsplit(".", 1)[0] + ".webp")
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                item.save(dest, "WEBP", quality=90, method=5)
            iv = compose(item, "ivory") if item is not None and not why else None
            ni = compose(item, "night") if item is not None and not why else None
            report.append({"path": r["path"], "ok": not why, "why": why})
            review.append((name, img, iv, ni, why))
            print("ok" if not why else "keep", r["path"], why, flush=True)
        except Exception as e:  # keep going; report at the end
            report.append({"path": r["path"], "ok": False, "why": f"error: {e}"})
            review.append((name, None, None, None, f"error: {e}"))
            print("FAILED", r["path"], e, file=sys.stderr, flush=True)
    for k in range(0, len(review), 12):
        sheet(review[k : k + 12], os.path.join(sheets_dir, f"{a.tag}sheet-{i:02d}-{k // 12 + 1}.jpg"))
    json.dump(report, open(os.path.join(a.out, f"report-{i:02d}.json"), "w"), indent=1)
    print(f"done: {sum(x['ok'] for x in report)} cut, {sum(not x['ok'] for x in report)} kept as original")


def cmd_compose(a):
    looks = {}
    if a.look_map:
        for line in open(a.look_map):
            if line.strip() and not line.startswith("#"):
                p, l = line.split()
                looks[p] = l
    keep = set()
    if a.keep and os.path.exists(a.keep):
        keep = {l.split()[0] for l in open(a.keep) if l.strip() and not l.startswith("#")}
    done = 0
    for root, _, files in os.walk(a.cut):
        for fn in files:
            if not fn.endswith(".webp"):
                continue
            rel = os.path.relpath(os.path.join(root, fn), a.cut).rsplit(".", 1)[0] + ".jpg"
            if "/" + rel in keep:
                continue
            look = looks.get("/" + rel, a.look)
            item = Image.open(os.path.join(root, fn)).convert("RGBA")
            dest = os.path.join(a.dest, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            compose(item, look).save(dest, quality=84, optimize=True, progressive=True)
            done += 1
    print(f"composed {done} photos")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cut")
    c.add_argument("--list", required=True)
    c.add_argument("--shard", default="1/1")
    c.add_argument("--out", default="photo-cut")
    c.add_argument("--tag", default="", help="prefix for review sheet names")
    m = sub.add_parser("compose")
    m.add_argument("--cut", default="photo-cut")
    m.add_argument("--look", default="ivory")
    m.add_argument("--look-map", help="optional file of '/products/x.jpg night' lines overriding the look per photo")
    m.add_argument("--keep", default="scripts/photo-keep.txt", help="photos to leave as the original")
    m.add_argument("--dest", default="public")
    a = p.parse_args()
    cmd_cut(a) if a.cmd == "cut" else cmd_compose(a)


if __name__ == "__main__":
    main()
