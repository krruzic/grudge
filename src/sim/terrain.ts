// Terrain: the playable map built from MapData (data/maps/*.json). Heights live on a (width+1) x (depth+1) vertex
// grid; each cell has a Kind (ground/wall/water/ford/bridge/prop), flag bits (grass, dirt, paving, deep water,
// tide) and a style string used by rendering and some rules ("castle", "gate", "lockgate", "works", "pit"...).
// Map ops (shapes, noise, cell rects) are applied in order and mirrored by the map's symmetry. Terrain is shared
// by sim and renderer; the sim mutates kinds/deck/styles for temporary mods (walls, ramps, gates, tide).
export interface Rect {
  x: number;
  z: number;
  w: number;
  h: number;
}

export type ShapeMode = "max" | "min" | "set" | "add";

export interface ShapeOp {
  op: "shape";
  shape: "rect" | "circle";
  x: number;
  z: number;
  w?: number;
  h?: number;
  r?: number;
  y?: number;
  dy?: number;
  edge: number;
  mode: ShapeMode;
  wobble?: number;
}

export interface NoiseOp {
  op: "noise";
  amp: number;
  scale: number;
  seed: number;
}

export interface CellOp extends Rect {
  op: "wall" | "water" | "ford" | "bridge" | "dirt" | "paving" | "grass" | "pit" | "tide" | "ice";
  style?: string;
  y?: number;
  deep?: boolean;
}

export type MapOp = ShapeOp | NoiseOp | CellOp;

export interface Prop {
  type: string;
  x: number;
  z: number;
  rot?: number;
  solid?: boolean;
  /** Footprint (m) a solid prop blocks, along x and z before `rot`; default just the cell under its centre. */
  w?: number;
  d?: number;
  ruined?: boolean;
  scale?: number;
  side?: number;
}

export interface MapPoint {
  x: number;
  z: number;
  team?: number;
  zone?: string;
  side?: number;
}

export interface MapData {
  name: string;
  blurb?: string;
  emblem?: string;
  width: number;
  depth: number;
  mirror: "x" | "diag" | "rot" | "quad" | "none";
  teams?: number;
  mode?: "duel" | "ffa" | "tdm";
  tide?: { lowSeconds: number; highSeconds: number; firstSeconds: number };
  surround?: string;
  rimHeight: number;
  waterLevel: number;
  chasm?: number;
  ops: MapOp[];
  props: Prop[];
  cores: MapPoint[];
  pads: MapPoint[];
  spawns: MapPoint[];
  dens?: MapPoint[];
  patrols?: { a: MapPoint; b: MapPoint }[];
  lanes?: { name: string; x: number; z: number }[];
  jumppads?: { a: MapPoint; b: MapPoint }[];
  avalanche?: unknown;
  gates?: unknown;
  geysers?: unknown;
  serpent?: unknown;
  ice?: unknown;
  palette?: string;
  /** Soldier march speed multiplier for long fields (waves spend less time walking through the fight). */
  unitSpeedMul?: number;
  atmosphere?: Record<string, unknown>;
  fountain?: unknown;
  mist?: unknown;
  lantern?: unknown;
  horns?: unknown;
  outposts?: boolean;
  /** Deathmatch power-up spots (full map coordinates, not mirrored); otherwise they're sampled. */
  powerups?: { x: number; z: number; kind?: string }[];
}

export enum Kind {
  Ground = 0,
  Wall = 1,
  Water = 2,
  Ford = 3,
  Bridge = 4,
  Prop = 5,
}

export const FLAG_DIRT = 1;
export const FLAG_PAVING = 2;
export const FLAG_GRASS = 4;
export const FLAG_DEEP = 8;
export const FLAG_TIDE = 16;
/** Frozen lake sheet (map event "ice", mapEvents/ice.ts): slick, and cracks into patches of water. */
export const FLAG_ICE = 32;

function smooth(t: number): number {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
}

