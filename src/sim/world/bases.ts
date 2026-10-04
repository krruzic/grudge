// Team bases: the castle footprint around each core (computed once at world creation), where defenders stand,
// where a team's default hold point is, and the slot offsets used by commander formations.
import type { World } from "../world.ts";
import type { Entity, Vec2 } from "../types.ts";

/** Castle footprint of one team: walkable cells inside the walls, gate openings and their defend posts. */
export interface BaseInfo {
  mask: Uint8Array;
  entrances: Vec2[];
  gates: number[][];
  box: [number, number, number, number];
}

/** A map jump pad (launch at x/z, land at tx/tz) and its charge/cooldown timestamps. */
export interface JumpPad {
  x: number;
  z: number;
  tx: number;
  tz: number;
  launchAt: number;
  chargeAt: number;
  readyAt: number;
  failAt: number;
}

/**
 * Derive a team's base from the map: (1) find the castle-styled wall segments nearest its core (within 14, then 18
 * cells, ignoring segments closer to an enemy core) and take their bounding box; (2) flood-fill walkable cells from
 * the core inside that box -> `mask`; (3) mask cells with a walkable neighbour outside the box are exits, clustered
 * into `gates`; (4) each gate gets a defend post ~2 cells inward from its centroid.
 */
export function computeBase(w: World, team: number): BaseInfo {
  const nav = w.nav;
  const W = nav.w;
  const D = nav.d;
  const mask = new Uint8Array(W * D);
  const own = w.terrain.cores.find((k) => (k.team ?? 0) === team);
  const foe = w.terrain.cores.find((k) => (k.team ?? 0) !== team);
  if (!own) return { mask, entrances: [], gates: [], box: [0, 0, -1, -1] };
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const castle = (i: number) => i >= 0 && w.terrain.styles[i] === "castle";
  // (1) castle wall bounding box
  for (const reach of [14, 18]) {
    if (x0 !== Infinity) break;
    const visited = new Uint8Array(W * D);
    for (let i = 0; i < W * D; i++) {
      if (visited[i] || !castle(i)) continue;
      const seg = [i];
      visited[i] = 1;
      let near = Infinity;
      let mine = true;
      for (let q = 0; q < seg.length; q++) {
        const c = seg[q];
        const cx = (c % W) + 0.5;
        const cz = Math.floor(c / W) + 0.5;
        const d = Math.hypot(cx - own.x, cz - own.z);
        near = Math.min(near, d);
        if (foe && Math.hypot(cx - foe.x, cz - foe.z) < d) mine = false;
        for (const n of [
          nav.index((c % W) + 1, Math.floor(c / W)),
          nav.index((c % W) - 1, Math.floor(c / W)),
          nav.index(c % W, Math.floor(c / W) + 1),
          nav.index(c % W, Math.floor(c / W) - 1),
        ]) {
          if (castle(n) && !visited[n]) {
            visited[n] = 1;
            seg.push(n);
          }
        }
      }
      if (!mine || near > reach) continue;
      for (const c of seg) {
        x0 = Math.min(x0, c % W);
        z0 = Math.min(z0, Math.floor(c / W));
        x1 = Math.max(x1, c % W);
        z1 = Math.max(z1, Math.floor(c / W));
      }
    }
  }
  if (x0 === Infinity) {
    // No castle walls: fall back to a 20x20 box around the core.
    x0 = own.x - 10;
    x1 = own.x + 10;
    z0 = own.z - 10;
    z1 = own.z + 10;
  }
  x0 = Math.max(0, Math.min(x0, Math.floor(own.x) - 3));
  z0 = Math.max(0, Math.min(z0, Math.floor(own.z) - 3));
  x1 = Math.min(W - 1, Math.max(x1, Math.floor(own.x) + 3));
  z1 = Math.min(D - 1, Math.max(z1, Math.floor(own.z) + 3));
  const inBox = (cx: number, cz: number) => cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1;
  // (2) flood fill from the cells around the core
  const seeds: number[] = [];
  const r = Math.ceil(w.data.structures.core.radius + 1.5);
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const i = nav.index(Math.floor(own.x) + dx, Math.floor(own.z) + dz);
      if (nav.open(i) && !mask[i]) {
        mask[i] = 1;
        seeds.push(i);
      }
    }
  }
  for (let q = 0; q < seeds.length; q++) {
    const c = seeds[q];
    const cx = c % W;
    const cz = Math.floor(c / W);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = nav.index(cx + dx, cz + dz);
        if (n < 0 || mask[n] || !inBox(cx + dx, cz + dz) || !nav.passable(c, n)) continue;
        mask[n] = 1;
        seeds.push(n);
      }
    }
  }
  // (3) exit cells, grouped into gates (cells within 2 of each other)
  const edge: number[] = [];
  for (const c of seeds) {
    const cx = c % W;
    const cz = Math.floor(c / W);
    let out = false;
    for (let dz = -1; dz <= 1 && !out; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = nav.index(cx + dx, cz + dz);
        if (n >= 0 && !mask[n] && !inBox(cx + dx, cz + dz) && nav.passable(c, n)) {
          out = true;
          break;
        }
      }
    }
    if (out) edge.push(c);
  }
  const seen = new Uint8Array(W * D);
  const entrances: Vec2[] = [];
  const gates: number[][] = [];
  const isEdge = new Uint8Array(W * D);
  for (const c of edge) isEdge[c] = 1;
  for (const c of edge) {
    if (seen[c]) continue;
    const group = [c];
    seen[c] = 1;
    for (let q = 0; q < group.length; q++) {
      const g = group[q];
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const n = nav.index((g % W) + dx, Math.floor(g / W) + dz);
          if (n >= 0 && isEdge[n] && !seen[n]) {
            seen[n] = 1;
            group.push(n);
          }
        }
      }
    }
    // (4) defend post: step 2 cells from the gate centroid toward the core, else the gate cell nearest the centroid
    let mx = 0;
    let mz = 0;
    for (const g of group) {
      mx += (g % W) + 0.5;
      mz += Math.floor(g / W) + 0.5;
    }
    mx /= group.length;
    mz /= group.length;
    const dx = own.x - mx;
    const dz = own.z - mz;
    const dl = Math.hypot(dx, dz) || 1;
    let px = mx + (dx / dl) * 2;
    let pz = mz + (dz / dl) * 2;
    const pi = nav.index(Math.floor(px), Math.floor(pz));
    if (!(pi >= 0 && mask[pi])) {
      let best = group[0];
      let bd = Infinity;
      for (const g of group) {
        const d = Math.hypot((g % W) + 0.5 - mx, Math.floor(g / W) + 0.5 - mz);
        if (d < bd) {
          bd = d;
          best = g;
        }
      }
      px = (best % W) + 0.5;
      pz = Math.floor(best / W) + 0.5;
    }
    entrances.push({ x: px, z: pz });
    gates.push(group);
  }
  return { mask, entrances, gates, box: [x0, z0, x1, z1] };
}

