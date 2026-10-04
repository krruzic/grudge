// Gates. Timed gates (sim/mapEvents/gates.ts): iron portcullis bars per gate slot that rise and drop as the
// open set flips, with a sparkle warning beforehand. Lockdown gates (sim/mapEvents/lockdown.ts): plank-and-stone
// barricades over every base exit that sink into the ground when the opening lockdown ends.
import * as THREE from "three";
import type { GateSlot, LockGate } from "../../sim/mapEvents";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MapFx } from "./mapFx";
import { blockUrl, texture, planksUrl, ironUrl } from "./textures";
import { Kind } from "../../sim/terrain";
import { FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import { chunks } from "../fx/chunks";

export interface Gate {
  slot: GateSlot;
  bars: THREE.Object3D;
  y: number;
  posts: [number, number, number][];
}
export const IRON = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
IRON.userData.keep = true;
const BAR_H = 2.7;
const LOCK_H = 2.75;
const LOCK_SINK = LOCK_H + 1.2;
function planarUv(g: THREE.BufferGeometry, tile: number): void {
  const pos = g.getAttribute("position");
  const nrm = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const nz = Math.abs(nrm.getZ(i));
    const u = nz > 0.5 ? pos.getX(i) : nx > 0.5 ? pos.getZ(i) : pos.getX(i);
    const v = nz > 0.5 || nx > 0.5 ? pos.getY(i) : pos.getZ(i);
    uv.setXY(i, u / tile, v / tile);
  }
}
export function buildGates(mf: MapFx, slots: GateSlot[]): void {
  const w = mf.world;
  const tex = new THREE.TextureLoader().load(blockUrl);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  const stone = new THREE.MeshLambertMaterial({ map: tex, color: 0xd8d0c0 });
  const postGeos: THREE.BufferGeometry[] = [];
  for (const slot of slots) {
    const alongX = slot.w >= slot.h;
    const thick = slot.line ? 0.5 : alongX ? slot.h : slot.w;
    const [x0, z0, x1, z1] =
      slot.line ??
      (alongX
        ? [slot.x - 0.05, slot.z + slot.h / 2, slot.x + slot.w + 0.05, slot.z + slot.h / 2]
        : [slot.x + slot.w / 2, slot.z - 0.05, slot.x + slot.w / 2, slot.z + slot.h + 0.05]);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0) - 0.1;
    const ang = -Math.atan2(z1 - z0, x1 - x0);
    const y0 = w.groundY(cx, cz);
    const posts: [number, number, number][] = [];
    for (const [px, pz] of [
      [x0, z0],
      [x1, z1],
    ]) {
      const g = new THREE.BoxGeometry(0.7, 3.4, thick + 0.3);
      g.rotateY(ang);
      g.translate(px, y0 + 1.5, pz);
      postGeos.push(g);
      const cap = new THREE.BoxGeometry(0.9, 0.3, thick + 0.5);
      cap.rotateY(ang);
      cap.translate(px, y0 + 3.3, pz);
      postGeos.push(cap);
      posts.push([px, y0 + 3.6, pz]);
    }
    const bg: THREE.BufferGeometry[] = [];
    const n = Math.max(3, Math.round(len / 0.45));
    for (let i = 0; i < n; i++) {
      const u = -len / 2 + (i + 0.5) * (len / n);
      const b = new THREE.BoxGeometry(0.1, BAR_H, 0.1);
      b.translate(u, BAR_H / 2, 0);
      bg.push(b);
      const tip = new THREE.ConeGeometry(0.1, 0.25, 4);
      tip.translate(u, BAR_H + 0.12, 0);
      bg.push(tip);
    }
    for (const y of [0.35, 1.4, 2.4]) {
      const r = new THREE.BoxGeometry(len, 0.12, 0.14);
      r.translate(0, y, 0);
      bg.push(r);
    }
    const merged = mergeGeometries(
      bg.map((g) => g.toNonIndexed()),
      false,
    )!;
    bg.forEach((g) => g.dispose());
    const bars = new THREE.Mesh(merged, IRON);
    bars.position.set(cx, y0, cz);
    bars.rotation.y = ang;
    const shut = mf.world.mapEvents.closed(slot.set);
    const y = shut ? 0 : -BAR_H - 0.3;
    bars.position.y = y0 + y;
    mf.root.add(bars);
    mf.gates.push({ slot, bars, y, posts });
  }
  if (postGeos.length) {
    const m = mergeGeometries(
      postGeos.map((g) => g.toNonIndexed()),
      false,
    )!;
    postGeos.forEach((g) => g.dispose());
    mf.root.add(new THREE.Mesh(m, stone));
  }
}
/** Built lockdown barricades per map layout: they only depend on the map, so swapping worlds reuses them. */
const lockCache = new Map<
  string,
  { root: THREE.Group; posts: [number, number, number][]; mids: [number, number, number, number, number][] }
