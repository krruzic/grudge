import { Kind, type Rect } from "./terrain.ts";
import type { World } from "./world.ts";

export interface AvalancheDef {
  firstSeconds: number;
  everySeconds: number;
  warnSeconds: number;
  sweepSeconds: number;
  driftSeconds: number;
  lane: Rect;
  from: "n" | "s" | "w" | "e";
  heroDamage: number;
  unitDamage: number;
  knock: number;
}

export interface Lane {
  rect: Rect;
  dx: number;
  dz: number;
}

interface Slide {
  lane: Lane;
  arm: number;
  start: number;
  hit: Set<number>;
}

export interface GateSlot extends Rect {
  set: "a" | "b";
}

export interface GatesDef {
  firstSeconds: number;
  everySeconds: number;
  warnSeconds: number;
  slots: GateSlot[];
}

export interface FountainDef {
  x: number;
  z: number;
  r: number;
  heal: number;
}

export function gateSlots(w: World, def: GatesDef): GateSlot[] {
  const D = w.terrain.depth;
  const out: GateSlot[] = [];
  for (const s of def.slots) {
    let r: GateSlot = { ...s };
    for (let k = 0; k < 4; k++) {
      out.push({ ...r });
      r = { ...r, x: D - r.z - r.h, z: r.x, w: r.h, h: r.w };
    }
  }
  return out;
}

const DIRS: Record<AvalancheDef["from"], [number, number]> = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };

export function avalancheLanes(w: World, def: AvalancheDef): Lane[] {
  const D = w.terrain.depth;
  const out: Lane[] = [];
  let r = { ...def.lane };
  let [dx, dz] = DIRS[def.from];
  for (let k = 0; k < 4; k++) {
    out.push({ rect: { ...r }, dx, dz });
    r = { x: D - r.z - r.h, z: r.x, w: r.h, h: r.w };
    [dx, dz] = [-dz, dx];
  }
  return out;
}

export class MapEvents {
  private av?: AvalancheDef;
  private lanes: Lane[] = [];
  private nextAt = Infinity;
  private warned = false;
  private arm = 0;
  private slide: Slide | null = null;
  private drifts: { cells: number[]; until: number }[] = [];

  private gates?: GatesDef;
  private slots: { slot: GateSlot; cells: number[]; prev: number[] }[] = [];
  pattern = 0;
  private gateAt = Infinity;
  private gateWarned = false;
  private fountain?: FountainDef;

  constructor(private w: World) {
    this.fountain = w.terrain.fountain as FountainDef | undefined;
    this.gates = w.terrain.gates as GatesDef | undefined;
    if (this.gates) {
      const t = w.terrain;
      for (const slot of gateSlots(w, this.gates)) {
        const cells: number[] = [];
        for (let z = slot.z; z < slot.z + slot.h; z++) for (let x = slot.x; x < slot.x + slot.w; x++) {
          const i = t.index(x, z);
          if (i >= 0) cells.push(i);
        }
        this.slots.push({ slot, cells, prev: cells.map((c) => t.kinds[c]) });
      }
      this.applyGates(false);
      this.gateAt = this.gates.firstSeconds;
    }
    this.av = w.terrain.avalanche as AvalancheDef | undefined;
    if (this.av) {
      this.lanes = avalancheLanes(w, this.av);
      this.nextAt = this.av.firstSeconds;
    }
  }

  get pendingArm(): { arm: number; at: number } | null {
    return this.av ? { arm: this.arm, at: this.nextAt } : null;
  }

  update(): void {
    if (this.av) this.updateAvalanche(this.av);
    if (this.gates) this.updateGates(this.gates);
    if (this.fountain && this.w.tick % 6 === 0) this.updateFountain(this.fountain);
  }

  closed(set: "a" | "b"): boolean {
    return (set === "a") === (this.pattern === 1);
  }

  private applyGates(live: boolean): void {
    const w = this.w;
    const t = w.terrain;
    const all: number[] = [];
    for (const g of this.slots) {
      const shut = this.closed(g.slot.set);
      g.cells.forEach((c, k) => {
        if (shut) {
          t.kinds[c] = Kind.Wall;
          t.styles[c] = "gate";
        } else if (t.styles[c] === "gate") {
          t.kinds[c] = g.prev[k];
          t.styles[c] = "";
        }
        all.push(c);
      });
    }
    w.nav.recompute(all);
    if (!live) return;
    for (const e of w.entities) {
      if (!e.alive || e.structure) continue;
      const p = e.transform.pos;
      const i = t.index(Math.floor(p.x), Math.floor(p.z));
      if (i < 0 || t.styles[i] !== "gate") continue;
      const o = w.nav.nearestOpen(p.x, p.z, 6);
      if (o >= 0) w.teleport(e, (o % w.nav.w) + 0.5, Math.floor(o / w.nav.w) + 0.5);
    }
    for (const e of w.entities) if (e.unit) e.unit.repathAt = 0;
  }

