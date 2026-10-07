"""Costume effect audit: every assets/fx/<atlas>@<costume>.png against its base sheet cell by cell, and every HQ painting
@costume against its base. SAME = left (nearly) unchanged, close = a light recolour - review those against the costume's
theme (a SAME ink cell is how Hollin's Beekeeper kept black ink). Run from the repo root: python3 tools/fx-prompts/audit_costume_fx.py"""
import re, os, glob
import numpy as np
from PIL import Image
src = open("src/render/fx/atlas.ts").read()
atl = {}
for m in re.finditer(r'atlas\(\s*"(\w+)",\s*\w+,\s*\[(.*?)\]', src, re.S):
    atl[m.group(1)] = re.findall(r'"(\w+)"', m.group(2))
def cells(path):
    im = np.asarray(Image.open(path).convert("RGBA")).astype(float)
    W = im.shape[1] // 4
    return [im[(i // 4) * W:(i // 4 + 1) * W, (i % 4) * W:(i % 4 + 1) * W] for i in range(16)]
def diff(a, b):
    if a.shape != b.shape:
        b = np.asarray(Image.fromarray(b.astype(np.uint8), "RGBA").resize(a.shape[:2][::-1])).astype(float)
    wa, wb = a[..., 3] / 255, b[..., 3] / 255
    if wa.sum() < 50 and wb.sum() < 50: return None
    shape = np.abs(wa - wb).mean() / max(wa.mean(), 1e-3)
    w = np.maximum(wa, wb)
    col = (np.abs(a[..., :3] - b[..., :3]).mean(-1) * w).sum() / max(w.sum(), 1)
    return shape, col
rows = []
for f in sorted(glob.glob("assets/fx/*@*.png")):
    name, cos = os.path.basename(f)[:-4].split("@")
    base = f"assets/fx/{name}.png"
    if name not in atl or not os.path.exists(base): rows.append(f"?? {f} (no atlas / base)"); continue
    A, B = cells(base), cells(f)
    for i, key in enumerate(atl[name][:16]):
        d = diff(A[i], B[i])
        if d is None: continue
        shape, col = d
        if col < 12 and shape < 0.15: rows.append(f"SAME   {name:10} @{cos:13} {key:12} colour diff {col:5.1f} shape diff {shape:.2f}")
        elif col < 30 and shape < 0.15: rows.append(f"close  {name:10} @{cos:13} {key:12} colour diff {col:5.1f} shape diff {shape:.2f}")
for f in sorted(glob.glob("assets/fx/hq/*@*.png")):
    bid, cos = os.path.basename(f)[:-4].split("@")
    base = f"assets/fx/hq/{bid}.png"
    if not os.path.exists(base): continue
    d = diff(np.asarray(Image.open(base).convert("RGBA")).astype(float), np.asarray(Image.open(f).convert("RGBA")).astype(float))
    if d and d[1] < 30 and d[0] < 0.15: rows.append(f"{'SAME' if d[1] < 12 else 'close'}   HQ {bid:22} @{cos:13} colour diff {d[1]:5.1f} shape diff {d[0]:.2f}")
print("\n".join(rows) if rows else "nothing flagged")
print("atlases parsed:", {k: len(v) for k, v in atl.items()})
