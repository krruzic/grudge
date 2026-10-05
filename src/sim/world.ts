// World: the deterministic simulation root. Owns every entity, team, projectile and hazard, and advances the
// match one fixed tick at a time via step(commands). Rendering, UI, bots and netplay only ever read World state
// (or feed it Commands); nothing outside src/sim mutates it.
//
// Most behaviour lives in src/sim/world/*.ts as free functions taking `w: World`; the methods below are thin
// delegates so the rest of the codebase keeps calling `w.damage(...)`, `w.moveBy(...)`, etc. See src/sim/README.md
// for the tick order and the lockstep/determinism rules.
import { Terrain, type MapData } from "./terrain.ts";
import { NavGrid } from "./nav.ts";
import type { GameData, HeroDef } from "./config.ts";
import type {
  Boomerang,
  Command,
  Delayed,
  Directive,
  Entity,
  Keg,
  MatchState,
  Missile,
  Pad,
  PadZone,
  Projectile,
  SimEvent,
  TargetClass,
  TeamState,
  TerrainMod,
  Trap,
  UnitType,
  Vec2,
  Zone,
} from "./types.ts";
import { TEAM_NAMES } from "./types.ts";
import { updateBoomerangs } from "./heroes.ts";
import { updateUnit } from "./units.ts";
import { updateStructure } from "./structures.ts";
import { Arena } from "./arena.ts";
import { MapEvents } from "./mapEvents.ts";
import { Tdm } from "./tdm.ts";
import { tickStatus, updateMissiles } from "./talents.ts";
import { updateKegs } from "./hero/friar.ts";
import { mulberry32 } from "./world/rng.ts";
import { newStatus } from "./world/status.ts";
import { applyPlayerCommand } from "./world/commands.ts";
import * as bases from "./world/bases.ts";
import * as dmg from "./world/damage.ts";
import * as death from "./world/death.ts";
import * as match from "./world/match.ts";
import * as morph from "./world/morph.ts";
import * as jumps from "./world/jumps.ts";
import * as economy from "./world/economy.ts";
import * as vision from "./world/vision.ts";
import * as move from "./world/movement.ts";
import * as shots from "./world/projectiles.ts";
import * as hazards from "./world/hazards.ts";
import type { DamageOpts } from "./world/damage.ts";
import type { BaseInfo, JumpPad } from "./world/bases.ts";

export type { Vec2, Entity, Command } from "./types.ts";
export type { DamageOpts } from "./world/damage.ts";

/** One human/bot seat: which player index drives which hero on which team. */
export interface PlayerSlot {
  player: number;
  team: number;
  heroType: string;
  heroId: number;
  commander: boolean;
}

export class World {
  // ---------------------------------------------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------------------------------------------

  readonly terrain: Terrain;
  readonly nav: NavGrid;
  /** All live (and dead-hero) entities in creation order. Iteration order is part of the sim: never reorder. */
  readonly entities: Entity[] = [];
  readonly projectiles: Projectile[] = [];
  readonly boomerangs: Boomerang[] = [];
  readonly missiles: Missile[] = [];
  readonly kegs: Keg[] = [];
  readonly pads: Pad[] = [];
  readonly teams: TeamState[] = [];
  readonly players: PlayerSlot[] = [];
  /** Events emitted this frame; the client drains this after each step for fx/audio. Not read by the sim. */
  readonly events: SimEvent[] = [];
  readonly traps: Trap[] = [];
  readonly zones: Zone[] = [];
  readonly delayed: Delayed[] = [];
  /** Temporary terrain edits (walls, ramps, siege works); reverted when `until` passes. */
  readonly mods: TerrainMod[] = [];
  readonly dt: number;
  readonly match: MatchState = { time: 0, phase: "play", winner: -1, reason: "" };
  /** Seeded sim RNG. Every call shifts all later results, so call order is part of the lockstep contract. */
  readonly rng: () => number;
  readonly teamCount: number;
  readonly mapEvents: MapEvents;
  readonly arena: Arena;
  /** Team deathmatch rules (map mode "tdm"), else null. */
  readonly tdm: Tdm | null;
  /** Per-team castle footprint (see world/bases.ts): base mask, gate cells and defend posts. */
  readonly bases: BaseInfo[];
  tick = 0;
  time = 0;
  training = false;
  tideHigh = false;

