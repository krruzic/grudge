// Results screen: a parchment summary (end reason and time over a live window onto the battlefield, then team
// stats: blue vs red bars, or FFA columns by placing) and one pinned card per player (winners straight, losers
// tilted). FFA placing: winner, then surviving houses by keep HP, then fallen houses, last to fall first.
import type { World } from "../../sim/world";
import { drawPlain, textWidth } from "../font";
import { bottomPrompt } from "../prompts";
import {
  artTitle,
  beam,
  boardBg,
  markWindow,
  parchment,
  pin,
  shadowText,
  smoothImage,
  texturedRect,
  waxSeal,
  woodFloor,
} from "../uiPaint";
import type { Screens } from "../screens";
import { TEAM_BRIGHT, TEAM_CLOTH, TEAM_TEXT } from "./common";

const PLACE = ["1ST", "2ND", "3RD", "4TH"];

export interface ResultPlayer {
  tag: string | null;
  hero: string;
  team: number;
  cpu: boolean;
}

/** Final team order for the results (see header). `fallen` lists eliminated houses in elimination order. */
export function placing(w: World, fallen: number[]): number[] {
  const keep = (t: number) => {
    const c = w.core(t);
    return c?.alive ? c.hp / c.maxHp : 0;
  };
  const teams = w.teams.map((_, t) => t);
  const standing = teams.filter((t) => !w.teams[t].out && t !== w.match.winner).sort((a, b) => keep(b) - keep(a));
  const out = [...teams.filter((t) => w.teams[t].out && !fallen.includes(t)), ...fallen.filter((t) => w.teams[t]?.out)];
  return [...(w.match.winner >= 0 ? [w.match.winner] : []), ...standing, ...out.reverse()];
}

export function drawResults(s: Screens, ctx: CanvasRenderingContext2D, W: number, w: World, blink: boolean): void {
  // Results always lay out on the full logical height.
  const H = 240;
  const win = w.match.winner;
  const head = win < 0 ? "A DRAW" : `${w.teamName(win)} HOUSE WINS`;
  boardBg(ctx, W, H);
  woodFloor(ctx, H - 20, W, H);
  beam(ctx, 4, 2, W - 8, 17);
  artTitle(ctx, `!${head}`, head, W / 2, 3, 14);
  const listed = s.resultPlayers.length
    ? s.resultPlayers
    : w.players.map((p) => ({ tag: null, hero: p.heroType, team: p.team, cpu: true }));
  const ffa = w.ffa;
  const place = (t: number) => s.placing.indexOf(t);
  const withSlot = listed.map((p, i) => ({ ...p, slot: i }));
  const ps = ffa ? withSlot.sort((a, b) => place(a.team) - place(b.team)) : withSlot;
  const t = w.teams;
  const pw = Math.min(250, Math.round(W * 0.6));
  const ph = H - 52;
  const px = 16;
  const py = 26;
  const reason = w.match.reason.toUpperCase();
  const mm = `${Math.floor(w.time / 60)}:${String(Math.floor(w.time % 60)).padStart(2, "0")}`;

  // Summary card with a window onto the live world.
  ctx.save();
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.rotate(-0.02);
  ctx.translate(-pw / 2, -ph / 2);
  parchment(ctx, 0, 0, pw, ph);
  const iw = pw - 24;
  const ih = 58;
  ctx.fillStyle = "#2a1a0a";
  ctx.fillRect(10, 10, iw + 4, ih + 4);
  ctx.clearRect(12, 12, iw, ih);
  markWindow(ctx, 12, 12, iw, ih);
  const sub = `${reason}  ·  ${mm}`;
  shadowText(ctx, sub, 12 + iw / 2 - textWidth(sub, 0.6) / 2, 12 + ih - 11, "#fff0c8", 0.6);
  waxSeal(ctx, pw - 26, ih + 10, 17, win < 0 ? "#8a7a60" : TEAM_CLOTH[win], win < 0 ? "none" : "castle");
  const rows: [string, (i: number) => number][] = [
    ["KEEP DAMAGE", (i) => Math.round(t[i].coreDamageDealt)],
    ["HERO KILLS", (i) => t[i].heroKills],
    ["SOLDIERS SLAIN", (i) => t[i].kills],
    ["BUILT", (i) => t[i].structuresBuilt],
    ["LOST", (i) => t[i].structuresLost],
  ];
  const ry = ih + 22;
  const rh = Math.min(18, (ph - ry - 8) / rows.length);
  if (ffa) drawFfaRows(s, ctx, pw, ry + 14, Math.min(rh, (ph - ry - 20) / rows.length), rows, w);
  else drawVersusRows(ctx, pw, ry, rh, rows);
  ctx.restore();

  // Player cards.
  const cx0 = px + pw + 18;
  const cw = W - cx0 - 14;
  const n = Math.max(1, ps.length);
  const gap = 6;
  const chh = Math.min(44, Math.floor((H - 54 - (n - 1) * gap) / n));
  ps.forEach((p, k) => {
    const cy = 28 + k * (chh + gap);
    const won = p.team === win;
    ctx.save();
    ctx.translate(cx0 + cw / 2, cy + chh / 2);
    ctx.rotate(won ? 0 : k % 2 ? 0.03 : -0.03);
    ctx.translate(-cw / 2, -chh / 2);
    parchment(ctx, 0, 0, cw, chh);
    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(4, 4, chh - 6, chh - 6);
    texturedRect(ctx, "cloth", 5, 5, chh - 8, chh - 8, TEAM_CLOTH[p.team], 0, 0.7);
    const icon = s.portraits?.icon(p.hero);
    if (icon) smoothImage(ctx, icon, 5, 5, chh - 8, chh - 8);
    const nm = p.cpu ? "CPU" : (p.tag ?? `P${p.slot + 1}`);
    drawPlain(ctx, nm, chh + 2, chh / 2 - 9, TEAM_TEXT[p.team], 0.72, true);
    const hero = (s.heroes[p.hero]?.name ?? p.hero).toUpperCase();
    drawPlain(ctx, hero, chh + 2, chh / 2 + 2, "#4a3018", 0.55, true);
    if (won) waxSeal(ctx, cw - 12, chh / 2, 8, "#c8a020", "combo");
    else if (ffa) {
      const pl = PLACE[place(p.team)] ?? "";
      drawPlain(ctx, pl, cw - 6 - textWidth(pl, 0.62, true), chh / 2 - 9, "#6a4424", 0.62, true);
      if (w.teams[p.team]?.out)
        drawPlain(ctx, "FALLEN", cw - 6 - textWidth("FALLEN", 0.45, true), chh / 2 + 2, "#8a1810", 0.45, true);
    }
    pin(ctx, cw / 2, 3, won ? "#c8a020" : TEAM_BRIGHT[p.team]);
    ctx.restore();
  });
  if (blink) bottomPrompt(ctx, W, H, [["A", "CONTINUE"]]);
}

