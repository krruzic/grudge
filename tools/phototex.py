import json
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "textures", "photo_src")
OUT = os.path.join(ROOT, "assets", "textures")

SPECS = {
    "grass": {"src": "grass_ground", "size": 64, "sat": 1.6, "contrast": 1.15, "mean": (0.44, 0.68, 0.22), "blur": 1.0},
    "dirt": {"src": "brown_mud_dry", "size": 64, "sat": 1.2, "contrast": 0.75, "mean": (0.56, 0.42, 0.28), "blur": 0.8},
    "cobble": {"src": "cobblestone_floor_04", "size": 64, "sat": 0.9, "contrast": 0.95, "mean": (0.58, 0.55, 0.5), "blur": 0.6},
    "cliff": {"src": "rock_face_03", "size": 64, "sat": 1.1, "contrast": 0.9, "mean": (0.55, 0.48, 0.4), "blur": 0.6},
    "brick": {"src": "stone_wall", "size": 64, "sat": 0.9, "contrast": 1.0, "mean": (0.62, 0.58, 0.5), "blur": 0.5},
    "wood": {"src": "weathered_brown_planks", "size": 64, "sat": 1.2, "contrast": 0.9, "mean": (0.52, 0.36, 0.22), "blur": 0.5},
    "bark": {"src": "bark_brown_02", "size": 64, "sat": 1.1, "contrast": 0.9, "mean": (0.42, 0.32, 0.24), "blur": 0.6},
    "roof": {"src": "clay_roof_tiles_02", "size": 64, "sat": 1.1, "contrast": 0.9, "mean": (0.72, 0.36, 0.24), "blur": 0.5},
    "leather": {"src": "brown_leather", "size": 64, "sat": 1.1, "contrast": 2.2, "mean": (0.5, 0.33, 0.2), "blur": 0.5, "crop": 0.35},
    "cloth": {"src": "rough_linen", "size": 64, "sat": 0.0, "contrast": 2.0, "mean": (0.84, 0.84, 0.84), "blur": 0.6, "crop": 0.4},
    "plain": {"src": "rough_linen", "size": 64, "sat": 0.0, "contrast": 2.5, "mean": (0.9, 0.9, 0.9), "blur": 0.4, "crop": 0.2},
    "iron": {"src": "metal_plate_02", "size": 64, "sat": 0.15, "contrast": 0.9, "mean": (0.44, 0.45, 0.48), "blur": 0.5, "crop": 0.5},
    "steel": {"src": "metal_plate_02", "size": 64, "sat": 0.1, "contrast": 0.8, "mean": (0.74, 0.76, 0.8), "blur": 0.5, "crop": 0.5},
    "flesh": {"src": "leather_white", "size": 64, "sat": 1.0, "contrast": 4.0, "mean": (0.86, 0.62, 0.48), "blur": 0.6, "crop": 0.3, "tint": True},
    "ogre": {"src": "leather_white", "size": 64, "sat": 1.0, "contrast": 5.0, "mean": (0.5, 0.62, 0.38), "blur": 0.5, "crop": 0.4, "tint": True},
    "grey_ogre": {"src": "leather_white", "size": 64, "sat": 1.0, "contrast": 5.0, "mean": (0.46, 0.53, 0.47), "blur": 0.5, "crop": 0.4, "tint": True},
    "goblin": {"src": "leather_white", "size": 64, "sat": 1.0, "contrast": 4.5, "mean": (0.4, 0.62, 0.24), "blur": 0.5, "crop": 0.35, "tint": True},
    "hair": {"src": "thatch_roof_angled", "size": 64, "sat": 0.0, "contrast": 1.3, "mean": (0.78, 0.78, 0.78), "blur": 0.4, "crop": 0.5},
    "stone": {"src": "rock_boulder_dry", "size": 64, "sat": 0.2, "contrast": 1.0, "mean": (0.55, 0.55, 0.57), "blur": 0.5, "crop": 0.6},
    "moss_bark": {"src": "bark_brown_02", "size": 64, "sat": 1.2, "contrast": 1.1, "mean": (0.4, 0.33, 0.22), "blur": 0.5, "crop": 0.6},
    "ui_parchment": {"src": "white_rough_plaster", "size": 64, "sat": 0.0, "contrast": 0.35, "mean": (0.86, 0.76, 0.56), "blur": 0.8, "crop": 0.6, "tint": True},
    "ui_stone": {"src": "rock_face_03", "size": 64, "sat": 0.08, "contrast": 2.4, "mean": (0.2, 0.2, 0.21), "blur": 0.5, "crop": 0.45},
    "ui_ridge": {"src": "metal_plate_02", "size": 64, "sat": 0.0, "contrast": 0.8, "mean": (0.62, 0.62, 0.62), "blur": 0.4, "crop": 0.5, "ridges": 8},
    "banner": {"src": "quatrefoil_jacquard_fabric", "size": 64, "sat": 0.0, "contrast": 0.75, "mean": (0.8, 0.8, 0.8), "blur": 0.3, "crop": 0.25, "map": "Displacement", "tint": True},
    "wallblock": {"src": "medieval_blocks_03", "size": 64, "sat": 0.6, "contrast": 1.1, "mean": (0.6, 0.57, 0.52), "blur": 0.5, "crop": 0.5},
    "sand": {"src": "coast_sand_01", "size": 64, "sat": 0.9, "contrast": 0.8, "mean": (0.78, 0.7, 0.52), "blur": 0.8},
    "thatch": {"src": "thatch_roof_angled", "size": 64, "sat": 0.9, "contrast": 1.1, "mean": (0.62, 0.52, 0.32), "blur": 0.5, "crop": 0.5},
    "bone": {"src": "white_rough_plaster", "size": 64, "sat": 0.4, "contrast": 0.35, "mean": (0.86, 0.8, 0.66), "blur": 0.6, "crop": 0.5},
}


