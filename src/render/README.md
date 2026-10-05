# Rendering (`src/render`)

Three.js view of the simulation. Nothing here feeds back into the sim: the client reads `World` state, drains
`World.events` once per frame and draws. Every view renders at native resolution into one half-float target and a
single grade pass writes it to the canvas (see `docs/decisions.md`, "One render/UI pipeline"). The 2D HUD is a
separate canvas (`src/ui`).

## Layout

```
gameRenderer.ts     GameRenderer: scene, render target + grade pass, cameras, split screen, the frame (below)
camera.ts           camera framing math (placeCam / aimCamera)
reticle.ts          aim reticles for held abilities
mapView.ts          map loading (glTF props, terrain, water)       heroModels.ts unitModels.ts structureModels.ts
props.ts            runtime props (+ @costume variants)            costumes.ts   costume tables, player -> costume
chasmIce.ts beachDebris.ts   map decorations built at load         (these root modules are imported by src/app, ui)

entities/   EntityViews: one View per sim entity (heroes, soldiers, structures)
            entityViews.ts (sync, per-view batch filling, fog of war), createView.ts, heroSync.ts, unitSync.ts,
            structureSync.ts, heroOverlays.ts (marks, shield dome, range rings), bars.ts, marks.ts,
            silhouettes.ts, animation.ts (clip tables), wading.ts (water clip, ripples, footsteps),
            ballista.ts, relicView.ts (the grudge relic + carried bombs), view.ts (View, disposeTree)
combat/     CombatFx: transient effects for sim events
            combatFx.ts (host, primitives, update), events.ts (SimEvent -> effects), projectiles.ts,
            fieldFx.ts (war banners, shop cannon, repair), ambientFx.ts (auras, charge sparks, smoke),
            towers.ts (tower pulses, projectiles, idle fx), floatText.ts (damage numbers, labels, callouts),
            textures.ts (procedural canvas textures), assets.ts (shared meshes/materials)
kits/       per-hero visual kits registered in KITS (registry.ts); index.ts imports them all
            warlord, warden (+ wardenParts: Thorn's reusable growth pieces), raider, duelist, summoner, engineer,
            herald, marksman, friar, rider; shared.ts (common helpers/materials), desert.ts (Sun Totem cactus)
heroProps/  persistent hero props outside the hero model: Wren's Pip + vantage, Maddock's kegs/cask/keg rocket,
            Bramble's Take Wing lift (rider.ts, called from heroSync)
hazards/    HazardViews: traps (snares.ts), zones (zones.ts), terrain mods (terrainMods.ts: ramps, walls),
            grow.ts (grow-in batching shader), tesla.ts, materials.ts; owns MapFx
map/        MapFx (mapFx.ts) per map feature: avalanche, horns, jumpPads, lantern, morphs, mist, fountain, gates;
            terrainMesh.ts (terrain + water meshes), ambience.ts (torches, motes, sky), textures.ts
fx/         FX engine shared by all of the above: atlas.ts (FX atlases + costume/HD resolution), parts.ts
            (FxHost, emit, tumblers), chunks.ts, shockwave.ts, fissures.ts, decals.ts, ribbon.ts,
            particles.ts (instanced billboards), instances.ts (FxBatch), costumeSkins.ts (costume theming tables)
batch/      draw-call batching: unitBatch.ts (skinned instancing), meshBatch.ts, spriteBatch.ts, structureBatch.ts
models/     model helpers: mergedModel.ts (merged skinned parts + texture arrays), markers.ts, placeholders.ts
```

## The frame (`GameRenderer.render`)

1. `FRAME.id++` (skeletons and per-frame batch work run once per frame however many views draw).
2. **Events** (`drainEvents`): map and terrain-mod events go to `HazardViews.handle` (which forwards map
   features to `MapFx`); hits and rank-ups also hit `EntityViews` (white flash, jolt, hit-stop); everything except
   plain builds goes to `CombatFx.handle`, which sets the **active costume** of the event's source and runs
   `combat/events.ts`. The source hero's kit gets the first say (`act` / `hit` / `event`), then the generic
   effect. `World.events` is cleared.
3. **Entity sync**: `EntityViews.sync` creates/removes views to match `World.entities`, interpolates transforms
   with `alpha`, then `syncHero` / `syncUnit` / `syncStructure`, marks, talent overlays and impacts.
