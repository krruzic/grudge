// App: the browser client's shared state and subsystems.
// One instance is built at boot (src/main.ts) and passed to every controller in src/app/*. It owns the current
// World, the screen state machine value, the champion-select slots and the per-match control setup, plus every
// long-lived subsystem: renderer, UI canvas + HUD + screens + menus, input, audio, save data and the net session.
// Controllers are plain functions over this object (select.ts, lobby.ts, match.ts, states.ts, net.ts, loop.ts)
// so that state which used to be closure `let`s inside one giant start() lives in exactly one place.
import { tdmMap } from "../sim/tdm";
import { padCounts } from "../ui/screens/field";
import * as THREE from "three";
import { World } from "../sim/world";
import { MapFx } from "../render/map/mapFx";
import type { Bot } from "../sim/bot";
import type { Command } from "../sim/types";
import inputData from "../../data/input.json";
import { Gamepads, type InputConfig, type PadState } from "../input/gamepads";
import type { CommandMapper } from "../input/commands";
import { GameRenderer } from "../render/gameRenderer";
import { Hud, UiCanvas } from "../ui/hud";
import { Screens, type SelectSlot } from "../ui/screens";
import { MenuCursors } from "../ui/cursor";
import { Portraits } from "../ui/portraits";
import { Menus } from "../ui/menus";
import { Audio } from "../audio/sfx";
import { applyRules, nativeHeight, Save, type MatchMode, type MatchPlayer } from "../game/save";
import { perf } from "../perf";
import {
  commanderType,
  data,
  heroNames,
  houses,
  maps,
  MAX_PLAYERS,
  seatsFor,
  renderConfig,
  roster,
  startMap,
  type Assets,
  type MapView,
} from "./assets";
import type { HeroModels } from "../render/heroModels";
import { NetSession } from "./net";
import { deviceName } from "./nav";

/** Top-level screen state. "lobby" is a guest's view of an online host's select screen. */
export type AppState = "title" | "menu" | "select" | "map" | "match" | "paused" | "results" | "lobby";

export class App {
  readonly params = new URLSearchParams(location.search);
  /** `?join=N`: treat the first N seats as if a controller were plugged in (testing select without pads). */
  readonly forceJoin: number;
  /** `?split4` / VITE_SPLIT4: every seat gets its own view, even CPU ones. */
  readonly splitAll: boolean;

  state: AppState = "title";

  // ── Match setup (what the next / current match is) ──
  players = 2;
  /** World seed; incremented every time a world is built so rematches differ. */
  seed: number;
  /** Index into `maps` of the field being shown / played. */
  mapIndex: number;
  mode: MatchMode;
  training: boolean;
  /** Field-select cursor: index into fields(), or fields().length for RANDOM. */
  pickIndex: number;
  /** Online field vote (host): seat -> field card index (pool.length = RANDOM), and when the first vote came in. */
  votes = new Map<number, number>();
  voteAt = -1;
  /** Time everyone became ready on select (start is ignored for 0.25 s after), -1 when not all ready. */
  readySince = -1;

  // ── Current world and who drives each player slot ──
  world: World;
  /** Map index the renderer currently shows (lags mapIndex until show() swaps it). */
  shownMap: number;
  /** Local human input per player slot (null for CPU / remote / attract). */
  mappers: (CommandMapper | null)[] = [];
  bots: (Bot | null)[] = [];
  /** Player slots driven by a person, local or remote (bots pair up with them as mates). */
  people: boolean[] = [];
  /** Champion-select seats (always MAX_PLAYERS; 1v1 only uses the first two). */
  readonly slots: SelectSlot[];

  // ── Match bookkeeping ──
  /** Time the match ended (winner banner shown), -1 while running. Results follow 3 s later. */
  overAt = -1;
  matchPlayers: MatchPlayer[] = [];
  /** Whether the finished match was already written to the records (and reported to the server). */
  recorded = true;
  /** FFA houses in the order they were eliminated (for the results placing). */
  fallen: number[] = [];
  /** Fixed-step accumulator in seconds (also the render interpolation alpha source). */
  acc = 0;
  /** Pad index that opened the pause menu; only that pad (and the mouse if it is the keyboard seat) drives it. */
  pauser = -1;
  /** Whether the current match allows pausing (rule PAUSING, taken from the match spec). */
  pausing = true;

