import * as THREE from "three";
import woodUrl from "../../assets/textures/wood.png?url";
import ironUrl from "../../assets/textures/iron.png?url";
import { dyeColor } from "./heroModels";

const loader = new THREE.TextureLoader();
function tex(url: string): THREE.Texture {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const woodTex = tex(woodUrl);
const ironTex = tex(ironUrl);

const WOOD = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xf0d4b0 });
const WOOD_DARK = new THREE.MeshLambertMaterial({ map: woodTex, color: 0xa88462 });
const IRON = new THREE.MeshLambertMaterial({ map: ironTex, color: 0xb0b0b8 });
const ROPE = new THREE.MeshLambertMaterial({ color: 0xd8c898 });

function beam(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, sides = 5): THREE.Mesh {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), sides), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function ballistaMesh(team: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: dyeColor(team), side: THREE.DoubleSide });

  for (const s of [1, -1]) {
    const leg = box(1.5, 0.16, 0.2, WOOD_DARK, 0, 0.08, 0);
    leg.rotation.y = s * Math.PI / 4;
    g.add(leg);
    g.add(beam(v(s * 0.5, 0.1, 0.5), v(0, 0.62, 0), 0.06, WOOD_DARK));
    g.add(beam(v(s * 0.5, 0.1, -0.5), v(0, 0.62, 0), 0.06, WOOD_DARK));
  }
  g.add(box(0.3, 0.55, 0.3, WOOD, 0, 0.42, 0));
  g.add(box(0.36, 0.08, 0.36, IRON, 0, 0.7, 0));

  const yaw = new THREE.Group();
  yaw.name = "yaw";
  yaw.position.y = 0.78;
  g.add(yaw);

  const tilt = new THREE.Group();
  tilt.name = "tilt";
  tilt.rotation.x = -0.1;
  yaw.add(tilt);

  tilt.add(box(0.26, 0.18, 2.1, WOOD, 0, 0.12, 0.15));
  tilt.add(box(0.3, 0.04, 2.1, WOOD_DARK, 0, 0.23, 0.15));
  for (const z of [-0.6, 0.35, 0.95]) tilt.add(box(0.3, 0.22, 0.07, IRON, 0, 0.12, z));

  tilt.add(box(0.62, 0.42, 0.26, WOOD_DARK, 0, 0.2, 1.0));
  for (const x of [-0.24, 0.24]) {
    tilt.add(box(0.1, 0.5, 0.3, IRON, x, 0.2, 1.0));
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.46, 6), ROPE);
    coil.position.set(x, 0.2, 1.0);
    tilt.add(coil);
  }

  const tips: THREE.Vector3[] = [];
  for (const s of [1, -1]) {
    const root = v(s * 0.28, 0.22, 1.0);
    const mid = v(s * 0.72, 0.22, 0.95);
    const tip = v(s * 1.05, 0.22, 0.7);
    tilt.add(beam(root, mid, 0.07, WOOD, 5));
    tilt.add(beam(mid, tip, 0.055, WOOD, 5));
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), IRON);
    cap.position.copy(tip);
    tilt.add(cap);
    tips.push(tip);
  }

  const string = new THREE.Group();
  string.name = "string";
  const nut = v(0, 0.24, -0.35);
  for (const tip of tips) string.add(beam(tip, nut, 0.018, ROPE, 3));
  tilt.add(string);

  const bolt = new THREE.Group();
  bolt.name = "bolt";
  bolt.add(beam(v(0, 0.3, -0.3), v(0, 0.3, 1.35), 0.035, WOOD, 4));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 4), IRON);
  head.rotation.x = Math.PI / 2;
  head.position.set(0, 0.3, 1.48);
  bolt.add(head);
  for (const s of [1, -1]) {
    const fin = box(0.14, 0.01, 0.22, cloth, s * 0.06, 0.3, -0.2);
    fin.rotation.z = s * 0.3;
    bolt.add(fin);
  }
  tilt.add(bolt);

  tilt.add(box(0.5, 0.06, 0.06, IRON, 0, 0.12, -0.8));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.44, 6), WOOD_DARK);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, 0.12, -0.8);
  tilt.add(drum);
  for (const s of [1, -1]) {
    const spoke = box(0.04, 0.44, 0.04, WOOD, s * 0.27, 0.12, -0.8);
    spoke.rotation.x = s * 0.6;
    tilt.add(spoke);
  }

  yaw.add(beam(v(-0.12, 0, -0.9), v(-0.12, 1.0, -0.95), 0.025, WOOD_DARK, 4));
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), cloth);
  flag.name = "flag";
  flag.position.set(-0.12, 0.86, -1.12);
  flag.rotation.y = Math.PI / 2;
  yaw.add(flag);

  g.scale.setScalar(1.3);
  return g;
}

export function syncBallista(body: THREE.Object3D, facing: number, sinceFire: number, time: number, dt: number): void {
  const yaw = body.getObjectByName("yaw");
  if (!yaw) return;
  const want = facing - body.rotation.y;
  let d = want - yaw.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  yaw.rotation.y += d * Math.min(1, dt * 8);
  const bolt = body.getObjectByName("bolt");
  const string = body.getObjectByName("string");
  const recoil = sinceFire < 0.12 ? 1 - sinceFire / 0.12 : 0;
  const tilt = body.getObjectByName("tilt");
  if (tilt) tilt.position.z = -recoil * 0.15;
  if (bolt) bolt.visible = sinceFire > 0.9;
  if (string) string.scale.z = sinceFire < 0.9 ? 0.55 + Math.min(1, sinceFire / 0.9) * 0.45 : 1;
  const flag = body.getObjectByName("flag");
  if (flag) flag.rotation.y = Math.PI / 2 + Math.sin(time * 3) * 0.3;
}
