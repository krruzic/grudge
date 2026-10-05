// Architect (Professor Hoot): Vantage (hits harder from higher ground than the target), a carpenter's square thrown
// as a boomerang on a charged A (A again recalls it), Snow Fort (B: a short curved ice wall with a little health, up to
// two, allies behind it shrug off ranged hits), Lookout (R: a 2 m ice tower raised under him that soldiers can't
// climb), Avalanche Dome (Z: a frozen dome that slows foes, mends allies and stops every shot crossing its rim) and
// the Owl Hop (dodge: a flapping hop onto his Lookout, up a ledge or over his own fort).
import type { World } from "../world.ts";
import type { AbilityDef, HeroClass } from "../config.ts";
import type { Command, Entity, HeroAction, TerrainMod, Zone } from "../types.ts";
import { Kind } from "../terrain.ts";
import { abilities } from "../talents.ts";
import { callout, ready, refundCharge } from "./common.ts";

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

export function isArchitect(w: World, e: Entity): boolean {
  return !!e.hero && !!w.heroDef(e.hero.type).hooks.squareDamage;
}

const cellX = (w: World, i: number) => (i % w.terrain.width) + 0.5;
const cellZ = (w: World, i: number) => Math.floor(i / w.terrain.width) + 0.5;

/** One of this hero's lookouts that he is standing on top of. */
export function onLookout(w: World, e: Entity): TerrainMod | undefined {
  const i = w.terrain.index(Math.floor(e.transform.pos.x), Math.floor(e.transform.pos.z));
  return w.mods.find(
    (m) => m.style === "lookout" && m.team === e.team && m.cells.includes(i) && e.transform.y > (m.top ?? 0) - 0.4,
  );
}

/** Vantage: x highGroundMul when at least highGroundHeight above the target (x perchMul more on his own lookout). */
export function highGroundMul(w: World, src: Entity, target: Entity): number {
  if (!src.hero) return 1;
  const hk = w.heroDef(src.hero.type).hooks;
  if (!hk.highGroundMul || src.transform.y - target.transform.y < (hk.highGroundHeight ?? 0.9)) return 1;
  const perch = abilities(w, src).r.perchMul;
  return perch && onLookout(w, src) ? hk.highGroundMul * perch : hk.highGroundMul;
}

/** Frostbite talent: chilled (slowed) foes take chillMul more from him. */
export function chillMul(w: World, src: Entity, target: Entity): number {
  if (!src.hero || !w.heroDef(src.hero.type).hooks.highGroundMul) return 1;
  const m = abilities(w, src).a.chillMul;
  return m && w.time < target.status.slowUntil && target.status.slowMul < 1 ? m : 1;
}

/** Frostbite talent: combo hits chill (slow) what they hit. */
export function chillTargets(w: World, e: Entity, targets: Entity[]): void {
  const a = abilities(w, e).a;
  if (!a.chillSlow) return;
  for (const o of targets) {
    if (!o.alive || o.structure) continue;
    o.status.slowMul = Math.min(o.status.slowUntil > w.time ? o.status.slowMul : 1, a.chillSlow);
    o.status.slowUntil = Math.max(o.status.slowUntil, w.time + (a.chillSeconds ?? 1.5));
  }
}

/** Partner of the given class on his house (2v2 / team deathmatch). */
function partnerOf(w: World, e: Entity, table: Partial<Record<HeroClass, number>> | undefined): number | undefined {
  if (!table) return undefined;
  for (const p of w.players) {
    if (p.team !== e.team || p.heroId === e.id) continue;
    const cls = w.heroDef(p.heroType).class;
    if (cls && table[cls] !== undefined) return table[cls];
  }
  return undefined;
}

// --- A: the square -------------------------------------------------------------------------------------------

/**
 * Charged A (or A while the square is out): throw the square as a boomerang, or call a flying one back early.
 * Returns true when the input was used.
 */
