import * as THREE from "three";
import type { World } from "../../sim/world";
import type { Particles } from "./particles";
import stoneUrl from "../../../assets/textures/stone.png?url";
import lavaUrl from "../../../assets/fx/lava.png?url";
import { FxBatch, fxBatch, FxInst } from "./instances";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { activeCostume, baseTex, cv, hd, tint } from "./atlas";

export interface FxHost {
  root: THREE.Group;
  particles?: Particles;
  world?: World;
  shake: number;
  add(obj: THREE.Object3D, dur: number, tick: (k: number, dt: number) => void): void;
  after(seconds: number, run: () => void): void;
}

type Range = [number, number];
const rr = (r: Range) => r[0] + Math.random() * (r[1] - r[0]);
const UP = new THREE.Vector3(0, 1, 0);

export interface EmitOpts {
  tex: THREE.Texture;
  n: number;
  x: number;
  y: number;
  z: number;
  color?: THREE.ColorRepresentation;
  additive?: boolean;
  opacity?: number;
  size: Range;
  grow?: number;
  life: Range;
  speed: Range;
  dir?: { x: number; y: number; z: number };
  cone?: number;
  flatSpread?: boolean;
  up?: Range;
  gravity?: number;
  drag?: number;
  spin?: number;
  floor?: number;
  jitter?: number;
  fadeIn?: number;
  depthTest?: boolean;
  order?: number;
}

function randomDir(dir: THREE.Vector3 | null, cone: number, flat: boolean): THREE.Vector3 {
  if (flat) {
    const a = Math.random() * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  }
  if (!dir || cone >= Math.PI) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
  }
  const cosMax = Math.cos(cone);
  const cz = cosMax + Math.random() * (1 - cosMax);
  const sz = Math.sqrt(1 - cz * cz);
  const a = Math.random() * Math.PI * 2;
  const local = new THREE.Vector3(sz * Math.cos(a), cz, sz * Math.sin(a));
  return local.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir));
}

export function emit(h: FxHost, o: EmitOpts): void {
  if (activeCostume()) o = { ...o, tex: hd(o.tex), color: tint(o.color) };
  else if (hd(o.tex) !== o.tex) o = { ...o, tex: hd(o.tex) };
  const dir = o.dir ? new THREE.Vector3(o.dir.x, o.dir.y, o.dir.z).normalize() : null;
  if (h.particles) {
    const P = h.particles;
    for (let i = 0; i < o.n; i++) {
      const p = P.spawn(o.tex, o.color ?? 0xffffff, !!o.additive, o.depthTest ?? true, o.order ?? 0);
      if (!p) return;
      const j = o.jitter ?? 0;
      p.x = o.x + (Math.random() - 0.5) * j;
      p.y = o.y + (Math.random() - 0.5) * j * 0.5;
      p.z = o.z + (Math.random() - 0.5) * j;
      const v = randomDir(dir, o.cone ?? Math.PI, !!o.flatSpread).multiplyScalar(rr(o.speed));
      if (o.up) v.y += rr(o.up);
      p.vx = v.x;
      p.vy = v.y;
      p.vz = v.z;
      p.size0 = rr(o.size);
      p.grow = o.grow ?? 1;
      p.spin = (Math.random() - 0.5) * 2 * (o.spin ?? 0);
      p.rot = Math.random() * Math.PI * 2;
      p.op = o.opacity ?? 1;
      p.gravity = o.gravity ?? 0;
      p.drag = o.drag ?? 0;
      p.fadeIn = o.fadeIn ?? 0;
      p.life = rr(o.life);
      if (o.floor !== undefined) p.floor = o.floor;
      p.sx = p.sy = p.size0;
      p.a = p.fadeIn > 0 ? 0 : p.op;
    }
    return;
  }
  for (let i = 0; i < o.n; i++) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: o.tex,
        color: o.color ?? 0xffffff,
        transparent: true,
        depthWrite: false,
        depthTest: o.depthTest ?? true,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    if (o.order) s.renderOrder = o.order;
    const j = o.jitter ?? 0;
    s.position.set(
      o.x + (Math.random() - 0.5) * j,
      o.y + (Math.random() - 0.5) * j * 0.5,
      o.z + (Math.random() - 0.5) * j,
    );
    const v = randomDir(dir, o.cone ?? Math.PI, !!o.flatSpread).multiplyScalar(rr(o.speed));
    if (o.up) v.y += rr(o.up);
    const size = rr(o.size);
    const grow = o.grow ?? 1;
    const spin = (Math.random() - 0.5) * 2 * (o.spin ?? 0);
    s.material.rotation = Math.random() * Math.PI * 2;
    const op = o.opacity ?? 1;
    const g = o.gravity ?? 0;
    const drag = o.drag ?? 0;
    const fadeIn = o.fadeIn ?? 0;
    h.root.add(s);
    h.add(s, rr(o.life), (k, dt) => {
      v.y -= g * dt;
      if (drag) v.multiplyScalar(Math.max(0, 1 - drag * dt));
      s.position.addScaledVector(v, dt);
      if (o.floor !== undefined && s.position.y < o.floor) {
        s.position.y = o.floor;
        v.set(v.x * 0.5, Math.abs(v.y) * 0.25, v.z * 0.5);
      }
      s.material.rotation += spin * dt;
      s.scale.setScalar(size * (1 + (grow - 1) * (1 - (1 - k) * (1 - k))));
      const a = fadeIn > 0 && k < fadeIn ? k / fadeIn : 1;
      s.material.opacity = op * a * (k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
    });
  }
}

