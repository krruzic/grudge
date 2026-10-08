// Bot navigation: turn the bot's current goal into a stick direction. Long trips may detour via a ready jump pad;
// otherwise the bot walks straight when the goal is close and clear, else follows a cached nav path (re-planned
// every second or when the goal moves > 2 cells) and skips/repaths waypoints when it stops making progress.
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Command, Entity, Vec2 } from "../types.ts";
import { Kind } from "../terrain.ts";

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
        if (
          bot.lost &&
          (bot.path.length === 0 || (bot.path.length === 1 && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.5))
        ) {
          // No walkable path: stranded up on a ledge, a lookout or a bank you can drop off but not walk down. Head
          // for the nearest spot in the goal's area that a straight walk can reach without climbing (a drop).
          if (w.time >= bot.dropAt) {
            bot.dropAt = w.time + 1;
            bot.drop = dropSpot(w, me, bot.goal);
          }
          wp = bot.drop ?? p;
        }
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

/**
 * Nearest cell (within 10 m) in the same nav region as `goal` that a straight walk from the hero reaches without
 * ever stepping up more than the climb limit - i.e. by dropping off the edge it's stranded on. Null if none.
 */
function dropSpot(w: World, me: Entity, goal: Vec2): Vec2 | null {
  const nav = w.nav;
  const regions = nav.regions();
  const gi = nav.nearestOpen(goal.x, goal.z, 3);
  if (gi < 0) return null;
  const want = regions[gi];
  const p = me.transform.pos;
  const step = (me.hero?.stepHeight ?? 0.6) + 0.05;
  let best: Vec2 | null = null;
  let bd = Infinity;
  for (let r = 1; r <= 10; r++)
    for (let k = 0; k < Math.max(8, r * 6); k++) {
      const a = (k / Math.max(8, r * 6)) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const i = nav.index(Math.floor(x), Math.floor(z));
      if (i < 0 || !nav.open(i) || regions[i] !== want) continue;
      const d = r + Math.hypot(goal.x - x, goal.z - z) * 0.15;
      if (d >= bd) continue;
      // Walk the line: blocked by walls, and never up more than a step at a time.
      let ok = true;
      let y = me.transform.y;
      for (let s = 1; s <= r * 3 && ok; s++) {
        const f = s / (r * 3);
        const cx = p.x + (x - p.x) * f;
        const cz = p.z + (z - p.z) * f;
        const ci = nav.index(Math.floor(cx), Math.floor(cz));
        if (ci < 0 || w.terrain.kinds[ci] === Kind.Wall) ok = false;
        const h = w.groundY(cx, cz);
        if (h > y + step) ok = false;
        y = h;
      }
      if (ok) {
        bd = d;
        best = { x, z };
      }
    }
  return best;
}
