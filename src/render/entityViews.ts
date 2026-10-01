import { teslaCoil } from "./hazardViews";
import { FX } from "./fxKit";
import { KITS } from "./kits";
import * as THREE from "three";
import { builderRate, padNear } from "../sim/structures";
import type { World } from "../sim/world";
import type { Entity } from "../sim/types";
import type { HeroModels } from "./heroModels";
import type { StructureModels } from "./structureModels";
import { structurePlaceholder, unitPlaceholder } from "./kit";
import { blobBatch, blobShadow, footRingBatch } from "./placeholders";
import type { CombatFx } from "./combatFx";
import type { UnitModels } from "./unitModels";
import { UnitBatches } from "./unitBatch";
import { MeshBatches } from "./meshBatch";
import { StructureBatch } from "./structureBatch";
import { SpriteBatches } from "./spriteBatch";
import { FxBatch, type FxInst } from "./fxInstances";
import { ballistaMesh, syncBallista } from "./ballista";
import { drawText, fontReady, textWidth } from "../ui/font";
import { padButton } from "../ui/hud";

interface Bar {
  group: THREE.Group;
  width: number;
  color: THREE.Color;
  fgColor: THREE.Color;
  frac: number;
  ghostFrac: number;
  holdUntil: number;
}

const BAR_MAX = 1536;
class BarBatch {
  readonly mesh: THREE.Mesh;
  private rect: THREE.InstancedBufferAttribute;
  private center: THREE.InstancedBufferAttribute;
  private col: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private n = 0;
  private v = new THREE.Vector3();

  constructor() {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute("position", base.getAttribute("position"));
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(BAR_MAX * 3), 3);
    this.rect = new THREE.InstancedBufferAttribute(new Float32Array(BAR_MAX * 3), 3);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(BAR_MAX * 4), 4);
    for (const a of [this.center, this.rect, this.col]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("iCenter", this.center);
    this.geo.setAttribute("iRect", this.rect);
    this.geo.setAttribute("iColor", this.col);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute vec3 iCenter;
attribute vec3 iRect;
attribute vec4 iColor;
varying vec4 vCol;
void main() {
  vCol = iColor;
  vec4 mv = modelViewMatrix * vec4(iCenter, 1.0);
  mv.x += iRect.x + (position.x + 0.5) * iRect.y;
  mv.y += position.y * iRect.z;
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `varying vec4 vCol;
void main() {
  gl_FragColor = vCol;
  #include <colorspace_fragment>
}`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.matrixAutoUpdate = false;
  }

  begin(): void {
    this.n = 0;
  }

  private quad(x: number, y: number, z: number, x0: number, w: number, h: number, c: THREE.Color, a: number): void {
    if (this.n >= BAR_MAX) return;
    const i = this.n++;
    this.center.array[i * 3] = x;
    this.center.array[i * 3 + 1] = y;
    this.center.array[i * 3 + 2] = z;
    this.rect.array[i * 3] = x0;
    this.rect.array[i * 3 + 1] = w;
    this.rect.array[i * 3 + 2] = h;
    this.col.array[i * 4] = c.r;
    this.col.array[i * 4 + 1] = c.g;
    this.col.array[i * 4 + 2] = c.b;
    this.col.array[i * 4 + 3] = a;
  }

  add(bar: Bar): void {
    const m = bar.group.matrixWorld.elements;
    const k = Math.hypot(m[0], m[1], m[2]);
    const x = m[12];
    const y = m[13];
    const z = m[14];
    const w = bar.width * k;
    this.quad(x, y, z, -(w + 0.08 * k) / 2, w + 0.08 * k, 0.2 * k, BAR_BG, 0.85);
    this.quad(x, y, z, -w / 2, Math.max(0.001, w * bar.ghostFrac), 0.13 * k, BAR_GHOST, 1);
    this.quad(x, y, z, -w / 2, Math.max(0.001, w * bar.frac), 0.13 * k, bar.fgColor, 1);
  }

  end(): void {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (const a of [this.center, this.rect, this.col]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}
const BAR_BG = new THREE.Color(0x101010);
const BAR_GHOST = new THREE.Color(0xfff0d0);

interface View {
  batched?: THREE.SkinnedMesh;
  blobs?: THREE.Mesh[];
  rings?: THREE.Mesh[];
  dome?: THREE.Mesh;
  gear?: THREE.Sprite;
  auraT?: number;
  kind: Entity["kind"];
  root: THREE.Group;
  body: THREE.Object3D;
  weapon?: THREE.Object3D;
  spin?: THREE.Object3D;
  level2?: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  current?: string;
  bar: Bar;
  ring?: THREE.Mesh;
  shield?: THREE.Mesh;
  work?: Bar;
  blockFx?: THREE.Mesh;
  lastAction?: object | null;
  seen: boolean;
  fallY?: number;
  fallV?: number;
  wasDead?: boolean;
  stealthed?: boolean;
  baseVisible?: boolean;
  mark?: THREE.Sprite;
  markKind?: string;
  lastAttack?: number;
  hitUntil?: number;
  deadAt?: number;
  mats: THREE.MeshLambertMaterial[];
  flash: number;
  joltX: number;
  joltZ: number;
  freeze: number;
  stepDist: number;
  trailT?: number;
  lastX?: number;
  lastZ?: number;
  rank?: number;
  badge?: THREE.Sprite;
  chargeAura?: THREE.Group;
  hands?: { hand: THREE.Object3D; arm: THREE.Object3D; last: THREE.Vector3 }[];
  framed?: boolean;
}

const red = new THREE.Color(1, 0.15, 0.1);

const ONE_SHOT = new Set(["attack_a", "attack_b", "attack_c", "slam", "cast", "shoot", "hit", "death", "dodge", "attack"]);

const KIND_ANIM: Record<string, string> = {
  slam: "slam", quake: "slam", leap: "slam", warcry: "cast", summon: "cast", hex: "cast", repair: "cast",
  turret: "cast", ramp: "cast", wall: "cast", zone: "cast", stealth: "cast", trap: "shoot", reach: "attack_b", shoot: "shoot",
  banner: "cast", rally: "cast", works: "cast", ballista: "cast",
  shove: "attack_a", throw: "attack_b", wrench: "attack_b", dash: "attack_b", flurry: "attack_b", parry: "block", none: "idle",
};

const white = new THREE.Color(1, 1, 1);

function hintTex(rows: [string, string, string][]): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 40 * rows.length + 8;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    c.save();
    c.scale(4, 4);
    rows.forEach(([btn, color, label], k) => {
      const y = 2 + k * 10;
      const lw = textWidth(label, 0.8) + 18;
      const x0 = (64 - lw) / 2;
      c.fillStyle = "rgba(10,8,6,0.72)";
      c.fillRect(x0 - 2, y, lw + 4, 9);
      padButton(c, x0 + 5, y + 4.5, 3.8, color, btn);
      drawText(c, label, x0 + 12, y + 1, "#ffffff", 0.8);
    });
    c.restore();
    t.needsUpdate = true;
  };
  draw();
  fontReady.then(draw);
  return t;
}
const HINTS = {
  build: new THREE.SpriteMaterial({ map: hintTex([["X", "#5a5a66", "OUTPOST"], ["Y", "#5a5a66", "TOWER"]]), depthTest: false, transparent: true }),
  upgrade: new THREE.SpriteMaterial({ map: hintTex([["X", "#5a5a66", "UPGRADE"]]), depthTest: false, transparent: true }),
  shop: new THREE.SpriteMaterial({ map: hintTex([["Y", "#5a5a66", "SHOP"]]), depthTest: false, transparent: true }),
};

