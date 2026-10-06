// Damage pipeline. World.damage() is the single entry point for every hit in the game; the order of the
// multiplier steps below is load-bearing (rounding happens after all multipliers, shields/wards soak after
// rounding, lone/outnumbered armour after soaks) and must not be reordered. RNG is consumed for blind misses,
// uphill misses and hero variance/crit rolls, in that order.
import type { World } from "../world.ts";
import type { Entity } from "../types.ts";
import { abilities, addShield, allFx, mark as markOne, xpForDamage } from "../talents.ts";
import { pipMarkMul, vantageMul } from "../hero/marksman.ts";
import { tideArmor, tideLeech, tideMul } from "../hero/wreckwitch.ts";
import { chillMul, domeBlocks, fortCoverMul, highGroundMul } from "../hero/architect.ts";
import { curlBlocks, gritMul } from "../hero/vintner.ts";

export interface DamageOpts {
  knockback?: number;
  /** Hit origin for knockback/block direction; defaults to the source's position. */
  fromX?: number;
  fromZ?: number;
  stun?: number;
  slowMul?: number;
  slowSeconds?: number;
  /** Subject to the uphill miss chance. */
  canMiss?: boolean;
  big?: boolean;
  /** Replaces `amount` when the target is a structure. */
  structureDamage?: number;
  noFlinch?: boolean;
  vsSlowedMul?: number;
  vsStunnedMul?: number;
  executeBelow?: number;
  executeMul?: number;
  /** Damage-over-time tick: no variance/crit, no blind miss, no vantage bonus. */
  tick?: boolean;
  pull?: number;
  crit?: boolean;
}

export function damageMulOf(w: World, src: Entity): number {
  const s = src.status;
  let m = (w.time < s.buffUntil ? s.buffDamageMul : 1) * s.auraDamageMul * s.supportDamageMul;
  if (w.time < s.rallyUntil) m *= w.data.match.economy.rally.damageMul;
  if (s.brewUntil !== undefined && w.time < s.brewUntil) m *= s.brewMul ?? 1;
  if (src.hero) m *= w.mapEvents.hauntMul(src, "damage");
  if (src.hero) m *= src.hero.damageMul * (src.hero.action?.power ?? 1);
  if (src.hero?.tide) m *= tideMul(w, src);
  if (src.unit) m *= 1 + (w.data.match.suddenDeath.unitDamageMul - 1) * w.surge();
  if (s.powerDamageMul !== undefined) m *= s.powerDamageMul;
  return m;
}

type HitPos = { x: number; y: number; z: number };

/**
 * The damage pipeline. Stages, in order (each stage's floating-point order is load-bearing):
 *   1. reject: dead / invulnerable / parried
 *   2. combat bookkeeping (last attack, hurtBy, combat timers)
 *   3. miss rolls (blind, uphill)                                    [RNG]
 *   4. attacker-side scaling (structure rules, hero hooks, flank/backstab/ambush, synergy, vantage, pip mark)
 *   5. variance + crit roll                                          [RNG]
 *   6. defender-side scaling (guard, stealth ambush, marks, armour)
 *   7. CC immunity, frontal block, round to an integer >= 1
 *   8. soaks: core ward, then shield (a fully soaked hit still counts as landed)
 *   9. lone/outnumbered hero armour, then subtract hp and apply on-damage side effects
 *  10. hit event, knockback/pull/stun/slow/flinch, training-dummy floor, kill
 */
