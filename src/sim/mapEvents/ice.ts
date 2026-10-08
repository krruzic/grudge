// Frozen lake (Emberglass Mere): cells flagged ICE (map op "ice") are a slick, cracking sheet.
//   Slick:    champions on solid ice keep their momentum (acceleration x accelMul, hero/update.ts freeMove) and
//             every knockback decays at knockDecay instead of 8/s, so shoves and big hits send bodies skating -
//             into a wall for a wall splat (world/movement.ts applyKnockback).
//   Cracking: the sheet is split into patch x patch metre patches, each with `hp`. A heavy hit taken on a patch
//             (big, knockback >= 8 or >= 70 damage; world/damage.ts) or a jump landing on it cracks it; at 0 it
//             breaks: icy water for breakSeconds, where everything wades at waterSlow and champions can't dodge,
//             and whoever was standing on it is dunked (dunkDamage from no one, a short stun). It refreezes after
//             (refreezeWarn seconds of frost creeping back first), whole again.
// No randomness: patch order and crack amounts are fixed, so it never touches the match rng.
import type { MapEvents } from "../mapEvents.ts";
import type { Entity } from "../types.ts";
import { FLAG_ICE } from "../terrain.ts";

export interface IceDef {
  patch: number;
  hp: number;
  accelMul: number;
  knockDecay: number;
  /** Crack per heavy hit: damage x hitMul, clamped to [hitMin, hitMax]. */
  hitMul: number;
  hitMin: number;
  hitMax: number;
  landCrack: number;
  breakSeconds: number;
  refreezeWarn: number;
  waterSlow: number;
  dunkDamage: number;
  dunkStun: number;
  /** A roll on solid ice goes this much faster, and ends sliding at dodgeSpeed x rollCarry. */
  rollMul?: number;
  rollCarry?: number;
  /** No cracking before this (the opening rush across the lake doesn't shatter it). */
  firstSeconds: number;
}

export interface IcePatch {
  id: number;
  cells: number[];
  /** Centre (for effects). */
  x: number;
  z: number;
  hp: number;
  broken: boolean;
  /** Broken: when it refreezes. */
  until: number;
  warned: boolean;
}

/** Group the ICE cells into patch x patch squares, in cell order (deterministic ids). */
export function buildIce(ev: MapEvents, d: IceDef): void {
  const t = ev.w.terrain;
  const W = t.width;
  const map = new Map<number, IcePatch>();
  ev.icePatchOf = new Int16Array(t.width * t.depth).fill(-1);
  // The sheet is the flagged cells that lie at the lake floor: the map flags a generous oval and the smooth bowl
  // of the lake decides the actual shoreline (so the ice edge follows the bank, not the cell grid).
  let floor = Infinity;
  for (let i = 0; i < t.flags.length; i++)
    if (t.flags[i] & FLAG_ICE) floor = Math.min(floor, t.groundHeight((i % W) + 0.5, Math.floor(i / W) + 0.5));
  for (let i = 0; i < t.flags.length; i++) {
    if (!(t.flags[i] & FLAG_ICE)) continue;
    const cx = i % W;
    const cz = Math.floor(i / W);
    if (t.groundHeight(cx + 0.5, cz + 0.5) > floor + 0.12) continue;
    const key = Math.floor(cz / d.patch) * 1000 + Math.floor(cx / d.patch);
    let p = map.get(key);
    if (!p) {
      p = { id: map.size, cells: [], x: 0, z: 0, hp: d.hp, broken: false, until: 0, warned: false };
      map.set(key, p);
    }
    p.cells.push(i);
    ev.icePatchOf[i] = p.id;
  }
  ev.icePatches = [...map.values()];
  for (const p of ev.icePatches) {
    let sx = 0;
    let sz = 0;
    for (const i of p.cells) {
      sx += (i % W) + 0.5;
      sz += Math.floor(i / W) + 0.5;
    }
    p.x = sx / p.cells.length;
    p.z = sz / p.cells.length;
  }
}

/** The ice patch under (x, z), if any. */
export function patchAt(ev: MapEvents, x: number, z: number): IcePatch | undefined {
  const t = ev.w.terrain;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= t.width || cz >= t.depth) return undefined;
  const id = ev.icePatchOf[cz * t.width + cx];
  return id >= 0 ? ev.icePatches[id] : undefined;
}

/** Wear the patch under (x, z) down by `amount`; it breaks at 0. */
export function crackIce(ev: MapEvents, d: IceDef, x: number, z: number, amount: number): void {
  const w = ev.w;
  if (w.time < d.firstSeconds) return;
  const p = patchAt(ev, x, z);
  if (!p || p.broken) return;
  const before = p.hp;
  p.hp = Math.max(0, p.hp - amount);
  // A crack stage per third of the patch's health (the renderer draws cracks from hp; this is for the sound).
  const stage = (hp: number) => (hp <= 0 ? 3 : hp < d.hp / 3 ? 2 : hp < (2 * d.hp) / 3 ? 1 : 0);
  if (stage(p.hp) > stage(before) && p.hp > 0)
    w.emit({ type: "ice", stage: "crack", id: p.id, x: p.x, y: w.groundY(p.x, p.z), z: p.z, seconds: 0 });
  if (p.hp <= 0) breakPatch(ev, d, p);
}

function breakPatch(ev: MapEvents, d: IceDef, p: IcePatch): void {
  const w = ev.w;
  p.broken = true;
  p.until = w.time + d.breakSeconds;
  p.warned = false;
  w.emit({ type: "ice", stage: "break", id: p.id, x: p.x, y: w.groundY(p.x, p.z), z: p.z, seconds: d.breakSeconds });
  // Dunked: everything standing on it goes into the freezing water.
  const victims: Entity[] = [];
  for (const e of w.entities) {
    if (!e.alive || e.structure || e.neutral || e.hero?.dead || e.hero?.jump) continue;
    if (patchAt(ev, e.transform.pos.x, e.transform.pos.z) === p) victims.push(e);
  }
  for (const e of victims) {
    w.damage(null, e, d.dunkDamage, { stun: d.dunkStun, noFlinch: true, tick: true });
    if (e.alive) e.status.kvx = e.status.kvz = 0;
  }
}

export function updateIce(ev: MapEvents, d: IceDef): void {
  const w = ev.w;
  for (const p of ev.icePatches) {
    if (!p.broken) continue;
    if (!p.warned && w.time >= p.until - d.refreezeWarn) {
      p.warned = true;
      w.emit({ type: "ice", stage: "warn", id: p.id, x: p.x, y: w.groundY(p.x, p.z), z: p.z, seconds: d.refreezeWarn });
    }
    if (w.time < p.until) continue;
    p.broken = false;
    p.hp = d.hp;
    w.emit({ type: "ice", stage: "refreeze", id: p.id, x: p.x, y: w.groundY(p.x, p.z), z: p.z, seconds: 0 });
  }
}
