// See-through silhouettes: units and heroes behind walls show as a flat team-coloured shape. Each real mesh
// writes stencil 1 where it is drawn; a proxy mesh in silScene (rendered after the main scene, renderOrder
// SIL_ORDER) draws only where it is *behind* depth (GreaterDepth) and the stencil isn't 1, i.e. where something
// else covers the unit but the unit itself isn't visible. syncSilhouettes copies world matrices each view.
import * as THREE from "three";
import { clipBelowWater } from "./wading";
import { SHARED_VIEW_MATS } from "./view";

const silMats = new Map<string, THREE.MeshBasicMaterial>();
let silColors: THREE.Color[] = [];

/** Team colours for silhouettes; materials are rebuilt when a match uses a different palette. */
export function setSilhouetteColors(colors: THREE.Color[]): void {
  if (silColors === colors) return;
  silColors = colors;
  silMats.clear();
}
export function silMat(team: number, skinned: boolean): THREE.MeshBasicMaterial {
  const key = `${team}|${skinned}`;
  let m = silMats.get(key);
  if (!m) {
    m = clipBelowWater(
      new THREE.MeshBasicMaterial({
        color: (silColors[team] ?? new THREE.Color(1, 1, 1)).clone().multiplyScalar(0.8),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.NotEqualStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: THREE.ReplaceStencilOp,
        fog: false,
      }),
    );
    silMats.set(key, m);
    SHARED_VIEW_MATS.add(m);
  }
  return m;
}
interface SilEntry {
  proxy: THREE.Mesh;
  src: THREE.Mesh;
}
export const silScene = new THREE.Scene();
silScene.matrixWorldAutoUpdate = false;
silScene.matrixAutoUpdate = false;
const SIL_ORDER = 1000;
const silList: SilEntry[] = [];
/** Copies each proxy's world matrix from its source, hides it with its source, drops proxies of removed meshes. */
export function syncSilhouettes(scene: THREE.Object3D): void {
  for (let i = silList.length - 1; i >= 0; i--) {
    const { proxy, src } = silList[i];
    let o: THREE.Object3D | null = src;
    let vis = true;
    while (o && o !== scene) {
      if (!o.visible) vis = false;
      o = o.parent;
    }
    if (!o) {
      silScene.remove(proxy);
      silList.splice(i, 1);
      continue;
    }
    proxy.visible = vis;
    if (!vis) continue;
    proxy.matrixWorld.copy(src.matrixWorld);
    if (proxy instanceof THREE.SkinnedMesh && src instanceof THREE.SkinnedMesh)
      proxy.bindMatrixInverse.copy(src.bindMatrixInverse);
  }
}
/** Adds silhouette proxies for every mesh under `obj` (skipping userData.noSil) and makes them write stencil. */
export function markSilhouette(obj: THREE.Object3D, team: number): void {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noSil && !o.userData.silProxy) meshes.push(o);
  });
  for (const o of meshes) {
    const skinned = o instanceof THREE.SkinnedMesh;
    const proxy = skinned
      ? new THREE.SkinnedMesh(o.geometry, silMat(team, true))
      : new THREE.Mesh(o.geometry, silMat(team, false));
    if (proxy instanceof THREE.SkinnedMesh && o instanceof THREE.SkinnedMesh) proxy.bind(o.skeleton, o.bindMatrix);
    proxy.userData.silProxy = true;
    proxy.frustumCulled = o.frustumCulled;
    proxy.matrixAutoUpdate = false;
    proxy.renderOrder = SIL_ORDER;
    silScene.add(proxy);
    silList.push({ proxy, src: o });
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      m.stencilWrite = true;
      m.stencilRef = 1;
      m.stencilFunc = THREE.AlwaysStencilFunc;
      m.stencilZPass = THREE.ReplaceStencilOp;
    }
  }
}
