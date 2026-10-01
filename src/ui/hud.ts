import type { World } from "../sim/world";
import { setTextLayer } from "./font";
import { UNIT_TYPES, type Directive, type Entity, type UnitType } from "../sim/types";
import type { Portraits } from "./portraits";
import { parchment, texturedRect } from "./n64ui";
import { onHiLayer } from "./font";
import { learned, options } from "../sim/talents";
import type { MapperUi } from "../input/commands";
import { buildCost, padNear } from "../sim/structures";
import { drawNum, drawPlain, drawText, textWidth } from "./font";

export const INK = "#0b0806";
export const PAD = { a: "#2f5fd8", b: "#2a9a48", c: "#e8b818", start: "#d82828", z: "#8a8a94", r: "#8a8a94" };

const DIR_NAME: Record<Directive, string> = { push: "ATTACK", hold: "HOLD", follow: "FOLLOW", nearest: "HUNT", focus: "SIEGE", defend: "DEFEND" };
const TYPE_NAME: Record<UnitType | "all", string> = { grunt: "GRUNTS", ranged: "ARCHERS", heavy: "BRUTES", all: "ARMY" };
const PLAYER_TAG = ["#8ab0ff", "#ff9a8a", "#70e0d0", "#ffd060"];
const MARGIN_X = 14;
const MARGIN_Y = 10;

export class UiCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly hiCanvas: HTMLCanvasElement;
  readonly hi: CanvasRenderingContext2D;
  w = 427;
  h = 240;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "hudui";
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    this.hiCanvas = document.createElement("canvas");
    this.hiCanvas.className = "hudui";
    parent.appendChild(this.hiCanvas);
    this.hi = this.hiCanvas.getContext("2d")!;
  }

  begin(): CanvasRenderingContext2D {
    const h = 240;
    const w = Math.round((h * window.innerWidth) / window.innerHeight);
    const scale = 2;
    const pw = Math.round(w * scale);
    const ph = Math.round(h * scale);
    if (w !== this.w || this.canvas.width !== pw || this.canvas.height !== ph) {
      this.w = w;
      this.h = h;
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.ctx.setTransform(pw / w, 0, 0, ph / h, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.clearRect(0, 0, this.w, this.h);
    const hk = Math.min(4, Math.max(1, (window.innerHeight * (window.devicePixelRatio || 1)) / h));
    const hw = Math.round(w * hk);
    const hh = Math.round(h * hk);
    if (this.hiCanvas.width !== hw || this.hiCanvas.height !== hh) {
      this.hiCanvas.width = hw;
      this.hiCanvas.height = hh;
    }
    this.hi.setTransform(1, 0, 0, 1, 0, 0);
    this.hi.clearRect(0, 0, hw, hh);
    setTextLayer(this.ctx, this.hi, hw / w, pw / w);
    return this.ctx;
  }
}

export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, alpha = 0.92): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 3);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(220,228,255,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 1.5);
  ctx.stroke();
  ctx.restore();
}

export function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, color: string): void {
  const f = Math.max(0, Math.min(1, frac));
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, (h + 3) / 2);
  ctx.fill();
  ctx.strokeStyle = "#e8e4dc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - 0.5, y - 0.5, w + 1, h + 1, (h + 1) / 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(20,18,24,0.85)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  if (f > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * f, h);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x, y, w * f, 1);
    ctx.restore();
  }
  ctx.restore();
}

export function padButton(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, label: string, dim = false): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.arc(x + 1, y + 1, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (dim) {
    ctx.fillStyle = "rgba(16,14,20,0.82)";
    ctx.beginPath();
    ctx.arc(x, y, r - 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.15, y - r * 0.45, r * 0.6, r * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (label) {
    const s = (r * 1.45) / 10;
    drawText(ctx, label, x - textWidth(label, s) / 2, y - r * 0.68, dim ? "#a8a8b0" : "#ffffff", s);
  }
}

function cArrow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, lit: boolean): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit ? PAD.c : "#6a5a20";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = lit ? "#3a2c00" : "#2a2410";
  ctx.beginPath();
  ctx.moveTo(r * 0.55, 0);
  ctx.lineTo(-r * 0.3, -r * 0.45);
  ctx.lineTo(-r * 0.3, r * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function bombIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number): void {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.5, y - r * 0.6);
  ctx.quadraticCurveTo(x + r * 1.1, y - r * 1.4, x + r * 1.3, y - r * 1.2);
  ctx.stroke();
  ctx.strokeStyle = "#d8c088";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a3a44";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a8a98";
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  const on = Math.floor(now * 10) % 2 === 0;
  ctx.fillStyle = on ? "#fff0a0" : "#ff7020";
  ctx.beginPath();
  ctx.arc(x + r * 1.3, y - r * 1.2, on ? 1.6 : 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function relicIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  const horn = (s: number) => {
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.45, y - r * 0.3);
    ctx.quadraticCurveTo(x + s * r * 1.5, y - r * 0.4, x + s * r * 1.3, y - r * 1.4);
    ctx.quadraticCurveTo(x + s * r * 1.05, y - r * 0.75, x + s * r * 0.4, y - r * 0.75);
    ctx.closePath();
  };
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass ? "#f0d070" : INK;
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    horn(-1);
    if (pass) ctx.fill(); else ctx.stroke();
    horn(1);
    if (pass) ctx.fill(); else ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.75 + 0.9, r + 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#a8682a";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.75, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8a850";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.3, r * 0.25, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(x - r * 0.45, y + r * 0.35, r * 0.25, r * 0.2);
  ctx.fillRect(x + r * 0.2, y + r * 0.35, r * 0.25, r * 0.2);
  ctx.restore();
}

