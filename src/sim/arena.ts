import type { World } from "./world.ts";
import type { Entity, UnitType, Vec2 } from "./types.ts";
import { spawnUnit } from "./structures.ts";
import { moveToward } from "./units.ts";

export interface Relic {
  state: "waiting" | "home" | "carried" | "dropped";
  x: number;
  z: number;
  y: number;
  carrier: number;
  since: number;
  lockId: number;
  lockUntil: number;
}

export interface CannonShot {
  x: number;
  z: number;
  y: number;
  at: number;
  warnAt: number;
  radius: number;
}

export const NEUTRAL = 2;

export class Arena {
  readonly home: Vec2;
  readonly relic: Relic;
  readonly shots: CannonShot[] = [];
  private nextCannon: number;
  private nextOgre: number;
  ogreId = 0;

  constructor(private w: World) {
    const cores = w.terrain.cores;
    const a = cores.find((c) => c.team === 0) ?? { x: w.terrain.width * 0.2, z: w.terrain.depth / 2 };
    const b = cores.find((c) => c.team === 1) ?? { x: w.terrain.width * 0.8, z: w.terrain.depth / 2 };
    this.home = this.snap((a.x + b.x) / 2, (a.z + b.z) / 2);
    w.nav.setBlocked(this.home.x, this.home.z, 1.2, true);
    const cfg = w.data.match.arena;
    this.relic = { state: "waiting", x: this.home.x, z: this.home.z, y: w.groundY(this.home.x, this.home.z), carrier: 0, since: cfg.relic.firstSeconds, lockId: 0, lockUntil: 0 };
    this.nextCannon = cfg.cannon.firstSeconds;
    this.nextOgre = cfg.ogre.firstSeconds;
  }

  private snap(x: number, z: number): Vec2 {
    const nav = this.w.nav;
    const i = nav.nearestOpen(x, z, 8);
    if (i < 0) return { x, z };
    return { x: (i % nav.w) + 0.5, z: Math.floor(i / nav.w) + 0.5 };
  }

  carrying(e: Entity): boolean {
    return this.relic.state === "carried" && this.relic.carrier === e.id;
  }

  update(): void {
    this.updateRelic();
    this.updateCannon();
    this.updateOgreSpawn();
  }

  private updateRelic(): void {
    const w = this.w;
    const r = this.relic;
    const cfg = w.data.match.arena.relic;
    if (r.state === "waiting") {
      if (w.time < r.since) return;
      this.reset();
      w.emit({ type: "notice", team: -1, text: "THE GRUDGE AWAKENS" });
      return;
    }
    if (r.state === "carried") {
      const c = w.get(r.carrier);
      if (!c || !c.alive || c.hero?.dead) {
        this.drop(c ?? null, r.x, r.z);
        return;
      }
      if (w.time < c.status.stunUntil) {
        this.drop(c, c.transform.pos.x + c.status.kvx * 0.12, c.transform.pos.z + c.status.kvz * 0.12);
        return;
      }
      r.x = c.transform.pos.x;
      r.z = c.transform.pos.z;
      r.y = c.transform.y;
      const core = w.core(1 - c.team);
      if (core && w.dist(c, core) <= core.radius + cfg.deliverReach) this.deliver(c, core);
      return;
    }
    if (r.state === "dropped" && w.time - r.since > cfg.returnSeconds) {
      this.reset();
      w.emit({ type: "notice", team: -1, text: "THE GRUDGE RETURNS" });
      return;
    }
    for (const p of w.players) {
      const e = w.get(p.heroId);
      if (!e || !e.alive || e.hero?.dead) continue;
      if (e.id === r.lockId && w.time < r.lockUntil) continue;
      if (e.hero?.action?.kind === "dodge") continue;
      if (Math.hypot(e.transform.pos.x - r.x, e.transform.pos.z - r.z) > cfg.pickupRadius) continue;
      r.state = "carried";
      r.carrier = e.id;
      r.since = w.time;
      w.emit({ type: "relic", state: "taken", team: e.team, player: p.player, x: r.x, y: r.y, z: r.z });
      w.emit({ type: "notice", team: -1, text: `P${p.player + 1} HAS THE GRUDGE` });
      return;
    }
  }

