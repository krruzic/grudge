// Bramble & Mead (rider) kit: honey-splash ladle hits, the flung honey dollop projectile, the thrown honey pot
// (the Tripo honeypot prop on a ballistic arc) and its splash, Take Wing lift-off gust and landing bloom, Royal
// Jelly's crowned honeycomb ring, Buzz Strafe streaks, Sweet Tooth motes and the partner honey buff. The honey pool
// itself is a hazard zone (style "honey", hazards/zones.ts) using HONEY_POOL and the bee/comb sprites here.
import * as THREE from "three";
import { activeCostume, cv, FX, RIDER } from "../fx/atlas";
import { type FxHost, emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { shockwave } from "../fx/shockwave";
import { prop } from "../props";
import { ground, near, normalized, UP } from "./shared";
import { KITS } from "./registry";

export const HONEY_POOL = RIDER.pool;
export const HONEY_COMB = RIDER.comb;
export const HONEY_BEE = RIDER.bee;
export const HONEY_DROP = RIDER.drop;

function honeySplash(h: FxHost, x: number, gy: number, z: number, r: number, big: boolean): void {
  emit(h, {
    tex: RIDER.splash,
    n: 1,
    x,
    y: gy + 0.5 * r * 0.4 + 0.3,
    z,
    size: [r * 1.1, r * 1.1],
    grow: 1.35,
    life: [0.32, 0.32],
    speed: [0, 0],
    order: 5,
  });
  shockwave(h, FX.shock, x, gy + 0.15, z, UP, 0.3, r, 0.4, 0xffd060, 0.8);
  emit(h, {
    tex: RIDER.drop,
    n: big ? 16 : 7,
    x,
    y: gy + 0.6,
    z,
    size: [0.16, 0.3],
    life: [0.5, 0.85],
    speed: [2, r * 1.5],
    up: [2.5, 5],
    gravity: 14,
    floor: gy + 0.05,
  });
  emit(h, {
    tex: RIDER.comb,
    n: big ? 5 : 2,
    x,
    y: gy + 0.5,
    z,
    size: [0.22, 0.34],
    life: [0.6, 0.9],
    speed: [2, 4],
    up: [3, 5],
    gravity: 14,
    spin: 6,
    floor: gy + 0.08,
  });
}

function healMotes(h: FxHost, x: number, gy: number, z: number, r: number, n: number): void {
  emit(h, {
    tex: RIDER.heal,
    n,
    x,
    y: gy + 0.8,
    z,
    size: [0.38, 0.52],
    life: [0.9, 1.2],
    speed: [0.2, 0.6],
    up: [1.2, 2],
    jitter: r,
  });
  emit(h, {
    tex: RIDER.pollen,
    n: Math.ceil(n * 1.5),
    x,
    y: gy + 0.5,
    z,
    size: [0.3, 0.5],
    grow: 1.4,
    life: [0.7, 1.1],
    speed: [0.2, 0.7],
    up: [0.6, 1.4],
    jitter: r,
    opacity: 0.85,
  });
}

/** The thrown honey pot: the costume's honeypot prop (or a procedural blob) along a ballistic arc. */
function potFlight(h: FxHost, x0: number, y0: number, z0: number, tx: number, tz: number, secs: number): void {
  const ty = ground(h, tx, tz, y0 - 1.7);
  const p = prop("honeypot", undefined, { hero: "rider", costume: activeCostume() });
  const o = p
    ? normalized(p, 0.55)
    : new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xd88a3a, flatShading: true }),
      );
  const g = new THREE.Group();
  g.add(o);
  o.position.y = -0.25;
  h.root.add(g);
  const d = Math.hypot(tx - x0, tz - z0);
  const peak = 1.2 + d * 0.22;
  let drip = 0;
  h.add(g, secs, (k, dt) => {
    g.position.set(x0 + (tx - x0) * k, y0 + (ty + 0.3 - y0) * k + peak * 4 * k * (1 - k), z0 + (tz - z0) * k);
    g.rotation.x += dt * 9;
    g.rotation.y += dt * 3;
    drip -= dt;
    if (drip <= 0) {
      drip = 0.05;
      emit(h, {
        tex: RIDER.drop,
        n: 1,
        x: g.position.x,
        y: g.position.y,
        z: g.position.z,
        size: [0.12, 0.2],
        life: [0.4, 0.6],
        speed: [0, 0.4],
        gravity: 10,
        floor: ty + 0.05,
      });
    }
  });
}