export function squareInput(w: World, e: Entity, cmd: Command): boolean {
  const h = e.hero!;
  if (!cmd.attack || h.action) return false;
  const mine = w.boomerangs.find((b) => b.ownerId === e.id);
  if (mine) {
    if (!mine.back) {
      mine.back = true;
      mine.hit = [];
      fx(w, "squareRecall", e.id, e.team, mine.x, mine.y, mine.z);
    }
    return true;
  }
  if ((cmd.charge ?? 0) < 0.25 || !ready(e, "square", w.time)) return false;
  const hk = w.heroDef(h.type).hooks;
  const t = e.transform;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  let dx = mag > 0.3 ? cmd.moveX / mag : Math.sin(t.facing);
  let dz = mag > 0.3 ? cmd.moveZ / mag : Math.cos(t.facing);
  const reach = (hk.squareRange ?? 9) * (abilities(w, e).a.throwRangeMul ?? 1) + 1;
  let best: Entity | null = null;
  let bs = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team || o.neutral || !w.canSee(e, o)) continue;
    const ox = o.transform.pos.x - t.pos.x;
    const oz = o.transform.pos.z - t.pos.z;
    const d = Math.hypot(ox, oz);
    if (d > reach || d < 0.1) continue;
    const along = (ox * dx + oz * dz) / d;
    if (along < 0.55) continue;
    const score = d + (o.hero ? -3 : 0) + (o.structure ? 2 : 0) - along * 2;
    if (score < bs) {
      bs = score;
      best = o;
    }
  }
  if (best) {
    const l = Math.hypot(best.transform.pos.x - t.pos.x, best.transform.pos.z - t.pos.z) || 1;
    dx = (best.transform.pos.x - t.pos.x) / l;
    dz = (best.transform.pos.z - t.pos.z) / l;
  }
  const a: HeroAction = {
    name: "a",
    kind: "squarethrow",
    dur: 0.5,
    hitAt: 0.22,
    combo: 0,
    t: 0,
    fired: false,
    dirX: dx,
    dirZ: dz,
  };
  h.action = a;
  t.facing = Math.atan2(dx, dz);
  h.blocking = false;
  h.cooldowns.square = w.time + (hk.squareCooldown ?? 2.5);
  return true;
}

/** Fire frame of the throw: launch the square (damage scales with the charge via the action's power). */
export function throwSquare(w: World, e: Entity, a: HeroAction): void {
  const t = e.transform;
  const hk = w.heroDef(e.hero!.type).hooks;
  const ab = abilities(w, e).a;
  const pw = a.power ?? 1;
  w.boomerangs.push({
    id: w.newId(),
    ownerId: e.id,
    team: e.team,
    x: t.pos.x + a.dirX * 0.8,
    z: t.pos.z + a.dirZ * 0.8,
    y: t.y + 1.3,
    dirX: a.dirX,
    dirZ: a.dirZ,
    dist: 0,
    back: false,
    hit: [],
    damage: (hk.squareDamage ?? 55) * w.damageMulOf(e),
    range: (hk.squareRange ?? 9) * (ab.throwRangeMul ?? 1) * (1 + (pw - 1) * 0.4),
    style: "square",
    speedMul: ab.throwSpeedMul,
    slowMul: ab.chillSlow,
    slowSeconds: ab.chillSeconds,
    cdrB: ab.throwCdr,
    stun: ab.throwStun,
  });
  w.emit({ type: "shot", style: "square", x: t.pos.x, y: t.y + 1.3, z: t.pos.z });
}

// --- B: Snow Fort ----------------------------------------------------------------------------------------------

/** Cells of a curved wall: an arc of `radius` around a pivot behind the centre, bowed toward the hero. */
function fortCells(w: World, cx: number, cz: number, dx: number, dz: number, len: number): number[] {
  const R = 3.2;
  const px = cx - dx * R;
  const pz = cz - dz * R;
  const half = len / 2 / R;
  const base = Math.atan2(dx, dz);
  const cells: number[] = [];
  for (let s = -half; s <= half + 1e-6; s += 0.12) {
    const ang = base + s;
    const x = px + Math.sin(ang) * R;
    const z = pz + Math.cos(ang) * R;
    const i = w.terrain.index(Math.floor(x), Math.floor(z));
    if (i < 0 || cells.includes(i)) continue;
    cells.push(i);
  }
  return cells;
}

