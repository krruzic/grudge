import * as THREE from "three";
import heroesData from "../../data/heroes.json";
import { FLAG_DIRT, FLAG_PAVING, FLAG_TIDE, Kind, type Terrain } from "../sim/terrain";

export interface TerrainTextures {
  grass: THREE.Texture;
  dirt: THREE.Texture;
  rock: THREE.Texture;
  cobble: THREE.Texture;
  water: THREE.Texture;
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

export function buildTerrainMesh(t: Terrain, tex: TerrainTextures, light?: TerrainLight): THREE.Mesh {
  const x0 = -MARGIN;
  const z0 = -MARGIN;
  const nx = t.width + MARGIN * 2;
  const nz = t.depth + MARGIN * 2;
  const vw = nx + 1;
  const count = vw * (nz + 1);
  const pos = new Float32Array(count * 3);
  const heights = new Float32Array(count);

  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x <= t.width && z <= t.depth;
  const hAt = (x: number, z: number) => (inside(x, z) ? t.vertexHeight(x, z) : outerHeight(t, x, z));

  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i;
      const z = z0 + j;
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
      const pi = t.index(x0 + i, z0 + j);
      if (pi >= 0 && x0 + i < t.width && z0 + j < t.depth && t.kinds[pi] === Kind.Wall && t.styles[pi] === "pit") continue;
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

  const dirs: [number, number][] = [];
  for (let a = 0; a < 8; a++) dirs.push([Math.cos((a / 8) * Math.PI * 2), Math.sin((a / 8) * Math.PI * 2)]);
  const hSample = (x: number, z: number) => {
    const i = Math.round(x) - x0;
    const j = Math.round(z) - z0;
    if (i < 0 || j < 0 || i > nx || j > nz) return -Infinity;
    return heights[j * vw + i];
  };

  const L = new THREE.Vector3(...(light?.sunDir ?? [0, 1, 0])).normalize();
  const sunC = new THREE.Color(light?.sunColor ?? "#ffffff").convertSRGBToLinear();
  const amb0 = new THREE.Color(light?.ambientGround ?? "#444444").convertSRGBToLinear();
  const amb1 = new THREE.Color(light?.ambientSky ?? "#aaaaaa").convertSRGBToLinear();
  const occ = (x: number, z: number): number => {
    const i = Math.round(x) - x0;
    const j = Math.round(z) - z0;
    let hh = i < 0 || j < 0 || i > nx || j > nz ? -Infinity : heights[j * vw + i];
    if (inside(x, z)) {
      const kind = t.kindAt(Math.floor(x), Math.floor(z));
      if (kind === Kind.Wall) {
        const st = t.styles[t.index(Math.floor(x), Math.floor(z))];
        hh = st === "pit" ? -Infinity : t.groundHeight(x, z) + (st === "rim" ? 1.5 : 3.2);
      }
    }
    for (const p of t.props) {
      const ps = PROP_SHADOW[p.type];
      if (!ps) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < ps[0] * (p.scale ?? 1)) hh = Math.max(hh, t.groundHeight(p.x, p.z) + ps[1] * (p.scale ?? 1) * (1 - (d / ps[0]) * 0.3));
    }
    return hh;
  };
  const sunShadow = (x: number, h: number, z: number): number => {
    let lit = 1;
    for (let d = 0.6; d < 22; d += 0.6) {
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
      const x = x0 + i;
      const z = z0 + j;
      const h = heights[k];
      const ny = nrm.getY(k);

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

      let occ = 0;
      for (const [dx, dz] of dirs) {
        let maxTan = 0;
        for (const dist of [1, 2, 3, 5, 8]) {
          const hs = hSample(x + dx * dist, z + dz * dist);
          maxTan = Math.max(maxTan, (hs - h) / dist);
        }
        occ += Math.atan(maxTan) / (Math.PI / 2);
      }
      occ /= dirs.length;
      let ao = THREE.MathUtils.clamp(1 - occ * 1.6, 0.35, 1);
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
        const sh = ndl > 0 ? sunShadow(x, h, z) : 0;
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
      if (wet > 0) {
        r *= 1 - wet * 0.22;
        g *= 1 - wet * 0.16;
        b *= 1 - wet * 0.04;
      }
      if (h < t.waterLevel) {
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
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));

  const mat = light ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  const uniforms = {
    tGrass: { value: prepare(tex.grass) },
    tDirt: { value: prepare(tex.dirt) },
    tRock: { value: prepare(tex.rock) },
    tCobble: { value: prepare(tex.cobble) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;",
      )
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvSplat = splat;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * normal);",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D tGrass; uniform sampler2D tDirt; uniform sampler2D tRock; uniform sampler2D tCobble;
varying vec4 vSplat; varying vec3 vWPos; varying vec3 vWNrm;`,
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
if (sw.y > 0.0) tsum += textureGrad(tDirt, wuv / 6.0, dpx.xz / 6.0, dpy.xz / 6.0).rgb * sw.y;
if (sw.z > 0.0) {
  vec3 cr = vec3(0.0);
  if (an.x > 0.0) cr += textureGrad(tRock, vWPos.zy / 5.0, dpx.zy / 5.0, dpy.zy / 5.0).rgb * an.x;
  if (an.y > 0.0) cr += textureGrad(tRock, vWPos.xz / 5.0, dpx.xz / 5.0, dpy.xz / 5.0).rgb * an.y;
  if (an.z > 0.0) cr += textureGrad(tRock, vWPos.xy / 5.0, dpx.xy / 5.0, dpy.xy / 5.0).rgb * an.z;
  tsum += cr * sw.z;
}
if (sw.w > 0.0) tsum += textureGrad(tCobble, wuv / 4.0, dpx.xz / 4.0, dpy.xz / 4.0).rgb * sw.w;
diffuseColor.rgb *= tsum;`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Terrain";
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function buildWaterMesh(t: Terrain, material: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(t.width, t.depth, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(t.width / 2, t.waterLevel, t.depth / 2);
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * t.width) / 10, (uv.getY(i) * t.depth) / 10);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "Water";
  mesh.renderOrder = 2;
  return mesh;
}
