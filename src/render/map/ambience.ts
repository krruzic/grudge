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

  constructor(bounds: THREE.Box3) {
    this.bounds = bounds;
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
