// Ability "fire" dispatch: called by the hero controller (hero/update.ts) on the tick an action reaches its hitAt.
// Emits the "act fire" event, computes the hero's damage multiplier once, and routes on the action kind to the
// per-kind implementation in hero/kinds/* (or a per-hero module such as marksman.ts / friar.ts).
import type { World } from "../world.ts";
import type { Entity, HeroAction } from "../types.ts";
import { abilities, afterMelee, meleeMods } from "../talents.ts";
import { arcHit, shoveHit, slamAt } from "./strikes.ts";
import { graveArrive } from "./gravewalk.ts";
import { heartseeker, rake, sendPip, volley } from "./marksman.ts";
import { brewfest, throwKeg } from "./friar.ts";
import { crushSlam, fireHeadbutt, firePound, fireSwitch } from "./vintner.ts";
import { fireLeap, fireQuake, fireSlam } from "./kinds/melee.ts";
import { fireBanner, fireRally, fireWarcry } from "./kinds/command.ts";
import { fireBlink, fireHex, fireReach, fireRootcage, fireShoot, fireStealth, fireSummon } from "./kinds/spells.ts";
import {
  fireBallista,
  fireRamp,
  fireRepair,
  fireTrap,
  fireTurret,
  fireWall,
  fireWorks,
  fireZone,
} from "./kinds/builds.ts";

export function fire(w: World, e: Entity, a: HeroAction): void {
  const ab = abilities(w, e);
  const t = e.transform;
  w.emit({
    type: "act",
    src: e.id,
    slot: a.name,
    kind: a.kind,
    phase: "fire",
    x: t.pos.x,
    y: t.y,
    z: t.pos.z,
    dirX: a.dirX,
    dirZ: a.dirZ,
    combo: a.combo,
    toX: a.toX,
    toZ: a.toZ,
  });
  const mul = w.damageMulOf(e);

  // Actions that are not tied to an ability slot's definition (basic combo, combo extenders, shove, shop items).
  if (a.kind === "combo") {
    fireComboHit(w, e, a, mul);
    return;
  }
  if (a.kind === "whirl") {
    // Riposte whirl (duelist combo extender, see hero/combos.ts).
    arcHit(w, e, a.dirX, a.dirZ, 3.4, 360, 65 * mul, 6, true);
    return;
  }
  if (a.kind === "charge") {
    // Talent charge on B (or crack-charge combo): ends in a slam using B's definition.
    const def = ab.b;
    const cx = t.pos.x + a.dirX * 0.8;
    const cz = t.pos.z + a.dirZ * 0.8;
    slamAt(w, e, cx, cz, def.radius ?? 3, def, mul, a.dirX, a.dirZ);
    return;
  }
  if (a.name === "shove") {
    shoveHit(w, e, a);
    return;
  }
  if (a.kind === "wrench") {
    fireWrench(w, e, a);
    return;
  }
  if (a.kind === "throw") {
    fireBombThrow(w, e, a);
    return;
  }
  if (a.name === "dodge" || a.name === "hit") return;
  if (a.kind === "heave") {
    fireHeave(w, e, a, mul);
    return;
  }
  if (a.kind === "pound") {
    firePound(w, e, a, mul);
    return;
  }

  const def = ab[a.name];
  switch (a.kind) {
    // melee
    case "slam":
      return fireSlam(w, e, a, def, mul);
    case "leap":
      return fireLeap(w, e, a, def, mul);
    case "quake":
      return fireQuake(w, e, a, def, mul);
    // command / support
    case "banner":
      return fireBanner(w, e, a, def);
    case "rally":
      return fireRally(w, e, a, def);
    case "warcry":
      return fireWarcry(w, e, a, def);
    // marksman (Wren)
    case "pip":
      return sendPip(w, e, a, def);
    case "rake":
      return rake(w, e);
    case "volley":
      return volley(w, e, a, def, mul);
    case "heartseeker":
      return heartseeker(w, e, a, def, mul);
    // friar
    case "keg":
      return throwKeg(w, e, a, def, "heal", mul);
    case "powderkeg":
      return throwKeg(w, e, a, def, "powder", mul);
    case "brewfest":
      return brewfest(w, e, a, def);
    // vintner (Gristle)
    case "headbutt":
      return fireHeadbutt(w, e, a, def);
    case "switcheroo":
      return fireSwitch(w, e, a, def);
    case "crush":
      return crushSlam(w, e, a, def, 0);
    // spells / mobility
    case "shoot":
      return fireShoot(w, e, a, def, mul);
    case "hex":
      return fireHex(w, e, a, def, mul);
    case "summon":
      return fireSummon(w, e, a, def);
    case "gravewalk":
      return graveArrive(w, e, a, def);
    case "stealth":
      return fireStealth(w, e, a, def);
    case "blink":
      return fireBlink(w, e, a, def);
    case "rootcage":
      return fireRootcage(w, e, a, def, mul);
    case "reach":
      return fireReach(w, e, a, def, mul);
    // builds / terrain
    case "repair":
      return fireRepair(w, e, a, def, mul);
    case "turret":
      return fireTurret(w, e, a, def);
    case "works":
      return fireWorks(w, e, a, def);
    case "ballista":
      return fireBallista(w, e, a, def);
    case "ramp":
      return fireRamp(w, e, a, def);
    case "wall":
      return fireWall(w, e, a, def, mul);
    case "trap":
      return fireTrap(w, e, a, def, mul);
    case "zone":
      return fireZone(w, e, a, def, mul);
    default:
      return;
  }
}

