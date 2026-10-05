// Starting an ability: aim (auto-target / marksman target / placed point), create the HeroAction, apply kind
// specific setup (leap path, dash i-frames, placement clamping) and emit the "act start" event. The effect itself
// happens later, in fire(), once the action reaches its hitAt.
import type { World } from "../world.ts";
import type { Command, Entity } from "../types.ts";
import { abilities } from "../talents.ts";
import { isMarksman, wrenTarget } from "./marksman.ts";
import { aim, aimTarget, begin, reachOf, type Slot } from "./common.ts";
import { placeRange } from "./placement.ts";
import { graveBegin } from "./gravewalk.ts";

export function startAbility(w: World, e: Entity, slot: Slot, cmd: Command): void {
  const def = abilities(w, e)[slot];
  let [dx, dz] = aim(w, e, cmd, reachOf(def) + (def.fx?.charge?.range ?? 0) + 1);
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const wren = slot === "a" && def.kind === "shoot" && isMarksman(w, e);
  if (wren) {
    const sx = mag > 0.3 ? cmd.moveX / mag : Math.sin(e.transform.facing);
    const sz = mag > 0.3 ? cmd.moveZ / mag : Math.cos(e.transform.facing);
    const tg = wrenTarget(
      w,
      e,
      sx,
      sz,
      mag > 0.3,
      (def.range ?? 11) * (w.heroDef(e.hero!.type).hooks.vantageRange ?? 1.2),
    );
    if (tg) {
      const l = Math.hypot(tg.transform.pos.x - e.transform.pos.x, tg.transform.pos.z - e.transform.pos.z) || 1;
      dx = (tg.transform.pos.x - e.transform.pos.x) / l;
      dz = (tg.transform.pos.z - e.transform.pos.z) / l;
    } else {
      dx = sx;
      dz = sz;
    }
  }
  if (slot === "b" && def.fx?.charge) {
    const c = begin(e, slot, "charge", 0.62, 0.42, dx, dz);
    c.hitIds = [];
    w.emit({ type: "charge", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team, src: e.id });
    if (def.callout)
      w.emit({
        type: "callout",
        x: e.transform.pos.x,
        y: e.transform.y,
        z: e.transform.pos.z,
        team: e.team,
        text: def.callout,
        owner: e.id,
      });
    return;
  }
  const a = begin(e, slot, def.kind, def.dur ?? 0.5, def.hitAt ?? 0.25, dx, dz);
  if (wren || def.kind === "erratum") a.stick = mag > 0.3;
  a.fromX2 = e.transform.pos.x;
  a.fromZ2 = e.transform.pos.z;
  if (def.callout)
    w.emit({
      type: "callout",
      x: e.transform.pos.x,
      y: e.transform.y,
      z: e.transform.pos.z,
      team: e.team,
      text: def.callout,
      owner: e.id,
    });
  if (def.kind === "leap") {
    const p = e.transform.pos;
    const target = cmd.place ? null : aimTarget(w, e, cmd, (def.range ?? 7) + 1);
    const pd = cmd.place ? Math.min(def.range ?? 7, Math.hypot(cmd.place.dx, cmd.place.dz)) : (def.range ?? 7);
    const pdx = cmd.place && pd > 0.3 ? cmd.place.dx / Math.hypot(cmd.place.dx, cmd.place.dz) : dx;
    const pdz = cmd.place && pd > 0.3 ? cmd.place.dz / Math.hypot(cmd.place.dx, cmd.place.dz) : dz;
    let tx = p.x + pdx * pd;
    let tz = p.z + pdz * pd;
    if (target) {
      const d = Math.min(def.range ?? 7, w.dist(e, target) - 0.8);
      tx = p.x + dx * d;
      tz = p.z + dz * d;
    }
    for (let k = 0; k <= 10; k++) {
      const f = 1 - k / 10;
      const x = p.x + (tx - p.x) * f;
      const z = p.z + (tz - p.z) * f;
      if (
        Number.isFinite(w.terrain.heightAt(x, z)) &&
        w.nav.open(w.nav.index(Math.floor(x), Math.floor(z))) &&
        !w.mapEvents.sealed(p.x, p.z, x, z)
      ) {
        tx = x;
        tz = z;
        break;
      }
      if (k === 10) {
        tx = p.x;
        tz = p.z;
      }
    }
    a.fromX = p.x;
    a.fromZ = p.z;
    a.toX = tx;
    a.toZ = tz;
    e.status.invulnUntil = w.time + a.hitAt * 0.7;
  }
  if (def.kind === "dash") {
    a.hitIds = [];
    e.status.invulnUntil = w.time + a.dur;
  }
  if (cmd.place && slot !== "a" && def.kind !== "leap" && placeRange(def) !== undefined) {
    const rng = placeRange(def)!;
    let px = cmd.place.dx;
    let pz = cmd.place.dz;
    const d = Math.hypot(px, pz);
    if (d > rng) {
      px *= rng / d;
      pz *= rng / d;
    }
    a.placed = true;
    a.toX = Math.max(1, Math.min(w.terrain.width - 1, e.transform.pos.x + px));
    a.toZ = Math.max(1, Math.min(w.terrain.depth - 1, e.transform.pos.z + pz));
    if (d > 0.3) {
      a.dirX = px / d;
      a.dirZ = pz / d;
      e.transform.facing = Math.atan2(a.dirX, a.dirZ);
    }
  }
  w.emit({
    type: "act",
    src: e.id,
    slot,
    kind: def.kind,
    phase: "start",
    x: e.transform.pos.x,
    y: e.transform.y,
    z: e.transform.pos.z,
    dirX: dx,
    dirZ: dz,
    combo: 0,
    toX: a.toX,
    toZ: a.toZ,
  });
}

/** Start an ability in a given direction, bypassing input/cooldowns (debug and scripted use). */
export function forceAbility(w: World, e: Entity, slot: Slot, dirX: number, dirZ: number): void {
  if (!e.alive || !e.hero) return;
  const def = abilities(w, e)[slot];
  if (def.kind === "gravewalk") graveBegin(w, e, { moveX: dirX, moveZ: dirZ }, def);
  else startAbility(w, e, slot, { moveX: dirX, moveZ: dirZ });
}
