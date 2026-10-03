import { drawPlain, drawText, onHiLayer, textWidth } from "./font";
import { artTitle, hiImage, boardBg, band, banner, beam, boardTitle, card, drawLogo, fieldShade, goldArrow, inset, nameImage, paintedText, pin, plank, shadowText, tag, texturedRect, waxSeal, windowCut, woodDisc, woodFloor } from "./n64ui";
import { padButton, PAD, talentIcon } from "./hud";
import { learned } from "../sim/talents";
import { buildCodex, type CodexArt, type CodexEntry } from "./codex";
import { prompt, promptWidth, wrap } from "./screens";
import type { Hit } from "./cursor";
import type { Portraits } from "./portraits";
import type { World } from "../sim/world";
import { DEFAULT_OPTIONS, DEFAULT_RULES, OPTION_ROWS, RULE_ROWS, cycle, winRate, type Row, type Save } from "../game/save";

export type Page = "main" | "training" | "players" | "network" | "browse" | "rules" | "options" | "records" | "controls" | "codex";
export interface RoomInfo {
  id: number;
  name: string;
  mode: string;
  map: string;
  humans: number;
  seats: number;
  phase: string;
  age: number;
}
export interface Nav {
  dx: number;
  dy: number;
  a: boolean;
  b: boolean;
  y: boolean;
}
export interface Pointer {
  x: number;
  y: number;
  moved: boolean;
  click: boolean;
  right: boolean;
}
export type MenuResult = "fight" | "training" | "title" | "options" | "host" | "join" | "browse" | "leave" | null;

const INK = "#0b0806";
const BROWN = "#3a2410";
const LIGHT = "#f8e8c0";
const TEAM_TEXT = ["#1c3aa8", "#a81c1c", "#8a6000", "#1a6a24"];
const HOUSE = ["BLUE", "RED", "YELLOW", "GREEN"];
const ITEMS = [
  { art: "m_fight", label: "FIGHT", blurb: "CHOOSE CHAMPIONS AND SETTLE A GRUDGE. ONE AGAINST ONE, TWO AGAINST TWO, OR FOUR HOUSES IN A FREE FOR ALL." },
  { art: "!TRAINING", label: "TRAINING", blurb: "PICK A CHAMPION AND BEAT ON A DUMMY THAT CAN'T DIE. A DPS METER COUNTS EVERY HIT. FREE GOLD, NO CLOCK." },
  { art: "!PLAYERS", label: "PLAYERS", blurb: "WHO IS PLAYING ON THIS MACHINE: CONTROLLERS, KEYBOARD AND MOUSE. FREE A SEAT OR TURN THE KEYBOARD OFF." },
  { art: "m_network", label: "VERSUS ONLINE", blurb: "PLAY OVER THE HOUSE NETWORK. ONE MACHINE HOSTS, FRIENDS OPEN ITS PAGE AND JOIN." },
  { art: "!CODEX", label: "CODEX", blurb: "EVERY CHAMPION, EVERY EVOLUTION, EVERY TRICK FOR YOUR ARMY AND BASE. ALSO SOME LIES ABOUT A TREE." },
  { art: "m_rules", label: "RULES", blurb: "SET THE TERMS OF COMBAT: TIME, GOLD, SOLDIERS AND MERCY." },
  { art: "m_records", label: "RECORDS", blurb: "EVERY VICTORY AND DEFEAT, WRITTEN DOWN BY NAME AND BY CHAMPION." },
  { art: "m_options", label: "OPTIONS", blurb: "MUSIC, SOUND, SCREEN SHAKE AND BUTTON HINTS." },
  { art: "m_controls", label: "CONTROLS", blurb: "HOW TO FIGHT, BUILD AND COMMAND YOUR ARMY." },
];
function upArrow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  goldArrow(ctx, 0, 0, 1, 5);
  ctx.restore();
}

const ROMAN_N = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const MAIN_GLYPHS = ["combo", "rank", "rally", "banner", "hex", "works", "castle", "repair", "pad"];
const PAGES: Page[] = ["main", "training", "players", "network", "codex", "rules", "records", "options", "controls"];
const TABS = ["CHAMPIONS", "NAMES", "CHRONICLE"];

function artWord(ctx: CanvasRenderingContext2D, key: string, fallback: string, cx: number, y: number, h: number, alpha = 1): number {
  const im = nameImage(key);
  ctx.globalAlpha = alpha;
  if (!im) {
    paintedText(ctx, fallback, cx, y + h / 2 - 6, "#f0c030", 1.1);
    ctx.globalAlpha = 1;
    return textWidth(fallback, 1.1, true);
  }
  const w = (im.width / im.height) * h;
  onHiLayer(ctx, (t) => {
    t.imageSmoothingEnabled = true;
    t.drawImage(im, cx - w / 2, y, w, h);
  });
  ctx.globalAlpha = 1;
  return w;
}

function num(ctx: CanvasRenderingContext2D, s: string | number, rx: number, y: number, color = BROWN, scale = 0.7): void {
  const t = String(s);
  drawPlain(ctx, t, rx - textWidth(t, scale, true), y, color, scale, true);
}

function dateOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const PAUSE_ITEMS = ["RESUME", "CONTROLS", "QUIT MATCH"];
const TRAIN_ITEMS = ["RESUME", "LEVEL UP", "RESET COOLDOWNS", "RESET METER", "CHANGE CHAMPION", "QUIT TRAINING"];
const TRAIN_BLURB = ["BACK TO THE DUMMY.", "GAIN A LEVEL. PICK THE EVOLUTION ON THE ORDERS STICK AS USUAL.", "EVERY COOLDOWN READY AND THE SUPER METER FULL.", "ZERO THE DPS METER.", "BACK TO CHAMPION SELECT TO SWAP HEROES.", "LEAVE TRAINING AND RETURN TO THE MENU."];
const TRAIN_GLYPHS = ["dash", "rank", "repair", "size", "combo", "quake"];
const TEAM_CLOTH = ["#2a4ab8", "#b02a1c", "#c89a14", "#2a8a3a"];

export class Menus {
  pauseFocus = 0;
  training = false;
  currentMap = "";
  pauseView: "menu" | "controls" = "menu";
  private pauseConfirm = false;

  openPause(): void {
    this.pauseFocus = 0;
    this.pauseView = "menu";
    this.pauseConfirm = false;
  }

  private get pauseItems(): string[] {
    return this.training ? TRAIN_ITEMS : PAUSE_ITEMS;
  }

  updatePause(nav: Nav, ptr: Pointer, sound: (k: "move" | "ok" | "back") => void): "resume" | "quit" | "level" | "cooldowns" | "meter" | "champion" | null {
    let act = "";
    if (ptr.moved || ptr.click) {
      const h = this.at(ptr.x, ptr.y);
      const m = h.match(/^prow:(\d+)$/);
      if (m && Number(m[1]) !== this.pauseFocus && ptr.moved) {
        this.pauseFocus = Number(m[1]);
        this.pauseConfirm = false;
        sound("move");
      }
      if (ptr.click && m) {
        this.pauseFocus = Number(m[1]);
        act = "a";
      }
    }
    if (this.pauseView === "controls") {
      if (nav.b || nav.a || ptr.right || act) {
        this.pauseView = "menu";
        sound("back");
      }
      return null;
    }
    if (nav.dy) {
      this.pauseFocus = (this.pauseFocus + nav.dy + this.pauseItems.length) % this.pauseItems.length;
      this.pauseConfirm = false;
      sound("move");
    }
    if (nav.b || ptr.right) {
      sound("back");
      return "resume";
    }
    if ((nav.a || act === "a") && this.training) {
      const id = (["resume", "level", "cooldowns", "meter", "champion", "quit"] as const)[this.pauseFocus];
      sound(id === "quit" ? "back" : "ok");
      return id;
    }
    if (nav.a || act === "a") {
      if (this.pauseFocus === 0) {
        sound("ok");
        return "resume";
      }
      if (this.pauseFocus === 1) {
        sound("ok");
        this.pauseView = "controls";
        return null;
      }
      if (this.pauseConfirm) {
        sound("back");
        return "quit";
      }
      this.pauseConfirm = true;
      sound("move");
    }
    return null;
  }

