import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const hero = process.argv[2] ?? "warden";
const tag = process.argv[3] ?? "cur";
const only = process.argv[4];
const OUT = process.env.FX_OUT ?? "/tmp/opencode/fxcap";
const SHEET = process.env.FX_SHEET ?? "/tmp/opencode/v";
mkdirSync(OUT, { recursive: true });
const SPOT = [+(process.env.FX_X ?? 44), +(process.env.FX_Z ?? 9)];
const foeHero = hero === "warlord" ? "warden" : "warlord";

const b = await chromium.launch({ executablePath: process.env.CHROME ?? process.env.HOME + "/.cache/ms-playwright/chromium-1148/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
await p.goto(`http://localhost:5199/?bots=1&heroes=${hero},${foeHero}&map=crossing&seed=3&zoom=13`, { waitUntil: "commit" });
await p.waitForFunction(() => window.grudge && !document.getElementById("boot") && grudge.state === "match", null, { timeout: 90000 });
const kit = await p.evaluate(() => {
  const g = grudge;
  g.dbg.freeze = true;
  g.hud.show(false);
  g.bots()[0] = null;
  g.bots()[1] = null;
  g.view.camMode = 1;
  g.view.setHumans([false, false]);
  const w = g.world;
  const ab = w.heroDef(w.heroForPlayer(0).hero.type).abilities;
  return Object.fromEntries(Object.entries(ab).map(([k, a]) => [k, { kind: a.kind, hits: a.hits?.length ?? 0, range: a.range ?? 0 }]));
});

const setup = (gap) => p.evaluate(([X, Z, gap]) => {
  const w = grudge.world;
  const me = w.heroForPlayer(0), foe = w.heroForPlayer(1);
  w.teleport(me, X, Z); w.teleport(foe, X + gap, Z);
  me.transform.facing = Math.PI / 2; foe.transform.facing = -Math.PI / 2;
  for (const e of [me, foe]) { e.alive = true; e.hp = e.maxHp; e.status.stunUntil = 0; e.status.stealthUntil = 0; e.hero.action = null; e.hero.cooldowns = {}; e.hero.meter = 9999; e.status.invulnUntil = 0; }
  foe.hp = foe.maxHp * 50;
  for (const u of w.entities) if (u.unit && Math.hypot(u.transform.pos.x - X, u.transform.pos.z - Z) < 16) u.alive = false;
  w.zones.length = 0;
}, [...SPOT, gap]);
const step = async (n) => { for (let i = 0; i < n; i++) { await p.evaluate(() => { grudge.dbg.adv = 1 / 30; }); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); } };
const press = (c) => p.evaluate((c) => { grudge.dbg.puppet[0] = { moveX: 0, moveZ: 0, ...c }; }, c);

const far = (k) => ["leap", "dash", "hex", "reach", "shoot", "ballista"].includes(k.kind);
const moves = [];
if (kit.a.kind === "combo") {
  moves.push({ name: "A1 HIT", presses: [[0, { attack: true }]], frames: 16, every: 2, gap: 3.2, zoom: 13 });
  moves.push({ name: `A COMBO x${kit.a.hits}`, presses: Array.from({ length: kit.a.hits }, (_, i) => [i * 9, { attack: true }]), frames: kit.a.hits * 9 + 8, every: Math.max(2, Math.round((kit.a.hits * 9 + 8) / 8)), gap: 3.2, zoom: 13 });
} else {
  moves.push({ name: "A SHOT", presses: [[0, { attack: true }]], frames: 24, every: 3, gap: 7, zoom: 16 });
  moves.push({ name: "A x3", presses: [[0, { attack: true }], [9, { attack: true }], [18, { attack: true }]], frames: 40, every: 5, gap: 7, zoom: 16 });
}
for (const [k, btn] of [["b", "secondary"], ["r", "special"], ["z", "super"]]) {
  const a = kit[k];
  const big = ["quake", "zone", "summon", "rally", "warcry", "works", "ballista"].includes(a.kind);
  moves.push({ name: `${k.toUpperCase()} ${a.kind.toUpperCase()}`, presses: [[0, { [btn]: true, moveX: 1, moveZ: 0 }]], frames: big ? 48 : 24, every: big ? 6 : 3, gap: far(a) ? Math.min(7, Math.max(4, (a.range || 6) * 0.75)) : 3.2, zoom: big ? 20 : far(a) ? 16 : 14 });
}
if (hero === "warden") moves.push({ name: "R2 WALL CRUMBLES", crumble: true, presses: [], frames: 18, every: 3, gap: 5.5, zoom: 15 });

const rows = [];
for (const mv of moves) {
  if (only && !mv.name.startsWith(only)) continue;
  await p.evaluate((z) => { grudge.view.cfg.minViewWidth = z; }, mv.zoom);
  if (mv.crumble) await p.evaluate(() => { for (const m of grudge.world.mods) m.until = grudge.world.time + 0.1; });
  else {
    await setup(mv.gap);
    await step(24);
  }
  const shots = [];
  const at = new Map(mv.presses);
  for (let f = 0; f < mv.frames; f++) {
    if (at.has(f)) await press(at.get(f));
    else if (f > 0 && at.has(f - 1)) await press({});
    if (f % mv.every === 0) {
      const file = `${OUT}/${hero}_${tag}_${mv.name.split(" ")[0]}_${String(f).padStart(2, "0")}.png`;
      await p.screenshot({ path: file });
      shots.push(file);
    }
    await step(1);
  }
  const row = `${OUT}/${hero}_${tag}_row_${mv.name.split(" ")[0]}.png`;
  execFileSync("magick", [...shots.slice(0, 8).flatMap((f) => [f, "-resize", "300x"]), "+append", "-gravity", "NorthWest", "-fill", "#ffe890", "-stroke", "#000", "-strokewidth", "1", "-pointsize", "22", "-annotate", "+8+6", mv.name, row]);
  rows.push(row);
}
const out = `${SHEET}/${hero}_${tag}.jpg`;
execFileSync("magick", [...rows, "-append", "-quality", "85", out]);
console.log(out);
await b.close();
