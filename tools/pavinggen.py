"""Synthesizes the terrain paving textures from a painted cobble sheet.

    python3 tools/pavinggen.py [assets/source/paving_ai.jpg]

The sheet (Nano Banana, painted top-down cobbles) is cut into individual stone sprites, which are re-laid into a
large seamless tile: rows of random height, every stone a random sprite, h-flip, stretch and tint, rows staggered
at random, so nothing repeats inside the tile. Because the layout is known, the per-stone id map the terrain shader
uses is written directly (same encoding as `phototex.py --paving`):
  paving.jpg        colour, TILE px square (one repeat = PAVING_M metres in terrainMesh.ts)
  paving_id.png     R per-stone random value, G stone interior (0 in the gaps), B which tile owns the stone
  paving_crack.jpg  colour with cracks and chipped corners on many stones (ruined floors pick these per stone)
"""

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "textures")
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "assets", "source", "paving_ai.jpg")
TILE = 1024
WORK = 1024


def nb_or(m: np.ndarray, r: int = 1) -> np.ndarray:
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(m, (dy, dx), (0, 1))
    return out


def nb_and(m: np.ndarray, r: int = 1) -> np.ndarray:
    return ~nb_or(~m, r)


def components(m: np.ndarray) -> list:
    h, w = m.shape
    seen = np.zeros_like(m)
    out = []
    ys, xs = np.nonzero(m)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        stack, pts = [(y0, x0)], []
        while stack:
            y, x = stack.pop()
            pts.append((y, x))
            for vy, vx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= vy < h and 0 <= vx < w and m[vy, vx] and not seen[vy, vx]:
                    seen[vy, vx] = True
                    stack.append((vy, vx))
        out.append(np.array(pts))
    return out


def blur(a: np.ndarray, r: int) -> np.ndarray:
    for axis in (0, 1):
        acc = np.zeros_like(a)
        for i in range(-r, r + 1):
            acc += np.roll(a, i, axis)
        a = acc / (2 * r + 1)
    return a


def cut_stones(path: str) -> tuple:
    a = np.asarray(Image.open(path).convert("RGB").resize((WORK, WORK), Image.LANCZOS), np.float32) / 255
    s = a.mean(-1) * 255 - (a[..., 0] - a[..., 2]) * 255 * 2.5
    gap = s < 95
    net = np.zeros_like(gap)
    for c in components(gap):
        if len(c) > 4000:
            net[c[:, 0], c[:, 1]] = True
    stone = nb_and(~net, 2)
    sprites = []
    for c in components(stone):
        if len(c) < 600:
            continue
        y0, x0 = c.min(0) - 3
        y1, x1 = c.max(0) + 4
        if y0 < 0 or x0 < 0 or y1 > WORK or x1 > WORK or len(c) < 0.8 * (y1 - y0 - 7) * (x1 - x0 - 7):
            continue
        m = np.zeros((y1 - y0, x1 - x0), bool)
        m[c[:, 0] - y0, c[:, 1] - x0] = True
        m = nb_or(m, 3)
        alpha = blur(m.astype(np.float32), 1)
        sprites.append(np.dstack([a[y0:y1, x0:x1], alpha]))
    grout = np.median(a[net], 0)
    return sprites, grout


