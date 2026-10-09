// HUD callouts: transient text the match pushes at players.
//   banner  - one line under the clock ("P1 CARRIES THE GRUDGE"-style notices with team -1), or a big centred
//             word ("FIGHT!", "BLUE WINS") when `big`;
//   card    - a parchment card with a wax seal for map events (gates, mist, avalanche, lantern, tide, horns),
//             optionally counting down;
//   notice  - a per-team line above that team's build cross ("NEED 120 GOLD", build errors);
//   fall    - "<HOUSE> FALLS" when an FFA house is eliminated.
// Hud.update() feeds every sim event through digest(); the draw methods are called from Hud.draw().
import type { World } from "../../sim/world";
import { TEAM_NAMES } from "../../sim/types";
import { drawNum, drawPlain, drawText, textWidth } from "../font";
import { parchment, waxSeal } from "../uiPaint";
import { coinIcon } from "./icons";
import { INK, MARGIN_Y, wrapLines, type Frame } from "./paint";

type SimEvent = World["events"][number];

const ARM = ["WEST", "NORTH", "EAST", "SOUTH"];
const EVENT_RED = "#8a1810";
const BELL = "#8a5a10";

interface Card {
  title: string;
  sub: string;
  glyph: string;
  color: string;
  at: number;
  until: number;
  /** Countdown seconds shown after the title (0 = none). */
  count: number;
}

export class Callouts {
  private banner = "";
  private bannerAt = 0;
  private bannerUntil = 0;
  private bannerBig = false;
  /** Y of the small banner line: under the clock, lower when the clock has a second line. */
  bannerLineY = MARGIN_Y + 19;
  private card: Card | null = null;
  private notices: { text: string; until: number }[] = Array.from({ length: 4 }, () => ({ text: "", until: 0 }));
  private fall: { team: number; at: number; until: number } | null = null;
  /** World whose "gates are shut" card was already shown (once per match). */
  private lockCard: World | null = null;

  constructor(private teamColors: string[]) {}

  showBanner(text: string, now: number, seconds = 2.2, big = false): void {
    this.bannerBig = big;
    this.banner = text;
    this.bannerAt = now;
    this.bannerUntil = now + seconds;
  }

  bannerOn(now: number): boolean {
    return !!this.banner && now < this.bannerUntil;
  }

  get big(): boolean {
    return this.bannerBig;
  }

  cardOn(now: number): boolean {
    return !!this.card && now < this.card.until;
  }

  private showCard(title: string, sub: string, glyph: string, now: number, color = EVENT_RED, count = 0, seconds = 4) {
    this.card = { title, sub, glyph, color, at: now, until: now + Math.max(seconds, count + 0.6), count };
  }

  /** At match start with locked gates: one "THE GATES ARE SHUT" card. */
  checkLockdown(w: World, now: number): void {
    if (!w.mapEvents.locked || this.lockCard === w || w.time >= 3) return;
    this.lockCard = w;
    const left = Math.ceil(w.mapEvents.lockUntil - w.time);
    this.showCard("THE GATES ARE SHUT", `NO ONE GETS IN OR OUT FOR ${left}S · BUILD UP`, "bell", now, BELL, 0, 4.5);
  }

  /** Turns one sim event into a callout, if it is one. */
  digest(w: World, ev: SimEvent, now: number): void {
    this.mapEvent(w, ev, now);
    if (ev.type === "notice") {
      if (ev.team < 0) this.showBanner(ev.text, now);
      else if (this.notices[ev.team]) this.notices[ev.team] = { text: ev.text, until: now + 2 };
    } else if (ev.type === "eliminated") {
      this.fall = { team: ev.team, at: now, until: now + 3.5 };
    }
  }

