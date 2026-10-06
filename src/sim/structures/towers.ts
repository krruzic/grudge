// Structure behaviour each tick (step phase 4, after units): construction/upgrade progress, then by type -
//   damage   single-target tower (or hero siege ballista / tesla turret); prefers heroes that are "exposed"
//            (recently hit something nearby or not covered by their own units), then siege, then closest
//   control  pulse that slows/knocks back every enemy in range (spec: frost / storm / well)
//   support  heals nearby allies
// Production outposts only build here; their spawning lives in arena/waves.ts. Shots on grain maps cost grain;
// a starved tower fires slower.
import type { World } from "../world.ts";
import type { Entity, StructureType } from "../types.ts";
import type { TowerSpec } from "../config.ts";
import { chainLightning } from "../talents.ts";
import { applySpec, builderRate, specOf, upgrade } from "../structures.ts";

/** Shared per-shot state: relic boost, active spec, fire-rate haste, and the grain payment (which may cut haste). */
interface Firing {
  boost: { damage: number; range: number };
  spec: TowerSpec | null;
  haste: number;
  feed: () => void;
}

export function updateStructure(w: World, e: Entity): void {
  const st = e.structure!;
  if (st.type === "core") return;
  if (advanceConstruction(w, e)) return;
  const def = w.data.structures.types[st.type];
  // Free for all: towers left alone a few seconds patch themselves up fast (houses get hit from every side).
  const regen = def.class === "tower" ? w.ffaHouses?.towerRegen : undefined;
  if (regen && e.hp < e.maxHp && w.time - (e.status.hurtAt ?? -99) >= regen.after)
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * regen.perSecond * w.dt);
  if (w.time < st.nextAction) return;
  if (def.class === "production") {
    st.nextAction = w.time + 1;
    return;
  }
  const f = firing(w, e);
  if (st.type === "damage") damageTower(w, e, f);
  else if (st.type === "control") controlTower(w, e, f);
  else if (st.type === "support") supportTower(w, e);
}

/**
 * Build or upgrade progress at builderRate (upgrades always progress at >= 1). New buildings gain hp as they
 * rise. Returns true while the structure is not yet ready (it does nothing else).
 */
function advanceConstruction(w: World, e: Entity): boolean {
  const st = e.structure!;
  const sd = w.data.structures;
  if (!st.ready || st.upgrading) {
    const rate = st.ready ? Math.max(1, builderRate(w, e)) : builderRate(w, e);
    const secs = st.ready ? sd.upgradeSeconds : sd.buildSeconds;
    const step = (rate * w.dt) / secs;
    st.progress = Math.min(1, (st.progress ?? 0) + step);
    if (!st.ready) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (1 - sd.buildStartHpFrac) * step);
      if (st.progress >= 1) {
        st.ready = true;
        st.nextAction = w.time;
      }
      return true;
    }
    if (st.progress >= 1) {
      st.upgrading = false;
      if (st.specPending) {
        applySpec(w, e, st.specPending);
        st.specPending = undefined;
      } else upgrade(w, e);
      w.emit({ type: "build", id: e.id, padIndex: st.padIndex, team: e.team, upgrade: true });
    }
  }
  return false;
}

function firing(w: World, e: Entity): Firing {
  const st = e.structure!;
  const def = w.data.structures.types[st.type as StructureType];
  const ts = w.teams[e.team];
  const boost = w.arena.towerBoost(e);
  let haste = st.hasteUntil && w.time < st.hasteUntil ? (st.hasteMul ?? 1) : 1;
  if (st.graveUntil && w.time < st.graveUntil) haste *= st.graveHaste ?? 1;
  const spec = specOf(w, st);
  // Hero-built siege/tesla and off-pad structures shoot for free.
  const shotCost = st.siege || st.tesla || st.padIndex < 0 ? 0 : (spec?.grainPerShot ?? def.grainPerShot ?? 0);
  const grainCfg = w.data.match.economy.grain;
  const f: Firing = { boost, spec, haste, feed: () => {} };
  f.feed = () => {
    if (!shotCost || !grainCfg) return;
    if (ts.grain >= shotCost) ts.grain -= shotCost;
    else {
      f.haste /= grainCfg.starvedMul ?? 2.5;
      if (w.time - (ts.starvedAt ?? -99) > 8) {
        ts.starvedAt = w.time;
        w.emit({ type: "notice", team: e.team, text: "NO GRAIN · TOWERS SLOW" });
      }
    }
  };
  return f;
}

/** Heroes are only "exposed" to a tower if they hit something near it recently or none of their units are in range. */
function exposed(w: World, tower: Entity, hero: Entity, range: number): boolean {
  const h = hero.status;
  if (
    w.time - h.lastHitAt < 2.5 &&
    Math.hypot(h.lastHitX - tower.transform.pos.x, h.lastHitZ - tower.transform.pos.z) <= range + 2
  )
    return true;
  for (const o of w.entities) {
    if (!o.alive || !o.unit || o.team !== hero.team || o.neutral) continue;
    if (w.dist(tower, o) - o.radius <= range) return false;
  }
  return true;
}

