// Team and player panels in the top corners.
//   team head     - keep gem (HP + shield ward), gold / grain with income rate, army count / cap, owned pads;
//                   shakes when the keep or a pad is hit. A memo panel.
//   carriers      - "GRUDGE" / "A THROW" tags for heroes carrying the relic or a bomb.
//   player panel  - per local (or viewed) hero: B / R cooldown buttons, the Z super ring, Wren's vantage
//                   diamond, the XP ring with level, and the learned evolution per slot. A memo panel.
//   morph ring    - the hold-X meter while turning into / out of the commander form (2v2).
//   learn cards   - the two evolution choices offered on level-up, with the auto-pick countdown.
//   standings     - FFA: keep HP of the houses that aren't on screen.
import { playerLabel } from "../../render/costumes";
import type { World } from "../../sim/world";
import { TEAM_NAMES, type Entity } from "../../sim/types";
import { learned, options } from "../../sim/talents";
import { drawNum, drawText, textWidth } from "../font";
import { waxSeal } from "../uiPaint";
import {
  armyIcon,
  bombIcon,
  coinIcon,
  coreIcon,
  fallenMark,
  grainIcon,
  hudIconsLoaded,
  keepGem,
  padIcon,
  relicIcon,
  talentIcon,
  talentImgs,
} from "./icons";
import type { Memo } from "./memo";
import { INK, PAD, PLAYER_TAG, meter, padButton, ringMeter, times, timesWidth } from "./paint";

/** Width of a team / player panel block. */
export const BLOCK_W = 104;

/** Screen-shake offset for a panel hit at `at` (fades over 0.7 s), rounded to half units so memos repaint rarely. */
function shakeOf(at: number | undefined, now: number, amp: number): [number, number] {
  const age = now - (at ?? -99);
  if (age > 0.7) return [0, 0];
  const k = amp * (1 - age / 0.7);
  return [Math.round(Math.sin(now * 71) * k * 2) / 2, Math.round(Math.cos(now * 53) * k * 2) / 2];
}

// ── Team head ──

export interface TeamHeadState {
  /** Displayed gold / grain ease toward the real value. */
  shownCoin: number[];
  shownGrain: number[];
  keepHitAt: number[];
  padHitAt: number[];
}

