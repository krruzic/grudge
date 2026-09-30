import atlasUrl from "../../assets/fonts/n64font_hi.png?url";
import meta from "../../assets/fonts/n64font.json";

type Glyph = { x: number; y: number; w: number; adv: number; ox: number };
const GLYPHS = meta.glyphs as Record<string, Glyph>;
const BASE = 10;
const INK = "#0b0806";
const TRACK = 0;
const MIN_SCALE = 0.64;
const HK = 6;
const eff = (scale: number) => Math.max(MIN_SCALE, scale);

let markReady: () => void = () => {};
export const fontReady = new Promise<void>((r) => (markReady = r));
let fillMask: HTMLCanvasElement | null = null;
let lineMask: HTMLCanvasElement | null = null;
const cache = new Map<string, HTMLCanvasElement>();
const widths = new Map<string, number>();

function mask(src: ImageData, channel: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
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

export async function loadFont(): Promise<void> {
  const im = new Image();
  im.src = atlasUrl;
  await im.decode();
  const c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(im, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  fillMask = mask(data, 0);
  lineMask = mask(data, 1);
  cache.clear();
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

const parseCtx = document.createElement("canvas").getContext("2d")!;
function rgba(color: string): [number, number, number, number] {
  parseCtx.fillStyle = "#000";
  parseCtx.fillStyle = color;
  const v = parseCtx.fillStyle as string;
  if (v.startsWith("#")) return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16), 1];
  const m = v.match(/[\d.]+/g)!.map(Number);
  return [m[0], m[1], m[2], m[3] ?? 1];
}

function shade([r, g, b, a]: [number, number, number, number], k: number): string {
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgba(${f(r)},${f(g)},${f(b)},${a})`;
}

function stamp(g: CanvasRenderingContext2D, src: HTMLCanvasElement, s: string, dx: number, dy: number): void {
  let pen = dx;
  for (const ch of s) {
    const gl = glyph(ch);
    g.drawImage(src, gl.x * HK, gl.y * HK, gl.w * HK, meta.h * HK, Math.round((pen - gl.ox) * HK), dy * HK, gl.w * HK, meta.h * HK);
    pen += gl.adv + TRACK;
  }
}

function layer(w: number, h: number, src: HTMLCanvasElement, s: string, dx: number, dy: number, fill: string | CanvasGradient): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  stamp(g, src, s, dx, dy);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = fill;
  g.fillRect(0, 0, w, h);
  return c;
}

const PADX = 2;
const PADY = 1;

function render(s: string, color: string, edge: boolean, shadow: boolean): HTMLCanvasElement {
  const key = `${edge ? 1 : 0}${shadow ? 1 : 0}|${color}|${s}`;
  const soft = !edge && !shadow;
  let c = cache.get(key);
  if (c) return c;
  const w = (Math.ceil(rawWidth(s)) + PADX * 2 + 3) * HK;
  const h = (meta.h + PADY * 2 + 2) * HK;
  c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const col = rgba(color);
  if (shadow || soft) {
    g.globalAlpha = (soft ? 0.28 : 0.55) * col[3];
    g.drawImage(layer(w, h, edge ? lineMask! : fillMask!, s, PADX + (soft ? 1 : 2), PADY + (soft ? 1 : 2), INK), 0, 0);
    g.globalAlpha = 1;
  }
  if (edge) g.drawImage(layer(w, h, lineMask!, s, PADX, PADY, INK), 0, 0);
  const grad = g.createLinearGradient(0, (PADY + 2) * HK, 0, (PADY + meta.base) * HK);
  grad.addColorStop(0, shade(col, edge ? 0.35 : 0.12));
  grad.addColorStop(0.55, shade(col, 0));
  grad.addColorStop(1, shade(col, edge ? -0.28 : -0.12));
  g.drawImage(layer(w, h, fillMask!, s, PADX, PADY, grad), 0, 0);
  if (cache.size > 1200) cache.clear();
  cache.set(key, c);
  return c;
}

let lowCtx: CanvasRenderingContext2D | null = null;
let hiCtx: CanvasRenderingContext2D | null = null;
let hiK = 1;
let lowK = 1;

export function setTextLayer(low: CanvasRenderingContext2D, hi: CanvasRenderingContext2D, hk: number, lk: number): void {
  lowCtx = low;
  hiCtx = hi;
  hiK = hk;
  lowK = lk;
}

export function onHiLayer(ctx: CanvasRenderingContext2D, fn: (c: CanvasRenderingContext2D) => void): void {
  if (ctx !== lowCtx || !hiCtx) {
    fn(ctx);
    return;
  }
  const m = ctx.getTransform();
  const r = hiK / lowK;
  hiCtx.save();
  hiCtx.setTransform(m.a * r, m.b * r, m.c * r, m.d * r, m.e * r, m.f * r);
  hiCtx.globalAlpha = ctx.globalAlpha;
  fn(hiCtx);
  hiCtx.restore();
}

const SOFT = 2.2;
const soft = new Map<HTMLCanvasElement, Map<number, HTMLCanvasElement>>();
function softened(c: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const key = Math.round(k * 20);
  let byK = soft.get(c);
  if (!byK) {
    if (soft.size > 1500) soft.clear();
    byK = new Map();
    soft.set(c, byK);
  }
  let o = byK.get(key);
  if (!o) {
    o = document.createElement("canvas");
    o.width = Math.max(1, Math.round((c.width / HK) * k * SOFT));
    o.height = Math.max(1, Math.round((c.height / HK) * k * SOFT));
    const g = o.getContext("2d")!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(c, 0, 0, o.width, o.height);
    byK.set(key, o);
  }
  return o;
}

function blit(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale: number, edge: boolean, shadow: boolean): void {
  if (!fillMask || !s) return;
  const c = render(s, color, edge, shadow);
  scale = eff(scale);
  const k = (BASE * scale) / meta.px;
  onHiLayer(ctx, (t) => {
    const smooth = t.imageSmoothingEnabled;
    const q = t.imageSmoothingQuality;
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(softened(c, k), x - PADX * k, y - PADY * k - 0.5 * scale, (c.width / HK) * k, (c.height / HK) * k);
    t.imageSmoothingEnabled = smooth;
    t.imageSmoothingQuality = q;
  });
}

export function drawText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1, outline: string | boolean = false): void {
  blit(ctx, s, x, y, color, scale, !!outline, true);
}

export function drawNum(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1): void {
  blit(ctx, s, x, y, color, scale, true, true);
}

export function drawPlain(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1, _num = false): void {
  blit(ctx, s, x, y, color, scale, false, false);
}

export function occlude(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dim = 0): void {
  onHiLayer(ctx, (t) => {
    if (dim > 0) {
      t.globalCompositeOperation = "source-atop";
      t.fillStyle = `rgba(0,0,0,${dim})`;
      t.fillRect(-1e4, -1e4, 2e4, 2e4);
    }
    t.globalCompositeOperation = "destination-out";
    t.fillStyle = "#000";
    t.fillRect(x - 4, y - 4, w + 10, h + 10);
  });
}
