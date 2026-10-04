// HUD: the in-match overlay painted into the UI canvas each frame.
//
// update() runs once per frame after the sim stepped and digests World.events into callouts (banners, cards,
// notices), last orders, panel hit-shakes and the training DPS log. draw() then paints, in order: split-screen
// dividers, the clock (or training meter), the relic line, the minimap with stock icons, event cards, and per
// team the resource head, player panels, notices, morph / learn prompts, the build or order cross and the army
// panel. Panels that rarely change are memo bitmaps (hud/memo.ts).
//
// Layout: in 1v1 / 2v2 team 0 is on the left and team 1 mirrored on the right; with 3+ players (or 3-4 split
// views) both team blocks shrink. In split screen each local player's panel and crosses move into their own
// view rect (rectOf). FFA lays each local house out in its own frame and lists the others as standings.
// Modules: hud/canvas (UiCanvas), paint (primitives), icons, memo, callouts, clock, relic, minimap, panels,
// orders, buildMenu.
import { playerLabel } from "../render/costumes";
import type { World } from "../sim/world";
import type { MapperUi } from "../input/commands";
import type { Portraits } from "./portraits";
import { drawText, textWidth } from "./font";
import { buildCross, drawCross } from "./hud/buildMenu";
import { Callouts } from "./hud/callouts";
import { drawClock, drawTraining, newTrainer, trackTraining } from "./hud/clock";
import { Memo } from "./hud/memo";
import { Minimap } from "./hud/minimap";
import { drawOrderCross, drawOrders, type LastOrder } from "./hud/orders";
import { INK, MARGIN_X, MARGIN_Y, type Frame } from "./hud/paint";
import {
  BLOCK_W,
  drawCarriers,
  drawLearnCards,
  drawMorphRing,
  drawPlayerPanel,
  drawStandings,
  drawTeamHead,
  type TeamHeadState,
} from "./hud/panels";
import { drawRelic } from "./hud/relic";

export { LOGICAL_H, UiCanvas } from "./hud/canvas";
export { INK, PAD, meter, padButton } from "./hud/paint";
export { talentIcon } from "./hud/icons";

type ViewRect = { x: number; y: number; w: number; h: number };

export class Hud {
  // ── Set by the app each frame ──
  /** Number of split views (0/1 = shared view). */
  split = 0;
  /** Zoom-out of the shared camera (0-1); shrinks the minimap. */
  zoomOut = 0;
  /** World -> CSS-pixel projection in the shared view (null in split screen). */
  locate: ((x: number, y: number, z: number) => { x: number; y: number }) | null = null;
  /** Normalised view rect of a player's split view, or null when that player has none. */
  rectOf: ((player: number) => ViewRect | null) | null = null;
  /** Map index for the minimap image. */
  mapIndex: (() => number) | null = null;
  minimap = true;
  portraits: Portraits | null = null;
  trainer = newTrainer();

  private visible = false;
  private readonly memo = new Memo();
  private readonly callouts: Callouts;
  private readonly mini: Minimap;
  private readonly head: TeamHeadState = { shownCoin: [0, 0, 0, 0], shownGrain: [], keepHitAt: [], padHitAt: [] };
  private orders: LastOrder[] = Array.from({ length: 4 }, () => ({ type: "all" as const, dir: "follow", until: 0 }));
  /** Lanes on the map (0 in FFA). */
  private laneCount = 0;
  /** 3+ heroes or 3-4 views: team blocks are scaled down and order crosses only show right after input. */
  private dense = false;
  /** Bottom-left (or bottom-right) corner under each player's panel, for morph rings and learn cards. */
  private panelAt: Record<number, { x: number; y: number; right: boolean }> = {};
  /** Memo ids for crosses are numbered per frame. */
  private crossN = 0;

  constructor(private teamColors: string[]) {
    this.callouts = new Callouts(teamColors);
    this.mini = new Minimap(teamColors);
  }

  show(on: boolean): void {
    this.visible = on;
  }

  /** Shows a banner line (or a big centred word with `big`) for `seconds`. */
  banner_(text: string, now: number, seconds = 2.2, big = false): void {
    this.callouts.showBanner(text, now, seconds, big);
  }

  resetTrainer(): void {
    this.trainer = newTrainer();
  }

