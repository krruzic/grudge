// Surround: procedural scenery outside the playable map (hills, mountains, rivers, roads, fields, islands and
// placed props) in one of five styles. Purely decorative - used by the renderer (src/render/mapView.ts,
// terrainMesh.ts) and baked by tools/bake-map.ts; the simulation never reads it. Layout is mirrored with the map's
// symmetry so both sides look alike. Style-specific design/height/paint/feature code lives in surround/styles/*.
import type { Terrain } from "./terrain.ts";
import { lerp, noise, smooth } from "./surround/noise.ts";
import { line, near, type Line } from "./surround/lines.ts";
import { exits, type Exit } from "./surround/exits.ts";
import { designValley, valleyFeatures, valleyH, valleyPaint } from "./surround/styles/valley.ts";
import { cragFeatures, cragH, cragPaint, designCrag } from "./surround/styles/crag.ts";
import { designSea, seaFeatures, seaH, seaPaint } from "./surround/styles/sea.ts";
import { alpineFeatures, alpineH, alpinePaint, designAlpine } from "./surround/styles/alpine.ts";
import { designGarden, gardenFeatures, gardenH, gardenPaint } from "./surround/styles/garden.ts";

export type { Exit } from "./surround/exits.ts";

export type SurroundStyle = "valley" | "crag" | "sea" | "alpine" | "garden";

export interface SFeature {
  t: string;
  x: number;
  z: number;
  y: number;
  rot: number;
  s: number;
  side: number;
  seed: number;
  w?: number;
  d?: number;
  h?: number;
  c?: string;
}

export interface Paint {
  grass: number;
  dirt: number;
  sand?: number;
  rock: number;
  cobble: number;
  tint: [number, number, number];
}

export interface Field {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  rot: number;
  crop: "wheat" | "plow" | "green" | "fallow";
}

export interface Spot {
  x: number;
  z: number;
  r: number;
}

export class Surround {
  readonly style: SurroundStyle;
  /** How far the surround extends past the map edge. */
  readonly far = 400;
  readonly features: SFeature[] = [];
  readonly water: boolean;
  readonly exits: Exit[];
  W: number;
  D: number;
  // Layout produced by the style's design step (shared with surround/styles/*).
  rivers: Line[] = [];
  roads: Line[] = [];
  lakes: { x: number; z: number; rx: number; rz: number }[] = [];
  fields: Field[] = [];
  clearings: Spot[] = [];
  islands: Spot[] = [];
  /** Noise seed derived from the map size. */
  seed: number;

  constructor(
    readonly t: Terrain,
    style: SurroundStyle,
    /** Map symmetry; every placed river/road/feature is replicated through it (see sym). */
    readonly mirror: "x" | "diag" | "rot" | "quad" | "none",
  ) {
    this.style = style;
    this.W = t.width;
    this.D = t.depth;
    this.seed = t.width * 7 + t.depth * 13;
    this.exits = exits(t);
    this.water = style === "valley" || style === "sea" || style === "garden";
    if (style === "valley") designValley(this);
    else if (style === "crag") designCrag(this);
    else if (style === "alpine") designAlpine(this);
    else if (style === "garden") designGarden(this);
    else designSea(this);
  }

  /** Scenery props (trees, rocks, buildings...), placed lazily on first request. */
  buildFeatures(): SFeature[] {
    if (!this.features.length) this.placeFeatures();
    return this.features;
  }

  /** All symmetric copies of a point under the map's mirror mode (the input point first). */
  sym(x: number, z: number): [number, number][] {
    const { W, D } = this;
    if (this.mirror === "x")
      return [
        [x, z],
        [W - x, z],
      ];
    if (this.mirror === "diag")
      return [
        [x, z],
        [z, x],
      ];
    if (this.mirror === "rot")
      return [
        [x, z],
        [W - x, D - z],
      ];
    if (this.mirror === "quad")
      return [
        [x, z],
        [D - z, x],
        [W - x, D - z],
        [z, W - x],
      ];
    return [[x, z]];
  }

  /** A polyline plus its mirrored copies. */
  symLine(ctrl: [number, number][], w0: number, w1 = w0): Line[] {
    const sets: [number, number][][] = [[], [], [], []];
    for (const [x, z] of ctrl) this.sym(x, z).forEach((m, k) => sets[k].push(m));
    return sets.filter((s) => s.length).map((s) => line(s, w0, w1));
  }

