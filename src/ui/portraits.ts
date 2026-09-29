import * as THREE from "three";
import type { HeroModels } from "../render/heroModels";

interface Stage {
  key: string;
  root: THREE.Group;
  body: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  canvas: HTMLCanvasElement;
  height: number;
  center: THREE.Vector3;
  ready: boolean;
  flourishUntil: number;
}

const ICON = 64;
const STAGE_W = 112;
const STAGE_H = 144;
const NEUTRAL = new THREE.Color("#c8a040");

export class Portraits {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private icons = new Map<string, HTMLCanvasElement>();
  private stages = new Map<number, Stage>();
  private last = performance.now() / 1000;
  private maps: { root: THREE.Object3D; w: number; d: number }[] = [];
  private thumbs = new Map<number, HTMLCanvasElement>();
  private liveCanvas = document.createElement("canvas");

  constructor(private heroes: HeroModels, private teamColors: THREE.Color[]) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const sun = new THREE.DirectionalLight("#fff0d0", 2.6);
    sun.position.set(-2, 4, 5);
    this.scene.add(sun, new THREE.HemisphereLight("#b8d4ff", "#6a5a3a", 1.6));
  }

  private pose(type: string, team: THREE.Color): { root: THREE.Group; body: THREE.Object3D; mixer?: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; height: number; center: THREE.Vector3 } {
    const inst = this.heroes.create(type, team, "");
    const root = new THREE.Group();
    root.add(inst.body);
    inst.actions.get("idle")?.play();
    inst.mixer?.update(0.01);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inst.body);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    return { root, body: inst.body, mixer: inst.mixer, actions: inst.actions, height: Math.max(0.5, size.y), center };
  }

  private shoot(root: THREE.Object3D, w: number, h: number, out: HTMLCanvasElement): void {
    this.scene.add(root);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(root);
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.renderer.domElement, 0, 0);
  }

  icon(type: string): HTMLCanvasElement {
    let c = this.icons.get(type);
    if (c) return c;
    c = document.createElement("canvas");
    const p = this.pose(type, NEUTRAL);
    p.root.rotation.y = 0.35;
    p.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(p.body);
    const top = box.max.y;
    const headY = top - p.height * 0.2;
    const dist = p.height * 1.25;
    this.camera.position.set(p.center.x + dist * 0.12, headY + p.height * 0.02, p.center.z + dist);
    this.camera.lookAt(p.center.x, headY - p.height * 0.03, p.center.z);
    this.camera.fov = 30;
    this.shoot(p.root, ICON, ICON, c);
    this.icons.set(type, c);
    return c;
  }

  stage(slot: number, type: string, team: number, ready: boolean): HTMLCanvasElement {
    const key = `${type}|${team}`;
    let s = this.stages.get(slot);
    if (!s || s.key !== key) {
      const p = this.pose(type, this.teamColors[team] ?? NEUTRAL);
      s = { key, ...p, canvas: s?.canvas ?? document.createElement("canvas"), ready: false, flourishUntil: 0 };
      this.stages.set(slot, s);
    }
    const now = performance.now() / 1000;
    if (ready && !s.ready) {
      const clip = s.actions.get("attack_a") ?? s.actions.get("cast") ?? s.actions.get("attack");
      if (clip) {
        s.actions.get("idle")?.fadeOut(0.1);
        clip.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.05).play();
        clip.clampWhenFinished = true;
        s.flourishUntil = now + clip.getClip().duration;
      }
    }
    if (s.flourishUntil && now > s.flourishUntil) {
      s.flourishUntil = 0;
      for (const [n, a] of s.actions) if (n !== "idle") a.fadeOut(0.2);
      s.actions.get("idle")?.reset().fadeIn(0.2).play();
    }
    s.ready = ready;
    return s.canvas;
  }

  renderStages(): void {
    const now = performance.now() / 1000;
    const dt = Math.min(0.1, now - this.last);
    this.last = now;
    for (const s of this.stages.values()) {
      s.mixer?.update(dt);
      s.root.rotation.y = 0.4 + Math.sin(now * 0.7) * 0.45;
      const dist = s.height * 2.1;
      this.camera.fov = 30;
      this.camera.position.set(s.center.x, s.center.y + s.height * 0.12, s.center.z + dist);
      this.camera.lookAt(s.center.x, s.center.y, s.center.z);
      this.shoot(s.root, STAGE_W, STAGE_H, s.canvas);
    }
  }

  setMaps(list: { root: THREE.Object3D; width: number; depth: number }[]): void {
    this.maps = list.map((m) => ({ root: m.root.clone(true), w: m.width, d: m.depth }));
    this.thumbs.clear();
  }

  private shootMap(i: number, w: number, h: number, yaw: number, pitchDeg: number, zoom: number, out: HTMLCanvasElement): void {
    const m = this.maps[i];
    if (!m) return;
    const c = new THREE.Vector3(m.w / 2, 0, m.d / 2);
    const size = Math.max(m.w, m.d);
    const p = THREE.MathUtils.degToRad(pitchDeg);
    const dist = size * zoom;
    this.camera.fov = 30;
    this.camera.position.set(c.x + Math.sin(yaw) * Math.cos(p) * dist, Math.sin(p) * dist, c.z + Math.cos(yaw) * Math.cos(p) * dist);
    this.camera.lookAt(c.x, 0, c.z);
    this.camera.near = dist * 0.1;
    this.camera.far = dist * 4;
    this.renderer.setClearColor("#9cc4ec", 1);
    this.shoot(m.root, w, h, out);
    this.renderer.setClearColor(0x000000, 0);
    this.camera.near = 0.1;
    this.camera.far = 50;
  }

  mapThumb(i: number, w = 128, h = 88): HTMLCanvasElement {
    const key = i * 1e6 + w * 1e3 + h;
    let c = this.thumbs.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    this.shootMap(i, w, h, 0, 60, 1.05, c);
    this.thumbs.set(key, c);
    return c;
  }

  mapLive(i: number, w = 240, h = 160): HTMLCanvasElement {
    const t = performance.now() / 1000;
    this.shootMap(i, w, h, Math.sin(t * 0.25) * 0.6, 44, 1.15, this.liveCanvas);
    return this.liveCanvas;
  }

  drop(slot: number): void {
    this.stages.delete(slot);
  }
}
