// Shared loaders for the headless tools: the data/*.json balance tables as a GameData, and maps by name.
// Paths are relative to the working directory, so run tools from the repo root (npm scripts do).
import { readFileSync } from "node:fs";
import type { GameData } from "../src/sim/config.ts";
import type { MapData } from "../src/sim/terrain.ts";

export const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

export function loadGameData(): GameData {
  return {
    talents: readJson("data/talents.json"),
    heroes: readJson("data/heroes.json"),
    units: readJson("data/units.json"),
    structures: readJson("data/structures.json"),
    match: readJson("data/match.json"),
  };
}

export function loadMap(name: string): MapData {
  return readJson(`data/maps/${name}.json`) as MapData;
}
