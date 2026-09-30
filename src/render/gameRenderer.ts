import * as THREE from "three";
import { RelicView } from "./relicView";
import type { World } from "../sim/world";
import type { Terrain } from "../sim/terrain";
import type { MapView } from "./mapView";
import { Effects, makeSky } from "./fx";
import { outlineConfig, type HeroModels } from "./heroModels";
import { EntityViews } from "./entityViews";
import { CombatFx } from "./combatFx";
import { HazardViews } from "./hazardViews";
import type { UnitModels } from "./unitModels";
import type { StructureModels } from "./structureModels";

export interface RenderConfig {
  lowResHeight: number;
  colorBits: number;
  dither: number;
  pitchDeg: number;
  fovDeg: number;
  minViewWidth: number;
  splitViewWidth: number;
  splitNear: number;
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
  private silMats: THREE.MeshBasicMaterial[];
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
    this.renderer = new THREE.WebGLRenderer({ antialias: false });
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
    this.scene.add(new THREE.HemisphereLight(cfg.ambientSky, cfg.ambientGround, cfg.ambientIntensity));
    this.effects = new Effects(new THREE.Box3());
    this.setMap(map, world.terrain);

    this.heroModels = heroes;
    this.structureModels = structures;
    this.combatFx = new CombatFx(this.teamColors);
    this.combatFx.world = world;
    this.entityViews = new EntityViews(world, this.teamColors, heroes, structures, cfg.heroScale, this.combatFx, unitModels);
    this.setWorld(world);
    this.silMats = this.teamColors.map((c) => new THREE.MeshBasicMaterial({
      color: c.clone().multiplyScalar(0.8),
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
    }));

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

  setMenus(open: boolean[]): void {
    this.entityViews.menus = open;
  }

  private relicView: RelicView | null = null;

  setWorld(world: World): void {
    this.scene.remove(this.entityViews.root, this.combatFx.root);
    if (this.relicView) this.scene.remove(this.relicView.root);
    this.relicView = new RelicView(world, this.structureModels, this.teamColors, this.cfg.heroScale);
    this.scene.add(this.relicView.root);
    if (this.hazards) this.scene.remove(this.hazards.root);
    this.world = world;
    this.hazards = new HazardViews(world, this.teamColors);
    this.scene.add(this.hazards.root);
    this.combatFx = new CombatFx(this.teamColors);
    this.combatFx.world = world;
    this.relicView.fx = this.combatFx;
    this.entityViews = new EntityViews(world, this.teamColors, this.heroModels, this.structureModels, this.cfg.heroScale, this.combatFx, this.unitModels);
    this.entityViews.humans = this.humanList;
    this.entityViews.hints = this.hints;
    this.scene.add(this.entityViews.root, this.combatFx.root);
    this.camInit = false;
  }

  get teamColorList(): THREE.Color[] {
    return this.teamColors;
  }

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

  private updateCamera(points: THREE.Vector3[], dt: number): void {
    const st = { focus: this.camFocus, width: this.camWidth, init: this.camInit };
    this.aimCamera(this.camera, st, points, dt, this.cfg.minViewWidth);
    this.camWidth = st.width;
    this.camInit = st.init;
  }

  private aimCamera(cam: THREE.PerspectiveCamera, st: { focus: THREE.Vector3; width: number; init: boolean }, points: THREE.Vector3[], dt: number, minWidth: number): void {
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
    const need = Math.max(max.x - min.x, (max.z - min.z) * depthToWidth) + cfg.viewMargin;
    const fullMap = Math.max(t.width, t.depth * depthToWidth) + 4;
    const width = THREE.MathUtils.clamp(need, minWidth, Math.max(minWidth, fullMap));

    if (width < t.width) focus.x = THREE.MathUtils.clamp(focus.x, width / 2, t.width - width / 2);
    else focus.x = t.width / 2;
    const viewDepth = width / depthToWidth;
    if (viewDepth < t.depth) focus.z = THREE.MathUtils.clamp(focus.z, viewDepth / 2, t.depth - viewDepth / 2);
    else focus.z = t.depth / 2;

    const k = st.init ? 1 - Math.exp(-dt * 4) : 1;
    st.init = true;
    st.focus.lerp(focus, k);
    st.width += (width - st.width) * k;

    const dist = st.width / (2 * Math.tan(hHalf));
    const lift = st.width * 0.06;
    const look = new THREE.Vector3(st.focus.x, st.focus.y, st.focus.z - lift);
    cam.position.set(look.x, look.y + Math.sin(pitch) * dist, look.z + Math.cos(pitch) * dist);
    cam.lookAt(look);
    cam.userData.fogNear = dist * cfg.fogNearFactor;
    cam.userData.fogFar = dist * cfg.fogFarFactor;
  }

