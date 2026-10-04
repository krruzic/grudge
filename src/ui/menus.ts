// Menus: the main menu and its pages (players, versus online + battle browser, codex, rules, records, options,
// controls) and the pause menu. Drawn into the UI canvas over the attract-mode world.
//
// Each frame the app calls update() with merged pad navigation (app/nav.ts) and the mouse, then draw(). Drawing
// registers mouse targets (HitList) that the next update() hit-tests, so hover / click always match what was on
// screen. update() returns a MenuResult for things the app must do (start a fight, host / join, re-apply
// options...). Page drawing lives in menus/*: pages (main, players, network, browse, controls), settings
// (rules / options), records, codexPage, pause, controls (the shared control sheet).
import type { World } from "../sim/world";
import { buildCodex, type CodexEntry } from "./codex";
import type { Portraits } from "./portraits";
import { DEFAULT_OPTIONS, DEFAULT_RULES, OPTION_ROWS, RULE_ROWS, cycle, type Row, type Save } from "../game/save";
import { beam, boardBg, woodFloor } from "./uiPaint";
import { HitList, type MenuResult, type Nav, type Page, type Pointer, type RoomInfo, type Sound } from "./menus/common";
import { drawBrowse, drawControls, drawMain, drawNetwork, drawPlayers, MAIN_ITEMS } from "./menus/pages";
import { drawSettings } from "./menus/settings";
import { drawRecords, RECORD_TABS } from "./menus/records";
import { drawCodex } from "./menus/codexPage";
import { PauseMenu, type PauseResult } from "./menus/pause";

export type { MenuResult, Nav, Page, Pointer, RoomInfo } from "./menus/common";
export { drawControlSheet } from "./menus/controls";

/** Main menu order; PAGES[i] is opened by MAIN_ITEMS[i] (FIGHT and TRAINING start select instead). */
const PAGES: Page[] = ["main", "training", "players", "network", "codex", "rules", "records", "options", "controls"];
/** PLAYERS page: 4 seat cards, then the two toggles below them. */
const PLAYER_ROWS = 6;

export class Menus {
  page: Page = "main";
  focus = 0;
  /** Records bookmark. */
  tab = 0;
  /** First visible row of scrolling lists (records, browse, codex). */
  scrollTop = 0;
  /** Two-step confirmations: "erase" / "erased" (options), "strike:<tagId>" (records). */
  confirm = "";
  readonly hits = new HitList();
  /** Last hovered mouse target. */
  private hover = "";

  // ── Data from the app ──
  portraits: Portraits | null = null;
  heroNames: Record<string, string> = {};
  roster: string[] = [];
  mapNames: Record<string, string> = {};
  /** Display name of the device in each local seat (null = empty). */
  devices: () => (string | null)[] = () => [];
  releaseSeat: (i: number) => void = () => {};
  requestDevice: () => void = () => {};

  // ── Online ──
  rooms: RoomInfo[] = [];
  /** When the room list was last requested (the app refreshes it every 2 s on the browse page). */
  roomsAt = -99;
  roomsError = "";
  /** Room picked on the browse page (null = quick join). */
  joinRoom: number | null = null;
  netStatus = "";
  /** Hosting / joining in progress: input is limited to cancel. */
  netBusy = false;
  netAddrs: string[] = [];

  // ── Codex ──
  private codex: CodexEntry[] | null = null;
  codexPage = 0;
  private codexFocus = 0;
  /** Normalised screen rect of the codex page's live window, or null when the page has none. */
  demoRect: [number, number, number, number] | null = null;
  /** Which evolution the codex demo is showing (set by the demo each loop). */
  demoPick = 0;

  // ── Pause ──
  training = false;
  currentMap = "";
  readonly pause = new PauseMenu(this);

  constructor(readonly save: Save) {}

  open(page: Page): void {
    this.page = page;
    this.focus = 0;
    this.scrollTop = 0;
    this.confirm = "";
  }

  openPause(): void {
    this.pause.open();
  }

  updatePause(nav: Nav, ptr: Pointer, sound: Sound): PauseResult {
    return this.pause.update(nav, ptr, sound);
  }

  drawPause(ctx: CanvasRenderingContext2D, W: number, H: number, _now: number, w: World): void {
    this.pause.draw(ctx, W, H, w);
  }

