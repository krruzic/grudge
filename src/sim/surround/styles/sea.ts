// Sea surround (shoals): sand flats dropping off into the sea, sandbars and mirrored islands.
import type { Surround, Paint, Spot } from "../../surround.ts";
import { fbm, hash, lerp, noise, ridge, smooth } from "../noise.ts";

export function designSea(sur: Surround): void {
  const { W } = sur;
  const cx = W / 2;
  for (const e of sur.exits) {
    const sym = sur.sym(...sur.exitPoint(e, 0));
    if (sym.length > 1 && (sym[1][0] < sym[0][0] || (sym[1][0] === sym[0][0] && sym[1][1] < sym[0][1]))) continue;
    const [x, z] = sur.exitPoint(e, -2);
    const [ox, oz] = sur.exitPoint(e, 40);
    const bend =
      e.edge === "n" || e.edge === "s" ? [ox + (hash(x, z) - 0.5) * 16, oz] : [ox, oz + (hash(x, z) - 0.5) * 16];
    sur.rivers.push(
      ...sur.symLine(
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
  for (const s of isl) for (const [x, z] of sur.sym(s.x, s.z)) sur.islands.push({ x, z, r: s.r });
}

export function seaH(sur: Surround, x: number, z: number, d: number): number {
  const s = sur.seed;
  let flats = 0.05 + (fbm(x * 0.07, z * 0.07, 4, s) - 0.5) * 1.3;
  const pool = smooth(0.6, 0.72, noise(x * 0.11 + 4, z * 0.11, s + 8)) * smooth(3, 8, d);
  flats -= pool * 1.4;
  const drop = smooth(10 + fbm(x * 0.04, z * 0.04, 2, s + 1) * 14, 46, d);
  let h = lerp(flats, -7 - fbm(x * 0.02, z * 0.02, 3, s + 2) * 5, drop);
  const bars = ridge(x * 0.03 + 3, z * 0.06, s + 3);
  h = Math.max(h, lerp(-9, 0.45, smooth(0.62, 0.9, bars)) - smooth(30, 120, d) * 6);
  for (const i of sur.islands) {
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
  return sur.carveWater(x, z, h, -2.6, 3);
}

export function seaPaint(sur: Surround, x: number, z: number, h: number, slope: number, d: number): Paint {
  const s = sur.seed;
  const p: Paint = { grass: 0, dirt: 1, rock: 0, cobble: 0, sand: 1, tint: [1, 1, 1] };
  const n = fbm(x * 0.08, z * 0.08, 3, s + 31);
  const wet = smooth(0.9, -0.3, h);
  p.tint = [lerp(1.12, 0.78, wet) + n * 0.06, lerp(1.1, 0.8, wet) + n * 0.05, lerp(1.04, 0.78, wet) + n * 0.04];
  const green = smooth(2.2, 4, h) * smooth(0.35, 0.6, noise(x * 0.1, z * 0.1, s + 32));
  p.grass = green;
  p.dirt = 1 - green;
  if (green > 0) p.tint = [lerp(p.tint[0], 0.95, green), lerp(p.tint[1], 1.02, green), lerp(p.tint[2], 0.82, green)];
  for (const i of sur.islands) {
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
  return p;
}

export function seaFeatures(sur: Surround): void {
  const { D } = sur;
  const ok = (x: number, z: number, pad = 1.5) =>
    sur.canonical(x, z) && sur.boxDist(x, z) > 1.5 && !sur.blocked(x, z, pad);
  const midW = D / 2;
  const wl = sur.t.waterLevel;
  const shore = (z: number) => {
    for (let x = -2; x > -90; x -= 0.5) if (sur.ground(x, z) < wl - 0.4) return x;
    return -90;
  };
  for (const [z, len] of [
    [midW - 7, 14],
    [midW + 5, 18],
  ] as const) {
    const sx = shore(z) + 3;
    sur.add({ t: "pier", x: sx, z, rot: -Math.PI / 2, s: 1, w: len, seed: Math.floor(z), side: 0 });
    sur.add({
      t: "boat",
      x: sx - len * 0.6,
      z: z + 3.4,
      rot: -Math.PI / 2 + 0.15,
      s: 1.1,
      seed: Math.floor(z) + 3,
      side: 0,
    });
    sur.add({ t: "hut", x: sx + 4, z: z - 3.5, rot: Math.PI / 2, s: 1, seed: Math.floor(z) + 5, side: 0 });
  }
  sur.add({ t: "boat", x: shore(midW) - 26, z: midW - 2, rot: -1.2, s: 1.4, seed: 21, side: 0 });
  sur.add({ t: "lighthouse", x: -26, z: -24, rot: 0.2, s: 1, seed: 3, side: 0 });
  sur.add({ t: "wreck", x: 18, z: -30, rot: 0.7, s: 1.3, seed: 4 });
  sur.add({ t: "wreck", x: -48, z: 66, rot: 2.1, s: 1.0, seed: 5 });
  sur.scatter(
    3,
    (r) => sur.ring(r, 8, 30),
    (x, z) => ok(x, z, 6) && Math.abs(sur.ground(x, z) - wl) < 0.6,
    (x, z, r) =>
      sur.add({ t: "stilthut", x, z, rot: r() * 6, s: 0.9 + r() * 0.3, seed: Math.floor(r() * 9999) }, false),
    31,
  );
  sur.scatter(
    6,
    (r) => sur.ring(r, 18, 70),
    (x, z) => ok(x, z, 8) && sur.ground(x, z) < -1.5,
    (x, z, r) =>
      sur.add({ t: "seastack", x, z, rot: r() * 6, s: 1.1 + r() * 0.8, seed: Math.floor(r() * 9999) }, false),
    32,
  );
  sur.scatter(
    10,
    (r) => sur.ring(r, 10, 50),
    (x, z) => ok(x, z, 4) && sur.ground(x, z) < -1.2,
    (x, z, r) => sur.add({ t: "buoy", x, z, rot: r() * 6, s: 1, seed: Math.floor(r() * 9999) }, false),
    34,
  );
  sur.scatter(
    40,
    (r) => sur.ring(r, 2, 26),
    (x, z) => ok(x, z, 1) && sur.ground(x, z) > wl - 0.3 && sur.ground(x, z) < 1.2,
    (x, z, r) => {
      const k = r();
      sur.add(
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
  for (const i of sur.islands) {
    if (!sur.canonical(i.x, i.z)) continue;
    const n = Math.round(i.r * 1.4);
    sur.scatter(
      n,
      (r) => [i.x + (r() - 0.5) * i.r * 1.4, i.z + (r() - 0.5) * i.r * 1.4],
      (x, z) => sur.ground(x, z) > 3,
      (x, z, r) => sur.add({ t: "pine", x, z, rot: r() * 6, s: 1.4 + r() * 1.4, seed: Math.floor(r() * 9999) }, false),
      Math.floor(i.x),
    );
  }
}
