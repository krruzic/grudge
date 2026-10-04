// Maddock (friar) kit: ale splash hits, keg throws/landings/explosions (kegBoom), keg rocket, Brewfest, Last
// Call and Plenty effects, and the ale/brewfest/tar zone decals used by the hazard zones (ZONE_DECALS). The kegs,
// cask and keg rocket models themselves are drawn by heroProps/friar.ts.
import * as THREE from "three";
import { composite, FRIAR, FX } from "../fx/atlas";
import { type FxHost, emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { chunks } from "../fx/chunks";
import { shockwave } from "../fx/shockwave";
import { ground, near, UP } from "./shared";
import { KITS } from "./registry";

export const BUBBLE = FRIAR.bubble;
export const FOAM = FRIAR.foam;
export const ALE_DROP = FRIAR.drop;
const ALE_SPLASH = FRIAR.splash;
export function disc(draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  return composite(
    256,
    (g) => {
      g.save();
      g.beginPath();
      g.arc(128, 128, 126, 0, Math.PI * 2);
      g.clip();
      draw(g);
      g.restore();
    },
    false,
    512,
  );
}
function speckle(
  g: CanvasRenderingContext2D,
  n: number,
  rMin: number,
  rMax: number,
  color: string,
  size: [number, number],
  seed: number,
): void {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rMin + rnd() * (rMax - rMin);
    g.beginPath();
    g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, size[0] + rnd() * (size[1] - size[0]), 0, Math.PI * 2);
    g.fill();
  }
}
export const ZONE_DECALS: Record<string, THREE.Texture> = {
  ale: disc((g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 124);
    gr.addColorStop(0, "rgba(250,190,60,0.78)");
    gr.addColorStop(0.7, "rgba(214,138,24,0.7)");
    gr.addColorStop(0.9, "rgba(240,215,160,0.75)");
    gr.addColorStop(1, "rgba(240,215,160,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    speckle(g, 70, 92, 118, "rgba(255,250,235,0.9)", [3, 8], 7);
    speckle(g, 22, 10, 90, "rgba(255,245,210,0.55)", [2, 5], 11);
    g.strokeStyle = "rgba(255,245,200,0.35)";
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(110, 104, 46, 18, -0.5, 0, Math.PI * 2);
    g.stroke();
  }),
  brewfest: disc((g) => {
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 126);
    gr.addColorStop(0, "rgba(255,210,90,0.18)");
    gr.addColorStop(0.82, "rgba(255,190,60,0.12)");
    gr.addColorStop(0.92, "rgba(255,220,120,0.65)");
    gr.addColorStop(1, "rgba(255,220,120,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    speckle(g, 90, 108, 122, "rgba(255,245,215,0.75)", [2, 5], 3);
    g.strokeStyle = "rgba(255,230,150,0.55)";
    g.lineWidth = 3;
    g.setLineDash([10, 9]);
    g.beginPath();
    g.arc(128, 128, 98, 0, Math.PI * 2);
    g.stroke();
  }),
  tar: disc((g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 124);
    gr.addColorStop(0, "rgba(20,12,8,0.95)");
    gr.addColorStop(0.8, "rgba(34,20,10,0.85)");
    gr.addColorStop(1, "rgba(34,20,10,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(255,120,30,0.55)";
    g.lineWidth = 3;
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20);
      g.lineTo(128 + Math.cos(a + 0.3) * 70, 128 + Math.sin(a + 0.3) * 70);
      g.lineTo(128 + Math.cos(a + 0.1) * 105, 128 + Math.sin(a + 0.1) * 105);
      g.stroke();
    }
    speckle(g, 30, 10, 110, "rgba(120,90,60,0.45)", [3, 7], 5);
  }),
};
ZONE_DECALS.ale = FRIAR.puddle;
ZONE_DECALS.brewfest = FRIAR.hopRing;
ZONE_DECALS.aletrail = ZONE_DECALS.ale;
function aleSplash(h: FxHost, x: number, gy: number, z: number, r: number, big: boolean): void {
  emit(h, {
    tex: ALE_SPLASH,
    n: 1,
    x,
    y: gy + 0.6,
    z,
    size: [r * 1.4, r * 1.4],
    grow: 1.4,
    life: [0.3, 0.3],
    speed: [0, 0],
    order: 5,
  });
  emit(h, {
    tex: FX.splash,
    n: big ? 3 : 1,
    x,
    y: gy + 0.5,
    z,
    color: 0xffc860,
    size: [r * 0.8, r],
    grow: 1.5,
    life: [0.35, 0.5],
    speed: [0.2, 0.6],
    up: [0.5, 1],
  });
  shockwave(h, FX.shock, x, gy + 0.15, z, UP, 0.3, r, 0.4, 0xffe6a0, 0.8);
  emit(h, {
    tex: ALE_DROP,
    n: big ? 16 : 6,
    x,
    y: gy + 0.6,
    z,
    size: [0.18, 0.3],
    life: [0.5, 0.8],
    speed: [2, r * 1.6],
    up: [2.5, 5],
    gravity: 14,
    floor: gy + 0.05,
  });
  emit(h, {
    tex: FOAM,
    n: big ? 6 : 2,
    x,
    y: gy + 0.4,
    z,
    size: [0.5, 0.8],
    grow: 1.5,
    life: [0.5, 0.8],
    speed: [1, 2.5],
    flatSpread: true,
    drag: 3,
  });
  emit(h, {
    tex: BUBBLE,
    n: big ? 10 : 4,
    x,
    y: gy + 0.3,
    z,
    size: [0.18, 0.32],
    life: [0.6, 1.1],
    speed: [0.2, 0.6],
    up: [0.6, 1.4],
    jitter: r * 1.2,
  });
  emit(h, {
    tex: FRIAR.heal,
    n: big ? 6 : 2,
    x,
    y: gy + 0.8,
    z,
    size: [0.4, 0.55],
    life: [0.9, 1.2],
    speed: [0.2, 0.6],
    up: [1.2, 2],
    jitter: r,
  });
}
export function kegBoom(h: FxHost, x: number, gy: number, z: number, r: number, big: boolean): void {
  emit(h, {
    tex: FRIAR.blast,
    n: 1,
    x,
    y: gy + 1,
    z,
    size: [r * 1.3, r * 1.3],
    grow: 1.4,
    life: [0.2, 0.2],
    speed: [0, 0],
    order: 6,
  });
  emit(h, {
    tex: FX.fire,
    n: big ? 10 : 4,
    x,
    y: gy + 0.8,
    z,
    size: [0.9, 1.5],
    grow: 1.6,
    life: [0.3, 0.55],
    speed: [1.5, r * 1.6],
    up: [1, 2.5],
    additive: true,
  });
  emit(h, {
    tex: FRIAR.smoke,
    n: big ? 10 : 4,
    x,
    y: gy + 1,
    z,
    size: [1.2, 1.9],
    grow: 1.8,
    life: [0.9, 1.5],
    speed: [1, 2.5],
    up: [0.8, 1.6],
    drag: 1.5,
    opacity: 0.85,
  });
  emit(h, {
    tex: FRIAR.spark,
    n: big ? 12 : 5,
    x,
    y: gy + 0.8,
    z,
    size: [0.15, 0.25],
    life: [0.6, 1],
    speed: [3, 7],
    up: [2, 5],
    gravity: 9,
    additive: true,
  });
  emit(h, {
    tex: FRIAR.stave,
    n: big ? 6 : 2,
    x,
    y: gy + 0.6,
    z,
    size: [0.45, 0.7],
    life: [0.7, 1],
    speed: [3, 6],
    up: [4, 7],
    gravity: 16,
    spin: 10,
    floor: gy + 0.1,
  });
  shockwave(h, FX.shock, x, gy + 0.3, z, UP, 0.4, r * 1.15, 0.35, 0xffb060, 0.95);
  if (big) {
    decal(h, FX.crack, x, gy, z, r * 0.75, 2.2, { grow: 0.06, opacity: 0.85 });
    chunks(h, 5, x, gy + 0.3, z, { size: [0.12, 0.22], speed: [2, 5], up: [4, 7] });
  }
  h.shake = Math.max(h.shake, big ? 0.5 : 0.2);
}
KITS.friar = {
  trail: 0xffc850,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.6)) return false;
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
      color: 0xfff0c0,
      size: ev.big ? [1.5, 1.5] : [1, 1],
      grow: 1.6,
      life: [0.1, 0.1],
      speed: [0, 0],
      additive: true,
      order: 6,
    });
    emit(h, {
      tex: FX.burst,
      n: 1,
      x: px,
      y: py,
      z: pz,
      color: 0xffe0a0,
      size: ev.big ? [2.2, 2.2] : [1.3, 1.3],
      grow: 1.3,
      life: [0.18, 0.18],
      speed: [0, 0],
      order: 5,
    });
    emit(h, {
      tex: ALE_DROP,
      n: ev.big ? 8 : 4,
      x: px,
      y: py + 0.2,
      z: pz,
      size: [0.16, 0.26],
      life: [0.45, 0.7],
      speed: [2, 4],
      up: [1.5, 3],
      dir: { x: n.x, y: 0.3, z: n.z },
      cone: 1,
      gravity: 14,
      floor: gy + 0.05,
    });
    emit(h, {
      tex: FOAM,
      n: ev.big ? 2 : 1,
      x: px,
      y: py,
      z: pz,
      size: [0.4, 0.6],
      grow: 1.6,
      life: [0.3, 0.45],
      speed: [0.5, 1.2],
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
    if (ev.big) shockwave(h, FX.shock, px, py, pz, n, 0.25, 1.8, 0.28, 0xffe0a0, 0.9);
    h.shake = Math.max(h.shake, ev.big ? 0.28 : 0.1);
    return true;
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "kegThrow":
      case "powderThrow":
        emit(h, {
          tex: FX.swoosh,
          n: 1,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          color: 0xfff0d0,
          size: [1.2, 1.2],
          grow: 1.3,
          life: [0.18, 0.18],
          speed: [0, 0],
          opacity: 0.8,
        });
        return true;
      case "kegSplash":
        aleSplash(h, ev.x, gy, ev.z, ev.radius ?? 3, true);
        h.shake = Math.max(h.shake, 0.15);
        return true;
      case "kegSplashSmall":
        aleSplash(h, ev.x, gy, ev.z, ev.radius ?? 2, false);
        return true;
      case "kegLand":
        emit(h, {
          tex: FX.dust,
          n: 4,
          x: ev.x,
          y: gy + 0.3,
          z: ev.z,
          size: [0.7, 1],
          grow: 1.7,
          life: [0.4, 0.6],
          speed: [1, 2],
          flatSpread: true,
          drag: 3,
          opacity: 0.85,
        });
        h.shake = Math.max(h.shake, 0.08);
        return true;
      case "kegBoom":
        kegBoom(h, ev.x, gy, ev.z, ev.radius ?? 3.2, true);
        return true;
      case "kegPop":
        kegBoom(h, ev.x, gy, ev.z, ev.radius ?? 2, false);
        return true;
      case "brewfest": {
        const r = ev.radius ?? 7;
        emit(h, {
          tex: FX.dust,
          n: 12,
          x: ev.x,
          y: gy + 0.4,
          z: ev.z,
          size: [1, 1.5],
          grow: 1.8,
          life: [0.5, 0.9],
          speed: [2, 4.5],
          flatSpread: true,
          drag: 3,
          opacity: 0.85,
        });
        shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.5, r, 0.6, 0xffd070, 0.85);
        decal(h, FRIAR.hopRing, ev.x, gy + 0.02, ev.z, r, 1.0, { grow: 0.5, spin: 0.5, opacity: 0.8 });
        emit(h, {
          tex: FOAM,
          n: 10,
          x: ev.x,
          y: gy + 2.4,
          z: ev.z,
          size: [0.5, 0.9],
          grow: 1.4,
          life: [0.7, 1.1],
          speed: [1.5, 3.5],
          up: [3, 5],
          gravity: 9,
        });
        emit(h, {
          tex: ALE_DROP,
          n: 18,
          x: ev.x,
          y: gy + 2.4,
          z: ev.z,
          size: [0.2, 0.32],
          life: [0.7, 1.1],
          speed: [2, 4],
          up: [3, 6],
          gravity: 12,
          floor: gy + 0.05,
        });
        emit(h, {
          tex: FRIAR.cheers,
          n: 8,
          x: ev.x,
          y: gy + 3,
          z: ev.z,
          color: 0xffe090,
          size: [0.3, 0.45],
          life: [0.6, 0.9],
          speed: [1.5, 3],
          up: [1, 2.5],
          gravity: 4,
          additive: true,
        });
        h.shake = Math.max(h.shake, 0.35);
        return true;
      }
      case "lastCall": {
        const r = ev.radius ?? 7;
        emit(h, {
          tex: ALE_SPLASH,
          n: 1,
          x: ev.x,
          y: gy + 1.5,
          z: ev.z,
          size: [r, r],
          grow: 1.4,
          life: [0.4, 0.4],
          speed: [0, 0],
        });
        shockwave(h, FX.shock, ev.x, gy + 0.3, ev.z, UP, 0.5, r, 0.5, 0xffd070, 1);
        emit(h, {
          tex: FOAM,
          n: 14,
          x: ev.x,
          y: gy + 1,
          z: ev.z,
          size: [0.6, 1.1],
          grow: 1.5,
          life: [0.8, 1.2],
          speed: [2, 5],
          up: [4, 8],
          gravity: 10,
        });
        emit(h, {
          tex: ALE_DROP,
          n: 30,
          x: ev.x,
          y: gy + 1,
          z: ev.z,
          size: [0.2, 0.34],
          life: [0.8, 1.2],
          speed: [3, 6],
          up: [4, 9],
          gravity: 12,
          floor: gy + 0.05,
        });
        emit(h, {
          tex: FRIAR.heal,
          n: 10,
          x: ev.x,
          y: gy + 0.8,
          z: ev.z,
          size: [0.45, 0.6],
          life: [1, 1.4],
          speed: [0.3, 1],
          up: [1.5, 2.5],
          jitter: r,
        });
        emit(h, {
          tex: FRIAR.stave,
          n: 8,
          x: ev.x,
          y: gy + 1,
          z: ev.z,
          size: [0.5, 0.8],
          life: [0.8, 1.1],
          speed: [3, 6],
          up: [4, 8],
          gravity: 16,
          spin: 10,
          floor: gy + 0.1,
        });
        h.shake = Math.max(h.shake, 0.5);
        return true;
      }
      case "kegRocket":
        emit(h, {
          tex: FX.dust,
          n: 6,
          x: ev.x,
          y: gy + 0.3,
          z: ev.z,
          size: [0.8, 1.2],
          grow: 1.7,
          life: [0.4, 0.7],
          speed: [1, 2.5],
          flatSpread: true,
          drag: 3,
          opacity: 0.85,
        });
        emit(h, {
          tex: FOAM,
          n: 4,
          x: ev.x,
          y: gy + 0.4,
          z: ev.z,
          size: [0.5, 0.8],
          grow: 1.5,
          life: [0.5, 0.7],
          speed: [1, 2],
          up: [1, 2],
          gravity: 4,
        });
        return true;
      case "plenty": {
        const w = h.world;
        if (!w) return true;
        const r = ev.radius ?? 7;
        for (const o of w.entities) {
          if (!o.alive || o.team !== ev.team || o.structure || o.hp >= o.maxHp) continue;
          if (Math.hypot(o.transform.pos.x - ev.x, o.transform.pos.z - ev.z) > r) continue;
          emit(h, {
            tex: BUBBLE,
            n: 1,
            x: o.transform.pos.x,
            y: o.transform.y + 0.8,
            z: o.transform.pos.z,
            size: [0.16, 0.26],
            life: [0.7, 1],
            speed: [0.1, 0.3],
            up: [0.8, 1.2],
            jitter: 0.8,
          });
          if (o.hero)
            emit(h, {
              tex: FRIAR.heal,
              n: 1,
              x: o.transform.pos.x,
              y: o.transform.y + 1.6,
              z: o.transform.pos.z,
              color: 0xffe8a0,
              size: [0.3, 0.4],
              life: [0.8, 1],
              speed: [0.1, 0.3],
              up: [0.8, 1.2],
              jitter: 0.5,
              opacity: 0.85,
            });
        }
        return true;
      }
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "brewfest") {
      emit(h, {
        tex: FRIAR.cheers,
        n: 6,
        x: ev.x,
        y: gy + 2.6,
        z: ev.z,
        color: 0xffe090,
        size: [0.25, 0.4],
        life: [0.4, 0.6],
        speed: [0.5, 1.5],
        up: [0.5, 1.2],
        additive: true,
        jitter: 0.8,
      });
    }
  },
};
