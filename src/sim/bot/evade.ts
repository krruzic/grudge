// CPU rolls and the frozen lake. Checked every tick (bot.ts command, after think): reads what a human could see -
// a telegraphed circle about to land, a big swing about to connect, a skillshot or a heavy homing shot about to
// arrive - and rolls out of it, each threat at most once and only on a skill roll (a CPU dodges some, not all).
// Also rolls after a fleeing, nearly dead champion, and on Emberglass Mere skates across the ice, keeps off broken
// or weakened patches when enemies are near, and finishes weakened ice under enemy champions (bot/think.ts goals
// are overridden here only to get out of a danger or off bad ice).
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Entity, Vec2 } from "../types.ts";

/** Seconds the CPU needs to have seen a threat before reacting (a human's read). */
const REACT = 0.12;
/** How far a roll carries (dodgeSpeed x dodgeSeconds, ~4 m); on ice it goes on sliding. */
const ROLL = 4.2;

const isMelee = (w: World, e: Entity) => (w.heroDef(e.hero!.type).botRange ?? 1.8) <= 3;

/** Telegraphed circles take longer to read than a swing aimed at you (where, and is it mine?). */
const REACT_CIRCLE = 0.25;

/** A threat may only be acted on once, and only after `react` seconds in view. */
function ripe(bot: Bot, w: World, key: string, react = REACT): boolean {
  if (bot.evaded.has(key)) return false;
  const seen = bot.evadeSeen.get(key);
  if (seen === undefined) {
    bot.evadeSeen.set(key, w.time);
    if (bot.evadeSeen.size > 64) bot.evadeSeen.delete(bot.evadeSeen.keys().next().value!);
    return false;
  }
  return w.time - seen >= react;
}

function spend(bot: Bot, key: string): void {
  bot.evaded.add(key);
  if (bot.evaded.size > 64) bot.evaded.delete(bot.evaded.values().next().value!);
}

/** Water (a broken lake patch) at (x, z), or a patch weak enough that one heavy blow breaks it. */
function badIce(w: World, x: number, z: number, weak: number): boolean {
  const ev = w.mapEvents;
  if (!ev.iceDef) return false;
  if (ev.inIceWater(x, z)) return true;
  if (weak <= 0) return false;
  const i = Math.floor(z) * w.terrain.width + Math.floor(x);
  const id = ev.icePatchOf[i] ?? -1;
  return id >= 0 && !ev.icePatches[id].broken && ev.icePatches[id].hp <= weak;
}

/** The roll direction among `dirs` (unit vectors) whose landing is open and dry; null if none. */
function landing(w: World, me: Entity, dirs: Vec2[]): Vec2 | null {
  const p = me.transform.pos;
  for (const d of dirs) {
    const x = p.x + d.x * ROLL;
    const z = p.z + d.z * ROLL;
    const i = w.nav.nearestOpen(x, z, 0);
    if (i < 0 || badIce(w, x, z, 0)) continue;
    if (!w.nav.lineClear(p, { x, z })) continue;
    return d;
  }
  return null;
}

function roll(bot: Bot, d: Vec2, key: string): void {
  bot.wantDodge = true;
  bot.wantFace = { x: d.x, z: d.z };
  bot.wantAttack = bot.wantB = bot.wantR = bot.wantZ = false;
  spend(bot, key);
}

/** Away from (x, z), then the two sides of that, then the two diagonals back. */
function awayDirs(me: Entity, x: number, z: number): Vec2[] {
  let dx = me.transform.pos.x - x;
  let dz = me.transform.pos.z - z;
  const l = Math.hypot(dx, dz);
  if (l < 0.3) {
    dx = Math.cos(me.id);
    dz = Math.sin(me.id);
  } else {
    dx /= l;
    dz /= l;
  }
  const rot = (a: number): Vec2 => ({ x: dx * Math.cos(a) - dz * Math.sin(a), z: dx * Math.sin(a) + dz * Math.cos(a) });
  return [rot(0), rot(0.9), rot(-0.9), rot(1.6), rot(-1.6)];
}

