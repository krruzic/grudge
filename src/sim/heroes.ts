import type { World } from "./world.ts";
import type { AbilityDef } from "./config.ts";
import type { Command, Entity, HeroAction, TerrainMod, UnitType } from "./types.ts";
import { Kind } from "./terrain.ts";
import { spawnUnit } from "./structures.ts";
import { abilities, addShield, afterMelee, bCooldown, fireMissile, frenzySpeed, markTargets, meleeMods, onBUse, pullTo, zoneAt } from "./talents.ts";

type Slot = "a" | "b" | "r" | "z";

function ready(e: Entity, key: string, time: number): boolean {
  return (e.hero!.cooldowns[key] ?? 0) <= time;
}

export function aimTarget(w: World, e: Entity, cmd: Command, reach: number): Entity | null {
  const t = e.transform;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team || !w.canSee(e, o)) continue;
    const d = w.dist(e, o) - o.radius;
    if (d > reach) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const along = mag > 0.3 ? (dx * cmd.moveX + dz * cmd.moveZ) / (len * mag) : reach > 4 ? (dx * Math.sin(t.facing) + dz * Math.cos(t.facing)) / len : 1;
    if (mag > 0.3 && along < 0.3) continue;
    if (mag <= 0.3 && reach > 4 && along < 0.5) continue;
    const score = d + (o.hero ? -1.5 : 0) + (o.structure ? 1 : 0) - along * 2;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  return best;
}

function aim(w: World, e: Entity, cmd: Command, reach: number): [number, number] {
  const t = e.transform;
  const best = aimTarget(w, e, cmd, reach);
  if (best) {
    const dx = best.transform.pos.x - t.pos.x;
    const dz = best.transform.pos.z - t.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    return [dx / len, dz / len];
  }
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  if (mag > 0.3) return [cmd.moveX / mag, cmd.moveZ / mag];
  return [Math.sin(t.facing), Math.cos(t.facing)];
}

function chaining(w: World, e: Entity): boolean {
  const h = e.hero!;
  const hits = abilities(w, e).a.hits;
  return !!hits && w.time < h.comboUntil && h.comboIndex % hits.length !== 0;
}

function begin(e: Entity, name: HeroAction["name"], kind: string, dur: number, hitAt: number, dirX: number, dirZ: number, combo = 0): HeroAction {
  const a: HeroAction = { name, kind, dur, hitAt, combo, t: 0, fired: false, dirX, dirZ };
  e.hero!.action = a;
  e.transform.facing = Math.atan2(dirX, dirZ);
  e.hero!.blocking = false;
  return a;
}

export const PLACEABLE: Record<string, number> = { wall: 9, works: 8, zone: 9, summon: 7, leap: 0, hex: 0, banner: 0, blink: 0, rootcage: 0, turret: 7 };

function placeRange(def: AbilityDef): number | undefined {
  const r = PLACEABLE[def.kind];
  if (r === undefined) return undefined;
  return r || (def.range ?? 8);
}

export function placeRanges(w: World, e: Entity): { facing: number; hx: number; hz: number; b?: number; r?: number; z?: number; spots?: { x: number; z: number }[]; ready: { b: boolean; r: boolean; z: boolean } } {
  const ab = abilities(w, e);
  const h = e.hero!;
  const grave = ab.r.kind === "gravewalk";
  return {
    facing: e.transform.facing,
    hx: e.transform.pos.x,
    hz: e.transform.pos.z,
    b: placeRange(ab.b),
    r: grave ? 999 : placeRange(ab.r),
    z: placeRange(ab.z),
    spots: grave ? graveSpots(w, e).map((s) => ({ x: s.x, z: s.z })) : undefined,
    ready: { b: ready(e, "b", w.time), r: ready(e, "r", w.time) && !(grave && w.arena.carrying(e)), z: h.meter >= w.data.heroes.baseline.superMax },
  };
}

export interface GraveSpot {
  id: number;
  x: number;
  z: number;
  keep: boolean;
}

export function graveSpots(w: World, e: Entity): GraveSpot[] {
  const p = e.transform.pos;
  const near = (abilities(w, e).r.radius ?? 6) + 2;
  const out: GraveSpot[] = [];
  const add = (s: Entity, keep: boolean) => {
    const x = s.transform.pos.x;
    const z = s.transform.pos.z;
    if (Math.hypot(x - p.x, z - p.z) - s.radius < near || w.mapEvents.sealed(p.x, p.z, x, z)) return;
    out.push({ id: s.id, x, z, keep });
  };
  const core = w.core(e.team);
  if (core?.alive) add(core, true);
  for (const pad of w.pads) {
    const s = pad.structureId ? w.get(pad.structureId) : undefined;
    if (!s?.alive || s.team !== e.team || !s.structure?.ready || s.structure.type === "core") continue;
    add(s, false);
  }
  return out;
}

function graveValid(w: World, e: Entity, id: number): Entity | null {
  const s = w.get(id);
  if (!s?.alive || s.team !== e.team || !s.structure) return null;
  if (s.structure.type !== "core" && !s.structure.ready) return null;
  return s;
}

function graveLanding(w: World, e: Entity, s: Entity): { x: number; z: number } {
  if (s.structure!.type === "core") return w.spawnPoint(e.team);
  const sx = s.transform.pos.x;
  const sz = s.transform.pos.z;
  const core = w.core(e.team);
  let dx = (core ? core.transform.pos.x : e.transform.pos.x) - sx;
  let dz = (core ? core.transform.pos.z : e.transform.pos.z) - sz;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d;
  dz /= d;
  const off = s.radius + 1.6;
  const i = w.nav.nearestOpen(sx + dx * off, sz + dz * off, 4);
  if (i < 0) return { x: sx + dx * off, z: sz + dz * off };
  return { x: (i % w.nav.w) + 0.5, z: Math.floor(i / w.nav.w) + 0.5 };
}

function graveBegin(w: World, e: Entity, cmd: Command, def: AbilityDef): void {
  const h = e.hero!;
  const t = e.transform;
  const spots = graveSpots(w, e);
  let pick = spots.find((s) => s.keep);
  if (!cmd.place && !pick && spots.length) {
    w.emit({ type: "notice", team: e.team, text: "ALREADY HOME · HOLD TO PICK A GRAVE" });
    h.cooldowns.r = w.time + 0.5;
    return;
  }
  if (cmd.place) {
    const px = t.pos.x + cmd.place.dx;
    const pz = t.pos.z + cmd.place.dz;
    let bd = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d < bd) { bd = d; pick = s; }
    }
  }
  const s = pick ? graveValid(w, e, pick.id) : null;
  if (!s) {
    w.emit({ type: "notice", team: e.team, text: w.mapEvents.locked ? "NO GRAVE TO WALK TO · GATES SHUT" : "NO GRAVE TO WALK TO" });
    h.cooldowns.r = w.time + 0.5;
    return;
  }
  const land = graveLanding(w, e, s);
  const dx = land.x - t.pos.x;
  const dz = land.z - t.pos.z;
  const dl = Math.hypot(dx, dz) || 1;
  const a = begin(e, "r", "gravewalk", def.dur ?? 1.15, def.hitAt ?? 1, dx / dl, dz / dl);
  a.toX = land.x;
  a.toZ = land.z;
  a.targetId = s.id;
  a.placed = true;
  h.cooldowns.r = w.time + (def.interruptCooldown ?? 5);
  if (def.callout) w.emit({ type: "callout", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, text: def.callout, owner: e.id });
  w.emit({ type: "act", src: e.id, slot: "r", kind: "gravewalk", phase: "start", x: t.pos.x, y: t.y, z: t.pos.z, dirX: a.dirX, dirZ: a.dirZ, combo: 0, toX: land.x, toZ: land.z });
}

function graveArrive(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const h = e.hero!;
  const t = e.transform;
  const s = a.targetId !== undefined ? graveValid(w, e, a.targetId) : null;
  if (!s || a.toX === undefined || w.mapEvents.sealed(t.pos.x, t.pos.z, a.toX, a.toZ!)) {
    w.emit({ type: "notice", team: e.team, text: "THE GRAVE IS GONE" });
    return;
  }
  w.emit({ type: "blink", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, src: e.id });
  w.teleport(e, a.toX, a.toZ!);
  h.vel.x = h.vel.z = 0;
  e.status.kvx = e.status.kvz = 0;
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.4);
  h.cooldowns.r = w.time + (def.cooldown ?? 20);
  const sx = s.transform.pos.x;
  const sz = s.transform.pos.z;
  if (Math.hypot(sx - t.pos.x, sz - t.pos.z) > 0.5) t.facing = t.prevFacing = Math.atan2(t.pos.x - sx, t.pos.z - sz);
  w.emit({ type: "blink", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, src: e.id });
  if (s.structure!.type !== "core") h.grave = { id: s.id, until: Infinity };
  const gb = def.fx?.graveBurst;
  if (gb) {
    const hexSec = w.heroDef(h.type).abilities.b.hexSeconds ?? 6;
    w.emit({ type: "slam", x: t.pos.x, y: t.y, z: t.pos.z, radius: gb.radius, team: e.team, src: e.id });
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.structure) continue;
      if (Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius > gb.radius) continue;
      o.status.hexUntil = w.time + hexSec;
      o.status.hexOwner = e.id;
      w.damage(e, o, gb.damage * w.damageMulOf(e), { fromX: t.pos.x, fromZ: t.pos.z, slowMul: gb.slowMul, slowSeconds: gb.slowSeconds, knockback: 3, big: true });
    }
    if (gb.shield) addShield(e, gb.shield, gb.shield, 6, w.time);
  }
}

