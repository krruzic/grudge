// Talent effect primitives shared by heroes and talents: shields, bleed, marks, chain lightning, pulls and
// lingering zones, plus the per-tick status pass (step phase 5: shield expiry, bleed ticks, recast windows).
import type { World } from "../world.ts";
import type { TalentFx } from "../config.ts";
import type { Entity } from "../types.ts";
import { abilities } from "../talents.ts";
import { healFrom } from "../hero/friar.ts";

/** Add to a status shield (stacking only while the previous one is active), capped at max. */
export function addShield(e: Entity, amount: number, max: number, seconds: number, time: number): void {
  const s = e.status;
  s.shield = Math.min(max, (time < s.shieldUntil ? s.shield : 0) + amount);
  s.shieldUntil = time + seconds;
}

export function heal(w: World, e: Entity, amount: number): void {
  if (amount <= 0 || !e.alive) return;
  w.heal(e, amount);
}

/** Add a bleed stack (refreshing duration; stacks reset if the bleed had expired). */
export function applyBleed(w: World, src: Entity, target: Entity, b: NonNullable<TalentFx["bleed"]>): void {
  if (target.structure) return;
  const s = target.status;
  const stacks = w.time < s.bleedUntil ? Math.min(b.max, s.bleedStacks + 1) : 1;
  s.bleedStacks = stacks;
  s.bleedDps = b.dps;
  s.bleedUntil = w.time + b.seconds;
  s.bleedOwner = src.id;
}

/** Mark a target for src (damage amp/weaken, reveal); `burst` detonates after 2s if the mark is unchanged. */
export function mark(w: World, src: Entity, target: Entity, m: NonNullable<TalentFx["mark"]>): void {
  if (target.structure) return;
  const s = target.status;
  s.markUntil = w.time + m.seconds;
  s.markTeam = src.team;
  s.markOwner = src.id;
  s.markMul = m.mul;
  s.markAll = !!m.all;
  s.markWeaken = m.weaken ?? 1;
  if (m.burst) {
    const until = s.markUntil;
    w.later(2, () => {
      if (!target.alive || target.status.markOwner !== src.id || target.status.markUntil !== until) return;
      const p = target.transform;
      w.emit({ type: "slam", x: p.pos.x, y: p.y, z: p.pos.z, radius: 1.6, team: src.team });
      w.damage(src.alive ? src : null, target, m.burst! * w.damageMulOf(src), {
        big: true,
        fromX: p.pos.x,
        fromZ: p.pos.z,
      });
    });
  }
}

/** Apply the B ability's mark talent to each hit target. */
export function markTargets(w: World, e: Entity, targets: Entity[]): void {
  const m = abilities(w, e).b.fx?.mark;
  if (!m) return;
  for (const o of targets) if (o.alive) mark(w, e, o, m);
}

/** Arc from `from` to up to `count` further visible enemies within 5.5 of each other. */
export function chainLightning(w: World, src: Entity, from: Entity, count: number, damage: number): void {
  const pts: number[] = [from.transform.pos.x, from.transform.y + 1.2, from.transform.pos.z];
  const done = new Set<number>([from.id]);
  let cur = from;
  for (let k = 0; k < count; k++) {
    let best: Entity | null = null;
    let bd = 5.5;
    for (const o of w.entities) {
      if (!o.alive || o.team === src.team || done.has(o.id) || o.structure || !w.canSee(cur, o)) continue;
      const d = w.dist(cur, o);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best) break;
    done.add(best.id);
    pts.push(best.transform.pos.x, best.transform.y + 1.2, best.transform.pos.z);
    w.damage(src, best, damage, { fromX: cur.transform.pos.x, fromZ: cur.transform.pos.z, knockback: 0.5 });
    cur = best;
  }
  if (pts.length > 3) w.emit({ type: "chain", pts, team: src.team });
}

