// Unit rock-paper-scissors check: equal-gold armies of two unit types fight on crossing; prints the net result.
import { readFileSync } from "node:fs";
const { World } = await import("../src/sim/world.ts");
const { spawnUnit } = await import("../src/sim/structures.ts");
const R = new URL("..", import.meta.url).pathname;
const json = (p: string) => JSON.parse(readFileSync(R + p, "utf8"));
const data = {
  heroes: json("data/heroes.json"),
  units: json("data/units.json"),
  structures: json("data/structures.json"),
  match: json("data/match.json"),
  talents: json("data/talents.json"),
};
const cost = data.units.waves.spawnCost;
const fight = (a: string, b: string, seed: number) => {
  const w = new World(json("data/maps/crossing.json"), data, seed);
  w.spawnHero("warlord", 0, 0);
  w.spawnHero("warlord", 1, 1);
  for (const p of w.players) {
    const e = w.get(p.heroId)!;
    w.teleport(e, 5 + p.team * 2, 5);
    e.status.invulnUntil = 1e9;
  }
  for (const u of w.entities) if (u.unit) u.alive = false;
  const na = Math.round(132 / cost[a]),
    nb = Math.round(132 / cost[b]);
  for (let i = 0; i < na; i++) spawnUnit(w, 0, a, 40 + (i % 3), 20 + Math.floor(i / 3), 1);
  for (let i = 0; i < nb; i++) spawnUnit(w, 1, b, 52 + (i % 3), 20 + Math.floor(i / 3), 1);
  for (const t of w.teams) t.directives.grunt = t.directives.ranged = t.directives.heavy = "nearest";
  const Z = { moveX: 0, moveZ: 0 };
  for (let k = 0; k < 30 * 40; k++) {
    w.step([Z, Z]);
    w.events.length = 0;
    const ca = w.entities.filter((e) => e.alive && e.unit && e.team === 0).length,
      cb = w.entities.filter((e) => e.alive && e.unit && e.team === 1).length;
    if (!ca || !cb) return ca ? 1 : cb ? -1 : 0;
  }
  return 0;
};
for (const [a, b] of [
  ["grunt", "heavy"],
  ["ranged", "grunt"],
  ["heavy", "ranged"],
]) {
  let s = 0;
  for (let k = 1; k <= 6; k++) s += fight(a, b, k);
  console.log(`${a} vs ${b} (equal gold): net ${s}/6`);
}