export function damage(w: World, src: Entity | null, target: Entity, amount: number, opts: DamageOpts = {}): boolean {
  if (!target.alive) return false;
  const tp = target.transform;
  const ev: HitPos = { x: tp.pos.x, y: tp.y + 1, z: tp.pos.z };
  if (w.time < target.status.invulnUntil) {
    w.emit({ type: "miss", ...ev });
    return false;
  }
  // Avalanche Dome: nothing shoots across its rim (no rng used, so other matches are unaffected).
  if (!opts.tick && domeBlocks(w, src, target)) {
    w.emit({ type: "miss", ...ev });
    return false;
  }
  if (tryParry(w, src, target, ev)) return false;
  noteCombat(w, src, target);
  if (rollMiss(w, src, target, opts)) {
    w.emit({ type: "miss", ...ev });
    return false;
  }

  amount = attackerScaling(w, src, target, amount, opts);
  amount *= synergyMul(w, src, target, opts);
  if (src?.hero && !opts.tick) amount *= vantageMul(w, src, target);
  if (src) amount *= pipMarkMul(w, src, target);
  if (src && !opts.tick) amount *= highGroundMul(w, src, target) * chillMul(w, src, target);
  if (w.mods.length) amount *= fortCoverMul(w, src, target);
  let crit: boolean;
  [amount, crit] = rollVariance(w, src, amount, opts);
  amount = defenderScaling(w, src, target, amount, opts);

  if (w.time < target.status.ccImmuneUntil) {
    opts = { ...opts, stun: undefined, knockback: 0 };
  }
  // Frontal block: a blocking hero facing within ~78 degrees of the hit origin takes reduced damage, no knockback.
  let blocked = false;
  const fx = opts.fromX ?? src?.transform.pos.x;
  const fz = opts.fromZ ?? src?.transform.pos.z;
  if (target.hero?.blocking && fx !== undefined && fz !== undefined) {
    const dx = fx - tp.pos.x;
    const dz = fz - tp.pos.z;
    const facingDot = (Math.sin(tp.facing) * dx + Math.cos(tp.facing) * dz) / (Math.hypot(dx, dz) || 1);
    if (facingDot > 0.2) {
      blocked = true;
      amount *= w.data.heroes.baseline.blockFrontalMul;
    }
  } else if (target.hero?.curlUntil && fx !== undefined && fz !== undefined && curlBlocks(w, target, fx, fz)) {
    // Gristle's Anvil Curl: the anvil on his back stops a hit from behind.
    blocked = true;
    amount *= w.heroDef(target.hero.type).hooks.curlMul ?? 0.15;
  }
  amount = Math.max(1, Math.round(amount));

  amount = soakWard(w, src, target, amount, ev);
  if (amount <= 0) return true;
  amount = soakShield(w, src, target, amount, ev);
  if (amount <= 0) return true;

  amount = matchupArmour(w, src, target, amount);
  target.hp -= amount;
  onDamageDealt(w, src, target, amount, !!opts.big);
  w.emit({
    type: "hit",
    ...ev,
    team: target.team,
    big: !!opts.big || crit || amount >= 50,
    blocked,
    id: target.id,
    amount,
    src: src?.id,
    fx,
    fz,
    crit,
  });
  if (!blocked && target.kind !== "structure" && fx !== undefined && fz !== undefined)
    applyImpact(w, target, amount, opts, fx, fz);
  if (target.dummy) {
    target.dummyHitAt = w.time;
    if (target.hp < 1) target.hp = 1;
  }
  if (target.hp <= 0) w.kill(target, src);
  return true;
}

/** Duelist parry: inside the parry window the hit is negated and the attacker eats a counter. */
function tryParry(w: World, src: Entity | null, target: Entity, ev: HitPos): boolean {
  if (!(
    target.hero?.action?.kind === "parry" &&
    target.hero.action.t <= (w.heroDef(target.hero.type).abilities.r.window ?? 0.5)
  ))
    return false;
  const r = w.heroDef(target.hero.type).abilities.r;
  const pfx = allFx(w, target);
  w.emit({ type: "parry", ...ev, team: target.team, src: target.id });
  target.hero.action.t = Math.max(target.hero.action.dur, (r.window ?? 0.5) + 0.01);
  target.hero.riposteUntil = w.time + 0.7;
  if (src && src.kind !== "structure" && w.dist(src, target) < 5) {
    const pc = pfx.parryCounter;
    w.damage(target, src, (r.counter ?? 80) * (pc?.mul ?? 1) * w.damageMulOf(target), {
      stun: (r.stunSeconds ?? 0) + (pc?.stun ?? 0),
      knockback: 4,
      big: true,
    });
  }
  if (pfx.parryShield) addShield(target, pfx.parryShield, pfx.parryShield, 5, w.time);
  const pm = abilities(w, target).b.fx?.mark;
  if (pfx.parryMark && pm && src && !src.structure) markOne(w, target, src, pm);
  if (r.openingSeconds) {
    target.hero.cooldowns.b = w.time;
    target.hero.openingUntil = w.time + r.openingSeconds;
  }
  return true;
}