const SHARED_VIEW_MATS = new Set<THREE.Material>(Object.values(HINTS));
export function disposeTree(root: THREE.Object3D, shared: Set<THREE.Material> = SHARED_VIEW_MATS): void {
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose();
    const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (geo && !geo.userData.model && !(o instanceof THREE.Sprite)) geo.dispose();
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (shared.has(mat) || mat.userData.keep) continue;
      const map = (mat as THREE.SpriteMaterial).map;
      if (map?.userData.owned) map.dispose();
      mat.dispose();
    }
  });
}

function markTex(draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const c = cv.getContext("2d")!;
  c.lineJoin = c.lineCap = "round";
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hexShieldTex = (() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  c.strokeStyle = "rgba(255,255,255,0.95)";
  c.lineWidth = 3;
  const r = 12;
  for (let row = -1; row < 7; row++) {
    for (let col = -1; col < 7; col++) {
      const cx = col * r * 1.75 + (row % 2 ? r * 0.87 : 0);
      const cy = row * r * 1.5;
      c.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      c.closePath();
      c.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const domeGeo = new THREE.IcosahedronGeometry(1, 1);
domeGeo.userData.model = true;
const gearMat = new THREE.SpriteMaterial({ depthTest: false, map: (() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const c = cv.getContext("2d")!;
  c.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const r = k % 2 ? 11 : 15;
    c.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
  }
  c.closePath();
  c.fillStyle = "#e8b840"; c.fill();
  c.strokeStyle = "#3a2408"; c.lineWidth = 2; c.stroke();
  c.beginPath(); c.arc(16, 16, 5, 0, Math.PI * 2); c.fillStyle = "#3a2408"; c.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})() });

const MARKS: Record<string, THREE.SpriteMaterial> = {
  bleed: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath(); c.moveTo(16, 3); c.quadraticCurveTo(27, 18, 16, 28); c.quadraticCurveTo(5, 18, 16, 3);
    c.fillStyle = "#c01818"; c.fill();
    c.strokeStyle = "#2a0404"; c.lineWidth = 2.5; c.stroke();
    c.fillStyle = "#ff8080"; c.fillRect(12, 16, 3, 5);
  }) }),
  mark: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath(); c.arc(16, 16, 11, 0, Math.PI * 2);
    c.strokeStyle = "#1a0404"; c.lineWidth = 5; c.stroke();
    c.strokeStyle = "#ff3a2a"; c.lineWidth = 2.5; c.stroke();
    c.beginPath(); c.moveTo(16, 1); c.lineTo(16, 9); c.moveTo(16, 23); c.lineTo(16, 31); c.moveTo(1, 16); c.lineTo(9, 16); c.moveTo(23, 16); c.lineTo(31, 16);
    c.strokeStyle = "#1a0404"; c.lineWidth = 4; c.stroke();
    c.strokeStyle = "#ffd0c0"; c.lineWidth = 2; c.stroke();
    c.beginPath(); c.arc(16, 16, 3, 0, Math.PI * 2); c.fillStyle = "#ff3a2a"; c.fill();
  }) }),
  armor: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath(); c.moveTo(16, 3); c.lineTo(28, 8); c.lineTo(26, 20); c.lineTo(16, 29); c.lineTo(6, 20); c.lineTo(4, 8); c.closePath();
    c.fillStyle = "#8a8478"; c.fill();
    c.strokeStyle = "#1a1408"; c.lineWidth = 2.5; c.stroke();
    c.beginPath(); c.moveTo(10, 11); c.lineTo(15, 17); c.lineTo(12, 22); c.moveTo(19, 9); c.lineTo(21, 15);
    c.strokeStyle = "#3a3428"; c.lineWidth = 1.5; c.stroke();
  }) }),
  stun: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    for (const [x, y, r] of [[8, 14, 6], [24, 12, 6], [16, 24, 5]]) {
      c.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.closePath();
      c.fillStyle = "#ffe040"; c.fill();
      c.strokeStyle = "#3a2408"; c.lineWidth = 2; c.stroke();
    }
  }) }),
  buff: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath(); c.arc(16, 16, 13, 0, Math.PI * 2);
    c.fillStyle = "#3a0806"; c.fill();
    c.strokeStyle = "#ff6a2a"; c.lineWidth = 2.5; c.stroke();
    c.beginPath(); c.moveTo(16, 5); c.lineTo(23, 14); c.lineTo(19, 14); c.lineTo(19, 26); c.lineTo(13, 26); c.lineTo(13, 14); c.lineTo(9, 14); c.closePath();
    c.fillStyle = "#ffb040"; c.fill();
    c.strokeStyle = "#3a0806"; c.lineWidth = 1.5; c.stroke();
  }) }),
  slow: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath(); c.arc(16, 16, 13, 0, Math.PI * 2);
    c.fillStyle = "#081a2a"; c.fill();
    c.strokeStyle = "#60c0ff"; c.lineWidth = 2.5; c.stroke();
    c.beginPath(); c.moveTo(16, 26); c.lineTo(23, 17); c.lineTo(19, 17); c.lineTo(19, 6); c.lineTo(13, 6); c.lineTo(13, 17); c.lineTo(9, 17); c.closePath();
    c.fillStyle = "#a8e0ff"; c.fill();
    c.strokeStyle = "#081a2a"; c.lineWidth = 1.5; c.stroke();
  }) }),
  guard: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath(); c.moveTo(16, 3); c.lineTo(28, 8); c.lineTo(26, 20); c.lineTo(16, 29); c.lineTo(6, 20); c.lineTo(4, 8); c.closePath();
    c.fillStyle = "#d8d0b8"; c.fill();
    c.strokeStyle = "#1a1408"; c.lineWidth = 2.5; c.stroke();
    c.beginPath(); c.moveTo(16, 7); c.lineTo(16, 25); c.moveTo(8, 12); c.lineTo(24, 12);
    c.strokeStyle = "#b02010"; c.lineWidth = 3; c.stroke();
  }) }),
  hex: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath(); c.arc(16, 16, 12, 0, Math.PI * 2);
    c.fillStyle = "#1a0822"; c.fill();
    c.strokeStyle = "#c060ff"; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.moveTo(16, 7); c.lineTo(16, 25); c.moveTo(9, 12); c.lineTo(23, 20); c.moveTo(23, 12); c.lineTo(9, 20);
    c.strokeStyle = "#e0a8ff"; c.lineWidth = 2.5; c.stroke();
  }) }),
  cowed: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath(); c.moveTo(6, 8); c.lineTo(26, 8); c.lineTo(16, 26); c.closePath();
    c.fillStyle = "#9a9aa2"; c.fill();
    c.strokeStyle = "#101014"; c.lineWidth = 3; c.stroke();
  }) }),
  opening: new THREE.SpriteMaterial({ depthTest: false, map: markTex((c) => {
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 ? 5 : 13;
      c.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = "#ffd040"; c.fill();
    c.strokeStyle = "#3a2008"; c.lineWidth = 2.5; c.stroke();
  }) }),
};
for (const m of [...Object.values(MARKS), gearMat]) SHARED_VIEW_MATS.add(m);

