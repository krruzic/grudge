import { FLAG_GRASS, Kind, Terrain, type MapData } from "./terrain.ts";
import { NavGrid } from "./nav.ts";
import type { GameData, HeroDef } from "./config.ts";
import type {
  Boomerang, Command, Delayed, Missile, Directive, Entity, MatchState, Pad, PadZone, Projectile, SimEvent, Status, TargetClass, TeamState, TerrainMod, Trap, UnitType, Vec2, Zone,
} from "./types.ts";
import { UNIT_TYPES } from "./types.ts";
import { updateBoomerangs, updateHero } from "./heroes.ts";
import { updateUnit } from "./units.ts";
import { spawnUnit, tryBuild, updateStructure } from "./structures.ts";
import { Arena } from "./arena.ts";
import { abilities, addShield, mark as markOne, afterShot, allFx, gainXp, learn, onKill, tickStatus, updateMissiles, xpForDamage } from "./talents.ts";

export type { Vec2, Entity, Command } from "./types.ts";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DamageOpts {
  knockback?: number;
  fromX?: number;
  fromZ?: number;
  stun?: number;
  slowMul?: number;
  slowSeconds?: number;
  canMiss?: boolean;
  big?: boolean;
  structureDamage?: number;
  vsSlowedMul?: number;
  vsStunnedMul?: number;
  executeBelow?: number;
  executeMul?: number;
  tick?: boolean;
}

export interface PlayerSlot {
  player: number;
  team: number;
  heroType: string;
  heroId: number;
  commander: boolean;
}

function newStatus(): Status {
  return {
    slowUntil: 0, slowMul: 1, stunUntil: 0, kvx: 0, kvz: 0, buffUntil: 0, buffDamageMul: 1, buffSpeedMul: 1, rallyUntil: 0, lastHitAt: -99, lastHitX: 0, lastHitZ: 0,
    invulnUntil: 0, lastAttackAt: -99, hidden: false, supportDamageMul: 1, auraDamageMul: 1, stealthUntil: 0, ambushMul: 1, guardUntil: 0, guardMul: 1, cowedUntil: 0, hexUntil: 0, hexOwner: 0,
    bleedStacks: 0, bleedDps: 0, bleedUntil: 0, bleedOwner: 0, shield: 0, shieldUntil: 0, shieldBurst: 0, armorMul: 1, armorUntil: 0, ccImmuneUntil: 0,
    markUntil: 0, markTeam: -1, markOwner: 0, markMul: 1, markAll: false, markWeaken: 1,
  };
}

export class World {
  readonly terrain: Terrain;
  readonly nav: NavGrid;
  readonly entities: Entity[] = [];
  readonly projectiles: Projectile[] = [];
  readonly boomerangs: Boomerang[] = [];
  readonly missiles: Missile[] = [];
  private timers: { at: number; seq: number; fn: () => void }[] = [];
  private timerSeq = 0;

