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

import titleFontUrl from "../../assets/ui/titlefont.png?url";
import titleFontMeta from "../../assets/ui/titlefont.json";

const KEY_TEXT: Record<string, string> = {
  t_champion: "CHOOSE YOUR CHAMPION", t_field: "CHOOSE THE FIELD", t_rules: "RULES OF COMBAT", t_records: "HALL OF GRUDGES",
  t_tag: "SIGN YOUR NAME", t_1v1: "1 VS 1", t_2v2: "2 VS 2", t_ffa: "FREE FOR ALL", t_host: "HOST A BATTLE", t_join: "JOIN A BATTLE",
  m_fight: "FIGHT", m_network: "VERSUS ONLINE", m_rules: "RULES", m_records: "RECORDS", m_options: "OPTIONS", m_controls: "CONTROLS", m_loading: "NOW LOADING",
};
type TGlyph = { x: number; w: number; h: number; top: number };
const TF = titleFontMeta as { cap: number; glyphs: Record<string, TGlyph> };
const titleFont = new Image();
titleFont.src = titleFontUrl;
const titleCache = new Map<string, HTMLCanvasElement>();

export function titleArt(text: string): HTMLCanvasElement | null {
  if (!titleFont.complete || !titleFont.naturalWidth) return null;
  const s = text.toUpperCase();
  const hit = titleCache.get(s);
  if (hit) return hit;
  const cap = TF.cap;
  const space = cap * 0.3;
  const track = cap * 0.02;
  let w = 0;
  for (const ch of s) w += ch === " " ? space : (TF.glyphs[ch]?.w ?? space) + track;
  const pad = 4;
  const c = document.createElement("canvas");
  c.width = Math.ceil(w - track + pad * 2);
  c.height = Math.ceil(cap * 1.25 + pad * 2);
  const g = c.getContext("2d")!;
  let x = pad;
  let n = 0;
  for (const ch of s) {
    if (ch === " ") {
      x += space;
      continue;
    }
    const gl = TF.glyphs[ch];
    if (!gl) {
      x += space;
      continue;
    }
    const wob = 0;
    n++;
    g.drawImage(titleFont, gl.x, 0, gl.w, gl.h, x, pad + gl.top + wob, gl.w, gl.h);
    x += gl.w + track;
  }
  c.addEventListener("contextlost", () => titleCache.clear());
  titleCache.set(s, c);
  return c;
}

export function nameImage(key: string): HTMLCanvasElement | null {
  if (key.startsWith("!")) return titleArt(key.slice(1));
  return titleArt(KEY_TEXT[key] ?? key.replace(/^[tm]_/, "").replace(/_/g, " "));
}
import { drawPlain, onHiLayer, textWidth } from "./font";

const INK = "#0b0806";
const imgs: Record<string, HTMLImageElement> = {};
for (const [k, u] of Object.entries({ stone: stoneUrl, ridge: ridgeUrl, gold: goldUrl, wood: woodUrl, leather: leatherUrl, brick: brickUrl, cloth: clothUrl, iron: ironUrl, parch: parchUrl, banner: bannerUrl })) {
  const im = new Image();
  im.src = u;
  imgs[k] = im;
}

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

export function stoneBg(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = pattern(ctx, "stone", 1.5);
  ctx.fillRect(0, 0, W, H);
}

const bakes = new Map<string, HTMLCanvasElement>();
export function uiImagesReady(): boolean {
  return Object.values(imgs).every((im) => im.complete && im.naturalWidth > 0);
}

export function texturedRect(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, w: number, h: number, tint: string | null, r = 3, scale = 1): void {
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
    c = document.createElement("canvas");
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

function bakeRect(ctx: CanvasRenderingContext2D, key: string, w: number, h: number, tint: string | null, r: number, scale: number): void {
  const x = 0;
  const y = 0;
  withClip(ctx, () => ctx.roundRect(x, y, w, h, r), () => {
    ctx.fillStyle = pattern(ctx, key, scale, x, y);
    ctx.fillRect(x, y, w, h);
    if (tint) {
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = tint;
      ctx.fillRect(x, y, w, h);
      ctx.globalCompositeOperation = "source-over";
    }
  });
}

export function ridgePanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint: string): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 5);
  ctx.fill();
  texturedRect(ctx, "ridge", x, y, w, h, tint, 4, 0.75);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 3.5);
  ctx.stroke();
}

export function goldPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, scale = 0.85): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, (h + 3) / 2);
  ctx.fill();
  texturedRect(ctx, "gold", x, y, w, h, null, h / 2, h / 32);
  ctx.strokeStyle = "rgba(255,248,200,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, (h - 2) / 2);
  ctx.stroke();
  const tw = textWidth(text, scale, true);
  drawPlain(ctx, text, x + (w - tw) / 2, y + (h - 10 * scale) / 2 + 0.5, "#2a1804", scale, true);
}

