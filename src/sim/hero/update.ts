// Hero controller: runs once per hero per tick from applyPlayerCommand (world/commands.ts). Order of checks:
//   passive ticks -> dead/respawn -> jump arc -> jump-pad charge -> morph channel -> recall -> stun -> cannon
//   aiming -> relic carry -> combo extenders -> input -> ability start -> active action tick (+fire) -> free move.
// Each early return ends the hero's tick; the order is part of the sim contract.
import type { World } from "../world.ts";
import type { Command, Entity, HeroAction } from "../types.ts";
import { abilities, bCooldown, frenzySpeed, onBUse } from "../talents.ts";
import { canRake, trackStill, updatePip } from "./marksman.ts";
import { detonateKegs, kegRocketTick, plentyTick } from "./friar.ts";
import { squareInput, toppleLookout } from "./architect.ts";
import { aim, begin, callout, chaining, ready } from "./common.ts";
import { graveBegin, graveTick } from "./gravewalk.ts";
import { startAbility } from "./start.ts";
import { combo, onWorks } from "./combos.ts";
import { dashHits, endDash, flurryHit } from "./strikes.ts";
import { fire } from "./fire.ts";

type Abilities = ReturnType<typeof abilities>;

export function updateHero(w: World, e: Entity, cmd: Command): void {
  const h = e.hero!;
  const def = w.heroDef(h.type);
  const ab = abilities(w, e);

  if (h.pip) updatePip(w, e);
  if (h.dead) {
    h.grave = undefined;
    if (w.time >= h.respawnAt && !w.teams[e.team]?.out) respawn(w, e);
    return;
  }
  graveTick(w, e, ab.r);
  if (def.hooks.vantageMul) trackStill(w, e);
  if (def.hooks.plentyRadius) plentyTick(w, e);
  if (h.jump) {
    tickJump(w, e);
    return;
  }
  if (tryJumpPad(w, e, cmd)) return;
  // The A held to launch from a jump pad must not fire a (charged) attack when it's finally released.
  if (h.padHold) {
    if (cmd.attack) {
      cmd = { ...cmd, attack: false, charge: undefined };
      h.padHold = false;
    } else if (cmd.charging !== "a") h.padHold = false;
  }
  if (h.morphAt !== undefined) {
    h.vel.x = h.vel.z = 0;
    h.blocking = false;
    return;
  }
  if (tickRecall(w, e, cmd)) return;

  if (w.time < e.status.stunUntil) {
    h.vel.x = h.vel.z = 0;
    h.action = null;
    h.blocking = false;
    return;
  }
  if (h.aim) {
    tickCannonAim(w, e, cmd);
    return;
  }
  // Carrying the relic: block drops it; all attack inputs are disabled (team deathmatch: the carrier fights on).
  if (w.arena.carrying(e) && !w.tdm && cmd.block && !h.blocking) {
    w.arena.drop(e, e.transform.pos.x, e.transform.pos.z);
    cmd = { ...cmd, block: false };
  }
  if (w.arena.carrying(e) && !w.tdm)
    cmd = { ...cmd, attack: false, secondary: false, special: false, super: false, dodge: false, build: undefined };
  if (def.hooks.wrenchDamage) {
    const on = onWorks(w, e);
    if (on && !h.onWorks) callout(w, e, "ON THE RAMP · A THROWS WRENCH");
    h.onWorks = on;
  }
  // Hold-to-charge tracking (A always, B only when ready); charging slows movement below.
  const charging = !h.action && !h.aim ? cmd.charging : undefined;
  if (charging && (charging === "a" || ready(e, "b", w.time))) {
    h.chargeT = h.charging === charging ? (h.chargeT ?? 0) + w.dt : 0;
    h.charging = charging;
  } else {
    h.charging = undefined;
    h.chargeT = 0;
  }
  if (combo(w, e, cmd)) return;

  const act = h.action;
  // A finished combo swing can be chained into the next one before its recovery ends.
  const canChainCombo = act?.name === "a" && act.kind === "combo" && act.fired && w.time < h.comboUntil;
  if (!act || canChainCombo) startFromInput(w, e, cmd, ab, act, canChainCombo);

  // Released charge: scales the power of the action that just started this tick.
  if (
    cmd.charge &&
    h.action &&
    h.action !== act &&
    h.action.t === 0 &&
    (h.action.name === "a" || h.action.name === "b")
  ) {
    h.action.power = 1 + cmd.charge * (h.action.name === "a" ? 0.8 : 0.6);
    if (cmd.charge >= 0.99) callout(w, e, "FULL POWER!");
  }
  if (h.action) {
    tickAction(w, e, ab);
    return;
  }
  freeMove(w, e, cmd);
}

