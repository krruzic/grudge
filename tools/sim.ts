import { readFileSync } from "node:fs";
import { World } from "../src/sim/world.ts";
import { Bot } from "../src/sim/bot.ts";
import type { GameData } from "../src/sim/config.ts";
import type { MapData } from "../src/sim/terrain.ts";

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const matches = Number(opt("matches", "20"));
const heroA = opt("a", "warlord");
const heroB = opt("b", "warlord");
const mapName = opt("map", "crossing");
const verbose = args.includes("--verbose");
const twoVtwo = opt("mode", "1v1") === "2v2";

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const data: GameData = {
  talents: json("data/talents.json"),
  heroes: json("data/heroes.json"),
  units: json("data/units.json"),
  structures: json("data/structures.json"),
  match: json("data/match.json"),
};
const map = json(`data/maps/${mapName}.json`) as MapData;

interface Result {
  winner: number;
  reason: string;
  time: number;
  coreDmg: [number, number];
  heroKills: [number, number];
  structures: [number, number];
  leadAt90: number;
  curve: number[][];
}

function run(seed: number): Result {
  const w = new World(map, data, seed);
  const swap = seed % 2 === 1;
  w.spawnHero(swap ? heroB : heroA, 0, 0);
  w.spawnHero(swap ? heroA : heroB, 1, 1);
  const bots = [new Bot(0, 0.8, seed), new Bot(1, 0.8, seed + 1000)];
  const pa = opt("pickA", "");
  const pb = opt("pickB", "");
  if (pa) bots[0 + (seed % 2 === 1 ? 1 : 0)].picks = pa.split("").map(Number);
  if (pb) bots[1 - (seed % 2 === 1 ? 1 : 0)].picks = pb.split("").map(Number);
  if (twoVtwo) {
    const heroes2 = opt("partners", "commanders") === "heroes";
    w.spawnHero(heroes2 ? (swap ? heroB : heroA) : "herald", 2, 0);
    w.spawnHero(heroes2 ? (swap ? heroA : heroB) : "herald", 3, 1);
    bots.push(new Bot(2, 0.8, seed + 2000), new Bot(3, 0.8, seed + 3000));
  }
  const maxT = data.match.matchSeconds + data.match.suddenDeathSeconds + 5;
  let leadAt90 = -1;
  const curve: number[][] = [];
  while (w.match.phase !== "over" && w.time < maxT) {
    w.step(bots.map((b) => b.command(w)));
    w.events.length = 0;
    if (w.tick % (30 * 30) === 0) {
      const cores = [w.core(0)?.hp ?? 0, w.core(1)?.hp ?? 0];
      curve.push([Math.round(w.time), Math.round(w.teams[0].resource), Math.round(w.teams[1].resource), Math.round(cores[0]), Math.round(cores[1]), w.teams[0].unitCount, w.teams[1].unitCount]);
    }
    if (leadAt90 < 0 && w.time >= 90) {
      const score = (t: number) => w.teams[t].structuresBuilt - w.teams[t].structuresLost + w.teams[t].kills * 0.1 + w.teams[t].heroKills * 0.5;
      leadAt90 = score(0) > score(1) ? 0 : score(1) > score(0) ? 1 : -1;
    }
  }
  const mapWinner = (t: number) => (t < 0 ? -1 : swap ? 1 - t : t);
  const r: Result = {
    winner: mapWinner(w.match.winner),
    reason: w.match.reason,
    time: w.time,
    coreDmg: [w.teams[0].coreDamageDealt, w.teams[1].coreDamageDealt],
    heroKills: [w.teams[0].heroKills, w.teams[1].heroKills],
    structures: [w.teams[0].structuresBuilt, w.teams[1].structuresBuilt],
    leadAt90: mapWinner(leadAt90),
    curve,
  };
  if (verbose) {
    console.log(`lost ${w.teams[0].structuresLost},${w.teams[1].structuresLost} kills ${w.teams[0].kills},${w.teams[1].kills}`);
    console.log(`seed ${seed}: winner ${r.winner} (${r.reason}) t=${r.time.toFixed(0)}s coreDmg ${r.coreDmg.map(Math.round)} heroKills ${r.heroKills} built ${r.structures}`);
    for (const c of curve) console.log("   t,res0,res1,core0,core1,units0,units1", c.join(","));
  }
  return r;
}

const t0 = Date.now();
const results: Result[] = [];
for (let i = 0; i < matches; i++) results.push(run(i + 1));
const wins = [0, 0];
let draws = 0;
let leadConv = 0;
let leads = 0;
const reasons: Record<string, number> = {};
for (const r of results) {
  if (r.winner < 0) draws++;
  else wins[r.winner]++;
  reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  if (r.leadAt90 >= 0) {
    leads++;
    if (r.leadAt90 === r.winner) leadConv++;
  }
}
const avg = (f: (r: Result) => number) => results.reduce((s, r) => s + f(r), 0) / results.length;
const pctA = (wins[0] / Math.max(1, wins[0] + wins[1])) * 100;
console.log(`Matchup ${heroA} vs ${heroB}: ${matches} matches in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  ${heroA} wins ${wins[0]}, ${heroB} wins ${wins[1]}, draws ${draws}  (${pctA.toFixed(0)}% / ${(100 - pctA).toFixed(0)}%)`);
console.log(`  avg length ${avg((r) => r.time).toFixed(0)}s, end reasons ${JSON.stringify(reasons)}`);
console.log(`  avg core damage ${avg((r) => r.coreDmg[0] + r.coreDmg[1]).toFixed(0)}, avg hero kills ${avg((r) => r.heroKills[0] + r.heroKills[1]).toFixed(1)}`);
console.log(`  early lead (t=90s) converted: ${leads ? ((leadConv / leads) * 100).toFixed(0) : "-"}%`);
if (pctA < 40 || pctA > 60) console.log("  FLAG: matchup outside 40-60");
if (leads && leadConv / leads > 0.7) console.log("  FLAG: early lead converts over 70%");
