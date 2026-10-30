"""Vectorise the Al Mukarramah logo (assets/logo-ink.png alpha) into clean cubic-Bezier SVG paths.

Method: 8x bicubic upsample of the alpha, threshold at 50 %, contours (outer + holes), corner detection,
light smoothing between corners, Schneider least-squares cubic fitting with a 0.12 px tolerance.
The arch outline and its opening are split at the keystone (top centre) and at the lower centre so the
line can be drawn symmetrically from the apex down both sides.
Outputs logo.json (parts with path data and stroke lengths) and logo.svg.
"""
import json
import sys

import cv2
import numpy as np
from PIL import Image

SRC = sys.argv[1]
OUT = sys.argv[2]
S = 8  # upsample factor
TOL = float(sys.argv[3]) if len(sys.argv) > 3 else 0.12  # max fit error in original pixels
LINE_TOL = 0.16
DEC = int(sys.argv[4]) if len(sys.argv) > 4 else 2

alpha = np.array(Image.open(SRC).convert('RGBA'))[..., 3].astype(np.float32) / 255.0
H, W = alpha.shape
big = cv2.resize(alpha, (W * S, H * S), interpolation=cv2.INTER_CUBIC)
mask = (big >= 0.5).astype(np.uint8)

# label components on the original-resolution threshold, to assign each contour to a part
small = (alpha >= 0.5).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(small, 8)


def part_of(x, y, w, h):
    if x >= 700:
        return 'arch'
    if y >= 172:
        return 'latin'
    return 'arabic'


contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
hier = hier[0]


def to_pts(c):
    p = c[:, 0, :].astype(np.float64)
    # pixel-index -> SVG coordinates; contour pixels are the inside boundary, push half a fine pixel outward later
    return (p + 0.5) / S


# ---------- Schneider cubic fitting ----------
def bez(ctrl, t):
    t = np.asarray(t)[:, None]
    mt = 1 - t
    return mt**3 * ctrl[0] + 3 * mt**2 * t * ctrl[1] + 3 * mt * t**2 * ctrl[2] + t**3 * ctrl[3]


def bez_d1(ctrl, t):
    t = np.asarray(t)[:, None]
    mt = 1 - t
    return 3 * mt**2 * (ctrl[1] - ctrl[0]) + 6 * mt * t * (ctrl[2] - ctrl[1]) + 3 * t**2 * (ctrl[3] - ctrl[2])


def bez_d2(ctrl, t):
    t = np.asarray(t)[:, None]
    return 6 * (1 - t) * (ctrl[2] - 2 * ctrl[1] + ctrl[0]) + 6 * t * (ctrl[3] - 2 * ctrl[2] + ctrl[1])


def chord_param(p):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    return d / d[-1] if d[-1] > 0 else np.linspace(0, 1, len(p))


def gen_bezier(p, u, t1, t2):
    p0, p3 = p[0], p[-1]
    A1 = (3 * (1 - u) ** 2 * u)[:, None] * t1
    A2 = (3 * (1 - u) * u**2)[:, None] * t2
    C = np.array([[np.sum(A1 * A1), np.sum(A1 * A2)], [np.sum(A1 * A2), np.sum(A2 * A2)]])
    tmp = p - bez(np.array([p0, p0, p3, p3]), u)
    X = np.array([np.sum(A1 * tmp), np.sum(A2 * tmp)])
    det = C[0, 0] * C[1, 1] - C[0, 1] * C[1, 0]
    seg = np.linalg.norm(p3 - p0)
    if abs(det) > 1e-12:
        a1 = (X[0] * C[1, 1] - X[1] * C[0, 1]) / det
        a2 = (C[0, 0] * X[1] - C[1, 0] * X[0]) / det
    else:
        a1 = a2 = seg / 3
    eps = 1e-6 * seg
    if a1 < eps or a2 < eps:
        a1 = a2 = seg / 3
    return np.array([p0, p0 + t1 * a1, p3 + t2 * a2, p3])


