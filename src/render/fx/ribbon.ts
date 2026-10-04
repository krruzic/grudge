// Ribbon: a fading triangle-strip trail between two moving points (weapon trails); CombatFx.handTrail owns them.
import * as THREE from "three";

interface Sample {
  a: THREE.Vector3;
  b: THREE.Vector3;
  t: number;
}
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private samples: Sample[] = [];
  private geo = new THREE.BufferGeometry();
  private max = 24;
  private pos = new Float32Array(this.max * 2 * 3);
  private uv = new Float32Array(this.max * 2 * 2);
  private col = new Float32Array(this.max * 2 * 4);
  private clock = 0;

  constructor(
    tex: THREE.Texture,
    color: THREE.Color,
    private life = 0.14,
    private fade = 1,
  ) {
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("uv", new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 4));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        map: tex,
        color,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  push(a: THREE.Vector3, b: THREE.Vector3): void {
    const last = this.samples[this.samples.length - 1];
    if (last && last.a.distanceToSquared(a) < 0.0004) return;
    this.samples.push({ a: a.clone(), b: b.clone(), t: this.clock });
    if (this.samples.length > this.max) this.samples.shift();
  }

  update(dt: number): void {
    this.clock += dt;
    while (this.samples.length && this.clock - this.samples[0].t > this.life) this.samples.shift();
    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const age = (this.clock - s.t) / this.life;
      const u = n > 1 ? 1 - i / (n - 1) : 0;
      this.pos.set([s.a.x, s.a.y, s.a.z], i * 6);
      this.pos.set([s.b.x, s.b.y, s.b.z], i * 6 + 3);
      this.uv.set([u * 0.85, 0.3, u * 0.85, 0.7], i * 4);
      const al = Math.max(0, 1 - age * age) * this.fade;
      this.col.set([1, 1, 1, al, 1, 1, 1, al * 0.5], i * 8);
    }
    this.geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    (this.geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("uv") as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  get empty(): boolean {
    return this.samples.length === 0;
  }
}
