// Alpine surround (frostcross): a switchback road down a valley, glacial cirques, a lake, pine slopes and peaks.
import type { Surround, Paint } from "../../surround.ts";
import { fbm, hash, lerp, noise, ridge, smooth } from "../noise.ts";
import { near, pointAt } from "../lines.ts";

export function designAlpine(sur: Surround): void {
  const c = sur.D / 2;
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
  sur.roads.push(...sur.symLine(road, 1.4, 2.2));
  sur.valleyAxis.push(
    ...sur.symLine(
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
  for (const [x, z] of sur.sym(-78, c + 1)) sur.lakes.push({ x, z, rx: 15, rz: 15 });
  sur.cirques.push(
    ...sur.symLine(
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

function cirqueDepth(sur: Surround, x: number, z: number, d: number): number {
  let v = 0;
  for (const a of sur.cirques) {
    const n = near(a, x, z, 90);
    if (n.d === Infinity) continue;
    v = Math.max(v, Math.exp(-((n.d / (20 + d * 0.3)) ** 2)));
  }
  return v;
}

function alpineVale(sur: Surround, x: number, z: number, d: number): number {
  let v = 0;
  for (const a of sur.valleyAxis) {
    const n = near(a, x, z, 120);
    if (n.d === Infinity) continue;
    const wdt = 16 + d * 0.28;
    v = Math.max(v, Math.exp(-((n.d / wdt) ** 2)));
  }
  return v;
}

export function alpineH(sur: Surround, x: number, z: number, d: number): number {
  const s = sur.seed;
  const rg = ridge(x * 0.011, z * 0.011, s + 5);
  let peaks = 12 + smooth(0, 60, d) * (14 + rg * rg * 70) + smooth(60, 260, d) * (20 + rg * 60);
  peaks += (fbm(x * 0.05, z * 0.05, 3, s) - 0.5) * 3;
  const vale = alpineVale(sur, x, z, d);
  const floor = 3.6 - Math.min(40, d * 0.24) + (fbm(x * 0.03, z * 0.03, 3, s + 2) - 0.5) * 4;
  let h = lerp(peaks, floor, vale);
  const cq = cirqueDepth(sur, x, z, d);
  if (cq > 0) h = lerp(h, -7 - Math.min(38, d * 0.2) + (fbm(x * 0.04, z * 0.04, 3, s + 6) - 0.5) * 5, cq);
  for (const l of sur.lakes) {
    const e = Math.hypot(x - l.x, z - l.z) / l.rx;
    if (e < 1.5) h = lerp(Math.min(h, floor - 0.6), h, smooth(0.85, 1.3, e));
  }
  for (const r of sur.roads) {
    const n = near(r, x, z, 5);
    if (n.d < 4) h = lerp(h, floor + (h - floor) * 0.15, smooth(4, n.w, n.d) * vale);
  }
  return h;
}

export function alpinePaint(sur: Surround, x: number, z: number, h: number, slope: number, d: number): Paint {
  const s = sur.seed;
  const p: Paint = { grass: 0, dirt: 1, rock: 0, cobble: 0, sand: 1, tint: [1, 1, 1] };
  const n = fbm(x * 0.06, z * 0.06, 3, s + 41);
  p.tint = [0.96 + n * 0.08, 0.98 + n * 0.06, 1.04 + n * 0.04];
  const vale = alpineVale(sur, x, z, d);
  const forest = smooth(0.35, 0.6, vale) * smooth(2, -30, h) * smooth(0.42, 0.56, fbm(x * 0.035, z * 0.035, 3, s + 42));
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
  for (const l of sur.lakes) {
    const e = Math.hypot(x - l.x, z - l.z) / l.rx;
    if (e < 1.05) {
      const k = smooth(1.05, 0.9, e);
      p.rock = Math.min(p.rock, 1 - k);
      p.tint = [lerp(p.tint[0], 0.7, k), lerp(p.tint[1], 0.88, k), lerp(p.tint[2], 1.2, k)];
    }
  }
  for (const r of sur.roads) {
    const q = near(r, x, z, 4);
    if (q.d < 3) {
      const k = smooth(q.w + 0.6, q.w * 0.4, q.d);
      p.sand = 1 - k * 0.85;
      p.tint = [lerp(p.tint[0], 0.9, k), lerp(p.tint[1], 0.86, k), lerp(p.tint[2], 0.82, k)];
    }
  }
  return p;
}

export function alpineFeatures(sur: Surround): void {
  const road = sur.roads[0];
  const total = road.len[road.len.length - 1];
  for (let u = 6; u < 90; u += 7) {
    const p = pointAt(road, u / total);
    const sg = Math.floor(u / 7) % 2 ? 1 : -1;
    const off = 2.4;
    sur.add(
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
    if (alpineVale(sur, x, z, sur.boxDist(x, z)) < 0.5) continue;
    sur.add({
      t: "cabin",
      x,
      z,
      rot: p.ang + (sg > 0 ? Math.PI / 2 : -Math.PI / 2),
      s: 0.9 + hash(i, 5) * 0.3,
      seed: i,
      side: 0,
    });
  }
  const lake = sur.lakes[0];
  if (lake) sur.add({ t: "shrine", x: lake.x + 2, z: lake.z - lake.rz - 5, rot: 0, s: 1, seed: 3 }, true);
  sur.add({ t: "cairn", x: -4, z: sur.D / 2 - 7, rot: 0, s: 1, seed: 1 }, false);
  sur.add({ t: "cairn", x: -5, z: sur.D / 2 + 8, rot: 1, s: 1.2, seed: 2 }, false);
  const ok = (x: number, z: number) =>
    sur.canonical(x, z) &&
    sur.boxDist(x, z) > 3 &&
    !sur.blocked(x, z, 2) &&
    !sur.lakes.some((l) => Math.hypot(x - l.x, z - l.z) < l.rx + 2);
  sur.scatter(
    260,
    (r) => sur.ring(r, 6, 110),
    (x, z) => {
      if (!ok(x, z)) return false;
      const d = sur.boxDist(x, z);
      const h = sur.ground(x, z);
      const v = alpineVale(sur, x, z, d);
      return v > 0.3 && h < 4 && fbm(x * 0.035, z * 0.035, 3, sur.seed + 42) > 0.45;
    },
    (x, z, r) => sur.add({ t: "pine", x, z, rot: r() * 6, s: 1.2 + r() * 1.0, seed: Math.floor(r() * 9999) }, false),
    51,
  );
  sur.scatter(
    60,
    (r) => sur.ring(r, 2, 40),
    (x, z) => ok(x, z) && sur.ground(x, z) < 18,
    (x, z, r) =>
      sur.add(
        { t: r() < 0.65 ? "rock" : "cairn", x, z, rot: r() * 6, s: 0.7 + r() * 0.9, seed: Math.floor(r() * 9999) },
        false,
      ),
    52,
  );
}
