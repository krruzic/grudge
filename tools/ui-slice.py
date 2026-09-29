import numpy as np
from PIL import Image

src = Image.open("assets/ui/src_gloves.png").convert("RGBA")
CELLS = {
    "chip_1": (1, 1, 27, 25), "chip_2": (28, 1, 54, 25), "chip_3": (55, 1, 81, 25), "chip_4": (82, 1, 108, 25), "chip_cp": (109, 1, 135, 25),
    "glove_point": (1, 26, 28, 62), "glove_grab": (29, 34, 59, 62), "glove_open": (60, 26, 95, 62),
    "tag_1": (96, 26, 111, 36), "tag_2": (112, 26, 127, 36), "tag_3": (96, 37, 111, 47), "tag_4": (112, 37, 127, 47),
}
HUE = {"chip_1": 0.62, "chip_2": 0.0}


def rehue(im: Image.Image, target: float) -> Image.Image:
    a = np.asarray(im).copy()
    hsv = np.asarray(im.convert("RGB").convert("HSV")).astype(np.int32)
    sat = hsv[..., 1] > 60
    hsv[..., 0] = np.where(sat, int(target * 255), hsv[..., 0])
    rgb = np.asarray(Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB"))
    a[..., :3] = rgb
    return Image.fromarray(a, "RGBA")


for name, box in CELLS.items():
    im = src.crop(box)
    a = np.asarray(im)
    ys, xs = np.where(a[..., 3] > 8)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    if name in HUE:
        im = rehue(im, HUE[name])
    im.save(f"assets/ui/{name}.png")
    print(name, im.size)