/** Default hold/defend point: up to 12 cells from the core toward the map centre. */
export function defaultHold(w: World, team: number): Vec2 {
  const c = w.terrain.cores.find((k) => k.team === team) ?? { x: 10, z: 24 };
  const dx = w.terrain.width / 2 - c.x;
  const dz = w.terrain.depth / 2 - c.z;
  const d = Math.hypot(dx, dz) || 1;
  const step = Math.min(12, d * 0.6);
  return { x: c.x + (dx / d) * step, z: c.z + (dz / d) * step };
}

/**
 * Post for a unit on "defend": defenders are sorted heavy -> grunt -> ranged (then id) and dealt round-robin to the
 * base gates; `rank` is how many rows deep they stand. Assignment is cached for the current tick.
 */
export function defendPost(w: World, e: Entity): { post: Vec2; rank: number } {
  if (w.posts.tick !== w.tick) {
    w.posts.tick = w.tick;
    w.posts.of.clear();
    const order: Record<string, number> = { heavy: 0, grunt: 1, ranged: 2 };
    for (let team = 0; team < w.teamCount; team++) {
      const n = w.bases[team].entrances.length;
      if (!n) continue;
      const dirs = w.teams[team].directives;
      const list = w.entities.filter(
        (o) => o.alive && o.unit && !o.neutral && o.team === team && dirs[o.unit.type] === "defend",
      );
      list.sort((a, b) => (order[a.unit!.type] ?? 3) - (order[b.unit!.type] ?? 3) || a.id - b.id);
      list.forEach((o, k) => w.posts.of.set(o.id, [k % n, Math.floor(k / n)]));
    }
  }
  const a = w.posts.of.get(e.id);
  const base = w.bases[e.team];
  if (!a || !base.entrances.length) return { post: defaultHold(w, e.team), rank: e.unit?.slot ?? 0 };
  return { post: base.entrances[a[0]], rank: a[1] };
}