function graveTick(w: World, e: Entity, def: AbilityDef): void {
  const h = e.hero!;
  const g = h.grave;
  if (!g) return;
  const s = w.get(g.id);
  if (!s?.alive || s.team !== e.team || !s.structure || def.kind !== "gravewalk") {
    h.grave = undefined;
    return;
  }
  if (Math.hypot(s.transform.pos.x - e.transform.pos.x, s.transform.pos.z - e.transform.pos.z) > (def.radius ?? 6) + s.radius) return;
  const st = s.structure;
  const was = (st.graveUntil ?? 0) > w.time;
  st.graveUntil = w.time + 0.3;
  st.graveMul = def.spawnMul ?? 0.6;
  st.graveHaste = def.towerHaste ?? 1.5;
  st.graveRank = def.fx?.graveRank ?? 0;
  if (!was && st.spawnAt !== undefined && st.spawnAt > w.time) st.spawnAt = Math.min(st.spawnAt, w.time + w.arena.spawnInterval(s));
}

function reachOf(def: AbilityDef): number {
  return def.range ?? def.botRange ?? def.radius ?? 3;
}

function startAbility(w: World, e: Entity, slot: Slot, cmd: Command): void {
  const h = e.hero!;
  const def = abilities(w, e)[slot];
  const [dx, dz] = aim(w, e, cmd, reachOf(def) + (def.fx?.charge?.range ?? 0) + 1);
  if (slot === "b" && def.fx?.charge) {
    const c = begin(e, slot, "charge", 0.62, 0.42, dx, dz);
    c.hitIds = [];
    w.emit({ type: "charge", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team, src: e.id });
    if (def.callout) w.emit({ type: "callout", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team, text: def.callout, owner: e.id });
    return;
  }
  const a = begin(e, slot, def.kind, def.dur ?? 0.5, def.hitAt ?? 0.25, dx, dz);
  a.fromX2 = e.transform.pos.x;
  a.fromZ2 = e.transform.pos.z;
  if (def.callout) w.emit({ type: "callout", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team, text: def.callout, owner: e.id });
  if (def.kind === "leap") {
    const p = e.transform.pos;
    const target = cmd.place ? null : aimTarget(w, e, cmd, (def.range ?? 7) + 1);
    const pd = cmd.place ? Math.min(def.range ?? 7, Math.hypot(cmd.place.dx, cmd.place.dz)) : def.range ?? 7;
    const pdx = cmd.place && pd > 0.3 ? cmd.place.dx / Math.hypot(cmd.place.dx, cmd.place.dz) : dx;
    const pdz = cmd.place && pd > 0.3 ? cmd.place.dz / Math.hypot(cmd.place.dx, cmd.place.dz) : dz;
    let tx = p.x + pdx * pd;
    let tz = p.z + pdz * pd;
    if (target) {
      const d = Math.min(def.range ?? 7, w.dist(e, target) - 0.8);
      tx = p.x + dx * d;
      tz = p.z + dz * d;
    }
    for (let k = 0; k <= 10; k++) {
      const f = 1 - k / 10;
      const x = p.x + (tx - p.x) * f;
      const z = p.z + (tz - p.z) * f;
      if (Number.isFinite(w.terrain.heightAt(x, z)) && w.nav.open(w.nav.index(Math.floor(x), Math.floor(z))) && !w.mapEvents.sealed(p.x, p.z, x, z)) {
        tx = x;
        tz = z;
        break;
      }
      if (k === 10) { tx = p.x; tz = p.z; }
    }
    a.fromX = p.x;
    a.fromZ = p.z;
    a.toX = tx;
    a.toZ = tz;
    e.status.invulnUntil = w.time + a.hitAt * 0.7;
  }
  if (def.kind === "dash") {
    a.hitIds = [];
    e.status.invulnUntil = w.time + a.dur;
  }
  if (cmd.place && slot !== "a" && def.kind !== "leap" && placeRange(def) !== undefined) {
    const rng = placeRange(def)!;
    let px = cmd.place.dx;
    let pz = cmd.place.dz;
    const d = Math.hypot(px, pz);
    if (d > rng) { px *= rng / d; pz *= rng / d; }
    a.placed = true;
    a.toX = Math.max(1, Math.min(w.terrain.width - 1, e.transform.pos.x + px));
    a.toZ = Math.max(1, Math.min(w.terrain.depth - 1, e.transform.pos.z + pz));
    if (d > 0.3) {
      a.dirX = px / d;
      a.dirZ = pz / d;
      e.transform.facing = Math.atan2(a.dirX, a.dirZ);
    }
  }
  w.emit({ type: "act", src: e.id, slot, kind: def.kind, phase: "start", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, dirX: dx, dirZ: dz, combo: 0, toX: a.toX, toZ: a.toZ });
}

