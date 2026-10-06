# Remodels for the newer champions

Full model costumes (a new body on the existing rig and clips, like Brother Celadon's teapot friar or Grim's
Sporeblight toadstool) for the five newer champions that only have recolours: Brindle, Mother Kelp, Hoot, Gristle and
Bramble & Mead. Hollin already has one (the Beekeeper).

Each idea came from reading a random seed (`openssl rand -hex 16`), palm-reader style: looking at the shapes, words
and rhythms in the digits and following whatever they suggested. Nothing below was picked by a formula.

Ground rules for all five, same as the existing remodels:

- **Kept:** the champion's rig, clips, hitbox and rough height and length (the numbers below). Kit, numbers and
  balance don't change.
- **Can change:** everything else. Silhouette, material, species, props and the theme of every effect and sound are
  free.
- **Readable at gameplay zoom.** No white blobs; dark, high-contrast palettes with one bright accent (the art rules
  from the costume work).
- **Unique effects per theme.** Each remodel gets its own effects atlas, HQ paintings, portrait, costume icon and
  announcer-ready name.
- **Props must not overlap other champions'.** Maddock owns kegs and casks, Hollin's Beekeeper owns bees and honey
  dippers, Kelp owns anchors.

---

## 1. Brindle: THE STAINED-GLASS LILY KING

**Seed:** `982e 950d 3cd5 2909 d9f9 504f 101b ad23`

**Reading:** the first two blocks end in `e` and `d`, mirrored like a reflection in still water. `3cd` is a disc (a
lily pad, a rose window). `2909 d9f9` is ripples: nines spreading outward. `101` is something lit through, and
`ad23` reads like an old date carved under a chapel window. A pond, a reflection, light through colour, something
old and sacred that sank.

**Concept:** the old chapel by the millpond flooded centuries ago. Its great rose window sank and settled on the
pond floor, and one spring it climbed out as a frog. Brindle is a **leaded stained-glass frog**: his body is panes of
deep green, amber and cobalt held in black lead lines, lit faintly from inside like a window at evensong. His throat
sac is a round rose window that glows when he croaks.

- **Silhouette:** his frog proportions, wide and squat, but faceted. Flat glass planes meet at lead seams, and his
  back is the arch of a gothic window frame.
- **Harpoon bow:** a pipe from the drowned chapel organ, with a bell-pull rope for the string. Harpoons are tall,
  thin lancet-window shards on a lead chain.
- **Wet:** stays as dripping, but the drips are coloured light. Soaked foes catch little stained-glass glints of
  colour.
- **Effects:** coloured light shafts, shattering panes (amber, green, cobalt), lead-line cracks as ground decals, and
  rose-window rings for area effects.
- **Sounds:** glass chime on hits, an organ-pipe whoomp on each shot, and his croak doubled with a church bell
  struck far away.
- **Palette:** black lead lines, deep bottle green, amber and cobalt, with a warm gold inner glow as the accent.
- **Build notes:** one Tripo body (frog in stained glass, gothic arch back), with the organ-pipe bow as its own
  prop. The inner glow goes in the vertex colour, or as an emissive mask in the HQ painting. Height 1.7 m as now.
- **Costume name:** `harpooner@rosewindow`. Announcer: "The Lily KING!"

---

## 2. Mother Kelp: THE SHIP IN A BOTTLE

**Seed:** `75a4 c82d 94e5 5c27 7aa9 30e5 f41b 1566`

**Reading:** `a4` is a sheet of paper. `5c27` has a 7 like a mast with a pennant. `aa9` looks like a cork and a
string, and `1566` is a year of galleons. `e5 … e5` repeats like waves against a hull. Paper, a ship, a year at sea
and something sealed: a message, or a ship that can't get out.

**Concept:** Mother Kelp *is* the bottle. She is a huge, sea-scoured green glass bottle, waddling upright on
barnacled glass feet. Inside her, visible through the glass, a tiny galleon from 1566 sits wrecked in a swirl of
real sea, its rigging tangled up into the neck as her "hair". Her face sits where the label would be, a sodden
paper label with ink eyes. Her cork is a hat, and a rolled message pokes out of it like a feather.