export function woodDisc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
  ctx.fill();
  withClip(ctx, () => ctx.arc(cx, cy, r, 0, Math.PI * 2), () => {
    ctx.fillStyle = pattern(ctx, "wood", r / 40, cx - r, cy - r);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  });
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

export function coin(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, color: string, r = 7.5): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r - 1.6, 0, Math.PI * 2);
  ctx.fill();
  const sc = r / 11;
  shadowText(ctx, label, x - textWidth(label, sc, true) / 2, y - 5 * sc - 0.5, "#ffffff", sc, true);
}

export function shadowText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, scale = 1, num = false): void {
  const d = Math.max(0.8, scale * 0.9);
  drawPlain(ctx, s, x + d, y + d, INK, scale, num);
  drawPlain(ctx, s, x, y, color, scale, num);
}

export function engraved(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, scale: number, base: string, num = true): void {
  drawPlain(ctx, s, x, y + 1.2, "rgba(255,255,255,0.3)", scale, num);
  drawPlain(ctx, s, x, y, base, scale, num);
}

export function goldArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, s = 6): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x + dir * (s + 1.5), y);
  ctx.lineTo(x - dir * 1.5, y - s - 1.5);
  ctx.lineTo(x - dir * 1.5, y + s + 1.5);
  ctx.closePath();
  ctx.fill();
  withClip(ctx, () => {
    ctx.moveTo(x + dir * s, y);
    ctx.lineTo(x, y - s);
    ctx.lineTo(x, y + s);
    ctx.closePath();
  }, () => {
    ctx.fillStyle = pattern(ctx, "gold", 0.3, x - s, y - s);
    ctx.fillRect(x - s - 2, y - s - 2, s * 2 + 4, s * 2 + 4);
  });
}

export function band(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

export function portraitBack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint: string): void {
  texturedRect(ctx, "leather", x, y, w, h, tint, 0, 1);
}

export function wall(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  ctx.fillStyle = pattern(ctx, "brick", 1.4);
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "#6a6070";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
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

export function fieldShade(ctx: CanvasRenderingContext2D, W: number, H: number, dim = 0.32): void {
  ctx.fillStyle = `rgba(12,8,4,${dim})`;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, W * 0.7);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(10,6,2,0.65)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function plank(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint = "#7a5636"): void {
  band(ctx, x + 2, y + 2, w, h, INK, 0.45);
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  texturedRect(ctx, "wood", x, y, w, h, tint, 0, 0.9);
  band(ctx, x, y, w, 1, "#ffe8c0", 0.25);
  band(ctx, x, y + h - 1, w, 1, INK, 0.5);
  for (const nx of [x + 3, x + w - 5]) for (const ny of [y + 3, y + h - 5]) {
    ctx.fillStyle = INK;
    ctx.fillRect(nx, ny, 2, 2);
    ctx.fillStyle = "#c8b080";
    ctx.fillRect(nx, ny, 1, 1);
  }
}

export function woodFloor(ctx: CanvasRenderingContext2D, y: number, W: number, H: number, tint = "#8a6448"): void {
  texturedRect(ctx, "wood", 0, y, W, H - y, tint, 0, 1.2);
  band(ctx, 0, y, W, 2, INK, 0.8);
}

export function table(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  texturedRect(ctx, "wood", 0, 0, W, H, "#7a5a40", 0, 2.2);
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

export function artTitle(ctx: CanvasRenderingContext2D, key: string, fallback: string, cx: number, y: number, h: number): void {
  const im = nameImage(key);
  if (!im) {
    paintedText(ctx, fallback, cx, y + (h - 11) / 2, "#f0c030", 1.15);
    return;
  }
  const w = (im.width / im.height) * h;
  onHiLayer(ctx, (t) => {
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(im, cx - w / 2, y, w, h);
  });
}

export function paintedText(ctx: CanvasRenderingContext2D, s: string, cx: number, y: number, color: string, scale: number): void {
  shadowText(ctx, s, cx - textWidth(s, scale, true) / 2, y, color, scale, true);
}

export function shieldPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + w / 2, y + h * 0.06, x + w, y);
  ctx.lineTo(x + w, y + h * 0.42);
  ctx.quadraticCurveTo(x + w, y + h * 0.82, x + w / 2, y + h);
  ctx.quadraticCurveTo(x, y + h * 0.82, x, y + h * 0.42);
  ctx.closePath();
}

const imgIds = new WeakMap<object, number>();
let imgSeq = 0;
const imgId = (o: object | null) => {
  if (!o) return 0;
  let v = imgIds.get(o);
  if (v === undefined) imgIds.set(o, (v = ++imgSeq));
  return v;
};

