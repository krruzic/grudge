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

const VERT = `
attribute vec3 iPos;
attribute vec3 iSize;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vColor = iColor;
  vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSize.z);
  float s = sin(iSize.z);
  vec2 p = position.xy * iSize.xy;
  mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
uniform sampler2D map;
varying vec2 vUv;
varying vec4 vColor;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

class Batch {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private pos: Float32Array;
  private size: Float32Array;
  private col: Float32Array;
  private cap: number;
  list: Particle[] = [];

  constructor(tex: THREE.Texture, additive: boolean, depthTest: boolean, order: number) {
    this.cap = 256;
    this.geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo.index = base.index;
    this.geo.setAttribute("position", base.getAttribute("position"));
    this.geo.setAttribute("uv", base.getAttribute("uv"));
    this.pos = new Float32Array(this.cap * 3);
    this.size = new Float32Array(this.cap * 3);
    this.col = new Float32Array(this.cap * 4);
    this.bind();
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex } }]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mat.uniforms.map.value = tex;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }

  private bind(): void {
    this.geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("iSize", new THREE.InstancedBufferAttribute(this.size, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("iColor", new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
  }

  write(): void {
    const n = this.list.length;
    if (n > this.cap) {
      while (this.cap < n) this.cap *= 2;
      this.pos = new Float32Array(this.cap * 3);
      this.size = new Float32Array(this.cap * 3);
      this.col = new Float32Array(this.cap * 4);
      this.bind();
    }
    for (let i = 0; i < n; i++) {
      const p = this.list[i];
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.size[i * 3] = p.sx;
      this.size[i * 3 + 1] = p.sy;
      this.size[i * 3 + 2] = p.rot;
      this.col[i * 4] = p.r;
      this.col[i * 4 + 1] = p.g;
      this.col[i * 4 + 2] = p.b;
      this.col[i * 4 + 3] = p.a;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    (this.geo.getAttribute("iPos") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("iSize") as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("iColor") as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}

const tmp = new THREE.Color();

export class Particles {
  readonly root = new THREE.Group();
  private batches = new Map<string, Batch>();
  private ids = new WeakMap<THREE.Texture, number>();
  private nextId = 1;
  budget = 2500;
  private count = 0;

  private batch(tex: THREE.Texture, additive: boolean, depthTest: boolean, order: number): Batch {
    let id = this.ids.get(tex);
    if (!id) {
      id = this.nextId++;
      this.ids.set(tex, id);
    }
    const key = `${id}|${additive ? 1 : 0}|${depthTest ? 1 : 0}|${order}`;
    let b = this.batches.get(key);
    if (!b) {
      b = new Batch(tex, additive, depthTest, order);
      this.batches.set(key, b);
      this.root.add(b.mesh);
    }
    return b;
  }

  spawn(tex: THREE.Texture, color: THREE.ColorRepresentation, additive: boolean, depthTest = true, order = 0): Particle | null {
    if (this.count >= this.budget) return null;
    tmp.set(color);
    const p: Particle = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, sx: 1, sy: 1, rot: 0, spin: 0, r: tmp.r, g: tmp.g, b: tmp.b, a: 1,
      age: 0, life: 1, size0: 1, grow: 1, op: 1, fadeIn: 0, gravity: 0, drag: 0, floor: -1e9, stretch: 1,
    };
    this.batch(tex, additive, depthTest, order).list.push(p);
    this.count++;
    return p;
  }

  update(dt: number): void {
    let total = 0;
    for (const b of this.batches.values()) {
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
      b.write();
    }
    this.count = total;
  }

  get live(): number {
    return this.count;
  }
}
