import * as THREE from "three";
import { cacheCanvas } from "../ui/cacheCanvas";

export const DESERT_COSTUMES = new Set(["suntotem"]);

export function isDesert(costume: string | undefined): boolean {
  return !!costume && DESERT_COSTUMES.has(costume);
}

function cactusTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = cacheCanvas();
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const ribs = 8;
  const w = S / ribs;
  for (let i = 0; i < ribs; i++) {
    const gr = g.createLinearGradient(0, i * w, 0, (i + 1) * w);
    gr.addColorStop(0, "#3e6a2c");
    gr.addColorStop(0.45, "#7fae4a");
    gr.addColorStop(0.6, "#8fbc56");
    gr.addColorStop(1, "#3a6228");
    g.fillStyle = gr;
    g.fillRect(0, i * w, S, w);
  }
  g.fillStyle = "#f2e6c0";
  g.strokeStyle = "rgba(250,240,210,0.9)";
  g.lineWidth = 0.8;
  for (let i = 0; i < ribs; i++) {
    for (let k = 0; k < 6; k++) {
      const y = i * w + w * 0.52;
      const x = ((k + (i % 2) * 0.5) * (S / 6) + 4) % S;
      g.beginPath();
      g.arc(x, y, 1.6, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(x - 2.5, y - 3);
      g.lineTo(x + 2.5, y + 3);
      g.moveTo(x + 2.5, y - 3);
      g.lineTo(x - 2.5, y + 3);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData.keep = true;
  return t;
}

export const CACTUS_TEX = cactusTexture();

const mats = new Map<string, THREE.MeshLambertMaterial>();
export function cactusMat(repeat: [number, number] = [4, 1]): THREE.MeshLambertMaterial {
  const key = repeat.join(",");
  const had = mats.get(key);
  if (had) return had;
  const t = CACTUS_TEX.clone();
  t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  const m = new THREE.MeshLambertMaterial({ map: t, color: 0xffffff });
  m.userData.keep = true;
  mats.set(key, m);
  return m;
}

export const CACTUS = cactusMat([4, 1]);
export const SPINE = new THREE.MeshLambertMaterial({ color: 0xeadfb8, flatShading: true });
SPINE.userData.keep = true;