function buildable(w: World, e: Entity, i: number): boolean {
  const k = w.terrain.kinds[i];
  if (k !== Kind.Ground && k !== Kind.Ford) return false;
  const x = cellX(w, i);
  const z = cellZ(w, i);
  if (w.pads.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) return false;
  return !w.entities.some(
    (o) =>
      o.alive &&
      (o.kind === "structure" || (o.hero && o.team === e.team)) &&
      Math.abs(o.transform.pos.x - x) < 0.5 + o.radius &&
      Math.abs(o.transform.pos.z - z) < 0.5 + o.radius,
  );
}

/** Anchor structure carrying a mod's health (like Stig's works): killing it ends the mod. */
function anchorFor(
  w: World,
  e: Entity,
  m: TerrainMod,
  x: number,
  z: number,
  radius: number,
  hp: number,
  y: number,
): Entity {
  const s = w.addEntity(e.team, "structure", radius, x, z, hp);
  s.structure = {
    type: "damage",
    padIndex: -1,
    level: 1,
    builtAt: w.time,
    ready: true,
    nextAction: w.time + 9999,
    range: 0,
    damage: 0,
    lastFireAt: -99,
    shielded: false,
    works: m.id,
    siege: { cooldown: 9999, vs: {}, modId: m.id },
  };
  s.transform.y = y;
  s.owner = e.id;
  w.emit({ type: "build", id: s.id, padIndex: -1, team: e.team, upgrade: false });
  return s;
}

/** Shove bodies out of freshly raised cells (to the side they were on); enemies take `damage` and are slowed. */
function clearCells(w: World, e: Entity, cells: number[], ox: number, oz: number, def: AbilityDef, mul: number): void {
  for (const o of w.entities.slice()) {
    if (!o.alive || o.kind === "structure") continue;
    const i = w.terrain.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z));
    if (!cells.includes(i)) continue;
    const rx = o.transform.pos.x - ox;
    const rz = o.transform.pos.z - oz;
    const rl = Math.hypot(rx, rz) || 1;
    const j = w.nav.nearestOpen(o.transform.pos.x + (rx / rl) * 1.4, o.transform.pos.z + (rz / rl) * 1.4, 4);
    if (j >= 0) w.teleport(o, (j % w.nav.w) + 0.5, Math.floor(j / w.nav.w) + 0.5);
    if (o.team !== e.team && def.damage)
      w.damage(e, o, def.damage * mul, {
        fromX: ox,
        fromZ: oz,
        knockback: 4,
        stun: def.stunSeconds,
        slowMul: 0.6,
        slowSeconds: 1.5,
        big: true,
      });
  }
}

