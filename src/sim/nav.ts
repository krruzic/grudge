import { Kind, type Terrain } from "./terrain.ts";
import type { Vec2 } from "./types.ts";

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

const DX = DIRS.map((d) => d[0]);
const DZ = DIRS.map((d) => d[1]);
const DC = DIRS.map((d) => d[2]);
const SLOPE_SAMPLES: [number, number][] = [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35], [0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]];
const PLAN_SLOPE = 0.9;
const LINE_SLOPE = 0.95;

const CLEAR_RING: [number, number][] = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4) * 0.6, Math.sin((k * Math.PI) / 4) * 0.6]);

export class NavGrid {
  readonly w: number;
  readonly d: number;
  readonly walk: Uint8Array;
  readonly h: Float32Array;
  readonly cost: Float32Array;
  readonly blocked: Uint8Array;
  private g: Float32Array;
  private came: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heapI = new Int32Array(1024);
  private heapF = new Float64Array(1024);
  private heapN = 0;
  private cache = new Map<number, { found: boolean; cells: Int32Array } | null>();
  private clearMemo = new Map<number, boolean>();

  constructor(private t: Terrain, maxStep: number, private maxSlope: number) {
    this.w = t.width;
    this.d = t.depth;
    const n = this.w * this.d;
    this.walk = new Uint8Array(n);
    this.h = new Float32Array(n);
    this.cost = new Float32Array(n);
    this.blocked = new Uint8Array(n);
    this.g = new Float32Array(n);
    this.came = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.maxStep = maxStep;
    for (let i = 0; i < n; i++) this.computeCell(i);
  }

  private maxStep: number;

  private computeCell(i: number): void {
    const t = this.t;
    const cx = i % this.w;
    const cz = Math.floor(i / this.w);
    const x = cx + 0.5;
    const z = cz + 0.5;
    const hc = t.heightAt(x, z);
    this.h[i] = hc;
    let ok = Number.isFinite(hc);
    if (ok) {
      for (const [ox, oz] of SLOPE_SAMPLES) {
        if (!(t.slopeAt(x + ox, z + oz) <= this.maxSlope * PLAN_SLOPE)) { ok = false; break; }
      }
    }
    this.walk[i] = ok ? 1 : 0;
    this.cost[i] = t.kinds[i] === Kind.Ford ? 1.8 : t.kinds[i] === Kind.Water ? 3.5 : 1;
  }

