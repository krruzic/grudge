// Combo extenders: context-sensitive inputs that override the normal button meaning for a moment (crack charge
// after a talent crack, arm shove after a reach, hero-specific dodge replacements, riposte whirl after a parry).
// combo() returns true when it consumed the input this tick.
import type { World } from "../world.ts";
import type { Command, Entity } from "../types.ts";
import { abilities, bCooldown } from "../talents.ts";
import { isMarksman, skyshot } from "./marksman.ts";
import { startKegRocket } from "./friar.ts";
import { bellySlide } from "./harpooner.ts";
import { startGust } from "./scribe.ts";
import { startChainSwing } from "./wreckwitch.ts";
import { owlHop } from "./architect.ts";
import { startCurl } from "./vintner.ts";
import { startBuzz } from "./rider.ts";
import { begin, callout, ready } from "./common.ts";

/** Warlord HEAVE target: the nearest stunned enemy (hero or soldier) within reach in front of him. */
function heaveTarget(w: World, e: Entity, reach: number): Entity | null {
  const t = e.transform;
  let best: Entity | null = null;
  let bd = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team || o.structure || o.neutral || !(o.hero || o.unit)) continue;
    if (w.time >= o.status.stunUntil || o.hero?.jump) continue;
    const d = Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius;
    if (d > reach || Math.abs(o.transform.y - t.y) > 1.5) continue;
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

/**
 * Warlord HEAVE (hidden combo, L+A next to a stunned enemy): he grabs them overhead, then hurls them toward the stick
 * direction at the throw frame. Heroes fly in a jump arc and crash down (damage + stun + splash on landing);
 * soldiers are launched with a huge knockback. Resolved in fireHeave (fire.ts) at the action's hit frame.
 */
function startHeave(w: World, e: Entity, cmd: Command, mx: number, mz: number): boolean {
  const hk = w.heroDef(e.hero!.type).hooks;
  if (!hk.heaveRange || !cmd.attack || !cmd.block || e.hero!.action || !ready(e, "heave", w.time)) return false;
  const o = heaveTarget(w, e, hk.heaveRange);
  if (!o) return false;
  const a = begin(e, "a", "heave", 0.62, 0.34, mx, mz);
  a.targetId = o.id;
  o.status.stunUntil = Math.max(o.status.stunUntil, w.time + 0.5);
  e.hero!.cooldowns.heave = w.time + (hk.heaveCooldown ?? 6);
  callout(w, e, "HEAVE!");
  return true;
}

