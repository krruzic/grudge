import * as THREE from "three";
import type { World } from "../sim/world";
import type { Particles } from "./particles";
import stoneUrl from "../../assets/textures/stone.png?url";

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
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: o.tex, color: o.color ?? 0xffffff, transparent: true, depthWrite: false, depthTest: o.depthTest ?? true,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    if (o.order) s.renderOrder = o.order;
    const j = o.jitter ?? 0;
    s.position.set(o.x + (Math.random() - 0.5) * j, o.y + (Math.random() - 0.5) * j * 0.5, o.z + (Math.random() - 0.5) * j);
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
export function tumblers(h: FxHost, texes: THREE.Texture[], n: number, x: number, y: number, z: number, opts: { speed: Range; up: Range; size: Range; life: Range; dir?: { x: number; z: number }; spread?: number; floorY?: number }): void {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ map: texes[i % texes.length], transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: true }));
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
    h.root.add(m);
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
      (m.material as THREE.MeshBasicMaterial).opacity = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
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
export function chunks(h: FxHost, n: number, x: number, y: number, z: number, opts: { size: Range; speed: Range; up: Range; color?: THREE.ColorRepresentation; life?: number; dir?: { x: number; z: number }; spread?: number; tex?: THREE.Texture }): void {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(chunkGeos[i % 3], new THREE.MeshLambertMaterial({ map: opts.tex ?? stoneTex, color: opts.color ?? 0xb8ab98, flatShading: true, transparent: true }));
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
    h.root.add(m);
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
export function shockwave(h: FxHost, tex: THREE.Texture, x: number, y: number, z: number, normal: THREE.Vector3, r0: number, r1: number, dur: number, color: THREE.ColorRepresentation = 0xffffff, opacity = 1): void {
  const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  m.rotateZ(Math.random() * Math.PI * 2);
  m.position.set(x, y, z);
  h.root.add(m);
  h.add(m, dur, (k) => {
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    m.scale.setScalar((r0 + (r1 - r0) * e) * 2);
    (m.material as THREE.MeshBasicMaterial).opacity = opacity * (1 - k * k);
  });
}

export function decal(h: FxHost, tex: THREE.Texture, x: number, y: number, z: number, radius: number, dur: number, opts: { grow?: number; spin?: number; additive?: boolean; color?: THREE.ColorRepresentation; opacity?: number; rot?: number; stretch?: number } = {}): THREE.Mesh {
  const m = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
    map: tex, color: opts.color ?? 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  m.rotation.set(-Math.PI / 2, 0, opts.rot ?? Math.random() * Math.PI * 2);
  m.position.set(x, y + 0.08, z);
  h.root.add(m);
  const rz = m.rotation.z;
  const op = opts.opacity ?? 1;
  const grow = opts.grow ?? 0;
  h.add(m, dur, (k) => {
    const t = k * dur;
    const g = grow > 0 ? Math.min(1, t / grow) : 1;
    const e = 1 - (1 - g) * (1 - g);
    m.scale.set(radius * 2 * e * (opts.stretch ?? 1), radius * 2 * e, 1);
    m.rotation.z = rz + k * (opts.spin ?? 0);
    (m.material as THREE.MeshBasicMaterial).opacity = op * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
  });
  return m;
}

interface Sample { a: THREE.Vector3; b: THREE.Vector3; t: number }
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

  constructor(tex: THREE.Texture, color: THREE.Color, private life = 0.14, private fade = 1) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      map: tex, color, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
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
