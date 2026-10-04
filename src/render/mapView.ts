// Map loading: the map glTF (props converted to vertex-coloured Lambert, swaying tall grass, props merged by
// material), the terrain and water meshes (map/terrainMesh.ts) and fx_/pad_/core_ marker positions. MapView.update
// animates grass sway and the tide on the water plane.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { layerTexture } from "./models/mergedModel";
import type { Terrain } from "../sim/terrain";
import { surroundFor } from "../sim/surround";
import sandUrl from "../../assets/textures/sand.png?url";
import snowUrl from "../../assets/textures/snow.png?url";
import gravelUrl from "../../assets/textures/gravel.png?url";
import pavIdUrl from "../../assets/textures/paving_id.png?url";
import crackUrl from "../../assets/textures/paving_crack.jpg?url";
import desertFloorUrl from "../../assets/textures/desert_floor.png?url";
import desertDuneUrl from "../../assets/textures/desert_dune.png?url";
import desertCliffUrl from "../../assets/textures/desert_cliff.png?url";
import autumnGrassUrl from "../../assets/textures/autumn_grass.png?url";
import autumnPathUrl from "../../assets/textures/autumn_path.png?url";
import autumnBankUrl from "../../assets/textures/autumn_bank.png?url";
import lakeUrl from "../../assets/textures/lakebed.png?url";
import { buildTerrainMesh, buildWaterMesh, type TerrainLight, type TerrainTextures } from "./map/terrainMesh";
import { cacheCanvas } from "../ui/cacheCanvas";

export interface MapView {
  root: THREE.Group;
  fx: { name: string; position: THREE.Vector3 }[];
  update(time: number, tide?: number): void;
}

const swayUniforms = { uTime: { value: 0 } };

function lambertFrom(src: THREE.Material, name: string): THREE.Material {
  const s = src as THREE.MeshStandardMaterial;
  const map = s.map ?? null;
  if (map) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.anisotropy = 1;
    map.needsUpdate = true;
  }
  const mat = new THREE.MeshLambertMaterial({ map, vertexColors: true, name });
  if (name === "tallgrass") {
    mat.alphaTest = 0.5;
    mat.side = THREE.DoubleSide;
    addSway(mat);
  } else if (name === "cloth") {
    mat.side = THREE.DoubleSide;
  }
  return mat;
}

function addSway(mat: THREE.Material): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float sway = uv.y * uv.y;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        transformed.x += sin(uTime * 1.8 + wp.x * 0.6 + wp.z * 0.3) * 0.12 * sway;
        transformed.z += cos(uTime * 1.3 + wp.z * 0.5) * 0.06 * sway;`,
      );
  };
}

function waterMaterial(map: THREE.Texture): THREE.Material {
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshLambertMaterial({
    map,
    transparent: true,
    opacity: 0.8,
    emissive: new THREE.Color("#0a2a58"),
    depthWrite: false,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayUniforms.uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <map_fragment>",
        `vec2 wuv = vMapUv;
        vec4 w1 = texture2D(map, wuv + vec2(uTime * 0.02, uTime * 0.05));
        vec4 w2 = texture2D(map, wuv * 1.7 + vec2(-uTime * 0.03, uTime * 0.035));
        vec4 sampledDiffuseColor = mix(w1, w2, 0.5);
        diffuseColor *= sampledDiffuseColor;`,
      );
  };
  return mat;
}

const PROP_LAYER = 128;
const ANISO = 4;

function upscaled(map: THREE.Texture, size: number): THREE.Texture {
  const img = map.image as CanvasImageSource & { width: number; height: number };
  const w = img.width,
    h = img.height;
  if (w === size && h === size) return map;
  const src = cacheCanvas();
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0);
  const sp = sctx.getImageData(0, 0, w, h).data;
  const out = cacheCanvas();
  out.width = out.height = size;
  const octx = out.getContext("2d")!;
  const od = octx.createImageData(size, size);
  const px = (x: number, y: number, c: number) => sp[((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4 + c];
  for (let y = 0; y < size; y++) {
    const fy = ((y + 0.5) * h) / size - 0.5,
      y0 = Math.floor(fy),
      ty = fy - y0;
    for (let x = 0; x < size; x++) {
      const fx = ((x + 0.5) * w) / size - 0.5,
        x0 = Math.floor(fx),
        tx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = px(x0, y0, c) * (1 - tx) + px(x0 + 1, y0, c) * tx;
        const b = px(x0, y0 + 1, c) * (1 - tx) + px(x0 + 1, y0 + 1, c) * tx;
        od.data[(y * size + x) * 4 + c] = a * (1 - ty) + b * ty;
      }
    }
  }
  octx.putImageData(od, 0, 0);
  return new THREE.Texture(out);
}

function mergeProps(scene: THREE.Object3D): void {
  scene.updateMatrixWorld(true);
  const list: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const m = o.material as THREE.MeshLambertMaterial;
    if (
      m.name === "tallgrass" ||
      !m.map ||
      m.transparent ||
      m.alphaTest > 0 ||
      m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
    )
      return;
    const img = m.map.image as { width?: number; height?: number } | undefined;
    if (!img?.width || img.width > PROP_LAYER || img.width !== img.height) return;
    list.push(o);
  });
  if (list.length < 2) return;
  const keys = (g: THREE.BufferGeometry) => Object.keys(g.attributes).sort().join(",");
  const want = keys(list[0].geometry);
  const parts = list.filter((o) => keys(o.geometry) === want);
  if (parts.length < 2) return;
  const mats: THREE.MeshLambertMaterial[] = [];
  const inv = scene.matrixWorld.clone().invert();
  const geos = parts.map((o) => {
    const mat = o.material as THREE.MeshLambertMaterial;
    if (!mats.includes(mat)) mats.push(mat);
    const g = o.geometry.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld));
    const n = g.getAttribute("position").count;
    g.setAttribute("aMat", new THREE.BufferAttribute(new Float32Array(n).fill(mats.indexOf(mat)), 1));
    return g;
  });
  const geo = mergeGeometries(geos, false);
  if (!geo) return;
  for (const g of geos) g.dispose();
  const size = Math.max(...mats.map((m) => (m.map?.image as { width: number }).width));
  const tex = layerTexture(mats.map((m) => m.map && upscaled(m.map, size)));
  tex.anisotropy = ANISO;
  const tint = mats.map((m) => new THREE.Vector4(m.color.r, m.color.g, m.color.b, m.side === THREE.FrontSide ? 0 : 1));
  const double = tint.some((t) => t.w > 0);
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: double ? THREE.DoubleSide : THREE.FrontSide,
    name: "props",
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLayers = { value: tex };
    shader.uniforms.uTint = { value: tint };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aMat;\nflat varying int vMat;\nvarying vec2 vUv0;",
      )
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMat = int(aMat + 0.5);\nvUv0 = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform highp sampler2DArray uLayers;\nuniform vec4 uTint[${mats.length}];\nflat varying int vMat;\nvarying vec2 vUv0;`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif (!gl_FrontFacing && uTint[vMat].w < 0.5) discard;",
      )
      .replace(
        "#include <map_fragment>",
        "diffuseColor *= texture(uLayers, vec3(vUv0, float(vMat)));\ndiffuseColor.rgb *= uTint[vMat].rgb;",
      );
  };
  mat.customProgramCacheKey = () => `props-${mats.length}`;
  const merged = new THREE.Mesh(geo, mat);
  merged.name = "Props";
  merged.receiveShadow = true;
  merged.castShadow = true;
  for (const o of parts) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  scene.add(merged);
  for (const m of mats) {
    m.map?.dispose();
    m.dispose();
  }
}