export function updateHero(w: World, e: Entity, cmd: Command): void {
  const h = e.hero!;
  const dt = w.dt;
  const b = w.data.heroes.baseline;
  const def = w.heroDef(h.type);
  const ab = abilities(w, e);
  const t = e.transform;

  if (h.dead) {
    h.grave = undefined;
    if (w.time >= h.respawnAt) {
      h.morphAt = undefined;
      if (h.morphed) w.unmorph(e);
      const sp = w.spawnPoint(e.team);
      w.teleport(e, sp.x, sp.z);
      e.hp = e.maxHp;
      e.alive = true;
      h.dead = false;
      h.vel.x = h.vel.z = 0;
      e.status.invulnUntil = w.time + 1.5;
      e.status.kvx = e.status.kvz = 0;
      e.status.stunUntil = 0;
      h.recallUsed = false;
      h.recallAt = undefined;
      const pen = w.data.match.economy.respawnCooldownPenalty ?? 0;
      const frozen = h.frozenCd ?? {};
      for (const k of new Set([...Object.keys(frozen), "b", "r"])) h.cooldowns[k as keyof typeof h.cooldowns] = w.time + (frozen[k] ?? 0) + pen;
      h.frozenCd = undefined;
      w.emit({ type: "spawn", id: e.id });
    }
    return;
  }
  graveTick(w, e, ab.r);
  if (h.jump) {
    const j = h.jump;
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
      w.emit({ type: "jumppad", stage: "launch", pad: j.pad, id: e.id, x: j.fx, y: t.y, z: j.fz, windup: 0, dur: j.dur });
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
    return;
  }
  if (!h.action && w.jumpPads.length && w.time >= (h.jumpReadyAt ?? 0) && !w.arena.carrying(e) && !h.bomb && h.morphAt === undefined) {
    const i = w.jumpPads.findIndex((p) => w.time >= p.readyAt && w.time - p.chargeAt > w.jumpCharge + 0.05 && Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < 1.1);
    if (i >= 0 && w.mapEvents.sealed(t.pos.x, t.pos.z, w.jumpPads[i].tx, w.jumpPads[i].tz)) w.mapEvents.shutNotice(e);
    else if (i >= 0) {
      const p = w.jumpPads[i];
      const d = Math.hypot(p.tx - p.x, p.tz - p.z);
      const windup = w.jumpCharge;
      const dur = Math.min(2.6, Math.max(1.0, 0.5 + d / 22));
      h.jump = { fx: p.x, fz: p.z, tx: p.tx, tz: p.tz, start: w.time + windup, dur, peak: 3.5 + d * 0.14, pad: i };
      p.chargeAt = w.time;
      w.teleport(e, p.x, p.z);
      e.transform.facing = Math.atan2(p.tx - p.x, p.tz - p.z);
      w.emit({ type: "jumppad", stage: "charge", pad: i, id: e.id, x: p.x, y: t.y, z: p.z, windup, dur });
      return;
    }
  }
  if (h.morphAt !== undefined) {
    h.vel.x = h.vel.z = 0;
    h.blocking = false;
    return;
  }
  if (h.recallAt !== undefined) {
    const busy = Math.hypot(cmd.moveX, cmd.moveZ) > 0.3 || cmd.attack || cmd.secondary || cmd.special || cmd.super || cmd.dodge || h.combatAt > (h.recallFrom ?? 0) || w.time < e.status.stunUntil || w.arena.carrying(e);
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
      return;
    } else {
      h.vel.x = h.vel.z = 0;
      return;
    }
  }
  if (cmd.recall && !h.action && !h.aim) {
    if (h.recallUsed) w.emit({ type: "notice", team: e.team, text: "RECALL USED · ONCE PER LIFE" });
    else if (!w.arena.carrying(e)) {
      h.recallAt = w.time + b.recallSeconds;
      h.recallFrom = w.time;
      h.blocking = false;
      w.emit({ type: "callout", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, text: `RECALLING · ${b.recallSeconds}S`, owner: e.id });
    }
  }

  if (w.time < e.status.stunUntil) {
    h.vel.x = h.vel.z = 0;
    h.action = null;
    h.blocking = false;
    return;
  }

  if (h.aim) {
    const sp = w.data.match.arena.shop.cannon;
    h.vel.x = h.vel.z = 0;
    h.blocking = false;
    h.aim.x = Math.max(1, Math.min(w.terrain.width - 1, h.aim.x + cmd.moveX * sp.aimSpeed * dt));
    h.aim.z = Math.max(1, Math.min(w.terrain.depth - 1, h.aim.z + cmd.moveZ * sp.aimSpeed * dt));
    if (cmd.attack) {
      const a = h.aim;
      h.aim = null;
      w.arena.fireStrike(e, a.x, a.z);
    } else if (cmd.secondary || cmd.dodge || w.time > h.aim.until) {
      h.aim = null;
      w.emit({ type: "notice", team: e.team, text: "CANNON CANCELLED" });
    }
    return;
  }
  if (w.arena.carrying(e) && cmd.block && !h.blocking) {
    w.arena.drop(e, t.pos.x, t.pos.z);
    cmd = { ...cmd, block: false };
  }
  if (w.arena.carrying(e)) cmd = { ...cmd, attack: false, secondary: false, special: false, super: false, dodge: false, build: undefined };
  if (def.hooks.wrenchDamage) {
    const on = onWorks(w, e);
    if (on && !h.onWorks) w.emit({ type: "callout", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, text: "ON THE RAMP · A THROWS WRENCH", owner: e.id });
    h.onWorks = on;
  }
  const charging = !h.action && !h.aim ? cmd.charging : undefined;
  if (charging && (charging === "a" || ready(e, "b", w.time))) {
    h.chargeT = h.charging === charging ? (h.chargeT ?? 0) + dt : 0;
    h.charging = charging;
  } else {
    h.charging = undefined;
    h.chargeT = 0;
  }
  if (combo(w, e, cmd)) return;
  const act = h.action;
  const canChainCombo = act?.name === "a" && act.kind === "combo" && act.fired && w.time < h.comboUntil;
  if (!act || canChainCombo) {
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
    } else if (cmd.special && ready(e, "r", w.time) && !act && ab.r.kind === "gravewalk") {
      graveBegin(w, e, cmd, ab.r);
    } else if (cmd.special && ready(e, "r", w.time) && !act) {
      startAbility(w, e, "r", cmd);
      h.cooldowns.r = w.time + (ab.r.cooldown ?? 10);
      if (ab.r.resetB && ab.r.kind !== "warcry") {
        h.cooldowns.b = w.time;
        h.recastUntil = 0;
      }
    } else if (cmd.secondary && ready(e, "b", w.time) && !act) {
      startAbility(w, e, "b", cmd);
      onBUse(w, e);
      h.cooldowns.b = bCooldown(w, e);
    } else if (cmd.attack && !act && def.hooks.wrenchDamage && onWorks(w, e) && ready(e, "wrench", w.time)) {
      const [dx, dz] = aim(w, e, cmd, def.hooks.wrenchRange ?? 10);
      begin(e, "a", "wrench", 0.4, 0.16, dx, dz);
      h.cooldowns.wrench = w.time + (def.hooks.wrenchCooldown ?? 1.1);
    } else if (cmd.attack && h.bomb && !act) {
      const sh = w.data.match.arena.shop.bomb;
      const [dx, dz] = aim(w, e, cmd, sh.throwRange);
      begin(e, "a", "throw", 0.34, 0.14, dx, dz);
    } else if (cmd.attack && ab.a.kind === "combo" && !act && !chaining(w, e) && !ready(e, "a", w.time)) {
      const hit = ab.a.hits![0];
      const [dx, dz] = aim(w, e, cmd, hit.range + 1.5);
      const j = begin(e, "a", "combo", hit.dur * 0.85, hit.hitAt * 0.85, dx, dz, 0);
      j.jab = true;
      h.comboIndex = 0;
      h.comboUntil = 0;
    } else if (cmd.attack && (!act || canChainCombo) && (chaining(w, e) || ready(e, "a", w.time))) {
      if (ab.a.kind === "combo") {
        const hits = ab.a.hits!;
        const idx = chaining(w, e) ? h.comboIndex % hits.length : 0;
        const hit = hits[idx];
        const [dx, dz] = aim(w, e, cmd, hit.range + 1.5);
        const spd = frenzySpeed(w, e);
        begin(e, "a", "combo", hit.dur / spd, hit.hitAt / spd, dx, dz, idx);
        h.comboIndex = idx + 1;
        h.comboUntil = w.time + hit.dur / spd + (ab.a.comboWindow ?? 0.35);
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
        h.cooldowns.a = w.time + end + (idx === shots.length - 1 ? ab.a.comboCooldown ?? 0.3 : 0);
      } else {
        startAbility(w, e, "a", cmd);
        if (ab.a.cooldown) h.cooldowns.a = w.time + ab.a.cooldown;
      }
    }
  }

  if (cmd.charge && h.action && h.action !== act && h.action.t === 0 && (h.action.name === "a" || h.action.name === "b")) {
    h.action.power = 1 + cmd.charge * (h.action.name === "a" ? 0.8 : 0.6);
    if (cmd.charge >= 0.99) w.emit({ type: "callout", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, text: "FULL POWER!", owner: e.id });
  }
  const a = h.action;
  if (a) {
    a.t += dt;
    h.vel.x = h.vel.z = 0;
    const adef = a.name === "a" || a.name === "b" || a.name === "r" || a.name === "z" ? ab[a.name] : null;
    if (a.kind === "dodge") {
      w.moveBy(e, a.dirX * b.dodgeSpeed * dt, a.dirZ * b.dodgeSpeed * dt);
    } else if (a.kind === "combo" && a.t < a.hitAt) {
      const hit = ab.a.hits![a.combo];
      const fin = !a.jab && a.combo === ab.a.hits!.length - 1 ? ab.a.fx?.finisherBonus?.lunge ?? 1 : 1;
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
    return;
  }

  const pc = w.data.match.pacing;
  if (e.hp < e.maxHp && w.calm(e)) {
    const turf = w.turf(e);
    if (turf === "home" || turf === "tower") e.hp = Math.min(e.maxHp, e.hp + e.maxHp * pc.homeRegenFrac * dt);
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

const callout = (w: World, e: Entity, text: string) => w.emit({ type: "callout", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team, text, owner: e.id });

function combo(w: World, e: Entity, cmd: Command): boolean {
  const h = e.hero!;
  const t = e.transform;
  const act = h.action;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const mx = mag > 0.2 ? cmd.moveX / mag : Math.sin(t.facing);
  const mz = mag > 0.2 ? cmd.moveZ / mag : Math.cos(t.facing);
  const ab = abilities(w, e);
  const cr = h.crack;
  if (cr && cmd.secondary && w.time - cr.at < 0.9 && ready(e, "b", w.time) && (!act || act.name === "a")) {
    h.crack = undefined;
    const a = begin(e, "b", "charge", 0.8, 0.6, cr.dirX, cr.dirZ);
    a.chargeRange = 11;
    a.hitIds = [];
    h.cooldowns.b = bCooldown(w, e);
    w.emit({ type: "charge", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, src: e.id });
    callout(w, e, "CRACK CHARGE");
    return true;
  }
  if (act?.kind === "reach" && act.fired && act.toX !== undefined && act.t <= act.dur + 0.1 && cmd.attack && cmd.block && ready(e, "shove", w.time)) {
    const len = Math.hypot(act.toX - t.pos.x, act.toZ! - t.pos.z) + 0.6;
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.structure || o.neutral) continue;
      const dx = o.transform.pos.x - t.pos.x;
      const dz = o.transform.pos.z - t.pos.z;
      const along = dx * act.dirX + dz * act.dirZ;
      if (along < 0 || along - o.radius > len || Math.abs(dx * act.dirZ - dz * act.dirX) > 1.6 + o.radius) continue;
      w.damage(e, o, 35 * w.damageMulOf(e), { fromX: t.pos.x, fromZ: t.pos.z, knockback: 45, stun: 0.5, big: true });
    }
    h.cooldowns.shove = w.time + w.data.heroes.baseline.shove.cooldown;
    w.emit({ type: "slam", x: act.toX, y: t.y, z: act.toZ!, radius: 1.6, team: e.team, src: e.id });
    h.action = null;
    callout(w, e, "ARM SHOVE");
    return true;
  }
  if (cmd.dodge && ready(e, "dodge", w.time) && !act) {
    const dodgeCd = () => (h.cooldowns.dodge = w.time + w.data.heroes.baseline.dodgeSeconds + w.data.heroes.baseline.dodgeCooldown);
    if (ab.r.kind === "works" && onWorks(w, e)) {
      for (let d = 11; d >= 5; d -= 1) {
        if (w.startJump(e, t.pos.x + mx * d, t.pos.z + mz * d, 0.9, 4)) {
          dodgeCd();
          callout(w, e, "RAMP JUMP");
          return true;
        }
      }
    }
    if (ab.b.kind === "hex") {
      let best: Entity | null = null;
      let bd = 10;
      for (const o of w.entities) {
        if (!o.alive || !o.hero || o.team === e.team || o.status.hexOwner !== e.id || w.time >= o.status.hexUntil || w.mapEvents.sealed(t.pos.x, t.pos.z, o.transform.pos.x, o.transform.pos.z)) continue;
        const d = w.dist(e, o);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        const ax = t.pos.x;
        const az = t.pos.z;
        w.emit({ type: "blink", x: ax, y: t.y, z: az, team: e.team, src: e.id });
        w.emit({ type: "blink", x: best.transform.pos.x, y: best.transform.y, z: best.transform.pos.z, team: e.team, src: e.id });
        w.teleport(e, best.transform.pos.x, best.transform.pos.z);
        w.teleport(best, ax, az);
        best.status.stunUntil = Math.max(best.status.stunUntil, w.time + 0.4);
        e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.3);
        dodgeCd();
        callout(w, e, "HEX SWAP");
        return true;
      }
    }
    const bn = w.teams[e.team].banner;
    if (ab.b.kind === "banner" && bn && w.time < bn.until) {
      const dx = bn.x - t.pos.x;
      const dz = bn.z - t.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 3 && d < 13 && (dx * mx + dz * mz) / d > 0.6 && w.startJump(e, bn.x + 1, bn.z, 0.7, 2.5)) {
        dodgeCd();
        callout(w, e, "BANNER VAULT");
        return true;
      }
    }
  }
  if (cmd.attack && h.riposteUntil !== undefined && w.time < h.riposteUntil && (!act || act.kind === "parry")) {
    h.riposteUntil = undefined;
    begin(e, "a", "whirl", 0.45, 0.18, Math.sin(t.facing), Math.cos(t.facing));
    callout(w, e, "RIPOSTE WHIRL");
    return true;
  }
  return false;
}

