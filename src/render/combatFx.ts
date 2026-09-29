import * as THREE from "three";
import type { World } from "../sim/world";
import type { SimEvent } from "../sim/types";
import { drawNum, fontReady, textWidth } from "../ui/font";
import { dyeColor } from "./heroModels";

function canvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const starTex = canvasTex(32, (ctx, s) => {
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

const missTex = textTex("MISS", "#e0e0e0");
const koTex = textTex("K.O.!", "#ff5a3a");
const chunkGeo = new THREE.BoxGeometry(1, 1, 1);
const blockTex = textTex("BLOCK", "#9fd8ff");
const parryTex = textTex("PARRY!", "#ffe070");
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
        const m = (f.obj as THREE.Mesh).material as THREE.Material | undefined;
        m?.dispose();
        if (f.obj instanceof THREE.Mesh && f.obj.geometry !== chunkGeo) f.obj.geometry.dispose();
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
