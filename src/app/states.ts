// Per-frame input handling for the non-select states: title, main menu (incl. online room browsing), match
// (local pads -> CommandMappers, guests forward commands to the host), pause menu and results.
// Champion / field select live in select.ts, the guest lobby in lobby.ts.
import { canSpec, padNear } from "../sim/structures";
import { placeRanges } from "../sim/heroes";
import { gainXp } from "../sim/talents";
import type { RoomInfo } from "../ui/menus";
import { packCommand } from "../net/session";
import type { App } from "./app";
import { readNav } from "./nav";
import { enterSelect, setMode } from "./select";
import { beginAttract, resetAttractWorld, setPaused, toMenu } from "./match";
import { leaveNet } from "./net";

export function updateTitle(app: App): void {
  if (app.anyPressed("start") || app.anyPressed("a") || app.cursors.takeClick()) {
    app.audio.ui("ok");
    toMenu(app);
  }
}

// ── Main menu ──

export function updateMenu(app: App, now: number): void {
  const { menus, net } = app;
  const r = menus.update(readNav(app.pads.players, now), app.cursors.takeMouse(), (k) => app.audio.ui(k));
  if (r === "options") app.applyOptions();
  if (r === "host" || r === "join") {
    menus.netBusy = true;
    menus.netStatus = r === "host" ? "OPENING THE GATES..." : "TAKING A SEAT...";
    menus.netAddrs = [];
    const name = app.save.tagNames()[0] ?? (r === "host" ? "HOST" : "GUEST");
    if (r === "host") net.link.host(name);
    else net.link.join(name, app.params.get("host") ?? undefined, menus.joinRoom ?? undefined);
  } else if (r === "leave") leaveNet(app, "");
  if (menus.page === "browse" && now - menus.roomsAt > 2 && !net.roomFetch) {
    menus.roomsAt = now;
    fetchRooms(app);
  }
  if (r === "fight" || r === "training") {
    app.training = r === "training";
    if (app.training) setMode(app, "1v1");
    app.screens.training = app.training;
    app.state = "select";
    enterSelect(app);
    app.screens.set("select");
  } else if (r === "title") beginAttract(app);
}

/** Refreshes the browse page's battle list from the server (`?host=` points at another machine's server). */
function fetchRooms(app: App): void {
  const { menus, net } = app;
  const hostParam = app.params.get("host");
  const base = hostParam ? `${location.protocol === "https:" ? "https" : "http"}://${hostParam}` : "";
  net.roomFetch = true;
  fetch(`${base}/net/info`, { cache: "no-store" })
    .then((res) => res.json())
    .then((j: { rooms?: RoomInfo[] }) => {
      // Open lobbies first, fullest first.
      menus.rooms = (j.rooms ?? []).sort(
        (a, b) => Number(a.phase !== "lobby") - Number(b.phase !== "lobby") || b.humans - a.humans,
      );
      menus.roomsError = "";
      if (menus.focus > menus.rooms.length) menus.focus = menus.rooms.length;
    })
    .catch(() => {
      menus.rooms = [];
      menus.roomsError = "COULD NOT REACH THE SERVER";
    })
    .finally(() => {
      net.roomFetch = false;
    });
}

// ── Match ──

/**
 * Start pauses (remembering which pad did it); every local pad feeds its CommandMapper with the context it
 * needs (pad / shop / learn availability, aim ranges, morph state), then guests send their commands to the host.
 */
