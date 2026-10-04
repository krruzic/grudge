// Jump pads (World.jumpPads): wooden spring platforms that compress on wind-up and kick on launch, with dust,
// sparks and landing puffs from "jumppad" events (bursts are queued so they fire on the launch frame).
import * as THREE from "three";
import type { MapFx } from "./mapFx";
import { texture, woodUrl, ironUrl, cobbleUrl } from "./textures";
import { FX } from "../fx/atlas";
import { emit, chunks } from "../fx/parts";

export function buildJumpPads(mf: MapFx): void {
  const w = mf.world;
  if (!w.jumpPads.length) return;
  const wood = new THREE.MeshLambertMaterial({ map: texture(woodUrl, 1), color: 0xd8b890 });
  const iron = new THREE.MeshLambertMaterial({ map: texture(ironUrl, 2), color: 0x9a9aa4 });
  const stone = new THREE.MeshLambertMaterial({ map: texture(cobbleUrl, 1.5), color: 0xb8b0a0 });
  const paint = new THREE.MeshLambertMaterial({ color: 0xe8b830 });
  const red = new THREE.MeshLambertMaterial({ color: 0xb82818 });
  const helix: THREE.Vector3[] = [];
  for (let k = 0; k <= 120; k++) {
    const t = k / 120;
    const a = t * Math.PI * 2 * 4.5;
    helix.push(new THREE.Vector3(Math.cos(a) * 0.55, t, Math.sin(a) * 0.55));
  }
  const springGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 120, 0.065, 6, false);
  const footGeo = new THREE.CylinderGeometry(1.25, 1.4, 0.22, 12);
  const plateGeo = new THREE.CylinderGeometry(0.85, 0.9, 0.08, 14);
  const deckGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.13, 16);
  const rimGeo = new THREE.TorusGeometry(0.95, 0.045, 5, 18);
  const boltGeo = new THREE.SphereGeometry(0.05, 5, 4);
  const arrow = new THREE.Shape();
  arrow.moveTo(0, 0.62);
  arrow.lineTo(0.42, 0.08);
  arrow.lineTo(0.16, 0.08);
  arrow.lineTo(0.16, -0.55);
  arrow.lineTo(-0.16, -0.55);
  arrow.lineTo(-0.16, 0.08);
  arrow.lineTo(-0.42, 0.08);
  arrow.closePath();
  const arrowGeo = new THREE.ShapeGeometry(arrow);
  arrowGeo.rotateX(-Math.PI / 2);
  arrowGeo.rotateY(Math.PI);
  w.jumpPads.forEach((p) => {
    const g = new THREE.Group();
    const y = w.groundY(p.x, p.z);
    g.position.set(p.x, y, p.z);
    g.rotation.y = Math.atan2(p.tx - p.x, p.tz - p.z);
    const foot = new THREE.Mesh(footGeo, stone);
    foot.position.y = 0.02;
    g.add(foot);
    const plate = new THREE.Mesh(plateGeo, iron);
    plate.position.y = 0.16;
    g.add(plate);
    const spring = new THREE.Mesh(springGeo, iron);
    spring.position.y = 0.18;
    spring.scale.y = 0.32;
    g.add(spring);
    const deck = new THREE.Group();
    deck.position.y = 0.52;
    const top = new THREE.Mesh(deckGeo, wood);
    deck.add(top);
    const rim = new THREE.Mesh(rimGeo, iron);
    rim.rotation.x = Math.PI / 2;
    deck.add(rim);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const b = new THREE.Mesh(boltGeo, iron);
      b.position.set(Math.cos(a) * 0.82, 0.07, Math.sin(a) * 0.82);
      deck.add(b);
    }
    const ar = new THREE.Mesh(arrowGeo, paint);
    ar.position.y = 0.072;
    deck.add(ar);
    const tip = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8), red);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0, 0.075, 0.12);
    deck.add(tip);
    g.add(deck);
    mf.root.add(g);
    mf.springs.push({ spring, deck, launch: -99, release: -99 });
  });
}
export function syncJumpPads(mf: MapFx): void {
  const t = mf.world.time;
  mf.world.jumpPads.forEach((p, i) => {
    const s = mf.springs[i];
    if (!s) return;
    const cooling = t < p.readyAt;
    let k = cooling ? 0.55 : 1 + Math.sin(t * 2.2 + i) * 0.03;
    const charge = t - p.chargeAt;
    const sinceLaunch = t - p.launchAt;
    const sinceFail = t - p.failAt;
    if (charge >= 0 && charge < mf.world.jumpCharge && p.launchAt < p.chargeAt) {
      const q = charge / mf.world.jumpCharge;
      k = 1 - 0.62 * q * q + Math.sin(charge * 60) * 0.02 * q;
    } else if (sinceLaunch >= 0 && sinceLaunch < 1.1) {
      k =
        0.55 +
        0.75 * Math.exp(-sinceLaunch * 4.5) * Math.cos(sinceLaunch * 22) * (sinceLaunch < 0.05 ? 0 : 1) +
        0.45 * Math.min(1, sinceLaunch * 20) * Math.exp(-sinceLaunch * 3);
    } else if (sinceFail >= 0 && sinceFail < 0.8) {
      k = 0.55 + 0.25 * Math.exp(-sinceFail * 6) * Math.cos(sinceFail * 30);
    }
    if (cooling && t - p.readyAt > -0.6) k = 0.55 + 0.45 * (1 - (p.readyAt - t) / 0.6);
    s.spring.scale.y = 0.32 * k;
    s.deck.position.y = 0.18 + 0.32 * k + 0.02;
  });
  for (let i = mf.pendingBursts.length - 1; i >= 0; i--) {
    const b = mf.pendingBursts[i];
    if (t < b.at) continue;
    mf.pendingBursts.splice(i, 1);
    if (!mf.fx) continue;
    emit(mf.fx, {
      tex: FX.dust,
      n: 10,
      x: b.x,
      y: b.y + 0.3,
      z: b.z,
      size: [1.0, 1.6],
      grow: 1.6,
      life: [0.4, 0.7],
      speed: [3, 5],
      flatSpread: true,
      opacity: 0.75,
    });
    emit(mf.fx, {
      tex: FX.streak,
      n: 6,
      x: b.x,
      y: b.y + 0.6,
      z: b.z,
      size: [0.5, 0.9],
      life: [0.3, 0.5],
      speed: [7, 11],
      dir: { x: 0, y: 1, z: 0 },
      cone: 0.3,
      additive: true,
      color: 0xfff0c0,
    });
    chunks(mf.fx, 5, b.x, b.y + 0.5, b.z, { size: [0.08, 0.16], speed: [2, 4], up: [3, 5] });
    mf.fx.shake = Math.max(mf.fx.shake, 0.15);
  }
}
export function onJumpPad(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const j = ev as unknown as { stage: string; x: number; y: number; z: number; windup: number };
  if (j.stage === "launch") mf.pendingBursts.push({ at: mf.world.time, x: j.x, y: j.y, z: j.z });
  else if (j.stage === "fail" && mf.fx) {
    emit(mf.fx, {
      tex: FX.smoke,
      n: 5,
      x: j.x,
      y: j.y + 0.6,
      z: j.z,
      size: [0.8, 1.2],
      grow: 1.4,
      life: [0.5, 0.8],
      speed: [0.6, 1.4],
      up: [0.5, 1.2],
      opacity: 0.6,
      color: 0x908880,
    });
    chunks(mf.fx, 3, j.x, j.y + 0.5, j.z, { size: [0.06, 0.12], speed: [1.5, 3], up: [1, 2] });
  } else if (j.stage === "land" && mf.fx) {
    emit(mf.fx, {
      tex: FX.dust,
      n: 12,
      x: j.x,
      y: j.y + 0.2,
      z: j.z,
      size: [1.2, 2.0],
      grow: 1.6,
      life: [0.5, 0.9],
      speed: [3, 6],
      flatSpread: true,
      opacity: 0.8,
    });
    chunks(mf.fx, 4, j.x, j.y + 0.3, j.z, { size: [0.1, 0.2], speed: [2, 4], up: [2, 4] });
    mf.fx.shake = Math.max(mf.fx.shake, 0.3);
  }
}
