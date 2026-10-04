import { readFileSync } from "node:fs";
import { World } from "../src/sim/world.ts";
import { Bot } from "../src/sim/bot.ts";

const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const data: any = {
  talents: json("data/talents.json"),
  heroes: json("data/heroes.json"),
  units: json("data/units.json"),
  structures: json("data/structures.json"),
  match: json("data/match.json"),
};
for (const [k, v] of Object.entries(process.env))
  if (k.startsWith("PLAN_")) data.heroes.heroes[k.slice(5)].botPlan = JSON.parse(v!);
for (const [k, v] of Object.entries(process.env))
  if (k.startsWith("PICKS_")) {
    const h = k.slice(6);
    data.heroes.heroes[h].botPlan = { ...(data.heroes.heroes[h].botPlan ?? {}), picks: v!.split("").map(Number) };
  }
const H = ["warlord", "engineer", "raider", "summoner", "duelist", "warden"];
const ROOT = process.env.ROOT ?? "/home/krruzic/Projects/grudge";
const only = process.argv[2] ? process.argv[2].split(",") : null;
const seeds = +(process.argv[3] ?? 2);
const S: Record<string, any> = {};
const st = (h: string) =>
  (S[h] ??= {
    n: 0,
    w: 0,
    d: 0,
    k: 0,
    dth: 0,
    early: 0,
    soldier: 0,
    abil: {} as Record<string, number>,
    vs: {} as Record<string, [number, number]>,
  });
for (let a = 0; a < H.length; a++)
  for (let b = a + 1; b < H.length; b++) {
    if (
      only && only[0].startsWith("pair")
        ? `pair${a}${b}` !== only[0]
        : only && !only.includes(H[a]) && !only.includes(H[b])
    )
      continue;
    for (const map of ["crossing", "ruins", "shoals"])
      for (let sd = 0; sd < seeds; sd++)
        for (const flip of [0, 1]) {
          const types = flip ? [H[b], H[a]] : [H[a], H[b]];
          const w = new World(json(`data/maps/${map}.json`), data, 1000 + sd * 17 + a * 3 + b);
          types.forEach((t, p) => w.spawnHero(t, p, p));
          const bots = [new Bot(0, 0.8, sd * 7 + 1), new Bot(1, 0.8, sd * 7 + 2)];
          const hero = (p: number) => w.heroForPlayer(p)!;
          const em = (w as any).emit.bind(w);
          (w as any).emit = (ev: any) => {
            if (ev.type === "hit" && ev.amount) {
              for (let p = 0; p < 2; p++)
                if (ev.id === hero(p).id) {
                  const s = w.getAny(ev.src);
                  if (s?.unit) st(types[p]).soldier += ev.amount;
                }
            }
            if (ev.type === "act" && ev.phase === "start")
              for (let p = 0; p < 2; p++)
                if (ev.src === hero(p).id) {
                  const ab = st(types[p]).abil;
                  ab[ev.slot] = (ab[ev.slot] ?? 0) + 1;
                }
            return em(ev);
          };
          const was = [false, false];
          while (w.match.phase !== "over" && w.time < 425) {
            w.step(bots.map((bt) => bt.command(w)));
            for (let p = 0; p < 2; p++) {
              const d = !!hero(p).hero!.dead;
              if (d && !was[p]) {
                st(types[p]).dth++;
                if (w.time < 90) st(types[p]).early++;
              }
              was[p] = d;
            }
          }
          for (let p = 0; p < 2; p++) {
            const s = st(types[p]);
            s.n++;
            s.k += w.teams[p].heroKills;
            const won = w.match.winner === p,
              draw = w.match.winner < 0;
            if (won) s.w++;
            if (draw) s.d++;
            const v = (s.vs[types[1 - p]] ??= [0, 0]);
            v[1]++;
            if (won) v[0]++;
          }
        }
  }
if (process.argv[4] === "json") {
  console.log(JSON.stringify(S));
  process.exit(0);
}
for (const h of H) {
  const s = S[h];
  if (!s) continue;
  const n = s.n;
  console.log(
    `${h.padEnd(9)} win ${((100 * s.w) / n).toFixed(0).padStart(3)}%  K/D ${(s.k / n).toFixed(1)}/${(s.dth / n).toFixed(1)}  early deaths ${(s.early / n).toFixed(2)}  soldier dmg taken ${(s.soldier / n).toFixed(0)}  casts ${["a", "b", "r", "z"].map((k) => k + ":" + ((s.abil[k] ?? 0) / n).toFixed(0)).join(" ")}  | ${Object.entries(
      s.vs,
    )
      .map(([o, [x, y]]: any) => o.slice(0, 4) + " " + x + "/" + y)
      .join("  ")}`,
  );
}
