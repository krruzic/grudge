// RECORDS ("HALL OF GRUDGES"): an open leather book with three bookmarks. Left page lists champions, signed
// names or the match chronicle; the right page details the focused row. Names can be struck (Y twice).
import { drawPlain, textWidth } from "../font";
import { wrap } from "../prompts";
import { band, boardTitle, goldArrow, inset, smoothImage, texturedRect, waxSeal } from "../uiPaint";
import { winRate } from "../../game/save";
import { BROWN, HOUSE, INK, TEAM_CLOTH, TEAM_TEXT, dateOf, num } from "./common";
import { hintPrompt } from "./pages";
import { MODE_NAME } from "../screens/common";
import type { Menus } from "../menus";

export const RECORD_TABS = ["CHAMPIONS", "NAMES", "CHRONICLE"];

/** Layout of the open book shared by the three tabs. */
interface Book {
  lx: number;
  rx: number;
  pgy: number;
  pgw: number;
  pgh: number;
  /** Right page text column. */
  R: number;
  RW: number;
}

export function drawRecords(m: Menus, ctx: CanvasRenderingContext2D, W: number, H: number): void {
  boardTitle(ctx, W, "t_records", "HALL OF GRUDGES");
  const bx = 12;
  const by = 30;
  const bw = W - 24;
  const bh = H - 56;
  band(ctx, bx + 4, by + 5, bw, bh, INK, 0.45);
  ctx.fillStyle = INK;
  ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  texturedRect(ctx, "leather", bx, by, bw, bh, "#5a2a18", 0, 0.8);
  const pgw = Math.floor((bw - 16) / 2);
  const B: Book = {
    lx: bx + 6,
    rx: bx + bw - 6 - pgw,
    pgy: by + 5,
    pgw,
    pgh: bh - 10,
    R: bx + bw - 6 - pgw + 10,
    RW: pgw - 20,
  };
  for (const x of [B.lx, B.rx]) texturedRect(ctx, "parch", x, B.pgy, pgw, B.pgh, null, 0, 1.3);
  // Shadow in the spine.
  const sx = bx + bw / 2;
  const g = ctx.createLinearGradient(sx - 14, 0, sx + 14, 0);
  g.addColorStop(0, "rgba(60,30,10,0)");
  g.addColorStop(0.45, "rgba(60,30,10,0.45)");
  g.addColorStop(0.55, "rgba(60,30,10,0.45)");
  g.addColorStop(1, "rgba(60,30,10,0)");
  ctx.fillStyle = g;
  ctx.fillRect(sx - 14, B.pgy, 28, B.pgh);
  drawBookmarks(m, ctx, B.lx, by);

  const rh = 15;
  const listTop = B.pgy + 22;
  const vis = Math.floor((B.pgh - 24) / rh);
  const n = m.rowCount();
  if (m.focus < m.scrollTop) m.scrollTop = m.focus;
  if (m.focus >= m.scrollTop + vis) m.scrollTop = m.focus - vis + 1;
  /** One list row on the left page (skipped when scrolled out). */
  const rowAt = (k: number, draw: (y: number, sel: boolean) => void) => {
    if (k < m.scrollTop || k >= m.scrollTop + vis) return;
    const y = listTop + (k - m.scrollTop) * rh;
    const sel = k === m.focus;
    m.hits.add(`row:${k}`, B.lx + 2, y - 2, pgw - 4, rh);
    if (sel) {
      ctx.fillStyle = "rgba(168,48,28,0.16)";
      ctx.fillRect(B.lx + 4, y - 2, pgw - 8, rh - 1);
      goldArrow(ctx, B.lx + 7, y + rh / 2 - 2, 1, 4);
    }
    draw(y, sel);
  };
  if (m.tab === 0) drawChampions(m, ctx, B, rowAt);
  else if (m.tab === 1) drawNames(m, ctx, B, rowAt);
  else drawChronicle(m, ctx, B, rowAt);
  if (n > vis) {
    const t = `${m.scrollTop + 1}-${Math.min(n, m.scrollTop + vis)} OF ${n}`;
    drawPlain(ctx, t, B.lx + pgw - 8 - textWidth(t, 0.48, true), B.pgy + B.pgh - 9, "#8a5a2a", 0.48, true);
  }
  const p: [string, string][] = [["B", "DONE"]];
  if (m.tab === 1 && m.save.tagNames().length)
    p.unshift(["Y", m.confirm.startsWith("strike:") ? "AGAIN TO STRIKE" : "STRIKE NAME"]);
  hintPrompt(ctx, W, H, "STICK LEFT / RIGHT: BOOKMARK", p);
}