def reparam(ctrl, p, u):
    q = bez(ctrl, u) - p
    d1 = bez_d1(ctrl, u)
    d2 = bez_d2(ctrl, u)
    num = np.sum(q * d1, axis=1)
    den = np.sum(d1 * d1, axis=1) + np.sum(q * d2, axis=1)
    nu = u - np.where(np.abs(den) > 1e-12, num / np.where(np.abs(den) > 1e-12, den, 1), 0)
    return np.clip(nu, 0, 1)


def max_err(ctrl, p, u):
    d = np.linalg.norm(bez(ctrl, u) - p, axis=1)
    i = int(np.argmax(d))
    return d[i], i


def unit(v):
    nv = np.linalg.norm(v)
    return v / nv if nv > 1e-12 else v


def tangent_at_start(p, k=10):
    k = min(k, len(p) - 1)
    # least-squares direction over the first k points
    return unit(np.mean(p[1:k + 1] - p[0], axis=0))


def tangent_at_end(p, k=10):
    k = min(k, len(p) - 1)
    return unit(np.mean(p[-k - 1:-1] - p[-1], axis=0))


def fit_cubic(p, t1, t2, err, depth=0):
    if len(p) == 2:
        d = np.linalg.norm(p[1] - p[0]) / 3
        return [np.array([p[0], p[0] + t1 * d, p[1] + t2 * d, p[1]])]
    u = chord_param(p)
    ctrl = gen_bezier(p, u, t1, t2)
    e, split = max_err(ctrl, p, u)
    if e < err:
        return [ctrl]
    if e < err * 6:
        for _ in range(25):
            u = reparam(ctrl, p, u)
            ctrl = gen_bezier(p, u, t1, t2)
            e, split = max_err(ctrl, p, u)
            if e < err:
                return [ctrl]
    split = min(max(split, 1), len(p) - 2)
    k = 4
    tc = unit(p[max(split - k, 0)] - p[min(split + k, len(p) - 1)])
    return fit_cubic(p[:split + 1], t1, tc, err, depth + 1) + fit_cubic(p[split:], -tc, t2, err, depth + 1)


def smooth_open(p, sigma):
    """Gaussian smoothing of an open polyline with fixed endpoints."""
    if len(p) < 5 or sigma <= 0:
        return p
    r = min(int(3 * sigma), (len(p) - 2) // 2)
    if r < 1:
        return p
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    # odd reflection about each fixed endpoint keeps straight runs straight
    head = 2 * p[0] - p[r:0:-1]
    tail = 2 * p[-1] - p[-2:-r - 2:-1]
    pad = np.vstack([head, p, tail])
    out = np.vstack([np.convolve(pad[:, 0], k, 'valid'), np.convolve(pad[:, 1], k, 'valid')]).T
    out[0], out[-1] = p[0], p[-1]
    # taper smoothing near the fixed ends
    return out


def is_line(p, tol):
    a, b = p[0], p[-1]
    v = b - a
    L = np.linalg.norm(v)
    if L < 1e-9:
        return False
    nrm = np.array([-v[1], v[0]]) / L
    return np.max(np.abs((p - a) @ nrm)) < tol


def corners(p, step_px=1.6, thresh_deg=32):
    """Indices of corners on a closed contour (p in original px)."""
    N = len(p)
    k = max(3, int(round(step_px * S)))
    prev = p[(np.arange(N) - k) % N]
    nxt = p[(np.arange(N) + k) % N]
    v1 = p - prev
    v2 = nxt - p
    ang = np.degrees(np.arccos(np.clip(np.sum(v1 * v2, 1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1) + 1e-12), -1, 1)))
    cand = []
    for i in range(N):
        if ang[i] < thresh_deg:
            continue
        win = ang[(np.arange(i - k, i + k + 1)) % N]
        if ang[i] >= win.max() - 1e-9:
            if not cand or (i - cand[-1]) > k:
                cand.append(i)
    if len(cand) >= 2 and (cand[0] + N - cand[-1]) <= k:
        cand.pop()
    return cand


