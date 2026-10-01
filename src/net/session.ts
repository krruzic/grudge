import type { Command } from "../sim/types";
import type { World } from "../sim/world";
import type { Rules } from "../game/save";

export interface MatchSpec {
  map: string;
  seed: number;
  rules: Rules;
  heroes: string[];
  players: number;
  levels: number[];
  humans: boolean[];
  names: (string | null)[];
}

export interface Frame {
  k: number;
  c: Command[];
}

const round = (v: number) => Math.round(v * 1000) / 1000;

export function packCommand(c: Command): Command {
  const out: Command = { moveX: round(c.moveX), moveZ: round(c.moveZ) };
  for (const [k, v] of Object.entries(c)) {
    if (k === "moveX" || k === "moveZ" || v === undefined || v === false || v === null) continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function mergeCommands(queue: Command[], last: Command): Command {
  if (!queue.length) return { moveX: last.moveX, moveZ: last.moveZ, block: last.block, charging: last.charging };
  const newest = queue[queue.length - 1];
  const out: Command = { moveX: newest.moveX, moveZ: newest.moveZ, block: newest.block, charging: newest.charging };
  const o = out as unknown as Record<string, unknown>;
  for (const c of queue) {
    for (const [k, v] of Object.entries(c)) {
      if (k === "moveX" || k === "moveZ" || k === "block" || k === "charging" || v === undefined || v === false) continue;
      if (o[k] === undefined) o[k] = v;
    }
  }
  return out;
}

export function worldHash(w: World): number {
  let h = w.tick | 0;
  const mix = (v: number) => {
    h = (Math.imul(h, 31) + (v | 0)) | 0;
  };
  for (const e of w.entities) {
    mix(e.id);
    mix(Math.round(e.transform.pos.x * 64));
    mix(Math.round(e.transform.pos.z * 64));
    mix(Math.round(e.hp * 4));
    mix(Math.round(e.transform.facing * 256));
    mix(e.alive ? 1 : 0);
  }
  for (const t of w.teams) {
    mix(Math.round(t.resource * 4));
    mix(t.unitCount);
  }
  mix(w.projectiles.length);
  return h >>> 0;
}
