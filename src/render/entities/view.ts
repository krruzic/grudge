// View: the render-side state kept per sim entity by EntityViews, and disposeTree() for freeing a view.
import * as THREE from "three";
import type { Entity } from "../../sim/types";
import type { hullMaterial } from "../heroModels";
import type { Bar } from "./bars";

export interface View {
  heroType?: string;
  popAt?: number;
  batched?: THREE.SkinnedMesh;
  blobs?: THREE.Mesh[];
  rings?: THREE.Mesh[];
  dome?: THREE.Mesh;
  gear?: THREE.Sprite;
  graveRing?: THREE.Mesh;
  auraT?: number;
  kind: Entity["kind"];
  root: THREE.Group;
  body: THREE.Object3D;
  weapon?: THREE.Object3D;
  held?: THREE.Object3D[];
  pipNodes?: THREE.Object3D[];
  spin?: THREE.Object3D;
  level2?: THREE.Object3D;
  level3?: Map<string, THREE.Object3D>;
  mixer?: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current?: string;
  bar: Bar;
  ring?: THREE.Mesh;
  shield?: THREE.Mesh;
  work?: Bar;
  blockFx?: THREE.Mesh;
  lastAction?: object | null;
  seen: boolean;
  fallY?: number;
  fallV?: number;
  wasDead?: boolean;
  ward?: { hulls: THREE.Mesh[]; line: ReturnType<typeof hullMaterial>; glow: ReturnType<typeof hullMaterial> };
  wardK?: number;
  /** Gristle's Dig In: red hull outline (dig) and its fade (digK). */
  dig?: { hulls: THREE.Mesh[]; line: ReturnType<typeof hullMaterial>; glow: ReturnType<typeof hullMaterial> };
  digK?: number;
  /** Wreck Witch: eased Tide Rising stacks driving her size. */
  tideK?: number;
  stealthed?: boolean;
  baseVisible?: boolean;
  mark?: THREE.Sprite;
  markKind?: string;
  lastAttack?: number;
  hitUntil?: number;
  deadAt?: number;
  mats: THREE.MeshLambertMaterial[];
  flash: number;
  joltX: number;
  joltZ: number;
  freeze: number;
  stepDist: number;
  trailT?: number;
  lastX?: number;
  lastZ?: number;
  rank?: number;
  badge?: THREE.Sprite;
  chargeAura?: THREE.Group;
  hands?: { hand: THREE.Object3D; arm: THREE.Object3D; last: THREE.Vector3 }[];
  framed?: boolean;
  wade?: number;
  wadeY?: number;
  wadeT?: number;
  wadeR?: number;
}
export const WHITE = new THREE.Color(1, 1, 1);

/** Materials shared between views (marks, hints, silhouettes); disposeTree() never disposes these. */
export const SHARED_VIEW_MATS = new Set<THREE.Material>();
/**
 * Frees geometry/materials under `root`. Skips geometry flagged userData.model (shared model data), sprite
 * geometry, shared materials and materials flagged userData.keep; textures are only freed when flagged owned.
 */
export function disposeTree(root: THREE.Object3D, shared: Set<THREE.Material> = SHARED_VIEW_MATS): void {
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (geo && !geo.userData.model && !(o instanceof THREE.Sprite)) geo.dispose();
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (shared.has(mat) || mat.userData.keep) continue;
      const map = (mat as THREE.SpriteMaterial).map;
      if (map?.userData.owned) map.dispose();
      mat.dispose();
    }
  });
}