  later(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.time + seconds, seq: this.timerSeq++, fn });
  }

  private runTimers(): void {
    if (!this.timers.length) return;
    const due = this.timers.filter((t) => t.at <= this.time).sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.fn();
  }
  readonly pads: Pad[] = [];
  readonly teams: TeamState[] = [];
  readonly players: PlayerSlot[] = [];
  readonly events: SimEvent[] = [];
  readonly traps: Trap[] = [];
  readonly zones: Zone[] = [];
  readonly delayed: Delayed[] = [];
  readonly mods: TerrainMod[] = [];
  readonly dt: number;
  readonly match: MatchState = { time: 0, phase: "play", winner: -1, reason: "" };
  readonly rng: () => number;
  tick = 0;
  time = 0;
  private nextId = 1;
  private byId = new Map<number, Entity>();
  private slotCounter = [0, 0];

  constructor(map: MapData, readonly data: GameData, seed = 1) {
    this.terrain = new Terrain(map);
    this.dt = 1 / data.match.tickRate;
    this.rng = mulberry32(seed);
    this.nav = new NavGrid(this.terrain, data.heroes.baseline.stepHeight, data.heroes.baseline.maxSlope);
    this.terrain.pads.forEach((p, i) => {
      const zone = (p.zone ?? "home") as PadZone;
      const side = zone === "neutral" ? -1 : p.side ?? (p.x < this.terrain.width / 2 ? 0 : 1);
      this.pads.push({ index: i, x: p.x, z: p.z, zone, side, structureId: 0, rubbleUntil: 0 });
    });
    for (let team = 0; team < 2; team++) {
      const hold = this.defaultHold(team);
      this.teams.push({
        resource: data.match.economy.start,
        coreId: 0,
        homeLost: false,
        directives: {
          grunt: "push", ranged: "push", heavy: "push",
          holdPoint: { grunt: { ...hold }, ranged: { ...hold }, heavy: { ...hold } },
          focus: { grunt: 0, ranged: 0, heavy: 0 },
        },
        coreDamageDealt: 0, kills: 0, structuresBuilt: 0, structuresLost: 0, heroKills: 0, catchUp: 0, unitCount: 0, commanderOrderAt: -99, banner: null, callReadyAt: 0, wardReadyAt: 0,
      });
    }
    for (const c of this.terrain.cores) {
      const team = c.team ?? 0;
      const e = this.addEntity(team, "structure", data.structures.core.radius, c.x, c.z, data.structures.core.hp);
      e.structure = {
        type: "core", padIndex: -1, level: 1, builtAt: 0, ready: true, nextAction: 0, range: 0, damage: 0,
        lastFireAt: -99, shielded: true, ward: data.structures.core.ward,
      };
      this.teams[team].coreId = e.id;
      this.nav.setBlocked(c.x, c.z, data.structures.core.radius + 0.4, true);
    }
    this.bases = [this.computeBase(0), this.computeBase(1)];
    this.arena = new Arena(this);
  }

  readonly bases: { mask: Uint8Array; entrances: Vec2[] }[];
  private posts = { tick: -1, of: new Map<number, [number, number]>() };

  inBase(team: number, x: number, z: number): boolean {
    const i = this.nav.index(Math.floor(x), Math.floor(z));
    return i >= 0 && this.bases[team].mask[i] === 1;
  }

  defendPost(e: Entity): { post: Vec2; rank: number } {
    if (this.posts.tick !== this.tick) {
      this.posts.tick = this.tick;
      this.posts.of.clear();
      const order: Record<string, number> = { heavy: 0, grunt: 1, ranged: 2 };
      for (let team = 0; team < 2; team++) {
        const n = this.bases[team].entrances.length;
        if (!n) continue;
        const dirs = this.teams[team].directives;
        const list = this.entities.filter((o) => o.alive && o.unit && !o.neutral && o.team === team && dirs[o.unit.type] === "defend");
        list.sort((a, b) => (order[a.unit!.type] ?? 3) - (order[b.unit!.type] ?? 3) || a.id - b.id);
        list.forEach((o, k) => this.posts.of.set(o.id, [k % n, Math.floor(k / n)]));
      }
    }
    const a = this.posts.of.get(e.id);
    const base = this.bases[e.team];
    if (!a || !base.entrances.length) return { post: this.defaultHold(e.team), rank: e.unit?.slot ?? 0 };
    return { post: base.entrances[a[0]], rank: a[1] };
  }

  private computeBase(team: number): { mask: Uint8Array; entrances: Vec2[] } {
    const nav = this.nav;
    const W = nav.w;
    const D = nav.d;
    const mask = new Uint8Array(W * D);
    const own = this.terrain.cores.find((k) => (k.team ?? 0) === team);
    const foe = this.terrain.cores.find((k) => (k.team ?? 0) !== team);
    if (!own) return { mask, entrances: [] };
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    const castle = (i: number) => i >= 0 && this.terrain.styles[i] === "castle";
    const visited = new Uint8Array(W * D);
    for (let i = 0; i < W * D; i++) {
      if (visited[i] || !castle(i)) continue;
      const seg = [i];
      visited[i] = 1;
      let near = Infinity;
      let mine = true;
      for (let q = 0; q < seg.length; q++) {
        const c = seg[q];
        const cx = (c % W) + 0.5;
        const cz = Math.floor(c / W) + 0.5;
        const d = Math.hypot(cx - own.x, cz - own.z);
        near = Math.min(near, d);
        if (foe && Math.hypot(cx - foe.x, cz - foe.z) < d) mine = false;
        for (const n of [nav.index(c % W + 1, Math.floor(c / W)), nav.index(c % W - 1, Math.floor(c / W)), nav.index(c % W, Math.floor(c / W) + 1), nav.index(c % W, Math.floor(c / W) - 1)]) {
          if (castle(n) && !visited[n]) {
            visited[n] = 1;
            seg.push(n);
          }
        }
      }
      if (!mine || near > 14) continue;
      for (const c of seg) {
        x0 = Math.min(x0, c % W);
        z0 = Math.min(z0, Math.floor(c / W));
        x1 = Math.max(x1, c % W);
        z1 = Math.max(z1, Math.floor(c / W));
      }
    }
    if (x0 === Infinity) {
      x0 = own.x - 10;
      x1 = own.x + 10;
      z0 = own.z - 10;
      z1 = own.z + 10;
    }
    x0 = Math.max(0, Math.min(x0, Math.floor(own.x) - 3));
    z0 = Math.max(0, Math.min(z0, Math.floor(own.z) - 3));
    x1 = Math.min(W - 1, Math.max(x1, Math.floor(own.x) + 3));
    z1 = Math.min(D - 1, Math.max(z1, Math.floor(own.z) + 3));
    const inBox = (cx: number, cz: number) => cx >= x0 && cx <= x1 && cz >= z0 && cz <= z1;
    const seeds: number[] = [];
    const r = Math.ceil(this.data.structures.core.radius + 1.5);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const i = nav.index(Math.floor(own.x) + dx, Math.floor(own.z) + dz);
        if (nav.open(i) && !mask[i]) {
          mask[i] = 1;
          seeds.push(i);
        }
      }
    }
    for (let q = 0; q < seeds.length; q++) {
      const c = seeds[q];
      const cx = c % W;
      const cz = Math.floor(c / W);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = nav.index(cx + dx, cz + dz);
          if (n < 0 || mask[n] || !inBox(cx + dx, cz + dz) || !nav.passable(c, n)) continue;
          mask[n] = 1;
          seeds.push(n);
        }
      }
    }
    const edge: number[] = [];
    for (const c of seeds) {
      const cx = c % W;
      const cz = Math.floor(c / W);
      let out = false;
      for (let dz = -1; dz <= 1 && !out; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = nav.index(cx + dx, cz + dz);
          if (n >= 0 && !mask[n] && !inBox(cx + dx, cz + dz) && nav.passable(c, n)) { out = true; break; }
        }
      }
      if (out) edge.push(c);
    }
    const seen = new Uint8Array(W * D);
    const entrances: Vec2[] = [];
    const isEdge = new Uint8Array(W * D);
    for (const c of edge) isEdge[c] = 1;
    for (const c of edge) {
      if (seen[c]) continue;
      const group = [c];
      seen[c] = 1;
      for (let q = 0; q < group.length; q++) {
        const g = group[q];
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const n = nav.index((g % W) + dx, Math.floor(g / W) + dz);
            if (n >= 0 && isEdge[n] && !seen[n]) {
              seen[n] = 1;
              group.push(n);
            }
          }
        }
      }
      let mx = 0;
      let mz = 0;
      for (const g of group) {
        mx += (g % W) + 0.5;
        mz += Math.floor(g / W) + 0.5;
      }
      mx /= group.length;
      mz /= group.length;
      const dx = own.x - mx;
      const dz = own.z - mz;
      const dl = Math.hypot(dx, dz) || 1;
      let px = mx + (dx / dl) * 2;
      let pz = mz + (dz / dl) * 2;
      const pi = nav.index(Math.floor(px), Math.floor(pz));
      if (!(pi >= 0 && mask[pi])) {
        let best = group[0];
        let bd = Infinity;
        for (const g of group) {
          const d = Math.hypot((g % W) + 0.5 - mx, Math.floor(g / W) + 0.5 - mz);
          if (d < bd) { bd = d; best = g; }
        }
        px = (best % W) + 0.5;
        pz = Math.floor(best / W) + 0.5;
      }
      entrances.push({ x: px, z: pz });
    }
    return { mask, entrances };
  }

  readonly arena: Arena;

  private defaultHold(team: number): Vec2 {
    const c = this.terrain.cores.find((k) => k.team === team) ?? { x: 10, z: 24 };
    const dx = this.terrain.width / 2 - c.x;
    const dz = this.terrain.depth / 2 - c.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(12, d * 0.6);
    return { x: c.x + (dx / d) * step, z: c.z + (dz / d) * step };
  }

  get heroData() {
    return this.data.heroes;
  }

  heroDef(type: string): HeroDef {
    return this.data.heroes.heroes[type] ?? Object.values(this.data.heroes.heroes)[0];
  }

  get(id: number): Entity | undefined {
    const e = this.byId.get(id);
    return e && e.alive ? e : undefined;
  }

  getAny(id: number): Entity | undefined {
    return this.byId.get(id);
  }

  newId(): number {
    return this.nextId++;
  }

  hooks(e: Entity | undefined): Record<string, number> {
    const h = e?.hero ? e : e?.owner ? this.byId.get(e.owner) : undefined;
    return h?.hero ? this.heroDef(h.hero.type).hooks : {};
  }

  teamHooks(team: number): Record<string, number> {
    const h = this.heroOf(team);
    return h?.hero ? this.heroDef(h.hero.type).hooks : {};
  }

  addEntity(team: number, kind: Entity["kind"], radius: number, x: number, z: number, hp: number): Entity {
    const y = this.groundY(x, z);
    const facing = team === 0 ? Math.PI / 2 : -Math.PI / 2;
    const e: Entity = {
      id: this.nextId++,
      team,
      kind,
      radius,
      transform: { pos: { x, z }, prevPos: { x, z }, y, prevY: y, facing, prevFacing: facing },
      hp,
      maxHp: hp,
      alive: true,
      status: newStatus(),
    };
    this.entities.push(e);
    this.byId.set(e.id, e);
    return e;
  }

  groundY(x: number, z: number): number {
    const h = this.terrain.heightAt(x, z);
    return Number.isFinite(h) ? h : this.terrain.groundHeight(x, z);
  }

  spawnHero(type: string, player: number, team: number): Entity {
    const def = this.heroDef(type);
    const tiers = this.data.heroes.tiers;
    const b = this.data.heroes.baseline;
    const spawn = this.spawnPoint(team);
    const e = this.addEntity(team, "hero", b.radius, spawn.x, spawn.z, tiers.health[def.health]);
    e.hero = {
      type, player,
      speed: tiers.speed[def.speed] * (def.hooks.speedMul ?? 1),
      damageMul: tiers.damage[def.damage],
      vel: { x: 0, z: 0 },
      action: null, comboIndex: 0, comboUntil: 0, cooldowns: {}, meter: 0, blocking: false, openingUntil: 0, combatAt: -99, actionEndAt: -99, bomb: false, stuckFor: 0, aim: null,
      xp: 0, level: 1, picks: [], path: { a: [], b: [], r: [], z: [] }, ab: null, frenzy: 0, frenzyUntil: 0, recastUntil: 0, empowerMul: 1, empowerUntil: 0,
      dead: false, respawnAt: 0, lastTargetId: 0, lastTargetAt: -99, anim: "idle", animStart: 0,
      stepHeight: def.hooks.stepHeight ?? b.stepHeight,
      maxSlope: def.hooks.maxSlope ?? b.maxSlope,
    };
    this.players.push({ player, team, heroType: type, heroId: e.id, commander: def.role === "commander" });
    return e;
  }

  spawnPoint(team: number): Vec2 {
    const s = this.terrain.spawns.find((k) => k.team === team) ?? this.terrain.spawns[0];
    return { x: s.x, z: s.z };
  }

  private onKillSynergy(target: Entity, src: Entity | null): void {
    const t = this.time;
    if (src?.hero && this.heroDef(src.hero.type).hooks.killResetsB) {
      if (target.hero || target.structure) src.hero.cooldowns.b = t;
    }
    if (target.kind !== "structure" && t < target.status.hexUntil) {
      const owner = this.get(target.status.hexOwner);
      if (!owner?.hero || owner.team === target.team) return;
      const raised = this.entities.filter((o) => o.alive && o.unit && o.owner === owner.id && o.unit.raised).length;
      if (raised >= (this.heroDef(owner.hero.type).hooks.raiseMax ?? 5)) return;
      const u = spawnUnit(this, owner.team, "grunt", target.transform.pos.x, target.transform.pos.z, 1);
      if (u) {
        u.expiresAt = t + (this.heroDef(owner.hero.type).hooks.raiseSeconds ?? 15);
        u.owner = owner.id;
        u.unit!.raised = true;
        this.emit({ type: "warcry", x: target.transform.pos.x, y: target.transform.y, z: target.transform.pos.z, radius: 1.5, team: owner.team });
      }
    }
  }

  private synergyMul(src: Entity | null, target: Entity, opts: DamageOpts): number {
    const t = this.time;
    const ts = target.status;
    let m = 1;
    if (src && t < src.status.cowedUntil) m *= this.data.heroes.baseline.cowedDamageMul ?? 0.75;
    if (target.kind !== "structure") {
      const stunned = t < ts.stunUntil;
      const slowed = t < ts.slowUntil && ts.slowMul < 1;
      if (opts.vsStunnedMul && stunned) m *= opts.vsStunnedMul;
      if (opts.vsSlowedMul && (stunned || slowed)) m *= opts.vsSlowedMul;
      if (opts.executeMul && target.hp < target.maxHp * (opts.executeBelow ?? 0.4)) m *= opts.executeMul;
      if (src?.owner && t < ts.hexUntil && ts.hexOwner === src.owner) {
        const o = this.get(src.owner);
        if (o?.hero) m *= this.heroDef(o.hero.type).hooks.hexMinionMul ?? 1;
      }
      if (src?.hero && t < src.hero.openingUntil) {
        const r = this.heroDef(src.hero.type).abilities.r;
        m *= r.openingMul ?? 1.5;
        src.hero.openingUntil = 0;
        this.emit({ type: "parry", x: target.transform.pos.x, y: target.transform.y + 1, z: target.transform.pos.z, team: src.team, src: src.id });
      }
    }
    return m;
  }

  rallyPoint(team: number): { x: number; z: number } | null {
    const b = this.teams[team].banner;
    return b && this.time < b.until ? { x: b.x, z: b.z } : null;
  }

  heroOf(team: number): Entity | undefined {
    const p = this.players.find((k) => k.team === team && !k.commander) ?? this.players.find((k) => k.team === team);
    return p ? this.byId.get(p.heroId) : undefined;
  }

  heroForPlayer(player: number): Entity | undefined {
    const p = this.players.find((k) => k.player === player);
    return p ? this.byId.get(p.heroId) : undefined;
  }

  core(team: number): Entity | undefined {
    return this.byId.get(this.teams[team].coreId);
  }

  teleport(e: Entity, x: number, z: number): void {
    const t = e.transform;
    t.pos.x = t.prevPos.x = x;
    t.pos.z = t.prevPos.z = z;
    t.y = t.prevY = this.groundY(x, z);
  }

  classOf(e: Entity): TargetClass {
    if (e.kind === "hero") return "hero";
    if (e.kind === "unit") return e.unit!.type;
    return "structure";
  }

  isSudden(): boolean {
    return this.match.phase === "sudden";
  }

  costMul(): number {
    return this.isSudden() ? this.data.match.suddenDeath.costMul : 1;
  }

  emit(ev: SimEvent): void {
    this.events.push(ev);
  }

  step(commands: Command[]): void {
    if (this.match.phase === "over") {
      this.tick++;
      return;
    }
    const dt = this.dt;
    for (const e of this.entities) {
      const t = e.transform;
      t.prevPos.x = t.pos.x;
      t.prevPos.z = t.pos.z;
      t.prevY = t.y;
      t.prevFacing = t.facing;
    }
    for (const p of this.projectiles) p.prevT = p.t;

    this.updateMatch();
    this.updateEconomy(dt);
    this.updateStatusMods();

    for (const slot of this.players) {
      const e = this.byId.get(slot.heroId);
      if (!e) continue;
      const cmd = commands[slot.player] ?? { moveX: 0, moveZ: 0 };
      if (e.alive && cmd.build) tryBuild(this, e, cmd.build);
      if (e.alive && cmd.buy) this.arena.buy(e, cmd.buy, cmd.aimAt);
      if (cmd.learn !== undefined && e.hero?.picks.length) learn(this, e, cmd.learn);
      if (cmd.say) this.emit({ type: "notice", team: slot.team, text: cmd.say.slice(0, 48) });
      if (e.alive) gainXp(this, e, this.data.talents?.xp.passive * dt);
      if (cmd.directive) {
        const ts = this.teams[slot.team];
        if (slot.commander) {
          ts.commanderOrderAt = this.time;
          this.setDirective(slot.team, cmd.directive.type, cmd.directive.dir, e);
        } else if (this.time - ts.commanderOrderAt > this.data.heroes.baseline.commanderPriority) {
          this.setDirective(slot.team, cmd.directive.type, cmd.directive.dir, e);
        } else this.emit({ type: "notice", team: slot.team, text: "COMMANDER HAS ORDERS" });
      }
      updateHero(this, e, cmd);
    }
    this.arena.update();
    const list = this.entities.slice();
    for (const e of list) {
      if (!e.alive) continue;
      if (e.unit) updateUnit(this, e);
      else if (e.structure) updateStructure(this, e);
    }
    this.updateProjectiles(dt);
    updateBoomerangs(this);
    updateMissiles(this);
    tickStatus(this);
    this.runTimers();
    this.updateHazards();
    this.updateTide();
    this.applyKnockback(dt);
    this.separate();
    this.cleanup();
    this.tick++;
    this.time += dt;
    this.match.time = this.time;
  }

  setDirective(team: number, type: UnitType | "all", dir: Directive, hero: Entity): void {
    const d = this.teams[team].directives;
    const types = type === "all" ? UNIT_TYPES : [type];
    let focusId = 0;
    if (dir === "focus") {
      let best = Infinity;
      for (const o of this.entities) {
        if (!o.alive || o.team === team || !o.structure) continue;
        const dd = this.dist(hero, o);
        if (dd < best) { best = dd; focusId = o.id; }
      }
      if (!focusId) return;
    }
    for (const t of types) {
      d[t] = dir;
      if (dir === "hold") d.holdPoint[t] = this.rallyPoint(team) ?? { x: hero.transform.pos.x, z: hero.transform.pos.z };
      if (dir === "defend") d.holdPoint[t] = this.defaultHold(team);
      if (dir === "focus") d.focus[t] = focusId;
    }
    for (const u of this.entities) {
      if (u.unit && u.team === team && types.includes(u.unit.type)) {
        u.unit.repathAt = 0;
        u.unit.retargetAt = 0;
        u.unit.targetId = 0;
      }
    }
    this.emit({ type: "directive", team, unitType: type, dir });
  }

  private updateMatch(): void {
    const m = this.data.match;
    if (this.match.phase === "play" && this.time >= m.matchSeconds) {
      this.match.phase = "sudden";
      this.emit({ type: "notice", team: -1, text: "SUDDEN DEATH" });
    }
    if (this.match.phase === "sudden" && this.time >= m.matchSeconds + m.suddenDeathSeconds) {
      const [t0, t1] = this.teams;
      const a = Math.round(t0.coreDamageDealt);
      const b = Math.round(t1.coreDamageDealt);
      if (a !== b) this.endMatch(a > b ? 0 : 1, "core damage");
      else if (t1.structuresLost !== t0.structuresLost) this.endMatch(t1.structuresLost > t0.structuresLost ? 0 : 1, "structures destroyed");
      else if (t0.heroKills !== t1.heroKills) this.endMatch(t0.heroKills > t1.heroKills ? 0 : 1, "hero kills");
      else this.endMatch(-1, "dead even");
    }
    for (let team = 0; team < 2; team++) {
      const core = this.core(team);
      if (!core?.structure) continue;
      core.structure.shielded = (core.structure.ward ?? 0) > 0;
    }
  }

  endMatch(winner: number, reason: string): void {
    if (this.match.phase === "over") return;
    this.match.phase = "over";
    this.match.winner = winner;
    this.match.reason = reason;
  }

  private updateEconomy(dt: number): void {
    const eco = this.data.match.economy;
    const cu = this.data.match.catchUp;
    if (this.tick % 15 === 0) {
      const worth = [0, 0];
      const count = [0, 0];
      for (const e of this.entities) {
        if (!e.alive || !e.structure || e.structure.type === "core") continue;
        const def = this.data.structures.types[e.structure.type];
        worth[e.team] += def.cost + (e.structure.level > 1 ? def.upgradeCost : 0);
        count[e.team]++;
      }
      for (let t = 0; t < 2; t++) {
        const o = 1 - t;
        const deficit = (this.teams[o].resource + worth[o] - this.teams[t].resource - worth[t]) / cu.resourceScale +
          (count[o] - count[t]) * cu.structureWeight;
        this.teams[t].catchUp = Math.max(0, Math.min(1, deficit));
      }
      const units = [0, 0];
      for (const e of this.entities) if (e.alive && e.unit) units[e.team]++;
      this.teams[0].unitCount = units[0];
      this.teams[1].unitCount = units[1];
    }
    this.teams.forEach((t, team) => {
      const tithe = this.arena.heldBy(team) ? this.data.match.arena.relic.incomeMul : 1;
      t.resource += eco.income * (1 + t.catchUp * cu.incomeBoost) * tithe * dt;
    });
  }

  private updateStatusMods(): void {
    const heroes = this.entities.filter((e) => e.hero && e.alive);
    const supports = this.entities.filter((e) => e.alive && e.structure?.type === "support" && e.structure.ready);
    const revealT = this.data.units.hiddenRevealSeconds;
    for (const e of this.entities) {
      if (!e.alive) continue;
      const s = e.status;
      s.auraDamageMul = 1;
      s.supportDamageMul = 1;
      if (e.unit) {
        for (const h of heroes) {
          if (h.team !== e.team) continue;
          const hooks = this.heroDef(h.hero!.type).hooks;
          if (hooks.auraRadius && this.dist(h, e) <= hooks.auraRadius) s.auraDamageMul = Math.max(s.auraDamageMul, hooks.auraDamageMul);
        }
        for (const h of heroes) {
          if (h.team !== e.team) continue;
          const hk = this.heroDef(h.hero!.type).hooks;
          const bp = this.rallyPoint(h.team);
          const nearBanner = !!bp && Math.hypot(e.transform.pos.x - bp.x, e.transform.pos.z - bp.z) <= (hk.commandAuraRadius ?? 0);
          if (hk.commandAuraRadius && (this.dist(h, e) <= hk.commandAuraRadius || nearBanner) && this.time >= s.buffUntil) {
            s.buffUntil = this.time + 0.2;
            s.buffSpeedMul = hk.commandAuraSpeed ?? 1.1;
            s.buffDamageMul = 1;
          }
        }
        for (const st of supports) {
          if (st.team === e.team && this.dist(st, e) <= st.structure!.range) s.supportDamageMul = this.data.structures.types.support.damageMul ?? 1;
        }
      }
      if (e.kind !== "structure") {
        const inGrass = this.terrain.hasFlag(Math.floor(e.transform.pos.x), Math.floor(e.transform.pos.z), FLAG_GRASS);
        s.hidden = (inGrass && this.time - s.lastAttackAt > revealT) || this.time < s.stealthUntil;
      }
    }
  }

  dist(a: Entity, b: Entity): number {
    return Math.hypot(a.transform.pos.x - b.transform.pos.x, a.transform.pos.z - b.transform.pos.z);
  }

  edgeDist(a: Entity, b: Entity): number {
    return this.dist(a, b) - b.radius;
  }

  canSee(viewer: Entity, target: Entity): boolean {
    if (!target.status.hidden) return true;
    return this.dist(viewer, target) <= this.data.units.hiddenAdjacent + target.radius;
  }

  rangeMul(attacker: Entity, target: Entity): number {
    const tr = this.data.match.terrain;
    return attacker.transform.y - target.transform.y >= tr.highGroundDelta ? tr.highGroundRangeMul : 1;
  }

  losHeight(x: number, z: number): number {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const k = this.terrain.kindAt(cx, cz);
    const g = this.terrain.groundHeight(x, z);
    if (k === Kind.Wall) return g + this.data.match.terrain.wallHeight;
    if (k === Kind.Prop) return g + 1.2;
    if (k === Kind.Bridge) return Math.min(g, this.terrain.deck[this.terrain.index(cx, cz)]);
    return g;
  }

  los(a: Entity, b: Entity, tolerance: number, aHeight?: number): boolean {
    const eye = this.data.match.terrain.eyeHeight;
    const ax = a.transform.pos.x;
    const az = a.transform.pos.z;
    const ay = a.transform.y + (aHeight ?? eye);
    const bx = b.transform.pos.x;
    const bz = b.transform.pos.z;
    const by = b.transform.y + eye;
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / 0.5);
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      const x = ax + (bx - ax) * f;
      const z = az + (bz - az) * f;
      if (Math.hypot(x - ax, z - az) < a.radius + 0.2 || Math.hypot(x - bx, z - bz) < b.radius + 0.2) continue;
      const line = ay + (by - ay) * f;
      if (this.losHeight(x, z) > line + tolerance) return false;
    }
    return true;
  }

  damageMulOf(src: Entity): number {
    const s = src.status;
    let m = (this.time < s.buffUntil ? s.buffDamageMul : 1) * s.auraDamageMul * s.supportDamageMul;
    if (this.time < s.rallyUntil) m *= this.data.match.economy.rally.damageMul;
    if (src.hero) m *= src.hero.damageMul * (src.hero.action?.power ?? 1);
    if (src.unit && this.isSudden()) m *= this.data.match.suddenDeath.unitDamageMul;
    return m;
  }

  damage(src: Entity | null, target: Entity, amount: number, opts: DamageOpts = {}): boolean {
    if (!target.alive) return false;
    const tp = target.transform;
    const ev = { x: tp.pos.x, y: tp.y + 1, z: tp.pos.z };
    if (this.time < target.status.invulnUntil) {
      this.emit({ type: "miss", ...ev });
      return false;
    }
    if (target.hero?.action?.kind === "parry" && target.hero.action.t <= (this.heroDef(target.hero.type).abilities.r.window ?? 0.5)) {
      const r = this.heroDef(target.hero.type).abilities.r;
      const pfx = allFx(this, target);
      this.emit({ type: "parry", ...ev, team: target.team, src: target.id });
      target.hero.action.t = target.hero.action.dur;
      if (src && src.kind !== "structure" && this.dist(src, target) < 5) {
        const pc = pfx.parryCounter;
        this.damage(target, src, (r.counter ?? 80) * (pc?.mul ?? 1) * this.damageMulOf(target), { stun: (r.stunSeconds ?? 0) + (pc?.stun ?? 0), knockback: 4, big: true });
      }
      if (pfx.parryShield) addShield(target, pfx.parryShield, pfx.parryShield, 5, this.time);
      const pm = abilities(this, target).b.fx?.mark;
      if (pfx.parryMark && pm && src && !src.structure) markOne(this, target, src, pm);
      if (r.openingSeconds) {
        target.hero.cooldowns.b = this.time;
        target.hero.openingUntil = this.time + r.openingSeconds;
      }
      return false;
    }
    if (src) src.status.lastAttackAt = this.time;
    if (src?.hero && !target.structure && target.team !== src.team) {
      src.status.lastHitAt = this.time;
      src.status.lastHitX = tp.pos.x;
      src.status.lastHitZ = tp.pos.z;
    }
    if (target.hero) target.hero.combatAt = this.time;
    if (src?.hero && target.hero) src.hero.combatAt = this.time;
    if (opts.canMiss && src) {
      const tr = this.data.match.terrain;
      if (tp.y - src.transform.y >= tr.highGroundDelta && this.rng() < tr.uphillMissChance) {
        this.emit({ type: "miss", ...ev });
        return false;
      }
    }
    if (target.structure) {
      if (opts.structureDamage !== undefined) amount = opts.structureDamage;
      const tt = this.teams[target.team];
      if (tt) amount *= 1 - tt.catchUp * this.data.match.catchUp.fortify;
    }
    if (src && src.kind !== "structure") {
      const hk = this.hooks(src);
      if (hk.flankMul) {
        if (target.structure) {
          const defended = this.entities.some((o) => o.alive && o.unit && o.team === target.team && this.dist(o, target) < 7);
          if (!defended) amount *= hk.flankMul;
        } else {
          const dx = src.transform.pos.x - tp.pos.x;
          const dz = src.transform.pos.z - tp.pos.z;
          const dot = (Math.sin(tp.facing) * dx + Math.cos(tp.facing) * dz) / (Math.hypot(dx, dz) || 1);
          if (dot < -0.2) amount *= hk.flankMul;
        }
      }
      if (hk.heroDamageMul && target.hero && src.hero) amount *= hk.heroDamageMul;
      if (hk.structureMul && target.structure && opts.structureDamage === undefined) amount *= hk.structureMul;
      if (!target.structure) {
        const pos = this.data.match.positional;
        const dx = src.transform.pos.x - tp.pos.x;
        const dz = src.transform.pos.z - tp.pos.z;
        const dot = (Math.sin(tp.facing) * dx + Math.cos(tp.facing) * dz) / (Math.hypot(dx, dz) || 1);
        if (dot < -0.3 && !hk.flankMul) amount *= pos.backstabMul;
        if (src.status.hidden) amount *= pos.ambushMul;
      }
    }
    amount *= this.synergyMul(src, target, opts);
    let crit = false;
    if (src?.hero && !opts.tick) {
      const rl = this.data.match.rolls;
      const act = src.hero.action;
      const ab = act && (act.name === "a" || act.name === "b" || act.name === "r" || act.name === "z") ? abilities(this, src)[act.name] : undefined;
      const hit = ab?.hits?.[act!.combo] as { variance?: number; crit?: number } | undefined;
      const v = hit?.variance ?? ab?.variance ?? rl.variance;
      const cc = hit?.crit ?? ab?.crit ?? rl.critChance;
      amount *= 1 + (this.rng() * 2 - 1) * v;
      if (this.rng() < cc) {
        crit = true;
        amount *= rl.critMul;
      }
    }
    if (this.time < target.status.guardUntil) amount *= target.status.guardMul;
    if (src && src.kind !== "structure") {
      if (this.time < src.status.stealthUntil) {
        amount *= src.status.ambushMul;
        src.status.stealthUntil = 0;
      }
    }
    const st = target.status;
    if (src && this.time < st.markUntil && (st.markAll ? src.team === st.markTeam : src.id === st.markOwner || src.owner === st.markOwner)) amount *= st.markMul;
    if (src && this.time < src.status.markUntil && src.status.markWeaken < 1) amount *= src.status.markWeaken;
    if (this.time < st.armorUntil) amount *= st.armorMul;
    if (target.hero && st.shield > 0) {
      const aws = abilities(this, target).a.fx?.armorWhileShield;
      if (aws) amount *= aws;
    }
    const ccImmune = this.time < st.ccImmuneUntil;
    if (ccImmune) {
      opts = { ...opts, stun: undefined, knockback: 0 };
    }
    let blocked = false;
    const fx = opts.fromX ?? src?.transform.pos.x;
    const fz = opts.fromZ ?? src?.transform.pos.z;
    if (target.hero?.blocking && fx !== undefined && fz !== undefined) {
      const dx = fx - tp.pos.x;
      const dz = fz - tp.pos.z;
      const facingDot = (Math.sin(tp.facing) * dx + Math.cos(tp.facing) * dz) / (Math.hypot(dx, dz) || 1);
      if (facingDot > 0.2) {
        blocked = true;
        amount *= this.data.heroes.baseline.blockFrontalMul;
      }
    }
    amount = Math.max(1, Math.round(amount));
    const ts = target.structure;
    if (ts?.type === "core" && (ts.ward ?? 0) > 0 && !this.isSudden()) {
      const soak = Math.min(ts.ward!, amount);
      ts.ward! -= soak;
      amount -= soak;
      if (ts.ward! <= 0) {
        ts.ward = 0;
        this.emit({ type: "notice", team: target.team, text: "CORE SHIELD DOWN" });
      }
      if (amount <= 0) {
        this.emit({ type: "hit", ...ev, team: target.team, big: false, blocked: true, id: target.id, amount: soak, src: src?.id });
        return true;
      }
    }
    if (st.shield > 0 && this.time < st.shieldUntil) {
      const soak = Math.min(st.shield, amount);
      st.shield -= soak;
      amount -= soak;
      if (st.shield <= 0) {
        st.shield = 0;
        const burst = target.hero ? abilities(this, target).a.fx?.shieldBurst : undefined;
        this.emit({ type: "shieldBreak", x: tp.pos.x, y: tp.y, z: tp.pos.z, team: target.team, burst: !!burst });
        if (burst) {
          this.later(0, () => {
            for (const o of this.entities.slice()) {
              if (!o.alive || o.team === target.team || o.structure) continue;
              if (this.dist(o, target) - o.radius > 3) continue;
              this.damage(target, o, burst * this.damageMulOf(target), { fromX: tp.pos.x, fromZ: tp.pos.z, knockback: 6, big: true });
            }
          });
        }
      }
      if (amount <= 0) {
        this.emit({ type: "hit", ...ev, team: target.team, big: false, blocked: true, id: target.id, amount: soak, src: src?.id });
        return true;
      }
    }
    target.hp -= amount;
    xpForDamage(this, src, target, amount);
    if (src && src.alive && src.status.stealUntil && this.time < src.status.stealUntil) this.heal(src, amount * (src.status.stealMul ?? 0));
    const b = this.data.heroes.baseline;
    if (src?.hero) src.hero.meter = Math.min(b.superMax, src.hero.meter + amount * b.superPerDamageDealt);
    if (target.hero) target.hero.meter = Math.min(b.superMax, target.hero.meter + amount * b.superPerDamageTaken);
    if (src?.hero) {
      src.hero.lastTargetId = target.id;
      src.hero.lastTargetAt = this.time;
    }
    if (target.structure?.type === "core" && src) this.teams[src.team].coreDamageDealt += amount;
    this.emit({ type: "hit", ...ev, team: target.team, big: !!opts.big || crit || amount >= 50, blocked, id: target.id, amount, src: src?.id, fx, fz, crit });

    if (!blocked && target.kind !== "structure" && fx !== undefined && fz !== undefined) {
      const kb = (opts.knockback ?? 0) * (1 - (target.unit ? this.data.units.types[target.unit.type].knockbackResist ?? 0 : 0));
      if (kb > 0) {
        const dx = tp.pos.x - fx;
        const dz = tp.pos.z - fz;
        const d = Math.hypot(dx, dz) || 1;
        target.status.kvx += (dx / d) * kb;
        target.status.kvz += (dz / d) * kb;
      }
      if (opts.stun) target.status.stunUntil = Math.max(target.status.stunUntil, this.time + opts.stun);
      if (opts.slowMul !== undefined && opts.slowSeconds) {
        target.status.slowMul = opts.slowMul;
        target.status.slowUntil = this.time + opts.slowSeconds;
      }
      if (target.hero && !target.hero.blocking && amount >= 25 && !target.hero.action) {
        target.hero.action = { name: "hit", kind: "hit", t: 0, dur: b.hitStunSeconds, hitAt: 99, fired: true, combo: 0, dirX: 0, dirZ: 0 };
      }
    }
    if (target.hp <= 0) this.kill(target, src);
    return true;
  }

  heal(target: Entity, amount: number): void {
    if (!target.alive || target.hp >= target.maxHp) return;
    target.hp = Math.min(target.maxHp, target.hp + amount);
  }

  promote(e: Entity, value: number): void {
    const u = e.unit!;
    const vet = this.data.units.veterancy;
    u.kills += value;
    let next = u.rank;
    while (next < vet.names.length && u.kills >= vet.killsForRank[next]) next++;
    if (next <= u.rank) return;
    const dmgK = (1 + vet.damagePerRank * next) / (1 + vet.damagePerRank * u.rank);
    const hpK = (1 + vet.hpPerRank * next) / (1 + vet.hpPerRank * u.rank);
    u.rank = next;
    u.damage *= dmgK;
    e.maxHp *= hpK;
    e.hp = Math.min(e.maxHp, e.hp * hpK + e.maxHp * vet.healOnRank);
    const p = e.transform;
    this.emit({ type: "rankUp", id: e.id, rank: next, x: p.pos.x, y: p.y, z: p.pos.z, team: e.team });
  }

  tideHigh = false;

  tideLevel(time = this.time): number {
    const td = this.terrain.tide;
    if (!td) return 0;
    const cycle = td.lowSeconds + td.highSeconds;
    const t = time - td.firstSeconds;
    if (t < 0) return 0;
    const p = t % cycle;
    const ramp = 3;
    if (p < td.lowSeconds) return Math.max(0, 1 - p / ramp) * (t >= cycle ? 1 : 0);
    return Math.min(1, (p - td.lowSeconds) / ramp);
  }

  private updateTide(): void {
    const td = this.terrain.tide;
    if (!td || !this.terrain.tideCells.length) return;
    const t = this.time - td.firstSeconds;
    const high = t >= 0 && t % (td.lowSeconds + td.highSeconds) >= td.lowSeconds;
    if (high === this.tideHigh) return;
    this.tideHigh = high;
    for (const i of this.terrain.tideCells) this.terrain.kinds[i] = high ? Kind.Ford : Kind.Ground;
    this.nav.recompute(this.terrain.tideCells);
    for (const e of this.entities) if (e.unit) e.unit.repathAt = 0;
    this.emit({ type: "notice", team: -1, text: high ? "HIGH TIDE · THE FLATS FLOOD" : "LOW TIDE · THE FLATS DRAIN" });
  }

  loseGold(team: number, amount: number, why: string): void {
    const ts = this.teams[team];
    const lost = Math.min(ts.resource, Math.round(amount * (1 - ts.catchUp)));
    if (lost <= 0) return;
    ts.resource -= lost;
    this.emit({ type: "notice", team, text: `${why} · -${lost} GOLD` });
  }

  rally(team: number): void {
    const r = this.data.match.economy.rally;
    for (const o of this.entities) {
      if (!o.alive || o.team !== team || o.structure) continue;
      o.status.rallyUntil = this.time + r.seconds;
    }
    this.emit({ type: "notice", team, text: `TOWER FELLED · ARMY RALLIES ${r.seconds}S` });
    this.emit({ type: "notice", team: 1 - team, text: "THEY FELLED A TOWER · THEIR ARMY RALLIES" });
  }

  kill(target: Entity, src: Entity | null): void {
    const tp = target.transform;
    this.onKillSynergy(target, src);
    onKill(this, src, target);
    const bounty = this.data.match.economy.bounty;
    const kt = src ? src.team : 1 - target.team;
    const killerTeam = kt === 0 || kt === 1 ? kt : -1;
    const nobody = { resource: 0, heroKills: 0, kills: 0 };
    const killer = killerTeam >= 0 ? this.teams[killerTeam] : nobody;
    const victim = this.teams[target.team];
    const cut = victim ? 1 - victim.catchUp * this.data.match.catchUp.bountyCut : 1;
    target.hp = 0;
    this.emit({
      type: "death", id: target.id, kind: target.kind, x: tp.pos.x, y: tp.y, z: tp.pos.z, team: target.team,
      big: target.kind !== "unit",
    });
    if (target.hero) {
      if (src?.unit && src.alive && src.team !== target.team) this.promote(src, this.data.units.veterancy.heroKillValue);
      target.alive = false;
      target.hero.dead = true;
      target.hero.action = null;
      target.hero.bomb = false;
      target.hero.aim = null;
      target.hero.respawnAt = this.time + this.data.heroes.baseline.respawnSeconds * (1 - (victim?.catchUp ?? 0) * this.data.match.catchUp.respawnCut);
      killer.resource += bounty.hero * cut;
      killer.heroKills++;
      this.loseGold(target.team, this.data.match.economy.loss.heroDeath, "HERO DOWN");
      return;
    }
    target.alive = false;
    if (src?.unit && src.alive && src.team !== target.team) this.promote(src, target.unit ? 1 : this.data.units.veterancy.structureKillValue);
    if (target.unit) {
      const vet = this.data.units.veterancy;
      if (target.neutral) {
        const og = this.data.match.arena.ogre;
        killer.resource += og.bounty;
        if (killerTeam >= 0) {
          for (const o of this.entities) {
            if (!o.alive || o.team !== killerTeam || o.structure) continue;
            o.status.buffUntil = this.time + og.blessSeconds;
            o.status.buffDamageMul = og.blessDamage;
            o.status.buffSpeedMul = og.blessSpeed;
            if (o.hero) {
              gainXp(this, o, og.blessXp);
              this.heal(o, o.maxHp * 0.3);
            }
          }
          this.emit({ type: "notice", team: -1, text: `THE OGRE FALLS · ${killerTeam === 0 ? "BLUE" : "RED"} HOUSE IS BLESSED` });
        }
        return;
      }
      killer.resource += (this.data.units.types[target.unit.type].bounty + target.unit.rank * vet.bountyPerRank) * cut;
      killer.kills++;
      return;
    }
    const st = target.structure!;
    if (st.type === "core") {
      this.nav.setBlocked(tp.pos.x, tp.pos.z, this.data.structures.core.radius + 0.4, false);
      this.endMatch(1 - target.team, "core destroyed");
      return;
    }
    if (st.padIndex < 0) {
      this.nav.setBlocked(tp.pos.x, tp.pos.z, target.radius, false);
      return;
    }
    const pad = this.pads[st.padIndex];
    pad.structureId = 0;
    this.nav.setBlocked(pad.x, pad.z, this.data.structures.structureRadius, false);
    killer.resource += bounty.structure * cut;
    this.teams[target.team].structuresLost++;
    if (this.data.structures.types[st.type as "damage"]?.class === "tower") {
      this.loseGold(target.team, this.data.match.economy.loss.tower, "TOWER LOST");
      if (killerTeam >= 0) this.rally(killerTeam);
    }
    pad.rubbleUntil = this.time + this.data.structures.rubbleSeconds;
    pad.rubbleTeam = target.team;
  }

  nextSlot(team: number): number {
    return this.slotCounter[team]++;
  }

  speedMul(e: Entity): number {
    const s = e.status;
    let m = 1;
    if (this.time < s.slowUntil) m *= s.slowMul;
    if (this.time < s.buffUntil) m *= s.buffSpeedMul;
    if (this.time < s.rallyUntil) m *= this.data.match.economy.rally.speedMul;
    for (const z of this.zones) {
      if (z.haste && z.team === e.team && this.time < z.until && Math.hypot(e.transform.pos.x - z.x, e.transform.pos.z - z.z) <= z.radius) {
        m *= z.haste;
        break;
      }
    }
    const cx = Math.floor(e.transform.pos.x);
    const cz = Math.floor(e.transform.pos.z);
    const kind = this.terrain.kindAt(cx, cz);
    if (kind === Kind.Ford) m *= this.data.match.terrain.fordSpeedMul;
    else if (kind === Kind.Water) m *= this.data.match.terrain.fordSpeedMul * 0.8;
    if (e.hero) m *= this.pacingMul(e);
    if (e.unit) {
      const def = this.data.units.types[e.unit.type];
      if (def.slopeSpeedMul < 1 && this.slopeAt(e.transform.pos.x, e.transform.pos.z) > this.data.match.terrain.slopeThreshold) {
        m *= def.slopeSpeedMul;
      }
    }
    return m;
  }

  turf(e: Entity): "home" | "tower" | "enemyTower" | "field" {
    const pc = this.data.match.pacing;
    const p = e.transform.pos;
    let own = false;
    for (const o of this.entities) {
      if (!o.alive || !o.structure || !o.structure.range || o.structure.type === "core") continue;
      if (this.data.structures.types[o.structure.type as keyof typeof this.data.structures.types]?.class !== "tower") continue;
      const d = Math.hypot(o.transform.pos.x - p.x, o.transform.pos.z - p.z);
      if (d > o.structure.range * pc.towerReach) continue;
      if (o.team !== e.team) return "enemyTower";
      own = true;
    }
    if (!own) {
      for (const o of this.entities) {
        if (!o.alive || o.team !== e.team || !o.structure?.ready || o.structure.padIndex < 0) continue;
        if (this.data.structures.types[o.structure.type as keyof typeof this.data.structures.types]?.class !== "production") continue;
        if (Math.hypot(o.transform.pos.x - p.x, o.transform.pos.z - p.z) <= pc.outpostReach) { own = true; break; }
      }
    }
    if (own) return "tower";
    const mine = this.get(this.teams[e.team]?.coreId ?? -1);
    const theirs = this.get(this.teams[1 - e.team]?.coreId ?? -1);
    if (mine && theirs) {
      const dm = Math.hypot(mine.transform.pos.x - p.x, mine.transform.pos.z - p.z);
      const dt = Math.hypot(theirs.transform.pos.x - p.x, theirs.transform.pos.z - p.z);
      if (dm < dt) return "home";
    }
    return "field";
  }

  calm(e: Entity): boolean {
    return !!e.hero && this.time - e.hero.combatAt >= this.data.match.pacing.calmSeconds;
  }

  pacingMul(e: Entity): number {
    const pc = this.data.match.pacing;
    const h = e.hero!;
    let m = 1;
    const turf = this.turf(e);
    if (turf === "home" || turf === "tower") m *= pc.homeSpeedMul;
    else if (turf === "enemyTower") m *= pc.towerIntruderMul;
    if (this.calm(e)) m *= pc.calmSpeedMul;
    if (this.time - h.actionEndAt < pc.commitSeconds) m *= pc.commitMul;
    if (this.arena.carrying(e)) m *= this.data.match.arena.relic.carrySpeedMul;
    return m;
  }

  slopeAt(x: number, z: number): number {
    const t = this.terrain;
    const dx = t.groundHeight(x + 0.5, z) - t.groundHeight(x - 0.5, z);
    const dz = t.groundHeight(x, z + 0.5) - t.groundHeight(x, z - 0.5);
    return Math.hypot(dx, dz);
  }

  canStand(e: Entity, x: number, z: number): boolean {
    const b = this.data.heroes.baseline;
    const step = e.hero?.stepHeight ?? b.stepHeight;
    const maxSlope = e.hero?.maxSlope ?? b.maxSlope;
    const hc = this.terrain.heightAt(x, z);
    if (!Number.isFinite(hc)) return false;
    const falling = (this.knocked || !!e.hero) && hc < e.transform.y - step;
    if (!falling && Math.abs(hc - e.transform.y) > step) return false;
    if (!falling && this.terrain.slopeAt(x, z) > maxSlope && !(hc < e.transform.y - 0.01)) return false;
    return !this.hitsStructure(e, x, z);
  }

  private solidCell(cx: number, cz: number): boolean {
    return !Number.isFinite(this.terrain.heightAt(cx + 0.5, cz + 0.5));
  }

  private pushOut(e: Entity): void {
    const t = e.transform;
    const r = Math.min(e.radius, 0.55);
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (let cz = Math.floor(t.pos.z - r); cz <= Math.floor(t.pos.z + r); cz++) {
        for (let cx = Math.floor(t.pos.x - r); cx <= Math.floor(t.pos.x + r); cx++) {
          if (!this.solidCell(cx, cz)) continue;
          const px = Math.max(cx, Math.min(cx + 1, t.pos.x));
          const pz = Math.max(cz, Math.min(cz + 1, t.pos.z));
          const dx = t.pos.x - px;
          const dz = t.pos.z - pz;
          const d = Math.hypot(dx, dz);
          if (d >= r || d < 1e-6) continue;
          const nx = t.pos.x + (dx / d) * (r - d);
          const nz = t.pos.z + (dz / d) * (r - d);
          if (!Number.isFinite(this.terrain.heightAt(nx, nz))) continue;
          t.pos.x = nx;
          t.pos.z = nz;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  private hitsStructure(e: Entity, x: number, z: number): boolean {
    const ah = this.arena?.home;
    if (ah) {
      const d = Math.hypot(ah.x - x, ah.z - z);
      if (d < 1.15 + e.radius * 0.8 && d < Math.hypot(ah.x - e.transform.pos.x, ah.z - e.transform.pos.z)) return true;
    }
    for (const s of this.entities) {
      if (!s.alive || s.kind !== "structure" || s === e) continue;
      const d = Math.hypot(s.transform.pos.x - x, s.transform.pos.z - z);
      const min = s.radius + e.radius * 0.8;
      if (d < min) {
        const cur = Math.hypot(s.transform.pos.x - e.transform.pos.x, s.transform.pos.z - e.transform.pos.z);
        if (d < cur) return true;
      }
    }
    return false;
  }

  nearestStandable(e: Entity, x: number, z: number): Vec2 | null {
    const y = e.transform.y;
    const slide = !!e.hero;
    let up: Vec2 | null = null;
    for (let r = 0.25; r <= 3; r += 0.25) {
      let best: Vec2 | null = null;
      let bestDy = Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const px = x + Math.sin(a) * r;
        const pz = z + Math.cos(a) * r;
        const h = this.terrain.heightAt(px, pz);
        if (!Number.isFinite(h)) continue;
        e.transform.y = h;
        const ok = this.canStand(e, px, pz);
        e.transform.y = y;
        if (!ok) continue;
        if (slide && h > y + 0.05) {
          up ??= { x: px, z: pz };
          continue;
        }
        if (Math.abs(h - y) < bestDy) { bestDy = Math.abs(h - y); best = { x: px, z: pz }; }
      }
      if (best) return best;
    }
    return up;
  }

  private stuckHere(e: Entity): boolean {
    const t = e.transform;
    return !this.canStand(e, t.pos.x, t.pos.z);
  }

  private accept(e: Entity, x: number, z: number, escaping: boolean): boolean {
    if (this.canStand(e, x, z)) return true;
    if (!escaping) return false;
    const h = this.terrain.heightAt(x, z);
    return Number.isFinite(h) && Math.abs(h - e.transform.y) <= (e.hero?.stepHeight ?? this.data.heroes.baseline.stepHeight) * 1.5;
  }

  moveBy(e: Entity, dx: number, dz: number): boolean {
    const t = e.transform;
    if (dx === 0 && dz === 0) return false;
    const escaping = this.stuckHere(e);
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const place = (x: number, z: number) => {
      const ox = t.pos.x;
      const oz = t.pos.z;
      t.pos.x = x;
      t.pos.z = z;
      this.pushOut(e);
      const h = this.terrain.heightAt(t.pos.x, t.pos.z);
      if (!Number.isFinite(h) || (Math.abs(h - t.y) > (e.hero?.stepHeight ?? this.data.heroes.baseline.stepHeight) + 0.05 && !((this.knocked || !!e.hero) && h < t.y))) {
        t.pos.x = ox;
        t.pos.z = oz;
        return false;
      }
      const cx = x - ox;
      const cz = z - oz;
      const cl = Math.hypot(cx, cz) || 1;
      const progress = ((t.pos.x - ox) * cx + (t.pos.z - oz) * cz) / (cl * cl);
      if (progress < 0.3) {
        t.pos.x = ox;
        t.pos.z = oz;
        return false;
      }
      t.y = this.groundY(t.pos.x, t.pos.z);
      return true;
    };
    const tryMove = (mx: number, mz: number) => this.accept(e, t.pos.x + mx, t.pos.z + mz, escaping) && place(t.pos.x + mx, t.pos.z + mz);
    if (escaping) {
      const safe = this.nearestStandable(e, t.pos.x, t.pos.z);
      if (safe) {
        const gx = safe.x - t.pos.x;
        const gz = safe.z - t.pos.z;
        const gl = Math.hypot(gx, gz);
        const k = Math.min(1, Math.max(len, 0.1) / Math.max(gl, 1e-6));
        t.pos.x += gx * k;
        t.pos.z += gz * k;
        t.y = this.groundY(t.pos.x, t.pos.z);
        return true;
      }
    }
    if (tryMove(dx, dz)) return true;
    const axes: [number, number][] = Math.abs(dx) > Math.abs(dz) ? [[dx, 0], [0, dz]] : [[0, dz], [dx, 0]];
    for (const [ox, oz] of axes) if (Math.hypot(ox, oz) > len * 0.3 && tryMove(ox, oz)) return true;
    for (let k = 1; k <= 8; k++) {
      const ang = k * 0.2;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const step = len * Math.max(0.4, c);
      for (const sg of [1, -1]) {
        const rx = ux * c - uz * sn * sg;
        const rz = ux * sn * sg + uz * c;
        if (tryMove(rx * step, rz * step)) return true;
      }
    }
    return false;
  }

  faceToward(e: Entity, dx: number, dz: number, rate: number): void {
    if (Math.abs(dx) + Math.abs(dz) < 1e-5) return;
    const t = e.transform;
    const target = Math.atan2(dx, dz);
    let d = target - t.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const maxTurn = rate * this.dt;
    t.facing += Math.max(-maxTurn, Math.min(maxTurn, d));
  }

  private knocked = false;

  private applyKnockback(dt: number): void {
    const pos = this.data.match.positional;
    for (const e of this.entities) {
      if (!e.alive || e.kind === "structure") continue;
      const s = e.status;
      if (Math.abs(s.kvx) + Math.abs(s.kvz) < 0.05) { s.kvx = s.kvz = 0; continue; }
      const y0 = e.transform.y;
      this.knocked = Math.hypot(s.kvx, s.kvz) >= pos.knockDropMin;
      this.moveBy(e, s.kvx * dt, s.kvz * dt);
      this.knocked = false;
      const drop = y0 - e.transform.y;
      if (drop >= pos.fallMin) {
        e.transform.prevY = y0;
        this.emit({ type: "fall", x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z });
        this.damage(null, e, e.maxHp * pos.fallDamageFrac * Math.min(2, drop / pos.fallMin), { stun: pos.fallStun, fromX: e.transform.pos.x, fromZ: e.transform.pos.z });
        if (!e.alive) continue;
      }
      const decay = Math.exp(-dt * 8);
      s.kvx *= decay;
      s.kvz *= decay;
    }
  }

  fireProjectile(src: Entity, target: Entity, damage: number, speed: number, ballistic: boolean, style: string, fromHeight: number, canMiss = true, splash?: Projectile["splash"], slow?: Projectile["slow"]): void {
    const sp = src.transform;
    const tp = target.transform;
    const d = this.dist(src, target);
    this.emit({ type: "shot", style, x: sp.pos.x, y: sp.y + fromHeight, z: sp.pos.z });
    this.projectiles.push({
      id: this.nextId++,
      team: src.team,
      sourceId: src.id,
      targetId: target.id,
      from: { x: sp.pos.x, y: sp.y + fromHeight, z: sp.pos.z },
      to: { x: tp.pos.x, y: tp.y + 1, z: tp.pos.z },
      t: 0,
      prevT: 0,
      dur: Math.max(0.15, d / speed),
      ballistic,
      damage,
      style,
      canMiss,
      splash,
      slow,
    });
  }

  fireAtPoint(src: Entity, x: number, z: number, speed: number, style: string, fromHeight: number, splash?: Projectile["splash"]): void {
    const sp = src.transform;
    const d = Math.hypot(x - sp.pos.x, z - sp.pos.z);
    this.emit({ type: "shot", style, x: sp.pos.x, y: sp.y + fromHeight, z: sp.pos.z });
    this.projectiles.push({
      id: this.nextId++, team: src.team, sourceId: src.id, targetId: 0,
      from: { x: sp.pos.x, y: sp.y + fromHeight, z: sp.pos.z },
      to: { x, y: this.groundY(x, z) + 0.5, z },
      t: 0, prevT: 0, dur: Math.max(0.15, d / speed), ballistic: false, damage: 0, style, canMiss: false, splash,
    });
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const target = p.targetId ? this.get(p.targetId) : undefined;
      if (target) {
        p.to.x = target.transform.pos.x;
        p.to.y = target.transform.y + 1;
        p.to.z = target.transform.pos.z;
      }
      p.t += dt / p.dur;
      if (p.t >= 1) {
        this.projectiles.splice(i, 1);
        const src = this.getAny(p.sourceId) ?? null;
        const who = src && src.alive ? src : null;
        const landed = target ? this.damage(who, target, p.damage, { fromX: p.from.x, fromZ: p.from.z, knockback: p.splash ? 3 : 0.8, canMiss: p.canMiss, slowMul: p.slow?.slowMul, slowSeconds: p.slow?.slowSeconds }) : false;
        if (landed && who && target && p.talent) afterShot(this, who, target, p.damage, p.talent === "orb");
        if (p.splash) {
          const sp = p.splash;
          this.emit({ type: "telegraph", x: p.to.x, y: this.groundY(p.to.x, p.to.z), z: p.to.z, radius: sp.radius, team: p.team, seconds: 0.05 });
          for (const o of this.entities.slice()) {
            if (!o.alive || o.team === p.team || o === target || o.kind === "structure") continue;
            if (Math.hypot(o.transform.pos.x - p.to.x, o.transform.pos.z - p.to.z) - o.radius > sp.radius) continue;
            this.damage(who, o, sp.damage, { fromX: p.to.x, fromZ: p.to.z, knockback: 2.5, slowMul: sp.slowMul, slowSeconds: sp.slowSeconds });
          }
          if (target?.alive) {
            target.status.slowMul = sp.slowMul;
            target.status.slowUntil = this.time + sp.slowSeconds;
          }
        }
      }
    }
  }

  private separate(): void {
    const list = this.entities.filter((e) => e.alive && e.kind !== "structure");
    const push = this.data.units.separationPush;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.team !== b.team && (a.hero?.action?.kind === "flurry" || b.hero?.action?.kind === "flurry")) continue;
        const pa = a.transform.pos;
        const pb = b.transform.pos;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const minD = a.radius + b.radius;
        if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue;
        let d = Math.hypot(dx, dz);
        if (d >= minD) continue;
        let nx = dx;
        let nz = dz;
        if (d < 1e-4) { nx = Math.cos(a.id); nz = Math.sin(a.id); d = 1; }
        const over = (minD - Math.hypot(dx, dz)) * push;
        const wa = a.hero ? 0.25 : b.hero ? 0.75 : 0.5;
        const px = (nx / d) * over;
        const pz = (nz / d) * over;
        this.moveBy(a, -px * wa * 2, -pz * wa * 2);
        this.moveBy(b, px * (1 - wa) * 2, pz * (1 - wa) * 2);
      }
    }
  }

  private updateHazards(): void {
    const t = this.time;
    for (const e of this.entities) {
      if (e.alive && e.expiresAt !== undefined && t >= e.expiresAt) {
        e.alive = false;
        this.emit({ type: "death", id: e.id, kind: e.kind, x: e.transform.pos.x, y: e.transform.y, z: e.transform.pos.z, team: e.team, big: false });
        if (e.structure && e.structure.padIndex < 0) this.nav.setBlocked(e.transform.pos.x, e.transform.pos.z, e.radius, false);
      }
    }
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const tr = this.traps[i];
      if (t >= tr.until) { this.traps.splice(i, 1); continue; }
      if (t < tr.armAt) continue;
      const owner = this.get(tr.ownerId) ?? null;
      const victims = this.entities.filter((o) => o.alive && o.team !== tr.team && o.kind !== "structure" &&
        Math.hypot(o.transform.pos.x - tr.x, o.transform.pos.z - tr.z) < tr.radius + o.radius);
      if (!victims.length) continue;
      this.emit({ type: "slam", x: tr.x, y: this.groundY(tr.x, tr.z), z: tr.z, radius: tr.radius * 1.5, team: tr.team, src: tr.ownerId, trap: true });
      for (const v of victims) this.damage(owner, v, tr.damage, { stun: tr.stun, fromX: tr.x, fromZ: tr.z, big: true });
      const rearm = owner?.hero ? this.heroDef(owner.hero.type).abilities.z.rearmSeconds : undefined;
      if (rearm && this.zones.some((z) => z.ownerId === tr.ownerId && t < z.until && Math.hypot(z.x - tr.x, z.z - tr.z) <= z.radius)) {
        tr.armAt = t + rearm;
        continue;
      }
      this.traps.splice(i, 1);
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (t >= z.until) { this.zones.splice(i, 1); continue; }
      const owner = this.get(z.ownerId) ?? null;
      const tickDmg = this.tick % 15 === 0;
      if (z.heal && tickDmg) {
        for (const o of this.entities) {
          if (!o.alive || o.team !== z.team || o.kind === "structure" || o.hp >= o.maxHp) continue;
          if (Math.hypot(o.transform.pos.x - z.x, o.transform.pos.z - z.z) > z.radius) continue;
          this.heal(o, z.heal * 0.5);
          if (this.tick % 30 === 0) this.emit({ type: "heal", x: o.transform.pos.x, y: o.transform.y, z: o.transform.pos.z, team: z.team });
        }
      }
      for (const o of this.entities) {
        if (!o.alive || o.team === z.team || o.kind === "structure") continue;
        if (Math.hypot(o.transform.pos.x - z.x, o.transform.pos.z - z.z) > z.radius) continue;
        o.status.slowMul = Math.min(o.status.slowUntil > t ? o.status.slowMul : 1, z.slowMul);
        o.status.slowUntil = t + 0.3;
        if (tickDmg && z.dps > 0) this.damage(owner, o, z.dps * 0.5, { fromX: z.x, fromZ: z.z, tick: true });
      }
    }
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      if (t < d.at) continue;
      this.delayed.splice(i, 1);
      const owner = this.get(d.ownerId) ?? null;
      this.emit({ type: "slam", x: d.x, y: this.groundY(d.x, d.z), z: d.z, radius: d.radius, team: d.team });
      for (const o of this.entities.slice()) {
        if (!o.alive || o.team === d.team) continue;
        if (Math.hypot(o.transform.pos.x - d.x, o.transform.pos.z - d.z) - o.radius > d.radius) continue;
        if (d.hexSeconds && o.kind !== "structure") {
          o.status.hexUntil = t + d.hexSeconds;
          o.status.hexOwner = d.ownerId;
        }
        this.damage(owner, o, d.damage, { fromX: d.x, fromZ: d.z, slowMul: d.slowMul, slowSeconds: d.slowSeconds, knockback: 2, big: true });
      }
    }
    for (let i = this.mods.length - 1; i >= 0; i--) {
      const m = this.mods[i];
      if (t < m.until) continue;
      this.mods.splice(i, 1);
      this.revertMod(m);
    }
  }

  applyMod(m: TerrainMod): void {
    const tr = this.terrain;
    m.prevKind = m.cells.map((c) => tr.kinds[c]);
    m.prevDeck = m.cells.map((c) => tr.deck[c]);
    m.prevStyle = m.cells.map((c) => tr.styles[c]);
    m.cells.forEach((c, k) => {
      if (m.kind !== "wall") {
        tr.kinds[c] = Kind.Bridge;
        tr.deck[c] = m.deck[k];
        tr.styles[c] = m.kind === "works" ? "works" : "wood";
      } else {
        tr.kinds[c] = Kind.Wall;
        tr.styles[c] = "ruin";
      }
    });
    this.nav.recompute(m.cells);
    this.mods.push(m);
  }

  applyModIfOpen(m: TerrainMod): boolean {
    this.applyMod(m);
    const a = this.spawnPoint(0);
    const b = this.spawnPoint(1);
    if (this.nav.findPath(a, b)) return true;
    this.mods.splice(this.mods.indexOf(m), 1);
    const tr = this.terrain;
    m.cells.forEach((c, k) => {
      tr.kinds[c] = m.prevKind[k];
      tr.deck[c] = m.prevDeck[k];
      tr.styles[c] = m.prevStyle![k];
    });
    this.nav.recompute(m.cells);
    return false;
  }

  private revertMod(m: TerrainMod): void {
    const tr = this.terrain;
    for (const e of this.entities) {
      if (e.alive && e.structure?.siege?.modId === m.id) this.kill(e, null);
    }
    m.cells.forEach((c, k) => {
      tr.kinds[c] = m.prevKind[k];
      tr.deck[c] = m.prevDeck[k];
      if (m.prevStyle) tr.styles[c] = m.prevStyle[k];
    });
    this.nav.recompute(m.cells);
    for (const e of this.entities) {
      if (!e.alive || e.kind === "structure") continue;
      const h = this.terrain.heightAt(e.transform.pos.x, e.transform.pos.z);
      if (Number.isFinite(h) && Math.abs(h - e.transform.y) < 1.5) { e.transform.y = h; continue; }
      const i = this.nav.nearestOpen(e.transform.pos.x, e.transform.pos.z, 6);
      if (i >= 0) this.teleport(e, (i % this.nav.w) + 0.5, Math.floor(i / this.nav.w) + 0.5);
    }
    this.emit({ type: "modEnd", id: m.id });
  }

  private cleanup(): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (!e.alive && !e.hero) {
        this.entities.splice(i, 1);
        this.byId.delete(e.id);
      }
    }
  }

  enemiesNear(e: Entity, radius: number, filter?: (o: Entity) => boolean): Entity[] {
    const out: Entity[] = [];
    for (const o of this.entities) {
      if (!o.alive || o.team === e.team) continue;
      if (this.dist(e, o) - o.radius > radius) continue;
      if (filter && !filter(o)) continue;
      out.push(o);
    }
    return out;
  }

  heroesByTeam(team: number): Entity[] {
    return this.entities.filter((e) => e.hero && e.team === team);
  }
}
