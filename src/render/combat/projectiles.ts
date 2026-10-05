// Views for sim projectiles (World.projectiles: arrows, bolts, orbs, kit projectiles) and straight-line talent
// missiles (World.missiles). Views are created on first sight, interpolated each frame and freed when the sim
// object disappears. Look-up order for a projectile: tower projectile model, then the source hero's kit
// projectile() (under the hero's costume), then a team-tinted glow sprite.
import * as THREE from "three";
import type { World } from "../../sim/world";
import type { Missile, Projectile } from "../../sim/types";
import { costumeOfEntity } from "../costumes";
import { activeCostume, useCostume, ENGINEER, RAIDER, DUELIST, WARLORD, FX, withCostume } from "../fx/atlas";
import { emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { chunks } from "../fx/chunks";
import { spikeBatch } from "../kits/warlord";
import { harpoonMissile, harpoonMissileTick } from "../kits/harpooner";
import type { CombatFx } from "./combatFx";
import { SHARED_GEO, SHARED_MAT } from "./assets";
import { towerProjectile, towerProjectileTick } from "./towers";
import { KITS, type HeroKit } from "../kits/registry";
import { glowTex, starTex } from "./textures";

export function syncMissiles(cfx: CombatFx, world: World): void {
  const seen = new Set<number>();
  const prevC = activeCostume();
  for (const m of world.missiles) {
    seen.add(m.id);
    useCostume(costumeOfEntity(world, world.getAny(m.ownerId)));
    let v = cfx.missileViews.get(m.id);
    if (!v) {
      v = { obj: harpoonMissile(m.style, activeCostume()) ?? missileView(m.style), lastSpike: -1 };
      cfx.root.add(v.obj);
      cfx.missileViews.set(m.id, v);
    }
    const yaw = Math.atan2(m.dirX, m.dirZ);
    v.obj.position.set(m.x, m.y, m.z);
    const flat = v.obj.getObjectByName("flat");
    if (flat) flat.rotation.set(-Math.PI / 2, 0, -yaw + Math.PI);
    const yo = v.obj.getObjectByName("yaw");
    if (yo) yo.rotation.set(0, yaw, 0);
    const spin = v.obj.getObjectByName("spin") as THREE.Sprite | undefined;
    if (spin) spin.material.rotation = performance.now() / 60;
    missileTrail(cfx, m);
    if (m.harpoon) harpoonMissileTick(cfx, world, m, v.obj);
    if (m.style === "rock" && m.dist - v.lastSpike > 0.6) {
      v.lastSpike = m.dist;
      rockSpike(cfx, world, m.x, m.z);
    }
  }
  useCostume(prevC);
  for (const [id, v] of cfx.missileViews) {
    if (seen.has(id)) continue;
    emit(cfx, {
      tex: FX.dust,
      n: 3,
      x: v.obj.position.x,
      y: v.obj.position.y,
      z: v.obj.position.z,
      size: [0.6, 0.9],
      grow: 1.6,
      life: [0.3, 0.5],
      speed: [0.8, 1.6],
      opacity: 0.8,
    });
    cfx.root.remove(v.obj);
    v.obj.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (mat && !SHARED_MAT.has(mat) && !mat.userData.keep) mat.dispose();
      if (o instanceof THREE.Mesh && !SHARED_GEO.has(o.geometry) && !o.geometry.userData.model) o.geometry.dispose();
    });
    cfx.missileViews.delete(id);
  }
}
/** Missile body by style; named children get oriented each frame ("flat" lies along the path, "yaw" turns, "spin" spins). */
function missileView(style: string): THREE.Group {
  const obj = new THREE.Group();
  const spr = (tex: THREE.Texture, size: number, additive = false, color: THREE.ColorRepresentation = 0xffffff) => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        color,
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    sp.scale.setScalar(size);
    obj.add(sp);
    return sp;
  };
  if (style === "rivet") {
    spr(ENGINEER.weld, 1.1, true, 0xffb060);
    spr(ENGINEER.rivet, 0.55);
  } else if (style === "dagger") {
    spr(RAIDER.knife, 0.9).name = "spin";
    spr(RAIDER.poison, 0.6, false).material.opacity = 0.6;
  } else if (style === "slash") {
    const sp = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.3),
      new THREE.MeshBasicMaterial({
        map: DUELIST.crescent,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    sp.name = "flat";
    obj.add(sp);
  } else if (style === "rock") {
    spr(WARLORD.dust, 1.4).material.opacity = 0.8;
  } else if (style === "powershot") {
    const ar = towerProjectile("spear");
    if (ar) {
      ar.userData.towerProj = undefined;
      ar.name = "yaw";
      ar.scale.setScalar(0.9);
      obj.add(ar);
    }
    spr(FX.burst2, 1.3, true, 0xd8ffa0);
  }
  return obj;
}

