// Valley surround (crossing): rivers leaving the map edges join a main river, farm fields, a road with a gatehouse,
// rolling hills rising to snowy mountains.
import type { Surround, Paint, Field } from "../../surround.ts";
import { fbm, hash, lerp, noise, ridge, smooth } from "../noise.ts";
import { line, near, pointAt } from "../lines.ts";

export function designValley(sur: Surround): void {
  const { W, D } = sur;
  const cx = W / 2;
  const north = sur.exits.filter((e) => e.edge === "n" && e.at <= cx);
  const south = sur.exits.filter((e) => e.edge === "s" && e.at <= cx);
  const west = sur.exits.filter((e) => e.edge === "w");
  for (const e of north) {
    const [x] = sur.exitPoint(e, 0);
    sur.rivers.push(
      ...sur.symLine(
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
    sur.rivers.push(
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
    const [x] = sur.exitPoint(e, 0);
    sur.rivers.push(
      ...sur.symLine(
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
  if (south.length) sur.lakes.push({ x: cx, z: D + 46, rx: 34, rz: 18 });
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
    sur.rivers.push(...sur.symLine(loop, 1.6, 1.6));
    sur.rivers.push(
      ...sur.symLine(
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
    sur.roads.push(
      ...sur.symLine(
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
    sur.clearings.push(...sur.sym(-37, mid).map(([x, z]) => ({ x, z, r: 22 })));
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
          return sur.boxDist(px, pz) > 6 && !sur.blocked(px, pz, 1.5);
        });
        if (!cornersOk) continue;
        if (hash(i, j, x0) < 0.08) continue;
        sur.fields.push(f);
        if (sur.mirror === "x")
          sur.fields.push({ ...f, cx: W - f.cx, rot: -f.rot, crop: crops[(k + 3) % crops.length] });
      }
    }
  }
}

export function valleyH(sur: Surround, x: number, z: number, d: number): number {
  const s = sur.seed;
  let h = 4.3 + (fbm(x * 0.035, z * 0.035, 3, s) - 0.5) * 2.4;
  const hills = smooth(18, 95, d) * (fbm(x * 0.018, z * 0.018, 4, s + 3) * 22);
  const rg = ridge(x * 0.008, z * 0.008, s + 5);
  const mtn = smooth(100, 300, d) * (12 + rg * rg * 95);
  let vmask = 0;
  const main = sur.rivers[sur.rivers.length - 1];
  if (main) {
    const n = near(main, x, z, 90);
    if (n.d < 90) vmask = Math.exp(-((n.d / (26 + n.t * 40)) ** 2));
  }
  for (const c of sur.clearings) {
    const k = Math.exp(-(((x - c.x) ** 2 + (z - c.z) ** 2) / (c.r * c.r)));
    vmask = Math.max(vmask, k * 0.9);
  }
  h += (hills + mtn) * (1 - vmask * 0.92);
  for (const r of sur.roads) {
    const n = near(r, x, z, 6);
    if (n.d < 4) h = lerp(h, Math.min(h, 4.6 + (h - 4.6) * 0.3), smooth(4, 1.5, n.d) * (1 - smooth(20, 45, d)));
  }
  return sur.carveWater(x, z, h, -1.7, 3.2, 26);
}

export function valleyPaint(sur: Surround, x: number, z: number, h: number, slope: number, d: number): Paint {
  const s = sur.seed;
  const p: Paint = { grass: 1, dirt: 0, rock: 0, cobble: 0, tint: [1, 1, 1] };
  const n = fbm(x * 0.05, z * 0.05, 3, s + 11);
  p.tint = [0.92 + n * 0.16, 1.0 + (n - 0.5) * 0.08, 0.9 + (1 - n) * 0.12];
  const forest = smooth(0.52, 0.62, fbm(x * 0.03, z * 0.03, 3, s + 12)) * smooth(22, 60, d);
  p.tint = [p.tint[0] * (1 - forest * 0.35), p.tint[1] * (1 - forest * 0.22), p.tint[2] * (1 - forest * 0.3)];
  const fa = sur.fieldAt(x, z);
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
  for (const r of sur.roads) {
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
  for (const c of sur.clearings) {
    const k =
      smooth(c.r * 0.55, c.r * 0.2, Math.hypot(x - c.x, z - c.z)) * smooth(0.45, 0.7, noise(x * 0.25, z * 0.25, s + 9));
    p.dirt = Math.max(p.dirt, k * 0.8);
    p.grass = Math.min(p.grass, 1 - k * 0.8);
  }
  const hn = h + (noise(x * 0.05, z * 0.05, s + 14) - 0.5) * 16;
  const rocky = Math.max(smooth(0.9, 1.35, slope), smooth(38, 58, hn));
  p.rock = rocky;
  if (h > 12) {
    const pine = smooth(12, 22, hn) * (1 - smooth(34, 48, hn)) * smooth(0.4, 0.55, fbm(x * 0.04, z * 0.04, 3, s + 15));
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

export function valleyFeatures(sur: Surround): void {
  const road = sur.roads.find((r) => r.pts[0][0] < 0);
  if (road) {
    const mid = road.pts[0][1];
    sur.add({ t: "gatehouse", x: -1.2, z: mid, rot: Math.PI / 2, s: 1, seed: 1, side: 0 });
    const total = road.len[road.len.length - 1];
    for (let i = 0; i < 16; i++) {
      const p = pointAt(road, (24 + i * 4.6) / total);
      if (sur.boxDist(p.x, p.z) < 22) continue;
      const sideSign = i % 2 ? 1 : -1;
      const off = 6.5 + hash(i, 1) * 2.5;
      const nx = Math.cos(p.ang) * sideSign;
      const nz = -Math.sin(p.ang) * sideSign;
      const hx = p.x + nx * off;
      const hz = p.z + nz * off;
      if (sur.blocked(hx, hz, 3.5) && !sur.roads.every((r) => near(r, hx, hz, 4).d > 3)) continue;
      if (sur.rivers.some((r) => near(r, hx, hz, 6).d < r.w1 + 3)) continue;
      const kind = hash(i, 2) < 0.18 ? "barn" : "house";
      sur.add({
        t: kind,
        x: hx,
        z: hz,
        rot: p.ang + (sideSign > 0 ? Math.PI / 2 : -Math.PI / 2),
        s: 0.9 + hash(i, 3) * 0.3,
        seed: i,
        side: 0,
      });
    }
    for (const r of sur.rivers) {
      for (const rd of sur.roads) {
        for (let i = 0; i < rd.pts.length; i++) {
          const [x, z] = rd.pts[i];
          const n = near(r, x, z, 3);
          if (n.d < 0.8 && sur.canonical(x, z)) {
            const p = pointAt(rd, rd.len[i] / rd.len[rd.len.length - 1]);
            sur.add({ t: "bridge", x, z, rot: p.ang, s: 1, w: n.w * 2 + 3, seed: i, side: 0 });
            break;
          }
        }
      }
    }
    sur.add({ t: "well", x: -37, z: mid + 6.5, rot: 0.3, s: 1, seed: 3, side: 0 });
    sur.add({ t: "banner", x: -6, z: mid - 4, rot: Math.PI / 2, s: 1.2, seed: 4, side: 0 });
    sur.add({ t: "banner", x: -6, z: mid + 4, rot: Math.PI / 2, s: 1.2, seed: 5, side: 0 });
  }
  sur.add({ t: "windmill", x: -30, z: -36, rot: 0.6, s: 1.3, seed: 7, side: 0 });
  sur.add({ t: "windmill", x: -64, z: 70, rot: -0.4, s: 1.1, seed: 8, side: 0 });
  for (const f of sur.fields) {
    if (!sur.canonical(f.cx, f.cz)) continue;
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
        if (sur.blocked(x, z, 0.4)) continue;
        sur.add(
          { t: kind, x, z, rot: Math.atan2(b[0] - a[0], b[1] - a[1]), s: 1, seed: Math.floor(x * 31 + z * 17) },
          false,
        );
      }
    });
    if (f.crop === "wheat") {
      for (let u = -f.hw + 1.2; u < f.hw - 0.6; u += 1.4) {
        for (let v = -f.hd + 1; v < f.hd - 0.6; v += 1.6) {
          const [x, z] = corner(u + (hash(u, v, f.cx) - 0.5) * 0.5, v);
          sur.add({ t: "wheat", x, z, rot: f.rot, s: 1, seed: Math.floor(u * 7 + v * 13) }, false);
        }
      }
    } else if (f.crop === "fallow" && hash(f.cx, f.cz, 20) < 0.7) {
      for (let i = 0; i < 4; i++) {
        const [x, z] = corner((hash(f.cx, i, 21) - 0.5) * f.hw * 1.4, (hash(f.cz, i, 22) - 0.5) * f.hd * 1.4);
        sur.add({ t: "haystack", x, z, rot: hash(i, f.cx) * 6, s: 0.9 + hash(i, f.cz) * 0.3, seed: i }, false);
      }
    }
  }
  const clear = (x: number, z: number, pad: number) =>
    sur.canonical(x, z) &&
    !sur.blocked(x, z, pad) &&
    !sur.fieldAt(x, z) &&
    !sur.fields.some((f) => Math.hypot(f.cx - x, f.cz - z) < Math.max(f.hw, f.hd) + pad + 1) &&
    !sur.features.some(
      (f) =>
        (f.t === "house" || f.t === "barn" || f.t === "windmill" || f.t === "gatehouse") &&
        Math.hypot(f.x - x, f.z - z) < 7,
    );
  sur.scatter(
    240,
    (r) => sur.ring(r, 2, 28),
    (x, z) => {
      const d = sur.boxDist(x, z);
      return d > 1.6 && clear(x, z, 1.2) && (d < 9 || fbm(x * 0.05, z * 0.05, 2, 41) > 0.42);
    },
    (x, z, r) =>
      sur.add(
        { t: r() < 0.6 ? "pine" : "tree", x, z, rot: r() * 6, s: 1.0 + r() * 0.7, seed: Math.floor(r() * 9999) },
        false,
      ),
    5,
  );
  sur.scatter(
    300,
    (r) => sur.ring(r, 22, 110),
    (x, z) => {
      const d = sur.boxDist(x, z);
      const forest = smooth(0.52, 0.62, fbm(x * 0.03, z * 0.03, 3, sur.seed + 12)) * smooth(22, 60, d);
      return forest > 0.35 && clear(x, z, 2);
    },
    (x, z, r) =>
      sur.add(
        {
          t: sur.ground(x, z) > 16 || r() < 0.75 ? "pine" : "tree",
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
  sur.scatter(
    50,
    (r) => sur.ring(r, 10, 70),
    (x, z) => clear(x, z, 1.5),
    (x, z, r) =>
      sur.add(
        { t: r() < 0.5 ? "bush" : "rock", x, z, rot: r() * 6, s: 0.7 + r() * 0.8, seed: Math.floor(r() * 9999) },
        false,
      ),
    7,
  );
}
