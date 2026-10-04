# Audio catalog

This is the plan for Grudge's sound: 3D positioning and the full list of sounds needed. Everything audible today is
procedural WebAudio in `src/audio/sfx.ts`: about 35 synth recipes, panned by screen x, with no distance falloff.
Music is 5 CC0 loops (`assets/music/CREDITS.txt`).

Legend for the catalog tables:
- **Src:** `S` = recorded sample (CC0 library, processed and normalised); `P` = procedural in code; `S+P` = sample
  layered with a synth sweetener. `×n` = number of variants (round-robin, plus ±6% random pitch on everything).
- **Pos:** `3D` = positional (falloff, pan, off-screen muffle); `G` = global (always heard, centred);
  `G*` = global but also panned toward the event; `L` = local-player only (your own hero / your HUD).

## 1. 3D sound model

**Listeners.** Each live view is a listener: the full camera, or each split-screen view. A listener is the view's
ground focus point, and its "hearing radius" scales with the view's visible width (zoomed-out views hear further).

**Per sound:**
- `gain = max over listeners of falloff(distance to that listener)`.
- Inside about 0.6 × the half view width a sound is at full volume. It fades to silent by about 1.3 × the half
  width, so the other side of the map is silent.
- Pan comes from the loudest listener's camera: its screen x, mapped into that view's screen region in split screen.
- Sounds outside a listener's frustum get a lowpass filter (about 1.2 kHz) and −4 dB, so off-screen action reads as
  "nearby, not visible".

**Ownership boosts.**
- Sounds caused by, or hitting, a local player's champion are never culled. They play at least at −10 dB.
- Your own hit-confirms and ability casts get a small boost.

**Global sounds** ignore distance: UI, match flow, map-wide events (gates, horn, avalanche warning, tide, mist),
Grudge state changes, house eliminations, sudden death and countdowns.

**Mix.**
- Buses: `sfx`, `ui`, `ambience`, `music`, each feeding the master compressor.
- Big impacts (core falls, serpent breach, avalanche) briefly duck the music and ambience by about 4 dB.

**Voice management.**
- Each category has a voice cap and a priority: own hero > heroes > structures > units > ambience.
- Over the cap, the farthest or quietest voice is stolen.
- Same-sound retriggers within 40 ms merge (gain +1.5 dB instead of a new voice).

**Not sim-driven.** Audio only reads `world.events` and positions, so it never touches lockstep. Ambient loops are
emitters placed from map data (torches, fountain, geysers, water, braziers) and gated by the same falloff.

## 2. Combat foundation (shared by everyone)