/** Paints team t's resource head at (x0, y00); returns the y below it. */
export function drawTeamHead(
  ctx: CanvasRenderingContext2D,
  memo: Memo,
  S: TeamHeadState,
  w: World,
  t: number,
  col: string,
  x0: number,
  y00: number,
  right: boolean,
  now: number,
): number {
  const ax = (dx: number, width = 0) => (right ? x0 + BLOCK_W - dx - width : x0 + dx);
  const ts = w.teams[t];
  const core = w.core(t);
  const ward = core?.structure?.ward ?? 0;
  const sudden = w.isSudden();
  S.shownCoin[t] += (ts.resource - S.shownCoin[t]) * Math.min(1, 0.25);
  const coin = String(Math.round(S.shownCoin[t]));
  const army = `${ts.unitCount}/${w.popCap}`;
  const capped = ts.unitCount >= w.popCap;
  const out = !!ts.out;
  const hpFrac = core && !out ? core.hp / core.maxHp : 0;
  const wardFrac = ward > 0 && !sudden ? ward / w.wardMax : 0;
  const lowPulse = hpFrac < 0.25 ? Math.floor(now * 4) % 2 : 0;
  const prevGrain = S.shownGrain[t] ?? ts.grain;
  S.shownGrain[t] = prevGrain + (ts.grain - prevGrain) * Math.min(1, 0.25);
  const grain = String(Math.round(S.shownGrain[t]));
  const grainy = !!w.data.match.economy.grain;
  const rate = grainy ? `+${w.grainOf(t).toFixed(1)}/S` : `+${w.incomeOf(t).toFixed(1)}/S`;
  const [kx, ky] = shakeOf(S.keepHitAt[t], now, 4.5);
  const [px2, py2] = shakeOf(S.padHitAt[t], now, 3);
  let pads = 0;
  for (const pd of w.pads) {
    const s2 = pd.structureId ? w.get(pd.structureId) : undefined;
    if (s2?.alive && s2.team === t) pads++;
  }
  const padHot = now - (S.padHitAt[t] ?? -99) < 0.7;
  const key = [
    x0,
    y00,
    right,
    col,
    Math.round(hpFrac * 200),
    Math.round(wardFrac * 200),
    lowPulse,
    coin,
    grain,
    army,
    capped,
    out,
    rate,
    kx,
    ky,
    px2,
    py2,
    pads,
    padHot,
    hudIconsLoaded(),
  ].join("|");
  return memo.draw(ctx, `head${t}`, key, x0 - 48, y00 - 6, BLOCK_W + 96, 40, (c) => {
    const y = y00;
    const gx = ax(8);
    keepGem(c, gx + kx, y + 10 + ky, 7.2, col, hpFrac, wardFrac, now);
    if (out) {
      fallenMark(c, gx, y + 10, 7);
      const lab = `${TEAM_NAMES[t] ?? ""} HOUSE FELL`;
      drawText(c, lab, right ? ax(20, textWidth(lab, 0.62)) : ax(20), y + 6, "#ffb8a0", 0.62);
      return y + 24;
    }
    // Row 1: gold (and grain) with the income rate.
    const tx = timesWidth();
    const cw = 8 + tx + textWidth(coin, 1.15, true);
    const gw = grainy ? 6 + 9 + tx + textWidth(grain, 1.15, true) + 3 + textWidth(rate, 0.6) : 4 + textWidth(rate, 0.6);
    const aw = 9 + tx + textWidth(army, 1.15, true);
    // Mirrored for right-side teams: gem, gold, grain, rate reading outward from the gem.
    const drawCoin = (x: number) => {
      coinIcon(c, x + 3, y + 5, 3.8);
      x += 8;
      x += times(c, x, y + 1);
      drawNum(c, coin, x, y, "#ffd848", 1.15);
    };
    const drawGrain = (x: number) => {
      grainIcon(c, x + 4, y + 5, 3.6);
      x += 9;
      x += times(c, x, y + 1);
      drawNum(c, grain, x, y, "#f0d8a0", 1.15);
    };
    const grainW = 9 + tx + textWidth(grain, 1.15, true);
    if (!right) {
      let cx = ax(20);
      drawCoin(cx);
      cx += cw;
      if (grainy) {
        cx += 6;
        drawGrain(cx);
        cx += grainW + 3;
      } else cx += 4;
      drawText(c, rate, Math.round(cx), y + 3, "#c8b070", 0.6);
    } else {
      let cx = ax(20, cw + gw);
      drawText(c, rate, Math.round(cx), y + 3, "#c8b070", 0.6);
      cx += textWidth(rate, 0.6) + (grainy ? 3 : 4);
      if (grainy) {
        drawGrain(cx);
        cx += grainW + 6;
      }
      drawCoin(cx);
    }
    // Row 2: army count, then owned pads (red and shaking while one is attacked).
    let bx = right ? ax(20, aw) : ax(20);
    armyIcon(c, bx + 3.5, y + 18, 3.6, col);
    bx += 9;
    bx += times(c, bx, y + 14);
    drawNum(c, army, bx, y + 13, capped ? "#ff8a6a" : "#ffffff", 1.15);
    const ps = String(pads);
    const pw2 = 10 + tx + textWidth(ps, 1.15, true);
    let qx = (right ? bx - 9 - tx - 8 - pw2 : bx + textWidth(army, 1.15, true) + 8) + px2;
    padIcon(c, qx + 4, y + 18 + py2, 4, col, padHot && Math.floor(now * 10) % 2 === 0);
    qx += 10;
    qx += times(c, qx, y + 14 + py2);
    drawNum(c, ps, qx, y + 13 + py2, padHot ? "#ff9070" : "#f0e4c8", 1.15);
    return y + 27;
  });
}

/** Relic / bomb carrier tags under the team head. Returns the height used (0 when nobody carries anything). */
export function drawCarriers(
  ctx: CanvasRenderingContext2D,
  w: World,
  t: number,
  x0: number,
  y: number,
  right: boolean,
  now: number,
): number {
  const ax = (dx: number, width = 0) => (right ? x0 + BLOCK_W - dx - width : x0 + dx);
  let bxc = 0;
  for (const p of w.players) {
    const e = w.getAny(p.heroId);
    if (!e?.hero || e.team !== t || !e.alive) continue;
    const relic = w.arena.carrying(e);
    if (!relic && !e.hero.bomb) continue;
    const lab = relic ? "GRUDGE" : "A THROW";
    const lw = textWidth(lab, 0.7);
    const tag = w.players.filter((q) => q.team === t).length > 1 ? `${playerLabel(p.player)} ` : "";
    const tw = tag ? textWidth(tag, 0.7) : 0;
    const bw = 12 + tw + lw;
    const x = right ? ax(bxc, bw) : ax(bxc);
    if (relic) relicIcon(ctx, x + 5, y + 6.5, 3.6);
    else bombIcon(ctx, x + 5, y + 7, 3.6, now);
    if (tag) drawText(ctx, tag, x + 12, y + 3, "#d8d0c0", 0.7);
    const color = relic ? (Math.floor(now * 3) % 2 ? "#ffe890" : "#ffffff") : "#ffc0a0";
    drawText(ctx, lab, x + 12 + tw, y + 3, color, 0.7);
    bxc += bw + 6;
  }
  return bxc > 0 ? 14 : 0;
}

