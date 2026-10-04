// Friar: healing kegs (B, lands as a heal splash + ale puddle), powder kegs (R, fused explosive), Brewfest (Z,
// cask structure with a brew zone that heals, slows foes and buffs allies; "last call" talent burst when it ends),
// passive Plenty aura heal, and Keg Rocket (dodge while standing in his own ale puddle). Kegs are tracked in
// w.kegs and resolved by updateKegs each tick.
import type { World } from "../world.ts";
import type { AbilityDef } from "../config.ts";
import type { Command, Entity, HeroAction, Keg, Zone } from "../types.ts";
import { abilities, addShield, zoneAt } from "../talents.ts";

const fx = (
  w: World,
  name: string,
  src: number,
  team: number,
  x: number,
  y: number,
  z: number,
  extra: { radius?: number; tx?: number; tz?: number; seconds?: number; id?: number } = {},
) => w.emit({ type: "heroFx", name, src, team, x, y, z, ...extra });

/** Heal applied by the friar (lowHealMul bonus on badly hurt allies). Returns hp actually restored. */
export function healFrom(w: World, src: Entity | null | undefined, o: Entity, amount: number): number {
  if (!o.alive || o.structure || o.hp >= o.maxHp || amount <= 0) return 0;
  const hk = src?.hero ? w.heroDef(src.hero.type).hooks : undefined;
  if (hk?.lowHealMul && o.hp < o.maxHp * (hk.lowHealBelow ?? 0.5)) amount *= hk.lowHealMul;
  const before = o.hp;
  w.heal(o, amount);
  return o.hp - before;
}

/** Passive aura: every 15 ticks heal nearby hurt allies by a fraction of their max hp. */
export function plentyTick(w: World, e: Entity): void {
  const hk = w.heroDef(e.hero!.type).hooks;
  const r = hk.plentyRadius;
  if (!r || w.tick % 15 !== 0) return;
  let any = false;
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.structure || o.hp >= o.maxHp) continue;
    if (Math.hypot(o.transform.pos.x - e.transform.pos.x, o.transform.pos.z - e.transform.pos.z) > r) continue;
    const frac = o.hero ? (hk.plentyHero ?? 0.006) : (hk.plentyUnit ?? 0.012);
    if (healFrom(w, e, o, o.maxHp * frac * 0.5) > 0) any = true;
  }
  if (hk.selfRegen && e.hp < e.maxHp && !e.hero!.dead) healFrom(w, e, e, e.maxHp * hk.selfRegen * 0.5);
  if (any && w.tick % 60 === 0)
    fx(w, "plenty", e.id, e.team, e.transform.pos.x, e.transform.y, e.transform.pos.z, { radius: r });
}

/** Best keg landing spot for healing: the hurt ally position (within range) covering the most missing hp. */
function allySpot(w: World, e: Entity, range: number, radius: number): { x: number; z: number; score: number } | null {
  const p = e.transform.pos;
  const allies = w.entities.filter(
    (o) =>
      o.alive &&
      o.team === e.team &&
      !o.structure &&
      Math.hypot(o.transform.pos.x - p.x, o.transform.pos.z - p.z) <= range + radius,
  );
  let best: { x: number; z: number; score: number } | null = null;
  for (const c of allies) {
    let cx = c.transform.pos.x;
    let cz = c.transform.pos.z;
    const d = Math.hypot(cx - p.x, cz - p.z);
    if (d > range) {
      cx = p.x + ((cx - p.x) / d) * range;
      cz = p.z + ((cz - p.z) / d) * range;
    }
    let score = 0;
    for (const o of allies) {
      if (Math.hypot(o.transform.pos.x - cx, o.transform.pos.z - cz) - o.radius > radius) continue;
      const miss = o.maxHp - o.hp;
      score += o.hero ? miss * (o.hp < o.maxHp * 0.5 ? 2 : 1.4) : miss;
    }
    if (!best || score > best.score) best = { x: cx, z: cz, score };
  }
  return best;
}

/** Bot helper: how much a heal keg could restore right now. */
export function healSpotScore(w: World, e: Entity): number {
  const b = abilities(w, e).b;
  return allySpot(w, e, b.range ?? 8, b.radius ?? 3)?.score ?? 0;
}