  // ── Select-screen input bookkeeping ──
  /** A name entry was open at the start of this frame, so its keys must not also start the match. */
  namingAte = false;
  /** Pads whose name entry closed this frame (their cursor stays frozen one more frame). */
  readonly closedNow = new Set<number>();
  /** Last C-stick flick direction per pad, so one flick changes the costume once. */
  readonly costumeFlick = [0, 0, 0, 0];
  /** Each seat's sealed human pick from the last match started (restored on returning to champion select). */
  lastPicks: ({ hero: string; costume?: string } | null)[] = [];
  /** Seconds each pad has been holding B toward "back out" on the select / field screens. */
  readonly backHold = [0, 0, 0, 0];
  /** Last field each cursor hovered on field select ("*" = not yet seen, so the first hover doesn't count). */
  readonly mapHover = ["*", "*", "*", "*"];
  /** Toggled by Start+Z: shows the raw pad debug text. */
  showPads = false;

  /** Debug controls (window.grudge.dbg): frozen clock with manual advance, puppeted commands per slot. */
  readonly dbg = { freeze: false, adv: 0, clock: 0, puppet: [] as (Command | null)[] };

  // ── Subsystems ──
  readonly save = new Save();
  readonly mapViews: MapView[];
  readonly heroModels: HeroModels;
  /**
   * Fraction of the background download done (loadRest), 1 once it and its rehearsal finish. Until then the title
   * screen shows the progress and holds START (queued in `wantMenu`).
   */
  loaded = 0;
  wantMenu = false;
  readonly pads: Gamepads;
  readonly view: GameRenderer;
  readonly uiCanvas: UiCanvas;
  readonly hud: Hud;
  private readonly portraits: Portraits;
  readonly screens: Screens;
  readonly menus: Menus;
  readonly audio = new Audio();
  readonly cursors = new MenuCursors(MAX_PLAYERS);
  readonly net = new NetSession();
  readonly padsEl: HTMLElement;

  constructor(assets: Assets) {
    const p = this.params;
    this.seed = Number(p.get("seed") ?? Math.floor(Math.random() * 1e6));
    this.mapIndex = startMap(p);
    this.forceJoin = Number(p.get("join") ?? 0);
    const pm = p.get("mode");
    this.mode = pm === "2v2" || pm === "ffa" || pm === "tdm" || pm === "ffadm" ? pm : "1v1";
    this.training = p.has("training");
    this.pickIndex =
      p.get("map") === "random" ? this.fields().length : Math.max(0, this.fields().indexOf(this.mapIndex));
    this.world = this.newWorld([roster[0], roster[0]]);
    this.mapViews = assets.mapViews;
    this.heroModels = assets.heroes;

    this.splitAll = p.has("split4") || import.meta.env.VITE_SPLIT4 === "1";
    const dbgZoom = p.get("zoom");
    if (dbgZoom) Object.assign(renderConfig, { minViewWidth: Number(dbgZoom), viewMargin: 0 });

    this.pads = new Gamepads(inputData as InputConfig, MAX_PLAYERS);
    this.view = new GameRenderer(
      renderConfig,
      this.world,
      assets.mapViews[this.mapIndex],
      assets.heroes,
      assets.structures,
      assets.unitModels,
    );
    perf.init(this.view.renderer);
    this.shownMap = this.mapIndex;

    // UI: one canvas for HUD, screens and menus; portraits render 3D hero/unit/map art for all of them.
    const teamCss = renderConfig.teamColors;
    this.uiCanvas = new UiCanvas(document.getElementById("ui")!);
    this.hud = new Hud(teamCss);
    this.screens = new Screens();
    const portraits = new Portraits(assets.heroes, this.view.teamColorList);
    portraits.units = assets.unitModels;
    // Map previews: the static map plus its runtime set pieces (jump pads, timed gates), built from a throwaway
    // World of each map so the preview shows the field as it starts.
    this.portraits = portraits;
    // Pad counts for the field cards come from every map's data; previews only from the maps loaded so far.
    maps.forEach((m, i) => padCounts.set(m.data.name ?? "", new World(m.data, data, 1).terrain.pads.length));
    this.mapViews.forEach((_, i) => this.addMapPreview(i));
    this.screens.portraits = portraits;
    this.hud.portraits = portraits;
    this.hud.mapIndex = () => this.shownMap;
    this.padsEl = document.getElementById("pads")!;

    this.menus = new Menus(this.save);
    this.menus.portraits = portraits;
    this.menus.roster = roster;
    this.menus.heroNames = heroNames;
    this.menus.mapNames = Object.fromEntries(maps.map((m) => [m.id, m.data.name ?? m.id]));
    this.applyOptions();
    this.menus.devices = () => this.pads.players.map(deviceName);
    this.menus.releaseSeat = (i) => this.pads.release(i);
    this.menus.requestDevice = () => void this.pads.requestHid();

    this.slots = Array.from({ length: MAX_PLAYERS }, (_, i) => ({
      joined: false,
      ready: false,
      hero: i < 2 ? roster[0] : commanderType,
      cpu: true,
      level: 2,
    }));
    this.screens.cursors = this.cursors;
  }

