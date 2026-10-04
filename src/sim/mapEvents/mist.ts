// Rolling mist: every everySeconds a fog front sweeps across the map along z, holds, then rolls out. Cells near
// water (mistMask) under the band hide entities (see world/vision.ts).
import type { MapEvents } from "../mapEvents.ts";

export interface MistDef {
  firstSeconds: number;
  everySeconds: number;
  warnSeconds: number;
  rollSeconds: number;
  holdSeconds: number;
  pad: number;
  x0?: number;
  x1?: number;
}

export function misted(ev: MapEvents, x: number, z: number): boolean {
  const m = ev.mistMask;
  if (!m || !ev.mist) return false;
  const t = ev.w.terrain;
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= t.width || cz >= t.depth || !m[cz * t.width + cx]) return false;
  const [tail, front] = ev.mistBand(ev.w.time);
  return z < front && z > tail;
}

export function mistBand(ev: MapEvents, time: number): [number, number] {
  const d = ev.mist;
  if (!d) return [0, 0];
  const t = time - ev.mistStart;
  const span = ev.w.terrain.depth + 6;
  if (t < 0 || t > d.rollSeconds * 2 + d.holdSeconds) return [0, 0];
  const front = Math.min(1, t / d.rollSeconds) * span - 3;
  const tail =
    t > d.rollSeconds + d.holdSeconds ? ((t - d.rollSeconds - d.holdSeconds) / d.rollSeconds) * span - 3 : -Infinity;
  return [tail, front];
}

export function updateMist(ev: MapEvents, d: MistDef): void {
  const w = ev.w;
  if (!ev.mistWarned && w.time >= ev.mistAt - d.warnSeconds) {
    ev.mistWarned = true;
    w.emit({ type: "mist", stage: "warn", seconds: d.warnSeconds });
  }
  if (w.time >= ev.mistAt) {
    ev.mistStart = w.time;
    ev.mistOn = true;
    w.emit({ type: "mist", stage: "in", seconds: d.rollSeconds * 2 + d.holdSeconds });
    ev.mistAt = w.time + d.everySeconds;
    ev.mistWarned = false;
  }
  if (ev.mistOn && w.time > ev.mistStart + d.rollSeconds * 2 + d.holdSeconds) {
    ev.mistOn = false;
    w.emit({ type: "mist", stage: "out", seconds: 0 });
  }
}
