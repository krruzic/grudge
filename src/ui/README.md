# UI (`src/ui`)

Everything 2D: the in-match HUD, the full-screen screens (title, champion select, field select, results), the
menus (main menu pages, pause) and the art they share. It all paints into **one canvas** over the WebGL view;
nothing here touches the simulation except by reading `World` state and events. The app (`src/app`) owns the
screen state machine and calls into this code every frame (see `src/app/loop.ts`).

## Layout

```
hud.ts              Hud: digests sim events (update) and paints the match overlay (draw); team block layout
hud/                canvas (UiCanvas, the one UI canvas), paint (INK/PAD colours, meters, pad buttons),
                    icons (painted HUD sprites, talent/stock icons, vector glyphs), memo (cached panels),
                    callouts (banners, event cards, notices, house falls), clock (clock, gate padlock, training
                    meter), relic (Grudge line + off-screen arrow), minimap (+ stock icons), panels (team head,
                    player panels, morph ring, learn cards, FFA standings), orders (army panel, order cross),
                    buildMenu (the C-stick build / shop / evolve cross)
screens.ts          Screens: title, champion select / guest lobby, field select, results (+ select types)
screens/            select (roster row, seat cards, ready banner), selectArt (stage art, ability glyphs, costume
                    icons, evolution tree), field, results (+ FFA placing), common
menus.ts            Menus: page state, input (update), page dispatch (draw), pause delegation, codex demo hook
menus/              pages (main, players, versus online, browse, controls), settings (rules / options), records,
                    codexPage, pause, controls (shared control sheet), common (types, palette, HitList)
uiPaint.ts          paint kit: textured rects, parchment cards, beams, wax seals, ribbons, painted titles,
                    windows onto the 3D view (markWindow / windowCut -> liveWindow)
font.ts             the bitmap game font (drawText outlined, drawPlain flat, drawNum numerals), baked per size
prompts.ts          button prompt rows and word wrap
cursor.ts           select-screen hand cursors and seat chips (and their online "ghost" mirroring)
nameEntry.ts        name signing keyboard          portraits.ts  offscreen 3D renders for icons / stages / maps
codex.ts            codex content                  icons.ts      vector ability icons (fallback glyphs)
cacheCanvas.ts      CPU-backed canvases for static cached art
```

## The UI canvas

- `UiCanvas` (`hud/canvas.ts`) is sized to CSS size × DPR (capped at 2160 lines) and every frame `begin()` sets a
  transform onto a **240-unit-tall logical layout** (width follows the aspect). All layout code works in those
  units; shapes, images and text rasterise at native resolution in paint order.
- Paint order per frame: HUD (`Hud.draw`), then `Screens.draw`, then `Menus.draw` / `drawPause`, then small
  overlays (net status, FPS).
- **Text** (`font.ts`) is baked once per string at the exact device-pixel size it is drawn at (read from the
  context transform) from a 6× atlas, then cached.
- **Never `fillRect` with an image pattern on the live UI canvas.** Chrome permanently demotes a GPU canvas to
  software raster the first time it does that (see `pattern()` in `uiPaint.ts`). Pattern fills only happen inside
  cached bakes (`bakedPlate` / `texturedRect`), which are drawn into `cacheCanvas()` canvases.
- `cacheCanvas()` canvases are CPU-backed (`willReadFrequently`) and for art painted once (plates, tinted icons,
  text bakes, glyphs). Canvases redrawn at runtime (memo panels, portrait live previews) stay regular GPU canvases
  and are never read back.

## Caches and why they exist

- **Memo panels** (`hud/memo.ts`): team heads, player panels, standings, army panels and crosses are painted into
  their own canvas at device scale and blitted 1:1 until their key changes (~30% less HUD CPU in 4-player split).
  Keys quantise animation (rings to 1/240 turn, whole-second cooldowns, blink phases) so they repaint rarely.
  Skipped when the context is rotated or faded.
- **Baked plates** (`uiPaint.ts`): textured backgrounds and cards per size and device scale.
- **Icon bakes**: team-tinted HUD sprites, greyed stock icons, talent icons downscaled to their exact pixel size.

## Input and ownership

The UI never reads pads directly (except `NameEntry.update`, fed one pad by the app). The app passes:
merged menu navigation (`Nav`, `app/nav.ts`), the mouse (`Pointer`), and for select screens the cursors'
actions. Mouse targets are registered while drawing (`HitList` in menus, `cursors.hits` on select / field
select) and hit-tested by the next update, so hover and clicks always match what was on screen. Ownership rules
(only the pauser drives the pause menu, only a card's owner names it or flips its camera, CPU chips can be
taken by anyone) are enforced by the app controllers, not here.

## HUD layout rules

- 1v1 / 2v2: team 0 top-left, team 1 mirrored top-right; with 3+ heroes or 3-4 split views both blocks scale
  to 0.86 / 0.74. FFA: each local house gets its own frame, other houses become standings.
- Split screen: dividers are exactly 1 device pixel; each local player's panel and crosses sit in their own view;
  the minimap moves to the screen centre with the stock icons (portrait + HP bar per hero) above it; the army panel
  is half size with 3-4 views.