export function shield(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, field: string, icon: HTMLCanvasElement | HTMLImageElement | null, rim: string): void {
  bakedPlate(ctx, `shield|${field}|${rim}|${imgId(icon)}`, x - 3, y - 3, w + 6, h + 6, (g) =>
    shieldPlate(g, 3, 3, w, h, field, icon ? () => {
      const s2 = w + 10;
      g.drawImage(icon, 3 + (w - s2) / 2, 2, s2, s2);
    } : null, rim));
}

function shieldPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, field: string, inner: (() => void) | null, rim: string): void {
  withClip(ctx, () => shieldPath(ctx, x, y, w, h), () => {
    ctx.fillStyle = pattern(ctx, "leather", 1, x, y);
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = field;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = "source-over";
    inner?.();
  });
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  shieldPath(ctx, x, y, w, h);
  ctx.stroke();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  shieldPath(ctx, x, y, w, h);
  ctx.stroke();
  for (const [rx, ry] of [[x + 3, y + 3.5], [x + w - 3, y + 3.5], [x + w / 2, y + h - 4]]) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

const plates = new Map<string, HTMLCanvasElement>();
function bakedPlate(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): void {
  const m = ctx.getTransform();
  const k = Math.max(1, Math.hypot(m.a, m.b));
  const key = `${id}|${w.toFixed(2)}|${h.toFixed(2)}|${k.toFixed(2)}`;
  let c = plates.get(key);
  if (!c) {
    c = document.createElement("canvas");
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

export function ribbon(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number, text: string, scale: number, color = "#3a2410", art: HTMLCanvasElement | null = null): void {
  const x = cx - w / 2;
  bakedPlate(ctx, `ribbon|${art ? 1 : 0}`, x - 8, y - 2, w + 16, h + 8, (g) => ribbonPlate(g, 8, 2, w, h, !!art));
  if (art) {
    const ah = h + 3;
    const aw = Math.min(w - 2, (art.width / art.height) * ah);
    const dh = aw * (art.height / art.width);
    onHiLayer(ctx, (t) => {
      t.imageSmoothingEnabled = true;
      t.drawImage(art, cx - aw / 2, y + (h - dh) / 2, aw, dh);
    });
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
    withClip(ctx, () => {
      ctx.moveTo(ix, y + 3.5);
      ctx.lineTo(ex + side * -1, y + 3.5);
      ctx.lineTo(ex - side * 3.8, y + 2.5 + h / 2);
      ctx.lineTo(ex + side * -1, y + h + 1.5);
      ctx.lineTo(ix, y + h + 1.5);
      ctx.closePath();
    }, () => {
      ctx.fillStyle = pattern(ctx, "parch", 1, x, y);
      ctx.fillRect(ex - 8, y, 16 + Math.abs(ix - ex), h + 6);
      ctx.fillStyle = stain;
      ctx.fillRect(ex - 8, y, 16 + Math.abs(ix - ex), h + 6);
    });
  }
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  texturedRect(ctx, "parch", x, y, w, h, null, 0, 1);
  if (dark) {
    ctx.fillStyle = "rgba(60,30,12,0.7)";
    ctx.fillRect(x, y, w, h);
  }
}

function notchPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, notch: number): void {
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w / 2, y + h - notch);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function pole(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.fillStyle = INK;
  ctx.fillRect(x - 7, y - 3.5, w + 14, 6);
  texturedRect(ctx, "wood", x - 6, y - 2.5, w + 12, 4, "#8a5a34", 1, 0.4);
  for (const kx of [x - 7, x + w + 7]) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(kx, y - 0.5, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pattern(ctx, "gold", 0.2, kx, y);
    ctx.beginPath();
    ctx.arc(kx, y - 0.5, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "#5a4020";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 2);
  ctx.lineTo(x + w / 2, y - 14);
  ctx.lineTo(x + w + 2, y - 2);
  ctx.stroke();
}

export function banner(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint: string, notch = 10): void {
  pole(ctx, x, y, w);
  bakedPlate(ctx, `banner|${tint}|${notch}`, x - 2, y, w + 4, h + 2, (g) => bannerCloth(g, 2, 0, w, h, tint, notch));
}

function bannerCloth(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tint: string, notch: number): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  notchPath(ctx, x - 1.5, y, w + 3, h + 1.5, notch);
  ctx.fill();
  withClip(ctx, () => notchPath(ctx, x, y, w, h, notch), () => {
    ctx.fillStyle = pattern(ctx, "banner", 0.5, x, y);
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.fillRect(x + w * 0.3, y, w * 0.1, h);
    ctx.fillRect(x + w * 0.72, y, w * 0.08, h);
    ctx.globalCompositeOperation = "source-over";
    for (const ty of [y + 3, y + h - notch - 5]) {
      ctx.fillStyle = pattern(ctx, "gold", 0.25, x, ty);
      ctx.fillRect(x, ty, w, 2.5);
    }
  });
}

export function rolledBanner(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  pole(ctx, x, y, w);
  ctx.fillStyle = INK;
  ctx.fillRect(x + 1, y + 1, w - 2, 11);
  texturedRect(ctx, "cloth", x + 2, y + 2, w - 4, 9, "#7a7266", 1, 0.9);
  band(ctx, x + 2, y + 5, w - 4, 1, INK, 0.5);
  band(ctx, x + 2, y + 8, w - 4, 1, INK, 0.35);
  for (const tx of [x + w * 0.25, x + w * 0.75]) {
    ctx.strokeStyle = "#c8a040";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tx, y + 12);
    ctx.lineTo(tx, y + 19);
    ctx.stroke();
    ctx.fillStyle = "#c8a040";
    ctx.fillRect(tx - 1.5, y + 18, 3, 4);
  }
}

export function waxSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, glyph: string): void {
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

export function scroll(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number): void {
  const x = cx - w / 2;
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
  texturedRect(ctx, "parch", x, y, w, h, null, 0, 1);
  for (const ex of [x - 6, x + w - 3]) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(ex - 1.5, y - 5.5, 12, h + 11, 4);
    ctx.fill();
    texturedRect(ctx, "parch", ex, y - 4, 9, h + 8, "#b89868", 3, 1);
    band(ctx, ex + 5.5, y - 4, 1, h + 8, "#5a3a18", 0.6);
  }
}

