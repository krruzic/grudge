// Name signing: the on-card keyboard a seat opens from its name plate to pick a saved name or sign a new one.
// Pads move over a letter grid (or a list of saved names); the keyboard seat types directly (key()).
// update() returns a TagResult when the entry closes: a chosen / created tag, null to clear the name, or
// undefined when cancelled. wire() is the [caps, text] shown to other machines online, drawn by drawSigning().
import { drawPlain, textWidth } from "./font";
import { band, texturedRect, waxSeal } from "./uiPaint";
import type { PadState } from "../input/gamepads";
import type { TagRef } from "../game/save";

export interface TagRow extends TagRef {
  rec: string;
  taken: boolean;
}

export type TagResult = { done: true; tag?: TagRef | null };

const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const COLS = 6;
const KEY_ROWS = KEYS.length / COLS;
const INK = "#0b0806";

export function drawSigning(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  typing: boolean,
  text: string,
  now: number,
): void {
  band(ctx, x, y, w, h, INK, 0.82);
  const head = "SIGNING NAME";
  const hs = Math.min(0.5, (w - 8) / Math.max(1, textWidth(head, 1, true)));
  drawPlain(ctx, head, x + w / 2 - textWidth(head, hs, true) / 2, y + 4, "#e8c870", hs, true);
  const fy = y + 14;
  ctx.fillStyle = INK;
  ctx.fillRect(x + 2, fy - 1, w - 4, 13);
  texturedRect(ctx, "parch", x + 3, fy, w - 6, 11, null, 0, 1);
  const fs = Math.min(0.75, (w - 12) / Math.max(1, textWidth("WWWWWW", 1, true)));
  const shown = typing ? text : "";
  const tw = textWidth(shown, fs, true);
  const cw = textWidth("W", fs, true) * 0.8;
  const tx = x + w / 2 - (tw + cw + 1) / 2;
  drawPlain(ctx, shown, tx, fy + 2, "#3a2410", fs, true);
  if (Math.floor(now * 2.5) % 2) {
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(tx + tw + 1, fy + 8, cw, 1.5);
  }
  const sub = typing ? "WRITING A NEW NAME" : "PICKING A SAVED NAME";
  const ss = Math.min(0.42, (w - 6) / Math.max(1, textWidth(sub, 1)));
  drawPlain(ctx, sub, x + w / 2 - textWidth(sub, ss) / 2, fy + 16, "#c8b898", ss);
  const dots = ".".repeat(1 + (Math.floor(now * 3) % 3));
  drawPlain(ctx, dots, x + w / 2 - textWidth("...", 0.6) / 2, fy + 26, "#e8c870", 0.6);
}

export class NameEntry {
  mode: "list" | "type" = "list";
  text = "";
  row = 1;
  col = 0;
  sel = 0;
  private scrollTop = 0;
  private refusedAt = -99;
  private rep = { dir: "", at: 0 };

  constructor(
    private current: string | null | undefined,
    private tags: () => TagRow[],
    private create: (name: string) => TagRef | null,
    private max: number,
  ) {
    const k = this.items().findIndex((it) => it.kind === "tag" && it.row.name === current);
    this.sel = k >= 0 ? k : 0;
  }

  private items(): ({ kind: "add" } | { kind: "none" } | { kind: "tag"; row: TagRow })[] {
    const out: ({ kind: "add" } | { kind: "none" } | { kind: "tag"; row: TagRow })[] = [{ kind: "add" }];
    for (const row of this.tags()) out.push({ kind: "tag", row });
    if (this.current) out.push({ kind: "none" });
    return out;
  }

  private selectable(k: number): boolean {
    const it = this.items()[k];
    return !!it && !(it.kind === "tag" && it.row.taken && it.row.name !== this.current);
  }

  private choose(now: number): TagResult | null {
    const it = this.items()[this.sel];
    if (!it || !this.selectable(this.sel)) {
      this.refusedAt = now;
      return null;
    }
    if (it.kind === "add") {
      this.mode = "type";
      this.text = "";
      this.row = 1;
      this.col = 0;
      return null;
    }
    if (it.kind === "none") return { done: true, tag: null };
    return { done: true, tag: { id: it.row.id, name: it.row.name } };
  }

  private step(dir: number): void {
    const n = this.items().length;
    for (let k = 1; k <= n; k++) {
      const j = (this.sel + dir * k + n * 2) % n;
      if (this.selectable(j)) {
        this.sel = j;
        break;
      }
    }
  }

