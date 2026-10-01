import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { World } from "../sim/world";
import blockUrl from "../../assets/textures/wallblock.png?url";
import { FX } from "./fxKit";
import { gateSlots, type FountainDef, type GatesDef, type GateSlot } from "../sim/mapEvents";
import { chunks, emit, type FxHost } from "./fxParts";

interface Rect {
  x: number;
  z: number;
  w: number;
  h: number;
}

interface Run {
  stage: "warn" | "slide";
  rect: Rect;
  dx: number;
  dz: number;
  start: number;
  seconds: number;
  acc: number;
}

interface Drift {
  mesh: THREE.Mesh;
  start: number;
  until: number;
}

interface Gate {
  slot: GateSlot;
  bars: THREE.Object3D;
  y: number;
  posts: [number, number, number][];
}

const IRON = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
IRON.userData.keep = true;
const BAR_H = 2.7;

const SNOW = new THREE.MeshLambertMaterial({ color: 0xdfe6f2, vertexColors: true });
SNOW.userData.keep = true;

export class MapFx {
  readonly root = new THREE.Group();
  private runs: Run[] = [];
  private drifts: Drift[] = [];
  private now = 0;

  private gates: Gate[] = [];
  private fountain?: FountainDef;
  private sprayAcc = 0;
  private ring = 0;

  constructor(private world: World, private fx?: FxHost) {
    const gd = world.terrain.gates as GatesDef | undefined;
    if (gd) this.buildGates(gateSlots(world, gd));
    this.fountain = world.terrain.fountain as FountainDef | undefined;
  }

