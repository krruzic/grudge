// Floating text for combat: damage/heal numbers and short labels (MISS, CRIT!, K.O.!) share one instanced batch
// fed from a text atlas; ability callouts and level-up/talent banners are cached canvas sprites.
import * as THREE from "three";
import { cacheCanvas } from "../../ui/cacheCanvas";
import { fontReady, onTextLost, drawNum, drawNumPart, textWidth, drawText } from "../../ui/font";

// ── Text atlas ──
// Damage numbers and labels are baked once into fixed-size rows ("slots") of one tall DataTexture and drawn as
// instanced quads (FloatBatch), so a big fight costs one draw call and no per-number canvas/texture.
// Slots are refcounted per live floater and keyed by (scale, y, colour, text); when the atlas is full the least
// recently used idle slot is reused. Text bakes at TK x the logical size so it stays sharp at native resolution.

const TK = 3;
const SLOT_LW = 128;
const SLOT_LH = 32;
const SLOT_W = SLOT_LW * TK;
const SLOT_TEX_H = SLOT_LH * TK;
const SLOT_H = 40 * TK;
const SLOT_PAD = 4 * TK;
const ATLAS_H = 8192;
const SLOT_N = Math.floor(ATLAS_H / SLOT_H);

export const numText = (n: number): string => String(Math.max(1, Math.round(n)));

class TextAtlas {
  readonly tex: THREE.DataTexture;
  private keys: (string | null)[] = new Array(SLOT_N).fill(null);
  private specs: ([string, string, number, number] | null)[] = new Array(SLOT_N).fill(null);
  private refs = new Int32Array(SLOT_N);
  private used = new Float64Array(SLOT_N);
  private stamp = 0;
  private bySpec = new Map<string, number>();
  private pending: { slot: number; src: THREE.Texture }[] = [];
  private spare: THREE.Texture[] = [];
  private at = new THREE.Vector2();

  constructor() {
    this.tex = new THREE.DataTexture(new Uint8Array(SLOT_W * ATLAS_H * 4), SLOT_W, ATLAS_H);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.flipY = true;
    this.tex.generateMipmaps = true;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    fontReady.then(() => this.redraw());
    onTextLost(() => this.redraw());
  }

  acquire(text: string, color: string, scale: number, y: number): number {
    const key = `${scale}|${y}|${color}|${text}`;
    let s = this.bySpec.get(key);
    if (s === undefined) {
      s = this.victim();
      const old = this.keys[s];
      if (old !== null) this.bySpec.delete(old);
      this.keys[s] = key;
      this.specs[s] = [text, color, scale, y];
      this.bySpec.set(key, s);
      this.draw(s);
    }
    this.refs[s]++;
    this.used[s] = ++this.stamp;
    return s;
  }

  release(s: number): void {
    if (this.refs[s] > 0) this.refs[s]--;
  }

  /** A free slot, else the least recently used idle one, else the least recently used of all. */
  private victim(): number {
    let idle = -1;
    let any = 0;
    for (let i = 0; i < SLOT_N; i++) {
      if (this.keys[i] === null) return i;
      if (this.refs[i] === 0 && (idle < 0 || this.used[i] < this.used[idle])) idle = i;
      if (this.used[i] < this.used[any]) any = i;
    }
    return idle >= 0 ? idle : any;
  }

  /** Bakes a slot into a small canvas texture; flush() copies it into the atlas on the GPU before the next draw. */
  private draw(s: number): void {
    const src =
      this.spare.pop() ?? new THREE.Texture(Object.assign(cacheCanvas(), { width: SLOT_W, height: SLOT_TEX_H }));
    const ctx = (src.image as HTMLCanvasElement).getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SLOT_W, SLOT_TEX_H);
    ctx.setTransform(TK, 0, 0, TK, 0, 0);
    const [text, color, scale, y] = this.specs[s]!;
    drawNum(ctx, text, (SLOT_LW - textWidth(text, scale, true)) / 2, y, color, scale);
    this.pending.push({ slot: s, src });
  }

  private redraw(): void {
    for (let i = 0; i < SLOT_N; i++) if (this.specs[i]) this.draw(i);
  }

  flush(r: THREE.WebGLRenderer): void {
    if (!this.pending.length) return;
    for (const p of this.pending) {
      r.copyTextureToTexture(p.src, this.tex, null, this.at.set(0, p.slot * SLOT_H + SLOT_PAD));
      this.spare.push(p.src);
    }
    this.pending.length = 0;
  }
}

