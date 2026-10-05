// Runtime props (assets/props/*.glb): prop() clones a prop as an object tree, propParts() returns merged
// geometry+material for instancing. Both prefer the costume version (<name>@<costume>.glb) when it exists, else
// repaint the prop with the owner's costume texture (assets/costumes/<hero>/<costume>/<material>.jpg; a
// prop_<material>.jpg wins when the runtime prop shares a material name with a held weapon of different UVs).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { dyeColor, toLambert } from "./heroModels";
import { markModel } from "./models/markers";
import { costumeTexture } from "./costumes";

const propUrls = import.meta.glob("../../assets/props/*.glb", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
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

export function prop(
  name: string,
  team?: THREE.Color,
  owner?: { hero: string; costume?: string },
): THREE.Object3D | null {
  const s = (owner?.costume && scenes.get(`${name}@${owner.costume}`)) || scenes.get(name);
  if (!s) return null;
  const o = s.clone(true);
  if (owner?.costume) {
    o.traverse((m) => {
      if (!(m instanceof THREE.Mesh) || Array.isArray(m.material)) return;
      const ct = propTexture(owner.hero, owner.costume, m.material.name);
      if (!ct) return;
      const key = `${m.material.uuid}:${owner.hero}/${owner.costume}`;
      let c = dyed.get(key);
      if (!c) {
        const n = m.material.clone() as THREE.MeshLambertMaterial;
        n.map = ct;
        n.userData.keep = true;
        dyed.set(key, n);
        c = n;
      }
      m.material = c;
    });
  }
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

const parts = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material } | null>();

export function hasCostumeProp(name: string, costume?: string): boolean {
  return !!costume && scenes.has(`${name}@${costume}`);
}

/** A costume repaint for a runtime prop's material: prop_<material> first, then <material>. */
function propTexture(hero: string, costume: string | undefined, mat: string): THREE.Texture | null {
  return costumeTexture(hero, costume, `prop_${mat}`) ?? costumeTexture(hero, costume, mat);
}

/**
 * Merged geometry + material of prop `name` for instancing: the <name>@<costume> model if there is one, else the
 * base prop repainted with `hero`'s costume texture when given and present.
 */
export function propParts(
  name: string,
  costume?: string,
  hero?: string,
): { geo: THREE.BufferGeometry; mat: THREE.Material } | null {
  if (hasCostumeProp(name, costume)) name = `${name}@${costume}`;
  else if (hero && costume) {
    const key = `${name}|${hero}/${costume}`;
    if (parts.has(key)) return parts.get(key)!;
    const base = propParts(name);
    const ct = base ? propTexture(hero, costume, base.mat.name) : null;
    let out = base;
    if (base && ct) {
      const m = base.mat.clone() as THREE.MeshLambertMaterial;
      m.map = ct;
      m.userData.keep = true;
      out = { geo: base.geo, mat: m };
    }
    parts.set(key, out);
    return out;
  }
  if (parts.has(name)) return parts.get(name)!;
  const s = scenes.get(name);
  if (!s) return null;
  let found: { geo: THREE.BufferGeometry; mat: THREE.Material } | null = null;
  s.updateMatrixWorld(true);
  s.traverse((o) => {
    if (found || !(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    geo.deleteAttribute("color");
    geo.computeBoundingSphere();
    geo.userData.model = true;
    found = { geo, mat: o.material };
  });
  parts.set(name, found);
  return found;
}
