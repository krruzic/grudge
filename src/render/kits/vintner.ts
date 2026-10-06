// Gristle (vintner) kit: wine-and-forge-spark anvil hits, the anvil ground slams (Anvil Pound, Crush Season: a
// cracked wine-soaked crater, a dust ring and flying clods; the third slam leaves a big crushed-grape splat),
// Headbutt (dust kick, a pinned champion gets grapes-and-stars circling his head), Switcheroo (golden swap ring under
// the partner, then at both ends of the swap), Dig In (a stamped-hoof crater, red sparks and flare; a red shock when
// the banked blow lands), the Anvil Curl and Grit-full stone shield pops.
import * as THREE from "three";
import { FX, tint, VINTNER } from "../fx/atlas";
import { type FxHost, emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { chunks } from "../fx/chunks";
import { shockwave } from "../fx/shockwave";
import { core, ground, near, UP } from "./shared";
import { KITS } from "./registry";

const WINE = 0xb0305a;

function sprite(tex: THREE.Texture, color: THREE.ColorRepresentation = 0xffffff, additive = false): THREE.Sprite {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      color: tint(color),
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }),
  );
}

/** Red-purple wine flung up and out from (x, y, z). */
function wine(h: FxHost, x: number, y: number, z: number, gy: number, n: number, speed: number): void {
  emit(h, {
    tex: VINTNER.drop,
    n,
    x,
    y,
    z,
    size: [0.16, 0.3],
    life: [0.45, 0.75],
    speed: [speed * 0.5, speed],
    up: [2, 4.5],
    gravity: 14,
    floor: gy + 0.05,
    spin: 3,
  });
  emit(h, {
    tex: VINTNER.grape,
    n: Math.ceil(n / 3),
    x,
    y,
    z,
    size: [0.14, 0.22],
    life: [0.5, 0.8],
    speed: [speed * 0.4, speed * 0.9],
    up: [2.5, 5],
    gravity: 16,
    floor: gy + 0.08,
  });
}

/** An anvil coming down: crater, dust ring, clods, wine and forge sparks. `k` scales everything (1 = full pound). */
function anvilSlam(h: FxHost, x: number, gy: number, z: number, r: number, k: number, final = false): void {
  decal(h, VINTNER.crater, x, gy, z, r * 0.75, 1.6 + k, { grow: 0.08 });
  decal(h, VINTNER.dustRing, x, gy + 0.02, z, r, 0.6, { grow: 0.5, opacity: 0.85 });
  if (final)
    decal(h, VINTNER.splat, x, gy + 0.03, z, r * 0.75, 3, { grow: 0.1, rot: Math.random() * 6, opacity: 0.75 });
  shockwave(h, FX.shock, x, gy + 0.2, z, UP, 0.4, r * 1.1, 0.35 + k * 0.1, 0xfff0e0, 0.9);
  emit(h, {
    tex: VINTNER.splash,
    n: 1,
    x,
    y: gy + 0.6 * k,
    z,
    size: [r * 0.9, r * 0.9],
    grow: 1.4,
    life: [0.35, 0.35],
    speed: [0, 0],
    order: 5,
  });
  emit(h, {
    tex: VINTNER.sparks,
    n: Math.round(4 + 6 * k),
    x,
    y: gy + 0.5,
    z,
    size: [0.5, 0.9],
    life: [0.2, 0.35],
    speed: [3, 7],
    up: [1, 3],
    flatSpread: true,
    additive: true,
    order: 6,
  });
  emit(h, {
    tex: FX.dust,
    n: Math.round(4 + 6 * k),
    x,
    y: gy + 0.35,
    z,
    size: [0.9, 1.4],
    grow: 1.8,
    life: [0.45, 0.8],
    speed: [2, 4 + r],
    flatSpread: true,
    drag: 3,
    opacity: 0.85,
  });
  chunks(h, Math.round(3 + 6 * k), x, gy + 0.3, z, { size: [0.12, 0.26], speed: [2, 4.5], up: [3, 6 + 3 * k] });
  wine(h, x, gy + 0.4, z, gy, Math.round(6 + 10 * k), 3 + 2 * k);
  if (final)
    emit(h, {
      tex: VINTNER.grapes,
      n: 8,
      x,
      y: gy + 0.5,
      z,
      size: [0.35, 0.55],
      life: [0.7, 1],
      speed: [3, 6],
      up: [5, 8],
      gravity: 16,
      floor: gy + 0.1,
      spin: 4,
    });
  h.shake = Math.max(h.shake, 0.18 + 0.3 * k);
}

