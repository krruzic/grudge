// Spell and mobility ability kinds: shoot (bolt/orb projectiles), hex (delayed ground curse with echoes), summon,
// stealth, blink, rootcage (delayed root) and reach (line grab/punch, optional pull/pierce/splinter).
import type { World } from "../../world.ts";
import type { Entity, HeroAction, UnitType } from "../../types.ts";
import type { AbilityDef } from "../../config.ts";
import { spawnUnit, wardSummon } from "../../structures.ts";
import { zoneAt } from "../../talents.ts";
import { aimFor, aimTarget } from "../common.ts";
import { hexLand } from "../strikes.ts";
import { isMarksman, marksmanShot } from "../marksman.ts";

/** Bolt/orb projectile (marksman A is delegated); shot strings may add splash ("orb") and talent tags. */
export function fireShoot(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  if (a.name === "a" && isMarksman(w, e)) {
    marksmanShot(w, e, a, def, mul);
    return;
  }
  const target = aimFor(w, e, a, def.range ?? 8);
  const sh = a.name === "a" && def.shots ? def.shots[a.combo] : undefined;
  const dmg = (sh?.damage ?? def.damage ?? 30) * mul;
  const splash = sh?.splash
    ? {
        radius: sh.splash,
        damage: (sh.splashDamage ?? 30) * mul,
        slowMul: sh.slowMul ?? 1,
        slowSeconds: sh.slowSeconds ?? 0,
      }
    : undefined;
  const style = splash ? "orb" : "magic";
  const speed = (def.speed ?? 15) * (splash ? 0.8 : 1);
  if (target) {
    w.fireProjectile(e, target, dmg, speed, false, style, 1.6, true, splash);
    if (sh) w.projectiles[w.projectiles.length - 1].talent = splash ? "orb" : "bolt";
  } else
    w.fireAtPoint(
      e,
      t.pos.x + a.dirX * (def.range ?? 8),
      t.pos.z + a.dirZ * (def.range ?? 8),
      speed,
      style,
      1.6,
      splash,
    );
}

/** Telegraphed delayed curse at the target/placed point; echo talents add later casts further along. */
export function fireHex(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const target = a.placed ? null : aimFor(w, e, a, def.range ?? 8);
  const range = def.range ?? 8;
  const x = a.placed ? a.toX! : target ? target.transform.pos.x : t.pos.x + a.dirX * range * 0.7;
  const z = a.placed ? a.toZ! : target ? target.transform.pos.z : t.pos.z + a.dirZ * range * 0.7;
  const delay = def.delay ?? 0.8;
  const ec = def.fx?.echo;
  const n = 1 + (ec?.count ?? 0);
  for (let k = 0; k < n; k++) {
    const hx = x + a.dirX * (ec?.step ?? 0) * k;
    const hz = z + a.dirZ * (ec?.step ?? 0) * k;
    const at = delay + (ec?.delay ?? 0) * k;
    const scale = k === 0 ? 1 : (ec?.scale ?? 1);
    w.emit({
      type: "telegraph",
      x: hx,
      y: w.groundY(hx, hz),
      z: hz,
      radius: def.radius ?? 2.5,
      team: e.team,
      seconds: at,
      src: e.id,
    });
    w.later(at, () => {
      if (e.alive) hexLand(w, e, hx, hz, def, mul * scale);
    });
  }
}

