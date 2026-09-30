import * as THREE from "three";
import type { World } from "../sim/world";
import type { StructureModels } from "./structureModels";
import goldUrl from "../../assets/textures/gold.png?url";
import ironUrl from "../../assets/textures/iron.png?url";
import { starTex, targetTex } from "./combatFx";

const ironTex = new THREE.TextureLoader().load(ironUrl);
ironTex.colorSpace = THREE.SRGBColorSpace;
const bombMat = new THREE.MeshLambertMaterial({ map: ironTex, color: 0x4a4a52, flatShading: true });
const fuseMat = new THREE.MeshLambertMaterial({ color: 0xc8b080 });

function bombMesh(): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), bombMat);
  ball.position.y = 0.42;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.14, 6), bombMat);
  cap.position.y = 0.86;
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 4), fuseMat);
  fuse.position.set(0.05, 1.02, 0);
  fuse.rotation.z = -0.35;
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: 0xffc040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  spark.position.set(0.1, 1.18, 0);
  spark.scale.setScalar(0.45);
  spark.name = "spark";
  g.add(ball, cap, fuse, spark);
  return g;
}

const goldTex = new THREE.TextureLoader().load(goldUrl);
goldTex.colorSpace = THREE.SRGBColorSpace;

function blob(radius: number, opacity: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

export class RelicView {
  readonly root = new THREE.Group();
  private relic = new THREE.Group();
  private altar: THREE.Object3D | null = null;
  private arrow: THREE.Mesh;
  private shadow = blob(0.5, 0.45);
  private ring: THREE.Mesh;
  private t = 0;
  private carried = new Map<number, THREE.Group>();
  private planted: THREE.Group[] = [];
  private reticles = new Map<number, THREE.Mesh>();

  constructor(private world: World, models: StructureModels, private teamColors: THREE.Color[], private heroScale: number) {
    const src = models.create("grudge", new THREE.Color(1, 1, 1));
    src.updateMatrixWorld(true);
    const relic = src.getObjectByName("relic");
    const altar = src.getObjectByName("altar");
    src.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.outline) return;
      if (!o.geometry.getAttribute("color")) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          (m as THREE.MeshLambertMaterial).vertexColors = false;
          m.needsUpdate = true;
        }
      }
    });
    if (relic) {
      relic.position.set(0, 0, 0);
      this.relic.add(relic);
    }
    const home = world.arena.home;
    const hy = world.groundY(home.x, home.z);
    if (altar) {
      altar.position.set(home.x, hy, home.z);
      this.altar = altar;
      this.root.add(altar);
    }
    const cone = new THREE.ConeGeometry(0.28, 0.5, 4);
    cone.rotateX(Math.PI);
    this.arrow = new THREE.Mesh(cone, new THREE.MeshLambertMaterial({ map: goldTex, color: 0xffe08a, emissive: 0x3a2a00, flatShading: true }));
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1.0, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.root.add(this.relic, this.arrow, this.shadow, this.ring);
  }

  private syncExtras(alpha: number): void {
    const w = this.world;
    const seen = new Set<number>();
    const seenAim = new Set<number>();
    for (const p of w.players) {
      const e = w.getAny(p.heroId);
      if (!e?.hero || !e.alive) continue;
      const t = e.transform;
      const x = t.prevPos.x + (t.pos.x - t.prevPos.x) * alpha;
      const z = t.prevPos.z + (t.pos.z - t.prevPos.z) * alpha;
      const y = t.prevY + (t.y - t.prevY) * alpha;
      if (e.hero.bomb) {
        seen.add(e.id);
        let b = this.carried.get(e.id);
        if (!b) {
          b = bombMesh();
          b.scale.setScalar(0.8);
          this.carried.set(e.id, b);
          this.root.add(b);
        }
        b.position.set(x, y + 2.25 * this.heroScale + Math.sin(this.t * 6) * 0.06, z);
        b.rotation.y = this.t * 2;
        const sp = b.getObjectByName("spark") as THREE.Sprite;
        sp.scale.setScalar(0.35 + Math.random() * 0.2);
      }
      if (e.hero.aim) {
        seenAim.add(e.id);
        let r = this.reticles.get(e.id);
        if (!r) {
          r = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: targetTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
          r.rotation.x = -Math.PI / 2;
          this.reticles.set(e.id, r);
          this.root.add(r);
        }
        const a = e.hero.aim;
        r.position.set(a.x, w.groundY(a.x, a.z) + 0.15, a.z);
        r.scale.setScalar(w.data.match.arena.shop.cannon.radius + w.data.match.arena.shop.cannon.spread * 0.6 + Math.sin(this.t * 8) * 0.15);
        r.rotation.z = this.t * 1.5;
      }
    }
    for (const [id, b] of this.carried) if (!seen.has(id)) { this.root.remove(b); this.carried.delete(id); }
    for (const [id, r] of this.reticles) if (!seenAim.has(id)) { this.root.remove(r); r.geometry.dispose(); (r.material as THREE.Material).dispose(); this.reticles.delete(id); }
    const bombs = w.arena.bombs;
    while (this.planted.length < bombs.length) {
      const g = bombMesh();
      this.planted.push(g);
      this.root.add(g);
    }
    this.planted.forEach((g, i) => {
      const b = bombs[i];
      g.visible = !!b;
      if (!b) return;
      const left = b.at - w.time;
      const beat = left < 1 ? 14 : left < 2 ? 8 : 4;
      const on = Math.sin(this.t * beat * Math.PI) > 0;
      g.position.set(b.x, b.y, b.z);
      g.scale.setScalar(1 + (on ? 0.12 : 0) + Math.max(0, 1 - left) * 0.25);
      const sp = g.getObjectByName("spark") as THREE.Sprite;
      sp.scale.setScalar(on ? 0.7 : 0.4);
      (sp.material as THREE.SpriteMaterial).color.set(on ? 0xff5020 : 0xffc040);
    });
  }

  sync(alpha: number, dt: number): void {
    this.t += dt;
    this.syncExtras(alpha);
    const w = this.world;
    const r = w.arena.relic;
    const home = w.arena.home;
    const altarTop = w.groundY(home.x, home.z) + 0.62;
    this.relic.visible = true;
    this.arrow.visible = r.state === "home" || r.state === "dropped";
    this.ring.visible = r.state === "carried";
    this.shadow.visible = r.state === "dropped";
    if (r.state === "carried") {
      const c = w.getAny(r.carrier);
      if (!c) return;
      const t = c.transform;
      const x = t.prevPos.x + (t.pos.x - t.prevPos.x) * alpha;
      const z = t.prevPos.z + (t.pos.z - t.prevPos.z) * alpha;
      const y = t.prevY + (t.y - t.prevY) * alpha;
      this.relic.position.set(x, y + 2.3 * this.heroScale + Math.sin(this.t * 5) * 0.08, z);
      this.relic.scale.setScalar(0.95);
      this.relic.rotation.set(0, t.facing, 0);
      const col = this.teamColors[c.team] ?? new THREE.Color(1, 1, 1);
      (this.ring.material as THREE.MeshBasicMaterial).color.copy(col).lerp(new THREE.Color(1, 0.85, 0.3), 0.35);
      this.ring.position.set(x, y + 0.1, z);
      this.ring.scale.setScalar(1.1 + Math.sin(this.t * 6) * 0.08);
      return;
    }
    if (r.state === "waiting") {
      this.relic.position.set(home.x, altarTop, home.z);
      this.relic.rotation.set(0, 0, 0);
      this.relic.scale.setScalar(1.6);
      return;
    }
    if (r.state === "home") {
      this.relic.position.set(r.x, altarTop + 0.05 + Math.sin(this.t * 1.6) * 0.06, r.z);
      this.relic.rotation.set(0, this.t * 0.6, 0);
      this.relic.scale.setScalar(1.6);
      this.arrow.position.set(r.x, altarTop + 2.4 + Math.sin(this.t * 3) * 0.18, r.z);
    } else if (r.state === "dropped") {
      const left = w.data.match.arena.relic.returnSeconds - (w.time - r.since);
      this.relic.visible = left > 3 || Math.sin(this.t * 22) > -0.2;
      this.relic.position.set(r.x, r.y + 0.3 + Math.abs(Math.sin(this.t * 3)) * 0.12, r.z);
      this.relic.rotation.set(0.35, this.t * 1.2, 0.2);
      this.relic.scale.setScalar(1.15);
      this.arrow.position.set(r.x, r.y + 2.3 + Math.sin(this.t * 3) * 0.18, r.z);
      this.shadow.position.set(r.x, r.y + 0.06, r.z);
    }
    this.arrow.rotation.y = this.t * 2.4;
  }
}
