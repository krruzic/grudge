// Bot team strategy: chat lines, the unit directive a bot commander issues, and the attack/support role split
// between two bots (or a bot and a human) on the same team.
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Directive, Entity } from "../types.ts";
import { baseThreat, enemyHeroes, mateHero } from "./awareness.ts";

export function say(bot: Bot, w: World, me: Entity, text: string): void {
  bot.sayText = `${w.heroDef(me.hero!.type).name.toUpperCase()}: ${text}`;
}

/** Solo bot: defend when the core is swarmed, push with a big army or in sudden death, else follow the hero. */
export function pickDirective(bot: Bot, w: World, me: Entity): Directive {
  const t = w.teams[me.team];
  const core = w.core(me.team);
  if (core && w.enemiesNear(core, 15, (o) => o.kind === "unit").length >= 3) return "nearest";
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

/** Support bot directive (only when no human has issued orders for 25s). */
export function supportDirective(bot: Bot, w: World, me: Entity): Directive {
  const t = w.teams[me.team];
  if (baseThreat(bot, w, me)) return "defend";
  if (w.isSudden() || t.unitCount >= 9) return "push";
  const lead = w.heroOf(me.team);
  if (lead && lead.alive && lead.id !== me.id) return "follow";
  return t.unitCount >= 6 ? "push" : "follow";
}
