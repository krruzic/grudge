// Expert per-hero techniques: what a top player does with each kit beyond the generic think() rules (charged shots,
// hidden combos, timing tricks). think() calls these at fixed points; each returns quickly for other heroes.
//   wrenAbilities  Pip as a diver answer (pre-emptive Pip -> SKYSHOT -> TALON RAKE), Pip/arrows to break channels,
//                  Heartseeker held for a kill
//   wrenShoot      fully charged Vantage power shots from max range, standing still (high ground when close by)
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Entity, Vec2 } from "../types.ts";
import { abilities } from "../talents.ts";
import { inOwnPuddle } from "../hero/friar.ts";
import { nearWall } from "../hero/harpooner.ts";
import { erratumSpots } from "../hero/scribe.ts";

const isMelee = (w: World, o: Entity): boolean => !!o.hero && (w.heroDef(o.hero.type).botRange ?? 1.8) <= 3;

/** Enemy heroes that are alive, visible and within `r`, nearest first. */
function foesNear(w: World, me: Entity, r: number): Entity[] {
  return w.entities
    .filter((o) => o.alive && o.hero && !o.hero.dead && o.team !== me.team && w.dist(me, o) < r && w.canSee(me, o))
    .sort((a, b) => w.dist(me, a) - w.dist(me, b));
}

/** Running a channel that any hit (or Pip latching on) breaks: recall, relic enshrine/steal, horn capture. */
function channeling(w: World, o: Entity): boolean {
  const h = o.hero!;
  if (h.recallAt !== undefined) return true;
  const r = w.arena.relic;
  if (r.channel > 0 && ((r.state === "carried" && r.carrier === o.id) || (r.state === "shrined" && r.stealer === o.id)))
    return true;
  return w.mapEvents.horns.some(
    (hn) =>
      hn.team === o.team && hn.progress > 0 && Math.hypot(hn.x - o.transform.pos.x, hn.z - o.transform.pos.z) <= 2.8,
  );
}

function aimAt(bot: Bot, me: Entity, o: Entity): void {
  const dx = o.transform.pos.x - me.transform.pos.x;
  const dz = o.transform.pos.z - me.transform.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  bot.wantFace = { x: dx / l, z: dz / l };
}

/**
 * Wren's Pip / dodge / super usage (replaces the generic Pip rule). Returns true when it decided the Z question
 * (so the generic super rule must not fire Heartseeker on its own).
 */
export function wrenAbilities(bot: Bot, w: World, me: Entity): boolean {
  const h = me.hero!;
  const ab = abilities(w, me);
  const rdy = (k: string) => (h.cooldowns[k] ?? 0) <= w.time;
  const foes = foesNear(w, me, 30);
  const pip = h.pip;
  const pipOn = pip?.phase === "on" ? w.get(pip.target) : undefined;
  const diver = foes.find((o) => isMelee(w, o) && w.dist(me, o) < 7);
  // 1. Pip the diver before it arrives (Pip flies 8 m/s, so send him at ~7 m), aiming the placement at it.
  if (diver && !pip && rdy("b") && !h.action) {
    bot.wantB = true;
    bot.wantPlace = { x: diver.transform.pos.x - me.transform.pos.x, z: diver.transform.pos.z - me.transform.pos.z };
  }
  if (pipOn?.alive && pipOn.hero) {
    const d = w.dist(me, pipOn);
    // 2. SKYSHOT: once the latched diver is on top of her, backflip away (invulnerable) with a crit arrow.
    if (isMelee(w, pipOn) && d < 3.2 && rdy("dodge") && !h.action && bot.rand() < 0.9 * bot.skill) {
      bot.wantDodge = true;
      const dx = me.transform.pos.x - pipOn.transform.pos.x;
      const dz = me.transform.pos.z - pipOn.transform.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      bot.wantFace = { x: dx / l, z: dz / l };
    }
    // 3. TALON RAKE: blind a melee hero that is already swinging at her (or caught her again after the flip).
    else if (
      isMelee(w, pipOn) &&
      d < 3 &&
      !rdy("dodge") &&
      !h.action &&
      w.time >= (pipOn.status.blindUntil ?? 0) &&
      bot.rand() < 0.8 * bot.skill
    )
      bot.wantB = true;
  }
  // 4. Break channels: a recall/relic/horn channel within reach dies to a power shot (any hit) or to Pip.
  const chan = foes.find((o) => channeling(w, o) && w.dist(me, o) < 14);
  if (chan && !pip && rdy("b") && !h.action && w.dist(me, chan) > (ab.a.range ?? 10)) {
    bot.wantB = true;
    bot.wantPlace = { x: chan.transform.pos.x - me.transform.pos.x, z: chan.transform.pos.z - me.transform.pos.z };
  }
  // 5. Heartseeker only for a kill (or a channel break / two champions lined up), never on soldiers.
  const z = ab.z;
  if (h.meter < w.data.heroes.baseline.superMax || h.action) return true;
  const dmg = (z.heroDamage ?? 260) * w.damageMulOf(me) * 1.15;
  const range = z.range ?? 28;
  for (const o of foes) {
    if (w.dist(me, o) > range * 0.9) continue;
    const dx = o.transform.pos.x - me.transform.pos.x;
    const dz = o.transform.pos.z - me.transform.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const lined = foes.filter((q) => {
      const qx = q.transform.pos.x - me.transform.pos.x;
      const qz = q.transform.pos.z - me.transform.pos.z;
      const along = (qx * dx + qz * dz) / l;
      return along > 0 && along < range && Math.abs((qx * dz - qz * dx) / l) < (z.width ?? 1) + q.radius;
    }).length;
    if (o.hp <= dmg || lined >= 2 || (channeling(w, o) && o.hp < o.maxHp * 0.6)) {
      bot.wantZ = true;
      aimAt(bot, me, o);
      break;
    }
  }
  return true;
}

