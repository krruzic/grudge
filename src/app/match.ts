// Match lifecycle: who controls each player slot, building worlds from a MatchSpec, starting / pausing / ending
// matches, the attract-mode backdrop world behind menus, and stepping the simulation each frame.
//
// Every match (local or online) starts through startNetMatch with a MatchSpec, so a local match is just an
// online one with no remote seats. Per player slot, commands come from (in order): a debug puppet, a local
// CommandMapper (human), a Bot (CPU), or, on an online host, the queue of commands a guest sent this tick.
import { World } from "../sim/world";
import { Bot } from "../sim/bot";
import type { Command } from "../sim/types";
import inputData from "../../data/input.json";
import { CommandMapper } from "../input/commands";
import { costumesOf, setPlayerCostumes, setPlayerNames, playerLabel } from "../render/costumes";
import { applyRules } from "../game/save";
import { mergeCommands, packCommand, type MatchSpec } from "../net/session";
import { perf } from "../perf";
import type { App } from "./app";
import { commanderType, data, houses, maps, matchData, roster, seatsFor, teamOfSeat } from "./assets";
import { tdmMap } from "../sim/tdm";
import { afterHostTick, flushHostFrames, leaveNet, recordHostTick, stepPeer } from "./net";

/** CPU difficulty (level 1-3) -> bot skill. */
const BOT_SKILL = [0.5, 0.75, 0.95];

// ── Control ──

/** Pairs each bot with a human teammate (2v2) so it plays support around them. */
export function linkMates(app: App): void {
  app.bots.forEach((b, i) => {
    if (!b) return;
    const m =
      app.mode === "ffa" || app.mode === "ffadm" ? -1 : app.people.findIndex((h, j) => h && j !== i && j % 2 === i % 2);
    b.mate = m < 0 ? null : m;
  });
}

/**
 * Decides who drives each player slot: local humans get a CommandMapper, remote seats nothing (their commands
 * come over the net), everyone else a Bot unless `botsToo` is off (online guests never run bots).
 */
export function setupControl(
  app: App,
  humans: boolean[],
  levels: number[] = [],
  remote: boolean[] = [],
  botsToo = true,
): void {
  app.mappers = humans.map((h, i) => {
    if (!h) return null;
    const m = new CommandMapper(inputData.cstickFlickThreshold, app.commanderSlot(i));
    if (inputData.smashDodge) m.smash = inputData.smashDodge;
    return m;
  });
  app.bots = humans.map((h, i) =>
    h || remote[i] || !botsToo ? null : new Bot(i, BOT_SKILL[(levels[i] ?? 2) - 1] ?? 0.75, app.seed + i),
  );
  app.people = humans.map((h, i) => h || !!remote[i]);
  linkMates(app);
  app.view.setHumans(app.splitAll ? humans.map(() => true) : humans);
}

/** One command per player slot for the next tick. */
function commandsFor(app: App): Command[] {
  const { dbg, net } = app;
  return Array.from({ length: app.players }, (_, i) => {
    const puppet = dbg.puppet[i];
    if (puppet) {
      // A puppeted button fires once; movement and block persist.
      dbg.puppet[i] = { moveX: puppet.moveX, moveZ: puppet.moveZ, block: puppet.block };
      return puppet;
    }
    const m = app.mappers[i];
    if (m) return m.take();
    const b = app.bots[i];
    if (b) return b.command(app.world);
    if (net.mode === "host" && app.state === "match") {
      const r = net.seatAt(i);
      if (r) {
        const c = mergeCommands(r.queue, r.last);
        r.queue = [];
        r.last = c;
        return c;
      }
    }
    return { moveX: 0, moveZ: 0 };
  });
}

/** Runs the sim `seconds` ahead without rendering (debug `?time=`). */
export function fastForward(app: App, seconds: number): void {
  const n = Math.floor(seconds * matchData.tickRate);
  for (let i = 0; i < n && app.world.match.phase !== "over"; i++) {
    app.world.step(commandsFor(app));
    app.world.events.length = 0;
  }
}

// ── Attract mode ──
// Title, menus and select show a CPU-vs-CPU match on the current map behind the UI.

/** Replaces the backdrop world with a fresh CPU match on the current map (keeps the screen state). */
export function resetAttractWorld(app: App): void {
  app.players = houses(app.mapIndex) === 4 ? 4 : 2;
  setupControl(app, Array(app.players).fill(false));
  app.show(
    app.newWorld(
      Array.from({ length: app.players }, () => app.randomHero()),
      app.players,
    ),
  );
}

/** Back to the title screen over a fresh backdrop. */
export function beginAttract(app: App): void {
  resetAttractWorld(app);
  app.state = "title";
  app.screens.set("title");
  app.hud.show(false);
}

