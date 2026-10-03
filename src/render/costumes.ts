import * as THREE from "three";

const urls = import.meta.glob("../../assets/costumes/*/*/*.jpg", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const files = new Map<string, Map<string, string>>();
for (const [path, url] of Object.entries(urls)) {
  const [hero, costume, file] = path.split("/").slice(-3);
  const key = `${hero}/${costume}`;
  if (!files.has(key)) files.set(key, new Map());
  files.get(key)!.set(file.replace(".jpg", ""), url);
}
const loaded = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

export function costumesOf(hero: string): string[] {
  return ["", ...[...files.keys()].filter((k) => k.startsWith(`${hero}/`)).map((k) => k.slice(hero.length + 1)).sort()];
}

export const COSTUME_NAMES: Record<string, string> = { "": "CLASSIC", frost: "FROSTFORGE", ember: "SOOT & EMBER", bloodmoon: "BLOODMOON", nightshade: "NIGHTSHADE", lich: "LICH KING", blackrose: "BLACK ROSE", winterbark: "WINTERBARK", blackknight: "BLACK KNIGHT", clock: "CLOCKWORK GOLD", gilded: "GILDED TYRANT", swamp: "SWAMP BRUTE", jackal: "DESERT JACKAL", blood: "BLOOD GOBLIN", plague: "PLAGUE DOCTOR", crimson: "CRIMSON CULT", bleu: "MUSKETEER BLEU", carnival: "CARNIVAL", autumn: "AUTUMN ELDER", blossom: "BLOSSOM", paladin: "PALADIN OF THE SUN", revenant: "RUSTED REVENANT" };

export function costumeTexture(hero: string, costume: string | undefined, matName: string): THREE.Texture | null {
  if (!costume) return null;
  const set = files.get(`${hero}/${costume}`);
  if (!set) return null;
  const base = matName.replace(/^team_/, "").replace(/_skin$/, "");
  const url = set.get(base);
  if (!url) return null;
  let t = loaded.get(url);
  if (!t) {
    t = loader.load(url);
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData.keep = true;
    loaded.set(url, t);
  }
  return t;
}

export async function preloadCostumes(): Promise<void> {
  await Promise.all([...files.values()].flatMap((m) => [...m.values()]).map((url) => new Promise<void>((res) => {
    if (loaded.has(url)) return res();
    const t = loader.load(url, () => res(), undefined, () => res());
    t.flipY = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.userData.keep = true;
    loaded.set(url, t);
  })));
}

let playerCostumes: string[] = [];
export function setPlayerCostumes(list: string[]): void {
  playerCostumes = list.slice();
}
export function costumeOfPlayer(p: number | undefined): string {
  return p === undefined ? "" : playerCostumes[p] ?? "";
}