const leafGeo = new THREE.PlaneGeometry(1, 1);
export function tumblers(
  h: FxHost,
  texes: THREE.Texture[],
  n: number,
  x: number,
  y: number,
  z: number,
  opts: {
    speed: Range;
    up: Range;
    size: Range;
    life: Range;
    dir?: { x: number; z: number };
    spread?: number;
    floorY?: number;
  },
): void {
  for (let i = 0; i < n; i++) {
    const tex = cv(texes[i % texes.length]);
    const m = fxBatch(
      h.root,
      `leaf|${tex.uuid}`,
      () =>
        new FxBatch(
          leafGeo,
          new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            alphaTest: 0.35,
            side: THREE.DoubleSide,
            depthWrite: true,
          }),
          false,
          true,
        ),
    ).spawn();
    const sz = rr(opts.size);
    m.scale.setScalar(sz);
    m.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    let a = Math.random() * Math.PI * 2;
    if (opts.dir) a = Math.atan2(opts.dir.z, opts.dir.x) + (Math.random() - 0.5) * (opts.spread ?? 1.6);
    const sp = rr(opts.speed);
    const v = new THREE.Vector3(Math.cos(a) * sp, rr(opts.up), Math.sin(a) * sp);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14);
    const phase = Math.random() * 6;
    const floor = opts.floorY ?? (h.world ? h.world.groundY(x, z) + 0.05 : y - 1);
    let landed = false;
    let t = 0;
    h.add(m, rr(opts.life), (k, dt) => {
      t += dt;
      if (!landed) {
        v.y = Math.max(v.y - 9 * dt, -1.6);
        const damp = Math.max(0, 1 - 2.2 * dt);
        v.x *= damp;
        v.z *= damp;
        m.position.x += (v.x + Math.sin(t * 5 + phase) * 0.9 * (v.y < 0 ? 1 : 0)) * dt;
        m.position.y += v.y * dt;
        m.position.z += (v.z + Math.cos(t * 4 + phase) * 0.6 * (v.y < 0 ? 1 : 0)) * dt;
        m.rotation.x += spin.x * dt * (v.y < 0 ? 0.4 : 1);
        m.rotation.y += spin.y * dt;
        m.rotation.z += spin.z * dt * (v.y < 0 ? 0.4 : 1);
        if (m.position.y <= floor) {
          landed = true;
          m.position.y = floor;
          m.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
        }
      }
      m.opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
    });
  }
}

