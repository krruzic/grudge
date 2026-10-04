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
import { cacheCanvas } from "../ui/cacheCanvas";

const CELL = 128;
const COLS = 4;

const variantUrls = import.meta.glob("../../assets/fx/*@*.png", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
const VARIANT_URL = new Map(Object.entries(variantUrls).map(([p, u]) => [p.split("/").pop()!.replace(".png", ""), u]));
const hqUrls = import.meta.glob("../../assets/fx/hq/*.png", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
const HQ_URL = new Map(Object.entries(hqUrls).map(([p, u]) => [p.split("/").pop()!.replace(".png", ""), u]));

const waits: Promise<void>[] = [];
function cells(): THREE.CanvasTexture[] {
  const out: THREE.CanvasTexture[] = [];
  for (let i = 0; i < 16; i++) {
    const c = cacheCanvas();
    c.width = c.height = CELL;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    out.push(t);
  }
  return out;
}
function load(url: string, out: THREE.CanvasTexture[], done: () => void): void {
  const img = new Image();
  img.onload = () => {
    out.forEach((t, i) => {
      const g = (t.image as HTMLCanvasElement).getContext("2d")!;
      g.drawImage(img, (i % COLS) * CELL, Math.floor(i / COLS) * CELL, CELL, CELL, 0, 0, CELL, CELL);
      t.needsUpdate = true;
    });
    done();
  };
  img.onerror = () => done();
  img.src = url;
}
function sheet(url: string): THREE.CanvasTexture[] {
  const out = cells();
  waits.push(new Promise<void>((r) => load(url, out, r)));
  return out;
}

interface Atlas {
  name: string;
  base: THREE.CanvasTexture[];
  vars: Map<string, THREE.CanvasTexture[] | null | "loading">;
}
const CELL_OF = new Map<THREE.Texture, { a: Atlas; i: number }>();
const BASE_OF = new Map<THREE.Texture, THREE.Texture>();
let active = "";
let touched = false;
let missed = false;

function variant(a: Atlas, c: string): THREE.CanvasTexture[] | null {
  let v = a.vars.get(c);
  if (v === undefined) {
    const url = VARIANT_URL.get(`${a.name}@${c}`);
    if (!url) {
      a.vars.set(c, null);
      return null;
    }
    const out = cells();
    out.forEach((t, i) => BASE_OF.set(t, a.base[i]));
    a.vars.set(c, "loading");
    load(url, out, () => a.vars.set(c, out));
    v = "loading";
  }
  if (v === "loading") {
    missed = true;
    return null;
  }
  if (v) touched = true;
  return v;
}

function atlas<K extends string>(name: string, url: string, keys: readonly K[]): Record<K, THREE.CanvasTexture> {
  const a: Atlas = { name, base: sheet(url), vars: new Map() };
  a.base.forEach((t, i) => CELL_OF.set(t, { a, i }));
  keys.forEach((k, i) => hdAlias(a.base[i], name, `${name}.${k}`));
  const o = {} as Record<K, THREE.CanvasTexture>;
  keys.forEach((k, i) =>
    Object.defineProperty(o, k, { enumerable: true, get: () => (active && variant(a, active)?.[i]) || a.base[i] }),
  );
  return o;
}

export function useCostume(c: string | undefined): string {
  const prev = active;
  active = c ?? "";
  return prev;
}

export function withCostume<T>(c: string | undefined, fn: () => T): T {
  const prev = useCostume(c);
  try {
    return fn();
  } finally {
    active = prev;
  }
}

export function activeCostume(): string {
  return active;
}

export function preloadCostumeFx(list: string[]): void {
  for (const c of list) if (c) for (const t of CELL_OF.keys()) cv(t, c);
  for (const { id } of HQ_ID.values()) for (const c of list) if (c) hqTex(`${id}@${c}`);
}

const HQ_ID = new Map<THREE.Texture, { atlas: string; id: string }>();
export function hdAlias(t: THREE.Texture, atlas: string, id: string): void {
  for (const k of HQ_URL.keys()) if (k === id || k.startsWith(`${id}@`)) return void HQ_ID.set(t, { atlas, id });
}
const HQ = new Map<string, { t: THREE.Texture; ready: boolean } | null>();
function hqTex(id: string): THREE.Texture | null {
  let h = HQ.get(id);
  if (h === undefined) {
    const url = HQ_URL.get(id);
    h = null;
    if (url) {
      const e = { t: new THREE.Texture(), ready: false };
      e.t = new THREE.TextureLoader().load(url, () => (e.ready = true));
      e.t.colorSpace = THREE.SRGBColorSpace;
      e.t.anisotropy = 4;
      e.t.userData.keep = true;
      h = e;
    }
    HQ.set(id, h);
  }
  return h?.ready ? h.t : null;
}

export function hd<T extends THREE.Texture>(t: T, c = active): T {
  const base = baseTex(t);
  const v = cv(base as T, c);
  const vb = baseTex(v);
  if (vb !== base) return hd(vb as T, c);
  const hq = HQ_ID.get(base);
  if (!hq) return v;
  const themed = !!c && VARIANT_URL.has(`${hq.atlas}@${c}`);
  const out = themed ? hqTex(`${hq.id}@${c}`) : hqTex(hq.id);
  if (!out) return v;
  BASE_OF.set(out, base);
  return out as T;
}

export function baseTex(t: THREE.Texture): THREE.Texture {
  return BASE_OF.get(t) ?? t;
}

interface Comp {
  size: number;
  draw: (g: CanvasRenderingContext2D, img: (t: THREE.Texture) => CanvasImageSource) => void;
  repeat: boolean;
  res: number;
  vars: Map<string, THREE.CanvasTexture | null>;
}
const COMPS = new Map<THREE.Texture, Comp>();
let baseReady = false;

function paint(size: number, repeat: boolean, res = 256): { t: THREE.CanvasTexture; g: CanvasRenderingContext2D } {
  const k = Math.max(1, Math.round(res / size));
  const c = cacheCanvas();
  c.width = c.height = size * k;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const g = c.getContext("2d")!;
  g.scale(k, k);
  return { t, g };
}

function compVariant(base: THREE.Texture, comp: Comp, c: string): THREE.Texture {
  const v = comp.vars.get(c);
  if (v !== undefined) return v ?? base;
  if (!baseReady) return base;
  const st = [touched, missed];
  touched = missed = false;
  const { t, g } = paint(comp.size, comp.repeat, comp.res);
  const prev = useCostume(c);
  comp.draw(g, (x) => cv(x).image as CanvasImageSource);
  active = prev;
  const hit = touched;
  const pending = missed;
  [touched, missed] = st;
  if (hit) {
    t.needsUpdate = true;
    BASE_OF.set(t, base);
    comp.vars.set(c, t);
    return t;
  }
  t.dispose();
  if (!pending) comp.vars.set(c, null);
  return base;
}

const SWAPS: Record<string, Map<THREE.Texture, THREE.Texture>> = {};
export function setCostumeSwap(c: string, from: THREE.Texture, to: THREE.Texture): void {
  (SWAPS[c] ??= new Map()).set(from, to);
}

export function cv<T extends THREE.Texture>(t: T, c = active): T {
  if (!c) return t;
  const s = SWAPS[c]?.get(t);
  if (s && s !== t) {
    const v = cv(s, c);
    if (v !== s) return v as unknown as T;
  }
  const cell = CELL_OF.get(t);
  if (cell) return (variant(cell.a, c)?.[cell.i] as unknown as T) ?? t;
  const comp = COMPS.get(t);
  if (comp) return compVariant(t, comp, c) as T;
  return t;
}

const MAT_VARS = new WeakMap<THREE.Material, Map<string, THREE.Material>>();
export function cm<M extends THREE.Material>(m: M, c = active): M {
  const map = (m as unknown as { map?: THREE.Texture | null }).map;
  if (!c || !map) return m;
  const t = cv(map, c);
  if (t === map) return m;
  let per = MAT_VARS.get(m);
  if (!per) MAT_VARS.set(m, (per = new Map()));
  let v = per.get(c) as M | undefined;
  if (!v) {
    v = m.clone() as M;
    (v as unknown as { map: THREE.Texture }).map = t;
    v.userData.keep = true;
    per.set(c, v);
  }
  return v;
}

const TINTS: Record<string, Record<number, number>> = {};
export function setCostumeTints(c: string, map: Record<number, number>): void {
  TINTS[c] = { ...TINTS[c], ...map };
}
export function tint<C extends THREE.ColorRepresentation | undefined>(col: C, c = active): C {
  if (!c || typeof col !== "number") return col;
  const m = TINTS[c];
  return (m && m[col] !== undefined ? m[col] : col) as C;
}

const TRAILS: Record<string, Record<string, number>> = {};
export function setCostumeTrail(c: string, slot: string, col: number): void {
  (TRAILS[c] ??= {})[slot] = col;
}
export function trailOf(c: string | undefined, slot = "trail"): number | undefined {
  return c ? TRAILS[c]?.[slot] : undefined;
}

const C = sheet(commonUrl);

export function composite(
  size: number,
  draw: (g: CanvasRenderingContext2D, img: (t: THREE.Texture) => CanvasImageSource) => void,
  repeat = false,
  res = 256,
): THREE.CanvasTexture {
  const { t, g } = paint(size, repeat, res);
  COMPS.set(t, { size, draw, repeat, res, vars: new Map() });
  void fxReady.then(() => {
    const prev = useCostume("");
    draw(g, (x) => x.image as CanvasImageSource);
    active = prev;
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
for (const [k, t] of Object.entries(FX)) hdAlias(t, "common", `common.${k}`);

export const WARDEN = atlas("warden", wardenUrl, [
  "leaf",
  "leafAutumn",
  "bark",
  "moss",
  "wisp",
  "vine",
  "wreath",
  "roots",
  "splinters",
  "natureBurst",
  "stone",
  "pebbleDust",
  "mossCrack",
  "thorn",
  "flower",
  "rune",
] as const);

export const WARLORD = atlas("warlord", warlordUrl, [
  "rage",
  "slab",
  "lavaCrack",
  "shout",
  "helm",
  "dust",
  "ember",
  "splash",
  "ring",
  "swoosh",
  "pebbles",
  "impact",
  "horn",
  "lavaGlow",
  "crackRing",
  "rune",
] as const);

export const ENGINEER = atlas("engineer", engineerUrl, [
  "gear",
  "gearSmall",
  "weld",
  "steam",
  "nut",
  "spring",
  "wrench",
  "plank",
  "rivet",
  "arc",
  "oilSmoke",
  "clang",
  "ring",
  "blueprint",
  "shards",
  "heal",
] as const);

export const RAIDER = atlas("raider", raiderUrl, [
  "smoke",
  "shadow",
  "poison",
  "slash",
  "cross",
  "glint",
  "knife",
  "drop",
  "darkSlash",
  "dashStreak",
  "bubble",
  "smokeRing",
  "skull",
  "afterimage",
  "dust",
  "vortex",
] as const);

export const SUMMONER = atlas("summoner", summonerUrl, [
  "orb",
  "crystal",
  "sparkle",
  "ghost",
  "bones",
  "hex",
  "flame",
  "soulFlame",
  "graveHand",
  "trail",
  "burst",
  "smoke",
  "skull",
  "bolt",
  "eyes",
  "circle",
] as const);

export const DUELIST = atlas("duelist", duelistUrl, [
  "glint",
  "rapier",
  "crescent",
  "feather",
  "sparkle",
  "clash",
  "speed",
  "fleur",
  "ribbon",
  "star",
  "crossed",
  "petal",
  "gust",
  "parryRing",
  "crit",
  "cut",
] as const);

export const HERALD = atlas("herald", heraldUrl, [
  "beams",
  "fleur",
  "horn",
  "flag",
  "halo",
  "coin",
  "rays",
  "heal",
  "shield",
  "laurel",
  "blast",
  "arrow",
  "plume",
  "star",
  "dust",
  "crown",
] as const);

export const WREN = atlas("wren", wrenUrl, [
  "feather",
  "feathers",
  "claws",
  "arrow",
  "streak",
  "splinters",
  "leaf",
  "leaves",
  "markRing",
  "arrowRing",
  "heart",
  "glint",
  "dizzy",
  "gust",
  "flame",
  "spiral",
] as const);

export const FRIAR = atlas("friar", friarUrl, [
  "foam",
  "bubble",
  "drop",
  "splash",
  "puddle",
  "hop",
  "barley",
  "stave",
  "hoop",
  "bung",
  "heal",
  "cheers",
  "smoke",
  "spark",
  "blast",
  "hopRing",
] as const);

export const fxReady = Promise.all(waits).then(() => {
  baseReady = true;
  for (const { id } of HQ_ID.values()) hqTex(id);
});