/** Summon temporary units around the hero/placed point; optional hex pulse (hexRadius) around the hero. */
export function fireSummon(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const units = def.units ?? {};
  let k = 0;
  for (const [type, n] of Object.entries(units) as [UnitType, number][]) {
    for (let i = 0; i < n; i++) {
      const ang = k++ * 2.1 + t.facing;
      const sx = a.placed ? a.toX! : t.pos.x;
      const sz = a.placed ? a.toZ! : t.pos.z;
      const u = spawnUnit(w, e.team, type, sx + Math.sin(ang) * 2, sz + Math.cos(ang) * 2, 1);
      if (u) {
        u.expiresAt = w.time + (def.seconds ?? 20);
        u.owner = e.id;
        wardSummon(w, u, e);
      }
    }
  }
  w.emit({
    type: "telegraph",
    x: a.placed ? a.toX! : t.pos.x,
    y: a.placed ? w.groundY(a.toX!, a.toZ!) : t.y,
    z: a.placed ? a.toZ! : t.pos.z,
    radius: 3,
    team: e.team,
    seconds: 0.35,
    src: e.id,
  });
  if (def.hexRadius) {
    const hexSec = w.heroDef(e.hero!.type).abilities.b.hexSeconds ?? 6;
    w.emit({
      type: "telegraph",
      x: t.pos.x,
      y: t.y,
      z: t.pos.z,
      radius: def.hexRadius,
      team: e.team,
      seconds: 0.5,
      src: e.id,
    });
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.kind === "structure" || w.dist(e, o) > def.hexRadius) continue;
      o.status.hexUntil = w.time + hexSec;
      o.status.hexOwner = e.id;
    }
  }
  // Eruption: the dead burst out of the ground around him, knocking foes up (stun) as the army arrives.
  if (def.eruptRadius) {
    const r = def.eruptRadius;
    w.emit({ type: "slam", x: t.pos.x, y: t.y, z: t.pos.z, radius: r, team: e.team, src: e.id });
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.kind === "structure" || o.neutral) continue;
      if (Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius > r) continue;
      w.damage(e, o, (def.damage ?? 0) * w.damageMulOf(e), {
        fromX: t.pos.x,
        fromZ: t.pos.z,
        stun: def.stunSeconds,
        knockback: def.knockback ?? 4,
        big: true,
      });
    }
  }
}

/** Smoke: stealth (next hit ambushes) plus a speed buff. */
export function fireStealth(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  e.status.stealthUntil = w.time + (def.seconds ?? 4);
  e.status.ambushMul = def.ambushMul ?? 2;
  e.status.buffUntil = w.time + (def.seconds ?? 4);
  e.status.buffSpeedMul = def.speedMul ?? 1.3;
  e.status.buffDamageMul = 1;
  w.emit({ type: "blink", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, src: e.id });
  if (def.fx?.zoneAfter) zoneAt(w, e, t.pos.x, t.pos.z, def.fx.zoneAfter.radius ?? 3, def.fx.zoneAfter);
}

/** Teleport up to range along the aim, to the furthest open spot (not through sealed gates). */
export function fireBlink(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const range = def.range ?? 6;
  const pl = a.placed ? Math.hypot(a.toX! - t.pos.x, a.toZ! - t.pos.z) : range;
  const d = Math.min(range, pl);
  w.emit({ type: "blink", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, src: e.id });
  let bx = t.pos.x;
  let bz = t.pos.z;
  for (let k = 0; k <= 12; k++) {
    const f = 1 - k / 12;
    const x = t.pos.x + a.dirX * d * f;
    const z = t.pos.z + a.dirZ * d * f;
    if (
      Number.isFinite(w.terrain.heightAt(x, z)) &&
      w.nav.open(w.nav.index(Math.floor(x), Math.floor(z))) &&
      !w.mapEvents.sealed(t.pos.x, t.pos.z, x, z)
    ) {
      bx = x;
      bz = z;
      break;
    }
  }
  w.emit({
    type: "reach",
    x: t.pos.x,
    y: t.y,
    z: t.pos.z,
    tx: bx,
    tz: bz,
    team: e.team,
    hit: false,
    style: "afterimage",
    src: e.id,
  });
  w.teleport(e, bx, bz);
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.35);
  if (def.seconds) {
    e.status.stealthUntil = w.time + def.seconds;
    e.status.ambushMul = def.ambushMul ?? 1.5;
  }
  if (def.fx?.empowerNextA) {
    e.hero!.empowerMul = def.fx.empowerNextA;
    e.hero!.empowerUntil = w.time + 3;
  }
  w.emit({ type: "blink", x: bx, y: w.groundY(bx, bz), z: bz, team: e.team, src: e.id });
}

