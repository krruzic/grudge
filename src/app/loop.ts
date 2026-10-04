// The frame loop. Each requestAnimationFrame:
//   1. input: poll pads, pump the network, route the keyboard/mouse seat;
//   2. state update: the current screen state's controller handles input (may change state);
//   3. simulation: fixed-step World ticks (or replaying the host's frames online), end-of-match flow;
//   4. HUD digests this frame's sim events, audio plays them, music follows the state;
//   5. render the 3D view (or the codex demo world), then paint the UI canvas: HUD, screens, menus, overlays.
// World.events are produced by step() and consumed in 4 within the same frame (World clears them next step).
import { liveWindow } from "../ui/uiPaint";
import { drawText, textWidth } from "../ui/font";
import { perf } from "../perf";
import type { App } from "./app";
import { maps } from "./assets";
import { CodexDemo } from "./demo";
import { pumpNet } from "./net";
import { keyboardEditor, updateFieldSelect, updateSelect } from "./select";
import { updateLobby } from "./lobby";
import { checkMatchOver, stepWorld, trackEliminations } from "./match";
import { updateMatchInput, updateMenu, updatePaused, updateResults, updateTitle } from "./states";

/** Longest frame step; a longer hitch is dropped rather than simulated. */
const MAX_DT = 0.25;

