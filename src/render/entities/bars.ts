// Health and work (build/recall/upgrade) bars. Every visible bar is three quads (background, white "ghost" of
// recent damage, fill) written into one instanced, camera-facing batch per view; the bar's group is just an
// anchor whose world matrix gives the position and scale.
import * as THREE from "three";

export interface Bar {
  group: THREE.Group;
  width: number;
  color: THREE.Color;
  fgColor: THREE.Color;
  frac: number;
  ghostFrac: number;
  holdUntil: number;
  drop?: number;
}
const BAR_MAX = 1536;
export class BarBatch {
  readonly mesh: THREE.Mesh;
  private rect: THREE.InstancedBufferAttribute;
  private center: THREE.InstancedBufferAttribute;
  private col: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private n = 0;

  constructor() {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute("position", base.getAttribute("position"));
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(BAR_MAX * 3), 3);
    this.rect = new THREE.InstancedBufferAttribute(new Float32Array(BAR_MAX * 4), 4);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(BAR_MAX * 4), 4);
    for (const a of [this.center, this.rect, this.col]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("iCenter", this.center);
    this.geo.setAttribute("iRect", this.rect);
    this.geo.setAttribute("iColor", this.col);
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute vec3 iCenter;
attribute vec4 iRect;
attribute vec4 iColor;
varying vec4 vCol;
void main() {
  vCol = iColor;
  vec4 mv = modelViewMatrix * vec4(iCenter, 1.0);
  mv.x += iRect.x + (position.x + 0.5) * iRect.y;
  mv.y += position.y * iRect.z - iRect.w;
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `varying vec4 vCol;
void main() {
  gl_FragColor = vCol;
  #include <colorspace_fragment>
}`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
    this.mesh.matrixAutoUpdate = false;
  }

  begin(): void {
    this.n = 0;
  }

  private quad(
    x: number,
    y: number,
    z: number,
    x0: number,
    w: number,
    h: number,
    c: THREE.Color,
    a: number,
    drop = 0,
  ): void {
    if (this.n >= BAR_MAX) return;
    const i = this.n++;
    this.center.array[i * 3] = x;
    this.center.array[i * 3 + 1] = y;
    this.center.array[i * 3 + 2] = z;
    this.rect.array[i * 4] = x0;
    this.rect.array[i * 4 + 1] = w;
    this.rect.array[i * 4 + 2] = h;
    this.rect.array[i * 4 + 3] = drop;
    this.col.array[i * 4] = c.r;
    this.col.array[i * 4 + 1] = c.g;
    this.col.array[i * 4 + 2] = c.b;
    this.col.array[i * 4 + 3] = a;
  }

  add(bar: Bar): void {
    const m = bar.group.matrixWorld.elements;
    const k = Math.hypot(m[0], m[1], m[2]);
    const x = m[12];
    const y = m[13];
    const z = m[14];
    const w = bar.width * k;
    const d = (bar.drop ?? 0) * k;
    this.quad(x, y, z, -(w + 0.08 * k) / 2, w + 0.08 * k, 0.2 * k, BAR_BG, 0.85, d);
    this.quad(x, y, z, -w / 2, Math.max(0.001, w * bar.ghostFrac), 0.13 * k, BAR_GHOST, 1, d);
    this.quad(x, y, z, -w / 2, Math.max(0.001, w * bar.frac), 0.13 * k, bar.fgColor, 1, d);
  }

  end(): void {
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    for (const a of [this.center, this.rect, this.col]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

const BAR_BG = new THREE.Color(0x101010);
const BAR_GHOST = new THREE.Color(0xfff0d0);
export const red = new THREE.Color(1, 0.15, 0.1);
export function makeBar(width: number, color: THREE.Color, y: number, drop = 0): Bar {
  const group = new THREE.Group();
  group.position.y = y;
  return { group, width, color: color.clone(), fgColor: color.clone(), frac: 1, ghostFrac: 1, holdUntil: 0, drop };
}
/**
 * Sets the fill; the ghost holds 0.35 s after damage then drains, and `pulse` makes low bars (< 30%) flash red.
 */
export function setBar(bar: Bar, frac: number, dt = 0, time = 0, pulse = false): void {
  const f = Math.max(0, Math.min(1, frac));
  if (f < bar.frac - 1e-4) bar.holdUntil = time + 0.35;
  if (f > bar.ghostFrac) bar.ghostFrac = f;
  bar.frac = f;
  if (time >= bar.holdUntil) bar.ghostFrac = Math.max(f, bar.ghostFrac - dt * 0.8);
  if (pulse && f < 0.3 && f > 0) bar.fgColor.copy(bar.color).lerp(red, 0.5 + 0.5 * Math.sin(time * 14));
  else bar.fgColor.copy(bar.color);
}