const stoneTex = new THREE.TextureLoader().load(stoneUrl);
stoneTex.colorSpace = THREE.SRGBColorSpace;
const chunkGeos = [0, 1, 2].map((s) => {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + (((i * 7919 + s * 131) % 97) / 97) * 0.45;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
});
export const SHARED_CHUNK_GEOS = new Set<THREE.BufferGeometry>(chunkGeos);

export type Decal3D = "laurel" | "crown" | "crest" | "ring" | "gear" | "smoke";
export interface CostumeSkin {
  chunk?: { geos: THREE.BufferGeometry[]; colors: number[]; tex?: THREE.Texture | null };
  fissure?: Partial<Record<FissureStyle, FissureStyle>>;
  fisMat?: Partial<Record<"cut" | "lip" | "core", () => THREE.Material>>;
  lipFlat?: number;
  decal?: Map<THREE.Texture, Decal3D | "flat">;
}
export const COSTUME_SKIN: Record<string, CostumeSkin> = {};

export function chunks(
  h: FxHost,
  n: number,
  x: number,
  y: number,
  z: number,
  opts: {
    size: Range;
    speed: Range;
    up: Range;
    color?: THREE.ColorRepresentation;
    life?: number;
    dir?: { x: number; z: number };
    spread?: number;
    tex?: THREE.Texture;
  },
): void {
  const sk = COSTUME_SKIN[activeCostume()]?.chunk;
  for (let i = 0; i < n; i++) {
    const map = opts.tex ?? (sk && sk.tex !== undefined ? sk.tex : stoneTex);
    const geo = sk ? sk.geos[i % sk.geos.length] : chunkGeos[i % 3];
    const m = fxBatch(
      h.root,
      `chunk|${map?.uuid ?? "-"}|${geo.uuid}`,
      () => new FxBatch(geo, new THREE.MeshLambertMaterial({ map, flatShading: true, transparent: true })),
    ).spawn();
    m.color.set(sk ? sk.colors[i % sk.colors.length] : (opts.color ?? 0xb8ab98));
    const sz = rr(opts.size);
    m.scale.setScalar(sz);
    m.position.set(x, y, z);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    let a = Math.random() * Math.PI * 2;
    if (opts.dir) a = Math.atan2(opts.dir.z, opts.dir.x) + (Math.random() - 0.5) * (opts.spread ?? 1.4);
    const sp = rr(opts.speed);
    let vx = Math.cos(a) * sp;
    let vz = Math.sin(a) * sp;
    let vy = rr(opts.up);
    const spin = (Math.random() - 0.5) * 16;
    h.add(m, (opts.life ?? 1.3) * (0.8 + Math.random() * 0.4), (k, dt) => {
      vy -= 24 * dt;
      m.position.x += vx * dt;
      m.position.y += vy * dt;
      m.position.z += vz * dt;
      const floor = (h.world ? h.world.groundY(m.position.x, m.position.z) : y) + sz * 0.3;
      if (m.position.y < floor) {
        m.position.y = floor;
        vy = Math.abs(vy) * 0.3;
        vx *= 0.55;
        vz *= 0.55;
      } else {
        m.rotation.x += spin * dt;
        m.rotation.z += spin * 0.6 * dt;
      }
      if (k > 0.7) m.scale.setScalar(sz * (1 - (k - 0.7) / 0.3));
    });
  }
}

const planeGeo = new THREE.PlaneGeometry(1, 1);
export const SHARED_PLANE_GEOS = new Set<THREE.BufferGeometry>([planeGeo, leafGeo]);
const torusGeo = new THREE.TorusGeometry(1, 0.05, 4, 36);
torusGeo.userData.model = true;
export function shockwave(
  h: FxHost,
  _tex: THREE.Texture,
  x: number,
  y: number,
  z: number,
  normal: THREE.Vector3,
  r0: number,
  r1: number,
  dur: number,
  color: THREE.ColorRepresentation = 0xffffff,
  opacity = 1,
): void {
  const m = fxBatch(
    h.root,
    "shock",
    () =>
      new FxBatch(
        torusGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      ),
  ).spawn();
  m.color.set(tint(color));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  m.position.set(x, y, z);
  h.add(m, dur, (k) => {
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    const r = Math.max(0.05, r0 + (r1 - r0) * e);
    m.scale.set(r, r, r * 0.5 * (1 - k * 0.6));
    m.opacity = opacity * 0.85 * (1 - k * k);
  });
}

