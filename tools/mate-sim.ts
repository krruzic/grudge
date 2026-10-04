import { readFileSync } from "node:fs";
import { World } from "../src/sim/world.ts";
import { Bot } from "../src/sim/bot.ts";
import type { GameData } from "../src/sim/config.ts";
import type { MapData } from "../src/sim/terrain.ts";
import type { Command } from "../src/sim/types.ts";

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const data: GameData = {
  talents: json("data/talents.json"),
  heroes: json("data/heroes.json"),
  units: json("data/units.json"),
  structures: json("data/structures.json"),
  match: json("data/match.json"),
};
const map = json(`data/maps/${opt("map", "crossing")}.json`) as MapData;
const human = opt("human", "bot");
const linked = !args.includes("--unlinked");
const heroes = opt("heroes", "warlord,duelist,warden,raider").split(",");
const n = Number(opt("matches", "6"));
let wins = 0;
for (let seed = 1; seed <= n; seed++) {
  const w = new World(map, data, seed);
  for (let p = 0; p < 4; p++) w.spawnHero(heroes[p], p, p % 2);
  const bots = [0, 1, 2, 3].map((p) => new Bot(p, 0.8, seed * 10 + p));
  if (linked) bots[2].mate = 0;
  const roles: string[] = [];
  let last = "";
  while (w.match.phase !== "over" && w.time < data.match.matchSeconds + data.match.suddenDeathSeconds + 5) {
    const cmds: Command[] = bots.map((b) => b.command(w));
    if (human === "home") {
      const me = w.heroForPlayer(0)!;
      const c = w.core(0)!.transform.pos;
      const t = w.time % 20 < 10 ? { x: c.x + 6, z: c.z + 4 } : { x: c.x + 3, z: c.z - 5 };
      const dx = t.x - me.transform.pos.x,
        dz = t.z - me.transform.pos.z,
        d = Math.hypot(dx, dz) || 1;
      cmds[0] = {
        moveX: d > 1 ? dx / d : 0,
        moveZ: d > 1 ? dz / d : 0,
        attack: w.enemiesNear(me, 2.5).length > 0,
        build: cmds[0].build,
        call: cmds[0].call,
        learn: cmds[0].learn,
      };
    }
    w.step(cmds);
    for (const e of w.events)
      if (e.type === "notice" && e.team === 0 && e.text.includes(":")) roles.push(`${Math.round(w.time)}s ${e.text}`);
    w.events.length = 0;
    if (bots[2].role !== last) {
      last = bots[2].role;
    }
  }
  if (w.match.winner === 0) wins++;
  console.log(
    `seed ${seed} winner ${w.match.winner} ${Math.round(w.time)}s role=${bots[2].role}`,
    roles.slice(0, 8).join(" | "),
  );
}
console.log("team0 wins", wins, "/", n);
