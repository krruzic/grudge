// Shared meshes, materials and colours for CombatFx and its helpers. Everything in SHARED_GEO / SHARED_MAT (and
// anything flagged userData.model / userData.keep) is reused across effects, so CombatFx.update and the
// projectile/missile cleanup skip disposing it when an effect ends.
import * as THREE from "three";
import ironUrl from "../../../assets/textures/iron.png?url";
import woodUrl from "../../../assets/textures/wood.png?url";

// Repair: flying planks and the hammer that nails them on.
const woodTex = new THREE.TextureLoader().load(woodUrl);
woodTex.colorSpace = THREE.SRGBColorSpace;
export const woodMat = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xe8c8a0, flatShading: true });
const hammerHeadMat = new THREE.MeshLambertMaterial({ map: null, color: 0x70707a, flatShading: true });
export const plankGeo = new THREE.BoxGeometry(1.1, 0.12, 0.32);
const handleGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.1, 5);
const headGeo = new THREE.BoxGeometry(0.55, 0.3, 0.3);
export function hammerMesh(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(handleGeo, woodMat);
  handle.position.y = 0.55;
  const head = new THREE.Mesh(headGeo, hammerHeadMat);
  head.position.y = 1.1;
  g.add(handle, head);
  return g;
}

// Arena cannon ball.
const ironTex = new THREE.TextureLoader().load(ironUrl);
ironTex.colorSpace = THREE.SRGBColorSpace;
export const ballGeo = new THREE.IcosahedronGeometry(0.5, 1);
export const ballMat = new THREE.MeshLambertMaterial({ map: ironTex, color: 0x6a6660, flatShading: true });

export const shardGeo = new THREE.TetrahedronGeometry(0.22);
export const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
export const ringGeo = new THREE.RingGeometry(0.85, 1, 32);
export const quadGeo = new THREE.PlaneGeometry(2, 2);
export const shadowGeo = new THREE.CircleGeometry(0.55, 12);
export const pillarGeo = new THREE.CylinderGeometry(0.9, 1.3, 7, 10, 1, true);

export const SHARED_GEO = new Set<THREE.BufferGeometry>([
  plankGeo,
  handleGeo,
  headGeo,
  shardGeo,
  chunkGeo,
  ballGeo,
  ringGeo,
  quadGeo,
  shadowGeo,
  pillarGeo,
]);
export const SHARED_MAT = new Set<THREE.Material>([woodMat, hammerHeadMat, ballMat]);

export const hitTint = new THREE.Color(1, 0.9, 0.6);
export const WHITE = new THREE.Color(1, 1, 1);
/** Scratch colour; only valid until the next call that uses it. */
export const tmpColor = new THREE.Color();
