// Menu pages without much state: MAIN (the card + option tags), PLAYERS (seats and devices), VERSUS ONLINE
// (host / join cards and connection status), BROWSE (battles posted on the server), CONTROLS.
import { drawPlain, textWidth } from "../font";
import { bottomPrompt, prompt, promptWidth, wrap } from "../prompts";
import {
  artTitle,
  band,
  boardBg,
  boardTitle,
  card,
  drawLogo,
  inset,
  nameImage,
  paintedText,
  shadowText,
  tag,
  texturedRect,
  waxSeal,
  windowCut,
  woodFloor,
} from "../uiPaint";
import { drawControlSheet } from "./controls";
import { BROWN, upArrow } from "./common";
import type { Menus } from "../menus";

/** Main menu entries: title art key ("!" = composed from the title font), label and blurb. */
export const MAIN_ITEMS = [
  {
    art: "m_fight",
    label: "FIGHT",
    blurb: "CHOOSE CHAMPIONS AND SETTLE A GRUDGE. ONE AGAINST ONE, TWO AGAINST TWO, OR FOUR HOUSES IN A FREE FOR ALL.",
  },
  {
    art: "!TRAINING",
    label: "TRAINING",
    blurb: "PICK A CHAMPION AND BEAT ON A DUMMY THAT CAN'T DIE. A DPS METER COUNTS EVERY HIT. FREE GOLD, NO CLOCK.",
  },
  {
    art: "!PLAYERS",
    label: "PLAYERS",
    blurb: "WHO IS PLAYING ON THIS MACHINE: CONTROLLERS, KEYBOARD AND MOUSE. FREE A SEAT OR TURN THE KEYBOARD OFF.",
  },
  {
    art: "m_network",
    label: "VERSUS ONLINE",
    blurb: "PLAY OVER THE HOUSE NETWORK. ONE MACHINE HOSTS, FRIENDS OPEN ITS PAGE AND JOIN.",
  },
  {
    art: "!CODEX",
    label: "CODEX",
    blurb: "EVERY CHAMPION, EVERY EVOLUTION, EVERY TRICK FOR YOUR ARMY AND BASE. ALSO SOME LIES ABOUT A TREE.",
  },
  { art: "m_rules", label: "RULES", blurb: "SET THE TERMS OF COMBAT: TIME, GOLD, SOLDIERS AND MERCY." },
  { art: "m_records", label: "RECORDS", blurb: "EVERY VICTORY AND DEFEAT, WRITTEN DOWN BY NAME AND BY CHAMPION." },
  { art: "m_options", label: "OPTIONS", blurb: "MUSIC, SOUND, SCREEN SHAKE AND BUTTON HINTS." },
  { art: "m_controls", label: "CONTROLS", blurb: "HOW TO FIGHT, BUILD AND COMMAND YOUR ARMY." },
];
const MAIN_GLYPHS = ["combo", "rank", "rally", "banner", "hex", "works", "castle", "repair", "pad"];

// ── Main ──

