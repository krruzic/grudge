// Costumes: which costumes each hero has (texture repaints in assets/costumes/<hero>/<costume>/ and model costumes
// assets/heroes/<hero>@<costume>.glb), costume texture lookup, and the per-match player -> costume table that
// costumeOfPlayer/costumeOfEntity read (summons and structures resolve to their owner's costume).
import * as THREE from "three";
import { preloadCostumeFx } from "./fx/atlas";

const urls = import.meta.glob("../../assets/costumes/*/*/*.jpg", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
const files = new Map<string, Map<string, string>>();
for (const [path, url] of Object.entries(urls)) {
  const [hero, costume, file] = path.split("/").slice(-3);
  const key = `${hero}/${costume}`;
  if (!files.has(key)) files.set(key, new Map());
  files.get(key)!.set(file.replace(".jpg", ""), url);
}
const modelUrls = import.meta.glob("../../assets/heroes/*@*.glb", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
const models = Object.keys(modelUrls).map((p) => p.split("/").pop()!.replace(".glb", ""));
const loaded = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

export function costumesOf(hero: string): string[] {
  const tex = [...files.keys()]
    .filter((k) => k.startsWith(`${hero}/`))
    .map((k) => k.slice(hero.length + 1))
    .sort();
  const mod = models
    .filter((m) => m.startsWith(`${hero}@`))
    .map((m) => m.slice(hero.length + 1))
    .filter((c) => !tex.includes(c))
    .sort();
  return ["", ...tex, ...mod];
}

export function costumeModel(hero: string, costume: string | undefined): string {
  return costume && models.includes(`${hero}@${costume}`) ? `${hero}@${costume}` : hero;
}

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
  await Promise.all(
    [...files.values()]
      .flatMap((m) => [...m.values()])
      .map(
        (url) =>
          new Promise<void>((res) => {
            if (loaded.has(url)) return res();
            const t = loader.load(
              url,
              () => res(),
              undefined,
              () => res(),
            );
            t.flipY = false;
            t.colorSpace = THREE.SRGBColorSpace;
            t.anisotropy = 4;
            t.userData.keep = true;
            loaded.set(url, t);
          }),
      ),
  );
}

let playerCostumes: string[] = [];
export function setPlayerCostumes(list: string[]): void {
  playerCostumes = list.slice();
  preloadCostumeFx(playerCostumes);
}
let playerNames: (string | null)[] = [];
/** Signed name tags for this match's seats (null = unsigned). Set at match start, before views are built. */
export function setPlayerNames(list: (string | null | undefined)[]): void {
  playerNames = list.map((n) => n || null);
}
/** A seat's display label: its signed tag, else "P1".."P4". */
export function playerLabel(p: number): string {
  return playerNames[p] ?? `P${p + 1}`;
}
export function costumeOfPlayer(p: number | undefined): string {
  return p === undefined ? "" : (playerCostumes[p] ?? "");
}
export function costumeOfEntity(
  w: { getAny(id: number): { hero?: { player: number } } | undefined } | undefined,
  e: { hero?: { player: number }; owner?: number } | undefined,
): string {
  if (!e) return "";
  if (e.hero) return costumeOfPlayer(e.hero.player);
  return e.owner !== undefined ? costumeOfPlayer(w?.getAny(e.owner)?.hero?.player) : "";
}