type RowAt = (k: number, draw: (y: number, sel: boolean) => void) => void;

function drawBookmarks(m: Menus, ctx: CanvasRenderingContext2D, lx: number, by: number): void {
  RECORD_TABS.forEach((t, k) => {
    const sel = k === m.tab;
    const rw = 62;
    const cx = lx + 40 + k * (rw + 8);
    const len = sel ? 14 : 10;
    ctx.fillStyle = INK;
    ctx.fillRect(cx - rw / 2 - 1, by - 8, rw + 2, len + 1);
    texturedRect(ctx, "cloth", cx - rw / 2, by - 7, rw, len, sel ? "#b01818" : "#6a4a2a", 0, 0.6);
    // Swallowtail notch.
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(cx - rw / 2, by - 7 + len);
    ctx.lineTo(cx, by - 7 + len - 4);
    ctx.lineTo(cx + rw / 2, by - 7 + len);
    ctx.fill();
    const ty = by - 6 + (sel ? 3 : 0);
    drawPlain(ctx, t, cx - textWidth(t, 0.5, true) / 2, ty, sel ? "#fff4c8" : "#d8c8a8", 0.5, true);
    m.hits.add(`tab:${k}`, cx - rw / 2, by - 9, rw, len + 3);
  });
}

function pageHead(ctx: CanvasRenderingContext2D, B: Book, x: number, t: string): void {
  drawPlain(ctx, t, x + B.pgw / 2 - textWidth(t, 0.6, true) / 2, B.pgy + 9, "#8a5a2a", 0.6, true);
  band(ctx, x + 10, B.pgy + 17, B.pgw - 20, 1, "#6a4424", 0.5);
}

/** A label / value line on the right page. */
function stat(ctx: CanvasRenderingContext2D, B: Book, label: string, v: string, y: number, col = BROWN): void {
  drawPlain(ctx, label, B.R, y, "#6a4424", 0.6, true);
  drawPlain(ctx, v, B.R + B.RW - textWidth(v, 0.8, true), y - 1, col, 0.8, true);
}

function heroIcon(m: Menus, ctx: CanvasRenderingContext2D, type: string, x: number, y: number, sz = 13): void {
  const im = m.portraits?.icon(type);
  if (im) smoothImage(ctx, im, x, y, sz, sz);
}

const heroName = (m: Menus, type: string) => (m.heroNames[type] ?? type).toUpperCase();

function drawChampions(m: Menus, ctx: CanvasRenderingContext2D, B: Book, rowAt: RowAt): void {
  const { lx, pgw, pgy, R, RW } = B;
  pageHead(ctx, B, lx, "CHAMPIONS");
  const stats = (type: string) => m.save.data.heroes[type] ?? { picks: 0, w: 0, l: 0, d: 0 };
  m.roster.forEach((type, k) =>
    rowAt(k, (y, sel) => {
      heroIcon(m, ctx, type, lx + 14, y - 3);
      drawPlain(ctx, heroName(m, type), lx + 30, y, sel ? "#8a1810" : BROWN, 0.72, true);
      num(ctx, winRate(stats(type)), lx + pgw - 10, y, "#8a1810", 0.7);
    }),
  );
  const type = m.roster[m.focus];
  if (!type) return;
  const s0 = stats(type);
  pageHead(ctx, B, B.rx, heroName(m, type));
  inset(ctx, R + RW / 2 - 28, pgy + 25, 56, 56, "#3a2a1c");
  texturedRect(ctx, "cloth", R + RW / 2 - 28, pgy + 25, 56, 56, "#7a1a14", 0, 0.7);
  heroIcon(m, ctx, type, R + RW / 2 - 30, pgy + 23, 60);
  let y = pgy + 90;
  for (const [l, v] of [
    ["PICKED", s0.picks],
    ["WON", s0.w],
    ["LOST", s0.l],
    ["DRAWN", s0.d],
  ] as const) {
    stat(ctx, B, l, String(v), y);
    y += 12;
  }
  stat(ctx, B, "WIN RATE", winRate(s0), y + 2, "#8a1810");
}