def fetch(asset: str, kind: str = "Diffuse") -> str:
    os.makedirs(SRC, exist_ok=True)
    path = os.path.join(SRC, asset + ("" if kind == "Diffuse" else "_" + kind.lower()) + ".jpg")
    if os.path.exists(path):
        return path
    ua = {"User-Agent": "grudge-phototex/1.0"}
    with urllib.request.urlopen(urllib.request.Request(f"https://api.polyhaven.com/files/{asset}", headers=ua)) as r:
        files = json.load(r)
        entry = files[kind]["1k"]
        url = (entry.get("jpg") or entry.get("png"))["url"]
    with urllib.request.urlopen(urllib.request.Request(url, headers=ua)) as r, open(path, "wb") as f:
        f.write(r.read())
    return path


def wrap_blur(a: np.ndarray, sigma: float) -> np.ndarray:
    if sigma <= 0:
        return a
    r = max(1, int(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = a.copy()
    for axis in (0, 1):
        acc = np.zeros_like(out)
        for i, w in zip(range(-r, r + 1), k):
            acc += np.roll(out, i, axis=axis) * w
        out = acc
    return out


def seamless(a: np.ndarray) -> np.ndarray:
    n = a.shape[0]
    t = np.abs(np.linspace(-1, 1, n))
    w = np.clip((1 - t) * 3, 0, 1)
    rx = np.roll(a, n // 2, 1)
    a = a * w[None, :, None] + rx * (1 - w[None, :, None])
    ry = np.roll(a, n // 2, 0)
    return a * w[:, None, None] + ry * (1 - w[:, None, None])


def downsample(a: np.ndarray, size: int) -> np.ndarray:
    h = a.shape[0]
    f = h // size
    a = a[: f * size, : f * size]
    return a.reshape(size, f, size, f, 3).mean((1, 3))


def grade(a: np.ndarray, spec: dict) -> np.ndarray:
    lum = a @ np.array([0.299, 0.587, 0.114])
    a = lum[..., None] + (a - lum[..., None]) * spec["sat"]
    if spec.get("tint"):
        l = a @ np.array([0.299, 0.587, 0.114])
        a = np.repeat(l[..., None], 3, -1)
    m = a.reshape(-1, 3).mean(0)
    a = m + (a - m) * spec["contrast"]
    a = a * (np.array(spec["mean"]) / np.maximum(a.reshape(-1, 3).mean(0), 1e-3))
    return np.clip(a, 0, 1)


def ci4(a: np.ndarray, k: int = 16, iters: int = 16) -> np.ndarray:
    px = a.reshape(-1, 3)
    lum = px @ np.array([0.3, 0.59, 0.11])
    centers = px[np.argsort(lum)[np.linspace(0, len(px) - 1, k).astype(int)]].copy()
    for _ in range(iters):
        lab = ((px[:, None] - centers[None]) ** 2).sum(-1).argmin(1)
        for i in range(k):
            m = lab == i
            if m.any():
                centers[i] = px[m].mean(0)
    centers = np.round(np.clip(centers, 0, 1) * 31) / 31
    lab = ((px[:, None] - centers[None]) ** 2).sum(-1).argmin(1)
    return centers[lab].reshape(a.shape)


def process(name: str, spec: dict) -> str:
    img = Image.open(fetch(spec["src"], spec.get("map", "Diffuse"))).convert("RGB")
    c = spec.get("crop", 1.0)
    if c < 1.0:
        w = int(img.width * c)
        img = img.crop((0, 0, w, w))
    img = img.resize((256, 256), Image.LANCZOS)
    a = np.asarray(img, dtype=np.float32) / 255.0
    if c < 1.0:
        a = seamless(a)
    a = wrap_blur(a, spec["blur"] * 256 / spec["size"] * 0.5)
    a = downsample(a, spec["size"])
    a = grade(a, spec)
    if spec.get("ridges"):
        n = spec["ridges"]
        y = (np.arange(spec["size"]) + 0.5) / spec["size"] * n
        f = y - np.floor(y)
        prof = np.where(f < 0.5, 0.78 + 0.5 * np.sin(f * 2 * np.pi) * 0.45, 0.78 - 0.5 * np.sin((f - 0.5) * 2 * np.pi) * 0.7)
        prof = np.where((f > 0.93) | (f < 0.04), 0.35, prof)
        a = np.clip(a * prof[:, None, None] * 1.1, 0, 1)
    a = ci4(a)
    out = np.concatenate([a, np.ones(a.shape[:2] + (1,), np.float32)], -1)
    path = os.path.join(OUT, name + ".png")
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(path)
    return path


def main() -> None:
    names = sys.argv[1:] or list(SPECS)
    done = {}
    for n in names:
        done[n] = process(n, SPECS[n])
        print(n, "->", os.path.relpath(done[n], ROOT))
    manifest = os.path.join(OUT, "photo.json")
    prev = json.load(open(manifest)) if os.path.exists(manifest) else {}
    prev.update({n: SPECS[n]["src"] for n in done})
    json.dump(prev, open(manifest, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