  private buildGates(slots: GateSlot[]): void {
    const w = this.world;
    const tex = new THREE.TextureLoader().load(blockUrl);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const stone = new THREE.MeshLambertMaterial({ map: tex, color: 0xd8d0c0 });
    const postGeos: THREE.BufferGeometry[] = [];
    for (const slot of slots) {
      const alongX = slot.w >= slot.h;
      const len = alongX ? slot.w : slot.h;
      const cx = slot.x + slot.w / 2;
      const cz = slot.z + slot.h / 2;
      const thick = alongX ? slot.h : slot.w;
      const y0 = w.groundY(cx, cz);
      const posts: [number, number, number][] = [];
      for (const sg of [-1, 1]) {
        const px = alongX ? cx + sg * (len / 2 + 0.05) : cx;
        const pz = alongX ? cz : cz + sg * (len / 2 + 0.05);
        const g = new THREE.BoxGeometry(alongX ? 0.7 : thick + 0.3, 3.4, alongX ? thick + 0.3 : 0.7);
        g.translate(px, y0 + 1.5, pz);
        postGeos.push(g);
        const cap = new THREE.BoxGeometry(alongX ? 0.9 : thick + 0.5, 0.3, alongX ? thick + 0.5 : 0.9);
        cap.translate(px, y0 + 3.3, pz);
        postGeos.push(cap);
        posts.push([px, y0 + 3.6, pz]);
      }
      const bg: THREE.BufferGeometry[] = [];
      const n = Math.max(3, Math.round(len / 0.45));
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * (len / n);
        const b = new THREE.BoxGeometry(0.1, BAR_H, 0.1);
        b.translate(alongX ? u : 0, BAR_H / 2, alongX ? 0 : u);
        bg.push(b);
        const tip = new THREE.ConeGeometry(0.1, 0.25, 4);
        tip.translate(alongX ? u : 0, BAR_H + 0.12, alongX ? 0 : u);
        bg.push(tip);
      }
      for (const y of [0.35, 1.4, 2.4]) {
        const r = new THREE.BoxGeometry(alongX ? len : 0.14, 0.12, alongX ? 0.14 : len);
        r.translate(0, y, 0);
        bg.push(r);
      }
      const merged = mergeGeometries(bg.map((g) => g.toNonIndexed()), false)!;
      bg.forEach((g) => g.dispose());
      const bars = new THREE.Mesh(merged, IRON);
      bars.position.set(cx, y0, cz);
      const shut = this.world.mapEvents.closed(slot.set);
      const y = shut ? 0 : -BAR_H - 0.3;
      bars.position.y = y0 + y;
      this.root.add(bars);
      this.gates.push({ slot, bars, y, posts });
    }
    if (postGeos.length) {
      const m = mergeGeometries(postGeos.map((g) => g.toNonIndexed()), false)!;
      postGeos.forEach((g) => g.dispose());
      this.root.add(new THREE.Mesh(m, stone));
    }
  }

  private syncGates(dt: number): void {
    const w = this.world;
    for (const g of this.gates) {
      const target = w.mapEvents.closed(g.slot.set) ? 0 : -BAR_H - 0.3;
      if (g.y === target) continue;
      const sp = target > g.y ? 9 : 3.2;
      g.y = target > g.y ? Math.min(target, g.y + sp * dt) : Math.max(target, g.y - sp * dt);
      const cx = g.slot.x + g.slot.w / 2;
      const cz = g.slot.z + g.slot.h / 2;
      g.bars.position.y = w.groundY(cx, cz) + g.y;
      if (this.fx && Math.random() < dt * 12) emit(this.fx, { tex: FX.dust, n: 1, x: cx + (Math.random() - 0.5) * g.slot.w, y: w.groundY(cx, cz) + 0.2, z: cz + (Math.random() - 0.5) * g.slot.h, size: [0.8, 1.3], grow: 1.5, life: [0.5, 0.9], speed: [0.4, 1.0], up: [0.5, 1.2], opacity: 0.6 });
    }
  }

  private syncFountain(dt: number): void {
    const f = this.fountain;
    if (!f || !this.fx) return;
    this.sprayAcc += dt;
    if (this.sprayAcc < 0.07) return;
    this.sprayAcc = 0;
    const y = this.world.groundY(f.x + f.r, f.z);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * (Math.PI / 2);
      const x = f.x + Math.cos(a) * 4.75;
      const z = f.z + Math.sin(a) * 4.75;
      emit(this.fx, { tex: FX.splash, n: 1, x, y: y + 1.9, z, size: [0.55, 0.85], grow: 1.3, life: [0.55, 0.75], speed: [2.6, 3.2], dir: { x: -Math.cos(a), y: 1.3, z: -Math.sin(a) }, cone: 0.12, gravity: 9, opacity: 0.8, color: 0xd8f0ff });
    }
  }

  handle(ev: { type: string; [k: string]: unknown }): void {
    if (ev.type === "gates") {
      const g = ev as unknown as { stage: "warn" | "shift" };
      if (g.stage === "warn" && this.fx) {
        this.ring = 1.6;
        for (const gt of this.gates) for (const p of gt.posts) emit(this.fx, { tex: FX.twinkle, n: 2, x: p[0], y: p[1], z: p[2], size: [0.5, 0.8], life: [0.6, 1.0], speed: [0.5, 1.5], up: [0.5, 1], additive: true, color: 0xffe080 });
      }
      return;
    }
    if (ev.type !== "avalanche") return;
    const e = ev as unknown as { stage: "warn" | "slide" | "settle"; rect: Rect; dx: number; dz: number; seconds: number };
    if (e.stage === "settle") {
      this.drift(e.rect, e.seconds);
      return;
    }
    this.runs.push({ stage: e.stage, rect: e.rect, dx: e.dx, dz: e.dz, start: this.now, seconds: e.seconds, acc: 0 });
    if (e.stage === "slide" && this.fx) this.fx.shake = Math.max(this.fx.shake, 0.8);
  }

  private edge(r: Rect, dx: number, dz: number, u: number, along: number): { x: number; z: number } {
    if (dx !== 0) return { x: dx > 0 ? r.x + along : r.x + r.w - along, z: r.z + u * r.h };
    return { x: r.x + u * r.w, z: dz > 0 ? r.z + along : r.z + r.h - along };
  }

  sync(time: number, dt: number): void {
    this.now = time;
    const w = this.world;
    this.syncGates(dt);
    this.syncFountain(dt);
    if (this.ring > 0 && this.fx) {
      this.ring -= dt;
      if (Math.floor((this.ring + dt) * 4) !== Math.floor(this.ring * 4)) {
        for (const gt of this.gates) {
          const p = gt.posts[Math.random() < 0.5 ? 0 : 1];
          emit(this.fx, { tex: FX.twinkle, n: 1, x: p[0], y: p[1], z: p[2], size: [0.4, 0.7], life: [0.4, 0.7], speed: [0.3, 1], up: [0.6, 1.2], additive: true, color: 0xffe080 });
        }
      }
    }
    const fx = this.fx;
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i];
      const k = (time - r.start) / r.seconds;
      if (k >= 1) {
        this.runs.splice(i, 1);
        continue;
      }
      if (!fx) continue;
      r.acc += dt;
      const span = r.dx !== 0 ? r.rect.w : r.rect.h;
      const cross = r.dx !== 0 ? r.rect.h : r.rect.w;
      if (r.stage === "warn") {
        if (r.acc < 0.12) continue;
        r.acc = 0;
        fx.shake = Math.max(fx.shake, 0.08 + k * 0.2);
        for (let n = 0; n < 2; n++) {
          const p = this.edge(r.rect, r.dx, r.dz, Math.random(), -1.5 + Math.random() * 2);
          const y = w.groundY(p.x, p.z);
          emit(fx, { tex: FX.smoke, n: 1, x: p.x, y: y + 1.5, z: p.z, size: [1.4, 2.4], grow: 1.8, life: [0.8, 1.4], speed: [0.5, 1.6], dir: { x: r.dx, y: -0.2, z: r.dz }, cone: 0.6, opacity: 0.85, color: 0xf4f8ff });
        }
        if (Math.random() < 0.3) {
          const p = this.edge(r.rect, r.dx, r.dz, Math.random(), 0);
          chunks(fx, 1, p.x, w.groundY(p.x, p.z) + 1, p.z, { size: [0.12, 0.25], speed: [1, 3], up: [1, 2] });
        }
        continue;
      }
      if (r.acc < 0.05) continue;
      r.acc = 0;
      fx.shake = Math.max(fx.shake, 0.5);
      const along = k * (span + 4) - 2;
      const n = Math.ceil(cross / 2.2);
      for (let j = 0; j < n; j++) {
        const p = this.edge(r.rect, r.dx, r.dz, (j + Math.random()) / n, along);
        const y = w.groundY(p.x, p.z);
        emit(fx, { tex: FX.smoke, n: 1, x: p.x, y: y + 1.2, z: p.z, size: [3.0, 4.6], grow: 1.6, life: [0.7, 1.2], speed: [3, 6], dir: { x: r.dx, y: 0.35, z: r.dz }, cone: 0.5, opacity: 0.95, color: 0xf8fbff });
        emit(fx, { tex: FX.smoke, n: 1, x: p.x, y: y + 0.4, z: p.z, size: [1.6, 2.4], grow: 1.5, life: [0.5, 0.9], speed: [5, 8], dir: { x: r.dx, y: 0.6, z: r.dz }, cone: 0.7, opacity: 0.9, color: 0xe8f0ff, gravity: 6 });
        if (Math.random() < 0.25) chunks(fx, 1, p.x, y + 0.8, p.z, { size: [0.18, 0.35], speed: [3, 6], up: [2, 4] });
      }
    }
    for (let i = this.drifts.length - 1; i >= 0; i--) {
      const d = this.drifts[i];
      const grow = Math.min(1, (time - d.start) / 0.5);
      const melt = Math.max(0, Math.min(1, (time - (d.until - 2.5)) / 2.5));
      d.mesh.position.y = -0.6 * (1 - grow) - 0.9 * melt;
      if (time >= d.until) {
        this.root.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.drifts.splice(i, 1);
      }
    }
  }

  private drift(r: Rect, seconds: number): void {
    const w = this.world;
    const geos: THREE.BufferGeometry[] = [];
    const base = new THREE.IcosahedronGeometry(1, 1);
    base.deleteAttribute("uv");
    for (let z = r.z; z < r.z + r.h; z += 1.6) {
      for (let x = r.x; x < r.x + r.w; x += 1.6) {
        const px = x + Math.random() * 1.6;
        const pz = z + Math.random() * 1.6;
        const g = base.clone();
        const s = 0.8 + Math.random() * 0.5;
        g.scale(s * 1.25, 0.22 + Math.random() * 0.22, s * 1.25);
        g.rotateY(Math.random() * 6);
        g.translate(px, w.groundY(px, pz), pz);
        const n = g.getAttribute("position").count;
        const col = new Float32Array(n * 3);
        for (let q = 0; q < n; q++) {
          const top = g.getAttribute("position").getY(q) > w.groundY(px, pz) + 0.05 ? 1 : 0.72;
          col.set([top, top, top * 1.04], q * 3);
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        geos.push(g);
      }
    }
    base.dispose();
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, SNOW);
    mesh.position.y = -0.6;
    this.root.add(mesh);
    this.drifts.push({ mesh, start: this.now, until: this.now + seconds });
  }

  dispose(): void {
    for (const d of this.drifts) d.mesh.geometry.dispose();
    this.drifts = [];
    this.root.clear();
  }
}