export type FissureStyle = "crack" | "lava" | "moss";
export const FISSURE_TEX = new Map<THREE.Texture, FissureStyle>();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
boxGeo.userData.model = true;
const FIS_MAT: Record<FissureStyle, THREE.Material> = {
  crack: new THREE.MeshLambertMaterial({ color: 0x1c140c, flatShading: true }),
  lava: new THREE.MeshLambertMaterial({ color: 0x24140a, flatShading: true }),
  moss: new THREE.MeshLambertMaterial({ color: 0x1e2a10, flatShading: true }),
};
const lavaTex = new THREE.TextureLoader().load(lavaUrl);
lavaTex.colorSpace = THREE.SRGBColorSpace;
const crackPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
crackPlane.userData.model = true;
const LAVA_CORE = new THREE.MeshBasicMaterial({
  map: lavaTex,
  alphaTest: 0.4,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
});
const LIP_MAT = new THREE.MeshLambertMaterial({ color: 0x6a5238, flatShading: true });
const MOSS_LIP = new THREE.MeshLambertMaterial({ color: 0x3a5a1c, flatShading: true });
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

const SKIN_MATS = new Map<string, THREE.Material>();
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

const FIS_KEYS = new Map<THREE.Material, string>([
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

export const DECAL_3D = new Map<THREE.Texture, "laurel" | "crown" | "crest" | "ring" | "gear" | "smoke">();

function mergeParts(parts: THREE.Mesh[]): THREE.BufferGeometry {
  const geos = parts.map((m) => {
    m.updateMatrix();
    const q = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
    for (const k of Object.keys(q.attributes)) if (k !== "position" && k !== "normal") q.deleteAttribute(k);
    return q;
  });
  const g = mergeGeometries(geos, false)!;
  g.computeVertexNormals();
  g.userData.model = true;
  return g;
}

let laurelShape: THREE.BufferGeometry | null = null;
function laurelGeo(): THREE.BufferGeometry {
  if (laurelShape) return laurelShape;
  const parts: THREE.Mesh[] = [];
  const leaf = new THREE.OctahedronGeometry(1, 0);
  const n = 12;
  for (const side of [1, -1]) {
    const a0 = Math.PI / 2 + side * 0.22;
    const span = Math.PI - 0.5;
    const stem = new THREE.Mesh(new THREE.TorusGeometry(1, 0.022, 4, 28, span));
    stem.rotation.set(-Math.PI / 2, 0, side > 0 ? -(a0 + span) : -a0);
    parts.push(stem);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = a0 + side * span * t;
      const sz = 1 - t * 0.45;
      for (const out of [1, -1]) {
        const m = new THREE.Mesh(leaf);
        const tan = new THREE.Vector3(-Math.sin(a) * side, 0, Math.cos(a) * side);
        const rad = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const dir = tan
          .clone()
          .multiplyScalar(0.8)
          .addScaledVector(rad, out * 0.62)
          .normalize();
        m.position.copy(rad.clone().multiplyScalar(1 + out * 0.07)).addScaledVector(dir, 0.14 * sz);
        m.position.y = 0.03 + (out > 0 ? 0.015 : 0);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
        m.rotateX(out * 0.5);
        m.scale.set(0.21 * sz, 0.03, 0.085 * sz);
        parts.push(m);
      }
    }
    const tip = new THREE.Mesh(leaf);
    const at = a0 + side * span;
    tip.position.set(Math.cos(at) * 1.02, 0.04, Math.sin(at) * 1.02);
    tip.quaternion.setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-Math.sin(at) * side, 0, Math.cos(at) * side),
    );
    tip.scale.set(0.11, 0.022, 0.045);
    parts.push(tip);
  }
  for (const side of [1, -1]) {
    const bow = new THREE.Mesh(new THREE.TetrahedronGeometry(1, 0));
    bow.position.set(side * 0.13, 0.05, 1.02);
    bow.rotation.set(0, side * 0.6, Math.PI / 4);
    bow.scale.set(0.14, 0.05, 0.09);
    parts.push(bow);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    tail.position.set(side * 0.1, 0.03, 1.2);
    tail.rotation.y = side * 0.35;
    tail.scale.set(0.06, 0.02, 0.26);
    parts.push(tail);
  }
  const knot = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0));
  knot.position.set(0, 0.06, 1.02);
  knot.scale.set(0.07, 0.06, 0.07);
  parts.push(knot);
  laurelShape = mergeParts(parts);
  return laurelShape;
}

