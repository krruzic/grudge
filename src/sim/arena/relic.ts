// The Grudge relic: waiting -> home (at the arena centre) -> carried -> enshrined in a tower/keep (boosting it and
// tithing gold to its team) -> stolen back by an enemy channelling next to the shrine, or dropped when the carrier
// dies/is stunned (dropped relics return home after a while).
import type { Arena } from "../arena.ts";
import type { Entity } from "../types.ts";

/** Relic state machine (skipped in training). */
export function updateRelic(arena: Arena): void {
  const w = arena.w;
  const r = arena.relic;
  const cfg = w.data.match.arena.relic;
  if (r.state === "waiting") {
    if (w.time < r.since) return;
    reset(arena);
    w.emit({ type: "notice", team: -1, text: "THE GRUDGE AWAKENS" });
    return;
  }
  if (r.state === "carried") {
    const c = w.get(r.carrier);
    if (!c || !c.alive || c.hero?.dead) {
      arena.drop(c ?? null, r.x, r.z);
      return;
    }
    if (w.time < c.status.stunUntil) {
      arena.drop(c, c.transform.pos.x + c.status.kvx * 0.12, c.transform.pos.z + c.status.kvz * 0.12);
      return;
    }
    r.x = c.transform.pos.x;
    r.z = c.transform.pos.z;
    r.y = c.transform.y;
    const shrine = shrineNear(arena, c);
    if (shrine) {
      if (r.channel === 0 && w.time - arena.crackNoticeAt > 4) {
        arena.crackNoticeAt = w.time;
        w.emit({ type: "notice", team: -1, text: `P${c.hero!.player + 1} IS ENSHRINING THE GRUDGE` });
      }
      r.channel += w.dt;
      if (r.channel >= cfg.enshrineSeconds) enshrine(arena, c, shrine);
    } else r.channel = 0;
    return;
  }
  if (r.state === "shrined") {
    updateShrine(arena);
    return;
  }
  if (r.state === "dropped" && w.time - r.since > cfg.returnSeconds) {
    reset(arena);
    w.emit({ type: "notice", team: -1, text: "THE GRUDGE RETURNS" });
    return;
  }
  for (const p of w.players) {
    const e = w.get(p.heroId);
    if (!e || !e.alive || e.hero?.dead) continue;
    if (e.id === r.lockId && w.time < r.lockUntil) continue;
    if (e.hero?.action?.kind === "dodge") continue;
    if (Math.hypot(e.transform.pos.x - r.x, e.transform.pos.z - r.z) > cfg.pickupRadius) continue;
    r.state = "carried";
    r.carrier = e.id;
    r.since = w.time;
    w.emit({ type: "relic", state: "taken", team: e.team, player: p.player, x: r.x, y: r.y, z: r.z });
    w.emit({ type: "notice", team: -1, text: `P${p.player + 1} HAS THE GRUDGE` });
    return;
  }
}

/** Return the relic to its home spot. */
function reset(arena: Arena): void {
  const r = arena.relic;
  r.state = "home";
  r.x = arena.home.x;
  r.z = arena.home.z;
  r.y = arena.w.groundY(r.x, r.z);
  r.carrier = 0;
  r.since = arena.w.time;
  arena.w.emit({ type: "relic", state: "home", team: -1, player: -1, x: r.x, y: r.y, z: r.z });
}

/** Drop the carried relic at (x, z); the dropper can't re-take it for dropLockSeconds. */
export function drop(arena: Arena, from: Entity | null, x: number, z: number): void {
  const w = arena.w;
  const r = arena.relic;
  if (r.state !== "carried") return;
  const p = arena.snap(x, z);
  r.state = "dropped";
  r.channel = 0;
  r.x = p.x;
  r.z = p.z;
  r.y = w.groundY(p.x, p.z);
  r.since = w.time;
  r.lockId = from?.id ?? 0;
  r.lockUntil = w.time + w.data.match.arena.relic.dropLockSeconds;
  r.carrier = 0;
  w.emit({
    type: "relic",
    state: "dropped",
    team: from?.team ?? -1,
    player: from?.hero?.player ?? -1,
    x: r.x,
    y: r.y,
    z: r.z,
  });
  w.emit({ type: "notice", team: -1, text: "GRUDGE DROPPED!" });
}

/** Structures that can hold the relic: the core, ready towers and pad outposts. */
export function isTowerOrKeep(arena: Arena, o: Entity): boolean {
  const st = o.structure;
  if (!st || st.siege || !st.ready) return false;
  if (st.type === "core") return true;
  const cls = arena.w.data.structures.types[st.type]?.class;
  return cls === "tower" || (cls === "production" && st.padIndex >= 0);
}