- **Silhouette:** tall and round-bellied, with a narrow neck and a cork on top. Same height as now (2.05 m) and
  wider at the hips. The galleon inside is part of the body mesh, behind a glass shell.
- **Anchor → ship's wheel on a rope.** Her combo and whirl swing a heavy ship's wheel. Dredge hurls a smaller
  corked bottle on twine that hooks the target and reels them in; the reel animation's latched prop becomes this
  bottle.
- **Tide Rising:** the water inside her glass climbs with her stacks, and the tiny galleon rights itself and sails
  at high tide. This is the costume's centrepiece; it needs a shader that sets the water line from her Tide stacks.
- **Bilge:** she uncorks and pours. The cloud is ink and seawater with floating scraps of paper. Davy's Grip hands
  become rolled message scrolls unfurling from the ground.
- **Effects:** glass clinks, paper scraps, ink blots, droplets, and small cork pops.
- **Sounds:** glass knocking on her hits, a cork pop on Dredge, water sloshing that rises with her Tide stacks.
- **Palette:** bottle green glass, dark wood ship, cream paper and indigo ink. Accent: the white foam on the water
  inside her.
- **Build notes:** two meshes. A body mesh (galleon, water and feet) plus a separate transparent glass-shell mesh
  with a refraction-free "thick glass" material: Fresnel rim, tinted, depth-sorted after the body. The water line
  is a clip-plane uniform driven by Tide stacks. Tripo makes the bottle shell and the galleon separately.
- **Costume name:** `wreckwitch@bottled`. Announcer: "Mother KELP, bottled!"

---

## 3. Hoot: THE GAME MASTER

**Seed:** `a542 d629 f2b5 4bc1 505c 6e0b 646a 28db`

**Reading:** `d6` is a die, plainly, in the second block. `46` and `64` are squares on a board. `bc` is a turn
order, `5c` is a counter on square five, and `0b` is a pawn. `db` is the rattle of dice in a cup. Hoot builds forts
and towers and throws squares, so the board game was already in him.

**Concept:** Hoot is a **carved wooden game-master owl**, a tabletop piece come alive. His body is stacked turned
wood like an oversized chess bishop, with a carved owl face, painted pips for feathers, and a little cloak made from
a folded game board, chequered on the inside. He carries a dice cup.

- **Silhouette:** the same 1.85 m round owl shape, but turned-wood smooth with a bishop's collar ring at the
  waist. He reads as a game piece from across the field.
- **Lookout → a dice tower.** The ice tower becomes a wooden dice tower with a little staircase chute. When it
  rises, a die rattles down through it and lands on top as his perch.
- **Snow Fort → a row of giant dominoes,** standing on end. When the fort breaks they topple one after another.
- **Throw (square):** he flings a big wooden die that tumbles and shows a face on impact. This is cosmetic only, the
  damage doesn't change.
- **Avalanche Dome → the box lid.** A giant game-box lid slams down over the area; the board is printed inside it.
- **Vantage / Watchtower:** a little "+1" counter token pops above allies on his tower.
- **Effects:** wooden splinters, pips, cards, small counters, felt dust, and chequered ground decals for his zones.
- **Sounds:** dice rattling in a cup, wooden clacks, a domino cascade when the fort breaks, a satisfying lid thunk
  for the Dome.
- **Palette:** walnut and maple wood, felt green, red and ivory pips. Accent: brass trim.
- **Build notes:** Tripo body (turned-wood owl game piece), dice-cup hand prop, and a dice tower that replaces the
  lookout model through costume props (`lookout@gamemaster`). The domino fort is a costume structure model; the
  ice-lookout code path already takes a prop.
- **Costume name:** `architect@gamemaster`. Announcer: "Hoot rolls the dice!"

---

## 4. Gristle: THE HARVEST WICKER BOAR

**Seed:** `8dbd 582d 2eaa c85f c154 98df f5ed 210a`