4. **Other views**: relic, hero props, projectile/missile/banner views, `CombatFx.update` (particles, floating
   text, timed effects, `after()` callbacks), `HazardViews.sync` (traps, zones, mods, map features), reticles.
5. **Cameras**: `syncSplit` picks one view per local human (or the shared camera / window rect / demo camera),
   `fitTargets` keeps the canvas and target at CSS size × min(DPR, 2) × render scale.
6. **Per view** (`drawScene`): fog of war for the viewing team (`setViewer`), scene matrices and
   `fillUnits` (once per frame), frustum culling of view roots, `fillView` (bars, batches, hints, blob shadows,
   foot rings, foam, sprites) and hazard sprites, silhouette proxies, `renderer.render` into the scissored
   viewport.
7. **Grade**: one full-screen pass from the target to the canvas (sRGB encode, saturation, vignette).

## Costumes, kits and FX resolution

- **Hero kits** (`kits/registry.ts`): `KITS[heroType]` may define `hit`, `act`, `event`, `projectile`,
  `projectileTick`, `trail`/`trailWidth`. Kits draw through an `FxHost` (CombatFx): `add` a timed object,
  `after` a delayed callback, `emit` particles, `chunks`, `shockwave`, `decal`, `fissures`...
- **Active costume** (`fx/atlas.ts`): `withCostume(c, fn)` / `useCostume(c)` set it; CombatFx, projectiles,
  hero props, zones and timed effects (`add`/`after` remember the costume they were created under) set it for
  you. Under it:
  - hero atlas getters (`WARDEN.leaf`, `FRIAR.foam`...) return the costume's themed cell when its sheet
    (`assets/fx/<atlas>@<costume>.png`) exists and has loaded, else the base cell;
  - `cv(tex)` resolves any texture (costume swap -> atlas variant -> composite redrawn from variant cells),
    `cm(mat)` gives a per-costume material clone, `hd(tex)` additionally upgrades big cells to the HQ painting
    (`assets/fx/hq/<atlas>.<key>[@costume].png`, registered with `hdAlias`), `baseTex` maps back to the base
    cell for registry look-ups;
  - `tint(color)` remaps kit colours and `trailOf(costume)` gives weapon-trail colours; both tables, the common
    cell swaps (`setCostumeSwap`) and the procedural skins (`COSTUME_SKIN`: chunk geometry, fissure materials,
    decal overrides) are filled in `fx/costumeSkins.ts`.
- **Models**: a model costume is `assets/heroes/<hero>@<costume>.glb`; texture costumes repaint materials from
  `assets/costumes/<hero>/<costume>/` (`costumes.ts`). Runtime props prefer `assets/props/<name>@<costume>.glb`
  (`prop()` / `propParts()` with the owner's costume).
- **Disposal**: geometry flagged `userData.model` and materials flagged `userData.keep` are shared and never
  disposed by effects or views; each subsystem also keeps its own `SHARED_*` / `KEEP_*` sets. `Material.dispose`
  is a no-op globally (disposing materials forced shader recompiles; see the constructor of GameRenderer).

## Adding a new hero's visuals

1. Model: `assets/heroes/<type>.glb` with the shared clip names (`idle`, `run`, `attack_a/b/c`, `cast`, ...);
   map any new ability kinds to clips in `entities/animation.ts` (`KIND_ANIM`, fallbacks in `ANIM_FALLBACK`).
2. FX atlas: a 4×4 sheet `assets/fx/<atlas>.png` and an `atlas("<atlas>", url, [keys])` export in
   `fx/atlas.ts` (cell order = key order). Optional HQ paintings in `assets/fx/hq/`.
3. Kit: `kits/<type>.ts` setting `KITS.<type> = { trail, hit, act, event, projectile... }`, imported from
   `kits/index.ts`. Reuse `kits/shared.ts` (`core` hit, `ground`, `near`) and the `fx/` helpers.
4. Props that persist outside the model (pets, thrown objects): a view in `heroProps/`, synced from
   `HeroPropViews.sync`. Props spawned by effects go in `assets/props/` and are loaded with `prop()`.
5. Costumes: themed atlases `assets/fx/<atlas>@<costume>.png`, then tints/trails/swaps/skins in
   `fx/costumeSkins.ts`.
