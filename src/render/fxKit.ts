import * as THREE from "three";
import commonUrl from "../../assets/fx/common.png?url";
import wardenUrl from "../../assets/fx/warden.png?url";
import warlordUrl from "../../assets/fx/warlord.png?url";
import engineerUrl from "../../assets/fx/engineer.png?url";
import raiderUrl from "../../assets/fx/raider.png?url";
import summonerUrl from "../../assets/fx/summoner.png?url";
import duelistUrl from "../../assets/fx/duelist.png?url";
import heraldUrl from "../../assets/fx/herald.png?url";
import wrenUrl from "../../assets/fx/wren.png?url";
import friarUrl from "../../assets/fx/friar.png?url";

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
const WL = sheet(warlordUrl, 16);
const EN = sheet(engineerUrl, 16);
const RA = sheet(raiderUrl, 16);
const SU = sheet(summonerUrl, 16);
const DU = sheet(duelistUrl, 16);
const HE = sheet(heraldUrl, 16);
const WR = sheet(wrenUrl, 16);
const FR = sheet(friarUrl, 16);

export const fxReady = Promise.all(waits).then(() => undefined);

export function composite(size: number, draw: (g: CanvasRenderingContext2D, img: (t: THREE.Texture) => CanvasImageSource) => void, repeat = false): THREE.CanvasTexture {
  const k = Math.max(1, Math.round(256 / size));
  const c = document.createElement("canvas");
  c.width = c.height = size * k;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  void fxReady.then(() => {
    const g = c.getContext("2d")!;
    g.scale(k, k);
    draw(g, (x) => x.image as CanvasImageSource);
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

export const WARLORD = {
  rage: WL[0], slab: WL[1], lavaCrack: WL[2], shout: WL[3], helm: WL[4], dust: WL[5], ember: WL[6], splash: WL[7],
  ring: WL[8], swoosh: WL[9], pebbles: WL[10], impact: WL[11], horn: WL[12], lavaGlow: WL[13], crackRing: WL[14], rune: WL[15],
};

export const ENGINEER = {
  gear: EN[0], gearSmall: EN[1], weld: EN[2], steam: EN[3], nut: EN[4], spring: EN[5], wrench: EN[6], plank: EN[7],
  rivet: EN[8], arc: EN[9], oilSmoke: EN[10], clang: EN[11], ring: EN[12], blueprint: EN[13], shards: EN[14], heal: EN[15],
};

export const RAIDER = {
  smoke: RA[0], shadow: RA[1], poison: RA[2], slash: RA[3], cross: RA[4], glint: RA[5], knife: RA[6], drop: RA[7],
  darkSlash: RA[8], dashStreak: RA[9], bubble: RA[10], smokeRing: RA[11], skull: RA[12], afterimage: RA[13], dust: RA[14], vortex: RA[15],
};

export const SUMMONER = {
  orb: SU[0], crystal: SU[1], sparkle: SU[2], ghost: SU[3], bones: SU[4], hex: SU[5], flame: SU[6], soulFlame: SU[7],
  graveHand: SU[8], trail: SU[9], burst: SU[10], smoke: SU[11], skull: SU[12], bolt: SU[13], eyes: SU[14], circle: SU[15],
};

export const DUELIST = {
  glint: DU[0], rapier: DU[1], crescent: DU[2], feather: DU[3], sparkle: DU[4], clash: DU[5], speed: DU[6], fleur: DU[7],
  ribbon: DU[8], star: DU[9], crossed: DU[10], petal: DU[11], gust: DU[12], parryRing: DU[13], crit: DU[14], cut: DU[15],
};

export const HERALD = {
  beams: HE[0], fleur: HE[1], horn: HE[2], flag: HE[3], halo: HE[4], coin: HE[5], rays: HE[6], heal: HE[7],
  shield: HE[8], laurel: HE[9], blast: HE[10], arrow: HE[11], plume: HE[12], star: HE[13], dust: HE[14], crown: HE[15],
};

export const WREN = {
  feather: WR[0], feathers: WR[1], claws: WR[2], arrow: WR[3], streak: WR[4], splinters: WR[5], leaf: WR[6], leaves: WR[7],
  markRing: WR[8], arrowRing: WR[9], heart: WR[10], glint: WR[11], dizzy: WR[12], gust: WR[13], flame: WR[14], spiral: WR[15],
};

export const FRIAR = {
  foam: FR[0], bubble: FR[1], drop: FR[2], splash: FR[3], puddle: FR[4], hop: FR[5], barley: FR[6], stave: FR[7],
  hoop: FR[8], bung: FR[9], heal: FR[10], cheers: FR[11], smoke: FR[12], spark: FR[13], blast: FR[14], hopRing: FR[15],
};