(A reroll. The first reading, a cast-iron stove boar, was too close to the Warlord's Iron Colossus steam automaton,
so this one steers clear of metal and machines.)

**Reading:** `dbd` is a weave, over-under-over, the same shape mirrored. `eaa` is a farmyard bray, and `f5ed` says
*fed*, a table laid. `210` is a countdown: the last days before the festival. `98df` looks like a bonfire stacked
high, and `aa` / `ff` come in pairs like sheaves bound in twos. A harvest festival, a woven figure, a feast, and the
night the fires are lit.

**Concept:** every autumn the cellar village weaves a great boar of willow and straw for the harvest feast, stuffed
with sheaves, gourds and apples, garlanded in ribbons. This year it walked off the green before they could light it.
Gristle is the **wicker harvest effigy**: woven willow ribs over a straw-stuffed body, a carved turnip-lantern face
glowing through the weave at the eyes, horns of bent willow for tusks, and corn dollies and ribbons tied all over.

- **Silhouette:** the same 2.1 m bulk, open and woven, so you see straw and gourds through the ribs. Bristling straw
  ends make the outline shaggy and readable.
- **Anvil → millstone and mallet.** He swings a huge wooden threshing mallet for his combo, Pound and Crush Season.
  The stone he carried on his back becomes a millstone strapped there, which is what the Anvil Curl turns toward
  hits from behind.
- **Grit:** lanterns inside the wicker glow brighter as he stands his ground. Full Grit is a warm bonfire light
  through every gap in the weave.
- **Dig In:** his woven legs root down. Willow withies sprout into the ground and straw bristles stand on end, with
  the red steadfast glow showing as embers inside him. When the banked blow lands it bursts in a flurry of chaff.
- **Headbutt:** a charging effigy shedding straw. A pinned victim gets little straw birds circling their head.
- **Switcheroo (bodyguard):** a ring of scattered grain and a ribbon twist under the ally's old spot.
- **Effects:** straw, chaff, grain, apple and gourd chunks, ribbons, and woven-willow ground decals, with warm
  lantern light as the accent.
- **Sounds:** creaking wicker, rustling straw, a thump of packed sheaves on hits, a hollow wooden clonk from the
  mallet, a festival drum on Crush Season's last slam.
- **Palette:** dark weathered willow and wet straw, with red and green ribbons. Accent: the amber lantern glow
  inside. Darker weave keeps it from reading as a pale haystack.
- **Build notes:** a Tripo wicker-boar body (open weave modelled in, gourds inside) plus a threshing mallet prop on
  hand_R; the millstone replaces the back anvil. The inner lantern glow is an emissive mask whose intensity tracks
  Grit and Dig In.
- **Costume name:** `vintner@harvest`. Announcer: "Gristle of the HARVEST!"

---

## 5. Bramble & Mead: THE TINKER'S HIVE

**Seed:** `043b 29d9 85f5 e3c2 59f3 7721 bc00 a96f`

**Reading:** `043b` is a bolt size. `e3c2` is a part number stamped on a bearing. `7721` is a serial number, and
`bc00` with its two zeros reads like two washers or two goggle lenses. `a96f` looks like a little wing bent from wire.
It's a workshop, with someone welding in the corner. This matches your scrap-metal bee reference exactly.

**Concept:** **Mead is a reticulating scrap-metal bee**, built from bearings, bolts, washers and stacked pipe
collars:
- **Body:** the abdomen is a telescoping stack of steel rings that slide over each other as it breathes. The thorax
  is a ball bearing in a clamp, the head is a valve body with spark-plug eyes, the legs are threaded rods with
  hex-nut joints, and the antennae are bent wrench handles.
- **Wings:** perforated sheet-metal fans that flutter on visible pivot pins.
- **Rider:** Bramble is the tinker who built it. She's a badger in a leather welding apron, flip-up welding mask,
  brass goggles, and a tool belt clanking with spanners.

- **Silhouette:** the same seated-rider proportions and 1.9 m height, on the same wing bones. The bee reads as
  bright polished steel with brass accents, darker around the joints so it isn't a white blob.
