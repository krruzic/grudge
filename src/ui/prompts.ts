// Shared text layout helpers for screens and menus: button prompt rows ("(A) SELECT  (B) BACK") and word wrap.
import { drawPlain, drawText, textWidth } from "./font";
import { PAD, padButton } from "./hud/paint";

/** A row of [button, label] prompts at (x, y). Light text with an outline, or flat `ink` text on parchment. */
export function prompt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  items: [string, string][],
  scale = 0.85,
  ink?: string,
): void {
  let cx = x;
  for (const [btn, label] of items) {
    const color = btn === "A" ? PAD.a : btn === "B" ? PAD.b : btn === "S" ? PAD.start : PAD.c;
    padButton(ctx, cx + 5, y + 4.5, 5, color, btn);
    cx += 13;
    if (ink) drawPlain(ctx, label, cx, y, ink, scale);
    else drawText(ctx, label, cx, y, "#ffffff", scale);
    cx += textWidth(label, scale) + 12;
  }
}

export function promptWidth(items: [string, string][], scale = 0.85): number {
  return items.reduce((a, [, l]) => a + 13 + textWidth(l, scale) + 12, -12);
}

/** Centred prompt row at the bottom of the screen. */
export function bottomPrompt(ctx: CanvasRenderingContext2D, W: number, H: number, items: [string, string][]): void {
  prompt(ctx, Math.round((W - promptWidth(items, 0.7)) / 2), H - 13, items, 0.7);
}

/** Upper-cases and word-wraps `s` to `width` layout units. */
export function wrap(s: string, width: number, scale = 1): string[] {
  const words = s.toUpperCase().split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (textWidth(next, scale) > width && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
