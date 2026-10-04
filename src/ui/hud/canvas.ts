// The UI canvas: one 2D canvas over the WebGL view that every screen, menu and HUD element is painted into.
//
// It runs at native resolution (CSS size × DPR, capped at MAX_UI_PX lines). All layout code works in a logical
// space LOGICAL_H units tall (width follows the window aspect); begin() sets the context transform that maps
// those units to device pixels, so shapes, images and text rasterise at full resolution in paint order.
// The backing store is re-fitted from the window size on every begin() (no resize events, nothing stale), and
// nothing ever reads pixels back from it, so the browser keeps it GPU-accelerated. Never fill it with an image
// pattern either: Chrome then demotes it to software raster for good (see pattern() in uiPaint.ts).

/** Logical UI height in layout units. */
export const LOGICAL_H = 240;
/** Highest backing-store height in device pixels (4K); beyond that the extra fill cost buys nothing visible. */
const MAX_UI_PX = 2160;

export class UiCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Logical size in layout units. */
  w = 427;
  h = LOGICAL_H;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "hudui";
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
  }

  /** Fits the backing store to the window, clears it and returns the context in layout units. */
  begin(): CanvasRenderingContext2D {
    const dpr = window.devicePixelRatio || 1;
    const ph = Math.max(1, Math.min(MAX_UI_PX, Math.round(window.innerHeight * dpr)));
    const pw = Math.max(1, Math.round((ph * window.innerWidth) / window.innerHeight));
    this.h = LOGICAL_H;
    this.w = Math.round((LOGICAL_H * window.innerWidth) / window.innerHeight);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.clearRect(0, 0, pw, ph);
    this.ctx.setTransform(pw / this.w, 0, 0, ph / this.h, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    return this.ctx;
  }
}