  drawPause(ctx: CanvasRenderingContext2D, W: number, H: number, now: number, w: World): void {
    this.hits = [];
    boardBg(ctx, W, H);
    boardTitle(ctx, W, "!PAUSED", "PAUSED");
    woodFloor(ctx, H - 20, W, H);
    if (this.pauseView === "controls") {
      drawControlSheet(ctx, 12, 26, W - 24, H - 52);
      const p: [string, string][] = [["B", "BACK"]];
      prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
      return;
    }
    const pw = Math.min(270, Math.round(W * 0.64));
    const ph = H - 52;
    const px = 14;
    const py = 26;
    const m = w.data.match;
    const left = Math.max(0, m.matchSeconds - w.time);
    const sudden = w.match.phase === "sudden";
    const clock = sudden ? "SUDDEN DEATH" : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
    card(ctx, px, py, pw, ph, -0.012, null, () => {
      const iw = pw - 20;
      const ih = 46;
      windowCut(ctx, 10, 10, iw, ih);
      paintedText(ctx, clock, 10 + iw / 2, 10 + ih / 2 - 10, sudden ? "#ff7050" : "#f0c030", 1.5);
      const mapName = this.currentMap.toUpperCase();
      if (mapName) shadowText(ctx, mapName, 10 + iw / 2 - textWidth(mapName, 0.5) / 2, 10 + ih - 10, "#f0e4c8", 0.5);
      const colW = (pw - 26) / 2;
      if (w.ffa) {
        this.drawPauseHouses(ctx, w, colW, ih, ph);
        return;
      }
      [0, 1].forEach((team) => {
        const x = 10 + team * (colW + 6);
        let y = ih + 20;
        const name = `${HOUSE[team]} HOUSE`;
        drawPlain(ctx, name, x, y, TEAM_TEXT[team], 0.68, true);
        waxSeal(ctx, x + colW - 7, y + 3, 6, TEAM_CLOTH[team], "castle");
        y += 12;
        for (const p of w.players.filter((q) => q.team === team)) {
          const e = w.getAny(p.heroId);
          if (!e?.hero) continue;
          inset(ctx, x + 1, y, 20, 20, "#3a2a1c");
          const icon = this.portraits?.icon(p.heroType);
          if (icon) hiImage(ctx, icon, x + 1, y, 20, 20);
          const nm = `P${p.player + 1} ${(this.heroNames[p.heroType] ?? p.heroType).toUpperCase()}`;
          drawPlain(ctx, nm, x + 25, y, BROWN, 0.55, true);
          const lv = `LV ${e.hero.level ?? 1}`;
          drawPlain(ctx, lv, x + colW - textWidth(lv, 0.5, true), y, "#8a1810", 0.5, true);
          const fr = e.alive ? Math.max(0, e.hp / e.maxHp) : 0;
          const bw = colW - 27;
          ctx.fillStyle = "#3a2410";
          ctx.fillRect(x + 25, y + 9, bw + 2, 5);
          ctx.fillStyle = e.alive ? (fr > 0.35 ? "#4a9a30" : "#c83020") : "#8a7a60";
          ctx.fillRect(x + 26, y + 10, Math.round(bw * fr), 3);
          const got = (["r", "b", "a", "z"] as const).flatMap((sl) => learned(w, e, sl));
          got.slice(0, 7).forEach((tl, k) => talentIcon(ctx, tl.id, x + 25 + k * 9, y + 15, 8));
          y += 27;
        }
        const ts = w.teams[team];
        const core = w.core(team);
        const stats: [string, string][] = [["KEEP", core ? `${Math.round((core.hp / core.maxHp) * 100)}%` : "-"], ["GOLD", String(Math.floor(ts.resource))], ["GRAIN", String(Math.floor(ts.grain))], ["SOLDIERS", String(ts.unitCount)], ["HERO KILLS", String(ts.heroKills)]];
        const sy = ph - 10 - stats.length * 8;
        band(ctx, x, sy - 3, colW, 1, "#6a4424", 0.5);
        stats.forEach(([k, v], q) => {
          drawPlain(ctx, k, x, sy + q * 8, "#6a4424", 0.5, true);
          drawPlain(ctx, v, x + colW - textWidth(v, 0.55, true), sy + q * 8, BROWN, 0.55, true);
        });
      });
    });
    const cx0 = px + pw + 18;
    const cw = W - cx0 - 14;
    const items = this.pauseItems;
    const n = items.length;
    const chh = n > 3 ? 22 : 34;
    const gap = n > 3 ? 5 : 10;
    const glyphs = this.training ? TRAIN_GLYPHS : ["dash", "pad", "quake"];
    items.forEach((label, k) => {
      const sel = k === this.pauseFocus;
      const cy = 30 + k * (chh + gap);
      this.hit(`prow:${k}`, cx0 - 8, cy - 2, cw + 8, chh + 4);
      const text = !this.training && k === 2 && sel && this.pauseConfirm ? "SURE?" : label;
      tag(ctx, cx0, cy, cw, chh, sel, k, () => {
        waxSeal(ctx, 13, chh / 2 + 1, Math.min(9, chh / 2 - 2), sel ? "#a8141a" : "#6a3a2a", glyphs[k]);
        drawPlain(ctx, text, 27, chh / 2 - 3, sel ? "#8a1810" : BROWN, 0.72, true);
      });
    });
    const blurb = this.training ? TRAIN_BLURB[this.pauseFocus] : this.pauseFocus === 0 ? "BACK TO THE FIGHT." : this.pauseFocus === 1 ? "EVERY BUTTON, FOR PADS AND FOR KEYBOARDS." : this.pauseConfirm ? "PRESS A AGAIN TO ABANDON THE MATCH." : "LEAVE THE MATCH AND RETURN TO THE MENU.";
    wrap(blurb, cw, 0.55).forEach((l, j) => shadowText(ctx, l, cx0 + cw / 2 - textWidth(l, 0.55) / 2, 30 + n * (chh + gap) + 4 + j * 8, this.pauseConfirm && this.pauseFocus === 2 ? "#ffb090" : "#f0e4c8", 0.55));
    void now;
    const p: [string, string][] = [["A", "CHOOSE"], ["B", "RESUME"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }
  private drawPauseHouses(ctx: CanvasRenderingContext2D, w: World, colW: number, ih: number, ph: number): void {
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
      for (const p of w.players.filter((q) => q.team === team)) {
        const e = w.getAny(p.heroId);
        if (!e?.hero) continue;
        inset(ctx, x + 1, y, 18, 18, "#3a2a1c");
        const icon = this.portraits?.icon(p.heroType);
        if (icon) hiImage(ctx, icon, x + 1, y, 18, 18);
        const nm = `P${p.player + 1} ${(this.heroNames[p.heroType] ?? p.heroType).toUpperCase()}`;
        drawPlain(ctx, nm, x + 23, y, BROWN, 0.52, true);
        const lv = `LV ${e.hero.level ?? 1}`;
        drawPlain(ctx, lv, x + colW - textWidth(lv, 0.48, true), y, "#8a1810", 0.48, true);
        const fr = e.alive ? Math.max(0, e.hp / e.maxHp) : 0;
        const bw = colW - 25;
        ctx.fillStyle = "#3a2410";
        ctx.fillRect(x + 23, y + 8, bw + 2, 5);
        ctx.fillStyle = e.alive ? (fr > 0.35 ? "#4a9a30" : "#c83020") : "#8a7a60";
        ctx.fillRect(x + 24, y + 9, Math.round(bw * fr), 3);
        const got = (["r", "b", "a", "z"] as const).flatMap((sl) => learned(w, e, sl));
        got.slice(0, 7).forEach((tl, k) => talentIcon(ctx, tl.id, x + 23 + k * 8, y + 14, 7));
        y += 23;
      }
      const core = w.core(team);
      const keep = core?.alive && !out ? `${Math.round((core.hp / core.maxHp) * 100)}%` : "-";
      const stats: [string, string][] = [["KEEP", keep], ["GOLD", String(Math.floor(ts.resource))], ["GRAIN", String(Math.floor(ts.grain))], ["ARMY", String(ts.unitCount)], ["KILLS", String(ts.heroKills)]];
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

  page: Page = "main";
  focus = 0;
  tab = 0;
  private scrollTop = 0;
  private confirm = "";
  private hits: Hit[] = [];
  private hover = "";
  portraits: Portraits | null = null;
  heroNames: Record<string, string> = {};
  roster: string[] = [];
  mapNames: Record<string, string> = {};

  constructor(private save: Save) {}

  open(page: Page): void {
    this.page = page;
    this.focus = 0;
    this.scrollTop = 0;
    this.confirm = "";
  }

  private hit(id: string, x: number, y: number, w: number, h: number): void {
    this.hits.push({ id, x, y, w, h });
  }

  private at(x: number, y: number): string {
    for (let k = this.hits.length - 1; k >= 0; k--) {
      const h = this.hits[k];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
    }
    return "";
  }

  private rowCount(): number {
    if (this.page === "main") return ITEMS.length;
    if (this.page === "players") return 6;
    if (this.page === "network") return 2;
    if (this.page === "browse") return this.rooms.length + 1;
    if (this.page === "rules") return RULE_ROWS.length + 1;
    if (this.page === "options") return OPTION_ROWS.length + 2;
    if (this.page === "codex") return this.codexEntries().length;
    if (this.page === "records") return this.tab === 0 ? this.roster.length : this.tab === 1 ? this.save.tagNames().length : this.save.data.log.length;
    return 0;
  }

  update(nav: Nav, ptr: Pointer, sound: (k: "move" | "ok" | "back") => void): MenuResult {
    const n = this.rowCount();
    let act = "";
    let dx = nav.dx;
    if (ptr.moved || ptr.click) {
      this.hover = this.at(ptr.x, ptr.y);
      const m = this.hover.match(/^(row|dec|inc):(\d+)$/);
      if (m && Number(m[2]) !== this.focus && ptr.moved) {
        this.focus = Number(m[2]);
        this.confirm = "";
        sound("move");
      }
      if (ptr.click && this.hover) act = this.hover;
    }
    if (nav.dy && n && this.page === "players") {
      this.focus = nav.dy > 0 ? (this.focus < 4 ? 4 : this.focus === 4 ? 5 : 0) : this.focus < 4 ? 5 : this.focus === 5 ? 4 : 0;
      sound("move");
    } else if (nav.dy && n && this.page !== "network") {
      this.focus = (this.focus + nav.dy + n) % n;
      this.confirm = "";
      sound("move");
    }
    if (act.startsWith("dec:") || act.startsWith("inc:")) {
      this.focus = Number(act.slice(4));
      dx = act.startsWith("dec") ? -1 : 1;
      act = "";
    } else if (act.startsWith("tab:")) {
      this.tab = Number(act.slice(4));
      this.focus = 0;
      this.scrollTop = 0;
      sound("move");
      act = "";
    } else if (act.startsWith("row:")) {
      this.focus = Number(act.slice(4));
      act = this.page === "codex" ? "" : "a";
    }
    if (nav.a) act = "a";
    if (nav.b || ptr.right || act === "back") {
      sound("back");
      if ((this.page === "network" || this.page === "browse") && this.netBusy) {
        this.netBusy = false;
        return "leave";
      }
      if (this.page === "main") return "title";
      if (this.page === "browse") {
        this.page = "network";
        this.focus = 1;
        return null;
      }
      const from = this.page;
      this.page = "main";
      this.focus = PAGES.indexOf(from);
      return from === "options" ? "options" : null;
    }

    if (this.page === "main") {
      if (act === "a") {
        sound("ok");
        if (this.focus === 0) return "fight";
        if (this.focus === 1) return "training";
        this.page = PAGES[this.focus];
        this.focus = 0;
        this.tab = 0;
        this.scrollTop = 0;
        this.confirm = "";
      }
      return null;
    }
    if (this.page === "network") {
      if (dx && !this.netBusy) {
        const f = Math.max(0, Math.min(1, this.focus + dx));
        if (f !== this.focus) {
          this.focus = f;
          sound("move");
        }
      }
      if (act === "a" && !this.netBusy) {
        sound("ok");
        if (this.focus === 0) return "host";
        this.page = "browse";
        this.focus = 0;
        this.scrollTop = 0;
        this.roomsAt = -99;
        return "browse";
      }
      return null;
    }
    if (this.page === "players") {
      if (dx && this.focus < 4) {
        const f = Math.max(0, Math.min(3, this.focus + dx));
        if (f !== this.focus) {
          this.focus = f;
          sound("move");
        }
      }
      if (act === "a") {
        if (this.focus < 4) {
          const d = this.devices()[this.focus];
          if (d) {
            this.releaseSeat(this.focus);
            sound("back");
          }
          return null;
        }
        if (this.focus === 4) {
          this.save.data.options.kbm = this.save.data.options.kbm ? 0 : 1;
          this.save.write();
          sound("move");
          return "options";
        }
        if (this.focus === 5) {
          this.requestDevice();
          sound("ok");
        }
      }
      return null;
    }
    if (this.page === "browse") {
      if (act === "a" && !this.netBusy) {
        const r = this.focus === 0 ? null : this.rooms[this.focus - 1];
        if (r && (r.phase !== "lobby" || r.humans >= r.seats)) {
          sound("back");
          return null;
        }
        sound("ok");
        this.joinRoom = r ? r.id : null;
        return "join";
      }
      return null;
    }
    if (this.page === "rules" || this.page === "options") {
      const rows = (this.page === "rules" ? RULE_ROWS : OPTION_ROWS) as Row<object>[];
      const obj = (this.page === "rules" ? this.save.data.rules : this.save.data.options) as object;
      if (this.focus < rows.length && (dx || act === "a")) {
        cycle(obj, rows[this.focus], dx || 1);
        this.save.write();
        sound("move");
        return this.page === "options" ? "options" : null;
      }
      if (act === "a" && this.focus === rows.length) {
        if (this.page === "rules") Object.assign(this.save.data.rules, DEFAULT_RULES);
        else Object.assign(this.save.data.options, DEFAULT_OPTIONS);
        this.save.write();
        sound("ok");
        return this.page === "options" ? "options" : null;
      }
      if (act === "a" && this.page === "options" && this.focus === rows.length + 1) {
        if (this.confirm === "erase") {
          this.save.clearRecords();
          this.confirm = "erased";
          sound("back");
        } else {
          this.confirm = "erase";
          sound("move");
        }
      }
      return null;
    }
    if (this.page === "codex") {
      const pages = this.codexEntries()[this.focus]?.pages.length ?? 1;
      if (this.focus !== this.codexFocus) {
        this.codexFocus = this.focus;
        this.codexPage = 0;
      }
      let flip = dx || (act === "a" ? 1 : 0);
      if (act.startsWith("cpg:")) flip = Number(act.slice(4));
      if (flip) {
        const np = Math.max(0, Math.min(pages - 1, this.codexPage + flip));
        if (np !== this.codexPage) {
          this.codexPage = np;
          sound("move");
        }
      }
      return null;
    }
    if (this.page === "records") {
      if (dx) {
        this.tab = (this.tab + dx + TABS.length) % TABS.length;
        this.focus = 0;
        this.scrollTop = 0;
        this.confirm = "";
        sound("move");
      }
      if (this.tab === 1 && nav.y) {
        const name = this.save.tagIds()[this.focus];
        if (name && this.confirm === `strike:${name}`) {
          this.save.removeTag(name);
          this.confirm = "";
          this.focus = Math.max(0, this.focus - 1);
          sound("back");
        } else if (name) {
          this.confirm = `strike:${name}`;
          sound("move");
        }
      }
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    this.hits = [];
    this.demoRect = null;
    if (this.page === "main") this.drawMain(ctx, W, H, now);
    else {
      boardBg(ctx, W, H);
      woodFloor(ctx, H - 20, W, H);
      beam(ctx, 4, 2, W - 8, 17);
      if (this.page === "players") this.drawPlayers(ctx, W, H, now);
      else if (this.page === "network") this.drawNetwork(ctx, W, H, now);
      else if (this.page === "browse") this.drawBrowse(ctx, W, H, now);
      else if (this.page === "rules") this.drawRows(ctx, W, H, "t_rules", "RULES OF COMBAT", RULE_ROWS as Row<object>[], this.save.data.rules, ["RESTORE DEFAULTS"]);
      else if (this.page === "options") this.drawRows(ctx, W, H, "m_options", "OPTIONS", OPTION_ROWS as Row<object>[], this.save.data.options, ["RESTORE DEFAULTS", "ERASE ALL RECORDS"]);
      else if (this.page === "records") this.drawRecords(ctx, W, H);
      else if (this.page === "codex") this.drawCodex(ctx, W, H);
      else this.drawControls(ctx, W, H);
    }
  }

  private drawMain(ctx: CanvasRenderingContext2D, W: number, H: number, _now: number): void {
    boardBg(ctx, W, H);
    woodFloor(ctx, H - 20, W, H);
    const it = ITEMS[this.focus];
    const pw = Math.min(250, Math.round(W * 0.6));
    const ph = H - 34;
    const px = 16;
    const py = 8;
    card(ctx, px, py, pw, ph, -0.02, null, () => {
      const iw = pw - 24;
      const ih = Math.round(iw * 0.5);
      windowCut(ctx, 12, 12, iw, ih);
      drawLogo(ctx, 12 + 56, 12 + ih - 40, 46);
      const nm = nameImage(it.art);
      if (nm) {
        const h = 16;
        const w = (nm.width / nm.height) * h;
        onHiLayer(ctx, (t) => {
          t.imageSmoothingEnabled = true;
          t.drawImage(nm, 14, ih + 20, w, h);
        });
      } else drawPlain(ctx, it.label, 14, ih + 20, BROWN, 1.3, true);
      wrap(it.blurb, pw - 70, 0.6).slice(0, 3).forEach((l, j) => drawPlain(ctx, l, 14, ih + 42 + j * 8, "#4a3018", 0.6));
      if (this.focus === 0) {
        const r = this.save.data.rules;
        const t = `${r.minutes} MIN  ·  ${r.popCap} SOLDIERS  ·  GOLD X ${r.goldRate}${r.mercy ? "" : "  ·  NO MERCY"}`;
        drawPlain(ctx, t, 14, ph - 12, "#8a1810", 0.55);
      } else drawPlain(ctx, `BUILD ${__BUILD__}`, 14, ph - 12, "#8a6a44", 0.5);
      waxSeal(ctx, pw - 22, ih + 40, 15, "#a8141a", MAIN_GLYPHS[this.focus]);
    });
    const cx0 = px + pw + 18;
    const cw = W - cx0 - 14;
    const n = ITEMS.length;
    const gap = 5;
    const chh = Math.floor((H - 30 - (n - 1) * gap) / n);
    ITEMS.forEach((item, k) => {
      const sel = k === this.focus;
      const cy = 6 + k * (chh + gap);
      this.hit(`row:${k}`, cx0 - 8, cy - 2, cw + 8, chh + 4);
      tag(ctx, cx0, cy, cw, chh, sel, k, () => {
        waxSeal(ctx, 11, chh / 2 + 1, Math.min(8, chh / 2 - 2), sel ? "#a8141a" : "#6a3a2a", MAIN_GLYPHS[k]);
        drawPlain(ctx, item.label, 24, chh / 2 - 3, sel ? "#8a1810" : BROWN, 0.72, true);
      });
    });
    const p: [string, string][] = [["A", "SELECT"], ["B", "BACK"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }

  devices: () => (string | null)[] = () => [];
  releaseSeat: (i: number) => void = () => {};
  requestDevice: () => void = () => {};
  rooms: RoomInfo[] = [];
  roomsAt = -99;
  roomsError = "";
  joinRoom: number | null = null;
  netStatus = "";
  netBusy = false;
  netAddrs: string[] = [];

  private drawNetwork(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    boardTitle(ctx, W, "m_network", "VERSUS ONLINE");
    const opts: [string, string, string, string, string][] = [
      ["t_host", "HOST A BATTLE", "castle", "THIS MACHINE RUNS THE MATCH. FRIENDS JOIN FROM THEIR OWN SCREENS.", "#a8141a"],
      ["t_join", "JOIN A BATTLE", "banner", "SEE EVERY BATTLE ON THIS SERVER AND TAKE A SEAT. YOU SEE THE HOST'S RULES BEFORE THE FIGHT.", "#1a3aa8"],
    ];
    const lines = [this.netStatus, ...this.netAddrs.map((a) => `FRIENDS OPEN  http://${a}`)].filter(Boolean);
    const cw = 118;
    const ch = lines.length ? 136 : 160;
    const gap = 34;
    const x0 = Math.round((W - cw * 2 - gap) / 2);
    const cy = 28;
    opts.forEach(([art, label, glyph, blurb, suit], k) => {
      const hot = k === this.focus;
      const x = x0 + k * (cw + gap) + (hot ? (k ? -4 : 4) : 0);
      const y = cy - (hot ? 4 : 0);
      this.hit(`row:${k}`, x, y, cw, ch);
      card(ctx, x, y, cw, ch, hot ? 0 : k ? 0.06 : -0.06, hot ? "#c81818" : "#8a8a90", () => {
        for (const [ox, oy, flip] of [[9, 10, false], [cw - 9, ch - 10, true]] as const) {
          ctx.save();
          ctx.translate(ox, oy);
          if (flip) ctx.rotate(Math.PI);
          drawPlain(ctx, "A", -textWidth("A", 1.1, true) / 2, -6, suit, 1.1, true);
          waxSeal(ctx, 0, 14, 5, suit, glyph);
          ctx.restore();
        }
        inset(ctx, 18, 22, cw - 36, 52, "#3a2a1c");
        texturedRect(ctx, "cloth", 18, 22, cw - 36, 52, suit, 0, 0.7);
        band(ctx, 18, 22, cw - 36, 52, "#000000", hot ? 0.1 : 0.35);
        waxSeal(ctx, cw / 2, 48, 19, hot ? "#c8a020" : "#8a7a40", glyph);
        const nm = nameImage(art);
        if (nm) {
          const h = hot ? 13 : 11;
          const w = Math.min(cw - 16, (nm.width / nm.height) * h);
          const hh = (w / nm.width) * nm.height;
          onHiLayer(ctx, (t) => {
            t.imageSmoothingEnabled = true;
            t.globalAlpha = hot ? 1 : 0.75;
            t.drawImage(nm, cw / 2 - w / 2, 84, w, hh);
          });
        } else drawPlain(ctx, label, cw / 2 - textWidth(label, 0.8, true) / 2, 84, BROWN, 0.8, true);
        wrap(blurb, cw - 20, 0.5).slice(0, 4).forEach((l, j) => drawPlain(ctx, l, cw / 2 - textWidth(l, 0.5) / 2, 102 + j * 8, hot ? "#4a3018" : "#7a5a38", 0.5));
      });
    });
    if (lines.length) {
      const pw = cw * 2 + gap;
      const sy = cy + ch + 8;
      const sh = 8 + lines.length * 9;
      card(ctx, x0, sy, pw, sh, 0.008, "#8a8a90", () => {
        lines.forEach((l, j) => drawPlain(ctx, l, pw / 2 - textWidth(l, 0.58) / 2, 5 + j * 9, j === 0 && this.netBusy && Math.floor(now * 2) % 2 ? "#8a1810" : BROWN, 0.58));
      });
    }
    const p: [string, string][] = this.netBusy ? [["B", "CANCEL"]] : [["A", "SELECT"], ["B", "BACK"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }

  private drawPlayers(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    boardTitle(ctx, W, "!PLAYERS", "PLAYERS");
    const devs = this.devices();
    const gap = 10;
    const cw = Math.min(90, Math.floor((W - 30 - gap * 3) / 4));
    const x0 = Math.round((W - (cw * 4 + gap * 3)) / 2);
    const y0 = 28;
    const ch = 118;
    const SEAT = ["#2a4ab8", "#b02a1c", "#2a7ab8", "#c86a1c"];
    const ROMAN = ["I", "II", "III", "IV"];
    for (let i = 0; i < 4; i++) {
      const sel = this.focus === i;
      const d = devs[i];
      const x = x0 + i * (cw + gap);
      const y = y0 - (sel ? 4 : 0);
      this.hit(`row:${i}`, x, y, cw, ch);
      card(ctx, x, y, cw, ch, sel ? 0 : (i % 2 ? 0.03 : -0.03), sel ? "#c81818" : d ? SEAT[i] : "#8a8a90", () => {
        const t = `SEAT ${ROMAN[i]}`;
        drawPlain(ctx, t, cw / 2 - textWidth(t, 0.62, true) / 2, 9, "#8a5a2a", 0.62, true);
        const iw = cw - 14;
        const ih = 52;
        inset(ctx, 7, 20, iw, ih, d ? SEAT[i] : "#3a2a1c");
        texturedRect(ctx, "cloth", 7, 20, iw, ih, d ? SEAT[i] : "#4a3a2c", 0, 0.7);
        band(ctx, 7, 20, iw, ih, "#000000", d ? 0.15 : 0.45);
        waxSeal(ctx, cw / 2, 20 + ih / 2, 16, d ? "#c8a020" : "#5a4a3a", d ? (d.includes("KEYBOARD") ? "pad" : "combo") : "none");
        paintedText(ctx, `P${i + 1}`, cw / 2, 20 + ih / 2 - 7, d ? "#fff4c8" : "#a89878", 1.0);
        const lines = d ? wrap(d, cw - 12, 0.5).slice(0, 3) : ["EMPTY SEAT", "PRESS ANY BUTTON", "TO JOIN"];
        lines.forEach((l, j) => drawPlain(ctx, l, cw / 2 - textWidth(l, 0.5) / 2, 80 + j * 8, d ? BROWN : "#8a6a44", 0.5));
        if (d) {
          const f = "A: FREE SEAT";
          drawPlain(ctx, f, cw / 2 - textWidth(f, 0.48) / 2, ch - 11, sel ? "#8a1810" : "#8a6a44", 0.48);
        }
      });
      if (sel) upArrow(ctx, x + cw / 2, y + ch + 8);
    }
    const kbmOn = !!this.save.data.options.kbm;
    const rows: [string, string, string][] = [["KEYBOARD + MOUSE", kbmOn ? "ON" : "OFF", "pad"], ["FIND GAMECUBE / PRO PAD", "SEARCH", "rally"]];
    const tw = Math.floor((cw * 4 + gap * 3 - gap) / 2);
    rows.forEach(([l, v, g], k) => {
      const sel = this.focus === 4 + k;
      const x = x0 + k * (tw + gap);
      const y = y0 + ch + 14 - (sel ? 2 : 0);
      this.hit(`row:${4 + k}`, x, y, tw, 24);
      card(ctx, x, y, tw, 24, sel ? 0 : (k ? 0.015 : -0.015), sel ? "#c81818" : "#8a8a90", () => {
        waxSeal(ctx, 12, 13, 7, sel ? "#a8141a" : "#6a3a2a", g);
        drawPlain(ctx, l, 24, 9, sel ? "#8a1810" : BROWN, 0.6, true);
        drawPlain(ctx, v, tw - 8 - textWidth(v, 0.66, true), 9, v === "OFF" ? "#a01810" : "#2a6a18", 0.66, true);
      });
    });
    const hint = "PLAYERS HERE PLAY FROM THIS MACHINE · ONLINE, EVERY ONE OF THEM TAKES A SEAT";
    shadowText(ctx, hint, W / 2 - textWidth(hint, 0.5) / 2, H - 31, "#f0e4c8", 0.5);
    void now;
    const p: [string, string][] = [["A", this.focus < 4 ? "FREE SEAT" : "CHANGE"], ["B", "BACK"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }

  private drawBrowse(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    boardTitle(ctx, W, "!BATTLES ON THIS SERVER", "BATTLES ON THIS SERVER");
    const qw = 104;
    const qh = H - 58;
    const qx = 14;
    const qy = 28;
    const qsel = this.focus === 0;
    this.hit("row:0", qx, qy, qw, qh);
    card(ctx, qx + (qsel ? 3 : 0), qy - (qsel ? 2 : 0), qw, qh, qsel ? 0 : -0.025, qsel ? "#c81818" : "#8a8a90", () => {
      inset(ctx, 8, 16, qw - 16, 66, "#3a2a1c");
      texturedRect(ctx, "cloth", 8, 16, qw - 16, 66, "#a8141a", 0, 0.7);
      band(ctx, 8, 16, qw - 16, 66, "#000000", qsel ? 0.1 : 0.35);
      waxSeal(ctx, qw / 2, 49, 20, qsel ? "#c8a020" : "#8a7a40", "dash");
      const t = "QUICK JOIN";
      drawPlain(ctx, t, qw / 2 - textWidth(t, 0.95, true) / 2, 92, qsel ? "#8a1810" : BROWN, 0.95, true);
      wrap("TAKE THE FIRST OPEN SEAT ON THE SERVER.", qw - 16, 0.52).forEach((l, j) => drawPlain(ctx, l, qw / 2 - textWidth(l, 0.52) / 2, 108 + j * 8, "#4a3018", 0.52));
      const st = this.netBusy ? this.netStatus : `${this.rooms.length} BATTLE${this.rooms.length === 1 ? "" : "S"} POSTED`;
      wrap(st, qw - 14, 0.48).slice(0, 2).forEach((l, j) => drawPlain(ctx, l, qw / 2 - textWidth(l, 0.48) / 2, qh - 22 + j * 8, this.netBusy && Math.floor(now * 2) % 2 ? "#8a1810" : "#8a5a2a", 0.48));
    });
    const gx = qx + qw + 16;
    const gw = W - gx - 12;
    const cols = 2;
    const nw = Math.floor((gw - 10) / cols);
    const nh = 42;
    const rowsVis = Math.floor((H - 58) / (nh + 8));
    const vis = rowsVis * cols;
    const n = this.rooms.length;
    const fr = this.focus - 1;
    if (fr >= 0) {
      if (fr < this.scrollTop) this.scrollTop = fr - (fr % cols);
      if (fr >= this.scrollTop + vis) this.scrollTop = fr - (fr % cols) - (rowsVis - 1) * cols;
    }
    if (!n) {
      card(ctx, gx + gw / 2 - 90, 70, 180, 50, 0.02, "#8a8a90", () => {
        const a = this.roomsError || "NO BATTLES POSTED YET";
        drawPlain(ctx, a, 90 - textWidth(a, 0.75, true) / 2, 14, "#6a4424", 0.75, true);
        const b = "GO BACK AND HOST ONE";
        drawPlain(ctx, b, 90 - textWidth(b, 0.55) / 2, 30, "#8a5a2a", 0.55);
      });
    }
    for (let k = this.scrollTop; k < Math.min(n, this.scrollTop + vis); k++) {
      const r = this.rooms[k];
      const slot = k - this.scrollTop;
      const sel = this.focus === k + 1;
      const x = gx + (slot % cols) * (nw + 10);
      const y = 28 + Math.floor(slot / cols) * (nh + 8);
      const drift = Math.sin(now * 0.8 + k * 1.7) * 0.012;
      this.hit(`row:${k + 1}`, x, y, nw, nh);
      const open = r.phase === "lobby" && r.humans < r.seats;
      card(ctx, x, y - (sel ? 2 : 0), nw, nh, sel ? 0 : (k % 2 ? 0.02 : -0.02) + drift, sel ? "#c81818" : open ? "#3a9a30" : "#8a8a90", () => {
        waxSeal(ctx, 12, 16, 8, open ? "#2a7a20" : "#6a6058", open ? "banner" : "castle");
        const nm = r.name.length > 16 ? r.name.slice(0, 16) : r.name;
        drawPlain(ctx, nm, 25, 8, sel ? "#8a1810" : BROWN, 0.72, true);
        const map = (r.map || "-").replace(/^GRUDGE\w*\s*/, "");
        drawPlain(ctx, `${r.mode}  ·  ${map.slice(0, 12)}`, 25, 19, "#6a4424", 0.5);
        const age = r.age < 60 ? `${r.age}S AGO` : `${Math.floor(r.age / 60)} MIN AGO`;
        drawPlain(ctx, age, 25, 29, "#8a5a2a", 0.45);
        const st = r.phase === "match" ? "FIGHTING" : r.humans >= r.seats ? "FULL" : "OPEN";
        const seats = `${r.humans}/${r.seats}`;
        drawPlain(ctx, seats, nw - 8 - textWidth(seats, 0.8, true), 9, open ? "#2a6a18" : "#8a1810", 0.8, true);
        drawPlain(ctx, st, nw - 8 - textWidth(st, 0.5, true), 27, open ? "#2a6a18" : "#8a1810", 0.5, true);
      });
    }
    if (n > vis) {
      const t = `${this.scrollTop + 1}-${Math.min(n, this.scrollTop + vis)} OF ${n}`;
      shadowText(ctx, t, W - 14 - textWidth(t, 0.5), H - 31, "#f0e4c8", 0.5);
    }
    const p: [string, string][] = this.netBusy ? [["B", "CANCEL"]] : [["A", "JOIN"], ["B", "BACK"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }

  private drawRows(ctx: CanvasRenderingContext2D, W: number, H: number, art: string, fallback: string, rows: Row<object>[], obj: object, extra: string[]): void {
    boardTitle(ctx, W, art, fallback);
    const decree = this.page === "rules";
    const total = rows.length + extra.length;
    const pw = Math.min(232, Math.round(W * 0.55));
    const px = 16;
    const py = 26;
    const ph = H - 52;
    const top = decree ? 24 : 12;
    const rh = Math.min(17, Math.floor((ph - top - 10) / total));
    const f = this.focus;
    const val = (k: number) => rows[k].fmt((obj as Record<string, number>)[rows[k].key as string]);
    card(ctx, px, py, pw, ph, -0.015, null, () => {
      if (decree) {
        const t = "BY ORDER OF BOTH HOUSES";
        drawPlain(ctx, t, pw / 2 - textWidth(t, 0.6, true) / 2, 8, "#8a1810", 0.6, true);
        band(ctx, 14, 18, pw - 28, 1, "#6a4424", 0.5);
      }
      for (let k = 0; k < total; k++) {
        const y = top + k * rh + (k >= rows.length ? 4 : 0);
        const sel = k === f;
        this.hit(`row:${k}`, px + 4, py + y - 2, pw - 8, rh);
        if (sel) {
          ctx.fillStyle = "rgba(168,48,28,0.16)";
          ctx.fillRect(6, y - 2, pw - 12, rh - 1);
          goldArrow(ctx, 9, y + rh / 2 - 2, 1, 4);
        }
        const ty = y + rh / 2 - 6;
        if (k < rows.length) {
          const lead = decree ? `${ROMAN_N[k]}.  ` : "";
          const label = lead + rows[k].label;
          drawPlain(ctx, label, 18, ty, sel ? "#8a1810" : BROWN, 0.72, true);
          const v = val(k);
          const vx = pw - 12 - textWidth(v, 0.72, true);
          const lw = textWidth(label, 0.72, true) + 22;
          for (let dx = lw; dx < vx - 6; dx += 5) {
            ctx.fillStyle = "rgba(106,68,36,0.45)";
            ctx.fillRect(dx, ty + 6, 1.5, 1.5);
          }
          drawPlain(ctx, v, vx, ty, sel ? "#8a1810" : "#6a1c10", 0.72, true);
        } else {
          const t = extra[k - rows.length];
          drawPlain(ctx, t, pw / 2 - textWidth(t, 0.7, true) / 2, ty, sel ? "#8a1810" : "#6a4424", 0.7, true);
        }
      }
    });
    const dx0 = px + pw + 16;
    const dw = W - dx0 - 14;
    const dh = ph - 8;
    const dy0 = py + 2;
    const blurb =
      f < rows.length ? rows[f].blurb
      : f === rows.length ? "PUT EVERYTHING BACK AS IT WAS."
      : this.confirm === "erase" ? "PRESS A AGAIN TO BURN EVERY RECORD. NAMES ARE KEPT."
      : this.confirm === "erased" ? "THE RECORDS ARE ASHES."
      : "FORGET EVERY WIN, LOSS AND MATCH.";
    card(ctx, dx0, dy0, dw, dh, 0.02, "#c81818", () => {
      const head = f < rows.length ? (decree ? `ARTICLE ${ROMAN_N[f]}` : "SETTING") : "THE LEDGER";
      drawPlain(ctx, head, dw / 2 - textWidth(head, 0.55, true) / 2, 10, "#8a5a2a", 0.55, true);
      const title = f < rows.length ? rows[f].label : extra[f - rows.length];
      const ts = Math.min(1, (dw - 16) / Math.max(1, textWidth(title, 1, true)));
      drawPlain(ctx, title, dw / 2 - textWidth(title, ts, true) / 2, 22, BROWN, ts, true);
      const cy = 82;
      if (f < rows.length) {
        const r = rows[f];
        const cur = (obj as Record<string, number>)[r.key as string];
        if (decree) {
          inset(ctx, 12, 44, dw - 24, 48, "#3a2a1c");
          texturedRect(ctx, "cloth", 12, 44, dw - 24, 48, "#7a1a14", 0, 0.7);
          const v = val(f);
          const vs = Math.min(1.5, (dw - 60) / Math.max(1, textWidth(v, 1, true)));
          paintedText(ctx, v, dw / 2, 68 - 6 * vs - 2, "#f0c030", vs);
        } else {
          const r0 = Math.min(34, dw / 2 - 18);
          woodDisc(ctx, dw / 2, cy - 12, r0);
          const nv = r.values.length;
          const idx = Math.max(0, r.values.indexOf(cur));
          for (let q = 0; q < nv; q++) {
            const a = -Math.PI * 0.8 + (Math.PI * 1.6 * q) / Math.max(1, nv - 1);
            ctx.fillStyle = q === idx ? "#f0c030" : "#2a1a0a";
            ctx.beginPath();
            ctx.arc(dw / 2 + Math.sin(a) * (r0 - 5), cy - 12 - Math.cos(a) * (r0 - 5), q === idx ? 2.4 : 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
          const a = -Math.PI * 0.8 + (Math.PI * 1.6 * idx) / Math.max(1, nv - 1);
          ctx.strokeStyle = "#0b0806";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(dw / 2, cy - 12);
          ctx.lineTo(dw / 2 + Math.sin(a) * (r0 - 10), cy - 12 - Math.cos(a) * (r0 - 10));
          ctx.stroke();
          ctx.strokeStyle = "#c8a020";
          ctx.lineWidth = 1.4;
          ctx.stroke();
          waxSeal(ctx, dw / 2, cy - 12, 6, "#a8141a", "none");
          const v = val(f);
          drawPlain(ctx, v, dw / 2 - textWidth(v, 0.9, true) / 2, cy + 28, "#8a1810", 0.9, true);
        }
        const ay = decree ? 68 : cy + 32;
        goldArrow(ctx, 20, ay, -1, 6);
        goldArrow(ctx, dw - 20, ay, 1, 6);
      } else waxSeal(ctx, dw / 2, cy - 12, 22, f === rows.length ? "#6a3a2a" : "#a8141a", f === rows.length ? "repair" : "quake");
      wrap(blurb, dw - 20, 0.55).slice(0, 4).forEach((l, j) => drawPlain(ctx, l, dw / 2 - textWidth(l, 0.55) / 2, dh - 46 + j * 8, this.confirm === "erase" && f > rows.length ? "#a01810" : "#4a3018", 0.55));
      if (decree) waxSeal(ctx, dw - 16, dh - 14, 9, "#a8141a", "works");
    });
    if (f < rows.length) {
      const ay = dy0 + (decree ? 68 : 114);
      this.hit(`dec:${f}`, dx0 + 8, ay - 10, 24, 20);
      this.hit(`inc:${f}`, dx0 + dw - 32, ay - 10, 24, 20);
    }
    const p: [string, string][] = [["A", "CHANGE"], ["B", "DONE"]];
    const hint = "STICK LEFT / RIGHT: CHANGE";
    const pwid = promptWidth(p, 0.7) + 14 + textWidth(hint, 0.6);
    const x0 = Math.round((W - pwid) / 2);
    shadowText(ctx, hint, x0, H - 12, "#f0e4c8", 0.6);
    prompt(ctx, x0 + textWidth(hint, 0.6) + 14, H - 13, p, 0.7);
  }

  private drawRecords(ctx: CanvasRenderingContext2D, W: number, H: number): void {
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
    const lx = bx + 6;
    const rx = bx + bw - 6 - pgw;
    const pgy = by + 5;
    const pgh = bh - 10;
    for (const x of [lx, rx]) texturedRect(ctx, "parch", x, pgy, pgw, pgh, null, 0, 1.3);
    const sx = bx + bw / 2;
    const g = ctx.createLinearGradient(sx - 14, 0, sx + 14, 0);
    g.addColorStop(0, "rgba(60,30,10,0)");
    g.addColorStop(0.45, "rgba(60,30,10,0.45)");
    g.addColorStop(0.55, "rgba(60,30,10,0.45)");
    g.addColorStop(1, "rgba(60,30,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(sx - 14, pgy, 28, pgh);
    TABS.forEach((t, k) => {
      const sel = k === this.tab;
      const rw = 62;
      const cx = lx + 40 + k * (rw + 8);
      const len = sel ? 14 : 10;
      ctx.fillStyle = INK;
      ctx.fillRect(cx - rw / 2 - 1, by - 8, rw + 2, len + 1);
      texturedRect(ctx, "cloth", cx - rw / 2, by - 7, rw, len, sel ? "#b01818" : "#6a4a2a", 0, 0.6);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(cx - rw / 2, by - 7 + len);
      ctx.lineTo(cx, by - 7 + len - 4);
      ctx.lineTo(cx + rw / 2, by - 7 + len);
      ctx.fill();
      drawPlain(ctx, t, cx - textWidth(t, 0.5, true) / 2, by - 6 + (sel ? 3 : 0), sel ? "#fff4c8" : "#d8c8a8", 0.5, true);
      this.hit(`tab:${k}`, cx - rw / 2, by - 9, rw, len + 3);
    });
    const rh = 15;
    const listTop = pgy + 22;
    const vis = Math.floor((pgh - 24) / rh);
    const n = this.rowCount();
    if (this.focus < this.scrollTop) this.scrollTop = this.focus;
    if (this.focus >= this.scrollTop + vis) this.scrollTop = this.focus - vis + 1;
    const icon = (type: string, x: number, y: number, sz = 13) => {
      const im = this.portraits?.icon(type);
      if (im) hiImage(ctx, im, x, y, sz, sz);
    };
    const rowAt = (k: number, draw: (y: number, sel: boolean) => void) => {
      if (k < this.scrollTop || k >= this.scrollTop + vis) return;
      const y = listTop + (k - this.scrollTop) * rh;
      const sel = k === this.focus;
      this.hit(`row:${k}`, lx + 2, y - 2, pgw - 4, rh);
      if (sel) {
        ctx.fillStyle = "rgba(168,48,28,0.16)";
        ctx.fillRect(lx + 4, y - 2, pgw - 8, rh - 1);
        goldArrow(ctx, lx + 7, y + rh / 2 - 2, 1, 4);
      }
      draw(y, sel);
    };
    const pageHead = (x: number, t: string) => {
      drawPlain(ctx, t, x + pgw / 2 - textWidth(t, 0.6, true) / 2, pgy + 9, "#8a5a2a", 0.6, true);
      band(ctx, x + 10, pgy + 17, pgw - 20, 1, "#6a4424", 0.5);
    };
    const R = rx + 10;
    const RW = pgw - 20;
    const stat = (label: string, v: string, y: number, col = BROWN) => {
      drawPlain(ctx, label, R, y, "#6a4424", 0.6, true);
      drawPlain(ctx, v, R + RW - textWidth(v, 0.8, true), y - 1, col, 0.8, true);
    };
    if (this.tab === 0) {
      pageHead(lx, "CHAMPIONS");
      this.roster.forEach((type, k) => rowAt(k, (y, sel) => {
        icon(type, lx + 14, y - 3);
        drawPlain(ctx, (this.heroNames[type] ?? type).toUpperCase(), lx + 30, y, sel ? "#8a1810" : BROWN, 0.72, true);
        const s0 = this.save.data.heroes[type] ?? { picks: 0, w: 0, l: 0, d: 0 };
        num(ctx, winRate(s0), lx + pgw - 10, y, "#8a1810", 0.7);
      }));
      const type = this.roster[this.focus];
      if (type) {
        const s0 = this.save.data.heroes[type] ?? { picks: 0, w: 0, l: 0, d: 0 };
        pageHead(rx, (this.heroNames[type] ?? type).toUpperCase());
        inset(ctx, R + RW / 2 - 28, pgy + 25, 56, 56, "#3a2a1c");
        texturedRect(ctx, "cloth", R + RW / 2 - 28, pgy + 25, 56, 56, "#7a1a14", 0, 0.7);
        icon(type, R + RW / 2 - 30, pgy + 23, 60);
        let y = pgy + 90;
        for (const [l, v] of [["PICKED", s0.picks], ["WON", s0.w], ["LOST", s0.l], ["DRAWN", s0.d]] as const) {
          stat(l, String(v), y);
          y += 12;
        }
        stat("WIN RATE", winRate(s0), y + 2, "#8a1810");
      }
    } else if (this.tab === 1) {
      const ids = this.save.tagIds();
      const names = ids.map((id) => this.save.data.tags[id].name);
      pageHead(lx, "SIGNED NAMES");
      if (!names.length) {
        const a = "NO NAMES SIGNED YET.";
        drawPlain(ctx, a, lx + pgw / 2 - textWidth(a, 0.7, true) / 2, pgy + pgh / 2 - 8, "#6a4424", 0.7, true);
        wrap("CLICK YOUR NAME PLATE ON THE CHAMPION BANNER TO SIGN ONE.", pgw - 24, 0.5).forEach((l, j) => drawPlain(ctx, l, lx + pgw / 2 - textWidth(l, 0.5) / 2, pgy + pgh / 2 + 6 + j * 8, "#8a5a2a", 0.5));
      }
      names.forEach((name, k) => rowAt(k, (y, sel) => {
        waxSeal(ctx, lx + 20, y + 3.5, 5, "#a8141a", "combo");
        drawPlain(ctx, name, lx + 30, y, sel ? "#8a1810" : BROWN, 0.72, true);
        num(ctx, winRate(this.save.data.tags[ids[k]]), lx + pgw - 10, y, "#8a1810", 0.7);
      }));
      const name = names[this.focus];
      if (name) {
        const t = this.save.data.tags[ids[this.focus]];
        pageHead(rx, "THE SIGNATORY");
        const ns = Math.min(1.6, RW / Math.max(1, textWidth(name, 1, true)));
        drawPlain(ctx, name, R + RW / 2 - textWidth(name, ns, true) / 2, pgy + 22, "#3a2410", ns, true);
        let y = pgy + 50;
        for (const [l, v] of [["WON", t.w], ["LOST", t.l], ["DRAWN", t.d]] as const) {
          stat(l, String(v), y);
          y += 12;
        }
        stat("WIN RATE", winRate(t), y + 2, "#8a1810");
        const fav = Object.entries(t.heroes).sort((a, b) => b[1].w + b[1].l + b[1].d - (a[1].w + a[1].l + a[1].d))[0];
        if (fav) {
          y += 18;
          drawPlain(ctx, "FAVOURITE", R, y, "#6a4424", 0.6, true);
          inset(ctx, R + RW - 26, y - 4, 24, 24, "#3a2a1c");
          icon(fav[0], R + RW - 27, y - 5, 26);
          drawPlain(ctx, (this.heroNames[fav[0]] ?? fav[0]).toUpperCase(), R, y + 10, BROWN, 0.72, true);
        }
        if (this.confirm === `strike:${ids[this.focus]}`) {
          const c = "PRESS Y AGAIN TO STRIKE";
          drawPlain(ctx, c, R + RW / 2 - textWidth(c, 0.55) / 2, pgy + pgh - 12, "#a01810", 0.55);
        }
      }
    } else {
      const log = this.save.data.log;
      pageHead(lx, "THE CHRONICLE");
      if (!log.length) {
        const a = "NO GRUDGES SETTLED YET.";
        drawPlain(ctx, a, lx + pgw / 2 - textWidth(a, 0.7, true) / 2, pgy + pgh / 2 - 8, "#6a4424", 0.7, true);
        const b = "FINISH A MATCH TO WRITE THE FIRST PAGE.";
        drawPlain(ctx, b, lx + pgw / 2 - textWidth(b, 0.5) / 2, pgy + pgh / 2 + 6, "#8a5a2a", 0.5);
      }
      log.forEach((m, k) => rowAt(k, (y, sel) => {
        drawPlain(ctx, dateOf(m.at), lx + 14, y, "#8a5a2a", 0.62, true);
        const map = (this.mapNames[m.map] ?? m.map).toUpperCase().replace(/^GRUDGE\w*\s*/, "");
        drawPlain(ctx, map.slice(0, 12), lx + 44, y, sel ? "#8a1810" : BROWN, 0.65, true);
        const res = m.winner < 0 ? "DRAW" : HOUSE[m.winner] ?? "-";
        num(ctx, res, lx + pgw - 10, y, m.winner < 0 ? BROWN : TEAM_TEXT[m.winner], 0.65);
      }));
      const m = log[this.focus];
      if (m) {
        const map = (this.mapNames[m.map] ?? m.map).toUpperCase();
        pageHead(rx, `${dateOf(m.at)} · ${map}`);
        const mm = `${Math.floor(m.secs / 60)}:${String(Math.floor(m.secs % 60)).padStart(2, "0")}`;
        let y = pgy + 22;
        if (m.mode === "ffa") {
          for (const p of [...m.players].sort((a, b) => Number(b.team === m.winner) - Number(a.team === m.winner))) {
            icon(p.hero, R, y - 3, 14);
            drawPlain(ctx, HOUSE[p.team] ?? "", R + 17, y, TEAM_TEXT[p.team], 0.55, true);
            const nm = `${p.cpu ? "CPU" : p.tag ?? "-"} · ${(this.heroNames[p.hero] ?? p.hero).toUpperCase()}`;
            drawPlain(ctx, nm, R + 17, y + 7, BROWN, 0.55, true);
            y += 17;
          }
          y += 2;
        }
        for (const team of m.mode === "ffa" ? [] : [0, 1]) {
          drawPlain(ctx, team ? "RED HOUSE" : "BLUE HOUSE", R, y, TEAM_TEXT[team], 0.62, true);
          y += 10;
          for (const p of m.players.filter((q) => q.team === team)) {
            icon(p.hero, R, y - 3, 14);
            const nm = `${p.cpu ? "CPU" : p.tag ?? "-"} · ${(this.heroNames[p.hero] ?? p.hero).toUpperCase()}`;
            drawPlain(ctx, nm, R + 17, y, BROWN, 0.6, true);
            y += 13;
          }
          y += 4;
        }
        stat("LASTED", mm, y + 2);
        const res = m.winner < 0 ? "DRAW" : HOUSE[m.winner] ?? "-";
        waxSeal(ctx, R + RW - 14, pgy + pgh - 18, 12, m.winner < 0 ? "#8a7a60" : m.winner === 0 ? "#2a4ab8" : m.winner === 1 ? "#a8141a" : TEAM_CLOTH[m.winner], "combo");
        drawPlain(ctx, res === "DRAW" ? "A DRAW" : `${res} WON`, R, pgy + pgh - 22, m.winner < 0 ? BROWN : TEAM_TEXT[m.winner], 0.85, true);
      }
    }
    if (n > vis) {
      const t = `${this.scrollTop + 1}-${Math.min(n, this.scrollTop + vis)} OF ${n}`;
      drawPlain(ctx, t, lx + pgw - 8 - textWidth(t, 0.48, true), pgy + pgh - 9, "#8a5a2a", 0.48, true);
    }
    const p: [string, string][] = [["B", "DONE"]];
    if (this.tab === 1 && this.save.tagNames().length) p.unshift(["Y", this.confirm.startsWith("strike:") ? "AGAIN TO STRIKE" : "STRIKE NAME"]);
    const hint = "STICK LEFT / RIGHT: BOOKMARK";
    const pwid = promptWidth(p, 0.7) + 14 + textWidth(hint, 0.6);
    const x0 = Math.round((W - pwid) / 2);
    shadowText(ctx, hint, x0, H - 12, "#f0e4c8", 0.6);
    prompt(ctx, x0 + textWidth(hint, 0.6) + 14, H - 13, p, 0.7);
  }

  private codex: CodexEntry[] | null = null;
  demoRect: [number, number, number, number] | null = null;
  demoPick = 0;

  codexDemo(): { hero: string; slot: "a" | "b" | "r" | "z"; picks: number; scene?: string } | null {
    if (this.page !== "codex" || !this.demoRect) return null;
    const e = this.codexEntries()[this.focus];
    const pg = e?.pages[Math.min(this.codexPage, e.pages.length - 1)];
    if (pg?.art.kind === "scene") return { hero: "", slot: "a", picks: 0, scene: pg.art.scene };
    if (!pg || pg.art.kind !== "shot") return null;
    return { hero: pg.art.hero, slot: pg.art.slot, picks: pg.picks?.length ?? 0 };
  }
  private codexPage = 0;
  private codexFocus = 0;

  private codexEntries(): CodexEntry[] {
    if (!this.codex) this.codex = buildCodex(Object.values(this.mapNames));
    return this.codex;
  }

  private codexArt(ctx: CanvasRenderingContext2D, art: CodexArt, x: number, y: number, w: number, h: number): void {
    inset(ctx, x, y, w, h, "#3a2a1c");
    const bg = art.kind === "seal" ? art.color ?? "#7a1a14" : "#7a1a14";
    if (art.kind !== "map") texturedRect(ctx, "cloth", x, y, w, h, bg, 0, 0.7);
    const P = this.portraits;
    if (art.kind === "portrait" && P) {
      hiImage(ctx, P.actionShot(art.hero, "idle", 0.3, w * 4, h * 4), x, y, w, h);
    } else if (art.kind === "map" && P) {
      const im = P.mapThumb(art.index, w * 2, h * 2);
      if (im) hiImage(ctx, im, x, y, w, h);
    } else if (art.kind === "unit" && P) {
      const im = P.unitShot(art.type, w * 4, h * 4);
      if (im) hiImage(ctx, im, x, y, w, h);
    } else if (art.kind === "seal") waxSeal(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.32, "#c8a020", art.glyph);
  }

  private drawCodex(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    boardTitle(ctx, W, "!CODEX", "CODEX");
    const entries = this.codexEntries();
    if (this.focus !== this.codexFocus) {
      this.codexFocus = this.focus;
      this.codexPage = 0;
    }
    const entry = entries[this.focus];
    const page = entry?.pages[Math.min(this.codexPage, entry.pages.length - 1)];
    const pw = Math.min(272, Math.round(W * 0.64));
    const ph = H - 50;
    const px = 12;
    const py = 25;
    this.demoRect = null;
    if (entry && page) {
      const live = page.art.kind === "shot" || page.art.kind === "scene";
      card(ctx, px, py, pw, ph, 0, null, () => {
        const evo = !!page.picks;
        const wide = live || page.art.kind === "map";
        const aw = wide ? pw - 24 : 88;
        const ah = wide ? (evo ? 74 : 96) : 104;
        if (live) {
          windowCut(ctx, 12, 12, aw, ah);
          this.demoRect = [(px + 12) / W, (py + 12) / H, aw / W, ah / H];
        } else this.codexArt(ctx, page.art, 12, 12, aw, ah);
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
          const colW = (pw - 30) / 2;
          page.picks.forEach((pk, k) => {
            const cx = 12 + k * (colW + 6);
            let py2 = y;
            const on = page.picks!.length > 1 && k === this.demoPick % page.picks!.length;
            if (on) {
              ctx.fillStyle = "rgba(168,48,28,0.14)";
              ctx.fillRect(cx - 3, py2 - 3, colW + 6, ph - py2 - 18);
            }
            talentIcon(ctx, pk.id, cx, py2, 18);
            const ns = Math.min(0.66, (colW - 24) / Math.max(1, textWidth(pk.name, 1, true)));
            drawPlain(ctx, pk.name, cx + 22, py2 + 4, on ? "#8a1810" : BROWN, ns, true);
            py2 += 22;
            const desc = pk.combo ? pk.desc.replace(/\s*WITH [A-Z' ]+:?[^.]*\.?/g, "").trim() : pk.desc;
            const dl = wrap(desc, colW, 0.5).slice(0, 4);
            dl.forEach((l, j) => drawPlain(ctx, l, cx, py2 + j * 7, "#4a3018", 0.5));
            py2 += dl.length * 7 + 2;
            if (pk.combo) wrap(pk.combo, colW, 0.5).slice(0, 3).forEach((l, j) => drawPlain(ctx, l, cx, py2 + j * 7, "#a8141a", 0.5));
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
        const pg = `${this.codexPage + 1} / ${n}`;
        const cx = pw - 34;
        drawPlain(ctx, pg, cx - textWidth(pg, 0.6, true) / 2, ph - 12, "#6a4424", 0.6, true);
        if (this.codexPage > 0) goldArrow(ctx, cx - 22, ph - 8, -1, 4.5);
        if (this.codexPage < n - 1) goldArrow(ctx, cx + 22, ph - 8, 1, 4.5);
      });
      this.hit("cpg:-1", px + pw - 66, py + ph - 18, 22, 16);
      this.hit("cpg:1", px + pw - 22, py + ph - 18, 22, 16);
    }
    const cx0 = px + pw + 14;
    const cw = W - cx0 - 19;
    const th = 13;
    const gap = 3;
    const ch = 10;
    const rows: { kind: "cat" | "entry"; k: number; label: string }[] = [];
    let last = "";
    entries.forEach((e2, k) => {
      if (e2.cat !== last) {
        rows.push({ kind: "cat", k: -1, label: e2.cat });
        last = e2.cat;
      }
      rows.push({ kind: "entry", k, label: e2.title });
    });
    const height = (r: { kind: string }) => (r.kind === "cat" ? ch : th + gap);
    const avail = H - 50;
    const focusRow = rows.findIndex((r) => r.k === this.focus);
    let start = Math.min(this.scrollTop, focusRow);
    const span = (a: number, b: number) => rows.slice(a, b + 1).reduce((q, r) => q + height(r), 0);
    while (span(start, focusRow) > avail) start++;
    while (start > 0 && rows[start - 1].kind === "cat" && span(start - 1, focusRow) <= avail) start--;
    this.scrollTop = start;
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
      const sel = r.k === this.focus;
      const e2 = entries[r.k];
      this.hit(`row:${r.k}`, cx0 - 6, y - 1, cw + 6, th + 2);
      const x = cx0 - (sel ? 6 : 0);
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1, y - 1, cw + 2, th + 2);
      texturedRect(ctx, "parch", x, y, cw, th, sel ? "#f0d8a0" : null, 0, 1);
      if (sel) goldArrow(ctx, x - 6, y + th / 2, -1, 4.5);
      if ((e2.cat === "CHAMPIONS" || e2.cat === "HERALD") && this.portraits) {
        const id = e2.cat === "HERALD" ? "herald" : this.roster.find((h) => (this.heroNames[h] ?? h).toUpperCase() === e2.title);
        const im = id ? this.portraits.icon(id) : null;
        if (im) hiImage(ctx, im, x + 1, y, th, th);
      } else waxSeal(ctx, x + 7, y + th / 2, 4.5, sel ? "#a8141a" : "#6a3a2a", e2.glyph);
      drawPlain(ctx, r.label, x + 16, y + 2.5, sel ? "#8a1810" : BROWN, 0.55, true);
      y += th + gap;
    }
    if (shown < rows.length) {
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
    const p: [string, string][] = [["A", "TURN PAGE"], ["B", "BACK"]];
    const hint = "UP / DOWN: ENTRY · LEFT / RIGHT: PAGE";
    const pwid = promptWidth(p, 0.7) + 14 + textWidth(hint, 0.6);
    const x0 = Math.round((W - pwid) / 2);
    shadowText(ctx, hint, x0, H - 12, "#f0e4c8", 0.6);
    prompt(ctx, x0 + textWidth(hint, 0.6) + 14, H - 13, p, 0.7);
  }

  private empty(ctx: CanvasRenderingContext2D, W: number, y: number, a: string, b: string): void {
    drawPlain(ctx, a, W / 2 - textWidth(a, 0.8, true) / 2, y, "#6a4424", 0.8, true);
    drawPlain(ctx, b, W / 2 - textWidth(b, 0.55) / 2, y + 13, "#8a5a2a", 0.55);
  }

  private drawControls(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    artTitle(ctx, "m_controls", "CONTROLS", W / 2, 3, 14);
    drawControlSheet(ctx, 12, 24, W - 24, H - 48);
    const p: [string, string][] = [["B", "DONE"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }
}

const PAD_GROUPS: [string, [string, string][]][] = [
  ["FIGHT", [["STICK", "MOVE"], ["A", "ATTACK · HOLD TO CHARGE · WITH A BOMB: THROW"], ["B", "SECONDARY · HOLD TO CHARGE OR AIM"], ["R", "SPECIAL · HOLD TO AIM WHERE IT LANDS"], ["Z", "SUPER WHEN THE METER IS FULL"], ["L", "BLOCK · L+A SHOVE · L+X DODGE · CANCELS AN AIM · DROPS THE GRUDGE"]]],
  ["COMMAND", [["C", "ORDERS: UP ATTACK (AGAIN: PICK LANE) · LEFT FOLLOW · RIGHT DEFEND · DOWN HOLD · LEVEL UP: LEFT / RIGHT"], ["D-PAD", "LEFT / RIGHT: WHO OBEYS · UP / DOWN: ZOOM"]]],
  ["BUILD", [["X", "AT A PAD: OUTPOSTS · 2V2: HOLD AWAY FROM A PAD TO BECOME THE HERALD"], ["Y", "AT A PAD: TOWERS · KEEP: SHOP · ELSEWHERE: RECALL (ONCE PER LIFE)"], ["START", "PAUSE"]]],
];
const KEY_GROUPS: [string, [string, string][]][] = [
  ["FIGHT", [["WASD", "MOVE"], ["E", "ATTACK · HOLD TO CHARGE"], ["Q", "SECONDARY · HOLD TO CHARGE"], ["X", "SPECIAL · HOLD + WASD TO AIM"], ["C", "SUPER · HOLD + WASD TO AIM"], ["Z", "BLOCK · Z + E: SHOVE · CANCELS AN AIM · DROPS THE GRUDGE"], ["SPACE", "DODGE"]]],
  ["COMMAND", [["ARROWS", "ORDERS · UP AGAIN PICKS A LANE · LEFT / RIGHT LEARNS ON LEVEL UP"], ["3 / 4", "WHO OBEYS"], ["1 / 2", "ZOOM"]]],
  ["BUILD", [["F / L-MOUSE", "OUTPOSTS AT A PAD · 2V2: HOLD F ELSEWHERE TO BECOME THE HERALD"], ["R / R-MOUSE", "TOWERS · SHOP AT THE KEEP · ELSEWHERE: RECALL"], ["ENTER", "PAUSE"]]],
];

export function drawControlSheet(ctx: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number): void {
  const gap = 12;
  const cw = Math.floor((pw - gap) / 2);
  ([[PAD_GROUPS, "CONTROLLER", "pad"], [KEY_GROUPS, "KEYBOARD AND MOUSE", "works"]] as const).forEach(([groups, title, glyph], c) => {
    const x = px + c * (cw + gap);
    card(ctx, x, py, cw, ph, c ? 0.012 : -0.012, "#8a8a90", () => {
      waxSeal(ctx, 13, 12, 7, "#a8141a", glyph);
      drawPlain(ctx, title, 25, 8, "#8a1810", 0.68, true);
      band(ctx, 8, 21, cw - 16, 1, "#6a4424", 0.5);
      const keyW = c ? 50 : 28;
      const textW = cw - keyW - 18;
      let S = 0.5;
      let LH = 7;
      const build = () => groups.map(([g, rows]) => ({ g, rows: rows.map(([k, v]) => ({ k, lines: wrap(v, textW, S) })) }));
      const measure = (bl: ReturnType<typeof build>) => bl.reduce((a, b) => a + 10 + b.rows.reduce((q, r) => q + r.lines.length * LH + 2, 0), 0);
      let blocks = build();
      while (measure(blocks) > ph - 30 && S > 0.4) {
        S -= 0.03;
        LH = 14 * S;
        blocks = build();
      }
      const used = measure(blocks);
      const slack = Math.max(0, (ph - 30 - used) / Math.max(1, blocks.length));
      let y = 26 + slack / 2;
      for (const b of blocks) {
        drawPlain(ctx, b.g, 8, y, "#a8141a", 0.5, true);
        band(ctx, 10 + textWidth(b.g, 0.5, true), y + 3.5, cw - 22 - textWidth(b.g, 0.5, true), 1, "#a8141a", 0.25);
        y += 10;
        for (const r of b.rows) {
          if (c === 0) {
            const col = r.k === "A" ? PAD.a : r.k === "B" ? PAD.b : r.k === "C" || r.k === "X" || r.k === "Y" ? PAD.c : r.k === "Z" || r.k === "R" || r.k === "L" ? PAD.z : r.k === "START" ? PAD.start : "";
            if (col) padButton(ctx, 16, y + 3, 4.2, col, r.k === "START" ? "S" : r.k);
            else drawPlain(ctx, r.k, 16 - textWidth(r.k, 0.42, true) / 2, y + 0.5, "#6a4424", 0.42, true);
          } else drawPlain(ctx, r.k, 8, y, "#6a1c10", 0.48, true);
          r.lines.forEach((l, j) => drawPlain(ctx, l, 8 + keyW, y + j * LH, BROWN, S, true));
          y += r.lines.length * LH + 2;
        }
        y += slack;
      }
    });
  });
}
