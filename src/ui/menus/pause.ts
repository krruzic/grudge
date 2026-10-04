// Pause menu: a match summary card (clock, map, every hero with HP / level / evolutions, team stats) and the
// option tags. In training the options are the trainer's (level up, reset cooldowns / meter, change champion).
// Quitting a real match asks for a second A. Input ownership (only the pauser drives it) is enforced by the
// caller (app/states.ts), which passes only that pad's nav and drops the mouse unless it belongs to it.
import type { World } from "../../sim/world";
import { learned } from "../../sim/talents";
import { drawPlain, textWidth } from "../font";
import { talentIcon } from "../hud/icons";
import type { Portraits } from "../portraits";
import { bottomPrompt, wrap } from "../prompts";
import {
  band,
  boardBg,
  boardTitle,
  card,
  inset,
  paintedText,
  shadowText,
  smoothImage,
  tag,
  waxSeal,
  windowCut,
  woodFloor,
} from "../uiPaint";
import { drawControlSheet } from "./controls";
import { BROWN, HOUSE, TEAM_CLOTH, TEAM_TEXT, type HitList, type Nav, type Pointer, type Sound } from "./common";

export type PauseResult = "resume" | "quit" | "level" | "cooldowns" | "meter" | "champion" | null;

const PAUSE_ITEMS = ["RESUME", "CONTROLS", "QUIT MATCH"];
const PAUSE_GLYPHS = ["dash", "pad", "quake"];
const TRAIN_ITEMS = ["RESUME", "LEVEL UP", "RESET COOLDOWNS", "RESET METER", "CHANGE CHAMPION", "QUIT TRAINING"];
const TRAIN_ACTIONS = ["resume", "level", "cooldowns", "meter", "champion", "quit"] as const;
const TRAIN_GLYPHS = ["dash", "rank", "repair", "size", "combo", "quake"];
const TRAIN_BLURB = [
  "BACK TO THE DUMMY.",
  "GAIN A LEVEL. PICK THE EVOLUTION ON THE ORDERS STICK AS USUAL.",
  "EVERY COOLDOWN READY AND THE SUPER METER FULL.",
  "ZERO THE DPS METER.",
  "BACK TO CHAMPION SELECT TO SWAP HEROES.",
  "LEAVE TRAINING AND RETURN TO THE MENU.",
];

/** What the pause menu reads from Menus. */
interface PauseHost {
  hits: HitList;
  training: boolean;
  currentMap: string;
  portraits: Portraits | null;
  heroNames: Record<string, string>;
}

export class PauseMenu {
  focus = 0;
  view: "menu" | "controls" = "menu";
  /** QUIT was pressed once; the next A quits. */
  private confirm = false;

  constructor(private host: PauseHost) {}

  open(): void {
    this.focus = 0;
    this.view = "menu";
    this.confirm = false;
  }

  private get items(): string[] {
    return this.host.training ? TRAIN_ITEMS : PAUSE_ITEMS;
  }

