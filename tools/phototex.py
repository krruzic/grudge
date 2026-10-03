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
    "snow": {"src": "snow_02", "size": 64, "sat": 0.6, "contrast": 0.55, "mean": (0.86, 0.9, 0.96), "blur": 0.8},
    "gravel": {"src": "gravel_floor", "size": 64, "sat": 0.7, "contrast": 1.0, "mean": (0.72, 0.66, 0.56), "blur": 0.7},
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


PAINT_SRC = os.path.join(ROOT, "assets", "source", "map_textures_ai.png")
PAINTED = {
    "grass": {"cell": (0, 0)},
    "dirt": {"cell": (0, 1), "flat": False, "contrast": 0.7},
    "gravel": {"cell": (0, 2), "contrast": 0.55, "repeat": 2},
    "cobble": {"cell": (0, 3), "search": True},
    "sand": {"cell": (1, 0), "size": 64},
    "snow": {"cell": (1, 1), "size": 64},
    "cliff": {"cell": (1, 2)},
    "brick": {"cell": (1, 3)},
    "wallblock": {"cell": (2, 0), "flat": False},
    "ruinstone": {"cell": (2, 1)},
    "planks": {"cell": (2, 3), "search": True, "fade": True},
    "ruin_a": {"cell": (0, 0), "src": 2, "wrap": 0.3},
    "ruin_b": {"cell": (0, 1), "src": 2, "wrap": 0.3},
    "ruin_c": {"cell": (0, 2), "src": 2, "wrap": 0.3},
    "ruintop": {"cell": (0, 3), "src": 2, "wrap": 0.3},
    "hedge": {"cell": (1, 0), "src": 2, "wrap": 0.3, "match": ((0.33, 0.46, 0.22), 0.11)},
    "hedge_b": {"cell": (1, 1), "src": 2, "wrap": 0.3, "match": ((0.33, 0.46, 0.22), 0.11)},
    "hedge_c": {"cell": (1, 2), "src": 2, "wrap": 0.3, "match": ((0.33, 0.46, 0.22), 0.11)},
    "ivy": {"cell": (1, 3), "src": 2, "wrap": 0.3},
    "rubble": {"cell": (2, 0), "src": 2, "wrap": 0.3},
    "ruin_d": {"cell": (2, 1), "src": 2, "wrap": 0.3},
    "flowerbed": {"cell": (2, 2), "src": 2, "wrap": 0.3},
}
PAINT_SRC2 = os.path.join(ROOT, "assets", "source", "map_textures2_ai.png")


def grid_cells(a: np.ndarray) -> list:
    lum = a.mean(2)
    spans = []
    for prof in (lum.mean(1), lum.mean(0)):
        dark = prof < 40
        cuts, i = [0], 0
        while i < len(dark):
            if dark[i]:
                j = i
                while j < len(dark) and dark[j]:
                    j += 1
                cuts += [i, j]
                i = j
            else:
                i += 1
        cuts.append(len(dark))
        spans.append([(cuts[k], cuts[k + 1]) for k in range(0, len(cuts), 2)])
    return spans


def cut_paths(cost: np.ndarray) -> tuple:
    h, w = cost.shape
    back = np.zeros((h, w, w), np.int32)
    cur = np.full((w, w), np.inf)
    cur[np.arange(w), np.arange(w)] = cost[0, np.arange(w)]
    for y in range(1, h):
        l = np.concatenate([np.full((w, 1), np.inf), cur[:, :-1]], 1)
        r = np.concatenate([cur[:, 1:], np.full((w, 1), np.inf)], 1)
        st = np.stack([l, cur, r], -1)
        back[y] = st.argmin(-1) - 1
        cur = st.min(-1) + cost[y][None]
    end = cur[np.arange(w), np.arange(w)]
    s = int(end.argmin())
    path = np.zeros(h, np.int32)
    x = s
    for y in range(h - 1, -1, -1):
        path[y] = x
        if y > 0:
            x = x + back[y][s, x]
    return path, float(end[s])