/** Respawn at the team spawn: full hp, brief invulnerability, and cooldowns resumed from when the hero died. */
function respawn(w: World, e: Entity): void {
  const h = e.hero!;
  h.morphAt = undefined;
  if (h.morphed) w.unmorph(e);
  const sp = w.tdm ? w.tdm.respawnSpot(e.team) : w.spawnPoint(e.team);
  w.teleport(e, sp.x, sp.z);
  e.hp = e.maxHp;
  e.alive = true;
  h.dead = false;
  h.vel.x = h.vel.z = 0;
  e.status.invulnUntil = w.time + (w.tdm?.cfg.spawnInvuln ?? 1.5);
  e.status.kvx = e.status.kvz = 0;
  e.status.stunUntil = 0;
  h.recallUsed = false;
  h.recallAt = undefined;
  // Everything comes back ready except the super, which resumes its frozen remaining time (a half-charged super
  // meter is already lost on death).
  const frozen = h.frozenCd ?? {};
  for (const k of Object.keys(h.cooldowns)) h.cooldowns[k as keyof typeof h.cooldowns] = w.time;
  if (frozen.z !== undefined) h.cooldowns.z = w.time + frozen.z;
  h.frozenCd = undefined;
  w.emit({ type: "spawn", id: e.id });
  if (!w.tdm) keepLanding(w, e);
}

/**
 * Keep landing (anti-snowball): coming back while enemy champions stand by our keep, the champion lands heavy and
 * throws them back out of the base, so a team that lost a fight at home gets a breath to regroup - and the
 * attackers have to choose between walking back in or resetting.
 */
function keepLanding(w: World, e: Entity): void {
  const cfg = w.data.match.respawnSlam;
  const core = w.core(e.team);
  if (!cfg || !core) return;
  const cx = core.transform.pos.x;
  const cz = core.transform.pos.z;
  const near = (o: Entity) =>
    w.inBase(e.team, o.transform.pos.x, o.transform.pos.z) ||
    Math.hypot(o.transform.pos.x - cx, o.transform.pos.z - cz) < cfg.radius;
  const foes = w.entities.filter((o) => o.alive && o.hero && !o.hero.dead && o.team !== e.team && near(o));
  if (!foes.length) return;
  const p = e.transform.pos;
  w.emit({ type: "jumppad", stage: "land", pad: -1, id: e.id, x: p.x, y: e.transform.y, z: p.z, windup: 0, dur: 0 });
  w.emit({ type: "notice", team: e.team, text: "KEEP LANDING · INTRUDERS THROWN OUT" });
  // Out through the nearest gate, landing just beyond it.
  const base = w.bases[e.team];
  const W = w.nav.w;
  const gates = base.gates.map((g) => {
    let x = 0;
    let z = 0;
    for (const c of g) {
      x += (c % W) + 0.5;
      z += Math.floor(c / W) + 0.5;
    }
    x /= g.length;
    z /= g.length;
    const ox = x - cx;
    const oz = z - cz;
    const ol = Math.hypot(ox, oz) || 1;
    return { x, z, ux: ox / ol, uz: oz / ol };
  });
  for (const o of foes) {
    if (o.hero!.jump) continue;
    w.damage(e, o, cfg.damage, { slowMul: cfg.slowMul, slowSeconds: cfg.slowSeconds, noFlinch: true });
    if (!o.alive) continue;
    const op = o.transform.pos;
    const order = [...gates].sort(
      (a, b) => Math.hypot(a.x - op.x, a.z - op.z) - Math.hypot(b.x - op.x, b.z - op.z) || a.x - b.x || a.z - b.z,
    );
    let done = false;
    for (const g of order) {
      for (const k of [1, 1.5, 0.6]) {
        const tx = g.x + g.ux * cfg.outside * k;
        const tz = g.z + g.uz * cfg.outside * k;
        if (w.inBase(e.team, tx, tz)) continue;
        if ((done = w.startJump(o, tx, tz, cfg.dur, cfg.peak))) break;
      }
      if (done) break;
    }
  }
  for (const u of w.entities)
    if (u.alive && u.unit && u.team !== e.team && u.team >= 0 && near(u))
      w.damage(e, u, cfg.damage, { knockback: cfg.unitKnockback, fromX: cx, fromZ: cz });
}

