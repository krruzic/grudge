// CODEX page: the open entry's current page on the left (art or a live demo window, title, text, evolution
// picks or a tip, page arrows) and the categorised, scrolling entry list on the right. Content comes from
// ui/codex.ts; live "shot" / "scene" pages publish their window rect (menus.demoRect) for app/demo.ts to render.
import { drawPlain, textWidth } from "../font";
import { talentIcon } from "../hud/icons";
import { wrap } from "../prompts";
import {
  boardTitle,
  card,
  goldArrow,
  inset,
  shadowText,
  smoothImage,
  texturedRect,
  waxSeal,
  windowCut,
} from "../uiPaint";
import type { CodexArt, CodexEntry } from "../codex";
import type { Portraits } from "../portraits";
import { BROWN, INK } from "./common";
import { hintPrompt } from "./pages";
import type { Menus } from "../menus";

function codexArt(
  ctx: CanvasRenderingContext2D,
  P: Portraits | null,
  art: CodexArt,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  inset(ctx, x, y, w, h, "#3a2a1c");
  const bg = art.kind === "seal" ? (art.color ?? "#7a1a14") : "#7a1a14";
  if (art.kind !== "map") texturedRect(ctx, "cloth", x, y, w, h, bg, 0, 0.7);
  if (art.kind === "portrait" && P) {
    smoothImage(ctx, P.actionShot(art.hero, "idle", 0.3, w * 4, h * 4), x, y, w, h);
  } else if (art.kind === "map" && P) {
    const im = P.mapThumb(art.index, w * 2, h * 2);
    if (im) smoothImage(ctx, im, x, y, w, h);
  } else if (art.kind === "unit" && P) {
    const im = P.unitShot(art.type, w * 4, h * 4);
    if (im) smoothImage(ctx, im, x, y, w, h);
  } else if (art.kind === "seal") waxSeal(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.32, "#c8a020", art.glyph);
}

export function drawCodex(m: Menus, ctx: CanvasRenderingContext2D, W: number, H: number): void {
  boardTitle(ctx, W, "!CODEX", "CODEX");
  const entries = m.codexEntries();
  m.syncCodexFocus();
  const entry = entries[m.focus];
  const page = entry?.pages[Math.min(m.codexPage, entry.pages.length - 1)];
  const pw = Math.min(272, Math.round(W * 0.64));
  const ph = H - 50;
  const px = 12;
  const py = 25;
  m.demoRect = null;
  if (entry && page) drawCodexPage(m, ctx, W, H, entry, page, px, py, pw, ph);
  drawEntryList(m, ctx, entries, px + pw + 14, W, H);
  hintPrompt(ctx, W, H, "UP / DOWN: ENTRY · LEFT / RIGHT: PAGE", [
    ["A", "TURN PAGE"],
    ["B", "BACK"],
  ]);
}

