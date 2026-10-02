import * as THREE from "three";
import { RelicView } from "./relicView";
import type { World } from "../sim/world";
import type { Terrain } from "../sim/terrain";
import type { MapView } from "./mapView";
import { Effects, makeSky } from "./fx";
import { FRAME, outlineConfig, type HeroModels } from "./heroModels";
import { silScene, syncSilhouettes } from "./entityViews";
import { EntityViews } from "./entityViews";
import { CombatFx } from "./combatFx";
import { HazardViews } from "./hazardViews";
import { Reticles, type ReticleReq } from "./reticle";
import type { UnitModels } from "./unitModels";
import type { StructureModels } from "./structureModels";

Object.defineProperty(THREE.Material.prototype, "forceSinglePass", {
  get: () => true,
  set: () => {},
  configurable: true,
});

export interface RenderConfig {
  lowResHeight: number;
  colorBits: number;
  dither: number;
  pitchDeg: number;
  fovDeg: number;
  minViewWidth: number;
  splitViewWidth: number;
  splitNear: number;
  commanderViewWidth: number;
  viewMargin: number;
  skyZenith: string;
  skyHorizon: string;
  fogColor: string;
  fogNearFactor: number;
  fogFarFactor: number;
  sunColor: string;
  sunIntensity: number;
  sunDir: [number, number, number];
  shadowMapSize: number;
  ambientSky: string;
  ambientGround: string;
  ambientIntensity: number;
  teamColors: string[];
  playerColors: string[];
  saturation: number;
  heroScale: number;
  vignette: number;
  viBlur: number;
  shadows: boolean;
  outlines: boolean;
}

const postVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const quantFrag = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 lowRes;
uniform float levels;
uniform float dither;
uniform float saturation;
uniform float vignette;
varying vec2 vUv;

