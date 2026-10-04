// The controls reference: two cards (controller / keyboard + mouse), shrinking the text until everything fits.
// Shown on the CONTROLS page and from the pause menu.
import { drawPlain, textWidth } from "../font";
import { PAD, padButton } from "../hud/paint";
import { wrap } from "../prompts";
import { band, card, waxSeal } from "../uiPaint";
import { BROWN } from "./common";

type Groups = [string, [string, string][]][];

const PAD_GROUPS: Groups = [
  [
    "FIGHT",
    [
      ["STICK", "MOVE"],
      ["A", "ATTACK · HOLD TO CHARGE · WITH A BOMB: THROW"],
      ["B", "SECONDARY · HOLD TO CHARGE OR AIM"],
      ["R", "SPECIAL · HOLD TO AIM WHERE IT LANDS"],
      ["Z", "SUPER WHEN THE METER IS FULL"],
      ["L", "BLOCK · L+A SHOVE · L+X DODGE · CANCELS AN AIM · DROPS THE GRUDGE"],
    ],
  ],
  [
    "COMMAND",
    [
      ["C", "ORDERS: UP ATTACK (AGAIN: PICK LANE) · LEFT FOLLOW · RIGHT DEFEND · DOWN HOLD · LEVEL UP: LEFT / RIGHT"],
      ["D-PAD", "LEFT / RIGHT: WHO OBEYS · UP / DOWN: ZOOM"],
    ],
  ],
  [
    "BUILD",
    [
      ["X", "AT A PAD: OUTPOSTS · 2V2: HOLD AWAY FROM A PAD TO BECOME THE HERALD"],
      ["Y", "AT A PAD: TOWERS · KEEP: SHOP · ELSEWHERE: RECALL (ONCE PER LIFE)"],
      ["START", "PAUSE"],
    ],
  ],
];
const KEY_GROUPS: Groups = [
  [
    "FIGHT",
    [
      ["WASD", "MOVE"],
      ["E", "ATTACK · HOLD TO CHARGE"],
      ["Q", "SECONDARY · HOLD TO CHARGE"],
      ["X", "SPECIAL · HOLD + WASD TO AIM"],
      ["C", "SUPER · HOLD + WASD TO AIM"],
      ["Z", "BLOCK · Z + E: SHOVE · CANCELS AN AIM · DROPS THE GRUDGE"],
      ["SPACE", "DODGE"],
    ],
  ],
  [
    "COMMAND",
    [
      ["ARROWS", "ORDERS · UP AGAIN PICKS A LANE · LEFT / RIGHT LEARNS ON LEVEL UP"],
      ["3 / 4", "WHO OBEYS"],
      ["1 / 2", "ZOOM"],
    ],
  ],
  [
    "BUILD",
    [
      ["F / L-MOUSE", "OUTPOSTS AT A PAD · 2V2: HOLD F ELSEWHERE TO BECOME THE HERALD"],
      ["R / R-MOUSE", "TOWERS · SHOP AT THE KEEP · ELSEWHERE: RECALL"],
      ["ENTER", "PAUSE"],
    ],
  ],
];

/** Controller button colour for a key label ("" = draw the label as text). */
function buttonColor(k: string): string {
  if (k === "A") return PAD.a;
  if (k === "B") return PAD.b;
  if (k === "C" || k === "X" || k === "Y") return PAD.c;
  if (k === "Z" || k === "R" || k === "L") return PAD.z;
  if (k === "START") return PAD.start;
  return "";
}

export function drawControlSheet(ctx: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number): void {
  const gap = 12;
  const cw = Math.floor((pw - gap) / 2);
  (
    [
      [PAD_GROUPS, "CONTROLLER", "pad"],
      [KEY_GROUPS, "KEYBOARD AND MOUSE", "works"],
    ] as const
  ).forEach(([groups, title, glyph], c) => {
    const x = px + c * (cw + gap);
    card(ctx, x, py, cw, ph, c ? 0.012 : -0.012, "#8a8a90", () => {
      waxSeal(ctx, 13, 12, 7, "#a8141a", glyph);
      drawPlain(ctx, title, 25, 8, "#8a1810", 0.68, true);
      band(ctx, 8, 21, cw - 16, 1, "#6a4424", 0.5);
      const keyW = c ? 50 : 28;
      const textW = cw - keyW - 18;
      // Shrink the text scale (and line height) until all groups fit the card.
      let S = 0.5;
      let LH = 7;
      const build = () =>
        groups.map(([g, rows]) => ({ g, rows: rows.map(([k, v]) => ({ k, lines: wrap(v, textW, S) })) }));
      const measure = (bl: ReturnType<typeof build>) =>
        bl.reduce((a, b) => a + 10 + b.rows.reduce((q, r) => q + r.lines.length * LH + 2, 0), 0);
      let blocks = build();
      while (measure(blocks) > ph - 30 && S > 0.4) {
        S -= 0.03;
        LH = 14 * S;
        blocks = build();
      }
      const used = measure(blocks);
      const slack = Math.max(0, (ph - 30 - used) / Math.max(1, blocks.length));
      let y = 26 + slack / 2;
      for (const b of blocks) {
        drawPlain(ctx, b.g, 8, y, "#a8141a", 0.5, true);
        band(ctx, 10 + textWidth(b.g, 0.5, true), y + 3.5, cw - 22 - textWidth(b.g, 0.5, true), 1, "#a8141a", 0.25);
        y += 10;
        for (const r of b.rows) {
          if (c === 0) {
            const col = buttonColor(r.k);
            if (col) padButton(ctx, 16, y + 3, 4.2, col, r.k === "START" ? "S" : r.k);
            else drawPlain(ctx, r.k, 16 - textWidth(r.k, 0.42, true) / 2, y + 0.5, "#6a4424", 0.42, true);
          } else drawPlain(ctx, r.k, 8, y, "#6a1c10", 0.48, true);
          r.lines.forEach((l, j) => drawPlain(ctx, l, 8 + keyW, y + j * LH, BROWN, S, true));
          y += r.lines.length * LH + 2;
        }
        y += slack;
      }
    });
  });
}
