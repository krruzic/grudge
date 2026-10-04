// MapEvents: per-map scripted hazards and objectives, owned by World.mapEvents and updated in step phase 5 (plus
// enforceLock in phase 6). Each map enables a subset via its JSON:
//   lockdown   opening lock: castle gates walled shut and teams confined to their bases until lockUntil
//   gates      two alternating gate sets that open/close on a timer (shoals-style)
//   mist       a fog bank rolling across water cells that hides entities inside it
//   lantern    a ghost lantern rising from a pit; the hero who grabs it is "haunted" (damage/speed buff)
//   avalanche  horns that, when captured, send an avalanche down one of four rotated lanes (frostcross)
//   fountain   a healing fountain
//   geysers    cider wells that erupt in turn and fling whoever stands on them (russet hollow)
//   serpent    a dune serpent circling the sand sea, breaching on a timer and hunting the Grudge carrier
// Implementation per feature lives in src/sim/mapEvents/*; this class holds the state and delegates.
import { Kind } from "./terrain.ts";
import type { World } from "./world.ts";
import type { Entity } from "./types.ts";
import * as lock from "./mapEvents/lockdown.ts";
import * as mists from "./mapEvents/mist.ts";
import { buildLock, updateLock, type LockGate } from "./mapEvents/lockdown.ts";
import { applyGates, gateSlots, updateGates, type GateSlot, type GatesDef } from "./mapEvents/gates.ts";
import { updateMist, type MistDef } from "./mapEvents/mist.ts";
import { findPits, updateLantern, type Lantern, type LanternDef } from "./mapEvents/lantern.ts";
import { geyserWells, updateGeysers, type GeyserWell, type GeysersDef } from "./mapEvents/geysers.ts";
import { makeSerpent, updateSerpent, type Serpent, type SerpentDef } from "./mapEvents/serpent.ts";
import {
  avalancheLanes,
  updateAvalanche,
  updateHorns,
  type AvalancheDef,
  type Lane,
  type Slide,
} from "./mapEvents/avalanche.ts";

export { gateSlots } from "./mapEvents/gates.ts";
export type { GateSlot, GatesDef } from "./mapEvents/gates.ts";
export type { LockGate } from "./mapEvents/lockdown.ts";
export type { AvalancheDef, Lane } from "./mapEvents/avalanche.ts";
export type { MistDef } from "./mapEvents/mist.ts";
export type { Lantern, LanternDef } from "./mapEvents/lantern.ts";

export interface FountainDef {
  x: number;
  z: number;
  r: number;
  heal: number;
}

export type { GeysersDef, GeyserWell } from "./mapEvents/geysers.ts";
export type { Serpent, SerpentDef } from "./mapEvents/serpent.ts";

export class MapEvents {
  // Cider wells (mapEvents/geysers.ts): the group that erupts next and when
  geysers?: GeysersDef;
  geyserWells: GeyserWell[] = [];
  geyserGroup: "a" | "b" = "a";
  geyserAt = Infinity;
  geyserWarned = false;
  // Dune serpent (mapEvents/serpent.ts)
  serpentDef?: SerpentDef;
  serpent: Serpent | null = null;
  // Avalanche + horns (mapEvents/avalanche.ts)
  av?: AvalancheDef;
  lanes: Lane[] = [];
  nextAt = Infinity;
  warned = false;
  arm = 0;
  slide: Slide | null = null;
  drifts: { cells: number[]; until: number }[] = [];

  // Timed gates (mapEvents/gates.ts); pattern selects which gate set is shut
  gates?: GatesDef;
  slots: { slot: GateSlot; cells: number[]; prev: number[] }[] = [];
  pattern = 0;
  gateAt = Infinity;
  gateWarned = false;
  fountain?: FountainDef;
  // Mist (mapEvents/mist.ts)
  readonly mist?: MistDef;
  mistMask: Uint8Array | null = null;
  mistStart = -Infinity;
  mistAt = Infinity;
  mistWarned = false;
  mistOn = false;
  // Ghost lantern (mapEvents/lantern.ts)
  readonly lanternDef?: LanternDef;
  lantern: Lantern | null = null;
  lanternAt = Infinity;
  lanternSeq = 0;
  pits: { x: number; z: number }[] = [];
  /** Avalanche horns, each replicated for the 4 rotations; `arms` are the lanes it can trigger. */
  horns: { x: number; z: number; arms: number[]; team: number; progress: number; readyAt: number }[] = [];
  readonly hornCapture = 3;
  readonly hornCooldown = 75;
  // Opening lockdown (mapEvents/lockdown.ts); lockZone[cell] = team base the cell belongs to, -1 outside
  lockGates: LockGate[] = [];
  lockUntil = 0;
  lockWarn = 0;
  lockWarned = false;
  lockZone: Int8Array | null = null;
  /** Last in-zone position per entity, used to undo zone crossings. */
  anchors = new Map<number, [number, number]>();
  shutNoticeAt = new Map<number, number>();