/** B: raise a short curved ice wall ahead (or where aimed). Oldest fort melts when over the limit. */
export function fireFort(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const cx = a.placed ? a.toX! : t.pos.x + a.dirX * (def.offset ?? 2.6);
  const cz = a.placed ? a.toZ! : t.pos.z + a.dirZ * (def.offset ?? 2.6);
  const cells = fortCells(w, cx, cz, a.dirX, a.dirZ, def.length ?? 5).filter((i) => buildable(w, e, i));
  if (cells.length < 2) {
    w.emit({ type: "notice", team: e.team, text: "NO ROOM FOR A FORT" });
    refundCharge(w, e, "b", 2);
    return;
  }
  const mine = w.mods.filter((m) => m.style === "ice" && m.owner === e.id && m.until > w.time);
  const max = def.max ?? 2;
  for (let k = 0; k <= mine.length - max; k++) mine[k].until = w.time;
  const m: TerrainMod = {
    id: w.newId(),
    kind: "wall",
    team: e.team,
    owner: e.id,
    style: "ice",
    cells,
    prevKind: [],
    prevDeck: [],
    deck: [],
    until: w.time + (def.seconds ?? 12),
    cx,
    cz,
  };
  if (!w.applyModIfOpen(m)) {
    w.emit({ type: "notice", team: e.team, text: "WOULD BLOCK THE ROAD" });
    refundCharge(w, e, "b", 1);
    return;
  }
  const y = w.groundY(cx, cz);
  anchorFor(w, e, m, cx, cz, 0.9, def.hp ?? 220, y);
  w.emit({ type: "mod", id: m.id });
  // Shove from the pivot side so bodies end up in front of or behind the arc, never inside it.
  clearCells(w, e, cells, cx - a.dirX * 3.2, cz - a.dirZ * 3.2, def, mul);
  const burst = def.fx?.frostBurst;
  if (burst) {
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === e.team || o.kind === "structure") continue;
      if (Math.hypot(o.transform.pos.x - cx, o.transform.pos.z - cz) - o.radius > burst.radius) continue;
      w.damage(e, o, burst.damage * mul, {
        fromX: cx,
        fromZ: cz,
        knockback: 3,
        stun: burst.stun,
        slowMul: burst.slowMul,
        slowSeconds: burst.slowSeconds,
        big: true,
      });
    }
  }
  fx(w, "fortRise", e.id, e.team, cx, y, cz, { radius: burst?.radius ?? 0, id: m.id, tx: a.dirX, tz: a.dirZ });
}

/**
 * Snow Fort cover: a ranged hit (source more than 4 m away) on someone standing close behind one of their house's
 * forts - the fort between them and the shooter - is reduced to coverMul.
 */
export function fortCoverMul(w: World, src: Entity | null, target: Entity): number {
  if (!src || target.structure) return 1;
  let mul = 1;
  for (const m of w.mods) {
    if (m.style !== "ice" || m.team !== target.team || m.cx === undefined) continue;
    const tx = target.transform.pos.x - m.cx;
    const tz = target.transform.pos.z - m.cz!;
    if (Math.hypot(tx, tz) > 4) continue;
    const sx = src.transform.pos.x - m.cx;
    const sz = src.transform.pos.z - m.cz!;
    if (Math.hypot(src.transform.pos.x - target.transform.pos.x, src.transform.pos.z - target.transform.pos.z) < 4)
      continue;
    if (tx * sx + tz * sz >= 0) continue;
    const owner = m.owner !== undefined ? w.getAny(m.owner) : undefined;
    const b = owner?.hero ? abilities(w, owner).b : undefined;
    mul = Math.min(mul, b?.coverMul ?? 0.6);
  }
  return mul;
}

// --- R: Lookout ------------------------------------------------------------------------------------------------

function lookoutCells(w: World, e: Entity, size: number, cx0: number, cz0: number): number[] | null {
  const tr = w.terrain;
  const lo = -Math.floor((size - 1) / 2);
  const hi = lo + size - 1;
  const cells: number[] = [];
  for (let dz = lo; dz <= hi; dz++)
    for (let dx = lo; dx <= hi; dx++) {
      const i = tr.index(cx0 + dx, cz0 + dz);
      if (i < 0) return null;
      const k = tr.kinds[i];
      if (k !== Kind.Ground && k !== Kind.Ford && k !== Kind.Water) return null;
      const x = cellX(w, i);
      const z = cellZ(w, i);
      if (w.pads.some((p) => Math.hypot(p.x - x, p.z - z) < w.data.structures.padRadius + 0.6)) return null;
      if (
        w.entities.some(
          (o) => o.alive && o.structure && Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) < o.radius + 0.7,
        )
      )
        return null;
      cells.push(i);
    }
  return cells;
}

