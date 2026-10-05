// The neutral ogre (team NEUTRAL): spawns at a den or on a patrol route after a delay, patrols between two points,
// aggroes on anything it sees ahead of it within its leash of the route, and respawns after dying (its killer's
// team is blessed, see world/death.ts). updateOgre is its unit AI, called from units.ts.
import type { Arena } from "../arena.ts";
import type { World } from "../world.ts";
import type { Entity, Vec2 } from "../types.ts";
import { moveToward } from "../units.ts";

/** Team index used for neutral entities (the ogre). */
/** The ogre's team: past the last house (FFA deathmatch fields up to eight). */
export const NEUTRAL = 8;

export function updateOgreSpawn(arena: Arena): void {
  const w = arena.w;
  const cfg = w.data.match.arena.ogre;
  const cur = arena.ogreId ? w.get(arena.ogreId) : undefined;
  if (cur?.alive) return;
  if (arena.ogreId) {
    arena.ogreId = 0;
    arena.nextOgre = w.time + cfg.respawnSeconds;
    return;
  }
  if (w.time < arena.nextOgre) return;
  const dens = w.terrain.dens;
  const cores = w.terrain.cores;
  const a = cores[0] ?? { x: 0, z: 0 };
  const b = cores[1] ?? { x: w.terrain.width, z: w.terrain.depth };
  const ax = b.x - a.x;
  const az = b.z - a.z;
  const al = Math.hypot(ax, az) || 1;
  const side = w.rng() < 0.5 ? 1 : -1;
  const off = Math.min(w.terrain.width, w.terrain.depth) * 0.3;
  const routes = w.terrain.patrols;
  let p: Vec2;
  if (routes.length) {
    const r = routes[Math.floor(w.rng() * routes.length) % routes.length];
    const a = arena.snap(r.a.x, r.a.z);
    const b = arena.snap(r.b.x, r.b.z);
    const start = w.rng() < 0.5;
    p = start ? a : b;
    arena.ogreRoute = { a, b, leg: start ? 1 : 0, waitUntil: 0 };
  } else {
    const den = dens.length ? dens[Math.floor(w.rng() * dens.length) % dens.length] : null;
    p = den
      ? arena.snap(den.x, den.z)
      : arena.snap(arena.home.x - (az / al) * off * side, arena.home.z + (ax / al) * off * side);
    const px = -(az / al) * 10;
    const pz = (ax / al) * 10;
    arena.ogreRoute = { a: arena.snap(p.x - px, p.z - pz), b: arena.snap(p.x + px, p.z + pz), leg: 1, waitUntil: 0 };
  }
  const e = w.addEntity(NEUTRAL, "unit", cfg.radius, p.x, p.z, cfg.hp);
  e.neutral = true;
  e.unit = {
    type: "heavy",
    damage: cfg.damage,
    speed: cfg.speed,
    range: cfg.range,
    cooldown: cfg.cooldown,
    aggro: cfg.aggro,
    nextAttack: w.time + 1,
    targetId: 0,
    retargetAt: 0,
    path: [],
    pathGoal: { x: p.x, z: p.z },
    repathAt: 0,
    slot: 0,
    attackAnimAt: -99,
    moving: false,
    rank: 0,
    kills: 0,
  };
  arena.ogreId = e.id;
  w.emit({ type: "spawn", id: e.id });
  w.emit({ type: "notice", team: -1, text: "THE OGRE WAKES!" });
}

