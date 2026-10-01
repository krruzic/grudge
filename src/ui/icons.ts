const INK = "#0b0806";

type Draw = (ctx: CanvasRenderingContext2D) => void;

function glyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string, draw: Draw, lw = 0.22): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 2, size / 2);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = lw + 0.28;
  ctx.beginPath();
  draw(ctx);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.fillStyle = fill;
  ctx.lineWidth = lw;
  ctx.beginPath();
  draw(ctx);
  ctx.stroke();
  ctx.restore();
}

function solid(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string, draw: Draw): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 2, size / 2);
  ctx.lineJoin = "round";
  ctx.beginPath();
  draw(ctx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.32;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

const STROKES: Record<string, Draw> = {
  combo: (c) => {
    c.moveTo(-0.75, 0.75); c.lineTo(0.7, -0.7);
    c.moveTo(-0.55, 0.15); c.lineTo(-0.15, 0.55);
    c.moveTo(-0.85, 0.85); c.lineTo(-0.6, 0.6);
  },
  flurry: (c) => {
    for (const o of [-0.45, 0, 0.45]) { c.moveTo(-0.7 + o, 0.6); c.lineTo(0.25 + o, -0.7); }
  },
  slam: (c) => {
    c.moveTo(0, -0.85); c.lineTo(0, 0.25);
    c.moveTo(-0.35, -0.05); c.lineTo(0, 0.3); c.lineTo(0.35, -0.05);
    c.moveTo(-0.85, 0.7); c.lineTo(0.85, 0.7);
    c.moveTo(-0.5, 0.45); c.lineTo(-0.7, 0.2);
    c.moveTo(0.5, 0.45); c.lineTo(0.7, 0.2);
  },
  quake: (c) => {
    c.moveTo(-0.9, 0.1); c.lineTo(-0.45, -0.3); c.lineTo(-0.1, 0.25); c.lineTo(0.3, -0.35); c.lineTo(0.9, 0.15);
    c.moveTo(-0.9, 0.7); c.lineTo(0.9, 0.7);
  },
  warcry: (c) => {
    c.moveTo(-0.8, -0.25); c.lineTo(-0.2, -0.25); c.lineTo(0.3, -0.7); c.lineTo(0.3, 0.7); c.lineTo(-0.2, 0.25); c.lineTo(-0.8, 0.25); c.closePath();
    c.moveTo(0.6, -0.35); c.quadraticCurveTo(0.8, 0, 0.6, 0.35);
  },
  leap: (c) => {
    c.moveTo(-0.8, 0.7); c.quadraticCurveTo(-0.1, -1.1, 0.65, 0.2);
    c.moveTo(0.3, 0.15); c.lineTo(0.68, 0.25); c.lineTo(0.75, -0.15);
  },
  dash: (c) => {
    c.moveTo(-0.3, 0); c.lineTo(0.8, 0);
    c.moveTo(0.4, -0.4); c.lineTo(0.8, 0); c.lineTo(0.4, 0.4);
    c.moveTo(-0.85, -0.4); c.lineTo(-0.45, -0.4);
    c.moveTo(-0.85, 0.4); c.lineTo(-0.45, 0.4);
  },
  repair: (c) => {
    c.moveTo(-0.7, 0.7); c.lineTo(0.2, -0.2);
    c.moveTo(0.15, -0.55); c.arc(0.4, -0.4, 0.35, Math.PI * 1.15, Math.PI * 2.75);
  },
  wall: (c) => {
    c.rect(-0.85, -0.6, 1.7, 1.2);
    c.moveTo(-0.85, 0); c.lineTo(0.85, 0);
    c.moveTo(0, -0.6); c.lineTo(0, 0);
    c.moveTo(-0.45, 0); c.lineTo(-0.45, 0.6);
    c.moveTo(0.45, 0); c.lineTo(0.45, 0.6);
  },
  trap: (c) => {
    c.moveTo(-0.85, 0.1); c.arc(0, 0.1, 0.85, Math.PI, 0);
    c.moveTo(-0.85, 0.1); c.lineTo(-0.55, -0.25); c.lineTo(-0.3, 0.1); c.lineTo(0, -0.25); c.lineTo(0.3, 0.1); c.lineTo(0.55, -0.25); c.lineTo(0.85, 0.1);
    c.moveTo(-0.85, 0.7); c.lineTo(0.85, 0.7);
  },
  reach: (c) => {
    c.moveTo(-0.9, 0.55); c.lineTo(0.15, -0.05);
    c.moveTo(0.15, -0.05); c.lineTo(0.35, -0.55); c.moveTo(0.15, -0.05); c.lineTo(0.55, -0.4);
    c.moveTo(0.15, -0.05); c.lineTo(0.65, -0.1); c.moveTo(0.15, -0.05); c.lineTo(0.55, 0.25);
    c.moveTo(0.7, -0.75); c.lineTo(0.85, -0.9); c.moveTo(0.85, -0.45); c.lineTo(0.98, -0.5);
  },
  zone: (c) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      c.moveTo(Math.cos(a) * 0.35, Math.sin(a) * 0.35);
      c.lineTo(Math.cos(a) * 0.85, Math.sin(a) * 0.85);
    }
    c.moveTo(0.35, 0); c.arc(0, 0, 0.35, 0, Math.PI * 2);
  },
  works: (c) => {
    c.moveTo(-0.9, 0.75); c.lineTo(-0.2, -0.15); c.lineTo(0.85, -0.15);
    c.moveTo(-0.2, -0.15); c.lineTo(-0.2, 0.75);
    c.moveTo(0.3, -0.15); c.lineTo(0.3, 0.75);
    c.moveTo(0.8, -0.15); c.lineTo(0.8, 0.75);
    c.moveTo(-0.2, -0.45); c.lineTo(0.85, -0.45);
  },
  ballista: (c) => {
    c.moveTo(-0.8, 0.5); c.lineTo(0.8, -0.5);
    c.moveTo(-0.55, -0.55); c.quadraticCurveTo(0.2, -0.25, 0.4, 0.5);
    c.moveTo(0.8, -0.5); c.lineTo(0.5, -0.5); c.moveTo(0.8, -0.5); c.lineTo(0.75, -0.22);
    c.moveTo(-0.5, 0.75); c.lineTo(0.2, 0.75);
  },
  banner: (c) => {
    c.moveTo(-0.55, 0.85); c.lineTo(-0.55, -0.85);
    c.moveTo(-0.55, -0.7); c.lineTo(0.65, -0.7); c.lineTo(0.65, 0.25); c.lineTo(0.05, 0.05); c.lineTo(-0.55, 0.25);
  },
  rally: (c) => {
    c.moveTo(-0.2, -0.75); c.lineTo(0.2, -0.75); c.lineTo(0.2, -0.2); c.lineTo(0.75, -0.2); c.lineTo(0.75, 0.2); c.lineTo(0.2, 0.2);
    c.lineTo(0.2, 0.75); c.lineTo(-0.2, 0.75); c.lineTo(-0.2, 0.2); c.lineTo(-0.75, 0.2); c.lineTo(-0.75, -0.2); c.lineTo(-0.2, -0.2); c.closePath();
  },
  none: (c) => { c.moveTo(-0.5, 0); c.lineTo(0.5, 0); },
  river: (c) => {
    for (const oy of [-0.15, 0.35]) {
      c.moveTo(-0.9, oy); c.quadraticCurveTo(-0.45, oy - 0.3, 0, oy); c.quadraticCurveTo(0.45, oy + 0.3, 0.9, oy);
    }
    c.moveTo(-0.7, -0.35); c.quadraticCurveTo(0, -1.05, 0.7, -0.35);
    c.moveTo(-0.55, -0.55); c.lineTo(-0.55, -0.25);
    c.moveTo(0.55, -0.55); c.lineTo(0.55, -0.25);
  },
  tide: (c) => {
    for (const oy of [0.25, 0.65]) {
      c.moveTo(-0.9, oy); c.quadraticCurveTo(-0.6, oy - 0.25, -0.3, oy); c.quadraticCurveTo(0, oy + 0.25, 0.3, oy); c.quadraticCurveTo(0.6, oy - 0.25, 0.9, oy);
    }
    c.moveTo(0.15, -0.95); c.arc(-0.1, -0.45, 0.5, -1.05, 1.05, true);
    c.moveTo(0.15, -0.95); c.quadraticCurveTo(-0.35, -0.45, 0.15, 0.05);
  },
  bell: (c) => {
    c.moveTo(-0.7, 0.55); c.quadraticCurveTo(-0.45, 0.35, -0.45, -0.15); c.quadraticCurveTo(-0.45, -0.75, 0, -0.75);
    c.quadraticCurveTo(0.45, -0.75, 0.45, -0.15); c.quadraticCurveTo(0.45, 0.35, 0.7, 0.55); c.closePath();
    c.moveTo(0, -0.75); c.lineTo(0, -0.95);
    c.moveTo(0.14, 0.75); c.arc(0, 0.75, 0.14, 0, Math.PI * 2);
  },
};

