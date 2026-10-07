// Tadwick (harpooner) kit: sea-water hits, harpoon missiles (the Tripo harpoon prop, a towed rope for Reel In),
// ricochet sparks, harpoons stuck in walls, Wet drips on soaked targets, the Reel In rope yank, the Tongue Lash
// tongue, Riptide's burst and the slip splash. The Riptide ring and his puddles are zone views (hazards/zones.ts,
// RIPTIDE_DECAL / PUDDLE_DECAL below). Costume themes come from the harpooner@<costume> atlases + HQ paintings.
import * as THREE from "three";
import type { World } from "../../sim/world";
import type { Missile } from "../../sim/types";
import { activeCostume, FX, TIDE, tint } from "../fx/atlas";
import { type FxHost, emit, tumblers } from "../fx/parts";
import { decal } from "../fx/decals";
import { shockwave } from "../fx/shockwave";
import { prop } from "../props";
import { dirOf, ground, IRON, keep, model, UP, WOOD } from "./shared";
import { KITS } from "./registry";

export const RIPTIDE_DECAL = TIDE.whirl;
export const PUDDLE_DECAL = TIDE.puddle;
export const TIDE_BUBBLE = TIDE.bubble;
export const TIDE_FOAM = TIDE.foam;
export const TIDE_WAVE = TIDE.wave;
const WATER = 0xb8f4ff;
const ROPE = keep(new THREE.MeshLambertMaterial({ color: 0x8a6a3e }));
const TONGUE = keep(new THREE.MeshLambertMaterial({ color: 0xe87890, emissive: 0x401018 }));
const ropeGeo = model(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, 0.5, 0));
const tongueGeo = model(new THREE.CylinderGeometry(0.06, 0.09, 1, 7).translate(0, 0.5, 0));
const shaftGeo = model(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 5).rotateX(Math.PI / 2));
const headGeo = model(new THREE.ConeGeometry(0.11, 0.3, 4).rotateX(Math.PI / 2).translate(0, 0, 0.62));

/** The harpoon pointing along local +Z, centred on the origin (Tripo prop, or a shaft + iron head). */
function harpoonBody(costume?: string): THREE.Object3D {
  const p = prop("harpoon", undefined, costume ? { hero: "harpooner", costume } : undefined);
  const g = new THREE.Group();
  if (p) {
    p.rotation.x = Math.PI / 2;
    p.position.z = -0.55;
    g.add(p);
  } else g.add(new THREE.Mesh(shaftGeo, WOOD), new THREE.Mesh(headGeo, IRON));
  return g;
}

/** Stretch a unit +Y cylinder mesh from a to b. */
function span(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const d = b.clone().sub(a);
  const len = Math.max(0.001, d.length());
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / len));
  m.scale.set(1, len, 1);
}

/** Missile view for harpoon styles (projectiles.ts asks kits first); null for anything else. */
export function harpoonMissile(style: string, costume?: string): THREE.Group | null {
  if (style !== "harpoon" && style !== "harpoonfull" && style !== "reel") return null;
  const obj = new THREE.Group();
  const yaw = new THREE.Group();
  yaw.name = "yaw";
  const body = harpoonBody(costume);
  body.scale.setScalar(style === "harpoonfull" ? 1.15 : 0.95);
  yaw.add(body);
  obj.add(yaw);
  if (style === "harpoonfull") {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: TIDE.glint,
        color: tint(WATER),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    s.scale.setScalar(1.1);
    obj.add(s);
  }
  if (style === "reel") {
    const rope = new THREE.Mesh(ropeGeo, ROPE);
    rope.name = "rope";
    obj.add(rope);
  }
  return obj;
}