  get locked(): boolean {
    return this.lockZone !== null;
  }

  /** Lock zone (team) of a point while locked, else -1. */
  zoneAt(x: number, z: number): number {
    const m = this.lockZone;
    if (!m) return -1;
    const i = this.w.terrain.index(Math.floor(x), Math.floor(z));
    return i < 0 ? -1 : m[i];
  }

  /** True while locked if a and b are in different lock zones (blocks jumps, blinks, gravewalks...). */
  sealed(ax: number, az: number, bx: number, bz: number): boolean {
    return this.lockZone !== null && this.zoneAt(ax, az) !== this.zoneAt(bx, bz);
  }

  /** Teleports re-anchor the entity so enforceLock doesn't snap it back. */
  anchor(e: Entity): void {
    if (this.lockZone) this.anchors.set(e.id, [e.transform.pos.x, e.transform.pos.z]);
  }

  /** Rate-limited "gates are shut" notice for a hero that tried to cross. */
  shutNotice(e: Entity): void {
    if (!e.hero || this.w.time < (this.shutNoticeAt.get(e.id) ?? -99)) return;
    this.shutNoticeAt.set(e.id, this.w.time + 2.5);
    this.w.emit({
      type: "notice",
      team: e.team,
      text: `THE GATES ARE SHUT · ${Math.ceil(this.lockUntil - this.w.time)}S`,
    });
  }

  endLockdown(announce: boolean): void {
    lock.endLockdown(this, announce);
  }

  /** Run fn with lockdown gate cells temporarily walkable (used for path-connectivity checks). */
  withGatesOpen<T>(fn: () => T): T {
    if (!this.lockZone) return fn();
    const t = this.w.terrain;
    const all: number[] = [];
    for (const g of this.lockGates)
      g.cells.forEach((c, k) => {
        t.kinds[c] = g.prev[k];
        all.push(c);
      });
    this.w.nav.recompute(all);
    try {
      return fn();
    } finally {
      for (const c of all) t.kinds[c] = Kind.Wall;
      this.w.nav.recompute(all);
    }
  }

  enforceLock(): void {
    lock.enforceLock(this);
  }

