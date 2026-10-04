// Garden surround (gardens): a canal ring, hedged parterres and ornamental garden features.
import type { Surround, Paint } from "../../surround.ts";
import { fbm, hash, lerp, ridge, smooth } from "../noise.ts";
import { near } from "../lines.ts";

export function designGarden(sur: Surround): void {
  sur.roads.push(
    ...sur.symLine(
      [
        [-15, -15],
        [-30, -30],
        [-50, -50],
      ],
      1.6,
      1.6,
    ),
  );
  sur.roads.push(
    ...sur.symLine(
      [
        [30, -15],
        [30, -42],
        [24, -60],
      ],
      1.2,
      1.2,
    ),
  );
  sur.roads.push(
    ...sur.symLine(
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

export function gardenH(sur: Surround, x: number, z: number, d: number): number {
  const s = sur.seed;
  let h = 1.0 + (fbm(x * 0.04, z * 0.04, 3, s) - 0.5) * 0.5;
  const rg = ridge(x * 0.008, z * 0.008, s + 5);
  h += smooth(70, 240, d) * (14 + rg * 34) + smooth(40, 90, d) * 3 * fbm(x * 0.02, z * 0.02, 2, s + 1);
  const c = Math.abs(d - sur.canal);
  if (c < 4) h = lerp(-0.2, h, smooth(2.6, 3.4, c));
  for (const r of sur.roads) {
    const n = near(r, x, z, 3);
    if (n.d < 3) h = lerp(h, 1.05, smooth(3, n.w, n.d));
  }
  return h;
}

export function gardenPaint(sur: Surround, x: number, z: number, h: number, slope: number, d: number): Paint {
  const s = sur.seed;
  const p: Paint = { grass: 1, dirt: 0, rock: 0, cobble: 0, sand: 0, tint: [1, 1, 1] };
  const n = fbm(x * 0.05, z * 0.05, 3, s + 41);
  const ax = Math.abs(x - sur.W / 2) > Math.abs(z - sur.D / 2) ? z : x;
  const stripe = d > 15 && d < 60 ? (Math.floor(ax / 3.5) % 2 ? 1.05 : 0.93) : 1;
  p.tint = [0.95 * stripe + n * 0.08, 1.02 * stripe + n * 0.06, 0.9 * stripe];
  if (d < 5.5) {
    const k = smooth(5.5, 4.5, d);
    p.grass = 1 - k;
    p.dirt = k;
    p.sand = k;
  }
  const c = Math.abs(d - sur.canal);
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
  for (const r of sur.roads) {
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

export function gardenFeatures(sur: Surround): void {
  const ok = (x: number, z: number, pad = 1.5) =>
    sur.canonical(x, z) &&
    sur.boxDist(x, z) > 1.5 &&
    !sur.blocked(x, z, pad) &&
    Math.abs(sur.boxDist(x, z) - sur.canal) > 4.5;
  const both = (
    t: string,
    x: number,
    z: number,
    rot: number,
    sc: number,
    seed: number,
    extra: Record<string, number> = {},
  ) => {
    sur.add({ t, x, z, rot, s: sc, seed, ...extra } as never, false);
    if (Math.abs(x - z) > 0.5)
      sur.add({ t, x: z, z: x, rot: -Math.PI / 2 - rot, s: sc, seed: seed + 1, ...extra } as never, false);
  };
  for (let x = 3; x < 50; x += 6.2) both("hedgerow", x + 3, -1.1, 0, 1, Math.floor(x), { len: 6 });
  sur.add({ t: "hedgerow", x: -1.1, z: -1.1, rot: Math.PI / 4, s: 1, seed: 7, len: 3 } as never, false);
  const k = sur.canal / Math.SQRT2;
  sur.add({ t: "bridge", x: -k, z: -k, rot: Math.PI / 4, s: 1, seed: 1, w: 10 } as never, false);
  both("bridge", 30, -sur.canal, 0, 1, 2, { w: 9 });
  sur.add({ t: "manor", x: -58, z: -58, rot: -Math.PI * 0.75, s: 1, seed: 3, side: 0 });
  for (let u = 20; u < 70; u += 5.5) {
    const a = u / Math.SQRT2;
    for (const sg of [-1, 1])
      sur.add(
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
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) both("tree", 36 + j * 5.5, -40 - i * 5, 0, 0.75, i * 11 + j);
  sur.scatter(
    70,
    (r) => sur.ring(r, 60, 150),
    (x, z) => ok(x, z, 2) && fbm(x * 0.03, z * 0.03, 3, sur.seed + 42) > 0.5,
    (x, z, r) =>
      sur.add(
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
  sur.scatter(
    24,
    (r) => sur.ring(r, 20, 60),
    (x, z) => ok(x, z, 3),
    (x, z, r) =>
      sur.add(
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
