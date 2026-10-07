// Hogshead, the Cellar Boar (vintner): Thick Skin passive (Grit builds while he stands still or blocks, up to 25%
// damage reduction, and drains while he moves), the charged Anvil Pound on A, Headbutt (B: a short charge that
// carries the first champion along and stuns both against a wall), Switcheroo (R: swap places with an ally, who gets
// a shield - with no ally in reach he Digs In instead: a stomp, full Grit, nothing moves or debuffs him for a few
// seconds and his next hit lands harder), Crush Season (Z: three ever bigger anvil slams) and the
// Anvil Curl dodge (he tucks behind the anvil on his back: from behind he blocks almost everything for a moment).
import type { World } from "../world.ts";
import type { AbilityDef } from "../config.ts";
import type { Command, Entity, HeroAction } from "../types.ts";
import { abilities, addShield } from "../talents.ts";
import { aoe } from "./strikes.ts";
import { callout } from "./common.ts";

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

const hooksOf = (w: World, e: Entity) => w.heroDef(e.hero!.type).hooks;

/** Hogshead's Grit: builds while he stands (or blocks), drains while he moves. Runs every tick from hero/update.ts. */
export function gritTick(w: World, e: Entity): void {
  const h = e.hero!;
  const hk = hooksOf(w, e);
  const t = e.transform;
  // Walking (last tick's stick velocity), rushing, rolling or flying drains it; swinging in place doesn't.
  const k = h.action?.kind;
  const rushing = k === "headbutt" || k === "curl" || k === "dodge";
  const still = h.blocking || (Math.hypot(h.vel.x, h.vel.z) < (hk.gritStillSpeed ?? 1.2) && !rushing && !h.jump);
  const before = h.grit ?? 0;
  const tg = abilities(w, e).a.fx?.grit;
  const g = still
    ? Math.min(1, before + w.dt / (tg?.seconds ?? hk.gritSeconds ?? 3))
    : Math.max(0, before - w.dt / (hk.gritDrainSeconds ?? 1.5));
  h.grit = g;
  if (before < 1 && g >= 1) fx(w, "gritFull", e.id, e.team, t.pos.x, t.y, t.pos.z);
}

/** Damage taken multiplier from Grit (1 for everyone else). */
export function gritMul(w: World, target: Entity): number {
  const g = target.hero?.grit;
  if (!g) return 1;
  return 1 - g * (abilities(w, target).a.fx?.grit?.max ?? hooksOf(w, target).gritMax ?? 0.25);
}

/** Anvil Curl: a hit from behind while curled is all but stopped by the anvil on his back. */
export function curlBlocks(w: World, target: Entity, fx0: number, fz0: number): boolean {
  const h = target.hero;
  if (!h?.curlUntil || w.time >= h.curlUntil) return false;
  const t = target.transform;
  const dx = fx0 - t.pos.x;
  const dz = fz0 - t.pos.z;
  const dot = (Math.sin(t.facing) * dx + Math.cos(t.facing) * dz) / (Math.hypot(dx, dz) || 1);
  return dot < -0.15;
}

/**
 * A released with at least half a charge: instead of the combo swing he heaves the anvil up and pounds the ground
 * around him (knockback ring). Converts the action that just started this tick.
 */
export function startPound(w: World, e: Entity, charge: number): boolean {
  const h = e.hero!;
  const hk = hooksOf(w, e);
  const a = h.action;
  if (!hk.poundRadius || !a || a.name !== "a" || a.kind !== "combo" || a.jab || charge < 0.5) return false;
  a.kind = "pound";
  a.dur = hk.poundDur ?? 0.72;
  a.hitAt = hk.poundHitAt ?? 0.4;
  h.comboIndex = 0;
  h.comboUntil = 0;
  h.cooldowns.a = w.time + a.dur + 0.4;
  callout(w, e, "ANVIL POUND");
  return true;
}

export function firePound(w: World, e: Entity, a: HeroAction, mul: number): void {
  const hk = hooksOf(w, e);
  const t = e.transform;
  const r = hk.poundRadius ?? 3.2;
  const cx = t.pos.x + a.dirX * 0.9;
  const cz = t.pos.z + a.dirZ * 0.9;
  w.emit({ type: "slam", x: cx, y: w.groundY(cx, cz), z: cz, radius: r, team: e.team, src: e.id });
  fx(w, "pound", e.id, e.team, cx, w.groundY(cx, cz), cz, { radius: r });
  const def: AbilityDef = {
    kind: "pound",
    anim: "slam",
    damage: hk.poundDamage ?? 80,
    knockback: hk.poundKnockback ?? 11,
    stunSeconds: hk.poundStun ?? 0.3,
  };
  aoe(w, e, cx, cz, r, def, mul);
}