| ID | When | Src | Pos |
|---|---|---|---|
| `swing.light` ×4 | light melee swing whoosh (any hero combo hit 1–2, grunt attack) | S | 3D |
| `swing.heavy` ×3 | heavy/cleave swing (combo finishers, heavy unit) | S | 3D |
| `swing.blade` ×4 | thin fast blade whoosh (duelist, raider) | S | 3D |
| `hit.flesh.light` ×5 | unarmoured melee hit | S | 3D |
| `hit.flesh.heavy` ×4 | big hit (`hit.big`) | S+P | 3D |
| `hit.armor` ×4 | hit on armoured heroes/heavies (metal clank layer) | S | 3D |
| `hit.blunt` ×3 | club/hammer/belly-flop/wrench hits | S | 3D |
| `hit.crit` ×2 | crit sweetener (sharp ring + crack), on top of the normal hit | S+P | 3D |
| `hit.blocked` ×3 | blocked / guarded hit (shield thunk) | S | 3D |
| `hit.ward` ×2 | hit soaked by a shield/ward (magic glassy thud) | P | 3D |
| `hit.structure` ×4 | hits on towers, walls and the core (stone/wood crunch) | S | 3D |
| `hit.dot` | quiet tick for bleed/poison/burn/zone damage (heavily throttled) | P | 3D |
| `miss` ×3 | whiff / dodged / blind miss | S | 3D |
| `dodge` ×2 | dodge roll cloth/feet swish (needs a new `dodge` event) | S | 3D |
| `parry` ×2 | steel ring, bright | S | 3D |
| `shove` ×2 | shoulder shove thump | S | 3D |
| `shove.whiff` | shove into nothing | S | 3D |
| `guardbreak` | GUARD BROKEN shatter-crack | S+P | 3D |
| `wallsplat` | body slammed into a wall: crunch + stone rattle | S | 3D |
| `knockback.land` ×3 | body tumble/landing after a knockback | S | 3D |
| `stun` | stars "tweety" ring loop while stunned (short, quiet) | P | 3D |
| `slow.apply` | sticky slow (mud squelch) | S | 3D |
| `root.apply` | roots creak/snap shut | S | 3D |
| `poison.apply` | bubbling hiss | S | 3D |
| `bleed.apply` | wet slice sting | S | 3D |
| `blind.apply` | flash + cry | S | 3D |
| `shield.gain` | shield up (bark/magic shimmer) | P | 3D |
| `shield.break` ×2 | shield shatter (`shieldBreak`, burst variant louder) | S | 3D |
| `heal.tick` | soft sparkle (throttled) | P | 3D |
| `heal.burst` | big heal chime | P | 3D |
| `fall` | fall whistle + body thud | S+P | 3D |
| `pit.fall` | long falling cry into a pit/chasm (`chasm`, ruins pits) | S | 3D |
| `charge.loop` | charge-up hum while holding A/B (rising pitch) | P | L |
| `charge.full` | FULL POWER ping | P | L |
| `jump.launch` / `jump.land` | ability jumps, Heave throws, backflips | S | 3D |
| `footstep.*` | footsteps per surface: grass, dirt, stone, sand, snow, wood/bridge, shallow water. Heroes only, quiet, near listeners only | S | 3D |
| `death.hero` ×per hero | champion death: per-hero voice grunt + body fall + gong sting | S | 3D + G sting |
| `respawn` | champion respawns at home (light rising shimmer) | P | 3D |
| `recall.loop` / `recall.done` / `recall.break` | recall channel hum, arrival whoosh, break fizzle | P | 3D |
| `levelup` | level up fanfare (short) | P | L+3D |
| `learned` | talent learned (quill/page + chime) | S+P | L |
| `callout.*` | small stinger under ability callouts (HEAVE, BLINDED, INTERRUPTED…) | P | 3D |

## 3. Heroes

Each hero needs:
- a **voice set** of short efforts (attack grunt ×3, ability shout ×2, hurt ×3, death ×1, taunt or spawn line ×1);
- the ability sounds below;
- costume variants only where the costume changes the material (marked *costume*).

### Warlord
| ID | When | Src |
|---|---|---|
| `warlord.combo1` / `combo2` | axe chop / 260° cleave (heavy whoosh) | S |
| `warlord.slam` | Ground Slam: huge ground impact, rock debris | S+P |
| `warlord.earthsplitter` | rolling rock wave (`shot rock`), rumble that travels | S |
| `warlord.magnitude` | sinkhole pull, grinding earth | S |
| `warlord.shoulder` | Shoulder Charge rush (armour clatter loop) + impact | S |
| `warlord.warcry` / `.challenge` / `.blood` | war cry shout; challenge adds a taunting horn; blood adds a heartbeat drum | S |
| `warlord.quake.lunge` / `.quake` | Earthquake leap + massive quake, longer tail | S+P |
| `warlord.lava` | Cataclysm lava zone sizzle loop | S |
| `warlord.heave` | lift grunt + throw whoosh + landing crash | S |
| `warlord.crackcharge` | charge along the crack | S |
| `warlord.frenzy` | Berserker stack gain (drum hit, pitch rises with stacks) | P |
| *costume* colossus | stone-y variants of the hit and slam layers | S |

### Engineer (Stig)
| ID | When | Src |
|---|---|---|
| `stig.combo` | wrench clang swings | S |
| `stig.wrench.throw` / `.return` / `.catch` | boomerang wrench spin loop (doppler) + catch | S+P |
| `stig.rivet` ×3 | Riveter rivet gun shots | S |
| `stig.chain` | Overclock chain lightning crackle | S+P |
| `stig.repair` | Repair pulse: hammering + ratchet, and "nothing to repair" clunk | S |
| `stig.works.raise` | Siege Works platform and ramp rising (gears, wood creak) | S |
| `stig.works.end` | works collapse (`modEnd`) | S |
| `stig.palisade` / `.spike` | palisade spikes rise / impale hit | S |
| `stig.tesla.build` / `.zap` | tesla coil build / zap (chain) | S+P |
| `stig.ballista.build` / `.fire` / `.hit` | crank, twang + bolt whoosh, bolt thunk | S |
| `stig.rampjump` | ramp launch | S |

