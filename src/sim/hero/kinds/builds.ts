// Build/terrain ability kinds (mostly engineer and warden): repair, turret, siege works (raised platform + ramp
// as a temporary terrain mod), ballista, ramp, wall, trap and zone. Terrain changes go through w.applyMod /
// w.applyModIfOpen so they revert cleanly and never cut a team off from the others.
import type { World } from "../../world.ts";
import type { Entity, HeroAction, TerrainMod } from "../../types.ts";
import type { AbilityDef } from "../../config.ts";
import { Kind } from "../../terrain.ts";
import { addShield, pullTo, zoneAt } from "../../talents.ts";

/** Repair pulse: heal (and optionally shield/haste) own structures in radius, heal allies (overhaulHeal), hit enemies. */
/** Deathmatch: Stig's siege tower (works) and ballista are flimsier (tdm.buildHpMul); 1 elsewhere. */
function dmHp(w: World, kind: "tower" | "ballista"): number {
  return w.tdm?.cfg.buildHpMul?.[kind] ?? 1;
}

export function fireRepair(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const hk = w.heroDef(e.hero!.type).hooks;
  const fixed: { x: number; y: number; z: number; amount: number; h: number }[] = [];
  const fx = def.fx;
  const r = def.radius ?? 6;
  if (fx?.pull) pullTo(w, e, t.pos.x, t.pos.z, r + 1);
  for (const o of w.entities.slice()) {
    if (!o.alive || w.dist(e, o) - o.radius > r) continue;
    if (o.team === e.team && o.structure) {
      const before = o.hp;
      w.heal(o, def.heal ?? 200);
      fixed.push({
        x: o.transform.pos.x,
        y: o.transform.y,
        z: o.transform.pos.z,
        amount: Math.round(o.hp - before),
        h: o.structure.type === "core" ? 4.5 : 3.6,
      });
      if (fx?.structShield)
        addShield(o, fx.structShield.amount, fx.structShield.amount, fx.structShield.seconds, w.time);
      if (fx?.towerHaste && o.structure.type !== "core") {
        o.structure.hasteMul = fx.towerHaste.mul;
        o.structure.hasteUntil = w.time + fx.towerHaste.seconds;
      }
    } else if (o.team === e.team && fx?.allyShield) {
      addShield(o, fx.allyShield, fx.allyShield, 6, w.time);
    }
    if (o.team === e.team && o !== e && !o.structure && hk.overhaulHeal) {
      w.heal(o, o.hero ? hk.overhaulHeal * 0.5 : hk.overhaulHeal);
    } else if (o.team !== e.team && o.kind !== "structure") {
      w.damage(e, o, (def.damage ?? 30) * mul, {
        knockback: fx?.pull ? 0.5 : 3,
        stun: def.stunSeconds,
        big: !!def.stunSeconds,
      });
    }
  }
  if (fx?.zoneAfter) zoneAt(w, e, t.pos.x, t.pos.z, r, fx.zoneAfter);
  if (fx?.extendWalls) {
    for (const m of w.mods) {
      if (m.kind !== "wall" || m.owner !== e.id) continue;
      m.until += fx.extendWalls;
      fixed.push({
        x: (m.cells[0] % w.terrain.width) + 0.5,
        y: t.y,
        z: Math.floor(m.cells[0] / w.terrain.width) + 0.5,
        amount: 0,
        h: 2.4,
      });
    }
  }
  w.emit({
    type: "repair",
    x: t.pos.x,
    y: t.y,
    z: t.pos.z,
    team: e.team,
    radius: def.radius ?? 6,
    fixed,
    src: e.id,
  });
  if (!fixed.length) w.emit({ type: "notice", team: e.team, text: "NOTHING TO REPAIR IN REACH" });
}

