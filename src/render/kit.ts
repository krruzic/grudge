import * as THREE from "three";

const matCache = new Map<string, THREE.MeshLambertMaterial>();

function lam(hex: number | THREE.Color, emissive = 0): THREE.MeshLambertMaterial {
  const c = hex instanceof THREE.Color ? hex : new THREE.Color(hex);
  const key = `${c.getHexString()}_${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    if (emissive) m.emissive.copy(c).multiplyScalar(emissive);
    matCache.set(key, m);
  }
  return m;
}

function add(
  parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, name?: string,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (name) m.name = name;
  parent.add(m);
  return m;
}

const SKIN = 0xd9a47a;
const IRON = 0x5c5a60;
const STONE = 0x9a9186;
const STONE_DARK = 0x6e665d;
const WOOD = 0x7a5232;
const GOLD = 0xe0b040;

export function unitPlaceholder(type: string, team: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = "body";
  g.add(body);
  const tm = lam(team);
  if (type === "grunt") {
    add(body, new THREE.BoxGeometry(0.18, 0.4, 0.2), lam(IRON), -0.13, 0.2, 0);
    add(body, new THREE.BoxGeometry(0.18, 0.4, 0.2), lam(IRON), 0.13, 0.2, 0);
    add(body, new THREE.BoxGeometry(0.55, 0.45, 0.35), tm, 0, 0.62, 0);
    add(body, new THREE.IcosahedronGeometry(0.22, 0), lam(SKIN), 0, 1.02, 0.02);
    add(body, new THREE.ConeGeometry(0.26, 0.28, 6), lam(IRON), 0, 1.2, 0);
    const arm = new THREE.Group();
    arm.name = "weapon";
    arm.position.set(0.36, 0.78, 0);
    body.add(arm);
    add(arm, new THREE.BoxGeometry(0.12, 0.35, 0.12), lam(SKIN), 0, -0.15, 0);
    const blade = add(arm, new THREE.BoxGeometry(0.07, 0.07, 0.75), lam(0xcfd3d8), 0, -0.3, 0.35);
    blade.rotation.x = 0.2;
    const shield = add(body, new THREE.CylinderGeometry(0.26, 0.26, 0.07, 6), tm, -0.36, 0.62, 0.08);
    shield.rotation.z = Math.PI / 2;
  } else if (type === "ranged") {
    add(body, new THREE.ConeGeometry(0.36, 0.95, 6), tm, 0, 0.48, 0);
    add(body, new THREE.IcosahedronGeometry(0.2, 0), lam(SKIN), 0, 1.02, 0.02);
    add(body, new THREE.ConeGeometry(0.25, 0.42, 6), tm, 0, 1.22, -0.03);
    const arm = new THREE.Group();
    arm.name = "weapon";
    arm.position.set(0.25, 0.75, 0.15);
    body.add(arm);
    const bow = add(arm, new THREE.TorusGeometry(0.42, 0.035, 4, 8, Math.PI), lam(WOOD), 0, 0, 0.1);
    bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
    add(body, new THREE.BoxGeometry(0.14, 0.5, 0.14), lam(WOOD), -0.12, 0.8, -0.26);
  } else {
    add(body, new THREE.BoxGeometry(0.32, 0.55, 0.36), lam(IRON), -0.25, 0.28, 0);
    add(body, new THREE.BoxGeometry(0.32, 0.55, 0.36), lam(IRON), 0.25, 0.28, 0);
    add(body, new THREE.BoxGeometry(1.0, 0.8, 0.7), lam(IRON), 0, 0.95, 0);
    add(body, new THREE.BoxGeometry(1.04, 0.3, 0.74), tm, 0, 1.05, 0);
    add(body, new THREE.BoxGeometry(0.42, 0.4, 0.42), lam(IRON), 0, 1.52, 0.05);
    add(body, new THREE.BoxGeometry(0.3, 0.06, 0.05), lam(0xffd060, 0.8), 0, 1.55, 0.27);
    add(body, new THREE.BoxGeometry(0.46, 0.3, 0.5), tm, -0.62, 1.3, 0);
    add(body, new THREE.BoxGeometry(0.46, 0.3, 0.5), tm, 0.62, 1.3, 0);
    const arm = new THREE.Group();
    arm.name = "weapon";
    arm.position.set(0.62, 1.15, 0);
    body.add(arm);
    add(arm, new THREE.BoxGeometry(0.26, 0.6, 0.26), lam(IRON), 0, -0.3, 0);
    add(arm, new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), lam(WOOD), 0, -0.55, 0.45).rotation.x = Math.PI / 2;
    add(arm, new THREE.BoxGeometry(0.45, 0.45, 0.6), lam(STONE_DARK), 0, -0.55, 1.05);
  }
  return g;
}

function crenellations(parent: THREE.Object3D, r: number, y: number, n: number, mat: THREE.Material): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    add(parent, new THREE.BoxGeometry(0.35, 0.35, 0.35), mat, Math.cos(a) * r, y, Math.sin(a) * r).rotation.y = -a;
  }
}

export function structurePlaceholder(type: string, team: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const tm = lam(team);
  const glow = lam(team, 0.7);
  const stone = lam(STONE);
  const dark = lam(STONE_DARK);
  add(g, new THREE.CylinderGeometry(1.45, 1.6, 0.35, 8), dark, 0, 0.17, 0);
  if (type === "damage") {
    add(g, new THREE.CylinderGeometry(0.85, 1.1, 2.9, 6), stone, 0, 1.8, 0);
    add(g, new THREE.CylinderGeometry(1.1, 0.95, 0.4, 6), dark, 0, 3.35, 0);
    crenellations(g, 0.95, 3.7, 6, stone);
    add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.6, 4), lam(WOOD), 0, 3.8, 0);
    const c = add(g, new THREE.OctahedronGeometry(0.42, 0), glow, 0, 4.4, 0, "spin");
    c.scale.y = 1.5;
    add(g, new THREE.BoxGeometry(0.5, 0.7, 0.08), tm, 0, 2.3, 0.95);
  } else if (type === "control") {
    add(g, new THREE.CylinderGeometry(1.15, 1.3, 1.5, 8), stone, 0, 1.1, 0);
    add(g, new THREE.CylinderGeometry(0.5, 0.7, 0.9, 6), dark, 0, 2.3, 0);
    const ring = new THREE.Group();
    ring.name = "spin";
    ring.position.y = 2.6;
    g.add(ring);
    const torus = add(ring, new THREE.TorusGeometry(1.1, 0.12, 4, 12), tm, 0, 0, 0);
    torus.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(ring, new THREE.BoxGeometry(0.25, 0.25, 0.25), glow, Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1);
    }
    add(g, new THREE.IcosahedronGeometry(0.4, 0), lam(0x9fd8ff, 0.6), 0, 3.1, 0);
  } else if (type === "support") {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      add(g, new THREE.CylinderGeometry(0.16, 0.2, 2.2, 5), stone, Math.cos(a) * 0.95, 1.4, Math.sin(a) * 0.95);
    }
    add(g, new THREE.CylinderGeometry(1.35, 1.35, 0.25, 4), tm, 0, 2.6, 0).rotation.y = Math.PI / 4;
    add(g, new THREE.ConeGeometry(1.2, 0.8, 4), dark, 0, 3.1, 0).rotation.y = Math.PI / 4;
    add(g, new THREE.IcosahedronGeometry(0.38, 0), lam(0x9dff9a, 0.7), 0, 1.35, 0, "spin");
  } else if (type === "barracks") {
    add(g, new THREE.BoxGeometry(2.4, 1.5, 1.9), lam(0xb8a58a), 0, 1.1, 0);
    const roof = add(g, new THREE.CylinderGeometry(1.4, 1.4, 2.6, 3), tm, 0, 2.25, 0);
    roof.rotation.z = Math.PI / 2;
    roof.scale.set(1, 1, 0.8);
    add(g, new THREE.BoxGeometry(0.6, 0.9, 0.1), lam(WOOD), 0, 0.8, 0.96);
    add(g, new THREE.BoxGeometry(0.08, 1.8, 0.08), lam(WOOD), 1.1, 1.3, 1.05);
    add(g, new THREE.BoxGeometry(0.5, 0.35, 0.04), tm, 1.35, 1.95, 1.05, "spin");
  } else if (type === "range") {
    add(g, new THREE.BoxGeometry(1.6, 1.1, 1.4), lam(WOOD), -0.4, 0.9, -0.2);
    add(g, new THREE.ConeGeometry(1.25, 0.9, 4), tm, -0.4, 1.9, -0.2).rotation.y = Math.PI / 4;
    const tgt = new THREE.Group();
    tgt.position.set(0.9, 1.1, 0.6);
    g.add(tgt);
    add(tgt, new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8), lam(0xf0e6d0), 0, 0, 0).rotation.x = Math.PI / 2;
    add(tgt, new THREE.CylinderGeometry(0.3, 0.3, 0.12, 8), tm, 0, 0, 0).rotation.x = Math.PI / 2;
    add(tgt, new THREE.CylinderGeometry(0.1, 0.1, 0.14, 6), lam(0xffffff), 0, 0, 0).rotation.x = Math.PI / 2;
    add(g, new THREE.BoxGeometry(0.1, 1.0, 0.1), lam(WOOD), 0.9, 0.5, 0.55);
  } else if (type === "foundry") {
    add(g, new THREE.BoxGeometry(2.3, 1.6, 2.0), dark, 0, 1.15, 0);
    add(g, new THREE.BoxGeometry(2.45, 0.3, 2.15), tm, 0, 2.05, 0);
    add(g, new THREE.CylinderGeometry(0.3, 0.38, 1.6, 6), stone, 0.6, 2.8, -0.4);
    add(g, new THREE.BoxGeometry(0.9, 0.7, 0.1), lam(0xff8a20, 0.9), 0, 0.8, 1.01, "spin");
    add(g, new THREE.BoxGeometry(0.6, 0.35, 0.3), lam(IRON), -0.8, 0.55, 1.3);
  }
  const trim = new THREE.Group();
  trim.name = "level2";
  trim.visible = false;
  g.add(trim);
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1;
    add(trim, new THREE.BoxGeometry(0.08, 2.2, 0.08), lam(WOOD), s * 1.3, 1.1, 1.3);
    add(trim, new THREE.BoxGeometry(0.5, 0.7, 0.05), tm, s * 1.3 + s * 0.27, 1.85, 1.3);
    add(trim, new THREE.OctahedronGeometry(0.12, 0), lam(GOLD, 0.4), s * 1.3, 2.3, 1.3);
  }
  return g;
}
