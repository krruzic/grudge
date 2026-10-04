// Straight-line missiles (talent waves/bolts, ground rocks, marksman piercing arrows): fly `range` along a
// direction, stop at walls (rocks follow the ground and stop at ledges), hit each target once, optionally pierce,
// splash, chain to the next target, or burst at the end. Updated in step phase 5.
import type { World } from "../world.ts";
import type { Entity, Missile } from "../types.ts";
import { onArrowHit } from "../hero/marksman.ts";

export function fireMissile(w: World, src: Entity, m: Omit<Missile, "id" | "ownerId" | "team" | "dist" | "hit">): void {
  w.missiles.push({ ...m, id: w.newId(), ownerId: src.id, team: src.team, dist: 0, hit: [] });
  w.emit({ type: "shot", style: m.style, x: m.x, y: m.y, z: m.z });
}

/** Rocks need walkable ground near their height; other missiles are blocked by line-of-sight height. */
function missileBlocked(w: World, m: Missile, x: number, z: number): boolean {
  if (m.style === "rock") {
    const h = w.terrain.heightAt(x, z);
    return !Number.isFinite(h) || Math.abs(h - m.y) > 1.6;
  }
  return w.losHeight(x, z) > m.y + 0.4;
}

export function updateMissiles(w: World): void {
  const dt = w.dt;
  for (let i = w.missiles.length - 1; i >= 0; i--) {
    const m = w.missiles[i];
    const owner = w.get(m.ownerId) ?? null;
    const step = m.speed * dt;
    const nx = m.x + m.dirX * step;
    const nz = m.z + m.dirZ * step;
    let end = m.dist + step >= m.range || missileBlocked(w, m, nx, nz);
    if (!end) {
      m.x = nx;
      m.z = nz;
      m.dist += step;
      if (m.style === "rock") m.y = w.groundY(nx, nz);
    }
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === m.team || m.hit.includes(o.id)) continue;
      if (Math.hypot(o.transform.pos.x - m.x, o.transform.pos.z - m.z) - o.radius > m.width) continue;
      if (m.style !== "rock" && Math.abs(o.transform.y + 1 - m.y) > 2.5) continue;
      m.hit.push(o.id);
      const dmg = o.structure ? m.damage * 0.5 : m.damage;
      const landed = w.damage(owner, o, dmg, {
        fromX: m.x - m.dirX,
        fromZ: m.z - m.dirZ,
        knockback: m.knockback ?? (m.style === "rock" ? 3 : 1.5),
        stun: m.stun,
        slowMul: m.slowMul,
        slowSeconds: m.slowSeconds,
        big: m.style === "rock" || m.style === "slash" || !!m.arrow,
        structureDamage: o.structure ? dmg : undefined,
      });
      if (landed && m.arrow && owner && !o.structure) onArrowHit(w, owner, o);
      if (m.splash) {
        w.emit({
          type: "slam",
          x: o.transform.pos.x,
          y: o.transform.y,
          z: o.transform.pos.z,
          radius: m.splash,
          team: m.team,
        });
        for (const q of w.entities.slice()) {
          if (!q.alive || q.team === m.team || q === o || q.structure) continue;
          if (
            Math.hypot(q.transform.pos.x - o.transform.pos.x, q.transform.pos.z - o.transform.pos.z) - q.radius >
            m.splash
          )
            continue;
          w.damage(owner, q, m.splashDamage ?? 30, {
            fromX: o.transform.pos.x,
            fromZ: o.transform.pos.z,
            knockback: 2,
          });
        }
      }
      if (m.chain && owner) {
        let best: Entity | null = null;
        let bd = 7;
        for (const q of w.entities) {
          if (!q.alive || q.team === m.team || q.id === o.id || q.structure || m.hit.includes(q.id)) continue;
          const d = w.dist(o, q);
          if (d < bd) {
            bd = d;
            best = q;
          }
        }
        if (best) {
          const dx = best.transform.pos.x - o.transform.pos.x;
          const dz = best.transform.pos.z - o.transform.pos.z;
          const dl = Math.hypot(dx, dz) || 1;
          w.missiles.push({
            ...m,
            id: w.newId(),
            x: o.transform.pos.x,
            z: o.transform.pos.z,
            dirX: dx / dl,
            dirZ: dz / dl,
            dist: 0,
            range: dl + 1,
            hit: [...m.hit],
            chain: m.chain - 1,
          });
        }
      }
      if (!m.pierce) {
        end = true;
        break;
      }
    }
    if (end) {
      w.missiles.splice(i, 1);
      if (m.endBurst && owner) {
        const y = w.groundY(m.x, m.z);
        w.emit({ type: "slam", x: m.x, y, z: m.z, radius: m.endBurst.radius, team: m.team });
        for (const o of w.entities.slice()) {
          if (!o.alive || o.team === m.team || o.structure) continue;
          if (Math.hypot(o.transform.pos.x - m.x, o.transform.pos.z - m.z) - o.radius > m.endBurst.radius) continue;
          w.damage(owner, o, m.endBurst.damage * w.damageMulOf(owner), {
            fromX: m.x,
            fromZ: m.z,
            knockback: 5,
            big: true,
          });
        }
      }
    }
  }
}
