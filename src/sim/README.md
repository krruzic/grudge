# Simulation (`src/sim`)

Deterministic, fixed-tick game simulation. Everything gameplay-relevant happens here; the client
(`src/render`, `src/ui`, `src/main.ts`) only reads `World` state, drains `World.events` for fx/audio, and feeds
one `Command` per player per tick. Headless tools (`tools/*.ts`) and bots run the exact same code.

## Layout

```
world.ts            World: state + step() (tick order below); thin delegates to world/*
world/              commands (per-player input), damage pipeline, death/bounties, movement & collision,
                    vision/cover, hazards (traps, zones, terrain mods, tide, chasm), economy, bases & formations,
                    morph, jumps, match flow, projectiles, rng, default status
heroes.ts           public hero API (re-exports from hero/)
hero/               update.ts (hero controller), start.ts (begin an ability), fire.ts (ability effects dispatch),
                    kinds/* (per ability kind), strikes.ts (hit shapes), combos.ts, gravewalk.ts, placement.ts,
                    boomerangs.ts, marksman.ts + friar.ts + architect.ts (per-hero mechanics)
talents.ts          talent trees, xp/levels, effective abilities (hero.ab); talents/ effects, missiles, triggers
units.ts            soldier AI                       structures.ts  pads/build/upgrade/spawnUnit
structures/towers.ts tower behaviour                 arena.ts + arena/  relic, waves, shop/bombs, cannon, ogre
mapEvents.ts + mapEvents/  lockdown, timed gates, mist, lantern, avalanche/horns, fountain
bot.ts + bot/       AI player producing Commands (think, awareness, strategy, economy, navigate)
terrain.ts nav.ts   map grid + heights, A* nav grid
surround.ts + surround/  decorative scenery outside the map (render/bake only; never read by the sim)
types.ts config.ts  entity/state types, static data (GameData) types
```

## Tick order (`World.step`)

1. Snapshot `prev*` transforms (for render interpolation).
2. Match clock (sudden death / tiebreak), economy (income, catch-up every 15 ticks), status refresh
   (auras, hidden/seenBy).
3. For each player slot in order: build/spec/shop/talent/morph/formation/chat/directive commands, then the hero
   controller (`hero/update.ts`: respawn, jumps, recall, stun, input -> actions, action tick + fire, movement).
4. Arena (relic, cannon, ogre, unit waves, bombs), then units and structures (over a snapshot of the entity list).
5. Projectiles, boomerangs, missiles, kegs, status ticks (bleed/shields), `later()` timers, hazards
   (expiry, traps, zones, delayed blasts, terrain mods), tide, map events.
6. Knockback, body separation, lockdown enforcement, chasm deaths, removal of dead non-hero entities,
   `tick++`, `time += dt`.

## Entities and events

`Entity` is one shape for heroes, units and structures (exactly one of `hero` / `unit` / `structure` is set).
`w.entities` keeps creation order; heroes are never removed (they wait in the list while dead). Timed effects
are stored as absolute times (`...Until`, cooldowns = time the key is ready). All damage goes through
`World.damage` (`world/damage.ts`), all deaths through `World.kill` (`world/death.ts`).

`SimEvent`s (`w.emit`) are output only: hits, deaths, notices, fx cues. The sim never reads them back, so they
can be dropped or intercepted freely (the client and most tools clear `w.events` after each step).

## Data flow

`data/*.json` -> `GameData` (read-only). A hero's `HeroDef` lists base abilities (`a` attack, `b` secondary,
`r` special, `z` super). Learning talents rewrites ability fields (`set` / `add` / `mul`) and merges `fx` flags;
`talents.recompute` caches the result in `hero.ab`, and gameplay code only ever calls `abilities(w, e)`. An
ability's `kind` picks its implementation (`hero/kinds/*`, `marksman.ts`, `friar.ts`, `architect.ts`); `hooks` on the hero def
are passive per-hero modifiers. Costumes/skins are purely client-side: the sim only knows hero types.

## Determinism (lockstep) rules

Online play sends only Commands; every peer must compute bit-identical state. `npm run determinism -- --check`
compares final world hashes of fixed bot matches with `tools/determinism.baseline.json` - run it after any sim
change (and never update the baseline for a refactor).

- Randomness: only `w.rng()` (seeded mulberry32) in the sim, `Bot.rand()` in bots. Never `Math.random`, wall
  clock time, or anything frame-rate dependent. Every extra/missing/reordered rng call changes the future.
- Order: iterate `w.entities` / `w.players` / other arrays in their stored order; snapshot (`.slice()`) when the
  loop body can add or kill entities; keep `Map`/`Set` insertion orders stable.
- Floating point: don't algebraically rearrange formulas (`a * b * c` vs `a * (b * c)` differ in the last bit);
  keep multiplier application order in the damage pipeline.
- `later(seconds, fn)` timers run in (time, insertion) order during step phase 5.
- Commands must stay plain serialisable data; anything a peer can't see (UI state, camera) must not affect the
  sim.
