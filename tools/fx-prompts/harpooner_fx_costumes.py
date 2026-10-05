"""Brindle's costume FX: recolour the water cells of assets/fx/harpooner.png (and its HQ paintings) per costume into
assets/fx/harpooner@<costume>.png / hq/harpooner.<key>@<costume>.png. Rope, shell, kelp and tongue keep their colours.
  tideadmiral  gilded sea: water turns warm gold, foam stays white
  bogtoad      murky swamp water: olive-brown, duller
  deepglow     bioluminescent abyss: violet water with bright cyan highlights
python3 tools/fx-prompts/harpooner_fx_costumes.py"""
import glob
import os

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KEEP = {9, 10, 11, 12, 14}
LOOKS = {
    "tideadmiral": {"hue": 44, "sat": 1.05, "val": 1.05},
    "bogtoad": {"hue": 72, "sat": 0.75, "val": 0.78},
    "deepglow": {"hue": 275, "sat": 1.15, "val": 0.95, "glow": 185},
}


def recolour(px, look):
    rgb = px[..., :3].astype(np.float32) / 255
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = np.maximum(mx - mn, 1e-5)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hue = (np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60) % 360
    sat = np.where(mx > 1e-4, d / np.maximum(mx, 1e-4), 0)
    val = mx
    water = (hue > 150) & (hue < 220) & (sat > 0.08)
    # Bright highlights keep (or, for deepglow, get) the second colour; the body takes the costume hue.
    tgt = np.full_like(hue, look["hue"])
    if "glow" in look:
        tgt = np.where(val > 0.82, look["glow"], tgt)
    hue = np.where(water, tgt, hue)
    sat = np.where(water, np.clip(sat * look["sat"], 0, 1), sat)
    val = np.where(water, np.clip(val * look["val"], 0, 1), val)
    h6 = hue / 60
    i = np.floor(h6).astype(int) % 6
    f = h6 - np.floor(h6)
    p, q, t = val * (1 - sat), val * (1 - sat * f), val * (1 - sat * (1 - f))
    out = np.zeros_like(rgb)
    for k, (a, bb, c) in enumerate(((val, t, p), (q, val, p), (p, val, t), (p, q, val), (t, p, val), (val, p, q))):
        m = i == k
        for ch, src in enumerate((a, bb, c)):
            out[..., ch] = np.where(m, src, out[..., ch])
    res = px.copy()
    res[..., :3] = np.clip(out * 255, 0, 255).astype(np.uint8)
    return res


base = np.asarray(Image.open(os.path.join(ROOT, "assets", "fx", "harpooner.png")).convert("RGBA"))
C = base.shape[0] // 4
for cos, look in LOOKS.items():
    out = base.copy()
    for k in range(16):
        if k in KEEP:
            continue
        y, x = (k // 4) * C, (k % 4) * C
        out[y:y + C, x:x + C] = recolour(base[y:y + C, x:x + C], look)
    Image.fromarray(out, "RGBA").save(os.path.join(ROOT, "assets", "fx", f"harpooner@{cos}.png"), optimize=True)
    for f in glob.glob(os.path.join(ROOT, "assets", "fx", "hq", "harpooner.*.png")):
        if "@" in os.path.basename(f):
            continue
        hq = np.asarray(Image.open(f).convert("RGBA"))
        Image.fromarray(recolour(hq, look), "RGBA").save(f.replace(".png", f"@{cos}.png"), optimize=True)
