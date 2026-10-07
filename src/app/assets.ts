// Static game data and boot-time asset loading for the browser client.
// Everything here is read-only after boot: the GameData tables the sim runs on, the list of playable maps, the
// roster, and the two-step asset load: loadAssets() fetches what the title screen needs (the UI font, structure /
// unit / prop models, the starting map and a few champions) behind the #boot overlay in index.html, and loadRest()
// then streams in the other maps, champions and costumes while the title screen shows (it waits on them).
import heroData from "../../data/heroes.json";
import talentData from "../../data/talents.json";
import unitData from "../../data/units.json";
import structureData from "../../data/structures.json";
import matchData from "../../data/match.json";
import renderData from "../../data/render.json";
import coreUrl from "../../assets/structures/core.glb?url";
import grassTex from "../../assets/textures/grass.png?url";
import dirtTex from "../../assets/textures/dirt.png?url";
import sandTex from "../../assets/textures/sand.png?url";
import cliffTex from "../../assets/textures/cliff.png?url";
import pavingTex from "../../assets/textures/paving.jpg?url";
import waterTex from "../../assets/textures/water.png?url";
import type { GameData } from "../sim/config";
import { Terrain, type MapData } from "../sim/terrain";
import type { RenderConfig } from "../render/gameRenderer";
import { loadMap } from "../render/mapView";
import { HeroModels } from "../render/heroModels";
import { StructureModels } from "../render/structureModels";
import { loadProps } from "../render/props";
import { preloadCostumes } from "../render/costumes";
import { chasmIce } from "../render/chasmIce";
import { beachDebris } from "../render/beachDebris";
import { UnitModels } from "../render/unitModels";
import { loadFont } from "../ui/font";

/** Match player slots (team deathmatch fields eight champions). */
export const MAX_PLAYERS = 8;

/** Seats a mode plays with. */
export function seatsFor(mode: string): number {
  return mode === "1v1" ? 2 : mode === "tdm" || mode === "ffadm" ? MAX_PLAYERS : 4;
}

/** Deathmatch modes (no bases; sim/tdm.ts): teams of four, or everyone for themselves. */
export function isDeathmatch(mode: string): boolean {
  return mode === "tdm" || mode === "ffadm";
}

/** Team of seat i in a mode: FFA gives everyone a house; otherwise even seats vs odd seats. */
export function teamOfSeat(mode: string, i: number): number {
  return mode === "ffa" || mode === "ffadm" ? i : i % 2;
}

export const data = {
  talents: talentData,
  heroes: heroData,
  units: unitData,
  structures: structureData,
  match: matchData,
} as unknown as GameData;
export { matchData };

/** Shared with the renderer; `?zoom=` patches it before the renderer is built (see App). */
export const renderConfig = renderData as RenderConfig;

/** Playable champions (everything but the 2v2 commander, the Herald). */
export const roster = Object.keys(data.heroes.heroes).filter((k) => data.heroes.heroes[k].role !== "commander");
/** Hero type of the commander seat (slots 2/3 in 2v2 unless the "partners" rule gives them champions). */
export const commanderType =
  Object.keys(data.heroes.heroes).find((k) => data.heroes.heroes[k].role === "commander") ?? roster[0];
export const heroNames = Object.fromEntries(Object.entries(data.heroes.heroes).map(([k, h]) => [k, h.name]));

// ── Maps ──
// A map is playable when both its data (data/maps/<id>.json) and its baked scenery (assets/maps/<id>.glb) exist.

const mapJsons = import.meta.glob("../../data/maps/*.json", { import: "default", eager: true }) as Record<
  string,
  MapData