/**
 * Hold B through the melee exchange (A swings are actions, so holding costs no speed while swinging) and let it go at
 * full power (x1.6 damage) once the target is within `reach`. Returns true while charging.
 */
function chargeB(bot: Bot, w: World, me: Entity, target: Entity, reach: number, start: number): boolean {
  const h = me.hero!;
  if (!target.hero || (h.cooldowns.b ?? 0) > w.time + 0.8 || w.dist(me, target) > start) return false;
  bot.wantCharge = "b";
  bot.chargeAimId = target.id;
  bot.chargeRange = reach;
  return true;
}

/**
 * Warlord: charged Ground Slam (x1.6 damage; it stuns 0.5 s, which sets up HEAVE). Z stays with the generic rule:
 * holding Quake for a slowed/stunned target (x1.3, +0.6 s stun) tested worse than using it on sight.
 */
export function warlordFight(bot: Bot, w: World, me: Entity, target: Entity | undefined): void {
  if (target?.alive) chargeB(bot, w, me, target, 2.8 + target.radius, 6);
}

/**
 * Stig: Repair is also a 6 m blast (60 to every foe); held to full power it hits for 96, heals the towers he fights
 * beside and (Overhaul) his troops. Used as a fight nuke whenever a champion is inside the blast.
 */
export function engineerFight(bot: Bot, w: World, me: Entity, target: Entity | undefined): void {
  if (!target?.alive) return;
  const r = abilities(w, me).b.radius ?? 6;
  chargeB(bot, w, me, target, r * 0.75 + target.radius, r + 3);
}

/**
 * Grim: Leap is always held to full power (x1.6; his swings are actions, so the hold is free mid-combo) and let go
 * inside its 8 m reach. Execute Dash fires early when it lands the Smoke ambush (x2, consumed by the first hit), the
 * target is below 40% (x1.4) or it kills; otherwise the generic Z rule. (Keeping Z only for those cut his Z use by
 * two thirds and tested worse.) Returns false: the generic Z rule still applies.
 */