def resize(sp: np.ndarray, w: int, h: int) -> np.ndarray:
    img = Image.fromarray((np.clip(sp, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    return np.asarray(img.resize((w, h), Image.LANCZOS), np.float32) / 255


def main() -> None:
    sprites, grout = cut_stones(SRC)
    print("stones cut", len(sprites))
    aspects = np.array([sp.shape[1] / sp.shape[0] for sp in sprites])
    rng = np.random.default_rng(11)
    n = TILE
    mortar = grout[None, None] * (1 + (blur(rng.random((n, n), np.float32), 6) - 0.5)[..., None] * 0.5)
    col = mortar.copy()
    lab = np.full((n, n), -1, np.int32)
    shift = np.zeros((n, n), np.int8)
    owner = []
    hs = []
    while sum(hs) < n:
        hs.append(int(rng.integers(28, 44)) if rng.random() > 0.08 else int(rng.integers(18, 24)))
    hs = np.round(np.array(hs) * n / sum(hs)).astype(int)
    hs[-1] += n - hs.sum()
    y = 0
    for rh in hs:
        widths = []
        while sum(widths) < n:
            r = rng.random()
            asp = rng.uniform(0.45, 0.75) if r < 0.15 else rng.uniform(0.9, 1.5) if r < 0.75 else rng.uniform(1.5, 2.3)
            widths.append(max(10.0, rh * asp))
        widths = np.array(widths) * n / sum(widths)
        x = rng.uniform(0, n)
        for wd in widths:
            g = rng.uniform(-1.0, 1.0)
            sw = int(round(wd - g))
            sh = int(round(rh - rng.uniform(-1.0, 1.0)))
            want = sw / sh
            fit = [i for i, a in enumerate(aspects) if abs(np.log(a / want)) < 0.3]
            sp = sprites[int(rng.choice(fit))] if fit else sprites[int(np.argmin(np.abs(np.log(aspects / want))))]
            if rng.random() < 0.5:
                sp = sp[:, ::-1]
            sp = resize(sp, max(6, sw), max(6, sh)).copy()
            warm = rng.uniform(-1, 1) * 0.03
            sp[..., :3] *= np.array([1 + warm, 1, 1 - warm]) * rng.uniform(0.94, 1.05)
            x0 = int(round(x + g / 2))
            y0 = y + int(round((rh - sp.shape[0]) / 2 + rng.uniform(-1, 1)))
            k = len(owner)
            owner.append(1 if x0 + sp.shape[1] / 2 >= n else 0)
            ys = np.clip(np.arange(y0, y0 + sp.shape[0]), 0, n - 1)
            xs = np.arange(x0, x0 + sp.shape[1])
            al = sp[..., 3:]
            xs_w = xs % n
            col[np.ix_(ys, xs_w)] = col[np.ix_(ys, xs_w)] * (1 - al) + sp[..., :3] * al
            yy, xx = np.nonzero(sp[..., 3] > 0.5)
            lab[ys[yy], xs_w[xx]] = k
            shift[ys[yy], xs_w[xx]] = np.clip(owner[k] - xs[xx] // n, -1, 1)
            x += wd
        y += rh
    print("stones laid", len(owner))

    stone = lab >= 0
    grow = lab.copy()
    gsh = shift.copy()
    while (grow < 0).any():
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nl = np.roll(grow, (dy, dx), (0, 1))
            ns = np.roll(gsh, (dy, dx), (0, 1))
            fill = (grow < 0) & (nl >= 0)
            grow[fill] = nl[fill]
            gsh[fill] = ns[fill]
    edge = np.zeros((n, n), bool)
    for dy, dx in ((1, 0), (0, 1), (-1, 0), (0, -1)):
        edge |= grow != np.roll(grow, (dy, dx), (0, 1))
    inner = stone & ~edge
    dist = np.zeros((n, n), np.float32)
    cur = inner.copy()
    for d in range(1, 7):
        dist[cur] = d
        cur = nb_and(cur, 1)
    vals = rng.permutation(len(owner)) / max(1, len(owner) - 1) * 0.94 + 0.04
    idm = np.zeros((n, n, 3), np.uint8)
    idm[..., 0] = (vals[grow] * 255 + 0.5).astype(np.uint8)
    idm[..., 1] = (np.clip(dist / 5.0, 0, 1) * 255 + 0.5).astype(np.uint8)
    idm[..., 2] = (((gsh.astype(np.int32) + 1) * 3 + 1) / 8 * 255 + 0.5).astype(np.uint8)

    col = np.clip(col, 0, 1)
    Image.fromarray((col * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, "paving.jpg"), quality=92)
    Image.fromarray(idm, "RGB").save(os.path.join(OUT, "paving_id.png"))

    crack = col.copy()
    order = np.argsort(grow[inner])
    ys_all, xs_all = np.nonzero(inner)
    ks = grow[inner][order]
    pts_y, pts_x = ys_all[order], xs_all[order]
    starts = np.searchsorted(ks, np.arange(len(owner) + 1))
    for k in range(len(owner)):
        py, px = pts_y[starts[k]:starts[k + 1]], pts_x[starts[k]:starts[k + 1]]
        if len(py) < 60 or (px.max() - px.min()) > n / 2:
            continue
        r = np.random.default_rng(100 + k)
        inside = set(zip(py.tolist(), px.tolist()))
        y0, y1, x0, x1 = py.min(), py.max(), px.min(), px.max()
        cy, cx = py.mean(), px.mean()
        horiz = (x1 - x0) >= (y1 - y0)
        line = []
        for i in range(6):
            t = i / 5
            if horiz:
                line.append((cy + (r.random() - 0.5) * (y1 - y0) * 0.35, x0 + 2 + t * (x1 - x0 - 4)))
            else:
                line.append((y0 + 2 + t * (y1 - y0 - 4), cx + (r.random() - 0.5) * (x1 - x0) * 0.35))
        cut = int(r.integers(1, 5))
        line = line[cut - 1:] if r.random() < 0.5 else line[:cut + 2]
        for (ay, ax), (by, bx) in zip(line, line[1:]):
            for f in np.linspace(0, 1, 60):
                iy, ix = int(round(ay + (by - ay) * f)), int(round(ax + (bx - ax) * f))
                for oy, ox, mul in ((0, 0, 0.6), (0, 1, 0.75), (1, 0, 1.12)):
                    if (iy + oy, ix + ox) in inside:
                        crack[iy + oy, ix + ox] = np.minimum(1, crack[iy + oy, ix + ox] * mul)
        if r.random() < 0.6:
            dirv = r.normal(size=2)
            j = int(np.argmax(py * dirv[0] + px * dirv[1]))
            rad = r.uniform(4, 8)
            d = np.hypot(py - py[j], px - px[j])
            near = d < rad
            crack[py[near], px[near]] = grout * (0.8 + 0.2 * d[near, None] / rad)
            rim = (d >= rad) & (d < rad + 1.5)
            crack[py[rim], px[rim]] *= 0.7
    Image.fromarray((np.clip(crack, 0, 1) * 255 + 0.5).astype(np.uint8)).save(
        os.path.join(OUT, "paving_crack.jpg"), quality=92
    )
    print("-> assets/textures/paving.jpg, paving_id.png, paving_crack.jpg")


if __name__ == "__main__":
    main()