const PALETTES: Record<string, Partial<Record<"grass" | "dirt" | "rock", string>>> = {
  autumn: { grass: autumnGrassUrl, dirt: autumnPathUrl, rock: autumnBankUrl },
  desert: { grass: desertFloorUrl, dirt: desertDuneUrl, rock: desertCliffUrl },
};

export async function loadMap(
  url: string,
  terrain: Terrain,
  textureUrls: Record<Exclude<keyof TerrainTextures, "ruin" | "lake" | "pavId">, string>,
  light?: TerrainLight,
): Promise<MapView> {
  const texLoader = new THREE.TextureLoader();
  // A map palette swaps the ground textures (Russet Hollow: autumn grass, leaf-litter paths, russet clay banks).
  const palette = terrain.palette ? PALETTES[terrain.palette] : undefined;
  const urls = { ...textureUrls, ...palette };
  const [gltf, ...texs] = await Promise.all([
    new GLTFLoader().loadAsync(url),
    ...(["grass", "dirt", "rock", "cobble", "water"] as const).map((k) => texLoader.loadAsync(urls[k] as string)),
  ]);
  const [grass, dirt, rock, cobble, water] = texs;
  const altUrl = terrain.surround === "alpine" ? snowUrl : terrain.surround === "garden" ? gravelUrl : sandUrl;
  const ruined = !!gltf.scene.getObjectByName("ground_ruined");
  const [sand, pavId, crack] = await Promise.all(
    [altUrl, pavIdUrl, ...(ruined ? [crackUrl] : [])].map((u) => texLoader.loadAsync(u)),
  );
  const root = new THREE.Group();
  root.add(gltf.scene);
  const sur = surroundFor(terrain);
  const ruin = ruined ? { crack } : undefined;
  const lake = terrain.tideCells.length ? await texLoader.loadAsync(lakeUrl) : undefined;
  if (lake) lake.anisotropy = ANISO;
  root.add(buildTerrainMesh(terrain, { grass, dirt, rock, cobble, water, sand, pavId, ruin, lake }, light, sur));
  for (const t of [grass, dirt, rock, cobble, sand, ...(ruined ? [crack] : [])]) t.anisotropy = ANISO;
  const waterMesh = buildWaterMesh(terrain, waterMaterial(water), sur);
  root.add(waterMesh);
  const fx: MapView["fx"] = [];
  const cache = new Map<THREE.Material, THREE.Material>();

  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const convert = (m: THREE.Material) => {
        let c = cache.get(m);
        if (!c) {
          c = lambertFrom(m, m.name);
          cache.set(m, c);
        }
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
      const isGrass = o.name.startsWith("TallGrass") || o.name.startsWith("Tufts");
      o.receiveShadow = true;
      o.castShadow = !isGrass;
    } else if (/^(fx_|pad_|core_)/.test(o.name)) {
      const p = new THREE.Vector3();
      o.getWorldPosition(p);
      fx.push({ name: o.name.replace(/\.\d+$/, ""), position: p });
    }
  });

  mergeProps(gltf.scene);

  return {
    root,
    fx,
    update(time: number, tide = 0) {
      swayUniforms.uTime.value = time;
      const y = tide * 0.42 + Math.sin(time * 0.8) * 0.02 * tide;
      if (Math.abs(waterMesh.position.y - y) > 1e-4) {
        waterMesh.position.y = y;
        waterMesh.updateMatrix();
        waterMesh.matrixWorld.copy(waterMesh.matrix);
      }
    },
  };
}
