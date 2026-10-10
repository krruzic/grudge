// Structures on build pads: placement rules, build/upgrade/spec costs and actions (from hero commands), creating
// structures, builder rate, and spawning units. Per-tick tower behaviour lives in structures/towers.ts.
import type { World } from "./world.ts";
import type { Entity, Pad, StructureState, StructureType, UnitType } from "./types.ts";
import type { TowerSpec } from "./config.ts";

/** Pad within padRadius of the hero, or (inside the team banner) the pad nearest the hero around the banner. */
export function padNear(w: World, e: Entity): Pad | null {
  let best: Pad | null = null;
  let bestD = w.data.structures.padRadius;
  for (const p of w.pads) {
    const d = Math.hypot(p.x - e.transform.pos.x, p.z - e.transform.pos.z);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  if (best || !w.inBanner(e)) return best;
  const b = w.teams[e.team].banner!;
  const reach = w.bannerReach;
  bestD = Infinity;
  for (const p of w.pads) {
    if (Math.hypot(p.x - b.x, p.z - b.z) > reach + 1.5) continue;
    const d = Math.hypot(p.x - e.transform.pos.x, p.z - e.transform.pos.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Neutral pads are open to anyone; home/forward pads only to their side. */
export function canBuildOn(pad: Pad, team: number): boolean {
  return pad.zone === "neutral" || pad.side === team;
}

/** Build or upgrade cost including sudden death, hero cost hooks (FFA variants) and FFA production pricing. */
export function buildCost(w: World, type: StructureType, upgrade: boolean, team = -1): number {
  const def = w.data.structures.types[type];
  const hk = team >= 0 ? w.teamHooks(team) : {};
  const heroMul = upgrade
    ? ((w.ffa ? hk.ffaUpgradeCostMul : undefined) ?? hk.upgradeCostMul ?? 1)
    : ((w.ffa ? hk.ffaCostMul : undefined) ?? hk.costMul ?? 1);
  const ffa = def.class === "production" ? (w.ffaCfg?.productionCostMul ?? 1) : 1;
  return Math.round((upgrade ? def.upgradeCost : def.cost) * w.costMul() * heroMul * ffa);
}

export function specOf(w: World, st: StructureState): TowerSpec | null {
  if (!st.spec || st.type === "core") return null;
  return w.data.structures.types[st.type].specs?.find((s) => s.id === st.spec) ?? null;
}

export function specCost(w: World, type: StructureType, team = -1): number {
  const def = w.data.structures.types[type];
  const hk = team >= 0 ? w.teamHooks(team) : {};
  return Math.round(
    (def.specCost ?? 250) * w.costMul() * ((w.ffa ? hk.ffaUpgradeCostMul : undefined) ?? hk.upgradeCostMul ?? 1),
  );
}

/** Level-2 pad towers with specs can be specialised (level 3). */
export function canSpec(w: World, e: Entity | undefined): boolean {
  const st = e?.structure;
  if (!st || st.type === "core" || st.siege || st.tesla || st.works !== undefined) return false;
  return !!w.data.structures.types[st.type].specs?.length && st.level === 2;
}

/** Hero command: start specialising the tower on the nearby pad (option idx). */
export function trySpec(w: World, hero: Entity, idx: number): boolean {
  const team = hero.team;
  const pad = padNear(w, hero);
  const e = pad?.structureId ? w.get(pad.structureId) : undefined;
  if (!e || e.team !== team || !canSpec(w, e)) return false;
  const st = e.structure!;
  if (!st.ready || st.upgrading) {
    w.emit({ type: "notice", team, text: "BUILDING..." });
    return false;
  }
  const spec = w.data.structures.types[st.type as StructureType].specs![idx];
  if (!spec) return false;
  const cost = specCost(w, st.type as StructureType, team);
  const ts = w.teams[team];
  if (ts.resource < cost) {
    w.emit({ type: "notice", team, text: `NEED ${cost}` });
    return false;
  }
  ts.resource -= cost;
  st.upgrading = true;
  st.progress = 0;
  st.specPending = spec.id;
  w.emit({ type: "build", id: e.id, padIndex: st.padIndex, team, upgrade: true });
  return true;
}

/** Finish a spec upgrade: level 3, spec multipliers on hp/damage/range. */
export function applySpec(w: World, e: Entity, id: string): void {
  const st = e.structure!;
  if (st.type === "core" || st.works !== undefined) return;
  const spec = w.data.structures.types[st.type].specs?.find((s) => s.id === id);
  if (!spec) return;
  st.level = 3;
  st.spec = id;
  const frac = e.hp / e.maxHp;
  e.maxHp *= spec.hp;
  e.hp = Math.min(e.maxHp, e.maxHp * frac + e.maxHp * 0.25);
  st.damage *= spec.damage ?? 1;
  st.range *= spec.range ?? 1;
}

/** Hero command: build on (or upgrade the structure on) the nearby pad. Outposts replace production types on outpost maps. */
export function tryBuild(w: World, hero: Entity, kind: StructureType | "default" | "upgrade"): boolean {
  const team = hero.team;
  const pad = padNear(w, hero);
  if (!pad) {
    w.emit({ type: "notice", team, text: "NO PAD HERE" });
    return false;
  }
  const ts = w.teams[team];
  const existing = pad.structureId ? w.get(pad.structureId) : undefined;
  if (existing) {
    const st = existing.structure!;
    if (existing.team !== team) {
      w.emit({ type: "notice", team, text: "ENEMY PAD" });
      return false;
    }
    if (st.level >= 2 || !st.ready || st.upgrading || st.type === "core") {
      w.emit({
        type: "notice",
        team,
        text: st.upgrading || !st.ready ? "BUILDING..." : canSpec(w, existing) ? "PICK A LEVEL 3" : "MAX LEVEL",
      });
      return false;
    }
    const cost = buildCost(w, st.type, true, team);
    if (ts.resource < cost) {
      w.emit({ type: "notice", team, text: `NEED ${cost}` });
      return false;
    }
    ts.resource -= cost;
    st.upgrading = true;
    st.progress = 0;
    w.emit({ type: "build", id: existing.id, padIndex: pad.index, team, upgrade: true });
    return true;
  }
  if (kind === "upgrade") return false;
  if (w.time < pad.rubbleUntil && pad.rubbleTeam === team) {
    w.emit({ type: "notice", team, text: `RUBBLE · ${Math.ceil(pad.rubbleUntil - w.time)}` });
    return false;
  }
  if (!canBuildOn(pad, team)) {
    w.emit({ type: "notice", team, text: "ENEMY PAD" });
    return false;
  }
  const want = kind === "default" ? w.heroDef(hero.hero!.type).defaultBuild : kind;
  const type = w.terrain.outposts && w.data.structures.types[want].class === "production" ? "outpost" : want;
  const cost = buildCost(w, type, false, team);
  if (ts.resource < cost) {
    w.emit({ type: "notice", team, text: `NEED ${cost}` });
    return false;
  }
  ts.resource -= cost;
  const s = createStructure(w, team, pad, type);
  w.emit({ type: "build", id: s.id, padIndex: pad.index, team, upgrade: false });
  return true;
}

/** Place a new (unbuilt) structure on a pad; forward/neutral towers get the zone's lane-tower bonuses. */
export function createStructure(w: World, team: number, pad: Pad, type: StructureType): Entity {
  const sd = w.data.structures;
  const def = sd.types[type];
  const lane = def.class === "tower" ? sd.laneTower[pad.zone] : undefined;
  let hp = def.hp * (lane?.hp ?? 1);
  // 2v2: towers on a builder's team (Stig) are sturdier - two champions hit them at once.
  const duoHp = w.data.match.duo?.towerHp;
  if (duoHp && def.class === "tower" && w.duo(team))
    for (const o of w.entities) if (o.hero && o.team === team && duoHp[o.hero.type]) hp *= duoHp[o.hero.type];
  const e = w.addEntity(team, "structure", sd.structureRadius, pad.x, pad.z, hp);
  e.hp = hp * sd.buildStartHpFrac;
  const core = w.foeCore(team, pad.x, pad.z);
  if (core)
    e.transform.facing = e.transform.prevFacing = Math.atan2(
      core.transform.pos.x - pad.x,
      core.transform.pos.z - pad.z,
    );
  e.structure = {
    type,
    padIndex: pad.index,
    level: 1,
    builtAt: w.time,
    ready: false,
    nextAction: w.time + sd.buildSeconds,
    progress: 0,
    range: (sd.zoneRange[pad.zone] ?? 10) * (def.rangeMul ?? 1),
    damage: (def.damage ?? 0) * (lane?.damage ?? 1),
    lastFireAt: -99,
    shielded: false,
    heroSlow: lane?.heroSlow,
  };
  if (type === "control") e.structure.range *= 1 + ((w.teamHooks(team).controlTowerMul ?? 1) - 1) * 0.5;
  pad.structureId = e.id;
  w.nav.setBlocked(pad.x, pad.z, sd.structureRadius + 0.45, true);
  for (const u of w.entities) {
    if (u.unit) u.unit.repathAt = 0;
  }
  w.teams[team].structuresBuilt++;
  return e;
}

/** Construction speed from nearby allied heroes and units (bonus for 2+ heroes), capped; FFA never stalls. */
export function builderRate(w: World, e: Entity): number {
  const sd = w.data.structures;
  const r = sd.builderRates;
  let rate = 0;
  let heroes = 0;
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.structure) continue;
    if (w.dist(o, e) - o.radius - e.radius > sd.builderRadius) continue;
    if (o.hero) heroes++;
    rate += o.hero ? r.hero : r.unit;
  }
  if (heroes >= 2) rate += r.teamwork * (heroes - 1);
  // Free for all: a lone champion can't babysit every site, so building always goes at least at one hero's pace.
  if (w.ffa) rate = Math.max(rate, r.hero);
  // Nobody around: the site still creeps along, so leaving to fight doesn't throw the gold away.
  else rate = Math.max(rate, r.unattended ?? 0);
  return Math.min(r.max, rate);
}

/** Finish a level-2 upgrade. */
export function upgrade(w: World, e: Entity): void {
  const st = e.structure!;
  if (st.type === "core") return;
  const up = w.data.structures.types[st.type].upgrade;
  st.level = 2;
  const frac = e.hp / e.maxHp;
  e.maxHp *= up.hp ?? 1;
  e.hp = Math.min(e.maxHp, e.maxHp * frac + e.maxHp * 0.25);
  st.damage *= up.damage ?? 1;
  st.range *= up.range ?? 1;
}

/** Spawn a unit at the nearest open cell (null if none within 5); statMul scales hp and damage. */
/**
 * A soldier a champion just brought in (summons, hex risings): untouchable for the champion's `summonInvuln`
 * seconds (Remnil), so her raised dead get a moment to act before the fight they appear in kills them.
 */
export function wardSummon(w: World, u: Entity, owner: Entity): void {
  const s = owner.hero ? w.heroDef(owner.hero.type).hooks.summonInvuln : undefined;
  if (s) u.status.invulnUntil = Math.max(u.status.invulnUntil, w.time + s);
}

export function spawnUnit(
  w: World,
  team: number,
  type: UnitType,
  x: number,
  z: number,
  statMul: number,
): Entity | null {
  const def = w.data.units.types[type];
  const i = w.nav.nearestOpen(x, z, 5);
  if (i < 0) return null;
  const sx = (i % w.nav.w) + 0.5;
  const sz = Math.floor(i / w.nav.w) + 0.5;
  let mul = statMul;
  const hero = w.heroOf(team);
  if (hero && type === "heavy") mul *= w.heroDef(hero.hero!.type).hooks.heavyStatMul ?? 1;
  const e = w.addEntity(team, "unit", def.radius, sx, sz, def.hp * mul);
  e.unit = {
    type,
    damage: def.damage * mul,
    speed: def.speed,
    range: def.range,
    cooldown: def.cooldown,
    aggro: def.aggro,
    nextAttack: w.time + 0.5,
    targetId: 0,
    retargetAt: 0,
    path: [],
    pathGoal: null,
    repathAt: 0,
    slot: w.nextSlot(team),
    attackAnimAt: -99,
    moving: false,
    rank: 0,
    kills: 0,
  };
  w.teams[team].unitCount++;
  w.emit({ type: "spawn", id: e.id });
  return e;
}

export { updateStructure } from "./structures/towers.ts";
