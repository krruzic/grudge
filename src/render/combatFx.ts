import * as THREE from "three";
import type { World } from "../sim/world";
import type { SimEvent } from "../sim/types";
import { drawNum, drawText, fontReady, onTextLost, textWidth } from "../ui/font";
import { dyeColor } from "./heroModels";
import ironUrl from "../../assets/textures/iron.png?url";
import woodUrl from "../../assets/textures/wood.png?url";
import { DUELIST, ENGINEER, FX, HERALD, RAIDER, WARLORD } from "./fxKit";
import { spikeGeo, spikeMat } from "./warlordFx";
import { wardenSlap } from "./wardenFx";
import { KITS, type HeroKit } from "./kits";
import "./heroFx";
import { chunks, decal, emit, Ribbon, shockwave, SHARED_CHUNK_GEOS, SHARED_PLANE_GEOS, type FxHost } from "./fxParts";

const woodTex = new THREE.TextureLoader().load(woodUrl);
woodTex.colorSpace = THREE.SRGBColorSpace;
const woodMat = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xe8c8a0, flatShading: true });
const hammerHeadMat = new THREE.MeshLambertMaterial({ map: null, color: 0x70707a, flatShading: true });
const plankGeo = new THREE.BoxGeometry(1.1, 0.12, 0.32);
const handleGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.1, 5);
const headGeo = new THREE.BoxGeometry(0.55, 0.3, 0.3);
function hammerMesh(): THREE.Group {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(handleGeo, woodMat);
  handle.position.y = 0.55;
  const head = new THREE.Mesh(headGeo, hammerHeadMat);
  head.position.y = 1.1;
  g.add(handle, head);
  return g;
}
const ironMat = new THREE.MeshLambertMaterial({ color: 0x8a8a96, flatShading: true });
const bladeMat = new THREE.MeshLambertMaterial({ color: 0xd8dce8, flatShading: true, emissive: 0x202630 });
const rivetGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.55, 6);
const rivetHeadGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.1, 6);
const bladeGeo = new THREE.ConeGeometry(0.12, 0.7, 4);
const rockGeo = new THREE.ConeGeometry(0.45, 1.3, 5);
const rockMat = new THREE.MeshLambertMaterial({ color: 0x8a7a66, flatShading: true });
const shardGeo = new THREE.TetrahedronGeometry(0.22);
const SHARED_GEO = new Set<THREE.BufferGeometry>([plankGeo, handleGeo, headGeo, rivetGeo, rivetHeadGeo, bladeGeo, rockGeo, shardGeo]);
const SHARED_MAT = new Set<THREE.Material>([woodMat, hammerHeadMat, ironMat, bladeMat, rockMat]);

const ironTex = new THREE.TextureLoader().load(ironUrl);
ironTex.colorSpace = THREE.SRGBColorSpace;
ironMat.map = ironTex;
const ballGeo = new THREE.IcosahedronGeometry(0.5, 1);
const ballMat = new THREE.MeshLambertMaterial({ map: ironTex, color: 0x6a6660, flatShading: true });

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const starTex = canvasTex(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,240,160,0.9)");
  g.addColorStop(1, "rgba(255,120,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? s * 0.18 : s * 0.5;
    ctx.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
  }
  ctx.fill();
});

const puffTex = FX.smoke;