/**
 * One swing of the basic melee combo (or the quick "jab" used while A is on cooldown). Talents adjust arc/damage
 * via meleeMods; charged attacks (`power`) extend range and knockback. The last hit of the chain is the finisher.
 */
function fireComboHit(w: World, e: Entity, a: HeroAction, mul: number): void {
  const ab = abilities(w, e);
  const hit = ab.a.hits![a.combo];
  const fin = !a.jab && a.combo === ab.a.hits!.length - 1;
  const m = meleeMods(w, e, fin, !!a.jab);
  const arc = m.arc ?? hit.arcDeg;
  const dmg = (a.jab ? hit.damage * 0.55 : hit.damage) * mul * m.dmgMul + m.extra;
  const pw = a.power ?? 1;
  const range = hit.range * (1 + (pw - 1) * 0.3);
  const knockback = hit.knockback * (a.jab ? 0.5 : 1) * m.knockMul * pw;
  const big = fin || m.extra > 0 || pw > 1.3;
  const targets = arcHit(w, e, a.dirX, a.dirZ, range, arc, dmg, knockback, big);
  afterMelee(w, e, targets, dmg * targets.length, fin, a.dirX, a.dirZ, hit.range, !!a.jab);
}

/** Engineer standing on his own works: A throws a returning wrench (see hero/boomerangs.ts). */
function fireWrench(w: World, e: Entity, a: HeroAction): void {
  const t = e.transform;
  const hk = w.heroDef(e.hero!.type).hooks;
  w.boomerangs.push({
    id: w.newId(),
    ownerId: e.id,
    team: e.team,
    x: t.pos.x + a.dirX * 0.8,
    z: t.pos.z + a.dirZ * 0.8,
    y: t.y + 1.6,
    dirX: a.dirX,
    dirZ: a.dirZ,
    dist: 0,
    back: false,
    hit: [],
    damage: (hk.wrenchDamage ?? 95) * w.damageMulOf(e),
    range: hk.wrenchRange ?? 10,
  });
  w.emit({ type: "shot", style: "wrench", x: t.pos.x, y: t.y + 1.6, z: t.pos.z });
}

/** Shop bomb: thrown up to throwRange, stopping short at the first enemy structure in the throw line. */
function fireBombThrow(w: World, e: Entity, a: HeroAction): void {
  const t = e.transform;
  const sh = w.data.match.arena.shop.bomb;
  let range = sh.throwRange;
  for (const o of w.entities) {
    if (!o.alive || !o.structure || o.team === e.team || o.neutral) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const along = dx * a.dirX + dz * a.dirZ;
    if (along <= 0 || along > sh.throwRange + o.radius) continue;
    if (Math.abs(dx * a.dirZ - dz * a.dirX) > o.radius + 1) continue;
    range = Math.min(range, Math.max(1, along - o.radius * 0.5));
  }
  w.arena.throwBomb(e, t.pos.x + a.dirX * range, t.pos.z + a.dirZ * range);
}

/** Warlord HEAVE throw: hurl the grabbed (stunned) enemy along the action direction. */
function fireHeave(w: World, e: Entity, a: HeroAction, mul: number): void {
  const o = a.targetId !== undefined ? w.get(a.targetId) : undefined;
  if (!o || !o.alive) return;
  const hk = w.heroDef(e.hero!.type).hooks;
  const t = e.transform;
  const dist = hk.heaveDistance ?? 10;
  const tx = t.pos.x + a.dirX * dist;
  const tz = t.pos.z + a.dirZ * dist;
  const dmg = (hk.heaveDamage ?? 90) * mul;
  const land = () => {
    if (!o.alive) return;
    const p = o.transform.pos;
    w.damage(e, o, dmg, { fromX: p.x, fromZ: p.z, stun: hk.heaveStun ?? 1, big: true });
    w.emit({ type: "slam", x: p.x, y: o.transform.y, z: p.z, radius: 2.2, team: e.team, src: e.id });
    for (const n of w.entities.slice()) {
      if (n === o || !n.alive || n.team === e.team || n.structure) continue;
      if (Math.hypot(n.transform.pos.x - p.x, n.transform.pos.z - p.z) - n.radius > 2.2) continue;
      w.damage(e, n, dmg * 0.5, { fromX: p.x, fromZ: p.z, knockback: 6, big: true });
    }
  };
  if (o.hero && w.startJump(o, tx, tz, 0.7, 3.2)) {
    o.status.stunUntil = Math.max(o.status.stunUntil, w.time + 0.75);
    w.later(0.7, land);
    return;
  }
  w.damage(e, o, dmg, {
    fromX: t.pos.x - a.dirX,
    fromZ: t.pos.z - a.dirZ,
    knockback: 48,
    stun: hk.heaveStun ?? 1,
    big: true,
  });
}
