import { DUELIST } from "../fx/atlas";
import { emit, tumblers } from "../fx/parts";
import { shockwave } from "../fx/shockwave";
import { KITS } from "./registry";
import { near, core, ground, UP, streakLine } from "./shared";

KITS.duelist = {
  trail: 0xd8e8ff,
  trailWidth: 0.6,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 4.4)) return false;
    const c = core(h, ev, dx, dz, ev.big ? DUELIST.crit : DUELIST.clash, DUELIST.crescent, 0xffffff, DUELIST.sparkle);
    emit(h, {
      tex: DUELIST.cut,
      n: 1,
      x: c.px,
      y: c.py,
      z: c.pz,
      size: [1.8, 1.8],
      grow: 1.2,
      life: [0.16, 0.16],
      speed: [0, 0],
      additive: true,
      order: 7,
    });
    emit(h, {
      tex: DUELIST.star,
      n: 1,
      x: c.px,
      y: c.py + 0.2,
      z: c.pz,
      size: [0.7, 0.7],
      grow: 1.6,
      life: [0.2, 0.2],
      speed: [0, 0],
      additive: true,
      order: 7,
    });
    if (ev.big) {
      emit(h, {
        tex: DUELIST.petal,
        n: 5,
        x: c.px,
        y: c.py,
        z: c.pz,
        size: [0.3, 0.45],
        life: [0.9, 1.4],
        speed: [1.5, 3.5],
        up: [1, 2.5],
        gravity: 3,
        drag: 1.5,
        spin: 6,
      });
      emit(h, {
        tex: DUELIST.fleur,
        n: 1,
        x: c.px,
        y: c.py + 1.3,
        z: c.pz,
        size: [0.9, 0.9],
        grow: 1.2,
        life: [0.6, 0.6],
        speed: [0, 0],
        up: [1, 1],
        fadeIn: 0.1,
      });
    }
    return true;
  },
  event(h, ev) {
    if (ev.type === "blink") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, {
        tex: DUELIST.gust,
        n: 3,
        x: ev.x,
        y: gy + 0.9,
        z: ev.z,
        size: [1.2, 1.6],
        grow: 1.6,
        life: [0.35, 0.5],
        speed: [0.5, 1.5],
        flatSpread: true,
        opacity: 0.85,
        jitter: 0.6,
      });
      emit(h, {
        tex: DUELIST.glint,
        n: 1,
        x: ev.x,
        y: gy + 1.6,
        z: ev.z,
        size: [1.4, 1.4],
        grow: 1.3,
        life: [0.2, 0.2],
        speed: [0, 0],
        additive: true,
      });
      emit(h, {
        tex: DUELIST.sparkle,
        n: 6,
        x: ev.x,
        y: gy + 1.2,
        z: ev.z,
        size: [0.3, 0.45],
        life: [0.3, 0.5],
        speed: [1, 3],
        up: [0.5, 1.5],
        additive: true,
        jitter: 0.6,
      });
      tumblers(h, [DUELIST.feather, DUELIST.petal], 2, ev.x, gy + 2, ev.z, {
        speed: [0.3, 1],
        up: [0.5, 1.5],
        size: [0.35, 0.45],
        life: [1.2, 1.6],
      });
      return true;
    }
    if (ev.type === "parry") {
      emit(h, {
        tex: DUELIST.clash,
        n: 1,
        x: ev.x,
        y: ev.y + 0.4,
        z: ev.z,
        size: [2.6, 2.6],
        grow: 1.3,
        life: [0.22, 0.22],
        speed: [0, 0],
        additive: true,
        order: 7,
      });
      shockwave(h, DUELIST.parryRing, ev.x, ev.y + 0.4, ev.z, UP, 0.5, 2.4, 0.35, 0xffffff);
      emit(h, {
        tex: DUELIST.crossed,
        n: 1,
        x: ev.x,
        y: ev.y + 1.8,
        z: ev.z,
        size: [1.3, 1.3],
        grow: 1.2,
        life: [0.7, 0.7],
        speed: [0, 0],
        up: [0.8, 0.8],
        fadeIn: 0.1,
        order: 8,
      });
      emit(h, {
        tex: DUELIST.sparkle,
        n: 8,
        x: ev.x,
        y: ev.y + 0.4,
        z: ev.z,
        size: [0.3, 0.5],
        life: [0.3, 0.5],
        speed: [4, 7],
        gravity: 8,
        additive: true,
      });
      h.shake = Math.max(h.shake, 0.25);
      return false;
    }
    if (ev.type === "reach") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      streakLine(h, DUELIST.speed, ev.x, gy + 1.3, ev.z, ev.tx, ev.tz, 6, 0xe8f0ff, 2);
      streakLine(h, DUELIST.ribbon, ev.x, gy + 1.1, ev.z, ev.tx, ev.tz, 3, 0xffffff, 1.2, false);
      return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "dash") {
      emit(h, {
        tex: DUELIST.glint,
        n: 1,
        x: ev.x + ev.dirX * 0.6,
        y: gy + 1.6,
        z: ev.z + ev.dirZ * 0.6,
        size: [1.3, 1.3],
        grow: 1.3,
        life: [0.2, 0.2],
        speed: [0, 0],
        additive: true,
      });
      streakLine(h, DUELIST.speed, ev.x, gy + 1.2, ev.z, ev.x + ev.dirX * 6, ev.z + ev.dirZ * 6, 6, 0xffffff, 1.8);
      emit(h, {
        tex: DUELIST.gust,
        n: 2,
        x: ev.x,
        y: gy + 0.6,
        z: ev.z,
        size: [1, 1.4],
        grow: 1.6,
        life: [0.4, 0.5],
        speed: [1, 2],
        dir: { x: -ev.dirX, y: 0.2, z: -ev.dirZ },
        cone: 0.5,
        opacity: 0.8,
      });
      tumblers(h, [DUELIST.feather], 1, ev.x, gy + 2.2, ev.z, {
        speed: [0.4, 1],
        up: [1, 2],
        size: [0.4, 0.5],
        life: [1.4, 1.8],
      });
    }
    if (ev.phase === "start" && ev.kind === "parry") {
      emit(h, {
        tex: DUELIST.parryRing,
        n: 1,
        x: ev.x + ev.dirX * 0.6,
        y: gy + 1.3,
        z: ev.z + ev.dirZ * 0.6,
        size: [1.6, 1.6],
        grow: 1.15,
        life: [0.5, 0.5],
        speed: [0, 0],
        additive: true,
        opacity: 0.8,
      });
    }
    if (ev.phase === "start" && ev.kind === "flurry") {
      emit(h, {
        tex: DUELIST.gust,
        n: 4,
        x: ev.x,
        y: gy + 0.8,
        z: ev.z,
        size: [1.2, 1.6],
        grow: 1.7,
        life: [0.5, 0.7],
        speed: [1.5, 3],
        flatSpread: true,
        drag: 2,
        opacity: 0.8,
      });
      emit(h, {
        tex: DUELIST.fleur,
        n: 1,
        x: ev.x,
        y: gy + 3,
        z: ev.z,
        size: [1.1, 1.1],
        grow: 1.2,
        life: [0.7, 0.7],
        speed: [0, 0],
        up: [0.8, 0.8],
        fadeIn: 0.1,
      });
    }
  },
};
