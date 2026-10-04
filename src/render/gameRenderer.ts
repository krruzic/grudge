// GameRenderer: owns the WebGL renderer and draws the 3D arena each frame.
// Pipeline: sync views from the sim → pick cameras (single, framed window, demo, or split-screen scissor
// viewports) → render the scene into a native-resolution linear target → one grade pass to the canvas.
// The 2D UI is a separate canvas on top (see UiCanvas in src/ui/hud.ts). Camera framing math is in camera.ts;
// src/render/README.md describes the whole frame.
import * as THREE from "three";
import { RelicView } from "./entities/relicView";
import { HeroPropViews } from "./heroProps/heroPropViews";
import type { World } from "../sim/world";
import type { Terrain } from "../sim/terrain";
import type { MapView } from "./mapView";
import { Effects, makeSky } from "./map/ambience";
import { FRAME, outlineConfig, type HeroModels } from "./heroModels";
import { syncSilhouettes, silScene } from "./entities/silhouettes";
import { EntityViews } from "./entities/entityViews";
import { CombatFx } from "./combat/combatFx";
import { HazardViews } from "./hazards/hazardViews";
import { Reticles, type ReticleReq } from "./reticle";
import type { UnitModels } from "./unitModels";
import type { StructureModels } from "./structureModels";
import { perf } from "../perf";
import { aimCamera, placeCam } from "./camera";

// Draw double-sided transparent materials in one pass (three.js otherwise renders back and front faces
// separately), halving draws for FX and silhouettes.
Object.defineProperty(THREE.Material.prototype, "forceSinglePass", {
  get: () => true,
  set: () => {},
  configurable: true,
});

/** Render settings from data/render.json. */
export interface RenderConfig {
  pitchDeg: number;
  fovDeg: number;
  minViewWidth: number;
  splitViewWidth: number;
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
  shadows: boolean;
  outlines: boolean;
}

