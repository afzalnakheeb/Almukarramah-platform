"""Write src/components/logo-data.ts from logo-merged.json (vectorize.py) and the satin gold fitted from logo-gold.png.
Usage: emit_ts.py logo-merged.json assets/logo-gold.png out.ts"""
import json
import sys

import numpy as np
from PIL import Image

data = json.load(open(sys.argv[1]))
g = np.array(Image.open(sys.argv[2]).convert('RGBA')).astype(float)
OUT = sys.argv[3]

# ---- satin gold: vertical gradient (10th percentile per row, outside the sheen) + a soft diagonal sheen band ----
m = g[..., 3] >= 240
ys, xs = np.nonzero(m)
rgb = g[m][:, :3]
H = g.shape[0]
V = np.zeros((H, 3))
for y in range(H):
    s = ys == y
    if s.sum() > 5:
        V[y] = np.percentile(rgb[s], 10, axis=0)
yy = np.arange(H)
ok = V[:, 0] > 0
for k in range(3):
    V[:, k] = np.interp(yy, yy[ok], V[ok, k])
Y0, Y1 = int(yy[ok].min()), int(yy[ok].max())
stop_ys = [Y0, 50, 80, 105, 122, 132, 145, 165, 190, 215, Y1]
hexc = lambda c: '#%02X%02X%02X' % tuple(int(round(v)) for v in c)
gold_stops = [(round((y - Y0) / (Y1 - Y0), 3), hexc(V[y])) for y in stop_ys]

# sheen fit: r = A * exp(-((n.p - c)/w)^2)
r = rgb - V[ys]
best = None
for ang in np.arange(-80, -45, 0.5):
    t = np.radians(ang)
    n = np.array([np.cos(t), np.sin(t)])
    proj = xs * n[0] + ys * n[1]
    for c in np.arange(proj.min(), proj.max(), 2):
        for w in (50, 55, 60, 65, 70):
            f = np.exp(-((proj - c) / w) ** 2)
            A = (f @ r[:, 0]) / (f @ f)
            e = ((r[:, 0] - A * f) ** 2).mean()
            if best is None or e < best[0]:
                best = (e, ang, c, w, A)
e, ang, c, w, A = best
t = np.radians(ang)
n = np.array([np.cos(t), np.sin(t)])
alpha = 0.22
base_mid = V[(Y0 + Y1) // 2]
sheen_color = hexc(np.clip(base_mid + A / alpha, 0, 255))
R = 2.5 * w
p0, p1 = (c - R) * n, (c + R) * n
sheen_stops = []
for off in np.linspace(0, 1, 11):
    d = (off - 0.5) * 2 * R
    sheen_stops.append((round(off, 2), round(alpha * float(np.exp(-(d / w) ** 2)), 3)))
print(f'sheen fit err {e:.3f} angle {ang} c {c:.1f} w {w} A {A:.2f} colour {sheen_color}')
print('gold stops', gold_stops)

lines = ',\n'.join(f"  {{ d: '{s['d']}', len: {s['len']} }}" for s in data['archStroke'])
ts = f"""// The Al Mukarramah logo as vector paths, traced from assets/logo-ink.png (8x sub-pixel contours fitted with
// cubic Beziers; overlap with the PNG: IoU 0.994). The letters are the brand artwork, unchanged: do not edit by hand.
// Regenerate with scripts/logo/vectorize.py, scripts/logo/verify.py and scripts/logo/emit_ts.py.

/** viewBox of the artwork (the PNGs are {data['w']} x {data['h']}). */
export const LOGO_W = {data['w']};
export const LOGO_H = {data['h']};

/** One path per part, fill-rule evenodd: the Arabic wordmark, the Latin word and the arch monogram. */
export const LOGO_PATHS = {{
  arabic: '{data['arabic']}',
  latin: '{data['latin']}',
  arch: '{data['arch']}',
}};

/** The arch outline and its opening, split at the keystone: each runs from the apex down one side, so the line can be
 *  drawn symmetrically. len is the path length in viewBox units (for stroke-dasharray). */
export const ARCH_LINES: {{ d: string; len: number }}[] = [
{lines},
];

/** The artwork is drawn at 95.7 % opacity in the PNGs; kept so the vector logo looks identical. */
export const LOGO_OPACITY = 0.957;
export const LOGO_INK = '#1C1A17';

/** Satin antique gold of assets/logo-gold.png: a vertical gradient (userSpaceOnUse, y {Y0} to {Y1}) ... */
export const GOLD = {{
  y1: {Y0},
  y2: {Y1},
  stops: [{', '.join(f"[{o}, '{col}']" for o, col in gold_stops)}] as [number, string][],
}};

/** ... plus a soft diagonal sheen band laid over it. */
export const GOLD_SHEEN = {{
  x1: {p0[0]:.1f}, y1: {p0[1]:.1f}, x2: {p1[0]:.1f}, y2: {p1[1]:.1f},
  color: '{sheen_color}',
  stops: [{', '.join(f'[{o}, {a}]' for o, a in sheen_stops)}] as [number, number][],
}};
"""
open(OUT, 'w').write(ts)
print('wrote', OUT, len(ts), 'bytes')
