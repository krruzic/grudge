import { markModel } from "./placeholders";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { addOutline } from "./heroModels";

export function tintedLambert(m: THREE.Material, team: THREE.Color): THREE.MeshLambertMaterial {
  const s = m as THREE.MeshStandardMaterial;
  if (s.map) s.map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ name: m.name, map: s.map ?? null, vertexColors: true });
  if (m.name.startsWith("team")) mat.color.copy(team);
  if (m.name.includes("crystal")) {
    mat.emissive.copy(team).multiplyScalar(0.55);
    mat.flatShading = true;
  }
  return mat;
}

export class StructureModels {
  private gltfs = new Map<string, GLTF>();

  async load(urls: Record<string, string>): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      Object.entries(urls).map(async ([k, url]) => {
        try {
          const g = await loader.loadAsync(url);
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

  create(kind: string, team: THREE.Color): THREE.Object3D {
    const gltf = this.gltfs.get(kind);
    if (!gltf) return new THREE.Group();
    const obj = gltf.scene.clone(true);
    const mats = new Map<THREE.Material, THREE.Material>();
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
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
