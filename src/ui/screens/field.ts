// Field select ("CHOOSE THE FIELD"): a parchment card with a live preview of the hovered field, its name,
// blurb and size, and a column of pinned field cards (plus RANDOM). Online guests watch the host's choice
// (fieldWatch) with a note saying who picks.
import { Terrain } from "../../sim/terrain";
import { drawPlain, textWidth } from "../font";
import { bottomPrompt, wrap } from "../prompts";
import {
  artTitle,
  beam,
  boardBg,
  goldArrow,
  nameImage,
  parchment,
  pin,
  ribbon,
  shadowText,
  smoothImage,
  texturedRect,
  waxSeal,
  woodFloor,
} from "../uiPaint";
import type { Screens } from "../screens";
import { BROWN, MODE_NAME, shortMapName } from "./common";
import { handColor } from "../cursor";

/** Tower pads per map name (needs a Terrain parse; primed at load by the app so picking a field never parses). */
export const padCounts = new Map<string, number>();

export function drawField(s: Screens, ctx: CanvasRenderingContext2D, W: number, H: number): void {
  boardBg(ctx, W, H);
  woodFloor(ctx, H - 20, W, H);
  beam(ctx, 4, 2, W - 8, 17);
  artTitle(ctx, "t_field", "CHOOSE THE FIELD", W / 2, 3, 14);
  const pool = s.pool;
  const mw = s.fieldMode === "ffa" ? 70 : 46;
  const modeArt = nameImage(`t_${s.fieldMode}`);
  ribbon(ctx, W - 15 - mw / 2, 4, mw, 11, MODE_NAME[s.fieldMode], 0.55, undefined, modeArt);

  // Left: the selected field's card.
  const random = s.mapIndex >= pool.length;
  const d = random ? null : s.maps[pool[s.mapIndex]];
  const pw = Math.min(250, Math.round(W * 0.6));
  const ph = H - 58;
  const px = 16;
  const py = 28;
  ctx.save();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate(-0.02);
  ctx.translate(-pw / 2, -ph / 2);
  parchment(ctx, 0, 0, pw, ph);
  const iw = pw - 24;
  const ih = Math.round(iw * 0.48);
  ctx.fillStyle = "#2a1a0a";
  ctx.fillRect(10, 10, iw + 4, ih + 4);
  if (!random && s.portraits) {
    // Live preview rendered at the card's device-pixel size (capped) so it stays sharp at high DPI.
    const k = Math.min(6, Math.hypot(ctx.getTransform().a, ctx.getTransform().b));
    const preview = s.portraits.mapLive(pool[s.mapIndex], Math.round(iw * k), Math.round(ih * k));
    smoothImage(ctx, preview, 12, 12, iw, ih);
  } else {
    texturedRect(ctx, "parch", 12, 12, iw, ih, "#c8a878", 0, 1);
    drawPlain(ctx, "?", 12 + iw / 2 - textWidth("?", 5, true) / 2, 12 + ih / 2 - 26, "#5a3a18", 5, true);
  }
  const name = random ? "A Field Unknown" : d!.name;
  const nsc = Math.min(1.35, (pw - 60) / Math.max(1, textWidth(name, 1, true)));
  drawPlain(ctx, name, 14, ih + 18, BROWN, nsc, true);
  const blurb = random ? "LET FATE CHOOSE WHERE THE GRUDGE IS SETTLED." : (d!.blurb ?? "");
  // The blurb gets three lines of room; longer ones scroll slowly (pause, scroll, pause, jump back).
  const lines = wrap(blurb, pw - 70, 0.6);
  const by = ih + 35;
  const room = 3 * 8;
  const over = Math.max(0, lines.length * 8 - room);
  let off = 0;
  if (over > 0) {
    const run = over / 5;
    const t = (performance.now() / 1000) % (5 + run);
    off = t < 2.5 ? 0 : t < 2.5 + run ? (t - 2.5) * 5 : over;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, by - 2, pw - 40, room + 2);
  ctx.clip();
  lines.forEach((l, j) => drawPlain(ctx, l, 14, by + j * 8 - off, "#4a3018", 0.6));
  ctx.restore();
  if (d) {
    let padCount = padCounts.get(d.name);
    if (padCount === undefined) {
      padCount = new Terrain(d).pads.length;
      padCounts.set(d.name, padCount);
    }
    const area = d.width * d.depth;
    const size = area <= 2400 ? "SMALL" : area <= 4000 ? "MEDIUM" : "LARGE";
    const facts = `${size} FIELD  ·  ${d.width} BY ${d.depth} PACES  ·  ${padCount} TOWER PADS`;
    drawPlain(ctx, facts, 14, ph - 12, "#6a4424", 0.55);
  }
  waxSeal(ctx, pw - 22, ih + 36, 15, "#a8141a", random ? "hex" : (d?.emblem ?? "castle"));
  ctx.restore();

  // Right: pinned field cards, then RANDOM.
  const cx0 = px + pw + 18;
  const cw = W - cx0 - 14;
  const n = pool.length + 1;
  const chh = Math.min(62, Math.floor((H - 58 - (n - 1) * 8) / n));
  for (let k = 0; k < n; k++) {
    const sel = k === Math.min(s.mapIndex, n - 1);
    const cy = 30 + k * (chh + 8);
    const cx = cx0 + (sel ? -8 : 0);
    s.hit(`map:${k}`, cx0 - 8, cy - 2, cw + 8, chh + 6);
    ctx.save();
    ctx.translate(cx + cw / 2, cy + chh / 2);
    ctx.rotate(sel ? 0 : k % 2 ? 0.03 : -0.03);
    ctx.translate(-cw / 2, -chh / 2);
    parchment(ctx, 0, 0, cw, chh);
    const tw = cw - 10;
    const th = chh - 17;
    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(4, 4, tw + 2, th + 2);
    if (k < pool.length) {
      const t = s.portraits?.mapCard(pool[k]);
      if (t) {
        // Cover-crop the fixed-size thumb to this card's aspect.
        const a = tw / th;
        const sw = Math.min(t.width, t.height * a);
        const sh = sw / a;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(t, (t.width - sw) / 2, (t.height - sh) / 2, sw, sh, 5, 5, tw, th);
        ctx.restore();
      }
    } else {
      texturedRect(ctx, "parch", 5, 5, tw, th, "#c8a878", 0, 1);
      drawPlain(ctx, "?", 5 + tw / 2 - textWidth("?", 2.4, true) / 2, 5 + th / 2 - 13, "#5a3a18", 2.4, true);
    }
    const label = k < pool.length ? shortMapName(s.maps[pool[k]].name) : "RANDOM";
    drawPlain(ctx, label, 6, th + 8, sel ? "#8a1810" : BROWN, 0.62, true);
    // Pin: one wedge per seat voting for this card, else the colours of the hands pointing at it.
    const voters = s.votes.filter(([, v]) => v === k).map(([seat]) => handColor(seat));
    const hands = s.cursors?.handsOn(`map:${k}`) ?? [];
    pin(ctx, cw / 2, 3, voters.length ? voters : hands.length ? hands : sel ? "#c81818" : "#8a8a90");
    ctx.restore();
    if (sel) goldArrow(ctx, cx - 6, cy + chh / 2, -1, 6);
  }
  bottomPrompt(
    ctx,
    W,
    H,
    s.fieldWatch
      ? [
          ["A", "VOTE"],
          ["B", "LEAVE"],
        ]
      : [
          ["A", "TO BATTLE"],
          ["B", "BACK"],
          ["S", "START"],
        ],
  );
  if (s.fieldNote) {
    const x = Math.round(px + pw / 2 - textWidth(s.fieldNote, 0.55) / 2);
    shadowText(ctx, s.fieldNote, x, H - 28, s.fieldWatch ? "#fff0c0" : "#f8e8a0", 0.55);
  }
}
