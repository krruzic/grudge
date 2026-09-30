import type { World } from "./world.ts";
import type { AbilityDef } from "./config.ts";
import type { Command, Entity, HeroAction, TerrainMod, UnitType } from "./types.ts";
import { Kind } from "./terrain.ts";
import { spawnUnit } from "./structures.ts";

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
    if (!o.alive || o.team === e.team) continue;
    if (o.structure?.type === "core" && o.structure.shielded && !w.isSudden()) continue;
    const d = w.dist(e, o) - o.radius;
    if (d > reach) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const along = mag > 0.3 ? (dx * cmd.moveX + dz * cmd.moveZ) / (len * mag) : 1;
    if (mag > 0.3 && along < 0.3) continue;
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
  const hits = w.heroDef(h.type).abilities.a.hits;
  return !!hits && w.time < h.comboUntil && h.comboIndex % hits.length !== 0;
}

function begin(e: Entity, name: HeroAction["name"], kind: string, dur: number, hitAt: number, dirX: number, dirZ: number, combo = 0): HeroAction {
  const a: HeroAction = { name, kind, dur, hitAt, combo, t: 0, fired: false, dirX, dirZ };
  e.hero!.action = a;
  e.transform.facing = Math.atan2(dirX, dirZ);
  e.hero!.blocking = false;
  return a;
}

function reachOf(def: AbilityDef): number {
  return def.range ?? def.botRange ?? def.radius ?? 3;
}

function startAbility(w: World, e: Entity, slot: Slot, cmd: Command): void {
  const h = e.hero!;
  const def = w.heroDef(h.type).abilities[slot];
  const [dx, dz] = aim(w, e, cmd, reachOf(def) + 1);
  const a = begin(e, slot, def.kind, def.dur ?? 0.5, def.hitAt ?? 0.25, dx, dz);
  if (def.kind === "leap") {
    const p = e.transform.pos;
    const target = aimTarget(w, e, cmd, (def.range ?? 7) + 1);
    let tx = p.x + dx * (def.range ?? 7);
    let tz = p.z + dz * (def.range ?? 7);
    if (target) {
      const d = Math.min(def.range ?? 7, w.dist(e, target) - 0.8);
      tx = p.x + dx * d;
      tz = p.z + dz * d;
    }
    for (let k = 0; k <= 10; k++) {
      const f = 1 - k / 10;
      const x = p.x + (tx - p.x) * f;
      const z = p.z + (tz - p.z) * f;
      if (Number.isFinite(w.terrain.heightAt(x, z)) && w.nav.open(w.nav.index(Math.floor(x), Math.floor(z)))) {
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
}

export function updateHero(w: World, e: Entity, cmd: Command): void {
  const h = e.hero!;
  const dt = w.dt;
  const b = w.data.heroes.baseline;
  const def = w.heroDef(h.type);
  const ab = def.abilities;
  const t = e.transform;

  if (h.dead) {
    if (w.time >= h.respawnAt) {
      const sp = w.spawnPoint(e.team);
      w.teleport(e, sp.x, sp.z);
      e.hp = e.maxHp;
      e.alive = true;
      h.dead = false;
      h.vel.x = h.vel.z = 0;
      e.status.invulnUntil = w.time + 1.5;
      e.status.kvx = e.status.kvz = 0;
      e.status.stunUntil = 0;
      w.emit({ type: "spawn", id: e.id });
    }
    return;
  }

  if (w.time < e.status.stunUntil) {
    h.vel.x = h.vel.z = 0;
    h.action = null;
    h.blocking = false;
    return;
  }

  if (w.arena.carrying(e)) cmd = { ...cmd, attack: false, secondary: false, special: false, super: false, dodge: false, build: undefined };
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
      h.cooldowns.dodge = w.time + b.dodgeCooldown;
    } else if (cmd.super && h.meter >= b.superMax && !act) {
      startAbility(w, e, "z", cmd);
      h.meter = 0;
      e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + (ab.z.hitAt ?? 0.5));
    } else if (cmd.special && ready(e, "r", w.time) && !act) {
      startAbility(w, e, "r", cmd);
      h.cooldowns.r = w.time + (ab.r.cooldown ?? 10);
    } else if (cmd.secondary && ready(e, "b", w.time) && !act) {
      startAbility(w, e, "b", cmd);
      h.cooldowns.b = w.time + (ab.b.cooldown ?? 4);
    } else if (cmd.attack && (!act || canChainCombo) && (chaining(w, e) || ready(e, "a", w.time))) {
      if (ab.a.kind === "combo") {
        const hits = ab.a.hits!;
        const idx = chaining(w, e) ? h.comboIndex % hits.length : 0;
        const hit = hits[idx];
        const [dx, dz] = aim(w, e, cmd, hit.range + 1.5);
        begin(e, "a", "combo", hit.dur, hit.hitAt, dx, dz, idx);
        h.comboIndex = idx + 1;
        h.comboUntil = w.time + hit.dur + (ab.a.comboWindow ?? 0.35);
        const cd = b.comboCooldown ?? 0;
        h.cooldowns.a = h.comboUntil + (idx === hits.length - 1 ? cd : cd * 0.5);
      } else {
        startAbility(w, e, "a", cmd);
        if (ab.a.cooldown) h.cooldowns.a = w.time + ab.a.cooldown;
      }
    }
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
      w.moveBy(e, a.dirX * hit.lunge * dt, a.dirZ * hit.lunge * dt);
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
        arcHit(w, e, a.dirX, a.dirZ, adef.range ?? 3, adef.arcDeg ?? 150, (adef.damage ?? 40) * w.damageMulOf(e), a.combo === (adef.count ?? 5) ? 3 : 0.4, a.combo === (adef.count ?? 5), adef.vsStunnedMul);
      }
    }
    if (!a.fired && a.t >= a.hitAt) {
      a.fired = true;
      fire(w, e, a);
    }
    if (a.t >= a.dur) {
      if (a.kind !== "dodge" && a.name !== "hit") h.actionEndAt = w.time;
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
  const mul = w.speedMul(e) * (h.blocking ? b.blockMoveMul : 1);
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
  if (!h.blocking && Math.hypot(cmd.moveX, cmd.moveZ) > 0.01) w.faceToward(e, cmd.moveX, cmd.moveZ, b.turnRate);
}