/** Scripted jump arc (pad or ability): wait out the wind-up, launch, interpolate x/z, land. */
function tickJump(w: World, e: Entity): void {
  const h = e.hero!;
  const t = e.transform;
  const j = h.jump!;
  h.vel.x = h.vel.z = 0;
  h.blocking = false;
  h.action = null;
  const k = (w.time - j.start) / j.dur;
  if (k < 0) return;
  if (!j.launched) {
    j.launched = true;
    const p = w.jumpPads[j.pad];
    p.launchAt = w.time;
    p.readyAt = w.time + w.jumpCooldown;
    w.emit({
      type: "jumppad",
      stage: "launch",
      pad: j.pad,
      id: e.id,
      x: j.fx,
      y: t.y,
      z: j.fz,
      windup: 0,
      dur: j.dur,
    });
  }
  const f = Math.min(1, k);
  t.pos.x = j.fx + (j.tx - j.fx) * f;
  t.pos.z = j.fz + (j.tz - j.fz) * f;
  t.y = w.groundY(t.pos.x, t.pos.z);
  if (k >= 1) {
    w.teleport(e, j.tx, j.tz);
    h.jump = undefined;
    h.jumpReadyAt = w.time + 1.2;
    e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.3);
    w.emit({ type: "jumppad", stage: "land", pad: j.pad, id: e.id, x: j.tx, y: t.y, z: j.tz, windup: 0, dur: 0 });
    if (j.pad < 0) h.jumpReadyAt = w.time;
  }
}

/**
 * An idle hero standing on a ready jump pad and holding A (cmd.charging "a", so it's never an accident) snaps to
 * it and starts the wind-up (hero.jump with a future start). Flight time and arc height scale with distance.
 * Returns true when a jump started this tick.
 */
function tryJumpPad(w: World, e: Entity, cmd: Command): boolean {
  const h = e.hero!;
  const t = e.transform;
  if (!(
    cmd.charging === "a" &&
    !h.action &&
    w.jumpPads.length &&
    w.time >= (h.jumpReadyAt ?? 0) &&
    !(w.arena.carrying(e) && !w.tdm) &&
    !h.bomb &&
    h.morphAt === undefined
  ))
    return false;
  const i = w.jumpPads.findIndex(
    (p) =>
      w.time >= p.readyAt &&
      w.time - p.chargeAt > w.jumpCharge + 0.05 &&
      Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < 1.1,
  );
  if (i >= 0 && w.mapEvents.sealed(t.pos.x, t.pos.z, w.jumpPads[i].tx, w.jumpPads[i].tz)) {
    w.mapEvents.shutNotice(e);
    return false;
  }
  if (i < 0) return false;
  const p = w.jumpPads[i];
  const d = Math.hypot(p.tx - p.x, p.tz - p.z);
  const windup = w.jumpCharge;
  const dur = Math.min(2.6, Math.max(1.0, 0.5 + d / 22));
  h.jump = { fx: p.x, fz: p.z, tx: p.tx, tz: p.tz, start: w.time + windup, dur, peak: 3.5 + d * 0.14, pad: i };
  p.chargeAt = w.time;
  h.padHold = true;
  w.teleport(e, p.x, p.z);
  e.transform.facing = Math.atan2(p.tx - p.x, p.tz - p.z);
  w.emit({ type: "jumppad", stage: "charge", pad: i, id: e.id, x: p.x, y: t.y, z: p.z, windup, dur });
  return true;
}

