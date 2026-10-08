// Harpooner (Tadwick): harpoons are straight missiles that ricochet off walls, props and structures
// (bending toward a foe after the bounce), Wet (his hits leave foes dripping; a ricochet hits a Wet foe harder),
// Reel In (B: roped harpoon that drags soldiers to him and champions halfway - toward the bounce point if it banked -
// with a wall splat if something stops them), Tongue Lash (R: grapple jump to a ledge/prop/structure away from
// danger), Riptide (Z: a water ring that slows, wets and drags foes to its centre; inside it his harpoons bounce off
// the ring and chain between foes) and the belly slide (his dodge: longer and low, leaves a puddle Wet foes slip on).
// Missiles flagged `harpoon` are stepped here instead of in talents/missiles.ts.
import type { World } from "../world.ts";
import type { AbilityDef } from "../config.ts";
import type { Command, Entity, HeroAction, Missile, Zone } from "../types.ts";
import { Kind } from "../terrain.ts";
import { abilities, addShield, applyBleed } from "../talents.ts";
import { aimTier, begin, callout } from "./common.ts";

const fx = (
  w: World,
  name: string,
  e: Entity | { id: number; team: number },
  x: number,
  y: number,
  z: number,
  extra: { radius?: number; tx?: number; tz?: number; seconds?: number; id?: number } = {},
) => w.emit({ type: "heroFx", name, src: e.id, team: e.team, x, y, z, ...extra });

export function isHarpooner(w: World, e: Entity): boolean {
  return !!e.hero && !!w.heroDef(e.hero.type).hooks.wetSeconds;
}

// ---------------------------------------------------------------------------------------------------------------
// Wet
// ---------------------------------------------------------------------------------------------------------------

export function isWet(w: World, o: Entity): boolean {
  return (o.status.wetUntil ?? 0) > w.time;
}

/** Soak a foe for `seconds` (the renderer drips while wet; first soak shows a splash). */
export function soak(w: World, src: Entity, o: Entity, seconds: number): void {
  if (!o.alive || o.structure) return;
  const was = isWet(w, o);
  o.status.wetUntil = Math.max(o.status.wetUntil ?? 0, w.time + seconds);
  o.status.wetOwner = src.id;
  if (!was) fx(w, "wet", src, o.transform.pos.x, o.transform.y, o.transform.pos.z, { id: o.id, seconds });
}

function wetSeconds(w: World, src: Entity, def?: AbilityDef): number {
  return def?.wetSeconds ?? w.heroDef(src.hero!.type).hooks.wetSeconds ?? 3;
}

// ---------------------------------------------------------------------------------------------------------------
// Harpoons (A, and B's roped harpoon)
// ---------------------------------------------------------------------------------------------------------------

/** Wall test for a harpoon at height y: terrain/props/walls above the shot line, or off the map. */
function blocked(w: World, x: number, z: number, y: number): boolean {
  if (x < 0 || z < 0 || x >= w.terrain.width || z >= w.terrain.depth) return true;
  return w.losHeight(x, z) > y + 0.4;
}

/** Owner's active Riptide ring containing (x, z), if any. */
function ringAt(w: World, ownerId: number, x: number, z: number): Zone | undefined {
  for (const zn of w.zones)
    if (
      zn.style === "riptide" &&
      zn.ownerId === ownerId &&
      w.time < zn.until &&
      Math.hypot(x - zn.x, z - zn.z) <= zn.radius
    )
      return zn;
  return undefined;
}

/** After a bounce, bend toward the best foe roughly ahead (within 9 m, 60 degrees, in clear line). */
function bendToward(w: World, m: Missile, owner: Entity | null): void {
  let best: Entity | null = null;
  let bs = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team === m.team || o.structure || o.neutral || m.hit.includes(o.id)) continue;
    if (owner && !w.canSee(owner, o)) continue;
    const dx = o.transform.pos.x - m.x;
    const dz = o.transform.pos.z - m.z;
    const d = Math.hypot(dx, dz);
    if (d > 9 || d < 0.3) continue;
    const c = (dx * m.dirX + dz * m.dirZ) / d;
    if (c < 0.5) continue;
    let clear = true;
    for (let s = 0.5; s < d && clear; s += 0.5)
      if (blocked(w, m.x + (dx / d) * s, m.z + (dz / d) * s, m.y)) clear = false;
    if (!clear) continue;
    const sc = d - (o.hero ? 4 : 0) - (isWet(w, o) ? 2 : 0) - c * 2;
    if (sc < bs) {
      bs = sc;
      best = o;
    }
  }
  if (!best) return;
  const dx = best.transform.pos.x - m.x;
  const dz = best.transform.pos.z - m.z;
  const d = Math.hypot(dx, dz) || 1;
  m.dirX = dx / d;
  m.dirZ = dz / d;
}

