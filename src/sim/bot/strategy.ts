// Bot team strategy: chat lines, the unit directive a bot commander issues, and the attack/support role split
// between two bots (or a bot and a human) on the same team.
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Directive, Entity } from "../types.ts";
import { enemyHeroes, mateHero } from "./awareness.ts";

export function say(bot: Bot, w: World, me: Entity, text: string): void {
  bot.sayText = `${w.heroDef(me.hero!.type).name.toUpperCase()}: ${text}`;
}

/** Every enemy champion is currently dead (a free window to push). */
export function foesDown(w: World, team: number): boolean {
  const foes = w.players.filter((p) => p.team !== team && !p.commander);
  return foes.length > 0 && foes.every((p) => w.getAny(p.heroId)?.hero?.dead);
}

/**
 * A building of ours that is actually losing its fight: attackers within 13 m clearly outweigh what defends it
 * there (its own fire, our soldiers and champions), and it's the keep or a tower already under 60%. A lone
 * champion poking a healthy tower doesn't count - the nearest few soldiers handle that (units.ts call-ups).
 */
export function realThreat(w: World, team: number): Entity | undefined {
  if (foesDown(w, team)) return undefined;
  let worst: Entity | undefined;
  let gap = 0;
  for (const s of w.entities) {
    if (!s.alive || s.team !== team || !s.structure || s.structure.siege) continue;
    const core = s.structure.type === "core";
    if (!core && (!w.arena.isTowerOrKeep(s) || s.hp > s.maxHp * 0.6)) continue;
    let ours = s.structure.damage > 0 ? 0.8 : 0;
    let theirs = 0;
    for (const o of w.entities) {
      if (!o.alive || o.structure || o.neutral || o.team < 0) continue;
      if (Math.hypot(o.transform.pos.x - s.transform.pos.x, o.transform.pos.z - s.transform.pos.z) > 13) continue;
      const v = o.hero ? (o.hero.dead ? 0 : 0.4 + (o.hp / o.maxHp) * 0.8) : 0.15;
      if (o.team === team) ours += v;
      else theirs += v;
    }
    const g = theirs - ours * 1.3;
    if (theirs >= 0.9 && g > gap) {
      gap = g;
      worst = s;
    }
  }
  return worst;
}

/** Solo bot: defend when a building is really losing, push with a big army, in sudden death or while every enemy
 * champion is dead, else follow the hero. */
export function pickDirective(bot: Bot, w: World, me: Entity): Directive {
  const t = w.teams[me.team];
  if (realThreat(w, me.team)) return "nearest";
  if (foesDown(w, me.team) && t.unitCount >= 3) return "push";
  if (t.unitCount >= 7 || w.isSudden()) return "push";
  if (t.unitCount >= 4 && w.time > 90) return "follow";
  return "follow";
}

/** Pick attack vs support from where the mate tends to be (home -> we attack, field -> we support). */
export function updateRole(bot: Bot, w: World, me: Entity): void {
  if (bot.mate === null) {
    bot.role = "solo";
    return;
  }
  const slot = w.players.find((k) => k.player === bot.mate);
  const mate = mateHero(bot, w);
  let want = bot.role === "solo" ? "support" : bot.role;
  if (slot?.commander) want = "attack";
  else if (mate) {
    const own = w.core(me.team)!;
    const foe = w.foeCore(me.team, own.transform.pos.x, own.transform.pos.z) ?? own;
    const dOwn = w.dist(mate, own);
    const dFoe = w.dist(mate, foe);
    const frac = dOwn / (dOwn + dFoe || 1);
    const fighting = enemyHeroes(bot, w, me).some((e) => w.dist(mate, e) < 9);
    const tending =
      w.arena.inShop(mate) ||
      w.pads.some(
        (pd) => pd.side === me.team && Math.hypot(pd.x - mate.transform.pos.x, pd.z - mate.transform.pos.z) < 3,
      );
    const home = fighting ? 0 : frac < 0.36 || tending ? 1 : frac > 0.5 ? 0 : 0.5;
    bot.homeScore += (home - bot.homeScore) * 0.05;
    if (bot.homeScore > 0.68) want = "attack";
    else if (bot.homeScore < 0.32) want = "support";
  }
  if (want !== bot.role && (bot.role === "solo" || w.time - bot.roleAt > 12)) {
    if (bot.role !== "solo") say(bot, w, me, want === "attack" ? "I'LL TAKE THE FIGHT TO THEM" : "I'LL COVER YOU");
    bot.role = want as "attack" | "support";
    bot.roleAt = w.time;
  }
}

/** Support bot directive (only when no human has issued orders for a while, see Bot.command). */
export function supportDirective(bot: Bot, w: World, me: Entity): Directive {
  const t = w.teams[me.team];
  if (foesDown(w, me.team) && t.unitCount >= 3) return "push";
  if (realThreat(w, me.team)) return "defend";
  if (w.isSudden() || t.unitCount >= 9) return "push";
  const lead = w.heroOf(me.team);
  if (lead && lead.alive && lead.id !== me.id) return "follow";
  return t.unitCount >= 6 ? "push" : "follow";
}
