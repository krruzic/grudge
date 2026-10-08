// Movement & collision for every mobile entity: speed multipliers, terrain step/slope rules, the moveBy solver
// (direct move, then axis slides, then fanned-out angles), knockback integration and soft body separation.
import type { World } from "../world.ts";
import type { Entity, Vec2 } from "../types.ts";
import { Kind } from "../terrain.ts";

// ---------------------------------------------------------------------------------------------------------------
// Speed & pacing
// ---------------------------------------------------------------------------------------------------------------

/** Product of every movement-speed modifier: status, zones, water, hero pacing/march, unit slope penalty. */
export function speedMul(w: World, e: Entity): number {
  const s = e.status;
  let m = w.ffa ? (w.data.match.ffa?.speedMul ?? 1) : 1;
  if (e.unit && !e.unit.guard) m *= w.terrain.unitSpeedMul;
  if (e.hero) m *= w.workshop(e)?.speed ?? 1;
  // Emberglass Mere: wading through a broken patch of the lake.
  const ice = w.mapEvents.iceDef;
  if (ice && w.mapEvents.inIceWater(e.transform.pos.x, e.transform.pos.z)) m *= ice.waterSlow;
  if (w.time < s.slowUntil) m *= s.slowMul;
  if (w.time < s.buffUntil) m *= s.buffSpeedMul;
  if (s.powerSpeedMul !== undefined) m *= s.powerSpeedMul;
  if (w.time < s.rallyUntil) m *= w.data.match.economy.rally.speedMul;
  if (e.hero) m *= w.mapEvents.hauntMul(e, "speed");
  for (const z of w.zones) {
    if (
      z.haste &&
      z.team === e.team &&
      w.time < z.until &&
      Math.hypot(e.transform.pos.x - z.x, e.transform.pos.z - z.z) <= z.radius
    ) {
      m *= z.haste;
      break;
    }
  }
  const cx = Math.floor(e.transform.pos.x);
  const cz = Math.floor(e.transform.pos.z);
  const kind = w.terrain.kindAt(cx, cz);
  if (kind === Kind.Ford) m *= w.data.match.terrain.fordSpeedMul;
  else if (kind === Kind.Water) m *= w.data.match.terrain.fordSpeedMul * 0.8;
  if (e.hero) m *= w.pacingMul(e);
  if (e.hero) {
    const hk = w.heroDef(e.hero.type).hooks;
    if (
      hk.marchSpeed &&
      w.time - e.hero.combatAt > (hk.marchAfter ?? 2.5) &&
      w.time - e.status.lastHitAt > (hk.marchAfter ?? 2.5)
    )
      m *= hk.marchSpeed;
  }
  if (e.unit) {
    const def = w.data.units.types[e.unit.type];
    if (
      def.slopeSpeedMul < 1 &&
      w.slopeAt(e.transform.pos.x, e.transform.pos.z) > w.data.match.terrain.slopeThreshold
    ) {
      m *= def.slopeSpeedMul;
    }
  }
  return m;
}

/**
 * Where a hero stands for pacing purposes: inside an enemy tower's reach ("enemyTower", checked first), inside an
 * own tower's or outpost's reach ("tower"), closer to its own core than any enemy core ("home"), else "field".
 */
export function turf(w: World, e: Entity): "home" | "tower" | "enemyTower" | "field" {
  const pc = w.data.match.pacing;
  const p = e.transform.pos;
  let own = false;
  for (const o of w.entities) {
    if (!o.alive || !o.structure || !o.structure.range || o.structure.type === "core") continue;
    if (w.data.structures.types[o.structure.type as keyof typeof w.data.structures.types]?.class !== "tower") continue;
    const d = Math.hypot(o.transform.pos.x - p.x, o.transform.pos.z - p.z);
    if (d > o.structure.range * pc.towerReach) continue;
    if (o.team !== e.team) return "enemyTower";
    own = true;
  }
  if (!own) {
    for (const o of w.entities) {
      if (!o.alive || o.team !== e.team || !o.structure?.ready || o.structure.padIndex < 0) continue;
      if (w.data.structures.types[o.structure.type as keyof typeof w.data.structures.types]?.class !== "production")
        continue;
      if (Math.hypot(o.transform.pos.x - p.x, o.transform.pos.z - p.z) <= pc.outpostReach) {
        own = true;
        break;
      }
    }
  }
  if (own) return "tower";
  const mine = w.get(w.teams[e.team]?.coreId ?? -1);
  const theirs = w.foeCore(e.team, p.x, p.z);
  if (mine && theirs) {
    const dm = Math.hypot(mine.transform.pos.x - p.x, mine.transform.pos.z - p.z);
    const dt = Math.hypot(theirs.transform.pos.x - p.x, theirs.transform.pos.z - p.z);
    if (dm < dt) return "home";
  }
  return "field";
}