  // ── Fields and seats ──

  /** Map indices playable in a mode: 4-house maps for FFA, 2-house maps otherwise. */
  fieldsFor(m: MatchMode): number[] {
    // Deathmatch arenas (map mode "tdm") only host deathmatch; both deathmatch modes play them first, then the
    // free-for-all fields. The 1v1 / 2v2 fields are only for those modes.
    const all = maps.map((_, i) => i);
    const arena = (i: number) => maps[i].data.mode === "tdm";
    if (m === "ffadm" || m === "tdm") return [...all.filter(arena), ...all.filter((i) => !arena(i) && houses(i) === 4)];
    return all.filter((i) => !arena(i) && (houses(i) === 4) === (m === "ffa"));
  }

  /** The map data a match on map i plays: deathmatch strips the bases (sim/tdm.ts tdmMap). */
  mapData(i: number, mode: MatchMode = this.mode) {
    return mode === "tdm" ? tdmMap(maps[i].data) : mode === "ffadm" ? tdmMap(maps[i].data, 8) : maps[i].data;
  }

  fields(): number[] {
    return this.fieldsFor(this.mode);
  }

  /** A person sits at seat i: a connected local pad, a `?join` test seat, or a remote guest. */
  present(i: number): boolean {
    return !!this.pads.players[i]?.connected || i < this.forceJoin || this.net.remoteAt(i) >= 0;
  }

  /** Seats in play for the mode: 2 in 1v1, 4 in 2v2 / FFA, all 8 in team deathmatch. */
  slotActive(i: number): boolean {
    return i < seatsFor(this.mode);
  }

  /** Seats 2/3 in 2v2 play the commander (Herald) unless the "partners" rule gives them champions. */
  commanderSlot(i: number): boolean {
    return i >= 2 && this.mode === "2v2" && this.save.data.rules.partners === 0;
  }

  /** Index of the cursor holding this seat's chip, or -1. */
  heldBy(slot: number): number {
    return this.cursors.cursors.findIndex((c) => c.active && c.holding === slot);
  }

  /** Pad states for menu cursors, with `?join` test seats forced connected. */
  padsForCursors(): PadState[] {
    return this.pads.players.map((p, i) => (i < this.forceJoin && !p.connected ? { ...p, connected: true } : p));
  }

  anyPressed(k: keyof PadState["pressed"]): boolean {
    return this.pads.players.some((p) => p.pressed[k]);
  }

  /** A random champion (of those loaded, while the title screen's background download runs). */
  randomHero(): string {
    const pool = roster.filter((h) => this.heroModels.has(h));
    const from = pool.length ? pool : roster;
    return from[Math.floor(Math.random() * from.length)];
  }

  // ── Worlds ──

  /**
   * Boot rehearsal (behind the loading overlay): shows every field once with champions cycling through the whole
   * roster and draws a frame of each, so shader compiles, texture/geometry uploads and the reusable view caches
   * happen now instead of as a hitch the first time the menu backdrop swaps to a field.
   */
  rehearse(fields: number[] = this.mapViews.flatMap((mv, i) => (mv ? [i] : []))): void {
    const keep = { map: this.mapIndex, seed: this.seed, world: this.world };
    const pool = roster.filter((h) => this.heroModels.has(h));
    let h = 0;
    for (const i of fields) {
      this.mapIndex = i;
      const n = houses(this.mapIndex) === 4 ? 4 : 2;
      const w = this.newWorld(
        Array.from({ length: n }, () => pool[h++ % pool.length]),
        n,
        false,
        true,
      );
      this.show(w);
      this.view.render(0, 1 / 60);
    }
    this.mapIndex = keep.map;
    while (h < pool.length) {
      this.show(this.newWorld([pool[h++ % pool.length], pool[h++ % pool.length]]));
      this.view.render(0, 1 / 60);
    }
    this.seed = keep.seed;
    this.show(keep.world);
  }

