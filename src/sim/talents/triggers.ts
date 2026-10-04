// Talent triggers: hooks the hero/world code calls at specific moments (combo speed, melee damage mods, after a
// melee swing or a shot lands, on kill, on B use, B cooldown with recast windows).
import type { World } from "../world.ts";
import type { Entity } from "../types.ts";
import { spawnUnit } from "../structures.ts";
import { abilities, allFx, gainXp } from "../talents.ts";
import { addShield, applyBleed, chainLightning, heal, zoneAt } from "./effects.ts";
import { fireMissile } from "./missiles.ts";

/** Combo speed multiplier from frenzy stacks. */
export function frenzySpeed(w: World, e: Entity): number {
  const f = abilities(w, e).a.fx?.frenzy;
  const h = e.hero!;
  return f && w.time < h.frenzyUntil ? 1 + h.frenzy * f.speed : 1;
}

/** Combo-hit damage/arc/knockback modifiers from frenzy, finisher talents and empower (consumed here). */
export function meleeMods(
  w: World,
  e: Entity,
  finisher: boolean,
  jab: boolean,
): { dmgMul: number; arc: number | null; knockMul: number; extra: number } {
  const fx = abilities(w, e).a.fx;
  const h = e.hero!;
  let dmgMul = 1;
  let arc: number | null = null;
  let knockMul = 1;
  let extra = 0;
  const f = fx?.frenzy;
  if (f && w.time < h.frenzyUntil) {
    if (f.damage) dmgMul *= 1 + h.frenzy * f.damage;
    if (h.frenzy >= f.max && f.atMaxArc) {
      arc = f.atMaxArc;
      dmgMul *= f.atMaxDamage ?? 1;
    }
  }
  if (finisher && !jab && fx?.finisherBonus) {
    dmgMul *= fx.finisherBonus.damage ?? 1;
    extra += fx.finisherBonus.extra ?? 0;
    knockMul *= fx.finisherBonus.knock ?? 1;
  }
  if (!jab && w.time < h.empowerUntil) {
    dmgMul *= h.empowerMul;
    h.empowerUntil = 0;
  }
  return { dmgMul, arc, knockMul, extra };
}

/** After a combo swing: finisher projectiles/zones, then per-target talent effects and on-hit sustain. */
export function afterMelee(
  w: World,
  e: Entity,
  targets: Entity[],
  dealt: number,
  finisher: boolean,
  dirX: number,
  dirZ: number,
  reach: number,
  jab: boolean,
): void {
  const fx = abilities(w, e).a.fx;
  const t = e.transform;
  if (fx && finisher && !jab) {
    if (fx.wave) {
      if (fx.wave.style === "rock") e.hero!.crack = { at: w.time, dirX, dirZ };
      fireMissile(w, e, {
        x: t.pos.x + dirX * 0.8,
        z: t.pos.z + dirZ * 0.8,
        y: fx.wave.style === "rock" ? t.y : t.y + 1.2,
        dirX,
        dirZ,
        speed: fx.wave.style === "rock" ? 14 : 20,
        range: fx.wave.length,
        width: fx.wave.width,
        damage: fx.wave.damage * w.damageMulOf(e),
        pierce: true,
        style: fx.wave.style,
        stun: fx.wave.stun,
        endBurst: fx.waveEnd,
      });
    }
    if (fx.bolt) {
      const b = fx.bolt;
      for (let k = 0; k < b.count; k++) {
        const off = b.count > 1 ? (k / (b.count - 1) - 0.5) * 2 * ((b.spread * Math.PI) / 180) : 0;
        const c = Math.cos(off);
        const s = Math.sin(off);
        fireMissile(w, e, {
          x: t.pos.x + dirX * 0.6,
          z: t.pos.z + dirZ * 0.6,
          y: t.y + 1.3,
          dirX: dirX * c - dirZ * s,
          dirZ: dirX * s + dirZ * c,
          speed: 22,
          range: b.range,
          width: 0.7,
          damage: b.damage * w.damageMulOf(e),
          pierce: false,
          style: b.style,
          splash: b.splash,
          splashDamage: (b.splashDamage ?? 0) * w.damageMulOf(e),
          slowMul: b.slowMul,
          slowSeconds: b.slowSeconds,
          chain: b.chain,
        });
      }
    }
    if (fx.finisherZone)
      zoneAt(w, e, t.pos.x + dirX * reach * 0.6, t.pos.z + dirZ * reach * 0.6, fx.finisherZone.radius, fx.finisherZone);
  }
  if (!fx || !targets.length) return;
  const h = e.hero!;
  let ls = fx.lifesteal ?? 0;
  for (const o of targets) {
    if (fx.lifestealVsBleed && w.time < o.status.bleedUntil) ls += fx.lifestealVsBleed / targets.length;
    if (fx.bleed) applyBleed(w, e, o, fx.bleed);
    if (finisher && !jab && fx.finisherStun && o.alive && !o.structure)
      o.status.stunUntil = Math.max(o.status.stunUntil, w.time + fx.finisherStun);
    if (
      finisher &&
      !jab &&
      fx.consumeBleed &&
      o.alive &&
      o.status.bleedStacks >= (fx.bleed?.max ?? 3) &&
      w.time < o.status.bleedUntil
    ) {
      o.status.bleedStacks = 0;
      o.status.bleedUntil = 0;
      const p = o.transform;
      w.emit({ type: "slam", x: p.pos.x, y: p.y, z: p.pos.z, radius: 1.4, team: e.team });
      w.damage(e, o, fx.consumeBleed * w.damageMulOf(e), { big: true, fromX: t.pos.x, fromZ: t.pos.z, knockback: 3 });
    }
  }
  if (ls > 0) heal(w, e, dealt * ls);
  if (fx.frenzy) {
    h.frenzy = Math.min(fx.frenzy.max, (w.time < h.frenzyUntil ? h.frenzy : 0) + 1);
    h.frenzyUntil = w.time + fx.frenzy.seconds;
  }
  if (fx.cdrOnHit) {
    const k = fx.cdrOnHit.slot;
    h.cooldowns[k] = Math.max(w.time, (h.cooldowns[k] ?? 0) - fx.cdrOnHit.seconds);
  }
  if (fx.healAllies) {
    for (const o of w.entities) {
      if (!o.alive || o.team !== e.team || o === e || o.hero) continue;
      if (w.dist(e, o) - o.radius > 5) continue;
      heal(w, o, fx.healAllies * (o.structure ? 2 : 1));
    }
  }
  if (fx.chainAtMax && fx.frenzy && h.frenzy >= fx.frenzy.max)
    chainLightning(w, e, targets[0], fx.chainAtMax.count, fx.chainAtMax.damage * w.damageMulOf(e));
  if (fx.shieldOnHit) addShield(e, fx.shieldOnHit.amount, fx.shieldOnHit.max, fx.shieldOnHit.seconds, w.time);
}