/** Per frame: the Reel In rope back to his bow hand, and a light spray trail. */
export function harpoonMissileTick(h: FxHost, world: World, m: Missile, obj: THREE.Object3D): void {
  const rope = obj.getObjectByName("rope") as THREE.Mesh | undefined;
  const o = world.getAny(m.ownerId);
  if (rope && o) {
    const hand = new THREE.Vector3(
      o.transform.pos.x + Math.sin(o.transform.facing) * 0.4 - obj.position.x,
      o.transform.y + 1.1 - obj.position.y,
      o.transform.pos.z + Math.cos(o.transform.facing) * 0.4 - obj.position.z,
    );
    span(rope, new THREE.Vector3(-m.dirX * 0.5, 0, -m.dirZ * 0.5), hand);
  }
  if (Math.random() < 0.5)
    emit(h, {
      tex: TIDE.drop,
      n: 1,
      x: m.x - m.dirX * 0.4,
      y: m.y,
      z: m.z - m.dirZ * 0.4,
      size: [0.14, 0.22],
      life: [0.25, 0.4],
      speed: [0.2, 0.8],
      gravity: 9,
    });
}

function splash(h: FxHost, x: number, y: number, z: number, size: number): void {
  emit(h, { tex: TIDE.splash, n: 1, x, y, z, size: [size, size], grow: 1.4, life: [0.3, 0.3], speed: [0, 0] });
  emit(h, {
    tex: TIDE.drop,
    n: Math.round(4 + size * 3),
    x,
    y: y + 0.2,
    z,
    size: [0.15, 0.26],
    life: [0.35, 0.6],
    speed: [2, 4.5],
    up: [2, 4],
    gravity: 14,
  });
}

/** Drips + a faint blue sheen while the target stays Wet. */
function drip(h: FxHost, id: number, seconds: number): void {
  const w = h.world;
  if (!w) return;
  const anchor = new THREE.Object3D();
  h.add(anchor, Math.min(14, seconds + 8), () => {
    const o = w.getAny(id);
    if (!o?.alive || (o.status.wetUntil ?? 0) <= w.time || o.hero?.dead) return;
    if (Math.random() > 0.35) return;
    const r = o.radius * 0.8;
    emit(h, {
      tex: TIDE.drop,
      n: 1,
      x: o.transform.pos.x + (Math.random() - 0.5) * r * 2,
      y: o.transform.y + 0.8 + Math.random() * 1.1,
      z: o.transform.pos.z + (Math.random() - 0.5) * r * 2,
      size: [0.13, 0.2],
      life: [0.35, 0.5],
      speed: [0, 0.2],
      gravity: 10,
    });
    if (Math.random() < 0.15)
      decal(
        h,
        TIDE.ripple,
        o.transform.pos.x,
        w.groundY(o.transform.pos.x, o.transform.pos.z),
        o.transform.pos.z,
        0.6,
        0.6,
        {
          grow: 0.8,
          opacity: 0.7,
        },
      );
  });
}

/** A harpoon left quivering in a wall or tower, then sinking away. */
function stuck(h: FxHost, x: number, y: number, z: number, dx: number, dz: number): void {
  const b = harpoonBody(activeCostume());
  b.scale.setScalar(0.95);
  const g = new THREE.Group();
  g.add(b);
  g.position.set(x - dx * 0.35, y, z - dz * 0.35);
  g.rotation.y = Math.atan2(dx, dz);
  h.add(g, 1.4, (k) => {
    b.rotation.x = Math.sin(k * 60) * 0.12 * (1 - Math.min(1, k * 3));
    g.scale.setScalar(k > 0.75 ? Math.max(0.01, 1 - (k - 0.75) * 4) : 1);
  });
  emit(h, {
    tex: TIDE.spark,
    n: 1,
    x,
    y,
    z,
    size: [0.8, 0.8],
    grow: 1.3,
    life: [0.12, 0.12],
    speed: [0, 0],
    additive: true,
  });
  emit(h, { tex: FX.pebbles, n: 3, x, y, z, size: [0.2, 0.3], life: [0.4, 0.6], speed: [2, 4], gravity: 14, spin: 8 });
}

