"""Compose the loading splash from real in-game renders: every champion's action shot (Portraits.actionShot, rendered
by /tmp/opencode/splash3/action.mjs into act_<hero>.png) placed on a painted empty backdrop, the Herald front and
centre, the rest in two staggered rows so nobody covers anyone's face. Writes public/loading/art.jpg.

    python3 tools/splash-compose.py <backdrop.png> <shots dir> [out.png]
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

BG, SHOTS = sys.argv[1], sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else "public/loading/art.jpg"

W, H = 2752, 1536
# (hero, centre x, feet y, height px, mirror). Back row first (drawn first), then front, Herald last.
BACK = 1150
FRONT = 1500
# Front row: nine slots 310 px apart with the Herald in the middle; back row in the gaps between them (skipping
# the two next to the Herald's banner), smaller and higher so every head and chest shows.
LAYOUT = [
    ("summoner", 291, BACK, 440, False),
    ("scribe", 601, BACK, 420, False),
    ("marksman", 911, BACK, 450, True),
    ("architect", 1841, BACK, 410, True),
    ("harpooner", 2151, BACK, 400, True),
    ("rider", 2461, BACK, 430, True),
    ("warden", 136, FRONT, 600, False),
    ("vintner", 446, FRONT, 560, False),
    ("warlord", 756, FRONT, 570, False),
    ("raider", 1066, FRONT, 500, False),
    ("duelist", 1686, FRONT, 540, True),
    ("engineer", 1996, FRONT, 450, True),
    ("friar", 2306, FRONT, 530, True),
    ("wreckwitch", 2616, FRONT, 560, True),
    ("herald", 1376, FRONT + 30, 1260, False),
]


def shot(hero):
    im = Image.open(f"{SHOTS}/act_{hero}.png").convert("RGBA")
    return im.crop(im.getbbox())


def main():
    bg = Image.open(BG).convert("RGB").resize((W, H), Image.LANCZOS)
    canvas = bg.convert("RGBA")
    for hero, cx, feet, h, flip in LAYOUT:
        im = shot(hero)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        k = h / im.height
        im = im.resize((max(1, round(im.width * k)), h), Image.LANCZOS)
        a = np.asarray(im, np.float32) / 255
        # Light the render like the backdrop: warm dusk tint, a touch darker at the feet, warm rim on the left edge.
        rgb = a[..., :3]
        rgb = rgb * np.array([1.06, 0.96, 0.86])
        ys = np.linspace(0, 1, rgb.shape[0])[:, None, None]
        rgb = rgb * (1.0 - 0.18 * ys)
        rgb = np.clip(rgb, 0, 1)
        im = Image.fromarray((np.dstack([rgb, a[..., 3]]) * 255).astype(np.uint8), "RGBA")
        # Contact shadow: a soft dark ellipse at the feet.
        sw = int(im.width * 0.9)
        sh = max(8, int(h * 0.06))
        sh_img = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
        m = Image.new("L", (sw, sh), 0)
        from PIL import ImageDraw

        ImageDraw.Draw(m).ellipse((0, 0, sw - 1, sh - 1), fill=150)
        m = m.filter(ImageFilter.GaussianBlur(sh / 3))
        sh_img.putalpha(m)
        canvas.alpha_composite(sh_img, (int(cx - sw / 2), int(feet - sh / 2)))
        canvas.alpha_composite(im, (int(cx - im.width / 2), int(feet - im.height)))
    out = canvas.convert("RGB")
    if OUT.endswith(".jpg"):
        out.resize((1920, 1072), Image.LANCZOS).save(OUT, quality=88, optimize=True, progressive=True)
    else:
        out.save(OUT)
    print("wrote", OUT)


main()
