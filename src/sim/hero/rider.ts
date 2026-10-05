// Bramble & Mead (rider): Sweet Tooth passive (allies near her regenerate, double for allies above whoever last hit
// them), the held-A honey dollop (Ladle Fling), Honey Pot (B: a thrown pot that leaves a sticky pool - allies heal,
// foes are slowed and can't dodge, bruiser/assassin partners hit harder), Take Wing (R: a steered 3 s flight over
// walls and gaps, ended by R again or the timer, landing heals around her), Royal Jelly (Z: heal, shield and haste
// for allies in 10 m) and Buzz Strafe (her dodge: a sideways buzz that keeps her facing).
import type { World } from "../world.ts";
import type { AbilityDef } from "../config.ts";
import type { Command, Entity, HeroAction } from "../types.ts";
import { abilities, addShield } from "../talents.ts";
import { aimTarget, begin, callout } from "./common.ts";
import { healFrom } from "./friar.ts";

const fx = (
  w: World,
  name: string,
  e: Entity,
  x: number,
  y: number,
  z: number,
  extra: { radius?: number; tx?: number; tz?: number; seconds?: number; id?: number } = {},
) => w.emit({ type: "heroFx", name, src: e.id, team: e.team, x, y, z, ...extra });

const hooksOf = (w: World, e: Entity) => w.heroDef(e.hero!.type).hooks;

/** Heal from Bramble with a floating number on heroes. */
function mend(w: World, e: Entity, o: Entity, amount: number, num = true): number {
  const got = healFrom(w, e, o, amount);
  if (got >= 1 && o.hero && num)
    fx(w, "healNum", e, o.transform.pos.x, o.transform.y + 1, o.transform.pos.z, { radius: Math.round(got), id: o.id });
  return got;
}

/** Above the last enemy that hurt it (within 4 s) by at least `rise` m: Sweet Tooth's high-ground double heal. */
export function abovePursuer(w: World, o: Entity, rise: number): boolean {
  const s = o.status;
  if (s.hurtBy === undefined || w.time - (s.hurtAt ?? -99) > 4) return false;
  const by = w.get(s.hurtBy);
  return !!by && by.alive && o.transform.y > by.transform.y + rise;
}

/** Passive Sweet Tooth, every 15 ticks: hurt allies within sweetRadius regenerate (x sweetHighMul on high ground). */
export function sweetToothTick(w: World, e: Entity): void {
  const hk = hooksOf(w, e);
  const r = hk.sweetRadius;
  if (!r || w.tick % 15 !== 0 || e.hero!.dead) return;
  let any = false;
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.structure || o.hp >= o.maxHp || o === e) continue;
    if (Math.hypot(o.transform.pos.x - e.transform.pos.x, o.transform.pos.z - e.transform.pos.z) > r) continue;
    const frac = o.hero ? (hk.sweetHero ?? 0.006) : (hk.sweetUnit ?? 0.01);
    const high = abovePursuer(w, o, hk.sweetRise ?? 0.75) ? (hk.sweetHighMul ?? 2) : 1;
    if (healFrom(w, e, o, o.maxHp * frac * 0.5 * high) > 0) any = true;
    if (high > 1 && o.hero && w.tick % 60 === 0)
      fx(w, "sweetHigh", e, o.transform.pos.x, o.transform.y, o.transform.pos.z, { id: o.id });
  }
  if (hk.sweetSelf && e.hp < e.maxHp) {
    const high = abovePursuer(w, e, hk.sweetRise ?? 0.75) ? (hk.sweetHighMul ?? 2) : 1;
    healFrom(w, e, e, e.maxHp * hk.sweetSelf * 0.5 * high);
  }
  if (any && w.tick % 60 === 0) fx(w, "sweet", e, e.transform.pos.x, e.transform.y, e.transform.pos.z, { radius: r });
}

/** Enemies stuck in honey can't dodge (called with every hero's command). Returns the command to use. */
export function stuckInHoney(w: World, e: Entity, cmd: Command): Command {
  if (!cmd.dodge || w.time >= (e.status.stickyUntil ?? 0)) return cmd;
  const h = e.hero!;
  if ((h.cooldowns.stuckMsg ?? 0) <= w.time) {
    h.cooldowns.stuckMsg = w.time + 1.2;
    callout(w, e, "STUCK IN HONEY");
  }
  return { ...cmd, dodge: false };
}

// ---------------------------------------------------------------------------------------------------------------
// A held: Ladle Fling
// ---------------------------------------------------------------------------------------------------------------