def fit_closed(p, forced=()):
    """Fit a closed contour. Returns list of segments [('L'|'C', ctrl)] starting at a corner/forced point."""
    N = len(p)
    cs = sorted(set(corners(p)) | set(forced))
    smooth_breaks = set(forced) - set(corners(p))
    if len(cs) < 2:
        # no corners: break at the two most distant points (smooth joints)
        i0 = int(np.argmin(p[:, 0]))
        i1 = int(np.argmax(p[:, 0]))
        cs = sorted({i0, i1})
        smooth_breaks = set(cs)
    segs = []
    for j, a in enumerate(cs):
        b = cs[(j + 1) % len(cs)]
        idx = np.arange(a, b + 1) if b > a else np.r_[np.arange(a, N), np.arange(0, b + 1)]
        q = p[idx]
        segs.append((a, b, q))
    out = []
    for a, b, q in segs:
        span = []
        out.append(span)
        q = smooth_open(q, sigma=1.2 * S / 8 * 1.5)
        if is_line(q, LINE_TOL):
            span.append(('L', np.array([q[0], q[-1]])))
            continue
        if a in smooth_breaks:
            t1 = unit(p[(a + 6) % N] - p[(a - 6) % N])
        else:
            t1 = tangent_at_start(q)
        if b in smooth_breaks:
            t2 = unit(p[(b - 6) % N] - p[(b + 6) % N])
        else:
            t2 = tangent_at_end(q)
        # straight runs inside the span become true lines; curves between them join tangentially
        runs = straight_runs(q)
        pieces, k = [], 0
        for (i, j) in runs:
            if i > k:
                pieces.append(('curve', k, i))
            pieces.append(('line', i, j))
            k = j
        if k < len(q) - 1:
            pieces.append(('curve', k, len(q) - 1))
        for n_, (kind, i, j) in enumerate(pieces):
            if kind == 'line':
                span.append(('L', np.array([q[i], q[j]])))
                continue
            seg = q[i:j + 1]
            if len(seg) < 4 or np.linalg.norm(seg[-1] - seg[0]) < 0.25:
                span.append(('L', np.array([seg[0], seg[-1]])))
                continue
            prev = pieces[n_ - 1] if n_ > 0 else None
            nxt = pieces[n_ + 1] if n_ + 1 < len(pieces) else None
            a1 = unit(q[prev[2]] - q[prev[1]]) if prev else t1
            a2 = unit(q[nxt[1]] - q[nxt[2]]) if nxt else t2
            for c in fit_cubic(seg, a1, a2, TOL):
                span.append(('C', c))
    return out, cs