/** B start: a short charge in the aimed direction (hitIds = soldiers already bowled, targetId = the carried foe). */
export function startHeadbutt(w: World, e: Entity, a: HeroAction): void {
  a.hitIds = [];
  a.fromX = e.transform.pos.x;
  a.fromZ = e.transform.pos.z;
  e.status.ccImmuneUntil = Math.max(e.status.ccImmuneUntil, w.time + a.hitAt);
}

/**
 * Headbutt rush (until hitAt): moves at range/hitAt; the first enemy champion touched is pinned in front of him and
 * pushed along. If the pushed champion (or Hogshead) is stopped by a wall, a structure or a cliff, both stop: the
 * champion takes the wall damage and is stunned. Soldiers in the way are bowled aside.
 */
export function headbuttTick(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  if (a.t > a.hitAt || a.fired) return;
  const t = e.transform;
  const dt = w.dt;
  const speed = (def.range ?? 6) / a.hitAt;
  const step = speed * dt;
  const ids = a.hitIds ?? (a.hitIds = []);
  const mul = w.damageMulOf(e);
  let carried = a.targetId !== undefined ? w.get(a.targetId) : undefined;
  if (carried && !carried.alive) {
    carried = undefined;
    a.targetId = undefined;
  }
  if (!carried) {
    for (const o of w.entities) {
      if (!o.alive || !o.hero || o.hero.dead || o.team === e.team || o.hero.jump) continue;
      if (w.dist(e, o) - o.radius > 1.2) continue;
      const dx = o.transform.pos.x - t.pos.x;
      const dz = o.transform.pos.z - t.pos.z;
      if (dx * a.dirX + dz * a.dirZ < -0.2) continue;
      if (w.time < o.status.invulnUntil || w.time < o.status.ccImmuneUntil) continue;
      carried = o;
      a.targetId = o.id;
      w.damage(e, o, (def.damage ?? 60) * mul, { fromX: t.pos.x, fromZ: t.pos.z, big: true, noFlinch: true });
      fx(w, "headbuttHit", e.id, e.team, o.transform.pos.x, o.transform.y, o.transform.pos.z);
      break;
    }
  }
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.hero || o.structure || ids.includes(o.id)) continue;
    if (w.dist(e, o) - o.radius > 1.3) continue;
    ids.push(o.id);
    const ox = o.transform.pos.x - t.pos.x;
    const oz = o.transform.pos.z - t.pos.z;
    const side = ox * a.dirZ - oz * a.dirX >= 0 ? 1 : -1;
    w.damage(e, o, (def.damage ?? 60) * 0.7 * mul, {
      fromX: o.transform.pos.x - (a.dirZ * side * 0.8 + a.dirX * 0.5),
      fromZ: o.transform.pos.z - (-a.dirX * side * 0.8 + a.dirZ * 0.5),
      knockback: 9,
      big: true,
    });
  }
  if (carried?.alive) {
    const ct = carried.transform;
    const bx = ct.pos.x;
    const bz = ct.pos.z;
    w.moveBy(carried, a.dirX * step, a.dirZ * step);
    carried.status.kvx = carried.status.kvz = 0;
    carried.status.stunUntil = Math.max(carried.status.stunUntil, w.time + dt * 2);
    const prog = (ct.pos.x - bx) * a.dirX + (ct.pos.z - bz) * a.dirZ;
    if (prog < step * 0.45 || w.mapEvents.sealed(bx, bz, bx + a.dirX * 1.2, bz + a.dirZ * 1.2)) {
      wallSlam(w, e, a, def, carried, mul);
      return;
    }
    // Keep him right behind the carried champion.
    const want = carried.radius + e.radius + 0.1;
    const gx = ct.pos.x - a.dirX * want - t.pos.x;
    const gz = ct.pos.z - a.dirZ * want - t.pos.z;
    if (Math.hypot(gx, gz) > 0.02) w.moveBy(e, gx, gz);
    return;
  }
  const bx = t.pos.x;
  const bz = t.pos.z;
  w.moveBy(e, a.dirX * step, a.dirZ * step);
  const prog = (t.pos.x - bx) * a.dirX + (t.pos.z - bz) * a.dirZ;
  if (prog < step * 0.3) {
    // Ran into a wall with nobody in front: a dull thud, the rush ends.
    a.t = a.hitAt;
  }
}