export function onWorks(w: World, e: Entity): boolean {
  const i = w.terrain.index(Math.floor(e.transform.pos.x), Math.floor(e.transform.pos.z));
  return w.mods.some((m) => m.kind === "works" && m.team === e.team && m.cells.includes(i));
}

export function updateBoomerangs(w: World): void {
  const dt = w.dt;
  for (let i = w.boomerangs.length - 1; i >= 0; i--) {
    const b = w.boomerangs[i];
    const owner = w.get(b.ownerId);
    if (!owner || !owner.alive) {
      w.boomerangs.splice(i, 1);
      continue;
    }
    if (!b.back) {
      const step = 17 * dt;
      const nx = b.x + b.dirX * step;
      const nz = b.z + b.dirZ * step;
      b.dist += step;
      if (b.dist >= b.range || w.losHeight(nx, nz) > b.y + 0.4) {
        b.back = true;
        b.hit = [];
      } else {
        b.x = nx;
        b.z = nz;
      }
    } else {
      const tx = owner.transform.pos.x;
      const tz = owner.transform.pos.z;
      const dx = tx - b.x;
      const dz = tz - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.9) {
        w.boomerangs.splice(i, 1);
        continue;
      }
      const step = Math.min(d, 20 * dt);
      b.x += (dx / d) * step;
      b.z += (dz / d) * step;
      b.y += (owner.transform.y + 1.6 - b.y) * Math.min(1, dt * 6);
    }
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === b.team || b.hit.includes(o.id)) continue;
      if (Math.hypot(o.transform.pos.x - b.x, o.transform.pos.z - b.z) - o.radius > 1.0) continue;
      b.hit.push(o.id);
      const dmg = o.structure ? b.damage * 0.6 : b.damage;
      w.damage(owner, o, dmg, { knockback: 3, fromX: b.x - b.dirX, fromZ: b.z - b.dirZ, big: true, structureDamage: o.structure ? dmg : undefined });
    }
  }
}

function flurryHit(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const last = a.combo === (def.count ?? 5);
  const range = def.range ?? 3;
  const cosArc = Math.cos((((def.arcDeg ?? 150) / 2) * Math.PI) / 180);
  const seen = (a.pinned ??= {});
  let hits = 0;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz);
    if (d - o.radius > range) continue;
    if (d > 0.3 && (dx * a.dirX + dz * a.dirZ) / d < cosArc) continue;
    if (Math.abs(o.transform.y - t.y) > 2.5) continue;
    const prev = seen[o.id];
    if (prev && Math.hypot(o.transform.pos.x - prev[0], o.transform.pos.z - prev[1]) > 0.6) continue;
    if (hits >= maxHits(w, e) && !o.hero) continue;
    hits++;
    const mul = prev ? 1 : 2.5;
    const side = dx * a.dirZ - dz * a.dirX >= 0 ? 1 : -1;
    const kx = a.dirZ * side * 0.8 + a.dirX * 0.35;
    const kz = -a.dirX * side * 0.8 + a.dirZ * 0.35;
    w.damage(e, o, (def.damage ?? 40) * mul * w.damageMulOf(e), { knockback: 5, fromX: o.transform.pos.x - kx, fromZ: o.transform.pos.z - kz, canMiss: true, big: last, vsStunnedMul: def.vsStunnedMul });
    seen[o.id] = [o.transform.pos.x, o.transform.pos.z];
  }
}

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
        if (!Number.isFinite(w.terrain.heightAt(t.pos.x + (cx + dx + 0.5 - t.pos.x) * f, t.pos.z + (cz + dz + 0.5 - t.pos.z) * f))) clear = false;
      }
      if (!clear) continue;
      const mx = cx + dx + 0.5;
      const mz = cz + dz + 0.5;
      if (w.entities.some((o) => o.alive && o.structure && Math.hypot(o.transform.pos.x - mx, o.transform.pos.z - mz) < o.radius + 1 || (o.alive && o.structure && Math.hypot(o.transform.pos.x - (t.pos.x + mx) / 2, o.transform.pos.z - (t.pos.z + mz) / 2) < o.radius + 0.5))) continue;
      const score = d - along * 1.5;
      if (score < bestScore) { bestScore = score; best = i; }
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

function arcHit(w: World, e: Entity, dirX: number, dirZ: number, range: number, arcDeg: number, damage: number, knockback: number, big: boolean, vsStunnedMul?: number): Entity[] {
  const out: Entity[] = [];
  const cands: [Entity, number][] = [];
  const t = e.transform;
  const cosArc = Math.cos(((arcDeg / 2) * Math.PI) / 180);
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz);
    if (d - o.radius > range) continue;
    if (d > 0.3 && (dx * dirX + dz * dirZ) / d < cosArc) continue;
    if (Math.abs(o.transform.y - t.y) > 2.5) continue;
    cands.push([o, d]);
  }
  cands.sort((a, b) => (b[0].hero ? 1 : 0) - (a[0].hero ? 1 : 0) || a[1] - b[1]);
  for (const [o] of cands.slice(0, maxHits(w, e))) if (w.damage(e, o, damage, { knockback, canMiss: true, big, vsStunnedMul })) out.push(o);
  return out;
}

function maxHits(w: World, e: Entity): number {
  return e.hero ? w.heroDef(e.hero.type).hooks.maxHits ?? Infinity : Infinity;
}

function shoveHit(w: World, e: Entity, a: HeroAction): void {
  const sv = w.data.heroes.baseline.shove;
  const t = e.transform;
  const cosArc = Math.cos(((sv.arcDeg / 2) * Math.PI) / 180);
  let any = false;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.structure) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const d = Math.hypot(dx, dz);
    if (d - o.radius > sv.range) continue;
    if (d > 0.3 && (dx * a.dirX + dz * a.dirZ) / d < cosArc) continue;
    if (Math.abs(o.transform.y - t.y) > 2) continue;
    if (o.hero) o.hero.blocking = false;
    const heavy = o.neutral ? 0.35 : 1;
    w.damage(e, o, sv.damage * w.damageMulOf(e), { knockback: sv.knockback * heavy, fromX: t.pos.x - a.dirX, fromZ: t.pos.z - a.dirZ, stun: sv.stun * heavy, big: true });
    any = true;
  }
  w.emit({ type: "shove", x: t.pos.x + a.dirX, y: t.y, z: t.pos.z + a.dirZ, team: any ? e.team : -1, src: e.id });
}

function dashHits(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const ids = a.hitIds ?? (a.hitIds = []);
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || ids.includes(o.id)) continue;
    if (w.dist(e, o) - o.radius > (def.width ?? 1.2)) continue;
    if (ids.length >= maxHits(w, e) && !o.hero) continue;
    ids.push(o.id);
    const hit = w.damage(e, o, (def.damage ?? 60) * w.damageMulOf(e), {
      knockback: def.knockback ?? 3, structureDamage: def.structureDamage !== undefined ? def.structureDamage * w.damageMulOf(e) : undefined, big: true,
      executeBelow: def.executeBelow, executeMul: def.executeMul,
    });
    if (hit && a.name === "b") markTargets(w, e, [o]);
  }
}

function slamAt(w: World, e: Entity, cx: number, cz: number, radius: number, def: AbilityDef, mul: number, dirX: number, dirZ: number): void {
  const fx = def.fx;
  const once = (x: number, z: number, scale: number) => {
    if (fx?.pull) pullTo(w, e, x, z, radius + 1.5);
    w.emit({ type: "slam", x, y: w.groundY(x, z), z, radius, team: e.team, src: e.id });
    aoe(w, e, x, z, radius, def, mul * scale);
  };
  once(cx, cz, 1);
  if (fx?.zoneAfter) zoneAt(w, e, cx, cz, radius, fx.zoneAfter);
  const ec = fx?.echo;
  if (ec) {
    for (let k = 1; k <= ec.count; k++) {
      const x = cx + dirX * (ec.step ?? 0) * k;
      const z = cz + dirZ * (ec.step ?? 0) * k;
      w.later(ec.delay * k, () => { if (e.alive) once(x, z, ec.scale); });
    }
  }
}

function aoe(w: World, e: Entity, cx: number, cz: number, radius: number, def: AbilityDef, mul: number): Entity[] {
  const out: Entity[] = [];
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    const d = Math.hypot(o.transform.pos.x - cx, o.transform.pos.z - cz);
    if (d - o.radius > radius) continue;
    const impaired = w.time < o.status.stunUntil || (w.time < o.status.slowUntil && o.status.slowMul < 1);
    const stun = def.stunSeconds ? def.stunSeconds + (impaired ? def.stunBonus ?? 0 : 0) : undefined;
    const hit = w.damage(e, o, (def.damage ?? 50) * mul, {
      knockback: def.knockback, fromX: cx, fromZ: cz, slowMul: def.slowMul, slowSeconds: def.slowSeconds, stun,
      structureDamage: def.structureDamage !== undefined ? def.structureDamage * mul : undefined, canMiss: def.kind === "slam", big: true,
      vsSlowedMul: def.vsSlowedMul,
    });
    if (hit && def.cowSeconds && o.kind !== "structure") o.status.cowedUntil = w.time + def.cowSeconds;
    if (hit) out.push(o);
  }
  return out;
}

function hexLand(w: World, e: Entity, x: number, z: number, def: AbilityDef, mul: number): void {
  const fx = def.fx;
  const r = def.radius ?? 2.5;
  if (fx?.pull) pullTo(w, e, x, z, r + 2);
  w.emit({ type: "slam", x, y: w.groundY(x, z), z, radius: r, team: e.team, src: e.id });
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > r) continue;
    if (def.hexSeconds && o.kind !== "structure") {
      o.status.hexUntil = w.time + def.hexSeconds;
      o.status.hexOwner = e.id;
    }
    w.damage(e, o, (def.damage ?? 80) * mul, { fromX: x, fromZ: z, slowMul: def.slowMul, slowSeconds: def.slowSeconds, stun: def.stunSeconds, knockback: fx?.pull ? 0 : 2, big: true });
  }
  if (fx?.zoneAfter) zoneAt(w, e, x, z, r, fx.zoneAfter);
  if (fx?.summon) {
    for (let k = 0; k < fx.summon.count; k++) {
      const u = spawnUnit(w, e.team, fx.summon.type, x + (k - 0.5) * 0.8, z, 1);
      if (u) {
        u.expiresAt = w.time + fx.summon.seconds;
        u.owner = e.id;
        u.unit!.raised = true;
      }
    }
  }
}