  update(nav: Nav, ptr: Pointer, sound: Sound): PauseResult {
    let act = "";
    if (ptr.moved || ptr.click) {
      const m = this.host.hits.at(ptr.x, ptr.y).match(/^prow:(\d+)$/);
      if (m && Number(m[1]) !== this.focus && ptr.moved) {
        this.focus = Number(m[1]);
        this.confirm = false;
        sound("move");
      }
      if (ptr.click && m) {
        this.focus = Number(m[1]);
        act = "a";
      }
    }
    if (this.view === "controls") {
      if (nav.b || nav.a || ptr.right || act) {
        this.view = "menu";
        sound("back");
      }
      return null;
    }
    if (nav.dy) {
      this.focus = (this.focus + nav.dy + this.items.length) % this.items.length;
      this.confirm = false;
      sound("move");
    }
    if (nav.b || ptr.right) {
      sound("back");
      return "resume";
    }
    const pressed = nav.a || act === "a";
    if (!pressed) return null;
    if (this.host.training) {
      const id = TRAIN_ACTIONS[this.focus];
      sound(id === "quit" ? "back" : "ok");
      return id;
    }
    if (this.focus === 0) {
      sound("ok");
      return "resume";
    }
    if (this.focus === 1) {
      sound("ok");
      this.view = "controls";
      return null;
    }
    if (this.confirm) {
      sound("back");
      return "quit";
    }
    this.confirm = true;
    sound("move");
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, w: World): void {
    this.host.hits.clear();
    boardBg(ctx, W, H);
    boardTitle(ctx, W, "!PAUSED", "PAUSED");
    woodFloor(ctx, H - 20, W, H);
    if (this.view === "controls") {
      drawControlSheet(ctx, 12, 26, W - 24, H - 52);
      bottomPrompt(ctx, W, H, [["B", "BACK"]]);
      return;
    }
    const pw = Math.min(270, Math.round(W * 0.64));
    const ph = H - 52;
    const px = 14;
    const py = 26;
    this.drawSummary(ctx, w, px, py, pw, ph);

    // Option tags on the right.
    const cx0 = px + pw + 18;
    const cw = W - cx0 - 14;
    const items = this.items;
    const n = items.length;
    const chh = n > 3 ? 22 : 34;
    const gap = n > 3 ? 5 : 10;
    const glyphs = this.host.training ? TRAIN_GLYPHS : PAUSE_GLYPHS;
    items.forEach((label, k) => {
      const sel = k === this.focus;
      const cy = 30 + k * (chh + gap);
      this.host.hits.add(`prow:${k}`, cx0 - 8, cy - 2, cw + 8, chh + 4);
      const text = !this.host.training && k === 2 && sel && this.confirm ? "SURE?" : label;
      tag(ctx, cx0, cy, cw, chh, sel, k, () => {
        waxSeal(ctx, 13, chh / 2 + 1, Math.min(9, chh / 2 - 2), sel ? "#a8141a" : "#6a3a2a", glyphs[k]);
        drawPlain(ctx, text, 27, chh / 2 - 3, sel ? "#8a1810" : BROWN, 0.72, true);
      });
    });
    const quitting = this.confirm && this.focus === 2;
    const blurb = this.host.training
      ? TRAIN_BLURB[this.focus]
      : this.focus === 0
        ? "BACK TO THE FIGHT."
        : this.focus === 1
          ? "EVERY BUTTON, FOR PADS AND FOR KEYBOARDS."
          : this.confirm
            ? "PRESS A AGAIN TO ABANDON THE MATCH."
            : "LEAVE THE MATCH AND RETURN TO THE MENU.";
    wrap(blurb, cw, 0.55).forEach((l, j) => {
      const y = 30 + n * (chh + gap) + 4 + j * 8;
      shadowText(ctx, l, cx0 + cw / 2 - textWidth(l, 0.55) / 2, y, quitting ? "#ffb090" : "#f0e4c8", 0.55);
    });
    bottomPrompt(ctx, W, H, [
      ["A", "CHOOSE"],
      ["B", "RESUME"],
    ]);
  }

  /** Left card: clock window, then both houses (or four in FFA) with heroes and stats. */
  private drawSummary(ctx: CanvasRenderingContext2D, w: World, px: number, py: number, pw: number, ph: number): void {
    const left = Math.max(0, w.matchLength - w.time);
    const sudden = w.match.phase === "sudden";
    const clock = sudden
      ? "SUDDEN DEATH"
      : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    card(ctx, px, py, pw, ph, -0.012, null, () => {
      const iw = pw - 20;
      const ih = 46;
      windowCut(ctx, 10, 10, iw, ih);
      paintedText(ctx, clock, 10 + iw / 2, 10 + ih / 2 - 10, sudden ? "#ff7050" : "#f0c030", 1.5);
      const mapName = this.host.currentMap.toUpperCase();
      if (mapName) shadowText(ctx, mapName, 10 + iw / 2 - textWidth(mapName, 0.5) / 2, 10 + ih - 10, "#f0e4c8", 0.5);
      const colW = (pw - 26) / 2;
      if (w.ffa) this.drawHouses(ctx, w, colW, ih, ph);
      else [0, 1].forEach((team) => this.drawTeam(ctx, w, team, 10 + team * (colW + 6), colW, ih, ph));
    });
  }