let crownShape: THREE.BufferGeometry | null = null;
function crownGeo(): THREE.BufferGeometry {
  if (crownShape) return crownShape;
  const parts: THREE.Mesh[] = [new THREE.Mesh(new THREE.CylinderGeometry(1, 1.04, 0.16, 48, 1, true))];
  parts[0].position.y = 0.08;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.025, 4, 48));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.16;
  parts.push(lip);
  const merl = 16;
  for (let i = 0; i < merl; i++) {
    const a = (i / merl) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    m.position.set(Math.cos(a) * 1.01, 0.22, Math.sin(a) * 1.01);
    m.rotation.y = -a + Math.PI / 2;
    m.scale.set(0.17, 0.12, 0.05);
    parts.push(m);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / merl;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4));
    spire.position.set(Math.cos(a) * 1.01, 0.33, Math.sin(a) * 1.01);
    spire.scale.set(0.07, 0.3, 0.07);
    parts.push(spire);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0));
    gem.position.set(Math.cos(a) * 1.06, 0.08, Math.sin(a) * 1.06);
    gem.scale.set(0.06, 0.08, 0.06);
    parts.push(gem);
  }
  crownShape = mergeParts(parts);
  return crownShape;
}

let crestShape: THREE.BufferGeometry | null = null;
function crestGeo(): THREE.BufferGeometry {
  if (crestShape) return crestShape;
  const parts: THREE.Mesh[] = [];
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.92, 0.1, 7, 1, true));
  band.position.y = 0.05;
  parts.push(band);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const long = i % 2 === 0;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4));
    const hgt = long ? 0.75 : 0.42;
    const tilt = long ? 0.38 : 0.55;
    const d = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    sp.position.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9).addScaledVector(d, hgt / 2);
    sp.scale.set(long ? 0.09 : 0.07, hgt, long ? 0.09 : 0.07);
    parts.push(sp);
    if (long) {
      const barb = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 3));
      const bd = new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)).normalize();
      barb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bd);
      barb.position
        .set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9)
        .addScaledVector(d, hgt * 0.45)
        .addScaledVector(bd, 0.08);
      barb.scale.set(0.035, 0.16, 0.035);
      parts.push(barb);
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(1, 0));
    shard.position.set(Math.cos(a) * 1.12, 0.04, Math.sin(a) * 1.12);
    shard.rotation.set(Math.random(), a, Math.random());
    shard.scale.set(0.11, 0.06, 0.08);
    parts.push(shard);
  }
  crestShape = mergeParts(parts);
  return crestShape;
}

const LAUREL_MAT = new THREE.MeshLambertMaterial({
  color: 0xe0b840,
  emissive: 0x3a2400,
  flatShading: true,
  transparent: true,
});
const CREST_MAT = new THREE.MeshLambertMaterial({
  color: 0x4a403a,
  emissive: 0x1a0800,
  flatShading: true,
  transparent: true,
});
for (const m of [LAUREL_MAT, CREST_MAT]) m.userData.keep = true;
const glowRingGeo = new THREE.TorusGeometry(1, 0.06, 4, 40);
glowRingGeo.userData.model = true;