function damageTower(w: World, e: Entity, f: Firing): void {
  const st = e.structure!;
  const def = w.data.structures.types[st.type as StructureType];
  const { boost, spec } = f;
  let best: Entity | null = null;
  let bestScore = Infinity;
  const siege = st.siege;
  const cands: { o: Entity; score: number }[] = [];
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team || (!w.visibleTo(e.team, o) && !spec?.reveal)) continue;
    if (o.structure && !siege && !o.structure.siege && o.structure.works === undefined) continue;
    const d = w.dist(e, o) - o.radius;
    if (d > st.range * boost.range * w.rangeMul(e, o)) continue;
    // Lower is better: exposed heroes first (hidden-behind-units heroes last), enemy siege before units.
    const score =
      d +
      (o.hero ? (siege || exposed(w, e, o, st.range) ? -100 : 100) : 0) -
      (o.structure?.siege ? 60 : 0) -
      (siege && o.structure ? 40 : 0);
    if (spec?.targets) cands.push({ o, score });
    if (score >= bestScore) continue;
    if (!w.los(e, o, def.projectile?.losTolerance ?? 0.3, 3.2)) continue;
    best = o;
    bestScore = score;
  }
  if (!best) {
    st.nextAction = w.time + 0.2;
    return;
  }
  if (spec && !siege && !st.tesla) {
    if (!towerSpecFire(w, e, best, spec, boost.damage, cands)) {
      st.nextAction = w.time + 0.3;
      return;
    }
    f.feed();
    st.lastFireAt = w.time;
    st.nextAction = w.time + (spec.cooldown ?? def.cooldown ?? 1) / f.haste;
    return;
  }
  if (siege)
    e.transform.facing = e.transform.prevFacing = Math.atan2(
      best.transform.pos.x - e.transform.pos.x,
      best.transform.pos.z - e.transform.pos.z,
    );
  const cls = best.structure?.siege ? "heavy" : w.classOf(best);
  const vs = (siege ? siege.vs[cls] : def.vs?.[cls]) ?? 1;
  if (st.tesla) {
    const pts = [
      e.transform.pos.x,
      e.transform.y + 2.6,
      e.transform.pos.z,
      best.transform.pos.x,
      best.transform.y + 1.2,
      best.transform.pos.z,
    ];
    w.emit({ type: "chain", pts, team: e.team });
    const owner = e.owner ? (w.get(e.owner) ?? e) : e;
    w.damage(owner, best, st.damage * boost.damage, {
      fromX: e.transform.pos.x,
      fromZ: e.transform.pos.z,
      knockback: 1,
      slowMul: 0.7,
      slowSeconds: 0.6,
    });
    if (best.alive) chainLightning(w, owner, best, 2, st.damage * 0.6 * boost.damage);
    st.lastFireAt = w.time;
    st.nextAction = w.time + 1 / f.haste;
    return;
  }
  w.fireProjectile(
    e,
    best,
    st.damage * boost.damage * vs,
    siege ? 30 : (def.projectile?.speed ?? 20),
    false,
    siege ? (st.shotStyle ?? "ballista") : "bolt",
    siege ? 1.2 : 3.2,
    true,
    undefined,
    best.hero && st.heroSlow ? { slowMul: st.heroSlow, slowSeconds: 1 } : undefined,
  );
  st.lastFireAt = w.time;
  f.feed();
  st.nextAction = w.time + (siege ? siege.cooldown : (def.cooldown ?? 1)) / f.haste;
}

function controlTower(w: World, e: Entity, f: Firing): void {
  const st = e.structure!;
  const def = w.data.structures.types[st.type as StructureType];
  const { boost, spec } = f;
  const cm = w.teamHooks(e.team).controlTowerMul ?? 1;
  const targets = w.enemiesNear(e, st.range * boost.range, (o) => o.kind !== "structure");
  if (!targets.length) {
    st.nextAction = w.time + 0.2;
    return;
  }
  w.emit({
    type: "pulse",
    x: e.transform.pos.x,
    y: e.transform.y,
    z: e.transform.pos.z,
    radius: st.range * boost.range,
    team: e.team,
    style: spec?.id,
  });
  const px = e.transform.pos.x;
  const pz = e.transform.pos.z;
  for (const o of targets) {
    const vs = def.vs?.[w.classOf(o)] ?? 1;
    const dmg = st.damage * boost.damage * vs * cm;
    if (spec?.id === "frost") {
      // Frost: heroes are slowed, everything else frozen.
      w.damage(
        e,
        o,
        dmg,
        o.hero
          ? { slowMul: spec.heroSlow ?? 0.35, slowSeconds: spec.heroSlowSeconds ?? 1.5 }
          : { stun: spec.freeze ?? 1, slowMul: 0.5, slowSeconds: (spec.freeze ?? 1) + 1 },
      );
    } else if (spec?.id === "storm") {
      w.damage(e, o, dmg, {
        fromX: px,
        fromZ: pz,
        knockback: (spec.knockback ?? 5) * Math.min(1, vs),
        stun: spec.stun ?? 0.5,
        big: true,
      });
    } else if (spec?.id === "well") {
      w.damage(e, o, dmg, {
        fromX: px,
        fromZ: pz,
        pull: spec.pull ?? 5,
        slowMul: spec.slow ?? 0.35,
        slowSeconds: (spec.cooldown ?? 2) + 0.4,
      });
    } else {
      const slow = 1 - Math.min(0.85, (1 - (def.slowMul ?? 0.5)) * Math.min(1, vs) * cm);
      w.damage(e, o, dmg, {
        knockback: (def.knockback ?? 3) * Math.min(1, vs),
        slowMul: slow,
        slowSeconds: def.slowSeconds,
      });
    }
  }
  st.lastFireAt = w.time;
  f.feed();
  st.nextAction = w.time + (spec?.cooldown ?? def.cooldown ?? 2) / f.haste;
}

