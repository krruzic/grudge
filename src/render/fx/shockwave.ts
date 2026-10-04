// Shockwave: an expanding, flattening, fading torus facing `normal`, tinted (instanced; the texture argument is
// kept for call-site symmetry but every shockwave uses the same untextured torus).
import * as THREE from "three";
import { FxBatch, fxBatch } from "./instances";
import { tint } from "./atlas";
import { type FxHost } from "./parts";

export const torusGeo = new THREE.TorusGeometry(1, 0.05, 4, 36);
torusGeo.userData.model = true;
export function shockwave(
  h: FxHost,
  _tex: THREE.Texture,
  x: number,
  y: number,
  z: number,
  normal: THREE.Vector3,
  r0: number,
  r1: number,
  dur: number,
  color: THREE.ColorRepresentation = 0xffffff,
  opacity = 1,
): void {
  const m = fxBatch(
    h.root,
    "shock",
    () =>
      new FxBatch(
        torusGeo,
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      ),
  ).spawn();
  m.color.set(tint(color));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  m.position.set(x, y, z);
  h.add(m, dur, (k) => {
    const e = 1 - (1 - k) * (1 - k) * (1 - k);
    const r = Math.max(0.05, r0 + (r1 - r0) * e);
    m.scale.set(r, r, r * 0.5 * (1 - k * 0.6));
    m.opacity = opacity * 0.85 * (1 - k * k);
  });
}
