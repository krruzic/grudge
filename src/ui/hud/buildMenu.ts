// The C-stick cross: four labelled arrows around a point, used for the build menu (outposts, towers, upgrade,
// level-3 specs, keep shop, evolve choice) and the army order cross (orders.ts). buildCross() turns the mapper's
// open menu into the four items; drawCross() paints it as a memo panel.
import type { World } from "../../sim/world";
import type { MapperUi } from "../../input/commands";
import { options } from "../../sim/talents";
import { buildCost, canSpec, padNear, specCost } from "../../sim/structures";
import { drawNum, drawText, textWidth } from "../font";
import { cArrow } from "./icons";
import type { Memo } from "./memo";

/** Items are [label, cost] for up, left, right, down; `lit` = highlighted index (-1 = all lit). */
export interface Cross {
  title: string;
  items: [string, string][];
  lit: number;
}

type BuildType = Parameters<typeof buildCost>[1];

const cross = (
  title: string,
  up: [string, string],
  left: [string, string],
  right: [string, string],
  down: [string, string],
): Cross => ({
  title,
  items: [up, left, right, down],
  lit: -1,
});
const NONE: [string, string] = ["", ""];
const CANCEL: [string, string] = ["CANCEL", ""];

/** The cross for the mapper's open build menu at the hero's position, or null when the hero is dead. */
export function buildCross(w: World, team: number, heroId: number, mui: MapperUi): Cross | null {
  const hero = w.getAny(heroId);
  if (!hero?.alive) return null;
  if (mui.buildMenu === "learn") {
    const opt = options(w, hero);
    if (!opt) return cross("NOTHING TO LEARN", NONE, NONE, NONE, ["LATER", ""]);
    return cross(
      `EVOLVE ${opt.slot.toUpperCase()}`,
      NONE,
      [opt.list[0]?.name ?? "", ""],
      [opt.list[1]?.name ?? "", ""],
      ["LATER", ""],
    );
  }
  if (mui.buildMenu === "shop") {
    const sh = w.data.match.arena.shop;
    const ts = w.teams[team];
    const price = (n: number) => String(Math.round(n * w.costMul()));
    const wardWait = Math.ceil(ts.wardReadyAt - w.time);
    return cross(
      "KEEP SHOP",
      ["BOMB", price(sh.bomb.cost)],
      ["SHIELD", wardWait > 0 ? `${wardWait}S` : price(sh.ward.cost)],
      ["CANNON", price(sh.cannon.cost)],
      CANCEL,
    );
  }
  const pad = padNear(w, hero);
  if (!pad) return cross("NO PAD HERE", NONE, NONE, NONE, NONE);
  const cost = (k: BuildType) => String(buildCost(w, k, false, team));
  const st = pad.structureId ? w.get(pad.structureId) : undefined;
  const ours = !!st?.structure && st.team === team;
  if (mui.buildMenu === "spec" && ours && canSpec(w, st!)) {
    const type = st!.structure!.type as BuildType;
    const specs = w.data.structures.types[type].specs ?? [];
    const price = String(specCost(w, type, team));
    return cross(
      "LEVEL 3",
      [specs[0]?.name ?? "", price],
      [specs[1]?.name ?? "", price],
      [specs[2]?.name ?? "", price],
      CANCEL,
    );
  }
  if (ours) {
    const s = st!.structure!;
    const up = s.level < 2 ? String(buildCost(w, s.type as BuildType, true, team)) : "";
    return cross(s.level < 2 ? "UPGRADE" : "MAX LEVEL", [up ? "UPGRADE" : "", up], NONE, NONE, CANCEL);
  }
  if (mui.buildMenu === "tower")
    return cross("TOWERS", ["DAMAGE", cost("damage")], ["CONTROL", cost("control")], NONE, CANCEL);
  // Maps with generic outposts have one building; the others offer the three production types.
  if (w.terrain.outposts) return cross("OUTPOSTS", ["OUTPOST", cost("outpost")], NONE, NONE, CANCEL);
  return cross(
    "OUTPOSTS",
    ["RANGE", cost("range")],
    ["BARRACKS", cost("barracks")],
    ["FOUNDRY", cost("foundry")],
    CANCEL,
  );
}

/** Paints the cross centred at (x, y) as memo panel `id`. */
export function drawCross(
  ctx: CanvasRenderingContext2D,
  memo: Memo,
  id: string,
  x: number,
  y: number,
  c: Cross,
  alpha: number,
): void {
  const key = [x, y, c.title, c.items.flat().join(","), c.lit, alpha].join("|");
  const side = (i: number) =>
    Math.max(textWidth(c.items[i][0], 0.75), c.items[i][1] ? textWidth(c.items[i][1], 0.8, true) : 0);
  const half =
    Math.max(
      textWidth(c.title, 0.8) / 2,
      textWidth(c.items[0][0], 0.75) / 2,
      textWidth(c.items[3][0], 0.75) / 2,
      9 + 4.6 + 3 + Math.max(side(1), side(2)),
    ) + 6;
  const top = 9 + (c.items[0][1] ? 32 : 23) + 6;
  memo.draw(ctx, id, key, x - half, y - top, half * 2, top + 9 + 5 + 8 + 12 + 6, (g) => {
    drawCrossBody(g, x, y, c, alpha);
    return 0;
  });
}

function drawCrossBody(ctx: CanvasRenderingContext2D, x: number, y: number, c: Cross, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const r = 4.6;
  const d = 9;
  // up, left, right, down: offset and arrow angle.
  const pos: [number, number, number][] = [
    [0, -d, -Math.PI / 2],
    [-d, 0, Math.PI],
    [d, 0, 0],
    [0, d, Math.PI / 2],
  ];
  const tw = textWidth(c.title, 0.8);
  drawText(ctx, c.title, x - tw / 2, y - d - (c.items[0][1] ? 32 : 23), "#ffffff", 0.8);
  pos.forEach(([dx, dy, ang], i) => {
    const lit = c.lit < 0 || c.lit === i;
    cArrow(ctx, x + dx, y + dy, r, ang, lit);
    const [label, cost] = c.items[i];
    if (!label) return;
    const lw = textWidth(label, 0.75);
    const [lx, ly] =
      i === 0
        ? [x - lw / 2, y - d - 13]
        : i === 3
          ? [x - lw / 2, y + d + 5]
          : i === 1
            ? [x - d - r - 3 - lw, y - 4]
            : [x + d + r + 3, y - 4];
    drawText(ctx, label, lx, ly, lit ? "#ffffff" : "#8a8478", 0.75);
    if (cost) {
      // Costs sit under the label (above it for the top item), aligned to the arrow side.
      const cw = textWidth(cost, 0.8, true);
      const cx = i === 1 ? lx + lw - cw : i === 2 ? lx : lx + lw / 2 - cw / 2;
      const cy = i === 0 ? ly - 9 : ly + 8;
      drawNum(ctx, cost, cx, cy, "#ffd848", 0.8);
    }
  });
  ctx.restore();
}