/** Timestamps read by AI, regen ("calm"), stealth reveal and chasm kill credit. */
function noteCombat(w: World, src: Entity | null, target: Entity): void {
  const tp = target.transform;
  if (src) src.status.lastAttackAt = w.time;
  if (src && src.team !== target.team) {
    target.status.hurtBy = src.id;
    target.status.hurtAt = w.time;
  }
  if (src?.hero && !target.structure && target.team !== src.team) {
    src.status.lastHitAt = w.time;
    src.status.lastHitX = tp.pos.x;
    src.status.lastHitZ = tp.pos.z;
  }
  if (target.hero) target.hero.combatAt = w.time;
  if (src?.hero && target.hero) src.hero.combatAt = w.time;
}

/** Blind (any hit except DoT ticks) and uphill (canMiss shots at targets on high ground) miss chances. */
function rollMiss(w: World, src: Entity | null, target: Entity, opts: DamageOpts): boolean {
  if (
    src &&
    !opts.tick &&
    src.status.blindUntil !== undefined &&
    w.time < src.status.blindUntil &&
    w.rng() < (src.status.blindMiss ?? 0.5)
  )
    return true;
  if (opts.canMiss && src) {
    const tr = w.data.match.terrain;
    if (target.transform.y - src.transform.y >= tr.highGroundDelta && w.rng() < tr.uphillMissChance) return true;
  }
  return false;
}

/** Structure overrides + catch-up fortify, hero hook multipliers, and positional (backstab/ambush) bonuses. */
function attackerScaling(w: World, src: Entity | null, target: Entity, amount: number, opts: DamageOpts): number {
  const tp = target.transform;
  if (target.structure) {
    if (opts.structureDamage !== undefined) amount = opts.structureDamage;
    const tt = w.teams[target.team];
    if (tt) amount *= 1 - tt.catchUp * w.data.match.catchUp.fortify;
    // Early keeps are sturdy: an early lead takes towers and outposts, a lead held into mid-game takes the keep.
    const bw = w.data.structures.core.bulwark;
    if (bw && target.structure.type === "core" && !w.isSudden())
      amount *= bw.mul + (1 - bw.mul) * Math.min(1, w.time / bw.fullAt);
  }
  if (src && src.kind !== "structure") {
    const hk = w.hooks(src);
    // An execute (Grim's dash) scales off the target's missing health only: no backstab on top.
    if (hk.flankMul && !opts.executeMul) {
      // Flankers: bonus vs undefended structures, or vs units/heroes hit from behind.
      if (target.structure) {
        const defended = w.entities.some((o) => o.alive && o.unit && o.team === target.team && w.dist(o, target) < 7);
        if (!defended) amount *= hk.flankMul;
      } else {
        const dx = src.transform.pos.x - tp.pos.x;
        const dz = src.transform.pos.z - tp.pos.z;
        const dot = (Math.sin(tp.facing) * dx + Math.cos(tp.facing) * dz) / (Math.hypot(dx, dz) || 1);
        if (dot < -0.2) amount *= hk.flankMul;
      }
    }
    if (hk.heroDamageMul && target.hero && src.hero) amount *= hk.heroDamageMul;
    if (hk.structureMul && target.structure && opts.structureDamage === undefined) amount *= hk.structureMul;
    if (hk.heroStructureMul && target.structure && src.hero) amount *= hk.heroStructureMul;
    if (!target.structure) {
      const pos = w.data.match.positional;
      const dx = src.transform.pos.x - tp.pos.x;
      const dz = src.transform.pos.z - tp.pos.z;
      const dot = (Math.sin(tp.facing) * dx + Math.cos(tp.facing) * dz) / (Math.hypot(dx, dz) || 1);
      if (dot < -0.3 && !hk.flankMul) amount *= pos.backstabMul;
      if (src.status.hidden && !w.sharesPatch(src, target)) amount *= pos.ambushMul;
    }
  }
  return amount;
}