  /** Distance from the map rectangle (0 inside). */
  boxDist(x: number, z: number): number {
    const dx = Math.max(0 - x, 0, x - this.W);
    const dz = Math.max(0 - z, 0, z - this.D);
    return Math.hypot(dx, dz);
  }

  /** Point `out` units beyond the map edge at an exit (negative = inside). */
  exitPoint(e: Exit, out: number): [number, number] {
    if (e.edge === "n") return [e.at, -out];
    if (e.edge === "s") return [e.at, this.D + out];
    if (e.edge === "w") return [-out, e.at];
    return [this.W + out, e.at];
  }

  valleyAxis: Line[] = [];

  cirques: Line[] = [];

  canal = 11;

  /** Too close to a river, road or lake to place a prop. */
  blocked(x: number, z: number, pad: number): boolean {
    for (const r of this.rivers) if (near(r, x, z, pad + 10).d < pad + r.w1) return true;
    for (const r of this.roads) if (near(r, x, z, pad + 4).d < pad) return true;
    for (const l of this.lakes) if (((x - l.x) / (l.rx + pad)) ** 2 + ((z - l.z) / (l.rz + pad)) ** 2 < 1) return true;
    return false;
  }

  /** Farm field containing (x, z) with field-local coords. */
  fieldAt(x: number, z: number): { f: Field; u: number; v: number } | null {
    for (const f of this.fields) {
      const dx = x - f.cx;
      const dz = z - f.cz;
      if (Math.abs(dx) > f.hw + 2 || Math.abs(dz) > f.hd + 2) continue;
      const c = Math.cos(f.rot);
      const s = Math.sin(f.rot);
      const u = dx * c - dz * s;
      const v = dx * s + dz * c;
      if (Math.abs(u) <= f.hw && Math.abs(v) <= f.hd) return { f, u, v };
    }
    return null;
  }

  /** Raw surround terrain height for the current style. */
  height(x: number, z: number): number {
    const d = this.boxDist(x, z);
    let h: number;
    if (this.style === "valley") h = valleyH(this, x, z, d);
    else if (this.style === "crag") h = cragH(this, x, z, d);
    else if (this.style === "alpine") h = alpineH(this, x, z, d);
    else if (this.style === "garden") h = gardenH(this, x, z, d);
    else h = seaH(this, x, z, d);
    return h;
  }

  /** Height blended into the map's own edge heights over the first 7 units outside the map. */
  ground(x: number, z: number): number {
    const d = this.boxDist(x, z);
    const L = this.height(x, z);
    if (d >= 7) return L;
    const ex = Math.round(Math.min(this.W, Math.max(0, x)));
    const ez = Math.round(Math.min(this.D, Math.max(0, z)));
    const eh = this.t.vertexHeight(ex, ez);
    return lerp(eh, L, smooth(0, 7, d));
  }

  riverDist(x: number, z: number, pad: number): number {
    let best = Infinity;
    for (const r of this.rivers) {
      const n = near(r, x, z, r.w1 + pad);
      if (n.d !== Infinity) best = Math.min(best, n.d - n.w);
    }
    return best;
  }

  /** Carve river beds and lakes (with a small island) into h; `vale` widens a valley around rivers. */
  carveWater(x: number, z: number, h: number, bed: number, bank: number, vale = 0): number {
    if (vale > 0) {
      const dr = this.riverDist(x, z, vale + 4);
      if (dr < vale) h = lerp(0.9 + noise(x * 0.2, z * 0.2, 5) * 0.5, h, smooth(1.5, vale, dr));
    }
    for (const r of this.rivers) {
      const n = near(r, x, z, r.w1 + bank + 2);
      if (n.d === Infinity) continue;
      const k = smooth(n.w * 0.55, n.w + bank, n.d);
      h = Math.min(h, lerp(bed, Math.max(h, bed), k));
    }
    for (const l of this.lakes) {
      const a = Math.atan2(z - l.z, x - l.x);
      const wob =
        1 +
        (noise(Math.cos(a) * 2.2 + 5, Math.sin(a) * 2.2 + 5, 77) - 0.5) * 0.55 +
        (noise(Math.cos(a) * 6 + 9, Math.sin(a) * 6, 78) - 0.5) * 0.18;
      const e = Math.sqrt(((x - l.x) / l.rx) ** 2 + ((z - l.z) / l.rz) ** 2) / wob;
      if (e < 1.6) {
        const isle = Math.hypot((x - l.x - l.rx * 0.3) / 4.5, (z - l.z + l.rz * 0.15) / 3.2);
        const lake = lerp(bed - 0.6, h, smooth(0.78, 1.15, e));
        h = Math.min(h, isle < 1 ? Math.max(lake, lerp(1.4, bed, isle * isle)) : lake);
      }
    }
    return h;
  }

