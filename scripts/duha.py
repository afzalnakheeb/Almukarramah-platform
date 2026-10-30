"""'The House at Duha' scenes (creative brief in the studio folder): a Hijazi room in forenoon sun. Lime-plaster wall,
honed travertine ledge with a brass inlay, one arched patch of sunlight from a window off-frame, real product cut-outs
at true scale with shadows projected from the sun (on the ledge and folded up the wall), contact lines, soft
reflections for glass and metal, a grade and fine grain.

Usage:
  python scripts/duha.py <cut-out folder> <out folder> [hero|doors|all]
Writes hero-light.jpg, hero-light-rtl.jpg, hero-phone.jpg, hero-phone-rtl.jpg (+ layers/ for the film),
door-perfume.jpg, door-prayer.jpg, door-gifts.jpg.
"""
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image

CUT = sys.argv[1].rstrip('/') + '/products/'
OUT = sys.argv[2]
WHAT = sys.argv[3] if len(sys.argv) > 3 else 'all'
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(1447)

ELEV = math.radians(28)          # sun elevation
AZ = math.radians(35)            # sun direction against the wall plane
DX, DZ = math.cos(AZ), math.sin(AZ)   # along the wall (to the right), towards the wall (depth)


def hexf(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def noise(h, w, scale, octaves=4, seed=0):
    """Smooth value noise in [-1, 1] (never visibly tiles)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(2, int(scale / (2 ** o)))
        g = rng.standard_normal((h // s + 3, w // s + 3)).astype(np.float32)
        up = cv2.resize(g, (w + 3 * s, h + 3 * s), interpolation=cv2.INTER_CUBIC)[:h, :w]
        out += up * amp
        tot += amp
        amp *= 0.5
    out /= tot
    return out / (np.abs(out).max() + 1e-6)


def load(name):
    im = Image.open(CUT + name + '.webp').convert('RGBA')
    a = np.array(im).astype(np.float32) / 255.0
    # trim to content
    ys, xs = np.where(a[..., 3] > 0.03)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def resize(a, h=None, w=None):
    H0, W0 = a.shape[:2]
    if h is None:
        h = int(round(H0 * w / W0))
    if w is None:
        w = int(round(W0 * h / H0))
    # premultiplied resize keeps edges clean
    pm = a.copy()
    pm[..., :3] *= pm[..., 3:4]
    r = cv2.resize(pm, (w, h), interpolation=cv2.INTER_AREA if h < H0 else cv2.INTER_CUBIC)
    r[..., 3] = np.clip(r[..., 3], 0, 1)
    r[..., :3] = np.where(r[..., 3:4] > 1e-4, r[..., :3] / np.maximum(r[..., 3:4], 1e-4), 0)
    return np.clip(r, 0, 1)


def smooth_alpha(a):
    """Soften stair-stepped hard alpha edges by a sub-pixel amount without blurring the product."""
    al = a[..., 3]
    soft = cv2.GaussianBlur(al, (0, 0), 0.6)
    edge = (al > 0.02) & (al < 0.98) | (np.abs(cv2.Laplacian(al, cv2.CV_32F)) > 0.05)
    a[..., 3] = np.where(edge, np.minimum(al, soft * 1.02), al)
    return a


def relight(a, lit_left=True):
    """Luminance gradient across the product (+5 % lit side, -8 % far side), warm wrap on the lit edge, AO at the base."""
    h, w = a.shape[:2]
    x = np.linspace(0, 1, w)[None, :]
    if not lit_left:
        x = 1 - x
    g = 1.05 - 0.13 * x
    rgb = a[..., :3] * g[..., None]
    y = np.linspace(0, 1, h)[:, None]
    ao = 1 - 0.10 * np.clip((y - 0.97) / 0.03, 0, 1)
    rgb *= ao[..., None]
    al = a[..., 3]
    edge = np.clip(al - cv2.erode(al, np.ones((3, 3), np.uint8)), 0, 1)
    side = (x < 0.5).astype(np.float32)
    rgb += (edge * side)[..., None] * np.array([0.05, 0.035, 0.01], np.float32)
    out = a.copy()
    out[..., :3] = np.clip(rgb, 0, 1)
    return out


class Scene:
    def __init__(self, W, H, junction, front, scale, rtl=False):
        self.W, self.H, self.J, self.F, self.S, self.rtl = W, H, junction, front, scale, rtl
        self.depth_px = front - junction          # 30 cm of ledge depth seen as this many px
        self.k_depth = self.depth_px / 30.0       # px per cm of depth (foreshortened)

    # --- the set ---------------------------------------------------------------------------------------------
    def plate(self, seed=7):
        W, H, J, F = self.W, self.H, self.J, self.F
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        xx = (W - 1 - x) if self.rtl else x
        # wall: ambient headline tone, slightly darker towards the far corner, mottled lime plaster
        t = np.clip((xx / W) * 0.55 + (y / J) * 0.25, 0, 1)
        wall = hexf('E9E1D4') * (1 - t[..., None]) + hexf('E2D9CA') * t[..., None]
        mott = noise(H, W, 420, 4, seed) * 0.018 + noise(H, W, 140, 3, seed + 1) * 0.008
        trowel = cv2.GaussianBlur(noise(H, W, 18, 2, seed + 2), (0, 0), 3) * 0.005
        wall *= (1 + mott + trowel)[..., None]
        # ledge top (travertine): lit tone, with faint horizontal strata and sparse pores
        top = hexf('EFE6D8') * np.ones((H, W, 1), np.float32)
        strata = cv2.GaussianBlur(noise(H, W, 60, 2, seed + 3), (0, 0), 1)
        strata = cv2.resize(cv2.resize(strata, (W // 8, H)), (W, H))
        top *= (1 + strata[..., None] * 0.012)
        pores = (RNG.random((H, W)) > 0.9993).astype(np.float32)
        pores = cv2.GaussianBlur(cv2.dilate(pores, np.ones((2, 2), np.uint8)), (0, 0), 0.7)
        top *= (1 - pores[..., None] * 0.18)
        # depth shading on the ledge top: slightly darker near the wall (occlusion in the corner)
        dy = np.clip((y - J) / max(1, F - J), 0, 1)
        top *= (0.955 + 0.045 * dy)[..., None]
        # front face: under the lip darker, lightening down with floor bounce
        fy = np.clip((y - F) / max(1, H - F), 0, 1)
        face = hexf('D8CCB9') * (1 - fy[..., None]) + hexf('CDBFA9') * fy[..., None]
        face *= (1 + 0.04 * fy - 0.05 * np.exp(-fy / 0.12))[..., None] * (1 + mott[..., None] * 1.4 + strata[..., None] * 0.02)
        vein = cv2.GaussianBlur(noise(H, W, 260, 3, seed + 9), (0, 0), 2)
        face *= (1 + 0.012 * np.sin(vein * 9 + y / 37.0))[..., None]
        img = np.where((y < J)[..., None], wall, np.where((y < F)[..., None], top, face))
        # corner line where wall meets ledge (soft occlusion)
        img *= (1 - 0.10 * np.exp(-((y - J) / 4.0) ** 2) - 0.05 * np.exp(-np.clip(J - y, 0, None) / 18.0) * (y < J))[..., None]
        # bullnose catch-light, dark lip, brass inlay
        img += (np.exp(-((y - F) / 2.2) ** 2) * 18)[..., None]
        lip = np.exp(-((y - (F + 12)) / 6.0) ** 2) * (y > F)
        img *= (1 - 0.16 * lip)[..., None]
        brass = (np.abs(y - (F + 3)) < 1.6).astype(np.float32)
        brass = cv2.GaussianBlur(brass, (0, 0), 0.6)
        btone = hexf('B08D52') * (1 - 0.0) + 0
        img = img * (1 - brass[..., None]) + btone * brass[..., None]
        return img.astype(np.float32)

    def sun_patch(self, x0, x1, apex, soft=12):
        """Arched patch of sun on the wall (round arch), continuing onto the ledge top as a sheared patch."""
        W, H, J, F = self.W, self.H, self.J, self.F
        if self.rtl:
            x0, x1 = W - x1, W - x0
        m = np.zeros((H, W), np.float32)
        cx, r = (x0 + x1) / 2, (x1 - x0) / 2
        spring = apex + r
        cv2.rectangle(m, (int(x0), int(spring)), (int(x1), J), 1.0, -1)
        cv2.ellipse(m, (int(cx), int(spring)), (int(r), int(r)), 0, 180, 360, 1.0, -1)
        # onto the ledge: the opening's light continues forward, sheared away from the window
        shear = (-1 if self.rtl else 1) * 0.0
        pts = np.array([[x0 + 40 * (1 if not self.rtl else -1), J], [x1 + 40 * (1 if not self.rtl else -1), J],
                        [x1 + 160 * (1 if not self.rtl else -1), F], [x0 + 160 * (1 if not self.rtl else -1), F]], np.int32)
        cv2.fillPoly(m, [pts], 1.0)
        m = cv2.GaussianBlur(m, (0, 0), soft)
        return m

    # --- shadows -----------------------------------------------------------------------------------------------
    def cast_shadow(self, alpha, x, y_contact, depth_cm):
        """Project the product's silhouette along the sun onto the ledge, folding up the wall where it reaches it.
        alpha: HxW silhouette (placed with its bottom centre at x, y_contact). Returns a full-frame shadow mask."""
        h, w = alpha.shape
        S, k = self.S, self.k_depth
        sgn = -1 if self.rtl else 1
        ys, xs = np.nonzero(alpha > 0.35)
        step = max(1, len(xs) // 60000)
        ys, xs = ys[::step], xs[::step]
        z = (h - 1 - ys) / S                       # height above the ledge, cm
        px = x - w / 2 + xs                        # screen x of the point
        s = z / math.tan(ELEV)                     # horizontal travel of the shadow, cm
        reach = s * DZ                             # how far towards the wall it travels, cm
        on_ledge = reach < depth_cm
        sx = np.where(on_ledge, px + sgn * s * DX * S, px + sgn * (depth_cm / DZ) * DX * S)
        sy_ledge = y_contact - reach * k
        z_wall = z - (depth_cm / DZ) * math.tan(ELEV)
        sy_wall = self.J - z_wall * S
        sy = np.where(on_ledge, sy_ledge, sy_wall)
        m = np.zeros((self.H, self.W), np.float32)
        ok = (sx >= 0) & (sx < self.W) & (sy >= 0) & (sy < self.H)
        m[sy[ok].astype(int), sx[ok].astype(int)] = 1.0
        m = cv2.dilate(m, np.ones((7, 7), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((21, 21), np.uint8))
        m = cv2.erode(m, np.ones((5, 5), np.uint8))
        # penumbra grows with distance from the base: blend a sharp and a soft version
        sharp = cv2.GaussianBlur(m, (0, 0), 2)
        soft = cv2.GaussianBlur(m, (0, 0), 14)
        dist = np.zeros((self.H, self.W), np.float32)
        yy, xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32)
        dist = np.clip(np.abs(xx - x) / max(1.0, h * 1.4), 0, 1)
        return np.clip(sharp * (1 - dist) + soft * dist, 0, 1)

    def contact(self, x, y, wpx):
        m = np.zeros((self.H, self.W), np.float32)
        cv2.ellipse(m, (int(x), int(y)), (int(wpx * 0.46), 5), 0, 0, 360, 1.0, -1)
        return cv2.GaussianBlur(m, (0, 0), 3.5)


def grade_and_grain(img, sigma=1.4, seed=3):
    img = np.clip(img, 0, 255)
    # gentle S-curve on the set; levels 12..248
    t = img / 255.0
    t = t + 0.04 * np.sin(2 * math.pi * t) * -0.5
    img = 12 + t * (248 - 12)
    g = np.random.default_rng(seed).normal(0, sigma, img.shape[:2]).astype(np.float32)
    img = img + g[..., None]
    img = img + np.random.default_rng(seed + 1).random(img.shape).astype(np.float32) - 0.5   # dither
    return np.clip(img, 0, 255).astype(np.uint8)


def composite(base, layer, x, y_bottom):
    """Alpha-composite an RGBA float layer (0..1) onto base (float 0..255) with its bottom centre at (x, y_bottom)."""
    h, w = layer.shape[:2]
    x0, y0 = int(round(x - w / 2)), int(round(y_bottom - h))
    H, W = base.shape[:2]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    ex, ey = min(w, W - x0), min(h, H - y0)
    if ex <= sx0 or ey <= sy0:
        return
    roi = base[y0 + sy0:y0 + ey, x0 + sx0:x0 + ex]
    l = layer[sy0:ey, sx0:ex]
    a = l[..., 3:4]
    roi[:] = roi * (1 - a) + l[..., :3] * 255 * a


GLASS = ('pearl-oud', 'zumar-60-ml-1', 'kiswah', 'kiflain', 'maattar', 'ameer', 'rawdha', 'zam-zam')


def build_hero(variant):
    """variant: desktop | desktop-rtl | phone | phone-rtl. Returns (image uint8, layers dict)."""
    rtl = variant.endswith('rtl')
    phone = variant.startswith('phone')
    if phone:
        W, H, J, F, S = 1170, 1080, 770, 840, 13.0
    else:
        W, H, J, F, S = 2400, 1200, 840, 925, 21.5
    sc = Scene(W, H, J, F, S, rtl)
    img = sc.plate(seed=11 if not phone else 12)
    plate = img.copy()
    # sun patch on the wall and ledge
    if phone:
        sun = sc.sun_patch(W * 0.14, W * 0.80, 40, soft=10)
    else:
        sun = sc.sun_patch(1180, 1980, 60, soft=14)
    img = img * (1 - 0.035 * (1 - sun[..., None]))
    sunlit = img * (1 - sun[..., None]) + (img * 1.12) * sun[..., None]
    # bring the lit wall towards #F6EFE3 (white balance warm in sun)
    target = hexf('F6EFE3')
    sunlit = sunlit * (1 - 0.45 * sun[..., None]) + target * 0.45 * sun[..., None] * (img / np.maximum(hexf('E9E1D4'), 1))
    img = sunlit
    # faint haze along the beam (<= 5 %)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    beam_x = (xx if not rtl else W - 1 - xx) - (0.40 * W) * (yy / H)
    haze = np.exp(-((beam_x - 0.45 * W) / (0.22 * W)) ** 2) * (yy < J) * 0.03
    img = img + haze[..., None] * 255 * 0.5

    def X(x):
        return W - x if rtl else x

    layers = {'products': []}
    # the hung mat (floral vine, not sacred): true scale, hung from above the frame, cropped by the frame
    mat = load('floral-vine-prayer-mat-cream-1')
    mat_w = int((68 + 0) * S)
    mat = resize(mat, w=mat_w)
    mat = smooth_alpha(mat)
    mh = mat.shape[0]
    mat_bottom = 700 if not phone else 470
    mat_left = 1330 if not phone else int(W * 0.50)
    mat_cx = (mat_left + mat_w / 2) if not rtl else (W - mat_left - mat_w / 2)
    # textile relief: soft vertical sag and pile shading, edges a touch darker
    mx = np.linspace(-1, 1, mat.shape[1])[None, :]
    my = np.linspace(0, 1, mh)[:, None]
    relief = 1 - 0.035 * mx ** 2 + 0.012 * np.sin(my * 40 + mx * 3)
    mat[..., :3] *= relief[..., None]
    mat_blur = mat.copy()
    for c in range(4):
        mat_blur[..., c] = cv2.GaussianBlur(mat[..., c], (0, 0), 1.2 if not phone else 2.6)
    # mat shadow on the wall (1 cm off the wall)
    msh = np.zeros((H, W), np.float32)
    x0 = int(mat_cx - mat_w / 2)
    a = mat_blur[..., 3]
    ys0 = mat_bottom - mh
    tmp = np.zeros((H, W), np.float32)
    sy0, sx0 = max(0, -ys0), max(0, -x0)
    hh, ww = min(mh, H - ys0) - sy0, min(mat_w, W - x0) - sx0
    if hh > 0 and ww > 0:
        tmp[ys0 + sy0:ys0 + sy0 + hh, x0 + sx0:x0 + sx0 + ww] = a[sy0:sy0 + hh, sx0:sx0 + ww]
    off = 10 * (-1 if rtl else 1)
    msh = cv2.GaussianBlur(np.roll(np.roll(tmp, off, 1), 6, 0), (0, 0), 12) * 0.28
    img *= (1 - msh[..., None] * 0.9)
    # the mat itself, lit by the sun where the patch crosses it
    matlayer = np.zeros((H, W, 4), np.float32)
    composite_mat = img.copy()
    composite(composite_mat, mat_blur, mat_cx, mat_bottom)
    lit = sun[..., None]
    matmask = np.zeros((H, W), np.float32)
    if hh > 0 and ww > 0:
        matmask[ys0 + sy0:ys0 + sy0 + hh, x0 + sx0:x0 + sx0 + ww] = a[sy0:sy0 + hh, sx0:sx0 + ww]
    composite_mat = composite_mat * (1 + 0.06 * lit) * (1 - 0.06 * (1 - lit) * matmask[..., None])
    img = img * (1 - matmask[..., None]) + composite_mat * matmask[..., None]
    layers['mat'] = {'mask': matmask, 'cx': mat_cx, 'bottom': mat_bottom}

    # products: (name, true height cm, x, contact y, depth from the wall cm)
    if phone:
        k = W / 2400 * 1.42
        base_x = {'kiswah': 0.20, 'zumar-box': 0.66, 'kiflain': 0.40, 'zumar': 0.58, 'pearl': 0.80}
        cy_back, cy_front = 790, 818
        dback, dfront = (cy_back - J) / (F - J) * 30, (cy_front - J) / (F - J) * 30
        items = [('aam/kiswah-by-ahmed-50-ml-1', 12.2, W * base_x['kiswah'], cy_back, dback),
                 ('aam/zumar-60-ml-2', 14.0, W * base_x['zumar-box'], cy_back, dback),
                 ('aam/oud-kiflain-1', 9.5, W * base_x['kiflain'], cy_front, dfront),
                 ('aam/zumar-60-ml-1', 12.0, W * base_x['zumar'], cy_front, dfront),
                 ('aam/pearl-oud-75-ml-1', 13.0, W * base_x['pearl'], cy_front, dfront)]
    else:
        db, dfr = (860 - J) / (F - J) * 30, (895 - J) / (F - J) * 30
        items = [('aam/kiswah-by-ahmed-50-ml-1', 12.2, 1400, 860, db),
                 ('aam/zumar-60-ml-2', 14.0, 1950, 860, db),
                 ('aam/oud-kiflain-1', 9.5, 1620, 895, dfr),
                 ('aam/zumar-60-ml-1', 12.0, 1860, 895, dfr),
                 ('aam/pearl-oud-75-ml-1', 13.0, 2120, 895, dfr)]
    prepared = []
    for name, hcm, x, cy, depth in items:
        a = load(name)
        a = resize(a, h=int(hcm * S))
        a = smooth_alpha(a)
        a = relight(a, lit_left=not rtl)
        prepared.append((name, a, X(x), cy, depth))
    # shadows first (all of them), then contact lines, then reflections and products back to front
    shadow = np.zeros((H, W), np.float32)
    for name, a, x, cy, depth in prepared:
        shadow = np.maximum(shadow, sc.cast_shadow(a[..., 3], x, cy, depth))
    # shadows only darken where the sun falls (in shade they would be invisible); 72-80 % of the lit luminance
    shade = shadow * (0.26 * (0.30 + 0.70 * sun))
    img *= (1 - shade[..., None])
    for name, a, x, cy, depth in prepared:
        c = sc.contact(x, cy, a.shape[1])
        img = img * (1 - c[..., None] * 0.55) + hexf('8C7E6B') * (c[..., None] * 0.55)
    for name, a, x, cy, depth in sorted(prepared, key=lambda p: p[3]):
        if any(g in name for g in GLASS):
            rf = a[::-1].copy()
            fade = np.clip(1 - np.arange(rf.shape[0]) / 40.0, 0, 1)[:, None]
            rf[..., 3] *= fade * 0.06
            for ch in range(4):
                rf[..., ch] = cv2.GaussianBlur(rf[..., ch], (0, 0), 4)
            composite(img, rf, x, cy + rf.shape[0] + 2)
        composite(img, a, x, cy)
        layers['products'].append({'name': name, 'x': float(x), 'contact': float(cy), 'h': a.shape[0], 'w': a.shape[1]})
    out = grade_and_grain(img, sigma=1.4 if not phone else 1.2, seed=5)
    layers.update({'plate': plate, 'sun': sun, 'shade': shade, 'prepared': prepared, 'W': W, 'H': H, 'J': J, 'F': F})
    return out, layers


def save(arr, name, q=88):
    Image.fromarray(arr).save(os.path.join(OUT, name), quality=q, optimize=True, progressive=True)
    print('wrote', name)


if __name__ == '__main__':
    if WHAT in ('hero', 'all'):
        for v, fn in (('desktop', 'hero-light.jpg'), ('desktop-rtl', 'hero-light-rtl.jpg'), ('phone', 'hero-phone.jpg'), ('phone-rtl', 'hero-phone-rtl.jpg')):
            img, L = build_hero(v)
            save(img, fn)
