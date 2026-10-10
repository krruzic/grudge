// Hero models: glTF heroes per costume (assets/heroes/<hero>[@costume].glb) converted to Lambert, merged into one
// skinned draw, team-dyed, with optional ink outlines (smoothed-normal hulls) and per-instance animation mixers.
// Also patches Skeleton.update to run once per frame (FRAME.id) however many views draw a skeleton.
import * as THREE from "three";
import { mergedMaterial, mergeParts } from "./models/mergedModel";
import { costumeModel, costumeTexture } from "./costumes";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { blobShadow, footRing, markModel, playerTag, warlordPlaceholder } from "./models/markers";

export const outlineConfig = { enabled: true };

export function dyeColor(team: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  team.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s * 0.72, hsl.l * 0.82);
}

interface HeroInstance {
  root: THREE.Group;
  body: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
}

export function toLambert(m: THREE.Material): THREE.Material {
  const s = m as THREE.MeshStandardMaterial;
  const face = m.name.startsWith("face");
  if (s.map) {
    s.map.colorSpace = THREE.SRGBColorSpace;
    s.map.magFilter = face ? THREE.NearestFilter : THREE.LinearFilter;
  }
  return new THREE.MeshLambertMaterial({
    name: m.name,
    map: s.map ?? null,
    color: s.color ?? new THREE.Color(1, 1, 1),
    vertexColors: !face,
    emissive: s.emissive ?? new THREE.Color(0, 0, 0),
    emissiveMap: s.emissiveMap ?? null,
    alphaTest: face ? 0.5 : 0,
    transparent: false,
    side: face ? THREE.DoubleSide : THREE.FrontSide,
  });
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x0a0806, side: THREE.BackSide });
outlineMat.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec3 outlineNormal;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += outlineNormal * 0.035;");
};

export function hullMaterial(
  color: number,
  additive: boolean,
): { mat: THREE.MeshBasicMaterial; thick: { value: number } } {
  const thick = { value: 0.035 };
  const mat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    transparent: additive,
    depthWrite: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.hullThick = thick;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 outlineNormal;\nuniform float hullThick;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += outlineNormal * hullThick;");
  };
  mat.customProgramCacheKey = () => `hull${additive ? 1 : 0}`;
  return { mat, thick };
}

const smoothed = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

function withOutlineNormals(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const cached = smoothed.get(geo);
  if (cached) return cached;
  const g = geo.clone();
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const starts = geo.userData.partStarts as number[] | undefined;
  const part = new Int32Array(pos.count);
  starts?.forEach((s, p) => part.fill(p, s));
  // Vertices at the same spot (mm) of the same part share one summed normal. The key packs the mm coordinates
  // (each within +-8.191 m, 14 bits) and the part (6 bits) exactly into one number; string keys made the first
  // ward / dig outline of a hero a 20 ms hitch.
  const keys = new Float64Array(pos.count);
  let packed = true;
  for (let i = 0; i < pos.count && packed; i++) {
    const x = Math.round(pos.getX(i) * 1000) + 8192;
    const y = Math.round(pos.getY(i) * 1000) + 8192;
    const z = Math.round(pos.getZ(i) * 1000) + 8192;
    if (x < 0 || y < 0 || z < 0 || x > 16383 || y > 16383 || z > 16383 || part[i] > 63) packed = false;
    keys[i] = ((x * 16384 + y) * 16384 + z) * 64 + part[i];
  }
  const keyOf = packed
    ? (i: number) => keys[i]
    : (i: number) =>
        `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)},${part[i]}`;
  const slot = new Map<number | string, number>();
  const idx = new Int32Array(pos.count);
  const sum: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i);
    let s = slot.get(k);
    if (s === undefined) {
      s = sum.length;
      slot.set(k, s);
      sum.push(0, 0, 0);
    }
    idx[i] = s;
    sum[s] += nor.getX(i);
    sum[s + 1] += nor.getY(i);
    sum[s + 2] += nor.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = idx[i];
    const l = Math.hypot(sum[s], sum[s + 1], sum[s + 2]) || 1;
    out[i * 3] = sum[s] / l;
    out[i * 3 + 1] = sum[s + 1] / l;
    out[i * 3 + 2] = sum[s + 2] / l;
  }
  g.setAttribute("outlineNormal", new THREE.BufferAttribute(out, 3));
  g.userData.model = true;
  smoothed.set(geo, g);
  return g;
}

export const FRAME = { id: 0 };
const skUpdate = THREE.Skeleton.prototype.update;
THREE.Skeleton.prototype.update = function (this: THREE.Skeleton & { appFrame?: number }) {
  if (this.appFrame === FRAME.id) return;
  this.appFrame = FRAME.id;
  skUpdate.call(this);
};

export function shareSkeletons(root: THREE.Object3D): void {
  const byBones = new Map<string, THREE.Skeleton>();
  const ids = new WeakMap<THREE.Object3D, number>();
  let n = 0;
  const idOf = (o: THREE.Object3D) => {
    let v = ids.get(o);
    if (v === undefined) ids.set(o, (v = n++));
    return v;
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const key =
      o.skeleton.bones.map(idOf).join(",") +
      "|" +
      o.skeleton.boneInverses.map((m) => m.elements.map((v) => v.toFixed(4)).join(":")).join(",");
    const prev = byBones.get(key);
    if (prev) o.skeleton = prev;
    else byBones.set(key, o.skeleton);
  });
}

