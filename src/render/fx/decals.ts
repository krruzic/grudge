// Ground decals: decal() draws an atlas cell as a flat, growing/fading ground quad, except for cells registered in
// FISSURE_TEX (3D fissures) and DECAL_3D (modelled laurel, crown, crest, rings, gear, smoke torus). Textures go
// through hd() so big decals use the HQ painting; costume skins may override per texture.
import * as THREE from "three";
import { FxBatch, fxBatch, FxInst } from "./instances";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { activeCostume, baseTex, hd, tint } from "./atlas";
import type { FxHost } from "./parts";
import { COSTUME_SKIN } from "./chunks";
import { shockwave } from "./shockwave";
import { planeGeo } from "./parts";
import { FISSURE_TEX, fissures } from "./fissures";

export const DECAL_3D = new Map<THREE.Texture, "laurel" | "crown" | "crest" | "ring" | "gear" | "smoke">();

export function mergeParts(parts: THREE.Mesh[]): THREE.BufferGeometry {
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

export let laurelShape: THREE.BufferGeometry | null = null;
export function laurelGeo(): THREE.BufferGeometry {
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

export let crownShape: THREE.BufferGeometry | null = null;
export function crownGeo(): THREE.BufferGeometry {
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

export let crestShape: THREE.BufferGeometry | null = null;
export function crestGeo(): THREE.BufferGeometry {
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

export const LAUREL_MAT = new THREE.MeshLambertMaterial({
  color: 0xe0b840,
  emissive: 0x3a2400,
  flatShading: true,
  transparent: true,
});
export const CREST_MAT = new THREE.MeshLambertMaterial({
  color: 0x4a403a,
  emissive: 0x1a0800,
  flatShading: true,
  transparent: true,
});
for (const m of [LAUREL_MAT, CREST_MAT]) m.userData.keep = true;
export const glowRingGeo = new THREE.TorusGeometry(1, 0.06, 4, 40);
glowRingGeo.userData.model = true;

export function model3d(
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

export const gearShape = (() => {
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
export const gearGeo = new THREE.ExtrudeGeometry(gearShape, { depth: 0.18, bevelEnabled: false, curveSegments: 8 });
gearGeo.rotateX(-Math.PI / 2);
gearGeo.userData.model = true;
export const GEAR_MAT = new THREE.MeshLambertMaterial({ color: 0xd0a030, flatShading: true });
GEAR_MAT.userData.keep = true;

export function gear3d(h: FxHost, x: number, y: number, z: number, r: number, life: number, spin: number): void {
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