export function raiderFight(bot: Bot, w: World, me: Entity, target: Entity | undefined): boolean {
  const h = me.hero!;
  const ab = abilities(w, me);
  if (!target?.alive || !target.hero) return false;
  const d = w.dist(me, target);
  const smoked = w.time < me.status.stealthUntil;
  const full = h.meter >= w.data.heroes.baseline.superMax && !h.action;
  const zRange = (ab.z.range ?? 10) * 0.85;
  if (full && d < zRange && w.canSee(me, target)) {
    const exec = target.hp < target.maxHp * (ab.z.executeBelow ?? 0.4);
    const kill = target.hp < (ab.z.damage ?? 180) * w.damageMulOf(me) * (smoked ? 2 : 1) * 0.9;
    if (smoked || exec || kill) {
      bot.wantZ = true;
      aimAt(bot, me, target);
    }
  }
  if (!bot.wantZ) {
    const leap = ab.b.range ?? 8;
    chargeB(bot, w, me, target, leap - 0.5, leap + 3.5);
  }
  return false;
}

/**
 * Remnil: Hex held to full power (x1.6) and dropped from just inside its 8 m reach; between hexes she kites at
 * ~10.5 m, inside her 13 m bolts and out of most reach, instead of the default 8.
 */
export function summonerFight(bot: Bot, w: World, me: Entity, target: Entity | undefined): void {
  if (!target?.alive || !target.hero) return;
  const ab = abilities(w, me);
  const range = ab.b.range ?? 8;
  const d = w.dist(me, target);
  const charged = chargeB(bot, w, me, target, range - 0.8, 14) && bot.holdSlot === "b" && w.time - bot.holdAt > 1;
  if (d < 14 && w.canSee(me, target) && !foesNear(w, me, 4).length) {
    // Step in to drop a full-power hex, otherwise hold at bolt range.
    const want = charged && (me.hero!.cooldowns.b ?? 0) <= w.time ? range - 1.5 : 10.5;
    const p = me.transform.pos;
    const tp = target.transform.pos;
    const l = Math.hypot(p.x - tp.x, p.z - tp.z) || 1;
    bot.goal = { x: tp.x + ((p.x - tp.x) / l) * want, z: tp.z + ((p.z - tp.z) / l) * want };
  }
}

/**
 * Francois: Lunge held to full power (x1.6) through the exchange; Blade Flurry on a stunned champion (x1.4, e.g. right
 * after a parry) as soon as the meter allows. Z otherwise stays with the generic rule. Parries: duelistReflex.
 */
export function duelistFight(bot: Bot, w: World, me: Entity, target: Entity | undefined): void {
  const h = me.hero!;
  const ab = abilities(w, me);
  if (!target?.alive || !target.hero) return;
  chargeB(bot, w, me, target, (ab.b.range ?? 6) - 0.5, 9);
  if (
    h.meter >= w.data.heroes.baseline.superMax &&
    !h.action &&
    w.time < target.status.stunUntil &&
    w.dist(me, target) < (ab.z.range ?? 3.2) + 0.5
  ) {
    bot.wantZ = true;
    aimAt(bot, me, target);
  }
}

/**
 * Francois' parry read, checked every tick (bot.ts) with a human-like 0.15 s reaction: a champion's swing that started
 * at least 0.15 s ago and lands within 0.35 s gets parried (counter 85, 0.8 s stun, Lunge reset, next hit x1.5).
 * Swings faster than that can't be read. One skill roll per swing.
 */
export function duelistReflex(bot: Bot, w: World, me: Entity): void {
  const h = me.hero!;
  if (h.action || (h.cooldowns.r ?? 0) > w.time) return;
  for (const o of foesNear(w, me, 5)) {
    const a = o.hero!.action;
    if (!a || a.fired || a.name === "dodge" || a.kind === "parry" || a.t < 0.15 || a.hitAt - a.t > 0.35) continue;
    const key = o.id * 100000 + Math.round((w.time - a.t) * 30);
    if (key === bot.reflexKey) return;
    bot.reflexKey = key;
    if (bot.rand() < 0.9 * bot.skill) bot.wantR = true;
    return;
  }
}

/**
 * Thorn: Long Arm Slap held to full power (x1.6) during the melee exchange (his swings are actions, so the hold costs
 * no speed) and let go while the target is still inside its 8.5 m reach. Holding it from range slowed his approach
 * and tested worse; so did dropping Stone Wall behind fleeing champions instead of using it defensively.
 */
export function wardenFight(bot: Bot, w: World, me: Entity, target: Entity | undefined): void {
  if (!target?.alive || !target.hero) return;
  chargeB(bot, w, me, target, (abilities(w, me).b.range ?? 8.5) - 0.8, 3.5);
}

