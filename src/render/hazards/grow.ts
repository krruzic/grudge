// Grow-in batching for hazard pieces. Brambles (and fissure zones) are built from many small meshes; they are
// merged into one mesh per material whose vertex shader scales every piece about its own centre (aGrowCenter)
// after a per-piece delay (aGrowDelay.x), with an overshoot ease, optional per-piece yaw and a wind sway.
// Uniforms (GrowU) are shared by all materials of a zone and driven by HazardViews each frame.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KEEP_GEO } from "./materials";

/** Overshoot ease (matches the shader's gE curve). */
export const easeBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
export type GrowU = {
  uGrowT: { value: number };
  uGrowIn: { value: THREE.Vector2 };
  uGrowMul: { value: THREE.Vector2 };
  uSway: { value: THREE.Vector2 };
};
export const GROW_HEAD =
  "attribute vec3 aGrowCenter;\nattribute vec2 aGrowDelay;\nuniform float uGrowT;\nuniform vec2 uGrowIn;\nuniform vec2 uGrowMul;\nuniform vec2 uSway;\n";
export const GROW_BODY = `
float gT = uGrowT - aGrowDelay.x;
float gK = gT / 0.3 - 1.0;
float gE = gT <= 0.0 ? 0.001 : gT >= 0.3 ? 1.0 : 1.0 + 2.7 * gK * gK * gK + 1.7 * gK * gK;
vec2 gS = max(vec2(0.001), gE * uGrowIn) * uGrowMul;
float gC = cos(aGrowDelay.y);
float gN = sin(aGrowDelay.y);
vec3 gD = transformed - aGrowCenter;
gD = vec3(gC * gD.x - gN * gD.z, gD.y, gN * gD.x + gC * gD.z) * vec3(gS.x, gS.y, gS.x);
float gA = uSway.x * sin(uSway.y + aGrowCenter.x);
gD.xy = vec2(cos(gA) * gD.x - sin(gA) * gD.y, sin(gA) * gD.x + cos(gA) * gD.y);
transformed = aGrowCenter + vec3(gC * gD.x + gN * gD.z, gD.y, -gN * gD.x + gC * gD.z);
`;
export function growMat(base: THREE.Material, u: GrowU): THREE.Material {
  const m = base.clone();
  m.userData.keep = false;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader =
      GROW_HEAD + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + GROW_BODY);
  };
  m.customProgramCacheKey = () => "grow";
  return m;
}
export type Piece = { mesh: THREE.Mesh; c?: THREE.Vector3; d?: number; yaw?: number };
/**
 * Merges `pieces` into `parent` (one mesh per material, in parent space). With `u`, each piece's centre `c`,
 * delay `d` and yaw are baked into vertex attributes and the materials get the grow shader.
 */
export function mergeInto(parent: THREE.Object3D, pieces: Piece[], u?: GrowU): void {
  parent.updateMatrixWorld(true);
  const inv = parent.matrixWorld.clone().invert();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of pieces) {
    const src = p.mesh.geometry;
    const geo = src.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, p.mesh.matrixWorld));
    if (!KEEP_GEO.has(src) && !src.userData.model) src.dispose();
    p.mesh.removeFromParent();
    if (u) {
      const n = geo.getAttribute("position").count;
      const c = new Float32Array(n * 3);
      const d = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        c[i * 3] = p.c!.x;
        c[i * 3 + 1] = p.c!.y;
        c[i * 3 + 2] = p.c!.z;
        d[i * 2] = p.d!;
        d[i * 2 + 1] = p.yaw!;
      }
      geo.setAttribute("aGrowCenter", new THREE.BufferAttribute(c, 3));
      geo.setAttribute("aGrowDelay", new THREE.BufferAttribute(d, 2));
    }
    const mat = p.mesh.material as THREE.Material;
    const list = by.get(mat) ?? [];
    list.push(geo);
    by.set(mat, list);
  }
  for (const [mat, geos] of by) {
    const merged = mergeGeometries(
      geos.every((q) => q.index) ? geos : geos.map((q) => (q.index ? q.toNonIndexed() : q)),
    )!;
    merged.computeBoundingSphere();
    if (u) merged.boundingSphere!.radius += 0.6;
    parent.add(new THREE.Mesh(merged, u ? growMat(mat, u) : mat));
  }
}
export function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}
