import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { World } from "../sim/world";
import blockUrl from "../../assets/textures/wallblock.png?url";
import woodUrl from "../../assets/textures/wood.png?url";
import ironUrl from "../../assets/textures/iron.png?url";
import cobbleUrl from "../../assets/textures/cobble.png?url";
import snowUrl from "../../assets/textures/snow.png?url";
import { FX, SUMMONER } from "./fxKit";
import { gateSlots, type FountainDef, type GatesDef, type GateSlot } from "../sim/mapEvents";
import { chunks, emit, type FxHost } from "./fxParts";
import { propParts } from "./props";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";

interface Rect {
  x: number;
  z: number;
  w: number;
  h: number;
}

interface Run {
  stage: "warn";
  rect: Rect;
  dx: number;
  dz: number;
  start: number;
  seconds: number;
  acc: number;
}

interface Piece {
  u: number;
  a: number;
  s: number;
  sy: number;
  rot: number;
  sink: number;
  melt: number;
  roll: { lag: number; r: number; phase: number; tilt: THREE.Quaternion } | null;
}

interface PieceSet {
  mesh: THREE.InstancedMesh | null;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  items: Piece[];
  w: number;
  h: number;
  y0: number;
  fallback: number;
}

interface Ava {
  rect: Rect;
  dx: number;
  dz: number;
  span: number;
  start: number;
  sweep: number;
  until: number;
  group: THREE.Group;
  blanket: THREE.Mesh;
  uni: { uFront: { value: number }; uMelt: { value: number } };
  sets: PieceSet[];
  acc: number;
  settled: boolean;
  hAt: (x: number, z: number) => number;
}

interface Gate {
  slot: GateSlot;
  bars: THREE.Object3D;
  y: number;
  posts: [number, number, number][];
}

const BONE = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
BONE.userData.keep = true;
const SOUL = new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
SOUL.userData.keep = true;

const IRON = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
IRON.userData.keep = true;
const BAR_H = 2.7;

const SNOW = new THREE.MeshLambertMaterial({ color: 0xdfe6f2, vertexColors: true });
SNOW.userData.keep = true;

const UP = new THREE.Vector3(0, 1, 0);
const MELT = 3.5;
const FALLBACK_GEO = new THREE.IcosahedronGeometry(0.5, 1);
FALLBACK_GEO.translate(0, 0.5, 0);
FALLBACK_GEO.deleteAttribute("uv");
FALLBACK_GEO.userData.model = true;

let snowCache: THREE.Texture | null = null;
function snowTex(): THREE.Texture {
  if (snowCache) return snowCache;
  const t = new THREE.TextureLoader().load(snowUrl);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  snowCache = t;
  return t;
}

