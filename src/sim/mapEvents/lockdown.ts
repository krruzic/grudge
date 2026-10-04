// Opening lockdown: every base gate (from world/bases.ts) is walled shut and each base box becomes a lock zone.
// While locked, entities can't move between zones (enforceLock snaps them back to their last in-zone position)
// and teleports/jumps across zones are refused (MapEvents.sealed). Gates reopen at lockUntil.
import type { MapEvents } from "../mapEvents.ts";
import { Kind } from "../terrain.ts";

export interface LockGate {
  team: number;
  cells: number[];
  prev: number[];
  prevStyle: string[];
  segs: [number, number, number, number][];
}

/** Wall segments (for rendering) covering a gate's cells along the base box edges. */
function gateSegs(
  cells: number[],
  W: number,
  box: [number, number, number, number],
): [number, number, number, number][] {
  const [x0, z0, x1, z1] = box;
  const rows = new Map<number, number[]>();
  const cols = new Map<number, number[]>();
  for (const c of cells) {
    const x = c % W;
    const z = Math.floor(c / W);
    if (z === z0 || z === z1) rows.set(z, [...(rows.get(z) ?? []), x]);
    else if (x === x0 || x === x1) cols.set(x, [...(cols.get(x) ?? []), z]);
    else rows.set(z, [...(rows.get(z) ?? []), x]);
  }
  const out: [number, number, number, number][] = [];
  const runs = (vals: number[], fn: (a: number, b: number) => void) => {
    vals.sort((a, b) => a - b);
    let a = vals[0];
    for (let k = 1; k <= vals.length; k++) {
      if (k < vals.length && vals[k] === vals[k - 1] + 1) continue;
      fn(a, vals[k - 1] + 1);
      a = vals[k];
    }
  };
  for (const [z, xs] of rows) runs(xs, (a, b) => out.push([a, z + 0.5, b, z + 0.5]));
  for (const [x, zs] of cols) runs(zs, (a, b) => out.push([x + 0.5, a, x + 0.5, b]));
  return out;
}

export function buildLock(ev: MapEvents, seconds: number, warn: number): void {
  const w = ev.w;
  const t = w.terrain;
  const W = t.width;
  const zone = new Int8Array(W * t.depth).fill(-1);
  const all: number[] = [];
  w.bases.forEach((b, team) => {
    if (!b.gates.length) return;
    const [x0, z0, x1, z1] = b.box;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) zone[z * W + x] = team;
    for (const g of b.gates) {
      for (const c of g) zone[c] = -1;
      ev.lockGates.push({
        team,
        cells: g.slice(),
        prev: g.map((c) => t.kinds[c]),
        prevStyle: g.map((c) => t.styles[c]),
        segs: gateSegs(g, W, b.box),
      });
      all.push(...g);
    }
  });
  if (!ev.lockGates.length) return;
  for (const c of all) {
    t.kinds[c] = Kind.Wall;
    t.styles[c] = "lockgate";
  }
  w.nav.recompute(all);
  ev.lockZone = zone;
  ev.lockUntil = seconds;
  ev.lockWarn = warn;
}

export function endLockdown(ev: MapEvents, announce: boolean): void {
  if (!ev.lockZone) return;
  const w = ev.w;
  const t = w.terrain;
  const all: number[] = [];
  for (const g of ev.lockGates) {
    g.cells.forEach((c, k) => {
      if (t.styles[c] !== "lockgate") return;
      t.kinds[c] = g.prev[k];
      t.styles[c] = g.prevStyle[k];
      all.push(c);
    });
  }
  w.nav.recompute(all);
  ev.lockZone = null;
  ev.anchors.clear();
  ev.lockUntil = Math.min(ev.lockUntil, w.time);
  for (const e of w.entities) if (e.unit) e.unit.repathAt = 0;
  if (announce) {
    w.emit({ type: "gates", stage: "shift", pattern: ev.pattern, seconds: 0, lock: true });
    w.emit({ type: "notice", team: -1, text: "THE GATES OPEN" });
  }
}

export function updateLock(ev: MapEvents): void {
  const w = ev.w;
  if (!ev.lockWarned && w.time >= ev.lockUntil - ev.lockWarn) {
    ev.lockWarned = true;
    w.emit({
      type: "gates",
      stage: "warn",
      pattern: ev.pattern,
      seconds: Math.max(0, ev.lockUntil - w.time),
      lock: true,
    });
  }
  if (w.time >= ev.lockUntil) ev.endLockdown(true);
}

export function enforceLock(ev: MapEvents): void {
  if (!ev.lockZone) return;
  const w = ev.w;
  for (const e of w.entities) {
    if (!e.alive || e.structure) continue;
    const p = e.transform.pos;
    const a = ev.anchors.get(e.id);
    if (a && ev.zoneAt(a[0], a[1]) !== ev.zoneAt(p.x, p.z)) {
      if (e.hero) {
        e.hero.jump = undefined;
        if (e.hero.action?.kind === "leap") e.hero.action.toX = e.hero.action.toZ = undefined;
      }
      w.teleport(e, a[0], a[1]);
      ev.shutNotice(e);
      continue;
    }
    ev.anchors.set(e.id, [p.x, p.z]);
  }
}