function rankTex(rank: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.lineJoin = "miter";
  const chevron = (y: number) => {
    ctx.beginPath();
    ctx.moveTo(6, y + 7);
    ctx.lineTo(16, y);
    ctx.lineTo(26, y + 7);
    ctx.lineTo(26, y + 12);
    ctx.lineTo(16, y + 5);
    ctx.lineTo(6, y + 12);
    ctx.closePath();
    ctx.fillStyle = "#1a1208";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1a1208";
    ctx.stroke();
    ctx.fillStyle = "#ffcc33";
    ctx.fill();
  };
  if (rank >= 3) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 14 : 6;
      ctx.lineTo(16 + Math.cos(a) * r, 17 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1a1208";
    ctx.stroke();
    ctx.fillStyle = "#ffcc33";
    ctx.fill();
  } else if (rank === 2) {
    chevron(6);
    chevron(15);
  } else {
    chevron(10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
const rankTexes = [1, 2, 3].map(rankTex);

function makeBar(width: number, color: THREE.Color, y: number): Bar {
  const group = new THREE.Group();
  group.position.y = y;
  return { group, width, color: color.clone(), fgColor: color.clone(), frac: 1, ghostFrac: 1, holdUntil: 0 };
}

function setBar(bar: Bar, frac: number, dt = 0, time = 0, pulse = false): void {
  const f = Math.max(0, Math.min(1, frac));
  if (f < bar.frac - 1e-4) bar.holdUntil = time + 0.35;
  if (f > bar.ghostFrac) bar.ghostFrac = f;
  bar.frac = f;
  if (time >= bar.holdUntil) bar.ghostFrac = Math.max(f, bar.ghostFrac - dt * 0.8);
  if (pulse && f < 0.3 && f > 0) bar.fgColor.copy(bar.color).lerp(red, 0.5 + 0.5 * Math.sin(time * 14));
  else bar.fgColor.copy(bar.color);
}

const silMats = new Map<string, THREE.MeshBasicMaterial>();
let silColors: THREE.Color[] = [];
function silMat(team: number, skinned: boolean): THREE.MeshBasicMaterial {
  const key = `${team}|${skinned}`;
  let m = silMats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: (silColors[team] ?? new THREE.Color(1, 1, 1)).clone().multiplyScalar(0.8),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp,
      stencilZFail: THREE.KeepStencilOp,
      stencilZPass: THREE.ReplaceStencilOp,
      fog: false,
    });
    silMats.set(key, m);
    SHARED_VIEW_MATS.add(m);
  }
  return m;
}

interface SilEntry { proxy: THREE.Mesh; src: THREE.Mesh }
export const silScene = new THREE.Scene();
silScene.matrixWorldAutoUpdate = false;
silScene.matrixAutoUpdate = false;
export const SIL_ORDER = 1000;
const silList: SilEntry[] = [];

export function syncSilhouettes(scene: THREE.Object3D): void {
  for (let i = silList.length - 1; i >= 0; i--) {
    const { proxy, src } = silList[i];
    let o: THREE.Object3D | null = src;
    let vis = true;
    while (o && o !== scene) {
      if (!o.visible) vis = false;
      o = o.parent;
    }
    if (!o) {
      silScene.remove(proxy);
      silList.splice(i, 1);
      continue;
    }
    proxy.visible = vis;
    if (!vis) continue;
    proxy.matrixWorld.copy(src.matrixWorld);
    if (proxy instanceof THREE.SkinnedMesh && src instanceof THREE.SkinnedMesh) proxy.bindMatrixInverse.copy(src.bindMatrixInverse);
  }
}

function batchable(body: THREE.Object3D): THREE.SkinnedMesh | null {
  const meshes: THREE.Mesh[] = [];
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o);
  });
  const m = meshes[0];
  if (meshes.length !== 1 || !(m instanceof THREE.SkinnedMesh) || Array.isArray(m.material) || m.material.name !== "merged") return null;
  return m;
}

function batchMaterial(src: THREE.SkinnedMesh, team: number): THREE.Material {
  const base = src.material as THREE.MeshLambertMaterial;
  const m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile;
  m.customProgramCacheKey = base.customProgramCacheKey;
  m.stencilWrite = true;
  m.stencilRef = 1;
  m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilZPass = THREE.ReplaceStencilOp;
  m.userData.team = team;
  return m;
}

export function markSilhouette(obj: THREE.Object3D, team: number): void {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.noSil && !o.userData.silProxy) meshes.push(o);
  });
  for (const o of meshes) {
    const skinned = o instanceof THREE.SkinnedMesh;
    const proxy = skinned ? new THREE.SkinnedMesh(o.geometry, silMat(team, true)) : new THREE.Mesh(o.geometry, silMat(team, false));
    if (proxy instanceof THREE.SkinnedMesh && o instanceof THREE.SkinnedMesh) proxy.bind(o.skeleton, o.bindMatrix);
    proxy.userData.silProxy = true;
    proxy.frustumCulled = o.frustumCulled;
    proxy.matrixAutoUpdate = false;
    proxy.renderOrder = SIL_ORDER;
    silScene.add(proxy);
    silList.push({ proxy, src: o });
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      m.stencilWrite = true;
      m.stencilRef = 1;
      m.stencilFunc = THREE.AlwaysStencilFunc;
      m.stencilZPass = THREE.ReplaceStencilOp;
    }
  }
}

