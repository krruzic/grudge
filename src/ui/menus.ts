import { drawPlain, drawText, occlude, onHiLayer, textWidth } from "./font";
import { artTitle, band, banner, beam, drawLogo, goldArrow, nameImage, paintedText, parchment, ribbon, scroll, shadowText, texturedRect, wall, waxSeal, woodFloor } from "./n64ui";
import { padButton, PAD } from "./hud";
import { prompt, promptWidth, wrap } from "./screens";
import type { Hit, MenuCursors } from "./cursor";
import type { Portraits } from "./portraits";
import { DEFAULT_OPTIONS, DEFAULT_RULES, MAX_TAG, OPTION_ROWS, RULE_ROWS, cycle, winRate, type Row, type Save } from "../game/save";

export type Page = "main" | "network" | "rules" | "options" | "records" | "controls";
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
export type MenuResult = "fight" | "title" | "options" | "host" | "join" | "leave" | null;

const INK = "#0b0806";
const BROWN = "#3a2410";
const LIGHT = "#f8e8c0";
const TEAM_TEXT = ["#1c3aa8", "#a81c1c"];
const ITEMS = [
  { art: "m_fight", label: "FIGHT", blurb: "CHOOSE CHAMPIONS AND SETTLE A GRUDGE. ONE AGAINST ONE, OR TWO AGAINST TWO WITH COMMANDERS." },
  { art: "m_network", label: "VERSUS ONLINE", blurb: "PLAY OVER THE HOUSE NETWORK. ONE MACHINE HOSTS, FRIENDS OPEN ITS PAGE AND JOIN." },
  { art: "m_rules", label: "RULES", blurb: "SET THE TERMS OF COMBAT: TIME, GOLD, SOLDIERS AND MERCY." },
  { art: "m_records", label: "RECORDS", blurb: "EVERY VICTORY AND DEFEAT, WRITTEN DOWN BY NAME AND BY CHAMPION." },
  { art: "m_options", label: "OPTIONS", blurb: "MUSIC, SOUND, SCREEN SHAKE AND BUTTON HINTS." },
  { art: "m_controls", label: "CONTROLS", blurb: "HOW TO FIGHT, BUILD AND COMMAND YOUR ARMY." },
];
const PAGES: Page[] = ["main", "network", "rules", "records", "options", "controls"];
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
  const w = (im.naturalWidth / im.naturalHeight) * h;
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

export class Menus {
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
    if (this.page === "network") return 2;
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
    if (nav.dy && n) {
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
      if (this.page === "network" && this.netBusy) {
        this.netBusy = false;
        return "leave";
      }
      if (this.page === "main") return "title";
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
      if (act === "a" && !this.netBusy) {
        sound("ok");
        return this.focus === 0 ? "host" : "join";
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
      wall(ctx, W, H);
      woodFloor(ctx, H - 22, W, H);
      beam(ctx, 4, 2, W - 8, 17);
      if (this.page === "network") this.drawNetwork(ctx, W, H, now);
      else if (this.page === "rules") this.drawRows(ctx, W, H, "t_rules", "RULES OF COMBAT", RULE_ROWS as Row<object>[], this.save.data.rules, ["RESTORE DEFAULTS"]);
      else if (this.page === "options") this.drawRows(ctx, W, H, "m_options", "OPTIONS", OPTION_ROWS as Row<object>[], this.save.data.options, ["RESTORE DEFAULTS", "ERASE ALL RECORDS"]);
      else if (this.page === "records") this.drawRecords(ctx, W, H);
      else this.drawControls(ctx, W, H);
    }
  }

  private drawMain(ctx: CanvasRenderingContext2D, W: number, H: number, _now: number): void {
    band(ctx, 0, 0, W, H, "#000000", 0.25);
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
  }

  netStatus = "";
  netBusy = false;
  netAddrs: string[] = [];

