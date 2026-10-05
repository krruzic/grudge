// Shared hero-action helpers: slot type, cooldown check, auto-aim (target selection), starting an action, and
// small utilities used by the controller, combos and ability kinds.
import type { World } from "../world.ts";
import type { Command, Entity, HeroAction } from "../types.ts";
import { abilities } from "../talents.ts";
import type { AbilityDef } from "../config.ts";

export type Slot = "a" | "b" | "r" | "z";

/** Cooldowns are stored as the absolute time the key becomes usable again. */
/**
 * Spend one charge of a charged ability (AbilityDef.charges > 1) just used, recharging in `cd` s on its own; the
 * slot's cooldown becomes "when the next charge is ready" (now, if another is banked). No-op for normal abilities.
 */
export function spendCharge(w: World, e: Entity, slot: "b" | "r", cd: number): void {
  const n = abilities(w, e)[slot].charges ?? 1;
  if (n < 2) return;
  const h = e.hero!;
  const stock = ((h.stock ??= {})[slot] ??= new Array<number>(n).fill(0));
  while (stock.length < n) stock.push(0);
  let i = stock.findIndex((t) => t <= w.time);
  if (i < 0) i = stock.indexOf(Math.min(...stock));
  stock[i] = w.time + cd;
  h.cooldowns[slot] = Math.min(...stock);
}

/** A charged ability that fizzled: give the charge back after `after` s. */
export function refundCharge(w: World, e: Entity, slot: "b" | "r", after: number): void {
  const stock = e.hero!.stock?.[slot];
  if (!stock?.length) {
    e.hero!.cooldowns[slot] = w.time + after;
    return;
  }
  const i = stock.indexOf(Math.max(...stock));
  stock[i] = w.time + after;
  e.hero!.cooldowns[slot] = Math.min(...stock);
}

export function ready(e: Entity, key: string, time: number): boolean {
  return (e.hero!.cooldowns[key] ?? 0) <= time;
}

/**
 * Auto-aim: best visible enemy within `reach`. With the stick held, only targets within ~73 degrees of it count;
 * without, ranged reaches use the facing cone. Score = distance, minus a bonus for heroes and alignment, plus a
 * penalty for structures.
 */
export function aimTarget(w: World, e: Entity, cmd: Command, reach: number): Entity | null {
  const t = e.transform;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team || !w.canSee(e, o)) continue;
    const d = w.dist(e, o) - o.radius;
    if (d > reach) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const along =
      mag > 0.3
        ? (dx * cmd.moveX + dz * cmd.moveZ) / (len * mag)
        : reach > 4
          ? (dx * Math.sin(t.facing) + dz * Math.cos(t.facing)) / len
          : 1;
    if (mag > 0.3 && along < 0.3) continue;
    if (mag <= 0.3 && reach > 4 && along < 0.5) continue;
    const score = d + (o.hero ? -1.5 : 0) + (o.structure ? 1 : 0) - along * 2;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

/** Unit aim direction: toward aimTarget, else the stick, else the current facing. */
export function aim(w: World, e: Entity, cmd: Command, reach: number): [number, number] {
  const t = e.transform;
  const best = aimTarget(w, e, cmd, reach);
  if (best) {
    const dx = best.transform.pos.x - t.pos.x;
    const dz = best.transform.pos.z - t.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    return [dx / len, dz / len];
  }
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  if (mag > 0.3) return [cmd.moveX / mag, cmd.moveZ / mag];
  return [Math.sin(t.facing), Math.cos(t.facing)];
}

/** Inside the combo window after a non-final combo hit. */
export function chaining(w: World, e: Entity): boolean {
  const h = e.hero!;
  const hits = abilities(w, e).a.hits;
  return !!hits && w.time < h.comboUntil && h.comboIndex % hits.length !== 0;
}

/** Start a HeroAction (replacing any current one) and face its direction. */
export function begin(
  e: Entity,
  name: HeroAction["name"],
  kind: string,
  dur: number,
  hitAt: number,
  dirX: number,
  dirZ: number,
  combo = 0,
): HeroAction {
  const a: HeroAction = { name, kind, dur, hitAt, combo, t: 0, fired: false, dirX, dirZ };
  e.hero!.action = a;
  e.transform.facing = Math.atan2(dirX, dirZ);
  e.hero!.blocking = false;
  return a;
}

/** Rough reach of an ability for auto-aim. */
export function reachOf(def: AbilityDef): number {
  return def.range ?? def.botRange ?? def.radius ?? 3;
}

export const callout = (w: World, e: Entity, text: string) =>
  w.emit({
    type: "callout",
    x: e.transform.pos.x,
    y: e.transform.y,
    z: e.transform.pos.z,
    team: e.team,
    text,
    owner: e.id,
  });

/** Cap on non-hero targets per swing (maxHits hook), heroes are always hit. */
export function maxHits(w: World, e: Entity): number {
  return e.hero ? (w.heroDef(e.hero.type).hooks.maxHits ?? Infinity) : Infinity;
}