/** R: an ice tower raised under him (cells around his feet), one at a time; R again topples it with Collapse. */
export function fireLookout(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const tr = w.terrain;
  const size = partnerOf(w, e, w.heroDef(e.hero!.type).synergy?.lookout) ?? def.size ?? 2;
  const fx0 = Math.floor(t.pos.x - (size % 2 === 0 ? 0.5 : 0));
  const fz0 = Math.floor(t.pos.z - (size % 2 === 0 ? 0.5 : 0));
  let cells: number[] | null = null;
  let bx = 0;
  let bz = 0;
  const offsets: [number, number][] = [];
  for (let r = 0; r <= 2; r++)
    for (let oz = -r; oz <= r; oz++)
      for (let ox = -r; ox <= r; ox++) if (Math.max(Math.abs(ox), Math.abs(oz)) === r) offsets.push([ox, oz]);
  for (const [ox, oz] of offsets) {
    cells = lookoutCells(w, e, size, fx0 + ox, fz0 + oz);
    if (cells) {
      bx = fx0 + ox;
      bz = fz0 + oz;
      break;
    }
  }
  if (!cells) {
    w.emit({ type: "notice", team: e.team, text: "NO ROOM TO BUILD" });
    refundCharge(w, e, "r", 3);
    return;
  }
  let base = -Infinity;
  for (const i of cells)
    base = Math.max(base, tr.kinds[i] === Kind.Water ? tr.waterLevel : tr.groundHeight(cellX(w, i), cellZ(w, i)));
  const top = base + (def.height ?? 2);
  const lo = -Math.floor((size - 1) / 2);
  const cx = bx + 0.5 + lo + (size - 1) / 2;
  const cz = bz + 0.5 + lo + (size - 1) / 2;
  // Up to `max` lookouts stand at once (oldest falls first).
  const mine = w.mods.filter((m) => m.style === "lookout" && m.owner === e.id && m.until > w.time);
  for (const m of mine.slice(0, Math.max(0, mine.length - ((def.max ?? 1) - 1)))) m.until = Math.min(m.until, w.time);
  const m: TerrainMod = {
    id: w.newId(),
    kind: "works",
    team: e.team,
    owner: e.id,
    style: "lookout",
    cells,
    prevKind: [],
    prevDeck: [],
    deck: cells.map(() => top),
    until: w.time + (def.seconds ?? 10),
    cx,
    cz,
    top,
  };
  if (!w.applyModIfOpen(m)) {
    w.emit({ type: "notice", team: e.team, text: "WOULD BLOCK THE ROAD" });
    refundCharge(w, e, "r", 3);
    return;
  }
  // Allies on the footprint ride up with it; enemies are shoved off the edge.
  for (const o of w.entities.slice()) {
    if (!o.alive || o.kind === "structure") continue;
    const oi = tr.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z));
    if (!cells.includes(oi)) continue;
    if (o.team === e.team) {
      o.transform.y = top;
      continue;
    }
    const rx = o.transform.pos.x - cx;
    const rz = o.transform.pos.z - cz;
    const rl = Math.hypot(rx, rz) || 1;
    const j = w.nav.nearestOpen(cx + (rx / rl) * (size / 2 + 1.2), cz + (rz / rl) * (size / 2 + 1.2), 4);
    if (j >= 0) w.teleport(o, (j % w.nav.w) + 0.5, Math.floor(j / w.nav.w) + 0.5);
  }
  if (!cells.includes(tr.index(Math.floor(t.pos.x), Math.floor(t.pos.z)))) {
    w.teleport(e, cx, cz);
  }
  t.y = top;
  const anchor = anchorFor(w, e, m, cx, cz, size / 2 + 0.4, def.hp ?? 300, base);
  const ice = def.fx?.icicles;
  if (ice) {
    // Icicle Belfry: the tower itself shoots (a siege shooter, so it may hit buildings too, at a third).
    const st = anchor.structure!;
    st.range = ice.range;
    st.damage = ice.damage;
    st.nextAction = w.time + 0.6;
    st.siege = { cooldown: ice.cooldown, vs: { structure: 0.35 }, modId: m.id };
    st.shotStyle = "icicle";
    anchor.transform.y = top - 1.2;
  }
  w.emit({ type: "mod", id: m.id });
  fx(w, "lookoutRise", e.id, e.team, cx, base, cz, { radius: size, id: m.id, seconds: def.height ?? 2 });
}

