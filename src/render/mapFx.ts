import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { World } from "../sim/world";
import blockUrl from "../../assets/textures/wallblock.png?url";
import woodUrl from "../../assets/textures/wood.png?url";
import ironUrl from "../../assets/textures/iron.png?url";
import cobbleUrl from "../../assets/textures/cobble.png?url";
import { FX, SUMMONER } from "./fxKit";
import { gateSlots, type FountainDef, type GatesDef, type GateSlot } from "../sim/mapEvents";
import { chunks, emit, type FxHost } from "./fxParts";

interface Rect {
  x: number;
  z: number;
  w: number;
  h: number;
}

interface Run {
  stage: "warn" | "slide";
  rect: Rect;
  dx: number;
  dz: number;
  start: number;
  seconds: number;
  acc: number;
}

interface Drift {
  mesh: THREE.Mesh;
  start: number;
  until: number;
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

export class MapFx {
  readonly root = new THREE.Group();
  private runs: Run[] = [];
  private drifts: Drift[] = [];
  private now = 0;

  private gates: Gate[] = [];
  private fountain?: FountainDef;
  private sprayAcc = 0;
  private ring = 0;
  private lanternObj: THREE.Group | null = null;
  private lanternId = 0;
  private lanternY = 0;
  private wispAcc = 0;
  private mistCells: number[] = [];
  private mistAcc = 0;

  private morphs: { id: number; start: number; until: number; team: number; acc: number }[] = [];
  teamColors: THREE.Color[] = [];

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
      let k = 1 + Math.sin(t * 2.2 + i) * 0.03;
      const wind = t - p.launchAt;
      if (wind >= 0 && wind < 0.3) {
        const q = wind / 0.3;
        k = 1 - 0.62 * q * q;
      } else if (wind >= 0.3 && wind < 1.4) {
        const q = wind - 0.3;
        k = 1 + 0.55 * Math.exp(-q * 4.5) * Math.cos(q * 22);
      }
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
    const m = world.mapEvents.mistMask;
    if (m) for (let i = 0; i < m.length; i++) if (m[i]) this.mistCells.push(i);
  }