/** A charged A release (held at least flingCharge) flings a honey dollop instead of swinging. */
export function maybeFling(w: World, e: Entity, charge: number): void {
  const hk = hooksOf(w, e);
  const h = e.hero!;
  const a = h.action;
  if (!hk.flingDamage || !a || a.name !== "a" || a.kind !== "combo" || a.t !== 0 || charge < (hk.flingCharge ?? 0.3))
    return;
  const power = a.power ?? 1;
  const [dx, dz] = [a.dirX, a.dirZ];
  const f = begin(e, "a", "honeyfling", 0.5, 0.26, dx, dz);
  f.power = power;
  h.comboIndex = 0;
  h.comboUntil = 0;
  h.cooldowns.a = w.time + 0.5 + (hk.flingCooldown ?? 0.6);
}

export function honeyFling(w: World, e: Entity, a: HeroAction): void {
  const hk = hooksOf(w, e);
  const t = e.transform;
  const range = hk.flingRange ?? 8;
  const mul = w.damageMulOf(e);
  const dmg = (hk.flingDamage ?? 40) * mul;
  const slow = { slowMul: hk.flingSlow ?? 0.6, slowSeconds: hk.flingSlowSeconds ?? 2 };
  const splash = { radius: hk.flingSplash ?? 1.3, damage: dmg * 0.5, ...slow };
  const target = aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, range);
  if (target) w.fireProjectile(e, target, dmg, 15, true, "honey", 1.6, false, splash, slow);
  else w.fireAtPoint(e, t.pos.x + a.dirX * range, t.pos.z + a.dirZ * range, 15, "honey", 1.6, splash, true);
}

// ---------------------------------------------------------------------------------------------------------------
// B: Honey Pot
// ---------------------------------------------------------------------------------------------------------------

/** Landing spot: placed point, else the visible enemy champion in range, else the best ally/foe brawl, else ahead. */
function potSpot(w: World, e: Entity, a: HeroAction, range: number): { x: number; z: number } {
  const t = e.transform;
  if (a.placed && a.toX !== undefined && a.toZ !== undefined) return { x: a.toX, z: a.toZ };
  const tg = aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, range);
  if (tg) {
    const d = Math.hypot(tg.transform.pos.x - t.pos.x, tg.transform.pos.z - t.pos.z);
    // Lead a little toward Bramble so the pool covers both her side and the target.
    const k = d > 2.5 ? (d - 0.8) / d : 1;
    return { x: t.pos.x + (tg.transform.pos.x - t.pos.x) * k, z: t.pos.z + (tg.transform.pos.z - t.pos.z) * k };
  }
  return { x: t.pos.x + a.dirX * range * 0.6, z: t.pos.z + a.dirZ * range * 0.6 };
}

export function throwHoneyPot(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const range = def.range ?? 8;
  const s = potSpot(w, e, a, range);
  const x = Math.max(1, Math.min(w.terrain.width - 1, s.x));
  const z = Math.max(1, Math.min(w.terrain.depth - 1, s.z));
  const d = Math.hypot(x - t.pos.x, z - t.pos.z);
  if (d > 0.3) t.facing = Math.atan2(x - t.pos.x, z - t.pos.z);
  const flight = (def.flight ?? 0.35) + d / 18;
  const mul = w.damageMulOf(e);
  fx(w, "potThrow", e, t.pos.x + Math.sin(t.facing) * 0.4, t.y + 1.7, t.pos.z + Math.cos(t.facing) * 0.4, {
    tx: x,
    tz: z,
    seconds: flight,
  });
  w.later(flight, () => potLand(w, e, x, z, mul));
}

function potLand(w: World, e: Entity, x: number, z: number, mul: number): void {
  const b = abilities(w, e).b;
  const radius = b.radius ?? 3;
  const y = w.groundY(x, z);
  fx(w, "potSplash", e, x, y, z, { radius, seconds: b.seconds ?? 4 });
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.structure) continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > radius) continue;
    w.damage(e, o, (b.damage ?? 30) * mul * (o.unit ? (b.unitMul ?? 1) : 1), {
      fromX: x,
      fromZ: z,
      knockback: 1.5,
      slowMul: b.slowMul ?? 0.55,
      slowSeconds: 1,
    });
  }
  const shield = b.fx?.potShield;
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.structure) continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > radius) continue;
    if (shield && o.hero) addShield(o, shield.amount, shield.amount, shield.seconds, w.time);
    if (b.heal) mend(w, e, o, b.heal);
  }
  w.zones.push({
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x,
    z,
    radius,
    until: w.time + (b.seconds ?? 4),
    dps: (b.dps ?? 0) * mul,
    slowMul: b.slowMul ?? 0.55,
    style: "honey",
    heal: b.puddleHeal ?? 24,
    sticky: true,
  });
}

