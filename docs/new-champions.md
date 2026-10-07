# New champion concepts (14-champion roster)

Six sketches to take the roster from 8 champions to 14: a second marksman, bruiser, tank, caster and builder,
and another support. Each was seeded with `openssl rand -hex 16`; the seed's first five bytes pick, in order, a
folk (16 options), a home theme (16), a weapon (8 per class) and two gimmicks (16 each). The tables are at the
bottom so the picks can be reproduced. Where a pick clashed with an existing champion, the adaptation is noted.

Conventions are the same as the current kits: **A** is the combo (hold to charge), **B** the main ability, **R**
the utility, **Z** the super, and **L+X** (dodge) has one hero-specific trick. Every champion also gets a class
(`heroes.json` "class") and an entry for the team-synergy table (`synergy`, keyed by partner class) so 2v2 comps
can be tuned without touching 1v1.

| Class | Today | New |
|---|---|---|
| marksman | Wren | Tadwick |
| bruiser | Warlord | Mother Kelp |
| tank | Thorn | Hogshead |
| caster | Remnil | Abbess Hollin |
| builder | Stig | Professor Hoot |
| support | Maddock (+ Herald as commander) | Bramble & Mead |

---

## Tadwick, the Tidehunter (marksman)

Seed `9280ffc330058fa7768967dfdec0bf54` -> frogfolk · tidal coast · longbow · pulls things toward itself ·
ricochets off walls. *Adapted: the longbow is a harpoon bow so it doesn't double Wren's longbow.*

- **Look:** a squat frogfolk fisherman in a yellow oilskin coat and sou'wester, a whalebone harpoon bow, a coil
  of rope on the hip, net floats as charms. Wide eyes, long tongue, webbed boots.
- **Passive, Wet:** his hits leave targets dripping for 3 s. His harpoons ricochet once off walls and structures,
  and a ricochet hits a Wet target harder.
- **A, Harpoon:** single shot (medium range). Hold to charge a shot that ricochets twice.
- **B, Reel In:** fire a roped harpoon; on a hit it drags a soldier all the way to him, or yanks a champion
  halfway (stopped by walls). Pulling someone into a wall stuns them briefly.
- **R, Tongue Lash:** his tongue snatches him to a nearby ledge, tree or structure (a short grapple, up to one
  terrain step), out of melee.
- **Z, Riptide:** a ring of water around him for 6 s; foes inside are slowed and pulled slowly to the centre;
  his shots at anyone in the ring ricochet freely.
- **L+X:** a belly-slide dodge (longer, low) that leaves a short puddle; Wet foes on it slip.
- **Counterplay:** walls are his friend and enemy; fight him in the open, close the gap after he's used Reel In.
- **Synergy:** with a *tank* partner, Reel In lands the champion at his partner's feet instead of halfway.
- **Bot:** keeps distance near walls, Reels champions that are near walls, Tongue Lash to escape divers.

## Mother Kelp, the Wreck Witch (bruiser)

Seed `dfaccd84a2cf254947bd62b46f203a13` -> bog witch · shipwreck · flail · charges up over time · swaps places.

- **Look:** a tall hunched sea-hag in rotted sailcloth and barnacled boots, seaweed hair, a ship's anchor on a
  chain as a flail, lantern of drowned-ship glass at her belt.
- **Passive, Tide Rising:** the longer she's in a fight the harder she swings: every second within 6 m of an
  enemy champion adds a stack (max 10, +3% damage and size each); out of combat for 4 s the stacks drain.
- **A, Anchor Swing:** a wide two-hit flail combo. Hold to whirl the anchor around her (hits everyone near, slows
  her).
- **B, Dredge:** hurl the anchor out on its chain; it catches the first enemy and swaps her place with them
  (she ends up where they were, they end up next to her old spot, slowed).
- **R, Bilge:** spit a cloud of brine; enemies inside can't heal for 3 s.
- **Z, Davy's Grip:** drowned hands burst from the ground in a wide circle; enemies are rooted for 1.5 s and take
  damage scaled with her Tide Rising stacks.
