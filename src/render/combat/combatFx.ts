// CombatFx: the transient-effect host for a match. GameRenderer.render drains World.events into handle() (dispatch
// in events.ts, per-hero visuals in kits/*), entity views ask it for per-frame ambience (auras, charge sparks,
// smoke), and every frame it syncs projectile/missile/banner views and advances all running effects in update().
//
// It implements FxHost (fx/parts.ts), the small interface the kits and shared FX helpers (emit, chunks, decal,
// shockwave...) draw through: add() a timed object, after() a delayed callback, `shake`, `particles`, `root`.
//
// Split across combat/: textures.ts (procedural canvas textures), floatText.ts (damage numbers, labels, callouts),
// assets.ts (shared meshes/materials), events.ts (SimEvent -> effects), projectiles.ts (projectile and missile
// views), fieldFx.ts (war banners, shop cannon, repair), ambientFx.ts (per-frame hero/structure ambience),
// towers.ts (tower projectiles, pulses and idle effects).
import * as THREE from "three";
import type { World } from "../../sim/world";
import type { SimEvent } from "../../sim/types";
import { activeCostume, ENGINEER, FX, HERALD, RAIDER, WARDEN, WARLORD, withCostume } from "../fx/atlas";
import { costumeOfEntity } from "../costumes";
import { Particles } from "../fx/particles";
import "../kits"; // registers every hero kit in KITS
import { DECAL_3D } from "../fx/decals";
import { emit, type FxHost, SHARED_PLANE_GEOS } from "../fx/parts";
import { FISSURE_TEX } from "../fx/fissures";
import { Ribbon } from "../fx/ribbon";
import { SHARED_CHUNK_GEOS } from "../fx/chunks";
import { FxBatch, fxBatch, flushFxBatches, FxInst } from "../fx/instances";
import { chunkGeo, quadGeo, ringGeo, SHARED_GEO, SHARED_MAT, WHITE } from "./assets";
import { glowTex, puffTex, streakTex } from "./textures";
import { FloatBatch, type Floater, type Label, NUM_RANK, type NumState, numText, textAtlas } from "./floatText";
import { handleEvent } from "./events";
import { syncBanners } from "./fieldFx";
import { syncMissiles, syncProjectiles } from "./projectiles";
import { aura, bloodMote, buildFx, chargeRelease, chargeSparks, regen, smoke, spawnFx } from "./ambientFx";

// Atlas cells that decal() draws as 3D geometry instead of a flat quad: cracks become fissures (fx/parts.ts
// buildFissures) and these rings/crests become modelled pieces (model3d).
FISSURE_TEX.set(FX.crack, "crack");
FISSURE_TEX.set(WARLORD.crackRing, "crack");
FISSURE_TEX.set(WARLORD.lavaCrack, "lava");
FISSURE_TEX.set(WARDEN.mossCrack, "moss");
FISSURE_TEX.set(WARDEN.roots, "moss");
DECAL_3D.set(HERALD.halo, "crown");
DECAL_3D.set(HERALD.laurel, "laurel");
DECAL_3D.set(WARLORD.ring, "ring");
DECAL_3D.set(ENGINEER.gear, "gear");
DECAL_3D.set(RAIDER.smokeRing, "smoke");

/** Slash arc geometry per (combo, reach), vertex-coloured to fade along the swing. */
const slashGeos = new Map<string, THREE.BufferGeometry>();

interface Fx {
  obj: THREE.Object3D;
  t: number;
  dur: number;
  tick: (k: number, dt: number) => void;
  c?: string;
}

export class CombatFx implements FxHost {
  // ── State ──
  readonly root = new THREE.Group();
  readonly particles = new Particles();
  world?: World;
  /** Camera shake requested by effects; GameRenderer reads it and it decays in update(). */
  shake = 0;
  /** Suppresses damage numbers and callouts (menu backdrops / previews). */
  quiet = false;
  /** Set by EntityViews: swings Thorn's real arm for a reach slap; false when the hero isn't visible. */
  slapArm?: (src: number, tx: number, ty: number, tz: number) => boolean;

  /** Running timed effects; `c` is the costume the effect was created under, tick() re-enters it. */
  items: Fx[] = [];
  /** after() callbacks, run on the frame clock (not the sim clock) under the costume they were scheduled in. */
  private pending: { at: number; run: () => void; c?: string }[] = [];
  private clock = 0;
  frameDt = 1 / 60;