/** Forced crit, or (hero direct hits only) +-variance then a crit roll, using per-hit/ability/global settings. */
function rollVariance(w: World, src: Entity | null, amount: number, opts: DamageOpts): [number, boolean] {
  let crit = false;
  if (opts.crit) {
    crit = true;
    amount *= w.data.match.rolls.critMul;
  } else if (src?.hero && !opts.tick) {
    const rl = w.data.match.rolls;
    const act = src.hero.action;
    const ab =
      act && (act.name === "a" || act.name === "b" || act.name === "r" || act.name === "z")
        ? abilities(w, src)[act.name]
        : undefined;
    const hit = ab?.hits?.[act!.combo] as { variance?: number; crit?: number } | undefined;
    const v = hit?.variance ?? ab?.variance ?? rl.variance;
    const cc = hit?.crit ?? ab?.crit ?? rl.critChance;
    amount *= 1 + (w.rng() * 2 - 1) * v;
    if (w.rng() < cc) {
      crit = true;
      amount *= rl.critMul;
    }
  }
  return [amount, crit];
}

/**
 * Team synergy auras (heroes.json "synergy", keyed by the partner's class): every partner champion within 9 m of
 * champion `e` contributes its `edge` (damage dealt) or `guard` (damage taken) entry for e's class. Not in
 * deathmatch, where houses are bigger.
 */
function partnerMul(w: World, e: Entity, kind: "edge" | "guard"): number {
  const cls = e.hero ? w.heroDef(e.hero.type).class : undefined;
  if (!cls || w.tdm) return 1;
  let m = 1;
  for (const p of w.players) {
    if (p.team !== e.team || p.heroId === e.id) continue;
    const o = w.getAny(p.heroId);
    if (!o?.alive || !o.hero || o.hero.dead || w.dist(o, e) > 9) continue;
    m *= w.heroDef(o.hero.type).synergy?.[kind]?.[cls] ?? 1;
  }
  return m;
}

/**
 * Bastion (Stig's synergy, heroes.json synergy.bastion keyed by the partner's class): a partner fighting within 7 m
 * of one of their house's buildings takes less - the engineer's works are cover for the back line.
 */
function bastionMul(w: World, e: Entity): number {
  const cls = e.hero ? w.heroDef(e.hero.type).class : undefined;
  if (!cls || w.tdm) return 1;
  let k = 1;
  for (const p of w.players) {
    if (p.team !== e.team || p.heroId === e.id) continue;
    const v = w.heroDef(p.heroType).synergy?.bastion?.[cls];
    if (v !== undefined) k = Math.min(k, v);
  }
  if (k >= 1) return 1;
  for (const o of w.entities) if (o.alive && o.structure && o.team === e.team && w.dist(o, e) - o.radius < 7) return k;
  return 1;
}