/** Rider's honey pools also give bruiser / assassin partners inside a short damage buff (heroes.json synergy). */
export function honeyPartners(w: World, e: Entity): void {
  if (w.tick % 5 !== 0) return;
  const syn = w.heroDef(e.hero!.type).synergy?.honeyAlly;
  if (!syn) return;
  for (const z of w.zones) {
    if (z.ownerId !== e.id || z.style !== "honey" || w.time >= z.until) continue;
    for (const o of w.entities) {
      if (!o.alive || !o.hero || o === e || o.team !== e.team) continue;
      const m = syn[w.heroDef(o.hero.type).class ?? "tank"];
      if (!m || Math.hypot(o.transform.pos.x - z.x, o.transform.pos.z - z.z) > z.radius) continue;
      const s = o.status;
      const fresh = s.brewUntil === undefined || w.time >= s.brewUntil;
      if (!fresh && (s.brewMul ?? 1) > m) continue;
      if (fresh) fx(w, "honeyBuff", e, o.transform.pos.x, o.transform.y, o.transform.pos.z, { id: o.id });
      s.brewMul = m;
      s.brewUntil = Math.max(s.brewUntil ?? 0, w.time + (hooksOf(w, e).honeyBuffSeconds ?? 2));
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// R: Take Wing
// ---------------------------------------------------------------------------------------------------------------

/** Lift-off (fired at the cast's hitAt): from now on hero.wing steers her until she lands. */
export function takeWing(w: World, e: Entity, def: AbilityDef): void {
  const h = e.hero!;
  const t = e.transform;
  const secs = def.seconds ?? 3;
  h.wing = {
    until: w.time + secs,
    minUntil: w.time + 0.45,
    y: t.y,
    dirX: Math.sin(t.facing),
    dirZ: Math.cos(t.facing),
  };
  // Up out of reach: nothing touches her in the air; the landing is the punish window.
  e.status.ccImmuneUntil = Math.max(e.status.ccImmuneUntil, w.time + secs + 0.1);
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + secs + 2);
  e.status.kvx = e.status.kvz = 0;
  fx(w, "wingUp", e, t.pos.x, t.y, t.pos.z, { seconds: secs });
}

/**
 * Flight tick (instead of the normal controller): steer with the stick over anything inside the map; R lands
 * early. Returns true while still flying.
 */
export function tickWing(w: World, e: Entity, cmd: Command): boolean {
  const h = e.hero!;
  const wg = h.wing!;
  const t = e.transform;
  const r = abilities(w, e).r;
  h.action = null;
  h.blocking = false;
  h.charging = undefined;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  if (mag > 0.2) {
    wg.dirX = cmd.moveX / mag;
    wg.dirZ = cmd.moveZ / mag;
  }
  const speed = h.speed * (r.speedMul ?? 1.3) * (mag > 0.2 ? Math.max(mag, 0.75) : 0.35);
  const dt = w.dt;
  const vx = wg.dirX * speed;
  const vz = wg.dirZ * speed;
  h.vel.x = vx;
  h.vel.z = vz;
  const nx = Math.max(1, Math.min(w.terrain.width - 1, t.pos.x + vx * dt));
  const nz = Math.max(1, Math.min(w.terrain.depth - 1, t.pos.z + vz * dt));
  if (!w.mapEvents.sealed(t.pos.x, t.pos.z, nx, nz)) {
    t.pos.x = nx;
    t.pos.z = nz;
  }
  w.faceToward(e, wg.dirX, wg.dirZ, w.data.heroes.baseline.turnRate);
  // The sim height never drops below the take-off height (no chasm deaths mid-air), and rises over walls.
  wg.y = Math.max(wg.y, w.groundY(t.pos.x, t.pos.z));
  t.y = wg.y;
  // Picking up the Grudge on the way (outside deathmatch) brings her straight down: no flying it over walls.
  const done = w.time >= wg.until || (cmd.special && w.time >= wg.minUntil) || (w.arena.carrying(e) && !w.tdm);
  if (!done) return true;
  return !land(w, e);
}

/** Touch down on the nearest walkable cell (keep flying a moment if there's none close), heal around her. */
function land(w: World, e: Entity): boolean {
  const h = e.hero!;
  const t = e.transform;
  const r = abilities(w, e).r;
  const i = w.nav.nearestOpen(t.pos.x, t.pos.z, 3);
  if (i < 0 && w.time < h.wing!.until + 1.5) return false;
  const j = i >= 0 ? i : w.nav.nearestOpen(t.pos.x, t.pos.z, 30);
  h.wing = undefined;
  h.vel.x = h.vel.z = 0;
  if (j >= 0) {
    const x = (j % w.nav.w) + 0.5;
    const z = Math.floor(j / w.nav.w) + 0.5;
    if (Math.hypot(x - t.pos.x, z - t.pos.z) > 0.75) {
      t.pos.x = x;
      t.pos.z = z;
    }
  }
  t.y = w.groundY(t.pos.x, t.pos.z);
  w.mapEvents.anchor(e);
  e.status.invulnUntil = w.time;
  e.status.armorMul = r.vulnMul ?? 1.2;
  e.status.armorUntil = w.time + (r.vulnSeconds ?? 1.5);
  e.status.ccImmuneUntil = w.time;
  const radius = r.radius ?? 4;
  fx(w, "wingLand", e, t.pos.x, t.y, t.pos.z, { radius });
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.structure) continue;
    if (Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius > radius) continue;
    mend(w, e, o, r.heal ?? 70);
  }
  const sl = r.fx?.wingSlam;
  if (sl) {
    const mul = w.damageMulOf(e);
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team) continue;
      if (Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius > sl.radius) continue;
      w.damage(e, o, sl.damage * mul, { fromX: t.pos.x, fromZ: t.pos.z, knockback: 6, stun: sl.stun, big: true });
    }
  }
  const lp = abilities(w, e).b.fx?.landPool;
  if (lp)
    w.zones.push({
      id: w.newId(),
      team: e.team,
      ownerId: e.id,
      x: t.pos.x,
      z: t.pos.z,
      radius: lp.radius,
      until: w.time + lp.seconds,
      dps: 0,
      slowMul: abilities(w, e).b.slowMul ?? 0.55,
      style: "honey",
      heal: abilities(w, e).b.puddleHeal ?? 24,
      sticky: true,
    });
  begin(e, "r", "wingland", r.landSeconds ?? 0.4, 99, Math.sin(t.facing), Math.cos(t.facing));
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Z: Royal Jelly
// ---------------------------------------------------------------------------------------------------------------

