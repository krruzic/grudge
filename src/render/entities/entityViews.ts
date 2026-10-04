// EntityViews: one view (View, view.ts) per sim entity: heroes, soldiers and structures. GameRenderer.render calls
// sync() once per frame after draining events (onHit/onImpact/onRankUp), then for every split-screen view
// drawScene() calls setViewer() (fog-of-war hiding), fillUnits() once per frame (after the scene matrices are
// updated), cullTo()/fillView() for that camera, renders, and uncull()s.
//
// Views are ordinary three.js objects under `root`, but most of what is drawn comes from batches filled from
// them: skinned soldiers/heroes (UnitBatches), static meshes (MeshBatches), structures (StructureBatch), sprites
// (SpriteBatches), health bars (BarBatch), blob shadows, foot rings and wading foam (instanced meshes). Those
// batches live in `extras`, which GameRenderer adds to the scene next to `root`.
//
// Per-kind work lives in the sibling modules: createView.ts (building a view), heroSync.ts, unitSync.ts,
// structureSync.ts (per-frame pose/animation/state), heroOverlays.ts (talent effects, status marks, range rings),
// wading.ts (water and footsteps), marks.ts / bars.ts / silhouettes.ts (overlays), animation.ts (clip tables).
import * as THREE from "three";
import type { World } from "../../sim/world";
import { type HeroModels } from "../heroModels";
import type { StructureModels } from "../structureModels";
import { blobBatch, footRingBatch } from "../models/markers";
import { WATER_TIDE_RISE, foamBatch, footsteps, wading, waterClip } from "./wading";
import type { CombatFx } from "../combat/combatFx";
import type { UnitModels } from "../unitModels";
import { UnitBatches } from "../batch/unitBatch";
import { MeshBatches } from "../batch/meshBatch";
import { StructureBatch } from "../batch/structureBatch";
import { SpriteBatches } from "../batch/spriteBatch";
import { FxBatch, type FxInst } from "../fx/instances";
import { BarBatch, setBar } from "./bars";
import { ONE_SHOT } from "./animation";
import { setSilhouetteColors, silScene } from "./silhouettes";
import { disposeTree, type View } from "./view";
import { HINTS } from "./marks";
import { createView } from "./createView";
import { applyImpact, syncHero } from "./heroSync";
import { syncMark, syncTalentFx } from "./heroOverlays";
import { syncUnit } from "./unitSync";
import { syncPads, syncStructure } from "./structureSync";

export class EntityViews {
  readonly root = new THREE.Group();
  /** Batched geometry filled from the views; added to the scene by GameRenderer next to `root`. */
  readonly extras = new THREE.Group();
  /** Hides bars and overhead sprites (menu backdrops, demo camera). */
  quiet = false;
  /** Which players are local humans / have a menu open / want build hints (set by GameRenderer). */
  humans: boolean[] = [];
  menus: boolean[] = [];
  hints = true;

  private views = new Map<number, View>();
  /** Units that died this frame keep playing their death clip here before they're disposed. */
  private corpses: { v: View; at: number }[] = [];
  rings = new Map<number, THREE.Mesh>();
  padMarkers: FxInst[] = [];
  private padBatch = new FxBatch(
    new THREE.RingGeometry(1.7, 2.0, 24),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    false,
    true,
  );
  padHints: THREE.Sprite[] = [];
  shopHints: THREE.Sprite[] = [];
  /** Thorn's reach slaps in flight, per hero id (driven by applySlap in heroSync.ts). */
  slaps = new Map<number, { t: number; target: THREE.Vector3 }>();

  // Batches (see the file header).
  private bars = new BarBatch();
  batches = new UnitBatches();
  statics = new MeshBatches();
  private sprites = new SpriteBatches();
  /** Sprites already handed to `sprites`; new ones are picked up by a scan every 10th frame. */
  private spriteSeen = new WeakSet<THREE.Sprite>();
  private spriteScan = 0;
  structBatch: StructureBatch;
  private blobs = blobBatch(1024);
  private footRings = footRingBatch(16);
  private foam = foamBatch(128);
  private foamM = new THREE.Matrix4();
  private foamQ = new THREE.Quaternion();
  private foamP = new THREE.Vector3();
  private foamS = new THREE.Vector3();
  private foamUp = new THREE.Vector3(0, 1, 0);

