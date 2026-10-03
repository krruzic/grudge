import * as THREE from "three";
import heroesData from "../../data/heroes.json";
import { FLAG_DIRT, FLAG_GRASS, FLAG_PAVING, FLAG_TIDE, Kind, type Terrain } from "../sim/terrain";
import type { Surround } from "../sim/surround";

export interface TerrainTextures {
  grass: THREE.Texture;
  dirt: THREE.Texture;
  rock: THREE.Texture;
  cobble: THREE.Texture;
  water: THREE.Texture;
  sand?: THREE.Texture;
  ruin?: { id: THREE.Texture; crack: THREE.Texture };
}

const MARGIN = 48;

function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function vnoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0);
  const b = hash(x0 + 1, z0);
  const c = hash(x0, z0 + 1);
  const d = hash(x0 + 1, z0 + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

export function outerHeight(t: Terrain, x: number, z: number): number {
  const dx = Math.max(0 - x, 0, x - t.width);
  const dz = Math.max(0 - z, 0, z - t.depth);
  const d = Math.hypot(dx, dz);
  const n = vnoise(x * 0.08, z * 0.08) * 0.7 + vnoise(x * 0.2, z * 0.2) * 0.3;
  const blend = Math.min(1, d / 4);
  return t.rimHeight + (n - 0.5) * 0.8 * blend + Math.max(0, d - 16) * 0.22 * (0.6 + n);
}

function prepare(tex: THREE.Texture): THREE.Texture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

function rawData(tex: THREE.Texture): THREE.Texture {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const RUIN_HEAD = `
uniform sampler2D tPavId; uniform sampler2D tCrack; varying vec4 vRuin;
float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), f.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

const RUIN_PAVING = `if (sw.w > 0.0) {
  vec2 pu = wuv / 4.0;
  vec2 pdx = dpx.xz / 4.0; vec2 pdy = dpy.xz / 4.0;
  vec4 pid = textureLod(tPavId, pu, 0.0);
  float code = floor(pid.b * 8.0 + 0.5);
  vec2 cell = floor(pu) + vec2(floor(code / 3.0) - 1.0, mod(code, 3.0) - 1.0);
  float r1 = fract(sin(dot(cell, vec2(12.9898, 78.233)) + pid.r * 91.7) * 43758.5453);
  float r2 = fract(r1 * 13.37 + pid.r * 7.13);
  float r3 = fract(r1 * 31.71 + pid.r * 3.3);
  float sm = pid.g;
  float fn = rNoise(wuv * 1.3) * 0.6 + rNoise(wuv * 3.1 + 7.0) * 0.4;
  vec3 cs = r2 < 0.1 + vRuin.x * 0.3 ? textureGrad(tCrack, pu, pdx, pdy).rgb : textureGrad(tCobble, pu, pdx, pdy).rgb;
  vec3 stoneTint = mix(vec3(0.84, 0.88, 0.94), vec3(1.07, 1.0, 0.86), r3) * (0.8 + 0.32 * r2);
  cs = mix(cs, cs * stoneTint, sm);
  vec3 mossC = textureGrad(tGrass, wuv / 2.5, dpx.xz / 2.5, dpy.xz / 2.5).rgb * vec3(0.6, 0.62, 0.36) * (0.72 + fn * 0.5);
  vec3 dirtC = vec3(dot(textureGrad(tDirt, wuv / 3.0, dpx.xz / 3.0, dpy.xz / 3.0).rgb, vec3(0.4, 0.4, 0.2))) * vec3(0.62, 0.52, 0.4) * (0.75 + fn * 0.5);
  float gm = clamp(vRuin.y * 1.1 + (fn - 0.5) * 0.9, 0.0, 1.0) * (1.0 - sm);
  cs = mix(cs, mossC * 0.8, gm * 0.75);
  float mo = smoothstep(0.66, 0.8, vRuin.y + (fn - 0.5) * 0.6 - sm * 0.12 + (r3 - 0.5) * 0.14);
  cs = mix(cs, mossC, mo);
  float gone = max(step(r1, vRuin.x * 1.15 - 0.06), smoothstep(0.8, 0.92, vRuin.x + (fn - 0.5) * 0.35));
  vec3 holeC = mix(dirtC, mossC * 0.75, smoothstep(0.55, 0.9, vRuin.y + (fn - 0.5) * 0.4)) * mix(0.5, 1.0, smoothstep(0.0, 0.8, sm));
  cs = mix(cs, holeC, gone);
  float pd = smoothstep(0.5, 0.58, vRuin.z + (fn - 0.5) * 0.16);
  cs = mix(cs, vec3(dot(cs, vec3(0.3, 0.4, 0.3))) * vec3(0.5, 0.58, 0.66) + vec3(0.02, 0.03, 0.05), pd * 0.8);
  tsum += cs * sw.w;
}`;

export interface TerrainLight {
  sunDir: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  ambientSky: string;
  ambientGround: string;
  ambientIntensity: number;
}

const PROP_SHADOW: Record<string, [number, number]> = {
  pine: [1.6, 5], tree: [2.0, 4.5], tower: [1.8, 6], arch: [1.2, 3], statue: [0.8, 3], rock: [0.9, 1.2], crate: [0.6, 1], banner: [0.3, 3],
};

const WALK_SLOPE = heroesData.baseline.maxSlope;
const AO_NEAR = [1, 2, 3, 5, 8];
const AO_FAR = [1, 3, 8];

function axis(n: number, sur: Surround | null): number[] {
  if (!sur) {
    const out: number[] = [];
    for (let v = -MARGIN; v <= n + MARGIN; v++) out.push(v);
    return out;
  }
  const steps: [number, number][] = [[24, 1], [64, 2], [160, 4], [sur.far, 8]];
  const lo: number[] = [];
  let v = 0;
  for (const [until, st] of steps) while (v < until) lo.push(-(v += st));
  const mid: number[] = [];
  for (let i = 0; i <= n; i++) mid.push(i);
  const hi = lo.map((d) => n - d);
  return [...lo.reverse(), ...mid, ...hi];
}

function locate(arr: number[], v: number): number {
  let a = 0;
  let b = arr.length - 1;
  if (v <= arr[0]) return 0;
  if (v >= arr[b]) return b;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (arr[m] <= v) a = m;
    else b = m;
  }
  return v - arr[a] < arr[b] - v ? a : b;
}

export function buildTerrainMesh(t: Terrain, tex: TerrainTextures, light?: TerrainLight, sur: Surround | null = null): THREE.Mesh {
  const xs = axis(t.width, sur);
  const zs = axis(t.depth, sur);
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const vw = nx + 1;
  const count = vw * (nz + 1);
  const pos = new Float32Array(count * 3);
  const heights = new Float32Array(count);

  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x <= t.width && z <= t.depth;
  const hAt = (x: number, z: number) => (inside(x, z) ? t.vertexHeight(x, z) : sur ? sur.ground(x, z) : outerHeight(t, x, z));

  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = xs[i];
      const z = zs[j];
      const k = j * vw + i;
      const h = hAt(x, z);
      heights[k] = h;
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
    }
  }

  const idx: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const pi = t.index(xs[i], zs[j]);
      if (pi >= 0 && xs[i] >= 0 && zs[j] >= 0 && xs[i] < t.width && zs[j] < t.depth && t.kinds[pi] === Kind.Wall && t.styles[pi] === "pit") continue;
      const a = j * vw + i;
      const b = a + 1;
      const c = a + vw;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;

  const splat = new Float32Array(count * 4);
  const sandW = new Float32Array(count);
  const altFromGrass = sur?.style === "sea" || sur?.style === "alpine";
  const altFromDirt = sur?.style === "garden";
  const col = new Float32Array(count * 3);
  const cellFlag = (cx: number, cz: number, f: number) => (t.hasFlag(cx, cz, f) ? 1 : 0);
  const nearWall = (x: number, z: number) => {
    for (const [cx, cz] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
      const i = t.index(cx, cz);
      if (i >= 0 && t.kinds[i] === Kind.Wall && t.styles[i] !== "rim" && t.styles[i] !== "pit") return true;
    }
    return false;
  };

  const nearPit = (x: number, z: number) => {
    for (const [cx, cz] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) {
      const i = t.index(cx, cz);
      if (i >= 0 && t.kinds[i] === Kind.Wall && t.styles[i] === "pit") return true;
    }
    return false;
  };

  const ruined = !!tex.ruin;
  const ruinW = ruined ? new Float32Array(count * 4) : null;
  const fbm = (x: number, z: number) => vnoise(x, z) * 0.65 + vnoise(x * 2.3 + 17, z * 2.3 - 5) * 0.35;
  const wallDist = (x: number, z: number) => {
    let best = 3;
    for (let cz = Math.floor(z) - 3; cz <= Math.floor(z) + 2; cz++) {
      for (let cx = Math.floor(x) - 3; cx <= Math.floor(x) + 2; cx++) {
        const i = t.index(cx, cz);
        if (i < 0 || t.kinds[i] !== Kind.Wall || t.styles[i] === "pit") continue;
        best = Math.min(best, Math.hypot(Math.max(cx - x, 0, x - cx - 1), Math.max(cz - z, 0, z - cz - 1)));
      }
    }
    return best;
  };

  const dirs: [number, number][] = [];
  for (let a = 0; a < 8; a++) dirs.push([Math.cos((a / 8) * Math.PI * 2), Math.sin((a / 8) * Math.PI * 2)]);
  const hSample = (x: number, z: number) => {
    if (!sur && (x < xs[0] || z < zs[0] || x > xs[nx] || z > zs[nz])) return -Infinity;
    return heights[locate(zs, z) * vw + locate(xs, x)];
  };

  const L = new THREE.Vector3(...(light?.sunDir ?? [0, 1, 0])).normalize();
  const sunC = new THREE.Color(light?.sunColor ?? "#ffffff").convertSRGBToLinear();
  const amb0 = new THREE.Color(light?.ambientGround ?? "#444444").convertSRGBToLinear();
  const amb1 = new THREE.Color(light?.ambientSky ?? "#aaaaaa").convertSRGBToLinear();
  const CELL = 4;
  const buckets = new Map<number, { x: number; z: number; r: number; r0: number; base: number; top: number }[]>();
  let maxR = 0;
  for (const p of t.props) {
    const ps = PROP_SHADOW[p.type];
    if (!ps) continue;
    const sc = p.scale ?? 1;
    const c = { x: p.x, z: p.z, r: ps[0] * sc, r0: ps[0], base: t.groundHeight(p.x, p.z), top: ps[1] * sc };
    maxR = Math.max(maxR, c.r);
    const key = Math.floor(p.x / CELL) * 4096 + Math.floor(p.z / CELL);
    const list = buckets.get(key) ?? [];
    list.push(c);
    buckets.set(key, list);
  }
  const reach = Math.ceil(maxR / CELL);
  const occ = (x: number, z: number): number => {
    let hh = hSample(x, z);
    if (inside(x, z)) {
      const kind = t.kindAt(Math.floor(x), Math.floor(z));
      if (kind === Kind.Wall) {
        const st = t.styles[t.index(Math.floor(x), Math.floor(z))];
        if (st !== "rim" || !sur) hh = st === "pit" ? -Infinity : t.groundHeight(x, z) + (st === "rim" ? 1.5 : 3.2);
      }
    }
    if (x < -6 || z < -6 || x > t.width + 6 || z > t.depth + 6) return hh;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let j = cz - reach; j <= cz + reach; j++) {
      for (let i = cx - reach; i <= cx + reach; i++) {
        const list = buckets.get(i * 4096 + j);
        if (!list) continue;
        for (const c of list) {
          const d = Math.hypot(c.x - x, c.z - z);
          if (d < c.r) hh = Math.max(hh, c.base + c.top * (1 - (d / c.r0) * 0.3));
        }
      }
    }
    return hh;
  };
  const sunShadow = (x: number, h: number, z: number, far = false): number => {
    let lit = 1;
    for (let d = far ? 2 : 0.6; d < (far ? 120 : 22); d += far ? Math.max(2, d * 0.3) : 0.6) {
      const px = x + L.x * d;
      const pz = z + L.z * d;
      const py = h + L.y * d + 0.15;
      const o = occ(px, pz);
      if (o > py) {
        lit = Math.min(lit, Math.max(0, 1 - (o - py) * 2));
        if (lit <= 0) break;
      }
    }
    return 0.25 + 0.75 * lit;
  };

  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * vw + i;
      const x = xs[i];
      const z = zs[j];
      const h = heights[k];
      const ny = nrm.getY(k);
      const outside = !!sur && !inside(x, z);
      const spacing = Math.max(xs[Math.min(nx, i + 1)] - xs[Math.max(0, i - 1)], zs[Math.min(nz, j + 1)] - zs[Math.max(0, j - 1)]) / 2;

      let dirt = 0;
      let paving = 0;
      let wet = 0;
      if (inside(x, z)) {
        const cells = [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]];
        for (const [cx, cz] of cells) {
          dirt += cellFlag(cx, cz, FLAG_DIRT) / 4;
          paving += cellFlag(cx, cz, FLAG_PAVING) / 4;
          const ci = cx >= 0 && cz >= 0 && cx < t.width && cz < t.depth ? cz * t.width + cx : -1;
          if (ci >= 0 && t.tideCells.length && (t.flags[ci] & FLAG_TIDE) && h < t.waterLevel + 0.7) wet += 0.25;
        }
      }
      if (wet > 0) dirt = Math.max(dirt, wet);
      const wob = (vnoise(x * 0.45, z * 0.45) - 0.5) * 0.7;
      dirt = THREE.MathUtils.smoothstep(dirt + wob, 0.2, 0.75);
      paving = THREE.MathUtils.smoothstep(paving + wob * 0.3, 0.3, 0.7);
      if (h < t.waterLevel + 0.25) dirt = Math.max(dirt, 0.9);
      let slope = 1 - ny > 0 ? Math.sqrt(1 / (ny * ny) - 1) : 0;
      if (inside(x, z)) {
        const g = (px: number, pz: number) => {
          const r = 0.35;
          const gx = (t.groundHeight(px + r, pz) - t.groundHeight(px - r, pz)) / (2 * r);
          const gz = (t.groundHeight(px, pz + r) - t.groundHeight(px, pz - r)) / (2 * r);
          return Math.hypot(gx, gz);
        };
        slope = Math.max(g(x, z), g(x - 0.35, z - 0.35), g(x + 0.35, z - 0.35), g(x - 0.35, z + 0.35), g(x + 0.35, z + 0.35));
      }
      let tint: [number, number, number] = [1, 1, 1];
      if (outside) {
        const pt = sur!.paint(x, z, h, slope);
        const edge = THREE.MathUtils.smoothstep(sur!.boxDist(x, z), 0, 3);
        const rk = Math.max(pt.rock, THREE.MathUtils.smoothstep(slope, WALK_SLOPE - 0.35, WALK_SLOPE - 0.08) * (1 - edge));
        const tot = Math.max(1e-4, pt.grass + pt.dirt + pt.cobble);
        splat[k * 4] = (pt.grass / tot) * (1 - rk);
        splat[k * 4 + 1] = (pt.dirt / tot) * (1 - rk);
        splat[k * 4 + 2] = rk;
        splat[k * 4 + 3] = (pt.cobble / tot) * (1 - rk);
        tint = pt.tint;
        sandW[k] = pt.sand ?? 0;
      } else {
        const rock = THREE.MathUtils.smoothstep(slope, WALK_SLOPE - 0.35, WALK_SLOPE - 0.08);
        let grass = Math.max(0, 1 - dirt - paving);
        const sum0 = grass + dirt + paving;
        grass /= sum0;
        const d0 = dirt / sum0;
        const p0 = paving / sum0;
        splat[k * 4] = grass * (1 - rock);
        splat[k * 4 + 1] = d0 * (1 - rock);
        splat[k * 4 + 2] = rock;
        splat[k * 4 + 3] = p0 * (1 - rock);
        if (altFromGrass) {
          const gs = splat[k * 4];
          const ds = splat[k * 4 + 1];
          splat[k * 4] = 0;
          splat[k * 4 + 1] = gs + ds;
          sandW[k] = gs + ds > 0 ? gs / (gs + ds) : 0;
        } else if (altFromDirt) sandW[k] = 1;
      }

      let occ = 0;
      for (const [dx, dz] of dirs) {
        let maxTan = 0;
        for (const d1 of spacing > 1.5 ? AO_FAR : AO_NEAR) {
          const dist = d1 * Math.max(1, spacing);
          const hs = hSample(x + dx * dist, z + dz * dist);
          maxTan = Math.max(maxTan, (hs - h) / dist);
        }
        occ += Math.atan(maxTan) / (Math.PI / 2);
      }
      occ /= dirs.length;
      let ao = outside && spacing > 1.5 ? THREE.MathUtils.clamp(1 - occ * 0.8, 0.62, 1) : THREE.MathUtils.clamp(1 - occ * 1.6, 0.35, 1);
      if (inside(x, z) && nearWall(x, z)) ao *= 0.7;
      if (inside(x, z) && nearPit(x, z)) ao *= 0.45;
      const n = vnoise(x * 0.09 + 50, z * 0.09);
      const n2 = vnoise(x * 0.31 + 7, z * 0.31);
      const lift = THREE.MathUtils.clamp(h / 4, -0.2, 1) * 0.1;
      let r = 0.86 + n * 0.34 + lift + (n2 - 0.5) * 0.08;
      let g = 1.0 + (n - 0.5) * 0.1 + lift * 0.8 + (n2 - 0.5) * 0.06;
      let b = 0.7 + (1 - n) * 0.3 + lift * 0.2;
      if (light) {
        const nx = nrm.getX(k);
        const nz = nrm.getZ(k);
        const ndl = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
        const sh = ndl > 0 ? sunShadow(x, h, z, outside && sur!.boxDist(x, z) > 6) : 0;
        const hemi = ny * 0.5 + 0.5;
        const sunK = ndl * sh * light.sunIntensity / Math.PI;
        const lr = amb0.r * (1 - hemi) + amb1.r * hemi;
        const lg = amb0.g * (1 - hemi) + amb1.g * hemi;
        const lb = amb0.b * (1 - hemi) + amb1.b * hemi;
        const ai = light.ambientIntensity / Math.PI;
        r *= lr * ai * ao + sunC.r * sunK * (0.55 + 0.45 * ao);
        g *= lg * ai * ao + sunC.g * sunK * (0.55 + 0.45 * ao);
        b *= lb * ai * ao + sunC.b * sunK * (0.55 + 0.45 * ao);
      } else {
        r *= ao;
        g *= ao;
        b *= ao;
      }
      r *= tint[0];
      g *= tint[1];
      b *= tint[2];
      if (ruinW && inside(x, z)) {
        const wd = wallDist(x, z);
        const near = THREE.MathUtils.clamp(1 - wd / 1.8, 0, 1);
        let grassy = 0;
        for (const [cx, cz] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) grassy += cellFlag(cx, cz, FLAG_GRASS) / 4;
        const gone = THREE.MathUtils.smoothstep(fbm(x * 0.17 + 3.1, z * 0.17 - 8.4) + dirt * 0.35 + near * 0.1, 0.5, 0.82);
        const moss = THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(fbm(x * 0.13 - 11, z * 0.13 + 4), 0.42, 0.85) + near * 0.3 + grassy * 0.5, 0, 1);
        const pud = THREE.MathUtils.smoothstep(fbm(x * 0.21 + 40, z * 0.21 + 9), 0.52, 0.76) * (1 - gone * 0.6) * (1 - near);
        ruinW[k * 4] = gone;
        ruinW[k * 4 + 1] = moss;
        ruinW[k * 4 + 2] = pud;
        const grime = near * (0.55 + 0.45 * vnoise(x * 0.9 + 3, z * 0.9));
        const v = vnoise(x * 0.05 + 21, z * 0.05 - 7);
        const vv = 0.88 + vnoise(x * 0.23 - 4, z * 0.23 + 13) * 0.2;
        const tw: [number, number, number] = v < 0.5 ? [0.9 + v * 0.16, 0.95 + v * 0.1, 1.0 - v * 0.24] : [0.98 + (v - 0.5) * 0.08, 1.0 - (v - 0.5) * 0.08, 0.88 - (v - 0.5) * 0.04];
        r *= tw[0] * vv * (1 - grime * 0.36);
        g *= tw[1] * vv * (1 - grime * 0.3);
        b *= tw[2] * vv * (1 - grime * 0.42);
      }
      if (wet > 0) {
        r *= 1 - wet * 0.22;
        g *= 1 - wet * 0.16;
        b *= 1 - wet * 0.04;
      }
      if (h < t.waterLevel && (!sur || sur.water)) {
        const deep = Math.min(1, (t.waterLevel - h) / 1.2);
        r *= 1 - deep * 0.55;
        g *= 1 - deep * 0.4;
        b *= 1 - deep * 0.25;
      }
      col[k * 3] = r;
      col[k * 3 + 1] = g;
      col[k * 3 + 2] = b;
    }
  }
  geo.setAttribute("splat", new THREE.BufferAttribute(splat, 4));
  const hasSand = !!tex.sand && sandW.some((v) => v > 0);
  if (hasSand) geo.setAttribute("aSand", new THREE.BufferAttribute(sandW, 1));
  if (ruinW) geo.setAttribute("aRuin", new THREE.BufferAttribute(ruinW, 4));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

  const mat = light ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  const uniforms = {
    tGrass: { value: prepare(tex.grass) },
    tDirt: { value: prepare(tex.dirt) },
    tRock: { value: prepare(tex.rock) },
    tCobble: { value: prepare(tex.cobble) },
    tSand: { value: hasSand ? prepare(tex.sand!) : null },
    tPavId: { value: tex.ruin ? rawData(tex.ruin.id) : null },
    tCrack: { value: tex.ruin ? prepare(tex.ruin.crack) : null },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;${hasSand ? "\nattribute float aSand;\nvarying float vSand;" : ""}${ruined ? "\nattribute vec4 aRuin;\nvarying vec4 vRuin;" : ""}`,
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>${hasSand ? "\nvSand = aSand;" : ""}${ruined ? "\nvRuin = aRuin;" : ""}\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * normal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D tGrass; uniform sampler2D tDirt; uniform sampler2D tRock; uniform sampler2D tCobble;
varying vec4 vSplat; varying vec3 vWPos; varying vec3 vWNrm;${hasSand ? "\nuniform sampler2D tSand; varying float vSand;" : ""}${ruined ? RUIN_HEAD : ""}`,
      )
      .replace(
        "#include <map_fragment>",
        `vec2 wuv = vWPos.xz;
vec3 dpx = dFdx(vWPos);
vec3 dpy = dFdy(vWPos);
vec3 an = abs(normalize(vWNrm));
an = pow(an, vec3(4.0)); an /= (an.x + an.y + an.z);
vec4 sw = vSplat / max(0.001, vSplat.x + vSplat.y + vSplat.z + vSplat.w);
vec3 tsum = vec3(0.0);
if (sw.x > 0.0) tsum += textureGrad(tGrass, wuv / 7.0, dpx.xz / 7.0, dpy.xz / 7.0).rgb * sw.x;
if (sw.y > 0.0) {
  vec3 cd = textureGrad(tDirt, wuv / 6.0, dpx.xz / 6.0, dpy.xz / 6.0).rgb;${hasSand ? "\n  if (vSand > 0.0) cd = mix(cd, textureGrad(tSand, wuv / 6.0, dpx.xz / 6.0, dpy.xz / 6.0).rgb, vSand);" : ""}
  tsum += cd * sw.y;
}
if (sw.z > 0.0) {
  vec3 cr = vec3(0.0);
  if (an.x > 0.0) cr += textureGrad(tRock, vWPos.zy / 5.0, dpx.zy / 5.0, dpy.zy / 5.0).rgb * an.x;
  if (an.y > 0.0) cr += textureGrad(tRock, vWPos.xz / 5.0, dpx.xz / 5.0, dpy.xz / 5.0).rgb * an.y;
  if (an.z > 0.0) cr += textureGrad(tRock, vWPos.xy / 5.0, dpx.xy / 5.0, dpy.xy / 5.0).rgb * an.z;
  tsum += cr * sw.z;
}
${ruined ? RUIN_PAVING : "if (sw.w > 0.0) tsum += textureGrad(tCobble, wuv / 4.0, dpx.xz / 4.0, dpy.xz / 4.0).rgb * sw.w;"}
diffuseColor.rgb *= tsum;`,
      );
  };

  mat.customProgramCacheKey = () => `terrain${hasSand ? "-sand" : ""}${ruined ? "-ruin" : ""}`;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Terrain";
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function buildWaterMesh(t: Terrain, material: THREE.Material, sur: Surround | null = null): THREE.Mesh {
  const pad = sur?.water ? 1400 : 0;
  const w = t.width + pad * 2;
  const d = t.depth + pad * 2;
  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(t.width / 2, t.waterLevel, t.depth / 2);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w - pad) / 10, (uv.getY(i) * d - pad) / 10);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "Water";
  mesh.renderOrder = 2;
  return mesh;
}
