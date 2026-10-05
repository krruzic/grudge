// Shared menu types, palette and small helpers for the menu pages (src/ui/menus/*).
import { drawPlain, textWidth } from "../font";
import { goldArrow } from "../uiPaint";
import type { Hit } from "../cursor";

export type Page =
  "main" | "training" | "players" | "network" | "browse" | "rules" | "options" | "records" | "controls" | "codex";

/** A battle posted on the server (browse page). */
export interface RoomInfo {
  id: number;
  name: string;
  mode: string;
  map: string;
  humans: number;
  seats: number;
  phase: string;
  age: number;
}

/** One frame of menu navigation (see app/nav.ts): a single step per direction plus button presses. */
export interface Nav {
  dx: number;
  dy: number;
  a: boolean;
  b: boolean;
  y: boolean;
}

/** Mouse state in layout units for this frame. */
export interface Pointer {
  x: number;
  y: number;
  moved: boolean;
  click: boolean;
  right: boolean;
}

/** What the app should do after a menu update. "options" = settings changed, re-apply them. */
export type MenuResult = "fight" | "training" | "title" | "options" | "host" | "join" | "browse" | "leave" | null;

export type Sound = (k: "move" | "ok" | "back" | "page") => void;

/**
 * Mouse targets registered while drawing a page (ids like "row:3", "dec:1", "tab:0", "cpg:-1"); the next
 * update() hit-tests the pointer against them, topmost (last added) first.
 */
export class HitList {
  private hits: Hit[] = [];

  clear(): void {
    this.hits = [];
  }

  add(id: string, x: number, y: number, w: number, h: number): void {
    this.hits.push({ id, x, y, w, h });
  }

  at(x: number, y: number): string {
    for (let k = this.hits.length - 1; k >= 0; k--) {
      const h = this.hits[k];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
    }
    return "";
  }
}

export const INK = "#0b0806";
/** Body text on parchment. */
export const BROWN = "#3a2410";
/** House names and colours (team order). */
export const HOUSE = ["BLUE", "RED", "YELLOW", "GREEN", "PURPLE", "ORANGE", "TEAL", "PINK"];
export const TEAM_TEXT = ["#1c3aa8", "#a81c1c", "#8a6000", "#1a6a24", "#5a1c98", "#a04800", "#0a6a60", "#a01868"];
export const TEAM_CLOTH = ["#2a4ab8", "#b02a1c", "#c89a14", "#2a8a3a", "#7a38c8", "#d06810", "#109888", "#d02888"];
export const ROMAN_N = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Right-aligned number / short value ending at rx. */
export function num(
  ctx: CanvasRenderingContext2D,
  s: string | number,
  rx: number,
  y: number,
  color = BROWN,
  scale = 0.7,
): void {
  const t = String(s);
  drawPlain(ctx, t, rx - textWidth(t, scale, true), y, color, scale, true);
}

/** "M/D" of a timestamp. */
export function dateOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function upArrow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  goldArrow(ctx, 0, 0, 1, 5);
  ctx.restore();
}
