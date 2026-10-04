// Memo panels: HUD panels whose content changes rarely (team resources, player panels, standings, army orders,
// build / order crosses) are painted once into their own canvas at the UI canvas's device scale and blitted 1:1
// until their key changes. In 4-player split this cuts HUD CPU by about a third, since most of a panel's cost
// is text and sprite drawing that would otherwise repeat every frame.
//
// The key must capture everything the panel shows (rounded so animations only repaint at visible steps); the
// transform, font and UI-image readiness are appended automatically. Memo canvases are regular (GPU-backed)
// canvases because they are redrawn at runtime; nothing reads them back.
import { fontLoaded } from "../font";
import { uiImagesReady } from "../uiPaint";
import { perf } from "../../perf";

export class Memo {
  private panels = new Map<string, { c: HTMLCanvasElement; key: string; out: number }>();

  /**
   * Draws panel `id` covering the layout rect (x, y, w, h), repainting it with `draw` only when `key` changed.
   * Returns draw()'s result (e.g. the panel height), cached with the bitmap. Falls back to drawing directly
   * when the context is rotated or faded, where a 1:1 blit would not line up.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    id: string,
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    draw: (c: CanvasRenderingContext2D) => number,
  ): number {
    const m = ctx.getTransform();
    if (m.b || m.c || ctx.globalAlpha !== 1) return draw(ctx);
    const px = Math.floor(m.a * x + m.e);
    const py = Math.floor(m.d * y + m.f);
    const pw = Math.ceil(m.a * w) + 2;
    const ph = Math.ceil(m.d * h) + 2;
    const full = `${key}|${m.a},${m.d},${m.e},${m.f},${x},${y}|${fontLoaded()}|${uiImagesReady()}`;
    let panel = this.panels.get(id);
    if (!panel) {
      panel = { c: document.createElement("canvas"), key: "", out: 0 };
      this.panels.set(id, panel);
    }
    if (panel.key !== full) {
      perf.stat("hud.memo", 1);
      if (panel.c.width !== pw || panel.c.height !== ph) {
        panel.c.width = pw;
        panel.c.height = ph;
      }
      const g = panel.c.getContext("2d")!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, pw, ph);
      g.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
      g.setTransform(m.a, 0, 0, m.d, m.e - px, m.f - py);
      panel.out = draw(g);
      panel.key = full;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(panel.c, px, py);
    ctx.restore();
    return panel.out;
  }
}
