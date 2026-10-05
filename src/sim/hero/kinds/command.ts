// Command/support ability kinds: banner (team rally point that also extends command auras), rally (heal + cleanse
// + guard, optional cooldown refund) and warcry (team buff, optional challenge taunt / lifesteal aura).
import { refillCharge } from "../common.ts";
import type { World } from "../../world.ts";
import type { Entity, HeroAction } from "../../types.ts";
import type { AbilityDef } from "../../config.ts";
import { pullTo } from "../../talents.ts";

/** Plant the team banner (rally point for units, command aura anchor) at the furthest open spot along the aim. */
export function fireBanner(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const range = a.placed ? Math.hypot(a.toX! - t.pos.x, a.toZ! - t.pos.z) : (def.range ?? 6);
  let bx = t.pos.x + a.dirX * range;
  let bz = t.pos.z + a.dirZ * range;
  for (let k = 0; k <= 12; k++) {
    const f = 1 - k / 12;
    const x = t.pos.x + a.dirX * range * f;
    const z = t.pos.z + a.dirZ * range * f;
    if (w.nav.open(w.nav.index(Math.floor(x), Math.floor(z)))) {
      bx = x;
      bz = z;
      break;
    }
    if (k === 12) {
      bx = t.pos.x;
      bz = t.pos.z;
    }
  }
  const until = w.time + (def.seconds ?? 30);
  w.teams[e.team].banner = { x: bx, z: bz, until };
  w.emit({ type: "banner", team: e.team, x: bx, y: w.groundY(bx, bz), z: bz, until, src: e.id });
  for (const u of w.entities) {
    if (u.unit && u.team === e.team) u.unit.repathAt = 0;
  }
}

/** Heal, cleanse stun/slow and guard nearby allies; supplyCut also shortens allied heroes' B/R cooldowns. */
export function fireRally(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const r = def.radius ?? 9;
  w.emit({ type: "rally", x: t.pos.x, y: t.y, z: t.pos.z, radius: r, team: e.team, src: e.id });
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.kind === "structure") continue;
    if (w.dist(e, o) > r) continue;
    w.heal(o, o.maxHp * (def.healFrac ?? 0.4));
    o.status.stunUntil = 0;
    o.status.slowUntil = 0;
    o.status.guardUntil = w.time + (def.seconds ?? 4);
    o.status.guardMul = def.guardMul ?? 0.7;
    w.emit({ type: "heal", x: o.transform.pos.x, y: o.transform.y, z: o.transform.pos.z, team: e.team, src: e.id });
  }
  if (def.supplyCut) {
    for (const o of w.entities) {
      if (!o.alive || !o.hero || o === e || o.team !== e.team) continue;
      for (const k of ["b", "r"] as const) {
        const ready = o.hero.cooldowns[k] ?? 0;
        if (ready > w.time) o.hero.cooldowns[k] = w.time + (ready - w.time) * (1 - def.supplyCut);
      }
      w.emit({
        type: "heal",
        x: o.transform.pos.x,
        y: o.transform.y,
        z: o.transform.pos.z,
        team: e.team,
        src: e.id,
      });
    }
    w.emit({ type: "notice", team: e.team, text: "RESUPPLIED · COOLDOWNS HALVED" });
  }
}

/** Team damage/speed buff; challenge talent taunts and weakens nearby enemies, lifesteal aura grants leech. */
export function fireWarcry(w: World, e: Entity, a: HeroAction, base: AbilityDef): void {
  // Deathmatch: no army to rouse, so the roar itself does more (shield, cowing, slow - see heroes.json "dm").
  const def = w.tdm && base.dm ? { ...base, ...base.dm } : base;
  const t = e.transform;
  w.emit({
    type: "warcry",
    x: t.pos.x,
    y: t.y,
    z: t.pos.z,
    radius: def.radius ?? 8,
    team: e.team,
    src: e.id,
    style: def.fx?.challenge ? "challenge" : def.fx?.lifestealAura ? "blood" : undefined,
  });
  if (def.resetB) refillCharge(w, e, "b");
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.kind === "structure") continue;
    if (w.dist(e, o) > (def.radius ?? 8)) continue;
    o.status.buffUntil = w.time + (def.seconds ?? 5);
    o.status.buffDamageMul = def.damageMul ?? 1.3;
    o.status.buffSpeedMul = def.speedMul ?? 1.2;
    if (def.fx?.lifestealAura) {
      o.status.stealUntil = w.time + (def.seconds ?? 5);
      o.status.stealMul = def.fx.lifestealAura;
    }
  }
  // The roar itself: the Warlord braces behind a shield, and foes close by flinch - cowed (dealing less) and slowed.
  if (def.shieldFrac) {
    e.status.shield = Math.max(e.status.shield, e.maxHp * def.shieldFrac);
    e.status.shieldUntil = w.time + (def.seconds ?? 5);
  }
  if (def.cowRadius) {
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.structure || o.neutral) continue;
      if (w.dist(e, o) > def.cowRadius + o.radius) continue;
      o.status.cowedUntil = Math.max(o.status.cowedUntil, w.time + (def.cowSeconds ?? 3));
      if (def.slowMul !== undefined) {
        o.status.slowMul = def.slowMul;
        o.status.slowUntil = w.time + (def.slowSeconds ?? 2);
      }
    }
  }
  const ch = def.fx?.challenge;
  if (ch) {
    pullTo(w, e, t.pos.x, t.pos.z, ch.radius, 1.4);
    e.status.armorMul = ch.armor;
    e.status.armorUntil = w.time + ch.seconds;
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.structure || w.dist(e, o) > ch.radius + o.radius) continue;
      o.status.markUntil = w.time + ch.seconds;
      o.status.markTeam = e.team;
      o.status.markOwner = e.id;
      o.status.markMul = 1;
      o.status.markAll = false;
      o.status.markWeaken = ch.weaken;
      o.status.cowedUntil = w.time + ch.seconds;
    }
  }
}
