// Ground hazards and terrain changes: expiring summons, traps, zones (damage/slow/heal/brew), delayed blasts,
// temporary terrain mods (walls/ramps/works), the tide cycle and chasm deaths.
import type { World } from "../world.ts";
import type { TerrainMod } from "../types.ts";
import { Kind } from "../terrain.ts";
import { healFrom, onZoneEnd } from "../hero/friar.ts";
import { onHootModEnd } from "../hero/architect.ts";

/** Step phase 5: expire timed entities, then traps, zones, delayed blasts and terrain mods (in that order). */
export function updateHazards(w: World): void {
  expireTimed(w);
  updateTraps(w);
  updateZones(w);
  updateDelayed(w);
  for (let i = w.mods.length - 1; i >= 0; i--) {
    const m = w.mods[i];
    if (w.time < m.until) continue;
    w.mods.splice(i, 1);
    revertMod(w, m);
  }
}

/** Summons, turrets and other entities with expiresAt simply vanish (no kill credit / bounty). */
function expireTimed(w: World): void {
  const t = w.time;
  for (const e of w.entities) {
    if (e.alive && e.expiresAt !== undefined && t >= e.expiresAt) {
      e.alive = false;
      w.emit({
        type: "death",
        id: e.id,
        kind: e.kind,
        x: e.transform.pos.x,
        y: e.transform.y,
        z: e.transform.pos.z,
        team: e.team,
        big: false,
      });
      if (e.structure && e.structure.padIndex < 0)
        w.nav.setBlocked(e.transform.pos.x, e.transform.pos.z, e.structure.cask ? 0.3 : e.radius, false);
    }
  }
}

/** Armed traps spring on any enemy body inside them; inside an owner's zone a rearm hook re-arms instead of consuming. */
function updateTraps(w: World): void {
  const t = w.time;
  for (let i = w.traps.length - 1; i >= 0; i--) {
    const tr = w.traps[i];
    if (t >= tr.until) {
      w.traps.splice(i, 1);
      continue;
    }
    if (t < tr.armAt) continue;
    const owner = w.get(tr.ownerId) ?? null;
    const victims = w.entities.filter(
      (o) =>
        o.alive &&
        o.team !== tr.team &&
        o.kind !== "structure" &&
        Math.hypot(o.transform.pos.x - tr.x, o.transform.pos.z - tr.z) < tr.radius + o.radius,
    );
    if (!victims.length) continue;
    w.emit({
      type: "slam",
      x: tr.x,
      y: w.groundY(tr.x, tr.z),
      z: tr.z,
      radius: tr.radius * 1.5,
      team: tr.team,
      src: tr.ownerId,
      trap: true,
    });
    for (const v of victims) w.damage(owner, v, tr.damage, { stun: tr.stun, fromX: tr.x, fromZ: tr.z, big: true });
    const rearm = owner?.hero ? w.heroDef(owner.hero.type).abilities.z.rearmSeconds : undefined;
    if (
      rearm &&
      w.zones.some((z) => z.ownerId === tr.ownerId && t < z.until && Math.hypot(z.x - tr.x, z.z - tr.z) <= z.radius)
    ) {
      tr.armAt = t + rearm;
      continue;
    }
    w.traps.splice(i, 1);
  }
}

/**
 * Zones: heal allies (every 15 ticks), grant brew (cleanses slows), and slow + damage enemies (damage every 15
 * ticks, as a DoT tick). A zone anchored to an entity ends when that entity dies.
 */
