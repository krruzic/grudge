// Avalanche (frostcross): four lanes (one base lane rotated 90 degrees around the map), each with a sweep
// direction. Capturing a horn (a lone team's heroes standing on it for hornCapture seconds) arms the avalanche on
// the rival arm with the most enemy units; otherwise lanes fire in rotation every everySeconds. The sweep damages
// and slows everything it passes, then leaves slow snow drifts (ford cells) for driftSeconds.
import type { MapEvents } from "../mapEvents.ts";
import type { World } from "../world.ts";
import { Kind, type Rect } from "../terrain.ts";

export interface AvalancheDef {
  firstSeconds: number;
  everySeconds: number;
  warnSeconds: number;
  sweepSeconds: number;
  driftSeconds: number;
  lane: Rect;
  from: "n" | "s" | "w" | "e";
  heroDamage: number;
  unitDamage: number;
  knock: number;
}

export interface Lane {
  rect: Rect;
  dx: number;
  dz: number;
}

export interface Slide {
  lane: Lane;
  arm: number;
  start: number;
  hit: Set<number>;
}

const DIRS: Record<AvalancheDef["from"], [number, number]> = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };

export function avalancheLanes(w: World, def: AvalancheDef): Lane[] {
  const D = w.terrain.depth;
  const out: Lane[] = [];
  let r = { ...def.lane };
  let [dx, dz] = DIRS[def.from];
  for (let k = 0; k < 4; k++) {
    out.push({ rect: { ...r }, dx, dz });
    r = { x: D - r.z - r.h, z: r.x, w: r.h, h: r.w };
    [dx, dz] = [-dz, dx];
  }
  return out;
}

export function updateHorns(ev: MapEvents, av: AvalancheDef): void {
  const w = ev.w;
  const dt = w.dt;
  ev.horns.forEach((h, i) => {
    if (w.time < h.readyAt) {
      h.progress = 0;
      return;
    }
    const near = new Set<number>();
    for (const e of w.entities) {
      if (!e.alive || !e.hero || e.hero.dead) continue;
      if (Math.hypot(e.transform.pos.x - h.x, e.transform.pos.z - h.z) <= 2.6) near.add(e.team);
    }
    if (near.size !== 1) {
      h.progress = Math.max(0, h.progress - dt);
      return;
    }
    const team = [...near][0];
    if (team !== h.team) {
      h.team = team;
      h.progress = 0;
    }
    h.progress += dt;
    if (h.progress < ev.hornCapture) return;
    h.progress = 0;
    if (ev.slide || ev.warned) return;
    const rivals = h.arms.filter((a) => a !== team);
    let arm = rivals[0];
    if (rivals.length > 1) {
      let best = -1;
      for (const a of rivals) {
        const r = ev.lanes[a].rect;
        const n = w.entities.filter(
          (e) =>
            e.alive &&
            e.unit &&
            !e.neutral &&
            e.team !== team &&
            e.transform.pos.x >= r.x &&
            e.transform.pos.x <= r.x + r.w &&
            e.transform.pos.z >= r.z &&
            e.transform.pos.z <= r.z + r.h,
        ).length;
        if (n > best) {
          best = n;
          arm = a;
        }
      }
    }
    h.readyAt = w.time + ev.hornCooldown;
    ev.arm = arm;
    ev.nextAt = w.time + av.warnSeconds;
    ev.warned = false;
    w.emit({ type: "horn", stage: "blow", horn: i, team, arm, x: h.x, y: w.groundY(h.x, h.z), z: h.z });
  });
}

export function updateAvalanche(ev: MapEvents, av: AvalancheDef): void {
  const w = ev.w;
  const lane = ev.lanes[ev.arm];
  if (!ev.warned && w.time >= ev.nextAt - av.warnSeconds) {
    ev.warned = true;
    w.emit({
      type: "avalanche",
      stage: "warn",
      arm: ev.arm,
      rect: lane.rect,
      dx: lane.dx,
      dz: lane.dz,
      seconds: av.warnSeconds,
    });
  }
  if (!ev.slide && w.time >= ev.nextAt) {
    ev.slide = { lane, arm: ev.arm, start: w.time, hit: new Set() };
    w.emit({
      type: "avalanche",
      stage: "slide",
      arm: ev.arm,
      rect: lane.rect,
      dx: lane.dx,
      dz: lane.dz,
      seconds: av.sweepSeconds,
    });
  }
  if (ev.slide) sweep(ev, av, ev.slide);
  for (let i = ev.drifts.length - 1; i >= 0; i--) {
    const d = ev.drifts[i];
    if (w.time < d.until) continue;
    for (const c of d.cells) if (w.terrain.kinds[c] === Kind.Ford) w.terrain.kinds[c] = Kind.Ground;
    w.nav.recompute(d.cells);
    for (const e of w.entities) if (e.unit) e.unit.repathAt = 0;
    ev.drifts.splice(i, 1);
  }
}

export function sweep(ev: MapEvents, av: AvalancheDef, s: Slide): void {
  const w = ev.w;
  const { rect, dx, dz } = s.lane;
  const k = Math.min(1, (w.time - s.start) / av.sweepSeconds);
  const span = dx !== 0 ? rect.w : rect.h;
  const front = k * (span + 4) - 2;
  for (const e of w.entities) {
    if (!e.alive || e.structure || s.hit.has(e.id)) continue;
    const p = e.transform.pos;
    if (p.x < rect.x - 0.5 || p.x > rect.x + rect.w + 0.5 || p.z < rect.z - 0.5 || p.z > rect.z + rect.h + 0.5)
      continue;
    const along =
      dx > 0 ? p.x - rect.x : dx < 0 ? rect.x + rect.w - p.x : dz > 0 ? p.z - rect.z : rect.z + rect.h - p.z;
    if (along > front || along < front - 4) continue;
    s.hit.add(e.id);
    const dmg = e.hero ? av.heroDamage : e.maxHp * av.unitDamage;
    w.damage(null, e, dmg, {
      fromX: p.x - dx * 2,
      fromZ: p.z - dz * 2,
      knockback: av.knock,
      slowMul: 0.55,
      slowSeconds: 2.5,
      big: true,
    });
  }
  if (k < 1) return;
  const cells: number[] = [];
  const t = w.terrain;
  for (let z = rect.z; z < rect.z + rect.h; z++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = t.index(x, z);
      if (i >= 0 && t.kinds[i] === Kind.Ground) {
        t.kinds[i] = Kind.Ford;
        cells.push(i);
      }
    }
  }
  w.nav.recompute(cells);
  for (const e of w.entities) if (e.unit) e.unit.repathAt = 0;
  ev.drifts.push({ cells, until: w.time + av.driftSeconds });
  w.emit({ type: "avalanche", stage: "settle", arm: s.arm, rect, dx, dz, seconds: av.driftSeconds });
  ev.slide = null;
  ev.warned = false;
  ev.arm = (ev.arm + 1) % 4;
  ev.nextAt = w.time + av.everySeconds;
}