export function evade(bot: Bot, w: World, me: Entity): void {
  const h = me.hero!;
  if (h.action || h.jump || h.dead) return;
  const p = me.transform.pos;
  const canRoll = (h.cooldowns.dodge ?? 0) <= w.time && !bot.wantDodge && w.time >= (me.status.stunUntil ?? 0);
  const skill = bot.skill;

  // 1. Standing in a telegraphed circle (a hex, a slam, a splash, the serpent): walk out while there's time,
  //    roll out when it's about to land.
  for (const d of w.dangers) {
    if (d.team === me.team) continue;
    const dist = Math.hypot(p.x - d.x, p.z - d.z);
    if (dist > d.r + me.radius) continue;
    const left = d.until - w.time;
    const key = `z${d.x.toFixed(1)},${d.z.toFixed(1)},${d.until.toFixed(2)}`;
    // Read once, after a human's reaction time: about half the circles a CPU even notices in time.
    if (!ripe(bot, w, key, REACT_CIRCLE)) continue;
    let read = bot.evadeRead.get(key);
    if (read === undefined) {
      read = bot.rand() < skill * 0.6;
      bot.evadeRead.set(key, read);
      if (bot.evadeRead.size > 64) bot.evadeRead.delete(bot.evadeRead.keys().next().value!);
    }
    if (!read) continue;
    if (left < 0.45 && canRoll) {
      const dir = landing(w, me, awayDirs(me, d.x, d.z));
      if (dir) return roll(bot, dir, key);
    }
    if (left >= 0.3) {
      const out = (d.r + me.radius + 1.2) / Math.max(dist, 0.3);
      const [ax, az] = dist < 0.3 ? [Math.cos(me.id), Math.sin(me.id)] : [p.x - d.x, p.z - d.z];
      bot.goal = { x: d.x + ax * (dist < 0.3 ? d.r + 1.5 : out), z: d.z + az * (dist < 0.3 ? d.r + 1.5 : out) };
      return;
    }
  }

  if (canRoll) {
    // 2. A big swing about to land (finisher, charged blow, B / super) from a champion facing us.
    for (const o of w.entities) {
      if (!o.alive || !o.hero || o.hero.dead || o.team === me.team) continue;
      const a = o.hero.action;
      if (!a || a.fired || a.name === "dodge" || a.name === "hit" || a.name === "shove") continue;
      if (!w.canSee(me, o)) continue;
      const def = o.hero.ab ?? w.heroDef(o.hero.type).abilities;
      const big =
        a.name === "b" ||
        a.name === "z" ||
        (a.power ?? 1) > 1.25 ||
        (a.name === "a" && def.a.kind === "combo" && a.combo >= (def.a.hits?.length ?? 3) - 1);
      if (!big) continue;
      const reach = (a.name === "a" && def.a.kind === "combo" ? (def.a.hits?.[a.combo]?.range ?? 2.6) : 4) + 1;
      const d = w.dist(me, o);
      if (d > reach) continue;
      const toMe = { x: p.x - o.transform.pos.x, z: p.z - o.transform.pos.z };
      const tl = Math.hypot(toMe.x, toMe.z) || 1;
      if ((a.dirX * toMe.x + a.dirZ * toMe.z) / tl < 0.4) continue;
      const left = a.hitAt - a.t;
      if (left < 0.04 || left > 0.3) continue;
      const key = `s${o.id},${Math.round((w.time - a.t) * 20)}`;
      if (bot.evaded.has(key)) continue;
      spend(bot, key);
      if (bot.rand() >= skill * 0.55) continue;
      // Roll out to the side of the blow (a straight-back roll from melee was free kiting for the ranged champions).
      const away = awayDirs(me, o.transform.pos.x, o.transform.pos.z);
      const dir = landing(w, me, [away[3], away[4], away[1], away[2]]);
      if (dir) return roll(bot, dir, key);
    }

    // 3. A skillshot (arrow, harpoon, bolt) on line to hit us within a second: step out of its lane.
    for (const m of w.missiles) {
      if (m.team === me.team || m.damage < 35 || m.hit.includes(me.id)) continue;
      const rx = p.x - m.x;
      const rz = p.z - m.z;
      const along = rx * m.dirX + rz * m.dirZ;
      if (along < 0.5 || along > Math.min(m.range - m.dist, m.speed * 0.6)) continue;
      const side = rx * -m.dirZ + rz * m.dirX;
      if (Math.abs(side) > m.width + me.radius) continue;
      const key = `m${m.id}`;
      if (!ripe(bot, w, key)) continue;
      spend(bot, key);
      if (bot.rand() >= skill * 0.5) continue;
      const s = side >= 0 ? 1 : -1;
      const dir = landing(w, me, [
        { x: -m.dirZ * s, z: m.dirX * s },
        { x: m.dirZ * s, z: -m.dirX * s },
      ]);
      if (dir) return roll(bot, dir, key);
    }

    // 4. A heavy homing shot arriving: the roll's invulnerability makes it miss.
    for (const pr of w.projectiles) {
      if (pr.targetId !== me.id || pr.team === me.team || (pr.damage < 70 && !pr.splash)) continue;
      const left = pr.dur - pr.t;
      if (left > 0.25 || left < 0.03) continue;
      const key = `p${pr.id}`;
      if (bot.evaded.has(key)) continue;
      spend(bot, key);
      if (bot.rand() >= skill * 0.45) continue;
      const dir = landing(w, me, awayDirs(me, pr.from.x, pr.from.z).slice(1));
      if (dir) return roll(bot, dir, key);
    }

    // 5. A nearly dead champion getting away from a melee CPU just out of reach: roll after them.
    const prey = bot.fightId ? w.getAny(bot.fightId) : undefined;
    if (prey?.hero && !prey.hero.dead && isMelee(w, me) && !bot.healing && prey.hp < prey.maxHp * 0.3) {
      const d = w.dist(me, prey);
      const v = prey.hero.vel;
      const tx = prey.transform.pos.x - p.x;
      const tz = prey.transform.pos.z - p.z;
      if (d > 3 && d < 6.5 && v.x * tx + v.z * tz > 0) {
        const key = `c${prey.id},${Math.floor(w.time)}`;
        if (ripe(bot, w, key) && bot.rand() < skill * 0.5) {
          const l = Math.hypot(tx, tz) || 1;
          const dir = landing(w, me, [{ x: tx / l, z: tz / l }]);
          if (dir) return roll(bot, dir, key);
        }
      }
    }
  }

  if (w.mapEvents.iceDef) lake(bot, w, me, canRoll);
}