/** Guard, the attacker's stealth-ambush opener (consumed here), marks, and armour effects. */
function defenderScaling(w: World, src: Entity | null, target: Entity, amount: number, opts: DamageOpts): number {
  if (w.time < target.status.guardUntil) amount *= target.status.guardMul;
  if (target.hero) amount *= partnerMul(w, target, "guard") * bastionMul(w, target);
  if (src?.hero) amount *= partnerMul(w, src, "edge");
  if (src && src.kind !== "structure") {
    if (w.time < src.status.stealthUntil) {
      // The execute doesn't cash in the ambush either (it still breaks stealth).
      if (!opts.executeMul) amount *= src.status.ambushMul;
      src.status.stealthUntil = 0;
    }
  }
  const st = target.status;
  // A mark amplifies damage from its owner (and their summons), or from the whole marking team if markAll.
  if (
    src &&
    w.time < st.markUntil &&
    (st.markAll ? src.team === st.markTeam : src.id === st.markOwner || src.owner === st.markOwner)
  )
    amount *= st.markMul;
  if (src && w.time < src.status.markUntil && src.status.markWeaken < 1) amount *= src.status.markWeaken;
  if (w.time < st.armorUntil) amount *= st.armorMul;
  if (st.powerTakenMul !== undefined) amount *= st.powerTakenMul;
  if (target.hero?.tide) amount *= tideArmor(w, target);
  if (target.hero && st.shield > 0) {
    const aws = abilities(w, target).a.fx?.armorWhileShield;
    if (aws) amount *= aws;
  }
  if (target.hero?.grit) amount *= gritMul(w, target);
  return amount;
}

/** Emit a fully-absorbed hit (shown as a blocked number). */
function emitSoaked(w: World, src: Entity | null, target: Entity, ev: HitPos, soak: number): void {
  w.emit({
    type: "hit",
    ...ev,
    team: target.team,
    big: false,
    blocked: true,
    id: target.id,
    amount: soak,
    src: src?.id,
  });
}

/** Core ward absorbs damage outside sudden death; breaking it locks out re-buying for a while. */
function soakWard(w: World, src: Entity | null, target: Entity, amount: number, ev: HitPos): number {
  const ts = target.structure;
  if (!(ts?.type === "core" && (ts.ward ?? 0) > 0 && !w.isSudden() && w.homeHeld(target.team))) return amount;
  // As the war drums build (World.surge) the ward catches less of each blow; in sudden death, nothing.
  const soak = Math.min(ts.ward!, amount * (1 - w.surge() * 0.8));
  ts.ward! -= soak;
  amount -= soak;
  if (ts.ward! <= 0) {
    ts.ward = 0;
    const tst = w.teams[target.team];
    if (tst) tst.wardReadyAt = Math.max(tst.wardReadyAt, w.time + (w.data.match.arena.shop.ward.brokenLockout ?? 15));
    w.emit({ type: "notice", team: target.team, text: "CORE SHIELD DOWN" });
  }
  if (amount <= 0) emitSoaked(w, src, target, ev, soak);
  return amount;
}

/** Status shield absorbs damage; breaking it may trigger a (next-timer) shield-burst talent. */
function soakShield(w: World, src: Entity | null, target: Entity, amount: number, ev: HitPos): number {
  const st = target.status;
  const tp = target.transform;
  if (!(st.shield > 0 && w.time < st.shieldUntil)) return amount;
  const soak = Math.min(st.shield, amount);
  st.shield -= soak;
  amount -= soak;
  if (st.shield <= 0) {
    st.shield = 0;
    const burst = target.hero ? abilities(w, target).a.fx?.shieldBurst : undefined;
    w.emit({ type: "shieldBreak", x: tp.pos.x, y: tp.y, z: tp.pos.z, team: target.team, burst: !!burst });
    if (burst) {
      w.later(0, () => {
        for (const o of w.entities.slice()) {
          if (!o.alive || o.team === target.team || o.structure) continue;
          if (w.dist(o, target) - o.radius > 3) continue;
          w.damage(target, o, burst * w.damageMulOf(target), {
            fromX: tp.pos.x,
            fromZ: tp.pos.z,
            knockback: 6,
            big: true,
          });
        }
      });
    }
  }
  if (amount <= 0) emitSoaked(w, src, target, ev, soak);
  return amount;
}