const FILLS: Record<string, Draw> = {
  shoot: (c) => {
    c.moveTo(0.25, -0.9); c.lineTo(-0.5, 0.1); c.lineTo(-0.05, 0.1); c.lineTo(-0.3, 0.9); c.lineTo(0.55, -0.15); c.lineTo(0.08, -0.15); c.closePath();
  },
  hex: (c) => {
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const r = k % 2 === 0 ? 0.9 : 0.38;
      if (k === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
  },
  stealth: (c) => {
    c.moveTo(-0.3, 0.1); c.arc(-0.35, 0.15, 0.4, 0, Math.PI * 2);
    c.moveTo(0.6, 0.15); c.arc(0.3, 0.15, 0.35, 0, Math.PI * 2);
    c.moveTo(0.35, -0.2); c.arc(0, -0.2, 0.42, 0, Math.PI * 2);
    c.rect(-0.75, 0.15, 1.4, 0.4);
  },
  summon: (c) => {
    for (const ox of [-0.45, 0.45]) {
      c.moveTo(ox + 0.22, -0.45); c.arc(ox, -0.45, 0.22, 0, Math.PI * 2);
      c.moveTo(ox - 0.32, 0.75); c.lineTo(ox - 0.25, -0.12); c.lineTo(ox + 0.25, -0.12); c.lineTo(ox + 0.32, 0.75); c.closePath();
    }
  },
  turret: (c) => {
    c.rect(-0.6, 0.1, 1.2, 0.75);
    c.moveTo(-0.4, 0.1); c.arc(0, 0.1, 0.4, Math.PI, 0); c.closePath();
    c.rect(0.1, -0.35, 0.8, 0.22);
  },
  ramp: (c) => {
    c.moveTo(-0.9, 0.7); c.lineTo(0.9, 0.7); c.lineTo(0.9, -0.6); c.closePath();
  },
  parry: (c) => {
    c.moveTo(0, -0.9); c.lineTo(0.75, -0.6); c.lineTo(0.65, 0.2); c.quadraticCurveTo(0.4, 0.7, 0, 0.9);
    c.quadraticCurveTo(-0.4, 0.7, -0.65, 0.2); c.lineTo(-0.75, -0.6); c.closePath();
  },
  peak: (c) => {
    c.moveTo(-0.95, 0.8); c.lineTo(-0.35, -0.35); c.lineTo(-0.15, -0.05); c.lineTo(0.2, -0.85); c.lineTo(0.95, 0.8); c.closePath();
  },
  castle: (c) => {
    c.moveTo(-0.85, 0.85); c.lineTo(-0.85, -0.55); c.lineTo(-0.6, -0.55); c.lineTo(-0.6, -0.3); c.lineTo(-0.35, -0.3); c.lineTo(-0.35, -0.55);
    c.lineTo(-0.2, -0.55); c.lineTo(-0.2, -0.85); c.lineTo(0.05, -0.85); c.lineTo(0.05, -0.6); c.lineTo(0.2, -0.6); c.lineTo(0.2, -0.85);
    c.lineTo(0.45, -0.85); c.lineTo(0.45, -0.3); c.lineTo(0.6, -0.3); c.lineTo(0.6, -0.55); c.lineTo(0.85, -0.55); c.lineTo(0.85, 0.85);
    c.lineTo(0.2, 0.85); c.lineTo(0.2, 0.35); c.quadraticCurveTo(0, 0.1, -0.2, 0.35); c.lineTo(-0.2, 0.85); c.closePath();
  },
  pad: (c) => {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      if (k === 0) c.moveTo(Math.cos(a) * 0.9, Math.sin(a) * 0.6);
      else c.lineTo(Math.cos(a) * 0.9, Math.sin(a) * 0.6);
    }
    c.closePath();
  },
  size: (c) => {
    c.rect(-0.8, -0.8, 1.6, 1.6);
    c.rect(-0.45, -0.45, 0.9, 0.9);
  },
};