/** Sparse per-frame trail particles (60% of frames) by missile style. */
function missileTrail(cfx: CombatFx, m: Missile): void {
  if (Math.random() < 0.6) {
    if (m.style === "rivet")
      emit(cfx, {
        tex: FX.twinkle,
        n: 1,
        x: m.x,
        y: m.y,
        z: m.z,
        color: 0xffa040,
        size: [0.25, 0.4],
        life: [0.2, 0.3],
        speed: [0.3, 1],
        gravity: 6,
        additive: true,
      });
    else if (m.style === "dagger")
      emit(cfx, {
        tex: RAIDER.drop,
        n: 1,
        x: m.x,
        y: m.y,
        z: m.z,
        color: 0x80ff60,
        size: [0.18, 0.26],
        life: [0.3, 0.5],
        speed: [0, 0.5],
        gravity: 10,
      });
    else if (m.style === "slash")
      emit(cfx, {
        tex: DUELIST.sparkle,
        n: 1,
        x: m.x,
        y: m.y,
        z: m.z,
        size: [0.3, 0.45],
        life: [0.25, 0.4],
        speed: [0.3, 1],
        additive: true,
        jitter: 0.8,
      });
    else if (m.style === "powershot")
      emit(cfx, {
        tex: FX.twinkle,
        n: 2,
        x: m.x,
        y: m.y,
        z: m.z,
        color: 0xd8ffa0,
        size: [0.25, 0.4],
        life: [0.25, 0.4],
        speed: [0.2, 0.8],
        additive: true,
        jitter: 0.4,
      });
  }
}

/** Warlord's rolling rock: a spike pokes out of the ground every 0.6 m along its path. */
function rockSpike(cfx: CombatFx, world: World, x: number, z: number): void {
  const gx = x + (Math.random() - 0.5) * 0.6;
  const gz = z + (Math.random() - 0.5) * 0.6;
  const gy = world.groundY(gx, gz);
  const rock = spikeBatch(cfx.root, activeCostume()).spawn();
  const sc = 0.55 + Math.random() * 0.35;
  rock.scale.set(sc, sc * (0.9 + Math.random() * 0.5), sc);
  rock.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
  const hgt = 1.6 * rock.scale.y;
  cfx.items.push({
    obj: rock,
    t: 0,
    dur: 1,
    tick: (k) => {
      const up = k < 0.12 ? k / 0.12 : k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      rock.position.set(gx, gy - hgt / 2 + hgt * 0.75 * up, gz);
    },
  });
  decal(cfx, WARLORD.crackRing, gx, gy, gz, 0.9, 1.2, { grow: 0.05 });
  emit(cfx, {
    tex: WARLORD.dust,
    n: 2,
    x: gx,
    y: gy + 0.4,
    z: gz,
    size: [0.8, 1.1],
    grow: 1.7,
    life: [0.4, 0.6],
    speed: [0.8, 1.6],
    flatSpread: true,
    drag: 3,
    opacity: 0.85,
  });
  chunks(cfx, 1, gx, gy + 0.4, gz, { size: [0.1, 0.18], speed: [1, 2.5], up: [3, 5] });
}