### Raider (Grim)
| ID | When | Src |
|---|---|---|
| `grim.stab` ×4 | fast dagger stabs | S |
| `grim.daggers` | Twin Fangs thrown daggers + ricochet ting | S |
| `grim.leap` / `.land` | Leap launch + landing thud; crater variant | S |
| `grim.pounce.mark` / `.burst` | mark tick + burst | S+P |
| `grim.smoke` | Smoke Bomb pop + hiss loop | S |
| `grim.stealth.in` / `.out` | vanish whoosh / reveal (and ambush stinger) | P |
| `grim.shadowstep` | teleport whoosh (from + to) | P |
| `grim.execute` | Execute Dash slice; execute-kill sting | S |
| `grim.serrated` | bleed consume burst | S |
| *costume* sporeblight | spore puff layer on smoke and stealth | S |

### Summoner (Remnil)
| ID | When | Src |
|---|---|---|
| `remnil.bolt` ×3 / `.orb` / `.orb.splash` | magic bolt casts, orb cast + splash | S+P |
| `remnil.arcbolts` | chain | P |
| `remnil.siphon` | Soul Siphon drain loop | P |
| `remnil.hex.cast` / `.hex.root` | Hex telegraph whisper + root snap | S+P |
| `remnil.gravepull` | bones rattle pull | S |
| `remnil.gravewalk.channel` / `.out` / `.in` | sink into the grave, travel, rise; Wraith Gate burst | S+P |
| `remnil.army.telegraph` / `.erupt` | Raise an Army rumble + eruption + skeleton rattles | S |
| `remnil.raised` | hexed dead rise (bone crackle) | S |
| `remnil.hexswap` | swap blink | P |
| *costume* shadowplay | paper/puppet layer | S |

### Duelist (Francois)
| ID | When | Src |
|---|---|---|
| `francois.thrust` ×3 | rapier thrusts | S |
| `francois.fleche` | slash wave | S+P |
| `francois.lunge` / `.blinkstep` | lunge dash / blink recast + afterimage | S+P |
| `francois.parry.stance` / `.parry` / `.riposte` | en garde ring, parry ting, riposte crit | S |
| `francois.volte` | volte blink | P |
| `francois.flurry` | Blade Flurry: 7–10 quick slashes (sequenced) + finisher | S |
| `francois.whirl` | Riposte Whirl spin | S |
| *costume* drowned | wet/splashy layer | S |

### Warden (Thorn)
| ID | When | Src |
|---|---|---|
| `thorn.swing` | broad wooden swings | S |
| `thorn.bark` / `.bark.break` | bark shield up / burst | S |
| `thorn.slap` / `.slap.hit` / `.vine` | long arm stretch creak + slap, vine grab | S |
| `thorn.wall.rise` / `.wall.end` | Stone Wall rising / crumbling | S |
| `thorn.snare` | snare spring | S |
| `thorn.rootcage` | root cage telegraph + slam shut | S |
| `thorn.brambles` | bramble burst + rustle loop | S |
| `thorn.grove` | grove heal loop (birdsong + chime) | S |
| `thorn.armshove` | arm shove | S |
| *costume* suntotem | sun/brass layer | S |

### Marksman (Wren)
| ID | When | Src |
|---|---|---|
| `wren.draw` | bow draw creak (on charge) | S |
| `wren.arrow` / `.arrow.hit` | loose + flight + thunk | S |
| `wren.powershot` | charged pierce shot (heavier twang + whoosh) | S+P |
| `wren.broadhead` | broadhead splash | S |
| `wren.pip.launch` / `.latch` / `.peck` / `.rake` / `.home` | Pip the bird: chirps, wing flaps, pecks, screech rake | S |
| `wren.volley` / `.volleywave` | volley release + arrow rain hiss and impacts | S |
| `wren.heartseeker.draw` / `.fire` / `.ricochet` | long draw tension, massive release, ricochet | S+P |
| `wren.skyshot` | backflip + mid-air shot | S |
| `wren.fire` | Fire Arrows lava sizzle | S |
| *costume* starfall | starry chime layer | P |

### Friar (Maddock)
| ID | When | Src |
|---|---|---|
| `maddock.punch` ×3 / `.bellyflop` | brawler hits, belly flop | S |
| `maddock.keg.throw` / `.splash` / `.splash.small` | healing keg toss, splash + glug | S |
| `maddock.puddle` | ale puddle fizz loop; poison bubbles for enemies | S |
| `maddock.powder.throw` / `.land` / `.fuse` / `.boom` / `.pop` | powder keg: toss, wood thunk, fuse hiss, explosion, cluster pops | S |
| `maddock.tar` | tar zone squelch | S |
| `maddock.brewfest` / `.cask.break` | tavern cheer + cask slam / cask destroyed | S |
| `maddock.plenty` | Plenty passive (soft gulp) | S |
| `maddock.rocket` | Keg Rocket launch + fizz trail | S |
| *costume* celadon | porcelain/clink layer | S |