function supportTower(w: World, e: Entity): void {
  const st = e.structure!;
  const def = w.data.structures.types[st.type as StructureType];
  const cd = def.cooldown ?? 0.5;
  const heal = (def.heal ?? 10) * (st.level > 1 ? (def.upgrade.heal ?? 1) : 1) * cd;
  let any = false;
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.kind === "structure") continue;
    if (w.dist(e, o) > st.range || o.hp >= o.maxHp) continue;
    w.heal(o, o.hero ? heal * (def.heroHealMul ?? 0.5) : heal);
    any = true;
  }
  if (any) {
    st.lastFireAt = w.time;
    if (w.tick % 30 < 15)
      w.emit({ type: "heal", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team });
  }
  st.nextAction = w.time + cd;
}

/**
 * Level-3 damage tower specs: ballista (must re-aim when the target moves > 0.3 rad, then a piercing spear),
 * firepot (lobbed splash + burn zone), volley (arrows at up to `targets` enemies). Returns false if it didn't fire.
 */
function towerSpecFire(
  w: World,
  e: Entity,
  best: Entity,
  spec: TowerSpec,
  boost: number,
  cands: { o: Entity; score: number }[],
): boolean {
  const def = w.data.structures.types[e.structure!.type as StructureType];
  const st = e.structure!;
  const vsOf = (o: Entity) => def.vs?.[w.classOf(o)] ?? 1;
  const slow = (o: Entity) => (o.hero && st.heroSlow ? { slowMul: st.heroSlow, slowSeconds: 1 } : undefined);
  if (spec.id === "ballista") {
    const want = Math.atan2(best.transform.pos.x - e.transform.pos.x, best.transform.pos.z - e.transform.pos.z);
    if (st.aim === undefined || Math.abs(Math.atan2(Math.sin(want - st.aim), Math.cos(want - st.aim))) > 0.3) {
      st.aim = want;
      return false;
    }
    const vs = Math.max(0.8, vsOf(best));
    w.fireProjectile(e, best, st.damage * boost * vs, 34, false, "spear", 3.4, false, undefined, slow(best));
    const sx = e.transform.pos.x;
    const sz = e.transform.pos.z;
    const dx = best.transform.pos.x - sx;
    const dz = best.transform.pos.z - sz;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    st.aim = Math.atan2(dx, dz);
    const reach = len + (spec.pierce ?? 5);
    for (const o of w.entities) {
      if (!o.alive || o === best || o.team === e.team || o.structure || !w.visibleTo(e.team, o)) continue;
      const ox = o.transform.pos.x - sx;
      const oz = o.transform.pos.z - sz;
      const along = ox * ux + oz * uz;
      if (along < 1 || along > reach) continue;
      if (Math.abs(ox * uz - oz * ux) > (spec.pierceWidth ?? 1) + o.radius) continue;
      w.damage(e, o, st.damage * boost * Math.max(0.8, vsOf(o)) * 0.75, { fromX: sx, fromZ: sz, knockback: 2 });
    }
    w.emit({
      type: "pulse",
      x: sx + ux * reach,
      y: e.transform.y,
      z: sz + uz * reach,
      radius: 0,
      team: e.team,
      style: "pierce",
    });
    return true;
  }
  if (spec.id === "firepot") {
    const r = spec.splash ?? 2.5;
    w.fireAtPoint(
      e,
      best.transform.pos.x,
      best.transform.pos.z,
      14,
      "firepot",
      3.4,
      { radius: r, damage: st.damage * boost * 1.1, slowMul: 0.8, slowSeconds: 0.8 },
      true,
      { radius: spec.burnRadius ?? r, dps: spec.burnDps ?? 30, seconds: spec.burnSeconds ?? 3 },
    );
    return true;
  }
  if (spec.id === "volley") {
    const list = cands.sort((a, b) => a.score - b.score).map((c) => c.o);
    const picks: Entity[] = [best];
    for (const o of list) {
      if (picks.length >= (spec.targets ?? 3)) break;
      if (picks.includes(o) || !w.los(e, o, def.projectile?.losTolerance ?? 0.3, 3.2)) continue;
      picks.push(o);
    }
    while (picks.length < (spec.targets ?? 3)) picks.push(best);
    for (const o of picks)
      w.fireProjectile(e, o, st.damage * boost * vsOf(o), 28, false, "arrow", 3.4, true, undefined, slow(o));
  }
  return true;
}
