// Minimap (bottom centre; screen centre in 3-4 player split screen, an end of the divider with 2 stacked views) and the stock icons above it: one costume portrait
// per hero with an HP bar, greyed and crossed out while dead.
//
// The map image is the top-down render of the map's scenery (Portraits.mapTop); on top go the map-event
// overlays (tide cells, the mist band, avalanche lanes), objectives, soldiers, pads/buildings, keeps, the relic
// and heroes (only what every team can see: w.spottedByAll), plus local players' placement reticles.
import type { World } from "../../sim/world";
import type { MapperUi } from "../../input/commands";
import { costumeOfPlayer } from "../../render/costumes";
import { cacheCanvas } from "../cacheCanvas";
import type { Portraits } from "../portraits";
import { texturedRect } from "../uiPaint";
import { stockIcon } from "./icons";
import { INK } from "./paint";

type Rect = { x: number; y: number; w: number; h: number };
type Project = (x: number, z: number) => [number, number];

/** Everything a minimap layer needs: projection to minimap coordinates, cell scale, team colours. */
interface Layer {
  ctx: CanvasRenderingContext2D;
  w: World;
  P: Project;
  /** Minimap units per map cell. */
  s: number;
  now: number;
  tc: (team: number) => string;
}

export class Minimap {
  /** Outer rect of the last drawn minimap (frame included), or null when hidden. Stocks sit above it. */
  rect: Rect | null = null;
  /** Static per-map overlays (tide cells, mist mask) baked once at one pixel per cell. */
  private overlays = new Map<string, HTMLCanvasElement | null>();

  constructor(private teamColors: string[]) {}