function hash2(x: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

/**
 * Solid props that stand taller than a shot (buildings, towers, statues, trees): they block arrows and sight like
 * walls. Every other solid prop (crates, barrels, rocks, graves) is waist-high: shots pass over it.
 */
const TALL_PROPS = new Set([
  "cabin",
  "shed",
  "tower",
  "spire",
  "obelisk",
  "statue",
  "column",
  "colossus",
  "angel",
  "crane",
  "scaffold",
  "shrine",
  "pine",
  "tree",
  "appletree",
  "yew",
  "deadtree",
  "cactus",
]);

export class Terrain {
  readonly width: number;
  readonly depth: number;
  readonly rimHeight: number;
  readonly waterLevel: number;
  readonly heights: Float32Array;
  readonly kinds: Uint8Array;
  readonly flags: Uint8Array;
  readonly deck: Float32Array;
  /** Solid prop cells: how tall the prop stands for line of sight and arrows (vision.losHeight). */
  readonly propHeight: Float32Array;
  readonly styles: string[];
  readonly props: Prop[] = [];
  readonly cores: MapPoint[] = [];
  readonly pads: MapPoint[] = [];
  readonly spawns: MapPoint[] = [];
  readonly dens: MapPoint[] = [];
  readonly patrols: { a: MapPoint; b: MapPoint }[] = [];
  readonly lanes: { name: string; x: number; z: number }[] = [];
  readonly jumppads: { a: MapPoint; b: MapPoint }[] = [];
  private mirror: "x" | "diag" | "rot" | "quad" | "none" = "none";
  readonly teams: number = 2;
  /** "tdm" for team deathmatch (see sim/tdm.ts and tdmMap); otherwise the regular base modes. */
  readonly mode: string;
  readonly tide?: { lowSeconds: number; highSeconds: number; firstSeconds: number };
  readonly tideCells: number[] = [];
  readonly surround?: string;
  readonly avalanche?: unknown;
  readonly gates?: unknown;
  readonly geysers?: unknown;
  readonly serpent?: unknown;
  readonly ice?: unknown;
  /** Ground texture palette for the renderer ("autumn"); default by surround style. */
  readonly palette?: string;
  /** MapData.unitSpeedMul (1 = normal). */
  readonly unitSpeedMul: number;
  /** Render-only lighting/sky overrides for this map (see GameRenderer.applyAtmosphere). */
  readonly atmosphere?: Record<string, string | number | boolean>;
  readonly fountain?: unknown;
  readonly mist?: unknown;
  readonly horns?: unknown;
  readonly outposts: boolean;
  readonly lantern?: unknown;
  readonly powerSpots?: { x: number; z: number; kind?: string }[];

  /** How the map is mirrored (used to mirror map ops, surround scenery and gate/lane layouts). */
  get symmetry(): "x" | "diag" | "rot" | "quad" | "none" {
    return this.mirror;
  }

  private canon(vx: number, vz: number): [number, number] {
    if (this.mirror === "x") return [Math.min(vx, this.width - vx), vz];
    if (this.mirror === "diag") return [Math.min(vx, vz), Math.max(vx, vz)];
    if (this.mirror === "rot") {
      const rx = this.width - vx;
      const rz = this.depth - vz;
      return vx < rx || (vx === rx && vz <= rz) ? [vx, vz] : [rx, rz];
    }
    if (this.mirror === "quad") {
      let best: [number, number] = [vx, vz];
      let p: [number, number] = [vx, vz];
      for (let k = 0; k < 3; k++) {
        p = [this.depth - p[1], p[0]];
        if (p[0] < best[0] || (p[0] === best[0] && p[1] < best[1])) best = p;
      }
      return best;
    }
    return [vx, vz];
  }

  readonly chasm: number | undefined;

  constructor(data: MapData) {
    this.width = data.width;
    this.depth = data.depth;
    this.rimHeight = data.rimHeight;
    this.waterLevel = data.waterLevel;
    this.chasm = data.chasm;
    const W = this.width;
    const D = this.depth;
    const n = W * D;
    this.heights = new Float32Array((W + 1) * (D + 1));
    this.kinds = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.deck = new Float32Array(n);
    this.propHeight = new Float32Array(n);
    this.styles = new Array<string>(n).fill("");
    this.mirror =
      data.mirror === "x" || data.mirror === "diag" || data.mirror === "rot" || data.mirror === "quad"
        ? data.mirror
        : "none";
    this.teams = data.teams ?? 2;
    this.mode = data.mode ?? (this.teams > 2 ? "ffa" : "duel");
    this.tide = data.tide;
    this.surround = data.surround;
    this.avalanche = data.avalanche;
    this.gates = data.gates;
    this.geysers = data.geysers;
    this.serpent = data.serpent;
    this.ice = data.ice;
    this.palette = data.palette;
    this.unitSpeedMul = data.unitSpeedMul ?? 1;
    this.atmosphere = data.atmosphere as Record<string, string | number | boolean> | undefined;
    this.fountain = data.fountain;
    this.mist = data.mist;
    this.horns = data.horns;
    this.lanes.push(...(data.lanes ?? []));
    this.outposts = !!data.outposts;
    this.lantern = data.lantern;
    this.powerSpots = data.powerups;
    const mode = this.mirror;
    const mirror = mode !== "none";

    const mirrorRect = <T extends { x: number; z?: number; w?: number; h?: number; r?: number }>(r: T): T[] => {
      if (mode === "x") {
        const mx = r.w !== undefined ? W - r.x - r.w : W - r.x;
        if (Math.abs(mx - r.x) < 1e-6) return [r];
        return [r, { ...r, x: mx }];
      }
      if (mode === "rot" && r.z !== undefined) {
        const m =
          r.w !== undefined ? { ...r, x: W - r.x - r.w, z: D - r.z - (r.h ?? 0) } : { ...r, x: W - r.x, z: D - r.z };
        if (Math.abs(m.x - r.x) < 1e-6 && Math.abs(m.z - r.z) < 1e-6) return [r];
        return [r, m];
      }
      if (mode === "quad" && r.z !== undefined) {
        const out: T[] = [r];
        let c = r;
        for (let k = 0; k < 3; k++) {
          c =
            c.w !== undefined
              ? { ...c, x: D - c.z! - (c.h ?? 0), z: c.x, w: c.h, h: c.w }
              : { ...c, x: D - c.z!, z: c.x };
          if (
            !out.some(
              (o) =>
                Math.abs(o.x - c.x) < 1e-6 && Math.abs((o.z ?? 0) - (c.z ?? 0)) < 1e-6 && o.w === c.w && o.h === c.h,
            )
          )
            out.push(c);
        }
        return out;
      }
      if (mode === "diag" && r.z !== undefined) {
        const m = { ...r, x: r.z, z: r.x, w: r.h, h: r.w };
        if (Math.abs(m.x - r.x) < 1e-6 && Math.abs((m.z ?? 0) - (r.z ?? 0)) < 1e-6 && m.w === r.w) return [r];
        return [r, m];
      }
      return [r];
    };

    for (const op of data.ops) {
      if (op.op === "noise") {
        this.eachVertex((vx, vz, i) => {
          const s = op.scale;
          const v =
            valueNoise(vx * s, vz * s, op.seed) * 0.65 + valueNoise(vx * s * 2.3, vz * s * 2.3, op.seed + 9) * 0.35;
          const [mx, mz] = this.canon(vx, vz);
          const vm =
            valueNoise(mx * s, mz * s, op.seed) * 0.65 + valueNoise(mx * s * 2.3, mz * s * 2.3, op.seed + 9) * 0.35;
          this.heights[i] += ((mirror ? vm : v) - 0.5) * 2 * op.amp;
        });
        continue;
      }
      if (op.op === "shape") {
        for (const s of mirrorRect(op)) this.applyShape(s);
        continue;
      }
      for (const r of mirrorRect(op)) {
        this.fill(r, (i) => {
          switch (op.op) {
            case "wall":
              this.kinds[i] = Kind.Wall;
              this.styles[i] = op.style ?? "castle";
              break;
            case "pit":
              this.kinds[i] = Kind.Wall;
              this.styles[i] = "pit";
              break;
            case "water":
              this.kinds[i] = Kind.Water;
              if (op.deep) this.flags[i] |= FLAG_DEEP;
              break;
            case "ford":
              this.kinds[i] = Kind.Ford;
              break;
            case "bridge":
              this.kinds[i] = Kind.Bridge;
              this.deck[i] = op.y ?? 0;
              this.styles[i] = op.style ?? "wood";
              break;
            case "dirt":
              this.flags[i] |= FLAG_DIRT;
              break;
            case "paving":
              this.flags[i] |= FLAG_PAVING;
              break;
            case "grass":
              this.flags[i] |= FLAG_GRASS;
              break;
            case "tide":
              this.flags[i] |= FLAG_TIDE;
              break;
            case "ice":
              this.flags[i] |= FLAG_ICE;
              break;
          }
        });
      }
    }

    for (let cz = 0; cz < D; cz++) {
      for (let cx = 0; cx < W; cx++) {
        const i = cz * W + cx;
        const c =
          (this.vertexHeight(cx, cz) +
            this.vertexHeight(cx + 1, cz) +
            this.vertexHeight(cx, cz + 1) +
            this.vertexHeight(cx + 1, cz + 1)) /
          4;
        if ((this.kinds[i] === Kind.Water || this.kinds[i] === Kind.Ford) && c > this.waterLevel + 0.15)
          this.kinds[i] = Kind.Ground;
        else if (this.kinds[i] === Kind.Ground && c < this.waterLevel - 0.15) this.kinds[i] = Kind.Water;
      }
    }

    for (let i = 0; i < n; i++) {
      if (!(this.flags[i] & FLAG_TIDE) || this.kinds[i] !== Kind.Ground) continue;
      if (this.groundHeight((i % W) + 0.5, Math.floor(i / W) + 0.5) < this.waterLevel + 0.7) this.tideCells.push(i);
    }

    const both = <T extends { x: number; z: number; rot?: number; team?: number; side?: number }>(
      list: T[],
      out: T[],
      flipTeam: boolean,
    ) => {
      for (const p of list) {
        if (mode === "quad") {
          let c: T = { ...p, side: 0 };
          out.push(c);
          if (Math.abs(p.x - W / 2) < 0.01 && Math.abs(p.z - D / 2) < 0.01) continue;
          for (let k = 1; k < 4; k++) {
            c = { ...c, x: D - c.z, z: c.x, side: k };
            if (p.rot !== undefined) c.rot = (p.rot - 90 * k + 360) % 360;
            if (flipTeam && p.team !== undefined) c.team = (p.team + k) % 4;
            out.push(c);
          }
          continue;
        }
        out.push({ ...p, side: 0 });
        if (!mirror) continue;
        if (mode === "x" && Math.abs(p.x - W / 2) < 0.01) continue;
        if (mode === "diag" && Math.abs(p.x - p.z) < 0.01) continue;
        if (mode === "rot" && Math.abs(p.x - W / 2) < 0.01 && Math.abs(p.z - D / 2) < 0.01) continue;
        const m: T =
          mode === "x"
            ? { ...p, x: W - p.x, side: 1 }
            : mode === "rot"
              ? { ...p, x: W - p.x, z: D - p.z, side: 1 }
              : { ...p, x: p.z, z: p.x, side: 1 };
        if (p.rot !== undefined) m.rot = mode === "x" ? -p.rot : mode === "rot" ? p.rot + 180 : 90 - p.rot;
        if (flipTeam && p.team !== undefined) m.team = 1 - p.team;
        out.push(m);
      }
    };
    both(data.props, this.props, false);
    both(data.cores, this.cores, true);
    both(data.pads, this.pads, false);
    both(data.spawns, this.spawns, true);
    both(data.dens ?? [], this.dens, false);
    for (const r of data.jumppads ?? []) {
      const A: MapPoint[] = [];
      const B: MapPoint[] = [];
      both([r.a], A, false);
      both([r.b], B, false);
      for (let i = 0; i < Math.min(A.length, B.length); i++) this.jumppads.push({ a: A[i], b: B[i] });
    }
    for (const r of data.patrols ?? []) {
      const A: MapPoint[] = [];
      const B: MapPoint[] = [];
      both([r.a], A, false);
      both([r.b], B, false);
      for (let i = 0; i < Math.min(A.length, B.length); i++) this.patrols.push({ a: A[i], b: B[i] });
    }

    for (const p of this.props) {
      if (!p.solid) continue;
      const tall = TALL_PROPS.has(p.type) ? 3.5 : 1.2;
      const block = (cx: number, cz: number) => {
        const i = this.index(cx, cz);
        if (i >= 0 && this.kinds[i] === Kind.Ground) this.kinds[i] = Kind.Prop;
        if (i >= 0 && this.kinds[i] === Kind.Prop) this.propHeight[i] = Math.max(this.propHeight[i], tall);
      };
      block(Math.floor(p.x), Math.floor(p.z));
      if (!p.w || !p.d) continue;
      // Buildings and other big props: every cell whose centre lies inside the (rotated) footprint.
      const a = ((p.rot ?? 0) * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const R = Math.ceil(Math.hypot(p.w, p.d) / 2) + 1;
      for (let cz = Math.floor(p.z) - R; cz <= Math.floor(p.z) + R; cz++)
        for (let cx = Math.floor(p.x) - R; cx <= Math.floor(p.x) + R; cx++) {
          const dx = cx + 0.5 - p.x;
          const dz = cz + 0.5 - p.z;
          const u = dx * c + dz * s;
          const v = -dx * s + dz * c;
          if (Math.abs(u) <= p.w / 2 && Math.abs(v) <= p.d / 2) block(cx, cz);
        }
    }
  }

  /** Visits every height vertex, or just those inside the box [x0, x1] x [z0, z1] when given. */
  private eachVertex(
    fn: (vx: number, vz: number, i: number) => void,
    x0 = 0,
    z0 = 0,
    x1 = this.width,
    z1 = this.depth,
  ): void {
    const ax = Math.max(0, Math.ceil(x0));
    const bx = Math.min(this.width, Math.floor(x1));
    for (let vz = Math.max(0, Math.ceil(z0)); vz <= Math.min(this.depth, Math.floor(z1)); vz++) {
      for (let vx = ax; vx <= bx; vx++) fn(vx, vz, vz * (this.width + 1) + vx);
    }
  }

  private applyShape(op: ShapeOp): void {
    // Only vertices within the shape's reach (size + edge + wobble) can change, so visit just that box.
    const reach = Math.max(0, op.edge ?? 0) + (op.wobble ?? 0) + 1;
    const x0 = op.x - (op.shape === "circle" ? (op.r ?? 1) : 0) - reach;
    const z0 = op.z - (op.shape === "circle" ? (op.r ?? 1) : 0) - reach;
    const x1 = op.x + (op.shape === "circle" ? (op.r ?? 1) : (op.w ?? 1)) + reach;
    const z1 = op.z + (op.shape === "circle" ? (op.r ?? 1) : (op.h ?? 1)) + reach;
    this.eachVertex(
      (vx, vz, i) => {
        let d: number;
        if (op.shape === "circle") {
          d = Math.hypot(vx - op.x, vz - op.z) - (op.r ?? 1);
        } else {
          const x1 = op.x + (op.w ?? 1);
          const z1 = op.z + (op.h ?? 1);
          const dx = Math.max(op.x - vx, 0, vx - x1);
          const dz = Math.max(op.z - vz, 0, vz - z1);
          d = dx > 0 || dz > 0 ? Math.hypot(dx, dz) : -Math.min(vx - op.x, x1 - vx, vz - op.z, z1 - vz);
        }
        if (op.wobble) {
          const [mx, mz] = this.canon(vx, vz);
          d += (valueNoise(mx * 0.28, mz * 0.28, 17) - 0.5) * 2 * op.wobble;
        }
        const t = op.edge > 0 ? 1 - smooth(d / op.edge) : d <= 1e-6 ? 1 : 0;
        if (t <= 0) return;
        const h = this.heights[i];
        switch (op.mode) {
          case "add":
            this.heights[i] = h + (op.dy ?? 0) * t;
            break;
          case "set":
            this.heights[i] = h + ((op.y ?? 0) - h) * t;
            break;
          case "max":
            this.heights[i] = Math.max(h, h + ((op.y ?? 0) - h) * t);
            break;
          case "min":
            this.heights[i] = Math.min(h, h + ((op.y ?? 0) - h) * t);
            break;
        }
      },
      x0,
      z0,
      x1,
      z1,
    );
  }

  private fill(r: Rect, fn: (i: number) => void): void {
    for (let z = Math.max(0, r.z); z < Math.min(this.depth, r.z + r.h); z++) {
      for (let x = Math.max(0, r.x); x < Math.min(this.width, r.x + r.w); x++) fn(z * this.width + x);
    }
  }

  index(cx: number, cz: number): number {
    return cx >= 0 && cz >= 0 && cx < this.width && cz < this.depth ? cz * this.width + cx : -1;
  }

  kindAt(cx: number, cz: number): Kind {
    const i = this.index(cx, cz);
    return i < 0 ? Kind.Wall : (this.kinds[i] as Kind);
  }

  hasFlag(cx: number, cz: number, flag: number): boolean {
    const i = this.index(cx, cz);
    return i >= 0 && (this.flags[i] & flag) !== 0;
  }

  vertexHeight(vx: number, vz: number): number {
    vx = Math.min(this.width, Math.max(0, vx));
    vz = Math.min(this.depth, Math.max(0, vz));
    return this.heights[vz * (this.width + 1) + vx];
  }

  /** Bilinear-on-triangles interpolation of the vertex grid (ignores kinds). */
  groundHeight(x: number, z: number): number {
    const cx = Math.min(this.width - 1, Math.max(0, Math.floor(x)));
    const cz = Math.min(this.depth - 1, Math.max(0, Math.floor(z)));
    const fx = Math.min(1, Math.max(0, x - cx));
    const fz = Math.min(1, Math.max(0, z - cz));
    const h00 = this.vertexHeight(cx, cz);
    const h10 = this.vertexHeight(cx + 1, cz);
    const h01 = this.vertexHeight(cx, cz + 1);
    const h11 = this.vertexHeight(cx + 1, cz + 1);
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  /** Standable height at a point: +Infinity for walls/props/deep water, deck for bridges, water surface floor. */
  heightAt(x: number, z: number): number {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const kind = this.kindAt(cx, cz);
    if (kind === Kind.Wall || kind === Kind.Prop) return Number.POSITIVE_INFINITY;
    if (kind === Kind.Bridge) return this.deck[this.index(cx, cz)];
    if (kind === Kind.Water && this.flags[this.index(cx, cz)] & FLAG_DEEP) return Number.POSITIVE_INFINITY;
    if (kind === Kind.Water) return Math.max(this.groundHeight(x, z), this.waterLevel - 0.35);
    return this.groundHeight(x, z);
  }

  /** Local slope of heightAt; siege-works edges are ignored so platform rims don't count as cliffs. */
  slopeAt(x: number, z: number, r = 0.35): number {
    const c = this.heightAt(x, z);
    if (!Number.isFinite(c)) return Number.POSITIVE_INFINITY;
    const ci = this.index(Math.floor(x), Math.floor(z));
    const cWorks = this.styles[ci] === "works";
    return Math.hypot(this.slopeAxis(x, z, r, 0, c, ci, cWorks), this.slopeAxis(x, z, 0, r, c, ci, cWorks));
  }

  private slopeEdge(sx: number, sz: number, h: number, c: number, ci: number, cWorks: boolean): boolean {
    if (!Number.isFinite(h) || Math.abs(h - c) <= 0.6) return false;
    const si = this.index(Math.floor(sx), Math.floor(sz));
    return si !== ci && (cWorks || this.styles[si] === "works");
  }

  private slopeAxis(x: number, z: number, ax: number, az: number, c: number, ci: number, cWorks: boolean): number {
    const r = ax || az;
    const a = this.heightAt(x + ax, z + az);
    const b = this.heightAt(x - ax, z - az);
    const fa = Number.isFinite(a) && !this.slopeEdge(x + ax, z + az, a, c, ci, cWorks);
    const fb = Number.isFinite(b) && !this.slopeEdge(x - ax, z - az, b, c, ci, cWorks);
    if (fa && fb) return (a - b) / (2 * r);
    if (fa) return (a - c) / r;
    if (fb) return (c - b) / r;
    return 0;
  }
}