export const textAtlas = new TextAtlas();

// ── Digit atlas ──
// Damage numbers change constantly (merging hits count up), so they are not baked per value: every digit of every
// number colour is baked once, one cell per layer (shadow, outline, fill), and a number is drawn as one quad per
// digit and layer (FloatBatch's digit mesh), stacked shadows first like drawNum. No canvas, upload or mipmap work
// per number.
const PART_ORDER = ["shadow", "edge", "fill"] as const;
const DIGITS = "0123456789";
/** Cell size in slot layout units (a slot is SLOT_LW x SLOT_LH). */
const CELL_LW = 32;
const CELL_LH = SLOT_LH;
const DIGIT_COLS = DIGITS.length;

class DigitAtlas {
  readonly colors: string[] = [];
  readonly tex: THREE.CanvasTexture;
  private canvas = cacheCanvas();
  /** Layout width of each digit at NUM_SCALE. */
  readonly width = new Float32Array(10);
  rows = 0;

  constructor(colors: string[]) {
    this.colors = colors;
    this.rows = colors.length * PART_ORDER.length;
    this.canvas.width = DIGIT_COLS * CELL_LW * TK;
    this.canvas.height = this.rows * CELL_LH * TK;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    fontReady.then(() => this.draw());
    onTextLost(() => this.draw());
  }

  /** Cell of digit d (0-9) in colour c, layer p. */
  cell(c: number, p: number, d: number): number {
    return (c * PART_ORDER.length + p) * DIGIT_COLS + d;
  }

  private draw(): void {
    const ctx = this.canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let d = 0; d < 10; d++) this.width[d] = textWidth(DIGITS[d], NUM_SCALE, true);
    this.colors.forEach((color, c) =>
      PART_ORDER.forEach((part, p) => {
        for (let d = 0; d < 10; d++) {
          const i = this.cell(c, p, d);
          const x0 = (i % DIGIT_COLS) * CELL_LW;
          const y0 = Math.floor(i / DIGIT_COLS) * CELL_LH;
          ctx.setTransform(TK, 0, 0, TK, x0 * TK, y0 * TK);
          drawNumPart(ctx, DIGITS[d], (CELL_LW - this.width[d]) / 2, 2, color, NUM_SCALE, part);
        }
      }),
    );
    this.tex.needsUpdate = true;
  }
}

// ── Floating quads ──
// One instanced quad per floater: iPos (world position, billboarded in view space), iSize (world size),
// iTex = (slot row, alpha). The vertex shader maps the quad's uv into that slot's row of the atlas.
const FLOAT_VERT = `
attribute vec3 iPos;
attribute vec2 iSize;
attribute vec2 iTex;
varying vec2 vUv;
varying float vAlpha;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = vec2(uv.x, (iTex.x * ${SLOT_H.toFixed(1)} + ${SLOT_PAD.toFixed(1)} + uv.y * ${SLOT_TEX_H.toFixed(1)}) / ${ATLAS_H.toFixed(1)});
  vAlpha = iTex.y;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  mvPosition.xy += position.xy * iSize;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FLOAT_FRAG = `
uniform sampler2D map;
varying vec2 vUv;
varying float vAlpha;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb, t.a * vAlpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
let sharedDigits: DigitAtlas | undefined;