  private overlay(
    key: string,
    w: World,
    make: (c: CanvasRenderingContext2D, W: number, D: number) => boolean,
  ): HTMLCanvasElement | null {
    if (this.overlays.has(key)) return this.overlays.get(key)!;
    const t = w.terrain;
    const c = cacheCanvas();
    c.width = t.width;
    c.height = t.depth;
    const ok = make(c.getContext("2d")!, t.width, t.depth);
    this.overlays.set(key, ok ? c : null);
    return ok ? c : null;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    w: World,
    now: number,
    ui: (MapperUi | null)[],
    opts: { split: number; zoomOut: number; mapIndex: number; portraits: Portraits | null; side?: number },
  ): void {
    const t = w.terrain;
    const idx = opts.mapIndex;
    const solo = opts.split < 2;
    // Shared view: smaller, and smaller still as the camera zooms out (more of the map is already visible).
    // Two stacked views: on the divider at one end (opts.side -1 left, 1 right); the screen centre is the middle
    // of both views, where the cameras keep the heroes.
    const stacked = opts.split === 2;
    const k = solo ? 0.62 - 0.17 * opts.zoomOut : stacked ? 0.8 : 1;
    const s = Math.min(68 / t.width, 50 / t.depth) * k;
    const mw = t.width * s;
    const mh = t.depth * s;
    const x0 = Math.round(stacked && opts.side ? (opts.side < 0 ? 10 : W - mw - 10) : W / 2 - mw / 2);
    const y0 = Math.round(opts.split >= 2 ? H / 2 - mh / 2 : H - mh - 4);
    this.rect = { x: x0 - 4, y: y0 - 4, w: mw + 8, h: mh + 8 };
    const img = idx >= 0 ? opts.portraits?.mapTop(idx, Math.round(t.width * 6), Math.round(t.depth * 6)) : null;
    const L: Layer = {
      ctx,
      w,
      P: (x, z) => [x0 + x * s, y0 + z * s],
      s,
      now,
      tc: (team) => this.teamColors[team] ?? this.teamColors[8] ?? "#9a9068",
    };

    ctx.save();
    ctx.globalAlpha *= solo ? 0.36 : 0.5;
    ctx.fillStyle = INK;
    ctx.fillRect(x0 - 3.5, y0 - 3.5, mw + 7, mh + 7);
    texturedRect(ctx, "wood", x0 - 2.5, y0 - 2.5, mw + 5, mh + 5, "#7a5636", 0, 0.5);
    ctx.fillStyle = INK;
    ctx.fillRect(x0 - 0.8, y0 - 0.8, mw + 1.6, mh + 1.6);
    if (img) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, x0, y0, mw, mh);
    } else {
      ctx.fillStyle = "#4a6a3a";
      ctx.fillRect(x0, y0, mw, mh);
    }
    ctx.fillStyle = "rgba(10,8,6,0.06)";
    ctx.fillRect(x0, y0, mw, mh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, mw, mh);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    this.drawEventOverlays(L, idx, x0, y0, mw, mh);
    drawObjectives(L);
    drawUnits(L);
    drawPads(L);
    drawKeeps(L);
    drawNeutrals(L);
    drawHeroes(L);
    drawReticles(L, ui);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,216,112,0.55)";
    ctx.lineWidth = 0.4;
    ctx.strokeRect(x0 + 0.2, y0 + 0.2, mw - 0.4, mh - 0.4);
    ctx.restore();
  }

  /** High-tide cells, the moving mist band and avalanche lanes (warning outline, then the snow sweeping in). */
  private drawEventOverlays(L: Layer, idx: number, x0: number, y0: number, mw: number, mh: number): void {
    const { ctx, w, P, s, now } = L;
    const t = w.terrain;
    const tide = this.overlay(`tide:${idx}`, w, (g) => {
      if (!t.tideCells.length) return false;
      g.fillStyle = "rgba(70,140,230,0.7)";
      for (const i of t.tideCells) g.fillRect(i % t.width, Math.floor(i / t.width), 1, 1);
      return true;
    });
    const mist = this.overlay(`mist:${idx}`, w, (g, Wd) => {
      const m = w.mapEvents.mistMask;
      if (!m) return false;
      g.fillStyle = "rgba(225,232,240,0.55)";
      for (let i = 0; i < m.length; i++) if (m[i]) g.fillRect(i % Wd, Math.floor(i / Wd), 1, 1);
      return true;
    });
    if (tide && w.tideHigh) {
      ctx.globalAlpha *= 0.75;
      ctx.drawImage(tide, x0, y0, mw, mh);
      ctx.globalAlpha /= 0.75;
    }
    if (mist) {
      const [tail, front] = w.mapEvents.mistBand(w.time);
      if (front > tail) {
        const z0 = Math.max(0, tail);
        const z1 = Math.min(t.depth, front);
        if (z1 > z0) ctx.drawImage(mist, 0, z0, t.width, z1 - z0, x0, y0 + z0 * s, mw, (z1 - z0) * s);
      }
    }
    const av = w.mapEvents.avalancheNow;
    if (av) {
      const r = av.lane.rect;
      const [ax, ay] = P(r.x, r.z);
      if (av.stage === "warn") {
        ctx.strokeStyle = Math.floor(now * 5) % 2 ? "#ff4030" : "#ffffff";
        ctx.lineWidth = 0.9;
        ctx.strokeRect(ax, ay, r.w * s, r.h * s);
      } else {
        // Snow fills the lane from the side it slides in from.
        ctx.fillStyle = "rgba(240,248,255,0.85)";
        const k = av.k;
        const { dx, dz } = av.lane;
        if (dx > 0) ctx.fillRect(ax, ay, r.w * s * k, r.h * s);
        else if (dx < 0) ctx.fillRect(ax + r.w * s * (1 - k), ay, r.w * s * k, r.h * s);
        else if (dz > 0) ctx.fillRect(ax, ay, r.w * s, r.h * s * k);
        else ctx.fillRect(ax, ay + r.h * s * (1 - k), r.w * s, r.h * s * k);
      }
    }
  }

  /** Stock icons in a row centred above the minimap, sorted by team then player. */
  drawStocks(ctx: CanvasRenderingContext2D, w: World, split: number): void {
    const m = this.rect!;
    const list = [...w.players].sort((a, b) => a.team - b.team || a.player - b.player);
    if (!list.length) return;
    const sz = split >= 2 ? 11 : 12;
    const gap = 2;
    const total = list.length * sz + (list.length - 1) * gap;
    let x = Math.round(m.x + m.w / 2 - total / 2);
    const y = Math.round(m.y - sz - 3);
    ctx.save();
    for (const p of list) {
      const he = w.getAny(p.heroId);
      const dead = !he || !he.alive || !!he.hero?.dead;
      const im = stockIcon(p.heroType, costumeOfPlayer(p.player), dead);
      ctx.save();
      ctx.fillStyle = "rgba(12,8,6,0.55)";
      ctx.beginPath();
      ctx.arc(x + sz / 2, y + sz / 2, sz / 2 + 0.6, 0, Math.PI * 2);
      ctx.fill();
      if (im) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        if (dead) ctx.globalAlpha *= 0.85;
        ctx.drawImage(im, x, y, sz, sz);
      }
      ctx.globalAlpha = 1;
      // HP bar under the icon.
      const hp = dead || !he ? 0 : Math.max(0, Math.min(1, he.hp / he.maxHp));
      ctx.fillStyle = INK;
      ctx.fillRect(x + 0.5, y + sz + 0.6, sz - 1, 2.2);
      ctx.fillStyle = "rgba(60,50,40,0.9)";
      ctx.fillRect(x + 1, y + sz + 1, sz - 2, 1.4);
      ctx.fillStyle = this.teamColors[p.team] ?? "#9a9068";
      ctx.fillRect(x + 1, y + sz + 1, (sz - 2) * hp, 1.4);
      if (dead) {
        ctx.lineCap = "round";
        for (const [lw, col] of [
          [2.6, INK],
          [1.5, "#e02818"],
        ] as const) {
          ctx.lineWidth = lw;
          ctx.strokeStyle = col;
          ctx.beginPath();
          ctx.moveTo(x + 2, y + 2);
          ctx.lineTo(x + sz - 2, y + sz - 2);
          ctx.moveTo(x + sz - 2, y + 2);
          ctx.lineTo(x + 2, y + sz - 2);
          ctx.stroke();
        }
      }
      ctx.restore();
      x += sz + gap;
    }
    ctx.restore();
  }
}