/**
 * Maddock while retreating from a champion within 5 m: Healing Keg at his own feet (110 heal + a puddle), then KEG
 * ROCKET out of the puddle toward home (10 m cc-immune roll that bowls the chaser aside). Returns true when it acted.
 */
export function friarEscape(bot: Bot, w: World, me: Entity, home: Vec2): boolean {
  const h = me.hero!;
  const chaser = foesNear(w, me, 5)[0];
  if (!chaser || h.action) return false;
  const p = me.transform.pos;
  if (inOwnPuddle(w, me) && (h.cooldowns.dodge ?? 0) <= w.time) {
    const dx = home.x - p.x;
    const dz = home.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    bot.wantDodge = true;
    bot.wantFace = { x: dx / l, z: dz / l };
    return true;
  }
  if ((h.cooldowns.b ?? 0) <= w.time && (h.cooldowns.dodge ?? 0) <= w.time + 0.6) {
    bot.wantB = true;
    bot.wantPlace = { x: 0, z: 0 };
    return true;
  }
  return false;
}

/**
 * Maddock's Powder Keg (1.35 s from throw to blast) only where it will land: on a champion that is stunned, slowed,
 * mid-swing or toe to toe with him, else on a clump of soldiers. Replaces the generic "throw it at whoever" rule.
 */
export function friarPowder(bot: Bot, w: World, me: Entity, target: Entity | undefined, clump: number): void {
  const h = me.hero!;
  // A keg of ours is fizzing: blow it early (R again) while an enemy champion - or a crowd - is in the blast,
  // before they step out of it.
  const r = abilities(w, me).r;
  const blast = (r.radius ?? 3.2) * 0.85;
  for (const k of w.kegs) {
    if (k.ownerId !== me.id || k.kind !== "powder" || !k.landed || k.fuseAt - w.time < 0.15) continue;
    let foes = 0;
    let champ = false;
    for (const o of w.entities) {
      if (!o.alive || o.team === me.team || o.team < 0 || o.structure) continue;
      if (Math.hypot(o.transform.pos.x - k.toX, o.transform.pos.z - k.toZ) > blast + o.radius) continue;
      foes++;
      if (o.hero) champ = true;
    }
    if (champ || foes >= 3) {
      bot.wantR = true;
      return;
    }
  }
  if ((h.cooldowns.r ?? 0) > w.time || h.action) return;
  const range = abilities(w, me).r.range ?? 8;
  const t = target?.alive && target.hero && w.dist(me, target) < range + 0.5 ? target : undefined;
  const stuck =
    !!t && (w.time < t.status.stunUntil || (w.time < t.status.slowUntil && t.status.slowMul < 0.8) || !!t.hero!.action);
  if (t && (stuck || w.dist(me, t) < 2.5)) {
    bot.wantR = true;
    bot.wantPlace = { x: t.transform.pos.x - me.transform.pos.x, z: t.transform.pos.z - me.transform.pos.z };
  } else if (clump >= 3) bot.wantR = true;
}

/** Warlord HEAVE direction: into a friendly tower near the victim, else toward the own core. */
export function heaveDir(w: World, me: Entity, victim: Entity): Vec2 {
  const ep = victim.transform.pos;
  let tx = 0;
  let tz = 0;
  let bd = 13;
  for (const o of w.entities) {
    if (!o.alive || o.team !== me.team || o.structure?.type !== "damage" || !o.structure.ready) continue;
    const d = Math.hypot(o.transform.pos.x - ep.x, o.transform.pos.z - ep.z);
    if (d < bd && d > 3) {
      bd = d;
      tx = o.transform.pos.x;
      tz = o.transform.pos.z;
    }
  }
  if (bd === 13) {
    const core = w.core(me.team);
    tx = core ? core.transform.pos.x : me.transform.pos.x * 2 - ep.x;
    tz = core ? core.transform.pos.z : me.transform.pos.z * 2 - ep.z;
  }
  // The throw lands 10 m from the Warlord along the stick.
  const dx = tx - me.transform.pos.x;
  const dz = tz - me.transform.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: dx / l, z: dz / l };
}

