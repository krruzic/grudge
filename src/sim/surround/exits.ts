// Map edge exits: runs of water/ford cells touching the map border, where rivers continue out into the surround.
import { Kind, type Terrain } from "../terrain.ts";

export interface Exit {
  edge: "n" | "s" | "w" | "e";
  at: number;
  width: number;
}

export function exits(t: Terrain): Exit[] {
  const out: Exit[] = [];
  const wet = (x: number, z: number) => {
    const k = t.kindAt(x, z);
    return k === Kind.Water || k === Kind.Ford;
  };
  const scan = (edge: Exit["edge"], n: number, at: (i: number) => [number, number]) => {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && wet(...at(i));
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        out.push({ edge, at: (start + i) / 2, width: i - start });
        start = -1;
      }
    }
  };
  scan("n", t.width, (i) => [i, 1]);
  scan("s", t.width, (i) => [i, t.depth - 2]);
  scan("w", t.depth, (i) => [1, i]);
  scan("e", t.depth, (i) => [t.width - 2, i]);
  return out
    .filter((e) => e.width >= (e.edge === "w" || e.edge === "e" ? 1 : 2))
    .map((e) => ({ ...e, width: Math.max(e.width, 2.5) }));
}
