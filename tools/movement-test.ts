import { readFileSync } from "node:fs";
import { World } from "../src/sim/world.ts";
import type { GameData } from "../src/sim/config.ts";
const R = "";
const json = (p: string) => JSON.parse(readFileSync(R + p, "utf8"));
const data: GameData = {
  heroes: json("data/heroes.json"),
  units: json("data/units.json"),
  structures: json("data/structures.json"),
  match: json("data/match.json"),
};
const map = json(`data/maps/${process.env.MAP ?? "crossing"}.json`);
const hero = process.argv[2] ?? "warlord";
const w = new World(map, data, 1);
const e = w.spawnHero(hero, 0, 0);
w.spawnHero("warlord", 1, 1);
const other = w.heroForPlayer(1)!;
w.teleport(other, 1, 1);
let seed = 5;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const trapped: string[] = [];
let stuckEpisodes = 0;
let blocked = 0;
const stuckAt: string[] = [];
for (let trial = 0; trial < 400; trial++) {
  w.match.phase = "play";
  (w as any).time = 10;
  w.match.time = 10;
  let x = 0,
    z = 0;
  for (;;) {
    x = rnd() * w.terrain.width;
    z = rnd() * w.terrain.depth;
    const i = w.nav.index(Math.floor(x), Math.floor(z));
    if (w.nav.open(i)) {
      w.teleport(e, x, z);
      if (w.canStand(e, x, z)) break;
    }
  }
  w.teleport(e, x, z);
  let ang = rnd() * Math.PI * 2;
  let still = 0;
  for (let t = 0; t < 30 * 12; t++) {
    if (t % 45 === 0) ang = rnd() * Math.PI * 2;
    const px = e.transform.pos.x,
      pz = e.transform.pos.z;
    w.step([
      { moveX: Math.sin(ang), moveZ: Math.cos(ang) },
      { moveX: 0, moveZ: 0 },
    ]);
    w.events.length = 0;
    const moved = Math.hypot(e.transform.pos.x - px, e.transform.pos.z - pz);
    if (moved < 0.001) still++;
    else still = 0;
    if (still === 15) {
      let ok = false;
      for (let k = -8; k <= 8 && !ok; k++) {
        const a = ang + (k / 8) * 1.4;
        const sx = e.transform.pos.x,
          sz = e.transform.pos.z,
          sy = e.transform.y;
        w.moveBy(e, Math.sin(a) * 0.2, Math.cos(a) * 0.2);
        if ((e.transform.pos.x - sx) * Math.sin(ang) + (e.transform.pos.z - sz) * Math.cos(ang) > 0.02) ok = true;
        e.transform.pos.x = sx;
        e.transform.pos.z = sz;
        e.transform.y = sy;
      }
      if (ok) {
        blocked++;
        if (blocked < 8)
          console.log(
            "slideable stuck at",
            e.transform.pos.x.toFixed(2),
            e.transform.pos.z.toFixed(2),
            "ang",
            ang.toFixed(2),
            "vel",
            e.hero!.vel.x.toFixed(2),
            e.hero!.vel.z.toFixed(2),
            "action",
            e.hero!.action?.name,
            "stun",
            e.status.stunUntil > w.time,
            "try",
            w.moveBy(e, Math.sin(ang) * 0.2, Math.cos(ang) * 0.2),
          );
      }
    }
    if (still === 20) {
      let canAny = false;
      for (let k = 0; k < 16 && !canAny; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (const d of [0.05, 0.2])
          if (w.canStand(e, e.transform.pos.x + Math.sin(a) * d, e.transform.pos.z + Math.cos(a) * d)) canAny = true;
      }
      if (!canAny) {
        stuckEpisodes++;
        stuckAt.push(`${e.transform.pos.x.toFixed(2)},${e.transform.pos.z.toFixed(2)} y=${e.transform.y.toFixed(2)}`);
        break;
      }
    }
  }
}
console.log(hero, "fully trapped episodes:", stuckEpisodes, "blocked (0.5s no motion while pushing):", blocked);
console.log(stuckAt.slice(0, 15).join("\n"));