/** Temporary turret at the nearest open cell to the target point. */
export function fireTurret(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const x = a.placed ? a.toX! : t.pos.x + a.dirX * 1.6;
  const z = a.placed ? a.toZ! : t.pos.z + a.dirZ * 1.6;
  const i = w.nav.nearestOpen(x, z, 3);
  if (i < 0) return;
  const sx = (i % w.nav.w) + 0.5;
  const sz = Math.floor(i / w.nav.w) + 0.5;
  const s = w.addEntity(e.team, "structure", 0.8, sx, sz, def.hp ?? 400);
  s.structure = {
    type: "damage",
    padIndex: -1,
    level: 1,
    builtAt: w.time,
    ready: true,
    nextAction: w.time + 0.3,
    range: def.range ?? 8,
    damage: def.damage ?? 40,
    lastFireAt: -99,
    shielded: false,
  };
  s.expiresAt = w.time + (def.seconds ?? 20);
  s.owner = e.id;
  if (def.fx?.tesla) s.structure.tesla = true;
  w.nav.setBlocked(sx, sz, 0.8, true);
  w.emit({ type: "build", id: s.id, padIndex: -1, team: e.team, upgrade: false });
}

/**
 * Siege works (engineer R): a raised size x size platform (as a bridge-deck terrain mod) plus a ramp leading up to
 * it (rampRun), and a destructible anchor structure that ends the mod when killed. Only one works per engineer.
 * Placements are tried until one can be walked up onto from where the hero stands without cutting any team off
 * (applyModIfOpen with a climb check): a pad, building or wall under the ramp used to leave a hole you couldn't
 * climb.
 */
export function fireWorks(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const tr = w.terrain;
  const size = def.size ?? 2;
  const lo = -Math.floor((size - 1) / 2);
  const hi = lo + size - 1;
  const half = size / 2;
  const blockedCell = (i: number): boolean => worksBlocked(w, i);
  const startDist = a.placed ? Math.max(2.5, Math.hypot(a.toX! - t.pos.x, a.toZ! - t.pos.z)) : (def.range ?? 5);
  // Every placement is tried for real - platform at decreasing distances, ramp toward the hero, then the sides and
  // the back - and kept only if the hero can walk up onto it from where he stands (and no road is cut).
  for (const m of w.mods) if (m.kind === "works" && m.owner === e.id) m.until = Math.min(m.until, w.time);
  let placed: { m: TerrainMod; plat: number[]; base: number; top: number; cx: number; cz: number } | null = null;
  let room = false;
  for (let dist = startDist; dist >= 2.5 && !placed; dist -= 0.5) {
    const pcx = Math.floor(t.pos.x + a.dirX * dist);
    const pcz = Math.floor(t.pos.z + a.dirZ * dist);
    const plat: number[] = [];
    let ok = true;
    for (let dz = lo; dz <= hi && ok; dz++)
      for (let dx = lo; dx <= hi; dx++) {
        const i = tr.index(pcx + dx, pcz + dz);
        if (i < 0 || blockedCell(i)) {
          ok = false;
          break;
        }
        plat.push(i);
      }
    if (!ok) continue;
    room = true;
    // Deck height: `height` above the highest ground (or water surface) under the platform.
    let base = -Infinity;
    for (const i of plat)
      base = Math.max(
        base,
        tr.kinds[i] === Kind.Ground
          ? tr.groundHeight((i % tr.width) + 0.5, Math.floor(i / tr.width) + 0.5)
          : tr.waterLevel,
      );
    const top = base + (def.height ?? 1.5);
    const cx = pcx + 0.5 + (lo + hi) / 2;
    const cz = pcz + 0.5 + (lo + hi) / 2;
    for (const [dx, dz] of [
      [a.dirX, a.dirZ],
      [-a.dirZ, a.dirX],
      [a.dirZ, -a.dirX],
      [-a.dirX, -a.dirZ],
    ]) {
      const run = rampRun(w, def, plat, cx, cz, half, size, top, dx, dz);
      const m: TerrainMod = {
        id: w.newId(),
        kind: "works",
        team: e.team,
        owner: e.id,
        cells: [...plat, ...run.cells],
        prevKind: [],
        prevDeck: [],
        deck: [...plat.map(() => top), ...run.deck],
        until: w.time + (def.seconds ?? 25),
        cx,
        cz,
        top,
      };
      if (w.applyModIfOpen(m, { from: { x: t.pos.x, z: t.pos.z }, to: { x: cx, z: cz } })) {
        placed = { m, plat, base, top, cx, cz };
        break;
      }
    }
  }
  if (!placed) {
    w.emit({ type: "notice", team: e.team, text: room ? "NO WAY UP FROM HERE" : "NO ROOM TO BUILD" });
    e.hero!.cooldowns.r = w.time + 1;
    return;
  }
  const { m, plat, base, top, cx, cz } = placed;
  // Lift anyone standing where the platform appeared.
  for (const o of w.entities) {
    if (!o.alive || o.kind === "structure") continue;
    const oi = tr.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z));
    if (plat.includes(oi)) o.transform.y = top;
  }
  w.emit({ type: "mod", id: m.id });
  w.emit({ type: "slam", x: cx, y: top, z: cz, radius: 2, team: e.team, src: e.id });
  const anchor = w.addEntity(e.team, "structure", half + 0.4, cx, cz, (def.rampHp ?? 500) * dmHp(w, "tower"));
  anchor.structure = {
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
  anchor.transform.y = base;
  anchor.owner = e.id;
  w.emit({ type: "build", id: anchor.id, padIndex: -1, team: e.team, upgrade: false });
  if (def.fx?.tesla) {
    // Tesla talent: a turret on top of the platform that lives as long as the works.
    const s = w.addEntity(e.team, "structure", 0.8, cx, cz, def.hp ?? 400);
    s.structure = {
      type: "damage",
      padIndex: -1,
      level: 1,
      builtAt: w.time,
      ready: true,
      nextAction: w.time + 0.3,
      range: 8,
      damage: def.damage ?? 45,
      lastFireAt: -99,
      shielded: false,
      tesla: true,
      onMod: m.id,
    };
    s.expiresAt = m.until;
    s.owner = e.id;
    w.nav.setBlocked(cx, cz, 0.8, true);
    w.emit({ type: "build", id: s.id, padIndex: -1, team: e.team, upgrade: false });
  }
}

