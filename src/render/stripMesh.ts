import * as THREE from "three";

type Cell = { box: THREE.Box3; start: number; end: number };

const frustum = new THREE.Frustum();
const pv = new THREE.Matrix4();
const IDENT = new THREE.Matrix4();

export function stripMesh(mesh: THREE.Mesh, cell: number, outerCell = cell * 4, field?: THREE.Box3): THREE.Object3D {
  const src = mesh.geometry;
  const pos = src.getAttribute("position");
  if (!pos || Array.isArray(mesh.material)) return mesh;
  const n = pos.count;
  const old = src.index ? src.index.array : null;
  const triCount = Math.floor((old ? old.length : n) / 3);
  if (triCount < 2000) return mesh;
  const vi = (t: number, k: number) => (old ? old[t * 3 + k] : t * 3 + k);
  const rowOf = new Int32Array(triCount);
  const colOf = new Int32Array(triCount);
  const v = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(pos, vi(t, k));
      cx += v.x;
      cz += v.z;
    }
    cx /= 3;
    cz /= 3;
    if (!field || (cz >= field.min.z && cz <= field.max.z)) {
      const z0 = field?.min.z ?? 0;
      rowOf[t] = 0;
      if (!field || (cx >= field.min.x && cx <= field.max.x))
        colOf[t] = Math.floor(cx / cell) * 4096 + Math.floor((cz - z0) / cell);
      else
        colOf[t] =
          ((cx < field.min.x ? -100000 : 100000) + Math.floor(cx / outerCell)) * 4096 +
          Math.floor((cz - z0) / outerCell);
    } else {
      rowOf[t] = cz < field.min.z ? 1 : 2;
      colOf[t] = Math.floor(cx / outerCell);
    }
  }
  const order = new Int32Array(triCount);
  for (let t = 0; t < triCount; t++) order[t] = t;
  order.sort((a, b) => rowOf[a] - rowOf[b] || colOf[a] - colOf[b]);
  const big = n > 65535;
  const idx = big ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  for (let i = 0; i < triCount; i++) {
    const t = order[i];
    idx[i * 3] = vi(t, 0);
    idx[i * 3 + 1] = vi(t, 1);
    idx[i * 3 + 2] = vi(t, 2);
  }
  const index = new THREE.BufferAttribute(idx, 1);
  const group = new THREE.Group();
  group.name = mesh.name;
  group.position.copy(mesh.position);
  group.quaternion.copy(mesh.quaternion);
  group.scale.copy(mesh.scale);
  let i = 0;
  while (i < triCount) {
    const row = rowOf[order[i]];
    const cells: Cell[] = [];
    const rowBox = new THREE.Box3();
    while (i < triCount && rowOf[order[i]] === row) {
      const col = colOf[order[i]];
      const box = new THREE.Box3();
      const start = i;
      while (i < triCount && rowOf[order[i]] === row && colOf[order[i]] === col) {
        for (let k = 0; k < 3; k++) box.expandByPoint(v.fromBufferAttribute(pos, idx[i * 3 + k]));
        i++;
      }
      cells.push({ box, start: start * 3, end: i * 3 });
      rowBox.union(box);
    }
    const geo = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, attr);
    geo.setIndex(index);
    geo.boundingBox = rowBox.clone();
    geo.boundingSphere = rowBox.getBoundingSphere(new THREE.Sphere());
    const first = cells[0].start;
    const last = cells[cells.length - 1].end;
    geo.setDrawRange(first, last - first);
    const part = new THREE.Mesh(geo, mesh.material);
    part.name = mesh.name;
    part.receiveShadow = mesh.receiveShadow;
    part.castShadow = mesh.castShadow;
    part.renderOrder = mesh.renderOrder;
    part.userData = mesh.userData;
    if (cells.length > 1) {
      const world = new THREE.Box3();
      part.onBeforeRender = (_r, _s, cam) => {
        pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        frustum.setFromProjectionMatrix(pv);
        const ident = part.matrixWorld.equals(IDENT);
        const seen = (c: number) =>
          frustum.intersectsBox(ident ? cells[c].box : world.copy(cells[c].box).applyMatrix4(part.matrixWorld));
        let a = 0;
        while (a < cells.length && !seen(a)) a++;
        if (a === cells.length) a = -1;
        let b = a < 0 ? -1 : cells.length - 1;
        while (b > a && !seen(b)) b--;
        if (a < 0) geo.setDrawRange(0, 0);
        else geo.setDrawRange(cells[a].start, cells[b].end - cells[a].start);
      };
    }
    group.add(part);
  }
  return group;
}
