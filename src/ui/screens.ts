// Screens: the full-screen UI states drawn into the UI canvas - title, champion select (also the online guest
// lobby), field select and results. The pause menu backdrop is drawn by Menus.
//
// The app pushes state in every frame (set(), updateSelect(), updateMaps(), showResults(), plus public fields
// like readyBanner / naming / signing / zoomModes) and calls draw(). Select and field select register mouse
// targets into the shared menu cursors' hit list; cursor chips are drawn on top, snapped to the hero cards.
// Drawing lives in screens/*: select (+ selectArt), field, results.
import type { World } from "../sim/world";
import type { MatchMode, Rules } from "../game/save";
import type { MapData } from "../sim/terrain";
import heroJson from "../../data/heroes.json";
import { drawPlain, drawText, textWidth } from "./font";
import { prompt, promptWidth } from "./prompts";
import { boardBg, card, drawLogo, waxSeal, windowCut, woodFloor } from "./uiPaint";
import type { Portraits } from "./portraits";
import { chipColor, type MenuCursors } from "./cursor";
import type { NameEntry } from "./nameEntry";
import { center } from "./screens/common";
import { drawReadyBanner, drawSelect } from "./screens/select";
import { drawField } from "./screens/field";
import { drawResults, placing, type ResultPlayer } from "./screens/results";

/** One champion-select seat (see app/select.ts for the seat rules). */
export interface SelectSlot {
  joined: boolean;
  ready: boolean;
  hero: string;
  cpu: boolean;
  /** CPU difficulty 1-3. */
  level: number;
  /** A CPU filled in automatically, replaced by anyone who joins. */
  autoCpu?: boolean;
  tag?: string | null;
  tagId?: string | null;
  /** A pad on this machine sits here. */
  local?: boolean;
  /** Online host: waiting for a guest. */
  open?: boolean;
  costume?: string;
}

type HeroInfo = { name: string; blurb: string; abilities?: Record<string, { kind: string }> };

/** A host seat as sent to guests. `remote`: peer id seated there, 0 = the host's own pad, -1 = nobody. */
export interface LobbySlot {
  hero: string;
  level?: number;
  ready: boolean;
  cpu: boolean;
  name: string | null;
  remote: number;
  /** The guest's local pad index for that seat. */
  local?: number;
  open?: boolean;
  active: boolean;
  commander: boolean;
  cam?: number;
  costume?: string;
}

/** The host's select screen as a guest sees it. */
export interface LobbyView {
  rules: Rules;
  mode: MatchMode;
  map: string;
  phase: string;
  slots: LobbySlot[];
  /** Seats held by this guest's pads. */
  mine: number[];
  status: string;
}

type Which = "title" | "select" | "map" | "results" | "pause" | "lobby" | "none";

export class Screens {
  private which: Which = "none";
  portraits: Portraits | null = null;
  cursors: MenuCursors | null = null;

  // ── Champion select ──
  slots: SelectSlot[] = [];
  heroes: Record<string, HeroInfo> = (heroJson as unknown as { heroes: Record<string, HeroInfo> }).heroes;
  roster: string[] = [];
  mode: MatchMode = "1v1";
  /** 2v2 "partners" rule: seats 2/3 pick champions instead of playing the commander. */
  private heroPartners = false;
  /** Where each hero's card wants placed chips (filled while drawing the roster row). */
  readonly shieldAt = new Map<string, { x: number; y: number }>();
  readyBanner = false;
  /** Everyone else is ready but seats are still OPEN. */
  openHint = false;
  /** We host online (CPU cards get an "open this seat" X). */
  hosting = false;
  /** Drawing a guest lobby (set from `which` each frame). */
  peer = false;
  lobby: LobbyView | null = null;
  training = false;
  /** Saved camera mode (0 shared, 1 split) and per-seat manual zoom flags. */
  cameraMode = 1;
  zoomModes: number[] = [0, 0, 0, 0];
  /** Until when each seat's costume strip is shown (after a C-stick flick). */
  costumeShownUntil: number[] = [0, 0, 0, 0];
  /** Open name entries by seat, and mirrored remote ones ([caps, text]). */
  naming = new Map<number, NameEntry>();
  signing = new Map<number, [number, string]>();

  // ── Field select ──
  maps: MapData[] = [];
  /** Index into `pool`; pool.length = RANDOM. */
  mapIndex = 0;
  /** Map indices offered for the mode. */
  pool: number[] = [];
  fieldMode: MatchMode = "1v1";
  /** Guest watching the host pick. */
  fieldWatch = false;
  /** Online field vote: [seat, card index] for every vote in, and whole seconds left (-1 before the first). */
  votes: [number, number][] = [];
  voteLeft = -1;
  fieldNote = "";

  // ── Title ──
  adapterStatus = "";
  adapterDebug = "";

  // ── Results ──
  private results: World | null = null;
  resultPlayers: ResultPlayer[] = [];
  placing: number[] = [];

  get twoVtwo(): boolean {
    return this.mode !== "1v1";
  }

  teamOf(i: number): number {
    return this.mode === "ffa" ? i : i % 2;
  }

  /** Seat i picks a champion (not the commander). */
  championSeat(i: number): boolean {
    return i < 2 || this.mode === "ffa" || this.mode === "tdm" || (this.mode === "2v2" && this.heroPartners);
  }