  private buildLantern(): THREE.Group {
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

  private syncLantern(time: number, dt: number): void {
    const w = this.world;
    const me = w.mapEvents;
    const l = me.lantern;
    const def = me.lanternDef;
    if (!l || !def) {
      if (this.lanternObj) {
        this.root.remove(this.lanternObj);
        this.lanternObj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        this.lanternObj = null;
      }
    } else {
      if (!this.lanternObj || this.lanternId !== l.id) {
        if (this.lanternObj) this.root.remove(this.lanternObj);
        this.lanternObj = this.buildLantern();
        this.lanternId = l.id;
        this.root.add(this.lanternObj);
      }
      const o = this.lanternObj;
      const ground = w.groundY(l.x, l.z);
      const hover = 1.9 + Math.sin(time * 2.2) * 0.18;
      let y = ground + hover;
      if (l.state === "rise") {
        const k = Math.min(1, (w.time - l.start) / def.riseSeconds);
        y = ground - 3 + (hover + 3) * (k * k * (3 - 2 * k));
      }
      this.lanternY = y;
      o.position.set(l.x, y, l.z);
      o.rotation.y = time * 0.9;
      o.rotation.z = Math.sin(time * 1.7) * 0.12;
      const core = o.getObjectByName("core") as THREE.Mesh;
      core.scale.setScalar(1 + Math.sin(time * 9) * 0.12);
      if (this.fx) {
        this.wispAcc += dt;
        if (this.wispAcc > 0.06) {
          this.wispAcc = 0;
          emit(this.fx, { tex: SUMMONER.soulFlame, n: 2, x: l.x, y: y + 0.1, z: l.z, size: [0.8, 1.2], grow: 0.6, life: [0.4, 0.7], speed: [0.3, 0.8], up: [0.8, 1.4], additive: true, color: 0x60ff70, jitter: 0.25 });
          if (Math.random() < 0.4) emit(this.fx, { tex: SUMMONER.ghost, n: 1, x: l.x, y: y - 0.3, z: l.z, size: [0.6, 0.9], grow: 1.2, life: [0.8, 1.2], speed: [0.4, 0.9], up: [0.2, 0.5], opacity: 0.55, color: 0xc8ffd0, jitter: 0.8 });
          if (l.state === "rise" && Math.random() < 0.6) emit(this.fx, { tex: SUMMONER.graveHand, n: 1, x: l.x, y: ground - 0.2, z: l.z, size: [0.7, 1.0], life: [0.6, 0.9], speed: [0.2, 0.5], up: [1, 2], opacity: 0.85, color: 0xb8e8b0, jitter: 1.6 });
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
      const len = alongX ? slot.w : slot.h;
      const cx = slot.x + slot.w / 2;
      const cz = slot.z + slot.h / 2;
      const thick = alongX ? slot.h : slot.w;
      const y0 = w.groundY(cx, cz);
      const posts: [number, number, number][] = [];
      for (const sg of [-1, 1]) {
        const px = alongX ? cx + sg * (len / 2 + 0.05) : cx;
        const pz = alongX ? cz : cz + sg * (len / 2 + 0.05);
        const g = new THREE.BoxGeometry(alongX ? 0.7 : thick + 0.3, 3.4, alongX ? thick + 0.3 : 0.7);
        g.translate(px, y0 + 1.5, pz);
        postGeos.push(g);
        const cap = new THREE.BoxGeometry(alongX ? 0.9 : thick + 0.5, 0.3, alongX ? thick + 0.5 : 0.9);
        cap.translate(px, y0 + 3.3, pz);
        postGeos.push(cap);
        posts.push([px, y0 + 3.6, pz]);
      }
      const bg: THREE.BufferGeometry[] = [];
      const n = Math.max(3, Math.round(len / 0.45));
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * (len / n);
        const b = new THREE.BoxGeometry(0.1, BAR_H, 0.1);
        b.translate(alongX ? u : 0, BAR_H / 2, alongX ? 0 : u);
        bg.push(b);
        const tip = new THREE.ConeGeometry(0.1, 0.25, 4);
        tip.translate(alongX ? u : 0, BAR_H + 0.12, alongX ? 0 : u);
        bg.push(tip);
      }
      for (const y of [0.35, 1.4, 2.4]) {
        const r = new THREE.BoxGeometry(alongX ? len : 0.14, 0.12, alongX ? 0.14 : len);
        r.translate(0, y, 0);
        bg.push(r);
      }
      const merged = mergeGeometries(bg.map((g) => g.toNonIndexed()), false)!;
      bg.forEach((g) => g.dispose());
      const bars = new THREE.Mesh(merged, IRON);
      bars.position.set(cx, y0, cz);
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
      const cx = g.slot.x + g.slot.w / 2;
      const cz = g.slot.z + g.slot.h / 2;
      g.bars.position.y = w.groundY(cx, cz) + g.y;
      if (this.fx && Math.random() < dt * 12) emit(this.fx, { tex: FX.dust, n: 1, x: cx + (Math.random() - 0.5) * g.slot.w, y: w.groundY(cx, cz) + 0.2, z: cz + (Math.random() - 0.5) * g.slot.h, size: [0.8, 1.3], grow: 1.5, life: [0.5, 0.9], speed: [0.4, 1.0], up: [0.5, 1.2], opacity: 0.6 });
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
    if (ev.type === "jumppad") {
      const j = ev as unknown as { stage: string; x: number; y: number; z: number; windup: number };
      if (j.stage === "launch") this.pendingBursts.push({ at: this.world.time + j.windup, x: j.x, y: j.y, z: j.z });
      else if (this.fx) {
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
      if (this.fx && l.stage === "taken") {
        emit(this.fx, { tex: SUMMONER.burst, n: 1, x: l.x, y: this.lanternY, z: l.z, size: [2.4, 2.4], grow: 1.6, life: [0.4, 0.4], speed: [0, 0], additive: true, color: 0x9cff9c });
        emit(this.fx, { tex: SUMMONER.ghost, n: 8, x: l.x, y: this.lanternY, z: l.z, size: [0.6, 1.0], life: [0.6, 1.0], speed: [2, 4], additive: true, color: 0xb0ffb8 });
        emit(this.fx, { tex: SUMMONER.bones, n: 5, x: l.x, y: this.lanternY, z: l.z, size: [0.3, 0.5], life: [0.6, 0.9], speed: [2, 4], up: [1, 3], gravity: 9 });
      } else if (this.fx && l.stage === "rise") {
        const y = this.world.groundY(l.x, l.z);
        emit(this.fx, { tex: FX.smoke, n: 6, x: l.x, y: y + 0.3, z: l.z, size: [1.6, 2.6], grow: 1.6, life: [1.0, 1.6], speed: [0.3, 1], up: [1, 2], opacity: 0.6, color: 0x405848, jitter: 1.5 });
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
      this.drift(e.rect, e.seconds);
      return;
    }
    this.runs.push({ stage: e.stage, rect: e.rect, dx: e.dx, dz: e.dz, start: this.now, seconds: e.seconds, acc: 0 });
    if (e.stage === "slide" && this.fx) this.fx.shake = Math.max(this.fx.shake, 0.8);
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
      const span = r.dx !== 0 ? r.rect.w : r.rect.h;
      const cross = r.dx !== 0 ? r.rect.h : r.rect.w;
      if (r.stage === "warn") {
        if (r.acc < 0.12) continue;
        r.acc = 0;
        fx.shake = Math.max(fx.shake, 0.08 + k * 0.2);
        for (let n = 0; n < 2; n++) {
          const p = this.edge(r.rect, r.dx, r.dz, Math.random(), -1.5 + Math.random() * 2);
          const y = w.groundY(p.x, p.z);
          emit(fx, { tex: FX.smoke, n: 1, x: p.x, y: y + 1.5, z: p.z, size: [1.4, 2.4], grow: 1.8, life: [0.8, 1.4], speed: [0.5, 1.6], dir: { x: r.dx, y: -0.2, z: r.dz }, cone: 0.6, opacity: 0.85, color: 0xf4f8ff });
        }
        if (Math.random() < 0.3) {
          const p = this.edge(r.rect, r.dx, r.dz, Math.random(), 0);
          chunks(fx, 1, p.x, w.groundY(p.x, p.z) + 1, p.z, { size: [0.12, 0.25], speed: [1, 3], up: [1, 2] });
        }
        continue;
      }
      if (r.acc < 0.05) continue;
      r.acc = 0;
      fx.shake = Math.max(fx.shake, 0.5);
      const along = k * (span + 4) - 2;
      const n = Math.ceil(cross / 2.2);
      for (let j = 0; j < n; j++) {
        const p = this.edge(r.rect, r.dx, r.dz, (j + Math.random()) / n, along);
        const y = w.groundY(p.x, p.z);
        emit(fx, { tex: FX.smoke, n: 1, x: p.x, y: y + 1.2, z: p.z, size: [3.0, 4.6], grow: 1.6, life: [0.7, 1.2], speed: [3, 6], dir: { x: r.dx, y: 0.35, z: r.dz }, cone: 0.5, opacity: 0.95, color: 0xf8fbff });
        emit(fx, { tex: FX.smoke, n: 1, x: p.x, y: y + 0.4, z: p.z, size: [1.6, 2.4], grow: 1.5, life: [0.5, 0.9], speed: [5, 8], dir: { x: r.dx, y: 0.6, z: r.dz }, cone: 0.7, opacity: 0.9, color: 0xe8f0ff, gravity: 6 });
        if (Math.random() < 0.25) chunks(fx, 1, p.x, y + 0.8, p.z, { size: [0.18, 0.35], speed: [3, 6], up: [2, 4] });
      }
    }
    for (let i = this.drifts.length - 1; i >= 0; i--) {
      const d = this.drifts[i];
      const grow = Math.min(1, (time - d.start) / 0.5);
      const melt = Math.max(0, Math.min(1, (time - (d.until - 2.5)) / 2.5));
      d.mesh.position.y = -0.6 * (1 - grow) - 0.9 * melt;
      if (time >= d.until) {
        this.root.remove(d.mesh);
        d.mesh.geometry.dispose();
        this.drifts.splice(i, 1);
      }
    }
  }

  private drift(r: Rect, seconds: number): void {
    const w = this.world;
    const geos: THREE.BufferGeometry[] = [];
    const base = new THREE.IcosahedronGeometry(1, 1);
    base.deleteAttribute("uv");
    for (let z = r.z; z < r.z + r.h; z += 1.6) {
      for (let x = r.x; x < r.x + r.w; x += 1.6) {
        const px = x + Math.random() * 1.6;
        const pz = z + Math.random() * 1.6;
        const g = base.clone();
        const s = 0.8 + Math.random() * 0.5;
        g.scale(s * 1.25, 0.22 + Math.random() * 0.22, s * 1.25);
        g.rotateY(Math.random() * 6);
        g.translate(px, w.groundY(px, pz), pz);
        const n = g.getAttribute("position").count;
        const col = new Float32Array(n * 3);
        for (let q = 0; q < n; q++) {
          const top = g.getAttribute("position").getY(q) > w.groundY(px, pz) + 0.05 ? 1 : 0.72;
          col.set([top, top, top * 1.04], q * 3);
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        geos.push(g);
      }
    }
    base.dispose();
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, SNOW);
    mesh.position.y = -0.6;
    this.root.add(mesh);
    this.drifts.push({ mesh, start: this.now, until: this.now + seconds });
  }

  dispose(): void {
    for (const d of this.drifts) d.mesh.geometry.dispose();
    this.drifts = [];
    this.root.clear();
  }
}
