# AI-assisted model pipeline

How Wren (`marksman`) and Stig (`engineer`, plus his wrench, ballista and tesla coil) were remade. Heroes keep the
shared humanoid rig and clips; only the look comes from AI. fal credits are limited: one Nano Banana call per sheet,
one Tripo call per mesh, and at most one retry of a step if its output is unusable.

## Steps

1. **Current look.** Screenshot the existing model from 4 sides in the viewer
   (`http://localhost:5199/viewer.html?only=<hero>&yaw=<deg>&clip=idle`, see `/tmp/opencode/pw/sheet.mjs`) and
   join them into one strip (front, left, back, right). Read the hero's builder (`tools/blender/build_heroes.py`,
   `build_warlord.py`, `build_units.py`, `build_structures.py`) and codex text (`src/ui/codex.ts`) for the design.
2. **Redesign sheet.** `node tools/gen-hero-sheet.mjs sheet <current.jpg> <out.png> <prompt.txt> [style refs...]`
   (Nano Banana Pro edit, 2K 16:9). Style references: `/tmp/opencode/ai/wren_ref.jpg`, `/tmp/opencode/ai/stig_ref.jpg`.
   Prompt pattern (see `/tmp/opencode/ai/stig_prompt.txt`): name the hero, say image 1 is the rough model and the
   others are finished heroes from the same game, demand EXACTLY their art style, list every identity element to keep,
   keep the team colour blue, hands EMPTY (weapons are separate props), a clear A-pose with arms away from the body,
   four views (front, left, back, right) same size on one baseline, plain flat light grey background, no shadows,
   no text, no smoke/glow/FX. Props go on a separate sheet (3/4 view each, side by side, lots of space; see
   `/tmp/opencode/ai/props_prompt.txt`).
3. **Clean the front view.** Crop the front figure from the full-res sheet with ImageMagick; paint out anything
   that isn't the character (smoke, ground line, a weapon leaning beside them) with the background colour; keep the
   feet whole; pad with background colour.
4. **Mesh.** `FACES=15000 node tools/gen-hero-sheet.mjs mesh <front.png> <out.glb>` (Tripo P1, textured). Props:
   `FACES=3000..8000`. Copy the result to `assets/source/<name>_tripo.glb`.
5. **Inspect** the mesh from 4 sides (see `/tmp/opencode/ai/tt_tripo.py`) and slice it (`/tmp/opencode/ai/an.py`):
   Tripo characters face +X, so `yaw: -90` turns them to face -Y like every Grudge model. Tripo sometimes drops
   thin connecting parts (Stig's wrench lost its shaft; `bridge()` in build_tripo_hero.py patches a tube textured
   from a sampled texel).
6. **Rig (heroes).** Add `tools/blender/tripo_heroes/<hero>.py` with `CFG` (copy `engineer.py`/`marksman.py`):
   - `height`: total height of the mesh in metres; keep the old model's height (its `rig(...)` call).
   - `joints`: landmarks in the A-pose after scaling (x is the right/left offset, z the height). Measure from slices
     of the scaled mesh and the front image, then check the marker render.
   - `rigid`: boxes (optionally a hue range) whose parts move 100% with one bone (pets, backpacks, floating bits).
   - `team_hue` (+ optional `team_box`): faces of that hue become `team_<hero>` and their texels are greyed so the
     game dyes them.
   - `attach`: `[("fn_name", "<prop>_tripo.glb")]`, functions in the hero file using `th.import_prop(...)` and
     `th.place_on_bone(w, arm, "hand_R", grip, axis, length, at, side)`. Name weapon objects `<hero>_<thing>`.
   - `extras`: procedural charkit parts (e.g. Wren's bow), `clips`: function overriding clips from `anims.hero_clips`.
   Build with `blender -b --python tools/blender/build_tripo_hero.py -- <hero> <preview_dir>`: renders
   `<hero>_apose_*` (joint markers) and `<hero>_rest_*`, exports `assets/heroes/<hero>.glb`.
   `CLIP=attack_b FRAMES=0,3,5,7 ELEV=50` (with a preview dir) renders posed frames instead of exporting.
7. **Verify in engine.** The viewer picks up the new GLB on reload. Check idle from 4 sides, and every clip:
   `viewer.html?only=<hero>&yaw=35&clip=<clip>&t=<sec>` for run, attack_a/b/c, shoot, cast, slam, block, dodge,
   death (see `/tmp/opencode/pw/clips.mjs`). Look for torn cloth, props left behind, floating bits, weapons through
   the body, team colour missing or on the wrong parts.

## Props (non-hero)

`tools/blender/build_tripo_props.py` builds `assets/props/<name>.glb` (loaded at boot by `src/render/props.ts`,
`prop(name, team?)` clones; materials named `team*` are dyed). Animated parts are separate named nodes (the ballista
is split at its turntable into a base and a `yaw` > `tilt` turret).

## Rules

- Textures above 256 px are kept out of the hero part merger (`mergeParts`), so they stay sharp.
- Hero weapons live inside the hero GLB (rigid on a hand bone), not as runtime props.
- Keep triangles near 15k per hero, textures 1024 (props 256-512).
