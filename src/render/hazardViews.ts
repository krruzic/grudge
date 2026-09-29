import woodUrl from "../../assets/textures/wood.png?url";
import blockUrl from "../../assets/textures/wallblock.png?url";
import * as THREE from "three";
import type { World } from "../sim/world";

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
const STONE = new THREE.MeshLambertMaterial({ map: blockTex, color: 0xe8e0d4 });

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

export class HazardViews {
  readonly root = new THREE.Group();
  private traps = new Map<number, THREE.Object3D>();
  private zones = new Map<number, THREE.Object3D>();
  private mods = new Map<number, THREE.Object3D>();

  constructor(private world: World, private teamColors: THREE.Color[]) {}

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

  private zoneMesh(team: number, r: number): THREE.Object3D {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(r, 32),
      new THREE.MeshBasicMaterial({ color: this.teamColors[team].clone().lerp(new THREE.Color(0.2, 0.5, 0.1), 0.6), transparent: true, opacity: 0.3, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.25;
    g.add(disc);
    const n = Math.round(r * 5);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r * 0.95;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const thorn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6 + Math.random() * 0.5, 4), THORN);
      thorn.position.set(x, this.world.groundY(this.cx + x, this.cz + z) - this.cy + 0.25, z);
      thorn.rotation.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
      g.add(thorn);
    }
    return g;
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
        const block = new THREE.Mesh(worldBox(1.0, 2.2, 1.0), STONE);
        block.position.set(x, y + 1.0, z);
        block.rotation.y = (Math.random() - 0.5) * 0.2;
        g.add(block);
        const cap = new THREE.Mesh(worldBox(0.7, 0.4, 0.7), STONE);
        cap.position.set(x + (Math.random() - 0.5) * 0.2, y + 2.3, z);
        g.add(cap);
      }
    });
    return g;
  }

  handle(ev: { type: string; id?: number }): void {
    if (ev.type === "mod" && ev.id !== undefined) {
      const obj = this.modMesh(ev.id);
      if (obj) {
        obj.scale.y = 0.01;
        this.mods.set(ev.id, obj);
        this.root.add(obj);
      }
    } else if (ev.type === "modEnd" && ev.id !== undefined) {
      const obj = this.mods.get(ev.id);
      if (obj) {
        this.root.remove(obj);
        this.mods.delete(ev.id);
      }
    }
  }

  sync(time: number, dt: number): void {
    const w = this.world;
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
    for (const [id, o] of this.traps) if (!seenT.has(id)) { this.root.remove(o); this.traps.delete(id); }
    const seenZ = new Set<number>();
    for (const z of w.zones) {
      seenZ.add(z.id);
      let o = this.zones.get(z.id);
      if (!o) {
        this.cx = z.x;
        this.cz = z.z;
        this.cy = w.groundY(z.x, z.z);
        o = this.zoneMesh(z.team, z.radius);
        o.position.set(z.x, this.cy, z.z);
        o.scale.setScalar(0.1);
        this.zones.set(z.id, o);
        this.root.add(o);
      }
      const left = z.until - w.time;
      const s = Math.min(1, o.scale.x + dt * 5) * (left < 0.4 ? left / 0.4 : 1);
      o.scale.setScalar(Math.max(0.01, s));
    }
    for (const [id, o] of this.zones) if (!seenZ.has(id)) { this.root.remove(o); this.zones.delete(id); }
    for (const o of this.mods.values()) o.scale.y = Math.min(1, o.scale.y + dt * 6);
  }
}