function bounce(w: World, m: Missile, owner: Entity | null): void {
  const hp = m.harpoon!;
  hp.bounces--;
  hp.bounced++;
  hp.bx = m.x;
  hp.bz = m.z;
  m.range = Math.max(m.range, m.dist + 9);
  bendToward(w, m, owner);
  w.emit({
    type: "heroFx",
    name: "ricochet",
    src: m.ownerId,
    team: m.team,
    x: m.x,
    y: m.y,
    z: m.z,
    tx: m.x + m.dirX,
    tz: m.z + m.dirZ,
    id: m.id,
  });
}

/** Reflect off terrain: flip the axis whose move is blocked (both in a corner). */
function wallBounce(w: World, m: Missile, owner: Entity | null, nx: number, nz: number): void {
  const bx = blocked(w, nx, m.z, m.y);
  const bz = blocked(w, m.x, nz, m.y);
  if (bx || !bz) m.dirX = -m.dirX;
  if (bz || !bx) m.dirZ = -m.dirZ;
  bounce(w, m, owner);
}

/** Reflect off a round body (structure) or the inside of the Riptide ring. */
function roundBounce(w: World, m: Missile, owner: Entity | null, cx: number, cz: number, inside: boolean): void {
  let ux = m.x - cx;
  let uz = m.z - cz;
  const l = Math.hypot(ux, uz) || 1;
  ux /= l;
  uz /= l;
  if (inside) {
    ux = -ux;
    uz = -uz;
  }
  const d = m.dirX * ux + m.dirZ * uz;
  if (d < 0) {
    m.dirX -= 2 * d * ux;
    m.dirZ -= 2 * d * uz;
  }
  const dl = Math.hypot(m.dirX, m.dirZ) || 1;
  m.dirX /= dl;
  m.dirZ /= dl;
  bounce(w, m, owner);
}

