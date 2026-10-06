// Scribe (Granny Hollin, the novelist): Annotations passive (charged bolts and swarms write runes on the ground; a spell landing
// on one of her runes consumes it and is empowered), Ink Bolt (A, a straight bolt that ricochets once off walls or
// on to the next foe; charged it blots and blinds), Swarm (B, a bee zone; B again calls it to follow her), Erratum
// (R, swap places with one of her runes; with none in reach she writes one at her feet), Illuminated Manuscript (Z,
// every rune flares, then 8 s of runes everywhere and one free recast of B and R) and Page Gust (L+X, a backwards
// glide that shoves close foes away). Bolts live in w.inkBolts (updateInk, step phase 5); runes on the hero state.
import type { World } from "../world.ts";
import type { AbilityDef } from "../config.ts";
import type { Command, Entity, HeroAction, InkBolt, Rune, Zone } from "../types.ts";
import { abilities } from "../talents.ts";
import { aimFor, aimTarget, callout } from "./common.ts";

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

const hooks = (w: World, e: Entity) => w.heroDef(e.hero!.type).hooks;

export function isScribe(w: World, e: Entity): boolean {
  return !!e.hero && abilities(w, e).r.kind === "erratum";
}

/** Runes she may keep at once and how long each lasts (talents add to both). */
function runeLimits(w: World, e: Entity): { max: number; seconds: number } {
  const hk = hooks(w, e);
  const more = abilities(w, e).r.fx?.moreRunes;
  return { max: (hk.runeMax ?? 4) + (more?.count ?? 0), seconds: (hk.runeSeconds ?? 12) + (more?.seconds ?? 0) };
}

/** Write a rune at (x, z); the oldest one fades when she already has her maximum. */
export function writeRune(w: World, e: Entity, x: number, z: number): void {
  const h = e.hero!;
  const list = (h.runes ??= []);
  const lim = runeLimits(w, e);
  while (list.length >= lim.max) list.shift();
  const r: Rune = { id: w.newId(), x, z, until: w.time + lim.seconds };
  list.push(r);
  fx(w, "rune", e.id, e.team, x, w.groundY(x, z), z, { id: r.id, seconds: lim.seconds });
}

/** Index of her rune within runeRadius of (x, z), nearest first, or -1. */
function runeAt(w: World, e: Entity, x: number, z: number): number {
  const list = e.hero!.runes ?? [];
  const r = hooks(w, e).runeRadius ?? 2.2;
  let best = -1;
  let bd = r;
  list.forEach((n, i) => {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d <= bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Recasting onto a rune: consume it (the spell is empowered). Returns true when one was there. */
function consumeRune(w: World, e: Entity, x: number, z: number): boolean {
  const i = runeAt(w, e, x, z);
  if (i < 0) return false;
  const [n] = e.hero!.runes!.splice(i, 1);
  fx(w, "runeUse", e.id, e.team, n.x, w.groundY(n.x, n.z), n.z, { id: n.id });
  return true;
}

/** Per tick (hero controller): expire runes, move followed swarms, and mark foes inside her swarms. */
export function scribeTick(w: World, e: Entity): void {
  const h = e.hero!;
  if (h.runes?.length) h.runes = h.runes.filter((r) => w.time < r.until);
  if (h.dead) return;
  for (const z of w.zones) {
    if (z.ownerId !== e.id || z.style !== "swarm") continue;
    if (z.follow === e.id) {
      z.x = e.transform.pos.x;
      z.z = e.transform.pos.z;
    }
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.structure || !o.hero) continue;
      if (Math.hypot(o.transform.pos.x - z.x, o.transform.pos.z - z.z) > z.radius) continue;
      o.status.swarmUntil = w.time + 0.5;
      o.status.swarmOwner = e.id;
    }
  }
}

/** Ink blot: damage, blind and a little knockback around (x, z). */
function blot(w: World, owner: Entity, x: number, z: number, radius: number, damage: number, blind: number): void {
  const y = w.groundY(x, z);
  fx(w, "inkBlot", owner.id, owner.team, x, y, z, { radius, seconds: blind });
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === owner.team || o.neutral) continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > radius) continue;
    const landed = w.damage(owner, o, damage, { fromX: x, fromZ: z, knockback: 3, big: true });
    if (landed && o.alive && !o.structure && blind > 0) {
      o.status.blindUntil = Math.max(o.status.blindUntil ?? 0, w.time + blind);
      o.status.blindMiss = abilities(w, owner).a.blindMiss ?? 0.5;
    }
  }
}