KITS.rider = {
  trail: 0xffc040,
  trailWidth: 0.9,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.4)) return false;
    const n = new THREE.Vector3(dx, 0, dz);
    if (n.lengthSq() < 1e-4) n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    n.normalize();
    const px = ev.x - n.x * 0.35;
    const pz = ev.z - n.z * 0.35;
    const py = ev.y + 0.3;
    const gy = ground(h, ev.x, ev.z, ev.y - 1);
    emit(h, {
      tex: FX.burst2,
      n: 1,
      x: px,
      y: py,
      z: pz,
      color: 0xfff0b0,
      size: ev.big ? [1.4, 1.4] : [0.9, 0.9],
      grow: 1.6,
      life: [0.1, 0.1],
      speed: [0, 0],
      additive: true,
      order: 6,
    });
    emit(h, {
      tex: RIDER.splash,
      n: 1,
      x: px,
      y: py,
      z: pz,
      size: ev.big ? [1.6, 1.6] : [1, 1],
      grow: 1.3,
      life: [0.2, 0.2],
      speed: [0, 0],
      order: 5,
    });
    emit(h, {
      tex: RIDER.drop,
      n: ev.big ? 8 : 4,
      x: px,
      y: py + 0.2,
      z: pz,
      size: [0.14, 0.24],
      life: [0.45, 0.7],
      speed: [2, 4],
      up: [1.5, 3],
      dir: { x: n.x, y: 0.3, z: n.z },
      cone: 1,
      gravity: 14,
      floor: gy + 0.05,
    });
    emit(h, {
      tex: FX.dust,
      n: ev.big ? 2 : 1,
      x: ev.x,
      y: gy + 0.35,
      z: ev.z,
      size: [0.7, 1],
      grow: 1.8,
      life: [0.4, 0.6],
      speed: [1, 2],
      flatSpread: true,
      drag: 3,
      opacity: 0.8,
    });
    if (ev.big) shockwave(h, FX.shock, px, py, pz, n, 0.25, 1.7, 0.26, 0xffe080, 0.9);
    h.shake = Math.max(h.shake, ev.big ? 0.24 : 0.08);
    return true;
  },
  projectile(h, style) {
    if (style !== "honey") return null;
    void h;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cv(RIDER.blob), transparent: true, depthWrite: false }));
    s.scale.setScalar(0.75);
    return s;
  },
  projectileTick(h, obj, x, y, z, dt) {
    const s = obj as THREE.Sprite;
    s.material.rotation += dt * 6;
    if (Math.random() < 0.5)
      emit(h, {
        tex: RIDER.drop,
        n: 1,
        x,
        y,
        z,
        size: [0.1, 0.18],
        life: [0.3, 0.5],
        speed: [0, 0.3],
        gravity: 10,
      });
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "potThrow":
        potFlight(h, ev.x, ev.y, ev.z, ev.tx ?? ev.x, ev.tz ?? ev.z, ev.seconds ?? 0.6);
        emit(h, {
          tex: FX.swoosh,
          n: 1,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          color: 0xfff0c0,
          size: [1.1, 1.1],
          grow: 1.3,
          life: [0.18, 0.18],
          speed: [0, 0],
          opacity: 0.8,
        });
        return true;
      case "potSplash": {
        const r = ev.radius ?? 3;
        honeySplash(h, ev.x, gy, ev.z, r, true);
        emit(h, {
          tex: RIDER.shard,
          n: 5,
          x: ev.x,
          y: gy + 0.5,
          z: ev.z,
          size: [0.2, 0.32],
          life: [0.6, 0.9],
          speed: [2, 4.5],
          up: [3, 5.5],
          gravity: 15,
          spin: 9,
          floor: gy + 0.06,
        });
        decal(h, RIDER.pool, ev.x, gy + 0.03, ev.z, r * 0.9, 0.5, { grow: 0.25, opacity: 0.9 });
        h.shake = Math.max(h.shake, 0.14);
        return true;
      }
      case "wingUp": {
        decal(h, RIDER.gust, ev.x, gy + 0.05, ev.z, 2.6, 0.6, { grow: 0.6, spin: 3, opacity: 0.85 });
        shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.3, 2.8, 0.35, 0xfff4d0, 0.7);
        emit(h, {
          tex: FX.dust,
          n: 8,
          x: ev.x,
          y: gy + 0.3,
          z: ev.z,
          size: [0.8, 1.2],
          grow: 1.8,
          life: [0.4, 0.7],
          speed: [2.5, 4.5],
          flatSpread: true,
          drag: 3,
          opacity: 0.8,
        });
        emit(h, {
          tex: RIDER.petal,
          n: 10,
          x: ev.x,
          y: gy + 0.5,
          z: ev.z,
          size: [0.14, 0.24],
          life: [0.9, 1.4],
          speed: [2, 4],
          up: [2, 4],
          gravity: 2,
          drag: 1.5,
          spin: 5,
        });
        return true;
      }
      case "wingLand": {
        const r = ev.radius ?? 4;
        decal(h, RIDER.gust, ev.x, gy + 0.05, ev.z, r, 0.5, { grow: 0.4, spin: -3, opacity: 0.75 });
        shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.4, r, 0.4, 0xffe8a0, 0.85);
        healMotes(h, ev.x, gy, ev.z, r * 0.7, 6);
        emit(h, {
          tex: FX.dust,
          n: 10,
          x: ev.x,
          y: gy + 0.3,
          z: ev.z,
          size: [0.8, 1.3],
          grow: 1.8,
          life: [0.4, 0.7],
          speed: [2, 4],
          flatSpread: true,
          drag: 3,
          opacity: 0.85,
        });
        emit(h, {
          tex: RIDER.clover,
          n: 6,
          x: ev.x,
          y: gy + 0.3,
          z: ev.z,
          size: [0.18, 0.28],
          life: [0.8, 1.2],
          speed: [2, 3.5],
          up: [2, 3.5],
          gravity: 8,
          spin: 6,
          floor: gy + 0.05,
        });
        h.shake = Math.max(h.shake, 0.2);
        return true;
      }
      case "royalJelly": {
        const r = ev.radius ?? 10;
        decal(h, RIDER.ring, ev.x, gy + 0.04, ev.z, r / 0.9, 1.6, { grow: 0.5, spin: 0.3, opacity: 0.95 });
        shockwave(h, FX.shock, ev.x, gy + 0.25, ev.z, UP, 0.5, r, 0.6, 0xfff0c0, 0.85);
        emit(h, {
          tex: RIDER.crown,
          n: 1,
          x: ev.x,
          y: gy + 3.2,
          z: ev.z,
          size: [1.2, 1.2],
          grow: 1.3,
          life: [0.9, 0.9],
          speed: [0, 0],
          up: [0.6, 0.6],
          order: 6,
        });
        emit(h, {
          tex: RIDER.jelly,
          n: 14,
          x: ev.x,
          y: gy + 2.6,
          z: ev.z,
          size: [0.3, 0.5],
          life: [0.8, 1.2],
          speed: [2, r * 0.6],
          up: [2, 4],
          gravity: 8,
          floor: gy + 0.05,
        });
        emit(h, {
          tex: RIDER.bee,
          n: 8,
          x: ev.x,
          y: gy + 1.4,
          z: ev.z,
          size: [0.35, 0.5],
          life: [1, 1.4],
          speed: [r * 0.4, r * 0.7],
          flatSpread: true,
          up: [0.5, 1.2],
          drag: 1.2,
        });
        healMotes(h, ev.x, gy, ev.z, r * 0.8, 12);
        h.shake = Math.max(h.shake, 0.3);
        return true;
      }
      case "buzz":
        emit(h, {
          tex: RIDER.wing,
          n: 3,
          x: ev.x,
          y: gy + 1.1,
          z: ev.z,
          size: [1, 1.5],
          grow: 1.4,
          life: [0.2, 0.32],
          speed: [0.5, 1],
          dir: { x: -((ev.tx ?? ev.x) - ev.x), y: 0, z: -((ev.tz ?? ev.z) - ev.z) },
          cone: 0.4,
          opacity: 0.75,
        });
        emit(h, {
          tex: RIDER.pollen,
          n: 4,
          x: ev.x,
          y: gy + 0.6,
          z: ev.z,
          size: [0.3, 0.45],
          grow: 1.4,
          life: [0.4, 0.6],
          speed: [0.5, 1.2],
          jitter: 0.5,
          opacity: 0.8,
        });
        return true;
      case "sweet": {
        const w = h.world;
        if (!w) return true;
        const r = ev.radius ?? 7;
        for (const o of w.entities) {
          if (!o.alive || o.team !== ev.team || o.structure || o.hp >= o.maxHp || o.id === ev.src) continue;
          if (Math.hypot(o.transform.pos.x - ev.x, o.transform.pos.z - ev.z) > r) continue;
          emit(h, {
            tex: RIDER.pollen,
            n: 1,
            x: o.transform.pos.x,
            y: o.transform.y + 0.8,
            z: o.transform.pos.z,
            size: [0.22, 0.32],
            life: [0.7, 1],
            speed: [0.1, 0.3],
            up: [0.8, 1.2],
            jitter: 0.8,
            opacity: 0.85,
          });
          if (o.hero)
            emit(h, {
              tex: RIDER.heal,
              n: 1,
              x: o.transform.pos.x,
              y: o.transform.y + 1.6,
              z: o.transform.pos.z,
              size: [0.28, 0.38],
              life: [0.8, 1],
              speed: [0.1, 0.3],
              up: [0.8, 1.2],
              jitter: 0.5,
              opacity: 0.85,
            });
        }
        return true;
      }
      case "sweetHigh":
        // High ground doubles Sweet Tooth: a little bee circles up over the ally.
        emit(h, {
          tex: RIDER.bee,
          n: 1,
          x: ev.x,
          y: ev.y + 2,
          z: ev.z,
          size: [0.35, 0.35],
          life: [0.9, 0.9],
          speed: [0.4, 0.8],
          up: [0.8, 1.2],
        });
        emit(h, {
          tex: RIDER.heal,
          n: 2,
          x: ev.x,
          y: ev.y + 1.8,
          z: ev.z,
          size: [0.4, 0.5],
          life: [0.9, 1.1],
          speed: [0.1, 0.3],
          up: [1, 1.5],
          jitter: 0.5,
        });
        return true;
      case "honeyBuff":
        emit(h, {
          tex: RIDER.bee,
          n: 3,
          x: ev.x,
          y: ev.y + 1.6,
          z: ev.z,
          size: [0.3, 0.4],
          life: [0.8, 1.1],
          speed: [0.8, 1.4],
          flatSpread: true,
          up: [0.4, 0.8],
          drag: 1,
        });
        emit(h, {
          tex: FX.flashRed,
          n: 1,
          x: ev.x,
          y: ev.y + 1.1,
          z: ev.z,
          color: 0xffc040,
          size: [1.2, 1.2],
          grow: 1.4,
          life: [0.25, 0.25],
          speed: [0, 0],
          additive: true,
        });
        return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "royaljelly")
      emit(h, {
        tex: RIDER.jelly,
        n: 6,
        x: ev.x,
        y: gy + 2.4,
        z: ev.z,
        size: [0.25, 0.4],
        life: [0.4, 0.6],
        speed: [0.5, 1.5],
        up: [0.5, 1.2],
        jitter: 0.8,
      });
    if (ev.phase === "start" && ev.kind === "takewing")
      emit(h, {
        tex: RIDER.wing,
        n: 2,
        x: ev.x,
        y: gy + 1.4,
        z: ev.z,
        size: [1.2, 1.6],
        grow: 1.3,
        life: [0.25, 0.3],
        speed: [0, 0.4],
        opacity: 0.7,
      });
    if (ev.phase === "fire" && ev.kind === "honeyfling")
      emit(h, {
        tex: RIDER.drop,
        n: 5,
        x: ev.x + (ev.dirX ?? 0) * 0.8,
        y: gy + 1.7,
        z: ev.z + (ev.dirZ ?? 0) * 0.8,
        size: [0.14, 0.22],
        life: [0.4, 0.6],
        speed: [1.5, 3],
        dir: { x: ev.dirX ?? 0, y: 0.4, z: ev.dirZ ?? 0 },
        cone: 0.7,
        gravity: 12,
        floor: gy + 0.05,
      });
  },
};