function blanketMat(uni: { uFront: { value: number }; uMelt: { value: number } }): THREE.Material {
  const m = new THREE.MeshLambertMaterial({ map: snowTex(), vertexColors: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.uFront = uni.uFront;
    s.uniforms.uMelt = uni.uMelt;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aArrive;\nattribute float aLift;\nattribute float aMelt;\nuniform float uFront;\nuniform float uMelt;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat bf = clamp((uFront - aArrive) / 3.0, 0.0, 1.0);\nfloat bg = bf * (1.0 + 0.5 * sin(bf * 3.14159));\nfloat bm = clamp(uMelt * 1.8 - aMelt * 0.8, 0.0, 1.0);\ntransformed.y -= aLift * (1.0 - bg * (1.0 - bm));");
  };
  m.customProgramCacheKey = () => "snowBlanket";
  return m;
}

function puffTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const blobs = [[64, 70, 40], [44, 62, 28], [86, 60, 30], [60, 44, 28], [80, 82, 26], [42, 84, 24], [70, 56, 34]];
  for (const [x, y, r] of blobs) {
    const q = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    q.addColorStop(0, "rgba(255,255,255,0.95)");
    q.addColorStop(0.55, "rgba(236,244,252,0.75)");
    q.addColorStop(0.85, "rgba(205,222,240,0.35)");
    q.addColorStop(1, "rgba(200,218,238,0)");
    g.fillStyle = q;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const PUFF = puffTexture();

const lods = new Map<string, THREE.BufferGeometry>();
function prepLods(): void {
  for (const n of ["event_drift", "event_heap", "event_boulder"]) {
    const p = propParts(n);
    if (!p || lods.has(n)) continue;
    lods.set(n, p.geo);
    void new SimplifyModifier()
      .modify(p.geo, Math.floor(p.geo.getAttribute("position").count * 0.6))
      .then((g) => {
        g.userData.model = true;
        g.computeBoundingBox();
        g.computeBoundingSphere();
        lods.set(n, g);
      })
      .catch(() => undefined);
  }
}

const bright = new Map<THREE.Material, THREE.Material>();
function brightMat(src: THREE.Material): THREE.Material {
  let m = bright.get(src);
  if (!m) {
    const c = (src as THREE.MeshLambertMaterial).clone();
    c.color.setRGB(1.18, 1.2, 1.22);
    c.userData.keep = true;
    bright.set(src, c);
    m = c;
  }
  return m;
}

const LANTERN_SCALE = 1.45;
const LANTERN_GLOW = { value: 1 };

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.55)");
  r.addColorStop(0.6, "rgba(255,255,255,0.12)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const HALO = new THREE.SpriteMaterial({ map: glowTexture(), color: 0x70ff80, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
HALO.userData.keep = true;
const DECAL = new THREE.MeshBasicMaterial({ map: SUMMONER.circle, color: 0x70ff80, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
DECAL.userData.keep = true;
const CHAIN = new THREE.MeshBasicMaterial({ color: 0x90ffa0, vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
CHAIN.userData.keep = true;
const coreGeo = new THREE.IcosahedronGeometry(0.16, 1);
const decalGeo = new THREE.PlaneGeometry(1, 1);
let chainCache: THREE.BufferGeometry | null = null;
function chainGeo(): THREE.BufferGeometry {
  if (chainCache) return chainCache;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const t = new THREE.TorusGeometry(0.11, 0.028, 4, 10);
    t.scale(1, 1.45, 1);
    if (i % 2) t.rotateY(Math.PI / 2);
    t.translate(0, 0.12 + i * 0.27, 0);
    parts.push(t.toNonIndexed());
    t.dispose();
  }
  const m = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const pos = m.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.max(0, 1 - pos.getY(i) / 2.5);
    col.set([f, f, f], i * 3);
  }
  m.setAttribute("color", new THREE.BufferAttribute(col, 3));
  chainCache = m;
  LANTERN_GEOS.add(m);
  return m;
}
const LANTERN_GEOS = new Set<THREE.BufferGeometry>([coreGeo, decalGeo]);

const lanternMats = new Map<THREE.Material, THREE.Material>();
function lanternMat(src: THREE.Material): THREE.Material {
  let m = lanternMats.get(src);
  if (m) return m;
  const c = (src as THREE.MeshLambertMaterial).clone();
  c.userData.keep = true;
  c.onBeforeCompile = (s) => {
    s.uniforms.uGlow = LANTERN_GLOW;
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlow;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nfloat gk = smoothstep(0.04, 0.2, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));\ntotalEmissiveRadiance += mix(diffuseColor.rgb, vec3(0.3, 1.0, 0.4) * max(diffuseColor.g, 0.4), 0.6) * gk * uGlow * 1.2;");
  };
  c.customProgramCacheKey = () => "lanternGlow";
  lanternMats.set(src, c);
  m = c;
  return m;
}

export class MapFx {
  readonly root = new THREE.Group();
  private runs: Run[] = [];
  private avas: Ava[] = [];
  private now = 0;

  private gates: Gate[] = [];
  private fountain?: FountainDef;
  private sprayAcc = 0;
  private ring = 0;
  private lanternObj: THREE.Group | null = null;
  private lanternId = 0;
  private lanternY = 0;
  private lanternPos = new THREE.Vector2();
  private lanternTilt = new THREE.Vector4();
  private lanternEnd: { kind: "taken" | "fade"; hero: number } = { kind: "fade", hero: 0 };
  private lanternOut: { obj: THREE.Group; start: number; kind: "taken" | "fade"; hero: number; from?: THREE.Vector3 }[] = [];
  private wispAcc = 0;
  private mistCells: number[] = [];
  private mistAcc = 0;

  private morphs: { id: number; start: number; until: number; team: number; acc: number }[] = [];
  teamColors: THREE.Color[] = [];

  private hornObjs: { ring: THREE.Mesh; mat: THREE.MeshBasicMaterial; flag: THREE.Mesh; horn: THREE.Object3D; k: number }[] = [];

  private buildHorns(): void {
    const w = this.world;
    const hs = w.mapEvents.horns;
    if (!hs.length) return;
    const stone = new THREE.MeshLambertMaterial({ map: this.texture(cobbleUrl, 1), color: 0xc8c4bc });
    const bone = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
    const brass = new THREE.MeshLambertMaterial({ color: 0xd8a040 });
    const wood = new THREE.MeshLambertMaterial({ map: this.texture(woodUrl, 1), color: 0xb89070 });
    const snow = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const a = t * Math.PI * 1.15;
      pts.push(new THREE.Vector3(Math.sin(a) * 0.9 * (1 - t * 0.2), 0.3 + t * 0.5 + Math.sin(a) * 0.15, Math.cos(a) * 0.55 - 0.55));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const hornGeo = new THREE.TubeGeometry(curve, 40, 0.09, 8, false);
    const pos = hornGeo.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const k = Math.floor(i / 9) / 40;
      const p = curve.getPoint(k);
      const r = 0.06 + 0.3 * Math.pow(k, 3);
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(p).multiplyScalar(r / 0.09).add(p);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    hornGeo.computeVertexNormals();
    const hp = propParts("event_horn");
    hs.forEach((h) => {
      const g = new THREE.Group();
      g.position.set(h.x, w.groundY(h.x, h.z), h.z);
      g.rotation.y = Math.atan2(w.terrain.width / 2 - h.x, w.terrain.depth / 2 - h.z);
      g.scale.setScalar(1.6);
      let horn: THREE.Object3D;
      if (hp) {
        horn = new THREE.Mesh(hp.geo, hp.mat);
        horn.scale.setScalar(1 / 1.6);
        horn.castShadow = true;
        g.add(horn);
      } else {
        [[1.1, 0.5, 0], [0.8, 0.4, 0.45], [0.55, 0.35, 0.8]].forEach(([r, hh, y], k) => {
          const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
          m.scale.set(1, hh / r, 1);
          m.position.y = y + hh * 0.6;
          m.rotation.y = k * 0.7;
          g.add(m);
        });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), snow);
        cap.scale.y = 0.25;
        cap.position.y = 0.9;
        g.add(cap);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), wood);
        post.position.set(0, 1.6, 0);
        g.add(post);
        horn = new THREE.Group();
        horn.position.set(0, 1.85, 0);
        const hm = new THREE.Mesh(hornGeo, bone);
        hm.position.x = -0.45;
        horn.add(hm);
        for (const t of [0.35, 0.65]) {
          const p = curve.getPoint(t);
          const band = new THREE.Mesh(new THREE.TorusGeometry(0.08 + 0.3 * Math.pow(t, 3) + 0.01, 0.025, 4, 10), brass);
          band.position.set(p.x - 0.45, p.y, p.z);
          band.lookAt(new THREE.Vector3().copy(curve.getTangent(t)).add(band.position));
          horn.add(band);
        }
        g.add(horn);
      }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 5), wood);
      pole.position.set(hp ? 0.62 : 0.55, hp ? 1.1 : 1.6, hp ? -0.42 : 0.3);
      g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshLambertMaterial({ color: 0x8a8070, side: THREE.DoubleSide }));
      flag.position.set(pole.position.x + 0.3, pole.position.y + 0.45, pole.position.z);
      g.add(flag);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.62, 40, 1, 0, 0.001), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.15;
      ring.renderOrder = 5;
      g.add(ring);
      this.root.add(g);
      this.hornObjs.push({ ring, mat, flag, horn, k: -1 });
    });
  }

  private syncHorns(time: number): void {
    const w = this.world;
    w.mapEvents.horns.forEach((h, i) => {
      const o = this.hornObjs[i];
      if (!o) return;
      const ready = w.time >= h.readyAt;
      const k = ready ? (h.progress > 0 ? h.progress / w.mapEvents.hornCapture : 1) : 1 - (h.readyAt - w.time) / w.mapEvents.hornCooldown;
      const kq = Math.round(Math.max(0.001, Math.min(1, k)) * 120) / 120;
      if (kq !== o.k) {
        o.k = kq;
        o.ring.geometry.dispose();
        o.ring.geometry = new THREE.RingGeometry(1.45, 1.62, 40, 1, Math.PI / 2, Math.max(0.001, kq) * Math.PI * 2);
      }
      const tc = h.team >= 0 ? this.teamColors[h.team] : undefined;
      o.mat.color.set(ready ? (h.progress > 0 && tc ? tc : new THREE.Color(0xffd040)) : new THREE.Color(0x606878));
      o.mat.opacity = ready ? (h.progress > 0 ? 0.85 : 0.35 + Math.sin(time * 3) * 0.15) : 0.3;
      (o.flag.material as THREE.MeshLambertMaterial).color.copy(tc ?? new THREE.Color(0x8a8070));
      o.flag.rotation.y = Math.sin(time * 3 + i) * 0.3;
      o.horn.rotation.z = ready && h.progress > 0 ? Math.sin(time * 30) * 0.03 : 0;
    });
  }

  private springs: { spring: THREE.Object3D; deck: THREE.Object3D; launch: number; release: number }[] = [];
  private pendingBursts: { at: number; x: number; y: number; z: number }[] = [];

  private texture(url: string, rep = 1): THREE.Texture {
    const t = new THREE.TextureLoader().load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  }

  private buildJumpPads(): void {
    const w = this.world;
    if (!w.jumpPads.length) return;
    const wood = new THREE.MeshLambertMaterial({ map: this.texture(woodUrl, 1), color: 0xd8b890 });
    const iron = new THREE.MeshLambertMaterial({ map: this.texture(ironUrl, 2), color: 0x9a9aa4 });
    const stone = new THREE.MeshLambertMaterial({ map: this.texture(cobbleUrl, 1.5), color: 0xb8b0a0 });
    const paint = new THREE.MeshLambertMaterial({ color: 0xe8b830 });
    const red = new THREE.MeshLambertMaterial({ color: 0xb82818 });
    const helix: THREE.Vector3[] = [];
    for (let k = 0; k <= 120; k++) {
      const t = k / 120;
      const a = t * Math.PI * 2 * 4.5;
      helix.push(new THREE.Vector3(Math.cos(a) * 0.55, t, Math.sin(a) * 0.55));
    }
    const springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 120, 0.065, 6, false);
    const footGeo = new THREE.CylinderGeometry(1.25, 1.4, 0.22, 12);
    const plateGeo = new THREE.CylinderGeometry(0.85, 0.9, 0.08, 14);
    const deckGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.13, 16);
    const rimGeo = new THREE.TorusGeometry(0.95, 0.045, 5, 18);
    const boltGeo = new THREE.SphereGeometry(0.05, 5, 4);
    const arrow = new THREE.Shape();
    arrow.moveTo(0, 0.62);
    arrow.lineTo(0.42, 0.08);
    arrow.lineTo(0.16, 0.08);
    arrow.lineTo(0.16, -0.55);
    arrow.lineTo(-0.16, -0.55);
    arrow.lineTo(-0.16, 0.08);
    arrow.lineTo(-0.42, 0.08);
    arrow.closePath();
    const arrowGeo = new THREE.ShapeGeometry(arrow);
    arrowGeo.rotateX(-Math.PI / 2);
    arrowGeo.rotateY(Math.PI);
    w.jumpPads.forEach((p) => {
      const g = new THREE.Group();
      const y = w.groundY(p.x, p.z);
      g.position.set(p.x, y, p.z);
      g.rotation.y = Math.atan2(p.tx - p.x, p.tz - p.z);
      const foot = new THREE.Mesh(footGeo, stone);
      foot.position.y = 0.02;
      g.add(foot);
      const plate = new THREE.Mesh(plateGeo, iron);
      plate.position.y = 0.16;
      g.add(plate);
      const spring = new THREE.Mesh(springGeo, iron);
      spring.position.y = 0.18;
      spring.scale.y = 0.32;
      g.add(spring);
      const deck = new THREE.Group();
      deck.position.y = 0.52;
      const top = new THREE.Mesh(deckGeo, wood);
      deck.add(top);
      const rim = new THREE.Mesh(rimGeo, iron);
      rim.rotation.x = Math.PI / 2;
      deck.add(rim);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const b = new THREE.Mesh(boltGeo, iron);
        b.position.set(Math.cos(a) * 0.82, 0.07, Math.sin(a) * 0.82);
        deck.add(b);
      }
      const ar = new THREE.Mesh(arrowGeo, paint);
      ar.position.y = 0.072;
      deck.add(ar);
      const tip = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), red);
      tip.rotation.x = -Math.PI / 2;
      tip.position.set(0, 0.075, 0.12);
      deck.add(tip);
      g.add(deck);
      this.root.add(g);
      this.springs.push({ spring, deck, launch: -99, release: -99 });
    });
  }

  private syncJumpPads(): void {
    const t = this.world.time;
    this.world.jumpPads.forEach((p, i) => {
      const s = this.springs[i];
      if (!s) return;
      const cooling = t < p.readyAt;
      let k = cooling ? 0.55 : 1 + Math.sin(t * 2.2 + i) * 0.03;
      const charge = t - p.chargeAt;
      const sinceLaunch = t - p.launchAt;
      const sinceFail = t - p.failAt;
      if (charge >= 0 && charge < this.world.jumpCharge && p.launchAt < p.chargeAt) {
        const q = charge / this.world.jumpCharge;
        k = 1 - 0.62 * q * q + Math.sin(charge * 60) * 0.02 * q;
      } else if (sinceLaunch >= 0 && sinceLaunch < 1.1) {
        k = 0.55 + 0.75 * Math.exp(-sinceLaunch * 4.5) * Math.cos(sinceLaunch * 22) * (sinceLaunch < 0.05 ? 0 : 1) + 0.45 * Math.min(1, sinceLaunch * 20) * Math.exp(-sinceLaunch * 3);
      } else if (sinceFail >= 0 && sinceFail < 0.8) {
        k = 0.55 + 0.25 * Math.exp(-sinceFail * 6) * Math.cos(sinceFail * 30);
      }
      if (cooling && t - p.readyAt > -0.6) k = 0.55 + 0.45 * (1 - (p.readyAt - t) / 0.6);
      s.spring.scale.y = 0.32 * k;
      s.deck.position.y = 0.18 + 0.32 * k + 0.02;
    });
    for (let i = this.pendingBursts.length - 1; i >= 0; i--) {
      const b = this.pendingBursts[i];
      if (t < b.at) continue;
      this.pendingBursts.splice(i, 1);
      if (!this.fx) continue;
      emit(this.fx, { tex: FX.dust, n: 10, x: b.x, y: b.y + 0.3, z: b.z, size: [1.0, 1.6], grow: 1.6, life: [0.4, 0.7], speed: [3, 5], flatSpread: true, opacity: 0.75 });
      emit(this.fx, { tex: FX.streak, n: 6, x: b.x, y: b.y + 0.6, z: b.z, size: [0.5, 0.9], life: [0.3, 0.5], speed: [7, 11], dir: { x: 0, y: 1, z: 0 }, cone: 0.3, additive: true, color: 0xfff0c0 });
      chunks(this.fx, 5, b.x, b.y + 0.5, b.z, { size: [0.08, 0.16], speed: [2, 4], up: [3, 5] });
      this.fx.shake = Math.max(this.fx.shake, 0.15);
    }
  }

  constructor(private world: World, private fx?: FxHost) {
    const gd = world.terrain.gates as GatesDef | undefined;
    if (gd) this.buildGates(gateSlots(world, gd));
    this.fountain = world.terrain.fountain as FountainDef | undefined;
    this.buildJumpPads();
    this.buildHorns();
    if (world.terrain.avalanche) prepLods();
    const m = world.mapEvents.mistMask;
    if (m) for (let i = 0; i < m.length; i++) if (m[i]) this.mistCells.push(i);
  }

  private buildLantern(): THREE.Group {
    const p = propParts("event_lantern");
    if (!p) return this.buildOldLantern();
    if (!p.geo.boundingBox) p.geo.computeBoundingBox();
    const bb = p.geo.boundingBox!;
    const h = bb.max.y - bb.min.y;
    const g = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.name = "pivot";
    pivot.position.y = h * 0.5 * LANTERN_SCALE;
    g.add(pivot);
    const spin = new THREE.Group();
    spin.name = "spin";
    spin.scale.setScalar(LANTERN_SCALE);
    pivot.add(spin);
    const body = new THREE.Mesh(p.geo, lanternMat(p.mat));
    body.position.y = -bb.max.y;
    body.castShadow = true;
    spin.add(body);
    const core = new THREE.Mesh(coreGeo, SOUL);
    core.name = "core";
    core.position.y = -bb.max.y + bb.min.y + h * 0.4;
    spin.add(core);
    const halo = new THREE.Sprite(HALO);
    halo.name = "halo";
    halo.position.copy(core.position);
    halo.scale.setScalar(2.4);
    halo.renderOrder = 4;
    spin.add(halo);
    const chain = new THREE.Mesh(chainGeo(), CHAIN);
    chain.name = "chain";
    chain.position.y = 0.05;
    pivot.add(chain);
    const ring = new THREE.Mesh(decalGeo, DECAL);
    ring.name = "decal";
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 3;
    g.add(ring);
    return g;
  }

  private buildOldLantern(): THREE.Group {
    const g = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = new THREE.CylinderGeometry(0.045, 0.06, 0.9, 5);
      b.translate(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
      parts.push(b);
      const k = new THREE.SphereGeometry(0.07, 5, 4);
      k.translate(Math.cos(a) * 0.32, 0.46, Math.sin(a) * 0.32);
      parts.push(k);
    }
    for (const y of [-0.48, 0.5]) {
      const r = new THREE.CylinderGeometry(y > 0 ? 0.28 : 0.4, y > 0 ? 0.42 : 0.3, 0.14, 8);
      r.translate(0, y, 0);
      parts.push(r);
    }
    const skull = new THREE.SphereGeometry(0.2, 7, 5);
    skull.scale(1, 0.9, 1.1);
    skull.translate(0, 0.72, 0);
    parts.push(skull);
    const hook = new THREE.TorusGeometry(0.12, 0.03, 4, 8);
    hook.translate(0, 0.95, 0);
    parts.push(hook);
    const cage = new THREE.Mesh(mergeGeometries(parts.map((q) => q.toNonIndexed()), false)!, BONE);
    parts.forEach((q) => q.dispose());
    g.add(cage);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), SOUL);
    core.name = "core";
    g.add(core);
    g.scale.setScalar(1.5);
    return g;
  }

  private syncLanternOut(time: number): void {
    for (let i = this.lanternOut.length - 1; i >= 0; i--) {
      const o = this.lanternOut[i];
      const taken = o.kind === "taken";
      const k = Math.min(1, (time - o.start) / (taken ? 0.35 : 0.9));
      if (!o.from) o.from = o.obj.position.clone();
      const hero = taken ? this.world.getAny(o.hero) : undefined;
      if (hero) {
        const e = k * k;
        o.obj.position.set(o.from.x + (hero.transform.pos.x - o.from.x) * e, o.from.y + (hero.transform.y + 1.2 - o.from.y) * e + Math.sin(k * Math.PI) * 0.8, o.from.z + (hero.transform.pos.z - o.from.z) * e);
      } else o.obj.position.y = o.from.y + k * 1.2;
      o.obj.scale.setScalar(Math.max(0.001, 1 - k * k));
      o.obj.rotation.y += taken ? 0.5 : 0.2;
      if (k < 1) continue;
      this.root.remove(o.obj);
      o.obj.traverse((m) => {
        const g = (m as THREE.Mesh).geometry;
        if (g && !g.userData.model && !LANTERN_GEOS.has(g)) g.dispose();
      });
      this.lanternOut.splice(i, 1);
      if (this.fx && hero) {
        emit(this.fx, { tex: SUMMONER.burst, n: 1, x: hero.transform.pos.x, y: hero.transform.y + 1.2, z: hero.transform.pos.z, size: [2.0, 2.0], grow: 1.5, life: [0.3, 0.3], speed: [0, 0], additive: true, color: 0x9cff9c });
        emit(this.fx, { tex: SUMMONER.soulFlame, n: 8, x: hero.transform.pos.x, y: hero.transform.y + 1, z: hero.transform.pos.z, size: [0.5, 0.8], life: [0.4, 0.7], speed: [1.5, 3], up: [1, 2], additive: true, color: 0x80ff90 });
      }
    }
  }

  private syncLantern(time: number, dt: number): void {
    const w = this.world;
    const me = w.mapEvents;
    const l = me.lantern;
    const def = me.lanternDef;
    if ((!l || !def || this.lanternId !== l.id) && this.lanternObj) {
      this.lanternOut.push({ obj: this.lanternObj, start: time, ...this.lanternEnd });
      this.lanternEnd = { kind: "fade", hero: 0 };
      this.lanternObj = null;
    }
    this.syncLanternOut(time);
    if (l && def) {
      if (!this.lanternObj) {
        this.lanternObj = this.buildLantern();
        this.lanternId = l.id;
        this.lanternPos.set(l.x, l.z);
        this.lanternTilt.set(0, 0, 0, 0);
        this.root.add(this.lanternObj);
      }
      const o = this.lanternObj;
      const sk = 1 - Math.exp(-dt * 10);
      const px = this.lanternPos.x;
      const pz = this.lanternPos.y;
      this.lanternPos.x += (l.x - px) * sk;
      this.lanternPos.y += (l.z - pz) * sk;
      const lx = this.lanternPos.x;
      const lz = this.lanternPos.y;
      const vx = dt > 0 ? (lx - px) / dt : 0;
      const vz = dt > 0 ? (lz - pz) / dt : 0;
      const ground = w.groundY(lx, lz);
      const hover = 1.9 + Math.sin(time * 2.2) * 0.18;
      let y = ground + hover;
      let rk = 1;
      if (l.state === "rise") {
        rk = Math.min(1, (w.time - l.start) / def.riseSeconds);
        y = ground - 3 + (hover + 3) * (rk * rk * (3 - 2 * rk));
      }
      this.lanternY = y;
      o.position.set(lx, y, lz);
      const tt = this.lanternTilt;
      const ax = vz * 0.22 + Math.sin(time * 1.6) * 0.07;
      const az = -vx * 0.22 + Math.cos(time * 1.25) * 0.06;
      tt.z += ((ax - tt.x) * 30 - tt.z * 3.2) * dt;
      tt.w += ((az - tt.y) * 30 - tt.w * 3.2) * dt;
      tt.x += tt.z * dt;
      tt.y += tt.w * dt;
      const pivot = o.getObjectByName("pivot");
      const spin = o.getObjectByName("spin");
      if (pivot && spin) {
        pivot.rotation.set(tt.x, 0, tt.y);
        spin.rotation.y = time * 0.5 + (1 - rk) * (1 - rk) * 9;
        const s = 0.55 + 0.45 * rk;
        pivot.scale.setScalar(s);
        const flick = 0.75 + Math.sin(time * 11) * 0.08 + Math.sin(time * 17.3) * 0.06 + Math.random() * 0.06;
        LANTERN_GLOW.value = 0.85 + flick * 0.5;
        (o.getObjectByName("halo") as THREE.Sprite).material.opacity = (0.45 + flick * 0.35) * rk;
        (o.getObjectByName("core") as THREE.Mesh).scale.setScalar(0.85 + flick * 0.3);
        const chain = o.getObjectByName("chain")!;
        chain.visible = l.state !== "rise";
        CHAIN.opacity = 0.35 + Math.sin(time * 3) * 0.1;
        const decal = o.getObjectByName("decal")!;
        decal.position.y = ground + 0.12 - y;
        decal.rotation.z = -time * 0.4;
        decal.scale.setScalar((2.6 + Math.sin(time * 2.2) * 0.15) * (0.3 + 0.7 * rk));
        DECAL.opacity = (0.5 + flick * 0.2) * rk;
      } else {
        o.rotation.y = time * 0.9;
        o.rotation.z = Math.sin(time * 1.7) * 0.12;
        (o.getObjectByName("core") as THREE.Mesh).scale.setScalar(1 + Math.sin(time * 9) * 0.12);
      }
      if (this.fx) {
        this.wispAcc += dt;
        if (this.wispAcc > 0.06) {
          this.wispAcc = 0;
          emit(this.fx, { tex: SUMMONER.soulFlame, n: 1, x: lx, y: y + 0.35, z: lz, size: [0.5, 0.8], grow: 0.5, life: [0.35, 0.6], speed: [0.2, 0.5], up: [0.8, 1.3], additive: true, color: 0x60ff70, jitter: 0.25 });
          if (Math.random() < 0.3) emit(this.fx, { tex: SUMMONER.ghost, n: 1, x: lx, y: y - 0.3, z: lz, size: [0.6, 0.9], grow: 1.2, life: [0.8, 1.2], speed: [0.4, 0.9], up: [0.2, 0.5], opacity: 0.5, color: 0xc8ffd0, jitter: 1.0 });
          if (Math.random() < 0.25) emit(this.fx, { tex: FX.twinkle, n: 1, x: lx, y: y - 0.2, z: lz, size: [0.2, 0.35], life: [0.6, 1.0], speed: [0.3, 0.8], up: [-0.6, 0.2], additive: true, color: 0x80ff90, jitter: 0.9 });
          if (l.state === "rise" && Math.random() < 0.6) emit(this.fx, { tex: SUMMONER.graveHand, n: 1, x: lx, y: ground - 0.2, z: lz, size: [0.7, 1.0], life: [0.6, 0.9], speed: [0.2, 0.5], up: [1, 2], opacity: 0.85, color: 0xb8e8b0, jitter: 1.6 });
        }
      }
    }
    if (!this.fx) return;
    for (const e of w.entities) {
      if (!e.alive || !e.hero || !(time < (e.status.hauntUntil ?? 0))) continue;
      if (Math.random() > dt * 10) continue;
      const a = Math.random() * Math.PI * 2;
      emit(this.fx, { tex: Math.random() < 0.5 ? SUMMONER.soulFlame : SUMMONER.ghost, n: 1, x: e.transform.pos.x + Math.cos(a) * 0.7, y: e.transform.y + 0.8 + Math.random() * 1.2, z: e.transform.pos.z + Math.sin(a) * 0.7, size: [0.35, 0.6], grow: 0.8, life: [0.4, 0.7], speed: [0.2, 0.6], up: [0.6, 1.2], additive: true, color: 0x90ff9c, opacity: 0.8 });
    }
  }

  private syncMorphs(dt: number): void {
    const fx = this.fx;
    for (let i = this.morphs.length - 1; i >= 0; i--) {
      const m = this.morphs[i];
      if (this.now > m.until + 0.05) {
        this.morphs.splice(i, 1);
        continue;
      }
      const e = this.world.getAny(m.id);
      if (!fx || !e) continue;
      m.acc += dt;
      if (m.acc < 0.03) continue;
      m.acc = 0;
      const k = (this.now - m.start) / Math.max(0.01, m.until - m.start);
      const col = this.teamColors[m.team] ?? new THREE.Color(0xffd040);
      const p = e.transform;
      for (let j = 0; j < 2; j++) {
        const a = this.now * 9 + j * Math.PI;
        const r = 1.3 - k * 0.6;
        const y = p.y + 0.2 + k * 2.4 + j * 0.3;
        emit(fx, { tex: FX.twinkle, n: 1, x: p.pos.x + Math.cos(a) * r, y, z: p.pos.z + Math.sin(a) * r, size: [0.35, 0.55], life: [0.3, 0.5], speed: [0.2, 0.6], up: [1, 2], additive: true, color: 0xffe080 });
        emit(fx, { tex: FX.swoosh, n: 1, x: p.pos.x + Math.cos(a + 1.6) * r, y: y - 0.3, z: p.pos.z + Math.sin(a + 1.6) * r, size: [0.6, 0.9], life: [0.25, 0.4], speed: [0.5, 1], up: [1.5, 2.5], additive: true, color: col });
      }
      if (Math.random() < 0.4) emit(fx, { tex: FX.dust, n: 1, x: p.pos.x, y: p.y + 0.1, z: p.pos.z, size: [1.0, 1.6], grow: 1.5, life: [0.4, 0.7], speed: [1, 2], flatSpread: true, opacity: 0.5, jitter: 1.2 });
    }
  }

  private syncMist(time: number, dt: number): void {
    const w = this.world;
    if (!this.fx || !this.mistCells.length) return;
    const [tail, front] = w.mapEvents.mistBand(w.time);
    if (front <= tail) return;
    this.mistAcc += dt;
    const W = w.terrain.width;
    const n = Math.floor(this.mistAcc * 70);
    if (!n) return;
    this.mistAcc -= n / 70;
    for (let k = 0; k < n; k++) {
      const c = this.mistCells[Math.floor(Math.random() * this.mistCells.length)];
      const x = (c % W) + Math.random();
      const z = Math.floor(c / W) + Math.random();
      if (z > front || z < tail) continue;
      const lead = front - z < 4;
      emit(this.fx, { tex: FX.smoke, n: 1, x, y: Math.max(w.groundY(x, z), w.terrain.waterLevel) + 1.0 + Math.random() * 0.9, z, size: [3.8, 5.6], grow: 1.3, life: [2.4, 3.2], speed: [0.15, 0.5], dir: { x: 0, y: 0.05, z: 1 }, cone: 1.2, opacity: lead ? 0.3 : 0.22, color: 0xf2f6f8, depthTest: false, order: 5 });
    }
  }

  private buildGates(slots: GateSlot[]): void {
    const w = this.world;
    const tex = new THREE.TextureLoader().load(blockUrl);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const stone = new THREE.MeshLambertMaterial({ map: tex, color: 0xd8d0c0 });
    const postGeos: THREE.BufferGeometry[] = [];
    for (const slot of slots) {
      const alongX = slot.w >= slot.h;
      const thick = slot.line ? 0.5 : alongX ? slot.h : slot.w;
      const [x0, z0, x1, z1] = slot.line ?? (alongX
        ? [slot.x - 0.05, slot.z + slot.h / 2, slot.x + slot.w + 0.05, slot.z + slot.h / 2]
        : [slot.x + slot.w / 2, slot.z - 0.05, slot.x + slot.w / 2, slot.z + slot.h + 0.05]);
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const len = Math.hypot(x1 - x0, z1 - z0) - 0.1;
      const ang = -Math.atan2(z1 - z0, x1 - x0);
      const y0 = w.groundY(cx, cz);
      const posts: [number, number, number][] = [];
      for (const [px, pz] of [[x0, z0], [x1, z1]]) {
        const g = new THREE.BoxGeometry(0.7, 3.4, thick + 0.3);
        g.rotateY(ang);
        g.translate(px, y0 + 1.5, pz);
        postGeos.push(g);
        const cap = new THREE.BoxGeometry(0.9, 0.3, thick + 0.5);
        cap.rotateY(ang);
        cap.translate(px, y0 + 3.3, pz);
        postGeos.push(cap);
        posts.push([px, y0 + 3.6, pz]);
      }
      const bg: THREE.BufferGeometry[] = [];
      const n = Math.max(3, Math.round(len / 0.45));
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * (len / n);
        const b = new THREE.BoxGeometry(0.1, BAR_H, 0.1);
        b.translate(u, BAR_H / 2, 0);
        bg.push(b);
        const tip = new THREE.ConeGeometry(0.1, 0.25, 4);
        tip.translate(u, BAR_H + 0.12, 0);
        bg.push(tip);
      }
      for (const y of [0.35, 1.4, 2.4]) {
        const r = new THREE.BoxGeometry(len, 0.12, 0.14);
        r.translate(0, y, 0);
        bg.push(r);
      }
      const merged = mergeGeometries(bg.map((g) => g.toNonIndexed()), false)!;
      bg.forEach((g) => g.dispose());
      const bars = new THREE.Mesh(merged, IRON);
      bars.position.set(cx, y0, cz);
      bars.rotation.y = ang;
      const shut = this.world.mapEvents.closed(slot.set);
      const y = shut ? 0 : -BAR_H - 0.3;
      bars.position.y = y0 + y;
      this.root.add(bars);
      this.gates.push({ slot, bars, y, posts });
    }
    if (postGeos.length) {
      const m = mergeGeometries(postGeos.map((g) => g.toNonIndexed()), false)!;
      postGeos.forEach((g) => g.dispose());
      this.root.add(new THREE.Mesh(m, stone));
    }
  }

  private syncGates(dt: number): void {
    const w = this.world;
    for (const g of this.gates) {
      const target = w.mapEvents.closed(g.slot.set) ? 0 : -BAR_H - 0.3;
      if (g.y === target) continue;
      const sp = target > g.y ? 9 : 3.2;
      g.y = target > g.y ? Math.min(target, g.y + sp * dt) : Math.max(target, g.y - sp * dt);
      const cx = g.bars.position.x;
      const cz = g.bars.position.z;
      g.bars.position.y = w.groundY(cx, cz) + g.y;
      const u = Math.random() - 0.5;
      const [dx, dz] = g.slot.line ? [g.slot.line[2] - g.slot.line[0], g.slot.line[3] - g.slot.line[1]] : g.slot.w >= g.slot.h ? [g.slot.w, 0] : [0, g.slot.h];
      if (this.fx && Math.random() < dt * 12) emit(this.fx, { tex: FX.dust, n: 1, x: cx + u * dx, y: w.groundY(cx, cz) + 0.2, z: cz + u * dz, size: [0.8, 1.3], grow: 1.5, life: [0.5, 0.9], speed: [0.4, 1.0], up: [0.5, 1.2], opacity: 0.6 });
    }
  }

  private syncFountain(dt: number): void {
    const f = this.fountain;
    if (!f || !this.fx) return;
    this.sprayAcc += dt;
    if (this.sprayAcc < 0.07) return;
    this.sprayAcc = 0;
    const y = this.world.groundY(f.x + f.r, f.z);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * (Math.PI / 2);
      const x = f.x + Math.cos(a) * 4.75;
      const z = f.z + Math.sin(a) * 4.75;
      emit(this.fx, { tex: FX.splash, n: 1, x, y: y + 1.9, z, size: [0.55, 0.85], grow: 1.3, life: [0.55, 0.75], speed: [2.6, 3.2], dir: { x: -Math.cos(a), y: 1.3, z: -Math.sin(a) }, cone: 0.12, gravity: 9, opacity: 0.8, color: 0xd8f0ff });
    }
  }

  handle(ev: { type: string; [k: string]: unknown }): void {
    if (ev.type === "horn") {
      const hv = ev as unknown as { x: number; y: number; z: number };
      if (this.fx) {
        for (let k = 0; k < 3; k++) emit(this.fx, { tex: FX.shock, n: 1, x: hv.x, y: hv.y + 2, z: hv.z, size: [2 + k * 2, 2 + k * 2], grow: 3, life: [0.6 + k * 0.2, 0.6 + k * 0.2], speed: [0, 0], opacity: 0.5, color: 0xf0f4ff });
        emit(this.fx, { tex: PUFF, n: 10, x: hv.x, y: hv.y + 2, z: hv.z, size: [1, 1.8], grow: 2, life: [1, 1.6], speed: [2, 5], opacity: 0.6, color: 0xf4f8ff });
        this.fx.shake = Math.max(this.fx.shake, 0.6);
      }
      return;
    }
    if (ev.type === "jumppad") {
      const j = ev as unknown as { stage: string; x: number; y: number; z: number; windup: number };
      if (j.stage === "launch") this.pendingBursts.push({ at: this.world.time, x: j.x, y: j.y, z: j.z });
      else if (j.stage === "fail" && this.fx) {
        emit(this.fx, { tex: FX.smoke, n: 5, x: j.x, y: j.y + 0.6, z: j.z, size: [0.8, 1.2], grow: 1.4, life: [0.5, 0.8], speed: [0.6, 1.4], up: [0.5, 1.2], opacity: 0.6, color: 0x908880 });
        chunks(this.fx, 3, j.x, j.y + 0.5, j.z, { size: [0.06, 0.12], speed: [1.5, 3], up: [1, 2] });
      } else if (j.stage === "land" && this.fx) {
        emit(this.fx, { tex: FX.dust, n: 12, x: j.x, y: j.y + 0.2, z: j.z, size: [1.2, 2.0], grow: 1.6, life: [0.5, 0.9], speed: [3, 6], flatSpread: true, opacity: 0.8 });
        chunks(this.fx, 4, j.x, j.y + 0.3, j.z, { size: [0.1, 0.2], speed: [2, 4], up: [2, 4] });
        this.fx.shake = Math.max(this.fx.shake, 0.3);
      }
      return;
    }
    if (ev.type === "morph") {
      const m = ev as unknown as { stage: string; id: number; team: number; x: number; y: number; z: number; seconds: number };
      if (m.stage === "start") this.morphs.push({ id: m.id, start: this.now, until: this.now + m.seconds, team: m.team, acc: 0 });
      else if (this.fx) {
        const col = this.teamColors[m.team] ?? new THREE.Color(0xffd040);
        emit(this.fx, { tex: FX.burst, n: 1, x: m.x, y: m.y + 1.2, z: m.z, size: [4.5, 4.5], grow: 1.6, life: [0.35, 0.35], speed: [0, 0], additive: true, color: 0xfff0c0 });
        emit(this.fx, { tex: FX.streak, n: 10, x: m.x, y: m.y + 0.4, z: m.z, size: [0.5, 0.9], life: [0.5, 0.8], speed: [6, 10], dir: { x: 0, y: 1, z: 0 }, cone: 0.25, additive: true, color: 0xffe080, jitter: 0.8 });
        emit(this.fx, { tex: FX.twinkle, n: 18, x: m.x, y: m.y + 1.2, z: m.z, size: [0.3, 0.6], life: [0.6, 1.1], speed: [3, 6], up: [1, 3], additive: true, color: col, gravity: 4 });
        emit(this.fx, { tex: FX.smoke, n: 8, x: m.x, y: m.y + 0.4, z: m.z, size: [1.4, 2.2], grow: 1.6, life: [0.7, 1.1], speed: [2, 3.5], flatSpread: true, opacity: 0.7, color: 0xf0e8d8 });
        this.fx.shake = Math.max(this.fx.shake, 0.25);
      }
      return;
    }
    if (ev.type === "lantern") {
      const l = ev as unknown as { stage: string; x: number; z: number; hero: number };
      if (l.stage === "taken" || l.stage === "fade") this.lanternEnd = { kind: l.stage, hero: l.hero };
      if (this.fx && l.stage === "taken") {
        emit(this.fx, { tex: SUMMONER.burst, n: 1, x: l.x, y: this.lanternY, z: l.z, size: [2.4, 2.4], grow: 1.6, life: [0.4, 0.4], speed: [0, 0], additive: true, color: 0x9cff9c });
        emit(this.fx, { tex: SUMMONER.ghost, n: 8, x: l.x, y: this.lanternY, z: l.z, size: [0.6, 1.0], life: [0.6, 1.0], speed: [2, 4], additive: true, color: 0xb0ffb8 });
        emit(this.fx, { tex: SUMMONER.bones, n: 5, x: l.x, y: this.lanternY, z: l.z, size: [0.3, 0.5], life: [0.6, 0.9], speed: [2, 4], up: [1, 3], gravity: 9 });
      } else if (this.fx && l.stage === "rise") {
        const y = this.world.groundY(l.x, l.z);
        emit(this.fx, { tex: FX.smoke, n: 5, x: l.x, y: y + 0.3, z: l.z, size: [1.2, 2.0], grow: 1.6, life: [0.9, 1.4], speed: [0.4, 1.2], up: [1, 2], opacity: 0.35, color: 0x6a9a78, jitter: 1.5 });
        emit(this.fx, { tex: FX.dust, n: 8, x: l.x, y: y + 0.1, z: l.z, size: [0.8, 1.3], grow: 1.5, life: [0.5, 0.8], speed: [2, 3.5], flatSpread: true, opacity: 0.6 });
        chunks(this.fx, 4, l.x, y + 0.2, l.z, { size: [0.08, 0.16], speed: [1.5, 3], up: [3, 5] });
        emit(this.fx, { tex: SUMMONER.skull, n: 3, x: l.x, y: y + 0.6, z: l.z, size: [0.5, 0.8], life: [1.0, 1.4], speed: [0.3, 0.8], up: [1.5, 2.5], additive: true, color: 0x90ff9c, jitter: 1 });
      } else if (this.fx && l.stage === "fade") {
        emit(this.fx, { tex: SUMMONER.ghost, n: 6, x: l.x, y: this.lanternY, z: l.z, size: [0.6, 1.0], life: [0.8, 1.2], speed: [0.5, 1.5], up: [1, 2], opacity: 0.6, color: 0xc8ffd0 });
      }
      return;
    }
    if (ev.type === "gates") {
      const g = ev as unknown as { stage: "warn" | "shift" };
      if (g.stage === "warn" && this.fx) {
        this.ring = 1.6;
        for (const gt of this.gates) for (const p of gt.posts) emit(this.fx, { tex: FX.twinkle, n: 2, x: p[0], y: p[1], z: p[2], size: [0.5, 0.8], life: [0.6, 1.0], speed: [0.5, 1.5], up: [0.5, 1], additive: true, color: 0xffe080 });
      }
      return;
    }
    if (ev.type !== "avalanche") return;
    const e = ev as unknown as { stage: "warn" | "slide" | "settle"; rect: Rect; dx: number; dz: number; seconds: number };
    if (e.stage === "settle") {
      let a = this.avas.find((v) => v.until === Infinity && v.rect.x === e.rect.x && v.rect.z === e.rect.z);
      if (!a) a = this.buildAva(e.rect, e.dx, e.dz, this.now - 2, 1.6);
      a.until = this.now + e.seconds;
      return;
    }
    if (e.stage === "slide") {
      this.buildAva(e.rect, e.dx, e.dz, this.now, e.seconds);
      if (this.fx) this.fx.shake = Math.max(this.fx.shake, 0.8);
      return;
    }
    this.runs.push({ stage: e.stage, rect: e.rect, dx: e.dx, dz: e.dz, start: this.now, seconds: e.seconds, acc: 0 });
  }

  private edge(r: Rect, dx: number, dz: number, u: number, along: number): { x: number; z: number } {
    if (dx !== 0) return { x: dx > 0 ? r.x + along : r.x + r.w - along, z: r.z + u * r.h };
    return { x: r.x + u * r.w, z: dz > 0 ? r.z + along : r.z + r.h - along };
  }

  sync(time: number, dt: number): void {
    this.now = time;
    const w = this.world;
    this.syncGates(dt);
    this.syncJumpPads();
    this.syncHorns(time);
    this.syncMorphs(dt);
    this.syncFountain(dt);
    this.syncLantern(time, dt);
    this.syncMist(time, dt);
    if (this.ring > 0 && this.fx) {
      this.ring -= dt;
      if (Math.floor((this.ring + dt) * 4) !== Math.floor(this.ring * 4)) {
        for (const gt of this.gates) {
          const p = gt.posts[Math.random() < 0.5 ? 0 : 1];
          emit(this.fx, { tex: FX.twinkle, n: 1, x: p[0], y: p[1], z: p[2], size: [0.4, 0.7], life: [0.4, 0.7], speed: [0.3, 1], up: [0.6, 1.2], additive: true, color: 0xffe080 });
        }
      }
    }
    const fx = this.fx;
    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i];
      const k = (time - r.start) / r.seconds;
      if (k >= 1) {
        this.runs.splice(i, 1);
        continue;
      }
      if (!fx) continue;
      r.acc += dt;
      if (r.acc < 0.12) continue;
      r.acc = 0;
      fx.shake = Math.max(fx.shake, 0.08 + k * 0.2);
      for (let n = 0; n < 2; n++) {
        const p = this.edge(r.rect, r.dx, r.dz, Math.random(), -1.5 + Math.random() * 2);
        const y = w.groundY(p.x, p.z);
        emit(fx, { tex: PUFF, n: 1, x: p.x, y: y + 1.5, z: p.z, size: [1.4, 2.4], grow: 1.8, life: [0.8, 1.4], speed: [0.5, 1.6], dir: { x: r.dx, y: -0.2, z: r.dz }, cone: 0.6, opacity: 0.75, color: 0xf4f8ff });
      }
      if (Math.random() < 0.25 + k * 0.5) {
        const p = this.edge(r.rect, r.dx, r.dz, Math.random(), Math.random() * 1.5);
        emit(fx, { tex: PUFF, n: 1 + Math.floor(k * 3), x: p.x, y: w.groundY(p.x, p.z) + 1.2, z: p.z, size: [0.3, 0.5], life: [0.6, 1.0], speed: [1.5, 3.5], dir: { x: r.dx, y: 0.6, z: r.dz }, cone: 0.5, gravity: 12, opacity: 0.95, color: 0xffffff });
      }
      if (Math.random() < 0.15 + k * 0.3) {
        const p = this.edge(r.rect, r.dx, r.dz, Math.random(), Math.random() * 3);
        emit(fx, { tex: PUFF, n: 1, x: p.x, y: w.groundY(p.x, p.z) + 0.2, z: p.z, size: [0.6, 1.0], grow: 1.6, life: [0.5, 0.8], speed: [1.5, 3], dir: { x: r.dx, y: 0.1, z: r.dz }, cone: 0.4, opacity: 0.7, color: 0xf8fbff });
      }
    }
    this.syncAvas(time, dt);
  }

  private buildAva(rect: Rect, dx: number, dz: number, start: number, sweep: number): Ava {
    const w = this.world;
    const span = dx !== 0 ? rect.w : rect.h;
    const cross = dx !== 0 ? rect.h : rect.w;
    const alongOf = (x: number, z: number) => (dx > 0 ? x - rect.x : dx < 0 ? rect.x + rect.w - x : dz > 0 ? z - rect.z : rect.z + rect.h - z);
    const crossOf = (x: number, z: number) => (dx !== 0 ? (z - rect.z) / rect.h : (x - rect.x) / rect.w);
    const ph = [Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random() * 6];
    const m = 0.9;
    const hAt = (x: number, z: number) => {
      const d = Math.min(x - rect.x + m, rect.x + rect.w + m - x, z - rect.z + m, rect.z + rect.h + m - z);
      const wob = 0.7 * Math.sin(x * 0.8 + z * 0.3 + ph[4]) + 0.5 * Math.sin(z * 1.1 - x * 0.45 + ph[2]);
      const ed = Math.max(0, Math.min(1, (d - 0.6 + wob) / 1.8));
      const e = ed * ed * (3 - 2 * ed);
      const a = alongOf(x, z);
      const u = crossOf(x, z);
      const n = 0.5 + 0.3 * Math.sin(x * 0.9 + ph[0]) * Math.sin(z * 0.75 + ph[1]) + 0.2 * Math.sin(x * 0.37 + z * 0.53 + ph[2]);
      const fk = Math.max(0, Math.min(1, (a - span * 0.45) / (span * 0.55)));
      return e * (0.2 + 0.34 * n + 0.32 * fk * fk + 0.05 * Math.sin(a * 1.6 + u * 4 + ph[3])) - (1 - e) * 0.2;
    };
    const step = 0.8;
    const nx = Math.ceil((rect.w + m * 2) / step) + 1;
    const nz = Math.ceil((rect.h + m * 2) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const arrive = new Float32Array(nx * nz);
    const lift = new Float32Array(nx * nz);
    const melt = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = rect.x - m + Math.min(rect.w + m * 2, i * step);
        const z = rect.z - m + Math.min(rect.h + m * 2, j * step);
        const h = hAt(x, z);
        const g = w.groundY(x, z);
        pos.set([x, g + h + 0.03, z], k * 3);
        const c = 0.8 + 0.2 * Math.max(0, Math.min(1, h / 0.55));
        col.set([c * 0.94, c * 0.97, Math.min(1, c * 1.04)], k * 3);
        uv.set([x / 4, z / 4], k * 2);
        arrive[k] = alongOf(x, z);
        lift[k] = Math.max(0, h) + 0.3;
        melt[k] = Math.max(0, Math.min(1, h / 0.6)) * 0.7 + Math.random() * 0.3;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("aArrive", new THREE.BufferAttribute(arrive, 1));
    geo.setAttribute("aLift", new THREE.BufferAttribute(lift, 1));
    geo.setAttribute("aMelt", new THREE.BufferAttribute(melt, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const uni = { uFront: { value: -10 }, uMelt: { value: 0 } };
    const mat = blanketMat(uni);
    const blanket = new THREE.Mesh(geo, mat);
    blanket.receiveShadow = true;
    const group = new THREE.Group();
    group.add(blanket);
    const sets: PieceSet[] = [];
    const set = (name: string, fallback: number) => {
      const p = propParts(name);
      const geo = (p && lods.get(name)) ?? p?.geo ?? FALLBACK_GEO;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const s: PieceSet = { mesh: null, geo, mat: p ? (fallback < 2 ? brightMat(p.mat) : p.mat) : SNOW, items: [], w: Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) || 1, h: bb.max.y - bb.min.y || 1, y0: bb.min.y, fallback };
      sets.push(s);
      return s;
    };
    const drift = set("event_drift", 0);
    const heap = set("event_heap", 1);
    const rock = set("event_boulder", 2);
    const marks = [...w.terrain.pads, ...w.jumpPads];
    const blocked = (x: number, z: number) => marks.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6);
    const sp = 4.6;
    for (let a = sp * 0.5; a < span; a += sp) {
      for (let c = sp * 0.5; c < cross; c += sp) {
        if (Math.random() < 0.35) continue;
        const aa = Math.max(1.5, Math.min(span - 1.5, a + (Math.random() - 0.5) * sp * 0.7));
        const cc = Math.max(1.5, Math.min(cross - 1.5, c + (Math.random() - 0.5) * sp * 0.7)) / cross;
        const q = this.edge(rect, dx, dz, cc, aa);
        if (blocked(q.x, q.z)) continue;
        const r = Math.random();
        const t = r < 0.6 ? drift : r < 0.85 ? heap : rock;
        const width = t === drift ? 3.4 + Math.random() * 1.6 : t === heap ? 2.0 + Math.random() * 0.9 : 1.2 + Math.random() * 0.6;
        t.items.push({ u: cc, a: aa, s: width / t.w, sy: 0.7 + Math.random() * 0.3, rot: Math.random() * Math.PI * 2, sink: 0.12 + Math.random() * 0.12, melt: Math.random() * 0.5, roll: null });
      }
    }
    const nRock = Math.max(3, Math.round(cross / 3));
    const nHeap = Math.max(2, Math.round(cross / 3.6));
    for (const [t, n, w0, w1] of [[rock, nRock, 1.2, 1.8], [heap, nHeap, 1.8, 2.5]] as [PieceSet, number, number, number][]) {
      for (let j = 0; j < n; j++) {
        const width = w0 + Math.random() * (w1 - w0);
        t.items.push({ u: (j + 0.2 + Math.random() * 0.6) / n, a: span - 0.6 - Math.random() * 3.2, s: width / t.w, sy: 1, rot: Math.random() * Math.PI * 2, sink: 0.18, melt: 0.3 + Math.random() * 0.5, roll: { lag: Math.random() * 2.2 - 0.4, r: (width / 2) * 0.85, phase: Math.random() * 6, tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)) } });
      }
    }
    for (const s of sets) {
      if (!s.items.length) continue;
      const im = new THREE.InstancedMesh(s.geo, s.mat, s.items.length);
      im.castShadow = s.fallback === 2;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      s.mesh = im;
      group.add(im);
    }
    this.root.add(group);
    const ava: Ava = { rect, dx, dz, span, start, sweep, until: Infinity, group, blanket, uni, sets, acc: 0, settled: false, hAt };
    this.avas.push(ava);
    this.poseAva(ava, start);
    return ava;
  }

  private poseAva(v: Ava, time: number): void {
    const w = this.world;
    const k = Math.min(1, (time - v.start) / v.sweep);
    const front = k * (v.span + 4) - 2;
    const meltK = v.until === Infinity ? 0 : Math.max(0, Math.min(1, (time - (v.until - MELT)) / MELT));
    v.uni.uFront.value = front;
    v.uni.uMelt.value = meltK;
    const axis = new THREE.Vector3(v.dz, 0, -v.dx);
    const q = new THREE.Quaternion();
    const mtx = new THREE.Matrix4();
    const sc = new THREE.Vector3();
    const pv = new THREE.Vector3();
    const cv = new THREE.Vector3();
    for (const s of v.sets) {
      const im = s.mesh;
      if (!im) continue;
      s.items.forEach((it, i) => {
        let a = it.a;
        let g = 1;
        let lift = 0;
        if (it.roll) {
          a = Math.min(it.a, front - it.roll.lag);
          const moving = a < it.a;
          q.setFromAxisAngle(axis, (a + 2) / it.roll.r).multiply(it.roll.tilt);
          lift = moving ? Math.abs(Math.sin(it.roll.phase + a * 1.1)) * 0.5 * (1 - k * 0.5) : 0;
          g = a < -1 ? 0 : 1;
        } else {
          const f = Math.max(0, Math.min(1, (front - it.a) / 2.5));
          g = f * (1 + 0.5 * Math.sin(f * Math.PI));
          q.setFromAxisAngle(UP, it.rot);
        }
        const mk = Math.max(0, Math.min(1, meltK * 1.7 - it.melt));
        const p = this.edge(v.rect, v.dx, v.dz, it.u, a);
        const gy = w.groundY(p.x, p.z) + Math.max(0, v.hAt(p.x, p.z)) * 0.7 * Math.max(0, Math.min(1, (front - a) / 3));
        const hs = s.h * it.s * it.sy;
        const sy = Math.max(0.001, g * (1 - mk * 0.85));
        sc.set(it.s * Math.max(0.001, g) * (1 - mk * 0.3), it.s * it.sy * sy, it.s * Math.max(0.001, g) * (1 - mk * 0.3));
        if (it.roll) {
          const rest = a >= it.a ? hs * it.sink : 0;
          cv.set(0, (s.y0 + s.h / 2) * sc.y, 0).applyQuaternion(q);
          pv.set(p.x - cv.x, gy + it.roll.r * 0.85 + lift - rest - mk * hs * 0.4 - cv.y, p.z - cv.z);
        } else pv.set(p.x, gy - s.y0 * sc.y - hs * it.sink - mk * hs * 0.35, p.z);
        mtx.compose(pv, q, sc);
        im.setMatrixAt(i, mtx);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }

  private syncAvas(time: number, dt: number): void {
    const fx = this.fx;
    const w = this.world;
    for (let i = this.avas.length - 1; i >= 0; i--) {
      const v = this.avas[i];
      if (time >= v.until) {
        this.freeAva(v);
        this.avas.splice(i, 1);
        continue;
      }
      const k = (time - v.start) / v.sweep;
      const melting = v.until !== Infinity && time > v.until - MELT;
      if (!v.settled || melting) this.poseAva(v, time);
      if (k > 1.2 && !melting) v.settled = true;
      if (!fx) continue;
      v.acc += dt;
      if (k < 1.05) {
        if (v.acc < 0.05) continue;
        v.acc = 0;
        fx.shake = Math.max(fx.shake, 0.5);
        const cross = v.dx !== 0 ? v.rect.h : v.rect.w;
        const along = Math.min(1, k) * (v.span + 4) - 2;
        const n = Math.ceil(cross / 2.6);
        for (let j = 0; j < n; j++) {
          const p = this.edge(v.rect, v.dx, v.dz, (j + Math.random()) / n, along);
          const y = w.groundY(p.x, p.z);
          emit(fx, { tex: PUFF, n: 1, x: p.x, y: y + 1.6, z: p.z, size: [2.2, 3.4], grow: 1.7, life: [0.6, 1.0], speed: [3, 6], dir: { x: v.dx, y: 0.5, z: v.dz }, cone: 0.5, opacity: 0.6, color: 0xf8fbff });
          emit(fx, { tex: PUFF, n: 1, x: p.x, y: y + 0.3, z: p.z, size: [1.2, 2.0], grow: 1.5, life: [0.4, 0.8], speed: [5, 8], dir: { x: v.dx, y: 0.7, z: v.dz }, cone: 0.7, opacity: 0.85, color: 0xf0f6ff, gravity: 6 });
          if (Math.random() < 0.4) emit(fx, { tex: PUFF, n: 2, x: p.x, y: y + 0.8, z: p.z, size: [0.35, 0.6], life: [0.6, 0.9], speed: [4, 7], dir: { x: v.dx, y: 0.8, z: v.dz }, cone: 0.6, gravity: 14, opacity: 0.95, color: 0xffffff });
        }
      } else if (melting) {
        if (v.acc < 0.12) continue;
        v.acc = 0;
        const p = this.edge(v.rect, v.dx, v.dz, Math.random(), Math.random() * v.span);
        emit(fx, { tex: PUFF, n: 1, x: p.x, y: w.groundY(p.x, p.z) + 0.4, z: p.z, size: [1.2, 2.0], grow: 1.5, life: [1.0, 1.6], speed: [0.1, 0.3], up: [0.4, 0.8], opacity: 0.25, color: 0xeef6ff });
      } else {
        if (v.acc < 0.2) continue;
        v.acc = 0;
        const p = this.edge(v.rect, v.dx, v.dz, Math.random(), Math.random() * v.span);
        emit(fx, { tex: FX.twinkle, n: 1, x: p.x, y: w.groundY(p.x, p.z) + 0.5, z: p.z, size: [0.2, 0.35], life: [0.3, 0.5], speed: [0, 0.1], additive: true, color: 0xd8f0ff });
      }
    }
  }

  private freeAva(v: Ava): void {
    this.root.remove(v.group);
    v.blanket.geometry.dispose();
    (v.blanket.material as THREE.Material).dispose();
    for (const s of v.sets) s.mesh?.dispose();
  }

  dispose(): void {
    for (const v of this.avas) this.freeAva(v);
    this.avas = [];
    this.root.clear();
  }
}
