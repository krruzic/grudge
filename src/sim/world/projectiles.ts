// Simple projectiles (tower shots, unit arrows, hero bolts/orbs): homing on a target entity or flying to a point,
// resolving damage, splash, burn zones and talent/marksman on-hit effects when they land.
import type { World } from "../world.ts";
import type { Entity, Projectile } from "../types.ts";
import { afterShot } from "../talents.ts";
import { Kind } from "../terrain.ts";
import { onArrowHit } from "../hero/marksman.ts";

/** Homing projectile at a target entity; flight time = distance / speed (min 0.15s). */
export function fireProjectile(
  w: World,
  src: Entity,
  target: Entity,
  damage: number,
  speed: number,
  ballistic: boolean,
  style: string,
  fromHeight: number,
  canMiss = true,
  splash?: Projectile["splash"],
  slow?: Projectile["slow"],
): void {
  const sp = src.transform;
  const tp = target.transform;
  const d = w.dist(src, target);
  w.emit({ type: "shot", style, x: sp.pos.x, y: sp.y + fromHeight, z: sp.pos.z });
  w.projectiles.push({
    id: w.newId(),
    team: src.team,
    sourceId: src.id,
    targetId: target.id,
    from: { x: sp.pos.x, y: sp.y + fromHeight, z: sp.pos.z },
    to: { x: tp.pos.x, y: tp.y + 1, z: tp.pos.z },
    t: 0,
    prevT: 0,
    dur: Math.max(0.15, d / speed),
    ballistic,
    damage,
    style,
    canMiss,
    splash,
    slow,
  });
}

/** Projectile to a ground point: damage only via splash/burn on landing. */
export function fireAtPoint(
  w: World,
  src: Entity,
  x: number,
  z: number,
  speed: number,
  style: string,
  fromHeight: number,
  splash?: Projectile["splash"],
  ballistic = false,
  burn?: Projectile["burn"],
): void {
  const sp = src.transform;
  const d = Math.hypot(x - sp.pos.x, z - sp.pos.z);
  w.emit({ type: "shot", style, x: sp.pos.x, y: sp.y + fromHeight, z: sp.pos.z });
  w.projectiles.push({
    id: w.newId(),
    team: src.team,
    sourceId: src.id,
    targetId: 0,
    from: { x: sp.pos.x, y: sp.y + fromHeight, z: sp.pos.z },
    to: { x, y: w.groundY(x, z) + 0.5, z },
    t: 0,
    prevT: 0,
    dur: Math.max(0.15, d / speed),
    ballistic,
    damage: 0,
    style,
    canMiss: false,
    splash,
    burn,
  });
}

/**
 * Step phase 5: advance projectiles (re-aiming homing ones at their live target) and resolve landings in reverse
 * array order. On landing: direct hit, talent/arrow on-hit hooks, splash to other enemies, then any burn zone.
 */
/**
 * An arrow's next stretch of flight (from where it is now to where it'll be next tick) crossing a wall taller than
 * it, or a structure's footprint other than its target: what stopped it, else null.
 */
function arrowBlocked(w: World, p: Projectile, target: Entity): Entity | "wall" | null {
  const k0 = Math.max(0, p.t - 0.08);
  const at = (k: number) => ({
    x: p.from.x + (p.to.x - p.from.x) * k,
    y: p.from.y + (p.to.y - p.from.y) * k,
    z: p.from.z + (p.to.z - p.from.z) * k,
  });
  const a = at(k0);
  const b = at(Math.min(1, p.t));
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / 0.4));
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const x = a.x + (b.x - a.x) * f;
    const z = a.z + (b.z - a.z) * f;
    const y = a.y + (b.y - a.y) * f;
    if (Math.hypot(x - target.transform.pos.x, z - target.transform.pos.z) < target.radius + 0.3) return null;
    if (Math.hypot(x - p.from.x, z - p.from.z) < 1) continue;
    const i = w.terrain.index(Math.floor(x), Math.floor(z));
    const ice = i >= 0 && w.terrain.kinds[i] === Kind.Wall && w.terrain.styles[i] === "ice";
    if (!ice && w.losHeight(x, z) > y - 0.3) return "wall";
    for (const o of w.entities)
      if (
        o.alive &&
        o.structure &&
        o !== target &&
        o.team !== p.team &&
        Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) < o.radius * 0.85
      )
        return o;
  }
  return null;
}