/**
 * Bones never draw, but the renderer walks every visible object once per view (four times a frame in 4-player
 * split), and a rig is mostly bones. Hiding bone trees that hold nothing drawable skips them; skinning reads bone
 * matrices whether they're visible or not.
 */
export function hideBones(root: THREE.Object3D): void {
  const drawsBelow = (o: THREE.Object3D): boolean =>
    o.children.some((c) => (c as THREE.Mesh).isMesh || (c as THREE.Sprite).isSprite || drawsBelow(c));
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && !(o.parent as THREE.Bone | null)?.isBone && !drawsBelow(o)) o.visible = false;
  });
}

export function addOutline(root: THREE.Object3D): void {
  if (!outlineConfig.enabled) return;
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.outline) meshes.push(o);
  });
  for (const m of meshes) {
    let hull: THREE.Mesh;
    const geo = withOutlineNormals(m.geometry);
    if (m instanceof THREE.SkinnedMesh) {
      const s = new THREE.SkinnedMesh(geo, outlineMat);
      s.bind(m.skeleton, m.bindMatrix);
      hull = s;
    } else {
      hull = new THREE.Mesh(geo, outlineMat);
    }
    hull.userData.outline = true;
    if (m.name) hull.name = `${m.name}_hull`;
    hull.position.copy(m.position);
    hull.quaternion.copy(m.quaternion);
    hull.scale.copy(m.scale);
    hull.frustumCulled = false;
    m.parent!.add(hull);
  }
}

export function buildHulls(root: THREE.Object3D, mat: THREE.Material, order: number): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.outline && !o.userData.noSil && o.geometry.getAttribute("normal"))
      meshes.push(o);
  });
  return meshes.map((m) => {
    const geo = withOutlineNormals(m.geometry);
    const hull = m instanceof THREE.SkinnedMesh ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
    if (hull instanceof THREE.SkinnedMesh && m instanceof THREE.SkinnedMesh) hull.bind(m.skeleton, m.bindMatrix);
    hull.userData.outline = true;
    hull.userData.noSil = true;
    if (m.name) hull.name = `${m.name}_hull`;
    hull.position.copy(m.position);
    hull.quaternion.copy(m.quaternion);
    hull.scale.copy(m.scale);
    hull.frustumCulled = false;
    hull.renderOrder = order;
    m.parent!.add(hull);
    return hull;
  });
}

/**
 * Culling sphere for a skinned mesh: the bind-pose bounds, padded for animation, shared per geometry.
 */
const skinSpheres = new WeakMap<THREE.BufferGeometry, THREE.Sphere>();
function skinnedBounds(g: THREE.BufferGeometry): THREE.Sphere {
  let s = skinSpheres.get(g);
  if (!s) {
    if (!g.boundingSphere) g.computeBoundingSphere();
    s = g.boundingSphere!.clone();
    s.radius *= 1.6;
    skinSpheres.set(g, s);
  }
  return s;
}
// Every skinned mesh (soldier rigs, structure and prop rigs too, not only heroes) culls with that sphere: three's
// own computeBoundingSphere skins every vertex on the CPU, a 10-40 ms hitch the first time each one is drawn.
THREE.SkinnedMesh.prototype.computeBoundingSphere = function (this: THREE.SkinnedMesh) {
  this.boundingSphere = skinnedBounds(this.geometry).clone();
};

export class HeroModels {
  private gltfs = new Map<string, GLTF>();

  async load(urls: Record<string, string>): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all(
      Object.entries(urls).map(async ([type, url]) => {
        try {
          const g = await loader.loadAsync(url);
          mergeParts(g.scene);
          markModel(g.scene);
          this.gltfs.set(type, g);
        } catch (err) {
          console.warn(`hero model ${type} failed to load, using placeholder`, err);
        }
      }),
    );
  }

  create(
    type: string,
    team: THREE.Color,
    label: string,
    mark: THREE.Color = team,
    dye: THREE.Color = team,
    costume?: string,
  ): HeroInstance {
    const root = new THREE.Group();
    const gltf = this.gltfs.get(costumeModel(type, costume)) ?? this.gltfs.get(type);
    let body: THREE.Object3D;
    let mixer: THREE.AnimationMixer | undefined;
    const actions = new Map<string, THREE.AnimationAction>();
    if (gltf) {
      body = skeletonClone(gltf.scene);
      shareSkeletons(body);
      hideBones(body);
      const teamMat = new Map<THREE.Material, THREE.Material>();
      body.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.castShadow = true;
        o.receiveShadow = true;
        const mm = mergedMaterial(o.geometry, (n) => (n.startsWith("team") ? dyeColor(dye) : null));
        if (mm) {
          o.material = mm;
          return;
        }
        const conv = (m: THREE.Material) => {
          let c = teamMat.get(m);
          if (!c) {
            c = toLambert(m);
            const ct = costumeTexture(type, costume, m.name);
            if (ct) (c as THREE.MeshLambertMaterial).map = ct;
            if (type === "duelist" && !m.name.startsWith("face")) c.side = THREE.DoubleSide;
            if (m.name.startsWith("team")) (c as THREE.MeshLambertMaterial).color.copy(dyeColor(dye));
            teamMat.set(m, c);
          }
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      });
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(body);
        for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
      }
    } else {
      body = warlordPlaceholder(dye);
      body.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
    }
    addOutline(body);
    body.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh && !o.boundingSphere) o.boundingSphere = skinnedBounds(o.geometry);
    });
    root.add(blobShadow(), body, footRing(mark), playerTag(label, mark));
    return { root, body, mixer, actions };
  }
}