- **L+X:** swing on the anchor chain: a hooked arc dodge around a structure or tree she's near.
- **Counterplay:** kite her before the stacks build; healing denial is her only defence against burst.
- **Synergy:** with a *caster* partner, Dredge swaps into the caster's slows and roots for a free stack.
- **Bot:** commits once at 4+ stacks, Dredges the enemy marksman or caster, Bilge on healers.

## Hogshead, the Cellar Boar (tank)

Seed `8b5d3514b251e1ad035ec29889c2f532` -> boar-folk · moonlit vineyard · anvil · charges up over time · swaps
places.

- **Look:** a huge grey boar-folk vintner, purple wine-stained apron over chainmail, tusks capped with brass, an
  iron anvil strapped to his back like a shell and a smaller one on a chain for a weapon. Grape-vine tattoos.
- **Passive, Thick Skin:** while standing still or blocking he builds Grit (up to 25% damage reduction over 3 s);
  moving drains it.
- **A, Anvil Thump:** slow heavy hits. Hold to charge a ground pound that knocks back.
- **B, Headbutt:** charge forward a short way; the first champion hit is pushed back with him, and if they hit a
  wall both stop and the target is stunned.
- **R, Switcheroo:** swap places with an ally within 8 m (any champion of his house); the ally gets a short shield.
  A peel and a rescue in one button.
- **Z, Crush Season:** he raises the anvil and slams it 3 times; each slam is bigger and the last flattens (stun,
  heavy damage to structures).
- **L+X:** curl up behind the back anvil: a short dodge that leaves him facing away, fully blocking from behind.
- **Counterplay:** keep him moving (Grit drains), punish the Switcheroo target.
- **Synergy:** with a *marksman* or *caster* partner, Switcheroo gives a bigger shield and a short speed boost.
- **Bot:** stands his ground in fights, Switcheroos hurt partners, Headbutts toward walls.

## Abbess Hollin, the Beekeeping Scribe (caster)

Seed `d76b85502281e220621ad9a150aa5cdb` -> old human · beekeeping hills · ink and quill · ricochets off walls ·
swaps places.

- **Look:** an old woman in a beekeeper's veil and a scholar's robes, a giant quill as a staff, ink pots and a
  hive-shaped lantern at her belt, bees orbiting her.
- **Passive, Annotations:** her spells write glowing runes on the ground where they land; she can recast onto a
  rune to empower that spell once.
