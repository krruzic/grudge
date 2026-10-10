// Game font: the hand-drawn bitmap face used for all UI text.
// The atlas (gameFont.png) holds each glyph at HK× its layout size, with fill in the red channel and a dilated
// outline in green. A string is stamped once into a scratch canvas at atlas resolution, tinted (gradient fill,
// ink outline, drop shadow), then downsampled with high-quality smoothing to the exact device-pixel size it will
// be drawn at, and cached. Drawing is a single drawImage into the caller's context, in layout units.
import atlasUrl from "../../assets/fonts/gameFont.png?url";
import meta from "../../assets/fonts/gameFont.json";
import { perf } from "../perf";
import { cacheCanvas } from "./cacheCanvas";

type Glyph = { x: number; y: number; w: number; adv: number; ox: number };
const GLYPHS = meta.glyphs as Record<string, Glyph>;
const BASE = 10;
const INK = "#0b0806";
const TRACK = 0;
const MIN_SCALE = 0.64;
/** Atlas pixels per font pixel. */
const HK = 6;
const eff = (scale: number) => Math.max(MIN_SCALE, scale);

let markReady: () => void = () => {};
export const fontReady = new Promise<void>((r) => (markReady = r));
let fillMask: HTMLCanvasElement | null = null;
let lineMask: HTMLCanvasElement | null = null;
const cache = new Map<string, Baked>();
const widths = new Map<string, number>();

function mask(src: ImageData, channel: number): HTMLCanvasElement {
  const c = cacheCanvas();
  c.width = src.width;
  c.height = src.height;
  const out = new ImageData(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    out.data[i] = out.data[i + 1] = out.data[i + 2] = 255;
    out.data[i + 3] = src.data[i + channel];
  }
  c.getContext("2d")!.putImageData(out, 0, 0);
  return c;
}

// ── Atlas ──

export async function loadFont(): Promise<void> {
  const im = new Image();
  im.src = atlasUrl;
  await im.decode();
  const c = cacheCanvas();
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  fillMask = mask(data, 0);
  lineMask = mask(data, 1);
  for (const b of cache.values()) b.c.width = b.c.height = 0;
  cache.clear();
  families.clear();
  widths.clear();
  markReady();
}

function glyph(ch: string): Glyph {
  return GLYPHS[ch] ?? GLYPHS[ch.toUpperCase()] ?? GLYPHS["?"];
}

function rawWidth(s: string): number {
  let w = widths.get(s);
  if (w === undefined) {
    w = 0;
    for (const ch of s) w += glyph(ch).adv + TRACK;
    w = Math.max(0, w - TRACK);
    if (widths.size > 3000) widths.clear();
    widths.set(s, w);
  }
  return w;
}

export function textWidth(s: string, scale = 1, _num = false): number {
  return rawWidth(s) * ((BASE * eff(scale)) / meta.px);
}

const parseCtx = cacheCanvas().getContext("2d")!;
function rgba(color: string): [number, number, number, number] {
  parseCtx.fillStyle = "#000";
  parseCtx.fillStyle = color;
  const v = parseCtx.fillStyle as string;
  if (v.startsWith("#"))
    return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
  const m = v.match(/[\d.]+/g)!.map(Number);
  return [m[0], m[1], m[2], m[3] ?? 1];
}

