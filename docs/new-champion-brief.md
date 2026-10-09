# Brief: building a new champion (agent instructions)

You are adding ONE new playable champion to Grudge (three.js couch / online arena RTS with a hand-painted N64-ish
look). Your champion's concept is in `docs/new-champions.md` (your section only). Six agents do this in parallel,
one champion each, in separate git worktrees. Do the whole champion end to end so it can be merged and played.

## Where you work

- Your worktree and branch are given in your task (e.g. `/home/krruzic/Projects/grudge-wt/<id>`, branch
  `hero/<id>`). Work and commit ONLY there (`git commit --no-gpg-sign` if signing blocks). Never push, never touch
  the main checkout `/home/krruzic/Projects/grudge` or other worktrees, never merge.
- `node_modules` is symlinked from the main checkout. Typecheck: `pnpm exec tsc --noEmit -p .` (clean = no output).
  Format: `pnpm exec prettier --write <files>` (120 cols).
- Determinism: `nice node --experimental-transform-types --no-warnings tools/determinism.ts --check` must pass
  (your hero isn't in the baseline scenarios, so existing heroes must be unaffected).

## Machine etiquette (shared with 5 other agents, a dev server and sims)

- Prefix every heavy command with `nice` (node sims, blender, python image work). One heavy job at a time.
- Never `pkill` / `pgrep` / kill processes you didn't start; never restart the dev server on port 5199.
- If you need a browser check, run your own vite briefly with a hard timeout on YOUR port
  (`timeout 900 nice pnpm exec vite --port <yourport> --strictPort` in the background) and drive it with the headless
  playwright helper in `/tmp/opencode/newheroes/lib.mjs` (headless swiftshader: fps is meaningless). Prefer
  Blender renders and headless node sims for verification.
- Use `/tmp/opencode/<id>/` for scratch files.

## fal budget

Roughly **$5.50 for your whole champion** (key in `.env` as FAL_KEY; the main checkout's `.env` - copy it into
your worktree, never commit it). Keep a running tally in your final report. Models: `fal-ai/nano-banana-pro` and
`/edit` for images, `tripo3d/p1/image-to-3d` for meshes. Helpers: `tools/gen-asset.mjs`, `tools/gen-hero-sheet.mjs`,
`tools/gen-map-art.mjs` (sheet / tripo), `tools/gen-fx-sheets.mjs`, `tools/gen-talent-icons.mjs`. If a call
fails with 403 "Exhausted balance", stop generating and report.

## What "done" means (generate EVERYTHING the champion needs)

Use Brother Maddock (`friar`) and Wren (`marksman`) as the templates - they were the last two champions added.
Study `git show --stat 119736e` (Maddock art) and `git show --stat 5ebff2c` (Wren + Maddock playable) and the
later commits touching them (`git log --oneline -- src/sim/hero/friar.ts src/render/kits/friar.ts`), plus
`docs/decisions.md`, `docs/ai-asset-pipeline.md`, `src/sim/README.md`, `src/render/README.md`, `src/ui/README.md`.

1. **Model**: Nano Banana turnaround + painted front -> Tripo P1 body (~12-15k tris) -> rigged and skinned in
   Blender with a `tools/blender/tripo_heroes/<id>.py` script like `friar.py` (same skeleton / bone names as the
   others so shared clips work), weapon / held props as separate Tripo props attached to bones, exported to
   `assets/heroes/<id>.glb`. Check it with Blender renders from several angles.
2. **Animations**: every clip the game plays for heroes (idle, run, attack_a/b/c combo, cast, throw / slam or
   whatever your kit uses, hit, dodge, death, victory - check what `friar.py` / `charkit.py` produce and what the
   renderer requests) authored for THIS character's proportions and weapon, timed to the ability `hitAt`s.
3. **Kit in the sim**: `data/heroes.json` entry (stats tiers, `class`, `synergy`, `hooks`, `botRange`, `botPlan`,
   abilities with `bot` hints and callouts), any new ability kinds in `src/sim/hero/<id>.ts` (+ dispatch in
   `fire.ts` / `start.ts` / `update.ts` as Maddock does), the L+X dodge trick, combos, the passive. Keep the
   concept's spirit but make it fun and readable; simplify anything that doesn't fit the engine.
4. **Talents / evolutions**: entries in `data/talents.json` like the other heroes (same count and structure per
   slot, including one super evolution), plus painted talent icons (`tools/gen-talent-icons.mjs` pattern).
5. **Bot**: CPU logic so it plays the kit sensibly (bot hints, a `<id>Fight` helper in `src/sim/bot/tactics.ts`
   if needed), including deathmatch.
6. **Render**: a kit file `src/render/kits/<id>.ts` (registered in `kits/index.ts`), persistent props in
   `src/render/heroProps/` if any, ability FX. Effects use painted FX sheets (Nano Banana, `tools/fx-prompts/`,
   cut into atlases); large on-screen effects/decals get HQ dedicated art. Costume effects unique per costume.
7. **Costumes**: 3 costumes for the BODY (no secondary prop / weapon model costumes needed), named
   `<id>@<costume>` per the existing costume pipeline (`tools/costume/`), plus costume icons
   (`assets/ui/costume_icons/<id>_<costume>.png`, and `<id>_classic.png`).
8. **UI art**: ability glyph strip `assets/ui/ability_glyphs/<id>.png` (4 glyphs, a/b/r/z, same style as the
   existing sheet - use `assets/ui/abilities.png` as the style reference), portrait `assets/ui/portraits/<id>.jpg`,
   select stage backdrop `assets/ui/stages/<id>.jpg`, HUD/stock icon if heroes have one.
9. **Codex**: the champion's pages in `src/ui/codex.ts` (role, abilities with numbers, tips, evolutions), in the
   same voice and ALL CAPS style.
10. **Audio**: voice pitch-cast + line lengths (`src/audio/`), ability sound recipes in `src/audio/events.ts`
    using the existing CC0 library (`tools/sfx/manifest.py`, don't rebuild the whole library).
11. **Anything else** the earlier champions touch that yours needs (loading screen roster, results art, records,
    names, etc.) - grep for `friar` across `src/` and follow it.

## Shared files

Many files are shared (heroes.json, talents.json, codex.ts, kits/index.ts, fire.ts, types.ts, events.ts...).
Keep your edits to them additive and self-contained (append your entries, don't reorder or reformat others), so
the merge is easy. Don't change other heroes' numbers or behaviour. Don't touch the champion select layout (the
lead will lay out 14 champions).

## Verify, then report

- A headless sim where your champion fights each existing champion 1v1 on crossing a few times (see
  `/tmp/opencode/wsim/balance.ts` for how to drive World + Bot) - no crashes, abilities fire, plausible results.
- Blender renders of the model + a few animation frames; screenshots if you ran vite.
- Commit everything (code, data, assets, generator prompts and scripts) on your branch.
- Final message: what you built, the files, fal spend, what you verified, and anything unfinished or risky.
