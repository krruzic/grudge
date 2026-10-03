import * as THREE from "three";
import { FX, RAIDER, WARLORD } from "./fxKit";

const RAIDER_DROP = RAIDER.drop;
import { chunks, decal, emit, shockwave, type FxHost } from "./fxParts";
import { FxBatch, fxBatch } from "./fxInstances";
import { KITS } from "./kits";
import { propParts } from "./props";

const UP = new THREE.Vector3(0, 1, 0);
const ground = (h: FxHost, x: number, z: number, y: number) => (h.world ? h.world.groundY(x, z) : y);

function dirOf(dx: number, dz: number): THREE.Vector3 {
  const n = new THREE.Vector3(dx, 0, dz);
  if (n.lengthSq() < 1e-4) n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  return n.normalize();
}

const slabGeo = new THREE.BoxGeometry(1, 0.35, 0.8);
slabGeo.userData.model = true;
const slabMat = new THREE.MeshLambertMaterial({ map: WARLORD.slab, flatShading: true });
export const spikeGeo = new THREE.ConeGeometry(0.42, 1.6, 5);
spikeGeo.userData.model = true;
export const spikeMat = new THREE.MeshLambertMaterial({ map: WARLORD.slab, color: 0xd8c8b0, flatShading: true });
slabMat.userData.keep = spikeMat.userData.keep = true;

function slabs(h: FxHost, x: number, z: number, r: number, n: number, up: number, life: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = r * (0.55 + Math.random() * 0.45);
    const sx = x + Math.cos(a) * d;
    const sz = z + Math.sin(a) * d;
    const gy = ground(h, sx, sz, 0);
    const m = fxBatch(h.root, "slab", () => new FxBatch(slabGeo, slabMat.clone())).spawn();
    const s = 0.7 + Math.random() * 0.7;
    m.scale.set(0, 0, 0);
    m.rotation.order = "YXZ";
    const tilt = 0.5 + Math.random() * 0.5;
    m.rotation.set(-tilt, -a + Math.PI / 2, (Math.random() - 0.5) * 0.4);
    const delay = (d / r) * 0.08;
    h.add(m, life, (k) => {
      const t = k * life - delay;
      const e = t <= 0 ? 0 : t < 0.1 ? t / 0.1 : 1;
      const sink = k > 0.75 ? (k - 0.75) / 0.25 : 0;
      m.position.set(sx, gy - 0.4 + (up * s) * e - sink * 0.9, sz);
      m.scale.setScalar(t > 0 ? s : 0);
    });
  }
}

export function spikeBatch(root: THREE.Object3D): FxBatch {
  return fxBatch(root, "spike", () => {
    const p = propParts("spike");
    return p ? new FxBatch(p.geo, p.mat.clone()) : new FxBatch(spikeGeo, spikeMat.clone());
  });
}

function spikes(h: FxHost, x: number, z: number, r: number, n: number, life: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const d = r * (0.3 + Math.random() * 0.65);
    const sx = x + Math.cos(a) * d;
    const sz = z + Math.sin(a) * d;
    const gy = ground(h, sx, sz, 0);
    const m = spikeBatch(h.root).spawn();
    const s = 0.7 + Math.random() * 0.8;
    const sy = s * (0.9 + Math.random() * 0.6);
    m.scale.set(0, 0, 0);
    m.rotation.set(Math.cos(a) * 0.35 + (Math.random() - 0.5) * 0.2, Math.random() * 3, -Math.sin(a) * 0.35);
    const delay = (d / r) * 0.18;
    const hgt = 1.6 * sy;
    let popped = false;
    h.add(m, life, (k) => {
      const t = k * life - delay;
      const e = t <= 0 ? 0 : t < 0.08 ? t / 0.08 : 1;
      const sink = k > 0.72 ? (k - 0.72) / 0.28 : 0;
      m.position.set(sx, gy - hgt / 2 + hgt * 0.9 * e - sink * hgt, sz);
      if (t > 0) m.scale.set(s, sy, s);
      else m.scale.set(0, 0, 0);
      if (!popped && t > 0) {
        popped = true;
        emit(h, { tex: WARLORD.dust, n: 1, x: sx, y: gy + 0.5, z: sz, size: [1, 1.4], grow: 1.8, life: [0.5, 0.8], speed: [0.5, 1.4], flatSpread: true, drag: 2, opacity: 0.85 });
        chunks(h, 1, sx, gy + 0.5, sz, { size: [0.1, 0.18], speed: [1, 2.5], up: [3, 6] });
      }
    });
  }
}

