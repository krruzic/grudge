// Jumps: map jump pads (charged in updateHero, see hero/update.ts) and ability-driven jumps (startJump). While
// hero.jump is set the hero follows a scripted arc and ignores input; taking damage during a pad's wind-up
// cancels it.
import type { World } from "../world.ts";
import type { Entity } from "../types.ts";

/** Ability jump to the nearest open cell around (tx, tz); refused across sealed gates. */
export function startJump(w: World, e: Entity, tx: number, tz: number, dur: number, peak: number): boolean {
  if (!e.hero) return false;
  const i = w.nav.nearestOpen(tx, tz, 2);
  if (i < 0) return false;
  const x = (i % w.nav.w) + 0.5;
  const z = Math.floor(i / w.nav.w) + 0.5;
  const p = e.transform.pos;
  if (w.mapEvents.sealed(p.x, p.z, x, z)) {
    w.mapEvents.shutNotice(e);
    return false;
  }
  e.hero.action = null;
  breakRecall(w, e);
  e.hero.jump = { fx: p.x, fz: p.z, tx: x, tz: z, start: w.time, dur, peak, pad: -1, launched: true };
  e.transform.facing = e.transform.prevFacing = Math.atan2(x - p.x, z - p.z);
  w.emit({
    type: "jumppad",
    stage: "launch",
    pad: -1,
    id: e.id,
    x: p.x,
    y: e.transform.y,
    z: p.z,
    windup: 0,
    dur,
  });
  return true;
}

/** Any jump ends a recall channel: otherwise it ran out mid-flight and snapped the hero home on landing. */
export function breakRecall(w: World, e: Entity): void {
  if (e.hero?.recallAt === undefined) return;
  e.hero.recallAt = undefined;
  w.emit({ type: "notice", team: e.team, text: "RECALL BROKEN" });
}

/** Interrupt a jump-pad wind-up (before launch); the pad goes on cooldown. Launched jumps can't be cancelled. */
export function cancelJump(w: World, e: Entity): void {
  const j = e.hero?.jump;
  if (!j || w.time >= j.start || j.pad < 0) return;
  e.hero!.jump = undefined;
  const p = w.jumpPads[j.pad];
  if (p) {
    p.readyAt = w.time + w.jumpCooldown;
    p.failAt = w.time;
    p.chargeAt = -99;
  }
  e.hero!.jumpReadyAt = w.time + 0.5;
  const t = e.transform;
  w.emit({
    type: "jumppad",
    stage: "fail",
    pad: j.pad,
    id: e.id,
    x: t.pos.x,
    y: t.y,
    z: t.pos.z,
    windup: 0,
    dur: 0,
  });
}

/** Resolve each map jump pad's landing spot to the nearest open nav cell. */
export function initJumpPads(w: World): void {
  w.jumpPads = w.terrain.jumppads.map((j) => {
    const i = w.nav.nearestOpen(j.b.x, j.b.z, 6);
    const tx = i >= 0 ? (i % w.nav.w) + 0.5 : j.b.x;
    const tz = i >= 0 ? Math.floor(i / w.nav.w) + 0.5 : j.b.z;
    return { x: j.a.x, z: j.a.z, tx, tz, launchAt: -99, chargeAt: -99, readyAt: 0, failAt: -99 };
  });
}
