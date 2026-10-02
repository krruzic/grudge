import { readFileSync } from "node:fs";
import { World } from "../src/sim/world.ts";
import { Bot } from "../src/sim/bot.ts";

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const data: any = { talents: json("data/talents.json"), heroes: json("data/heroes.json"), units: json("data/units.json"), structures: json("data/structures.json"), match: json("data/match.json") };
const H = ["warlord", "engineer", "raider", "summoner", "duelist", "warden"];
const teams: [string, string][] = [];
for (let i = 0; i < 6; i++) for (let j = i; j < 6; j++) teams.push([H[i], H[j]]);
const jobs: [number, number, string, number][] = [];
for (let a = 0; a < teams.length; a++) for (let b = a + 1; b < teams.length; b++) for (const map of ["crossing", "ruins", "shoals"]) for (const flip of [0, 1]) jobs.push([a, b, map, flip]);
const shard = +process.argv[2], of = +process.argv[3];
const out: any[] = [];
jobs.forEach(([a, b, map, flip], k) => {
  if (k % of !== shard) return;
  const A = flip ? teams[b] : teams[a], B = flip ? teams[a] : teams[b];
  const w = new World(json(`data/maps/${map}.json`), data, 500 + k);
  w.spawnHero(A[0], 0, 0); w.spawnHero(B[0], 1, 1); w.spawnHero(A[1], 2, 0); w.spawnHero(B[1], 3, 1);
  const bots = [0, 1, 2, 3].map((i) => new Bot(i, 0.8, k * 4 + i));
  bots[0].mate = 2; bots[2].mate = 0; bots[1].mate = 3; bots[3].mate = 1;
  while (w.match.phase !== "over" && w.time < 425) w.step(bots.map((bt) => bt.command(w)));
  out.push({ t0: A.join("+"), t1: B.join("+"), win: w.match.winner });
});
console.log(JSON.stringify(out));