// ── Layers ──

function dot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, ring = INK, lw = 0.5) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = ring;
  ctx.stroke();
}

/** Avalanche horns, jump pads with their arcs, lockdown and timed gates, incoming cannon shots. */
function drawObjectives(L: Layer): void {
  const { ctx, w, P, s, now } = L;
  const t = w.terrain;
  for (const hn of w.mapEvents.horns) {
    const [hx, hy] = P(hn.x, hn.z);
    const ready = w.time >= hn.readyAt;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 2.6);
    ctx.lineTo(hx + 2.3, hy + 1.6);
    ctx.lineTo(hx - 2.3, hy + 1.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ready ? (Math.floor(now * 2) % 2 ? "#f4f8ff" : "#c8d8ff") : "#6a7080";
    ctx.beginPath();
    ctx.moveTo(hx, hy - 1.7);
    ctx.lineTo(hx + 1.5, hy + 1.0);
    ctx.lineTo(hx - 1.5, hy + 1.0);
    ctx.closePath();
    ctx.fill();
  }
  for (const jp of w.jumpPads) {
    const [ax, ay] = P(jp.x, jp.z);
    const [bx, by] = P(jp.tx, jp.tz);
    ctx.save();
    ctx.setLineDash([1.2, 1.2]);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(255,232,150,0.75)";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(ax, ay, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = w.time < jp.readyAt ? "#6a6458" : "#e8b830";
    ctx.beginPath();
    ctx.arc(ax, ay, 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
  if (w.mapEvents.locked) {
    for (const lg of w.mapEvents.lockGates)
      for (const c of lg.cells) {
        const [gx, gy] = P(c % t.width, Math.floor(c / t.width));
        ctx.fillStyle = INK;
        ctx.fillRect(gx - 0.4, gy - 0.4, s + 0.8, s + 0.8);
        ctx.fillStyle = "#c08a40";
        ctx.fillRect(gx, gy, s, s);
      }
  }
  for (const gt of w.mapEvents.gateList) {
    if (!gt.shut) continue;
    const [gx, gy] = P(gt.slot.x, gt.slot.z);
    ctx.fillStyle = INK;
    ctx.fillRect(gx - 0.4, gy - 0.4, gt.slot.w * s + 0.8, gt.slot.h * s + 0.8);
    ctx.fillStyle = "#9aa0b0";
    ctx.fillRect(gx, gy, gt.slot.w * s, gt.slot.h * s);
  }
  for (const sh of w.arena.shots) {
    const [cx, cy] = P(sh.x, sh.z);
    ctx.strokeStyle = Math.floor(now * 6) % 2 ? "#ff3020" : "#ffd040";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.2, sh.radius * s), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawUnits(L: Layer): void {
  const { ctx, w, P, tc } = L;
  for (const e of w.entities) {
    if (!e.alive || !e.unit || e.neutral || !w.spottedByAll(e)) continue;
    const [ux, uy] = P(e.transform.pos.x, e.transform.pos.z);
    ctx.fillStyle = tc(e.team);
    ctx.fillRect(ux - 0.45, uy - 0.45, 0.9, 0.9);
  }
}

/** Empty pads as rings (grey while rubble); production buildings as squares, towers as triangles (gold = Lv 2+). */
function drawPads(L: Layer): void {
  const { ctx, w, P, tc } = L;
  for (const pad of w.pads) {
    const [px, py] = P(pad.x, pad.z);
    const st = pad.structureId ? w.get(pad.structureId) : undefined;
    if (!st?.alive || !st.structure) {
      const rubble = w.time < pad.rubbleUntil;
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.45;
      ctx.strokeStyle = rubble ? "#7a7064" : pad.zone === "neutral" ? "#f4ecd8" : tc(pad.side);
      ctx.beginPath();
      ctx.arc(px, py, 1.5, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (st.structure.type === "core") continue;
    const def = w.data.structures.types[st.structure.type];
    const col = tc(st.team);
    ctx.save();
    if (!st.structure.ready) ctx.globalAlpha *= 0.55;
    const gold = st.structure.level > 1;
    if (def.class === "production") {
      ctx.fillStyle = INK;
      ctx.fillRect(px - 1.9, py - 1.9, 3.8, 3.8);
      ctx.fillStyle = gold ? "#ffd040" : col;
      ctx.fillRect(px - 1.45, py - 1.45, 2.9, 2.9);
      if (gold) {
        ctx.fillStyle = col;
        ctx.fillRect(px - 0.95, py - 0.95, 1.9, 1.9);
      }
    } else {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(px, py - 2.4);
      ctx.lineTo(px + 2.1, py + 1.5);
      ctx.lineTo(px - 2.1, py + 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = gold ? "#ffd040" : col;
      ctx.beginPath();
      ctx.moveTo(px, py - 1.6);
      ctx.lineTo(px + 1.45, py + 1.05);
      ctx.lineTo(px - 1.45, py + 1.05);
      ctx.closePath();
      ctx.fill();
      if (gold) dot(ctx, px, py, 0.55, col, col, 0.1);
    }
    ctx.restore();
  }
}

/** Keeps with an HP bar; crossed out once fallen. */
function drawKeeps(L: Layer): void {
  const { ctx, w, P, tc } = L;
  for (let team = 0; team < w.teamCount; team++) {
    const c = w.core(team);
    const co = w.terrain.cores.find((k) => (k.team ?? 0) === team);
    if (!co) continue;
    const [kx, ky] = P(co.x, co.z);
    const out = !c?.alive || w.teams[team].out;
    ctx.fillStyle = INK;
    ctx.fillRect(kx - 3, ky - 3, 6, 6);
    ctx.fillStyle = out ? "#3a3430" : "#ffd040";
    ctx.fillRect(kx - 2.5, ky - 2.5, 5, 5);
    ctx.fillStyle = out ? "#5a524a" : tc(team);
    ctx.fillRect(kx - 1.9, ky - 1.9, 3.8, 3.8);
    if (out) {
      ctx.strokeStyle = "#ff4030";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(kx - 2, ky - 2);
      ctx.lineTo(kx + 2, ky + 2);
      ctx.moveTo(kx + 2, ky - 2);
      ctx.lineTo(kx - 2, ky + 2);
      ctx.stroke();
    } else if (c) {
      const f = Math.max(0, c.hp / c.maxHp);
      ctx.fillStyle = INK;
      ctx.fillRect(kx - 3, ky + 3.4, 6, 1.4);
      ctx.fillStyle = f > 0.5 ? "#6ae04a" : f > 0.25 ? "#ffd040" : "#ff4030";
      ctx.fillRect(kx - 2.6, ky + 3.7, 5.2 * f, 0.8);
    }
  }
}

/** The bone lantern, the ogre and the Grudge relic (a diamond; above its carrier while carried). */
function drawNeutrals(L: Layer): void {
  const { ctx, w, P, now, tc } = L;
  const lan = w.mapEvents.lantern;
  if (lan) {
    const [lx, ly] = P(lan.x, lan.z);
    const pulse = 1.4 + Math.sin(now * 6) * 0.35;
    dot(ctx, lx, ly, pulse + 0.9, "rgba(90,255,110,0.35)", "rgba(0,0,0,0)", 0);
    dot(ctx, lx, ly, 1.3, "#7aff8a", INK, 0.5);
  }
  const og = w.arena.ogreId ? w.get(w.arena.ogreId) : undefined;
  if (og?.alive) {
    const [ox, oy] = P(og.transform.pos.x, og.transform.pos.z);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(ox - 2.4, oy - 2.6);
    ctx.lineTo(ox - 1.2, oy - 1.4);
    ctx.lineTo(ox + 1.2, oy - 1.4);
    ctx.lineTo(ox + 2.4, oy - 2.6);
    ctx.lineTo(ox + 2.1, oy + 0.4);
    ctx.arc(ox, oy + 0.4, 2.1, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#8a9a4a";
    ctx.beginPath();
    ctx.arc(ox, oy + 0.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4ecd8";
    ctx.fillRect(ox - 1.9, oy - 2.1, 0.7, 0.9);
    ctx.fillRect(ox + 1.2, oy - 2.1, 0.7, 0.9);
  }
  const r = w.arena.relic;
  if (r.state === "waiting") {
    const [rx, ry] = P(w.arena.home.x, w.arena.home.z);
    ctx.strokeStyle = "rgba(255,216,112,0.6)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(rx, ry, 1.6, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const carrier = r.state === "carried" ? w.getAny(r.carrier) : undefined;
  const [rx, ry] = carrier ? P(carrier.transform.pos.x, carrier.transform.pos.z) : P(r.x, r.z);
  const y = carrier ? ry - 3.2 : ry;
  const k = 1.9 + (r.state === "carried" || r.state === "dropped" ? Math.sin(now * 8) * 0.35 : 0);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(rx, y - k - 0.7);
  ctx.lineTo(rx + k + 0.6, y);
  ctx.lineTo(rx, y + k + 0.7);
  ctx.lineTo(rx - k - 0.6, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = r.state === "shrined" ? tc(r.team) : "#ffd040";
  ctx.beginPath();
  ctx.moveTo(rx, y - k);
  ctx.lineTo(rx + k, y);
  ctx.lineTo(rx, y + k);
  ctx.lineTo(rx - k, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff4c8";
  ctx.fillRect(rx - 0.35, y - k * 0.55, 0.7, 0.7);
}

/** Heroes as facing arrows (white rim, team core); haunted heroes get a green glow. */
function drawHeroes(L: Layer): void {
  const { ctx, w, P, tc } = L;
  for (const e of w.entities) {
    if (!e.alive || !e.hero || e.hero.dead || !w.spottedByAll(e)) continue;
    const [hx, hy] = P(e.transform.pos.x, e.transform.pos.z);
    const a = e.transform.facing;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    const R = 2.5;
    if (w.time < (e.status.hauntUntil ?? 0)) dot(ctx, hx, hy, R + 0.9, "rgba(90,255,110,0.4)", "rgba(0,0,0,0)", 0);
    const arrow = (k: number) => {
      ctx.beginPath();
      ctx.moveTo(hx + fx * R * k, hy + fz * R * k);
      ctx.lineTo(hx - fx * R * 0.7 * k - fz * R * 0.75 * k, hy - fz * R * 0.7 * k + fx * R * 0.75 * k);
      ctx.lineTo(hx - fx * R * 0.3 * k, hy - fz * R * 0.3 * k);
      ctx.lineTo(hx - fx * R * 0.7 * k + fz * R * 0.75 * k, hy - fz * R * 0.7 * k - fx * R * 0.75 * k);
      ctx.closePath();
    };
    arrow(1.35);
    ctx.fillStyle = INK;
    ctx.fill();
    arrow(1.05);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    arrow(0.72);
    ctx.fillStyle = tc(e.team);
    ctx.fill();
  }
}

/** Local players' placement reticles (aimed specials): a dashed line from the hero and a pulsing ring. */
function drawReticles(L: Layer, ui: (MapperUi | null)[]): void {
  const { ctx, P, now } = L;
  for (const u of ui) {
    const rt = u?.reticle;
    if (!rt?.at) continue;
    const [sx, sy] = P(rt.at.x, rt.at.z);
    const [fx, fy] = P(rt.at.x - rt.dx, rt.at.z - rt.dz);
    ctx.save();
    ctx.setLineDash([1.4, 1]);
    ctx.lineDashOffset = -now * 6;
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "rgba(216,160,255,0.95)";
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    ctx.restore();
    const pr = 3.6 + Math.sin(now * 8) * 0.5;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(sx, sy, pr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = Math.floor(now * 6) % 2 ? "#e0b0ff" : "#ffffff";
    ctx.stroke();
  }
}
