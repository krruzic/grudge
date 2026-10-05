// MapFx: visuals for scripted map features (World.mapEvents and map terrain data). Owned by HazardViews, which
// forwards map events (horn, jumppad, morph, lantern, gates, avalanche) to handle() and calls sync() each frame.
// Each feature lives in its own module and keeps its state on this object (fields grouped below).
import * as THREE from "three";
import type { World } from "../../sim/world";
import { gateSlots, type FountainDef, type GatesDef } from "../../sim/mapEvents";
import { type FxHost } from "../fx/parts";
import { Ava, freeAva, onAvalanche, prepLods, Run, syncAvas, syncRuns } from "./avalanche";
import { buildHorns, onHorn, syncHorns } from "./horns";
import { buildJumpPads, onJumpPad, syncJumpPads } from "./jumpPads";
import { onLantern, syncLantern } from "./lantern";
import { onGeyser } from "./geysers";
import { buildSerpent, onSerpent, syncSerpent, type SerpentView } from "./serpent";
import { onMorph, syncMorphs } from "./morphs";
import { syncMist } from "./mist";
import { syncFountain } from "./fountain";
import { onPowerup, syncPowerups, type PowerView } from "./powerups";
import {
  buildGates,
  buildLockGates,
  Gate,
  onGates,
  onLockGates,
  syncGates,
  syncGateSparkle,
  syncLockGates,
} from "./gates";

export class MapFx {
  readonly root = new THREE.Group();
  teamColors: THREE.Color[] = [];
  /** Render time of the current sync (not the sim clock). */
  now = 0;

  // Avalanche (avalanche.ts): warning runs and active/settled slides.
  runs: Run[] = [];
  avas: Ava[] = [];

  // Gates (gates.ts): timed gate bars, the lockdown barricades, and the gate warning ring timer.
  gates: Gate[] = [];
  lock: {
    root: THREE.Group;
    posts: [number, number, number][];
    mids: [number, number, number, number, number][];
    warn: number;
    done: boolean;
    acc: number;
  } | null = null;
  ring = 0;

  // Team deathmatch power-ups (powerups.ts), by power-up id.
  powerViews = new Map<number, PowerView>();

  // Fountain (fountain.ts).
  fountain?: FountainDef;
  sprayAcc = 0;

  // Ghost lantern (lantern.ts).
  lanternObj: THREE.Group | null = null;
  lanternId = 0;
  lanternY = 0;
  lanternPos = new THREE.Vector2();
  lanternTilt = new THREE.Vector4();
  lanternEnd: { kind: "taken" | "fade"; hero: number } = { kind: "fade", hero: 0 };
  lanternOut: {
    obj: THREE.Group;
    start: number;
    kind: "taken" | "fade";
    hero: number;
    from?: THREE.Vector3;
  }[] = [];
  wispAcc = 0;

  // Mist (mist.ts): cells that can be fogged.
  mistCells: number[] = [];
  mistAcc = 0;

  // Hero morphs in progress (morphs.ts).
  morphs: { id: number; start: number; until: number; team: number; acc: number }[] = [];

  // Avalanche horns (horns.ts).
  hornObjs: {
    ring: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
    flag: THREE.Mesh;
    horn: THREE.Object3D;
    k: number;
  }[] = [];

  // Jump pads (jumpPads.ts).
  springs: { spring: THREE.Object3D; deck: THREE.Object3D; launch: number; release: number }[] = [];
  pendingBursts: { at: number; x: number; y: number; z: number }[] = [];
  // Dune serpent (serpent.ts)
  serpent: SerpentView | null = null;

  constructor(
    readonly world: World,
    readonly fx?: FxHost,
  ) {
    const gd = world.terrain.gates as GatesDef | undefined;
    if (gd) buildGates(this, gateSlots(world, gd));
    if (world.mapEvents.lockGates.length) buildLockGates(this, world.mapEvents.lockGates);
    this.fountain = world.terrain.fountain as FountainDef | undefined;
    buildJumpPads(this);
    buildHorns(this);
    buildSerpent(this);
    if (world.terrain.avalanche) prepLods();
    const m = world.mapEvents.mistMask;
    if (m) for (let i = 0; i < m.length; i++) if (m[i]) this.mistCells.push(i);
  }

  handle(ev: { type: string; [k: string]: unknown }): void {
    if (ev.type === "horn") return onHorn(this, ev);
    if (ev.type === "jumppad") return onJumpPad(this, ev);
    if (ev.type === "morph") return onMorph(this, ev);
    if (ev.type === "lantern") return onLantern(this, ev);
    if (ev.type === "gates" && ev.lock) return onLockGates(this, ev);
    if (ev.type === "gates") return onGates(this, ev);
    if (ev.type === "avalanche") onAvalanche(this, ev);
    if (ev.type === "geyser") onGeyser(this, ev);
    if (ev.type === "serpent") onSerpent(this, ev);
    if (ev.type === "powerup") onPowerup(this, ev);
  }

  sync(time: number, dt: number): void {
    this.now = time;
    syncGates(this, dt);
    syncLockGates(this, dt);
    syncJumpPads(this);
    syncHorns(this, time);
    syncMorphs(this, dt);
    syncFountain(this, dt);
    syncLantern(this, time, dt);
    syncMist(this, dt);
    syncGateSparkle(this, dt);
    syncRuns(this, time, dt);
    syncAvas(this, time, dt);
    syncSerpent(this, dt);
    syncPowerups(this, time);
  }

  dispose(): void {
    for (const v of this.avas) freeAva(this, v);
    this.avas = [];
    this.root.clear();
  }
}