  update(w: World, _ui: (MapperUi | null)[], now: number): void {
    this.laneCount = w.ffa ? 0 : w.terrain.lanes.length;
    if (w.training) trackTraining(this.trainer, w);
    this.callouts.checkLockdown(w, now);
    for (const ev of w.events) {
      if (ev.type === "hit" && ev.id !== undefined) {
        const tg = w.getAny(ev.id);
        const st = tg?.structure;
        if (st && tg) {
          if (st.type === "core") this.head.keepHitAt[tg.team] = now;
          else if (st.padIndex >= 0) this.head.padHitAt[tg.team] = now;
        }
      }
      this.callouts.digest(w, ev, now);
      if (ev.type === "directive" && ev.team >= 0 && ev.team < this.orders.length)
        this.orders[ev.team] = { type: ev.unitType, dir: ev.dir, until: now + 2.2 };
    }
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, ui: (MapperUi | null)[], now: number): void {
    this.crossN = 0;
    if (this.split >= 2) this.drawDividers(ctx, W, H);
    const C = this.callouts;
    const bannerOn = C.bannerOn(now);
    const clockTall = w.match.phase === "sudden" || (w.mapEvents.locked && !w.training);
    C.bannerLineY = MARGIN_Y + (clockTall ? 27 : 19);
    // Big banners ("FIGHT!", winner) and every banner while the HUD is hidden draw first / alone.
    if (bannerOn && (C.big || !this.visible)) C.drawBanner(ctx, W, now);
    if (!this.visible) return;
    if (w.training) drawTraining(ctx, W, w, this.trainer);
    else drawClock(ctx, W, w, now);
    // A small banner replaces the relic line while it shows.
    const smallBanner = bannerOn && !C.big;
    drawRelic(ctx, W, H, w, now, this.teamColors, this.locate, smallBanner);
    if (smallBanner) C.drawBanner(ctx, W, now);
    this.mini.rect = null;
    if (this.minimap) {
      const opts = { split: this.split, zoomOut: this.zoomOut, mapIndex: this.mapIndex?.() ?? -1 };
      this.mini.draw(ctx, W, H, w, now, ui, { ...opts, portraits: this.portraits });
    }
    if (this.mini.rect) this.mini.drawStocks(ctx, w, this.split);
    if (C.cardOn(now)) C.drawCard(ctx, W, w, now);
    if (w.ffa) {
      this.drawFfa(ctx, W, H, w, ui, now);
      return;
    }
    const k = w.players.length >= 4 || this.split >= 3 ? 0.74 : w.players.length >= 3 ? 0.86 : 1;
    this.dense = k < 1;
    for (let t = 0; t < 2; t++) {
      if (k === 1) {
        this.drawTeam(ctx, W, H, w, ui, t, now);
        continue;
      }
      ctx.save();
      ctx.scale(k, k);
      this.drawTeam(ctx, W / k, H / k, w, ui, t, now);
      ctx.restore();
    }
  }

  /** Split dividers: exactly one device pixel wide, drawn in device space. */
  private drawDividers(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const m = ctx.getTransform();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = INK;
    const pw = Math.round(W * m.a);
    const ph = Math.round(H * m.d);
    ctx.fillRect(Math.floor(pw / 2), 0, 1, ph);
    if (this.split >= 3) ctx.fillRect(0, Math.floor(ph / 2), pw, 1);
    ctx.restore();
  }