  private reset(): void {
    const r = this.relic;
    r.state = "home";
    r.x = this.home.x;
    r.z = this.home.z;
    r.y = this.w.groundY(r.x, r.z);
    r.carrier = 0;
    r.since = this.w.time;
    this.w.emit({ type: "relic", state: "home", team: -1, player: -1, x: r.x, y: r.y, z: r.z });
  }

  drop(from: Entity | null, x: number, z: number): void {
    const w = this.w;
    const r = this.relic;
    if (r.state !== "carried") return;
    const p = this.snap(x, z);
    r.state = "dropped";
    r.x = p.x;
    r.z = p.z;
    r.y = w.groundY(p.x, p.z);
    r.since = w.time;
    r.lockId = from?.id ?? 0;
    r.lockUntil = w.time + w.data.match.arena.relic.dropLockSeconds;
    r.carrier = 0;
    w.emit({ type: "relic", state: "dropped", team: from?.team ?? -1, player: from?.hero?.player ?? -1, x: r.x, y: r.y, z: r.z });
    w.emit({ type: "notice", team: -1, text: "GRUDGE DROPPED!" });
  }

  private deliver(c: Entity, core: Entity): void {
    const w = this.w;
    const r = this.relic;
    const cfg = w.data.match.arena.relic;
    const enemy = core.team;
    const cp = core.transform;
    if (core.structure!.shielded && !w.isSudden()) {
      w.teams[enemy].homeLost = true;
      core.structure!.shielded = false;
      w.emit({ type: "relic", state: "cracked", team: c.team, player: c.hero!.player, x: cp.pos.x, y: cp.y, z: cp.pos.z });
      w.emit({ type: "notice", team: -1, text: "SHIELD CRACKED!" });
    } else {
      const dmg = Math.round(core.maxHp * cfg.coreDamageFrac);
      core.hp -= dmg;
      w.teams[c.team].coreDamageDealt += dmg;
      w.emit({ type: "hit", x: cp.pos.x, y: cp.y + 2, z: cp.pos.z, team: enemy, big: true, id: core.id, amount: dmg, src: c.id });
      w.emit({ type: "relic", state: "delivered", team: c.team, player: c.hero!.player, x: cp.pos.x, y: cp.y, z: cp.pos.z });
      w.emit({ type: "notice", team: -1, text: "GRUDGE DELIVERED!" });
      if (core.hp <= 0) w.kill(core, c);
    }
    r.state = "waiting";
    r.carrier = 0;
    r.since = w.time + cfg.respawnSeconds;
    r.x = this.home.x;
    r.z = this.home.z;
  }

