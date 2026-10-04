// Match flow: regular time -> sudden death -> tiebreak, unit directives issued by heroes, training mode and the
// automatic talent pick.
import type { World } from "../world.ts";
import type { Directive, Entity, TeamState, UnitType } from "../types.ts";
import { UNIT_TYPES } from "../types.ts";
import { learn, learned as learnedOf, options } from "../talents.ts";
import { defaultHold } from "./bases.ts";

/**
 * Phase transitions. After matchLength the match enters sudden death; when that also runs out the standing teams
 * are compared by core damage dealt, then fewest structures lost, then hero kills. Also clamps core wards.
 */
export function updateMatch(w: World): void {
  const m = w.data.match;
  if (!w.training && w.match.phase === "play" && w.time >= w.matchLength) {
    w.match.phase = "sudden";
    w.emit({ type: "notice", team: -1, text: "SUDDEN DEATH" });
  }
  if (!w.training && w.match.phase === "sudden" && w.time >= w.matchLength + m.suddenDeathSeconds) {
    const keys: [(t: TeamState) => number, string][] = [
      [(t) => Math.round(t.coreDamageDealt), "core damage"],
      [(t) => -t.structuresLost, "structures destroyed"],
      [(t) => t.heroKills, "hero kills"],
    ];
    let pool = w.teams.map((_, i) => i).filter((i) => w.standing(i));
    let reason = "dead even";
    for (const [key, why] of keys) {
      const top = Math.max(...pool.map((i) => key(w.teams[i])));
      const next = pool.filter((i) => key(w.teams[i]) === top);
      if (next.length < pool.length) reason = why;
      pool = next;
      if (pool.length === 1) break;
    }
    w.endMatch(pool.length === 1 ? pool[0] : -1, pool.length === 1 ? reason : "dead even");
  }
  // The ward cap depends on player count, so clamp every tick; a core is "shielded" while it has ward left.
  for (let team = 0; team < w.teamCount; team++) {
    const core = w.core(team);
    if (!core?.structure) continue;
    if ((core.structure.ward ?? 0) > w.wardMax) core.structure.ward = w.wardMax;
    core.structure.shielded = (core.structure.ward ?? 0) > 0;
  }
}

export function endMatch(w: World, winner: number, reason: string): void {
  if (w.match.phase === "over") return;
  w.match.phase = "over";
  w.match.winner = winner;
  w.match.reason = reason;
}

/**
 * Set a unit directive (push/hold/defend/focus) for one or all unit types. Re-issuing "push" cycles the target:
 * FFA -> next rival house (then nearest keep), lane maps -> next lane (then any lane). "focus" targets the enemy
 * structure nearest the issuing hero and is ignored if there is none. Affected units drop their path and target.
 */
export function setDirective(w: World, team: number, type: UnitType | "all", dir: Directive, hero: Entity): void {
  const d = w.teams[team].directives;
  const types = type === "all" ? UNIT_TYPES : [type];
  if (w.ffa && dir === "push" && hero.hero) {
    const ts = w.teams[team];
    const already = types.every((t) => d[t] === "push");
    const rivals = w.teams.map((_, i) => i).filter((i) => i !== team && w.standing(i));
    if (already) {
      const cur = ts.attackTeam ?? -1;
      const at = cur < 0 ? -1 : rivals.indexOf(cur);
      ts.attackTeam = at + 1 < rivals.length ? rivals[at + 1] : -1;
    } else ts.attackTeam = -1;
    w.emit({
      type: "notice",
      team,
      text:
        ts.attackTeam !== undefined && ts.attackTeam >= 0
          ? `ATTACK · ${w.teamName(ts.attackTeam)} HOUSE`
          : "ATTACK · NEAREST KEEP",
    });
  } else if (dir === "push" && hero.hero && w.terrain.lanes.length) {
    const ts = w.teams[team];
    const already = types.every((t) => d[t] === "push");
    const n = w.terrain.lanes.length;
    const cur = ts.lane ?? -1;
    ts.lane = already ? (cur + 1 < n ? cur + 1 : -1) : -1;
    ts.laneGen = (ts.laneGen ?? 0) + 1;
    w.emit({
      type: "notice",
      team,
      text: ts.lane >= 0 ? `ATTACK · ${w.terrain.lanes[ts.lane].name} LANE` : "ATTACK · ANY LANE",
    });
  }
  let focusId = 0;
  if (dir === "focus") {
    let best = Infinity;
    for (const o of w.entities) {
      if (!o.alive || o.team === team || !o.structure) continue;
      const dd = w.dist(hero, o);
      if (dd < best) {
        best = dd;
        focusId = o.id;
      }
    }
    if (!focusId) return;
  }
  for (const t of types) {
    d[t] = dir;
    if (dir === "hold") d.holdPoint[t] = w.rallyPoint(team) ?? { x: hero.transform.pos.x, z: hero.transform.pos.z };
    if (dir === "defend") d.holdPoint[t] = defaultHold(w, team);
    if (dir === "focus") d.focus[t] = focusId;
  }
  for (const u of w.entities) {
    if (u.unit && u.team === team && types.includes(u.unit.type)) {
      u.unit.repathAt = 0;
      u.unit.retargetAt = 0;
      u.unit.targetId = 0;
    }
  }
  w.emit({ type: "directive", team, unitType: type, dir });
}

/** Training mode: no match clock, enemy heroes/cores become self-healing dummies, team 0 has unlimited funds. */
export function makeTraining(w: World): void {
  w.training = true;
  w.match.time = 0;
  for (const p of w.players)
    if (p.team !== 0) {
      const d = w.getAny(p.heroId);
      if (d) d.dummy = true;
    }
  for (let t = 1; t < w.teamCount; t++) {
    const c = w.core(t);
    if (c) c.dummy = true;
  }
  w.mapEvents.endLockdown(false);
}

export function trainingStep(w: World): void {
  const t = w.teams[0];
  t.resource = Math.max(t.resource, 9999);
  t.grain = Math.max(t.grain, 9999);
  for (const e of w.entities) {
    if (!e.dummy || !e.alive) continue;
    // Dummies regenerate 60% max hp per second after 3s without being hit.
    if (w.time - (e.dummyHitAt ?? -99) > 3 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * w.dt * 0.6);
  }
}

/**
 * Pending talent picks auto-resolve after autoPickSeconds: prefer an option that synergises with an owned talent,
 * else a random one (consumes RNG).
 */
export function autoPick(w: World, e: Entity): void {
  const h = e.hero!;
  if (!h.picks.length) {
    h.pickSince = undefined;
    return;
  }
  if (h.pickSince === undefined) {
    h.pickSince = w.time;
    return;
  }
  if (w.time - h.pickSince < w.autoPickSeconds) return;
  const opt = options(w, e);
  h.pickSince = w.time;
  if (!opt) return;
  const owned = new Set((["r", "b", "a", "z"] as const).flatMap((sl) => learnedOf(w, e, sl).map((t) => t.id)));
  const syn = opt.list.findIndex((o) => (o.with ?? []).some((q) => owned.has(q.id)));
  learn(w, e, syn >= 0 ? syn : Math.floor(w.rng() * opt.list.length) % opt.list.length);
}
