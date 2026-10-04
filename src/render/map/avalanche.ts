// Avalanche (frostcross, sim/mapEvents/avalanche.ts): the warning "run" (snow spray along the top edge of the
// lane), the slide itself (a snow blanket whose front sweeps down the lane carrying instanced snow chunks and
// the map's own props, which roll, sink and melt away) and the settled drift until it melts.
//
// Props in the lane are re-drawn as instanced pieces from simplified copies of their geometry (prepLods); when a
// prop has no usable geometry a snowball (FALLBACK_GEO) stands in.
import * as THREE from "three";
import { snowUrl } from "./textures";
import { cacheCanvas } from "../../ui/cacheCanvas";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { propParts } from "../props";
import type { MapFx } from "./mapFx";
import { emit } from "../fx/parts";
import { FX } from "../fx/atlas";

export interface Rect {
  x: number;
  z: number;
  w: number;
  h: number;
}
export interface Run {
  stage: "warn";
  rect: Rect;
  dx: number;
  dz: number;
  start: number;
  seconds: number;
  acc: number;
}
export interface Piece {
  u: number;
  a: number;
  s: number;
  sy: number;
  rot: number;
  sink: number;
  melt: number;
  roll: { lag: number; r: number; phase: number; tilt: THREE.Quaternion } | null;
}
export interface PieceSet {
  mesh: THREE.InstancedMesh | null;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  items: Piece[];
  w: number;
  h: number;
  y0: number;
  fallback: number;
}
export interface Ava {
  rect: Rect;
  dx: number;
  dz: number;
  span: number;
  start: number;
  sweep: number;
  until: number;
  group: THREE.Group;
  blanket: THREE.Mesh;
  uni: { uFront: { value: number }; uMelt: { value: number } };
  sets: PieceSet[];
  acc: number;
  settled: boolean;
  hAt: (x: number, z: number) => number;
}
export const SNOW = new THREE.MeshLambertMaterial({ color: 0xdfe6f2, vertexColors: true });
SNOW.userData.keep = true;
export const UP = new THREE.Vector3(0, 1, 0);
export const MELT = 3.5;
export const FALLBACK_GEO = new THREE.IcosahedronGeometry(0.5, 1);
FALLBACK_GEO.translate(0, 0.5, 0);
FALLBACK_GEO.deleteAttribute("uv");
FALLBACK_GEO.userData.model = true;
export let snowCache: THREE.Texture | null = null;
export function snowTex(): THREE.Texture {
  if (snowCache) return snowCache;
  const t = new THREE.TextureLoader().load(snowUrl);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  snowCache = t;
  return t;
}
export function blanketMat(uni: { uFront: { value: number }; uMelt: { value: number } }): THREE.Material {
  const m = new THREE.MeshLambertMaterial({ map: snowTex(), vertexColors: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uFront = uni.uFront;
    s.uniforms.uMelt = uni.uMelt;
    s.vertexShader = s.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aArrive;\nattribute float aLift;\nattribute float aMelt;\nuniform float uFront;\nuniform float uMelt;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nfloat bf = clamp((uFront - aArrive) / 3.0, 0.0, 1.0);\nfloat bg = bf * (1.0 + 0.5 * sin(bf * 3.14159));\nfloat bm = clamp(uMelt * 1.8 - aMelt * 0.8, 0.0, 1.0);\ntransformed.y -= aLift * (1.0 - bg * (1.0 - bm));",
      );
  };
  m.customProgramCacheKey = () => "snowBlanket";
  return m;
}
export function puffTexture(): THREE.Texture {
  const c = cacheCanvas();
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const blobs = [
    [64, 70, 40],
    [44, 62, 28],
    [86, 60, 30],
    [60, 44, 28],
    [80, 82, 26],
    [42, 84, 24],
    [70, 56, 34],
  ];
  for (const [x, y, r] of blobs) {
    const q = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    q.addColorStop(0, "rgba(255,255,255,0.95)");
    q.addColorStop(0.55, "rgba(236,244,252,0.75)");
    q.addColorStop(0.85, "rgba(205,222,240,0.35)");
    q.addColorStop(1, "rgba(200,218,238,0)");
    g.fillStyle = q;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const PUFF = puffTexture();
export const lods = new Map<string, THREE.BufferGeometry>();
export function prepLods(): void {
  for (const n of ["event_drift", "event_heap", "event_boulder"]) {
    const p = propParts(n);
    if (!p || lods.has(n)) continue;
    lods.set(n, p.geo);
    void new SimplifyModifier()
      .modify(p.geo, Math.floor(p.geo.getAttribute("position").count * 0.6))
      .then((g) => {
        g.userData.model = true;
        g.computeBoundingBox();
        g.computeBoundingSphere();
        lods.set(n, g);
      })
      .catch(() => undefined);
  }
}
export const bright = new Map<THREE.Material, THREE.Material>();
export function brightMat(src: THREE.Material): THREE.Material {
  let m = bright.get(src);
  if (!m) {
    const c = (src as THREE.MeshLambertMaterial).clone();
    c.color.setRGB(1.18, 1.2, 1.22);
    c.userData.keep = true;
    bright.set(src, c);
    m = c;
  }
  return m;
}
export function onAvalanche(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const e = ev as unknown as {
    stage: "warn" | "slide" | "settle";
    rect: Rect;
    dx: number;
    dz: number;
    seconds: number;
  };
  if (e.stage === "settle") {
    let a = mf.avas.find((v) => v.until === Infinity && v.rect.x === e.rect.x && v.rect.z === e.rect.z);
    if (!a) a = buildAva(mf, e.rect, e.dx, e.dz, mf.now - 2, 1.6);
    a.until = mf.now + e.seconds;
    return;
  }
  if (e.stage === "slide") {
    buildAva(mf, e.rect, e.dx, e.dz, mf.now, e.seconds);
    if (mf.fx) mf.fx.shake = Math.max(mf.fx.shake, 0.8);
    return;
  }
  mf.runs.push({ stage: e.stage, rect: e.rect, dx: e.dx, dz: e.dz, start: mf.now, seconds: e.seconds, acc: 0 });
}
export function edge(r: Rect, dx: number, dz: number, u: number, along: number): { x: number; z: number } {
  if (dx !== 0) return { x: dx > 0 ? r.x + along : r.x + r.w - along, z: r.z + u * r.h };
  return { x: r.x + u * r.w, z: dz > 0 ? r.z + along : r.z + r.h - along };
}
/** Avalanche warning: snow spray and rumble along the slope's upper edge until the slide starts. */

export function syncRuns(mf: MapFx, time: number, dt: number): void {
  const w = mf.world;
  const fx = mf.fx;
  for (let i = mf.runs.length - 1; i >= 0; i--) {
    const r = mf.runs[i];
    const k = (time - r.start) / r.seconds;
    if (k >= 1) {
      mf.runs.splice(i, 1);
      continue;
    }
    if (!fx) continue;
    r.acc += dt;
    if (r.acc < 0.12) continue;
    r.acc = 0;
    fx.shake = Math.max(fx.shake, 0.08 + k * 0.2);
    for (let n = 0; n < 2; n++) {
      const p = edge(r.rect, r.dx, r.dz, Math.random(), -1.5 + Math.random() * 2);
      const y = w.groundY(p.x, p.z);
      emit(fx, {
        tex: PUFF,
        n: 1,
        x: p.x,
        y: y + 1.5,
        z: p.z,
        size: [1.4, 2.4],
        grow: 1.8,
        life: [0.8, 1.4],
        speed: [0.5, 1.6],
        dir: { x: r.dx, y: -0.2, z: r.dz },
        cone: 0.6,
        opacity: 0.75,
        color: 0xf4f8ff,
      });
    }
    if (Math.random() < 0.25 + k * 0.5) {
      const p = edge(r.rect, r.dx, r.dz, Math.random(), Math.random() * 1.5);
      emit(fx, {
        tex: PUFF,
        n: 1 + Math.floor(k * 3),
        x: p.x,
        y: w.groundY(p.x, p.z) + 1.2,
        z: p.z,
        size: [0.3, 0.5],
        life: [0.6, 1.0],
        speed: [1.5, 3.5],
        dir: { x: r.dx, y: 0.6, z: r.dz },
        cone: 0.5,
        gravity: 12,
        opacity: 0.95,
        color: 0xffffff,
      });
    }
    if (Math.random() < 0.15 + k * 0.3) {
      const p = edge(r.rect, r.dx, r.dz, Math.random(), Math.random() * 3);
      emit(fx, {
        tex: PUFF,
        n: 1,
        x: p.x,
        y: w.groundY(p.x, p.z) + 0.2,
        z: p.z,
        size: [0.6, 1.0],
        grow: 1.6,
        life: [0.5, 0.8],
        speed: [1.5, 3],
        dir: { x: r.dx, y: 0.1, z: r.dz },
        cone: 0.4,
        opacity: 0.7,
        color: 0xf8fbff,
      });
    }
  }
}
export function buildAva(mf: MapFx, rect: Rect, dx: number, dz: number, start: number, sweep: number): Ava {
  const w = mf.world;
  const span = dx !== 0 ? rect.w : rect.h;
  const cross = dx !== 0 ? rect.h : rect.w;
  const alongOf = (x: number, z: number) =>
    dx > 0 ? x - rect.x : dx < 0 ? rect.x + rect.w - x : dz > 0 ? z - rect.z : rect.z + rect.h - z;
  const crossOf = (x: number, z: number) => (dx !== 0 ? (z - rect.z) / rect.h : (x - rect.x) / rect.w);
  const ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6];
  const m = 0.9;
  const hAt = (x: number, z: number) => {
    const d = Math.min(x - rect.x + m, rect.x + rect.w + m - x, z - rect.z + m, rect.z + rect.h + m - z);
    const wob = 0.7 * Math.sin(x * 0.8 + z * 0.3 + ph[4]) + 0.5 * Math.sin(z * 1.1 - x * 0.45 + ph[2]);
    const ed = Math.max(0, Math.min(1, (d - 0.6 + wob) / 1.8));
    const e = ed * ed * (3 - 2 * ed);
    const a = alongOf(x, z);
    const u = crossOf(x, z);
    const n =
      0.5 + 0.3 * Math.sin(x * 0.9 + ph[0]) * Math.sin(z * 0.75 + ph[1]) + 0.2 * Math.sin(x * 0.37 + z * 0.53 + ph[2]);
    const fk = Math.max(0, Math.min(1, (a - span * 0.45) / (span * 0.55)));
    return e * (0.2 + 0.34 * n + 0.32 * fk * fk + 0.05 * Math.sin(a * 1.6 + u * 4 + ph[3])) - (1 - e) * 0.2;
  };
  const step = 0.8;
  const nx = Math.ceil((rect.w + m * 2) / step) + 1;
  const nz = Math.ceil((rect.h + m * 2) / step) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const arrive = new Float32Array(nx * nz);
  const lift = new Float32Array(nx * nz);
  const melt = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = rect.x - m + Math.min(rect.w + m * 2, i * step);
      const z = rect.z - m + Math.min(rect.h + m * 2, j * step);
      const h = hAt(x, z);
      const g = w.groundY(x, z);
      pos.set([x, g + h + 0.03, z], k * 3);
      const c = 0.8 + 0.2 * Math.max(0, Math.min(1, h / 0.55));
      col.set([c * 0.94, c * 0.97, Math.min(1, c * 1.04)], k * 3);
      uv.set([x / 4, z / 4], k * 2);
      arrive[k] = alongOf(x, z);
      lift[k] = Math.max(0, h) + 0.3;
      melt[k] = Math.max(0, Math.min(1, h / 0.6)) * 0.7 + Math.random() * 0.3;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("aArrive", new THREE.BufferAttribute(arrive, 1));
  geo.setAttribute("aLift", new THREE.BufferAttribute(lift, 1));
  geo.setAttribute("aMelt", new THREE.BufferAttribute(melt, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const uni = { uFront: { value: -10 }, uMelt: { value: 0 } };
  const mat = blanketMat(uni);
  const blanket = new THREE.Mesh(geo, mat);
  blanket.receiveShadow = true;
  const group = new THREE.Group();
  group.add(blanket);
  const sets: PieceSet[] = [];
  const set = (name: string, fallback: number) => {
    const p = propParts(name);
    const geo = (p && lods.get(name)) ?? p?.geo ?? FALLBACK_GEO;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const s: PieceSet = {
      mesh: null,
      geo,
      mat: p ? (fallback < 2 ? brightMat(p.mat) : p.mat) : SNOW,
      items: [],
      w: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) || 1,
      h: bb.max.y - bb.min.y || 1,
      y0: bb.min.y,
      fallback,
    };
    sets.push(s);
    return s;
  };
  const drift = set("event_drift", 0);
  const heap = set("event_heap", 1);
  const rock = set("event_boulder", 2);
  const marks = [...w.terrain.pads, ...w.jumpPads];
  const blocked = (x: number, z: number) => marks.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6);
  const sp = 4.6;
  for (let a = sp * 0.5; a < span; a += sp) {
    for (let c = sp * 0.5; c < cross; c += sp) {
      if (Math.random() < 0.35) continue;
      const aa = Math.max(1.5, Math.min(span - 1.5, a + (Math.random() - 0.5) * sp * 0.7));
      const cc = Math.max(1.5, Math.min(cross - 1.5, c + (Math.random() - 0.5) * sp * 0.7)) / cross;
      const q = edge(rect, dx, dz, cc, aa);
      if (blocked(q.x, q.z)) continue;
      const r = Math.random();
      const t = r < 0.6 ? drift : r < 0.85 ? heap : rock;
      const width =
        t === drift ? 3.4 + Math.random() * 1.6 : t === heap ? 2.0 + Math.random() * 0.9 : 1.2 + Math.random() * 0.6;
      t.items.push({
        u: cc,
        a: aa,
        s: width / t.w,
        sy: 0.7 + Math.random() * 0.3,
        rot: Math.random() * Math.PI * 2,
        sink: 0.12 + Math.random() * 0.12,
        melt: Math.random() * 0.5,
        roll: null,
      });
    }
  }
  const nRock = Math.max(3, Math.round(cross / 3));
  const nHeap = Math.max(2, Math.round(cross / 3.6));
  for (const [t, n, w0, w1] of [
    [rock, nRock, 1.2, 1.8],
    [heap, nHeap, 1.8, 2.5],
  ] as [PieceSet, number, number, number][]) {
    for (let j = 0; j < n; j++) {
      const width = w0 + Math.random() * (w1 - w0);
      t.items.push({
        u: (j + 0.2 + Math.random() * 0.6) / n,
        a: span - 0.6 - Math.random() * 3.2,
        s: width / t.w,
        sy: 1,
        rot: Math.random() * Math.PI * 2,
        sink: 0.18,
        melt: 0.3 + Math.random() * 0.5,
        roll: {
          lag: Math.random() * 2.2 - 0.4,
          r: (width / 2) * 0.85,
          phase: Math.random() * 6,
          tilt: new THREE.Quaternion().setFromEuler(
            new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          ),
        },
      });
    }
  }
  for (const s of sets) {
    if (!s.items.length) continue;
    const im = new THREE.InstancedMesh(s.geo, s.mat, s.items.length);
    im.castShadow = s.fallback === 2;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    s.mesh = im;
    group.add(im);
  }
  mf.root.add(group);
  const ava: Ava = {
    rect,
    dx,
    dz,
    span,
    start,
    sweep,
    until: Infinity,
    group,
    blanket,
    uni,
    sets,
    acc: 0,
    settled: false,
    hAt,
  };
  mf.avas.push(ava);
  poseAva(mf, ava, start);
  return ava;
}
export function poseAva(mf: MapFx, v: Ava, time: number): void {
  const w = mf.world;
  const k = Math.min(1, (time - v.start) / v.sweep);
  const front = k * (v.span + 4) - 2;
  const meltK = v.until === Infinity ? 0 : Math.max(0, Math.min(1, (time - (v.until - MELT)) / MELT));
  v.uni.uFront.value = front;
  v.uni.uMelt.value = meltK;
  const axis = new THREE.Vector3(v.dz, 0, -v.dx);
  const q = new THREE.Quaternion();
  const mtx = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  const pv = new THREE.Vector3();
  const cv = new THREE.Vector3();
  for (const s of v.sets) {
    const im = s.mesh;
    if (!im) continue;
    s.items.forEach((it, i) => {
      let a = it.a;
      let g = 1;
      let lift = 0;
      if (it.roll) {
        a = Math.min(it.a, front - it.roll.lag);
        const moving = a < it.a;
        q.setFromAxisAngle(axis, (a + 2) / it.roll.r).multiply(it.roll.tilt);
        lift = moving ? Math.abs(Math.sin(it.roll.phase + a * 1.1)) * 0.5 * (1 - k * 0.5) : 0;
        g = a < -1 ? 0 : 1;
      } else {
        const f = Math.max(0, Math.min(1, (front - it.a) / 2.5));
        g = f * (1 + 0.5 * Math.sin(f * Math.PI));
        q.setFromAxisAngle(UP, it.rot);
      }
      const mk = Math.max(0, Math.min(1, meltK * 1.7 - it.melt));
      const p = edge(v.rect, v.dx, v.dz, it.u, a);
      const gy = w.groundY(p.x, p.z) + Math.max(0, v.hAt(p.x, p.z)) * 0.7 * Math.max(0, Math.min(1, (front - a) / 3));
      const hs = s.h * it.s * it.sy;
      const sy = Math.max(0.001, g * (1 - mk * 0.85));
      sc.set(it.s * Math.max(0.001, g) * (1 - mk * 0.3), it.s * it.sy * sy, it.s * Math.max(0.001, g) * (1 - mk * 0.3));
      if (it.roll) {
        const rest = a >= it.a ? hs * it.sink : 0;
        cv.set(0, (s.y0 + s.h / 2) * sc.y, 0).applyQuaternion(q);
        pv.set(p.x - cv.x, gy + it.roll.r * 0.85 + lift - rest - mk * hs * 0.4 - cv.y, p.z - cv.z);
      } else pv.set(p.x, gy - s.y0 * sc.y - hs * it.sink - mk * hs * 0.35, p.z);
      mtx.compose(pv, q, sc);
      im.setMatrixAt(i, mtx);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }
}
export function syncAvas(mf: MapFx, time: number, dt: number): void {
  const fx = mf.fx;
  const w = mf.world;
  for (let i = mf.avas.length - 1; i >= 0; i--) {
    const v = mf.avas[i];
    if (time >= v.until) {
      freeAva(mf, v);
      mf.avas.splice(i, 1);
      continue;
    }
    const k = (time - v.start) / v.sweep;
    const melting = v.until !== Infinity && time > v.until - MELT;
    if (!v.settled || melting) poseAva(mf, v, time);
    if (k > 1.2 && !melting) v.settled = true;
    if (!fx) continue;
    v.acc += dt;
    if (k < 1.05) {
      if (v.acc < 0.05) continue;
      v.acc = 0;
      fx.shake = Math.max(fx.shake, 0.5);
      const cross = v.dx !== 0 ? v.rect.h : v.rect.w;
      const along = Math.min(1, k) * (v.span + 4) - 2;
      const n = Math.ceil(cross / 2.6);
      for (let j = 0; j < n; j++) {
        const p = edge(v.rect, v.dx, v.dz, (j + Math.random()) / n, along);
        const y = w.groundY(p.x, p.z);
        emit(fx, {
          tex: PUFF,
          n: 1,
          x: p.x,
          y: y + 1.6,
          z: p.z,
          size: [2.2, 3.4],
          grow: 1.7,
          life: [0.6, 1.0],
          speed: [3, 6],
          dir: { x: v.dx, y: 0.5, z: v.dz },
          cone: 0.5,
          opacity: 0.6,
          color: 0xf8fbff,
        });
        emit(fx, {
          tex: PUFF,
          n: 1,
          x: p.x,
          y: y + 0.3,
          z: p.z,
          size: [1.2, 2.0],
          grow: 1.5,
          life: [0.4, 0.8],
          speed: [5, 8],
          dir: { x: v.dx, y: 0.7, z: v.dz },
          cone: 0.7,
          opacity: 0.85,
          color: 0xf0f6ff,
          gravity: 6,
        });
        if (Math.random() < 0.4)
          emit(fx, {
            tex: PUFF,
            n: 2,
            x: p.x,
            y: y + 0.8,
            z: p.z,
            size: [0.35, 0.6],
            life: [0.6, 0.9],
            speed: [4, 7],
            dir: { x: v.dx, y: 0.8, z: v.dz },
            cone: 0.6,
            gravity: 14,
            opacity: 0.95,
            color: 0xffffff,
          });
      }
    } else if (melting) {
      if (v.acc < 0.12) continue;
      v.acc = 0;
      const p = edge(v.rect, v.dx, v.dz, Math.random(), Math.random() * v.span);
      emit(fx, {
        tex: PUFF,
        n: 1,
        x: p.x,
        y: w.groundY(p.x, p.z) + 0.4,
        z: p.z,
        size: [1.2, 2.0],
        grow: 1.5,
        life: [1.0, 1.6],
        speed: [0.1, 0.3],
        up: [0.4, 0.8],
        opacity: 0.25,
        color: 0xeef6ff,
      });
    } else {
      if (v.acc < 0.2) continue;
      v.acc = 0;
      const p = edge(v.rect, v.dx, v.dz, Math.random(), Math.random() * v.span);
      emit(fx, {
        tex: FX.twinkle,
        n: 1,
        x: p.x,
        y: w.groundY(p.x, p.z) + 0.5,
        z: p.z,
        size: [0.2, 0.35],
        life: [0.3, 0.5],
        speed: [0, 0.1],
        additive: true,
        color: 0xd8f0ff,
      });
    }
  }
}
export function freeAva(mf: MapFx, v: Ava): void {
  mf.root.remove(v.group);
  v.blanket.geometry.dispose();
  (v.blanket.material as THREE.Material).dispose();
  for (const s of v.sets) s.mesh?.dispose();
}
