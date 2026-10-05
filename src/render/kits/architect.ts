// Professor Hoot (architect) kit: frost hits for his square, the thrown square's sparkle, Snow Fort raising and
// melting (per wall cell, called by HazardViews for "ice" walls), the Lookout rising / toppling, the Avalanche Dome
// cast and the ice sparks where a shot dies on its rim, the Owl Hop, and the Icicle Belfry's icicles. The fort
// cells, lookout tower and dome themselves are terrain mods / zones (hazards/terrainMods.ts, hazards/zones.ts); the
// flying square is drawn by entities/relicView.ts.
import * as THREE from "three";
import { ARCHITECT, FX, tint } from "../fx/atlas";
import { type FxHost, emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { chunks } from "../fx/chunks";
import { shockwave } from "../fx/shockwave";
import { ground, near, UP } from "./shared";
import { KITS } from "./registry";

const ICE = 0xd8f4ff;
const FROST = 0xa8e8ff;

function snowPuff(h: FxHost, x: number, gy: number, z: number, r: number, n: number): void {
  emit(h, {
    tex: ARCHITECT.snow,
    n,
    x,
    y: gy + 0.4,
    z,
    size: [r * 0.5, r * 0.8],
    grow: 1.7,
    life: [0.5, 0.9],
    speed: [1, r * 1.2],
    flatSpread: true,
    drag: 3,
    opacity: 0.9,
  });
}

function iceShards(
  h: FxHost,
  x: number,
  y: number,
  z: number,
  n: number,
  speed: [number, number],
  floor: number,
): void {
  emit(h, {
    tex: ARCHITECT.shard,
    n,
    x,
    y,
    z,
    size: [0.2, 0.38],
    life: [0.5, 0.9],
    speed,
    up: [2, 5],
    gravity: 14,
    spin: 8,
    floor,
  });
}

/** Frost impact: crystal starburst, cold shock ring, shards and a little powder snow. */
function frostHit(h: FxHost, x: number, y: number, z: number, n: THREE.Vector3, big: boolean, gy: number): void {
  emit(h, {
    tex: FX.burst2,
    n: 1,
    x,
    y,
    z,
    color: 0xe8fbff,
    size: big ? [1.5, 1.5] : [1, 1],
    grow: 1.6,
    life: [0.1, 0.1],
    speed: [0, 0],
    additive: true,
    order: 6,
  });
  emit(h, {
    tex: ARCHITECT.frostBurst,
    n: 1,
    x,
    y,
    z,
    size: big ? [2.1, 2.1] : [1.3, 1.3],
    grow: 1.3,
    life: [0.2, 0.2],
    speed: [0, 0],
    order: 5,
  });
  if (big) shockwave(h, FX.shock, x, y, z, n, 0.25, 1.8, 0.28, FROST, 0.9);
  iceShards(h, x, y + 0.2, z, big ? 7 : 3, [2.5, 5], gy + 0.05);
  emit(h, {
    tex: ARCHITECT.twinkle,
    n: big ? 4 : 2,
    x,
    y: y + 0.2,
    z,
    size: [0.25, 0.4],
    life: [0.3, 0.5],
    speed: [1.5, 3],
    additive: true,
  });
  snowPuff(h, x, gy, z, 1.4, big ? 2 : 1);
  h.shake = Math.max(h.shake, big ? 0.28 : 0.1);
}

/** A blueprint drafting circle chalked on the ground where he is about to build. */
function blueprint(h: FxHost, x: number, gy: number, z: number, r: number, dur: number): void {
  decal(h, ARCHITECT.drafting, x, gy + 0.03, z, r, dur, { grow: 0.15, spin: 0.4, additive: true, opacity: 0.85 });
  emit(h, {
    tex: ARCHITECT.chalk,
    n: 3,
    x,
    y: gy + 0.3,
    z,
    size: [0.5, 0.8],
    grow: 1.6,
    life: [0.4, 0.7],
    speed: [0.5, 1.2],
    flatSpread: true,
    drag: 3,
    opacity: 0.8,
    jitter: r * 0.6,
  });
}

/** One Snow Fort cell popping up out of the ground (HazardViews, for "ice" walls). */
export function fortBlock(h: FxHost, x: number, y: number, z: number, delay: number): void {
  h.after(delay, () => {
    snowPuff(h, x, y, z, 1.6, 2);
    emit(h, {
      tex: ARCHITECT.brick,
      n: 2,
      x,
      y: y + 0.6,
      z,
      size: [0.25, 0.4],
      life: [0.5, 0.8],
      speed: [1.5, 3],
      up: [3, 5],
      gravity: 14,
      spin: 6,
      floor: y + 0.05,
    });
    emit(h, {
      tex: ARCHITECT.twinkle,
      n: 1,
      x,
      y: y + 1.6,
      z,
      size: [0.4, 0.55],
      life: [0.3, 0.45],
      speed: [0, 0.4],
      additive: true,
      jitter: 0.4,
    });
  });
}

/** A Snow Fort cell slumping as it melts or breaks. */
export function fortCrumble(h: FxHost, x: number, y: number, z: number): void {
  snowPuff(h, x, y + 0.4, z, 1.6, 2);
  chunks(h, 3, x, y + 1.2, z, { size: [0.18, 0.3], speed: [0.8, 2.2], up: [1, 3], color: ICE });
  iceShards(h, x, y + 1, z, 2, [1, 2.5], y + 0.05);
}

function avalanche(h: FxHost, x: number, gy: number, z: number, r: number): void {
  emit(h, {
    tex: ARCHITECT.spray,
    n: 2,
    x,
    y: gy + 1,
    z,
    size: [Math.min(3.2, r * 0.6), Math.min(4, r * 0.75)],
    grow: 1.3,
    life: [0.35, 0.55],
    speed: [1, 2.5],
    up: [0.5, 1.2],
    drag: 2,
    opacity: 0.9,
    jitter: r * 0.3,
    order: 5,
  });
  snowPuff(h, x, gy, z, r, 8);
  chunks(h, 8, x, gy + 1, z, { size: [0.2, 0.4], speed: [2.5, 5], up: [3, 6], color: ICE });
  iceShards(h, x, gy + 1, z, 10, [3, 6], gy + 0.05);
  emit(h, {
    tex: ARCHITECT.flake,
    n: 10,
    x,
    y: gy + 1.5,
    z,
    size: [0.25, 0.45],
    life: [1, 1.6],
    speed: [0.6, 1.6],
    up: [0.5, 1.5],
    gravity: 1.5,
    spin: 2,
    jitter: r * 0.5,
  });
}

KITS.architect = {
  trail: 0xbff0ff,
  hit(h, ev, src, dx, dz) {
    const w = h.world;
    const square = w?.boomerangs.find((b) => b.ownerId === src.id);
    if (!near(ev, src, 3.6) && !(square && Math.hypot(square.x - ev.x, square.z - ev.z) < 2.2)) return false;
    const n = new THREE.Vector3(dx, 0, dz);
    if (n.lengthSq() < 1e-4) n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    n.normalize();
    frostHit(h, ev.x - n.x * 0.35, ev.y + 0.3, ev.z - n.z * 0.35, n, ev.big, ground(h, ev.x, ev.z, ev.y - 1));
    return true;
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "squareRecall":
        emit(h, {
          tex: ARCHITECT.twinkle,
          n: 3,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          size: [0.4, 0.6],
          life: [0.3, 0.45],
          speed: [0.5, 1.5],
          additive: true,
        });
        return true;
      case "fortRise": {
        blueprint(h, ev.x, gy, ev.z, 2.8, 0.9);
        const r = ev.radius ?? 0;
        if (r > 0) {
          // Frost Fort talent: a ring of frost bursting out from the wall.
          shockwave(h, FX.shock, ev.x, gy + 0.3, ev.z, UP, 0.4, r, 0.45, FROST, 0.95);
          decal(h, ARCHITECT.frostRing, ev.x, gy + 0.04, ev.z, r, 1.2, { grow: 0.4, opacity: 0.9 });
          iceShards(h, ev.x, gy + 0.6, ev.z, 10, [3, 6], gy + 0.05);
        }
        h.shake = Math.max(h.shake, 0.15);
        return true;
      }
      case "fortFall":
        if ((ev.radius ?? 0) > 0) avalanche(h, ev.x, gy, ev.z, ev.radius!);
        return true;
      case "lookoutRise": {
        const r = ev.radius ?? 2;
        blueprint(h, ev.x, gy, ev.z, r * 1.3, 1.2);
        snowPuff(h, ev.x, gy, ev.z, r * 1.4, 7);
        emit(h, {
          tex: ARCHITECT.iceBlock,
          n: 4,
          x: ev.x,
          y: gy + 0.5,
          z: ev.z,
          size: [0.35, 0.55],
          life: [0.6, 0.9],
          speed: [1.5, 3],
          up: [4, 7],
          gravity: 14,
          spin: 6,
          floor: gy + 0.05,
          jitter: r * 0.4,
        });
        shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.4, r * 1.8, 0.4, ICE, 0.85);
        h.shake = Math.max(h.shake, 0.25);
        return true;
      }
      case "lookoutFall": {
        const r = ev.radius ?? 0;
        avalanche(h, ev.x, gy, ev.z, Math.max(2.4, r));
        if (r > 0) {
          shockwave(h, FX.shock, ev.x, gy + 0.3, ev.z, UP, 0.5, r, 0.5, FROST, 1);
          decal(h, ARCHITECT.frostRing, ev.x, gy + 0.04, ev.z, r, 1.4, { grow: 0.3, opacity: 0.9 });
          h.shake = Math.max(h.shake, 0.45);
        }
        return true;
      }
      case "dome": {
        const r = ev.radius ?? 5.5;
        avalanche(h, ev.x, gy, ev.z, r * 0.7);
        shockwave(h, FX.shock, ev.x, gy + 0.3, ev.z, UP, 0.5, r, 0.55, FROST, 1);
        decal(h, ARCHITECT.drafting, ev.x, gy + 0.05, ev.z, r, 0.8, {
          grow: 0.1,
          spin: 0.6,
          additive: true,
          opacity: 0.7,
        });
        h.shake = Math.max(h.shake, 0.5);
        return true;
      }
      case "domeBlock":
        emit(h, {
          tex: ARCHITECT.frostBurst,
          n: 1,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          size: [0.9, 0.9],
          grow: 1.4,
          life: [0.16, 0.16],
          speed: [0, 0],
          order: 5,
        });
        iceShards(h, ev.x, ev.y, ev.z, 3, [1.5, 3], gy + 0.05);
        emit(h, {
          tex: ARCHITECT.twinkle,
          n: 2,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          size: [0.3, 0.45],
          life: [0.25, 0.4],
          speed: [0.5, 1.5],
          additive: true,
        });
        return true;
      case "owlHop":
        snowPuff(h, ev.x, gy, ev.z, 1.6, 3);
        emit(h, {
          tex: ARCHITECT.feather,
          n: 5,
          x: ev.x,
          y: gy + 1.3,
          z: ev.z,
          size: [0.25, 0.4],
          life: [0.9, 1.4],
          speed: [0.8, 2],
          up: [0.5, 1.5],
          gravity: 1.2,
          spin: 4,
          drag: 1.5,
          floor: gy + 0.05,
        });
        return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "fort") {
      const tx = ev.toX ?? ev.x + ev.dirX * 2.6;
      const tz = ev.toZ ?? ev.z + ev.dirZ * 2.6;
      blueprint(h, tx, ground(h, tx, tz, gy), tz, 2.6, 0.7);
    } else if (ev.phase === "start" && ev.kind === "lookout") blueprint(h, ev.x, gy, ev.z, 2.4, 0.7);
    else if (ev.phase === "start" && ev.kind === "dome") {
      const tx = ev.toX ?? ev.x;
      const tz = ev.toZ ?? ev.z;
      decal(h, ARCHITECT.drafting, tx, ground(h, tx, tz, gy) + 0.05, tz, 3, 0.7, {
        grow: 0.8,
        spin: 1.2,
        additive: true,
        opacity: 0.8,
      });
      emit(h, {
        tex: ARCHITECT.flake,
        n: 6,
        x: ev.x,
        y: gy + 2.4,
        z: ev.z,
        size: [0.25, 0.4],
        life: [0.5, 0.8],
        speed: [0.6, 1.4],
        up: [0.4, 1],
        spin: 3,
        jitter: 0.6,
      });
    } else if (ev.phase === "fire" && ev.kind === "squarethrow") {
      emit(h, {
        tex: ARCHITECT.swoosh,
        n: 1,
        x: ev.x + ev.dirX * 0.9,
        y: gy + 1.4,
        z: ev.z + ev.dirZ * 0.9,
        size: [1.4, 1.4],
        grow: 1.3,
        life: [0.2, 0.2],
        speed: [0, 0],
        opacity: 0.85,
      });
    }
  },
  projectile(h, style) {
    if (style !== "icicle") return null;
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: ARCHITECT.icicle, color: tint(0xffffff), transparent: true, depthWrite: false }),
    );
    s.scale.set(1.1, 1.1, 1);
    s.userData.iceTrail = 0;
    return s;
  },
  projectileTick(h, obj, x, y, z, dt) {
    obj.userData.iceTrail -= dt;
    if (obj.userData.iceTrail > 0) return;
    obj.userData.iceTrail = 0.05;
    emit(h, {
      tex: ARCHITECT.twinkle,
      n: 1,
      x,
      y,
      z,
      size: [0.18, 0.28],
      life: [0.2, 0.3],
      speed: [0, 0.3],
      additive: true,
    });
  },
};
