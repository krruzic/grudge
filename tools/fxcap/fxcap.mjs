import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
const hero = process.argv[2] ?? "warden";
const tag = process.argv[3] ?? "cur";
const only = process.argv[4];
const b = await chromium.launch({ executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1148/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
await p.goto(`http://localhost:5199/?bots=1&heroes=${hero},warlord&map=crossing&seed=3&zoom=13`, { waitUntil: "commit" });
await p.waitForFunction(() => window.grudge && !document.getElementById("boot") && grudge.state === "match", null, { timeout: 90000 });
await p.evaluate(() => {
  const g = grudge;
  g.dbg.freeze = true;
  g.hud.show(false);
  const w = g.world;
  g.bots()[0] = null; g.bots()[1] = null;
  g.view.camMode = 1; g.view.setHumans([false, false]);
  g.view.zoomSteps[0] = 8.5;
  for (let i = 0; i < 10; i++) g.view.zoomStep(0, -1);
});
const SPOT = [+(process.env.FX_X ?? 22), +(process.env.FX_Z ?? 38)];
const setup = async (gap) => p.evaluate(([X, Z, gap]) => {
  const w = grudge.world;
  const me = w.heroForPlayer(0), foe = w.heroForPlayer(1);
  w.teleport(me, X, Z); w.teleport(foe, X + gap, Z);
  me.transform.facing = Math.PI / 2; foe.transform.facing = -Math.PI / 2;
  for (const e of [me, foe]) { e.hp = e.maxHp; e.status.stunUntil = 0; e.hero.action = null; e.hero.cooldowns = {}; e.hero.meter = 9999; e.status.invulnUntil = 0; }
  foe.hp = foe.maxHp * 50; foe.maxHp *= 1;
  for (const u of w.entities) if (u.unit && Math.hypot(u.transform.pos.x - X, u.transform.pos.z - Z) < 14) u.alive = false;
  w.zones.length = 0;
}, [...SPOT, gap]);
const step = async (n) => { for (let i = 0; i < n; i++) { await p.evaluate(() => { grudge.dbg.adv = 1 / 30; }); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); } };
const moves = [
  ["A1 PUNCH", { attack: true }, 16, 2, 13],
  ["A2 COMBO", "combo", 22, 2, 13],
  ["B ARM SLAP", { secondary: true, moveX: 1, moveZ: 0 }, 18, 2, 15],
  ["Z BRAMBLES", { super: true }, 64, 8, 22],
  ["R STONE WALL", { special: true }, 22, 3, 15],
  ["R2 WALL CRUMBLES", "crumble", 18, 3, 15],
];
const rows = [];
for (const [name, cmd, frames, every, zoom] of moves) {
  if (only && !name.startsWith(only)) continue;
  await p.evaluate((z) => { grudge.view.cfg.minViewWidth = z; }, zoom);
  if (cmd !== "crumble") {
    await setup(name.startsWith("B") ? 7 : name.startsWith("R") ? 5.5 : 3.2);
    await step(24);
  }
  const shots = [];
  if (cmd === "crumble") {
    await p.evaluate(() => { for (const m of grudge.world.mods) m.until = grudge.world.time + 0.1; });
  } else if (cmd === "combo") {
    await p.evaluate(() => { grudge.dbg.puppet[0] = { moveX: 0, moveZ: 0, attack: true }; });
    await step(9);
    await p.evaluate(() => { grudge.dbg.puppet[0] = { moveX: 0, moveZ: 0, attack: true }; });
  } else if (cmd !== "crumble") await p.evaluate((c) => { grudge.dbg.puppet[0] = { moveX: 0, moveZ: 0, ...c }; }, cmd);
  await step(1);
  await p.evaluate(() => { grudge.dbg.puppet[0] = { moveX: 0, moveZ: 0 }; });
  for (let f = 0; f < frames; f += every) {
    const file = `/tmp/opencode/fxcap/${tag}_${name.split(" ")[0]}_${String(f).padStart(2, "0")}.png`;
    await p.screenshot({ path: file });
    shots.push(file);
    await step(every);
  }
  const row = `/tmp/opencode/fxcap/${tag}_row_${name.split(" ")[0]}.png`;
  execFileSync("magick", [...shots.slice(0, 8).map((f) => [f, "-resize", "300x"]).flat().flatMap((x) => x), "+append", "-gravity", "NorthWest", "-fill", "#ffe890", "-stroke", "#000", "-strokewidth", "1", "-pointsize", "22", "-annotate", "+8+6", name, row]);
  rows.push(row);
}
execFileSync("magick", [...rows, "-append", "-quality", "85", `/tmp/opencode/v/${hero}_${tag}.jpg`]);
console.log(`/tmp/opencode/v/${hero}_${tag}.jpg`);
await b.close();
