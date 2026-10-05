"""Loading splash from five small-group paintings (three champions each, tools/fx-prompts/loading_group_*.txt):
five framed cards fanned across the screen, slightly tilted and overlapping, the Herald's group in the middle,
biggest and in front, on a darkened, blurred copy of his painting; the top stays clear for the logo.

    python3 tools/splash-strips.py <dir with g1..g5.png> [out.jpg]
"""
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

SRC = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/loading/art.jpg"
W, H = 2752, 1536
# (group, centre x, centre y, card height, tilt degrees); drawn in this order (Herald's group last, on top).
CARDS = [
    ("g1", 300, 1010, 760, 4.0),
    ("g5", 2452, 1010, 760, -4.0),
    ("g2", 815, 985, 810, 2.0),
    ("g4", 1937, 985, 810, -2.0),
    ("g3", 1376, 975, 960, 0.0),
]
FRAME = 18


def card(im, h):
    w = round(im.width * h / im.height)
    im = im.resize((w, h), Image.LANCZOS)
    out = Image.new("RGBA", (w + 2 * FRAME, h + 2 * FRAME), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.rectangle((0, 0, out.width - 1, out.height - 1), fill=(34, 20, 10, 255))
    d.rectangle((5, 5, out.width - 6, out.height - 6), fill=(214, 166, 70, 255))
    d.rectangle((9, 9, out.width - 10, out.height - 10), fill=(120, 76, 26, 255))
    d.rectangle((12, 12, out.width - 13, out.height - 13), fill=(255, 226, 150, 255))
    out.paste(im, (FRAME, FRAME))
    return out


def main():
    hero = Image.open(f"{SRC}/g3.png").convert("RGB")
    bg = hero.resize((W, round(hero.height * W / hero.width)), Image.LANCZOS)
    bg = bg.crop((0, (bg.height - H) // 3, W, (bg.height - H) // 3 + H)).filter(ImageFilter.GaussianBlur(28))
    bg = ImageEnhance.Brightness(bg).enhance(0.42).convert("RGBA")
    for g, cx, cy, h, tilt in CARDS:
        c = card(Image.open(f"{SRC}/{g}.png").convert("RGB"), h)
        c = c.rotate(tilt, resample=Image.BICUBIC, expand=True)
        # Drop shadow.
        sh = Image.new("RGBA", c.size, (0, 0, 0, 0))
        sh.putalpha(c.getchannel("A").point(lambda a: int(a * 0.6)))
        sh = sh.filter(ImageFilter.GaussianBlur(18))
        bg.alpha_composite(sh, (int(cx - c.width / 2 + 14), int(cy - c.height / 2 + 20)))
        bg.alpha_composite(c, (int(cx - c.width / 2), int(cy - c.height / 2)))
    out = bg.convert("RGB")
    if OUT.endswith(".jpg"):
        out.resize((1920, 1072), Image.LANCZOS).save(OUT, quality=88, optimize=True, progressive=True)
    else:
        out.save(OUT)
    print("wrote", OUT)


main()