export function drawMain(m: Menus, ctx: CanvasRenderingContext2D, W: number, H: number): void {
  boardBg(ctx, W, H);
  woodFloor(ctx, H - 20, W, H);
  const it = MAIN_ITEMS[m.focus];
  const pw = Math.min(250, Math.round(W * 0.6));
  const ph = H - 34;
  const px = 16;
  const py = 8;
  card(ctx, px, py, pw, ph, -0.02, null, () => {
    const iw = pw - 24;
    const ih = Math.round(iw * 0.5);
    windowCut(ctx, 12, 12, iw, ih);
    drawLogo(ctx, 12 + 56, 12 + ih - 40, 46);
    const nm = nameImage(it.art);
    if (nm) {
      const h = 16;
      const w = (nm.width / nm.height) * h;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(nm, 14, ih + 20, w, h);
      ctx.restore();
    } else drawPlain(ctx, it.label, 14, ih + 20, BROWN, 1.3, true);
    wrap(it.blurb, pw - 70, 0.6)
      .slice(0, 3)
      .forEach((l, j) => drawPlain(ctx, l, 14, ih + 42 + j * 8, "#4a3018", 0.6));
    if (m.focus === 0) {
      // FIGHT shows the current rules at a glance.
      const r = m.save.data.rules;
      const t = `${r.minutes} MIN  ·  ${r.popCap} SOLDIERS  ·  GOLD X ${r.goldRate}${r.mercy ? "" : "  ·  NO MERCY"}`;
      drawPlain(ctx, t, 14, ph - 12, "#8a1810", 0.55);
    } else drawPlain(ctx, `BUILD ${__BUILD__}`, 14, ph - 12, "#8a6a44", 0.5);
    waxSeal(ctx, pw - 22, ih + 40, 15, "#a8141a", MAIN_GLYPHS[m.focus]);
  });
  const cx0 = px + pw + 18;
  const cw = W - cx0 - 14;
  const n = MAIN_ITEMS.length;
  const gap = 5;
  const chh = Math.floor((H - 30 - (n - 1) * gap) / n);
  MAIN_ITEMS.forEach((item, k) => {
    const sel = k === m.focus;
    const cy = 6 + k * (chh + gap);
    m.hits.add(`row:${k}`, cx0 - 8, cy - 2, cw + 8, chh + 4);
    tag(ctx, cx0, cy, cw, chh, sel, k, () => {
      waxSeal(ctx, 11, chh / 2 + 1, Math.min(8, chh / 2 - 2), sel ? "#a8141a" : "#6a3a2a", MAIN_GLYPHS[k]);
      drawPlain(ctx, item.label, 24, chh / 2 - 3, sel ? "#8a1810" : BROWN, 0.72, true);
    });
  });
  bottomPrompt(ctx, W, H, [
    ["A", "SELECT"],
    ["B", "BACK"],
  ]);
}

// ── Players ──

const SEAT_COLORS = ["#2a4ab8", "#b02a1c", "#2a7ab8", "#c86a1c"];
const SEAT_ROMAN = ["I", "II", "III", "IV"];

/** Four seat cards (focus 0-3), then KEYBOARD + MOUSE (4) and FIND GAMECUBE / PRO PAD (5). */
export function drawPlayers(m: Menus, ctx: CanvasRenderingContext2D, W: number, H: number): void {
  boardTitle(ctx, W, "!PLAYERS", "PLAYERS");
  const devs = m.devices();
  const gap = 10;
  const cw = Math.min(90, Math.floor((W - 30 - gap * 3) / 4));
  const x0 = Math.round((W - (cw * 4 + gap * 3)) / 2);
  const y0 = 28;
  const ch = 118;
  for (let i = 0; i < 4; i++) {
    const sel = m.focus === i;
    const d = devs[i];
    const x = x0 + i * (cw + gap);
    const y = y0 - (sel ? 4 : 0);
    m.hits.add(`row:${i}`, x, y, cw, ch);
    card(ctx, x, y, cw, ch, sel ? 0 : i % 2 ? 0.03 : -0.03, sel ? "#c81818" : d ? SEAT_COLORS[i] : "#8a8a90", () => {
      const t = `SEAT ${SEAT_ROMAN[i]}`;
      drawPlain(ctx, t, cw / 2 - textWidth(t, 0.62, true) / 2, 9, "#8a5a2a", 0.62, true);
      const iw = cw - 14;
      const ih = 52;
      inset(ctx, 7, 20, iw, ih, d ? SEAT_COLORS[i] : "#3a2a1c");
      texturedRect(ctx, "cloth", 7, 20, iw, ih, d ? SEAT_COLORS[i] : "#4a3a2c", 0, 0.7);
      band(ctx, 7, 20, iw, ih, "#000000", d ? 0.15 : 0.45);
      const glyph = d ? (d.includes("KEYBOARD") ? "pad" : "combo") : "none";
      waxSeal(ctx, cw / 2, 20 + ih / 2, 16, d ? "#c8a020" : "#5a4a3a", glyph);
      paintedText(ctx, `P${i + 1}`, cw / 2, 20 + ih / 2 - 7, d ? "#fff4c8" : "#a89878", 1.0);
      const lines = d ? wrap(d, cw - 12, 0.5).slice(0, 3) : ["EMPTY SEAT", "PRESS ANY BUTTON", "TO JOIN"];
      lines.forEach((l, j) =>
        drawPlain(ctx, l, cw / 2 - textWidth(l, 0.5) / 2, 80 + j * 8, d ? BROWN : "#8a6a44", 0.5),
      );
      if (d) {
        const f = "A: FREE SEAT";
        drawPlain(ctx, f, cw / 2 - textWidth(f, 0.48) / 2, ch - 11, sel ? "#8a1810" : "#8a6a44", 0.48);
      }
    });
    if (sel) upArrow(ctx, x + cw / 2, y + ch + 8);
  }
  const kbmOn = !!m.save.data.options.kbm;
  const rows: [string, string, string][] = [
    ["KEYBOARD + MOUSE", kbmOn ? "ON" : "OFF", "pad"],
    ["FIND GAMECUBE / PRO PAD", "SEARCH", "rally"],
  ];
  const tw = Math.floor((cw * 4 + gap * 3 - gap) / 2);
  rows.forEach(([l, v, g], k) => {
    const sel = m.focus === 4 + k;
    const x = x0 + k * (tw + gap);
    const y = y0 + ch + 14 - (sel ? 2 : 0);
    m.hits.add(`row:${4 + k}`, x, y, tw, 24);
    card(ctx, x, y, tw, 24, sel ? 0 : k ? 0.015 : -0.015, sel ? "#c81818" : "#8a8a90", () => {
      waxSeal(ctx, 12, 13, 7, sel ? "#a8141a" : "#6a3a2a", g);
      drawPlain(ctx, l, 24, 9, sel ? "#8a1810" : BROWN, 0.6, true);
      drawPlain(ctx, v, tw - 8 - textWidth(v, 0.66, true), 9, v === "OFF" ? "#a01810" : "#2a6a18", 0.66, true);
    });
  });
  const hint = "PLAYERS HERE PLAY FROM THIS MACHINE · ONLINE, EVERY ONE OF THEM TAKES A SEAT";
  shadowText(ctx, hint, W / 2 - textWidth(hint, 0.5) / 2, H - 31, "#f0e4c8", 0.5);
  bottomPrompt(ctx, W, H, [
    ["A", m.focus < 4 ? "FREE SEAT" : "CHANGE"],
    ["B", "BACK"],
  ]);
}

