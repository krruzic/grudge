// Placeable abilities: which ability kinds can be aimed at a ground point (hold the button to show a reticle), and
// their max placement range. Read by the client (reticle/aim UI via placeRanges) and by startAbility.
import type { World } from "../world.ts";
import type { Entity } from "../types.ts";
import type { AbilityDef } from "../config.ts";
import { abilities } from "../talents.ts";
import { ready } from "./common.ts";
import { graveSpots } from "./gravewalk.ts";

/** Placeable ability kinds -> max placement range (0 = use the ability's own range, default 8). */
const PLACEABLE: Record<string, number> = {
  wall: 9,
  works: 8,
  zone: 9,
  summon: 7,
  leap: 0,
  hex: 0,
  banner: 0,
  blink: 0,
  rootcage: 0,
  turret: 7,
  pip: 0,
  volley: 0,
  keg: 0,
  powderkeg: 0,
  fort: 8,
  dome: 0,
};

export function placeRange(def: AbilityDef): number | undefined {
  const r = PLACEABLE[def.kind];
  if (r === undefined) return undefined;
  return r || (def.range ?? 8);
}

export function placeRanges(
  w: World,
  e: Entity,
): {
  facing: number;
  hx: number;
  hz: number;
  b?: number;
  r?: number;
  z?: number;
  spots?: { x: number; z: number }[];
  ready: { b: boolean; r: boolean; z: boolean };
} {
  const ab = abilities(w, e);
  const h = e.hero!;
  const grave = ab.r.kind === "gravewalk";
  return {
    facing: e.transform.facing,
    hx: e.transform.pos.x,
    hz: e.transform.pos.z,
    b: placeRange(ab.b),
    r: grave ? 999 : placeRange(ab.r),
    z: placeRange(ab.z),
    spots: grave ? graveSpots(w, e).map((s) => ({ x: s.x, z: s.z })) : undefined,
    ready: {
      b: ready(e, "b", w.time),
      r: ready(e, "r", w.time) && !(grave && w.arena.carrying(e)),
      z: h.meter >= w.data.heroes.baseline.superMax,
    },
  };
}
