// Ghost lantern: rises from a random pit (consumes World.rng), drifts to the nearest lantern spot, rests, then fades.
// The first hero to touch it is haunted for hauntSeconds (MapEvents.hauntMul boosts damage and speed).
import type { MapEvents } from "../mapEvents.ts";
import type { Entity } from "../types.ts";

export interface LanternDef {
  firstSeconds: number;
  everySeconds: number;
  riseSeconds: number;
  speed: number;
  restSeconds: number;
  spots: { x: number; z: number }[];
  hauntSeconds: number;
  damageMul: number;
  speedMul: number;
}

export interface Lantern {
  state: "rise" | "drift" | "rest";
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  tx: number;
  tz: number;
  start: number;
  id: number;
}

export function findPits(ev: MapEvents): { x: number; z: number }[] {
  const t = ev.w.terrain;
  const seen = new Uint8Array(t.width * t.depth);
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || t.styles[i] !== "pit") continue;
    const stack = [i];
    seen[i] = 1;
    let sx = 0;
    let sz = 0;
    let n = 0;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % t.width;
      const cz = Math.floor(c / t.width);
      sx += cx + 0.5;
      sz += cz + 0.5;
      n++;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = cx + dx;
        const zz = cz + dz;
        if (xx < 0 || zz < 0 || xx >= t.width || zz >= t.depth) continue;
        const j = zz * t.width + xx;
        if (!seen[j] && t.styles[j] === "pit") {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    out.push({ x: sx / n, z: sz / n });
  }
  return out;
}

export function updateLantern(ev: MapEvents, d: LanternDef): void {
  const w = ev.w;
  if (!ev.lantern) {
    if (w.time < ev.lanternAt || !ev.pits.length || !d.spots.length) return;
    const pit = ev.pits[Math.floor(w.rng() * ev.pits.length) % ev.pits.length];
    let spot = d.spots[0];
    let bd = Infinity;
    for (const s of d.spots) {
      const dd = Math.hypot(s.x - pit.x, s.z - pit.z);
      if (dd < bd) {
        bd = dd;
        spot = s;
      }
    }
    ev.lantern = {
      state: "rise",
      x: pit.x,
      z: pit.z,
      fromX: pit.x,
      fromZ: pit.z,
      tx: spot.x,
      tz: spot.z,
      start: w.time,
      id: ++ev.lanternSeq,
    };
    w.emit({
      type: "lantern",
      stage: "rise",
      x: pit.x,
      y: w.groundY(pit.x, pit.z),
      z: pit.z,
      id: ev.lanternSeq,
      hero: 0,
    });
    return;
  }
  const l = ev.lantern;
  const t = w.time - l.start;
  if (l.state === "rise" && t >= d.riseSeconds) {
    l.state = "drift";
    l.start = w.time;
  } else if (l.state === "drift") {
    const total = Math.hypot(l.tx - l.fromX, l.tz - l.fromZ);
    const k = Math.min(1, (t * d.speed) / (total || 1));
    const e = k * k * (3 - 2 * k);
    l.x = l.fromX + (l.tx - l.fromX) * e;
    l.z = l.fromZ + (l.tz - l.fromZ) * e;
    if (k >= 1) {
      l.state = "rest";
      l.start = w.time;
    }
  } else if (l.state === "rest" && t >= d.restSeconds) {
    w.emit({ type: "lantern", stage: "fade", x: l.x, y: w.groundY(l.x, l.z), z: l.z, id: l.id, hero: 0 });
    ev.lantern = null;
    ev.lanternAt = w.time + d.everySeconds;
    return;
  }
  if (l.state === "rise") return;
  let best: Entity | null = null;
  let bd = 1.7;
  for (const e of w.entities) {
    if (!e.alive || !e.hero || e.hero.dead) continue;
    const dd = Math.hypot(e.transform.pos.x - l.x, e.transform.pos.z - l.z);
    if (dd < bd || (dd === bd && best && e.id < best.id)) {
      bd = dd;
      best = e;
    }
  }
  if (!best) return;
  best.status.hauntUntil = w.time + d.hauntSeconds;
  w.emit({ type: "lantern", stage: "taken", x: l.x, y: w.groundY(l.x, l.z), z: l.z, id: l.id, hero: best.id });
  ev.lantern = null;
  ev.lanternAt = w.time + d.everySeconds;
}
