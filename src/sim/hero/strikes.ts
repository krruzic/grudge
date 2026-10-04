// Hit-shape helpers shared by ability kinds: melee arcs, flurry hits, shove, dash contact, ground slams with echoes,
// circular AoE, hex landings and dash lines. All damage goes through w.damage; target iteration uses a snapshot of
// w.entities (kills during the loop must not skip anyone).
import type { World } from "../world.ts";
import type { Entity, HeroAction } from "../types.ts";
import type { AbilityDef } from "../config.ts";
import { spawnUnit } from "../structures.ts";
import { abilities, markTargets, pullTo, zoneAt } from "../talents.ts";
import { maxHits } from "./common.ts";

/**
 * One hit of a flurry. Targets already hit this flurry only take the follow-up if they haven't been knocked more
 * than 0.6 away (the first hit on a target deals 2.5x); knockback is sideways to keep them in the cone.
 */
export function flurryHit(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const last = a.combo === (def.count ?? 5);
  const range = def.range ?? 3;
  const cosArc = Math.cos((((def.arcDeg ?? 150) / 2) * Math.PI) / 180);
  const seen = (a.pinned ??= {});
  let hits = 0;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz);
    if (d - o.radius > range) continue;
    if (d > 0.3 && (dx * a.dirX + dz * a.dirZ) / d < cosArc) continue;
    if (Math.abs(o.transform.y - t.y) > 2.5) continue;
    const prev = seen[o.id];
    if (prev && Math.hypot(o.transform.pos.x - prev[0], o.transform.pos.z - prev[1]) > 0.6) continue;
    if (hits >= maxHits(w, e) && !o.hero) continue;
    hits++;
    const mul = prev ? 1 : 2.5;
    const side = dx * a.dirZ - dz * a.dirX >= 0 ? 1 : -1;
    const kx = a.dirZ * side * 0.8 + a.dirX * 0.35;
    const kz = -a.dirX * side * 0.8 + a.dirZ * 0.35;
    w.damage(e, o, (def.damage ?? 40) * mul * w.damageMulOf(e), {
      knockback: 5,
      fromX: o.transform.pos.x - kx,
      fromZ: o.transform.pos.z - kz,
      canMiss: true,
      big: last,
      vsStunnedMul: def.vsStunnedMul,
    });
    seen[o.id] = [o.transform.pos.x, o.transform.pos.z];
  }
}

/** Melee cone hit: heroes first, then nearest, capped by maxHits. Returns targets that were actually hit. */
export function arcHit(
  w: World,
  e: Entity,
  dirX: number,
  dirZ: number,
  range: number,
  arcDeg: number,
  damage: number,
  knockback: number,
  big: boolean,
  vsStunnedMul?: number,
): Entity[] {
  const out: Entity[] = [];
  const cands: [Entity, number][] = [];
  const t = e.transform;
  const cosArc = Math.cos(((arcDeg / 2) * Math.PI) / 180);
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz);
    if (d - o.radius > range) continue;
    if (d > 0.3 && (dx * dirX + dz * dirZ) / d < cosArc) continue;
    if (Math.abs(o.transform.y - t.y) > 2.5) continue;
    cands.push([o, d]);
  }
  cands.sort((a, b) => (b[0].hero ? 1 : 0) - (a[0].hero ? 1 : 0) || a[1] - b[1]);
  for (const [o] of cands.slice(0, maxHits(w, e)))
    if (w.damage(e, o, damage, { knockback, canMiss: true, big, vsStunnedMul })) out.push(o);
  return out;
}

