// Tower visuals that aren't the tower model itself: pulse effects of the support/control towers (frost, storm,
// well, pierce, fireburst), modelled tower projectiles (spears, bolts, clay pots) and idle ambience per tower spec.
import * as THREE from "three";
import { FX, RAIDER, SUMMONER, WARLORD } from "../fx/atlas";
import { chunks } from "../fx/chunks";
import { decal } from "../fx/decals";
import { emit, type FxHost } from "../fx/parts";
import { shockwave } from "../fx/shockwave";
import { FxBatch, fxBatch } from "../fx/instances";
import { ground, UP } from "../kits/shared";

const iceGeo = new THREE.ConeGeometry(0.28, 1.4, 5);
iceGeo.userData.model = true;
const iceMat = new THREE.MeshLambertMaterial({ color: 0xbfe6ff, emissive: 0x2a5a8a, flatShading: true });
iceMat.userData.keep = true;

// ── Pulse styles ──

function iceShards(h: FxHost, x: number, z: number, r: number): void {
  const n = Math.round(8 + r * 1.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = r * (0.35 + Math.random() * 0.6);
    const sx = x + Math.cos(a) * d;
    const sz = z + Math.sin(a) * d;
    const gy = ground(h, sx, sz, 0);
    const m = fxBatch(h.root, "ice", () => new FxBatch(iceGeo, iceMat.clone())).spawn();
    const s = 0.6 + Math.random() * 0.7;
    const tilt = 0.25 + Math.random() * 0.35;
    m.rotation.set(Math.sin(a) * tilt, Math.random() * 3, -Math.cos(a) * tilt);
    const delay = (d / r) * 0.12;
    const life = 1.1;
    h.add(m, life, (k) => {
      const t = k * life - delay;
      const e = t <= 0 ? 0 : t < 0.07 ? t / 0.07 : 1;
      const sink = k > 0.7 ? (k - 0.7) / 0.3 : 0;
      m.position.set(sx, gy - 0.7 * s + 1.2 * s * e - sink * 1.1 * s, sz);
      if (t > 0) m.scale.set(s, s * (1.1 + Math.random() * 0.01), s);
      else m.scale.set(0, 0, 0);
    });
  }
}

function frost(h: FxHost, x: number, y: number, z: number, r: number): void {
  const gy = ground(h, x, z, y);
  shockwave(h, FX.shock, x, gy + 0.2, z, UP, 0.6, r, 0.5, 0xcfefff, 0.9);
  iceShards(h, x, z, r);
  emit(h, {
    tex: FX.smoke,
    n: 10,
    x,
    y: gy + 0.4,
    z,
    color: 0xe8f6ff,
    size: [1, 1.6],
    grow: 1.6,
    life: [0.6, 1],
    speed: [r * 0.8, r * 1.3],
    flatSpread: true,
    drag: 3,
    opacity: 0.7,
  });
  emit(h, {
    tex: FX.twinkle,
    n: 12,
    x,
    y: gy + 1,
    z,
    color: 0xd8f4ff,
    size: [0.2, 0.35],
    life: [0.5, 0.9],
    speed: [1, 3],
    up: [1, 3],
    gravity: 2,
    additive: true,
    jitter: r * 0.8,
  });
}

function storm(h: FxHost, x: number, y: number, z: number, r: number, bolt: (pts: number[]) => void): void {
  const gy = ground(h, x, z, y);
  bolt([x, gy + 5.0, z, x, gy + 11, z]);
  for (let i = 0; i < 4; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = r * (0.35 + Math.random() * 0.6);
    const bx = x + Math.cos(a) * d;
    const bz = z + Math.sin(a) * d;
    const by = ground(h, bx, bz, gy);
    h.after(i * 0.05, () => {
      bolt([
        x,
        gy + 5.0,
        z,
        (x + bx) / 2 + (Math.random() - 0.5) * 1.5,
        gy + 3.2,
        (z + bz) / 2 + (Math.random() - 0.5) * 1.5,
        bx,
        by + 0.2,
        bz,
      ]);
      emit(h, {
        tex: FX.zap,
        n: 1,
        x: bx,
        y: by + 0.4,
        z: bz,
        size: [1.2, 1.6],
        grow: 1.3,
        life: [0.15, 0.2],
        speed: [0, 0],
        additive: true,
      });
      chunks(h, 2, bx, by + 0.3, bz, { size: [0.08, 0.16], speed: [1, 3], up: [3, 5] });
    });
  }
  shockwave(h, FX.shock, x, gy + 0.3, z, UP, 0.5, r * 1.05, 0.4, 0xfff4a0, 1);
  shockwave(h, FX.shock, x, gy + 0.15, z, UP, 0.3, r * 0.75, 0.3, 0xffffff, 0.8);
  emit(h, {
    tex: WARLORD.dust,
    n: 14,
    x,
    y: gy + 0.4,
    z,
    size: [1, 1.5],
    grow: 1.8,
    life: [0.5, 0.8],
    speed: [r * 1.2, r * 1.8],
    flatSpread: true,
    drag: 3,
    opacity: 0.8,
  });
  emit(h, {
    tex: FX.burst2,
    n: 1,
    x,
    y: gy + 5.0,
    z,
    size: [2.4, 2.4],
    grow: 1.4,
    life: [0.15, 0.15],
    speed: [0, 0],
    additive: true,
    color: 0xfff6c0,
  });
  h.shake = Math.max(h.shake, 0.18);
}

