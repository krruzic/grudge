// HUD icons: painted sprites (assets/ui/hud: coin, grain, helmet + plume, pad hex, order badges, padlocks),
// costume stock icons, talent icons, and a few vector glyphs (keep gem, core diamond, relic, bomb, C-stick arrow,
// formation badge, fallen cross).
// Images load asynchronously; until loaded the icon is simply skipped. Team tints, greyed stock icons and
// downscaled talent icons are baked once into CPU canvases (cacheCanvas) because they never change.
import type { Directive } from "../../sim/types";
import { cacheCanvas } from "../cacheCanvas";
import { texturedRect } from "../uiPaint";
import { INK, PAD } from "./paint";

function loadImages(urls: Record<string, string>, ext: string, onload?: () => void): Map<string, HTMLImageElement> {
  const out = new Map<string, HTMLImageElement>();
  for (const [p, url] of Object.entries(urls)) {
    const im = new Image();
    if (onload) im.onload = onload;
    im.src = url;
    out.set(p.split("/").pop()!.replace(ext, ""), im);
  }
  return out;
}

const ready = (im: HTMLImageElement | undefined): im is HTMLImageElement => !!im?.complete && !!im.naturalWidth;

// ── Painted HUD sprites ──

let hudIconGen = 0;
const hudIcons = loadImages(
  import.meta.glob("../../../assets/ui/hud/*.png", { eager: true, query: "?url", import: "default" }) as Record<
    string,
    string
  >,
  ".png",
  () => hudIconGen++,
);
/** Bumps whenever another HUD sprite finishes loading (part of memo keys so panels repaint with it). */
export const hudIconsLoaded = (): number => hudIconGen;

export function hudIcon(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  size: number,
  flip = false,
): void {
  const im = hudIcons.get(id);
  if (!ready(im)) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/** A HUD sprite multiplied by a team colour (alpha kept), cached per colour. */
const tinted = new Map<string, HTMLCanvasElement>();
function tintedIcon(id: string, color: string): HTMLCanvasElement | null {
  const im = hudIcons.get(id);
  if (!ready(im)) return null;
  const key = `${id}|${color}`;
  let c = tinted.get(key);
  if (!c) {
    c = cacheCanvas();
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(im, 0, 0);
    g.globalCompositeOperation = "multiply";
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = "destination-in";
    g.drawImage(im, 0, 0);
    tinted.set(key, c);
  }
  return c;
}

export function coinIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  hudIcon(ctx, "coin", x, y, r * 2.6);
}

export function grainIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  hudIcon(ctx, "grain", x, y - r * 0.15, r * 2.9);
}

/** Kettle helmet with a team-tinted plume (army count). */
export function armyIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, team: string): void {
  const plume = tintedIcon("plume", team);
  if (plume) {
    const s = r * 1.9;
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(plume, x - s * 0.42, y - r * 1.75, s, s);
    ctx.restore();
  }
  hudIcon(ctx, "helmet", x, y + r * 0.1, r * 2.7);
}

/** Team-tinted marble hex plot (pad count); `hot` = red while a pad is under attack. */
export function padIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  team: string,
  hot: boolean,
): void {
  const c = tintedIcon("pad", hot ? "#ff5040" : team);
  if (!c) return;
  const s = r * 2.6;
  ctx.save();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, x - s / 2, y - s / 2, s, s);
  ctx.restore();
}

