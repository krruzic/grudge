from PIL import Image, ImageDraw, ImageChops
import numpy as np
R = "/home/krruzic/Projects/grudge/assets/fx/"
KEYS = {
    "warlord": ["rage", "slab", "lavaCrack", "shout", "helm", "dust", "ember", "splash", "ring", "swoosh", "pebbles", "impact", "horn", "lavaGlow", "crackRing", "rune"],
    "engineer": ["gear", "gearSmall", "weld", "steam", "nut", "spring", "wrench", "plank", "rivet", "arc", "oilSmoke", "clang", "ring", "blueprint", "shards", "heal"],
    "raider": ["smoke", "shadow", "poison", "slash", "cross", "glint", "knife", "drop", "darkSlash", "dashStreak", "bubble", "smokeRing", "skull", "afterimage", "dust", "vortex"],
    "warden": ["leaf", "leafAutumn", "bark", "moss", "wisp", "vine", "wreath", "roots", "splinters", "natureBurst", "stone", "pebbleDust", "mossCrack", "thorn", "flower", "rune"],
    "wren": ["feather", "feathers", "claws", "arrow", "streak", "splinters", "leaf", "leaves", "markRing", "arrowRing", "heart", "glint", "dizzy", "gust", "flame", "spiral"],
    "common": ["burst", "burst2", "dust", "dust2", "smoke", "shock", "streak", "twinkle", "crack", "rock", "pebbles", "swoosh", "flashRed", "fire", "zap", "splash"],
}


def cell(atlas, key, costume=""):
    f = R + (f"{atlas}@{costume}.png" if costume else f"{atlas}.png")
    im = Image.open(f).convert("RGBA")
    i = KEYS[atlas].index(key)
    return im.crop(((i % 4) * 128, (i // 4) * 128, (i % 4 + 1) * 128, (i // 4 + 1) * 128))


def radial(stops, S=256):
    ys, xs = np.mgrid[0:S, 0:S]
    r = np.hypot(xs + 0.5 - S / 2, ys + 0.5 - S / 2) / (S / 2)
    out = np.zeros((S, S, 4), np.float32)
    rs = [s[0] for s in stops]
    for c in range(4):
        out[..., c] = np.interp(r, rs, [s[1][c] for s in stops])
    out[..., 3] *= 255
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def paste(base, im, x, y, w, h, alpha=1.0, add=False):
    im = im.resize((w, h), Image.BILINEAR)
    if alpha < 1:
        a = np.asarray(im).astype(np.float32)
        a[..., 3] *= alpha
        im = Image.fromarray(a.astype(np.uint8), "RGBA")
    if add:
        a = np.asarray(im).astype(np.float32)
        layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        layer.paste(im, (x, y))
        la = np.asarray(layer).astype(np.float32)
        b = np.asarray(base).astype(np.float32)
        b[..., :3] = np.clip(b[..., :3] + la[..., :3] * la[..., 3:4] / 255, 0, 255)
        b[..., 3] = np.maximum(b[..., 3], la[..., 3])
        return Image.fromarray(b.astype(np.uint8), "RGBA")
    base.alpha_composite(im, (x, y)) if x >= 0 and y >= 0 else base.alpha_composite(im.crop((-min(x, 0), -min(y, 0), w, h)), (max(x, 0), max(y, 0)))
    return base


def clipdisc(im):
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).ellipse((2, 2, 254, 254), fill=255)
    a = im.copy()
    a.putalpha(ImageChops.multiply(im.getchannel("A"), m))
    return a


def sinkhole(c=""):
    b = radial([(0, (6, 4, 2, 1)), (0.06, (6, 4, 2, 1)), (0.5, (40, 28, 18, 0.85)), (1, (60, 44, 30, 0))])
    b = paste(b, cell("warlord", "crackRing", c), 0, 0, 256, 256)
    return clipdisc(b)


def crater(c=""):
    b = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    b = paste(b, cell("warlord", "crackRing", c), 0, 0, 256, 256, 0.95)
    b = paste(b, cell("common", "crack"), 30, 30, 196, 196, 0.7)
    return clipdisc(b)


def lava(c=""):
    b = radial([(0, (40, 16, 6, 0.9)), (0.08, (40, 16, 6, 0.9)), (0.8, (50, 24, 10, 0.6)), (1, (50, 24, 10, 0))])
    b = paste(b, cell("warlord", "lavaCrack", c), 0, 0, 256, 256)
    b = paste(b, cell("warlord", "lavaCrack", c), 20, 20, 216, 216, 0.5, add=True)
    return clipdisc(b)


def tesla(c=""):
    b = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    b = paste(b, cell("common", "crack"), 0, 0, 256, 256)
    arc = cell("engineer", "arc", c)
    b = paste(b, arc, 20, 90, 216, 76, 0.8, add=True)
    b = paste(b, arc.rotate(90, expand=True), 90, 20, 76, 216, 0.8, add=True)
    return clipdisc(b)


def bramble(c=""):
    b = radial([(0, (34, 24, 12, 0.85)), (0.08, (34, 24, 12, 0.85)), (0.75, (44, 34, 18, 0.6)), (1, (44, 34, 18, 0))])
    b = paste(b, cell("warden", "roots", c), 8, 8, 240, 240)
    b = paste(b, cell("warden", "wreath", c), 14, 14, 228, 228, 0.9)
    return b


def grid(items, bg, out):
    S = 2048
    im = Image.new("RGB", (S, S), bg)
    for q, it in enumerate(items):
        if it is None:
            continue
        x0, y0 = (q % 2) * 1024, (q // 2) * 1024
        big = it.resize((900, 900), Image.BILINEAR)
        tile = Image.new("RGBA", (1024, 1024), bg + (255,))
        tile.alpha_composite(big, (62, 62))
        im.paste(tile.convert("RGB"), (x0, y0))
    im.save(out, quality=92)


if __name__ == "__main__":
    O = "/tmp/opencode/uniqfx/hd/"
    G = (0, 255, 0)
    grid([sinkhole(), lava(), crater(), tesla()], G, O + "refA.jpg")
    grid([sinkhole("colossus"), lava("colossus"), crater(), tesla("calliope")], G, O + "refB.jpg")
    grid([bramble(), bramble("suntotem"), cell("engineer", "gear", "calliope"), cell("raider", "smokeRing", "sporeblight")], G, O + "refC.jpg")
    grid([cell("wren", "spiral"), cell("wren", "spiral", "starfall"), cell("warlord", "crackRing", "colossus"), cell("warlord", "pebbles", "colossus")], G, O + "refD.jpg")
    for n, f in [("sinkhole", sinkhole), ("lava", lava), ("crater", crater), ("tesla", tesla), ("bramble", bramble)]:
        f().save(O + f"lo_{n}.png")
    sinkhole("colossus").save(O + "lo_sinkhole@colossus.png")
    lava("colossus").save(O + "lo_lava@colossus.png")
    tesla("calliope").save(O + "lo_tesla@calliope.png")
    bramble("suntotem").save(O + "lo_bramble@suntotem.png")
