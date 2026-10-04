// The Grudge relic status line under the clock ("THE GRUDGE AWAITS", "P1 CARRIES THE GRUDGE", ...) and, in a
// shared (non-split) view, an arrow at the screen edge pointing at the relic when it is off screen.
import { playerLabel } from "../../render/costumes";
import type { World } from "../../sim/world";
import { drawText, textWidth } from "../font";
import { INK, MARGIN_Y } from "./paint";

type Locate = (x: number, y: number, z: number) => { x: number; y: number };

export function drawRelic(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  w: World,
  now: number,
  teamColors: string[],
  locate: Locate | null,
  hideLine = false,
): void {
  const r = w.arena.relic;
  const cfg = w.data.match.arena.relic;
  let text: string;
  let col = "#ffd870";
  if (r.state === "waiting") {
    text = `THE GRUDGE WAKES IN ${Math.ceil(r.since - w.time)}`;
    col = "#c8b890";
  } else if (r.state === "home") text = "THE GRUDGE AWAITS";
  else if (r.state === "carried") {
    const c = w.getAny(r.carrier);
    col = c ? teamColors[c.team] : col;
    text =
      r.channel > 0
        ? `ENSHRINING · ${Math.ceil(cfg.enshrineSeconds - r.channel)}`
        : `${playerLabel(c?.hero?.player ?? 0)} CARRIES THE GRUDGE · TO A TOWER, OUTPOST OR KEEP`;
  } else if (r.state === "shrined") {
    const s = w.get(r.shrineId);
    const type = s?.structure?.type;
    const where =
      type === "core"
        ? "KEEP"
        : type && w.data.structures.types[type as "barracks"]?.class === "production"
          ? "OUTPOST"
          : "TOWER";
    col = teamColors[r.team] ?? col;
    text =
      r.channel > 0
        ? `STEALING THE GRUDGE · ${Math.ceil(cfg.stealSeconds - r.channel)}`
        : `${w.teamName(r.team)} HOLDS THE GRUDGE · ${where}`;
  } else {
    const left = Math.max(0, Math.ceil(cfg.returnSeconds - (w.time - r.since)));
    text = `GRUDGE LOOSE · ${left}`;
  }
  const clockTall = w.match.phase === "sudden" || (w.mapEvents.locked && !w.training);
  const y = MARGIN_Y + (clockTall ? 35 : 19);
  const moving = r.state === "carried" || r.state === "dropped" || (r.state === "shrined" && r.channel > 0);
  const flash = moving ? Math.floor(now * 3) % 2 === 0 : false;
  if (!hideLine && !w.training)
    drawText(ctx, text, Math.round((W - textWidth(text, 0.72)) / 2), y, flash ? "#ffffff" : col, 0.72);
  if (r.state === "waiting" || !locate) return;
  drawOffscreenArrow(ctx, W, H, r, now, col, locate);
}

/** Edge arrow toward the relic when its screen position is outside the view (minus the top HUD band). */
function drawOffscreenArrow(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  r: World["arena"]["relic"],
  now: number,
  col: string,
  locate: Locate,
): void {
  const lift = r.state === "carried" ? 4.5 : r.state === "shrined" ? 6 : 1.5;
  const sp = locate(r.x, r.y + lift, r.z);
  // worldToScreen is in CSS pixels; convert to layout units.
  const sx = sp.x * (W / window.innerWidth);
  const sy = sp.y * (H / window.innerHeight);
  const pad = 12;
  const top = pad + 24;
  if (sx >= pad && sx <= W - pad && sy >= top && sy <= H - pad) return;
  const cx = W / 2;
  const cy = H / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  const s = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad) / Math.max(1e-3, Math.abs(dy)));
  const ex = cx + dx * s;
  const ey = Math.max(top, cy + dy * s);
  const ang = Math.atan2(dy, dx);
  const bob = Math.sin(now * 8) * 1.5;
  ctx.save();
  ctx.translate(ex - Math.cos(ang) * bob, ey - Math.sin(ang) * bob);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -6);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.restore();
}