  /**
   * Builds a world on the current map (attract mode / `?bots` debug matches). Slots past the first two play the
   * commander in team modes unless `partners` (or the partners rule with `rules`) is set.
   */
  newWorld(heroes: string[], count = 2, rules = false, partners = false): World {
    const tdm = (this.mode === "tdm" && houses(this.mapIndex) === 2) || this.mode === "ffadm";
    const w = new World(
      tdm ? this.mapData(this.mapIndex) : maps[this.mapIndex].data,
      rules ? applyRules(data, this.save.data.rules) : data,
      this.seed++,
    );
    const ffa = w.ffa;
    const champions = (p: number) => ffa || tdm || p < 2 || partners || (rules && this.save.data.rules.partners === 1);
    for (let p = 0; p < count; p++)
      w.spawnHero(champions(p) ? (heroes[p] ?? roster[0]) : commanderType, p, ffa ? p : p % 2);
    return w;
  }

  /**
   * Map `i`'s preview for the field screen: the static map plus its runtime set pieces (jump pads, timed gates),
   * built from a throwaway World of the map so the preview shows the field as it starts.
   */
  private addMapPreview(i: number): void {
    const g = new THREE.Group();
    g.add(this.mapViews[i].root.clone(true));
    const mf = new MapFx(new World(maps[i].data, data, 1));
    mf.sync(0, 1);
    g.add(mf.root);
    const a = maps[i].data.atmosphere as Record<string, string | number> | undefined;
    const rc = renderConfig as unknown as Record<string, string | number>;
    const pick = (k: string) => (a?.[k] ?? rc[k]) as string;
    const light = a && {
      sunColor: pick("sunColor"),
      sunScale: Number(pick("sunIntensity")) / Number(rc.sunIntensity),
      ambientSky: pick("ambientSky"),
      ambientGround: pick("ambientGround"),
      ambientScale: Number(pick("ambientIntensity")) / Number(rc.ambientIntensity),
      sky: pick("skyHorizon"),
    };
    this.portraits.setMap(i, { root: g, width: maps[i].data.width, depth: maps[i].data.depth, light });
  }

  /** The background download landed (maps `added`): previews and a rehearsal of the new fields and champions. */
  finishLoading(added: number[]): void {
    for (const i of added) this.addMapPreview(i);
    this.rehearse(added);
    this.loaded = 1;
  }

  /** Makes `w` the current world and points the renderer at it (swapping map scenery if the map changed). */
  show(w: World): void {
    this.world = w;
    if (this.shownMap !== this.mapIndex) {
      this.view.setMap(this.mapViews[this.mapIndex], w.terrain);
      this.shownMap = this.mapIndex;
    }
    this.view.setWorld(w);
  }

  /** Pushes saved options into audio, camera, select screen and input. */
  applyOptions(): void {
    const o = this.save.data.options;
    this.audio.setLevels(o.music / 10, o.sound / 10);
    this.view.shakeMul = o.shake;
    // Old saves had a third camera mode (split = 2): it became split view with manual zoom for everyone.
    if (o.split === 2) {
      o.split = 1;
      o.zoom = [1, 1, 1, 1];
    }
    this.view.camMode = o.split;
    this.view.manualZoom = [0, 1, 2, 3].map((k) => !!o.zoom?.[k]);
    this.screens.cameraMode = o.split;
    this.screens.zoomModes = [0, 1, 2, 3].map((k) => o.zoom?.[k] ?? 0);
    this.view.setHints(!!o.hints);
    this.pads.kbmEnabled = o.kbm !== 0;
    // renderScale holds a target height (0 = native); legacy saves stored 100 / 75 (%).
    const rh = o.renderScale;
    this.view.renderScale = rh === 75 ? 0.75 : rh > 0 && rh !== 100 ? Math.min(1, rh / nativeHeight()) : 1;
  }

  /** Flips the manual-zoom camera flag of seat i in the save and applies it. Returns the new value. */
  toggleZoom(i: number): number {
    const z = this.save.data.options.zoom ?? [0, 0, 0, 0];
    z[i] = z[i] ? 0 : 1;
    this.save.data.options.zoom = z;
    this.save.write();
    this.applyOptions();
    return z[i];
  }
}