- **A, Ink Bolt:** a bolt of ink that ricochets once off walls and soldiers (bounces to a champion if one's near).
  Hold to charge a bolt that splashes and blinds briefly.
- **B, Swarm:** release bees that orbit a target point for 4 s, damaging and slowing anyone inside; recast on the
  swarm's rune to move the swarm to her.
- **R, Erratum:** swap places with her own rune (a blink to any rune within 12 m).
- **Z, Illuminated Manuscript:** for 8 s every spell leaves a rune and costs no cooldown on its first recast.
- **L+X:** she reads a page and a gust carries her a short way backwards.
- **Counterplay:** stand off her runes; she's slow and fragile without them.
- **Synergy:** with an *assassin* partner, Swarm's slow also marks targets for their next hit (+15%).
- **Bot:** seeds runes at chokepoints, Erratum to escape, Swarm on clumps.

## Professor Hoot, the Snow Architect (builder)

Seed `89e9360f2cc76889a731551ff95c8386` -> owlfolk · sunken temple · snow forts · uses height (bonus from high
ground) · throws its weapon and recalls it. *Adapted: the sunken temple becomes a flooded frost temple, so snow
forts make sense.*

- **Look:** a round owl scholar in a fur-lined robe and goggles, a carpenter's square for a weapon, a pack of
  ice blocks and a slate full of diagrams.
- **Passive, Vantage:** standing on higher ground than his target (his own forts count) he deals +20% damage and
  sees further.
- **A, Square Strike:** quick jabs with the carpenter's square. Hold to throw it like a boomerang; it returns
  (hits on the way back too).
- **B, Snow Fort:** raise a short curved ice wall where he faces (lasts 12 s); up to 2 at once. Allies behind it
  take less from ranged attacks.
- **R, Lookout:** build a 2 m ice tower he can step onto (one at a time), a temporary high-ground perch;
  soldiers can't climb it.
- **Z, Avalanche Dome:** freeze a dome of ice over an area for 6 s: enemies inside are slowed, allies inside heal
  slowly, and nothing can shoot in or out.
- **L+X:** a flapping hop up onto a ledge or his own fort.
- **Counterplay:** forts and the Lookout have little health; melee him off his perch.
- **Synergy:** with a *marksman* partner, Lookout is wide enough for two and gives both Vantage.
- **Bot:** builds forts across lanes it's defending, perches on Lookout in fights, throws the square at range.

## Bramble & Mead, the Honey Rider (support)

Seed `5646d7b62fc295b6bd542bacf317b655` -> badger-folk · orchard country · honey pot · rides a mount · uses
height (bonus from high ground). *Adapted: orchard country is Russet Hollow's world, which fits; she's a
beekeeper's courier, not a brewer, so she doesn't overlap Maddock.*

- **Look:** Bramble, a stout badger-folk courier in a patched quilted jacket, rides Mead, a fat fuzzy bumblebee
  the size of a pony. Honey pots in saddle bags, a ladle for a weapon.
- **Passive, Sweet Tooth:** allies near her heal slowly; the heal is doubled for allies on higher ground than
  their attacker.
- **A, Ladle Whack:** two light hits from the saddle. Hold to fling a dollop of honey that slows.
- **B, Honey Pot:** throw a pot that splashes a sticky pool: allies inside heal, enemies inside are slowed and
  can't dodge.
- **R, Take Wing:** Mead lifts her up for 3 s: she floats over walls and gaps (like a jump pad, steered), and
  lands with a small heal around her.
- **Z, Royal Jelly:** a big heal on all allies within 10 m and a short shield; allies inside run faster for 5 s.
- **L+X:** Mead buzzes sideways: a strafing dodge that keeps her facing.
- **Counterplay:** she's squishy on the ground after Take Wing; punish the landing.
- **Synergy:** with a *bruiser* or *assassin* partner, Honey Pot also gives them a short damage buff.
- **Bot:** stays behind her partner, Honey Pots on fights, Take Wing to cross terrain or escape.

---

## Seed tables

Byte 0 % 16, folk: dwarf, goblin, frogfolk, half-giant, clockwork automaton, moth-winged fae, badger-folk, old
human, lizardfolk, owlfolk, troll, boar-folk, stone golem, mushroom-folk, crowfolk, bog witch.

Byte 1 % 16, theme: tidal coast, volcanic forge, haunted bog, frozen north, desert bazaar, clocktower city,
orchard country, deep mines, circus caravan, sunken temple, thunder peaks, beekeeping hills, shipwreck, moonlit
vineyard, bell foundry, salt flats.

Byte 2 % 8, weapon by class:

- marksman: crossbow, harpoon gun, slingshot, throwing knives, blunderbuss, boomerangs, javelins, longbow
- bruiser: anchor on a chain, twin hammers, gauntlets, giant ladle, tree-trunk club, flail, greataxe, boulder
- tank: tower shield, bell, door, barrel armour, turtle shell, anvil, church pew, giant mushroom cap
- caster: lantern, storm staff, tarot deck, music box, bones, ink and quill, bubble wand, hourglass
- builder: bellows and pipes, beehives, mine carts and rails, scaffolding, clockwork traps, totems, snow forts,
  catapult kit
- support: tea kettle, banner of feathers, bagpipes, prayer bells, herbal satchel, lullaby harp, mirror, honey pot

Bytes 3 and 4 % 16, gimmicks: ricochets off walls, leaves zones behind, swaps places, pulls things toward itself,
charges up over time, stacks marks on a target, rides a mount, plants then detonates, turns terrain to its side,
copies an enemy trick, shields with a prop, tethers to an ally or foe, throws its weapon and recalls it, changes
stance A/B, grows with kills, uses height (bonus from high ground).
