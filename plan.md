Arena RTS: design summary and build brief
Sep 29, 2026 @not interested
Overview
The game is the NFL Blitz of arena RTSes: a couch PvP game where each player controls one hero directly while steering a small base and an army through simple directives. It is 1v1 by default, with a 2v2 mode where one player per team takes a commander role. Matches last about six minutes and anyone should be able to play within one match.
This document is the source of truth for design decisions and doubles as a build brief. An implementing agent should read the whole document, then follow the Build plan section in order, building in three.js with N64-style graphics and producing 3D assets through Blender via the Blender MCP server. Where the document gives a number, treat it as a starting value to tune, not a fixed rule. Where it is silent, choose the simplest option that preserves the design pillars and record the choice in a decisions log in the repo.
References worth studying: Herzog Zwei and AirMech (hero plus ordered army), Battalion Wars (commanding on a GameCube pad), Pikmin 2 and Overlord (stick-based army steering), Brutal Legend (what goes wrong with too many unit types), Kingdom Rush and Dungeon Defenders (fixed tower pads), Beyond All Reason (terrain shaping play), and NFL Blitz itself (short, loud, readable, catch-up).
Design pillars
Pick up and play. No menus during a match, no economy management, no tech tree. Every action is one button or one stick flick. A new player should understand what is happening from watching thirty seconds of play.
Readable from across the room. Team colors, large silhouettes, visible range rings, three tower types and three unit types with distinct shapes. If a player has to squint or pause to understand the board, the design is wrong.
Short and loud. Six-minute matches with a sudden-death finish and catch-up mechanics so games stay close. The feeling to aim for is the final drive in Blitz.
Free ranging, not MOBA. No fixed lanes, no timed marching waves. Units go where the player points them and the terrain suggests routes without enforcing them. The hero matters but never wins alone; the army and base must always matter.
Match structure and win condition
A player wins by destroying the enemy core. Each side has one core with a health bar. The core is shielded until at least one enemy building or tower on the pads in front of it has fallen. There are no intermediate objectives such as inhibitors or lane towers.
The match has a six-minute timer. If both cores stand when it expires, the match enters sudden death for up to sixty seconds: unit production speeds up, tower and building costs drop, and minions gain damage. If both cores still stand after sudden death, the player who dealt more total core damage wins. This rewards aggression and prevents turtling stalemates.
Killing the enemy hero is tempo, not victory. A dead hero respawns at their core after six seconds. The killer gets a resource bonus, and while the hero is dead their units lose hero-proximity buffs and keep executing their last directive without adjustment.
A single resource accrues automatically at a fixed rate, with bonuses for unit kills, hero kills, and building kills. A catch-up mechanic gives the side with less resource and fewer structures a modest boost to income and production speed, tuned so it closes gaps without flipping them.
Controls
The layout is designed around a GameCube controller, with equivalent mappings for Xbox and PlayStation pads through the Gamepad API. The guiding rule is that commanding the army must be possible between attacks without the right thumb leaving the face-button area for long.
Input
Action
Notes
Control stick
Move hero

A
Primary attack
Light, fast
B
Secondary attack
Hero-specific
L
Defensive move
Partial press blocks, full click dodges
R
Special
Hero-specific, cooldown
Z
Super
Meter-based, rare
C-stick flick
Army directive
Up push, down hold here, left follow me, right attack nearest
X
Build or upgrade at nearest pad
Tap builds hero default type
X held + C-stick
Pick build type
Up damage tower, left control tower, right support tower, down production building menu
Y held + C-stick
Directive for one unit type
Cycles grunt, ranged, heavy while held
D-pad
Unused in 1v1
Reserved for the 2v2 commander
Start
Pause