/** A standing spot `r` from the target, near the bot, preferring ground at least 1 m above the target. */
function vantageSpot(w: World, me: Entity, t: Entity, r: number): Vec2 | null {
  const p = me.transform.pos;
  const tp = t.transform.pos;
  const ty = t.transform.y;
  const base = Math.atan2(p.x - tp.x, p.z - tp.z);
  let best: Vec2 | null = null;
  let bs = -Infinity;
  for (let k = -3; k <= 3; k++) {
    const a = base + k * 0.35;
    const x = tp.x + Math.sin(a) * r;
    const z = tp.z + Math.cos(a) * r;
    if (x < 1 || z < 1 || x > w.terrain.width - 1 || z > w.terrain.depth - 1) continue;
    const gy = w.terrain.heightAt(x, z);
    if (!Number.isFinite(gy) || !w.nav.open(w.nav.index(Math.floor(x), Math.floor(z)))) continue;
    const walk = Math.hypot(x - p.x, z - p.z);
    if (walk > 7) continue;
    const towers = w.entities.some(
      (o) =>
        o.alive &&
        o.team !== me.team &&
        o.structure?.type === "damage" &&
        o.structure.ready &&
        Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) < 10.5,
    );
    const sc = (gy - ty >= 1 ? 6 : 0) - walk * 0.6 - (towers ? 20 : 0);
    if (sc > bs && w.nav.reachable(p, { x, z })) {
      bs = sc;
      best = { x, z };
    }
  }
  return best;
}

/**
 * Wren's attack pattern once she has a target: hold A for a full power shot (2.2x, piercing, 14 m, x1.2 range and
 * damage in Vantage) and release it the moment the 1.4 s reload is up, standing still so Vantage is on. Only a melee
 * hero within 4.5 m makes her stop charging and kite instead. Returns true when it took over goal/attack.
 */
export function wrenShoot(bot: Bot, w: World, me: Entity, target: Entity): boolean {
  const ab = abilities(w, me);
  const hk = w.heroDef(me.hero!.type).hooks;
  const close = foesNear(w, me, 4.5).find((o) => isMelee(w, o));
  if (close) return false;
  const d = w.dist(me, target) - target.radius;
  const pierce = (ab.a.pierceRange ?? 14) * (hk.vantageRange ?? 1.2);
  if (d > pierce * 0.92 || !w.canSee(me, target)) return false;
  bot.wantCharge = "a";
  bot.chargeAimId = target.id;
  bot.wantAttack = false;
  // Hold ~12 m (outside every melee reach and most ranged A), and stop moving to switch Vantage on.
  const want = target.hero ? 12 : 10;
  if (d < want - 2.5 || d > pierce * 0.85) bot.goal = vantageSpot(w, me, target, want) ?? bot.goal;
  else bot.goal = null;
  return true;
}

/**
 * Brindle once he has a target: Reel In a champion standing by a wall, prop or structure (wall splat), one that is
 * low, or (with a tank partner close) anyone in reach; Tongue Lash away from a melee champion on top of him; charged
 * harpoons (extra ricochet) when nobody is diving him, plain shots otherwise.
 */
export function harpoonerFight(bot: Bot, w: World, me: Entity, target: Entity): void {
  const h = me.hero!;
  const ab = abilities(w, me);
  const rdy = (k: string) => (h.cooldowns[k] ?? 0) <= w.time;
  const d = w.dist(me, target) - target.radius;
  const diver = foesNear(w, me, 3.4).find((o) => isMelee(w, o));
  if (diver && rdy("r") && !h.action && bot.rand() < 0.7 * bot.skill) {
    const ex = me.transform.pos.x - diver.transform.pos.x;
    const ez = me.transform.pos.z - diver.transform.pos.z;
    const el = Math.hypot(ex, ez) || 1;
    bot.wantR = true;
    bot.wantPlace = { x: (ex / el) * 6, z: (ez / el) * 6 };
    return;
  }
  if (target.hero && rdy("b") && !h.action && d < (ab.b.range ?? 10) - 0.5 && w.canSee(me, target)) {
    const tank = w.entities.some(
      (o) =>
        o.alive &&
        o.hero &&
        o !== me &&
        o.team === me.team &&
        w.heroDef(o.hero.type).class === "tank" &&
        w.dist(me, o) < 10,
    );
    const melee = isMelee(w, target);
    const good = nearWall(w, target) || target.hp < target.maxHp * 0.3 || tank || (!melee && d > 6);
    if (good && bot.rand() < 0.5 * bot.skill) {
      bot.wantB = true;
      aimAt(bot, me, target);
      return;
    }
  }
  const reach = (ab.a.range ?? 9) * 1.25;
  if (!foesNear(w, me, 3.6).some((o) => isMelee(w, o)) && d > 3 && d < reach - 1 && w.canSee(me, target)) {
    bot.wantCharge = "a";
    bot.chargeAimId = target.id;
    bot.chargeRange = reach + target.radius;
    bot.wantAttack = false;
  }
}

