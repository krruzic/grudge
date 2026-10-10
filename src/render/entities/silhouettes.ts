// See-through silhouettes: units and heroes behind walls show as a flat team-coloured shape. Each real mesh
// writes stencil 1 where it is drawn; a proxy mesh in silScene (rendered after the main scene, renderOrder
// SIL_ORDER) draws only where it is *behind* depth (GreaterDepth) and the stencil isn't 1, i.e. where something
// else covers the unit but the unit itself isn't visible. syncSilhouettes copies world matrices each view.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
  /** Merged proxy: every piece it stands for (shown while any of them is). */
  srcs?: THREE.Mesh[];
}

/** Shape-only merged geometries (position + skinning) per set of source geometries, shared by every copy. */
const mergedShapes = new Map<string, THREE.BufferGeometry | null>();
function mergedShape(list: THREE.SkinnedMesh[]): THREE.BufferGeometry | null {
  const key = list.map((m) => m.geometry.uuid).join("|");
  let g = mergedShapes.get(key);
  if (g === undefined) {
    const parts = list.map((m) => {
      const s = new THREE.BufferGeometry();
      for (const a of ["position", "skinIndex", "skinWeight"]) {
        const attr = m.geometry.getAttribute(a);
        if (!attr) return null;
        s.setAttribute(a, attr);
      }
      s.index = m.geometry.index;
      return s;
    });
    g = parts.every(Boolean) ? mergeGeometries(parts as THREE.BufferGeometry[], false) : null;
    if (g) g.userData.model = true;
    mergedShapes.set(key, g);
  }
  return g;
}
export const silScene = new THREE.Scene();
silScene.matrixWorldAutoUpdate = false;
silScene.matrixAutoUpdate = false;
const SIL_ORDER = 1000;
const silList: SilEntry[] = [];
/** Copies each proxy's world matrix from its source, hides it with its source, drops proxies of removed meshes. */
export function syncSilhouettes(scene: THREE.Object3D): void {
  for (let i = silList.length - 1; i >= 0; i--) {
    const { proxy, src, srcs } = silList[i];
    // Merged pieces: the shared parent chain must be visible and at least one piece.
    let o: THREE.Object3D | null = srcs ? src.parent : src;
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
    if (srcs && vis) vis = srcs.some((m) => m.visible);
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
  // A champion's skinned pieces (body, trim, weapon...) share a skeleton: one merged silhouette shape for them,
  // one draw per view instead of one per piece (a silhouette needs no materials).
  const bySkel = new Map<string, THREE.SkinnedMesh[]>();
  for (const o of meshes) {
    if (!(o instanceof THREE.SkinnedMesh) || o.geometry.morphAttributes.position) continue;
    const k = `${o.skeleton.uuid}|${o.parent?.uuid}|${o.bindMatrix.elements.join(",")}`;
    const l = bySkel.get(k) ?? [];
    l.push(o);
    bySkel.set(k, l);
  }
  const merged = new Set<THREE.Mesh>();
  for (const list of bySkel.values()) {
    if (list.length < 2) continue;
    const g = mergedShape(list);
    if (!g) continue;
    const o = list[0];
    const proxy = new THREE.SkinnedMesh(g, silMat(team, true));
    proxy.bind(o.skeleton, o.bindMatrix);
    proxy.userData.silProxy = true;
    proxy.frustumCulled = o.frustumCulled;
    proxy.matrixAutoUpdate = false;
    proxy.renderOrder = SIL_ORDER;
    silScene.add(proxy);
    silList.push({ proxy, src: o, srcs: list });
    for (const m of list) merged.add(m);
  }
  for (const o of meshes) {
    if (merged.has(o)) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.stencilWrite = true;
        m.stencilRef = 1;
        m.stencilFunc = THREE.AlwaysStencilFunc;
        m.stencilZPass = THREE.ReplaceStencilOp;
      }
      continue;
    }
    const skinned = o instanceof THREE.SkinnedMesh;
    const proxy = skinned
      ? new THREE.SkinnedMesh(o.geometry, silMat(team, true))
      : new THREE.Mesh(o.geometry, silMat(team, false));
    if (proxy instanceof THREE.SkinnedMesh && o instanceof THREE.SkinnedMesh) {
      proxy.bind(o.skeleton, o.bindMatrix);
      // Share the source's culling sphere (else three.js skins every vertex on the CPU to compute one).
      if (o.boundingSphere) proxy.boundingSphere = o.boundingSphere;
    }
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
