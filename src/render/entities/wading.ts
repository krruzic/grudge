// Water and ground contact for entity views: the waterClip uniform (materials wrapped by clipBelowWater discard
// fragments under the current tide-adjusted water surface, so wading legs disappear into the water), the foam
// ring batch around wading entities, ripples and splashes, and footstep dust.
import * as THREE from "three";
import { FxBatch, fxBatch } from "../fx/instances";
import { emit, type FxHost } from "../fx/parts";
import { FX } from "../fx/atlas";
import { cacheCanvas } from "../../ui/cacheCanvas";
import type { Entity } from "../../sim/types";
import type { EntityViews } from "./entityViews";
import type { View } from "./view";

export const WATER_TIDE_RISE = 0.42;

export const waterClip = { value: -1e9 };

export function clipBelowWater<T extends THREE.Material>(mat: T): T {
  const inner = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    inner(shader, r);
    shader.uniforms.uWaterClip = waterClip;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vWadeY;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n{\nvec4 wadeP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nwadeP = instanceMatrix * wadeP;\n#endif\nvWadeY = (modelMatrix * wadeP).y;\n}",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uWaterClip;\nvarying float vWadeY;")
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (vWadeY < uWaterClip) discard;",
      );
  };
  const prev = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prev()}|wclip`;
  return mat;
}

function ringTexture(size: number, ring: number, width: number, fill: number, broken: number): THREE.CanvasTexture {
  const c = cacheCanvas();
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const img = g.createImageData(size, size);
  const h = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - h) / h;
      const dy = (y + 0.5 - h) / h;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const gap = broken > 0 ? 1 - broken * Math.max(0, Math.sin(ang * 7 + Math.sin(ang * 3) * 1.5)) : 1;
      const band = Math.exp(-(((r - ring) / width) ** 2)) * gap;
      const inner = r < ring ? fill * (r / ring) ** 2 : 0;
      const a = Math.min(1, band + inner) * (r < 1 ? 1 : 0);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rippleTex = ringTexture(64, 0.82, 0.08, 0.1, 0);
const foamTex = ringTexture(64, 0.62, 0.16, 0.35, 0.55);

const flatGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
flatGeo.userData.model = true;

export function foamBatch(max: number): THREE.InstancedMesh {
  const mat = new THREE.MeshBasicMaterial({
    map: foamTex,
    color: 0xeaf6ff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    fog: false,
  });
  const im = new THREE.InstancedMesh(flatGeo, mat, max);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.count = 0;
  im.frustumCulled = false;
  im.matrixAutoUpdate = false;
  im.renderOrder = 3;
  return im;
}

function ripple(
  h: FxHost,
  x: number,
  y: number,
  z: number,
  r0: number,
  r1: number,
  dur: number,
  opacity: number,
): void {
  const b = fxBatch(h.root, "ripple", () => {
    const fb = new FxBatch(
      flatGeo,
      new THREE.MeshBasicMaterial({
        map: rippleTex,
        color: 0xe4f4ff,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    fb.mesh.renderOrder = 3;
    return fb;
  });
  const m = b.spawn();
  m.position.set(x, y, z);
  m.rotation.y = Math.random() * Math.PI * 2;
  m.scale.setScalar(r0);
  m.opacity = opacity;
  h.add(m, dur, (k) => {
    const e = 1 - (1 - k) * (1 - k);
    m.scale.setScalar(r0 + (r1 - r0) * e);
    m.opacity = opacity * (1 - k) * Math.min(1, k * 8);
  });
}

export function splash(h: FxHost, x: number, y: number, z: number, size: number, n: number): void {
  emit(h, {
    tex: FX.splash,
    n,
    x,
    y: y + 0.05,
    z,
    color: 0xe2f4ff,
    size: [size * 0.3, size * 0.5],
    grow: 1.3,
    life: [0.32, 0.48],
    speed: [0.5, 1.3],
    flatSpread: true,
    up: [1.8, 2.8],
    gravity: 10,
    drag: 1,
    opacity: 0.85,
    jitter: size * 0.4,
  });
}
/** Sinks the body a little in water (`v.wade`), places the foam ring, and emits ripples while wading. */
export function wading(ents: EntityViews, e: Entity, v: View, surf: number, dt: number): void {
  const p = v.root.position;
  const depth = surf - p.y;
  const h = e.hero;
  const air = !!h?.jump;
  if (v.rings) for (const m of v.rings) m.position.y = 0.04 + (air ? 0 : Math.max(0, depth) / (m.parent?.scale.y || 1));
  if (air || depth <= 0) {
    v.wade = 0;
    v.wadeY = undefined;
    return;
  }
  const want = h ? 0.6 : e.neutral ? 0.6 : e.unit?.type === "heavy" ? 0.42 : 0.34;
  const sink = Math.max(0, want * Math.min(1, depth / 0.15) - depth);
  v.wade = (v.wade ?? 0) + (sink - (v.wade ?? 0)) * Math.min(1, dt * 10);
  v.wadeY = depth > 0.03 ? surf : undefined;
  v.wadeR = h ? 0.62 * ents.heroScale : e.radius * (e.neutral ? 2.4 : 1.6);
  if (v.wadeY === undefined || v.stealthed || !e.alive) return;
  v.wadeT = (v.wadeT ?? Math.random()) - dt;
  if (v.wadeT > 0) return;
  const moving = h ? Math.hypot(h.vel.x, h.vel.z) > 0.8 : !!e.unit?.moving;
  const r = v.wadeR;
  if (moving) {
    v.wadeT = h ? 0.2 : 0.45;
    ripple(ents.fx, p.x, surf + 0.04, p.z, r * 0.8, r * 2.4, 0.9, h ? 0.55 : 0.4);
  } else {
    v.wadeT = h ? 1.1 : 2.2;
    ripple(ents.fx, p.x, surf + 0.04, p.z, r * 0.9, r * 1.9, 1.5, 0.32);
  }
}
/**
 * Every stride: dust on dry ground, a splash while wading; in hiding cover only the hero's own team sees green
 * leaf puffs. Soldiers skip half their steps.
 */
export function footsteps(ents: EntityViews, e: Entity, v: View): void {
  const x = e.transform.pos.x;
  const z = e.transform.pos.z;
  if (v.lastX !== undefined && v.lastZ !== undefined) {
    const d = Math.hypot(x - v.lastX, z - v.lastZ);
    if (d < 2) v.stepDist += d;
  }
  v.lastX = x;
  v.lastZ = z;
  const hero = !!e.hero;
  const stride = hero ? 1.5 : e.unit?.type === "heavy" ? 1.3 : 1.0;
  if (v.stepDist < stride) return;
  v.stepDist = 0;
  if (!hero && Math.random() < 0.5) return;
  if (e.status.hidden) {
    if (hero && ents.ownTeamOnly(e.team)) ents.fx.dust(x, e.transform.y + 0.3, z, 0.5, 2, 0.6, 0x7fb04a);
    return;
  }
  const big = hero ? ents.heroScale * (e.radius > 0.8 ? 0.9 : 0.6) : e.unit?.type === "heavy" ? 0.7 : 0.45;
  if (v.wadeY !== undefined) {
    splash(ents.fx, x, v.wadeY, z, big, hero ? 3 : 1);
    return;
  }
  ents.fx.dust(x, e.transform.y, z, big, hero ? 2 : 1, 0.7);
}
