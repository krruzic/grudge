// Bake a map (pnpm bake-map <name> [--ascii]): builds the Terrain and Surround for data/maps/<name>.json and
// writes the derived grid (heights, kinds, flags, decks, styles, props, sampled surround heights + features) to
// assets/maps/<name>.grid.json. --ascii also prints a cell-kind sketch of the map.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Terrain, type MapData } from "../src/sim/terrain.ts";
import { surroundFor } from "../src/sim/surround.ts";

const name = process.argv[2] ?? "crossing";
const data = JSON.parse(readFileSync(`data/maps/${name}.json`, "utf8")) as MapData;
const t = new Terrain(data);

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const sur = surroundFor(t);
let surround: unknown = null;
if (sur) {
  const pad = 90;
  const step = 2;
  const x0 = -pad;
  const z0 = -pad;
  const nx = Math.ceil((t.width + pad * 2) / step);
  const nz = Math.ceil((t.depth + pad * 2) / step);
  const heights: number[] = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) heights.push(r3(sur.ground(x0 + i * step, z0 + j * step)));
  const features = sur
    .buildFeatures()
    .map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === "number" ? r3(v) : v])));
  surround = { style: sur.style, x0, z0, step, nx, nz, heights, features };
}
const out = {
  name: data.name,
  width: t.width,
  depth: t.depth,
  rimHeight: t.rimHeight,
  waterLevel: t.waterLevel,
  heights: Array.from(t.heights, r3),
  kinds: Array.from(t.kinds),
  flags: Array.from(t.flags),
  deck: Array.from(t.deck, r3),
  styles: t.styles,
  props: t.props,
  cores: t.cores,
  pads: t.pads,
  surround,
};

const path = `assets/maps/${name}.grid.json`;
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(out));

if (process.argv.includes("--ascii")) {
  const rows: string[] = [];
  for (let z = 0; z < t.depth; z++) {
    let row = "";
    for (let x = 0; x < t.width; x++) {
      const k = t.kindAt(x, z);
      const h = t.groundHeight(x + 0.5, z + 0.5);
      row +=
        k === 1 && t.styles[t.index(x, z)] === "pit"
          ? "O"
          : k === 1
            ? "#"
            : k === 2
              ? "~"
              : k === 3
                ? "="
                : k === 4
                  ? "B"
                  : k === 5
                    ? "T"
                    : h < 0
                      ? "-"
                      : String(Math.min(9, Math.floor(h * 2)));
    }
    rows.push(row);
  }
  console.log(rows.join("\n"));
}
console.log(`wrote ${path}`);
