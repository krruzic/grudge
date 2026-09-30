# Decisions log

## Direction (from the designer)

- **Name:** Grudge.
- **Premise (design direction only, not in-game lore):** A dead king left no heir. By old law the crown goes to whichever house wins the Grudge, a ritual war fought in consecrated arenas where the fallen are raised at dawn to fight again. The arena's curse explains why heroes respawn and minions keep appearing. Each hero is a champion sent by a rival house, which is why the cast can mix a knight, an ogre warlord, a ninja from a foreign order and so on.
- **Cast tone:** medieval wizardry fantasy with knights, ninjas and ogres. Working mapping to the plan's roster: Warlord = ogre warlord, Duelist = knight, Raider = ninja, Summoner = wizard, Engineer = siege artificer, Warden = druid or warden. Final names are still open.
- **Map look:** Majora's Mask style: saturated grass, dirt patches, stonework cliffs and walls.
- **Input:** controllers only. GameCube controllers and Nintendo Switch Pro controllers are the only supported pads. There is no keyboard fallback, which overrides the plan's dev-keyboard note.

## Milestone 1: Skeleton

- **Stack:** Vite 8, TypeScript 7 and three.js r186. `npm run dev` runs the game and `npm run build` typechecks and bundles it.
- **Terrain:** built from rectangle regions and ramps in `data/maps/*.json`, authored for the left half and mirrored across the X axis. This is simpler to author than a per-cell grid. Cells are 1 m and each tier is 1.2 m tall. Tier -1 means impassable stonework.
- **Movement:** blocked when the terrain height changes by more than `stepHeight` (0.35 m). Cliffs block movement both up and down, and ramps are the only way to change tier.
- **Coordinates:** the sim uses x/z for the ground plane and y for height, matching three.js Y-up. The camera sits on the +z side, so pushing the stick up moves the hero toward -z.
- **Render pass:** the scene is drawn to a low-resolution target (480 lines, set in `data/render.json`), converted to sRGB, quantized to 5 bits per channel with 4x4 Bayer dithering, then bilinear-upscaled to the canvas.
- **Camera:** fixed 55 degree pitch with no rotation. It tracks the midpoint between the heroes and zooms from a 32 m wide view (half the map) out to the whole map.
- **Textures:** 32x32 grass, dirt and stone textures are generated at runtime on a canvas. They are placeholders until the Blender pipeline exists.
- **Hero placeholder:** a Warlord made of primitives, with a team-colored torso, a foot ring and a P1/P2 tag drawn on top of the terrain. Real silhouettes behind terrain are deferred to later milestones.
- **Controllers:** each pad joins the first free player slot when any of its buttons is pressed. Profiles in `data/input.json` are matched by gamepad id. The GameCube button and axis indices are a best guess for Mayflash/WUP-028 adapters and must be checked with the on-screen debug overlay (Start+Z toggles it).
- **Deferred:** the river is postponed to Milestone 6 (terrain rules).

## Graphics pass (pulled forward from Milestone 8, at the designer's request)

- **Asset pipeline:** Blender scripts live in `tools/blender/` and are run through the Blender MCP with `exec(open(path).read())`. They write `.glb` files to `assets/`.
  - `texgen.py`: procedural 64x64 textures (grass, dirt, cobble, cliff, brick, wood, water, leaves, pine, bark, tall grass, cloth, gold, iron, roof, skin, leather, bone, paint).
  - `build_map.py`: the arena, built from the grid that `npm run bake-map` exports. The TypeScript sim `Terrain` is the only source of truth for walkability, so the Blender side never re-derives the map rules.
  - `charkit.py`: character kit with primitives, rigid one-bone-per-part skinning (N64 style), NLA-track animation clips, vertex-color AO bake, glTF export and turntable renders.
  - `build_warlord.py` and `build_core.py`: the Warlord hero and the core model.
- **Lighting:** Cycles ambient occlusion is baked into the COLOR_0 vertex colors, and at runtime there is a single sun. Materials are converted to `MeshLambertMaterial` (no PBR).
- **Shadows (deviation from the plan):** the sun casts real-time shadow maps. The plan only asked for vertex lighting, but the designer asked for a much stronger look, and at 480 lines the shadows still read as late-90s.
- **Team color:** materials whose name starts with `team_` are tinted in game. The Warlord's helmet, pauldrons, tabard and sash use them. Static map dressing (tower roofs, banners, pad inlays) bakes the side color into vertex colors, because the map is mirrored by side.
- **Outlines:** heroes and structures get an inverted-hull black outline. It uses smoothed per-position normals so flat-shaded parts don't crack. This is for readability from across the room.
- **Map format:** `data/maps/*.json` is now a list of ops. The kinds are tier, wall (castle, ruin or rock), water, ford and bridge. The flags are dirt, paving and tall grass. Props with `solid` block their cell. Tiers are 1.6 m, ramps render as stairs, and the ford sits 0.5 m below the banks. Hero `stepHeight` is now 0.55 m.
- **Map "Grudgeholm Crossing" (80x48):**
  - moated castle courtyards with drawbridges, towers and banners
  - a north plateau with a tier-2 keep and a wide stone bridge
  - raised ruined forts mid-field, reached by stairs from both sides
  - a central river island (tier 2) holding the neutral pads, reached through the ford and stairs
  - a narrow wooden flank bridge in the south
  - tall grass and forest groves to hide in, and a forested rim plateau around the arena
- **Post pass:** 6 bits per channel, dithering, saturation 1.15 and a vignette. The sky is a gradient dome, fog is warm, and pollen motes float over the map. Torch flames flicker with point lights. The core crystal spins and glows.
- **Debug URL params:** `?spawn=x,z` teleports both heroes and `?zoom=width` sets the camera's closest zoom. Both are for screenshots.
- **N64 look pass (supersedes the shadow, outline and post-pass entries above):** the designer said the crisp look read as a Flash game.
  - Render at 240 lines, quantize to 5 bits per channel with the N64 4x4 magic-square dither, then a VI-style pass de-dithers horizontally and bilinearly upscales (`viBlur`).
  - `texgen.py` box-downsamples every texture to 32 px, softens it, cuts contrast 20% and quantizes it to RGBA5551. Rendering uses bilinear filtering and no anisotropy.
  - Shadow maps and inverted-hull outlines are off (`shadows`, `outlines` in render.json). Heroes get a soft blob shadow instead.
  - Camera is pitch 42 and FOV 46, with heavier cool distance fog.
- **Terrain:** the tiered map was replaced by a continuous vertex heightfield with slope-based walkability (`maxSlope`), and heroes are scaled 1.5x.