function drawNames(m: Menus, ctx: CanvasRenderingContext2D, B: Book, rowAt: RowAt): void {
  const { lx, pgw, pgy, pgh, R, RW } = B;
  const ids = m.save.tagIds();
  const names = ids.map((id) => m.save.data.tags[id].name);
  pageHead(ctx, B, lx, "SIGNED NAMES");
  if (!names.length) {
    const a = "NO NAMES SIGNED YET.";
    drawPlain(ctx, a, lx + pgw / 2 - textWidth(a, 0.7, true) / 2, pgy + pgh / 2 - 8, "#6a4424", 0.7, true);
    wrap("CLICK YOUR NAME PLATE ON THE CHAMPION BANNER TO SIGN ONE.", pgw - 24, 0.5).forEach((l, j) =>
      drawPlain(ctx, l, lx + pgw / 2 - textWidth(l, 0.5) / 2, pgy + pgh / 2 + 6 + j * 8, "#8a5a2a", 0.5),
    );
  }
  names.forEach((name, k) =>
    rowAt(k, (y, sel) => {
      waxSeal(ctx, lx + 20, y + 3.5, 5, "#a8141a", "combo");
      drawPlain(ctx, name, lx + 30, y, sel ? "#8a1810" : BROWN, 0.72, true);
      num(ctx, winRate(m.save.data.tags[ids[k]]), lx + pgw - 10, y, "#8a1810", 0.7);
    }),
  );
  const name = names[m.focus];
  if (!name) return;
  const t = m.save.data.tags[ids[m.focus]];
  pageHead(ctx, B, B.rx, "THE SIGNATORY");
  const ns = Math.min(1.6, RW / Math.max(1, textWidth(name, 1, true)));
  drawPlain(ctx, name, R + RW / 2 - textWidth(name, ns, true) / 2, pgy + 22, "#3a2410", ns, true);
  let y = pgy + 50;
  for (const [l, v] of [
    ["WON", t.w],
    ["LOST", t.l],
    ["DRAWN", t.d],
  ] as const) {
    stat(ctx, B, l, String(v), y);
    y += 12;
  }
  stat(ctx, B, "WIN RATE", winRate(t), y + 2, "#8a1810");
  // Favourite champion = most games played.
  const games = (r: { w: number; l: number; d: number }) => r.w + r.l + r.d;
  const fav = Object.entries(t.heroes).sort((a, b) => games(b[1]) - games(a[1]))[0];
  if (fav) {
    y += 18;
    drawPlain(ctx, "FAVOURITE", R, y, "#6a4424", 0.6, true);
    inset(ctx, R + RW - 26, y - 4, 24, 24, "#3a2a1c");
    heroIcon(m, ctx, fav[0], R + RW - 27, y - 5, 26);
    drawPlain(ctx, heroName(m, fav[0]), R, y + 10, BROWN, 0.72, true);
  }
  if (m.confirm === `strike:${ids[m.focus]}`) {
    const c = "PRESS Y AGAIN TO STRIKE";
    drawPlain(ctx, c, R + RW / 2 - textWidth(c, 0.55) / 2, pgy + pgh - 12, "#a01810", 0.55);
  }
}

