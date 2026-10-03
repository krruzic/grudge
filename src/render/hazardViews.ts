import woodUrl from "../../assets/textures/wood.png?url";
import blockUrl from "../../assets/textures/wallblock.png?url";
import barkUrl from "../../assets/textures/moss_bark.png?url";
import * as THREE from "three";
import { prop, propParts } from "./props";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { World } from "../sim/world";
import { composite, ENGINEER, FX, RAIDER, SUMMONER, WARDEN, WARLORD } from "./fxKit";
import type { FxHost } from "./fxParts";
import { wardenBrambleCast, wardenSprout, wardenWallBlock, wardenWallCrumble } from "./wardenFx";
import { buildFissures } from "./fxParts";
import { SpriteBatches } from "./spriteBatch";
import { MapFx } from "./mapFx";

const loader = new THREE.TextureLoader();
function tex(url: string): THREE.Texture {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const woodTex = tex(woodUrl);
const blockTex = tex(blockUrl);
const WOOD = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xf0d4b0 });
const WOOD_DARK = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xa08060 });
void blockTex;
const MOSS_STONE = new THREE.MeshLambertMaterial({
  map: composite(128, (g, img) => {
    g.fillStyle = "#2e2e28";
    g.fillRect(0, 0, 128, 128);
    g.drawImage(img(WARDEN.stone), -5, -5, 138, 138);
  }),
  flatShading: true,
});
const MOSS_TUFT = new THREE.MeshBasicMaterial({ map: WARDEN.moss, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
const FLOWER = new THREE.MeshBasicMaterial({ map: WARDEN.flower, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
const vineTex = new THREE.TextureLoader().load(barkUrl);
vineTex.colorSpace = THREE.SRGBColorSpace;
vineTex.wrapS = vineTex.wrapT = THREE.RepeatWrapping;
vineTex.repeat.set(4, 1);
const VINE = new THREE.MeshLambertMaterial({ map: vineTex, color: 0xa8b870, flatShading: true });
const BRAMBLE_DECAL = composite(256, (g, img) => {
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  gr.addColorStop(0, "rgba(34,24,12,0.85)");
  gr.addColorStop(0.75, "rgba(44,34,18,0.6)");
  gr.addColorStop(1, "rgba(44,34,18,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  g.drawImage(img(WARDEN.roots), 8, 8, 240, 240);
  g.globalAlpha = 0.9;
  g.drawImage(img(WARDEN.wreath), 14, 14, 228, 228);
});
function crossQuad(mat: THREE.Material, w: number, h: number, n = 2): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    q.rotation.y = (i / n) * Math.PI;
    q.position.y = h / 2;
    g.add(q);
  }
  return g;
}
const chunkGeo = new THREE.DodecahedronGeometry(1, 0);
const STONE_CHUNK = new THREE.MeshLambertMaterial({ map: composite(64, (g, img) => g.drawImage(img(WARLORD.slab), 0, 0, 64, 64)), flatShading: true });
function disc(draw: (g: CanvasRenderingContext2D, img: (t: THREE.Texture) => CanvasImageSource) => void): THREE.CanvasTexture {
  return composite(256, (g, img) => {
    g.save();
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.clip();
    draw(g, img);
    g.restore();
  });
}
const ZONE_DECAL: Record<string, THREE.Texture> = {
  sinkhole: disc((g, img) => {
    const gr = g.createRadialGradient(128, 128, 8, 128, 128, 126);
    gr.addColorStop(0, "rgba(6,4,2,1)");
    gr.addColorStop(0.5, "rgba(40,28,18,0.85)");
    gr.addColorStop(1, "rgba(60,44,30,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.drawImage(img(WARLORD.crackRing), 0, 0, 256, 256);
  }),
  crater: disc((g, img) => {
    g.globalAlpha = 0.95;
    g.drawImage(img(WARLORD.crackRing), 0, 0, 256, 256);
    g.globalAlpha = 0.7;
    g.drawImage(img(FX.crack), 30, 30, 196, 196);
  }),
  lava: disc((g, img) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, "rgba(40,16,6,0.9)");
    gr.addColorStop(0.8, "rgba(50,24,10,0.6)");
    gr.addColorStop(1, "rgba(50,24,10,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.drawImage(img(WARLORD.lavaCrack), 0, 0, 256, 256);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.5;
    g.drawImage(img(WARLORD.lavaCrack), 20, 20, 216, 216);
  }),
  bones: disc((g, img) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, "rgba(30,14,40,0.85)");
    gr.addColorStop(1, "rgba(30,14,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.drawImage(img(SUMMONER.hex), 0, 0, 256, 256);
  }),
  tesla: disc((g, img) => {
    g.drawImage(img(FX.crack), 0, 0, 256, 256);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.8;
    g.drawImage(img(ENGINEER.arc), 20, 90, 216, 76);
    g.translate(128, 128);
    g.rotate(Math.PI / 2);
    g.drawImage(img(ENGINEER.arc), -108, -38, 216, 76);
  }),
  smoke: disc((g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, "rgba(30,24,40,0.6)");
    gr.addColorStop(1, "rgba(30,24,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }),
  grove: disc((g, img) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, "rgba(120,200,80,0.45)");
    gr.addColorStop(0.85, "rgba(90,160,60,0.35)");
    gr.addColorStop(1, "rgba(90,160,60,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.globalAlpha = 0.8;
    g.drawImage(img(WARDEN.rune), 0, 0, 256, 256);
  }),
};

const stakeGeo = (() => {
  const g = new THREE.CylinderGeometry(0.17, 0.2, 2.4, 6);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.1) p.setXYZ(i, p.getX(i) * 0.05, p.getY(i) + 0.35, p.getZ(i) * 0.05);
  g.computeVertexNormals();
  return g;
})();
const STAKE = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xe8c8a0, flatShading: true });
const ROPE = new THREE.MeshLambertMaterial({ color: 0x8a6a40, flatShading: true });

