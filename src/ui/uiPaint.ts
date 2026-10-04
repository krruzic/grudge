// UI paint kit: the shared hand-painted building blocks every menu, screen and HUD panel is made of
// (textured rects, parchment cards, wood beams and plates, wax seals, ribbons, pins, painted titles
// from the title font, framed windows onto the live 3D view). Everything draws in UI layout units into the one
// UI canvas (see UiCanvas in hud/canvas.ts); expensive plates are baked once per device scale and cached.
import stoneUrl from "../../assets/textures/ui_stone.png?url";
import ridgeUrl from "../../assets/textures/ui_ridge.png?url";
import goldUrl from "../../assets/textures/gold.png?url";
import woodUrl from "../../assets/textures/wood.png?url";
import leatherUrl from "../../assets/textures/leather.png?url";
import brickUrl from "../../assets/textures/brick.png?url";
import clothUrl from "../../assets/textures/cloth.png?url";
import ironUrl from "../../assets/textures/iron.png?url";
import parchUrl from "../../assets/textures/ui_parchment.png?url";
import bannerUrl from "../../assets/textures/banner.png?url";
import { engravedIcon } from "./icons";

import titleFontUrl from "../../assets/fonts/PirataOne.ttf?url";

// ── Painted titles ──
// Screen titles and menu words composed at runtime from the carved title font (PirataOne + gold leaf).

const KEY_TEXT: Record<string, string> = {
  t_champion: "CHOOSE YOUR CHAMPION",
  t_field: "CHOOSE THE FIELD",
  t_rules: "RULES OF COMBAT",
  t_records: "HALL OF GRUDGES",
  t_tag: "SIGN YOUR NAME",
  t_1v1: "1 VS 1",
  t_2v2: "2 VS 2",
  t_ffa: "FREE FOR ALL",
  t_host: "HOST A BATTLE",
  t_join: "JOIN A BATTLE",
  m_fight: "FIGHT",
  m_network: "VERSUS ONLINE",
  m_rules: "RULES",
  m_records: "RECORDS",
  m_options: "OPTIONS",
  m_controls: "CONTROLS",
  m_loading: "NOW LOADING",
};
const titleCache = new Map<string, HTMLCanvasElement>();
let titleReady = false;
const titleFace = new FontFace("GrudgeTitle", `url(${titleFontUrl})`);
titleFace
  .load()
  .then((f) => {
    document.fonts.add(f);
    titleReady = true;
    titleCache.clear();
  })
  .catch(() => {});

const goldLeaf = new Image();
goldLeaf.src = goldUrl;

function titleArt(text: string): HTMLCanvasElement | null {
  if (!titleReady) return null;
  const s = text.toUpperCase();
  const hit = titleCache.get(s);
  if (hit) return hit;
  const cap = 96;
  const font = `400 ${Math.round(cap / 0.66)}px GrudgeTitle`;
  const track = cap * 0.035;
  const m = cacheCanvas().getContext("2d")!;
  m.font = font;
  let w = 0;
  for (const ch of s) w += m.measureText(ch).width + track;
  w -= track;
  const pad = Math.round(cap * 0.16);
  const c = cacheCanvas();
  c.width = Math.ceil(w + pad * 2);
  c.height = Math.ceil(cap * 1.32 + pad * 2);
  const g = c.getContext("2d")!;
  const base = Math.round(c.height / 2 + cap / 2);
  const glyphs = (ctx: CanvasRenderingContext2D, dx = 0, dy = 0) => {
    let x = pad + dx;
    for (const ch of s) {
      ctx.fillText(ch, x, base + dy);
      x += ctx.measureText(ch).width + track;
    }
  };
  const ink = cacheCanvas();
  ink.width = c.width;
  ink.height = c.height;
  const k = ink.getContext("2d")!;
  k.font = font;
  k.textBaseline = "alphabetic";
  const grad = k.createLinearGradient(0, base - cap, 0, base);
  grad.addColorStop(0, "#f6dc8a");
  grad.addColorStop(0.45, "#e2b452");
  grad.addColorStop(0.55, "#d29e3c");
  grad.addColorStop(1, "#b88430");
  k.fillStyle = grad;
  glyphs(k);
  if (goldLeaf.complete && goldLeaf.naturalWidth) {
    k.globalCompositeOperation = "source-atop";
    k.globalAlpha = 0.35;
    const pat = k.createPattern(goldLeaf, "repeat");
    if (pat) {
      pat.setTransform(new DOMMatrix().scale(2.5));
      k.fillStyle = pat;
      k.fillRect(0, 0, ink.width, ink.height);
    }
    k.globalAlpha = 1;
    k.globalCompositeOperation = "source-over";
  }
  g.font = font;
  g.textBaseline = "alphabetic";
  g.save();
  g.shadowColor = "rgba(20, 10, 2, 0.75)";
  g.shadowBlur = cap * 0.06;
  g.shadowOffsetY = cap * 0.05;
  g.fillStyle = "#5a3a10";
  glyphs(g);
  g.restore();
  g.lineJoin = "round";
  g.lineWidth = cap * 0.035;
  g.strokeStyle = "rgba(60, 36, 8, 0.85)";
  let x = pad;
  for (const ch of s) {
    g.strokeText(ch, x, base);
    x += g.measureText(ch).width + track;
  }
  g.drawImage(ink, 0, 0);
  titleCache.set(s, c);
  return c;
}