/** Works can only be built on open ground/water away from structures and build pads. */
function worksBlocked(w: World, i: number): boolean {
  const tr = w.terrain;
  const k = tr.kinds[i];
  if (k !== Kind.Ground && k !== Kind.Water && k !== Kind.Ford) return true;
  const x = (i % tr.width) + 0.5;
  const z = Math.floor(i / tr.width) + 0.5;
  return (
    w.entities.some(
      (o) => o.alive && o.structure && Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) < o.radius + 0.9,
    ) || w.pads.some((pd) => Math.hypot(pd.x - x, pd.z - z) < w.data.structures.padRadius + 0.6)
  );
}

/** The ramp cells for one direction (dx, dz = from the ramp foot toward the platform); `whole` when every cell
 * along its middle lane could be laid. */
function rampRun(
  w: World,
  def: AbilityDef,
  plat: number[],
  cx: number,
  cz: number,
  half: number,
  size: number,
  top: number,
  dx: number,
  dz: number,
): { cells: number[]; deck: number[]; whole: boolean } {
  const tr = w.terrain;
  const shift = size % 2 === 0 ? 0.5 : 0;
  const ex = cx - dx * (half + 0.05) - dz * shift;
  const ez = cz - dz * (half + 0.05) + dx * shift;
  let len = def.length ?? 5;
  let fx = ex - dx * len;
  let fz = ez - dz * len;
  let footY = w.groundY(fx, fz);
  while (len < 12 && (top - footY) / len > 0.38) {
    len += 1;
    fx = ex - dx * len;
    fz = ez - dz * len;
    footY = w.groundY(fx, fz);
  }
  const cells: number[] = [];
  const deck: number[] = [];
  let whole = true;
  const width = def.width ?? 2;
  const steps = Math.ceil(len * 3);
  for (let st = 0; st <= steps; st++) {
    const f = st / steps;
    for (let wv = -width / 2; wv <= width / 2; wv += 0.5) {
      const x = fx + (ex - fx) * f - dz * wv;
      const z = fz + (ez - fz) * f + dx * wv;
      const i = tr.index(Math.floor(x), Math.floor(z));
      if (i < 0 || plat.includes(i) || cells.includes(i)) continue;
      if (worksBlocked(w, i)) {
        if (Math.abs(wv) < 0.3) whole = false;
        continue;
      }
      const ccx = (i % tr.width) + 0.5;
      const ccz = Math.floor(i / tr.width) + 0.5;
      const along = Math.max(0, Math.min(1, ((ccx - fx) * dx + (ccz - fz) * dz) / len));
      const dy = footY + (top - footY) * along;
      if (tr.kinds[i] === Kind.Ground && tr.groundHeight(ccx, ccz) > dy - 0.05) continue;
      cells.push(i);
      deck.push(dy);
    }
  }
  return { cells, deck, whole };
}