/** Universal shove (attack+block): breaks block, knocks back and briefly stuns; weaker against neutrals. */
export function shoveHit(w: World, e: Entity, a: HeroAction): void {
  const sv = w.data.heroes.baseline.shove;
  const t = e.transform;
  const cosArc = Math.cos(((sv.arcDeg / 2) * Math.PI) / 180);
  let any = false;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.structure) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz);
    if (d - o.radius > sv.range) continue;
    if (d > 0.3 && (dx * a.dirX + dz * a.dirZ) / d < cosArc) continue;
    if (Math.abs(o.transform.y - t.y) > 2) continue;
    if (o.hero) o.hero.blocking = false;
    const heavy = o.neutral ? 0.35 : 1;
    w.damage(e, o, sv.damage * w.damageMulOf(e), {
      knockback: sv.knockback * heavy,
      fromX: t.pos.x - a.dirX,
      fromZ: t.pos.z - a.dirZ,
      stun: sv.stun * heavy,
      big: true,
    });
    any = true;
  }
  w.emit({ type: "shove", x: t.pos.x + a.dirX, y: t.y, z: t.pos.z + a.dirZ, team: any ? e.team : -1, src: e.id });
}

/** Contact damage while dashing, once per target per dash. */
export function dashHits(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const ids = a.hitIds ?? (a.hitIds = []);
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || ids.includes(o.id)) continue;
    if (w.dist(e, o) - o.radius > (def.width ?? 1.2)) continue;
    if (ids.length >= maxHits(w, e) && !o.hero) continue;
    ids.push(o.id);
    const hit = w.damage(e, o, (def.damage ?? 60) * w.damageMulOf(e), {
      knockback: def.knockback ?? 3,
      structureDamage: def.structureDamage !== undefined ? def.structureDamage * w.damageMulOf(e) : undefined,
      big: true,
      executeBelow: def.executeBelow,
      executeMul: def.executeMul,
    });
    if (hit && a.name === "b") markTargets(w, e, [o]);
  }
}

/** Ground slam at a point, plus delayed echo slams stepping along the aim direction. */
export function slamAt(
  w: World,
  e: Entity,
  cx: number,
  cz: number,
  radius: number,
  def: AbilityDef,
  mul: number,
  dirX: number,
  dirZ: number,
): void {
  const fx = def.fx;
  const once = (x: number, z: number, scale: number) => {
    if (fx?.pull) pullTo(w, e, x, z, radius + 1.5);
    w.emit({ type: "slam", x, y: w.groundY(x, z), z, radius, team: e.team, src: e.id });
    aoe(w, e, x, z, radius, def, mul * scale);
  };
  once(cx, cz, 1);
  if (fx?.zoneAfter) zoneAt(w, e, cx, cz, radius, fx.zoneAfter);
  const ec = fx?.echo;
  if (ec) {
    for (let k = 1; k <= ec.count; k++) {
      const x = cx + dirX * (ec.step ?? 0) * k;
      const z = cz + dirZ * (ec.step ?? 0) * k;
      w.later(ec.delay * k, () => {
        if (e.alive) once(x, z, ec.scale);
      });
    }
  }
}

/** Circular AoE using the ability's damage/stun/slow fields. Returns targets that were actually hit. */
export function aoe(
  w: World,
  e: Entity,
  cx: number,
  cz: number,
  radius: number,
  def: AbilityDef,
  mul: number,
): Entity[] {
  const out: Entity[] = [];
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    const d = Math.hypot(o.transform.pos.x - cx, o.transform.pos.z - cz);
    if (d - o.radius > radius) continue;
    const impaired = w.time < o.status.stunUntil || (w.time < o.status.slowUntil && o.status.slowMul < 1);
    const stun = def.stunSeconds ? def.stunSeconds + (impaired ? (def.stunBonus ?? 0) : 0) : undefined;
    const hit = w.damage(e, o, (def.damage ?? 50) * mul, {
      knockback: def.knockback,
      fromX: cx,
      fromZ: cz,
      slowMul: def.slowMul,
      slowSeconds: def.slowSeconds,
      stun,
      structureDamage: def.structureDamage !== undefined ? def.structureDamage * mul : undefined,
      canMiss: def.kind === "slam",
      big: true,
      vsSlowedMul: def.vsSlowedMul,
    });
    if (hit && def.cowSeconds && o.kind !== "structure") o.status.cowedUntil = w.time + def.cowSeconds;
    if (hit) out.push(o);
  }
  return out;
}