function drawChronicle(m: Menus, ctx: CanvasRenderingContext2D, B: Book, rowAt: RowAt): void {
  const { lx, pgw, pgy, pgh, R, RW } = B;
  const log = m.save.data.log;
  pageHead(ctx, B, lx, "THE CHRONICLE");
  if (!log.length) {
    const a = "NO GRUDGES SETTLED YET.";
    drawPlain(ctx, a, lx + pgw / 2 - textWidth(a, 0.7, true) / 2, pgy + pgh / 2 - 8, "#6a4424", 0.7, true);
    const b = "FINISH A MATCH TO WRITE THE FIRST PAGE.";
    drawPlain(ctx, b, lx + pgw / 2 - textWidth(b, 0.5) / 2, pgy + pgh / 2 + 6, "#8a5a2a", 0.5);
  }
  const mapName = (id: string) => (m.mapNames[id] ?? id).toUpperCase();
  const modeShort = (md: string) =>
    ({ "1v1": "1V1", "2v2": "2V2", ffa: "FFA", tdm: "DM", ffadm: "FFA DM" })[md] ?? md.toUpperCase();
  const modeLong = (md: string) => MODE_NAME[md as keyof typeof MODE_NAME] ?? md.toUpperCase();
  log.forEach((match, k) =>
    rowAt(k, (y, sel) => {
      drawPlain(ctx, dateOf(match.at), lx + 14, y, "#8a5a2a", 0.62, true);
      const map = mapName(match.map).replace(/^GRUDGE\w*\s*/, "");
      drawPlain(ctx, map.slice(0, 12), lx + 44, y, sel ? "#8a1810" : BROWN, 0.65, true);
      const md = modeShort(match.mode);
      drawPlain(ctx, md, lx + pgw - 46 - textWidth(md, 0.55, true), y + 1, "#8a5a2a", 0.55, true);
      const res = match.winner < 0 ? "DRAW" : (HOUSE[match.winner] ?? "-");
      num(ctx, res, lx + pgw - 10, y, match.winner < 0 ? BROWN : TEAM_TEXT[match.winner], 0.65);
    }),
  );
  const match = log[m.focus];
  if (!match) return;
  pageHead(ctx, B, B.rx, `${dateOf(match.at)} · ${modeLong(match.mode)} · ${mapName(match.map)}`);
  const mm = `${Math.floor(match.secs / 60)}:${String(Math.floor(match.secs % 60)).padStart(2, "0")}`;
  const who = (p: (typeof match.players)[number]) => `${p.cpu ? "CPU" : (p.tag ?? "-")} · ${heroName(m, p.hero)}`;
  let y = pgy + 22;
  if (match.mode === "ffa") {
    // FFA: winner first, house then player on two lines.
    const won = (p: (typeof match.players)[number]) => Number(p.team === match.winner);
    for (const p of [...match.players].sort((a, b) => won(b) - won(a))) {
      heroIcon(m, ctx, p.hero, R, y - 3, 14);
      drawPlain(ctx, HOUSE[p.team] ?? "", R + 17, y, TEAM_TEXT[p.team], 0.55, true);
      drawPlain(ctx, who(p), R + 17, y + 7, BROWN, 0.55, true);
      y += 17;
    }
    y += 2;
  } else {
    for (const team of [0, 1]) {
      drawPlain(ctx, team ? "RED HOUSE" : "BLUE HOUSE", R, y, TEAM_TEXT[team], 0.62, true);
      y += 10;
      for (const p of match.players.filter((q) => q.team === team)) {
        heroIcon(m, ctx, p.hero, R, y - 3, 14);
        drawPlain(ctx, who(p), R + 17, y, BROWN, 0.6, true);
        y += 13;
      }
      y += 4;
    }
  }
  stat(ctx, B, "LASTED", mm, y + 2);
  const w = match.winner;
  const res = w < 0 ? "DRAW" : (HOUSE[w] ?? "-");
  const seal = w < 0 ? "#8a7a60" : w === 0 ? "#2a4ab8" : w === 1 ? "#a8141a" : TEAM_CLOTH[w];
  waxSeal(ctx, R + RW - 14, pgy + pgh - 18, 12, seal, "combo");
  drawPlain(ctx, res === "DRAW" ? "A DRAW" : `${res} WON`, R, pgy + pgh - 22, w < 0 ? BROWN : TEAM_TEXT[w], 0.85, true);
}
