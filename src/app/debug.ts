// URL entry points and the debug window API.
//
// Start screens: `?screen=select|map` (champion / field select, with `heroes=` and `ready=N`), `?screen=menu`
// (`page=`, `tab=`), `?bots` (a CPU-vs-CPU match straight away; see beginBotMatch for its options), otherwise
// the title screen. With `?debug` (or in dev builds) `window.grudge` exposes the app for tools and playtests.
import { Bot } from "../sim/bot";
import { forceAbility } from "../sim/heroes";
import { allLearned, gainXp, learn } from "../sim/talents";
import { spawnUnit } from "../sim/structures";
import inputData from "../../data/input.json";
import { CommandMapper } from "../input/commands";
import { setPlayerCostumes, setPlayerNames } from "../render/costumes";
import type { Page } from "../ui/menus";
import type { App } from "./app";
import { houses, roster, seatsFor } from "./assets";
import { enterSelect } from "./select";
import { beginAttract, fastForward, resetAttractWorld, setPaused, setupControl, toMenu } from "./match";

const MENU_PAGES: Page[] = ["players", "network", "rules", "options", "records", "controls", "codex"];

/** Picks the first screen from the URL. */
export function startFromUrl(app: App): void {
  const p = app.params;
  const screen = p.get("screen");
  if (screen === "select" || screen === "map") {
    if (!app.fields().includes(app.mapIndex)) app.mapIndex = app.fields()[0] ?? app.mapIndex;
    if (p.get("map") !== "random") app.pickIndex = Math.max(0, app.fields().indexOf(app.mapIndex));
    beginAttract(app);
    app.state = screen === "map" ? "map" : "select";
    enterSelect(app);
    // heroes=a,b,...: preset each seat's hero (CPU seats also get their chip placed).
    p.get("heroes")
      ?.split(",")
      .forEach((h, i) => {
        if (!app.slots[i] || !roster.includes(h)) return;
        app.slots[i].hero = h;
        if (app.slots[i].cpu && !app.commanderSlot(i)) app.cursors.placeChip(i, h);
      });
    // ready=N: the first N seats are sealed.
    for (let r = 0; r < Number(p.get("ready") ?? 0); r++) {
      if (!app.slots[r] || app.commanderSlot(r)) continue;
      app.slots[r].ready = true;
      if (app.cursors.cursors[r].holding === r) app.cursors.cursors[r].holding = -1;
      app.cursors.placeChip(r, app.slots[r].hero);
    }
    app.screens.set(app.state === "map" ? "map" : "select");
  } else if (screen === "menu") {
    beginAttract(app);
    toMenu(app);
    const page = p.get("page") as Page | null;
    if (page && MENU_PAGES.includes(page)) app.menus.page = page;
    app.menus.tab = Number(p.get("tab") ?? 0);
  } else if (p.has("bots")) {
    setupControl(app, [false, false]);
    beginBotMatch(app);
  } else beginAttract(app);
}

/**
 * `?bots`: an all-CPU match. Options: heroes=a,b,.. costumes=.. names=.. mode= partners time=<s to fast-forward>
 * rank=<1-3 veteran soldiers> plant (place banners) spawn=x,z (move heroes) wall / works[=ground] (force the
 * Warden's wall / the Engineer's works for screenshots).
 */