- **Reticulation:** the abdomen rings, leg segments and wing fans are separate rigid pieces on the existing hips and
  wing bones. The rings telescope on idle and buzz clips with a small sliding offset on the ring stack.
- **Honey → machine oil and brass solder.** Honey Pot becomes an oil can lobbed in an arc that leaves a glossy black
  oil slick (foes slip and stick, allies are "greased up" and heal). Honey Fling is a hot blob of solder. Royal Jelly
  becomes a burst of welding sparks and a gear-shaped ring.
- **Sweet Tooth:** a faint ring of little gears turning around her instead of honey drips.
- **Take Wing:** the bee's exhaust (a little pipe on its tail) puffs steam while it flies.
- **Effects:** oil drips, solder spatter, welding sparks, washers and bolts flying off on big hits, and perforated-
  hexagon ground decals (the perforated base in your reference).
- **Sounds:** wings buzz like a small two-stroke motor, metal tings on hits, an oil-can glug, an arc-welder crackle
  for Royal Jelly.
- **Palette:** gunmetal and polished steel, brass, and black oil, with leather browns on Bramble. Accent: the orange
  of welding sparks.
- **Build notes:** the bee is best built as **parts** rather than one Tripo blob, so it can reticulate. Tripo the
  rider and a reference bee for proportion. Then assemble the abdomen rings, legs and wings in Blender from simple
  procedural parts (lathed rings, threaded-rod cylinders, perforated wing planes with a hex-hole alpha texture),
  rigid on the existing bones. The perforated wings use the alpha texture, not geometry, to stay cheap. Ladle →
  spanner prop on hand_R.
- **Costume name:** `rider@tinker`. Announcer: "Bramble and the TINKER'S HIVE!"

---

## Pipeline and order

Order: **Gristle** (one body, a mallet and a millstone, and its inner glow ties to Grit and Dig In), then **Hoot** (adds a costume structure),
then **Brindle**, **Bramble** (the parts-built bee is the most Blender work), and **Kelp** last (the glass shell and
the water line need new shader work).

For each remodel:

1. **Concept sheet:** an image-model concept from the brief above
   (`fal-ai/nano-banana-pro/edit` with the current model render as a proportion reference), front view, neutral pose.
2. **3D:** Tripo image-to-3d (`tripo3d/p1/image-to-3d`) for the body and each held prop. Bramble's bee is assembled
   from parts instead; Kelp's glass shell is a separate mesh.
3. **Build:** a `tools/blender/tripo_heroes/<hero>_<costume>.py` config in the style of `friar_celadon.py` /
   `raider_sporeblight.py`, on the existing rig and clips, with `snap_grips` / `curl_grip_fingers` / `palm_twist`
   for held props. Run with `blender -b --python tools/blender/build_tripo_hero.py -- <hero>_<costume>`.
4. **Costume entry:** the model costume in `data/heroes.json`; costume props (`lookout@gamemaster`,
   `honeypot@tinker`, etc.); prop repaints where a prop is shared.
5. **Effects:** a themed effects atlas through `tools/fx-prompts/` plus HQ paintings, portrait, select-screen stage,
   costume icon and splash card.
6. **Sounds:** costume sound overrides where the theme demands (creaking wicker, glass chime, dice, motor buzz).
7. **Code-driven looks:** Gristle's lantern glow inside the wicker tracks Grit and Dig In; Kelp's water line tracks Tide stacks;
   Bramble's abdomen rings telescope. Each is a small render-side hook in that champion's kit file, active only for
   the costume.
8. **Checks:** a headless shot at gameplay zoom in every clip, the weight paint checked in the stomp, curl and crush
   clips (the Dig In leg lesson), determinism `--check` (render only, so it should pass untouched), commit, push.

**Budget:** fal has roughly $1–2 left. Five concept sheets plus about 10 Tripo generations won't fit; the remodels
need a top-up before step 1. Until then the Blender-side work can start on Bramble's parts-built bee, which needs no
generations.