export function royalJelly(w: World, e: Entity, def: AbilityDef): void {
  const t = e.transform;
  const r = def.radius ?? 10;
  fx(w, "royalJelly", e, t.pos.x, t.y, t.pos.z, { radius: r, seconds: def.seconds ?? 5 });
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.structure) continue;
    if (Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius > r) continue;
    mend(w, e, o, (def.heal ?? 200) * (o.hero ? 1 : 0.5));
    addShield(o, def.shield ?? 100, def.shield ?? 100, def.shieldSeconds ?? 4, w.time);
    const s = o.status;
    if (w.time >= s.buffUntil) s.buffDamageMul = 1;
    s.buffSpeedMul = Math.max(w.time < s.buffUntil ? s.buffSpeedMul : 1, def.hasteMul ?? 1.25);
    s.buffUntil = Math.max(s.buffUntil, w.time + (def.seconds ?? 5));
    if (s.slowUntil > w.time && s.slowMul < 1) s.slowUntil = w.time;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// L+X: Buzz Strafe
// ---------------------------------------------------------------------------------------------------------------

/** Her dodge: Mead buzzes sideways (any stick direction) while Bramble keeps facing where she was. */
export function startBuzz(w: World, e: Entity, cmd: Command): boolean {
  const hk = hooksOf(w, e);
  if (!hk.buzzStrafe) return false;
  const h = e.hero!;
  const t = e.transform;
  const b = w.data.heroes.baseline;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const face = t.facing;
  const dx = mag > 0.2 ? cmd.moveX / mag : Math.cos(face);
  const dz = mag > 0.2 ? cmd.moveZ / mag : -Math.sin(face);
  const dur = b.dodgeSeconds * (hk.buzzTime ?? 1.15);
  const a = begin(e, "dodge", "buzz", dur, 99, dx, dz);
  // combo: 1 when buzzing to her right (the render banks Mead that way).
  a.combo = dx * Math.cos(face) - dz * Math.sin(face) >= 0 ? 1 : 0;
  t.facing = face;
  e.status.invulnUntil = w.time + dur;
  h.cooldowns.dodge = w.time + dur + b.dodgeCooldown;
  fx(w, "buzz", e, t.pos.x, t.y, t.pos.z, { tx: t.pos.x + dx, tz: t.pos.z + dz, seconds: dur });
  return true;
}

export function buzzTick(w: World, e: Entity, a: HeroAction): void {
  const s = w.data.heroes.baseline.dodgeSpeed * (hooksOf(w, e).buzzSpeed ?? 1.1);
  const face = e.transform.facing;
  w.moveBy(e, a.dirX * s * w.dt, a.dirZ * s * w.dt);
  e.transform.facing = face;
}