function arcHit(w: World, e: Entity, dirX: number, dirZ: number, range: number, arcDeg: number, damage: number, knockback: number, big: boolean, vsStunnedMul?: number): void {
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
    w.damage(e, o, damage, { knockback, canMiss: true, big, vsStunnedMul });
  }
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
  w.emit({ type: "shove", x: t.pos.x + a.dirX, y: t.y, z: t.pos.z + a.dirZ, team: any ? e.team : -1 });
}

function dashHits(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const ids = a.hitIds ?? (a.hitIds = []);
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || ids.includes(o.id)) continue;
    if (w.dist(e, o) - o.radius > (def.width ?? 1.2)) continue;
    ids.push(o.id);
    w.damage(e, o, (def.damage ?? 60) * w.damageMulOf(e), {
      knockback: def.knockback ?? 3, structureDamage: def.structureDamage !== undefined ? def.structureDamage * w.damageMulOf(e) : undefined, big: true,
      executeBelow: def.executeBelow, executeMul: def.executeMul,
    });
  }
}

function aoe(w: World, e: Entity, cx: number, cz: number, radius: number, def: AbilityDef, mul: number): void {
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
  }
}

function fire(w: World, e: Entity, a: HeroAction): void {
  const ab = w.heroDef(e.hero!.type).abilities;
  const t = e.transform;
  const mul = w.damageMulOf(e);
  if (a.kind === "combo") {
    const hit = ab.a.hits![a.combo];
    arcHit(w, e, a.dirX, a.dirZ, hit.range, hit.arcDeg, hit.damage * mul, hit.knockback, a.combo === 2);
    return;
  }
  if (a.name === "shove") {
    shoveHit(w, e, a);
    return;
  }
  if (a.name === "dodge" || a.name === "hit") return;
  const def = ab[a.name];
  switch (a.kind) {
    case "slam": {
      const cx = t.pos.x + a.dirX * (def.offset ?? 1);
      const cz = t.pos.z + a.dirZ * (def.offset ?? 1);
      w.emit({ type: "slam", x: cx, y: w.groundY(cx, cz), z: cz, radius: def.radius ?? 3, team: e.team });
      aoe(w, e, cx, cz, def.radius ?? 3, def, mul);
      return;
    }
    case "quake":
    case "leap": {
      w.emit({ type: "slam", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.radius ?? 5, team: e.team });
      aoe(w, e, t.pos.x, t.pos.z, def.radius ?? 5, def, mul);
      return;
    }
    case "banner": {
      const range = def.range ?? 6;
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
      w.emit({ type: "banner", team: e.team, x: bx, y: w.groundY(bx, bz), z: bz, until });
      for (const u of w.entities) {
        if (u.unit && u.team === e.team) u.unit.repathAt = 0;
      }
      return;
    }
    case "rally": {
      const r = def.radius ?? 9;
      w.emit({ type: "rally", x: t.pos.x, y: t.y, z: t.pos.z, radius: r, team: e.team });
      for (const o of w.entities) {
        if (!o.alive || o.team !== e.team || o.kind === "structure") continue;
        if (w.dist(e, o) > r) continue;
        w.heal(o, o.maxHp * (def.healFrac ?? 0.4));
        o.status.stunUntil = 0;
        o.status.slowUntil = 0;
        o.status.guardUntil = w.time + (def.seconds ?? 4);
        o.status.guardMul = def.guardMul ?? 0.7;
        w.emit({ type: "heal", x: o.transform.pos.x, y: o.transform.y, z: o.transform.pos.z, team: e.team });
      }
      return;
    }
    case "warcry": {
      w.emit({ type: "warcry", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.radius ?? 8, team: e.team });
      if (def.resetB) e.hero!.cooldowns.b = w.time;
      for (const o of w.entities) {
        if (!o.alive || o.team !== e.team || o.kind === "structure") continue;
        if (w.dist(e, o) > (def.radius ?? 8)) continue;
        o.status.buffUntil = w.time + (def.seconds ?? 5);
        o.status.buffDamageMul = def.damageMul ?? 1.3;
        o.status.buffSpeedMul = def.speedMul ?? 1.2;
      }
      return;
    }
    case "shoot": {
      const target = aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, def.range ?? 8);
      if (target) w.fireProjectile(e, target, (def.damage ?? 30) * mul, def.speed ?? 15, false, "magic", 1.6, true);
      else w.fireAtPoint(e, t.pos.x + a.dirX * (def.range ?? 8), t.pos.z + a.dirZ * (def.range ?? 8), def.speed ?? 15, "magic", 1.6);
      return;
    }
    case "hex": {
      const target = aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, def.range ?? 8);
      const range = def.range ?? 8;
      const x = target ? target.transform.pos.x : t.pos.x + a.dirX * range * 0.7;
      const z = target ? target.transform.pos.z : t.pos.z + a.dirZ * range * 0.7;
      const delay = def.delay ?? 0.8;
      w.delayed.push({
        id: w.newId(), team: e.team, ownerId: e.id, at: w.time + delay, x, z, radius: def.radius ?? 2.5,
        damage: (def.damage ?? 80) * mul, slowMul: def.slowMul, slowSeconds: def.slowSeconds, hexSeconds: def.hexSeconds,
      });
      w.emit({ type: "telegraph", x, y: w.groundY(x, z), z, radius: def.radius ?? 2.5, team: e.team, seconds: delay });
      return;
    }
    case "summon": {
      const units = def.units ?? {};
      let k = 0;
      for (const [type, n] of Object.entries(units) as [UnitType, number][]) {
        for (let i = 0; i < n; i++) {
          const ang = k++ * 2.1 + t.facing;
          const u = spawnUnit(w, e.team, type, t.pos.x + Math.sin(ang) * 2, t.pos.z + Math.cos(ang) * 2, 1);
          if (u) {
            u.expiresAt = w.time + (def.seconds ?? 20);
            u.owner = e.id;
          }
        }
      }
      w.emit({ type: "warcry", x: t.pos.x, y: t.y, z: t.pos.z, radius: 3, team: e.team });
      if (def.hexRadius) {
        const hexSec = w.heroDef(e.hero!.type).abilities.b.hexSeconds ?? 6;
        w.emit({ type: "pulse", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.hexRadius, team: e.team });
        for (const o of w.entities) {
          if (!o.alive || o.team === e.team || o.kind === "structure" || w.dist(e, o) > def.hexRadius) continue;
          o.status.hexUntil = w.time + hexSec;
          o.status.hexOwner = e.id;
        }
      }
      return;
    }
    case "stealth": {
      e.status.stealthUntil = w.time + (def.seconds ?? 4);
      e.status.ambushMul = def.ambushMul ?? 2;
      e.status.buffUntil = w.time + (def.seconds ?? 4);
      e.status.buffSpeedMul = def.speedMul ?? 1.3;
      e.status.buffDamageMul = 1;
      w.emit({ type: "blink", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team });
      return;
    }
    case "repair": {
      w.emit({ type: "warcry", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.radius ?? 6, team: e.team });
      for (const o of w.entities.slice()) {
        if (!o.alive || w.dist(e, o) - o.radius > (def.radius ?? 6)) continue;
        if (o.team === e.team && o.structure) {
          w.heal(o, def.heal ?? 200);
          w.emit({ type: "heal", x: o.transform.pos.x, y: o.transform.y, z: o.transform.pos.z, team: e.team });
        } else if (o.team !== e.team && o.kind !== "structure") {
          w.damage(e, o, (def.damage ?? 30) * mul, { knockback: 3 });
        }
      }
      return;
    }
    case "turret": {
      const x = t.pos.x + a.dirX * 1.6;
      const z = t.pos.z + a.dirZ * 1.6;
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
      for (let dist = def.range ?? 5; dist >= 2.5 && !plat; dist -= 0.5) {
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
      w.emit({ type: "slam", x: cx, y: top, z: cz, radius: 2, team: e.team });
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
      const s = w.addEntity(e.team, "structure", 0.7, sx, sz, def.hp ?? 180);
      const mul = perch ? def.perchMul ?? 1.25 : 1;
      s.structure = {
        type: "damage", padIndex: -1, level: 1, builtAt: w.time, ready: true, nextAction: w.time + 0.5,
        range: def.range ?? 11, damage: (def.damage ?? 80) * mul, lastFireAt: -99, shielded: false,
        siege: { cooldown: def.cooldown ?? 1.8, vs: def.vs ?? {}, modId: perch ? perch.id : 0 },
      };
      const core = w.core(1 - e.team);
      if (core) s.transform.facing = s.transform.prevFacing = Math.atan2(core.transform.pos.x - sx, core.transform.pos.z - sz);
      s.expiresAt = perch ? perch.until : w.time + (def.seconds ?? 30);
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
      const cx = t.pos.x + a.dirX * (def.offset ?? 2.5);
      const cz = t.pos.z + a.dirZ * (def.offset ?? 2.5);
      const cells: number[] = [];
      for (let s = -len / 2; s <= len / 2; s += 0.5) {
        const x = cx - a.dirZ * s;
        const z = cz + a.dirX * s;
        const i = w.terrain.index(Math.floor(x), Math.floor(z));
        if (i < 0 || cells.includes(i)) continue;
        const k = w.terrain.kinds[i];
        if (k !== Kind.Ground && k !== Kind.Ford) continue;
        if (w.pads.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) continue;
        const occupied = w.entities.some((o) => o.alive && (o.kind === "structure" || o.hero) &&
          Math.abs(o.transform.pos.x - (Math.floor(x) + 0.5)) < 0.5 + o.radius && Math.abs(o.transform.pos.z - (Math.floor(z) + 0.5)) < 0.5 + o.radius);
        if (occupied) continue;
        cells.push(i);
      }
      if (!cells.length) return;
      const m: TerrainMod = { id: w.newId(), kind: "wall", team: e.team, cells, prevKind: [], prevDeck: [], deck: [], until: w.time + (def.seconds ?? 8) };
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
      for (const o of w.entities) {
        if (!o.alive || o.kind === "structure") continue;
        const i = w.terrain.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z));
        if (!cells.includes(i)) continue;
        const j = w.nav.nearestOpen(o.transform.pos.x, o.transform.pos.z, 4);
        if (j >= 0) w.teleport(o, (j % w.nav.w) + 0.5, Math.floor(j / w.nav.w) + 0.5);
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
        id: w.newId(), team: e.team, ownerId: e.id, x: t.pos.x, z: t.pos.z, radius: def.radius ?? 6,
        until: w.time + (def.seconds ?? 6), dps: (def.dps ?? 20) * mul, slowMul: def.slowMul ?? 0.4,
      });
      w.emit({ type: "slam", x: t.pos.x, y: t.y, z: t.pos.z, radius: def.radius ?? 6, team: e.team });
      return;
    }
    default:
      return;
  }
}

export function forceAbility(w: World, e: Entity, slot: Slot, dirX: number, dirZ: number): void {
  if (!e.alive || !e.hero) return;
  startAbility(w, e, slot, { moveX: dirX, moveZ: dirZ });
}
