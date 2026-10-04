// Art used by the champion select cards: painted stage backdrops per hero, ability glyphs (the original seven
// heroes share one 96 px sheet, newer heroes have a strip each), costume icons, and the mini evolution tree.
// Glyphs are tinted once into a dark and a light copy (CPU cache canvases) and drawn as an embossed pair.
import glyphUrl from "../../../assets/ui/abilities.png?url";
import talentData from "../../../data/talents.json";
import { cacheCanvas } from "../cacheCanvas";
import { talentIcon } from "../hud/icons";
import { loadImages } from "./common";

const glob = (urls: Record<string, unknown>) => urls as Record<string, string>;

/** Painted backdrop behind each hero's 3D stage on its select card. */
export const stageArt = loadImages(
  glob(import.meta.glob("../../../assets/ui/stages/*.jpg", { query: "?url", import: "default", eager: true })),
  ".jpg",
);

const costumeIcons = loadImages(
  glob(import.meta.glob("../../../assets/ui/costume_icons/*.png", { query: "?url", import: "default", eager: true })),
  ".png",
);

export function costumeIcon(hero: string, costume: string): HTMLImageElement | null {
  const im = costumeIcons.get(`${hero}_${costume || "classic"}`);
  return im?.complete && im.naturalWidth ? im : null;
}

// ── Ability glyphs ──

type Glyph = { dark: HTMLCanvasElement; light: HTMLCanvasElement };

/** Columns of the shared glyph sheet (rows are the a / b / r / z abilities). */
const SHEET_HEROES = ["warlord", "engineer", "raider", "summoner", "duelist", "warden", "herald"];
const SHEET_CELL = 96;
const glyphSheet = new Image();
glyphSheet.src = glyphUrl;
const sheetCache = new Map<number, Glyph>();
const glyphStrips = loadImages(
  glob(import.meta.glob("../../../assets/ui/ability_glyphs/*.png", { query: "?url", import: "default", eager: true })),
  ".png",
);
const stripCache = new Map<string, Glyph>();

/** Dark (ink) and light (highlight) copies of one glyph cell. */
function tintPair(src: HTMLImageElement, sx: number, sy: number, size: number): Glyph {
  const tint = (color: string) => {
    const c = cacheCanvas();
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.drawImage(src, sx, sy, size, size, 0, 0, size, size);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color;
    g.fillRect(0, 0, size, size);
    return c;
  };
  return { dark: tint("#4a3018"), light: tint("#fff2d0") };
}

/** Glyph for ability `row` (0-3 = a, b, r, z) of a hero, or null until its image has loaded. */
export function heroGlyph(hero: string, row: number): Glyph | null {
  const col = SHEET_HEROES.indexOf(hero);
  if (col >= 0) {
    if (!glyphSheet.complete || !glyphSheet.naturalWidth) return null;
    const key = col * 4 + row;
    let hit = sheetCache.get(key);
    if (!hit) {
      hit = tintPair(glyphSheet, col * SHEET_CELL, row * SHEET_CELL, SHEET_CELL);
      sheetCache.set(key, hit);
    }
    return hit;
  }
  const strip = glyphStrips.get(hero);
  if (!strip?.complete || !strip.naturalWidth) return null;
  const key = `${hero}:${row}`;
  let hit = stripCache.get(key);
  if (!hit) {
    const C = strip.naturalHeight;
    hit = tintPair(strip, row * C, 0, C);
    stripCache.set(key, hit);
  }
  return hit;
}

// ── Evolution tree ──

type TreeNode = { id: string; next?: TreeNode[] };
const TREES = (talentData as unknown as { heroes: Record<string, Partial<Record<"a" | "b" | "r" | "z", TreeNode[]>>> })
  .heroes;

export const hasTree = (hero: string): boolean => !!TREES[hero];

/**
 * Two rows of evolution icons in a card's top corner: side "a" shows the R and B choices, side "b" the A and Z
 * choices; `right` mirrors the row so it grows inward from the right edge.
 */
export function drawTree(
  ctx: CanvasRenderingContext2D,
  hero: string,
  side: "a" | "b",
  x: number,
  y: number,
  right: boolean,
  k = 1,
): void {
  const tree = TREES[hero];
  if (!tree) return;
  const big = Math.round(11 * k);
  const slots: ("a" | "b" | "r" | "z")[] = side === "a" ? ["r", "b"] : ["a", "z"];
  slots.forEach((slot, row) => {
    const list = tree[slot] ?? [];
    const yy = y + row * (big + 4);
    list.forEach((t, j) => talentIcon(ctx, t.id, right ? x + (1 - j) * (big + 1) : x + j * (big + 1), yy, big));
  });
}