export function pennant(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 17);
  ctx.stroke();
  ctx.strokeStyle = "#a07840";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 17);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x, y - 18);
  ctx.lineTo(x + 17, y - 13);
  ctx.lineTo(x, y - 7.5);
  ctx.closePath();
  ctx.fill();
  withClip(ctx, () => {
    ctx.moveTo(x + 0.8, y - 16.8);
    ctx.lineTo(x + 14.5, y - 13);
    ctx.lineTo(x + 0.8, y - 9);
    ctx.closePath();
  }, () => {
    ctx.fillStyle = pattern(ctx, "cloth", 0.5, x, y);
    ctx.fillRect(x, y - 18, 16, 12);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 18, 16, 12);
    ctx.globalCompositeOperation = "source-over";
  });
  drawPlain(ctx, label, x + 2.5, y - 16.3, "#ffffff", 0.55, true);
}

export function pin(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
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

const logo = new Image();
logo.src = `${import.meta.env.BASE_URL}loading/logo.png`;

export function drawLogo(ctx: CanvasRenderingContext2D, cx: number, y: number, h: number): void {
  if (!logo.complete || !logo.naturalWidth) {
    paintedText(ctx, "GRUDGE", cx, y + h / 2 - 12, "#c83020", 2.4);
    return;
  }
  const w = (logo.naturalWidth / logo.naturalHeight) * h;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(logo, cx - w / 2, y, w, h);
  ctx.imageSmoothingEnabled = smooth;
}

export function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tilt: number, pinColor: string | null, body: () => void): void {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h / 2);
  parchment(ctx, 0, 0, w, h);
  body();
  if (pinColor) pin(ctx, w / 2, 3, pinColor);
  ctx.restore();
}

export function inset(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string | null = "#2a1a0a"): void {
  ctx.fillStyle = "#2a1a0a";
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
}

export const liveWindow: { rect: [number, number, number, number] | null } = { rect: null };

export function markWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const m = ctx.getTransform();
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const cx = m.a * (x + w / 2) + m.c * (y + h / 2) + m.e;
  const cy = m.b * (x + w / 2) + m.d * (y + h / 2) + m.f;
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  liveWindow.rect = [(cx - (w * sx) / 2) / cw, (cy - (h * sy) / 2) / ch, (w * sx) / cw, (h * sy) / ch];
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
  artTitle(ctx, key, fallback, W / 2, 3, 14);
}

export function tag(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sel: boolean, k: number, body: () => void): void {
  card(ctx, x - (sel ? 8 : 0), y, w, h, sel ? 0 : k % 2 ? 0.025 : -0.025, sel ? "#c81818" : "#8a8a90", body);
  if (sel) goldArrow(ctx, x - 14, y + h / 2, -1, 6);
}

export function hiImage(ctx: CanvasRenderingContext2D, im: CanvasImageSource, x: number, y: number, w: number, h: number): void {
  onHiLayer(ctx, (t) => {
    t.imageSmoothingEnabled = true;
    t.imageSmoothingQuality = "high";
    t.drawImage(im, x, y, w, h);
  });
}