/** After a talent-tagged projectile lands (bolt or orb). */
export function afterShot(w: World, src: Entity, target: Entity, dealt: number, orb: boolean): void {
  if (!src.hero) return;
  const fx = abilities(w, src).a.fx;
  if (!fx) return;
  if (fx.lifesteal) heal(w, src, dealt * fx.lifesteal);
  if (fx.shieldOnHit) addShield(src, fx.shieldOnHit.amount, fx.shieldOnHit.max, fx.shieldOnHit.seconds, w.time);
  if (fx.hexOnHit && !target.structure) {
    target.status.hexUntil = w.time + fx.hexOnHit;
    target.status.hexOwner = src.id;
  }
  if (orb && fx.orbChain) chainLightning(w, src, target, fx.orbChain, dealt * 0.6);
  else if (!orb && fx.chain) chainLightning(w, src, target, fx.chain.count, dealt * fx.chain.mul);
}

/** Kill xp for the killer's hero, then kill talents (resets, shields, meter, stealth, summons). */
export function onKill(w: World, src: Entity | null, target: Entity): void {
  const cfg = w.data.talents?.xp;
  const hero = src?.hero ? src : src?.owner ? w.get(src.owner) : undefined;
  if (cfg && hero)
    gainXp(
      w,
      hero,
      target.hero ? cfg.heroKill : target.structure ? cfg.structureKill : target.neutral ? 80 : cfg.unitKill,
    );
  if (!hero?.hero || hero.team === target.team) return;
  const fx = allFx(w, hero);
  const h = hero.hero;
  if (target.hero) {
    if (fx.resetOnKill) {
      h.cooldowns[fx.resetOnKill] = w.time;
      w.emit({
        type: "callout",
        x: hero.transform.pos.x,
        y: hero.transform.y,
        z: hero.transform.pos.z,
        team: hero.team,
        text: "RESET!",
        owner: hero.id,
      });
    }
    if (fx.takedownShield) addShield(hero, fx.takedownShield, fx.takedownShield, 6, w.time);
    if (fx.meterOnKill) h.meter = Math.max(h.meter, w.data.heroes.baseline.superMax * fx.meterOnKill);
    if (fx.stealthOnKill) {
      hero.status.stealthUntil = w.time + fx.stealthOnKill;
      w.emit({ type: "blink", x: hero.transform.pos.x, y: hero.transform.y, z: hero.transform.pos.z, team: hero.team });
    }
  }
  if (fx.summonOnKill && src === hero && !target.structure && !target.neutral) {
    const p = target.transform.pos;
    const u = spawnUnit(w, hero.team, fx.summonOnKill.type, p.x, p.z, 1);
    if (u) {
      u.expiresAt = w.time + fx.summonOnKill.seconds;
      u.owner = hero.id;
      u.unit!.raised = true;
      w.emit({ type: "telegraph", x: p.x, y: w.groundY(p.x, p.z), z: p.z, radius: 1.4, team: hero.team, seconds: 0.2 });
    }
  }
}

export function onBUse(w: World, e: Entity): void {
  const fx = abilities(w, e).b.fx;
  if (!fx) return;
  if (fx.armorOnUse) {
    e.status.armorMul = fx.armorOnUse.mul;
    e.status.armorUntil = w.time + fx.armorOnUse.seconds;
    if (fx.armorOnUse.cc) e.status.ccImmuneUntil = w.time + fx.armorOnUse.seconds;
  }
}

/** Next B cooldown time; recast talents allow a second cast within the recast window (short lockout). */
export function bCooldown(w: World, e: Entity): number {
  const h = e.hero!;
  const def = abilities(w, e).b;
  const cd = def.cooldown ?? 4;
  if (!def.fx?.recast) return w.time + cd;
  if (h.recastUntil && w.time < h.recastUntil) {
    h.recastUntil = 0;
    return w.time + cd;
  }
  h.recastUntil = w.time + def.fx.recast;
  return w.time + 0.35;
}
