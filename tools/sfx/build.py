#!/usr/bin/env python3
"""Cuts the raw CC0 libraries (tools/sfx/fetch.sh -> $SFX_RAW) into the game's sound files.

For every entry in manifest.py: each matched source file (or, with split, each separate hit inside it) becomes one
variant, written as assets/sfx/<id>.<n>.ogg. Processing per variant:
  ffmpeg: slice (start/dur), pitch (rate, which also changes speed), highpass / lowpass, mono (stereo for beds)
  numpy:  trim leading/trailing silence, short fades, loudness-match (loudest 50 ms window to -14 dBFS, peak
          limited to -1 dBFS), gain, and for loops a crossfade of the tail into the head so they repeat seamlessly
Runtime levels per category live in src/audio/; everything here is normalised alike.

  python3 tools/sfx/build.py            build all (skips ids whose files are newer than the manifest)
  python3 tools/sfx/build.py hit. vo.   only ids starting with these prefixes (always rebuilt)
"""
import glob
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import manifest  # noqa: E402

RAW = os.environ.get("SFX_RAW", os.path.expanduser("~/.cache/grudge-sfx"))
OUT = os.path.join(HERE, "..", "..", "assets", "sfx")
SR = 44100


def decode(path, e):
    af = []
    if e.get("start") or e.get("dur"):
        a = f"atrim=start={e.get('start', 0)}"
        if e.get("dur"):
            a += f":duration={e['dur']}"
        af += [a, "asetpts=PTS-STARTPTS"]
    if e.get("rate", 1) != 1:
        af += [f"asetrate={int(SR * e['rate'])}", f"aresample={SR}"]
    if e.get("hp"):
        af.append(f"highpass=f={e['hp']}")
    if e.get("lp"):
        af.append(f"lowpass=f={e['lp']}")
    ch = 2 if e.get("stereo") else 1
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-ar", str(SR), "-ac", str(ch)]
    if af:
        cmd += ["-af", ",".join(af)]
    cmd += ["-f", "f32le", "-"]
    b = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(b, np.float32).copy()
    return x.reshape(-1, ch)


def env(x, win=441):
    m = np.abs(x).max(1)
    n = len(m) // win
    if n == 0:
        return np.array([m.max() if len(m) else 0.0])
    return m[: n * win].reshape(n, win).max(1)


def split(x, gap=0.12, floor_db=-30):
    """Separate hits: runs of the 10 ms envelope above floor_db (rel. peak) split by gaps longer than `gap`."""
    e = env(x)
    if e.max() <= 0:
        return []
    on = e > e.max() * 10 ** (floor_db / 20)
    segs, s, quiet = [], None, 0
    for i, v in enumerate(on):
        if v:
            if s is None:
                s = i
            quiet = 0
        elif s is not None:
            quiet += 1
            if quiet * 0.01 >= gap:
                segs.append((s, i - quiet + 1))
                s = None
    if s is not None:
        segs.append((s, len(on)))
    out = []
    for a, b in segs:
        if (b - a) * 0.01 < 0.04:
            continue
        a0 = max(0, a * 441 - 441)
        b0 = min(len(x), b * 441 + 4410)
        out.append(x[a0:b0])
    return out


def trim(x, floor_db=-45):
    e = env(x, 220)
    if e.max() <= 0:
        return x
    on = np.nonzero(e > e.max() * 10 ** (floor_db / 20))[0]
    a = max(0, on[0] * 220 - 220)
    b = min(len(x), (on[-1] + 1) * 220 + 2205)
    return x[a:b]


def fades(x, fin=0.004, fout=0.03):
    n = len(x)
    a = min(n // 4, int(fin * SR))
    b = min(n // 3, int(fout * SR))
    if a > 0:
        x[:a] *= np.linspace(0, 1, a)[:, None]
    if b > 0:
        x[-b:] *= np.linspace(1, 0, b)[:, None] ** 2
    return x


def loudness(x):
    w = 2205
    m = (x * x).mean(1)
    n = len(m) // w
    if n == 0:
        return np.sqrt(m.mean() + 1e-12)
    return np.sqrt(m[: n * w].reshape(n, w).mean(1).max() + 1e-12)


def normalise(x, target_db=-14.0, gain_db=0.0):
    x = x * (10 ** (target_db / 20) / loudness(x))
    pk = np.abs(x).max()
    lim = 10 ** (-1 / 20)
    if pk > lim:
        x *= lim / pk
    return x * 10 ** (gain_db / 20)


def make_loop(x, xf=1.5):
    n = int(xf * SR)
    if len(x) < 3 * n:
        return x
    head, body, tail = x[:n], x[n:-n], x[-n:]
    t = np.linspace(0, 1, n)[:, None]
    return np.concatenate([body, tail * (1 - t) + head * t])


def encode(x, path, stereo):
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2" if stereo else "1", "-i", "-"]
    cmd += ["-c:a", "libvorbis", "-q:a", "0" if stereo else "3", path]
    subprocess.run(cmd, input=pcm, check=True)


def build(e):
    files = []
    for pat in e["src"]:
        hit = sorted(glob.glob(os.path.join(RAW, pat)))
        hit = [f for f in hit if "/._" not in f and "__MACOSX" not in f]
        if not hit:
            print(f"  ! {e['id']}: nothing matches {pat}")
        files += hit
    parts = []
    for f in files:
        x = decode(f, e)
        if e.get("split"):
            parts += split(x, e.get("gap", 0.12), e.get("floor", -30))
        else:
            parts.append(x)
    if e.get("pick"):
        parts = [parts[i] for i in e["pick"] if i < len(parts)]
    parts = parts[: e.get("max", 8)]
    for old in glob.glob(os.path.join(OUT, f"{e['id']}.*.ogg")):
        os.remove(old)
    for n, x in enumerate(parts):
        if e.get("loop"):
            x = x[: int((e["loop"] + 1.5) * SR)]
            x = make_loop(normalise(x, e.get("level", -20), e.get("gain", 0)))
        else:
            x = trim(x)
            if e.get("maxdur"):
                x = x[: int(e["maxdur"] * SR)]
            x = fades(normalise(x, e.get("level", -14), e.get("gain", 0)), fout=e.get("fout", 0.03))
        encode(x, os.path.join(OUT, f"{e['id']}.{n}.ogg"), e.get("stereo", False))
    return len(parts)


def main():
    os.makedirs(OUT, exist_ok=True)
    only = sys.argv[1:]
    stamp = os.path.getmtime(os.path.join(HERE, "manifest.py"))
    total = 0
    for e in manifest.ENTRIES:
        if only and not any(e["id"].startswith(p) for p in only):
            continue
        done = glob.glob(os.path.join(OUT, f"{e['id']}.*.ogg"))
        if not only and done and min(os.path.getmtime(f) for f in done) > stamp:
            total += len(done)
            continue
        total += build(e)
    print(f"{total} files in assets/sfx")


if __name__ == "__main__":
    main()
