// Polylines for rivers, roads and valley axes: Catmull-Rom splines sampled every ~3 units, with per-chunk bounding
// boxes so nearest-point queries (near) can skip most segments.
import { lerp } from "./noise.ts";

export interface Line {
  pts: [number, number][];
  w0: number;
  w1: number;
  box: [number, number, number, number];
  len: number[];
  chunks: { i0: number; i1: number; box: [number, number, number, number] }[];
}

/** Segments per bounding-box chunk. */
const CHUNK = 8;

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

export function line(ctrl: [number, number][], w0: number, w1 = w0): Line {
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

export function near(l: Line, x: number, z: number, pad: number): { d: number; t: number; w: number; ang: number } {
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

export function pointAt(l: Line, t: number): { x: number; z: number; ang: number } {
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