/** A: launch an Ink Bolt along the aim. Charge (power) scales damage; a strong charge blots and writes a rune. */
export function fireInk(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const h = e.hero!;
  const pw = a.power ?? 1;
  const charged = pw >= 1.5;
  const manuscript = w.time < (h.manuscriptUntil ?? 0);
  const dmg = (def.damage ?? 56) * mul * (1 + (pw - 1) * 0.6);
  const slow = !charged ? def.fx?.inkSlow : undefined;
  const b: InkBolt = {
    id: w.newId(),
    ownerId: e.id,
    team: e.team,
    x: t.pos.x + a.dirX * 0.6,
    z: t.pos.z + a.dirZ * 0.6,
    y: t.y + 1.4,
    dirX: a.dirX,
    dirZ: a.dirZ,
    speed: (def.speed ?? 22) * (charged ? 1.15 : 1),
    range: (def.range ?? 11) * (charged ? 1.15 : 1),
    dist: 0,
    damage: dmg,
    hit: [],
    bounces: (def.bounces ?? 1) + (manuscript ? 1 : 0),
    blot: charged
      ? { radius: def.blotRadius ?? 2.4, damage: (def.blotDamage ?? 40) * mul, blind: def.blindSeconds ?? 1.2 }
      : undefined,
    rune: charged || manuscript,
    slowMul: slow?.mul,
    targetId: aimFor(w, e, a, (def.range ?? 11) + 1)?.id,
  };
  w.inkBolts.push(b);
  fx(w, charged ? "inkCharged" : "inkShot", e.id, e.team, b.x, b.y, b.z, { id: b.id });
}

/** Out of the map or into terrain taller than the bolt. */
function inkBlocked(w: World, b: InkBolt, x: number, z: number): boolean {
  if (x < 0.5 || z < 0.5 || x > w.terrain.width - 0.5 || z > w.terrain.depth - 0.5) return true;
  return !Number.isFinite(w.terrain.heightAt(x, z)) || w.losHeight(x, z) > b.y + 0.4;
}

/** Where a bolt's flight ends (hit or spent): blot if charged, empower on a rune, write a rune if it writes. */
function inkLand(w: World, owner: Entity, b: InkBolt, x: number, z: number): void {
  const def = abilities(w, owner).a;
  if (consumeRune(w, owner, x, z))
    blot(w, owner, x, z, (def.blotRadius ?? 2.4) + 0.4, (def.runeDamage ?? 55) * w.damageMulOf(owner), 1.5);
  else if (b.blot) blot(w, owner, x, z, b.blot.radius, b.blot.damage, b.blot.blind);
  if (b.rune) writeRune(w, owner, x, z);
}

/** The next target for a ricochet: nearest unhit foe within bounceRange, champions strongly preferred. */
function bounceTarget(w: World, owner: Entity, b: InkBolt, from: Entity, range: number): Entity | null {
  let best: Entity | null = null;
  let bs = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team === b.team || o.structure || o.neutral || b.hit.includes(o.id)) continue;
    const d = w.dist(from, o);
    if (d > range || !w.canSee(owner, o)) continue;
    const s = d - (o.hero ? 4 : 0);
    if (s < bs) {
      bs = s;
      best = o;
    }
  }
  return best;
}

/** Radians per second an Ink Bolt bends toward its target. */
const INK_TURN = 2.2;