  // Per-view culling and fog of war.
  private hidden: THREE.Object3D[] = [];
  private sphere = new THREE.Sphere();
  /** Units hidden from the current viewer's team; restored before the next view or sync. */
  private viewHidden: View[] = [];
  /** Teams that viewed this frame (null = shared/spectator view); ownTeamOnly() reads last frame's set. */
  private viewers = new Set<number | null>();
  private lastViewers = new Set<number | null>();

  constructor(
    readonly world: World,
    readonly teamColors: THREE.Color[],
    readonly heroes: HeroModels,
    readonly structures: StructureModels,
    readonly heroScale: number,
    readonly fx: CombatFx,
    readonly units: UnitModels,
    readonly playerColors: THREE.Color[] = [],
  ) {
    this.structBatch = new StructureBatch(structures, (t) => teamColors[t] ?? teamColors[0]);
    fx.slapArm = (src, tx, ty, tz) => this.slap(src, tx, ty, tz);
    setSilhouetteColors(teamColors);
    for (const p of world.pads) {
      const m = this.padBatch.spawn();
      m.color.set(0xffd060);
      m.opacity = 0;
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, world.groundY(p.x, p.z) + 0.3, p.z);
      this.padMarkers.push(m);
      const hint = new THREE.Sprite(HINTS.build);
      hint.renderOrder = 33;
      hint.visible = false;
      hint.position.set(p.x, world.groundY(p.x, p.z) + 4.4, p.z);
      this.root.add(hint);
      this.padHints.push(hint);
    }
    for (let team = 0; team < world.teamCount; team++) {
      const hint = new THREE.Sprite(HINTS.shop);
      hint.renderOrder = 33;
      hint.visible = false;
      this.root.add(hint);
      this.shopHints.push(hint);
    }
  }

  // ── Viewers and fog of war ──

  private unhideViewed(): void {
    for (const v of this.viewHidden) v.root.visible = true;
    this.viewHidden.length = 0;
  }

  /**
   * Called before drawing each view: heroes the team can't see are hidden (baseVisible is what sync() decided),
   * and soldiers outside the team's vision are hidden until the next view.
   */
  setViewer(team: number | null): void {
    this.viewers.add(team);
    this.unhideViewed();
    const w = this.world;
    for (const [id, v] of this.views) {
      const e = w.getAny(id);
      if (v.kind === "hero") {
        if (v.baseVisible === undefined) continue;
        v.root.visible = v.baseVisible && (!e || team === null || w.visibleTo(team, e));
      } else if (v.kind === "unit" && e && team !== null && v.root.visible && !w.visibleTo(team, e)) {
        v.root.visible = false;
        this.viewHidden.push(v);
      }
    }
  }

  /** True when only `team` looked at the scene last frame (so team-private overlays may show). */
  ownTeamOnly(team: number): boolean {
    return this.lastViewers.size === 1 && this.lastViewers.has(team);
  }

  dispose(): void {
    for (const v of this.views.values()) disposeTree(v.root);
    for (const c of this.corpses) disposeTree(c.v.root);
    for (const r of this.rings.values()) r.geometry.dispose();
    silScene.remove(this.batches.silRoot);
    this.batches.dispose();
    this.statics.dispose();
    this.structBatch.dispose();
    this.sprites.dispose();
    this.padBatch.mesh.geometry.dispose();
    (this.padBatch.mesh.material as THREE.Material).dispose();
    this.bars.mesh.geometry.dispose();
    this.blobs.dispose();
    this.footRings.dispose();
    (this.footRings.material as THREE.Material).dispose();
    this.foam.dispose();
    (this.foam.material as THREE.Material).dispose();
    this.views.clear();
    this.corpses = [];
  }

  // ── Batch filling (per frame / per view) ──

  /**
   * Once per frame, after scene matrices are updated: fills the skinned and structure batches from all views.
   * Fog-hidden units are briefly unhidden so the batches see every unit; per-view visibility is applied later.
   */
  fillUnits(): void {
    if (!this.batches.root.parent) {
      this.padBatch.mesh.renderOrder = 3;
      this.footRings.renderOrder = 3;
      this.extras.add(
        this.batches.root,
        this.statics.root,
        this.structBatch.root,
        this.bars.mesh,
        this.blobs,
        this.sprites.root,
        this.padBatch.mesh,
        this.footRings,
        this.foam,
      );
      silScene.add(this.batches.silRoot);
    }
    const held = this.viewHidden.slice();
    this.unhideViewed();
    this.batches.fill(this.extras.parent ?? this.root);
    for (const v of held) v.root.visible = false;
    this.viewHidden.push(...held);
    this.structBatch.fillFrame(this.extras.parent ?? this.root);
    this.padBatch.flush();
    if (this.spriteScan++ % 10 === 0) {
      this.root.traverse((o) => {
        if (!(o instanceof THREE.Sprite) || this.spriteSeen.has(o)) return;
        this.spriteSeen.add(o);
        this.sprites.add(o);
      });
    }
  }

  private addBlobs(v: View, n: number): number {
    if (!v.blobs || !v.root.visible || !v.root.parent) return n;
    for (const m of v.blobs) {
      if (n >= 1024) return n;
      let o: THREE.Object3D | null = m;
      while (o && o !== v.root && (o.visible || o.userData.batchHidden)) o = o.parent;
      if (o !== v.root) continue;
      this.blobs.setMatrixAt(n++, m.matrixWorld);
    }
    return n;
  }

  /** Per view: bars, static/skinned/structure batch visibility, camera-facing build hints, blobs, rings, foam. */
  fillView(camera: THREE.Camera): void {
    const b = this.bars;
    b.begin();
    if (!this.quiet) {
      for (const v of this.views.values()) {
        if (!v.root.visible || !v.root.parent) continue;
        if (v.bar.group.visible && v.bar.group.parent) b.add(v.bar);
        if (v.work && v.work.group.visible && v.work.group.parent) b.add(v.work);
      }
    }
    b.end();
    this.statics.fill(this.extras.parent ?? this.root);
    this.batches.view();
    this.structBatch.fillView();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    for (const hint of [...this.padHints, ...this.shopHints]) {
      const base = hint.userData.base as [number, number] | undefined;
      const anchor = hint.userData.anchor as THREE.Vector3 | undefined;
      const c0 = hint.userData.center as [number, number] | undefined;
      if (!hint.visible || !base || !anchor || !c0) continue;
      // Hints keep a roughly constant screen size and stay pinned to their anchor corner.
      const f = Math.min(40, camera.position.distanceTo(anchor) / 16);
      hint.scale.set(base[0] * f, base[1] * f, 1);
      hint.center.set(0.5, 0.5);
      hint.position
        .copy(anchor)
        .addScaledVector(right, -(c0[0] - 0.5) * base[0])
        .addScaledVector(up, -(c0[1] - 0.5) * base[1]);
      hint.updateMatrixWorld();
    }
    this.sprites.fill(camera);
    let n = 0;
    const bl = this.blobs;
    for (const v of this.views.values()) n = this.addBlobs(v, n);
    for (const c of this.corpses) n = this.addBlobs(c.v, n);
    let rn = 0;
    const fr = this.footRings;
    for (const v of this.views.values()) {
      if (!v.rings || !v.root.visible || !v.root.parent) continue;
      for (const m of v.rings) {
        if (rn >= 16) break;
        let o: THREE.Object3D | null = m;
        while (o && o !== v.root && (o.visible || o.userData.batchHidden)) o = o.parent;
        if (o !== v.root) continue;
        fr.setMatrixAt(rn, m.matrixWorld);
        fr.setColorAt(rn, (m.material as THREE.MeshBasicMaterial).color);
        rn++;
      }
    }
    let wn = 0;
    const fm = this.foam;
    for (const v of this.views.values()) {
      if (v.wadeY === undefined || !v.root.visible || !v.root.parent || wn >= 128) continue;
      const t = performance.now() / 1000;
      this.foamQ.setFromAxisAngle(this.foamUp, t * 0.7 + v.root.id);
      this.foamP.set(v.root.position.x, v.wadeY + 0.03, v.root.position.z);
      this.foamS.setScalar((v.wadeR ?? 0.6) * (1 + Math.sin(t * 3.1 + v.root.id) * 0.06));
      fm.setMatrixAt(wn++, this.foamM.compose(this.foamP, this.foamQ, this.foamS));
    }
    fm.count = wn;
    fm.visible = wn > 0;
    if (wn) {
      fm.instanceMatrix.clearUpdateRanges();
      fm.instanceMatrix.addUpdateRange(0, wn * 16);
      fm.instanceMatrix.needsUpdate = true;
    }
    fr.count = rn;
    fr.visible = rn > 0;
    fr.instanceMatrix.needsUpdate = true;
    fr.instanceColor!.needsUpdate = true;
    bl.count = n;
    bl.visible = n > 0;
    bl.instanceMatrix.clearUpdateRanges();
    bl.instanceMatrix.addUpdateRange(0, n * 16);
    bl.instanceMatrix.needsUpdate = true;
  }

  /** Hides view roots outside the frustum (a 3.5 m sphere around each); uncull() restores them after the draw. */
  cullTo(frustum: THREE.Frustum): void {
    for (const o of this.root.children) {
      if (!o.visible) continue;
      this.sphere.center.copy(o.position);
      this.sphere.center.y += 1.2;
      this.sphere.radius = 3.5;
      if (frustum.intersectsSphere(this.sphere)) continue;
      o.visible = false;
      this.hidden.push(o);
    }
  }

  uncull(): void {
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
  }

  // ── Camera targets ──

  heroPoint(id: number): THREE.Vector3 | null {
    const v = this.views.get(id);
    return v && v.framed !== false && v.seen ? v.root.position.clone() : null;
  }

  /** Points the follow camera keeps in frame: visible heroes plus every live hero's aim point. */
  heroPoints(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const v of this.views.values())
      if (v.kind === "hero" && v.framed !== false && v.seen) out.push(v.root.position.clone());
    for (const e of this.world.entities) {
      const a = e.alive ? e.hero?.aim : null;
      if (a) out.push(new THREE.Vector3(a.x, this.world.groundY(a.x, a.z), a.z));
    }
    return out;
  }

  // ── Animation ──

  /** Plays a clip (attack_* falls back to attack_a), cross-fading from the current one; false if the view lacks it. */
  play(v: View, name: string, timeScale = 1, restart = false, fade = 0.1): boolean {
    const next = v.actions.get(name) ?? (name.startsWith("attack_") ? v.actions.get("attack_a") : undefined);
    if (!next) return false;
    next.timeScale = timeScale;
    if (v.current === name && !restart) return true;
    const prev = v.current ? v.actions.get(v.current) : undefined;
    const once = ONE_SHOT.has(name);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, name === "hit" ? 0.04 : fade, false);
    v.current = name;
    return true;
  }

  clipLen(v: View, name: string): number {
    return v.actions.get(name)?.getClip().duration ?? 0.5;
  }

  // ── Event hooks (called by GameRenderer while draining sim events) ──

  onRankUp(id: number): void {
    const v = this.views.get(id);
    if (v) v.flash = 0.3;
  }

  /** Hit reaction: white flash, a jolt away from the attacker, and hit-stop (freeze) when a hero is involved. */
  onImpact(id: number, src: number | undefined, fx: number | undefined, fz: number | undefined, big: boolean): void {
    const v = this.views.get(id);
    if (!v) return;
    v.flash = big ? 0.14 : 0.09;
    if (v.kind === "structure") return;
    const e = this.world.get(id);
    if (e && fx !== undefined && fz !== undefined) {
      const dx = e.transform.pos.x - fx;
      const dz = e.transform.pos.z - fz;
      const d = Math.hypot(dx, dz) || 1;
      const k = (big ? 0.45 : 0.22) * (v.kind === "hero" ? 1 : 0.8);
      v.joltX = (dx / d) * k;
      v.joltZ = (dz / d) * k;
    }
    const heroHit = v.kind === "hero" || (src !== undefined && this.views.get(src)?.kind === "hero");
    if (heroHit) {
      const stop = big ? 0.13 : 0.06;
      v.freeze = Math.max(v.freeze, stop);
      const sv = src !== undefined ? this.views.get(src) : undefined;
      if (sv) sv.freeze = Math.max(sv.freeze, stop);
    }
  }

  onHit(id: number): void {
    const v = this.views.get(id);
    if (!v?.mixer || v.kind !== "unit") return;
    if (v.current === "attack" || v.current === "death") return;
    this.play(v, "hit", 1.6, true);
    v.hitUntil = performance.now() / 1000 + 0.25;
  }

  // ── Per-frame sync ──

  /**
   * Creates/removes views to match World.entities and poses them at the interpolated (alpha) transform; per-kind
   * work is delegated to syncHero / syncUnit / syncStructure, then overlays (marks, talent fx, impacts).
   */
  sync(alpha: number, dt: number, time: number): void {
    const w = this.world;
    this.unhideViewed();
    if (this.viewers.size) {
      this.lastViewers = this.viewers;
      this.viewers = new Set();
    }
    for (const v of this.views.values()) v.seen = false;
    const surf = w.terrain.waterLevel + w.tideLevel() * WATER_TIDE_RISE;
    waterClip.value = surf;
    for (const e of w.entities) {
      if (!e.alive && !e.hero) continue;
      let v = this.views.get(e.id);
      if (v && e.hero && v.heroType !== e.hero.type) {
        // Morph: rebuild the view for the new hero type and pop it in.
        this.root.remove(v.root);
        disposeTree(v.root);
        this.removeRing(e.id);
        v = createView(this, e);
        v.popAt = time;
        this.views.set(e.id, v);
      }
      if (!v) {
        v = createView(this, e);
        this.views.set(e.id, v);
      }
      if (e.hero && !v.heroType) v.heroType = e.hero.type;
      if (v.popAt !== undefined) {
        const k = Math.min(1, (time - v.popAt) / 0.45);
        const s = k < 1 ? 0.2 + 0.8 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.18 : 1;
        v.root.scale.setScalar(s);
        if (k >= 1) v.popAt = undefined;
      }
      v.seen = true;
      const t = e.transform;
      v.root.position.set(
        t.prevPos.x + (t.pos.x - t.prevPos.x) * alpha,
        t.prevY + (t.y - t.prevY) * alpha,
        t.prevPos.z + (t.pos.z - t.prevPos.z) * alpha,
      );
      if (e.hero) {
        // Heroes falling off ledges accelerate down to the new ground height instead of snapping.
        const gy = v.root.position.y;
        if (v.fallY !== undefined && gy < v.fallY - 0.4) {
          v.fallV = (v.fallV ?? 0) + 30 * dt;
          v.fallY = Math.max(gy, v.fallY - v.fallV * dt);
          v.root.position.y = v.fallY;
        } else {
          v.fallY = gy;
          v.fallV = 0;
        }
      }
      let d = t.facing - t.prevFacing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const facing = t.prevFacing + d * alpha;
      setBar(v.bar, e.hp / e.maxHp, dt, time, !!e.hero);

      const frozen = v.freeze > 0;
      const adt = frozen ? 0 : dt;
      v.freeze = Math.max(0, v.freeze - dt);
      if (e.kind !== "structure") wading(this, e, v, surf, dt);
      if (e.hero) {
        syncHero(this, e, v, facing, adt, time);
        if (v.held) {
          const out = this.world.boomerangs.some((b) => b.ownerId === e.id);
          for (const o of v.held) o.visible = !out;
        }
        // Props the hero carries (Pip, a keg) disappear while the real one is out in the world.
        if (v.pipNodes) {
          const ha = e.hero.action;
          const away =
            !!e.hero.pip ||
            ha?.kind === "kegrocket" ||
            ((ha?.kind === "keg" || ha?.kind === "powderkeg") && ha.t >= ha.hitAt - 0.03);
          for (const o of v.pipNodes) o.visible = !away;
        }
        v.baseVisible = v.root.visible;
      } else if (e.unit) syncUnit(this, e, v, facing, time, adt);
      else syncStructure(this, e, v, time);
      if (this.quiet) {
        v.bar.group.visible = false;
        if (v.work) v.work.group.visible = false;
        for (const c of v.root.children) if (c instanceof THREE.Sprite) c.visible = false;
      }
      if (e.kind !== "structure" && e.alive) footsteps(this, e, v);
      if (e.kind !== "structure") syncMark(this, e, v, time);
      syncTalentFx(this, e, v, time, dt);
      applyImpact(v, dt, frozen);
    }
    const nowS = performance.now() / 1000;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.v.mixer?.update(dt);
      const k = (nowS - c.at) / 1.6;
      if (k > 0.6) c.v.root.position.y -= dt * 0.8;
      if (k >= 1) {
        this.root.remove(c.v.root);
        disposeTree(c.v.root);
        this.corpses.splice(i, 1);
      }
    }
    for (const [id, v] of this.views) {
      if (v.seen) continue;
      if (v.kind === "unit" && v.mixer && v.actions.has("death")) {
        this.play(v, "death", 1.2, true);
        v.bar.group.visible = false;
        this.corpses.push({ v, at: nowS });
      } else {
        this.root.remove(v.root);
        disposeTree(v.root);
      }
      this.views.delete(id);
      this.removeRing(id);
    }
    syncPads(this, time);
  }

  private removeRing(id: number): void {
    const ring = this.rings.get(id);
    if (!ring) return;
    this.root.remove(ring);
    ring.geometry.dispose();
    this.rings.delete(id);
  }

  /** CombatFx.slapArm: starts Thorn's reach slap on his real arm; false if the view has no rigged arm. */
  slap(src: number, tx: number, ty: number, tz: number): boolean {
    const v = this.views.get(src);
    if (!v || !v.body.getObjectByName("forearm_R") || !v.body.getObjectByName("hand_R")) return false;
    this.slaps.set(src, { t: 0, target: new THREE.Vector3(tx, ty, tz) });
    return true;
  }
}
