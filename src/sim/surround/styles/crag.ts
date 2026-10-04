// Crag surround (ruins): ruined town ground near the map, a ditch around the walls, heath and rocky peaks.
import type { Surround, Paint, Spot } from "../../surround.ts";
import { fbm, hash, lerp, noise, ridge, smooth } from "../noise.ts";
import { line, near, pointAt } from "../lines.ts";

export function designCrag(sur: Surround): void {
  const { W, D } = sur;
  const midW = D / 2;
  sur.roads.push(
    ...sur.symLine(
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
  sur.roads.push(
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
  sur.roads.push(
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
  sur.roads.push(line(ring, 1.3, 1.3));
  sur.clearings.push({ x: -26, z: D + 24, r: 10 }, { x: W + 24, z: -26, r: 10 });
}

export function cragH(sur: Surround, x: number, z: number, d: number): number {
  const s = sur.seed;
  let big = 4.4 + smooth(22, 120, d) * (fbm(x * 0.018, z * 0.018, 4, s + 3) - 0.3) * 20;
  const rg = ridge(x * 0.008, z * 0.008, s + 5);
  big += smooth(130, 320, d) * (6 + rg * rg * 70);
  let detail = (fbm(x * 0.045, z * 0.045, 3, s) - 0.5) * 1.4;
  for (const r of sur.roads) {
    const n = near(r, x, z, 5);
    if (n.d < 4) detail *= 1 - 0.8 * smooth(4, n.w, n.d);
  }
  let h = big + detail;
  const ditch = Math.exp(-(((d - 5.6) / 2.1) ** 2));
  h -= ditch * 2.6 * smooth(0.5, 2.5, d);
  return h;
}

export function cragPaint(sur: Surround, x: number, z: number, h: number, slope: number, d: number): Paint {
  const s = sur.seed;
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
  for (const r of sur.roads) {
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

export function cragFeatures(sur: Surround): void {
  const { W, D } = sur;
  const roadNear = (x: number, z: number, pad: number) => sur.roads.some((r) => near(r, x, z, pad + 3).d < r.w1 + pad);
  const taken: Spot[] = [];
  const free = (x: number, z: number, r: number) => !taken.some((t) => Math.hypot(t.x - x, t.z - z) < t.r + r);
  const claim = (x: number, z: number, r: number) => {
    for (const [a, b] of sur.sym(x, z)) taken.push({ x: a, z: b, r });
  };
  const o = 10.5;
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let u = 0; u < len; u += 2) {
      const t = u / len;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      if (!sur.canonical(x, z) || roadNear(x, z, 1.5)) continue;
      const keep = noise(u * 0.16, x0 + z0 * 0.3, 51);
      if (keep < 0.34) {
        if (keep > 0.22) sur.add({ t: "rubble", x, z, rot: hash(x, z) * 6, s: 1, seed: Math.floor(x * 13 + z) }, false);
        continue;
      }
      sur.add(
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
    sur.add({ t: "ruintower", x, z, rot: 0.4, s: 1, seed: Math.floor(x * 3 + z) }, false);
    claim(x, z, 4);
  }
  for (const r of sur.roads.slice(0, 2)) {
    const p0 = r.pts[0];
    if (!sur.canonical(p0[0], p0[1])) continue;
    const total = r.len[r.len.length - 1];
    const p = pointAt(r, 5.6 / total);
    sur.add({ t: "bridge", x: p.x, z: p.z, rot: p.ang, s: 1, w: 8, seed: 3 }, true);
    claim(p.x, p.z, 4);
    for (let u = 18; u < 62; u += 5.5) {
      const q = pointAt(r, u / total);
      for (const sg of [-1, 1]) {
        const off = 5.5 + hash(u, sg) * 2.5;
        const hx = q.x + Math.cos(q.ang) * off * sg;
        const hz = q.z - Math.sin(q.ang) * off * sg;
        if (!sur.canonical(hx, hz) || roadNear(hx, hz, 2.6) || !free(hx, hz, 3)) continue;
        if (hash(u, sg, 4) < 0.2) continue;
        const kind = hash(u, sg, 5) < 0.75 ? "ruinhouse" : "rubble";
        sur.add(
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
  const gy = sur.clearings[0];
  sur.add({ t: "chapel", x: gy.x + 5, z: gy.z - 5, rot: -0.7, s: 1, seed: 7 }, true);
  claim(gy.x + 5, gy.z - 5, 6);
  for (let i = 0; i < 14; i++) {
    const gx = gy.x - 6 + (i % 5) * 2.4 + (hash(i, 1) - 0.5) * 0.6;
    const gz = gy.z - 2 + Math.floor(i / 5) * 3.2 + (hash(i, 2) - 0.5) * 0.6;
    sur.add({ t: "grave", x: gx, z: gz, rot: -0.7 + (hash(i, 3) - 0.5) * 0.3, s: 1, seed: i }, true);
  }
  for (let i = 0; i < 3; i++)
    sur.add({ t: "deadtree", x: gy.x - 9 + i * 7, z: gy.z + 8 - i * 2, rot: i, s: 1.4, seed: 70 + i }, true);
  sur.add({ t: "well", x: -20, z: D / 2 - 7, rot: 0.3, s: 1, seed: 4 }, false);
  sur.add({ t: "column", x: -24, z: D / 2 - 9.5, rot: 1.1, s: 1, h: 0.2, seed: 5 }, false);
  sur.add({ t: "column", x: -17, z: D / 2 - 11, rot: 0, s: 1, h: 0.9, seed: 6 }, false);
  claim(-20, D / 2 - 8, 6);
  const okTown = (x: number, z: number) => {
    const d = sur.boxDist(x, z);
    return sur.canonical(x, z) && d > 13 && d < 48 && !roadNear(x, z, 2.5) && free(x, z, 3.2);
  };
  sur.scatter(
    20,
    (r) => sur.ring(r, 13, 48),
    okTown,
    (x, z, r) => {
      const k = r();
      sur.add(
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
    sur.canonical(x, z) &&
    sur.boxDist(x, z) > 3 &&
    !roadNear(x, z, 1.5) &&
    free(x, z, pad) &&
    Math.abs(sur.boxDist(x, z) - 5.6) > 3;
  sur.scatter(
    50,
    (r) => sur.ring(r, 9, 45),
    okOpen(1.2),
    (x, z, r) => {
      const k = r();
      sur.add(
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
    sur.scatter(
      10,
      (r) => [g.x + (r() - 0.5) * g.r * 2, g.z + (r() - 0.5) * g.r * 2],
      okOpen(1.5),
      (x, z, r) =>
        sur.add(
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
