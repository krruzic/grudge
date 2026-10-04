// Offscreen canvases for static cached art (baked text, plates, icons, canvas textures).
//
// These are painted once and then only drawn from, so they are CPU-backed (`willReadFrequently`): no GPU
// surface or flushes per cache entry, a single upload the first time each is drawn or used as a texture, and
// the GPU 2D budget stays with the UI canvas. Canvases rewritten every frame (portraits.ts live previews, HUD
// memo panels) are plain GPU canvases instead, so updating them never needs a readback.

/** Creates a CPU-backed 2D canvas; later `getContext("2d")` calls return the same CPU context. */
export function cacheCanvas(w = 300, h = 150): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d", { willReadFrequently: true });
  return c;
}