/**
 * Recall (once per life): channel recallSeconds, then teleport home. The hero can still walk, slowly
 * (recallWalkMul); any attack/ability/dodge input, new combat, stun or carrying the relic breaks it. Returns true
 * on arrival (the rest of the tick is skipped).
 */
function tickRecall(w: World, e: Entity, cmd: Command): boolean {
  const h = e.hero!;
  const t = e.transform;
  const b = w.data.heroes.baseline;
  if (h.recallAt !== undefined) {
    const busy =
      cmd.attack ||
      cmd.secondary ||
      cmd.special ||
      cmd.super ||
      cmd.dodge ||
      h.combatAt > (h.recallFrom ?? 0) ||
      w.time < e.status.stunUntil ||
      w.arena.carrying(e);
    if (busy) {
      h.recallAt = undefined;
      w.emit({ type: "notice", team: e.team, text: "RECALL BROKEN" });
    } else if (w.time >= h.recallAt) {
      h.recallAt = undefined;
      h.recallUsed = true;
      const sp = w.spawnPoint(e.team);
      w.teleport(e, sp.x, sp.z);
      e.transform.y = w.groundY(sp.x, sp.z);
      h.vel.x = h.vel.z = 0;
      w.emit({ type: "spawn", id: e.id });
      return true;
    } else {
      const st = e.status;
      st.slowMul = Math.min(st.slowUntil > w.time ? st.slowMul : 1, b.recallWalkMul);
      st.slowUntil = Math.max(st.slowUntil, w.time + 0.1);
      return false;
    }
  }
  if (cmd.recall && !h.action && !h.aim && !w.tdm) {
    if (h.recallUsed) w.emit({ type: "notice", team: e.team, text: "RECALL USED · ONCE PER LIFE" });
    else if (!w.arena.carrying(e)) {
      h.recallAt = w.time + b.recallSeconds;
      h.recallFrom = w.time;
      h.blocking = false;
      w.emit({
        type: "callout",
        x: t.pos.x,
        y: t.y,
        z: t.pos.z,
        team: e.team,
        text: `RECALLING · ${b.recallSeconds}S`,
        owner: e.id,
      });
    }
  }
  return false;
}

/** Shop cannon: the stick moves the strike reticle; attack fires, secondary/dodge/timeout cancels. */
function tickCannonAim(w: World, e: Entity, cmd: Command): void {
  const h = e.hero!;
  const sp = w.data.match.arena.shop.cannon;
  const dt = w.dt;
  h.vel.x = h.vel.z = 0;
  h.blocking = false;
  h.aim!.x = Math.max(1, Math.min(w.terrain.width - 1, h.aim!.x + cmd.moveX * sp.aimSpeed * dt));
  h.aim!.z = Math.max(1, Math.min(w.terrain.depth - 1, h.aim!.z + cmd.moveZ * sp.aimSpeed * dt));
  if (cmd.attack) {
    const a = h.aim!;
    h.aim = null;
    w.arena.fireStrike(e, a.x, a.z);
  } else if (cmd.secondary || cmd.dodge || w.time > h.aim!.until) {
    h.aim = null;
    w.emit({ type: "notice", team: e.team, text: "CANNON CANCELLED" });
  }
}