  /** Number of focusable rows on the current page. */
  rowCount(): number {
    if (this.page === "main") return MAIN_ITEMS.length;
    if (this.page === "players") return PLAYER_ROWS;
    if (this.page === "network") return 2;
    if (this.page === "browse") return this.rooms.length + 1;
    if (this.page === "rules") return RULE_ROWS.length + 1;
    if (this.page === "options") return OPTION_ROWS.length + 2;
    if (this.page === "codex") return this.codexEntries().length;
    if (this.page === "records")
      return this.tab === 0
        ? this.roster.length
        : this.tab === 1
          ? this.save.tagNames().length
          : this.save.data.log.length;
    return 0;
  }

  codexEntries(): CodexEntry[] {
    if (!this.codex) this.codex = buildCodex(Object.values(this.mapNames));
    return this.codex;
  }

  /** A new codex entry opens on its first page. */
  syncCodexFocus(): void {
    if (this.focus === this.codexFocus) return;
    this.codexFocus = this.focus;
    this.codexPage = 0;
  }

  /** The live demo the open codex page wants (an ability shot or a scene), or null. */
  codexDemo(): { hero: string; slot: "a" | "b" | "r" | "z"; picks: number; scene?: string } | null {
    if (this.page !== "codex" || !this.demoRect) return null;
    const e = this.codexEntries()[this.focus];
    const pg = e?.pages[Math.min(this.codexPage, e.pages.length - 1)];
    if (pg?.art.kind === "scene") return { hero: "", slot: "a", picks: 0, scene: pg.art.scene };
    if (!pg || pg.art.kind !== "shot") return null;
    return { hero: pg.art.hero, slot: pg.art.slot, picks: pg.picks?.length ?? 0 };
  }

  // ── Update ──

  update(nav: Nav, ptr: Pointer, sound: Sound): MenuResult {
    const n = this.rowCount();
    let act = "";
    let dx = nav.dx;
    if (ptr.moved || ptr.click) {
      this.hover = this.hits.at(ptr.x, ptr.y);
      const m = this.hover.match(/^(row|dec|inc):(\d+)$/);
      if (m && Number(m[2]) !== this.focus && ptr.moved) {
        this.focus = Number(m[2]);
        this.confirm = "";
        sound("move");
      }
      if (ptr.click && this.hover) act = this.hover;
    }
    if (nav.dy && n && this.page === "players") {
      // Seats are one row: down goes seats -> keyboard toggle -> device search -> seats.
      this.focus =
        nav.dy > 0 ? (this.focus < 4 ? 4 : this.focus === 4 ? 5 : 0) : this.focus < 4 ? 5 : this.focus === 5 ? 4 : 0;
      sound("move");
    } else if (nav.dy && n && this.page !== "network") {
      this.focus = (this.focus + nav.dy + n) % n;
      this.confirm = "";
      sound("move");
    }
    // Mouse clicks on arrows / bookmarks / rows become the equivalent stick or A input.
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
    if (nav.b || ptr.right || act === "back") return this.back(sound);

    switch (this.page) {
      case "main":
        return this.updateMain(act, sound);
      case "network":
        return this.updateNetwork(act, dx, sound);
      case "players":
        return this.updatePlayers(act, dx, sound);
      case "browse":
        return this.updateBrowse(act, sound);
      case "rules":
      case "options":
        return this.updateSettings(act, dx, sound);
      case "codex":
        return this.updateCodex(act, dx, sound);
      case "records":
        this.updateRecords(nav, dx, sound);
        return null;
    }
    return null;
  }