export function updateProjectiles(w: World, dt: number): void {
  for (let i = w.projectiles.length - 1; i >= 0; i--) {
    const p = w.projectiles[i];
    const target = p.targetId ? w.get(p.targetId) : undefined;
    if (target) {
      p.to.x = target.transform.pos.x;
      p.to.y = target.transform.y + 1;
      p.to.z = target.transform.pos.z;
    }
    p.t += dt / p.dur;
    // Arrows are stopped by walls and buildings in their way (and hit an enemy building they fly into).
    if (p.arrow && target && p.t < 1) {
      const src0 = w.getAny(p.sourceId);
      if (src0) {
        const block = arrowBlocked(w, p, target);
        if (block) {
          w.projectiles.splice(i, 1);
          const at = block === "wall" ? null : block;
          if (at && at.team !== p.team && !at.neutral)
            w.damage(src0.alive ? src0 : null, at, p.damage * 0.5, { structureDamage: p.damage * 0.5 });
          else w.emit({ type: "miss", x: p.to.x, y: p.to.y, z: p.to.z });
          continue;
        }
      }
    }
    if (p.t >= 1) {
      w.projectiles.splice(i, 1);
      const src = w.getAny(p.sourceId) ?? null;
      const who = src && src.alive ? src : null;
      const landed = target
        ? w.damage(who, target, p.damage, {
            fromX: p.from.x,
            fromZ: p.from.z,
            knockback: p.splash ? 3 : 0.8,
            canMiss: p.canMiss,
            slowMul: p.slow?.slowMul,
            slowSeconds: p.slow?.slowSeconds,
            noFlinch: !p.splash && !!who?.hero,
            crit: p.crit,
          })
        : false;
      if (landed && who && target && p.talent) afterShot(w, who, target, p.damage, p.talent === "orb");
      if (landed && who && target && p.arrow) onArrowHit(w, who, target);
      if (p.burn)
        w.emit({
          type: "pulse",
          x: p.to.x,
          y: w.groundY(p.to.x, p.to.z),
          z: p.to.z,
          radius: p.burn.radius,
          team: p.team,
          style: "fireburst",
        });
      if (p.splash) {
        const sp = p.splash;
        if (!p.burn)
          w.emit({
            type: "telegraph",
            x: p.to.x,
            y: w.groundY(p.to.x, p.to.z),
            z: p.to.z,
            radius: sp.radius,
            team: p.team,
            seconds: 0.05,
            src: p.sourceId,
            style: "splash",
          });
        for (const o of w.entities.slice()) {
          if (!o.alive || o.team === p.team || o === target || o.kind === "structure") continue;
          if (Math.hypot(o.transform.pos.x - p.to.x, o.transform.pos.z - p.to.z) - o.radius > sp.radius) continue;
          w.damage(who, o, sp.damage, {
            fromX: p.to.x,
            fromZ: p.to.z,
            knockback: 2.5,
            slowMul: sp.slowMul,
            slowSeconds: sp.slowSeconds,
          });
        }
        if (target?.alive) {
          target.status.slowMul = sp.slowMul;
          target.status.slowUntil = w.time + sp.slowSeconds;
        }
      }
      if (p.burn)
        w.zones.push({
          id: w.newId(),
          team: p.team,
          ownerId: p.sourceId,
          x: p.to.x,
          z: p.to.z,
          radius: p.burn.radius,
          until: w.time + p.burn.seconds,
          dps: p.burn.dps,
          slowMul: 1,
          style: "lava",
        });
    }
  }
}
