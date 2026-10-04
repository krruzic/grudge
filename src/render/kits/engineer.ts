import { ENGINEER } from "../fx/atlas";
import { emit, decal, shockwave } from "../fx/parts";
import { KITS } from "./registry";
import { near, core, ground, UP } from "./shared";

KITS.engineer = {
  trail: 0xfff0b0,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.4)) return false;
    const c = core(h, ev, dx, dz, ENGINEER.clang, ENGINEER.ring, 0xa0f0ff, ENGINEER.weld);
    emit(h, {
      tex: ev.big ? ENGINEER.gear : ENGINEER.gearSmall,
      n: ev.big ? 3 : 1,
      x: c.px,
      y: c.py,
      z: c.pz,
      size: [0.35, 0.55],
      life: [0.6, 0.9],
      speed: [2, 4],
      up: [2, 4],
      gravity: 14,
      spin: 10,
      floor: c.gy + 0.1,
    });
    emit(h, {
      tex: ENGINEER.nut,
      n: ev.big ? 2 : 1,
      x: c.px,
      y: c.py,
      z: c.pz,
      size: [0.25, 0.35],
      life: [0.5, 0.8],
      speed: [2, 4],
      up: [2, 4],
      gravity: 16,
      spin: 12,
      floor: c.gy + 0.08,
    });
    if (ev.big)
      emit(h, {
        tex: ENGINEER.steam,
        n: 2,
        x: c.px,
        y: c.py,
        z: c.pz,
        size: [0.9, 1.2],
        grow: 1.7,
        life: [0.5, 0.8],
        speed: [0.5, 1.2],
        up: [0.8, 1.5],
        opacity: 0.8,
      });
    return true;
  },
  event(h, ev) {
    if (ev.type === "repair") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      decal(h, ENGINEER.gear, ev.x, gy, ev.z, 2.2, 1.2, { grow: 0.2, spin: 2.5, opacity: 0.95 });
      shockwave(h, ENGINEER.ring, ev.x, gy + 0.2, ev.z, UP, 0.5, ev.radius, 0.45, 0xa0e0ff, 0.8);
      for (const f of ev.fixed) {
        emit(h, {
          tex: ENGINEER.weld,
          n: 3,
          x: f.x,
          y: f.y + f.h * 0.6,
          z: f.z,
          size: [0.8, 1.2],
          life: [0.2, 0.3],
          speed: [0, 0],
          additive: true,
          jitter: 1.4,
        });
        emit(h, {
          tex: ENGINEER.steam,
          n: 3,
          x: f.x,
          y: f.y + f.h * 0.5,
          z: f.z,
          size: [1, 1.4],
          grow: 1.6,
          life: [0.7, 1],
          speed: [0.3, 0.8],
          up: [1, 1.8],
          opacity: 0.8,
          jitter: 1.2,
        });
        emit(h, {
          tex: ENGINEER.heal,
          n: 1,
          x: f.x,
          y: f.y + f.h + 0.5,
          z: f.z,
          size: [0.9, 0.9],
          grow: 1.2,
          life: [0.8, 0.8],
          speed: [0, 0],
          up: [1, 1],
          fadeIn: 0.1,
        });
      }
      return false;
    }
    if (ev.type === "slam") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, {
        tex: ENGINEER.clang,
        n: 1,
        x: ev.x,
        y: gy + 0.6,
        z: ev.z,
        size: [2, 2],
        grow: 1.3,
        life: [0.18, 0.18],
        speed: [0, 0],
      });
      shockwave(h, ENGINEER.ring, ev.x, gy + 0.2, ev.z, UP, 0.4, ev.radius * 1.1, 0.35, 0xffffff);
      emit(h, {
        tex: ENGINEER.gear,
        n: 4,
        x: ev.x,
        y: gy + 0.5,
        z: ev.z,
        size: [0.35, 0.55],
        life: [0.7, 1],
        speed: [2, 4],
        up: [3, 5],
        gravity: 14,
        spin: 10,
        floor: gy + 0.1,
      });
      emit(h, {
        tex: ENGINEER.oilSmoke,
        n: 5,
        x: ev.x,
        y: gy + 0.5,
        z: ev.z,
        size: [1, 1.4],
        grow: 1.7,
        life: [0.6, 0.9],
        speed: [1, 2.5],
        flatSpread: true,
        drag: 2,
        opacity: 0.8,
      });
      h.shake = Math.max(h.shake, 0.3);
      return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "fire" && (ev.kind === "works" || ev.kind === "ballista")) {
      emit(h, {
        tex: ENGINEER.steam,
        n: 8,
        x: ev.x + ev.dirX * 2,
        y: gy + 0.6,
        z: ev.z + ev.dirZ * 2,
        size: [1, 1.5],
        grow: 1.8,
        life: [0.7, 1.1],
        speed: [1, 2.5],
        flatSpread: true,
        up: [0.5, 1.2],
        drag: 2,
        opacity: 0.85,
        jitter: 2,
      });
      emit(h, {
        tex: ENGINEER.weld,
        n: 6,
        x: ev.x + ev.dirX * 2,
        y: gy + 0.8,
        z: ev.z + ev.dirZ * 2,
        size: [0.7, 1],
        life: [0.15, 0.3],
        speed: [0, 0],
        additive: true,
        jitter: 2.5,
      });
      emit(h, {
        tex: ENGINEER.plank,
        n: 3,
        x: ev.x + ev.dirX * 2,
        y: gy + 0.6,
        z: ev.z + ev.dirZ * 2,
        size: [0.5, 0.7],
        life: [0.6, 0.9],
        speed: [1.5, 3],
        up: [3, 5],
        gravity: 14,
        spin: 8,
        floor: gy + 0.1,
      });
      emit(h, {
        tex: ENGINEER.spring,
        n: 1,
        x: ev.x,
        y: gy + 2.6,
        z: ev.z,
        size: [0.7, 0.7],
        grow: 1.2,
        life: [0.6, 0.6],
        speed: [0, 0],
        up: [1, 1],
        fadeIn: 0.1,
      });
      h.shake = Math.max(h.shake, 0.2);
    }
  },
};
