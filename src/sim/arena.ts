import type { World } from "./world.ts";
import type { Entity, ShopItem, UnitType, Vec2 } from "./types.ts";
import { spawnUnit } from "./structures.ts";
import { moveToward } from "./units.ts";

export interface Relic {
  state: "waiting" | "home" | "carried" | "dropped" | "shrined";
  shrineId: number;
  team: number;
  stealer: number;
  x: number;
  z: number;
  y: number;
  carrier: number;
  since: number;
  lockId: number;
  lockUntil: number;
  channel: number;
}

export interface CannonShot {
  x: number;
  z: number;
  y: number;
  at: number;
  warnAt: number;
  radius: number;
  team: number;
}

export interface ThrownBomb {
  fromX: number;
  fromZ: number;
  fromY: number;
  toX: number;
  toZ: number;
  toY: number;
  start: number;
  dur: number;
  ownerId: number;
  team: number;
}

export interface Bomb {
  x: number;
  z: number;
  y: number;
  targetId: number;
  ownerId: number;
  team: number;
  at: number;
}

export const NEUTRAL = 2;

export class Arena {
  readonly home: Vec2;
  readonly relic: Relic;
  readonly shots: CannonShot[] = [];
  readonly bombs: Bomb[] = [];
  readonly thrown: ThrownBomb[] = [];
  private nextCannon: number;
  private nextOgre: number;
  private nextWave: number;
  ogreId = 0;
  private crackNoticeAt = -99;

  constructor(private w: World) {
    const cores = w.terrain.cores;
    const a = cores.find((c) => c.team === 0) ?? { x: w.terrain.width * 0.2, z: w.terrain.depth / 2 };
    const b = cores.find((c) => c.team === 1) ?? { x: w.terrain.width * 0.8, z: w.terrain.depth / 2 };
    this.home = this.snap((a.x + b.x) / 2, (a.z + b.z) / 2);
    w.nav.setBlocked(this.home.x, this.home.z, 1.2, true);
    const cfg = w.data.match.arena;
    this.relic = { state: "waiting", x: this.home.x, z: this.home.z, y: w.groundY(this.home.x, this.home.z), carrier: 0, since: cfg.relic.firstSeconds, lockId: 0, lockUntil: 0, channel: 0, shrineId: 0, team: -1, stealer: 0 };
    this.nextCannon = cfg.cannon.firstSeconds;
    this.nextOgre = cfg.ogre.firstSeconds;
    this.nextWave = w.data.units.waves.firstSeconds;
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
    this.updateWaves();
    this.updateBombs();
  }

  private updateWaves(): void {
    const w = this.w;
    const wv = w.data.units.waves;
    if (w.time < this.nextWave) return;
    this.nextWave = w.time + wv.everySeconds;
    const grow = 1 + wv.growPerMinute * (w.time / 60);
    for (let team = 0; team < 2; team++) {
      const ts = w.teams[team];
      const core = w.core(team);
      if (!core) continue;
      const list: { type: UnitType; from: Entity; stat: number }[] = [];
      for (const o of w.entities) {
        if (!o.alive || o.team !== team || !o.structure?.ready || o.structure.type === "core") continue;
        const def = w.data.structures.types[o.structure.type];
        if (def.class !== "production" || !def.unit) continue;
        const up = o.structure.level > 1 ? def.upgrade.unitStat ?? 1 : 1;
        const blessed = this.relic.state === "shrined" && this.relic.shrineId === o.id;
        const rc = w.data.match.arena.relic;
        for (let k = 0; k < o.structure.level + (blessed ? rc.outpostExtra : 0); k++) list.push({ type: def.unit, from: o, stat: grow * up * (blessed ? rc.outpostStatMul : 1) });
      }
      let n = 0;
      let broke = false;
      for (const item of list) {
        if (ts.unitCount >= w.data.units.popCap) break;
        const cost = Math.round((wv.spawnCost[item.type] ?? 0) * w.costMul());
        if (ts.resource < cost) {
          broke = true;
          continue;
        }
        ts.resource -= cost;
        const p = this.frontOf(item.from, team, n++);
        spawnUnit(w, team, item.type, p.x, p.z, item.stat);
      }
      if (broke) w.emit({ type: "notice", team, text: "NO GOLD · OUTPOSTS IDLE" });
    }
  }

