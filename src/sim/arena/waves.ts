// Outpost unit waves: production structures spawn a unit every spawnInterval seconds (paid from grain, or gold on
// maps without grain), waves grow stronger over time, and a team's outposts halt while any of its heroes is dead.
// Also respawns FFA keep guards. Unit type mixes consume World.rng.
import type { Arena } from "../arena.ts";
import type { Entity, StructureType, UnitType, Vec2 } from "../types.ts";
import { spawnUnit } from "../structures.ts";

/** Weighted random unit type from a structure's mix (consumes World.rng). */
function pickMix(arena: Arena, mix: Partial<Record<UnitType, number>>): UnitType {
  const keys = Object.keys(mix) as UnitType[];
  const total = keys.reduce((s, k) => s + (mix[k] ?? 0), 0);
  let r = arena.w.rng() * total;
  for (const k of keys) {
    r -= mix[k] ?? 0;
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}

/** FFA: keep each standing team's keep guarded by `count` stationary archers in front of it. */
function updateGuards(arena: Arena): void {
  const w = arena.w;
  const g = w.ffaCfg?.guard;
  if (!g) return;
  for (let team = 0; team < w.teamCount; team++) {
    const core = w.core(team);
    if (!core?.alive || w.teams[team].out) continue;
    const have = w.entities.filter((e) => e.alive && e.unit?.guard && e.team === team).length;
    if (have >= g.count || w.time < (arena.guardAt[team] ?? 0)) continue;
    arena.guardAt[team] = w.time + (have === 0 && w.time < 20 ? 0 : g.respawnSeconds);
    const cx = core.transform.pos.x;
    const cz = core.transform.pos.z;
    const dx = w.terrain.width / 2 - cx;
    const dz = w.terrain.depth / 2 - cz;
    const dl = Math.hypot(dx, dz) || 1;
    const ux = dx / dl;
    const uz = dz / dl;
    const k = have;
    const side = (k - 1) * 3.2;
    const px = cx + ux * 4 - uz * side;
    const pz = cz + uz * 4 + ux * side;
    const u = spawnUnit(w, team, "ranged", px, pz, g.hpMul);
    if (u?.unit) u.unit.guard = { x: u.transform.pos.x, z: u.transform.pos.z };
  }
}

/** Seconds between spawns for a production structure, after level, FFA, relic, sudden death, grave and grain surplus modifiers. */
export function spawnInterval(arena: Arena, o: Entity): number {
  const w = arena.w;
  const st = o.structure!;
  const def = w.data.structures.types[st.type as StructureType];
  const wv = w.data.units.waves;
  let t = (def.cadence ?? 10) * (st.level > 1 ? (def.upgrade.cadence ?? 1) : 1);
  t /= wv.rateMul ?? 1;
  if (w.ffaCfg) t /= w.ffaCfg.spawnRateMul ?? 1;
  if (arena.relic.state === "shrined" && arena.relic.shrineId === o.id) t /= 1 + w.data.match.arena.relic.outpostExtra;
  t /= 1 + (w.data.match.suddenDeath.productionMul - 1) * w.surge();
  if (st.graveUntil && w.time < st.graveUntil) t *= st.graveMul ?? 1;
  const g = w.data.match.economy.grain;
  if (g?.surplus !== undefined && w.teams[o.team].grain >= g.surplus) t *= g.surplusMul ?? 0.7;
  return t;
}

/** A unit died: push back its outpost's next spawn by lossDelay (capped). */
export function unitLost(arena: Arena, u: Entity): void {
  const w = arena.w;
  const from = u.unit?.from ? w.get(u.unit.from) : undefined;
  const st = from?.structure;
  if (!from?.alive || !st || st.spawnAt === undefined) return;
  const wv = w.data.units.waves;
  const every = arena.spawnInterval(from);
  st.spawnAt = Math.min(Math.max(st.spawnAt, w.time) + (wv.lossDelay ?? 0), w.time + every * (wv.lossDelayCap ?? 2));
}

export function updateWaves(arena: Arena): void {
  const w = arena.w;
  const wv = w.data.units.waves;
  if (w.time >= arena.nextWave) {
    arena.nextWave = w.time + (w.ffaCfg?.waveSeconds ?? wv.everySeconds);
    updateGuards(arena);
  }
  const grow = 1 + wv.growPerMinute * (w.time / 60);
  const rc = w.data.match.arena.relic;
  const down = new Set<number>();
  for (const pl of w.players) {
    const h = w.getAny(pl.heroId);
    if (h?.hero && (!h.alive || h.hero.dead)) down.add(pl.team);
  }
  for (let t = 0; t < w.teamCount; t++) {
    const ts = w.teams[t];
    if (down.has(t)) {
      if (!ts.spawnHalt) {
        ts.spawnHalt = true;
        w.emit({ type: "notice", team: t, text: "HERO DOWN · OUTPOSTS HALT" });
      }
    } else if (ts.spawnHalt) {
      ts.spawnHalt = false;
      for (const o of w.entities)
        if (o.alive && o.team === t && o.structure?.spawnAt !== undefined)
          o.structure.spawnAt = w.time + arena.spawnInterval(o);
    }
  }
  const grainy = !!w.data.match.economy.grain;
  for (const o of w.entities) {
    const st = o.structure;
    if (!o.alive || !st?.ready || st.type === "core") continue;
    const def = w.data.structures.types[st.type];
    if (def.class !== "production" || !def.unit) continue;
    const ts = w.teams[o.team];
    if (ts.out || ts.spawnHalt) continue;
    if (st.spawnAt === undefined) {
      st.spawnAt = w.time + Math.min(wv.firstSeconds, arena.spawnInterval(o));
      continue;
    }
    if (w.time < st.spawnAt) continue;
    if (ts.unitCount >= w.popCap) {
      st.spawnAt = w.time + 0.5;
      continue;
    }
    const type = def.mix ? pickMix(arena, def.mix) : def.unit;
    const cost = Math.round(
      (wv.spawnCost[type] ?? 0) *
        w.costMul() *
        (w.ffaCfg?.spawnCostMul ?? 1) *
        (1 - ts.catchUp * w.data.match.catchUp.productionBoost),
    );
    if ((grainy ? ts.grain : ts.resource) < cost) {
      st.spawnAt = w.time + 0.5;
      if (w.time - (ts.idleAt ?? -99) > 10) {
        ts.idleAt = w.time;
        w.emit({
          type: "notice",
          team: o.team,
          text: grainy ? "NO GRAIN · OUTPOSTS IDLE" : "NO GOLD · OUTPOSTS IDLE",
        });
      }
      continue;
    }
    if (grainy) ts.grain -= cost;
    else ts.resource -= cost;
    const up = st.level > 1 ? (def.upgrade.unitStat ?? 1) : 1;
    const blessed = arena.relic.state === "shrined" && arena.relic.shrineId === o.id;
    st.spawnN = (st.spawnN ?? 0) + 1;
    const p = frontOf(arena, o, o.team, st.spawnN);
    const u = spawnUnit(w, o.team, type, p.x, p.z, grow * up * (blessed ? rc.outpostStatMul : 1));
    if (u?.unit) u.unit.from = o.id;
    if (u?.unit && st.graveRank && st.graveUntil && w.time < st.graveUntil) {
      const vet = w.data.units.veterancy;
      w.promote(u, vet.killsForRank[Math.min(vet.killsForRank.length, st.graveRank) - 1]);
    }
    if (st.burst) {
      st.burst--;
      st.spawnAt = w.time + (w.data.match.economy.muster?.every ?? 0.6);
    } else st.spawnAt = w.time + arena.spawnInterval(o);
  }
}

/** Spawn spot in front of a structure, facing the nearest enemy core; consecutive spawns fan out sideways. */
function frontOf(arena: Arena, from: Entity, team: number, i: number): Vec2 {
  const w = arena.w;
  const enemy = w.foeCore(team, from.transform.pos.x, from.transform.pos.z);
  const dx = (enemy?.transform.pos.x ?? w.terrain.width / 2) - from.transform.pos.x;
  const dz = (enemy?.transform.pos.z ?? w.terrain.depth / 2) - from.transform.pos.z;
  const dl = Math.hypot(dx, dz) || 1;
  const out = from.radius + 1.6;
  const side = ((i % 3) - 1) * 0.9;
  return {
    x: from.transform.pos.x + (dx / dl) * out - (dz / dl) * side,
    z: from.transform.pos.z + (dz / dl) * out + (dx / dl) * side,
  };
}