  splitOn = true;
  private merged = false;
  private splitViews: { cam: THREE.PerspectiveCamera; st: { focus: THREE.Vector3; width: number; init: boolean }; heroId: number }[] = [];

  get splitCount(): number {
    return this.splitViews.length;
  }

  private syncSplit(): void {
    const humans = this.splitOn ? this.world.players.filter((p) => this.humanList[p.player]) : [];
    humans.sort((a, b) => (humans.length === 2 ? a.team - b.team : 0) || a.player - b.player);
    const ids = humans.map((p) => p.heroId);
    const pts = ids.map((id) => this.entityViews.heroPoint(id));
    let spread = 0;
    for (const a of pts) for (const b of pts) if (a && b) spread = Math.max(spread, a.distanceTo(b));
    if (spread > this.cfg.splitNear + 2) this.merged = false;
    else if (spread < this.cfg.splitNear - 3 && pts.every(Boolean)) this.merged = true;
    const want = ids.length >= 2 && !this.merged ? ids : [];
    if (want.length === this.splitViews.length && want.every((id, i) => this.splitViews[i].heroId === id)) return;
    this.splitViews = want.map((heroId) => ({
      cam: new THREE.PerspectiveCamera(this.cfg.fovDeg, 1, this.camera.near, this.camera.far),
      st: { focus: new THREE.Vector3(), width: this.cfg.splitViewWidth, init: false },
      heroId,
    }));
  }

  private splitRects(w: number, h: number): [number, number, number, number][] {
    const n = this.splitViews.length;
    const hw = Math.floor(w / 2);
    const hh = Math.floor(h / 2);
    if (n === 2) return [[0, 0, hw, h], [hw, 0, w - hw, h]];
    return [[0, hh, hw, h - hh], [hw, h - hh, w - hw, hh], [0, 0, hw, hh], [hw, 0, w - hw, hh]];
  }

  private drawScene(cam: THREE.PerspectiveCamera): void {
    const fog = this.scene.fog as THREE.Fog;
    fog.near = cam.userData.fogNear ?? fog.near;
    fog.far = cam.userData.fogFar ?? fog.far;
    this.sky.position.copy(cam.position);
    this.renderer.render(this.scene, cam);
    const auto = this.renderer.autoClear;
    this.renderer.autoClear = false;
    const bg = this.scene.background;
    for (let team = 0; team < this.silMats.length; team++) {
      cam.layers.set(1 + team);
      this.scene.overrideMaterial = this.silMats[team];
      this.renderer.render(this.scene, cam);
    }
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    cam.layers.set(0);
    this.renderer.autoClear = auto;
  }

  render(alpha: number, dt: number): void {
    this.time += dt;
    for (const ev of this.world.events) {
      if (ev.type === "mod" || ev.type === "modEnd") this.hazards.handle(ev);
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
    this.combatFx.syncBanners(this.world, performance.now() / 1000);
    this.combatFx.update(dt);
    this.hazards.sync(this.time, dt);
    this.syncSplit();
    const shake = (cam: THREE.PerspectiveCamera) => {
      if (this.combatFx.shake <= 0) return;
      const k = this.combatFx.shake * 0.5 * this.shakeMul;
      cam.position.x += (Math.random() - 0.5) * k;
      cam.position.y += (Math.random() - 0.5) * k;
    };
    this.map.update(this.time);
    this.effects.update(this.time, dt);
    this.renderer.setRenderTarget(this.target);
    if (!this.splitViews.length) {
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
          const me = this.entityViews.heroPoint(sv.heroId);
          const hero = this.world.getAny(sv.heroId);
          const home = hero ? this.world.spawnPoint(hero.team) : { x: 0, z: 0 };
          const pts = me ? [me, ...all.filter((p) => p.distanceTo(me) < this.cfg.splitNear)] : [new THREE.Vector3(home.x, 0, home.z)];
          this.aimCamera(cam, sv.st, pts, dt, this.cfg.splitViewWidth);
        } else {
          cam = this.camera;
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
          this.updateCamera(all, dt);
        }
        shake(cam);
        this.renderer.setViewport(x, y, w, h);
        this.renderer.setScissor(x, y, w, h);
        this.drawScene(cam);
      });
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, tw, th);
      this.renderer.setScissor(0, 0, tw, th);
    }
    this.renderer.setRenderTarget(this.lowTarget);
    this.renderer.render(this.postScene, this.postCam);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.viScene, this.postCam);
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }
}