/** Best powder keg landing spot: the enemy position covering the most enemies (heroes weighted). */
function foeSpot(w: World, e: Entity, range: number, radius: number): { x: number; z: number; score: number } | null {
  const p = e.transform.pos;
  const foes = w.entities.filter(
    (o) =>
      o.alive &&
      o.team !== e.team &&
      w.canSee(e, o) &&
      Math.hypot(o.transform.pos.x - p.x, o.transform.pos.z - p.z) - o.radius <= range + radius,
  );
  let best: { x: number; z: number; score: number } | null = null;
  for (const c of foes) {
    let cx = c.transform.pos.x;
    let cz = c.transform.pos.z;
    const d = Math.hypot(cx - p.x, cz - p.z);
    if (d > range) {
      cx = p.x + ((cx - p.x) / d) * range;
      cz = p.z + ((cz - p.z) / d) * range;
    }
    let score = 0;
    for (const o of foes) {
      if (Math.hypot(o.transform.pos.x - cx, o.transform.pos.z - cz) - o.radius > radius) continue;
      score += o.hero ? 3 : o.structure ? (o.structure.type === "core" ? 1 : 2.5) : 1;
    }
    if (!best || score > best.score) best = { x: cx, z: cz, score };
  }
  return best;
}

/** Bot helper: how good a powder keg throw is right now. */
export function clumpScore(w: World, e: Entity): number {
  const r = abilities(w, e).r;
  return foeSpot(w, e, r.range ?? 8, r.radius ?? 3.2)?.score ?? 0;
}

/** B/R: throw a keg at the placed point, the best auto spot, or straight ahead. Flight time grows with distance. */
export function throwKeg(
  w: World,
  e: Entity,
  a: HeroAction,
  def: AbilityDef,
  kind: "heal" | "powder",
  mul: number,
): void {
  const t = e.transform;
  const range = def.range ?? 8;
  let x: number;
  let z: number;
  if (a.placed && a.toX !== undefined && a.toZ !== undefined) {
    x = a.toX;
    z = a.toZ;
  } else {
    const s = kind === "heal" ? allySpot(w, e, range, def.radius ?? 3) : foeSpot(w, e, range, def.radius ?? 3.2);
    const auto = s && (kind === "powder" || s.score > 0);
    x = auto ? s!.x : t.pos.x + a.dirX * range * 0.75;
    z = auto ? s!.z : t.pos.z + a.dirZ * range * 0.75;
  }
  x = Math.max(1, Math.min(w.terrain.width - 1, x));
  z = Math.max(1, Math.min(w.terrain.depth - 1, z));
  const dx = x - t.pos.x;
  const dz = z - t.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.3) t.facing = Math.atan2(dx, dz);
  spawnKeg(
    w,
    e,
    kind,
    t.pos.x + Math.sin(t.facing) * 0.5,
    t.y + 1.9,
    t.pos.z + Math.cos(t.facing) * 0.5,
    x,
    z,
    (def.flight ?? 0.35) + d / 18,
    mul,
  );
}

function spawnKeg(
  w: World,
  e: Entity,
  kind: Keg["kind"],
  fx0: number,
  fy0: number,
  fz0: number,
  x: number,
  z: number,
  dur: number,
  mul: number,
): void {
  w.kegs.push({
    id: w.newId(),
    ownerId: e.id,
    team: e.team,
    kind,
    fromX: fx0,
    fromY: fy0,
    fromZ: fz0,
    toX: x,
    toY: w.groundY(x, z),
    toZ: z,
    start: w.time,
    dur,
    landed: false,
    fuseAt: 0,
    mul,
  });
  fx(w, kind === "heal" || kind === "miniheal" ? "kegThrow" : "powderThrow", e.id, e.team, fx0, fy0, fz0, {
    tx: x,
    tz: z,
    seconds: dur,
  });
}

/** Cluster talent: a landed keg scatters `count` mini kegs in a ring. */
function scatter(
  w: World,
  owner: Entity,
  k: Keg,
  kind: Keg["kind"],
  c: NonNullable<AbilityDef["fx"]>["cluster"],
): void {
  if (!c) return;
  for (let i = 0; i < c.count; i++) {
    const ang = (i / c.count) * Math.PI * 2 + k.id * 0.7;
    const x = k.toX + Math.cos(ang) * c.dist;
    const z = k.toZ + Math.sin(ang) * c.dist;
    if (!Number.isFinite(w.terrain.heightAt(x, z))) continue;
    spawnKeg(w, owner, kind, k.toX, k.toY + 0.5, k.toZ, x, z, 0.45, k.mul);
  }
}

