# Printable 2v2 matchup chart (docs/matchups.html) from a full sim suite directory of *.jsonl matchup results:
#   python3 tools/muchart.py /tmp/opencode/wsim/full/out_full3
# Each champion card: who they beat (and why), who beats them, best partners; plus a "lost to X? pick Y" table.
# Every image and font is embedded, so the HTML is one self-contained file.
import base64, collections, glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "matchups.html")

ROSTER = ["warlord", "raider", "duelist", "warden", "vintner", "wreckwitch", "engineer",
          "architect", "marksman", "harpooner", "scribe", "summoner", "friar", "rider"]
NAME = {"warlord": "Warlord", "engineer": "Stig", "raider": "Grim", "summoner": "Remnil", "duelist": "Francois",
        "warden": "Thorn", "marksman": "Wren", "friar": "Maddock", "architect": "Hoot", "harpooner": "Tadwick",
        "scribe": "Hollin", "wreckwitch": "Kelp", "vintner": "Hogshead", "rider": "Bramble"}
SHE = {"marksman", "scribe", "wreckwitch", "rider", "summoner"}
# What the champion does to whoever they beat ("X" is the loser's him / her).
EDGE = {
    "warlord": "slams and crushes X up close",
    "engineer": "out-builds X with turrets",
    "raider": "ambushes X from stealth",
    "summoner": "swarms X with hexed minions",
    "duelist": "parries X's hits and crits back",
    "warden": "walls X in and snares X",
    "marksman": "outranges and kites X",
    "friar": "out-heals X's damage",
    "architect": "pelts X from snow forts",
    "harpooner": "skewers X with harpoons",
    "scribe": "zones X out with runes",
    "wreckwitch": "hooks X in and grows",
    "vintner": "plants his feet, out-tanks X",
    "rider": "flies over walls, out-heals X",
}
# Short role line under the name.
ROLE = {
    "warlord": "Brute", "engineer": "Builder", "raider": "Stealth hunter", "summoner": "Necromancer",
    "duelist": "Parry fencer", "warden": "Wall keeper", "marksman": "Longbow", "friar": "Healer",
    "architect": "Snow fort builder", "harpooner": "Harpoon bow", "scribe": "Rune caster",
    "wreckwitch": "Anchor witch", "vintner": "Tank", "rider": "Bee rider / healer",
}
CLASS = {}


def edge(winner, loser):
    she = loser in SHE
    return EDGE[winner].replace("X's", "her" if she else "his").replace("X", "her" if she else "him")


def b64(path, mime):
    with open(path, "rb") as f:
        return f"data:{mime};base64," + base64.b64encode(f.read()).decode()


def tally(d):
    vs = collections.defaultdict(lambda: [0, 0])
    part = collections.defaultdict(lambda: [0, 0])
    hero = collections.defaultdict(lambda: [0, 0])
    for f in glob.glob(os.path.join(d, "*.jsonl")):
        for line in open(f):
            if not line.startswith("{"):
                continue
            r = json.loads(line)
            aw = sum(g["winner"] == 0 for g in r["games"])
            bw = sum(g["winner"] == 1 for g in r["games"])
            for tm, ot, w, lo in ((r["a"], r["b"], aw, bw), (r["b"], r["a"], bw, aw)):
                for h in tm:
                    hero[h][0] += w
                    hero[h][1] += w + lo
                    p = [x for x in tm if x != h][0]
                    part[(h, p)][0] += w
                    part[(h, p)][1] += w + lo
                    for o in ot:
                        vs[(h, o)][0] += w
                        vs[(h, o)][1] += w + lo
    pc = lambda v: round(100 * v[0] / v[1]) if v[1] else 50
    return ({k: pc(v) for k, v in vs.items()}, {k: pc(v) for k, v in part.items()},
            {k: pc(v) for k, v in hero.items()})