/** Step phase 5: move bolts, reflect off walls, hit the first foe and ricochet on to the next. */
export function updateInk(w: World): void {
  const dt = w.dt;
  for (let i = w.inkBolts.length - 1; i >= 0; i--) {
    const b = w.inkBolts[i];
    const owner = w.getAny(b.ownerId);
    if (!owner?.hero) {
      w.inkBolts.splice(i, 1);
      continue;
    }
    const tg = b.targetId !== undefined ? w.get(b.targetId) : undefined;
    if (tg?.alive) {
      const dx = tg.transform.pos.x - b.x;
      const dz = tg.transform.pos.z - b.z;
      const dl = Math.hypot(dx, dz) || 1;
      const cross = b.dirX * (dz / dl) - b.dirZ * (dx / dl);
      const dot = b.dirX * (dx / dl) + b.dirZ * (dz / dl);
      if (dot > 0.2) {
        const turn = Math.max(-1, Math.min(1, Math.atan2(cross, dot) / (INK_TURN * dt))) * INK_TURN * dt;
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        const ndx = b.dirX * c - b.dirZ * s;
        const ndz = b.dirX * s + b.dirZ * c;
        b.dirX = ndx;
        b.dirZ = ndz;
      }
    }
    if (tg?.alive) b.y += (tg.transform.y + 1.2 - b.y) * Math.min(1, dt * 6);
    const step = b.speed * dt;
    let nx = b.x + b.dirX * step;
    let nz = b.z + b.dirZ * step;
    let end = b.dist + step >= b.range;
    if (!end && inkBlocked(w, b, nx, nz)) {
      if (b.bounces > 0) {
        const bx = inkBlocked(w, b, nx, b.z);
        const bz = inkBlocked(w, b, b.x, nz);
        if (bx || !bz) b.dirX = -b.dirX;
        if (bz || !bx) b.dirZ = -b.dirZ;
        b.bounces--;
        b.damage *= 1.1;
        fx(w, "inkBounce", owner.id, b.team, b.x, b.y, b.z, { id: b.id });
        nx = b.x;
        nz = b.z;
      } else end = true;
    }
    if (!end) {
      b.x = nx;
      b.z = nz;
      b.dist += step;
    }
    let gone = false;
    for (const o of w.entities.slice()) {
      if (gone || !o.alive || o.team === b.team || b.hit.includes(o.id)) continue;
      if (Math.hypot(o.transform.pos.x - b.x, o.transform.pos.z - b.z) - o.radius > 0.6) continue;
      if (Math.abs(o.transform.y + 1 - b.y) > 2.5) continue;
      b.hit.push(o.id);
      const landed = w.damage(owner, o, o.structure ? b.damage * 0.5 : b.damage, {
        fromX: b.x - b.dirX,
        fromZ: b.z - b.dirZ,
        knockback: 1.5,
        slowMul: b.slowMul,
        slowSeconds: b.slowMul ? (abilities(w, owner).a.fx?.inkSlow?.seconds ?? 1) : undefined,
        big: !!b.blot,
        structureDamage: o.structure ? b.damage * 0.5 : undefined,
      });
      fx(w, "inkHit", owner.id, b.team, o.transform.pos.x, o.transform.y + 1.2, o.transform.pos.z, { id: b.id });
      if (landed || o.structure) inkLand(w, owner, b, o.transform.pos.x, o.transform.pos.z);
      const next =
        !o.structure && b.bounces > 0 ? bounceTarget(w, owner, b, o, abilities(w, owner).a.bounceRange ?? 6) : null;
      if (!next) {
        gone = true;
        w.inkBolts.splice(i, 1);
        break;
      }
      const dx = next.transform.pos.x - o.transform.pos.x;
      const dz = next.transform.pos.z - o.transform.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      b.x = o.transform.pos.x;
      b.z = o.transform.pos.z;
      b.dirX = dx / dl;
      b.dirZ = dz / dl;
      b.targetId = next.id;
      b.dist = 0;
      b.range = dl + 1.5;
      b.bounces--;
      b.damage *= abilities(w, owner).a.bounceMul ?? 0.6;
      b.blot = undefined;
      fx(w, "inkBounce", owner.id, b.team, b.x, b.y, b.z, { id: b.id });
    }
    if (end && !gone) {
      inkLand(w, owner, b, b.x, b.z);
      w.inkBolts.splice(i, 1);
    }
  }
}

/** Her live swarm zone, if any. */
function swarmOf(w: World, e: Entity): Zone | undefined {
  return w.zones.find((z) => z.ownerId === e.id && z.style === "swarm" && w.time < z.until && z.radius > 1.6);
}

/** B: Paper Storm (a bee swarm for the Beekeeper costume) at the placed point / the target / ahead; on one of her runes it is a great swarm. */
export function fireSwarm(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const range = def.range ?? 9;
  const target = a.placed ? null : aimFor(w, e, a, range);
  let x = a.placed ? a.toX! : target ? target.transform.pos.x : t.pos.x + a.dirX * range * 0.7;
  let z = a.placed ? a.toZ! : target ? target.transform.pos.z : t.pos.z + a.dirZ * range * 0.7;
  x = Math.max(1, Math.min(w.terrain.width - 1, x));
  z = Math.max(1, Math.min(w.terrain.depth - 1, z));
  const great = consumeRune(w, e, x, z);
  const pw = a.power ?? 1;
  const radius = ((def.radius ?? 2.6) + (great ? 1.2 : 0)) * (1 + (pw - 1) * 0.4);
  const seconds = (def.seconds ?? 4) + (great ? 2 : 0);
  for (const o of w.zones) if (o.ownerId === e.id && o.style === "swarm" && o.radius > 1.6) o.until = w.time;
  w.zones.push({
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x,
    z,
    radius,
    until: w.time + seconds,
    dps: (def.dps ?? 32) * w.damageMulOf(e) * (great ? 1.4 : 1),
    slowMul: def.slowMul ?? 0.65,
    style: "swarm",
  });
  fx(w, great ? "greatSwarm" : "swarm", e.id, e.team, x, w.groundY(x, z), z, { radius, seconds });
  if (great) callout(w, e, "GREAT STORM");
  writeRune(w, e, x, z);
}