function well(h: FxHost, x: number, y: number, z: number, r: number): void {
  const gy = ground(h, x, z, y);
  decal(h, RAIDER.vortex, x, gy + 0.05, z, r, 0.9, {
    grow: 0.15,
    spin: -5,
    additive: true,
    color: 0x9a60ff,
    opacity: 0.75,
  });
  shockwave(h, FX.shock, x, gy + 0.25, z, UP, r, 0.4, 0.6, 0xb080ff, 0.9);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    emit(h, {
      tex: SUMMONER.smoke,
      n: 1,
      x: px,
      y: gy + 0.5,
      z: pz,
      color: 0x6a3aa0,
      size: [0.8, 1.1],
      grow: 0.4,
      life: [0.55, 0.6],
      speed: [r * 1.6, r * 1.8],
      dir: { x: -Math.cos(a + 0.5), y: 0, z: -Math.sin(a + 0.5) },
      cone: 0.05,
      drag: 1,
      opacity: 0.8,
    });
    emit(h, {
      tex: SUMMONER.sparkle,
      n: 1,
      x: px,
      y: gy + 0.8,
      z: pz,
      size: [0.25, 0.35],
      life: [0.5, 0.55],
      speed: [r * 1.7, r * 1.9],
      dir: { x: -Math.cos(a), y: 0, z: -Math.sin(a) },
      cone: 0.05,
      additive: true,
    });
  }
  emit(h, {
    tex: SUMMONER.orb,
    n: 1,
    x,
    y: gy + 3.15,
    z,
    color: 0xb070ff,
    size: [1.2, 1.2],
    grow: 0.4,
    life: [0.5, 0.5],
    speed: [0, 0],
    additive: true,
  });
}

function pierce(h: FxHost, x: number, y: number, z: number): void {
  const gy = ground(h, x, z, y);
  emit(h, {
    tex: WARLORD.dust,
    n: 5,
    x,
    y: gy + 0.4,
    z,
    size: [0.7, 1.1],
    grow: 1.6,
    life: [0.4, 0.7],
    speed: [1, 2.5],
    flatSpread: true,
    drag: 3,
    opacity: 0.8,
  });
  chunks(h, 4, x, gy + 0.3, z, { size: [0.06, 0.14], speed: [1.5, 3], up: [2, 4], color: 0x7a5a38 });
}

function fireburst(h: FxHost, x: number, y: number, z: number, r: number): void {
  const gy = ground(h, x, z, y);
  emit(h, {
    tex: FX.fire,
    n: 10,
    x,
    y: gy + 0.5,
    z,
    size: [0.8, 1.3],
    grow: 1.5,
    life: [0.4, 0.7],
    speed: [1, r * 1.4],
    up: [1.5, 3],
    drag: 2,
    additive: true,
    jitter: 0.4,
  });
  emit(h, {
    tex: FX.burst,
    n: 1,
    x,
    y: gy + 0.8,
    z,
    size: [2.4, 2.4],
    grow: 1.4,
    life: [0.18, 0.18],
    speed: [0, 0],
    additive: true,
    color: 0xffb040,
  });
  emit(h, {
    tex: WARLORD.ember,
    n: 14,
    x,
    y: gy + 0.4,
    z,
    size: [0.2, 0.4],
    life: [0.6, 1.1],
    speed: [1.5, 4],
    up: [3, 6],
    gravity: 7,
    additive: true,
  });
  emit(h, {
    tex: FX.smoke,
    n: 5,
    x,
    y: gy + 1,
    z,
    color: 0x3a3028,
    size: [1, 1.5],
    grow: 1.8,
    life: [0.8, 1.2],
    speed: [0.3, 0.8],
    up: [1, 2],
    opacity: 0.6,
  });
  chunks(h, 6, x, gy + 0.5, z, { size: [0.08, 0.16], speed: [2, 4], up: [3, 6], color: 0x9a5a30 });
}

