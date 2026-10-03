import type { World } from "../sim/world";
import { CAMERA_NAMES, RULE_ROWS, type Row, type Rules } from "../game/save";
import { FLAG_DIRT, FLAG_GRASS, FLAG_PAVING, Kind, Terrain, type MapData } from "../sim/terrain";
import { drawNum, drawPlain, drawText, occlude, textWidth, onHiLayer } from "./font";
import { box, padButton, PAD } from "./hud";
import { abilityIcon } from "./icons";
import { artTitle, hiImage, boardBg, band, card, inset, windowCut, drawLogo, banner, beam, fieldShade, goldArrow, nameImage, paintedText, parchment, pennant, pin, plank, ribbon, rolledBanner, scroll, shadowText, shield, texturedRect, waxSeal, woodFloor, markWindow } from "./n64ui";
import type { Portraits } from "./portraits";
import { chipColor, type MenuCursors } from "./cursor";
import { talentIcon } from "./hud";
import { drawSigning, type NameEntry } from "./nameEntry";
import type { MatchMode } from "../game/save";
import heroJson from "../../data/heroes.json";
import talentData from "../../data/talents.json";

type TNode = { id: string; next?: TNode[] };
const TREES = (talentData as unknown as { heroes: Record<string, Partial<Record<"a" | "b" | "r" | "z", TNode[]>>> }).heroes;

function drawTree(ctx: CanvasRenderingContext2D, hero: string, side: "a" | "b", x: number, y: number, right: boolean, k = 1): void {
  const tree = TREES[hero];
  if (!tree) return;
  const big = Math.round(11 * k);
  const slots: ("a" | "b" | "r" | "z")[] = side === "a" ? ["r", "b"] : ["a", "z"];
  slots.forEach((slot, row) => {
    const list = tree[slot] ?? [];
    const yy = y + row * (big + 4);
    list.forEach((t, j) => talentIcon(ctx, t.id, right ? x + (1 - j) * (big + 1) : x + j * (big + 1), yy, big, false, true));
  });
}

const KIND_LABEL: Record<string, string> = {
  combo: "3-HIT COMBO", slam: "GROUND SLAM", quake: "EARTHQUAKE", warcry: "WAR CRY", shoot: "MAGIC BOLT",
  hex: "HEX BLAST", leap: "CLIFF LEAP", dash: "PIERCING DASH", stealth: "SMOKE AMBUSH", summon: "SUMMON TROOPS", gravewalk: "GRAVEWALK",
  repair: "REPAIR PULSE", turret: "DROP TURRET", ramp: "BUILD RAMP", wall: "STONE WALL", trap: "THROW TRAP", reach: "LONG ARM SLAP",
  zone: "BRAMBLE FIELD", flurry: "BLADE FLURRY", parry: "PARRY", none: "-",
};

export interface SelectSlot {
  joined: boolean;
  ready: boolean;
  hero: string;
  cpu: boolean;
  level: number;
  autoCpu?: boolean;
  tag?: string | null;
  tagId?: string | null;
  local?: boolean;
  open?: boolean;
}

type HeroInfo = { name: string; blurb: string; abilities?: Record<string, { kind: string }> };

export interface LobbySlot {
  hero: string;
  level?: number;
  ready: boolean;
  cpu: boolean;
  name: string | null;
  remote: number;
  local?: number;
  open?: boolean;
  active: boolean;
  commander: boolean;
  cam?: number;
}

export interface LobbyView {
  rules: Rules;
  mode: MatchMode;
  map: string;
  phase: string;
  slots: LobbySlot[];
  mine: number[];
  status: string;
}

function center(ctx: CanvasRenderingContext2D, W: number, s: string, y: number, color: string, scale = 1): void {
  drawText(ctx, s, Math.round((W - textWidth(s, scale)) / 2), y, color, scale);
}

function centerNum(ctx: CanvasRenderingContext2D, W: number, s: string, y: number, color: string, scale = 1): void {
  drawNum(ctx, s, Math.round((W - textWidth(s, scale, true)) / 2), y, color, scale);
}

export function prompt(ctx: CanvasRenderingContext2D, x: number, y: number, items: [string, string][], scale = 0.85): void {
  let cx = x;
  for (const [btn, label] of items) {
    const color = btn === "A" ? PAD.a : btn === "B" ? PAD.b : btn === "S" ? PAD.start : PAD.c;
    padButton(ctx, cx + 5, y + 4.5, 5, color, btn);
    cx += 13;
    drawText(ctx, label, cx, y, "#ffffff", scale);
    cx += textWidth(label, scale) + 12;
  }
}

export function promptWidth(items: [string, string][], scale = 0.85): number {
  return items.reduce((a, [, l]) => a + 13 + textWidth(l, scale) + 12, -12);
}