/**
 * Ballista (one per engineer): on top of his works if he stands on one (perchMul damage bonus, placed on the
 * free deck cell nearest the aim point), else at the nearest open cell. It expires with the works it sits on.
 */
export function fireBallista(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const tr = w.terrain;
  const ax = t.pos.x + a.dirX * 1.8;
  const az = t.pos.z + a.dirZ * 1.8;
  const topCell = (m: TerrainMod, i: number) => {
    const k = m.cells.indexOf(i);
    return k >= 0 && m.deck[k] === m.top;
  };
  const mine = w.mods.filter((m) => m.kind === "works" && m.team === e.team && m.top !== undefined);
  const here = tr.index(Math.floor(t.pos.x), Math.floor(t.pos.z));
  let perch: TerrainMod | null = mine.find((m) => topCell(m, here)) ?? null;
  let sx: number;
  let sz: number;
  if (perch) {
    const p = perch;
    const spots = p.cells.filter(
      (i) =>
        topCell(p, i) &&
        w.nav.open(i) &&
        !w.entities.some(
          (o) =>
            o.alive &&
            o.kind === "structure" &&
            tr.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z)) === i,
        ),
    );
    if (!spots.length) return;
    const cxOf = (i: number) => (i % tr.width) + 0.5;
    const czOf = (i: number) => Math.floor(i / tr.width) + 0.5;
    spots.sort((i, j) => Math.hypot(cxOf(i) - ax, czOf(i) - az) - Math.hypot(cxOf(j) - ax, czOf(j) - az));
    sx = cxOf(spots[0]);
    sz = czOf(spots[0]);
  } else {
    const i = w.nav.nearestOpen(ax, az, 3);
    if (i < 0) return;
    sx = (i % w.nav.w) + 0.5;
    sz = Math.floor(i / w.nav.w) + 0.5;
    perch = mine.find((m) => topCell(m, i)) ?? null;
  }
  for (const old of w.entities) {
    if (!old.alive || old.owner !== e.id || !old.structure?.siege || old.structure.works !== undefined) continue;
    old.expiresAt = w.time;
  }
  const cellAt = tr.index(Math.floor(sx), Math.floor(sz));
  const onRamp = perch ?? mine.find((m) => m.cells.includes(cellAt)) ?? null;
  const s = w.addEntity(e.team, "structure", 0.7, sx, sz, (def.hp ?? 180) * dmHp(w, "ballista"));
  const perchMul = perch ? (def.perchMul ?? 1.25) : 1;
  s.structure = {
    type: "damage",
    padIndex: -1,
    level: 1,
    builtAt: w.time,
    ready: true,
    nextAction: w.time + 0.5,
    range: def.range ?? 11,
    damage: (def.damage ?? 80) * perchMul,
    lastFireAt: -99,
    shielded: false,
    siege: { cooldown: def.cooldown ?? 1.8, vs: def.vs ?? {}, modId: onRamp ? onRamp.id : 0 },
  };
  const core = w.foeCore(e.team, sx, sz);
  if (core)
    s.transform.facing = s.transform.prevFacing = Math.atan2(core.transform.pos.x - sx, core.transform.pos.z - sz);
  s.expiresAt = Math.min(onRamp ? onRamp.until : Infinity, w.time + (def.seconds ?? 20));
  s.owner = e.id;
  w.nav.setBlocked(sx, sz, 0.7, true);
  w.emit({ type: "build", id: s.id, padIndex: -1, team: e.team, upgrade: false });
}

