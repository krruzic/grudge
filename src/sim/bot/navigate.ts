// Bot navigation: turn the bot's current goal into a stick direction. Long trips may detour via a ready jump pad;
// otherwise the bot walks straight when the goal is close and clear, else follows a cached nav path (re-planned
// every second or when the goal moves > 2 cells) and skips/repaths waypoints when it stops making progress.
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Command, Entity, Vec2 } from "../types.ts";

/** Replace the goal with a jump pad when pad + flight is >= 12 cells shorter than walking (or the goal is walled off). */
export function preferJumpPad(bot: Bot, w: World, me: Entity): void {
  if (bot.goal && w.jumpPads.length && !w.arena.carrying(me) && !me.hero?.bomb) {
    const p = me.transform.pos;
    const g = bot.goal;
    const direct = Math.hypot(g.x - p.x, g.z - p.z);
    const walled = !w.nav.reachable(p, g);
    let best: Vec2 | null = null;
    let bestCost = walled ? Infinity : direct - 12;
    for (const jp of w.jumpPads) {
      if (w.time < jp.readyAt - 1 || w.mapEvents.sealed(jp.x, jp.z, jp.tx, jp.tz)) continue;
      const toPad = Math.hypot(jp.x - p.x, jp.z - p.z);
      if (toPad > (walled ? 60 : 26)) continue;
      const cost = toPad + Math.hypot(g.x - jp.tx, g.z - jp.tz) + 4;
      if (
        cost < bestCost &&
        w.nav.reachable(p, { x: jp.x, z: jp.z }) &&
        (!walled || w.nav.reachable({ x: jp.tx, z: jp.tz }, g))
      ) {
        bestCost = cost;
        best = { x: jp.x, z: jp.z };
      }
    }
    if (best) bot.goal = best;
  }
}

/** Steer toward bot.goal along the nav path; writes cmd.moveX/moveZ. */
export function steer(bot: Bot, w: World, me: Entity, cmd: Command): void {
  if (bot.goal) {
    const p = me.transform.pos;
    const dist = Math.hypot(bot.goal.x - p.x, bot.goal.z - p.z);
    if (dist > 0.6) {
      let wp = bot.goal;
      if (!(dist < 8 && w.nav.wideClear(p, bot.goal, me.radius * 0.8))) {
        if (
          w.time >= bot.repathAt ||
          !bot.pathGoal ||
          Math.hypot(bot.pathGoal.x - bot.goal.x, bot.pathGoal.z - bot.goal.z) > 2
        ) {
          bot.path = w.nav.findPath(p, bot.goal, me.transform.y, me.radius * 0.8) ?? [];
          bot.lost = !w.nav.lastFound;
          bot.pathGoal = { ...bot.goal };
          bot.repathAt = w.time + 1;
        }
        const sameCell = (q: Vec2) => Math.floor(q.x) === Math.floor(p.x) && Math.floor(q.z) === Math.floor(p.z);
        while (
          bot.path.length > 1 &&
          (sameCell(bot.path[0]) ||
            Math.hypot(bot.path[0].x - p.x, bot.path[0].z - p.z) < 0.25 ||
            (Math.hypot(bot.path[0].x - p.x, bot.path[0].z - p.z) < 0.9 &&
              w.nav.wideClear(p, bot.path[1], me.radius * 0.8)))
        )
          bot.path.shift();
        if (Math.hypot(p.x - bot.progress.x, p.z - bot.progress.z) > 0.5) bot.progress = { x: p.x, z: p.z, t: w.time };
        else if (w.time - bot.progress.t > 1 && !me.hero?.action) {
          if (bot.path.length > 1) bot.path.shift();
          bot.repathAt = w.time + 0.5;
          bot.progress = { x: p.x, z: p.z, t: w.time };
        }
        if (bot.path.length) wp = bot.path[0];
        if (bot.lost && (bot.path.length === 0 || (bot.path.length === 1 && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.5)))
          wp = p;
      }
      const dx = wp.x - p.x;
      const dz = wp.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        cmd.moveX = dx / d;
        cmd.moveZ = dz / d;
      }
    }
  }
}
