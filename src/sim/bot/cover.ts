// CPU cover against arrows and harpoons (Wren, Tadwick): their shots stop at walls and buildings
// (world/projectiles.ts, World.shotBlocker), so a CPU being shot at in the open moves to a spot one of those
// blocks. Retreating, it picks cover on the way home; a melee champion closing in moves cover to cover toward the
// shooter (and just charges once it's close or there's no closer cover); anyone else hurt below half takes the
// nearest cover. Run after think (bot.ts) and only adjusts bot.goal.
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Entity, Vec2 } from "../types.ts";
import { lineBlocker } from "../world/vision.ts";

/** Champions whose shots cover stops. */
const ARCHERS = new Set(["marksman", "harpooner"]);

function exposed(w: World, shooter: Entity, x: number, z: number, y: number): boolean {
  return !lineBlocker(
    w,
    shooter.transform.pos,
    shooter.radius,
    { x, z },
    0.7,
    shooter.transform.y + 1.5,
    y + 1,
    shooter,
  );
}

export function takeCover(bot: Bot, w: World, me: Entity): void {
  const h = me.hero!;
  if (h.action || h.jump || bot.sieging) return;
  const p = me.transform.pos;
  // The nearest archer that has us in range and in the open, and has been hitting us (or we're running).
  let shooter: Entity | undefined;
  let sd = Infinity;
  for (const o of w.entities) {
    if (!o.alive || !o.hero || o.hero.dead || o.team === me.team || !ARCHERS.has(o.hero.type)) continue;
    const d = w.dist(me, o);
    if (d > 13 || d < 3 || !w.canSee(me, o)) continue;
    if (!exposed(w, o, p.x, p.z, me.transform.y)) continue;
    if (d < sd) {
      sd = d;
      shooter = o;
    }
  }
  if (!shooter) return;
  const shotAt = me.status.hurtBy === shooter.id && w.time - (me.status.hurtAt ?? -99) < 2.5;
  const melee = (w.heroDef(h.type).botRange ?? 1.8) <= 3;
  const hurt = me.hp < me.maxHp * 0.5;
  if (!bot.healing && !shotAt) return;
  if (!bot.healing && !melee && !hurt) return;
  // Someone else is on us in melee: that fight comes first.
  if (
    w.entities.some(
      (o) => o.alive && o.hero && !o.hero.dead && o.team !== me.team && o !== shooter && w.dist(me, o) < 3.5,
    )
  )
    return;
  const sp = shooter.transform.pos;
  const home = w.tdm ? null : w.spawnPoint(me.team);
  let best: Vec2 | null = null;
  let bs = Infinity;
  for (let r = 1.5; r <= 9; r += 1.5)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      const i = w.nav.nearestOpen(x, z, 0);
      if (i < 0 || !w.nav.lineClear(p, { x, z })) continue;
      if (exposed(w, shooter, x, z, w.groundY(x, z))) continue;
      const toShooter = Math.hypot(x - sp.x, z - sp.z);
      let score = r;
      if (bot.healing && home) score += Math.hypot(x - home.x, z - home.z) * 0.35;
      else if (melee && !hurt) {
        // Cover-to-cover advance: only spots that get us closer.
        if (toShooter > sd - 1.5) continue;
        score += toShooter * 0.5;
      }
      if (score < bs) {
        bs = score;
        best = { x, z };
      }
    }
  if (best) {
    bot.goal = best;
    bot.why = "cover";
  }
}