### Herald (commander)
| ID | When | Src |
|---|---|---|
| `herald.bolt` | magic shot | P |
| `herald.banner` | banner plant (pole thud + cloth flap) | S |
| `herald.horn` | War Horn (brass) | S |
| `herald.rally` | rally fanfare + resupply clink | S |
| `herald.directive` | order bark per directive (attack / follow / defend / hold) | S |
| `herald.formation` | formation cycle drum tap | P |
| `herald.morph` | take up / put down the banner (armour + cloth) | S |
| `herald.vault` | banner vault | S |

## 4. Units

| ID | When | Src | Pos |
|---|---|---|---|
| `unit.grunt.swing` / `.hit` | grunt attack (lighter than heroes, throttled) | S | 3D |
| `unit.ranged.loose` / `.arrow.hit` | soldier bow | S | 3D |
| `unit.heavy.swing` / `.hit` | heavy maul + knockback thud | S | 3D |
| `unit.spawn` | squad spawn (horn toot, marching feet) | S | 3D |
| `unit.death` ×4 | soldier death grunt + armour drop | S | 3D |
| `unit.rankup` | VETERAN / ELITE / HEROIC promotions | P | 3D |
| `unit.march` | marching feet bed for large moving squads (loop, crowd-scaled) | S | 3D |
| `unit.summon.expire` | summon crumbles | S | 3D |
| `ogre.wake` / `.aggro` / `.slam` / `.hurt` / `.death` / `.steps` | the neutral ogre | S | 3D (+G for wake and fall) |

## 5. Structures

| ID | When | Src | Pos |
|---|---|---|---|
| `build.start` / `build.done` / `build.upgrade` | construction hammering loop, completion, upgrade | S | 3D |
| `build.fail` | NEED GOLD / NO PAD / RUBBLE / MAX LEVEL | P | L |
| `tower.bolt` / `.bolt.hit` | damage tower shot | S | 3D |
| `tower.spear` | ballista spec (re-aim crank + spear) | S | 3D |
| `tower.firepot` / `.fireburst` | firepot lob + burst | S | 3D |
| `tower.volley` | volley spec | S | 3D |
| `tower.pulse` / `.frost` / `.storm` / `.well` | control tower pulses | S+P | 3D |
| `tower.heal` | support tower heal | P | 3D |
| `prod.barracks` / `.range` / `.foundry` / `.outpost` | quiet working loops (anvil, saw, bellows) near listeners only | S | 3D |
| `structure.collapse` ×2 | tower destroyed (stone and timber crash) | S | 3D |
| `rubble.clear` | rubble cleared | S | 3D |
| `core.ward.hit` / `.ward.break` / `.ward.patch` | core shield | P | 3D/G |
| `core.hit` | keep under attack (also a G alarm bell, throttled to once every 8 s for the owner) | S | 3D + L |
| `core.fall` | core destroyed: huge collapse + gong | S | G |
| `eliminated` | FFA house falls | S | G |
| `tower.lost` / `.felled` | notice stings | P | L |

## 6. Objectives and arena

| ID | When | Src | Pos |
|---|---|---|---|
| `grudge.wake` / `.home` | the Grudge awakens / returns | S+P | G |
| `grudge.taken` / `.dropped` | pickup / drop | S+P | G* |
| `grudge.enshrine.loop` | enshrine channel progress (rising) | P | 3D |
| `grudge.shrined` | enshrined: big sting | S | G |
| `grudge.stealing` / `.stolen` | steal attempt alarm / stolen | P | G* |
| `grudge.carried` | heartbeat or low drone near the carrier | P | 3D |
| `bomb.buy` / `.plant` / `.fuse` / `.boom` | shop bomb | S | 3D |
| `cannon.aim` / `.fire` / `.whistle` / `.impact` | shop and map cannon barrage | S | 3D (+G for CANNON FIRE) |
| `jumppad.charge` / `.launch` / `.land` / `.fail` | jump pads | S+P | 3D |
| `sanctuary.heal` | home sanctuary full heal | P | L |

