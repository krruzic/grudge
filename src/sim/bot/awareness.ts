// Bot world queries: teammates/enemy heroes, reachability, base threats, which fight to help with, grass to lurk
// in, gravewalk destinations and the nearest enemy structure to push. Mostly pure reads of World (assistTarget and
// grassCover also update a little bot memory).
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Entity, Vec2 } from "../types.ts";
import { graveSpots } from "../heroes.ts";
import { say } from "./strategy.ts";

/** The bot's living teammate hero, if it has one. */
export function mateHero(bot: Bot, w: World): Entity | undefined {
  if (bot.mate === null) return undefined;
  const m = w.heroForPlayer(bot.mate);
  return m && m.alive ? m : undefined;
}

export function enemyHeroes(bot: Bot, w: World, me: Entity): Entity[] {
  return w.players
    .filter((k) => k.team !== me.team)
    .map((k) => w.get(k.heroId))
    .filter((e): e is Entity => !!e && e.alive);
}

/** Reachable on foot from the bot's position. */
export function ok(bot: Bot, w: World, me: Entity, g: Vec2 | { transform: { pos: Vec2 } }): boolean {
  const q = "transform" in g ? g.transform.pos : g;
  return w.nav.reachable(me.transform.pos, q);
}

/** Enemy closest to the own tower/keep under the heaviest attack (heroes count 3), if the score is >= 3. */
export function baseThreat(bot: Bot, w: World, me: Entity): Entity | undefined {
  let worst: Entity | undefined;
  let most = 0;
  for (const o of w.entities) {
    if (!o.alive || o.team !== me.team || !o.structure || o.structure.siege) continue;
    if (o.structure.type !== "core" && !w.arena.isTowerOrKeep(o)) continue;
    const foes = w.enemiesNear(o, 13, (e) => e.kind === "unit" || e.kind === "hero");
    const score = foes.reduce((n, e) => n + (e.hero ? 3 : 1), 0) + (o.structure.type === "core" ? 1 : 0);
    if (score >= 3 && score > most) {
      most = score;
      worst = foes.sort((a, b) => w.dist(a, o) - w.dist(b, o))[0];
    }
  }
  return worst;
}

/** Enemy hero worth intervening against near the mate (mate outnumbered/hurt, foe weak, or we're support). */
export function assistTarget(bot: Bot, w: World, me: Entity): Entity | undefined {
  const mate = mateHero(bot, w);
  if (!mate || bot.role === "solo") return undefined;
  const reach = bot.role === "support" ? 45 : 22;
  if (w.dist(me, mate) > reach) return undefined;
  const foes = enemyHeroes(bot, w, me).filter((e) => w.dist(mate, e) < 9 && w.canSee(me, e));
  if (!foes.length) return undefined;
  const friends = w.players
    .filter((k) => k.team === me.team && k.player !== bot.player)
    .map((k) => w.get(k.heroId))
    .filter((e) => e && e.alive && w.dist(mate, e) < 9).length;
  const weak = foes.find((e) => e.hp < e.maxHp * 0.4);
  const outnumbered = foes.length > friends;
  const hurting = mate.hp < mate.maxHp * 0.55;
  if (!(outnumbered || hurting || weak || bot.role === "support")) return undefined;
  const t = weak ?? foes.sort((a, b) => w.dist(a, mate) - w.dist(b, mate))[0];
  if (w.time - bot.helpSaidAt > 15 && w.dist(me, t) > 12 && (outnumbered || hurting)) {
    bot.helpSaidAt = w.time;
    say(bot, w, me, weak ? "MOVING IN TO FINISH THEM" : "HOLD ON, I'M COMING");
  }
  return t;
}

/** While retreating from a hero 3-10 away: lurk up to 3s in grass the foe can't see into, else find nearby grass. */
export function grassCover(bot: Bot, w: World, me: Entity, foe: Entity, dFoe: number): Vec2 | null {
  if (dFoe > 10 || dFoe < 3) return null;
  const p = me.transform.pos;
  if (me.status.hidden && !w.canSee(foe, me) && w.grassPatchAt(p.x, p.z) > 0) {
    if (bot.lurkUntil < 0) bot.lurkUntil = w.time + 3;
    if (w.time < bot.lurkUntil) return { x: p.x, z: p.z };
    return null;
  }
  if (bot.lurkUntil >= 0) {
    bot.lurkUntil = -1;
    bot.lurkAgain = w.time + 6;
  }
  if (w.time < bot.lurkAgain) return null;
  const fp = foe.transform.pos;
  const foePatch = w.grassPatchAt(fp.x, fp.z);
  const cx = Math.floor(p.x);
  const cz = Math.floor(p.z);
  let best: Vec2 | null = null;
  let bd = 26;
  for (let dz = -5; dz <= 5; dz++)
    for (let dx = -5; dx <= 5; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 >= bd) continue;
      const x = cx + dx + 0.5;
      const z = cz + dz + 0.5;
      const patch = w.grassPatchAt(x, z);
      if (!patch || patch === foePatch || Math.hypot(x - fp.x, z - fp.z) < dFoe) continue;
      bd = d2;
      best = { x, z };
    }
  return best && ok(bot, w, me, best) ? best : null;
}

/** Summoner: distant own structure with enough enemies around it to be worth gravewalking to. */
export function graveTarget(bot: Bot, w: World, me: Entity): Vec2 | null {
  const p = me.transform.pos;
  let best: Vec2 | null = null;
  let bs = 0;
  for (const s of graveSpots(w, me)) {
    if (s.keep || Math.hypot(s.x - p.x, s.z - p.z) < 28) continue;
    const st = w.get(s.id)?.structure;
    if (!st || st.type === "core") continue;
    let foes = 0;
    let heroes = 0;
    let mine = 0;
    for (const o of w.entities) {
      if (!o.alive || o.structure || o.neutral || Math.hypot(o.transform.pos.x - s.x, o.transform.pos.z - s.z) > 14)
        continue;
      if (o.team === me.team) mine += o.unit ? 1 : 0;
      else if (o.hero) heroes++;
      else if (o.unit) foes++;
    }
    if (heroes > 1 || foes + heroes * 3 < 2) continue;
    const prod = w.data.structures.types[st.type].class === "production";
    const score = foes + heroes * 3 + (prod ? mine * 0.5 : 0);
    if (score >= 3 && score > bs) {
      bs = score;
      best = { x: s.x, z: s.z };
    }
  }
  return best;
}

/** Nearest reachable enemy structure (a warded keep counts - the ward only soaks damage), else the rival spawn. */
export function frontTarget(bot: Bot, w: World, me: Entity): Vec2 {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team === me.team || !o.structure) continue;
    if (!ok(bot, w, me, o)) continue;
    const d = w.dist(me, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (!best) return w.spawnPoint(w.rival(me.team));
  return { x: best.transform.pos.x, z: best.transform.pos.z };
}
