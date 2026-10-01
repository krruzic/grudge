import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:5199";
const SECS = +(process.argv[2] ?? 120);
const ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"];
const b = await chromium.launch({ executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1148/chrome-linux/chrome", args: ARGS });
const mk = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 640, height: 360 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "PAGEERR", e.message));
  await p.goto(BASE + "/?screen=menu&page=network&debug", { waitUntil: "commit" });
  await p.waitForFunction(() => window.grudge && !document.getElementById("boot") && grudge.state === "menu", null, { timeout: 120000 });
  await p.waitForTimeout(400);
  return p;
};
const tap = async (p, k) => { await p.keyboard.down(k); await p.waitForTimeout(120); await p.keyboard.up(k); await p.waitForTimeout(200); };
const host = await mk("host");
await tap(host, "Enter");
await host.waitForFunction(() => grudge.state === "select", null, { timeout: 15000 });
await host.waitForTimeout(500);
const room = (await (await fetch(BASE + "/net/info")).json()).rooms.find((r) => r.phase === "lobby").id;
const peer = await mk("peer");
await tap(peer, "KeyD"); await tap(peer, "Enter");
await peer.waitForFunction(() => grudge.menus.page === "browse" && grudge.menus.rooms.length >= 1, null, { timeout: 15000 });
await peer.evaluate((id) => { grudge.menus.focus = grudge.menus.rooms.findIndex((r) => r.id === id) + 1; }, room);
await tap(peer, "Enter");
await peer.waitForFunction(() => grudge.state === "lobby", null, { timeout: 15000 });
await tap(peer, "KeyW");
await host.waitForTimeout(1500);
const click = async (p, id) => { const h = await p.evaluate((id) => { const x = grudge.cursors.hits.find((k) => k.id === id); return x && { x: (x.x + x.w / 2) * innerWidth / (240 * innerWidth / innerHeight), y: (x.y + x.h / 2) * innerHeight / 240 }; }, id); if (!h) return console.log("nohit", id); await p.mouse.move(h.x, h.y, { steps: 4 }); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(400); };
if (process.env.MODE === "2v2") { await click(host, "mode"); await host.waitForTimeout(800); for (const i of [2, 3]) await click(host, `seatcpu:${i}`); }
await host.evaluate(() => { const g = grudge; const s = g.slots; for (const i of [0]) { s[i].ready = true; g.cursors.placeChip(i, s[i].hero); g.cursors.cursors[i].holding = -1; } });
await host.evaluate(() => { for (const i of [2, 3]) { const sl = grudge.slots[i]; } });
const fill = await host.evaluate(() => JSON.stringify(grudge.slots.map((s) => [s.open, s.cpu, s.ready])));
console.log("slots", fill);
await peer.evaluate(() => { grudge.screens; });
await peer.keyboard.press("KeyE"); await peer.waitForTimeout(300);
await host.evaluate(() => { const g = grudge; g.slots[1].ready = true; });
await host.waitForTimeout(500);
await tap(host, "Enter"); await host.waitForTimeout(800); await tap(host, "Enter");
await peer.waitForFunction(() => grudge.state === "match", null, { timeout: 20000 });
console.log("started");
await host.evaluate(() => {
  const g = grudge; const B = g.Bot;
  const n = g.world.players.length;
  window.__bots = Array.from({ length: n }, (_, i) => (g.bots()[i] ? null : new B(i, 0.9, 77 + i)));
  setInterval(() => { if (g.state !== "match") return; window.__bots.forEach((bt, i) => { if (bt) g.dbg.puppet[i] = bt.command(g.world); }); }, 30);
});
const snap = (p) => p.evaluate(() => {
  const w = grudge.world;
  const r = (v) => Math.round(v * 100) / 100;
  return { tick: w.tick, ents: w.entities.filter((e) => e.alive).map((e) => [e.id, e.kind, r(e.transform.pos.x), r(e.transform.pos.z), r(e.hp)]), gold: w.teams.map((t) => r(t.resource)), mods: w.mods.length, zones: w.zones.length, desync: grudge.net.desync, frames: grudge.net.frames };
});
for (let s = 0; s < SECS; s += 5) {
  await host.waitForTimeout(5000);
  await host.evaluate(() => { grudge.dbg.freeze = true; grudge.dbg.adv = 0; });
  await host.waitForTimeout(400);
  const h = await snap(host);
  await peer.waitForFunction((t) => grudge.world.tick >= t, h.tick, { timeout: 20000 }).catch(() => {});
  const pr = await peer.evaluate(() => grudge.world.tick);
  let note = "";
  if (pr !== h.tick) note = `peer tick ${pr} vs ${h.tick}`;
  else {
    const q = await snap(peer);
    const hm = new Map(h.ents.map((e) => [e[0], e])); const pm = new Map(q.ents.map((e) => [e[0], e]));
    const diffs = [];
    for (const [id, e] of hm) { const o = pm.get(id); if (!o) diffs.push(["missingOnPeer", ...e]); else if (JSON.stringify(o) !== JSON.stringify(e)) diffs.push(["diff", e, o]); }
    for (const [id, e] of pm) if (!hm.has(id)) diffs.push(["extraOnPeer", ...e]);
    note = diffs.length ? `DIFFS ${diffs.length}: ${JSON.stringify(diffs.slice(0, 3))} gold ${h.gold}/${q.gold}` : `ok ents ${h.ents.length} desyncFlag ${q.desync}`;
  }
  console.log(`t=${s + 5}s tick ${h.tick}: ${note}`);
  await host.evaluate(() => { grudge.dbg.freeze = false; });
  if (note.startsWith("DIFFS")) break;
}
await b.close();
