import { HERALD, FX } from "../fx/atlas";
import { emit, decal } from "../fx/parts";
import { KITS } from "./registry";
import { near, core, ground } from "./shared";

KITS.herald = {
  trail: 0xfff0a0,
  hit(h, ev, src, dx, dz) {
    if (near(ev, src, 3)) {
      core(h, ev, dx, dz, HERALD.star, FX.shock, 0xffe8a0, HERALD.star);
      return true;
    }
    emit(h, {
      tex: HERALD.star,
      n: 1,
      x: ev.x,
      y: ev.y + 0.3,
      z: ev.z,
      size: [0.9, 0.9],
      grow: 1.4,
      life: [0.16, 0.16],
      speed: [0, 0],
      additive: true,
    });
    emit(h, {
      tex: FX.twinkle,
      n: 3,
      x: ev.x,
      y: ev.y + 0.3,
      z: ev.z,
      size: [0.25, 0.4],
      life: [0.2, 0.3],
      speed: [3, 5],
      gravity: 10,
      additive: true,
    });
    return true;
  },
  event(h, ev) {
    if (ev.type === "warcry") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, {
        tex: HERALD.horn,
        n: 1,
        x: ev.x,
        y: gy + 3.4,
        z: ev.z,
        size: [1.4, 1.4],
        grow: 1.2,
        life: [0.8, 0.8],
        speed: [0, 0],
        up: [0.7, 0.7],
        fadeIn: 0.1,
        order: 7,
      });
      for (let k = 0; k < 2; k++)
        h.after(k * 0.18, () =>
          decal(h, HERALD.halo, ev.x, gy + 0.02 * k, ev.z, ev.radius, 0.7, {
            grow: 0.55,
            spin: k ? -0.8 : 0.8,
            additive: true,
            color: 0xffd870,
            opacity: 0.75,
          }),
        );
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        emit(h, {
          tex: HERALD.blast,
          n: 1,
          x: ev.x,
          y: gy + 1.6,
          z: ev.z,
          size: [1, 1],
          grow: 2.2,
          life: [0.5, 0.5],
          speed: [ev.radius * 0.9, ev.radius * 0.9],
          dir: { x: Math.cos(a), y: 0, z: Math.sin(a) },
          cone: 0.01,
          additive: true,
          opacity: 0.55,
        });
      }
      return true;
    }
    if (ev.type === "banner") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, {
        tex: HERALD.fleur,
        n: 1,
        x: ev.x,
        y: gy + 3.6,
        z: ev.z,
        size: [1.2, 1.2],
        grow: 1.25,
        life: [0.9, 0.9],
        speed: [0, 0],
        up: [0.7, 0.7],
        fadeIn: 0.08,
        order: 7,
      });
      emit(h, {
        tex: HERALD.star,
        n: 5,
        x: ev.x,
        y: gy + 3,
        z: ev.z,
        size: [0.25, 0.4],
        life: [0.4, 0.7],
        speed: [1.5, 3],
        up: [1, 2.5],
        gravity: 4,
        additive: true,
      });
      decal(h, HERALD.laurel, ev.x, gy, ev.z, 1.6, 1.6, { grow: 0.25 });
      emit(h, {
        tex: HERALD.dust,
        n: 8,
        x: ev.x,
        y: gy + 0.3,
        z: ev.z,
        size: [0.9, 1.3],
        grow: 1.8,
        life: [0.5, 0.8],
        speed: [1.5, 3],
        flatSpread: true,
        drag: 3,
        opacity: 0.85,
      });
      h.shake = Math.max(h.shake, 0.15);
      return true;
    }
    if (ev.type === "rally") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      decal(h, HERALD.laurel, ev.x, gy, ev.z, 1.9, 1.6, { grow: 0.3, color: 0xfff0a0 });
      decal(h, HERALD.halo, ev.x, gy + 0.02, ev.z, ev.radius, 0.9, {
        grow: 0.6,
        spin: 0.6,
        additive: true,
        color: 0xfff0b0,
        opacity: 0.7,
      });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        h.after(i * 0.05, () =>
          emit(h, {
            tex: HERALD.star,
            n: 1,
            x: ev.x + Math.cos(a) * 1.4,
            y: gy + 0.4,
            z: ev.z + Math.sin(a) * 1.4,
            size: [0.35, 0.5],
            life: [0.8, 0.9],
            speed: [0.2, 0.4],
            up: [3, 3.6],
            drag: 1,
            additive: true,
          }),
        );
      }
      emit(h, {
        tex: HERALD.heal,
        n: 12,
        x: ev.x,
        y: gy + 0.6,
        z: ev.z,
        size: [0.5, 0.7],
        life: [1, 1.4],
        speed: [0.3, 1],
        up: [1.5, 2.5],
        jitter: ev.radius * 1.2,
      });
      emit(h, {
        tex: HERALD.shield,
        n: 1,
        x: ev.x,
        y: gy + 3.6,
        z: ev.z,
        size: [1.4, 1.4],
        grow: 1.2,
        life: [0.9, 0.9],
        speed: [0, 0],
        up: [0.6, 0.6],
        fadeIn: 0.1,
      });
      return true;
    }
    return false;
  },
};
