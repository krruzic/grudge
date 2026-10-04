// Talents: per-hero talent trees (data/talents.json). Levelling up (xp from damage, kills and passively) queues
// a pick for the next slot in `order`; learning a talent rewrites that slot's AbilityDef (set/add/mul fields + fx)
// and recompute() caches the result in hero.ab, which abilities() returns. Gameplay code never reads talents
// directly - it reads ability fields and `fx` flags. Effects that talents add live in src/sim/talents/*:
//   effects.ts   shields, bleed, marks, chain lightning, pulls, zones, per-tick status (bleed/shield/recast)
//   missiles.ts  straight-line missiles (waves, bolts, piercing arrows)
//   triggers.ts  hooks called by heroes/world: melee mods, after-hit/after-shot, on-kill, B cooldown/recast
import type { World } from "./world.ts";
import type { AbilityDef, TalentDef, TalentFx } from "./config.ts";
import type { Entity } from "./types.ts";

export {
  addShield,
  applyBleed,
  chainLightning,
  heal,
  mark,
  markTargets,
  pullTo,
  tickStatus,
  zoneAt,
} from "./talents/effects.ts";
export { fireMissile, updateMissiles } from "./talents/missiles.ts";
export { afterMelee, afterShot, bCooldown, frenzySpeed, meleeMods, onBUse, onKill } from "./talents/triggers.ts";

type Slot = "a" | "b" | "r" | "z";

export type TSlot = "a" | "b" | "r" | "z";

export const TSLOTS: TSlot[] = ["r", "b", "a", "z"];

function treeOf(w: World, type: string): Partial<Record<TSlot, TalentDef[]>> | undefined {
  return w.data.talents?.heroes[type];
}

/** The hero's effective abilities: base definitions with learned talents applied (cached in hero.ab). */
export function abilities(w: World, e: Entity): Record<Slot, AbilityDef> {
  return e.hero!.ab ?? w.heroDef(e.hero!.type).abilities;
}

/** Talents learned in a slot (a path holds at most one pick per slot). */
export function learned(w: World, e: Entity, slot: TSlot): TalentDef[] {
  const list = treeOf(w, e.hero!.type)?.[slot];
  const k = e.hero!.path[slot]?.[0];
  return list && k !== undefined && list[k] ? [list[k]] : [];
}

export function allLearned(w: World, e: Entity): TalentDef[] {
  return TSLOTS.flatMap((s) => learned(w, e, s));
}

/** The pending talent choice (first queued pick slot), or null. */
export function options(w: World, e: Entity): { slot: TSlot; list: TalentDef[] } | null {
  const h = e.hero!;
  const slot = h.picks[0];
  if (!slot) return null;
  const list = treeOf(w, h.type)?.[slot];
  return list && list.length && !h.path[slot].length ? { slot, list } : null;
}

/** Shallow-merge talent fx, merging one level deep for object-valued fx. */
function mergeFx(a: TalentFx | undefined, b: TalentFx | undefined): TalentFx | undefined {
  if (!b) return a;
  const out: Record<string, unknown> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] =
      prev && typeof prev === "object" && v && typeof v === "object" ? { ...(prev as object), ...(v as object) } : v;
  }
  return out as TalentFx;
}

/** Apply one talent's set/add/mul overrides and fx to an ability definition (returns a copy). */
function apply(
  def: AbilityDef,
  t: { set?: Record<string, unknown>; add?: Record<string, number>; mul?: Record<string, number>; fx?: TalentFx },
): AbilityDef {
  const d = structuredClone(def) as AbilityDef & Record<string, unknown>;
  for (const [k, v] of Object.entries(t.set ?? {})) d[k] = structuredClone(v);
  for (const [k, v] of Object.entries(t.add ?? {})) d[k] = ((d[k] as number | undefined) ?? 0) + v;
  for (const [k, v] of Object.entries(t.mul ?? {})) if (typeof d[k] === "number") d[k] = (d[k] as number) * v;
  d.fx = mergeFx(d.fx, t.fx);
  return d;
}

/** Rebuild hero.ab from the base abilities: each learned talent, then synergy (`with`) bonuses. */
export function recompute(w: World, e: Entity): void {
  const h = e.hero!;
  const base = w.heroDef(h.type).abilities;
  const out = { ...base } as Record<Slot, AbilityDef>;
  const got = new Set(allLearned(w, e).map((t) => t.id));
  for (const s of TSLOTS) for (const t of learned(w, e, s)) out[s] = apply(out[s], t);
  for (const s of TSLOTS) {
    for (const t of learned(w, e, s)) {
      for (const c of t.with ?? []) if (got.has(c.id)) out[c.slot ?? s] = apply(out[c.slot ?? s], c);
    }
  }
  h.ab = out;
}

/** Union of fx across all four slots. */
export function allFx(w: World, e: Entity): TalentFx {
  const ab = abilities(w, e);
  return mergeFx(mergeFx(mergeFx(ab.a.fx, ab.b.fx), ab.r.fx), ab.z.fx) ?? {};
}

/** Resolve the pending pick with option `choice`; single-option picks chain automatically. */
export function learn(w: World, e: Entity, choice: number): void {
  const h = e.hero!;
  const opt = options(w, e);
  if (!opt) {
    if (h.picks.length) h.picks.shift();
    return;
  }
  const t = opt.list[Math.max(0, Math.min(opt.list.length - 1, choice))];
  h.path[opt.slot].push(opt.list.indexOf(t));
  h.picks.shift();
  recompute(w, e);
  const p = e.transform;
  w.emit({ type: "learned", id: e.id, name: t.name, icon: t.id, x: p.pos.x, y: p.y, z: p.pos.z, team: e.team });
  const next = options(w, e);
  if (next && next.list.length === 1) learn(w, e, 0);
}

/** Give xp to a hero (or the hero owning a summon); levelling raises hp/damage and may queue a talent pick. */
export function gainXp(w: World, e: Entity | null | undefined, amount: number): void {
  const hero = e?.hero ? e : e?.owner ? w.get(e.owner) : undefined;
  if (!hero?.hero || !(amount > 0) || hero.hero.morphed) return;
  const h = hero.hero;
  const cfg = w.data.talents?.xp;
  if (!cfg) return;
  h.xp += amount;
  while (h.level < cfg.levels.length && h.xp >= cfg.levels[h.level]) {
    h.level++;
    const hpK = 1 + cfg.perLevelHp;
    hero.maxHp *= hpK;
    hero.hp = Math.min(hero.maxHp, hero.hp * hpK + hero.maxHp * 0.15);
    h.damageMul *= 1 + cfg.perLevelDamage;
    const tree = treeOf(w, h.type);
    const slot = w.data.talents!.order?.[h.level - 2];
    if (tree && slot && tree[slot]?.length) {
      h.picks.push(slot);
      if (h.picks.length === 1 && tree[slot]!.length === 1) learn(w, hero, 0);
    }
    const p = hero.transform;
    w.emit({ type: "levelup", id: hero.id, level: h.level, x: p.pos.x, y: p.y, z: p.pos.z, team: hero.team });
  }
}

/** Xp for damage dealt to enemies, weighted by target kind. */
export function xpForDamage(w: World, src: Entity | null, target: Entity, amount: number): void {
  const cfg = w.data.talents?.xp;
  if (!cfg || !src || src.team === target.team) return;
  const k = target.hero ? cfg.vsHero : target.structure ? cfg.vsStructure : cfg.vsUnit;
  gainXp(w, src, amount * k);
}
