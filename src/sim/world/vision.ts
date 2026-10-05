// Vision, cover and line of sight. Each tick updateStatusMods recomputes aura buffs and the hidden/seenBy flags:
// an entity in tall grass or mist (or smoked) is hidden from enemy teams unless they are adjacent, share its grass
// patch, or it has been marked. seenBy is a per-team bitmask.
import type { World } from "../world.ts";
import type { Entity } from "../types.ts";
import { FLAG_GRASS, Kind } from "../terrain.ts";
import { watched } from "../hero/architect.ts";

/**
 * Step phase 2: per-tick status refresh. For units: hero damage auras, the herald's command aura (around the hero
 * or its banner) and support-structure buffs. For every mobile entity: the hidden flag, then (for entities hidden
 * by cover rather than smoke) which enemy teams can still see it.
 */
export function updateStatusMods(w: World): void {
  const heroes = w.entities.filter((e) => e.hero && e.alive);
  const supports = w.entities.filter((e) => e.alive && e.structure?.type === "support" && e.structure.ready);
  const revealT = w.data.units.hiddenRevealSeconds;
  const covered: Entity[] = [];
  for (const e of w.entities) {
    if (!e.alive) continue;
    e.status.auraDamageMul = 1;
    e.status.supportDamageMul = 1;
    if (e.unit) applyUnitAuras(w, e, heroes, supports);
    if (e.kind !== "structure" && updateHidden(w, e, revealT)) covered.push(e);
  }
  const adj = w.data.units.hiddenAdjacent;
  for (const e of covered) {
    const s = e.status;
    // A mark reveals the target to the marking team (or the mark owner's team).
    if (w.time < s.markUntil) {
      const mt = s.markAll ? s.markTeam : (w.getAny(s.markOwner)?.team ?? -1);
      if (mt >= 0 && mt !== e.team) s.seenBy |= 1 << mt;
    }
    for (const o of w.entities) {
      if (!o.alive || o.kind === "structure" || o.team === e.team || o.team < 0 || s.seenBy & (1 << o.team)) continue;
      if (w.dist(o, e) <= adj + e.radius || w.sharesPatch(o, e)) s.seenBy |= 1 << o.team;
    }
  }
}

function applyUnitAuras(w: World, e: Entity, heroes: Entity[], supports: Entity[]): void {
  const s = e.status;
  for (const h of heroes) {
    if (h.team !== e.team) continue;
    const hooks = w.heroDef(h.hero!.type).hooks;
    if (hooks.auraRadius && w.dist(h, e) <= hooks.auraRadius)
      s.auraDamageMul = Math.max(s.auraDamageMul, hooks.auraDamageMul);
  }
  for (const h of heroes) {
    if (h.team !== e.team) continue;
    const hk = w.heroDef(h.hero!.type).hooks;
    const bp = w.rallyPoint(h.team);
    const nearBanner =
      !!bp && Math.hypot(e.transform.pos.x - bp.x, e.transform.pos.z - bp.z) <= (hk.commandAuraRadius ?? 0);
    // Only refreshes when no stronger timed buff (warcry etc.) is active.
    if (hk.commandAuraRadius && (w.dist(h, e) <= hk.commandAuraRadius || nearBanner) && w.time >= s.buffUntil) {
      s.buffUntil = w.time + 0.2;
      s.buffSpeedMul = hk.commandAuraSpeed ?? 1.1;
      s.buffDamageMul = 1;
    }
  }
  for (const st of supports) {
    if (st.team === e.team && w.dist(st, e) <= st.structure!.range)
      s.supportDamageMul = w.data.structures.types.support.damageMul ?? 1;
  }
}

/**
 * Hidden = (in grass/mist and hasn't attacked for revealT seconds) or smoked, unless pinned by Pip. Resets seenBy.
 * Returns true when hidden by cover (smoke-hidden entities can't be spotted by proximity).
 */
function updateHidden(w: World, e: Entity, revealT: number): boolean {
  const s = e.status;
  const inGrass = w.terrain.hasFlag(Math.floor(e.transform.pos.x), Math.floor(e.transform.pos.z), FLAG_GRASS);
  const cover = inGrass || w.mapEvents.misted(e.transform.pos.x, e.transform.pos.z);
  const smoked = w.time < s.stealthUntil;
  // Pinned by Pip, or in the watch of an enemy Watchtower lookout (Hoot): no hiding at all.
  const pipped = (s.pipUntil !== undefined && w.time < s.pipUntil) || (!!e.hero && watched(w, e));
  s.hidden = !pipped && ((cover && w.time - s.lastAttackAt > revealT) || smoked);
  s.seenBy = 0;
  return s.hidden && !smoked;
}

