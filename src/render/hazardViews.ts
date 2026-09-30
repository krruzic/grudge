import woodUrl from "../../assets/textures/wood.png?url";
import blockUrl from "../../assets/textures/wallblock.png?url";
import barkUrl from "../../assets/textures/moss_bark.png?url";
import * as THREE from "three";
import type { World } from "../sim/world";
import { composite, WARDEN } from "./fxKit";
import type { FxHost } from "./fxParts";
import { wardenBrambleCast, wardenSprout, wardenWallBlock, wardenWallCrumble } from "./wardenFx";

const loader = new THREE.TextureLoader();
function tex(url: string): THREE.Texture {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const woodTex = tex(woodUrl);
const blockTex = tex(blockUrl);
const WOOD = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xf0d4b0 });
const WOOD_DARK = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xa08060 });
void blockTex;
const MOSS_STONE = new THREE.MeshLambertMaterial({
  map: composite(128, (g, img) => {
    g.fillStyle = "#2e2e28";
    g.fillRect(0, 0, 128, 128);
    g.drawImage(img(WARDEN.stone), -5, -5, 138, 138);
  }),
  flatShading: true,
});
const MOSS_TUFT = new THREE.MeshBasicMaterial({ map: WARDEN.moss, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
const FLOWER = new THREE.MeshBasicMaterial({ map: WARDEN.flower, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
const vineTex = new THREE.TextureLoader().load(barkUrl);
vineTex.colorSpace = THREE.SRGBColorSpace;
vineTex.wrapS = vineTex.wrapT = THREE.RepeatWrapping;
vineTex.repeat.set(4, 1);
const VINE = new THREE.MeshLambertMaterial({ map: vineTex, color: 0xa8b870, flatShading: true });
const BRAMBLE_DECAL = composite(256, (g, img) => {
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  gr.addColorStop(0, "rgba(34,24,12,0.85)");
  gr.addColorStop(0.75, "rgba(44,34,18,0.6)");
  gr.addColorStop(1, "rgba(44,34,18,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  g.drawImage(img(WARDEN.roots), 8, 8, 240, 240);
  g.globalAlpha = 0.9;
  g.drawImage(img(WARDEN.wreath), 14, 14, 228, 228);
});
function crossQuad(mat: THREE.Material, w: number, h: number, n = 2): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    q.rotation.y = (i / n) * Math.PI;
    q.position.y = h / 2;
    g.add(q);
  }
  return g;
}
const thornGeo = new THREE.ConeGeometry(0.06, 0.3, 4);
const thornBig = new THREE.ConeGeometry(0.1, 0.7, 5);
const LEAF_A = new THREE.MeshBasicMaterial({ map: WARDEN.leaf, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
const LEAF_B = new THREE.MeshBasicMaterial({ map: WARDEN.leafAutumn, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
const easeBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);

function worldBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}
const THORN = new THREE.MeshLambertMaterial({ color: 0x3f5a2a, flatShading: true });
const BONE = new THREE.MeshLambertMaterial({ color: 0xe8dcc0, flatShading: true });
const ROCK = new THREE.MeshLambertMaterial({ color: 0x6a5c4a, flatShading: true });
const IRON = new THREE.MeshLambertMaterial({ color: 0x5a5a64, flatShading: true });
const COPPER = new THREE.MeshLambertMaterial({ color: 0xd07a3a, flatShading: true, emissive: 0x301000 });

function groundTex(draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  draw(c, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const blot = (c: CanvasRenderingContext2D, s: number, colors: string[], n: number) => {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.7) * (s / 2 - 6);
    const z = 3 + Math.random() * 9 * (1 - r / (s / 2));
    c.fillStyle = colors[k % colors.length];
    c.fillRect(Math.round(s / 2 + Math.cos(a) * r - z / 2), Math.round(s / 2 + Math.sin(a) * r - z / 2), Math.round(z), Math.round(z));
  }
};
const ZONE_TEX: Record<string, THREE.CanvasTexture> = {
  bramble: groundTex((c, s) => blot(c, s, ["rgba(40,28,14,0.8)", "rgba(58,40,20,0.7)", "rgba(50,70,28,0.75)"], 160)),
  sinkhole: groundTex((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2 - 4);
    g.addColorStop(0, "rgba(8,5,3,1)");
    g.addColorStop(0.55, "rgba(46,32,20,0.9)");
    g.addColorStop(1, "rgba(80,60,40,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.lineWidth = 3;
    for (let arm = 0; arm < 5; arm++) {
      c.beginPath();
      for (let k = 0; k <= 30; k++) {
        const f = k / 30;
        const a = arm * (Math.PI * 2 / 5) + f * 4;
        const r = (1 - f) * (s / 2 - 8) + 6;
        c.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
      }
      c.strokeStyle = "rgba(20,12,6,0.9)";
      c.stroke();
    }
  }),
  crater: groundTex((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, s / 2 - 4);
    g.addColorStop(0, "rgba(30,22,16,0.95)");
    g.addColorStop(0.7, "rgba(70,54,38,0.8)");
    g.addColorStop(1, "rgba(90,70,50,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    blot(c, s, ["rgba(20,14,10,0.6)", "rgba(110,90,66,0.6)"], 60);
  }),
  tesla: groundTex((c, s) => {
    blot(c, s, ["rgba(24,22,26,0.75)", "rgba(40,38,44,0.6)"], 120);
    c.strokeStyle = "rgba(210,130,60,0.9)";
    c.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(s / 2, s / 2);
      let x = s / 2;
      let y = s / 2;
      for (let j = 0; j < 5; j++) {
        x += Math.cos(a + (Math.random() - 0.5)) * 11;
        y += Math.sin(a + (Math.random() - 0.5)) * 11;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }),
  bones: groundTex((c, s) => {
    blot(c, s, ["rgba(60,50,56,0.7)", "rgba(90,80,84,0.6)", "rgba(40,20,50,0.7)"], 140);
    c.strokeStyle = "rgba(200,120,255,0.8)";
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2);
    c.stroke();
  }),
};

const KEEP_GEO = new Set<THREE.BufferGeometry>([thornGeo, thornBig]);
const KEEP_MAT = new Set<THREE.Material>([WOOD, WOOD_DARK, THORN, BONE, ROCK, IRON, COPPER, MOSS_STONE, MOSS_TUFT, FLOWER, VINE, LEAF_A, LEAF_B]);
function free(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !KEEP_GEO.has(mesh.geometry) && !(o instanceof THREE.Sprite)) mesh.geometry.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) if (!KEEP_MAT.has(mat)) mat.dispose();
  });
}

export class HazardViews {
  readonly root = new THREE.Group();
  private traps = new Map<number, THREE.Object3D>();
  private zones = new Map<number, THREE.Object3D>();
  private mods = new Map<number, THREE.Object3D>();

  private now = 0;

  dispose(): void {
    for (const o of [...this.traps.values(), ...this.zones.values(), ...this.mods.values(), ...this.dying.map((d) => d.obj)]) free(o);
    this.traps.clear();
    this.zones.clear();
    this.mods.clear();
    this.dying = [];
  }

  constructor(private world: World, private teamColors: THREE.Color[], private fx?: FxHost) {}

  private trapMesh(team: number): THREE.Object3D {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.12, 8), new THREE.MeshLambertMaterial({ color: 0x4a4440, flatShading: true }));
    g.add(base);
    const tm = new THREE.MeshLambertMaterial({ color: this.teamColors[team], flatShading: true, emissive: this.teamColors[team].clone().multiplyScalar(0.3) });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), tm);
      tooth.position.set(Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45);
      tooth.rotation.z = Math.cos(a) * 0.5;
      tooth.rotation.x = -Math.sin(a) * 0.5;
      g.add(tooth);
    }
    return g;
  }

  private zoneMesh(team: number, r: number, style = "bramble"): THREE.Object3D {
    const g = new THREE.Group();
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(r * 2.1, r * 2.1),
      new THREE.MeshBasicMaterial({ map: ZONE_TEX[style] ?? ZONE_TEX.bramble, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 0.12;
    g.add(decal);
    const gy = (x: number, z: number) => this.world.groundY(this.cx + x, this.cz + z) - this.cy;
    const scatter = (n: number, make: () => THREE.Mesh, lift = 0) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r * 0.9;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const m = make();
        m.position.set(x, gy(x, z) + lift, z);
        g.add(m);
      }
    };
    if (style === "bramble") {
      decal.material = new THREE.MeshBasicMaterial({ map: BRAMBLE_DECAL, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const grow = (o: THREE.Object3D, x: number, z: number) => {
        o.userData.delay = (Math.hypot(x, z) / r) * 0.55 + Math.random() * 0.1;
        o.userData.grow = true;
        o.scale.setScalar(0.001);
        g.add(o);
      };
      const arches = Math.round(r * 3.2);
      for (let i = 0; i < arches; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r * 0.85;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const t = Math.random() * Math.PI * 2;
        const len = 1.2 + Math.random() * 1.4;
        const hgt = 0.55 + Math.random() * 0.75;
        const A = new THREE.Vector3(-Math.cos(t) * len / 2, gy(x - Math.cos(t) * len / 2, z - Math.sin(t) * len / 2) - 0.1, -Math.sin(t) * len / 2);
        const B = new THREE.Vector3(Math.cos(t) * len / 2, gy(x + Math.cos(t) * len / 2, z + Math.sin(t) * len / 2) - 0.1, Math.sin(t) * len / 2);
        const M = A.clone().add(B).multiplyScalar(0.5);
        M.y += hgt * 2;
        const curve = new THREE.QuadraticBezierCurve3(A, M, B);
        const arch = new THREE.Group();
        arch.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.1 + Math.random() * 0.05, 6, false), VINE));
        for (let k = 0; k < 2; k++) {
          const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), k ? LEAF_B : LEAF_A);
          lf.position.copy(curve.getPoint(0.3 + Math.random() * 0.4)).add(new THREE.Vector3(0, 0.08, 0));
          lf.rotation.set(-1.1 + Math.random() * 0.6, Math.random() * 6, Math.random() - 0.5);
          arch.add(lf);
        }
        for (let k = 0; k < 7; k++) {
          const u = 0.12 + (k / 5) * 0.76;
          const p = curve.getPoint(u);
          const tan = curve.getTangent(u);
          const side = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).cross(tan).normalize();
          const th = new THREE.Mesh(thornGeo, THORN);
          th.position.copy(p).addScaledVector(side, 0.12);
          th.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side);
          arch.add(th);
        }
        arch.position.set(x, 0, z);
        grow(arch, x, z);
      }
      for (let i = 0; i < Math.round(r * 1.2); i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r * 0.8;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const clump = new THREE.Group();
        for (let k = 0; k < 5; k++) {
          const sp = new THREE.Mesh(thornBig, THORN);
          const ta = (k / 5) * Math.PI * 2 + Math.random();
          sp.position.set(Math.cos(ta) * 0.15, 0.3, Math.sin(ta) * 0.15);
          sp.rotation.set(Math.sin(ta) * 0.5, 0, -Math.cos(ta) * 0.5);
          clump.add(sp);
        }
        clump.position.set(x, gy(x, z) - 0.05, z);
        grow(clump, x, z);
      }
      for (let i = 0; i < Math.round(r * 1.2); i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * r * 0.85;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const f = crossQuad(FLOWER, 0.34, 0.34);
        f.position.set(x, gy(x, z) + 0.02, z);
        f.rotation.y = Math.random() * 3;
        grow(f, x, z);
      }
      for (let i = 0; i < 4; i++) {
        const w = new THREE.Sprite(new THREE.SpriteMaterial({ map: WARDEN.wisp, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
        w.name = "wisp";
        w.userData.phase = (i / 4) * Math.PI * 2;
        w.userData.rad = r * (0.35 + Math.random() * 0.45);
        w.scale.setScalar(0.55);
        g.add(w);
      }
    } else if (style === "bones") {
      scatter(Math.round(r * 4), () => {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8 + Math.random() * 0.6, 5), BONE);
        b.rotation.set((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9);
        return b;
      }, 0.3);
      const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), BONE);
      skull.position.set(0, gy(0, 0) + 0.3, 0);
      skull.scale.set(1, 0.85, 1.1);
      g.add(skull);
    } else if (style === "sinkhole" || style === "crater") {
      const n = style === "sinkhole" ? Math.round(r * 2.5) : Math.round(r * 2);
      const rocks = new THREE.Group();
      rocks.name = "spin";
      g.add(rocks);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const d = r * (0.45 + Math.random() * 0.45);
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + Math.random() * 0.25, 0), ROCK);
        m.position.set(Math.cos(a) * d, gy(Math.cos(a) * d, Math.sin(a) * d) + 0.1, Math.sin(a) * d);
        rocks.add(m);
      }
    } else if (style === "tesla") {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 0.35, 8), IRON);
      base.position.y = gy(0, 0) + 0.18;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.2, 6), IRON);
      post.position.y = gy(0, 0) + 1.4;
      g.add(base, post);
      for (let k = 0; k < 4; k++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3 - k * 0.04, 0.07, 4, 10), COPPER);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = gy(0, 0) + 0.8 + k * 0.4;
        g.add(ring);
      }
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), COPPER);
      ball.position.y = gy(0, 0) + 2.65;
      g.add(ball);
      const arc = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      arc.name = "arc";
      arc.userData.top = gy(0, 0) + 2.65;
      g.add(arc);
    }
    return g;
  }

  private cyOf(o: THREE.Object3D): number {
    return o.position.y;
  }

  private cx = 0;
  private cy = 0;
  private cz = 0;

  private modMesh(id: number): THREE.Object3D | null {
    const m = this.world.mods.find((k) => k.id === id);
    if (!m) return null;
    const g = new THREE.Group();
    const W = this.world.terrain.width;
    m.cells.forEach((c, k) => {
      const x = (c % W) + 0.5;
      const z = Math.floor(c / W) + 0.5;
      if (m.kind !== "wall") {
        const works = m.kind === "works";
        const plank = new THREE.Mesh(worldBox(1.02, works ? 0.22 : 0.14, 1.02), (works ? (x + z) % 2 : k % 2) ? WOOD : WOOD_DARK);
        plank.position.set(x, m.deck[k] - (works ? 0.11 : 0.07), z);
        g.add(plank);
        const ground = this.world.terrain.groundHeight(x, z);
        const h = m.deck[k] - Math.min(ground, this.world.terrain.waterLevel - 0.5);
        if (works && m.deck[k] === m.top && m.cx !== undefined) {
          const ox = Math.abs(x - m.cx) < 0.25 ? 0 : Math.sign(x - m.cx);
          const oz = Math.abs(z - m.cz!) < 0.25 ? 0 : Math.sign(z - m.cz!);
          for (const [sx, sz] of [[ox, 0], [0, oz]] as const) {
            if (!sx && !sz) continue;
            const ni = this.world.terrain.index(Math.floor(x + sx), Math.floor(z + sz));
            if (m.cells.includes(ni)) continue;
            const rail = new THREE.Mesh(worldBox(sx ? 0.12 : 1.02, 0.5, sz ? 0.12 : 1.02), WOOD_DARK);
            rail.position.set(x + sx * 0.46, m.deck[k] + 0.25, z + sz * 0.46);
            g.add(rail);
          }
        }
        if (h > 0.3 && (works || k % 3 === 0)) {
          const post = new THREE.Mesh(worldBox(0.16, h, 0.16), WOOD_DARK);
          post.position.set(x, m.deck[k] - h / 2, z);
          g.add(post);
        }
      } else {
        const y = this.world.terrain.groundHeight(x, z);
        const cell = new THREE.Group();
        cell.position.set(x, y, z);
        const block = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 1.0), MOSS_STONE);
        block.position.y = 1.0;
        block.rotation.y = (Math.random() - 0.5) * 0.2;
        cell.add(block);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.45, 0.72), MOSS_STONE);
        cap.position.set((Math.random() - 0.5) * 0.2, 2.3, (Math.random() - 0.5) * 0.1);
        cap.rotation.y = Math.random() * 0.6;
        cell.add(cap);
        for (let t = 0; t < 2; t++) {
          const tuft = crossQuad(MOSS_TUFT, 0.6, 0.4);
          tuft.position.set((Math.random() - 0.5) * 0.6, 2.05 + (t ? 0.48 : 0), (Math.random() - 0.5) * 0.6);
          tuft.rotation.y = Math.random() * 3;
          cell.add(tuft);
        }
        cell.userData.baseY = y;
        cell.userData.delay = Math.abs(k - (m.cells.length - 1) / 2) * 0.05;
        g.add(cell);
      }
    });
    return g;
  }

  handle(ev: { type: string; id?: number }): void {
    if (ev.type === "mod" && ev.id !== undefined) {
      const obj = this.modMesh(ev.id);
      const m = this.world.mods.find((k) => k.id === ev.id);
      if (obj) {
        obj.userData.born = this.now;
        obj.userData.wall = m?.kind === "wall";
        if (!obj.userData.wall) obj.scale.y = 0.01;
        else if (this.fx) {
          const c0 = obj.children[0]?.position;
          const c1 = obj.children[obj.children.length - 1]?.position;
          const dx = c1 && c0 ? c1.x - c0.x : 1;
          const dz = c1 && c0 ? c1.z - c0.z : 0;
          const dl = Math.hypot(dx, dz) || 1;
          for (const c of obj.children) wardenWallBlock(this.fx, c.position.x, c.userData.baseY, c.position.z, c.userData.delay, dz / dl, -dx / dl);
        }
        this.mods.set(ev.id, obj);
        this.root.add(obj);
      }
    } else if (ev.type === "modEnd" && ev.id !== undefined) {
      const obj = this.mods.get(ev.id);
      if (obj) {
        this.mods.delete(ev.id);
        if (obj.userData.wall && this.fx) {
          for (const c of obj.children) wardenWallCrumble(this.fx, c.position.x, c.userData.baseY, c.position.z);
          this.dying.push({ obj, at: this.now });
        } else {
          this.root.remove(obj);
          free(obj);
        }
      }
    }
  }

  private dying: { obj: THREE.Object3D; at: number }[] = [];

  sync(time: number, dt: number): void {
    this.now = time;
    const w = this.world;
    this.dying = this.dying.filter(({ obj, at }) => {
      const k = (time - at) / 0.5;
      for (const c of obj.children) {
        c.position.y = c.userData.baseY - 2.7 * Math.min(1, k * k);
        c.rotation.z = Math.sin(time * 40 + c.position.x) * 0.04;
      }
      if (k >= 1) {
        this.root.remove(obj);
        free(obj);
      }
      return k < 1;
    });
    for (const m of w.mods) if (!this.mods.has(m.id)) this.handle({ type: "mod", id: m.id });
    for (const id of [...this.mods.keys()]) if (!w.mods.some((m) => m.id === id)) this.handle({ type: "modEnd", id });
    const seenT = new Set<number>();
    for (const t of w.traps) {
      seenT.add(t.id);
      let o = this.traps.get(t.id);
      if (!o) {
        o = this.trapMesh(t.team);
        o.position.set(t.x, w.groundY(t.x, t.z) + 0.06, t.z);
        this.traps.set(t.id, o);
        this.root.add(o);
      }
      o.rotation.y = time * (w.time < t.armAt ? 6 : 0.5);
    }
    for (const [id, o] of this.traps) if (!seenT.has(id)) { this.root.remove(o); free(o); this.traps.delete(id); }
    const seenZ = new Set<number>();
    for (const z of w.zones) {
      seenZ.add(z.id);
      let o = this.zones.get(z.id);
      if (!o) {
        this.cx = z.x;
        this.cz = z.z;
        this.cy = w.groundY(z.x, z.z);
        o = this.zoneMesh(z.team, z.radius, z.style);
        o.position.set(z.x, this.cy, z.z);
        o.userData.born = time;
        o.userData.bramble = (z.style ?? "bramble") === "bramble";
        o.scale.setScalar(o.userData.bramble ? 1 : 0.1);
        if (o.userData.bramble && this.fx) wardenBrambleCast(this.fx, z.x, this.cy, z.z, z.radius);
        this.zones.set(z.id, o);
        this.root.add(o);
      }
      const left = z.until - w.time;
      if (o.userData.bramble) {
        const age = time - o.userData.born;
        for (const c of o.children) {
          if (c.userData.grow) {
            const t = age - c.userData.delay;
            if (t > 0 && !c.userData.popped) {
              c.userData.popped = true;
              if (this.fx && c.children.length > 2) wardenSprout(this.fx, o.position.x + c.position.x, o.position.y + c.position.y, o.position.z + c.position.z);
            }
            const e = t <= 0 ? 0.001 : t >= 0.3 ? 1 : easeBack(t / 0.3);
            const out = left < 0.6 ? Math.max(0.001, left / 0.6) : 1;
            c.scale.set(Math.max(0.001, e) * (0.6 + 0.4 * out), Math.max(0.001, e * out), Math.max(0.001, e) * (0.6 + 0.4 * out));
            c.rotation.z = Math.sin(time * 1.3 + c.position.x) * 0.04;
          } else if (c.name === "wisp") {
            const a = c.userData.phase + time * 0.6;
            c.position.set(Math.cos(a) * c.userData.rad, 0.6 + Math.sin(time * 2 + c.userData.phase) * 0.3, Math.sin(a) * c.userData.rad);
            (c as THREE.Sprite).material.opacity = 0.7 * Math.min(1, age * 2, left / 0.6);
          }
        }
        const dm = (o.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        dm.opacity = Math.min(1, age * 3, left / 0.6);
      } else {
        const s = Math.min(1, o.scale.x + dt * 5) * (left < 0.4 ? left / 0.4 : 1);
        o.scale.setScalar(Math.max(0.01, s));
      }
      const spin = o.getObjectByName("spin");
      if (spin) {
        spin.rotation.y += dt * (z.style === "sinkhole" ? 1.6 : 0.2);
        spin.scale.setScalar(z.style === "sinkhole" ? 0.6 + 0.4 * (left % 1) : 1);
      }
      const arc = o.getObjectByName("arc") as THREE.Mesh | undefined;
      if (arc && Math.random() < 0.35) {
        const top = new THREE.Vector3(0, arc.userData.top as number, 0);
        const a = Math.random() * Math.PI * 2;
        const d = z.radius * (0.4 + Math.random() * 0.6);
        const end = new THREE.Vector3(Math.cos(a) * d, w.groundY(z.x + Math.cos(a) * d, z.z + Math.sin(a) * d) - this.cyOf(o) + 0.2, Math.sin(a) * d);
        const pts = [top];
        for (let k = 1; k < 5; k++) pts.push(top.clone().lerp(end, k / 5).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5)));
        pts.push(end);
        arc.geometry.dispose();
        arc.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0), 10, 0.05, 3, false);
      }
    }
    for (const [id, o] of this.zones) if (!seenZ.has(id)) { this.root.remove(o); free(o); this.zones.delete(id); }
    for (const o of this.mods.values()) {
      if (!o.userData.wall) {
        o.scale.y = Math.min(1, o.scale.y + dt * 6);
        continue;
      }
      for (const c of o.children) {
        const t = time - o.userData.born - c.userData.delay;
        const e = t <= 0 ? 0 : t >= 0.26 ? 1 : easeBack(t / 0.26);
        c.position.y = c.userData.baseY - 2.7 * (1 - e);
        c.visible = t > 0;
        c.rotation.z = t > 0 && t < 0.3 ? Math.sin(t * 90) * 0.03 : 0;
      }
    }
  }
}