/** Heal keg landing: heal allies in radius, optional shield; full kegs also leave an ale puddle and scatter. */
function splash(w: World, owner: Entity, k: Keg, radius: number, heal: number, mini: boolean): void {
  const b = abilities(w, owner).b;
  fx(w, mini ? "kegSplashSmall" : "kegSplash", owner.id, owner.team, k.toX, k.toY, k.toZ, { radius });
  for (const o of w.entities) {
    if (!o.alive || o.team !== owner.team || o.structure) continue;
    if (Math.hypot(o.transform.pos.x - k.toX, o.transform.pos.z - k.toZ) - o.radius > radius) continue;
    const got = healFrom(w, owner, o, heal);
    if (!mini && b.fx?.kegShield)
      addShield(o, b.fx.kegShield.amount, b.fx.kegShield.amount, b.fx.kegShield.seconds, w.time);
    if (got >= 1 && o.hero)
      fx(w, "healNum", owner.id, owner.team, o.transform.pos.x, o.transform.y + 1, o.transform.pos.z, {
        radius: Math.round(got),
        id: o.id,
      });
    else if (got >= 1)
      w.emit({
        type: "heal",
        x: o.transform.pos.x,
        y: o.transform.y,
        z: o.transform.pos.z,
        team: owner.team,
        src: owner.id,
      });
  }
  if (mini) return;
  w.zones.push({
    id: w.newId(),
    team: owner.team,
    ownerId: owner.id,
    x: k.toX,
    z: k.toZ,
    radius: b.puddleRadius ?? 2.6,
    until: w.time + (b.puddleSeconds ?? 5),
    dps: 0,
    slowMul: b.fx?.puddleSlow ?? 1,
    style: "ale",
    heal: b.puddleHeal ?? 22,
    haste: b.fx?.puddleHaste,
    lingerHeal: b.puddleLinger ?? 3,
    poison: b.puddlePoison ?? 18,
    poisonSeconds: b.poisonSeconds ?? 3,
  });
  scatter(w, owner, k, "miniheal", b.fx?.cluster);
}

/** Powder keg explosion (full or mini): damage enemies in radius, extra vs units, fixed structure damage. */
function boom(w: World, owner: Entity, k: Keg, mini: boolean): void {
  const r = abilities(w, owner).r;
  const c = r.fx?.cluster;
  const radius = mini ? (c?.radius ?? 2) : (r.radius ?? 3.2);
  const base = mini ? (c?.damage ?? 40) : (r.damage ?? 110);
  fx(w, mini ? "kegPop" : "kegBoom", owner.id, owner.team, k.toX, k.toY, k.toZ, { radius });
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === owner.team) continue;
    if (Math.hypot(o.transform.pos.x - k.toX, o.transform.pos.z - k.toZ) - o.radius > radius) continue;
    const dmg = base * k.mul * (o.unit ? (r.unitMul ?? 1.6) : 1);
    w.damage(owner, o, dmg, {
      fromX: k.toX,
      fromZ: k.toZ,
      knockback: mini ? 5 : (r.knockback ?? 10),
      big: true,
      structureDamage: o.structure ? (mini ? base * 0.8 : (r.structureDamage ?? 160)) * k.mul : undefined,
    });
  }
  if (mini) return;
  if (r.fx?.zoneAfter) zoneAt(w, owner, k.toX, k.toZ, radius, r.fx.zoneAfter);
  scatter(w, owner, k, "minipowder", c);
}

