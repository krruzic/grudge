import * as THREE from "three";
import type { World } from "../sim/world";
import type { SimEvent } from "../sim/types";
import { drawNum, fontReady, textWidth } from "../ui/font";
import { dyeColor } from "./heroModels";
import ironUrl from "../../assets/textures/iron.png?url";
import barkUrl from "../../assets/textures/moss_bark.png?url";

const barkTex = new THREE.TextureLoader().load(barkUrl);
barkTex.colorSpace = THREE.SRGBColorSpace;
barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;

const ironTex = new THREE.TextureLoader().load(ironUrl);
ironTex.colorSpace = THREE.SRGBColorSpace;
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

const puffTex = canvasTex(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.6, "rgba(220,220,220,0.6)");
  g.addColorStop(1, "rgba(200,200,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});

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
function numberTex(text: string, color: string): THREE.CanvasTexture {
  const key = `${text}|${color}`;
  const hit = numCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  drawNum(ctx, text, (128 - textWidth(text, 2.6, true)) / 2, 2, color, 2.6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (numCache.size > 400) numCache.clear();
  numCache.set(key, t);
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

const missTex = textTex("MISS", "#e0e0e0");
const koTex = textTex("K.O.!", "#ff5a3a");
const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
const blockTex = textTex("BLOCK", "#9fd8ff");
const parryTex = textTex("PARRY!", "#ffe070");
const fallTex = textTex("FALL!", "#ffb050");
const rankTexes = ["VETERAN", "ELITE", "HEROIC"].map((t) => textTex(t, "#ffcc33"));

interface Fx {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  tick: (k: number, dt: number) => void;
}

export class CombatFx {
  readonly root = new THREE.Group();
  private items: Fx[] = [];
  private projViews = new Map<number, THREE.Sprite>();
  shake = 0;

  world?: World;
  private banners: THREE.Group[] = [];

  constructor(private teamColors: THREE.Color[]) {}

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

  private number(x: number, y: number, z: number, amount: number, color: string, big: boolean): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: numberTex(String(amount), color), transparent: true, depthTest: false }));
    s.renderOrder = 31;
    const base = big ? 1.5 : 1.0;
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
    switch (ev.type) {
      case "hit":
        if (ev.blocked) {
          this.flash(ev.x, ev.y + 0.2, ev.z, glowTex, 0x9fd8ff, 1.4, 0.2);
          this.label(ev.x, ev.y, ev.z, blockTex);
        } else {
          this.flash(ev.x, ev.y + 0.2, ev.z, starTex, 0xffffff, ev.big ? 2.4 : 1.2, ev.big ? 0.22 : 0.14);
          const tgt = ev.id !== undefined ? this.world?.get(ev.id) : undefined;
          const src = ev.src !== undefined ? this.world?.get(ev.src) : undefined;
          const dx = ev.fx !== undefined ? ev.x - ev.fx : Math.random() - 0.5;
          const dz = ev.fz !== undefined ? ev.z - ev.fz : Math.random() - 0.5;
          const heroInvolved = !!tgt?.hero || !!src?.hero;
          const sc = src ? this.teamColors[src.team].clone().lerp(new THREE.Color(1, 0.9, 0.6), 0.6) : new THREE.Color(1, 0.9, 0.6);
          this.sparks(ev.x, ev.y + 0.2, ev.z, dx, dz, sc, ev.big ? 9 : heroInvolved ? 5 : 3, ev.big ? 9 : 6);
          if (ev.big) {
            this.burst(ev.x, ev.y, ev.z, starTex, 0xffd080, 5, 0.4, 0.3, 4, true, 1);
            this.ring(ev.x, ev.y - 0.9, ev.z, new THREE.Color(1, 0.9, 0.7), 1.8, 0.25);
            this.shake = Math.max(this.shake, 0.22);
          } else if (tgt?.hero) {
            this.shake = Math.max(this.shake, 0.08);
          }
          if (ev.amount && (tgt?.hero || tgt?.structure || src?.hero)) {
            const color = tgt?.hero ? "#ff6a4a" : ev.big ? "#ffd84a" : "#ffffff";
            this.number(ev.x, ev.y, ev.z, ev.amount, color, ev.big || !!tgt?.hero);
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
        this.ring(ev.x, ev.y, ev.z, new THREE.Color(0xffe0a0), ev.radius, 0.35);
        this.burst(ev.x, ev.y + 0.2, ev.z, puffTex, 0xb09878, 10, 1.1, 0.7, ev.radius * 1.2, false, 0.6);
        this.shake = Math.max(this.shake, ev.radius > 4 ? 0.6 : 0.3);
        break;
      case "warcry": {
        const c = this.teamColors[ev.team];
        this.ring(ev.x, ev.y, ev.z, c, ev.radius, 0.6);
        this.flash(ev.x, ev.y + 1.6, ev.z, glowTex, c, 4, 0.5);
        break;
      }
      case "banner": {
        const c = this.teamColors[ev.team];
        this.ring(ev.x, ev.y, ev.z, c, 2.5, 0.4);
        this.burst(ev.x, ev.y + 0.2, ev.z, puffTex, 0xb09878, 8, 0.9, 0.6, 2, false, 0.6);
        this.shake = Math.max(this.shake, 0.15);
        break;
      }
      case "rally": {
        const c = this.teamColors[ev.team];
        this.ring(ev.x, ev.y, ev.z, new THREE.Color(0xffe8a0), ev.radius, 0.7);
        this.ring(ev.x, ev.y, ev.z, c, ev.radius * 0.6, 0.5);
        this.flash(ev.x, ev.y + 2, ev.z, glowTex, 0xffe8a0, 5, 0.6);
        this.burst(ev.x, ev.y + 1, ev.z, plusTex, 0xffffff, 12, 1, 1.2, ev.radius * 0.7, false, 1.2);
        break;
      }
      case "pulse":
        this.ring(ev.x, ev.y, ev.z, new THREE.Color(0x7fc8ff), ev.radius, 0.5);
        break;
      case "heal":
        this.burst(ev.x, ev.y + 1.5, ev.z, plusTex, 0xffffff, 2, 0.5, 0.9, 1.2, false, 1.2);
        break;
      case "build":
        break;
      case "telegraph": {
        const c = this.teamColors[ev.team].clone().lerp(new THREE.Color(0.7, 0.2, 1), 0.5);
        const m = new THREE.Mesh(
          new THREE.CircleGeometry(1, 24),
          new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(ev.x, ev.y + 0.25, ev.z);
        this.root.add(m);
        const r = ev.radius;
        this.items.push({
          obj: m, t: 0, dur: ev.seconds,
          tick: (k) => {
            m.scale.setScalar(r * (0.2 + 0.8 * k));
            (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.35 * k;
          },
        });
        this.ring(ev.x, ev.y, ev.z, c, r, ev.seconds);
        break;
      }
      case "parry":
        this.flash(ev.x, ev.y + 0.3, ev.z, glowTex, 0xfff4b0, 3, 0.25);
        this.label(ev.x, ev.y + 0.3, ev.z, parryTex);
        this.shake = Math.max(this.shake, 0.25);
        break;
      case "blink":
        this.burst(ev.x, ev.y + 0.8, ev.z, puffTex, 0x606070, 12, 1.4, 0.8, 2, false, 0.5);
        break;
      case "cannonWarn":
        this.cannonWarn(ev.x, ev.y, ev.z, ev.radius, ev.seconds);
        break;
      case "cannonHit":
        this.cannonHit(ev.x, ev.y, ev.z, ev.radius);
        break;
      case "reach":
        this.reach(ev.x, ev.y, ev.z, ev.tx, ev.tz, ev.hit);
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
        } else if (ev.state === "delivered" || ev.state === "cracked") {
          this.flash(ev.x, ev.y + 2, ev.z, starTex, 0xffe080, 10, 0.6);
          this.burst(ev.x, ev.y + 2, ev.z, starTex, 0xffb030, 30, 1.2, 1.2, 7, true, 3);
          this.debris(ev.x, ev.y + 1.5, ev.z, [0xc89a40, 0x6a5040, 0x8a7a68], 14, 0.3, 7);
          this.ring(ev.x, ev.y, ev.z, new THREE.Color(0xffd060), 8, 0.9);
          this.shake = Math.max(this.shake, 0.8);
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

  private reach(x: number, y: number, z: number, tx: number, tz: number, hit: boolean): void {
    const dx = tx - x;
    const dz = tz - z;
    const len = Math.max(0.5, Math.hypot(dx, dz));
    const ux = dx / len;
    const uz = dz / len;
    const sy = y + 1.7;
    const ty = (this.world?.groundY(tx, tz) ?? y) + 1.1;
    const tex = barkTex.clone();
    tex.repeat.set(1, len / 1.2);
    tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex, color: 0xc8b89a, flatShading: true });
    const arm = new THREE.Group();
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1, 6, 1), mat);
    limb.position.y = 0.5;
    arm.add(limb);
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.8), mat);
    hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 5), mat);
      f.rotation.x = Math.PI / 2;
      f.position.set(-0.27 + i * 0.18, 0, 0.55);
      hand.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 5), mat);
    thumb.rotation.set(Math.PI / 2, 0, 0.9);
    thumb.position.set(0.42, 0, 0.2);
    hand.add(thumb);
    this.root.add(arm, hand);
    const dir = new THREE.Vector3(ux * len, ty - sy, uz * len);
    const full = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    arm.position.set(x, sy, z);
    arm.quaternion.copy(q);
    const yaw = Math.atan2(ux, uz);
    let impact = false;
    this.items.push({
      obj: arm, t: 0, dur: 0.46,
      tick: (k) => {
        const s = k * 0.46;
        const f = s < 0.1 ? s / 0.1 : s < 0.22 ? 1 : Math.max(0.02, 1 - (s - 0.22) / 0.24);
        arm.scale.set(1, full * f, 1);
        hand.position.set(x + dir.x * f, sy + dir.y * f, z + dir.z * f);
        hand.rotation.set(-0.3, yaw, s < 0.1 ? -1.2 * (1 - f) : 0);
        hand.visible = true;
        if (!impact && f >= 1) {
          impact = true;
          if (hit) {
            this.flash(tx, ty, tz, starTex, 0xfff0c0, 1.7, 0.16);
            this.burst(tx, ty, tz, puffTex, 0xd8ccb0, 6, 0.8, 0.4, 2.5, false, 0.4);
            this.shake = Math.max(this.shake, 0.3);
          } else this.burst(tx, ty, tz, puffTex, 0xb09878, 3, 0.6, 0.3, 1.2, false, 0.2);
        }
      },
    });
    this.items.push({ obj: hand, t: 0, dur: 0.46, tick: () => {} });
    this.after(0.6, () => tex.dispose());
  }

  private after(seconds: number, run: () => void): void {
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

  buildFx(x: number, y: number, z: number, team: number): void {
    this.burst(x, y + 0.4, z, puffTex, 0xd8c8a8, 10, 1.4, 0.8, 2.5, false, 0.6);
    this.flash(x, y + 1.5, z, glowTex, this.teamColors[team], 4, 0.4);
  }

  spawnFx(x: number, y: number, z: number, team: number): void {
    this.flash(x, y + 0.8, z, glowTex, this.teamColors[team], 2.2, 0.3);
  }

  update(dt: number): void {
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
          if (m && m !== ballMat) m.dispose();
          if (o instanceof THREE.Mesh && o.geometry !== chunkGeo && o.geometry !== ballGeo) o.geometry.dispose();
        });
        this.items.splice(i, 1);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  syncProjectiles(world: World, alpha: number): void {
    const seen = new Set<number>();
    for (const p of world.projectiles) {
      seen.add(p.id);
      let s = this.projViews.get(p.id);
      if (!s) {
        const c = this.teamColors[p.team];
        const col = p.style === "arrow" || p.style === "ballista" ? new THREE.Color(0xfff0c0)
          : p.style === "magic" ? c.clone().lerp(new THREE.Color(0.8, 0.3, 1), 0.6)
          : c.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
        s = this.sprite(glowTex, col, true, 1);
        s.scale.setScalar(p.style === "arrow" ? 0.45 : p.style === "ballista" ? 0.8 : p.style === "magic" ? 1.4 : 1.1);
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
      s.position.set(x, y, z);
    }
    for (const [id, s] of this.projViews) {
      if (!seen.has(id)) {
        this.root.remove(s);
        s.material.dispose();
        this.projViews.delete(id);
      }
    }
  }
}
