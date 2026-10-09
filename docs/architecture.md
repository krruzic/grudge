# Architecture

Grudge is a browser game (TypeScript, three.js, Vite). One deterministic simulation drives everything; the client
renders it, draws a 2D UI over it and feeds it player input. Headless tools run the same simulation.

```
                 ┌──────────── src/app (client controllers, one App object) ────────────┐
 pads / keys ──► │ input ──► CommandMapper ──► Command per player per tick ──► World.step │ ◄── src/net (lockstep)
                 │                                   │                                   │
                 │                     World state + World.events                        │
                 │                ┌──────────────────┼───────────────────┐               │
                 │          src/render         src/ui (HUD)        src/audio             │
                 │       3D views of World   2D UI canvas overlay   sfx for events       │
                 └───────────────────────────────────────────────────────────────────────┘
```

## Modules

| Path | Role | Docs |
| --- | --- | --- |
| `src/sim` | Deterministic fixed-tick game simulation (`World`), bots, data types. Never reads UI, camera or wall clock. | [src/sim/README.md](../src/sim/README.md) |
| `src/render` | three.js renderer: map, heroes, units, structures, FX; reads a `World` and its events each frame. | [src/render/README.md](../src/render/README.md) |
| `src/ui` | The single 2D UI canvas: HUD, screens (title, select, field, results), menus, pause. | [src/ui/README.md](../src/ui/README.md) |
| `src/input` | Devices (gamepads, keyboard + mouse, GameCube adapter, Switch 2 Pro) -> `PadState`; `CommandMapper` -> `Command`. | file headers |
| `src/net` | `NetLink` WebSocket client for the relay (`tools/netrelay.ts`) and lockstep helpers (`session.ts`). | file headers |
| `src/audio` | WebAudio sfx for sim events, UI blips, music per screen. | `sfx.ts` header |
| `src/game` | Save data (rules, options, names, records) and rule application to `GameData`. | `save.ts` header |
| `src/app` | The client: boot, screen state machine, select / lobby / match / net controllers, frame loop, codex demos, debug API. | below |
| `src/main.ts` | Entry: load assets, build the `App`, pick the first screen from the URL, start the loop. | |
| `tools/` | Headless sims, determinism check, map baking, asset pipelines, servers. | `tools/*` headers |

## The client (`src/app`)

`App` (`app.ts`) holds all client state in one place: the current `World`, the screen state, the select seats,
who drives each player slot (`mappers` for local humans, `bots` for CPUs, remote seats over the net), and the
subsystems (renderer, UI canvas + `Hud` + `Screens` + `Menus`, `Gamepads`, `Audio`, `Save`, `NetSession`).
Controllers are plain functions over the `App`:

```
assets.ts   static GameData, maps, roster; loadAssets() at boot
app.ts      App state + small helpers (fields, seats, newWorld, show, applyOptions)
loop.ts     the frame: input -> state update -> sim step -> HUD/audio -> render -> UI paint
states.ts   title, main menu (+ room list), match input, pause menu, results
select.ts   champion select + field select, seats/chips rules, name signing, costume flicks
lobby.ts    online guest's mirrored select screen
match.ts    control setup, MatchSpec -> World, start / pause / end, attract-mode backdrop, sim stepping
net.ts      online session: seating guests, lobby / presence mirroring, lockstep frames, desync detection
demo.ts     codex live demos (private demo World in the page's window)
nav.ts      menu navigation with key-repeat, device names
debug.ts    URL entry points (?screen=, ?bots=...) and window.grudge
```

### Screen states

```
title ──► menu ──► select ──► map ──► match ◄──► paused
            ▲        ▲                  │           │
            │        └──── results ◄────┘           │ (training: change champion -> select)
            └──────── (quit / back) ─────────────────┘
menu (versus online) ──► host: select ...   guest: lobby (mirrors the host's select / field select) ──► match
```

Title, menus and select run an **attract-mode** CPU match on the current map behind the UI (`resetAttractWorld`).
Every match starts from a `MatchSpec` (`startNetMatch`), locally or online, so all paths build worlds the same way.

### One frame (`loop.ts`)

1. Poll pads, drain the network, route the keyboard / mouse seat.
2. The current state's controller handles input (may change state, start a match, open a menu).
3. Step the `World` at the fixed tick rate (`stepWorld`); online guests only replay the host's frames.
4. `Hud.update` digests `World.events` (banners, cards, hit shakes); audio plays them; music follows the state.
5. Render the 3D view (or a codex demo world), then paint the UI canvas: HUD, screens, menus, overlays.

### Online play (lockstep)

The relay (`tools/netrelay.ts`, served by Vite in dev and `tools/server.ts` in production) only routes messages.
The **host** runs the real select screen and simulation. **Guests** see a mirrored lobby and send requests (pick,
ready, seat, name, costume, camera). At match start everyone builds the same `World` from the host's `MatchSpec`.
Each tick the host merges the commands each guest sent since the last tick with its own and its bots' commands,
steps, and broadcasts the packed frame; every 30 ticks it adds a world hash. Guests step only on received frames
and compare hashes (`OUT OF SYNC` on mismatch). Anything a peer can't see (UI, camera, costume visuals) never
reaches the sim. See `src/app/net.ts` and the determinism rules in `src/sim/README.md`.

## Input ownership rules

- Seats: a device takes the first free seat when it presses a button (`Gamepads`); a released device must let go
  of every button before it can rejoin.
- Pause: only the pad that paused drives the pause menu; others' pads and the mouse are ignored (unless the
  pauser is the keyboard seat). Online, guests ask the host to pause / resume.
- Select: a human's card is empty until they place their seal; returning from a match keeps everyone's sealed
  pick and costume. Only a card's owner can open its name entry or flip its camera button. The ready banner and
  start wait while anyone signs a name. Any cursor may pick a CPU seat's champion.

## Checks

- `pnpm exec tsc --noEmit -p .` - typecheck.
- `pnpm determinism --check` - fixed bot matches must hash exactly like `tools/determinism.baseline.json`
  (run after any sim change; never rebaseline for a refactor).
- `pnpm exec prettier --write <files>` - formatting (120 columns).