In 2v2, one player per team plays the hero and one plays the commander. The commander controls a lightweight field avatar, such as a mobile support unit or a turret they can pilot, so they are physically present on the map. The commander uses the D-pad and C-stick for finer control: per-group orders, targeting specific structures, and setting rally points. The hero player keeps the basic C-stick directives but the commander's orders take priority when both are issued.
Heroes
The launch roster is six heroes. Each hero's identity comes mainly from how they relate to the RTS layer (towers, production, terrain), not only from their attacks. Each hero breaks at most two standard rules; everything else uses the shared baseline.
All heroes share three stat tiers (low, mid, high) for health, move speed, and damage. Tuning happens by moving a hero between tiers before touching individual numbers.
Hero
Health
Speed
Damage
Rule it breaks
Base and army hook
Terrain hook
Warlord
High
Mid
Mid
Buffs nearby units
Heavies produced stronger
None
Engineer
Mid
Mid
Low
Structures cost less and can be repaired
Cheap upgrades
Special builds a temporary ramp or bridge
Raider
Low
High
Mid
Bonus damage to units and structures while flanking
Own production slower while away from base
Can jump cliffs and ignore ramps
Summoner
Mid
Mid
Low
Special spawns extra units
Production buildings faster
None
Duelist
Mid
Mid
High
Strongest in direct combat
No base bonus at all
None
Warden
High
Low
Low
Zones, traps, slows
Control towers stronger
Special drops a temporary wall
Every hero needs at least one way to fight, one way to push, and one way to defend, so no matchup is unwinnable by design. Matchups should stay within 60-40 at worst. Counters are soft: the Duelist is favored against the Engineer, but the Engineer has a clear plan in turtling behind towers and winning on army pressure.
Each hero has A, B, R, and Z abilities. Keep move sets small: A and B are simple attacks, R is the signature ability tied to the hook above, and Z is a super charged by dealing and taking damage.
Base: pads, towers and buildings
All construction happens on fixed pads. Each pad holds either one tower or one production building, which makes every pad a choice between defense and army size. There is no free placement.
Structure
Role
Strong against
Weak against
Damage tower
Single-target damage
Heroes
Swarms of grunts
Control tower
Slow and knockback in an area
Unit groups
Heavies
Support tower
Heals and buffs nearby friendly units
Holding a contested area
Anything, deals no damage
Barracks
Produces grunts


Range
Produces ranged units


Foundry
Produces heavies