/** Blue vs red: both values with the higher one coloured, and a split bar. */
function drawVersusRows(
  ctx: CanvasRenderingContext2D,
  pw: number,
  ry: number,
  rh: number,
  rows: [string, (i: number) => number][],
): void {
  rows.forEach(([label, f], i) => {
    const y = ry + i * rh;
    const a = f(0);
    const b = f(1);
    drawPlain(ctx, label, pw / 2 - textWidth(label, 0.5, true) / 2, y, "#6a4424", 0.5, true);
    const va = String(a);
    const vb = String(b);
    drawPlain(ctx, va, 12, y + 2, a > b ? "#1c34a8" : "#4a3018", 0.72, true);
    drawPlain(ctx, vb, pw - 12 - textWidth(vb, 0.72, true), y + 2, b > a ? "#a81c1c" : "#4a3018", 0.72, true);
    const tot = Math.max(1, a + b);
    const barW = pw - 110;
    const bx = 55;
    const by = y + 9;
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(bx - 1, by - 1, barW + 2, 5);
    if (a + b === 0) {
      ctx.fillStyle = "#8a7a60";
      ctx.fillRect(bx, by, barW, 3);
    } else {
      const blue = Math.round((barW * a) / tot);
      ctx.fillStyle = "#3a58e0";
      ctx.fillRect(bx, by, blue, 3);
      ctx.fillStyle = "#d83828";
      ctx.fillRect(bx + blue, by, barW - blue, 3);
    }
  });
}

/** FFA: one column per house in placing order (cloth header with 1ST..4TH), best value per row coloured. */
function drawFfaRows(
  s: Screens,
  ctx: CanvasRenderingContext2D,
  pw: number,
  ry: number,
  rh: number,
  rows: [string, (i: number) => number][],
  w: World,
): void {
  const order = s.placing.length ? s.placing : w.teams.map((_, t) => t);
  const lw = 74;
  const colW = (pw - 12 - lw - 8) / order.length;
  const cx = (k: number) => 12 + lw + colW * (k + 0.5);
  order.forEach((t, k) => {
    const x = Math.round(cx(k) - colW / 2 + 2);
    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(x - 1, ry - 13, Math.round(colW - 4) + 2, 10);
    texturedRect(ctx, "cloth", x, ry - 12, Math.round(colW - 4), 8, TEAM_CLOTH[t], 0, 0.7);
    const pl = PLACE[k] ?? "";
    shadowText(ctx, pl, cx(k) - textWidth(pl, 0.45) / 2, ry - 11, "#fff4d8", 0.45);
    if (w.teams[t]?.out) {
      ctx.strokeStyle = "#8a1810";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, ry - 4.5);
      ctx.lineTo(x + Math.round(colW - 4), ry - 4.5);
      ctx.stroke();
    }
  });
  rows.forEach(([label, f], i) => {
    const y = ry + i * rh;
    const vals = order.map((t) => f(t));
    // "LOST" (buildings lost): lower is better.
    const best = label === "LOST" ? Math.min(...vals) : Math.max(...vals);
    const unique = vals.filter((q) => q === best).length === 1;
    drawPlain(ctx, label, 12, y + 2, "#6a4424", 0.5, true);
    vals.forEach((v, k) => {
      const sv = String(v);
      const top = unique && v === best;
      drawPlain(
        ctx,
        sv,
        cx(k) - textWidth(sv, 0.72, true) / 2,
        y + 1,
        top ? TEAM_TEXT[order[k]] : "#4a3018",
        0.72,
        true,
      );
    });
    // Stacked share bar.
    const tot = vals.reduce((a, b) => a + b, 0);
    const barW = pw - 24;
    const by = y + 11;
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(11, by - 1, barW + 2, 4);
    if (!tot) {
      ctx.fillStyle = "#8a7a60";
      ctx.fillRect(12, by, barW, 2);
      return;
    }
    let bx = 12;
    vals.forEach((v, k) => {
      const bw = k === vals.length - 1 ? 12 + barW - bx : Math.round((barW * v) / tot);
      ctx.fillStyle = TEAM_CLOTH[order[k]];
      ctx.fillRect(bx, by, bw, 2);
      bx += bw;
    });
  });
}