/** B again while her swarm is out: it flies to her and follows her for the rest of its time. */
export function recallSwarm(w: World, e: Entity): boolean {
  const z = swarmOf(w, e);
  if (!z || z.follow === e.id) return false;
  z.follow = e.id;
  z.until = Math.max(z.until, w.time + 1.5) + (abilities(w, e).b.fx?.swarmFollow ?? 0);
  fx(w, "swarmCall", e.id, e.team, z.x, w.groundY(z.x, z.z), z.z, {
    tx: e.transform.pos.x,
    tz: e.transform.pos.z,
    radius: z.radius,
    seconds: z.until - w.time,
  });
  z.x = e.transform.pos.x;
  z.z = e.transform.pos.z;
  callout(w, e, "SWARM, TO ME");
  return true;
}

/** Runes Erratum can reach right now (within range, open ground, not behind a sealed gate). */
export function erratumSpots(w: World, e: Entity, range?: number): Rune[] {
  const t = e.transform;
  const r = range ?? abilities(w, e).r.range ?? 12;
  return (e.hero!.runes ?? []).filter(
    (n) =>
      w.time < n.until &&
      Math.hypot(n.x - t.pos.x, n.z - t.pos.z) <= r &&
      Math.hypot(n.x - t.pos.x, n.z - t.pos.z) > 1 &&
      w.nav.open(w.nav.index(Math.floor(n.x), Math.floor(n.z))) &&
      !w.mapEvents.sealed(t.pos.x, t.pos.z, n.x, n.z),
  );
}

/** The rune Erratum picks: nearest the placed point, else best along the aim, else the one furthest from foes. */
function erratumPick(w: World, e: Entity, a: HeroAction): Rune | undefined {
  const t = e.transform;
  const spots = erratumSpots(w, e);
  if (!spots.length) return undefined;
  if (a.placed && a.toX !== undefined) {
    return spots.reduce((p, n) =>
      Math.hypot(n.x - a.toX!, n.z - a.toZ!) < Math.hypot(p.x - a.toX!, p.z - a.toZ!) ? n : p,
    );
  }
  if (a.stick) {
    let best: Rune | undefined;
    let bs = 0.3;
    for (const n of spots) {
      const d = Math.hypot(n.x - t.pos.x, n.z - t.pos.z) || 1;
      const s = ((n.x - t.pos.x) * a.dirX + (n.z - t.pos.z) * a.dirZ) / d;
      if (s > bs) {
        bs = s;
        best = n;
      }
    }
    if (best) return best;
  }
  const foes = w.entities.filter((o) => o.alive && o.hero && !o.hero.dead && o.team !== e.team);
  const safety = (n: Rune) =>
    foes.reduce((m, o) => Math.min(m, Math.hypot(o.transform.pos.x - n.x, o.transform.pos.z - n.z)), 99);
  return spots.reduce((p, n) => (safety(n) > safety(p) ? n : p));
}

/** R: swap places with one of her runes (it lands where she stood); with none in reach, write one at her feet. */
export function fireErratum(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const h = e.hero!;
  const n = erratumPick(w, e, a);
  if (!n) {
    writeRune(w, e, t.pos.x, t.pos.z);
    h.cooldowns.r = Math.min(h.cooldowns.r ?? 0, w.time + 1.5);
    callout(w, e, "BOOKMARK");
    return;
  }
  const ox = t.pos.x;
  const oz = t.pos.z;
  fx(w, "erratum", e.id, e.team, ox, t.y, oz, { tx: n.x, tz: n.z, id: n.id });
  w.teleport(e, n.x, n.z);
  t.facing = Math.atan2(n.x - ox, n.z - oz);
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.3);
  n.x = ox;
  n.z = oz;
  n.until = w.time + runeLimits(w, e).seconds;
  const b = def.fx?.erratumBlot;
  if (b) blot(w, e, ox, oz, b.radius, b.damage * w.damageMulOf(e), b.blind);
  const s = def.fx?.erratumSwarm;
  if (s) {
    const bd = abilities(w, e).b;
    w.zones.push({
      id: w.newId(),
      team: e.team,
      ownerId: e.id,
      x: ox,
      z: oz,
      radius: s.radius,
      until: w.time + s.seconds,
      dps: (bd.dps ?? 32) * w.damageMulOf(e),
      slowMul: bd.slowMul ?? 0.65,
      style: "swarm",
    });
    fx(w, "swarm", e.id, e.team, ox, w.groundY(ox, oz), oz, { radius: s.radius, seconds: s.seconds });
  }
}

