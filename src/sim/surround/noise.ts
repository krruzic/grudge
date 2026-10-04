// Deterministic value noise helpers for the decorative surround (sin-hash based; not used by the simulation).
export const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function hash(x: number, z: number, s = 0): number {
  const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

export function noise(x: number, z: number, s = 0): number {
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

export function fbm(x: number, z: number, oct: number, s = 0): number {
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

export function ridge(x: number, z: number, s = 0): number {
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