/** Ogre AI: chase a visible target near its route, slam in front of itself, else patrol (and slowly heal). */
export function updateOgre(w: World, e: Entity): void {
  const u = e.unit!;
  const cfg = w.data.match.arena.ogre;
  if (w.time < e.status.stunUntil) return;
  const route = w.arena.ogreRoute;
  const p0 = e.transform.pos;
  const offRoute = (x: number, z: number): number => {
    if (!route) return Math.hypot(x - (u.pathGoal?.x ?? p0.x), z - (u.pathGoal?.z ?? p0.z));
    const vx = route.b.x - route.a.x;
    const vz = route.b.z - route.a.z;
    const l2 = vx * vx + vz * vz || 1;
    const t = Math.max(0, Math.min(1, ((x - route.a.x) * vx + (z - route.a.z) * vz) / l2));
    return Math.hypot(x - (route.a.x + vx * t), z - (route.a.z + vz * t));
  };
  let target = u.targetId ? w.get(u.targetId) : undefined;
  if (target && (!target.alive || target.structure)) target = undefined;
  if (target && offRoute(target.transform.pos.x, target.transform.pos.z) > cfg.leash) target = undefined;
  if (!target || w.time >= u.retargetAt) {
    u.retargetAt = w.time + 0.4;
    let best: Entity | undefined;
    let bestD = Infinity;
    const fx = Math.sin(e.transform.facing);
    const fz = Math.cos(e.transform.facing);
    for (const o of w.entities) {
      if (!o.alive || o.neutral || o.structure || !w.canSee(e, o)) continue;
      const dx = o.transform.pos.x - p0.x;
      const dz = o.transform.pos.z - p0.z;
      const d = Math.hypot(dx, dz);
      const ahead = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
      const sight = target ? cfg.aggro * 1.5 : ahead > 0.35 ? cfg.aggro : cfg.aggro * 0.42;
      if (d > sight || offRoute(o.transform.pos.x, o.transform.pos.z) > cfg.leash) continue;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (best) {
      if (!target)
        w.emit({ type: "callout", x: p0.x, y: e.transform.y + 3, z: p0.z, team: NEUTRAL, text: "!", owner: e.id });
      target = best;
    } else if (target && w.dist(e, target) > cfg.aggro * 1.5) target = undefined;
    u.targetId = target?.id ?? 0;
  }
  if (!target) {
    u.targetId = 0;
    u.speed = cfg.speed * (cfg.patrolSpeedMul ?? 0.6);
    if (e.hp < e.maxHp) w.heal(e, e.maxHp * 0.02 * w.dt);
    if (!route) {
      moveToward(w, e, u.pathGoal ?? { x: p0.x, z: p0.z }, 1);
      return;
    }
    if (w.time < route.waitUntil) {
      if (Math.floor(route.waitUntil - w.time) !== Math.floor(route.waitUntil - w.time + w.dt))
        w.faceToward(e, Math.sin(e.transform.facing + 1.6), Math.cos(e.transform.facing + 1.6), 4);
      return;
    }
    const goal = route.leg ? route.b : route.a;
    if (Math.hypot(goal.x - p0.x, goal.z - p0.z) < 1.4) {
      route.leg = 1 - route.leg;
      route.waitUntil = w.time + (cfg.patrolPause ?? 2);
      return;
    }
    moveToward(w, e, goal, 1);
    return;
  }
  u.speed = cfg.speed;
  const d = w.dist(e, target) - target.radius - e.radius;
  if (d <= u.range) {
    w.faceToward(e, target.transform.pos.x - e.transform.pos.x, target.transform.pos.z - e.transform.pos.z, 8);
    if (w.time >= u.nextAttack) {
      u.nextAttack = w.time + u.cooldown;
      u.attackAnimAt = w.time;
      const p = e.transform.pos;
      const fx = Math.sin(e.transform.facing);
      const fz = Math.cos(e.transform.facing);
      w.emit({ type: "slam", x: p.x + fx * 1.2, y: e.transform.y, z: p.z + fz * 1.2, radius: 2.2, team: NEUTRAL });
      for (const o of w.entities.slice()) {
        if (!o.alive || o.neutral || o.structure) continue;
        const dd = Math.hypot(o.transform.pos.x - (p.x + fx * 1.2), o.transform.pos.z - (p.z + fz * 1.2)) - o.radius;
        if (dd > 1.6) continue;
        w.damage(e, o, u.damage, { knockback: cfg.knockback, big: true, stun: 0.3 });
      }
    }
    return;
  }
  moveToward(w, e, { x: target.transform.pos.x, z: target.transform.pos.z }, target.radius + e.radius + u.range * 0.8);
}