/** To the main menu (leaving any online session). */
export function toMenu(app: App, why?: string): void {
  app.audio.stopName();
  app.menus.training = false;
  if (app.net.mode !== "off") leaveNet(app, why ?? "");
  const s = app.state;
  if (s === "match" || s === "paused" || s === "results" || s === "lobby") beginAttract(app);
  app.state = "menu";
  app.menus.open("main");
  app.screens.set("none");
  app.hud.show(false);
}

// ── Starting a match ──

function buildWorld(app: App, spec: MatchSpec): World {
  const mi = maps.findIndex((m) => m.id === spec.map);
  app.mapIndex = mi < 0 ? 0 : mi;
  const mode = spec.mode ?? "1v1";
  const map =
    mode === "tdm"
      ? tdmMap(maps[app.mapIndex].data)
      : mode === "ffadm"
        ? tdmMap(maps[app.mapIndex].data, 8)
        : maps[app.mapIndex].data;
  const w = new World(map, applyRules(data, spec.rules), spec.seed);
  const all = mode === "ffa" || mode === "tdm" || mode === "ffadm";
  for (let p = 0; p < spec.players; p++)
    w.spawnHero(
      all || p < 2 || spec.rules.partners === 1 ? (spec.heroes[p] ?? roster[0]) : commanderType,
      p,
      teamOfSeat(mode, p),
    );
  if (spec.training)
    w.makeTraining(
      Array.from({ length: spec.players }, (_, p) => p)
        .filter((p) => spec.humans[p])
        .map((p) => teamOfSeat(mode, p)),
    );
  return w;
}

/** Starts a match from a spec on every machine (host, guests and local play alike). */
export function startNetMatch(app: App, spec: MatchSpec, local: boolean[], remote: boolean[]): void {
  app.players = spec.players;
  setPlayerCostumes(spec.costumes ?? []);
  setPlayerNames(spec.names ?? []);
  app.pausing = spec.rules.pausing !== 0;
  app.mode = spec.mode ?? (spec.players === 4 ? "2v2" : "1v1");
  setupControl(app, local, spec.levels, remote, app.net.mode !== "peer");
  if (spec.training) app.bots = app.bots.map(() => null);
  app.hud.resetTrainer();
  app.menus.training = !!spec.training;
  app.show(buildWorld(app, spec));
  app.matchPlayers = spec.heroes.slice(0, spec.players).map((hero, i) => ({
    tag: spec.names[i] ?? null,
    tagId: spec.tagIds?.[i] ?? null,
    hero,
    team: teamOfSeat(app.mode, i),
    cpu: !spec.humans[i],
  }));
  app.recorded = false;
  app.fallen = [];
  app.state = "match";
  app.overAt = -1;
  app.acc = 0;
  app.net.resetMatchStreams();
  app.screens.set("none");
  app.hud.show(true);
  app.hud.banner_("FIGHT!", performance.now() / 1000, 1.5, true);
  app.audio.ui("start");
}

/** Field select confirmed: fill open seats with CPUs, build the spec, tell guests, start. */
export function beginMatch(app: App): void {
  app.audio.stopName();
  const players = seatsFor(app.mode);
  app.players = players;
  const seats = app.slots.slice(0, players);
  const humans = seats.map((s) => s.joined && !s.cpu);
  // Remember each human's sealed pick so champion select restores it after this match, however you get back there.
  app.lastPicks = app.slots.map((s, i) =>
    humans[i] && s.ready && roster.includes(s.hero) ? { hero: s.hero, costume: s.costume } : null,
  );
  seats.forEach((sl, i) => {
    if (!sl.open) return;
    sl.open = false;
    sl.cpu = true;
    sl.joined = false;
    if (!app.commanderSlot(i)) {
      sl.hero = app.randomHero();
      const cl = costumesOf(sl.hero);
      sl.costume = cl[Math.floor(Math.random() * cl.length)] ?? "";
    }
  });
  const remote = seats.map((_, i) => app.net.remoteAt(i) >= 0);
  const spec: MatchSpec = {
    map: maps[app.mapIndex].id,
    seed: app.seed++,
    rules: { ...app.save.data.rules },
    heroes: seats.map((s) => s.hero),
    players,
    levels: seats.map((s) => s.level),
    humans,
    training: app.training && app.net.mode === "off",
    names: seats.map((s) => (s.cpu ? null : (s.tag ?? null))),
    tagIds: seats.map((s) => (s.cpu ? null : (s.tagId ?? null))),
    mode: app.mode,
    costumes: seats.map((s) => (costumesOf(s.hero).includes(s.costume ?? "") ? (s.costume ?? "") : "")),
  };
  for (const r of app.net.rseats) {
    r.queue = [];
    r.last = { moveX: 0, moveZ: 0 };
  }
  if (app.net.mode === "host")
    app.net.link.toPeer("all", {
      t: "start",
      spec,
      seats: app.net.rseats.filter((r) => r.slot >= 0 && r.slot < players).map((r) => [r.peer, r.k, r.slot]),
    });
  startNetMatch(
    app,
    spec,
    humans.map((h, i) => h && !remote[i]),
    remote,
  );
}

