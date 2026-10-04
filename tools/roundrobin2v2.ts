// 2v2 round robin of all hero pairings (sharded: args <shard> <of>), printing JSON results. Env OVR deep-merges a
// JSON override into the game data for what-if balance runs.
import { World } from "../src/sim/world.ts";
import { Bot } from "../src/sim/bot.ts";
import { loadGameData, loadMap } from "./gamedata.ts";

const data: any = loadGameData();
const deepSet = (a: any, b: any) => {
  for (const k in b) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) deepSet((a[k] ??= {}), b[k]);
    else a[k] = b[k];
  }
};
if (process.env.OVR) deepSet(data, JSON.parse(process.env.OVR));
const H = ["warlord", "engineer", "raider", "summoner", "duelist", "warden"];
const teams: [string, string][] = [];
for (let i = 0; i < 6; i++) for (let j = i; j < 6; j++) teams.push([H[i], H[j]]);
const jobs: [number, number, string, number][] = [];
for (let a = 0; a < teams.length; a++)
  for (let b = a + 1; b < teams.length; b++)
    for (const map of ["crossing", "ruins", "shoals"]) for (const flip of [0, 1]) jobs.push([a, b, map, flip]);
const shard = +process.argv[2],
  of = +process.argv[3];
const out: any[] = [];
jobs.forEach(([a, b, map, flip], k) => {
  if (k % of !== shard) return;
  const only = process.env.ONLY;
  if (only && !teams[a].includes(only) && !teams[b].includes(only)) return;
  const A = flip ? teams[b] : teams[a],
    B = flip ? teams[a] : teams[b];
  const w = new World(loadMap(map), data, 500 + k);
  w.spawnHero(A[0], 0, 0);
  w.spawnHero(B[0], 1, 1);
  w.spawnHero(A[1], 2, 0);
  w.spawnHero(B[1], 3, 1);
  const bots = [0, 1, 2, 3].map((i) => new Bot(i, 0.8, k * 4 + i));
  bots[0].mate = 2;
  bots[2].mate = 0;
  bots[1].mate = 3;
  bots[3].mate = 1;
  const types = [A[0], B[0], A[1], B[1]];
  const st = types.map(() => ({ k: 0, d: 0, dh: 0, du: 0, db: 0, dead: 0, taken: 0 }));
  const hid = [0, 1, 2, 3].map((p) => w.heroForPlayer(p)!.id);
  const em = (w as any).emit.bind(w);
  (w as any).emit = (ev: any) => {
    if (ev.type === "hit" && ev.amount) {
      const si = hid.indexOf(ev.src),
        ti = hid.indexOf(ev.id);
      if (si >= 0) {
        const tg = w.getAny(ev.id);
        if (tg?.hero) {
          st[si].dh += ev.amount;
          const sh = w.getAny(ev.src)!.hero!;
          const k =
            "src_" + (sh.action?.kind ?? (sh.riposteUntil && w.time - sh.riposteUntil < 0.1 ? "counter" : "none"));
          (st[si] as any)[k] = ((st[si] as any)[k] ?? 0) + ev.amount;
        } else if (tg?.unit) st[si].du += ev.amount;
        else if (tg?.structure) st[si].db += ev.amount;
      }
      if (ti >= 0) {
        st[ti].taken += ev.amount;
        const sr = w.getAny(ev.src);
        const k =
          "tk_" +
          (sr?.hero
            ? "hero"
            : sr?.unit
              ? "unit"
              : sr?.structure
                ? sr.structure.type === "core"
                  ? "keep"
                  : "tower"
                : "other");
        (st[ti] as any)[k] = ((st[ti] as any)[k] ?? 0) + ev.amount;
      }
    }
    return em(ev);
  };
  const was = [false, false, false, false];
  while (w.match.phase !== "over" && w.time < 425) {
    w.step(bots.map((bt) => bt.command(w)));
    for (let p = 0; p < 4; p++) {
      const h = w.heroForPlayer(p)!;
      const d = !!h.hero!.dead;
      if (d && !was[p]) st[p].d++;
      if (d && w.tick % 30 === 0) st[p].dead++;
      was[p] = d;
    }
  }
  out.push({
    t0: A.join("+"),
    t1: B.join("+"),
    win: w.match.winner,
    len: w.time,
    players: types.map((t, p) => ({ hero: t, team: p % 2, ...st[p] })),
  });
});
console.log(JSON.stringify(out));