/**
 * Emberglass Mere: keep off water and (with an enemy champion near) off ice one heavy blow from breaking; break
 * weakened ice under an enemy champion with a shove or a big hit; skate across solid ice with rolls.
 */
function lake(bot: Bot, w: World, me: Entity, canRoll: boolean): void {
  const h = me.hero!;
  const ev = w.mapEvents;
  const d = ev.iceDef!;
  const p = me.transform.pos;
  const weak = d.hitMax + 5;
  const foeNear = w.entities.some((o) => o.alive && o.hero && !o.hero.dead && o.team !== me.team && w.dist(me, o) < 9);
  // Finish weakened ice under an enemy champion next to us: a shove (always heavy enough) or B.
  for (const o of w.entities) {
    if (!o.alive || !o.hero || o.hero.dead || o.team === me.team || w.dist(me, o) > 2.6) continue;
    if (!badIce(w, o.transform.pos.x, o.transform.pos.z, weak) || ev.inIceWater(o.transform.pos.x, o.transform.pos.z))
      continue;
    const key = `i${o.id},${Math.floor(w.time)}`;
    if (!ripe(bot, w, key) || bot.rand() >= bot.skill * 0.7) continue;
    spend(bot, key);
    const tx = o.transform.pos.x - p.x;
    const tz = o.transform.pos.z - p.z;
    const l = Math.hypot(tx, tz) || 1;
    bot.wantFace = { x: tx / l, z: tz / l };
    bot.fightId = o.id;
    if ((h.cooldowns.shove ?? 0) <= w.time) {
      bot.wantAttack = true;
      bot.wantBlock = true;
    } else if ((h.cooldowns.b ?? 0) <= w.time) bot.wantB = true;
    return;
  }
  // Off bad ice: the goal moved to dry, sound footing (the nearest open cell that isn't water or weak ice).
  const avoid = (x: number, z: number) => badIce(w, x, z, foeNear ? weak : 0);
  const g = bot.goal;
  if (avoid(p.x, p.z) || (g && avoid(g.x, g.z))) {
    const from = g && avoid(g.x, g.z) ? g : p;
    let best: Vec2 | null = null;
    let bd = Infinity;
    for (let r = 1; r <= 6 && !best; r++)
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const x = from.x + Math.cos(a) * r;
        const z = from.z + Math.sin(a) * r;
        if (avoid(x, z) || w.nav.nearestOpen(x, z, 0) < 0) continue;
        const dd = Math.hypot(x - p.x, z - p.z);
        if (dd < bd) {
          bd = dd;
          best = { x, z };
        }
      }
    if (best) bot.goal = best;
  }
  // Skate: a long way to go across solid ice and nobody close - roll toward the goal (the slide carries on).
  const gl = bot.goal;
  if (!canRoll || foeNear || !gl || !ev.onIce(p.x, p.z)) return;
  const gx = gl.x - p.x;
  const gz = gl.z - p.z;
  const gd = Math.hypot(gx, gz);
  if (gd < 8) return;
  const key = `k${Math.floor(w.time / 2)}`;
  if (!ripe(bot, w, key) || bot.rand() >= bot.skill * 0.8) return;
  const dir = { x: gx / gd, z: gz / gd };
  for (let s = 2; s <= 9; s += 1.5) if (badIce(w, p.x + dir.x * s, p.z + dir.z * s, 0)) return;
  if (landing(w, me, [dir])) roll(bot, dir, key);
}