export function teslaCoil(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const model = prop("tesla");
  if (model) {
    g.add(model);
    const at = model.getObjectByName("glow");
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: ENGINEER.arc, color: 0x9ad0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.y = at ? at.position.y : 2.2;
    glow.scale.setScalar(1.2);
    glow.name = "coilglow";
    g.add(glow);
    g.scale.setScalar(scale);
    return g;
  }
  const iron = IRON;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.4, 8), STONE_CHUNK);
  base.position.y = 0.2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.8, 6), iron);
  post.position.y = 1.2;
  g.add(base, post);
  for (let k = 0; k < 5; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 - k * 0.04, 0.07, 5, 12), COPPER);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.6 + k * 0.3;
    g.add(ring);
  }
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), COPPER);
  ball.position.y = 2.2;
  g.add(ball);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: ENGINEER.arc, color: 0x9ad0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.y = 2.2;
  glow.scale.setScalar(1.2);
  glow.name = "coilglow";
  g.add(glow);
  g.scale.setScalar(scale);
  return g;
}

const thornGeo = new THREE.ConeGeometry(0.06, 0.3, 4);
const thornBig = new THREE.ConeGeometry(0.1, 0.7, 5);
const LEAF_A = new THREE.MeshBasicMaterial({ map: WARDEN.leaf, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
const LEAF_B = new THREE.MeshBasicMaterial({ map: WARDEN.leafAutumn, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
const easeBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

function worldBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}
const THORN = new THREE.MeshLambertMaterial({ color: 0x3f5a2a, flatShading: true });
const BONE = new THREE.MeshLambertMaterial({ color: 0xe8dcc0, flatShading: true });
const ROCK = new THREE.MeshLambertMaterial({ color: 0x6a5c4a, flatShading: true });
const IRON = new THREE.MeshLambertMaterial({ color: 0x5a5a64, flatShading: true });
const COPPER = new THREE.MeshLambertMaterial({ color: 0xd07a3a, flatShading: true, emissive: 0x301000 });

function groundTex(draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  draw(c, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const blot = (c: CanvasRenderingContext2D, s: number, colors: string[], n: number) => {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.7) * (s / 2 - 6);
    const z = 3 + Math.random() * 9 * (1 - r / (s / 2));
    c.fillStyle = colors[k % colors.length];
    c.fillRect(Math.round(s / 2 + Math.cos(a) * r - z / 2), Math.round(s / 2 + Math.sin(a) * r - z / 2), Math.round(z), Math.round(z));
  }
};
const ZONE_TEX: Record<string, THREE.CanvasTexture> = {
  bramble: groundTex((c, s) => blot(c, s, ["rgba(40,28,14,0.8)", "rgba(58,40,20,0.7)", "rgba(50,70,28,0.75)"], 160)),
  sinkhole: groundTex((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2 - 4);
    g.addColorStop(0, "rgba(8,5,3,1)");
    g.addColorStop(0.55, "rgba(46,32,20,0.9)");
    g.addColorStop(1, "rgba(80,60,40,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.lineWidth = 3;
    for (let arm = 0; arm < 5; arm++) {
      c.beginPath();
      for (let k = 0; k <= 30; k++) {
        const f = k / 30;
        const a = arm * (Math.PI * 2 / 5) + f * 4;
        const r = (1 - f) * (s / 2 - 8) + 6;
        c.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
      }
      c.strokeStyle = "rgba(20,12,6,0.9)";
      c.stroke();
    }
  }),
  crater: groundTex((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, s / 2 - 4);
    g.addColorStop(0, "rgba(30,22,16,0.95)");
    g.addColorStop(0.7, "rgba(70,54,38,0.8)");
    g.addColorStop(1, "rgba(90,70,50,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    blot(c, s, ["rgba(20,14,10,0.6)", "rgba(110,90,66,0.6)"], 60);
  }),
  tesla: groundTex((c, s) => {
    blot(c, s, ["rgba(24,22,26,0.75)", "rgba(40,38,44,0.6)"], 120);
    c.strokeStyle = "rgba(210,130,60,0.9)";
    c.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(s / 2, s / 2);
      let x = s / 2;
      let y = s / 2;
      for (let j = 0; j < 5; j++) {
        x += Math.cos(a + (Math.random() - 0.5)) * 11;
        y += Math.sin(a + (Math.random() - 0.5)) * 11;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }),
  bones: groundTex((c, s) => {
    blot(c, s, ["rgba(60,50,56,0.7)", "rgba(90,80,84,0.6)", "rgba(40,20,50,0.7)"], 140);
    c.strokeStyle = "rgba(200,120,255,0.8)";
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2);
    c.stroke();
  }),
};

const KEEP_GEO = new Set<THREE.BufferGeometry>([thornGeo, thornBig, chunkGeo, stakeGeo]);
const KEEP_MAT = new Set<THREE.Material>([STONE_CHUNK, STAKE, ROPE, WOOD, WOOD_DARK, THORN, BONE, ROCK, IRON, COPPER, MOSS_STONE, MOSS_TUFT, FLOWER, VINE, LEAF_A, LEAF_B]);
function free(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !KEEP_GEO.has(mesh.geometry) && !mesh.geometry.userData.model && !(o instanceof THREE.Sprite)) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) if (!KEEP_MAT.has(mat) && !mat.userData.keep) mat.dispose();
  });
}

