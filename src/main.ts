import heroData from "../data/heroes.json";
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

const MAX_PLAYERS = 4;
const data = { heroes: heroData, units: unitData, structures: structureData, match: matchData } as unknown as GameData;
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

type State = "title" | "menu" | "select" | "map" | "match" | "paused" | "results";

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
  const newWorld = (heroes: string[], count = 2, rules = false): World => {
    const w = new World(maps[mapIndex].data, rules ? applyRules(data, save.data.rules) : data, seed++);
    for (let p = 0; p < count; p++) w.spawnHero(p < 2 || (rules && save.data.rules.partners === 1) ? heroes[p] ?? roster[0] : commanderType, p, p % 2);
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
    view.splitOn = o.split === 1;
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
  const present = (i: number) => pads.players[i].connected || i < forceJoin;
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

  const setupControl = (humans: boolean[], levels: number[] = []) => {
    mappers = humans.map((h, i) => {
      if (!h) return null;
      const m = new CommandMapper(inputData.cstickFlickThreshold, commanderSlot(i));
      if (inputData.smashDodge) m.smash = inputData.smashDodge;
      return m;
    });
    bots = humans.map((h, i) => (h ? null : new Bot(i, [0.5, 0.75, 0.95][(levels[i] ?? 2) - 1] ?? 0.75, seed + i)));
    view.setHumans(humans);
  };

  const toMenu = () => {
    if (state === "match" || state === "paused" || state === "results") beginAttract();
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
    setupControl(humans, slots.slice(0, players).map((s) => s.level));
    show(newWorld(slots.map((s) => s.hero), players, true));
    matchPlayers = slots.slice(0, players).map((s, i) => ({ tag: s.cpu ? null : s.tag ?? null, hero: s.hero, team: i % 2, cpu: s.cpu }));
    recorded = false;
    state = "match";
    overAt = -1;
    screens.set("none");
    hud.show(true);
    hud.banner_("FIGHT!", performance.now() / 1000, 1.5, true);
    audio.ui("start");
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

  const commandsFor = (): Command[] =>
    Array.from({ length: players }, (_, i) => {
      const m = mappers[i];
      if (m) return m.take();
      return bots[i]?.command(world) ?? { moveX: 0, moveZ: 0 };
    });

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
    if (pg === "rules" || pg === "options" || pg === "records" || pg === "controls") menus.page = pg;
    menus.tab = Number(params.get("tab") ?? 0);
  } else if (params.has("bots")) {
    setupControl([false, false]);
    beginMatchWithBots();
  } else beginAttract();

  function beginMatchWithBots(): void {
    const hs = (params.get("heroes") ?? "").split(",").filter((h) => roster.includes(h));
    players = params.get("mode") === "2v2" ? 4 : 2;
    setupControl(Array(players).fill(false));
    show(newWorld([hs[0] ?? randomHero(), hs[1] ?? hs[0] ?? randomHero()], players));
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

  if (import.meta.env.DEV) (window as unknown as { grudge: unknown }).grudge = { pads, slots, cursors, menus, save, view, get state() { return state; }, get world() { return world; } };

  let last = performance.now();
  let acc = 0;

  const frame = (nowMs: number): void => {
    const now = nowMs / 1000;
    const dt = Math.min(0.25, (nowMs - last) / 1000);
    last = nowMs;

    pads.poll();
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
          if (id === "mode") {
            setMode(!twoVtwo);
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
    } else if (state === "match") {
      if (anyPressed("start")) {
        state = "paused";
        screens.set("pause");
      }
      pads.players.forEach((p, i) => {
        const m = mappers[i];
        if (!m) return;
        const h = world.heroForPlayer(i);
        m.update(p, now, !!h && h.alive && !!padNear(world, h), !!h && h.alive && world.arena.inShop(h));
      });
      view.setMenus(mappers.map((m) => !!m && m.ui.buildMenu !== "closed"));
    } else if (state === "paused") {
      if (anyPressed("start")) {
        state = "match";
        screens.set("none");
      } else if (anyPressed("z")) toMenu();
    } else if (state === "results") {
      if (anyPressed("a") || anyPressed("start")) {
        state = "select";
        enterSelect();
        screens.set("select");
        beginAttractWorldOnly();
      }
    }

    if (state === "match" || state === "title" || state === "menu" || state === "select" || state === "map" || state === "results") {
      acc += dt;
      let ticks = 0;
      while (acc >= world.dt && ticks < matchData.maxTicksPerFrame) {
        world.step(commandsFor());
        acc -= world.dt;
        ticks++;
      }
      if (ticks === matchData.maxTicksPerFrame) acc = 0;
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
    if (state !== "select" && state !== "map" && !(state === "menu" && menus.page !== "main")) view.render(state === "paused" ? 0 : acc / world.dt, state === "paused" ? 0 : dt);
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
    const proText = pads.pro.count ? `${pads.pro.count} PRO CONTROLLER${pads.pro.count > 1 ? "S" : ""}` : pads.pro.status;
    screens.adapterStatus = [gcText, proText].filter(Boolean).join(" · ") || "PRESS G TO CONNECT A GAMECUBE ADAPTER OR SWITCH 2 PRO CONTROLLER";
    screens.adapterDebug = pads.gc.debug();
    screens.draw(ctx, pixel.w, pixel.h, now);
    if (state === "menu") menus.draw(ctx, pixel.w, pixel.h, now);
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
