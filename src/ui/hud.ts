import type { World } from "../sim/world";
import { setTextLayer } from "./font";
import { UNIT_TYPES, type Directive, type UnitType } from "../sim/types";
import type { Portraits } from "./portraits";
import { texturedRect } from "./n64ui";
import type { MapperUi } from "../input/commands";
import { buildCost, padNear } from "../sim/structures";
import { drawNum, drawText, textWidth } from "./font";

export const INK = "#0b0806";
export const PAD = { a: "#2f5fd8", b: "#2a9a48", c: "#e8b818", start: "#d82828", z: "#8a8a94", r: "#8a8a94" };

const DIR_NAME: Record<Directive, string> = { push: "PUSH", hold: "HOLD", follow: "FOLLOW", nearest: "HUNT", focus: "SIEGE" };
const TYPE_NAME: Record<UnitType | "all", string> = { grunt: "GRUNTS", ranged: "ARCHERS", heavy: "BRUTES", all: "ARMY" };
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
    const scale = 1;
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

  banner_(text: string, now: number, seconds = 2.2): void {
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
    if (this.banner && now < this.bannerUntil) this.drawBanner(ctx, W, now);
    if (!this.visible) return;
    this.drawClock(ctx, W, w, now);
    this.drawRelic(ctx, W, H, w, now);
    for (let t = 0; t < 2; t++) this.drawTeam(ctx, W, H, w, ui, t, now);
  }

  private drawBanner(ctx: CanvasRenderingContext2D, W: number, now: number): void {
    const age = now - this.bannerAt;
    const left = this.bannerUntil - now;
    const pop = age < 0.12 ? 1.6 - (age / 0.12) * 0.6 : 1;
    const s = 3.6 * pop;
    const tw = textWidth(this.banner, s, true);
    ctx.save();
    ctx.globalAlpha = Math.min(1, left * 5);
    drawNum(ctx, this.banner, Math.round((W - tw) / 2), 96 - (s - 3.6) * 5, "#ffffff", s);
    ctx.restore();
  }

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
      text = `P${(c?.hero?.player ?? 0) + 1} CARRIES THE GRUDGE`;
    } else {
      const left = Math.max(0, Math.ceil(cfg.returnSeconds - (w.time - r.since)));
      text = `GRUDGE LOOSE · ${left}`;
    }
    const y = MARGIN_Y + (w.match.phase === "sudden" ? 27 : 19);
    const flash = r.state === "carried" || r.state === "dropped" ? Math.floor(now * 3) % 2 === 0 : false;
    drawText(ctx, text, Math.round((W - textWidth(text, 0.72)) / 2), y, flash ? "#ffffff" : col, 0.72);
    if (r.state === "waiting" || !this.locate) return;
    const lift = r.state === "carried" ? 4.5 : 1.5;
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
    y += 12;

    const hero = w.heroOf(t);
    const frac = hero?.hero ? hero.hero.meter / w.data.heroes.baseline.superMax : 0;
    const full = frac >= 1;
    padButton(ctx, ax(5), y + 3, 5, full ? "#e8c030" : PAD.z, "Z");
    const flash = full && Math.floor(now * 5) % 2 === 0;
    meter(ctx, ax(14, 64), y + 1, 64, 4, frac, flash ? "#fff4a0" : "#f0b020");
    y += 12;
    const mate = w.players.filter((p) => p.team === t && !p.commander)[1];
    const mh = mate ? w.getAny(mate.heroId) : undefined;
    if (mh?.hero) {
      const f2 = mh.hero.meter / w.data.heroes.baseline.superMax;
      const lab = `P${mate!.player + 1}`;
      drawText(ctx, lab, right ? ax(0, textWidth(lab, 0.7)) : ax(0), y - 1, f2 >= 1 ? "#fff4a0" : "#d8d0c0", 0.7, true);
      meter(ctx, ax(14, 64), y + 1, 64, 3, f2, f2 >= 1 && Math.floor(now * 5) % 2 === 0 ? "#fff4a0" : "#f0b020");
      y += 9;
    }

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

    if (hero?.hero?.dead) {
      const n = Math.max(0, Math.ceil(hero.hero.respawnAt - w.time));
      const lab = "RESPAWN";
      const lw = textWidth(lab, 0.85);
      drawText(ctx, lab, ax(0, lw + 16), y + 2, "#ffb8a0", 0.85);
      drawNum(ctx, String(n), ax(lw + 4, 12), y - 1, "#ffffff", 1.3);
    } else if (hero?.hero) {
      const keys: ["b" | "r", string][] = [["b", PAD.b], ["r", PAD.r]];
      keys.forEach(([k, c], i) => {
        const left = (hero.hero!.cooldowns[k] ?? 0) - w.time;
        const bxx = ax(6 + i * 18);
        const ready = left <= 0;
        padButton(ctx, bxx, y + 6, 6.5, c, ready ? k.toUpperCase() : "", !ready);
        if (!ready) {
          const n = String(Math.ceil(left));
          drawNum(ctx, n, bxx - textWidth(n, 0.95, true) / 2 - 0.5, y + 1, "#ffffff", 0.95);
        }
      });
    }
    y += 18;

    const nt = this.notices[t];
    if (now < nt.until) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (nt.until - now) * 3);
      const tw = textWidth(nt.text, 0.85);
      drawText(ctx, nt.text, ax(0, tw), y, "#ffb8a0", 0.85);
      ctx.restore();
    }

    const slot = w.players.find((p) => p.team === t && !p.commander);
    const cmd = w.players.find((p) => p.team === t && p.commander);
    const mui = slot ? ui[slot.player] : null;
    const cui = cmd ? ui[cmd.player] : null;
    const opener = w.players.find((p) => p.team === t && ui[p.player] && ui[p.player]!.buildMenu !== "closed");
    const menuUi = opener ? ui[opener.player] : null;
    const menuHero = opener?.heroId;
    const crossY = H - 58;
    const crossX = right ? W - MARGIN_X - 62 : MARGIN_X + 62;
    if (menuUi && menuHero !== undefined) {
      const c = this.buildCross(w, t, menuHero, menuUi);
      if (c) this.drawCross(ctx, crossX, crossY, c, right, 1);
      return;
    }
    const o = this.orders[t];
    this.drawOrders(ctx, W, H, w, t, right, now);
    const picker = w.players.filter((p) => p.team === t).map((p) => ui[p.player]).find((u) => u && u.orderStage !== "none");
    const order: Directive[] = ["push", "follow", "nearest", "hold"];
    const orderCross = (group: UnitType | "all", lit: number, alpha: number) =>
      this.drawCross(ctx, crossX, crossY, { title: `ORDER ${TYPE_NAME[group]}`, items: order.map((d) => [DIR_NAME[d], ""]), lit, until: 0 }, right, alpha);
    if (picker?.orderStage === "pick") {
      this.drawCross(ctx, crossX, crossY, { title: "WHICH TROOPS?", items: [["ARCHERS", ""], ["GRUNTS", ""], ["BRUTES", ""], ["ALL", ""]], lit: -1, until: 0 }, right, 1);
    } else if (picker?.orderStage === "order") {
      const g = picker.orderGroup;
      const cur = g === "all" ? (UNIT_TYPES.every((k) => ts.directives[k] === ts.directives.grunt) ? ts.directives.grunt : null) : ts.directives[g];
      orderCross(g, cur ? order.indexOf(cur) : -1, 1);
    } else if (cui && cui.group !== "all") {
      orderCross(cui.group, order.indexOf(ts.directives[cui.group]), 1);
    } else if (now < o.until) {
      orderCross(o.type, order.indexOf(o.dir), Math.min(1, (o.until - now) * 2.5));
    }
    void mui;
  }

  portraits: Portraits | null = null;

  private drawOrders(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, t: number, right: boolean, now: number): void {
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

  private buildCross(w: World, team: number, heroId: number, mui: MapperUi): Cross | null {
    const hero = w.getAny(heroId);
    if (!hero?.alive) return null;
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
      ? { title: "TOWERS", items: [["DAMAGE", c("damage")], ["CONTROL", c("control")], ["SUPPORT", c("support")], ["CANCEL", ""]], lit: -1, until: 0 }
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