  /** B: cancel a pending connection, else go up one level (main -> title). */
  private back(sound: Sound): MenuResult {
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

  private updateMain(act: string, sound: Sound): MenuResult {
    if (act !== "a") return null;
    sound("ok");
    if (this.focus === 0) return "fight";
    if (this.focus === 1) return "training";
    this.page = PAGES[this.focus];
    this.focus = 0;
    this.tab = 0;
    this.scrollTop = 0;
    this.confirm = "";
    return null;
  }

  /** HOST (0) / JOIN (1) cards side by side. */
  private updateNetwork(act: string, dx: number, sound: Sound): MenuResult {
    if (dx && !this.netBusy) {
      const f = Math.max(0, Math.min(1, this.focus + dx));
      if (f !== this.focus) {
        this.focus = f;
        sound("move");
      }
    }
    if (act !== "a" || this.netBusy) return null;
    sound("ok");
    if (this.focus === 0) return "host";
    this.page = "browse";
    this.focus = 0;
    this.scrollTop = 0;
    this.roomsAt = -99;
    return "browse";
  }

  private updatePlayers(act: string, dx: number, sound: Sound): MenuResult {
    if (dx && this.focus < 4) {
      const f = Math.max(0, Math.min(3, this.focus + dx));
      if (f !== this.focus) {
        this.focus = f;
        sound("move");
      }
    }
    if (act !== "a") return null;
    if (this.focus < 4) {
      if (this.devices()[this.focus]) {
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
    this.requestDevice();
    sound("ok");
    return null;
  }

  /** Quick join (focus 0) or a posted room; full or running rooms refuse. */
  private updateBrowse(act: string, sound: Sound): MenuResult {
    if (act !== "a" || this.netBusy) return null;
    const r = this.focus === 0 ? null : this.rooms[this.focus - 1];
    if (r && (r.phase !== "lobby" || r.humans >= r.seats)) {
      sound("back");
      return null;
    }
    sound("ok");
    this.joinRoom = r ? r.id : null;
    return "join";
  }

  /** Rows cycle their value; then RESTORE DEFAULTS, and on options ERASE ALL RECORDS (press twice). */
  private updateSettings(act: string, dx: number, sound: Sound): MenuResult {
    const rules = this.page === "rules";
    const rows = (rules ? RULE_ROWS : OPTION_ROWS) as Row<object>[];
    const obj = (rules ? this.save.data.rules : this.save.data.options) as object;
    const result: MenuResult = rules ? null : "options";
    if (this.focus < rows.length && (dx || act === "a")) {
      cycle(obj, rows[this.focus], dx || 1);
      this.save.write();
      sound("move");
      return result;
    }
    if (act === "a" && this.focus === rows.length) {
      if (rules) Object.assign(this.save.data.rules, DEFAULT_RULES);
      else Object.assign(this.save.data.options, DEFAULT_OPTIONS);
      this.save.write();
      sound("ok");
      return result;
    }
    if (act === "a" && !rules && this.focus === rows.length + 1) {
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

  /** Left / right / A / the page arrows turn pages of the focused entry. */
  private updateCodex(act: string, dx: number, sound: Sound): MenuResult {
    const pages = this.codexEntries()[this.focus]?.pages.length ?? 1;
    this.syncCodexFocus();
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

  /** Left / right switch bookmarks; on NAMES, Y twice strikes the focused name. */
  private updateRecords(nav: Nav, dx: number, sound: Sound): void {
    if (dx) {
      this.tab = (this.tab + dx + RECORD_TABS.length) % RECORD_TABS.length;
      this.focus = 0;
      this.scrollTop = 0;
      this.confirm = "";
      sound("move");
    }
    if (this.tab !== 1 || !nav.y) return;
    const id = this.save.tagIds()[this.focus];
    if (id && this.confirm === `strike:${id}`) {
      this.save.removeTag(id);
      this.confirm = "";
      this.focus = Math.max(0, this.focus - 1);
      sound("back");
    } else if (id) {
      this.confirm = `strike:${id}`;
      sound("move");
    }
  }

  // ── Draw ──

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    this.hits.clear();
    this.demoRect = null;
    if (this.page === "main") {
      drawMain(this, ctx, W, H);
      return;
    }
    boardBg(ctx, W, H);
    woodFloor(ctx, H - 20, W, H);
    beam(ctx, 4, 2, W - 8, 17);
    if (this.page === "players") drawPlayers(this, ctx, W, H);
    else if (this.page === "network") drawNetwork(this, ctx, W, H, now);
    else if (this.page === "browse") drawBrowse(this, ctx, W, H, now);
    else if (this.page === "rules")
      drawSettings(this, ctx, W, H, "t_rules", "RULES OF COMBAT", RULE_ROWS as Row<object>[], this.save.data.rules, [
        "RESTORE DEFAULTS",
      ]);
    else if (this.page === "options")
      drawSettings(this, ctx, W, H, "m_options", "OPTIONS", OPTION_ROWS as Row<object>[], this.save.data.options, [
        "RESTORE DEFAULTS",
        "ERASE ALL RECORDS",
      ]);
    else if (this.page === "records") drawRecords(this, ctx, W, H);
    else if (this.page === "codex") drawCodex(this, ctx, W, H);
    else drawControls(ctx, W, H);
  }
}
