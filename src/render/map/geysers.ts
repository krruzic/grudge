// Cider wells (Russet Hollow): the warning bubble-up and the eruption column for MapEvents geysers.
// Warn: steam and amber bubbles rise from the well with a pulsing amber ring for `seconds`. Erupt: a tall column
// of cider spray and foam, a splash ring and a burst of steam; the sticky mud left behind is a "cider" zone decal
// (hazards/zones.ts).
import * as THREE from "three";
import { FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { cacheCanvas } from "../../ui/cacheCanvas";
import type { MapFx } from "./mapFx";

const CIDER = 0xe8902c;
const FOAM = 0xfff0c8;

/** Soft amber ring painted once (warning telegraph under a well about to blow). */
const ringTex = (() => {
  const c = cacheCanvas();
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 70, 128, 128, 126);
  grad.addColorStop(0, "rgba(255,180,80,0)");
  grad.addColorStop(0.75, "rgba(255,170,60,0.85)");
  grad.addColorStop(0.9, "rgba(255,230,160,0.95)");
  grad.addColorStop(1, "rgba(255,180,80,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

export function onGeyser(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const h = mf.fx;
  if (!h) return;
  const x = ev.x as number;
  const y = ev.y as number;
  const z = ev.z as number;
  if (ev.stage === "warn") {
    const secs = (ev.seconds as number) ?? 4;
    decal(h, ringTex, x, y + 0.05, z, 2.6, secs, { grow: 0.15, spin: 0.6, additive: true, opacity: 0.9 });
    // Bubbling that builds toward the eruption.
    const n = Math.round(secs * 8);
    for (let i = 0; i < n; i++)
      h.after((i / n) * secs, () => {
        const k = i / n;
        emit(h, {
          tex: FX.smoke,
          n: 1,
          x,
          y: y + 0.8,
          z,
          size: [0.5 + k * 0.6, 0.9 + k * 0.8],
          grow: 1.8,
          life: [0.8, 1.2],
          speed: [0.3, 0.8],
          up: [1.2, 2.2 + k * 2],
          jitter: 0.6,
          color: 0xfff2dc,
          opacity: 0.55,
        });
        emit(h, {
          tex: FX.splash,
          n: 1 + Math.round(k * 2),
          x,
          y: y + 0.9,
          z,
          size: [0.18, 0.32],
          life: [0.35, 0.55],
          speed: [0.8, 1.6 + k * 2],
          up: [1.5, 2.5 + k * 3],
          gravity: 9,
          jitter: 0.5,
          color: CIDER,
        });
      });
    return;
  }
  if (ev.stage !== "erupt") return;
  // The column: a fountain of cider spray rising ~7 m, foam caps and spatter falling back around the well.
  for (let k = 0; k < 6; k++)
    h.after(k * 0.06, () =>
      emit(h, {
        tex: FX.splash,
        n: 8,
        x,
        y: y + 0.9,
        z,
        size: [0.45, 0.85],
        grow: 1.4,
        life: [0.9, 1.3],
        speed: [8, 12],
        dir: { x: 0, y: 1, z: 0 },
        cone: 0.18,
        gravity: 11,
        color: k % 2 ? FOAM : CIDER,
      }),
    );
  emit(h, {
    tex: FX.splash,
    n: 26,
    x,
    y: y + 1,
    z,
    size: [0.25, 0.5],
    life: [0.7, 1.1],
    speed: [3, 7],
    up: [4, 8],
    gravity: 12,
    jitter: 0.6,
    color: CIDER,
  });
  emit(h, {
    tex: FX.smoke,
    n: 10,
    x,
    y: y + 1.2,
    z,
    size: [1.2, 2.0],
    grow: 2,
    life: [1.2, 1.8],
    speed: [1, 2.5],
    up: [2, 4],
    jitter: 0.8,
    color: 0xfff4e4,
    opacity: 0.6,
  });
  decal(h, ringTex, x, y + 0.06, z, 3.2, 0.7, { grow: 0.8, additive: true, opacity: 0.8 });
  h.shake = Math.max(h.shake, 0.25);
}
