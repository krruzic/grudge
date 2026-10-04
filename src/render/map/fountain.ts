// Healing fountain: four spray jets around the basin.
import { FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import type { MapFx } from "./mapFx";

export function syncFountain(mf: MapFx, dt: number): void {
  const f = mf.fountain;
  if (!f || !mf.fx) return;
  mf.sprayAcc += dt;
  if (mf.sprayAcc < 0.07) return;
  mf.sprayAcc = 0;
  const y = mf.world.groundY(f.x + f.r, f.z);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * (Math.PI / 2);
    const x = f.x + Math.cos(a) * 4.75;
    const z = f.z + Math.sin(a) * 4.75;
    emit(mf.fx, {
      tex: FX.splash,
      n: 1,
      x,
      y: y + 1.9,
      z,
      size: [0.55, 0.85],
      grow: 1.3,
      life: [0.55, 0.75],
      speed: [2.6, 3.2],
      dir: { x: -Math.cos(a), y: 1.3, z: -Math.sin(a) },
      cone: 0.12,
      gravity: 9,
      opacity: 0.8,
      color: 0xd8f0ff,
    });
  }
}
