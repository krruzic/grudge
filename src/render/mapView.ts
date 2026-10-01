import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Terrain } from "../sim/terrain";
import { buildTerrainMesh, buildWaterMesh, type TerrainLight, type TerrainTextures } from "./terrainMesh";

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

export async function loadMap(url: string, terrain: Terrain, textureUrls: Record<keyof TerrainTextures, string>, light?: TerrainLight): Promise<MapView> {
  const texLoader = new THREE.TextureLoader();
  const [gltf, ...texs] = await Promise.all([
    new GLTFLoader().loadAsync(url),
    ...(["grass", "dirt", "rock", "cobble", "water"] as const).map((k) => texLoader.loadAsync(textureUrls[k])),
  ]);
  const [grass, dirt, rock, cobble, water] = texs;
  const root = new THREE.Group();
  root.add(gltf.scene);
  root.add(buildTerrainMesh(terrain, { grass, dirt, rock, cobble, water }, light));
  const waterMesh = buildWaterMesh(terrain, waterMaterial(water));
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