## 7. Map events and ambience

Each map has an **ambient bed** (stereo loop, `ambience` bus) plus **positional emitters**.

| Map | Bed | Emitters | Event sounds |
|---|---|---|---|
| all | — | torches (crackle), braziers, banners (cloth flap) | lockdown `gates.lock.warn` (chains rattle) / `gates.lock.open` (portcullis), sudden death bell |
| crossing | river, breeze, distant birds | fords (water), mill | `mist.warn` / `.in` / `.out` (eerie wind swell) |
| shoals | surf, gulls | waves on the shore | `tide.rise` / `.fall` (rushing water, bell buoy) |
| ruins | crows, wind in stones | lantern hum | `lantern.rise` / `.taken` / `.fade` (ghostly), `pit.fall` |
| frostcross | howling alpine wind | ice creaks | `horn.blow` (alpine horn), `avalanche.warn` / `.slide` / `.settle`, `chasm` |
| gardens | birdsong, bees | fountain | `bells.warn` / `.shift` (bell toll + stone gates) |
| hollow | autumn wind, rustling leaves, owls | cider wells (bubbling) | `geyser.warn` (gurgle build) / `.erupt` (cider blast) |
| spires | night desert wind, crickets, distant howl | blowing sand | `serpent.swim` (sand churn loop on the serpent), `serpent.warn` (rumble), `serpent.breach` (roar + sand burst) |

## 8. UI and match flow

| ID | When | Src |
|---|---|---|
| `ui.move` / `ui.ok` / `ui.back` | already exist; rework as soft wood/parchment clicks | S |
| `ui.tab` / `ui.page` | tab switch / codex page flip (paper) | S |
| `ui.toggle` / `ui.slider` | settings cycle | S |
| `ui.error` | invalid action | P |
| `select.hover` | champion hover (per-hero tiny signature sting, about 0.4 s) | S |
| `select.seal` / `.unseal` | wax seal stamp / peel | S |
| `select.costume` | costume flick | S |
| `select.join` / `.leave` | pad joins / leaves a seat | P |
| `select.ready` | all-ready banner | S |
| `select.holdback` | hold-B ring tick + release | P |
| `name.key` / `.done` | on-screen keyboard keys (quill scratch) | S |
| `field.hover` / `.pick` | field card hover (per-map ambient snippet) / pick | S |
| `match.countdown` / `match.fight` | 3-2-1 drums + FIGHT! | S |
| `match.timer.warn` | last 30 s ticks; final 5 s | P |
| `lockdown.tick` / `.unlock` | padlock last 5 s / pop | P |
| `pause.open` / `.close` | pause in / out (music duck already exists) | P |
| `results.win` / `.lose` / `.draw` | results stingers (before the results music) | S |
| `hud.cross.open` / `.close` / `.select` | build / shop / learn crosses | S |
| `hud.group` | unit group cycle | P |
| `hud.morph.ring` | morph hold progress | P |
| `hud.notice` | generic notice (team-coloured pitch) | P |
| `net.join` / `.leave` / `.lost` / `.desync` | online events | P |

## 9. Sim events still needed

Some sounds above have no sim event yet. Each would need a small, visual-only (non-gameplay) event; hashes are
unaffected.
- `dodge`: a dodge started.
- `status`: stun, slow, root, poison, bleed or blind applied.
- `stealth`: in or out.
- `buildDone`: a construction finished.
- `recall`: start or break.
- `relic enshrine`: progress start or stop.
- `combo` swings: already present as `act fire kind:"combo"`, which audio currently ignores.

Two existing sound cases never run: `squad` and horn `fail` are never emitted.

## 10. Sourcing

All recorded sounds will be CC0, to match the music: Kenney audio packs (Impact, RPG, Interface, UI), freesound.org
with the CC0 filter, and OpenGameArt CC0.
- **Processing:** trim, normalise to about −16 LUFS short-term per category, mono for 3D sounds, 44.1 kHz Ogg
  (≈ 1–3 MB total).
- **Layout:** files go in `assets/sfx/<category>/<id>[_n].ogg`. `assets/sfx/CREDITS.txt` lists the source of every
  file.
- **Procedural:** synth recipes stay in code for magic, UI ticks, chimes and loops whose pitch must follow gameplay
  (charge, enshrine, stun).

Rough count: about 330 sound IDs, about 600 files including variants. The voice sets are the biggest single chunk:
9 heroes × about 11 lines each.
