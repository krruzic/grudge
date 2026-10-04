// Hero kit registry. A HeroKit is the per-hero visual layer CombatFx consults before its generic effects:
//   hit(h, ev, src, dx, dz)  custom hit effect for hits *dealt* by the hero; return true to skip the generic sparks
//   act(h, ev, src)          ability phases ("act" events: start / fire / ...) cast by the hero
//   event(h, ev, src)        any other sim event whose source is the hero (or its summon); true swallows it
//   projectile/projectileTick  custom view and per-frame update for the hero's projectiles
//   trail / trailWidth       weapon trail colour/width (costumes override the colour via trailOf)
// All kit code runs under the hero's costume (see fx/atlas.ts), so atlas getters and cv()/tint() theme it.
// Kits register themselves at import (KITS.<heroType> = {...}); kits/index.ts imports them all.
import type * as THREE from "three";
import type { Entity, SimEvent } from "../../sim/types";
import type { FxHost } from "../fx/parts";

type ActEvent = Extract<SimEvent, { type: "act" }>;
export type HitEvent = Extract<SimEvent, { type: "hit" }>;

export interface HeroKit {
  trail?: number;
  trailWidth?: number;
  hit?(h: FxHost, ev: HitEvent, src: Entity, dx: number, dz: number): boolean;
  act?(h: FxHost, ev: ActEvent, src: Entity): void;
  event?(h: FxHost, ev: SimEvent, src: Entity): boolean;
  projectile?(h: FxHost, style: string): THREE.Object3D | null;
  projectileTick?(h: FxHost, obj: THREE.Object3D, x: number, y: number, z: number, dt: number): void;
}

export const KITS: Record<string, HeroKit> = {};