/** Out of combat long enough for home regen and the calm speed bonus. */
export function calm(w: World, e: Entity): boolean {
  return !!e.hero && w.time - e.hero.combatAt >= w.data.match.pacing.calmSeconds;
}

/** Hero-only speed pacing: fast at home, slow under enemy towers, slower right after attacking or carrying. */
export function pacingMul(w: World, e: Entity): number {
  const pc = w.data.match.pacing;
  const h = e.hero!;
  let m = 1;
  const turf = w.turf(e);
  if (turf === "home" || turf === "tower") m *= pc.homeSpeedMul;
  else if (turf === "enemyTower") m *= pc.towerIntruderMul;
  if (w.calm(e)) m *= pc.calmSpeedMul;
  if (w.time - h.actionEndAt < pc.commitSeconds) m *= pc.commitMul;
  if (w.arena.carrying(e) && !w.tdm) m *= w.data.match.arena.relic.carrySpeedMul;
  return m;
}

/** Central-difference ground gradient magnitude (used for unit slope slowdown). */
export function slopeAt(w: World, x: number, z: number): number {
  const t = w.terrain;
  const dx = t.groundHeight(x + 0.5, z) - t.groundHeight(x - 0.5, z);
  const dz = t.groundHeight(x, z + 0.5) - t.groundHeight(x, z - 0.5);
  return Math.hypot(dx, dz);
}

// ---------------------------------------------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------------------------------------------

/**
 * Can `e` occupy (x, z) from its current height? Rejects solid cells, steps taller than stepHeight (dropping down
 * is allowed for heroes and knocked entities), too-steep uphill slopes, and moving deeper into a structure.
 */
export function canStand(w: World, e: Entity, x: number, z: number): boolean {
  const b = w.data.heroes.baseline;
  const step = e.hero?.stepHeight ?? b.stepHeight;
  const maxSlope = e.hero?.maxSlope ?? b.maxSlope;
  const hc = w.terrain.heightAt(x, z);
  if (!Number.isFinite(hc)) return false;
  const falling = (w.knocked || !!e.hero) && hc < e.transform.y - step;
  if (!falling && Math.abs(hc - e.transform.y) > step) return false;
  if (!falling && w.terrain.slopeAt(x, z) > maxSlope && !(hc < e.transform.y - 0.01)) return false;
  return !hitsStructure(w, e, x, z);
}

function solidCell(w: World, cx: number, cz: number): boolean {
  return !Number.isFinite(w.terrain.heightAt(cx + 0.5, cz + 0.5));
}