type GrowU = { uGrowT: { value: number }; uGrowIn: { value: THREE.Vector2 }; uGrowMul: { value: THREE.Vector2 }; uSway: { value: THREE.Vector2 } };
const GROW_HEAD = "attribute vec3 aGrowCenter;\nattribute vec2 aGrowDelay;\nuniform float uGrowT;\nuniform vec2 uGrowIn;\nuniform vec2 uGrowMul;\nuniform vec2 uSway;\n";
const GROW_BODY = `
float gT = uGrowT - aGrowDelay.x;
float gK = gT / 0.3 - 1.0;
float gE = gT <= 0.0 ? 0.001 : gT >= 0.3 ? 1.0 : 1.0 + 2.7 * gK * gK * gK + 1.7 * gK * gK;
vec2 gS = max(vec2(0.001), gE * uGrowIn) * uGrowMul;
float gC = cos(aGrowDelay.y);
float gN = sin(aGrowDelay.y);
vec3 gD = transformed - aGrowCenter;
gD = vec3(gC * gD.x - gN * gD.z, gD.y, gN * gD.x + gC * gD.z) * vec3(gS.x, gS.y, gS.x);
float gA = uSway.x * sin(uSway.y + aGrowCenter.x);
gD.xy = vec2(cos(gA) * gD.x - sin(gA) * gD.y, sin(gA) * gD.x + cos(gA) * gD.y);
transformed = aGrowCenter + vec3(gC * gD.x + gN * gD.z, gD.y, -gN * gD.x + gC * gD.z);
`;
function growMat(base: THREE.Material, u: GrowU): THREE.Material {
  const m = base.clone();
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = GROW_HEAD + s.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + GROW_BODY);
  };
  m.customProgramCacheKey = () => "grow";
  return m;
}
type Piece = { mesh: THREE.Mesh; c?: THREE.Vector3; d?: number; yaw?: number };
function mergeInto(parent: THREE.Object3D, pieces: Piece[], u?: GrowU): void {
  parent.updateMatrixWorld(true);
  const inv = parent.matrixWorld.clone().invert();
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of pieces) {
    const src = p.mesh.geometry;
    const geo = src.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, p.mesh.matrixWorld));
    if (!KEEP_GEO.has(src) && !src.userData.model) src.dispose();
    p.mesh.removeFromParent();
    if (u) {
      const n = geo.getAttribute("position").count;
      const c = new Float32Array(n * 3);
      const d = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        c[i * 3] = p.c!.x;
        c[i * 3 + 1] = p.c!.y;
        c[i * 3 + 2] = p.c!.z;
        d[i * 2] = p.d!;
        d[i * 2 + 1] = p.yaw!;
      }
      geo.setAttribute("aGrowCenter", new THREE.BufferAttribute(c, 3));
      geo.setAttribute("aGrowDelay", new THREE.BufferAttribute(d, 2));
    }
    const mat = p.mesh.material as THREE.Material;
    const list = by.get(mat) ?? [];
    list.push(geo);
    by.set(mat, list);
  }
  for (const [mat, geos] of by) {
    const merged = mergeGeometries(geos.every((q) => q.index) ? geos : geos.map((q) => (q.index ? q.toNonIndexed() : q)))!;
    merged.computeBoundingSphere();
    if (u) merged.boundingSphere!.radius += 0.6;
    parent.add(new THREE.Mesh(merged, u ? growMat(mat, u) : mat));
  }
}
const WALL_CELLS = 64;
const WALL_HIDDEN = -100;
const WALL_HEAD = `attribute vec4 aCellO;\nuniform vec2 uCell[${WALL_CELLS}];\n`;
const WALL_NORMAL = `
vec2 wN = uCell[int(aCellO.w)];
objectNormal.xy = vec2(cos(wN.y) * objectNormal.x - sin(wN.y) * objectNormal.y, sin(wN.y) * objectNormal.x + cos(wN.y) * objectNormal.y);
`;
const WALL_BODY = `
vec2 wC = uCell[int(aCellO.w)];
vec3 wD = transformed - aCellO.xyz;
wD.xy = vec2(cos(wC.y) * wD.x - sin(wC.y) * wD.y, sin(wC.y) * wD.x + cos(wC.y) * wD.y);
transformed = wC.x < ${WALL_HIDDEN / 2}.0 ? aCellO.xyz : aCellO.xyz + vec3(0.0, wC.x, 0.0) + wD;
`;
function wallMat(base: THREE.Material, u: { value: Float32Array }): THREE.Material {
  const m = base.clone();
  m.onBeforeCompile = (s) => {
    s.uniforms.uCell = u;
    s.vertexShader = WALL_HEAD + s.vertexShader
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n" + WALL_NORMAL)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + WALL_BODY);
  };
  m.customProgramCacheKey = () => "wallcells";
  return m;
}
function mergeWall(g: THREE.Group, cells: THREE.Object3D[]): void {
  const u = { value: new Float32Array(WALL_CELLS * 2) };
  for (let k = 0; k < cells.length; k++) u.value[k * 2] = WALL_HIDDEN;
  g.userData.cellU = u;
  g.userData.cells = cells;
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  cells.forEach((cell, k) => {
    cell.updateMatrixWorld(true);
    for (const mesh of meshesOf(cell)) {
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (!KEEP_GEO.has(mesh.geometry) && !mesh.geometry.userData.model) mesh.geometry.dispose();
      const n = geo.getAttribute("position").count;
      const o = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        o[i * 4] = cell.position.x;
        o[i * 4 + 1] = cell.position.y;
        o[i * 4 + 2] = cell.position.z;
        o[i * 4 + 3] = k;
      }
      geo.setAttribute("aCellO", new THREE.BufferAttribute(o, 4));
      const mat = mesh.material as THREE.Material;
      const list = by.get(mat) ?? [];
      list.push(geo);
      by.set(mat, list);
    }
    cell.clear();
  });
  for (const [mat, geos] of by) {
    const merged = mergeGeometries(geos)!;
    for (const q of geos) q.dispose();
    merged.computeBoundingSphere();
    merged.boundingSphere!.radius += 0.5;
    g.add(new THREE.Mesh(merged, wallMat(mat, u)));
  }
}
function syncWall(o: THREE.Object3D): void {
  const a = (o.userData.cellU as { value: Float32Array }).value;
  (o.userData.cells as THREE.Object3D[]).forEach((c, k) => {
    a[k * 2] = c.visible ? c.position.y - c.userData.baseY : WALL_HIDDEN;
    a[k * 2 + 1] = c.rotation.z;
  });
}
function mergeFlat(parent: THREE.Object3D): void {
  mergeInto(parent, meshesOf(parent).map((mesh) => ({ mesh })));
  for (const c of [...parent.children]) if (!(c as THREE.Mesh).isMesh && !c.children.length) parent.remove(c);
}
function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
}