/** Step phase 5: land kegs when their flight ends; powder kegs then wait for their fuse (instant on a direct hero hit). */
export function updateKegs(w: World): void {
  for (let i = w.kegs.length - 1; i >= 0; i--) {
    const k = w.kegs[i];
    const owner = w.getAny(k.ownerId);
    if (!owner?.hero) {
      w.kegs.splice(i, 1);
      continue;
    }
    if (!k.landed) {
      if (w.time < k.start + k.dur) continue;
      k.landed = true;
      if (k.kind === "heal") {
        const b = abilities(w, owner).b;
        splash(w, owner, k, b.radius ?? 3, b.heal ?? 110, false);
        w.kegs.splice(i, 1);
        continue;
      }
      if (k.kind === "miniheal") {
        const c = abilities(w, owner).b.fx?.cluster;
        splash(w, owner, k, c?.radius ?? 2, c?.heal ?? 40, true);
        w.kegs.splice(i, 1);
        continue;
      }
      if (k.kind === "minipowder") {
        boom(w, owner, k, true);
        w.kegs.splice(i, 1);
        continue;
      }
      const r = abilities(w, owner).r;
      const direct = w.entities.some(
        (o) =>
          o.alive &&
          o.hero &&
          o.team !== owner.team &&
          Math.hypot(o.transform.pos.x - k.toX, o.transform.pos.z - k.toZ) < 1.4,
      );
      k.fuseAt = w.time + (direct ? 0 : (r.fuse ?? 1));
      fx(w, "kegLand", owner.id, owner.team, k.toX, k.toY, k.toZ, {
        radius: r.radius ?? 3.2,
        seconds: k.fuseAt - w.time,
      });
    }
    if (k.kind === "powder" && w.time >= k.fuseAt) {
      boom(w, owner, k, false);
      w.kegs.splice(i, 1);
    }
  }
}

/** Z: plant a cask (one per friar) with an anchored brew zone that lasts as long as the cask. */
export function brewfest(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  let x = t.pos.x + a.dirX * 1.9;
  let z = t.pos.z + a.dirZ * 1.9;
  const i = w.nav.nearestOpen(x, z, 3);
  if (i >= 0) {
    x = (i % w.nav.w) + 0.5;
    z = Math.floor(i / w.nav.w) + 0.5;
  }
  for (const o of w.entities) if (o.alive && o.owner === e.id && o.structure?.cask) o.expiresAt = w.time;
  const s = w.addEntity(e.team, "structure", 0.95, x, z, def.hp ?? 600);
  s.structure = {
    type: "damage",
    padIndex: -1,
    level: 1,
    builtAt: w.time,
    ready: true,
    nextAction: w.time + 9999,
    range: 0,
    damage: 0,
    lastFireAt: -99,
    shielded: false,
    siege: { cooldown: 9999, vs: {}, modId: 0 },
    cask: true,
  };
  s.transform.facing = s.transform.prevFacing = Math.atan2(t.pos.x - x, t.pos.z - z);
  s.expiresAt = w.time + (def.seconds ?? 10);
  s.owner = e.id;
  w.nav.setBlocked(x, z, 0.3, true);
  w.zones.push({
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x,
    z,
    radius: def.radius ?? 7,
    until: s.expiresAt,
    dps: 0,
    slowMul: def.slowMul ?? 0.7,
    style: "brewfest",
    heal: def.heal ?? 24,
    anchor: s.id,
    brew: def.damageMul ?? 1.15,
    haste: def.hasteMul,
    vuln: def.vulnMul,
  });
  const r = def.radius ?? 7;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.structure) continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > r * 0.6) continue;
    if (o.team === e.team) {
      healFrom(w, e, o, def.burstHeal ?? 0);
      if (o.status.slowUntil > w.time) o.status.slowUntil = 0;
      if (o.status.stunUntil > w.time) o.status.stunUntil = w.time;
    } else
      w.damage(e, o, (def.damage ?? 0) * w.damageMulOf(e), {
        fromX: x,
        fromZ: z,
        knockback: def.knockback ?? 8,
        stun: def.stunSeconds,
        big: true,
      });
  }
  fx(w, "brewfest", e.id, e.team, x, w.groundY(x, z), z, {
    radius: def.radius ?? 7,
    seconds: def.seconds ?? 10,
    id: s.id,
  });
}

