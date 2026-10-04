import * as THREE from "three";

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  sx: number;
  sy: number;
  rot: number;
  spin: number;
  r: number;
  g: number;
  b: number;
  a: number;
  age: number;
  life: number;
  size0: number;
  grow: number;
  op: number;
  fadeIn: number;
  gravity: number;
  drag: number;
  floor: number;
  stretch: number;
}

const MAPS = 12;

const VERT = `
attribute vec3 iPos;
attribute vec4 iSize;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
flat varying float vTex;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vColor = iColor;
  vTex = iSize.w;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSize.z);
  float s = sin(iSize.z);
  vec2 p = position.xy * iSize.xy;
  mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
${Array.from({ length: MAPS }, (_, i) => `uniform sampler2D map${i};`).join("\n")}
varying vec2 vUv;
varying vec4 vColor;
flat varying float vTex;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 t;
  ${Array.from({ length: MAPS }, (_, i) => (i < MAPS - 1 ? `if (vTex < ${i}.5) t = texture2D(map${i}, vUv);` : `t = texture2D(map${i}, vUv);`)).join("\n  else ")}
  gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

interface Slot {
  tex: THREE.Texture;
  additive: boolean;
  depthTest: boolean;
  list: Particle[];
}

interface Lane {
  order: number;
  slots: Slot[];
  pool: Batch[];
}

class Batch {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private pos: Float32Array;
  private size: Float32Array;
  private col: Float32Array;
  private cap: number;
  private n = 0;
  texCount = 0;

  constructor(order: number) {
    this.cap = 256;
    this.geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo.index = base.index;
    this.geo.setAttribute("position", base.getAttribute("position"));
    this.geo.setAttribute("uv", base.getAttribute("uv"));
    this.pos = new Float32Array(this.cap * 3);
    this.size = new Float32Array(this.cap * 4);
    this.col = new Float32Array(this.cap * 4);
    this.bind();
    const maps: Record<string, THREE.IUniform> = {};
    for (let i = 0; i < MAPS; i++) maps[`map${i}`] = { value: null };
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, maps]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: true,
      blending: THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
  }

  private bind(): void {
    this.geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("iSize", new THREE.InstancedBufferAttribute(this.size, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
  }

  begin(additive: boolean, depthTest: boolean): void {
    const blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (this.mat.blending !== blending) this.mat.blending = blending;
    if (this.mat.depthTest !== depthTest) this.mat.depthTest = depthTest;
    this.n = 0;
    this.texCount = 0;
  }

  add(tex: THREE.Texture, list: Particle[]): void {
    const t = this.texCount++;
    this.mat.uniforms[`map${t}`].value = tex;
    const need = this.n + list.length;
    if (need > this.cap) {
      while (this.cap < need) this.cap *= 2;
      const pos = new Float32Array(this.cap * 3);
      const size = new Float32Array(this.cap * 4);
      const col = new Float32Array(this.cap * 4);
      pos.set(this.pos.subarray(0, this.n * 3));
      size.set(this.size.subarray(0, this.n * 4));
      col.set(this.col.subarray(0, this.n * 4));
      this.pos = pos;
      this.size = size;
      this.col = col;
      this.bind();
    }
    let i = this.n;
    for (const p of list) {
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.size[i * 4] = p.sx;
      this.size[i * 4 + 1] = p.sy;
      this.size[i * 4 + 2] = p.rot;
      this.size[i * 4 + 3] = t;
      this.col[i * 4] = p.r;
      this.col[i * 4 + 1] = p.g;
      this.col[i * 4 + 2] = p.b;
      this.col[i * 4 + 3] = p.a;
      i++;
    }
    this.n = i;
  }

  end(): void {
    const n = this.n;
    const first = this.mat.uniforms.map0.value;
    for (let t = this.texCount; t < MAPS; t++) this.mat.uniforms[`map${t}`].value = first;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const [name, size] of [
      ["iPos", 3],
      ["iSize", 4],
      ["iColor", 4],
    ] as const) {
      const a = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * size);
      a.needsUpdate = true;
    }
  }

  hide(): void {
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}

const tmp = new THREE.Color();

export class Particles {
  readonly root = new THREE.Group();
  private slots = new Map<string, Slot>();
  private lanes = new Map<number, Lane>();
  private ids = new WeakMap<THREE.Texture, number>();
  private nextId = 1;
  budget = 2500;
  private count = 0;

  private slot(tex: THREE.Texture, additive: boolean, depthTest: boolean, order: number): Slot {
    let id = this.ids.get(tex);
    if (!id) {
      id = this.nextId++;
      this.ids.set(tex, id);
    }
    const key = `${id}|${additive ? 1 : 0}|${depthTest ? 1 : 0}|${order}`;
    let s = this.slots.get(key);
    if (!s) {
      s = { tex, additive, depthTest, list: [] };
      this.slots.set(key, s);
      let lane = this.lanes.get(order);
      if (!lane) {
        lane = { order, slots: [], pool: [] };
        this.lanes.set(order, lane);
      }
      lane.slots.push(s);
    }
    return s;
  }

  spawn(
    tex: THREE.Texture,
    color: THREE.ColorRepresentation,
    additive: boolean,
    depthTest = true,
    order = 0,
  ): Particle | null {
    if (this.count >= this.budget) return null;
    tmp.set(color);
    const p: Particle = {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      sx: 1,
      sy: 1,
      rot: 0,
      spin: 0,
      r: tmp.r,
      g: tmp.g,
      b: tmp.b,
      a: 1,
      age: 0,
      life: 1,
      size0: 1,
      grow: 1,
      op: 1,
      fadeIn: 0,
      gravity: 0,
      drag: 0,
      floor: -1e9,
      stretch: 1,
    };
    this.slot(tex, additive, depthTest, order).list.push(p);
    this.count++;
    return p;
  }

  update(dt: number): void {
    dt = Math.max(0, dt);
    let total = 0;
    for (const b of this.slots.values()) {
      if (b.list.length === 0) continue;
      const out: Particle[] = [];
      for (const p of b.list) {
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) continue;
        p.vy -= p.gravity * dt;
        if (p.drag) {
          const d = Math.max(0, 1 - p.drag * dt);
          p.vx *= d;
          p.vy *= d;
          p.vz *= d;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.y < p.floor) {
          p.y = p.floor;
          p.vx *= 0.5;
          p.vz *= 0.5;
          p.vy = Math.abs(p.vy) * 0.25;
        }
        p.rot += p.spin * dt;
        const s = p.size0 * (1 + (p.grow - 1) * (1 - (1 - k) * (1 - k)));
        p.sx = s * p.stretch;
        p.sy = s;
        const fin = p.fadeIn > 0 && k < p.fadeIn ? k / p.fadeIn : 1;
        p.a = p.op * fin * (k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45);
        out.push(p);
      }
      b.list = out;
      total += out.length;
    }
    this.count = total;
    for (const lane of this.lanes.values()) this.build(lane);
  }

  private build(lane: Lane): void {
    let used = this.emit(lane, 0, false, true);
    used = this.emit(lane, used, false, false);
    used = this.emit(lane, used, true, true);
    used = this.emit(lane, used, true, false);
    for (let k = used; k < lane.pool.length; k++) lane.pool[k].hide();
  }

  private emit(lane: Lane, used: number, additive: boolean, depthTest: boolean): number {
    let b: Batch | null = null;
    for (const s of lane.slots) {
      if (s.list.length === 0 || s.additive !== additive || s.depthTest !== depthTest) continue;
      if (b && b.texCount >= MAPS) {
        b.end();
        b = null;
      }
      if (!b) {
        if (used === lane.pool.length) {
          const nb = new Batch(lane.order);
          lane.pool.push(nb);
          this.root.add(nb.mesh);
        }
        b = lane.pool[used++];
        b.begin(additive, depthTest);
      }
      b.add(s.tex, s.list);
    }
    if (b) b.end();
    return used;
  }

  get live(): number {
    return this.count;
  }
}
