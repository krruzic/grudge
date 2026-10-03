import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

interface Part {
  name: string;
  color: THREE.Color;
  emissive: THREE.Color;
  vc: boolean;
  face: boolean;
}

interface Merged {
  tex: THREE.DataArrayTexture;
  parts: Part[];
}

const merged = new WeakMap<THREE.BufferGeometry, Merged>();
const MAX = 16;

export function layerTexture(maps: (THREE.Texture | null)[]): THREE.DataArrayTexture {
  let size = 8;
  for (const m of maps) {
    const img = m?.image as { width?: number } | undefined;
    if (img?.width) size = Math.max(size, img.width);
  }
  size = Math.min(256, size);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const data = new Uint8Array(size * size * 4 * maps.length);
  maps.forEach((m, i) => {
    ctx.clearRect(0, 0, size, size);
    if (m?.image) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(m.image as CanvasImageSource, 0, 0, size, size);
    } else {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
    }
    const px = ctx.getImageData(0, 0, size, size).data;
    data.set(px, i * size * size * 4);
  });
  const tex = new THREE.DataArrayTexture(data, size, size, maps.length);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function mergeParts(scene: THREE.Object3D): void {
  const groups = new Map<THREE.Object3D, THREE.SkinnedMesh[]>();
  scene.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh) || Array.isArray(o.material) || !o.parent) return;
    const list = groups.get(o.parent) ?? [];
    list.push(o);
    groups.set(o.parent, list);
  });
  for (const [parent, meshes] of groups) {
    const skel = meshes[0].skeleton;
    const big = (m: THREE.SkinnedMesh) => (((m.material as THREE.MeshStandardMaterial).map?.image as { width?: number } | undefined)?.width ?? 0) > 256;
    const list = meshes.filter((m) => m.skeleton === skel && m.bindMatrix.equals(meshes[0].bindMatrix) && !big(m));
    if (list.length < 2 || list.length > MAX) continue;
    const keys = Object.keys(list[0].geometry.attributes).sort().join(",");
    if (list.some((m) => Object.keys(m.geometry.attributes).sort().join(",") !== keys || !!m.geometry.index !== !!list[0].geometry.index)) continue;
    const geos = list.map((m, i) => {
      const g = m.geometry.clone();
      g.morphAttributes = {};
      const n = g.attributes.position.count;
      g.setAttribute("aMat", new THREE.Float32BufferAttribute(new Float32Array(n).fill(i), 1));
      return g;
    });
    const geo = mergeGeometries(geos, false);
    if (!geo) continue;
    geo.userData.model = true;
    const mats = list.map((m) => m.material as THREE.MeshStandardMaterial);
    const parts: Part[] = mats.map((m) => {
      const face = m.name.startsWith("face");
      return { name: m.name, color: (m.color ?? new THREE.Color(1, 1, 1)).clone(), emissive: (m.emissive ?? new THREE.Color(0, 0, 0)).clone(), vc: !face, face };
    });
    merged.set(geo, { tex: layerTexture(mats.map((m) => m.map ?? null)), parts });
    const one = new THREE.SkinnedMesh(geo, mats[0]);
    one.name = list[0].name;
    one.position.copy(list[0].position);
    one.quaternion.copy(list[0].quaternion);
    one.scale.copy(list[0].scale);
    one.bind(skel, list[0].bindMatrix);
    for (const m of list) parent.remove(m);
    parent.add(one);
  }
}

export function mergedMaterial(geo: THREE.BufferGeometry, dye: (part: string) => THREE.Color | null): THREE.MeshLambertMaterial | null {
  const info = merged.get(geo);
  if (!info) return null;
  const tint = Array.from({ length: MAX }, () => new THREE.Vector4(1, 1, 1, 1));
  const emis = Array.from({ length: MAX }, () => new THREE.Vector4(0, 0, 0, 0));
  info.parts.forEach((p, i) => {
    const c = dye(p.name) ?? p.color;
    tint[i].set(c.r, c.g, c.b, p.vc ? 1 : 0);
    emis[i].set(p.emissive.r, p.emissive.g, p.emissive.b, p.face ? 1 : 0);
  });
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.name = "merged";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLayers = { value: info.tex };
    shader.uniforms.uTint = { value: tint };
    shader.uniforms.uEmis = { value: emis };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\nattribute float aMat;\nflat varying int vMat;\nvarying vec2 vUv0;\nuniform vec4 uTint[${MAX}];`,
      )
      .replace(
        "#include <color_vertex>",
        "#include <color_vertex>\nvMat = int(aMat + 0.5);\nvUv0 = uv;\nvec4 tnt = uTint[vMat];\nif (tnt.w < 0.5) vColor = vColor * 0.0 + 1.0;\nvColor.rgb *= tnt.rgb;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform highp sampler2DArray uLayers;\nuniform vec4 uEmis[${MAX}];\nflat varying int vMat;\nvarying vec2 vUv0;`,
      )
      .replace(
        "#include <map_fragment>",
        "vec4 em = uEmis[vMat];\nvec2 tuv = vUv0;\nif (em.w > 0.5) { vec2 sz = vec2(textureSize(uLayers, 0).xy); tuv = (floor(fract(tuv) * sz) + 0.5) / sz; }\ndiffuseColor *= texture(uLayers, vec3(tuv, float(vMat)));",
      )
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += em.rgb;");
  };
  mat.customProgramCacheKey = () => "merged-parts";
  return mat;
}