function updateZones(w: World): void {
  const t = w.time;
  for (let i = w.zones.length - 1; i >= 0; i--) {
    const z = w.zones[i];
    if (t >= z.until || (z.anchor !== undefined && !w.get(z.anchor))) {
      w.zones.splice(i, 1);
      onZoneEnd(w, z);
      continue;
    }
    const owner = w.get(z.ownerId) ?? null;
    const tickDmg = w.tick % 15 === 0;
    if (z.heal && tickDmg) {
      const healer = owner ?? w.getAny(z.ownerId);
      for (const o of w.entities) {
        if (!o.alive || o.team !== z.team || o.kind === "structure" || o.hp >= o.maxHp) continue;
        if (Math.hypot(o.transform.pos.x - z.x, o.transform.pos.z - z.z) > z.radius) continue;
        healFrom(w, healer, o, z.heal * 0.5);
        if (z.lingerHeal) {
          o.status.hotHps = z.heal;
          o.status.hotUntil = t + z.lingerHeal;
          o.status.hotOwner = z.ownerId;
          o.status.hotInZoneUntil = t + 0.6;
        }
        if (w.tick % 30 === 0)
          w.emit({ type: "heal", x: o.transform.pos.x, y: o.transform.y, z: o.transform.pos.z, team: z.team });
      }
    }
    if (z.brew) {
      for (const o of w.entities) {
        if (!o.alive || o.team !== z.team || o.kind === "structure") continue;
        if (Math.hypot(o.transform.pos.x - z.x, o.transform.pos.z - z.z) > z.radius) continue;
        o.status.brewUntil = t + 0.3;
        o.status.brewMul = z.brew;
        if (o.status.slowUntil > t && o.status.slowMul < 1) o.status.slowUntil = 0;
      }
    }
    if (z.slowMul >= 1 && z.dps <= 0 && !z.poison && !z.vuln) continue;
    for (const o of w.entities) {
      if (!o.alive || o.team === z.team || o.kind === "structure") continue;
      if (Math.hypot(o.transform.pos.x - z.x, o.transform.pos.z - z.z) > z.radius) continue;
      if (z.noHeal) o.status.noHealUntil = Math.max(o.status.noHealUntil ?? 0, t + z.noHeal);
      if (z.poison) {
        o.status.poisonDps = z.poison;
        o.status.poisonUntil = t + (z.poisonSeconds ?? 3);
        o.status.poisonOwner = z.ownerId;
      }
      if (z.vuln && !(o.status.markUntil > t && o.status.markMul >= z.vuln)) {
        o.status.markUntil = t + 0.3;
        o.status.markTeam = z.team;
        o.status.markAll = true;
        o.status.markMul = z.vuln;
        o.status.markWeaken = 1;
      }
      o.status.slowMul = Math.min(o.status.slowUntil > t ? o.status.slowMul : 1, z.slowMul);
      o.status.slowUntil = t + 0.3;
      if (tickDmg && z.dps > 0) w.damage(owner, o, z.dps * 0.5, { fromX: z.x, fromZ: z.z, tick: true });
    }
  }
}

/** Delayed ground blasts (telegraphed earlier) detonate when due, optionally hexing victims. */
function updateDelayed(w: World): void {
  const t = w.time;
  for (let i = w.delayed.length - 1; i >= 0; i--) {
    const d = w.delayed[i];
    if (t < d.at) continue;
    w.delayed.splice(i, 1);
    const owner = w.get(d.ownerId) ?? null;
    w.emit({ type: "slam", x: d.x, y: w.groundY(d.x, d.z), z: d.z, radius: d.radius, team: d.team });
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === d.team) continue;
      if (Math.hypot(o.transform.pos.x - d.x, o.transform.pos.z - d.z) - o.radius > d.radius) continue;
      if (d.hexSeconds && o.kind !== "structure") {
        o.status.hexUntil = t + d.hexSeconds;
        o.status.hexOwner = d.ownerId;
      }
      w.damage(owner, o, d.damage, {
        fromX: d.x,
        fromZ: d.z,
        slowMul: d.slowMul,
        slowSeconds: d.slowSeconds,
        knockback: 2,
        big: true,
      });
    }
  }
}

/** Apply a terrain mod (bridge-deck cells for ramps/works, wall cells otherwise), remembering what it replaced. */
export function applyMod(w: World, m: TerrainMod): void {
  const tr = w.terrain;
  if (w.mapEvents.locked) {
    const keep = m.cells.map((c) => tr.styles[c] !== "lockgate");
    m.cells = m.cells.filter((_, k) => keep[k]);
    m.deck = m.deck.filter((_, k) => keep[k]);
  }
  m.prevKind = m.cells.map((c) => tr.kinds[c]);
  m.prevDeck = m.cells.map((c) => tr.deck[c]);
  m.prevStyle = m.cells.map((c) => tr.styles[c]);
  m.cells.forEach((c, k) => {
    if (m.kind !== "wall") {
      tr.kinds[c] = Kind.Bridge;
      tr.deck[c] = m.deck[k];
      tr.styles[c] = m.kind === "works" ? "works" : "wood";
    } else {
      tr.kinds[c] = Kind.Wall;
      tr.styles[c] = "ruin";
    }
  });
  w.nav.recompute(m.cells);
  w.mods.push(m);
}

