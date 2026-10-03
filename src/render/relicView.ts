import * as THREE from "three";
import type { World } from "../sim/world";
import type { StructureModels } from "./structureModels";
import goldUrl from "../../assets/textures/gold.png?url";
import ironUrl from "../../assets/textures/iron.png?url";
import { starTex, targetTex, type CombatFx } from "./combatFx";
import { prop } from "./props";
import { costumeOfPlayer } from "./costumes";

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
  const warn = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  warn.rotation.x = -Math.PI / 2;
  warn.position.y = 0.05;
  warn.name = "warn";
  g.add(ball, cap, fuse, spark, warn);
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
  private flying: THREE.Group[] = [];
  private wrenches: THREE.Group[] = [];
  private smokeT = 0;
  fx: CombatFx | null = null;

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
    const bs = w.boomerangs;
    while (this.wrenches.length < bs.length) {
      const g = new THREE.Group();
      const model = prop("wrench");
      if (model) {
        model.rotation.x = -0.25;
        model.scale.setScalar(1.3);
        g.add(model);
        this.wrenches.push(g);
        this.root.add(g);
        continue;
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.2), bombMat);
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.08, 4, 8, Math.PI * 1.4), bombMat);
      jaw.position.x = 0.62;
      jaw.rotation.set(Math.PI / 2, 0, Math.PI * 0.8);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), fuseMat);
      grip.position.x = -0.42;
      g.add(bar, jaw, grip);
      g.scale.setScalar(1.3);
      this.wrenches.push(g);
      this.root.add(g);
    }
    this.wrenches.forEach((g, i) => {
      const b = bs[i];
      g.visible = !!b;
      if (!b) return;
      const cos = costumeOfPlayer(w.getAny(b.ownerId)?.hero?.player);
      if ((g.userData.costume ?? "") !== cos && g.children.length === 1) {
        const m = prop("wrench", undefined, { hero: "engineer", costume: cos });
        if (m) {
          m.rotation.x = -0.25;
          m.scale.setScalar(1.3);
          g.clear();
          g.add(m);
        }
        g.userData.costume = cos;
      }
      g.position.set(b.x, b.y, b.z);
      g.rotation.set(0, this.t * 22, 0);
      if (this.fx && Math.random() < 0.5) this.fx.dust(b.x, b.y - 0.3, b.z, 0.4, 1, 0.2, 0xd8d0c0);
    });
    const thrown = w.arena.thrown;
    while (this.flying.length < thrown.length) {
      const g = bombMesh();
      this.flying.push(g);
      this.root.add(g);
    }
    this.flying.forEach((g, i) => {
      const b = thrown[i];
      g.visible = !!b;
      if (!b) return;
      const k = Math.min(1, (w.time - b.start) / b.dur);
      g.position.set(b.fromX + (b.toX - b.fromX) * k, b.fromY + (b.toY - b.fromY) * k + Math.sin(k * Math.PI) * 3, b.fromZ + (b.toZ - b.fromZ) * k);
      g.rotation.set(k * 9, 0, k * 5);
      g.scale.setScalar(0.8);
    });
    this.smokeT -= 1 / 60;
    const puff = this.smokeT <= 0;
    if (puff) this.smokeT = 0.07;
    this.planted.forEach((g, i) => {
      const b = bombs[i];
      g.visible = !!b;
      if (!b) return;
      const left = b.at - w.time;
      const total = b.targetId ? w.data.match.arena.shop.bomb.fuse : w.data.match.arena.shop.bomb.groundFuse;
      const heat = Math.max(0, Math.min(1, 1 - left / total));
      if (puff && this.fx && Math.random() < 0.35 + heat * 0.65) this.fx.smoke(b.x + 0.1, b.y + 1.2, b.z, heat);
      g.rotation.z = heat > 0.6 ? Math.sin(this.t * 40) * 0.12 * heat : 0;
      const beat = left < 1 ? 14 : left < 2 ? 8 : 4;
      const on = Math.sin(this.t * beat * Math.PI) > 0;
      g.position.set(b.x, b.y, b.z);
      g.scale.setScalar(1.35 + (on ? 0.14 : 0) + heat * 0.3);
      const warn = g.getObjectByName("warn") as THREE.Mesh;
      warn.scale.setScalar((w.data.match.arena.shop.bomb.splash / g.scale.x) * (0.3 + 0.7 * heat));
      (warn.material as THREE.MeshBasicMaterial).opacity = (on ? 0.35 : 0.18) * (0.4 + heat);
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
    this.ring.visible = r.state === "carried" || r.state === "shrined";
    this.shadow.visible = r.state === "dropped";
    if (r.state === "shrined") {
      const s = w.get(r.shrineId);
      if (!s) return;
      const keep = s.structure?.type === "core";
      const top = s.transform.y + (keep ? 5.8 : 5.0);
      const steal = r.channel > 0;
      const shake = steal ? Math.sin(this.t * 40) * 0.08 * (1 + r.channel) : 0;
      this.relic.position.set(s.transform.pos.x + shake, top + Math.sin(this.t * 1.8) * 0.1, s.transform.pos.z);
      this.relic.rotation.set(0, this.t * 0.8, 0);
      this.relic.scale.setScalar(keep ? 1.3 : 1.1);
      const col = this.teamColors[r.team] ?? new THREE.Color(1, 1, 1);
      const m = this.ring.material as THREE.MeshBasicMaterial;
      m.color.copy(col).lerp(new THREE.Color(1, 0.85, 0.3), 0.45);
      if (steal && Math.floor(this.t * 8) % 2 === 0) m.color.set(0xff3020);
      this.ring.position.set(s.transform.pos.x, s.transform.y + 0.12, s.transform.pos.z);
      this.ring.scale.setScalar((keep ? 3.2 : 2.4) * (1 + Math.sin(this.t * 3) * 0.05));
      return;
    }
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