function wallSlam(w: World, e: Entity, a: HeroAction, def: AbilityDef, o: Entity, mul: number): void {
  const p = o.transform.pos;
  w.damage(e, o, (def.splashDamage ?? 45) * mul, {
    fromX: e.transform.pos.x,
    fromZ: e.transform.pos.z,
    stun: def.stunSeconds ?? 1.1,
    big: true,
  });
  w.emit({ type: "slam", x: p.x, y: o.transform.y, z: p.z, radius: 1.4, team: e.team, src: e.id });
  fx(w, "wallSlam", e.id, e.team, p.x, o.transform.y, p.z, { tx: a.dirX, tz: a.dirZ });
  callout(w, e, "PINNED!");
  a.targetId = undefined;
  a.t = a.hitAt;
}

/** B hit frame: the rush ends; a carried champion (no wall) is shoved off the front of the charge. */
export function fireHeadbutt(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const o = a.targetId !== undefined ? w.get(a.targetId) : undefined;
  if (!o?.alive) return;
  const t = e.transform;
  o.status.kvx += a.dirX * (def.knockback ?? 7);
  o.status.kvz += a.dirZ * (def.knockback ?? 7);
  o.status.stunUntil = Math.max(o.status.stunUntil, w.time + 0.25);
  fx(w, "headbuttHit", e.id, e.team, t.pos.x + a.dirX, t.y, t.pos.z + a.dirZ);
}

/** Switcheroo partner: the most threatened ally champion within range (hurt and/or with enemies on them). */
function switchAlly(w: World, e: Entity, range: number, cmd: Command | null): Entity | undefined {
  let best: Entity | undefined;
  let bs = -Infinity;
  const mag = cmd ? Math.hypot(cmd.moveX, cmd.moveZ) : 0;
  for (const o of w.entities) {
    if (o === e || !o.alive || !o.hero || o.hero.dead || o.team !== e.team || o.hero.jump) continue;
    const d = w.dist(e, o);
    if (d > range || d < 1) continue;
    let foes = 0;
    for (const f of w.entities) if (f.alive && f.hero && !f.hero.dead && f.team !== e.team && w.dist(o, f) < 5) foes++;
    let s = (1 - o.hp / o.maxHp) * 2 + foes - d * 0.05;
    if (mag > 0.3) {
      const al =
        ((o.transform.pos.x - e.transform.pos.x) * cmd!.moveX + (o.transform.pos.z - e.transform.pos.z) * cmd!.moveZ) /
        (d * mag);
      s += al * 2;
    }
    if (s > bs) {
      bs = s;
      best = o;
    }
  }
  return best;
}

/** Bot helper: the ally Switcheroo would pick, if any. */
export function switchTarget(w: World, e: Entity): Entity | undefined {
  return switchAlly(w, e, abilities(w, e).r.range ?? 8, null);
}

/** R start: lock the partner now (so the cast reads), swap at the hit frame. */
export function startSwitch(w: World, e: Entity, a: HeroAction, cmd: Command): void {
  const def = abilities(w, e).r;
  const o = switchAlly(w, e, def.range ?? 8, cmd);
  if (!o) {
    // Nobody to guard: Dig In (a firm stomp, his own clip and timing).
    a.kind = "digin";
    a.dur = def.digDur ?? 0.55;
    a.hitAt = def.digHitAt ?? 0.3;
    return;
  }
  a.targetId = o.id;
  const dx = o.transform.pos.x - e.transform.pos.x;
  const dz = o.transform.pos.z - e.transform.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  a.dirX = dx / l;
  a.dirZ = dz / l;
  e.transform.facing = Math.atan2(a.dirX, a.dirZ);
  fx(w, "switchMark", e.id, e.team, o.transform.pos.x, o.transform.y, o.transform.pos.z, {
    id: o.id,
    seconds: a.hitAt,
  });
}