  /** Portrait, name, level, HP bar and up to 7 evolutions of one hero row (smaller in FFA). */
  private heroRow(
    ctx: CanvasRenderingContext2D,
    w: World,
    p: World["players"][number],
    x: number,
    y: number,
    colW: number,
    ffa: boolean,
  ): boolean {
    const e = w.getAny(p.heroId);
    if (!e?.hero) return false;
    const pic = ffa ? 18 : 20;
    const tx = ffa ? 23 : 25;
    inset(ctx, x + 1, y, pic, pic, "#3a2a1c");
    const icon = this.host.portraits?.icon(p.heroType);
    if (icon) smoothImage(ctx, icon, x + 1, y, pic, pic);
    const nm = `P${p.player + 1} ${(this.host.heroNames[p.heroType] ?? p.heroType).toUpperCase()}`;
    drawPlain(ctx, nm, x + tx, y, BROWN, ffa ? 0.52 : 0.55, true);
    const lv = `LV ${e.hero.level ?? 1}`;
    const ls = ffa ? 0.48 : 0.5;
    drawPlain(ctx, lv, x + colW - textWidth(lv, ls, true), y, "#8a1810", ls, true);
    const fr = e.alive ? Math.max(0, e.hp / e.maxHp) : 0;
    const bw = colW - (ffa ? 25 : 27);
    const by = ffa ? 8 : 9;
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(x + tx, y + by, bw + 2, 5);
    ctx.fillStyle = e.alive ? (fr > 0.35 ? "#4a9a30" : "#c83020") : "#8a7a60";
    ctx.fillRect(x + tx + 1, y + by + 1, Math.round(bw * fr), 3);
    const got = (["r", "b", "a", "z"] as const).flatMap((sl) => learned(w, e, sl));
    const step = ffa ? 8 : 9;
    got.slice(0, 7).forEach((tl, k) => talentIcon(ctx, tl.id, x + tx + k * step, y + (ffa ? 14 : 15), ffa ? 7 : 8));
    return true;
  }

  private drawTeam(
    ctx: CanvasRenderingContext2D,
    w: World,
    team: number,
    x: number,
    colW: number,
    ih: number,
    ph: number,
  ): void {
    let y = ih + 20;
    drawPlain(ctx, `${HOUSE[team]} HOUSE`, x, y, TEAM_TEXT[team], 0.68, true);
    waxSeal(ctx, x + colW - 7, y + 3, 6, TEAM_CLOTH[team], "castle");
    y += 12;
    for (const p of w.players.filter((q) => q.team === team)) if (this.heroRow(ctx, w, p, x, y, colW, false)) y += 27;
    const ts = w.teams[team];
    const core = w.core(team);
    const stats: [string, string][] = [
      ["KEEP", core ? `${Math.round((core.hp / core.maxHp) * 100)}%` : "-"],
      ["GOLD", String(Math.floor(ts.resource))],
      ["GRAIN", String(Math.floor(ts.grain))],
      ["SOLDIERS", String(ts.unitCount)],
      ["HERO KILLS", String(ts.heroKills)],
    ];
    const sy = ph - 10 - stats.length * 8;
    band(ctx, x, sy - 3, colW, 1, "#6a4424", 0.5);
    stats.forEach(([k, v], q) => {
      drawPlain(ctx, k, x, sy + q * 8, "#6a4424", 0.5, true);
      drawPlain(ctx, v, x + colW - textWidth(v, 0.55, true), sy + q * 8, BROWN, 0.55, true);
    });
  }

  /** FFA: four houses in a 2×2 grid, stats in two columns. */
  private drawHouses(ctx: CanvasRenderingContext2D, w: World, colW: number, ih: number, ph: number): void {
    const cellH = Math.floor((ph - ih - 20) / 2);
    w.teams.forEach((ts, team) => {
      const x = 10 + (team % 2) * (colW + 6);
      let y = ih + 18 + Math.floor(team / 2) * cellH;
      const out = !!ts.out;
      drawPlain(ctx, `${HOUSE[team] ?? ""} HOUSE`, x, y, TEAM_TEXT[team], 0.62, true);
      waxSeal(ctx, x + colW - 6, y + 3, 5, out ? "#6a6058" : TEAM_CLOTH[team], out ? "none" : "castle");
      if (out) {
        const f = "FALLEN";
        drawPlain(ctx, f, x + colW - 14 - textWidth(f, 0.5, true), y + 1, "#8a1810", 0.5, true);
      }
      y += 10;
      for (const p of w.players.filter((q) => q.team === team)) if (this.heroRow(ctx, w, p, x, y, colW, true)) y += 23;
      const core = w.core(team);
      const keep = core?.alive && !out ? `${Math.round((core.hp / core.maxHp) * 100)}%` : "-";
      const stats: [string, string][] = [
        ["KEEP", keep],
        ["GOLD", String(Math.floor(ts.resource))],
        ["GRAIN", String(Math.floor(ts.grain))],
        ["ARMY", String(ts.unitCount)],
        ["KILLS", String(ts.heroKills)],
      ];
      band(ctx, x, y - 1, colW, 1, "#6a4424", 0.5);
      const half = Math.floor((colW - 8) / 2);
      stats.forEach(([k, v], q) => {
        const sx = x + (q % 2) * (half + 8);
        const sy = y + 2 + Math.floor(q / 2) * 8;
        drawPlain(ctx, k, sx, sy, "#6a4424", 0.5, true);
        drawPlain(ctx, v, sx + half - textWidth(v, 0.55, true), sy, BROWN, 0.55, true);
      });
    });
  }
}
