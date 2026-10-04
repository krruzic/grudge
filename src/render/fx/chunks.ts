// Debris chunks (instanced rock/stone pieces with gravity and bounce) and the per-costume skin registry
// (COSTUME_SKIN, filled by costumeSkins.ts) that themes chunks, fissures and some decals for model costumes.
import * as THREE from "three";
import { FxBatch, fxBatch } from "./instances";
import { activeCostume } from "./atlas";
import stoneUrl from "../../../assets/textures/stone.png?url";
import { type FxHost, type Range, rr } from "./parts";
import type { FissureStyle } from "./fissures";

export const stoneTex = new THREE.TextureLoader().load(stoneUrl);
stoneTex.colorSpace = THREE.SRGBColorSpace;
export const chunkGeos = [0, 1, 2].map((s) => {
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