def heal_x(a: np.ndarray, search: bool = True) -> np.ndarray:
    n = a.shape[1]
    lo, hi = n // 8, 3 * n // 8
    best = None
    h2 = a[::2, ::2]
    m = n // 2
    for ox in (range(n // 4, 3 * n // 4 + 1, 4) if search else [n // 2]):
        diff = ((h2 - np.roll(h2, ox // 2, 1)) ** 2).sum(-1)
        total = cut_paths(diff[:, lo // 2:hi // 2])[1] + cut_paths(diff[:, m - hi // 2:m - lo // 2])[1]
        if best is None or total < best[0]:
            best = (total, ox)
    b = np.roll(a, best[1], 1)
    diff = ((a - b) ** 2).sum(-1)
    pl = cut_paths(diff[:, lo:hi])[0] + lo
    pr = cut_paths(diff[:, n - hi:n - lo])[0] + n - hi
    xs = np.arange(n)[None, :]
    mask = ((xs < pl[:, None]) | (xs >= pr[:, None])).astype(np.float32)
    soft = mask
    for _ in range(2):
        soft = (np.roll(soft, 1, 1) + soft + np.roll(soft, -1, 1)) / 3
    return a * (1 - soft[..., None]) + b * soft[..., None]


def flatten(a: np.ndarray, k: int) -> np.ndarray:
    pad = np.pad(a, ((k, k), (k, k), (0, 0)), mode="reflect")
    c = pad.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0), (0, 0)))
    n0, n1 = a.shape[:2]
    w = 2 * k + 1
    box = (c[w:w + n0, w:w + n1] - c[:n0, w:w + n1] - c[w:w + n0, :n1] + c[:n0, :n1]) / (w * w)
    return a - box + a.reshape(-1, 3).mean(0)


def fade_y(a: np.ndarray) -> np.ndarray:
    n = a.shape[0]
    w = np.clip((1 - np.abs(np.linspace(-1, 1, n))) * 2, 0, 1)[:, None, None]
    return a * w + np.roll(a, n // 2, 0) * (1 - w)


def make_seamless(a: np.ndarray, search: bool = True, flat: bool = True, fade: bool = False) -> np.ndarray:
    if flat:
        a = flatten(a, a.shape[0] // 4)
    a = heal_x(a, search)
    if fade:
        return fade_y(a)
    return heal_x(a.transpose(1, 0, 2), search).transpose(1, 0, 2)


def wrap_x(a: np.ndarray, k: int) -> np.ndarray:
    t, ext = a[:, k:], a[:, :k]
    s = t.shape[1]
    diff = ((t[:, s - k:] - ext) ** 2).sum(-1)
    path = cut_paths(diff[:, 2:-2])[0] + 2
    xs = np.arange(k)[None, :]
    soft = (xs >= path[:, None]).astype(np.float32)
    for _ in range(2):
        soft = (np.roll(soft, 1, 1) + soft + np.roll(soft, -1, 1)) / 3
        soft[:, 0], soft[:, -1] = 0, 1
    out = t.copy()
    out[:, s - k:] = t[:, s - k:] * (1 - soft[..., None]) + ext * soft[..., None]
    return out


def wrap_tile(a: np.ndarray, k: int) -> np.ndarray:
    return wrap_x(wrap_x(a, k).transpose(1, 0, 2), k).transpose(1, 0, 2)


def painted(name: str, spec: dict, sheet: np.ndarray, spans: list) -> str:
    (y0, y1), (x0, x1) = spans[0][spec["cell"][0]], spans[1][spec["cell"][1]]
    inset = 8
    s = min(y1 - y0, x1 - x0) - 2 * inset
    a = sheet[y0 + inset:y0 + inset + s, x0 + inset:x0 + inset + s]
    w = 256
    if "wrap" in spec:
        k = int(w * spec["wrap"])
        a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((w + k, w + k), Image.LANCZOS), np.float32) / 255
        if spec.get("flat", True):
            a = flatten(a, a.shape[0] // 4)
        a = wrap_tile(a, k)
    else:
        a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((w, w), Image.LANCZOS), np.float32) / 255
        a = make_seamless(a, spec.get("search", False), spec.get("flat", True), spec.get("fade", False))
    if "contrast" in spec:
        m = a.reshape(-1, 3).mean(0)
        a = m + (a - m) * spec["contrast"]
    if "match" in spec:
        mean, sd = spec["match"]
        m = a.reshape(-1, 3).mean(0)
        a = np.array(mean, np.float32) + (a - m) * (sd / a.mean(2).std())
    size = spec.get("size", 128)
    rep = spec.get("repeat", 1)
    img = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((size // rep, size // rep), Image.LANCZOS)
    if rep > 1:
        img = Image.fromarray(np.tile(np.asarray(img), (rep, rep, 1)))
    path = os.path.join(OUT, name + ".png")
    img.convert("RGBA").save(path)
    return path


CARD_SRC = os.path.join(ROOT, "assets", "source", "map_props_ai.png")
CARDS = {"tallgrass": {"x0": 1330, "cell": (128, 208), "bg": 207}}


def dilate_rgb(rgb: np.ndarray, alpha: np.ndarray, iters: int = 12) -> np.ndarray:
    rgb, a = rgb.copy(), alpha.copy()
    for _ in range(iters):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(a.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sa = np.roll(np.roll(a, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * sa[..., None]
            cnt += sa
        grow = (a == 0) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        a = np.where(grow, 1.0, a)
    return rgb


def cards(name: str, spec: dict) -> str:
    src = np.asarray(Image.open(CARD_SRC).convert("RGB"), np.float32)
    key = np.abs(src - spec["bg"]).sum(2) > 40
    cols = key[:, spec["x0"]:].any(0)
    runs, i = [], 0
    while i < len(cols):
        if cols[i]:
            j = i
            while j < len(cols) and cols[j]:
                j += 1
            if j - i > 50:
                runs.append((i + spec["x0"], j + spec["x0"]))
            i = j
        else:
            i += 1
    cw, ch = spec["cell"]
    out = np.zeros((ch, cw * len(runs), 4), np.float32)
    for k, (x0, x1) in enumerate(runs):
        ys = np.where(key[:, x0:x1].any(1))[0]
        crop = src[ys.min():ys.max() + 1, x0:x1] / 255
        dist = np.abs(crop * 255 - spec["bg"]).sum(2)
        sat = crop.max(2) - crop.min(2)
        alpha = np.clip((np.maximum(dist - 30, 0) / 40) + sat * 4 - 0.2, 0, 1)
        alpha = (alpha > 0.5).astype(np.float32)
        rgb = dilate_rgb(crop, alpha, 6)
        h, w = crop.shape[:2]
        s = min(cw / w, ch / h)
        nw, nh = max(1, int(w * s)), max(1, int(h * s))
        rgba = np.concatenate([rgb, alpha[..., None]], -1)
        im = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA").resize((nw, nh), Image.LANCZOS)
        r = np.asarray(im, np.float32) / 255
        ox = k * cw + (cw - nw) // 2
        out[ch - nh:, ox:ox + nw] = r
    a = (out[..., 3] > 0.45).astype(np.float32)
    rgb = dilate_rgb(out[..., :3], a, 16)
    path = os.path.join(OUT, name + ".png")
    Image.fromarray((np.concatenate([rgb, a[..., None]], -1) * 255 + 0.5).astype(np.uint8), "RGBA").save(path)
    return path


def main_painted(names: list) -> None:
    if names and all(n in CARDS for n in names):
        for n in names:
            print(n, "->", os.path.relpath(cards(n, CARDS[n]), ROOT))
        manifest = os.path.join(OUT, "photo.json")
        prev = json.load(open(manifest))
        prev.update({n: "painted:" + os.path.basename(CARD_SRC) for n in names})
        json.dump(prev, open(manifest, "w"), indent=1, sort_keys=True)
        return
    sheets = {}
    done = {}
    for n in names or list(PAINTED):
        src = PAINT_SRC2 if PAINTED[n].get("src") == 2 else PAINT_SRC
        if src not in sheets:
            sheet = np.asarray(Image.open(src).convert("RGB"), np.float32)
            sheets[src] = (sheet / 255, grid_cells(sheet))
        print(n, "->", os.path.relpath(painted(n, PAINTED[n], *sheets[src]), ROOT))
        done[n] = src
    manifest = os.path.join(OUT, "photo.json")
    prev = json.load(open(manifest)) if os.path.exists(manifest) else {}
    prev.update({n: "painted:" + os.path.basename(src) for n, src in done.items()})
    json.dump(prev, open(manifest, "w"), indent=1, sort_keys=True)


def main() -> None:
    if sys.argv[1:2] == ["--painted"]:
        main_painted(sys.argv[2:])
        return
    names = sys.argv[1:] or [n for n in SPECS if n not in PAINTED]
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