function beginBotMatch(app: App): void {
  const p = app.params;
  const hs = (p.get("heroes") ?? "").split(",").filter((h) => roster.includes(h));
  setPlayerCostumes((p.get("costumes") ?? "").split(","));
  setPlayerNames((p.get("names") ?? "").split(","));
  if (houses(app.mapIndex) === 4 && p.has("map")) app.mode = "ffa";
  if (!app.fields().includes(app.mapIndex)) app.mapIndex = app.fields()[0] ?? app.mapIndex;
  app.players = seatsFor(app.mode);
  setupControl(app, Array(app.players).fill(false));
  // Missing heroes are random (in seat order); FFA fills every house.
  const first = hs[0] ?? app.randomHero();
  const second = hs[1] ?? hs[0] ?? app.randomHero();
  const extraFfa =
    app.mode === "ffa" || app.mode === "tdm"
      ? Array.from({ length: Math.max(0, app.players - Math.max(2, hs.length)) }, () => app.randomHero())
      : [];
  app.show(app.newWorld([first, second, ...hs.slice(2), ...extraFfa], app.players, false, p.has("partners")));
  app.state = "match";
  app.screens.set("none");
  app.hud.show(true);

  const w = () => app.world;
  const t = Number(p.get("time") ?? 0);
  if (t > 0) fastForward(app, t);
  const rank = Number(p.get("rank") ?? 0);
  if (rank > 0) {
    const kills = w().data.units.veterancy.killsForRank;
    const need = kills[Math.min(rank, 3) - 1];
    let i = 0;
    for (const e of w().entities) if (e.alive && e.unit) w().promote(e, i++ % 2 === 0 ? need : kills[0]);
  }
  if (p.has("plant")) {
    w().teams.forEach((ts, team) => {
      const h = w().heroOf(team);
      if (h) ts.banner = { x: h.transform.pos.x + 2, z: h.transform.pos.z + 1, until: w().time + 60 };
    });
  }
  const spawn = p.get("spawn");
  if (spawn) {
    const [x, z] = spawn.split(",").map(Number);
    w().players.forEach((pl, i) => {
      const e = w().getAny(pl.heroId);
      if (e) w().teleport(e, x + i * 2.5, z + i * 0.5);
    });
  }
  if (p.has("wall")) {
    for (const pl of w().players) {
      const e = w().getAny(pl.heroId);
      if (!e || pl.heroType !== "warden") continue;
      forceAbility(w(), e, "r", pl.team === 0 ? 1 : -1, 0);
      fastForward(app, 1);
    }
  }
  if (p.has("works")) {
    for (const pl of w().players) {
      const e = w().getAny(pl.heroId);
      if (!e || pl.heroType !== "engineer") continue;
      const dir = pl.team === 0 ? 1 : -1;
      forceAbility(w(), e, "r", dir, 0);
      fastForward(app, 1);
      const m = w().mods.find((k) => k.kind === "works" && k.owner === e.id);
      if (m && p.get("works") !== "ground") w().teleport(e, m.cx!, m.cz!);
      forceAbility(w(), e, "z", dir, 0);
      fastForward(app, 1);
    }
  }
}

/** window.grudge: live handles and helpers for playtests and screenshot tools (dev builds or `?debug`). */
export function installDebugApi(app: App): void {
  if (!import.meta.env.DEV && !app.params.has("debug")) return;
  const net = app.net;
  (window as unknown as { grudge: unknown }).grudge = {
    Bot,
    /** Swap the menu backdrop to map index i (what hovering a field card does). */
    backdrop: (i: number) => {
      app.mapIndex = i;
      resetAttractWorld(app);
    },
    dbg: app.dbg,
    hud: app.hud,
    screens: app.screens,
    spawnUnit,
    /** Max XP, then learn `picks` (option index per level), first options for the rest. Returns learned ids. */
    levelUp: (player: number, picks: number[]) => {
      const w = app.world;
      const e = w.heroForPlayer(player);
      if (!e?.hero) return [];
      gainXp(w, e, 99999);
      for (const k of picks) learn(w, e, k);
      while (e.hero.picks.length) learn(w, e, 0);
      return allLearned(w, e).map((t) => t.id);
    },
    pause: () => setPaused(app, true),
    endMatch: (winner = 0) => {
      const m = app.world.match;
      m.phase = "over";
      m.winner = winner;
      m.reason = "core destroyed";
    },
    setLobby: () => {
      app.state = "lobby";
      app.screens.set("lobby");
    },
    bots: () => app.bots,
    /** Hands player slot i to the first local pad's input. */
    humanize: (i: number) => {
      app.mappers[i] = new CommandMapper(inputData.cstickFlickThreshold, app.commanderSlot(i));
      app.bots[i] = null;
      app.view.setHumans(app.mappers.map((m) => !!m));
    },
    pads: app.pads,
    slots: app.slots,
    cursors: app.cursors,
    menus: app.menus,
    save: app.save,
    view: app.view,
    audio: app.audio,
    get state() {
      return app.state;
    },
    get world() {
      return app.world;
    },
    get net() {
      return {
        mode: net.mode,
        open: net.link.open,
        role: net.link.role,
        sent: net.lobbySentAt,
        desync: net.desync,
        mySlot: [...net.mySlots.values()][0] ?? -1,
        mySlots: Object.fromEntries(net.mySlots),
        frames: net.netFrames.length,
        remotes: net.rseats.map((r) => [r.peer, r.k, r.slot]),
      };
    },
  };
}
