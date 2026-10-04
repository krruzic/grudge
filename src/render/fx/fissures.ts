// 3D ground fissures: crack/lava/moss decal textures (FISSURE_TEX) are drawn as jagged trenches with raised lips
// and a glowing core instead of a flat quad; zoneFissures builds a static set for crater/lava zones. Costume
// skins can swap the lip/cut materials and remap the style (e.g. Sporeblight cracks -> moss).
import * as THREE from "three";
import { FxBatch, fxBatch, FxInst } from "./instances";
import { activeCostume, tint } from "./atlas";
import lavaUrl from "../../../assets/fx/lava.png?url";
import type { FxHost } from "./parts";
import { COSTUME_SKIN } from "./chunks";

export type FissureStyle = "crack" | "lava" | "moss";
export const FISSURE_TEX = new Map<THREE.Texture, FissureStyle>();
export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
boxGeo.userData.model = true;
export const FIS_MAT: Record<FissureStyle, THREE.Material> = {
  crack: new THREE.MeshLambertMaterial({ color: 0x1c140c, flatShading: true }),
  lava: new THREE.MeshLambertMaterial({ color: 0x24140a, flatShading: true }),
  moss: new THREE.MeshLambertMaterial({ color: 0x1e2a10, flatShading: true }),
};
export const lavaTex = new THREE.TextureLoader().load(lavaUrl);
lavaTex.colorSpace = THREE.SRGBColorSpace;
export const crackPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
crackPlane.userData.model = true;
export const LAVA_CORE = new THREE.MeshBasicMaterial({
  map: lavaTex,
  alphaTest: 0.4,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
});
export const LIP_MAT = new THREE.MeshLambertMaterial({ color: 0x6a5238, flatShading: true });
export const MOSS_LIP = new THREE.MeshLambertMaterial({ color: 0x3a5a1c, flatShading: true });
for (const m of [...Object.values(FIS_MAT), LAVA_CORE, LIP_MAT, MOSS_LIP]) m.userData.keep = true;

export function buildFissures(
  gy: (x: number, z: number) => number,
  r: number,
  style: FissureStyle,
  seed = Math.random(),
): { group: THREE.Group; parts: { o: THREE.Object3D; d: number }[] } {
  let sd = Math.floor(seed * 1e6) || 1;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group();
  const parts: { o: THREE.Object3D; d: number }[] = [];
  const n = Math.max(4, Math.round(4 + r * 1.6));
  const wk = Math.min(1.6, Math.max(0.6, r / 3));
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + rnd() * 0.6;
    const reach = r * (0.65 + rnd() * 0.35);
    const segs = 5;
    let px = Math.cos(a) * r * 0.08;
    let pz = Math.sin(a) * r * 0.08;
    for (let s2 = 1; s2 <= segs; s2++) {
      a += (rnd() - 0.5) * 0.7;
      const d = r * 0.08 + (reach - r * 0.08) * (s2 / segs);
      const nx = Math.cos(a) * d;
      const nz = Math.sin(a) * d;
      const len = Math.hypot(nx - px, nz - pz);
      const w = (0.3 - s2 * 0.04) * wk * (0.8 + rnd() * 0.4);
      const mx = (px + nx) / 2;
      const mz = (pz + nz) / 2;
      const yaw = -Math.atan2(nz - pz, nx - px);
      const seg = new THREE.Group();
      seg.position.set(mx, gy(mx, mz), mz);
      seg.rotation.y = yaw;
      seg.rotation.z = Math.atan2(gy(nx, nz) - gy(px, pz), len);
      if (style === "lava") {
        const core = new THREE.Mesh(crackPlane, LAVA_CORE);
        core.scale.set(len + w * 1.4, 1, w * 2.6 * (rnd() < 0.5 ? -1 : 1));
        core.position.y = 0.05;
        seg.add(core);
      } else {
        const cut = new THREE.Mesh(boxGeo, FIS_MAT[style]);
        cut.scale.set(len + w * 0.6, 0.08, w);
        cut.position.y = 0.01;
        seg.add(cut);
      }
      for (const side of [-1, 1]) {
        if (rnd() < 0.45) continue;
        const lip = new THREE.Mesh(boxGeo, style === "moss" ? MOSS_LIP : LIP_MAT);
        const ls = w * (0.5 + rnd() * 0.6);
        lip.scale.set(ls * 1.4, ls * 0.6, ls);
        lip.position.set((rnd() - 0.5) * len * 0.6, ls * 0.15, side * (w * 0.5 + ls * 0.3));
        lip.rotation.set(rnd() * 0.6, rnd() * 3, side * (0.3 + rnd() * 0.4));
        seg.add(lip);
      }
      group.add(seg);
      parts.push({ o: seg, d });
      px = nx;
      pz = nz;
    }
  }
  return { group, parts };
}