  private drawNetwork(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    artTitle(ctx, "m_network", "VERSUS ONLINE", W / 2, 3, 14);
    const pw = Math.min(260, W - 40);
    const px = Math.round((W - pw) / 2);
    const py = 30;
    const opts: [string, string, string][] = [
      ["t_host", "HOST A BATTLE", "THIS MACHINE RUNS THE MATCH. FRIENDS JOIN FROM THEIR OWN SCREENS."],
      ["t_join", "JOIN A BATTLE", "JOIN THE MACHINE THAT SERVED THIS PAGE. YOU WILL SEE ITS RULES BEFORE THE FIGHT."],
    ];
    opts.forEach(([art, label, blurb], k) => {
      const y = py + k * 46;
      const hot = k === this.focus;
      band(ctx, px + 2, y + 2, pw, 40, INK, 0.4);
      ctx.fillStyle = INK;
      ctx.fillRect(px - 1, y - 1, pw + 2, 42);
      texturedRect(ctx, "stone", px, y, pw, 40, hot ? "#e8c070" : "#9a9080", 0, 0.5);
      artWord(ctx, art, label, W / 2 + (hot ? 3 : 0), y + 4, hot ? 17 : 15, hot ? 1 : 0.7);
      if (hot) goldArrow(ctx, px + 12, y + 12, 1, 5);
      wrap(blurb, pw - 24, 0.52).slice(0, 2).forEach((l, j) => drawText(ctx, l, W / 2 - textWidth(l, 0.52) / 2, y + 23 + j * 7, hot ? "#fff0c8" : "#d8ccb0", 0.52));
      this.hit(`row:${k}`, px, y, pw, 40);
    });
    const sy = py + 96;
    const lines = [this.netStatus, ...this.netAddrs.map((a) => `FRIENDS OPEN  http://${a}`)].filter(Boolean);
    if (lines.length) {
      const sh = 12 + lines.length * 9;
      parchment(ctx, px, sy, pw, sh);
      lines.forEach((l, j) => drawPlain(ctx, l, W / 2 - textWidth(l, 0.58) / 2, sy + 6 + j * 9, j === 0 && this.netBusy && Math.floor(now * 2) % 2 ? "#8a1810" : BROWN, 0.58));
    }
    const p: [string, string][] = this.netBusy ? [["B", "CANCEL"]] : [["A", "SELECT"], ["B", "BACK"]];
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
    const px = 14;
    const py = 26;
    const pw = W - 28;
    const ph = H - 52;
    parchment(ctx, px, py, pw, ph);
    const pad: [string, string][] = [
      ["STICK", "MOVE"], ["A", "ATTACK · HOLDING A BOMB: THROW"], ["B", "SECONDARY"], ["R", "SPECIAL"], ["Z", "SUPER (FULL METER)"],
      ["L", "BLOCK · L+A SHOVE · L+X DODGE"], ["C", "ORDERS: UP ATTACK · LEFT FOLLOW · RIGHT DEFEND · DOWN HOLD"],
      ["X", "CALL 3 TROOPS · AT PAD: OUTPOSTS"], ["Y", "AT PAD: TOWERS · AT KEEP: SHOP"], ["D-PAD", "LEFT/RIGHT: WHO OBEYS (ALL, GRUNTS, ARCHERS, BRUTES) · UP/DOWN: ZOOM"], ["START", "PAUSE"],
    ];
    const keys: [string, string][] = [
      ["WASD", "MOVE"], ["E", "ATTACK"], ["Q", "SECONDARY"], ["X", "SPECIAL"], ["C", "SUPER"], ["Z", "BLOCK · Z + E: SHOVE"], ["SPACE", "DODGE"],
      ["F / L-MOUSE", "CALL TROOPS · OUTPOSTS AT PAD"], ["R / R-MOUSE", "TOWERS AT PAD · SHOP AT KEEP"], ["ARROWS / R-DRAG", "ORDERS"], ["3 / 4", "WHO OBEYS"], ["1 / 2", "ZOOM"], ["ENTER", "PAUSE"],
    ];
    const colW = pw / 2;
    drawPlain(ctx, "CONTROLLER", px + 12, py + 7, "#8a1810", 0.7, true);
    drawPlain(ctx, "KEYBOARD AND MOUSE", px + colW + 8, py + 7, "#8a1810", 0.7, true);
    band(ctx, px + colW, py + 8, 1, ph - 16, "#6a4424", 0.4);
    pad.forEach(([k, v], i) => {
      const y = py + 21 + i * 12.5;
      const col = k === "A" ? PAD.a : k === "B" ? PAD.b : k === "C" || k === "X" || k === "Y" ? PAD.c : k === "Z" || k === "R" || k === "L" ? PAD.z : k === "START" ? PAD.start : "";
      if (col) padButton(ctx, px + 22, y + 4, 4.6, col, k === "START" ? "S" : k);
      else drawPlain(ctx, k, px + 22 - textWidth(k, 0.5, true) / 2, y + 1.5, "#6a4424", 0.5, true);
      drawPlain(ctx, v, px + 36, y, BROWN, 0.6, true);
    });
    keys.forEach(([k, v], i) => {
      const y = py + 21 + i * 11.5;
      drawPlain(ctx, k, px + colW + 8, y, "#6a1c10", 0.55, true);
      drawPlain(ctx, v, px + colW + 84, y, BROWN, 0.6, true);
    });
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