/**
 * Map button input to a new action. Priority: shove (attack+block), dodge, super, R, rake, B, wrench, bomb throw,
 * A jab (A on cooldown), A (combo chain / shot string / single ability). Only one action starts per tick.
 */
function startFromInput(
  w: World,
  e: Entity,
  cmd: Command,
  ab: Abilities,
  act: HeroAction | null,
  canChainCombo: boolean,
): void {
  const h = e.hero!;
  const t = e.transform;
  const b = w.data.heroes.baseline;
  const def = w.heroDef(h.type);
  const sv = b.shove;
  if (cmd.attack && cmd.block && !act && ready(e, "shove", w.time)) {
    const [dx, dz] = aim(w, e, cmd, sv.range + 1);
    begin(e, "shove", "shove", sv.dur, sv.hitAt, dx, dz);
    h.cooldowns.shove = w.time + sv.cooldown;
  } else if (cmd.dodge && ready(e, "dodge", w.time) && !act) {
    const mag = Math.hypot(cmd.moveX, cmd.moveZ);
    const dx = mag > 0.2 ? cmd.moveX / mag : Math.sin(t.facing);
    const dz = mag > 0.2 ? cmd.moveZ / mag : Math.cos(t.facing);
    begin(e, "dodge", "dodge", b.dodgeSeconds, 99, dx, dz);
    e.status.invulnUntil = w.time + b.dodgeSeconds;
    h.cooldowns.dodge = w.time + b.dodgeSeconds + b.dodgeCooldown;
  } else if (cmd.super && h.meter >= b.superMax && !act) {
    startAbility(w, e, "z", cmd);
    h.meter = 0;
    e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + (ab.z.hitAt ?? 0.5));
  } else if (cmd.special && ab.r.kind === "powderkeg" && detonateKegs(w, e)) {
    // Powder keg already out: R blows it now instead of throwing another.
  } else if (cmd.special && ab.r.kind === "lookout" && !act && toppleLookout(w, e)) {
    // Collapse talent: R with a lookout standing topples it.
  } else if (cmd.special && ready(e, "r", w.time) && !act && ab.r.kind === "gravewalk") {
    graveBegin(w, e, cmd, ab.r);
  } else if (cmd.special && ready(e, "r", w.time) && !act) {
    startAbility(w, e, "r", cmd);
    h.cooldowns.r = w.time + (ab.r.cooldown ?? 10);
    if (ab.r.resetB && ab.r.kind !== "warcry") {
      h.cooldowns.b = w.time;
      h.recastUntil = 0;
    }
  } else if (cmd.secondary && !act && canRake(e)) {
    begin(e, "b", "rake", 0.34, 0.12, Math.sin(t.facing), Math.cos(t.facing));
  } else if (cmd.secondary && ready(e, "b", w.time) && !act) {
    startAbility(w, e, "b", cmd);
    onBUse(w, e);
    h.cooldowns.b = bCooldown(w, e);
  } else if (cmd.attack && !act && def.hooks.wrenchDamage && onWorks(w, e) && ready(e, "wrench", w.time)) {
    const [dx, dz] = aim(w, e, cmd, def.hooks.wrenchRange ?? 10);
    begin(e, "a", "wrench", 0.4, 0.16, dx, dz);
    h.cooldowns.wrench = w.time + (def.hooks.wrenchCooldown ?? 1.1);
  } else if (cmd.attack && !act && def.hooks.squareDamage && squareInput(w, e, cmd)) {
    // Architect: charged A throws the square, A while it's out calls it back.
  } else if (cmd.attack && h.bomb && !act) {
    const sh = w.data.match.arena.shop.bomb;
    const [dx, dz] = aim(w, e, cmd, sh.throwRange);
    begin(e, "a", "throw", 0.34, 0.14, dx, dz);
  } else if (cmd.attack && ab.a.kind === "combo" && !act && !chaining(w, e) && !ready(e, "a", w.time)) {
    // Jab: a quicker, weaker first swing while the full combo is on cooldown.
    const hit = ab.a.hits![0];
    const [dx, dz] = aim(w, e, cmd, hit.range + 1.5);
    const j = begin(e, "a", "combo", hit.dur * 0.85, hit.hitAt * 0.85, dx, dz, 0);
    j.jab = true;
    h.comboIndex = 0;
    h.comboUntil = 0;
  } else if (cmd.attack && (!act || canChainCombo) && (chaining(w, e) || ready(e, "a", w.time))) {
    startPrimary(w, e, cmd, ab);
  }
}