  key(code: string, now: number): TagResult | null | false {
    const ch = /^Key[A-Z]$/.test(code)
      ? code.slice(3)
      : /^Digit[0-9]$/.test(code)
        ? code.slice(5)
        : code === "Minus"
          ? "-"
          : "";
    if (this.mode === "list") {
      if (code === "ArrowUp" || code === "KeyW") this.step(-1);
      else if (code === "ArrowDown" || code === "KeyS") this.step(1);
      else if (code === "Enter" || code === "Space" || code === "KeyE") return this.choose(now);
      else if (code === "Escape" || code === "Backspace" || code === "KeyQ") return { done: true };
      else return false;
      return null;
    }
    if (ch) this.type(ch);
    else if (code === "Backspace") this.back();
    else if (code === "Enter") return this.finish(now);
    else if (code === "Escape") this.mode = "list";
    else return false;
    return null;
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
    const dir =
      Math.max(Math.abs(sx), Math.abs(sy)) < 0.55
        ? ""
        : Math.abs(sx) > Math.abs(sy)
          ? sx > 0
            ? "r"
            : "l"
          : sy > 0
            ? "d"
            : "u";
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

  wire(): [number, string] {
    return this.mode === "type" ? [1, this.text] : [0, ""];
  }

  type(ch: string): void {
    if (this.text.length < this.max) this.text += ch;
  }

  back(): void {
    this.text = this.text.slice(0, -1);
  }

  update(p: PadState, now: number): TagResult | null {
    const d = this.moveDir(p, now);
    if (this.mode === "list") {
      if (d === "u" || d === "d") this.step(d === "d" ? 1 : -1);
      if (p.pressed.a || p.pressed.start) return this.choose(now);
      if (p.pressed.b) return { done: true };
      return null;
    }
    const n = this.rows();
    if (d === "u" || d === "d") {
      const prevW = this.width(this.row);
      this.row = (this.row + (d === "d" ? 1 : -1) + n) % n;
      const w = this.width(this.row);
      this.col = Math.min(w - 1, Math.floor((this.col / prevW) * w + (w > prevW ? 0.5 * (w / prevW) - 0.5 : 0)));
    }
    if (d === "l" || d === "r") {
      const w = this.width(this.row);
      this.col = (this.col + (d === "r" ? 1 : -1) + w) % w;
    }
    if (p.pressed.start) return this.finish(now);
    if (p.pressed.b) {
      if (!this.text) this.mode = "list";
      else this.back();
      return null;
    }
    if (p.pressed.a) {
      if (this.row === 0) this.mode = "list";
      else if (this.row === n - 1) {
        if (this.col === 0) this.type("-");
        else if (this.col === 1) this.back();
        else return this.finish(now);
      } else this.type(KEYS[(this.row - 1) * COLS + this.col]);
    }
    return null;
  }

  private finish(now: number): TagResult | null {
    if (!this.text.trim()) {
      this.mode = "list";
      return null;
    }
    const taken = this.tags().find((t) => t.name === this.text && t.taken && t.name !== this.current);
    const ref = taken ? null : this.create(this.text);
    if (!ref) {
      this.refusedAt = now;
      return null;
    }
    return { done: true, tag: ref };
  }

  private drawList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, now: number): void {
    band(ctx, x, y, w, h, INK, 1);
    texturedRect(ctx, "wood", x + 1, y + 1, w - 2, h - 2, "#4a3020", 0, 1);
    band(ctx, x + 1, y + 1, w - 2, h - 2, INK, 0.35);
    const pad = 3;
    const head = "SIGN YOUR NAME";
    const hs = Math.min(0.5, (w - 8) / Math.max(1, textWidth(head, 1, true)));
    drawPlain(ctx, head, x + w / 2 - textWidth(head, hs, true) / 2, y + pad + 1, "#e8c870", hs, true);
    const items = this.items();
    const top = y + pad + 10;
    const rowH = 13;
    const vis = Math.max(1, Math.floor((y + h - pad - 8 - top) / rowH));
    if (this.sel < this.scrollTop) this.scrollTop = this.sel;
    if (this.sel >= this.scrollTop + vis) this.scrollTop = this.sel - vis + 1;
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, items.length - vis));
    const refused = now - this.refusedAt < 0.5;
    const sx = refused ? Math.round(Math.sin(now * 80) * 1.5) : 0;
    for (let k = this.scrollTop; k < Math.min(items.length, this.scrollTop + vis); k++) {
      const it = items[k];
      const ry = top + (k - this.scrollTop) * rowH;
      const on = k === this.sel;
      const rx = x + pad + (on ? sx : 0);
      const rw = w - pad * 2;
      const dim = it.kind === "tag" && it.row.taken && it.row.name !== this.current;
      ctx.fillStyle = on ? "#f0c030" : INK;
      ctx.fillRect(rx - 1, ry - 1, rw + 2, rowH - 1);
      if (it.kind === "add") texturedRect(ctx, "wood", rx, ry, rw, rowH - 3, on ? "#c83020" : "#8a2418", 0, 1);
      else texturedRect(ctx, "parch", rx, ry, rw, rowH - 3, dim ? "#7a6a58" : on ? "#f8e4a8" : "#c8b088", 0, 1);
      band(ctx, rx, ry, rw, 1, "#ffffff", 0.18);
      band(ctx, rx, ry + rowH - 4, rw, 1, INK, 0.35);
      const cy = ry + (rowH - 3) / 2;
      if (it.kind === "add") {
        const t = "ADD >";
        const ts = Math.min(0.62, (rw - 6) / Math.max(1, textWidth(t, 1, true)));
        drawPlain(ctx, t, rx + rw / 2 - textWidth(t, ts, true) / 2, cy - 3.2, "#fff0c8", ts, true);
        continue;
      }
      if (it.kind === "none") {
        const t = "NO NAME";
        const ts = Math.min(0.5, (rw - 6) / Math.max(1, textWidth(t, 1, true)));
        drawPlain(ctx, t, rx + rw / 2 - textWidth(t, ts, true) / 2, cy - 2.6, "#5a3a1c", ts, true);
        continue;
      }
      const mine = it.row.name === this.current;
      waxSeal(ctx, rx + 5.5, cy, 3.4, dim ? "#5a4a3a" : mine ? "#c8a020" : "#a8141a", "none");
      const avail = rw - 15 - (dim ? 0 : textWidth(it.row.rec, 0.4, true) + 3);
      const ns = Math.min(0.58, avail / Math.max(1, textWidth(it.row.name, 1, true)));
      drawPlain(ctx, it.row.name, rx + 12.5, cy - 3, dim ? "#4a3a2a" : on ? "#8a1810" : "#3a2410", ns, true);
      if (dim) {
        const t = "TAKEN";
        ctx.save();
        ctx.translate(rx + rw - 3 - textWidth(t, 0.42, true) / 2, cy);
        ctx.rotate(-0.12);
        ctx.fillStyle = "#8a1810";
        ctx.fillRect(-textWidth(t, 0.42, true) / 2 - 1.5, -3.5, textWidth(t, 0.42, true) + 3, 7);
        drawPlain(ctx, t, -textWidth(t, 0.42, true) / 2, -2.2, "#f8e0c0", 0.42, true);
        ctx.restore();
      } else drawPlain(ctx, it.row.rec, rx + rw - 2 - textWidth(it.row.rec, 0.4, true), cy - 2, "#6a4424", 0.4, true);
    }
    const tri = (ty: number, up: boolean) => {
      ctx.fillStyle = "#e8c870";
      ctx.beginPath();
      ctx.moveTo(x + w - 7, ty + (up ? 3 : 0));
      ctx.lineTo(x + w - 3, ty + (up ? 3 : 0));
      ctx.lineTo(x + w - 5, ty + (up ? 0 : 3));
      ctx.closePath();
      ctx.fill();
    };
    if (this.scrollTop > 0) tri(top - 5, true);
    if (this.scrollTop + vis < items.length) tri(top + vis * rowH - 1, false);
    const hint = refused ? "THAT NAME IS TAKEN" : "A PICK · B BACK";
    const hsz = Math.min(0.36, (w - 6) / Math.max(1, textWidth(hint, 1)));
    drawPlain(ctx, hint, x + w / 2 - textWidth(hint, hsz) / 2, y + h - pad - 5, refused ? "#ff9070" : "#c8b898", hsz);
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, now: number): void {
    if (this.mode === "list") {
      this.drawList(ctx, x, y, w, h, now);
      return;
    }
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
    const refused = now - this.refusedAt < 1.2;
    const nl = refused ? "NAME TAKEN" : "< SAVED NAMES";
    drawPlain(
      ctx,
      nl,
      x + w / 2 - textWidth(nl, ts * 0.9, true) / 2,
      mid(cy, ts * 0.9),
      refused ? "#ff9070" : this.row === 0 ? "#fff4c8" : "#c8b898",
      ts * 0.9,
      true,
    );
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
      drawPlain(
        ctx,
        t,
        bx + bw / 2 - textWidth(t, ts, true) / 2,
        mid(cy, ts),
        on ? "#fff4c8" : c === 2 ? "#a0e080" : "#e8dcc0",
        ts,
        true,
      );
    });
    cy += rowH + 1;
    if (cy + 6 < y + h) {
      const hint = "B DEL · START ADD";
      drawPlain(ctx, hint, x + w / 2 - textWidth(hint, 0.36) / 2, cy, "#c8b898", 0.36);
    }
  }
}
