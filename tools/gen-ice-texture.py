"""Seamless lake-ice texture for Emberglass Mere (assets/textures/ice.png, 512x512), painted in the terrain's soft
style: a muted teal-blue sheet, darker clear patches where you see into the lake, wind-blown snow dust, fine frost
veins and trapped bubbles. Everything is drawn wrapped, so the tile repeats without seams.

    python3 tools/gen-ice-texture.py
"""
import math
import random

from PIL import Image, ImageDraw, ImageFilter

S = 512
r = random.Random(7)
img = Image.new("RGB", (S, S), (118, 160, 186))
d = ImageDraw.Draw(img, "RGBA")


def wrapped(fn):
    for ox in (-S, 0, S):
        for oy in (-S, 0, S):
            fn(ox, oy)


# Clear, deep patches and pale milky ones.
for _ in range(60):
    x, y, rx, ry = r.uniform(0, S), r.uniform(0, S), r.uniform(30, 110), r.uniform(18, 60)
    col = (52, 98, 132, r.randint(30, 60)) if r.random() < 0.5 else (196, 222, 236, r.randint(25, 50))
    wrapped(lambda ox, oy: d.ellipse([x + ox - rx, y + oy - ry, x + ox + rx, y + oy + ry], fill=col))
img = img.filter(ImageFilter.GaussianBlur(14))
d = ImageDraw.Draw(img, "RGBA")
# Snow dust drifts.
for _ in range(45):
    x, y = r.uniform(0, S), r.uniform(0, S)
    a = r.uniform(0, math.pi)
    L = r.uniform(30, 120)
    for k in range(18):
        t = k / 18
        px, py = x + math.cos(a) * L * t, y + math.sin(a) * L * t
        rad = r.uniform(3, 10) * (1 - abs(t - 0.5))
        wrapped(lambda ox, oy: d.ellipse([px + ox - rad, py + oy - rad, px + ox + rad, py + oy + rad], fill=(236, 244, 248, 40)))
img = img.filter(ImageFilter.GaussianBlur(3))
d = ImageDraw.Draw(img, "RGBA")
# Frost veins.
for _ in range(55):
    x, y = r.uniform(0, S), r.uniform(0, S)
    a = r.uniform(0, 2 * math.pi)
    pts = [(x, y)]
    for _ in range(6):
        a += r.uniform(-0.6, 0.6)
        x += math.cos(a) * r.uniform(8, 22)
        y += math.sin(a) * r.uniform(8, 22)
        pts.append((x, y))
    col = (230, 244, 252, r.randint(70, 140))
    w = r.choice((1, 1, 2))
    wrapped(lambda ox, oy: d.line([(px + ox, py + oy) for px, py in pts], fill=col, width=w))
# Bubbles.
for _ in range(160):
    x, y, rad = r.uniform(0, S), r.uniform(0, S), r.uniform(0.8, 2.6)
    wrapped(lambda ox, oy: d.ellipse([x + ox - rad, y + oy - rad, x + ox + rad, y + oy + rad], fill=(240, 250, 255, r.randint(80, 170))))
img.save("assets/textures/ice.png")
print("wrote assets/textures/ice.png")
