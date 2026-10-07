// Shared palette and helpers for the full-screen screens (title, champion select, field select, results).
import type { MatchMode } from "../../game/save";
import { drawText, textWidth } from "../font";

export const INK = "#0b0806";
export const BROWN = "#3a2410";
/** Per team: card cloth, ink on parchment, bright frame, and select field colour. */
export const TEAM_CLOTH = ["#3a58e0", "#d83828", "#d8a818", "#2a9a40", "#8a40d8", "#e07818", "#18a898", "#e0389a"];
export const TEAM_TEXT = ["#1c3aa8", "#a81c1c", "#8a6000", "#1a6a24", "#5a1c98", "#a04800", "#0a6a60", "#a01868"];
export const TEAM_BRIGHT = ["#4a74ff", "#ff4a3a", "#ffcf2a", "#3ac85a", "#a868f0", "#ff9a38", "#38d8c4", "#ff5ab8"];
export const TEAM_FIELD = ["#4a64d8", "#c83a2a", "#c8a020", "#2a9a40", "#7a48c8", "#d07020", "#209888", "#d04090"];
export const MODE_NAME: Record<MatchMode, string> = {
  "1v1": "1 VS 1",
  "2v2": "2 VS 2",
  ffa: "FREE FOR ALL",
  tdm: "DEATHMATCH",
  ffadm: "FFA DEATHMATCH",
};

/** Outlined text centred horizontally on the screen. */
export function center(ctx: CanvasRenderingContext2D, W: number, s: string, y: number, color: string, scale = 1): void {
  drawText(ctx, s, Math.round((W - textWidth(s, scale)) / 2), y, color, scale);
}

/** Map names are "Grudge<Something> <Name>" in data; lists show just the name. */
export const shortMapName = (name: string): string => name.toUpperCase().replace(/^GRUDGE\w*\s*/, "");

/** Loads every image of an eager import.meta.glob into a map keyed by file name without extension. */
export function loadImages(urls: Record<string, string>, ext: string): Map<string, HTMLImageElement> {
  const out = new Map<string, HTMLImageElement>();
  for (const [path, url] of Object.entries(urls)) {
    const im = new Image();
    im.src = url;
    out.set(path.split("/").pop()!.replace(ext, ""), im);
  }
  return out;
}