  /** FFA: each local house gets a frame (its split view, or a screen quadrant); the rest become standings. */
  private drawFfa(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    w: World,
    ui: (MapperUi | null)[],
    now: number,
  ): void {
    const k = this.split >= 3 ? 0.74 : this.split === 2 ? 0.86 : 1;
    this.dense = k < 1;
    const Wk = W / k;
    const Hk = H / k;
    const locals = w.players.filter((p) => ui[p.player] && !p.commander);
    const mine = [...new Set(locals.map((p) => p.team))];
    const frames = new Map<number, Frame>();
    const quad = (j: number, n: number): Frame => {
      if (n <= 1) return { x: 0, y: 0, w: Wk, h: Hk, right: false };
      if (n === 2) return { x: j ? Wk / 2 : 0, y: 0, w: Wk / 2, h: Hk, right: j === 1 };
      return { x: j % 2 ? Wk / 2 : 0, y: j >= 2 ? Hk / 2 : 0, w: Wk / 2, h: Hk / 2, right: j % 2 === 1 };
    };
    if (!mine.length) frames.set(0, quad(0, 1));
    mine.forEach((t, j) => {
      const pl = locals.find((p) => p.team === t)!.player;
      const r = this.split >= 2 ? this.rectOf?.(pl) : null;
      const frame = r
        ? { x: r.x * Wk, y: r.y * Hk, w: r.w * Wk, h: r.h * Hk, right: r.x + r.w / 2 > 0.5 }
        : quad(j, mine.length);
      frames.set(t, frame);
    });
    ctx.save();
    if (k !== 1) ctx.scale(k, k);
    for (const [t, F] of frames) this.drawTeam(ctx, Wk, Hk, w, ui, t, now, F);
    const rest = w.teams.map((_, t) => t).filter((t) => !frames.has(t));
    if (rest.length) {
      const single = frames.size === 1 && this.split < 2;
      const x = single ? Wk - MARGIN_X - 74 : Wk / 2 - 37;
      const y = single ? MARGIN_Y + 2 : MARGIN_Y + 40;
      drawStandings(ctx, this.memo, this.teamColors, x, y, w, rest, single);
    }
    for (const [t, F] of frames) {
      if (!w.teams[t].out || !mine.includes(t)) continue;
      const msg = "YOUR KEEP FELL · SPECTATING";
      const s = 0.9;
      const x = Math.round(F.x + F.w / 2 - textWidth(msg, s) / 2);
      drawText(ctx, msg, x, Math.round(F.y + F.h * 0.8), Math.floor(now * 2) % 2 ? "#ffd0a0" : "#ffffff", s);
    }
    ctx.restore();
    this.callouts.drawFall(ctx, W, H, w, now);
  }

  // ── Team block ──

