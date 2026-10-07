// Helpers shared by the hero kits: ground height lookups, a generic "core" hit (flash + shock + sparkles in the
// kit's colours), streak lines, and the plain prop materials (wood, iron, brass...) used by kegs, barrels, arrows
// and Pip. Materials flagged with keep() / geometry with model() are shared and never disposed by effects.
import * as THREE from "three";
import { FX, tint, hd } from "../fx/atlas";
import { type FxHost, emit } from "../fx/parts";
import { shockwave } from "../fx/shockwave";
import type { HitEvent } from "./registry";

export { UP } from "../fx/parts";
export const ground = (h: FxHost, x: number, z: number, y: number) => (h.world ? h.world.groundY(x, z) : y);
export function dirOf(dx: number, dz: number): THREE.Vector3 {
  const n = new THREE.Vector3(dx, 0, dz);
  if (n.lengthSq() < 1e-4) n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  return n.normalize();
}
export const near = (ev: HitEvent, src: { transform: { pos: { x: number; z: number } } }, r: number) =>
  Math.hypot(src.transform.pos.x - ev.x, src.transform.pos.z - ev.z) <= r;
export function core(
  h: FxHost,
  ev: HitEvent,
  dx: number,
  dz: number,
  main: THREE.Texture,
  ring: THREE.Texture,
  ringColor: THREE.ColorRepresentation,
  sparks: THREE.Texture,
  sparkColor?: THREE.ColorRepresentation,
): { n: THREE.Vector3; px: number; py: number; pz: number; gy: number } {
  const n = dirOf(dx, dz);
  const px = ev.x - n.x * 0.35;
  const pz = ev.z - n.z * 0.35;
  const py = ev.y + 0.3;
  const gy = ground(h, ev.x, ev.z, ev.y - 1);
  const big = ev.big;
  emit(h, {
    tex: FX.burst2,
    n: 1,
    x: px,
    y: py,
    z: pz,
    size: big ? [1.4, 1.4] : [0.9, 0.9],
    grow: 1.6,
    life: [0.1, 0.1],
    speed: [0, 0],
    additive: true,
    order: 6,
  });
  emit(h, {
    tex: main,
    n: 1,
    x: px,
    y: py,
    z: pz,
    size: big ? [2.3, 2.3] : [1.4, 1.4],
    grow: 1.3,
    life: [0.2, 0.2],
    speed: [0, 0],
    order: 5,
  });
  shockwave(h, ring, px, py, pz, n, 0.25, big ? 1.9 : 1.1, big ? 0.28 : 0.18, ringColor, 0.9);
  emit(h, {
    tex: sparks,
    n: big ? 7 : 4,
    x: px,
    y: py,
    z: pz,
    color: sparkColor,
    size: [0.25, 0.45],
    life: [0.18, 0.35],
    speed: [5, 9],
    dir: { x: n.x, y: 0.4, z: n.z },
    cone: 0.9,
    gravity: 12,
    additive: true,
  });
  emit(h, {
    tex: FX.dust,
    n: big ? 3 : 1,
    x: ev.x,
    y: gy + 0.35,
    z: ev.z,
    size: [0.7, 1],
    grow: 1.8,
    life: [0.4, 0.65],
    speed: [1, 2.2],
    flatSpread: true,
    drag: 3,
    opacity: 0.8,
  });
  h.shake = Math.max(h.shake, big ? 0.28 : 0.1);
  return { n, px, py, pz, gy };
}
export function streakLine(
  h: FxHost,
  tex: THREE.Texture,
  x0: number,
  y: number,
  z0: number,
  x1: number,
  z1: number,
  n: number,
  color: THREE.ColorRepresentation = 0xffffff,
  width = 1.6,
  additive = true,
): void {
  const rot = Math.atan2(-(z1 - z0), x1 - x0);
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    h.after(f * 0.12, () => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: hd(tex),
          color: tint(color),
          transparent: true,
          depthWrite: false,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      );
      s.material.rotation = rot;
      s.position.set(x0 + (x1 - x0) * f, y + (Math.random() - 0.5) * 0.3, z0 + (z1 - z0) * f);
      h.add(s, 0.35, (q) => {
        s.scale.set(width * (1 + q * 0.4), width * 0.5 * (1 - q * 0.5), 1);
        s.material.opacity = 0.9 * (1 - q);
      });
    });
  }
}
export const keep = <T extends THREE.Material>(m: T): T => {
  m.userData.keep = true;
  return m;
};
export const model = <T extends THREE.BufferGeometry>(g: T): T => {
  g.userData.model = true;
  return g;
};
export const WOOD = keep(new THREE.MeshLambertMaterial({ color: 0x9a6232, flatShading: true }));
export const WOOD_DARK = keep(new THREE.MeshLambertMaterial({ color: 0x4e3018, flatShading: true }));
export const IRON = keep(new THREE.MeshLambertMaterial({ color: 0x55545a, flatShading: true }));
export const BRASS = keep(new THREE.MeshLambertMaterial({ color: 0xc8a040, flatShading: true }));
export const FUSE = keep(new THREE.MeshLambertMaterial({ color: 0xc8b080 }));
export const RED = keep(new THREE.MeshLambertMaterial({ color: 0xd8281c, flatShading: true }));
export const RED_DARK = keep(new THREE.MeshLambertMaterial({ color: 0x8a1810, flatShading: true }));
export const BEAK = keep(new THREE.MeshLambertMaterial({ color: 0xf0b030, flatShading: true }));
export const CREAM = keep(new THREE.MeshLambertMaterial({ color: 0xf0e0c0, flatShading: true }));
export const BLACK = keep(new THREE.MeshLambertMaterial({ color: 0x141010 }));
export const FEATHER_MAT = keep(
  new THREE.MeshLambertMaterial({ color: 0xf0e8d8, flatShading: true, side: THREE.DoubleSide }),
);
export function normalized(o: THREE.Object3D, size: number): THREE.Group {
  const box = new THREE.Box3().setFromObject(o);
  const s = box.getSize(new THREE.Vector3());
  const m = Math.max(s.x, s.y, s.z) || 1;
  const c = box.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  o.position.sub(c);
  o.position.y += s.y / 2;
  g.add(o);
  g.scale.setScalar(size / m);
  return g;
}