/**
 * Hollin: Erratum out of a dive to the rune furthest from the diver (else Page Gust away), call the swarm onto herself
 * when a melee champion is on her, bookmark a rune at her feet before a fight starts (so there's always somewhere to Erratum back to), and
 * charged Ink Bolts at champions from range (blot + blind + rune). Called from think's ability step.
 */
export function scribeFight(bot: Bot, w: World, me: Entity, target: Entity | undefined): void {
  const h = me.hero!;
  if (h.action) return;
  const rdy = (k: string) => (h.cooldowns[k] ?? 0) <= w.time;
  const diver = foesNear(w, me, 4).find((o) => isMelee(w, o));
  const swarm = w.zones.find((z) => z.ownerId === me.id && z.style === "swarm" && w.time < z.until && z.radius > 1.6);
  if (diver && swarm && swarm.follow !== me.id && bot.rand() < 0.6 * bot.skill) bot.wantB = true;
  if (diver && rdy("r") && (me.hp < me.maxHp * 0.75 || w.dist(me, diver) < 2.6)) {
    const spots = erratumSpots(w, me).filter(
      (n) => Math.hypot(n.x - diver.transform.pos.x, n.z - diver.transform.pos.z) > 6,
    );
    if (spots.length) {
      const far = spots.reduce((p, n) =>
        Math.hypot(n.x - diver.transform.pos.x, n.z - diver.transform.pos.z) >
        Math.hypot(p.x - diver.transform.pos.x, p.z - diver.transform.pos.z)
          ? n
          : p,
      );
      bot.wantR = true;
      bot.wantPlace = { x: far.x - me.transform.pos.x, z: far.z - me.transform.pos.z };
      return;
    }
  }
  // PAGE GUST: no rune to swap to and a melee champion on her - glide back out of reach.
  if (diver && w.dist(me, diver) < 2.8 && rdy("dodge") && bot.rand() < 0.7 * bot.skill) {
    const dx = me.transform.pos.x - diver.transform.pos.x;
    const dz = me.transform.pos.z - diver.transform.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    bot.wantDodge = true;
    bot.wantFace = { x: dx / l, z: dz / l };
    return;
  }
  if (!target?.alive || !target.hero) return;
  const d = w.dist(me, target);
  if (rdy("r") && !erratumSpots(w, me).length && d > 7 && d < 15 && bot.rand() < 0.3) {
    bot.wantR = true;
    return;
  }
  const ab = abilities(w, me);
  // Charge only when nobody is hitting her: holding A slows her to a crawl.
  const calm = w.time - (me.status.hurtAt ?? -99) > 2 && w.enemiesNear(me, 6).length === 0;
  if (calm && !diver && d > 6 && d < (ab.a.range ?? 11) * 1.1 && w.canSee(me, target)) {
    bot.wantCharge = "a";
    bot.chargeAimId = target.id;
    bot.chargeRange = (ab.a.range ?? 11) * 1.05;
  }
}

/**
 * Mother Kelp: Dredges the enemy marksman / caster out of their backline (and chases with it once the tide is in at
 * 4+ stacks or the target is low), Bilge on healers first (then on whoever is mending, low or in reach), the held-A
 * anchor whirl in a crowd of soldiers, Davy's Grip at high tide or on two champions. Hovering at the edge to build
 * stacks before committing tested worse than brawling: the stacks' leech and toughness are what keep her alive.
 * Returns true when she took over goal/attack this think.
 */