export function fireSwitch(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const o = a.targetId !== undefined ? w.get(a.targetId) : undefined;
  const t = e.transform;
  if (!o?.alive || o.hero?.dead || o.hero?.jump || w.dist(e, o) > (def.range ?? 8) + 2) {
    fx(w, "switchFizzle", e.id, e.team, t.pos.x, t.y, t.pos.z);
    return;
  }
  const ax = t.pos.x;
  const az = t.pos.z;
  const bx = o.transform.pos.x;
  const bz = o.transform.pos.z;
  if (w.mapEvents.sealed(ax, az, bx, bz)) {
    fx(w, "switchFizzle", e.id, e.team, ax, t.y, az);
    return;
  }
  fx(w, "switch", e.id, e.team, ax, t.y, az, { tx: bx, tz: bz, id: o.id });
  w.teleport(e, bx, bz);
  w.teleport(o, ax, az);
  e.status.kvx = e.status.kvz = o.status.kvx = o.status.kvz = 0;
  e.transform.facing = Math.atan2(ax - bx, az - bz);
  // The ally is pulled out of the fight with a shield; marksman / caster partners also get a bigger shield and a
  // burst of speed (synergy).
  const cls = o.hero ? w.heroDef(o.hero.type).class : undefined;
  const syn = (cls && w.heroDef(e.hero!.type).synergy?.switchAlly?.[cls]) ?? 1;
  const amt = (def.heal ?? 120) * syn;
  addShield(o, amt, amt, def.seconds ?? 3, w.time);
  if (syn > 1) {
    const st = o.status;
    if (w.time >= st.buffUntil) st.buffDamageMul = 1;
    st.buffSpeedMul = Math.max(w.time < st.buffUntil ? st.buffSpeedMul : 1, def.speedMul ?? 1.3);
    st.buffUntil = Math.max(st.buffUntil, w.time + (def.slowSeconds ?? 2));
  }
  if (o.hero?.action?.name === "hit") o.hero.action = null;
  callout(w, e, syn > 1 ? "SWITCHEROO · BIG SHIELD" : "SWITCHEROO");
  switchStomp(w, e, def, bx, bz);
}

/** Talent (switchSlam): a stomp where he lands - where the partner stood, or under him when he Digs In. */
function switchStomp(w: World, e: Entity, def: AbilityDef, bx: number, bz: number): void {
  const sf = def.fx?.switchSlam;
  if (sf) {
    const sdef: AbilityDef = {
      kind: "slam",
      anim: "slam",
      damage: sf.damage,
      knockback: sf.knockback,
      stunSeconds: sf.stun,
    };
    w.emit({ type: "slam", x: bx, y: w.groundY(bx, bz), z: bz, radius: sf.radius, team: e.team, src: e.id });
    fx(w, "pound", e.id, e.team, bx, w.groundY(bx, bz), bz, { radius: sf.radius });
    aoe(w, e, bx, bz, sf.radius, sdef, w.damageMulOf(e));
  }
}

/**
 * R with no ally in reach - DIG IN: he stomps one hoof down. For digSeconds nothing moves him, stuns, slows, roots or
 * debuffs him (cleansed every tick, see hero/update.ts and world/damage.ts), his Grit is full at once, and his next
 * hit (whatever it is, whenever it lands) does digMul times its damage.
 */
export function fireDigIn(w: World, e: Entity, def: AbilityDef): void {
  const t = e.transform;
  const h = e.hero!;
  const secs = def.digSeconds ?? 3;
  e.status.steadfastUntil = w.time + secs;
  e.status.ccImmuneUntil = Math.max(e.status.ccImmuneUntil, w.time + secs);
  h.grit = 1;
  e.status.kvx = e.status.kvz = 0;
  fx(w, "digIn", e.id, e.team, t.pos.x, t.y, t.pos.z, { seconds: secs });
  callout(w, e, "DIG IN");
  switchStomp(w, e, def, t.pos.x, t.pos.z);
  // Banked after the (talent) stomp, so the stomp itself doesn't spend it.
  h.digPower = def.digMul ?? 1.6;
}

/** Crush Season: slam k (0..2) at its time; the last one flattens. */
const CRUSH_AT = [0.55, 1.05, 1.62];

export function startCrush(w: World, e: Entity, a: HeroAction): void {
  e.status.ccImmuneUntil = Math.max(e.status.ccImmuneUntil, w.time + a.dur);
}