  set(which: Which): void {
    this.which = which;
  }

  updateSelect(
    slots: SelectSlot[],
    heroes: Record<string, HeroInfo>,
    roster: string[],
    mode: MatchMode,
    heroPartners = false,
  ): void {
    this.heroPartners = heroPartners;
    this.slots = slots;
    this.heroes = heroes;
    this.roster = roster;
    this.mode = mode;
  }

  updateMaps(maps: MapData[], index: number, pool: number[] = maps.map((_, i) => i), mode: MatchMode = this.mode) {
    this.maps = maps;
    this.mapIndex = index;
    this.pool = pool;
    this.fieldMode = mode;
  }

  showResults(w: World, players: ResultPlayer[] = [], _names: Record<string, string> = {}, fallen: number[] = []) {
    this.results = w;
    this.resultPlayers = players;
    this.placing = placing(w, fallen);
  }

  /** Registers a mouse target for the menu cursors. */
  hit(id: string, x: number, y: number, w: number, h: number): void {
    this.cursors?.hits.push({ id, x, y, w, h });
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    if (this.which === "none") return;
    const select = this.which === "select" || (this.which === "lobby" && !!this.lobby);
    this.peer = this.which === "lobby";
    const blink = Math.floor(now * 2) % 2 === 0;
    const cursors = select || this.which === "map" ? this.cursors : null;
    if (cursors) cursors.hits = [];
    if (this.which === "title") this.drawTitle(ctx, W, H, blink);
    else if (select) drawSelect(this, ctx, W, H, blink);
    else if (this.which === "map") drawField(this, ctx, W, H);
    if (cursors) {
      // The ready banner dims the champion row; the seals stay on top of it so they can still be picked up.
      if (select && this.readyBanner) drawReadyBanner(this, ctx, W, H, blink);
      if (select) this.drawChips(cursors, ctx);
      cursors.drawCursors(ctx, now);
    }
    if (this.which === "results" && this.results) drawResults(this, ctx, W, this.results, blink);
    if ((select || this.which === "map") && this.backHold > 0) this.drawBackHold(ctx, H);
  }

  /** 0..1 progress of a held B on select / field select (bottom-left ring + label). */
  backHold = 0;

  private drawBackHold(ctx: CanvasRenderingContext2D, H: number): void {
    const x = 16;
    const y = H - 16;
    const r = 7;
    ctx.save();
    ctx.fillStyle = "rgba(14,10,8,0.8)";
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#5a4630";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#e84830";
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + this.backHold * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawText(ctx, "B", x - textWidth("B", 0.7) / 2, y - 3.5, "#ffffff", 0.7);
    const lab = this.which === "map" ? "HOLD B · BACK TO CHAMPIONS" : "HOLD B · LEAVE";
    drawText(ctx, lab, x + r + 6, y - 3.5, "#ffd0b0", 0.7);
  }

  /** Placed chips sit on their hero's card: odd seats right of centre, seats 2/3 a row lower. */
  private drawChips(cursors: MenuCursors, ctx: CanvasRenderingContext2D): void {
    const labels = this.slots.map((sl, i) =>
      !this.championSeat(i) || (!this.twoVtwo && i >= 2) ? "" : sl.cpu ? "CPU" : `${i + 1}`,
    );
    this.slots.forEach((_, i) => {
      const c = cursors.chips[i];
      const p = c.hero ? this.shieldAt.get(c.hero) : undefined;
      if (!p) return;
      c.x = p.x + (i % 2 === 0 ? -9 : 9);
      c.y = p.y + Math.floor(i / 2) * (this.mode === "tdm" ? 6 : 9);
    });
    cursors.drawChips(
      ctx,
      labels,
      this.slots.map((sl, i) => chipColor(i, sl.cpu)),
    );
  }

  private drawTitle(ctx: CanvasRenderingContext2D, W: number, H: number, blink: boolean): void {
    boardBg(ctx, W, H);
    const cw = Math.min(250, W - 60);
    const ch = 168;
    const cx = Math.round((W - cw) / 2);
    card(ctx, cx, 12, cw, ch, -0.015, "#c81818", () => {
      const iw = cw - 20;
      const ih = 100;
      windowCut(ctx, 10, 12, iw, ih);
      drawLogo(ctx, cw / 2, 18, 84);
      const t = "A FEUD TOURNAMENT. THE FALLEN RISE AGAIN.";
      drawPlain(ctx, t, cw / 2 - textWidth(t, 0.7) / 2, ih + 20, "#4a3018", 0.7);
      if (blink) {
        const it: [string, string][] = [["S", "PRESS START"]];
        prompt(ctx, Math.round(cw / 2 - promptWidth(it, 1) / 2), ih + 36, it, 1, "#4a3018");
      }
      waxSeal(ctx, cw - 18, ch - 18, 11, "#a8141a", "combo");
    });
    woodFloor(ctx, H - 34, W, H);
    center(ctx, W, "PRESS ANY BUTTON OR KEY TO JOIN  ·  CLICK ONCE FOR SOUND", H - 29, "#f0e4c8", 0.7);
    if (this.adapterStatus) center(ctx, W, this.adapterStatus, H - 19, "#e8d090", 0.62);
    if (this.adapterDebug) center(ctx, W, this.adapterDebug, H - 10, "#c8b898", 0.55);
  }
}