/** Called when any zone ends: a brewfest zone triggers the last-call talent (heal allies / blast enemies). */
export function onZoneEnd(w: World, z: Zone): void {
  if (z.style !== "brewfest") return;
  const owner = w.getAny(z.ownerId);
  if (!owner?.hero) return;
  const lc = abilities(w, owner).z.fx?.lastCall;
  if (!lc) return;
  const y = w.groundY(z.x, z.z);
  fx(w, "lastCall", owner.id, owner.team, z.x, y, z.z, { radius: lc.radius });
  const mul = owner.hero.damageMul;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.structure) continue;
    if (Math.hypot(o.transform.pos.x - z.x, o.transform.pos.z - z.z) - o.radius > lc.radius) continue;
    if (o.team === owner.team) {
      const got = healFrom(w, owner, o, lc.heal);
      if (got >= 1 && o.hero)
        fx(w, "healNum", owner.id, owner.team, o.transform.pos.x, o.transform.y + 1, o.transform.pos.z, {
          radius: Math.round(got),
          id: o.id,
        });
    } else w.damage(owner, o, lc.damage * mul, { fromX: z.x, fromZ: z.z, knockback: lc.knockback, big: true });
  }
}

/** Standing in one of his own ale puddles (KEG ROCKET is available). */
export function inOwnPuddle(w: World, e: Entity): boolean {
  return w.zones.some(
    (z) =>
      z.ownerId === e.id &&
      z.style === "ale" &&
      w.time < z.until &&
      Math.hypot(e.transform.pos.x - z.x, e.transform.pos.z - z.z) <= z.radius + 0.3,
  );
}

/** Dodge replacement while in his own ale puddle: a fast cc-immune rocket dash that hits enemies on the way. */
export function startKegRocket(w: World, e: Entity, cmd: Command): boolean {
  if (!inOwnPuddle(w, e)) return false;
  const h = e.hero!;
  const t = e.transform;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const dx = mag > 0.2 ? cmd.moveX / mag : Math.sin(t.facing);
  const dz = mag > 0.2 ? cmd.moveZ / mag : Math.cos(t.facing);
  const a: HeroAction = {
    name: "dodge",
    kind: "kegrocket",
    dur: 0.62,
    hitAt: 99,
    combo: 0,
    t: 0,
    fired: false,
    dirX: dx,
    dirZ: dz,
    hitIds: [],
    fromX: t.pos.x,
    fromZ: t.pos.z,
  };
  h.action = a;
  h.blocking = false;
  t.facing = Math.atan2(dx, dz);
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.3);
  e.status.ccImmuneUntil = Math.max(e.status.ccImmuneUntil, w.time + 0.62);
  h.cooldowns.dodge = w.time + 0.62 + w.data.heroes.baseline.dodgeCooldown + 0.3;
  w.emit({ type: "callout", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, text: "KEG ROCKET", owner: e.id });
  fx(w, "kegRocket", e.id, e.team, t.pos.x, t.y, t.pos.z, {
    tx: t.pos.x + dx * 10,
    tz: t.pos.z + dz * 10,
    seconds: 0.62,
  });
  return true;
}

export function kegRocketTick(w: World, e: Entity, a: HeroAction): void {
  const t = e.transform;
  const dt = w.dt;
  w.moveBy(e, a.dirX * 17 * dt, a.dirZ * 17 * dt);
  const ids = a.hitIds ?? (a.hitIds = []);
  const mul = w.damageMulOf(e);
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.structure || ids.includes(o.id)) continue;
    if (w.dist(e, o) - o.radius > 1.3) continue;
    ids.push(o.id);
    const ox = o.transform.pos.x - t.pos.x;
    const oz = o.transform.pos.z - t.pos.z;
    const side = ox * a.dirZ - oz * a.dirX >= 0 ? 1 : -1;
    const kx = a.dirZ * side * 0.85 + a.dirX * 0.4;
    const kz = -a.dirX * side * 0.85 + a.dirZ * 0.4;
    w.damage(e, o, 45 * mul, {
      fromX: o.transform.pos.x - kx,
      fromZ: o.transform.pos.z - kz,
      knockback: 11,
      stun: 0.3,
      big: true,
    });
  }
  const step = Math.floor(a.t / 0.1);
  if (step !== Math.floor((a.t - dt) / 0.1)) {
    w.zones.push({
      id: w.newId(),
      team: e.team,
      ownerId: e.id,
      x: t.pos.x,
      z: t.pos.z,
      radius: 1.2,
      until: w.time + 2.5,
      dps: 0,
      slowMul: 1,
      style: "aletrail",
      heal: 14,
    });
  }
}