// ── Pulses ──

/** Effect for a tower "pulse" event by style; false when the style has no tower effect (generic pulse instead). */
export function towerPulse(
  h: FxHost,
  ev: { x: number; y: number; z: number; radius: number; style?: string },
  bolt: (pts: number[]) => void,
): boolean {
  if (ev.style === "frost") frost(h, ev.x, ev.y, ev.z, ev.radius);
  else if (ev.style === "storm") storm(h, ev.x, ev.y, ev.z, ev.radius, bolt);
  else if (ev.style === "well") well(h, ev.x, ev.y, ev.z, ev.radius);
  else if (ev.style === "pierce") pierce(h, ev.x, ev.y, ev.z);
  else if (ev.style === "fireburst") fireburst(h, ev.x, ev.y, ev.z, ev.radius);
  else return false;
  return true;
}

// ── Projectiles ──

const shaftGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5);
shaftGeo.rotateX(Math.PI / 2);
const tipGeo = new THREE.ConeGeometry(0.13, 0.42, 4);
tipGeo.rotateX(Math.PI / 2);
tipGeo.translate(0, 0, 0.98);
const finGeo = new THREE.BoxGeometry(0.3, 0.02, 0.32);
finGeo.translate(0, 0, -0.66);
const fin2 = finGeo.clone();
fin2.rotateZ(Math.PI / 2);
const potGeo = new THREE.SphereGeometry(0.28, 7, 5);
potGeo.scale(1, 0.9, 1);
const neckGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.16, 6);
neckGeo.translate(0, 0.27, 0);
for (const g of [shaftGeo, tipGeo, finGeo, fin2, potGeo, neckGeo]) g.userData.model = true;
const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a5a30, flatShading: true });
const ironMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8, flatShading: true });
const featherMat = new THREE.MeshLambertMaterial({ color: 0xf0e8d8, flatShading: true, side: THREE.DoubleSide });
const clayMat = new THREE.MeshLambertMaterial({ color: 0x9a4a24, emissive: 0x3a1004, flatShading: true });
for (const m of [woodMat, ironMat, featherMat, clayMat]) m.userData.keep = true;

/**
 * Modelled projectile for tower shots (spear/arrow/firepot), tagged with userData.towerProj so the projectile sync
 * drives it with towerProjectileTick and never disposes the shared geometry/materials.
 */
/** Calliope Stig's ballista lobs these instead of bolts. */
const ballGeo = new THREE.IcosahedronGeometry(0.26, 2);
const ballMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22, emissive: 0x050508 });
const ballGlint = new THREE.MeshBasicMaterial({ color: 0x8890a0 });
const glintGeo = new THREE.SphereGeometry(0.06, 6, 4);

export function towerProjectile(style: string): THREE.Object3D | null {
  if (style === "cannonball") {
    const g = new THREE.Group();
    const glint = new THREE.Mesh(glintGeo, ballGlint);
    glint.position.set(-0.1, 0.14, 0.12);
    g.add(new THREE.Mesh(ballGeo, ballMat), glint);
    g.userData.towerProj = style;
    return g;
  }
  if (style === "spear" || style === "arrow" || style === "ballista") {
    const g = new THREE.Group();
    g.add(
      new THREE.Mesh(shaftGeo, woodMat),
      new THREE.Mesh(tipGeo, ironMat),
      new THREE.Mesh(finGeo, featherMat),
      new THREE.Mesh(fin2, featherMat),
    );
    // Stig's ballista fires a heavy bolt, between a tower spear and a soldier's arrow.
    g.scale.setScalar(style === "spear" ? 1.25 : style === "ballista" ? 0.95 : 0.55);
    g.userData.towerProj = style;
    return g;
  }
  if (style === "firepot") {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(potGeo, clayMat), new THREE.Mesh(neckGeo, clayMat));
    g.userData.towerProj = style;
    return g;
  }
  return null;
}