  private mapEvent(w: World, ev: SimEvent, now: number): void {
    const team = (t: number) => (t >= 0 ? this.teamColors[t] : EVENT_RED);
    if (ev.type === "avalanche") {
      const arm = w.ffa ? ARM[ev.arm] + " ARM" : "";
      if (ev.stage === "warn")
        this.showCard("AVALANCHE!", `THE ${arm} RUMBLES · GET OUT OF THE LANE`, "peak", now, EVENT_RED, ev.seconds);
      else if (ev.stage === "slide")
        this.showCard("AVALANCHE!", `SNOW COMING DOWN THE ${arm}`, "peak", now, EVENT_RED, 0, 2.5);
    } else if (ev.type === "gates" && ev.lock) {
      // Lockdown gates: only the opening gets a card (the countdown is the padlock by the clock).
      if (ev.stage !== "warn")
        this.showCard("THE GATES OPEN", "EVERY KEEP IS OPEN · TO WAR!", "bell", now, BELL, 0, 3.5);
    } else if (ev.type === "gates") {
      const court = ev.pattern === 1;
      if (ev.stage === "warn")
        this.showCard(
          "THE BELLS RING",
          court ? "THE COURT OPENS · THE BORDER LANES SEAL" : "THE COURT SEALS · THE BORDER LANES OPEN",
          "bell",
          now,
          BELL,
          ev.seconds,
        );
    } else if (ev.type === "mist") {
      if (ev.stage === "warn")
        this.showCard("MIST ON THE RIVER", "ANYTHING IN THE MIST IS HIDDEN", "river", now, "#4a5a6a", ev.seconds);
      else if (ev.stage === "out")
        this.showCard("THE MIST LIFTS", "THE RIVERS ARE CLEAR AGAIN", "river", now, "#4a5a6a", 0, 3);
    } else if (ev.type === "lantern") {
      if (ev.stage === "rise")
        this.showCard("THE DEAD STIR", "A BONE LANTERN RISES FROM THE PIT", "hex", now, "#2a6a2a");
      else if (ev.stage === "fade")
        this.showCard("THE LANTERN GOES OUT", "IT WILL RISE AGAIN", "hex", now, "#2a6a2a", 0, 3);
      else if (ev.stage === "taken") {
        const h = w.getAny(ev.hero);
        const lt = w.mapEvents.lanternDef;
        const name = h ? w.teamName(h.team) : "SOMEONE";
        const pct = (m: number) => Math.round((m - 1) * 100);
        const sub = lt ? `+${pct(lt.damageMul)}% DAMAGE · +${pct(lt.speedMul)}% SPEED · ${lt.hauntSeconds}S` : "";
        this.showCard(`${name} IS HAUNTED`, sub, "hex", now, team(h?.team ?? -1));
      }
    } else if (ev.type === "horn") {
      this.showCard(
        `${w.teamName(ev.team)} BLOWS THE HORN`,
        `THE ${ARM[ev.arm]} ARM IS GETTING BURIED`,
        "peak",
        now,
        team(ev.team),
      );
    } else if (ev.type === "tide") {
      this.showCard(
        ev.high ? "HIGH TIDE" : "LOW TIDE",
        ev.high ? "THE FLATS FLOOD · EVERYONE ON THEM IS SLOWED" : "THE FLATS DRAIN · PUSH NOW",
        "tide",
        now,
        "#2a4a8a",
      );
    }
  }

  // ── Drawing ──

  drawBanner(ctx: CanvasRenderingContext2D, W: number, now: number): void {
    const age = now - this.bannerAt;
    const left = this.bannerUntil - now;
    ctx.save();
    ctx.globalAlpha = Math.min(1, left * 5);
    if (!this.bannerBig) {
      // Small line: a quick 15% pop-in.
      const s = 0.72 * (age < 0.12 ? 1.15 - (age / 0.12) * 0.15 : 1);
      drawText(ctx, this.banner, Math.round((W - textWidth(this.banner, s)) / 2), this.bannerLineY, "#ffffff", s);
    } else {
      // Big word: 40% pop-in, rising as it shrinks.
      const base = 3.6;
      const s = base * (age < 0.12 ? 1.4 - (age / 0.12) * 0.4 : 1);
      const tw = textWidth(this.banner, s, true);
      drawNum(ctx, this.banner, Math.round((W - tw) / 2), 96 - (s - base) * 5, "#ffffff", s);
    }
    ctx.restore();
  }