/**
 * Offset from `anchor` for a unit's slot in its team's commander formation (null for "mass" or non-units).
 * Units are grouped by (team, directive, hold point), sorted heavy -> grunt -> ranged, and laid out facing the
 * nearest enemy core: column = single file behind, line = rows of 3-8, wedge = triangle rows. `leash` scales how
 * tightly the unit sticks to its slot.
 */
export function formationOffset(w: World, e: Entity, anchor: Vec2): { x: number; z: number; leash: number } | null {
  const ts = w.teams[e.team];
  const f = ts.formation ?? "mass";
  if (f === "mass" || !e.unit) return null;
  if (w.forms.tick !== w.tick) {
    w.forms.tick = w.tick;
    w.forms.of.clear();
    const groups = new Map<string, Entity[]>();
    const order: Record<string, number> = { heavy: 0, grunt: 1, ranged: 2 };
    for (const o of w.entities) {
      if (!o.alive || !o.unit || o.neutral) continue;
      const dir = w.teams[o.team].directives[o.unit.type];
      const hp = w.teams[o.team].directives.holdPoint[o.unit.type];
      const key = `${o.team}|${dir}|${dir === "hold" && hp ? `${hp.x.toFixed(1)},${hp.z.toFixed(1)}` : ""}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(o);
    }
    for (const g of groups.values()) {
      g.sort((a, b) => (order[a.unit!.type] ?? 3) - (order[b.unit!.type] ?? 3) || a.id - b.id);
      g.forEach((o, i) => w.forms.of.set(o.id, [i, g.length]));
    }
  }
  const slot = w.forms.of.get(e.id);
  if (!slot) return null;
  const [i, n] = slot;
  const foe = w.foeCore(e.team, anchor.x, anchor.z);
  let hx = 1;
  let hz = 0;
  if (foe) {
    const dx = foe.transform.pos.x - anchor.x;
    const dz = foe.transform.pos.z - anchor.z;
    const d = Math.hypot(dx, dz) || 1;
    hx = dx / d;
    hz = dz / d;
  }
  let right = 0;
  let fwd = 0;
  let leash = 1;
  if (f === "column") {
    fwd = -(i + 1) * 1.15;
    right = i % 2 ? 0.35 : -0.35;
  } else if (f === "line") {
    const per = Math.min(8, Math.max(3, Math.ceil(n / 2)));
    const row = Math.floor(i / per);
    const col = i % per;
    const inRow = Math.min(per, n - row * per);
    right = (col - (inRow - 1) / 2) * 1.3;
    fwd = 1.6 - row * 1.4;
    leash = 0.75;
  } else {
    let r = 0;
    while (((r + 1) * (r + 2)) / 2 <= i) r++;
    const col = i - (r * (r + 1)) / 2;
    right = (col - r / 2) * 1.35;
    fwd = 2.6 - r * 1.2;
    leash = 1.3;
  }
  return { x: hx * fwd - hz * right, z: hz * fwd + hx * right, leash };
}
