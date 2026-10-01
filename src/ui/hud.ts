import type { World } from "../sim/world";
import { fontLoaded, setTextLayer, textLayer } from "./font";
import { TEAM_NAMES, UNIT_TYPES, type Directive, type Entity, type UnitType } from "../sim/types";
import type { Portraits } from "./portraits";
import { parchment, texturedRect, uiImagesReady, waxSeal } from "./n64ui";
import { onHiLayer } from "./font";
import { learned, options } from "../sim/talents";
import type { MapperUi } from "../input/commands";
import { buildCost, padNear } from "../sim/structures";
import { drawNum, drawPlain, drawText, textWidth } from "./font";

export const INK = "#0b0806";
export const PAD = { a: "#2f5fd8", b: "#2a9a48", c: "#e8b818", start: "#d82828", z: "#8a8a94", r: "#8a8a94" };

const DIR_NAME: Record<Directive, string> = { push: "ATTACK", hold: "HOLD", follow: "FOLLOW", nearest: "HUNT", focus: "SIEGE", defend: "DEFEND" };
const TYPE_NAME: Record<UnitType | "all", string> = { grunt: "GRUNTS", ranged: "ARCHERS", heavy: "BRUTES", all: "ARMY" };
const PLAYER_TAG = ["#8ab0ff", "#ff9a8a", "#70e0d0", "#ffd060"];
const MARGIN_X = 14;
const MARGIN_Y = 10;

type Frame = { x: number; y: number; w: number; h: number; right: boolean };

export class UiCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly hiCanvas: HTMLCanvasElement;
  readonly hi: CanvasRenderingContext2D;
  w = 427;
  h = 240;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "hudui";
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.hiCanvas = document.createElement("canvas");
    this.hiCanvas.className = "hudui";
    parent.appendChild(this.hiCanvas);
    this.hi = this.hiCanvas.getContext("2d")!;
  }

  begin(): CanvasRenderingContext2D {
    const h = 240;
    const w = Math.round((h * window.innerWidth) / window.innerHeight);
    const scale = 2;
    const pw = Math.round(w * scale);
    const ph = Math.round(h * scale);
    if (w !== this.w || this.canvas.width !== pw || this.canvas.height !== ph) {
      this.w = w;
      this.h = h;
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.ctx.setTransform(pw / w, 0, 0, ph / h, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.clearRect(0, 0, this.w, this.h);
    const hk = Math.min(4, Math.max(1, (window.innerHeight * (window.devicePixelRatio || 1)) / h));
    const hw = Math.round(w * hk);
    const hh = Math.round(h * hk);
    if (this.hiCanvas.width !== hw || this.hiCanvas.height !== hh) {
      this.hiCanvas.width = hw;
      this.hiCanvas.height = hh;
    }
    this.hi.setTransform(1, 0, 0, 1, 0, 0);
    this.hi.clearRect(0, 0, hw, hh);
    setTextLayer(this.ctx, this.hi, hw / w, pw / w);
    return this.ctx;
  }
}

export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, alpha = 0.92): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 3);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(220,228,255,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 1.5);
  ctx.stroke();
  ctx.restore();
}

export function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string): void {
  const f = Math.max(0, Math.min(1, frac));
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, (h + 3) / 2);
  ctx.fill();
  ctx.strokeStyle = "#e8e4dc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - 0.5, y - 0.5, w + 1, h + 1, (h + 1) / 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(20,18,24,0.85)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (f > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * f, h);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x, y, w * f, 1);
    ctx.restore();
  }
  ctx.restore();
}

export function padButton(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, label: string, dim = false): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(x + 1, y + 1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (dim) {
    ctx.fillStyle = "rgba(16,14,20,0.82)";
    ctx.beginPath();
    ctx.arc(x, y, r - 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.15, y - r * 0.45, r * 0.6, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (label) {
    const s = (r * 1.45) / 10;
    drawText(ctx, label, x - textWidth(label, s) / 2, y - r * 0.68, dim ? "#a8a8b0" : "#ffffff", s);
  }
}

function cArrow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, lit: boolean): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit ? PAD.c : "#6a5a20";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = lit ? "#3a2c00" : "#2a2410";
  ctx.beginPath();
  ctx.moveTo(r * 0.55, 0);
  ctx.lineTo(-r * 0.3, -r * 0.45);
  ctx.lineTo(-r * 0.3, r * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function bombIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number): void {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.5, y - r * 0.6);
  ctx.quadraticCurveTo(x + r * 1.1, y - r * 1.4, x + r * 1.3, y - r * 1.2);
  ctx.stroke();
  ctx.strokeStyle = "#d8c088";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a3a44";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a8a98";
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  const on = Math.floor(now * 10) % 2 === 0;
  ctx.fillStyle = on ? "#fff0a0" : "#ff7020";
  ctx.beginPath();
  ctx.arc(x + r * 1.3, y - r * 1.2, on ? 1.6 : 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function relicIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  const horn = (s: number) => {
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.45, y - r * 0.3);
    ctx.quadraticCurveTo(x + s * r * 1.5, y - r * 0.4, x + s * r * 1.3, y - r * 1.4);
    ctx.quadraticCurveTo(x + s * r * 1.05, y - r * 0.75, x + s * r * 0.4, y - r * 0.75);
    ctx.closePath();
  };
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass ? "#f0d070" : INK;
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    horn(-1);
    if (pass) ctx.fill(); else ctx.stroke();
    horn(1);
    if (pass) ctx.fill(); else ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.75 + 0.9, r + 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a8682a";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.75, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8a850";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.3, r * 0.25, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(x - r * 0.45, y + r * 0.35, r * 0.25, r * 0.2);
  ctx.fillRect(x + r * 0.2, y + r * 0.35, r * 0.25, r * 0.2);
  ctx.restore();
}

function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.8 + 0.8, r + 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0b820";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe890";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.1, r * 0.35, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b07810";
  ctx.fillRect(x - 0.5, y - r * 0.5, 1, r);
  ctx.restore();
}

function armyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, team: string): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x - r - 0.8, y + r * 0.7 + 0.8);
  ctx.lineTo(x - r - 0.8, y - r * 0.1);
  ctx.arc(x, y - r * 0.1, r + 0.8, Math.PI, 0);
  ctx.lineTo(x + r + 0.8, y + r * 0.7 + 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c8ccd4";
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.7);
  ctx.lineTo(x - r, y - r * 0.1);
  ctx.arc(x, y - r * 0.1, r, Math.PI, 0);
  ctx.lineTo(x + r, y + r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = team;
  ctx.fillRect(x - r * 0.3, y - r * 1.1, r * 0.6, r * 1.2);
  ctx.fillStyle = INK;
  ctx.fillRect(x - r * 0.75, y + r * 0.05, r * 1.5, r * 0.25);
  ctx.restore();
}

function keepGem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, team: string, hp: number, ward: number, now: number): void {
  const gem = (k: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.25 - k);
    ctx.lineTo(x + r * 0.8 + k, y);
    ctx.lineTo(x, y + r * 1.25 + k);
    ctx.lineTo(x - r * 0.8 - k, y);
    ctx.closePath();
  };
  ctx.save();
  if (ward > 0) {
    const k = 2.6;
    const pts: [number, number][] = [[x, y - r * 1.25 - k], [x + r * 0.8 + k, y], [x, y + r * 1.25 + k], [x - r * 0.8 - k, y], [x, y - r * 1.25 - k]];
    const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    const total = seg.reduce((a, b) => a + b, 0);
    const trace = (frac: number) => {
      let left = total * Math.min(1, frac);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < 4 && left > 0; i++) {
        const f = Math.min(1, left / seg[i]);
        ctx.lineTo(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f);
        left -= seg[i];
      }
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    trace(ward);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    trace(ward);
    ctx.strokeStyle = "#aee8ff";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  gem(1);
  ctx.fill();
  ctx.fillStyle = "#2a2226";
  gem(0);
  ctx.fill();
  ctx.save();
  gem(0);
  ctx.clip();
  const top = y + r * 1.25 - r * 2.5 * Math.max(0, Math.min(1, hp));
  ctx.fillStyle = hp < 0.25 && Math.floor(now * 4) % 2 === 0 ? "#ff6a50" : team;
  ctx.fillRect(x - r, top, r * 2, y + r * 1.3 - top);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.25);
  ctx.lineTo(x - r * 0.8, y);
  ctx.lineTo(x - r * 0.25, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

const ORDER_COL: Record<Directive, string> = { push: "#d83a28", follow: "#3a78e0", defend: "#3aa04a", hold: "#d8a020", nearest: "#e07020", focus: "#8a4ad0" };

function orderBadge(ctx: CanvasRenderingContext2D, x: number, y: number, d: Directive, flip: boolean): void {
  const r = 4.4;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ORDER_COL[d] ?? "#888";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.15, y - r * 0.45, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff8e8";
  ctx.strokeStyle = "#fff8e8";
  ctx.lineWidth = 0.9;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const f = flip ? -1 : 1;
  ctx.beginPath();
  if (d === "push") {
    for (const o of [-1.3, 0.6]) {
      ctx.moveTo(x + (o - 0.9) * f, y - 1.9);
      ctx.lineTo(x + (o + 0.9) * f, y);
      ctx.lineTo(x + (o - 0.9) * f, y + 1.9);
    }
    ctx.stroke();
  } else if (d === "follow") {
    ctx.arc(x - 0.6 * f, y + 0.6, 1.9, Math.PI * 0.9, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 1.9 * f, y - 1.2);
    ctx.lineTo(x + 0.6 * f, y - 2.2);
    ctx.lineTo(x + 2.2 * f, y + 0.6);
    ctx.closePath();
    ctx.fill();
  } else if (d === "defend") {
    ctx.moveTo(x - 2, y - 2.1);
    ctx.lineTo(x + 2, y - 2.1);
    ctx.lineTo(x + 2, y + 0.2);
    ctx.quadraticCurveTo(x + 1.6, y + 1.8, x, y + 2.5);
    ctx.quadraticCurveTo(x - 1.6, y + 1.8, x - 2, y + 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (d === "hold") {
    ctx.fillRect(x - 2.2, y - 0.8, 4.4, 1.6);
  } else if (d === "nearest") {
    ctx.arc(x, y, 1.9, 0, Math.PI * 2);
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x + 3, y);
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 3);
    ctx.stroke();
  } else {
    ctx.fillRect(x - 1.6, y - 1, 3.2, 3.2);
    ctx.fillRect(x - 2.1, y - 2.2, 1.1, 1.4);
    ctx.fillRect(x - 0.55, y - 2.2, 1.1, 1.4);
    ctx.fillRect(x + 1, y - 2.2, 1.1, 1.4);
  }
  ctx.restore();
}

function ringMeter(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, frac: number, color: string): void {
  ctx.save();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = "#3a3038";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (frac > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac));
    ctx.stroke();
  }
  ctx.restore();
}

function coreIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, team: string, shield: boolean): void {
  ctx.save();
  const gem = (k: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.25 - k);
    ctx.lineTo(x + r * 0.8 + k, y);
    ctx.lineTo(x, y + r * 1.25 + k);
    ctx.lineTo(x - r * 0.8 - k, y);
    ctx.closePath();
  };
  if (shield) {
    ctx.fillStyle = "rgba(174,232,255,0.6)";
    gem(2.2);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  gem(0.9);
  ctx.fill();
  ctx.fillStyle = team;
  gem(0);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.25);
  ctx.lineTo(x - r * 0.8, y);
  ctx.lineTo(x - r * 0.2, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function fallenMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.lineCap = "round";
  for (const [c, lw] of [[INK, 3], ["#d83020", 1.4]] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
  }
  ctx.restore();
}

function times(ctx: CanvasRenderingContext2D, x: number, y: number): number {
  drawText(ctx, "×", x, y + 1, "#b8c4e8", 0.9);
  return textWidth("×", 0.9) + 1.5;
}

interface Cross {
  title: string;
  items: [string, string][];
  lit: number;
  until: number;
}

const talentUrls = import.meta.glob("../../assets/ui/talents/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const talentImgs = new Map<string, HTMLImageElement>();
for (const [p, url] of Object.entries(talentUrls)) {
  const im = new Image();
  im.src = url;
  talentImgs.set(p.split("/").pop()!.replace(".png", ""), im);
}

const iconBakes = new Map<string, HTMLCanvasElement>();
function scaledIcon(id: string, im: HTMLImageElement, px: number): HTMLCanvasElement | HTMLImageElement {
  if (px >= im.naturalWidth) return im;
  const key = `${id}|${px}`;
  let c = iconBakes.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = px;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(im, 0, 0, px, px);
    iconBakes.set(key, c);
    if (iconBakes.size > 300) {
      const old = iconBakes.keys().next().value!;
      iconBakes.get(old)!.width = 0;
      iconBakes.delete(old);
    }
  }
  return c;
}