// ── Player panel ──

/** Wren's vantage bonus is active (still for long enough). */
function vantageOn(w: World, e: Entity): boolean {
  const h = e.hero!;
  const hk = w.heroDef(h.type).hooks;
  return !!hk.vantageMul && !h.dead && w.time - (h.stillAt ?? -99) >= (hk.vantageStill ?? 1);
}

/**
 * Memo key of a player panel: whole-second cooldowns, the super / XP rings quantised to 1/240 of a turn, blink
 * phases, and the learned talents (plus whether their icons have loaded).
 */
function panelKey(
  w: World,
  e: Entity,
  x0: number,
  y0: number,
  right: boolean,
  now: number,
  local: boolean,
  tag: string,
) {
  const h = e.hero!;
  const cd = (k: "b" | "r") => Math.ceil((h.cooldowns[k] ?? 0) - w.time);
  const frac = h.meter / w.data.heroes.baseline.superMax;
  const cfgXp = w.data.talents?.xp;
  const commander = !!w.players.find((p) => p.heroId === e.id)?.commander;
  const nx = cfgXp?.levels[h.level];
  const pv = cfgXp?.levels[h.level - 1] ?? 0;
  const xq = nx === undefined ? 240 : Math.floor(((h.xp - pv) / (nx - pv)) * 240);
  const talents = (["r", "b", "a", "z"] as const)
    .map((slot) => {
      const id = learned(w, e, slot)[0]?.id ?? "";
      return id + (talentImgs.get(id)?.complete ? "+" : "-");
    })
    .join(",");
  return [
    x0,
    y0,
    BLOCK_W,
    right,
    local,
    tag,
    h.dead,
    h.dead ? Math.ceil(h.respawnAt - w.time) : 0,
    cd("b"),
    cd("r"),
    frac >= 1 ? 240 : Math.floor(frac * 240),
    frac >= 1 ? Math.floor(now * 5) % 2 : 0,
    !!cfgXp,
    commander,
    h.level,
    xq,
    talents,
    local && h.picks.length ? Math.floor(now * 3) % 3 : -1,
    h.pip ? 1 : 0,
    vantageOn(w, e) ? 1 : 0,
  ].join("|");
}

/** Player panel as a memo; returns its height. */
export function drawPlayerPanel(
  ctx: CanvasRenderingContext2D,
  memo: Memo,
  player: number,
  w: World,
  e: Entity,
  x0: number,
  y0: number,
  right: boolean,
  now: number,
  local: boolean,
  tag: string,
): number {
  const key = panelKey(w, e, x0, y0, right, now, local, tag);
  return memo.draw(ctx, `pp${player}`, key, x0 - 10, y0 - 6, BLOCK_W + 20, 64, (c) =>
    paintPlayerPanel(c, w, e, x0, y0, right, now, tag),
  );
}

