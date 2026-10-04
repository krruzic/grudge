import { Kind, type Terrain } from "./terrain.ts";

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

interface Line {
  pts: [number, number][];
  w0: number;
  w1: number;
  box: [number, number, number, number];
  len: number[];
  chunks: { i0: number; i1: number; box: [number, number, number, number] }[];
}

const CHUNK = 8;

interface Field {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  rot: number;
  crop: "wheat" | "plow" | "green" | "fallow";
}

interface Spot {
  x: number;
  z: number;
  r: number;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hash(x: number, z: number, s = 0): number {
  const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

function noise(x: number, z: number, s = 0): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, s);
  const b = hash(x0 + 1, z0, s);
  const c = hash(x0, z0 + 1, s);
  const d = hash(x0 + 1, z0 + 1, s);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

function fbm(x: number, z: number, oct: number, s = 0): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    v += noise(x * f, z * f, s + i * 13) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return v / n;
}

function ridge(x: number, z: number, s = 0): number {
  let v = 0;
  let a = 0.55;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    const n = 1 - Math.abs(noise(x * f, z * f, s + i * 7) * 2 - 1);
    v += n * n * a;
    a *= 0.5;
    f *= 2.1;
  }
  return v;
}

function spline(ctrl: [number, number][], step = 3): [number, number][] {
  const out: [number, number][] = [];
  const p = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

function line(ctrl: [number, number][], w0: number, w1 = w0): Line {
  const pts = spline(ctrl);
  const len = [0];
  for (let i = 1; i < pts.length; i++)
    len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  const chunks: Line["chunks"] = [];
  for (let i0 = 1; i0 < pts.length; i0 += CHUNK) {
    const i1 = Math.min(pts.length - 1, i0 + CHUNK - 1);
    let a = Infinity;
    let b = Infinity;
    let c = -Infinity;
    let d = -Infinity;
    for (let i = i0 - 1; i <= i1; i++) {
      a = Math.min(a, pts[i][0]);
      b = Math.min(b, pts[i][1]);
      c = Math.max(c, pts[i][0]);
      d = Math.max(d, pts[i][1]);
    }
    chunks.push({ i0, i1, box: [a, b, c, d] });
  }
  return { pts, w0, w1, box: [x0, z0, x1, z1], len, chunks };
}

function near(l: Line, x: number, z: number, pad: number): { d: number; t: number; w: number; ang: number } {
  const [x0, z0, x1, z1] = l.box;
  if (x < x0 - pad || x > x1 + pad || z < z0 - pad || z > z1 + pad) return { d: Infinity, t: 0, w: l.w0, ang: 0 };
  let best = Infinity;
  let bt = 0;
  let ang = 0;
  const total = l.len[l.len.length - 1] || 1;
  for (const ch of l.chunks) {
    const [cx0, cz0, cx1, cz1] = ch.box;
    const ex = Math.max(cx0 - x, 0, x - cx1);
    const ez = Math.max(cz0 - z, 0, z - cz1);
    if (ex * ex + ez * ez >= best) continue;
    for (let i = ch.i0; i <= ch.i1; i++) {
      const [ax, az] = l.pts[i - 1];
      const [bx, bz] = l.pts[i];
      const dx = bx - ax;
      const dz = bz - az;
      const L2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const px = ax + dx * u - x;
      const pz = az + dz * u - z;
      const d = px * px + pz * pz;
      if (d < best) {
        best = d;
        bt = (l.len[i - 1] + Math.sqrt(L2) * u) / total;
        ang = Math.atan2(dx, dz);
      }
    }
  }
  return { d: Math.sqrt(best), t: bt, w: lerp(l.w0, l.w1, bt), ang };
}

function pointAt(l: Line, t: number): { x: number; z: number; ang: number } {
  const total = l.len[l.len.length - 1];
  const target = t * total;
  for (let i = 1; i < l.pts.length; i++) {
    if (l.len[i] >= target || i === l.pts.length - 1) {
      const seg = l.len[i] - l.len[i - 1] || 1;
      const u = Math.max(0, Math.min(1, (target - l.len[i - 1]) / seg));
      const [ax, az] = l.pts[i - 1];
      const [bx, bz] = l.pts[i];
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, ang: Math.atan2(bx - ax, bz - az) };
    }
  }
  return { x: l.pts[0][0], z: l.pts[0][1], ang: 0 };
}

export interface Exit {
  edge: "n" | "s" | "w" | "e";
  at: number;
  width: number;
}

function exits(t: Terrain): Exit[] {
  const out: Exit[] = [];
  const wet = (x: number, z: number) => {
    const k = t.kindAt(x, z);
    return k === Kind.Water || k === Kind.Ford;
  };
  const scan = (edge: Exit["edge"], n: number, at: (i: number) => [number, number]) => {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && wet(...at(i));
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        out.push({ edge, at: (start + i) / 2, width: i - start });
        start = -1;
      }
    }
  };
  scan("n", t.width, (i) => [i, 1]);
  scan("s", t.width, (i) => [i, t.depth - 2]);
  scan("w", t.depth, (i) => [1, i]);
  scan("e", t.depth, (i) => [t.width - 2, i]);
  return out
    .filter((e) => e.width >= (e.edge === "w" || e.edge === "e" ? 1 : 2))
    .map((e) => ({ ...e, width: Math.max(e.width, 2.5) }));
}

export class Surround {
  readonly style: SurroundStyle;
  readonly far = 400;
  readonly features: SFeature[] = [];
  readonly water: boolean;
  readonly exits: Exit[];
  private W: number;
  private D: number;
  private rivers: Line[] = [];
  private roads: Line[] = [];
  private lakes: { x: number; z: number; rx: number; rz: number }[] = [];
  private fields: Field[] = [];
  private clearings: Spot[] = [];
  private islands: Spot[] = [];
  private seed: number;

  constructor(
    private t: Terrain,
    style: SurroundStyle,
    private mirror: "x" | "diag" | "rot" | "quad" | "none",
  ) {
    this.style = style;
    this.W = t.width;
    this.D = t.depth;
    this.seed = t.width * 7 + t.depth * 13;
    this.exits = exits(t);
    this.water = style === "valley" || style === "sea" || style === "garden";
    if (style === "valley") this.designValley();
    else if (style === "crag") this.designCrag();
    else if (style === "alpine") this.designAlpine();
    else if (style === "garden") this.designGarden();
    else this.designSea();
  }

  buildFeatures(): SFeature[] {
    if (!this.features.length) this.placeFeatures();
    return this.features;
  }