export function talentIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, dim = false, low = false): void {
  const im = talentImgs.get(id);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, size + 2, size + 2);
  texturedRect(ctx, "stone", x, y, size, size, dim ? "#5a5048" : "#b8a888", 0, 0.5);
  if (im?.complete && im.naturalWidth) {
    const a = dim ? 0.35 : 1;
    const draw = low ? (f: (c: CanvasRenderingContext2D) => void) => f(ctx) : (f: (c: CanvasRenderingContext2D) => void) => onHiLayer(ctx, f);
    draw((c) => {
      c.save();
      c.globalAlpha *= a;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      const m = c.getTransform();
      const px = Math.round(size * Math.hypot(m.a, m.b));
      c.drawImage(px > 0 && !m.b && !m.c ? scaledIcon(id, im, px) : im, x, y, size, size);
      c.restore();
    });
  } else {
    ctx.fillStyle = dim ? "#6a6058" : "#ffe890";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hudWrap(s: string, width: number, scale: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, scale) > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export class Hud {
  private visible = false;
  private banner = "";
  private bannerAt = 0;
  private bannerUntil = 0;
  private notices: { text: string; until: number }[] = Array.from({ length: 4 }, () => ({ text: "", until: 0 }));
  private orders: { type: UnitType | "all"; dir: Directive; until: number }[] = Array.from({ length: 4 }, () => ({ type: "all" as const, dir: "follow" as Directive, until: 0 }));
  private shownCoin = [0, 0, 0, 0];
  private fall: { team: number; at: number; until: number } | null = null;

  constructor(private teamColors: string[]) {}

  show(on: boolean): void {
    this.visible = on;
  }

  private bannerBig = false;

  banner_(text: string, now: number, seconds = 2.2, big = false): void {
    this.bannerBig = big;
    this.banner = text;
    this.bannerAt = now;
    this.bannerUntil = now + seconds;
  }

  mapIndex: (() => number) | null = null;
  minimap = true;
  private card: { title: string; sub: string; glyph: string; color: string; at: number; until: number; count: number } | null = null;
  private overlays = new Map<string, HTMLCanvasElement | null>();

  private showCard(title: string, sub: string, glyph: string, now: number, color = "#8a1810", count = 0, seconds = 4): void {
    this.card = { title, sub, glyph, color, at: now, until: now + Math.max(seconds, count + 0.6), count };
  }

  private mapEvent(w: World, ev: World["events"][number], now: number): void {
    const team = (t: number) => (t >= 0 ? this.teamColors[t] : "#8a1810");
    if (ev.type === "avalanche") {
      const arm = w.ffa ? ["WEST", "NORTH", "EAST", "SOUTH"][ev.arm] + " ARM" : "";
      if (ev.stage === "warn") this.showCard("AVALANCHE!", `THE ${arm} RUMBLES · GET OUT OF THE LANE`, "peak", now, "#8a1810", ev.seconds);
      else if (ev.stage === "slide") this.showCard("AVALANCHE!", `SNOW COMING DOWN THE ${arm}`, "peak", now, "#8a1810", 0, 2.5);
    } else if (ev.type === "gates") {
      const court = ev.pattern === 1;
      if (ev.stage === "warn") this.showCard("THE BELLS RING", court ? "THE COURT OPENS · THE OUTER GATES SEAL" : "THE COURT SEALS · THE OUTER GATES OPEN", "bell", now, "#8a5a10", ev.seconds);
    } else if (ev.type === "mist") {
      if (ev.stage === "warn") this.showCard("MIST ON THE RIVER", "ANYTHING IN THE MIST IS HIDDEN", "river", now, "#4a5a6a", ev.seconds);
      else if (ev.stage === "out") this.showCard("THE MIST LIFTS", "THE RIVERS ARE CLEAR AGAIN", "river", now, "#4a5a6a", 0, 3);
    } else if (ev.type === "lantern") {
      if (ev.stage === "rise") this.showCard("THE DEAD STIR", "A BONE LANTERN RISES FROM THE PIT", "hex", now, "#2a6a2a");
      else if (ev.stage === "fade") this.showCard("THE LANTERN GOES OUT", "IT WILL RISE AGAIN", "hex", now, "#2a6a2a", 0, 3);
      else if (ev.stage === "taken") {
        const h = w.getAny(ev.hero);
        const lt = w.mapEvents.lanternDef;
        const name = h ? w.teamName(h.team) : "SOMEONE";
        this.showCard(`${name} IS HAUNTED`, lt ? `+${Math.round((lt.damageMul - 1) * 100)}% DAMAGE · +${Math.round((lt.speedMul - 1) * 100)}% SPEED · ${lt.hauntSeconds}S` : "", "hex", now, team(h?.team ?? -1));
      }
    } else if (ev.type === "tide") {
      this.showCard(ev.high ? "HIGH TIDE" : "LOW TIDE", ev.high ? "THE FLATS FLOOD · EVERYONE ON THEM IS SLOWED" : "THE FLATS DRAIN · PUSH NOW", "tide", now, "#2a4a8a");
    }
  }

  update(w: World, _ui: (MapperUi | null)[], now: number): void {
    for (const ev of w.events) {
      this.mapEvent(w, ev, now);
      if (ev.type === "notice") {
        if (ev.team < 0) this.banner_(ev.text, now);
        else if (this.notices[ev.team]) this.notices[ev.team] = { text: ev.text, until: now + 2 };
      } else if (ev.type === "directive" && ev.team >= 0 && ev.team < this.orders.length) {
        this.orders[ev.team] = { type: ev.unitType, dir: ev.dir, until: now + 2.2 };
      } else if (ev.type === "eliminated") {
        this.fall = { team: ev.team, at: now, until: now + 3.5 };
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, ui: (MapperUi | null)[], now: number): void {
    this.crossN = 0;
    if (this.split >= 2) {
      const t = 3;
      ctx.fillStyle = INK;
      ctx.fillRect(Math.round(W / 2 - t / 2) - 1, 0, t + 2, H);
      texturedRect(ctx, "stone", Math.round(W / 2 - t / 2), 0, t, H, "#8a8070", 0, 0.5);
      if (this.split >= 3) {
        ctx.fillRect(0, Math.round(H / 2 - t / 2) - 1, W, t + 2);
        texturedRect(ctx, "stone", 0, Math.round(H / 2 - t / 2), W, t, "#8a8070", 0, 0.5);
      }
    }
    const bannerOn = !!this.banner && now < this.bannerUntil;
    this.bannerLineY = MARGIN_Y + (w.match.phase === "sudden" ? 27 : 19);
    if (bannerOn && (this.bannerBig || !this.visible)) this.drawBanner(ctx, W, now);
    if (!this.visible) return;
    this.drawClock(ctx, W, w, now);
    this.drawRelic(ctx, W, H, w, now, bannerOn && !this.bannerBig);
    if (bannerOn && !this.bannerBig) this.drawBanner(ctx, W, now);
    this.mini = null;
    if (this.minimap) this.drawMinimap(ctx, W, H, w, now);
    if (this.card && now < this.card.until) this.drawCard(ctx, W, w, now);
    if (w.ffa) {
      this.drawFfa(ctx, W, H, w, ui, now);
      return;
    }
    const k = w.players.length >= 4 || this.split >= 3 ? 0.74 : w.players.length >= 3 ? 0.86 : 1;
    this.dense = k < 1;
    for (let t = 0; t < 2; t++) {
      if (k === 1) {
        this.drawTeam(ctx, W, H, w, ui, t, now);
        continue;
      }
      ctx.save();
      ctx.scale(k, k);
      this.drawTeam(ctx, W / k, H / k, w, ui, t, now);
      ctx.restore();
    }
  }

  private drawFfa(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, ui: (MapperUi | null)[], now: number): void {
    const k = this.split >= 3 ? 0.74 : this.split === 2 ? 0.86 : 1;
    this.dense = k < 1;
    const Wk = W / k;
    const Hk = H / k;
    const locals = w.players.filter((p) => ui[p.player] && !p.commander);
    const mine = [...new Set(locals.map((p) => p.team))];
    const frames = new Map<number, Frame>();
    const quad = (j: number, n: number): Frame => {
      if (n <= 1) return { x: 0, y: 0, w: Wk, h: Hk, right: false };
      if (n === 2) return { x: j ? Wk / 2 : 0, y: 0, w: Wk / 2, h: Hk, right: j === 1 };
      return { x: j % 2 ? Wk / 2 : 0, y: j >= 2 ? Hk / 2 : 0, w: Wk / 2, h: Hk / 2, right: j % 2 === 1 };
    };
    if (!mine.length) frames.set(0, quad(0, 1));
    mine.forEach((t, j) => {
      const pl = locals.find((p) => p.team === t)!.player;
      const r = this.split >= 2 ? this.rectOf?.(pl) : null;
      frames.set(t, r ? { x: r.x * Wk, y: r.y * Hk, w: r.w * Wk, h: r.h * Hk, right: r.x + r.w / 2 > 0.5 } : quad(j, mine.length));
    });
    ctx.save();
    if (k !== 1) ctx.scale(k, k);
    for (const [t, F] of frames) this.drawTeam(ctx, Wk, Hk, w, ui, t, now, F);
    const rest = w.teams.map((_, t) => t).filter((t) => !frames.has(t));
    if (rest.length) {
      const single = frames.size === 1 && this.split < 2;
      this.drawStandings(ctx, single ? Wk - MARGIN_X - 74 : Wk / 2 - 37, single ? MARGIN_Y + 2 : MARGIN_Y + 40, w, rest, single);
    }
    for (const [t, F] of frames) {
      if (!w.teams[t].out || !mine.includes(t)) continue;
      const msg = "YOUR KEEP FELL · SPECTATING";
      const s = 0.9;
      drawText(ctx, msg, Math.round(F.x + F.w / 2 - textWidth(msg, s) / 2), Math.round(F.y + F.h * 0.8), Math.floor(now * 2) % 2 ? "#ffd0a0" : "#ffffff", s);
    }
    ctx.restore();
    const f = this.fall;
    if (f && now < f.until && w.match.phase !== "over") {
      const name = `${TEAM_NAMES[f.team] ?? ""} HOUSE FALLS`;
      const age = now - f.at;
      const s = 2.4 * (age < 0.12 ? 1.3 - (age / 0.12) * 0.3 : 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (f.until - now) * 4);
      drawNum(ctx, name, Math.round((W - textWidth(name, s, true)) / 2), Math.round(H * 0.3), this.teamColors[f.team] ?? "#ffffff", s);
      ctx.restore();
    }
  }

  private drawStandings(ctx: CanvasRenderingContext2D, x: number, y: number, w: World, teams: number[], right: boolean): void {
    const rows = teams.map((t) => {
      const core = w.core(t);
      return { t, out: !!w.teams[t].out, hp: core?.alive ? core.hp / core.maxHp : 0, shield: !!core?.structure?.shielded && !w.isSudden() };
    });
    const bw = 74;
    const rh = 10;
    const key = [x, y, right, ...rows.map((r) => `${r.t}${r.out}${r.hp.toFixed(3)}${r.shield}`)].join("|");
    this.memo(ctx, "standings", key, x - 8, y - 6, bw + 16, rows.length * rh + 10, (c) => {
      rows.forEach((r, i) => {
        const ry = y + i * rh;
        const col = this.teamColors[r.t];
        const gx = right ? x + bw - 4 : x + 4;
        const mx = right ? x : x + 11;
        coreIcon(c, gx, ry + 3, 3.2, r.out ? "#5a5048" : col, r.shield && !r.out);
        if (r.out) {
          fallenMark(c, gx, ry + 3, 4);
          const lab = "FALLEN";
          drawText(c, lab, right ? x + bw - 11 - textWidth(lab, 0.6) : mx, ry - 0.5, "#ffb8a0", 0.6);
        } else meter(c, mx, ry + 1, bw - 11, 4, r.hp, col);
      });
      return 0;
    });
  }

  private dense = false;
  rectOf: ((player: number) => { x: number; y: number; w: number; h: number } | null) | null = null;

  private memos = new Map<string, { low: HTMLCanvasElement; hi: HTMLCanvasElement; key: string; out: number; at: number[] }>();

  private memo(ctx: CanvasRenderingContext2D, id: string, key: string, x: number, y: number, w: number, h: number, draw: (c: CanvasRenderingContext2D) => number): number {
    const L = textLayer();
    const m = ctx.getTransform();
    if (ctx !== L.low || !L.hi || m.b || m.c || ctx.globalAlpha !== 1) return draw(ctx);
    const r = L.hk / L.lk;
    const lx = Math.floor(m.a * x + m.e);
    const ly = Math.floor(m.d * y + m.f);
    const hx = Math.floor((m.a * x + m.e) * r);
    const hy = Math.floor((m.d * y + m.f) * r);
    const lw = Math.ceil(m.a * w) + 2;
    const lh = Math.ceil(m.d * h) + 2;
    const hw = Math.ceil(m.a * w * r) + 2;
    const hh = Math.ceil(m.d * h * r) + 2;
    const full = `${key}|${m.a},${m.d},${m.e},${m.f},${r},${x},${y}|${fontLoaded()}|${uiImagesReady()}`;
    let c = this.memos.get(id);
    if (!c) {
      c = { low: document.createElement("canvas"), hi: document.createElement("canvas"), key: "", out: 0, at: [] };
      this.memos.set(id, c);
    }
    if (c.key !== full) {
      if (c.low.width !== lw || c.low.height !== lh) {
        c.low.width = lw;
        c.low.height = lh;
      }
      if (c.hi.width !== hw || c.hi.height !== hh) {
        c.hi.width = hw;
        c.hi.height = hh;
      }
      const lc = c.low.getContext("2d")!;
      const hc = c.hi.getContext("2d")!;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, lw, lh);
      hc.setTransform(1, 0, 0, 1, 0, 0);
      hc.clearRect(0, 0, hw, hh);
      lc.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
      lc.setTransform(m.a, 0, 0, m.d, m.e - lx, m.f - ly);
      setTextLayer(lc, hc, L.hk, L.lk, lx * r - hx, ly * r - hy);
      try {
        c.out = draw(lc);
      } finally {
        setTextLayer(L.low!, L.hi, L.hk, L.lk, L.dx, L.dy);
      }
      c.key = full;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c.low, lx, ly);
    ctx.restore();
    L.hi.save();
    L.hi.setTransform(1, 0, 0, 1, 0, 0);
    L.hi.drawImage(c.hi, hx, hy);
    L.hi.restore();
    return c.out;
  }

  private panelKey(w: World, e: Entity, x0: number, y0: number, blockW: number, right: boolean, now: number, local: boolean, tag: string): string {
    const h = e.hero!;
    const cd = (k: "b" | "r") => Math.ceil((h.cooldowns[k] ?? 0) - w.time);
    const frac = h.meter / w.data.heroes.baseline.superMax;
    const cfgXp = w.data.talents?.xp;
    const commander = !!w.players.find((p) => p.heroId === e.id)?.commander;
    const talents = (["r", "b", "a", "z"] as const).map((slot) => {
      const id = learned(w, e, slot)[0]?.id ?? "";
      return id + (talentImgs.get(id)?.complete ? "+" : "-");
    }).join(",");
    return [
      x0, y0, blockW, right, local, tag, h.dead, h.dead ? Math.ceil(h.respawnAt - w.time) : 0, cd("b"), cd("r"), frac, frac >= 1 ? Math.floor(now * 5) % 2 : 0,
      !!cfgXp, commander, h.level, h.xp, talents, local && h.picks.length ? Math.floor(now * 3) % 3 : -1,
    ].join("|");
  }

  private drawPlayerPanel(ctx: CanvasRenderingContext2D, w: World, e: Entity, x0: number, y0: number, blockW: number, right: boolean, now: number, local: boolean, tag: string): number {
    const h = e.hero!;
    const ax = (dx: number, width = 0) => (right ? x0 + blockW - dx - width : x0 + dx);
    const y = y0;
    let px = 0;
    if (tag) {
      const tw = textWidth(tag, 0.62, true);
      drawText(ctx, tag, right ? ax(0, tw) : ax(0), y + 2, PLAYER_TAG[e.hero!.player] ?? "#d8d0c0", 0.62, true);
      px = tw + 4;
    }
    if (h.dead) {
      const n = Math.max(0, Math.ceil(h.respawnAt - w.time));
      const lab = `RESPAWN ${n}`;
      drawText(ctx, lab, right ? ax(px, textWidth(lab, 0.7)) : ax(px), y + 1.5, "#ffb8a0", 0.7);
      px += Math.max(40, textWidth(lab, 0.7) + 4);
    } else {
      const keys: ["b" | "r", string][] = [["b", PAD.b], ["r", PAD.r]];
      keys.forEach(([k, c], i) => {
        const left = (h.cooldowns[k] ?? 0) - w.time;
        const bxx = ax(px + 5 + i * 12);
        const ready = left <= 0;
        padButton(ctx, bxx, y + 5, 4.8, c, ready ? k.toUpperCase() : "", !ready);
        if (!ready) {
          const n = String(Math.ceil(left));
          drawNum(ctx, n, bxx - textWidth(n, 0.72, true) / 2 - 0.5, y + 1.2, "#ffffff", 0.72);
        }
      });
      const frac = h.meter / w.data.heroes.baseline.superMax;
      const full = frac >= 1;
      const zx = ax(px + 30);
      ringMeter(ctx, zx, y + 5, 6.4, Math.min(1, frac), full && Math.floor(now * 5) % 2 === 0 ? "#fff4a0" : "#f0b020");
      padButton(ctx, zx, y + 5, 4.4, full ? "#e8c030" : PAD.z, "Z", !full);
      px += 42;
    }
    const cfgXp = w.data.talents?.xp;
    if (!cfgXp || w.players.find((p) => p.heroId === e.id)?.commander) return 12;
    const next = cfgXp.levels[h.level];
    const prev = cfgXp.levels[h.level - 1] ?? 0;
    const xf = next === undefined ? 1 : (h.xp - prev) / (next - prev);
    const lx = ax(px + 5);
    ringMeter(ctx, lx, y + 5, 5.4, xf, next === undefined ? "#ffd040" : "#8ad8ff");
    ctx.fillStyle = "#2a2226";
    ctx.beginPath();
    ctx.arc(lx, y + 5, 4.2, 0, Math.PI * 2);
    ctx.fill();
    const lv = String(h.level);
    drawNum(ctx, lv, lx - textWidth(lv, 0.72, true) / 2 - 0.3, y + 1.3, "#ffe890", 0.72);
    px += 13;
    const isz = 9;
    for (const slot of ["r", "b", "a", "z"] as const) {
      const got = learned(w, e, slot);
      const ix = right ? ax(px, isz) : ax(px);
      if (got[0]) talentIcon(ctx, got[0].id, ix, y + 0.5, isz);
      else {
        ctx.fillStyle = INK;
        ctx.fillRect(ix - 1, y - 0.5, isz + 2, isz + 2);
        ctx.fillStyle = "#2a2430";
        ctx.fillRect(ix, y + 0.5, isz, isz);
      }
      px += isz + 2;
    }
    void local;
    return 13;
  }

  private drawBanner(ctx: CanvasRenderingContext2D, W: number, now: number): void {
    const age = now - this.bannerAt;
    const left = this.bannerUntil - now;
    const pop = age < 0.12 ? 1.4 - (age / 0.12) * 0.4 : 1;
    const big = this.bannerBig;
    const base = big ? 3.6 : 0.72;
    const s = base * pop;
    if (!big) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, left * 5);
      const ss = 0.72 * (age < 0.12 ? 1.15 - (age / 0.12) * 0.15 : 1);
      drawText(ctx, this.banner, Math.round((W - textWidth(this.banner, ss)) / 2), this.bannerLineY, "#ffffff", ss);
      ctx.restore();
      return;
    }
    const tw = textWidth(this.banner, s, true);
    ctx.save();
    ctx.globalAlpha = Math.min(1, left * 5);
    const y = big ? 96 - (s - base) * 5 : this.bannerLineY - (s - base) * 4;
    drawNum(ctx, this.banner, Math.round((W - tw) / 2), y, "#ffffff", s);
    ctx.restore();
  }

  split = 0;
  locate: ((x: number, y: number, z: number) => { x: number; y: number }) | null = null;

  private drawCard(ctx: CanvasRenderingContext2D, W: number, w: World, now: number): void {
    const c = this.card!;
    const age = now - c.at;
    const left = c.until - now;
    const drop = age < 0.18 ? (1 - age / 0.18) * -8 : 0;
    const left2 = c.count > 0 ? Math.ceil(c.count - age) : 0;
    const title = left2 > 0 ? `${c.title} ${left2}` : c.title;
    const ts = 0.95;
    const ss = 0.55;
    const bw = Math.round(Math.max(textWidth(title, ts), textWidth(c.sub, ss)) + 34);
    const bh = c.sub ? 25 : 17;
    const x = Math.round(W / 2 - bw / 2);
    const y = Math.round(MARGIN_Y + (w.match.phase === "sudden" ? 52 : 46) + drop);
    ctx.save();
    ctx.globalAlpha = Math.min(1, left * 4, age * 8);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    parchment(ctx, x, y, bw, bh);
    ctx.fillStyle = c.color;
    ctx.fillRect(x, y, 3, bh);
    ctx.fillRect(x + bw - 3, y, 3, bh);
    waxSeal(ctx, x + 13, y + bh / 2, 7, c.color, c.glyph);
    const flash = left2 > 0 && Math.floor(now * 4) % 2 === 0;
    drawPlain(ctx, title, x + 24, y + 3, flash ? "#d02010" : c.color, ts, true);
    if (c.sub) drawPlain(ctx, c.sub, x + 24, y + 15, "#3a2410", ss);
    ctx.restore();
  }

  private overlay(key: string, w: World, make: (c: CanvasRenderingContext2D, W: number, D: number) => boolean): HTMLCanvasElement | null {
    if (this.overlays.has(key)) return this.overlays.get(key)!;
    const t = w.terrain;
    const c = document.createElement("canvas");
    c.width = t.width;
    c.height = t.depth;
    const ok = make(c.getContext("2d")!, t.width, t.depth);
    this.overlays.set(key, ok ? c : null);
    return ok ? c : null;
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, now: number): void {
    const t = w.terrain;
    const idx = this.mapIndex?.() ?? -1;
    const s = Math.min(68 / t.width, 50 / t.depth);
    const mw = t.width * s;
    const mh = t.depth * s;
    const x0 = Math.round(W / 2 - mw / 2);
    const y0 = Math.round(this.split >= 2 ? H / 2 - mh / 2 : H - mh - 12);
    this.mini = { x: x0 - 4, y: y0 - 4, w: mw + 8, h: mh + 8 };
    const img = idx >= 0 ? this.portraits?.mapTop(idx, Math.round(t.width * 6), Math.round(t.depth * 6)) : null;
    const tc = (team: number) => this.teamColors[team] ?? this.teamColors[4] ?? "#9a9068";
    const P = (x: number, z: number): [number, number] => [x0 + x * s, y0 + z * s];
    const tide = this.overlay(`tide:${idx}`, w, (g) => {
      if (!t.tideCells.length) return false;
      g.fillStyle = "rgba(70,140,230,0.7)";
      for (const i of t.tideCells) g.fillRect(i % t.width, Math.floor(i / t.width), 1, 1);
      return true;
    });
    const mist = this.overlay(`mist:${idx}`, w, (g, Wd) => {
      const m = w.mapEvents.mistMask;
      if (!m) return false;
      g.fillStyle = "rgba(225,232,240,0.55)";
      for (let i = 0; i < m.length; i++) if (m[i]) g.fillRect(i % Wd, Math.floor(i / Wd), 1, 1);
      return true;
    });
    onHiLayer(ctx, (g) => {
      g.save();
      g.globalAlpha *= 0.9;
      g.fillStyle = INK;
      g.fillRect(x0 - 3.5, y0 - 3.5, mw + 7, mh + 7);
      texturedRect(g, "wood", x0 - 2.5, y0 - 2.5, mw + 5, mh + 5, "#7a5636", 0, 0.5);
      g.fillStyle = INK;
      g.fillRect(x0 - 0.8, y0 - 0.8, mw + 1.6, mh + 1.6);
      if (img) {
        g.imageSmoothingEnabled = true;
        g.drawImage(img, x0, y0, mw, mh);
      } else {
        g.fillStyle = "#4a6a3a";
        g.fillRect(x0, y0, mw, mh);
      }
      g.fillStyle = "rgba(10,8,6,0.06)";
      g.fillRect(x0, y0, mw, mh);
      g.save();
      g.beginPath();
      g.rect(x0, y0, mw, mh);
      g.clip();
      g.imageSmoothingEnabled = false;
      if (tide && w.tideHigh) {
        g.globalAlpha *= 0.75;
        g.drawImage(tide, x0, y0, mw, mh);
        g.globalAlpha /= 0.75;
      }
      if (mist) {
        const [tail, front] = w.mapEvents.mistBand(w.time);
        if (front > tail) {
          const z0 = Math.max(0, tail);
          const z1 = Math.min(t.depth, front);
          if (z1 > z0) g.drawImage(mist, 0, z0, t.width, z1 - z0, x0, y0 + z0 * s, mw, (z1 - z0) * s);
        }
      }
      const av = w.mapEvents.avalancheNow;
      if (av) {
        const r = av.lane.rect;
        const [ax, ay] = P(r.x, r.z);
        if (av.stage === "warn") {
          g.strokeStyle = Math.floor(now * 5) % 2 ? "#ff4030" : "#ffffff";
          g.lineWidth = 0.9;
          g.strokeRect(ax, ay, r.w * s, r.h * s);
        } else {
          g.fillStyle = "rgba(240,248,255,0.85)";
          const k = av.k;
          const { dx, dz } = av.lane;
          if (dx > 0) g.fillRect(ax, ay, r.w * s * k, r.h * s);
          else if (dx < 0) g.fillRect(ax + r.w * s * (1 - k), ay, r.w * s * k, r.h * s);
          else if (dz > 0) g.fillRect(ax, ay, r.w * s, r.h * s * k);
          else g.fillRect(ax, ay + r.h * s * (1 - k), r.w * s, r.h * s * k);
        }
      }
      for (const gt of w.mapEvents.gateList) {
        if (!gt.shut) continue;
        const [gx, gy] = P(gt.slot.x, gt.slot.z);
        g.fillStyle = INK;
        g.fillRect(gx - 0.4, gy - 0.4, gt.slot.w * s + 0.8, gt.slot.h * s + 0.8);
        g.fillStyle = "#9aa0b0";
        g.fillRect(gx, gy, gt.slot.w * s, gt.slot.h * s);
      }
      for (const sh of w.arena.shots) {
        const [cx, cy] = P(sh.x, sh.z);
        g.strokeStyle = Math.floor(now * 6) % 2 ? "#ff3020" : "#ffd040";
        g.lineWidth = 0.7;
        g.beginPath();
        g.arc(cx, cy, Math.max(1.2, sh.radius * s), 0, Math.PI * 2);
        g.stroke();
      }
      const dot = (cx: number, cy: number, r: number, fill: string, ring = INK, lw = 0.5) => {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fillStyle = fill;
        g.fill();
        g.lineWidth = lw;
        g.strokeStyle = ring;
        g.stroke();
      };
      for (const e of w.entities) {
        if (!e.alive || !e.unit || e.neutral || e.status.hidden) continue;
        const [ux, uy] = P(e.transform.pos.x, e.transform.pos.z);
        g.fillStyle = tc(e.team);
        g.fillRect(ux - 0.45, uy - 0.45, 0.9, 0.9);
      }
      for (const pad of w.pads) {
        const [px, py] = P(pad.x, pad.z);
        const st = pad.structureId ? w.get(pad.structureId) : undefined;
        if (!st?.alive || !st.structure) {
          const rubble = w.time < pad.rubbleUntil;
          g.lineWidth = 0.6;
          g.strokeStyle = INK;
          g.beginPath();
          g.arc(px, py, 1.5, 0, Math.PI * 2);
          g.stroke();
          g.lineWidth = 0.45;
          g.strokeStyle = rubble ? "#7a7064" : pad.zone === "neutral" ? "#f4ecd8" : tc(pad.side);
          g.beginPath();
          g.arc(px, py, 1.5, 0, Math.PI * 2);
          g.stroke();
          continue;
        }
        if (st.structure.type === "core") continue;
        const def = w.data.structures.types[st.structure.type];
        const col = tc(st.team);
        g.save();
        if (!st.structure.ready) g.globalAlpha *= 0.55;
        const gold = st.structure.level > 1;
        if (def.class === "production") {
          g.fillStyle = INK;
          g.fillRect(px - 1.9, py - 1.9, 3.8, 3.8);
          g.fillStyle = gold ? "#ffd040" : col;
          g.fillRect(px - 1.45, py - 1.45, 2.9, 2.9);
          if (gold) {
            g.fillStyle = col;
            g.fillRect(px - 0.95, py - 0.95, 1.9, 1.9);
          }
        } else {
          g.fillStyle = INK;
          g.beginPath();
          g.moveTo(px, py - 2.4);
          g.lineTo(px + 2.1, py + 1.5);
          g.lineTo(px - 2.1, py + 1.5);
          g.closePath();
          g.fill();
          g.fillStyle = gold ? "#ffd040" : col;
          g.beginPath();
          g.moveTo(px, py - 1.6);
          g.lineTo(px + 1.45, py + 1.05);
          g.lineTo(px - 1.45, py + 1.05);
          g.closePath();
          g.fill();
          if (gold) dot(px, py, 0.55, col, col, 0.1);
        }
        g.restore();
      }
      for (let team = 0; team < w.teamCount; team++) {
        const c = w.core(team);
        const co = t.cores.find((k) => (k.team ?? 0) === team);
        if (!co) continue;
        const [kx, ky] = P(co.x, co.z);
        const out = !c?.alive || w.teams[team].out;
        g.fillStyle = INK;
        g.fillRect(kx - 3, ky - 3, 6, 6);
        g.fillStyle = out ? "#3a3430" : "#ffd040";
        g.fillRect(kx - 2.5, ky - 2.5, 5, 5);
        g.fillStyle = out ? "#5a524a" : tc(team);
        g.fillRect(kx - 1.9, ky - 1.9, 3.8, 3.8);
        if (out) {
          g.strokeStyle = "#ff4030";
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(kx - 2, ky - 2);
          g.lineTo(kx + 2, ky + 2);
          g.moveTo(kx + 2, ky - 2);
          g.lineTo(kx - 2, ky + 2);
          g.stroke();
        } else if (c) {
          const f = Math.max(0, c.hp / c.maxHp);
          g.fillStyle = INK;
          g.fillRect(kx - 3, ky + 3.4, 6, 1.4);
          g.fillStyle = f > 0.5 ? "#6ae04a" : f > 0.25 ? "#ffd040" : "#ff4030";
          g.fillRect(kx - 2.6, ky + 3.7, 5.2 * f, 0.8);
        }
      }
      const lan = w.mapEvents.lantern;
      if (lan) {
        const [lx, ly] = P(lan.x, lan.z);
        const pulse = 1.4 + Math.sin(now * 6) * 0.35;
        dot(lx, ly, pulse + 0.9, "rgba(90,255,110,0.35)", "rgba(0,0,0,0)", 0);
        dot(lx, ly, 1.3, "#7aff8a", INK, 0.5);
      }
      const og = w.arena.ogreId ? w.get(w.arena.ogreId) : undefined;
      if (og?.alive) {
        const [ox, oy] = P(og.transform.pos.x, og.transform.pos.z);
        g.fillStyle = INK;
        g.beginPath();
        g.moveTo(ox - 2.4, oy - 2.6);
        g.lineTo(ox - 1.2, oy - 1.4);
        g.lineTo(ox + 1.2, oy - 1.4);
        g.lineTo(ox + 2.4, oy - 2.6);
        g.lineTo(ox + 2.1, oy + 0.4);
        g.arc(ox, oy + 0.4, 2.1, 0, Math.PI);
        g.closePath();
        g.fill();
        g.fillStyle = "#8a9a4a";
        g.beginPath();
        g.arc(ox, oy + 0.2, 1.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#f4ecd8";
        g.fillRect(ox - 1.9, oy - 2.1, 0.7, 0.9);
        g.fillRect(ox + 1.2, oy - 2.1, 0.7, 0.9);
      }
      const r = w.arena.relic;
      if (r.state !== "waiting") {
        const carrier = r.state === "carried" ? w.getAny(r.carrier) : undefined;
        const [rx, ry] = carrier ? P(carrier.transform.pos.x, carrier.transform.pos.z) : P(r.x, r.z);
        const ry2 = carrier ? ry - 3.2 : ry;
        const k = 1.9 + (r.state === "carried" || r.state === "dropped" ? Math.sin(now * 8) * 0.35 : 0);
        g.fillStyle = INK;
        g.beginPath();
        g.moveTo(rx, ry2 - k - 0.7);
        g.lineTo(rx + k + 0.6, ry2);
        g.lineTo(rx, ry2 + k + 0.7);
        g.lineTo(rx - k - 0.6, ry2);
        g.closePath();
        g.fill();
        g.fillStyle = r.state === "shrined" ? tc(r.team) : "#ffd040";
        g.beginPath();
        g.moveTo(rx, ry2 - k);
        g.lineTo(rx + k, ry2);
        g.lineTo(rx, ry2 + k);
        g.lineTo(rx - k, ry2);
        g.closePath();
        g.fill();
        g.fillStyle = "#fff4c8";
        g.fillRect(rx - 0.35, ry2 - k * 0.55, 0.7, 0.7);
      } else {
        const [rx, ry] = P(w.arena.home.x, w.arena.home.z);
        g.strokeStyle = "rgba(255,216,112,0.6)";
        g.lineWidth = 0.6;
        g.beginPath();
        g.arc(rx, ry, 1.6, 0, Math.PI * 2);
        g.stroke();
      }
      for (const e of w.entities) {
        if (!e.alive || !e.hero || e.hero.dead || e.status.hidden) continue;
        const [hx, hy] = P(e.transform.pos.x, e.transform.pos.z);
        const a = e.transform.facing;
        const fx = Math.sin(a);
        const fz = Math.cos(a);
        const R = 2.5;
        if (w.time < (e.status.hauntUntil ?? 0)) dot(hx, hy, R + 0.9, "rgba(90,255,110,0.4)", "rgba(0,0,0,0)", 0);
        const tri = (k: number) => {
          g.beginPath();
          g.moveTo(hx + fx * R * k, hy + fz * R * k);
          g.lineTo(hx - fx * R * 0.7 * k - fz * R * 0.75 * k, hy - fz * R * 0.7 * k + fx * R * 0.75 * k);
          g.lineTo(hx - fx * R * 0.3 * k, hy - fz * R * 0.3 * k);
          g.lineTo(hx - fx * R * 0.7 * k + fz * R * 0.75 * k, hy - fz * R * 0.7 * k - fx * R * 0.75 * k);
          g.closePath();
        };
        tri(1.35);
        g.fillStyle = INK;
        g.fill();
        tri(1.05);
        g.fillStyle = "#ffffff";
        g.fill();
        tri(0.72);
        g.fillStyle = tc(e.team);
        g.fill();
      }
      g.restore();
      g.strokeStyle = "rgba(255,216,112,0.55)";
      g.lineWidth = 0.4;
      g.strokeRect(x0 + 0.2, y0 + 0.2, mw - 0.4, mh - 0.4);
      g.restore();
    });
  }

  private bannerLineY = MARGIN_Y + 19;

  private drawRelic(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, now: number, hideLine = false): void {
    const r = w.arena.relic;
    const cfg = w.data.match.arena.relic;
    let text: string;
    let col = "#ffd870";
    if (r.state === "waiting") {
      const left = Math.ceil(r.since - w.time);
      text = `THE GRUDGE WAKES IN ${left}`;
      col = "#c8b890";
    } else if (r.state === "home") text = "THE GRUDGE AWAITS";
    else if (r.state === "carried") {
      const c = w.getAny(r.carrier);
      col = c ? this.teamColors[c.team] : col;
      text = r.channel > 0 ? `ENSHRINING · ${Math.ceil(cfg.enshrineSeconds - r.channel)}` : `P${(c?.hero?.player ?? 0) + 1} CARRIES THE GRUDGE · TO A TOWER, OUTPOST OR KEEP`;
    } else if (r.state === "shrined") {
      const s = w.get(r.shrineId);
      const where = s?.structure?.type === "core" ? "KEEP" : s?.structure && w.data.structures.types[s.structure.type as "barracks"]?.class === "production" ? "OUTPOST" : "TOWER";
      col = this.teamColors[r.team] ?? col;
      text = r.channel > 0 ? `STEALING THE GRUDGE · ${Math.ceil(cfg.stealSeconds - r.channel)}` : `${w.teamName(r.team)} HOLDS THE GRUDGE · ${where}`;
    } else {
      const left = Math.max(0, Math.ceil(cfg.returnSeconds - (w.time - r.since)));
      text = `GRUDGE LOOSE · ${left}`;
    }
    const y = MARGIN_Y + (w.match.phase === "sudden" ? 27 : 19);
    const flash = r.state === "carried" || r.state === "dropped" || (r.state === "shrined" && r.channel > 0) ? Math.floor(now * 3) % 2 === 0 : false;
    if (!hideLine) drawText(ctx, text, Math.round((W - textWidth(text, 0.72)) / 2), y, flash ? "#ffffff" : col, 0.72);
    if (r.state === "waiting" || !this.locate) return;
    const lift = r.state === "carried" ? 4.5 : r.state === "shrined" ? 6 : 1.5;
    const sp = this.locate(r.x, r.y + lift, r.z);
    const k = W / window.innerWidth;
    const sx = sp.x * k;
    const sy = sp.y * (H / window.innerHeight);
    const pad = 12;
    if (sx >= pad && sx <= W - pad && sy >= pad + 24 && sy <= H - pad) return;
    const cx = W / 2;
    const cy = H / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const s = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad) / Math.max(1e-3, Math.abs(dy)));
    const ex = cx + dx * s;
    const ey = Math.max(pad + 24, cy + dy * s);
    const ang = Math.atan2(dy, dx);
    const bob = Math.sin(now * 8) * 1.5;
    ctx.save();
    ctx.translate(ex - Math.cos(ang) * bob, ey - Math.sin(ang) * bob);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -6);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }

  private drawClock(ctx: CanvasRenderingContext2D, W: number, w: World, now: number): void {
    const m = w.data.match;
    const sudden = w.match.phase === "sudden";
    const remain = sudden ? m.matchSeconds + m.suddenDeathSeconds - w.time : m.matchSeconds - w.time;
    const r = Math.max(0, Math.ceil(remain));
    const txt = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
    const s = 1.7;
    const low = r <= 30 && Math.floor(now * 2) % 2 === 0;
    const col = sudden ? "#ff5a3a" : low ? "#ffd040" : "#ffffff";
    drawNum(ctx, txt, Math.round((W - textWidth(txt, s, true)) / 2), MARGIN_Y - 1, col, s);
    if (sudden) {
      const lab = "SUDDEN DEATH";
      drawText(ctx, lab, Math.round((W - textWidth(lab, 0.8)) / 2), MARGIN_Y + 17, "#ff9a7a", 0.8);
    }
  }

  private drawTeam(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, ui: (MapperUi | null)[], t: number, now: number, F: Frame | null = null): void {
    const right = F ? F.right : t === 1;
    const col = this.teamColors[t];
    const blockW = 104;
    const x0 = F ? (right ? F.x + F.w - MARGIN_X - blockW : F.x + MARGIN_X) : right ? W - MARGIN_X - blockW : MARGIN_X;
    const ax = (dx: number, width = 0) => (right ? x0 + blockW - dx - width : x0 + dx);
    const ts = w.teams[t];
    const core = w.core(t);
    const shield = !!core?.structure?.shielded && !w.isSudden();
    const y00 = (F ? F.y : 0) + MARGIN_Y + 2;
    const ward = core?.structure?.ward ?? 0;
    const sudden = w.isSudden();
    this.shownCoin[t] += (ts.resource - this.shownCoin[t]) * Math.min(1, 0.25);
    const coin = String(Math.round(this.shownCoin[t]));
    const army = `${ts.unitCount}/${w.data.units.popCap}`;
    const capped = ts.unitCount >= w.data.units.popCap;
    const out = !!ts.out;
    const hpFrac = core && !out ? core.hp / core.maxHp : 0;
    const wardFrac = ward > 0 && !sudden ? ward / w.data.structures.core.ward : 0;
    const lowPulse = hpFrac < 0.25 ? Math.floor(now * 4) % 2 : 0;
    const headKey = [x0, y00, right, col, Math.round(hpFrac * 200), Math.round(wardFrac * 200), lowPulse, coin, army, capped, out].join("|");
    let y = this.memo(ctx, `head${t}`, headKey, x0 - 8, y00 - 6, blockW + 16, 40, (c) => {
      const y = y00;
      const gx = ax(8);
      keepGem(c, gx, y + 10, 7.2, col, hpFrac, wardFrac, now);
      if (out) {
        fallenMark(c, gx, y + 10, 7);
        const lab = `${TEAM_NAMES[t] ?? ""} HOUSE FELL`;
        drawText(c, lab, right ? ax(20, textWidth(lab, 0.62)) : ax(20), y + 6, "#ffb8a0", 0.62);
        return y + 24;
      }
      const cw = 8 + textWidth("×", 0.9) + 1.5 + textWidth(coin, 1.15, true);
      const aw = 9 + textWidth("×", 0.9) + 1.5 + textWidth(army, 1.15, true);
      let cx = right ? ax(20, cw) : ax(20);
      coinIcon(c, cx + 3, y + 5, 3.8);
      cx += 8;
      cx += times(c, cx, y + 1);
      drawNum(c, coin, cx, y, "#ffd848", 1.15);
      let bx = right ? ax(20, aw) : ax(20);
      armyIcon(c, bx + 3.5, y + 15, 3.6, col);
      bx += 9;
      bx += times(c, bx, y + 11);
      drawNum(c, army, bx, y + 10, capped ? "#ff8a6a" : "#ffffff", 1.15);
      return y + 24;
    });

    let bxc = 0;
    for (const p of w.players) {
      const e = w.getAny(p.heroId);
      if (!e?.hero || e.team !== t || !e.alive) continue;
      const relic = w.arena.carrying(e);
      if (!relic && !e.hero.bomb) continue;
      const lab = relic ? "GRUDGE" : "A THROW";
      const lw = textWidth(lab, 0.7);
      const tag = w.players.filter((q) => q.team === t).length > 1 ? `P${p.player + 1} ` : "";
      const tw = tag ? textWidth(tag, 0.7) : 0;
      const bw = 12 + tw + lw;
      const x = right ? ax(bxc, bw) : ax(bxc);
      if (relic) relicIcon(ctx, x + 5, y + 6.5, 3.6);
      else bombIcon(ctx, x + 5, y + 7, 3.6, now);
      if (tag) drawText(ctx, tag, x + 12, y + 3, "#d8d0c0", 0.7);
      drawText(ctx, lab, x + 12 + tw, y + 3, relic ? (Math.floor(now * 3) % 2 ? "#ffe890" : "#ffffff") : "#ffc0a0", 0.7);
      bxc += bw + 6;
    }
    if (bxc > 0) y += 14;
    if (out) return;
    const anyLocal = ui.some(Boolean);
    const teamHeroes = w.players.filter((p) => p.team === t && !p.commander);
    const shown = teamHeroes.filter((p, k) => !!ui[p.player] || (!anyLocal && k === 0));
    const rectPx = (pl: number) => {
      const r = F ? null : this.rectOf?.(pl);
      return r ? { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H } : null;
    };
    for (const p of shown) {
      const e = w.getAny(p.heroId);
      if (!e?.hero) continue;
      const r = rectPx(p.player);
      const px0 = r ? (right ? r.x + r.w - MARGIN_X - blockW : r.x + MARGIN_X) : x0;
      const py0 = r ? (r.y < 2 ? y + 2 : r.y + MARGIN_Y + 2) : y + 2;
      const local = !!ui[p.player];
      const tag = shown.length > 1 || teamHeroes.length > 1 ? `P${p.player + 1}` : "";
      const h = this.memo(ctx, `pp${p.player}`, this.panelKey(w, e, px0, py0, blockW, right, now, local, tag), px0 - 10, py0 - 6, blockW + 20, 64, (c) => this.drawPlayerPanel(c, w, e, px0, py0, blockW, right, now, local, tag));
      this.panelAt[p.player] = { x: right ? px0 + blockW : px0, y: py0 + h, right };
      if (!r) y = py0 + h;
    }
    const crossOf = (pl: number | undefined): [number, number] => {
      if (F) return [right ? F.x + F.w - MARGIN_X - 62 : F.x + MARGIN_X + 62, F.y + F.h - 58];
      const r = pl === undefined ? null : rectPx(pl);
      if (!r) return [right ? W - MARGIN_X - 62 : MARGIN_X + 62, H - 58];
      return [right ? r.x + r.w - MARGIN_X - 62 : r.x + MARGIN_X + 62, r.y + r.h - 58];
    };
    const slot = w.players.find((p) => p.team === t && !p.commander);
    const cmd = w.players.find((p) => p.team === t && p.commander);
    const mui = slot ? ui[slot.player] : null;
    const cui = cmd ? ui[cmd.player] : null;
    const opener = w.players.find((p) => p.team === t && ui[p.player] && ui[p.player]!.buildMenu !== "closed");
    const menuUi = opener ? ui[opener.player] : null;
    const menuHero = opener?.heroId;
    const firstLocal = w.players.find((p) => p.team === t && ui[p.player]);
    let [crossX, crossY] = crossOf(opener?.player ?? firstLocal?.player);
    const nt = this.notices[t];
    if (now < nt.until) {
      const age = 2 - (nt.until - now);
      const jolt = age < 0.25 ? Math.sin(age * 60) * (1 - age / 0.25) * 2.5 : 0;
      const money = nt.text.startsWith("NEED");
      const s = money ? 1 : 0.85;
      const tw = textWidth(nt.text, s);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (nt.until - now) * 3);
      if (money) {
        const cw = 9;
        const bx = Math.round(crossX - (tw + cw) / 2 + jolt);
        coinIcon(ctx, bx + 3.5, crossY - 43.5, 3.5);
        drawText(ctx, nt.text, bx + cw, crossY - 48, "#ff7060", s);
      } else {
        const maxW = Math.min(150, W / 2 - 12);
        const lines = hudWrap(nt.text, maxW, s);
        lines.forEach((ln, k) => {
          const lw = textWidth(ln, s);
          const lo = F ? F.x + 4 : right ? W / 2 + 4 : 4;
          const hi = F ? F.x + F.w - 4 : right ? W : W / 2;
          const lx = Math.max(lo, Math.min(hi - (F ? 0 : 4) - lw, crossX - lw / 2 + jolt));
          drawText(ctx, ln, Math.round(lx), crossY - 48 - (lines.length - 1 - k) * 9, "#ffd0a0", s);
        });
      }
      ctx.restore();
    }
    const aimer = w.players.map((p) => w.getAny(p.heroId)).find((e) => e?.team === t && e.hero?.aim);
    if (aimer?.hero?.aim) {
      const left = Math.max(0, Math.ceil(aimer.hero.aim.until - w.time));
      const l1 = `AIM THE CANNON · ${left}`;
      const l2 = "A FIRE · B CANCEL";
      drawText(ctx, l1, Math.round(crossX - textWidth(l1, 0.85) / 2), crossY - 8, Math.floor(now * 4) % 2 ? "#ffd870" : "#ffffff", 0.85);
      drawText(ctx, l2, Math.round(crossX - textWidth(l2, 0.72) / 2), crossY + 6, "#e8e0d0", 0.72);
      return;
    }
    for (const learner of w.players.filter((p) => p.team === t && ui[p.player]?.learnReady && ui[p.player]!.buildMenu === "closed")) {
      const at = this.panelAt[learner.player];
      if (at) this.drawLearnCards(ctx, W, at.x, at.y + 2, w, learner.heroId, at.right, now);
    }
    if (menuUi && menuHero !== undefined) {
      const c = this.buildCross(w, t, menuHero, menuUi);
      if (c) this.drawCross(ctx, crossX, crossY, c, right, 1);

      return;
    }
    const o = this.orders[t];
    const team = w.players.filter((p) => p.team === t).sort((a, b) => Number(b.commander) - Number(a.commander));
    const pickerP = team.find((p) => !!ui[p.player]);
    const picker = pickerP ? ui[pickerP.player] : null;
    if (pickerP) [crossX, crossY] = crossOf(pickerP.player);
    const group = picker?.group ?? "all";
    this.drawOrders(ctx, W, H, w, t, right, now, picker ? group : null, F);
    if (!picker) {
      if (now < o.until) this.orderCross(ctx, crossX, crossY, w, t, o.type, right, Math.min(1, (o.until - now) * 2.5), now, false);
      return;
    }
    const recent = Math.max(picker.lastOrderAt, picker.groupAt);
    const fresh = now - recent < 1.6;
    if (this.dense && !fresh) return;
    this.orderCross(ctx, crossX, crossY, w, t, group, right, fresh ? 1 : 0.5, now, now - picker.groupAt < 1.6);
    void mui;
    void cui;
  }

  private orderCross(ctx: CanvasRenderingContext2D, x: number, y: number, w: World, t: number, group: UnitType | "all", right: boolean, alpha: number, now: number, groupHint: boolean): void {
    const ts = w.teams[t];
    const order: Directive[] = ["push", "follow", "defend", "hold"];
    const cur = group === "all" ? (UNIT_TYPES.every((k) => ts.directives[k] === ts.directives.grunt) ? ts.directives.grunt : null) : ts.directives[group];
    const lit = cur ? order.indexOf(cur) : -1;
    this.drawCross(ctx, x, y, { title: `ORDER ${TYPE_NAME[group]}`, items: order.map((d) => [DIR_NAME[d], ""]), lit, until: 0 }, right, alpha);
    if (groupHint) {
      const hint = "D-PAD LEFT / RIGHT: WHO OBEYS";
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha + 0.2) * (Math.floor(now * 4) % 2 ? 1 : 0.85);
      drawText(ctx, hint, Math.round(x - textWidth(hint, 0.6) / 2), y + 22, "#ffe070", 0.6);
      ctx.restore();
    }
  }

  portraits: Portraits | null = null;

  private drawOrders(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, t: number, right: boolean, now: number, selected: UnitType | "all" | null, F: Frame | null = null): void {
    const ts = w.teams[t];
    const o = this.orders[t];
    const counts: Record<UnitType, number> = { grunt: 0, ranged: 0, heavy: 0 };
    for (const e of w.entities) if (e.alive && e.unit && e.team === t) counts[e.unit.type]++;
    const cw = 25;
    const pw = cw * 3;
    const ph = 26;
    const x0 = F ? (right ? F.x + F.w - MARGIN_X - pw : F.x + MARGIN_X) : right ? W - MARGIN_X - pw : MARGIN_X;
    const y0 = (F ? F.y + F.h : H) - ph - 6;
    const flash = now < o.until - 1.2;
    const key = [x0, y0, right, selected, flash, o.type, ...UNIT_TYPES.map((k) => `${counts[k]}${ts.directives[k]}${!!this.portraits?.unitIcon(k, t)}`)].join("|");
    this.memo(ctx, `orders${t}`, key, x0 - 6, y0 - 6, pw + 12, ph + 12, (c) => {
      this.drawOrdersBody(c, x0, y0, pw, ph, cw, t, ts, o, counts, selected, flash, right);
      return 0;
    });
  }

  private drawOrdersBody(ctx: CanvasRenderingContext2D, x0: number, y0: number, pw: number, ph: number, cw: number, t: number, ts: World["teams"][number], o: { type: UnitType | "all"; until: number }, counts: Record<UnitType, number>, selected: UnitType | "all" | null, flash: boolean, right = false): void {
    void pw;
    void ph;
    const r = 9.5;
    const order = right ? [...UNIT_TYPES].reverse() : UNIT_TYPES;
    order.forEach((k, i) => {
      const x = x0 + cw / 2 + i * cw;
      const y = y0 + r + 1;
      const sel = !!selected && (selected === "all" || selected === k);
      const hit = flash && (o.type === "all" || o.type === k);
      ctx.save();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a1c12";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      const icon = this.portraits?.unitIcon(k, t);
      if (icon) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r - 1.2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(icon, x - r - 1, y - r - 2, r * 2 + 2, r * 2 + 2);
        ctx.restore();
      }
      ctx.lineWidth = sel || hit ? 1.8 : 1.1;
      ctx.strokeStyle = hit ? "#fff4c0" : sel ? "#ffd040" : "#a07a34";
      ctx.beginPath();
      ctx.arc(x, y, r - 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      orderBadge(ctx, x + r * 0.74, y - r * 0.74, ts.directives[k], t === 1 || right);
      const n = String(counts[k]);
      const nw = textWidth(n, 0.6, true);
      const pw2 = Math.max(7, nw + 4);
      ctx.fillStyle = INK;
      ctx.fillRect(Math.round(x - pw2 / 2 - 1), Math.round(y + r - 3), Math.round(pw2 + 2), 9);
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(Math.round(x - pw2 / 2), Math.round(y + r - 2), Math.round(pw2), 7);
      drawNum(ctx, n, Math.round(x - nw / 2), Math.round(y + r - 2), counts[k] ? "#fff4d8" : "#9a8a70", 0.6);
    });
  }

  private mini: { x: number; y: number; w: number; h: number } | null = null;
  private panelAt: Record<number, { x: number; y: number; right: boolean }> = {};

  private drawLearnCards(ctx: CanvasRenderingContext2D, W: number, ax0: number, top: number, w: World, heroId: number, right: boolean, now: number): void {
    const hero = w.getAny(heroId);
    const opt = hero?.alive ? options(w, hero) : null;
    if (!opt || !hero?.hero) return;
    const owned = new Set((["r", "b", "a", "z"] as const).flatMap((sl) => learned(w, hero, sl).map((t) => t.id)));
    const r = 12;
    const gap = 8;
    const tw = r * 4 + gap;
    const x0 = right ? Math.min(W - 4, ax0) - tw : Math.max(4, ax0);
    const yc = Math.round(top + r + 2);
    const bob = Math.sin(now * 4) * 0.8;
    opt.list.forEach((o, k) => {
      const x = x0 + r + k * (r * 2 + gap);
      const y = yc + (k ? -bob : bob);
      const syn = (o.with ?? []).some((q) => owned.has(q.id));
      ctx.save();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a1c12";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = syn ? 2 : 1.1;
      ctx.strokeStyle = syn ? (Math.floor(now * 4) % 2 ? "#ff3a2a" : "#c81810") : "#c89a40";
      ctx.beginPath();
      ctx.arc(x, y, r - (syn ? 0.6 : 0.9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const im = talentImgs.get(o.id);
      if (im?.complete && im.naturalWidth) {
        const sz = r * 1.45;
        onHiLayer(ctx, (c) => {
          c.save();
          c.beginPath();
          c.arc(x, y, r - 1.6, 0, Math.PI * 2);
          c.clip();
          c.imageSmoothingEnabled = true;
          c.drawImage(im, x - sz / 2, y - sz / 2, sz, sz);
          c.restore();
        });
      }
      const bx = x + (k ? r * 0.72 : -r * 0.72);
      const by = y + r * 0.72;
      onHiLayer(ctx, (c) => {
        padButton(c, bx, by, 3.6, "#e8c030", "");
        c.fillStyle = INK;
        c.beginPath();
        const d = k ? 1 : -1;
        c.moveTo(bx + d * 1.9, by);
        c.lineTo(bx - d * 1.2, by - 1.7);
        c.lineTo(bx - d * 1.2, by + 1.7);
        c.closePath();
        c.fill();
      });
    });
  }

  private buildCross(w: World, team: number, heroId: number, mui: MapperUi): Cross | null {
    const hero = w.getAny(heroId);
    if (!hero?.alive) return null;
    if (mui.buildMenu === "learn") {
      const opt = options(w, hero);
      if (!opt) return { title: "NOTHING TO LEARN", items: [["", ""], ["", ""], ["", ""], ["LATER", ""]], lit: -1, until: 0 };
      return { title: `EVOLVE ${opt.slot.toUpperCase()}`, items: [["", ""], [opt.list[0]?.name ?? "", ""], [opt.list[1]?.name ?? "", ""], ["LATER", ""]], lit: -1, until: 0 };
    }
    if (mui.buildMenu === "shop") {
      const sh = w.data.match.arena.shop;
      const ts = w.teams[team];
      const k = (n: number) => String(Math.round(n * w.costMul()));
      const wardWait = Math.ceil(ts.wardReadyAt - w.time);
      return { title: "KEEP SHOP", items: [["BOMB", k(sh.bomb.cost)], ["SHIELD", wardWait > 0 ? `${wardWait}S` : k(sh.ward.cost)], ["CANNON", k(sh.cannon.cost)], ["CANCEL", ""]], lit: -1, until: 0 };
    }
    const pad = padNear(w, hero);
    if (!pad) return { title: "NO PAD HERE", items: [["", ""], ["", ""], ["", ""], ["", ""]], lit: -1, until: 0 };
    const c = (k: Parameters<typeof buildCost>[1]) => String(buildCost(w, k, false, team));
    const st = pad.structureId ? w.get(pad.structureId) : undefined;
    if (st?.structure && st.team === team) {
      const up = st.structure.level < 2 ? String(buildCost(w, st.structure.type as Parameters<typeof buildCost>[1], true, team)) : "";
      return { title: st.structure.level < 2 ? "UPGRADE" : "MAX LEVEL", items: [[up ? "UPGRADE" : "", up], ["", ""], ["", ""], ["CANCEL", ""]], lit: -1, until: 0 };
    }
    return mui.buildMenu === "tower"
      ? { title: "TOWERS", items: [["DAMAGE", c("damage")], ["CONTROL", c("control")], ["", ""], ["CANCEL", ""]], lit: -1, until: 0 }
      : w.terrain.outposts
        ? { title: "OUTPOSTS", items: [["OUTPOST", c("outpost")], ["", ""], ["", ""], ["CANCEL", ""]], lit: -1, until: 0 }
        : { title: "OUTPOSTS", items: [["RANGE", c("range")], ["BARRACKS", c("barracks")], ["FOUNDRY", c("foundry")], ["CANCEL", ""]], lit: -1, until: 0 };
  }

  private crossN = 0;

  private drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, c: Cross, right: boolean, alpha: number): void {
    const key = [x, y, c.title, c.items.flat().join(","), c.lit, alpha].join("|");
    const side = (i: number) => Math.max(textWidth(c.items[i][0], 0.75), c.items[i][1] ? textWidth(c.items[i][1], 0.8, true) : 0);
    const half = Math.max(textWidth(c.title, 0.8) / 2, textWidth(c.items[0][0], 0.75) / 2, textWidth(c.items[3][0], 0.75) / 2, 9 + 4.6 + 3 + Math.max(side(1), side(2))) + 6;
    const top = 9 + (c.items[0][1] ? 32 : 23) + 6;
    this.memo(ctx, `cross${this.crossN++}`, key, x - half, y - top, half * 2, top + 9 + 5 + 8 + 12 + 6, (g) => {
      this.drawCrossBody(g, x, y, c, right, alpha);
      return 0;
    });
  }

  private drawCrossBody(ctx: CanvasRenderingContext2D, x: number, y: number, c: Cross, right: boolean, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = 4.6;
    const d = 9;
    const pos: [number, number, number][] = [[0, -d, -Math.PI / 2], [-d, 0, Math.PI], [d, 0, 0], [0, d, Math.PI / 2]];
    const tw = textWidth(c.title, 0.8);
    drawText(ctx, c.title, x - tw / 2, y - d - (c.items[0][1] ? 32 : 23), "#ffffff", 0.8);
    pos.forEach(([dx, dy, ang], i) => {
      cArrow(ctx, x + dx, y + dy, r, ang, c.lit < 0 || c.lit === i);
      const [label, cost] = c.items[i];
      if (!label) return;
      const lit = c.lit < 0 || c.lit === i;
      const col = lit ? "#ffffff" : "#8a8478";
      const lw = textWidth(label, 0.75);
      let lx: number;
      let ly: number;
      if (i === 0) {
        lx = x - lw / 2;
        ly = y - d - 13;
      } else if (i === 3) {
        lx = x - lw / 2;
        ly = y + d + 5;
      } else if (i === 1) {
        lx = x - d - r - 3 - lw;
        ly = y - 4;
      } else {
        lx = x + d + r + 3;
        ly = y - 4;
      }
      drawText(ctx, label, lx, ly, col, 0.75);
      if (cost) {
        const cw = textWidth(cost, 0.8, true);
        const cx = i === 1 ? lx + lw - cw : i === 2 ? lx : lx + lw / 2 - cw / 2;
        const cy = i === 3 ? ly + 8 : i === 0 ? ly - 9 : ly + 8;
        drawNum(ctx, cost, cx, cy, "#ffd848", 0.8);
      }
    });
    void right;
    ctx.restore();
  }
}