>();

export function buildLockGates(mf: MapFx, list: LockGate[]): void {
  const w = mf.world;
  const t = w.terrain;
  const key = `${t.width}x${t.depth}:${JSON.stringify(list.map((l) => l.segs))}`;
  const hit = lockCache.get(key);
  if (hit) {
    const root = hit.root.clone();
    mf.root.add(root);
    mf.lock = { root, posts: hit.posts, mids: hit.mids, warn: -1, done: false, acc: 0 };
    return;
  }
  const wood = new THREE.MeshLambertMaterial({ map: texture(planksUrl, 1), color: 0xd8b494 });
  const dark = new THREE.MeshLambertMaterial({ map: texture(planksUrl, 1), color: 0x8a6448 });
  const iron = new THREE.MeshLambertMaterial({ map: texture(ironUrl, 1), color: 0x6a6a78 });
  const blockTex = texture(blockUrl, 1);
  const stone = new THREE.MeshLambertMaterial({ map: blockTex, color: 0xd8d0c0 });
  const woodG: THREE.BufferGeometry[] = [];
  const darkG: THREE.BufferGeometry[] = [];
  const ironG: THREE.BufferGeometry[] = [];
  const stoneG: THREE.BufferGeometry[] = [];
  const posts: [number, number, number][] = [];
  const mids: [number, number, number, number, number][] = [];
  const put = (out: THREE.BufferGeometry[], g: THREE.BufferGeometry, m: THREE.Matrix4, tile = 0) => {
    if (tile) planarUv(g, tile);
    g.applyMatrix4(m);
    out.push(g.index ? g.toNonIndexed() : g);
  };
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, rz = 0) => {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return g;
  };
  for (const lg of list) {
    const floor = (x: number, z: number) => {
      const c = t.index(Math.floor(x), Math.floor(z));
      const k = lg.cells.indexOf(c);
      if (k >= 0 && lg.prev[k] === Kind.Bridge) return t.deck[c];
      return t.groundHeight(x, z);
    };
    for (const [x0, z0, x1, z1] of lg.segs) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len));
      let y0 = -Infinity;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        y0 = Math.max(y0, floor(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f));
      }
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const ang = -Math.atan2(z1 - z0, x1 - x0);
      const m = new THREE.Matrix4().makeRotationY(ang).setPosition(cx, y0, cz);
      const half = len / 2;
      const leaves = len > 2.2 ? 2 : 1;
      const lw = len / leaves;
      for (let l = 0; l < leaves; l++) {
        const lx = -half + lw * (l + 0.5);
        put(woodG, box(lw - 0.05, LOCK_H, 0.26, lx, LOCK_H / 2 - 0.05, 0), m, 1.1);
        for (const side of [-1, 1]) {
          const bl = Math.hypot(lw - 0.5, 1.5);
          const br = box(bl, 0.2, 0.06, lx, 1.15, side * 0.16, Math.atan2(1.5, lw - 0.5) * (l % 2 ? -1 : 1));
          put(darkG, br, m, 1.1);
          for (const y of [0.4, 1.95]) put(darkG, box(lw - 0.3, 0.2, 0.06, lx, y, side * 0.16), m, 1.1);
          for (const y of [0.18, 1.18, 2.3]) {
            put(ironG, box(lw - 0.04, 0.13, 0.05, lx, y, side * 0.185), m, 0.6);
            const nr = Math.max(2, Math.round((lw - 0.2) / 0.32));
            for (let r = 0; r < nr; r++)
              put(
                ironG,
                box(0.07, 0.07, 0.04, lx - (lw - 0.25) / 2 + ((lw - 0.25) * r) / (nr - 1), y, side * 0.215),
                m,
              );
          }
          for (const e of [-1, 1])
            put(ironG, box(0.12, LOCK_H - 0.1, 0.05, lx + e * (lw / 2 - 0.1), LOCK_H / 2 - 0.05, side * 0.185), m, 0.6);
          const ring = new THREE.TorusGeometry(0.13, 0.028, 4, 10);
          ring.translate(lx + (leaves === 2 ? (l ? -1 : 1) * (lw / 2 - 0.35) : 0), 1.05, side * 0.24);
          put(ironG, ring, m);
        }
      }
      const nsp = Math.max(2, Math.round(len / 0.42));
      for (let i = 0; i < nsp; i++) {
        const sp = new THREE.ConeGeometry(0.065, 0.32, 4);
        sp.translate(-half + 0.15 + ((len - 0.3) * i) / (nsp - 1), LOCK_H + 0.1, 0);
        put(ironG, sp, m);
      }
      put(ironG, box(len, 0.12, 0.3, 0, LOCK_H - 0.05, 0), m, 0.6);
      for (const e of [-1, 1]) {
        put(stoneG, box(0.62, LOCK_H + 0.55, 0.62, e * half, (LOCK_H + 0.55) / 2 - 0.1, 0), m, 1);
        put(stoneG, box(0.8, 0.22, 0.8, e * half, LOCK_H + 0.48, 0), m, 1);
        const p = new THREE.Vector3(e * half, LOCK_H + 0.7, 0).applyMatrix4(m);
        posts.push([p.x, p.y, p.z]);
      }
      mids.push([cx, y0, cz, x1 - x0, z1 - z0]);
    }
  }
  const root = new THREE.Group();
  const add = (gs: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!gs.length) return;
    const merged = mergeGeometries(gs, false)!;
    gs.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    root.add(mesh);
  };
  add(woodG, wood);
  add(darkG, dark);
  add(ironG, iron);
  add(stoneG, stone);
  lockCache.set(key, { root: root.clone(), posts, mids });
  mf.root.add(root);
  mf.lock = { root, posts, mids, warn: -1, done: false, acc: 0 };
}
export function syncLockGates(mf: MapFx, dt: number): void {
  const L = mf.lock;
  if (!L || L.done) return;
  const w = mf.world;
  const ev = w.mapEvents;
  if (ev.locked) {
    const left = ev.lockUntil - w.time;
    L.root.position.set(0, 0, 0);
    if (left < 5 && mf.fx) {
      L.acc += dt;
      const jig = Math.max(0, 1 - left / 5);
      L.root.position.x = Math.sin(w.time * 47) * 0.012 * jig;
      if (L.acc > 0.5 - jig * 0.3) {
        L.acc = 0;
        for (const [x, y, z] of L.mids)
          emit(mf.fx, {
            tex: FX.dust,
            n: 1,
            x: x + (Math.random() - 0.5) * 1.5,
            y: y + 0.15,
            z: z + (Math.random() - 0.5) * 1.5,
            size: [0.5, 0.9],
            grow: 1.4,
            life: [0.4, 0.7],
            speed: [0.3, 0.8],
            up: [0.2, 0.6],
            opacity: 0.45,
          });
      }
    }
    return;
  }
  const k = w.time - ev.lockUntil;
  if (k > 3.2 || k < 0) {
    L.root.visible = false;
    L.done = true;
    return;
  }
  const q = Math.max(0, (k - 0.35) / 2.4);
  const e = q * q * (3 - 2 * q);
  L.root.position.y = -LOCK_SINK * e;
  L.root.position.x = k < 0.35 ? Math.sin(k * 90) * 0.05 : Math.sin(k * 60) * 0.02 * (1 - q);
  if (!mf.fx) return;
  mf.fx.shake = Math.max(mf.fx.shake, 0.25 * (1 - q));
  L.acc += dt;
  if (L.acc < 0.06 || q >= 1) return;
  L.acc = 0;
  for (const [x, y, z, dx, dz] of L.mids) {
    const u = Math.random() - 0.5;
    emit(mf.fx, {
      tex: FX.dust,
      n: 1,
      x: x + u * dx,
      y: y + 0.2,
      z: z + u * dz,
      size: [0.9, 1.5],
      grow: 1.6,
      life: [0.6, 1.0],
      speed: [0.6, 1.4],
      up: [0.4, 1.0],
      opacity: 0.65,
    });
    if (Math.random() < 0.3)
      chunks(mf.fx, 1, x + u * dx, y + 0.3, z + u * dz, { size: [0.06, 0.12], speed: [1, 2.5], up: [2, 3.5] });
  }
}
export function syncGates(mf: MapFx, dt: number): void {
  const w = mf.world;
  for (const g of mf.gates) {
    const target = w.mapEvents.closed(g.slot.set) ? 0 : -BAR_H - 0.3;
    if (g.y === target) continue;
    const sp = target > g.y ? 9 : 3.2;
    g.y = target > g.y ? Math.min(target, g.y + sp * dt) : Math.max(target, g.y - sp * dt);
    const cx = g.bars.position.x;
    const cz = g.bars.position.z;
    g.bars.position.y = w.groundY(cx, cz) + g.y;
    const u = Math.random() - 0.5;
    const [dx, dz] = g.slot.line
      ? [g.slot.line[2] - g.slot.line[0], g.slot.line[3] - g.slot.line[1]]
      : g.slot.w >= g.slot.h
        ? [g.slot.w, 0]
        : [0, g.slot.h];
    if (mf.fx && Math.random() < dt * 12)
      emit(mf.fx, {
        tex: FX.dust,
        n: 1,
        x: cx + u * dx,
        y: w.groundY(cx, cz) + 0.2,
        z: cz + u * dz,
        size: [0.8, 1.3],
        grow: 1.5,
        life: [0.5, 0.9],
        speed: [0.4, 1.0],
        up: [0.5, 1.2],
        opacity: 0.6,
      });
  }
}
export function onLockGates(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const g = ev as unknown as { stage: "warn" | "shift" };
  if (mf.lock && mf.fx) {
    for (const p of mf.lock.posts)
      emit(mf.fx, {
        tex: FX.twinkle,
        n: g.stage === "shift" ? 4 : 2,
        x: p[0],
        y: p[1],
        z: p[2],
        size: [0.5, 0.9],
        life: [0.6, 1.1],
        speed: [0.6, 1.8],
        up: [0.6, 1.4],
        additive: true,
        color: 0xffe080,
      });
    if (g.stage === "shift")
      for (const [x, y, z] of mf.lock.mids)
        emit(mf.fx, {
          tex: FX.dust,
          n: 6,
          x,
          y: y + 0.3,
          z,
          size: [1.2, 2.0],
          grow: 1.6,
          life: [0.6, 1.0],
          speed: [2, 4],
          flatSpread: true,
          opacity: 0.7,
        });
  }
}
export function onGates(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const g = ev as unknown as { stage: "warn" | "shift" };
  if (g.stage === "warn" && mf.fx) {
    mf.ring = 1.6;
    for (const gt of mf.gates)
      for (const p of gt.posts)
        emit(mf.fx, {
          tex: FX.twinkle,
          n: 2,
          x: p[0],
          y: p[1],
          z: p[2],
          size: [0.5, 0.8],
          life: [0.6, 1.0],
          speed: [0.5, 1.5],
          up: [0.5, 1],
          additive: true,
          color: 0xffe080,
        });
  }
}
/** Golden sparkles on the gate posts while the "gates shifting" warning rings. */

export function syncGateSparkle(mf: MapFx, dt: number): void {
  if (mf.ring > 0 && mf.fx) {
    mf.ring -= dt;
    if (Math.floor((mf.ring + dt) * 4) !== Math.floor(mf.ring * 4)) {
      for (const gt of mf.gates) {
        const p = gt.posts[Math.random() < 0.5 ? 0 : 1];
        emit(mf.fx, {
          tex: FX.twinkle,
          n: 1,
          x: p[0],
          y: p[1],
          z: p[2],
          size: [0.4, 0.7],
          life: [0.4, 0.7],
          speed: [0.3, 1],
          up: [0.6, 1.2],
          additive: true,
          color: 0xffe080,
        });
      }
    }
  }
}