export function crushTick(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  // Slam 0 is fired by fire() at hitAt; 1 and 2 here when their time passes.
  for (let k = 1; k < 3; k++) {
    const at = CRUSH_AT[k] * (a.dur / 2);
    if (a.t >= at && a.t - w.dt < at) crushSlam(w, e, a, def, k);
  }
}

export function crushSlam(w: World, e: Entity, a: HeroAction, def: AbilityDef, k: number): void {
  const t = e.transform;
  const radius = (def.radius ?? 4.4) * [0.6, 0.78, 1][k];
  const reach = 1.2 + k * 0.4;
  const cx = t.pos.x + a.dirX * reach;
  const cz = t.pos.z + a.dirZ * reach;
  const last = k === 2;
  const base = def.damage ?? 120;
  const sdef: AbilityDef = {
    kind: "crush",
    anim: "slam",
    damage: base * [0.45, 0.65, 1][k],
    knockback: last ? (def.knockback ?? 10) : 3 + k * 2,
    stunSeconds: last ? (def.stunSeconds ?? 1.2) : 0.25,
    structureDamage: last ? (def.structureDamage ?? 400) : (def.structureDamage ?? 400) * 0.25,
  };
  w.emit({ type: "slam", x: cx, y: w.groundY(cx, cz), z: cz, radius, team: e.team, src: e.id });
  fx(w, last ? "crushFinal" : "crush", e.id, e.team, cx, w.groundY(cx, cz), cz, { radius, id: k });
  aoe(w, e, cx, cz, radius, sdef, w.damageMulOf(e));
  if (last && def.fx?.zoneAfter) {
    const za = def.fx.zoneAfter;
    w.zones.push({
      id: w.newId(),
      team: e.team,
      ownerId: e.id,
      x: cx,
      z: cz,
      radius: za.radius ?? radius,
      until: w.time + za.seconds,
      dps: za.dps * w.damageMulOf(e),
      slowMul: za.slowMul,
      style: za.style,
    });
  }
}

/**
 * Dodge replacement: ANVIL CURL. A short low roll (shorter than a normal dodge) after which he ends with the anvil
 * on his back toward the nearest enemy champion; for curlSeconds hits from behind are almost fully blocked.
 */
export function startCurl(w: World, e: Entity, cmd: Command): boolean {
  const hk = hooksOf(w, e);
  if (!hk.curlSeconds) return false;
  const h = e.hero!;
  const t = e.transform;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const dx = mag > 0.2 ? cmd.moveX / mag : -Math.sin(t.facing);
  const dz = mag > 0.2 ? cmd.moveZ / mag : -Math.cos(t.facing);
  const dur = hk.curlDur ?? 0.36;
  h.action = { name: "dodge", kind: "curl", dur, hitAt: 99, combo: 0, t: 0, fired: false, dirX: dx, dirZ: dz };
  h.blocking = false;
  t.facing = Math.atan2(dx, dz);
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + dur * 0.7);
  h.cooldowns.dodge = w.time + dur + w.data.heroes.baseline.dodgeCooldown + 0.2;
  h.curlUntil = w.time + dur + hk.curlSeconds;
  fx(w, "curl", e.id, e.team, t.pos.x, t.y, t.pos.z, { seconds: dur + hk.curlSeconds });
  return true;
}

export function curlTick(w: World, e: Entity, a: HeroAction): void {
  const hk = hooksOf(w, e);
  const sp = hk.curlSpeed ?? 9;
  w.moveBy(e, a.dirX * sp * w.dt, a.dirZ * sp * w.dt);
  if (a.t + w.dt >= a.dur && !a.combo) {
    a.combo = 1;
    // End the roll with the anvil toward the nearest enemy champion (else toward where he rolled from).
    const t = e.transform;
    let best: Entity | undefined;
    let bd = 12;
    for (const o of w.entities) {
      if (!o.alive || !o.hero || o.hero.dead || o.team === e.team) continue;
      const d = w.dist(e, o);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    const ax = best ? t.pos.x - best.transform.pos.x : a.dirX;
    const az = best ? t.pos.z - best.transform.pos.z : a.dirZ;
    t.facing = Math.atan2(ax, az);
    callout(w, e, "ANVIL CURL");
  }
}