function model3d(
  h: FxHost,
  kind: "laurel" | "crown" | "crest",
  x: number,
  y: number,
  z: number,
  r: number,
  life: number,
  color: THREE.ColorRepresentation,
  spin: number,
  grow: number,
  opacity: number,
): void {
  const g = new THREE.Group();
  const mats: THREE.Material[] = [];
  if (kind === "laurel") {
    const mat = LAUREL_MAT.clone();
    mat.userData = {};
    mat.emissive.set(color).multiplyScalar(0.25);
    mats.push(mat);
    g.add(new THREE.Mesh(laurelGeo(), mat));
  } else if (kind === "crown") {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.push(mat);
    g.add(new THREE.Mesh(crownGeo(), mat));
  } else {
    const iron = CREST_MAT.clone();
    iron.userData = {};
    const glow = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.push(iron, glow);
    g.add(new THREE.Mesh(crestGeo(), iron));
    const ring = new THREE.Mesh(glowRingGeo, glow);
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(0.82, 0.82, 1.6);
    ring.position.y = 0.06;
    g.add(ring);
    const outer = new THREE.Mesh(glowRingGeo, glow);
    outer.rotation.x = Math.PI / 2;
    outer.scale.set(0.5, 0.5, 0.8);
    outer.position.y = 0.03;
    g.add(outer);
  }
  g.position.set(x, y, z);
  g.rotation.y = Math.random() * Math.PI * 2;
  const r0 = g.rotation.y;
  h.root.add(g);
  h.add(g, life, (k) => {
    const t = k * life;
    const e = grow > 0 ? Math.min(1, t / grow) : 1;
    const ease = 1 - (1 - e) * (1 - e);
    g.scale.setScalar(Math.max(0.01, r * (kind === "crown" ? 0.35 + 0.65 * ease : ease)));
    if (kind === "crown") g.scale.y = Math.max(0.01, r * 0.5 * (1.4 - k * 0.6));
    g.rotation.y = r0 + t * spin;
    const rise =
      kind === "crown"
        ? 0
        : kind === "crest"
          ? -0.5 * (1 - Math.min(1, t / 0.18))
          : Math.sin(Math.min(1, t / 0.3) * Math.PI * 0.5) * 0.12;
    g.position.y = y + 0.04 + rise - (k > 0.75 ? ((k - 0.75) / 0.25) * 0.2 : 0);
    const f = opacity * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    for (const m of mats) m.opacity = f;
  });
}

const gearShape = (() => {
  const sh = new THREE.Shape();
  const teeth = 10;
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const rr = i % 4 < 2 ? 1 : 0.8;
    if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  sh.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.35, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  return sh;
})();
const gearGeo = new THREE.ExtrudeGeometry(gearShape, { depth: 0.18, bevelEnabled: false, curveSegments: 8 });
gearGeo.rotateX(-Math.PI / 2);
gearGeo.userData.model = true;
const GEAR_MAT = new THREE.MeshLambertMaterial({ color: 0xd0a030, flatShading: true });
GEAR_MAT.userData.keep = true;

function gear3d(h: FxHost, x: number, y: number, z: number, r: number, life: number, spin: number): void {
  const m = new THREE.Mesh(gearGeo, GEAR_MAT);
  m.position.set(x, y, z);
  h.root.add(m);
  h.add(m, life, (k) => {
    const t = k * life;
    const e = Math.min(1, t / 0.2);
    m.scale.setScalar(Math.max(0.01, r * 0.8 * e));
    m.rotation.y = t * spin;
    m.position.y =
      y + 0.05 + Math.sin(Math.min(1, t / 0.25) * Math.PI) * 0.4 - (k > 0.75 ? ((k - 0.75) / 0.25) * 0.3 : 0);
  });
}

