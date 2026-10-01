import { drawPlain, textWidth } from "./font";
import { band, texturedRect } from "./n64ui";
import type { PadState } from "../input/gamepads";

const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const COLS = 6;
const KEY_ROWS = KEYS.length / COLS;
const INK = "#0b0806";

export class NameEntry {
  text: string;
  row = 1;
  col = 0;
  pick = -1;
  private latch = { x: 0, y: 0 };
  private rep = { dir: "", at: 0 };

  constructor(start: string | null | undefined, private names: () => string[], private max: number) {
    this.text = start ?? "";
  }

  private rows(): number {
    return KEY_ROWS + 2;
  }

  private width(r: number): number {
    if (r === 0) return 1;
    if (r === this.rows() - 1) return 3;
    return COLS;
  }

  private moveDir(p: PadState, now: number): string {
    const sx = p.stickX + (p.held.right ? 1 : 0) - (p.held.left ? 1 : 0);
    const sy = p.stickY + (p.held.down ? 1 : 0) - (p.held.up ? 1 : 0);
    const dir = Math.max(Math.abs(sx), Math.abs(sy)) < 0.55 ? "" : Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? "r" : "l") : sy > 0 ? "d" : "u";
    if (dir !== this.rep.dir) {
      this.rep = { dir, at: now + 0.35 };
      return dir;
    }
    if (dir && now >= this.rep.at) {
      this.rep.at = now + 0.09;
      return dir;
    }
    return "";
  }

  type(ch: string): void {
    if (this.text.length < this.max) this.text += ch;
  }

  back(): void {
    this.text = this.text.slice(0, -1);
  }

  update(p: PadState, now: number): { done: boolean; tag?: string | null } | null {
    const d = this.moveDir(p, now);
    const n = this.rows();
    if (d === "u" || d === "d") {
      const prevW = this.width(this.row);
      this.row = (this.row + (d === "d" ? 1 : -1) + n) % n;
      const w = this.width(this.row);
      this.col = Math.min(w - 1, Math.floor((this.col / prevW) * w + (w > prevW ? 0.5 * (w / prevW) - 0.5 : 0)));
    }
    if (d === "l" || d === "r") {
      if (this.row === 0) {
        const list = this.names();
        if (list.length) {
          this.pick = ((this.pick + (d === "r" ? 1 : -1)) % list.length + list.length) % list.length;
          this.text = list[this.pick];
        }
      } else {
        const w = this.width(this.row);
        this.col = (this.col + (d === "r" ? 1 : -1) + w) % w;
      }
    }
    if (p.pressed.start) return this.finish();
    if (p.pressed.b) {
      if (!this.text) return { done: true };
      this.back();
    }
    if (p.pressed.a) {
      if (this.row === 0) {
        const list = this.names();
        if (list.length) {
          this.pick = (this.pick + 1) % list.length;
          this.text = list[this.pick];
        }
      } else if (this.row === n - 1) {
        if (this.col === 0) this.type("-");
        else if (this.col === 1) this.back();
        else return this.finish();
      } else this.type(KEYS[(this.row - 1) * COLS + this.col]);
    }
    return null;
  }

  private finish(): { done: boolean; tag: string | null } {
    const t = this.text.trim();
    return { done: true, tag: t || null };
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, now: number): void {
    band(ctx, x, y, w, h, INK, 0.88);
    const pad = 3;
    const fieldH = 11;
    ctx.fillStyle = INK;
    ctx.fillRect(x + pad - 1, y + pad - 1, w - pad * 2 + 2, fieldH + 2);
    texturedRect(ctx, "parch", x + pad, y + pad, w - pad * 2, fieldH, null, 0, 1);
    const fs = Math.min(0.75, (w - 12) / Math.max(1, textWidth("WWWWWW", 1, true)));
    const tw = textWidth(this.text, fs, true);
    const cw0 = textWidth("W", fs, true) * 0.8;
    const tx = x + w / 2 - (tw + cw0 + 1) / 2;
    drawPlain(ctx, this.text, tx, y + pad + 2, "#3a2410", fs, true);
    if (this.text.length < this.max && Math.floor(now * 2.5) % 2) {
      ctx.fillStyle = "#3a2410";
      ctx.fillRect(tx + tw + 1, y + pad + fieldH - 3, cw0, 1.5);
    }
    let cy = y + pad + fieldH + 3;
    const names = this.names();
    const rowH = Math.max(6, Math.min(11, (h - fieldH - pad * 2 - 14) / (KEY_ROWS + 2)));
    const hl = (rx: number, ry: number, rw: number, on: boolean) => {
      if (!on) return;
      ctx.fillStyle = "#f0c030";
      ctx.fillRect(rx - 1, ry, rw + 2, rowH - 1);
      ctx.fillStyle = "#8a1810";
      ctx.fillRect(rx, ry + 1, rw, rowH - 3);
    };
    const ts = Math.min(0.55, rowH / 13);
    const mid = (ry: number, sc: number) => ry + (rowH - 1) / 2 - (7 * 10 * Math.max(0.64, sc)) / 14.5;
    hl(x + pad, cy, w - pad * 2, this.row === 0);
    const nl = names.length ? `< ${this.pick >= 0 ? names[this.pick] : "SAVED NAMES"} >` : "NO SAVED NAMES";
    drawPlain(ctx, nl, x + w / 2 - textWidth(nl, ts * 0.9, true) / 2, mid(cy, ts * 0.9), this.row === 0 ? "#fff4c8" : "#c8b898", ts * 0.9, true);
    cy += rowH + 1;
    const cw = (w - pad * 2) / COLS;
    for (let r = 0; r < KEY_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = KEYS[r * COLS + c];
        const kx = x + pad + c * cw;
        const on = this.row === r + 1 && this.col === c;
        hl(kx + 0.5, cy, cw - 1, on);
        drawPlain(ctx, k, kx + cw / 2 - textWidth(k, ts, true) / 2, mid(cy, ts), on ? "#fff4c8" : "#e8dcc0", ts, true);
      }
      cy += rowH;
    }
    cy += 1;
    const bw = (w - pad * 2) / 3;
    ["-", "DEL", "OK"].forEach((t, c) => {
      const bx = x + pad + c * bw;
      const on = this.row === KEY_ROWS + 1 && this.col === c;
      hl(bx + 0.5, cy, bw - 1, on);
      drawPlain(ctx, t, bx + bw / 2 - textWidth(t, ts, true) / 2, mid(cy, ts), on ? "#fff4c8" : c === 2 ? "#a0e080" : "#e8dcc0", ts, true);
    });
    cy += rowH + 1;
    if (cy + 6 < y + h) {
      const hint = "B DEL · START OK";
      drawPlain(ctx, hint, x + w / 2 - textWidth(hint, 0.36) / 2, cy, "#c8b898", 0.36);
    }
  }
}