const TEAM_BOX = ["#1c34a8", "#a81c1c", "#1c7a2a", "#9a7410"];
const TEAM_BRIGHT = ["#4a74ff", "#ff4a3a", "#3ac85a", "#ffcf2a"];
const stageUrls = import.meta.glob("../../assets/ui/stages/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const stageArt = new Map<string, HTMLImageElement>();
for (const [path, url] of Object.entries(stageUrls)) {
  const im = new Image();
  im.src = url;
  stageArt.set(path.split("/").pop()!.replace(".jpg", ""), im);
}

const TEAM_CLOTH = ["#3a58e0", "#d83828", "#d8a818", "#2a9a40"];
const TEAM_TEXT_R = ["#1c3aa8", "#a81c1c", "#8a6000", "#1a6a24"];
const BROWN_S = "#3a2410";
const TEAM_FIELD = ["#4a64d8", "#c83a2a", "#c8a020", "#2a9a40"];
const PLACE = ["1ST", "2ND", "3RD", "4TH"];
const MODE_NAME: Record<MatchMode, string> = { "1v1": "1 VS 1", "2v2": "2 VS 2", ffa: "FREE FOR ALL" };
const INK = "#0b0806";
const BTN = { a: PAD.a, b: PAD.b, r: PAD.z, z: PAD.z };




function mapPreview(d: MapData): HTMLCanvasElement {
  const t = new Terrain(d);
  const S = 4;
  const c = document.createElement("canvas");
  c.width = t.width * S;
  c.height = t.depth * S;
  const ctx = c.getContext("2d")!;
  for (let z = 0; z < t.depth; z++) {
    for (let x = 0; x < t.width; x++) {
      const i = t.index(x, z);
      const k = t.kinds[i];
      const st = t.styles[i];
      const h = t.groundHeight(x + 0.5, z + 0.5);
      let col: [number, number, number];
      if (k === Kind.Wall) col = st === "pit" ? [8, 8, 12] : st === "rim" ? [40, 60, 34] : st === "castle" ? [120, 112, 100] : [96, 100, 84];
      else if (k === Kind.Water) col = [40, 96, 176];
      else if (k === Kind.Ford) col = [72, 128, 196];
      else if (k === Kind.Bridge) col = [140, 104, 64];
      else if (k === Kind.Prop) col = [52, 84, 40];
      else if (t.hasFlag(x, z, FLAG_PAVING)) col = [150, 148, 140];
      else if (t.hasFlag(x, z, FLAG_DIRT)) col = [150, 112, 72];
      else if (t.hasFlag(x, z, FLAG_GRASS)) col = [52, 110, 40];
      else col = [84, 150, 56];
      const l = Math.max(0.7, Math.min(1.25, 0.9 + h * 0.08));
      ctx.fillStyle = `rgb(${col.map((v) => Math.min(255, Math.round(v * (k === Kind.Wall && st === "pit" ? 1 : l)))).join(",")})`;
      ctx.fillRect(x * S, z * S, S, S);
    }
  }
  for (const p of t.pads) {
    ctx.fillStyle = "#101010";
    ctx.beginPath();
    ctx.arc(p.x * S, p.z * S, S * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.zone === "neutral" ? "#f0f0f0" : (p.side ?? (p.x < t.width / 2 ? 0 : 1)) === 0 ? "#6a8cff" : "#ff5a4a";
    ctx.beginPath();
    ctx.arc(p.x * S, p.z * S, S * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const co of t.cores) {
    ctx.fillStyle = "#101010";
    ctx.fillRect(co.x * S - S * 1.8, co.z * S - S * 1.8, S * 3.6, S * 3.6);
    ctx.fillStyle = co.team === 0 ? "#3a64ff" : "#ff3a2a";
    ctx.fillRect(co.x * S - S * 1.3, co.z * S - S * 1.3, S * 2.6, S * 2.6);
  }
  return c;
}
const previews = new Map<string, HTMLCanvasElement>();
const padCounts = new Map<string, number>();

export function wrap(s: string, width: number, scale = 1): string[] {
  const words = s.toUpperCase().split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (textWidth(next, scale) > width && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export class Screens {
  private which: "title" | "select" | "map" | "results" | "pause" | "lobby" | "none" = "none";
  lobby: LobbyView | null = null;
  private maps: MapData[] = [];
  portraits: Portraits | null = null;
  cursors: MenuCursors | null = null;
  private shieldAt = new Map<string, { x: number; y: number }>();
  readyBanner = false;
  adapterStatus = "";
  adapterDebug = "";
  private mapIndex = 0;
  private slots: SelectSlot[] = [];
  private heroes: Record<string, HeroInfo> = (heroJson as unknown as { heroes: Record<string, HeroInfo> }).heroes;
  private roster: string[] = [];
  private mode: MatchMode = "1v1";
  private get twoVtwo(): boolean {
    return this.mode !== "1v1";
  }
  private teamOf(i: number): number {
    return this.mode === "ffa" ? i : i % 2;
  }
  private championSeat(i: number): boolean {
    return i < 2 || this.mode === "ffa" || (this.mode === "2v2" && this.heroPartners);
  }
  cameraMode = 1;
  training = false;
  zoomModes: number[] = [0, 0, 0, 0];
  private results: World | null = null;

  constructor(private teamColors: string[]) {}

  set(which: "title" | "select" | "map" | "results" | "pause" | "lobby" | "none"): void {
    this.which = which;
  }

  private heroPartners = false;
  hosting = false;
  openHint = false;
  peer = false;

  updateSelect(slots: SelectSlot[], heroes: Record<string, HeroInfo>, roster: string[], mode: MatchMode, heroPartners = false): void {
    this.heroPartners = heroPartners;
    this.slots = slots;
    this.heroes = heroes;
    this.roster = roster;
    this.mode = mode;
  }

  private pool: number[] = [];

  updateMaps(maps: MapData[], index: number, pool: number[] = maps.map((_, i) => i), mode: MatchMode = this.mode): void {
    this.maps = maps;
    this.mapIndex = index;
    this.pool = pool;
    this.fieldMode = mode;
  }

  private fieldMode: MatchMode = "1v1";

  private resultPlayers: { tag: string | null; hero: string; team: number; cpu: boolean }[] = [];
  private placing: number[] = [];
  showResults(w: World, players: { tag: string | null; hero: string; team: number; cpu: boolean }[] = [], _names: Record<string, string> = {}, fallen: number[] = []): void {
    this.results = w;
    this.resultPlayers = players;
    const keep = (t: number) => {
      const c = w.core(t);
      return c?.alive ? c.hp / c.maxHp : 0;
    };
    const standing = w.teams.map((_, t) => t).filter((t) => !w.teams[t].out && t !== w.match.winner).sort((a, b) => keep(b) - keep(a));
    const out = [...w.teams.map((_, t) => t).filter((t) => w.teams[t].out && !fallen.includes(t)), ...fallen.filter((t) => w.teams[t]?.out)];
    this.placing = [...(w.match.winner >= 0 ? [w.match.winner] : []), ...standing, ...out.reverse()];
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    if (this.which === "none") return;
    const sel = this.which === "select" || (this.which === "lobby" && !!this.lobby);
    this.peer = this.which === "lobby";
    if (this.which === "title") boardBg(ctx, W, H);
    else if (this.which === "pause" || this.which === "results") boardBg(ctx, W, H);
    const blink = Math.floor(now * 2) % 2 === 0;
    if (this.cursors && (sel || this.which === "map")) this.cursors.hits = [];
    if (this.which === "title") {
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
          prompt(ctx, Math.round(cw / 2 - promptWidth(it, 1) / 2), ih + 36, it, 1);
        }
        waxSeal(ctx, cw - 18, ch - 18, 11, "#a8141a", "combo");
      });
      woodFloor(ctx, H - 34, W, H);
      center(ctx, W, "PRESS ANY BUTTON OR KEY TO JOIN  ·  CLICK ONCE FOR SOUND", H - 29, "#f0e4c8", 0.7);
      if (this.adapterStatus) center(ctx, W, this.adapterStatus, H - 19, "#e8d090", 0.62);
      if (this.adapterDebug) center(ctx, W, this.adapterDebug, H - 10, "#c8b898", 0.55);
    } else if (sel) this.drawSelect(ctx, W, H, now, blink);
    else if (this.which === "map") this.drawMap(ctx, W, H, blink);
    if (this.cursors && (sel || this.which === "map")) {
      if (sel) {
        const labels = this.slots.map((sl, i) => (!this.championSeat(i) || !this.twoVtwo && i >= 2 ? "" : sl.cpu ? "CPU" : `${i + 1}`));
        this.slots.forEach((sl, i) => {
          const c = this.cursors!.chips[i];
          if (c.hero) {
            const p = this.shieldAt.get(c.hero);
            if (p) { c.x = p.x + (i % 2 === 0 ? -9 : 9); c.y = p.y + (i >= 2 ? 9 : 0); }
          }
        });
        this.cursors.drawChips(ctx, labels, this.slots.map((sl, i) => chipColor(i, sl.cpu)));
      }
      this.cursors.drawCursors(ctx, now);
    }
    if (this.which === "results" && this.results) this.drawResults(ctx, W, this.results, blink);
  }

  private drawSelect(ctx: CanvasRenderingContext2D, W: number, H: number, _now: number, blink: boolean): void {
    boardBg(ctx, W, H);
    const floorY = H - 20;
    woodFloor(ctx, floorY, W, H);
    beam(ctx, 4, 2, W - 8, 17);
    artTitle(ctx, "t_champion", "CHOOSE YOUR CHAMPION", W / 2, 3, 14);
    const mw = this.mode === "ffa" ? 70 : 46;
    ribbon(ctx, W - 15 - mw / 2, 4, mw, 11, this.training ? "TRAINING" : MODE_NAME[this.mode], 0.55, undefined, this.training ? null : nameImage(`t_${this.mode}`));
    this.hit("mode", W - 15 - mw / 2 - mw / 2 - 5, 1, mw + 10, 17);
    const cam = CAMERA_NAMES[this.cameraMode] ?? CAMERA_NAMES[1];
    const cw = Math.max(64, textWidth(cam, 0.5) + 18);
    ribbon(ctx, 8 + cw / 2, 4, cw, 11, cam, 0.5);
    this.hit("camera", 4, 1, cw + 8, 17);

    const n = this.roster.length;
    const sw = 42;
    const sh = 54;
    const gap = Math.min(12, Math.floor((W - 24 - n * sw) / Math.max(1, n - 1)));
    const gx = Math.round((W - (n * sw + (n - 1) * gap)) / 2);
    const gy = 25;
    this.roster.forEach((type, k) => {
      const x = gx + k * (sw + gap);
      const on = [0, 1, 2, 3].filter((i) => (i < 2 || (this.twoVtwo && this.championSeat(i))) && this.slots[i]?.ready && this.slots[i].hero === type).map((i) => this.teamOf(i));
      const hot = !!this.cursors?.cursors.some((c) => c.active && c.hover === `hero:${type}`);
      this.hit(`hero:${type}`, x - 2, gy - 2, sw + 4, sh + 4);
      this.shieldAt.set(type, { x: x + sw / 2, y: gy + sh - 22 });
      const icon = this.portraits?.icon(type);
      const tilt = on.length || hot ? 0 : k % 2 ? 0.04 : -0.04;
      card(ctx, x, gy - (hot ? 2 : 0), sw, sh, tilt, on.length === 1 ? TEAM_BRIGHT[on[0]] : on.length === 2 ? "#f0c030" : hot ? "#c81818" : "#8a8a90", () => {
        const iw = sw - 8;
        ctx.fillStyle = "#2a1a0a";
        ctx.fillRect(2, 6, iw + 4, iw + 4);
        texturedRect(ctx, "cloth", 4, 8, iw, iw, on.length ? TEAM_FIELD[on[0]] : "#7a2a1c", 0, 0.7);
        if (icon) hiImage(ctx, icon, 4, 8, iw, iw);
        const name = (this.heroes[type]?.name ?? type).toUpperCase();
        const ns = Math.min(0.62, (sw - 4) / Math.max(1, textWidth(name, 1, true)));
        drawPlain(ctx, name, sw / 2 - textWidth(name, ns, true) / 2, sh - 10, on.length ? "#8a1810" : "#3a2410", ns, true);
      });
    });

    const order = this.mode === "ffa" ? [0, 1, 2, 3] : this.twoVtwo ? [0, 2, 1, 3] : [0, 1];
    const slotsN = order.length;
    const bw = this.twoVtwo ? Math.min(72, Math.floor((W - 30) / slotsN) - 14) : Math.min(118, Math.floor(W * 0.3));
    const bgap = this.twoVtwo ? Math.floor((W - bw * slotsN) / (slotsN + 1)) : Math.floor((W - bw * 2) / 3);
    const by = 96;
    const bh = floorY - by - 6;
    order.forEach((i, k) => this.drawBanner(ctx, i, bgap + k * (bw + bgap), by, bw, bh, blink));
    if (!this.twoVtwo) {
      for (const [i, bx] of [[2, 12], [3, W - 12 - 44]] as const) {
        this.portraits?.drop(i);
        if (this.peer) continue;
        const hot = !!this.cursors?.cursors.some((c) => c.active && c.hover === `add:${i}`);
        card(ctx, bx, by + 4, 44, 34, hot ? 0 : i === 2 ? -0.04 : 0.04, hot ? "#c81818" : "#8a8a90", () => {
          for (const [line, dy] of [["+ ADD", 10], ["CPU", 19]] as const) drawPlain(ctx, line, 22 - textWidth(line, 0.55, true) / 2, dy, hot ? "#8a1810" : "#6a4424", 0.55, true);
        });
        this.hit(`add:${i}`, bx - 2, by + 2, 48, 38);
      }
    }

    const it: [string, string][] = this.peer ? [["A", "TAKE / PLACE SEAL"], ["B", "LEAVE"]] : [["A", "TAKE / PLACE SEAL"], ["B", "BACK"], ["S", "START"]];
    prompt(ctx, Math.round((W - promptWidth(it, 0.7)) / 2), H - 13, it, 0.7);
    if (this.peer && this.lobby) {
      const lb = this.lobby;
      const r = lb.rules;
      const t = lb.status || (lb.phase === "match" ? "A MATCH IS UNDER WAY · YOU'LL JOIN THE NEXT ONE" : `${lb.map} · ${r.minutes} MIN · ${r.popCap} SOLDIERS · GOLD X${r.goldRate} · WAITING FOR THE HOST`);
      if (blink || !lb.status) center(ctx, W, t, floorY - 10, "#fff0c0", 0.55);
    }

    if (this.openHint && !this.peer) {
      const sw2 = Math.min(300, W - 60);
      onHiLayer(ctx, (t) => {
        card(t, W / 2 - sw2 / 2, 124, sw2, 32, 0.01, "#c81818", () => {
          const t1 = "SEATS STILL OPEN";
          drawPlain(t, t1, sw2 / 2 - textWidth(t1, 1.05, true) / 2, 5, "#3a2410", 1.05, true);
          const t2 = this.twoVtwo ? "WAIT FOR PLAYERS, + ADD CPU, OR SWITCH TO 1 VS 1" : "WAIT FOR A PLAYER OR + ADD CPU";
          drawPlain(t, t2, sw2 / 2 - textWidth(t2, 0.55, true) / 2, 20, "#8a1810", 0.55, true);
        });
      });
    }
    if (this.readyBanner) {
      const sw2 = Math.min(280, W - 60);
      this.hit("go", W / 2 - sw2 / 2, 124, sw2, 36);
      onHiLayer(ctx, (t) => {
        card(t, W / 2 - sw2 / 2, 124, sw2, 36, -0.012, "#c81818", () => {
          const tt = "THE GRUDGE IS SWORN!";
          drawPlain(t, tt, sw2 / 2 - textWidth(tt, 1.35, true) / 2, 5, "#3a2410", 1.35, true);
          if (blink) {
            const p = "PRESS START";
            drawPlain(t, p, sw2 / 2 - textWidth(p, 0.7, true) / 2, 23, "#8a1810", 0.7, true);
          }
          waxSeal(t, sw2 - 16, 18, 10, "#a8141a", "combo");
        });
      });
    }
  }

  private woodButton(ctx: CanvasRenderingContext2D, bid: string, t: string, cx: number, by: number): void {
    const hot = !!this.cursors?.cursors.some((c) => c.active && c.hover === bid);
    ctx.fillStyle = "#0b0806";
    ctx.fillRect(cx - 26, by - 1, 52, 13);
    texturedRect(ctx, "wood", cx - 25, by, 50, 11, hot ? "#b08050" : "#6a4a30", 0, 0.8);
    shadowText(ctx, t, cx - textWidth(t, 0.55) / 2, by + 2, hot ? "#fff4b0" : "#e8d8b8", 0.55);
    this.hit(bid, cx - 28, by - 3, 56, 17);
  }

  private hit(id: string, x: number, y: number, w: number, h: number): void {
    this.cursors?.hits.push({ id, x, y, w, h });
  }

  private kindPlaque(ctx: CanvasRenderingContext2D, i: number, cx: number, y: number, s: SelectSlot): void {
    cx = Math.round(cx);
    const dummy = this.training && s.cpu;
    const label = dummy ? "DUMMY" : s.cpu ? "CPU" : !this.championSeat(i) ? "COMMANDER" : "PLAYER";
    const pw = Math.max(26, textWidth(label, 0.5, true) + 10);
    const camPl = !s.cpu && this.cameraMode !== 0 && this.championSeat(i);
    const lvW = 21;
    const camW = 11;
    const extra = s.cpu && !dummy ? lvW + 3 : camPl ? camW + 3 : 0;
    const x0 = Math.round(cx - (pw + extra) / 2);
    const px = x0 + pw / 2;
    const hovered = this.cursors?.cursors.some((c) => c.active && c.hover === `kind:${i}`);
    ctx.fillStyle = INK;
    ctx.fillRect(px - pw / 2 - 1, y - 1, pw + 2, 10);
    texturedRect(ctx, "wood", px - pw / 2, y, pw, 8, hovered ? "#e0b060" : "#a07040", 0, 1);
    drawPlain(ctx, label, px - textWidth(label, 0.5, true) / 2, y + 1.6, s.cpu ? "#d8d8e0" : "#f8e8b0", 0.5, true);
    this.hit(`kind:${i}`, px - pw / 2 - 2, y - 2, pw + 4, 12);
    const tip = (t: string) => shadowText(ctx, t, cx - textWidth(t, 0.42) / 2, y - 24, "#f8e8c0", 0.42);
    if (s.cpu && !dummy) {
      const lx = x0 + pw + 3;
      const hl = !!this.cursors?.cursors.some((c) => c.active && c.hover === `lvl:${i}`);
      ctx.fillStyle = INK;
      ctx.fillRect(lx - 1, y - 1, lvW + 2, 10);
      texturedRect(ctx, "wood", lx, y, lvW, 8, hl ? "#e0b060" : "#6a4428", 0, 1);
      for (let k = 0; k < 3; k++) {
        const gx = lx + 4 + k * 6.5;
        const gy = y + 4;
        const on = k < s.level;
        const gem = (r: number, col: string) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(gx, gy - r);
          ctx.lineTo(gx + r * 0.8, gy);
          ctx.lineTo(gx, gy + r);
          ctx.lineTo(gx - r * 0.8, gy);
          ctx.closePath();
          ctx.fill();
        };
        gem(3.2, INK);
        gem(2.3, on ? ["#e8c040", "#e07020", "#d81818"][s.level - 1] : "#2a1c12");
        if (on) {
          ctx.fillStyle = "rgba(255,255,230,0.75)";
          ctx.fillRect(gx - 0.8, gy - 1.6, 1, 1);
        }
      }
      this.hit(`lvl:${i}`, lx - 2, y - 2, lvW + 4, 12);
      if (hl) tip(`CPU ${["EASY", "NORMAL", "HARD"][s.level - 1]}`);
    }
    if (camPl) {
      const zx = x0 + pw + 3;
      const manual = !!this.zoomModes[i];
      const hl = !!this.cursors?.cursors.some((c) => c.active && c.hover === `cam:${i}`);
      ctx.fillStyle = INK;
      ctx.fillRect(zx - 1, y - 1, camW + 2, 10);
      texturedRect(ctx, "parch", zx, y, camW, 8, hl ? "#f0d890" : "#c8b088", 0, 1);
      const mx = zx + camW / 2;
      const my = y + 4;
      if (manual) {
        ctx.fillStyle = "#3a2410";
        ctx.fillRect(mx - 1, my - 3, 2, 6);
        ctx.fillRect(mx - 3, my - 1, 6, 2);
        ctx.fillStyle = "#c81818";
        ctx.fillRect(mx - 0.5, my - 3, 1, 1.4);
      } else {
        ctx.fillStyle = "#3a2410";
        ctx.beginPath();
        ctx.moveTo(mx - 4, my);
        ctx.quadraticCurveTo(mx, my - 4.2, mx + 4, my);
        ctx.quadraticCurveTo(mx, my + 4.2, mx - 4, my);
        ctx.fill();
        ctx.fillStyle = "#f0e4c8";
        ctx.beginPath();
        ctx.arc(mx, my, 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2a5ac8";
        ctx.beginPath();
        ctx.arc(mx, my, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      this.hit(`cam:${i}`, zx - 2, y - 2, camW + 4, 12);
      if (hl) tip(manual ? "CAMERA: D-PAD ZOOM" : "CAMERA: AUTO ZOOM");
    }
  }

  private drawBanner(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, w: number, h: number, blink: boolean): void {
    const s = this.slots[i];
    const active = !!s && (i < 2 || this.twoVtwo);
    const team = this.teamOf(i);
    const ink = TEAM_TEXT_R[team];
    if (!s || !active) {
      this.portraits?.drop(i);
      if (!s) return;
      const hot = !!this.cursors?.cursors.some((c) => c.active && c.hover === `add:${i}`);
      card(ctx, x, y, w, 32, hot ? 0 : team ? 0.03 : -0.03, hot ? "#c81818" : "#8a8a90", () => {
        const t = "+ ADD CPU";
        drawPlain(ctx, t, w / 2 - textWidth(t, 0.6, true) / 2, 13, hot ? "#8a1810" : "#6a4424", 0.6, true);
      });
      this.hit(`add:${i}`, x, y - 2, w, 34);
      return;
    }
    if (s.open) {
      this.portraits?.drop(i);
      card(ctx, x, y, w, h, team ? 0.012 : -0.012, TEAM_BRIGHT[team], () => {
        const t = `SEAT ${i + 1}`;
        drawPlain(ctx, t, w / 2 - textWidth(t, 0.8, true) / 2, 8, ink, 0.8, true);
        inset(ctx, 6, 24, w - 12, h - 92, "#2a2018");
        texturedRect(ctx, "cloth", 6, 24, w - 12, h - 92, TEAM_CLOTH[team], 0, 0.7);
        band(ctx, 6, 24, w - 12, h - 92, "#000000", 0.45);
        waxSeal(ctx, w / 2, 24 + (h - 92) / 2, 14, "#5a4a3a", "none");
        const lines = this.peer ? ["OPEN SEAT", "WAITING FOR", "A PLAYER"] : ["OPEN SEAT", "WAITING FOR A PLAYER"];
        lines.forEach((l, k) => drawPlain(ctx, l, w / 2 - textWidth(l, k ? 0.48 : 0.68, true) / 2, h - 62 + k * 9, k ? "#6a4424" : BROWN_S, k ? 0.48 : 0.68, true));
      });
      const btns: [string, string][] = this.peer ? [[`take:${i}`, "SIT HERE"]] : [[`sit:${i}`, "SIT HERE"], [`seatcpu:${i}`, "+ ADD CPU"]];
      btns.forEach(([bid, t], k) => this.woodButton(ctx, bid, t, x + w / 2, y + h - 34 + k * 15 - (btns.length - 1) * 8));
      return;
    }
    const commander = !this.championSeat(i);
    const human = s.joined && !s.cpu;
    const def = this.heroes[s.hero];
    const naming = this.naming.has(i);
    const tagged = !s.cpu && !commander && !!s.tag;
    const label = tagged ? s.tag! : `P${i + 1}`;
    const tagHot = !s.cpu && !commander && !!this.cursors?.cursors.some((c) => c.active && c.hover === `tag:${i}`);
    const iy = 30;
    const ih = h - iy - 34;
    card(ctx, x, y, w, h, 0, s.ready ? "#c8a020" : TEAM_BRIGHT[team], () => {
      const ls = tagged ? Math.min(0.95, (w - 34) / Math.max(1, textWidth(label, 1, true))) : 0.95;
      drawPlain(ctx, label, w / 2 - textWidth(label, ls, true) / 2, 7, tagHot ? "#c81818" : ink, ls, true);
      inset(ctx, 5, iy, w - 10, ih, "#2a2018");
      texturedRect(ctx, "cloth", 5, iy, w - 10, ih, TEAM_CLOTH[team], 0, 0.7);
      band(ctx, 5, iy + ih - 10, w - 10, 10, "#000000", 0.25);
      if (naming) return;
      const name = (def?.name ?? s.hero).toUpperCase();
      const ns = Math.min(0.8, (w - 10) / Math.max(1, textWidth(name, 1, true)));
      drawPlain(ctx, name, w / 2 - textWidth(name, ns, true) / 2, iy + ih + 5, BROWN_S, ns, true);
    });
    if (!s.cpu && !commander) {
      this.hit(`tag:${i}`, x + 4, y + 3, w - 8, 13);
      if (tagHot) shadowText(ctx, "SIGN NAME", x + w / 2 - textWidth("SIGN NAME", 0.42) / 2, y - 7, "#f8e8c0", 0.42);
    }
    const sitHere = s.cpu && !this.peer && !commander && !!this.cursors?.cursors.some((c) => c.active);
    const xBox = (bid: string, tip: string) => {
      const uHot = !!this.cursors?.cursors.some((c) => c.active && c.hover === bid);
      const ux = x + w - 11;
      const uy = y + 3;
      ctx.fillStyle = "#1a120a";
      ctx.fillRect(ux - 1, uy - 1, 9, 9);
      ctx.fillStyle = uHot ? "#b83020" : "#6a3a24";
      ctx.fillRect(ux, uy, 7, 7);
      shadowText(ctx, "X", ux + 3.5 - textWidth("X", 0.5) / 2, uy + 1, uHot ? "#fff4b0" : "#e8d8b8", 0.5);
      this.hit(bid, ux - 2, uy - 2, 11, 11);
      if (uHot) shadowText(ctx, tip, Math.max(2, x + w / 2 - textWidth(tip, 0.42) / 2), y - 7, "#f8e8c0", 0.42);
    };
    if (s.cpu && this.hosting && !commander) xBox(`seatopen:${i}`, "OPEN THIS SEAT");
    if (human && s.local) xBox(`unplug:${i}`, "UNPLUG · ANY BUTTON REJOINS");
    if (naming) {
      this.portraits?.drop(i);
      this.naming.get(i)!.draw(ctx, x + 3, y + 18, w - 6, h - 20, performance.now() / 1000);
      return;
    }
    const sg = !s.cpu && !commander ? this.signing.get(i) : undefined;
    if (sg) {
      this.portraits?.drop(i);
      drawSigning(ctx, x + 3, y + 18, w - 6, h - 20, sg[0] === 1, sg[1], performance.now() / 1000);
      return;
    }
    this.kindPlaque(ctx, i, x + w / 2, y + 17, s);
    const fx = x + 5;
    const fy = y + iy;
    const fw = w - 10;
    if (this.portraits) {
      const cv = this.portraits.stage(i, s.hero, team, s.ready);
      const k = Math.min(fw / cv.width, (ih + 4) / cv.height);
      const dw = cv.width * k;
      const dh = cv.height * k;
      const bg = stageArt.get(s.hero);
      onHiLayer(ctx, (t) => {
        t.save();
        t.beginPath();
        t.rect(fx, fy, fw, ih);
        t.clip();
        t.imageSmoothingEnabled = true;
        t.imageSmoothingQuality = "high";
        if (bg?.complete && bg.naturalWidth) {
          const bk = Math.max(fw / bg.naturalWidth, ih / bg.naturalHeight);
          const bw = bg.naturalWidth * bk;
          const bh = bg.naturalHeight * bk;
          t.drawImage(bg, fx + (fw - bw) / 2, fy + (ih - bh) / 2, bw, bh);
          const tc = TEAM_CLOTH[team] ?? "#444444";
          const gr = t.createLinearGradient(0, fy + ih, 0, fy + ih * 0.45);
          gr.addColorStop(0, tc + "a0");
          gr.addColorStop(0.35, tc + "55");
          gr.addColorStop(1, tc + "00");
          t.fillStyle = gr;
          t.fillRect(fx, fy, fw, ih);
          t.strokeStyle = tc;
          t.lineWidth = 2;
          t.strokeRect(fx + 1, fy + 1, fw - 2, ih - 2);
        }
        t.drawImage(cv, fx + (fw - dw) / 2, fy + ih - dh + 3, dw, dh);
        t.restore();
      });
    }
    const hasTree = !commander && !!TREES[s.hero];
    if (hasTree) {
      const tw = w >= 100 ? 1 : 0.7;
      onHiLayer(ctx, (t) => {
        drawTree(t, s.hero, "a", fx + 2, fy + 3, false, tw);
        drawTree(t, s.hero, "b", fx + fw - 2 - Math.round(23 * tw), fy + 3, true, tw);
      });
    }
    (["a", "b", "r", "z"] as const).forEach((a, j) => {
      const cx = x + (w / 4) * (j + 0.5);
      abilityIcon(ctx, def?.abilities?.[a]?.kind ?? "none", cx, y + h - 10, 7);
    });
    if (sitHere) onHiLayer(ctx, (t) => this.woodButton(t, `sit:${i}`, "SIT HERE", x + w / 2, fy + ih - 16));
    if (s.ready && !commander && human) {
      onHiLayer(ctx, (t) => {
        waxSeal(t, fx + fw - 12, fy + 13, 10, "#a8141a", "combo");
        const tt = "SWORN";
        shadowText(t, tt, fx + fw - 12 - textWidth(tt, 0.5) / 2, fy + 25, "#f4ecd8", 0.5);
      });
    }
    void blink;
  }

  naming = new Map<number, NameEntry>();
  signing = new Map<number, [number, string]>();
  fieldWatch = false;
  fieldNote = "";

  private drawMap(ctx: CanvasRenderingContext2D, W: number, H: number, _blink: boolean): void {
    boardBg(ctx, W, H);
    woodFloor(ctx, H - 20, W, H);
    beam(ctx, 4, 2, W - 8, 17);
    artTitle(ctx, "t_field", "CHOOSE THE FIELD", W / 2, 3, 14);
    const pool = this.pool;
    const mw = this.fieldMode === "ffa" ? 70 : 46;
    ribbon(ctx, W - 15 - mw / 2, 4, mw, 11, MODE_NAME[this.fieldMode], 0.55, undefined, nameImage(`t_${this.fieldMode}`));

    const random = this.mapIndex >= pool.length;
    const d = random ? null : this.maps[pool[this.mapIndex]];
    const pw = Math.min(250, Math.round(W * 0.6));
    const ph = H - 58;
    const px = 16;
    const py = 28;
    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    ctx.rotate(-0.02);
    ctx.translate(-pw / 2, -ph / 2);
    parchment(ctx, 0, 0, pw, ph);
    const iw = pw - 24;
    const ih = Math.round(iw * 0.48);
    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(10, 10, iw + 4, ih + 4);
    if (!random && this.portraits) hiImage(ctx, this.portraits.mapLive(pool[this.mapIndex], iw * 4, ih * 4), 12, 12, iw, ih);
    else {
      texturedRect(ctx, "parch", 12, 12, iw, ih, "#c8a878", 0, 1);
      drawPlain(ctx, "?", 12 + iw / 2 - textWidth("?", 5, true) / 2, 12 + ih / 2 - 26, "#5a3a18", 5, true);
    }
    const name = random ? "A Field Unknown" : d!.name;
    const nsc = Math.min(1.35, (pw - 60) / Math.max(1, textWidth(name, 1, true)));
    drawPlain(ctx, name, 14, ih + 18, "#3a2410", nsc, true);
    const blurb = random ? "LET FATE CHOOSE WHERE THE GRUDGE IS SETTLED." : d!.blurb ?? "";
    wrap(blurb, pw - 70, 0.6).slice(0, 3).forEach((l, j) => drawPlain(ctx, l, 14, ih + 35 + j * 8, "#4a3018", 0.6));
    if (d) {
      let padCount = padCounts.get(d.name);
      if (padCount === undefined) {
        padCount = new Terrain(d).pads.length;
        padCounts.set(d.name, padCount);
      }
      const size = d.width * d.depth <= 2400 ? "SMALL" : d.width * d.depth <= 4000 ? "MEDIUM" : "LARGE";
      drawPlain(ctx, `${size} FIELD  ·  ${d.width} BY ${d.depth} PACES  ·  ${padCount} TOWER PADS`, 14, ph - 12, "#6a4424", 0.55);
    }
    waxSeal(ctx, pw - 22, ih + 36, 15, "#a8141a", random ? "hex" : d?.emblem ?? "castle");
    ctx.restore();

    const cx0 = px + pw + 18;
    const cw = W - cx0 - 14;
    const n = pool.length + 1;
    const chh = Math.min(62, Math.floor((H - 58 - (n - 1) * 8) / n));
    for (let k = 0; k < n; k++) {
      const sel = k === Math.min(this.mapIndex, n - 1);
      const cy = 30 + k * (chh + 8);
      const cx = cx0 + (sel ? -8 : 0);
      this.hit(`map:${k}`, cx0 - 8, cy - 2, cw + 8, chh + 6);
      ctx.save();
      ctx.translate(cx + cw / 2, cy + chh / 2);
      ctx.rotate(sel ? 0 : (k % 2 ? 0.03 : -0.03));
      ctx.translate(-cw / 2, -chh / 2);
      parchment(ctx, 0, 0, cw, chh);
      const tw = cw - 10;
      const th = chh - 17;
      ctx.fillStyle = "#2a1a0a";
      ctx.fillRect(4, 4, tw + 2, th + 2);
      if (k < pool.length) {
        const t = this.portraits?.mapThumb(pool[k], tw * 4, th * 4);
        if (t) hiImage(ctx, t, 5, 5, tw, th);
      } else {
        texturedRect(ctx, "parch", 5, 5, tw, th, "#c8a878", 0, 1);
        drawPlain(ctx, "?", 5 + tw / 2 - textWidth("?", 2.4, true) / 2, 5 + th / 2 - 13, "#5a3a18", 2.4, true);
      }
      const label = k < pool.length ? this.maps[pool[k]].name.toUpperCase().replace(/^GRUDGE\w*\s*/, "") : "RANDOM";
      drawPlain(ctx, label, 6, th + 8, sel ? "#8a1810" : "#3a2410", 0.62, true);
      pin(ctx, cw / 2, 3, sel ? "#c81818" : "#8a8a90");
      ctx.restore();
      if (sel) goldArrow(ctx, cx - 6, cy + chh / 2, -1, 6);
    }
    const it: [string, string][] = this.fieldWatch ? [["B", "LEAVE"]] : [["A", "TO BATTLE"], ["B", "BACK"], ["S", "START"]];
    prompt(ctx, Math.round((W - promptWidth(it, 0.7)) / 2), H - 13, it, 0.7);
    if (this.fieldNote) shadowText(ctx, this.fieldNote, Math.round(px + pw / 2 - textWidth(this.fieldNote, 0.55) / 2), H - 28, this.fieldWatch ? "#fff0c0" : "#f8e8a0", 0.55);
  }

  private drawFfaRows(ctx: CanvasRenderingContext2D, pw: number, ry: number, rh: number, rows: [string, (i: number) => number][], w: World): void {
    const order = this.placing.length ? this.placing : w.teams.map((_, t) => t);
    const lw = 74;
    const colW = (pw - 12 - lw - 8) / order.length;
    const cx = (k: number) => 12 + lw + colW * (k + 0.5);
    order.forEach((t, k) => {
      const x = Math.round(cx(k) - colW / 2 + 2);
      ctx.fillStyle = "#2a1a0a";
      ctx.fillRect(x - 1, ry - 13, Math.round(colW - 4) + 2, 10);
      texturedRect(ctx, "cloth", x, ry - 12, Math.round(colW - 4), 8, TEAM_CLOTH[t], 0, 0.7);
      const pl = PLACE[k] ?? "";
      shadowText(ctx, pl, cx(k) - textWidth(pl, 0.45) / 2, ry - 11, "#fff4d8", 0.45);
      if (w.teams[t]?.out) {
        ctx.strokeStyle = "#8a1810";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, ry - 4.5);
        ctx.lineTo(x + Math.round(colW - 4), ry - 4.5);
        ctx.stroke();
      }
    });
    rows.forEach(([label, f], i) => {
      const y = ry + i * rh;
      const vals = order.map((t) => f(t));
      const best = label === "LOST" ? Math.min(...vals) : Math.max(...vals);
      drawPlain(ctx, label, 12, y + 2, "#6a4424", 0.5, true);
      vals.forEach((v, k) => {
        const sv = String(v);
        const top = vals.filter((q) => q === best).length === 1 && v === best;
        drawPlain(ctx, sv, cx(k) - textWidth(sv, 0.72, true) / 2, y + 1, top ? TEAM_TEXT_R[order[k]] : "#4a3018", 0.72, true);
      });
      const tot = vals.reduce((a, b) => a + b, 0);
      const barW = pw - 24;
      const by = y + 11;
      ctx.fillStyle = "#3a2410";
      ctx.fillRect(11, by - 1, barW + 2, 4);
      if (!tot) {
        ctx.fillStyle = "#8a7a60";
        ctx.fillRect(12, by, barW, 2);
        return;
      }
      let bx = 12;
      vals.forEach((v, k) => {
        const bw = k === vals.length - 1 ? 12 + barW - bx : Math.round((barW * v) / tot);
        ctx.fillStyle = TEAM_CLOTH[order[k]];
        ctx.fillRect(bx, by, bw, 2);
        bx += bw;
      });
    });
  }

  private drawResults(ctx: CanvasRenderingContext2D, W: number, w: World, blink: boolean): void {
    const H = 240;
    const win = w.match.winner;
    const head = win < 0 ? "A DRAW" : `${w.teamName(win)} HOUSE WINS`;
    boardBg(ctx, W, H);
    woodFloor(ctx, H - 20, W, H);
    beam(ctx, 4, 2, W - 8, 17);
    artTitle(ctx, `!${head}`, head, W / 2, 3, 14);
    const ps0 = this.resultPlayers.length ? this.resultPlayers : w.players.map((p) => ({ tag: null, hero: p.heroType, team: p.team, cpu: true }));
    const ffa = w.ffa;
    const place = (t: number) => this.placing.indexOf(t);
    const ps = ffa ? ps0.map((p, i) => ({ ...p, slot: i })).sort((a, b) => place(a.team) - place(b.team)) : ps0.map((p, i) => ({ ...p, slot: i }));
    const t = w.teams;
    const pw = Math.min(250, Math.round(W * 0.6));
    const ph = H - 52;
    const px = 16;
    const py = 26;
    const reason = w.match.reason.toUpperCase();
    const mm = `${Math.floor(w.time / 60)}:${String(Math.floor(w.time % 60)).padStart(2, "0")}`;
    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    ctx.rotate(-0.02);
    ctx.translate(-pw / 2, -ph / 2);
    parchment(ctx, 0, 0, pw, ph);
    const iw = pw - 24;
    const ih = 58;
    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(10, 10, iw + 4, ih + 4);
    ctx.clearRect(12, 12, iw, ih);
    markWindow(ctx, 12, 12, iw, ih);
    const sub = `${reason}  ·  ${mm}`;
    shadowText(ctx, sub, 12 + iw / 2 - textWidth(sub, 0.6) / 2, 12 + ih - 11, "#fff0c8", 0.6);
    waxSeal(ctx, pw - 26, ih + 10, 17, win < 0 ? "#8a7a60" : TEAM_CLOTH[win], win < 0 ? "none" : "castle");
    const rows: [string, (i: number) => number][] = [
      ["KEEP DAMAGE", (i) => Math.round(t[i].coreDamageDealt)],
      ["HERO KILLS", (i) => t[i].heroKills],
      ["SOLDIERS SLAIN", (i) => t[i].kills],
      ["BUILT", (i) => t[i].structuresBuilt],
      ["LOST", (i) => t[i].structuresLost],
    ];
    const ry = ih + 22;
    const rh = Math.min(18, (ph - ry - 8) / rows.length);
    if (ffa) this.drawFfaRows(ctx, pw, ry + 14, Math.min(rh, (ph - ry - 20) / rows.length), rows, w);
    else rows.forEach(([label, f], i) => {
      const y = ry + i * rh;
      const a = f(0);
      const b = f(1);
      drawPlain(ctx, label, pw / 2 - textWidth(label, 0.5, true) / 2, y, "#6a4424", 0.5, true);
      const va = String(a);
      const vb = String(b);
      drawPlain(ctx, va, 12, y + 2, a > b ? "#1c34a8" : "#4a3018", 0.72, true);
      drawPlain(ctx, vb, pw - 12 - textWidth(vb, 0.72, true), y + 2, b > a ? "#a81c1c" : "#4a3018", 0.72, true);
      const tot = Math.max(1, a + b);
      const barW = pw - 110;
      const bx = 55;
      const by = y + 9;
      ctx.fillStyle = "#3a2410";
      ctx.fillRect(bx - 1, by - 1, barW + 2, 5);
      if (a + b === 0) {
        ctx.fillStyle = "#8a7a60";
        ctx.fillRect(bx, by, barW, 3);
      } else {
        ctx.fillStyle = "#3a58e0";
        ctx.fillRect(bx, by, Math.round((barW * a) / tot), 3);
        ctx.fillStyle = "#d83828";
        ctx.fillRect(bx + Math.round((barW * a) / tot), by, barW - Math.round((barW * a) / tot), 3);
      }
    });
    ctx.restore();
    const cx0 = px + pw + 18;
    const cw = W - cx0 - 14;
    const n = Math.max(1, ps.length);
    const gap = 6;
    const chh = Math.min(44, Math.floor((H - 54 - (n - 1) * gap) / n));
    ps.forEach((p, k) => {
      const cy = 28 + k * (chh + gap);
      const won = p.team === win;
      ctx.save();
      ctx.translate(cx0 + cw / 2, cy + chh / 2);
      ctx.rotate(won ? 0 : k % 2 ? 0.03 : -0.03);
      ctx.translate(-cw / 2, -chh / 2);
      parchment(ctx, 0, 0, cw, chh);
      ctx.fillStyle = "#2a1a0a";
      ctx.fillRect(4, 4, chh - 6, chh - 6);
      texturedRect(ctx, "cloth", 5, 5, chh - 8, chh - 8, TEAM_CLOTH[p.team], 0, 0.7);
      const icon = this.portraits?.icon(p.hero);
      if (icon) hiImage(ctx, icon, 5, 5, chh - 8, chh - 8);
      const nm = p.cpu ? "CPU" : p.tag ?? `P${p.slot + 1}`;
      drawPlain(ctx, nm, chh + 2, chh / 2 - 9, TEAM_TEXT_R[p.team], 0.72, true);
      const hero = (this.heroes[p.hero]?.name ?? p.hero).toUpperCase();
      drawPlain(ctx, hero, chh + 2, chh / 2 + 2, "#4a3018", 0.55, true);
      if (won) waxSeal(ctx, cw - 12, chh / 2, 8, "#c8a020", "combo");
      else if (ffa) {
        const pl = PLACE[place(p.team)] ?? "";
        drawPlain(ctx, pl, cw - 6 - textWidth(pl, 0.62, true), chh / 2 - 9, "#6a4424", 0.62, true);
        if (w.teams[p.team]?.out) drawPlain(ctx, "FALLEN", cw - 6 - textWidth("FALLEN", 0.45, true), chh / 2 + 2, "#8a1810", 0.45, true);
      }
      pin(ctx, cw / 2, 3, won ? "#c8a020" : TEAM_BRIGHT[p.team]);
      ctx.restore();
    });
    if (blink) {
      const it: [string, string][] = [["A", "CONTINUE"]];
      prompt(ctx, Math.round((W - promptWidth(it, 0.7)) / 2), H - 13, it, 0.7);
    }
  }
}
