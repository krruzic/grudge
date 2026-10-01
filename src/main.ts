import heroData from "../data/heroes.json";
import talentData from "../data/talents.json";
import unitData from "../data/units.json";
import structureData from "../data/structures.json";
import matchData from "../data/match.json";
import renderData from "../data/render.json";
import inputData from "../data/input.json";
import coreUrl from "../assets/structures/core.glb?url";
import grassTex from "../assets/textures/grass.png?url";
import dirtTex from "../assets/textures/dirt.png?url";
import sandTex from "../assets/textures/sand.png?url";
import cliffTex from "../assets/textures/cliff.png?url";
import cobbleTex from "../assets/textures/cobble.png?url";
import waterTex from "../assets/textures/water.png?url";
import { World } from "./sim/world";
import { Bot } from "./sim/bot";
import { placeRanges } from "./sim/heroes";
import { allLearned, gainXp, learn } from "./sim/talents";
import { forceAbility } from "./sim/heroes";
import { padNear } from "./sim/structures";
import type { GameData } from "./sim/config";
import { spawnUnit } from "./sim/structures";
import type { Command } from "./sim/types";
import { Terrain, type MapData } from "./sim/terrain";
import { Gamepads, type InputConfig } from "./input/gamepads";
import { CommandMapper } from "./input/commands";
import { GameRenderer, type RenderConfig } from "./render/gameRenderer";
import { loadMap } from "./render/mapView";
import { HeroModels } from "./render/heroModels";
import { StructureModels } from "./render/structureModels";
import { UnitModels } from "./render/unitModels";
import { Hud, UiCanvas } from "./ui/hud";
import { loadFont } from "./ui/font";
import { Screens, type SelectSlot } from "./ui/screens";
import { MenuCursors } from "./ui/cursor";
import { Portraits } from "./ui/portraits";
import { Audio } from "./audio/sfx";
import { Menus, type Nav, type RoomInfo } from "./ui/menus";
import { MAX_TAG, Save, applyRules, type MatchMode } from "./game/save";
import { NameEntry } from "./ui/nameEntry";
import { NetLink, type NetMsg } from "./net/link";
import { mathPrint, mergeCommands, packCommand, worldHash, type Frame, type MatchSpec } from "./net/session";
import { drawText, textWidth } from "./ui/font";
import type { LobbySlot } from "./ui/screens";