  private sym(x: number, z: number): [number, number][] {
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

  private symLine(ctrl: [number, number][], w0: number, w1 = w0): Line[] {
    const sets: [number, number][][] = [[], [], [], []];
    for (const [x, z] of ctrl) this.sym(x, z).forEach((m, k) => sets[k].push(m));
    return sets.filter((s) => s.length).map((s) => line(s, w0, w1));
  }

  boxDist(x: number, z: number): number {
    const dx = Math.max(0 - x, 0, x - this.W);
    const dz = Math.max(0 - z, 0, z - this.D);
    return Math.hypot(dx, dz);
  }

  private exitPoint(e: Exit, out: number): [number, number] {
    if (e.edge === "n") return [e.at, -out];
    if (e.edge === "s") return [e.at, this.D + out];
    if (e.edge === "w") return [-out, e.at];
    return [this.W + out, e.at];
  }

  private designValley(): void {
    const { W, D } = this;
    const cx = W / 2;
    const north = this.exits.filter((e) => e.edge === "n" && e.at <= cx);
    const south = this.exits.filter((e) => e.edge === "s" && e.at <= cx);
    const west = this.exits.filter((e) => e.edge === "w");
    for (const e of north) {
      const [x] = this.exitPoint(e, 0);
      this.rivers.push(
        ...this.symLine(
          [
            [x, 2],
            [x, -8],
            [x + (cx - x) * 0.35, -20],
            [cx, -34],
          ],
          e.width * 0.55 + 0.6,
          e.width * 0.7,
        ),
      );
    }
    if (north.length) {
      this.rivers.push(
        line(
          [
            [cx, -34],
            [cx - 7, -56],
            [cx + 9, -92],
            [cx - 6, -140],
            [cx + 12, -200],
            [cx - 4, -280],
            [cx + 6, -420],
          ],
          5.5,
          9,
        ),
      );
    }
    for (const e of south) {
      const [x] = this.exitPoint(e, 0);
      this.rivers.push(
        ...this.symLine(
          [
            [x, D - 2],
            [x, D + 9],
            [x - 3, D + 22],
            [x + (cx - x) * 0.4, D + 34],
          ],
          e.width * 0.55 + 0.6,
          e.width * 0.8,
        ),
      );
    }
    if (south.length) this.lakes.push({ x: cx, z: D + 46, rx: 34, rz: 18 });
    const wSorted = west.slice().sort((a, b) => a.at - b.at);
    if (wSorted.length >= 2) {
      const a = wSorted[0].at;
      const b = wSorted[wSorted.length - 1].at;
      const mid = (a + b) / 2;
      const loop: [number, number][] = [
        [2, a],
        [-6, a + 0.5],
        [-14, a + 4],
        [-19, mid - 4],
        [-19.5, mid + 3],
        [-15, b - 3],
        [-6, b - 0.5],
        [2, b],
      ];
      this.rivers.push(...this.symLine(loop, 1.6, 1.6));
      this.rivers.push(
        ...this.symLine(
          [
            [-17, b - 6],
            [-24, b + 8],
            [-30, D + 22],
            [-14, D + 40],
            [cx - 30, D + 48],
          ],
          1.8,
          2.6,
        ),
      );
      this.roads.push(
        ...this.symLine(
          [
            [-1.5, mid],
            [-12, mid],
            [-26, mid + 1],
            [-48, mid - 2],
            [-74, mid - 7],
            [-110, mid - 4],
            [-170, mid + 8],
            [-260, mid + 4],
            [-420, mid + 10],
          ],
          1.6,
          2.2,
        ),
      );
      this.clearings.push(...this.sym(-37, mid).map(([x, z]) => ({ x, z, r: 22 })));
    }
    const crops: Field["crop"][] = ["wheat", "plow", "green", "wheat", "fallow", "plow", "green", "wheat"];
    const districts: [number, number, number, number, number][] = [
      [-70, -46, 4, 3, 0.08],
      [-64, 54, 4, 2, -0.06],
      [8, -64, 2, 2, 0.05],
    ];
    let k = 0;
    for (const [x0, z0, nx, nz, rot] of districts) {
      const fw = 14;
      const fd = 11;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const u = (i - (nx - 1) / 2) * fw;
          const v = (j - (nz - 1) / 2) * fd;
          const fx = x0 + u * c + v * sn;
          const fz = z0 - u * sn + v * c;
          const crop = crops[(k++ * 5 + i * 3 + j) % crops.length];
          const f: Field = { cx: fx, cz: fz, hw: fw / 2 - 0.9, hd: fd / 2 - 0.9, rot, crop };
          const cornersOk = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
            [0, 0],
          ].every(([a, b2]) => {
            const px = fx + (a * (fw / 2) * c + b2 * (fd / 2) * sn);
            const pz = fz + (-a * (fw / 2) * sn + b2 * (fd / 2) * c);
            return this.boxDist(px, pz) > 6 && !this.blocked(px, pz, 1.5);
          });
          if (!cornersOk) continue;
          if (hash(i, j, x0) < 0.08) continue;
          this.fields.push(f);
          if (this.mirror === "x")
            this.fields.push({ ...f, cx: W - f.cx, rot: -f.rot, crop: crops[(k + 3) % crops.length] });
        }
      }
    }
  }

  private designCrag(): void {
    const { W, D } = this;
    const midW = D / 2;
    this.roads.push(
      ...this.symLine(
        [
          [-1, midW],
          [-12, midW + 1],
          [-30, midW - 2],
          [-52, midW + 4],
          [-80, midW + 2],
          [-130, midW + 10],
          [-220, midW + 2],
          [-420, midW + 14],
        ],
        1.5,
        2,
      ),
    );
    this.roads.push(
      line(
        [
          [-1, D + 1],
          [-10, D + 10],
          [-24, D + 22],
          [-40, D + 40],
          [-70, D + 66],
        ],
        1.4,
        1.6,
      ),
    );
    this.roads.push(
      line(
        [
          [W + 1, -1],
          [W + 10, -10],
          [W + 22, -24],
          [W + 40, -40],
          [W + 66, -70],
        ],
        1.4,
        1.6,
      ),
    );
    const R = 44;
    const ring: [number, number][] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2 + 0.13;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const k = 1 / Math.max(Math.abs(c), Math.abs(sn)) ** 0.6;
      ring.push([W / 2 + c * (W / 2 + R) * k * 0.82, D / 2 + sn * (D / 2 + R) * k * 0.82]);
    }
    this.roads.push(line(ring, 1.3, 1.3));
    this.clearings.push({ x: -26, z: D + 24, r: 10 }, { x: W + 24, z: -26, r: 10 });
  }

  private valleyAxis: Line[] = [];

  private designAlpine(): void {
    const c = this.D / 2;
    const road: [number, number][] = [
      [-1, c],
      [-10, c - 3],
      [-18, c + 5],
      [-27, c - 3],
      [-36, c + 5],
      [-47, c - 1],
      [-62, c + 3],
      [-82, c],
      [-110, c + 6],
      [-160, c - 4],
      [-240, c + 8],
      [-420, c],
    ];
    this.roads.push(...this.symLine(road, 1.4, 2.2));
    this.valleyAxis.push(
      ...this.symLine(
        [
          [-1, c],
          [-40, c + 1],
          [-90, c + 3],
          [-170, c - 4],
          [-420, c + 2],
        ],
        1,
        1,
      ),
    );
    for (const [x, z] of this.sym(-78, c + 1)) this.lakes.push({ x, z, rx: 15, rz: 15 });
    this.cirques.push(
      ...this.symLine(
        [
          [20, 20],
          [6, 6],
          [-14, -10],
          [-40, -30],
          [-80, -56],
          [-150, -110],
          [-420, -300],
        ],
        1,
        1,
      ),
    );
  }

  private cirques: Line[] = [];

  private cirqueDepth(x: number, z: number, d: number): number {
    let v = 0;
    for (const a of this.cirques) {
      const n = near(a, x, z, 90);
      if (n.d === Infinity) continue;
      v = Math.max(v, Math.exp(-((n.d / (20 + d * 0.3)) ** 2)));
    }
    return v;
  }

  private alpineVale(x: number, z: number, d: number): number {
    let v = 0;
    for (const a of this.valleyAxis) {
      const n = near(a, x, z, 120);
      if (n.d === Infinity) continue;
      const wdt = 16 + d * 0.28;
      v = Math.max(v, Math.exp(-((n.d / wdt) ** 2)));
    }
    return v;
  }

  private alpineH(x: number, z: number, d: number): number {
    const s = this.seed;
    const rg = ridge(x * 0.011, z * 0.011, s + 5);
    let peaks = 12 + smooth(0, 60, d) * (14 + rg * rg * 70) + smooth(60, 260, d) * (20 + rg * 60);
    peaks += (fbm(x * 0.05, z * 0.05, 3, s) - 0.5) * 3;
    const vale = this.alpineVale(x, z, d);
    const floor = 3.6 - Math.min(40, d * 0.24) + (fbm(x * 0.03, z * 0.03, 3, s + 2) - 0.5) * 4;
    let h = lerp(peaks, floor, vale);
    const cq = this.cirqueDepth(x, z, d);
    if (cq > 0) h = lerp(h, -7 - Math.min(38, d * 0.2) + (fbm(x * 0.04, z * 0.04, 3, s + 6) - 0.5) * 5, cq);
    for (const l of this.lakes) {
      const e = Math.hypot(x - l.x, z - l.z) / l.rx;
      if (e < 1.5) h = lerp(Math.min(h, floor - 0.6), h, smooth(0.85, 1.3, e));
    }
    for (const r of this.roads) {
      const n = near(r, x, z, 5);
      if (n.d < 4) h = lerp(h, floor + (h - floor) * 0.15, smooth(4, n.w, n.d) * vale);
    }
    return h;
  }

  private alpinePaint(x: number, z: number, h: number, slope: number, d: number): Paint {
    const s = this.seed;
    const p: Paint = { grass: 0, dirt: 1, rock: 0, cobble: 0, sand: 1, tint: [1, 1, 1] };
    const n = fbm(x * 0.06, z * 0.06, 3, s + 41);
    p.tint = [0.96 + n * 0.08, 0.98 + n * 0.06, 1.04 + n * 0.04];
    const vale = this.alpineVale(x, z, d);
    const forest =
      smooth(0.35, 0.6, vale) * smooth(2, -30, h) * smooth(0.42, 0.56, fbm(x * 0.035, z * 0.035, 3, s + 42));
    if (forest > 0) {
      p.grass = forest * 0.8;
      p.dirt = 1 - p.grass;
      p.tint = [lerp(p.tint[0], 0.66, forest), lerp(p.tint[1], 0.82, forest), lerp(p.tint[2], 0.72, forest)];
    }
    p.rock = smooth(0.95, 1.4, slope + (n - 0.5) * 0.3);
    if (p.rock > 0) {
      const g = 0.85 + noise(x * 0.1, z * 0.1, s + 43) * 0.25;
      p.tint = [lerp(p.tint[0], 0.78 * g, p.rock), lerp(p.tint[1], 0.84 * g, p.rock), lerp(p.tint[2], 1.0 * g, p.rock)];
    }
    const glacier = smooth(30, 45, h) * (1 - p.rock) * smooth(0.5, 0.7, fbm(x * 0.02, z * 0.02, 2, s + 44));
    if (glacier > 0)
      p.tint = [lerp(p.tint[0], 0.82, glacier), lerp(p.tint[1], 0.95, glacier), lerp(p.tint[2], 1.25, glacier)];
    for (const l of this.lakes) {
      const e = Math.hypot(x - l.x, z - l.z) / l.rx;
      if (e < 1.05) {
        const k = smooth(1.05, 0.9, e);
        p.rock = Math.min(p.rock, 1 - k);
        p.tint = [lerp(p.tint[0], 0.7, k), lerp(p.tint[1], 0.88, k), lerp(p.tint[2], 1.2, k)];
      }
    }
    for (const r of this.roads) {
      const q = near(r, x, z, 4);
      if (q.d < 3) {
        const k = smooth(q.w + 0.6, q.w * 0.4, q.d);
        p.sand = 1 - k * 0.85;
        p.tint = [lerp(p.tint[0], 0.9, k), lerp(p.tint[1], 0.86, k), lerp(p.tint[2], 0.82, k)];
      }
    }
    return p;
  }

  private alpineFeatures(): void {
    const road = this.roads[0];
    const total = road.len[road.len.length - 1];
    for (let u = 6; u < 90; u += 7) {
      const p = pointAt(road, u / total);
      const sg = Math.floor(u / 7) % 2 ? 1 : -1;
      const off = 2.4;
      this.add(
        {
          t: u % 14 < 7 ? "lantern" : "fence",
          x: p.x + Math.cos(p.ang) * off * sg,
          z: p.z - Math.sin(p.ang) * off * sg,
          rot: p.ang,
          s: 1,
          seed: u,
        },
        false,
      );
    }
    for (let i = 0; i < 6; i++) {
      const p = pointAt(road, (30 + i * 9) / total);
      const sg = i % 2 ? 1 : -1;
      const off = 7 + hash(i, 4) * 3;
      const x = p.x + Math.cos(p.ang) * off * sg;
      const z = p.z - Math.sin(p.ang) * off * sg;
      if (this.alpineVale(x, z, this.boxDist(x, z)) < 0.5) continue;
      this.add({
        t: "cabin",
        x,
        z,
        rot: p.ang + (sg > 0 ? Math.PI / 2 : -Math.PI / 2),
        s: 0.9 + hash(i, 5) * 0.3,
        seed: i,
        side: 0,
      });
    }
    const lake = this.lakes[0];
    if (lake) this.add({ t: "shrine", x: lake.x + 2, z: lake.z - lake.rz - 5, rot: 0, s: 1, seed: 3 }, true);
    this.add({ t: "cairn", x: -4, z: this.D / 2 - 7, rot: 0, s: 1, seed: 1 }, false);
    this.add({ t: "cairn", x: -5, z: this.D / 2 + 8, rot: 1, s: 1.2, seed: 2 }, false);
    const ok = (x: number, z: number) =>
      this.canonical(x, z) &&
      this.boxDist(x, z) > 3 &&
      !this.blocked(x, z, 2) &&
      !this.lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.rx + 2);
    this.scatter(
      260,
      (r) => this.ring(r, 6, 110),
      (x, z) => {
        if (!ok(x, z)) return false;
        const d = this.boxDist(x, z);
        const h = this.ground(x, z);
        const v = this.alpineVale(x, z, d);
        return v > 0.3 && h < 4 && fbm(x * 0.035, z * 0.035, 3, this.seed + 42) > 0.45;
      },
      (x, z, r) => this.add({ t: "pine", x, z, rot: r() * 6, s: 1.2 + r() * 1.0, seed: Math.floor(r() * 9999) }, false),
      51,
    );
    this.scatter(
      60,
      (r) => this.ring(r, 2, 40),
      (x, z) => ok(x, z) && this.ground(x, z) < 18,
      (x, z, r) =>
        this.add(
          { t: r() < 0.65 ? "rock" : "cairn", x, z, rot: r() * 6, s: 0.7 + r() * 0.9, seed: Math.floor(r() * 9999) },
          false,
        ),
      52,
    );
  }

  private canal = 11;

  private designGarden(): void {
    this.roads.push(
      ...this.symLine(
        [
          [-15, -15],
          [-30, -30],
          [-50, -50],
        ],
        1.6,
        1.6,
      ),
    );
    this.roads.push(
      ...this.symLine(
        [
          [30, -15],
          [30, -42],
          [24, -60],
        ],
        1.2,
        1.2,
      ),
    );
    this.roads.push(
      ...this.symLine(
        [
          [-15, 30],
          [-42, 30],
          [-60, 24],
        ],
        1.2,
        1.2,
      ),
    );
  }

  private gardenH(x: number, z: number, d: number): number {
    const s = this.seed;
    let h = 1.0 + (fbm(x * 0.04, z * 0.04, 3, s) - 0.5) * 0.5;
    const rg = ridge(x * 0.008, z * 0.008, s + 5);
    h += smooth(70, 240, d) * (14 + rg * 34) + smooth(40, 90, d) * 3 * fbm(x * 0.02, z * 0.02, 2, s + 1);
    const c = Math.abs(d - this.canal);
    if (c < 4) h = lerp(-0.2, h, smooth(2.6, 3.4, c));
    for (const r of this.roads) {
      const n = near(r, x, z, 3);
      if (n.d < 3) h = lerp(h, 1.05, smooth(3, n.w, n.d));
    }
    return h;
  }

  private gardenPaint(x: number, z: number, h: number, slope: number, d: number): Paint {
    const s = this.seed;
    const p: Paint = { grass: 1, dirt: 0, rock: 0, cobble: 0, sand: 0, tint: [1, 1, 1] };
    const n = fbm(x * 0.05, z * 0.05, 3, s + 41);
    const ax = Math.abs(x - this.W / 2) > Math.abs(z - this.D / 2) ? z : x;
    const stripe = d > 15 && d < 60 ? (Math.floor(ax / 3.5) % 2 ? 1.05 : 0.93) : 1;
    p.tint = [0.95 * stripe + n * 0.08, 1.02 * stripe + n * 0.06, 0.9 * stripe];
    if (d < 5.5) {
      const k = smooth(5.5, 4.5, d);
      p.grass = 1 - k;
      p.dirt = k;
      p.sand = k;
    }
    const c = Math.abs(d - this.canal);
    if (c < 4) {
      const k = smooth(4, 3.2, c);
      p.cobble = k;
      p.grass *= 1 - k;
      if (c < 2.8) {
        p.cobble = 0;
        p.dirt = 1;
        p.sand = 0;
        p.tint = [0.7, 0.72, 0.62];
      }
    }
    for (const r of this.roads) {
      const q = near(r, x, z, 3);
      if (q.d < q.w + 0.6) {
        const k = smooth(q.w + 0.6, q.w - 0.2, q.d);
        p.grass *= 1 - k;
        p.dirt = Math.max(p.dirt, k);
        p.sand = Math.max(p.sand ?? 0, k);
      }
    }
    const far = smooth(60, 120, d);
    if (far > 0)
      p.tint = [lerp(p.tint[0], 0.78 + n * 0.1, far), lerp(p.tint[1], 0.92 + n * 0.08, far), lerp(p.tint[2], 0.7, far)];
    p.rock = smooth(0.9, 1.3, slope + (n - 0.5) * 0.3);
    return p;
  }

  private gardenFeatures(): void {
    const ok = (x: number, z: number, pad = 1.5) =>
      this.canonical(x, z) &&
      this.boxDist(x, z) > 1.5 &&
      !this.blocked(x, z, pad) &&
      Math.abs(this.boxDist(x, z) - this.canal) > 4.5;
    const both = (
      t: string,
      x: number,
      z: number,
      rot: number,
      sc: number,
      seed: number,
      extra: Record<string, number> = {},
    ) => {
      this.add({ t, x, z, rot, s: sc, seed, ...extra } as never, false);
      if (Math.abs(x - z) > 0.5)
        this.add({ t, x: z, z: x, rot: -Math.PI / 2 - rot, s: sc, seed: seed + 1, ...extra } as never, false);
    };
    for (let x = 3; x < 50; x += 6.2) both("hedgerow", x + 3, -1.1, 0, 1, Math.floor(x), { len: 6 });
    this.add({ t: "hedgerow", x: -1.1, z: -1.1, rot: Math.PI / 4, s: 1, seed: 7, len: 3 } as never, false);
    const k = this.canal / Math.SQRT2;
    this.add({ t: "bridge", x: -k, z: -k, rot: Math.PI / 4, s: 1, seed: 1, w: 10 } as never, false);
    both("bridge", 30, -this.canal, 0, 1, 2, { w: 9 });
    this.add({ t: "manor", x: -58, z: -58, rot: -Math.PI * 0.75, s: 1, seed: 3, side: 0 });
    for (let u = 20; u < 70; u += 5.5) {
      const a = u / Math.SQRT2;
      for (const sg of [-1, 1])
        this.add(
          {
            t: "tree",
            x: -a + sg * 3.1,
            z: -a - sg * 3.1,
            rot: u,
            s: 1.0 + hash(u, sg) * 0.25,
            seed: Math.floor(u * 7 + sg),
          } as never,
          false,
        );
    }
    both("gazebo", 40, -26, 0, 1, 4);
    both("fountain", 14, -34, 0, 0.6, 5);
    for (const [x, z] of [
      [8, -20],
      [20, -20],
      [8, -46],
      [20, -46],
    ] as const)
      both("topiary", x, z, 0, 1.3, x * 3 + z);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) both("flowers", 10 + i * 3, -30 - j * 3 - (i % 2) * 1.5, 0, 1.6, i * 7 + j);
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 3; j++) both("tree", 36 + j * 5.5, -40 - i * 5, 0, 0.75, i * 11 + j);
    this.scatter(
      70,
      (r) => this.ring(r, 60, 150),
      (x, z) => ok(x, z, 2) && fbm(x * 0.03, z * 0.03, 3, this.seed + 42) > 0.5,
      (x, z, r) =>
        this.add(
          {
            t: r() < 0.5 ? "pine" : "tree",
            x,
            z,
            rot: r() * 6,
            s: 1.3 + r() * 0.9,
            seed: Math.floor(r() * 9999),
          } as never,
          false,
        ),
      61,
    );
    this.scatter(
      24,
      (r) => this.ring(r, 20, 60),
      (x, z) => ok(x, z, 3),
      (x, z, r) =>
        this.add(
          {
            t: r() < 0.5 ? "bush" : "tree",
            x,
            z,
            rot: r() * 6,
            s: 0.9 + r() * 0.5,
            seed: Math.floor(r() * 9999),
          } as never,
          false,
        ),
      62,
    );
  }

  private designSea(): void {
    const { W, D } = this;
    const cx = W / 2;
    for (const e of this.exits) {
      const sym = this.sym(...this.exitPoint(e, 0));
      if (sym.length > 1 && (sym[1][0] < sym[0][0] || (sym[1][0] === sym[0][0] && sym[1][1] < sym[0][1]))) continue;
      const [x, z] = this.exitPoint(e, -2);
      const [ox, oz] = this.exitPoint(e, 40);
      const bend =
        e.edge === "n" || e.edge === "s" ? [ox + (hash(x, z) - 0.5) * 16, oz] : [ox, oz + (hash(x, z) - 0.5) * 16];
      this.rivers.push(
        ...this.symLine(
          [[x, z], [(x + bend[0]) / 2, (z + bend[1]) / 2], bend as [number, number]],
          e.width * 0.6,
          e.width * 1.6,
        ),
      );
    }
    const isl: Spot[] = [
      { x: -150, z: -120, r: 38 },
      { x: cx + 40, z: -230, r: 60 },
      { x: -260, z: 40, r: 70 },
      { x: -70, z: -60, r: 9 },
    ];
    for (const s of isl) for (const [x, z] of this.sym(s.x, s.z)) this.islands.push({ x, z, r: s.r });
  }

  private blocked(x: number, z: number, pad: number): boolean {
    for (const r of this.rivers) if (near(r, x, z, pad + 10).d < pad + r.w1) return true;
    for (const r of this.roads) if (near(r, x, z, pad + 4).d < pad) return true;
    for (const l of this.lakes) if (((x - l.x) / (l.rx + pad)) ** 2 + ((z - l.z) / (l.rz + pad)) ** 2 < 1) return true;
    return false;
  }

  private fieldAt(x: number, z: number): { f: Field; u: number; v: number } | null {
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

  height(x: number, z: number): number {
    const d = this.boxDist(x, z);
    let h: number;
    if (this.style === "valley") h = this.valleyH(x, z, d);
    else if (this.style === "crag") h = this.cragH(x, z, d);
    else if (this.style === "alpine") h = this.alpineH(x, z, d);
    else if (this.style === "garden") h = this.gardenH(x, z, d);
    else h = this.seaH(x, z, d);
    return h;
  }

  ground(x: number, z: number): number {
    const d = this.boxDist(x, z);
    const L = this.height(x, z);
    if (d >= 7) return L;
    const ex = Math.round(Math.min(this.W, Math.max(0, x)));
    const ez = Math.round(Math.min(this.D, Math.max(0, z)));
    const eh = this.t.vertexHeight(ex, ez);
    return lerp(eh, L, smooth(0, 7, d));
  }

  private riverDist(x: number, z: number, pad: number): number {
    let best = Infinity;
    for (const r of this.rivers) {
      const n = near(r, x, z, r.w1 + pad);
      if (n.d !== Infinity) best = Math.min(best, n.d - n.w);
    }
    return best;
  }

  private carveWater(x: number, z: number, h: number, bed: number, bank: number, vale = 0): number {
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

  private valleyH(x: number, z: number, d: number): number {
    const s = this.seed;
    let h = 4.3 + (fbm(x * 0.035, z * 0.035, 3, s) - 0.5) * 2.4;
    const hills = smooth(18, 95, d) * (fbm(x * 0.018, z * 0.018, 4, s + 3) * 22);
    const rg = ridge(x * 0.008, z * 0.008, s + 5);
    const mtn = smooth(100, 300, d) * (12 + rg * rg * 95);
    let vmask = 0;
    const main = this.rivers[this.rivers.length - 1];
    if (main) {
      const n = near(main, x, z, 90);
      if (n.d < 90) vmask = Math.exp(-((n.d / (26 + n.t * 40)) ** 2));
    }
    for (const c of this.clearings) {
      const k = Math.exp(-(((x - c.x) ** 2 + (z - c.z) ** 2) / (c.r * c.r)));
      vmask = Math.max(vmask, k * 0.9);
    }
    h += (hills + mtn) * (1 - vmask * 0.92);
    for (const r of this.roads) {
      const n = near(r, x, z, 6);
      if (n.d < 4) h = lerp(h, Math.min(h, 4.6 + (h - 4.6) * 0.3), smooth(4, 1.5, n.d) * (1 - smooth(20, 45, d)));
    }
    return this.carveWater(x, z, h, -1.7, 3.2, 26);
  }

  private cragH(x: number, z: number, d: number): number {
    const s = this.seed;
    let big = 4.4 + smooth(22, 120, d) * (fbm(x * 0.018, z * 0.018, 4, s + 3) - 0.3) * 20;
    const rg = ridge(x * 0.008, z * 0.008, s + 5);
    big += smooth(130, 320, d) * (6 + rg * rg * 70);
    let detail = (fbm(x * 0.045, z * 0.045, 3, s) - 0.5) * 1.4;
    for (const r of this.roads) {
      const n = near(r, x, z, 5);
      if (n.d < 4) detail *= 1 - 0.8 * smooth(4, n.w, n.d);
    }
    let h = big + detail;
    const ditch = Math.exp(-(((d - 5.6) / 2.1) ** 2));
    h -= ditch * 2.6 * smooth(0.5, 2.5, d);
    return h;
  }

  private seaH(x: number, z: number, d: number): number {
    const s = this.seed;
    let flats = 0.05 + (fbm(x * 0.07, z * 0.07, 4, s) - 0.5) * 1.3;
    const pool = smooth(0.6, 0.72, noise(x * 0.11 + 4, z * 0.11, s + 8)) * smooth(3, 8, d);
    flats -= pool * 1.4;
    flats -= smooth(0.45, 0.5, Math.abs(noise(x * 0.05, z * 0.05, s + 9) - 0.5) < 0.04 ? 0.5 : 0) * 0;
    const drop = smooth(10 + fbm(x * 0.04, z * 0.04, 2, s + 1) * 14, 46, d);
    let h = lerp(flats, -7 - fbm(x * 0.02, z * 0.02, 3, s + 2) * 5, drop);
    const bars = ridge(x * 0.03 + 3, z * 0.06, s + 3);
    h = Math.max(h, lerp(-9, 0.45, smooth(0.62, 0.9, bars)) - smooth(30, 120, d) * 6);
    for (const i of this.islands) {
      const a = Math.atan2(z - i.z, x - i.x);
      const wob = 1 + (noise(Math.cos(a) * 1.8 + i.x * 0.01, Math.sin(a) * 1.8 + i.z * 0.01, 61) - 0.5) * 0.9;
      const r = Math.hypot(x - i.x, z - i.z) / (i.r * wob);
      if (r < 1.3)
        h = Math.max(
          h,
          (1 - smooth(0.2, 1.1 + noise(x * 0.08, z * 0.08, s) * 0.2, r)) * (i.r * 0.38 + 1.5) -
            1.2 +
            ridge(x * 0.05, z * 0.05, s + 7) * 4 * (1 - r),
        );
    }
    return this.carveWater(x, z, h, -2.6, 3);
  }

  paint(x: number, z: number, h: number, slope: number): Paint {
    const d = this.boxDist(x, z);
    if (this.style === "valley") return this.valleyPaint(x, z, h, slope, d);
    if (this.style === "crag") return this.cragPaint(x, z, h, slope, d);
    if (this.style === "alpine") return this.alpinePaint(x, z, h, slope, d);
    if (this.style === "garden") return this.gardenPaint(x, z, h, slope, d);
    return this.seaPaint(x, z, h, slope, d);
  }

  private valleyPaint(x: number, z: number, h: number, slope: number, d: number): Paint {
    const s = this.seed;
    const p: Paint = { grass: 1, dirt: 0, rock: 0, cobble: 0, tint: [1, 1, 1] };
    const n = fbm(x * 0.05, z * 0.05, 3, s + 11);
    p.tint = [0.92 + n * 0.16, 1.0 + (n - 0.5) * 0.08, 0.9 + (1 - n) * 0.12];
    const forest = smooth(0.52, 0.62, fbm(x * 0.03, z * 0.03, 3, s + 12)) * smooth(22, 60, d);
    p.tint = [p.tint[0] * (1 - forest * 0.35), p.tint[1] * (1 - forest * 0.22), p.tint[2] * (1 - forest * 0.3)];
    const fa = this.fieldAt(x, z);
    if (fa) {
      const rows = 0.5 + 0.5 * Math.sin(fa.v * 3.1);
      const edge = smooth(0, 0.8, Math.min(fa.f.hw - Math.abs(fa.u), fa.f.hd - Math.abs(fa.v)));
      if (fa.f.crop === "plow") {
        p.grass = 1 - edge;
        p.dirt = edge;
        const k = 0.72 + rows * 0.3;
        p.tint = [0.86 * k, 0.8 * k, 0.72 * k];
      } else if (fa.f.crop === "wheat") {
        p.grass = 1 - edge * 0.7;
        p.dirt = edge * 0.7;
        p.tint = [1.3 + rows * 0.08, 1.12 + rows * 0.06, 0.55];
      } else if (fa.f.crop === "green") {
        p.tint = [0.7 + rows * 0.2, 0.92 + rows * 0.12, 0.62 + rows * 0.1];
      } else {
        p.tint = [1.08, 1.08, 0.86];
      }
    }
    for (const r of this.roads) {
      const q = near(r, x, z, 4);
      if (q.d < 3) {
        const k = smooth(q.w + 1.2, q.w * 0.6, q.d + (noise(x * 0.8, z * 0.8, s) - 0.5) * 0.8);
        p.dirt = Math.max(p.dirt, k);
        p.grass = Math.min(p.grass, 1 - k);
        if (d < 40) {
          const c = smooth(q.w * 0.9, q.w * 0.5, q.d);
          p.cobble = c;
          p.dirt = Math.max(0, p.dirt - c);
        }
      }
    }
    if (h < 0.6) {
      const k = smooth(0.6, -0.2, h);
      p.dirt = Math.max(p.dirt, k);
      p.grass = Math.min(p.grass, 1 - k);
    }
    for (const c of this.clearings) {
      const k =
        smooth(c.r * 0.55, c.r * 0.2, Math.hypot(x - c.x, z - c.z)) *
        smooth(0.45, 0.7, noise(x * 0.25, z * 0.25, s + 9));
      p.dirt = Math.max(p.dirt, k * 0.8);
      p.grass = Math.min(p.grass, 1 - k * 0.8);
    }
    const hn = h + (noise(x * 0.05, z * 0.05, s + 14) - 0.5) * 16;
    const rocky = Math.max(smooth(0.9, 1.35, slope), smooth(38, 58, hn));
    p.rock = rocky;
    if (h > 12) {
      const pine =
        smooth(12, 22, hn) * (1 - smooth(34, 48, hn)) * smooth(0.4, 0.55, fbm(x * 0.04, z * 0.04, 3, s + 15));
      p.tint = [p.tint[0] * (1 - pine * 0.45), p.tint[1] * (1 - pine * 0.3), p.tint[2] * (1 - pine * 0.35)];
    }
    if (rocky > 0) {
      const g = 0.95 + noise(x * 0.08, z * 0.08, s + 16) * 0.25;
      const bank = smooth(8, 3, h);
      p.tint = [
        lerp(p.tint[0], lerp(0.8, 1.0, bank) * g, rocky),
        lerp(p.tint[1], lerp(0.95, 0.95, bank) * g, rocky),
        lerp(p.tint[2], lerp(1.28, 0.85, bank) * g, rocky),
      ];
    }
    const snow = smooth(66, 88, hn + slope * -6);
    if (snow > 0) p.tint = [lerp(p.tint[0], 2.3, snow), lerp(p.tint[1], 2.35, snow), lerp(p.tint[2], 2.5, snow)];
    return p;
  }

  private cragPaint(x: number, z: number, h: number, slope: number, d: number): Paint {
    const s = this.seed;
    const p: Paint = { grass: 1, dirt: 0, rock: 0, cobble: 0, tint: [1, 1, 1] };
    const n = fbm(x * 0.06, z * 0.06, 3, s + 21);
    const heath = smooth(0.5, 0.66, fbm(x * 0.035, z * 0.035, 3, s + 24)) * smooth(30, 70, d);
    p.tint = [lerp(1.02 + n * 0.1, 0.98, heath), lerp(0.9 + n * 0.06, 0.8, heath), lerp(0.6 + n * 0.06, 0.8, heath)];
    const town = 1 - smooth(40, 70, d);
    const rub = smooth(0.5, 0.72, noise(x * 0.22, z * 0.22, s + 22)) * town;
    const bare = smooth(0.68, 0.8, noise(x * 0.12, z * 0.12, s + 25)) * 0.4;
    p.cobble = rub * 0.55;
    p.dirt = Math.max(bare, rub * 0.4);
    p.grass = Math.max(0, 1 - p.cobble - p.dirt);
    const ditch = Math.exp(-(((d - 5.6) / 2.1) ** 2)) * smooth(0.5, 2.5, d);
    if (ditch > 0.25) {
      p.dirt = Math.max(p.dirt, ditch * 0.7);
      p.grass = Math.max(0, 1 - p.dirt - p.cobble);
      p.tint = [p.tint[0] * (1 - ditch * 0.15), p.tint[1] * (1 - ditch * 0.12), p.tint[2] * (1 - ditch * 0.1)];
    }
    for (const r of this.roads) {
      const q = near(r, x, z, 4);
      if (q.d < 3.5) {
        const k = smooth(q.w + 0.8, q.w * 0.5, q.d + (noise(x * 0.9, z * 0.9, s) - 0.5) * 0.9);
        const broken = smooth(0.55, 0.75, noise(x * 0.4, z * 0.4, s + 28));
        p.cobble = Math.max(p.cobble, k * (1 - broken * 0.6));
        p.dirt = Math.max(p.dirt, k * broken * 0.6);
        p.grass = Math.max(0, 1 - p.cobble - p.dirt);
      }
    }
    p.rock = Math.max(smooth(0.85, 1.2, slope), smooth(30, 55, h));
    if (p.rock > 0) {
      const g = 0.9 + noise(x * 0.1, z * 0.1, s + 26) * 0.2;
      p.tint = [lerp(p.tint[0], 0.8 * g, p.rock), lerp(p.tint[1], 0.83 * g, p.rock), lerp(p.tint[2], 0.95 * g, p.rock)];
    }
    const snow = smooth(62, 90, h + (noise(x * 0.07, z * 0.07, s + 23) - 0.5) * 20);
    if (snow > 0) p.tint = [lerp(p.tint[0], 2.1, snow), lerp(p.tint[1], 2.15, snow), lerp(p.tint[2], 2.35, snow)];
    return p;
  }

  private seaPaint(x: number, z: number, h: number, slope: number, d: number): Paint {
    const s = this.seed;
    const p: Paint = { grass: 0, dirt: 1, rock: 0, cobble: 0, sand: 1, tint: [1, 1, 1] };
    const n = fbm(x * 0.08, z * 0.08, 3, s + 31);
    const wet = smooth(0.9, -0.3, h);
    p.tint = [lerp(1.12, 0.78, wet) + n * 0.06, lerp(1.1, 0.8, wet) + n * 0.05, lerp(1.04, 0.78, wet) + n * 0.04];
    const green = smooth(2.2, 4, h) * smooth(0.35, 0.6, noise(x * 0.1, z * 0.1, s + 32));
    p.grass = green;
    p.dirt = 1 - green;
    if (green > 0) p.tint = [lerp(p.tint[0], 0.95, green), lerp(p.tint[1], 1.02, green), lerp(p.tint[2], 0.82, green)];
    for (const i of this.islands) {
      const r = Math.hypot(x - i.x, z - i.z) / i.r;
      if (r < 0.75 && h > 2.5) {
        const k = smooth(0.75, 0.45, r);
        p.grass = Math.max(p.grass, k);
        p.dirt = 1 - p.grass;
        p.tint = [lerp(p.tint[0], 0.78, k), lerp(p.tint[1], 0.95, k), lerp(p.tint[2], 0.7, k)];
      }
    }
    p.rock = smooth(0.7, 1.05, slope);
    if (h < -2) {
      const k = smooth(-2, -9, h);
      p.tint = [p.tint[0] * (1 - k * 0.45), p.tint[1] * (1 - k * 0.3), p.tint[2] * (1 - k * 0.1)];
    }
    void d;
    return p;
  }

  private add(f: Omit<SFeature, "y" | "side"> & { side?: number }, mirrorSide = true, single = false): void {
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

  private scatter(
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

  private canonical(x: number, z: number): boolean {
    if (this.mirror === "x") return x <= this.W / 2;
    if (this.mirror === "diag") return x <= z;
    if (this.mirror === "rot") return x < this.W / 2 || (x === this.W / 2 && z <= this.D / 2);
    if (this.mirror === "quad") return x < this.W / 2 && z <= this.D / 2;
    return true;
  }

  private placeFeatures(): void {
    if (this.style === "valley") this.valleyFeatures();
    else if (this.style === "crag") this.cragFeatures();
    else if (this.style === "alpine") this.alpineFeatures();
    else if (this.style === "garden") this.gardenFeatures();
    else this.seaFeatures();
  }

  private ring(r: () => number, d0: number, d1: number): [number, number] {
    const a = r() * Math.PI * 2;
    const d = d0 + (d1 - d0) * Math.sqrt(r());
    const ex = this.W / 2 + Math.cos(a) * (this.W / 2 + d);
    const ez = this.D / 2 + Math.sin(a) * (this.D / 2 + d);
    return [ex, ez];
  }

  private valleyFeatures(): void {
    const { W } = this;
    const cx = W / 2;
    const road = this.roads.find((r) => r.pts[0][0] < 0);
    if (road) {
      const mid = road.pts[0][1];
      this.add({ t: "gatehouse", x: -1.2, z: mid, rot: Math.PI / 2, s: 1, seed: 1, side: 0 });
      const total = road.len[road.len.length - 1];
      for (let i = 0; i < 16; i++) {
        const p = pointAt(road, (24 + i * 4.6) / total);
        if (this.boxDist(p.x, p.z) < 22) continue;
        const sideSign = i % 2 ? 1 : -1;
        const off = 6.5 + hash(i, 1) * 2.5;
        const nx = Math.cos(p.ang) * sideSign;
        const nz = -Math.sin(p.ang) * sideSign;
        const hx = p.x + nx * off;
        const hz = p.z + nz * off;
        if (this.blocked(hx, hz, 3.5) && !this.roads.every((r) => near(r, hx, hz, 4).d > 3)) continue;
        if (this.rivers.some((r) => near(r, hx, hz, 6).d < r.w1 + 3)) continue;
        const kind = hash(i, 2) < 0.18 ? "barn" : "house";
        this.add({
          t: kind,
          x: hx,
          z: hz,
          rot: p.ang + (sideSign > 0 ? Math.PI / 2 : -Math.PI / 2),
          s: 0.9 + hash(i, 3) * 0.3,
          seed: i,
          side: 0,
        });
      }
      for (const r of this.rivers) {
        for (const rd of this.roads) {
          for (let i = 0; i < rd.pts.length; i++) {
            const [x, z] = rd.pts[i];
            const n = near(r, x, z, 3);
            if (n.d < 0.8 && this.canonical(x, z)) {
              const p = pointAt(rd, rd.len[i] / rd.len[rd.len.length - 1]);
              this.add({ t: "bridge", x, z, rot: p.ang, s: 1, w: n.w * 2 + 3, seed: i, side: 0 });
              break;
            }
          }
        }
      }
      this.add({ t: "well", x: -37, z: mid + 6.5, rot: 0.3, s: 1, seed: 3, side: 0 });
      this.add({ t: "banner", x: -6, z: mid - 4, rot: Math.PI / 2, s: 1.2, seed: 4, side: 0 });
      this.add({ t: "banner", x: -6, z: mid + 4, rot: Math.PI / 2, s: 1.2, seed: 5, side: 0 });
    }
    this.add({ t: "windmill", x: -30, z: -36, rot: 0.6, s: 1.3, seed: 7, side: 0 });
    this.add({ t: "windmill", x: -64, z: 70, rot: -0.4, s: 1.1, seed: 8, side: 0 });
    for (const f of this.fields) {
      if (!this.canonical(f.cx, f.cz)) continue;
      const c = Math.cos(f.rot);
      const s = Math.sin(f.rot);
      const corner = (u: number, v: number): [number, number] => [f.cx + u * c + v * s, f.cz - u * s + v * c];
      const edges: [[number, number], [number, number]][] = [
        [corner(-f.hw - 0.8, -f.hd - 0.8), corner(f.hw + 0.8, -f.hd - 0.8)],
        [corner(f.hw + 0.8, -f.hd - 0.8), corner(f.hw + 0.8, f.hd + 0.8)],
        [corner(f.hw + 0.8, f.hd + 0.8), corner(-f.hw - 0.8, f.hd + 0.8)],
        [corner(-f.hw - 0.8, f.hd + 0.8), corner(-f.hw - 0.8, -f.hd - 0.8)],
      ];
      edges.forEach(([a, b], ei) => {
        const kind = hash(f.cx, f.cz, ei) < 0.5 ? "hedge" : "fence";
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const gap = hash(f.cx, f.cz, ei + 9);
        for (let u = 0; u < len; u += 2.2) {
          const t = u / len;
          if (Math.abs(t - gap) < 0.12) continue;
          const x = a[0] + (b[0] - a[0]) * t;
          const z = a[1] + (b[1] - a[1]) * t;
          if (this.blocked(x, z, 0.4)) continue;
          this.add(
            { t: kind, x, z, rot: Math.atan2(b[0] - a[0], b[1] - a[1]), s: 1, seed: Math.floor(x * 31 + z * 17) },
            false,
          );
        }
      });
      if (f.crop === "wheat") {
        for (let u = -f.hw + 1.2; u < f.hw - 0.6; u += 1.4) {
          for (let v = -f.hd + 1; v < f.hd - 0.6; v += 1.6) {
            const [x, z] = corner(u + (hash(u, v, f.cx) - 0.5) * 0.5, v);
            this.add({ t: "wheat", x, z, rot: f.rot, s: 1, seed: Math.floor(u * 7 + v * 13) }, false);
          }
        }
      } else if (f.crop === "fallow" && hash(f.cx, f.cz, 20) < 0.7) {
        for (let i = 0; i < 4; i++) {
          const [x, z] = corner((hash(f.cx, i, 21) - 0.5) * f.hw * 1.4, (hash(f.cz, i, 22) - 0.5) * f.hd * 1.4);
          this.add({ t: "haystack", x, z, rot: hash(i, f.cx) * 6, s: 0.9 + hash(i, f.cz) * 0.3, seed: i }, false);
        }
      }
    }
    const clear = (x: number, z: number, pad: number) =>
      this.canonical(x, z) &&
      !this.blocked(x, z, pad) &&
      !this.fieldAt(x, z) &&
      !this.fields.some((f) => Math.hypot(f.cx - x, f.cz - z) < Math.max(f.hw, f.hd) + pad + 1) &&
      !this.features.some(
        (f) =>
          (f.t === "house" || f.t === "barn" || f.t === "windmill" || f.t === "gatehouse") &&
          Math.hypot(f.x - x, f.z - z) < 7,
      );
    this.scatter(
      240,
      (r) => this.ring(r, 2, 28),
      (x, z) => {
        const d = this.boxDist(x, z);
        return d > 1.6 && clear(x, z, 1.2) && (d < 9 || fbm(x * 0.05, z * 0.05, 2, 41) > 0.42);
      },
      (x, z, r) =>
        this.add(
          { t: r() < 0.6 ? "pine" : "tree", x, z, rot: r() * 6, s: 1.0 + r() * 0.7, seed: Math.floor(r() * 9999) },
          false,
        ),
      5,
    );
    this.scatter(
      300,
      (r) => this.ring(r, 22, 110),
      (x, z) => {
        const d = this.boxDist(x, z);
        const forest = smooth(0.52, 0.62, fbm(x * 0.03, z * 0.03, 3, this.seed + 12)) * smooth(22, 60, d);
        return forest > 0.35 && clear(x, z, 2);
      },
      (x, z, r) =>
        this.add(
          {
            t: this.ground(x, z) > 16 || r() < 0.75 ? "pine" : "tree",
            x,
            z,
            rot: r() * 6,
            s: 1.3 + r() * 1.0,
            seed: Math.floor(r() * 9999),
          },
          false,
        ),
      6,
    );
    this.scatter(
      50,
      (r) => this.ring(r, 10, 70),
      (x, z) => clear(x, z, 1.5),
      (x, z, r) =>
        this.add(
          { t: r() < 0.5 ? "bush" : "rock", x, z, rot: r() * 6, s: 0.7 + r() * 0.8, seed: Math.floor(r() * 9999) },
          false,
        ),
      7,
    );
    void cx;
  }

  private cragFeatures(): void {
    const { W, D } = this;
    const roadNear = (x: number, z: number, pad: number) =>
      this.roads.some((r) => near(r, x, z, pad + 3).d < r.w1 + pad);
    const taken: Spot[] = [];
    const free = (x: number, z: number, r: number) => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r);
    const claim = (x: number, z: number, r: number) => {
      for (const [a, b] of this.sym(x, z)) taken.push({ x: a, z: b, r });
    };
    const o = 10.5;
    const wall = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      for (let u = 0; u < len; u += 2) {
        const t = u / len;
        const x = x0 + (x1 - x0) * t;
        const z = z0 + (z1 - z0) * t;
        if (!this.canonical(x, z) || roadNear(x, z, 1.5)) continue;
        const keep = noise(u * 0.16, x0 + z0 * 0.3, 51);
        if (keep < 0.34) {
          if (keep > 0.22)
            this.add({ t: "rubble", x, z, rot: hash(x, z) * 6, s: 1, seed: Math.floor(x * 13 + z) }, false);
          continue;
        }
        this.add(
          {
            t: "ruinwall",
            x,
            z,
            rot: Math.atan2(x1 - x0, z1 - z0),
            s: 1,
            h: 0.8 + keep * 3.4,
            seed: Math.floor(x * 7 + z * 3),
          },
          false,
        );
      }
    };
    wall(-o, -o, W + o, -o);
    wall(W + o, -o, W + o, D + o);
    wall(W + o, D + o, -o, D + o);
    wall(-o, D + o, -o, -o);
    for (const [x, z] of [
      [-o, D + o],
      [-o, D / 2 - 9],
      [-o, D / 2 + 9],
    ] as const) {
      this.add({ t: "ruintower", x, z, rot: 0.4, s: 1, seed: Math.floor(x * 3 + z) }, false);
      claim(x, z, 4);
    }
    for (const r of this.roads.slice(0, 2)) {
      const p0 = r.pts[0];
      if (!this.canonical(p0[0], p0[1])) continue;
      const total = r.len[r.len.length - 1];
      const p = pointAt(r, 5.6 / total);
      this.add({ t: "bridge", x: p.x, z: p.z, rot: p.ang, s: 1, w: 8, seed: 3 }, true);
      claim(p.x, p.z, 4);
      for (let u = 18; u < 62; u += 5.5) {
        const q = pointAt(r, u / total);
        for (const sg of [-1, 1]) {
          const off = 5.5 + hash(u, sg) * 2.5;
          const hx = q.x + Math.cos(q.ang) * off * sg;
          const hz = q.z - Math.sin(q.ang) * off * sg;
          if (!this.canonical(hx, hz) || roadNear(hx, hz, 2.6) || !free(hx, hz, 3)) continue;
          if (hash(u, sg, 4) < 0.2) continue;
          const kind = hash(u, sg, 5) < 0.75 ? "ruinhouse" : "rubble";
          this.add(
            {
              t: kind,
              x: hx,
              z: hz,
              rot: q.ang + (sg > 0 ? Math.PI / 2 : -Math.PI / 2),
              s: 0.95 + hash(u, sg, 6) * 0.3,
              seed: Math.floor(u * 10 + sg),
            },
            false,
          );
          claim(hx, hz, 3.2);
        }
      }
    }
    const gy = this.clearings[0];
    this.add({ t: "chapel", x: gy.x + 5, z: gy.z - 5, rot: -0.7, s: 1, seed: 7 }, true);
    claim(gy.x + 5, gy.z - 5, 6);
    for (let i = 0; i < 14; i++) {
      const gx = gy.x - 6 + (i % 5) * 2.4 + (hash(i, 1) - 0.5) * 0.6;
      const gz = gy.z - 2 + Math.floor(i / 5) * 3.2 + (hash(i, 2) - 0.5) * 0.6;
      this.add({ t: "grave", x: gx, z: gz, rot: -0.7 + (hash(i, 3) - 0.5) * 0.3, s: 1, seed: i }, true);
    }
    for (let i = 0; i < 3; i++)
      this.add({ t: "deadtree", x: gy.x - 9 + i * 7, z: gy.z + 8 - i * 2, rot: i, s: 1.4, seed: 70 + i }, true);
    this.add({ t: "well", x: -20, z: D / 2 - 7, rot: 0.3, s: 1, seed: 4 }, false);
    this.add({ t: "column", x: -24, z: D / 2 - 9.5, rot: 1.1, s: 1, h: 0.2, seed: 5 }, false);
    this.add({ t: "column", x: -17, z: D / 2 - 11, rot: 0, s: 1, h: 0.9, seed: 6 }, false);
    claim(-20, D / 2 - 8, 6);
    const okTown = (x: number, z: number) => {
      const d = this.boxDist(x, z);
      return this.canonical(x, z) && d > 13 && d < 48 && !roadNear(x, z, 2.5) && free(x, z, 3.2);
    };
    this.scatter(
      20,
      (r) => this.ring(r, 13, 48),
      okTown,
      (x, z, r) => {
        const k = r();
        this.add(
          {
            t: k < 0.55 ? "ruinhouse" : k < 0.75 ? "ruintower" : "rubble",
            x,
            z,
            rot: r() * 6,
            s: 0.9 + r() * 0.35,
            seed: Math.floor(r() * 9999),
          },
          false,
        );
        claim(x, z, 3.5);
      },
      11,
    );
    const okOpen = (pad: number) => (x: number, z: number) =>
      this.canonical(x, z) &&
      this.boxDist(x, z) > 3 &&
      !roadNear(x, z, 1.5) &&
      free(x, z, pad) &&
      Math.abs(this.boxDist(x, z) - 5.6) > 3;
    this.scatter(
      50,
      (r) => this.ring(r, 9, 45),
      okOpen(1.2),
      (x, z, r) => {
        const k = r();
        this.add(
          {
            t: k < 0.35 ? "rubble" : k < 0.55 ? "bush" : k < 0.75 ? "rock" : k < 0.9 ? "column" : "deadtree",
            x,
            z,
            rot: r() * 6,
            s: 0.7 + r() * 0.6,
            seed: Math.floor(r() * 9999),
            h: r(),
          },
          false,
        );
      },
      12,
    );
    const groves: Spot[] = [];
    for (let i = 0; i < 16; i++) {
      const a = hash(i, 1, 90) * Math.PI * 2;
      const dd = 30 + hash(i, 2, 90) * 70;
      groves.push({
        x: W / 2 + Math.cos(a) * (W / 2 + dd),
        z: D / 2 + Math.sin(a) * (D / 2 + dd),
        r: 9 + hash(i, 3, 90) * 9,
      });
    }
    groves.forEach((g, gi) => {
      const dead = gi % 3 === 0;
      this.scatter(
        10,
        (r) => [g.x + (r() - 0.5) * g.r * 2, g.z + (r() - 0.5) * g.r * 2],
        okOpen(1.5),
        (x, z, r) =>
          this.add(
            {
              t: dead || r() < 0.3 ? "deadtree" : r() < 0.5 ? "pine" : "tree",
              x,
              z,
              rot: r() * 6,
              s: 1.1 + r() * 0.9,
              seed: Math.floor(r() * 9999),
            },
            false,
          ),
        Math.floor(g.x * 3 + g.z),
      );
    });
  }

  private seaFeatures(): void {
    const { W, D } = this;
    const ok = (x: number, z: number, pad = 1.5) =>
      this.canonical(x, z) && this.boxDist(x, z) > 1.5 && !this.blocked(x, z, pad);
    const midW = D / 2;
    const wl = this.t.waterLevel;
    const shore = (z: number) => {
      for (let x = -2; x > -90; x -= 0.5) if (this.ground(x, z) < wl - 0.4) return x;
      return -90;
    };
    for (const [z, len] of [
      [midW - 7, 14],
      [midW + 5, 18],
    ] as const) {
      const sx = shore(z) + 3;
      this.add({ t: "pier", x: sx, z, rot: -Math.PI / 2, s: 1, w: len, seed: Math.floor(z), side: 0 });
      this.add({
        t: "boat",
        x: sx - len * 0.6,
        z: z + 3.4,
        rot: -Math.PI / 2 + 0.15,
        s: 1.1,
        seed: Math.floor(z) + 3,
        side: 0,
      });
      this.add({ t: "hut", x: sx + 4, z: z - 3.5, rot: Math.PI / 2, s: 1, seed: Math.floor(z) + 5, side: 0 });
    }
    this.add({ t: "boat", x: shore(midW) - 26, z: midW - 2, rot: -1.2, s: 1.4, seed: 21, side: 0 });
    this.add({ t: "lighthouse", x: -26, z: -24, rot: 0.2, s: 1, seed: 3, side: 0 });
    this.add({ t: "wreck", x: 18, z: -30, rot: 0.7, s: 1.3, seed: 4 });
    this.add({ t: "wreck", x: -48, z: 66, rot: 2.1, s: 1.0, seed: 5 });
    this.scatter(
      3,
      (r) => this.ring(r, 8, 30),
      (x, z) => ok(x, z, 6) && Math.abs(this.ground(x, z) - wl) < 0.6,
      (x, z, r) =>
        this.add({ t: "stilthut", x, z, rot: r() * 6, s: 0.9 + r() * 0.3, seed: Math.floor(r() * 9999) }, false),
      31,
    );
    this.scatter(
      6,
      (r) => this.ring(r, 18, 70),
      (x, z) => ok(x, z, 8) && this.ground(x, z) < -1.5,
      (x, z, r) =>
        this.add({ t: "seastack", x, z, rot: r() * 6, s: 1.1 + r() * 0.8, seed: Math.floor(r() * 9999) }, false),
      32,
    );
    this.scatter(
      10,
      (r) => this.ring(r, 10, 50),
      (x, z) => ok(x, z, 4) && this.ground(x, z) < -1.2,
      (x, z, r) => this.add({ t: "buoy", x, z, rot: r() * 6, s: 1, seed: Math.floor(r() * 9999) }, false),
      34,
    );
    this.scatter(
      40,
      (r) => this.ring(r, 2, 26),
      (x, z) => ok(x, z, 1) && this.ground(x, z) > wl - 0.3 && this.ground(x, z) < 1.2,
      (x, z, r) => {
        const k = r();
        this.add(
          {
            t: k < 0.45 ? "rock" : k < 0.55 ? "posts" : k < 0.8 ? "kelp" : "shells",
            x,
            z,
            rot: r() * 6,
            s: 0.6 + r() * 0.8,
            seed: Math.floor(r() * 9999),
          },
          false,
        );
      },
      33,
    );
    for (const i of this.islands) {
      if (!this.canonical(i.x, i.z)) continue;
      const n = Math.round(i.r * 1.4);
      this.scatter(
        n,
        (r) => [i.x + (r() - 0.5) * i.r * 1.4, i.z + (r() - 0.5) * i.r * 1.4],
        (x, z) => this.ground(x, z) > 3,
        (x, z, r) =>
          this.add({ t: "pine", x, z, rot: r() * 6, s: 1.4 + r() * 1.4, seed: Math.floor(r() * 9999) }, false),
        Math.floor(i.x),
      );
    }
    void W;
  }
}

export function surroundFor(t: Terrain): Surround | null {
  return t.surround ? new Surround(t, t.surround as SurroundStyle, t.symmetry) : null;
}
