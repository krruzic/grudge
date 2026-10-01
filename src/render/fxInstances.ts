import * as THREE from "three";

export class FxInst extends THREE.Object3D {
  readonly color = new THREE.Color(1, 1, 1);
  readonly emissive = new THREE.Color(0, 0, 0);
  opacity = 1;
}

const DYN = THREE.DynamicDrawUsage;

function inject(material: THREE.Material, emissive: boolean): void {
  material.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float iAlpha;\nvarying float vIAlpha;${emissive ? "\nattribute vec3 iEmissive;\nvarying vec3 vIEmissive;" : ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvIAlpha = iAlpha;${emissive ? "\nvIEmissive = iEmissive;" : ""}`);
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying float vIAlpha;${emissive ? "\nvarying vec3 vIEmissive;" : ""}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vIAlpha;");
    if (emissive) s.fragmentShader = s.fragmentShader.replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = vIEmissive;");
  };
  material.customProgramCacheKey = () => (emissive ? "fxi-e" : "fxi");
}

export class FxBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly live = new THREE.Group();
  private geo = new THREE.BufferGeometry();
  private cap = 0;
  private n = 0;
  private stale = false;
  private radius: number;
  private sphere = new THREE.Sphere();
  private translucent = false;
  private alpha!: THREE.InstancedBufferAttribute;
  private emis: THREE.InstancedBufferAttribute | null = null;
  private sm = new Float32Array(0);
  private sc = new Float32Array(0);
  private sa = new Float32Array(0);
  private se = new Float32Array(0);
  private keys = new Float32Array(0);
  private idx: number[] = [];

  constructor(base: THREE.BufferGeometry, material: THREE.Material, private emissive = false, private sort = false) {
    this.geo.index = base.index;
    for (const k in base.attributes) this.geo.setAttribute(k, base.attributes[k]);
    if (!base.boundingSphere) base.computeBoundingSphere();
    this.radius = base.boundingSphere!.radius + base.boundingSphere!.center.length();
    inject(material, emissive);
    this.mesh = new THREE.InstancedMesh(this.geo, material, 0);
    this.grow(1);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.boundingSphere = this.sphere;
    this.mesh.intersectsFrustum = (f) => {
      if (this.stale) this.flush();
      if (!this.n || !f.intersectsSphere(this.sphere)) return false;
      if (this.sort && this.translucent && this.n > 1 && f instanceof THREE.Frustum) this.order(f.planes[5].normal);
      return true;
    };
  }

  spawn(): FxInst {
    const p = new FxInst();
    this.live.add(p);
    this.stale = true;
    this.mesh.visible = true;
    return p;
  }

  private grow(n: number): void {
    let cap = Math.max(32, this.cap);
    while (cap < n) cap *= 2;
    this.cap = cap;
    this.mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(cap * 16), 16).setUsage(DYN);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(DYN);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(DYN);
    this.geo.setAttribute("iAlpha", this.alpha);
    if (this.emissive) {
      this.emis = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(DYN);
      this.geo.setAttribute("iEmissive", this.emis);
    }
    this.sm = new Float32Array(cap * 16);
    this.sc = new Float32Array(cap * 3);
    this.sa = new Float32Array(cap);
    this.se = new Float32Array(this.emissive ? cap * 3 : 0);
    this.keys = new Float32Array(cap);
  }

  flush(): void {
    const list = this.live.children as FxInst[];
    const n = list.length;
    this.stale = false;
    this.n = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    if (n > this.cap) this.grow(n);
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let translucent = false;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      p.updateMatrix();
      this.sm.set(p.matrix.elements, i * 16);
      p.color.toArray(this.sc, i * 3);
      if (this.emissive) p.emissive.toArray(this.se, i * 3);
      this.sa[i] = p.opacity;
      if (p.opacity < 1) translucent = true;
      cx += p.position.x;
      cy += p.position.y;
      cz += p.position.z;
    }
    this.translucent = translucent;
    const c = this.sphere.center.set(cx / n, cy / n, cz / n);
    let r = 0;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      const s = Math.max(Math.abs(p.scale.x), Math.abs(p.scale.y), Math.abs(p.scale.z));
      r = Math.max(r, p.position.distanceTo(c) + this.radius * s);
    }
    this.sphere.radius = r;
    this.mesh.instanceMatrix.array.set(this.sm.subarray(0, n * 16));
    this.mesh.instanceColor!.array.set(this.sc.subarray(0, n * 3));
    this.alpha.array.set(this.sa.subarray(0, n));
    if (this.emis) this.emis.array.set(this.se.subarray(0, n * 3));
    this.dirty();
  }

  private order(fwd: THREE.Vector3): void {
    const n = this.n;
    const keys = this.keys;
    const sm = this.sm;
    const idx = this.idx;
    idx.length = n;
    for (let i = 0; i < n; i++) {
      idx[i] = i;
      keys[i] = fwd.x * sm[i * 16 + 12] + fwd.y * sm[i * 16 + 13] + fwd.z * sm[i * 16 + 14];
    }
    idx.sort((a, b) => keys[b] - keys[a] || a - b);
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    const al = this.alpha.array as Float32Array;
    const em = this.emis?.array as Float32Array | undefined;
    for (let j = 0; j < n; j++) {
      const i = idx[j];
      m.set(sm.subarray(i * 16, i * 16 + 16), j * 16);
      col[j * 3] = this.sc[i * 3];
      col[j * 3 + 1] = this.sc[i * 3 + 1];
      col[j * 3 + 2] = this.sc[i * 3 + 2];
      al[j] = this.sa[i];
      if (em) {
        em[j * 3] = this.se[i * 3];
        em[j * 3 + 1] = this.se[i * 3 + 1];
        em[j * 3 + 2] = this.se[i * 3 + 2];
      }
    }
    this.dirty();
  }

  private dirty(): void {
    const n = this.n;
    for (const a of [this.mesh.instanceMatrix, this.mesh.instanceColor!, this.alpha, this.emis]) {
      if (!a) continue;
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

const sets = new WeakMap<THREE.Object3D, Map<string, FxBatch>>();

export function fxBatch(root: THREE.Object3D, key: string, make: () => FxBatch): FxBatch {
  let m = sets.get(root);
  if (!m) sets.set(root, (m = new Map()));
  let b = m.get(key);
  if (!b) {
    b = make();
    m.set(key, b);
    root.add(b.mesh);
  }
  return b;
}

export function flushFxBatches(root: THREE.Object3D): void {
  const m = sets.get(root);
  if (m) for (const b of m.values()) b.flush();
}