/** Telegraphed root: after `delay` enemies in radius are stunned. */
export function fireRootcage(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const range = def.range ?? 9;
  const target = a.placed ? null : aimFor(w, e, a, range);
  const x = a.placed ? a.toX! : target ? target.transform.pos.x : t.pos.x + a.dirX * range * 0.6;
  const z = a.placed ? a.toZ! : target ? target.transform.pos.z : t.pos.z + a.dirZ * range * 0.6;
  const r = def.radius ?? 2.4;
  w.emit({
    type: "telegraph",
    x,
    y: w.groundY(x, z),
    z,
    radius: r,
    team: e.team,
    seconds: def.delay ?? 0.5,
    src: e.id,
    style: "roots",
  });
  w.later(def.delay ?? 0.5, () => {
    if (!e.alive) return;
    w.emit({ type: "slam", x, y: w.groundY(x, z), z, radius: r * 1.5, team: e.team, src: e.id, trap: true });
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.structure) continue;
      if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > r) continue;
      w.damage(e, o, (def.damage ?? 60) * mul, {
        stun: def.stunSeconds ?? 1.4,
        fromX: x,
        fromZ: z,
        knockback: 0,
        big: true,
      });
    }
  });
}

/**
 * Line grab/punch up to range (stopped by tall terrain): hits the nearest enemy in the line, or everything with
 * pierce. Pull talents drag victims back toward the hero; splinter adds a blast at the line end.
 */
export function fireReach(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const reach = def.range ?? 8;
  const width = def.width ?? 1;
  let best: Entity | null = null;
  let bestD = reach;
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team || o.neutral) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const along = dx * a.dirX + dz * a.dirZ;
    if (along < 0 || along - o.radius > reach) continue;
    const side = Math.abs(dx * a.dirZ - dz * a.dirX);
    if (side > width + o.radius || Math.abs(o.transform.y - t.y) > 3) continue;
    if (along < bestD) {
      bestD = along;
      best = o;
    }
  }
  let len = reach;
  for (let s = 0.5; s <= reach; s += 0.5) {
    if (w.losHeight(t.pos.x + a.dirX * s, t.pos.z + a.dirZ * s) > t.y + 2.2) {
      len = s;
      break;
    }
  }
  if (best && bestD > len) best = null;
  const fx = def.fx;
  const victims: Entity[] = [];
  if (fx?.pierce) {
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.neutral) continue;
      const dx = o.transform.pos.x - t.pos.x;
      const dz = o.transform.pos.z - t.pos.z;
      const along = dx * a.dirX + dz * a.dirZ;
      if (along < 0 || along - o.radius > len) continue;
      if (Math.abs(dx * a.dirZ - dz * a.dirX) > width + o.radius || Math.abs(o.transform.y - t.y) > 3) continue;
      victims.push(o);
    }
  } else if (best) {
    len = Math.max(0.8, bestD);
    victims.push(best);
  }
  const tx = t.pos.x + a.dirX * len;
  const tz = t.pos.z + a.dirZ * len;
  w.emit({
    type: "reach",
    x: t.pos.x,
    y: t.y,
    z: t.pos.z,
    tx,
    tz,
    team: e.team,
    hit: victims.length > 0,
    style: fx?.pull ? "vine" : undefined,
    src: e.id,
  });
  a.toX = tx;
  a.toZ = tz;
  for (const o of victims) {
    const hit = w.damage(e, o, (def.damage ?? 70) * mul * (o.structure ? (def.structureMul ?? 1.5) : 1), {
      knockback: fx?.pull ? 0 : (def.knockback ?? 8),
      fromX: t.pos.x,
      fromZ: t.pos.z,
      stun: def.stunSeconds,
      slowMul: def.slowMul,
      slowSeconds: def.slowSeconds,
      big: true,
      vsStunnedMul: def.vsStunnedMul,
    });
    if (hit && fx?.pull && o.alive && !o.structure && w.time >= o.status.ccImmuneUntil) {
      const dx = t.pos.x - o.transform.pos.x;
      const dz = t.pos.z - o.transform.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const k = Math.min(18, Math.max(0, d - 1.4) * 3.6);
      o.status.kvx += (dx / d) * k;
      o.status.kvz += (dz / d) * k;
    }
  }
  if (fx?.splinter) {
    w.emit({
      type: "slam",
      x: tx,
      y: w.groundY(tx, tz),
      z: tz,
      radius: fx.splinter.radius,
      team: e.team,
      src: e.id,
    });
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.neutral) continue;
      if (Math.hypot(o.transform.pos.x - tx, o.transform.pos.z - tz) - o.radius > fx.splinter.radius) continue;
      w.damage(e, o, fx.splinter.damage * mul, { fromX: tx, fromZ: tz, knockback: 4 });
    }
  }
}