  private updateCannon(): void {
    const w = this.w;
    const cfg = w.data.match.arena.cannon;
    if (w.time >= this.nextCannon) {
      this.nextCannon = w.time + cfg.everySeconds;
      const targets = w.entities.filter((e) => e.alive && (e.hero || e.unit) && !e.neutral);
      const used: Vec2[] = [];
      for (let i = 0; i < cfg.volleys; i++) {
        let x: number;
        let z: number;
        if (targets.length && i < cfg.volleys - 1) {
          const t = targets[Math.floor(w.rng() * targets.length)];
          x = t.transform.pos.x + (w.rng() - 0.5) * cfg.spread;
          z = t.transform.pos.z + (w.rng() - 0.5) * cfg.spread;
        } else {
          x = this.home.x + (w.rng() - 0.5) * w.terrain.width * 0.5;
          z = this.home.z + (w.rng() - 0.5) * w.terrain.depth * 0.5;
        }
        const p = this.snap(Math.max(2, Math.min(w.terrain.width - 2, x)), Math.max(2, Math.min(w.terrain.depth - 2, z)));
        if (used.some((u) => Math.hypot(u.x - p.x, u.z - p.z) < cfg.radius * 1.4)) continue;
        used.push(p);
        const at = w.time + cfg.warnSeconds + i * cfg.spacing;
        const shot = { x: p.x, z: p.z, y: w.groundY(p.x, p.z), at, warnAt: w.time, radius: cfg.radius };
        this.shots.push(shot);
        w.emit({ type: "cannonWarn", x: shot.x, y: shot.y, z: shot.z, radius: shot.radius, seconds: at - w.time });
      }
      w.emit({ type: "notice", team: -1, text: "CANNON FIRE!" });
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (w.time < s.at) continue;
      this.shots.splice(i, 1);
      w.emit({ type: "cannonHit", x: s.x, y: s.y, z: s.z, radius: s.radius });
      for (const o of w.entities.slice()) {
        if (!o.alive) continue;
        const d = Math.hypot(o.transform.pos.x - s.x, o.transform.pos.z - s.z) - o.radius;
        if (d > s.radius) continue;
        const k = 1 - Math.max(0, d) / s.radius * 0.5;
        if (o.structure) {
          if (o.structure.type !== "core") w.damage(null, o, cfg.structureDamage * k, { big: true });
          continue;
        }
        w.damage(null, o, cfg.damage * k, { knockback: cfg.knockback * k, fromX: s.x, fromZ: s.z, big: true, stun: 0.25 });
      }
    }
  }

  private updateOgreSpawn(): void {
    const w = this.w;
    const cfg = w.data.match.arena.ogre;
    const cur = this.ogreId ? w.get(this.ogreId) : undefined;
    if (cur?.alive) return;
    if (this.ogreId) {
      this.ogreId = 0;
      this.nextOgre = w.time + cfg.respawnSeconds;
      return;
    }
    if (w.time < this.nextOgre) return;
    const cores = w.terrain.cores;
    const a = cores[0] ?? { x: 0, z: 0 };
    const b = cores[1] ?? { x: w.terrain.width, z: w.terrain.depth };
    const ax = b.x - a.x;
    const az = b.z - a.z;
    const al = Math.hypot(ax, az) || 1;
    const side = w.rng() < 0.5 ? 1 : -1;
    const off = Math.min(w.terrain.width, w.terrain.depth) * 0.3;
    const p = this.snap(this.home.x - (az / al) * off * side, this.home.z + (ax / al) * off * side);
    const e = w.addEntity(NEUTRAL, "unit", cfg.radius, p.x, p.z, cfg.hp);
    e.neutral = true;
    e.unit = {
      type: "heavy", damage: cfg.damage, speed: cfg.speed, range: cfg.range, cooldown: cfg.cooldown, aggro: cfg.aggro,
      nextAttack: w.time + 1, targetId: 0, retargetAt: 0, path: [], pathGoal: { x: p.x, z: p.z }, repathAt: 0, slot: 0,
      attackAnimAt: -99, moving: false, rank: 0, kills: 0,
    };
    this.ogreId = e.id;
    w.emit({ type: "spawn", id: e.id });
    w.emit({ type: "notice", team: -1, text: "THE OGRE WAKES!" });
  }

