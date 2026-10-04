// Stig's tesla coil: the costume's "tesla" prop when available (Calliope's carousel tower), else a procedural
// copper coil on a stone base. Used both as a structure body and inside the tesla zone.
import * as THREE from "three";
import { ENGINEER } from "../fx/atlas";
import { prop } from "../props";
import { IRON, STONE_CHUNK, COPPER } from "./materials";

export function teslaCoil(scale = 1, costume?: string): THREE.Group {
  const g = new THREE.Group();
  const model = prop("tesla", undefined, { hero: "engineer", costume });
  if (model) {
    g.add(model);
    const at = model.getObjectByName("glow");
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ENGINEER.arc,
        color: 0x9ad0ff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.position.y = at ? at.position.y : 2.2;
    glow.scale.setScalar(1.2);
    glow.name = "coilglow";
    g.add(glow);
    g.scale.setScalar(scale);
    return g;
  }
  const iron = IRON;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 0.4, 8), STONE_CHUNK);
  base.position.y = 0.2;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.8, 6), iron);
  post.position.y = 1.2;
  g.add(base, post);
  for (let k = 0; k < 5; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 - k * 0.04, 0.07, 5, 12), COPPER);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.6 + k * 0.3;
    g.add(ring);
  }
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), COPPER);
  ball.position.y = 2.2;
  g.add(ball);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: ENGINEER.arc,
      color: 0x9ad0ff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.position.y = 2.2;
  glow.scale.setScalar(1.2);
  glow.name = "coilglow";
  g.add(glow);
  g.scale.setScalar(scale);
  return g;
}
