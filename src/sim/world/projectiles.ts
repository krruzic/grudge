// Simple projectiles (tower shots, unit arrows, hero bolts/orbs): homing on a target entity or flying to a point,
// resolving damage, splash, burn zones and talent/marksman on-hit effects when they land.
import type { World } from "../world.ts";
import type { Entity, Projectile } from "../types.ts";
import { afterShot } from "../talents.ts";
import { onArrowHit } from "../marksman.ts";

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