  /** Team t's whole HUD block, in its corner of the screen or of frame F (FFA). */
  private drawTeam(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    w: World,
    ui: (MapperUi | null)[],
    t: number,
    now: number,
    F: Frame | null = null,
  ): void {
    const right = F ? F.right : t === 1;
    const col = this.teamColors[t];
    const x0 = F
      ? right
        ? F.x + F.w - MARGIN_X - BLOCK_W
        : F.x + MARGIN_X
      : right
        ? W - MARGIN_X - BLOCK_W
        : MARGIN_X;
    const y00 = (F ? F.y : 0) + MARGIN_Y + 2;
    let y = drawTeamHead(ctx, this.memo, this.head, w, t, col, x0, y00, right, now);
    y += drawCarriers(ctx, w, t, x0, y, right, now);
    if (w.teams[t].out) return;

    // Player panels: every local hero (and, in split screen, every hero with a view); with no local player on
    // this team just its first hero. Commanders are only listed when local or viewed.
    const anyLocal = ui.some(Boolean);
    const viewed = (pl: number) => this.split >= 2 && !F && !!this.rectOf?.(pl);
    const teamHeroes = w.players.filter((p) => p.team === t && (!p.commander || !!ui[p.player] || viewed(p.player)));
    const shown = teamHeroes.filter((p, k) => !!ui[p.player] || viewed(p.player) || (!anyLocal && k === 0));
    const rectPx = (pl: number) => {
      const r = F ? null : this.rectOf?.(pl);
      return r ? { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H } : null;
    };
    for (const p of shown) {
      const e = w.getAny(p.heroId);
      if (!e?.hero) continue;
      const r = rectPx(p.player);
      const px0 = r ? (right ? r.x + r.w - MARGIN_X - BLOCK_W : r.x + MARGIN_X) : x0;
      // Views on the top row share the team head's line; lower views start at their own top.
      const py0 = r ? (r.y < 2 ? y + 2 : r.y + MARGIN_Y + 2) : y + 2;
      const local = !!ui[p.player];
      const tag = shown.length > 1 || teamHeroes.length > 1 ? playerLabel(p.player) : "";
      const h = drawPlayerPanel(ctx, this.memo, p.player, w, e, px0, py0, right, now, local, tag);
      this.panelAt[p.player] = { x: right ? px0 + BLOCK_W : px0, y: py0 + h, right };
      if (!r) y = py0 + h;
    }

    // Crosses sit in the bottom corner of the team's area (or of the acting player's split view).
    const crossOf = (pl: number | undefined): [number, number] => {
      if (F) return [right ? F.x + F.w - MARGIN_X - 62 : F.x + MARGIN_X + 62, F.y + F.h - 58];
      const r = pl === undefined ? null : rectPx(pl);
      if (!r) return [right ? W - MARGIN_X - 62 : MARGIN_X + 62, H - 58];
      return [right ? r.x + r.w - MARGIN_X - 62 : r.x + MARGIN_X + 62, r.y + r.h - 58];
    };
    const opener = w.players.find((p) => p.team === t && ui[p.player] && ui[p.player]!.buildMenu !== "closed");
    const firstLocal = w.players.find((p) => p.team === t && ui[p.player]);
    let [crossX, crossY] = crossOf(opener?.player ?? firstLocal?.player);
    // Other players' teams show nothing below the panels when someone local is playing.
    if (!firstLocal && anyLocal) return;
    this.callouts.drawNotice(ctx, t, W, crossX, crossY, right, F, now);

    // Aiming the keep cannon replaces everything else.
    const aimer = w.players.map((p) => w.getAny(p.heroId)).find((e) => e?.team === t && e.hero?.aim);
    if (aimer?.hero?.aim) {
      const left = Math.max(0, Math.ceil(aimer.hero.aim.until - w.time));
      const l1 = `AIM THE CANNON · ${left}`;
      const l2 = "A FIRE · B CANCEL";
      const blink = Math.floor(now * 4) % 2 ? "#ffd870" : "#ffffff";
      drawText(ctx, l1, Math.round(crossX - textWidth(l1, 0.85) / 2), crossY - 8, blink, 0.85);
      drawText(ctx, l2, Math.round(crossX - textWidth(l2, 0.72) / 2), crossY + 6, "#e8e0d0", 0.72);
      return;
    }
    for (const pl of w.players.filter((p) => p.team === t && (ui[p.player]?.morph ?? 0) > 0)) {
      const at = this.panelAt[pl.player];
      const pu = ui[pl.player]!;
      if (at) drawMorphRing(ctx, at, pu.morph, !!pu.morphBack, col);
    }
    for (const learner of w.players.filter(
      (p) => p.team === t && ui[p.player]?.learnReady && ui[p.player]!.buildMenu === "closed",
    )) {
      const at = this.panelAt[learner.player];
      if (at) drawLearnCards(ctx, W, at.x, at.y + 2, w, learner.heroId, at.right, now);
    }

    // An open build menu replaces the army HUD.
    const menuUi = opener ? ui[opener.player] : null;
    if (menuUi && opener) {
      const c = buildCross(w, t, opener.heroId, menuUi);
      if (c) drawCross(ctx, this.memo, `cross${this.crossN++}`, crossX, crossY, c, 1);
      return;
    }

    // Army: the orders panel, plus the order cross for whoever commands (the commander first in 2v2).
    const o = this.orders[t];
    const team = w.players.filter((p) => p.team === t).sort((a, b) => Number(b.commander) - Number(a.commander));
    const pickerP = team.find((p) => !!ui[p.player]);
    const picker = pickerP ? ui[pickerP.player] : null;
    if (pickerP) [crossX, crossY] = crossOf(pickerP.player);
    const group = picker?.group ?? "all";
    const env = {
      memo: this.memo,
      teamColors: this.teamColors,
      portraits: this.portraits,
      split: this.split,
      laneCount: this.laneCount,
    };
    drawOrders(ctx, env, W, H, w, t, right, now, o, picker ? group : null, F);
    const crossId = () => `cross${this.crossN++}`;
    if (!picker) {
      // Nobody local commands this team: flash its last order briefly.
      if (now < o.until) {
        const alpha = Math.min(1, (o.until - now) * 2.5);
        drawOrderCross(ctx, this.memo, crossId(), crossX, crossY, w, t, o.type, alpha, now, false);
      }
      return;
    }
    const recent = Math.max(picker.lastOrderAt, picker.groupAt);
    const fresh = now - recent < 1.6;
    if (this.dense && !fresh) return;
    const groupHint = now - picker.groupAt < 1.6;
    drawOrderCross(ctx, this.memo, crossId(), crossX, crossY, w, t, group, fresh ? 1 : 0.5, now, groupHint);
  }
}