/** Apply a mod only if every team spawn stays reachable from team 0's (gates treated as open); else undo it. */
export function applyModIfOpen(w: World, m: TerrainMod): boolean {
  w.applyMod(m);
  const a = w.spawnPoint(0);
  let open = true;
  w.mapEvents.withGatesOpen(() => {
    for (let t = 1; t < w.teamCount && open; t++) if (!w.nav.findPath(a, w.spawnPoint(t))) open = false;
  });
  if (open) return true;
  w.mods.splice(w.mods.indexOf(m), 1);
  const tr = w.terrain;
  m.cells.forEach((c, k) => {
    tr.kinds[c] = m.prevKind[k];
    tr.deck[c] = m.prevDeck[k];
    tr.styles[c] = m.prevStyle![k];
  });
  w.nav.recompute(m.cells);
  return false;
}

/** Undo an expired mod: kill structures standing on it, restore cells, and re-ground or relocate stranded bodies. */
function revertMod(w: World, m: TerrainMod): void {
  const tr = w.terrain;
  for (const e of w.entities) {
    if (e.alive && (e.structure?.siege?.modId === m.id || e.structure?.onMod === m.id || e.structure?.works === m.id))
      w.kill(e, null);
  }
  m.cells.forEach((c, k) => {
    tr.kinds[c] = m.prevKind[k];
    tr.deck[c] = m.prevDeck[k];
    if (m.prevStyle) tr.styles[c] = m.prevStyle[k];
  });
  w.nav.recompute(m.cells);
  onHootModEnd(w, m);
  for (const e of w.entities) {
    if (!e.alive || e.kind === "structure") continue;
    const h = w.terrain.heightAt(e.transform.pos.x, e.transform.pos.z);
    if (Number.isFinite(h) && Math.abs(h - e.transform.y) < 1.5) {
      e.transform.y = h;
      continue;
    }
    const i = w.nav.nearestOpen(e.transform.pos.x, e.transform.pos.z, 6);
    if (i >= 0) w.teleport(e, (i % w.nav.w) + 0.5, Math.floor(i / w.nav.w) + 0.5);
  }
  w.emit({ type: "modEnd", id: m.id });
}

/** Tide height 0..1 at `time`: low for lowSeconds, then high for highSeconds, with 3s ramps (no ramp-down before the first high tide). */
export function tideLevel(w: World, time = w.time): number {
  const td = w.terrain.tide;
  if (!td) return 0;
  const cycle = td.lowSeconds + td.highSeconds;
  const t = time - td.firstSeconds;
  if (t < 0) return 0;
  const p = t % cycle;
  const ramp = 3;
  if (p < td.lowSeconds) return Math.max(0, 1 - p / ramp) * (t >= cycle ? 1 : 0);
  return Math.min(1, (p - td.lowSeconds) / ramp);
}

/** Flip tide cells between ford and ground when the tide phase changes, and force units to repath. */
export function updateTide(w: World): void {
  const td = w.terrain.tide;
  if (!td || !w.terrain.tideCells.length) return;
  const t = w.time - td.firstSeconds;
  const high = t >= 0 && t % (td.lowSeconds + td.highSeconds) >= td.lowSeconds;
  if (high === w.tideHigh) return;
  w.tideHigh = high;
  for (const i of w.terrain.tideCells) w.terrain.kinds[i] = high ? Kind.Ford : Kind.Ground;
  w.nav.recompute(w.terrain.tideCells);
  for (const e of w.entities) if (e.unit) e.unit.repathAt = 0;
  w.emit({ type: "tide", high });
}

/** Anything that ends up below the chasm floor dies; the last enemy to hurt it within 6s gets the kill. */
export function updateChasm(w: World): void {
  const below = w.terrain.chasm;
  if (below === undefined) return;
  for (const e of w.entities) {
    if (!e.alive || e.structure || (e.hero && e.hero.jump)) continue;
    const g = w.terrain.groundHeight(e.transform.pos.x, e.transform.pos.z);
    if (!(g < below) || e.transform.y > below + 0.6) continue;
    const by =
      e.status.hurtBy !== undefined && w.time - (e.status.hurtAt ?? -99) < 6 ? w.get(e.status.hurtBy) : undefined;
    w.emit({ type: "chasm", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z });
    w.kill(e, by && by.alive ? by : null);
  }
}