/** A: next hit of a melee combo chain, next shot of a shot string, or a plain single-cast ability. */
function startPrimary(w: World, e: Entity, cmd: Command, ab: Abilities): void {
  const h = e.hero!;
  const b = w.data.heroes.baseline;
  if (ab.a.kind === "combo") {
    const hits = ab.a.hits!;
    const idx = chaining(w, e) ? h.comboIndex % hits.length : 0;
    const hit = hits[idx];
    const [dx, dz] = aim(w, e, cmd, hit.range + 1.5);
    const spd = frenzySpeed(w, e);
    begin(e, "a", "combo", hit.dur / spd, hit.hitAt / spd, dx, dz, idx);
    h.comboIndex = idx + 1;
    h.comboUntil = w.time + hit.dur / spd + (ab.a.comboWindow ?? 0.35);
    // Full cooldown after the finisher, half after any other hit.
    const cd = ab.a.comboCooldown ?? b.comboCooldown ?? 0;
    h.cooldowns.a = h.comboUntil + (idx === hits.length - 1 ? cd : cd * 0.5);
  } else if (ab.a.shots) {
    const shots = ab.a.shots;
    const idx = w.time < h.comboUntil ? h.comboIndex % shots.length : 0;
    const sh = shots[idx];
    const [dx, dz] = aim(w, e, cmd, (ab.a.range ?? 9) + 1);
    begin(e, "a", "shoot", sh.dur ?? ab.a.dur ?? 0.4, sh.hitAt ?? ab.a.hitAt ?? 0.15, dx, dz, idx);
    h.comboIndex = idx + 1;
    const end = sh.dur ?? ab.a.dur ?? 0.4;
    h.comboUntil = idx === shots.length - 1 ? 0 : w.time + end + (ab.a.comboWindow ?? 0.5);
    h.cooldowns.a = w.time + end + (idx === shots.length - 1 ? (ab.a.comboCooldown ?? 0.3) : 0);
  } else {
    startAbility(w, e, "a", cmd);
    if (ab.a.cooldown) h.cooldowns.a = w.time + ab.a.cooldown;
  }
}

/**
 * Advance the active action: kind-specific motion while winding up (dodge roll, combo lunge, charge rush, leap
 * arc, dash, flurry hits), fire() once t reaches hitAt, and clear the action when t reaches dur.
 */
