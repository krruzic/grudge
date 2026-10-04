// Traps (World.traps): Thorn's bramble snare (thorny jaws that close as it arms, glow ring; desert variant for
// Sun Totem) and the generic spinning trap for everyone else.
import * as THREE from "three";
import { hd, cm } from "../fx/atlas";
import { isDesert, CACTUS, SPINE } from "../kits/desert";
import type { HazardViews } from "./hazardViews";
import { BRAMBLE_DECAL } from "./zones";
import { VINE, thornGeo, THORN, FLOWER, LEAF_B, LEAF_A, vineTex } from "./materials";

export function snareMesh(hz: HazardViews, team: number, r: number, costume?: string): THREE.Object3D {
  const desert = isDesert(costume);
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r * 0.15, r * 1.02, 24),
    new THREE.MeshBasicMaterial({
      map: hd(BRAMBLE_DECAL),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  g.add(ring);
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(r * 0.92, r * 1.05, 28),
    new THREE.MeshBasicMaterial({
      color: hz.teamColors[team],
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  glow.name = "glow";
  g.add(glow);
  const jaws = new THREE.Group();
  jaws.name = "jaws";
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const rr = r * (0.55 + Math.random() * 0.3);
    const A = new THREE.Vector3(Math.cos(a) * rr, -0.1, Math.sin(a) * rr);
    const tip = new THREE.Vector3(Math.cos(a) * rr * 0.25, 0.55 + Math.random() * 0.25, Math.sin(a) * rr * 0.25);
    const M = A.clone()
      .lerp(tip, 0.5)
      .add(new THREE.Vector3(Math.cos(a) * 0.35, 0.25, Math.sin(a) * 0.35));
    const curve = new THREE.QuadraticBezierCurve3(A, M, tip);
    const vine = new THREE.Group();
    vine.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 8, desert ? 0.1 : 0.07, desert ? 8 : 5, false),
        desert ? CACTUS : VINE,
      ),
    );
    for (let k = 0; k < 4; k++) {
      const u = 0.2 + k * 0.2;
      const th = new THREE.Mesh(thornGeo, desert ? SPINE : THORN);
      const side = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).normalize();
      th.position.copy(curve.getPoint(u)).addScaledVector(side, 0.08);
      th.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side);
      vine.add(th);
    }
    if (i % 2 === 0) {
      const lf = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 0.35),
        desert ? cm(FLOWER) : i % 4 ? cm(LEAF_B) : cm(LEAF_A),
      );
      lf.position.copy(curve.getPoint(0.45)).add(new THREE.Vector3(0, 0.06, 0));
      lf.rotation.set(-1.2, Math.random() * 6, 0);
      vine.add(lf);
    }
    vine.userData.a = a;
    jaws.add(vine);
  }
  g.add(jaws);
  const center = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.22, 0),
    desert ? CACTUS : new THREE.MeshLambertMaterial({ map: vineTex, color: 0x8a6a40, flatShading: true }),
  );
  center.position.y = 0.05;
  center.scale.set(1, 0.6, 1);
  g.add(center);
  return g;
}
export function trapMesh(hz: HazardViews, team: number): THREE.Object3D {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.65, 0.12, 8),
    new THREE.MeshLambertMaterial({ color: 0x4a4440, flatShading: true }),
  );
  g.add(base);
  const tm = new THREE.MeshLambertMaterial({
    color: hz.teamColors[team],
    flatShading: true,
    emissive: hz.teamColors[team].clone().multiplyScalar(0.3),
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), tm);
    tooth.position.set(Math.cos(a) * 0.45, 0.2, Math.sin(a) * 0.45);
    tooth.rotation.z = Math.cos(a) * 0.5;
    tooth.rotation.x = -Math.sin(a) * 0.5;
    g.add(tooth);
  }
  return g;
}
