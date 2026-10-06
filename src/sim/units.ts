// Unit AI (soldiers spawned by outposts, summons, guards), run per unit in step phase 4. Each tick a unit:
//   1. derives its goal/anchor/leash from the team directive (push, focus, defend, hold, follow; guards hold)
//   2. keeps or re-picks a target (every ~0.4s): the hero's last target when following, else the best-scored
//      visible enemy within aggro range and leash of the anchor; defenders also chase base intruders
//   3. attacks if in range with line of sight, else chases the target or walks to the goal (moveToward)
// Squad tactics on top (all armies, ordered by a human or a CPU):
//   - target spreading: a target already taken by several of its friends scores worse, so a group splits its
//     attention over the enemies in reach instead of all piling onto one (towers and champions tolerate more)
//   - archers kite: an archer with an enemy melee soldier or champion in its face steps back toward its friends
//     before shooting again
//   - packs: a marching soldier that has got ahead of its friends (none within 5 m, some behind within 25 m)
//     waits for them, so a push arrives as packs rather than a trickle
//   - flanking: in a push of 8+ soldiers with no lane ordered, every third one takes another lane, so the enemy
//     has to answer two groups
//   - screen (GUARD order, or following a ranged champion): melee soldiers stand a few metres toward the nearest
//     threat, in front of their champion; on GUARD the archers keep just behind them
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
  // Team deathmatch summons follow their own summoner (there are four champions per house).
  const owner = w.tdm && e.owner !== undefined ? w.getAny(e.owner) : undefined;
  const hero = owner?.hero ? owner : w.heroOf(e.team);
  const heroAlive = !!hero && hero.alive;
  u.moving = false;
  const vet = w.data.units.veterancy;
  if (u.rank >= vet.names.length && vet.heroicRegen > 0) w.heal(e, e.maxHp * vet.heroicRegen * w.dt);
  if (w.time < e.status.stunUntil) return;
  const takers = targetCounts(w, e.team);

  const { anchor, leash, goal } = directiveGoal(w, e, directive, hero, heroAlive);
  const laneMarch = directive === "push" && !w.ffa && (team.lane ?? -1) >= 0 && u.lanePassed !== team.laneGen;
  const laneReach = u.range + 1.5;
  let target = u.targetId ? w.get(u.targetId) : undefined;
  if (target && (!target.alive || !w.canSee(e, target))) target = undefined;
  if (target && laneMarch && w.dist(e, target) - target.radius > laneReach + 1) target = undefined;
  const defending = directive === "defend";
  const intruder = (o: Entity) => defending && w.inBase(e.team, o.transform.pos.x, o.transform.pos.z);
  // Fighting retreat: whatever is hitting this soldier (or is right in its face) gets fought back, whatever the
  // orders and leash say.
  const harasser = (o: Entity) =>
    (e.status.hurtBy === o.id && w.time - (e.status.hurtAt ?? -99) < 2) || w.dist(e, o) - o.radius <= u.range + 0.5;
  if (
    target &&
    anchor &&
    !intruder(target) &&
    !harasser(target) &&
    Math.hypot(target.transform.pos.x - anchor.x, target.transform.pos.z - anchor.z) > leash + 2
  )
    target = undefined;

  // Called back to defend: a champion (or soldier) hitting one of our buildings gets the nearest few soldiers,
  // wherever they were (see assignDefense).
  const guardId = u.guard ? 0 : defenderTarget(w, e);
  const callTarget = guardId ? w.get(guardId) : undefined;
  if (callTarget?.alive && w.canSee(e, callTarget)) {
    target = callTarget;
    u.targetId = callTarget.id;
  } else if (!target || w.time >= u.retargetAt) {
    u.retargetAt = w.time + 0.4 + (e.id % 5) * 0.03;
    let best: Entity | undefined;
    let bestScore = Infinity;
    if (
      (directive === "follow" || directive === "screen") &&
      heroAlive &&
      hero!.hero!.lastTargetId &&
      w.time - hero!.hero!.lastTargetAt < 3
    ) {
      const ht = w.get(hero!.hero!.lastTargetId);
      if (ht && ht.alive && w.dist(hero!, ht) <= dirs.followEngage) best = ht;
    }
    if (!best) {
      for (const o of w.entities) {
        if (o.team === e.team || !o.alive || !w.canSee(e, o)) continue;
        const d = w.dist(e, o) - o.radius;
        const vision = laneMarch ? Math.min(laneReach, u.aggro * w.rangeMul(e, o)) : u.aggro * w.rangeMul(e, o);
        if (d > vision) continue;
        if (anchor && !harasser(o) && Math.hypot(o.transform.pos.x - anchor.x, o.transform.pos.z - anchor.z) > leash)
          continue;
        const vs = def.vs[w.classOf(o)] ?? 1;
        let score = d - vs * 1.5 + (o.structure ? 2 : 0) + (o.id === u.targetId ? -1 : 0);
        // Target spreading: friends already on it (beyond what it takes) push this soldier elsewhere.
        const on = takers.get(o.id) ?? 0;
        const room = o.structure ? 6 : o.hero ? 4 : 2;
        if (on > room && o.id !== u.targetId) score += (on - room) * 1.2;
        if (o.hero) {
          // Finish off a hurt champion, and punish one that's hitting our buildings.
          score -= (1 - o.hp / o.maxHp) * 6;
          if (raiding(w, o, e.team)) score -= 3;
        }
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

  // Archers kite: a melee enemy in its face - step back toward friends (or away from it), then shoot again.
  if (def.projectile && w.time >= (u.waitUntil ?? 0)) {
    const near = w.enemiesNear(e, 2.2, (o) => (!!o.unit && o.unit.type !== "ranged") || (!!o.hero && !o.hero.dead));
    if (near.length && w.time < u.nextAttack) {
      const o = near[0];
      const ax = e.transform.pos.x - o.transform.pos.x;
      const az = e.transform.pos.z - o.transform.pos.z;
      const al = Math.hypot(ax, az) || 1;
      moveToward(w, e, { x: e.transform.pos.x + (ax / al) * 2.5, z: e.transform.pos.z + (az / al) * 2.5 }, 0.3);
      return;
    }
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
  // Ahead of the pack: wait for friends (re-checked each tick; one wait lasts at most 4 s, then it goes anyway).
  const freshWait = u.waitUntil === undefined || w.time > u.waitUntil + 1;
  if (goal && directive === "push" && (freshWait || w.time - (u.waitSince ?? 0) < 4) && packAhead(w, e)) {
    if (freshWait) u.waitSince = w.time;
    u.waitUntil = w.time + 0.6;
    return;
  }
  if (goal) {
    if ((directive !== "follow" && directive !== "screen") || heroAlive) u.pathGoal = goal;
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
  } else if (w.tdm) {
    // Team deathmatch has no keeps to push: summoned soldiers hunt the nearest enemy champion (within 30 m of
    // their own champion), else stay at their champion's side.
    const near = hero && heroAlive ? hero : e;
    let bd = 30;
    for (const o of w.entities) {
      if (!o.alive || !o.hero || o.hero.dead || o.team === e.team || o.team < 0) continue;
      const d = w.dist(near, o);
      if (d < bd) {
        bd = d;
        goal = { x: o.transform.pos.x, z: o.transform.pos.z };
      }
    }
    if (!goal && heroAlive) {
      const off = slotOffset(u.slot, 2.2);
      goal = { x: hero!.transform.pos.x + off.x, z: hero!.transform.pos.z + off.z };
    }
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
      // Flanking: a big push with no lane ordered sends every third soldier down another lane.
      const lanes = w.terrain.lanes;
      if (!w.ffa && (team.lane ?? -1) < 0 && lanes.length >= 2 && core && !u.flankPassed) {
        if (team.unitCount >= 8 && u.slot % 3 === 0) {
          if (u.flankLane === undefined) {
            const p = e.transform.pos;
            // The lane farthest from the one it's nearest to: the far side of the map from the main body.
            const near = lanes.reduce(
              (b, l, i) => (Math.hypot(l.x - p.x, l.z - p.z) < Math.hypot(lanes[b].x - p.x, lanes[b].z - p.z) ? i : b),
              0,
            );
            u.flankLane = lanes.reduce(
              (b, l, i) =>
                Math.hypot(l.x - lanes[near].x, l.z - lanes[near].z) >
                Math.hypot(lanes[b].x - lanes[near].x, lanes[b].z - lanes[near].z)
                  ? i
                  : b,
              0,
            );
          }
          const fl = lanes[u.flankLane];
          if (Math.hypot(fl.x - e.transform.pos.x, fl.z - e.transform.pos.z) < 4) u.flankPassed = true;
          else goal = { x: fl.x, z: fl.z };
        }
      }
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
    } else if (directive === "defend" && attackedBuilding(w, e.team)) {
      // Defend goes to whichever of our buildings is being hit, and fights around it.
      const s = attackedBuilding(w, e.team)!;
      const off = slotOffset(u.slot, 1.6);
      anchor = { x: s.transform.pos.x, z: s.transform.pos.z };
      leash = 11;
      goal = { x: anchor.x + off.x, z: anchor.z + off.z };
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
    } else if (directive === "follow" || directive === "screen") {
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
        // Screen (the GUARD order, or following a ranged champion): melee soldiers stand 3.5 m toward the nearest
        // threat, in front of their champion; on GUARD the archers stay 1.5 m behind them.
        const ranged = (w.heroDef(hero!.hero!.type).botRange ?? 1.8) > 3;
        if (!fo && (directive === "screen" || (ranged && u.type !== "ranged"))) {
          const th = nearestThreat(w, hero!);
          if (th) {
            const tx = th.x - anchor.x;
            const tz = th.z - anchor.z;
            const tl = Math.hypot(tx, tz) || 1;
            const k = u.type === "ranged" ? -1.5 : 3.5;
            goal = { x: goal.x + (tx / tl) * k, z: goal.z + (tz / tl) * k };
          }
        }
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
  const sp = u.speed * w.speedMul(e) * w.marchMul(e.team) * w.dt;
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

/** `o` hit one of `team`'s buildings in the last 2.5 s. */
function raiding(w: World, o: Entity, team: number): boolean {
  for (const s of w.entities)
    if (
      s.alive &&
      s.structure &&
      s.team === team &&
      s.status.hurtBy === o.id &&
      w.time - (s.status.hurtAt ?? -99) < 2.5
    )
      return true;
  return false;
}

/**
 * Defense call-ups, computed once per tick per world: every building attacked in the last 2.5 s by a living enemy
 * calls its nearest soldiers (within 40 m) onto the attacker - 3 for a tower, 6 for the keep, more if the attacker
 * is a champion low on health (they smell blood). Returns the attacker this soldier was called onto, or 0.
 */
function defenderTarget(w: World, e: Entity): number {
  const D = w.defense;
  if (D.tick !== w.tick) {
    D.tick = w.tick;
    D.of.clear();
    for (const s of w.entities) {
      if (!s.alive || !s.structure || (s.structure.padIndex < 0 && s.structure.type !== "core")) continue;
      if (w.time - (s.status.hurtAt ?? -99) > 2.5) continue;
      const foe = s.status.hurtBy !== undefined ? w.get(s.status.hurtBy) : undefined;
      if (!foe?.alive || foe.team === s.team || foe.structure) continue;
      let n = s.structure.type === "core" ? 6 : 3;
      if (foe.hero && foe.hp < foe.maxHp * 0.4) n += 2;
      const near = w.entities
        .filter(
          (u) =>
            u.alive &&
            u.unit &&
            !u.unit.guard &&
            u.team === s.team &&
            !D.of.has(u.id) &&
            Math.hypot(u.transform.pos.x - s.transform.pos.x, u.transform.pos.z - s.transform.pos.z) < 40,
        )
        .sort((a, b) => w.dist(a, s) - w.dist(b, s) || a.id - b.id)
        .slice(0, n);
      for (const u of near) D.of.set(u.id, foe.id);
    }
  }
  return D.of.get(e.id) ?? 0;
}

/** The team's building (keep or pad structure) hit most recently by an enemy in the last 4 s, if any. */
function attackedBuilding(w: World, team: number): Entity | undefined {
  let best: Entity | undefined;
  let at = -Infinity;
  for (const s of w.entities) {
    if (!s.alive || !s.structure || s.team !== team) continue;
    if (s.structure.padIndex < 0 && s.structure.type !== "core") continue;
    const t = s.status.hurtAt ?? -99;
    if (w.time - t > 4 || t <= at) continue;
    const foe = s.status.hurtBy !== undefined ? w.get(s.status.hurtBy) : undefined;
    if (!foe?.alive || foe.team === team) continue;
    at = t;
    best = s;
  }
  return best;
}

/** How many of `team`'s soldiers are on each target this tick (target spreading), built once per tick. */
const takerCache = new WeakMap<World, { tick: number; by: Map<number, number>[] }>();
function targetCounts(w: World, team: number): Map<number, number> {
  let c = takerCache.get(w);
  if (!c || c.tick !== w.tick) {
    c = { tick: w.tick, by: [] };
    takerCache.set(w, c);
  }
  let m = c.by[team];
  if (!m) {
    m = new Map();
    for (const o of w.entities)
      if (o.alive && o.unit && o.team === team && o.unit.targetId)
        m.set(o.unit.targetId, (m.get(o.unit.targetId) ?? 0) + 1);
    c.by[team] = m;
  }
  return m;
}

/** A marching soldier ahead of its pack: no friend within 5 m, but some within 25 m nearer home (to wait for). */
function packAhead(w: World, e: Entity): boolean {
  const own = w.core(e.team);
  if (!own) return false;
  const p = e.transform.pos;
  const myHome = Math.hypot(own.transform.pos.x - p.x, own.transform.pos.z - p.z);
  let close = 0;
  let behind = 0;
  for (const o of w.entities) {
    if (o === e || !o.alive || !o.unit || o.team !== e.team || o.unit.guard) continue;
    if (w.teams[e.team].directives[o.unit.type] !== "push") continue;
    const d = Math.hypot(o.transform.pos.x - p.x, o.transform.pos.z - p.z);
    if (d < 5) close++;
    else if (
      d < 25 &&
      Math.hypot(own.transform.pos.x - o.transform.pos.x, own.transform.pos.z - o.transform.pos.z) < myHome - 3
    )
      behind++;
  }
  return close === 0 && behind >= 2;
}

/** The nearest enemy champion or soldier within 15 m of `h` (where a screen should face). */
function nearestThreat(w: World, h: Entity): Vec2 | null {
  let best: Vec2 | null = null;
  let bd = 15;
  for (const o of w.entities) {
    if (!o.alive || o.team === h.team || o.team < 0 || o.structure || (o.hero && o.hero.dead)) continue;
    if (!o.unit && !o.hero) continue;
    const d = w.dist(h, o);
    if (d < bd) {
      bd = d;
      best = { x: o.transform.pos.x, z: o.transform.pos.z };
    }
  }
  return best;
}