function tickAction(w: World, e: Entity, ab: Abilities): void {
  const h = e.hero!;
  const t = e.transform;
  const dt = w.dt;
  const b = w.data.heroes.baseline;
  const a = h.action!;
  a.t += dt;
  h.vel.x = h.vel.z = 0;
  const adef = a.name === "a" || a.name === "b" || a.name === "r" || a.name === "z" ? ab[a.name] : null;
  if (a.kind === "dodge") {
    w.moveBy(e, a.dirX * b.dodgeSpeed * dt, a.dirZ * b.dodgeSpeed * dt);
  } else if (a.kind === "kegrocket") {
    kegRocketTick(w, e, a);
  } else if (a.kind === "combo" && a.t < a.hitAt) {
    const hit = ab.a.hits![a.combo];
    const fin = !a.jab && a.combo === ab.a.hits!.length - 1 ? (ab.a.fx?.finisherBonus?.lunge ?? 1) : 1;
    w.moveBy(e, a.dirX * hit.lunge * fin * dt, a.dirZ * hit.lunge * fin * dt);
  } else if (a.kind === "charge" && a.t < a.hitAt) {
    const ch = ab.b.fx?.charge ?? { range: 5, damage: 45, knockback: 5, stun: 0.6 };
    const range = a.chargeRange ?? ch.range;
    w.moveBy(e, a.dirX * (range / a.hitAt) * dt, a.dirZ * (range / a.hitAt) * dt);
    const ids = a.hitIds ?? (a.hitIds = []);
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.structure || ids.includes(o.id)) continue;
      if (w.dist(e, o) - o.radius > 1.3) continue;
      ids.push(o.id);
      w.damage(e, o, ch.damage * w.damageMulOf(e), { knockback: ch.knockback ?? 5, stun: ch.stun, big: true });
    }
  } else if (a.kind === "quake" && a.t < a.hitAt) {
    w.moveBy(e, a.dirX * 5 * dt, a.dirZ * 5 * dt);
  } else if (a.kind === "leap" && a.toX !== undefined) {
    const f = Math.min(1, a.t / a.hitAt);
    t.pos.x = a.fromX! + (a.toX - a.fromX!) * f;
    t.pos.z = a.fromZ! + (a.toZ! - a.fromZ!) * f;
    t.y = w.groundY(t.pos.x, t.pos.z);
  } else if (a.kind === "dash" && adef) {
    const speed = (adef.range ?? 6) / a.dur;
    w.moveBy(e, a.dirX * speed * dt, a.dirZ * speed * dt);
    dashHits(w, e, a, adef);
  } else if (a.kind === "flurry" && adef) {
    w.moveBy(e, a.dirX * (adef.lunge ?? 1) * dt, a.dirZ * (adef.lunge ?? 1) * dt);
    const n = Math.floor((a.t - a.hitAt) / (adef.interval ?? 0.15)) + 1;
    while (a.t >= a.hitAt && a.combo < Math.min(n, adef.count ?? 5)) {
      a.combo++;
      flurryHit(w, e, a, adef);
    }
  }
  if (!a.fired && a.t >= a.hitAt) {
    a.fired = true;
    if (a.name !== "dodge" && a.name !== "hit") e.status.lastAttackAt = w.time;
    fire(w, e, a);
  }
  if (a.t >= a.dur) {
    if (a.kind !== "dodge" && a.name !== "hit") h.actionEndAt = w.time;
    if (a.name === "b" && a.kind === "dash") endDash(w, e, a);
    h.action = null;
  }
  h.blocking = false;
}

/** A living enemy champion within `r` m. */
function foeNear(w: World, e: Entity, r: number): boolean {
  for (const o of w.entities)
    if (o.alive && o.hero && !o.hero.dead && o.team !== e.team && w.dist(e, o) < r) return true;
  return false;
}

/**
 * No action: home regen when calm, rest regen away from enemies, blocking, and acceleration-limited movement toward the stick direction. If the
 * hero pushes but barely moves for 0.35s, unstick nudges it toward an open cell.
 */