function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.8 + 0.8, r + 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f0b820";
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffe890";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.2, y - r * 0.1, r * 0.35, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b07810";
  ctx.fillRect(x - 0.5, y - r * 0.5, 1, r);
  ctx.restore();
}

function armyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, team: string): void {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x - r - 0.8, y + r * 0.7 + 0.8);
  ctx.lineTo(x - r - 0.8, y - r * 0.1);
  ctx.arc(x, y - r * 0.1, r + 0.8, Math.PI, 0);
  ctx.lineTo(x + r + 0.8, y + r * 0.7 + 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#c8ccd4";
  ctx.beginPath();
  ctx.moveTo(x - r, y + r * 0.7);
  ctx.lineTo(x - r, y - r * 0.1);
  ctx.arc(x, y - r * 0.1, r, Math.PI, 0);
  ctx.lineTo(x + r, y + r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = team;
  ctx.fillRect(x - r * 0.3, y - r * 1.1, r * 0.6, r * 1.2);
  ctx.fillStyle = INK;
  ctx.fillRect(x - r * 0.75, y + r * 0.05, r * 1.5, r * 0.25);
  ctx.restore();
}

function coreIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, team: string, shield: boolean): void {
  ctx.save();
  const gem = (k: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.25 - k);
    ctx.lineTo(x + r * 0.8 + k, y);
    ctx.lineTo(x, y + r * 1.25 + k);
    ctx.lineTo(x - r * 0.8 - k, y);
    ctx.closePath();
  };
  if (shield) {
    ctx.fillStyle = "rgba(174,232,255,0.6)";
    gem(2.2);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  gem(0.9);
  ctx.fill();
  ctx.fillStyle = team;
  gem(0);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.25);
  ctx.lineTo(x - r * 0.8, y);
  ctx.lineTo(x - r * 0.2, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function times(ctx: CanvasRenderingContext2D, x: number, y: number): number {
  drawText(ctx, "×", x, y + 1, "#b8c4e8", 0.9);
  return textWidth("×", 0.9) + 1.5;
}

interface Cross {
  title: string;
  items: [string, string][];
  lit: number;
  until: number;
}

const talentUrls = import.meta.glob("../../assets/ui/talents/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const talentImgs = new Map<string, HTMLImageElement>();
for (const [p, url] of Object.entries(talentUrls)) {
  const im = new Image();
  im.src = url;
  talentImgs.set(p.split("/").pop()!.replace(".png", ""), im);
}

export function talentIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, dim = false, low = false): void {
  const im = talentImgs.get(id);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, size + 2, size + 2);
  texturedRect(ctx, "stone", x, y, size, size, dim ? "#5a5048" : "#b8a888", 0, 0.5);
  if (im?.complete && im.naturalWidth) {
    const a = dim ? 0.35 : 1;
    const draw = low ? (f: (c: CanvasRenderingContext2D) => void) => f(ctx) : (f: (c: CanvasRenderingContext2D) => void) => onHiLayer(ctx, f);
    draw((c) => {
      c.save();
      c.globalAlpha *= a;
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.drawImage(im, x, y, size, size);
      c.restore();
    });
  } else {
    ctx.fillStyle = dim ? "#6a6058" : "#ffe890";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function hudWrap(s: string, width: number, scale: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, scale) > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export class Hud {
  private visible = false;
  private banner = "";
  private bannerAt = 0;
  private bannerUntil = 0;
  private notices: { text: string; until: number }[] = [{ text: "", until: 0 }, { text: "", until: 0 }];
  private orders: { type: UnitType | "all"; dir: Directive; until: number }[] = [
    { type: "all", dir: "follow", until: 0 },
    { type: "all", dir: "follow", until: 0 },
  ];
  private shownCoin = [0, 0];

  constructor(private teamColors: string[]) {}

  show(on: boolean): void {
    this.visible = on;
  }

  private bannerBig = false;

  banner_(text: string, now: number, seconds = 2.2, big = false): void {
    this.bannerBig = big;
    this.banner = text;
    this.bannerAt = now;
    this.bannerUntil = now + seconds;
  }

  update(w: World, _ui: (MapperUi | null)[], now: number): void {
    for (const ev of w.events) {
      if (ev.type === "notice") {
        if (ev.team < 0) this.banner_(ev.text, now);
        else this.notices[ev.team] = { text: ev.text, until: now + 2 };
      } else if (ev.type === "directive" && ev.team >= 0 && ev.team < 2) {
        this.orders[ev.team] = { type: ev.unitType, dir: ev.dir, until: now + 2.2 };
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, ui: (MapperUi | null)[], now: number): void {
    if (this.split >= 2) {
      const t = 3;
      ctx.fillStyle = INK;
      ctx.fillRect(Math.round(W / 2 - t / 2) - 1, 0, t + 2, H);
      texturedRect(ctx, "stone", Math.round(W / 2 - t / 2), 0, t, H, "#8a8070", 0, 0.5);
      if (this.split >= 3) {
        ctx.fillRect(0, Math.round(H / 2 - t / 2) - 1, W, t + 2);
        texturedRect(ctx, "stone", 0, Math.round(H / 2 - t / 2), W, t, "#8a8070", 0, 0.5);
      }
    }
    if (this.banner && now < this.bannerUntil) this.drawBanner(ctx, W, now);
    if (!this.visible) return;
    this.drawClock(ctx, W, w, now);
    this.drawRelic(ctx, W, H, w, now);
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

  private dense = false;
  rectOf: ((player: number) => { x: number; y: number; w: number; h: number } | null) | null = null;

  private drawPlayerPanel(ctx: CanvasRenderingContext2D, w: World, e: Entity, x0: number, y0: number, blockW: number, right: boolean, now: number, local: boolean, tag: string): number {
    const h = e.hero!;
    const ax = (dx: number, width = 0) => (right ? x0 + blockW - dx - width : x0 + dx);
    let y = y0;
    let px = 0;
    if (tag) {
      const tw = textWidth(tag, 0.62, true);
      drawText(ctx, tag, right ? ax(0, tw) : ax(0), y + 2, PLAYER_TAG[e.hero!.player] ?? "#d8d0c0", 0.62, true);
      px = tw + 4;
    }
    if (h.dead) {
      const n = Math.max(0, Math.ceil(h.respawnAt - w.time));
      const lab = `RESPAWN ${n}`;
      drawText(ctx, lab, right ? ax(px, textWidth(lab, 0.75)) : ax(px), y + 1, "#ffb8a0", 0.75);
    } else {
      const keys: ["b" | "r", string][] = [["b", PAD.b], ["r", PAD.r]];
      keys.forEach(([k, c], i) => {
        const left = (h.cooldowns[k] ?? 0) - w.time;
        const bxx = ax(px + 5 + i * 13);
        const ready = left <= 0;
        padButton(ctx, bxx, y + 5, 5, c, ready ? k.toUpperCase() : "", !ready);
        if (!ready) {
          const n = String(Math.ceil(left));
          drawNum(ctx, n, bxx - textWidth(n, 0.75, true) / 2 - 0.5, y + 1, "#ffffff", 0.75);
        }
      });
      px += 27;
      const frac = h.meter / w.data.heroes.baseline.superMax;
      const full = frac >= 1;
      padButton(ctx, ax(px + 4), y + 5, 4.5, full ? "#e8c030" : PAD.z, "Z");
      const mw = blockW - px - 12;
      meter(ctx, ax(px + 11, mw), y + 3, mw, 4, Math.min(1, frac), full && Math.floor(now * 5) % 2 === 0 ? "#fff4a0" : "#f0b020");
    }
    y += 12;
    const cfgXp = w.data.talents?.xp;
    if (!cfgXp || w.players.find((p) => p.heroId === e.id)?.commander) return y - y0;
    const lv = `LV ${h.level}`;
    const lw = textWidth(lv, 0.62, true);
    drawNum(ctx, lv, right ? ax(0, lw) : ax(0), y, "#ffe890", 0.62);
    const next = cfgXp.levels[h.level];
    const prev = cfgXp.levels[h.level - 1] ?? 0;
    const frac = next === undefined ? 1 : (h.xp - prev) / (next - prev);
    const isz = 9;
    let tx = lw + 4;
    for (const slot of ["r", "b", "a", "z"] as const) {
      const got = learned(w, e, slot);
      const ix = right ? ax(tx, isz) : ax(tx);
      if (got[0]) talentIcon(ctx, got[0].id, ix, y - 1, isz);
      else {
        ctx.fillStyle = INK;
        ctx.fillRect(ix - 1, y - 2, isz + 2, isz + 2);
        ctx.fillStyle = "#2a2430";
        ctx.fillRect(ix, y - 1, isz, isz);
      }
      tx += isz + 2;
    }
    const xw = Math.max(10, blockW - tx - 2);
    meter(ctx, right ? ax(tx + 1, xw) : ax(tx + 1), y + 3, xw, 2, frac, next === undefined ? "#ffd040" : "#8ad8ff");
    y += isz + 2;
    if (local && h.picks.length && Math.floor(now * 3) % 3 !== 0) {
      const msg = "LEVEL UP! FLICK C LEFT / RIGHT";
      drawText(ctx, msg, right ? ax(0, textWidth(msg, 0.55)) : ax(0), y, "#ffe060", 0.55);
      y += 7;
    }
    return y - y0;
  }

  private drawBanner(ctx: CanvasRenderingContext2D, W: number, now: number): void {
    const age = now - this.bannerAt;
    const left = this.bannerUntil - now;
    const pop = age < 0.12 ? 1.4 - (age / 0.12) * 0.4 : 1;
    const big = this.bannerBig;
    const base = big ? 3.6 : 1.35;
    const s = base * pop;
    const tw = textWidth(this.banner, s, true);
    ctx.save();
    ctx.globalAlpha = Math.min(1, left * 5);
    const y = big ? 96 - (s - base) * 5 : MARGIN_Y + 29 - (s - base) * 4;
    drawNum(ctx, this.banner, Math.round((W - tw) / 2), y, "#ffffff", s);
    ctx.restore();
  }

  split = 0;
  locate: ((x: number, y: number, z: number) => { x: number; y: number }) | null = null;

  private drawRelic(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, now: number): void {
    const r = w.arena.relic;
    const cfg = w.data.match.arena.relic;
    let text: string;
    let col = "#ffd870";
    if (r.state === "waiting") {
      const left = Math.ceil(r.since - w.time);
      text = `THE GRUDGE WAKES IN ${left}`;
      col = "#c8b890";
    } else if (r.state === "home") text = "THE GRUDGE AWAITS";
    else if (r.state === "carried") {
      const c = w.getAny(r.carrier);
      col = c ? this.teamColors[c.team] : col;
      text = r.channel > 0 ? `ENSHRINING · ${Math.ceil(cfg.enshrineSeconds - r.channel)}` : `P${(c?.hero?.player ?? 0) + 1} CARRIES THE GRUDGE · TO A TOWER, OUTPOST OR KEEP`;
    } else if (r.state === "shrined") {
      const s = w.get(r.shrineId);
      const where = s?.structure?.type === "core" ? "KEEP" : s?.structure && w.data.structures.types[s.structure.type as "barracks"]?.class === "production" ? "OUTPOST" : "TOWER";
      col = this.teamColors[r.team] ?? col;
      text = r.channel > 0 ? `STEALING THE GRUDGE · ${Math.ceil(cfg.stealSeconds - r.channel)}` : `${r.team === 0 ? "BLUE" : "RED"} HOLDS THE GRUDGE · ${where}`;
    } else {
      const left = Math.max(0, Math.ceil(cfg.returnSeconds - (w.time - r.since)));
      text = `GRUDGE LOOSE · ${left}`;
    }
    const y = MARGIN_Y + (w.match.phase === "sudden" ? 27 : 19);
    const flash = r.state === "carried" || r.state === "dropped" || (r.state === "shrined" && r.channel > 0) ? Math.floor(now * 3) % 2 === 0 : false;
    drawText(ctx, text, Math.round((W - textWidth(text, 0.72)) / 2), y, flash ? "#ffffff" : col, 0.72);
    if (r.state === "waiting" || !this.locate) return;
    const lift = r.state === "carried" ? 4.5 : r.state === "shrined" ? 6 : 1.5;
    const sp = this.locate(r.x, r.y + lift, r.z);
    const k = W / window.innerWidth;
    const sx = sp.x * k;
    const sy = sp.y * (H / window.innerHeight);
    const pad = 12;
    if (sx >= pad && sx <= W - pad && sy >= pad + 24 && sy <= H - pad) return;
    const cx = W / 2;
    const cy = H / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const s = Math.min((W / 2 - pad) / Math.max(1e-3, Math.abs(dx)), (H / 2 - pad) / Math.max(1e-3, Math.abs(dy)));
    const ex = cx + dx * s;
    const ey = Math.max(pad + 24, cy + dy * s);
    const ang = Math.atan2(dy, dx);
    const bob = Math.sin(now * 8) * 1.5;
    ctx.save();
    ctx.translate(ex - Math.cos(ang) * bob, ey - Math.sin(ang) * bob);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -6);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }

  private drawClock(ctx: CanvasRenderingContext2D, W: number, w: World, now: number): void {
    const m = w.data.match;
    const sudden = w.match.phase === "sudden";
    const remain = sudden ? m.matchSeconds + m.suddenDeathSeconds - w.time : m.matchSeconds - w.time;
    const r = Math.max(0, Math.ceil(remain));
    const txt = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
    const s = 1.7;
    const low = r <= 30 && Math.floor(now * 2) % 2 === 0;
    const col = sudden ? "#ff5a3a" : low ? "#ffd040" : "#ffffff";
    drawNum(ctx, txt, Math.round((W - textWidth(txt, s, true)) / 2), MARGIN_Y - 1, col, s);
    if (sudden) {
      const lab = "SUDDEN DEATH";
      drawText(ctx, lab, Math.round((W - textWidth(lab, 0.8)) / 2), MARGIN_Y + 17, "#ff9a7a", 0.8);
    }
  }

  private drawTeam(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, ui: (MapperUi | null)[], t: number, now: number): void {
    const right = t === 1;
    const col = this.teamColors[t];
    const blockW = 104;
    const x0 = right ? W - MARGIN_X - blockW : MARGIN_X;
    const ax = (dx: number, width = 0) => (right ? x0 + blockW - dx - width : x0 + dx);
    const ts = w.teams[t];
    const core = w.core(t);
    const shield = !!core?.structure?.shielded && !w.isSudden();
    let y = MARGIN_Y + 2;

    coreIcon(ctx, ax(5), y + 3.5, 4.2, col, shield);
    meter(ctx, ax(14, blockW - 14), y + 1, blockW - 14, 5, core ? core.hp / core.maxHp : 0, col);
    const ward = core?.structure?.ward ?? 0;
    if (ward > 0 && !w.isSudden()) meter(ctx, ax(14, blockW - 14), y + 8, blockW - 14, 2, ward / w.data.structures.core.ward, "#9fe0ff");
    y += ward > 0 && !w.isSudden() ? 15 : 12;

    this.shownCoin[t] += (ts.resource - this.shownCoin[t]) * Math.min(1, 0.25);
    const coin = String(Math.round(this.shownCoin[t]));
    const army = `${ts.unitCount}/${w.data.units.popCap}`;
    const cw = 8 + textWidth("×", 0.9) + 1.5 + textWidth(coin, 1.15, true);
    const aw = 9 + textWidth("×", 0.9) + 1.5 + textWidth(army, 1.15, true);
    let cx = ax(0, cw);
    coinIcon(ctx, cx + 3, y + 5, 3.8);
    cx += 8;
    cx += times(ctx, cx, y + 1);
    drawNum(ctx, coin, cx, y, "#ffd848", 1.15);
    let bx = right ? ax(cw + 10, aw) : ax(cw + 10);
    armyIcon(ctx, bx + 3.5, y + 5, 3.6, col);
    bx += 9;
    bx += times(ctx, bx, y + 1);
    const capped = ts.unitCount >= w.data.units.popCap;
    drawNum(ctx, army, bx, y, capped ? "#ff8a6a" : "#ffffff", 1.15);
    y += 16;

    let bxc = 0;
    for (const p of w.players) {
      const e = w.getAny(p.heroId);
      if (!e?.hero || e.team !== t || !e.alive) continue;
      const relic = w.arena.carrying(e);
      if (!relic && !e.hero.bomb) continue;
      const lab = relic ? "GRUDGE" : "A THROW";
      const lw = textWidth(lab, 0.7);
      const tag = w.players.filter((q) => q.team === t).length > 1 ? `P${p.player + 1} ` : "";
      const tw = tag ? textWidth(tag, 0.7) : 0;
      const bw = 12 + tw + lw;
      const x = right ? ax(bxc, bw) : ax(bxc);
      if (relic) relicIcon(ctx, x + 5, y + 6.5, 3.6);
      else bombIcon(ctx, x + 5, y + 7, 3.6, now);
      if (tag) drawText(ctx, tag, x + 12, y + 3, "#d8d0c0", 0.7);
      drawText(ctx, lab, x + 12 + tw, y + 3, relic ? (Math.floor(now * 3) % 2 ? "#ffe890" : "#ffffff") : "#ffc0a0", 0.7);
      bxc += bw + 6;
    }
    if (bxc > 0) y += 14;
    const anyLocal = ui.some(Boolean);
    const teamHeroes = w.players.filter((p) => p.team === t && !p.commander);
    const shown = teamHeroes.filter((p, k) => !!ui[p.player] || (!anyLocal && k === 0));
    const rectPx = (pl: number) => {
      const r = this.rectOf?.(pl);
      return r ? { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H } : null;
    };
    for (const p of shown) {
      const e = w.getAny(p.heroId);
      if (!e?.hero) continue;
      const r = rectPx(p.player);
      const px0 = r ? (right ? r.x + r.w - MARGIN_X - blockW : r.x + MARGIN_X) : x0;
      const py0 = r ? (r.y < 2 ? y + 2 : r.y + MARGIN_Y + 2) : y + 2;
      const h = this.drawPlayerPanel(ctx, w, e, px0, py0, blockW, right, now, !!ui[p.player], shown.length > 1 || teamHeroes.length > 1 ? `P${p.player + 1}` : "");
      if (!r) y = py0 + h;
    }
    const crossOf = (pl: number | undefined): [number, number] => {
      const r = pl === undefined ? null : rectPx(pl);
      if (!r) return [right ? W - MARGIN_X - 62 : MARGIN_X + 62, H - 58];
      return [right ? r.x + r.w - MARGIN_X - 62 : r.x + MARGIN_X + 62, r.y + r.h - 58];
    };
    const slot = w.players.find((p) => p.team === t && !p.commander);
    const cmd = w.players.find((p) => p.team === t && p.commander);
    const mui = slot ? ui[slot.player] : null;
    const cui = cmd ? ui[cmd.player] : null;
    const opener = w.players.find((p) => p.team === t && ui[p.player] && ui[p.player]!.buildMenu !== "closed");
    const menuUi = opener ? ui[opener.player] : null;
    const menuHero = opener?.heroId;
    const firstLocal = w.players.find((p) => p.team === t && ui[p.player]);
    let [crossX, crossY] = crossOf(opener?.player ?? firstLocal?.player);
    const nt = this.notices[t];
    if (now < nt.until) {
      const age = 2 - (nt.until - now);
      const jolt = age < 0.25 ? Math.sin(age * 60) * (1 - age / 0.25) * 2.5 : 0;
      const money = nt.text.startsWith("NEED");
      const s = money ? 1 : 0.85;
      const tw = textWidth(nt.text, s);
      ctx.save();
      ctx.globalAlpha = Math.min(1, (nt.until - now) * 3);
      if (money) {
        const cw = 9;
        const bx = Math.round(crossX - (tw + cw) / 2 + jolt);
        coinIcon(ctx, bx + 3.5, crossY - 43.5, 3.5);
        drawText(ctx, nt.text, bx + cw, crossY - 48, "#ff7060", s);
      } else {
        const maxW = Math.min(150, W / 2 - 12);
        const lines = hudWrap(nt.text, maxW, s);
        lines.forEach((ln, k) => {
          const lw = textWidth(ln, s);
          const lx = Math.max(right ? W / 2 + 4 : 4, Math.min((right ? W : W / 2) - 4 - lw, crossX - lw / 2 + jolt));
          drawText(ctx, ln, Math.round(lx), crossY - 48 - (lines.length - 1 - k) * 9, "#ffd0a0", s);
        });
      }
      ctx.restore();
    }
    const aimer = w.players.map((p) => w.getAny(p.heroId)).find((e) => e?.team === t && e.hero?.aim);
    if (aimer?.hero?.aim) {
      const left = Math.max(0, Math.ceil(aimer.hero.aim.until - w.time));
      const l1 = `AIM THE CANNON · ${left}`;
      const l2 = "A FIRE · B CANCEL";
      drawText(ctx, l1, Math.round(crossX - textWidth(l1, 0.85) / 2), crossY - 8, Math.floor(now * 4) % 2 ? "#ffd870" : "#ffffff", 0.85);
      drawText(ctx, l2, Math.round(crossX - textWidth(l2, 0.72) / 2), crossY + 6, "#e8e0d0", 0.72);
      return;
    }
    for (const learner of w.players.filter((p) => p.team === t && ui[p.player]?.learnReady && ui[p.player]!.buildMenu === "closed")) {
      const [lx, ly] = crossOf(learner.player);
      this.drawLearnCards(ctx, W, lx, ly, w, learner.heroId, right, now);
    }
    if (menuUi && menuHero !== undefined) {
      const c = this.buildCross(w, t, menuHero, menuUi);
      if (c) this.drawCross(ctx, crossX, crossY, c, right, 1);

      return;
    }
    const o = this.orders[t];
    const team = w.players.filter((p) => p.team === t).sort((a, b) => Number(b.commander) - Number(a.commander));
    const pickerP = team.find((p) => !!ui[p.player]);
    const picker = pickerP ? ui[pickerP.player] : null;
    if (pickerP) [crossX, crossY] = crossOf(pickerP.player);
    const group = picker?.group ?? "all";
    this.drawOrders(ctx, W, H, w, t, right, now, picker ? group : null);
    if (!picker) {
      if (now < o.until) this.orderCross(ctx, crossX, crossY, w, t, o.type, right, Math.min(1, (o.until - now) * 2.5), now, false);
      return;
    }
    const recent = Math.max(picker.lastOrderAt, picker.groupAt);
    const fresh = now - recent < 1.6;
    if (this.dense && !fresh) return;
    this.orderCross(ctx, crossX, crossY, w, t, group, right, fresh ? 1 : 0.5, now, now - picker.groupAt < 1.6);
    void mui;
    void cui;
  }

  private orderCross(ctx: CanvasRenderingContext2D, x: number, y: number, w: World, t: number, group: UnitType | "all", right: boolean, alpha: number, now: number, groupHint: boolean): void {
    const ts = w.teams[t];
    const order: Directive[] = ["push", "follow", "defend", "hold"];
    const cur = group === "all" ? (UNIT_TYPES.every((k) => ts.directives[k] === ts.directives.grunt) ? ts.directives.grunt : null) : ts.directives[group];
    const lit = cur ? order.indexOf(cur) : -1;
    this.drawCross(ctx, x, y, { title: `ORDER ${TYPE_NAME[group]}`, items: order.map((d) => [DIR_NAME[d], ""]), lit, until: 0 }, right, alpha);
    if (groupHint) {
      const hint = "D-PAD LEFT / RIGHT: WHO OBEYS";
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha + 0.2) * (Math.floor(now * 4) % 2 ? 1 : 0.85);
      drawText(ctx, hint, Math.round(x - textWidth(hint, 0.6) / 2), y + 22, "#ffe070", 0.6);
      ctx.restore();
    }
  }

  portraits: Portraits | null = null;

  private drawOrders(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, t: number, right: boolean, now: number, selected: UnitType | "all" | null): void {
    const ts = w.teams[t];
    const o = this.orders[t];
    const counts: Record<UnitType, number> = { grunt: 0, ranged: 0, heavy: 0 };
    for (const e of w.entities) if (e.alive && e.unit && e.team === t) counts[e.unit.type]++;
    const cw = 40;
    const pw = cw * 3 + 4;
    const ph = 17;
    const x0 = right ? W - MARGIN_X - pw : MARGIN_X;
    const y0 = H - ph - 6;
    ctx.fillStyle = INK;
    ctx.fillRect(x0 - 1, y0 - 1, pw + 2, ph + 2);
    texturedRect(ctx, "wood", x0, y0, pw, ph, "#6a4a30", 0, 0.6);
    const flash = now < o.until - 1.2;
    UNIT_TYPES.forEach((k, i) => {
      const cx = x0 + 2 + i * cw;
      if (selected && (selected === "all" || selected === k)) {
        ctx.fillStyle = "rgba(255,200,90,0.22)";
        ctx.fillRect(cx, y0 + 1, cw, ph - 2);
      }
      const hit = flash && (o.type === "all" || o.type === k);
      if (hit) {
        ctx.fillStyle = "rgba(255,220,120,0.35)";
        ctx.fillRect(cx, y0 + 1, cw, ph - 2);
      }
      const icon = this.portraits?.unitIcon(k, t);
      if (icon) ctx.drawImage(icon, cx - 1, y0 - 1, 17, 17);
      const word = DIR_NAME[ts.directives[k]];
      drawText(ctx, word, cx + 16, y0 + 2, hit ? "#ffe070" : "#f0e4c8", 0.62, true);
      const n = String(counts[k]);
      drawText(ctx, n, cx + 16, y0 + 9, "#c8b890", 0.55, true);
    });
  }

  private drawLearnCards(ctx: CanvasRenderingContext2D, W: number, cx: number, cy: number, w: World, heroId: number, right: boolean, now: number): void {
    const hero = w.getAny(heroId);
    const opt = hero?.alive ? options(w, hero) : null;
    if (!opt) return;
    const cw = 76;
    const gap = 4;
    const x0 = right ? Math.max(4, cx - 60 - cw * 2 - gap) : Math.min(W - cw * 2 - gap - 4, cx + 60);
    const isz = 26;
    const ds = 0.4;
    const lines = opt.list.map((o) => [...hudWrap(o.desc, cw - 6, ds).map((l) => [l, "#4a3018"]), ...(o.combo ? hudWrap(o.combo, cw - 6, ds).map((l) => [l, "#8a1810"]) : [])]);
    const nl = Math.max(...lines.map((l) => l.length));
    const h = isz + 14 + nl * 5.5 + 3;
    const y = Math.round(Math.min(cy - h / 2 + 4, 236 - h));
    const title = opt.slot === "a" ? "CHOOSE YOUR A STYLE" : opt.slot === "z" ? "SUPER UPGRADE" : `EVOLVE ${opt.slot.toUpperCase()}`;
    const pulse = Math.floor(now * 3) % 3 !== 0;
    drawText(ctx, title, x0 + cw + gap / 2 - textWidth(title, 0.6) / 2, y - 9, pulse ? "#ffe060" : "#fff4c8", 0.6);
    opt.list.forEach((o, k) => {
      const x = x0 + k * (cw + gap);
      parchment(ctx, x, y, cw, h);
      talentIcon(ctx, o.id, x + (cw - isz) / 2, y + 3, isz);
      const tag = k === 0 ? "<C" : "C>";
      drawText(ctx, tag, k === 0 ? x + 2 : x + cw - 2 - textWidth(tag, 0.5), y + 2, "#8a1810", 0.5);
      const s = Math.min(0.6, (cw - 4) / Math.max(1, textWidth(o.name, 1)));
      drawText(ctx, o.name, x + cw / 2 - textWidth(o.name, s) / 2, y + isz + 5, "#3a2410", s);
      lines[k].forEach(([l, c], j) => drawPlain(ctx, l, x + 3, y + isz + 13 + j * 5.5, c, ds));
    });
  }

  private buildCross(w: World, team: number, heroId: number, mui: MapperUi): Cross | null {
    const hero = w.getAny(heroId);
    if (!hero?.alive) return null;
    if (mui.buildMenu === "learn") {
      const opt = options(w, hero);
      if (!opt) return { title: "NOTHING TO LEARN", items: [["", ""], ["", ""], ["", ""], ["LATER", ""]], lit: -1, until: 0 };
      return { title: `EVOLVE ${opt.slot.toUpperCase()}`, items: [["", ""], [opt.list[0]?.name ?? "", ""], [opt.list[1]?.name ?? "", ""], ["LATER", ""]], lit: -1, until: 0 };
    }
    if (mui.buildMenu === "shop") {
      const sh = w.data.match.arena.shop;
      const ts = w.teams[team];
      const k = (n: number) => String(Math.round(n * w.costMul()));
      const wardWait = Math.ceil(ts.wardReadyAt - w.time);
      return { title: "KEEP SHOP", items: [["BOMB", k(sh.bomb.cost)], ["SHIELD", wardWait > 0 ? `${wardWait}S` : k(sh.ward.cost)], ["CANNON", k(sh.cannon.cost)], ["CANCEL", ""]], lit: -1, until: 0 };
    }
    if (mui.buildMenu === "call") {
      const ts = w.teams[team];
      const sq = w.data.units.squads;
      const k = (u: UnitType) => String(Math.round(sq.cost[u] * w.costMul()));
      const full = ts.unitCount >= w.data.units.popCap;
      const title = full ? "ARMY FULL" : w.time < ts.callReadyAt ? "MUSTERING..." : `CALL ${Math.min(sq.size, w.data.units.popCap - ts.unitCount)} TROOPS`;
      return { title, items: [["ARCHERS", k("ranged")], ["GRUNTS", k("grunt")], ["BRUTES", k("heavy")], ["CANCEL", ""]], lit: -1, until: 0 };
    }
    const pad = padNear(w, hero);
    if (!pad) return { title: "NO PAD HERE", items: [["", ""], ["", ""], ["", ""], ["", ""]], lit: -1, until: 0 };
    const c = (k: Parameters<typeof buildCost>[1]) => String(buildCost(w, k, false, team));
    const st = pad.structureId ? w.get(pad.structureId) : undefined;
    if (st?.structure && st.team === team) {
      const up = st.structure.level < 2 ? String(buildCost(w, st.structure.type as Parameters<typeof buildCost>[1], true, team)) : "";
      return { title: st.structure.level < 2 ? "UPGRADE" : "MAX LEVEL", items: [[up ? "UPGRADE" : "", up], ["", ""], ["", ""], ["CANCEL", ""]], lit: -1, until: 0 };
    }
    return mui.buildMenu === "tower"
      ? { title: "TOWERS", items: [["DAMAGE", c("damage")], ["CONTROL", c("control")], ["", ""], ["CANCEL", ""]], lit: -1, until: 0 }
      : { title: "OUTPOSTS", items: [["RANGE", c("range")], ["BARRACKS", c("barracks")], ["FOUNDRY", c("foundry")], ["CANCEL", ""]], lit: -1, until: 0 };
  }

  private drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, c: Cross, right: boolean, alpha: number): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    const r = 4.6;
    const d = 9;
    const pos: [number, number, number][] = [[0, -d, -Math.PI / 2], [-d, 0, Math.PI], [d, 0, 0], [0, d, Math.PI / 2]];
    const tw = textWidth(c.title, 0.8);
    drawText(ctx, c.title, x - tw / 2, y - d - (c.items[0][1] ? 32 : 23), "#ffffff", 0.8);
    pos.forEach(([dx, dy, ang], i) => {
      cArrow(ctx, x + dx, y + dy, r, ang, c.lit < 0 || c.lit === i);
      const [label, cost] = c.items[i];
      if (!label) return;
      const lit = c.lit < 0 || c.lit === i;
      const col = lit ? "#ffffff" : "#8a8478";
      const lw = textWidth(label, 0.75);
      let lx: number;
      let ly: number;
      if (i === 0) {
        lx = x - lw / 2;
        ly = y - d - 13;
      } else if (i === 3) {
        lx = x - lw / 2;
        ly = y + d + 5;
      } else if (i === 1) {
        lx = x - d - r - 3 - lw;
        ly = y - 4;
      } else {
        lx = x + d + r + 3;
        ly = y - 4;
      }
      drawText(ctx, label, lx, ly, col, 0.75);
      if (cost) {
        const cw = textWidth(cost, 0.8, true);
        const cx = i === 1 ? lx + lw - cw : i === 2 ? lx : lx + lw / 2 - cw / 2;
        const cy = i === 3 ? ly + 8 : i === 0 ? ly - 9 : ly + 8;
        drawNum(ctx, cost, cx, cy, "#ffd848", 0.8);
      }
    });
    void right;
    ctx.restore();
  }
}