const MAX_PLAYERS = 4;
const data = { talents: talentData, heroes: heroData, units: unitData, structures: structureData, match: matchData } as unknown as GameData;
const heroUrls = import.meta.glob("../assets/heroes/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const unitUrls = import.meta.glob("../assets/units/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const structureUrls = import.meta.glob("../assets/structures/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const mapJsons = import.meta.glob("../data/maps/*.json", { import: "default", eager: true }) as Record<string, MapData>;
const mapGlbs = import.meta.glob("../assets/maps/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const MAP_ORDER = ["crossing", "ruins", "shoals"];
const maps = Object.entries(mapJsons)
  .map(([path, d]) => {
    const id = path.split("/").pop()!.replace(".json", "");
    return { id, data: d, url: mapGlbs[`../assets/maps/${id}.glb`] };
  })
  .filter((m) => m.url)
  .sort((a, b) => (MAP_ORDER.indexOf(a.id) + 99) % 99 - (MAP_ORDER.indexOf(b.id) + 99) % 99);

const bootEl = document.getElementById("boot");
const endBoot = () => {
  if (!bootEl) return;
  bootEl.classList.add("gone");
  setTimeout(() => bootEl.classList.add("out"), 450);
  setTimeout(() => bootEl.remove(), 950);
};

type State = "title" | "menu" | "select" | "map" | "match" | "paused" | "results" | "lobby";

async function start(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const roster = Object.keys(data.heroes.heroes).filter((k) => data.heroes.heroes[k].role !== "commander");
  const commanderType = Object.keys(data.heroes.heroes).find((k) => data.heroes.heroes[k].role === "commander") ?? roster[0];
  let players = 2;
  let seed = Number(params.get("seed") ?? Math.floor(Math.random() * 1e6));
  let mapIndex = Math.max(0, maps.findIndex((m) => m.id === params.get("map")));
  const forceJoin = Number(params.get("join") ?? 0);
  let mode: MatchMode = params.get("mode") === "2v2" ? "2v2" : params.get("mode") === "ffa" ? "ffa" : "1v1";
  const houses = (i: number) => maps[i]?.data.teams ?? 2;
  const fieldsFor = (m: MatchMode) => maps.map((_, i) => i).filter((i) => (houses(i) === 4) === (m === "ffa"));
  const fields = () => fieldsFor(mode);
  let pickIndex = params.get("map") === "random" ? fields().length : Math.max(0, fields().indexOf(mapIndex));
  let readySince = -1;

  const save = new Save();
  const newWorld = (heroes: string[], count = 2, rules = false, partners = false): World => {
    const w = new World(maps[mapIndex].data, rules ? applyRules(data, save.data.rules) : data, seed++);
    const ffa = w.ffa;
    for (let p = 0; p < count; p++) w.spawnHero(ffa || p < 2 || partners || (rules && save.data.rules.partners === 1) ? heroes[p] ?? roster[0] : commanderType, p, ffa ? p : p % 2);
    return w;
  };

  let world = newWorld([roster[0], roster[0]]);
  const structures = new StructureModels();
  const unitModels = new UnitModels();
  const sUrls: Record<string, string> = { core: coreUrl };
  for (const [path, url] of Object.entries(structureUrls)) {
    const name = path.split("/").pop()!.replace(".glb", "");
    sUrls[name] = url;
  }
  const [mapViews, heroes] = await Promise.all([
    Promise.all(maps.map((m) => loadMap(m.url, new Terrain(m.data), { grass: grassTex, dirt: dirtTex, rock: cliffTex, cobble: cobbleTex, water: waterTex, sand: sandTex }, renderData as RenderConfig))),
    (async () => {
      const h = new HeroModels();
      const urls: Record<string, string> = {};
      for (const [path, url] of Object.entries(heroUrls)) urls[path.split("/").pop()!.replace(".glb", "")] = url;
      await h.load(urls);
      return h;
    })(),
    structures.load(sUrls),
    unitModels.load(Object.fromEntries(Object.entries(unitUrls).map(([p, u]) => [p.split("/").pop()!.replace(".glb", ""), u]))),
    loadFont(),
  ]);

  const dbgZoom = params.get("zoom");
  if (dbgZoom) Object.assign(renderData, { minViewWidth: Number(dbgZoom), viewMargin: 0 });

  const pads = new Gamepads(inputData as InputConfig, MAX_PLAYERS);
  const view = new GameRenderer(renderData as RenderConfig, world, mapViews[mapIndex], heroes, structures, unitModels);
  let shownMap = mapIndex;
  const show = (w: World) => {
    world = w;
    if (shownMap !== mapIndex) {
      view.setMap(mapViews[mapIndex], w.terrain);
      shownMap = mapIndex;
    }
    view.setWorld(w);
  };
  const teamCss = (renderData as RenderConfig).teamColors;
  const uiRoot = document.getElementById("ui")!;
  const pixel = new UiCanvas(uiRoot);
  const hud = new Hud(teamCss);
  const screens = new Screens(teamCss);
  screens.portraits = new Portraits(heroes, view.teamColorList);
  screens.portraits.units = unitModels;
  hud.portraits = screens.portraits;
  screens.portraits.setMaps(mapViews.map((mv, i) => ({ root: mv.root, width: maps[i].data.width, depth: maps[i].data.depth })));
  const padsEl = document.getElementById("pads")!;
  const audio = new Audio();
  const menus = new Menus(save);
  menus.portraits = screens.portraits;
  menus.roster = roster;
  menus.heroNames = Object.fromEntries(Object.entries(data.heroes.heroes).map(([k, h]) => [k, h.name]));
  menus.mapNames = Object.fromEntries(maps.map((m) => [m.id, m.data.name ?? m.id]));
  const applyOptions = () => {
    const o = save.data.options;
    audio.setLevels(o.music / 10, o.sound / 10);
    view.shakeMul = o.shake;
    view.camMode = o.split;
    screens.cameraMode = o.split;
    view.setHints(!!o.hints);
    pads.kbmEnabled = o.kbm !== 0;
  };
  applyOptions();
  menus.devices = () => pads.players.map((p) => {
    if (!p.connected) return null;
    if (p.profile === "keyboard") return "KEYBOARD + MOUSE";
    if (p.profile === "gc-adapter" || p.profile.startsWith("gc_")) return "GAMECUBE CONTROLLER";
    if (p.profile === "procon2") return "SWITCH 2 PRO CONTROLLER";
    const id = p.padId.replace(/\(.*?\)/g, "").replace(/[^A-Za-z0-9 ]+/g, " ").trim().toUpperCase();
    return id ? id.slice(0, 30) : "CONTROLLER";
  });
  menus.releaseSeat = (i) => pads.release(i);
  menus.requestDevice = () => void pads.requestHid();
  const navRep = Array.from({ length: MAX_PLAYERS }, () => ({ dir: "", t: 0 }));
  const readNav = (now: number): Nav => {
    const n: Nav = { dx: 0, dy: 0, a: false, b: false, y: false };
    pads.players.forEach((p, i) => {
      if (!p.connected) return;
      const sx = p.stickX + (p.held.right ? 1 : 0) - (p.held.left ? 1 : 0);
      const sy = p.stickY + (p.held.down ? 1 : 0) - (p.held.up ? 1 : 0);
      const dir = Math.max(Math.abs(sx), Math.abs(sy)) < 0.5 ? "" : Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? "r" : "l") : sy > 0 ? "d" : "u";
      const r = navRep[i];
      let fire = false;
      if (dir !== r.dir) { r.dir = dir; r.t = now + 0.38; fire = !!dir; }
      else if (dir && now >= r.t) { r.t = now + 0.1; fire = true; }
      if (fire) {
        if (dir === "l") n.dx = -1;
        if (dir === "r") n.dx = 1;
        if (dir === "u") n.dy = -1;
        if (dir === "d") n.dy = 1;
      }
      n.a ||= p.pressed.a || p.pressed.start;
      n.b ||= p.pressed.b;
      n.y ||= p.pressed.y;
    });
    return n;
  };
  const kbEditor = (): [number, NameEntry] | null => {
    const k = pads.keyboardSlot();
    if (k < 0) return null;
    const slot = state === "lobby" ? mySlots.get(k) : k;
    const ne = slot === undefined ? undefined : screens.naming.get(slot);
    return ne && slot !== undefined ? [slot, ne] : null;
  };
  window.addEventListener("keydown", (e) => {
    const ed = kbEditor();
    if (!ed) return;
    const ne = ed[1];
    if (/^Key[A-Z]$/.test(e.code)) ne.type(e.code.slice(3));
    else if (/^Digit[0-9]$/.test(e.code)) ne.type(e.code.slice(5));
    else if (e.code === "Minus") ne.type("-");
    else if (e.code === "Backspace") ne.back();
    else if (e.code === "Enter" || e.code === "Escape") {
      nameDone(ed[0], e.code === "Enter" ? { done: true, tag: ne.text.trim() || null } : { done: true }, pads.keyboardSlot());
    } else return;
    e.preventDefault();
    e.stopImmediatePropagation();
    audio.ui("move");
  }, true);
  const nameDone = (slot: number, r: { done: boolean; tag?: string | null }, k = slot) => {
    screens.naming.delete(slot);
    if (r.tag === undefined) {
      audio.ui("back");
      return;
    }
    audio.ui("ok");
    const tag = r.tag ? save.addTag(r.tag) : null;
    if (state === "lobby") net.toHost({ t: "tag", k, tag });
    else slots[slot].tag = tag;
  };
  let namingAte = false;
  const closedNow = new Set<number>();
  const runNaming = (padOf: (slot: number) => number, now: number) => {
    namingAte = screens.naming.size > 0;
    closedNow.clear();
    for (const [slot, ne] of [...screens.naming]) {
      const k = padOf(slot);
      const p = k >= 0 ? pads.players[k] : undefined;
      if (!p?.connected) {
        screens.naming.delete(slot);
        continue;
      }
      const r = ne.update(p, now);
      if (r?.done) {
        closedNow.add(k);
        nameDone(slot, r, k);
      }
      else if (Object.values(p.pressed).some(Boolean)) audio.ui("move");
    }
  };
  const naming = (k: number) => [...screens.naming.keys()].some((s) => (state === "lobby" ? mySlots.get(k) === s : s === k));
  const cursorPads = <T,>(list: T[]): T[] => {
    cursors.frozen.clear();
    list.forEach((_, k) => (naming(k) || closedNow.has(k)) && cursors.frozen.add(k));
    return list;
  };
  function finishTag(r: { done: boolean; tag?: string | null }): void {
    if (!r.done) return;
    audio.ui("ok");
    if (r.tag !== undefined && tagFor >= 0) slots[tagFor].tag = r.tag;
  }
  let tagFor = -1;
  let showPads = false;

  let mappers: (CommandMapper | null)[] = [];
  let bots: (Bot | null)[] = [];
  const slots: SelectSlot[] = Array.from({ length: MAX_PLAYERS }, (_, i) => ({ joined: false, ready: false, hero: i < 2 ? roster[0] : commanderType, cpu: true, level: 2 }));
  const cursors = new MenuCursors(MAX_PLAYERS);
  screens.cursors = cursors;
  const net = new NetLink();
  let netMode: "off" | "host" | "peer" = "off";
  type RSeat = { peer: number; k: number; slot: number; name: string; queue: Command[]; last: Command };
  const peerNames = new Map<number, string>();
  const rseats: RSeat[] = [];
  const seatAt = (i: number) => rseats.find((r) => r.slot === i);
  const remoteAt = (i: number) => seatAt(i)?.peer ?? -1;
  const mySlots = new Map<number, number>();
  const myHero: string[] = ["", "", "", ""];
  const myReady = [false, false, false, false];
  let wantSent = "";
  let wantAt = 0;
  const dropped = new Set<number>();
  let netFrames: Frame[] = [];
  const netHashes = new Map<number, number>();
  let outFrames: Frame[] = [];
  let outHashes: [number, number][] = [];
  let lobbySentAt = 0;
  let desync = false;
  let hostAddrs: string[] = [];
  let hostPublic = "";
  let roomFetch = false;
  let mathWarned = false;
  const MATH = mathPrint();
  const present = (i: number) => pads.players[i].connected || i < forceJoin || remoteAt(i) >= 0;
  const padsForCursors = () => pads.players.map((p, i) => (i < forceJoin && !p.connected ? { ...p, connected: true } : p));
  const slotActive = (i: number) => i < 2 || mode !== "1v1";
  const commanderSlot = (i: number) => i >= 2 && mode !== "ffa" && save.data.rules.partners === 0;
  const heldBy = (slot: number) => cursors.cursors.findIndex((c) => c.active && c.holding === slot);
  const settleCpu = (i: number) => {
    const sl = slots[i];
    if (commanderSlot(i)) { sl.hero = commanderType; sl.ready = true; cursors.placeChip(i, null); return; }
    if (heldBy(i) >= 0) return;
    if (!sl.ready || sl.open || !roster.includes(sl.hero)) sl.hero = randomHero();
    sl.ready = true;
    cursors.placeChip(i, sl.hero);
  };
  const makeHuman = (i: number) => {
    const sl = slots[i];
    sl.open = false;
    sl.cpu = false;
    sl.joined = true;
    if (commanderSlot(i)) { sl.hero = commanderType; sl.ready = true; return; }
    if (!roster.includes(sl.hero)) sl.hero = roster[0];
    const h = heldBy(i);
    if (h >= 0 && h !== i) cursors.cursors[h].holding = -1;
    sl.ready = false;
    cursors.placeChip(i, null);
    if (cursors.cursors[i].holding < 0) cursors.cursors[i].holding = i;
  };
  const makeOpen = (i: number) => {
    const sl = slots[i];
    if (!commanderSlot(i) && !roster.includes(sl.hero)) sl.hero = randomHero();
    sl.cpu = false;
    sl.joined = false;
    sl.open = true;
    sl.ready = true;
    sl.autoCpu = true;
    sl.tag = undefined;
    if (cursors.cursors[i].holding === i) cursors.cursors[i].holding = -1;
    cursors.placeChip(i, null);
  };
  const vacant = (i: number) => (netMode === "host" ? makeOpen(i) : (makeCpu(i), (slots[i].autoCpu = true)));
  const makeCpu = (i: number) => {
    const sl = slots[i];
    const wasOpen = !!sl.open;
    sl.open = false;
    sl.cpu = true;
    if (wasOpen) sl.ready = false;
    sl.joined = false;
    if (cursors.cursors[i].holding === i) cursors.cursors[i].holding = -1;
    settleCpu(i);
  };
  const setMode = (v: MatchMode) => {
    if (mode === v) return;
    const was = mode;
    const wasCommander = [false, false, ...[2, 3].map(commanderSlot)];
    mode = v;
    for (const k of [2, 3]) {
      if (mode === "1v1") {
        if (cursors.cursors[k].holding >= 0) cursors.cursors[k].holding = -1;
      } else if (was === "1v1") {
        if (present(k)) makeHuman(k);
        else vacant(k);
      } else if (wasCommander[k] !== commanderSlot(k)) {
        if (slots[k].open) makeOpen(k);
        else if (slots[k].cpu) {
          slots[k].ready = false;
          settleCpu(k);
        } else makeHuman(k);
      }
    }
    if (!fields().includes(mapIndex)) {
      mapIndex = fields()[0] ?? mapIndex;
      beginAttractWorldOnly();
    }
  };
  const enterSelect = () => {
    const here = [0, 1, 2, 3].filter(present).length;
    const keptCpu = (i: number) => netMode === "host" && slots[i].cpu && slots[i].autoCpu === false && !slots[i].open;
    if (here >= 3) { if (mode === "1v1") mode = "2v2"; }
    else if (netMode === "host" && mode !== "ffa" && !(mode === "2v2" && [2, 3].some(keptCpu))) mode = "1v1";
    cursors.setScale(pixel.w, pixel.h);
    cursors.reset(mode === "ffa" ? [0, 1, 2, 3] : mode === "2v2" ? [0, 2, 1, 3] : [0, 1]);
    slots.forEach((sl, i) => {
      const keep = keptCpu(i);
      sl.ready = false;
      if (present(i)) { sl.autoCpu = false; makeHuman(i); }
      else if (keep) {
        makeCpu(i);
        sl.autoCpu = false;
      } else vacant(i);
    });
    readySince = -1;
  };
  const selectReady = () => slots.every((sl, i) => !slotActive(i) || (sl.ready && !sl.open && heldBy(i) < 0)) && cursors.cursors.every((c) => !c.active || c.holding < 0 || !slotActive(c.holding));
  let state: State = "title";
  const stickLatch = [false, false, false, false];
  const randomHero = () => roster[Math.floor(Math.random() * roster.length)];
  let overAt = -1;

  let people: boolean[] = [];
  const linkMates = () => {
    bots.forEach((b, i) => {
      if (!b) return;
      const m = mode === "ffa" ? -1 : people.findIndex((h, j) => h && j !== i && j % 2 === i % 2);
      b.mate = m < 0 ? null : m;
    });
  };
  const setupControl = (humans: boolean[], levels: number[] = [], remote: boolean[] = [], botsToo = true) => {
    mappers = humans.map((h, i) => {
      if (!h) return null;
      const m = new CommandMapper(inputData.cstickFlickThreshold, commanderSlot(i));
      if (inputData.smashDodge) m.smash = inputData.smashDodge;
      return m;
    });
    bots = humans.map((h, i) => (h || remote[i] || !botsToo ? null : new Bot(i, [0.5, 0.75, 0.95][(levels[i] ?? 2) - 1] ?? 0.75, seed + i)));
    people = humans.map((h, i) => h || !!remote[i]);
    linkMates();
    view.setHumans(humans);
  };
  const buildWorld = (spec: MatchSpec): World => {
    const mi = maps.findIndex((m) => m.id === spec.map);
    mapIndex = mi < 0 ? 0 : mi;
    const w = new World(maps[mapIndex].data, applyRules(data, spec.rules), spec.seed);
    const ffa = spec.mode === "ffa";
    for (let p = 0; p < spec.players; p++) w.spawnHero(ffa || p < 2 || spec.rules.partners === 1 ? spec.heroes[p] ?? roster[0] : commanderType, p, ffa ? p : p % 2);
    return w;
  };
  const startNetMatch = (spec: MatchSpec, local: boolean[], remote: boolean[]) => {
    players = spec.players;
    mode = spec.mode ?? (spec.players === 4 ? "2v2" : "1v1");
    setupControl(local, spec.levels, remote, netMode !== "peer");
    show(buildWorld(spec));
    matchPlayers = spec.heroes.slice(0, spec.players).map((hero, i) => ({ tag: spec.names[i] ?? null, hero, team: mode === "ffa" ? i : i % 2, cpu: !spec.humans[i] }));
    recorded = false;
    fallen = [];
    state = "match";
    overAt = -1;
    acc = 0;
    netFrames = [];
    netHashes.clear();
    outFrames = [];
    outHashes = [];
    desync = false;
    screens.set("none");
    hud.show(true);
    hud.banner_("FIGHT!", performance.now() / 1000, 1.5, true);
    audio.ui("start");
  };

  const leaveNet = (why = "") => {
    net.close();
    netMode = "off";
    rseats.length = 0;
    peerNames.clear();
    mySlots.clear();
    wantSent = "";
    menus.netBusy = false;
    menus.netStatus = why;
    menus.netAddrs = [];
    screens.lobby = null;
  };
  const toMenu = (why?: string) => {
    if (netMode !== "off") leaveNet(why ?? "");
    if (state === "match" || state === "paused" || state === "results" || state === "lobby") beginAttract();
    state = "menu";
    menus.open("main");
    screens.set("none");
    hud.show(false);
    menus.tagSlot = -1;
  };

  const beginAttract = () => {
    players = houses(mapIndex) === 4 ? 4 : 2;
    setupControl(Array(players).fill(false));
    show(newWorld(Array.from({ length: players }, randomHero), players));
    state = "title";
    screens.set("title");
    hud.show(false);
  };

  const beginMatch = () => {
    players = mode === "1v1" ? 2 : 4;
    const humans = slots.slice(0, players).map((s) => s.joined && !s.cpu);
    for (let i = 0; i < players; i++) {
      const sl = slots[i];
      if (!sl.open) continue;
      sl.open = false;
      sl.cpu = true;
      sl.joined = false;
      if (!commanderSlot(i)) sl.hero = randomHero();
    }
    const humans0 = slots.slice(0, players).map((s) => s.joined && !s.cpu);
    void humans0;
    const remote = slots.slice(0, players).map((_, i) => remoteAt(i) >= 0);
    const spec: MatchSpec = {
      map: maps[mapIndex].id, seed: seed++, rules: { ...save.data.rules }, heroes: slots.slice(0, players).map((s) => s.hero), players,
      levels: slots.slice(0, players).map((s) => s.level), humans, names: slots.slice(0, players).map((s) => (s.cpu ? null : s.tag ?? null)), mode,
    };
    for (const r of rseats) {
      r.queue = [];
      r.last = { moveX: 0, moveZ: 0 };
    }
    if (netMode === "host") net.toPeer("all", { t: "start", spec, seats: rseats.filter((r) => r.slot >= 0 && r.slot < players).map((r) => [r.peer, r.k, r.slot]) });
    startNetMatch(spec, humans.map((h, i) => h && !remote[i]), remote);
  };

  let matchPlayers: { tag: string | null; hero: string; team: number; cpu: boolean }[] = [];
  let recorded = true;
  let fallen: number[] = [];
  const mapHover = ["*", "*", "*", "*"];
  function toMap(): void {
    mapHover.fill("*");
    screens.readyBanner = false;
    readySince = -1;
    audio.ui("ok");
    state = "map";
    screens.set("map");
    if (!fields().includes(mapIndex) && fields().length) {
      mapIndex = fields()[0];
      beginAttractWorldOnly();
    }
    pickIndex = Math.max(0, fields().indexOf(mapIndex));
  }

  const fastForward = (seconds: number) => {
    const n = Math.floor(seconds * matchData.tickRate);
    for (let i = 0; i < n && world.match.phase !== "over"; i++) {
      world.step(commandsFor());
      world.events.length = 0;
    }
  };

  const dbg = { freeze: false, adv: 0, clock: 0, puppet: [] as (Command | null)[] };
  const commandsFor = (): Command[] =>
    Array.from({ length: players }, (_, i) => {
      const pz = dbg.puppet[i];
      if (pz) {
        dbg.puppet[i] = { moveX: pz.moveX, moveZ: pz.moveZ, block: pz.block };
        return pz;
      }
      const m = mappers[i];
      if (m) return m.take();
      const b = bots[i];
      if (b) return b.command(world);
      if (netMode === "host" && state === "match") {
        const r = seatAt(i);
        if (r) {
          const c = mergeCommands(r.queue, r.last);
          r.queue = [];
          r.last = c;
          return c;
        }
      }
      return { moveX: 0, moveZ: 0 };
    });
  const localPad = () => {
    const k = pads.keyboardSlot();
    const i = pads.players.findIndex((p) => p.connected);
    return i >= 0 ? i : k;
  };

  if (params.get("screen") === "select" || params.get("screen") === "map") {
    if (!fields().includes(mapIndex)) mapIndex = fields()[0] ?? mapIndex;
    if (params.get("map") !== "random") pickIndex = Math.max(0, fields().indexOf(mapIndex));
    beginAttract();
    state = params.get("screen") === "map" ? "map" : "select";
    enterSelect();
    if (params.get("heroes")) params.get("heroes")!.split(",").forEach((h, i) => {
      if (!slots[i] || !roster.includes(h)) return;
      slots[i].hero = h;
      if (slots[i].cpu && !commanderSlot(i)) cursors.placeChip(i, h);
    });
    for (let r = 0; r < Number(params.get("ready") ?? 0); r++) {
      if (!slots[r] || commanderSlot(r)) continue;
      slots[r].ready = true;
      if (cursors.cursors[r].holding === r) cursors.cursors[r].holding = -1;
      cursors.placeChip(r, slots[r].hero);
    }
    screens.set(state === "map" ? "map" : "select");
  } else if (params.get("screen") === "menu") {
    beginAttract();
    toMenu();
    const pg = params.get("page");
    if (pg === "players" || pg === "network" || pg === "rules" || pg === "options" || pg === "records" || pg === "controls" || pg === "codex") menus.page = pg;
    menus.tab = Number(params.get("tab") ?? 0);
  } else if (params.has("bots")) {
    setupControl([false, false]);
    beginMatchWithBots();
  } else beginAttract();

  function beginMatchWithBots(): void {
    const hs = (params.get("heroes") ?? "").split(",").filter((h) => roster.includes(h));
    if (houses(mapIndex) === 4 && params.has("map")) mode = "ffa";
    if (!fields().includes(mapIndex)) mapIndex = fields()[0] ?? mapIndex;
    players = mode === "1v1" ? 2 : 4;
    setupControl(Array(players).fill(false));
    show(newWorld([hs[0] ?? randomHero(), hs[1] ?? hs[0] ?? randomHero(), ...hs.slice(2), ...(mode === "ffa" ? Array.from({ length: Math.max(0, players - Math.max(2, hs.length)) }, randomHero) : [])], players, false, params.has("partners")));
    state = "match";
    screens.set("none");
    hud.show(true);
    const t = Number(params.get("time") ?? 0);
    if (t > 0) fastForward(t);
    const rk = Number(params.get("rank") ?? 0);
    if (rk > 0) {
      const need = world.data.units.veterancy.killsForRank[Math.min(rk, 3) - 1];
      let i = 0;
      for (const e of world.entities) if (e.alive && e.unit) world.promote(e, i++ % 2 === 0 ? need : world.data.units.veterancy.killsForRank[0]);
    }
    if (params.has("plant")) {
      world.teams.forEach((ts, team) => {
        const h = world.heroOf(team);
        if (h) ts.banner = { x: h.transform.pos.x + 2, z: h.transform.pos.z + 1, until: world.time + 60 };
      });
    }
    const sp = params.get("spawn");
    if (sp) {
      const [x, z] = sp.split(",").map(Number);
      world.players.forEach((p, i) => {
        const e = world.getAny(p.heroId);
        if (e) world.teleport(e, x + i * 2.5, z + i * 0.5);
      });
    }
    if (params.has("wall")) {
      for (const pl of world.players) {
        const e = world.getAny(pl.heroId);
        if (!e || pl.heroType !== "warden") continue;
        forceAbility(world, e, "r", pl.team === 0 ? 1 : -1, 0);
        fastForward(1);
      }
    }
    if (params.has("works")) {
      for (const pl of world.players) {
        const e = world.getAny(pl.heroId);
        if (!e || pl.heroType !== "engineer") continue;
        const dir = pl.team === 0 ? 1 : -1;
        forceAbility(world, e, "r", dir, 0);
        fastForward(1);
        const m = world.mods.find((k) => k.kind === "works" && k.owner === e.id);
        if (m && params.get("works") !== "ground") world.teleport(e, m.cx!, m.cz!);
        forceAbility(world, e, "z", dir, 0);
        fastForward(1);
      }
    }
  }

  if (import.meta.env.DEV || params.has("debug")) (window as unknown as { grudge: unknown }).grudge = { Bot, dbg, hud, screens, levelUp: (player: number, picks: number[]) => {
    const e = world.heroForPlayer(player);
    if (!e?.hero) return [];
    gainXp(world, e, 99999);
    for (const k of picks) learn(world, e, k);
    while (e.hero.picks.length) learn(world, e, 0);
    return allLearned(world, e).map((t) => t.id);
  }, pause: () => setPaused(true), endMatch: (winner = 0) => {
    world.match.phase = "over";
    world.match.winner = winner;
    world.match.reason = "core destroyed";
  }, setLobby: () => {
    state = "lobby";
    screens.set("lobby");
  }, bots: () => bots, humanize: (i: number) => {
    mappers[i] = new CommandMapper(inputData.cstickFlickThreshold, commanderSlot(i));
    bots[i] = null;
    view.setHumans(mappers.map((m) => !!m));
  }, pads, slots, cursors, menus, save, view, get state() { return state; }, get world() { return world; }, get net() { return { mode: netMode, open: net.open, role: net.role, sent: lobbySentAt, desync, mySlot: [...mySlots.values()][0] ?? -1, mySlots: Object.fromEntries(mySlots), frames: netFrames.length, remotes: rseats.map((r) => [r.peer, r.k, r.slot]) }; } };

  let last = performance.now();
  let acc = 0;

  const freeRemoteSlot = (): number => {
    for (const i of [1, 2, 3, 0]) if (!pads.players[i].connected && !(i < forceJoin) && !seatAt(i) && (slots[i].open || slots[i].autoCpu)) return i;
    return -1;
  };
  const seatRemote = (r: RSeat) => {
    if (r.slot >= 0) return;
    const i = freeRemoteSlot();
    if (i < 0) return;
    r.slot = i;
    if ([0, 1, 2, 3].filter(present).length >= 3 && mode === "1v1") setMode("2v2");
    slots[i].autoCpu = false;
    makeHuman(i);
    slots[i].tag = r.name;
    if (i >= 2 && mode === "1v1") setMode("2v2");
  };
  const lobbyView = () => ({
    build: __BUILD__,
    math: MATH,
    rules: save.data.rules,
    mode,
    map: pickIndex >= fields().length ? "RANDOM FIELD" : (maps[fields()[pickIndex]]?.data.name ?? maps[mapIndex].data.name).toUpperCase(),
    phase: state === "match" || state === "paused" || state === "results" ? "match" : "lobby",
    slots: slots.map((s, i): LobbySlot => ({ hero: s.hero, ready: s.ready, cpu: s.cpu, open: !!s.open, name: s.tag ?? null, remote: remoteAt(i) >= 0 ? remoteAt(i) : pads.players[i].connected ? 0 : -1, local: seatAt(i)?.k ?? 0, active: slotActive(i), commander: commanderSlot(i) })),
  });
  const freeSeat = (r: RSeat, now: number) => {
    const i = r.slot;
    r.slot = -1;
    if (i < 0) return;
    slots[i].tag = undefined;
    if (state === "select" || state === "map") makeOpen(i);
    else if (i < players) {
      bots[i] = new Bot(i, 0.75, seed + i);
      people[i] = false;
      linkMates();
      hud.banner_(`${r.name} LEFT · A CPU TAKES OVER`, now, 2.5);
    }
  };
  const netFromPeer = (id: number, m: NetMsg) => {
    if (m.t === "want") {
      const ks = ((m.ks as number[]) ?? []).filter((k) => k >= 0 && k < 4).slice(0, 4);
      for (const r of rseats.filter((q) => q.peer === id && !ks.includes(q.k))) {
        if (state !== "match" && state !== "paused") freeSeat(r, performance.now() / 1000);
        else continue;
        rseats.splice(rseats.indexOf(r), 1);
      }
      for (const k of ks) {
        if (rseats.some((q) => q.peer === id && q.k === k)) continue;
        const n = peerNames.get(id) ?? "GUEST";
        const nm = ks.length > 1 ? `${n.slice(0, 6)}${k + 1}` : n;
        rseats.push({ peer: id, k, slot: -1, name: nm, queue: [], last: { moveX: 0, moveZ: 0 } });
      }
      lobbySentAt = 0;
      return;
    }
    const r = rseats.find((q) => q.peer === id && q.k === Number(m.k ?? 0));
    if (!r) {
      if (m.t === "pause" && (state === "match" || state === "paused") && rseats.some((q) => q.peer === id)) setPaused(state === "match");
      return;
    }
    const i = r.slot;
    if (m.t === "tag" && i >= 0) {
      const t = m.tag === null ? null : String(m.tag ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 6);
      slots[i].tag = t || undefined;
      if (!t) slots[i].tag = r.name;
      lobbySentAt = 0;
      return;
    }
    if (m.t === "seat" && state === "select") {
      const to = Number(m.slot);
      const tgt = slots[to];
      if (!tgt || !slotActive(to) || commanderSlot(to) || to === i || seatAt(to) || pads.players[to]?.connected || !(tgt.open || tgt.autoCpu)) return;
      const hero = i >= 0 ? slots[i].hero : roster[0];
      if (i >= 0) {
        slots[i].tag = undefined;
        makeOpen(i);
      }
      r.slot = to;
      slots[to].autoCpu = false;
      makeHuman(to);
      slots[to].hero = hero;
      slots[to].tag = r.name;
      lobbySentAt = 0;
      audio.ui("move");
      return;
    }
    if (m.t === "cmd" && i >= 0 && (state === "match" || state === "paused")) {
      if (r.queue.length < 30) r.queue.push(m.c as Command);
    } else if (m.t === "pick" && i >= 0 && state === "select" && !slots[i].ready && roster.includes(String(m.hero)) && !commanderSlot(i)) {
      slots[i].hero = String(m.hero);
    } else if (m.t === "ready" && i >= 0 && state === "select" && !commanderSlot(i)) {
      slots[i].ready = !!m.on;
      cursors.placeChip(i, slots[i].ready ? slots[i].hero : null);
      if (!slots[i].ready && cursors.cursors[i].holding < 0) cursors.cursors[i].holding = i;
      if (slots[i].ready && cursors.cursors[i].holding === i) cursors.cursors[i].holding = -1;
      audio.ui(m.on ? "ok" : "back");
    } else if (m.t === "pause" && (state === "match" || state === "paused")) {
      setPaused(state === "match");
    }
  };
  const setPaused = (on: boolean) => {
    if (on) {
      menus.openPause();
      menus.currentMap = maps[mapIndex]?.data.name ?? "";
    }
    state = on ? "paused" : "match";
    screens.set(on ? "pause" : "none");
    hud.show(!on);
    if (netMode === "host") net.toPeer("all", { t: "pause", on });
  };
  const pumpNet = (now: number) => {
    for (const m of net.drain()) {
      if (m.t === "closed" || m.t === "hostgone") {
        if (netMode !== "off" || menus.netBusy) {
          const why = m.t === "hostgone" || netMode === "peer" ? "THE HOST HAS LEFT" : menus.netBusy ? net.status || "COULD NOT REACH THE HOST" : "LOST THE CONNECTION";
          const onPage = state === "menu";
          toMenu(why);
          if (!onPage) {
            state = "menu";
            menus.open("network");
          }
        }
        continue;
      }
      if (m.t === "error") {
        leaveNet(String(m.msg));
        continue;
      }
      if (m.t === "hosting") {
        netMode = "host";
        hostAddrs = (m.addrs as string[]) ?? [];
        hostPublic = String(m.public ?? "");
        menus.netBusy = false;
        menus.netStatus = "";
        state = "select";
        enterSelect();
        screens.set("select");
        continue;
      }
      if (m.t === "welcome") {
        netMode = "peer";
        net.id = Number(m.id);
        menus.netBusy = false;
        mySlots.clear();
        myReady.fill(false);
        myHero.fill("");
        wantSent = "";
        state = "lobby";
        screens.set("lobby");
        continue;
      }
      if (netMode === "host") {
        if (m.t === "joined") {
          peerNames.set(Number(m.id), String(m.name ?? "GUEST").toUpperCase().slice(0, 8));
          audio.ui("ok");
          lobbySentAt = 0;
        } else if (m.t === "left") {
          const id = Number(m.id);
          peerNames.delete(id);
          for (const r of rseats.filter((q) => q.peer === id)) {
            freeSeat(r, now);
            rseats.splice(rseats.indexOf(r), 1);
          }
        } else if (m.t === "from") netFromPeer(Number(m.id), m.msg as NetMsg);
        continue;
      }
      if (netMode === "peer") {
        if (m.t === "lobby") {
          const lv = m.view as ReturnType<typeof lobbyView>;
          if (lv.build && lv.build !== __BUILD__) {
            leaveNet("THE HOST RUNS ANOTHER VERSION · REFRESH BOTH PAGES");
            state = "menu";
            menus.open("network");
            continue;
          }
          if (lv.math && lv.math !== MATH && !mathWarned) {
            mathWarned = true;
            hud.banner_("DIFFERENT BROWSER FROM THE HOST · USE THE SAME ONE OR YOU MAY DESYNC", now, 6);
          }
          mySlots.clear();
          lv.slots.forEach((s, i) => { if (s.remote === net.id) mySlots.set(s.local ?? 0, i); });
          for (const [k, i] of mySlots) if (!myHero[k]) myHero[k] = lv.slots[i].hero;
          const anyDevice = pads.players.some((p) => p.connected);
          const status = lv.phase === "match" ? "" : !anyDevice ? "PRESS A BUTTON ON A CONTROLLER OR KEYBOARD TO TAKE A SEAT" : !mySlots.size ? "THE BATTLE IS FULL · WAITING FOR A SEAT" : "";
          screens.lobby = { ...lv, mine: [...mySlots.values()], status };
          if (state === "results" || state === "match" || state === "paused") {
            if (lv.phase === "lobby") {
              state = "lobby";
              myReady.fill(false);
              screens.set("lobby");
              hud.show(false);
              beginAttractWorldOnly();
            }
          }
        } else if (m.t === "start") {
          const spec = m.spec as MatchSpec;
          mySlots.clear();
          for (const [peer, k, slot] of (m.seats as [number, number, number][]) ?? []) if (peer === net.id) mySlots.set(k, slot);
          if (!mySlots.size) continue;
          const mine = new Set(mySlots.values());
          const local = Array.from({ length: spec.players }, (_, i) => mine.has(i));
          startNetMatch(spec, local, local.map(() => false));
        } else if (m.t === "fs") {
          for (const f of m.f as Frame[]) netFrames.push(f);
          for (const [k, v] of (m.h as [number, number][]) ?? []) netHashes.set(k, v);
        } else if (m.t === "pause") {
          if (state === "match" || state === "paused") {
            state = m.on ? "paused" : "match";
            screens.set(m.on ? "pause" : "none");
          }
        }
      }
    }
    if (netMode === "peer" && net.open) {
      const ks = JSON.stringify(pads.players.map((p, k) => (p.connected ? k : -1)).filter((k) => k >= 0));
      if (ks !== wantSent || now - wantAt > 1.5) {
        wantSent = ks;
        wantAt = now;
        net.toHost({ t: "want", ks: JSON.parse(ks) });
      }
    }
    if (netMode === "host" && now - lobbySentAt > 0.25) {
      lobbySentAt = now;
      const seated = rseats.filter((r) => r.slot >= 0).length;
      const localHumans = slots.filter((s, i) => !s.cpu && !s.open && slotActive(i) && remoteAt(i) < 0).length;
      net.meta({
        name: `${(save.tagNames()[0] ?? "HOST").toUpperCase()}'S BATTLE`,
        mode: mode === "ffa" ? "FREE FOR ALL" : mode === "2v2" ? "2 VS 2" : "1 VS 1",
        map: pickIndex >= fields().length ? "RANDOM" : (maps[fields()[pickIndex]]?.data.name ?? maps[mapIndex].data.name).toUpperCase(),
        humans: Math.max(1, localHumans + seated),
        seats: 4,
        phase: state === "match" || state === "paused" || state === "results" ? "match" : "lobby",
      });
      if (state === "select") {
        for (const r of rseats) if (r.slot >= 0 && pads.players[r.slot].connected) freeSeat(r, now);
        for (const r of rseats) seatRemote(r);
      }
      net.toPeer("all", { t: "lobby", view: lobbyView() });
    }
  };

  let fpsFrames = 0;
  let fpsAt = 0;
  let fpsShown = 0;
  const frame = (nowMs: number): void => {
    let now = nowMs / 1000;
    let dt = Math.max(0, Math.min(0.25, (nowMs - last) / 1000));
    last = nowMs;
    if (dbg.freeze) {
      dt = dbg.adv;
      dbg.adv = 0;
      dbg.clock += dt;
      now = dbg.clock;
    }

    pads.poll();
    pumpNet(now);
    pads.mouseClaims = !pads.players.some((p) => p.connected && p.profile !== "keyboard");
    if (cursors.mouseUsed && pads.keyboardSlot() < 0 && pads.mouseClaims) pads.claimKeyboard();
    cursors.mouseSlot = pads.keyboardSlot();
    for (const p of pads.players) {
      if ((p.pressed.start && p.held.z) || (p.pressed.z && p.held.start)) showPads = !showPads;
    }
    const anyPressed = (k: keyof (typeof pads.players)[0]["pressed"]) => pads.players.some((p) => p.pressed[k]);
    if (pads.players.some((p) => Object.values(p.pressed).some(Boolean))) audio.unlock();

    pads.typing = !!kbEditor();
    if (state !== "select" && state !== "lobby") {
      screens.naming.clear();
      cursors.frozen.clear();
    }
    if (state !== "lobby") cursors.tagOf = null;
    if (state === "title") {
      if (anyPressed("start") || anyPressed("a") || cursors.takeClick()) {
        audio.ui("ok");
        toMenu();
      }
    } else if (state === "menu") {
      const r = menus.update(readNav(now), cursors.takeMouse(), (k) => audio.ui(k));
      if (r === "options") applyOptions();
      if (r === "host" || r === "join") {
        menus.netBusy = true;
        menus.netStatus = r === "host" ? "OPENING THE GATES..." : "TAKING A SEAT...";
        menus.netAddrs = [];
        const name = save.tagNames()[0] ?? (r === "host" ? "HOST" : "GUEST");
        if (r === "host") net.host(name);
        else net.join(name, params.get("host") ?? undefined, menus.joinRoom ?? undefined);
      } else if (r === "leave") leaveNet("");
      if (menus.page === "browse" && now - menus.roomsAt > 2 && !roomFetch) {
        menus.roomsAt = now;
        const hostParam = params.get("host");
        const base = hostParam ? `${location.protocol === "https:" ? "https" : "http"}://${hostParam}` : "";
        roomFetch = true;
        fetch(`${base}/net/info`, { cache: "no-store" })
          .then((res) => res.json())
          .then((j: { rooms?: RoomInfo[] }) => {
            menus.rooms = (j.rooms ?? []).sort((a, b) => Number(a.phase !== "lobby") - Number(b.phase !== "lobby") || b.humans - a.humans);
            menus.roomsError = "";
            if (menus.focus > menus.rooms.length) menus.focus = menus.rooms.length;
          })
          .catch(() => {
            menus.rooms = [];
            menus.roomsError = "COULD NOT REACH THE SERVER";
          })
          .finally(() => { roomFetch = false; });
      }
      if (r === "fight") {
        state = "select";
        enterSelect();
        screens.set("select");
      } else if (r === "title") beginAttract();
    } else if (state === "select" && menus.tagSlot >= 0) {
      cursors.setScale(pixel.w, pixel.h);
      for (const act of cursors.update(padsForCursors(), dt, now, () => false)) {
        if (act.type === "button" && act.id.startsWith("tg:")) {
          audio.ui("move");
          finishTag(menus.tagAction(act.id));
        } else if (act.type === "back") {
          audio.ui("back");
          menus.tagBack();
        }
      }
      screens.updateSelect(slots, data.heroes.heroes, roster, mode, save.data.rules.partners === 1);
      screens.hosting = netMode === "host";
    } else if (state === "select") {
      cursors.setScale(pixel.w, pixel.h);
      if (mode === "1v1" && [0, 1, 2, 3].filter(present).length >= 3) setMode("2v2");
      slots.forEach((sl, i) => {
        sl.local = pads.players[i].connected;
        if (present(i) && (sl.open || (sl.cpu && sl.autoCpu))) { sl.autoCpu = false; makeHuman(i); }
        if (!present(i) && !sl.cpu && !sl.open) vacant(i);
        if (netMode !== "host" && sl.open) { makeCpu(i); sl.autoCpu = true; }
      });
      runNaming((slot) => (pads.players[slot]?.connected ? slot : -1), now);
      const acts = cursors.update(cursorPads(padsForCursors()), dt, now, (slot, by) => slotActive(slot) && !commanderSlot(slot) && (slot === by ? !slots[slot].cpu : slots[slot].cpu));
      for (const act of acts) {
        if (act.type === "hover") {
          if (!slots[act.slot].ready && slots[act.slot].hero !== act.hero) { slots[act.slot].hero = act.hero; audio.ui("move"); }
        } else if (act.type === "place") {
          slots[act.slot].hero = act.hero;
          slots[act.slot].ready = true;
          audio.ui("ok");
        } else if (act.type === "pick") {
          slots[act.slot].ready = false;
          audio.ui("move");
        } else if (act.type === "button") {
          const [id, arg] = act.id.split(":");
          const i = Number(arg);
          if (id === "unplug") {
            pads.release(i);
            audio.ui("back");
          } else if (id === "mode") {
            setMode(mode === "1v1" ? "2v2" : mode === "2v2" ? "ffa" : "1v1");
            audio.ui("ok");
          } else if (id === "add") {
            if (mode === "1v1") setMode("2v2");
            audio.ui("ok");
          } else if (id === "sit") {
            const from = act.by;
            const ok = from >= 0 && from !== i && slotActive(i) && !commanderSlot(i) && !seatAt(i) && pads.players[from]?.connected && !pads.players[i]?.connected && (slots[i].open || slots[i].cpu);
            if (ok && pads.move(from, i)) {
              const hero = slots[from].hero;
              const tag = slots[from].tag;
              const cf = cursors.cursors[from];
              const ct = cursors.cursors[i];
              ct.x = cf.x;
              ct.y = cf.y;
              cf.holding = -1;
              slots[from].tag = undefined;
              if (netMode === "host") makeOpen(from);
              else {
                makeCpu(from);
                slots[from].autoCpu = true;
              }
              slots[i].autoCpu = false;
              makeHuman(i);
              if (roster.includes(hero)) slots[i].hero = hero;
              slots[i].tag = tag;
              lobbySentAt = 0;
              audio.ui("ok");
            } else audio.ui("back");
          } else if (id === "seatcpu") {
            makeCpu(i);
            slots[i].autoCpu = false;
            audio.ui("ok");
          } else if (id === "seatopen") {
            makeOpen(i);
            audio.ui("back");
          } else if (id === "camera") {
            const order = [1, 2, 0];
            save.data.options.split = order[(order.indexOf(save.data.options.split) + 1) % order.length];
            save.write();
            applyOptions();
            audio.ui("ok");
          } else if (id === "kind") {
            if (slots[i].cpu && present(i)) makeHuman(i);
            else if (!slots[i].cpu) { makeCpu(i); slots[i].autoCpu = false; }
            audio.ui("ok");
          } else if (id === "lvl") {
            slots[i].level = (slots[i].level % 3) + 1;
            audio.ui("move");
          } else if (id === "tag" && !slots[i].cpu && !commanderSlot(i) && act.by === i && !screens.naming.has(i)) {
            screens.naming.set(i, new NameEntry(slots[i].tag, () => save.tagNames(), MAX_TAG));
            audio.ui("ok");
          } else if (id === "go" && selectReady()) {
            toMap();
          }
        } else if (act.type === "back") {
          const c = cursors.cursors[act.by];
          if (c.holding >= 0 && c.holding !== act.by) {
            const sl = slots[c.holding];
            cursors.placeChip(c.holding, sl.hero);
            sl.ready = true;
            c.holding = -1;
            audio.ui("back");
          } else if (c.holding < 0 && !slots[act.by].cpu && slots[act.by].ready && !commanderSlot(act.by)) {
            slots[act.by].ready = false;
            cursors.placeChip(act.by, null);
            c.holding = act.by;
            audio.ui("back");
          } else if (c.holding === act.by || slots[act.by].cpu || commanderSlot(act.by)) {
            audio.ui("back");
            toMenu();
          }
        }
      }
      screens.updateSelect(slots, data.heroes.heroes, roster, mode, save.data.rules.partners === 1);
      screens.hosting = netMode === "host";
      const allReady = selectReady();
      if (allReady && readySince < 0) readySince = now;
      if (!allReady) readySince = -1;
      screens.readyBanner = allReady;
      screens.openHint = !allReady && slots.some((sl, i) => slotActive(i) && sl.open) && slots.every((sl, i) => !slotActive(i) || sl.open || (sl.ready && heldBy(i) < 0));
      if (allReady && now - readySince > 0.25 && anyPressed("start") && !namingAte && !screens.naming.size) toMap();
    } else if (state === "map") {
      cursors.setScale(pixel.w, pixel.h);
      let back = false;
      let go = anyPressed("start");
      for (const act of cursors.update(padsForCursors(), dt, now, () => false)) {
        if (act.type === "back") back = true;
        if (act.type === "button" && act.id.startsWith("map:")) {
          pickIndex = Number(act.id.slice(4));
          go = true;
        }
      }
      const hov = cursors.cursors.find((c, i) => c.active && c.hover.startsWith("map:") && mapHover[i] !== "*" && c.hover !== mapHover[i]);
      cursors.cursors.forEach((c, i) => (mapHover[i] = c.hover));
      if (hov) {
        const k = Number(hov.hover.slice(4));
        if (k !== pickIndex) {
          pickIndex = k;
          audio.ui("move");
          if (pickIndex < fields().length && fields()[pickIndex] !== mapIndex) {
            mapIndex = fields()[pickIndex];
            beginAttractWorldOnly();
          }
        }
      }
      if (go) {
        audio.ui("ok");
        const pool = fields();
        if (pickIndex >= pool.length) mapIndex = pool[Math.floor(Math.random() * pool.length)] ?? mapIndex;
        else mapIndex = pool[pickIndex];
        beginMatch();
      } else if (back) {
        audio.ui("back");
        state = "select";
        screens.set("select");
        for (let i = 0; i < MAX_PLAYERS; i++) {
          if (!slotActive(i) || commanderSlot(i) || slots[i].cpu) continue;
          slots[i].ready = false;
          cursors.placeChip(i, null);
          cursors.cursors[i].holding = i;
        }
      }
    } else if (state === "lobby") {
      const lb = screens.lobby;
      cursors.setScale(pixel.w, pixel.h);
      cursors.tagOf = (k) => mySlots.get(k) ?? -1;
      if (lb) {
        const held = (i: number) => cursors.cursors.some((c) => c.active && c.holding === i);
        lb.slots.forEach((sl, i) => {
          if (!held(i)) cursors.placeChip(i, sl.ready && !sl.open && sl.active && !sl.commander ? sl.hero : null);
        });
        for (const [k, i] of mySlots) {
          const sl = lb.slots[i];
          if (lb.phase === "lobby" && !sl.ready && !sl.commander && !held(i) && !dropped.has(i)) cursors.cursors[k].holding = i;
          if (sl.ready) dropped.delete(i);
        }
        for (const c of cursors.cursors) if (c.holding >= 0 && ![...mySlots.values()].includes(c.holding)) c.holding = -1;
        const kOf = (i: number) => [...mySlots].find(([, v]) => v === i)?.[0] ?? -1;
        runNaming((slot) => [...mySlots].find(([, v]) => v === slot)?.[0] ?? -1, now);
        const acts = cursors.update(cursorPads(pads.players), dt, now, (slot, by) => lb.phase === "lobby" && mySlots.get(by) === slot && !lb.slots[slot].commander);
        let leave = false;
        for (const act of acts) {
          if (act.type === "hover") {
            const k = kOf(act.slot);
            if (k >= 0 && lb.slots[act.slot].hero !== act.hero) {
              lb.slots[act.slot].hero = act.hero;
              myHero[k] = act.hero;
              net.toHost({ t: "pick", k, hero: act.hero });
              audio.ui("move");
            }
          } else if (act.type === "place") {
            const k = kOf(act.slot);
            if (k < 0) continue;
            lb.slots[act.slot].hero = act.hero;
            lb.slots[act.slot].ready = true;
            myHero[k] = act.hero;
            myReady[k] = true;
            net.toHost({ t: "pick", k, hero: act.hero });
            net.toHost({ t: "ready", k, on: true });
            audio.ui("ok");
          } else if (act.type === "pick") {
            const k = kOf(act.slot);
            if (k < 0) continue;
            lb.slots[act.slot].ready = false;
            myReady[k] = false;
            net.toHost({ t: "ready", k, on: false });
            audio.ui("move");
          } else if (act.type === "button") {
            const [id, arg] = act.id.split(":");
            const i = Number(arg);
            if (id === "tag" && mySlots.get(act.by) === i && !screens.naming.has(i)) {
              screens.naming.set(i, new NameEntry("", () => save.tagNames(), MAX_TAG));
              audio.ui("ok");
            } else if (id === "take" && mySlots.has(act.by)) {
              const from = mySlots.get(act.by)!;
              cursors.cursors[act.by].holding = -1;
              dropped.delete(from);
              net.toHost({ t: "seat", k: act.by, slot: i });
              audio.ui("ok");
            } else if (id === "unplug") {
              const k = kOf(i);
              if (k >= 0) {
                pads.release(k);
                audio.ui("back");
              }
            }
          } else if (act.type === "back") {
            if (cursors.cursors[act.by]?.holding >= 0) {
              dropped.add(cursors.cursors[act.by].holding);
              cursors.cursors[act.by].holding = -1;
            } else leave = true;
          }
        }
        if (leave) {
          audio.ui("back");
          toMenu("");
          state = "menu";
          menus.open("network");
        } else {
          const ss: SelectSlot[] = lb.slots.map((sl, i) => ({
            joined: !sl.cpu && !sl.open, ready: sl.ready, hero: sl.hero, cpu: sl.cpu, level: 2, open: sl.open, tag: sl.name, local: sl.remote === net.id && mySlots.get(sl.local ?? 0) === i,
          }));
          screens.updateSelect(ss, data.heroes.heroes, roster, lb.mode, lb.rules.partners === 1);
          screens.hosting = false;
        }
      }
    } else if (state === "match") {
      if (anyPressed("start")) {
        if (netMode === "peer") net.toHost({ t: "pause" });
        else setPaused(true);
      }
      pads.players.forEach((p, pi) => {
        const i = netMode === "peer" ? mySlots.get(pi) ?? -1 : pi;
        const m = i >= 0 ? mappers[i] : null;
        if (!m) return;
        const h = world.heroForPlayer(i);
        m.update(p, now, !!h && h.alive && !!padNear(world, h), !!h && h.alive && world.arena.inShop(h), !!h?.hero?.picks.length, h?.alive && h.hero ? placeRanges(world, h) : null);
        if (view.camMode !== 0 && !commanderSlot(i)) {
          if (p.pressed.down) view.zoomStep(i, 1);
          if (p.pressed.up) view.zoomStep(i, -1);
        }
      });
      view.setMenus(mappers.map((m) => !!m && m.ui.buildMenu !== "closed"));
      view.setReticles(mappers.flatMap((m, i) => {
        const r = m?.ui.reticle;
        const h = r ? world.heroForPlayer(i) : undefined;
        return r && h ? [{ heroId: h.id, slot: r.slot, dx: r.dx, dz: r.dz, range: r.range }] : [];
      }));
      if (netMode === "peer") for (const [k, slot] of mySlots) if (mappers[slot]) net.toHost({ t: "cmd", k, c: packCommand(mappers[slot]!.take()) });
    } else if (state === "paused") {
      const r = menus.updatePause(readNav(now), cursors.takeMouse(), (k) => audio.ui(k));
      if (anyPressed("start") || r === "resume") {
        if (netMode === "peer") net.toHost({ t: "pause" });
        else setPaused(false);
      } else if (r === "quit") toMenu();
    } else if (state === "results" && netMode === "peer") {
      if (anyPressed("a") || anyPressed("start")) {
        state = "lobby";
        myReady.fill(false);
        screens.set("lobby");
        hud.show(false);
        beginAttractWorldOnly();
      }
    } else if (state === "results") {
      if (anyPressed("a") || anyPressed("start")) {
        state = "select";
        enterSelect();
        screens.set("select");
        beginAttractWorldOnly();
      }
    }

    if (state === "match" && netMode === "peer") {
      acc += dt;
      let ticks = 0;
      while (netFrames.length && (acc >= world.dt || netFrames.length > 2) && ticks < 12) {
        const f = netFrames.shift()!;
        if (f.k !== world.tick) desync = true;
        world.step(f.c);
        const want = netHashes.get(world.tick);
        if (want !== undefined) {
          if (want !== worldHash(world)) {
            if (!desync) hud.banner_("OUT OF SYNC WITH THE HOST · REJOIN", now, 4);
            desync = true;
          }
          netHashes.delete(world.tick);
        }
        acc = Math.max(0, acc - world.dt);
        ticks++;
      }
      if (!netFrames.length) acc = Math.min(acc, world.dt);
    } else if (state === "match" || state === "title" || (state === "menu" && menus.page === "main") || state === "results" || state === "lobby") {
      const hosting = netMode === "host" && state === "match";
      acc += dt;
      let ticks = 0;
      while (acc >= world.dt && ticks < matchData.maxTicksPerFrame) {
        const cmds = hosting ? commandsFor().map(packCommand) : commandsFor();
        if (hosting) outFrames.push({ k: world.tick, c: cmds });
        world.step(cmds);
        if (hosting && world.tick % 30 === 0) outHashes.push([world.tick, worldHash(world)]);
        acc -= world.dt;
        ticks++;
      }
      if (ticks === matchData.maxTicksPerFrame) acc = 0;
      if (hosting && outFrames.length) {
        net.toPeer("all", { t: "fs", f: outFrames, h: outHashes });
        outFrames = [];
        outHashes = [];
      }
    }
    if ((state === "title" || state === "menu" || state === "select" || state === "map") && world.match.phase === "over") beginAttractWorldOnly();
    if (state === "match" && world.match.phase === "over") {
      if (overAt < 0) {
        overAt = now;
        hud.banner_(world.match.winner < 0 ? "DRAW" : `${world.teamName(world.match.winner)} WINS`, now, 3, true);
      } else if (now - overAt > 3) {
        state = "results";
        if (!recorded && matchPlayers.some((p) => !p.cpu)) {
          recorded = true;
          save.record({ at: Date.now(), mode, map: maps[mapIndex].id, winner: world.match.winner, secs: world.time, players: matchPlayers }, world.teams.map((t) => t.heroKills));
        }
        screens.showResults(world, matchPlayers, menus.heroNames, fallen);
        screens.set("results");
        hud.show(false);
      }
    }

    if (state === "match" || state === "paused") hud.update(world, mappers.map((m) => m?.ui ?? null), now);
    if (state === "match") for (const ev of world.events) if (ev.type === "eliminated" && !fallen.includes(ev.team)) fallen.push(ev.team);
    if (state === "match") audio.handle(world.events, (x, y, z) => view.worldToScreen(x, y, z));
    audio.setMusic(state !== "paused", state === "match" && world.match.phase === "sudden" ? 1 : state === "match" ? 0.3 : 0);
    audio.update();
    view.cinematic = state === "select" || state === "map" || state === "lobby" || (state === "menu" && menus.page !== "main");
    const demoAlpha = runDemo(dt);
    view.render(state === "paused" ? 0 : demoAlpha ?? acc / world.dt, state === "paused" ? 0 : dt);
    const ctx = pixel.begin();
    const uiList = mappers.map((m) => m?.ui ?? null);
    hud.locate = view.splitCount ? null : (x, y, z) => view.worldToScreen(x, y, z);
    hud.split = view.splitCount;
    hud.rectOf = (pl) => view.viewRectOf(pl);
    hud.draw(ctx, pixel.w, pixel.h, world, uiList, now);
    screens.updateMaps(maps.map((m) => m.data), state === "map" ? pickIndex : Math.max(0, fields().indexOf(mapIndex)), fields(), mode);
    if (state === "select" || state === "lobby") screens.portraits?.renderStages();
    const viaDriver = pads.players.some((p) => p.connected && p.profile === "gc_adapter_uinput");
    const nativeGc = pads.players.some((p) => p.connected && p.profile === "gc_adapter_uinput");
    const gcText = viaDriver || nativeGc ? "GAMECUBE ADAPTER CONNECTED" : pads.gc.status.startsWith("LINUX") ? pads.gc.status : pads.gc.connected ? `GAMECUBE ADAPTER READY · ${pads.gc.ports.filter((p) => p.connected).length} CONTROLLER(S)` : pads.gc.status;
    const proText = pads.pro.count ? `${pads.pro.count} PRO CONTROLLER${pads.pro.count > 1 ? "S" : ""}` : pads.proWake.woken ? "PRO CONTROLLER AWAKE · PRESS G" : pads.pro.status || pads.proWake.status;
    screens.adapterStatus = [gcText, proText].filter(Boolean).join(" · ") || "G: GAMECUBE ADAPTER · P: WAKE A SWITCH 2 PRO CONTROLLER";
    screens.adapterDebug = pads.gc.debug();
    screens.draw(ctx, pixel.w, pixel.h, now);
    if (state === "menu") menus.draw(ctx, pixel.w, pixel.h, now);
    if (state === "paused") menus.drawPause(ctx, pixel.w, pixel.h, now, world);
    if (netMode === "host" && (state === "select" || state === "map")) {
      const joined = rseats.filter((r) => r.slot >= 0).length;
      const where = hostPublic ? hostPublic : hostAddrs[0] ? `http://${hostAddrs[0]}` : location.host;
      const t = `ONLINE · ${joined} FRIEND${joined === 1 ? "" : "S"} JOINED · OTHERS OPEN ${where} > VERSUS ONLINE > JOIN`;
      drawText(ctx, t, Math.round((pixel.w - textWidth(t, 0.6)) / 2), pixel.h - 9, "#f8e8a0", 0.6);
    }
    if (netMode !== "off" && (state === "match" || state === "paused")) {
      const t = desync ? "OUT OF SYNC" : netMode === "host" ? "HOSTING" : "ONLINE";
      drawText(ctx, t, 4, pixel.h - 9, desync ? "#ff6040" : "#c8c0a8", 0.55);
    }
    if (state === "select") {
      menus.drawTag(ctx, pixel.w, pixel.h, cursors, now);
      if (menus.tagSlot >= 0) cursors.drawCursors(ctx, now);
    }
    fpsFrames++;
    if (nowMs - fpsAt >= 500) {
      fpsShown = Math.round((fpsFrames * 1000) / (nowMs - fpsAt));
      fpsAt = nowMs;
      fpsFrames = 0;
    }
    if (save.data.options.fps) {
      const t = `${fpsShown} FPS`;
      const col = fpsShown >= 55 ? "#a0ff80" : fpsShown >= 30 ? "#ffe060" : "#ff6050";
      drawText(ctx, t, pixel.w - 4 - textWidth(t, 0.7), pixel.h - 10, col, 0.7);
    }
    padsEl.textContent = showPads ? pads.debugText() : "";
    requestAnimationFrame(frame);
  };

  const demoData = {
    ...data,
    units: { ...data.units, waves: { ...data.units.waves, firstSeconds: 1e9 } },
    match: { ...data.match, arena: { ...data.match.arena, relic: { ...data.match.arena.relic, firstSeconds: 1e9 }, ogre: { ...data.match.arena.ogre, firstSeconds: 1e9 }, cannon: { ...data.match.arena.cannon, firstSeconds: 1e9 } } },
  } as GameData;
  const demoMap = Math.max(0, maps.findIndex((m) => m.id === "crossing"));
  let demoBase = "";
  let demoLoop = 0;
  let demo: { key: string; w: World; t: number; acc: number; loop: number; len: number; presses: number[]; dist: number; btn: keyof Command; mapShown: boolean; kind: string } | null = null;
  const ALLY_KINDS = new Set(["warcry", "zone", "repair", "rally", "banner"]);
  const BIG = new Set(["quake", "zone", "summon", "rally", "warcry", "works", "ballista", "turret", "rootcage", "stealth", "teslatower", "palisade", "wall", "repair"]);
  const FAR = new Set(["leap", "dash", "hex", "reach", "shoot", "flurry"]);
  const DEMO_SPOT = { x: 23.5, z: 7 };
  function runDemo(dt: number): number | null {
    const spec = state === "menu" ? menus.codexDemo() : null;
    if (!spec || !menus.demoRect) {
      if (demo) {
        demo = null;
        view.demoCam = null;
        if (shownMap !== demoMap) view.setMap(mapViews[shownMap], world.terrain);
        view.setWorld(world);
      }
      return null;
    }
    const base = `${spec.hero}|${spec.slot}|${spec.picks}`;
    if (base !== demoBase) {
      demoBase = base;
      demoLoop = 0;
    }
    menus.demoPick = demoLoop;
    const pick = spec.picks ? demoLoop % spec.picks : -1;
    const key = `${base}|${pick}`;
    if (!demo || demo.key !== key) {
      const loop = demoLoop;
      const w = new World(maps[demoMap].data, demoData, 11);
      const me = w.spawnHero(spec.hero, 0, 0);
      const foe = w.spawnHero(spec.hero === "warlord" ? "warden" : "warlord", 1, 1);
      if (pick >= 0 && me.hero) {
        gainXp(w, me, 99999);
        for (const s2 of ["r", "b", "a", "z"] as const) {
          learn(w, me, s2 === spec.slot ? pick : 0);
          if (s2 === spec.slot) break;
        }
        while (me.hero.picks.length) learn(w, me, 0);
      }
      w.teleport(foe, 96, 44);
      foe.status.stunUntil = 1e9;
      foe.status.invulnUntil = 1e9;
      const kind = (me.hero?.ab ?? w.heroDef(spec.hero).abilities)[spec.slot].kind;
      const big = BIG.has(kind);
      const far = FAR.has(kind) || (spec.slot === "a" && kind === "shoot");
      const dist = kind === "works" ? 8 : big ? 4.5 : far ? 6.5 : 2.8;
      const presses = spec.slot === "a" ? [0.6, 0.95, 1.3, 1.65] : [0.6];
      const btn = ({ a: "attack", b: "secondary", r: "special", z: "super" } as const)[spec.slot];
      if (!demo || !demo.mapShown) view.setMap(mapViews[demoMap], w.terrain);
      view.setWorld(w);
      demo = { key, w, t: -1, acc: 0, loop, len: kind === "works" ? 5.5 : big ? 4.6 : 3.4, presses, dist, btn, mapShown: true, kind };
    }
    const d = demo;
    const w = d.w;
    const me = w.heroForPlayer(0)!;
    const reset = () => {
      w.teleport(me, DEMO_SPOT.x, DEMO_SPOT.z);
      me.transform.facing = me.transform.prevFacing = Math.PI / 2;
      me.alive = true;
      me.hp = me.maxHp;
      me.hero!.action = null;
      me.hero!.cooldowns = {};
      me.hero!.meter = 9999;
      me.status.stealthUntil = 0;
      me.status.hidden = false;
      for (const u of w.entities) if (u.unit || (u.structure && u.structure.padIndex < 0 && u.structure.type !== "core")) u.alive = false;
      w.zones.length = 0;
      w.traps.length = 0;
      for (const m of w.mods) m.until = w.time;
      const cx = DEMO_SPOT.x + d.dist + 1;
      for (let k = 0; k < 6; k++) {
        const u = spawnUnit(w, 1, "grunt", cx + Math.floor(k / 3) * 1.4, DEMO_SPOT.z - 1.4 + (k % 3) * 1.4, 1);
        if (u?.unit) {
          u.unit.damage = 0;
          u.transform.facing = u.transform.prevFacing = -Math.PI / 2;
        }
      }
      const td = w.teams[1].directives;
      td.grunt = td.ranged = td.heavy = "hold";
      td.holdPoint.grunt = { x: cx + 0.7, z: DEMO_SPOT.z };
      if (ALLY_KINDS.has(d.kind)) {
        for (let k = 0; k < 3; k++) {
          const u = spawnUnit(w, 0, "grunt", DEMO_SPOT.x - 1.2 + (k === 1 ? -0.8 : 0), DEMO_SPOT.z - 1.6 + k * 1.6, 1);
          if (u?.unit) {
            u.unit.damage = 0;
            u.transform.facing = u.transform.prevFacing = Math.PI / 2;
          }
        }
        const ad = w.teams[0].directives;
        ad.grunt = ad.ranged = ad.heavy = "hold";
        ad.holdPoint.grunt = { x: DEMO_SPOT.x - 1.4, z: DEMO_SPOT.z };
      }
      if (d.kind === "repair") {
        const st = w.addEntity(0, "structure", 1.2, DEMO_SPOT.x - 1, DEMO_SPOT.z + 3.2, 620);
        st.structure = { type: "damage", padIndex: -1, level: 1, builtAt: 0, ready: true, nextAction: 1e9, range: 0, damage: 0, lastFireAt: -99, shielded: false };
        st.hp = 180;
      }
    };
    if (d.t < 0) {
      reset();
      d.t = 0;
    }
    d.acc += Math.min(dt, 0.1);
    while (d.acc >= w.dt) {
      d.acc -= w.dt;
      const t = d.t;
      d.t += w.dt;
      const cmd: Command = { moveX: 0, moveZ: 0 };
      if (d.kind === "works" && t > 1.4) {
        const m = w.mods.find((q) => q.owner === me.id && q.kind === "works" && q.cx !== undefined);
        if (m) {
          const dx = m.cx! - me.transform.pos.x;
          const dz = m.cz! - me.transform.pos.z;
          const dl = Math.hypot(dx, dz);
          if (dl > 0.4) {
            cmd.moveX = dx / dl;
            cmd.moveZ = dz / dl;
          }
        }
      }
      if (d.presses.some((p) => t < p && d.t >= p)) {
        (cmd as unknown as Record<string, unknown>)[d.btn] = true;
        cmd.moveX = 1;
      }
      w.step([cmd, { moveX: 0, moveZ: 0 }]);
      if (d.t >= d.len) {
        d.loop++;
        demoLoop++;
        if (spec.picks > 1) {
          d.key = "";
          break;
        }
        d.t = 0;
        reset();
      }
    }
    if (!d.key) {
      d.t = -1;
      return d.acc / w.dt;
    }
    const kind = (me.hero?.ab ?? w.heroDef(spec.hero).abilities)[spec.slot].kind;
    const big = BIG.has(kind);
    const far = FAR.has(kind);
    view.demoCam = {
      rect: menus.demoRect,
      target: { x: DEMO_SPOT.x + d.dist * 0.45, y: me.transform.y + 0.8, z: DEMO_SPOT.z },
      yaw: 0.22,
      pitch: big ? 0.6 : 0.38,
      dist: big ? 15 : far ? 12.5 : 9.5,
    };
    return d.acc / w.dt;
  }

  function beginAttractWorldOnly(): void {
    players = houses(mapIndex) === 4 ? 4 : 2;
    setupControl(Array(players).fill(false));
    show(newWorld(Array.from({ length: players }, randomHero), players));
  }

  requestAnimationFrame((t) => {
    frame(t);
    requestAnimationFrame(endBoot);
  });
}

start();
