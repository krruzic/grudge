import * as THREE from "three";
import commonUrl from "../../assets/fx/common.png?url";
import wardenUrl from "../../assets/fx/warden.png?url";

const CELL = 128;
const COLS = 4;

const waits: Promise<void>[] = [];
function sheet(url: string, count: number): THREE.CanvasTexture[] {
  const out: THREE.CanvasTexture[] = [];
  for (let i = 0; i < count; i++) {
    const c = document.createElement("canvas");
    c.width = c.height = CELL;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    out.push(t);
  }
  const img = new Image();
  let done: () => void = () => {};
  waits.push(new Promise<void>((r) => (done = r)));
  img.onload = () => {
    out.forEach((t, i) => {
      const g = (t.image as HTMLCanvasElement).getContext("2d")!;
      g.drawImage(img, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL, 0, 0, CELL, CELL);
      t.needsUpdate = true;
    });
    done();
  };
  img.src = url;
  return out;
}

const C = sheet(commonUrl, 16);
const W = sheet(wardenUrl, 16);

export const fxReady = Promise.all(waits).then(() => undefined);

export function composite(size: number, draw: (g: CanvasRenderingContext2D, img: (t: THREE.Texture) => CanvasImageSource) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  void fxReady.then(() => {
    draw(c.getContext("2d")!, (x) => x.image as CanvasImageSource);
    t.needsUpdate = true;
  });
  return t;
}

export const FX = {
  burst: C[0],
  burst2: C[1],
  dust: C[2],
  dust2: C[3],
  smoke: C[4],
  shock: C[5],
  streak: C[6],
  twinkle: C[7],
  crack: C[8],
  rock: C[9],
  pebbles: C[10],
  swoosh: C[11],
  flashRed: C[12],
  fire: C[13],
  zap: C[14],
  splash: C[15],
};

export const WARDEN = {
  leaf: W[0],
  leafAutumn: W[1],
  bark: W[2],
  moss: W[3],
  wisp: W[4],
  vine: W[5],
  wreath: W[6],
  roots: W[7],
  splinters: W[8],
  natureBurst: W[9],
  stone: W[10],
  pebbleDust: W[11],
  mossCrack: W[12],
  thorn: W[13],
  flower: W[14],
  rune: W[15],
};