// ── Versus online ──

export function drawNetwork(m: Menus, ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  boardTitle(ctx, W, "m_network", "VERSUS ONLINE");
  // [title art, label, glyph, blurb, suit colour]
  const opts: [string, string, string, string, string][] = [
    [
      "t_host",
      "HOST A BATTLE",
      "castle",
      "THIS MACHINE RUNS THE MATCH. FRIENDS JOIN FROM THEIR OWN SCREENS.",
      "#a8141a",
    ],
    [
      "t_join",
      "JOIN A BATTLE",
      "banner",
      "SEE EVERY BATTLE ON THIS SERVER AND TAKE A SEAT. YOU SEE THE HOST'S RULES BEFORE THE FIGHT.",
      "#1a3aa8",
    ],
  ];
  const lines = [m.netStatus, ...m.netAddrs.map((a) => `FRIENDS OPEN  http://${a}`)].filter(Boolean);
  const cw = 118;
  const ch = lines.length ? 136 : 160;
  const gap = 34;
  const x0 = Math.round((W - cw * 2 - gap) / 2);
  const cy = 28;
  opts.forEach(([art, label, glyph, blurb, suit], k) => {
    const hot = k === m.focus;
    const x = x0 + k * (cw + gap) + (hot ? (k ? -4 : 4) : 0);
    const y = cy - (hot ? 4 : 0);
    m.hits.add(`row:${k}`, x, y, cw, ch);
    // Drawn like playing cards: "A" and the suit seal in opposite corners.
    card(ctx, x, y, cw, ch, hot ? 0 : k ? 0.06 : -0.06, hot ? "#c81818" : "#8a8a90", () => {
      for (const [ox, oy, flip] of [
        [9, 10, false],
        [cw - 9, ch - 10, true],
      ] as const) {
        ctx.save();
        ctx.translate(ox, oy);
        if (flip) ctx.rotate(Math.PI);
        drawPlain(ctx, "A", -textWidth("A", 1.1, true) / 2, -6, suit, 1.1, true);
        waxSeal(ctx, 0, 14, 5, suit, glyph);
        ctx.restore();
      }
      inset(ctx, 18, 22, cw - 36, 52, "#3a2a1c");
      texturedRect(ctx, "cloth", 18, 22, cw - 36, 52, suit, 0, 0.7);
      band(ctx, 18, 22, cw - 36, 52, "#000000", hot ? 0.1 : 0.35);
      waxSeal(ctx, cw / 2, 48, 19, hot ? "#c8a020" : "#8a7a40", glyph);
      const nm = nameImage(art);
      if (nm) {
        const h = hot ? 13 : 11;
        const w = Math.min(cw - 16, (nm.width / nm.height) * h);
        const hh = (w / nm.width) * nm.height;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = hot ? 1 : 0.75;
        ctx.drawImage(nm, cw / 2 - w / 2, 84, w, hh);
        ctx.restore();
      } else drawPlain(ctx, label, cw / 2 - textWidth(label, 0.8, true) / 2, 84, BROWN, 0.8, true);
      wrap(blurb, cw - 20, 0.5)
        .slice(0, 4)
        .forEach((l, j) =>
          drawPlain(ctx, l, cw / 2 - textWidth(l, 0.5) / 2, 102 + j * 8, hot ? "#4a3018" : "#7a5a38", 0.5),
        );
    });
  });
  if (lines.length) {
    const pw = cw * 2 + gap;
    const sy = cy + ch + 8;
    const sh = 8 + lines.length * 9;
    card(ctx, x0, sy, pw, sh, 0.008, "#8a8a90", () => {
      lines.forEach((l, j) => {
        const busyBlink = j === 0 && m.netBusy && Math.floor(now * 2) % 2;
        drawPlain(ctx, l, pw / 2 - textWidth(l, 0.58) / 2, 5 + j * 9, busyBlink ? "#8a1810" : BROWN, 0.58);
      });
    });
  }
  bottomPrompt(
    ctx,
    W,
    H,
    m.netBusy
      ? [["B", "CANCEL"]]
      : [
          ["A", "SELECT"],
          ["B", "BACK"],
        ],
  );
}

