// Bot economy: shop errands (bombs, core ward, cannon strikes) and the fixed build plan (outposts, towers,
// support) followed by tower specialisations and upgrades once gold allows.
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Entity, Pad, StructureType, Vec2 } from "../types.ts";
import { buildCost, canBuildOn, canSpec, specCost } from "../structures.ts";
import { enemyHeroes, mateHero, ok } from "./awareness.ts";

interface PlanItem {
  zone: Pad["zone"] | "front";
  type: StructureType;
}

/** Build order; "front" = any non-home pad. Each entry is satisfied once the team owns that many of the type. */
const PLAN: PlanItem[] = [
  { zone: "home", type: "barracks" },
  { zone: "home", type: "range" },
  { zone: "home", type: "damage" },
  { zone: "front", type: "foundry" },
  { zone: "front", type: "barracks" },
  { zone: "front", type: "damage" },
  { zone: "front", type: "control" },
  { zone: "home", type: "support" },
  { zone: "front", type: "damage" },
  { zone: "front", type: "control" },
  { zone: "front", type: "damage" },
];
const MAX_OUTPOSTS = 4;

/**
 * Where to stand to build on `pad`: the pad itself when the bot can walk to it, else the nearest reachable open
 * cell within build reach that has this pad as its nearest (Hollow's raised back pad is built from the ground
 * behind the keep, like a human does; the CPU used to skip it because it couldn't path onto it). Null if none.
 */
export function buildSpot(bot: Bot, w: World, me: Entity, pad: Pad): Vec2 | null {
  if (ok(bot, w, me, pad)) return { x: pad.x, z: pad.z };
  const reach = w.data.structures.padRadius - 0.4;
  const p = me.transform.pos;
  let best: Vec2 | null = null;
  let bd = Infinity;
  for (let cz = Math.floor(pad.z - reach); cz <= Math.floor(pad.z + reach); cz++) {
    for (let cx = Math.floor(pad.x - reach); cx <= Math.floor(pad.x + reach); cx++) {
      const x = cx + 0.5;
      const z = cz + 0.5;
      const dp = Math.hypot(x - pad.x, z - pad.z);
      if (dp > reach) continue;
      const i = w.nav.index(cx, cz);
      if (i < 0 || !w.nav.open(i)) continue;
      if (w.pads.some((q) => q !== pad && Math.hypot(q.x - x, q.z - z) <= dp)) continue;
      if (!w.nav.reachable(p, { x, z })) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bd) {
        bd = d;
        best = { x, z };
      }
    }
  }
  return best;
}

/** No enemy champion within 14 m, no enemy soldiers within 8 m, and no enemy tower covering the pad. */
export function padSafe(w: World, team: number, pad: Vec2): boolean {
  for (const o of w.entities) {
    if (!o.alive || o.team === team || o.neutral || o.team < 0) continue;
    const d = Math.hypot(o.transform.pos.x - pad.x, o.transform.pos.z - pad.z);
    if (o.hero && !o.hero.dead && d < 14) return false;
    if (o.unit && d < 8) return false;
    if (o.structure?.ready && o.structure.damage > 0 && d < o.structure.range + 2) return false;
  }
  return true;
}