/** Temporary ramp from the hero's feet to the ground `length` ahead (crosses walls styled as ruins). */
export function fireRamp(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const t = e.transform;
  const len = def.length ?? 7;
  const width = def.width ?? 2;
  const x0 = t.pos.x + a.dirX * 0.8;
  const z0 = t.pos.z + a.dirZ * 0.8;
  const x1 = t.pos.x + a.dirX * len;
  const z1 = t.pos.z + a.dirZ * len;
  const y0 = t.y;
  let y1 = w.terrain.groundHeight(x1, z1);
  const k1 = w.terrain.kindAt(Math.floor(x1), Math.floor(z1));
  if (k1 === Kind.Water || k1 === Kind.Wall) y1 = y0;
  const cells: number[] = [];
  const deck: number[] = [];
  const steps = Math.ceil(len * 3);
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    for (let wv = -width / 2; wv <= width / 2; wv += 0.5) {
      const x = x0 + (x1 - x0) * f - a.dirZ * wv;
      const z = z0 + (z1 - z0) * f + a.dirX * wv;
      const i = w.terrain.index(Math.floor(x), Math.floor(z));
      if (i < 0 || cells.includes(i)) continue;
      const kind = w.terrain.kinds[i];
      if (kind === Kind.Wall && w.terrain.styles[i] !== "ruin") continue;
      const cx = (i % w.terrain.width) + 0.5;
      const cz = Math.floor(i / w.terrain.width) + 0.5;
      const along = Math.max(0, Math.min(1, ((cx - x0) * a.dirX + (cz - z0) * a.dirZ) / Math.max(0.1, len - 0.8)));
      const dy = y0 + (y1 - y0) * along;
      const ground = w.terrain.groundHeight(cx, cz);
      if (kind === Kind.Ground && ground > dy + 0.1) continue;
      cells.push(i);
      deck.push(dy);
    }
  }
  if (!cells.length) return;
  const m: TerrainMod = {
    id: w.newId(),
    kind: "ramp",
    team: e.team,
    cells,
    prevKind: [],
    prevDeck: [],
    deck,
    until: w.time + (def.seconds ?? 12),
  };
  w.applyMod(m);
  w.emit({ type: "mod", id: m.id });
}

/**
 * Temporary wall perpendicular to the aim direction. Entities caught inside are shoved out on the side of the wall
 * line they were already on; enemies on or next to it are stunned and knocked back. Talents add end traps and a healing grove.
 */
