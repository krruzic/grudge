// Avalanche horns (sim/mapEvents/avalanche.ts): stone pedestals with a horn and team flag; the capture ring fills
// with the capturing team's colour, and a blown horn sends out shock rings and a snow puff.
import * as THREE from "three";
import { propParts } from "../props";
import type { MapFx } from "./mapFx";
import { texture, cobbleUrl, woodUrl } from "./textures";
import { FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import { PUFF } from "./avalanche";

export function buildHorns(mf: MapFx): void {
  const w = mf.world;
  const hs = w.mapEvents.horns;
  if (!hs.length) return;
  const stone = new THREE.MeshLambertMaterial({ map: texture(cobbleUrl, 1), color: 0xc8c4bc });
  const bone = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
  const brass = new THREE.MeshLambertMaterial({ color: 0xd8a040 });
  const wood = new THREE.MeshLambertMaterial({ map: texture(woodUrl, 1), color: 0xb89070 });
  const snow = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 24; k++) {
    const t = k / 24;
    const a = t * Math.PI * 1.15;
    pts.push(
      new THREE.Vector3(
        Math.sin(a) * 0.9 * (1 - t * 0.2),
        0.3 + t * 0.5 + Math.sin(a) * 0.15,
        Math.cos(a) * 0.55 - 0.55,
      ),
    );
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const hornGeo = new THREE.TubeGeometry(curve, 40, 0.09, 8, false);
  const pos = hornGeo.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const k = Math.floor(i / 9) / 40;
    const p = curve.getPoint(k);
    const r = 0.06 + 0.3 * Math.pow(k, 3);
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
      .sub(p)
      .multiplyScalar(r / 0.09)
      .add(p);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  hornGeo.computeVertexNormals();
  const hp = propParts("event_horn");
  hs.forEach((h) => {
    const g = new THREE.Group();
    g.position.set(h.x, w.groundY(h.x, h.z), h.z);
    g.rotation.y = Math.atan2(w.terrain.width / 2 - h.x, w.terrain.depth / 2 - h.z);
    g.scale.setScalar(1.6);
    let horn: THREE.Object3D;
    if (hp) {
      horn = new THREE.Mesh(hp.geo, hp.mat);
      horn.scale.setScalar(1 / 1.6);
      horn.castShadow = true;
      g.add(horn);
    } else {
      [
        [1.1, 0.5, 0],
        [0.8, 0.4, 0.45],
        [0.55, 0.35, 0.8],
      ].forEach(([r, hh, y], k) => {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
        m.scale.set(1, hh / r, 1);
        m.position.y = y + hh * 0.6;
        m.rotation.y = k * 0.7;
        g.add(m);
      });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), snow);
      cap.scale.y = 0.25;
      cap.position.y = 0.9;
      g.add(cap);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), wood);
      post.position.set(0, 1.6, 0);
      g.add(post);
      horn = new THREE.Group();
      horn.position.set(0, 1.85, 0);
      const hm = new THREE.Mesh(hornGeo, bone);
      hm.position.x = -0.45;
      horn.add(hm);
      for (const t of [0.35, 0.65]) {
        const p = curve.getPoint(t);
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.08 + 0.3 * Math.pow(t, 3) + 0.01, 0.025, 4, 10), brass);
        band.position.set(p.x - 0.45, p.y, p.z);
        band.lookAt(new THREE.Vector3().copy(curve.getTangent(t)).add(band.position));
        horn.add(band);
      }
      g.add(horn);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 5), wood);
    pole.position.set(hp ? 0.62 : 0.55, hp ? 1.1 : 1.6, hp ? -0.42 : 0.3);
    g.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x8a8070, side: THREE.DoubleSide }),
    );
    flag.position.set(pole.position.x + 0.3, pole.position.y + 0.45, pole.position.z);
    g.add(flag);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd040,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.62, 40, 1, 0, 0.001), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    ring.renderOrder = 5;
    g.add(ring);
    mf.root.add(g);
    mf.hornObjs.push({ ring, mat, flag, horn, k: -1 });
  });
}
export function syncHorns(mf: MapFx, time: number): void {
  const w = mf.world;
  w.mapEvents.horns.forEach((h, i) => {
    const o = mf.hornObjs[i];
    if (!o) return;
    const ready = w.time >= h.readyAt;
    const k = ready
      ? h.progress > 0
        ? h.progress / w.mapEvents.hornCapture
        : 1
      : 1 - (h.readyAt - w.time) / w.mapEvents.hornCooldown;
    const kq = Math.round(Math.max(0.001, Math.min(1, k)) * 120) / 120;
    if (kq !== o.k) {
      o.k = kq;
      o.ring.geometry.dispose();
      o.ring.geometry = new THREE.RingGeometry(1.45, 1.62, 40, 1, Math.PI / 2, Math.max(0.001, kq) * Math.PI * 2);
    }
    const tc = h.team >= 0 ? mf.teamColors[h.team] : undefined;
    o.mat.color.set(ready ? (h.progress > 0 && tc ? tc : new THREE.Color(0xffd040)) : new THREE.Color(0x606878));
    o.mat.opacity = ready ? (h.progress > 0 ? 0.85 : 0.35 + Math.sin(time * 3) * 0.15) : 0.3;
    (o.flag.material as THREE.MeshLambertMaterial).color.copy(tc ?? new THREE.Color(0x8a8070));
    o.flag.rotation.y = Math.sin(time * 3 + i) * 0.3;
    o.horn.rotation.z = ready && h.progress > 0 ? Math.sin(time * 30) * 0.03 : 0;
  });
}
export function onHorn(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const hv = ev as unknown as { x: number; y: number; z: number };
  if (mf.fx) {
    for (let k = 0; k < 3; k++)
      emit(mf.fx, {
        tex: FX.shock,
        n: 1,
        x: hv.x,
        y: hv.y + 2,
        z: hv.z,
        size: [2 + k * 2, 2 + k * 2],
        grow: 3,
        life: [0.6 + k * 0.2, 0.6 + k * 0.2],
        speed: [0, 0],
        opacity: 0.5,
        color: 0xf0f4ff,
      });
    emit(mf.fx, {
      tex: PUFF,
      n: 10,
      x: hv.x,
      y: hv.y + 2,
      z: hv.z,
      size: [1, 1.8],
      grow: 2,
      life: [1, 1.6],
      speed: [2, 5],
      opacity: 0.6,
      color: 0xf4f8ff,
    });
    mf.fx.shake = Math.max(mf.fx.shake, 0.6);
  }
}
