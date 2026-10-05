// Boomerangs (engineer wrench, architect square): fly out up to `range` or until blocked, then home back to the owner, hitting each
// enemy at most once per leg.
import type { World } from "../world.ts";

export function updateBoomerangs(w: World): void {
  const dt = w.dt;
  for (let i = w.boomerangs.length - 1; i >= 0; i--) {
    const b = w.boomerangs[i];
    const owner = w.get(b.ownerId);
    if (!owner || !owner.alive) {
      w.boomerangs.splice(i, 1);
      continue;
    }
    if (!b.back) {
      const step = 17 * (b.speedMul ?? 1) * dt;
      const nx = b.x + b.dirX * step;
      const nz = b.z + b.dirZ * step;
      b.dist += step;
      if (b.dist >= b.range || w.losHeight(nx, nz) > b.y + 0.4) {
        b.back = true;
        b.hit = [];
      } else {
        b.x = nx;
        b.z = nz;
      }
    } else {
      const tx = owner.transform.pos.x;
      const tz = owner.transform.pos.z;
      const dx = tx - b.x;
      const dz = tz - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.9) {
        w.boomerangs.splice(i, 1);
        continue;
      }
      const step = Math.min(d, 20 * (b.speedMul ?? 1) * dt);
      b.x += (dx / d) * step;
      b.z += (dz / d) * step;
      b.y += (owner.transform.y + 1.6 - b.y) * Math.min(1, dt * 6);
    }
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === b.team || b.hit.includes(o.id)) continue;
      if (Math.hypot(o.transform.pos.x - b.x, o.transform.pos.z - b.z) - o.radius > 1.0) continue;
      b.hit.push(o.id);
      const dmg = o.structure ? b.damage * 0.6 : b.damage;
      const landed = w.damage(owner, o, dmg, {
        knockback: 3,
        fromX: b.x - b.dirX,
        fromZ: b.z - b.dirZ,
        big: true,
        structureDamage: o.structure ? dmg : undefined,
        slowMul: o.structure ? undefined : b.slowMul,
        slowSeconds: o.structure ? undefined : b.slowSeconds,
        stun: o.hero ? b.stun : undefined,
      });
      if (landed && b.cdrB && o.hero && owner.hero) owner.hero.cooldowns.b = (owner.hero.cooldowns.b ?? 0) - b.cdrB;
    }
  }
}
