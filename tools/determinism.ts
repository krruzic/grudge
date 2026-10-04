// Determinism check: runs a few fixed bot matches headless and prints the final world hash of each.
// Refactors must not change these hashes (lockstep netplay depends on identical sim results).
// Usage: npm run determinism            (prints hashes)
//        npm run determinism -- --check (compares against tools/determinism.baseline.json)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { World } from "../src/sim/world.ts";
import { Bot } from "../src/sim/bot.ts";
import { worldHash } from "../src/net/session.ts";

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const data: any = {
  talents: json("data/talents.json"),
  heroes: json("data/heroes.json"),
  units: json("data/units.json"),
  structures: json("data/structures.json"),
  match: json("data/match.json"),
};

const CASES: { map: string; heroes: string[]; seed: number; seconds: number }[] = [
  { map: "crossing", heroes: ["warlord", "marksman"], seed: 11, seconds: 120 },
  { map: "ruins", heroes: ["friar", "raider"], seed: 23, seconds: 120 },
  { map: "shoals", heroes: ["summoner", "engineer"], seed: 37, seconds: 90 },
  { map: "crossing", heroes: ["duelist", "warden"], seed: 41, seconds: 90 },
];

const out: Record<string, number> = {};
for (const c of CASES) {
  const w = new World(json(`data/maps/${c.map}.json`), data, c.seed);
  c.heroes.forEach((h, p) => w.spawnHero(h, p, p));
  const bots = c.heroes.map((_, p) => new Bot(p, 0.8, c.seed * 7 + p));
  while (w.match.phase !== "over" && w.time < c.seconds) w.step(bots.map((b) => b.command(w)));
  out[`${c.map}:${c.heroes.join("-")}:${c.seed}`] = worldHash(w);
}

const file = "tools/determinism.baseline.json";
if (process.argv.includes("--check")) {
  const base = existsSync(file) ? json(file) : {};
  let bad = 0;
  for (const [k, v] of Object.entries(out)) {
    const ok = base[k] === v;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "DIFF"} ${k} ${v}${ok ? "" : ` (baseline ${base[k]})`}`);
  }
  process.exit(bad ? 1 : 0);
}
if (process.argv.includes("--write")) writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
