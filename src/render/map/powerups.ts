// Team deathmatch power-ups (World.tdm.powerups): each spot has a faint rune ring on the ground; a ready power-up
// floats and spins above it with a coloured glow - a red potion flask, an orange war-axe head (might), a blue
// wing (haste), a gold shield and a violet hourglass (rush: cooldowns ready, super meter) - painted Tripo models
// (assets/props/power_*.glb), with the vector versions below as a fallback. Taking one pops a burst of its colour (onPowerup).
import * as THREE from "three";
import { glowTex } from "../combat/textures";
import { emit } from "../fx/parts";
import { FX } from "../fx/atlas";
import type { MapFx } from "./mapFx";
import { prop } from "../props";

const COLOR: Record<string, number> = {
  potion: 0xff3a48,
  might: 0xff8a20,
  haste: 0x40b8ff,
  shield: 0xffd040,
  rush: 0xb070ff,
};

const lambert = (color: number, emissive = 0x000000) =>
  new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });

function potion(): THREE.Object3D {
  const g = new THREE.Group();
  const prof = [
    [0.0, 0.0],
    [0.24, 0.02],
    [0.3, 0.16],
    [0.28, 0.32],
    [0.12, 0.42],
    [0.1, 0.58],
    [0.13, 0.62],
    [0.0, 0.62],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const glass = new THREE.Mesh(
    new THREE.LatheGeometry(prof, 10),
    new THREE.MeshLambertMaterial({ color: 0xff3048, emissive: 0x500810, transparent: true, opacity: 0.9 }),
  );
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.12, 6), lambert(0x9a6a3a));
  cork.position.y = 0.66;
  g.add(glass, cork);
  return g;
}

function might(): THREE.Object3D {
  const g = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 5), lambert(0x6a4020));
  const s = new THREE.Shape();
  s.moveTo(0, -0.05);
  s.quadraticCurveTo(0.34, -0.2, 0.36, 0.06);
  s.quadraticCurveTo(0.34, 0.3, 0, 0.17);
  s.closePath();
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }),
    lambert(0xc8ccd8, 0x401808),
  );
  blade.position.set(0.02, 0.18, -0.03);
  g.add(haft, blade);
  return g;
}

function haste(): THREE.Object3D {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.5, 0.1, 0.62, 0.5);
  s.quadraticCurveTo(0.35, 0.35, 0.08, 0.32);
  s.quadraticCurveTo(0.3, 0.2, 0, 0);
  const wing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }),
    lambert(0x7ad0ff, 0x103050),
  );
  wing.position.set(-0.3, -0.2, 0);
  const g = new THREE.Group();
  g.add(wing);
  return g;
}

function shield(): THREE.Object3D {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10), lambert(0xd8a030, 0x302008));
  disc.rotation.x = Math.PI / 2;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), lambert(0xf0e0b0));
  boss.position.z = 0.05;
  g.add(disc, boss);
  return g;
}

function rush(): THREE.Object3D {
  // An hourglass: two violet glass cones point to point between gold caps.
  const g = new THREE.Group();
  const glass = new THREE.MeshLambertMaterial({ color: 0xc090ff, emissive: 0x401870, transparent: true, opacity: 0.9 });
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8), glass);
  top.rotation.x = Math.PI;
  top.position.y = 0.17;
  const bot = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 8), glass);
  bot.position.y = -0.13;
  const cap = lambert(0xe0b040, 0x302008);
  const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 8), cap);
  c1.position.y = 0.34;
  const c2 = c1.clone();
  c2.position.y = -0.3;
  g.add(top, bot, c1, c2);
  return g;
}

const MAKE: Record<string, () => THREE.Object3D> = { potion, might, haste, shield, rush };

export interface PowerView {
  root: THREE.Group;
  item: THREE.Object3D;
  glow: THREE.Sprite;
  ring: THREE.Mesh;
}

const ringGeo = new THREE.RingGeometry(0.62, 0.8, 24);

function makeView(kind: string): PowerView {
  const root = new THREE.Group();
  // Painted Tripo model (assets/props/power_<kind>.glb), centred on its spin axis; the vector one until it loads.
  const model = prop(`power_${kind}`);
  let item: THREE.Object3D;
  if (model) {
    item = new THREE.Group();
    // Fit the model's largest side to ~0.95 m whatever its export size (the axe lies diagonally).
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const k = 0.95 / Math.max(size.x, size.y, size.z, 0.01);
    model.scale.multiplyScalar(k);
    model.position.set(
      (-(box.min.x + box.max.x) / 2) * k,
      (-(box.min.y + box.max.y) / 2) * k,
      (-(box.min.z + box.max.z) / 2) * k,
    );
    item.add(model);
  } else {
    item = (MAKE[kind] ?? potion)();
    item.scale.setScalar(1.5);
  }
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: COLOR[kind] ?? 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(1.6);
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({
      color: COLOR[kind] ?? 0xffffff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  root.add(item, glow, ring);
  return { root, item, glow, ring };
}

export function syncPowerups(mf: MapFx, time: number): void {
  const tdm = mf.world.tdm;
  if (!tdm) return;
  const live = new Set<number>();
  for (const p of tdm.powerups) {
    live.add(p.id);
    let v = mf.powerViews.get(p.id);
    if (!v) {
      v = makeView(p.kind);
      mf.root.add(v.root);
      mf.powerViews.set(p.id, v);
    }
    const ready = mf.world.time >= p.readyAt;
    v.root.position.set(p.x, p.y, p.z);
    v.item.visible = v.glow.visible = ready;
    v.item.position.y = 1.0 + Math.sin(time * 2.4 + p.id) * 0.12;
    v.item.rotation.y = time * 1.6 + p.id;
    v.glow.position.y = v.item.position.y + 0.25;
    (v.glow.material as THREE.SpriteMaterial).opacity = 0.55 + Math.sin(time * 5 + p.id) * 0.15;
    v.ring.position.y = 0.06;
    (v.ring.material as THREE.MeshBasicMaterial).opacity = ready ? 0.45 : 0.12;
  }
  for (const [id, v] of mf.powerViews)
    if (!live.has(id)) {
      mf.root.remove(v.root);
      mf.powerViews.delete(id);
    }
}

export function onPowerup(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  if (!mf.fx || ev.stage !== "take") return;
  emit(mf.fx, {
    tex: FX.twinkle,
    n: 10,
    x: ev.x as number,
    y: (ev.y as number) + 1,
    z: ev.z as number,
    size: [0.3, 0.6],
    life: [0.4, 0.7],
    speed: [2, 4],
    up: [1, 3],
    additive: true,
    color: COLOR[ev.kind as string] ?? 0xffffff,
  });
}
