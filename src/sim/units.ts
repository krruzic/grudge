// Unit AI (soldiers spawned by outposts, summons, guards), run per unit in step phase 4. Each tick a unit:
//   1. derives its goal/anchor/leash from the team directive (push, focus, defend, hold, follow; guards hold)
//   2. keeps or re-picks a target (every ~0.4s): the hero's last target when following, else the best-scored
//      visible enemy within aggro range and leash of the anchor; defenders also chase base intruders
//   3. attacks if in range with line of sight, else chases the target or walks to the goal (moveToward)
// The neutral ogre is routed to its own AI (arena/ogre.ts).
import type { World } from "./world.ts";
import type { Directive, Entity, Vec2 } from "./types.ts";
import { updateOgre } from "./arena.ts";

/** Spread units around a point: golden-angle spiral by formation slot. */
function slotOffset(slot: number, base: number): Vec2 {
  const a = slot * 2.39996;
  const r = base + (slot % 5) * 0.55;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

export function updateUnit(w: World, e: Entity): void {
  if (e.neutral) {
    updateOgre(w, e);
    return;
  }
  const u = e.unit!;
  const def = w.data.units.types[u.type];
  const dirs = w.data.match.directives;
  const team = w.teams[e.team];
  const directive = u.guard ? "hold" : team.directives[u.type];
  const hero = w.heroOf(e.team);
  const heroAlive = !!hero && hero.alive;
  u.moving = false;
  const vet = w.data.units.veterancy;
  if (u.rank >= vet.names.length && vet.heroicRegen > 0) w.heal(e, e.maxHp * vet.heroicRegen * w.dt);
  if (w.time < e.status.stunUntil) return;

  const { anchor, leash, goal } = directiveGoal(w, e, directive, hero, heroAlive);
  const laneMarch = directive === "push" && !w.ffa && (team.lane ?? -1) >= 0 && u.lanePassed !== team.laneGen;
  const laneReach = u.range + 1.5;
  let target = u.targetId ? w.get(u.targetId) : undefined;
  if (target && (!target.alive || !w.canSee(e, target))) target = undefined;
  if (target && laneMarch && w.dist(e, target) - target.radius > laneReach + 1) target = undefined;
  const defending = directive === "defend";
  const intruder = (o: Entity) => defending && w.inBase(e.team, o.transform.pos.x, o.transform.pos.z);
  if (
    target &&
    anchor &&
    !intruder(target) &&
    Math.hypot(target.transform.pos.x - anchor.x, target.transform.pos.z - anchor.z) > leash + 2
  )
    target = undefined;

  if (!target || w.time >= u.retargetAt) {
    u.retargetAt = w.time + 0.4 + (e.id % 5) * 0.03;
    let best: Entity | undefined;
    let bestScore = Infinity;
    if (directive === "follow" && heroAlive && hero!.hero!.lastTargetId && w.time - hero!.hero!.lastTargetAt < 3) {
      const ht = w.get(hero!.hero!.lastTargetId);
      if (ht && ht.alive && w.dist(hero!, ht) <= dirs.followEngage) best = ht;
    }
    if (!best) {
      for (const o of w.entities) {
        if (o.team === e.team || !o.alive || !w.canSee(e, o)) continue;
        const d = w.dist(e, o) - o.radius;
        const vision = laneMarch ? Math.min(laneReach, u.aggro * w.rangeMul(e, o)) : u.aggro * w.rangeMul(e, o);
        if (d > vision) continue;
        if (anchor && Math.hypot(o.transform.pos.x - anchor.x, o.transform.pos.z - anchor.z) > leash) continue;
        const vs = def.vs[w.classOf(o)] ?? 1;
        const score = d - vs * 1.5 + (o.structure ? 2 : 0) + (o.id === u.targetId ? -1 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = o;
        }
      }
    }
    if (!best && defending) {
      for (const o of w.entities) {
        if (o.team === e.team || !o.alive || !intruder(o) || !w.canSee(e, o)) continue;
        const d = w.dist(e, o);
        if (d < bestScore) {
          bestScore = d;
          best = o;
        }
      }
    }
    if (!best && directive === "nearest") {
      for (const o of w.entities) {
        if (o.team === e.team || o.kind === "hero" || !o.alive || !w.canSee(e, o)) continue;
        const d = w.dist(e, o);
        if (d < bestScore) {
          bestScore = d;
          best = o;
        }
      }
    }
    target = best;
    u.targetId = target ? target.id : 0;
  }

  if (target) {
    const d = w.dist(e, target) - target.radius - e.radius;
    const range = u.range * w.rangeMul(e, target);
    const clear = !def.projectile || w.los(e, target, def.projectile.losTolerance);
    if (d <= range && clear) {
      w.faceToward(e, target.transform.pos.x - e.transform.pos.x, target.transform.pos.z - e.transform.pos.z, 12);
      if (w.time >= u.nextAttack) {
        u.nextAttack = w.time + u.cooldown;
        u.attackAnimAt = w.time;
        const dmg = u.damage * (def.vs[w.classOf(target)] ?? 1) * w.damageMulOf(e);
        if (def.projectile) {
          w.fireProjectile(e, target, dmg, def.projectile.speed, def.projectile.ballistic, "arrow", 1.2);
          e.status.lastAttackAt = w.time;
        } else {
          w.damage(e, target, dmg, { knockback: u.type === "heavy" ? 3 : 0.6, canMiss: true });
        }
      }
      return;
    }
    moveToward(w, e, { x: target.transform.pos.x, z: target.transform.pos.z }, target.radius + e.radius + range * 0.8);
    return;
  }
  if (goal) {
    if (directive !== "follow" || heroAlive) u.pathGoal = goal;
    const onLane = directive === "push" && !w.ffa && (team.lane ?? -1) >= 0 && u.lanePassed !== team.laneGen;
    moveToward(w, e, goal, directive === "push" && !onLane ? 3 : 0.6);
  }
}

/** Movement goal plus the anchor/leash that limits how far from it the unit will chase targets. */
function directiveGoal(
  w: World,
  e: Entity,
  directive: Directive,
  hero: Entity | undefined,
  heroAlive: boolean,
): { anchor: Vec2 | null; leash: number; goal: Vec2 | null } {
  const u = e.unit!;
  const team = w.teams[e.team];
  const dirs = w.data.match.directives;
  let anchor: Vec2 | null = null;
  let leash = Infinity;
  let goal: Vec2 | null = null;
  if (u.guard) {
    anchor = u.guard;
    leash = u.range + 1.5;
    goal = u.guard;
  } else {
    const focus = directive === "focus" ? w.get(team.directives.focus[u.type]) : undefined;
    if (focus) {
      goal = { x: focus.transform.pos.x, z: focus.transform.pos.z };
      if (!u.targetId || w.dist(e, focus) < u.aggro + 3) u.targetId = focus.id;
    } else if (directive === "push" || directive === "focus") {
      const at = team.attackTeam ?? -1;
      const pick = at >= 0 && w.standing(at) ? w.core(at) : undefined;
      const core = pick?.alive ? pick : w.foeCore(e.team, e.transform.pos.x, e.transform.pos.z);
      if (core) goal = { x: core.transform.pos.x, z: core.transform.pos.z };
      const lane = !w.ffa && (team.lane ?? -1) >= 0 ? w.terrain.lanes[team.lane!] : undefined;
      if (lane && core && u.lanePassed !== team.laneGen) {
        const p = e.transform.pos;
        const toWp = Math.hypot(lane.x - p.x, lane.z - p.z);
        const past =
          Math.hypot(core.transform.pos.x - p.x, core.transform.pos.z - p.z) + 3 <
          Math.hypot(core.transform.pos.x - lane.x, core.transform.pos.z - lane.z);
        if (toWp < 4 || past) u.lanePassed = team.laneGen;
        else goal = { x: lane.x, z: lane.z };
      }
    } else if (directive === "defend") {
      const { post, rank } = w.defendPost(e);
      const off = slotOffset(rank, 0.8);
      anchor = post;
      leash = Math.max(4, u.range + 1);
      goal = { x: post.x + off.x, z: post.z + off.z };
    } else if (directive === "hold") {
      const hp = team.directives.holdPoint[u.type];
      const fo = w.formationOffset(e, hp);
      const off = fo ?? slotOffset(u.slot, 1.0);
      anchor = hp;
      leash = dirs.holdLeash * (fo?.leash ?? 1);
      goal = { x: hp.x + off.x, z: hp.z + off.z };
    } else if (directive === "follow") {
      const rp = w.rallyPoint(e.team);
      if (rp) {
        const fo = w.formationOffset(e, rp);
        const off = fo ?? slotOffset(u.slot, 2.2);
        anchor = rp;
        goal = { x: rp.x + off.x, z: rp.z + off.z };
        leash = dirs.followLeash * (fo?.leash ?? 1);
      } else if (heroAlive) {
        anchor = { x: hero!.transform.pos.x, z: hero!.transform.pos.z };
        const fo = w.formationOffset(e, anchor);
        const off = fo ?? slotOffset(u.slot, 2.2);
        goal = { x: anchor.x + off.x, z: anchor.z + off.z };
        leash = dirs.followLeash * (fo?.leash ?? 1);
      } else {
        goal = u.pathGoal;
        anchor = goal;
        leash = dirs.holdLeash;
      }
    }
  }
  return { anchor, leash, goal };
}

/**
 * Walk toward goal: straight when close and clear, else along a nav path (repathed on a timer or when the goal
 * moves). A unit that makes no progress for ~1s takes a short sideways detour; blocked steps try sliding sideways.
 */
export function moveToward(w: World, e: Entity, goal: Vec2, stopDist: number): void {
  const u = e.unit!;
  const p = e.transform.pos;
  const dist = Math.hypot(goal.x - p.x, goal.z - p.z);
  if (dist <= stopDist) {
    u.path = [];
    return;
  }
  let wp: Vec2 = goal;
  const wide = e.radius > 0.8;
  // Stuck detection: no progress for 0.8-1.2s -> 0.7s detour perpendicular to the goal (side alternates by second).
  if (!u.prog || Math.hypot(p.x - u.prog.x, p.z - u.prog.z) > (wide ? 0.6 : 0.35))
    u.prog = { x: p.x, z: p.z, t: w.time };
  else if (w.time - u.prog.t > (wide ? 0.8 : 1.2) && !(u.detourUntil && w.time < u.detourUntil)) {
    const gx = goal.x - p.x;
    const gz = goal.z - p.z;
    const gl = Math.hypot(gx, gz) || 1;
    const side = Math.floor(w.time) % 2 ? 1 : -1;
    u.detourX = (-gz / gl) * side * 0.9 - (gx / gl) * 0.45;
    u.detourZ = (gx / gl) * side * 0.9 - (gz / gl) * 0.45;
    u.detourUntil = w.time + 0.7;
    u.prog = { x: p.x, z: p.z, t: w.time };
    u.path = [];
    u.repathAt = w.time + 0.7;
  }
  if (u.detourUntil && w.time < u.detourUntil) {
    const sp = u.speed * w.speedMul(e) * w.dt;
    w.moveBy(e, u.detourX! * sp, u.detourZ! * sp);
    u.moving = true;
    w.faceToward(e, u.detourX!, u.detourZ!, 10);
    return;
  }
  const clear = (a: Vec2, b: Vec2) => (wide ? w.nav.wideClear(a, b, e.radius) : w.nav.lineClear(a, b));
  const direct = dist < 10 && clear(p, goal);
  if (!direct) {
    const stale = !u.pathGoal || Math.hypot(u.pathGoal.x - goal.x, u.pathGoal.z - goal.z) > 2 || u.path.length === 0;
    if (w.time >= u.repathAt || (stale && w.time >= u.repathAt - w.data.units.repathSeconds * 0.7)) {
      u.path = w.nav.findPath(p, goal, e.transform.y) ?? [];
      u.lost = !w.nav.lastFound;
      u.repathAt = w.time + w.data.units.repathSeconds + (e.id % 7) * 0.05;
    }
    while (
      u.path.length > 1 &&
      (Math.hypot(u.path[0].x - p.x, u.path[0].z - p.z) < (wide ? 0.6 : 0.25) ||
        (Math.hypot(u.path[0].x - p.x, u.path[0].z - p.z) < 0.8 && clear(p, u.path[1])))
    )
      u.path.shift();
    if (u.path.length) wp = u.path[0];
    if (u.lost && u.path.length <= 1 && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.4) {
      u.moving = false;
      return;
    }
  }
  const dx = wp.x - p.x;
  const dz = wp.z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  const sp = u.speed * w.speedMul(e) * w.dt;
  const step = Math.min(sp, d);
  const moved = w.moveBy(e, (dx / d) * step, (dz / d) * step);
  if (!moved) {
    const side = (e.id + Math.floor(w.time / 1.5)) % 2 ? 1 : -1;
    if (!w.moveBy(e, (-dz / d) * step * side, (dx / d) * step * side))
      w.moveBy(e, (dz / d) * step * side, (-dx / d) * step * side);
    u.repathAt = Math.min(u.repathAt, w.time + 0.3);
  }
  u.moving = true;
  w.faceToward(e, dx, dz, 10);
}
