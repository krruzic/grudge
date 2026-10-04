import * as THREE from "three";
import type { Terrain } from "../sim/terrain";
import beachUrl from "../../assets/fx/beach.png?url";

const SIZES = [0.42, 0.5, 0.48, 0.5, 0.75, 0.7, 0.55, 0.9, 1.15, 0.65, 0.45, 0.85];
const WEIGHTS = [3, 2, 3, 3, 2, 1, 2, 3, 1, 3, 2, 1];

export function beachDebris(t: Terrain): THREE.InstancedMesh | null {
  if (!t.tideCells.length) return null;
  const W = t.width;
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  const mats: THREE.Matrix4[] = [];
  const cells: number[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  for (const i of t.tideCells) {
    const cx = i % W;
    const cz = Math.floor(i / W);
    let h = (cx * 2654435761) ^ (cz * 40503) ^ 0x5bd1e995;
    const rnd = () => (h = (Math.imul(h, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
    const n = rnd() < 0.09 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      let pick = rnd() * total;
      let kind = 0;
      while (pick >= WEIGHTS[kind]) pick -= WEIGHTS[kind++];
      const x = cx + 0.15 + rnd() * 0.7;
      const z = cz + 0.15 + rnd() * 0.7;
      const y = t.groundHeight(x, z);
      if (!Number.isFinite(y)) continue;
      const s = SIZES[kind] * (0.8 + rnd() * 0.45);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2).multiply(flat);
      m.compose(new THREE.Vector3(x, y + 0.03 + k * 0.004, z), q, new THREE.Vector3(s, s, s));
      mats.push(m.clone());
      cells.push(kind);
    }
  }
  if (!mats.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1);
  const cell = new Float32Array(cells.length * 2);
  cells.forEach((k, j) => {
    cell[j * 2] = k % 4;
    cell[j * 2 + 1] = 2 - Math.floor(k / 4);
  });
  geo.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 2));
  const tex = new THREE.TextureLoader().load(beachUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aCell;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = (uv + aCell) * vec2(0.25, 1.0 / 3.0);");
  };
  mat.customProgramCacheKey = () => "beach-debris";
  mat.userData.keep = true;
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, j) => im.setMatrixAt(j, mm));
  im.computeBoundingSphere();
  im.receiveShadow = true;
  im.name = "beach";
  return im;
}