export function warlordHit(h: FxHost, x: number, y: number, z: number, dx: number, dz: number, big: boolean): void {
  const n = dirOf(dx, dz);
  const px = x - n.x * 0.35;
  const pz = z - n.z * 0.35;
  const py = y + 0.3;
  const gy = ground(h, x, z, y - 1);
  emit(h, { tex: FX.burst2, n: 1, x: px, y: py, z: pz, size: big ? [1.6, 1.6] : [1, 1], grow: 1.6, life: [0.1, 0.1], speed: [0, 0], additive: true, order: 6 });
  emit(h, { tex: WARLORD.impact, n: 1, x: px, y: py, z: pz, size: big ? [2.6, 2.6] : [1.5, 1.5], grow: 1.3, life: [0.2, 0.2], speed: [0, 0], order: 5 });
  shockwave(h, WARLORD.ring, px, py, pz, n, 0.3, big ? 2.2 : 1.3, big ? 0.3 : 0.2, 0xffffff, 0.9);
  emit(h, { tex: WARLORD.ember, n: big ? 10 : 5, x: px, y: py, z: pz, size: [0.25, 0.45], life: [0.25, 0.5], speed: [5, 10], dir: { x: n.x, y: 0.4, z: n.z }, cone: 0.9, gravity: 14, additive: true });
  emit(h, { tex: WARLORD.pebbles, n: big ? 3 : 1, x, y: gy + 0.4, z, size: [0.5, 0.8], life: [0.4, 0.6], speed: [2, 4], up: [2, 4], dir: { x: n.x, y: 0.3, z: n.z }, cone: 1.2, gravity: 16, spin: 6, floor: gy + 0.1 });
  emit(h, { tex: WARLORD.dust, n: big ? 5 : 2, x, y: gy + 0.4, z, size: [0.8, 1.2], grow: 1.9, life: [0.45, 0.8], speed: [1.2, 2.8], flatSpread: true, drag: 3, opacity: 0.85, jitter: 0.5 });
  if (big) {
    decal(h, WARLORD.crackRing, x, gy, z, 1.4, 1.6, { grow: 0.06 });
    chunks(h, 4, x, gy + 0.3, z, { size: [0.14, 0.26], speed: [2, 4], up: [4, 7] });
  }
  h.shake = Math.max(h.shake, big ? 0.35 : 0.14);
}

function slamFx(h: FxHost, x: number, z: number, r: number, heavy: boolean): void {
  const gy = ground(h, x, z, 0);
  decal(h, WARLORD.crackRing, x, gy, z, r * 0.9, 1.8, { grow: 0.08 });
  decal(h, WARLORD.lavaCrack, x, gy + 0.01, z, r * (heavy ? 1.1 : 0.7), heavy ? 2.4 : 1.6, { grow: 0.12, opacity: 0.95 });
  emit(h, { tex: FX.burst, n: 1, x, y: gy + 0.4, z, size: [r * 0.9, r * 0.9], grow: 1.4, life: [0.12, 0.12], speed: [0, 0], additive: true });
  if (!heavy) {
    shockwave(h, WARLORD.ring, x, gy + 0.2, z, UP, 0.5, r * 1.15, 0.4, 0xffe0c0);
    h.after(0.08, () => shockwave(h, FX.shock, x, gy + 0.25, z, UP, 0.5, r * 0.9, 0.35, 0xffffff, 0.8));
  }
  const ring = heavy ? 20 : 12;
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    emit(h, { tex: WARLORD.dust, n: 1, x: x + Math.cos(a) * r * 0.5, y: gy + 0.5, z: z + Math.sin(a) * r * 0.5, size: [1.1, 1.6], grow: 1.9, life: [0.6, 1], speed: [r * 0.9, r * 1.4], dir: { x: Math.cos(a), y: 0.15, z: Math.sin(a) }, cone: 0.25, drag: 3.2, opacity: 0.9 });
  }
  emit(h, { tex: WARLORD.ember, n: heavy ? 18 : 8, x, y: gy + 0.5, z, size: [0.25, 0.5], life: [0.5, 1.1], speed: [1, 4], up: [3, 6], gravity: 5, additive: true, jitter: r });
  chunks(h, heavy ? 10 : 5, x, gy + 0.4, z, { size: [0.16, 0.32], speed: [2, 5], up: [5, 9] });
  if (heavy) {
    spikes(h, x, z, r, Math.round(r * 2.2), 1.8);
    emit(h, { tex: WARLORD.lavaGlow, n: 6, x, y: gy + 0.3, z, size: [0.9, 1.4], grow: 1.5, life: [0.6, 1.1], speed: [0, 0.5], up: [0.2, 0.6], additive: true, jitter: r * 1.2, opacity: 0.8 });
  } else slabs(h, x, z, r, Math.round(r * 2.4), 0.45, 1.3);
  h.shake = Math.max(h.shake, heavy ? 0.75 : 0.4);
}

