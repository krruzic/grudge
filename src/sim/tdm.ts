// Team deathmatch (map mode "tdm", see tdmMap): two teams of up to four champions, no bases, pads, army or
// economy. World.tdm owns the mode's rules; World calls in at these points:
//   update()        per tick after the arena: power-up pickups/respawns, the Grudge's carrier buff, chaos events
//   onHeroKill()    a champion died: kill/death tally, the kill limit, sudden death's next-kill-wins
//   respawnSpot()   where a dead champion comes back (a random "safe" spot: far from living enemies)
//   updateClock()   regulation time -> sudden death (next kill wins) instead of the core tiebreaks
// The Grudge still wakes in the middle; whoever carries it is stronger (more damage, less damage taken, a little
// faster, slow regen) and can still fight; it drops on death. Everything random goes through World.rng.
import type { World } from "./world.ts";
import type { Entity, Vec2 } from "./types.ts";
import { gainXp } from "./talents.ts";

export type PowerKind = "potion" | "might" | "haste" | "shield";

export interface PowerUp {
  id: number;
  kind: PowerKind;
  x: number;
  z: number;
  y: number;
  /** Ready to take from this time (Infinity: a one-off that has been taken). */
  readyAt: number;
  /** One-off drop (potion rain): removed once taken. */
  temp?: boolean;
}

export type ChaosKind = "cannon" | "ogre" | "bloodmoon" | "potions" | "winds";

export interface TdmConfig {
  killLimit: number;
  matchSeconds: number;
  respawnSeconds: number;
  spawnInvuln: number;
  /** Respawn spots try to stay at least this far from every living enemy champion. */
  safeDistance: number;
  relicFirstSeconds: number;
  /** FFA deathmatch only: per-champion hp / speed / damage multipliers (World.dmMod). */
  ffaHeroMods?: Record<string, { hp?: number; speed?: number; damage?: number }>;
  /** Seconds a champion may carry the Grudge before it returns to the middle (asleep relicRewakeSeconds). */
  relicCarrySeconds?: number;
  relicRewakeSeconds?: number;
  relic: { damageMul: number; takenMul: number; speedMul: number; regen: number };
  powerups: {
    count: number;
    respawnSeconds: number;
    potionHeal: number;
    mightMul: number;
    mightSeconds: number;
    hasteMul: number;
    hasteSeconds: number;
    shield: number;
    shieldSeconds: number;
    killXp?: number;
  };
  chaos: { firstSeconds: number; everySeconds: number; bloodMul: number; seconds: number; rain: number };
}

const KINDS: PowerKind[] = ["potion", "might", "potion", "haste", "potion", "shield"];
const CHAOS: ChaosKind[] = ["cannon", "ogre", "bloodmoon", "potions", "winds"];
const CHAOS_TEXT: Record<ChaosKind, string> = {
  cannon: "CHAOS · CANNON BARRAGE",
  ogre: "CHAOS · THE OGRE WAKES",
  bloodmoon: "CHAOS · BLOOD MOON · ALL DAMAGE UP",
  potions: "CHAOS · POTION RAIN",
  winds: "CHAOS · SWIFT WINDS",
};

/** How long a callout steers the house's CPUs. */
const CALLOUT_SECONDS = 12;

export class Tdm {
  readonly cfg: TdmConfig;
  /** Kills per team (the score), and per champion entity id. */
  readonly score: number[];
  readonly kills = new Map<number, number>();
  /** Per team: the spot a human called its CPUs to push (callout()), until `until`. */
  readonly callouts = new Map<number, { x: number; z: number; until: number }>();
  readonly deaths = new Map<number, number>();
  readonly powerups: PowerUp[] = [];
  /** Scoreboard extras per team: seconds the Grudge was carried, power-ups taken. */
  readonly held: number[];
  readonly taken: number[];
  /** Per champion id: power-up effects running until these times. */
  readonly might = new Map<number, number>();
  readonly haste = new Map<number, number>();
  chaos: ChaosKind | null = null;
  chaosUntil = 0;
  nextChaos: number;
  private nextId = 1;
  private lastChaos: ChaosKind | null = null;
  private armed = { cannon: false, ogre: false };

  constructor(readonly w: World) {
    this.cfg = w.data.match.tdm as TdmConfig;
    this.score = Array.from({ length: w.teamCount }, () => 0);
    this.held = Array.from({ length: w.teamCount }, () => 0);
    this.taken = Array.from({ length: w.teamCount }, () => 0);
    this.nextChaos = this.cfg.chaos.firstSeconds;
    // Map cannon and ogre only come as chaos events here.
    w.arena.nextCannon = Infinity;
    w.arena.nextOgre = Infinity;
    w.arena.relic.since = this.cfg.relicFirstSeconds;
    this.placePowerups();
  }