/** Glow sprite size for projectiles without a model. */
const GLOW_SIZE: Record<string, number> = { arrow: 0.45, ballista: 0.8, magic: 1.4, orb: 2.4 };

/**
 * View for a new projectile: a modelled tower projectile, else the source hero kit's projectile() (built under
 * the hero's costume, remembered in userData for its per-frame tick), else a glow sprite tinted by style and team.
 * Typed as a Sprite because the glow fallback is one; models only use the Object3D part.
 */
function projectileView(cfx: CombatFx, world: World, p: Projectile): THREE.Sprite {
  const src0 = world.getAny(p.sourceId);
  const shot = p.style === "ballista" && costumeOfEntity(world, src0) === "calliope" ? "cannonball" : p.style;
  const tower = towerProjectile(shot);
  if (tower) {
    cfx.root.add(tower);
    return tower as unknown as THREE.Sprite;
  }
  const src = world.getAny(p.sourceId);
  const kit = KITS[src?.hero?.type ?? ""];
  const costume = costumeOfEntity(world, src);
  const custom = withCostume(costume, () => kit?.projectile?.(cfx, p.style) ?? null);
  if (custom) {
    custom.userData.kit = kit;
    custom.userData.costume = costume;
    cfx.root.add(custom);
    return custom as THREE.Sprite;
  }
  const team = cfx.teamColors[p.team];
  const color =
    p.style === "arrow" || p.style === "ballista"
      ? new THREE.Color(0xfff0c0)
      : p.style === "magic" || p.style === "orb"
        ? team.clone().lerp(new THREE.Color(0.8, 0.3, 1), 0.6)
        : team.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
  const glow = cfx.sprite(glowTex, color, true, 1);
  glow.scale.setScalar(GLOW_SIZE[p.style] ?? 1.1);
  return glow;
}

export function syncProjectiles(cfx: CombatFx, world: World, alpha: number): void {
  const seen = new Set<number>();
  for (const p of world.projectiles) {
    seen.add(p.id);
    let s = cfx.projViews.get(p.id);
    if (!s) {
      s = projectileView(cfx, world, p);
      cfx.projViews.set(p.id, s);
    }
    const t = Math.min(1, p.prevT + (p.t - p.prevT) * alpha);
    const x = p.from.x + (p.to.x - p.from.x) * t;
    const z = p.from.z + (p.to.z - p.from.z) * t;
    let y = p.from.y + (p.to.y - p.from.y) * t;
    if (p.ballistic) {
      const d = Math.hypot(p.to.x - p.from.x, p.to.z - p.from.z);
      y += d * 0.35 * 4 * t * (1 - t);
    }
    if (s.userData.towerProj) {
      towerProjectileTick(cfx, s, x, y, z, cfx.frameDt);
      continue;
    }
    const kitOf = s.userData.kit as HeroKit | undefined;
    if (kitOf) {
      s.position.set(x, y, z);
      withCostume(s.userData.costume as string | undefined, () => kitOf.projectileTick?.(cfx, s, x, y, z, cfx.frameDt));
      continue;
    }
    s.position.set(x, y, z);
    if (p.style === "orb") {
      s.material.rotation += 0.3;
      if (Math.random() < 0.6) cfx.burst(x, y, z, starTex, 0xd080ff, 1, 0.5, 0.35, 0.3, true, 0.2);
    }
  }
  for (const [id, s] of cfx.projViews) {
    if (!seen.has(id)) {
      cfx.root.remove(s);
      if (!s.userData.towerProj)
        s.traverse((o) => {
          const m = (o as THREE.Sprite).material as THREE.Material | undefined;
          if (m) cfx.freeMat(m);
        });
      cfx.projViews.delete(id);
    }
  }
}
