import { markModel } from "./placeholders";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { addOutline } from "./heroModels";
import { layerTexture } from "./mergedModel";

function partLook(name: string, team: THREE.Color): { color: THREE.Color | null; emissive: THREE.Color | null } {
  return {
    color: name.startsWith("team") ? team : null,
    emissive: name.includes("crystal") ? team.clone().multiplyScalar(0.55) : null,
  };
}

export function tintedLambert(m: THREE.Material, team: THREE.Color): THREE.MeshLambertMaterial {
  const s = m as THREE.MeshStandardMaterial;
  if (s.map) s.map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ name: m.name, map: s.map ?? null, vertexColors: true });
  const look = partLook(m.name, team);
  if (look.color) mat.color.copy(look.color);
  if (look.emissive) {
    mat.emissive.copy(look.emissive);
    mat.flatShading = true;
  }
  return mat;
}

const MAX = 16;
const IDENTITY = new THREE.Matrix4();
const ATTRS = ["position", "normal", "uv", "color"];

interface Baked {
  tex: THREE.DataArrayTexture;
  parts: string[];
  maps: (THREE.Texture | null)[];
}

export interface BakedKind {
  kind: string;
  parts: string[];
  maps: (THREE.Texture | null)[];
  geos: THREE.BufferGeometry[];
}

function bakeGeometry(src: THREE.BufferGeometry, part: number, matrix: THREE.Matrix4 | null): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of ATTRS) {
    const a = src.getAttribute(name);
    const size = name === "color" ? 4 : a.itemSize;
    const arr = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < size; c++) arr[i * size + c] = c < a.itemSize ? a.getComponent(i, c) : 1;
    }
    g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index!.array), 1));
  g.setAttribute("aMat", new THREE.BufferAttribute(new Float32Array(src.getAttribute("position").count).fill(part), 1));
  if (matrix) g.applyMatrix4(matrix);
  return g;
}

function plainMap(map: THREE.Texture, size: number): boolean {
  const img = map.image as { width?: number; height?: number } | undefined;
  return (
    !!img?.width && img.width === img.height && img.width === size &&
    map.magFilter === THREE.LinearFilter && map.minFilter === THREE.LinearMipmapLinearFilter &&
    map.wrapS === THREE.RepeatWrapping && map.wrapT === THREE.RepeatWrapping &&
    map.offset.x === 0 && map.offset.y === 0 && map.repeat.x === 1 && map.repeat.y === 1 && map.rotation === 0
  );
}

function mergeStatic(gltf: GLTF): Baked | null {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const anchors = new Set<THREE.Object3D>([scene, ...scene.children]);
  scene.traverse((o) => {
    if (/^(spin|level2)/.test(o.name) && gltf.parser.associations.get(o)?.nodes !== undefined) anchors.add(o);
  });
  const mats: THREE.MeshStandardMaterial[] = [];
  const groups = new Map<THREE.Object3D, THREE.Mesh[]>();
  let size = 0;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.SkinnedMesh || Array.isArray(o.material) || o.children.length) return;
    const g = o.geometry as THREE.BufferGeometry;
    if (!g.index || !ATTRS.every((n) => g.getAttribute(n)) || Object.keys(g.morphAttributes).length) return;
    const m = o.material as THREE.MeshStandardMaterial;
    if (m.map) {
      const w = (m.map.image as { width?: number } | undefined)?.width ?? 0;
      if (!size && w >= 8 && w <= 256) size = w;
      if (!plainMap(m.map, size)) return;
    }
    if (!mats.includes(m)) {
      if (mats.length >= MAX) return;
      mats.push(m);
    }
    let a: THREE.Object3D = o;
    while (!anchors.has(a)) a = a.parent!;
    const list = groups.get(a) ?? [];
    list.push(o);
    groups.set(a, list);
  });
  if (!mats.length) return null;
  const inv = new THREE.Matrix4();
  const rel = new THREE.Matrix4();
  for (const [anchor, list] of groups) {
    if (list.length === 1) {
      const o = list[0];
      o.geometry = bakeGeometry(o.geometry, mats.indexOf(o.material as THREE.MeshStandardMaterial), null);
      o.userData.merged = true;
      continue;
    }
    inv.copy(anchor.matrixWorld).invert();
    const starts: number[] = [];
    let n = 0;
    const geos = list.map((o) => {
      rel.copy(inv).multiply(o.matrixWorld);
      starts.push(n);
      n += o.geometry.getAttribute("position").count;
      return bakeGeometry(o.geometry, mats.indexOf(o.material as THREE.MeshStandardMaterial), rel.equals(IDENTITY) ? null : rel);
    });
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    geo.userData.partStarts = starts;
    const one = new THREE.Mesh(geo, list[0].material);
    one.userData.merged = true;
    for (const o of list) o.removeFromParent();
    anchor.add(one);
  }
  const maps = mats.map((m) => m.map ?? null);
  return { tex: layerTexture(maps), parts: mats.map((m) => m.name), maps };
}