def main():
    d = sys.argv[1]
    vs, part, hero = tally(d)
    heroes = json.load(open(os.path.join(ROOT, "data", "heroes.json")))
    hs = heroes.get("heroes", heroes)
    for k in ROSTER:
        CLASS[k] = hs[k].get("class", "bruiser")
    img = {k: b64(os.path.join(ROOT, "assets/ui/portraits", k + ".jpg"), "image/jpeg") for k in ROSTER}
    glyph = {c: b64(os.path.join(ROOT, "assets/ui/glyphs", f"class_{c}.png"), "image/png") for c in set(CLASS.values())}
    parch = b64(os.path.join(ROOT, "assets/textures/ui_parchment.png"), "image/png")
    pirata = b64(os.path.join(ROOT, "assets/fonts/PirataOne.ttf"), "font/ttf")
    barlow = b64(os.path.join(ROOT, "assets/fonts/BarlowSemiCondensed-Bold.ttf"), "font/ttf")

    def chip(k, cls=""):
        return f'<i class="chip p-{k} {cls}"></i>'

    def card(h):
        others = [o for o in ROSTER if o != h]
        # Only real edges: a 50% "win" isn't one (keep at least one row either way).
        beats = sorted(others, key=lambda o: -vs[(h, o)])[:2]
        beats = [o for o in beats if vs[(h, o)] > 50] or beats[:1]
        fears = sorted(others, key=lambda o: vs[(h, o)])[:2]
        fears = [o for o in fears if vs[(h, o)] < 50] or fears[:1]
        pals = sorted(others, key=lambda o: -part[(h, o)])[:2]
        row = lambda o, why, pct, cls: (
            f'<div class="mu {cls}">{chip(o)}<div><b>{NAME[o]}</b> <i>{pct}%</i><span>{why}</span></div></div>')
        return f"""
<section class="card">
  <header>
    <img class="face" src="{img[h]}" alt="">
    <div><h2>{NAME[h]}</h2><small><img class="glyph" src="{glyph[CLASS[h]]}" alt="">{ROLE[h]}</small></div>
  </header>
  <h3 class="good">Beats</h3>
  {''.join(row(o, edge(h, o), vs[(h, o)], "good") for o in beats)}
  <h3 class="bad">Watch out for</h3>
  {''.join(row(o, edge(o, h), vs[(h, o)], "bad") for o in fears)}
  <div class="pals"><h3>Pair with</h3>{''.join(chip(p) + f"<b>{NAME[p]}</b>" for p in pals)}</div>
</section>"""

    def counters():
        rows = []
        for x in ROSTER:
            best = max((y for y in ROSTER if y != x), key=lambda y: vs[(y, x)])
            rows.append(f'<div class="cp">{chip(x)}<b>{NAME[x]}</b><em>&rarr;</em>{chip(best)}<b>{NAME[best]}</b></div>')
        return f"""
<section class="card info">
  <h2>Lost to them?</h2>
  <p class="sub">Pick this next time</p>
  <div class="cps">{''.join(rows)}</div>
</section>"""

    duos = sorted({tuple(sorted((a, b))) for a in ROSTER for b in ROSTER if a != b}, key=lambda p: -part[p])[:5]
    legend = f"""
<section class="card info">
  <h1>Grudge</h1>
  <p class="sub">Who beats who &middot; 2v2</p>
  <ul class="how">
    <li><span class="dot good"></span><b>Beats</b> &mdash; you win this fight most games</li>
    <li><span class="dot bad"></span><b>Watch out for</b> &mdash; they win it; play safe or swap</li>
    <li><b>Pair with</b> &mdash; strongest teammates</li>
    <li><i>63%</i> &mdash; your win rate in that fight</li>
  </ul>
  <h3>Strongest duos</h3>
  {''.join(f'<div class="duo">{chip(a)}{chip(b)}<b>{NAME[a]} + {NAME[b]}</b><i>{part[(a, b)]}%</i></div>' for a, b in duos)}
</section>"""

    cards = [card(h) for h in ROSTER]
    pages = [[legend] + cards[:7], cards[7:] + [counters()]]
    body = "".join(f'<main class="page">{"".join(p)}</main>' for p in pages)
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Grudge - Matchups</title>
<style>
@font-face {{ font-family: Pirata; src: url({pirata}); }}
@font-face {{ font-family: Barlow; src: url({barlow}); font-weight: 700; }}
@page {{ size: letter landscape; margin: 0.3in; }}
* {{ box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
html {{ background: #1b1512; }}
body {{ margin: 0; font: 700 8pt/1.15 Barlow, sans-serif; color: #2a1c12; }}
.page {{ width: 10.4in; height: 7.75in; margin: 0.3in auto; display: grid; gap: 0.12in;
  grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(2, minmax(0, 1fr)); page-break-after: always;
  break-after: page; }}
.page:last-child {{ page-break-after: auto; break-after: auto; }}
@media print {{ html {{ background: none; }} .page {{ margin: 0; }} }}
.card {{ position: relative; display: flex; flex-direction: column; padding: 0.11in 0.12in; border-radius: 6px; overflow: hidden;
  background: radial-gradient(ellipse at 50% 35%, rgba(255,245,215,.55), rgba(120,80,40,.25) 85%),
    url({parch}) 0 0 / 96px; image-rendering: auto;
  border: 2px solid #3a2414; box-shadow: inset 0 0 0 3px #e9d6aa, inset 0 0 0 4px #6b4526, inset 0 0 22px rgba(70,40,15,.45); }}
header {{ display: flex; align-items: center; gap: 0.08in; padding-bottom: 0.05in; margin-bottom: 0.04in;
  border-bottom: 1.5px solid #6b4526; }}
.face {{ width: 0.64in; height: 0.64in; border-radius: 50%; object-fit: cover;
  border: 2.5px solid #2a1c12; box-shadow: 0 0 0 1.5px #c79a4a; }}
h1, h2 {{ font: 400 25pt/0.95 Pirata, serif; margin: 0; color: #1c110a; letter-spacing: .02em; }}
h1 {{ font-size: 40pt; color: #7a1a12; text-align: center; }}
header small {{ display: flex; align-items: center; gap: 3px; font-size: 7.5pt; text-transform: uppercase;
  letter-spacing: .08em; color: #6b4526; }}
.glyph {{ width: 13px; height: 13px; filter: brightness(0) sepia(1) saturate(3) hue-rotate(-20deg) brightness(.45); }}
h3 {{ margin: 0.07in 0 0.02in; font-size: 7.5pt; letter-spacing: .14em; text-transform: uppercase; color: #6b4526; }}
h3.good {{ color: #2f5a1c; }} h3.bad {{ color: #8a1d14; }}
.mu {{ display: flex; align-items: center; gap: 5px; margin: 2px 0; padding: 2px 4px 2px 2px; border-radius: 20px; }}
.mu.good {{ background: rgba(70,120,40,.14); }} .mu.bad {{ background: rgba(150,30,20,.13); }}
.mu {{ margin: 3px 0; padding: 2px 6px 2px 2px; gap: 7px; }}
.mu b {{ font-size: 10.5pt; color: #1c110a; }}
.mu i, .duo i {{ font-style: normal; font-size: 7pt; color: #6b4526; }}
.mu span {{ display: block; font-size: 8pt; color: #3d2a1b; font-weight: 700; opacity: .9; }}
.chip {{ display: inline-block; width: 0.36in; height: 0.36in; border-radius: 50%; background: center / cover; flex: none;
  border: 1.5px solid #2a1c12; }}
{''.join(f".p-{k} {{ background-image: url({img[k]}); }}" for k in ROSTER)}
.mu.good .chip {{ box-shadow: 0 0 0 1.5px #5d8a33; }} .mu.bad .chip {{ box-shadow: 0 0 0 1.5px #b0362a; }}
.pals {{ margin-top: auto; flex: none; display: flex; padding-bottom: 0.02in; align-items: center; gap: 4px;
  border-top: 1.5px solid #6b4526; padding-top: 0.05in; }}
.pals h3 {{ margin: 0 4px 0 0; white-space: nowrap; }} .pals b {{ font-size: 9.5pt; margin-right: 6px; }}
.pals .chip {{ width: 0.3in; height: 0.3in; box-shadow: 0 0 0 1.5px #c79a4a; }}
.info .sub {{ margin: 0 0 0.08in; text-align: center; font: 400 12pt Pirata, serif; color: #6b4526; }}
.info h2 {{ text-align: center; }}
.how {{ list-style: none; padding: 0; margin: 0 0 0.05in; font-size: 8.2pt; }}
.how li {{ margin: 3px 0; display: flex; align-items: center; gap: 4px; }}
.how i {{ font-style: normal; color: #6b4526; }}
.dot {{ width: 9px; height: 9px; border-radius: 50%; flex: none; }}
.dot.good {{ background: #5d8a33; }} .dot.bad {{ background: #b0362a; }}
.duo {{ display: flex; align-items: center; gap: 3px; margin: 2px 0; }}
.duo .chip {{ width: 0.3in; height: 0.3in; }}
.duo .chip + .chip {{ margin-left: -8px; }} .duo b {{ margin-left: 4px; flex: 1; font-size: 9.5pt; }}
.cps {{ display: grid; grid-template-columns: 1fr; gap: 1px; }}
.cp {{ display: grid; grid-template-columns: 0.2in 1fr 0.2in 0.2in 1fr; align-items: center; gap: 4px; font-size: 8.5pt; }}
.cp .chip {{ width: 0.2in; height: 0.2in; }} .cp em {{ font-style: normal; color: #7a1a12; text-align: center; }}
.cp b:last-child {{ color: #2f5a1c; }}
</style></head><body>{body}</body></html>"""
    open(OUT, "w").write(html)
    print(OUT, f"{len(html) // 1024} KB")


main()