export function nameImage(key: string): HTMLCanvasElement | null {
  if (key.startsWith("!")) return titleArt(key.slice(1));
  return titleArt(KEY_TEXT[key] ?? key.replace(/^[tm]_/, "").replace(/_/g, " "));
}
import { drawPlain, textWidth } from "./font";
import { cacheCanvas } from "./cacheCanvas";

// ── Textures and textured rects ──

const INK = "#0b0806";
const imgs: Record<string, HTMLImageElement> = {};
for (const [k, u] of Object.entries({
  stone: stoneUrl,
  ridge: ridgeUrl,
  gold: goldUrl,
  wood: woodUrl,
  leather: leatherUrl,
  brick: brickUrl,
  cloth: clothUrl,
  iron: ironUrl,
  parch: parchUrl,
  banner: bannerUrl,
})) {
  const im = new Image();
  im.src = u;
  imgs[k] = im;
}

// Image patterns are CPU-backed. Chrome permanently drops a GPU canvas to software raster the first time it
// fillRects with one, so pattern() is only ever used inside bake callbacks (texturedRect, bakedPlate), which
// paint into CPU cache canvases. Never set a pattern fill on the UI canvas directly.
function pattern(ctx: CanvasRenderingContext2D, key: string, scale = 1, ox = 0, oy = 0): CanvasPattern | string {
  const im = imgs[key];
  if (!im || !im.complete || !im.naturalWidth) return "#303030";
  const p = ctx.createPattern(im, "repeat")!;
  p.setTransform(new DOMMatrix().translate(ox, oy).scale(scale));
  return p;
}

function withClip(ctx: CanvasRenderingContext2D, path: () => void, body: () => void): void {
  ctx.save();
  ctx.beginPath();
  path();
  ctx.clip();
  body();
  ctx.restore();
}

const bakes = new Map<string, HTMLCanvasElement>();
export function uiImagesReady(): boolean {
  return Object.values(imgs).every((im) => im.complete && im.naturalWidth > 0);
}

export function texturedRect(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  tint: string | null,
  r = 3,
  scale = 1,
): void {
  const im = imgs[key];
  if (w <= 0 || h <= 0) return;
  if (!im || !im.complete || !im.naturalWidth) {
    ctx.fillStyle = "#303030";
    ctx.fillRect(x, y, w, h);
    return;
  }
  const m = ctx.getTransform();
  const k = Math.max(1, Math.hypot(m.a, m.b));
  const pw = Math.max(1, Math.ceil(w * k));
  const ph = Math.max(1, Math.ceil(h * k));
  const id = `${key}|${pw}|${ph}|${tint}|${r}|${scale}|${k.toFixed(2)}`;
  let c = bakes.get(id);
  if (!c) {
    c = cacheCanvas();
    c.width = pw;
    c.height = ph;
    const g = c.getContext("2d")!;
    g.scale(pw / w, ph / h);
    bakeRect(g, key, w, h, tint, r, scale);
    bakes.set(id, c);
    if (bakes.size > 400) {
      const old = bakes.keys().next().value!;
      const oc = bakes.get(old)!;
      oc.width = oc.height = 0;
      bakes.delete(old);
    }
  } else {
    bakes.delete(id);
    bakes.set(id, c);
  }
  ctx.drawImage(c, x, y, w, h);
}