  private frontOf(from: Entity, team: number, i: number): Vec2 {
    const w = this.w;
    const enemy = w.core(1 - team);
    const dx = (enemy?.transform.pos.x ?? w.terrain.width / 2) - from.transform.pos.x;
    const dz = (enemy?.transform.pos.z ?? w.terrain.depth / 2) - from.transform.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    const out = from.radius + 1.6;
    const side = ((i % 3) - 1) * 0.9;
    return { x: from.transform.pos.x + (dx / dl) * out - (dz / dl) * side, z: from.transform.pos.z + (dz / dl) * out + (dx / dl) * side };
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
      const shrine = this.shrineNear(c);
      if (shrine) {
        if (r.channel === 0 && w.time - this.crackNoticeAt > 4) {
          this.crackNoticeAt = w.time;
          w.emit({ type: "notice", team: -1, text: `P${c.hero!.player + 1} IS ENSHRINING THE GRUDGE` });
        }
        r.channel += w.dt;
        if (r.channel >= cfg.enshrineSeconds) this.enshrine(c, shrine);
      } else r.channel = 0;
      return;
    }
    if (r.state === "shrined") {
      this.updateShrine();
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
    r.channel = 0;
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

  isTowerOrKeep(o: Entity): boolean {
    const st = o.structure;
    if (!st || st.siege || !st.ready) return false;
    if (st.type === "core") return true;
    const cls = this.w.data.structures.types[st.type]?.class;
    return cls === "tower" || (cls === "production" && st.padIndex >= 0);
  }

  private shrineNear(c: Entity): Entity | null {
    const w = this.w;
    const reach = w.data.match.arena.relic.deliverReach;
    let best: Entity | null = null;
    let bd = Infinity;
    for (const o of w.entities) {
      if (!o.alive || o.team !== c.team || !this.isTowerOrKeep(o)) continue;
      const d = w.dist(c, o) - o.radius;
      if (d <= reach && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  shrineOf(team: number): Entity | null {
    const r = this.relic;
    if (r.state !== "shrined" || r.team !== team) return null;
    return this.w.get(r.shrineId) ?? null;
  }

  heldBy(team: number): boolean {
    const r = this.relic;
    if (r.state === "shrined") return r.team === team;
    return false;
  }

  towerBoost(e: Entity): { damage: number; range: number } {
    const r = this.relic;
    const cfg = this.w.data.match.arena.relic;
    if (r.state === "shrined" && r.shrineId === e.id && e.structure?.type !== "core") return { damage: cfg.towerDamageMul, range: cfg.towerRangeMul };
    return { damage: 1, range: 1 };
  }

  private enshrine(c: Entity, s: Entity): void {
    const w = this.w;
    const r = this.relic;
    const sp = s.transform;
    r.state = "shrined";
    r.shrineId = s.id;
    r.team = c.team;
    r.carrier = 0;
    r.channel = 0;
    r.stealer = 0;
    r.since = w.time;
    r.x = sp.pos.x;
    r.z = sp.pos.z;
    r.y = sp.y;
    const where = s.structure!.type === "core" ? "KEEP" : "TOWER";
    w.emit({ type: "relic", state: "shrined", team: c.team, player: c.hero!.player, x: sp.pos.x, y: sp.y, z: sp.pos.z });
    w.emit({ type: "notice", team: -1, text: `${c.team === 0 ? "BLUE" : "RED"} ENSHRINES THE GRUDGE IN A ${where}` });
  }

  private updateShrine(): void {
    const w = this.w;
    const r = this.relic;
    const cfg = w.data.match.arena.relic;
    const s = w.get(r.shrineId);
    if (!s || !s.alive) {
      const p = this.snap(r.x + 1.5, r.z);
      r.state = "dropped";
      r.x = p.x;
      r.z = p.z;
      r.y = w.groundY(p.x, p.z);
      r.since = w.time;
      r.lockId = 0;
      r.team = -1;
      r.shrineId = 0;
      w.emit({ type: "relic", state: "dropped", team: -1, player: -1, x: r.x, y: r.y, z: r.z });
      w.emit({ type: "notice", team: -1, text: "THE SHRINE FELL · GRUDGE LOOSE!" });
      return;
    }
    if (s.structure!.type === "core" && !w.isSudden()) {
      const st = s.structure!;
      st.ward = Math.min(w.data.structures.core.ward, (st.ward ?? 0) + cfg.keepWardRegen * w.dt);
      st.shielded = (st.ward ?? 0) > 0;
    }
    let thief: Entity | null = null;
    let bd = Infinity;
    for (const p of w.players) {
      const e = w.get(p.heroId);
      if (!e || !e.alive || e.hero?.dead || e.team === r.team) continue;
      const d = w.dist(e, s) - s.radius;
      if (d <= cfg.stealReach && d < bd) { bd = d; thief = e; }
    }
    if (!thief || thief.id !== r.stealer || w.time - thief.hero!.combatAt < 0.05) {
      if (thief && thief.id !== r.stealer) w.emit({ type: "notice", team: r.team, text: "YOUR GRUDGE IS BEING STOLEN!" });
      r.stealer = thief?.id ?? 0;
      r.channel = 0;
      return;
    }
    r.channel += w.dt;
    if (r.channel < cfg.stealSeconds) return;
    const sp = s.transform;
    r.team = -1;
    r.shrineId = 0;
    r.stealer = 0;
    r.channel = 0;
    w.emit({ type: "relic", state: "stolen", team: thief.team, player: thief.hero!.player, x: sp.pos.x, y: sp.y, z: sp.pos.z });
    w.emit({ type: "notice", team: -1, text: `P${thief.hero!.player + 1} BROKE THE SHRINE · THE GRUDGE RETURNS` });
    this.reset();
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
        const shot = { x: p.x, z: p.z, y: w.groundY(p.x, p.z), at, warnAt: w.time, radius: cfg.radius, team: -1 };
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
        if (!o.alive || o.team === s.team) continue;
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

  inShop(e: Entity): boolean {
    const core = this.w.core(e.team);
    return !!core && this.w.dist(e, core) <= core.radius + this.w.data.match.arena.shop.radius;
  }

  buy(hero: Entity, item: ShopItem, aimAt?: Vec2): boolean {
    const w = this.w;
    const team = hero.team;
    const ts = w.teams[team];
    const sh = w.data.match.arena.shop;
    const h = hero.hero!;
    if (!this.inShop(hero)) {
      w.emit({ type: "notice", team, text: "SHOP IS AT YOUR KEEP" });
      return false;
    }
    const pay = (cost: number) => {
      const c = Math.round(cost * w.costMul());
      if (ts.resource < c) {
        w.emit({ type: "notice", team, text: `NEED ${c}` });
        return false;
      }
      ts.resource -= c;
      return true;
    };
    if (item === "bomb") {
      if (h.bomb) {
        w.emit({ type: "notice", team, text: "ALREADY CARRYING A BOMB" });
        return false;
      }
      if (!pay(sh.bomb.cost)) return false;
      h.bomb = true;
      w.emit({ type: "notice", team, text: "BOMB! TOUCH AN ENEMY TOWER" });
      return true;
    }
    if (item === "ward") {
      const core = w.core(team)!;
      const st = core.structure!;
      if (w.isSudden()) {
        w.emit({ type: "notice", team, text: "NO SHIELDS IN SUDDEN DEATH" });
        return false;
      }
      if (w.time < ts.wardReadyAt) {
        w.emit({ type: "notice", team, text: `SHIELD READY IN ${Math.ceil(ts.wardReadyAt - w.time)}` });
        return false;
      }
      if ((st.ward ?? 0) >= w.data.structures.core.ward) {
        w.emit({ type: "notice", team, text: "SHIELD IS FULL" });
        return false;
      }
      if (!pay(sh.ward.cost)) return false;
      st.ward = w.data.structures.core.ward;
      st.shielded = true;
      ts.wardReadyAt = w.time + sh.ward.cooldown;
      w.emit({ type: "pulse", x: core.transform.pos.x, y: core.transform.y, z: core.transform.pos.z, radius: 4, team });
      w.emit({ type: "notice", team, text: "SHIELD RESTORED" });
      return true;
    }
    const cost = Math.round(sh.cannon.cost * w.costMul());
    if (ts.resource < cost) {
      w.emit({ type: "notice", team, text: `NEED ${cost}` });
      return false;
    }
    if (aimAt) return this.fireStrike(hero, aimAt.x, aimAt.z);
    const f = hero.transform.facing;
    h.aim = { x: hero.transform.pos.x + Math.sin(f) * 8, z: hero.transform.pos.z + Math.cos(f) * 8, until: w.time + sh.cannon.aimSeconds };
    return true;
  }

  fireStrike(hero: Entity, x: number, z: number): boolean {
    const w = this.w;
    const sh = w.data.match.arena.shop.cannon;
    const ts = w.teams[hero.team];
    const cost = Math.round(sh.cost * w.costMul());
    if (ts.resource < cost) {
      w.emit({ type: "notice", team: hero.team, text: `NEED ${cost}` });
      return false;
    }
    ts.resource -= cost;
    const warn = w.data.match.arena.cannon.warnSeconds;
    for (let i = 0; i < sh.shots; i++) {
      const a = (i / sh.shots) * Math.PI * 2 + w.rng();
      const r = i === 0 ? 0 : sh.spread * (0.5 + w.rng() * 0.5);
      const p = this.snap(Math.max(1, Math.min(w.terrain.width - 1, x + Math.cos(a) * r)), Math.max(1, Math.min(w.terrain.depth - 1, z + Math.sin(a) * r)));
      const at = w.time + warn + i * 0.3;
      const shot = { x: p.x, z: p.z, y: w.groundY(p.x, p.z), at, warnAt: w.time, radius: sh.radius, team: hero.team };
      this.shots.push(shot);
      w.emit({ type: "cannonWarn", x: shot.x, y: shot.y, z: shot.z, radius: shot.radius, seconds: at - w.time });
    }
    w.emit({ type: "notice", team: -1, text: `P${hero.hero!.player + 1} CALLS CANNON FIRE!` });
    return true;
  }

  throwBomb(e: Entity, tx: number, tz: number): void {
    const w = this.w;
    const sh = w.data.match.arena.shop.bomb;
    if (!e.hero?.bomb) return;
    e.hero.bomb = false;
    const p = e.transform.pos;
    const x = Math.max(1, Math.min(w.terrain.width - 1, tx));
    const z = Math.max(1, Math.min(w.terrain.depth - 1, tz));
    this.thrown.push({ fromX: p.x, fromZ: p.z, fromY: e.transform.y + 2.2, toX: x, toZ: z, toY: w.groundY(x, z), start: w.time, dur: sh.throwSeconds, ownerId: e.id, team: e.team });
    w.emit({ type: "shot", style: "throw", x: p.x, y: e.transform.y + 2, z: p.z });
  }

  private landBomb(b: ThrownBomb): void {
    const w = this.w;
    const sh = w.data.match.arena.shop.bomb;
    let target: Entity | undefined;
    let best = Infinity;
    for (const o of w.entities) {
      if (!o.alive || !o.structure || o.team === b.team || o.neutral || o.structure.siege) continue;
      const d = Math.hypot(o.transform.pos.x - b.toX, o.transform.pos.z - b.toZ) - o.radius;
      if (d <= sh.stickReach && d < best) { best = d; target = o; }
    }
    let x = b.toX;
    let z = b.toZ;
    if (target) {
      const dx = b.toX - target.transform.pos.x;
      const dz = b.toZ - target.transform.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      x = target.transform.pos.x + (dx / dl) * (target.radius + 0.2);
      z = target.transform.pos.z + (dz / dl) * (target.radius + 0.2);
    } else if (!Number.isFinite(w.terrain.heightAt(x, z))) {
      const p = this.snap(x, z);
      x = p.x;
      z = p.z;
    }
    const fuse = target ? sh.fuse : sh.groundFuse;
    this.bombs.push({ x, z, y: w.groundY(x, z), targetId: target?.id ?? 0, ownerId: b.ownerId, team: b.team, at: w.time + fuse });
    w.emit({ type: "bomb", state: "planted", x, y: w.groundY(x, z), z, team: b.team, fuse });
    if (target) w.emit({ type: "notice", team: target.team, text: "BOMB ON YOUR TOWER!" });
  }

  private updateBombs(): void {
    const w = this.w;
    const sh = w.data.match.arena.shop.bomb;
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const b = this.thrown[i];
      if (w.time - b.start < b.dur) continue;
      this.thrown.splice(i, 1);
      this.landBomb(b);
    }
    for (const p of w.players) {
      const e = w.get(p.heroId);
      if (!e?.hero?.bomb || !e.alive) continue;
      for (const o of w.entities) {
        if (!o.alive || !o.structure || o.team === e.team || o.neutral || o.structure.siege) continue;
        if (w.dist(e, o) - o.radius - e.radius > sh.plantReach) continue;
        const dx = e.transform.pos.x - o.transform.pos.x;
        const dz = e.transform.pos.z - o.transform.pos.z;
        const dl = Math.hypot(dx, dz) || 1;
        const bx = o.transform.pos.x + (dx / dl) * (o.radius + 0.2);
        const bz = o.transform.pos.z + (dz / dl) * (o.radius + 0.2);
        this.bombs.push({ x: bx, z: bz, y: w.groundY(bx, bz), targetId: o.id, ownerId: e.id, team: e.team, at: w.time + sh.fuse });
        e.hero.bomb = false;
        w.emit({ type: "bomb", state: "planted", x: bx, y: w.groundY(bx, bz), z: bz, team: e.team, fuse: sh.fuse });
        w.emit({ type: "notice", team: 1 - e.team, text: "BOMB ON YOUR TOWER!" });
        break;
      }
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      if (w.time < b.at) continue;
      this.bombs.splice(i, 1);
      const owner = w.get(b.ownerId) ?? null;
      w.emit({ type: "bomb", state: "boom", x: b.x, y: b.y, z: b.z, team: b.team, fuse: 0 });
      w.emit({ type: "cannonHit", x: b.x, y: b.y, z: b.z, radius: sh.splash + 0.2 });
      const t = b.targetId ? w.get(b.targetId) : undefined;
      if (t?.alive && t.structure) {
        if (t.structure.type === "core") w.damage(owner, t, sh.coreDamage, { big: true, structureDamage: sh.coreDamage });
        else w.damage(owner, t, t.hp + t.maxHp, { big: true, structureDamage: t.hp + t.maxHp });
      }
      for (const o of w.entities.slice()) {
        if (!o.alive || o.team === b.team || o === t) continue;
        const d = Math.hypot(o.transform.pos.x - b.x, o.transform.pos.z - b.z) - o.radius;
        if (d > sh.splash) continue;
        if (o.structure) {
          if (!b.targetId) w.damage(owner, o, sh.structureSplash, { big: true, structureDamage: sh.structureSplash });
          continue;
        }
        w.damage(owner, o, sh.splashDamage * (o.unit ? sh.splashUnitMul ?? 1 : 1), { knockback: 9, fromX: b.x, fromZ: b.z, big: true, stun: 0.3 });
      }
    }
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