const glowTex = canvasTex(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

const plusTex = canvasTex(16, (ctx) => {
  ctx.fillStyle = "#7dff7a";
  ctx.fillRect(6, 2, 4, 12);
  ctx.fillRect(2, 6, 12, 4);
});

function textTex(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  fontReady.then(() => {
    ctx.clearRect(0, 0, 128, 32);
    drawNum(ctx, text, (128 - textWidth(text, 2.4, true)) / 2, 3, color, 2.4);
    t.needsUpdate = true;
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const numCache = new Map<string, THREE.CanvasTexture>();
onTextLost(() => {
  for (const t of numCache.values()) t.dispose();
  numCache.clear();
  for (const v of calloutCache.values()) v.tex.dispose();
  calloutCache.clear();
});
function numberTex(text: string, color: string): THREE.CanvasTexture {
  const key = `${text}|${color}`;
  const hit = numCache.get(key);
  if (hit) {
    numCache.delete(key);
    numCache.set(key, hit);
    return hit;
  }
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  drawNum(ctx, text, (128 - textWidth(text, 2.6, true)) / 2, 2, color, 2.6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  numCache.set(key, t);
  if (numCache.size > 120) {
    const old = numCache.keys().next().value!;
    numCache.get(old)!.dispose();
    numCache.delete(old);
  }
  return t;
}

const streakTex = canvasTex(32, (ctx, s) => {
  const g = ctx.createLinearGradient(0, s / 2, s, s / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.7, "rgba(255,250,220,1)");
  g.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, s / 2 - 2, s, 4);
});

export const targetTex = canvasTex(64, (ctx, s) => {
  const c = s / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(20,4,0,0.85)";
  ctx.beginPath();
  ctx.arc(c, c, c - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff3a1a";
  ctx.beginPath();
  ctx.arc(c, c, c - 4, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.save();
    ctx.translate(c + Math.cos(a) * (c - 10), c + Math.sin(a) * (c - 10));
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = "rgba(20,4,0,0.85)";
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(6, -4);
    ctx.lineTo(0, 5);
    ctx.fill();
    ctx.fillStyle = "#ffd23a";
    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.lineTo(4, -3);
    ctx.lineTo(0, 3);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = "#ff3a1a";
  ctx.fillRect(c - 1, c - 7, 2, 14);
  ctx.fillRect(c - 7, c - 1, 14, 2);
});

const fillTex = canvasTex(32, (ctx, s) => {
  ctx.fillStyle = "#ff4a1a";
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  for (let y = 0; y < s; y += 2) {
    ctx.clearRect(0, y, s, 1);
  }
});

const scorchTex = canvasTex(64, (ctx, s) => {
  const c = s / 2;
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.6) * (c - 4);
    const sz = 3 + Math.random() * 8 * (1 - r / c);
    ctx.fillStyle = `rgba(${18 + Math.random() * 20},${12 + Math.random() * 12},${8 + Math.random() * 8},${0.55 + Math.random() * 0.4})`;
    ctx.fillRect(Math.round(c + Math.cos(a) * r - sz / 2), Math.round(c + Math.sin(a) * r - sz / 2), Math.round(sz), Math.round(sz));
  }
});

const calloutCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
function calloutTex(text: string, color: string): { tex: THREE.CanvasTexture; aspect: number } {
  const key = `${text}|${color}`;
  const hit = calloutCache.get(key);
  if (hit) return hit;
  const s = 1.6;
  const c = document.createElement("canvas");
  c.width = Math.ceil(textWidth(text, s) + 12);
  c.height = 30;
  const ctx = c.getContext("2d")!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "rgba(14,10,8,0.72)";
    ctx.fillRect(0, 4, c.width, 22);
    drawText(ctx, text, 6, 6, color, s);
    t.needsUpdate = true;
  };
  draw();
  fontReady.then(draw);
  const out = { tex: t, aspect: c.width / c.height };
  calloutCache.set(key, out);
  return out;
}

const gearTex = canvasTex(128, (ctx, s) => {
  const c = s / 2;
  const teeth = 16;
  ctx.beginPath();
  for (let k = 0; k < teeth * 2; k++) {
    const a0 = (k / (teeth * 2)) * Math.PI * 2;
    const a1 = ((k + 1) / (teeth * 2)) * Math.PI * 2;
    const r = k % 2 ? c - 4 : c - 11;
    ctx.lineTo(c + Math.cos(a0) * r, c + Math.sin(a0) * r);
    ctx.lineTo(c + Math.cos(a1) * r, c + Math.sin(a1) * r);
  }
  ctx.closePath();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(20,14,8,0.85)";
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#f0c860";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, c - 22, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(240,200,96,0.6)";
  ctx.stroke();
});

const runeTex = canvasTex(128, (ctx, s) => {
  const c = s / 2;
  ctx.fillStyle = "rgba(60,10,80,0.45)";
  ctx.beginPath();
  ctx.arc(c, c, c - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(10,0,16,0.9)";
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#c070ff";
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 5; k++) {
    const a = (k * 4 * Math.PI) / 5 - Math.PI / 2;
    ctx.lineTo(c + Math.cos(a) * (c - 12), c + Math.sin(a) * (c - 12));
  }
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e0b0ff";
  ctx.stroke();
  ctx.fillStyle = "#e8d8f0";
  ctx.beginPath();
  ctx.arc(c, c - 4, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(c - 7, c + 4, 14, 8);
  ctx.fillStyle = "#1a0826";
  ctx.beginPath();
  ctx.arc(c - 5, c - 5, 3.5, 0, Math.PI * 2);
  ctx.arc(c + 5, c - 5, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(c - 4, c + 6, 2, 6);
  ctx.fillRect(c + 2, c + 6, 2, 6);
});

const crackTex = canvasTex(128, (ctx, s) => {
  const c = s / 2;
  ctx.lineCap = "round";
  const branch = (x: number, y: number, a: number, len: number, w: number) => {
    let px = x;
    let py = y;
    const steps = 5;
    for (let k = 0; k < steps; k++) {
      const na = a + (Math.random() - 0.5) * 0.7;
      const nx = px + Math.cos(na) * (len / steps);
      const ny = py + Math.sin(na) * (len / steps);
      ctx.lineWidth = w * (1 - k / steps) + 1;
      ctx.strokeStyle = "rgba(24,16,10,0.9)";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      if (k === 2 && Math.random() < 0.6) branch(nx, ny, na + (Math.random() < 0.5 ? 0.6 : -0.6), len * 0.35, w * 0.5);
      px = nx;
      py = ny;
    }
  };
  for (let k = 0; k < 9; k++) branch(c, c, (k / 9) * Math.PI * 2 + Math.random() * 0.3, c - 6, 5);
  ctx.fillStyle = "rgba(24,16,10,0.85)";
  ctx.beginPath();
  ctx.arc(c, c, 9, 0, Math.PI * 2);
  ctx.fill();
});

const frostTex = canvasTex(128, (ctx, s) => {
  const c = s / 2;
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(10,30,60,0.6)";
  ctx.beginPath();
  ctx.arc(c, c, c - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#bfe8ff";
  ctx.stroke();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = c + Math.cos(a) * (c - 6);
    const y = c + Math.sin(a) * (c - 6);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = "#e8f8ff";
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(0, -4);
    ctx.lineTo(4, 0);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#1a3050";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
});

const emblemTex = canvasTex(128, (ctx, s) => {
  const c = s / 2;
  ctx.fillStyle = "rgba(255,220,120,0.18)";
  ctx.beginPath();
  ctx.arc(c, c, c - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(40,24,6,0.8)";
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffd860";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c, c - 30); ctx.lineTo(c + 24, c - 20); ctx.lineTo(c + 20, c + 10); ctx.lineTo(c, c + 30); ctx.lineTo(c - 20, c + 10); ctx.lineTo(c - 24, c - 20); ctx.closePath();
  ctx.fillStyle = "#f0e0b0"; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = "#3a2408"; ctx.stroke();
  ctx.fillStyle = "#40c040";
  ctx.fillRect(c - 4, c - 16, 8, 30);
  ctx.fillRect(c - 15, c - 5, 30, 8);
});

const swirlTex = canvasTex(128, (ctx, s) => {
  const c = s / 2;
  ctx.lineCap = "round";
  for (let arm = 0; arm < 4; arm++) {
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const f = k / 40;
      const a = arm * (Math.PI / 2) + f * Math.PI * 2.2;
      const r = (1 - f) * (c - 6) + 4;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(30,20,12,0.75)";
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(220,200,160,0.85)";
    ctx.stroke();
  }
});

const pillarTex = canvasTex(64, (ctx, s) => {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, "rgba(255,240,160,0)");
  g.addColorStop(0.5, "rgba(255,220,110,0.55)");
  g.addColorStop(1, "rgba(255,250,210,0.95)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  for (let k = 0; k < 10; k++) {
    ctx.fillStyle = "rgba(255,255,230,0.8)";
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 6);
  }
});

const slashTex = canvasTex(64, (ctx, s) => {
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(s / 2, s * 0.95, s * 0.7, Math.PI * 1.2, Math.PI * 1.8);
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(160,200,255,0.6)";
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();
});

const talentUrls = import.meta.glob("../../assets/ui/talents/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const talentTex = new Map<string, THREE.Texture>();
function talentTexture(id: string): THREE.Texture | null {
  const hit = talentTex.get(id);
  if (hit) return hit;
  const url = Object.entries(talentUrls).find(([p]) => p.endsWith(`/${id}.png`))?.[1];
  if (!url) return null;
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  talentTex.set(id, t);
  return t;
}

const missTex = textTex("MISS", "#e0e0e0");
const koTex = textTex("K.O.!", "#ff5a3a");
const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
const blockTex = textTex("BLOCK", "#9fd8ff");
const parryTex = textTex("PARRY!", "#ffe070");
const fallTex = textTex("FALL!", "#ffb050");
const critTex = textTex("CRIT!", "#ffe040");
const rankTexes = ["VETERAN", "ELITE", "HEROIC"].map((t) => textTex(t, "#ffcc33"));

interface Fx {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  tick: (k: number, dt: number) => void;
}

export class CombatFx implements FxHost {
  readonly root = new THREE.Group();
  private items: Fx[] = [];
  private projViews = new Map<number, THREE.Sprite>();
  shake = 0;

  world?: World;
  private banners: THREE.Group[] = [];

  constructor(readonly teamColors: THREE.Color[]) {}

  add(obj: THREE.Object3D, dur: number, tick: (k: number, dt: number) => void): void {
    if (!obj.parent) this.root.add(obj);
    this.items.push({ obj, t: 0, dur, tick });
  }

  private ribbons = new Map<string, Ribbon>();
  handTrail(key: string, a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, tex = FX.streak, life = 0.2): void {
    let r = this.ribbons.get(key);
    if (!r) {
      r = new Ribbon(tex, color, life);
      this.ribbons.set(key, r);
      this.root.add(r.mesh);
    }
    r.push(a, b);
  }

  private makeBanner(team: number): THREE.Group {
    const g = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x6a4424, flatShading: true });
    const gold = new THREE.MeshLambertMaterial({ color: 0xc8a040, flatShading: true });
    const cloth = new THREE.MeshLambertMaterial({ color: dyeColor(this.teamColors[team]), side: THREE.DoubleSide, flatShading: true });
    const trim = new THREE.MeshLambertMaterial({ color: 0xd8c890, side: THREE.DoubleSide, flatShading: true });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), wood);
    pole.position.y = 1.7;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 3.05;
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), gold);
    tip.position.y = 3.5;
    const shape = new THREE.Shape();
    shape.moveTo(-0.6, 0);
    shape.lineTo(0.6, 0);
    shape.lineTo(0.6, -1.5);
    shape.lineTo(0, -1.15);
    shape.lineTo(-0.6, -1.5);
    shape.closePath();
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), cloth);
    flag.position.y = 3.0;
    flag.name = "flag";
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.12), trim);
    band.position.set(0, 2.88, 0.01);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.2, 7), new THREE.MeshLambertMaterial({ color: 0x5a5048, flatShading: true }));
    base.position.y = 0.1;
    g.add(pole, bar, tip, flag, band, base);
    g.visible = false;
    this.root.add(g);
    return g;
  }

  syncBanners(world: World, time: number): void {
    world.teams.forEach((ts, team) => {
      const b = ts.banner;
      const g = (this.banners[team] ??= this.makeBanner(team));
      const on = !!b && world.time < b.until;
      g.visible = on;
      if (!on) return;
      const y = world.groundY(b!.x, b!.z);
      const left = b!.until - world.time;
      const drop = left < 1 ? (1 - left) * 1.2 : 0;
      g.position.set(b!.x, y - drop, b!.z);
      g.rotation.y = team === 0 ? 0.4 : -0.4;
      const flag = g.getObjectByName("flag")!;
      flag.rotation.y = Math.sin(time * 2.2 + team) * 0.25;
      flag.rotation.x = Math.sin(time * 3.1 + team) * 0.05;
    });
  }

  private number(x: number, y: number, z: number, amount: number, color: string, big: boolean, mul = 1): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTex(String(amount), color), transparent: true, depthTest: false }));
    s.renderOrder = 31;
    const base = (big ? 1.5 : 1.0) * mul;
    const vx = (Math.random() - 0.5) * 1.2;
    s.position.set(x, y + 1.6, z);
    this.root.add(s);
    this.items.push({
      obj: s, t: 0, dur: big ? 0.9 : 0.7,
      tick: (k, dt) => {
        const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.8 : 1;
        s.scale.set(2.4 * base * pop, 0.6 * base * pop, 1);
        s.position.y += dt * (2.6 * (1 - k));
        s.position.x += vx * dt;
        s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      },
    });
  }

  private sparks(x: number, y: number, z: number, dx: number, dz: number, color: THREE.ColorRepresentation, n: number, speed: number): void {
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    for (let i = 0; i < n; i++) {
      const s = this.sprite(streakTex, color, true, 1);
      const a = (Math.random() - 0.5) * 1.6;
      const vx = (ux * Math.cos(a) - uz * Math.sin(a)) * speed * (0.6 + Math.random() * 0.6);
      const vz = (ux * Math.sin(a) + uz * Math.cos(a)) * speed * (0.6 + Math.random() * 0.6);
      let vy = (Math.random() * 0.8 + 0.2) * speed * 0.6;
      s.position.set(x, y, z);
      const len = 0.35 + Math.random() * 0.3;
      this.items.push({
        obj: s, t: 0, dur: 0.18 + Math.random() * 0.12,
        tick: (k, dt) => {
          s.position.x += vx * dt;
          s.position.y += vy * dt;
          s.position.z += vz * dt;
          vy -= 18 * dt;
          s.scale.set(len * (1 - k * 0.5), 0.12, 1);
          s.material.rotation = Math.atan2(vy, Math.hypot(vx, vz) * Math.sign(vx || 1));
          s.material.opacity = 1 - k;
        },
      });
    }
  }

  private debris(x: number, y: number, z: number, colors: THREE.ColorRepresentation[], n: number, size: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(chunkGeo, new THREE.MeshLambertMaterial({ color: colors[i % colors.length], transparent: true }));
      const sz = size * (0.5 + Math.random() * 0.8);
      m.scale.setScalar(sz);
      m.position.set(x, y + 0.5, z);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.root.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      let vx = Math.cos(a) * sp;
      let vz = Math.sin(a) * sp;
      let vy = speed * (0.8 + Math.random() * 0.8);
      const spin = (Math.random() - 0.5) * 20;
      const floor = y + sz / 2;
      this.items.push({
        obj: m, t: 0, dur: 1.4 + Math.random() * 0.4,
        tick: (k, dt) => {
          vy -= 22 * dt;
          m.position.x += vx * dt;
          m.position.y += vy * dt;
          m.position.z += vz * dt;
          if (m.position.y < floor) {
            m.position.y = floor;
            vy = Math.abs(vy) * 0.35;
            vx *= 0.6;
            vz *= 0.6;
          } else {
            m.rotation.x += spin * dt;
            m.rotation.z += spin * 0.7 * dt;
          }
          (m.material as THREE.MeshLambertMaterial).opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        },
      });
    }
  }

  private soul(x: number, y: number, z: number, color: THREE.Color): void {
    const s = this.sprite(glowTex, color.clone().lerp(new THREE.Color(1, 1, 1), 0.5), true, 1);
    s.position.set(x, y + 1.2, z);
    this.items.push({
      obj: s, t: 0, dur: 1.4,
      tick: (k, dt) => {
        s.position.y += dt * 3.5 * (1 - k * 0.5);
        s.position.x += Math.sin(k * 14) * dt * 0.8;
        s.scale.setScalar(1.6 * (1 - k * 0.6));
        s.material.opacity = 1 - k;
      },
    });
  }

  trail(x: number, y: number, z: number, team: number, size: number): void {
    const c = this.teamColors[team].clone().lerp(new THREE.Color(1, 1, 1), 0.4);
    const s = this.sprite(glowTex, c, true, 0.6);
    s.position.set(x, y, z);
    this.items.push({
      obj: s, t: 0, dur: 0.25,
      tick: (k) => {
        s.scale.set(size * (1 - k * 0.5), size * 1.6 * (1 - k * 0.3), 1);
        s.material.opacity = 0.5 * (1 - k);
      },
    });
  }

  dust(x: number, y: number, z: number, size: number, n = 2, spread = 0.8, color: THREE.ColorRepresentation = 0xd8ccb0): void {
    for (let i = 0; i < n; i++) {
      const s = this.sprite(puffTex, color, false, 0.7);
      const a = Math.random() * Math.PI * 2;
      const vx = Math.cos(a) * spread * (0.4 + Math.random() * 0.6);
      const vz = Math.sin(a) * spread * (0.4 + Math.random() * 0.6);
      s.position.set(x + vx * 0.1, y + 0.15, z + vz * 0.1);
      const sz = size * (0.7 + Math.random() * 0.5);
      this.items.push({
        obj: s, t: 0, dur: 0.45 + Math.random() * 0.2,
        tick: (k, dt) => {
          s.position.x += vx * dt * (1 - k);
          s.position.z += vz * dt * (1 - k);
          s.position.y += dt * 0.5;
          s.scale.setScalar(sz * (0.5 + k));
          s.material.opacity = 0.6 * (1 - k);
        },
      });
    }
  }

  private pending: { at: number; run: () => void }[] = [];
  private clock = 0;

  slash(x: number, y: number, z: number, facing: number, team: number, combo: number, reach: number, delay = 0): void {
    if (delay > 0) {
      this.pending.push({ at: this.clock + delay, run: () => this.slash(x, y, z, facing, team, combo, reach) });
      return;
    }
    const arc = combo === 2 ? Math.PI * 1.1 : Math.PI * 0.8;
    const geo = new THREE.RingGeometry(reach * 0.45, reach, 14, 1, -arc / 2, arc);
    const pos = geo.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const ang = Math.atan2(pos.getY(i), pos.getX(i));
      const t = (ang + arc / 2) / arc;
      const r = Math.hypot(pos.getX(i), pos.getY(i)) / reach;
      const k = Math.pow(combo % 2 ? 1 - t : t, 1.5) * r;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const c = this.teamColors[team].clone().lerp(new THREE.Color(1, 1, 1), 0.65);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: c, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    const tilt = combo === 1 ? 0.35 : combo === 2 ? -0.25 : 0.15;
    m.rotation.order = "YXZ";
    m.rotation.set(-Math.PI / 2 + tilt, facing - Math.PI / 2, 0);
    m.position.set(x, y + (combo === 2 ? 0.9 : 1.2), z);
    this.root.add(m);
    this.items.push({
      obj: m, t: 0, dur: 0.16,
      tick: (k) => {
        (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        m.scale.setScalar(0.85 + k * 0.25);
      },
    });
  }

  private sprite(tex: THREE.Texture, color: THREE.ColorRepresentation, additive = true, opacity = 1): THREE.Sprite {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.root.add(s);
    return s;
  }

  private ring(x: number, y: number, z: number, color: THREE.Color, radius: number, dur: number, width = 0.35): void {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.2, z);
    this.root.add(m);
    void width;
    this.items.push({
      obj: m, t: 0, dur,
      tick: (k) => {
        const r = 0.3 + (radius - 0.3) * (1 - (1 - k) * (1 - k));
        m.scale.setScalar(r);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      },
    });
  }

  private burst(x: number, y: number, z: number, tex: THREE.Texture, color: THREE.ColorRepresentation, n: number, size: number, dur: number, spread: number, additive: boolean, rise = 0.5): void {
    for (let i = 0; i < n; i++) {
      const s = this.sprite(tex, color, additive, 0.9);
      const a = Math.random() * Math.PI * 2;
      const v = spread * (0.5 + Math.random() * 0.5);
      const vx = Math.cos(a) * v;
      const vz = Math.sin(a) * v;
      const vy = rise * (0.5 + Math.random());
      s.position.set(x, y, z);
      const sz = size * (0.7 + Math.random() * 0.6);
      this.items.push({
        obj: s, t: 0, dur: dur * (0.7 + Math.random() * 0.5),
        tick: (k, dt) => {
          s.position.x += vx * dt * (1 - k);
          s.position.y += vy * dt;
          s.position.z += vz * dt * (1 - k);
          s.scale.setScalar(sz * (0.6 + k * 0.8));
          s.material.opacity = 0.9 * (1 - k);
        },
      });
    }
  }

  private flash(x: number, y: number, z: number, tex: THREE.Texture, color: THREE.ColorRepresentation, size: number, dur: number): void {
    const s = this.sprite(tex, color);
    s.position.set(x, y, z);
    s.material.rotation = Math.random() * Math.PI;
    this.items.push({
      obj: s, t: 0, dur,
      tick: (k) => {
        s.scale.setScalar(size * (0.5 + k * 0.8));
        s.material.opacity = 1 - k * k;
      },
    });
  }

  private label(x: number, y: number, z: number, tex: THREE.Texture): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.renderOrder = 30;
    s.position.set(x, y + 0.8, z);
    s.scale.set(1.6, 0.4, 1);
    this.root.add(s);
    this.items.push({
      obj: s, t: 0, dur: 0.8,
      tick: (k, dt) => {
        s.position.y += dt * 1.2;
        s.material.opacity = 1 - k * k;
      },
    });
  }

  handle(ev: SimEvent): void {
    const sid = "src" in ev ? ev.src : undefined;
    const se = sid !== undefined ? this.world?.getAny(sid) : undefined;
    const sk = se?.hero ? KITS[se.hero.type] : undefined;
    if (ev.type === "act") {
      const pw = se?.hero?.action?.power ?? 1;
      if (se && ev.phase === "fire" && pw > 1.25) this.chargeRelease(ev.x, ev.y, ev.z, ev.dirX, ev.dirZ, pw, sk?.trail ?? 0xfff0b0);
      if (se && sk?.act) sk.act(this, ev, se);
      return;
    }
    if (ev.type !== "hit" && se && sk?.event?.(this, ev, se)) return;
    switch (ev.type) {
      case "hit":
        if (ev.blocked) {
          this.flash(ev.x, ev.y + 0.2, ev.z, glowTex, 0x9fd8ff, 1.4, 0.2);
          this.label(ev.x, ev.y, ev.z, blockTex);
        } else {
          const tgt = ev.id !== undefined ? this.world?.get(ev.id) : undefined;
          const src = ev.src !== undefined ? this.world?.get(ev.src) : undefined;
          const dx = ev.fx !== undefined ? ev.x - ev.fx : Math.random() - 0.5;
          const dz = ev.fz !== undefined ? ev.z - ev.fz : Math.random() - 0.5;
          const heroInvolved = !!tgt?.hero || !!src?.hero;
          const kit = src?.hero ? KITS[src.hero.type] : undefined;
          const custom = !!kit?.hit && kit.hit(this, ev, src!, dx, dz);
          if (!custom) {
            this.flash(ev.x, ev.y + 0.2, ev.z, starTex, 0xffffff, ev.big ? 2.4 : 1.2, ev.big ? 0.22 : 0.14);
            const sc = src ? this.teamColors[src.team].clone().lerp(new THREE.Color(1, 0.9, 0.6), 0.6) : new THREE.Color(1, 0.9, 0.6);
            this.sparks(ev.x, ev.y + 0.2, ev.z, dx, dz, sc, ev.big ? 9 : heroInvolved ? 5 : 3, ev.big ? 9 : 6);
          }
          if (ev.big && custom) {
            this.shake = Math.max(this.shake, 0.22);
          } else if (ev.big) {
            this.burst(ev.x, ev.y, ev.z, starTex, 0xffd080, 5, 0.4, 0.3, 4, true, 1);
            this.ring(ev.x, ev.y - 0.9, ev.z, new THREE.Color(1, 0.9, 0.7), 1.8, 0.25);
            this.shake = Math.max(this.shake, 0.22);
          } else if (tgt?.hero) {
            this.shake = Math.max(this.shake, 0.08);
          }
          if (ev.crit) {
            this.label(ev.x, ev.y + 1.3, ev.z, critTex);
            emit(this, { tex: FX.burst, n: 1, x: ev.x, y: ev.y + 0.4, z: ev.z, color: 0xffe070, size: [2.6, 2.6], grow: 1.3, life: [0.16, 0.16], speed: [0, 0], additive: true, order: 8 });
            emit(this, { tex: FX.twinkle, n: 6, x: ev.x, y: ev.y + 0.4, z: ev.z, size: [0.35, 0.55], life: [0.3, 0.45], speed: [4, 7], gravity: 8, additive: true });
            this.shake = Math.max(this.shake, 0.3);
          }
          if (ev.amount && (tgt?.hero || tgt?.structure || src?.hero)) {
            const color = ev.crit ? "#ffe040" : tgt?.hero ? "#ff6a4a" : ev.big ? "#ffd84a" : "#ffffff";
            this.number(ev.x, ev.y, ev.z, ev.amount, color, ev.big || !!tgt?.hero, ev.crit ? 1.5 : 1);
          }
        }
        break;
      case "miss":
        this.label(ev.x, ev.y, ev.z, missTex);
        break;
      case "rankUp":
        this.ring(ev.x, ev.y + 0.05, ev.z, new THREE.Color(1, 0.8, 0.2), 1.6, 0.4);
        this.burst(ev.x, ev.y + 1.0, ev.z, starTex, 0xffcc33, 6, 0.35, 0.5, 1.5, true, 1.2);
        this.label(ev.x, ev.y + 1.2, ev.z, rankTexes[Math.min(3, ev.rank) - 1]);
        break;
      case "death": {
        const c = this.teamColors[ev.team] ?? new THREE.Color(1, 1, 1);
        if (ev.kind === "unit") {
          this.burst(ev.x, ev.y + 0.6, ev.z, puffTex, 0xcfc8bc, 6, 0.9, 0.6, 1.5, false, 0.8);
          this.flash(ev.x, ev.y + 0.7, ev.z, glowTex, c, 1.8, 0.25);
          this.debris(ev.x, ev.y, ev.z, [c, 0x6a5040], 3, 0.14, 4);
        } else if (ev.kind === "hero") {
          this.flash(ev.x, ev.y + 1.2, ev.z, starTex, 0xffffff, 5, 0.3);
          this.flash(ev.x, ev.y + 1.2, ev.z, glowTex, c, 7, 0.6);
          this.ring(ev.x, ev.y, ev.z, c, 5, 0.5);
          this.ring(ev.x, ev.y, ev.z, new THREE.Color(1, 1, 1), 3, 0.3);
          this.burst(ev.x, ev.y + 0.4, ev.z, puffTex, 0xcfc8bc, 10, 1.4, 0.9, 3, false, 0.6);
          this.debris(ev.x, ev.y, ev.z, [c, 0x8a8a90, 0x6a5040], 8, 0.2, 6);
          this.soul(ev.x, ev.y, ev.z, c);
          this.label(ev.x, ev.y + 1.6, ev.z, koTex);
          this.shake = Math.max(this.shake, 0.45);
        } else {
          this.debris(ev.x, ev.y, ev.z, [0x8a8580, 0x6a6560, c], ev.kind === "structure" ? 14 : 6, 0.35, 8);
          this.burst(ev.x, ev.y + 1, ev.z, puffTex, 0x8a8078, 16, 2.2, 1.4, 3, false, 1.5);
          this.burst(ev.x, ev.y + 1, ev.z, starTex, 0xffa040, 10, 1.2, 0.6, 5, true, 2);
          this.flash(ev.x, ev.y + 1.2, ev.z, glowTex, c, 6, 0.5);
          this.ring(ev.x, ev.y, ev.z, c, 5, 0.6);
          this.shake = Math.max(this.shake, ev.kind === "structure" ? 0.5 : 0.3);
        }
        break;
      }
      case "slam":
        this.slamFx(ev.x, ev.y, ev.z, ev.radius);
        break;
      case "warcry": {
        const c = this.teamColors[ev.team];
        const hot = new THREE.Color(0xff8a30);
        for (let k = 0; k < 3; k++) this.after(k * 0.12, () => this.ring(ev.x, ev.y + 0.2, ev.z, hot.clone().lerp(c, 0.3), ev.radius, 0.55));
        this.flash(ev.x, ev.y + 2.2, ev.z, starTex, 0xffb060, 4, 0.35);
        this.burst(ev.x, ev.y + 2, ev.z, starTex, 0xff9030, 10, 0.5, 0.6, 3, true, 2.5);
        break;
      }
      case "repair":
        this.repair(ev);
        break;
      case "banner": {
        const c = this.teamColors[ev.team];
        this.ring(ev.x, ev.y, ev.z, c, 2.5, 0.4);
        this.burst(ev.x, ev.y + 0.2, ev.z, puffTex, 0xb09878, 8, 0.9, 0.6, 2, false, 0.6);
        this.shake = Math.max(this.shake, 0.15);
        break;
      }
      case "rally": {
        this.decal(emblemTex, ev.x, ev.y, ev.z, ev.radius, 1.4, 0.25, 0.6);
        this.flash(ev.x, ev.y + 2, ev.z, glowTex, 0xffe8a0, 5, 0.6);
        this.burst(ev.x, ev.y + 1, ev.z, plusTex, 0xffffff, 12, 1, 1.2, ev.radius * 0.7, false, 1.2);
        break;
      }
      case "pulse":
        this.decal(frostTex, ev.x, ev.y, ev.z, ev.radius, 0.6, 0.6, 0);
        this.burst(ev.x, ev.y + 0.4, ev.z, starTex, 0xbfe8ff, 8, 0.4, 0.5, ev.radius * 0.8, true, 0.6);
        break;
      case "heal":
        emit(this, { tex: HERALD.heal, n: 2, x: ev.x, y: ev.y + 1.4, z: ev.z, size: [0.4, 0.55], life: [0.8, 1.1], speed: [0.2, 0.6], up: [1, 1.6], jitter: 0.8 });
        break;
      case "build":
        break;
      case "telegraph": {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(ev.x, ev.y + 0.14, ev.z);
        this.root.add(m);
        const r = ev.radius;
        this.items.push({
          obj: m, t: 0, dur: ev.seconds + 0.25,
          tick: (k) => {
            const u = Math.min(1, k * (ev.seconds + 0.25) / 0.2);
            m.scale.setScalar(r * u);
            m.rotation.z = -k * 2;
            (m.material as THREE.MeshBasicMaterial).opacity = k > 0.85 ? (1 - k) / 0.15 : 0.95;
          },
        });
        this.after(ev.seconds, () => {
          this.flash(ev.x, ev.y + 1, ev.z, glowTex, 0xc060ff, r * 2.2, 0.35);
          this.burst(ev.x, ev.y + 0.5, ev.z, puffTex, 0x6a2a8a, 12, 1.2, 0.8, r, false, 1.4);
        });
        break;
      }
      case "parry":
        this.flash(ev.x, ev.y + 0.3, ev.z, glowTex, 0xfff4b0, 3, 0.25);
        this.label(ev.x, ev.y + 0.3, ev.z, parryTex);
        this.shake = Math.max(this.shake, 0.25);
        break;
      case "blink":
        this.burst(ev.x, ev.y + 0.8, ev.z, puffTex, 0x3a3a44, 22, 2.2, 1.6, 2.4, false, 0.5);
        this.burst(ev.x, ev.y + 1.4, ev.z, puffTex, 0x6a6a78, 12, 1.6, 1.3, 1.6, false, 0.9);
        this.flash(ev.x, ev.y + 1, ev.z, glowTex, 0x9a90c0, 3, 0.2);
        break;
      case "cannonWarn":
        this.cannonWarn(ev.x, ev.y, ev.z, ev.radius, ev.seconds);
        break;
      case "cannonHit":
        this.cannonHit(ev.x, ev.y, ev.z, ev.radius);
        break;
      case "callout": {
        const col = ev.team === 0 ? "#b8ccff" : ev.team === 1 ? "#ffc0b8" : "#fff0c0";
        const { tex, aspect } = calloutTex(ev.text, col);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        s.renderOrder = 31;
        const h = 0.62;
        s.scale.set(h * aspect, h, 1);
        s.position.set(ev.x, ev.y + 4.3, ev.z);
        s.userData.owner = ev.owner;
        this.root.add(s);
        this.items.push({
          obj: s, t: 0, dur: 1.8,
          tick: (k, dt) => {
            s.position.y += dt * 0.5;
            s.material.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
          },
        });
        break;
      }
      case "reach":
        if (ev.style === "afterimage") this.afterimage(ev.x, ev.y, ev.z, ev.tx, ev.tz, ev.team);
        else wardenSlap(this, ev.x, ev.y, ev.z, ev.tx, ev.tz, ev.hit);
        break;
      case "levelup": {
        const col = ev.level >= 5 ? "#ffd040" : "#fff0b0";
        this.pillar(ev.x, ev.y, ev.z);
        this.burst(ev.x, ev.y + 1.5, ev.z, starTex, 0xffe080, 16, 0.7, 1, 2.4, true, 4);
        const { tex, aspect } = calloutTex(`LEVEL ${ev.level}!`, col);
        this.floatSprite(tex, aspect, ev.x, ev.y + 5, ev.z, 0.8, 1.6);
        break;
      }
      case "learned": {
        const { tex, aspect } = calloutTex(ev.name, "#ffe890");
        this.floatSprite(tex, aspect, ev.x, ev.y + 4.4, ev.z, 0.65, 2.2);
        const it = talentTexture(ev.icon);
        if (it) this.floatSprite(it, 1, ev.x, ev.y + 5.6, ev.z, 1.5, 2.2);
        this.burst(ev.x, ev.y + 2.5, ev.z, starTex, 0xffd060, 10, 0.5, 0.8, 1.2, true, 1.5);
        break;
      }
      case "chain":
        this.lightning(ev.pts);
        break;
      case "pull":
        this.decal(swirlTex, ev.x, ev.y, ev.z, ev.radius, 0.55, 0, -7);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          this.sparks(ev.x + Math.cos(a) * ev.radius, ev.y + 0.3, ev.z + Math.sin(a) * ev.radius, -Math.cos(a), -Math.sin(a), 0xd8c8a0, 1, ev.radius * 2.2);
        }
        break;
      case "shieldBreak": {
        for (let k = 0; k < 12; k++) {
          const m = new THREE.Mesh(shardGeo, new THREE.MeshLambertMaterial({ color: ev.burst ? 0x7a5a30 : 0xbfe0ff, emissive: ev.burst ? 0x201008 : 0x203850, transparent: true, flatShading: true }));
          const a = Math.random() * Math.PI * 2;
          const sp = 4 + Math.random() * 4;
          let vy = 3 + Math.random() * 3;
          m.position.set(ev.x, ev.y + 1.2, ev.z);
          this.root.add(m);
          this.items.push({
            obj: m, t: 0, dur: 0.8,
            tick: (q, dt) => {
              vy -= 14 * dt;
              m.position.x += Math.cos(a) * sp * dt;
              m.position.z += Math.sin(a) * sp * dt;
              m.position.y += vy * dt;
              m.rotation.x += dt * 9;
              (m.material as THREE.MeshLambertMaterial).opacity = 1 - q;
            },
          });
        }
        if (ev.burst) this.slamFx(ev.x, ev.y, ev.z, 3);
        this.flash(ev.x, ev.y + 1.2, ev.z, glowTex, ev.burst ? 0xc8a060 : 0xbfe8ff, 3, 0.25);
        break;
      }
      case "charge":
        this.burst(ev.x, ev.y + 0.3, ev.z, puffTex, 0xb09878, 10, 1.2, 0.7, 2, false, 0.4);
        this.shake = Math.max(this.shake, 0.2);
        break;
      case "shove":
        this.burst(ev.x, ev.y + 0.9, ev.z, puffTex, 0xd8ccb0, 6, 0.9, 0.35, 2.2, false, 0.3);
        if (ev.team >= 0) {
          this.flash(ev.x, ev.y + 1, ev.z, starTex, 0xffffff, 2.2, 0.18);
          this.shake = Math.max(this.shake, 0.2);
        }
        break;
      case "fall":
        this.burst(ev.x, ev.y + 0.2, ev.z, puffTex, 0xb09878, 10, 1.2, 0.7, 2.4, false, 0.5);
        this.debris(ev.x, ev.y, ev.z, [0x7a6a52, 0x5a4c3a], 5, 0.18, 3);
        this.label(ev.x, ev.y + 1.4, ev.z, fallTex);
        this.shake = Math.max(this.shake, 0.3);
        break;
      case "squad": {
        const c = this.teamColors[ev.team];
        this.burst(ev.x, ev.y + 0.3, ev.z, puffTex, 0xd8c8a8, 12, 1.4, 0.8, 2.6, false, 0.7);
        this.ring(ev.x, ev.y, ev.z, c, 3, 0.5);
        break;
      }
      case "relic": {
        if (ev.state === "taken" || ev.state === "dropped") {
          this.flash(ev.x, ev.y + 1.2, ev.z, starTex, 0xffd060, 3.5, 0.3);
          this.burst(ev.x, ev.y + 1, ev.z, starTex, 0xffc040, 10, 0.6, 0.6, 3, true, 1.2);
        } else if (ev.state === "shrined") {
          const c = (this.teamColors[ev.team] ?? new THREE.Color(1, 1, 1)).clone().lerp(new THREE.Color(0xffd060), 0.5);
          this.flash(ev.x, ev.y + 4, ev.z, starTex, 0xffe080, 8, 0.5);
          this.burst(ev.x, ev.y + 4, ev.z, starTex, 0xffc040, 24, 0.9, 1.3, 4, true, 2.5);
          this.ring(ev.x, ev.y, ev.z, c, 6, 0.8);
          this.ring(ev.x, ev.y, ev.z, new THREE.Color(0xffd060), 3.5, 0.6);
          this.shake = Math.max(this.shake, 0.35);
        } else if (ev.state === "stolen") {
          this.flash(ev.x, ev.y + 4, ev.z, starTex, 0xffffff, 6, 0.4);
          this.burst(ev.x, ev.y + 3, ev.z, puffTex, 0x6a5a4a, 16, 1.2, 0.9, 4, false, 1.5);
          this.debris(ev.x, ev.y + 3, ev.z, [0xc89a40, 0x8a7a68], 8, 0.22, 5);
          this.shake = Math.max(this.shake, 0.4);
        } else if (ev.state === "home") {
          this.burst(ev.x, ev.y + 1.5, ev.z, starTex, 0xffd060, 12, 0.6, 1, 2, true, 2);
        }
        break;
      }
    }
  }

  private cannonWarn(x: number, y: number, z: number, radius: number, seconds: number): void {
    const decal = (tex: THREE.Texture, lift: number, opacity: number, additive: boolean) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y + lift, z);
      this.root.add(m);
      return m;
    };
    const ring = decal(targetTex, 0.12, 0.95, false);
    const fill = decal(fillTex, 0.1, 0.35, true);
    this.items.push({
      obj: ring, t: 0, dur: seconds,
      tick: (k) => {
        const intro = Math.min(1, k * seconds / 0.18);
        ring.scale.setScalar(radius * (1.6 - 0.6 * intro));
        ring.rotation.z = k * seconds * 1.4;
        const pulse = 0.5 + 0.5 * Math.sin(k * seconds * (6 + k * 18));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.35 * pulse;
      },
    });
    this.items.push({
      obj: fill, t: 0, dur: seconds,
      tick: (k) => {
        fill.scale.setScalar(Math.max(0.01, radius * k));
        (fill.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.35 * k;
      },
    });
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 12),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(x, y + 0.14, z);
    this.root.add(shadow);
    const fly = Math.min(1.3, seconds * 0.6);
    this.items.push({
      obj: shadow, t: 0, dur: seconds,
      tick: (k) => {
        const f = Math.max(0, (k * seconds - (seconds - fly)) / fly);
        (shadow.material as THREE.MeshBasicMaterial).opacity = f * 0.55;
        shadow.scale.setScalar(0.4 + f * 0.8);
      },
    });
    const side = Math.random() < 0.5 ? -1 : 1;
    const sx = x + side * 26;
    const sz = z - 14 + Math.random() * 6;
    this.after(seconds - fly, () => {
      const ball = new THREE.Mesh(ballGeo, ballMat);
      this.root.add(ball);
      let puffT = 0;
      this.items.push({
        obj: ball, t: 0, dur: fly,
        tick: (k, dt) => {
          ball.position.set(sx + (x - sx) * k, y + 0.5 + 22 * (1 - k) * (0.35 + 0.65 * (1 - k)) + 3 * Math.sin(k * Math.PI) * (1 - k), sz + (z - sz) * k);
          ball.rotation.x += dt * 9;
          ball.rotation.z += dt * 5;
          puffT -= dt;
          if (puffT <= 0) {
            puffT = 0.035;
            const p = this.sprite(puffTex, 0x4a4440, false, 0.7);
            p.position.copy(ball.position);
            const sz0 = 0.6 + Math.random() * 0.3;
            this.items.push({ obj: p, t: 0, dur: 0.7, tick: (q) => { p.scale.setScalar(sz0 * (1 + q * 1.5)); p.material.opacity = 0.6 * (1 - q); } });
          }
        },
      });
    });
  }

  private decal(tex: THREE.Texture, x: number, y: number, z: number, radius: number, dur: number, grow: number, spin: number): void {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(x, y + 0.12, z);
    this.root.add(m);
    const rz = m.rotation.z;
    this.items.push({
      obj: m, t: 0, dur,
      tick: (k) => {
        m.scale.setScalar(radius * Math.min(1, grow > 0 ? k * dur / grow : 1));
        m.rotation.z = rz + k * spin;
        (m.material as THREE.MeshBasicMaterial).opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      },
    });
  }

  private slamFx(x: number, y: number, z: number, radius: number): void {
    this.decal(crackTex, x, y, z, radius * 1.05, 1.8, 0.08, 0);
    this.burst(x, y + 0.2, z, puffTex, 0xb09878, 10 + Math.round(radius * 2), 1.2, 0.8, radius * 1.1, false, 0.6);
    this.debris(x, y, z, [0x7a6a52, 0x5a4c3a, 0x8a7a66], Math.round(radius * 2), 0.2 + radius * 0.03, 3 + radius);
    if (radius >= 4.5) {
      const spikes = Math.round(radius * 1.6);
      for (let k = 0; k < spikes; k++) {
        const a = (k / spikes) * Math.PI * 2 + Math.random() * 0.4;
        const d = radius * (0.45 + Math.random() * 0.5);
        const sx = x + Math.cos(a) * d;
        const sz = z + Math.sin(a) * d;
        const h = 0.8 + Math.random() * 1.1;
        const rock = new THREE.Mesh(new THREE.ConeGeometry(0.35 + Math.random() * 0.2, h, 5), new THREE.MeshLambertMaterial({ color: 0x8a7a66, flatShading: true, transparent: true }));
        rock.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
        const gy = this.world ? this.world.groundY(sx, sz) : y;
        this.root.add(rock);
        this.items.push({
          obj: rock, t: 0, dur: 1.6,
          tick: (k2) => {
            const up = k2 < 0.12 ? k2 / 0.12 : k2 > 0.75 ? 1 - (k2 - 0.75) / 0.25 : 1;
            rock.position.set(sx, gy - h / 2 + h * up, sz);
          },
        });
      }
    }
    this.shake = Math.max(this.shake, radius > 4 ? 0.6 : 0.3);
  }

  private repair(ev: Extract<SimEvent, { type: "repair" }>): void {
    const gear = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: gearTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    gear.rotation.x = -Math.PI / 2;
    gear.position.set(ev.x, ev.y + 0.12, ev.z);
    this.root.add(gear);
    this.items.push({
      obj: gear, t: 0, dur: 1.1,
      tick: (k) => {
        gear.scale.setScalar(ev.radius * (0.35 + 0.65 * Math.min(1, k * 4)));
        gear.rotation.z = k * 2.5;
        (gear.material as THREE.MeshBasicMaterial).opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      },
    });
    const slam = hammerMesh();
    slam.position.set(ev.x + 0.6, ev.y, ev.z);
    slam.scale.setScalar(1.3);
    this.root.add(slam);
    this.items.push({
      obj: slam, t: 0, dur: 0.45,
      tick: (k) => {
        slam.rotation.z = k < 0.4 ? 1.4 * (1 - k / 0.4) : 0;
        slam.visible = k < 0.9;
      },
    });
    this.after(0.18, () => {
      this.sparks(ev.x + 1.2, ev.y + 0.3, ev.z, 1, 0, 0xffd070, 6, 7);
      this.sparks(ev.x + 1.2, ev.y + 0.3, ev.z, -1, 0, 0xffd070, 6, 7);
      this.burst(ev.x + 1.2, ev.y + 0.2, ev.z, puffTex, 0xc8b898, 6, 0.9, 0.5, 1.5, false, 0.4);
      this.shake = Math.max(this.shake, 0.18);
    });
    ev.fixed.forEach((f, n) => {
      for (let p = 0; p < 3; p++) {
        const plank = new THREE.Mesh(plankGeo, woodMat);
        const sx = ev.x;
        const sz = ev.z;
        const ty = f.y + f.h * (0.35 + p * 0.22);
        const spin = (Math.random() - 0.5) * 8;
        const off = (p - 1) * 0.5;
        this.root.add(plank);
        this.items.push({
          obj: plank, t: 0, dur: 1.6 + n * 0.1,
          tick: (k) => {
            const fly = Math.min(1, k / 0.35);
            const x = sx + (f.x + off - sx) * fly;
            const z = sz + (f.z + 1.1 - sz) * fly;
            const y = ev.y + 1 + (ty - ev.y - 1) * fly + Math.sin(fly * Math.PI) * 2;
            plank.position.set(x, y, z);
            plank.rotation.set(fly < 1 ? k * spin : 0, fly < 1 ? k * spin * 0.7 : 0, fly < 1 ? 0 : (p - 1) * 0.25);
            plank.visible = k < 0.92;
          },
        });
      }
      const ham = hammerMesh();
      ham.scale.setScalar(1.2);
      this.root.add(ham);
      let strikes = 0;
      this.items.push({
        obj: ham, t: 0, dur: 1.5 + n * 0.1,
        tick: (k) => {
          const u = Math.max(0, (k * 1.5 - 0.5) / 0.9);
          ham.visible = k * 1.5 > 0.45 && k < 0.95;
          const beat = (u * 3) % 1;
          ham.position.set(f.x + 0.9, f.y + f.h * 0.55, f.z + 1.3);
          ham.rotation.set(0, 0, 0.3 + Math.max(0, 1 - beat * 2.5) * -1.3 + beat * 1.3);
          const hitN = Math.floor(u * 3 + 0.4);
          if (u > 0 && hitN > strikes && strikes < 3) {
            strikes = hitN;
            this.sparks(f.x + 0.3, f.y + f.h * 0.55 + 0.9, f.z + 1.3, -1, 0.5, 0xffe080, 5, 6);
          }
        },
      });
      this.after(0.9 + n * 0.1, () => {
        if (f.amount > 0) this.number(f.x, f.y + f.h - 0.6, f.z, f.amount, "#7dff7a", true);
        this.burst(f.x, f.y + f.h * 0.6, f.z, plusTex, 0xffffff, 6, 0.6, 0.9, 1.6, false, 1.4);
      });
    });
  }

  private floatSprite(tex: THREE.Texture, aspect: number, x: number, y: number, z: number, h: number, dur: number): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    s.renderOrder = 32;
    s.scale.set(h * aspect, h, 1);
    s.position.set(x, y, z);
    this.root.add(s);
    this.items.push({
      obj: s, t: 0, dur,
      tick: (k, dt) => {
        const pop = k < 0.1 ? 1 + (1 - k / 0.1) * 0.5 : 1;
        s.scale.set(h * aspect * pop, h * pop, 1);
        s.position.y += dt * 0.6;
        s.material.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      },
    });
  }

  private pillar(x: number, y: number, z: number): void {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.3, 7, 10, 1, true),
      new THREE.MeshBasicMaterial({ map: pillarTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    );
    m.position.set(x, y + 3.5, z);
    this.root.add(m);
    this.items.push({
      obj: m, t: 0, dur: 1.1,
      tick: (k) => {
        m.scale.set(1 - k * 0.6, 0.3 + Math.min(1, k * 4) * 0.7, 1 - k * 0.6);
        m.rotation.y = k * 4;
        (m.material as THREE.MeshBasicMaterial).opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      },
    });
  }

  private lightning(pts: number[]): void {
    for (let seg = 0; seg + 5 < pts.length; seg += 3) {
      const a = new THREE.Vector3(pts[seg], pts[seg + 1], pts[seg + 2]);
      const b = new THREE.Vector3(pts[seg + 3], pts[seg + 4], pts[seg + 5]);
      const path: THREE.Vector3[] = [a];
      const n = 6;
      for (let k = 1; k < n; k++) {
        const p = a.clone().lerp(b, k / n);
        p.x += (Math.random() - 0.5) * 0.9;
        p.y += (Math.random() - 0.5) * 0.9;
        p.z += (Math.random() - 0.5) * 0.9;
        path.push(p);
      }
      path.push(b);
      const curve = new THREE.CatmullRomCurve3(path, false, "catmullrom", 0);
      for (const [r, col] of [[0.12, 0x6ab0ff], [0.05, 0xffffff]] as const) {
        const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, r, 4, false), new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.root.add(m);
        this.items.push({ obj: m, t: 0, dur: 0.3, tick: (k) => { (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (Math.random() < 0.3 ? 0.4 : 1); } });
      }
      this.flash(b.x, b.y, b.z, starTex, 0xbfe0ff, 1.6, 0.2);
    }
  }

  private afterimage(x: number, y: number, z: number, tx: number, tz: number, team: number): void {
    const c = (this.teamColors[team] ?? new THREE.Color(1, 1, 1)).clone().lerp(new THREE.Color(0.8, 0.9, 1), 0.6);
    const n = 8;
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      this.after(f * 0.18, () => {
        const px = x + (tx - x) * f;
        const pz = z + (tz - z) * f;
        const s = this.sprite(streakTex, c, true, 0.9);
        s.position.set(px, y + 1.2, pz);
        s.material.rotation = Math.atan2(-(tz - z), tx - x);
        this.items.push({ obj: s, t: 0, dur: 0.4, tick: (q) => { s.scale.set(2.2, 0.5, 1); s.material.opacity = 0.9 * (1 - q); } });
        this.flash(px, y + 1.2, pz, glowTex, c, 1.2, 0.25);
      });
    }
  }

  private missileViews = new Map<number, { obj: THREE.Object3D; lastSpike: number }>();

  syncMissiles(world: World): void {
    const seen = new Set<number>();
    for (const m of world.missiles) {
      seen.add(m.id);
      let v = this.missileViews.get(m.id);
      if (!v) {
        const obj = new THREE.Group();
        const spr = (tex: THREE.Texture, size: number, additive = false, color: THREE.ColorRepresentation = 0xffffff) => {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
          sp.scale.setScalar(size);
          obj.add(sp);
          return sp;
        };
        if (m.style === "rivet") {
          spr(ENGINEER.weld, 1.1, true, 0xffb060);
          spr(ENGINEER.rivet, 0.55);
        } else if (m.style === "dagger") {
          spr(RAIDER.knife, 0.9).name = "spin";
          spr(RAIDER.poison, 0.6, false).material.opacity = 0.6;
        } else if (m.style === "slash") {
          const sp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({ map: DUELIST.crescent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
          sp.name = "flat";
          obj.add(sp);
        } else if (m.style === "rock") {
          spr(WARLORD.dust, 1.4).material.opacity = 0.8;
        }
        this.root.add(obj);
        v = { obj, lastSpike: -1 };
        this.missileViews.set(m.id, v);
      }
      const yaw = Math.atan2(m.dirX, m.dirZ);
      v.obj.position.set(m.x, m.y, m.z);
      const flat = v.obj.getObjectByName("flat");
      if (flat) flat.rotation.set(-Math.PI / 2, 0, -yaw + Math.PI);
      const spin = v.obj.getObjectByName("spin") as THREE.Sprite | undefined;
      if (spin) spin.material.rotation = performance.now() / 60;
      if (Math.random() < 0.6) {
        if (m.style === "rivet") emit(this, { tex: FX.twinkle, n: 1, x: m.x, y: m.y, z: m.z, color: 0xffa040, size: [0.25, 0.4], life: [0.2, 0.3], speed: [0.3, 1], gravity: 6, additive: true });
        else if (m.style === "dagger") emit(this, { tex: RAIDER.drop, n: 1, x: m.x, y: m.y, z: m.z, color: 0x80ff60, size: [0.18, 0.26], life: [0.3, 0.5], speed: [0, 0.5], gravity: 10 });
        else if (m.style === "slash") emit(this, { tex: DUELIST.sparkle, n: 1, x: m.x, y: m.y, z: m.z, size: [0.3, 0.45], life: [0.25, 0.4], speed: [0.3, 1], additive: true, jitter: 0.8 });
      }
      if (m.style === "rock" && m.dist - v.lastSpike > 0.6) {
        v.lastSpike = m.dist;
        const gx = m.x + (Math.random() - 0.5) * 0.6;
        const gz = m.z + (Math.random() - 0.5) * 0.6;
        const gy = world.groundY(gx, gz);
        const rock = new THREE.Mesh(spikeGeo, spikeMat);
        const sc = 0.55 + Math.random() * 0.35;
        rock.scale.set(sc, sc * (0.9 + Math.random() * 0.5), sc);
        rock.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
        const hgt = 1.6 * rock.scale.y;
        this.root.add(rock);
        this.items.push({
          obj: rock, t: 0, dur: 1,
          tick: (k) => {
            const up = k < 0.12 ? k / 0.12 : k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
            rock.position.set(gx, gy - hgt / 2 + hgt * 0.75 * up, gz);
          },
        });
        decal(this, WARLORD.crackRing, gx, gy, gz, 0.9, 1.2, { grow: 0.05 });
        emit(this, { tex: WARLORD.dust, n: 2, x: gx, y: gy + 0.4, z: gz, size: [0.8, 1.1], grow: 1.7, life: [0.4, 0.6], speed: [0.8, 1.6], flatSpread: true, drag: 3, opacity: 0.85 });
        chunks(this, 1, gx, gy + 0.4, gz, { size: [0.1, 0.18], speed: [1, 2.5], up: [3, 5] });
      }
    }
    for (const [id, v] of this.missileViews) {
      if (seen.has(id)) continue;
      emit(this, { tex: FX.dust, n: 3, x: v.obj.position.x, y: v.obj.position.y, z: v.obj.position.z, size: [0.6, 0.9], grow: 1.6, life: [0.3, 0.5], speed: [0.8, 1.6], opacity: 0.8 });
      this.root.remove(v.obj);
      v.obj.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat && !SHARED_MAT.has(mat) && !mat.userData.keep) mat.dispose();
        if (o instanceof THREE.Mesh && !SHARED_GEO.has(o.geometry) && !o.geometry.userData.model) o.geometry.dispose();
      });
      this.missileViews.delete(id);
    }
  }

  after(seconds: number, run: () => void): void {
    this.pending.push({ at: this.clock + Math.max(0, seconds), run });
  }

  private cannonHit(x: number, y: number, z: number, radius: number): void {
    this.flash(x, y + 1.2, z, starTex, 0xfff0b0, radius * 3.2, 0.35);
    this.flash(x, y + 1, z, glowTex, 0xff7a20, radius * 2.6, 0.7);
    this.burst(x, y + 0.8, z, puffTex, 0xff8a30, 10, 2.2, 0.55, radius * 0.8, false, 2.2);
    this.burst(x, y + 1.2, z, puffTex, 0xffd060, 6, 1.6, 0.35, radius * 0.5, true, 2.8);
    this.burst(x, y + 0.6, z, starTex, 0xff8a20, 16, 1.4, 0.5, radius * 1.4, true, 2.5);
    this.burst(x, y + 0.8, z, puffTex, 0x3a3430, 18, 2.2, 1.8, radius * 0.9, false, 1.8);
    this.burst(x, y + 0.3, z, puffTex, 0xa89478, 12, 1.6, 1.1, radius * 1.5, false, 0.4);
    this.debris(x, y, z, [0x6a5a44, 0x4a3e30, 0x807060, 0x3a3a3a], 14, 0.28, 7);
    this.sparks(x, y + 0.5, z, 1, 0, 0xffc060, 6, 12);
    this.sparks(x, y + 0.5, z, -1, 0, 0xffc060, 6, 12);
    this.ring(x, y, z, new THREE.Color(0xffc080), radius * 1.3, 0.4);
    const scorch = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.rotation.z = Math.random() * Math.PI * 2;
    scorch.position.set(x, y + 0.08, z);
    scorch.scale.setScalar(radius * 0.9);
    this.root.add(scorch);
    this.items.push({ obj: scorch, t: 0, dur: 9, tick: (k) => { (scorch.material as THREE.MeshBasicMaterial).opacity = 0.9 * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3); } });
    this.shake = Math.max(this.shake, 0.7);
  }

  aura(kind: "flame" | "spark" | "drip" | "steam", x: number, y: number, z: number): void {
    if (kind === "flame") this.burst(x + (Math.random() - 0.5) * 0.8, y + 0.4 + Math.random() * 1.2, z + (Math.random() - 0.5) * 0.8, starTex, 0xff7a20, 1, 0.45, 0.45, 0.2, true, 1.6);
    else if (kind === "spark") this.burst(x + (Math.random() - 0.5) * 0.9, y + 1 + Math.random() * 1.2, z + (Math.random() - 0.5) * 0.9, starTex, 0xfff0a0, 1, 0.35, 0.35, 0.3, true, 0.6);
    else if (kind === "steam") this.burst(x, y, z, puffTex, 0xe8e8f0, 1, 0.8, 0.8, 0.3, false, 1.2);
    else {
      const s = this.sprite(glowTex, 0xa01010, false, 1);
      const sx = x + (Math.random() - 0.5) * 0.6;
      const sz = z + (Math.random() - 0.5) * 0.6;
      let vy = 0;
      s.position.set(sx, y + 1.2 + Math.random() * 0.6, sz);
      s.scale.setScalar(0.22);
      this.items.push({ obj: s, t: 0, dur: 0.5, tick: (k, dt) => { vy -= 12 * dt; s.position.y += vy * dt; s.material.opacity = 1 - k * 0.6; } });
    }
  }

  smoke(x: number, y: number, z: number, heat: number): void {
    const s = this.sprite(puffTex, heat > 0.7 ? 0x5a4a44 : 0x6a6660, false, 0.7);
    s.position.set(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
    const sz = 0.4 + heat * 0.5;
    const drift = (Math.random() - 0.5) * 0.8;
    this.items.push({
      obj: s, t: 0, dur: 0.9 + heat * 0.5,
      tick: (k, dt) => {
        s.position.y += dt * (1.2 + heat);
        s.position.x += dt * drift;
        s.scale.setScalar(sz * (1 + k * 2));
        s.material.opacity = 0.65 * (1 - k);
      },
    });
    if (heat > 0.5 && Math.random() < heat * 0.5) {
      const f = this.sprite(starTex, 0xff9030, true, 0.9);
      f.position.set(x, y, z);
      this.items.push({ obj: f, t: 0, dur: 0.15, tick: (k) => { f.scale.setScalar(0.5 + k * 0.4); f.material.opacity = 0.9 * (1 - k); } });
    }
  }

  chargeSparks(x: number, y: number, z: number, k: number, color: THREE.ColorRepresentation, full: boolean): void {
    if (Math.random() < 0.7) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 - k * 0.4;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      const sy = y + 0.3 + Math.random() * 1.6;
      const s = this.sprite(FX.twinkle, color, true, 1);
      s.position.set(sx, sy, sz);
      this.items.push({ obj: s, t: 0, dur: 0.3, tick: (q) => {
        s.position.set(sx + (x - sx) * q, sy + (y + 1.3 - sy) * q, sz + (z - sz) * q);
        s.scale.setScalar(0.35 + k * 0.3);
        s.material.opacity = 1 - q * 0.5;
      } });
    }
    if (full && Math.random() < 0.25) emit(this, { tex: FX.zap, n: 1, x, y: y + 1.3, z, color, size: [0.9, 1.3], life: [0.08, 0.14], speed: [0, 0], additive: true, jitter: 0.9 });
  }

  chargeRelease(x: number, y: number, z: number, dirX: number, dirZ: number, power: number, color: THREE.ColorRepresentation): void {
    const k = Math.min(1, (power - 1) / 0.8);
    emit(this, { tex: FX.burst, n: 1, x: x + dirX * 1.2, y: y + 1.2, z: z + dirZ * 1.2, color, size: [2 + k * 2, 2 + k * 2], grow: 1.4, life: [0.15, 0.15], speed: [0, 0], additive: true, order: 7 });
    shockwave(this, FX.shock, x + dirX * 1.2, y + 1.1, z + dirZ * 1.2, new THREE.Vector3(dirX, 0, dirZ), 0.3, 1.5 + k * 2, 0.25, color);
    shockwave(this, FX.shock, x, y + 0.15, z, new THREE.Vector3(0, 1, 0), 0.4, 1.8 + k * 1.8, 0.35, 0xfff0c0, 0.8);
    emit(this, { tex: FX.dust, n: 4 + Math.round(k * 4), x, y: y + 0.3, z, size: [0.9, 1.3], grow: 1.8, life: [0.4, 0.7], speed: [2, 4], flatSpread: true, drag: 3, opacity: 0.85 });
    this.shake = Math.max(this.shake, 0.2 + k * 0.3);
  }

  bloodMote(x: number, y: number, z: number): void {
    emit(this, { tex: RAIDER.drop, n: 1, x: x + (Math.random() - 0.5) * 1.2, y: y + 0.6 + Math.random() * 1.4, z: z + (Math.random() - 0.5) * 1.2, color: 0xff4040, size: [0.22, 0.32], life: [0.5, 0.8], speed: [0, 0.2], up: [0.6, 1.2], opacity: 0.9 });
  }

  regen(x: number, y: number, z: number): void {
    const s = this.sprite(plusTex, 0x90ff90, false, 0.9);
    const ox = (Math.random() - 0.5) * 1.2;
    const oz = (Math.random() - 0.5) * 1.2;
    s.position.set(x + ox, y + 0.8 + Math.random() * 1.2, z + oz);
    this.items.push({ obj: s, t: 0, dur: 0.9, tick: (k, dt) => { s.position.y += dt * 1.4; s.scale.setScalar(0.32 * (1 - k * 0.3)); s.material.opacity = 0.9 * (1 - k); } });
  }

  buildFx(x: number, y: number, z: number, team: number): void {
    this.burst(x, y + 0.4, z, puffTex, 0xd8c8a8, 10, 1.4, 0.8, 2.5, false, 0.6);
    this.flash(x, y + 1.5, z, glowTex, this.teamColors[team], 4, 0.4);
  }

  spawnFx(x: number, y: number, z: number, team: number): void {
    this.flash(x, y + 0.8, z, glowTex, this.teamColors[team], 2.2, 0.3);
  }

  private frameDt = 1 / 60;
  update(dt: number): void {
    this.frameDt = dt;
    this.clock += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at <= this.clock) {
        const p = this.pending[i];
        this.pending.splice(i, 1);
        p.run();
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.tick(k, dt);
      if (k >= 1) {
        this.root.remove(f.obj);
        f.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m && m !== ballMat && !SHARED_MAT.has(m) && !m.userData.keep) m.dispose();
          if (o instanceof THREE.Mesh && !o.geometry.userData.model && !SHARED_CHUNK_GEOS.has(o.geometry) && !SHARED_PLANE_GEOS.has(o.geometry) && o.geometry !== chunkGeo && o.geometry !== ballGeo && !SHARED_GEO.has(o.geometry)) o.geometry.dispose();
        });
        this.items.splice(i, 1);
      }
    }
    for (const [k, r] of this.ribbons) {
      r.update(dt);
      if (r.empty) {
        this.root.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.ribbons.delete(k);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  syncProjectiles(world: World, alpha: number): void {
    const seen = new Set<number>();
    for (const p of world.projectiles) {
      seen.add(p.id);
      let s = this.projViews.get(p.id);
      const pk = !s ? KITS[world.getAny(p.sourceId)?.hero?.type ?? ""] : undefined;
      const custom = pk?.projectile?.(this, p.style) ?? null;
      if (!s && custom) {
        s = custom as THREE.Sprite;
        s.userData.kit = pk;
        this.root.add(s);
        this.projViews.set(p.id, s);
      }
      if (!s) {
        const c = this.teamColors[p.team];
        const col = p.style === "arrow" || p.style === "ballista" ? new THREE.Color(0xfff0c0)
          : p.style === "magic" || p.style === "orb" ? c.clone().lerp(new THREE.Color(0.8, 0.3, 1), 0.6)
          : c.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
        s = this.sprite(glowTex, col, true, 1);
        s.scale.setScalar(p.style === "arrow" ? 0.45 : p.style === "ballista" ? 0.8 : p.style === "magic" ? 1.4 : p.style === "orb" ? 2.4 : 1.1);
        this.projViews.set(p.id, s);
      }
      const t = Math.min(1, p.prevT + (p.t - p.prevT) * alpha);
      const x = p.from.x + (p.to.x - p.from.x) * t;
      const z = p.from.z + (p.to.z - p.from.z) * t;
      let y = p.from.y + (p.to.y - p.from.y) * t;
      if (p.ballistic) {
        const d = Math.hypot(p.to.x - p.from.x, p.to.z - p.from.z);
        y += d * 0.35 * 4 * t * (1 - t);
      }
      const kitOf = s.userData.kit as HeroKit | undefined;
      if (kitOf) {
        s.position.set(x, y, z);
        kitOf.projectileTick?.(this, s, x, y, z, this.frameDt);
        continue;
      }
      s.position.set(x, y, z);
      if (p.style === "orb") {
        s.material.rotation += 0.3;
        if (Math.random() < 0.6) this.burst(x, y, z, starTex, 0xd080ff, 1, 0.5, 0.35, 0.3, true, 0.2);
      }
    }
    for (const [id, s] of this.projViews) {
      if (!seen.has(id)) {
        this.root.remove(s);
        s.traverse((o) => ((o as THREE.Sprite).material as THREE.Material | undefined)?.dispose());
        this.projViews.delete(id);
      }
    }
  }
}
