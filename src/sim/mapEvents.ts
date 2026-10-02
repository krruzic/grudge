import { Kind, type Rect } from "./terrain.ts";
import type { World } from "./world.ts";
import type { Entity } from "./types.ts";

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
  cells?: [number, number][];
  line?: [number, number, number, number];
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
      r = {
        ...r, x: D - r.z - r.h, z: r.x, w: r.h, h: r.w,
        cells: r.cells?.map(([x, z]) => [D - 1 - z, x] as [number, number]),
        line: r.line ? [D - r.line[1], r.line[0], D - r.line[3], r.line[2]] : undefined,
      };
    }
  }
  return out;
}

export interface MistDef {
  firstSeconds: number;
  everySeconds: number;
  warnSeconds: number;
  rollSeconds: number;
  holdSeconds: number;
  pad: number;
  x0?: number;
  x1?: number;
}

export interface LanternDef {
  firstSeconds: number;
  everySeconds: number;
  riseSeconds: number;
  speed: number;
  restSeconds: number;
  spots: { x: number; z: number }[];
  hauntSeconds: number;
  damageMul: number;
  speedMul: number;
}

export interface Lantern {
  state: "rise" | "drift" | "rest";
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  tx: number;
  tz: number;
  start: number;
  id: number;
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
  lanes: Lane[] = [];
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
  readonly mist?: MistDef;
  mistMask: Uint8Array | null = null;
  mistStart = -Infinity;
  private mistAt = Infinity;
  private mistWarned = false;
  private mistOn = false;
  readonly lanternDef?: LanternDef;
  lantern: Lantern | null = null;
  private lanternAt = Infinity;
  private lanternSeq = 0;
  private pits: { x: number; z: number }[] = [];
  horns: { x: number; z: number; arms: number[]; team: number; progress: number; readyAt: number }[] = [];
  readonly hornCapture = 3;
  readonly hornCooldown = 75;