/** One tick of a harpoon. Returns true when it is spent (stuck in a wall, hit, or out of range). */
export function stepHarpoon(w: World, m: Missile): boolean {
  const hp = m.harpoon!;
  const owner = w.get(m.ownerId) ?? null;
  const step = m.speed * w.dt;
  if (m.dist + step >= m.range) {
    fx(w, "harpoonDrop", { id: m.ownerId, team: m.team }, m.x, m.y, m.z, { id: m.id, tx: m.dirX, tz: m.dirZ });
    return true;
  }
  const nx = m.x + m.dirX * step;
  const nz = m.z + m.dirZ * step;
  // Inside his Riptide the ring's edge throws the harpoon back in.
  const ring = ringAt(w, m.ownerId, m.x, m.z);
  if (ring && Math.hypot(nx - ring.x, nz - ring.z) > ring.radius && (hp.ring ?? 0) > 0) {
    hp.ring = (hp.ring ?? 0) - 1;
    hp.bounces++;
    roundBounce(w, m, owner, ring.x, ring.z, true);
    return false;
  }
  if (blocked(w, nx, nz, m.y)) {
    if (hp.bounces > 0) {
      wallBounce(w, m, owner, nx, nz);
      return false;
    }
    fx(w, "harpoonStick", { id: m.ownerId, team: m.team }, m.x, m.y, m.z, { id: m.id, tx: m.dirX, tz: m.dirZ });
    return true;
  }
  m.x = nx;
  m.z = nz;
  m.dist += step;
  for (const o of w.entities.slice()) {
    if (!o.alive || m.hit.includes(o.id) || o.neutral) continue;
    if (o.team === m.team && !o.structure) continue;
    if (Math.hypot(o.transform.pos.x - m.x, o.transform.pos.z - m.z) - o.radius > m.width) continue;
    if (!o.structure && Math.abs(o.transform.y + 1 - m.y) > 2.5) continue;
    if (o.structure) {
      if (o.team !== m.team) {
        m.hit.push(o.id);
        w.damage(owner, o, m.damage * 0.5, { structureDamage: m.damage * 0.5, fromX: m.x, fromZ: m.z });
      }
      if (hp.bounces > 0) {
        roundBounce(w, m, owner, o.transform.pos.x, o.transform.pos.z, false);
        return false;
      }
      fx(w, "harpoonStick", { id: m.ownerId, team: m.team }, m.x, m.y, m.z, { id: m.id, tx: m.dirX, tz: m.dirZ });
      return true;
    }
    m.hit.push(o.id);
    const hooks = owner?.hero ? w.heroDef(owner.hero.type).hooks : {};
    const banked = hp.bounced > 0 && isWet(w, o);
    const wet = isWet(w, o) ? (hooks.wetHitMul ?? 1) : 1;
    const unit = o.unit ? (hooks.unitMul ?? 1) : 1;
    const dmg = (banked ? m.damage * wet * (hooks.ricochetWetMul ?? 1.35) : m.damage * wet) * unit;
    const landed = w.damage(owner, o, dmg, {
      fromX: m.x - m.dirX,
      fromZ: m.z - m.dirZ,
      knockback: m.knockback ?? 1.2,
      big: true,
      crit: banked && hp.bounced > 1 ? true : undefined,
    });
    if (landed && owner?.hero) onHarpoonHit(w, owner, o, m, banked);
    // Ricochet freely inside the ring: chain to the next foe in it.
    if (owner && ringAt(w, m.ownerId, o.transform.pos.x, o.transform.pos.z) && (hp.ring ?? 0) > 0) {
      const z0 = ringAt(w, m.ownerId, o.transform.pos.x, o.transform.pos.z)!;
      let next: Entity | null = null;
      let nd = Infinity;
      for (const q of w.entities) {
        if (!q.alive || q.team === m.team || q.structure || q.neutral || m.hit.includes(q.id)) continue;
        if (Math.hypot(q.transform.pos.x - z0.x, q.transform.pos.z - z0.z) > z0.radius) continue;
        const d = w.dist(o, q) - (q.hero ? 3 : 0);
        if (d < nd) {
          nd = d;
          next = q;
        }
      }
      if (next) {
        hp.ring = (hp.ring ?? 0) - 1;
        const dx = next.transform.pos.x - m.x;
        const dz = next.transform.pos.z - m.z;
        const dl = Math.hypot(dx, dz) || 1;
        m.dirX = dx / dl;
        m.dirZ = dz / dl;
        hp.bounced++;
        hp.bx = m.x;
        hp.bz = m.z;
        m.range = m.dist + dl + 2;
        fx(w, "ricochet", { id: m.ownerId, team: m.team }, m.x, m.y, m.z, {
          tx: m.x + m.dirX,
          tz: m.z + m.dirZ,
          id: m.id,
        });
        return false;
      }
    }
    // Soldiers don't stop a harpoon: it skewers up to `soldierPierce` of them and flies on (wave clear).
    if (o.unit && (hp.pierced ?? 0) < (hooks.soldierPierce ?? 0)) {
      hp.pierced = (hp.pierced ?? 0) + 1;
      continue;
    }
    return true;
  }
  return false;
}

/** Harpoon landed on a soldier/champion: Wet, bleed talent, and for Reel In the pull. */
function onHarpoonHit(w: World, src: Entity, o: Entity, m: Missile, banked: boolean): void {
  const ab = abilities(w, src);
  const def = m.harpoon!.reel ? ab.b : ab.a;
  soak(w, src, o, wetSeconds(w, src, def));
  if (def.fx?.bleed && o.alive) applyBleed(w, src, o, def.fx.bleed);
  if (banked)
    w.emit({
      type: "callout",
      x: o.transform.pos.x,
      y: o.transform.y,
      z: o.transform.pos.z,
      team: src.team,
      text: "BANK SHOT!",
      owner: o.id,
    });
  if (m.harpoon!.reel && o.alive) reel(w, src, o, m, def);
}

