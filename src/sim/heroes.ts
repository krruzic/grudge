// Heroes: public entry points of the hero simulation. The implementation lives in src/sim/hero/:
//   update.ts      per-tick hero controller (input -> actions -> movement)
//   start.ts       starting an ability (aim, action setup)          fire.ts   ability effects on hitAt
//   kinds/*.ts     per ability-kind effects                          strikes.ts shared hit shapes
//   combos.ts      context combo extenders                           gravewalk.ts, placement.ts, boomerangs.ts
//   marksman.ts, friar.ts, scribe.ts  per-hero mechanics
//   marksman.ts, friar.ts, wreckwitch.ts  per-hero mechanics
// This file only re-exports, so the client (src/main.ts, src/render) keeps a stable import path.
export { placeRanges } from "./hero/placement.ts";
export { graveSpots, type GraveSpot } from "./hero/gravewalk.ts";
export { updateHero } from "./hero/update.ts";
export { forceAbility } from "./hero/start.ts";
export { updateBoomerangs } from "./hero/boomerangs.ts";
