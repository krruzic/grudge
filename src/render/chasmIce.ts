// Ice crystal clusters growing out of the chasm walls on chasm maps. Built here rather than loaded: faceted
// six-sided crystals with pointed tips, a few to a cluster radiating from one base, coloured deep blue at the root
// to pale cyan at the tip with alternating light / dark facets (painted look, crisp at any zoom). Clusters are
// spaced on a jittered grid so they never pile into each other, and lean out from the wall they grow on.
import * as THREE from "three";
import type { Terrain } from "../sim/terrain";

const ROOT = new THREE.Color("#3f74b4");
const MID = new THREE.Color("#93c9f0");
const TIP = new THREE.Color("#f4fcff");

type Rnd = () => number;

function seeded(seed: number): Rnd {
  let h = seed | 0;
  return () => (h = (h * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/**
 * One crystal (local +y up, base at the origin): a `sides`-sided prism of radius r and height h tapering slightly,
 * capped by a pyramid of height tip. Pushes non-indexed positions and colours (flat facets).
 */
function crystal(
  pos: number[],
  col: number[],
  m: THREE.Matrix4,
  sides: number,
  r: number,
  h: number,
  tip: number,
  shade: number,
): void {
  const ring = (y: number, rr: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr).applyMatrix4(m);
    });
  const lo = ring(-0.3, r * 0.82);
  const hi = ring(h, r);
  const apex = new THREE.Vector3(0, h + tip, 0).applyMatrix4(m);
  const c = new THREE.Color();
  const tri = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    d: THREE.Vector3,
    ca: THREE.Color,
    cb: THREE.Color,
    cd: THREE.Color,
  ) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
    col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cd.r, cd.g, cd.b);
  };
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    // Alternate facets light / dark so the edges read.
    const f = (i % 2 ? 0.86 : 1.08) * shade;
    const root = c.copy(ROOT).multiplyScalar(f).clone();
    const mid = c.copy(MID).multiplyScalar(f).clone();
    const top = c
      .copy(TIP)
      .multiplyScalar(Math.min(1, f + 0.04))
      .clone();
    tri(lo[i], hi[j], hi[i], root, mid, mid);
    tri(lo[i], lo[j], hi[j], root, root, mid);
    tri(hi[i], hi[j], apex, mid, mid, top);
  }
}

/** A cluster: one tall centre crystal and `n - 1` smaller ones leaning out around it. */
function cluster(seed: number, n: number, sides: number): THREE.BufferGeometry {
  const rnd = seeded(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let k = 0; k < n; k++) {
    const main = k === 0;
    const a = rnd() * Math.PI * 2;
    const lean = main ? rnd() * 0.15 : 0.35 + rnd() * 0.45;
    const off = main ? 0 : 0.3 + rnd() * 0.3;
    e.set(Math.sin(a) * lean, rnd() * Math.PI, -Math.cos(a) * lean, "YXZ");
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(Math.cos(a) * off, 0, Math.sin(a) * off), q, new THREE.Vector3(1, 1, 1));
    const h = main ? 1.3 + rnd() * 0.5 : 0.5 + rnd() * 0.7;
    const r = main ? 0.42 + rnd() * 0.08 : 0.2 + rnd() * 0.12;
    crystal(pos, col, m, sides, r, h, r * (1.5 + rnd() * 0.6), 0.9 + rnd() * 0.2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function chasmIce(t: Terrain): THREE.Group | null {
  const below = t.chasm;
  if (below === undefined) return null;
  // Four cluster shapes for the walls, two sparser ones for the deep pits (seen from far above).
  const kinds = [
    cluster(11, 7, 6),
    cluster(23, 6, 6),
    cluster(37, 8, 6),
    cluster(41, 5, 6),
    cluster(53, 5, 5),
    cluster(67, 4, 5),
  ];
  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 70,
    specular: new THREE.Color("#a8dcff"),
    emissive: new THREE.Color("#16345e"),
  });
  const W = t.width;
  const D = t.depth;
  const buckets = new Map<string, THREE.Matrix4[]>();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  // One candidate per jittered 1.3 m grid cell: crowded, but never two in one spot.
  const STEP = 1.3;
  for (let gz = 0; gz * STEP < D; gz++) {
    for (let gx = 0; gx * STEP < W; gx++) {
      const rnd = seeded((gx * 73856093) ^ (gz * 19349663) ^ 0x5bd1e995);
      const x = (gx + 0.15 + rnd() * 0.7) * STEP;
      const z = (gz + 0.15 + rnd() * 0.7) * STEP;
      if (x >= W || z >= D) continue;
      const cx = Math.floor(x);
      const cz = Math.floor(z);
      const g = t.groundHeight(x, z);
      if (!(g < below)) continue;
      const pit = !Number.isFinite(t.heightAt(x, z));
      if (pit && t.styles[t.index(cx, cz)] !== "rim") continue;
      if (rnd() > (pit ? 0.85 : 0.97)) continue;
      // Lean out from the wall: tilt part way toward the downhill direction.
      const gxp = t.groundHeight(x + 0.8, z) - t.groundHeight(x - 0.8, z);
      const gzp = t.groundHeight(x, z + 0.8) - t.groundHeight(x, z - 0.8);
      const n = new THREE.Vector3(
        -(Number.isFinite(gxp) ? gxp : 0),
        1.6,
        -(Number.isFinite(gzp) ? gzp : 0),
      ).normalize();
      n.lerp(up, 0.45).normalize();
      q.setFromUnitVectors(up, n);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(up, rnd() * Math.PI * 2));
      // Deeper in the chasm, bigger crystals; a few small scatter clusters between.
      const depth = Math.min(1, Math.max(0, (below - g) / 3));
      const small = rnd() < 0.3;
      const s = (small ? 0.45 + rnd() * 0.25 : 0.85 + rnd() * 0.45 + depth * 0.4) * (pit ? 1.4 : 1);
      m.compose(new THREE.Vector3(x, g - 0.15, z), q, new THREE.Vector3(s, s * (0.9 + rnd() * 0.25), s));
      const kind = pit ? 4 + Math.floor(rnd() * 2) : Math.floor(rnd() * 4);
      const key = `${kind}:${x < W / 2 ? 0 : 1}${z < D / 2 ? 0 : 1}`;
      const list = buckets.get(key) ?? [];
      list.push(m.clone());
      buckets.set(key, list);
    }
  }
  const out = new THREE.Group();
  for (const [key, list] of buckets) {
    const im = new THREE.InstancedMesh(kinds[Number(key.split(":")[0])], mat, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.computeBoundingSphere();
    im.castShadow = false;
    im.receiveShadow = true;
    out.add(im);
  }
  return out;
}