export function fireWall(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const len = def.length ?? 6;
  const cx = a.placed ? a.toX! : t.pos.x + a.dirX * (def.offset ?? 2.5);
  const cz = a.placed ? a.toZ! : t.pos.z + a.dirZ * (def.offset ?? 2.5);
  const cells: number[] = [];
  for (let s = -len / 2; s <= len / 2; s += 0.5) {
    const x = cx - a.dirZ * s;
    const z = cz + a.dirX * s;
    const i = w.terrain.index(Math.floor(x), Math.floor(z));
    if (i < 0 || cells.includes(i)) continue;
    const k = w.terrain.kinds[i];
    if (k !== Kind.Ground && k !== Kind.Ford) continue;
    if (w.pads.some((p) => Math.hypot(p.x - x, p.z - z) < 2)) continue;
    const occupied = w.entities.some(
      (o) =>
        o.alive &&
        (o.kind === "structure" || (o.hero && o.team === e.team)) &&
        Math.abs(o.transform.pos.x - (Math.floor(x) + 0.5)) < 0.5 + o.radius &&
        Math.abs(o.transform.pos.z - (Math.floor(z) + 0.5)) < 0.5 + o.radius,
    );
    if (occupied) continue;
    cells.push(i);
  }
  if (!cells.length) return;
  const m: TerrainMod = {
    id: w.newId(),
    kind: "wall",
    team: e.team,
    owner: e.id,
    style: (def as { style?: string }).style,
    cells,
    prevKind: [],
    prevDeck: [],
    deck: [],
    until: w.time + (def.seconds ?? 8),
  };
  if (def.fx?.grove) {
    w.zones.push({
      id: w.newId(),
      team: e.team,
      ownerId: e.id,
      x: cx,
      z: cz,
      radius: len / 2 + 1.5,
      until: m.until,
      dps: 0,
      slowMul: 1,
      style: "grove",
      heal: def.fx.grove.heal,
    });
  }
  w.applyMod(m);
  if (def.endTraps) {
    const tdef = w.heroDef(e.hero!.type).abilities.b;
    for (const s of [-1, 1]) {
      const ex = cx - a.dirZ * s * (len / 2 + 1);
      const ez = cz + a.dirX * s * (len / 2 + 1);
      if (!Number.isFinite(w.terrain.heightAt(ex, ez))) continue;
      w.traps.push({
        id: w.newId(),
        team: e.team,
        ownerId: e.id,
        x: ex,
        z: ez,
        radius: tdef.radius ?? 1.2,
        armAt: w.time + (tdef.arm ?? 0.5),
        until: w.time + (def.seconds ?? 8) + 6,
        damage: (tdef.damage ?? 40) * mul,
        stun: tdef.stunSeconds ?? 1.2,
        bonus: true,
      });
    }
  }
  w.emit({ type: "mod", id: m.id });
  const near = (o: Entity) =>
    cells.some(
      (c) =>
        Math.abs((c % w.terrain.width) + 0.5 - o.transform.pos.x) < 0.5 + o.radius &&
        Math.abs(Math.floor(c / w.terrain.width) + 0.5 - o.transform.pos.z) < 0.5 + o.radius,
    );
  for (const o of w.entities.slice()) {
    if (!o.alive || o.kind === "structure") continue;
    const i = w.terrain.index(Math.floor(o.transform.pos.x), Math.floor(o.transform.pos.z));
    const inside = cells.includes(i);
    if (!inside && !(o.team !== e.team && near(o))) continue;
    const rx = o.transform.pos.x - cx;
    const rz = o.transform.pos.z - cz;
    const along = -rx * a.dirZ + rz * a.dirX;
    const side = rx * a.dirX + rz * a.dirZ >= 0 ? 1 : -1;
    const lx = cx - a.dirZ * along;
    const lz = cz + a.dirX * along;
    if (inside) {
      const j = w.nav.nearestOpen(lx + a.dirX * side * 1.3, lz + a.dirZ * side * 1.3, 4);
      if (j >= 0) w.teleport(o, (j % w.nav.w) + 0.5, Math.floor(j / w.nav.w) + 0.5);
    }
    if (o.team === e.team) continue;
    w.damage(e, o, (def.damage ?? 70) * mul, {
      stun: def.stunSeconds ?? 0.9,
      knockback: def.knockback ?? 9,
      fromX: lx - a.dirX * side,
      fromZ: lz - a.dirZ * side,
      big: true,
    });
    w.emit({ type: "slam", x: lx, y: w.groundY(lx, lz), z: lz, radius: 1.6, team: e.team });
  }
}

/** Drop a trap ahead (max `max` per owner; the oldest is replaced). Traps trigger in world/hazards.ts. */
export function fireTrap(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const mine = w.traps.filter((tr) => tr.ownerId === e.id && !tr.bonus);
  if (mine.length >= (def.max ?? 3)) w.traps.splice(w.traps.indexOf(mine[0]), 1);
  const x = t.pos.x + a.dirX * (def.range ?? 4);
  const z = t.pos.z + a.dirZ * (def.range ?? 4);
  w.traps.push({
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x,
    z,
    radius: def.radius ?? 1.2,
    armAt: w.time + (def.arm ?? 0.5),
    until: w.time + (def.seconds ?? 30),
    damage: (def.damage ?? 40) * mul,
    stun: def.stunSeconds ?? 1.2,
  });
}

/** Ground zone that slows/damages enemies (and may heal/haste allies), ticking in world/hazards.ts. */
export function fireZone(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  w.zones.push({
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x: a.placed ? a.toX! : t.pos.x,
    z: a.placed ? a.toZ! : t.pos.z,
    radius: def.radius ?? 6,
    until: w.time + (def.seconds ?? 6),
    dps: (def.dps ?? 20) * mul,
    slowMul: def.slowMul ?? 0.4,
    heal: def.fx?.grove?.heal,
    haste: def.allySpeedMul,
  });
  w.emit({
    type: "slam",
    x: a.placed ? a.toX! : t.pos.x,
    y: a.placed ? w.groundY(a.toX!, a.toZ!) : t.y,
    z: a.placed ? a.toZ! : t.pos.z,
    radius: def.radius ?? 6,
    team: e.team,
    zone: true,
    src: e.id,
  });
}