  jumpPads: JumpPad[] = [];
  readonly jumpCharge = 1.0;
  readonly jumpCooldown = 5;
  /** Seconds a pending talent pick waits before being auto-chosen. */
  readonly autoPickSeconds = 10;

  // Internal caches/flags used by the world/* modules (not part of the public API).
  /** Defend-post assignment, rebuilt once per tick. */
  readonly posts = { tick: -1, of: new Map<number, [number, number]>() };
  /** Soldiers sent back to defend a structure under attack (unit id -> attacker id), rebuilt once per tick. */
  readonly defense = { tick: -1, of: new Map<number, number>() };
  /** Formation slot assignment, rebuilt once per tick. */
  readonly forms = { tick: -1, of: new Map<number, [number, number]>() };
  /** Connected tall-grass patch id per cell (lazy, terrain flags never change). */
  grassPatches: Int32Array | null = null;
  /** True while knockback is moving an entity: lets it drop off ledges it could not walk off. */
  knocked = false;

  private nextId = 1;
  private byId = new Map<number, Entity>();
  private slotCounter: number[];
  private timers: { at: number; seq: number; fn: () => void }[] = [];
  private timerSeq = 0;

  constructor(
    map: MapData,
    readonly data: GameData,
    seed = 1,
  ) {
    this.terrain = new Terrain(map);
    this.dt = 1 / data.match.tickRate;
    this.rng = mulberry32(seed);
    this.nav = new NavGrid(this.terrain, data.heroes.baseline.stepHeight, data.heroes.baseline.maxSlope);
    this.teamCount = this.terrain.teams;
    this.slotCounter = new Array(this.teamCount).fill(0);
    this.terrain.pads.forEach((p, i) => {
      const zone = (p.zone ?? "home") as PadZone;
      const side = zone === "neutral" ? -1 : (p.side ?? (p.x < this.terrain.width / 2 ? 0 : 1));
      this.pads.push({ index: i, x: p.x, z: p.z, zone, side, structureId: 0, rubbleUntil: 0 });
    });
    for (let team = 0; team < this.teamCount; team++) {
      const hold = bases.defaultHold(this, team);
      this.teams.push({
        resource: data.match.economy.start,
        grain: data.match.economy.grain?.start ?? 0,
        coreId: 0,
        directives: {
          grunt: "push",
          ranged: "push",
          heavy: "push",
          holdPoint: { grunt: { ...hold }, ranged: { ...hold }, heavy: { ...hold } },
          focus: { grunt: 0, ranged: 0, heavy: 0 },
        },
        coreDamageDealt: 0,
        kills: 0,
        structuresBuilt: 0,
        structuresLost: 0,
        heroKills: 0,
        catchUp: 0,
        unitCount: 0,
        commanderOrderAt: -99,
        banner: null,
        wardReadyAt: 0,
      });
    }
    for (const c of this.terrain.cores) {
      const team = c.team ?? 0;
      const e = this.addEntity(team, "structure", data.structures.core.radius, c.x, c.z, data.structures.core.hp);
      e.structure = {
        type: "core",
        padIndex: -1,
        level: 1,
        builtAt: 0,
        ready: true,
        nextAction: 0,
        range: 0,
        damage: 0,
        lastFireAt: -99,
        shielded: true,
        ward: data.structures.core.ward,
      };
      this.teams[team].coreId = e.id;
      this.nav.setBlocked(c.x, c.z, data.structures.core.radius + 0.4, true);
    }
    // Order matters: bases need the blocked cores, Arena/MapEvents read bases, jump pads read the final nav grid.
    this.bases = Array.from({ length: this.teamCount }, (_, t) => bases.computeBase(this, t));
    this.arena = new Arena(this);
    this.mapEvents = new MapEvents(this);
    this.tdm = this.terrain.mode === "tdm" ? new Tdm(this) : null;
    this.initJumpPads();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Advance one fixed tick. `commands[player]` is that player's input for this tick (missing = idle).
   * The order below is the simulation contract: changing it changes results and breaks lockstep replays.
   */
  step(commands: Command[]): void {
    if (this.match.phase === "over") {
      this.tick++;
      return;
    }
    if (this.training) match.trainingStep(this);
    const dt = this.dt;
    // 1. Snapshot transforms so the renderer can interpolate prev -> current.
    for (const e of this.entities) {
      const t = e.transform;
      t.prevPos.x = t.pos.x;
      t.prevPos.z = t.pos.z;
      t.prevY = t.y;
      t.prevFacing = t.facing;
    }
    for (const p of this.projectiles) p.prevT = p.t;

    // 2. Match clock, income and per-tick status (auras, stealth/visibility).
    if (this.tdm) this.tdm.updateClock();
    else {
      match.updateMatch(this);
      economy.updateEconomy(this, dt);
    }
    vision.updateStatusMods(this);

    // 3. Player commands + hero controllers, in player-slot order.
    for (const slot of this.players) {
      const e = this.byId.get(slot.heroId);
      if (!e) continue;
      applyPlayerCommand(this, slot, e, commands[slot.player] ?? { moveX: 0, moveZ: 0 });
    }

    // 4. Neutral/arena objectives, then AI units and structures (snapshot: spawns this tick act next tick).
    this.arena.update();
    this.tdm?.update();
    const list = this.entities.slice();
    for (const e of list) {
      if (!e.alive) continue;
      if (e.unit) updateUnit(this, e);
      else if (e.structure) updateStructure(this, e);
    }

    // 5. Things in flight, status ticks, delayed callbacks and ground hazards.
    shots.updateProjectiles(this, dt);
    updateBoomerangs(this);
    updateMissiles(this);
    updateKegs(this);
    tickStatus(this);
    this.runTimers();
    hazards.updateHazards(this);
    hazards.updateTide(this);
    this.mapEvents.update();

    // 6. Physics resolution: knockback, body separation, map locks, chasm deaths; then drop dead entities.
    move.applyKnockback(this, dt);
    move.separate(this);
    this.mapEvents.enforceLock();
    hazards.updateChasm(this);
    this.cleanup();
    this.tick++;
    this.time += dt;
    this.match.time = this.time;
  }

  /** Schedule `fn` after `seconds` of sim time. Due timers run in (time, insertion) order during step(). */
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

  /** Remove dead non-hero entities (heroes stay in the list while waiting to respawn). */
  private cleanup(): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const e = this.entities[i];
      if (!e.alive && !e.hero) {
        this.entities.splice(i, 1);
        this.byId.delete(e.id);
      }
    }
  }

  emit(ev: SimEvent): void {
    this.events.push(ev);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Entities & lookup
  // ---------------------------------------------------------------------------------------------------------------

  get heroData() {
    return this.data.heroes;
  }

  heroDef(type: string): HeroDef {
    return this.data.heroes.heroes[type] ?? Object.values(this.data.heroes.heroes)[0];
  }

  /** Living entity by id. */
  get(id: number): Entity | undefined {
    const e = this.byId.get(id);
    return e && e.alive ? e : undefined;
  }

  /** Entity by id even if dead (until cleanup removes it; heroes are never removed). */
  getAny(id: number): Entity | undefined {
    return this.byId.get(id);
  }

  /** Shared id counter for entities, projectiles, mods, zones, etc. */
  newId(): number {
    return this.nextId++;
  }

  /** Hero hooks for a hero, or for the hero that owns a summon/structure. */
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
    // 2-team maps face across the x axis; FFA maps face the map centre.
    const facing =
      this.teamCount > 2
        ? Math.atan2(this.terrain.width / 2 - x, this.terrain.depth / 2 - z)
        : team === 0
          ? Math.PI / 2
          : -Math.PI / 2;
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

  /**
   * FFA deathmatch-only champion tuning (tdm.ffaHeroMods): champions built around partners, soldiers or holding
   * ground get hp / speed / damage multipliers there. 1s everywhere else.
   */
  dmMod(type: string): { hp: number; speed: number; damage: number } {
    const m = this.tdm && this.teamCount > 2 ? this.tdm.cfg.ffaHeroMods?.[type] : undefined;
    const fast = this.tdm?.cfg.speedMul ?? 1;
    return { hp: m?.hp ?? 1, speed: (m?.speed ?? 1) * fast, damage: m?.damage ?? 1 };
  }

  spawnHero(type: string, player: number, team: number): Entity {
    const def = this.heroDef(type);
    const tiers = this.data.heroes.tiers;
    const b = this.data.heroes.baseline;
    // Deathmatch: everyone starts at a random spot clear of enemies (no team camps).
    const spawn = this.tdm ? this.tdm.respawnSpot(team) : this.spawnPoint(team);
    const mod = this.dmMod(type);
    const e = this.addEntity(team, "hero", b.radius, spawn.x, spawn.z, tiers.health[def.health] * mod.hp);
    e.hero = {
      type,
      player,
      speed: tiers.speed[def.speed] * (def.hooks.speedMul ?? 1) * mod.speed,
      damageMul: tiers.damage[def.damage] * mod.damage,
      vel: { x: 0, z: 0 },
      action: null,
      comboIndex: 0,
      comboUntil: 0,
      cooldowns: {},
      meter: 0,
      blocking: false,
      openingUntil: 0,
      combatAt: -99,
      actionEndAt: -99,
      bomb: false,
      stuckFor: 0,
      aim: null,
      xp: 0,
      level: 1,
      picks: [],
      path: { a: [], b: [], r: [], z: [] },
      ab: null,
      frenzy: 0,
      frenzyUntil: 0,
      recastUntil: 0,
      empowerMul: 1,
      empowerUntil: 0,
      dead: false,
      respawnAt: 0,
      lastTargetId: 0,
      lastTargetAt: -99,
      stepHeight: def.hooks.stepHeight ?? b.stepHeight,
      maxSlope: def.hooks.maxSlope ?? b.maxSlope,
    };
    this.players.push({ player, team, heroType: type, heroId: e.id, commander: def.role === "commander" });
    return e;
  }

  /** The team's main (non-commander if any) hero. */
  heroOf(team: number): Entity | undefined {
    const p = this.players.find((k) => k.team === team && !k.commander) ?? this.players.find((k) => k.team === team);
    return p ? this.byId.get(p.heroId) : undefined;
  }

  heroForPlayer(player: number): Entity | undefined {
    const p = this.players.find((k) => k.player === player);
    return p ? this.byId.get(p.heroId) : undefined;
  }

  heroesByTeam(team: number): Entity[] {
    return this.entities.filter((e) => e.hero && e.team === team);
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

  classOf(e: Entity): TargetClass {
    if (e.kind === "hero") return "hero";
    if (e.kind === "unit") return e.unit!.type;
    return "structure";
  }

  /** Per-team unit counter used to give units a stable formation slot. */
  nextSlot(team: number): number {
    return this.slotCounter[team]++;
  }

  teleport(e: Entity, x: number, z: number): void {
    const t = e.transform;
    t.pos.x = t.prevPos.x = x;
    t.pos.z = t.prevPos.z = z;
    t.y = t.prevY = this.groundY(x, z);
    this.mapEvents?.anchor(e);
  }

  dist(a: Entity, b: Entity): number {
    return Math.hypot(a.transform.pos.x - b.transform.pos.x, a.transform.pos.z - b.transform.pos.z);
  }

  /** Centre-to-edge distance (subtracts the target's radius). */
  edgeDist(a: Entity, b: Entity): number {
    return this.dist(a, b) - b.radius;
  }

  groundY(x: number, z: number): number {
    const h = this.terrain.heightAt(x, z);
    return Number.isFinite(h) ? h : this.terrain.groundHeight(x, z);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Teams, cores & match rules
  // ---------------------------------------------------------------------------------------------------------------

  spawnPoint(team: number): Vec2 {
    const s = this.terrain.spawns.find((k) => k.team === team) ?? this.terrain.spawns[0];
    return { x: s.x, z: s.z };
  }

  core(team: number): Entity | undefined {
    const t = this.teams[team];
    return t ? this.byId.get(t.coreId) : undefined;
  }

  /** Free-for-all: more than two teams on the map. */
  get ffa(): boolean {
    return this.teamCount > 2;
  }

  get ffaCfg() {
    return this.ffa ? this.data.match.ffa : undefined;
  }

  get morphCfg() {
    return this.data.match.arena.morph;
  }

  get wardMax(): number {
    const base = this.data.structures.core.ward;
    const solo = this.ffa || this.players.length <= 2;
    return solo ? base * (this.data.match.arena.shop.ward.soloScale ?? 1) : base;
  }

  get popCap(): number {
    const f = this.ffa ? this.data.match.ffa : undefined;
    return Math.round(this.data.units.popCap * (f?.popCapMul ?? 1));
  }

  /** Regular-time length; lockdown maps add their opening lock duration. */
  get matchLength(): number {
    if (this.tdm) return this.tdm.cfg.matchSeconds;
    return (
      this.data.match.matchSeconds * (this.ffa ? (this.data.match.ffa?.timeMul ?? 1) : 1) +
      (this.mapEvents?.lockUntil ?? 0)
    );
  }

  /** Team still in the match (not eliminated in FFA). */
  standing(team: number): boolean {
    const t = this.teams[team];
    return !!t && !t.out;
  }

  /** Nearest living enemy core to (x, z). */
  foeCore(team: number, x: number, z: number): Entity | undefined {
    let best: Entity | undefined;
    let bd = Infinity;
    for (let t = 0; t < this.teamCount; t++) {
      if (t === team || !this.standing(t)) continue;
      const c = this.core(t);
      if (!c?.alive) continue;
      const d = Math.hypot(c.transform.pos.x - x, c.transform.pos.z - z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /** The opposing team (2-team) or the team owning the nearest enemy core (FFA). */
  rival(team: number): number {
    if (this.teamCount === 2) return 1 - team;
    const own = this.core(team);
    const c = own ? this.foeCore(team, own.transform.pos.x, own.transform.pos.z) : undefined;
    return c ? c.team : (team + 1) % this.teamCount;
  }

  teamName(team: number): string {
    return TEAM_NAMES[team] ?? "NEUTRAL";
  }

  isSudden(): boolean {
    return this.match.phase === "sudden";
  }

  /**
   * War drums: 0 until suddenDeath.rampFrom seconds, rising to 1 at the end of regulation (1 in sudden death).
   * Sudden death's production / cost / soldier damage multipliers phase in by this much, so a match that's
   * dragging tips over before the bell instead of in it.
   */
  surge(): number {
    if (this.isSudden()) return 1;
    const from = this.data.match.suddenDeath.rampFrom;
    if (from === undefined || this.training || this.tdm) return 0;
    const end = this.matchLength;
    return end > from ? Math.max(0, Math.min(1, (this.time - from) / (end - from))) : 0;
  }

  /** Every home pad of `team` has one of its own finished buildings on it (needed for the keep shield to hold). */
  homeHeld(team: number): boolean {
    let n = 0;
    for (const p of this.pads) {
      if (p.zone !== "home" || p.side !== team) continue;
      n++;
      const s = p.structureId ? this.get(p.structureId) : undefined;
      if (!s?.alive || s.team !== team || !s.structure?.ready) return false;
    }
    return n > 0;
  }

  /**
   * Soldiers of a house with the upper hand march faster to join the fight (not while fighting): every enemy
   * champion down, or more of its champions standing than any rival.
   */
  marchMul(team: number): number {
    const m = this.data.units.advanceSpeedMul;
    if (!m || this.tdm) return 1;
    let mine = 0;
    let best = 0;
    const up = new Array(this.teamCount).fill(0);
    for (const p of this.players) {
      if (p.commander) continue;
      const e = this.getAny(p.heroId);
      if (e?.hero && !e.hero.dead && p.team >= 0 && p.team < this.teamCount) up[p.team]++;
    }
    mine = up[team] ?? 0;
    for (let t = 0; t < this.teamCount; t++) if (t !== team && this.standing(t)) best = Math.max(best, up[t]);
    return mine > best ? m : 1;
  }

  costMul(): number {
    return 1 + (this.data.match.suddenDeath.costMul - 1) * this.surge();
  }

  setDirective(team: number, type: UnitType | "all", dir: Directive, hero: Entity): void {
    match.setDirective(this, team, type, dir, hero);
  }

  eliminate(team: number, by: number): void {
    death.eliminate(this, team, by);
  }

  endMatch(winner: number, reason: string): void {
    match.endMatch(this, winner, reason);
  }

  makeTraining(): void {
    match.makeTraining(this);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Bases, banners & formations (world/bases.ts)
  // ---------------------------------------------------------------------------------------------------------------

  inBase(team: number, x: number, z: number): boolean {
    const i = this.nav.index(Math.floor(x), Math.floor(z));
    return i >= 0 && this.bases[team].mask[i] === 1;
  }

  defendPost(e: Entity): { post: Vec2; rank: number } {
    return bases.defendPost(this, e);
  }

  formationOffset(e: Entity, anchor: Vec2): { x: number; z: number; leash: number } | null {
    return bases.formationOffset(this, e, anchor);
  }

  rallyPoint(team: number): { x: number; z: number } | null {
    const b = this.teams[team].banner;
    return b && this.time < b.until ? { x: b.x, z: b.z } : null;
  }

  get bannerReach(): number {
    return this.data.heroes.heroes.herald?.hooks.commandAuraRadius ?? 6;
  }

  inBanner(e: Entity): boolean {
    const b = this.teams[e.team]?.banner;
    return (
      !!b && this.time < b.until && Math.hypot(e.transform.pos.x - b.x, e.transform.pos.z - b.z) <= this.bannerReach
    );
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Jump pads & morph (world/jumps.ts, world/morph.ts)
  // ---------------------------------------------------------------------------------------------------------------

  startJump(e: Entity, tx: number, tz: number, dur: number, peak: number): boolean {
    return jumps.startJump(this, e, tx, tz, dur, peak);
  }

  cancelJump(e: Entity): void {
    jumps.cancelJump(this, e);
  }

  initJumpPads(): void {
    jumps.initJumpPads(this);
  }

  morphState(e: Entity): "to" | "back" | null {
    return morph.morphState(this, e);
  }

  startMorph(e: Entity): void {
    morph.startMorph(this, e);
  }

  tickMorph(e: Entity): void {
    morph.tickMorph(this, e);
  }

  unmorph(e: Entity): void {
    morph.unmorph(this, e);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Economy (world/economy.ts, world/death.ts)
  // ---------------------------------------------------------------------------------------------------------------

  grainOf(team: number): number {
    return economy.grainOf(this, team);
  }

  incomeOf(team: number): number {
    return economy.incomeOf(this, team);
  }

  loseGold(team: number, amount: number, why: string): void {
    death.loseGold(this, team, amount, why);
  }

  rally(team: number): void {
    death.rally(this, team);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Combat (world/damage.ts, world/death.ts, world/projectiles.ts)
  // ---------------------------------------------------------------------------------------------------------------

  damageMulOf(src: Entity): number {
    return dmg.damageMulOf(this, src);
  }

  /** Apply one hit. Returns true if it connected (including shield/ward soaks), false on miss/parry/invuln. */
  damage(src: Entity | null, target: Entity, amount: number, opts: DamageOpts = {}): boolean {
    return dmg.damage(this, src, target, amount, opts);
  }

  outnumbered(e: Entity): boolean {
    return dmg.outnumbered(this, e);
  }

  lone(e: Entity): boolean {
    return dmg.lone(this, e);
  }

  heal(target: Entity, amount: number): void {
    dmg.heal(this, target, amount);
  }

  kill(target: Entity, src: Entity | null): void {
    death.kill(this, target, src);
  }

  promote(e: Entity, value: number): void {
    death.promote(this, e, value);
  }

  fireProjectile(
    src: Entity,
    target: Entity,
    damage: number,
    speed: number,
    ballistic: boolean,
    style: string,
    fromHeight: number,
    canMiss = true,
    splash?: Projectile["splash"],
    slow?: Projectile["slow"],
  ): void {
    shots.fireProjectile(this, src, target, damage, speed, ballistic, style, fromHeight, canMiss, splash, slow);
  }

  fireAtPoint(
    src: Entity,
    x: number,
    z: number,
    speed: number,
    style: string,
    fromHeight: number,
    splash?: Projectile["splash"],
    ballistic = false,
    burn?: Projectile["burn"],
  ): void {
    shots.fireAtPoint(this, src, x, z, speed, style, fromHeight, splash, ballistic, burn);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Vision & line of sight (world/vision.ts)
  // ---------------------------------------------------------------------------------------------------------------

  grassPatchAt(x: number, z: number): number {
    return vision.grassPatchAt(this, x, z);
  }

  sharesPatch(a: Entity, b: Entity): boolean {
    return vision.sharesPatch(this, a, b);
  }

  visibleTo(team: number, target: Entity): boolean {
    return vision.visibleTo(this, team, target);
  }

  spottedByAll(target: Entity): boolean {
    return vision.spottedByAll(this, target);
  }

  canSee(viewer: Entity, target: Entity): boolean {
    return vision.canSee(this, viewer, target);
  }

  rangeMul(attacker: Entity, target: Entity): number {
    return vision.rangeMul(this, attacker, target);
  }

  losHeight(x: number, z: number): number {
    return vision.losHeight(this, x, z);
  }

  los(a: Entity, b: Entity, tolerance: number, aHeight?: number): boolean {
    return vision.los(this, a, b, tolerance, aHeight);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Movement & pacing (world/movement.ts)
  // ---------------------------------------------------------------------------------------------------------------

  speedMul(e: Entity): number {
    return move.speedMul(this, e);
  }

  turf(e: Entity): "home" | "tower" | "enemyTower" | "field" {
    return move.turf(this, e);
  }

  calm(e: Entity): boolean {
    return move.calm(this, e);
  }

  pacingMul(e: Entity): number {
    return move.pacingMul(this, e);
  }

  slopeAt(x: number, z: number): number {
    return move.slopeAt(this, x, z);
  }

  canStand(e: Entity, x: number, z: number): boolean {
    return move.canStand(this, e, x, z);
  }

  nearestStandable(e: Entity, x: number, z: number): Vec2 | null {
    return move.nearestStandable(this, e, x, z);
  }

  moveBy(e: Entity, dx: number, dz: number): boolean {
    return move.moveBy(this, e, dx, dz);
  }

  faceToward(e: Entity, dx: number, dz: number, rate: number): void {
    move.faceToward(this, e, dx, dz, rate);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Terrain mods & tide (world/hazards.ts)
  // ---------------------------------------------------------------------------------------------------------------

  applyMod(m: TerrainMod): void {
    hazards.applyMod(this, m);
  }

  applyModIfOpen(m: TerrainMod): boolean {
    return hazards.applyModIfOpen(this, m);
  }

  tideLevel(time = this.time): number {
    return hazards.tideLevel(this, time);
  }
}
