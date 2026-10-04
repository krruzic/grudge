// FX building blocks shared by kits, combat, hazards and map effects. Everything draws through an FxHost (in
// practice CombatFx): `add` a timed object, `after` a delayed callback, `particles`, `shake`, `root`, `world`.
// This file has the particle emitters (emit, tumblers); the other pieces live next to it: chunks.ts (debris),
// shockwave.ts, fissures.ts (3D ground cracks), decals.ts (ground decals, some drawn as 3D models), ribbon.ts.
// All of them run under the active costume (atlas.ts): textures go through hd()/cv() and colours through tint().
import * as THREE from "three";
import type { World } from "../../sim/world";
import type { Particles } from "./particles";
import { FxBatch, fxBatch } from "./instances";
import { activeCostume, cv, hd, tint } from "./atlas";

export interface FxHost {
  root: THREE.Group;
  particles?: Particles;
  world?: World;
  shake: number;
  add(obj: THREE.Object3D, dur: number, tick: (k: number, dt: number) => void): void;
  after(seconds: number, run: () => void): void;
}

export type Range = [number, number];
export const rr = (r: Range) => r[0] + Math.random() * (r[1] - r[0]);
export const UP = new THREE.Vector3(0, 1, 0);

interface EmitOpts {
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
export const planeGeo = new THREE.PlaneGeometry(1, 1);
export const SHARED_PLANE_GEOS = new Set<THREE.BufferGeometry>([planeGeo, leafGeo]);
