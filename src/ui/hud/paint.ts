// Shared HUD primitives: ink colour, controller button colours, rounded meters, controller-button discs, ring
// meters and layout constants. Also used by screens, menus and world-space hint bubbles (render/entities).
import { drawText, textWidth } from "../font";

/** Outline / shadow ink used by every painted element. */
export const INK = "#0b0806";
/** GameCube-style button colours. */
export const PAD = { a: "#2f5fd8", b: "#2a9a48", c: "#e8b818", start: "#d82828", z: "#8a8a94", r: "#8a8a94" };
/** "P1".."P4" tag colours on player panels. */
export const PLAYER_TAG = ["#8ab0ff", "#ff9a8a", "#ffd060", "#80e080", "#c8a0ff", "#ffc080", "#70e0d0", "#ff9ad0"];
/** Screen-edge margins of the HUD in layout units. */
export const MARGIN_X = 14;
export const MARGIN_Y = 10;

/** A sub-rectangle of the screen the HUD lays one team out in (FFA / split screen); `right` = mirror layout. */
export type Frame = { x: number; y: number; w: number; h: number; right: boolean };

/** Horizontal pill meter with an ink rim and a highlight line. */
export function meter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  frac: number,
  color: string,
): void {
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

/** A round controller button with its letter; `dim` greys it out (cooldown / unavailable). */
export function padButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  label: string,
  dim = false,
): void {
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

/** Circular progress ring starting at 12 o'clock. */
export function ringMeter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  frac: number,
  color: string,
): void {
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

/** Small "×" between an icon and its count. Returns its advance. */
export function times(ctx: CanvasRenderingContext2D, x: number, y: number): number {
  drawText(ctx, "×", x, y + 1, "#b8c4e8", 0.9);
  return timesWidth();
}

export function timesWidth(): number {
  return textWidth("×", 0.9) + 1.5;
}

/** Word-wraps HUD text to `width` layout units. */
export function wrapLines(s: string, width: number, scale: number): string[] {
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
