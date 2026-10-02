import { onHiLayer } from "./font";
import type { PadState } from "../input/gamepads";
const spriteUrls = import.meta.glob("../../assets/ui/{chip,glove,tag}_*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const IMG: Record<string, HTMLImageElement> = {};
for (const [p, u] of Object.entries(spriteUrls)) {
  const im = new Image();
  im.src = u;
  IMG[p.split("/").pop()!.replace(".png", "")] = im;
}

export interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Cursor {
  x: number;
  y: number;
  active: boolean;
  holding: number;
  hover: string;
  pressedAt: number;
  grabbable?: boolean;
}

export interface Chip {
  hero: string | null;
  x: number;
  y: number;
}

export type CursorAction =
  | { type: "place"; slot: number; hero: string }
  | { type: "pick"; slot: number; by: number }
  | { type: "hover"; slot: number; hero: string }
  | { type: "button"; id: string; by: number }
  | { type: "back"; by: number };

const CHIP_COLORS = ["#6a8cff", "#ff5a4a", "#ffd040", "#50d050"];

export class MenuCursors {
  readonly cursors: Cursor[];
  readonly chips: Chip[];
  hits: Hit[] = [];
  private mouse = { x: 0, y: 0, moved: false, down: false, right: false };
  mouseUsed = false;
  mouseSlot = -1;
  frozen = new Set<number>();
  tagOf: ((i: number) => number) | null = null;
  private scale = { w: 427, h: 240 };

  constructor(n: number) {
    this.cursors = Array.from({ length: n }, (_, i) => ({ x: 60 + i * 90, y: 150, active: false, holding: -1, hover: "", pressedAt: -1 }));
    this.chips = Array.from({ length: n }, () => ({ hero: null, x: 0, y: 0 }));
    window.addEventListener("mousemove", (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * this.scale.w;
      this.mouse.y = (e.clientY / window.innerHeight) * this.scale.h;
      this.mouse.moved = true;
      this.mouseUsed = true;
    });
    window.addEventListener("mousedown", (e) => {
      if (e.button === 2) this.mouse.right = true;
      else this.mouse.down = true;
      this.mouseUsed = true;
    });
    window.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  setScale(w: number, h: number): void {
    this.scale.w = w;
    this.scale.h = h;
  }

  reset(order: number[]): void {
    this.cursors.forEach((c, i) => {
      c.holding = -1;
      const k = order.indexOf(i);
      c.x = this.scale.w * (k >= 0 ? (k + 0.5) / order.length : 0.5);
      c.y = this.scale.h * 0.66;
    });
  }

  takeMouse(): { x: number; y: number; moved: boolean; click: boolean; right: boolean } {
    const m = this.mouse;
    const r = { x: m.x, y: m.y, moved: m.moved, click: m.down, right: m.right };
    m.moved = m.down = m.right = false;
    return r;
  }

  takeClick(): boolean {
    const d = this.mouse.down;
    this.mouse.down = false;
    this.mouse.right = false;
    return d;
  }

  at(x: number, y: number, prefix?: string): Hit | undefined {
    for (let k = this.hits.length - 1; k >= 0; k--) {
      const h = this.hits[k];
      if (prefix && !h.id.startsWith(prefix)) continue;
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return undefined;
  }

  chipAt(x: number, y: number, canTake: (slot: number) => boolean): number {
    for (let s = this.chips.length - 1; s >= 0; s--) {
      const c = this.chips[s];
      if (!c.hero || !canTake(s)) continue;
      if (Math.hypot(c.x - x, c.y - y) < 8) return s;
    }
    return -1;
  }

  update(pads: PadState[], dt: number, now: number, canTake: (slot: number, by: number) => boolean): CursorAction[] {
    const out: CursorAction[] = [];
    const W = this.scale.w;
    const H = this.scale.h;
    pads.forEach((p, i) => {
      const c = this.cursors[i];
      c.active = p.connected;
      if (!c.active) return;
      if (this.frozen.has(i)) {
        if (i === this.mouseSlot) this.mouse.moved = false;
        if (c.holding >= 0) {
          this.chips[c.holding].x = c.x + 3;
          this.chips[c.holding].y = c.y - 4;
        }
        return;
      }
      let a = p.pressed.a;
      let b = p.pressed.b;
      if (i === this.mouseSlot) {
        if (this.mouse.moved) {
          c.x = this.mouse.x;
          c.y = this.mouse.y;
          this.mouse.moved = false;
        }
        a ||= this.mouse.down;
        b ||= this.mouse.right;
      }
      const sx = p.stickX + (p.held.right ? 1 : 0) - (p.held.left ? 1 : 0);
      const sy = p.stickY + (p.held.down ? 1 : 0) - (p.held.up ? 1 : 0);
      const mag = Math.min(1, Math.hypot(sx, sy));
      if (mag > 0.15) {
        const sp = 90 + 230 * mag * mag;
        c.x += (sx / (Math.hypot(sx, sy) || 1)) * mag * sp * dt;
        c.y += (sy / (Math.hypot(sx, sy) || 1)) * mag * sp * dt;
      }
      c.x = Math.max(2, Math.min(W - 2, c.x));
      c.y = Math.max(2, Math.min(H - 2, c.y));
      const over = this.at(c.x, c.y);
      c.hover = over?.id ?? "";
      c.grabbable = c.holding < 0 && (over?.id.startsWith("hero:") || this.chipAt(c.x, c.y, (slot) => canTake(slot, i)) >= 0);
      if (c.holding >= 0) {
        const chip = this.chips[c.holding];
        chip.x = c.x + 3;
        chip.y = c.y - 4;
        if (over?.id.startsWith("hero:")) out.push({ type: "hover", slot: c.holding, hero: over.id.slice(5) });
      }
      if (a) {
        c.pressedAt = now;
        if (c.holding >= 0 && over?.id.startsWith("hero:")) {
          out.push({ type: "place", slot: c.holding, hero: over.id.slice(5) });
          const chip = this.chips[c.holding];
          chip.hero = over.id.slice(5);
          c.holding = -1;
        } else if (c.holding < 0) {
          const s = this.chipAt(c.x, c.y, (slot) => canTake(slot, i));
          if (s >= 0) {
            this.cursors.forEach((o) => { if (o.holding === s) o.holding = -1; });
            c.holding = s;
            this.chips[s].hero = null;
            out.push({ type: "pick", slot: s, by: i });
          } else if (over) out.push({ type: "button", id: over.id, by: i });
        } else if (over && !over.id.startsWith("hero:")) out.push({ type: "button", id: over.id, by: i });
      }
      if (b) out.push({ type: "back", by: i });
    });
    if (this.mouseSlot < 0 && this.mouse.down && !this.frozen.has(this.mouseSlot)) {
      const over = this.at(this.mouse.x, this.mouse.y);
      if (over && !over.id.startsWith("hero:")) out.push({ type: "button", id: over.id, by: -1 });
    }
    this.mouse.down = false;
    this.mouse.right = false;
    return out;
  }

  placeChip(slot: number, hero: string | null): void {
    this.chips[slot].hero = hero;
  }

  heroChipPos(slot: number, hero: string, pos: (hero: string) => { x: number; y: number } | null): void {
    const p = pos(hero);
    if (!p) return;
    const c = this.chips[slot];
    c.x = p.x + (slot % 2 ? 8 : -8) + (slot >= 2 ? 0 : 0);
    c.y = p.y + (slot >= 2 ? 10 : 0);
  }

  drawChips(low: CanvasRenderingContext2D, labels: string[], colors: string[]): void {
    onHiLayer(low, (ctx) => this.drawChipsOn(ctx, labels, colors));
  }

  private drawChipsOn(ctx: CanvasRenderingContext2D, labels: string[], colors: string[]): void {
    this.chipLabels = labels;
    this.chipCpu = labels.map((l, s) => l === "CPU" || colors[s] === "#8a8a90");
    this.chips.forEach((c, s) => {
      if (!labels[s]) return;
      const held = this.cursors.some((k) => k.active && k.holding === s);
      if (held) return;
      if (!c.hero) return;
      chip(ctx, c.x, c.y, s, labels[s] === "CPU" || colors[s] === "#8a8a90", held);
    });
  }

  private chipLabels: string[] = [];
  private chipCpu: boolean[] = [];

  drawCursors(low: CanvasRenderingContext2D, now: number): void {
    onHiLayer(low, (ctx) => this.drawCursorsOn(ctx, now));
  }

  private drawCursorsOn(ctx: CanvasRenderingContext2D, now: number): void {
    this.cursors.forEach((c, i) => {
      if (!c.active) return;
      const press = now - c.pressedAt < 0.12;
      if (c.holding >= 0 && this.chipLabels[c.holding]) {
        const ch = this.chips[c.holding];
        chip(ctx, ch.x, ch.y, c.holding, this.chipCpu[c.holding], false);
      }
      const tg = this.tagOf?.(i) ?? i;
      glove(ctx, c.x, c.y, tg >= 0 ? tg : i, c.holding >= 0 ? "glove_grab" : c.grabbable ? "glove_open" : "glove_point", press);
    });
  }
}

export function chipColor(slot: number, cpu: boolean): string {
  return cpu ? "#8a8a90" : CHIP_COLORS[slot];
}

function sprite(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, k: number): void {
  if (!im.complete || !im.naturalWidth) return;
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(im, x, y, im.naturalWidth * k, im.naturalHeight * k);
  ctx.imageSmoothingEnabled = smooth;
}

const tinted = new Map<string, HTMLCanvasElement>();
function tint(im: HTMLImageElement, color: string): HTMLCanvasElement | null {
  if (!im.complete || !im.naturalWidth) return null;
  const key = `${im.src}|${color}`;
  let c = tinted.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(im, 0, 0);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(im, 0, 0);
  tinted.set(key, c);
  return c;
}

const CHIP_K = 0.31;
const GLOVE_K = 0.37;

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, slot: number, cpu: boolean, lifted: boolean): void {
  const im = cpu ? IMG.chip_cp : IMG[`chip_${slot + 1}`];
  const w = im.naturalWidth * CHIP_K;
  const h = im.naturalHeight * CHIP_K;
  if (lifted) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, w / 2, h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  sprite(ctx, im, x - w / 2, y - h / 2 - (lifted ? 1 : 0), CHIP_K);
}

const TAG_COLORS = ["#3a6cff", "#ff2a1a", "#ffc820", "#30c030"];
const MID: Record<string, [number, number]> = { glove_point: [0.6, 0.6], glove_grab: [0.52, 0.55], glove_open: [0.58, 0.58] };
const HOT: Record<string, [number, number]> = { glove_point: [0.3, 0.03], glove_grab: [0.5, 0.15], glove_open: [0.5, 0.05] };

function glove(ctx: CanvasRenderingContext2D, x: number, y: number, slot: number, pose: "glove_point" | "glove_grab" | "glove_open", press: boolean): void {
  const im = IMG[pose];
  const k = GLOVE_K * (press ? 0.92 : 1);
  const [hx, hy] = HOT[pose];
  const gx = x - im.naturalWidth * k * hx;
  const gy = y - im.naturalHeight * k * hy;
  sprite(ctx, im, gx, gy, k);
  const tag = tint(IMG[`tag_${slot + 1}`], TAG_COLORS[slot]);
  if (tag) {
    const [cx, cy] = MID[pose];
    const tk = k * 0.85;
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tag, gx + im.naturalWidth * k * cx - (tag.width * tk) / 2, gy + im.naturalHeight * k * cy - (tag.height * tk) / 2, tag.width * tk, tag.height * tk);
    ctx.imageSmoothingEnabled = smooth;
  }
}