function dashLine(w: World, e: Entity, fx0: number, fz0: number, fx1: number, fz1: number, def: AbilityDef, mul: number): void {
  const dx = fx1 - fx0;
  const dz = fz1 - fz0;
  const len = Math.hypot(dx, dz) || 1;
  const hit: Entity[] = [];
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    const ox = o.transform.pos.x - fx0;
    const oz = o.transform.pos.z - fz0;
    const along = Math.max(0, Math.min(len, (ox * dx + oz * dz) / len));
    const px = fx0 + (dx / len) * along;
    const pz = fz0 + (dz / len) * along;
    if (Math.hypot(o.transform.pos.x - px, o.transform.pos.z - pz) - o.radius > (def.width ?? 1.2)) continue;
    if (w.damage(e, o, (def.damage ?? 60) * mul, { knockback: def.knockback ?? 3, big: true, executeBelow: def.executeBelow, executeMul: def.executeMul, fromX: px - dx / len, fromZ: pz - dz / len })) hit.push(o);
  }
  markTargets(w, e, hit);
}

function endDash(w: World, e: Entity, a: HeroAction): void {
  const def = abilities(w, e).b;
  const fx = def.fx;
  const h = e.hero!;
  if (fx?.empowerNextA) {
    h.empowerMul = fx.empowerNextA;
    h.empowerUntil = w.time + 3;
    w.emit({ type: "callout", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team, text: "EMPOWERED", owner: e.id });
  }
  if (fx?.afterimage && a.fromX2 !== undefined) {
    const x0 = a.fromX2;
    const z0 = a.fromZ2!;
    const x1 = e.transform.pos.x;
    const z1 = e.transform.pos.z;
    const mul = w.damageMulOf(e);
    w.later(fx.afterimage, () => {
      if (!e.alive) return;
      w.emit({ type: "reach", x: x0, y: w.groundY(x0, z0), z: z0, tx: x1, tz: z1, team: e.team, hit: false, style: "afterimage", src: e.id });
      dashLine(w, e, x0, z0, x1, z1, def, mul);
    });
  }
}

