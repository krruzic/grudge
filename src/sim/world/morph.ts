// Commander morph ("take up the banner"): in 2v2 without a commander, one hero may channel into the morph hero
// type. The original hero's progression is stashed in hero.morphed and restored by unmorph (or on respawn).
import type { World } from "../world.ts";
import type { Entity } from "../types.ts";
import { recompute } from "../talents.ts";

/**
 * Which morph is available: "to" for a non-commander in a 2-team match whose team has 2+ players and no
 * commander; "back" for a morphed hero standing in its shop. null while channelling.
 */
export function morphState(w: World, e: Entity): "to" | "back" | null {
  const m = w.morphCfg;
  const h = e.hero;
  if (!m || !h || !e.alive || h.morphAt !== undefined || w.ffa || w.teamCount !== 2) return null;
  const slot = w.players.find((p) => p.heroId === e.id);
  if (!slot) return null;
  if (h.morphed) return w.arena.inShop(e) ? "back" : null;
  if (slot.commander) return null;
  const team = w.players.filter((p) => p.team === slot.team);
  if (team.length < 2 || team.some((p) => p.commander)) return null;
  return "to";
}

/** Begin the morph channel (reverting costs gold). Completes in tickMorph. */
export function startMorph(w: World, e: Entity): void {
  const st = w.morphState(e);
  const m = w.morphCfg;
  if (!st || !m) return;
  const h = e.hero!;
  if (st === "back") {
    const ts = w.teams[e.team];
    const cost = Math.round(m.revertCost * w.costMul());
    if (ts.resource < cost) {
      w.emit({ type: "notice", team: e.team, text: `NEED ${cost}` });
      return;
    }
    ts.resource -= cost;
  }
  h.morphAt = w.time + m.channelSeconds;
  h.morphBack = st === "back";
  h.action = null;
  const p = e.transform;
  w.emit({
    type: "morph",
    stage: "start",
    id: e.id,
    to: st === "back" ? h.morphed!.type : m.type,
    back: st === "back",
    x: p.pos.x,
    y: p.y,
    z: p.pos.z,
    team: e.team,
    seconds: m.channelSeconds,
  });
}

/** Finish a due morph channel. */
export function tickMorph(w: World, e: Entity): void {
  const h = e.hero!;
  if (h.morphAt === undefined || w.time < h.morphAt) return;
  h.morphAt = undefined;
  if (h.morphBack) w.unmorph(e);
  else morphTo(w, e, w.morphCfg!.type);
  const p = e.transform;
  w.emit({
    type: "morph",
    stage: "done",
    id: e.id,
    to: h.type,
    back: !h.morphed,
    x: p.pos.x,
    y: p.y,
    z: p.pos.z,
    team: e.team,
    seconds: 0,
  });
  const slot = w.players.find((q) => q.heroId === e.id);
  if (slot)
    w.emit({
      type: "notice",
      team: -1,
      text: h.morphed ? `P${slot.player + 1} TAKES UP THE BANNER` : `P${slot.player + 1} PUTS DOWN THE BANNER`,
    });
}

/** Swap the hero to `type` at level 1, keeping its hp fraction; the old progression goes to hero.morphed. */
function morphTo(w: World, e: Entity, type: string): void {
  const h = e.hero!;
  const frac = e.hp / e.maxHp;
  h.morphed = {
    type: h.type,
    level: h.level,
    xp: h.xp,
    maxHp: e.maxHp,
    damageMul: h.damageMul,
    speed: h.speed,
    path: h.path,
    picks: h.picks,
    stepHeight: h.stepHeight,
    maxSlope: h.maxSlope,
  };
  const def = w.heroDef(type);
  const tiers = w.data.heroes.tiers;
  const b = w.data.heroes.baseline;
  h.type = type;
  h.level = 1;
  h.speed = tiers.speed[def.speed] * (def.hooks.speedMul ?? 1);
  h.damageMul = tiers.damage[def.damage];
  h.path = { a: [], b: [], r: [], z: [] };
  h.picks = [];
  h.stepHeight = def.hooks.stepHeight ?? b.stepHeight;
  h.maxSlope = def.hooks.maxSlope ?? b.maxSlope;
  h.cooldowns = {};
  h.comboIndex = 0;
  e.maxHp = tiers.health[def.health];
  e.hp = Math.max(1, e.maxHp * frac);
  recompute(w, e);
  const slot = w.players.find((q) => q.heroId === e.id);
  if (slot) {
    slot.heroType = type;
    slot.commander = true;
  }
}

/** Restore the stashed pre-morph hero (hp fraction kept, cooldowns reset). */
export function unmorph(w: World, e: Entity): void {
  const h = e.hero!;
  const m = h.morphed;
  if (!m) return;
  const frac = e.hp / e.maxHp;
  h.type = m.type;
  h.level = m.level;
  h.xp = m.xp;
  h.damageMul = m.damageMul;
  h.speed = m.speed;
  h.path = m.path as typeof h.path;
  h.picks = m.picks as typeof h.picks;
  h.stepHeight = m.stepHeight;
  h.maxSlope = m.maxSlope;
  h.cooldowns = {};
  h.comboIndex = 0;
  h.morphed = undefined;
  h.morphAt = undefined;
  e.maxHp = m.maxHp;
  e.hp = Math.max(1, e.maxHp * frac);
  recompute(w, e);
  const slot = w.players.find((q) => q.heroId === e.id);
  if (slot) {
    slot.heroType = m.type;
    slot.commander = false;
  }
}