/** Push the entity's circle (radius capped at 0.55) out of overlapping solid cells; up to 3 passes. */
function pushOut(w: World, e: Entity): void {
  const t = e.transform;
  const r = Math.min(e.radius, 0.55);
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (let cz = Math.floor(t.pos.z - r); cz <= Math.floor(t.pos.z + r); cz++) {
      for (let cx = Math.floor(t.pos.x - r); cx <= Math.floor(t.pos.x + r); cx++) {
        if (!solidCell(w, cx, cz)) continue;
        const px = Math.max(cx, Math.min(cx + 1, t.pos.x));
        const pz = Math.max(cz, Math.min(cz + 1, t.pos.z));
        const dx = t.pos.x - px;
        const dz = t.pos.z - pz;
        const d = Math.hypot(dx, dz);
        if (d >= r || d < 1e-6) continue;
        const nx = t.pos.x + (dx / d) * (r - d);
        const nz = t.pos.z + (dz / d) * (r - d);
        if (!Number.isFinite(w.terrain.heightAt(nx, nz))) continue;
        t.pos.x = nx;
        t.pos.z = nz;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Overlapping a structure (or the arena shop) and getting closer to it - moving away is always allowed. */
function hitsStructure(w: World, e: Entity, x: number, z: number): boolean {
  const ah = w.arena?.home;
  if (ah) {
    const d = Math.hypot(ah.x - x, ah.z - z);
    if (d < 1.15 + e.radius * 0.8 && d < Math.hypot(ah.x - e.transform.pos.x, ah.z - e.transform.pos.z)) return true;
  }
  for (const s of w.entities) {
    if (!s.alive || s.kind !== "structure" || s === e || s.structure?.works !== undefined) continue;
    const d = Math.hypot(s.transform.pos.x - x, s.transform.pos.z - z);
    const min = s.radius + e.radius * 0.8;
    if (d < min) {
      const cur = Math.hypot(s.transform.pos.x - e.transform.pos.x, s.transform.pos.z - e.transform.pos.z);
      if (d < cur) return true;
    }
  }
  return false;
}

/** Search rings (0.25..3 cells, 16 angles) for the closest standable point; heroes prefer not to step up. */
export function nearestStandable(w: World, e: Entity, x: number, z: number): Vec2 | null {
  const y = e.transform.y;
  const slide = !!e.hero;
  let up: Vec2 | null = null;
  for (let r = 0.25; r <= 3; r += 0.25) {
    let best: Vec2 | null = null;
    let bestDy = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.sin(a) * r;
      const pz = z + Math.cos(a) * r;
      const h = w.terrain.heightAt(px, pz);
      if (!Number.isFinite(h)) continue;
      e.transform.y = h;
      const ok = w.canStand(e, px, pz);
      e.transform.y = y;
      if (!ok) continue;
      if (slide && h > y + 0.05) {
        up ??= { x: px, z: pz };
        continue;
      }
      if (Math.abs(h - y) < bestDy) {
        bestDy = Math.abs(h - y);
        best = { x: px, z: pz };
      }
    }
    if (best) return best;
  }
  return up;
}

function stuckHere(w: World, e: Entity): boolean {
  const t = e.transform;
  return !w.canStand(e, t.pos.x, t.pos.z);
}

/** canStand, but an entity that is already stuck may also take any step that doesn't climb too far. */
function accept(w: World, e: Entity, x: number, z: number, escaping: boolean): boolean {
  if (w.canStand(e, x, z)) return true;
  if (!escaping) return false;
  const h = w.terrain.heightAt(x, z);
  return (
    Number.isFinite(h) && Math.abs(h - e.transform.y) <= (e.hero?.stepHeight ?? w.data.heroes.baseline.stepHeight) * 1.5
  );
}

/**
 * Move by (dx, dz) with sliding. Tries, in order: escape toward the nearest standable spot if currently stuck; the
 * full move; each axis alone (larger first); then rotating the move up to +-1.6 rad in 0.2 rad steps. A candidate
 * is rejected if pushOut leaves it with < 30% of the intended progress. Returns whether the entity moved.
 */
export function moveBy(w: World, e: Entity, dx: number, dz: number): boolean {
  const t = e.transform;
  if (dx === 0 && dz === 0) return false;
  const escaping = stuckHere(w, e);
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const place = (x: number, z: number) => {
    const ox = t.pos.x;
    const oz = t.pos.z;
    t.pos.x = x;
    t.pos.z = z;
    pushOut(w, e);
    const h = w.terrain.heightAt(t.pos.x, t.pos.z);
    if (
      !Number.isFinite(h) ||
      (Math.abs(h - t.y) > (e.hero?.stepHeight ?? w.data.heroes.baseline.stepHeight) + 0.05 &&
        !((w.knocked || !!e.hero) && h < t.y))
    ) {
      t.pos.x = ox;
      t.pos.z = oz;
      return false;
    }
    const cx = x - ox;
    const cz = z - oz;
    const cl = Math.hypot(cx, cz) || 1;
    const progress = ((t.pos.x - ox) * cx + (t.pos.z - oz) * cz) / (cl * cl);
    if (progress < 0.3) {
      t.pos.x = ox;
      t.pos.z = oz;
      return false;
    }
    t.y = w.groundY(t.pos.x, t.pos.z);
    return true;
  };
  const tryMove = (mx: number, mz: number) =>
    accept(w, e, t.pos.x + mx, t.pos.z + mz, escaping) && place(t.pos.x + mx, t.pos.z + mz);
  if (escaping) {
    const safe = w.nearestStandable(e, t.pos.x, t.pos.z);
    if (safe) {
      const gx = safe.x - t.pos.x;
      const gz = safe.z - t.pos.z;
      const gl = Math.hypot(gx, gz);
      const k = Math.min(1, Math.max(len, 0.1) / Math.max(gl, 1e-6));
      t.pos.x += gx * k;
      t.pos.z += gz * k;
      t.y = w.groundY(t.pos.x, t.pos.z);
      return true;
    }
  }
  if (tryMove(dx, dz)) return true;
  const axes: [number, number][] =
    Math.abs(dx) > Math.abs(dz)
      ? [
          [dx, 0],
          [0, dz],
        ]
      : [
          [0, dz],
          [dx, 0],
        ];
  for (const [ox, oz] of axes) if (Math.hypot(ox, oz) > len * 0.3 && tryMove(ox, oz)) return true;
  for (let k = 1; k <= 8; k++) {
    const ang = k * 0.2;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const step = len * Math.max(0.4, c);
    for (const sg of [1, -1]) {
      const rx = ux * c - uz * sn * sg;
      const rz = ux * sn * sg + uz * c;
      if (tryMove(rx * step, rz * step)) return true;
    }
  }
  return false;
}

/** Turn toward (dx, dz) by at most rate * dt radians. */
export function faceToward(w: World, e: Entity, dx: number, dz: number, rate: number): void {
  if (Math.abs(dx) + Math.abs(dz) < 1e-5) return;
  const t = e.transform;
  const target = Math.atan2(dx, dz);
  let d = target - t.facing;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const maxTurn = rate * w.dt;
  t.facing += Math.max(-maxTurn, Math.min(maxTurn, d));
}

// ---------------------------------------------------------------------------------------------------------------
// Physics passes (step phase 6)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Pits (map holes, style "pit") are solid to walking but not to being knocked: an entity whose knockback carries its
 * leading edge over a pit cell falls in and dies, credited to whoever last hurt it within 6 s.
 */
function knockedIntoPit(w: World, e: Entity, dx: number, dz: number, step: number): boolean {
  if (e.hero?.jump || e.neutral) return false;
  const t = w.terrain;
  const x = e.transform.pos.x + dx * (step + 0.3);
  const z = e.transform.pos.z + dz * (step + 0.3);
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  if (cx < 0 || cz < 0 || cx >= t.width || cz >= t.depth || t.styles[cz * t.width + cx] !== "pit") return false;
  const by =
    e.status.hurtBy !== undefined && w.time - (e.status.hurtAt ?? -99) < 6 ? w.get(e.status.hurtBy) : undefined;
  e.transform.pos.x = x;
  e.transform.pos.z = z;
  w.emit({ type: "fall", x, y: e.transform.y, z });
  w.kill(e, by && by.alive ? by : null);
  return true;
}

/**
 * Wall splat: a shoved target whose knockback is stopped short by a wall or cliff (not a pit) takes extra damage and
 * double the shove stun, once per shove.
 */
function wallSplat(w: World, e: Entity, x0: number, z0: number, mx: number, mz: number): boolean {
  const want = Math.hypot(mx, mz);
  if (want < 0.05) return false;
  // Progress along the knockback direction (sliding along the wall doesn't count).
  const got = ((e.transform.pos.x - x0) * mx + (e.transform.pos.z - z0) * mz) / want;
  if (got > want * 0.4) return false;
  const s = e.status;
  const sv = w.data.heroes.baseline.shove;
  s.shovedUntil = 0;
  const src = s.shovedBy !== undefined ? w.get(s.shovedBy) : undefined;
  s.kvx = s.kvz = 0;
  w.damage(src ?? null, e, (sv.splatDamage ?? 30) * (src ? w.damageMulOf(src) : 1), {
    stun: sv.stun * 2,
    fromX: x0,
    fromZ: z0,
    big: true,
  });
  w.emit({
    type: "callout",
    x: e.transform.pos.x,
    y: e.transform.y,
    z: e.transform.pos.z,
    team: src?.team ?? -1,
    text: "WALL SPLAT!",
    owner: e.id,
  });
  w.emit({
    type: "slam",
    x: e.transform.pos.x,
    y: e.transform.y,
    z: e.transform.pos.z,
    radius: 1.2,
    team: src?.team ?? -1,
  });
  return true;
}

/**
 * Integrate knockback velocity (exponential decay, 8/s). Strong knockback may carry entities off ledges; a big
 * enough drop deals fall damage and stuns.
 */
export function applyKnockback(w: World, dt: number): void {
  const pos = w.data.match.positional;
  for (const e of w.entities) {
    if (!e.alive || e.kind === "structure") continue;
    const s = e.status;
    if (Math.abs(s.kvx) + Math.abs(s.kvz) < 0.05) {
      s.kvx = s.kvz = 0;
      continue;
    }
    const y0 = e.transform.y;
    const speed = Math.hypot(s.kvx, s.kvz);
    w.knocked = speed >= pos.knockDropMin;
    if (w.knocked && knockedIntoPit(w, e, s.kvx / speed, s.kvz / speed, speed * dt)) continue;
    const x0 = e.transform.pos.x;
    const z0 = e.transform.pos.z;
    w.moveBy(e, s.kvx * dt, s.kvz * dt);
    w.knocked = false;
    if (w.time < (s.shovedUntil ?? 0) && wallSplat(w, e, x0, z0, s.kvx * dt, s.kvz * dt)) continue;
    const drop = y0 - e.transform.y;
    // Featherfall (hooks.featherFall, Hoot): wings break the fall - no fall damage or stun.
    if (drop >= pos.fallMin && !(e.hero && w.heroDef(e.hero.type).hooks.featherFall)) {
      e.transform.prevY = y0;
      w.emit({ type: "fall", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z });
      w.damage(null, e, e.maxHp * pos.fallDamageFrac * Math.min(2, drop / pos.fallMin), {
        stun: pos.fallStun,
        fromX: e.transform.pos.x,
        fromZ: e.transform.pos.z,
      });
      if (!e.alive) continue;
    }
    // On the frozen lake a knocked body skates: slower decay, and while it's still sliding fast it counts as
    // shoved, so a wall it skates into is a wall splat.
    const ice = w.mapEvents.iceDef;
    const skating = !!ice && w.mapEvents.onIce(e.transform.pos.x, e.transform.pos.z);
    if (skating && speed > 5) s.shovedUntil = Math.max(s.shovedUntil ?? 0, w.time + 0.05);
    const decay = Math.exp(-dt * (skating ? ice!.knockDecay : 8));
    s.kvx *= decay;
    s.kvz *= decay;
  }
}

/**
 * Pairwise soft separation of overlapping bodies (O(n^2) in entity order). Heroes are pushed less than units;
 * enemies don't separate from a flurrying hero so its hits can pin them.
 */
export function separate(w: World): void {
  const list = w.entities.filter((e) => e.alive && e.kind !== "structure");
  const push = w.data.units.separationPush;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (a.team !== b.team && (a.hero?.action?.kind === "flurry" || b.hero?.action?.kind === "flurry")) continue;
      const pa = a.transform.pos;
      const pb = b.transform.pos;
      const dx = pb.x - pa.x;
      const dz = pb.z - pa.z;
      const minD = a.radius + b.radius;
      if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue;
      let d = Math.hypot(dx, dz);
      if (d >= minD) continue;
      let nx = dx;
      let nz = dz;
      if (d < 1e-4) {
        nx = Math.cos(a.id);
        nz = Math.sin(a.id);
        d = 1;
      }
      const over = (minD - Math.hypot(dx, dz)) * push;
      const wa = a.hero ? 0.25 : b.hero ? 0.75 : 0.5;
      const px = (nx / d) * over;
      const pz = (nz / d) * over;
      w.moveBy(a, -px * wa * 2, -pz * wa * 2);
      w.moveBy(b, px * (1 - wa) * 2, pz * (1 - wa) * 2);
    }
  }
}
