// Melee ability kinds: slam (ground pound in front), leap (jump to a point and land with an AoE) and quake.
import type { World } from "../../world.ts";
import type { Entity, HeroAction } from "../../types.ts";
import type { AbilityDef } from "../../config.ts";
import { addShield, markTargets, pullTo, zoneAt } from "../../talents.ts";
import { aoe, slamAt } from "../strikes.ts";

/** Ground slam `offset` in front of the hero (echo/pull/zone talents via slamAt). */
export function fireSlam(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const cx = t.pos.x + a.dirX * (def.offset ?? 1);
  const cz = t.pos.z + a.dirZ * (def.offset ?? 1);
  slamAt(w, e, cx, cz, def.radius ?? 3, def, mul, a.dirX, a.dirZ);
}

/** Landing of a leap (the arc itself is animated in tickAction); B leaps also mark/zone/shield via talents. */
export function fireLeap(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const r = def.radius ?? 5;
  if (def.fx?.pull) pullTo(w, e, t.pos.x, t.pos.z, r + 1.5);
  w.emit({ type: "slam", x: t.pos.x, y: t.y, z: t.pos.z, radius: r, team: e.team, src: e.id });
  const hit = aoe(w, e, t.pos.x, t.pos.z, r, def, mul);
  if (a.name === "b") {
    markTargets(w, e, hit);
    if (def.fx?.zoneAfter) zoneAt(w, e, t.pos.x, t.pos.z, r, def.fx.zoneAfter);
    if (def.fx?.landShield) addShield(e, def.fx.landShield, def.fx.landShield, 5, w.time);
  }
}

export function fireQuake(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  w.emit({ type: "slam", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.radius ?? 5, team: e.team, src: e.id });
  aoe(w, e, t.pos.x, t.pos.z, def.radius ?? 5, def, mul);
  if (def.fx?.zoneAfter) zoneAt(w, e, t.pos.x, t.pos.z, def.radius ?? 5, def.fx.zoneAfter);
}