export function towerProjectileTick(h: FxHost, o: THREE.Object3D, x: number, y: number, z: number, dt: number): void {
  const prev = o.userData.prev as THREE.Vector3 | undefined;
  o.position.set(x, y, z);
  if (o.userData.towerProj === "firepot") {
    o.rotation.x += dt * 9;
    o.rotation.z += dt * 5;
    if (Math.random() < 0.7)
      emit(h, {
        tex: FX.fire,
        n: 1,
        x,
        y: y + 0.25,
        z,
        size: [0.4, 0.6],
        grow: 1.4,
        life: [0.2, 0.3],
        speed: [0, 0.3],
        up: [0.5, 1],
        additive: true,
      });
  } else if (o.userData.towerProj === "cannonball") {
    // A little powder smoke trailing the ball.
    if (Math.random() < 0.5)
      emit(h, {
        tex: FX.dust,
        n: 1,
        x,
        y,
        z,
        size: [0.25, 0.4],
        grow: 1.8,
        life: [0.3, 0.5],
        speed: [0, 0.2],
        color: 0x6a6a70,
        opacity: 0.5,
      });
  } else if (prev) {
    const d = new THREE.Vector3(x - prev.x, y - prev.y, z - prev.z);
    if (d.lengthSq() > 1e-6) o.lookAt(x + d.x, y + d.y, z + d.z);
  }
  o.userData.prev = new THREE.Vector3(x, y, z);
}

// ── Idle ambience ──

/** Called every frame per finished tower; `roll < dt * rate` spawns effects at a frame-rate independent rate. */
export function towerIdle(h: FxHost, spec: string, x: number, y: number, z: number, facing: number, dt: number): void {
  const roll = Math.random();
  if (spec === "firepot") {
    if (roll < dt * 14)
      emit(h, {
        tex: FX.fire,
        n: 1,
        x,
        y: y + 4.25,
        z,
        size: [0.45, 0.7],
        grow: 1.3,
        life: [0.3, 0.5],
        speed: [0, 0.3],
        up: [0.8, 1.4],
        additive: true,
        jitter: 0.25,
      });
    if (roll < dt * 3)
      emit(h, {
        tex: FX.smoke,
        n: 1,
        x,
        y: y + 4.7,
        z,
        color: 0x3a3430,
        size: [0.6, 0.9],
        grow: 1.8,
        life: [1, 1.4],
        speed: [0, 0.2],
        up: [0.8, 1.2],
        opacity: 0.45,
      });
    if (roll < dt * 4)
      emit(h, {
        tex: WARLORD.ember,
        n: 1,
        x,
        y: y + 4.3,
        z,
        size: [0.12, 0.2],
        life: [0.6, 1],
        speed: [0.2, 0.6],
        up: [1.5, 2.5],
        additive: true,
      });
  } else if (spec === "frost") {
    if (roll < dt * 6)
      emit(h, {
        tex: FX.twinkle,
        n: 1,
        x,
        y: y + 3.5,
        z,
        color: 0xd8f4ff,
        size: [0.15, 0.28],
        life: [0.8, 1.3],
        speed: [0.1, 0.4],
        up: [-0.6, -0.2],
        additive: true,
        jitter: 1.4,
      });
  } else if (spec === "storm") {
    if (roll < dt * 2.5)
      emit(h, {
        tex: FX.zap,
        n: 1,
        x,
        y: y + 4.6 + Math.random() * 0.4,
        z,
        color: 0xfff0a0,
        size: [0.4, 0.6],
        life: [0.08, 0.12],
        speed: [0, 0],
        additive: true,
      });
  } else if (spec === "well") {
    if (roll < dt * 8) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.8;
      emit(h, {
        tex: SUMMONER.sparkle,
        n: 1,
        x: x + Math.cos(a) * r,
        y: y + 2.4 + Math.random() * 1.6,
        z: z + Math.sin(a) * r,
        color: 0xc090ff,
        size: [0.18, 0.3],
        life: [0.7, 0.8],
        speed: [r * 1.2, r * 1.3],
        dir: { x: -Math.cos(a), y: 0.3, z: -Math.sin(a) },
        cone: 0.05,
        drag: 0.5,
        additive: true,
      });
    }
  }
  void facing;
}
