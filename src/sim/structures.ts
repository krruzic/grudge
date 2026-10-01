import { chainLightning } from "./talents.ts";
import type { World } from "./world.ts";
import type { Entity, Pad, StructureType, UnitType } from "./types.ts";

export function padNear(w: World, e: Entity): Pad | null {
  let best: Pad | null = null;
  let bestD = w.data.structures.padRadius;
  for (const p of w.pads) {
    const d = Math.hypot(p.x - e.transform.pos.x, p.z - e.transform.pos.z);
    if (d <= bestD) { bestD = d; best = p; }
  }
  return best;
}

export function canBuildOn(pad: Pad, team: number): boolean {
  return pad.zone === "neutral" || pad.side === team;
}

export function buildCost(w: World, type: StructureType, upgrade: boolean, team = -1): number {
  const def = w.data.structures.types[type];
  const hk = team >= 0 ? w.teamHooks(team) : {};
  const heroMul = upgrade ? hk.upgradeCostMul ?? 1 : hk.costMul ?? 1;
  return Math.round((upgrade ? def.upgradeCost : def.cost) * w.costMul() * heroMul);
}

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
      w.emit({ type: "notice", team, text: st.level >= 2 ? "MAX LEVEL" : "BUILDING..." });
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
  if (w.time < pad.rubbleUntil) {
    w.emit({ type: "notice", team, text: `RUBBLE · ${Math.ceil(pad.rubbleUntil - w.time)}` });
    return false;
  }
  if (!canBuildOn(pad, team)) {
    w.emit({ type: "notice", team, text: "ENEMY PAD" });
    return false;
  }
  const type = kind === "default" ? w.heroDef(hero.hero!.type).defaultBuild : kind;
  if (w.data.structures.types[type].class === "tower") {
    const limit = w.data.structures.towerLimit * Math.max(1, w.players.filter((p) => p.team === team).length);
    const alive = w.entities.filter((o) => o.alive && o.team === team && o.structure && o.structure.type !== "core" && w.data.structures.types[o.structure.type].class === "tower").length;
    if (alive >= limit) {
      w.emit({ type: "notice", team, text: `TOWER LIMIT ${limit}` });
      return false;
    }
  }
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

export function createStructure(w: World, team: number, pad: Pad, type: StructureType): Entity {
  const sd = w.data.structures;
  const def = sd.types[type];
  const e = w.addEntity(team, "structure", sd.structureRadius, pad.x, pad.z, def.hp);
  e.hp = def.hp * sd.buildStartHpFrac;
  const core = w.core(1 - team);
  if (core) e.transform.facing = e.transform.prevFacing = Math.atan2(core.transform.pos.x - pad.x, core.transform.pos.z - pad.z);
  e.structure = {
    type, padIndex: pad.index, level: 1, builtAt: w.time, ready: false, nextAction: w.time + sd.buildSeconds, progress: 0,
    range: (sd.zoneRange[pad.zone] ?? 10) * (def.rangeMul ?? 1), damage: def.damage ?? 0, lastFireAt: -99, shielded: false,
  };
  if (type === "control") e.structure.range *= 1 + ((w.teamHooks(team).controlTowerMul ?? 1) - 1) * 0.5;
  pad.structureId = e.id;
  w.nav.setBlocked(pad.x, pad.z, sd.structureRadius, true);
  for (const u of w.entities) {
    if (u.unit) u.unit.repathAt = 0;
  }
  w.teams[team].structuresBuilt++;
  return e;
}

export function builderRate(w: World, e: Entity): number {
  const sd = w.data.structures;
  const r = sd.builderRates;
  let rate = 0;
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.structure) continue;
    if (w.dist(o, e) - o.radius - e.radius > sd.builderRadius) continue;
    rate += o.hero ? r.hero : r.unit;
  }
  return Math.min(r.max, rate);
}