/** Hero hooks that depend on the attacker or nearby allies/enemies (soldierTakenMul, outnumberedArmor, ...). */
function matchupArmour(w: World, src: Entity | null, target: Entity, amount: number): number {
  // Glass champions (Grim) take extra from soldiers, so wading through a wave costs him.
  if (target.hero && src?.unit) amount *= w.heroDef(target.hero.type).hooks.soldierTakenMul ?? 1;
  if (target.hero && src?.hero) {
    const ua = w.heroDef(target.hero.type).hooks.outnumberedArmor;
    if (ua && w.outnumbered(target)) amount *= 1 - ua;
  }
  return amount;
}

/** Side effects of hp actually lost: leech, jump cancel, xp, super meter, last-target memory, core damage stat. */
function onDamageDealt(w: World, src: Entity | null, target: Entity, amount: number, big = false): void {
  // Wounded: a ranged champion's hit (botRange > 3: Wren, Remnil, Hollin, Brindle), or any champion's big hit
  // (finishers, slams, dashes), cuts a champion's healing for a few seconds - the answer to Maddock and Bramble
  // out-healing the damage.
  if (src?.hero && target.hero && amount > 0 && (big || (w.heroDef(src.hero.type).botRange ?? 1.8) > 3)) {
    const was = target.status.woundUntil ?? -1;
    target.status.woundUntil = w.time + (w.data.match.wound?.seconds ?? 2.5);
    if (was < w.time)
      w.emit({
        type: "heroFx",
        name: "wounded",
        src: target.id,
        team: target.team,
        x: target.transform.pos.x,
        y: target.transform.y,
        z: target.transform.pos.z,
      });
  }
  // Bloodthirst (Grim): a share of what he deals to champions heals him, wherever he is.
  if (src?.hero && src.alive && target.hero) {
    const lh = w.heroDef(src.hero.type).hooks.heroLeech;
    if (lh) w.heal(src, amount * lh);
  }
  if (src?.hero?.tide && src.alive) w.heal(src, amount * tideLeech(w, src));
  if (target.hero?.jump && amount > 0) w.cancelJump(target);
  xpForDamage(w, src, target, amount);
  if (src && src.alive && src.status.stealUntil && w.time < src.status.stealUntil)
    w.heal(src, amount * (src.status.stealMul ?? 0));
  const b = w.data.heroes.baseline;
  // Super meter: a super's own hits never refill it (no chaining supers off a crowd), and some champions charge
  // slower (hooks.superGainMul: the Warlord's quake hits everything).
  if (src?.hero && src.hero.action?.name !== "z")
    src.hero.meter = Math.min(
      b.superMax,
      src.hero.meter + amount * b.superPerDamageDealt * (w.heroDef(src.hero.type).hooks.superGainMul ?? 1),
    );
  if (target.hero && target.hp > 0)
    target.hero.meter = Math.min(b.superMax, target.hero.meter + amount * b.superPerDamageTaken);
  if (src?.hero) {
    src.hero.lastTargetId = target.id;
    src.hero.lastTargetAt = w.time;
  }
  if (target.structure?.type === "core" && src) w.teams[src.team].coreDamageDealt += amount;
}

/** Knockback away from / pull toward (fx, fz), stun, slow, and the hero flinch on heavy unblocked hits. */
function applyImpact(w: World, target: Entity, amount: number, opts: DamageOpts, fx: number, fz: number): void {
  const tp = target.transform;
  const resist = target.unit ? (w.data.units.types[target.unit.type].knockbackResist ?? 0) : 0;
  const kb = (opts.knockback ?? 0) * (1 - resist);
  if (kb > 0) {
    const dx = tp.pos.x - fx;
    const dz = tp.pos.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    target.status.kvx += (dx / d) * kb;
    target.status.kvz += (dz / d) * kb;
  }
  if (opts.pull) {
    const dx = fx - tp.pos.x;
    const dz = fz - tp.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const pr = opts.pull * (1 - resist) * (target.hero ? 0.5 : 1);
    const k = Math.min(pr, d * 1.6);
    target.status.kvx += (dx / d) * k;
    target.status.kvz += (dz / d) * k;
  }
  if (opts.stun) target.status.stunUntil = Math.max(target.status.stunUntil, w.time + opts.stun);
  if (opts.slowMul !== undefined && opts.slowSeconds) {
    target.status.slowMul = opts.slowMul;
    target.status.slowUntil = w.time + opts.slowSeconds;
  }
  if (target.hero && !target.hero.blocking && amount >= 25 && !target.hero.action && !opts.noFlinch) {
    target.hero.action = {
      name: "hit",
      kind: "hit",
      t: 0,
      dur: w.data.heroes.baseline.hitStunSeconds,
      hitAt: 99,
      fired: true,
      combo: 0,
      dirX: 0,
      dirZ: 0,
    };
  }
}

