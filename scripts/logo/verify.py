"""Rasterise the SVG path data (parsed from the .svg file itself) and compare with the PNG alpha.
Usage: verify.py logo.svg logo.png out_diff.png"""
import re
import sys

import cv2
import numpy as np
from PIL import Image

SS = 8


def parse(d):
    """SVG path data parser for M/L/H/V/C/Z, absolute and relative."""
    toks = re.findall(r'[MLHVCZmlhvcz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?', d)
    subs, cur, i, cmd = [], [], 0, None
    pos = np.zeros(2)
    start = np.zeros(2)
    tt = np.linspace(0, 1, 24)[1:, None]
    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in 'Zz':
                if cur:
                    subs.append(np.array(cur))
                cur = []
                pos = start.copy()
            continue
        rel = cmd.islower()
        base = pos if rel else np.zeros(2)
        C = cmd.upper()
        if C == 'M':
            if cur:
                subs.append(np.array(cur))
            pos = base + [float(toks[i]), float(toks[i + 1])]
            start = pos.copy()
            cur = [pos]
            i += 2
            cmd = 'l' if rel else 'L'
        elif C == 'L':
            pos = base + [float(toks[i]), float(toks[i + 1])]
            cur.append(pos)
            i += 2
        elif C == 'H':
            pos = np.array([(pos[0] if rel else 0) + float(toks[i]), pos[1]])
            cur.append(pos)
            i += 1
        elif C == 'V':
            pos = np.array([pos[0], (pos[1] if rel else 0) + float(toks[i])])
            cur.append(pos)
            i += 1
        elif C == 'C':
            c = base + np.array([float(x) for x in toks[i:i + 6]]).reshape(3, 2)
            p0 = pos
            mt = 1 - tt
            cur.extend(mt**3 * p0 + 3 * mt**2 * tt * c[0] + 3 * mt * tt**2 * c[1] + tt**3 * c[2])
            pos = c[2]
            i += 6
    if cur:
        subs.append(np.array(cur))
    return subs


def render(svg_text, W, H):
    acc = np.zeros((H * SS, W * SS), np.uint8)
    for d in re.findall(r' d="([^"]+)"', svg_text):
        m = np.zeros_like(acc)
        for sp in parse(d):
            r = np.zeros_like(acc)
            pts = np.round(sp * SS * 16).astype(np.int32)  # 4 fractional bits
            cv2.fillPoly(r, [pts], 1, lineType=cv2.LINE_8, shift=4)
            m ^= r  # even-odd
        acc |= m
    cov = acc.reshape(H, SS, W, SS).mean(axis=(1, 3))
    return cov


if __name__ == '__main__':
    svg = open(sys.argv[1]).read()
    a = np.array(Image.open(sys.argv[2]).convert('RGBA'))[..., 3] / 255.0
    a = a / a.max()  # the artwork is drawn at 95.7 % opacity; compare shapes
    H, W = a.shape
    cov = render(svg, W, H)
    A, B = a >= 0.5, cov >= 0.5
    iou = (A & B).sum() / (A | B).sum()
    soft = np.minimum(a, cov).sum() / np.maximum(a, cov).sum()
    diff = np.abs(a - cov)
    print(f'binary IoU {iou:.4f}  soft IoU {soft:.4f}  mean|diff| {diff.mean():.4f}  max|diff| {diff.max():.3f}  px>0.5 differ {(A ^ B).sum()}')
    if len(sys.argv) > 3:
        vis = np.zeros((H, W, 3), np.uint8)
        vis[..., 0] = (a * 255).astype(np.uint8)
        vis[..., 1] = (cov * 255).astype(np.uint8)
        vis[..., 2] = (np.clip(diff * 4, 0, 1) * 255).astype(np.uint8)
        Image.fromarray(vis).resize((W * 2, H * 2), Image.NEAREST).save(sys.argv[3])