export const SKIN_MATS = new Map<string, THREE.Material>();
export function zoneFissures(
  gy: (x: number, z: number) => number,
  r: number,
  style: FissureStyle,
  costume = "",
): THREE.Group {
  const sk = COSTUME_SKIN[costume];
  const group = buildFissures(gy, r, sk?.fissure?.[style] ?? style).group;
  if (!sk?.fisMat) return group;
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const role = o.material === LAVA_CORE ? "core" : o.material === LIP_MAT || o.material === MOSS_LIP ? "lip" : "cut";
    const make = sk.fisMat?.[role];
    if (!make) return;
    const key = `${costume}|${role}`;
    let m = SKIN_MATS.get(key);
    if (!m) SKIN_MATS.set(key, (m = make()));
    o.material = m;
    if (role === "lip" && sk.lipFlat) o.scale.set(o.scale.x * 1.5, o.scale.y * sk.lipFlat, o.scale.z * 1.5);
  });
  return group;
}

export const FIS_KEYS = new Map<THREE.Material, string>([
  [FIS_MAT.crack, "fc"],
  [FIS_MAT.lava, "fl"],
  [FIS_MAT.moss, "fm"],
  [LAVA_CORE, "fk"],
  [LIP_MAT, "fp"],
  [MOSS_LIP, "fq"],
]);

export function fissures(
  h: FxHost,
  x: number,
  y: number,
  z: number,
  r: number,
  style: FissureStyle,
  life: number,
  grow = 0.25,
): void {
  const ground = (px: number, pz: number) => (h.world ? h.world.groundY(x + px, z + pz) : y) - y;
  const { group, parts } = buildFissures(ground, r, style);
  group.position.set(x, y, z);
  group.updateMatrixWorld(true);
  const pieces: { inst: FxInst; s: THREE.Vector3; y: number; at: number }[] = [];
  const reveal = grow / Math.max(0.1, r);
  for (const p of parts) {
    for (const o of p.o.children) {
      if (!(o instanceof THREE.Mesh)) continue;
      const mat = o.material as THREE.Material;
      const key = `${FIS_KEYS.get(mat) ?? "fx"}${activeCostume()}`;
      const role = mat === LAVA_CORE ? "core" : mat === LIP_MAT || mat === MOSS_LIP ? "lip" : "cut";
      const sk = COSTUME_SKIN[activeCostume()];
      const inst = fxBatch(h.root, key, () => {
        const alt = sk?.fisMat?.[role]?.();
        if (alt) return new FxBatch(o.geometry, alt);
        const mc = mat.clone() as THREE.MeshLambertMaterial;
        if (mc.color) mc.color.setHex(tint(mc.color.getHex()));
        return new FxBatch(o.geometry, mc);
      }).spawn();
      const sc = new THREE.Vector3();
      o.matrixWorld.decompose(inst.position, inst.quaternion, sc);
      if (role === "lip" && sk?.lipFlat) sc.set(sc.x * 1.5, sc.y * sk.lipFlat, sc.z * 1.5);
      inst.scale.set(0, 0, 0);
      pieces.push({ inst, s: sc, y: inst.position.y, at: reveal * p.d });
    }
  }
  const root = new THREE.Group();
  h.root.add(root);
  h.add(root, life, (k) => {
    const t = k * life;
    const drop = k > 0.8 ? ((k - 0.8) / 0.2) * 0.25 : 0;
    for (const q of pieces) {
      if (k >= 1) q.inst.removeFromParent();
      else if (t >= q.at) q.inst.scale.copy(q.s);
      else q.inst.scale.set(0, 0, 0);
      q.inst.position.y = q.y - drop;
    }
  });
}