function paintPlayerPanel(
  ctx: CanvasRenderingContext2D,
  w: World,
  e: Entity,
  x0: number,
  y: number,
  right: boolean,
  now: number,
  tag: string,
): number {
  const h = e.hero!;
  const ax = (dx: number, width = 0) => (right ? x0 + BLOCK_W - dx - width : x0 + dx);
  let px = 0;
  if (tag) {
    const tw = textWidth(tag, 0.62, true);
    drawText(ctx, tag, right ? ax(0, tw) : ax(0), y + 2, PLAYER_TAG[h.player] ?? "#d8d0c0", 0.62, true);
    px = tw + 4;
  }
  if (h.dead) {
    const lab = `RESPAWN ${Math.max(0, Math.ceil(h.respawnAt - w.time))}`;
    drawText(ctx, lab, right ? ax(px, textWidth(lab, 0.7)) : ax(px), y + 1.5, "#ffb8a0", 0.7);
    px += Math.max(40, textWidth(lab, 0.7) + 4);
  } else {
    // B and R with their cooldown seconds; a red dot on B while Wren's Pip is out.
    (["b", "r"] as const).forEach((k, i) => {
      const left = (h.cooldowns[k] ?? 0) - w.time;
      const bx = ax(px + 5 + i * 12);
      const ready = left <= 0;
      padButton(ctx, bx, y + 5, 4.8, PAD[k], ready ? k.toUpperCase() : "", !ready);
      if (!ready) {
        const n = String(Math.ceil(left));
        drawNum(ctx, n, bx - textWidth(n, 0.72, true) / 2 - 0.5, y + 1.2, "#ffffff", 0.72);
      }
      if (k === "b" && h.pip) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(bx + 4, y + 1.2, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff4a30";
        ctx.beginPath();
        ctx.arc(bx + 4, y + 1.2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // Z inside the super meter ring, blinking when full.
    const frac = h.meter / w.data.heroes.baseline.superMax;
    const full = frac >= 1;
    const zx = ax(px + 30);
    ringMeter(ctx, zx, y + 5, 6.4, Math.min(1, frac), full && Math.floor(now * 5) % 2 === 0 ? "#fff4a0" : "#f0b020");
    padButton(ctx, zx, y + 5, 4.4, full ? "#e8c030" : PAD.z, "Z", !full);
    if (vantageOn(w, e)) drawVantage(ctx, ax(px + 39), y);
    px += 42;
  }
  const cfgXp = w.data.talents?.xp;
  // Commanders don't level.
  if (!cfgXp || w.players.find((p) => p.heroId === e.id)?.commander) return 12;
  const next = cfgXp.levels[h.level];
  const prev = cfgXp.levels[h.level - 1] ?? 0;
  const xf = next === undefined ? 1 : (h.xp - prev) / (next - prev);
  const lx = ax(px + 5);
  ringMeter(ctx, lx, y + 5, 5.4, xf, next === undefined ? "#ffd040" : "#8ad8ff");
  ctx.fillStyle = "#2a2226";
  ctx.beginPath();
  ctx.arc(lx, y + 5, 4.2, 0, Math.PI * 2);
  ctx.fill();
  const lv = String(h.level);
  drawNum(ctx, lv, lx - textWidth(lv, 0.72, true) / 2 - 0.3, y + 1.3, "#ffe890", 0.72);
  px += 13;
  const isz = 9;
  for (const slot of ["r", "b", "a", "z"] as const) {
    const got = learned(w, e, slot);
    const ix = right ? ax(px, isz) : ax(px);
    if (got[0]) talentIcon(ctx, got[0].id, ix, y + 0.5, isz);
    else {
      ctx.fillStyle = INK;
      ctx.fillRect(ix - 1, y - 0.5, isz + 2, isz + 2);
      ctx.fillStyle = "#2a2430";
      ctx.fillRect(ix, y + 0.5, isz, isz);
    }
    px += isz + 2;
  }
  return 13;
}

/** Gold diamond beside the Z ring. */
function drawVantage(ctx: CanvasRenderingContext2D, vx: number, y: number): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(vx, y + 1);
  ctx.lineTo(vx + 3.2, y + 5);
  ctx.lineTo(vx, y + 9);
  ctx.lineTo(vx - 3.2, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffe070";
  ctx.beginPath();
  ctx.moveTo(vx, y + 2);
  ctx.lineTo(vx + 2.2, y + 5);
  ctx.lineTo(vx, y + 8);
  ctx.lineTo(vx - 2.2, y + 5);
  ctx.closePath();
  ctx.fill();
}

// ── Morph meter and learn cards (anchored under a player panel) ──

/** Hold-X progress ring for morphing into (team banner seal) or back out of (combo seal) the commander. */
export function drawMorphRing(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; right: boolean },
  k: number,
  back: boolean,
  col: string,
): void {
  const r = 11;
  const x = at.right ? at.x - r - 2 : at.x + r + 2;
  const y = at.y + r + 4;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a1c12";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ringMeter(ctx, x, y, r - 0.8, k, "#ffd040");
  waxSeal(ctx, x, y, r * 0.62, back ? "#6a4a2a" : col, back ? "combo" : "banner");
  ctx.save();
  padButton(ctx, x + r * 0.72, y + r * 0.72, 3.6, "#5a5a66", "X");
  ctx.restore();
}

/**
 * The two evolution choices on level-up (C-stick left / right), bobbing; a red ring marks a choice with a
 * combo synergy with something already learned. Shows the auto-pick countdown between them.
 */
export function drawLearnCards(
  ctx: CanvasRenderingContext2D,
  W: number,
  ax0: number,
  top: number,
  w: World,
  heroId: number,
  right: boolean,
  now: number,
): void {
  const hero = w.getAny(heroId);
  const opt = hero?.alive ? options(w, hero) : null;
  if (!opt || !hero?.hero) return;
  const owned = new Set((["r", "b", "a", "z"] as const).flatMap((sl) => learned(w, hero, sl).map((t) => t.id)));
  const r = 12;
  const gap = 8;
  const tw = r * 4 + gap;
  const x0 = right ? Math.min(W - 4, ax0) - tw : Math.max(4, ax0);
  const yc = Math.round(top + r + 2);
  const bob = Math.sin(now * 4) * 0.8;
  opt.list.forEach((o, k) => {
    const x = x0 + r + k * (r * 2 + gap);
    const y = yc + (k ? -bob : bob);
    const synergy = (o.with ?? []).some((q) => owned.has(q.id));
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1c12";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = synergy ? 2 : 1.1;
    ctx.strokeStyle = synergy ? (Math.floor(now * 4) % 2 ? "#ff3a2a" : "#c81810") : "#c89a40";
    ctx.beginPath();
    ctx.arc(x, y, r - (synergy ? 0.6 : 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const im = talentImgs.get(o.id);
    if (im?.complete && im.naturalWidth) {
      const sz = r * 1.45;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r - 1.6, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(im, x - sz / 2, y - sz / 2, sz, sz);
      ctx.restore();
    }
    // C-stick button pointing left (first card) or right (second).
    const bx = x + (k ? r * 0.72 : -r * 0.72);
    const by = y + r * 0.72;
    ctx.save();
    padButton(ctx, bx, by, 3.6, "#e8c030", "");
    ctx.fillStyle = INK;
    ctx.beginPath();
    const d = k ? 1 : -1;
    ctx.moveTo(bx + d * 1.9, by);
    ctx.lineTo(bx - d * 1.2, by - 1.7);
    ctx.lineTo(bx - d * 1.2, by + 1.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });
  if (hero.hero.pickSince !== undefined) {
    const left = Math.max(0, Math.ceil(w.autoPickSeconds - (w.time - hero.hero.pickSince)));
    const tx = String(left);
    const x = Math.round(x0 + tw / 2 - textWidth(tx, 0.7, true) / 2);
    drawNum(ctx, tx, x, Math.round(yc - 3), left <= 3 ? "#ff9070" : "#f0e4c8", 0.7);
  }
}

// ── FFA standings ──

/** Keep HP rows of `teams` (the houses without their own panel on screen). */
export function drawStandings(
  ctx: CanvasRenderingContext2D,
  memo: Memo,
  teamColors: string[],
  x: number,
  y: number,
  w: World,
  teams: number[],
  right: boolean,
): void {
  const rows = teams.map((t) => {
    const core = w.core(t);
    return {
      t,
      out: !!w.teams[t].out,
      hp: core?.alive ? core.hp / core.maxHp : 0,
      shield: !!core?.structure?.shielded && !w.isSudden(),
    };
  });
  const bw = 74;
  const rh = 10;
  const key = [x, y, right, ...rows.map((r) => `${r.t}${r.out}${r.hp.toFixed(3)}${r.shield}`)].join("|");
  memo.draw(ctx, "standings", key, x - 8, y - 6, bw + 16, rows.length * rh + 10, (c) => {
    rows.forEach((r, i) => {
      const ry = y + i * rh;
      const col = teamColors[r.t];
      const gx = right ? x + bw - 4 : x + 4;
      const mx = right ? x : x + 11;
      coreIcon(c, gx, ry + 3, 3.2, r.out ? "#5a5048" : col, r.shield && !r.out);
      if (r.out) {
        fallenMark(c, gx, ry + 3, 4);
        const lab = "FALLEN";
        drawText(c, lab, right ? x + bw - 11 - textWidth(lab, 0.6) : mx, ry - 0.5, "#ffb8a0", 0.6);
      } else meter(c, mx, ry + 1, bw - 11, 4, r.hp, col);
    });
    return 0;
  });
}