/** Connected tall-grass patch id at (x, z), 0 if none. Patches are 8-connected and computed lazily once. */
export function grassPatchAt(w: World, x: number, z: number): number {
  const t = w.terrain;
  if (!w.grassPatches) {
    const p = new Int32Array(t.width * t.depth);
    let next = 0;
    const stack: number[] = [];
    for (let i = 0; i < p.length; i++) {
      if (p[i] || !(t.flags[i] & FLAG_GRASS)) continue;
      p[i] = ++next;
      stack.push(i);
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % t.width;
        const cz = (c - cx) / t.width;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const n = t.index(cx + dx, cz + dz);
            if (n < 0 || p[n] || !(t.flags[n] & FLAG_GRASS)) continue;
            p[n] = next;
            stack.push(n);
          }
      }
    }
    w.grassPatches = p;
  }
  const i = t.index(Math.floor(x), Math.floor(z));
  return i < 0 ? 0 : w.grassPatches[i];
}

/** Both entities stand in the same grass patch (they can see each other). */
export function sharesPatch(w: World, a: Entity, b: Entity): boolean {
  const p = w.grassPatchAt(a.transform.pos.x, a.transform.pos.z);
  return p > 0 && p === w.grassPatchAt(b.transform.pos.x, b.transform.pos.z);
}

/** Whether `team` can currently see `target` (own team always can). */
export function visibleTo(w: World, team: number, target: Entity): boolean {
  const s = target.status;
  return !s.hidden || team === target.team || (team >= 0 && (s.seenBy & (1 << team)) !== 0);
}

export function spottedByAll(w: World, target: Entity): boolean {
  if (!target.status.hidden) return true;
  for (let t = 0; t < w.teamCount; t++) if (t !== target.team && !w.visibleTo(t, target)) return false;
  return true;
}

/** Team visibility, or close enough to sense a hidden target. */
export function canSee(w: World, viewer: Entity, target: Entity): boolean {
  if (w.visibleTo(viewer.team, target)) return true;
  return w.dist(viewer, target) <= w.data.units.hiddenAdjacent + target.radius;
}

/** High-ground range bonus for ranged attackers. */
export function rangeMul(w: World, attacker: Entity, target: Entity): number {
  const tr = w.data.match.terrain;
  return attacker.transform.y - target.transform.y >= tr.highGroundDelta ? tr.highGroundRangeMul : 1;
}

/** Height that blocks line of sight at a point: walls and props stand above the ground; bridges use their deck. */
export function losHeight(w: World, x: number, z: number): number {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  const k = w.terrain.kindAt(cx, cz);
  const g = w.terrain.groundHeight(x, z);
  if (k === Kind.Wall) return g + w.data.match.terrain.wallHeight;
  if (k === Kind.Prop) return g + 1.2;
  if (k === Kind.Bridge) return Math.min(g, w.terrain.deck[w.terrain.index(cx, cz)]);
  return g;
}

/** Ray-march between eye heights in 0.5-cell steps; blocked if any sample's losHeight exceeds the line + tolerance. */
export function los(w: World, a: Entity, b: Entity, tolerance: number, aHeight?: number): boolean {
  const eye = w.data.match.terrain.eyeHeight;
  const ax = a.transform.pos.x;
  const az = a.transform.pos.z;
  const ay = a.transform.y + (aHeight ?? eye);
  const bx = b.transform.pos.x;
  const bz = b.transform.pos.z;
  const by = b.transform.y + eye;
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(len / 0.5);
  for (let s = 1; s < steps; s++) {
    const f = s / steps;
    const x = ax + (bx - ax) * f;
    const z = az + (bz - az) * f;
    if (Math.hypot(x - ax, z - az) < a.radius + 0.2 || Math.hypot(x - bx, z - bz) < b.radius + 0.2) continue;
    const line = ay + (by - ay) * f;
    if (w.losHeight(x, z) > line + tolerance) return false;
  }
  return true;
}