  private updateGates(g: GatesDef): void {
    const w = this.w;
    if (!this.gateWarned && w.time >= this.gateAt - g.warnSeconds) {
      this.gateWarned = true;
      w.emit({ type: "gates", stage: "warn", pattern: 1 - this.pattern, seconds: g.warnSeconds });
      w.emit({ type: "notice", team: -1, text: this.pattern === 0 ? "THE BELLS RING · THE COURT OPENS, THE OUTER GATES SEAL" : "THE BELLS RING · THE COURT SEALS, THE OUTER GATES OPEN" });
    }
    if (w.time < this.gateAt) return;
    this.pattern = 1 - this.pattern;
    this.applyGates(true);
    w.emit({ type: "gates", stage: "shift", pattern: this.pattern, seconds: g.everySeconds });
    this.gateAt = w.time + g.everySeconds;
    this.gateWarned = false;
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

  private updateAvalanche(av: AvalancheDef): void {
    const w = this.w;
    const lane = this.lanes[this.arm];
    if (!this.warned && w.time >= this.nextAt - av.warnSeconds) {
      this.warned = true;
      w.emit({ type: "avalanche", stage: "warn", arm: this.arm, rect: lane.rect, dx: lane.dx, dz: lane.dz, seconds: av.warnSeconds });
      w.emit({ type: "notice", team: -1, text: `RUMBLING ON THE ${["WEST", "NORTH", "EAST", "SOUTH"][this.arm]} ARM · AVALANCHE` });
    }
    if (!this.slide && w.time >= this.nextAt) {
      this.slide = { lane, arm: this.arm, start: w.time, hit: new Set() };
      w.emit({ type: "avalanche", stage: "slide", arm: this.arm, rect: lane.rect, dx: lane.dx, dz: lane.dz, seconds: av.sweepSeconds });
    }
    if (this.slide) this.sweep(av, this.slide);
    for (let i = this.drifts.length - 1; i >= 0; i--) {
      const d = this.drifts[i];
      if (w.time < d.until) continue;
      for (const c of d.cells) if (w.terrain.kinds[c] === Kind.Ford) w.terrain.kinds[c] = Kind.Ground;
      w.nav.recompute(d.cells);
      for (const e of w.entities) if (e.unit) e.unit.repathAt = 0;
      this.drifts.splice(i, 1);
    }
  }

  private sweep(av: AvalancheDef, s: Slide): void {
    const w = this.w;
    const { rect, dx, dz } = s.lane;
    const k = Math.min(1, (w.time - s.start) / av.sweepSeconds);
    const span = dx !== 0 ? rect.w : rect.h;
    const front = k * (span + 4) - 2;
    for (const e of w.entities) {
      if (!e.alive || e.structure || s.hit.has(e.id)) continue;
      const p = e.transform.pos;
      if (p.x < rect.x - 0.5 || p.x > rect.x + rect.w + 0.5 || p.z < rect.z - 0.5 || p.z > rect.z + rect.h + 0.5) continue;
      const along = dx > 0 ? p.x - rect.x : dx < 0 ? rect.x + rect.w - p.x : dz > 0 ? p.z - rect.z : rect.z + rect.h - p.z;
      if (along > front || along < front - 4) continue;
      s.hit.add(e.id);
      const dmg = e.hero ? av.heroDamage : e.maxHp * av.unitDamage;
      w.damage(null, e, dmg, { fromX: p.x - dx * 2, fromZ: p.z - dz * 2, knockback: av.knock, slowMul: 0.55, slowSeconds: 2.5, big: true });
    }
    if (k < 1) return;
    const cells: number[] = [];
    const t = w.terrain;
    for (let z = rect.z; z < rect.z + rect.h; z++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = t.index(x, z);
        if (i >= 0 && t.kinds[i] === Kind.Ground) {
          t.kinds[i] = Kind.Ford;
          cells.push(i);
        }
      }
    }
    w.nav.recompute(cells);
    for (const e of w.entities) if (e.unit) e.unit.repathAt = 0;
    this.drifts.push({ cells, until: w.time + av.driftSeconds });
    w.emit({ type: "avalanche", stage: "settle", arm: s.arm, rect, dx, dz, seconds: av.driftSeconds });
    this.slide = null;
    this.warned = false;
    this.arm = (this.arm + 1) % 4;
    this.nextAt = w.time + av.everySeconds;
  }
}