/** Knockback velocity that travels `d` m before applyKnockback's exponential decay stops it. */
function kvFor(w: World, d: number): number {
  return (d * (1 - Math.exp(-8 * w.dt))) / w.dt;
}

/**
 * Reel In: drag a soldier all the way, a champion `heroPull` of the way (a tank partner nearby: to the partner's
 * feet), toward Tadwick - or toward the wall the rope banked off. Something solid in the way: wall splat (stun).
 */
function reel(w: World, src: Entity, o: Entity, m: Missile, def: AbilityDef): void {
  if (o.hero?.jump || w.time < o.status.ccImmuneUntil) return;
  const hp = m.harpoon!;
  let ax = hp.bounced > 0 && hp.bx !== undefined ? hp.bx : src.transform.pos.x;
  let az = hp.bounced > 0 && hp.bz !== undefined ? hp.bz : src.transform.pos.z;
  let frac = o.hero ? (def.heroPull ?? 0.5) : 1;
  let stop = 1.3;
  if (o.hero && hp.bounced === 0) {
    const syn = w.heroDef(src.hero!.type).synergy?.reelTo;
    for (const a of w.entities) {
      if (!a.alive || !a.hero || a.hero.dead || a === src || a.team !== src.team) continue;
      const cls = w.heroDef(a.hero.type).class;
      if (!cls || !syn?.[cls] || w.dist(src, a) > 12) continue;
      ax = a.transform.pos.x;
      az = a.transform.pos.z;
      frac = syn[cls]!;
      stop = 1.4;
      break;
    }
  }
  const dx = ax - o.transform.pos.x;
  const dz = az - o.transform.pos.z;
  const dist = Math.hypot(dx, dz);
  const d = Math.max(0, Math.min(dist - stop, dist * frac));
  if (d < 0.3) return;
  const v = kvFor(w, d);
  o.status.kvx = (dx / dist) * v;
  o.status.kvz = (dz / dist) * v;
  o.status.shovedBy = src.id;
  o.status.shovedUntil = w.time + 0.6;
  o.status.stunUntil = Math.max(o.status.stunUntil, w.time + 0.3);
  if (def.slowMul !== undefined && def.slowSeconds) {
    o.status.slowMul = def.slowMul;
    o.status.slowUntil = w.time + 0.3 + def.slowSeconds;
  }
  fx(w, "reel", src, o.transform.pos.x, o.transform.y, o.transform.pos.z, { id: o.id, tx: ax, tz: az, seconds: 0.45 });
  if (o.hero)
    w.emit({
      type: "callout",
      x: o.transform.pos.x,
      y: o.transform.y,
      z: o.transform.pos.z,
      team: src.team,
      text: "REELED IN!",
      owner: o.id,
    });
}

/**
 * Aimed direction toward the best target for a straight shot (a CPU's locked target first, then heroes, Wet foes),
 * plus the flight height: a target standing well above him (on a lookout or a ledge) is shot at its own height
 * rather than into the side of what it stands on.
 */
function harpoonAim(w: World, e: Entity, a: HeroAction, reach: number): [number, number, number | undefined] {
  const t = e.transform;
  let best: Entity | null = null;
  let bs = Infinity;
  const locked = a.aimId !== undefined ? w.getAny(a.aimId) : undefined;
  if (locked?.alive && w.canSee(e, locked) && w.dist(e, locked) - locked.radius <= reach) best = locked;
  else
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.neutral || !w.canSee(e, o)) continue;
      const dx = o.transform.pos.x - t.pos.x;
      const dz = o.transform.pos.z - t.pos.z;
      const d = Math.hypot(dx, dz);
      if (d - o.radius > reach || d < 0.1) continue;
      const along = (dx * a.dirX + dz * a.dirZ) / d;
      if (along < (a.stick ? 0.6 : 0.3)) continue;
      const sc = aimTier(o) + d * 0.5 + (isWet(w, o) ? -1.5 : 0) - along * 3;
      if (sc < bs) {
        bs = sc;
        best = o;
      }
    }
  if (!best) return [a.dirX, a.dirZ, undefined];
  // Lead a moving target a little (the harpoon is fast but not instant).
  const flight = Math.hypot(best.transform.pos.x - t.pos.x, best.transform.pos.z - t.pos.z) / 30;
  const vx = (best.transform.pos.x - best.transform.prevPos.x) / w.dt;
  const vz = (best.transform.pos.z - best.transform.prevPos.z) / w.dt;
  const dx = best.transform.pos.x + vx * flight * 0.8 - t.pos.x;
  const dz = best.transform.pos.z + vz * flight * 0.8 - t.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  const high = best.transform.y - t.y > 1 ? best.transform.y + 1 : undefined;
  return [dx / l, dz / l, high];
}

