// Top-centre HUD: the match clock (with SUDDEN DEATH), the gate-lockdown padlock beside it, and in training the
// DPS meter panel in its place.
//
// Gate lockdown: the clock holds at full length while the gates are shut (match length = matchSeconds +
// lockdown), and a padlock left of it rings down the lockdown, shaking in the last 5 s, then pops open and fades.
import type { World } from "../../sim/world";
import { drawNum, drawPlain, drawText, textWidth } from "../font";
import { texturedRect } from "../uiPaint";
import { hudIcon } from "./icons";
import { INK, MARGIN_Y } from "./paint";

export function drawClock(ctx: CanvasRenderingContext2D, W: number, w: World, now: number): void {
  const m = w.data.match;
  const sudden = w.match.phase === "sudden";
  const remain = sudden ? w.matchLength + m.suddenDeathSeconds - w.time : w.matchLength - w.time;
  const lockAt = w.mapEvents.lockUntil;
  // Never show more than the post-lockdown length (the clock "holds" during lockdown).
  const r = Math.max(0, Math.ceil(sudden ? remain : Math.min(remain, w.matchLength - lockAt)));
  const txt = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
  const s = 1.7;
  const low = r <= 30 && Math.floor(now * 2) % 2 === 0;
  const locked = w.mapEvents.locked;
  const col = sudden ? "#ff5a3a" : locked ? "#d8ccb0" : low ? "#ffd040" : "#ffffff";
  const tx = Math.round((W - textWidth(txt, s, true)) / 2);
  drawNum(ctx, txt, tx, MARGIN_Y - 1, col, s);
  const sinceOpen = w.time - lockAt;
  if (lockAt > 0 && (locked || sinceOpen < 2.5)) drawGateLock(ctx, tx - 13, MARGIN_Y + 7.5, w, locked, sinceOpen, now);
  if (sudden) {
    const lab = "SUDDEN DEATH";
    drawText(ctx, lab, Math.round((W - textWidth(lab, 0.8)) / 2), MARGIN_Y + 17, "#ff9a7a", 0.8);
  }
}

function drawGateLock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: World,
  locked: boolean,
  sinceOpen: number,
  now: number,
): void {
  const total = Math.max(1, w.data.match.lockdown?.seconds ?? 30);
  const left = Math.max(0, w.mapEvents.lockUntil - w.time);
  const frac = locked ? left / total : 0;
  const r = 8.5;
  ctx.save();
  ctx.globalAlpha = locked ? 1 : Math.max(0, 1 - sinceOpen / 2.5);
  ctx.fillStyle = "rgba(24,16,8,0.72)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = "round";
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "#4a3820";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (frac > 0) {
    const warn = left <= 5;
    ctx.strokeStyle = warn ? (Math.floor(now * 4) % 2 ? "#ffe070" : "#ff9a40") : "#e8b040";
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }
  const shake = locked && left <= 5 ? Math.sin(now * 40) * 0.6 * (1 - left / 5) : 0;
  const pop = locked ? 0 : Math.min(1, sinceOpen * 4);
  ctx.translate(shake, 0);
  const size = r * 1.75 * (1 + pop * 0.15 * Math.max(0, 1 - sinceOpen));
  hudIcon(ctx, locked ? "lock_closed" : "lock_open", x, y - pop * 0.6, size);
  ctx.restore();
}

// ── Training ground ──

/** Damage the local team dealt to training dummies: rolling 5 s log, current combo, totals. */
export interface Trainer {
  log: [number, number][];
  burst: number;
  burstStart: number;
  lastAt: number;
  total: number;
  max: number;
  hits: number;
}

export const newTrainer = (): Trainer => ({ log: [], burst: 0, burstStart: 0, lastAt: -99, total: 0, max: 0, hits: 0 });

/** A combo ends after this long without a hit. */
const COMBO_GAP = 2.5;

/** Logs team 0's hits on dummies from this frame's events. */
export function trackTraining(T: Trainer, w: World): void {
  for (const ev of w.events) {
    if (ev.type !== "hit" || ev.id === undefined || !ev.amount) continue;
    const target = w.getAny(ev.id);
    if (!target?.dummy || target.structure) continue;
    const from = ev.src !== undefined ? w.getAny(ev.src) : undefined;
    if (!from || from.team !== 0) continue;
    if (w.time - T.lastAt > COMBO_GAP) {
      T.burst = 0;
      T.burstStart = w.time;
    }
    T.lastAt = w.time;
    T.burst += ev.amount;
    T.total += ev.amount;
    T.hits++;
    T.max = Math.max(T.max, ev.amount);
    T.log.push([w.time, ev.amount]);
  }
  const cut = w.time - 5;
  while (T.log.length && T.log[0][0] < cut) T.log.shift();
}

export function drawTraining(ctx: CanvasRenderingContext2D, W: number, w: World, T: Trainer): void {
  const span = Math.max(1, Math.min(5, w.time - (T.log[0]?.[0] ?? w.time) + 0.5));
  const dps = T.log.reduce((s, [, a]) => s + a, 0) / (T.log.length ? span : 1);
  const live = w.time - T.lastAt < COMBO_GAP;
  const dur = Math.max(0.1, T.lastAt - T.burstStart);
  const rows: [string, string][] = [
    ["DPS", T.log.length ? String(Math.round(dps)) : "-"],
    ["COMBO", T.burst ? `${Math.round(T.burst)} IN ${dur.toFixed(1)}S` : "-"],
    ["BIGGEST HIT", T.max ? String(Math.round(T.max)) : "-"],
    ["TOTAL", `${Math.round(T.total)} · ${T.hits} HITS`],
  ];
  const pw = 132;
  const x = Math.round(W / 2 - pw / 2);
  const y = MARGIN_Y - 3;
  const ph = 12 + rows.length * 9 + 3;
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, pw + 2, ph + 2);
  texturedRect(ctx, "parch", x, y, pw, ph, "#d8c098", 0, 1);
  const title = "TRAINING GROUND";
  drawPlain(ctx, title, x + pw / 2 - textWidth(title, 0.62, true) / 2, y + 2, "#8a1810", 0.62, true);
  rows.forEach(([k, v], i) => {
    const ry = y + 12 + i * 9;
    drawPlain(ctx, k, x + 6, ry, "#5a3a1c", 0.55, true);
    const color = i === 0 && live ? "#a81810" : "#3a2410";
    drawPlain(ctx, v, x + pw - 6 - textWidth(v, 0.6, true), ry, color, 0.6, true);
  });
}