  constructor(private w: World) {
    this.mist = w.terrain.mist as MistDef | undefined;
    if (this.mist) {
      const t = w.terrain;
      const m = new Uint8Array(t.width * t.depth);
      const p = this.mist.pad;
      for (let z = 0; z < t.depth; z++) for (let x = 0; x < t.width; x++) {
        const k = t.kinds[z * t.width + x];
        if (k !== Kind.Water && k !== Kind.Ford && k !== Kind.Bridge) continue;
        if (x < (this.mist.x0 ?? 0) || x >= (this.mist.x1 ?? t.width)) continue;
        for (let dz = -p; dz <= p; dz++) for (let dx = -p; dx <= p; dx++) {
          const xx = x + dx;
          const zz = z + dz;
          if (xx >= 0 && zz >= 0 && xx < t.width && zz < t.depth && dx * dx + dz * dz <= p * p + 1) m[zz * t.width + xx] = 1;
        }
      }
      this.mistMask = m;
      this.mistAt = this.mist.firstSeconds;
    }
    this.lanternDef = w.terrain.lantern as LanternDef | undefined;
    if (this.lanternDef) {
      this.lanternAt = this.lanternDef.firstSeconds;
      this.pits = this.findPits();
    }
    this.fountain = w.terrain.fountain as FountainDef | undefined;
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
        } else for (let z = slot.z; z < slot.z + slot.h; z++) for (let x = slot.x; x < slot.x + slot.w; x++) {
          const i = t.index(x, z);
          if (i >= 0) cells.push(i);
        }
        this.slots.push({ slot, cells, prev: cells.map((c) => t.kinds[c]) });
      }
      this.applyGates(false);
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
    if (this.slide) return { lane: this.slide.lane, stage: "slide", k: Math.min(1, (t - this.slide.start) / av.sweepSeconds) };
    if (this.warned) return { lane: this.lanes[this.arm], stage: "warn", k: 1 - (this.nextAt - t) / av.warnSeconds };
    return null;
  }

  get gateList(): { slot: GateSlot; shut: boolean }[] {
    return this.slots.map((g) => ({ slot: g.slot, shut: this.closed(g.slot.set) }));
  }

  get pendingArm(): { arm: number; at: number } | null {
    return this.av ? { arm: this.arm, at: this.nextAt } : null;
  }

  private findPits(): { x: number; z: number }[] {
    const t = this.w.terrain;
    const seen = new Uint8Array(t.width * t.depth);
    const out: { x: number; z: number }[] = [];
    for (let i = 0; i < seen.length; i++) {
      if (seen[i] || t.styles[i] !== "pit") continue;
      const stack = [i];
      seen[i] = 1;
      let sx = 0;
      let sz = 0;
      let n = 0;
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % t.width;
        const cz = Math.floor(c / t.width);
        sx += cx + 0.5;
        sz += cz + 0.5;
        n++;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = cx + dx;
          const zz = cz + dz;
          if (xx < 0 || zz < 0 || xx >= t.width || zz >= t.depth) continue;
          const j = zz * t.width + xx;
          if (!seen[j] && t.styles[j] === "pit") {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
      out.push({ x: sx / n, z: sz / n });
    }
    return out;
  }

  misted(x: number, z: number): boolean {
    const m = this.mistMask;
    if (!m || !this.mist) return false;
    const t = this.w.terrain;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (cx < 0 || cz < 0 || cx >= t.width || cz >= t.depth || !m[cz * t.width + cx]) return false;
    const [tail, front] = this.mistBand(this.w.time);
    return z < front && z > tail;
  }

  mistBand(time: number): [number, number] {
    const d = this.mist;
    if (!d) return [0, 0];
    const t = time - this.mistStart;
    const span = this.w.terrain.depth + 6;
    if (t < 0 || t > d.rollSeconds * 2 + d.holdSeconds) return [0, 0];
    const front = Math.min(1, t / d.rollSeconds) * span - 3;
    const tail = t > d.rollSeconds + d.holdSeconds ? ((t - d.rollSeconds - d.holdSeconds) / d.rollSeconds) * span - 3 : -Infinity;
    return [tail, front];
  }

  hauntMul(e: { status: { hauntUntil?: number } }, kind: "damage" | "speed"): number {
    const d = this.lanternDef;
    if (!d || !(this.w.time < (e.status.hauntUntil ?? 0))) return 1;
    return kind === "damage" ? d.damageMul : d.speedMul;
  }

  private updateMist(d: MistDef): void {
    const w = this.w;
    if (!this.mistWarned && w.time >= this.mistAt - d.warnSeconds) {
      this.mistWarned = true;
      w.emit({ type: "mist", stage: "warn", seconds: d.warnSeconds });
    }
    if (w.time >= this.mistAt) {
      this.mistStart = w.time;
      this.mistOn = true;
      w.emit({ type: "mist", stage: "in", seconds: d.rollSeconds * 2 + d.holdSeconds });
      this.mistAt = w.time + d.everySeconds;
      this.mistWarned = false;
    }
    if (this.mistOn && w.time > this.mistStart + d.rollSeconds * 2 + d.holdSeconds) {
      this.mistOn = false;
      w.emit({ type: "mist", stage: "out", seconds: 0 });
    }
  }

  private updateLantern(d: LanternDef): void {
    const w = this.w;
    if (!this.lantern) {
      if (w.time < this.lanternAt || !this.pits.length || !d.spots.length) return;
      const pit = this.pits[Math.floor(w.rng() * this.pits.length) % this.pits.length];
      let spot = d.spots[0];
      let bd = Infinity;
      for (const s of d.spots) {
        const dd = Math.hypot(s.x - pit.x, s.z - pit.z);
        if (dd < bd) {
          bd = dd;
          spot = s;
        }
      }
      this.lantern = { state: "rise", x: pit.x, z: pit.z, fromX: pit.x, fromZ: pit.z, tx: spot.x, tz: spot.z, start: w.time, id: ++this.lanternSeq };
      w.emit({ type: "lantern", stage: "rise", x: pit.x, y: w.groundY(pit.x, pit.z), z: pit.z, id: this.lanternSeq, hero: 0 });
      return;
    }
    const l = this.lantern;
    const t = w.time - l.start;
    if (l.state === "rise" && t >= d.riseSeconds) {
      l.state = "drift";
      l.start = w.time;
    } else if (l.state === "drift") {
      const total = Math.hypot(l.tx - l.fromX, l.tz - l.fromZ);
      const k = Math.min(1, (t * d.speed) / (total || 1));
      const e = k * k * (3 - 2 * k);
      l.x = l.fromX + (l.tx - l.fromX) * e;
      l.z = l.fromZ + (l.tz - l.fromZ) * e;
      if (k >= 1) {
        l.state = "rest";
        l.start = w.time;
      }
    } else if (l.state === "rest" && t >= d.restSeconds) {
      w.emit({ type: "lantern", stage: "fade", x: l.x, y: w.groundY(l.x, l.z), z: l.z, id: l.id, hero: 0 });
      this.lantern = null;
      this.lanternAt = w.time + d.everySeconds;
      return;
    }
    if (l.state === "rise") return;
    let best: Entity | null = null;
    let bd = 1.7;
    for (const e of w.entities) {
      if (!e.alive || !e.hero || e.hero.dead) continue;
      const dd = Math.hypot(e.transform.pos.x - l.x, e.transform.pos.z - l.z);
      if (dd < bd || (dd === bd && best && e.id < best.id)) {
        bd = dd;
        best = e;
      }
    }
    if (!best) return;
    best.status.hauntUntil = w.time + d.hauntSeconds;
    w.emit({ type: "lantern", stage: "taken", x: l.x, y: w.groundY(l.x, l.z), z: l.z, id: l.id, hero: best.id });
    this.lantern = null;
    this.lanternAt = w.time + d.everySeconds;
  }

  private updateHorns(av: AvalancheDef): void {
    const w = this.w;
    const dt = w.dt;
    this.horns.forEach((h, i) => {
      if (w.time < h.readyAt) {
        h.progress = 0;
        return;
      }
      const near = new Set<number>();
      for (const e of w.entities) {
        if (!e.alive || !e.hero || e.hero.dead) continue;
        if (Math.hypot(e.transform.pos.x - h.x, e.transform.pos.z - h.z) <= 2.6) near.add(e.team);
      }
      if (near.size !== 1) {
        h.progress = Math.max(0, h.progress - dt);
        return;
      }
      const team = [...near][0];
      if (team !== h.team) {
        h.team = team;
        h.progress = 0;
      }
      h.progress += dt;
      if (h.progress < this.hornCapture) return;
      h.progress = 0;
      if (this.slide || this.warned) return;
      const rivals = h.arms.filter((a) => a !== team);
      let arm = rivals[0];
      if (rivals.length > 1) {
        let best = -1;
        for (const a of rivals) {
          const r = this.lanes[a].rect;
          const n = w.entities.filter((e) => e.alive && e.unit && !e.neutral && e.team !== team && e.transform.pos.x >= r.x && e.transform.pos.x <= r.x + r.w && e.transform.pos.z >= r.z && e.transform.pos.z <= r.z + r.h).length;
          if (n > best) {
            best = n;
            arm = a;
          }
        }
      }
      h.readyAt = w.time + this.hornCooldown;
      this.arm = arm;
      this.nextAt = w.time + av.warnSeconds;
      this.warned = false;
      w.emit({ type: "horn", stage: "blow", horn: i, team, arm, x: h.x, y: w.groundY(h.x, h.z), z: h.z });
    });
  }

  update(): void {
    if (this.av && this.horns.length) this.updateHorns(this.av);
    if (this.mist) this.updateMist(this.mist);
    if (this.lanternDef) this.updateLantern(this.lanternDef);
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
