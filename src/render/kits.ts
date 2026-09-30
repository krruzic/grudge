import type * as THREE from "three";
import type { Entity, SimEvent } from "../sim/types";
import type { FxHost } from "./fxParts";

export type ActEvent = Extract<SimEvent, { type: "act" }>;
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