function shade([r, g, b, a]: [number, number, number, number], k: number): string {
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

/** Stamps `s`'s glyphs from the atlas (HK px per font px) into `g` at `S` px per font px. */
function stamp(
  g: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  s: string,
  dx: number,
  dy: number,
  S: number,
): void {
  let pen = dx;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  for (const ch of s) {
    const gl = glyph(ch);
    g.drawImage(
      src,
      gl.x * HK,
      gl.y * HK,
      gl.w * HK,
      meta.h * HK,
      Math.round((pen - gl.ox) * S),
      dy * S,
      gl.w * S,
      meta.h * S,
    );
    pen += gl.adv + TRACK;
  }
}

const scratch = [cacheCanvas(), cacheCanvas()];
/**
 * Scratch canvas i sized exactly w x h. Not grown-and-kept: the bake's final high-quality downsample processes
 * the whole source canvas, so after one long banner every later bake got ~4x slower (measured 1.7 -> 6.5 ms).
 */
function scratchCtx(i: number, w: number, h: number): CanvasRenderingContext2D {
  const c = scratch[i];
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.clearRect(0, 0, c.width, c.height);
  return g;
}

function layer(
  w: number,
  h: number,
  src: HTMLCanvasElement,
  s: string,
  dx: number,
  dy: number,
  fill: string | CanvasGradient,
  S: number,
): HTMLCanvasElement {
  const g = scratchCtx(1, w, h);
  const c = scratch[1];
  stamp(g, src, s, dx, dy, S);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  return c;
}

const PADX = 2;
const PADY = 1;

// ── Baking ──

/** A tinted string, rasterised at `c.width / (w / HK)` device pixels per font pixel. `w`/`h` are atlas-scale size. */
type Baked = { c: HTMLCanvasElement; w: number; h: number };
const CACHE_MAX = 1500;
/** Every size baked recently per string + style ("family"), and when its last bake was (see render). */
const families = new Map<string, { at: number; sizes: number[] }>();
const BAKES_PER_FRAME = 8;
let budgetAt = 0;
let budgetLeft = BAKES_PER_FRAME;
/** Which layers a bake holds: all of them (whole strings), or one (per-glyph number parts, see drawNum). */
type Part = "all" | "shadow" | "edge" | "fill";

// A lost 2D context empties every canvas; drop the cache and let text-texture owners repaint.
const flushers: (() => void)[] = [];
export function onTextLost(fn: () => void): void {
  flushers.push(fn);
}
function flushText(): void {
  cache.clear();
  families.clear();
  for (const f of flushers) f();
}

/** `k` = font pixels → layout units; `ppu` = device pixels per layout unit of the target context. */
function render(
  s: string,
  color: string,
  edge: boolean,
  shadow: boolean,
  k: number,
  ppu: number,
  part: Part = "all",
): Baked {
  // Bake at the device size it will be drawn at (never above atlas resolution; larger draws upscale smoothly).
  // The bake only depends on that size (px), not on the layout scale it is drawn at.
  const px = Math.min(HK, Math.round(k * ppu * 8) / 8);
  const fam = `${edge ? 1 : 0}${shadow ? 1 : 0}${part}|${color}|${s}`;
  const key = `${px}|${fam}`;
  const soft = !edge && !shadow;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  // Text whose size is animating (pop-in banners, callouts) would bake again every frame: while its last bake is
  // recent, or this frame already baked a lot, draw the nearest existing size scaled instead. Once it holds still
  // it gets its exact bake.
  const now = performance.now();
  if (now - budgetAt > 12) {
    budgetAt = now;
    budgetLeft = BAKES_PER_FRAME;
  }
  const f = families.get(fam);
  if (f && (now - f.at < 250 || budgetLeft <= 0)) {
    let best: Baked | undefined;
    let bestD = Infinity;
    for (const p of f.sizes) {
      const b = cache.get(`${p}|${fam}`);
      // Prefer downscaling (sharper) over upscaling.
      const d = p >= px ? p / px : (2 * px) / p;
      if (b && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (best) return best;
  }
  budgetLeft--;
  if (f) {
    f.at = now;
    if (!f.sizes.includes(px)) f.sizes.push(px);
    if (f.sizes.length > 8) f.sizes.shift();
  } else {
    if (families.size > 4000) families.clear();
    families.set(fam, { at: now, sizes: [px] });
  }
  perf.stat("hud.text", 1);
  // Composite at S px per font px - about twice the final size, not the atlas's HK - then downsample: the same
  // look for a fraction of the pixels (a bake was 1-3 ms at HK, several times that on slow CPUs).
  const S = Math.min(HK, Math.max(2, Math.ceil(px * 2)));
  const w0 = Math.ceil(rawWidth(s)) + PADX * 2 + 3;
  const h0 = meta.h + PADY * 2 + 2;
  const w = w0 * S;
  const h = h0 * S;
  const g = scratchCtx(0, w, h);
  const c = scratch[0];
  const col = rgba(color);
  if ((shadow || soft) && (part === "all" || part === "shadow")) {
    g.globalAlpha = (soft ? 0.28 : 0.55) * col[3];
    g.drawImage(
      layer(w, h, edge ? lineMask! : fillMask!, s, PADX + (soft ? 1 : 2), PADY + (soft ? 1 : 2), INK, S),
      0,
      0,
      w,
      h,
      0,
      0,
      w,
      h,
    );
    g.globalAlpha = 1;
  }
  if (edge && (part === "all" || part === "edge"))
    g.drawImage(layer(w, h, lineMask!, s, PADX, PADY, INK, S), 0, 0, w, h, 0, 0, w, h);
  if (part === "all" || part === "fill") {
    const grad = g.createLinearGradient(0, (PADY + 2) * S, 0, (PADY + meta.base) * S);
    grad.addColorStop(0, shade(col, edge ? 0.35 : 0.12));
    grad.addColorStop(0.55, shade(col, 0));
    grad.addColorStop(1, shade(col, edge ? -0.28 : -0.12));
    g.drawImage(layer(w, h, fillMask!, s, PADX, PADY, grad, S), 0, 0, w, h, 0, 0, w, h);
  }
  const o = cacheCanvas();
  o.width = Math.max(1, Math.round(w0 * px));
  o.height = Math.max(1, Math.round(h0 * px));
  const og = o.getContext("2d")!;
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = "high";
  og.drawImage(c, 0, 0, w, h, 0, 0, o.width, o.height);
  o.addEventListener("contextlost", flushText);
  const baked = { c: o, w: w0 * HK, h: h0 * HK };
  cache.set(key, baked);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value!;
    cache.get(oldest)!.c.width = 0;
    cache.delete(oldest);
  }
  return baked;
}

export function fontLoaded(): boolean {
  return !!fillMask;
}

// ── Drawing ──

function blit(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale: number,
  edge: boolean,
  shadow: boolean,
): void {
  if (!fillMask || !s) return;
  if (s.length > 1 && numeric(s)) return glyphwise(ctx, s, x, y, color, scale, edge, shadow);
  scale = eff(scale);
  const k = (BASE * scale) / meta.px;
  const m = ctx.getTransform();
  const b = render(s, color, edge, shadow, k, Math.hypot(m.a, m.b));
  const smooth = ctx.imageSmoothingEnabled;
  const q = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(b.c, x - PADX * k, y - PADY * k - 0.5 * scale, (b.w / HK) * k, (b.h / HK) * k);
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = q;
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  outline: string | boolean = false,
): void {
  blit(ctx, s, x, y, color, scale, !!outline, true);
}

/**
 * Strings with numbers in them change all the time (gold, timers, damage, FPS), so instead of baking each new
 * string they are drawn glyph by glyph from cached one-character bakes: every glyph's shadow, then every outline,
 * then every fill, which stacks the layers the same way a whole-string bake does.
 */
/**
 * Number-like strings (digits with at most 3 letters: "1234", "+3.5/S", "2:31", "58 FPS") change all the time and
 * reuse ~20 characters, so they go glyph by glyph. Wordy strings with a number in them ("NATIVE 1080P", "RESPAWN
 * 7") bake whole: glyph by glyph they cost 3 bakes per new letter the first time they're seen.
 */
function numeric(s: string): boolean {
  if (!/\d/.test(s)) return false;
  let letters = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) letters++;
  }
  return letters <= 3;
}
function glyphwise(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale: number,
  edge: boolean,
  shadow: boolean,
  parts: readonly Part[] = NUM_PARTS,
): void {
  scale = eff(scale);
  const k = (BASE * scale) / meta.px;
  const m = ctx.getTransform();
  const ppu = Math.hypot(m.a, m.b);
  const smooth = ctx.imageSmoothingEnabled;
  const q = ctx.imageSmoothingQuality;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const y0 = y - PADY * k - 0.5 * scale;
  for (const part of parts) {
    if (part === "edge" && !edge) continue;
    // Outlined text without a drop shadow has no shadow layer (plain text has a soft one).
    if (part === "shadow" && edge && !shadow) continue;
    let pen = 0;
    for (const ch of s) {
      if (ch === " ") {
        pen += glyph(ch).adv + TRACK;
        continue;
      }
      const b = render(ch, color, edge, shadow, k, ppu, part);
      ctx.drawImage(b.c, x + (pen - PADX) * k, y0, (b.w / HK) * k, (b.h / HK) * k);
      pen += glyph(ch).adv + TRACK;
    }
  }
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = q;
}
const NUM_PARTS: Part[] = ["shadow", "edge", "fill"];

/** One layer ("shadow", "edge" or "fill") of drawNum's text, for callers that stack the layers themselves. */
export function drawNumPart(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale: number,
  part: "shadow" | "edge" | "fill",
): void {
  if (fillMask && s) glyphwise(ctx, s, x, y, color, scale, true, true, [part]);
}

export function drawNum(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
): void {
  blit(ctx, s, x, y, color, scale, true, true);
}

export function drawPlain(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  _num = false,
): void {
  blit(ctx, s, x, y, color, scale, false, false);
}