export function startLoop(app: App, onFirstFrame: () => void): void {
  const demo = new CodexDemo(app);
  const fps = { frames: 0, at: 0, shown: 0 };
  let last = performance.now();

  const frame = (nowMs: number): void => {
    const pf0 = perf.now();
    let now = nowMs / 1000;
    let dt = Math.max(0, Math.min(MAX_DT, (nowMs - last) / 1000));
    last = nowMs;
    // Debug freeze: time only moves by what dbg.adv requests.
    const dbg = app.dbg;
    if (dbg.freeze) {
      dt = dbg.adv;
      dbg.adv = 0;
      dbg.clock += dt;
      now = dbg.clock;
    }

    pollInput(app, now);
    updateState(app, now, dt);
    stepWorld(app, dt, now);
    checkMatchOver(app, now);

    const inMatch = app.state === "match" || app.state === "paused";
    let pft = perf.now();
    if (inMatch)
      app.hud.update(
        app.world,
        app.mappers.map((m) => m?.ui ?? null),
        now,
      );
    pft = perf.cpu("hudUpdate", pft);
    if (app.state === "match") {
      trackEliminations(app);
      app.audio.handle(app.world.events, (x, y, z) => app.view.worldToScreen(x, y, z));
    }
    updateMusic(app);

    const s = app.state;
    app.view.cinematic = s === "select" || s === "map" || s === "lobby" || (s === "menu" && app.menus.page !== "main");
    const demoAlpha = demo.update(dt);
    pft = perf.now();
    const paused = app.state === "paused";
    app.view.render(paused ? 0 : (demoAlpha ?? app.acc / app.world.dt), paused ? 0 : dt);
    pft = perf.cpu("render", pft);
    // Menus mark where they cut a window onto the live 3D view during the previous UI paint.
    app.view.windowRect = liveWindow.rect;
    app.view.overview = s === "paused" || s === "results";
    liveWindow.rect = null;

    drawUi(app, now, pft, fps, nowMs);
    perf.cpu("frame", pf0);
    perf.frame(app.view.renderer);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame((t) => {
    frame(t);
    requestAnimationFrame(onFirstFrame);
  });
}

// ── Input ──

function pollInput(app: App, now: number): void {
  const { pads, cursors, screens } = app;
  pads.poll();
  pumpNet(app, now);
  // The mouse belongs to the keyboard seat; with no other pad connected, using the mouse claims that seat.
  pads.mouseClaims = !pads.players.some((p) => p.connected && p.profile !== "keyboard");
  if (cursors.mouseUsed && pads.keyboardSlot() < 0 && pads.mouseClaims) pads.claimKeyboard();
  cursors.mouseSlot = pads.keyboardSlot();
  for (const p of pads.players) {
    if ((p.pressed.start && p.held.z) || (p.pressed.z && p.held.start)) app.showPads = !app.showPads;
  }
  // Browsers only allow audio after a user gesture.
  if (pads.players.some((p) => Object.values(p.pressed).some(Boolean))) app.audio.unlock();
  // While the keyboard player signs a name, game key bindings are off.
  pads.typing = !!keyboardEditor(app);
  if (app.state !== "select" && app.state !== "lobby") {
    screens.naming.clear();
    cursors.frozen.clear();
  }
  if (app.state !== "lobby") cursors.tagOf = null;
}

function updateState(app: App, now: number, dt: number): void {
  switch (app.state) {
    case "title":
      return updateTitle(app);
    case "menu":
      return updateMenu(app, now);
    case "select":
      return updateSelect(app, now, dt);
    case "map":
      return updateFieldSelect(app, now, dt);
    case "lobby":
      return updateLobby(app, now, dt);
    case "match":
      return updateMatchInput(app, now);
    case "paused":
      return updatePaused(app, now);
    case "results":
      return updateResults(app);
  }
}

function updateMusic(app: App): void {
  const s = app.state;
  const fight = s === "match" || s === "paused";
  const track = fight
    ? app.world.match.phase === "sudden"
      ? "sudden"
      : "battle"
    : s === "results"
      ? "results"
      : s === "select" || s === "map" || s === "lobby"
        ? "select"
        : "menu";
  app.audio.setMusic(track, s === "paused" ? 0.35 : 1);
  app.audio.update();
}

// ── UI paint ──

function drawUi(
  app: App,
  now: number,
  pft: number,
  fps: { frames: number; at: number; shown: number },
  nowMs: number,
): void {
  const { view, hud, screens, uiCanvas, net } = app;
  const ctx = uiCanvas.begin();
  const W = uiCanvas.w;
  const H = uiCanvas.h;
  hud.locate = view.splitCount ? null : (x, y, z) => view.worldToScreen(x, y, z);
  hud.split = view.splitCount;
  hud.zoomOut = view.zoomOut();
  hud.rectOf = (pl) => view.viewRectOf(pl);
  hud.draw(
    ctx,
    W,
    H,
    app.world,
    app.mappers.map((m) => m?.ui ?? null),
    now,
  );
  pft = perf.cpu("hudDraw", pft);

  updateFieldScreen(app);
  if (app.state === "select" || app.state === "lobby") screens.portraits?.renderStages();
  screens.adapterStatus = adapterStatus(app);
  screens.adapterDebug = app.pads.gc.debug();
  screens.draw(ctx, W, H, now);
  if (app.state === "menu") app.menus.draw(ctx, W, H, now);
  if (app.state === "paused") app.menus.drawPause(ctx, W, H, now, app.world);

  if (net.mode !== "off" && (app.state === "match" || app.state === "paused")) {
    const t = net.desync ? "OUT OF SYNC" : net.mode === "host" ? "HOSTING" : "ONLINE";
    drawText(ctx, t, 4, H - 9, net.desync ? "#ff6040" : "#c8c0a8", 0.55);
  }
  fps.frames++;
  if (nowMs - fps.at >= 500) {
    fps.shown = Math.round((fps.frames * 1000) / (nowMs - fps.at));
    fps.at = nowMs;
    fps.frames = 0;
  }
  if (app.save.data.options.fps) {
    const t = `${fps.shown} FPS`;
    const col = fps.shown >= 55 ? "#a0ff80" : fps.shown >= 30 ? "#ffe060" : "#ff6050";
    drawText(ctx, t, W - 4 - textWidth(t, 0.7), H - 10, col, 0.7);
  }
  app.padsEl.textContent = app.showPads ? app.pads.debugText() : "";
  perf.cpu("screens", pft);
}

/** Field-select inputs: a guest watching the host's field pick mirrors it; otherwise our own pick / mode. */
function updateFieldScreen(app: App): void {
  const { screens, net } = app;
  const mapData = maps.map((m) => m.data);
  const watched = app.state === "lobby" && net.guestField ? screens.lobby : null;
  if (watched && net.guestField)
    screens.updateMaps(mapData, net.guestField[0], app.fieldsFor(watched.mode), watched.mode);
  else
    screens.updateMaps(
      mapData,
      app.state === "map" ? app.pickIndex : Math.max(0, app.fields().indexOf(app.mapIndex)),
      app.fields(),
      app.mode,
    );
  screens.fieldWatch = !!watched;
  const hostTag = watched?.slots.find((s) => s.remote === 0 && !s.cpu && !s.open && s.name)?.name;
  screens.fieldNote = watched
    ? `${hostTag ? `${hostTag} · THE HOST` : "THE HOST"} PICKS THE FIELD`
    : net.mode === "host" && app.state === "map" && net.peerNames.size
      ? "YOU PICK THE FIELD FOR EVERYONE"
      : "";
}

/** Title-screen line about GameCube adapters and Switch 2 Pro controllers. */
function adapterStatus(app: App): string {
  const { pads } = app;
  const viaDriver = pads.players.some((p) => p.connected && p.profile === "gc_adapter_uinput");
  const gcText = viaDriver
    ? "GAMECUBE ADAPTER CONNECTED"
    : pads.gc.status.startsWith("LINUX")
      ? pads.gc.status
      : pads.gc.connected
        ? `GAMECUBE ADAPTER READY · ${pads.gc.ports.filter((p) => p.connected).length} CONTROLLER(S)`
        : pads.gc.status;
  const proText = pads.pro.count
    ? `${pads.pro.count} PRO CONTROLLER${pads.pro.count > 1 ? "S" : ""}`
    : pads.proWake.woken
      ? "PRO CONTROLLER AWAKE · PRESS G"
      : pads.pro.status || pads.proWake.status;
  return [gcText, proText].filter(Boolean).join(" · ") || "G: GAMECUBE ADAPTER · P: WAKE A SWITCH 2 PRO CONTROLLER";
}
