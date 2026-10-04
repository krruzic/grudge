// RULES and OPTIONS pages: a list of settings rows (plus RESTORE DEFAULTS / ERASE ALL RECORDS) on the left and
// a detail card on the right. Rules read as a decree (roman-numbered articles, the value on a cloth plaque);
// options show a dial with one notch per value. Left / right (or the arrows on the card) cycle the value.
import type { Row } from "../../game/save";
import { drawPlain, textWidth } from "../font";
import { band, boardTitle, card, goldArrow, inset, paintedText, texturedRect, waxSeal, woodDisc } from "../uiPaint";
import { wrap } from "../prompts";
import { BROWN, ROMAN_N } from "./common";
import { hintPrompt } from "./pages";
import type { Menus } from "../menus";

export function drawSettings(
  m: Menus,
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  art: string,
  fallback: string,
  rows: Row<object>[],
  obj: object,
  extra: string[],
): void {
  boardTitle(ctx, W, art, fallback);
  const decree = m.page === "rules";
  const total = rows.length + extra.length;
  const pw = Math.min(232, Math.round(W * 0.55));
  const px = 16;
  const py = 26;
  const ph = H - 52;
  const top = decree ? 24 : 12;
  const rh = Math.min(17, Math.floor((ph - top - 10) / total));
  const f = m.focus;
  const val = (k: number) => rows[k].fmt((obj as Record<string, number>)[rows[k].key as string]);

  // Left: the rows, with dotted leaders to the value.
  card(ctx, px, py, pw, ph, -0.015, null, () => {
    if (decree) {
      const t = "BY ORDER OF BOTH HOUSES";
      drawPlain(ctx, t, pw / 2 - textWidth(t, 0.6, true) / 2, 8, "#8a1810", 0.6, true);
      band(ctx, 14, 18, pw - 28, 1, "#6a4424", 0.5);
    }
    for (let k = 0; k < total; k++) {
      const y = top + k * rh + (k >= rows.length ? 4 : 0);
      const sel = k === f;
      m.hits.add(`row:${k}`, px + 4, py + y - 2, pw - 8, rh);
      if (sel) {
        ctx.fillStyle = "rgba(168,48,28,0.16)";
        ctx.fillRect(6, y - 2, pw - 12, rh - 1);
        goldArrow(ctx, 9, y + rh / 2 - 2, 1, 4);
      }
      const ty = y + rh / 2 - 6;
      if (k < rows.length) {
        const lead = decree ? `${ROMAN_N[k]}.  ` : "";
        const label = lead + rows[k].label;
        drawPlain(ctx, label, 18, ty, sel ? "#8a1810" : BROWN, 0.72, true);
        const v = val(k);
        const vx = pw - 12 - textWidth(v, 0.72, true);
        const lw = textWidth(label, 0.72, true) + 22;
        for (let dx = lw; dx < vx - 6; dx += 5) {
          ctx.fillStyle = "rgba(106,68,36,0.45)";
          ctx.fillRect(dx, ty + 6, 1.5, 1.5);
        }
        drawPlain(ctx, v, vx, ty, sel ? "#8a1810" : "#6a1c10", 0.72, true);
      } else {
        const t = extra[k - rows.length];
        drawPlain(ctx, t, pw / 2 - textWidth(t, 0.7, true) / 2, ty, sel ? "#8a1810" : "#6a4424", 0.7, true);
      }
    }
  });

  // Right: the focused row's detail card.
  const dx0 = px + pw + 16;
  const dw = W - dx0 - 14;
  const dh = ph - 8;
  const dy0 = py + 2;
  const blurb =
    f < rows.length
      ? rows[f].blurb
      : f === rows.length
        ? "PUT EVERYTHING BACK AS IT WAS."
        : m.confirm === "erase"
          ? "PRESS A AGAIN TO BURN EVERY RECORD. NAMES ARE KEPT."
          : m.confirm === "erased"
            ? "THE RECORDS ARE ASHES."
            : "FORGET EVERY WIN, LOSS AND MATCH.";
  card(ctx, dx0, dy0, dw, dh, 0.02, "#c81818", () => {
    const head = f < rows.length ? (decree ? `ARTICLE ${ROMAN_N[f]}` : "SETTING") : "THE LEDGER";
    drawPlain(ctx, head, dw / 2 - textWidth(head, 0.55, true) / 2, 10, "#8a5a2a", 0.55, true);
    const title = f < rows.length ? rows[f].label : extra[f - rows.length];
    const ts = Math.min(1, (dw - 16) / Math.max(1, textWidth(title, 1, true)));
    drawPlain(ctx, title, dw / 2 - textWidth(title, ts, true) / 2, 22, BROWN, ts, true);
    const cy = 82;
    if (f < rows.length) {
      const r = rows[f];
      const cur = (obj as Record<string, number>)[r.key as string];
      if (decree) {
        inset(ctx, 12, 44, dw - 24, 48, "#3a2a1c");
        texturedRect(ctx, "cloth", 12, 44, dw - 24, 48, "#7a1a14", 0, 0.7);
        const v = val(f);
        const vs = Math.min(1.5, (dw - 60) / Math.max(1, textWidth(v, 1, true)));
        paintedText(ctx, v, dw / 2, 68 - 6 * vs - 2, "#f0c030", vs);
      } else drawDial(ctx, dw / 2, cy - 12, Math.min(34, dw / 2 - 18), r.values, cur, val(f), cy);
      const ay = decree ? 68 : cy + 32;
      goldArrow(ctx, 20, ay, -1, 6);
      goldArrow(ctx, dw - 20, ay, 1, 6);
    } else {
      const restore = f === rows.length;
      waxSeal(ctx, dw / 2, cy - 12, 22, restore ? "#6a3a2a" : "#a8141a", restore ? "repair" : "quake");
    }
    const warn = m.confirm === "erase" && f > rows.length;
    wrap(blurb, dw - 20, 0.55)
      .slice(0, 4)
      .forEach((l, j) =>
        drawPlain(ctx, l, dw / 2 - textWidth(l, 0.55) / 2, dh - 46 + j * 8, warn ? "#a01810" : "#4a3018", 0.55),
      );
    if (decree) waxSeal(ctx, dw - 16, dh - 14, 9, "#a8141a", "works");
  });
  if (f < rows.length) {
    const ay = dy0 + (decree ? 68 : 114);
    m.hits.add(`dec:${f}`, dx0 + 8, ay - 10, 24, 20);
    m.hits.add(`inc:${f}`, dx0 + dw - 32, ay - 10, 24, 20);
  }
  hintPrompt(ctx, W, H, "STICK LEFT / RIGHT: CHANGE", [
    ["A", "CHANGE"],
    ["B", "DONE"],
  ]);
}