/** Enamel order badge; `tint` rings it in the colour of the house an attack order targets. */
export function orderBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  d: Directive,
  flip: boolean,
  tint?: string,
): void {
  const r = 4.6;
  if (tint) {
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const id = hudIcons.has(`order_${d}`) ? `order_${d}` : "order_blank";
  // Directional badges (attack chevrons, follow loop) point toward the enemy side.
  hudIcon(ctx, id, x, y, r * 2.2, flip && (d === "push" || d === "follow"));
}

// ── Costume stock icons (minimap stocks) ──

const stockIcons = loadImages(
  import.meta.glob("../../../assets/ui/costume_icons/*.png", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>,
  ".png",
);
const stockGrey = new Map<HTMLImageElement, HTMLCanvasElement>();

/** Hero portrait icon in a costume (classic as fallback); `grey` = darkened for a dead hero. */
export function stockIcon(hero: string, costume: string, grey = false): HTMLImageElement | HTMLCanvasElement | null {
  const im = stockIcons.get(`${hero}_${costume || "classic"}`) ?? stockIcons.get(`${hero}_classic`);
  if (!ready(im)) return null;
  if (!grey) return im;
  let c = stockGrey.get(im);
  if (!c) {
    c = cacheCanvas();
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    const g = c.getContext("2d")!;
    g.filter = "grayscale(1) brightness(0.55)";
    g.drawImage(im, 0, 0);
    stockGrey.set(im, c);
  }
  return c;
}

// ── Talent icons ──

export const talentImgs = loadImages(
  import.meta.glob("../../../assets/ui/talents/*.png", { eager: true, query: "?url", import: "default" }) as Record<
    string,
    string
  >,
  ".png",
);

/**
 * Talent icons are large paintings; drawing them tiny each frame aliases and costs a big downscale, so each
 * (icon, device size) pair is baked once at the exact pixel size. LRU-capped at MAX_ICON_BAKES.
 */
const MAX_ICON_BAKES = 300;
const iconBakes = new Map<string, HTMLCanvasElement>();
function scaledIcon(id: string, im: HTMLImageElement, px: number): HTMLCanvasElement | HTMLImageElement {
  if (px >= im.naturalWidth) return im;
  const key = `${id}|${px}`;
  let c = iconBakes.get(key);
  if (!c) {
    c = cacheCanvas();
    c.width = c.height = px;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(im, 0, 0, px, px);
    iconBakes.set(key, c);
    if (iconBakes.size > MAX_ICON_BAKES) {
      const old = iconBakes.keys().next().value!;
      iconBakes.get(old)!.width = 0;
      iconBakes.delete(old);
    }
  }
  return c;
}

/** A talent icon on a stone tile; `dim` = not learned. Falls back to a dot until the image loads. */
export function talentIcon(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  size: number,
  dim = false,
): void {
  const im = talentImgs.get(id);
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, size + 2, size + 2);
  texturedRect(ctx, "stone", x, y, size, size, dim ? "#5a5048" : "#b8a888", 0, 0.5);
  if (ready(im)) {
    ctx.globalAlpha *= dim ? 0.35 : 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const m = ctx.getTransform();
    const px = Math.round(size * Math.hypot(m.a, m.b));
    const axisAligned = !m.b && !m.c;
    ctx.drawImage(px > 0 && axisAligned ? scaledIcon(id, im, px) : im, x, y, size, size);
  } else {
    ctx.fillStyle = dim ? "#6a6058" : "#ffe890";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ── Vector glyphs ──

/** Diamond path used by the keep gem and core icons; `k` grows it outward (for rims). */
function gemPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.25 - k);
  ctx.lineTo(x + r * 0.8 + k, y);
  ctx.lineTo(x, y + r * 1.25 + k);
  ctx.lineTo(x - r * 0.8 - k, y);
  ctx.closePath();
}

/** C-stick arrow (build cross / order cross directions). */
export function cArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  ang: number,
  lit: boolean,
): void {
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

/** Lit bomb (a hero carrying a keep-shop bomb). */
export function bombIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number): void {
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
  const spark = Math.floor(now * 10) % 2 === 0;
  ctx.fillStyle = spark ? "#fff0a0" : "#ff7020";
  ctx.beginPath();
  ctx.arc(x + r * 1.3, y - r * 1.2, spark ? 1.6 : 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The Grudge relic: the painted bull-head bust (assets/ui/hud/grudge.png; a vector horned mask until it loads). */
export function relicIcon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (ready(hudIcons.get("grudge"))) return hudIcon(ctx, "grudge", x, y - r * 0.15, r * 2.9);
  ctx.save();
  const horn = (s: number) => {
    ctx.beginPath();
    ctx.moveTo(x + s * r * 0.45, y - r * 0.3);
    ctx.quadraticCurveTo(x + s * r * 1.5, y - r * 0.4, x + s * r * 1.3, y - r * 1.4);
    ctx.quadraticCurveTo(x + s * r * 1.05, y - r * 0.75, x + s * r * 0.4, y - r * 0.75);
    ctx.closePath();
  };
  // Pass 0 strokes ink outlines, pass 1 fills the horns.
  for (const pass of [0, 1]) {
    ctx.fillStyle = pass ? "#f0d070" : INK;
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    for (const side of [-1, 1]) {
      horn(side);
      if (pass) ctx.fill();
      else ctx.stroke();
    }
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

/**
 * Keep health gem: fills bottom-up in the team colour (flashing red under 25%); `ward` (0-1) traces the keep
 * shield around it.
 */
export function keepGem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  team: string,
  hp: number,
  ward: number,
  now: number,
): void {
  ctx.save();
  if (ward > 0) {
    const k = 2.6;
    const pts: [number, number][] = [
      [x, y - r * 1.25 - k],
      [x + r * 0.8 + k, y],
      [x, y + r * 1.25 + k],
      [x - r * 0.8 - k, y],
      [x, y - r * 1.25 - k],
    ];
    const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
    const total = seg.reduce((a, b) => a + b, 0);
    // Path along the rim from the top, `frac` of the way round.
    const trace = (frac: number) => {
      let left = total * Math.min(1, frac);
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < 4 && left > 0; i++) {
        const f = Math.min(1, left / seg[i]);
        ctx.lineTo(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f);
        left -= seg[i];
      }
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    trace(ward);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    trace(ward);
    ctx.strokeStyle = "#aee8ff";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  gemPath(ctx, x, y, r, 1);
  ctx.fill();
  ctx.fillStyle = "#2a2226";
  gemPath(ctx, x, y, r, 0);
  ctx.fill();
  ctx.save();
  gemPath(ctx, x, y, r, 0);
  ctx.clip();
  const top = y + r * 1.25 - r * 2.5 * Math.max(0, Math.min(1, hp));
  ctx.fillStyle = hp < 0.25 && Math.floor(now * 4) % 2 === 0 ? "#ff6a50" : team;
  ctx.fillRect(x - r, top, r * 2, y + r * 1.3 - top);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.25);
  ctx.lineTo(x - r * 0.8, y);
  ctx.lineTo(x - r * 0.25, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** Small solid core diamond (FFA standings); `shield` adds the keep-shield halo. */
export function coreIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  team: string,
  shield: boolean,
): void {
  ctx.save();
  if (shield) {
    ctx.fillStyle = "rgba(174,232,255,0.6)";
    gemPath(ctx, x, y, r, 2.2);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  gemPath(ctx, x, y, r, 0.9);
  ctx.fill();
  ctx.fillStyle = team;
  gemPath(ctx, x, y, r, 0);
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

/** Red X over a fallen house / dead hero. */
export function fallenMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.lineCap = "round";
  for (const [c, lw] of [
    [INK, 3],
    ["#d83020", 1.4],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
  }
  ctx.restore();
}

/** Formation badge: dots in the army's current formation shape (column / line / wedge / mass). */
export function formationBadge(ctx: CanvasRenderingContext2D, x: number, y: number, f: string): void {
  const r = 7;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, r + 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a1c12";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = "#c89a40";
  ctx.beginPath();
  ctx.arc(x, y, r - 0.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#fff4d8";
  for (const [px, py] of FORMATION_DOTS[f] ?? FORMATION_DOTS.mass) {
    ctx.beginPath();
    ctx.arc(x + px, y + py, 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const FORMATION_DOTS: Record<string, [number, number][]> = {
  column: [
    [0, -3.6],
    [0, -1.2],
    [0, 1.2],
    [0, 3.6],
  ],
  line: [
    [-3.6, -1.1],
    [-1.2, -1.1],
    [1.2, -1.1],
    [3.6, -1.1],
    [-2.4, 1.6],
    [0, 1.6],
    [2.4, 1.6],
  ],
  wedge: [
    [0, -3],
    [-1.6, -0.6],
    [1.6, -0.6],
    [-3.2, 1.8],
    [0, 1.8],
    [3.2, 1.8],
  ],
  mass: [
    [-1.8, -1.6],
    [1.6, -2],
    [0, 0],
    [-2.2, 1.8],
    [2, 1.4],
    [0.2, 3],
  ],
};