function drawCodexPage(
  m: Menus,
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  entry: CodexEntry,
  page: CodexEntry["pages"][number],
  px: number,
  py: number,
  pw: number,
  ph: number,
): void {
  const live = page.art.kind === "shot" || page.art.kind === "scene";
  card(ctx, px, py, pw, ph, 0, null, () => {
    const evo = !!page.picks;
    const wide = live || page.art.kind === "map";
    const aw = wide ? pw - 24 : 88;
    const ah = wide ? (evo ? 74 : 96) : 104;
    if (live) {
      // A hole onto the 3D view; the codex demo renders into this rect (normalised to the screen).
      windowCut(ctx, 12, 12, aw, ah);
      m.demoRect = [(px + 12) / W, (py + 12) / H, aw / W, ah / H];
    } else codexArt(ctx, m.portraits, page.art, 12, 12, aw, ah);
    const tx = wide ? 12 : 12 + aw + 10;
    const tw = pw - tx - 12;
    let y = wide ? 12 + ah + 7 : 12;
    const ts = Math.min(0.85, tw / Math.max(1, textWidth(page.title, 1, true)));
    drawPlain(ctx, page.title, tx, y, "#8a1810", ts, true);
    y += 12;
    const body = wrap(page.text, tw, 0.55);
    body.forEach((l, j) => drawPlain(ctx, l, tx, y + j * 8, BROWN, 0.55));
    y += body.length * 8 + 3;
    if (page.picks) {
      // Evolution choices side by side; the one the demo is showing is highlighted.
      const picks = page.picks;
      const colW = (pw - 30) / 2;
      picks.forEach((pk, k) => {
        const cx = 12 + k * (colW + 6);
        let py2 = y;
        const on = picks.length > 1 && k === m.demoPick % picks.length;
        if (on) {
          ctx.fillStyle = "rgba(168,48,28,0.14)";
          ctx.fillRect(cx - 3, py2 - 3, colW + 6, ph - py2 - 18);
        }
        talentIcon(ctx, pk.id, cx, py2, 18);
        const ns = Math.min(0.66, (colW - 24) / Math.max(1, textWidth(pk.name, 1, true)));
        drawPlain(ctx, pk.name, cx + 22, py2 + 4, on ? "#8a1810" : BROWN, ns, true);
        py2 += 22;
        // The combo line is shown separately in red, so strip "WITH X: ..." from the description.
        const desc = pk.combo ? pk.desc.replace(/\s*WITH [A-Z' ]+:?[^.]*\.?/g, "").trim() : pk.desc;
        const dl = wrap(desc, colW, 0.5).slice(0, 4);
        dl.forEach((l, j) => drawPlain(ctx, l, cx, py2 + j * 7, "#4a3018", 0.5));
        py2 += dl.length * 7 + 2;
        if (pk.combo)
          wrap(pk.combo, colW, 0.5)
            .slice(0, 3)
            .forEach((l, j) => drawPlain(ctx, l, cx, py2 + j * 7, "#a8141a", 0.5));
      });
      y = ph - 22;
    }
    if (page.tip && !page.picks) {
      const tl = wrap(page.tip, pw - 40, 0.52);
      const ty = Math.max(y + 2, ph - 22 - tl.length * 7.5);
      waxSeal(ctx, 18, ty + 4, 5, "#a8141a", "combo");
      tl.forEach((l, j) => drawPlain(ctx, l, 28, ty + j * 7.5, "#8a1810", 0.52));
    }
    const n = entry.pages.length;
    const pg = `${m.codexPage + 1} / ${n}`;
    const cx = pw - 34;
    drawPlain(ctx, pg, cx - textWidth(pg, 0.6, true) / 2, ph - 12, "#6a4424", 0.6, true);
    if (m.codexPage > 0) goldArrow(ctx, cx - 22, ph - 8, -1, 4.5);
    if (m.codexPage < n - 1) goldArrow(ctx, cx + 22, ph - 8, 1, 4.5);
  });
  m.hits.add("cpg:-1", px + pw - 66, py + ph - 18, 22, 16);
  m.hits.add("cpg:1", px + pw - 22, py + ph - 18, 22, 16);
}

type ListRow = { kind: "cat" | "entry"; k: number; label: string };

/** Entry list with category headers, scrolled so the focused entry (and its header when it fits) is visible. */
function drawEntryList(
  m: Menus,
  ctx: CanvasRenderingContext2D,
  entries: CodexEntry[],
  cx0: number,
  W: number,
  H: number,
) {
  const cw = W - cx0 - 19;
  const th = 13;
  const gap = 3;
  const ch = 10;
  const rows: ListRow[] = [];
  let last = "";
  entries.forEach((e2, k) => {
    if (e2.cat !== last) {
      rows.push({ kind: "cat", k: -1, label: e2.cat });
      last = e2.cat;
    }
    rows.push({ kind: "entry", k, label: e2.title });
  });
  const height = (r: ListRow) => (r.kind === "cat" ? ch : th + gap);
  const avail = H - 50;
  const focusRow = rows.findIndex((r) => r.k === m.focus);
  let start = Math.min(m.scrollTop, focusRow);
  const span = (a: number, b: number) => rows.slice(a, b + 1).reduce((q, r) => q + height(r), 0);
  while (span(start, focusRow) > avail) start++;
  while (start > 0 && rows[start - 1].kind === "cat" && span(start - 1, focusRow) <= avail) start--;
  m.scrollTop = start;
  let y = 25;
  let shown = 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (y + height(r) > 25 + avail) break;
    shown = i - start + 1;
    if (r.kind === "cat") {
      shadowText(ctx, r.label, cx0 + 2, y + 1, "#f0c030", 0.5);
      y += ch;
      continue;
    }
    const sel = r.k === m.focus;
    const e2 = entries[r.k];
    m.hits.add(`row:${r.k}`, cx0 - 6, y - 1, cw + 6, th + 2);
    const x = cx0 - (sel ? 6 : 0);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, y - 1, cw + 2, th + 2);
    texturedRect(ctx, "parch", x, y, cw, th, sel ? "#f0d8a0" : null, 0, 1);
    if (sel) goldArrow(ctx, x - 6, y + th / 2, -1, 4.5);
    // Champion entries show the hero's portrait icon, everything else its seal.
    if ((e2.cat === "CHAMPIONS" || e2.cat === "HERALD") && m.portraits) {
      const id =
        e2.cat === "HERALD" ? "herald" : m.roster.find((h) => (m.heroNames[h] ?? h).toUpperCase() === e2.title);
      const im = id ? m.portraits.icon(id) : null;
      if (im) smoothImage(ctx, im, x + 1, y, th, th);
    } else waxSeal(ctx, x + 7, y + th / 2, 4.5, sel ? "#a8141a" : "#6a3a2a", e2.glyph);
    drawPlain(ctx, r.label, x + 16, y + 2.5, sel ? "#8a1810" : BROWN, 0.55, true);
    y += th + gap;
  }
  if (shown < rows.length) {
    // Scrollbar: a wooden track with a gold thumb.
    const total = span(0, rows.length - 1);
    const sx = cx0 + cw + 5;
    const sy = 25;
    const sh = avail - 3;
    ctx.fillStyle = INK;
    ctx.fillRect(sx - 1, sy - 1, 6, sh + 2);
    texturedRect(ctx, "wood", sx, sy, 4, sh, "#3a2414", 0, 1);
    const before = start > 0 ? span(0, start - 1) : 0;
    const tH = Math.max(10, (sh * span(start, start + shown - 1)) / total);
    const tY = sy + Math.min(sh - tH, (sh * before) / total);
    ctx.fillStyle = INK;
    ctx.fillRect(sx - 1, tY - 1, 6, tH + 2);
    texturedRect(ctx, "gold", sx, tY, 4, tH, null, 0, 1);
  }
}