/** Own tower/keep within deliverReach of the carrier. */
function shrineNear(arena: Arena, c: Entity): Entity | null {
  const w = arena.w;
  const reach = w.data.match.arena.relic.deliverReach;
  let best: Entity | null = null;
  let bd = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team !== c.team || !arena.isTowerOrKeep(o)) continue;
    const d = w.dist(c, o) - o.radius;
    if (d <= reach && d < bd) {
      bd = d;
      best = o;
    }
  }
  return best;
}

export function shrineOf(arena: Arena, team: number): Entity | null {
  const r = arena.relic;
  if (r.state !== "shrined" || r.team !== team) return null;
  return arena.w.get(r.shrineId) ?? null;
}

export function heldBy(arena: Arena, team: number): boolean {
  const r = arena.relic;
  if (r.state === "shrined") return r.team === team;
  return false;
}

/** Damage/range multipliers for the tower currently holding the relic. */
export function towerBoost(arena: Arena, e: Entity): { damage: number; range: number } {
  const r = arena.relic;
  const cfg = arena.w.data.match.arena.relic;
  if (r.state === "shrined" && r.shrineId === e.id && e.structure?.type !== "core")
    return { damage: cfg.towerDamageMul, range: cfg.towerRangeMul };
  return { damage: 1, range: 1 };
}

function enshrine(arena: Arena, c: Entity, s: Entity): void {
  const w = arena.w;
  const r = arena.relic;
  const sp = s.transform;
  r.state = "shrined";
  r.shrineId = s.id;
  r.team = c.team;
  r.carrier = 0;
  r.channel = 0;
  r.stealer = 0;
  r.since = w.time;
  r.x = sp.pos.x;
  r.z = sp.pos.z;
  r.y = sp.y;
  const where = s.structure!.type === "core" ? "KEEP" : "TOWER";
  w.emit({
    type: "relic",
    state: "shrined",
    team: c.team,
    player: c.hero!.player,
    x: sp.pos.x,
    y: sp.y,
    z: sp.pos.z,
  });
  w.emit({ type: "notice", team: -1, text: `${w.teamName(c.team)} ENSHRINES THE GRUDGE IN A ${where}` });
}

/** Enshrined: regen the keep's ward; an enemy hero standing next to it uninterrupted for stealSeconds frees the relic. */
function updateShrine(arena: Arena): void {
  const w = arena.w;
  const r = arena.relic;
  const cfg = w.data.match.arena.relic;
  const s = w.get(r.shrineId);
  if (!s || !s.alive) {
    const p = arena.snap(r.x + 1.5, r.z);
    r.state = "dropped";
    r.x = p.x;
    r.z = p.z;
    r.y = w.groundY(p.x, p.z);
    r.since = w.time;
    r.lockId = 0;
    r.team = -1;
    r.shrineId = 0;
    w.emit({ type: "relic", state: "dropped", team: -1, player: -1, x: r.x, y: r.y, z: r.z });
    w.emit({ type: "notice", team: -1, text: "THE SHRINE FELL · GRUDGE LOOSE!" });
    return;
  }
  if (s.structure!.type === "core" && !w.isSudden()) {
    const st = s.structure!;
    st.ward = Math.min(w.wardMax, (st.ward ?? 0) + cfg.keepWardRegen * w.dt);
    st.shielded = (st.ward ?? 0) > 0;
  }
  let thief: Entity | null = null;
  let bd = Infinity;
  for (const p of w.players) {
    const e = w.get(p.heroId);
    if (!e || !e.alive || e.hero?.dead || e.team === r.team) continue;
    const d = w.dist(e, s) - s.radius;
    if (d <= cfg.stealReach && d < bd) {
      bd = d;
      thief = e;
    }
  }
  if (!thief || thief.id !== r.stealer || w.time - thief.hero!.combatAt < 0.05) {
    if (thief && thief.id !== r.stealer) w.emit({ type: "notice", team: r.team, text: "YOUR GRUDGE IS BEING STOLEN!" });
    r.stealer = thief?.id ?? 0;
    r.channel = 0;
    return;
  }
  r.channel += w.dt;
  if (r.channel < cfg.stealSeconds) return;
  const sp = s.transform;
  r.team = -1;
  r.shrineId = 0;
  r.stealer = 0;
  r.channel = 0;
  w.emit({
    type: "relic",
    state: "stolen",
    team: thief.team,
    player: thief.hero!.player,
    x: sp.pos.x,
    y: sp.y,
    z: sp.pos.z,
  });
  w.emit({ type: "notice", team: -1, text: `P${thief.hero!.player + 1} BROKE THE SHRINE · THE GRUDGE RETURNS` });
  reset(arena);
}
