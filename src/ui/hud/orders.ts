// Army HUD: the orders panel in the team's bottom corner (one disc per soldier type with its portrait, count,
// current order badge, attack lane pips and the formation badge) and the order cross above it that shows which
// order each C-stick direction gives. In 3-4 view split screen the panel is drawn at half size.
import type { World } from "../../sim/world";
import { UNIT_TYPES, type Directive, type UnitType } from "../../sim/types";
import { drawNum, drawText, textWidth } from "../font";
import type { Portraits } from "../portraits";
import { drawCross } from "./buildMenu";
import { formationBadge, orderBadge } from "./icons";
import type { Memo } from "./memo";
import { INK, MARGIN_X, type Frame } from "./paint";

const DIR_NAME: Record<Directive, string> = {
  push: "ATTACK",
  hold: "HOLD",
  follow: "FOLLOW",
  nearest: "HUNT",
  focus: "SIEGE",
  defend: "DEFEND",
  screen: "GUARD",
  split: "SPLIT",
};
const TYPE_NAME: Record<UnitType | "all", string> = {
  grunt: "GRUNTS",
  ranged: "ARCHERS",
  heavy: "BRUTES",
  all: "ARMY",
};
/** C-stick up / left / right / down. */
const CROSS_ORDERS: Directive[] = ["push", "screen", "split", "defend"];

/** The last order a team gave (from the sim's "directive" event), flashed on the panel for a moment. */
export interface LastOrder {
  type: UnitType | "all";
  dir: Directive;
  until: number;
}

export interface OrdersEnv {
  memo: Memo;
  teamColors: string[];
  portraits: Portraits | null;
  split: number;
  /** Lanes on this map (0 in FFA, where attack orders pick a house instead). */
  laneCount: number;
}

export function drawOrders(
  ctx: CanvasRenderingContext2D,
  env: OrdersEnv,
  W: number,
  H: number,
  w: World,
  t: number,
  right: boolean,
  now: number,
  o: LastOrder,
  selected: UnitType | "all" | null,
  F: Frame | null = null,
): void {
  const ts = w.teams[t];
  const counts: Record<UnitType, number> = { grunt: 0, ranged: 0, heavy: 0 };
  for (const e of w.entities) if (e.alive && e.unit && e.team === t) counts[e.unit.type]++;
  const cw = 25;
  const pw = cw * 3;
  const ph = 26;
  const x0 = F ? (right ? F.x + F.w - MARGIN_X - pw : F.x + MARGIN_X) : right ? W - MARGIN_X - pw : MARGIN_X;
  const y0 = (F ? F.y + F.h : H) - ph - 6;
  const flash = now < o.until - 1.2;
  const form = ts.formation ?? "mass";
  const showForm = form !== "mass" || w.players.some((q) => q.team === t && q.commander);
  const key = [
    x0,
    y0,
    right,
    selected,
    flash,
    o.type,
    showForm ? form : "",
    ts.attackTeam ?? -1,
    ts.lane ?? -1,
    ...UNIT_TYPES.map((k) => `${counts[k]}${ts.directives[k]}${!!env.portraits?.unitIcon(k, t)}`),
  ].join("|");
  // Half size in 3-4 views, anchored at the panel's outer bottom corner.
  const s = env.split >= 3 ? 0.5 : 1;
  const ax = right ? x0 + pw : x0;
  const ay = y0 + ph;
  ctx.save();
  if (s !== 1) {
    ctx.translate(ax, ay);
    ctx.scale(s, s);
    ctx.translate(-ax, -ay);
  }
  env.memo.draw(ctx, `orders${t}`, key, x0 - 24, y0 - 6, pw + 48, ph + 12, (c) => {
    drawUnitDiscs(c, env, x0, y0, cw, t, ts, o, counts, selected, flash, right);
    if (showForm) formationBadge(c, right ? x0 - 9 : x0 + pw + 9, y0 + 10.5, form);
    return 0;
  });
  ctx.restore();
}

