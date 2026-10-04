// Procedural canvas textures for the generic combat effects (flashes, sparks, decals, warning rings) and the
// talent icons used by "learned" callouts. Big ground decals paint at 512 px (the `res` argument of canvasTex)
// so they stay sharp when stretched over several metres.
import * as THREE from "three";
import { cacheCanvas } from "../../ui/cacheCanvas";
import { FX } from "../fx/atlas";

/** A `size` x `size` logical canvas drawn at roughly `res` px (scaled up by an integer factor). */
function canvasTex(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, s: number) => void,
  res = 256,
): THREE.CanvasTexture {
  const k = Math.max(1, Math.round(res / size));
  const c = cacheCanvas();
  c.width = c.height = size * k;
  const ctx = c.getContext("2d")!;
  ctx.scale(k, k);
  draw(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const starTex = canvasTex(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,240,160,0.9)");
  g.addColorStop(1, "rgba(255,120,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? s * 0.18 : s * 0.5;
    ctx.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
  }
  ctx.fill();
});
/** The atlas smoke puff (a costume-aware getter captured once; emit() resolves costume/HD variants at draw time). */
export const puffTex = FX.smoke;
export const glowTex = canvasTex(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
});
export const plusTex = canvasTex(16, (ctx) => {
  ctx.fillStyle = "#7dff7a";
  ctx.fillRect(6, 2, 4, 12);
  ctx.fillRect(2, 6, 12, 4);
});
export const streakTex = canvasTex(32, (ctx, s) => {
  const g = ctx.createLinearGradient(0, s / 2, s, s / 2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.7, "rgba(255,250,220,1)");
  g.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, s / 2 - 2, s, 4);
});
export const targetTex = canvasTex(
  64,
  (ctx, s) => {
    const c = s / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(20,4,0,0.85)";
    ctx.beginPath();
    ctx.arc(c, c, c - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ff3a1a";
    ctx.beginPath();
    ctx.arc(c, c, c - 4, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.save();
      ctx.translate(c + Math.cos(a) * (c - 10), c + Math.sin(a) * (c - 10));
      ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = "rgba(20,4,0,0.85)";
      ctx.beginPath();
      ctx.moveTo(-6, -4);
      ctx.lineTo(6, -4);
      ctx.lineTo(0, 5);
      ctx.fill();
      ctx.fillStyle = "#ffd23a";
      ctx.beginPath();
      ctx.moveTo(-4, -3);
      ctx.lineTo(4, -3);
      ctx.lineTo(0, 3);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#ff3a1a";
    ctx.fillRect(c - 1, c - 7, 2, 14);
    ctx.fillRect(c - 7, c - 1, 14, 2);
  },
  512,
);
export const fillTex = canvasTex(32, (ctx, s) => {
  ctx.fillStyle = "#ff4a1a";
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
  ctx.fill();
  for (let y = 0; y < s; y += 2) {
    ctx.clearRect(0, y, s, 1);
  }
});
export const scorchTex = canvasTex(64, (ctx, s) => {
  const c = s / 2;
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.6) * (c - 4);
    const sz = 3 + Math.random() * 8 * (1 - r / c);
    ctx.fillStyle = `rgba(${18 + Math.random() * 20},${12 + Math.random() * 12},${8 + Math.random() * 8},${0.55 + Math.random() * 0.4})`;
    ctx.fillRect(
      Math.round(c + Math.cos(a) * r - sz / 2),
      Math.round(c + Math.sin(a) * r - sz / 2),
      Math.round(sz),
      Math.round(sz),
    );
  }
});
export const gearTex = canvasTex(
  128,
  (ctx, s) => {
    const c = s / 2;
    const teeth = 16;
    ctx.beginPath();
    for (let k = 0; k < teeth * 2; k++) {
      const a0 = (k / (teeth * 2)) * Math.PI * 2;
      const a1 = ((k + 1) / (teeth * 2)) * Math.PI * 2;
      const r = k % 2 ? c - 4 : c - 11;
      ctx.lineTo(c + Math.cos(a0) * r, c + Math.sin(a0) * r);
      ctx.lineTo(c + Math.cos(a1) * r, c + Math.sin(a1) * r);
    }
    ctx.closePath();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(20,14,8,0.85)";
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#f0c860";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(c, c, c - 22, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(240,200,96,0.6)";
    ctx.stroke();
  },
  512,
);
export const runeTex = canvasTex(
  128,
  (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = "rgba(60,10,80,0.45)";
    ctx.beginPath();
    ctx.arc(c, c, c - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(10,0,16,0.9)";
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#c070ff";
    ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k * 4 * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(c + Math.cos(a) * (c - 12), c + Math.sin(a) * (c - 12));
    }
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#e0b0ff";
    ctx.stroke();
    ctx.fillStyle = "#e8d8f0";
    ctx.beginPath();
    ctx.arc(c, c - 4, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(c - 7, c + 4, 14, 8);
    ctx.fillStyle = "#1a0826";
    ctx.beginPath();
    ctx.arc(c - 5, c - 5, 3.5, 0, Math.PI * 2);
    ctx.arc(c + 5, c - 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(c - 4, c + 6, 2, 6);
    ctx.fillRect(c + 2, c + 6, 2, 6);
  },
  512,
);
export const crackTex = canvasTex(
  128,
  (ctx, s) => {
    const c = s / 2;
    ctx.lineCap = "round";
    const branch = (x: number, y: number, a: number, len: number, w: number) => {
      let px = x;
      let py = y;
      const steps = 5;
      for (let k = 0; k < steps; k++) {
        const na = a + (Math.random() - 0.5) * 0.7;
        const nx = px + Math.cos(na) * (len / steps);
        const ny = py + Math.sin(na) * (len / steps);
        ctx.lineWidth = w * (1 - k / steps) + 1;
        ctx.strokeStyle = "rgba(24,16,10,0.9)";
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        if (k === 2 && Math.random() < 0.6)
          branch(nx, ny, na + (Math.random() < 0.5 ? 0.6 : -0.6), len * 0.35, w * 0.5);
        px = nx;
        py = ny;
      }
    };
    for (let k = 0; k < 9; k++) branch(c, c, (k / 9) * Math.PI * 2 + Math.random() * 0.3, c - 6, 5);
    ctx.fillStyle = "rgba(24,16,10,0.85)";
    ctx.beginPath();
    ctx.arc(c, c, 9, 0, Math.PI * 2);
    ctx.fill();
  },
  512,
);
export const frostTex = canvasTex(
  128,
  (ctx, s) => {
    const c = s / 2;
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(10,30,60,0.6)";
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#bfe8ff";
    ctx.stroke();
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = c + Math.cos(a) * (c - 6);
      const y = c + Math.sin(a) * (c - 6);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = "#e8f8ff";
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(0, -4);
      ctx.lineTo(4, 0);
      ctx.lineTo(0, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#1a3050";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  },
  512,
);
export const emblemTex = canvasTex(
  128,
  (ctx, s) => {
    const c = s / 2;
    ctx.fillStyle = "rgba(255,220,120,0.18)";
    ctx.beginPath();
    ctx.arc(c, c, c - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(40,24,6,0.8)";
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffd860";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c, c - 30);
    ctx.lineTo(c + 24, c - 20);
    ctx.lineTo(c + 20, c + 10);
    ctx.lineTo(c, c + 30);
    ctx.lineTo(c - 20, c + 10);
    ctx.lineTo(c - 24, c - 20);
    ctx.closePath();
    ctx.fillStyle = "#f0e0b0";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#3a2408";
    ctx.stroke();
    ctx.fillStyle = "#40c040";
    ctx.fillRect(c - 4, c - 16, 8, 30);
    ctx.fillRect(c - 15, c - 5, 30, 8);
  },
  512,
);
export const swirlTex = canvasTex(
  128,
  (ctx, s) => {
    const c = s / 2;
    ctx.lineCap = "round";
    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const f = k / 40;
        const a = arm * (Math.PI / 2) + f * Math.PI * 2.2;
        const r = (1 - f) * (c - 6) + 4;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 7;
      ctx.strokeStyle = "rgba(30,20,12,0.75)";
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(220,200,160,0.85)";
      ctx.stroke();
    }
  },
  512,
);
export const pillarTex = canvasTex(64, (ctx, s) => {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, "rgba(255,240,160,0)");
  g.addColorStop(0.5, "rgba(255,220,110,0.55)");
  g.addColorStop(1, "rgba(255,250,210,0.95)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  for (let k = 0; k < 10; k++) {
    ctx.fillStyle = "rgba(255,255,230,0.8)";
    ctx.fillRect(Math.random() * s, Math.random() * s, 2, 6);
  }
});
const talentUrls = import.meta.glob("../../../assets/ui/talents/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const talentTex = new Map<string, THREE.Texture>();
export function talentTexture(id: string): THREE.Texture | null {
  const hit = talentTex.get(id);
  if (hit) return hit;
  const url = Object.entries(talentUrls).find(([p]) => p.endsWith(`/${id}.png`))?.[1];
  if (!url) return null;
  const t = new THREE.TextureLoader().load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  talentTex.set(id, t);
  return t;
}