  recompute(cells: number[]): void {
    this.cache.clear();
    this.clearMemo.clear();
    const done = new Set<number>();
    for (const c of cells) {
      const cx = c % this.w;
      const cz = Math.floor(c / this.w);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = this.index(cx + dx, cz + dz);
          if (i >= 0 && !done.has(i)) { done.add(i); this.computeCell(i); }
        }
      }
    }
  }

  index(cx: number, cz: number): number {
    return cx >= 0 && cz >= 0 && cx < this.w && cz < this.d ? cz * this.w + cx : -1;
  }

  open(i: number): boolean {
    return i >= 0 && this.walk[i] === 1 && this.blocked[i] === 0;
  }

  passable(a: number, b: number): boolean {
    if (!this.open(a) || !this.open(b)) return false;
    const flat = this.t.kinds[a] === Kind.Bridge || this.t.kinds[b] === Kind.Bridge;
    return Math.abs(this.h[a] - this.h[b]) <= (flat ? this.maxStep * 0.85 : this.maxSlope + 0.1);
  }

  setBlocked(x: number, z: number, r: number, on: boolean): void {
    for (let cz = Math.floor(z - r); cz <= Math.floor(z + r); cz++) {
      for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
        const i = this.index(cx, cz);
        if (i < 0) continue;
        if (Math.hypot(cx + 0.5 - x, cz + 0.5 - z) > r) continue;
        this.blocked[i] = on ? Math.min(255, this.blocked[i] + 1) : Math.max(0, this.blocked[i] - 1);
        this.cache.clear();
        this.clearMemo.clear();
      }
    }
  }

  nearestOpen(x: number, z: number, maxR = 8, y?: number): number {
    const cx0 = Math.floor(x);
    const cz0 = Math.floor(z);
    let best = -1;
    let bestD = Infinity;
    for (let r = 0; r <= maxR; r++) {
      for (let cz = cz0 - r; cz <= cz0 + r; cz++) {
        for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
          if (Math.max(Math.abs(cx - cx0), Math.abs(cz - cz0)) !== r) continue;
          const i = this.index(cx, cz);
          if (!this.open(i)) continue;
          if (y !== undefined && Math.abs(this.h[i] - y) > this.maxStep * 1.2) continue;
          const d = Math.hypot(cx + 0.5 - x, cz + 0.5 - z);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  lineClear(a: Vec2, b: Vec2): boolean {
    if (a.x - Math.floor(a.x) === 0.5 && a.z - Math.floor(a.z) === 0.5 && b.x - Math.floor(b.x) === 0.5 && b.z - Math.floor(b.z) === 0.5) {
      const ia = this.index(Math.floor(a.x), Math.floor(a.z));
      const ib = this.index(Math.floor(b.x), Math.floor(b.z));
      if (ia >= 0 && ib >= 0) {
        const key = ia * this.w * this.d + ib;
        let v = this.clearMemo.get(key);
        if (v === undefined) {
          v = this.lineClearRaw(a, b);
          if (this.clearMemo.size > 50000) this.clearMemo.clear();
          this.clearMemo.set(key, v);
        }
        return v;
      }
    }
    return this.lineClearRaw(a, b);
  }

  private lineClearRaw(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / 0.25);
    let prev = this.index(Math.floor(a.x), Math.floor(a.z));
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const px = a.x + dx * f;
      const pz = a.z + dz * f;
      const i = this.index(Math.floor(px), Math.floor(pz));
      if (!(this.t.slopeAt(px, pz) <= this.maxSlope * LINE_SLOPE)) return false;
      if (i !== prev) {
        if (prev >= 0 && this.open(prev) && !this.passable(prev, i)) return false;
        if (!this.open(i)) return false;
        prev = i;
      }
      for (const [ox, oz] of CLEAR_RING) {
        const j = this.index(Math.floor(px + ox), Math.floor(pz + oz));
        if (!this.open(j) || Math.abs(this.h[j] - this.h[i]) > this.maxStep * 1.5) return false;
      }
    }
    return true;
  }

  private push(i: number, fv: number): void {
    if (this.heapN === this.heapI.length) {
      const ni = new Int32Array(this.heapN * 2);
      ni.set(this.heapI);
      const nf = new Float64Array(this.heapN * 2);
      nf.set(this.heapF);
      this.heapI = ni;
      this.heapF = nf;
    }
    const H = this.heapI;
    const F = this.heapF;
    let k = this.heapN++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (F[p] <= fv) break;
      H[k] = H[p];
      F[k] = F[p];
      k = p;
    }
    H[k] = i;
    F[k] = fv;
  }

  private pop(): number {
    const H = this.heapI;
    const F = this.heapF;
    const top = H[0];
    const n = --this.heapN;
    if (n > 0) {
      const li = H[n];
      const lf = F[n];
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = -1;
        let mf = lf;
        if (l < n && F[l] < mf) { m = l; mf = F[l]; }
        if (r < n && F[r] < mf) { m = r; mf = F[r]; }
        if (m < 0) break;
        H[k] = H[m];
        F[k] = F[m];
        k = m;
      }
      H[k] = li;
      F[k] = lf;
    }
    return top;
  }

  findPath(from: Vec2, to: Vec2, fromY?: number): Vec2[] | null {
    let start = this.index(Math.floor(from.x), Math.floor(from.z));
    if (!this.open(start) || (fromY !== undefined && Math.abs(this.h[start] - fromY) > this.maxStep * 1.2)) {
      start = this.nearestOpen(from.x, from.z, 3, fromY);
      if (start < 0) start = this.nearestOpen(from.x, from.z, 3);
    }
    let goal = this.index(Math.floor(to.x), Math.floor(to.z));
    if (!this.open(goal)) goal = this.nearestOpen(to.x, to.z, 6);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [{ x: to.x, z: to.z }];
    const key = start * this.w * this.d + goal;
    let hit = this.cache.get(key);
    if (hit === undefined) {
      hit = this.search(start, goal);
      if (this.cache.size > 4000) this.cache.clear();
      this.cache.set(key, hit);
    }
    if (!hit) return null;
    const { found, cells } = hit;
    const W = this.w;
    const pts: Vec2[] = Array.from(cells, (c) => ({ x: (c % W) + 0.5, z: ((c / W) | 0) + 0.5 }));
    if (found) pts[pts.length - 1] = this.open(this.index(Math.floor(to.x), Math.floor(to.z))) ? { x: to.x, z: to.z } : pts[pts.length - 1];
    const out: Vec2[] = [];
    let anchor: Vec2 = from;
    let k = 0;
    while (k < pts.length) {
      let j = Math.min(pts.length - 1, k + 12);
      while (j > k && !this.lineClear(anchor, pts[j])) j--;
      out.push(pts[j]);
      anchor = pts[j];
      k = j + 1;
    }
    return out;
  }

  private search(start: number, goal: number): { found: boolean; cells: Int32Array } | null {

    const gen = ++this.gen;
    const W = this.w;
    const gx = goal % W;
    const gz = (goal / W) | 0;
    const heur = (i: number) => {
      const dx = Math.abs((i % W) - gx);
      const dz = Math.abs(((i / W) | 0) - gz);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };
    this.heapN = 0;
    this.stamp[start] = gen;
    this.g[start] = 0;
    this.came[start] = -1;
    this.push(start, heur(start));
    let found = false;
    let iter = 0;
    let best = start;
    let bestH = heur(start);
    while (this.heapN && iter++ < 20000) {
      const cur = this.pop();
      if (this.closed[cur] === gen) continue;
      this.closed[cur] = gen;
      if (cur === goal) { found = true; break; }
      const hc = heur(cur);
      if (hc < bestH) { bestH = hc; best = cur; }
      const cx = cur % W;
      const cz = (cur / W) | 0;
      for (let di = 0; di < 8; di++) {
        const dx = DX[di];
        const dz = DZ[di];
        const dc = DC[di];
        const n = this.index(cx + dx, cz + dz);
        if (n < 0 || this.closed[n] === gen || !this.passable(cur, n)) continue;
        if (dx !== 0 && dz !== 0) {
          if (!this.passable(cur, this.index(cx + dx, cz)) || !this.passable(cur, this.index(cx, cz + dz))) continue;
        }
        const ng = this.g[cur] + dc * (this.cost[cur] + this.cost[n]) * 0.5 + Math.max(0, this.h[n] - this.h[cur]) * 0.3;
        if (this.stamp[n] !== gen || ng < this.g[n]) {
          this.stamp[n] = gen;
          this.g[n] = ng;
          this.came[n] = cur;
          this.push(n, ng + heur(n));
        }
      }
    }
    if (!found && best === start) return null;
    const end = found ? goal : best;
    const cells: number[] = [];
    for (let c = end; c >= 0; c = this.came[c]) cells.push(c);
    cells.reverse();
    return { found, cells: Int32Array.from(cells) };
  }
}