def rdp(p, eps):
    keep = [0, len(p) - 1]
    stack = [(0, len(p) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        a, b = p[i], p[j]
        v = b - a
        L = np.linalg.norm(v)
        seg = p[i + 1:j]
        if L < 1e-9:
            dist = np.linalg.norm(seg - a, axis=1)
        else:
            dist = np.abs((seg - a) @ np.array([-v[1], v[0]]) / L)
        k = int(np.argmax(dist))
        if dist[k] > eps:
            m = i + 1 + k
            keep.append(m)
            stack += [(i, m), (m, j)]
    return sorted(set(keep))


def straight_runs(q, min_len=10.0):
    v = rdp(q, 0.1)
    runs = []
    for i, j in zip(v[:-1], v[1:]):
        if np.linalg.norm(q[j] - q[i]) >= min_len and is_line(q[i:j + 1], 0.1):
            runs.append((i, j))
    return runs


def f(v):
    s = f'{v:.{DEC}f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def q(v):
    """Round to DEC decimals (as an exact decimal-friendly float)."""
    return round(float(v), DEC)


def nums(vals):
    out = ''
    for v in vals:
        s = f(v)
        if s.startswith('0.'):
            s = s[1:]
        elif s.startswith('-0.'):
            s = '-' + s[2:]
        if out and not s.startswith('-'):
            out += ' '
        out += s
    return out


def seg_d(segs, move=True):
    """Compact relative path data. The pen position is tracked in rounded coordinates, so rounding never accumulates."""
    x0, y0 = q(segs[0][1][0][0]), q(segs[0][1][0][1])
    d = [f'M{nums([x0, y0])}']
    cx, cy = x0, y0
    for kind, c in segs:
        if kind == 'L':
            ex, ey = q(c[1][0] - cx), q(c[1][1] - cy)
            if ex == 0:
                d.append(f'v{nums([ey])}')
            elif ey == 0:
                d.append(f'h{nums([ex])}')
            else:
                d.append(f'l{nums([ex, ey])}')
        else:
            ex, ey = q(c[3][0] - cx), q(c[3][1] - cy)
            d.append('c' + nums([q(c[1][0] - cx), q(c[1][1] - cy), q(c[2][0] - cx), q(c[2][1] - cy), ex, ey]))
        cx, cy = q(cx + ex), q(cy + ey)
    return ''.join(d)


def seg_len(segs):
    L = 0
    t = np.linspace(0, 1, 64)
    for kind, c in segs:
        if kind == 'L':
            L += np.linalg.norm(c[1] - c[0])
        else:
            q = bez(c, t)
            L += np.sum(np.linalg.norm(np.diff(q, axis=0), axis=1))
    return L


# ---------- build parts ----------
parts = {'arch': [], 'arabic': [], 'latin': []}
outers = [i for i in range(len(contours)) if hier[i][3] < 0]
arch_strokes = []
for i in outers:
    x, y, w, h = cv2.boundingRect(contours[i])
    x, y, w, h = x / S, y / S, w / S, h / S
    if w * h < 4:
        continue
    part = part_of(x, y, w, h)
    rings = [i]
    ch = hier[i][2]
    while ch >= 0:
        rings.append(ch)
        ch = hier[ch][0]
    d = ''
    for r in rings:
        p = to_pts(contours[r])
        if len(p) < 8:
            continue
        forced = ()
        if part == 'arch':
            cx = 800.0
            top = int(np.argmin(p[:, 1] + np.abs(p[:, 0] - cx) * 0.5))
            near = np.where(np.abs(p[:, 0] - p[top, 0]) < 1.5)[0]
            far = [k for k in near if p[k, 1] > p[top, 1] + 20]
            bot = int(max(far, key=lambda k: p[k, 1])) if far else None
            forced = (top, bot) if bot is not None else (top,)
        spans, cs = fit_closed(p, forced)
        segs = [sg for sp in spans for sg in sp]
        if part == 'arch':
            segs = spans
            # rotate so the path starts at the apex
            starts = [s for s in range(len(segs)) if cs[s] == forced[0]]
            k0 = starts[0]
            segs = segs[k0:] + segs[:k0]
            cs_rot = cs[k0:] + cs[:k0]
            kb = cs_rot.index(forced[1])
            first = [sg for sp in segs[:kb] for sg in sp]
            second = [sg for sp in segs[kb:] for sg in sp]
            segs = first + second
            # first half: apex -> bottom (one side); second half reversed: apex -> bottom (other side)
            rev = [(kind, c[::-1].copy()) for kind, c in reversed(second)]
            for half in (first, rev):
                arch_strokes.append({'d': seg_d(half), 'len': round(seg_len(half), 1), 'ring': 'outer' if r == i else 'inner'})
        d += seg_d(segs) + 'Z'
    parts[part].append({'d': d, 'bbox': [round(x, 1), round(y, 1), round(w, 1), round(h, 1)]})

parts['arabic'].sort(key=lambda o: -(o['bbox'][0] + o['bbox'][2]))  # right to left (reading order)
parts['latin'].sort(key=lambda o: o['bbox'][0])
parts['archStroke'] = arch_strokes
json.dump(parts, open(OUT + '/logo.json', 'w'), indent=1)

svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">', '<g fill="#1C1A17" fill-rule="evenodd">']
merged = {k: ''.join(o['d'] for o in parts[k]) for k in ('arabic', 'latin', 'arch')}
for k in ('arabic', 'latin', 'arch'):
    svg.append(f'<path id="{k}" d="{merged[k]}"/>')
json.dump({'w': W, 'h': H, **merged, 'archStroke': arch_strokes}, open(OUT + '/logo-merged.json', 'w'), indent=1)
svg.append('</g></svg>')
open(OUT + '/logo.svg', 'w').write('\n'.join(svg))
total = sum(len(o['d']) for k in ('arabic', 'latin', 'arch') for o in parts[k])
print('paths', {k: len(v) for k, v in parts.items()}, 'chars', total)
print('arch strokes', [(s['ring'], s['len']) for s in arch_strokes])
