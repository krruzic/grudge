// Arena: match-wide objectives and systems owned by World.arena. Per tick (step phase 4, Arena.update): the
// Grudge relic (pick up, carry to a tower/keep to enshrine it, steal it back), map cannon barrages, the neutral
// ogre, outpost unit waves, and shop bombs. Also hosts the shop (ward / bomb / cannon strike) used via commands.
// Implementation lives in src/sim/arena/*; this class holds the state and delegates.
import type { World } from "./world.ts";
import type { Entity, ShopItem, Vec2 } from "./types.ts";
import * as waves from "./arena/waves.ts";
import * as shrine from "./arena/relic.ts";
import * as shop from "./arena/shop.ts";
import { updateCannon } from "./arena/cannon.ts";
import { updateOgreSpawn } from "./arena/ogre.ts";

export { NEUTRAL, updateOgre } from "./arena/ogre.ts";

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

export class Arena {
  readonly home: Vec2;
  readonly relic: Relic;
  readonly shots: CannonShot[] = [];
  readonly bombs: Bomb[] = [];
  readonly thrown: ThrownBomb[] = [];
  nextCannon: number;
  nextOgre: number;
  nextWave: number;
  ogreId = 0;
  ogreRoute: { a: Vec2; b: Vec2; leg: number; waitUntil: number } | null = null;
  crackNoticeAt = -99;
  /** FFA keep guards: next respawn time per team. */
  guardAt: number[] = [];

  constructor(readonly w: World) {
    const cores = w.terrain.cores;
    if (w.teamCount > 2 && cores.length) {
      this.home = this.snap(
        cores.reduce((s, c) => s + c.x, 0) / cores.length,
        cores.reduce((s, c) => s + c.z, 0) / cores.length,
      );
    } else {
      const a = cores.find((c) => c.team === 0) ?? { x: w.terrain.width * 0.2, z: w.terrain.depth / 2 };
      const b = cores.find((c) => c.team === 1) ?? { x: w.terrain.width * 0.8, z: w.terrain.depth / 2 };
      this.home = this.snap((a.x + b.x) / 2, (a.z + b.z) / 2);
    }
    w.nav.setBlocked(this.home.x, this.home.z, 1.2, true);
    const cfg = w.data.match.arena;
    this.relic = {
      state: "waiting",
      x: this.home.x,
      z: this.home.z,
      y: w.groundY(this.home.x, this.home.z),
      carrier: 0,
      since: cfg.relic.firstSeconds,
      lockId: 0,
      lockUntil: 0,
      channel: 0,
      shrineId: 0,
      team: -1,
      stealer: 0,
    };
    this.nextCannon = cfg.cannon.firstSeconds;
    this.nextOgre = cfg.ogre.firstSeconds;
    this.nextWave = w.data.units.waves.firstSeconds;
  }

  /** Nearest open nav cell centre to (x, z) (or the point itself if none within 8). */
  snap(x: number, z: number): Vec2 {
    const nav = this.w.nav;
    const i = nav.nearestOpen(x, z, 8);
    if (i < 0) return { x, z };
    return { x: (i % nav.w) + 0.5, z: Math.floor(i / nav.w) + 0.5 };
  }

  carrying(e: Entity): boolean {
    return this.relic.state === "carried" && this.relic.carrier === e.id;
  }

  update(): void {
    if (!this.w.training) {
      shrine.updateRelic(this);
      updateCannon(this);
      updateOgreSpawn(this);
    }
    waves.updateWaves(this);
    shop.updateBombs(this);
  }

  spawnInterval(o: Entity): number {
    return waves.spawnInterval(this, o);
  }

  unitLost(u: Entity): void {
    waves.unitLost(this, u);
  }

  drop(from: Entity | null, x: number, z: number): void {
    shrine.drop(this, from, x, z);
  }

  isTowerOrKeep(o: Entity): boolean {
    return shrine.isTowerOrKeep(this, o);
  }

  shrineOf(team: number): Entity | null {
    return shrine.shrineOf(this, team);
  }

  heldBy(team: number): boolean {
    return shrine.heldBy(this, team);
  }

  towerBoost(e: Entity): { damage: number; range: number } {
    return shrine.towerBoost(this, e);
  }

  inShop(e: Entity): boolean {
    return shop.inShop(this, e);
  }

  buy(hero: Entity, item: ShopItem, aimAt?: Vec2): boolean {
    return shop.buy(this, hero, item, aimAt);
  }

  fireStrike(hero: Entity, x: number, z: number): boolean {
    return shop.fireStrike(this, hero, x, z);
  }

  throwBomb(e: Entity, tx: number, tz: number): void {
    shop.throwBomb(this, e, tx, tz);
  }
}