export class EntityViews {
  readonly root = new THREE.Group();
  quiet = false;
  private views = new Map<number, View>();
  private rings = new Map<number, THREE.Mesh>();
  private padMarkers: FxInst[] = [];
  private padBatch = new FxBatch(new THREE.RingGeometry(1.7, 2.0, 24), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }), false, true);
  private padHints: THREE.Sprite[] = [];
  private shopHints: THREE.Sprite[] = [];
  humans: boolean[] = [];
  hints = true;
  menus: boolean[] = [];
  private corpses: { v: View; at: number }[] = [];

  constructor(
    private world: World,
    private teamColors: THREE.Color[],
    private heroes: HeroModels,
    private structures: StructureModels,
    private heroScale: number,
    private fx: CombatFx,
    private units: UnitModels,
    private playerColors: THREE.Color[] = [],
  ) {
    this.structBatch = new StructureBatch(structures, (t) => teamColors[t] ?? teamColors[0]);
    if (silColors !== teamColors) {
      silColors = teamColors;
      silMats.clear();
    }
    for (const p of world.pads) {
      const m = this.padBatch.spawn();
      m.color.set(0xffd060);
      m.opacity = 0;
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, world.groundY(p.x, p.z) + 0.3, p.z);
      this.padMarkers.push(m);
      const hint = new THREE.Sprite(HINTS.build);
      hint.renderOrder = 33;
      hint.visible = false;
      hint.position.set(p.x, world.groundY(p.x, p.z) + 4.4, p.z);
      this.root.add(hint);
      this.padHints.push(hint);
    }
    for (let team = 0; team < world.teamCount; team++) {
      const hint = new THREE.Sprite(HINTS.shop);
      hint.renderOrder = 33;
      hint.visible = false;
      this.root.add(hint);
      this.shopHints.push(hint);
    }
  }

  setViewer(team: number | null): void {
    for (const [id, v] of this.views) {
      if (v.kind !== "hero" || v.baseVisible === undefined) continue;
      const e = this.world.getAny(id);
      v.root.visible = v.baseVisible && (!v.stealthed || team === null || e?.team === team);
    }
  }

  dispose(): void {
    for (const v of this.views.values()) disposeTree(v.root);
    for (const c of this.corpses) disposeTree(c.v.root);
    for (const r of this.rings.values()) r.geometry.dispose();
    silScene.remove(this.batches.silRoot);
    this.batches.dispose();
    this.statics.dispose();
    this.structBatch.dispose();
    this.sprites.dispose();
    this.padBatch.mesh.geometry.dispose();
    (this.padBatch.mesh.material as THREE.Material).dispose();
    this.bars.mesh.geometry.dispose();
    this.blobs.dispose();
    this.footRings.dispose();
    (this.footRings.material as THREE.Material).dispose();
    this.views.clear();
    this.corpses = [];
  }

    private hidden: THREE.Object3D[] = [];
  private sphere = new THREE.Sphere();
  private bars = new BarBatch();
  private batches = new UnitBatches();
  private statics = new MeshBatches();
  private sprites = new SpriteBatches();
  private spriteSeen = new WeakSet<THREE.Sprite>();
  private spriteScan = 0;
  private structBatch: StructureBatch;
  private blobs = blobBatch(1024);
  private footRings = footRingBatch(16);
  readonly extras = new THREE.Group();

  fillUnits(): void {
    if (!this.batches.root.parent) {
      this.padBatch.mesh.renderOrder = 3;
      this.extras.add(this.batches.root, this.statics.root, this.structBatch.root, this.bars.mesh, this.blobs, this.sprites.root, this.padBatch.mesh, this.footRings);
      silScene.add(this.batches.silRoot);
    }
    this.batches.fill(this.extras.parent ?? this.root);
    this.structBatch.fillFrame(this.extras.parent ?? this.root);
    this.padBatch.flush();
    if (this.spriteScan++ % 10 === 0) {
      this.root.traverse((o) => {
        if (!(o instanceof THREE.Sprite) || this.spriteSeen.has(o)) return;
        this.spriteSeen.add(o);
        this.sprites.add(o);
      });
    }
  }

  private addBlobs(v: View, n: number): number {
    if (!v.blobs || !v.root.visible || !v.root.parent) return n;
    for (const m of v.blobs) {
      if (n >= 1024) return n;
      let o: THREE.Object3D | null = m;
      while (o && o !== v.root && (o.visible || o.userData.batchHidden)) o = o.parent;
      if (o !== v.root) continue;
      this.blobs.setMatrixAt(n++, m.matrixWorld);
    }
    return n;
  }

  fillView(camera: THREE.Camera): void {
    const b = this.bars;
    b.begin();
    if (!this.quiet) {
      for (const v of this.views.values()) {
        if (!v.root.visible || !v.root.parent) continue;
        if (v.bar.group.visible && v.bar.group.parent) b.add(v.bar);
        if (v.work && v.work.group.visible && v.work.group.parent) b.add(v.work);
      }
    }
    b.end();
    this.statics.fill(this.extras.parent ?? this.root);
    this.batches.view();
    this.structBatch.fillView();
    this.sprites.fill(camera);
    let n = 0;
    const bl = this.blobs;
    for (const v of this.views.values()) n = this.addBlobs(v, n);
    for (const c of this.corpses) n = this.addBlobs(c.v, n);
    let rn = 0;
    const fr = this.footRings;
    for (const v of this.views.values()) {
      if (!v.rings || !v.root.visible || !v.root.parent) continue;
      for (const m of v.rings) {
        if (rn >= 16) break;
        let o: THREE.Object3D | null = m;
        while (o && o !== v.root && (o.visible || o.userData.batchHidden)) o = o.parent;
        if (o !== v.root) continue;
        fr.setMatrixAt(rn, m.matrixWorld);
        fr.setColorAt(rn, (m.material as THREE.MeshBasicMaterial).color);
        rn++;
      }
    }
    fr.count = rn;
    fr.visible = rn > 0;
    fr.instanceMatrix.needsUpdate = true;
    fr.instanceColor!.needsUpdate = true;
    bl.count = n;
    bl.visible = n > 0;
    bl.instanceMatrix.clearUpdateRanges();
    bl.instanceMatrix.addUpdateRange(0, n * 16);
    bl.instanceMatrix.needsUpdate = true;
  }

  cullTo(frustum: THREE.Frustum): void {
    for (const o of this.root.children) {
      if (!o.visible) continue;
      this.sphere.center.copy(o.position);
      this.sphere.center.y += 1.2;
      this.sphere.radius = 3.5;
      if (frustum.intersectsSphere(this.sphere)) continue;
      o.visible = false;
      this.hidden.push(o);
    }
  }

  uncull(): void {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }

  heroPoint(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    return v && v.framed !== false && v.seen ? v.root.position.clone() : null;
  }

  heroPoints(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const v of this.views.values()) if (v.kind === "hero" && v.framed !== false && v.seen) out.push(v.root.position.clone());
    return out;
  }

  private createView(e: Entity): View {
    const team = this.teamColors[e.team];
    const root = new THREE.Group();
    let body: THREE.Object3D;
    let mixer: THREE.AnimationMixer | undefined;
    let actions = new Map<string, THREE.AnimationAction>();
    let bar: Bar;
    const view: Partial<View> = {};
    if (e.hero) {
      const player = e.hero.player;
      const pc = this.world.ffa ? team : this.playerColors[player] ?? team;
      const twin = this.world.players.some((q) => q.team === e.team && q.player < player && q.heroType === e.hero!.type);
      const inst = this.heroes.create(e.hero.type, team, `P${player + 1}`, pc, twin ? team.clone().lerp(pc, 0.7) : undefined);
      inst.root.scale.setScalar(this.heroScale);
      root.add(inst.root);
      body = inst.body;
      mixer = inst.mixer;
      actions = inst.actions;
      bar = makeBar(1.3, team, 0.1);
      bar.group.position.z = 0.95 * this.heroScale;
      const tag = inst.root.children.find((o) => o instanceof THREE.Sprite);
      if (tag) {
        inst.root.remove(tag);
        tag.position.set(0, 0.1, 1.33 * this.heroScale);
        tag.scale.multiplyScalar(this.heroScale * 0.85);
        root.add(tag);
      }
      markSilhouette(body, e.team);
      const bf = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.75, 6),
        new THREE.MeshBasicMaterial({ color: team.clone().lerp(white, 0.6), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      bf.position.set(0, 1.0, 0.75);
      bf.visible = false;
      body.add(bf);
      view.blockFx = bf;
    } else if (e.unit) {
      const inst = this.units.create(e.neutral ? "ogre" : e.unit.type, team, e.team);
      let g: THREE.Object3D;
      if (inst) {
        g = new THREE.Group();
        g.add(inst.body);
        body = inst.body;
        mixer = inst.mixer;
        actions = inst.actions;
      } else {
        g = unitPlaceholder(e.unit.type, team);
        body = g.getObjectByName("body")!;
        view.weapon = g.getObjectByName("weapon");
      }
      root.add(g, blobShadow(e.radius * 1.2));
      g.scale.setScalar((inst ? 1.3 : e.unit.type === "heavy" ? 1.45 : 1.4) * (e.neutral ? 1.55 : 1));
      const skin = inst ? batchable(inst.body) : null;
      if (skin) view.batched = skin;
      else markSilhouette(g, e.team);
      bar = e.neutral ? makeBar(2, team, 4.4) : makeBar(e.unit.type === "heavy" ? 1.1 : 0.8, team, e.unit.type === "heavy" ? 2.3 : 1.7);
      bar.group.visible = !!e.neutral;
    } else {
      const st = e.structure!;
      if (st.type === "core") {
        body = this.structures.create("core", team);
        const sh = new THREE.Mesh(
          new THREE.SphereGeometry(3.0, 16, 10),
          new THREE.MeshBasicMaterial({ color: team.clone().lerp(white, 0.4), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        sh.position.y = 1.4;
        root.add(sh);
        view.shield = sh;
        view.spin = body.getObjectByName("crystal") ?? undefined;
        bar = makeBar(3, team, 5.2);
        view.work = makeBar(3, new THREE.Color(0x9fe0ff), 5.5);
        root.add(view.work.group);
      } else {
        body = st.tesla ? teslaCoil(1.1) : st.siege ? ballistaMesh(team) : this.structures.has(st.type) ? this.structures.create(st.type, team) : structurePlaceholder(st.type, team);
        body.traverse((o) => {
          if (!view.spin && o.name.startsWith("spin")) view.spin = o;
          if (!view.level2 && o.name.startsWith("level2")) view.level2 = o;
        });
        body.rotation.y = e.transform.facing;
        bar = st.siege ? makeBar(1.2, team, 2.4) : makeBar(2.2, team, 5.0);
        if (!st.siege) {
          view.work = makeBar(2.2, new THREE.Color(0xffd040), 5.3);
          root.add(view.work.group);
        }
        this.fx.buildFx(e.transform.pos.x, e.transform.y, e.transform.pos.z, e.team);
      }
      root.add(body);
    }
    root.add(bar.group);
    this.root.add(root);
    const mats: THREE.MeshLambertMaterial[] = [];
    body.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.outline) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m instanceof THREE.MeshLambertMaterial && !mats.includes(m)) {
          m.userData.baseEmissive ??= m.emissive.clone();
          mats.push(m);
        }
      }
    });
    const v: View = {
      kind: e.kind, root, body, mixer, actions, bar, seen: true,
      weapon: view.weapon, spin: view.spin, level2: view.level2, shield: view.shield, blockFx: view.blockFx, work: view.work,
      mats, flash: 0, joltX: 0, joltZ: 0, freeze: 0, stepDist: 0,
    };
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.footRing && !o.userData.batchHidden) {
        o.visible = false;
        o.userData.batchHidden = true;
        (v.rings ??= []).push(o);
        return;
      }
      if (!(o instanceof THREE.Mesh) || !o.userData.blob) return;
      o.layers.set(31);
      o.visible = false;
      o.userData.batchHidden = true;
      (v.blobs ??= []).push(o);
    });
    if (e.structure) {
      const flash = () => v.flash > 0;
      const done = [...this.structBatch.add(body, e.team, flash), ...this.statics.addTree(body, `${e.team}`, flash, (m) => !m.userData.structKind && !(m.material as THREE.Material).transparent)];
      const used = new Set(done.map((m) => m.material));
      v.mats = v.mats.filter((m) => !used.has(m));
      let meshes = 0;
      body.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) meshes++;
      });
      if (meshes === done.length) {
        body.visible = false;
        body.userData.batchHidden = true;
      }
    }
    if (view.batched) {
      const sm = view.batched;
      const tm = e.team;
      this.batches.add(sm, v.body, `${sm.geometry.uuid}|${tm}`, () => ({ material: batchMaterial(sm, tm), sil: silMat(tm, true).clone() }), () => v.flash > 0);
    }
    if (e.unit) this.fx.spawnFx(e.transform.pos.x, e.transform.y, e.transform.pos.z, e.team);
    return v;
  }

  private play(v: View, name: string, timeScale = 1, restart = false): boolean {
    const next = v.actions.get(name) ?? (name.startsWith("attack_") ? v.actions.get("attack_a") : undefined);
    if (!next) return false;
    next.timeScale = timeScale;
    if (v.current === name && !restart) return true;
    const prev = v.current ? v.actions.get(v.current) : undefined;
    const once = ONE_SHOT.has(name);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, name === "hit" ? 0.04 : 0.1, false);
    v.current = name;
    return true;
  }

  private clipLen(v: View, name: string): number {
    return v.actions.get(name)?.getClip().duration ?? 0.5;
  }

  onRankUp(id: number): void {
    const v = this.views.get(id);
    if (v) v.flash = 0.3;
  }

  onImpact(id: number, src: number | undefined, fx: number | undefined, fz: number | undefined, big: boolean): void {
    const v = this.views.get(id);
    if (!v) return;
    v.flash = big ? 0.14 : 0.09;
    if (v.kind === "structure") return;
    const e = this.world.get(id);
    if (e && fx !== undefined && fz !== undefined) {
      const dx = e.transform.pos.x - fx;
      const dz = e.transform.pos.z - fz;
      const d = Math.hypot(dx, dz) || 1;
      const k = (big ? 0.45 : 0.22) * (v.kind === "hero" ? 1 : 0.8);
      v.joltX = (dx / d) * k;
      v.joltZ = (dz / d) * k;
    }
    const heroHit = v.kind === "hero" || (src !== undefined && this.views.get(src)?.kind === "hero");
    if (heroHit) {
      const stop = big ? 0.13 : 0.06;
      v.freeze = Math.max(v.freeze, stop);
      const sv = src !== undefined ? this.views.get(src) : undefined;
      if (sv) sv.freeze = Math.max(sv.freeze, stop);
    }
  }

  onHit(id: number): void {
    const v = this.views.get(id);
    if (!v?.mixer || v.kind !== "unit") return;
    if (v.current === "attack" || v.current === "death") return;
    this.play(v, "hit", 1.6, true);
    v.hitUntil = performance.now() / 1000 + 0.25;
  }

  private footsteps(e: Entity, v: View): void {
    const x = e.transform.pos.x;
    const z = e.transform.pos.z;
    if (v.lastX !== undefined && v.lastZ !== undefined) {
      const d = Math.hypot(x - v.lastX, z - v.lastZ);
      if (d < 2) v.stepDist += d;
    }
    v.lastX = x;
    v.lastZ = z;
    const hero = !!e.hero;
    const stride = hero ? 1.5 : e.unit?.type === "heavy" ? 1.3 : 1.0;
    if (v.stepDist < stride) return;
    v.stepDist = 0;
    if (!hero && Math.random() < 0.5) return;
    const big = hero ? this.heroScale * (e.radius > 0.8 ? 0.9 : 0.6) : e.unit?.type === "heavy" ? 0.7 : 0.45;
    const water = this.world.groundY(x, z) < e.transform.y - 0.5;
    if (water) return;
    this.fx.dust(x, e.transform.y, z, big, hero ? 2 : 1, 0.7);
  }

  private applyImpact(v: View, dt: number, frozen: boolean): void {
    if (v.joltX || v.joltZ) {
      const shake = frozen ? (Math.random() - 0.5) * 0.08 : 0;
      v.root.position.x += v.joltX + shake;
      v.root.position.z += v.joltZ;
      const decay = Math.exp(-dt * 18);
      v.joltX *= decay;
      v.joltZ *= decay;
      if (Math.abs(v.joltX) + Math.abs(v.joltZ) < 0.005) v.joltX = v.joltZ = 0;
    }
    if (v.flash > 0 || v.mats[0]?.userData.flashing) {
      v.flash = Math.max(0, v.flash - dt);
      const k = v.flash > 0 ? 1 : 0;
      for (const m of v.mats) {
        const base = m.userData.baseEmissive as THREE.Color;
        if (k) m.emissive.setRGB(0.6, 0.58, 0.52);
        else m.emissive.copy(base);
        m.userData.flashing = k > 0;
      }
    }
  }

  private rangeRing(e: Entity): THREE.Mesh {
    const st = e.structure!;
    const r = st.range;
    const n = 72;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const cx = e.transform.pos.x;
    const cz = e.transform.pos.z;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (let k = 0; k < 2; k++) {
        const rr = k ? r : r - 0.18;
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr;
        const j = (i * 2 + k) * 3;
        pos[j] = x;
        pos[j + 1] = this.world.groundY(x, z) + 0.12;
        pos[j + 2] = z;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (st.type === "support" && i % 3 === 2) continue;
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const color = this.teamColors[e.team].clone().lerp(white, st.type === "damage" ? 0.1 : st.type === "control" ? 0.35 : 0.6);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    m.renderOrder = 4;
    return m;
  }

  sync(alpha: number, dt: number, time: number): void {
    const w = this.world;
    for (const v of this.views.values()) v.seen = false;
    for (const e of w.entities) {
      if (!e.alive && !e.hero) continue;
      let v = this.views.get(e.id);
      if (!v) {
        v = this.createView(e);
        this.views.set(e.id, v);
      }
      v.seen = true;
      const t = e.transform;
      v.root.position.set(
        t.prevPos.x + (t.pos.x - t.prevPos.x) * alpha,
        t.prevY + (t.y - t.prevY) * alpha,
        t.prevPos.z + (t.pos.z - t.prevPos.z) * alpha,
      );
      if (e.hero) {
        const gy = v.root.position.y;
        if (v.fallY !== undefined && gy < v.fallY - 0.4) {
          v.fallV = (v.fallV ?? 0) + 30 * dt;
          v.fallY = Math.max(gy, v.fallY - v.fallV * dt);
          v.root.position.y = v.fallY;
        } else {
          v.fallY = gy;
          v.fallV = 0;
        }
      }
      let d = t.facing - t.prevFacing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const facing = t.prevFacing + d * alpha;
      setBar(v.bar, e.hp / e.maxHp, dt, time, !!e.hero);

      const frozen = v.freeze > 0;
      const adt = frozen ? 0 : dt;
      v.freeze = Math.max(0, v.freeze - dt);
      if (e.hero) {
        this.syncHero(e, v, facing, adt, time);
        v.baseVisible = v.root.visible;
      }
      else if (e.unit) this.syncUnit(e, v, facing, time, adt);
      else this.syncStructure(e, v, time);
      if (this.quiet) {
        v.bar.group.visible = false;
        if (v.work) v.work.group.visible = false;
        for (const c of v.root.children) if (c instanceof THREE.Sprite) c.visible = false;
      }
      if (e.kind !== "structure" && e.alive) this.footsteps(e, v);
      if (e.kind !== "structure") this.syncMark(e, v, time);
      this.syncTalentFx(e, v, time, dt);
      this.applyImpact(v, dt, frozen);
    }
    const nowS = performance.now() / 1000;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.v.mixer?.update(dt);
      const k = (nowS - c.at) / 1.6;
      if (k > 0.6) c.v.root.position.y -= dt * 0.8;
      if (k >= 1) {
        this.root.remove(c.v.root);
        disposeTree(c.v.root);
        this.corpses.splice(i, 1);
      }
    }
    for (const [id, v] of this.views) {
      if (v.seen) continue;
      if (v.kind === "unit" && v.mixer && v.actions.has("death")) {
        this.play(v, "death", 1.2, true);
        v.bar.group.visible = false;
        this.corpses.push({ v, at: nowS });
      } else {
        this.root.remove(v.root);
        disposeTree(v.root);
      }
      this.views.delete(id);
      const ring = this.rings.get(id);
      if (ring) {
        this.root.remove(ring);
        ring.geometry.dispose();
        this.rings.delete(id);
      }
    }
    this.syncPads(time);
  }

  private syncTalentFx(e: Entity, v: View, time: number, dt: number): void {
    const w = this.world;
    const s = e.status;
    const shielded = e.alive && s.shield > 0 && w.time < s.shieldUntil;
    if (shielded && !v.dome) {
      const col = this.teamColors[e.team] ?? new THREE.Color(1, 1, 1);
      v.dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({
        map: hexShieldTex, color: col.clone().lerp(new THREE.Color(1, 0.95, 0.7), 0.55), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      v.dome.userData.noSil = true;
      v.root.add(v.dome);
    }
    if (v.dome) {
      v.dome.visible = shielded;
      if (shielded) {
        const r = e.structure ? e.radius * 1.9 : e.hero ? 1.25 * this.heroScale : e.radius * 2.2;
        v.dome.scale.setScalar(r * (1 + Math.sin(time * 5) * 0.03));
        v.dome.position.y = e.structure ? r * 0.9 : r * 0.75;
        v.dome.rotation.y = time * 0.6;
        (v.dome.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.min(0.35, s.shield / 400);
      }
    }
    const st = e.structure;
    const haste = !!st && !!st.hasteUntil && w.time < st.hasteUntil;
    if (haste && !v.gear) {
      v.gear = new THREE.Sprite(gearMat);
      v.gear.renderOrder = 32;
      v.gear.scale.setScalar(1.2);
      v.root.add(v.gear);
    }
    if (v.gear) {
      v.gear.visible = haste;
      v.gear.position.y = 6.2;
      v.gear.material.rotation = time * 4;
    }
    if (!e.alive) return;
    v.auraT = (v.auraT ?? 0) - dt;
    if (v.auraT > 0) return;
    v.auraT = 0.12;
    const p = v.root.position;
    const h = e.hero;
    if (h && h.frenzy > 0 && w.time < h.frenzyUntil) for (let k = 0; k < h.frenzy; k++) this.fx.aura("flame", p.x, p.y, p.z);
    if (h && w.time < h.empowerUntil) this.fx.aura("spark", p.x, p.y, p.z);
    if (w.time < s.bleedUntil && s.bleedStacks > 0 && Math.random() < 0.3 * s.bleedStacks) this.fx.aura("drip", p.x, p.y, p.z);
    if (haste) this.fx.aura("steam", p.x + (Math.random() - 0.5), p.y + 4.5, p.z + (Math.random() - 0.5));
  }

  private syncMark(e: Entity, v: View, time: number): void {
    const t = this.world.time;
    const s = e.status;
    const kind = !e.alive ? "" : t < s.stunUntil ? "stun" : t < s.markUntil ? "mark" : e.hero && t < e.hero.openingUntil ? "opening" : t < s.hexUntil ? "hex"
      : t < s.bleedUntil && s.bleedStacks > 0 ? "bleed" : t < s.armorUntil && s.armorMul < 1 ? "armor" : t < s.slowUntil && s.slowMul < 0.95 ? "slow" : (t < s.buffUntil && s.buffDamageMul > 1) || t < s.rallyUntil ? "buff" : t < s.guardUntil && s.guardMul < 1 ? "guard" : t < s.cowedUntil ? "cowed" : "";
    if (kind !== v.markKind) {
      v.markKind = kind;
      if (v.mark) { v.root.remove(v.mark); v.mark = undefined; }
      if (kind) {
        v.mark = new THREE.Sprite(MARKS[kind]);
        v.mark.renderOrder = 32;
        v.root.add(v.mark);
      }
    }
    if (v.mark) {
      const s = (e.hero ? 0.75 : 0.55) * (1 + Math.sin(time * 6) * 0.08);
      v.mark.scale.set(s, s, 1);
      const high = !!e.hero && (this.world.arena.carrying(e) || e.hero.bomb);
      v.mark.position.y = e.hero ? (high ? 3.2 : 2.45) * this.heroScale : v.bar.group.position.y + 0.4;
      if (v.markKind === "stun") v.mark.material.rotation = time * 5;
    }
  }

  private syncHero(e: Entity, v: View, facing: number, dt: number, time: number): void {
    const h = e.hero!;
    const w = this.world;
    if (h.recallAt !== undefined && !h.dead) {
      if (!v.work) {
        v.work = makeBar(1.6 * this.heroScale, new THREE.Color(0x9fe0ff), 3.2 * this.heroScale);
        v.root.add(v.work.group);
      }
      v.work.group.visible = true;
      const total = w.data.heroes.baseline.recallSeconds;
      setBar(v.work, 1 - (h.recallAt - w.time) / total);
    } else if (v.work) v.work.group.visible = false;
    if (h.dead) {
      if (!v.wasDead) {
        v.wasDead = true;
        v.deadAt = w.time;
        if (!this.play(v, "death", 1, true)) v.root.visible = false;
      }
      if (w.time - (v.deadAt ?? 0) > 2.5) {
        v.root.visible = false;
        v.framed = false;
      }
      v.mixer?.update(dt);
      return;
    }
    v.framed = true;
    if (v.wasDead) {
      v.wasDead = false;
      v.root.visible = true;
      this.play(v, "idle", 1, true);
      this.fx.spawnFx(e.transform.pos.x, e.transform.y, e.transform.pos.z, e.team);
    }
    v.root.visible = w.time >= e.status.invulnUntil || h.action?.name === "dodge" || h.action?.name === "z" || Math.floor(time * 12) % 2 === 0;
    v.body.rotation.y = facing;
    const a = h.action;
    if (a && a !== v.lastAction) {
      let anim = "idle";
      if (a.kind === "combo") {
        anim = ["attack_a", "attack_b", "attack_c"][a.combo % 3];
        const hit = (w.heroDef(h.type).abilities.a as { hits?: { range?: number; projectile?: unknown }[] }).hits?.[a.combo % 3];
        if (hit && !hit.projectile) this.fx.dust(e.transform.pos.x, e.transform.y, e.transform.pos.z, this.heroScale * 0.5, a.combo % 3 === 1 ? 4 : 2, 1.6);
        if (hit && !hit.projectile && !KITS[h.type]?.trail) {
          const p = v.root.position;
          this.fx.slash(p.x, p.y, p.z, facing, e.team, a.combo % 3, Math.min(3.2, (hit.range ?? 2) * 0.95), a.hitAt * 0.7);
        }
      }
      else if (a.name === "dodge") {
        anim = "dodge";
        this.fx.dust(e.transform.pos.x, e.transform.y, e.transform.pos.z, this.heroScale * 0.8, 5, 2.2);
      }
      else if (a.name === "hit") anim = "hit";
      else anim = KIND_ANIM[a.kind] ?? "cast";
      const len = this.clipLen(v, anim);
      const scale = anim === "block" || anim === "idle" ? 1 : len / Math.max(0.15, Math.min(a.dur, 1.2));
      this.play(v, anim, scale, true);
    }
    v.lastAction = a;
    if (a && (a.name === "dodge" || a.kind === "dash" || a.kind === "leap" || a.kind === "flurry" || a.kind === "blink" || a.kind === "charge")) {
      v.trailT = (v.trailT ?? 0) - dt;
      if (v.trailT <= 0) {
        v.trailT = 0.035;
        const p = v.root.position;
        this.fx.trail(p.x, p.y + 1.1 * this.heroScale + v.body.position.y, p.z, e.team, 1.2 * this.heroScale);
      }
    }
    if (!a) {
      const speed = Math.hypot(h.vel.x, h.vel.z);
      if (h.blocking) this.play(v, "block");
      else if (speed > 0.8) this.play(v, "run", Math.max(0.6, speed / h.speed) * 1.2);
      else this.play(v, "idle");
    }
    v.body.rotation.x = 0;
    let lift = 0;
    if (a?.kind === "quake" && a.t < a.hitAt) lift = Math.sin((a.t / a.hitAt) * Math.PI) * 1.8;
    if (a?.kind === "leap" && a.t < a.hitAt) lift = Math.sin((a.t / a.hitAt) * Math.PI) * 2.6;
    v.body.position.y = lift;
    const stealth = w.time < e.status.stealthUntil;
    if (stealth !== v.stealthed) {
      v.stealthed = stealth;
      v.body.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.silProxy) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          m.transparent = stealth;
          m.opacity = stealth ? 0.3 : 1;
          m.needsUpdate = true;
        }
      });
    }
    if (v.blockFx) v.blockFx.visible = h.blocking;
    if (h.charging && !v.chargeAura) {
      const col = new THREE.Color(KITS[h.type]?.trail ?? this.teamColors[e.team].getHex());
      const g = new THREE.Group();
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.burst, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.position.y = 1.4;
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: FX.shock, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.15;
      g.add(glow, ring);
      v.root.add(g);
      v.chargeAura = g;
    }
    if (v.chargeAura) {
      v.chargeAura.visible = !!h.charging;
      if (h.charging) {
        const k = Math.min(1, (h.chargeT ?? 0) / 0.8);
        const [glow, ring] = v.chargeAura.children as [THREE.Sprite, THREE.Mesh];
        const full = k >= 1;
        glow.scale.setScalar((1.4 + k * 2.2) * (full ? 1 + Math.sin(time * 30) * 0.15 : 1));
        glow.material.opacity = 0.35 + k * 0.5;
        glow.material.rotation = time * 4;
        const ph = (time * 2.5) % 1;
        ring.scale.setScalar(2.4 - ph * 1.8);
        (ring.material as THREE.MeshBasicMaterial).opacity = (0.4 + k * 0.6) * ph;
        this.fx.chargeSparks(v.root.position.x, v.root.position.y, v.root.position.z, k, glow.material.color.getHex(), full);
        v.body.position.y -= 0.12 * k;
      }
    }
    if (e.status.stealUntil && w.time < e.status.stealUntil && !v.stealthed && Math.random() < dt * 8) this.fx.bloodMote(v.root.position.x, v.root.position.y, v.root.position.z);
    if (e.hp < e.maxHp && !v.stealthed && w.calm(e) && Math.random() < dt * 5) {
      const turf = w.turf(e);
      if (turf === "home" || turf === "tower") this.fx.regen(v.root.position.x, v.root.position.y, v.root.position.z);
    }
    if (w.time < e.status.stunUntil) v.body.rotation.z = Math.sin(time * 20) * 0.08;
    else v.body.rotation.z = 0;
    v.mixer?.update(dt);
    if (a && a.kind === "combo" && a.t > a.hitAt * 0.45 && a.t < a.hitAt + 0.07) this.swingTrail(e, v);
  }

  private swingTrail(e: Entity, v: View): void {
    if (!v.hands) {
      v.hands = [];
      for (const side of ["R", "L"]) {
        const hand = v.body.getObjectByName(`hand_${side}`);
        const arm = v.body.getObjectByName(`forearm_${side}`);
        if (hand && arm) v.hands.push({ hand, arm, last: new THREE.Vector3() });
      }
    }
    if (!v.hands.length) return;
    v.root.updateMatrixWorld(true);
    let best = v.hands[0];
    let moved = -1;
    const tmp = new THREE.Vector3();
    for (const hd of v.hands) {
      hd.hand.getWorldPosition(tmp);
      const d = tmp.distanceToSquared(hd.last);
      if (d > moved) { moved = d; best = hd; }
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const hd of v.hands) {
      hd.hand.getWorldPosition(tmp);
      hd.last.copy(tmp);
    }
    best.hand.getWorldPosition(a);
    best.arm.getWorldPosition(b);
    a.addScaledVector(tmp.subVectors(a, b), 0.35);
    const kit = e.hero ? KITS[e.hero.type] : undefined;
    if (kit?.trailWidth) a.addScaledVector(tmp.subVectors(a, b), kit.trailWidth);
    const c = kit?.trail !== undefined ? new THREE.Color(kit.trail) : this.teamColors[e.team].clone().lerp(new THREE.Color(1, 1, 1), 0.6);
    this.fx.handTrail(`h${e.id}`, a, b, c);
  }

  private syncUnit(e: Entity, v: View, facing: number, time: number, dt: number): void {
    const u = e.unit!;
    const w = this.world;
    v.root.rotation.y = facing;
    v.bar.group.visible = e.hp < e.maxHp;
    if (u.rank !== (v.rank ?? 0)) {
      v.rank = u.rank;
      if (v.badge) {
        v.root.remove(v.badge);
        v.badge.material.dispose();
        v.badge = undefined;
      }
      if (u.rank > 0) {
        v.badge = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, map: rankTexes[Math.min(3, u.rank) - 1] }));
        v.badge.renderOrder = 23;
        v.badge.scale.set(0.6, 0.6, 1);
        v.badge.position.y = v.bar.group.position.y + 0.32;
        v.root.add(v.badge);
      }
    }
    if (v.mixer) {
      if (u.attackAnimAt !== v.lastAttack && w.time - u.attackAnimAt < 0.3) {
        v.lastAttack = u.attackAnimAt;
        const clip = v.actions.get("attack")?.getClip();
        this.play(v, "attack", clip ? clip.duration / Math.min(0.6, u.cooldown * 0.8) : 1, true);
      } else if ((v.hitUntil ?? 0) <= performance.now() / 1000 && (v.current !== "attack" || w.time - u.attackAnimAt > Math.min(0.6, u.cooldown * 0.8))) {
        if (u.moving) this.play(v, "walk", (u.speed * w.speedMul(e)) / 3.2);
        else this.play(v, "idle");
      }
      v.body.rotation.x = w.time < e.status.stunUntil ? 0.25 : 0;
      v.root.scale.setScalar(w.time < e.status.buffUntil || w.time < e.status.rallyUntil ? 1.08 : 1);
      v.mixer.update(dt);
      return;
    }
    const phase = time * (u.type === "heavy" ? 7 : 11) + e.id;
    v.body.position.y = u.moving ? Math.abs(Math.sin(phase)) * 0.09 : 0;
    v.body.rotation.z = u.moving ? Math.sin(phase) * 0.07 : 0;
    if (v.weapon) {
      const k = (w.time - u.attackAnimAt) / 0.3;
      v.weapon.rotation.x = k >= 0 && k < 1 ? -Math.sin(k * Math.PI) * (u.type === "ranged" ? 0.4 : 1.7) : 0;
    }
    v.body.rotation.x = w.time < e.status.stunUntil ? 0.25 : 0;
    const buff = w.time < e.status.buffUntil || w.time < e.status.rallyUntil;
    v.root.scale.setScalar(buff ? 1.08 : 1);
  }

  private syncStructure(e: Entity, v: View, time: number): void {
    const st = e.structure!;
    const w = this.world;
    if (st.type === "core") {
      if (v.shield) {
        v.shield.visible = st.shielded && !w.isSudden();
        v.shield.scale.setScalar(1 + Math.sin(time * 2) * 0.02);
      }
      if (v.spin) {
        v.spin.rotation.y = time * 0.8 + e.team;
      }
      v.bar.group.visible = true;
      if (v.work) {
        const ward = (st.ward ?? 0) / w.data.structures.core.ward;
        v.work.group.visible = ward > 0 && !w.isSudden();
        setBar(v.work, ward, 1 / 60, time);
      }
      return;
    }
    v.bar.group.visible = e.hp < e.maxHp || !st.ready;
    if (v.work) {
      const building = !st.ready || !!st.upgrading;
      v.work.group.visible = building;
      if (building) {
        setBar(v.work, st.progress ?? 0, 1 / 60, time);
        const idle = !st.ready && builderRate(w, e) <= 0;
        v.work.fgColor.set(idle && Math.floor(time * 3) % 2 === 0 ? 0x806020 : 0xffd040);
      }
    }
    if (st.siege) {
      const age = w.time - st.builtAt;
      v.body.scale.set(1, Math.min(1, 0.2 + age * 2), 1);
      syncBallista(v.body, e.transform.facing, w.time - st.lastFireAt, time, 1 / 60);
      return;
    }
    const k = st.ready ? 1 : Math.min(1, st.progress ?? 0);
    v.body.scale.set(1, 0.25 + 0.75 * k, 1);
    if (v.level2) v.level2.visible = st.level > 1;
    const fired = w.time - st.lastFireAt;
    if (v.spin) {
      if (st.type === "damage") {
        v.spin.rotation.y = time * 1.5;
        v.spin.userData.baseY ??= v.spin.position.y;
        v.spin.position.y = v.spin.userData.baseY + Math.sin(time * 2.2) * 0.12;
        v.spin.scale.setScalar(fired < 0.2 ? 1.5 : 1);
      } else if (st.type === "control") v.spin.rotation.y = time * (fired < 0.4 ? 8 : 1.2);
      else if (st.type === "support") {
        v.spin.userData.baseY ??= v.spin.position.y;
        v.spin.position.y = v.spin.userData.baseY + Math.sin(time * 2) * 0.15;
        v.spin.rotation.y = time;
      } else if (st.type === "foundry") v.spin.rotation.z = time * 3;
      else if (st.type === "range") v.spin.rotation.y = Math.sin(time * 2) * 0.3;
      else if (st.type === "barracks") v.spin.rotation.y = Math.sin(time * 2) * 0.3;
    }
    if (st.ready && (st.type === "damage" || st.type === "control" || st.type === "support")) {
      const key = e.id;
      const ring = this.rings.get(key);
      const want = Math.round(st.range * 100);
      if (!ring || ring.userData.r !== want) {
        if (ring) {
          this.root.remove(ring);
          ring.geometry.dispose();
        }
        const r = this.rangeRing(e);
        r.userData.r = want;
        this.rings.set(key, r);
        this.root.add(r);
      }
    }
  }

  private syncPads(time: number): void {
    const w = this.world;
    const heroes = w.entities.filter((e) => e.hero && e.alive);
    w.pads.forEach((p, i) => {
      const mat = this.padMarkers[i];
      let near: Entity | undefined;
      for (const h of heroes) {
        if (Math.hypot(h.transform.pos.x - p.x, h.transform.pos.z - p.z) <= w.data.structures.padRadius) near = h;
      }
      const st = p.structureId ? w.get(p.structureId) : undefined;
      const buildable = near && (!st ? p.zone === "neutral" || p.side === near.team : st.team === near.team && st.structure!.level < 2);
      if (buildable && near) {
        mat.color.copy(this.teamColors[near.team]).lerp(white, 0.4);
        mat.opacity = 0.55 + Math.sin(time * 8) * 0.3;
      } else if (!st && (p.zone === "neutral")) {
        mat.color.set(0xffd060);
        mat.opacity = 0.25;
      } else if (!st) {
        mat.color.copy(this.teamColors[p.side] ?? white);
        mat.opacity = 0.35;
      } else {
        mat.opacity = 0;
      }
      if (mat.opacity <= 0.01) mat.opacity = 0;
      const hint = this.padHints[i];
      const human = !!near && !!this.humans[near.hero!.player];
      hint.visible = this.hints && !!buildable && human && !this.menus[near!.hero!.player];
      if (hint.visible) {
        const up = !!st;
        hint.material = up ? HINTS.upgrade : HINTS.build;
        const s = 1 + Math.sin(time * 3) * 0.03;
        hint.scale.set(4 * s, (up ? 4 * 48 / 256 : 4 * 88 / 256) * s, 1);
      }
    });
    this.shopHints.forEach((hint, team) => {
      const core = w.core(team);
      const shopper = heroes.find((h) => h.team === team && this.humans[h.hero!.player] && !this.menus[h.hero!.player] && w.arena.inShop(h) && !padNear(w, h));
      hint.visible = this.hints && !!core && !!shopper;
      if (!hint.visible || !core) return;
      const s = 1 + Math.sin(time * 3) * 0.03;
      hint.position.set(core.transform.pos.x, core.transform.y + 6.4, core.transform.pos.z);
      hint.scale.set(4 * s, 4 * 48 / 256 * s, 1);
    });
  }
}