export class HazardViews {
  readonly root = new THREE.Group();
  private traps = new Map<number, THREE.Object3D>();
  private zones = new Map<number, THREE.Object3D>();
  private mods = new Map<number, THREE.Object3D>();
  private sprites = new SpriteBatches();

  private now = 0;

  dispose(): void {
    this.mapFx.dispose();
    for (const o of [...this.traps.values(), ...this.zones.values(), ...this.mods.values(), ...this.dying.map((d) => d.obj)]) free(o);
    this.traps.clear();
    this.zones.clear();
    this.mods.clear();
    this.dying = [];
    this.sprites.dispose();
  }

  private mapFx: MapFx;

  constructor(private world: World, private teamColors: THREE.Color[], private fx?: FxHost) {
    this.root.add(this.sprites.root);
    this.mapFx = new MapFx(world, fx);
    this.mapFx.teamColors = teamColors;
    this.root.add(this.mapFx.root);
  }

  fillView(camera: THREE.Camera): void {
    this.sprites.fill(camera);
  }

  private snareMesh(team: number, r: number): THREE.Object3D {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.15, r * 1.02, 24), new THREE.MeshBasicMaterial({ map: BRAMBLE_DECAL, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    const glow = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r * 1.05, 28), new THREE.MeshBasicMaterial({ color: this.teamColors[team], transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.08;
    glow.name = "glow";
    g.add(glow);
    const jaws = new THREE.Group();
    jaws.name = "jaws";
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const rr = r * (0.55 + Math.random() * 0.3);
      const A = new THREE.Vector3(Math.cos(a) * rr, -0.1, Math.sin(a) * rr);
      const tip = new THREE.Vector3(Math.cos(a) * rr * 0.25, 0.55 + Math.random() * 0.25, Math.sin(a) * rr * 0.25);
      const M = A.clone().lerp(tip, 0.5).add(new THREE.Vector3(Math.cos(a) * 0.35, 0.25, Math.sin(a) * 0.35));
      const curve = new THREE.QuadraticBezierCurve3(A, M, tip);
      const vine = new THREE.Group();
      vine.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.07, 5, false), VINE));
      for (let k = 0; k < 4; k++) {
        const u = 0.2 + k * 0.2;
        const th = new THREE.Mesh(thornGeo, THORN);
        const side = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
        th.position.copy(curve.getPoint(u)).addScaledVector(side, 0.08);
        th.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side);
        vine.add(th);
      }
      if (i % 2 === 0) {
        const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), i % 4 ? LEAF_B : LEAF_A);
        lf.position.copy(curve.getPoint(0.45)).add(new THREE.Vector3(0, 0.06, 0));
        lf.rotation.set(-1.2, Math.random() * 6, 0);
        vine.add(lf);
      }
      vine.userData.a = a;
      jaws.add(vine);
    }
    g.add(jaws);
    const center = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ map: vineTex, color: 0x8a6a40, flatShading: true }));
    center.position.y = 0.05;
    center.scale.set(1, 0.6, 1);
    g.add(center);
    return g;
  }

  private trapMesh(team: number): THREE.Object3D {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x4a4440, flatShading: true }));
    g.add(base);
    const tm = new THREE.MeshLambertMaterial({ color: this.teamColors[team], flatShading: true, emissive: this.teamColors[team].clone().multiplyScalar(0.3) });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), tm);
      tooth.position.set(Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45);
      tooth.rotation.z = Math.cos(a) * 0.5;
      tooth.rotation.x = -Math.sin(a) * 0.5;
      g.add(tooth);
    }
    return g;
  }

  private zoneMesh(team: number, r: number, style = "bramble"): THREE.Object3D {
    const g = new THREE.Group();
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(r * 2.1, r * 2.1),
      new THREE.MeshBasicMaterial({ map: ZONE_TEX[style] ?? ZONE_TEX.bramble, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 0.12;
    decal.visible = false;
    g.add(decal);
    const gy = (x: number, z: number) => this.world.groundY(this.cx + x, this.cz + z) - this.cy;
    if (style === "lava" || style === "crater" || style === "sinkhole") {
      const fis = buildFissures(gy, r * 0.9, style === "lava" ? "lava" : "crack").group;
      g.add(fis);
      mergeInto(fis, meshesOf(fis).map((mesh) => ({ mesh })));
      for (const s of [...fis.children]) if (!(s as THREE.Mesh).isMesh) fis.remove(s);
    }
    const grows: { o: THREE.Object3D; d: number }[] = [];
    const scatter = (n: number, make: () => THREE.Mesh, lift = 0) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r * 0.9;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const m = make();
        m.position.set(x, gy(x, z) + lift, z);
        g.add(m);
      }
    };
    if (style === "bramble") {
      decal.material = new THREE.MeshBasicMaterial({ map: BRAMBLE_DECAL, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const grow = (o: THREE.Object3D, x: number, z: number) => {
        grows.push({ o, d: (Math.hypot(x, z) / r) * 0.55 + Math.random() * 0.1 });
        g.add(o);
      };
      const arches = Math.round(r * 6);
      for (let i = 0; i < arches; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r * 0.85;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const t = Math.random() * Math.PI * 2;
        const len = 1.2 + Math.random() * 1.4;
        const hgt = 0.55 + Math.random() * 0.75;
        const A = new THREE.Vector3(-Math.cos(t) * len / 2, gy(x - Math.cos(t) * len / 2, z - Math.sin(t) * len / 2) - 0.1, -Math.sin(t) * len / 2);
        const B = new THREE.Vector3(Math.cos(t) * len / 2, gy(x + Math.cos(t) * len / 2, z + Math.sin(t) * len / 2) - 0.1, Math.sin(t) * len / 2);
        const M = A.clone().add(B).multiplyScalar(0.5);
        M.y += hgt * 2;
        const curve = new THREE.QuadraticBezierCurve3(A, M, B);
        const arch = new THREE.Group();
        arch.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.1 + Math.random() * 0.05, 6, false), VINE));
        for (let k = 0; k < 2; k++) {
          const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), k ? LEAF_B : LEAF_A);
          lf.position.copy(curve.getPoint(0.3 + Math.random() * 0.4)).add(new THREE.Vector3(0, 0.08, 0));
          lf.rotation.set(-1.1 + Math.random() * 0.6, Math.random() * 6, Math.random() - 0.5);
          arch.add(lf);
        }
        for (let k = 0; k < 7; k++) {
          const u = 0.12 + (k / 5) * 0.76;
          const p = curve.getPoint(u);
          const tan = curve.getTangent(u);
          const side = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).cross(tan).normalize();
          const th = new THREE.Mesh(thornGeo, THORN);
          th.position.copy(p).addScaledVector(side, 0.12);
          th.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side);
          arch.add(th);
        }
        arch.position.set(x, 0, z);
        grow(arch, x, z);
      }
      for (let i = 0; i < Math.round(r * 2.4); i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r * 0.8;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const clump = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const sp = new THREE.Mesh(thornBig, THORN);
          const ta = (k / 5) * Math.PI * 2 + Math.random();
          sp.position.set(Math.cos(ta) * 0.15, 0.3, Math.sin(ta) * 0.15);
          sp.rotation.set(Math.sin(ta) * 0.5, 0, -Math.cos(ta) * 0.5);
          clump.add(sp);
        }
        clump.position.set(x, gy(x, z) - 0.05, z);
        grow(clump, x, z);
      }
      for (let i = 0; i < Math.round(r * 1.2); i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r * 0.85;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const f = crossQuad(FLOWER, 0.34, 0.34);
        f.position.set(x, gy(x, z) + 0.02, z);
        f.rotation.y = Math.random() * 3;
        grow(f, x, z);
      }
      for (let i = 0; i < 4; i++) {
        const w = new THREE.Sprite(new THREE.SpriteMaterial({ map: WARDEN.wisp, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
        w.name = "wisp";
        w.userData.phase = (i / 4) * Math.PI * 2;
        w.userData.rad = r * (0.35 + Math.random() * 0.45);
        w.scale.setScalar(0.55);
        g.add(w);
      }
    } else {
      const sprite = (tex: THREE.Texture, size: number, x: number, z: number, lift = 0, additive = false, name = "") => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
        sp.scale.setScalar(size);
        sp.position.set(x, gy(x, z) + lift + size * 0.4, z);
        if (name) sp.name = name;
        sp.userData.base = sp.position.clone();
        sp.userData.phase = Math.random() * 6;
        g.add(sp);
        return sp;
      };
      const ring = (n: number, frac: [number, number], f: (x: number, z: number, i: number) => void) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
          const d = r * (frac[0] + Math.random() * (frac[1] - frac[0]));
          f(Math.cos(a) * d, Math.sin(a) * d, i);
        }
      };
      decal.material = new THREE.MeshBasicMaterial({ map: ZONE_DECAL[style] ?? ZONE_TEX.bramble, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      if (style === "sinkhole" || style === "crater") {
        const rocks = new THREE.Group();
        rocks.name = "spin";
        g.add(rocks);
        ring(Math.round(r * (style === "sinkhole" ? 2.6 : 2)), [0.4, 0.95], (x, z) => {
          const m = new THREE.Mesh(chunkGeo, STONE_CHUNK);
          const s2 = 0.25 + Math.random() * 0.3;
          m.scale.set(s2, s2 * 0.7, s2);
          m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
          m.position.set(x, gy(x, z) + 0.08, z);
          rocks.add(m);
        });
        mergeInto(rocks, meshesOf(rocks).map((mesh) => ({ mesh })));
        ring(Math.round(r * 1.5), [0.5, 1], (x, z) => sprite(FX.dust, 0.9 + Math.random() * 0.5, x, z, 0, false, "drift"));
      } else if (style === "bones") {
        ring(Math.round(r * 2.4), [0.15, 0.9], (x, z, i) => {
          const sp = sprite(i % 3 === 0 ? SUMMONER.graveHand : SUMMONER.bones, 0.8 + Math.random() * 0.4, x, z, -0.15);
          sp.center.set(0.5, 0.1);
          sp.position.y = gy(x, z) - 0.05;
          sp.name = "rise";
        });
        sprite(SUMMONER.skull, 0.9, 0, 0, 0.1);
        const tomb = propParts("tomb");
        if (tomb) {
          ring(Math.max(2, Math.round(r * 0.9)), [0.35, 0.85], (x, z) => {
            const t = new THREE.Mesh(tomb.geo, tomb.mat);
            t.position.set(x, gy(x, z) - 0.05, z);
            t.rotation.set((Math.random() - 0.5) * 0.25, Math.atan2(x, z) + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.25);
            t.scale.setScalar(0.8 + Math.random() * 0.3);
            grows.push({ o: t, d: Math.random() * 0.3 });
            g.add(t);
          });
        }
        ring(3, [0.2, 0.7], (x, z) => sprite(SUMMONER.ghost, 0.8, x, z, 0.6, true, "wisp"));
      } else if (style === "tesla") {
        const coil = teslaCoil(0.8);
        coil.position.y = gy(0, 0);
        g.add(coil);
        mergeInto(coil, meshesOf(coil).map((mesh) => ({ mesh })));
        const arc = new THREE.Sprite(new THREE.SpriteMaterial({ map: ENGINEER.arc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        arc.name = "zap";
        arc.userData.top = gy(0, 0) + 2.1;
        g.add(arc);
        ring(5, [0.4, 0.95], (x, z) => sprite(ENGINEER.weld, 0.5, x, z, 0, true, "spark"));
      } else if (style === "lava") {
        ring(Math.round(r * 1.6), [0.2, 0.95], (x, z) => sprite(WARLORD.lavaGlow, 0.9 + Math.random() * 0.6, x, z, -0.2, true, "glow"));
        ring(Math.round(r * 2), [0.1, 1], (x, z) => sprite(WARLORD.ember, 0.3, x, z, 0.2, true, "ember"));
        const chunks: Piece[] = [];
        ring(Math.round(r * 1.2), [0.5, 1], (x, z) => {
          const m = new THREE.Mesh(chunkGeo, STONE_CHUNK);
          const s2 = 0.3 + Math.random() * 0.35;
          m.scale.set(s2, s2 * 0.8, s2);
          m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
          m.position.set(x, gy(x, z) + 0.1, z);
          g.add(m);
          chunks.push({ mesh: m });
        });
        mergeInto(g, chunks);
      } else if (style === "smoke") {
        ring(Math.round(r * 4), [0, 1], (x, z) => sprite(RAIDER.smoke, 1.6 + Math.random() * 1.2, x, z, 0.1, false, "smoke"));
        ring(4, [0.2, 0.8], (x, z) => sprite(RAIDER.shadow, 1.2, x, z, 0.6, false, "smoke"));
      } else if (style === "grove") {
        ring(Math.round(r * 2.2), [0.1, 0.95], (x, z) => {
          const f = crossQuad(FLOWER, 0.35 + Math.random() * 0.15, 0.35);
          f.position.set(x, gy(x, z), z);
          f.rotation.y = Math.random() * 3;
          grows.push({ o: f, d: Math.random() * 0.4 });
          g.add(f);
        });
        ring(Math.round(r * 1.2), [0.1, 0.9], (x, z) => {
          const t = crossQuad(MOSS_TUFT, 0.6, 0.4);
          t.position.set(x, gy(x, z), z);
          grows.push({ o: t, d: Math.random() * 0.4 });
          g.add(t);
        });
        ring(5, [0.2, 0.8], (x, z) => sprite(WARDEN.wisp, 0.6, x, z, 0.8, true, "wisp"));
      }
    }
    if (grows.length) {
      const u: GrowU = { uGrowT: { value: 0 }, uGrowIn: { value: new THREE.Vector2(1, 1) }, uGrowMul: { value: new THREE.Vector2(1, 1) }, uSway: { value: new THREE.Vector2() } };
      g.userData.growU = u;
      g.userData.pops = grows.filter(({ o }) => o.children.length > 2).map(({ o, d }) => ({ d, p: o.position.clone(), done: false }));
      mergeInto(g, grows.flatMap(({ o, d }) => meshesOf(o).map((mesh) => ({ mesh, c: o.position.clone(), d, yaw: o.rotation.y }))), u);
      for (const { o } of grows) g.remove(o);
    }
    return g;
  }

  private cyOf(o: THREE.Object3D): number {
    return o.position.y;
  }

  private cx = 0;
  private cy = 0;
  private cz = 0;

  private modMesh(id: number): THREE.Object3D | null {
    const m = this.world.mods.find((k) => k.id === id);
    if (!m) return null;
    const g = new THREE.Group();
    const W = this.world.terrain.width;
    const cells: THREE.Object3D[] = [];
    const c0 = m.cells[0];
    const c1 = m.cells[m.cells.length - 1];
    const wallYaw = -Math.atan2(Math.floor(c1 / W) - Math.floor(c0 / W), (c1 % W) - (c0 % W));
    m.cells.forEach((c, k) => {
      const x = (c % W) + 0.5;
      const z = Math.floor(c / W) + 0.5;
      if (m.kind !== "wall") {
        const works = m.kind === "works";
        const plank = new THREE.Mesh(worldBox(1.02, works ? 0.22 : 0.14, 1.02), (works ? (x + z) % 2 : k % 2) ? WOOD : WOOD_DARK);
        plank.position.set(x, m.deck[k] - (works ? 0.11 : 0.07), z);
        g.add(plank);
        const ground = this.world.terrain.groundHeight(x, z);
        const h = m.deck[k] - Math.min(ground, this.world.terrain.waterLevel - 0.5);
        if (works && m.deck[k] === m.top && m.cx !== undefined) {
          const ox = Math.abs(x - m.cx) < 0.25 ? 0 : Math.sign(x - m.cx);
          const oz = Math.abs(z - m.cz!) < 0.25 ? 0 : Math.sign(z - m.cz!);
          for (const [sx, sz] of [[ox, 0], [0, oz]] as const) {
            if (!sx && !sz) continue;
            const ni = this.world.terrain.index(Math.floor(x + sx), Math.floor(z + sz));
            if (m.cells.includes(ni)) continue;
            const rail = new THREE.Mesh(worldBox(sx ? 0.12 : 1.02, 0.5, sz ? 0.12 : 1.02), WOOD_DARK);
            rail.position.set(x + sx * 0.46, m.deck[k] + 0.25, z + sz * 0.46);
            g.add(rail);
          }
        }
        if (h > 0.3 && (works || k % 3 === 0)) {
          const post = new THREE.Mesh(worldBox(0.16, h, 0.16), WOOD_DARK);
          post.position.set(x, m.deck[k] - h / 2, z);
          g.add(post);
        }
      } else {
        const y = this.world.terrain.groundHeight(x, z);
        const cell = new THREE.Group();
        cell.position.set(x, y, z);
        const pal = m.style === "wood" ? propParts("palisade") : null;
        const stone = m.style === "wood" ? null : propParts("wallstone");
        const art = pal ?? stone;
        if (art) {
          const piece = new THREE.Mesh(art.geo, art.mat);
          piece.rotation.y = (pal ? wallYaw : Math.floor(Math.random() * 4) * Math.PI / 2) + (Math.random() - 0.5) * 0.2;
          piece.scale.y = 0.92 + Math.random() * 0.16;
          piece.position.y = -0.1;
          cell.add(piece);
          cell.userData.baseY = y;
          cell.userData.delay = Math.abs(k - (m.cells.length - 1) / 2) * 0.05;
          cells.push(cell);
          return;
        }
        if (m.style === "wood") {
          for (let q = 0; q < 3; q++) {
            const st = new THREE.Mesh(stakeGeo, STAKE);
            st.position.set((q - 1) * 0.33 + (Math.random() - 0.5) * 0.06, 1.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.1);
            st.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * 3, (Math.random() - 0.5) * 0.12);
            cell.add(st);
          }
          for (const hy of [0.7, 1.6]) {
            const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 0.42), ROPE);
            band.position.y = hy;
            cell.add(band);
          }
          cell.userData.baseY = y;
          cell.userData.delay = Math.abs(k - (m.cells.length - 1) / 2) * 0.05;
          cells.push(cell);
          return;
        }
        const block = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 1.0), MOSS_STONE);
        block.position.y = 1.0;
        block.rotation.y = (Math.random() - 0.5) * 0.2;
        cell.add(block);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.45, 0.72), MOSS_STONE);
        cap.position.set((Math.random() - 0.5) * 0.2, 2.3, (Math.random() - 0.5) * 0.1);
        cap.rotation.y = Math.random() * 0.6;
        cell.add(cap);
        for (let t = 0; t < 2; t++) {
          const tuft = crossQuad(MOSS_TUFT, 0.6, 0.4);
          tuft.position.set((Math.random() - 0.5) * 0.6, 2.05 + (t ? 0.48 : 0), (Math.random() - 0.5) * 0.6);
          tuft.rotation.y = Math.random() * 3;
          cell.add(tuft);
        }
        cell.userData.baseY = y;
        cell.userData.delay = Math.abs(k - (m.cells.length - 1) / 2) * 0.05;
        cells.push(cell);
      }
    });
    if (m.kind === "wall") mergeWall(g, cells);
    else mergeFlat(g);
    return g;
  }

  handle(ev: { type: string; id?: number }): void {
    if (ev.type === "avalanche" || ev.type === "gates" || ev.type === "lantern" || ev.type === "mist" || ev.type === "morph" || ev.type === "jumppad" || ev.type === "horn") {
      this.mapFx.handle(ev);
      return;
    }
    if (ev.type === "mod" && ev.id !== undefined) {
      const obj = this.modMesh(ev.id);
      const m = this.world.mods.find((k) => k.id === ev.id);
      if (obj) {
        obj.userData.born = this.now;
        obj.userData.wall = m?.kind === "wall";
        if (!obj.userData.wall) obj.scale.y = 0.01;
        else if (this.fx) {
          const cells = obj.userData.cells as THREE.Object3D[];
          const c0 = cells[0]?.position;
          const c1 = cells[cells.length - 1]?.position;
          const dx = c1 && c0 ? c1.x - c0.x : 1;
          const dz = c1 && c0 ? c1.z - c0.z : 0;
          const dl = Math.hypot(dx, dz) || 1;
          for (const c of cells) wardenWallBlock(this.fx, c.position.x, c.userData.baseY, c.position.z, c.userData.delay, dz / dl, -dx / dl, m?.style === "wood");
        }
        this.mods.set(ev.id, obj);
        this.root.add(obj);
      }
    } else if (ev.type === "modEnd" && ev.id !== undefined) {
      const obj = this.mods.get(ev.id);
      if (obj) {
        this.mods.delete(ev.id);
        if (obj.userData.wall && this.fx) {
          for (const c of obj.userData.cells as THREE.Object3D[]) wardenWallCrumble(this.fx, c.position.x, c.userData.baseY, c.position.z);
          this.dying.push({ obj, at: this.now });
        } else {
          this.root.remove(obj);
          free(obj);
        }
      }
    }
  }

  private dying: { obj: THREE.Object3D; at: number }[] = [];

  sync(time: number, dt: number): void {
    this.mapFx.sync(time, dt);
    this.now = time;
    const w = this.world;
    this.dying = this.dying.filter(({ obj, at }) => {
      const k = (time - at) / 0.5;
      for (const c of obj.userData.cells as THREE.Object3D[]) {
        c.position.y = c.userData.baseY - 2.7 * Math.min(1, k * k);
        c.rotation.z = Math.sin(time * 40 + c.position.x) * 0.04;
      }
      syncWall(obj);
      if (k >= 1) {
        this.root.remove(obj);
        free(obj);
      }
      return k < 1;
    });
    for (const m of w.mods) if (!this.mods.has(m.id)) this.handle({ type: "mod", id: m.id });
    for (const id of [...this.mods.keys()]) if (!w.mods.some((m) => m.id === id)) this.handle({ type: "modEnd", id });
    const seenT = new Set<number>();
    for (const t of w.traps) {
      seenT.add(t.id);
      let o = this.traps.get(t.id);
      if (!o) {
        const owner = w.getAny(t.ownerId);
        o = owner?.hero?.type === "warden" ? this.snareMesh(t.team, t.radius) : this.trapMesh(t.team);
        o.userData.snare = owner?.hero?.type === "warden";
        o.position.set(t.x, w.groundY(t.x, t.z) + 0.06, t.z);
        this.traps.set(t.id, o);
        this.root.add(o);
      }
      if (o.userData.snare) {
        const arming = w.time < t.armAt;
        const jaws = o.getObjectByName("jaws")!;
        const open = arming ? 0.35 + 0.65 * (1 - (t.armAt - w.time) / 0.6) : 1;
        jaws.scale.set(1, Math.max(0.2, Math.min(1, open)), 1);
        jaws.children.forEach((v, k) => { v.rotation.y = Math.sin(time * 1.4 + k) * 0.05; });
        const gl = o.getObjectByName("glow") as THREE.Mesh;
        (gl.material as THREE.MeshBasicMaterial).opacity = arming ? 0.2 : 0.35 + 0.2 * Math.sin(time * 3);
      } else o.rotation.y = time * (w.time < t.armAt ? 6 : 0.5);
    }
    for (const [id, o] of this.traps) if (!seenT.has(id)) { this.root.remove(o); free(o); this.traps.delete(id); }
    const seenZ = new Set<number>();
    for (const z of w.zones) {
      seenZ.add(z.id);
      let o = this.zones.get(z.id);
      if (!o) {
        this.cx = z.x;
        this.cz = z.z;
        this.cy = w.groundY(z.x, z.z);
        o = this.zoneMesh(z.team, z.radius, z.style);
        o.position.set(z.x, this.cy, z.z);
        o.userData.born = time;
        o.userData.bramble = (z.style ?? "bramble") === "bramble";
        o.scale.setScalar(1);
        if (o.userData.bramble && this.fx) wardenBrambleCast(this.fx, z.x, this.cy, z.z, z.radius);
        this.sprites.addTree(o);
        this.zones.set(z.id, o);
        this.root.add(o);
      }
      const left = z.until - w.time;
      if (o.userData.bramble) {
        const age = time - o.userData.born;
        for (const p of (o.userData.pops ?? []) as { d: number; p: THREE.Vector3; done: boolean }[]) {
          if (p.done || age <= p.d) continue;
          p.done = true;
          if (this.fx) wardenSprout(this.fx, o.position.x + p.p.x, o.position.y + p.p.y, o.position.z + p.p.z);
        }
        const u = o.userData.growU as GrowU | undefined;
        const out = left < 0.6 ? Math.max(0.001, left / 0.6) : 1;
        if (u) {
          u.uGrowT.value = age;
          u.uGrowIn.value.set(1, out);
          u.uGrowMul.value.set(0.6 + 0.4 * out, 1);
          u.uSway.value.set(0.04, (time * 1.3) % (Math.PI * 2));
        }
        for (const c of o.children) {
          if (c.name === "wisp") {
            const a = c.userData.phase + time * 0.6;
            c.position.set(Math.cos(a) * c.userData.rad, 0.6 + Math.sin(time * 2 + c.userData.phase) * 0.3, Math.sin(a) * c.userData.rad);
            (c as THREE.Sprite).material.opacity = 0.7 * Math.min(1, age * 2, left / 0.6);
          }
        }
        const dm = (o.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        dm.opacity = Math.min(1, age * 3, left / 0.6);
      }
      const spin = o.getObjectByName("spin");
      if (spin) {
        spin.rotation.y += dt * (z.style === "sinkhole" ? 1.6 : 0.2);
        spin.scale.setScalar(z.style === "sinkhole" ? 0.6 + 0.4 * (left % 1) : 1);
      }
      const life = Math.min(1, (time - (o.userData.born ?? time)) * 3, left / 0.6);
      for (const c of o.children) {
        const b = c.userData.base as THREE.Vector3 | undefined;
        const ph = c.userData.phase ?? 0;
        if (c.name === "drift" && b) { c.position.y = b.y + ((time * 0.4 + ph) % 1) * 0.6; (c as THREE.Sprite).material.opacity = 0.6 * life * (1 - ((time * 0.4 + ph) % 1)); }
        else if (c.name === "wisp" && b) { c.position.set(b.x + Math.sin(time + ph) * 0.4, b.y + Math.sin(time * 2 + ph) * 0.3, b.z + Math.cos(time + ph) * 0.4); (c as THREE.Sprite).material.opacity = 0.8 * life; }
        else if (c.name === "rise") { const k = Math.min(1, (time - (o.userData.born ?? time)) * 4 - ph * 0.05); c.scale.y = Math.max(0.01, c.scale.x * k * (left < 0.5 ? left / 0.5 : 1)); }
        else if (c.name === "glow") { (c as THREE.Sprite).material.opacity = life * (0.55 + 0.35 * Math.sin(time * 3 + ph)); }
        else if (c.name === "ember" && b) { const q = (time * 0.7 + ph) % 1; c.position.set(b.x, b.y + q * 1.6, b.z); (c as THREE.Sprite).material.opacity = life * (1 - q); }
        else if (c.name === "smoke" && b) { c.position.set(b.x + Math.sin(time * 0.5 + ph) * 0.3, b.y + Math.sin(time * 0.7 + ph) * 0.15, b.z); (c as THREE.Sprite).material.rotation = time * 0.2 + ph; (c as THREE.Sprite).material.opacity = 0.9 * life; }
        else if (c.name === "spark") (c as THREE.Sprite).material.opacity = Math.random() < 0.3 ? life : 0;
        else if (c.name === "zap") {
          const sp = c as THREE.Sprite;
          if (Math.random() < 0.4) {
            const a = Math.random() * Math.PI * 2;
            const d = z.radius * (0.3 + Math.random() * 0.5);
            sp.position.set(Math.cos(a) * d * 0.5, (c.userData.top as number) * 0.6, Math.sin(a) * d * 0.5);
            sp.scale.set(d * 1.1, 1.2, 1);
            sp.material.rotation = -a;
          }
          sp.material.opacity = life * (Math.random() < 0.6 ? 1 : 0.2);
        }
      }
      const gu = o.userData.growU as GrowU | undefined;
      if (gu && !o.userData.bramble) {
        const k = left < 0.6 ? left / 0.6 : 1;
        gu.uGrowT.value = time - (o.userData.born ?? time);
        gu.uGrowIn.value.set(k, k);
      }
      if (!o.userData.bramble) ((o.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = life;
      const arc = o.getObjectByName("arc") as THREE.Mesh | undefined;
      if (arc && Math.random() < 0.35) {
        const top = new THREE.Vector3(0, arc.userData.top as number, 0);
        const a = Math.random() * Math.PI * 2;
        const d = z.radius * (0.4 + Math.random() * 0.6);
        const end = new THREE.Vector3(Math.cos(a) * d, w.groundY(z.x + Math.cos(a) * d, z.z + Math.sin(a) * d) - this.cyOf(o) + 0.2, Math.sin(a) * d);
        const pts = [top];
        for (let k = 1; k < 5; k++) pts.push(top.clone().lerp(end, k / 5).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)));
        pts.push(end);
        arc.geometry.dispose();
        arc.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0), 10, 0.05, 3, false);
      }
    }
    for (const [id, o] of this.zones) if (!seenZ.has(id)) { this.root.remove(o); free(o); this.zones.delete(id); }
    for (const o of this.mods.values()) {
      if (!o.userData.wall) {
        o.scale.y = Math.min(1, o.scale.y + dt * 6);
        continue;
      }
      for (const c of o.userData.cells as THREE.Object3D[]) {
        const t = time - o.userData.born - c.userData.delay;
        const e = t <= 0 ? 0 : t >= 0.26 ? 1 : easeBack(t / 0.26);
        c.position.y = c.userData.baseY - 2.7 * (1 - e);
        c.visible = t > 0;
        c.rotation.z = t > 0 && t < 0.3 ? Math.sin(t * 90) * 0.03 : 0;
      }
      syncWall(o);
    }
  }
}