/** A: a harpoon (full power: an extra ricochet and a heavier hit). */
export function fireHarpoon(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number, reelShot = false): void {
  const t = e.transform;
  const hk = w.heroDef(e.hero!.type).hooks;
  const range = def.range ?? 9;
  const [dx, dz, high] = harpoonAim(w, e, a, range + 0.5);
  t.facing = Math.atan2(dx, dz);
  const full = !reelShot && (a.power ?? 1) >= 1.4;
  const bounces = (hk.ricochets ?? 1) + (def.ricochets ?? 0) + (full ? (def.chargeRicochets ?? 1) : 0);
  const ring = ringAt(w, e.id, t.pos.x, t.pos.z);
  w.missiles.push({
    id: w.newId(),
    ownerId: e.id,
    team: e.team,
    x: t.pos.x + dx * 0.6,
    z: t.pos.z + dz * 0.6,
    y: high ?? t.y + 1.2,
    dirX: dx,
    dirZ: dz,
    speed: def.speed ?? 30,
    range: full ? range * 1.3 : range,
    dist: 0,
    width: reelShot ? 0.75 : 0.6,
    damage: (def.damage ?? 50) * mul * (full ? 1.1 : 1),
    pierce: false,
    hit: [],
    style: reelShot ? "reel" : full ? "harpoonfull" : "harpoon",
    knockback: full ? 5 : 1.2,
    harpoon: { bounces, bounced: 0, reel: reelShot, ring: ring ? (hk.ringBounces ?? 4) : 0 },
  });
  w.emit({ type: "shot", style: reelShot ? "reel" : "harpoon", x: t.pos.x, y: t.y + 1.2, z: t.pos.z });
}

// ---------------------------------------------------------------------------------------------------------------
// Tongue Lash (R)
// ---------------------------------------------------------------------------------------------------------------

/** R start: the lash goes where the stick points, else straight away from the nearest foe, else ahead. */
export function tongueAim(w: World, e: Entity, a: HeroAction, cmd: Command): void {
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  let dx = Math.sin(e.transform.facing);
  let dz = Math.cos(e.transform.facing);
  if (cmd.place && Math.hypot(cmd.place.dx, cmd.place.dz) > 0.3) {
    const l = Math.hypot(cmd.place.dx, cmd.place.dz);
    dx = cmd.place.dx / l;
    dz = cmd.place.dz / l;
  } else if (mag > 0.3) {
    dx = cmd.moveX / mag;
    dz = cmd.moveZ / mag;
  } else {
    let near: Entity | null = null;
    let nd = 8;
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.structure || o.neutral || !(o.hero || o.unit)) continue;
      const d = w.dist(e, o);
      if (d < nd) {
        nd = d;
        near = o;
      }
    }
    if (near) {
      const ux = e.transform.pos.x - near.transform.pos.x;
      const uz = e.transform.pos.z - near.transform.pos.z;
      const l = Math.hypot(ux, uz) || 1;
      dx = ux / l;
      dz = uz / l;
    }
  }
  a.dirX = dx;
  a.dirZ = dz;
  e.transform.facing = Math.atan2(dx, dz);
}

/** Something to grab near a landing cell: a structure, or a wall/prop (tree, rock) cell next to it. */
function anchorNear(w: World, x: number, z: number): { x: number; z: number } | null {
  for (const o of w.entities)
    if (o.alive && o.structure && Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) < o.radius + 1.6)
      return { x: o.transform.pos.x, z: o.transform.pos.z };
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  for (let oz = -1; oz <= 1; oz++)
    for (let ox = -1; ox <= 1; ox++) {
      if (!ox && !oz) continue;
      const k = w.terrain.kindAt(cx + ox, cz + oz);
      if (k === Kind.Wall || k === Kind.Prop) return { x: cx + ox + 0.5, z: cz + oz + 0.5 };
    }
  return null;
}