/** Collapse talent: R while a lookout of his stands topples it now (its burst goes off as it falls). */
export function toppleLookout(w: World, e: Entity): boolean {
  if (!abilities(w, e).r.fx?.collapse) return false;
  const m = w.mods.find((k) => k.style === "lookout" && k.owner === e.id && k.until > w.time);
  if (!m) return false;
  m.until = w.time;
  return true;
}

/** A Hoot mod ending (time, broken or toppled): Collapse / Shatter talent bursts. Called from revertMod. */
export function onHootModEnd(w: World, m: TerrainMod): void {
  if ((m.style !== "lookout" && m.style !== "ice") || m.owner === undefined || m.cx === undefined) return;
  const owner = w.getAny(m.owner);
  if (!owner?.hero) return;
  const ab = abilities(w, owner);
  const c = m.style === "lookout" ? ab.r.fx?.collapse : ab.b.fx?.shatter;
  const y = w.groundY(m.cx, m.cz!);
  fx(w, m.style === "lookout" ? "lookoutFall" : "fortFall", owner.id, owner.team, m.cx, y, m.cz!, {
    radius: c?.radius ?? 0,
    id: m.id,
  });
  if (!c) return;
  const mul = owner.alive ? w.damageMulOf(owner) : owner.hero.damageMul;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === owner.team || o.kind === "structure") continue;
    if (Math.hypot(o.transform.pos.x - m.cx, o.transform.pos.z - m.cz!) - o.radius > c.radius) continue;
    w.damage(owner.alive ? owner : null, o, c.damage * mul, {
      fromX: m.cx,
      fromZ: m.cz,
      knockback: 6,
      stun: c.stun,
      slowMul: c.slowMul,
      slowSeconds: c.slowSeconds,
      big: true,
    });
  }
}

// --- Z: Avalanche Dome -----------------------------------------------------------------------------------------

/** Z: a frozen dome at the aim point (or on him): foes inside slowed, allies inside mended, shots stopped at the rim. */
export function fireDome(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const x = a.placed ? a.toX! : t.pos.x;
  const z = a.placed ? a.toZ! : t.pos.z;
  const r = def.radius ?? 5.5;
  const zone: Zone = {
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x,
    z,
    radius: r,
    until: w.time + (def.seconds ?? 6),
    dps: 0,
    slowMul: def.slowMul ?? 0.55,
    style: "dome",
    heal: def.heal ?? 30,
    dome: true,
  };
  w.zones.push(zone);
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.kind === "structure") continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > r) continue;
    w.damage(e, o, (def.damage ?? 60) * mul, {
      fromX: x,
      fromZ: z,
      knockback: 2,
      stun: def.stunSeconds,
      slowMul: def.slowMul ?? 0.55,
      slowSeconds: 1.5,
      big: true,
    });
  }
  fx(w, "dome", e.id, e.team, x, w.groundY(x, z), z, { radius: r, seconds: def.seconds ?? 6, id: zone.id });
}