/** QUICK JOIN card (focus 0), then a scrolling 2-column grid of posted battles (focus 1..n). */
export function drawBrowse(m: Menus, ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  boardTitle(ctx, W, "!BATTLES ON THIS SERVER", "BATTLES ON THIS SERVER");
  const qw = 104;
  const qh = H - 58;
  const qx = 14;
  const qy = 28;
  const qsel = m.focus === 0;
  const busyBlink = m.netBusy && Math.floor(now * 2) % 2;
  m.hits.add("row:0", qx, qy, qw, qh);
  card(ctx, qx + (qsel ? 3 : 0), qy - (qsel ? 2 : 0), qw, qh, qsel ? 0 : -0.025, qsel ? "#c81818" : "#8a8a90", () => {
    inset(ctx, 8, 16, qw - 16, 66, "#3a2a1c");
    texturedRect(ctx, "cloth", 8, 16, qw - 16, 66, "#a8141a", 0, 0.7);
    band(ctx, 8, 16, qw - 16, 66, "#000000", qsel ? 0.1 : 0.35);
    waxSeal(ctx, qw / 2, 49, 20, qsel ? "#c8a020" : "#8a7a40", "dash");
    const t = "QUICK JOIN";
    drawPlain(ctx, t, qw / 2 - textWidth(t, 0.95, true) / 2, 92, qsel ? "#8a1810" : BROWN, 0.95, true);
    wrap("TAKE THE FIRST OPEN SEAT ON THE SERVER.", qw - 16, 0.52).forEach((l, j) =>
      drawPlain(ctx, l, qw / 2 - textWidth(l, 0.52) / 2, 108 + j * 8, "#4a3018", 0.52),
    );
    const n = m.rooms.length;
    const st = m.netBusy ? m.netStatus : `${n} BATTLE${n === 1 ? "" : "S"} POSTED`;
    wrap(st, qw - 14, 0.48)
      .slice(0, 2)
      .forEach((l, j) =>
        drawPlain(ctx, l, qw / 2 - textWidth(l, 0.48) / 2, qh - 22 + j * 8, busyBlink ? "#8a1810" : "#8a5a2a", 0.48),
      );
  });
  const gx = qx + qw + 16;
  const gw = W - gx - 12;
  const cols = 2;
  const nw = Math.floor((gw - 10) / cols);
  const nh = 42;
  const rowsVis = Math.floor((H - 58) / (nh + 8));
  const vis = rowsVis * cols;
  const n = m.rooms.length;
  // Keep the focused room in view, scrolling a whole grid row at a time.
  const fr = m.focus - 1;
  if (fr >= 0) {
    if (fr < m.scrollTop) m.scrollTop = fr - (fr % cols);
    if (fr >= m.scrollTop + vis) m.scrollTop = fr - (fr % cols) - (rowsVis - 1) * cols;
  }
  if (!n) {
    card(ctx, gx + gw / 2 - 90, 70, 180, 50, 0.02, "#8a8a90", () => {
      const a = m.roomsError || "NO BATTLES POSTED YET";
      drawPlain(ctx, a, 90 - textWidth(a, 0.75, true) / 2, 14, "#6a4424", 0.75, true);
      const b = "GO BACK AND HOST ONE";
      drawPlain(ctx, b, 90 - textWidth(b, 0.55) / 2, 30, "#8a5a2a", 0.55);
    });
  }
  for (let k = m.scrollTop; k < Math.min(n, m.scrollTop + vis); k++) {
    const r = m.rooms[k];
    const slot = k - m.scrollTop;
    const sel = m.focus === k + 1;
    const x = gx + (slot % cols) * (nw + 10);
    const y = 28 + Math.floor(slot / cols) * (nh + 8);
    const drift = Math.sin(now * 0.8 + k * 1.7) * 0.012;
    m.hits.add(`row:${k + 1}`, x, y, nw, nh);
    const open = r.phase === "lobby" && r.humans < r.seats;
    const tilt = sel ? 0 : (k % 2 ? 0.02 : -0.02) + drift;
    card(ctx, x, y - (sel ? 2 : 0), nw, nh, tilt, sel ? "#c81818" : open ? "#3a9a30" : "#8a8a90", () => {
      waxSeal(ctx, 12, 16, 8, open ? "#2a7a20" : "#6a6058", open ? "banner" : "castle");
      const nm = r.name.length > 16 ? r.name.slice(0, 16) : r.name;
      drawPlain(ctx, nm, 25, 8, sel ? "#8a1810" : BROWN, 0.72, true);
      const map = (r.map || "-").replace(/^GRUDGE\w*\s*/, "");
      drawPlain(ctx, `${r.mode}  ·  ${map.slice(0, 12)}`, 25, 19, "#6a4424", 0.5);
      const age = r.age < 60 ? `${r.age}S AGO` : `${Math.floor(r.age / 60)} MIN AGO`;
      drawPlain(ctx, age, 25, 29, "#8a5a2a", 0.45);
      const st = r.phase === "match" ? "FIGHTING" : r.humans >= r.seats ? "FULL" : "OPEN";
      const seats = `${r.humans}/${r.seats}`;
      const col = open ? "#2a6a18" : "#8a1810";
      drawPlain(ctx, seats, nw - 8 - textWidth(seats, 0.8, true), 9, col, 0.8, true);
      drawPlain(ctx, st, nw - 8 - textWidth(st, 0.5, true), 27, col, 0.5, true);
    });
  }
  if (n > vis) {
    const t = `${m.scrollTop + 1}-${Math.min(n, m.scrollTop + vis)} OF ${n}`;
    shadowText(ctx, t, W - 14 - textWidth(t, 0.5), H - 31, "#f0e4c8", 0.5);
  }
  bottomPrompt(
    ctx,
    W,
    H,
    m.netBusy
      ? [["B", "CANCEL"]]
      : [
          ["A", "JOIN"],
          ["B", "BACK"],
        ],
  );
}

// ── Controls ──

export function drawControls(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  artTitle(ctx, "m_controls", "CONTROLS", W / 2, 3, 14);
  drawControlSheet(ctx, 12, 24, W - 24, H - 48);
  bottomPrompt(ctx, W, H, [["B", "DONE"]]);
}

/** Bottom prompt with a stick hint to its left (rules / options / records / codex). */
export function hintPrompt(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  hint: string,
  items: [string, string][],
): void {
  const pwid = promptWidth(items, 0.7) + 14 + textWidth(hint, 0.6);
  const x0 = Math.round((W - pwid) / 2);
  shadowText(ctx, hint, x0, H - 12, "#f0e4c8", 0.6);
  prompt(ctx, x0 + textWidth(hint, 0.6) + 14, H - 13, items, 0.7);
}