  constructor(readonly w: World) {
    const ld = w.data.match.lockdown;
    if (ld && ld.seconds > 0) buildLock(this, ld.seconds, ld.warnSeconds ?? 5);
    this.mist = w.terrain.mist as MistDef | undefined;
    if (this.mist) {
      const t = w.terrain;
      const m = new Uint8Array(t.width * t.depth);
      const p = this.mist.pad;
      for (let z = 0; z < t.depth; z++)
        for (let x = 0; x < t.width; x++) {
          const k = t.kinds[z * t.width + x];
          if (k !== Kind.Water && k !== Kind.Ford && k !== Kind.Bridge) continue;
          if (x < (this.mist.x0 ?? 0) || x >= (this.mist.x1 ?? t.width)) continue;
          for (let dz = -p; dz <= p; dz++)
            for (let dx = -p; dx <= p; dx++) {
              const xx = x + dx;
              const zz = z + dz;
              if (xx >= 0 && zz >= 0 && xx < t.width && zz < t.depth && dx * dx + dz * dz <= p * p + 1)
                m[zz * t.width + xx] = 1;
            }
        }
      this.mistMask = m;
      this.mistAt = this.mist.firstSeconds;
    }
    this.lanternDef = w.terrain.lantern as LanternDef | undefined;
    if (this.lanternDef) {
      this.lanternAt = this.lanternDef.firstSeconds;
      this.pits = findPits(this);
    }
    this.fountain = w.terrain.fountain as FountainDef | undefined;
    this.geysers = w.terrain.geysers as GeysersDef | undefined;
    if (this.geysers) {
      this.geyserWells = geyserWells(this, this.geysers);
      this.geyserAt = this.geysers.firstSeconds;
    }
    this.serpentDef = w.terrain.serpent as SerpentDef | undefined;
    if (this.serpentDef) this.serpent = makeSerpent(this, this.serpentDef);
    this.gates = w.terrain.gates as GatesDef | undefined;
    if (this.gates) {
      const t = w.terrain;
      for (const slot of gateSlots(w, this.gates)) {
        const cells: number[] = [];
        if (slot.cells) {
          for (const [x, z] of slot.cells) {
            const i = t.index(x, z);
            if (i >= 0) cells.push(i);
          }
        } else
          for (let z = slot.z; z < slot.z + slot.h; z++)
            for (let x = slot.x; x < slot.x + slot.w; x++) {
              const i = t.index(x, z);
              if (i >= 0) cells.push(i);
            }
        this.slots.push({ slot, cells, prev: cells.map((c) => t.kinds[c]) });
      }
      applyGates(this, false);
      this.gateAt = this.gates.firstSeconds;
    }
    this.av = w.terrain.avalanche as AvalancheDef | undefined;
    const hd = w.terrain.horns as { x: number; z: number; arms: number[] }[] | undefined;
    if (hd && this.av) {
      const D = w.terrain.depth;
      for (const h of hd) {
        let x = h.x;
        let z = h.z;
        for (let k = 0; k < 4; k++) {
          this.horns.push({ x, z, arms: h.arms.map((a) => (a + k) % 4), team: -1, progress: 0, readyAt: 30 });
          [x, z] = [D - z, x];
        }
      }
    }
    if (this.av) {
      this.lanes = avalancheLanes(w, this.av);
      this.nextAt = this.av.firstSeconds;
    }
  }

  get avalancheNow(): { lane: Lane; stage: "warn" | "slide"; k: number } | null {
    const av = this.av;
    if (!av) return null;
    const t = this.w.time;
    if (this.slide)
      return { lane: this.slide.lane, stage: "slide", k: Math.min(1, (t - this.slide.start) / av.sweepSeconds) };
    if (this.warned) return { lane: this.lanes[this.arm], stage: "warn", k: 1 - (this.nextAt - t) / av.warnSeconds };
    return null;
  }

  get gateList(): { slot: GateSlot; shut: boolean }[] {
    return this.slots.map((g) => ({ slot: g.slot, shut: this.closed(g.slot.set) }));
  }

  get pendingArm(): { arm: number; at: number } | null {
    return this.av ? { arm: this.arm, at: this.nextAt } : null;
  }

  misted(x: number, z: number): boolean {
    return mists.misted(this, x, z);
  }

  mistBand(time: number): [number, number] {
    return mists.mistBand(this, time);
  }

  /** Lantern haunt buff multiplier for damage or speed. */
  hauntMul(e: { status: { hauntUntil?: number } }, kind: "damage" | "speed"): number {
    const d = this.lanternDef;
    if (!d || !(this.w.time < (e.status.hauntUntil ?? 0))) return 1;
    return kind === "damage" ? d.damageMul : d.speedMul;
  }

  update(): void {
    if (this.lockZone) updateLock(this);
    if (this.av && this.horns.length) updateHorns(this, this.av);
    if (this.mist) updateMist(this, this.mist);
    if (this.lanternDef) updateLantern(this, this.lanternDef);
    if (this.av) updateAvalanche(this, this.av);
    if (this.gates) updateGates(this, this.gates);
    if (this.geysers) updateGeysers(this, this.geysers);
    if (this.serpentDef) updateSerpent(this, this.serpentDef);
    if (this.fountain && this.w.tick % 6 === 0) this.updateFountain(this.fountain);
  }

  /** Whether gate set a/b is currently shut. */
  closed(set: "a" | "b"): boolean {
    return (set === "a") === (this.pattern === 1);
  }

  private updateFountain(f: FountainDef): void {
    const w = this.w;
    const dt = w.dt * 6;
    for (const e of w.entities) {
      if (!e.alive || !e.hero || e.hp >= e.maxHp) continue;
      if (Math.hypot(e.transform.pos.x - f.x, e.transform.pos.z - f.z) > f.r) continue;
      w.heal(e, f.heal * dt);
    }
  }
}
