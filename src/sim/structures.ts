import { chainLightning } from "./talents.ts";
import type { World } from "./world.ts";
import type { Entity, Pad, StructureState, StructureType, UnitType } from "./types.ts";
import type { TowerSpec } from "./config.ts";

export function padNear(w: World, e: Entity): Pad | null {
  let best: Pad | null = null;
  let bestD = w.data.structures.padRadius;
  for (const p of w.pads) {
    const d = Math.hypot(p.x - e.transform.pos.x, p.z - e.transform.pos.z);
    if (d <= bestD) { bestD = d; best = p; }
  }
  if (best || !w.inBanner(e)) return best;
  const b = w.teams[e.team].banner!;
  const reach = w.bannerReach;
  bestD = Infinity;
  for (const p of w.pads) {
    if (Math.hypot(p.x - b.x, p.z - b.z) > reach + 1.5) continue;
    const d = Math.hypot(p.x - e.transform.pos.x, p.z - e.transform.pos.z);
    if (d < bestD) { bestD = d; best = p; }
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
  const ffa = def.class === "production" ? w.ffaCfg?.productionCostMul ?? 1 : 1;
  return Math.round((upgrade ? def.upgradeCost : def.cost) * w.costMul() * heroMul * ffa);
}

export function specOf(w: World, st: StructureState): TowerSpec | null {
  if (!st.spec || st.type === "core") return null;
  return w.data.structures.types[st.type].specs?.find((s) => s.id === st.spec) ?? null;
}

export function specCost(w: World, type: StructureType, team = -1): number {
  const def = w.data.structures.types[type];
  const hk = team >= 0 ? w.teamHooks(team) : {};
  return Math.round((def.specCost ?? 250) * w.costMul() * (hk.upgradeCostMul ?? 1));
}

export function canSpec(w: World, e: Entity | undefined): boolean {
  const st = e?.structure;
  if (!st || st.type === "core" || st.siege || st.tesla) return false;
  return !!w.data.structures.types[st.type].specs?.length && st.level === 2;
}

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

export function applySpec(w: World, e: Entity, id: string): void {
  const st = e.structure!;
  if (st.type === "core") return;
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
      w.emit({ type: "notice", team, text: st.upgrading || !st.ready ? "BUILDING..." : canSpec(w, existing) ? "PICK A LEVEL 3" : "MAX LEVEL" });
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

export function createStructure(w: World, team: number, pad: Pad, type: StructureType): Entity {
  const sd = w.data.structures;
  const def = sd.types[type];
  const lane = def.class === "tower" ? sd.laneTower[pad.zone] : undefined;
  const hp = def.hp * (lane?.hp ?? 1);
  const e = w.addEntity(team, "structure", sd.structureRadius, pad.x, pad.z, hp);
  e.hp = hp * sd.buildStartHpFrac;
  const core = w.foeCore(team, pad.x, pad.z);
  if (core) e.transform.facing = e.transform.prevFacing = Math.atan2(core.transform.pos.x - pad.x, core.transform.pos.z - pad.z);
  e.structure = {
    type, padIndex: pad.index, level: 1, builtAt: w.time, ready: false, nextAction: w.time + sd.buildSeconds, progress: 0,
    range: (sd.zoneRange[pad.zone] ?? 10) * (def.rangeMul ?? 1), damage: (def.damage ?? 0) * (lane?.damage ?? 1), lastFireAt: -99, shielded: false,
    heroSlow: lane?.heroSlow,
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
  let heroes = 0;
  for (const o of w.entities) {
    if (!o.alive || o.team !== e.team || o.structure) continue;
    if (w.dist(o, e) - o.radius - e.radius > sd.builderRadius) continue;
    if (o.hero) heroes++;
    rate += o.hero ? r.hero : r.unit;
  }
  if (heroes >= 2) rate += r.teamwork * (heroes - 1);
  return Math.min(r.max, rate);
}

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

function exposed(w: World, tower: Entity, hero: Entity, range: number): boolean {
  const h = hero.status;
  if (w.time - h.lastHitAt < 2.5 && Math.hypot(h.lastHitX - tower.transform.pos.x, h.lastHitZ - tower.transform.pos.z) <= range + 2) return true;
  for (const o of w.entities) {
    if (!o.alive || !o.unit || o.team !== hero.team || o.neutral) continue;
    if (w.dist(tower, o) - o.radius <= range) return false;
  }
  return true;
}

export function updateStructure(w: World, e: Entity): void {
  const st = e.structure!;
  if (st.type === "core") return;
  const sd = w.data.structures;
  const def = sd.types[st.type];
  const dt = w.dt;
  if (!st.ready || st.upgrading) {
    const rate = st.ready ? Math.max(1, builderRate(w, e)) : builderRate(w, e);
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
      if (st.specPending) {
        applySpec(w, e, st.specPending);
        st.specPending = undefined;
      } else upgrade(w, e);
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
  const spec = specOf(w, st);
  if (st.type === "damage") {
    let best: Entity | null = null;
    let bestScore = Infinity;
    const siege = st.siege;
    const cands: { o: Entity; score: number }[] = [];
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || (o.status.hidden && !spec?.reveal)) continue;
      if (o.structure && !siege && !o.structure.siege) continue;
      const d = w.dist(e, o) - o.radius;
      if (d > st.range * boost.range * w.rangeMul(e, o)) continue;
      const score = d + (o.hero ? (siege || exposed(w, e, o, st.range) ? -100 : 100) : 0) - (o.structure?.siege ? 60 : 0) - (siege && o.structure ? 40 : 0);
      if (spec?.targets) cands.push({ o, score });
      if (score >= bestScore) continue;
      if (!w.los(e, o, def.projectile?.losTolerance ?? 0.3, 3.2)) continue;
      best = o;
      bestScore = score;
    }
    if (!best) {
      st.nextAction = w.time + 0.2;
      return;
    }
    if (spec && !siege && !st.tesla) {
      if (!towerSpecFire(w, e, best, spec, boost.damage, cands)) {
        st.nextAction = w.time + 0.3;
        return;
      }
      st.lastFireAt = w.time;
      st.nextAction = w.time + (spec.cooldown ?? def.cooldown ?? 1) / haste;
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
    w.fireProjectile(e, best, st.damage * boost.damage * vs, siege ? 30 : def.projectile?.speed ?? 20, false, siege ? "ballista" : "bolt", siege ? 1.2 : 3.2, true, undefined, best.hero && st.heroSlow ? { slowMul: st.heroSlow, slowSeconds: 1 } : undefined);
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
    w.emit({ type: "pulse", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, radius: st.range * boost.range, team: e.team, style: spec?.id });
    const px = e.transform.pos.x;
    const pz = e.transform.pos.z;
    for (const o of targets) {
      const vs = def.vs?.[w.classOf(o)] ?? 1;
      const dmg = st.damage * boost.damage * vs * cm;
      if (spec?.id === "frost") {
        w.damage(e, o, dmg, o.hero ? { slowMul: spec.heroSlow ?? 0.35, slowSeconds: spec.heroSlowSeconds ?? 1.5 } : { stun: spec.freeze ?? 1, slowMul: 0.5, slowSeconds: (spec.freeze ?? 1) + 1 });
      } else if (spec?.id === "storm") {
        w.damage(e, o, dmg, { fromX: px, fromZ: pz, knockback: (spec.knockback ?? 5) * Math.min(1, vs), stun: spec.stun ?? 0.5, big: true });
      } else if (spec?.id === "well") {
        w.damage(e, o, dmg, { fromX: px, fromZ: pz, pull: spec.pull ?? 5, slowMul: spec.slow ?? 0.35, slowSeconds: (spec.cooldown ?? 2) + 0.4 });
      } else {
        const slow = 1 - Math.min(0.85, (1 - (def.slowMul ?? 0.5)) * Math.min(1, vs) * cm);
        w.damage(e, o, dmg, { knockback: (def.knockback ?? 3) * Math.min(1, vs), slowMul: slow, slowSeconds: def.slowSeconds });
      }
    }
    st.lastFireAt = w.time;
    st.nextAction = w.time + (spec?.cooldown ?? def.cooldown ?? 2) / haste;
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

function towerSpecFire(w: World, e: Entity, best: Entity, spec: TowerSpec, boost: number, cands: { o: Entity; score: number }[]): boolean {
  const def = w.data.structures.types[e.structure!.type as StructureType];
  const st = e.structure!;
  const vsOf = (o: Entity) => def.vs?.[w.classOf(o)] ?? 1;
  const slow = (o: Entity) => (o.hero && st.heroSlow ? { slowMul: st.heroSlow, slowSeconds: 1 } : undefined);
  if (spec.id === "ballista") {
    const want = Math.atan2(best.transform.pos.x - e.transform.pos.x, best.transform.pos.z - e.transform.pos.z);
    if (st.aim === undefined || Math.abs(Math.atan2(Math.sin(want - st.aim), Math.cos(want - st.aim))) > 0.3) {
      st.aim = want;
      return false;
    }
    const vs = Math.max(0.8, vsOf(best));
    w.fireProjectile(e, best, st.damage * boost * vs, 34, false, "spear", 3.4, false, undefined, slow(best));
    const sx = e.transform.pos.x;
    const sz = e.transform.pos.z;
    const dx = best.transform.pos.x - sx;
    const dz = best.transform.pos.z - sz;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    st.aim = Math.atan2(dx, dz);
    const reach = len + (spec.pierce ?? 5);
    for (const o of w.entities) {
      if (!o.alive || o === best || o.team === e.team || o.structure || o.status.hidden) continue;
      const ox = o.transform.pos.x - sx;
      const oz = o.transform.pos.z - sz;
      const along = ox * ux + oz * uz;
      if (along < 1 || along > reach) continue;
      if (Math.abs(ox * uz - oz * ux) > (spec.pierceWidth ?? 1) + o.radius) continue;
      w.damage(e, o, st.damage * boost * Math.max(0.8, vsOf(o)) * 0.75, { fromX: sx, fromZ: sz, knockback: 2 });
    }
    w.emit({ type: "pulse", x: sx + ux * reach, y: e.transform.y, z: sz + uz * reach, radius: 0, team: e.team, style: "pierce" });
    return true;
  }
  if (spec.id === "firepot") {
    const r = spec.splash ?? 2.5;
    w.fireAtPoint(e, best.transform.pos.x, best.transform.pos.z, 14, "firepot", 3.4, { radius: r, damage: st.damage * boost * 1.1, slowMul: 0.8, slowSeconds: 0.8 }, true, { radius: spec.burnRadius ?? r, dps: spec.burnDps ?? 30, seconds: spec.burnSeconds ?? 3 });
    return true;
  }
  if (spec.id === "volley") {
    const list = cands.sort((a, b) => a.score - b.score).map((c) => c.o);
    const picks: Entity[] = [best];
    for (const o of list) {
      if (picks.length >= (spec.targets ?? 3)) break;
      if (picks.includes(o) || !w.los(e, o, def.projectile?.losTolerance ?? 0.3, 3.2)) continue;
      picks.push(o);
    }
    while (picks.length < (spec.targets ?? 3)) picks.push(best);
    for (const o of picks) w.fireProjectile(e, o, st.damage * boost * vsOf(o), 28, false, "arrow", 3.4, true, undefined, slow(o));
  }
  return true;
}