  drawCard(ctx: CanvasRenderingContext2D, W: number, w: World, now: number): void {
    const c = this.card!;
    const age = now - c.at;
    const left = c.until - now;
    const drop = age < 0.18 ? (1 - age / 0.18) * -8 : 0;
    const countdown = c.count > 0 ? Math.ceil(c.count - age) : 0;
    const title = countdown > 0 ? `${c.title} ${countdown}` : c.title;
    const ts = 0.95;
    const ss = 0.55;
    const bw = Math.round(Math.max(textWidth(title, ts), textWidth(c.sub, ss)) + 34);
    const bh = c.sub ? 25 : 17;
    const x = Math.round(W / 2 - bw / 2);
    // Over the match clock (drawn after it), so it reads as the headline while it shows.
    const y = Math.round(MARGIN_Y + 1 + drop);
    ctx.save();
    ctx.globalAlpha = Math.min(1, left * 4, age * 8);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    parchment(ctx, x, y, bw, bh);
    ctx.fillStyle = c.color;
    ctx.fillRect(x, y, 3, bh);
    ctx.fillRect(x + bw - 3, y, 3, bh);
    waxSeal(ctx, x + 13, y + bh / 2, 7, c.color, c.glyph);
    const flash = countdown > 0 && Math.floor(now * 4) % 2 === 0;
    drawPlain(ctx, title, x + 24, y + 3, flash ? "#d02010" : c.color, ts, true);
    if (c.sub) drawPlain(ctx, c.sub, x + 24, y + 15, "#3a2410", ss);
    ctx.restore();
  }

  /** FFA: "<HOUSE> HOUSE FALLS" across the screen for 3.5 s. */
  drawFall(ctx: CanvasRenderingContext2D, W: number, H: number, w: World, now: number): void {
    const f = this.fall;
    if (!f || now >= f.until || w.match.phase === "over") return;
    const name = `${TEAM_NAMES[f.team] ?? ""} HOUSE FALLS`;
    const age = now - f.at;
    const s = 2.4 * (age < 0.12 ? 1.3 - (age / 0.12) * 0.3 : 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, (f.until - now) * 4);
    drawNum(
      ctx,
      name,
      Math.round((W - textWidth(name, s, true)) / 2),
      Math.round(H * 0.3),
      this.teamColors[f.team] ?? "#ffffff",
      s,
    );
    ctx.restore();
  }

  /**
   * Team t's notice above its build cross at (crossX, crossY), jolting when it appears. Money notices get a coin;
   * others wrap and stay inside the team's half (or frame).
   */
  drawNotice(
    ctx: CanvasRenderingContext2D,
    t: number,
    W: number,
    crossX: number,
    crossY: number,
    right: boolean,
    F: Frame | null,
    now: number,
  ): void {
    const nt = this.notices[t];
    if (now >= nt.until) return;
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
      const lines = wrapLines(nt.text, Math.min(150, W / 2 - 12), s);
      const lo = F ? F.x + 4 : right ? W / 2 + 4 : 4;
      const hi = F ? F.x + F.w - 4 : right ? W : W / 2;
      lines.forEach((ln, k) => {
        const lw = textWidth(ln, s);
        const lx = Math.max(lo, Math.min(hi - (F ? 0 : 4) - lw, crossX - lw / 2 + jolt));
        drawText(ctx, ln, Math.round(lx), crossY - 48 - (lines.length - 1 - k) * 9, "#ffd0a0", s);
      });
    }
    ctx.restore();
  }
}
