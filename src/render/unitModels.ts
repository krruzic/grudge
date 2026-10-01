import { markModel } from "./placeholders";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { dyeColor, shareSkeletons, toLambert } from "./heroModels";
import { mergedMaterial, mergeParts } from "./mergedModel";

export interface UnitInstance {
  body: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
}

export class UnitModels {
  private gltfs = new Map<string, GLTF>();
  private mats = new Map<string, THREE.Material>();

  async load(urls: Record<string, string>): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      Object.entries(urls).map(async ([k, url]) => {
        try {
          const g = await loader.loadAsync(url);
          mergeParts(g.scene);
          markModel(g.scene);
          this.gltfs.set(k, g);
        } catch (err) {
          console.warn(`unit model ${k} failed to load`, err);
        }
      }),
    );
  }

  has(type: string): boolean {
    return this.gltfs.has(type);
  }

  create(type: string, team: THREE.Color, teamIndex: number): UnitInstance | null {
    const gltf = this.gltfs.get(type);
    if (!gltf) return null;
    const body = skeletonClone(gltf.scene);
    shareSkeletons(body);
    body.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.frustumCulled = false;
      const mm = mergedMaterial(o.geometry, (n) => (n.startsWith("team") ? dyeColor(team) : null));
      if (mm) {
        o.material = mm;
        return;
      }
      const conv = (m: THREE.Material) => {
        const key = `${type}:${m.name}:${m.name.startsWith("team") ? teamIndex : "x"}`;
        let c = this.mats.get(key);
        if (!c) {
          c = toLambert(m);
          if (m.name.startsWith("team")) (c as THREE.MeshLambertMaterial).color.copy(dyeColor(team));
          this.mats.set(key, c);
        }
        return c.clone();
      };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      o.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(body);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
    return { body, mixer, actions };
  }
}
