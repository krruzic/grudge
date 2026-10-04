// Map cannon barrages: every everySeconds, `volleys` telegraphed shots land on random teams' units/heroes outside
// their bases (one per team first, the last one random near the centre). Shots (including bought strikes) resolve
// here too. Target picks consume World.rng.
import type { Arena } from "../arena.ts";
import type { Entity, Vec2 } from "../types.ts";

export function updateCannon(arena: Arena): void {
  const w = arena.w;
  const cfg = w.data.match.arena.cannon;
  if (w.time >= arena.nextCannon) {
    arena.nextCannon = w.time + cfg.everySeconds;
    const based = (x: number, z: number) => {
      for (let t = 0; t < w.teamCount; t++) {
        for (const [ox, oz] of [
          [0, 0],
          [cfg.radius, 0],
          [-cfg.radius, 0],
          [0, cfg.radius],
          [0, -cfg.radius],
        ])
          if (w.inBase(t, x + ox, z + oz)) return true;
      }
      return false;
    };
    const pools = new Map<number, Entity[]>();
    for (const e of w.entities) {
      if (!e.alive || !(e.hero || e.unit) || e.neutral || e.unit?.guard) continue;
      if (based(e.transform.pos.x, e.transform.pos.z)) continue;
      const list = pools.get(e.team) ?? [];
      list.push(e);
      pools.set(e.team, list);
    }
    const hit = new Set<number>();
    const used: Vec2[] = [];
    for (let i = 0; i < cfg.volleys; i++) {
      let p: Vec2 | null = null;
      for (let tries = 0; tries < 10 && !p; tries++) {
        let x: number;
        let z: number;
        const teams = [...pools.keys()];
        const fresh = teams.filter((t) => !hit.has(t));
        const choice = fresh.length ? fresh : teams;
        if (choice.length && i < cfg.volleys - 1) {
          const team = choice[Math.floor(w.rng() * choice.length)];
          const list = pools.get(team)!;
          const t = list[Math.floor(w.rng() * list.length)];
          hit.add(team);
          x = t.transform.pos.x + (w.rng() - 0.5) * cfg.spread;
          z = t.transform.pos.z + (w.rng() - 0.5) * cfg.spread;
        } else {
          x = arena.home.x + (w.rng() - 0.5) * w.terrain.width * 0.5;
          z = arena.home.z + (w.rng() - 0.5) * w.terrain.depth * 0.5;
        }
        const q = arena.snap(
          Math.max(2, Math.min(w.terrain.width - 2, x)),
          Math.max(2, Math.min(w.terrain.depth - 2, z)),
        );
        if (based(q.x, q.z) || used.some((u) => Math.hypot(u.x - q.x, u.z - q.z) < cfg.radius * 1.4)) continue;
        p = q;
      }
      if (!p) continue;
      used.push(p);
      const at = w.time + cfg.warnSeconds + i * cfg.spacing;
      const shot = { x: p.x, z: p.z, y: w.groundY(p.x, p.z), at, warnAt: w.time, radius: cfg.radius, team: -1 };
      arena.shots.push(shot);
      w.emit({ type: "cannonWarn", x: shot.x, y: shot.y, z: shot.z, radius: shot.radius, seconds: at - w.time });
    }
    w.emit({ type: "notice", team: -1, text: "CANNON FIRE!" });
  }
  for (let i = arena.shots.length - 1; i >= 0; i--) {
    const s = arena.shots[i];
    if (w.time < s.at) continue;
    arena.shots.splice(i, 1);
    w.emit({ type: "cannonHit", x: s.x, y: s.y, z: s.z, radius: s.radius });
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === s.team) continue;
      const d = Math.hypot(o.transform.pos.x - s.x, o.transform.pos.z - s.z) - o.radius;
      if (d > s.radius) continue;
      const k = 1 - (Math.max(0, d) / s.radius) * 0.5;
      if (o.structure) {
        if (o.structure.type !== "core") w.damage(null, o, cfg.structureDamage * k, { big: true });
        continue;
      }
      w.damage(null, o, cfg.damage * k, {
        knockback: cfg.knockback * k,
        fromX: s.x,
        fromZ: s.z,
        big: true,
        stun: 0.25,
      });
    }
  }
}
