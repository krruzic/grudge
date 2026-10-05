// Team economy: gold income (base + owned pads), grain income (outposts), and the catch-up factor that boosts
// the trailing team's income and softens its losses. Recomputed every 15 ticks; income accrues every tick.
import type { World } from "../world.ts";

/** Step phase 2: refresh catch-up/unit counts every 15 ticks, then accrue this tick's gold and grain. */
export function updateEconomy(w: World, dt: number): void {
  const cu = w.data.match.catchUp;
  if (w.tick % 15 === 0) updateCatchUp(w);
  w.teams.forEach((t, team) => {
    if (t.out) return;
    // Holding the relic shrine multiplies gold (not grain) income.
    const tithe = w.arena.heldBy(team) ? w.data.match.arena.relic.incomeMul : 1;
    t.resource += w.incomeOf(team) * (1 + t.catchUp * cu.incomeBoost) * tithe * dt;
    t.grain += w.grainOf(team) * dt;
    // Soldiers eat: upkeep comes out of the grain store (never below zero). With the store empty, outposts can't
    // pay for new soldiers, so an army settles at what the team's buildings can feed - lose buildings (or have
    // your champion down, which halts outposts) and it shrinks as soldiers die and aren't replaced.
    if (t.upkeep) t.grain = Math.max(0, t.grain - t.upkeep * dt);
  });
}

/**
 * catchUp in [0, 1] = the largest lead any standing rival has over this team, measured as (banked gold + grain +
 * structure value) / resourceScale + structure-count difference * structureWeight. Also refreshes unitCount.
 */
function updateCatchUp(w: World): void {
  const cu = w.data.match.catchUp;
  const n = w.teamCount;
  const worth = new Array(n).fill(0);
  const count = new Array(n).fill(0);
  for (const e of w.entities) {
    if (!e.alive || !e.structure || e.structure.type === "core" || e.team >= n) continue;
    const def = w.data.structures.types[e.structure.type];
    worth[e.team] +=
      def.cost + (e.structure.level > 1 ? def.upgradeCost : 0) + (e.structure.level > 2 ? (def.specCost ?? 0) : 0);
    count[e.team]++;
  }
  for (let t = 0; t < n; t++) {
    const me = w.teams[t];
    let deficit = 0;
    for (let o = 0; o < n; o++) {
      if (o === t || !w.standing(o)) continue;
      const them = w.teams[o];
      const lead = them.resource + them.grain + worth[o] - me.resource - me.grain - worth[t];
      const d = lead / cu.resourceScale + (count[o] - count[t]) * cu.structureWeight;
      deficit = Math.max(deficit, d);
    }
    me.catchUp = Math.max(0, Math.min(1, deficit));
  }
  const units = new Array(n).fill(0);
  const eat = new Array(n).fill(0);
  const up = w.data.match.economy.grain?.upkeep;
  for (const e of w.entities) {
    if (!e.alive || !e.unit || e.unit.guard || e.team >= n || e.team < 0) continue;
    units[e.team]++;
    // Summoned / raised soldiers are free.
    if (up && !e.unit.raised && e.expiresAt === undefined) eat[e.team] += up[e.unit.type] ?? 0;
  }
  for (let t = 0; t < n; t++) {
    w.teams[t].unitCount = units[t];
    w.teams[t].upkeep = eat[t];
  }
}

/** Grain per second: base + per-level income of each built pad + a share of outposts' unit upkeep. */
export function grainOf(w: World, team: number): number {
  const g = w.data.match.economy.grain;
  if (!g) return 0;
  let inc = g.base;
  for (const p of w.pads) {
    if (!p.structureId) continue;
    const s = w.get(p.structureId);
    if (!s?.alive || s.team !== team || !s.structure?.ready || s.structure.type === "core") continue;
    inc += (g.perLevel[Math.min(g.perLevel.length, s.structure.level) - 1] ?? 0) * (g.zoneMul?.[p.zone] ?? 1);
    const def = w.data.structures.types[s.structure.type as "barracks"];
    if (g.outpostShare && def?.class === "production" && def.unit) {
      const every = (def.cadence ?? 10) * (s.structure.level > 1 ? (def.upgrade.cadence ?? 1) : 1);
      inc += ((w.data.units.waves.spawnCost[def.unit] ?? 0) / every) * g.outpostShare;
    }
  }
  // Free for all has more pads per house and cheaper soldiers: less grain to go with them.
  return inc * (w.ffaCfg?.grainMul ?? 1);
}

/** Gold per second: base income + per-zone income for each built pad. */
export function incomeOf(w: World, team: number): number {
  const eco = w.data.match.economy;
  let inc = eco.income;
  const per = eco.padIncome;
  if (!per) return inc;
  for (const p of w.pads) {
    if (!p.structureId) continue;
    const s = w.get(p.structureId);
    if (!s?.alive || s.team !== team || !s.structure?.ready) continue;
    inc += per[p.zone] ?? 0;
  }
  return inc;
}
