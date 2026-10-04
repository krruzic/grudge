// Bot economy: shop errands (bombs, core ward, cannon strikes) and the fixed build plan (outposts, towers,
// support) followed by tower specialisations and upgrades once gold allows.
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Entity, Pad, StructureType } from "../types.ts";
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
  const wardOk = w.time >= ts.wardReadyAt && !w.isSudden();
  const wantWard =
    wardOk && ward < (bot.role === "attack" ? 0.15 : bot.role === "support" ? 0.55 : 0.4) && gold >= sh.ward.cost;
  const myArmy = w.teams[me.team].unitCount;
  const wantBomb =
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
  bot.goal = { x: core.transform.pos.x + (me.team ? -2.5 : 2.5), z: core.transform.pos.z };
  return true;
}

/** Choose the next pad + structure (plan order), else a tower spec after 150s, else an upgrade. */
export function pickBuild(bot: Bot, w: World, me: Entity): void {
  const res = w.teams[me.team].resource;
  const myCore = w.core(me.team)!;
  const pads = w.pads
    .filter((p) => canBuildOn(p, me.team) && (w.time >= p.rubbleUntil || p.rubbleTeam !== me.team) && ok(bot, w, me, p))
    .sort(
      (a, b) =>
        Math.hypot(a.x - myCore.transform.pos.x, a.z - myCore.transform.pos.z) -
        Math.hypot(b.x - myCore.transform.pos.x, b.z - myCore.transform.pos.z),
    );
  const outposts = w.entities.filter(
    (o) =>
      o.alive &&
      o.team === me.team &&
      o.structure &&
      w.data.structures.types[o.structure.type as StructureType]?.class === "production",
  ).length;
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
  if (w.time > 150 && res >= 420) {
    for (const pad of pads) {
      const st = pad.structureId ? w.get(pad.structureId) : undefined;
      if (
        st &&
        st.team === me.team &&
        canSpec(w, st) &&
        st.structure!.ready &&
        !st.structure!.upgrading &&
        res >= specCost(w, st.structure!.type as StructureType, me.team) + 170
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