/** True when an active dome's rim lies between source and target (a shot from more than 3.2 m away). */
export function domeBlocks(w: World, src: Entity | null, target: Entity): boolean {
  if (!src || !w.zones.length) return false;
  const sx = src.transform.pos.x;
  const sz = src.transform.pos.z;
  const tx = target.transform.pos.x;
  const tz = target.transform.pos.z;
  for (const zn of w.zones) {
    if (!zn.dome || w.time >= zn.until) continue;
    const inS = Math.hypot(sx - zn.x, sz - zn.z) <= zn.radius;
    const inT = Math.hypot(tx - zn.x, tz - zn.z) <= zn.radius;
    if (inS === inT || Math.hypot(sx - tx, sz - tz) <= 3.2) continue;
    // One-way ice: the dome's own house shoots out of it (and into it) freely; only the enemy is walled off.
    if (src.team === zn.team) continue;
    // Where the shot meets the rim, for the ice-spark effect.
    let k = 0;
    for (; k < 1; k += 0.05) {
      const px = sx + (tx - sx) * k;
      const pz = sz + (tz - sz) * k;
      if (Math.hypot(px - zn.x, pz - zn.z) <= zn.radius !== inS) break;
    }
    const px = sx + (tx - sx) * k;
    const pz = sz + (tz - sz) * k;
    const owner = w.getAny(zn.ownerId);
    fx(w, "domeBlock", zn.ownerId, zn.team, px, w.groundY(px, pz) + 1.2, pz);
    if (owner?.hero && target.team === zn.team) owner.hero.combatAt = w.time;
    return true;
  }
  return false;
}

// --- Dodge: Owl Hop ---------------------------------------------------------------------------------------------

/**
 * Dodge replacement: a flapping hop up onto his Lookout (within 6 m), else up onto ground at least 0.6 m higher a few
 * metres along the stick, else over one of his snow forts just ahead. Returns true when a hop started.
 */
export function owlHop(w: World, e: Entity, cmd: Command): boolean {
  if (!isArchitect(w, e)) return false;
  const h = e.hero!;
  const t = e.transform;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  const mx = mag > 0.2 ? cmd.moveX / mag : Math.sin(t.facing);
  const mz = mag > 0.2 ? cmd.moveZ / mag : Math.cos(t.facing);
  const done = (text: string) => {
    h.cooldowns.dodge = w.time + w.data.heroes.baseline.dodgeSeconds + w.data.heroes.baseline.dodgeCooldown + 0.2;
    e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.3);
    callout(w, e, text);
    fx(w, "owlHop", e.id, e.team, t.pos.x, t.y, t.pos.z);
    return true;
  };
  const lk = w.mods.find((m) => m.style === "lookout" && m.owner === e.id && m.until > w.time && m.cx !== undefined);
  if (lk && !onLookout(w, e)) {
    const d = Math.hypot(lk.cx! - t.pos.x, lk.cz! - t.pos.z);
    if (d < 6.5 && w.startJump(e, lk.cx!, lk.cz!, 0.55, 2.6)) return done("HOP UP");
  }
  const tr = w.terrain;
  for (let d = 2.2; d <= 4.6; d += 0.4) {
    const x = t.pos.x + mx * d;
    const z = t.pos.z + mz * d;
    const hgt = tr.heightAt(x, z);
    if (!Number.isFinite(hgt) || hgt < t.y + 0.6 || hgt > t.y + 3.2) continue;
    const i = w.nav.index(Math.floor(x), Math.floor(z));
    if (i < 0 || !w.nav.open(i)) continue;
    if (w.startJump(e, x, z, 0.5, Math.max(1.6, hgt - t.y + 1))) return done("OWL HOP");
  }
  for (let d = 0.8; d <= 2.6; d += 0.3) {
    const i = tr.index(Math.floor(t.pos.x + mx * d), Math.floor(t.pos.z + mz * d));
    if (!w.mods.some((m) => m.style === "ice" && m.team === e.team && m.cells.includes(i))) continue;
    for (let far = d + 2.4; far >= d + 1.4; far -= 0.5)
      if (w.startJump(e, t.pos.x + mx * far, t.pos.z + mz * far, 0.5, 2.4)) return done("FORT HOP");
    break;
  }
  return false;
}

/** Bot helper: the lookout this hero owns, if any. */
export function myLookout(w: World, e: Entity): TerrainMod | undefined {
  return w.mods.find((m) => m.style === "lookout" && m.owner === e.id && m.until > w.time);
}

/** Bot helper: how many of his forts stand. */
export function fortCount(w: World, e: Entity): number {
  return w.mods.filter((m) => m.style === "ice" && m.owner === e.id && m.until > w.time).length;
}