function fire(w: World, e: Entity, a: HeroAction): void {
  const ab = abilities(w, e);
  const t = e.transform;
  w.emit({ type: "act", src: e.id, slot: a.name, kind: a.kind, phase: "fire", x: t.pos.x, y: t.y, z: t.pos.z, dirX: a.dirX, dirZ: a.dirZ, combo: a.combo, toX: a.toX, toZ: a.toZ });
  const mul = w.damageMulOf(e);
  if (a.kind === "combo") {
    const hit = ab.a.hits![a.combo];
    const fin = !a.jab && a.combo === ab.a.hits!.length - 1;
    const m = meleeMods(w, e, fin, !!a.jab);
    const arc = m.arc ?? hit.arcDeg;
    const dmg = (a.jab ? hit.damage * 0.55 : hit.damage) * mul * m.dmgMul + m.extra;
    const pw = a.power ?? 1;
    const targets = arcHit(w, e, a.dirX, a.dirZ, hit.range * (1 + (pw - 1) * 0.3), arc, dmg, hit.knockback * (a.jab ? 0.5 : 1) * m.knockMul * pw, fin || m.extra > 0 || pw > 1.3);
    afterMelee(w, e, targets, dmg * targets.length, fin, a.dirX, a.dirZ, hit.range, !!a.jab);
    return;
  }
  if (a.kind === "whirl") {
    arcHit(w, e, a.dirX, a.dirZ, 3.4, 360, 65 * mul, 6, true);
    return;
  }
  if (a.kind === "charge") {
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
    const hk = w.heroDef(e.hero!.type).hooks;
    w.boomerangs.push({
      id: w.newId(), ownerId: e.id, team: e.team, x: t.pos.x + a.dirX * 0.8, z: t.pos.z + a.dirZ * 0.8, y: t.y + 1.6, dirX: a.dirX, dirZ: a.dirZ,
      dist: 0, back: false, hit: [], damage: (hk.wrenchDamage ?? 95) * w.damageMulOf(e), range: hk.wrenchRange ?? 10,
    });
    w.emit({ type: "shot", style: "wrench", x: t.pos.x, y: t.y + 1.6, z: t.pos.z });
    return;
  }
  if (a.kind === "throw") {
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
    return;
  }
  if (a.name === "dodge" || a.name === "hit") return;
  const def = ab[a.name];
  switch (a.kind) {
    case "slam": {
      const cx = t.pos.x + a.dirX * (def.offset ?? 1);
      const cz = t.pos.z + a.dirZ * (def.offset ?? 1);
      slamAt(w, e, cx, cz, def.radius ?? 3, def, mul, a.dirX, a.dirZ);
      return;
    }
    case "leap": {
      const r = def.radius ?? 5;
      if (def.fx?.pull) pullTo(w, e, t.pos.x, t.pos.z, r + 1.5);
      w.emit({ type: "slam", x: t.pos.x, y: t.y, z: t.pos.z, radius: r, team: e.team, src: e.id });
      const hit = aoe(w, e, t.pos.x, t.pos.z, r, def, mul);
      if (a.name === "b") {
        markTargets(w, e, hit);
        if (def.fx?.zoneAfter) zoneAt(w, e, t.pos.x, t.pos.z, r, def.fx.zoneAfter);
        if (def.fx?.landShield) addShield(e, def.fx.landShield, def.fx.landShield, 5, w.time);
      }
      return;
    }
    case "quake": {
      w.emit({ type: "slam", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.radius ?? 5, team: e.team, src: e.id });
      aoe(w, e, t.pos.x, t.pos.z, def.radius ?? 5, def, mul);
      if (def.fx?.zoneAfter) zoneAt(w, e, t.pos.x, t.pos.z, def.radius ?? 5, def.fx.zoneAfter);
      return;
    }
    case "banner": {
      const range = a.placed ? Math.hypot(a.toX! - t.pos.x, a.toZ! - t.pos.z) : def.range ?? 6;
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
        if (k === 12) { bx = t.pos.x; bz = t.pos.z; }
      }
      const until = w.time + (def.seconds ?? 30);
      w.teams[e.team].banner = { x: bx, z: bz, until };
      w.emit({ type: "banner", team: e.team, x: bx, y: w.groundY(bx, bz), z: bz, until, src: e.id });
      for (const u of w.entities) {
        if (u.unit && u.team === e.team) u.unit.repathAt = 0;
      }
      return;
    }
    case "rally": {
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
          w.emit({ type: "heal", x: o.transform.pos.x, y: o.transform.y, z: o.transform.pos.z, team: e.team, src: e.id });
        }
        w.emit({ type: "notice", team: e.team, text: "RESUPPLIED · COOLDOWNS HALVED" });
      }
      return;
    }
    case "warcry": {
      w.emit({ type: "warcry", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.radius ?? 8, team: e.team, src: e.id, style: def.fx?.challenge ? "challenge" : def.fx?.lifestealAura ? "blood" : undefined });
      if (def.resetB) e.hero!.cooldowns.b = w.time;
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
      return;
    }
    case "shoot": {
      const target = aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, def.range ?? 8);
      const sh = a.name === "a" && def.shots ? def.shots[a.combo] : undefined;
      const dmg = (sh?.damage ?? def.damage ?? 30) * mul;
      const splash = sh?.splash ? { radius: sh.splash, damage: (sh.splashDamage ?? 30) * mul, slowMul: sh.slowMul ?? 1, slowSeconds: sh.slowSeconds ?? 0 } : undefined;
      const style = splash ? "orb" : "magic";
      const speed = (def.speed ?? 15) * (splash ? 0.8 : 1);
      if (target) {
        w.fireProjectile(e, target, dmg, speed, false, style, 1.6, true, splash);
        if (sh) w.projectiles[w.projectiles.length - 1].talent = splash ? "orb" : "bolt";
      }
      else w.fireAtPoint(e, t.pos.x + a.dirX * (def.range ?? 8), t.pos.z + a.dirZ * (def.range ?? 8), speed, style, 1.6, splash);
      return;
    }
    case "hex": {
      const target = a.placed ? null : aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, def.range ?? 8);
      const range = def.range ?? 8;
      const x = a.placed ? a.toX! : target ? target.transform.pos.x : t.pos.x + a.dirX * range * 0.7;
      const z = a.placed ? a.toZ! : target ? target.transform.pos.z : t.pos.z + a.dirZ * range * 0.7;
      const delay = def.delay ?? 0.8;
      const ec = def.fx?.echo;
      const n = 1 + (ec?.count ?? 0);
      for (let k = 0; k < n; k++) {
        const hx = x + a.dirX * (ec?.step ?? 0) * k;
        const hz = z + a.dirZ * (ec?.step ?? 0) * k;
        const at = delay + (ec?.delay ?? 0) * k;
        const scale = k === 0 ? 1 : ec?.scale ?? 1;
        w.emit({ type: "telegraph", x: hx, y: w.groundY(hx, hz), z: hz, radius: def.radius ?? 2.5, team: e.team, seconds: at, src: e.id });
        w.later(at, () => { if (e.alive) hexLand(w, e, hx, hz, def, mul * scale); });
      }
      return;
    }
    case "summon": {
      const units = def.units ?? {};
      let k = 0;
      for (const [type, n] of Object.entries(units) as [UnitType, number][]) {
        for (let i = 0; i < n; i++) {
          const ang = k++ * 2.1 + t.facing;
          const sx = a.placed ? a.toX! : t.pos.x;
          const sz = a.placed ? a.toZ! : t.pos.z;
          const u = spawnUnit(w, e.team, type, sx + Math.sin(ang) * 2, sz + Math.cos(ang) * 2, 1);
          if (u) {
            u.expiresAt = w.time + (def.seconds ?? 20);
            u.owner = e.id;
          }
        }
      }
      w.emit({ type: "telegraph", x: a.placed ? a.toX! : t.pos.x, y: a.placed ? w.groundY(a.toX!, a.toZ!) : t.y, z: a.placed ? a.toZ! : t.pos.z, radius: 3, team: e.team, seconds: 0.35, src: e.id });
      if (def.hexRadius) {
        const hexSec = w.heroDef(e.hero!.type).abilities.b.hexSeconds ?? 6;
        w.emit({ type: "telegraph", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.hexRadius, team: e.team, seconds: 0.5, src: e.id });
        for (const o of w.entities) {
          if (!o.alive || o.team === e.team || o.kind === "structure" || w.dist(e, o) > def.hexRadius) continue;
          o.status.hexUntil = w.time + hexSec;
          o.status.hexOwner = e.id;
        }
      }
      return;
    }
    case "gravewalk": {
      graveArrive(w, e, a, def);
      return;
    }
    case "stealth": {
      e.status.stealthUntil = w.time + (def.seconds ?? 4);
      e.status.ambushMul = def.ambushMul ?? 2;
      e.status.buffUntil = w.time + (def.seconds ?? 4);
      e.status.buffSpeedMul = def.speedMul ?? 1.3;
      e.status.buffDamageMul = 1;
      w.emit({ type: "blink", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, src: e.id });
      if (def.fx?.zoneAfter) zoneAt(w, e, t.pos.x, t.pos.z, def.fx.zoneAfter.radius ?? 3, def.fx.zoneAfter);
      return;
    }
    case "blink": {
      const range = def.range ?? 6;
      const pl = a.placed ? Math.hypot(a.toX! - t.pos.x, a.toZ! - t.pos.z) : range;
      const d = Math.min(range, pl);
      w.emit({ type: "blink", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, src: e.id });
      let bx = t.pos.x;
      let bz = t.pos.z;
      for (let k = 0; k <= 12; k++) {
        const f = 1 - k / 12;
        const x = t.pos.x + a.dirX * d * f;
        const z = t.pos.z + a.dirZ * d * f;
        if (Number.isFinite(w.terrain.heightAt(x, z)) && w.nav.open(w.nav.index(Math.floor(x), Math.floor(z))) && !w.mapEvents.sealed(t.pos.x, t.pos.z, x, z)) {
          bx = x;
          bz = z;
          break;
        }
      }
      w.emit({ type: "reach", x: t.pos.x, y: t.y, z: t.pos.z, tx: bx, tz: bz, team: e.team, hit: false, style: "afterimage", src: e.id });
      w.teleport(e, bx, bz);
      e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.35);
      if (def.seconds) {
        e.status.stealthUntil = w.time + def.seconds;
        e.status.ambushMul = def.ambushMul ?? 1.5;
      }
      if (def.fx?.empowerNextA) {
        e.hero!.empowerMul = def.fx.empowerNextA;
        e.hero!.empowerUntil = w.time + 3;
      }
      w.emit({ type: "blink", x: bx, y: w.groundY(bx, bz), z: bz, team: e.team, src: e.id });
      return;
    }
    case "rootcage": {
      const range = def.range ?? 9;
      const target = a.placed ? null : aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, range);
      const x = a.placed ? a.toX! : target ? target.transform.pos.x : t.pos.x + a.dirX * range * 0.6;
      const z = a.placed ? a.toZ! : target ? target.transform.pos.z : t.pos.z + a.dirZ * range * 0.6;
      const r = def.radius ?? 2.4;
      w.emit({ type: "telegraph", x, y: w.groundY(x, z), z, radius: r, team: e.team, seconds: def.delay ?? 0.5, src: e.id, style: "roots" });
      w.later(def.delay ?? 0.5, () => {
        if (!e.alive) return;
        w.emit({ type: "slam", x, y: w.groundY(x, z), z, radius: r * 1.5, team: e.team, src: e.id, trap: true });
        for (const o of w.entities.slice()) {
          if (!o.alive || o.team === e.team || o.structure) continue;
          if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > r) continue;
          w.damage(e, o, (def.damage ?? 60) * mul, { stun: def.stunSeconds ?? 1.4, fromX: x, fromZ: z, knockback: 0, big: true });
        }
      });
      return;
    }
    case "repair": {
      const hk = w.heroDef(e.hero!.type).hooks;
      const fixed: { x: number; y: number; z: number; amount: number; h: number }[] = [];
      const fx = def.fx;
      const r = def.radius ?? 6;
      if (fx?.pull) pullTo(w, e, t.pos.x, t.pos.z, r + 1);
      for (const o of w.entities.slice()) {
        if (!o.alive || w.dist(e, o) - o.radius > r) continue;
        if (o.team === e.team && o.structure) {
          const before = o.hp;
          w.heal(o, def.heal ?? 200);
          fixed.push({ x: o.transform.pos.x, y: o.transform.y, z: o.transform.pos.z, amount: Math.round(o.hp - before), h: o.structure.type === "core" ? 4.5 : 3.6 });
          if (fx?.structShield) addShield(o, fx.structShield.amount, fx.structShield.amount, fx.structShield.seconds, w.time);
          if (fx?.towerHaste && o.structure.type !== "core") {
            o.structure.hasteMul = fx.towerHaste.mul;
            o.structure.hasteUntil = w.time + fx.towerHaste.seconds;
          }
        } else if (o.team === e.team && fx?.allyShield) {
          addShield(o, fx.allyShield, fx.allyShield, 6, w.time);
        }
        if (o.team === e.team && o !== e && !o.structure && hk.overhaulHeal) {
          w.heal(o, o.hero ? hk.overhaulHeal * 0.5 : hk.overhaulHeal);
          if (o.unit) {
            o.status.buffUntil = w.time + (hk.overhaulSeconds ?? 6);
            o.status.buffDamageMul = Math.max(o.status.buffUntil > w.time ? o.status.buffDamageMul : 1, hk.overhaulDamage ?? 1.25);
            o.status.buffSpeedMul = Math.max(1, o.status.buffSpeedMul || 1);
          }
        } else if (o.team !== e.team && o.kind !== "structure") {
          w.damage(e, o, (def.damage ?? 30) * mul, { knockback: fx?.pull ? 0.5 : 3, stun: def.stunSeconds, big: !!def.stunSeconds });
        }
      }
      if (fx?.zoneAfter) zoneAt(w, e, t.pos.x, t.pos.z, r, fx.zoneAfter);
      if (fx?.extendWalls) {
        for (const m of w.mods) {
          if (m.kind !== "wall" || m.owner !== e.id) continue;
          m.until += fx.extendWalls;
          fixed.push({ x: (m.cells[0] % w.terrain.width) + 0.5, y: t.y, z: Math.floor(m.cells[0] / w.terrain.width) + 0.5, amount: 0, h: 2.4 });
        }
      }
      w.emit({ type: "repair", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, radius: def.radius ?? 6, fixed, src: e.id });
      if (!fixed.length) w.emit({ type: "notice", team: e.team, text: "NOTHING TO REPAIR IN REACH" });
      return;
    }
    case "turret": {
      const x = a.placed ? a.toX! : t.pos.x + a.dirX * 1.6;
      const z = a.placed ? a.toZ! : t.pos.z + a.dirZ * 1.6;
      const i = w.nav.nearestOpen(x, z, 3);
      if (i < 0) return;
      const sx = (i % w.nav.w) + 0.5;
      const sz = Math.floor(i / w.nav.w) + 0.5;
      const s = w.addEntity(e.team, "structure", 0.8, sx, sz, def.hp ?? 400);
      s.structure = {
        type: "damage", padIndex: -1, level: 1, builtAt: w.time, ready: true, nextAction: w.time + 0.3,
        range: def.range ?? 8, damage: def.damage ?? 40, lastFireAt: -99, shielded: false,
      };
      s.expiresAt = w.time + (def.seconds ?? 20);
      s.owner = e.id;
      if (def.fx?.tesla) s.structure.tesla = true;
      w.nav.setBlocked(sx, sz, 0.8, true);
      w.emit({ type: "build", id: s.id, padIndex: -1, team: e.team, upgrade: false });
      return;
    }
    case "works": {
      const tr = w.terrain;
      const size = def.size ?? 2;
      const lo = -Math.floor((size - 1) / 2);
      const hi = lo + size - 1;
      const half = size / 2;
      const rampLen = def.length ?? 5;
      const blockedCell = (i: number): boolean => {
        const k = tr.kinds[i];
        if (k !== Kind.Ground && k !== Kind.Water && k !== Kind.Ford) return true;
        const x = (i % tr.width) + 0.5;
        const z = Math.floor(i / tr.width) + 0.5;
        return w.entities.some((o) => o.alive && o.structure && Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) < o.radius + 0.9)
          || w.pads.some((pd) => Math.hypot(pd.x - x, pd.z - z) < w.data.structures.padRadius + 0.6);
      };
      let plat: number[] | null = null;
      let pcx = 0;
      let pcz = 0;
      const startDist = a.placed ? Math.max(2.5, Math.hypot(a.toX! - t.pos.x, a.toZ! - t.pos.z)) : def.range ?? 5;
      for (let dist = startDist; dist >= 2.5 && !plat; dist -= 0.5) {
        pcx = Math.floor(t.pos.x + a.dirX * dist);
        pcz = Math.floor(t.pos.z + a.dirZ * dist);
        const cells: number[] = [];
        let ok = true;
        for (let dz = lo; dz <= hi && ok; dz++) {
          for (let dx = lo; dx <= hi; dx++) {
            const i = tr.index(pcx + dx, pcz + dz);
            if (i < 0 || blockedCell(i)) { ok = false; break; }
            cells.push(i);
          }
        }
        if (ok) plat = cells;
      }
      if (!plat) {
        w.emit({ type: "notice", team: e.team, text: "NO ROOM TO BUILD" });
        return;
      }
      let base = -Infinity;
      for (const i of plat) base = Math.max(base, tr.kinds[i] === Kind.Ground ? tr.groundHeight((i % tr.width) + 0.5, Math.floor(i / tr.width) + 0.5) : tr.waterLevel);
      const top = base + (def.height ?? 1.5);
      const cells = plat.slice();
      const deck = plat.map(() => top);
      const cx = pcx + 0.5 + (lo + hi) / 2;
      const cz = pcz + 0.5 + (lo + hi) / 2;
      const shift = size % 2 === 0 ? 0.5 : 0;
      const ex = cx - a.dirX * (half + 0.05) - a.dirZ * shift;
      const ez = cz - a.dirZ * (half + 0.05) + a.dirX * shift;
      let len = rampLen;
      let fx = ex - a.dirX * len;
      let fz = ez - a.dirZ * len;
      let footY = w.groundY(fx, fz);
      while (len < 12 && (top - footY) / len > 0.38) {
        len += 1;
        fx = ex - a.dirX * len;
        fz = ez - a.dirZ * len;
        footY = w.groundY(fx, fz);
      }
      const width = def.width ?? 2;
      const steps = Math.ceil(len * 3);
      for (let st = 0; st <= steps; st++) {
        const f = st / steps;
        for (let wv = -width / 2; wv <= width / 2; wv += 0.5) {
          const x = fx + (ex - fx) * f - a.dirZ * wv;
          const z = fz + (ez - fz) * f + a.dirX * wv;
          const i = tr.index(Math.floor(x), Math.floor(z));
          if (i < 0 || cells.includes(i) || blockedCell(i)) continue;
          const ccx = (i % tr.width) + 0.5;
          const ccz = Math.floor(i / tr.width) + 0.5;
          const along = Math.max(0, Math.min(1, ((ccx - fx) * a.dirX + (ccz - fz) * a.dirZ) / len));
          const dy = footY + (top - footY) * along;
          if (tr.kinds[i] === Kind.Ground && tr.groundHeight(ccx, ccz) > dy - 0.05) continue;
          cells.push(i);
          deck.push(dy);
        }
      }
      for (const m of w.mods) if (m.kind === "works" && m.owner === e.id) m.until = Math.min(m.until, w.time);
      const m: TerrainMod = { id: w.newId(), kind: "works", team: e.team, owner: e.id, cells, prevKind: [], prevDeck: [], deck, until: w.time + (def.seconds ?? 25), cx, cz, top };
      if (!w.applyModIfOpen(m)) {
        w.emit({ type: "notice", team: e.team, text: "WOULD BLOCK THE ROAD" });
        e.hero!.cooldowns.r = w.time + 1;
        return;
      }
      for (const o of w.entities) {
        if (!o.alive || o.kind === "structure") continue;
        const oi = tr.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z));
        if (plat.includes(oi)) o.transform.y = top;
      }
      w.emit({ type: "mod", id: m.id });
      w.emit({ type: "slam", x: cx, y: top, z: cz, radius: 2, team: e.team, src: e.id });
      const anchor = w.addEntity(e.team, "structure", half + 0.4, cx, cz, def.rampHp ?? 500);
      anchor.structure = {
        type: "damage", padIndex: -1, level: 1, builtAt: w.time, ready: true, nextAction: w.time + 9999,
        range: 0, damage: 0, lastFireAt: -99, shielded: false, works: m.id, siege: { cooldown: 9999, vs: {}, modId: m.id },
      };
      anchor.transform.y = base;
      anchor.owner = e.id;
      w.emit({ type: "build", id: anchor.id, padIndex: -1, team: e.team, upgrade: false });
      if (def.fx?.tesla) {
        const s = w.addEntity(e.team, "structure", 0.8, cx, cz, def.hp ?? 400);
        s.structure = {
          type: "damage", padIndex: -1, level: 1, builtAt: w.time, ready: true, nextAction: w.time + 0.3,
          range: 8, damage: def.damage ?? 45, lastFireAt: -99, shielded: false, tesla: true, onMod: m.id,
        };
        s.expiresAt = m.until;
        s.owner = e.id;
        w.nav.setBlocked(cx, cz, 0.8, true);
        w.emit({ type: "build", id: s.id, padIndex: -1, team: e.team, upgrade: false });
      }
      return;
    }
    case "ballista": {
      const tr = w.terrain;
      const ax = t.pos.x + a.dirX * 1.8;
      const az = t.pos.z + a.dirZ * 1.8;
      const topCell = (m: TerrainMod, i: number) => {
        const k = m.cells.indexOf(i);
        return k >= 0 && m.deck[k] === m.top;
      };
      const mine = w.mods.filter((m) => m.kind === "works" && m.team === e.team && m.top !== undefined);
      const here = tr.index(Math.floor(t.pos.x), Math.floor(t.pos.z));
      let perch: TerrainMod | null = mine.find((m) => topCell(m, here)) ?? null;
      let sx: number;
      let sz: number;
      if (perch) {
        const p = perch;
        const spots = p.cells.filter((i) => topCell(p, i) && w.nav.open(i) && !w.entities.some((o) => o.alive && o.kind === "structure" && tr.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z)) === i));
        if (!spots.length) return;
        const cxOf = (i: number) => (i % tr.width) + 0.5;
        const czOf = (i: number) => Math.floor(i / tr.width) + 0.5;
        spots.sort((i, j) => Math.hypot(cxOf(i) - ax, czOf(i) - az) - Math.hypot(cxOf(j) - ax, czOf(j) - az));
        sx = cxOf(spots[0]);
        sz = czOf(spots[0]);
      } else {
        const i = w.nav.nearestOpen(ax, az, 3);
        if (i < 0) return;
        sx = (i % w.nav.w) + 0.5;
        sz = Math.floor(i / w.nav.w) + 0.5;
        perch = mine.find((m) => topCell(m, i)) ?? null;
      }
      for (const old of w.entities) {
        if (!old.alive || old.owner !== e.id || !old.structure?.siege || old.structure.works !== undefined) continue;
        old.expiresAt = w.time;
      }
      const cellAt = tr.index(Math.floor(sx), Math.floor(sz));
      const onRamp = perch ?? mine.find((m) => m.cells.includes(cellAt)) ?? null;
      const s = w.addEntity(e.team, "structure", 0.7, sx, sz, def.hp ?? 180);
      const mul = perch ? def.perchMul ?? 1.25 : 1;
      s.structure = {
        type: "damage", padIndex: -1, level: 1, builtAt: w.time, ready: true, nextAction: w.time + 0.5,
        range: def.range ?? 11, damage: (def.damage ?? 80) * mul, lastFireAt: -99, shielded: false,
        siege: { cooldown: def.cooldown ?? 1.8, vs: def.vs ?? {}, modId: onRamp ? onRamp.id : 0 },
      };
      const core = w.foeCore(e.team, sx, sz);
      if (core) s.transform.facing = s.transform.prevFacing = Math.atan2(core.transform.pos.x - sx, core.transform.pos.z - sz);
      s.expiresAt = Math.min(onRamp ? onRamp.until : Infinity, w.time + (def.seconds ?? 20));
      s.owner = e.id;
      w.nav.setBlocked(sx, sz, 0.7, true);
      w.emit({ type: "build", id: s.id, padIndex: -1, team: e.team, upgrade: false });
      return;
    }
    case "ramp": {
      const len = def.length ?? 7;
      const width = def.width ?? 2;
      const x0 = t.pos.x + a.dirX * 0.8;
      const z0 = t.pos.z + a.dirZ * 0.8;
      const x1 = t.pos.x + a.dirX * len;
      const z1 = t.pos.z + a.dirZ * len;
      const y0 = t.y;
      let y1 = w.terrain.groundHeight(x1, z1);
      const k1 = w.terrain.kindAt(Math.floor(x1), Math.floor(z1));
      if (k1 === Kind.Water || k1 === Kind.Wall) y1 = y0;
      const cells: number[] = [];
      const deck: number[] = [];
      const steps = Math.ceil(len * 3);
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        for (let wv = -width / 2; wv <= width / 2; wv += 0.5) {
          const x = x0 + (x1 - x0) * f - a.dirZ * wv;
          const z = z0 + (z1 - z0) * f + a.dirX * wv;
          const i = w.terrain.index(Math.floor(x), Math.floor(z));
          if (i < 0 || cells.includes(i)) continue;
          const kind = w.terrain.kinds[i];
          if (kind === Kind.Wall && w.terrain.styles[i] !== "ruin") continue;
          const cx = (i % w.terrain.width) + 0.5;
          const cz = Math.floor(i / w.terrain.width) + 0.5;
          const along = Math.max(0, Math.min(1, ((cx - x0) * a.dirX + (cz - z0) * a.dirZ) / Math.max(0.1, len - 0.8)));
          const dy = y0 + (y1 - y0) * along;
          const ground = w.terrain.groundHeight(cx, cz);
          if (kind === Kind.Ground && ground > dy + 0.1) continue;
          cells.push(i);
          deck.push(dy);
        }
      }
      if (!cells.length) return;
      const m: TerrainMod = { id: w.newId(), kind: "ramp", team: e.team, cells, prevKind: [], prevDeck: [], deck, until: w.time + (def.seconds ?? 12) };
      w.applyMod(m);
      w.emit({ type: "mod", id: m.id });
      return;
    }
    case "wall": {
      const len = def.length ?? 6;
      const cx = a.placed ? a.toX! : t.pos.x + a.dirX * (def.offset ?? 2.5);
      const cz = a.placed ? a.toZ! : t.pos.z + a.dirZ * (def.offset ?? 2.5);
      const cells: number[] = [];
      for (let s = -len / 2; s <= len / 2; s += 0.5) {
        const x = cx - a.dirZ * s;
        const z = cz + a.dirX * s;
        const i = w.terrain.index(Math.floor(x), Math.floor(z));
        if (i < 0 || cells.includes(i)) continue;
        const k = w.terrain.kinds[i];
        if (k !== Kind.Ground && k !== Kind.Ford) continue;
        if (w.pads.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) continue;
        const occupied = w.entities.some((o) => o.alive && (o.kind === "structure" || (o.hero && o.team === e.team)) &&
          Math.abs(o.transform.pos.x - (Math.floor(x) + 0.5)) < 0.5 + o.radius && Math.abs(o.transform.pos.z - (Math.floor(z) + 0.5)) < 0.5 + o.radius);
        if (occupied) continue;
        cells.push(i);
      }
      if (!cells.length) return;
      const m: TerrainMod = { id: w.newId(), kind: "wall", team: e.team, owner: e.id, style: (def as { style?: string }).style, cells, prevKind: [], prevDeck: [], deck: [], until: w.time + (def.seconds ?? 8) };
      if (def.fx?.grove) {
        w.zones.push({ id: w.newId(), team: e.team, ownerId: e.id, x: cx, z: cz, radius: len / 2 + 1.5, until: m.until, dps: 0, slowMul: 1, style: "grove", heal: def.fx.grove.heal });
      }
      w.applyMod(m);
      if (def.endTraps) {
        const tdef = w.heroDef(e.hero!.type).abilities.b;
        for (const s of [-1, 1]) {
          const ex = cx - a.dirZ * s * (len / 2 + 1);
          const ez = cz + a.dirX * s * (len / 2 + 1);
          if (!Number.isFinite(w.terrain.heightAt(ex, ez))) continue;
          w.traps.push({
            id: w.newId(), team: e.team, ownerId: e.id, x: ex, z: ez, radius: tdef.radius ?? 1.2, armAt: w.time + (tdef.arm ?? 0.5),
            until: w.time + (def.seconds ?? 8) + 6, damage: (tdef.damage ?? 40) * mul, stun: tdef.stunSeconds ?? 1.2, bonus: true,
          });
        }
      }
      w.emit({ type: "mod", id: m.id });
      const near = (o: Entity) => cells.some((c) => Math.abs((c % w.terrain.width) + 0.5 - o.transform.pos.x) < 0.5 + o.radius && Math.abs(Math.floor(c / w.terrain.width) + 0.5 - o.transform.pos.z) < 0.5 + o.radius);
      for (const o of w.entities.slice()) {
        if (!o.alive || o.kind === "structure") continue;
        const i = w.terrain.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z));
        const inside = cells.includes(i);
        if (!inside && !(o.team !== e.team && near(o))) continue;
        const rx = o.transform.pos.x - cx;
        const rz = o.transform.pos.z - cz;
        const along = -rx * a.dirZ + rz * a.dirX;
        const side = rx * a.dirX + rz * a.dirZ >= 0 ? 1 : -1;
        const lx = cx - a.dirZ * along;
        const lz = cz + a.dirX * along;
        if (inside) {
          const j = w.nav.nearestOpen(lx + a.dirX * side * 1.3, lz + a.dirZ * side * 1.3, 4);
          if (j >= 0) w.teleport(o, (j % w.nav.w) + 0.5, Math.floor(j / w.nav.w) + 0.5);
        }
        if (o.team === e.team) continue;
        w.damage(e, o, (def.damage ?? 70) * mul, { stun: def.stunSeconds ?? 0.9, knockback: def.knockback ?? 9, fromX: lx - a.dirX * side, fromZ: lz - a.dirZ * side, big: true });
        w.emit({ type: "slam", x: lx, y: w.groundY(lx, lz), z: lz, radius: 1.6, team: e.team });
      }
      return;
    }
    case "reach": {
      const reach = def.range ?? 8;
      const width = def.width ?? 1;
      let best: Entity | null = null;
      let bestD = reach;
      for (const o of w.entities) {
        if (!o.alive || o.team === e.team || o.neutral) continue;
        const dx = o.transform.pos.x - t.pos.x;
        const dz = o.transform.pos.z - t.pos.z;
        const along = dx * a.dirX + dz * a.dirZ;
        if (along < 0 || along - o.radius > reach) continue;
        const side = Math.abs(dx * a.dirZ - dz * a.dirX);
        if (side > width + o.radius || Math.abs(o.transform.y - t.y) > 3) continue;
        if (along < bestD) { bestD = along; best = o; }
      }
      let len = reach;
      for (let s = 0.5; s <= reach; s += 0.5) {
        if (w.losHeight(t.pos.x + a.dirX * s, t.pos.z + a.dirZ * s) > t.y + 2.2) { len = s; break; }
      }
      if (best && bestD > len) best = null;
      const fx = def.fx;
      const victims: Entity[] = [];
      if (fx?.pierce) {
        for (const o of w.entities) {
          if (!o.alive || o.team === e.team || o.neutral) continue;
          const dx = o.transform.pos.x - t.pos.x;
          const dz = o.transform.pos.z - t.pos.z;
          const along = dx * a.dirX + dz * a.dirZ;
          if (along < 0 || along - o.radius > len) continue;
          if (Math.abs(dx * a.dirZ - dz * a.dirX) > width + o.radius || Math.abs(o.transform.y - t.y) > 3) continue;
          victims.push(o);
        }
      } else if (best) {
        len = Math.max(0.8, bestD);
        victims.push(best);
      }
      const tx = t.pos.x + a.dirX * len;
      const tz = t.pos.z + a.dirZ * len;
      w.emit({ type: "reach", x: t.pos.x, y: t.y, z: t.pos.z, tx, tz, team: e.team, hit: victims.length > 0, style: fx?.pull ? "vine" : undefined, src: e.id });
      a.toX = tx;
      a.toZ = tz;
      for (const o of victims) {
        const hit = w.damage(e, o, (def.damage ?? 70) * mul * (o.structure ? def.structureMul ?? 1.5 : 1), {
          knockback: fx?.pull ? 0 : def.knockback ?? 8, fromX: t.pos.x, fromZ: t.pos.z, stun: def.stunSeconds, slowMul: def.slowMul, slowSeconds: def.slowSeconds, big: true, vsStunnedMul: def.vsStunnedMul,
        });
        if (hit && fx?.pull && o.alive && !o.structure && w.time >= o.status.ccImmuneUntil) {
          const dx = t.pos.x - o.transform.pos.x;
          const dz = t.pos.z - o.transform.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const k = Math.min(18, Math.max(0, d - 1.4) * 3.6);
          o.status.kvx += (dx / d) * k;
          o.status.kvz += (dz / d) * k;
        }
      }
      if (fx?.splinter) {
        w.emit({ type: "slam", x: tx, y: w.groundY(tx, tz), z: tz, radius: fx.splinter.radius, team: e.team, src: e.id });
        for (const o of w.entities.slice()) {
          if (!o.alive || o.team === e.team || o.neutral) continue;
          if (Math.hypot(o.transform.pos.x - tx, o.transform.pos.z - tz) - o.radius > fx.splinter.radius) continue;
          w.damage(e, o, fx.splinter.damage * mul, { fromX: tx, fromZ: tz, knockback: 4 });
        }
      }
      return;
    }
    case "trap": {
      const mine = w.traps.filter((tr) => tr.ownerId === e.id && !tr.bonus);
      if (mine.length >= (def.max ?? 3)) w.traps.splice(w.traps.indexOf(mine[0]), 1);
      const x = t.pos.x + a.dirX * (def.range ?? 4);
      const z = t.pos.z + a.dirZ * (def.range ?? 4);
      w.traps.push({
        id: w.newId(), team: e.team, ownerId: e.id, x, z, radius: def.radius ?? 1.2, armAt: w.time + (def.arm ?? 0.5),
        until: w.time + (def.seconds ?? 30), damage: (def.damage ?? 40) * mul, stun: def.stunSeconds ?? 1.2,
      });
      return;
    }
    case "zone": {
      w.zones.push({
        id: w.newId(), team: e.team, ownerId: e.id, x: a.placed ? a.toX! : t.pos.x, z: a.placed ? a.toZ! : t.pos.z, radius: def.radius ?? 6,
        until: w.time + (def.seconds ?? 6), dps: (def.dps ?? 20) * mul, slowMul: def.slowMul ?? 0.4, heal: def.fx?.grove?.heal, haste: def.allySpeedMul,
      });
      w.emit({ type: "slam", x: a.placed ? a.toX! : t.pos.x, y: a.placed ? w.groundY(a.toX!, a.toZ!) : t.y, z: a.placed ? a.toZ! : t.pos.z, radius: def.radius ?? 6, team: e.team, zone: true, src: e.id });
      return;
    }
    default:
      return;
  }
}

export function forceAbility(w: World, e: Entity, slot: Slot, dirX: number, dirZ: number): void {
  if (!e.alive || !e.hero) return;
  const def = abilities(w, e)[slot];
  if (def.kind === "gravewalk") graveBegin(w, e, { moveX: dirX, moveZ: dirZ }, def);
  else startAbility(w, e, slot, { moveX: dirX, moveZ: dirZ });
}