function freeMove(w: World, e: Entity, cmd: Command): void {
  const h = e.hero!;
  const t = e.transform;
  const dt = w.dt;
  const b = w.data.heroes.baseline;
  const pc = w.data.match.pacing;
  if (e.hp < e.maxHp && w.calm(e)) {
    const turf = w.turf(e);
    if (turf === "home" || turf === "tower") e.hp = Math.min(e.maxHp, e.hp + e.maxHp * pc.homeRegenFrac * dt);
    else if (
      w.tdm &&
      pc.restRegenFrac &&
      w.time - h.combatAt >= (pc.restSeconds ?? 5) &&
      !foeNear(w, e, pc.restClear ?? 10)
    )
      // Deathmatch (no home to heal at): out of the fight for a while with no enemy champion close, wounds mend.
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * pc.restRegenFrac * dt);
  }
  h.blocking = !!cmd.block;
  const mul = w.speedMul(e) * (h.blocking ? b.blockMoveMul : 1) * (h.charging ? 0.45 : 1);
  const tx = cmd.moveX * h.speed * mul;
  const tz = cmd.moveZ * h.speed * mul;
  const dvx = tx - h.vel.x;
  const dvz = tz - h.vel.z;
  const dv = Math.hypot(dvx, dvz);
  const maxDv = b.accel * dt;
  if (dv > maxDv) {
    h.vel.x += (dvx / dv) * maxDv;
    h.vel.z += (dvz / dv) * maxDv;
  } else {
    h.vel.x = tx;
    h.vel.z = tz;
  }
  if (h.vel.x !== 0 || h.vel.z !== 0) {
    w.moveBy(e, h.vel.x * dt, h.vel.z * dt);
  }
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const moved = mag > 0 ? ((t.pos.x - t.prevPos.x) * cmd.moveX + (t.pos.z - t.prevPos.z) * cmd.moveZ) / mag : 0;
  if (mag > 0.5 && moved < h.speed * mul * dt * 0.3) h.stuckFor += dt;
  else h.stuckFor = 0;
  if (h.stuckFor > 0.35) unstick(w, e, cmd.moveX / mag, cmd.moveZ / mag);
  if (!h.blocking && Math.hypot(cmd.moveX, cmd.moveZ) > 0.01) w.faceToward(e, cmd.moveX, cmd.moveZ, b.turnRate);
}

/** Step toward the best open cell within 3 cells roughly along the stick direction, avoiding structures. */
function unstick(w: World, e: Entity, ux: number, uz: number): void {
  const t = e.transform;
  const nav = w.nav;
  const cx = Math.floor(t.pos.x);
  const cz = Math.floor(t.pos.z);
  let best = -1;
  let bestScore = Infinity;
  const maxSlope = e.hero!.maxSlope;
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (!dx && !dz) continue;
      const i = nav.index(cx + dx, cz + dz);
      if (i < 0) continue;
      if (!nav.open(i) && !(w.terrain.slopeAt(cx + dx + 0.5, cz + dz + 0.5) <= maxSlope)) continue;
      const d = Math.hypot(dx, dz);
      const along = (dx * ux + dz * uz) / d;
      if (along < 0.2) continue;
      let clear = true;
      for (let k = 1; k <= 4 && clear; k++) {
        const f = k / 4;
        if (
          !Number.isFinite(
            w.terrain.heightAt(t.pos.x + (cx + dx + 0.5 - t.pos.x) * f, t.pos.z + (cz + dz + 0.5 - t.pos.z) * f),
          )
        )
          clear = false;
      }
      if (!clear) continue;
      const mx = cx + dx + 0.5;
      const mz = cz + dz + 0.5;
      if (
        w.entities.some(
          (o) =>
            (o.alive && o.structure && Math.hypot(o.transform.pos.x - mx, o.transform.pos.z - mz) < o.radius + 1) ||
            (o.alive &&
              o.structure &&
              Math.hypot(o.transform.pos.x - (t.pos.x + mx) / 2, o.transform.pos.z - (t.pos.z + mz) / 2) <
                o.radius + 0.5),
        )
      )
        continue;
      const score = d - along * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
  }
  if (best < 0) return;
  const tx = (best % nav.w) + 0.5;
  const tz = Math.floor(best / nav.w) + 0.5;
  const dx = tx - t.pos.x;
  const dz = tz - t.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const step = Math.min(d, e.hero!.speed * 0.8 * w.dt);
  t.pos.x += (dx / d) * step;
  t.pos.z += (dz / d) * step;
  t.y = w.groundY(t.pos.x, t.pos.z);
}
