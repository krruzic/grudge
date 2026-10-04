// Gravewalk (summoner R): channel, then teleport next to the team core or one of its ready pad structures (a
// "grave"). While the summoner stands near a grave structure it spawns faster and its tower fires faster
// (graveTick). Destinations are refused across sealed map gates.
import type { World } from "../world.ts";
import type { Command, Entity, HeroAction } from "../types.ts";
import type { AbilityDef } from "../config.ts";
import { abilities, addShield } from "../talents.ts";
import { begin } from "./common.ts";

export interface GraveSpot {
  id: number;
  x: number;
  z: number;
  keep: boolean;
}

/** Valid gravewalk destinations: the core (`keep`) and every ready own pad structure, not too close or sealed off. */
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

/** Land beside a pad structure on the side facing home, or at the team spawn for the core. */
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

/** R pressed: pick the placed grave (or the core), start the channel. Pressing near home without aiming refuses. */
export function graveBegin(w: World, e: Entity, cmd: Command, def: AbilityDef): void {
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
      if (d < bd) {
        bd = d;
        pick = s;
      }
    }
  }
  const s = pick ? graveValid(w, e, pick.id) : null;
  if (!s) {
    w.emit({
      type: "notice",
      team: e.team,
      text: w.mapEvents.locked ? "NO GRAVE TO WALK TO · GATES SHUT" : "NO GRAVE TO WALK TO",
    });
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
  if (def.callout)
    w.emit({ type: "callout", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, text: def.callout, owner: e.id });
  w.emit({
    type: "act",
    src: e.id,
    slot: "r",
    kind: "gravewalk",
    phase: "start",
    x: t.pos.x,
    y: t.y,
    z: t.pos.z,
    dirX: a.dirX,
    dirZ: a.dirZ,
    combo: 0,
    toX: land.x,
    toZ: land.z,
  });
}

/** Channel finished: teleport, start the real cooldown, remember the grave, optional hex burst on arrival. */
export function graveArrive(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
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
      w.damage(e, o, gb.damage * w.damageMulOf(e), {
        fromX: t.pos.x,
        fromZ: t.pos.z,
        slowMul: gb.slowMul,
        slowSeconds: gb.slowSeconds,
        knockback: 3,
        big: true,
      });
    }
    if (gb.shield) addShield(e, gb.shield, gb.shield, 6, w.time);
  }
}

/** While near its last grave, boost that structure's spawn rate and tower haste for this tick. */
export function graveTick(w: World, e: Entity, def: AbilityDef): void {
  const h = e.hero!;
  const g = h.grave;
  if (!g) return;
  const s = w.get(g.id);
  if (!s?.alive || s.team !== e.team || !s.structure || def.kind !== "gravewalk") {
    h.grave = undefined;
    return;
  }
  if (
    Math.hypot(s.transform.pos.x - e.transform.pos.x, s.transform.pos.z - e.transform.pos.z) >
    (def.radius ?? 6) + s.radius
  )
    return;
  const st = s.structure;
  const was = (st.graveUntil ?? 0) > w.time;
  st.graveUntil = w.time + 0.3;
  st.graveMul = def.spawnMul ?? 0.6;
  st.graveHaste = def.towerHaste ?? 1.5;
  st.graveRank = def.fx?.graveRank ?? 0;
  if (!was && st.spawnAt !== undefined && st.spawnAt > w.time)
    st.spawnAt = Math.min(st.spawnAt, w.time + w.arena.spawnInterval(s));
}