  get limit(): number {
    return this.cfg.killLimit;
  }

  // ── Callouts ──

  /**
   * A human flicked the C-stick: their house's CPUs push toward a point 18 m that way (clamped to the field) for
   * CALLOUT_SECONDS, picking fights near it (bot/think.ts tdmPrey / tdmRoam).
   */
  callout(e: Entity, dx: number, dz: number): void {
    const w = this.w;
    const l = Math.hypot(dx, dz);
    if (l < 0.1 || w.players.filter((p) => p.team === e.team).length < 2) return;
    const t = w.terrain;
    const x = Math.max(2, Math.min(t.width - 2, e.transform.pos.x + (dx / l) * 18));
    const z = Math.max(2, Math.min(t.depth - 2, e.transform.pos.z + (dz / l) * 18));
    this.callouts.set(e.team, { x, z, until: w.time + CALLOUT_SECONDS });
    const p = e.hero ? `P${e.hero.player + 1}` : "";
    const dir = ["EAST", "SOUTH-EAST", "SOUTH", "SOUTH-WEST", "WEST", "NORTH-WEST", "NORTH", "NORTH-EAST"][
      (Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) + 8) % 8
    ];
    w.emit({ type: "notice", team: e.team, text: `${p}: PUSH ${dir}!` });
    w.emit({ type: "ping", team: e.team, x, y: w.groundY(x, z), z });
  }

  /** The team's active callout point, if any. */
  calloutOf(team: number): Vec2 | null {
    const c = this.callouts.get(team);
    return c && this.w.time < c.until ? { x: c.x, z: c.z } : null;
  }

  // ── Power-ups ──

  /**
   * Spread `count` power-up spots over the walkable map: farthest-point sampling from the map centre over open,
   * flat, reachable cells (so they end up in corners, on ledges and in side rooms as well as the open).
   */
  private placePowerups(): void {
    const w = this.w;
    const nav = w.nav;
    const t = w.terrain;
    const home = w.arena.home;
    const start = w.spawnPoint(0);
    const cand: Vec2[] = [];
    for (let z = 3; z < t.depth - 3; z += 2)
      for (let x = 3; x < t.width - 3; x += 2) {
        const i = nav.index(x, z);
        if (!nav.open(i) || w.terrain.slopeAt(x + 0.5, z + 0.5) > 0.35) continue;
        // Reachable on foot from where champions spawn (the map centre can be a fountain or a walled court only
        // jump pads reach, e.g. Gardens - sampling "reachable from the centre" put every spot in there).
        if (!nav.reachable(start, { x: x + 0.5, z: z + 0.5 })) continue;
        cand.push({ x: x + 0.5, z: z + 0.5 });
      }
    if (!cand.length) return;
    const picked: Vec2[] = [];
    const dist = cand.map((c) => Math.hypot(c.x - home.x, c.z - home.z) * 0.5);
    for (let n = 0; n < this.cfg.powerups.count; n++) {
      let bi = 0;
      for (let i = 1; i < cand.length; i++) if (dist[i] > dist[bi]) bi = i;
      const p = cand[bi];
      picked.push(p);
      for (let i = 0; i < cand.length; i++) dist[i] = Math.min(dist[i], Math.hypot(cand[i].x - p.x, cand[i].z - p.z));
    }
    picked.forEach((p, i) => this.addPowerup(KINDS[i % KINDS.length], p.x, p.z, 8 + i * 2));
  }

  private addPowerup(kind: PowerKind, x: number, z: number, readyAt: number, temp = false): PowerUp {
    const p: PowerUp = { id: this.nextId++, kind, x, z, y: this.w.groundY(x, z), readyAt, temp };
    this.powerups.push(p);
    return p;
  }

  private take(e: Entity, p: PowerUp): void {
    const w = this.w;
    const c = this.cfg.powerups;
    if (p.kind === "potion") w.heal(e, e.maxHp * c.potionHeal);
    else if (p.kind === "might") this.might.set(e.id, w.time + c.mightSeconds);
    else if (p.kind === "haste") this.haste.set(e.id, w.time + c.hasteSeconds);
    else {
      e.status.shield = Math.max(e.status.shield, c.shield);
      e.status.shieldUntil = w.time + c.shieldSeconds;
    }
    w.emit({ type: "powerup", stage: "take", id: p.id, kind: p.kind, x: p.x, y: p.y, z: p.z, by: e.id });
    if (this.taken[e.team] !== undefined) this.taken[e.team]++;
    if (p.temp) this.powerups.splice(this.powerups.indexOf(p), 1);
    else p.readyAt = w.time + c.respawnSeconds;
  }

  // ── Tick ──

  update(): void {
    const w = this.w;
    // Power-ups: (re)appear, then the first living champion touching a ready one takes it.
    for (const p of this.powerups.slice()) {
      if (w.time < p.readyAt) continue;
      if (w.time - w.dt < p.readyAt)
        w.emit({ type: "powerup", stage: "spawn", id: p.id, kind: p.kind, x: p.x, y: p.y, z: p.z, by: 0 });
      for (const e of w.entities) {
        if (!e.alive || !e.hero || e.hero.dead || e.hero.jump) continue;
        if (Math.hypot(e.transform.pos.x - p.x, e.transform.pos.z - p.z) > 1.1) continue;
        if (p.kind === "potion" && e.hp >= e.maxHp) continue;
        this.take(e, p);
        break;
      }
    }
    this.buffs();
    this.updateChaos();
  }

  /** Grudge carrier, might / haste and blood moon multipliers, recomputed every tick into the status fields. */
  private buffs(): void {
    const w = this.w;
    const r = this.cfg.relic;
    const blood = this.chaos === "bloodmoon" && w.time < this.chaosUntil ? this.cfg.chaos.bloodMul : 1;
    const winds = this.chaos === "winds" && w.time < this.chaosUntil;
    for (const e of w.entities) {
      if (!e.alive || !e.hero) continue;
      const st = e.status;
      const carry = w.arena.carrying(e);
      const might = (this.might.get(e.id) ?? 0) > w.time;
      const haste = winds || (this.haste.get(e.id) ?? 0) > w.time;
      st.powerDamageMul = (carry ? r.damageMul : 1) * (might ? this.cfg.powerups.mightMul : 1) * blood;
      st.powerSpeedMul = (carry ? r.speedMul : 1) * (haste ? this.cfg.powerups.hasteMul : 1);
      st.powerTakenMul = carry ? r.takenMul : 1;
      if (carry && e.hp < e.maxHp) w.heal(e, r.regen * w.dt);
      if (carry && this.held[e.team] !== undefined) this.held[e.team] += w.dt;
    }
  }

  // ── Chaos events ──

  private updateChaos(): void {
    const w = this.w;
    const a = w.arena;
    // Cannon and ogre are the arena's own systems, only allowed to run when a chaos event armed them.
    if (this.armed.cannon && a.nextCannon > w.time) this.armed.cannon = false;
    if (!this.armed.cannon) a.nextCannon = Infinity;
    if (this.armed.ogre && a.ogreId) this.armed.ogre = false;
    if (!this.armed.ogre) a.nextOgre = Infinity;
    if (this.chaos && w.time >= this.chaosUntil) this.chaos = null;
    if (w.time < this.nextChaos || w.match.phase === "over") return;
    this.nextChaos = w.time + this.cfg.chaos.everySeconds;
    const ogreUp = !!(a.ogreId && w.get(a.ogreId)?.alive);
    const pool = CHAOS.filter((k) => k !== this.lastChaos && !(k === "ogre" && ogreUp));
    const kind = pool[Math.floor(w.rng() * pool.length)];
    this.lastChaos = kind;
    w.emit({ type: "notice", team: -1, text: CHAOS_TEXT[kind] });
    w.emit({ type: "chaos", kind });
    if (kind === "cannon") {
      this.armed.cannon = true;
      a.nextCannon = w.time;
    } else if (kind === "ogre") {
      this.armed.ogre = true;
      a.nextOgre = w.time;
    } else if (kind === "potions") {
      for (let i = 0; i < this.cfg.chaos.rain; i++) {
        const p = this.randomSpot(-1, 0);
        this.addPowerup("potion", p.x, p.z, w.time + 0.5 + i * 0.15, true);
      }
    } else {
      this.chaos = kind;
      this.chaosUntil = w.time + this.cfg.chaos.seconds;
    }
  }

  // ── Kills, respawns, the clock ──

  onHeroKill(target: Entity, src: Entity | null): void {
    const w = this.w;
    this.deaths.set(target.id, (this.deaths.get(target.id) ?? 0) + 1);
    this.might.delete(target.id);
    this.haste.delete(target.id);
    const team = src && src.team !== target.team && src.team >= 0 ? src.team : w.teamCount === 2 ? 1 - target.team : -1;
    target.hero!.respawnAt = w.time + this.cfg.respawnSeconds;
    if (team < 0 || team >= w.teamCount) return;
    this.score[team]++;
    const owner = src?.hero ? src : src?.owner !== undefined ? w.getAny(src.owner) : undefined;
    if (owner?.hero && owner.team === team) {
      this.kills.set(owner.id, (this.kills.get(owner.id) ?? 0) + 1);
      if (this.cfg.powerups.killXp) gainXp(w, owner, this.cfg.powerups.killXp);
    }
    if (this.score[team] >= this.limit) w.endMatch(team, "kill limit");
    else if (w.match.phase === "sudden" && this.score.every((s, t) => t === team || s < this.score[team]))
      w.endMatch(team, "sudden death");
  }

  updateClock(): void {
    const w = this.w;
    if (w.training || w.match.phase !== "play" || w.time < this.cfg.matchSeconds) return;
    const top = Math.max(...this.score);
    const leaders = this.score.flatMap((s, t) => (s === top ? [t] : []));
    if (leaders.length === 1) w.endMatch(leaders[0], "most kills");
    else {
      w.match.phase = "sudden";
      w.emit({ type: "notice", team: -1, text: "SUDDEN DEATH · NEXT KILL WINS" });
    }
  }

  /**
   * Somewhere for a hurt bot to run: the power-up spot (any, ready or not) farthest from its nearest living enemy.
   * Deterministic and RNG-free (bots must not consume World.rng).
   */
  safeFrom(me: Entity): Vec2 {
    const w = this.w;
    let best: Vec2 = w.arena.home;
    let room = -1;
    for (const p of this.powerups) {
      let near = Infinity;
      for (const e of w.entities)
        if (e.alive && e.hero && !e.hero.dead && e.team !== me.team)
          near = Math.min(near, Math.hypot(e.transform.pos.x - p.x, e.transform.pos.z - p.z));
      const d = near - Math.hypot(me.transform.pos.x - p.x, me.transform.pos.z - p.z) * 0.3;
      if (d > room) {
        room = d;
        best = { x: p.x, z: p.z };
      }
    }
    return best;
  }

  /** A respawn spot for `team`: random open spots, keeping the one farthest from living enemy champions. */
  respawnSpot(team: number): Vec2 {
    return this.randomSpot(team, this.cfg.safeDistance);
  }

  /**
   * `tries` random reachable cells; the first at least `safe` m from every living enemy champion wins, else the
   * one with the most room. team -1 = anyone counts as an enemy.
   */
  randomSpot(team: number, safe: number, tries = 24): Vec2 {
    const w = this.w;
    const nav = w.nav;
    const t = w.terrain;
    // Reachable from a map spawn, not the centre: the centre can be a walled court only jump pads reach (Gardens),
    // and then every try failed and everyone came back in the middle of the fight.
    const start = w.spawnPoint(0);
    let best: Vec2 = start;
    let bestRoom = -1;
    for (let k = 0; k < tries; k++) {
      const x = 2 + Math.floor(w.rng() * (t.width - 4));
      const z = 2 + Math.floor(w.rng() * (t.depth - 4));
      const i = nav.nearestOpen(x, z, 4);
      if (i < 0) continue;
      const p = { x: (i % nav.w) + 0.5, z: Math.floor(i / nav.w) + 0.5 };
      if (!nav.reachable(start, p)) continue;
      let room = Infinity;
      for (const e of w.entities)
        if (e.alive && e.hero && !e.hero.dead && (team < 0 || e.team !== team))
          room = Math.min(room, Math.hypot(e.transform.pos.x - p.x, e.transform.pos.z - p.z));
      if (room >= safe) return p;
      if (room > bestRoom) {
        bestRoom = room;
        best = p;
      }
    }
    return best;
  }
}

/**
 * A base map turned into a deathmatch arena: `houses` teams (2 for team deathmatch, 8 for FFA deathmatch), no
 * keeps, tower pads, outposts or army; the map's own events, jump pads and spawns stay (houses without one start
 * at a random safe spot).
 */
export function tdmMap<T extends { teams?: number; cores: unknown[]; pads: unknown[]; spawns: { team?: number }[] }>(
  m: T,
  houses = 2,
): T {
  return {
    ...m,
    mode: "tdm",
    teams: houses,
    cores: [],
    pads: [],
    outposts: false,
    spawns: m.spawns.filter((s) => (s.team ?? 0) < houses),
  };
}