function bakeRect(
  ctx: CanvasRenderingContext2D,
  key: string,
  w: number,
  h: number,
  tint: string | null,
  r: number,
  scale: number,
): void {
  const x = 0;
  const y = 0;
  withClip(
    ctx,
    () => ctx.roundRect(x, y, w, h, r),
    () => {
      ctx.fillStyle = pattern(ctx, key, scale, x, y);
      ctx.fillRect(x, y, w, h);
      if (tint) {
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = tint;
        ctx.fillRect(x, y, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    },
  );
}

export function woodDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  bakedPlate(ctx, `disc|${r}`, cx - r, cy - r, r * 2, r * 2, (g) =>
    withClip(
      g,
      () => g.arc(r, r, r, 0, Math.PI * 2),
      () => {
        g.imageSmoothingEnabled = true;
        g.fillStyle = pattern(g, "wood", r / 40, 0, 0);
        g.fillRect(0, 0, r * 2, r * 2);
      },
    ),
  );
  ctx.strokeStyle = "rgba(20,10,4,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,220,160,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy + 1, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
}

export function shadowText(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  num = false,
): void {
  const d = Math.max(0.8, scale * 0.9);
  drawPlain(ctx, s, x + d, y + d, INK, scale, num);
  drawPlain(ctx, s, x, y, color, scale, num);
}

export function goldArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, s = 6): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x + dir * (s + 1.5), y);
  ctx.lineTo(x - dir * 1.5, y - s - 1.5);
  ctx.lineTo(x - dir * 1.5, y + s + 1.5);
  ctx.closePath();
  ctx.fill();
  const e = s + 2;
  bakedPlate(ctx, `arrow|${dir}|${s}`, x - e, y - e, e * 2, e * 2, (g) =>
    withClip(
      g,
      () => {
        g.moveTo(e + dir * s, e);
        g.lineTo(e, e - s);
        g.lineTo(e, e + s);
        g.closePath();
      },
      () => {
        g.imageSmoothingEnabled = true;
        g.fillStyle = pattern(g, "gold", 0.3, 2, 2);
        g.fillRect(0, 0, e * 2, e * 2);
      },
    ),
  );
}