export function decal(
  h: FxHost,
  tex: THREE.Texture,
  x: number,
  y: number,
  z: number,
  radius: number,
  dur: number,
  opts: {
    grow?: number;
    spin?: number;
    additive?: boolean;
    color?: THREE.ColorRepresentation;
    opacity?: number;
    rot?: number;
    stretch?: number;
  } = {},
): FxInst | null {
  tex = hd(tex);
  opts = { ...opts, color: tint(opts.color) };
  const sk = COSTUME_SKIN[activeCostume()];
  const over = sk?.decal?.get(baseTex(tex));
  const fis0 = over ? undefined : FISSURE_TEX.get(baseTex(tex));
  const fis = fis0 && (sk?.fissure?.[fis0] ?? fis0);
  if (fis) {
    fissures(h, x, y, z, radius, fis, Math.max(dur, 1.2), opts.grow ?? 0.25);
    return null;
  }
  const d3 = over ?? DECAL_3D.get(baseTex(tex));
  if (d3 === "laurel" || d3 === "crown" || d3 === "crest") {
    model3d(
      h,
      d3,
      x,
      y,
      z,
      radius,
      dur,
      opts.color ?? 0xffe0a0,
      d3 === "laurel" ? 0 : (opts.spin ?? 1) * 0.5,
      opts.grow ?? 0.2,
      opts.opacity ?? 1,
    );
    return null;
  }
  if (d3 === "gear") {
    gear3d(h, x, y, z, radius, dur, opts.spin ?? 2);
    return null;
  }
  if (d3 === "ring" || d3 === "smoke") {
    shockwave(
      h,
      tex,
      x,
      y + 0.15,
      z,
      new THREE.Vector3(0, 1, 0),
      radius * 0.15,
      radius,
      Math.max(0.35, dur),
      d3 === "smoke" ? 0x8a8a90 : (opts.color ?? 0xffe0c0),
      opts.opacity ?? 0.9,
    );
    return null;
  }
  const add = !!opts.additive;
  const m = fxBatch(
    h.root,
    `pdecal|${tex.uuid}|${add ? 1 : 0}`,
    () =>
      new FxBatch(
        planeGeo,
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
        false,
        !add,
      ),
  ).spawn();
  m.color.set(opts.color ?? 0xffffff);
  m.rotation.set(-Math.PI / 2, 0, opts.rot ?? Math.random() * Math.PI * 2);
  m.position.set(x, y + 0.08, z);
  const rz = m.rotation.z;
  const op = opts.opacity ?? 1;
  const grow = opts.grow ?? 0;
  h.add(m, dur, (k) => {
    const t = k * dur;
    const g = grow > 0 ? Math.min(1, t / grow) : 1;
    const e = 1 - (1 - g) * (1 - g);
    m.scale.set(radius * 2 * e * (opts.stretch ?? 1), radius * 2 * e, 1);
    m.rotation.z = rz + k * (opts.spin ?? 0);
    m.opacity = op * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
  });
  return m;
}

interface Sample {
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: number;
}
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private samples: Sample[] = [];
  private geo = new THREE.BufferGeometry();
  private max = 24;
  private pos = new Float32Array(this.max * 2 * 3);
  private uv = new Float32Array(this.max * 2 * 2);
  private col = new Float32Array(this.max * 2 * 4);
  private clock = 0;
  dead = false;

  constructor(
    tex: THREE.Texture,
    color: THREE.Color,
    private life = 0.14,
    private fade = 1,
  ) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        map: tex,
        color,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  push(a: THREE.Vector3, b: THREE.Vector3): void {
    const last = this.samples[this.samples.length - 1];
    if (last && last.a.distanceToSquared(a) < 0.0004) return;
    this.samples.push({ a: a.clone(), b: b.clone(), t: this.clock });
    if (this.samples.length > this.max) this.samples.shift();
  }

  update(dt: number): void {
    this.clock += dt;
    while (this.samples.length && this.clock - this.samples[0].t > this.life) this.samples.shift();
    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const age = (this.clock - s.t) / this.life;
      const u = n > 1 ? 1 - i / (n - 1) : 0;
      this.pos.set([s.a.x, s.a.y, s.a.z], i * 6);
      this.pos.set([s.b.x, s.b.y, s.b.z], i * 6 + 3);
      this.uv.set([u * 0.85, 0.3, u * 0.85, 0.7], i * 4);
      const al = Math.max(0, 1 - age * age) * this.fade;
      this.col.set([1, 1, 1, al, 1, 1, 1, al * 0.5], i * 8);
    }
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("uv") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  get empty(): boolean {
    return this.samples.length === 0;
  }
}
