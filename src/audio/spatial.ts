// 3D placement for sound effects. Each live view is a listener (GameRenderer.listeners): a sound is full volume
// near the middle of a view, fades out past its edge (distance scaled by how wide the view sees), is panned by
// where it lands on that view's slice of the screen, and is muffled when the view can't see it. The loudest view
// wins. Sounds made by or landing on a local human's champion never drop below OWN_FLOOR.
import * as THREE from "three";
import type { Listener } from "../render/gameRenderer";

export interface Hearing {
  views: Listener[];
  own: Set<number>;
}

export interface Place {
  gain: number;
  pan: number;
  muffle: boolean;
}

/** Full volume within this fraction of a view's half width; silent beyond FAR. */
const NEAR = 0.6;
const FAR = 1.35;
const OWN_FLOOR = 0.32;
const v = new THREE.Vector3();

export const CENTER: Place = { gain: 1, pan: 0, muffle: false };

/** Where a sound at (x, y, z) sits for the listeners; null when nobody can hear it. */
export function place(h: Hearing, x: number, y: number, z: number, owner?: number): Place | null {
  let best: Place | null = null;
  for (const l of h.views) {
    const half = Math.max(6, l.width / 2);
    const d = Math.hypot(x - l.x, z - l.z) / half;
    const t = THREE.MathUtils.clamp((d - NEAR) / (FAR - NEAR), 0, 1);
    const g = (1 - t) * (1 - t);
    if (g <= 0 || (best && g <= best.gain)) continue;
    v.set(x, y, z).project(l.cam);
    const seen = Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05 && v.z < 1;
    const sx = l.left + THREE.MathUtils.clamp(v.x * 0.5 + 0.5, 0, 1) * l.span;
    best = { gain: seen ? g : g * 0.65, pan: (sx * 2 - 1) * 0.8, muffle: !seen };
  }
  if (owner !== undefined && h.own.has(owner)) {
    if (!best) return { gain: OWN_FLOOR, pan: 0, muffle: true };
    best.gain = Math.max(best.gain, OWN_FLOOR);
  }
  return best;
}

/** A global sound that still leans toward where it happened (the Grudge, eliminations). */
export function lean(h: Hearing, x: number, y: number, z: number): Place {
  const p = place(h, x, y, z);
  return { gain: 1, pan: (p?.pan ?? 0) * 0.6, muffle: false };
}