export function band(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha = 1,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

export function wall(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  bakedPlate(ctx, "wall", 0, 0, W, H, (g) => {
    g.imageSmoothingEnabled = true;
    g.fillStyle = pattern(g, "brick", 1.4);
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "#6a6070";
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
  });
}

export function boardBg(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  bakedPlate(ctx, "board", 0, 0, W, H, (g) => {
    g.fillStyle = pattern(g, "wood", 1.4, 0, 0);
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(40,22,10,0.55)";
    g.fillRect(0, 0, W, H);
    for (let y = 22; y < H; y += 26) {
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(0, y, W, 1);
      g.fillStyle = "rgba(255,220,170,0.06)";
      g.fillRect(0, y + 1, W, 1);
    }
    const v = g.createRadialGradient(W / 2, H * 0.5, H * 0.2, W / 2, H * 0.5, W * 0.65);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(8,4,2,0.7)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  });
}

export function woodFloor(ctx: CanvasRenderingContext2D, y: number, W: number, H: number, tint = "#8a6448"): void {
  texturedRect(ctx, "wood", 0, y, W, H - y, tint, 0, 1.2);
  band(ctx, 0, y, W, 2, INK, 0.8);
}

export function beam(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  band(ctx, x + 2, y + h, w - 4, 3, INK, 0.45);
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  texturedRect(ctx, "wood", x, y, w, h, "#c89868", 0, 0.7);
  band(ctx, x, y, w, 1, "#f0d0a0", 0.35);
  for (const nx of [x + 6, x + w - 6]) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(nx, y + h / 2, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8a8a90";
    ctx.beginPath();
    ctx.arc(nx, y + h / 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Titles, shields, ribbons, banners, seals ──

export function artTitle(
  ctx: CanvasRenderingContext2D,
  key: string,
  fallback: string,
  cx: number,
  y: number,
  h: number,
): void {
  const im = nameImage(key);
  if (!im) {
    paintedText(ctx, fallback, cx, y + (h - 11) / 2, "#f0c030", 1.15);
    return;
  }
  const w = (im.width / im.height) * h;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(im, cx - w / 2, y, w, h);
  ctx.restore();
}

export function paintedText(
  ctx: CanvasRenderingContext2D,
  s: string,
  cx: number,
  y: number,
  color: string,
  scale: number,
): void {
  shadowText(ctx, s, cx - textWidth(s, scale, true) / 2, y, color, scale, true);
}

const plates = new Map<string, HTMLCanvasElement>();
function bakedPlate(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
): void {
  const m = ctx.getTransform();
  const k = Math.max(1, Math.hypot(m.a, m.b));
  const key = `${id}|${w.toFixed(2)}|${h.toFixed(2)}|${k.toFixed(2)}`;
  let c = plates.get(key);
  if (!c) {
    c = cacheCanvas();
    c.width = Math.max(1, Math.ceil(w * k));
    c.height = Math.max(1, Math.ceil(h * k));
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.scale(c.width / w, c.height / h);
    draw(g);
    plates.set(key, c);
    if (plates.size > 300) {
      const old = plates.keys().next().value!;
      plates.get(old)!.width = 0;
      plates.delete(old);
    }
  }
  ctx.drawImage(c, x, y, w, h);
}

export function ribbon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  w: number,
  h: number,
  text: string,
  scale: number,
  color = "#3a2410",
  art: HTMLCanvasElement | null = null,
): void {
  const x = cx - w / 2;
  bakedPlate(ctx, `ribbon|${art ? 1 : 0}`, x - 8, y - 2, w + 16, h + 8, (g) => ribbonPlate(g, 8, 2, w, h, !!art));
  if (art) {
    const ah = h + 3;
    const aw = Math.min(w - 2, (art.width / art.height) * ah);
    const dh = aw * (art.height / art.width);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(art, cx - aw / 2, y + (h - dh) / 2, aw, dh);
    ctx.restore();
    return;
  }
  const tw = textWidth(text, scale, true);
  drawPlain(ctx, text, cx - tw / 2, y + (h - 10 * scale) / 2 + 0.3, color, scale, true);
}

function ribbonPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dark: boolean): void {
  const stain = dark ? "rgba(60,30,12,0.78)" : "rgba(90,50,20,0.45)";
  for (const side of [-1, 1]) {
    const ex = side < 0 ? x - 5 : x + w + 5;
    const ix = side < 0 ? x + 3 : x + w - 3;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(ix, y + 2.5);
    ctx.lineTo(ex, y + 2.5);
    ctx.lineTo(ex - side * 3, y + 2.5 + h / 2);
    ctx.lineTo(ex, y + h + 2.5);
    ctx.lineTo(ix, y + h + 2.5);
    ctx.closePath();
    ctx.fill();
    withClip(
      ctx,
      () => {
        ctx.moveTo(ix, y + 3.5);
        ctx.lineTo(ex + side * -1, y + 3.5);
        ctx.lineTo(ex - side * 3.8, y + 2.5 + h / 2);
        ctx.lineTo(ex + side * -1, y + h + 1.5);
        ctx.lineTo(ix, y + h + 1.5);
        ctx.closePath();
      },
      () => {
        ctx.fillStyle = pattern(ctx, "parch", 1, x, y);
        ctx.fillRect(ex - 8, y, 16 + Math.abs(ix - ex), h + 6);
        ctx.fillStyle = stain;
        ctx.fillRect(ex - 8, y, 16 + Math.abs(ix - ex), h + 6);
      },
    );
  }
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  texturedRect(ctx, "parch", x, y, w, h, null, 0, 1);
  if (dark) {
    ctx.fillStyle = "rgba(60,30,12,0.7)";
    ctx.fillRect(x, y, w, h);
  }
}

export function waxSeal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  glyph: string,
): void {
  const blob = (rr: number) => {
    for (let k = 0; k <= 36; k++) {
      const a = (k / 36) * Math.PI * 2;
      const q = rr * (1 + 0.09 * Math.sin(a * 7) + 0.05 * Math.sin(a * 3 + 1));
      if (k === 0) ctx.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
      else ctx.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
    }
    ctx.closePath();
  };
  ctx.fillStyle = INK;
  ctx.beginPath();
  blob(r + 1.3);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  blob(r);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,200,180,0.3)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy + 0.8, r * 0.68, 0, Math.PI * 2);
  ctx.stroke();
  engravedIcon(ctx, glyph, cx, cy, r * 0.95, "rgba(40,0,0,0.75)");
}