// ── Grade pass ──
// The scene renders into a linear half-float target at drawing-buffer size; this single full-screen pass
// encodes it to sRGB and applies the colour grade from data/render.json (saturation, vignette).
const gradeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const gradeFrag = /* glsl */ `
uniform sampler2D tScene;
uniform float saturation;
uniform float vignette;
varying vec2 vUv;

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
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

/** Highest devicePixelRatio the 3D view honours; beyond 2x the extra pixels are not visible at game distance. */
const MAX_DPR = 2;

export class GameRenderer {
  // ── Scene and render target ──
  readonly renderer: THREE.WebGLRenderer;

  private scene = new THREE.Scene();

  private target: THREE.WebGLRenderTarget;

  private gradeScene = new THREE.Scene();

  private gradeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private sky: THREE.Mesh;
  private sun: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private effects: Effects;
  private mapReady = false;

  /** Render clock (seconds of frames drawn), drives animation; independent of the sim clock. */
  private time = 0;

  private viewNo = 0;

  /** FRAME.id of the last scene.updateMatrixWorld (done once per frame, before the first view). */
  private matrixFrame = -1;

  private frustum = new THREE.Frustum();

  private cullMat = new THREE.Matrix4();

  // ── Views of the current world (rebuilt by setWorld) ──
  private entityViews: EntityViews;
  combatFx: CombatFx;
  private hazards!: HazardViews;
  private relicView: RelicView | null = null;
  private heroProps: HeroPropViews | null = null;

  private reticles = new Reticles();

  private reticleReqs: ReticleReq[] = [];
  private heroModels: HeroModels;
  private structureModels: StructureModels;
  private teamColors: THREE.Color[];

  // ── Options set by the app ──

  /** Menu backdrop: no damage numbers, callouts, bars. */
  quiet = false;

  /** Orbiting preview camera drawn into a screen sub-rect (fractions of the screen, top-left origin). */
  demoCam: {
    rect: [number, number, number, number];
    target: { x: number; y: number; z: number };
    yaw: number;
    pitch: number;
    dist: number;
  } | null = null;

  /** Slow automatic pan across the map (title screen) instead of following heroes. */
  cinematic = false;

  /** Draw the shared camera into this screen sub-rect only. */
  windowRect: [number, number, number, number] | null = null;
  /** Pause / results backdrop: frame the whole field, never shake. */
  overview = false;

  shakeMul = 1;
  hints = true;
  private humanList: boolean[] = [];

  /** 0 = one shared camera for everyone; otherwise each local human gets a split view. */
  camMode = 1;

  /** Per player: use the zoom step chosen with zoomStep() instead of automatic framing. */
  manualZoom: boolean[] = [];

  /** 1 = native; 0.75 for weak GPUs (Options → Graphics → Render scale). */
  renderScale = 1;

  constructor(
    private cfg: RenderConfig,
    private world: World,
    private map: MapView,
    heroes: HeroModels,
    structures: StructureModels,
    private unitModels: UnitModels,
  ) {
    outlineConfig.enabled = cfg.outlines;
    // Material.dispose is a no-op: three.js frees a shader program when its last material is disposed, so every
    // ended effect forced a recompile of the next one. Materials hold no GPU buffers; geometry and textures are
    // still disposed normally.
    THREE.Material.prototype.dispose = function () {};
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      stencil: true,
      depth: true,
    });
    this.renderer.debug.checkShaderErrors = !!import.meta.env.DEV;
    // Pixel ratio stays 1: fitTargets sizes the canvas in device pixels itself, so every viewport,
    // scissor and target rect below is in drawing-buffer pixels.
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
    const gradeMat = new THREE.ShaderMaterial({
      vertexShader: gradeVert,
      fragmentShader: gradeFrag,
      uniforms: {
        tScene: { value: this.target.texture },
        saturation: { value: cfg.saturation },
        vignette: { value: cfg.vignette },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.gradeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gradeMat));

    this.scene.fog = new THREE.Fog(new THREE.Color(cfg.fogColor), 30, 80);
    this.sky = makeSky(cfg.skyZenith, cfg.skyHorizon);
    this.renderer.setClearColor(cfg.skyHorizon, 1);
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
    this.hemi = hemi;
    this.effects = new Effects(new THREE.Box3());
    this.setMap(map, world.terrain);

    this.heroModels = heroes;
    this.structureModels = structures;
    this.combatFx = new CombatFx(this.teamColors);
    this.combatFx.world = world;
    this.entityViews = new EntityViews(
      world,
      this.teamColors,
      heroes,
      structures,
      cfg.heroScale,
      this.combatFx,
      unitModels,
      cfg.playerColors.map((c) => new THREE.Color(c)),
    );
    this.setWorld(world);

    this.fitTargets();
  }

  /**
   * Per-map lighting and sky (map JSON "atmosphere", e.g. Russet Hollow's dusk): any RenderConfig light/sky/fog key
   * it sets overrides the global config; other maps get the global values back.
   */
  private applyAtmosphere(t: Terrain): void {
    const a = { ...this.cfg, ...(t.atmosphere ?? {}) } as RenderConfig;
    this.sun.color.set(a.sunColor);
    this.sun.intensity = a.sunIntensity;
    this.hemi?.color.set(a.ambientSky);
    this.hemi?.groundColor.set(a.ambientGround);
    if (this.hemi) this.hemi.intensity = a.ambientIntensity;
    (this.scene.fog as THREE.Fog).color.set(a.fogColor);
    const su = (this.sky.material as THREE.ShaderMaterial).uniforms;
    su.zenith.value.set(a.skyZenith);
    su.horizon.value.set(a.skyHorizon);
    this.renderer.setClearColor(a.skyHorizon, 1);
  }

  setMap(map: MapView, t: Terrain): void {
    if (this.mapReady) {
      this.scene.remove(this.map.root);
      this.scene.remove(this.effects.root);
    }
    this.mapReady = true;
    this.map = map;
    this.scene.add(map.root);
    this.applyAtmosphere(t);
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
    this.effects = new Effects(bounds, !!t.atmosphere?.leaves);
    this.scene.add(this.effects.root);
    for (const f of map.fx) {
      if (f.name === "fx_torch") this.effects.addTorch(f.position, true);
      else if (f.name === "fx_glow") this.effects.addGlow(f.position, 0x9fe8ff, 1.6);
    }
    this.camInit = false;
  }

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
    if (this.heroProps) this.scene.remove(this.heroProps.root);
    this.heroProps = new HeroPropViews(world, this.cfg.heroScale);
    this.heroProps.fx = this.combatFx;
    this.scene.add(this.heroProps.root);
    this.entityViews = new EntityViews(
      world,
      this.teamColors,
      this.heroModels,
      this.structureModels,
      this.cfg.heroScale,
      this.combatFx,
      this.unitModels,
      this.cfg.playerColors.map((c) => new THREE.Color(c)),
    );
    this.entityViews.humans = this.humanList;
    this.entityViews.hints = this.hints;
    this.scene.add(this.entityViews.root, this.entityViews.extras, this.combatFx.root);
    this.camInit = false;
  }

  setHumans(h: boolean[]): void {
    this.humanList = h;
    this.entityViews.humans = h;
  }

  setHints(on: boolean): void {
    this.hints = on;
    this.entityViews.hints = on;
  }

  setReticles(r: ReticleReq[]): void {
    this.reticleReqs = r;
  }

  setMenus(open: boolean[]): void {
    this.entityViews.menus = open;
  }

  get teamColorList(): THREE.Color[] {
    return this.teamColors;
  }

  // ── Output size ──
  // Checked every frame (cheap string compare), never from resize events, so the canvas and target always
  // match the window: CSS size × min(DPR, 2) × renderScale, in device pixels.

  private sizeKey = "";

  private fitTargets(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR) * this.renderScale;
    const max = this.renderer.capabilities.maxTextureSize;
    const w = Math.max(1, Math.min(max, Math.round(window.innerWidth * ratio)));
    const h = Math.max(1, Math.min(max, Math.round(window.innerHeight * ratio)));
    const key = `${w}x${h}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    this.renderer.setSize(w, h, false);
    this.target.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ── Shared camera ──
  // Used when no split views are active: follows every hero (or pans across the map when cinematic).

  private camera: THREE.PerspectiveCamera;
  private camFocus = new THREE.Vector3();
  private camWidth: number;
  private camInit = false;
  private cineT = 0;

  private demoCamera = new THREE.PerspectiveCamera(38, 1, 0.3, 300);

  private updateCamera(points: THREE.Vector3[], dt: number): void {
    if (this.cinematic && !this.splitViews.length) {
      this.cineT += dt;
      const t = this.world.terrain;
      const k = this.cineT * 0.045;
      const f = new THREE.Vector3(
        t.width / 2 + Math.sin(k) * t.width * 0.28,
        0,
        t.depth / 2 + Math.sin(k * 0.7 + 1) * t.depth * 0.12,
      );
      f.y = this.world.groundY(f.x, f.z);
      this.camFocus.lerp(f, this.camInit ? Math.min(1, dt * 2) : 1);
      this.camInit = true;
      this.camWidth += (Math.min(t.width, 46) - this.camWidth) * Math.min(1, dt * 2);
      placeCam(this.cfg, this.camera, this.camFocus, this.camWidth);
      return;
    }
    const st = { focus: this.camFocus, width: this.camWidth, init: this.camInit };
    aimCamera(this.cfg, this.world.terrain, this.camera, st, points, dt, this.cfg.minViewWidth);
    this.camWidth = st.width;
    this.camInit = st.init;
  }

  // ── Split screen ──
  // One view per local human; each gets its own camera and a scissor rect in the shared target.

  private splitViews: {
    cam: THREE.PerspectiveCamera;
    st: { focus: THREE.Vector3; width: number; init: boolean };
    heroIds: number[];
    player: number;
  }[] = [];

  /** Manual zoom widths (metres across); players start at index 2. */
  private zoomSteps = [14, 18, 22, 28, 36, 48, 64, 90, 120, 150];
  private zoomIndex = new Map<number, number>();

  /** Per player: who the spectator camera follows once the player's team is out. */
  private watching = new Map<number, number>();

  /** A player's split viewport as screen fractions (top-left origin), for the HUD; null without split screen. */
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

  /** 0..1 how far the single local view is zoomed out (log scale between 14 m and 150 m). */
  zoomOut(): number {
    const sv = this.splitViews?.[0];
    if (!sv || this.splitViews.length !== 1) return 0;
    return THREE.MathUtils.clamp((Math.log(sv.st.width) - Math.log(14)) / (Math.log(150) - Math.log(14)), 0, 1);
  }

  zoomStep(player: number, dir: number): void {
    const i = this.zoomIndex.get(player) ?? 2;
    this.zoomIndex.set(player, Math.max(0, Math.min(this.zoomSteps.length - 1, i + dir)));
  }

  /** Rebuilds the split view list when the set of local humans changes (cameras are reused per hero). */
  private syncSplit(): void {
    const humans = this.camMode ? this.world.players.filter((p) => this.humanList[p.player]) : [];
    humans.sort((a, b) => (humans.length === 2 ? a.team - b.team : 0) || a.player - b.player);
    const ids = humans.map((p) => p.heroId);
    const groups: { ids: number[]; player: number }[] = !ids.length
      ? []
      : ids.length === 1
        ? [{ ids, player: humans[0].player }]
        : humans.map((p) => ({ ids: [p.heroId], player: p.player }));
    const same =
      groups.length === this.splitViews.length &&
      groups.every((g, i) => g.ids.join() === this.splitViews[i].heroIds.join());
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

  /**
   * What a split view should frame: its hero (and aim point); once the team is out, the nearest standing hero;
   * commanders frame all their units; with manual zoom a fixed width; otherwise nearby enemies and towers widen
   * the shot (tighter in fights). `own` counts the leading points that must stay on screen.
   */
  private frameView(sv: { heroIds: number[]; player: number }): {
    pts: THREE.Vector3[];
    min: number;
    max: number;
    margin: number;
    own?: number;
  } {
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
        const near = w.players
          .map((p) => w.getAny(p.heroId))
          .filter(ok)
          .sort(
            (a, b) =>
              Math.hypot(a!.transform.pos.x - sp.x, a!.transform.pos.z - sp.z) -
              Math.hypot(b!.transform.pos.x - sp.x, b!.transform.pos.z - sp.z),
          )[0];
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
      return {
        pts: [new THREE.Vector3(sp.x, 0, sp.z)],
        min: this.cfg.splitViewWidth,
        max: this.cfg.splitViewWidth,
        margin: 0,
      };
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
    for (let i = sv.heroIds.length; i < ownN; i++)
      for (let j = 0; j < sv.heroIds.length; j++) if (pts[j]) reach = Math.max(reach, pts[i].distanceTo(pts[j]));
    return {
      pts,
      min,
      max: Math.max(min, 34 * Math.max(1, zf), reach * 1.25 + 18),
      margin: (fight ? 6 : 8) * zf,
      own: ownN,
    };
  }

  /** Viewports in target pixels (bottom-left origin): full, two halves, or quadrants. */
  private splitRects(w: number, h: number): [number, number, number, number][] {
    const n = this.splitViews.length;
    const hw = Math.floor(w / 2);
    const hh = Math.floor(h / 2);
    if (n === 1) return [[0, 0, w, h]];
    if (n === 2)
      return [
        [0, 0, hw, h],
        [hw, 0, w - hw, h],
      ];
    return [
      [0, hh, hw, h - hh],
      [hw, h - hh, w - hw, hh],
      [0, 0, hw, hh],
      [hw, 0, w - hw, hh],
    ];
  }

  /** The team whose fog of war a shared view uses: the local humans' team if they're all on one, else none. */
  private sharedViewer(): number | null {
    const teams = new Set(this.world.players.filter((p) => this.humanList[p.player]).map((p) => p.team));
    return teams.size === 1 ? [...teams][0] : null;
  }

  // ── Frame ──

  /**
   * One frame: route this tick's sim events to the views, sync every view, then draw each camera's viewport into
   * the scene target and grade it to the canvas.
   */
  render(alpha: number, dt: number): void {
    FRAME.id++;
    this.viewNo = 0;
    let pt = perf.now();
    this.combatFx.quiet = this.quiet;
    this.entityViews.quiet = this.quiet || !!this.demoCam;
    this.scene.matrixWorldAutoUpdate = false;
    this.time += dt;
    this.drainEvents();
    pt = perf.cpu("r.events", pt);
    this.entityViews.sync(alpha, dt, this.time);
    pt = perf.cpu("r.entities", pt);
    this.relicView?.sync(alpha, dt);
    this.heroProps?.sync(alpha, dt);
    this.combatFx.syncProjectiles(this.world, alpha);
    this.combatFx.syncMissiles(this.world);
    this.combatFx.syncBanners(this.world, performance.now() / 1000);
    this.combatFx.update(dt);
    this.hazards.sync(this.time, dt);
    if (!this.reticles.root.parent) this.scene.add(this.reticles.root);
    this.reticles.sync(this.world, this.reticleReqs, this.time);
    pt = perf.cpu("r.fx", pt);
    this.syncSplit();
    this.fitTargets();
    this.map.update(this.time, this.world.tideLevel());
    this.effects.update(this.time, dt);
    this.renderer.setRenderTarget(this.target);
    if (this.demoCam) this.drawDemo(this.demoCam);
    else if (this.windowRect && !this.splitViews.length) this.drawWindow(this.windowRect, dt);
    else if (!this.splitViews.length) this.drawFull(dt);
    else this.drawSplit(dt);
    // Grade pass: target → canvas, 1:1 pixels.
    this.renderer.setRenderTarget(null);
    this.renderer.setViewport(0, 0, this.target.width, this.target.height);
    this.renderer.setScissor(0, 0, this.target.width, this.target.height);
    pt = perf.now();
    perf.gpuBegin("post");
    this.renderer.render(this.gradeScene, this.gradeCam);
    perf.gpuEnd();
    perf.cpu("r.post", pt);
  }

  /**
   * Map/hazard events go to HazardViews, hits and rank-ups also to EntityViews (flash, jolt, hit-stop), and
   * everything except plain builds to CombatFx. The sim never reads events back, so they are cleared here.
   */
  private drainEvents(): void {
    for (const ev of this.world.events) {
      if (
        ev.type === "mod" ||
        ev.type === "modEnd" ||
        ev.type === "avalanche" ||
        ev.type === "gates" ||
        ev.type === "lantern" ||
        ev.type === "mist" ||
        ev.type === "morph" ||
        ev.type === "jumppad" ||
        ev.type === "horn" ||
        ev.type === "geyser"
      )
        this.hazards.handle(ev);
      if (ev.type === "hit" && ev.id !== undefined && !ev.blocked) {
        this.entityViews.onHit(ev.id);
        this.entityViews.onImpact(ev.id, ev.src, ev.fx, ev.fz, ev.big);
      }
      if (ev.type === "rankUp") this.entityViews.onRankUp(ev.id);
      if (ev.type === "build" && !ev.upgrade) continue;
      this.combatFx.handle(ev);
    }
    this.world.events.length = 0;
    this.shoveHints();
  }

  private shoveHintAt = new Map<number, number>();

  /**
   * Button hint (local only, with hints on): when a local human's hero stands next to an enemy champion who keeps
   * blocking, float "L+A · BREAK GUARD" over the blocker (at most every 6 s per blocker).
   */
  private shoveHints(): void {
    const w = this.world;
    if (!this.hints || w.match.phase === "over") return;
    for (const p of w.players) {
      if (!this.humanList[p.player]) continue;
      const me = w.heroForPlayer(p.player);
      if (!me?.alive || me.hero?.dead) continue;
      for (const o of w.entities) {
        if (!o.alive || !o.hero || o.hero.dead || o.team === me.team || !o.hero.blocking) continue;
        if (w.dist(me, o) > 3.2 || this.time - (this.shoveHintAt.get(o.id) ?? -99) < 6) continue;
        this.shoveHintAt.set(o.id, this.time);
        const t = o.transform;
        this.combatFx.handle({
          type: "callout",
          x: t.pos.x,
          y: t.y,
          z: t.pos.z,
          team: me.team,
          text: "L+A · BREAK GUARD",
          owner: o.id,
        });
      }
    }
  }

  /** Draws the scene once for `cam` into whatever viewport/scissor is current. */
  private drawScene(cam: THREE.PerspectiveCamera, viewer: number | null = this.sharedViewer()): void {
    let t0 = perf.now();
    const key = "v" + this.viewNo++;
    this.entityViews.setViewer(viewer);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = cam.userData.fogNear ?? fog.near;
    fog.far = cam.userData.fogFar ?? fog.far;
    this.sky.position.copy(cam.position);
    cam.updateMatrixWorld();
    this.sky.visible = true;
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
    t0 = perf.cpu(key + ".prep", t0);
    const info = this.renderer.info.render;
    const c0 = info.calls;
    const tr0 = info.triangles;
    perf.gpuBegin(key);
    this.renderer.render(this.scene, cam);
    perf.gpuEnd();
    perf.stat(key + ".calls", info.calls - c0);
    perf.stat(key + ".ktris", (info.triangles - tr0) / 1000);
    t0 = perf.cpu(key + ".draw", t0);
    this.entityViews.uncull();
  }

  /** Random camera jitter from CombatFx.shake (scaled by the shake option). */
  private shake(cam: THREE.PerspectiveCamera): void {
    if (this.combatFx.shake <= 0) return;
    const k = this.combatFx.shake * 0.5 * this.shakeMul;
    cam.position.x += (Math.random() - 0.5) * k;
    cam.position.y += (Math.random() - 0.5) * k;
  }

  /**
   * Converts a [x, y, w, h] screen fraction (top-left origin) to target pixels (bottom-left origin), and clears
   * the whole target first so the area around the rect is the clear colour.
   */
  private clearForRect([fx, fy, fw, fh]: [number, number, number, number]): [number, number, number, number] {
    const tw = this.target.width;
    const th = this.target.height;
    this.renderer.setScissor(0, 0, tw, th);
    this.renderer.setScissorTest(true);
    this.renderer.clear();
    const w = Math.max(1, Math.round(fw * tw));
    const h = Math.max(1, Math.round(fh * th));
    return [Math.round(fx * tw), Math.round(th - (fy + fh) * th), w, h];
  }

  /** Orbiting preview camera in a sub-rect (menu backdrops, codex). */
  private drawDemo(d: NonNullable<GameRenderer["demoCam"]>): void {
    const [x, y, w, h] = this.clearForRect(d.rect);
    const cam = this.demoCamera;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const cp = Math.cos(d.pitch);
    cam.position.set(
      d.target.x + Math.sin(d.yaw) * cp * d.dist,
      d.target.y + Math.sin(d.pitch) * d.dist,
      d.target.z + Math.cos(d.yaw) * cp * d.dist,
    );
    cam.lookAt(d.target.x, d.target.y, d.target.z);
    cam.userData.fogNear = d.dist * 7;
    cam.userData.fogFar = d.dist * 18;
    this.shake(cam);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.setScissor(x, y, w, h);
    this.drawScene(cam, null);
    this.renderer.setScissorTest(false);
  }

  /** The shared camera drawn into a sub-rect of the screen (windowed match view); FFA cycles between fights. */
  private drawWindow(rect: [number, number, number, number], dt: number): void {
    const [x, y, w, h] = this.clearForRect(rect);
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
        aimCamera(this.cfg, this.world.terrain, this.camera, st, near, dt, this.cfg.minViewWidth, 34);
        this.camWidth = st.width;
        this.camInit = st.init;
      }
    } else if (this.overview) {
      // Pause / results: a still, wide shot of the whole field (no shake, no smoothing - dt is 0 while paused).
      const t = this.world.terrain;
      const corners = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(t.width, 0, t.depth)];
      const st = { focus: this.camFocus, width: this.camWidth, init: false };
      aimCamera(this.cfg, t, this.camera, st, corners, 1, t.width, Infinity, 0);
      this.camWidth = st.width;
    } else this.updateCamera(this.entityViews.heroPoints(), dt);
    if (!this.overview) this.shake(this.camera);
    this.renderer.setViewport(x, y, w, h);
    this.renderer.setScissor(x, y, w, h);
    this.drawScene(this.camera);
    this.renderer.setScissorTest(false);
  }

  /** The shared camera over the whole target. */
  private drawFull(dt: number): void {
    const asp = this.target.width / this.target.height;
    if (Math.abs(this.camera.aspect - asp) > 1e-3) {
      this.camera.aspect = asp;
      this.camera.updateProjectionMatrix();
    }
    this.updateCamera(this.entityViews.heroPoints(), dt);
    this.shake(this.camera);
    this.drawScene(this.camera);
  }

  /** One scissored viewport per local human (2 side by side, 3-4 in quadrants), each with its own fog-of-war. */
  private drawSplit(dt: number): void {
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
        aimCamera(
          this.cfg,
          this.world.terrain,
          cam,
          sv.st,
          f.pts,
          dt,
          f.min,
          f.max,
          f.margin,
          own,
          sv.heroIds.length === 1,
        );
      } else {
        cam = this.camera;
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        this.updateCamera(all, dt);
      }
      this.shake(cam);
      this.renderer.setViewport(x, y, w, h);
      this.renderer.setScissor(x, y, w, h);
      const vp = sv ? this.world.players.find((p) => p.player === sv.player) : undefined;
      const viewer = sv && sv.heroIds.length === 1 && vp ? vp.team : this.sharedViewer();
      this.drawScene(cam, viewer);
    });
    this.renderer.setScissorTest(false);
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const cam = this.splitViews.length === 1 ? this.splitViews[0].cam : this.camera;
    const v = new THREE.Vector3(x, y, z).project(cam);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }
}
