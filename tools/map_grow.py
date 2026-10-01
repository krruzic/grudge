"""Insert empty strips into a map so its bases get roomier.

grow(data, xs=[(at, n)], zs=[(at, n)]) inserts n cells at each coordinate (in the
map's current coordinates; apply from highest to lowest). Rects spanning the line
stretch, everything past it shifts. For mirror "x" maps the width grows by 2n per
x insert (the mirror half moves with it); for "diag" maps pass symmetric lists.
"""
import json
import sys


def _axis(d, key, size, at, n):
    if key not in d:
        return
    v = d[key]
    if v >= at:
        d[key] = v + n
    elif size and d.get(size) is not None and v + d[size] > at:
        d[size] = d[size] + n


def grow(data, xs=(), zs=()):
    for at, n in sorted(xs, reverse=True):
        for op in data["ops"]:
            _axis(op, "x", "w", at, n)
        for lst in ("props", "pads", "cores", "spawns"):
            for p in data[lst]:
                _axis(p, "x", None, at, n)
        data["width"] += n * (2 if data.get("mirror") == "x" else 1)
    for at, n in sorted(zs, reverse=True):
        for op in data["ops"]:
            _axis(op, "z", "h", at, n)
        for lst in ("props", "pads", "cores", "spawns"):
            for p in data[lst]:
                _axis(p, "z", None, at, n)
        data["depth"] += n
    return data


if __name__ == "__main__":
    path = sys.argv[1]
    d = json.load(open(path))
    xs = json.loads(sys.argv[2]) if len(sys.argv) > 2 else []
    zs = json.loads(sys.argv[3]) if len(sys.argv) > 3 else []
    grow(d, xs, zs)
    json.dump(d, open(path, "w"), indent=1)
    print(path, d["width"], d["depth"])