/** Options dial: a wooden disc with a notch per value over a 288° arc and a needle at the current one. */
function drawDial(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r0: number,
  values: number[],
  cur: number,
  label: string,
  labelY: number,
): void {
  woodDisc(ctx, cx, cy, r0);
  const nv = values.length;
  const idx = Math.max(0, values.indexOf(cur));
  const angle = (q: number) => -Math.PI * 0.8 + (Math.PI * 1.6 * q) / Math.max(1, nv - 1);
  for (let q = 0; q < nv; q++) {
    const a = angle(q);
    ctx.fillStyle = q === idx ? "#f0c030" : "#2a1a0a";
    ctx.beginPath();
    ctx.arc(cx + Math.sin(a) * (r0 - 5), cy - Math.cos(a) * (r0 - 5), q === idx ? 2.4 : 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const a = angle(idx);
  ctx.strokeStyle = "#0b0806";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.sin(a) * (r0 - 10), cy - Math.cos(a) * (r0 - 10));
  ctx.stroke();
  ctx.strokeStyle = "#c8a020";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  waxSeal(ctx, cx, cy, 6, "#a8141a", "none");
  drawPlain(ctx, label, cx - textWidth(label, 0.9, true) / 2, labelY + 28, "#8a1810", 0.9, true);
}