/** Knock enemies within radius toward (cx, cz) (skips cc-immune targets). */
export function pullTo(w: World, src: Entity, cx: number, cz: number, radius: number, strength = 1): void {
  w.emit({ type: "pull", x: cx, y: w.groundY(cx, cz), z: cz, radius, team: src.team });
  for (const o of w.entities) {
    if (!o.alive || o.team === src.team || o.structure) continue;
    if (w.time < o.status.ccImmuneUntil) continue;
    const dx = cx - o.transform.pos.x;
    const dz = cz - o.transform.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > radius + o.radius || d < 0.6) continue;
    const k = Math.min(14, d * 3.2) * strength;
    o.status.kvx += (dx / d) * k;
    o.status.kvz += (dz / d) * k;
  }
}

/** Lingering talent zone (damage scaled by src's current damage multiplier). */
export function zoneAt(
  w: World,
  src: Entity,
  x: number,
  z: number,
  radius: number,
  z0: NonNullable<TalentFx["zoneAfter"]>,
): void {
  w.zones.push({
    id: w.newId(),
    team: src.team,
    ownerId: src.id,
    x,
    z,
    radius: z0.radius ?? radius,
    until: w.time + z0.seconds,
    dps: z0.dps * w.damageMulOf(src),
    slowMul: z0.slowMul,
    style: z0.style,
  });
}

/**
 * Home sanctuary: a hero standing inside its own castle walls with no enemy hero or soldier inside those walls heals
 * to full in 3 s. Enemy presence is computed once per tick per team.
 */
const homeSafe = { tick: -1, safe: [] as boolean[] };
function safeAtHome(w: World, e: Entity): boolean {
  const base = w.bases[e.team];
  if (!base || base.box[2] < base.box[0]) return false;
  const W = w.terrain.width;
  const cell = (o: Entity) => Math.floor(o.transform.pos.z) * W + Math.floor(o.transform.pos.x);
  if (!base.mask[cell(e)]) return false;
  if (homeSafe.tick !== w.tick) {
    homeSafe.tick = w.tick;
    homeSafe.safe = w.bases.map(() => true);
    for (const o of w.entities) {
      if (!o.alive || o.neutral || !(o.hero || o.unit) || o.hero?.dead) continue;
      w.bases.forEach((b, team) => {
        if (team !== o.team && b.mask[cell(o)]) homeSafe.safe[team] = false;
      });
    }
  }
  return homeSafe.safe[e.team];
}

export function tickStatus(w: World): void {
  const t = w.time;
  const tick = w.tick % 15 === 0;
  for (const e of w.entities) {
    if (!e.alive) continue;
    const s = e.status;
    if (s.shield > 0 && t >= s.shieldUntil) s.shield = 0;
    if (tick && t < s.bleedUntil && s.bleedStacks > 0) {
      const owner = w.get(s.bleedOwner) ?? null;
      w.damage(owner, e, s.bleedDps * s.bleedStacks * 0.5, {
        fromX: e.transform.pos.x,
        fromZ: e.transform.pos.z,
        tick: true,
      });
    }
    if (tick && s.hotUntil !== undefined && t < s.hotUntil && t >= (s.hotInZoneUntil ?? 0) && e.hp < e.maxHp)
      healFrom(w, w.getAny(s.hotOwner ?? 0), e, (s.hotHps ?? 0) * 0.5);
    if (tick && s.poisonUntil !== undefined && t < s.poisonUntil)
      w.damage(w.get(s.poisonOwner ?? 0) ?? null, e, (s.poisonDps ?? 0) * 0.5, {
        fromX: e.transform.pos.x,
        fromZ: e.transform.pos.z,
        tick: true,
      });
    const h = e.hero;
    if (!h) continue;
    if (!h.dead && e.hp < e.maxHp && safeAtHome(w, e)) e.hp = Math.min(e.maxHp, e.hp + (e.maxHp / 3) * w.dt);
    if (h.recastUntil && t >= h.recastUntil) {
      h.recastUntil = 0;
      const cd = abilities(w, e).b.cooldown ?? 4;
      h.cooldowns.b = Math.max(h.cooldowns.b ?? 0, t + cd * 0.7);
    }
    if (h.frenzy && t >= h.frenzyUntil) h.frenzy = 0;
  }
}