export function witchFight(bot: Bot, w: World, me: Entity, target: Entity | undefined): boolean {
  const h = me.hero!;
  const ab = abilities(w, me);
  const rdy = (k: string) => (h.cooldowns[k] ?? 0) <= w.time;
  const tide = h.tide ?? 0;
  const foes = foesNear(w, me, 14);
  const p = me.transform.pos;
  const face = (o: Entity) => aimAt(bot, me, o);
  let acted = false;
  // Davy's Grip: at high tide with a champion in the ring, two champions in it, or a kill.
  const z = ab.z;
  if (h.meter >= w.data.heroes.baseline.superMax && !h.action) {
    const r = (z.radius ?? 6) - 0.8;
    const inRing = foes.filter((o) => w.dist(me, o) < r);
    const dmg = ((z.damage ?? 70) + tide * (z.stackDamage ?? 10)) * w.damageMulOf(me);
    if (inRing.length >= 2 || (inRing.length && (tide >= 5 || inRing[0].hp < dmg * 1.2))) bot.wantZ = true;
  }
  // Bilge: a healer in spitting range first, else a champion that's healing up or low.
  if (rdy("r") && !h.action) {
    const range = (ab.r.range ?? 5) + 1;
    const healer = foes.find((o) => w.heroDef(o.hero!.type).botPlan?.healer && w.dist(me, o) < range);
    const mending = foes.find(
      (o) =>
        w.dist(me, o) < range &&
        (o.hp < o.maxHp * 0.6 || (o.status.hotUntil !== undefined && w.time < o.status.hotUntil)),
    );
    const t = healer ?? mending ?? (target?.hero && w.dist(me, target) < range - 0.5 ? target : undefined);
    if (t && bot.rand() < 0.6 * bot.skill + 0.2) {
      bot.wantR = true;
      bot.wantPlace = { x: t.transform.pos.x - p.x, z: t.transform.pos.z - p.z };
      face(t);
      acted = true;
    }
  }
  // Dredge: pull the enemy marksman / caster out (when healthy enough to fight on their side), else close the gap
  // on the target once committed.
  if (rdy("b") && !h.action && !bot.wantR) {
    const reach = (ab.b.range ?? 9) - 0.6;
    const back = foes.find((o) => {
      const cls = w.heroDef(o.hero!.type).class;
      return (cls === "marksman" || cls === "caster") && w.dist(me, o) < reach && w.dist(me, o) > 3.5;
    });
    const commit = !!target?.hero && (tide >= 4 || target.hp < target.maxHp * 0.4);
    const pick =
      back && me.hp > me.maxHp * 0.45
        ? back
        : target?.hero && (commit || w.dist(me, target) > 3.5) && w.dist(me, target) < reach && w.dist(me, target) > 2
          ? target
          : undefined;
    // The swap drops her where the target stood: not into the middle of their partner and towers.
    const guarded =
      !!pick &&
      pick.hp > pick.maxHp * 0.3 &&
      (foes.some((o) => o !== pick && w.dist(o, pick) < 5) ||
        w.entities.some(
          (o) =>
            o.alive &&
            o.team !== me.team &&
            o.structure?.type === "damage" &&
            o.structure.ready &&
            w.dist(o, pick) < o.structure.range,
        ));
    if (pick && !guarded && bot.rand() < 0.5 * bot.skill + 0.25) {
      bot.wantB = true;
      face(pick);
      acted = true;
    }
  }
  if (!target?.alive) return acted;
  // Whirl in a crowd of soldiers (against a champion the combo hits harder).
  const close = w.enemiesNear(me, 3.2).filter((o) => !o.structure).length;
  const heroClose = target.hero && w.dist(me, target) - target.radius < 2.6;
  if (!h.action && !bot.wantB && !bot.wantR && !bot.wantZ && close >= 4 && !heroClose) {
    bot.wantCharge = "a";
    bot.chargeAimId = target.id;
    bot.chargeRange = 3;
    bot.goal = { x: target.transform.pos.x, z: target.transform.pos.z };
    return true;
  }
  return acted;
}