/** Z: every rune of hers flares (damage + slow), a page burst shoves close foes, then the manuscript window. */
export function fireManuscript(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const h = e.hero!;
  const mul = w.damageMulOf(e);
  const seconds = def.seconds ?? 8;
  h.manuscriptUntil = w.time + seconds;
  h.freeCast = { b: true, r: true };
  h.cooldowns.b = Math.min(h.cooldowns.b ?? 0, w.time);
  h.cooldowns.r = Math.min(h.cooldowns.r ?? 0, w.time);
  fx(w, "manuscript", e.id, e.team, t.pos.x, t.y, t.pos.z, { radius: def.splash ?? 4, seconds });
  const r = def.radius ?? 2.6;
  const flared = new Set<number>();
  for (const n of h.runes ?? []) {
    const y = w.groundY(n.x, n.z);
    fx(w, "runeFlare", e.id, e.team, n.x, y, n.z, { radius: r, id: n.id });
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.neutral || flared.has(o.id)) continue;
      if (Math.hypot(o.transform.pos.x - n.x, o.transform.pos.z - n.z) - o.radius > r) continue;
      flared.add(o.id);
      w.damage(e, o, (def.damage ?? 80) * mul, {
        fromX: n.x,
        fromZ: n.z,
        knockback: 2,
        slowMul: def.slowMul,
        slowSeconds: def.slowSeconds,
        big: true,
        structureDamage: o.structure ? (def.damage ?? 80) * mul * 0.5 : undefined,
      });
    }
  }
  const br = def.splash ?? 4;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.neutral || o.structure) continue;
    if (Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius > br) continue;
    w.damage(e, o, (def.splashDamage ?? 40) * mul, {
      fromX: t.pos.x,
      fromZ: t.pos.z,
      knockback: def.knockback ?? 8,
      big: true,
    });
  }
  writeRune(w, e, t.pos.x + a.dirX * 1.2, t.pos.z + a.dirZ * 1.2);
}

/** After B/R start during the manuscript window: the first recast of each costs no cooldown. */
export function manuscriptRecast(w: World, e: Entity, slot: "b" | "r"): void {
  const h = e.hero!;
  if (w.time >= (h.manuscriptUntil ?? 0) || !h.freeCast?.[slot]) return;
  h.freeCast[slot] = false;
  h.cooldowns[slot] = w.time + 0.35;
  callout(w, e, "FREE RECAST");
}

/** L+X: Page Gust. A backwards glide (or along the stick) that keeps her facing the way she came, shoving close foes. */
export function startGust(w: World, e: Entity, cmd: Command): boolean {
  if (!isScribe(w, e)) return false;
  const h = e.hero!;
  const t = e.transform;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const dx = mag > 0.2 ? cmd.moveX / mag : -Math.sin(t.facing);
  const dz = mag > 0.2 ? cmd.moveZ / mag : -Math.cos(t.facing);
  const b = w.data.heroes.baseline;
  h.action = {
    name: "dodge",
    kind: "pagegust",
    dur: 0.42,
    hitAt: 99,
    combo: 0,
    t: 0,
    fired: false,
    dirX: dx,
    dirZ: dz,
  };
  h.blocking = false;
  t.facing = Math.atan2(-dx, -dz);
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.28);
  h.cooldowns.dodge = w.time + b.dodgeSeconds + b.dodgeCooldown + 0.3;
  const mul = w.damageMulOf(e);
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.structure || o.neutral) continue;
    if (w.dist(e, o) - o.radius > 2.4) continue;
    w.damage(e, o, 15 * mul, { fromX: t.pos.x, fromZ: t.pos.z, knockback: 9 });
  }
  fx(w, "gust", e.id, e.team, t.pos.x, t.y, t.pos.z, { tx: t.pos.x + dx * 6, tz: t.pos.z + dz * 6, seconds: 0.42 });
  return true;
}

export function gustTick(w: World, e: Entity, a: HeroAction): void {
  const v = 18 * (1 - 0.6 * Math.min(1, a.t / a.dur));
  w.moveBy(e, a.dirX * v * w.dt, a.dirZ * v * w.dt);
}
