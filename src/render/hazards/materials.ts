// Shared textures, geometry and materials for hazard views (snares, traps, zones, terrain mods), and free(),
// which disposes a hazard view while sparing everything shared (KEEP_GEO / KEEP_MAT, userData.model / keep).
import * as THREE from "three";
import woodUrl from "../../../assets/textures/wood.png?url";
import planksUrl from "../../../assets/textures/planks.png?url";
import barkUrl from "../../../assets/textures/moss_bark.png?url";
import { composite, WARDEN, WARLORD } from "../fx/atlas";

export const loader = new THREE.TextureLoader();
function tex(url: string): THREE.Texture {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const woodTex = tex(woodUrl);
const plankTex = tex(planksUrl);
export const WOOD = new THREE.MeshLambertMaterial({ map: plankTex, color: 0xffffff });
export const WOOD_DARK = new THREE.MeshLambertMaterial({ map: plankTex, color: 0xb89c84 });
export const MOSS_STONE = new THREE.MeshLambertMaterial({
  map: composite(128, (g, img) => {
    g.fillStyle = "#2e2e28";
    g.fillRect(0, 0, 128, 128);
    g.drawImage(img(WARDEN.stone), -5, -5, 138, 138);
  }),
  flatShading: true,
});
export const MOSS_TUFT = new THREE.MeshBasicMaterial({
  map: WARDEN.moss,
  transparent: true,
  alphaTest: 0.4,
  side: THREE.DoubleSide,
});
export const FLOWER = new THREE.MeshBasicMaterial({
  map: WARDEN.flower,
  transparent: true,
  alphaTest: 0.4,
  side: THREE.DoubleSide,
});
export const vineTex = new THREE.TextureLoader().load(barkUrl);
vineTex.colorSpace = THREE.SRGBColorSpace;
vineTex.wrapS = vineTex.wrapT = THREE.RepeatWrapping;
vineTex.repeat.set(4, 1);
export const VINE = new THREE.MeshLambertMaterial({ map: vineTex, color: 0xa8b870, flatShading: true });
export function crossQuad(mat: THREE.Material, w: number, h: number, n = 2): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    q.rotation.y = (i / n) * Math.PI;
    q.position.y = h / 2;
    g.add(q);
  }
  return g;
}
export const chunkGeo = new THREE.DodecahedronGeometry(1, 0);
export const STONE_CHUNK = new THREE.MeshLambertMaterial({
  map: composite(64, (g, img) => g.drawImage(img(WARLORD.slab), 0, 0, 64, 64)),
  flatShading: true,
});
export const thornGeo = new THREE.ConeGeometry(0.06, 0.3, 4);
export const thornBig = new THREE.ConeGeometry(0.1, 0.7, 5);
export const LEAF_A = new THREE.MeshBasicMaterial({
  map: WARDEN.leaf,
  transparent: true,
  alphaTest: 0.4,
  side: THREE.DoubleSide,
});
export const LEAF_B = new THREE.MeshBasicMaterial({
  map: WARDEN.leafAutumn,
  transparent: true,
  alphaTest: 0.4,
  side: THREE.DoubleSide,
});
export const THORN = new THREE.MeshLambertMaterial({ color: 0x3f5a2a, flatShading: true });
export const BONE = new THREE.MeshLambertMaterial({ color: 0xe8dcc0, flatShading: true });
export const ROCK = new THREE.MeshLambertMaterial({ color: 0x6a5c4a, flatShading: true });
export const IRON = new THREE.MeshLambertMaterial({ color: 0x5a5a64, flatShading: true });
export const COPPER = new THREE.MeshLambertMaterial({ color: 0xd07a3a, flatShading: true, emissive: 0x301000 });
export const stakeGeo = (() => {
  const g = new THREE.CylinderGeometry(0.17, 0.2, 2.4, 6);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++)
    if (p.getY(i) > 1.1) p.setXYZ(i, p.getX(i) * 0.05, p.getY(i) + 0.35, p.getZ(i) * 0.05);
  g.computeVertexNormals();
  return g;
})();
export const STAKE = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xe8c8a0, flatShading: true });
export const ROPE = new THREE.MeshLambertMaterial({ color: 0x8a6a40, flatShading: true });
export const KEEP_GEO = new Set<THREE.BufferGeometry>([thornGeo, thornBig, chunkGeo, stakeGeo]);
const KEEP_MAT = new Set<THREE.Material>([
  STONE_CHUNK,
  STAKE,
  ROPE,
  WOOD,
  WOOD_DARK,
  THORN,
  BONE,
  ROCK,
  IRON,
  COPPER,
  MOSS_STONE,
  MOSS_TUFT,
  FLOWER,
  VINE,
  LEAF_A,
  LEAF_B,
]);
export function free(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !KEEP_GEO.has(mesh.geometry) && !mesh.geometry.userData.model && !(o instanceof THREE.Sprite))
      mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) if (!KEEP_MAT.has(mat) && !mat.userData.keep) mat.dispose();
  });
}
