// Cider wells (Russet Hollow): wells in two groups ("a" / "b") that take turns erupting every everySeconds.
// A group warns for warnSeconds (bubbling), then erupts: every hero or soldier standing within `radius` of an
// erupting well is flung along that well's fixed arc to its landing point (heroes ride a jump arc; soldiers are
// thrown with knockback), takes `damage` from no one (neutral hazard), and the well leaves a cider-mud zone that
// slows everyone for mudSeconds. Wells are authored for the map's west half and mirrored like props.
import type { MapEvents } from "../mapEvents.ts";
import type { Entity } from "../types.ts";

export interface GeyserWell {
  x: number;
  z: number;
  tx: number;
  tz: number;
  group: "a" | "b";
}

export interface GeysersDef {
  firstSeconds: number;
  everySeconds: number;
  warnSeconds: number;
  radius: number;
  damage: number;
  flight: number;
  peak: number;
  mudSeconds: number;
  mudRadius: number;
  mudSlow: number;
  wells: GeyserWell[];
}

/** Authored wells plus their mirrored copies (map mirror "x" or "rot"), in a fixed order. */
export function geyserWells(ev: MapEvents, g: GeysersDef): GeyserWell[] {
  const t = ev.w.terrain;
  const W = t.width;
  const D = t.depth;
  const out: GeyserWell[] = [];
  for (const wl of g.wells) {
    out.push(wl);
    if (t.symmetry === "x") out.push({ ...wl, x: W - wl.x, tx: W - wl.tx });
    else if (t.symmetry === "rot") out.push({ ...wl, x: W - wl.x, z: D - wl.z, tx: W - wl.tx, tz: D - wl.tz });
  }
  return out;
}

export function updateGeysers(ev: MapEvents, g: GeysersDef): void {
  const w = ev.w;
  const group = ev.geyserGroup;
  if (!ev.geyserWarned && w.time >= ev.geyserAt - g.warnSeconds) {
    ev.geyserWarned = true;
    ev.geyserWells.forEach((wl, i) => {
      if (wl.group === group)
        w.emit({
          type: "geyser",
          stage: "warn",
          id: i,
          x: wl.x,
          y: w.groundY(wl.x, wl.z),
          z: wl.z,
          seconds: g.warnSeconds,
        });
    });
  }
  if (w.time < ev.geyserAt) return;
  ev.geyserWells.forEach((wl, i) => {
    if (wl.group === group) erupt(ev, g, wl, i);
  });
  ev.geyserGroup = group === "a" ? "b" : "a";
  ev.geyserAt = w.time + g.everySeconds;
  ev.geyserWarned = false;
}

function erupt(ev: MapEvents, g: GeysersDef, wl: GeyserWell, id: number): void {
  const w = ev.w;
  w.emit({ type: "geyser", stage: "erupt", id, x: wl.x, y: w.groundY(wl.x, wl.z), z: wl.z, seconds: g.mudSeconds });
  const riders: Entity[] = [];
  for (const e of w.entities) {
    if (!e.alive || e.structure || e.neutral || e.hero?.dead || e.hero?.jump) continue;
    if (Math.hypot(e.transform.pos.x - wl.x, e.transform.pos.z - wl.z) - e.radius * 0.5 > g.radius) continue;
    riders.push(e);
  }
  for (const e of riders) {
    if (e.hero) {
      // Heroes ride the eruption to the well's landing point (scattered a little so a group doesn't stack).
      const k = riders.indexOf(e);
      const tx = wl.tx + Math.sin(k * 2.4) * 1.2 * Math.min(1, k);
      const tz = wl.tz + Math.cos(k * 2.4) * 1.2 * Math.min(1, k);
      w.damage(null, e, g.damage, { tick: true, noFlinch: true });
      if (e.alive && w.startJump(e, tx, tz, g.flight, g.peak)) {
        e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.2);
        continue;
      }
      if (!e.alive) continue;
    }
    const dx = wl.tx - wl.x;
    const dz = wl.tz - wl.z;
    const d = Math.hypot(dx, dz) || 1;
    w.damage(null, e, g.damage, {
      fromX: wl.x - dx / d,
      fromZ: wl.z - dz / d,
      knockback: 26,
      stun: 0.6,
      big: true,
    });
  }
  w.zones.push({
    id: w.newId(),
    team: -1,
    ownerId: 0,
    x: wl.x,
    z: wl.z,
    radius: g.mudRadius,
    until: w.time + g.mudSeconds,
    dps: 0,
    slowMul: g.mudSlow,
    style: "cider",
  });
}