export function combo(w: World, e: Entity, cmd: Command): boolean {
  const h = e.hero!;
  const t = e.transform;
  const act = h.action;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const mx = mag > 0.2 ? cmd.moveX / mag : Math.sin(t.facing);
  const mz = mag > 0.2 ? cmd.moveZ / mag : Math.cos(t.facing);
  const ab = abilities(w, e);
  if (startHeave(w, e, cmd, mx, mz)) return true;
  const cr = h.crack;
  if (cr && cmd.secondary && w.time - cr.at < 0.9 && ready(e, "b", w.time) && (!act || act.name === "a")) {
    h.crack = undefined;
    const a = begin(e, "b", "charge", 0.8, 0.6, cr.dirX, cr.dirZ);
    a.chargeRange = 11;
    a.hitIds = [];
    h.cooldowns.b = bCooldown(w, e);
    w.emit({ type: "charge", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, src: e.id });
    callout(w, e, "CRACK CHARGE");
    return true;
  }
  if (
    act?.kind === "reach" &&
    act.fired &&
    act.toX !== undefined &&
    act.t <= act.dur + 0.1 &&
    cmd.attack &&
    cmd.block &&
    ready(e, "shove", w.time)
  ) {
    const len = Math.hypot(act.toX - t.pos.x, act.toZ! - t.pos.z) + 0.6;
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.structure || o.neutral) continue;
      const dx = o.transform.pos.x - t.pos.x;
      const dz = o.transform.pos.z - t.pos.z;
      const along = dx * act.dirX + dz * act.dirZ;
      if (along < 0 || along - o.radius > len || Math.abs(dx * act.dirZ - dz * act.dirX) > 1.6 + o.radius) continue;
      w.damage(e, o, 35 * w.damageMulOf(e), { fromX: t.pos.x, fromZ: t.pos.z, knockback: 45, stun: 0.5, big: true });
    }
    h.cooldowns.shove = w.time + w.data.heroes.baseline.shove.cooldown;
    w.emit({ type: "slam", x: act.toX, y: t.y, z: act.toZ!, radius: 1.6, team: e.team, src: e.id });
    h.action = null;
    callout(w, e, "ARM SHOVE");
    return true;
  }
  if (cmd.dodge && ready(e, "dodge", w.time) && !act) {
    const dodgeCd = () =>
      (h.cooldowns.dodge = w.time + w.data.heroes.baseline.dodgeSeconds + w.data.heroes.baseline.dodgeCooldown);
    if (isMarksman(w, e) && skyshot(w, e, cmd)) return true;
    if (ab.b.kind === "keg" && startKegRocket(w, e, cmd)) return true;
    if (ab.b.kind === "reel" && bellySlide(w, e, cmd)) return true;
    if (ab.r.kind === "erratum" && startGust(w, e, cmd)) return true;
    if (ab.b.kind === "dredge" && startChainSwing(w, e, cmd)) return true;
    if (ab.b.kind === "fort" && owlHop(w, e, cmd)) return true;
    if (ab.b.kind === "headbutt" && startCurl(w, e, cmd)) return true;
    if (startBuzz(w, e, cmd)) return true;
    if (ab.r.kind === "works" && onWorks(w, e)) {
      for (let d = 11; d >= 5; d -= 1) {
        if (w.startJump(e, t.pos.x + mx * d, t.pos.z + mz * d, 0.9, 4)) {
          dodgeCd();
          callout(w, e, "RAMP JUMP");
          return true;
        }
      }
    }
    if (ab.b.kind === "hex") {
      let best: Entity | null = null;
      let bd = 10;
      for (const o of w.entities) {
        if (
          !o.alive ||
          !o.hero ||
          o.team === e.team ||
          o.status.hexOwner !== e.id ||
          w.time >= o.status.hexUntil ||
          w.mapEvents.sealed(t.pos.x, t.pos.z, o.transform.pos.x, o.transform.pos.z)
        )
          continue;
        const d = w.dist(e, o);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best) {
        const ax = t.pos.x;
        const az = t.pos.z;
        w.emit({ type: "blink", x: ax, y: t.y, z: az, team: e.team, src: e.id });
        w.emit({
          type: "blink",
          x: best.transform.pos.x,
          y: best.transform.y,
          z: best.transform.pos.z,
          team: e.team,
          src: e.id,
        });
        w.teleport(e, best.transform.pos.x, best.transform.pos.z);
        w.teleport(best, ax, az);
        best.status.stunUntil = Math.max(best.status.stunUntil, w.time + 0.4);
        e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.3);
        dodgeCd();
        callout(w, e, "HEX SWAP");
        return true;
      }
    }
    const bn = w.teams[e.team].banner;
    if (ab.b.kind === "banner" && bn && w.time < bn.until) {
      const dx = bn.x - t.pos.x;
      const dz = bn.z - t.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 3 && d < 13 && (dx * mx + dz * mz) / d > 0.6 && w.startJump(e, bn.x + 1, bn.z, 0.7, 2.5)) {
        dodgeCd();
        callout(w, e, "BANNER VAULT");
        return true;
      }
    }
  }
  if (cmd.attack && h.riposteUntil !== undefined && w.time < h.riposteUntil && (!act || act.kind === "parry")) {
    h.riposteUntil = undefined;
    begin(e, "a", "whirl", 0.45, 0.18, Math.sin(t.facing), Math.cos(t.facing));
    callout(w, e, "RIPOSTE WHIRL");
    return true;
  }
  return false;
}

/** Standing on one of the team's siege works. */
export function onWorks(w: World, e: Entity): boolean {
  const i = w.terrain.index(Math.floor(e.transform.pos.x), Math.floor(e.transform.pos.z));
  return w.mods.some((m) => m.kind === "works" && m.team === e.team && m.cells.includes(i));
}