// ── Pause ──

/**
 * Opens / closes the pause menu. The caller sets app.pauser first (the pad that pressed start); only that pad
 * drives the menu. An online host forwards the pause to guests; guests ask the host instead of calling this.
 */
export function setPaused(app: App, on: boolean, by?: string): void {
  const label = by ?? (app.pauser >= 0 ? playerLabel(app.pauser) : "");
  if (!on) app.pauser = -1;
  if (on) {
    app.menus.openPause(label);
    app.menus.currentMap = maps[app.mapIndex]?.data.name ?? "";
  }
  app.state = on ? "paused" : "match";
  app.screens.set(on ? "pause" : "none");
  app.hud.show(!on);
  if (app.net.mode === "host") app.net.link.toPeer("all", { t: "pause", on, by: label });
}

// ── Per frame ──

/** States whose world keeps simulating locally (the attract backdrop runs behind title / main menu / results). */
function simulates(app: App): boolean {
  const s = app.state;
  return (
    s === "match" || s === "title" || (s === "menu" && app.menus.page === "main") || s === "results" || s === "lobby"
  );
}

/**
 * Advances the world by this frame's dt at the fixed tick rate. Guests in a match only replay the host's frames;
 * the host also records and broadcasts the commands it fed to each tick.
 */
export function stepWorld(app: App, dt: number, now: number): void {
  const net = app.net;
  if (app.state === "match" && net.mode === "peer") {
    stepPeer(app, dt, now);
    return;
  }
  if (!simulates(app)) return;
  const pfs = perf.now();
  const hosting = net.mode === "host" && app.state === "match";
  const w = app.world;
  app.acc += dt;
  let ticks = 0;
  while (app.acc >= w.dt && ticks < matchData.maxTicksPerFrame) {
    const cmds = hosting ? commandsFor(app).map(packCommand) : commandsFor(app);
    if (hosting) recordHostTick(app, cmds);
    w.step(cmds);
    if (hosting) afterHostTick(app);
    app.acc -= w.dt;
    ticks++;
  }
  // Too far behind (tab was hidden, long hitch): drop the backlog instead of spiralling.
  if (ticks === matchData.maxTicksPerFrame) app.acc = 0;
  perf.cpu("sim", pfs);
  perf.stat("ticks", ticks);
  if (hosting) flushHostFrames(app);
}

/**
 * End-of-match flow: a finished backdrop world restarts; a finished match shows the winner banner, then after
 * 3 s writes the records (once, only with a human playing and not in training) and opens the results screen.
 */
export function checkMatchOver(app: App, now: number): void {
  const w = app.world;
  const s = app.state;
  if ((s === "title" || s === "menu" || s === "select" || s === "map") && w.match.phase === "over")
    resetAttractWorld(app);
  if (s !== "match" || w.match.phase !== "over") return;
  if (app.overAt < 0) {
    app.overAt = now;
    app.hud.banner_(w.match.winner < 0 ? "DRAW" : `${w.teamName(w.match.winner)} WINS`, now, 3, true);
    app.audio.announce(w.match.winner < 0 ? "its_a_tie" : "winner");
    return;
  }
  if (now - app.overAt <= 3) return;
  app.state = "results";
  if (!app.recorded && !w.training && app.matchPlayers.some((p) => !p.cpu)) {
    app.recorded = true;
    recordMatch(app);
  }
  app.screens.showResults(w, app.matchPlayers, app.menus.heroNames, app.fallen);
  app.screens.set("results");
  app.hud.show(false);
}

/** Saves the match to local records; an online host also reports it to the server's ladder. */
function recordMatch(app: App): void {
  const w = app.world;
  const map = maps[app.mapIndex].id;
  app.save.record(
    { at: Date.now(), mode: app.mode, map, winner: w.match.winner, secs: w.time, players: app.matchPlayers },
    w.teams.map((t) => t.heroKills),
  );
  if (app.net.mode !== "host") return;
  app.net.link.report({
    mode: app.mode,
    map,
    winner: w.match.winner,
    secs: Math.round(w.time),
    players: app.matchPlayers.map((p) => ({
      id: p.tagId ?? null,
      name: p.tag,
      hero: p.hero,
      team: p.team,
      cpu: p.cpu,
      kills: w.teams[p.team]?.heroKills ?? 0,
    })),
  });
}

/** Records which FFA houses fell this frame, in order (for results placing). */
export function trackEliminations(app: App): void {
  for (const ev of app.world.events)
    if (ev.type === "eliminated" && !app.fallen.includes(ev.team)) app.fallen.push(ev.team);
}