function challengeFx(h: FxHost, x: number, z: number, gy: number, r: number, team: number): void {
  emit(h, { tex: WARLORD.impact, n: 1, x, y: gy + 2.6, z, size: [2.8, 2.8], grow: 1.3, life: [0.3, 0.3], speed: [0, 0], order: 6 });
  decal(h, WARLORD.rune, x, gy, z, r, 0.9, { grow: 0.2, spin: -2, additive: true, color: 0xffc040 });
  shockwave(h, WARLORD.ring, x, gy + 0.3, z, UP, r, 0.6, 0.45, 0xffd080);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    emit(h, { tex: WARLORD.dust, n: 1, x: x + Math.cos(a) * r, y: gy + 0.4, z: z + Math.sin(a) * r, size: [1, 1.4], grow: 1.6, life: [0.5, 0.7], speed: [r * 1.4, r * 1.6], dir: { x: -Math.cos(a), y: 0.1, z: -Math.sin(a) }, cone: 0.15, drag: 3, opacity: 0.85 });
  }
  if (h.world) {
    for (const o of h.world.entities) {
      if (!o.alive || o.structure || Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) > r + 1) continue;
      if (o.team === team) continue;
      chainLine(h, x, gy + 1.5, z, o.transform.pos.x, o.transform.y + 1.2, o.transform.pos.z);
    }
  }
  h.shake = Math.max(h.shake, 0.35);
}

const linkGeo = new THREE.TorusGeometry(0.16, 0.05, 4, 8);
linkGeo.userData.model = true;
const linkMat = new THREE.MeshLambertMaterial({ color: 0x8a8a96, flatShading: true });
linkMat.userData.keep = true;
function chainLine(h: FxHost, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  const g = new THREE.Group();
  const n = Math.max(4, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.26));
  for (let i = 0; i < n; i++) {
    const l = new THREE.Mesh(linkGeo, linkMat);
    l.userData.f = i / (n - 1);
    l.rotation.set(0, Math.atan2(x1 - x0, z1 - z0), i % 2 ? Math.PI / 2 : 0);
    g.add(l);
  }
  h.root.add(g);
  h.add(g, 0.7, (k) => {
    const reel = k < 0.15 ? k / 0.15 : 1;
    const back = k > 0.15 ? Math.min(1, (k - 0.15) / 0.5) : 0;
    for (const l of g.children) {
      const f = l.userData.f * reel;
      const ex = x1 + (x0 - x1) * back;
      const ez = z1 + (z0 - z1) * back;
      const ey = y1 + (y0 - y1) * back;
      l.position.set(x0 + (ex - x0) * f, y0 + (ey - y0) * f - Math.sin(f * Math.PI) * 0.3, z0 + (ez - z0) * f);
      l.visible = l.userData.f <= reel && f <= 1 - back * 0.98;
    }
  });
}

function bloodroarFx(h: FxHost, x: number, z: number, gy: number, r: number): void {
  emit(h, { tex: WARLORD.rage, n: 1, x, y: gy + 2.6, z, color: 0xff6060, size: [2.6, 2.6], grow: 1.6, life: [0.3, 0.3], speed: [0, 0], additive: true, order: 6 });
  for (let k = 0; k < 3; k++) h.after(k * 0.13, () => decal(h, WARLORD.ring, x, gy + 0.02 * k, z, r, 0.55, { grow: 0.5, additive: true, color: 0xff3030, opacity: 0.85 }));
  for (let k = 0; k < 3; k++) h.after(k * 0.12, () => shockwave(h, WARLORD.ring, x, gy + 2.2, z, UP, 0.6, r * 0.9, 0.55, 0xffb060, 0.9));
  emit(h, { tex: RAIDER_DROP, n: 18, x, y: gy + 2.2, z, size: [0.25, 0.4], life: [0.6, 1], speed: [2, 5], up: [2, 4], gravity: 14, floor: gy + 0.05, jitter: 1 });
  emit(h, { tex: FX.smoke, n: 6, x, y: gy + 1, z, color: 0xa02020, size: [1.2, 1.8], grow: 1.6, life: [0.7, 1.1], speed: [1, 2.5], flatSpread: true, up: [0.3, 0.8], drag: 2, opacity: 0.6 });
  h.shake = Math.max(h.shake, 0.3);
}