  callSquad(hero: Entity, type: UnitType): boolean {
    const w = this.w;
    const team = hero.team;
    const ts = w.teams[team];
    const sq = w.data.units.squads;
    if (w.time < ts.callReadyAt) return false;
    const cost = Math.round(sq.cost[type] * w.costMul());
    const room = w.data.units.popCap - ts.unitCount;
    if (room <= 0) {
      w.emit({ type: "notice", team, text: "ARMY FULL" });
      return false;
    }
    if (ts.resource < cost) {
      w.emit({ type: "notice", team, text: `NEED ${cost}` });
      return false;
    }
    let from: Entity | undefined;
    let best = Infinity;
    for (const o of w.entities) {
      if (!o.alive || o.team !== team || !o.structure?.ready) continue;
      const def = o.structure.type === "core" ? null : w.data.structures.types[o.structure.type];
      if (def?.unit !== type) continue;
      const d = w.dist(hero, o);
      if (d < best) { best = d; from = o; }
    }
    const base = from ?? w.core(team);
    if (!base) return false;
    const enemy = w.core(1 - team);
    const dx = (enemy?.transform.pos.x ?? w.terrain.width / 2) - base.transform.pos.x;
    const dz = (enemy?.transform.pos.z ?? w.terrain.depth / 2) - base.transform.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    const out = base.radius + 1.6;
    const cx = base.transform.pos.x + (dx / dl) * out;
    const cz = base.transform.pos.z + (dz / dl) * out;
    const fst = from?.structure;
    const upStat = fst && fst.type !== "core" && fst.level > 1 ? w.data.structures.types[fst.type].upgrade.unitStat ?? 1 : 1;
    const stat = from ? upStat * sq.forwardStatMul : 1;
    const n = Math.min(sq.size, room);
    for (let i = 0; i < n; i++) {
      const a = ((i - (n - 1) / 2) * 0.9);
      spawnUnit(w, team, type, cx - (dz / dl) * a, cz + (dx / dl) * a, stat);
    }
    ts.resource -= cost;
    ts.callReadyAt = w.time + sq.cooldown;
    w.emit({ type: "squad", team, unitType: type, x: cx, y: w.groundY(cx, cz), z: cz });
    return true;
  }
}

export function updateOgre(w: World, e: Entity): void {
  const u = e.unit!;
  const cfg = w.data.match.arena.ogre;
  if (w.time < e.status.stunUntil) return;
  let target = u.targetId ? w.get(u.targetId) : undefined;
  if (target && (!target.alive || target.structure)) target = undefined;
  const lair = u.pathGoal ?? { x: e.transform.pos.x, z: e.transform.pos.z };
  if (target && Math.hypot(target.transform.pos.x - lair.x, target.transform.pos.z - lair.z) > cfg.leash) target = undefined;
  if (!target || w.time >= u.retargetAt) {
    u.retargetAt = w.time + 0.5;
    let best: Entity | undefined;
    let bestD = cfg.aggro;
    for (const o of w.entities) {
      if (!o.alive || o.neutral || o.structure || !w.canSee(e, o)) continue;
      const d = w.dist(e, o);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) target = best;
    else if (target && w.dist(e, target) > cfg.aggro * 1.5) target = undefined;
    u.targetId = target?.id ?? 0;
  }
  if (!target) {
    u.targetId = 0;
    moveToward(w, e, lair, 1);
    if (e.hp < e.maxHp) w.heal(e, e.maxHp * 0.02 * w.dt);
    return;
  }
  const d = w.dist(e, target) - target.radius - e.radius;
  if (d <= u.range) {
    w.faceToward(e, target.transform.pos.x - e.transform.pos.x, target.transform.pos.z - e.transform.pos.z, 8);
    if (w.time >= u.nextAttack) {
      u.nextAttack = w.time + u.cooldown;
      u.attackAnimAt = w.time;
      const p = e.transform.pos;
      const fx = Math.sin(e.transform.facing);
      const fz = Math.cos(e.transform.facing);
      w.emit({ type: "slam", x: p.x + fx * 1.2, y: e.transform.y, z: p.z + fz * 1.2, radius: 2.2, team: NEUTRAL });
      for (const o of w.entities.slice()) {
        if (!o.alive || o.neutral || o.structure) continue;
        const dd = Math.hypot(o.transform.pos.x - (p.x + fx * 1.2), o.transform.pos.z - (p.z + fz * 1.2)) - o.radius;
        if (dd > 1.6) continue;
        w.damage(e, o, u.damage, { knockback: cfg.knockback, big: true, stun: 0.3 });
      }
    }
    return;
  }
  moveToward(w, e, { x: target.transform.pos.x, z: target.transform.pos.z }, target.radius + e.radius + u.range * 0.8);
}
