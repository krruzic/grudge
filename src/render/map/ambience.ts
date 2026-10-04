// Map ambience: flickering torch/glow sprites (with point lights) placed from the map's fx_ markers, drifting
// dust motes over the field, and the sky dome.
import * as THREE from "three";
import { cacheCanvas } from "../../ui/cacheCanvas";

function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = cacheCanvas();
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.scale(4, 4);
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const flameTex = radialTexture("rgba(255,255,220,1)", "rgba(255,140,30,0.8)");
const glowTex = radialTexture("rgba(255,255,255,1)", "rgba(120,220,255,0.5)");
const moteTex = radialTexture("rgba(255,255,230,1)", "rgba(255,230,140,0.4)");

/** A small painted autumn leaf (white-ish, tinted per point by vertex colour) for falling-leaf maps. */
const leafTex = (() => {
  const c = cacheCanvas();
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.translate(32, 32);
  g.rotate(0.5);
  const grad = g.createLinearGradient(-20, -20, 20, 20);
  grad.addColorStop(0, "#fff4e0");
  grad.addColorStop(1, "#c8b8a0");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -26);
  g.bezierCurveTo(18, -16, 20, 8, 0, 26);
  g.bezierCurveTo(-20, 8, -18, -16, 0, -26);
  g.fill();
  g.strokeStyle = "rgba(90,50,20,0.55)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -22);
  g.lineTo(0, 24);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const LEAF_COLORS = [0xd8502a, 0xe8902c, 0xc83a24, 0xf0b840, 0xa8481c];

interface Flicker {
  sprite: THREE.Sprite;
  light?: THREE.PointLight;
  base: number;
  seed: number;
}

export class Effects {
  readonly root = new THREE.Group();
  private flickers: Flicker[] = [];
  private motes: THREE.Points;
  private moteVel: Float32Array;
  private bounds: THREE.Box3;

  private leaves: THREE.Points | null = null;
  private leafVel = new Float32Array(0);

  constructor(bounds: THREE.Box3, drift: "leaves" | "sand" | null = null) {
    this.bounds = bounds;
    if (drift) this.makeLeaves(drift);
    const count = 260;
    const pos = new Float32Array(count * 3);
    this.moteVel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, Math.random());
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, Math.random());
      this.moteVel[i * 3] = (Math.random() - 0.5) * 0.4;
      this.moteVel[i * 3 + 1] = 0.1 + Math.random() * 0.25;
      this.moteVel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: moteTex,
        size: 0.35,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        color: 0xfff2c0,
      }),
    );
    this.root.add(this.motes);
  }

  /** Falling autumn leaves over the field: slow fall, sideways drift and flutter; recycled at the top. */
  private makeLeaves(kind: "leaves" | "sand"): void {
    const sand = kind === "sand";
    const b = this.bounds;
    const count = 180;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    this.leafVel = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      pos[i * 3] = THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random());
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random());
      this.leafVel[i * 3] = sand ? 2.2 + Math.random() * 1.6 : 0.4 + Math.random() * 0.5;
      this.leafVel[i * 3 + 1] = sand ? -(0.05 + Math.random() * 0.15) : -(0.45 + Math.random() * 0.45);
      this.leafVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      c.setHex(sand ? 0xf0dcb4 : LEAF_COLORS[i % LEAF_COLORS.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.leaves = new THREE.Points(
      geo,
      sand
        ? new THREE.PointsMaterial({
            map: moteTex,
            size: 0.22,
            vertexColors: true,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
          })
        : new THREE.PointsMaterial({
            map: leafTex,
            size: 0.42,
            vertexColors: true,
            transparent: true,
            alphaTest: 0.3,
            depthWrite: false,
          }),
    );
    this.root.add(this.leaves);
  }

  addTorch(p: THREE.Vector3, withLight: boolean): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sprite.position.copy(p);
    sprite.scale.setScalar(0.9);
    this.root.add(sprite);
    let light: THREE.PointLight | undefined;
    if (withLight) {
      light = new THREE.PointLight(0xffa040, 6, 7, 1.5);
      light.position.copy(p).add(new THREE.Vector3(0, 0.3, 0));
      light.layers.enableAll();
      this.root.add(light);
    }
    this.flickers.push({ sprite, light, base: 0.9, seed: Math.random() * 100 });
  }

  addGlow(p: THREE.Vector3, color: THREE.ColorRepresentation, size: number): void {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sprite.position.copy(p);
    sprite.scale.setScalar(size);
    this.root.add(sprite);
    this.flickers.push({ sprite, base: size, seed: Math.random() * 100 });
  }

  update(time: number, dt: number): void {
    for (const f of this.flickers) {
      const n = Math.sin(time * 11 + f.seed) * 0.08 + Math.sin(time * 23 + f.seed * 2) * 0.05;
      f.sprite.scale.setScalar(f.base * (1 + n));
      if (f.light) f.light.intensity = 6 * (1 + n * 2);
    }
    const pos = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const b = this.bounds;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += (this.moteVel[i] + Math.sin(time * 0.7 + i) * 0.2) * dt;
      a[i + 1] += this.moteVel[i + 1] * dt;
      a[i + 2] += (this.moteVel[i + 2] + Math.cos(time * 0.6 + i) * 0.2) * dt;
      if (a[i + 1] > 7) {
        a[i + 1] = 0;
        a[i] = THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random());
        a[i + 2] = THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random());
      }
    }
    pos.needsUpdate = true;
    if (this.leaves) {
      const lp = this.leaves.geometry.getAttribute("position") as THREE.BufferAttribute;
      const l = lp.array as Float32Array;
      const v = this.leafVel;
      for (let i = 0; i < l.length; i += 3) {
        const flutter = Math.sin(time * 2.3 + i * 0.7);
        l[i] += (v[i] + flutter * 0.5) * dt;
        l[i + 1] += v[i + 1] * (1 + flutter * 0.3) * dt;
        l[i + 2] += (v[i + 2] + Math.cos(time * 1.7 + i) * 0.3) * dt;
        if (l[i + 1] < 0 || l[i] > b.max.x + 2) {
          l[i + 1] = 7 + Math.random() * 3;
          l[i] = THREE.MathUtils.lerp(b.min.x - 4, b.max.x, Math.random());
          l[i + 2] = THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random());
        }
      }
      lp.needsUpdate = true;
    }
  }
}

export function makeSky(zenith: string, horizon: string): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(zenith) },
      horizon: { value: new THREE.Color(horizon) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 zenith; uniform vec3 horizon; varying vec3 vDir;
      void main(){ float t = clamp(vDir.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, zenith, pow(t, 0.7)), 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 8), mat);
  sky.renderOrder = -1;
  return sky;
}