/** R fire: pick the landing spot (prefers ledges and things to grab, away from foes) and leap there. */
export function tongueLash(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const range = def.range ?? 7;
  const step = w.heroDef(e.hero!.type).hooks.lashStep ?? 2.6;
  let best: { x: number; z: number; ax: number; az: number; sc: number; up: number } | null = null;
  for (const deg of [0, 20, -20, 40, -40, 65, -65]) {
    const r = (deg * Math.PI) / 180;
    const ux = a.dirX * Math.cos(r) + a.dirZ * Math.sin(r);
    const uz = -a.dirX * Math.sin(r) + a.dirZ * Math.cos(r);
    for (let d = range; d >= 3; d -= 0.5) {
      const x = t.pos.x + ux * d;
      const z = t.pos.z + uz * d;
      if (x < 1 || z < 1 || x > w.terrain.width - 1 || z > w.terrain.depth - 1) continue;
      const i = w.nav.index(Math.floor(x), Math.floor(z));
      if (i < 0 || !w.nav.open(i)) continue;
      const h = w.terrain.heightAt(x, z);
      if (!Number.isFinite(h)) continue;
      const up = h - t.y;
      if (up > step || up < -3) continue;
      if (w.mapEvents.sealed(t.pos.x, t.pos.z, x, z)) continue;
      const an = anchorNear(w, x, z);
      let foe = 99;
      for (const o of w.entities)
        if (o.alive && o.team !== e.team && (o.hero || o.unit) && !o.neutral)
          foe = Math.min(foe, Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z));
      const sc = d * 0.6 + (an ? 3 : 0) + Math.max(0, up) * 1.5 + Math.min(foe, 8) * 0.5 - (Math.abs(deg) / 65) * 2.5;
      if (!best || sc > best.sc) best = { x, z, ax: an?.x ?? x + ux * 0.8, az: an?.z ?? z + uz * 0.8, sc, up };
      break;
    }
  }
  if (!best) {
    callout(w, e, "NOTHING TO GRAB");
    e.hero!.cooldowns.r = Math.min(e.hero!.cooldowns.r ?? 0, w.time + 1);
    return;
  }
  fx(w, "tongue", e, t.pos.x, t.y, t.pos.z, { tx: best.ax, tz: best.az, seconds: 0.4 });
  if (!w.startJump(e, best.x, best.z, 0.4, 1.2 + Math.max(0, best.up))) return;
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.25);
  const ls = def.fx?.landShield;
  if (ls) w.later(0.4, () => e.alive && addShield(e, ls, ls, 3, w.time));
  if (def.fx?.landPuddle) w.later(0.4, () => e.alive && puddle(w, e, e.transform.pos.x, e.transform.pos.z));
}

// ---------------------------------------------------------------------------------------------------------------
// Riptide (Z), puddles and the per-tick passive
// ---------------------------------------------------------------------------------------------------------------

export function riptide(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const r = def.radius ?? 6;
  w.zones.push({
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x: t.pos.x,
    z: t.pos.z,
    radius: r,
    until: w.time + (def.seconds ?? 6),
    dps: (def.dps ?? 12) * mul,
    slowMul: def.slowMul ?? 0.65,
    style: "riptide",
    vuln: def.vulnMul,
  });
  fx(w, "riptide", e, t.pos.x, t.y, t.pos.z, { radius: r, seconds: def.seconds ?? 6 });
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.neutral) continue;
    if (Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius > r) continue;
    w.damage(e, o, (def.damage ?? 70) * mul, {
      fromX: t.pos.x,
      fromZ: t.pos.z,
      big: true,
      structureDamage: o.structure ? (def.damage ?? 70) * mul * 0.5 : undefined,
    });
    soak(w, e, o, (def.seconds ?? 6) + 1);
  }
  void a;
}