  // Views owned by the helper modules (projectiles.ts, fieldFx.ts).
  projViews = new Map<number, THREE.Sprite>();
  missileViews = new Map<number, { obj: THREE.Object3D; lastSpike: number }>();
  banners: THREE.Group[] = [];

  private floats = new FloatBatch();
  private numKeys = new Map<number, NumState>();
  private matPool = new Map<string, THREE.Material[]>();
  private ribbons = new Map<string, Ribbon>();

  constructor(readonly teamColors: THREE.Color[]) {
    this.root.add(this.particles.root, this.floats.mesh);
  }

  // ── Frame entry points (called by GameRenderer) ──

  /**
   * One sim event. Runs under the costume of the event's source (a hero, or the owner of a summon) so atlas
   * getters, cv()/cm() and kit colours resolve to that costume's variants.
   */
  handle(ev: SimEvent): void {
    const sid = "src" in ev ? ev.src : undefined;
    withCostume(costumeOfEntity(this.world, sid !== undefined ? this.world?.getAny(sid) : undefined), () =>
      handleEvent(this, ev),
    );
  }

  /**
   * Advances particles, floating text, after() callbacks and timed effects. Ended effects return pooled materials
   * and dispose their own geometry (shared/model geometry and keep-materials are skipped).
   */
  update(dt: number): void {
    this.frameDt = dt;
    this.particles.update(dt);
    this.floats.update(dt);
    this.clock += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.pending[i].at <= this.clock) {
        const p = this.pending[i];
        this.pending.splice(i, 1);
        withCostume(p.c, p.run);
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.c) withCostume(f.c, () => f.tick(k, dt));
      else f.tick(k, dt);
      if (k >= 1) {
        if (f.obj instanceof FxInst) f.obj.removeFromParent();
        else this.root.remove(f.obj);
        f.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m && !SHARED_MAT.has(m) && !m.userData.keep) this.freeMat(m);
          const geo = o instanceof THREE.Mesh ? o.geometry : null;
          const shared =
            !geo ||
            geo.userData.model ||
            SHARED_GEO.has(geo) ||
            SHARED_CHUNK_GEOS.has(geo) ||
            SHARED_PLANE_GEOS.has(geo);
          if (!shared) geo.dispose();
        });
        this.items.splice(i, 1);
      }
    }
    flushFxBatches(this.root);
    for (const [k, r] of this.ribbons) {
      r.update(dt);
      if (r.empty) {
        this.root.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        this.ribbons.delete(k);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  syncProjectiles(world: World, alpha: number): void {
    return syncProjectiles(this, world, alpha);
  }

  syncMissiles(world: World): void {
    return syncMissiles(this, world);
  }

  syncBanners(world: World, time: number): void {
    return syncBanners(this, world, time);
  }

  // ── FxHost: generic timed effects used by kits and helpers ──

  add(obj: THREE.Object3D, dur: number, tick: (k: number, dt: number) => void): void {
    if (!obj.parent) this.root.add(obj);
    this.items.push({ obj, t: 0, dur, tick, c: activeCostume() });
  }

  after(seconds: number, run: () => void): void {
    this.pending.push({ at: this.clock + Math.max(0, seconds), run, c: activeCostume() });
  }

  /** Materials are pooled by key: effects grab one, set colour/opacity, and freeMat() returns it when they end. */
  pooled<T extends THREE.Material>(key: string, make: () => T): T {
    const m = (this.matPool.get(key)?.pop() as T | undefined) ?? make();
    m.userData.pool = key;
    return m;
  }

  freeMat(m: THREE.Material): void {
    const key = m.userData.pool as string | undefined;
    if (!key) {
      m.dispose();
      return;
    }
    let list = this.matPool.get(key);
    if (!list) this.matPool.set(key, (list = []));
    if (list.length < 64) list.push(m);
    else m.dispose();
  }

  // ── Primitives ──

  sprite(tex: THREE.Texture, color: THREE.ColorRepresentation, additive = true, opacity = 1): THREE.Sprite {
    const mat = this.pooled(
      additive ? "sprA" : "spr",
      () =>
        new THREE.SpriteMaterial({
          transparent: true,
          depthWrite: false,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
    );
    mat.map = tex;
    mat.color.set(color);
    mat.opacity = opacity;
    mat.rotation = 0;
    const s = new THREE.Sprite(mat);
    this.root.add(s);
    return s;
  }

  flash(
    x: number,
    y: number,
    z: number,
    tex: THREE.Texture,
    color: THREE.ColorRepresentation,
    size: number,
    dur: number,
  ): void {
    const p = this.particles.spawn(tex, color, true);
    if (!p) return;
    p.x = x;
    p.y = y;
    p.z = z;
    p.size0 = size * 0.5;
    p.grow = 2.6;
    p.rot = Math.random() * Math.PI;
    p.life = dur;
  }

  burst(
    x: number,
    y: number,
    z: number,
    tex: THREE.Texture,
    color: THREE.ColorRepresentation,
    n: number,
    size: number,
    dur: number,
    spread: number,
    additive: boolean,
    rise = 0.5,
  ): void {
    emit(this, {
      tex,
      n,
      x,
      y,
      z,
      color,
      additive,
      size: [size * 0.7, size * 1.3],
      grow: 2,
      life: [dur * 0.7, dur * 1.2],
      speed: [spread * 0.5, spread],
      flatSpread: true,
      up: [rise * 0.5, rise * 1.5],
      drag: 1.5,
      opacity: 0.9,
    });
  }

  ring(x: number, y: number, z: number, color: THREE.Color, radius: number, dur: number, width = 0.35): void {
    const mat = this.pooled(
      "ring",
      () =>
        new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
    );
    mat.color.copy(color);
    mat.opacity = 0.8;
    const m = new THREE.Mesh(ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.2, z);
    this.root.add(m);
    void width;
    this.items.push({
      obj: m,
      t: 0,
      dur,
      tick: (k) => {
        const r = 0.3 + (radius - 0.3) * (1 - (1 - k) * (1 - k));
        m.scale.setScalar(r);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      },
    });
  }

  sparks(
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
    color: THREE.ColorRepresentation,
    n: number,
    speed: number,
  ): void {
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    for (let i = 0; i < n; i++) {
      const p = this.particles.spawn(streakTex, color, true);
      if (!p) return;
      const a = (Math.random() - 0.5) * 1.6;
      const sp = speed * (0.6 + Math.random() * 0.6);
      p.vx = (ux * Math.cos(a) - uz * Math.sin(a)) * sp;
      p.vz = (ux * Math.sin(a) + uz * Math.cos(a)) * sp;
      p.vy = (Math.random() * 0.8 + 0.2) * speed * 0.6;
      p.x = x;
      p.y = y;
      p.z = z;
      p.gravity = 18;
      p.size0 = 0.14;
      p.stretch = (0.35 + Math.random() * 0.3) / 0.14;
      p.rot = Math.atan2(p.vy, Math.hypot(p.vx, p.vz) * Math.sign(p.vx || 1));
      p.life = 0.18 + Math.random() * 0.12;
    }
  }

  debris(
    x: number,
    y: number,
    z: number,
    colors: THREE.ColorRepresentation[],
    n: number,
    size: number,
    speed: number,
  ): void {
    for (let i = 0; i < n; i++) {
      const m = fxBatch(
        this.root,
        "deb",
        () => new FxBatch(chunkGeo, new THREE.MeshLambertMaterial({ transparent: true }), false, true),
      ).spawn();
      m.color.set(colors[i % colors.length]);
      const sz = size * (0.5 + Math.random() * 0.8);
      m.scale.setScalar(sz);
      m.position.set(x, y + 0.5, z);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      let vx = Math.cos(a) * sp;
      let vz = Math.sin(a) * sp;
      let vy = speed * (0.8 + Math.random() * 0.8);
      const spin = (Math.random() - 0.5) * 20;
      const floor = y + sz / 2;
      this.items.push({
        obj: m,
        t: 0,
        dur: 1.4 + Math.random() * 0.4,
        tick: (k, dt) => {
          vy -= 22 * dt;
          m.position.x += vx * dt;
          m.position.y += vy * dt;
          m.position.z += vz * dt;
          if (m.position.y < floor) {
            m.position.y = floor;
            vy = Math.abs(vy) * 0.35;
            vx *= 0.6;
            vz *= 0.6;
          } else {
            m.rotation.x += spin * dt;
            m.rotation.z += spin * 0.7 * dt;
          }
          m.opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
        },
      });
    }
  }

  soul(x: number, y: number, z: number, color: THREE.Color): void {
    const s = this.sprite(glowTex, color.clone().lerp(new THREE.Color(1, 1, 1), 0.5), true, 1);
    s.position.set(x, y + 1.2, z);
    this.items.push({
      obj: s,
      t: 0,
      dur: 1.4,
      tick: (k, dt) => {
        s.position.y += dt * 3.5 * (1 - k * 0.5);
        s.position.x += Math.sin(k * 14) * dt * 0.8;
        s.scale.setScalar(1.6 * (1 - k * 0.6));
        s.material.opacity = 1 - k;
      },
    });
  }

  /** Instanced ground quad; one FxBatch per (texture, blend, polygon offset). */
  decalInst(tex: THREE.Texture, opacity = 1, additive = false, offset = -2): FxInst {
    const b = fxBatch(
      this.root,
      `decal|${tex.uuid}|${additive ? 1 : 0}|${offset}`,
      () =>
        new FxBatch(
          quadGeo,
          new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            polygonOffset: true,
            polygonOffsetFactor: offset,
          }),
          false,
          !additive,
        ),
    );
    const p = b.spawn();
    p.opacity = opacity;
    return p;
  }

  decal(
    tex: THREE.Texture,
    x: number,
    y: number,
    z: number,
    radius: number,
    dur: number,
    grow: number,
    spin: number,
  ): void {
    const m = this.decalInst(tex);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(x, y + 0.12, z);
    const rz = m.rotation.z;
    this.items.push({
      obj: m,
      t: 0,
      dur,
      tick: (k) => {
        m.scale.setScalar(radius * Math.min(1, grow > 0 ? (k * dur) / grow : 1));
        m.rotation.z = rz + k * spin;
        m.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      },
    });
  }

  slash(x: number, y: number, z: number, facing: number, team: number, combo: number, reach: number, delay = 0): void {
    if (delay > 0) {
      this.pending.push({ at: this.clock + delay, run: () => this.slash(x, y, z, facing, team, combo, reach) });
      return;
    }
    const arc = combo === 2 ? Math.PI * 1.1 : Math.PI * 0.8;
    const gk = `${combo}|${reach}`;
    let geo = slashGeos.get(gk);
    if (!geo) {
      geo = new THREE.RingGeometry(reach * 0.45, reach, 14, 1, -arc / 2, arc);
      const pos = geo.getAttribute("position");
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const ang = Math.atan2(pos.getY(i), pos.getX(i));
        const t = (ang + arc / 2) / arc;
        const r = Math.hypot(pos.getX(i), pos.getY(i)) / reach;
        const k = Math.pow(combo % 2 ? 1 - t : t, 1.5) * r;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      if (slashGeos.size < 48) {
        slashGeos.set(gk, geo);
        SHARED_GEO.add(geo);
      }
    }
    const mat = this.pooled(
      "slash",
      () =>
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }),
    );
    mat.color.copy(this.teamColors[team]).lerp(WHITE, 0.65);
    mat.opacity = 0.9;
    const m = new THREE.Mesh(geo, mat);
    const tilt = combo === 1 ? 0.35 : combo === 2 ? -0.25 : 0.15;
    m.rotation.order = "YXZ";
    m.rotation.set(-Math.PI / 2 + tilt, facing - Math.PI / 2, 0);
    m.position.set(x, y + (combo === 2 ? 0.9 : 1.2), z);
    this.root.add(m);
    this.items.push({
      obj: m,
      t: 0,
      dur: 0.16,
      tick: (k) => {
        (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        m.scale.setScalar(0.85 + k * 0.25);
      },
    });
  }

  trail(x: number, y: number, z: number, team: number, size: number): void {
    const c = this.teamColors[team].clone().lerp(new THREE.Color(1, 1, 1), 0.4);
    const p = this.particles.spawn(glowTex, c, true);
    if (!p) return;
    p.x = x;
    p.y = y;
    p.z = z;
    p.size0 = size;
    p.stretch = 0.65;
    p.op = 0.5;
    p.life = 0.25;
    p.grow = 0.7;
  }

  dust(
    x: number,
    y: number,
    z: number,
    size: number,
    n = 2,
    spread = 0.8,
    color: THREE.ColorRepresentation = 0xd8ccb0,
  ): void {
    emit(this, {
      tex: puffTex,
      n,
      x,
      y: y + 0.15,
      z,
      color,
      size: [size * 0.7, size * 1.2],
      grow: 1.8,
      life: [0.45, 0.65],
      speed: [spread * 0.4, spread],
      flatSpread: true,
      up: [0.4, 0.6],
      drag: 2,
      opacity: 0.6,
    });
  }

  /** Weapon ribbon keyed by hero/hand; the ribbon fades out and is freed once empty. */
  handTrail(key: string, a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, tex = FX.streak, life = 0.2): void {
    let r = this.ribbons.get(key);
    if (!r) {
      r = new Ribbon(tex, color, life);
      this.ribbons.set(key, r);
      this.root.add(r.mesh);
    }
    r.push(a, b);
  }

  // ── Floating text ──

  /**
   * Damage/heal number. Hits on the same key (target id) within 0.3 s merge into one growing number instead of
   * stacking, keeping the most important colour (NUM_RANK order).
   */
  number(x: number, y: number, z: number, amount: number, color: string, big: boolean, mul = 1, key?: number): void {
    if (this.quiet) return;
    const prev = key !== undefined ? this.numKeys.get(key) : undefined;
    if (prev && this.clock - prev.last < 0.3 && this.clock - prev.born < 1.2 && prev.f.t < prev.f.dur * 0.7) {
      prev.amount += amount;
      if (NUM_RANK.indexOf(color) > NUM_RANK.indexOf(prev.color)) prev.color = color;
      prev.big ||= big;
      prev.mul = Math.max(prev.mul, mul);
      prev.last = this.clock;
      textAtlas.release(prev.f.slot);
      prev.f.slot = textAtlas.acquire(numText(prev.amount), prev.color, 2.6, 2);
      prev.f.dur = prev.big ? 0.9 : 0.7;
      prev.f.t = Math.min(prev.f.t, prev.f.dur * 0.15 * 0.55);
      return;
    }
    const vx = (Math.random() - 0.5) * 1.2;
    const f: Floater = {
      slot: textAtlas.acquire(numText(amount), color, 2.6, 2),
      x,
      y: y + 1.6,
      z,
      sx: 0,
      sy: 0,
      a: 1,
      t: 0,
      dur: big ? 0.9 : 0.7,
      layer: 1,
      step: (k, dt) => {
        const base = (n.big ? 1.5 : 1.0) * n.mul;
        const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.8 : 1;
        f.sx = 2.4 * base * pop;
        f.sy = 0.6 * base * pop;
        f.y += dt * (2.6 * (1 - k));
        f.x += vx * dt;
        f.a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      },
    };
    const n: NumState = { f, amount, color, big, mul, born: this.clock, last: this.clock };
    if (key !== undefined) {
      this.numKeys.set(key, n);
      f.done = () => {
        if (this.numKeys.get(key) === n) this.numKeys.delete(key);
      };
    }
    this.floats.list.push(f);
  }

  label(x: number, y: number, z: number, [text, color]: Label): void {
    const f: Floater = {
      slot: textAtlas.acquire(text, color, 2.4, 3),
      x,
      y: y + 0.8,
      z,
      sx: 1.6,
      sy: 0.4,
      a: 1,
      t: 0,
      dur: 0.8,
      layer: 0,
      step: (k, dt) => {
        f.y += dt * 1.2;
        f.a = 1 - k * k;
      },
    };
    this.floats.list.push(f);
  }

  // ── Per-frame ambience requested by entity/relic views (see ambientFx.ts) ──

  aura(kind: "flame" | "spark" | "drip" | "steam" | "grave", x: number, y: number, z: number, r = 1): void {
    return aura(this, kind, x, y, z, r);
  }

  smoke(x: number, y: number, z: number, heat: number): void {
    return smoke(this, x, y, z, heat);
  }

  chargeSparks(x: number, y: number, z: number, k: number, color: THREE.ColorRepresentation, full: boolean): void {
    return chargeSparks(this, x, y, z, k, color, full);
  }

  chargeRelease(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirZ: number,
    power: number,
    color: THREE.ColorRepresentation,
  ): void {
    return chargeRelease(this, x, y, z, dirX, dirZ, power, color);
  }

  bloodMote(x: number, y: number, z: number): void {
    return bloodMote(this, x, y, z);
  }

  regen(x: number, y: number, z: number): void {
    return regen(this, x, y, z);
  }

  buildFx(x: number, y: number, z: number, team: number): void {
    return buildFx(this, x, y, z, team);
  }

  spawnFx(x: number, y: number, z: number, team: number): void {
    return spawnFx(this, x, y, z, team);
  }
}
