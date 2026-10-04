// Timed gates: gate slots (each defined once and rotated 4x around the map) belong to set "a" or "b"; `pattern`
// selects which set is shut, and flips every everySeconds. Shut gate cells become walls; anyone standing in one
// is pushed to the nearest open cell.
import type { MapEvents } from "../mapEvents.ts";
import type { World } from "../world.ts";
import { Kind, type Rect } from "../terrain.ts";

export interface GateSlot extends Rect {
  set: "a" | "b";
  cells?: [number, number][];
  line?: [number, number, number, number];
}

export interface GatesDef {
  firstSeconds: number;
  everySeconds: number;
  warnSeconds: number;
  slots: GateSlot[];
}

export function gateSlots(w: World, def: GatesDef): GateSlot[] {
  const D = w.terrain.depth;
  const out: GateSlot[] = [];
  for (const s of def.slots) {
    let r: GateSlot = { ...s };
    for (let k = 0; k < 4; k++) {
      out.push({ ...r });
      r = {
        ...r,
        x: D - r.z - r.h,
        z: r.x,
        w: r.h,
        h: r.w,
        cells: r.cells?.map(([x, z]) => [D - 1 - z, x] as [number, number]),
        line: r.line ? [D - r.line[1], r.line[0], D - r.line[3], r.line[2]] : undefined,
      };
    }
  }
  return out;
}

export function applyGates(ev: MapEvents, live: boolean): void {
  const w = ev.w;
  const t = w.terrain;
  const all: number[] = [];
  for (const g of ev.slots) {
    const shut = ev.closed(g.slot.set);
    g.cells.forEach((c, k) => {
      if (shut) {
        t.kinds[c] = Kind.Wall;
        t.styles[c] = "gate";
      } else if (t.styles[c] === "gate") {
        t.kinds[c] = g.prev[k];
        t.styles[c] = "";
      }
      all.push(c);
    });
  }
  w.nav.recompute(all);
  if (!live) return;
  for (const e of w.entities) {
    if (!e.alive || e.structure) continue;
    const p = e.transform.pos;
    const i = t.index(Math.floor(p.x), Math.floor(p.z));
    if (i < 0 || t.styles[i] !== "gate") continue;
    const o = w.nav.nearestOpen(p.x, p.z, 6);
    if (o >= 0) w.teleport(e, (o % w.nav.w) + 0.5, Math.floor(o / w.nav.w) + 0.5);
  }
  for (const e of w.entities) if (e.unit) e.unit.repathAt = 0;
}

export function updateGates(ev: MapEvents, g: GatesDef): void {
  const w = ev.w;
  if (!ev.gateWarned && w.time >= ev.gateAt - g.warnSeconds) {
    ev.gateWarned = true;
    w.emit({ type: "gates", stage: "warn", pattern: 1 - ev.pattern, seconds: g.warnSeconds });
  }
  if (w.time < ev.gateAt) return;
  ev.pattern = 1 - ev.pattern;
  applyGates(ev, true);
  w.emit({ type: "gates", stage: "shift", pattern: ev.pattern, seconds: g.everySeconds });
  ev.gateAt = w.time + g.everySeconds;
  ev.gateWarned = false;
}
