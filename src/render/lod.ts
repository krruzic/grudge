import * as THREE from "three";
import { MeshoptSimplifier } from "three/examples/jsm/libs/meshopt_simplifier.module.js";

export const LOD = { on: false };

let ready = false;
export const lodReady = MeshoptSimplifier.ready
  .then(() => {
    ready = true;
  })
  .catch(() => {});

const lodOf = new WeakMap<THREE.BufferAttribute, THREE.BufferAttribute | null>();
const fullOf = new WeakMap<THREE.BufferGeometry, THREE.BufferAttribute>();

function simplified(
  geo: THREE.BufferGeometry,
  index: THREE.BufferAttribute,
  ratio: number,
  error: number,
): THREE.BufferAttribute | null {
  const pos = geo.getAttribute("position");
  if (!ready || !pos) return null;
  const known = lodOf.get(index);
  if (known !== undefined) return known;
  let out: THREE.BufferAttribute | null = null;
  if (index.count >= 3000) {
    const p = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      p[i * 3] = pos.getX(i);
      p[i * 3 + 1] = pos.getY(i);
      p[i * 3 + 2] = pos.getZ(i);
    }
    const src = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) src[i] = index.getX(i);
    const target = Math.floor((index.count * ratio) / 3) * 3;
    const [res] = MeshoptSimplifier.simplify(src, p, 3, target, error);
    if (res.length >= 3 && res.length < index.count * 0.8)
      out = new THREE.BufferAttribute(pos.count > 65535 ? res : new Uint16Array(res), 1);
  }
  lodOf.set(index, out);
  return out;
}

export function useLod(mesh: THREE.Mesh, ratio = 0.3, error = 0.012): void {
  const geo = mesh.geometry;
  const full = fullOf.get(geo) ?? geo.index;
  if (!full || full.count < 3000 || !ready) return;
  fullOf.set(geo, full);
  const prev = mesh.onBeforeRender;
  mesh.onBeforeRender = function (...args) {
    const lod = LOD.on ? simplified(geo, full, ratio, error) : null;
    geo.index = lod ?? full;
    prev.apply(this, args);
  };
}

export function hasLod(geo: THREE.BufferGeometry): boolean {
  return fullOf.has(geo);
}
