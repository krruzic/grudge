import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { dyeColor, toLambert } from "./heroModels";
import { markModel } from "./placeholders";

const propUrls = import.meta.glob("../../assets/props/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const scenes = new Map<string, THREE.Object3D>();
const shared = new Map<THREE.Material, THREE.Material>();

export async function loadProps(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(
    Object.entries(propUrls).map(async ([path, url]) => {
      try {
        const g = await loader.loadAsync(url);
        markModel(g.scene);
        g.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          const conv = (m: THREE.Material) => {
            let c = shared.get(m);
            if (!c) {
              c = toLambert(m);
              (c as THREE.MeshLambertMaterial).vertexColors = false;
              c.userData.keep = true;
              shared.set(m, c);
            }
            return c;
          };
          o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
          o.castShadow = true;
          o.receiveShadow = true;
        });
        scenes.set(path.split("/").pop()!.replace(".glb", ""), g.scene);
      } catch (err) {
        console.warn(`prop ${path} failed to load`, err);
      }
    }),
  );
}

const dyed = new Map<string, THREE.Material>();

export function prop(name: string, team?: THREE.Color): THREE.Object3D | null {
  const s = scenes.get(name);
  if (!s) return null;
  const o = s.clone(true);
  if (team) {
    o.traverse((m) => {
      if (!(m instanceof THREE.Mesh) || Array.isArray(m.material) || !m.material.name.startsWith("team")) return;
      const key = `${m.material.uuid}:${team.getHex()}`;
      let c = dyed.get(key);
      if (!c) {
        const n = m.material.clone() as THREE.MeshLambertMaterial;
        n.color.copy(dyeColor(team));
        n.userData.keep = true;
        dyed.set(key, n);
        c = n;
      }
      m.material = c;
    });
  }
  return o;
}