export function updateMatchInput(app: App, now: number): void {
  const { world: w, view, net } = app;
  if (app.anyPressed("start") && app.pausing) {
    app.pauser = app.pads.players.findIndex((p) => p.pressed.start);
    if (net.mode === "peer") net.link.toHost({ t: "pause", k: app.pauser });
    else setPaused(app, true);
  }
  app.pads.players.forEach((p, pi) => {
    // Online guests map their local pads onto the seats they hold on the host.
    const i = net.mode === "peer" ? (net.mySlots.get(pi) ?? -1) : pi;
    const m = i >= 0 ? app.mappers[i] : null;
    if (!m) return;
    const h = w.heroForPlayer(i);
    const alive = !!h && h.alive;
    const ws = w.players.find((q) => q.player === i);
    if (ws) m.ui.commander = ws.commander;
    m.morphable = h ? w.morphState(h) : null;
    m.morphHold = w.morphCfg?.holdSeconds ?? 0.6;
    const pad = h?.alive ? padNear(w, h) : null;
    const padStructure = pad?.structureId ? w.get(pad.structureId) : undefined;
    m.specReady = !!padStructure && padStructure.team === h!.team && canSpec(w, padStructure);
    m.update(
      p,
      now,
      alive && !!padNear(w, h!),
      alive && w.arena.inShop(h!),
      !!h?.hero?.picks.length,
      h?.alive && h.hero ? placeRanges(w, h) : null,
    );
    // FFA, house fallen: the d-pad (or stick flick) / A switches who this player spectates.
    const fallen = w.ffa && !!ws && !!w.teams[ws.team]?.out;
    if (fallen && (p.pressed.right || p.pressed.a)) view.spectate(i, 1);
    else if (fallen && p.pressed.left) view.spectate(i, -1);
    if (view.camMode !== 0 && !m.ui.commander && !fallen) {
      if (p.pressed.down) view.zoomStep(i, 1);
      if (p.pressed.up) view.zoomStep(i, -1);
    }
  });
  view.setMenus(app.mappers.map((m) => !!m && m.ui.buildMenu !== "closed"));
  view.setReticles(
    app.mappers.flatMap((m, i) => {
      const r = m?.ui.reticle;
      const h = r ? w.heroForPlayer(i) : undefined;
      return r && h ? [{ heroId: h.id, slot: r.slot, dx: r.dx, dz: r.dz, range: r.range }] : [];
    }),
  );
  if (net.mode === "peer")
    for (const [k, slot] of net.mySlots) {
      const m = app.mappers[slot];
      if (m) net.link.toHost({ t: "cmd", k, c: packCommand(m.take()) });
    }
}

// ── Pause menu ──

/**
 * Only the pad that paused drives the pause menu (other pads and the mouse are ignored, unless the pauser is the
 * keyboard seat, which owns the mouse). If the pauser unplugged, anyone may drive it.
 */
export function updatePaused(app: App, now: number): void {
  const { pads, menus, world: w } = app;
  const own = app.pauser >= 0 && pads.players[app.pauser]?.connected ? app.pauser : -1;
  const mouse = app.cursors.takeMouse();
  if (own >= 0 && own !== pads.keyboardSlot()) mouse.click = mouse.right = mouse.moved = false;
  const r = menus.updatePause(readNav(pads.players, now, own), mouse, (k) => app.audio.ui(k));
  const startPressed = own >= 0 ? pads.players[own].pressed.start : app.anyPressed("start");
  if (startPressed || r === "resume") {
    if (app.net.mode === "peer") app.net.link.toHost({ t: "pause" });
    else setPaused(app, false);
  } else if (r === "quit") toMenu(app);
  else if (r === "meter") {
    app.hud.resetTrainer();
    setPaused(app, false);
  } else if (r === "cooldowns") {
    for (const pl of w.players) {
      const e = w.heroForPlayer(pl.player);
      if (!e?.hero || e.dummy) continue;
      for (const k of Object.keys(e.hero.cooldowns)) e.hero.cooldowns[k] = 0;
      e.hero.meter = w.data.heroes.baseline.superMax;
    }
    setPaused(app, false);
  } else if (r === "level") {
    for (const pl of w.players) {
      const e = w.heroForPlayer(pl.player);
      if (!e?.hero || e.dummy || !app.people[pl.player]) continue;
      const levels = w.data.talents?.xp.levels ?? [];
      if (e.hero.level < levels.length) gainXp(w, e, Math.max(1, levels[e.hero.level] - e.hero.xp));
    }
    setPaused(app, false);
  } else if (r === "champion") {
    // Training: back to select keeping the sealed picks.
    menus.training = false;
    w.match.phase = "over";
    app.state = "select";
    enterSelect(app, true);
    app.screens.set("select");
    app.hud.show(false);
    resetAttractWorld(app);
  }
}

// ── Results ──

/**
 * A / Start leaves results back to select (keeping picks). Online only the host decides: guests wait on the
 * results until the host's lobby comes back (net.ts then moves them to it).
 */
export function updateResults(app: App): void {
  app.screens.resultsWait = app.net.mode === "peer";
  if (app.net.mode === "peer") return;
  if (!app.anyPressed("a") && !app.anyPressed("start")) return;
  app.state = "select";
  enterSelect(app, true);
  app.screens.set("select");
  resetAttractWorld(app);
}
