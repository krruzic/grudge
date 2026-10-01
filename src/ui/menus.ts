import { drawPlain, drawText, occlude, onHiLayer, textWidth } from "./font";
import { artTitle, band, banner, beam, drawLogo, fieldShade, goldArrow, nameImage, paintedText, parchment, plank, ribbon, scroll, shadowText, texturedRect, waxSeal, woodFloor } from "./n64ui";
import { padButton, PAD, talentIcon } from "./hud";
import { learned } from "../sim/talents";
import { prompt, promptWidth, wrap } from "./screens";
import type { Hit, MenuCursors } from "./cursor";
import type { Portraits } from "./portraits";
import type { World } from "../sim/world";
import { DEFAULT_OPTIONS, DEFAULT_RULES, MAX_TAG, OPTION_ROWS, RULE_ROWS, cycle, winRate, type Row, type Save } from "../game/save";

export type Page = "main" | "players" | "network" | "browse" | "rules" | "options" | "records" | "controls";
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
export type MenuResult = "fight" | "title" | "options" | "host" | "join" | "browse" | "leave" | null;

const INK = "#0b0806";
const BROWN = "#3a2410";
const LIGHT = "#f8e8c0";
const TEAM_TEXT = ["#1c3aa8", "#a81c1c"];
const ITEMS = [
  { art: "m_fight", label: "FIGHT", blurb: "CHOOSE CHAMPIONS AND SETTLE A GRUDGE. ONE AGAINST ONE, OR TWO AGAINST TWO WITH COMMANDERS." },
  { art: "!PLAYERS", label: "PLAYERS", blurb: "WHO IS PLAYING ON THIS MACHINE: CONTROLLERS, KEYBOARD AND MOUSE. FREE A SEAT OR TURN THE KEYBOARD OFF." },
  { art: "m_network", label: "VERSUS ONLINE", blurb: "PLAY OVER THE HOUSE NETWORK. ONE MACHINE HOSTS, FRIENDS OPEN ITS PAGE AND JOIN." },
  { art: "m_rules", label: "RULES", blurb: "SET THE TERMS OF COMBAT: TIME, GOLD, SOLDIERS AND MERCY." },
  { art: "m_records", label: "RECORDS", blurb: "EVERY VICTORY AND DEFEAT, WRITTEN DOWN BY NAME AND BY CHAMPION." },
  { art: "m_options", label: "OPTIONS", blurb: "MUSIC, SOUND, SCREEN SHAKE AND BUTTON HINTS." },
  { art: "m_controls", label: "CONTROLS", blurb: "HOW TO FIGHT, BUILD AND COMMAND YOUR ARMY." },
];
const PAGES: Page[] = ["main", "players", "network", "rules", "records", "options", "controls"];
const TABS = ["CHAMPIONS", "NAMES", "CHRONICLE"];
const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-".split("");

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

function stoneTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, hot: boolean): void {
  band(ctx, x + 1.5, y + 2, w, h, INK, 0.4);
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  texturedRect(ctx, "stone", x, y, w, h, hot ? "#e8c070" : null, 0, 0.5);
  band(ctx, x, y, w, 1, "#ffffff", 0.25);
  band(ctx, x, y + h - 1, w, 1, INK, 0.5);
  const s = label.length > 1 ? 0.7 : 0.95;
  drawText(ctx, label, x + w / 2 - textWidth(label, s, true) / 2, y + h / 2 - 5 * s, hot ? "#ffe070" : "#e8dcc0", s, true);
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
const TEAM_CLOTH = ["#2a4ab8", "#b02a1c"];

export class Menus {
  pauseFocus = 0;
  currentMap = "";
  pauseView: "menu" | "controls" = "menu";
  private pauseConfirm = false;

  openPause(): void {
    this.pauseFocus = 0;
    this.pauseView = "menu";
    this.pauseConfirm = false;
  }

  updatePause(nav: Nav, ptr: Pointer, sound: (k: "move" | "ok" | "back") => void): "resume" | "quit" | null {
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
      this.pauseFocus = (this.pauseFocus + nav.dy + PAUSE_ITEMS.length) % PAUSE_ITEMS.length;
      this.pauseConfirm = false;
      sound("move");
    }
    if (nav.b || ptr.right) {
      sound("back");
      return "resume";
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
    band(ctx, 0, 0, W, H, "#0a0602", 0.35);
    beam(ctx, 4, 2, W - 8, 17);
    artTitle(ctx, "!PAUSED", "PAUSED", W / 2, 3, 14);
    woodFloor(ctx, H - 20, W, H);
    if (this.pauseView === "controls") {
      drawControlSheet(ctx, 12, 24, W - 24, H - 48);
      const p: [string, string][] = [["B", "BACK"]];
      prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
      return;
    }
    const bw = 116;
    const bx = 20;
    const by = 24;
    const bh = 132;
    banner(ctx, bx, by, bw, bh, "#9a2a1c", 12);
    const step = (bh - 30) / PAUSE_ITEMS.length;
    PAUSE_ITEMS.forEach((label, k) => {
      const sel = k === this.pauseFocus;
      const h = sel ? 19 : 15;
      const y = by + 12 + k * step + (step - h) / 2;
      const cx = bx + bw / 2;
      const text = k === 2 && sel && this.pauseConfirm ? "ARE YOU SURE?" : label;
      const tw = artWord(ctx, `!${text}`, text, cx + (sel ? 3 : 0), y, h, sel ? 1 : 0.6);
      if (sel) goldArrow(ctx, cx + 3 - tw / 2 - 8, y + h / 2, 1, 5);
      this.hit(`prow:${k}`, bx, y - 3, bw, h + 6);
    });
    const blurb = this.pauseFocus === 0 ? "BACK TO THE FIGHT." : this.pauseFocus === 1 ? "EVERY BUTTON, FOR PADS AND FOR KEYBOARDS." : this.pauseConfirm ? "PRESS A AGAIN TO ABANDON THE MATCH." : "LEAVE THE MATCH AND RETURN TO THE MENU.";
    wrap(blurb, bw - 10, 0.55).forEach((l, j) => shadowText(ctx, l, bx + bw / 2 - textWidth(l, 0.55) / 2, by + bh + 14 + j * 8, this.pauseConfirm && this.pauseFocus === 2 ? "#ffb090" : "#f0e4c8", 0.55));

    const rx = bx + bw + 18;
    const rw = W - rx - 18;
    const ry = 26;
    const rh = H - 56;
    plank(ctx, rx, ry, rw, rh, "#6a4a30");
    const m = w.data.match;
    const left = Math.max(0, m.matchSeconds - w.time);
    const sudden = w.match.phase === "sudden";
    const clock = sudden ? "SUDDEN DEATH" : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")} LEFT`;
    const mapName = this.currentMap.toUpperCase();
    paintedText(ctx, clock, rx + rw / 2, ry + 6, sudden ? "#ff7050" : "#f0c030", 0.95);
    if (mapName) drawText(ctx, mapName, rx + rw / 2 - textWidth(mapName, 0.5) / 2, ry + 19, "#d8c8a8", 0.5);
    const colW = (rw - 18) / 2;
    [0, 1].forEach((team) => {
      const x = rx + 6 + team * (colW + 6);
      const y = ry + 30;
      const h = rh - 36;
      ctx.fillStyle = "#0b0806";
      ctx.fillRect(x - 1, y - 1, colW + 2, h + 2);
      texturedRect(ctx, "cloth", x, y, colW, h, TEAM_CLOTH[team], 0, 0.8);
      band(ctx, x, y, colW, h, "#000000", 0.25);
      const name = team === 0 ? "BLUE HOUSE" : "RED HOUSE";
      drawText(ctx, name, x + colW / 2 - textWidth(name, 0.68) / 2, y + 3, "#fff0c8", 0.68);
      const ts = w.teams[team];
      let yy = y + 15;
      for (const p of w.players.filter((q) => q.team === team)) {
        const e = w.getAny(p.heroId);
        if (!e?.hero) continue;
        const icon = this.portraits?.icon(p.heroType);
        ctx.fillStyle = "#0b0806";
        ctx.fillRect(x + 3, yy - 2, 26, 26);
        texturedRect(ctx, "stone", x + 4, yy - 1, 24, 24, "#b8a888", 0, 0.5);
        if (icon) ctx.drawImage(icon, x + 2, yy - 3, 28, 28);
        const nm = `P${p.player + 1} ${(this.heroNames[p.heroType] ?? p.heroType).toUpperCase()}`;
        drawText(ctx, nm, x + 33, yy, "#f8e8c0", 0.6);
        const lv = `LV ${e.hero.level ?? 1}`;
        drawText(ctx, lv, x + colW - 4 - textWidth(lv, 0.5), yy, "#ffe070", 0.5);
        const fr = e.alive ? Math.max(0, e.hp / e.maxHp) : 0;
        const bwid = colW - 38;
        ctx.fillStyle = "#0b0806";
        ctx.fillRect(x + 33, yy + 10, bwid + 2, 5);
        ctx.fillStyle = e.alive ? (fr > 0.35 ? "#58c040" : "#e04030") : "#5a5048";
        ctx.fillRect(x + 34, yy + 11, Math.round(bwid * fr), 3);
        drawText(ctx, e.alive ? `${Math.ceil(e.hp)} / ${Math.round(e.maxHp)}` : "FALLEN", x + 33, yy + 16, "#d8c8a8", 0.45);
        const got = (["r", "b", "a", "z"] as const).flatMap((sl) => learned(w, e, sl));
        got.forEach((tl, k) => talentIcon(ctx, tl.id, x + colW - 5 - (got.length - k) * 11, yy + 15, 10));
        yy += 31;
      }
      const core = w.core(team);
      const stats: [string, string][] = [
        ["KEEP", core ? `${Math.round((core.hp / core.maxHp) * 100)}%` : "-"],
        ["GOLD", String(Math.floor(ts.resource))],
        ["SOLDIERS", String(ts.unitCount)],
        ["HERO KILLS", String(ts.heroKills)],
      ];
      const sy = y + h - 8 - stats.length * 9;
      band(ctx, x + 4, sy - 3, colW - 8, 1, "#000000", 0.4);
      stats.forEach(([k, v], i) => {
        drawText(ctx, k, x + 5, sy + i * 9, "#e8d8b8", 0.5);
        drawText(ctx, v, x + colW - 5 - textWidth(v, 0.55), sy + i * 9, "#fff4c8", 0.55);
      });
    });
    void now;
    const p: [string, string][] = [["A", "CHOOSE"], ["B", "RESUME"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
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
  tagSlot = -1;
  tagMode: "list" | "type" = "list";
  tagText = "";

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
      act = "a";
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
    if (this.page === "records") {
      if (dx) {
        this.tab = (this.tab + dx + TABS.length) % TABS.length;
        this.focus = 0;
        this.scrollTop = 0;
        this.confirm = "";
        sound("move");
      }
      if (this.tab === 1 && nav.y) {
        const name = this.save.tagNames()[this.focus];
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
    if (this.page === "main") this.drawMain(ctx, W, H, now);
    else {
      fieldShade(ctx, W, H, 0.38);
      woodFloor(ctx, H - 20, W, H);
      beam(ctx, 4, 2, W - 8, 17);
      if (this.page === "players") this.drawPlayers(ctx, W, H, now);
      else if (this.page === "network") this.drawNetwork(ctx, W, H, now);
      else if (this.page === "browse") this.drawBrowse(ctx, W, H, now);
      else if (this.page === "rules") this.drawRows(ctx, W, H, "t_rules", "RULES OF COMBAT", RULE_ROWS as Row<object>[], this.save.data.rules, ["RESTORE DEFAULTS"]);
      else if (this.page === "options") this.drawRows(ctx, W, H, "m_options", "OPTIONS", OPTION_ROWS as Row<object>[], this.save.data.options, ["RESTORE DEFAULTS", "ERASE ALL RECORDS"]);
      else if (this.page === "records") this.drawRecords(ctx, W, H);
      else this.drawControls(ctx, W, H);
    }
  }

  private drawMain(ctx: CanvasRenderingContext2D, W: number, H: number, _now: number): void {
    fieldShade(ctx, W, H, 0.12);
    woodFloor(ctx, H - 20, W, H);
    const bw = 128;
    const bx = 26;
    const by = 12;
    const bh = H - 38;
    banner(ctx, bx, by, bw, bh, "#9a2a1c", 12);
    const step = (bh - 34) / ITEMS.length;
    ITEMS.forEach((it, k) => {
      const sel = k === this.focus;
      const h = sel ? 21 : 17;
      const y = by + 14 + k * step + (step - h) / 2;
      const cx = bx + bw / 2;
      const w = artWord(ctx, it.art, it.label, cx + (sel ? 4 : 0), y, h, sel ? 1 : 0.62);
      if (sel) goldArrow(ctx, cx + 4 - w / 2 - 9, y + h / 2, 1, 5);
      this.hit(`row:${k}`, bx, y - 3, bw, h + 6);
    });
    const rx = bx + bw + 16;
    const rw = W - rx - 16;
    const rcx = rx + rw / 2;
    drawLogo(ctx, rcx, 16, Math.min(78, rw * 0.36));
    const sw = rw - 16;
    const sy = H - 92;
    scroll(ctx, rcx, sy, sw, 58);
    const it = ITEMS[this.focus];
    artWord(ctx, it.art, it.label, rcx, sy + 4, 13);
    wrap(it.blurb, sw - 16, 0.58).slice(0, 3).forEach((l, j) => drawPlain(ctx, l, rcx - sw / 2 + 8, sy + 21 + j * 8, "#4a3018", 0.58));
    if (this.focus === 0) {
      const r = this.save.data.rules;
      const t = `${r.minutes} MIN  ·  ${r.popCap} SOLDIERS  ·  GOLD X ${r.goldRate}${r.mercy ? "" : "  ·  NO MERCY"}`;
      drawPlain(ctx, t, rcx - textWidth(t, 0.52) / 2, sy + 47, "#8a1810", 0.52);
    }
    const p: [string, string][] = [["A", "SELECT"], ["B", "BACK"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
    const ver = `BUILD ${__BUILD__}`;
    shadowText(ctx, ver, W - 6 - textWidth(ver, 0.5), H - 11, "#d8c8a8", 0.5);
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
    artTitle(ctx, "m_network", "VERSUS ONLINE", W / 2, 3, 14);
    const opts: [string, string, string, string][] = [
      ["t_host", "HOST A BATTLE", "castle", "THIS MACHINE RUNS THE MATCH. FRIENDS JOIN FROM THEIR OWN SCREENS."],
      ["t_join", "JOIN A BATTLE", "banner", "SEE EVERY BATTLE ON THIS SERVER AND TAKE A SEAT. YOU SEE THE HOST'S RULES BEFORE THE FIGHT."],
    ];
    const cw = Math.min(170, Math.floor((W - 50) / 2));
    const ch = 112;
    const gap = 18;
    const x0 = Math.round((W - cw * 2 - gap) / 2);
    const cy = 34;
    opts.forEach(([art, label, glyph, blurb], k) => {
      const x = x0 + k * (cw + gap);
      const hot = k === this.focus;
      const y = cy - (hot ? 3 : 0);
      plank(ctx, x, y, cw, ch, hot ? "#a07448" : "#6a4a30");
      if (hot) {
        ctx.strokeStyle = "#f0c030";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 2.5, y - 2.5, cw + 5, ch + 5);
      }
      waxSeal(ctx, x + cw / 2, y + 30, 18, hot ? "#b81a1a" : "#7a1a14", glyph);
      artWord(ctx, art, label, x + cw / 2, y + 54, hot ? 16 : 14, hot ? 1 : 0.75);
      wrap(blurb, cw - 18, 0.52).slice(0, 3).forEach((l, j) => drawText(ctx, l, x + cw / 2 - textWidth(l, 0.52) / 2, y + 76 + j * 8, hot ? "#fff0c8" : "#d8ccb0", 0.52));
      if (hot) {
        goldArrow(ctx, x + cw / 2 - 30, y + ch + 8, 1, 5);
        goldArrow(ctx, x + cw / 2 + 30, y + ch + 8, -1, 5);
      }
      this.hit(`row:${k}`, x, y, cw, ch);
    });
    const lines = [this.netStatus, ...this.netAddrs.map((a) => `FRIENDS OPEN  http://${a}`)].filter(Boolean);
    if (lines.length) {
      const pw = cw * 2 + gap;
      const sy = cy + ch + 16;
      const sh = 10 + lines.length * 9;
      parchment(ctx, x0, sy, pw, sh);
      lines.forEach((l, j) => drawPlain(ctx, l, W / 2 - textWidth(l, 0.58) / 2, sy + 5 + j * 9, j === 0 && this.netBusy && Math.floor(now * 2) % 2 ? "#8a1810" : BROWN, 0.58));
    }
    const p: [string, string][] = this.netBusy ? [["B", "CANCEL"]] : [["A", "SELECT"], ["B", "BACK"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }

  private drawPlayers(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    artTitle(ctx, "!PLAYERS", "PLAYERS", W / 2, 3, 14);
    const devs = this.devices();
    const cw = Math.min(86, Math.floor((W - 40) / 4) - 6);
    const gap = 6;
    const x0 = Math.round((W - (cw * 4 + gap * 3)) / 2);
    const y0 = 26;
    const ch = 96;
    const SEAT = ["#2a4ab8", "#b02a1c", "#2a7ab8", "#c86a1c"];
    for (let i = 0; i < 4; i++) {
      const x = x0 + i * (cw + gap);
      const sel = this.focus === i;
      const d = devs[i];
      const y = y0 - (sel ? 2 : 0);
      plank(ctx, x, y, cw, ch, d ? "#8a6040" : "#5a4430");
      if (sel) {
        ctx.strokeStyle = "#f0c030";
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 2.5, y - 2.5, cw + 5, ch + 5);
      }
      waxSeal(ctx, x + cw / 2, y + 18, 11, d ? SEAT[i] : "#4a4038", "combo");
      paintedText(ctx, `P${i + 1}`, x + cw / 2, y + 13, "#fff4c8", 0.75);
      if (d) {
        const lines = wrap(d, cw - 10, 0.52).slice(0, 3);
        lines.forEach((l, j) => drawText(ctx, l, x + cw / 2 - textWidth(l, 0.52) / 2, y + 36 + j * 8, "#fff0c8", 0.52));
        const t = "A: FREE SEAT";
        drawText(ctx, t, x + cw / 2 - textWidth(t, 0.45) / 2, y + ch - 13, sel ? "#ffe070" : "#c8b898", 0.45);
      } else {
        const lines = ["EMPTY", "PRESS ANY", "BUTTON TO JOIN"];
        lines.forEach((l, j) => drawText(ctx, l, x + cw / 2 - textWidth(l, j ? 0.48 : 0.62) / 2, y + 36 + j * 9, j ? "#b8a888" : "#d8c8a8", j ? 0.48 : 0.62));
      }
      this.hit(`row:${i}`, x, y, cw, ch);
    }
    const ry = y0 + ch + 10;
    const rw = cw * 4 + gap * 3;
    const rowsY = [ry, ry + 18];
    const kbmOn = !!this.save.data.options.kbm;
    const labels: [string, string][] = [["KEYBOARD + MOUSE PLAYERS", kbmOn ? "ON" : "OFF"], ["FIND A GAMECUBE ADAPTER OR PRO CONTROLLER", "SEARCH"]];
    labels.forEach(([l, v], k) => {
      const y = rowsY[k];
      const sel = this.focus === 4 + k;
      plank(ctx, x0, y, rw, 14, sel ? "#a07448" : "#6a4a30");
      drawText(ctx, l, x0 + 8, y + 3, sel ? "#ffe890" : "#f0e4c8", 0.62);
      drawText(ctx, v, x0 + rw - 8 - textWidth(v, 0.68), y + 3, v === "OFF" ? "#ff9070" : "#c8ffa0", 0.68);
      this.hit(`row:${4 + k}`, x0, y, rw, 14);
    });
    const hint = "PLAYERS HERE PLAY FROM THIS MACHINE · ONLINE, EVERY ONE OF THEM TAKES A SEAT";
    shadowText(ctx, hint, W / 2 - textWidth(hint, 0.5) / 2, rowsY[1] + 20, "#f0e4c8", 0.5);
    void now;
    const p: [string, string][] = [["A", this.focus < 4 ? "FREE SEAT" : "CHANGE"], ["B", "BACK"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }

  private drawBrowse(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    artTitle(ctx, "!BATTLES ON THIS SERVER", "BATTLES ON THIS SERVER", W / 2, 3, 14);
    const px = 14;
    const py = 26;
    const pw = W - 28;
    const ph = H - 52;
    parchment(ctx, px, py, pw, ph);
    const rh = 22;
    const head = (t: string, x: number, right = false) => drawPlain(ctx, t, right ? x - textWidth(t, 0.55, true) : x, py + 6, "#8a5a2a", 0.55, true);
    const c = { name: px + 34, mode: px + pw * 0.52, map: px + pw * 0.64, seats: px + pw - 64, state: px + pw - 10 };
    head("BATTLE", c.name);
    head("MODE", c.mode);
    head("FIELD", c.map);
    head("SEATS", c.seats, true);
    head("STATE", c.state, true);
    band(ctx, px + 6, py + 15, pw - 12, 1, "#6a4424", 0.5);
    const vis = Math.floor((ph - 30) / rh);
    const n = this.rooms.length + 1;
    if (this.focus < this.scrollTop) this.scrollTop = this.focus;
    if (this.focus >= this.scrollTop + vis) this.scrollTop = this.focus - vis + 1;
    for (let k = this.scrollTop; k < Math.min(n, this.scrollTop + vis); k++) {
      const y = py + 20 + (k - this.scrollTop) * rh;
      const sel = k === this.focus;
      this.hit(`row:${k}`, px + 4, y, pw - 8, rh - 2);
      if (sel) {
        ctx.fillStyle = INK;
        ctx.fillRect(px + 5, y - 1, pw - 10, rh);
        texturedRect(ctx, "banner", px + 6, y, pw - 12, rh - 2, "#a8301c", 0, 0.5);
      }
      const ink = (col: string) => (sel ? LIGHT : col);
      if (k === 0) {
        waxSeal(ctx, px + 19, y + 10, 7, "#a8141a", "dash");
        drawPlain(ctx, "QUICK JOIN", c.name, y + 3, ink(BROWN), 0.85, true);
        drawPlain(ctx, "TAKE THE FIRST OPEN SEAT ON THE SERVER", c.name, y + 13, ink("#6a4424"), 0.5, true);
        continue;
      }
      const r = this.rooms[k - 1];
      const open = r.phase === "lobby" && r.humans < r.seats;
      waxSeal(ctx, px + 19, y + 10, 7, open ? "#2a7a20" : "#6a6058", open ? "banner" : "castle");
      const nm = r.name.length > 20 ? r.name.slice(0, 20) : r.name;
      drawPlain(ctx, nm, c.name, y + 3, ink(BROWN), 0.8, true);
      const age = r.age < 60 ? `OPENED ${r.age}S AGO` : `OPENED ${Math.floor(r.age / 60)} MIN AGO`;
      drawPlain(ctx, age, c.name, y + 13, ink("#8a5a2a"), 0.45, true);
      drawPlain(ctx, r.mode, c.mode, y + 6, ink(BROWN), 0.6, true);
      const map = (r.map || "-").replace(/^GRUDGE\w*\s*/, "");
      drawPlain(ctx, map.slice(0, 14), c.map, y + 6, ink(BROWN), 0.6, true);
      num(ctx, `${r.humans} / ${r.seats}`, c.seats, y + 5, ink(open ? "#2a6a18" : "#8a1810"), 0.75);
      const st = r.phase === "match" ? "FIGHTING" : r.humans >= r.seats ? "FULL" : "OPEN";
      num(ctx, st, c.state, y + 5, ink(st === "OPEN" ? "#2a6a18" : "#8a1810"), 0.65);
    }
    if (!this.rooms.length) {
      const t = this.roomsError || "NO BATTLES YET · GO BACK AND HOST ONE";
      drawPlain(ctx, t, W / 2 - textWidth(t, 0.7, true) / 2, py + ph / 2, "#6a4424", 0.7, true);
    }
    const t = this.netBusy ? this.netStatus : `REFRESHES BY ITSELF · ${this.rooms.length} BATTLE${this.rooms.length === 1 ? "" : "S"}`;
    drawPlain(ctx, t, px + pw - 8 - textWidth(t, 0.48, true), py + ph - 10, this.netBusy && Math.floor(now * 2) % 2 ? "#8a1810" : "#8a5a2a", 0.48, true);
    const p: [string, string][] = this.netBusy ? [["B", "CANCEL"]] : [["A", "JOIN"], ["B", "BACK"]];
    prompt(ctx, Math.round((W - promptWidth(p, 0.7)) / 2), H - 13, p, 0.7);
  }

  private drawRows(ctx: CanvasRenderingContext2D, W: number, H: number, art: string, fallback: string, rows: Row<object>[], obj: object, extra: string[]): void {
    artTitle(ctx, art, fallback, W / 2, 3, 14);
    const pw = Math.min(300, W - 40);
    const px = Math.round((W - pw) / 2);
    const py = 28;
    const total = rows.length + extra.length;
    const rh = Math.min(20, Math.floor((H - 24 - py - 40) / total));
    const ph = total * rh + 40;
    parchment(ctx, px, py, pw, ph);
    const vx = px + pw - 58;
    for (let k = 0; k < total; k++) {
      const y = py + 8 + k * rh + (k >= rows.length ? 4 : 0);
      const sel = k === this.focus;
      if (sel) {
        ctx.fillStyle = INK;
        ctx.fillRect(px + 5, y - 1, pw - 10, rh - 1);
        texturedRect(ctx, "cloth", px + 6, y, pw - 12, rh - 3, "#a8301c", 0, 0.6);
      }
      this.hit(`row:${k}`, px + 4, y - 1, pw - 8, rh);
      if (k < rows.length) {
        const r = rows[k];
        const ty = y + (rh - 3) / 2 - 4.5;
        drawPlain(ctx, r.label, px + 14, ty, sel ? LIGHT : BROWN, 0.9, true);
        const v = r.fmt((obj as Record<string, number>)[r.key as string]);
        drawPlain(ctx, v, vx - textWidth(v, 0.9, true) / 2, ty, sel ? "#ffe890" : "#6a1c10", 0.9, true);
        if (sel) {
          goldArrow(ctx, vx - 36, y + (rh - 3) / 2, -1, 4.5);
          goldArrow(ctx, vx + 36, y + (rh - 3) / 2, 1, 4.5);
        }
        this.hit(`dec:${k}`, vx - 42, y - 1, 18, rh);
        this.hit(`inc:${k}`, vx + 24, y - 1, 18, rh);
      } else {
        const t = extra[k - rows.length];
        drawPlain(ctx, t, px + pw / 2 - textWidth(t, 0.8, true) / 2, y + (rh - 3) / 2 - 4, sel ? LIGHT : "#6a4424", 0.8, true);
      }
    }
    const f = this.focus;
    const blurb =
      f < rows.length ? rows[f].blurb
      : f === rows.length ? "PUT EVERYTHING BACK AS IT WAS."
      : this.confirm === "erase" ? "PRESS A AGAIN TO BURN EVERY RECORD. NAMES ARE KEPT."
      : this.confirm === "erased" ? "THE RECORDS ARE ASHES."
      : "FORGET EVERY WIN, LOSS AND MATCH.";
    drawPlain(ctx, blurb, px + pw / 2 - textWidth(blurb, 0.7) / 2, py + ph - 15, this.confirm === "erase" ? "#a01810" : "#5a3a1c", 0.7);
    const p: [string, string][] = [["A", "CHANGE"], ["B", "DONE"]];
    const hint = "STICK LEFT / RIGHT: CHANGE";
    const pwid = promptWidth(p, 0.7) + 14 + textWidth(hint, 0.6);
    const x0 = Math.round((W - pwid) / 2);
    shadowText(ctx, hint, x0, H - 12, "#f0e4c8", 0.6);
    prompt(ctx, x0 + textWidth(hint, 0.6) + 14, H - 13, p, 0.7);
  }

  private drawRecords(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    artTitle(ctx, "t_records", "HALL OF GRUDGES", W / 2, 3, 14);
    const tw = 78;
    TABS.forEach((t, k) => {
      const cx = W / 2 + (k - 1) * (tw + 18);
      const sel = k === this.tab;
      ribbon(ctx, cx, sel ? 23 : 21, tw, 10, t, 0.55, sel ? "#a01810" : "#6a4a2a");
      this.hit(`tab:${k}`, cx - tw / 2 - 4, 20, tw + 8, 14);
    });
    const px = 14;
    const py = 38;
    const pw = W - 28;
    const ph = H - 64;
    parchment(ctx, px, py, pw, ph);
    const rh = 17;
    const vis = Math.floor((ph - 24) / rh);
    const n = this.rowCount();
    if (this.focus < this.scrollTop) this.scrollTop = this.focus;
    if (this.focus >= this.scrollTop + vis) this.scrollTop = this.focus - vis + 1;
    const col = (f: number) => Math.round(px + pw * f);
    const TS = 0.85;
    const head = (cols: [string, number, boolean][]) => {
      for (const [t, x, left] of cols) drawPlain(ctx, t, left ? x : x - textWidth(t, 0.6, true), py + 6, "#8a5a2a", 0.6, true);
      band(ctx, px + 6, py + 16, pw - 12, 1, "#6a4424", 0.5);
    };
    const rowY = (k: number) => py + 24 + (k - this.scrollTop) * rh;
    const rowBg = (k: number, y: number) => {
      this.hit(`row:${k}`, px + 4, y - 3, pw - 8, rh);
      if (k !== this.focus) return;
      ctx.fillStyle = INK;
      ctx.fillRect(px + 5, y - 4, pw - 10, rh);
      texturedRect(ctx, "banner", px + 6, y - 3, pw - 12, rh - 2, "#a8301c", 0, 0.5);
    };
    const ink = (k: number, c = BROWN) => (k === this.focus ? LIGHT : c);
    const icon = (type: string, x: number, y: number, s = 15) => {
      const im = this.portraits?.icon(type);
      if (im) ctx.drawImage(im, x, y - 4, s, s);
    };
    if (this.tab === 0) {
      const c = [col(0.5), col(0.6), col(0.7), col(0.8), col(0.94)];
      head([["CHAMPION", px + 34, true], ["PICKS", c[0], false], ["WON", c[1], false], ["LOST", c[2], false], ["DRAWN", c[3], false], ["WIN RATE", c[4], false]]);
      this.roster.forEach((type, k) => {
        if (k < this.scrollTop || k >= this.scrollTop + vis) return;
        const y = rowY(k);
        rowBg(k, y);
        const s = this.save.data.heroes[type] ?? { picks: 0, w: 0, l: 0, d: 0 };
        icon(type, px + 12, y);
        drawPlain(ctx, (this.heroNames[type] ?? type).toUpperCase(), px + 34, y, ink(k), TS, true);
        [s.picks, s.w, s.l, s.d].forEach((v, j) => num(ctx, v, c[j], y, ink(k), TS));
        num(ctx, winRate(s), c[4], y, ink(k, "#8a1810"), TS);
      });
    } else if (this.tab === 1) {
      const names = this.save.tagNames();
      const c = [col(0.42), col(0.52), col(0.62), col(0.75), col(0.8)];
      head([["NAME", px + 34, true], ["WON", c[0], false], ["LOST", c[1], false], ["DRAWN", c[2], false], ["WIN RATE", c[3], false], ["FAVOURITE", c[4], true]]);
      if (!names.length) this.empty(ctx, W, py + ph / 2 - 8, "NO NAMES SIGNED YET.", "CLICK YOUR P-NUMBER ON THE CHAMPION BANNER TO SIGN ONE.");
      names.forEach((name, k) => {
        if (k < this.scrollTop || k >= this.scrollTop + vis) return;
        const y = rowY(k);
        rowBg(k, y);
        const t = this.save.data.tags[name];
        waxSeal(ctx, px + 19, y + 3.5, 5.5, "#a8141a", "combo");
        drawPlain(ctx, name, px + 34, y, ink(k), TS, true);
        [t.w, t.l, t.d].forEach((v, j) => num(ctx, v, c[j], y, ink(k), TS));
        num(ctx, winRate(t), c[3], y, ink(k, "#8a1810"), TS);
        const fav = Object.entries(t.heroes).sort((a, b) => b[1].w + b[1].l + b[1].d - (a[1].w + a[1].l + a[1].d))[0];
        if (fav) {
          icon(fav[0], c[4], y);
          drawPlain(ctx, (this.heroNames[fav[0]] ?? fav[0]).toUpperCase(), c[4] + 18, y + 1, ink(k, "#4a3018"), 0.7, true);
        }
      });
    } else {
      const log = this.save.data.log;
      head([["DAY", px + 10, true], ["BLUE HOUSE", px + 50, true], ["RED HOUSE", col(0.42), true], ["FIELD", col(0.7), true], ["VICTOR", col(0.97), false]]);
      if (!log.length) this.empty(ctx, W, py + ph / 2 - 8, "NO GRUDGES SETTLED YET.", "FINISH A MATCH TO WRITE THE FIRST PAGE.");
      log.forEach((m, k) => {
        if (k < this.scrollTop || k >= this.scrollTop + vis) return;
        const y = rowY(k);
        rowBg(k, y);
        drawPlain(ctx, dateOf(m.at), px + 10, y + 1, ink(k, "#8a5a2a"), 0.7, true);
        for (const team of [0, 1]) {
          let x = team ? col(0.42) : px + 50;
          for (const p of m.players.filter((q) => q.team === team)) {
            icon(p.hero, x, y, 14);
            x += 15;
            const nm = p.cpu ? "CPU" : p.tag ?? "-";
            drawPlain(ctx, nm, x, y + 1, k === this.focus ? LIGHT : TEAM_TEXT[team], 0.72, true);
            x += textWidth(nm, 0.72, true) + 8;
          }
        }
        const mm = `${Math.floor(m.secs / 60)}:${String(Math.floor(m.secs % 60)).padStart(2, "0")}`;
        drawPlain(ctx, `${(this.mapNames[m.map] ?? m.map).toUpperCase().replace(/^GRUDGE\w*\s*/, "")}  ${mm}`, col(0.7), y + 1, ink(k, "#6a4424"), 0.68, true);
        const res = m.winner < 0 ? "DRAW" : m.winner === 0 ? "BLUE" : "RED";
        num(ctx, res, col(0.97), y, k === this.focus ? LIGHT : m.winner < 0 ? BROWN : TEAM_TEXT[m.winner], TS);
      });
    }
    if (n > vis) {
      const t = `${this.scrollTop + 1}-${Math.min(n, this.scrollTop + vis)} OF ${n}`;
      drawPlain(ctx, t, px + pw - 8 - textWidth(t, 0.5, true), py + ph - 10, "#8a5a2a", 0.5, true);
    }
    const p: [string, string][] = [["B", "DONE"]];
    if (this.tab === 1 && this.save.tagNames().length) p.unshift(["Y", this.confirm.startsWith("strike:") ? "AGAIN TO STRIKE" : "STRIKE NAME"]);
    const hint = "STICK LEFT / RIGHT: PAGE";
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

  openTag(slot: number): void {
    this.tagSlot = slot;
    this.tagMode = "list";
    this.tagText = "";
  }

  tagAction(id: string): { done: boolean; tag?: string | null } {
    if (id === "tg:new") {
      this.tagMode = "type";
      this.tagText = "";
    } else if (id === "tg:none") return this.closeTag(null);
    else if (id.startsWith("tg:pick:")) return this.closeTag(this.save.addTag(id.slice(8)));
    else if (id.startsWith("tg:key:")) this.typeKey(id.slice(7));
    else if (id === "tg:del") this.tagText = this.tagText.slice(0, -1);
    else if (id === "tg:ok") return this.tagText.trim() ? this.closeTag(this.save.addTag(this.tagText)) : this.tagBack();
    return { done: false };
  }

  typeKey(k: string): void {
    if (this.tagText.length < MAX_TAG) this.tagText += k;
  }

  tagBack(): { done: boolean; tag?: string | null } {
    if (this.tagMode === "type") {
      this.tagMode = "list";
      return { done: false };
    }
    this.tagSlot = -1;
    return { done: true };
  }

  private closeTag(tag: string | null): { done: boolean; tag?: string | null } {
    this.tagSlot = -1;
    this.tagMode = "list";
    return { done: true, tag };
  }

  drawTag(ctx: CanvasRenderingContext2D, W: number, H: number, cursors: MenuCursors, now: number): void {
    if (this.tagSlot < 0) return;
    cursors.hits = [];
    const hot = (id: string) => cursors.cursors.some((c) => c.active && c.hover === id);
    band(ctx, 0, 0, W, H, "#000000", 0.5);
    const pw = 270;
    const ph = 176;
    const px = Math.round((W - pw) / 2);
    const py = 30;
    occlude(ctx, px, py, pw, ph, 0.5);
    parchment(ctx, px, py, pw, ph);
    ribbon(ctx, W / 2, py + 6, 150, 15, "SIGN YOUR NAME", 0.9, BROWN, nameImage("t_tag"));
    waxSeal(ctx, px + 18, py + 14, 10, ["#2a4ad0", "#c82818", "#3a90e0", "#e07020"][this.tagSlot] ?? "#a8141a", "combo");
    drawPlain(ctx, `P${this.tagSlot + 1}`, px + 18 - textWidth(`P${this.tagSlot + 1}`, 0.55, true) / 2, py + 11, "#f8f0dc", 0.55, true);
    const push = (id: string, x: number, y: number, w: number, h: number) => cursors.hits.push({ id, x, y, w, h });
    if (this.tagMode === "list") {
      const names = this.save.tagNames().slice(0, 10);
      const all = [...names.map((n) => [`tg:pick:${n}`, n]), ["tg:new", "NEW NAME"], ["tg:none", "NO NAME"]];
      all.forEach(([id, label], k) => {
        const col = k % 2;
        const row = Math.floor(k / 2);
        const cx = px + pw / 2 + (col ? 62 : -62);
        const y = py + 34 + row * 22;
        const special = id === "tg:new" || id === "tg:none";
        ribbon(ctx, cx, y, 104, 14, label, 0.85, hot(id) ? "#a01810" : special ? "#6a4a2a" : BROWN);
        push(id, cx - 58, y - 2, 116, 19);
      });
      const t = "B: BACK";
      drawPlain(ctx, t, px + pw / 2 - textWidth(t, 0.55) / 2, py + ph - 12, "#6a4424", 0.55);
      return;
    }
    const sw = 150;
    scroll(ctx, W / 2, py + 27, sw, 20);
    const shown = this.tagText + (this.tagText.length < MAX_TAG && Math.floor(now * 2.5) % 2 ? "_" : "");
    drawPlain(ctx, shown, W / 2 - textWidth(this.tagText + "_", 1.1, true) / 2, py + 31, BROWN, 1.1, true);
    const cols = 10;
    const tw = 19;
    const th = 17;
    const gx = W / 2 - (cols * (tw + 4) - 4) / 2;
    const gy = py + 56;
    KEYS.forEach((k, i) => {
      const x = gx + (i % cols) * (tw + 4);
      const y = gy + Math.floor(i / cols) * (th + 4);
      stoneTile(ctx, x, y, tw, th, k, hot(`tg:key:${k}`));
      push(`tg:key:${k}`, x - 1, y - 1, tw + 2, th + 2);
    });
    const ly = gy + 3 * (th + 4);
    const lx = gx + 7 * (tw + 4);
    stoneTile(ctx, lx, ly, tw * 1.5, th, "DEL", hot("tg:del"));
    push("tg:del", lx, ly, tw * 1.5, th);
    stoneTile(ctx, lx + tw * 1.5 + 4, ly, tw * 1.5, th, "END", hot("tg:ok"));
    push("tg:ok", lx + tw * 1.5 + 4, ly, tw * 1.5, th);
    const t = "TYPE ON A KEYBOARD, OR PRESS A ON THE STONES  ·  B: BACK";
    drawPlain(ctx, t, px + pw / 2 - textWidth(t, 0.48) / 2, py + ph - 11, "#6a4424", 0.48);
  }
}

const PAD_ROWS: [string, string][] = [
  ["STICK", "MOVE"], ["A", "ATTACK · HOLD TO CHARGE A HEAVY HIT · WITH A BOMB: THROW"], ["B", "SECONDARY · HOLD TO CHARGE (LEAP, HEX, BANNER: HOLD TO AIM)"], ["R", "SPECIAL · HOLD TO AIM WHERE IT LANDS"], ["Z", "SUPER WHEN THE METER IS FULL · HOLD TO AIM"],
  ["L", "BLOCK · L+A SHOVE · L+X DODGE"], ["C", "ORDERS: UP ATTACK · LEFT FOLLOW · RIGHT DEFEND · DOWN HOLD · LEVEL UP: LEFT / RIGHT LEARNS"],
  ["X", "AT A PAD: OUTPOSTS · THEY SEND TROOPS FOR GOLD"], ["Y", "AT A PAD: TOWERS · AT THE KEEP: SHOP · ELSEWHERE: RECALL HOME (ONCE PER LIFE)"], ["D-PAD", "LEFT / RIGHT: WHO OBEYS · UP / DOWN: ZOOM"], ["START", "PAUSE"], ["ARMY", "GRUNTS BEAT BRUTES · ARCHERS BEAT GRUNTS · BRUTES BEAT ARCHERS"],
];
const KEY_ROWS: [string, string][] = [
  ["WASD", "MOVE"], ["E", "ATTACK · HOLD TO CHARGE"], ["Q", "SECONDARY · HOLD TO CHARGE"], ["X", "SPECIAL · HOLD + WASD TO AIM"], ["C", "SUPER · HOLD + WASD TO AIM"], ["Z", "BLOCK · Z + E: SHOVE"], ["SPACE", "DODGE"],
  ["F / L-MOUSE", "OUTPOSTS AT A PAD"], ["R / R-MOUSE", "TOWERS AT A PAD · SHOP AT THE KEEP · ELSEWHERE: RECALL"], ["ARROWS", "ORDERS · LEFT / RIGHT LEARNS ON LEVEL UP"], ["3 / 4", "WHO OBEYS"], ["1 / 2", "ZOOM"], ["ENTER", "PAUSE"],
];

export function drawControlSheet(ctx: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number): void {
  parchment(ctx, px, py, pw, ph);
  const colW = Math.floor(pw / 2);
  const S = 0.55;
  const LH = 7.5;
  drawPlain(ctx, "CONTROLLER", px + 12, py + 7, "#8a1810", 0.7, true);
  drawPlain(ctx, "KEYBOARD AND MOUSE", px + colW + 10, py + 7, "#8a1810", 0.7, true);
  band(ctx, px + colW, py + 8, 1, ph - 16, "#6a4424", 0.4);
  const fit = (rows: [string, string][], textX: number, maxW: number): { lines: string[]; h: number }[] => rows.map(([, v]) => {
    const lines = wrap(v, maxW, S);
    return { lines, h: Math.max(10, lines.length * LH + 3) };
  });
  const padText = px + 34;
  const pl = fit(PAD_ROWS, padText, colW - 42);
  const padTotal = pl.reduce((a, r) => a + r.h, 0);
  let y = py + 19 + Math.max(0, (ph - 26 - padTotal) / (PAD_ROWS.length * 2));
  const padGap = Math.max(0, (ph - 26 - padTotal) / PAD_ROWS.length);
  PAD_ROWS.forEach(([k], i) => {
    const col = k === "A" ? PAD.a : k === "B" ? PAD.b : k === "C" || k === "X" || k === "Y" ? PAD.c : k === "Z" || k === "R" || k === "L" ? PAD.z : k === "START" ? PAD.start : "";
    if (col) padButton(ctx, px + 20, y + 3.5, 4.4, col, k === "START" ? "S" : k);
    else drawPlain(ctx, k, px + 20 - textWidth(k, 0.48, true) / 2, y + 1, "#6a4424", 0.48, true);
    pl[i].lines.forEach((l, j) => drawPlain(ctx, l, padText, y + j * LH, BROWN, S, true));
    y += pl[i].h + padGap;
  });
  const keyX = px + colW + 10;
  const keyW = 62;
  const kl = fit(KEY_ROWS, keyX + keyW, colW - keyW - 18);
  const keyTotal = kl.reduce((a, r) => a + r.h, 0);
  const keyGap = Math.max(0, (ph - 26 - keyTotal) / KEY_ROWS.length);
  y = py + 19 + keyGap / 2;
  KEY_ROWS.forEach(([k], i) => {
    drawPlain(ctx, k, keyX, y, "#6a1c10", 0.5, true);
    kl[i].lines.forEach((l, j) => drawPlain(ctx, l, keyX + keyW, y + j * LH, BROWN, S, true));
    y += kl[i].h + keyGap;
  });
}