/** Landing of a hex: damage + hex mark (hexed victims that die rise for the hexer), optional summons/zone. */
export function hexLand(w: World, e: Entity, x: number, z: number, def: AbilityDef, mul: number): void {
  const fx = def.fx;
  const r = def.radius ?? 2.5;
  if (fx?.pull) pullTo(w, e, x, z, r + 2);
  w.emit({ type: "slam", x, y: w.groundY(x, z), z, radius: r, team: e.team, src: e.id });
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > r) continue;
    if (def.hexSeconds && o.kind !== "structure") {
      o.status.hexUntil = w.time + def.hexSeconds;
      o.status.hexOwner = e.id;
    }
    w.damage(e, o, (def.damage ?? 80) * mul, {
      fromX: x,
      fromZ: z,
      slowMul: def.slowMul,
      slowSeconds: def.slowSeconds,
      stun: def.stunSeconds,
      knockback: fx?.pull ? 0 : 2,
      big: true,
    });
  }
  if (fx?.zoneAfter) zoneAt(w, e, x, z, r, fx.zoneAfter);
  if (fx?.summon) {
    for (let k = 0; k < fx.summon.count; k++) {
      const u = spawnUnit(w, e.team, fx.summon.type, x + (k - 0.5) * 0.8, z, 1);
      if (u) {
        u.expiresAt = w.time + fx.summon.seconds;
        u.owner = e.id;
        u.unit!.raised = true;
      }
    }
  }
}

/** Damage everything along a segment (afterimage talent). */
function dashLine(
  w: World,
  e: Entity,
  fx0: number,
  fz0: number,
  fx1: number,
  fz1: number,
  def: AbilityDef,
  mul: number,
): void {
  const dx = fx1 - fx0;
  const dz = fz1 - fz0;
  const len = Math.hypot(dx, dz) || 1;
  const hit: Entity[] = [];
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    const ox = o.transform.pos.x - fx0;
    const oz = o.transform.pos.z - fz0;
    const along = Math.max(0, Math.min(len, (ox * dx + oz * dz) / len));
    const px = fx0 + (dx / len) * along;
    const pz = fz0 + (dz / len) * along;
    if (Math.hypot(o.transform.pos.x - px, o.transform.pos.z - pz) - o.radius > (def.width ?? 1.2)) continue;
    if (
      w.damage(e, o, (def.damage ?? 60) * mul, {
        knockback: def.knockback ?? 3,
        big: true,
        executeBelow: def.executeBelow,
        executeMul: def.executeMul,
        fromX: px - dx / len,
        fromZ: pz - dz / len,
      })
    )
      hit.push(o);
  }
  markTargets(w, e, hit);
}

/** End-of-dash talents: empower the next A, and an afterimage that re-runs the dash line after a delay. */
export function endDash(w: World, e: Entity, a: HeroAction): void {
  const def = abilities(w, e).b;
  const fx = def.fx;
  const h = e.hero!;
  if (fx?.empowerNextA) {
    h.empowerMul = fx.empowerNextA;
    h.empowerUntil = w.time + 3;
    w.emit({
      type: "callout",
      x: e.transform.pos.x,
      y: e.transform.y,
      z: e.transform.pos.z,
      team: e.team,
      text: "EMPOWERED",
      owner: e.id,
    });
  }
  if (fx?.afterimage && a.fromX2 !== undefined) {
    const x0 = a.fromX2;
    const z0 = a.fromZ2!;
    const x1 = e.transform.pos.x;
    const z1 = e.transform.pos.z;
    const mul = w.damageMulOf(e);
    w.later(fx.afterimage, () => {
      if (!e.alive) return;
      w.emit({
        type: "reach",
        x: x0,
        y: w.groundY(x0, z0),
        z: z0,
        tx: x1,
        tz: z1,
        team: e.team,
        hit: false,
        style: "afterimage",
        src: e.id,
      });
      dashLine(w, e, x0, z0, x1, z1, def, mul);
    });
  }
}