function synergyMul(w: World, src: Entity | null, target: Entity, opts: DamageOpts): number {
  const t = w.time;
  const ts = target.status;
  let m = 1;
  if (src && t < src.status.cowedUntil) m *= w.data.heroes.baseline.cowedDamageMul ?? 0.75;
  if (target.kind !== "structure") {
    const stunned = t < ts.stunUntil;
    const slowed = t < ts.slowUntil && ts.slowMul < 1;
    if (opts.vsStunnedMul && stunned) m *= opts.vsStunnedMul;
    if (opts.vsSlowedMul && (stunned || slowed)) m *= opts.vsSlowedMul;
    if (opts.executeMul && target.hp < target.maxHp * (opts.executeBelow ?? 0.4)) m *= opts.executeMul;
    if (src?.owner && t < ts.hexUntil && ts.hexOwner === src.owner) {
      const o = w.get(src.owner);
      if (o?.hero) m *= w.heroDef(o.hero.type).hooks.hexMinionMul ?? 1;
    }
    // Marked for death: a partner champion of the hexer hits a hexed foe harder - by class (Remnil sets up
    // assassins, not tanks; heroes.json "synergy").
    if (src?.hero && t < ts.hexUntil && ts.hexOwner && ts.hexOwner !== src.id) {
      const o = w.getAny(ts.hexOwner);
      const cls = w.heroDef(src.hero.type).class;
      if (o?.hero && o.team === src.team && cls) m *= w.heroDef(o.hero.type).synergy?.hexAlly?.[cls] ?? 1;
    }
    // Hollin's bees: a partner champion's next hit on a foe inside her swarm lands harder, by class (then it's spent).
    if (src?.hero && ts.swarmUntil !== undefined && t < ts.swarmUntil && ts.swarmOwner !== src.id) {
      const o = w.getAny(ts.swarmOwner!);
      const cls = w.heroDef(src.hero.type).class;
      const k = o?.hero && o.team === src.team && cls ? w.heroDef(o.hero.type).synergy?.swarmAlly?.[cls] : undefined;
      if (k) {
        m *= k;
        ts.swarmUntil = 0;
      }
    }
    if (src?.hero && t < src.hero.openingUntil) {
      const r = w.heroDef(src.hero.type).abilities.r;
      m *= r.openingMul ?? 1.5;
      src.hero.openingUntil = 0;
      w.emit({
        type: "parry",
        x: target.transform.pos.x,
        y: target.transform.y + 1,
        z: target.transform.pos.z,
        team: src.team,
        src: src.id,
      });
    }
  }
  return m;
}

export function outnumbered(w: World, e: Entity): boolean {
  let n = 0;
  for (const p of w.players) {
    if (p.team === e.team) continue;
    const o = w.getAny(p.heroId);
    if (o?.alive && w.dist(o, e) < 8) n++;
  }
  return n >= 2;
}

export function heal(w: World, target: Entity, amount: number): void {
  if (!target.alive || target.hp >= target.maxHp) return;
  if (target.status.noHealUntil !== undefined && w.time < target.status.noHealUntil) return;
  // Wounded (hit by a ranged champion lately): healing is cut.
  if (target.status.woundUntil !== undefined && w.time < target.status.woundUntil)
    amount *= w.data.match.wound?.healMul ?? 0.6;
  target.hp = Math.min(target.maxHp, target.hp + amount);
}