const TINT: Record<string, string> = {
  shoot: "#ffe04a", hex: "#d68cff", stealth: "#d8dce8", summon: "#ffd08a", turret: "#c8ccd8", ramp: "#e0b070", parry: "#8cd0ff",
  pad: "#f0b830", size: "#e8e0c8",
};

export function engravedIcon(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, size: number, dark: string): void {
  const draw = FILLS[kind] ?? STROKES[kind] ?? STROKES.none;
  const filled = !!FILLS[kind];
  for (const [dy, col] of [[1.2, "rgba(255,230,190,0.35)"], [0, dark]] as const) {
    ctx.save();
    ctx.translate(cx, cy + dy);
    ctx.scale(size / 2, size / 2);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    draw(ctx);
    if (filled) {
      ctx.fillStyle = col;
      ctx.fill();
    } else {
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.2;
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function abilityIcon(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, size: number): void {
  const f = FILLS[kind];
  if (f) {
    if (kind === "size") {
      ctx.save();
      glyph(ctx, cx, cy, size, TINT.size, f, 0.2);
      ctx.restore();
      return;
    }
    solid(ctx, cx, cy, size, TINT[kind] ?? "#ffffff", f);
    return;
  }
  glyph(ctx, cx, cy, size, "#ffffff", STROKES[kind] ?? STROKES.none);
}

export function tile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string): void {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x - 1, y - 1, s + 2, s + 2, 3);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, 2);
  ctx.fill();
}