function warcry(h: FxHost, src: { team: number; transform: { pos: { x: number; z: number }; y: number } }, r: number, style?: string): void {
  const x = src.transform.pos.x;
  const z = src.transform.pos.z;
  const gy = ground(h, x, z, src.transform.y);
  if (style === "challenge") return challengeFx(h, x, z, gy, r, src.team);
  if (style === "blood") return bloodroarFx(h, x, z, gy, r);
  const hy = gy + 2.6;
  emit(h, { tex: WARLORD.rage, n: 1, x, y: hy, z, size: [2.4, 2.4], grow: 1.6, life: [0.3, 0.3], speed: [0, 0], additive: true, order: 6 });
  emit(h, { tex: WARLORD.helm, n: 1, x, y: hy + 1.4, z, size: [1.4, 1.4], grow: 1.25, life: [1, 1], speed: [0, 0], up: [0.8, 0.8], fadeIn: 0.1, order: 7 });
  decal(h, WARLORD.rune, x, gy, z, 2.4, 1.2, { grow: 0.15, spin: 1.5, additive: true, color: 0xff9060 });
  for (let k = 0; k < 3; k++) h.after(k * 0.13, () => decal(h, WARLORD.ring, x, gy + 0.02 * k, z, r, 0.55, { grow: 0.5, additive: true, color: 0xffa060, opacity: 0.85 }));
  for (let k = 0; k < 3; k++) h.after(k * 0.12, () => shockwave(h, WARLORD.ring, x, hy - 0.4, z, UP, 0.6, r * 0.9, 0.55, 0xffb060, 0.9));
  emit(h, { tex: WARLORD.ember, n: 16, x, y: gy + 0.4, z, size: [0.25, 0.5], life: [0.8, 1.4], speed: [0.5, 2], up: [2.5, 5], drag: 1, additive: true, jitter: 2.5 });
  emit(h, { tex: WARLORD.dust, n: 8, x, y: gy + 0.3, z, size: [1, 1.4], grow: 1.8, life: [0.6, 0.9], speed: [3, 5], flatSpread: true, drag: 3, opacity: 0.8 });
  h.shake = Math.max(h.shake, 0.3);
}

KITS.warlord = {
  trail: 0xffb070,
  trailWidth: 0.25,
  hit(h, ev, src, dx, dz) {
    const d = Math.hypot(src.transform.pos.x - ev.x, src.transform.pos.z - ev.z);
    if (d > 4) return false;
    warlordHit(h, ev.x, ev.y, ev.z, dx, dz, ev.big);
    return true;
  },
  event(h, ev, src) {
    if (ev.type === "slam") {
      const a = src.hero?.action;
      slamFx(h, ev.x, ev.z, ev.radius, a?.kind === "quake");
      return true;
    }
    if (ev.type === "warcry") {
      warcry(h, src, ev.radius, ev.style);
      return true;
    }
    if (ev.type === "charge") {
      emit(h, { tex: WARLORD.dust, n: 8, x: ev.x, y: ev.y + 0.4, z: ev.z, size: [1, 1.4], grow: 1.8, life: [0.5, 0.8], speed: [1, 2.5], flatSpread: true, drag: 2.5, opacity: 0.85 });
      emit(h, { tex: WARLORD.rage, n: 1, x: ev.x, y: ev.y + 2.4, z: ev.z, size: [1.6, 1.6], grow: 1.4, life: [0.25, 0.25], speed: [0, 0], additive: true });
      h.shake = Math.max(h.shake, 0.2);
      return true;
    }
    return false;
  },
  act(h, ev, src) {
    if (ev.phase === "start" && ev.kind === "quake") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, { tex: WARLORD.dust, n: 6, x: ev.x, y: gy + 0.3, z: ev.z, size: [0.9, 1.3], grow: 1.8, life: [0.5, 0.8], speed: [2, 3.5], flatSpread: true, drag: 3, opacity: 0.85 });
      emit(h, { tex: WARLORD.rage, n: 1, x: ev.x, y: gy + 2.4, z: ev.z, size: [2, 2], grow: 1.3, life: [0.3, 0.3], speed: [0, 0], additive: true });
      decal(h, WARLORD.rune, ev.x, gy, ev.z, 2.2, 0.8, { grow: 0.1, spin: 3, additive: true, color: 0xff8040 });
    }
    if (ev.phase === "start" && ev.kind === "slam") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, { tex: WARLORD.ember, n: 6, x: ev.x, y: gy + 2.2, z: ev.z, size: [0.2, 0.35], life: [0.3, 0.5], speed: [1, 2], additive: true, jitter: 0.6 });
    }
    void src;
  },
};