/** The tongue shooting from his mouth to the anchor and pulling him along. */
function tongue(h: FxHost, src: { id: number }, x: number, y: number, z: number, tx: number, tz: number): void {
  const w = h.world;
  const ty = ground(h, tx, tz, y) + 1.0;
  const m = new THREE.Mesh(tongueGeo, TONGUE);
  const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: TIDE.tongue, color: 0xffb0c0, transparent: true }));
  tip.scale.setScalar(0.45);
  const g = new THREE.Group();
  g.add(m, tip);
  const end = new THREE.Vector3(tx, ty, tz);
  h.add(g, 0.5, (k) => {
    const e = w?.getAny(src.id);
    const a = e
      ? new THREE.Vector3(
          e.transform.pos.x + Math.sin(e.transform.facing) * 0.35,
          e.transform.y + 1.35,
          e.transform.pos.z + Math.cos(e.transform.facing) * 0.35,
        )
      : new THREE.Vector3(x, y + 1.35, z);
    const out = k < 0.25 ? k / 0.25 : 1;
    const b = a.clone().lerp(end, out);
    if (k > 0.85) b.lerp(a, (k - 0.85) / 0.15);
    span(m, a, b);
    tip.position.copy(b);
  });
  h.after(0.12, () => splash(h, tx, ty, tz, 0.8));
}

function rope(h: FxHost, id: number, tx: number, tz: number, y: number, dur: number): void {
  const w = h.world;
  const m = new THREE.Mesh(ropeGeo, ROPE);
  const end = new THREE.Vector3(tx, ground(h, tx, tz, y) + 1.1, tz);
  h.add(m, dur, () => {
    const o = w?.getAny(id);
    if (!o) return;
    span(m, new THREE.Vector3(o.transform.pos.x, o.transform.y + 1.1, o.transform.pos.z), end);
    if (Math.random() < 0.6)
      emit(h, {
        tex: TIDE.spray,
        n: 1,
        x: o.transform.pos.x,
        y: o.transform.y + 0.3,
        z: o.transform.pos.z,
        size: [0.6, 0.9],
        life: [0.25, 0.35],
        speed: [0.5, 1.5],
        opacity: 0.8,
      });
  });
}

function riptideBurst(h: FxHost, x: number, gy: number, z: number, r: number): void {
  decal(h, TIDE.impact, x, gy, z, r * 0.7, 0.6, { grow: 0.5, opacity: 0.9 });
  shockwave(h, TIDE.ripple, x, gy + 0.3, z, UP, 0.5, r * 1.1, 0.5, WATER, 0.9);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    emit(h, {
      tex: TIDE.wave,
      n: 1,
      x: x + Math.cos(a) * r * 0.85,
      y: gy + 0.6,
      z: z + Math.sin(a) * r * 0.85,
      size: [1.3, 1.6],
      grow: 1.3,
      life: [0.5, 0.7],
      speed: [0.5, 1],
      dir: { x: -Math.sin(a), y: 0.2, z: Math.cos(a) },
      cone: 0.3,
    });
  }
  emit(h, {
    tex: TIDE.spray,
    n: 8,
    x,
    y: gy + 0.4,
    z,
    size: [1, 1.6],
    life: [0.4, 0.7],
    speed: [4, 7],
    flatSpread: true,
    up: [2, 4],
    gravity: 8,
  });
  tumblers(h, [TIDE.shell, TIDE.kelp], 4, x, gy + 0.6, z, {
    speed: [2, 4],
    up: [3, 5],
    size: [0.3, 0.45],
    life: [0.9, 1.3],
  });
  h.shake = Math.max(h.shake, 0.4);
}

