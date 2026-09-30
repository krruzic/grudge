import type { World } from "../sim/world";
import { FLAG_DIRT, FLAG_GRASS, FLAG_PAVING, Kind, Terrain, type MapData } from "../sim/terrain";
import { drawNum, drawPlain, drawText, occlude, textWidth } from "./font";
import { box, padButton, PAD } from "./hud";
import { abilityIcon } from "./icons";
import { artTitle, band, drawLogo, banner, beam, goldArrow, nameImage, paintedText, parchment, pennant, pin, ribbon, rolledBanner, scroll, shadowText, shield, table, texturedRect, wall, waxSeal, woodFloor } from "./n64ui";
import type { Portraits } from "./portraits";
import { chipColor, type MenuCursors } from "./cursor";

const KIND_LABEL: Record<string, string> = {
  combo: "3-HIT COMBO", slam: "GROUND SLAM", quake: "EARTHQUAKE", warcry: "WAR CRY", shoot: "MAGIC BOLT",
  hex: "HEX BLAST", leap: "CLIFF LEAP", dash: "PIERCING DASH", stealth: "SMOKE AMBUSH", summon: "SUMMON TROOPS",
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
}

type HeroInfo = { name: string; blurb: string; abilities?: Record<string, { kind: string }> };

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

const TEAM_BOX = ["#1c34a8", "#a81c1c"];
const TEAM_BRIGHT = ["#4a74ff", "#ff4a3a"];
const TEAM_CLOTH = ["#3a58e0", "#d83828"];
const TEAM_FIELD = ["#4a64d8", "#c83a2a"];
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
  private which: "title" | "select" | "map" | "results" | "pause" | "none" = "none";
  private maps: MapData[] = [];
  portraits: Portraits | null = null;
  cursors: MenuCursors | null = null;
  private shieldAt = new Map<string, { x: number; y: number }>();
  readyBanner = false;
  adapterStatus = "";
  adapterDebug = "";
  private mapIndex = 0;
  private slots: SelectSlot[] = [];
  private heroes: Record<string, HeroInfo> = {};
  private roster: string[] = [];
  private twoVtwo = false;
  private results: World | null = null;

  constructor(private teamColors: string[]) {}

  set(which: "title" | "select" | "map" | "results" | "pause" | "none"): void {
    this.which = which;
  }

  private heroPartners = false;
  updateSelect(slots: SelectSlot[], heroes: Record<string, HeroInfo>, roster: string[], twoVtwo: boolean, heroPartners = false): void {
    this.heroPartners = heroPartners;
    this.slots = slots;
    this.heroes = heroes;
    this.roster = roster;
    this.twoVtwo = twoVtwo;
  }

  updateMaps(maps: MapData[], index: number): void {
    this.maps = maps;
    this.mapIndex = index;
  }

  private resultPlayers: { tag: string | null; hero: string; team: number; cpu: boolean }[] = [];
  showResults(w: World, players: { tag: string | null; hero: string; team: number; cpu: boolean }[] = [], _names: Record<string, string> = {}): void {
    this.results = w;
    this.resultPlayers = players;
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
    if (this.which === "none") return;
    if (this.which !== "select") {
      ctx.fillStyle = this.which === "map" ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, W, H);
    }
    const blink = Math.floor(now * 2) % 2 === 0;
    if (this.cursors && (this.which === "select" || this.which === "map")) this.cursors.hits = [];
    if (this.which === "title") {
      drawLogo(ctx, W / 2, 30, 84);
      center(ctx, W, "A FEUD TOURNAMENT. THE FALLEN RISE AGAIN.", 120, "#f0e4c8", 0.9);
      if (blink) {
        const it: [string, string][] = [["S", "PRESS START"]];
        prompt(ctx, Math.round((W - promptWidth(it, 1.1)) / 2), 152, it, 1.1);
      }
      center(ctx, W, "PRESS ANY BUTTON OR KEY TO JOIN  ·  CLICK ONCE FOR SOUND", 206, "#b8b0a0", 0.75);
      if (this.adapterStatus) center(ctx, W, this.adapterStatus, 220, "#d8c890", 0.7);
      if (this.adapterDebug) center(ctx, W, this.adapterDebug, 230, "#a8a090", 0.6);
    } else if (this.which === "select") this.drawSelect(ctx, W, H, now, blink);
    else if (this.which === "map") this.drawMap(ctx, W, H, blink);
    if (this.cursors && (this.which === "select" || this.which === "map")) {
      if (this.which === "select") {
        const labels = this.slots.map((sl, i) => (i >= 2 && (!this.twoVtwo || !this.heroPartners) ? "" : sl.cpu ? "CPU" : `${i + 1}`));
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
    else if (this.which === "pause") {
      paintedText(ctx, "PAUSE", W / 2, 30, "#f0c030", 1.6);
      const rows: [string, string][] = [
        ["STICK", "MOVE"], ["A", "ATTACK · HOLDING A BOMB: THROW"], ["B", "SECONDARY"], ["R", "SPECIAL"], ["Z", "SUPER (FULL METER)"],
        ["L", "BLOCK · L + A: SHOVE · L + X / L + SMASH: DODGE"], ["C", "WHOLE ARMY: UP PUSH · DOWN HOLD · LEFT FOLLOW · RIGHT HUNT"],
        ["X", "HOLD + C: CALL 3 TROOPS · AT PAD: OUTPOSTS / UPGRADE"], ["Y", "AT PAD: TOWERS · AT YOUR KEEP: SHOP (BOMB, SHIELD, CANNON)"], ["L + C", "HOLD L: FLICK TROOPS, THEN FLICK ORDERS"], ["D-PAD", "COMMANDER GROUPS"],
      ];
      const bw = 300;
      const bx = Math.round((W - bw) / 2);
      occlude(ctx, bx, 50, bw, rows.length * 13 + 14);
      parchment(ctx, bx, 50, bw, rows.length * 13 + 14);
      rows.forEach(([k, v], i) => {
        const y = 59 + i * 13;
        const col = k === "A" ? PAD.a : k === "B" ? PAD.b : k === "C" ? PAD.c : k === "Z" || k === "R" || k === "L" ? PAD.z : "";
        if (col) padButton(ctx, bx + 20, y + 4.5, 5, col, k);
        else drawPlain(ctx, k, bx + 20 - textWidth(k, 0.6, true) / 2, y + 1.5, "#6a4424", 0.6, true);
        drawPlain(ctx, v, bx + 42, y + 0.5, "#3a2410", 0.72, true);
      });
      const kb = "KEYBOARD AND MOUSE: SEE CONTROLS IN THE MAIN MENU";
      shadowText(ctx, kb, W / 2 - textWidth(kb, 0.7) / 2, 200, "#f0e4c8", 0.7);
      const it: [string, string][] = [["S", "RESUME"], ["Z", "QUIT TO MENU"]];
      prompt(ctx, Math.round((W - promptWidth(it)) / 2), 216, it);
    } else if (this.which === "results" && this.results) this.drawResults(ctx, W, this.results, blink);
  }

  private drawSelect(ctx: CanvasRenderingContext2D, W: number, H: number, _now: number, blink: boolean): void {
    wall(ctx, W, H);
    const floorY = H - 26;
    woodFloor(ctx, floorY, W, H);
    beam(ctx, 4, 2, W - 8, 17);
    artTitle(ctx, "t_champion", "CHOOSE YOUR CHAMPION", W / 2, 3, 14);
    ribbon(ctx, W - 38, 4, 46, 11, this.twoVtwo ? "2 VS 2" : "1 VS 1", 0.55, undefined, nameImage(this.twoVtwo ? "t_2v2" : "t_1v1"));
    this.hit("mode", W - 38 - 28, 1, 56, 17);

    const n = this.roster.length;
    const sw = 38;
    const sh = 44;
    const gap = Math.min(12, Math.floor((W - 24 - n * sw) / Math.max(1, n - 1)));
    const gx = Math.round((W - (n * sw + (n - 1) * gap)) / 2);
    const gy = 28;
    this.roster.forEach((type, k) => {
      const x = gx + k * (sw + gap);
      const on = [0, 1, 2, 3].filter((i) => (i < 2 || (this.twoVtwo && this.heroPartners)) && this.slots[i]?.ready && this.slots[i].hero === type).map((i) => i % 2);
      this.hit(`hero:${type}`, x - 2, gy - 2, sw + 4, sh + 8);
      this.shieldAt.set(type, { x: x + sw / 2, y: gy + sh - 14 });
      const icon = this.portraits?.icon(type);
      shield(ctx, x, gy, sw, sh, on.length ? TEAM_FIELD[on[0]] : "#b04a2a", icon ? () => {
        const s2 = sw + 10;
        ctx.drawImage(icon, x + (sw - s2) / 2, gy - 1, s2, s2);
      } : null, on.length === 1 ? TEAM_BRIGHT[on[0]] : on.length === 2 ? "#f0c030" : "#8a8a94");
      const name = (this.heroes[type]?.name ?? type).toUpperCase();
      ribbon(ctx, x + sw / 2, gy + sh - 3, sw + 4, 9, name, Math.min(0.5, (sw + 2) / Math.max(1, textWidth(name, 1, true))), undefined, nameImage(type));
    });

    const order = this.twoVtwo ? [0, 2, 1, 3] : [0, 1];
    const slotsN = order.length;
    const bw = this.twoVtwo ? Math.min(72, Math.floor((W - 30) / slotsN) - 14) : Math.min(118, Math.floor(W * 0.3));
    const bgap = this.twoVtwo ? Math.floor((W - bw * slotsN) / (slotsN + 1)) : Math.floor((W - bw * 2) / 3);
    const by = 96;
    const bh = floorY - by - 6;
    order.forEach((i, k) => this.drawBanner(ctx, i, bgap + k * (bw + bgap), by, bw, bh, blink));
    if (!this.twoVtwo) {
      for (const [i, bx] of [[2, 14], [3, W - 14 - 40]] as const) {
        rolledBanner(ctx, bx, by, 40);
        this.portraits?.drop(i);
      }
      const t = this.heroPartners ? "2 VS 2: FOUR CHAMPIONS" : "COMMANDERS: 2 VS 2";
      shadowText(ctx, t, W / 2 - textWidth(t, 0.5) / 2, floorY - 11, "#b8b0a0", 0.5);
    }

    const it: [string, string][] = [["A", "TAKE / PLACE SEAL"], ["B", "BACK"], ["S", "START"]];
    prompt(ctx, Math.round((W - promptWidth(it, 0.7)) / 2), H - 13, it, 0.7);

    if (this.readyBanner) {
      const sw2 = Math.min(280, W - 60);
      scroll(ctx, W / 2, 124, sw2, 34);
      this.hit("go", W / 2 - sw2 / 2, 124, sw2, 34);
      const t = "THE GRUDGE IS SWORN!";
      drawPlain(ctx, t, W / 2 - textWidth(t, 1.35, true) / 2, 128, "#3a2410", 1.35, true);
      if (blink) {
        const p = "PRESS START";
        drawPlain(ctx, p, W / 2 - textWidth(p, 0.7, true) / 2, 146, "#8a1810", 0.7, true);
      }
    }
  }

  private hit(id: string, x: number, y: number, w: number, h: number): void {
    this.cursors?.hits.push({ id, x, y, w, h });
  }

  private kindPlaque(ctx: CanvasRenderingContext2D, i: number, cx: number, y: number, s: SelectSlot): void {
    cx = Math.round(cx);
    const label = s.cpu ? "CPU" : i >= 2 && !this.heroPartners ? "COMMANDER" : "PLAYER";
    const pw = Math.max(26, textWidth(label, 0.5, true) + 10);
    if (s.cpu) cx -= 16;
    const hovered = this.cursors?.cursors.some((c) => c.active && c.hover === `kind:${i}`);
    ctx.fillStyle = INK;
    ctx.fillRect(cx - pw / 2 - 1, y - 1, pw + 2, 10);
    texturedRect(ctx, "wood", cx - pw / 2, y, pw, 8, hovered ? "#e0b060" : "#a07040", 0, 1);
    drawPlain(ctx, label, cx - textWidth(label, 0.5, true) / 2, y + 1.6, s.cpu ? "#d8d8e0" : "#f8e8b0", 0.5, true);
    this.hit(`kind:${i}`, cx - pw / 2 - 2, y - 2, pw + 4, 12);
    if (s.cpu) {
      const lv = `LV ${s.level}`;
      const lw = textWidth(lv, 0.45, true) + 8;
      const ly = y + 0.5;
      cx += 16 + pw / 2 + lw / 2 - 6;
      const hl = this.cursors?.cursors.some((c) => c.active && c.hover === `lvl:${i}`);
      ctx.fillStyle = INK;
      ctx.fillRect(cx - lw / 2 - 1, ly - 1, lw + 2, 9);
      texturedRect(ctx, "parch", cx - lw / 2, ly, lw, 7, hl ? "#f0d890" : "#c8b088", 0, 1);
      drawPlain(ctx, lv, cx - textWidth(lv, 0.45, true) / 2, ly + 1.2, "#3a2410", 0.45, true);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k < s.level ? "#c81818" : "rgba(0,0,0,0.3)";
        ctx.fillRect(cx + lw / 2 + 3 + k * 4, ly + 4 - k, 3, 3 + k);
      }
      this.hit(`lvl:${i}`, cx - lw / 2 - 2, ly - 2, lw + 18, 11);
    }
  }

  private drawBanner(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, w: number, h: number, blink: boolean): void {
    const s = this.slots[i];
    const active = !!s && (i < 2 || this.twoVtwo);
    const team = i % 2;
    if (!s || !active) {
      rolledBanner(ctx, x, y, w);
      this.portraits?.drop(i);
      return;
    }
    const commander = i >= 2 && !this.heroPartners;
    const human = s.joined && !s.cpu;
    const showHero = true;
    const notch = 10;
    banner(ctx, x, y, w, h, showHero ? TEAM_CLOTH[team] : "#c8bc9c", notch);
    const tagged = !s.cpu && !commander && !!s.tag;
    const label = tagged ? s.tag! : `P${i + 1}`;
    const tagHot = !s.cpu && !commander && !!this.cursors?.cursors.some((c) => c.active && c.hover === `tag:${i}`);
    paintedText(ctx, label, x + w / 2, y + 7, tagHot ? "#fff4b0" : tagged ? "#f8e8c0" : "#f0c030", tagged ? Math.min(1.05, (w - 34) / Math.max(1, textWidth(label, 1, true))) : 1.05);
    if (!s.cpu && !commander) {
      this.hit(`tag:${i}`, x + 4, y + 3, w - 8, 13);
      if (tagHot) shadowText(ctx, "SIGN NAME", x + w / 2 - textWidth("SIGN NAME", 0.42) / 2, y - 7, "#f8e8c0", 0.42);
    }

    const def = this.heroes[s.hero];
    const hy = y + 26;
    const hh = h - notch - 50;
    if (showHero && this.portraits) {
      const cv = this.portraits.stage(i, s.hero, team, s.ready);
      const k = Math.min((w + 30) / cv.width, (hh + 14) / cv.height);
      const dw = cv.width * k;
      const dh = cv.height * k;
      ctx.drawImage(cv, x + (w - dw) / 2, hy + hh - dh + 4, dw, dh);
    } else {
      this.portraits?.drop(i);
      paintedText(ctx, "?", x + w / 2, hy + hh / 2 - 18, "#6a4a28", 3.4);
    }
    this.kindPlaque(ctx, i, x + w / 2, y + 18, s);
    const name = (showHero ? def?.name ?? s.hero : "RANDOM").toUpperCase();
    const ry = y + h - notch - 22;
    ribbon(ctx, x + w / 2, ry, w + 6, 11, name, Math.min(0.8, (w + 2) / Math.max(1, textWidth(name, 1, true))), undefined, showHero ? nameImage(s.hero) : null);
    if (showHero) {
      (["a", "b", "r", "z"] as const).forEach((a, j) => {
        const cx = x + (w / 4) * (j + 0.5);
        abilityIcon(ctx, def?.abilities?.[a]?.kind ?? "none", cx, ry + 17, 8);
      });
    } else if (blink) {
      const t = "PRESS A";
      shadowText(ctx, t, x + w / 2 - textWidth(t, 0.5) / 2, ry + 14, "#f0c030", 0.5);
    }
    if (s.ready && !commander && human) {
      waxSeal(ctx, x + w - 8, y + 14, 10, "#a8141a", "combo");
      const t = "SWORN";
      shadowText(ctx, t, x + w - 8 - textWidth(t, 0.5) / 2, y + 26, "#f4ecd8", 0.5);
    }
  }

  private drawMap(ctx: CanvasRenderingContext2D, W: number, H: number, _blink: boolean): void {
    table(ctx, W, H);
    beam(ctx, 4, 2, W - 8, 17);
    artTitle(ctx, "t_field", "CHOOSE THE FIELD", W / 2, 3, 14);

    const random = this.mapIndex >= this.maps.length;
    const d = random ? null : this.maps[this.mapIndex];
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
    if (!random && this.portraits) ctx.drawImage(this.portraits.mapLive(this.mapIndex, iw, ih), 12, 12, iw, ih);
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
    const n = this.maps.length + 1;
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
      if (k < this.maps.length) {
        const t = this.portraits?.mapThumb(k, tw, th);
        if (t) ctx.drawImage(t, 5, 5, tw, th);
      } else {
        texturedRect(ctx, "parch", 5, 5, tw, th, "#c8a878", 0, 1);
        drawPlain(ctx, "?", 5 + tw / 2 - textWidth("?", 2.4, true) / 2, 5 + th / 2 - 13, "#5a3a18", 2.4, true);
      }
      const label = k < this.maps.length ? this.maps[k].name.toUpperCase().replace(/^GRUDGE\w*\s*/, "") : "RANDOM";
      drawPlain(ctx, label, 6, th + 8, sel ? "#8a1810" : "#3a2410", 0.62, true);
      pin(ctx, cw / 2, 3, sel ? "#c81818" : "#8a8a90");
      ctx.restore();
      if (sel) goldArrow(ctx, cx - 6, cy + chh / 2, -1, 6);
    }
    const it: [string, string][] = [["A", "TO BATTLE"], ["B", "BACK"], ["S", "START"]];
    prompt(ctx, Math.round((W - promptWidth(it, 0.7)) / 2), H - 13, it, 0.7);
  }

  private drawResults(ctx: CanvasRenderingContext2D, W: number, w: World, blink: boolean): void {
    const win = w.match.winner;
    const head = win < 0 ? "A DRAW" : `${win === 0 ? "BLUE" : "RED"} HOUSE WINS`;
    const bw = 230;
    banner(ctx, W / 2 - bw / 2, 12, bw, 40, win < 0 ? "#9a9080" : TEAM_CLOTH[win], 8);
    paintedText(ctx, head, W / 2, 22, "#f0c030", 1.5);
    const pw = 300;
    const px = Math.round((W - pw) / 2);
    const py = 60;
    const t = w.teams;
    const rows: [string, (i: number) => string | number][] = [
      ["CORE DAMAGE", (i) => Math.round(t[i].coreDamageDealt)],
      ["HERO KILLS", (i) => t[i].heroKills],
      ["SOLDIERS SLAIN", (i) => t[i].kills],
      ["BUILT", (i) => t[i].structuresBuilt],
      ["LOST", (i) => t[i].structuresLost],
    ];
    const ps = this.resultPlayers;
    const perTeam = Math.max(1, ...[0, 1].map((k) => ps.filter((p) => p.team === k).length));
    const ph = 30 + perTeam * 12 + rows.length * 12 + 8;
    parchment(ctx, px, py, pw, ph);
    const reason = w.match.reason.toUpperCase();
    drawPlain(ctx, reason, W / 2 - textWidth(reason, 0.55) / 2, py + 5, "#8a5a2a", 0.55);
    const cx = [px + 196, px + 262];
    ["BLUE", "RED"].forEach((n, k) => drawPlain(ctx, n, cx[k] - textWidth(n, 0.75, true) / 2, py + 15, TEAM_BOX[k], 0.75, true));
    [0, 1].forEach((k) => {
      ps.filter((p) => p.team === k).forEach((p, j) => {
        const y = py + 28 + j * 12;
        const icon = this.portraits?.icon(p.hero);
        const x = cx[k] - 30;
        if (icon) ctx.drawImage(icon, x - 2, y - 3, 12, 12);
        const nm = p.cpu ? "CPU" : p.tag ?? `P${ps.indexOf(p) + 1}`;
        drawPlain(ctx, nm, x + 11, y, "#3a2410", 0.55, true);
        if (win === k) waxSeal(ctx, x + 58, y + 3.5, 3.5, "#a8141a", "combo");
      });
    });
    const ry = py + 30 + perTeam * 12;
    band(ctx, px + 8, ry - 3, pw - 16, 1, "#6a4424", 0.5);
    rows.forEach(([label, f], i) => {
      const yy = ry + 2 + i * 12;
      drawPlain(ctx, label, px + 14, yy, "#4a3018", 0.68, true);
      for (const k of [0, 1]) {
        const v = String(f(k));
        drawPlain(ctx, v, cx[k] - textWidth(v, 0.75, true) / 2, yy, "#3a2410", 0.75, true);
      }
    });
    if (blink) {
      const it: [string, string][] = [["A", "CONTINUE"]];
      prompt(ctx, Math.round((W - promptWidth(it)) / 2), py + ph + 10, it);
    }
  }
}
