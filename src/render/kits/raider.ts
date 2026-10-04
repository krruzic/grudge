// Grim (raider) kit: poison-knife hits, dashes and leaps with afterimages, blink smoke, reach and slam effects.
import { RAIDER, FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { shockwave } from "../fx/shockwave";
import { chunks } from "../fx/chunks";
import { KITS } from "./registry";
import { near, core, ground, streakLine, UP } from "./shared";

KITS.raider = {
  trail: 0xa0ff90,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.6)) return false;
    const c = core(
      h,
      ev,
      dx,
      dz,
      ev.big ? RAIDER.cross : RAIDER.slash,
      RAIDER.darkSlash,
      0xc0a0ff,
      FX.twinkle,
      0xc0ffb0,
    );
    emit(h, {
      tex: RAIDER.drop,
      n: ev.big ? 5 : 2,
      x: c.px,
      y: c.py,
      z: c.pz,
      size: [0.2, 0.32],
      life: [0.4, 0.6],
      speed: [2, 4],
      up: [1.5, 3],
      dir: { x: c.n.x, y: 0.3, z: c.n.z },
      cone: 1,
      gravity: 14,
      floor: c.gy + 0.05,
    });
    if (ev.big)
      emit(h, {
        tex: RAIDER.poison,
        n: 1,
        x: c.px,
        y: c.py,
        z: c.pz,
        size: [1.6, 1.6],
        grow: 1.4,
        life: [0.3, 0.3],
        speed: [0, 0],
      });
    return true;
  },
  event(h, ev) {
    if (ev.type === "reach" && ev.style === "afterimage") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      streakLine(h, RAIDER.dashStreak, ev.x, gy + 1.2, ev.z, ev.tx, ev.tz, 6, 0xffffff, 2, false);
      streakLine(h, RAIDER.shadow, ev.x, gy + 1, ev.z, ev.tx, ev.tz, 4, 0xffffff, 1.4, false);
      return true;
    }
    if (ev.type === "blink") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, {
        tex: RAIDER.smoke,
        n: 14,
        x: ev.x,
        y: gy + 0.8,
        z: ev.z,
        size: [1.6, 2.4],
        grow: 1.8,
        life: [1.2, 1.8],
        speed: [0.8, 2.4],
        flatSpread: true,
        up: [0.2, 0.8],
        drag: 1.5,
        opacity: 0.95,
        jitter: 1,
      });
      emit(h, {
        tex: RAIDER.shadow,
        n: 6,
        x: ev.x,
        y: gy + 1.4,
        z: ev.z,
        size: [1, 1.6],
        grow: 1.4,
        life: [0.8, 1.2],
        speed: [0.5, 1.5],
        up: [1, 2],
        drag: 1,
        jitter: 0.8,
      });
      decal(h, RAIDER.smokeRing, ev.x, gy, ev.z, 2.2, 1.4, { grow: 0.3, spin: 1 });
      emit(h, {
        tex: RAIDER.glint,
        n: 2,
        x: ev.x,
        y: gy + 1.8,
        z: ev.z,
        size: [0.6, 0.8],
        life: [0.35, 0.35],
        speed: [0, 0],
        additive: true,
        jitter: 0.5,
      });
      return true;
    }
    if (ev.type === "slam") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, {
        tex: FX.burst,
        n: 1,
        x: ev.x,
        y: gy + 0.5,
        z: ev.z,
        size: [2.4, 2.4],
        grow: 1.4,
        life: [0.12, 0.12],
        speed: [0, 0],
        additive: true,
      });
      shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.4, ev.radius * 1.1, 0.35, 0xd0ffc0);
      decal(h, FX.crack, ev.x, gy, ev.z, ev.radius * 0.7, 1.4, { grow: 0.06 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        emit(h, {
          tex: RAIDER.dust,
          n: 1,
          x: ev.x,
          y: gy + 0.4,
          z: ev.z,
          size: [0.9, 1.3],
          grow: 1.8,
          life: [0.5, 0.8],
          speed: [ev.radius * 1.2, ev.radius * 1.8],
          dir: { x: Math.cos(a), y: 0.1, z: Math.sin(a) },
          cone: 0.2,
          drag: 3.5,
          opacity: 0.85,
        });
      }
      chunks(h, 4, ev.x, gy + 0.3, ev.z, { size: [0.12, 0.2], speed: [2, 4], up: [4, 6] });
      h.shake = Math.max(h.shake, 0.35);
      return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "leap") {
      emit(h, {
        tex: RAIDER.dust,
        n: 5,
        x: ev.x,
        y: gy + 0.3,
        z: ev.z,
        size: [0.9, 1.2],
        grow: 1.7,
        life: [0.4, 0.7],
        speed: [1, 2.5],
        flatSpread: true,
        drag: 3,
        opacity: 0.85,
      });
      if (ev.toX !== undefined && ev.toZ !== undefined)
        streakLine(h, RAIDER.dashStreak, ev.x, gy + 1.8, ev.z, ev.toX, ev.toZ, 5, 0xffffff, 1.8, false);
    }
    if (ev.phase === "start" && ev.kind === "dash") {
      const L = 8;
      emit(h, {
        tex: RAIDER.glint,
        n: 1,
        x: ev.x,
        y: gy + 1.8,
        z: ev.z,
        size: [1.2, 1.2],
        grow: 1.3,
        life: [0.25, 0.25],
        speed: [0, 0],
        additive: true,
      });
      streakLine(
        h,
        RAIDER.dashStreak,
        ev.x,
        gy + 1.2,
        ev.z,
        ev.x + ev.dirX * L,
        ev.z + ev.dirZ * L,
        7,
        0xffffff,
        2.2,
        false,
      );
      streakLine(h, RAIDER.afterimage, ev.x, gy + 1.0, ev.z, ev.x + ev.dirX * L, ev.z + ev.dirZ * L, 5, 0xc0ffb0, 1.6);
      emit(h, {
        tex: RAIDER.dust,
        n: 4,
        x: ev.x,
        y: gy + 0.3,
        z: ev.z,
        size: [0.8, 1.1],
        grow: 1.7,
        life: [0.4, 0.6],
        speed: [1, 2.5],
        dir: { x: -ev.dirX, y: 0.2, z: -ev.dirZ },
        cone: 0.6,
        drag: 3,
        opacity: 0.85,
      });
    }
  },
};