Each structure has one upgrade level. Heroes modify structures through the hooks in the Heroes table rather than having their own structure sets, so players learn six structures once and one twist per hero.
Pads fall into three zones. Home pads sit near the core, three per side, and are always owned by that side. Forward pads sit on each side of midfield, two per side, and are exposed. Neutral pads, two in the center of the map, can be claimed by either player by building on them; destroying the structure makes the pad neutral again. The core can build nothing itself.
Units and directives
There are three unit types in a loose triangle. Grunts are cheap melee units that hold ground and beat heavies by swarming. Ranged units deal damage from behind the grunts and beat grunts, but fold when reached. Heavies are slow, strong against structures, and beat ranged units, but are overwhelmed by grunts.
Production buildings produce automatically on a fixed cadence. Players never queue units. Each side has a population cap of 14 units; buildings pause when the cap is reached.
Directives are intentions, not lane orders. The four directives are push (advance on the enemy core, engaging anything in the way), hold here (gather at the point where the hero stood when the order was issued), follow me (stay near the hero and engage what the hero engages), and attack nearest (hunt the closest enemy unit or structure). A directive applies to the whole army by default, or to one unit type when issued with Y held. New units adopt the current directive for their type.
Units path freely across the map using the navigation mesh, preferring the shortest safe route. They respect elevation rules, avoid tower ranges when ordered to hold, and never follow fixed lanes.
Map and terrain
The first map is a mirrored open arena roughly two camera-widths long at the closest zoom, with the cores at opposite ends. There are no dirt lanes. Terrain features suggest two main corridors, a central crossing, and a narrow exposed flank route, but units and heroes can go anywhere walkable.
Elevation uses three discrete tiers (low, mid, high) connected by ramps, not a continuous heightmap. Cliffs are short enough that at the camera angle they never hide more than one or two units. Terrain rules are few and consistent.
Rule
Effect
High ground
Plus 20 percent range and vision radius for units and towers
Attacking uphill
25 percent miss chance
Slopes and ramps
Heavies move 30 percent slower
Cliffs
Block direct fire; ballistic attacks arc over low walls
Tall grass and forest
Units inside cannot be targeted by enemy towers or auto-targeted by enemy units until they attack or an enemy is adjacent
River
Walkable at two bridges and one shallow ford that slows all units
Pad placement follows the base section: three home pads per side on low ground near the core, two forward pads per side, and two neutral pads on the central high ground. High-ground pads are few and central so they become fights rather than free advantages. Every pad must be reachable by enemy units from at least two directions. Tower range rings are drawn on the ground at all times.
The earlier 2D layout prototype (claude.ai/artifact/5tyU8HH95kGz7YevV94QjD) shows the pad zones; its lanes should now be read as natural corridors between obstacles.
Camera and couch play
All players share one screen. The camera uses a fixed pitch between 50 and 60 degrees with no rotation, tracks the midpoint between heroes, and zooms out as they separate up to a maximum that shows the whole map. At the closest zoom it frames about half the map.
There is no fog of war, because both players see the same screen. Stealth is about detection by towers and units (tall grass, cliffs blocking line of sight), not hidden information. The opposing player can see a sneak attack but has to notice it while fighting.
Units and heroes behind terrain render as solid team-colored silhouettes. Each hero has a colored ring at their feet and a small player indicator above their head. The HUD shows only core health, resource, super meter, match timer, and each player's current directive per unit type, placed at the screen edges nearest each player's side.
Split-screen with real fog of war is out of scope for the first version.
Balance process
The mirror match comes first. A single hero against itself must be fun before any other hero is added. Heroes are then added two at a time and every matchup is played.
All tunable values live in data files (JSON), never in code, so they can be changed without rebuilding. This includes hero stats and tiers, ability values, structure costs and stats, unit stats, production cadence, population cap, resource rates, catch-up strength, terrain modifiers, and match timings.
Build a headless simulation mode early. A simple bot issues directives, builds on pads, and fights with basic heuristics. The simulation runs hero-versus-hero matches faster than real time and logs win rates, match length, core damage over time, and resource curves per matchup. Flag any matchup outside 40-60 and any hero whose early-game lead converts to a win more than 70 percent of the time, since short matches snowball. The catch-up mechanic is tuned against the strongest early-game hero, not the average.
Visual style
The target is the look of the N64, not its hardware limits. The game can run at high frame rates and resolutions, but the art should read as a late-90s console game.
Area
Rule
Geometry
Heroes 500 to 900 triangles, units 150 to 300, structures 300 to 600. Flat and faceted shapes, chunky proportions, oversized heads and weapons on heroes
Textures
32x32 to 64x64 pixels, bilinear filtering on (the N64 look), low color count, some faces vertex-colored only
Lighting
Vertex lighting or baked vertex colors plus one directional light. Gouraud shading, no normal maps, no PBR
Rendering
Render to a lower-resolution target (for example 480 lines high) and upscale; optional light dithering and a slight blur. Distance fog in a team-neutral color
Color
Saturated primaries for team identity (blue and red), earthy greens and browns for terrain, gold for neutral pads
Animation
Low frame counts, snappy key poses, simple rigs of 10 to 20 bones for heroes and 4 to 8 for units
Effects
Billboard sprites for hits, explosions and projectiles; additive blending; big readable impact flashes
UI
Chunky bitmap-style font, thick outlines, team-colored panels
Technical architecture
The game is a browser game built with three.js and TypeScript, bundled with Vite, and runnable locally with one command. Desktop Chrome and Firefox are the targets; controllers connect through the Gamepad API, with keyboard fallback for two players on one keyboard during development.
The simulation is separated from rendering. Game logic runs on a fixed 30 Hz tick in plain TypeScript with no three.js imports, so it can run headless for the balance simulator and later support networked play. The renderer reads simulation state each frame and interpolates. Use a simple entity-component structure: entities with components for transform, health, team, unit type, structure type, ability state, and AI state.
Module
Responsibility
sim/
Tick loop, entities, combat, abilities, production, economy, match state, win condition
sim/ai/
Directive execution, target selection, bot player for simulation
sim/nav/
Navigation mesh generated from the terrain tiers, pathfinding, ramp and slope costs
data/
JSON for all tunable values, heroes, structures, units, maps
render/
three.js scene, low-resolution render target, camera, silhouettes, range rings, effects
input/
Gamepad API mapping per controller type, keyboard fallback, directive and build input
ui/
HUD, hero select, results screen
assets/
glTF models and textures exported from Blender
tools/
Headless simulation runner and matchup report
For pathfinding, use a navmesh library such as recast-navigation-js, or a grid-based A star on the tiered terrain if simpler. Collision and separation between units can be handled with simple circle checks; a full physics engine is not needed. Terrain is authored in Blender as a mesh with tier data exported alongside it, or built from a height-tier grid in JSON for the first version.
Asset pipeline
3D assets are created in Blender through the Blender MCP server, which lets the agent create and edit geometry, materials, and rigs by running Blender Python commands. Every asset is built by a script checked into the repo under tools/blender/, so assets can be regenerated and adjusted instead of edited by hand.
The agent should confirm the Blender MCP server is connected before starting asset work. If it is not available, generate placeholder geometry in three.js (boxes, cylinders, and cones in team colors with the correct silhouettes and scale) and continue building gameplay; real assets replace placeholders later without code changes as long as the names and scales match.
Every asset follows the triangle and texture budgets in the Visual style section. Use one material per asset where possible, with vertex colors or a small palette texture. Team color comes from a shader uniform or a tinted vertex-color channel rather than separate red and blue models. Export as glTF binary (.glb) to assets/, with Y up, one Blender unit equal to one meter, a hero standing about 1.6 units tall, and the origin at the feet. Animations are exported as named glTF clips: idle, run, attack_a, attack_b, special, super, block, dodge, hit, death, and build for heroes; idle, walk, attack, and death for units.
Asset order follows the build plan: placeholders first, then one hero, the three unit types, the six structures, the core, the first map terrain, then the remaining five heroes. Render a turntable screenshot of each finished asset in Blender and check it against the style rules before exporting.
Build plan
Build in this order. Each milestone ends with something playable and a short note in the decisions log. Do not start a milestone until the previous one meets its done condition.
Milestone
Scope
Done when
1. Skeleton
Vite and TypeScript project, three.js scene, low-resolution render target, fixed camera, tiered placeholder terrain, two controllers moving two placeholder heroes
Two players move on a shared screen with the N64-style render pass
2. Combat
A, B, L, R, Z for the Warlord only, health, death, respawn, hit effects
A mirror hero fight is playable and readable
3. Base
Cores, pads, the three towers, resource income, build input with X and C-stick
Players can build and destroy towers and cores; a match can be won
4. Army
Three production buildings, three unit types, pop cap, navmesh, the four directives
Units path freely over tiers and follow directives
5. Match loop
Timer, sudden death, core-damage tiebreak, catch-up, HUD, hero select, results screen
A full six-minute match runs start to finish
6. Terrain rules
High ground, uphill miss chance, slopes, cliffs blocking fire, tall grass, river
Terrain changes fight outcomes in the ways listed
7. Simulator
Headless sim runner, bot player, matchup report
Warlord mirror runs 200 matches and reports stats
8. Real assets
Blender MCP assets for the Warlord, units, structures, core, map
Placeholders replaced, budgets met
9. Roster
Remaining five heroes, two at a time, each with assets
Every matchup simulated and played, none outside 40-60
10. 2v2
Commander avatar and D-pad controls
Four players complete a match
Keep the game playable after every change. Prefer the simplest implementation that meets the done condition, and put every number in data files from the start.
Starting numbers and open questions
These values are first guesses for the data files and are expected to change in testing.
Value
Start
Match length
6 minutes plus up to 60 seconds sudden death
Hero respawn
6 seconds
Population cap
14 units per side
Pads per side
3 home, 2 forward, plus 2 neutral shared
Resource income
10 per second, plus kill bonuses
Tower cost
100, upgrade 75
Production building cost
125, upgrade 100
Production cadence
Grunt every 8 s, ranged every 12 s, heavy every 20 s
Tower range
Home 11 m, forward 10 m, neutral 11.5 m
Simulation tick
30 Hz
Open questions to settle during testing: whether the core shield rule makes defense too strong; whether per-unit-type directives are used enough to justify the Y button; whether the Raider's cliff jump breaks the map; whether the commander role in 2v2 is fun enough to keep; and whether the tiebreak should use core damage or total structures destroyed.