/** A brass-headed pin; several colours split the head into equal wedges (e.g. everyone who picked a card). */
export function pin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string | string[]): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, 3.6, 0, Math.PI * 2);
  ctx.fill();
  const cols = Array.isArray(color) ? color : [color];
  cols.forEach((c, i) => {
    const a0 = -Math.PI / 2 + (i / cols.length) * Math.PI * 2;
    const a1 = -Math.PI / 2 + ((i + 1) / cols.length) * Math.PI * 2;
    ctx.fillStyle = c;
    ctx.beginPath();
    if (cols.length > 1) ctx.moveTo(x, y);
    ctx.arc(x, y, 2.6, a0, a1);
    ctx.fill();
  });
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillRect(x - 1.5, y - 1.5, 1.2, 1.2);
}

export function parchment(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  band(ctx, x + 3, y + 4, w, h, INK, 0.4);
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  texturedRect(ctx, "parch", x, y, w, h, null, 0, 1.3);
  ctx.strokeStyle = "rgba(110,70,30,0.45)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
}

// ── Board pieces: logo, cards, insets, live windows, tags ──

const logo = new Image();
logo.src = `${import.meta.env.BASE_URL}loading/logo.png`;

export function drawLogo(ctx: CanvasRenderingContext2D, cx: number, y: number, h: number): void {
  if (!logo.complete || !logo.naturalWidth) {
    paintedText(ctx, "GRUDGE", cx, y + h / 2 - 12, "#c83020", 2.4);
    return;
  }
  const w = (logo.naturalWidth / logo.naturalHeight) * h;
  smoothImage(ctx, logo, cx - w / 2, y, w, h);
}

export function card(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tilt: number,
  pinColor: string | string[] | null,
  body: () => void,
): void {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);
  parchment(ctx, 0, 0, w, h);
  body();
  if (pinColor && pinColor.length) pin(ctx, w / 2, 3, pinColor);
  ctx.restore();
}

export function inset(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | null = "#2a1a0a",
): void {
  ctx.fillStyle = "#2a1a0a";
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
}

export const liveWindow: { rect: [number, number, number, number] | null } = { rect: null };

/** Records a framed rect (in layout units) where the 3D scene should render this frame; read by app/loop.ts. */
export function markWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const m = ctx.getTransform();
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const cx = m.a * (x + w / 2) + m.c * (y + h / 2) + m.e;
  const cy = m.b * (x + w / 2) + m.d * (y + h / 2) + m.f;
  // Axis-aligned bounds of the (possibly tilted) hole, so the 3D view fills it corner to corner; the paper drawn
  // around the hole covers the overflow.
  const hw = (Math.abs(m.a) * w + Math.abs(m.c) * h) / 2 + 2;
  const hh = (Math.abs(m.b) * w + Math.abs(m.d) * h) / 2 + 2;
  liveWindow.rect = [(cx - hw) / cw, (cy - hh) / ch, (hw * 2) / cw, (hh * 2) / ch];
}

export function windowCut(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  markWindow(ctx, x, y, w, h);
  ctx.fillStyle = "#2a1a0a";
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.clearRect(x, y, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "rgba(0,0,0,0.25)");
  g.addColorStop(0.2, "rgba(0,0,0,0)");
  g.addColorStop(0.8, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

export function boardTitle(ctx: CanvasRenderingContext2D, W: number, key: string, fallback: string): void {
  beam(ctx, 4, 2, W - 8, 17);
  artTitle(ctx, key, fallback, W / 2, 2, 16);
}

export function tag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  sel: boolean,
  k: number,
  body: () => void,
): void {
  card(ctx, x - (sel ? 8 : 0), y, w, h, sel ? 0 : k % 2 ? 0.025 : -0.025, sel ? "#c81818" : "#8a8a90", body);
  if (sel) goldArrow(ctx, x - 14, y + h / 2, -1, 6);
}

/** Draws an image with high-quality smoothing (for art downscaled from a larger source). */
export function smoothImage(
  ctx: CanvasRenderingContext2D,
  im: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(im, x, y, w, h);
  ctx.restore();
}