function upgrade(w: World, e: Entity): void {
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

export function spawnUnit(w: World, team: number, type: UnitType, x: number, z: number, statMul: number): Entity | null {
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

export function updateStructure(w: World, e: Entity): void {
  const st = e.structure!;
  if (st.type === "core") return;
  const sd = w.data.structures;
  const def = sd.types[st.type];
  const dt = w.dt;
  if (!st.ready || st.upgrading) {
    const rate = builderRate(w, e);
    const secs = st.ready ? sd.upgradeSeconds : sd.buildSeconds;
    const step = (rate * dt) / secs;
    st.progress = Math.min(1, (st.progress ?? 0) + step);
    if (!st.ready) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (1 - sd.buildStartHpFrac) * step);
      if (st.progress >= 1) {
        st.ready = true;
        st.nextAction = w.time;
      }
      return;
    }
    if (st.progress >= 1) {
      st.upgrading = false;
      upgrade(w, e);
      w.emit({ type: "build", id: e.id, padIndex: st.padIndex, team: e.team, upgrade: true });
    }
  }
  if (w.time < st.nextAction) return;
  const ts = w.teams[e.team];

  if (def.class === "production") {
    st.nextAction = w.time + 1;
    return;
  }

  const boost = w.arena.towerBoost(e);
  const haste = st.hasteUntil && w.time < st.hasteUntil ? st.hasteMul ?? 1 : 1;
  if (st.type === "damage") {
    let best: Entity | null = null;
    let bestScore = Infinity;
    const siege = st.siege;
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.status.hidden) continue;
      if (o.structure && !siege && !o.structure.siege) continue;
      const d = w.dist(e, o) - o.radius;
      if (d > st.range * boost.range * w.rangeMul(e, o)) continue;
      const score = d - (o.hero ? 100 : 0) - (o.structure?.siege ? 60 : 0) - (siege && o.structure ? 40 : 0);
      if (score >= bestScore) continue;
      if (!w.los(e, o, def.projectile?.losTolerance ?? 0.3, 3.2)) continue;
      best = o;
      bestScore = score;
    }
    if (!best) {
      st.nextAction = w.time + 0.2;
      return;
    }
    if (siege) e.transform.facing = e.transform.prevFacing = Math.atan2(best.transform.pos.x - e.transform.pos.x, best.transform.pos.z - e.transform.pos.z);
    const cls = best.structure?.siege ? "heavy" : w.classOf(best);
    const vs = (siege ? siege.vs[cls] : def.vs?.[cls]) ?? 1;
    if (st.tesla) {
      const pts = [e.transform.pos.x, e.transform.y + 2.6, e.transform.pos.z, best.transform.pos.x, best.transform.y + 1.2, best.transform.pos.z];
      w.emit({ type: "chain", pts, team: e.team });
      const owner = e.owner ? w.get(e.owner) ?? e : e;
      w.damage(owner, best, st.damage * boost.damage, { fromX: e.transform.pos.x, fromZ: e.transform.pos.z, knockback: 1, slowMul: 0.7, slowSeconds: 0.6 });
      if (best.alive) chainLightning(w, owner, best, 2, st.damage * 0.6 * boost.damage);
      st.lastFireAt = w.time;
      st.nextAction = w.time + 1 / haste;
      return;
    }
    w.fireProjectile(e, best, st.damage * boost.damage * vs, siege ? 30 : def.projectile?.speed ?? 20, false, siege ? "ballista" : "bolt", siege ? 1.2 : 3.2);
    st.lastFireAt = w.time;
    st.nextAction = w.time + (siege ? siege.cooldown : def.cooldown ?? 1) / haste;
    return;
  }

  if (st.type === "control") {
    const cm = w.teamHooks(e.team).controlTowerMul ?? 1;
    const targets = w.enemiesNear(e, st.range * boost.range, (o) => o.kind !== "structure");
    if (!targets.length) {
      st.nextAction = w.time + 0.2;
      return;
    }
    w.emit({ type: "pulse", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, radius: st.range * boost.range, team: e.team });
    for (const o of targets) {
      const vs = def.vs?.[w.classOf(o)] ?? 1;
      const slow = 1 - Math.min(0.85, (1 - (def.slowMul ?? 0.5)) * Math.min(1, vs) * cm);
      w.damage(e, o, st.damage * boost.damage * vs * cm, { knockback: (def.knockback ?? 3) * Math.min(1, vs), slowMul: slow, slowSeconds: def.slowSeconds });
    }
    st.lastFireAt = w.time;
    st.nextAction = w.time + (def.cooldown ?? 2) / haste;
    return;
  }

  if (st.type === "support") {
    const cd = def.cooldown ?? 0.5;
    const heal = (def.heal ?? 10) * (st.level > 1 ? def.upgrade.heal ?? 1 : 1) * cd;
    let any = false;
    for (const o of w.entities) {
      if (!o.alive || o.team !== e.team || o.kind === "structure") continue;
      if (w.dist(e, o) > st.range || o.hp >= o.maxHp) continue;
      w.heal(o, o.hero ? heal * (def.heroHealMul ?? 0.5) : heal);
      any = true;
    }
    if (any) {
      st.lastFireAt = w.time;
      if (w.tick % 30 < 15) w.emit({ type: "heal", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team });
    }
    st.nextAction = w.time + cd;
  }
}