/** A puddle he leaves (belly slide, talent landings): Wet foes who step in slip (short stun, once each). */
function puddle(w: World, e: Entity, x: number, z: number): void {
  const hk = w.heroDef(e.hero!.type).hooks;
  w.zones.push({
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x,
    z,
    radius: hk.puddleRadius ?? 1.6,
    until: w.time + (hk.puddleSeconds ?? 3),
    dps: 0,
    slowMul: 1,
    style: "puddle",
  });
  fx(w, "puddle", e, x, w.groundY(x, z), z, { radius: hk.puddleRadius ?? 1.6, seconds: hk.puddleSeconds ?? 3 });
}

/** Per tick (alive): Riptide drags foes to its centre and keeps them wet; his puddles trip Wet foes. */
export function harpoonerTick(w: World, e: Entity): void {
  const hk = w.heroDef(e.hero!.type).hooks;
  for (const zn of w.zones) {
    if (zn.ownerId !== e.id || w.time >= zn.until) continue;
    if (zn.style === "riptide") {
      const pull = (abilities(w, e).z.pullSpeed ?? 1.6) * w.dt;
      for (const o of w.entities) {
        if (!o.alive || o.team === e.team || o.structure || o.neutral || o.hero?.jump) continue;
        const dx = zn.x - o.transform.pos.x;
        const dz = zn.z - o.transform.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > zn.radius || d < 0.6) continue;
        w.moveBy(o, (dx / d) * Math.min(pull, d - 0.5), (dz / d) * Math.min(pull, d - 0.5));
        if (w.tick % 15 === 0) soak(w, e, o, 1.5);
      }
    } else if (zn.style === "puddle") {
      for (const o of w.entities) {
        if (!o.alive || o.team === e.team || o.structure || o.neutral || !isWet(w, o) || o.hero?.jump) continue;
        if (Math.hypot(o.transform.pos.x - zn.x, o.transform.pos.z - zn.z) > zn.radius) continue;
        if ((o.status.slipAt ?? -99) > zn.until - (hk.puddleSeconds ?? 3) - 0.01) continue;
        o.status.slipAt = w.time;
        o.status.stunUntil = Math.max(o.status.stunUntil, w.time + (hk.slipStun ?? 0.6));
        fx(w, "slip", e, o.transform.pos.x, o.transform.y, o.transform.pos.z, { id: o.id });
        w.emit({
          type: "callout",
          x: o.transform.pos.x,
          y: o.transform.y,
          z: o.transform.pos.z,
          team: e.team,
          text: "SLIPPED!",
          owner: o.id,
        });
      }
    }
  }
}

/** Dodge replacement: a longer, low belly slide that drops a puddle where he started. */
export function bellySlide(w: World, e: Entity, cmd: Command): boolean {
  const h = e.hero!;
  const hk = w.heroDef(h.type).hooks;
  const b = w.data.heroes.baseline;
  const t = e.transform;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const dx = mag > 0.2 ? cmd.moveX / mag : Math.sin(t.facing);
  const dz = mag > 0.2 ? cmd.moveZ / mag : Math.cos(t.facing);
  const dur = hk.slideSeconds ?? 0.5;
  begin(e, "dodge", "slide", dur, 99, dx, dz);
  e.status.invulnUntil = w.time + b.dodgeSeconds;
  h.cooldowns.dodge = w.time + dur + b.dodgeCooldown;
  puddle(w, e, t.pos.x, t.pos.z);
  return true;
}

/** Slide motion: fast at first, easing off. */
export function slideTick(w: World, e: Entity, a: HeroAction): void {
  const hk = w.heroDef(e.hero!.type).hooks;
  const v = (hk.slideSpeed ?? 13) * (1 - 0.45 * Math.min(1, a.t / a.dur));
  w.moveBy(e, a.dirX * v * w.dt, a.dirZ * v * w.dt);
}

/** Bot helper: an enemy champion standing within `r` m of a wall/prop cell or structure (good Reel In target). */
export function nearWall(w: World, o: Entity, r = 2.5): boolean {
  const p = o.transform.pos;
  for (let s = 1; s <= r; s += 1)
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      if (blocked(w, p.x + Math.sin(ang) * s, p.z + Math.cos(ang) * s, o.transform.y + 1.2)) return true;
    }
  return false;
}