const DIGIT_VERT = `
attribute vec3 iPos;
attribute vec4 iOff;
attribute vec2 iTex;
uniform vec2 grid;
varying vec2 vUv;
varying float vAlpha;
#include <common>
#include <fog_pars_vertex>
void main() {
  float col = mod(iTex.x, grid.x);
  float row = floor(iTex.x / grid.x + 0.001);
  vUv = vec2((col + uv.x) / grid.x, 1.0 - (row + 1.0 - uv.y) / grid.y);
  vAlpha = iTex.y;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  mvPosition.xy += position.xy * iOff.zw + iOff.xy;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

/** A live number or label; step(k, dt) animates position/size/alpha for k = 0..1 over `dur`. */
export interface Floater {
  /** Text atlas slot (labels), or -1 for a damage number drawn digit by digit from `num`. */
  slot: number;
  /** Damage number: its digits and colour index in the digit atlas. */
  num?: { text: string; color: number };
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  a: number;
  t: number;
  dur: number;
  layer: number;
  step: (k: number, dt: number) => void;
  done?: () => void;
}
export class FloatBatch {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private cap = 64;
  private pos = new Float32Array(0);
  private size = new Float32Array(0);
  private tex = new Float32Array(0);
  list: Floater[] = [];
  /** Damage numbers: one instance per digit and layer (see DigitAtlas). */
  readonly digitMesh: THREE.Mesh;
  readonly digits = (sharedDigits ??= new DigitAtlas([...NUM_RANK, HEAL_COLOR]));
  private dGeo = new THREE.InstancedBufferGeometry();
  private dCap = 128;
  private dPos = new Float32Array(0);
  private dOff = new Float32Array(0);
  private dTex = new Float32Array(0);

  constructor() {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo.index = base.index;
    this.geo.setAttribute("position", base.getAttribute("position"));
    this.geo.setAttribute("uv", base.getAttribute("uv"));
    this.alloc();
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
      vertexShader: FLOAT_VERT,
      fragmentShader: FLOAT_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: true,
    });
    mat.uniforms.map.value = textAtlas.tex;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 31;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (r) => textAtlas.flush(r);

    this.dGeo.index = base.index;
    this.dGeo.setAttribute("position", base.getAttribute("position"));
    this.dGeo.setAttribute("uv", base.getAttribute("uv"));
    this.allocDigits();
    const dMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { map: { value: null }, grid: { value: new THREE.Vector2(DIGIT_COLS, this.digits.rows) } },
      ]),
      vertexShader: DIGIT_VERT,
      fragmentShader: FLOAT_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: true,
    });
    dMat.uniforms.map.value = this.digits.tex;
    this.digitMesh = new THREE.Mesh(this.dGeo, dMat);
    this.digitMesh.frustumCulled = false;
    this.digitMesh.renderOrder = 32;
    this.digitMesh.visible = false;
  }

  /** Digit atlas colour index of a number colour, or -1 (then the number uses a text slot). */
  numColor(color: string): number {
    return this.digits.colors.indexOf(color);
  }

  private allocDigits(): void {
    this.dPos = new Float32Array(this.dCap * 3);
    this.dOff = new Float32Array(this.dCap * 4);
    this.dTex = new Float32Array(this.dCap * 2);
    this.dGeo.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.dPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dGeo.setAttribute("iOff", new THREE.InstancedBufferAttribute(this.dOff, 4).setUsage(THREE.DynamicDrawUsage));
    this.dGeo.setAttribute("iTex", new THREE.InstancedBufferAttribute(this.dTex, 2).setUsage(THREE.DynamicDrawUsage));
  }

  /** Writes every damage number's digit quads (each number: all shadows, then outlines, then fills). */
  private updateDigits(): void {
    let need = 0;
    for (const f of this.list) if (f.num) need += f.num.text.length * PART_ORDER.length;
    if (need > this.dCap) {
      while (this.dCap < need) this.dCap *= 2;
      this.allocDigits();
    }
    const W = this.digits.width;
    let j = 0;
    for (const f of this.list) {
      const n = f.num;
      if (!n) continue;
      // World units per slot layout unit: the quad spans SLOT_LW x SLOT_LH at (sx, sy).
      const ux = f.sx / SLOT_LW;
      const uy = f.sy / SLOT_LH;
      let total = 0;
      for (let i = 0; i < n.text.length; i++) total += W[n.text.charCodeAt(i) - 48];
      for (let p = 0; p < PART_ORDER.length; p++) {
        let pen = -total / 2;
        for (let i = 0; i < n.text.length; i++) {
          const d = n.text.charCodeAt(i) - 48;
          this.dPos[j * 3] = f.x;
          this.dPos[j * 3 + 1] = f.y;
          this.dPos[j * 3 + 2] = f.z;
          this.dOff[j * 4] = (pen + W[d] / 2) * ux;
          this.dOff[j * 4 + 1] = 0;
          this.dOff[j * 4 + 2] = CELL_LW * ux;
          this.dOff[j * 4 + 3] = CELL_LH * uy;
          this.dTex[j * 2] = this.digits.cell(n.color, p, d);
          this.dTex[j * 2 + 1] = f.a;
          pen += W[d];
          j++;
        }
      }
    }
    this.dGeo.instanceCount = j;
    this.digitMesh.visible = j > 0;
    (this.dGeo.getAttribute("iPos") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.dGeo.getAttribute("iOff") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.dGeo.getAttribute("iTex") as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  private alloc(): void {
    this.pos = new Float32Array(this.cap * 3);
    this.size = new Float32Array(this.cap * 2);
    this.tex = new Float32Array(this.cap * 2);
    this.geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("iSize", new THREE.InstancedBufferAttribute(this.size, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("iTex", new THREE.InstancedBufferAttribute(this.tex, 2).setUsage(THREE.DynamicDrawUsage));
  }

  /** Steps every floater, drops finished ones, and rewrites the instance buffers (layer 0 labels under layer 1 numbers). */
  update(dt: number): void {
    if (!this.list.length && !this.mesh.visible && !this.digitMesh.visible) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.step(k, dt);
      if (k >= 1) {
        if (f.slot >= 0) textAtlas.release(f.slot);
        f.done?.();
        this.list.splice(i, 1);
      }
    }
    const n = this.list.length;
    if (n > this.cap) {
      while (this.cap < n) this.cap *= 2;
      this.alloc();
    }
    let j = 0;
    for (let layer = 0; layer < 2; layer++) {
      for (const f of this.list) {
        if (f.layer !== layer || f.slot < 0) continue;
        this.pos[j * 3] = f.x;
        this.pos[j * 3 + 1] = f.y;
        this.pos[j * 3 + 2] = f.z;
        this.size[j * 2] = f.sx;
        this.size[j * 2 + 1] = f.sy;
        this.tex[j * 2] = f.slot;
        this.tex[j * 2 + 1] = f.a;
        j++;
      }
    }
    this.geo.instanceCount = j;
    this.mesh.visible = j > 0;
    (this.geo.getAttribute("iPos") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("iSize") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("iTex") as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.updateDigits();
  }
}

// ── Damage numbers ──
/** Number colours in priority order: merging hits keep the highest (white < big < hero damage < crit). */
export const NUM_RANK = ["#ffffff", "#ffd84a", "#ff6a4a", "#ffe040"];
export const HEAL_COLOR = "#7dff7a";
export const NUM_SCALE = 2.6;
export interface NumState {
  f: Floater;
  amount: number;
  color: string;
  big: boolean;
  mul: number;
  born: number;
  last: number;
}
// ── Callouts ──
// Ability callouts and level/talent banners are short-lived sprites with their own canvas, cached per
// (text, colour) and rebuilt when the font atlas is lost.
const calloutCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();
export function calloutTex(text: string, color: string): { tex: THREE.CanvasTexture; aspect: number } {
  const key = `${text}|${color}`;
  const hit = calloutCache.get(key);
  if (hit) return hit;
  const s = 1.6;
  const c = cacheCanvas();
  const lw = Math.ceil(textWidth(text, s) + 12);
  c.width = lw * TK;
  c.height = 30 * TK;
  const ctx = c.getContext("2d")!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(TK, 0, 0, TK, 0, 0);
    ctx.fillStyle = "rgba(14,10,8,0.72)";
    ctx.fillRect(0, 4, lw, 22);
    drawText(ctx, text, 6, 6, color, s);
    t.needsUpdate = true;
  };
  draw();
  fontReady.then(draw);
  const out = { tex: t, aspect: c.width / c.height };
  calloutCache.set(key, out);
  return out;
}
onTextLost(() => {
  for (const v of calloutCache.values()) v.tex.dispose();
  calloutCache.clear();
});
// ── Labels ──
/** [text, colour] for CombatFx.label(). */
export type Label = [string, string];
export const MISS_LABEL: Label = ["MISS", "#e0e0e0"];
export const KO_LABEL: Label = ["K.O.!", "#ff5a3a"];
export const BLOCK_LABEL: Label = ["BLOCK", "#9fd8ff"];
export const PARRY_LABEL: Label = ["PARRY!", "#ffe070"];
export const FALL_LABEL: Label = ["FALL!", "#ffb050"];
export const CRIT_LABEL: Label = ["CRIT!", "#ffe040"];
export const RANK_LABELS = ["VETERAN", "ELITE", "HEROIC"].map((t): Label => [t, "#ffcc33"]);
