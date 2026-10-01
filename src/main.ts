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
import cliffTex from "../assets/textures/cliff.png?url";
import cobbleTex from "../assets/textures/cobble.png?url";
import waterTex from "../assets/textures/water.png?url";
import { World } from "./sim/world";
import { Bot } from "./sim/bot";
import { placeRanges } from "./sim/heroes";
import { forceAbility } from "./sim/heroes";
import { padNear } from "./sim/structures";
import type { GameData } from "./sim/config";
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
import { Menus, type Nav } from "./ui/menus";
import { Save, applyRules } from "./game/save";
import { NetLink, type NetMsg } from "./net/link";
import { mergeCommands, packCommand, worldHash, type Frame, type MatchSpec } from "./net/session";
import { drawText, textWidth } from "./ui/font";
import type { LobbySlot } from "./ui/screens";

const MAX_PLAYERS = 4;
const data = { talents: talentData, heroes: heroData, units: unitData, structures: structureData, match: matchData } as unknown as GameData;
const heroUrls = import.meta.glob("../assets/heroes/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const unitUrls = import.meta.glob("../assets/units/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const structureUrls = import.meta.glob("../assets/structures/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;

const mapJsons = import.meta.glob("../data/maps/*.json", { import: "default", eager: true }) as Record<string, MapData>;
const mapGlbs = import.meta.glob("../assets/maps/*.glb", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const MAP_ORDER = ["crossing", "ruins"];
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
  let pickIndex = params.get("map") === "random" ? maps.length : mapIndex;
  let readySince = -1;

  const save = new Save();
  const newWorld = (heroes: string[], count = 2, rules = false, partners = false): World => {
    const w = new World(maps[mapIndex].data, rules ? applyRules(data, save.data.rules) : data, seed++);
    for (let p = 0; p < count; p++) w.spawnHero(p < 2 || partners || (rules && save.data.rules.partners === 1) ? heroes[p] ?? roster[0] : commanderType, p, p % 2);
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
    Promise.all(maps.map((m) => loadMap(m.url, new Terrain(m.data), { grass: grassTex, dirt: dirtTex, rock: cliffTex, cobble: cobbleTex, water: waterTex }, renderData as RenderConfig))),
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
  };
  applyOptions();
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
  window.addEventListener("keydown", (e) => {
    if (state !== "select" || menus.tagSlot < 0 || menus.tagMode !== "type") return;
    if (/^Key[A-Z]$/.test(e.code)) menus.typeKey(e.code.slice(3));
    else if (/^Digit[0-9]$/.test(e.code)) menus.typeKey(e.code.slice(5));
    else if (e.code === "Minus") menus.typeKey("-");
    else if (e.code === "Backspace") menus.tagAction("tg:del");
    else if (e.code === "Enter") finishTag(menus.tagAction("tg:ok"));
    else if (e.code === "Escape") menus.tagBack();
    else return;
    e.preventDefault();
    audio.ui("move");
  });
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
  let twoVtwo = params.get("mode") === "2v2";
  const net = new NetLink();
  let netMode: "off" | "host" | "peer" = "off";
  const remotes = new Map<number, { slot: number; name: string; queue: Command[]; last: Command }>();
  const remoteAt = (i: number) => {
    for (const [id, r] of remotes) if (r.slot === i) return id;
    return -1;
  };
  let mySlot = -1;
  let myHero = "";
  let myReady = false;
  let netFrames: Frame[] = [];
  const netHashes = new Map<number, number>();
  let outFrames: Frame[] = [];
  let outHashes: [number, number][] = [];
  let lobbySentAt = 0;
  let desync = false;
  let hostAddrs: string[] = [];
  let hostPublic = "";
  const present = (i: number) => pads.players[i].connected || i < forceJoin || remoteAt(i) >= 0;
  const padsForCursors = () => pads.players.map((p, i) => (i < forceJoin && !p.connected ? { ...p, connected: true } : p));
  const slotActive = (i: number) => i < 2 || twoVtwo;
  const commanderSlot = (i: number) => i >= 2 && save.data.rules.partners === 0;
  const heldBy = (slot: number) => cursors.cursors.findIndex((c) => c.active && c.holding === slot);
  const settleCpu = (i: number) => {
    const sl = slots[i];
    if (commanderSlot(i)) { sl.hero = commanderType; sl.ready = true; cursors.placeChip(i, null); return; }
    if (heldBy(i) >= 0) return;
    if (!sl.ready) sl.hero = randomHero();
    sl.ready = true;
    cursors.placeChip(i, sl.hero);
  };
  const makeHuman = (i: number) => {
    const sl = slots[i];
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
  const makeCpu = (i: number) => {
    const sl = slots[i];
    sl.cpu = true;
    sl.joined = false;
    if (cursors.cursors[i].holding === i) cursors.cursors[i].holding = -1;
    settleCpu(i);
  };
  const setMode = (v: boolean) => {
    if (twoVtwo === v) return;
    twoVtwo = v;
    for (const k of [2, 3]) {
      if (twoVtwo) { if (present(k)) makeHuman(k); else makeCpu(k); }
      else if (cursors.cursors[k].holding >= 0) cursors.cursors[k].holding = -1;
    }
  };
  const enterSelect = () => {
    if ([0, 1, 2, 3].filter(present).length >= 3) twoVtwo = true;
    cursors.setScale(pixel.w, pixel.h);
    cursors.reset(twoVtwo ? [0, 2, 1, 3] : [0, 1]);
    slots.forEach((sl, i) => {
      sl.ready = false;
      if (present(i)) { sl.autoCpu = false; makeHuman(i); }
      else { makeCpu(i); sl.autoCpu = true; }
    });
    readySince = -1;
  };
  const selectReady = () => slots.every((sl, i) => !slotActive(i) || (sl.ready && heldBy(i) < 0)) && cursors.cursors.every((c) => !c.active || c.holding < 0 || !slotActive(c.holding));
  let state: State = "title";
  const stickLatch = [false, false, false, false];
  const randomHero = () => roster[Math.floor(Math.random() * roster.length)];
  let overAt = -1;

  let people: boolean[] = [];
  const linkMates = () => {
    bots.forEach((b, i) => {
      if (!b) return;
      const m = people.findIndex((h, j) => h && j !== i && j % 2 === i % 2);
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
    for (let p = 0; p < spec.players; p++) w.spawnHero(p < 2 || spec.rules.partners === 1 ? spec.heroes[p] ?? roster[0] : commanderType, p, p % 2);
    return w;
  };
  const startNetMatch = (spec: MatchSpec, local: boolean[], remote: boolean[]) => {
    players = spec.players;
    setupControl(local, spec.levels, remote, netMode !== "peer");
    show(buildWorld(spec));
    matchPlayers = spec.heroes.slice(0, spec.players).map((hero, i) => ({ tag: spec.names[i] ?? null, hero, team: i % 2, cpu: !spec.humans[i] }));
    recorded = false;
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
    remotes.clear();
    mySlot = -1;
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
    players = 2;
    setupControl([false, false]);
    show(newWorld([randomHero(), randomHero()]));
    state = "title";
    screens.set("title");
    hud.show(false);
  };

  const beginMatch = () => {
    players = twoVtwo ? 4 : 2;
    const humans = slots.slice(0, players).map((s) => s.joined && !s.cpu);
    const remote = slots.slice(0, players).map((_, i) => remoteAt(i) >= 0);
    const spec: MatchSpec = {
      map: maps[mapIndex].id, seed: seed++, rules: { ...save.data.rules }, heroes: slots.slice(0, players).map((s) => s.hero), players,
      levels: slots.slice(0, players).map((s) => s.level), humans, names: slots.slice(0, players).map((s) => (s.cpu ? null : s.tag ?? null)),
    };
    for (const r of remotes.values()) {
      r.queue = [];
      r.last = { moveX: 0, moveZ: 0 };
    }
    if (netMode === "host") net.toPeer("all", { t: "start", spec, slots: Object.fromEntries([...remotes].map(([id, r]) => [id, r.slot])) });
    startNetMatch(spec, humans.map((h, i) => h && !remote[i]), remote);
  };

  let matchPlayers: { tag: string | null; hero: string; team: number; cpu: boolean }[] = [];
  let recorded = true;
  const mapHover = ["*", "*", "*", "*"];
  function toMap(): void {
    mapHover.fill("*");
    screens.readyBanner = false;
    readySince = -1;
    audio.ui("ok");
    state = "map";
    screens.set("map");
    pickIndex = mapIndex;
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
        const id = remoteAt(i);
        const r = id >= 0 ? remotes.get(id) : undefined;
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
    if (pg === "network" || pg === "rules" || pg === "options" || pg === "records" || pg === "controls") menus.page = pg;
    menus.tab = Number(params.get("tab") ?? 0);
  } else if (params.has("bots")) {
    setupControl([false, false]);
    beginMatchWithBots();
  } else beginAttract();

  function beginMatchWithBots(): void {
    const hs = (params.get("heroes") ?? "").split(",").filter((h) => roster.includes(h));
    players = params.get("mode") === "2v2" ? 4 : 2;
    setupControl(Array(players).fill(false));
    show(newWorld([hs[0] ?? randomHero(), hs[1] ?? hs[0] ?? randomHero(), ...hs.slice(2)], players, false, params.has("partners")));
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

  if (import.meta.env.DEV || params.has("debug")) (window as unknown as { grudge: unknown }).grudge = { dbg, hud, screens, pause: () => setPaused(true), endMatch: (winner = 0) => {
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
  }, pads, slots, cursors, menus, save, view, get state() { return state; }, get world() { return world; }, get net() { return { mode: netMode, open: net.open, role: net.role, sent: lobbySentAt, desync, mySlot, frames: netFrames.length, remotes: [...remotes.values()].map((r) => r.slot) }; } };

  let last = performance.now();
  let acc = 0;

  const freeRemoteSlot = (): number => {
    for (const i of [1, 2, 3, 0]) if (!pads.players[i].connected && !(i < forceJoin) && remoteAt(i) < 0) return i;
    return -1;
  };
  const seatRemote = (id: number) => {
    const r = remotes.get(id);
    if (!r || r.slot >= 0) return;
    const i = freeRemoteSlot();
    if (i < 0) return;
    r.slot = i;
    if ([0, 1, 2, 3].filter(present).length >= 3) setMode(true);
    slots[i].autoCpu = false;
    makeHuman(i);
    slots[i].tag = r.name;
    if (i >= 2 && !twoVtwo) setMode(true);
  };
  const lobbyView = () => ({
    rules: save.data.rules,
    twoVtwo,
    map: pickIndex >= maps.length ? "RANDOM FIELD" : (maps[pickIndex]?.data.name ?? maps[mapIndex].data.name).toUpperCase(),
    phase: state === "match" || state === "paused" || state === "results" ? "match" : "lobby",
    slots: slots.map((s, i): LobbySlot => ({ hero: s.hero, ready: s.ready, cpu: s.cpu, name: s.tag ?? null, remote: remoteAt(i) >= 0 ? remoteAt(i) : pads.players[i].connected ? 0 : -1, active: slotActive(i), commander: commanderSlot(i) })),
  });
  const netFromPeer = (id: number, m: NetMsg) => {
    const r = remotes.get(id);
    if (!r) return;
    const i = r.slot;
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
        mySlot = -1;
        myReady = false;
        myHero = "";
        state = "lobby";
        screens.set("lobby");
        continue;
      }
      if (netMode === "host") {
        if (m.t === "joined") {
          remotes.set(Number(m.id), { slot: -1, name: String(m.name ?? "GUEST").toUpperCase().slice(0, 8), queue: [], last: { moveX: 0, moveZ: 0 } });
          if (state === "select") seatRemote(Number(m.id));
          audio.ui("ok");
          lobbySentAt = 0;
        } else if (m.t === "left") {
          const r = remotes.get(Number(m.id));
          remotes.delete(Number(m.id));
          if (r && r.slot >= 0) {
            const i = r.slot;
            slots[i].tag = undefined;
            if (state === "select" || state === "map") { makeCpu(i); slots[i].autoCpu = true; }
            else if (i < players) {
              bots[i] = new Bot(i, 0.75, seed + i);
              people[i] = false;
              linkMates();
            }
            hud.banner_(`${r.name} LEFT · A CPU TAKES OVER`, now, 2.5);
          }
        } else if (m.t === "from") netFromPeer(Number(m.id), m.msg as NetMsg);
        continue;
      }
      if (netMode === "peer") {
        if (m.t === "lobby") {
          const lv = m.view as ReturnType<typeof lobbyView>;
          mySlot = lv.slots.findIndex((s) => s.remote === net.id);
          if (mySlot >= 0 && !myHero) myHero = lv.slots[mySlot].hero;
          screens.lobby = { ...lv, me: mySlot, status: mySlot < 0 && lv.phase !== "match" ? "THE BATTLE IS FULL · WAITING FOR A SEAT" : "" };
          if (state === "results" || state === "match" || state === "paused") {
            if (lv.phase === "lobby") {
              state = "lobby";
              myReady = false;
              screens.set("lobby");
              hud.show(false);
              beginAttractWorldOnly();
            }
          }
        } else if (m.t === "start") {
          const spec = m.spec as MatchSpec;
          const slot = Number((m.slots as Record<string, number>)?.[net.id] ?? mySlot);
          if (slot < 0) continue;
          mySlot = slot;
          const local = Array.from({ length: spec.players }, (_, i) => i === slot);
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
    if (netMode === "host" && now - lobbySentAt > 0.25) {
      lobbySentAt = now;
      if (state === "select") for (const id of remotes.keys()) seatRemote(id);
      net.toPeer("all", { t: "lobby", view: lobbyView() });
    }
  };

  const frame = (nowMs: number): void => {
    let now = nowMs / 1000;
    let dt = Math.min(0.25, (nowMs - last) / 1000);
    last = nowMs;
    if (dbg.freeze) {
      dt = dbg.adv;
      dbg.adv = 0;
      dbg.clock += dt;
      now = dbg.clock;
    }

    pads.poll();
    pumpNet(now);
    if (cursors.mouseUsed && pads.keyboardSlot() < 0) pads.claimKeyboard();
    cursors.mouseSlot = pads.keyboardSlot();
    for (const p of pads.players) {
      if ((p.pressed.start && p.held.z) || (p.pressed.z && p.held.start)) showPads = !showPads;
    }
    const anyPressed = (k: keyof (typeof pads.players)[0]["pressed"]) => pads.players.some((p) => p.pressed[k]);
    if (pads.players.some((p) => Object.values(p.pressed).some(Boolean))) audio.unlock();

    pads.typing = state === "select" && menus.tagSlot >= 0 && menus.tagMode === "type";
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
        menus.netStatus = r === "host" ? "OPENING THE GATES..." : "LOOKING FOR THE HOST...";
        menus.netAddrs = [];
        const name = save.tagNames()[0] ?? (r === "host" ? "HOST" : "GUEST");
        if (r === "host") net.host(name);
        else net.join(name, params.get("host") ?? undefined);
      } else if (r === "leave") leaveNet("");
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
      screens.updateSelect(slots, data.heroes.heroes, roster, twoVtwo, save.data.rules.partners === 1);
    } else if (state === "select") {
      cursors.setScale(pixel.w, pixel.h);
      if (!twoVtwo && [0, 1, 2, 3].filter(present).length >= 3) setMode(true);
      slots.forEach((sl, i) => {
        sl.local = pads.players[i].connected;
        if (present(i) && sl.cpu && sl.autoCpu) { sl.autoCpu = false; makeHuman(i); }
        if (!present(i) && !sl.cpu) { makeCpu(i); sl.autoCpu = true; }
      });
      const acts = cursors.update(padsForCursors(), dt, now, (slot, by) => slotActive(slot) && !commanderSlot(slot) && (slot === by ? !slots[slot].cpu : slots[slot].cpu));
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
            setMode(!twoVtwo);
            audio.ui("ok");
          } else if (id === "add") {
            setMode(true);
            audio.ui("ok");
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
          } else if (id === "tag" && !slots[i].cpu && !commanderSlot(i)) {
            tagFor = i;
            menus.openTag(i);
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
      screens.updateSelect(slots, data.heroes.heroes, roster, twoVtwo, save.data.rules.partners === 1);
      const allReady = selectReady();
      if (allReady && readySince < 0) readySince = now;
      if (!allReady) readySince = -1;
      screens.readyBanner = allReady;
      if (allReady && now - readySince > 0.25 && anyPressed("start")) toMap();
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
          if (pickIndex < maps.length && pickIndex !== mapIndex) {
            mapIndex = pickIndex;
            beginAttractWorldOnly();
          }
        }
      }
      if (go) {
        audio.ui("ok");
        if (pickIndex >= maps.length) mapIndex = Math.floor(Math.random() * maps.length);
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
      const nav = readNav(now);
      if (nav.b) {
        audio.ui("back");
        toMenu("");
        state = "menu";
        menus.open("network");
      } else if (lb && mySlot >= 0 && lb.phase === "lobby" && !lb.slots[mySlot].commander) {
        if (nav.dx && !myReady) {
          const k = roster.indexOf(myHero || lb.slots[mySlot].hero);
          myHero = roster[(k + nav.dx + roster.length) % roster.length];
          net.toHost({ t: "pick", hero: myHero });
          lb.slots[mySlot].hero = myHero;
          audio.ui("move");
        }
        if (nav.a) {
          myReady = !myReady;
          if (myHero) net.toHost({ t: "pick", hero: myHero });
          net.toHost({ t: "ready", on: myReady });
          lb.slots[mySlot].ready = myReady;
          audio.ui(myReady ? "ok" : "back");
        }
      }
    } else if (state === "match") {
      if (anyPressed("start")) {
        if (netMode === "peer") net.toHost({ t: "pause" });
        else setPaused(true);
      }
      pads.players.forEach((p, pi) => {
        const i = netMode === "peer" ? (pi === localPad() ? mySlot : -1) : pi;
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
      if (netMode === "peer" && mySlot >= 0 && mappers[mySlot]) net.toHost({ t: "cmd", c: packCommand(mappers[mySlot]!.take()) });
    } else if (state === "paused") {
      const r = menus.updatePause(readNav(now), cursors.takeMouse(), (k) => audio.ui(k));
      if (anyPressed("start") || r === "resume") {
        if (netMode === "peer") net.toHost({ t: "pause" });
        else setPaused(false);
      } else if (r === "quit") toMenu();
    } else if (state === "results" && netMode === "peer") {
      if (anyPressed("a") || anyPressed("start")) {
        state = "lobby";
        myReady = false;
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
          if (want !== worldHash(world)) desync = true;
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
        hud.banner_(world.match.winner < 0 ? "DRAW" : world.match.winner === 0 ? "BLUE WINS" : "RED WINS", now, 3, true);
      } else if (now - overAt > 3) {
        state = "results";
        if (!recorded && matchPlayers.some((p) => !p.cpu)) {
          recorded = true;
          save.record({ at: Date.now(), mode: players === 4 ? "2v2" : "1v1", map: maps[mapIndex].id, winner: world.match.winner, secs: world.time, players: matchPlayers }, world.teams.map((t) => t.heroKills));
        }
        screens.showResults(world, matchPlayers, menus.heroNames);
        screens.set("results");
        hud.show(false);
      }
    }

    if (state === "match" || state === "paused") hud.update(world, mappers.map((m) => m?.ui ?? null), now);
    if (state === "match") audio.handle(world.events, (x, y, z) => view.worldToScreen(x, y, z));
    audio.setMusic(state !== "paused", state === "match" && world.match.phase === "sudden" ? 1 : state === "match" ? 0.3 : 0);
    audio.update();
    view.cinematic = state === "select" || state === "map" || state === "lobby" || (state === "menu" && menus.page !== "main");
    view.render(state === "paused" ? 0 : acc / world.dt, state === "paused" ? 0 : dt);
    const ctx = pixel.begin();
    const uiList = mappers.map((m) => m?.ui ?? null);
    hud.locate = view.splitCount ? null : (x, y, z) => view.worldToScreen(x, y, z);
    hud.split = view.splitCount;
    hud.draw(ctx, pixel.w, pixel.h, world, uiList, now);
    screens.updateMaps(maps.map((m) => m.data), state === "map" ? pickIndex : mapIndex);
    if (state === "select") screens.portraits?.renderStages();
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
      const joined = [...remotes.values()].filter((r) => r.slot >= 0).length;
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
    padsEl.textContent = showPads ? pads.debugText() : "";
    requestAnimationFrame(frame);
  };

  function beginAttractWorldOnly(): void {
    players = 2;
    setupControl([false, false]);
    show(newWorld([randomHero(), randomHero()]));
  }

  requestAnimationFrame((t) => {
    frame(t);
    requestAnimationFrame(endBoot);
  });
}

start();