float magic4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 6, 1, 7, 4, 2, 5, 3, 3, 5, 2, 4, 7, 1, 6, 0);
  return (float(m[i]) + 0.5) / 8.0 - 0.5;
}

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 c = toSRGB(texture2D(tScene, vUv).rgb);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, saturation);
  vec2 d = vUv - 0.5;
  c *= 1.0 - dot(d, d) * vignette;
  c += magic4(floor(vUv * lowRes)) * dither / levels;
  c = floor(c * levels + 0.5) / levels;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const viFrag = /* glsl */ `
uniform sampler2D tLow;
uniform vec2 lowRes;
uniform vec2 outRes;
uniform float viBlur;
varying vec2 vUv;

vec2 sharpUv(vec2 uv) {
  vec2 p = uv * lowRes;
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 k = outRes / lowRes;
  f = clamp((f - 0.5) * k + 0.5, 0.0, 1.0);
  return (i + f) / lowRes;
}

void main() {
  vec2 px = 1.0 / lowRes;
  vec2 uv = sharpUv(vUv);
  vec3 c = texture2D(tLow, uv).rgb;
  vec3 l = texture2D(tLow, uv - vec2(px.x, 0.0)).rgb;
  vec3 r = texture2D(tLow, uv + vec2(px.x, 0.0)).rgb;
  vec3 blur = (c * 2.0 + l + r) / 4.0;
  vec3 dedither = clamp(blur, min(min(l, r), c), max(max(l, r), c));
  gl_FragColor = vec4(mix(c, dedither, viBlur), 1.0);
}
`;

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private target: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private postMat: THREE.ShaderMaterial;
  private lowTarget: THREE.WebGLRenderTarget;
  private viScene = new THREE.Scene();
  private viMat: THREE.ShaderMaterial;
  private entityViews: EntityViews;
  combatFx: CombatFx;
  private hazards!: HazardViews;
  private heroModels: HeroModels;
  private structureModels: StructureModels;
  private camFocus = new THREE.Vector3();
  private camWidth: number;
  private camInit = false;
  private teamColors: THREE.Color[];
  private effects: Effects;
  private sun: THREE.DirectionalLight;
  private mapReady = false;
  private sky: THREE.Mesh;
  private time = 0;

  constructor(
    private cfg: RenderConfig,
    private world: World,
    private map: MapView,
    heroes: HeroModels,
    structures: StructureModels,
    private unitModels: UnitModels,
  ) {
    outlineConfig.enabled = cfg.outlines;
    THREE.Material.prototype.dispose = function () {};
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: true, depth: true });
    this.renderer.debug.checkShaderErrors = !!import.meta.env.DEV;
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.teamColors = cfg.teamColors.map((c) => new THREE.Color(c));
    this.camera = new THREE.PerspectiveCamera(cfg.fovDeg, 16 / 9, 0.5, 900);
    this.camWidth = cfg.minViewWidth;

    this.target = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      stencilBuffer: true,
    });
    this.postMat = new THREE.ShaderMaterial({
      vertexShader: postVert,
      fragmentShader: quantFrag,
      uniforms: {
        tScene: { value: this.target.texture },
        lowRes: { value: new THREE.Vector2() },
        levels: { value: Math.pow(2, cfg.colorBits) - 1 },
        dither: { value: cfg.dither },
        saturation: { value: cfg.saturation },
        vignette: { value: cfg.vignette },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMat));
    this.lowTarget = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.viMat = new THREE.ShaderMaterial({
      vertexShader: postVert,
      fragmentShader: viFrag,
      uniforms: {
        tLow: { value: this.lowTarget.texture },
        lowRes: { value: this.postMat.uniforms.lowRes.value },
        outRes: { value: new THREE.Vector2(1, 1) },
        viBlur: { value: cfg.viBlur },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.viScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.viMat));

    this.scene.fog = new THREE.Fog(new THREE.Color(cfg.fogColor), 30, 80);
    this.sky = makeSky(cfg.skyZenith, cfg.skyHorizon);
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
    this.sun.castShadow = cfg.shadows;
    this.sun.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    const hemi = new THREE.HemisphereLight(cfg.ambientSky, cfg.ambientGround, cfg.ambientIntensity);
    hemi.layers.enableAll();
    this.sun.layers.enableAll();
    this.scene.add(hemi);
    this.effects = new Effects(new THREE.Box3());
    this.setMap(map, world.terrain);

    this.heroModels = heroes;
    this.structureModels = structures;
    this.combatFx = new CombatFx(this.teamColors);
    this.combatFx.world = world;
    this.entityViews = new EntityViews(world, this.teamColors, heroes, structures, cfg.heroScale, this.combatFx, unitModels, cfg.playerColors.map((c) => new THREE.Color(c)));
    this.setWorld(world);


    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  setMap(map: MapView, t: Terrain): void {
    if (this.mapReady) {
      this.scene.remove(this.map.root);
      this.scene.remove(this.effects.root);
    }
    this.mapReady = true;
    this.map = map;
    this.scene.add(map.root);
    map.root.updateMatrixWorld(true);
    map.root.traverse((o) => {
      o.matrixAutoUpdate = false;
      o.updateMatrixWorld = () => {};
    });
    const center = new THREE.Vector3(t.width / 2, 0, t.depth / 2);
    const dir = new THREE.Vector3(...this.cfg.sunDir).normalize();
    this.sun.position.copy(center).addScaledVector(dir, 80);
    this.sun.target.position.copy(center);
    const half = Math.max(t.width, t.depth) * 0.62;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 200 });
    this.sun.shadow.camera.updateProjectionMatrix();
    const bounds = new THREE.Box3(new THREE.Vector3(1, 0, 1), new THREE.Vector3(t.width - 1, 6, t.depth - 1));
    this.effects = new Effects(bounds);
    this.scene.add(this.effects.root);
    for (const f of map.fx) {
      if (f.name === "fx_torch") this.effects.addTorch(f.position, true);
      else if (f.name === "fx_glow") this.effects.addGlow(f.position, 0x9fe8ff, 1.6);
    }
    this.camInit = false;
  }

  private humanList: boolean[] = [];
  shakeMul = 1;
  hints = true;
  setHumans(h: boolean[]): void {
    this.humanList = h;
    this.entityViews.humans = h;
  }

  setHints(on: boolean): void {
    this.hints = on;
    this.entityViews.hints = on;
  }

  private reticles = new Reticles();
  private reticleReqs: ReticleReq[] = [];
  setReticles(r: ReticleReq[]): void {
    this.reticleReqs = r;
  }

  setMenus(open: boolean[]): void {
    this.entityViews.menus = open;
  }

  private relicView: RelicView | null = null;

  setWorld(world: World): void {
    this.scene.remove(this.entityViews.root, this.entityViews.extras, this.combatFx.root);
    this.entityViews.dispose();
    this.hazards?.dispose();
    if (this.relicView) this.scene.remove(this.relicView.root);
    this.relicView = new RelicView(world, this.structureModels, this.teamColors, this.cfg.heroScale);
    this.scene.add(this.relicView.root);
    if (this.hazards) this.scene.remove(this.hazards.root);
    this.world = world;
    this.combatFx = new CombatFx(this.teamColors);
    this.combatFx.world = world;
    this.hazards = new HazardViews(world, this.teamColors, this.combatFx);
    this.scene.add(this.hazards.root);
    this.relicView.fx = this.combatFx;
    this.entityViews = new EntityViews(world, this.teamColors, this.heroModels, this.structureModels, this.cfg.heroScale, this.combatFx, this.unitModels, this.cfg.playerColors.map((c) => new THREE.Color(c)));
    this.entityViews.humans = this.humanList;
    this.entityViews.hints = this.hints;
    this.scene.add(this.entityViews.root, this.entityViews.extras, this.combatFx.root);
    this.camInit = false;
  }

  get teamColorList(): THREE.Color[] {
    return this.teamColors;
  }

  private fullSize = new THREE.Vector2();

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const lowH = Math.min(this.cfg.lowResHeight, h);
    const lowW = Math.round((lowH * w) / h);
    this.target.setSize(lowW, lowH);
    this.lowTarget.setSize(lowW, lowH);
    this.viMat.uniforms.outRes.value.set(w, h);
    this.postMat.uniforms.lowRes.value.set(lowW, lowH);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  cinematic = false;
  windowRect: [number, number, number, number] | null = null;
  private cineT = 0;

  private updateCamera(points: THREE.Vector3[], dt: number): void {
    if (this.cinematic && !this.splitViews.length) {
      this.cineT += dt;
      const t = this.world.terrain;
      const k = this.cineT * 0.045;
      const f = new THREE.Vector3(t.width / 2 + Math.sin(k) * t.width * 0.28, 0, t.depth / 2 + Math.sin(k * 0.7 + 1) * t.depth * 0.12);
      f.y = this.world.groundY(f.x, f.z);
      this.camFocus.lerp(f, this.camInit ? Math.min(1, dt * 2) : 1);
      this.camInit = true;
      this.camWidth += (Math.min(t.width, 46) - this.camWidth) * Math.min(1, dt * 2);
      this.placeCam(this.camera, this.camFocus, this.camWidth);
      return;
    }
    const st = { focus: this.camFocus, width: this.camWidth, init: this.camInit };
    this.aimCamera(this.camera, st, points, dt, this.cfg.minViewWidth);
    this.camWidth = st.width;
    this.camInit = st.init;
  }

  private placeCam(cam: THREE.PerspectiveCamera, focus: THREE.Vector3, width: number): number {
    const pitch = THREE.MathUtils.degToRad(this.cfg.pitchDeg);
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.cfg.fovDeg) / 2) * cam.aspect);
    const dist = width / (2 * Math.tan(hHalf));
    const look = new THREE.Vector3(focus.x, focus.y, focus.z - width * 0.06);
    cam.position.set(look.x, look.y + Math.sin(pitch) * dist, look.z + Math.cos(pitch) * dist);
    cam.lookAt(look);
    cam.updateMatrixWorld(true);
    return dist;
  }

  private keepInView(cam: THREE.PerspectiveCamera, focus: THREE.Vector3, width: number, keep: THREE.Vector3[], tight = false): void {
    if (!keep.length) return;
    const pitch = THREE.MathUtils.degToRad(this.cfg.pitchDeg);
    const depthToWidth = (cam.aspect / Math.sin(pitch)) * 1.25;
    const [X0, X1, Y0, Y1] = tight ? [-0.45, 0.45, -0.3, 0.3] : [-0.8, 0.8, -0.66, 0.5];
    const v = new THREE.Vector3();
    for (let it = 0; it < 4; it++) {
      this.placeCam(cam, focus, width);
      let dx = 0;
      let dy = 0;
      for (const p of keep) {
        v.set(p.x, p.y + 1.5, p.z).project(cam);
        if (v.x < X0) dx = Math.min(dx, v.x - X0);
        if (v.x > X1) dx = Math.max(dx, v.x - X1);
        if (v.y < Y0) dy = Math.min(dy, v.y - Y0);
        if (v.y > Y1) dy = Math.max(dy, v.y - Y1);
      }
      if (!dx && !dy) return;
      focus.x += dx * width * 0.55;
      focus.z -= dy * (width / depthToWidth) * 0.6;
    }
  }

  private aimCamera(cam: THREE.PerspectiveCamera, st: { focus: THREE.Vector3; width: number; init: boolean }, points: THREE.Vector3[], dt: number, minWidth: number, maxWidth = Infinity, margin = this.cfg.viewMargin, keep: THREE.Vector3[] = points, center = false): void {
    const cfg = this.cfg;
    const t = this.world.terrain;
    const pitch = THREE.MathUtils.degToRad(cfg.pitchDeg);
    const aspect = cam.aspect;
    const vHalf = THREE.MathUtils.degToRad(cfg.fovDeg) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of points) { min.min(p); max.max(p); }
    if (points.length === 0) { min.set(t.width / 2, 0, t.depth / 2); max.copy(min); }
    const focus = min.clone().add(max).multiplyScalar(0.5);

    const depthToWidth = (aspect / Math.sin(pitch)) * 1.25;
    const need = Math.max(max.x - min.x, (max.z - min.z) * depthToWidth) + margin;
    const fullMap = Math.max(t.width, t.depth * depthToWidth) * 1.3 + 12;
    const lo = Math.min(minWidth, fullMap);
    const cap = center ? Math.max(t.width, t.depth * depthToWidth) * 0.9 : fullMap;
    const width = THREE.MathUtils.clamp(need, Math.min(lo, cap), Math.max(Math.min(lo, cap), Math.min(maxWidth, cap)));

    if (center && keep.length) {
      const c = new THREE.Vector3();
      for (const p of keep) c.add(p);
      c.multiplyScalar(1 / keep.length);
      focus.lerp(c, 0.85);
      this.keepInView(cam, focus, width, keep, true);
      const k = st.init ? 1 - Math.exp(-dt * 6) : 1;
      st.init = true;
      st.focus.lerp(focus, k);
      st.width += (width - st.width) * k;
      const dist = this.placeCam(cam, st.focus, st.width);
      cam.userData.fogNear = dist * cfg.fogNearFactor;
      cam.userData.fogFar = dist * cfg.fogFarFactor;
      return;
    }

    const slack = 6 + width * 0.15;
    if (width < t.width + slack * 2) focus.x = THREE.MathUtils.clamp(focus.x, width / 2 - slack, t.width - width / 2 + slack);
    else focus.x = t.width / 2;
    const viewDepth = width / depthToWidth;
    const zs = 4 + viewDepth * 0.15;
    if (viewDepth < t.depth + zs * 2) focus.z = THREE.MathUtils.clamp(focus.z, viewDepth / 2 - zs, t.depth - viewDepth / 2 + zs);
    else focus.z = t.depth / 2;

    this.keepInView(cam, focus, width, keep);

    const k = st.init ? 1 - Math.exp(-dt * 4) : 1;
    st.init = true;
    st.focus.lerp(focus, k);
    st.width += (width - st.width) * k;

    const dist = this.placeCam(cam, st.focus, st.width);
    void hHalf;
    cam.userData.fogNear = dist * cfg.fogNearFactor;
    cam.userData.fogFar = dist * cfg.fogFarFactor;
  }

  camMode = 1;
  manualZoom: boolean[] = [];
  private merged = false;
  private zoomSteps = [14, 18, 22, 28, 36, 48, 64, 90, 120, 150];
  private zoomIndex = new Map<number, number>();
  private splitViews: { cam: THREE.PerspectiveCamera; st: { focus: THREE.Vector3; width: number; init: boolean }; heroIds: number[]; player: number }[] = [];

  viewRectOf(player: number): { x: number; y: number; w: number; h: number } | null {
    if (this.splitViews.length < 2) return null;
    const k = this.splitViews.findIndex((v) => v.player === player);
    if (k < 0) return null;
    const tw = this.target.width;
    const th = this.target.height;
    const [x, y, w, h] = this.splitRects(tw, th)[k];
    return { x: x / tw, y: 1 - (y + h) / th, w: w / tw, h: h / th };
  }

  get splitCount(): number {
    return this.splitViews.length > 1 ? this.splitViews.length : 0;
  }

  zoomOut(): number {
    const sv = this.splitViews?.[0];
    if (!sv || this.splitViews.length !== 1) return 0;
    return THREE.MathUtils.clamp((Math.log(sv.st.width) - Math.log(14)) / (Math.log(150) - Math.log(14)), 0, 1);
  }

  zoomStep(player: number, dir: number): void {
    const i = this.zoomIndex.get(player) ?? 2;
    this.zoomIndex.set(player, Math.max(0, Math.min(this.zoomSteps.length - 1, i + dir)));
  }

  private syncSplit(): void {
    const humans = this.camMode ? this.world.players.filter((p) => this.humanList[p.player]) : [];
    humans.sort((a, b) => (humans.length === 2 ? a.team - b.team : 0) || a.player - b.player);
    const ids = humans.map((p) => p.heroId);
    const pts = ids.map((id) => this.entityViews.heroPoint(id));
    let spread = 0;
    for (const a of pts) for (const b of pts) if (a && b) spread = Math.max(spread, a.distanceTo(b));
    if (spread > this.cfg.splitNear + 2) this.merged = false;
    else if (spread < this.cfg.splitNear - 3 && pts.every(Boolean)) this.merged = true;
    const w = this.world;
    const teamsInView = new Set(humans.map((p) => p.team));
    if (teamsInView.size > 1 && w.players.some((p) => { const e = w.getAny(p.heroId); return !!e && w.time < e.status.stealthUntil; })) this.merged = false;
    const groups: { ids: number[]; player: number }[] = !ids.length ? [] : ids.length === 1 || this.merged ? [{ ids, player: humans[0].player }] : humans.map((p) => ({ ids: [p.heroId], player: p.player }));
    const same = groups.length === this.splitViews.length && groups.every((g, i) => g.ids.join() === this.splitViews[i].heroIds.join());
    if (same) return;
    const prev = this.splitViews;
    this.splitViews = groups.map((g) => {
      const old = prev.find((v) => v.heroIds.includes(g.ids[0]));
      return {
        cam: old?.cam ?? new THREE.PerspectiveCamera(this.cfg.fovDeg, 1, this.camera.near, this.camera.far),
        st: old?.st ?? { focus: new THREE.Vector3(), width: this.cfg.splitViewWidth, init: false },
        heroIds: g.ids,
        player: g.player,
      };
    });
  }

  private watching = new Map<number, number>();

  private frameView(sv: { heroIds: number[]; player: number }): { pts: THREE.Vector3[]; min: number; max: number; margin: number; own?: number } {
    const w = this.world;
    const pts: THREE.Vector3[] = [];
    const heroes = sv.heroIds.map((id) => w.getAny(id)).filter((e) => !!e);
    for (const id of sv.heroIds) {
      const p = this.entityViews.heroPoint(id);
      if (p) pts.push(p);
    }
    for (const h of heroes) {
      const a = h.alive ? h.hero?.aim : null;
      if (a) pts.push(new THREE.Vector3(a.x, w.groundY(a.x, a.z), a.z));
    }
    const ownN = pts.length;
    if (heroes.length && heroes.every((h) => w.teams[h.team]?.out)) {
      let id = this.watching.get(sv.player) ?? 0;
      const ok = (e: { alive: boolean; team: number } | undefined) => !!e?.alive && w.standing(e.team);
      if (!ok(w.getAny(id))) {
        const sp = w.spawnPoint(heroes[0].team);
        const near = w.players.map((p) => w.getAny(p.heroId)).filter(ok).sort((a, b) => Math.hypot(a!.transform.pos.x - sp.x, a!.transform.pos.z - sp.z) - Math.hypot(b!.transform.pos.x - sp.x, b!.transform.pos.z - sp.z))[0];
        id = near?.id ?? 0;
        this.watching.set(sv.player, id);
      }
      const p = id ? this.entityViews.heroPoint(id) : null;
      if (p) {
        pts.length = 0;
        pts.push(p);
      }
    }
    if (!pts.length) {
      const sp = w.spawnPoint(heroes[0]?.team ?? 0);
      return { pts: [new THREE.Vector3(sp.x, 0, sp.z)], min: this.cfg.splitViewWidth, max: this.cfg.splitViewWidth, margin: 0 };
    }
    const slot = w.players.find((p) => p.player === sv.player);
    if (slot?.commander && sv.heroIds.length === 1) {
      for (const o of w.entities) {
        if (!o.alive || o.team !== slot.team || (!o.unit && !o.hero)) continue;
        pts.push(new THREE.Vector3(o.transform.pos.x, o.transform.y, o.transform.pos.z));
      }
      const cw = this.cfg.commanderViewWidth;
      return { pts, min: cw, max: cw, margin: 0 };
    }
    if (this.camMode !== 0 && this.manualZoom[sv.player]) {
      const z = this.zoomSteps[this.zoomIndex.get(sv.player) ?? 2];
      return { pts, min: z, max: z, margin: 4, own: ownN };
    }
    const alive = heroes.filter((h) => h.alive);
    let fight = false;
    for (const o of w.entities) {
      if (!o.alive || o.kind === "structure") continue;
      if (alive.some((h) => h.team !== o.team && w.dist(h, o) < 9)) {
        fight = true;
        pts.push(new THREE.Vector3(o.transform.pos.x, o.transform.y, o.transform.pos.z));
      }
    }
    let towers = false;
    for (const o of w.entities) {
      if (!o.alive || !o.structure || o.structure.siege) continue;
      if (alive.some((h) => w.dist(h, o) < 13)) {
        towers = true;
        pts.push(new THREE.Vector3(o.transform.pos.x, o.transform.y, o.transform.pos.z));
      }
    }
    const zf = this.zoomSteps[this.zoomIndex.get(sv.player) ?? 2] / this.zoomSteps[2];
    const min = (fight ? 18 : towers ? 24 : 21) * zf;
    let reach = 0;
    for (let i = sv.heroIds.length; i < ownN; i++) for (let j = 0; j < sv.heroIds.length; j++) if (pts[j]) reach = Math.max(reach, pts[i].distanceTo(pts[j]));
    return { pts, min, max: Math.max(min, 34 * Math.max(1, zf), reach * 1.25 + 18), margin: (fight ? 6 : 8) * zf, own: ownN };
  }

  private splitRects(w: number, h: number): [number, number, number, number][] {
    const n = this.splitViews.length;
    const hw = Math.floor(w / 2);
    const hh = Math.floor(h / 2);
    if (n === 1) return [[0, 0, w, h]];
    if (n === 2) return [[0, 0, hw, h], [hw, 0, w - hw, h]];
    return [[0, hh, hw, h - hh], [hw, h - hh, w - hw, hh], [0, 0, hw, hh], [hw, 0, w - hw, hh]];
  }

  private sharedViewer(): number | null {
    const teams = new Set(this.world.players.filter((p) => this.humanList[p.player]).map((p) => p.team));
    return teams.size === 1 ? [...teams][0] : null;
  }

  private drawScene(cam: THREE.PerspectiveCamera, viewer: number | null = this.sharedViewer()): void {
    this.entityViews.setViewer(viewer);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = cam.userData.fogNear ?? fog.near;
    fog.far = cam.userData.fogFar ?? fog.far;
    this.sky.position.copy(cam.position);
    cam.updateMatrixWorld();
    this.cullMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.cullMat);
    if (this.matrixFrame !== FRAME.id) {
      this.matrixFrame = FRAME.id;
      this.scene.updateMatrixWorld();
      this.entityViews.fillUnits();
    }
    this.entityViews.cullTo(this.frustum);
    this.sky.updateMatrixWorld(true);
    this.entityViews.fillView(cam);
    this.hazards?.fillView(cam);
    if (silScene.parent !== this.scene) this.scene.add(silScene);
    syncSilhouettes(this.scene);
    this.renderer.render(this.scene, cam);
    this.entityViews.uncull();
  }

  quiet = false;
  demoCam: { rect: [number, number, number, number]; target: { x: number; y: number; z: number }; yaw: number; pitch: number; dist: number } | null = null;
  private demoCamera = new THREE.PerspectiveCamera(38, 1, 0.3, 300);
  private matrixFrame = -1;
  private frustum = new THREE.Frustum();
  private cullMat = new THREE.Matrix4();

  render(alpha: number, dt: number): void {
    FRAME.id++;
    this.combatFx.quiet = this.quiet;
    this.entityViews.quiet = this.quiet || !!this.demoCam;
    this.scene.matrixWorldAutoUpdate = false;
    this.time += dt;
    for (const ev of this.world.events) {
      if (ev.type === "mod" || ev.type === "modEnd" || ev.type === "avalanche" || ev.type === "gates" || ev.type === "lantern" || ev.type === "mist" || ev.type === "morph" || ev.type === "jumppad" || ev.type === "horn") this.hazards.handle(ev);
      if (ev.type === "hit" && ev.id !== undefined && !ev.blocked) {
        this.entityViews.onHit(ev.id);
        this.entityViews.onImpact(ev.id, ev.src, ev.fx, ev.fz, ev.big);
      }
      if (ev.type === "rankUp") this.entityViews.onRankUp(ev.id);
      if (ev.type === "build" && !ev.upgrade) continue;
      this.combatFx.handle(ev);
    }
    this.world.events.length = 0;
    this.entityViews.sync(alpha, dt, this.time);
    this.relicView?.sync(alpha, dt);
    this.combatFx.syncProjectiles(this.world, alpha);
    this.combatFx.syncMissiles(this.world);
    this.combatFx.syncBanners(this.world, performance.now() / 1000);
    this.combatFx.update(dt);
    this.hazards.sync(this.time, dt);
    if (!this.reticles.root.parent) this.scene.add(this.reticles.root);
    this.reticles.sync(this.world, this.reticleReqs, this.time);
    this.syncSplit();
    const shake = (cam: THREE.PerspectiveCamera) => {
      if (this.combatFx.shake <= 0) return;
      const k = this.combatFx.shake * 0.5 * this.shakeMul;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
    };
    this.map.update(this.time, this.world.tideLevel());
    this.effects.update(this.time, dt);
    this.renderer.setRenderTarget(this.target);
    if (this.demoCam) {
      const d = this.demoCam;
      const tw = this.target.width;
      const th = this.target.height;
      const [fx, fy, fw, fh] = d.rect;
      const w = Math.max(1, Math.round(fw * tw));
      const h = Math.max(1, Math.round(fh * th));
      const x = Math.round(fx * tw);
      const y = Math.round(th - (fy + fh) * th);
      this.renderer.setScissor(0, 0, tw, th);
      this.renderer.setScissorTest(true);
      this.renderer.clear();
      const cam = this.demoCamera;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const cp = Math.cos(d.pitch);
      cam.position.set(d.target.x + Math.sin(d.yaw) * cp * d.dist, d.target.y + Math.sin(d.pitch) * d.dist, d.target.z + Math.cos(d.yaw) * cp * d.dist);
      cam.lookAt(d.target.x, d.target.y, d.target.z);
      cam.userData.fogNear = d.dist * 7;
      cam.userData.fogFar = d.dist * 18;
      shake(cam);
      this.renderer.setViewport(x, y, w, h);
      this.renderer.setScissor(x, y, w, h);
      this.drawScene(cam, null);
      this.renderer.setScissorTest(false);
    } else if (this.windowRect && !this.splitViews.length) {
      const tw = this.target.width;
      const th = this.target.height;
      const [fx, fy, fw, fh] = this.windowRect;
      const w = Math.max(1, Math.round(fw * tw));
      const h = Math.max(1, Math.round(fh * th));
      const x = Math.round(fx * tw);
      const y = Math.round(th - (fy + fh) * th);
      this.renderer.setScissor(0, 0, tw, th);
      this.renderer.setScissorTest(true);
      this.renderer.clear();
      if (Math.abs(this.camera.aspect - w / h) > 1e-3) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      if (this.world.ffa && !this.cinematic) {
        const pts = this.entityViews.heroPoints();
        if (pts.length) {
          const pick = pts[Math.floor(this.time / 12) % pts.length];
          const near = pts.filter((q) => q.distanceTo(pick) < 18);
          const st = { focus: this.camFocus, width: this.camWidth, init: this.camInit };
          this.aimCamera(this.camera, st, near, dt, this.cfg.minViewWidth, 34);
          this.camWidth = st.width;
          this.camInit = st.init;
        }
      } else this.updateCamera(this.entityViews.heroPoints(), dt);
      shake(this.camera);
      this.renderer.setViewport(x, y, w, h);
      this.renderer.setScissor(x, y, w, h);
      this.drawScene(this.camera);
      this.renderer.setScissorTest(false);
    } else if (!this.splitViews.length) {
      const asp = this.target.width / this.target.height;
      if (Math.abs(this.camera.aspect - asp) > 1e-3) {
        this.camera.aspect = asp;
        this.camera.updateProjectionMatrix();
      }
      this.updateCamera(this.entityViews.heroPoints(), dt);
      shake(this.camera);
      this.drawScene(this.camera);
    } else {
      const tw = this.target.width;
      const th = this.target.height;
      const rects = this.splitRects(tw, th);
      const all = this.entityViews.heroPoints();
      this.renderer.setScissor(0, 0, tw, th);
      this.renderer.setScissorTest(true);
      this.renderer.clear();
      rects.forEach(([x, y, w, h], i) => {
        const sv = this.splitViews[i];
        let cam: THREE.PerspectiveCamera;
        if (sv) {
          cam = sv.cam;
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
          const f = this.frameView(sv);
          const own = f.pts.slice(0, Math.max(sv.heroIds.length, f.own ?? 0));
          this.aimCamera(cam, sv.st, f.pts, dt, f.min, f.max, f.margin, own, sv.heroIds.length === 1);
        } else {
          cam = this.camera;
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
          this.updateCamera(all, dt);
        }
        shake(cam);
        this.renderer.setViewport(x, y, w, h);
        this.renderer.setScissor(x, y, w, h);
        const vp = sv ? this.world.players.find((p) => p.player === sv.player) : undefined;
        const viewer = sv && sv.heroIds.length === 1 && vp ? vp.team : this.sharedViewer();
        this.drawScene(cam, viewer);
      });
      this.renderer.setScissorTest(false);
    }
    const full = this.renderer.getSize(this.fullSize);
    this.renderer.setViewport(0, 0, full.x, full.y);
    this.renderer.setScissor(0, 0, full.x, full.y);
    this.renderer.setRenderTarget(this.lowTarget);
    this.renderer.render(this.postScene, this.postCam);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.viScene, this.postCam);
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const cam = this.splitViews.length === 1 ? this.splitViews[0].cam : this.camera;
    const v = new THREE.Vector3(x, y, z).project(cam);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }
}
