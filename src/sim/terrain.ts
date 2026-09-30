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
  op: "wall" | "water" | "ford" | "bridge" | "dirt" | "paving" | "grass" | "pit";
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
  mirror: "x" | "diag" | "none";
  rimHeight: number;
  waterLevel: number;
  ops: MapOp[];
  props: Prop[];
  cores: MapPoint[];
  pads: MapPoint[];
  spawns: MapPoint[];
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

export class Terrain {
  readonly width: number;
  readonly depth: number;
  readonly rimHeight: number;
  readonly waterLevel: number;
  readonly heights: Float32Array;
  readonly kinds: Uint8Array;
  readonly flags: Uint8Array;
  readonly deck: Float32Array;
  readonly styles: string[];
  readonly props: Prop[] = [];
  readonly cores: MapPoint[] = [];
  readonly pads: MapPoint[] = [];
  readonly spawns: MapPoint[] = [];
  private mirror: "x" | "diag" | "none" = "none";

  private canon(vx: number, vz: number): [number, number] {
    if (this.mirror === "x") return [Math.min(vx, this.width - vx), vz];
    if (this.mirror === "diag") return [Math.min(vx, vz), Math.max(vx, vz)];
    return [vx, vz];
  }

  constructor(data: MapData) {
    this.width = data.width;
    this.depth = data.depth;
    this.rimHeight = data.rimHeight;
    this.waterLevel = data.waterLevel;
    const W = this.width;
    const D = this.depth;
    const n = W * D;
    this.heights = new Float32Array((W + 1) * (D + 1));
    this.kinds = new Uint8Array(n);
    this.flags = new Uint8Array(n);
    this.deck = new Float32Array(n);
    this.styles = new Array<string>(n).fill("");
    this.mirror = data.mirror === "x" || data.mirror === "diag" ? data.mirror : "none";
    const mode = this.mirror;
    const mirror = mode !== "none";

    const mirrorRect = <T extends { x: number; z?: number; w?: number; h?: number; r?: number }>(r: T): T[] => {
      if (mode === "x") {
        const mx = r.w !== undefined ? W - r.x - r.w : W - r.x;
        if (Math.abs(mx - r.x) < 1e-6) return [r];
        return [r, { ...r, x: mx }];
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
          const v = valueNoise(vx * s, vz * s, op.seed) * 0.65 + valueNoise(vx * s * 2.3, vz * s * 2.3, op.seed + 9) * 0.35;
          const [mx, mz] = this.canon(vx, vz);
          const vm = valueNoise(mx * s, mz * s, op.seed) * 0.65 + valueNoise(mx * s * 2.3, mz * s * 2.3, op.seed + 9) * 0.35;
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
            case "wall": this.kinds[i] = Kind.Wall; this.styles[i] = op.style ?? "castle"; break;
            case "pit": this.kinds[i] = Kind.Wall; this.styles[i] = "pit"; break;
            case "water": this.kinds[i] = Kind.Water; if (op.deep) this.flags[i] |= FLAG_DEEP; break;
            case "ford": this.kinds[i] = Kind.Ford; break;
            case "bridge": this.kinds[i] = Kind.Bridge; this.deck[i] = op.y ?? 0; this.styles[i] = op.style ?? "wood"; break;
            case "dirt": this.flags[i] |= FLAG_DIRT; break;
            case "paving": this.flags[i] |= FLAG_PAVING; break;
            case "grass": this.flags[i] |= FLAG_GRASS; break;
          }
        });
      }
    }

    for (let cz = 0; cz < D; cz++) {
      for (let cx = 0; cx < W; cx++) {
        const i = cz * W + cx;
        const c = (this.vertexHeight(cx, cz) + this.vertexHeight(cx + 1, cz) + this.vertexHeight(cx, cz + 1) +
          this.vertexHeight(cx + 1, cz + 1)) / 4;
        if ((this.kinds[i] === Kind.Water || this.kinds[i] === Kind.Ford) && c > this.waterLevel + 0.15) this.kinds[i] = Kind.Ground;
        else if (this.kinds[i] === Kind.Ground && c < this.waterLevel - 0.15) this.kinds[i] = Kind.Water;
      }
    }

    const both = <T extends { x: number; z: number; rot?: number; team?: number; side?: number }>(
      list: T[], out: T[], flipTeam: boolean,
    ) => {
      for (const p of list) {
        out.push({ ...p, side: 0 });
        if (!mirror) continue;
        if (mode === "x" && Math.abs(p.x - W / 2) < 0.01) continue;
        if (mode === "diag" && Math.abs(p.x - p.z) < 0.01) continue;
        const m: T = mode === "x" ? { ...p, x: W - p.x, side: 1 } : { ...p, x: p.z, z: p.x, side: 1 };
        if (p.rot !== undefined) m.rot = mode === "x" ? -p.rot : 90 - p.rot;
        if (flipTeam && p.team !== undefined) m.team = 1 - p.team;
        out.push(m);
      }
    };
    both(data.props, this.props, false);
    both(data.cores, this.cores, true);
    both(data.pads, this.pads, false);
    both(data.spawns, this.spawns, true);

    for (const p of this.props) {
      if (!p.solid) continue;
      const i = this.index(Math.floor(p.x), Math.floor(p.z));
      if (i >= 0 && this.kinds[i] === Kind.Ground) this.kinds[i] = Kind.Prop;
    }
  }

  private eachVertex(fn: (vx: number, vz: number, i: number) => void): void {
    for (let vz = 0; vz <= this.depth; vz++) {
      for (let vx = 0; vx <= this.width; vx++) fn(vx, vz, vz * (this.width + 1) + vx);
    }
  }

  private applyShape(op: ShapeOp): void {
    this.eachVertex((vx, vz, i) => {
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
        case "add": this.heights[i] = h + (op.dy ?? 0) * t; break;
        case "set": this.heights[i] = h + ((op.y ?? 0) - h) * t; break;
        case "max": this.heights[i] = Math.max(h, h + ((op.y ?? 0) - h) * t); break;
        case "min": this.heights[i] = Math.min(h, h + ((op.y ?? 0) - h) * t); break;
      }
    });
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

  heightAt(x: number, z: number): number {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const kind = this.kindAt(cx, cz);
    if (kind === Kind.Wall || kind === Kind.Prop) return Number.POSITIVE_INFINITY;
    if (kind === Kind.Bridge) return this.deck[this.index(cx, cz)];
    if (kind === Kind.Water && (this.flags[this.index(cx, cz)] & FLAG_DEEP)) return Number.POSITIVE_INFINITY;
    if (kind === Kind.Water) return Math.max(this.groundHeight(x, z), this.waterLevel - 0.35);
    return this.groundHeight(x, z);
  }

  slopeAt(x: number, z: number, r = 0.35): number {
    const c = this.heightAt(x, z);
    if (!Number.isFinite(c)) return Number.POSITIVE_INFINITY;
    const ci = this.index(Math.floor(x), Math.floor(z));
    const cWorks = this.styles[ci] === "works";
    const edge = (sx: number, sz: number, h: number) => {
      if (!Number.isFinite(h) || Math.abs(h - c) <= 0.6) return false;
      const si = this.index(Math.floor(sx), Math.floor(sz));
      return si !== ci && (cWorks || this.styles[si] === "works");
    };
    const d = (ax: number, az: number) => {
      const a = this.heightAt(x + ax, z + az);
      const b = this.heightAt(x - ax, z - az);
      const fa = Number.isFinite(a) && !edge(x + ax, z + az, a);
      const fb = Number.isFinite(b) && !edge(x - ax, z - az, b);
      if (fa && fb) return (a - b) / (2 * r);
      if (fa) return (a - c) / r;
      if (fb) return (c - b) / r;
      return 0;
    };
    return Math.hypot(d(r, 0), d(0, r));
  }
}
