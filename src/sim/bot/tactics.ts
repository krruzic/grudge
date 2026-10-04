// Expert per-hero techniques: what a top player does with each kit beyond the generic think() rules (charged shots,
// hidden combos, timing tricks). think() calls these at fixed points; each returns quickly for other heroes.
//   wrenAbilities  Pip as a diver answer (pre-emptive Pip -> SKYSHOT -> TALON RAKE), Pip/arrows to break channels,
//                  Heartseeker held for a kill
//   wrenShoot      fully charged Vantage power shots from max range, standing still (high ground when close by)
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Entity, Vec2 } from "../types.ts";
import { abilities } from "../talents.ts";

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