/** Grapes and stars circling a pinned champion's head for `secs`. */
function dizzy(h: FxHost, id: number, secs: number): void {
  const s = sprite(VINTNER.dizzy);
  s.scale.set(1.3, 1.3, 1);
  h.add(s, secs, (k) => {
    const o = h.world?.get(id);
    if (!o?.alive) {
      s.visible = false;
      return;
    }
    s.position.set(o.transform.pos.x, o.transform.y + 2.5, o.transform.pos.z);
    s.material.rotation = k * secs * 5;
    s.material.opacity = Math.min(1, (1 - k) * 4);
  });
}

KITS.vintner = {
  trail: WINE,
  trailWidth: 1.3,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.8)) return false;
    const c = core(h, ev, dx, dz, VINTNER.splash, FX.shock, 0xffd8e0, VINTNER.sparks);
    wine(h, c.px, c.py, c.pz, c.gy, ev.big ? 8 : 4, 3);
    if (ev.big)
      emit(h, {
        tex: VINTNER.shard,
        n: 3,
        x: c.px,
        y: c.py,
        z: c.pz,
        size: [0.14, 0.24],
        life: [0.4, 0.6],
        speed: [3, 5],
        up: [2, 4],
        gravity: 16,
        floor: c.gy + 0.05,
        spin: 6,
      });
    h.shake = Math.max(h.shake, ev.big ? 0.3 : 0.12);
    return true;
  },
  act(h, ev) {
    if (ev.phase !== "start") return;
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.kind === "headbutt") {
      emit(h, {
        tex: FX.dust,
        n: 5,
        x: ev.x - ev.dirX * 0.6,
        y: gy + 0.3,
        z: ev.z - ev.dirZ * 0.6,
        size: [0.8, 1.2],
        grow: 1.6,
        life: [0.4, 0.6],
        speed: [1.5, 3],
        dir: { x: -ev.dirX, y: 0.2, z: -ev.dirZ },
        cone: 0.7,
        drag: 3,
      });
      h.shake = Math.max(h.shake, 0.08);
    }
  },
  event(h, ev) {
    if (ev.type === "slam") return true;
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "pound":
        anvilSlam(h, ev.x, gy, ev.z, ev.radius ?? 3.2, 1);
        return true;
      case "crush":
        anvilSlam(h, ev.x, gy, ev.z, ev.radius ?? 3, ev.id === 1 ? 0.75 : 0.5);
        return true;
      case "crushFinal":
        anvilSlam(h, ev.x, gy, ev.z, ev.radius ?? 4.4, 1.4, true);
        emit(h, {
          tex: FX.burst,
          n: 1,
          x: ev.x,
          y: gy + 1,
          z: ev.z,
          color: 0xffd0e0,
          size: [3.5, 3.5],
          grow: 1.3,
          life: [0.22, 0.22],
          speed: [0, 0],
          order: 6,
        });
        return true;
      case "headbuttHit":
        emit(h, {
          tex: VINTNER.sparks,
          n: 5,
          x: ev.x,
          y: ev.y + 1.3,
          z: ev.z,
          size: [0.5, 0.8],
          life: [0.15, 0.3],
          speed: [3, 6],
          additive: true,
        });
        emit(h, {
          tex: FX.burst2,
          n: 1,
          x: ev.x,
          y: ev.y + 1.3,
          z: ev.z,
          size: [1.6, 1.6],
          grow: 1.5,
          life: [0.12, 0.12],
          speed: [0, 0],
          additive: true,
          order: 6,
        });
        h.shake = Math.max(h.shake, 0.22);
        return true;
      case "wallSlam": {
        anvilSlam(h, ev.x, gy, ev.z, 1.6, 0.45);
        const w = h.world;
        const o = w?.entities.find(
          (e) => e.hero && Math.hypot(e.transform.pos.x - ev.x, e.transform.pos.z - ev.z) < 0.6,
        );
        if (o) dizzy(h, o.id, Math.max(0.4, o.status.stunUntil - (w?.time ?? 0)));
        h.shake = Math.max(h.shake, 0.45);
        return true;
      }
      case "switchMark":
        decal(h, VINTNER.swap, ev.x, gy + 0.05, ev.z, 1.3, Math.max(0.3, ev.seconds ?? 0.3) + 0.15, {
          grow: 0.15,
          spin: 6,
        });
        return true;
      case "switch":
        for (const [x, z] of [
          [ev.x, ev.z],
          [ev.tx ?? ev.x, ev.tz ?? ev.z],
        ]) {
          const g = ground(h, x, z, ev.y);
          decal(h, VINTNER.swap, x, g + 0.05, z, 1.5, 0.5, { grow: 0.3, spin: -8 });
          emit(h, {
            tex: FX.twinkle,
            n: 8,
            x,
            y: g + 1.1,
            z,
            color: 0xffe080,
            size: [0.3, 0.5],
            life: [0.3, 0.5],
            speed: [1.5, 3],
            additive: true,
          });
          emit(h, {
            tex: FX.dust,
            n: 3,
            x,
            y: g + 0.3,
            z,
            size: [0.8, 1.1],
            grow: 1.6,
            life: [0.35, 0.5],
            speed: [1, 2],
            flatSpread: true,
            drag: 3,
          });
        }
        return true;
      case "switchFizzle":
        emit(h, {
          tex: FX.smoke,
          n: 3,
          x: ev.x,
          y: gy + 1,
          z: ev.z,
          size: [0.6, 0.9],
          grow: 1.4,
          life: [0.4, 0.6],
          speed: [0.5, 1],
          opacity: 0.7,
        });
        return true;
      case "curl":
        emit(h, {
          tex: FX.dust,
          n: 5,
          x: ev.x,
          y: gy + 0.3,
          z: ev.z,
          size: [0.8, 1.2],
          grow: 1.7,
          life: [0.4, 0.6],
          speed: [1.5, 3],
          flatSpread: true,
          drag: 3,
        });
        emit(h, {
          tex: VINTNER.grit,
          n: 1,
          x: ev.x,
          y: gy + 1.6,
          z: ev.z,
          size: [1.1, 1.1],
          grow: 1.2,
          life: [0.45, 0.45],
          speed: [0, 0],
          order: 6,
        });
        return true;
      case "digIn": {
        // DIG IN: one hoof stamped down - a small cracked crater and dust ring under him, clods and red-hot sparks,
        // and a red flare over him (the red hull glow itself is heroSync's syncDig).
        h.after(0.02, () => {
          decal(h, VINTNER.crater, ev.x, gy + 0.03, ev.z, 1.5, 3.2, { opacity: 0.85 });
          decal(h, VINTNER.dustRing, ev.x, gy + 0.05, ev.z, 1.2, 0.5, { grow: 1.8, opacity: 0.9 });
          shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.3, 2.6, 0.32, 0xff5030, 0.85);
          chunks(h, 6, ev.x, gy + 0.3, ev.z, { size: [0.12, 0.24], speed: [2, 4], up: [3, 5] });
          emit(h, {
            tex: VINTNER.sparks,
            n: 10,
            x: ev.x,
            y: gy + 0.3,
            z: ev.z,
            color: 0xff6030,
            size: [0.18, 0.32],
            life: [0.35, 0.6],
            speed: [2.5, 5],
            up: [2, 4],
            gravity: 12,
            floor: gy + 0.05,
            additive: true,
          });
          emit(h, {
            tex: FX.burst,
            n: 1,
            x: ev.x,
            y: ev.y + 1.4,
            z: ev.z,
            color: 0xff4020,
            size: [2.6, 2.6],
            grow: 1.25,
            life: [0.2, 0.2],
            speed: [0, 0],
            additive: true,
            order: 6,
          });
          h.shake = Math.max(h.shake, 0.18);
        });
        return true;
      }
      case "digInHit":
        // The banked Dig In blow lands: a red shock and sparks on the victim.
        shockwave(h, FX.shock, ev.x, ev.y + 1, ev.z, UP, 0.2, 2.2, 0.25, 0xff4020, 0.9);
        emit(h, {
          tex: VINTNER.sparks,
          n: 12,
          x: ev.x,
          y: ev.y + 1.1,
          z: ev.z,
          color: 0xff7040,
          size: [0.2, 0.36],
          life: [0.3, 0.5],
          speed: [3, 6],
          up: [1, 3],
          gravity: 10,
          additive: true,
        });
        h.shake = Math.max(h.shake, 0.22);
        return true;
      case "gritFull":
        emit(h, {
          tex: VINTNER.grit,
          n: 1,
          x: ev.x,
          y: ev.y + 2.9,
          z: ev.z,
          size: [0.8, 0.8],
          grow: 1.25,
          life: [0.55, 0.55],
          speed: [0, 0.4],
          up: [0.6, 0.6],
          order: 6,
        });
        emit(h, {
          tex: FX.twinkle,
          n: 3,
          x: ev.x,
          y: ev.y + 2.9,
          z: ev.z,
          color: 0xffe8a0,
          size: [0.25, 0.4],
          life: [0.3, 0.45],
          speed: [1, 2],
          additive: true,
        });
        return true;
    }
    return false;
  },
};