export function partsMaterial(tex: THREE.Texture, parts: string[], team: THREE.Color, size = MAX): THREE.MeshLambertMaterial {
  const tint = Array.from({ length: size }, () => new THREE.Vector3(1, 1, 1));
  const emis = Array.from({ length: size }, () => new THREE.Vector4(0, 0, 0, 0));
  parts.forEach((name, i) => {
    const look = partLook(name, team);
    if (look.color) tint[i].set(look.color.r, look.color.g, look.color.b);
    if (look.emissive) emis[i].set(look.emissive.r, look.emissive.g, look.emissive.b, 1);
  });
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.name = "merged-static";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLayers = { value: tex };
    shader.uniforms.uTint = { value: tint };
    shader.uniforms.uEmis = { value: emis };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aMat;\nflat varying int vMat;\nvarying vec2 vUv0;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMat = int(aMat + 0.5);\nvUv0 = uv;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform highp sampler2DArray uLayers;\nuniform vec3 uTint[${size}];\nuniform vec4 uEmis[${size}];\nflat varying int vMat;\nvarying vec2 vUv0;`,
      )
      .replace("#include <map_fragment>", "diffuseColor *= texture(uLayers, vec3(vUv0, float(vMat)));\ndiffuseColor.rgb *= uTint[vMat];\nvec4 em = uEmis[vMat];")
      .replace(
        "#include <normal_fragment_begin>",
        "#include <normal_fragment_begin>\nvec3 flatN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));\nif (em.w > 0.5) normal = flatN;",
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nif (dot(emissive, emissive) == 0.0) totalEmissiveRadiance += em.rgb;");
  };
  mat.customProgramCacheKey = () => (size === MAX ? "merged-static" : `merged-static-${size}`);
  return mat;
}

function bakedMaterial(baked: Baked, team: THREE.Color): THREE.MeshLambertMaterial {
  return partsMaterial(baked.tex, baked.parts, team);
}

export class StructureModels {
  private gltfs = new Map<string, GLTF>();
  private baked = new Map<string, Baked>();

  async load(urls: Record<string, string>): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      Object.entries(urls).map(async ([k, url]) => {
        try {
          const g = await loader.loadAsync(url);
          const b = mergeStatic(g);
          if (b) this.baked.set(k, b);
          markModel(g.scene);
          this.gltfs.set(k, g);
        } catch (err) {
          console.warn(`structure model ${k} failed to load`, err);
        }
      }),
    );
  }

  has(kind: string): boolean {
    return this.gltfs.has(kind);
  }

  bakedKinds(): BakedKind[] {
    const out: BakedKind[] = [];
    for (const [kind, b] of this.baked) {
      const geos: THREE.BufferGeometry[] = [];
      this.gltfs.get(kind)?.scene.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.merged && !geos.includes(o.geometry)) geos.push(o.geometry);
      });
      out.push({ kind, parts: b.parts, maps: b.maps, geos });
    }
    return out;
  }

  create(kind: string, team: THREE.Color): THREE.Object3D {
    const gltf = this.gltfs.get(kind);
    if (!gltf) return new THREE.Group();
    const obj = gltf.scene.clone(true);
    const baked = this.baked.get(kind);
    const merged = baked ? bakedMaterial(baked, team) : null;
    const mats = new Map<THREE.Material, THREE.Material>();
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (merged && o.userData.merged) {
        o.material = merged;
        o.userData.structKind = kind;
        return;
      }
      const conv = (m: THREE.Material) => {
        let c = mats.get(m);
        if (!c) {
          c = tintedLambert(m, team);
          mats.set(m, c);
        }
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
    });
    addOutline(obj);
    return obj;
  }
}
