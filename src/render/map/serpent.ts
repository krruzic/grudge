// Dune serpent (Emberdune Spires) visuals for MapEvents.serpent: a travelling sand mound with three rust-red dorsal
// fins and a sand wake while it swims; the mound swells and shakes during a breach warning (plus a rumble ring);
// on breach the serpent model (assets/props/serpent.glb) bursts up out of the sand, roars, and sinks back.
import * as THREE from "three";
import duneUrl from "../../../assets/textures/desert_dune.png?url";
import { FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { prop } from "../props";
import { cacheCanvas } from "../../ui/cacheCanvas";
import type { MapFx } from "./mapFx";

const SAND = 0xe6c690;

const duneTex = new THREE.TextureLoader().load(duneUrl);
duneTex.colorSpace = THREE.SRGBColorSpace;
duneTex.wrapS = duneTex.wrapT = THREE.RepeatWrapping;

/** Dusty rumble ring under a breach warning. */
const rumbleTex = (() => {
  const c = cacheCanvas();
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 126);
  grad.addColorStop(0, "rgba(255,210,150,0)");
  grad.addColorStop(0.7, "rgba(255,190,110,0.75)");
  grad.addColorStop(0.88, "rgba(255,235,190,0.95)");
  grad.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

export interface SerpentView {
  root: THREE.Group;
  mound: THREE.Mesh;
  fins: THREE.Mesh[];
  wakeAcc: number;
  rises: { obj: THREE.Object3D; t: number; x: number; y: number; z: number; dir: number }[];
}

export function buildSerpent(mf: MapFx): void {
  if (!mf.world.mapEvents.serpent) return;
  const root = new THREE.Group();
  const moundGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const mound = new THREE.Mesh(moundGeo, new THREE.MeshLambertMaterial({ map: duneTex, color: 0xf2dcb0 }));
  mound.scale.set(1.6, 0.55, 3.2);
  root.add(mound);
  const finMat = new THREE.MeshLambertMaterial({ color: 0xa04a28, flatShading: true });
  const fins: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1 - i * 0.2, 4), finMat);
    fin.scale.set(0.35, 1, 1.6);
    fin.position.set(0, 0.55, 1.3 - i * 1.25);
    fin.rotation.x = -0.35;
    root.add(fin);
    fins.push(fin);
  }
  mf.root.add(root);
  mf.serpent = { root, mound, fins, wakeAcc: 0, rises: [] };
}

export function syncSerpent(mf: MapFx, dt: number): void {
  const v = mf.serpent;
  const s = mf.world.mapEvents.serpent;
  if (!v || !s) return;
  const w = mf.world;
  const y = w.groundY(s.x, s.z);
  const warn = s.mode === "warn";
  const shake = warn ? Math.sin(mf.now * 40) * 0.08 : 0;
  v.root.position.set(s.x + shake, y - 0.15, s.z);
  v.root.rotation.y = s.dir;
  const swell = warn ? 1.35 : 1;
  v.mound.scale.set(1.6 * swell, 0.55 * swell + (warn ? Math.abs(Math.sin(mf.now * 9)) * 0.15 : 0), 3.2 * swell);
  v.fins.forEach((f, i) => (f.position.y = 0.55 + Math.sin(mf.now * 4 + i) * 0.08 + (warn ? -0.5 : 0)));
  // Sand wake behind it while it swims.
  v.wakeAcc += dt;
  if (mf.fx && v.wakeAcc > (warn ? 0.05 : 0.09)) {
    v.wakeAcc = 0;
    const bx = s.x - Math.sin(s.dir) * 2.6;
    const bz = s.z - Math.cos(s.dir) * 2.6;
    emit(mf.fx, {
      tex: FX.dust,
      n: warn ? 3 : 1,
      x: warn ? s.x : bx,
      y: y + 0.3,
      z: warn ? s.z : bz,
      size: [0.8, 1.4],
      grow: 1.6,
      life: [0.7, 1.1],
      speed: [0.4, warn ? 2.5 : 1],
      up: [0.3, warn ? 1.6 : 0.6],
      jitter: 0.8,
      color: SAND,
      opacity: 0.7,
    });
  }
  // Breach bodies: rise fast, hold, sink.
  for (let i = v.rises.length - 1; i >= 0; i--) {
    const r = v.rises[i];
    r.t += dt;
    const up = r.t < 0.25 ? r.t / 0.25 : r.t < 0.95 ? 1 : Math.max(0, 1 - (r.t - 0.95) / 0.55);
    r.obj.position.set(r.x, r.y - 6.5 + up * 6.2, r.z);
    r.obj.scale.setScalar(1.45);
    r.obj.rotation.set(0, r.dir + Math.sin(r.t * 6) * 0.08, 0);
    if (r.t > 1.5) {
      mf.root.remove(r.obj);
      v.rises.splice(i, 1);
    }
  }
  v.root.visible = !v.rises.length;
}

export function onSerpent(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const h = mf.fx;
  const v = mf.serpent;
  if (!h || !v) return;
  const x = ev.x as number;
  const y = ev.y as number;
  const z = ev.z as number;
  const r = mf.world.mapEvents.serpentDef?.breachRadius ?? 3.2;
  if (ev.stage === "warn") {
    const secs = (ev.seconds as number) ?? 2;
    decal(h, rumbleTex, x, y + 0.05, z, r + 0.3, secs, { grow: 0.1, spin: 1.2, additive: true, opacity: 0.85 });
    h.shake = Math.max(h.shake, 0.12);
    return;
  }
  if (ev.stage !== "breach") return;
  const body = prop("serpent");
  if (body) {
    mf.root.add(body);
    v.rises.push({ obj: body, t: 0, x, y, z, dir: mf.world.mapEvents.serpent?.dir ?? 0 });
  }
  emit(h, {
    tex: FX.dust,
    n: 14,
    x,
    y: y + 0.5,
    z,
    size: [1.4, 2.6],
    grow: 1.8,
    life: [1.0, 1.6],
    speed: [3, 7],
    up: [2, 6],
    gravity: 3,
    jitter: 1,
    color: SAND,
    opacity: 0.85,
  });
  emit(h, {
    tex: FX.pebbles,
    n: 16,
    x,
    y: y + 0.6,
    z,
    size: [0.3, 0.6],
    life: [0.8, 1.2],
    speed: [4, 9],
    up: [5, 9],
    gravity: 14,
    jitter: 0.8,
    color: 0xd8b07a,
  });
  decal(h, rumbleTex, x, y + 0.06, z, r + 1.2, 0.8, { grow: 0.9, additive: true, opacity: 0.9 });
  h.shake = Math.max(h.shake, 0.6);
}