## Gameplay (M2-M7)
- **Sim layout:** `src/sim/world.ts` (tick, damage, economy, match), `heroes.ts` (A/B/L/R/Z), `units.ts` (directive AI), `structures.ts` (pads, towers, production), `nav.ts` (1 m grid A* with string pulling; structures block cells), `bot.ts` (bot player), `config.ts` (data types). Sim files import with `.ts` extensions so `npm run sim` runs them in Node directly.
- **Data:** `data/heroes.json` (tiers, baseline, abilities, hooks), `data/units.json`, `data/structures.json`, `data/match.json` (timer, sudden death, economy, catch-up, terrain rules, directive leashes).
- **Warlord kit:** A is a 3-hit club combo with auto-aim toward the stick; B is a ground slam (AoE, knockback, slow); L analog = block (75% frontal reduction, slow walk), L click = dodge roll with i-frames; R is War Cry (units +35% damage, +25% speed); Z is Quake (big AoE, stun). Passive aura +15% damage for nearby units; heavies get x1.25 stats.
- **Core shield:** up while the side has at least one standing home-pad structure and has never lost one. A side that builds nothing at home has no shield. Shields drop in sudden death.
- **Economy:** 5/s (the plan's 10/s filled every pad within two minutes), start 200; bounties per unit type, 60 per hero, 50 per structure. Catch-up compares net worth (bank + structure value) and structure count.
- **Build input:** X tap builds the hero default (Warlord: barracks) or upgrades an own structure. X held + C-stick: up damage, left control, right support, down opens production (left barracks, up range, right foundry, down back).
- **Directives:** C-stick flick up push, down hold, left follow, right hunt (attack nearest). Y held cycles grunt -> ranged -> heavy every 0.55 s (shown in the HUD); a flick while Y is held orders only that type.
- **Terrain rules:** high ground = attacker at least 1 m above target (+20% range/vision); uphill attacks miss 25%; heavies 30% slower on slopes steeper than 0.28; ford slows 40%; walls block line of sight, ranged-unit arrows tolerate 1.6 m of cover (ballistic), tower bolts 0.3 m; tall grass hides units until they attack (1.5 s) or an enemy is within 2.2 m.
- **Render:** units and non-core structures use three.js placeholder kits (`render/kit.ts`) until glbs exist in `assets/structures/<type>.glb` (picked up automatically). Heroes/units behind geometry draw a team silhouette through a stencil pass. Tower range rings conform to the terrain.
- **Flow:** title (bot-vs-bot attract match behind it) -> champion select (unjoined slots are CPU) -> match -> results. Start pauses. `?bots&time=N&seed=S` skips to a bot match fast-forwarded N seconds for screenshots.
- **Simulator:** `npm run sim -- --matches 200 --a warlord --b warlord [--verbose]` prints win rates, length, end reasons, early-lead conversion and flags.

## Roster, 2v2, audio (M9-M10)
- **Ability system:** each hero slot (A/B/R/Z) has a `kind` in `data/heroes.json`: combo, slam, quake, warcry, shoot, hex (delayed AoE), leap, dash, stealth, summon, repair, turret, ramp, wall, trap, zone, flurry, parry. Hooks (`hooks` object) carry each hero's rule breaks: costMul/upgradeCostMul (Engineer), flankMul/awayProductionMul/stepHeight/maxSlope (Raider), productionMul (Summoner), heroDamageMul (Duelist), controlTowerMul (Warden), aura + heavyStatMul (Warlord).
- **Engineer:** hammer combo; B repair pulse (heals own structures, knocks back enemies); R lays a 7 m plank ramp/bridge for 14 s (cells become Bridge with a sloped deck, nav recomputed); Z drops a 25 s turret. Structures cost 20% less, upgrades 40% less.
- **Raider:** dagger combo; B leap (lands on the nearest standable spot, ignores cliffs); R smoke (stealth 4 s, next hit x2); Z assassinate dash. Flanking = attacking from behind, or hitting a structure with no defending units within 7 m (x1.7). Production is 15% slower while the Raider is more than 28 m from its core. Step height 1.4 m, so it climbs ledges the others can't.
- **Summoner:** ranged magic bolt; B hex (telegraphed 0.9 s delayed AoE); R summons 2 temporary grunts; Z summons a small warband. Production 10% faster.
- **Duelist:** rapier combo; B lunge dash; R parry (0.6 s window; a hit is negated and countered with a stun); Z seven-hit flurry. +5% damage vs heroes, no base hook.
- **Warden:** spear combo; B throws an armed trap (root + damage, max 3); R raises a 6 m stone wall for 8 s; Z bramble field (slow + damage over time). Control towers hit 30% harder and reach 15% further.
- **Tiebreak chain:** core damage, then structures destroyed, then hero kills, then draw ("dead even"). Bot matches produced many 0-0 core-damage ties.
- **2v2:** players 3 and 4 are commanders (blue, red) playing the Herald: a fast, fragile banner bearer with a crossbow and a rally horn whose aura speeds nearby units. D-pad left/right picks the group (all/grunt/ranged/heavy), C-stick orders that group, D-pad up = siege (focus the nearest enemy structure to the Herald), D-pad down = rally (hold at the Herald). Commander orders lock out the hero's directives for 3 s. 2v2 starts when a third or fourth pad joins on the select screen.
- **Audio:** everything is synthesized with WebAudio (no files): positional SFX from sim events and a small procedural march that speeds up in sudden death. Browsers need one click to unlock audio (gamepad presses don't count as a user gesture in Chrome).
- **Assets:** `tools/blender/build_heroes.py` (5 heroes + Herald, shared rig/clips), `build_units.py` (grunt/ranged/heavy, 8 bones), `build_structures.py` (six pad structures with `spin_*`/`level2_*` nodes). Economy income lowered to 3.5/s since pads are the only sink.
- **Balance tool:** `tools/balance.sh [matches]` runs every matchup in parallel.
- **Balance status (bot vs bot, 16-20 matches per pair):** mirrors are 50/50 within noise and most pairs sit at 35-65. Known outliers: Warden vs Summoner (~17/83) and Summoner vs Duelist (~69/31). The bot can't use Warden's wall/traps tactically, so these numbers undersell the Warden; they need human playtesting before more tuning. Tuning so far: Summoner health low and summons nerfed; Warden damage/trap/zone buffed and speed moved to mid x0.92 (`hooks.speedMul`); Duelist hero bonus down to +5%.

## N64 look pass 2 (after reading Alfred Baudisch's N64/Banjo-Kazooie series)
- **What the articles say:** N64 environments get their richness from vertex colors (painted paths, colour variation, faked sun light, shadow and AO) multiplied over textures, plus texture blending by vertex alpha. Textures are small (32x32 truecolour, 64x64 16-colour CI4) and bilinear-filtered; no specular.
- **Textures:** `texgen.n64ify` now keeps 64x64 and quantizes each texture to a 16-colour palette (k-means) with RGBA5551 colours and 1-bit alpha. No pre-blur; the only softness is bilinear filtering at render time.
- **Terrain:** unlit (MeshBasicMaterial) with all lighting baked into vertex colours: hemisphere ambient, sun N·L, heightfield/wall/prop ray-marched sun shadows, horizon AO and low-frequency colour variation. The splat blend (grass/dirt/rock/cobble) stays and plays the role of Banjo's vertex-alpha blending.
- **Output:** 240 lines, 5-bit colour + magic-square dither, then a sharp-bilinear upscale (crisp texels, smooth edges) with a light VI de-dither (`viBlur` 0.35). This replaces the full bilinear blur, which read as mush.
- **UI:** the HUD and every menu are drawn into a 240-line canvas with a hand-made 5x7 bitmap font, scaled with nearest-neighbour. No more hi-res DOM text.
- **Animation:** `tools/blender/anims.py` holds shared clip sets. Heroes: idle, run, attack_a/b/c (combo hits 1-3), slam, cast, shoot, block, dodge, hit, death. Units: idle, walk, attack, hit, death. A weight factor slows heavy characters and speeds up light ones. In game, abilities map to clips by kind; units flinch on hit and leave a corpse that plays death and sinks; heroes play death before disappearing until respawn.
- **Clean output (supersedes the 240-line/dither setup):** the designer found the dither + VI filter read as fuzzy static. Now: 480 lines, full 8-bit colour, no dither, no VI blur, light vignette, sharp-bilinear upscale. The N64 feel comes from the assets (low-poly, 16-colour 64px textures, baked vertex lighting) and the 240-line pixel HUD, not from screen filters. All filters remain available in `data/render.json` (`lowResHeight`, `colorBits`, `dither`, `viBlur`).
- **Movement/collision rewrite (players got stuck on edges):** walls, water and solid props are now solid 1 m cells with circle push-out, so everything slides along walls instead of stopping. Terrain checks use a small 0.3 m footprint for step and slope. `moveBy` tries the full move, then each axis, then directions rotated up to ±92°, and needs real progress before accepting one. An entity standing on an invalid spot walks toward the nearest standable point. Ground cells below the water line are now water, so there are no dry pits. Nav: bridge edges use the real step height, a path starts from a cell reachable at the unit's current height, and waypoints are only skipped once the next one is in line of sight. `tools/movement-test.ts <hero>` random-walks a hero 400 times and reports traps (0 now) and slide failures.
- **AI asset pipeline dropped for characters:** fal image → Tripo mesh → Tripo auto-rig produced models whose props tore apart when posed and never matched the house style. Characters stay hand-built in `charkit` (rigid skinning, one bone per part); the AI turnarounds in `assets/generated/*_ai/` are kept only as design reference. `charkit` gained `lathe`/`lathe_ab` (profile revolves), `tbox` (tapered boxes) and `decal` (alpha-clipped face planes); `chartex.py` adds skin tones, steel, mossy bark, hair, feathers and 64px painted faces. `viewer.html?only=a,b&clip=x&t=s&yaw=deg&set=units` renders models for review.
- **Hit feel:** hits carry amount, source and origin. Targets flash white, jolt away from the source, and hero-involved hits freeze attacker and target briefly (hitstop, longer on big hits). Sparks spray away from the source in its team colour; pixel-font damage numbers pop over heroes/structures (and anything a hero hits); melee combo hits draw a team-tinted swoosh. Hero deaths get a K.O. burst, bouncing debris and a rising soul; running leaves dust; dodges and dashes leave a team smear; health bars have a draining ghost segment and pulse red under 30%.
- **Animation pass:** attacks have anticipation, overshoot and a held contact frame with a hip lunge; the run has contact bounce, higher back-kick and counter-rotating hips/shoulders; dodge is a tucked forward roll; cast charges low then releases high; death is a knockback fall with a bounce.
- **HUD rebuilt from N64 references (SM64, Majora's Mask, Smash 64, DKR, Pokémon Stadium, StarCraft 64, Jet Force Gemini).** Rules: draw at 240 lines and let the browser upscale bilinearly (soft, like the hardware; no crisp pixel glyphs, no HD vector text). No panels during play; elements float inside ~14px overscan margins. Icon × number counters (coin × gold, helmet × army). Thin capsule meters with a light rim and solid fill. Controller-coloured buttons (A blue, B green, C yellow, Start red, Z/R grey) for prompts and cooldowns; a cooling button keeps its colour as a ring around the seconds left. Army orders and the build menu use a StarCraft-64-style C-button cross that appears only when relevant and fades. Type: Barlow Semi Condensed Bold for labels, ExtraBold Italic for numerals, solid colours with a 1px shadow and thin dark edge — no gradients, glows or bevels. Menus use flat Stadium-style boxes with a thin light inner border. Fonts are OFL, bundled in `assets/fonts/`.

## Photo-derived N64 textures (map + models)
- N64 artists sourced textures from photos, then cropped, downscaled, graded and palettised them. `tools/phototex.py` does this from Poly Haven CC0 diffuse maps (sources cached in `assets/textures/photo_src/`):
  - crop, then make seamless
  - wrap blur, then box downsample to 64px
  - grade (saturation, contrast, target mean; skins are greyscaled and then tinted)
  - 16-colour k-means, snapped to RGB555
- `assets/textures/photo.json` lists the photo-derived names. `texgen.build_all` loads those PNGs instead of regenerating procedurally. Rerun `python3 tools/phototex.py [names]`, then rebuild models in Blender.
- Remaining procedural textures get a soft wrap blur before quantising (faces and tallgrass stay crisp).
- Texel density lowered: terrain grass 7 m, dirt 6 m, cobble 4 m, cliff 5 m per repeat; characters 0.9 m.
- Characters, structures and map props are welded and Gouraud smooth-shaded, with hard edges only above 50° or at material boundaries (`charkit.smooth_weld`).
- Team materials use `dyeColor(team)` (muted saturation and lightness) so they read as dyed cloth.
- Viewer outlines are off by default (`?outline` turns them on), matching the game.
- Water: blue ripple texture at 10 m per repeat, no crest highlights. Tall grass is sparser chunky bush cards; random tufts removed.

## Slopes: one walkability rule shared by sim, nav and visuals (heroes stuck on the middle lane)
- Cause 1, the map: the ford `set` op (edge 2.5) dug a pit into the middle lane, and the island mound (`max` 1.6, edge 3) then raised the "ford" cells to the island top. The real crossing was a submerged hollow with a ~1.1-slope bank, which sat on the 1.05 walk limit.
  - Fixed: ford floor −0.6 with a 5 m edge (lane ramp ≈0.6), island r2.5 with a 5 m edge (bank ≈0.7).
  - Ford kind now covers only the wet channel (x 31–34, mirrored), not the island top.
- Cause 2, the rule: walkability used four axis probes at 0.3 m. On hillsides near the limit they passed and failed in patches, and depended on direction, so heroes were deflected or stopped on grass that looked walkable.
  - Now `Terrain.slopeAt` gives the gradient magnitude by central differences over ±0.35 m (one-sided next to solid cells).
  - `canStand` uses `slopeAt ≤ maxSlope`.
  - Nav cells check `slopeAt` at the centre and at ±0.35 m. Nav steps between cells allow |dh| ≤ maxSlope + 0.1, with bridges unchanged.
- Visuals follow the same rule: the terrain rock splat is `smoothstep(slope, maxSlope − 0.1, maxSlope + 0.05)`, so rock means "can't climb" and grass/dirt means walkable. The only blocked non-rock ground left is structure footprints.
- Checks: all 7 heroes cross lane↔island both ways from 5 lines; nav-following over 221 random trips gives 0 stalls; `movement-test.ts` gives 0 traps (its remaining "blocked" cases are pushes into real cliff faces or off bridge sides).

## River cleanup (ridges and ponds)
- Bug: rect shape ops used an unsigned distance (0 anywhere inside), and `wobble` noise was added on top. Inside a wobbly rect the op could randomly fade out, so the river trench left ridges just above the waterline, which formed ponds by the south bridge.
  - Rects now use a signed distance, so wobble only roughens edges.
  - The trench rect overlaps the mirror line (w 6), because distance at the shared edge x=40 is 0.
- The centre island is surrounded by river:
  - The side channels (x 30.5–34.5, z 13–35, mirrored) are a continuous shallow ford at −0.62 that joins the deep river at both ends.
  - A 5 m-edge lane ramp keeps the lane → ford descent walkable; the island uses r2.5 with a 6 m edge.
- Ford cells whose terrain rises above water become Ground, the same rule water cells already follow.
- Rebaked the grid and rebuilt the map GLB. All heroes cross lane↔island both ways; movement and nav harnesses show 0 traps and 0 stalls.

## Wider map with a contested centre island (96×48)
- Problem: the centre was a ~5 m islet with both neutral pads 3 m apart, leaving no room to fight over them.
- Width 80 → 96 (mirror at x=48). Depth stays 48, since depth sets the full-zoom camera framing. Home, forward and lane content is unchanged.
- The river is two channels (x 35–39, mirrored 57–61). Between them is an island ~16 m wide and the full map long, at 0.8 m, with:
  - a central knoll (1.7 m) holding the statue;
  - two small rises at the north and south ends;
  - dirt paths, ruins, a ruined arch, rocks, and tall-grass patches for cover.
- Neutral pads moved to (48,13) and (48,35), 22 m apart, each near a crossing.
- Crossings per side:
  - north stone bridge (deck 1.0) with a flat island landing;
  - middle ford (the lane ramp, a shallow −0.62 channel, and a 4 m island bank cut);
  - south wooden bridge (deck 0.45, lane landing raised to match).
- Also changed: terrain `MARGIN` 40 → 48, rim forest 170 → 200 trees, `movement-test.ts` uses the terrain size.
- Checks:
  - All heroes traverse every route both ways; the movement and nav harnesses show 0 traps and 0 stalls.
  - Warlord vs Duelist sim is 50/50. Summoner vs Warden stays at its known outlier.
  - Bots build on both neutral pads.

## Centre streams
- Two shallow streams cross the centre island between the knoll and the pads (z 15.5–16.5 and 31.5–32.5, x 37–59), joining the river channels. Both use `set` −0.62 with a 2.5 m edge and are ford cells (wadeable, slowed).
- Knoll is now r2 with a 3.5 m edge so its faces stay walkable next to the streams. The ruins at z 17 and 30 were removed and the rocks moved to the banks.
- Cell ops (ford, water, etc.) iterate whole cells, so their rect x/z must be integers.

## Minion veterancy (RTS ranks)
- Minions rank up on kills: Veteran, Elite, Heroic at 1 / 3 / 6 kill value. A unit kill is worth 1, a structure 2, a hero 3. Tuning lives in `data/units.json` → `veterancy`.
- Each rank gives +10% damage and +12% max HP (current HP scales too), and ranking up heals 25% of max HP. Heroic regenerates 1% HP per second. Killing a ranked minion pays +3 bounty per rank.
- Sim: `World.promote`, called from `kill` when the killer is a live enemy unit (projectiles carry their shooter). Emits a `rankUp` event.
- Visuals:
  - a flat gold badge above the minion (1 chevron, 2 chevrons, star), always visible once ranked;
  - on rank-up: a white flash, a gold ring, sparkles and a "VETERAN"/"ELITE"/"HEROIC" popup.
- Dev URL param `rank=N` promotes all current minions, for checking visuals.
- Balance: the first tuning (+20%/rank, 1 kill per rank) shortened bot games from 206 s to 147 s on average (12 seeds). The softened version gives 182 s, a mild edge to whoever wins fights.
- Known and separate: bot heroes sometimes dive the enemy base and kill the home barracks by ~40 s, even without veterancy (minimum game about 60 s). Worth a bot or defence pass.

## Second map: Grudgekeep Ruins, plus a map picker
- `data/maps/ruins.json` (60×32, mirror x, waterLevel −6, so no water):
  - a walled keep per side, gated toward the centre;
  - cobbled courtyard with ruin wall segments for cover, and ruined curtain walls top and bottom;
  - overgrown dirt/grass corners, and a central dais holding the single neutral pad.
- Fewer towers: 2 home + 1 forward per side + 1 neutral = 7 pads, versus 12 on Crossing. Cores are 50 m apart (86 m on Crossing).
- Pits: new cell op `pit`. The cell becomes Kind.Wall with style "pit", so it is impassable and you can't fall in. The floor around it keeps its height, so it stays walkable.
  - The terrain mesh skips pit triangles, cells next to a pit get extra AO, and pits cast no shadow.
  - `build_map.py` builds an inward-facing shaft 3.5 m deep, fading to black, with a dark floor and rubble on the lip.
  - The ASCII preview shows pits as `O`.
- Nav fix, exposed by the tight map: `lineClear` now checks a 0.6 m clearance ring at every sample (it used to check ±0.3 m only on cell changes). String-pulled paths no longer clip wall corners that snag a 0.55 m hero. Path-following succeeds on 100% of trips on both maps.
- Multi-map runtime:
  - `main.ts` discovers maps via `import.meta.glob` (order: crossing, ruins) and preloads every map view.
  - `GameRenderer.setMap()` swaps the map root, sun and shadow bounds, and ambient FX/torches.
  - `?map=<id>` selects a map, and `screen=map` opens the picker directly.
- Flow: hero select → (all ready) → CHOOSE THE ARENA → match.
  - Any player's stick cycles maps, and the background attract game switches to the highlighted arena.
  - A starts the match; B returns to hero select.
  - The screen shows a top-down preview built from the cell grid (pads and cores marked), size, pad count and the map's `blurb`.
- Tools:
  - `build_map.py` takes `MAP` from the exec globals (`{"MAP": "ruins"}`).
  - Rim-forest density scales with the map's perimeter.
  - `movement-test.ts` reads the `MAP` env var; `npm run sim -- --map ruins` already worked.
- Bot sims on Ruins: games run long (~370 s) and brawly (~23 hero kills). Warlord beat Duelist 9–1 there (5–5 on Crossing), so bruisers are strong in tight spaces. Watch this.

## Camera zoom pumping after respawn
- Cause: during respawn invulnerability the hero blinks by toggling `root.visible` at 12 Hz, and `EntityViews.heroPoints()` framed only visible heroes. The camera's framing target flipped 20× in 12 s.
- Fix: views have an explicit `framed` flag (alive, or up to 2.5 s into the death animation); `heroPoints()` uses it instead of visibility. The target now changes twice per death (out, back in), easing smoothly.

## Ruins is square, mirrored on the diagonal
- New map mirror mode `"diag"`: reflection across x = z.
  - Rects swap x↔z and w↔h, points swap x↔z, and prop `rot` becomes 90 − rot. Points on the diagonal are not duplicated.
  - Noise and wobble sample canonical coordinates so terrain is symmetric.
  - Pads keep the `side` assigned during mirroring (world no longer infers side from x < W/2).
  - The default hold point steps from the core toward the map centre.
- `data/maps/ruins.json`, 40×40:
  - team 0 keep in the bottom-left corner, team 1 in the top-right, gates facing the centre;
  - the anti-diagonal is the main lane (forward pad outside the gate, neutral pad on the central dais);
  - the other two corners are overgrown flank routes, with pits on the flank lanes and on the main diagonal, and ruin cover;
  - 7 pads.
- Checks: movement and nav harnesses are clean on both maps. Bot sims run long (~390 s) and brawly (~29 hero kills). Warlord still beats Duelist about 80/20 on this map.

## UI text resolution
- Replaces the earlier rule of drawing the UI canvas at 240 lines and bilinear-upscaling it: small text on the title, select and map screens was unreadable.
- `UiCanvas` keeps the 240-line logical coordinate system, so all layout code is unchanged, but the backing store is window height × devicePixelRatio with a context scale transform. Vector text, boxes and buttons render at native resolution.
- The 3D scene keeps its low-res N64 target; only the UI overlay is crisp.
- The arena preview in the map picker is drawn nearest-neighbour so the cell grid stays sharp.

## N64-style hero and arena select
- References: Smash 64 character select (portrait roster, player cursor tokens, player panels), Mario Kart 64 (live 3D characters), Mario Party (live board behind the select UI). Flat colours and ink outlines; no gradients or glows.
- `src/ui/portraits.ts` (own small WebGL renderer, alpha):
  - bust icons per hero, rendered once at 64 px so they get the soft filtered N64 look when scaled;
  - live full-body stage renders per player slot at 112×144, playing idle on a gentle turntable sway;
  - readying up plays attack_a or cast once, then back to idle.
- `src/ui/icons.ts`: pictogram glyphs for every ability kind (sword, slashes, slam arrow, crack, horn, bolt, star, arc, dash arrow, cloud, troops, wrench, turret, ramp, bricks, trap, brambles, shield), plus pad and size glyphs, and an ink-framed `tile`.
- Hero select:
  - scrolling two-tone checker backdrop, ink title band;
  - roster of portrait tiles with 1P/2P tokens and a coloured frame on the hovered hero;
  - per-player team panels with the live 3D hero, yellow ◀ ▶ triangles, italic name, blurb, and ability rows (N64 button disc + glyph tile + name);
  - READY! stamp band, "?" for CPU slots, a compact layout for 2v2, and a COMMANDER tag.
- Arena select:
  - the live attract game on the highlighted arena fills the screen behind a light dim;
  - a slanted ink name banner, blurb band with size and pad-count glyphs;
  - a row of framed minimap cards (selected: gold frame, lifted, 1P token; others dimmed) with ◀ ▶.
- Dev params: `join=N` (treat the first N players as connected on select), `heroes=a,b`, and `ready=1` with `screen=select|map`.

## Herald kit: Plant Banner (B) and Rally (Z)
- B `banner`: plants the house banner up to 6 m ahead (nearest walkable spot), lasting 30 s, cooldown 6 s. One per team; replanting moves it.
  - While up, it is the team's rally point (`World.rallyPoint`): follow orders anchor on it instead of the main hero, and hold orders set their point on it.
  - The Herald's speed aura (`commandAuraRadius`) also applies around the banner.
  - Bots plant when 3+ allies are near and the banner is missing or more than 10 m away.
- Z `rally`: within 9 m, friendly units and heroes heal 40% of max HP, lose stun and slow, and take ×0.7 damage for 4 s (`Status.guardUntil`/`guardMul`, applied in `World.damage`).
- Rendered as a procedural pole-and-pennant prop in `CombatFx.syncBanners`; it sinks in over its last second. New icons `banner` and `rally`, and new sfx.
- Dev param `plant` puts a banner next to each team's hero.
- Why: the Herald had empty B/Z, and "follow" made the army follow the teammate. The banner gives the commander spatial control; Rally is a fight-turning super.

## Engineer kit: Siege Works (R) and Ballista (Z)
- R `works` replaces the old gap-bridging ramp:
  - A 3×3 plank platform about 5 m ahead, raised 1.5 m above the highest ground under it, plus a 2-wide, 5 m ramp up from the caster's side (about 0.3 m per cell, within the nav step).
  - Lasts 25 s, cooldown 20 s. Recasting replaces your previous one.
  - Refuses to build on pads, structures, walls and bridges ("NO ROOM TO BUILD").
  - Standing on it uses the existing high-ground rules: ×1.2 range, and a 25% miss chance for shots from below.
- Z `ballista`: 180 HP, 80 damage every 1.8 s, range 11, lasts 30 s.
  - It can target structures (×0.8), unlike towers; the shielded core is still immune.
  - Cast within 7 m of your works, it snaps to the platform centre with ×1.25 damage (on top of the high-ground range).
  - It collapses when the platform expires.
  - Towers can shoot it (treated as heavy) and prioritise it.
- Bots: with super full, build works in a fight or near enemy structures, go within 5 m of it, then drop the ballista.
- `HazardViews.sync` now reconciles meshes with `world.mods`, so mods created during `fastForward` still render.
- Dev param `works`: Engineers cast R then Z.
- Update: the ballista places where aimed (1.8 m ahead), anywhere. It is only perched (×1.25 damage, high ground) if placed on a top cell of your own works: casting while standing on the platform picks the free top cell nearest the aim point. No more snapping from range.
- Ballista model: `src/render/ballista.ts`. Wood/iron textured trestle, a yaw turret that tracks its target (sim sets facing on fire), bow arms with string, a bolt that hides while reloading, recoil, winch, team fletching and pennant.

## Hero signature palettes
- Problem: Warlord, Engineer, Raider, Duelist and Warden were all brown leather/wood with the same team sash, so adjacent heroes blended together.
- Each hero now owns one dominant hue or value, chosen away from team red/blue:
  - Warlord: burnt-orange fur vest and kilt (`hair` texture shaded).
  - Engineer: mustard-yellow coat, apron and trousers; team colour moved to his shoulder pads.
  - Raider: near-black hood, cloak and clothes against lime skin.
  - Summoner: purple (unchanged).
  - Duelist: white doublet, cream hat with black band, black breeches, team cape.
  - Warden: green-shaded bark plus a leafy crown and back.
  - Herald: silver plate (unchanged).
- Colours come from `shade` vertex colours on the neutral `cloth`/`hair` textures. Shades are linear, so darks need very low values (about 0.03–0.07) to read as black.
- Hats and heads were checked from the game camera, since that is what is visible top-down (the Duelist's hat was changed from black to cream so it doesn't read like the Raider's hood).

## Kit synergies (set-up → pay-off)
- Warlord (Brute): Slam cows hit targets for 3 s (they deal ×0.75, `baseline.cowedDamageMul`). Quake deals ×1.5 and stuns +0.6 s against slowed or stunned targets (`vsSlowedMul`, `stunBonus`). Warcry refreshes Slam (`resetB`). Loop: Warcry → Slam → Quake.
- Raider (Hunter): Dash executes: ×1.4 below 40% HP (`executeBelow/executeMul`). Hero or structure kills reset Leap (`hooks.killResetsB`). Stealth → Leap already ambushes. Base trimmed: flank ×1.5, Dash 180.
- Summoner (Necromancer): Hex marks for 6 s (`hexSeconds`). The Summoner's minions deal ×1.3 to marked targets (`hooks.hexMinionMul`). Marked enemies that die rise as her skeleton grunts: 15 s each, up to 5 (`raiseSeconds`, `raiseMax`). The summon super also hex-marks everything within 7 m (`hexRadius`).
- Duelist (Fencer): A successful Parry resets Dash and grants Opening: the next hit within 2.5 s deals ×1.5 (`openingSeconds/openingMul`; one hit consumes it). Flurry deals ×1.4 to stunned targets (`vsStunnedMul`), and its hits no longer knock the target out of range (only the finisher does).
- Warden (Keeper): Wall also sets a snare at each end (bonus traps don't count toward the max of 3; they last the wall's duration + 6 s). Snares inside his Thorn zone re-arm 2 s after firing instead of breaking (`rearmSeconds`).
- All multipliers go through `World.synergyMul` in `damage()`; kill effects go through `World.onKillSynergy`.
- Readability: sprite marks above heads: purple hex rune (hexed), grey down-arrow (cowed), gold spark (Duelist Opening).
- Balance note: in bot play the Raider was already strong on macro play (75% vs Warden before these changes) and his fight numbers barely move it. That edge is structural (mobility and bot flanking), not from these synergies; it needs separate work.

## Menu cursors and seals (hero and arena select)
- Smash-style controls with an original look: each player has a steel gauntlet cursor (player-coloured cuff with number), moved by stick or D-pad with acceleration. P1 also follows the mouse (left click = A, right click = B), and moving the mouse joins P1.
- Hero select:
  - Each slot has a wax-seal chip. A human starts holding their seal; hovering a shield previews that hero on the banner; A places the seal (sworn). A on a placed seal picks it back up. B returns a held CPU seal, or pulls your own seal back to hand; B while holding your own seal exits to title.
  - CPU slots place a grey "CPU" seal on a random hero. Any human can pick up a CPU seal to choose the bot's hero.
  - The banner's PLAYER/CPU plaque toggles the slot (a slot with no controller stays CPU). The LV plaque cycles bot level 1–3 (Bot skill 0.5 / 0.75 / 0.95). The 1 VS 1 / 2 VS 2 plaque toggles mode; commanders are auto-sworn Heralds (human or CPU).
  - When every active slot is sworn, START (or A on the scroll) goes to the arena select.
- Arena select: hovering a card previews it (only when the hovered card changes, so a resting cursor doesn't steal the selection); A on a card starts the match; START starts on the current card; B goes back and un-swears humans.
- Code: `src/ui/cursor.ts` (`MenuCursors`: state, input, hit-testing, seal and gauntlet drawing). `Screens` registers hitboxes each draw (`hero:*`, `kind:i`, `lvl:i`, `mode`, `go`, `map:k`). `main.ts` handles the actions.

## Keyboard + mouse in-game controls
- One-player keyboard+mouse layout (`data/input.json` keyboard): WASD = stick; E = A (attack); Q = B (secondary); Z = L (block); X = R (special); C = Z (super); F = X (build); R = Y (hold: pick unit type); Space = dodge; Enter/Esc = start; 1–4 = D-pad (commander groups). Old J/K/L/I, Shift and arrow keys remain as alternates.
- Mouse (`Gamepads`): left button = X held, so holding opens the pad build menu and a tap is the default build. While either button is held, every 26 px of drag emits one C-stick flick in that direction and re-centres (`mouseFlickPx`), so left-drag picks a tower or the produce submenu and right-drag gives army orders (up push, down hold, left follow, right hunt; with R held, to one unit type).
- Taps shorter than a frame are latched (`tapped`), so quick key presses and clicks always register for one poll.
- Mouse buttons claim the keyboard slot the same as a key press.
- Dev-only `window.grudge` exposes pads/slots/cursors/state/world for Playwright tests.

## Engineer works: narrow
- The works platform is now 2×2 and its ramp is 1 cell wide. The ramp lengthens (up to 12 m) until each step is ≤ 0.38 m, so it is always walkable.
- `Terrain.slopeAt` ignores samples across a > 0.6 m deck/ground jump on `works` cells (like a wall edge), so the ramp, deck and the ground beside them stay walkable; step height still stops walking off the edge.
- `World.applyModIfOpen` rejects a works placement that would cut the nav path between the two spawns ("WOULD BLOCK THE ROAD"; R refunds to a 1 s cooldown).

## Build controls: X = production, Y = towers
- At a pad: X opens PRODUCE (up range, left barracks, right foundry, down cancel; a tap still does the hero's default build). Y opens TOWERS (up damage, left control, right support, down cancel). On your own building either menu shows UPGRADE (any non-cancel flick or an X tap upgrades; a Y tap upgrades too via the `upgrade` build command). Away from pads, Y keeps its hold-to-pick-unit-type role.
- The mapper gets `atPad` from main (`padNear`). Mouse: left = X; right at a pad = Y (towers), elsewhere right-drag = army orders. Keys: F = X, R = Y.
- World-space pad hints above a buildable pad when a human's hero stands on it: "X PRODUCE / Y TOWER", or "X UPGRADE" on your own building; hidden while that player's menu is open.
- The HUD menu title moves up when the top item shows a cost (it used to overprint it).

## Official GameCube adapter (WUP-028) via WebHID
- On Linux there is no joystick driver for the WUP-028 (hid-generic exposes only hidraw), so Chrome's Gamepad API never sees it.
- `src/input/gcadapter.ts` talks to it over WebHID: send output report 0x13 to start polling, then parse input report 0x21 (4 ports × 9 bytes: status, buttons, buttons, stick X/Y, C X/Y, L/R analog). Stick centres are calibrated from the first report per port.
- Ports become virtual pads in `Gamepads` (slot ids −10…−13) and join on any face button or start, with the same mapping as the gamecube profile: L digital = dodge, L analog > 0.3 = block, R = special.
- Press G once to grant Chrome permission; afterwards `hid.getDevices()` reconnects automatically. The title screen shows the adapter status.
- Needs a udev rule giving the user access to the adapter's hidraw node (the Dolphin rule only covers the raw USB node).
- Update (tested on Arch): the adapter acks 0x13 with 0x23, but the kernel's usbhid rejects every 37-byte state packet (`input irq status -75`, EOVERFLOW), so hidraw/WebHID never receives 0x21 reports. The 1-byte form of 0x13 is refused by hidraw ("passed too short report"). WebUSB can't claim HID-class interfaces. So in-browser support can't work on Linux.
- The supported Linux path is the userspace driver `wii-u-gc-adapter` (AUR `wii-u-gc-adapter-git`). It detaches the kernel driver over libusb and creates one uinput joystick per port ("Wii U GameCube Adapter Port N"), which Chrome's Gamepad API sees. Profile `gc_adapter_uinput` in `data/input.json` (placed before the Mayflash `gamecube` profile) assumes joydev ordering by evdev code: buttons A0 X1 Y2 B3 L4 R5 Z6 Start7 Up8 Down9 Left10 Right11; axes stick 0/1, L 2, C 3/4, R 5. It falls back to `standard` if Chrome reports mapping "standard".
- The WebHID path stays (it may work on other OSes). After 6 unanswered start attempts it gives up and shows the Linux hint.

## Couch input: 4 pads, or 3 pads + keyboard/mouse
- The mouse drives the keyboard player's cursor (`MenuCursors.mouseSlot = pads.keyboardSlot()`), not P1's. Moving or clicking the mouse claims the keyboard slot if nobody has it.
- If 3 or more players are present, the champion select switches to 2 VS 2 automatically (on entering it and when a player joins mid-screen).
- If the kernel driver (`hid-gamecube-adapter`) exposes "Standard/Wavebird Gamecube Controller", the WebHID adapter path is ignored so no controller joins twice. Those names match profile `gc_adapter_uinput` (same evdev codes as `wii-u-gc-adapter`).

## Boot screen
- Static HTML in `index.html`, so it shows before any JS runs. Key art is `public/loading/art.png`: nano-banana-pro fed a render of our real hero GLBs (`tools/gen-loading.mjs`), downscaled to 480x270 and reduced to 15-bit colour with 2x2 ordered dither (`tools/loading-process.py`). Also the painted GRUDGE logo, painted NOW LOADING art and a spinning coin in our photo gold texture. No progress bar; N64 games didn't have them.
- Exit is a stepped fade to black, then the title fades up. The same logo replaces the old text on the title screen (`drawLogo`, `n64ui.ts`).

## Main menu, rules, options, records, name tags
- Flow: PRESS START -> main menu (FIGHT / RULES / RECORDS / OPTIONS / CONTROLS, `src/ui/menus.ts`). The select screen's back and pause's quit return here, not to the title. Menus use stick/D-pad focus plus mouse hover/click; the gauntlet cursors are only for champion/map select and the name overlay.
- Visuals are only textured pieces: brocade banner, parchment, beam, stone keys, wax seals, and painted word art from `tools/gen-names.mjs` (`m_*` and `t_rules`/`t_records`/`t_tag`). `names-process.py` keys by distance to the corner colour, because the model sometimes returns white instead of magenta.
- Save data lives in localStorage `grudge.save.v1` (`src/game/save.ts`): rules, options, tags, per-hero stats, and the last 30 matches. `applyRules` clones `GameData` per match (match length, sudden death, soldier cap, starting gold, gold rate, respawn, catch-up "mercy"). The attract world keeps the base data.
- Name tags: on champion select, click your P-number to pick a saved tag or carve a new one (up to 6 letters; stones or physical keyboard, which mutes keyboard pad actions while typing). Only matches with at least one human are recorded; CPUs update hero stats but no tag.
- Records has three pages: champions, names (Y twice strikes a name), chronicle. Options erases records with a double confirm.

## Photo textures and the font
- Banners use `banner.png` from Poly Haven `quatrefoil_jacquard_fabric` (found via Blender MCP). The weave's colour map is almost flat, so `phototex.py` now accepts `"map": "Displacement"` and builds the texture from the height map. The motif survives at 64 px, graded grey and team-tinted by multiply.
- Font: the Banjo-Kazooie dialogue sheet (`assets/fonts/src/banjo.png`, supplied by the user; personal project). It has capitals, digits and basic punctuation; `% / + × < = > $` come from Mario Golf's small font, scaled to cap height. `·`, `—` and `_` are derived from its glyphs. `tools/font-bake.py` bakes a 4-bit fill + dilated-outline atlas (`n64font.png/json`). `font.ts` stamps glyphs into cached strips, tints them with a vertex-colour-style gradient, and draws them bilinear-scaled. Minimum scale is 0.64, since smaller glyphs lose strokes.
- Cursors and seals are the Smash 64 glove/chip sprites (`assets/ui/src_gloves.png`, sliced by `tools/ui-slice.py`). The glove points, opens over a seal it can take, and pinches when holding one; the held seal draws in front. Chips 1P/2P are hue-swapped so P1 is blue and P2 red like our teams; 3P yellow, 4P green, CP grey as in Smash.

## Two-layer UI: soft art, sharp text
- The UI art canvas is exactly 240 lines (`UiCanvas`, scale 1), upscaled by the browser's bilinear filter, so textured panels, banners and icons have the same softness as the 3D.
- Text, painted word art and cursor/chip sprites draw on a second device-resolution canvas stacked on top (`setTextLayer`/`onHiLayer` in `font.ts`). The art layer's current transform and alpha carry over, so rotated or translated text still lines up. Glyph strips are nearest-upscaled to a whole-number factor, then bilinear-scaled to the exact size, keeping the bitmap font's edges clean.
- Because the sharp layer is always on top, overlays that sit over text call `occlude()` to cut a hole in it (and dim the rest): the name-entry sheet and the pause panel.
- Smash glove details: the player tag sits in the middle of the hand, tinted in the player colour. The held seal draws behind the pinching fingers. The hand opens over a portrait or a seal it can take.
- Warden walls use `wallblock.png` (Poly Haven `medieval_blocks_03`, via Blender MCP). Engineer planks, rails and posts use the photo wood texture. `worldBox` rescales box UVs to metres so tall blocks aren't stretched.
- World-space pad hints are scaled down from 7 to 4 units wide.

## 2 VS 2 allies and combo cooldown
- Rule `partners` ("2 VS 2 ALLIES": CHAMPIONS or COMMANDERS, default champions). It applies to both teams; it's never a per-team choice. With champions, slots 3 and 4 pick heroes on the select screen like 1 and 2, spawn as full heroes, and get normal (non-commander) controls. The HUD adds a second super meter per team and opens whichever teammate's build menu is active. `npm run sim -- --mode 2v2 --partners heroes` covers it headless.
- Basic combos had no cooldown, so lunging hits plus hit-stun made escape impossible. Now `baseline.comboCooldown` (0.7s) applies after the finisher, and half of it if the chain is dropped early; chaining inside a combo is unaffected. Raider vs Warlord moved from about 80/20 to 58/42 over 12 matches.

## Map, helmet and pathing fixes
- Ruins bases get a back gate: the east wall splits at z30–32 / z36–38 (mirrored for team 1). The centre neutral pad is gone because the relic altar sits there. Crossing loses its centre obelisk for the same reason.
- Grunt and brute helmets use `team_paint`, so the army reads by team from above.
- Pathing: the crossing hill ramp is wider, nav samples slope at 9 points and `findPath` returns a partial path to the closest reachable cell. Bots skip waypoints in their own cell and repath after 1s without progress. Stuck heroes on crossing went from 208 to 6 events.

## Army orders on a GameCube pad
- Y + C needed claw grip. Hold L (block), flick C to pick a group (left grunts, up archers, right brutes, down all), then keep flicking to give that group orders; let go of L to return to the whole army. A plain C flick still orders everyone. The cross shows "WHICH TROOPS?" then "ORDER GRUNTS", and a wood plaque in each bottom corner lists every unit type's standing order with live counts and a head icon rendered from its GLB.
- The GameCube pad has no stick click, so dodge is L + X or L + a smash flick of the stick (rest to full inside 0.12s). Keyboard keeps Space.

## Pacing: slower, safer, less MOBA
- Everything moves about 20% slower. On your own half or inside your tower range you move 20% faster and regenerate 2% HP/s once out of combat. Enemy heroes in your tower range move 15% slower. After 2.5s without hero combat you move 15% faster. Finishing an attack slows you for 0.35s, so a chaser can't swing and keep pace.
- No automatic waves. X away from a pad calls a squad of 3 (grunts 60, archers 80, brutes 110, 3s muster). They spawn at the nearest outpost of that type (the old barracks/range/foundry, now 90 gold, level 2 gives veteran stats) or at your keep. Soldier cap is 8 and units have ~1.9x HP and 1.4x damage, so every soldier matters. Old saves with an out-of-range cap reset to the default.
- Position matters: hits from behind deal 1.35x, attacks from tall grass 1.3x. Strong knockback can push units and heroes off ledges; falls over 1.1m hurt (10% max HP, more for bigger drops) and stun.
- L + A shoves: short cone, heavy knockback, brief stun, breaks guard, and knocks the relic loose.
- Each hero may keep 3 towers alive (6 per team in 2v2), which keeps bases from becoming static lanes.

## The Grudge relic
- A horned bronze bull idol (Poly Haven `bull_head`, CC0) decimated to 900 tris with its form and a warm key light baked into a 128px, 15-bit texture (`tools/blender/build_relic.py`). It sits on a stepped stone altar with gold-capped posts in the map centre (`assets/structures/grudge.glb`).
- It wakes at 0:15. A hero picks it up by walking over it. The carrier moves at 62% speed and can't attack, dodge or build. Carrying it to the enemy keep cracks the core shield permanently, or deals 15% core HP if the shield is already down. Then it returns to the altar after 20s. Death, stun or a shove drops it; a dropped relic returns home after 14s. The HUD names the carrier and points to the relic when it's off screen.

## Arena events
- Cannon fire every 38s from 0:50: up to 5 shots aimed near soldiers and heroes. Each gets a red target ring for 2.6s that pulses faster and fills as impact nears, and a whistle. An iron ball arcs in trailing smoke with a growing shadow, then hits for 110 (60 to towers) with knockback, a fireball, smoke, dirt, sparks and a scorch mark that fades over 9s.
- A wild ogre wakes at 1:50 beside the centre and returns 100s after it dies. It attacks whoever is nearest (heroes, soldiers of either side), leashes to its lair and heals there, and pays 80 gold. It's its own low-poly model (mossy hide, bone necklace, spiked tree-trunk club) so it never reads as a brute.

## GameCube adapter: one pad per port in Chromium
- Chromium groups Linux gamepads by the sysfs path above their input node. `hid-gamecube-adapter` registered every port as a parentless virtual input device, so all ports shared `/sys/devices/virtual/` and Chromium exposed only one pad. `tools/gc-adapter/per-port-parent.patch` gives each port its own child device (`gcport1`–`gcport4`) under the adapter, a unique phys/uniq, and cancels pending connect work on removal. `tools/gc-adapter/install.sh` installs it through DKMS as a separate version.
- With the patch Chromium names the pads "Nintendo WUP-028", which now maps to `gc_adapter_uinput`. Measured layout: A0 B3 X1 Y2 L4 R5 Z6 Start7, D-pad 8–11, sticks on axes 0/1 and 3/4, L analog on axis 2. Chromium reports an untouched analog axis as 0 (half-pressed), so block uses the L digital click or more than 60% travel.

## Playtest fixes
- `npm run release` builds into `release/` and serves it on port 5200 without hot reload, so a stable build can be tested while the dev server changes.
- The 3D renders at 720 lines and the UI art canvas at 480 physical lines (same 240-line layout).
- Automatic waves are back: every 16s each keep sends 2 grunts and an archer, and every outpost sends its troop (two at level 2), capped at 16 soldiers and growing 6% stronger per minute. Called squads (X) stay as an extra.
- Damage towers were too strong to break: damage 55 to 34, 620 HP, 0.8x against heroes. The support tower is gone from the menu.
- Building and upgrading now take work: a structure only rises while a friendly hero (1x) or soldiers (0.4x each, 2x total) stand within 3.6m. 10s to build, 12s to upgrade with one hero; the gold bar above it flashes dark when nobody is working. A destroyed pad is rubble for 20s. Bots stay to finish what they start.
- The keep shield is no longer tied to home towers. Each keep starts with a 1500 HP shield that soaks damage first; the relic breaks it; it's gone in sudden death. The keep has 4000 HP.
- Keep shop (Y at your keep): BOMB (180) is carried over your head and plants itself on the first enemy tower you touch; after 3s it destroys the tower outright (350 to a keep). SHIELD (150, 45s cooldown) refills the keep shield. CANNON (260) opens an aiming reticle (stick moves it, A fires, B cancels, 8s) and calls four shots that only hurt the enemy.
- The relic now wakes at 0:45 and must be held at the enemy keep for 2.5s to crack it or deal damage; the HUD counts it down.
- The Warden's trap is replaced by a long-arm slap: a bark arm stretches up to 8.5m, stops at walls, and slaps the first foe with heavy knockback.
- Attacks are more distinct: Warlord two slow heavy swings (and down to mid health, weaker slam), Raider four quick jabs, Duelist long narrow thrusts, Warden wide sweeping hits, Engineer two wrench blows.

## Split screen
- With two or more human players each gets a view that follows their hero at a fixed close zoom (side by side for two, quadrants for three or four; the fourth quadrant of three shows the whole fight). When all human heroes are within about 9m of each other the views merge into one shared camera, and split again past 14m. Option SPLIT SCREEN turns it off.

## Second playtest polish
- A no longer goes dead after a combo: while the combo cools down (now 0.5s), A throws a single quick jab at 55% damage with no chain.
- Match-wide callouts (BOMB DROPPED, CANNON FIRE...) are small and sit under the clock. Only FIGHT! and the winner stay big. Team messages sit above that team's C-stick cross; "NEED" messages get a coin and a shake.
- The HUD shows a relic or bomb badge next to the B/R buttons for whoever on that team carries one.
- Bombs can be thrown with A (8m arc, aimed with the stick). Landing on an enemy tower sticks it there (3s, destroys it). Landing anywhere else it sits on the ground for 3s, smoking harder and flashing a red blast circle that grows, then blows up (90 to foes, 220 to buildings in 3.2m).
- Switch 2 Pro Controller (057e:2069) over WebHID, Press G to grant access; input is report 0x09: 24 button bits at bytes 3–5 (measured on hardware: B0 A1 Y2 X3 ZR4 R5 +6 RS7, D-pad down/right/left/up 8–11, ZL12 L13 −14 LS15) and two 12-bit sticks at 6–11. A attack, B secondary, X/Y as on GameCube, R special, ZR super, L block, ZL or left-stick click dodge, + pause, right stick = C. The kernel's hid-generic copy of the pad is ignored. The game wakes the controller itself over WebUSB (the same init sequence the procon2tool site sends on interface 1): press P once to grant it, then G for WebHID input. After that, plugging the controller in wakes it automatically. `tools/procon2/99-procon2.rules` gives the browser access to the USB and hidraw nodes.