  /** Ground texture weights + tint for the current style. */
  paint(x: number, z: number, h: number, slope: number): Paint {
    const d = this.boxDist(x, z);
    if (this.style === "valley") return valleyPaint(this, x, z, h, slope, d);
    if (this.style === "crag") return cragPaint(this, x, z, h, slope, d);
    if (this.style === "alpine") return alpinePaint(this, x, z, h, slope, d);
    if (this.style === "garden") return gardenPaint(this, x, z, h, slope, d);
    return seaPaint(this, x, z, h, slope, d);
  }

  /** Add a feature and its mirrored copies, mirroring rotation and (optionally) team side. */
  add(f: Omit<SFeature, "y" | "side"> & { side?: number }, mirrorSide = true, single = false): void {
    const pts = single ? [[f.x, f.z] as [number, number]] : this.sym(f.x, f.z);
    pts.forEach(([x, z], i) => {
      let rot = f.rot;
      if (this.mirror === "quad") rot = rot - (i * Math.PI) / 2;
      else if (i === 1) {
        if (this.mirror === "x") rot = -rot;
        else if (this.mirror === "diag") rot = Math.PI / 2 - rot;
        else if (this.mirror === "rot") rot = rot + Math.PI;
      }
      const side =
        f.side === undefined
          ? 0
          : this.mirror === "quad"
            ? mirrorSide
              ? (f.side + i) % 4
              : f.side
            : mirrorSide && i === 1
              ? 1 - f.side
              : f.side;
      this.features.push({ ...f, x, z, rot, side, y: this.ground(x, z) });
    });
  }

  /** Place up to n props at random spots that pass `ok` (own LCG from `seed`, max 30n tries). */
  scatter(
    n: number,
    area: (r: () => number) => [number, number],
    ok: (x: number, z: number) => boolean,
    make: (x: number, z: number, r: () => number) => void,
    seed: number,
  ): void {
    let st = seed * 9301 + 49297;
    const r = () => {
      st = (st * 9301 + 49297) % 233280;
      return st / 233280;
    };
    let tries = 0;
    let made = 0;
    while (made < n && tries < n * 30) {
      tries++;
      const [x, z] = area(r);
      if (!ok(x, z)) continue;
      make(x, z, r);
      made++;
    }
  }

  /** Point lies in the map's fundamental (unmirrored) region, so features are placed once then mirrored. */
  canonical(x: number, z: number): boolean {
    if (this.mirror === "x") return x <= this.W / 2;
    if (this.mirror === "diag") return x <= z;
    if (this.mirror === "rot") return x < this.W / 2 || (x === this.W / 2 && z <= this.D / 2);
    if (this.mirror === "quad") return x < this.W / 2 && z <= this.D / 2;
    return true;
  }

  placeFeatures(): void {
    if (this.style === "valley") valleyFeatures(this);
    else if (this.style === "crag") cragFeatures(this);
    else if (this.style === "alpine") alpineFeatures(this);
    else if (this.style === "garden") gardenFeatures(this);
    else seaFeatures(this);
  }

  /** Random point in an elliptical band d0..d1 outside the map. */
  ring(r: () => number, d0: number, d1: number): [number, number] {
    const a = r() * Math.PI * 2;
    const d = d0 + (d1 - d0) * Math.sqrt(r());
    const ex = this.W / 2 + Math.cos(a) * (this.W / 2 + d);
    const ez = this.D / 2 + Math.sin(a) * (this.D / 2 + d);
    return [ex, ez];
  }
}

/** Surround for a terrain, or null when the map has none. */
export function surroundFor(t: Terrain): Surround | null {
  return t.surround ? new Surround(t, t.surround as SurroundStyle, t.symmetry) : null;
}
