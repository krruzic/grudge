import * as THREE from "three";
import { mergedMaterial, mergeParts } from "./mergedModel";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { blobShadow, footRing, markModel, playerTag, warlordPlaceholder } from "./placeholders";

export const outlineConfig = { enabled: true };

export function dyeColor(team: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  team.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s * 0.72, hsl.l * 0.82);
}

export interface HeroInstance {
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

export function hullMaterial(color: number, additive: boolean): { mat: THREE.MeshBasicMaterial; thick: { value: number } } {
  const thick = { value: 0.035 };
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: additive, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
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
  const sums = new Map<string, THREE.Vector3>();
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)},${part[i]}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const v = sums.get(k) ?? new THREE.Vector3();
    v.x += nor.getX(i);
    v.y += nor.getY(i);
    v.z += nor.getZ(i);
    sums.set(k, v);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = sums.get(key(i))!.clone().normalize();
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
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
    const key = o.skeleton.bones.map(idOf).join(",") + "|" + o.skeleton.boneInverses.map((m) => m.elements.map((v) => v.toFixed(4)).join(":")).join(",");
    const prev = byBones.get(key);
    if (prev) o.skeleton = prev;
    else byBones.set(key, o.skeleton);
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
    if (o instanceof THREE.Mesh && !o.userData.outline && !o.userData.noSil && o.geometry.getAttribute("normal")) meshes.push(o);
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

  create(type: string, team: THREE.Color, label: string, mark: THREE.Color = team, dye: THREE.Color = team): HeroInstance {
    const root = new THREE.Group();
    const gltf = this.gltfs.get(type);
    let body: THREE.Object3D;
    let mixer: THREE.AnimationMixer | undefined;
    const actions = new Map<string, THREE.AnimationAction>();
    if (gltf) {
      body = skeletonClone(gltf.scene);
      shareSkeletons(body);
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
    root.add(blobShadow(), body, footRing(mark), playerTag(label, mark));
    return { root, body, mixer, actions };
  }
}
