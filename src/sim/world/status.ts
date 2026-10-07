// Default per-entity Status block. Every timed effect is stored as an absolute `...Until` sim time, so expiring
// an effect is just `w.time >= until`; the paired multipliers only apply while that time is in the future.
import type { Entity, Status } from "../types.ts";
import type { World } from "../world.ts";

export function newStatus(): Status {
  return {
    slowUntil: 0,
    slowMul: 1,
    stunUntil: 0,
    kvx: 0,
    kvz: 0,
    buffUntil: 0,
    buffDamageMul: 1,
    buffSpeedMul: 1,
    rallyUntil: 0,
    lastHitAt: -99,
    lastHitX: 0,
    lastHitZ: 0,
    invulnUntil: 0,
    lastAttackAt: -99,
    hidden: false,
    seenBy: 0,
    supportDamageMul: 1,
    auraDamageMul: 1,
    stealthUntil: 0,
    ambushMul: 1,
    guardUntil: 0,
    guardMul: 1,
    cowedUntil: 0,
    hexUntil: 0,
    hexOwner: 0,
    bleedStacks: 0,
    bleedDps: 0,
    bleedUntil: 0,
    bleedOwner: 0,
    shield: 0,
    shieldUntil: 0,
    shieldBurst: 0,
    armorMul: 1,
    armorUntil: 0,
    ccImmuneUntil: 0,
    markUntil: 0,
    markTeam: -1,
    markOwner: 0,
    markMul: 1,
    markAll: false,
    markWeaken: 1,
  };
}

/**
 * Clear every debuff (stun, slow / root, knockback drift, hex, mark, blind, poison, bleed, no-heal, wounds, sticky
 * honey, cowed, Pip, Wet, swarm, haunt). Hogshead's Dig In runs it every tick while it lasts.
 */
export function cleanse(w: World, e: Entity): void {
  const s = e.status;
  const t = w.time;
  if (s.stunUntil > t) s.stunUntil = t;
  if (s.slowUntil > t) s.slowUntil = t;
  s.slowMul = 1;
  s.kvx = s.kvz = 0;
  s.hexUntil = Math.min(s.hexUntil, t);
  if (s.markTeam !== e.team) s.markUntil = Math.min(s.markUntil, t);
  s.cowedUntil = Math.min(s.cowedUntil, t);
  s.bleedUntil = Math.min(s.bleedUntil, t);
  s.bleedStacks = 0;
  for (const k of [
    "blindUntil",
    "poisonUntil",
    "noHealUntil",
    "woundUntil",
    "stickyUntil",
    "pipUntil",
    "wetUntil",
    "swarmUntil",
    "hauntUntil",
    "shovedUntil",
  ] as const)
    if ((s[k] ?? 0) > t) s[k] = t;
  if (s.armorMul > 1 && s.armorUntil > t) s.armorUntil = t;
}
