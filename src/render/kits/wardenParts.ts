import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { chunks, decal, emit, shockwave, tumblers, type FxHost } from "../fx/parts";
import barkUrl from "../../../assets/textures/moss_bark.png?url";
import { dirOf, ground } from "./shared";
import { activeCostume, WARDEN, FX } from "../fx/atlas";
import { isDesert, cactusMat } from "./desert";

export const barkTex = new THREE.TextureLoader().load(barkUrl);
barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
barkTex.colorSpace = THREE.SRGBColorSpace;

export const TUBE_MAX = 12;
export function tubeBundle(
  h: FxHost,
  geos: THREE.BufferGeometry[],
  src: THREE.Material,
  life: number,
  tick: (k: number, shown: number[], sink: number[]) => void,
): void {
  const shown = new Array<number>(TUBE_MAX).fill(0);
  const sink = new Array<number>(TUBE_MAX).fill(0);
  const parts = geos.map((g, i) => {
    const q = g.toNonIndexed();
    g.dispose();
    const n = q.getAttribute("position").count;
    const k = new Float32Array(n);
    for (let j = 0; j < n; j++) k[j] = j;
    q.setAttribute("aK", new THREE.BufferAttribute(k, 1));
    q.setAttribute("aTube", new THREE.BufferAttribute(new Float32Array(n).fill(i), 1));
    return q;
  });
  const geo = mergeGeometries(parts, false)!;
  for (const q of parts) q.dispose();
  const mat = src.clone();
  mat.userData.keep = false;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uShown = { value: shown };
    shader.uniforms.uSink = { value: sink };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nattribute float aK;\nattribute float aTube;\nuniform float uShown[${TUBE_MAX}];\nuniform float uSink[${TUBE_MAX}];`,
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nint ti = int(aTube + 0.5);\ntransformed.y += uSink[ti];\nif (aK >= uShown[ti]) transformed = vec3(0.0);",
      );
  };
  mat.customProgramCacheKey = () => "tube-bundle";
  const mesh = new THREE.Mesh(geo, mat);
  h.root.add(mesh);
  h.add(mesh, life, (k) => tick(k, shown, sink));
}
export const handMat = () => new THREE.MeshLambertMaterial({ map: barkTex, color: 0xfff0d8, flatShading: true });
export function woodHand(): THREE.Group {
  const mat = handMat();
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.75), mat);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.46), mat);
    f.position.set(-0.3 + i * 0.2, 0.02, 0.58 + (i === 1 || i === 2 ? 0.05 : 0));
    f.rotation.x = -0.12;
    g.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.4), mat);
  thumb.position.set(0.5, 0, 0.2);
  thumb.rotation.y = -0.7;
  g.add(thumb);
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.34, 0.26, 7),
    new THREE.MeshLambertMaterial({ map: barkTex, color: 0x6a8a4a, flatShading: true }),
  );
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = -0.45;
  g.add(cuff);
  return g;
}
export function wardenSlap(
  h: FxHost,
  x: number,
  y: number,
  z: number,
  tx: number,
  tz: number,
  hit: boolean,
  realArm = false,
): void {
  const dx = tx - x;
  const dz = tz - z;
  const len = Math.max(0.5, Math.hypot(dx, dz));
  const ux = dx / len;
  const uz = dz / len;
  const sy = y + 1.8;
  const ty = ground(h, tx, tz, y) + 1.15;
  const tex = barkTex.clone();
  tex.repeat.set(1.5, len / 1.1);
  tex.needsUpdate = true;
  const arm = new THREE.Group();
  const limbGeo = new THREE.CylinderGeometry(0.22, 0.36, 1, 7, 8);
  const lp = limbGeo.getAttribute("position");
  for (let i = 0; i < lp.count; i++) {
    const yy = lp.getY(i);
    const wob = 1 + Math.sin(yy * 23 + lp.getX(i) * 5) * 0.12 + Math.sin(yy * 57) * 0.06;
    lp.setX(i, lp.getX(i) * wob + Math.sin(yy * 9) * 0.05);
    lp.setZ(i, lp.getZ(i) * wob);
  }
  limbGeo.computeVertexNormals();
  const limb = new THREE.Mesh(
    limbGeo,
    isDesert(activeCostume())
      ? cactusMat([6, 3])
      : new THREE.MeshLambertMaterial({ map: tex, color: 0xfff0d8, flatShading: true }),
  );
  limb.position.y = 0.5;
  if (!realArm) arm.add(limb);
  const knots: THREE.Object3D[] = [];
  const tuftMat = new THREE.MeshBasicMaterial({
    map: WARDEN.moss,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const k = new THREE.Group();
    for (let q = 0; q < 2; q++) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(0.62, 0.42),
        i === 1 && q
          ? new THREE.MeshBasicMaterial({ map: WARDEN.leaf, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide })
          : tuftMat,
      );
      p.rotation.y = (q * Math.PI) / 2;
      p.position.y = 0.25;
      k.add(p);
    }
    knots.push(k);
    if (!realArm) h.root.add(k);
  }
  const hand = woodHand();
  hand.scale.setScalar(1.6);
  hand.visible = !realArm;
  h.root.add(arm, hand);
  const dir = new THREE.Vector3(ux * len, ty - sy, uz * len);
  const full = dir.length();
  const unit = dir.clone().normalize();
  arm.position.set(x, sy, z);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);
  const yaw = Math.atan2(ux, uz);
  const out = 0.06;
  const hold = 0.24;
  const dur = 0.5;
  let impact = false;
  let shed = false;
  h.add(arm, dur, (k) => {
    const s = k * dur;
    let f: number;
    if (s < out) {
      const t = s / out;
      f = 1 - Math.pow(1 - t, 3);
    } else if (s < hold) f = 1 + Math.sin(((s - out) / (hold - out)) * Math.PI) * 0.03;
    else f = Math.max(0.02, 1 - Math.pow((s - hold) / (dur - hold), 1.6));
    arm.scale.set(1, full * f, 1);
    const hp = new THREE.Vector3(x + dir.x * f, sy + dir.y * f, z + dir.z * f);
    hand.position.copy(hp);
    hand.rotation.set(-0.2, yaw, s < out ? -1.4 * (1 - f) : s < hold ? 0.25 : 0);
    knots.forEach((kn, i) => {
      const at = (0.25 + i * 0.25) * f;
      kn.position.set(x + dir.x * at, sy + dir.y * at, z + dir.z * at);
      kn.rotation.set(0, yaw + i, 0);
      kn.visible = !realArm && f > 0.15;
    });
    if (s < out) {
      for (let i = 0; i < 2; i++) {
        const at = Math.random() * f;
        emit(h, {
          tex: FX.streak,
          n: 1,
          x: x + dir.x * at + (Math.random() - 0.5) * 0.6,
          y: sy + dir.y * at + (Math.random() - 0.5) * 0.6,
          z: z + dir.z * at + (Math.random() - 0.5) * 0.6,
          size: [0.7, 1.1],
          life: [0.12, 0.18],
          speed: [0, 0],
          additive: true,
          opacity: 0.7,
        });
      }
    }
    if (!impact && s >= out) {
      impact = true;
      if (hit) {
        wardenHit(h, tx, ty - 0.35, tz, ux, uz, true);
        shockwave(h, FX.shock, tx - ux * 0.5, ty, tz - uz * 0.5, unit, 0.4, 2.8, 0.3, 0xffffff);
        h.shake = Math.max(h.shake, 0.35);
      } else {
        const gy = ground(h, tx, tz, y);
        emit(h, {
          tex: WARDEN.pebbleDust,
          n: 4,
          x: tx,
          y: gy + 0.3,
          z: tz,
          size: [0.8, 1.2],
          grow: 1.7,
          life: [0.4, 0.7],
          speed: [1, 2.5],
          flatSpread: true,
          drag: 3,
          opacity: 0.9,
        });
        shockwave(h, FX.shock, tx, ty, tz, unit, 0.3, 1.4, 0.2, 0xffffff, 0.6);
      }
    }
    if (!shed && s >= hold) {
      shed = true;
      for (let i = 0; i < 4; i++) {
        const at = 0.2 + Math.random() * 0.7;
        tumblers(h, LEAVES, 1, x + dir.x * at, sy + dir.y * at, z + dir.z * at, {
          speed: [0.3, 1],
          up: [0.5, 1.5],
          size: [0.28, 0.4],
          life: [1.6, 2.2],
        });
      }
    }
  });
  h.add(hand, dur, () => {});
  for (const kn of knots) if (!realArm) h.add(kn, dur, () => {});
  h.after(dur + 0.1, () => tex.dispose());
}
export function wardenWallBlock(
  h: FxHost,
  x: number,
  y: number,
  z: number,
  delay: number,
  dirX: number,
  dirZ: number,
  wood = false,
): void {
  if (wood) {
    h.after(delay, () => {
      emit(h, {
        tex: FX.dust,
        n: 3,
        x,
        y: y + 0.35,
        z,
        size: [0.9, 1.3],
        grow: 1.8,
        life: [0.5, 0.8],
        speed: [1.5, 3],
        flatSpread: true,
        drag: 3,
        opacity: 0.9,
        jitter: 0.6,
      });
      emit(h, {
        tex: WARDEN.splinters,
        n: 1,
        x,
        y: y + 1.2,
        z,
        size: [1.4, 1.4],
        grow: 1.4,
        life: [0.25, 0.25],
        speed: [0, 0],
      });
      emit(h, {
        tex: WARDEN.bark,
        n: 3,
        x,
        y: y + 1,
        z,
        size: [0.3, 0.45],
        life: [0.5, 0.8],
        speed: [2, 4],
        up: [3, 5],
        gravity: 16,
        spin: 10,
        floor: y + 0.1,
      });
      h.shake = Math.max(h.shake, 0.15);
    });
    return;
  }
  h.after(delay, () => {
    emit(h, {
      tex: FX.dust,
      n: 3,
      x,
      y: y + 0.35,
      z,
      size: [0.9, 1.4],
      grow: 1.8,
      life: [0.55, 0.9],
      speed: [1.5, 3],
      flatSpread: true,
      drag: 3,
      opacity: 0.9,
      jitter: 0.6,
    });
    emit(h, {
      tex: WARDEN.pebbleDust,
      n: 1,
      x,
      y: y + 0.6,
      z,
      size: [1.2, 1.5],
      grow: 1.5,
      life: [0.5, 0.6],
      speed: [0.2, 0.6],
      up: [0.6, 1],
    });
    chunks(h, 2, x, y + 0.4, z, { size: [0.12, 0.22], speed: [1, 3], up: [5, 8] });
    decal(h, WARDEN.mossCrack, x + dirX * 0.1, y, z + dirZ * 0.1, 0.95, 4, { grow: 0.08, opacity: 0.9 });
    h.shake = Math.max(h.shake, 0.18);
  });
}
export function wardenWallCrumble(h: FxHost, x: number, y: number, z: number): void {
  emit(h, {
    tex: FX.dust,
    n: 2,
    x,
    y: y + 0.8,
    z,
    size: [1, 1.5],
    grow: 1.6,
    life: [0.6, 0.9],
    speed: [0.6, 1.6],
    flatSpread: true,
    drag: 2,
    opacity: 0.85,
    jitter: 0.8,
  });
  chunks(h, 4, x, y + 1.4, z, { size: [0.2, 0.34], speed: [0.8, 2.2], up: [1, 3], tex: undefined });
}
export function wardenSprout(h: FxHost, x: number, y: number, z: number): void {
  emit(h, {
    tex: FX.dust,
    n: 2,
    x,
    y: y + 0.3,
    z,
    size: [0.6, 0.9],
    grow: 1.7,
    life: [0.4, 0.6],
    speed: [0.6, 1.4],
    flatSpread: true,
    drag: 3,
    opacity: 0.85,
  });
  if (Math.random() < 0.5)
    tumblers(h, LEAVES, 1, x, y + 0.5, z, { speed: [0.5, 1.5], up: [2, 3.5], size: [0.4, 0.5], life: [1.4, 2] });
}
export function wardenBrambleCast(h: FxHost, x: number, y: number, z: number, r: number): void {
  const gy = ground(h, x, z, y);
  emit(h, {
    tex: WARDEN.wisp,
    n: 1,
    x,
    y: gy + 1.4,
    z,
    size: [3, 3],
    grow: 2.2,
    life: [0.4, 0.4],
    speed: [0, 0],
    additive: true,
  });
  emit(h, {
    tex: WARDEN.natureBurst,
    n: 1,
    x,
    y: gy + 1.2,
    z,
    size: [3.2, 3.2],
    grow: 1.5,
    life: [0.3, 0.3],
    speed: [0, 0],
  });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    emit(h, {
      tex: FX.dust,
      n: 1,
      x: x + Math.cos(a) * r * 0.95,
      y: gy + 0.4,
      z: z + Math.sin(a) * r * 0.95,
      size: [0.8, 1.1],
      grow: 1.8,
      life: [0.7, 1],
      speed: [0.8, 1.6],
      dir: { x: Math.cos(a), y: 0.2, z: Math.sin(a) },
      cone: 0.3,
      drag: 2,
      opacity: 0.85,
    });
  }
  tumblers(h, LEAVES, 18, x, gy + 0.8, z, { speed: [1.5, r * 0.7], up: [4, 7], size: [0.45, 0.6], life: [2.4, 3.2] });
  decal(h, WARDEN.mossCrack, x, gy + 0.03, z, 2.2, 2.5, { grow: 0.1 });
  chunks(h, 6, x, gy + 0.4, z, { size: [0.18, 0.3], speed: [2, 5], up: [6, 9] });
  const roots = 9;
  const rootGeos: THREE.BufferGeometry[] = [];
  const rootInfo: { total: number; delay: number; landed: boolean; ex: number; ez: number; ey: number }[] = [];
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + Math.random() * 0.3;
    const d0 = 0.6;
    const d1 = r * (0.55 + Math.random() * 0.3);
    const ex = x + Math.cos(a) * d1;
    const ez = z + Math.sin(a) * d1;
    const A = new THREE.Vector3(x + Math.cos(a) * d0, gy - 0.3, z + Math.sin(a) * d0);
    const E = new THREE.Vector3(ex, ground(h, ex, ez, gy) - 0.4, ez);
    const M1 = A.clone()
      .lerp(E, 0.3)
      .add(new THREE.Vector3(0, 1.6 + Math.random() * 0.8, 0));
    const M2 = A.clone()
      .lerp(E, 0.75)
      .add(new THREE.Vector3(0, 1.0 + Math.random() * 0.5, 0));
    const curve = new THREE.CubicBezierCurve3(A, M1, M2, E);
    const geo = new THREE.TubeGeometry(curve, 16, 0.16 + Math.random() * 0.06, 6, false);
    rootInfo.push({ total: geo.index!.count, delay: Math.random() * 0.08, landed: false, ex, ez, ey: E.y });
    rootGeos.push(geo);
  }
  const rootTex = barkTex.clone();
  rootTex.repeat.set(1, 6);
  rootTex.needsUpdate = true;
  const rootMat = isDesert(activeCostume())
    ? cactusMat([6, 1])
    : new THREE.MeshLambertMaterial({ map: rootTex, color: 0xb89870, flatShading: true });
  tubeBundle(h, rootGeos, rootMat, 1.4, (k, shown, sink) => {
    rootInfo.forEach((ri, i) => {
      const t = k * 1.4 - ri.delay;
      const grow = t <= 0 ? 0 : Math.min(1, t / 0.28);
      shown[i] = Math.floor((ri.total * (1 - Math.pow(1 - grow, 2))) / 6) * 6;
      sink[i] = t > 0.9 ? -Math.pow((t - 0.9) / 0.5, 2) * 2.2 : 0;
      if (!ri.landed && grow >= 1) {
        ri.landed = true;
        emit(h, {
          tex: FX.dust,
          n: 2,
          x: ri.ex,
          y: ri.ey + 0.7,
          z: ri.ez,
          size: [0.8, 1.1],
          grow: 1.8,
          life: [0.5, 0.7],
          speed: [0.8, 1.6],
          flatSpread: true,
          drag: 3,
          opacity: 0.9,
        });
        chunks(h, 1, ri.ex, ri.ey + 0.6, ri.ez, { size: [0.12, 0.2], speed: [1, 2], up: [3, 5] });
      }
    });
  });
  if (!rootMat.userData.keep) rootMat.dispose();
  h.after(1.6, () => rootTex.dispose());
  emit(h, {
    tex: WARDEN.wisp,
    n: 10,
    x,
    y: gy + 0.5,
    z,
    size: [0.5, 0.8],
    life: [1.2, 1.8],
    speed: [1, r * 0.5],
    flatSpread: true,
    up: [1, 2.5],
    drag: 1.5,
    additive: true,
    jitter: r,
  });
  h.shake = Math.max(h.shake, 0.3);
}
export const LEAVES = [WARDEN.leaf, WARDEN.leaf, WARDEN.leafAutumn];
export function wardenHit(h: FxHost, x: number, y: number, z: number, dx: number, dz: number, big: boolean): void {
  const n = dirOf(dx, dz);
  const px = x - n.x * 0.35;
  const pz = z - n.z * 0.35;
  const py = y + 0.35;
  const gy = ground(h, x, z, y - 1);
  emit(h, {
    tex: FX.burst2,
    n: 1,
    x: px,
    y: py,
    z: pz,
    size: big ? [1.5, 1.5] : [0.9, 0.9],
    grow: 1.6,
    life: [0.12, 0.12],
    speed: [0, 0],
    additive: true,
    order: 6,
  });
  emit(h, {
    tex: WARDEN.natureBurst,
    n: 1,
    x: px,
    y: py,
    z: pz,
    size: big ? [2.3, 2.3] : [1.35, 1.35],
    grow: 1.35,
    life: [0.2, 0.2],
    speed: [0, 0],
    order: 5,
  });
  shockwave(h, FX.shock, px, py, pz, n, 0.25, big ? 2.1 : 1.2, big ? 0.3 : 0.2, 0xe0ffc8);
  emit(h, {
    tex: FX.twinkle,
    n: big ? 6 : 3,
    x: px,
    y: py,
    z: pz,
    size: [0.35, 0.6],
    life: [0.14, 0.28],
    speed: [5, 9],
    dir: { x: n.x, y: 0.5, z: n.z },
    cone: 0.9,
    gravity: 12,
    additive: true,
  });
  tumblers(h, LEAVES, big ? 10 : 5, px, py, pz, {
    speed: [2, 5],
    up: [2.5, 5.5],
    size: [0.3, 0.45],
    life: [1.6, 2.4],
    dir: { x: n.x, z: n.z },
    spread: 2.4,
    floorY: gy + 0.06,
  });
  emit(h, {
    tex: WARDEN.bark,
    n: big ? 4 : 2,
    x: px,
    y: py,
    z: pz,
    size: [0.3, 0.5],
    life: [0.5, 0.75],
    speed: [3, 6],
    up: [2, 4],
    dir: { x: n.x, y: 0.3, z: n.z },
    cone: 1,
    gravity: 18,
    spin: 12,
    floor: gy + 0.12,
  });
  emit(h, {
    tex: FX.dust,
    n: big ? 5 : 2,
    x,
    y: gy + 0.35,
    z,
    size: [0.7, 1.1],
    grow: 1.9,
    life: [0.45, 0.75],
    speed: [1.2, 2.6],
    flatSpread: true,
    drag: 3.5,
    opacity: 0.85,
    jitter: 0.5,
  });
  if (big) {
    emit(h, {
      tex: WARDEN.splinters,
      n: 1,
      x: px,
      y: py,
      z: pz,
      size: [2.0, 2.0],
      grow: 1.5,
      life: [0.24, 0.24],
      speed: [0, 0],
      order: 4,
    });
    shockwave(h, FX.shock, x, gy + 0.15, z, new THREE.Vector3(0, 1, 0), 0.4, 2.4, 0.35, 0xf0e8c8, 0.8);
    decal(h, WARDEN.mossCrack, x, gy, z, 1.5, 1.6, { grow: 0.06 });
    chunks(h, 3, x, gy + 0.3, z, { size: [0.14, 0.24], speed: [1.5, 3.5], up: [4, 6.5] });
  }
  h.shake = Math.max(h.shake, big ? 0.3 : 0.12);
}