function drawUnitDiscs(
  ctx: CanvasRenderingContext2D,
  env: OrdersEnv,
  x0: number,
  y0: number,
  cw: number,
  t: number,
  ts: World["teams"][number],
  o: LastOrder,
  counts: Record<UnitType, number>,
  selected: UnitType | "all" | null,
  flash: boolean,
  right: boolean,
): void {
  const r = 9.5;
  const order = right ? [...UNIT_TYPES].reverse() : UNIT_TYPES;
  const mirrored = t === 1 || right;
  order.forEach((k, i) => {
    const x = x0 + cw / 2 + i * cw;
    const y = y0 + r + 1;
    const sel = !!selected && (selected === "all" || selected === k);
    const hit = flash && (o.type === "all" || o.type === k);
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1c12";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    const icon = env.portraits?.unitIcon(k, t);
    if (icon) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r - 1.2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(icon, x - r - 1, y - r - 2, r * 2 + 2, r * 2 + 2);
      ctx.restore();
    }
    ctx.lineWidth = sel || hit ? 1.8 : 1.1;
    ctx.strokeStyle = hit ? "#fff4c0" : sel ? "#ffd040" : "#a07a34";
    ctx.beginPath();
    ctx.arc(x, y, r - 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const dir = ts.directives[k];
    const attackTeam = ts.attackTeam ?? -1;
    const ring = dir === "push" && attackTeam >= 0 ? env.teamColors[attackTeam] : undefined;
    orderBadge(ctx, x + r * 0.74, y - r * 0.74, dir, mirrored, ring);
    // Attack order with a chosen lane: one pip per lane, the chosen one lit.
    if (dir === "push" && (ts.lane ?? -1) >= 0 && env.laneCount > 0) {
      const lx = x + r * 0.74 + (mirrored ? -7.5 : 7.5);
      const n = env.laneCount;
      const top = y - r * 0.74 - (n * 3.4) / 2;
      ctx.fillStyle = INK;
      ctx.fillRect(Math.round(lx - 2), Math.round(top - 1), 4, Math.round(n * 3.4 + 1.6));
      for (let q = 0; q < n; q++) {
        ctx.fillStyle = q === ts.lane ? "#ffd848" : "#5a4a3a";
        ctx.fillRect(Math.round(lx - 1), Math.round(top + q * 3.4), 2, 2.4);
      }
    }
    const count = String(counts[k]);
    const nw = textWidth(count, 0.6, true);
    const tagW = Math.max(7, nw + 4);
    ctx.fillStyle = INK;
    ctx.fillRect(Math.round(x - tagW / 2 - 1), Math.round(y + r - 3), Math.round(tagW + 2), 9);
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(Math.round(x - tagW / 2), Math.round(y + r - 2), Math.round(tagW), 7);
    drawNum(ctx, count, Math.round(x - nw / 2), Math.round(y + r - 2), counts[k] ? "#fff4d8" : "#9a8a70", 0.6);
  });
}

/**
 * The order cross for `group`: which order each direction gives, the group's current order lit. `groupHint`
 * adds the reminder that the d-pad picks which soldiers obey.
 */
export function drawOrderCross(
  ctx: CanvasRenderingContext2D,
  memo: Memo,
  id: string,
  x: number,
  y: number,
  w: World,
  t: number,
  group: UnitType | "all",
  alpha: number,
  now: number,
  groupHint: boolean,
): void {
  const ts = w.teams[t];
  const allSame = UNIT_TYPES.every((k) => ts.directives[k] === ts.directives.grunt);
  const cur = group === "all" ? (allSame ? ts.directives.grunt : null) : ts.directives[group];
  const lit = cur ? CROSS_ORDERS.indexOf(cur) : -1;
  const items = CROSS_ORDERS.map((d): [string, string] => [DIR_NAME[d], ""]);
  drawCross(ctx, memo, id, x, y, { title: `ORDER ${TYPE_NAME[group]}`, items, lit }, alpha);
  if (groupHint) {
    const hint = "D-PAD LEFT / RIGHT: WHO OBEYS";
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha + 0.2) * (Math.floor(now * 4) % 2 ? 1 : 0.85);
    drawText(ctx, hint, Math.round(x - textWidth(hint, 0.6) / 2), y + 22, "#ffe070", 0.6);
    ctx.restore();
  }
}