>;
const mapGlbs = import.meta.glob("../../assets/maps/*.glb", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
/** Menu order; maps not listed here sort after these. */
const MAP_ORDER = ["crossing", "ruins", "shoals", "hollow"];
const orderOf = (id: string) => (MAP_ORDER.indexOf(id) + 99) % 99;

export const maps = Object.entries(mapJsons)
  .map(([path, d]) => {
    const id = fileId(path, ".json");
    return { id, data: d, url: mapGlbs[`../../assets/maps/${id}.glb`] };
  })
  .filter((m) => m.url)
  .sort((a, b) => orderOf(a.id) - orderOf(b.id));

/** Number of houses (teams) a map is built for: 2, or 4 for free-for-all fields. */
export const houses = (i: number): number => maps[i]?.data.teams ?? 2;

// ── Models ──

const globUrls = (urls: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(urls).map(([path, url]) => [fileId(path, ".glb"), url]));

const heroUrls = import.meta.glob("../../assets/heroes/*.glb", { query: "?url", import: "default", eager: true });
const unitUrls = import.meta.glob("../../assets/units/*.glb", { query: "?url", import: "default", eager: true });
const structureUrls = import.meta.glob("../../assets/structures/*.glb", {
  query: "?url",
  import: "default",
  eager: true,
});

function fileId(path: string, ext: string): string {
  return path.split("/").pop()!.replace(ext, "");
}

export type MapView = Awaited<ReturnType<typeof loadMap>>;

export interface Assets {
  /** Indexed like `maps`; maps not loaded yet are holes until loadRest() fills them. */
  mapViews: MapView[];
  heroes: HeroModels;
  structures: StructureModels;
  unitModels: UnitModels;
}

/** Map index a session starts on (`?map=`, else the first in menu order). */
export function startMap(params: URLSearchParams): number {
  return Math.max(
    0,
    maps.findIndex((m) => m.id === params.get("map")),
  );
}

const textures = {
  grass: grassTex,
  dirt: dirtTex,
  rock: cliffTex,
  cobble: pavingTex,
  water: waterTex,
  sand: sandTex,
};

/** A map's scenery plus its procedural dressing that depends on the terrain grid (frozen chasm edges, driftwood). */
async function loadMapView(i: number): Promise<MapView> {
  const terrain = new Terrain(maps[i].data);
  const mv = await loadMap(maps[i].url, terrain, textures, {
    ...renderConfig,
    ...(terrain.atmosphere ?? {}),
  } as typeof renderConfig);
  const ice = chasmIce(terrain);
  if (ice) mv.root.add(ice);
  const beach = beachDebris(terrain);
  if (beach) mv.root.add(beach);
  return mv;
}

const allHeroUrls = globUrls(heroUrls as Record<string, string>);

/**
 * Boot load: everything the title screen's attract match draws - the UI font, structure / unit / prop models, map
 * `first` and the champions `heroes` (base models).
 */
export async function loadAssets(first: number, heroes: string[]): Promise<Assets> {
  const structures = new StructureModels();
  const unitModels = new UnitModels();
  const heroModels = new HeroModels();
  const mapViews: MapView[] = [];
  await Promise.all([
    loadMapView(first).then((mv) => (mapViews[first] = mv)),
    heroModels.load(Object.fromEntries(heroes.map((h) => [h, allHeroUrls[h]]).filter(([, u]) => u))),
    structures.load({ core: coreUrl, ...globUrls(structureUrls as Record<string, string>) }),
    loadProps(),
    unitModels.load(globUrls(unitUrls as Record<string, string>)),
    loadFont(),
  ]);
  return { mapViews, heroes: heroModels, structures, unitModels };
}

/**
 * The rest of the download, after the title screen is up: every other map and champion model (costume models
 * included) and the costume textures. Resolves with the indices of the maps it added.
 */
export async function loadRest(assets: Assets): Promise<number[]> {
  const todo = maps.map((_, i) => i).filter((i) => !assets.mapViews[i]);
  await Promise.all([
    ...todo.map((i) => loadMapView(i).then((mv) => (assets.mapViews[i] = mv))),
    assets.heroes.load(Object.fromEntries(Object.entries(allHeroUrls).filter(([k]) => !assets.heroes.has(k)))),
    preloadCostumes(),
  ]);
  return todo;
}