KITS.harpooner = {
  trail: 0x8ef0ff,
  hit(h, ev, src, dx, dz) {
    const n = dirOf(dx, dz);
    const px = ev.x - n.x * 0.3;
    const pz = ev.z - n.z * 0.3;
    const py = ev.y + 0.3;
    emit(h, {
      tex: TIDE.impact,
      n: 1,
      x: px,
      y: py,
      z: pz,
      size: ev.big ? [1.6, 1.6] : [1, 1],
      grow: 1.5,
      life: [0.16, 0.16],
      speed: [0, 0],
      order: 6,
    });
    emit(h, {
      tex: TIDE.drop,
      n: ev.big ? 7 : 4,
      x: px,
      y: py,
      z: pz,
      size: [0.16, 0.28],
      life: [0.3, 0.5],
      speed: [3, 6],
      dir: { x: n.x, y: 0.5, z: n.z },
      cone: 0.9,
      gravity: 14,
    });
    if (ev.big) {
      shockwave(h, TIDE.ripple, px, py, pz, n, 0.25, 1.5, 0.25, WATER, 0.85);
      h.shake = Math.max(h.shake, 0.18);
    }
    if (ev.crit) splash(h, px, py, pz, 1.6);
    void src;
    return true;
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "wet":
        if (ev.id !== undefined) drip(h, ev.id, ev.seconds ?? 3);
        splash(h, ev.x, ev.y + 1.2, ev.z, 0.9);
        return true;
      case "ricochet":
        emit(h, {
          tex: TIDE.spark,
          n: 1,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          size: [1.2, 1.2],
          grow: 1.4,
          life: [0.14, 0.14],
          speed: [0, 0],
          additive: true,
        });
        emit(h, {
          tex: TIDE.glint,
          n: 4,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          size: [0.25, 0.4],
          life: [0.2, 0.35],
          speed: [3, 6],
          additive: true,
        });
        splash(h, ev.x, ev.y - 0.3, ev.z, 0.7);
        return true;
      case "harpoonStick":
        stuck(h, ev.x, ev.y, ev.z, ev.tx ?? 0, ev.tz ?? 1);
        return true;
      case "harpoonDrop":
        splash(h, ev.x, gy + 0.2, ev.z, 0.6);
        return true;
      case "reel":
        if (ev.id !== undefined) rope(h, ev.id, ev.tx ?? ev.x, ev.tz ?? ev.z, ev.y, ev.seconds ?? 0.45);
        splash(h, ev.x, ev.y + 1, ev.z, 1.1);
        return true;
      case "tongue":
        tongue(h, { id: ev.src }, ev.x, ev.y, ev.z, ev.tx ?? ev.x, ev.tz ?? ev.z);
        return true;
      case "riptide":
        riptideBurst(h, ev.x, gy, ev.z, ev.radius ?? 6);
        return true;
      case "puddle":
        splash(h, ev.x, gy + 0.1, ev.z, 0.9);
        return true;
      case "slip":
        splash(h, ev.x, gy + 0.2, ev.z, 1.3);
        tumblers(h, [TIDE.shell], 1, ev.x, gy + 0.5, ev.z, {
          speed: [1, 2],
          up: [2, 3],
          size: [0.3, 0.4],
          life: [0.8, 1],
        });
        emit(h, {
          tex: FX.twinkle,
          n: 5,
          x: ev.x,
          y: ev.y + 1.9,
          z: ev.z,
          color: 0xfff0a0,
          size: [0.2, 0.3],
          life: [0.5, 0.8],
          speed: [1, 2],
          additive: true,
        });
        return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "fire" && (ev.kind === "harpoon" || ev.kind === "reel")) {
      const bx = ev.x + ev.dirX * 0.7;
      const bz = ev.z + ev.dirZ * 0.7;
      emit(h, {
        tex: TIDE.spray,
        n: 2,
        x: bx,
        y: gy + 1.2,
        z: bz,
        size: [0.5, 0.8],
        life: [0.2, 0.3],
        speed: [2, 3],
        dir: { x: ev.dirX, y: 0.2, z: ev.dirZ },
        cone: 0.5,
        opacity: 0.85,
      });
    }
    if (ev.phase === "start" && ev.kind === "riptide") {
      for (let k = 0; k < 8; k++)
        h.after(k * 0.05, () =>
          emit(h, {
            tex: TIDE.bubble,
            n: 2,
            x: ev.x + (Math.random() - 0.5) * 2,
            y: gy + 0.2,
            z: ev.z + (Math.random() - 0.5) * 2,
            size: [0.25, 0.4],
            life: [0.5, 0.7],
            speed: [0, 0.4],
            up: [1.5, 2.5],
          }),
        );
      decal(h, TIDE.ripple, ev.x, gy, ev.z, 1.6, 0.6, { grow: 0.6 });
    }
  },
};