/** Carry a bought bomb to the nearest enemy structure, or walk to the shop to buy ward/bomb/cannon. True = busy. */
export function shop(bot: Bot, w: World, me: Entity, threatened: boolean): boolean {
  const sh = w.data.match.arena.shop;
  const ts = w.teams[me.team];
  const gold = ts.resource;
  const h = me.hero!;
  if (h.bomb && !threatened) {
    let best: Entity | undefined;
    let bd = Infinity;
    for (const o of w.entities) {
      if (
        !o.alive ||
        !o.structure ||
        o.team === me.team ||
        o.neutral ||
        o.structure.type === "core" ||
        o.structure.siege
      )
        continue;
      const d = w.dist(me, o);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    const target = best ?? w.foeCore(me.team, me.transform.pos.x, me.transform.pos.z);
    if (target) {
      bot.goal = { x: target.transform.pos.x, z: target.transform.pos.z };
      if (w.dist(me, target) < w.data.match.arena.shop.bomb.throwRange - 1 && bot.rand() < 0.3) {
        const dx = target.transform.pos.x - me.transform.pos.x;
        const dz = target.transform.pos.z - me.transform.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        bot.wantFace = { x: dx / dl, z: dz / dl };
        bot.wantAttack = true;
      }
      return true;
    }
  }
  const core = w.core(me.team)!;
  const ward = (core.structure!.ward ?? 0) / w.wardMax;
  const wardOk = w.time >= ts.wardReadyAt && !w.isSudden() && w.homeHeld(me.team);
  const wantWard =
    wardOk && ward < (bot.role === "attack" ? 0.15 : bot.role === "support" ? 0.55 : 0.4) && gold >= sh.ward.cost;
  const myArmy = w.teams[me.team].unitCount;
  const wantBomb =
    !w.ffaHouses?.noBombs &&
    !h.bomb &&
    w.time >= (ts.bombReadyAt ?? 0) &&
    w.time >= bot.bombAt &&
    gold >= sh.bomb.cost + 250 &&
    myArmy >= 4 &&
    w.entities.some(
      (o) =>
        o.alive &&
        o.structure &&
        o.team !== me.team &&
        !o.neutral &&
        o.structure.type !== "core" &&
        w.entities.some((u) => u.alive && u.unit && u.team === me.team && w.dist(u, o) < 20),
    );
  const mate = mateHero(bot, w);
  const foes = enemyHeroes(bot, w, me);
  const brawl = mate && bot.role === "support" ? foes.find((e) => w.dist(mate, e) < 8) : undefined;
  const enemy = brawl ?? foes[0];
  const wantCannon = !!enemy && gold >= sh.cannon.cost + (brawl ? 40 : bot.role === "attack" ? 300 : 150);
  if (!(wantWard || wantBomb || wantCannon)) return false;
  if (w.arena.inShop(me)) {
    if (wantWard) bot.wantBuy = { item: "ward" };
    else if (wantBomb) {
      bot.wantBuy = { item: "bomb" };
      bot.bombAt = w.time + 90;
    } else if (enemy) bot.wantBuy = { item: "cannon", at: { x: enemy.transform.pos.x, z: enemy.transform.pos.z } };
    return false;
  }
  if (threatened) return false;
  // Shopping trips: a cannon or bomb isn't worth walking home across the map for (or abandoning a push over);
  // buy them when passing by. Only a failing ward calls the bot back.
  if (!wantWard && (w.dist(me, core) > 26 || bot.sieging)) return false;
  bot.goal = { x: core.transform.pos.x + (me.team ? -2.5 : 2.5), z: core.transform.pos.z };
  return true;
}

/**
 * Just respawned at the keep with gold: upgrade a home building (or specialise a tower) before heading out, or fill
 * an empty home pad. Returns true when it picked something (bot.buildPad / buildType / buildSpec set).
 */
export function homeErrand(bot: Bot, w: World, me: Entity): boolean {
  const res = w.teams[me.team].resource;
  const home = w.pads.filter((p) => p.zone === "home" && p.side === me.team && buildSpot(bot, w, me, p) !== null);
  const empty = home.find((p) => !p.structureId && (w.time >= p.rubbleUntil || p.rubbleTeam !== me.team));
  if (empty) {
    const type: StructureType = "damage";
    if (res >= buildCost(w, type, false, me.team)) {
      bot.buildPad = empty;
      bot.buildType = type;
      bot.buildSpec = null;
      return true;
    }
  }
  for (const pad of home) {
    const st = pad.structureId ? w.get(pad.structureId) : undefined;
    if (!st || st.team !== me.team || !st.structure!.ready || st.structure!.upgrading) continue;
    const type = st.structure!.type as StructureType;
    if (st.structure!.level < 2 && res >= buildCost(w, type, true, me.team) + 30) {
      bot.buildPad = pad;
      bot.buildType = type;
      bot.buildSpec = null;
      return true;
    }
    if (canSpec(w, st) && res >= specCost(w, type, me.team) + 60) {
      bot.buildPad = pad;
      bot.buildType = type;
      bot.buildSpec = Math.floor(bot.rand() * 3);
      return true;
    }
  }
  return false;
}

/**
 * Every enemy champion is down: if there's a free forward / neutral pad near the bot that's safe to stand by,
 * put a tower (or an outpost, below the outpost cap) on it on the way to the siege. True when it picked one.
 */
export function windowBuild(bot: Bot, w: World, me: Entity): boolean {
  const res = w.teams[me.team].resource;
  const outposts = w.entities.filter(
    (o) =>
      o.alive &&
      o.team === me.team &&
      w.data.structures.types[o.structure?.type as StructureType]?.class === "production",
  ).length;
  const type: StructureType = outposts < MAX_OUTPOSTS ? "barracks" : "damage";
  if (res < buildCost(w, type, false, me.team)) return false;
  let best: Pad | null = null;
  let bd = 26;
  for (const pad of w.pads) {
    if (pad.zone === "home" || pad.structureId || !canBuildOn(pad, me.team)) continue;
    if (w.time < pad.rubbleUntil && pad.rubbleTeam === me.team) continue;
    const d = Math.hypot(pad.x - me.transform.pos.x, pad.z - me.transform.pos.z);
    if (d >= bd || !padSafe(w, me.team, pad) || !buildSpot(bot, w, me, pad)) continue;
    bd = d;
    best = pad;
  }
  if (!best) return false;
  bot.buildPad = best;
  bot.buildType = type;
  bot.buildSpec = null;
  return true;
}

/** Choose the next pad + structure (plan order), else a tower spec after 150s, else an upgrade. */
export function pickBuild(bot: Bot, w: World, me: Entity): void {
  const res = w.teams[me.team].resource;
  const myCore = w.core(me.team)!;
  const pads = w.pads
    .filter(
      (p) =>
        canBuildOn(p, me.team) &&
        (w.time >= p.rubbleUntil || p.rubbleTeam !== me.team) &&
        buildSpot(bot, w, me, p) !== null,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - myCore.transform.pos.x, a.z - myCore.transform.pos.z) -
        Math.hypot(b.x - myCore.transform.pos.x, b.z - myCore.transform.pos.z),
    );
  // Past the opening, an empty home pad means no keep shield (World.homeHeld): filling every one comes first,
  // with the home buildings the plan still lacks (then an outpost or a tower).
  const hole = w.time > 40 ? pads.find((p) => p.zone === "home" && p.side === me.team && !p.structureId) : undefined;
  if (hole) {
    const ownOutposts = w.entities.filter(
      (o) =>
        o.alive &&
        o.team === me.team &&
        w.data.structures.types[o.structure?.type as StructureType]?.class === "production",
    ).length;
    const homeHave = (t: StructureType) =>
      w.entities.filter(
        (o) =>
          o.alive &&
          o.team === me.team &&
          o.structure?.type === t &&
          o.structure.padIndex >= 0 &&
          w.pads[o.structure.padIndex].zone === "home",
      ).length;
    const want = new Map<StructureType, number>();
    for (const it of PLAN) if (it.zone === "home") want.set(it.type, (want.get(it.type) ?? 0) + 1);
    const missing = [...want].find(
      ([t, n]) => homeHave(t) < n && (w.data.structures.types[t].class !== "production" || ownOutposts < MAX_OUTPOSTS),
    )?.[0];
    const type: StructureType = missing ?? (ownOutposts < MAX_OUTPOSTS ? "barracks" : "damage");
    if (res >= buildCost(w, type, false, me.team)) {
      bot.buildPad = hole;
      bot.buildType = type;
      bot.buildSpec = null;
    }
    return;
  }
  const outposts = w.entities.filter(
    (o) =>
      o.alive &&
      o.team === me.team &&
      o.structure &&
      w.data.structures.types[o.structure.type as StructureType]?.class === "production",
  ).length;
  // Cheap upgrades (Stig pays 60%): upgrade each building as soon as it stands, and specialise towers early.
  const cheap = (w.heroDef(me.hero!.type).hooks.upgradeCostMul ?? 1) < 1;
  if (cheap) {
    for (const pad of pads) {
      const st = pad.structureId ? w.get(pad.structureId) : undefined;
      if (!st || st.team !== me.team || !st.structure!.ready || st.structure!.upgrading) continue;
      const type = st.structure!.type as StructureType;
      if (st.structure!.level < 2 && res >= buildCost(w, type, true, me.team) + 40) {
        bot.buildPad = pad;
        bot.buildType = type;
        bot.buildSpec = null;
        return;
      }
    }
  }
  const placed = new Map<string, number>();
  for (const item of PLAN) {
    const key = `${item.zone}|${item.type}`;
    const nth = placed.get(key) ?? 0;
    placed.set(key, nth + 1);
    const have = w.entities.filter(
      (o) =>
        o.alive &&
        o.team === me.team &&
        o.structure?.type === item.type &&
        o.structure.padIndex >= 0 &&
        (item.zone === "front"
          ? w.pads[o.structure.padIndex].zone !== "home"
          : w.pads[o.structure.padIndex].zone === item.zone),
    ).length;
    if (have > nth) continue;
    if (w.data.structures.types[item.type].class === "production" && outposts >= MAX_OUTPOSTS) continue;
    const pad = pads.find((p) => (item.zone === "front" ? p.zone !== "home" : p.zone === item.zone) && !p.structureId);
    if (!pad) continue;
    if (res >= buildCost(w, item.type, false, me.team)) {
      bot.buildPad = pad;
      bot.buildType = item.type;
    }
    return;
  }
  bot.buildSpec = null;
  if ((w.time > 150 && res >= 420) || cheap) {
    for (const pad of pads) {
      const st = pad.structureId ? w.get(pad.structureId) : undefined;
      if (
        st &&
        st.team === me.team &&
        canSpec(w, st) &&
        st.structure!.ready &&
        !st.structure!.upgrading &&
        res >= specCost(w, st.structure!.type as StructureType, me.team) + (cheap ? 60 : 170)
      ) {
        bot.buildPad = pad;
        bot.buildType = st.structure!.type as StructureType;
        bot.buildSpec = Math.floor(bot.rand() * 3);
        return;
      }
    }
  }
  if (res >= 180) {
    for (const pad of pads) {
      const st = pad.structureId ? w.get(pad.structureId) : undefined;
      if (st && st.team === me.team && st.structure!.level < 2 && st.structure!.ready && !st.structure!.upgrading) {
        bot.buildPad = pad;
        bot.buildType = st.structure!.type as StructureType;
        return;
      }
    }
  }
}
