// Rolling mist (sim/mapEvents/mist.ts): spawns drifting fog puffs over the mist cells currently covered by the
// band, so the fog that hides entities is visible.
import { FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import type { MapFx } from "./mapFx";

export function syncMist(mf: MapFx, dt: number): void {
  const w = mf.world;
  if (!mf.fx || !mf.mistCells.length) return;
  const [tail, front] = w.mapEvents.mistBand(w.time);
  if (front <= tail) return;
  mf.mistAcc += dt;
  const W = w.terrain.width;
  const n = Math.floor(mf.mistAcc * 70);
  if (!n) return;
  mf.mistAcc -= n / 70;
  for (let k = 0; k < n; k++) {
    const c = mf.mistCells[Math.floor(Math.random() * mf.mistCells.length)];
    const x = (c % W) + Math.random();
    const z = Math.floor(c / W) + Math.random();
    if (z > front || z < tail) continue;
    const lead = front - z < 4;
    emit(mf.fx, {
      tex: FX.smoke,
      n: 1,
      x,
      y: Math.max(w.groundY(x, z), w.terrain.waterLevel) + 1.0 + Math.random() * 0.9,
      z,
      size: [3.8, 5.6],
      grow: 1.3,
      life: [2.4, 3.2],
      speed: [0.15, 0.5],
      dir: { x: 0, y: 0.05, z: 1 },
      cone: 1.2,
      opacity: lead ? 0.3 : 0.22,
      color: 0xf2f6f8,
      depthTest: false,
      order: 5,
    });
  }
}
