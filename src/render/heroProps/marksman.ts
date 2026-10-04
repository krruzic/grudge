import * as THREE from "three";
import { model, RED, CREAM, BEAK, BLACK, RED_DARK, normalized, UP } from "../kits/shared";
import { prop } from "../props";
import type { Entity } from "../../sim/types";
import { FX, WREN } from "../fx/atlas";
import { shockwave } from "../fx/shockwave";
import { emit } from "../fx/parts";
import type { HeroPropViews } from "./heroPropViews";
import { costumeOfPlayer } from "../costumes";

export function pipFallback(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(model(new THREE.SphereGeometry(0.16, 8, 6)), RED);
  body.scale.set(0.9, 0.85, 1.35);
  const breast = new THREE.Mesh(model(new THREE.SphereGeometry(0.1, 6, 5)), CREAM);
  breast.position.set(0, -0.05, 0.1);
  const head = new THREE.Mesh(model(new THREE.SphereGeometry(0.1, 8, 6)), RED);
  head.position.set(0, 0.09, 0.19);
  const beak = new THREE.Mesh(model(new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(Math.PI / 2)), BEAK);
  beak.position.set(0, 0.07, 0.31);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(model(new THREE.SphereGeometry(0.018, 4, 3)), BLACK);
    eye.position.set(0.065 * s, 0.12, 0.25);
    g.add(eye);
  }
  const tail = new THREE.Mesh(model(new THREE.BoxGeometry(0.14, 0.02, 0.2)), RED_DARK);
  tail.position.set(0, 0.02, -0.24);
  tail.rotation.x = -0.3;
  g.add(body, breast, head, beak, tail);
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = s < 0 ? "wing_L" : "wing_R";
    pivot.position.set(0.1 * s, 0.05, 0);
    const wing = new THREE.Mesh(model(new THREE.BoxGeometry(0.34, 0.02, 0.2)), RED_DARK);
    wing.position.x = 0.17 * s;
    pivot.add(wing);
    g.add(pivot);
  }
  return g;
}
export function pipModel(costume: string): { obj: THREE.Group; wings: THREE.Object3D[]; base: number[] } {
  const p = prop("pip", undefined, { hero: "marksman", costume });
  const obj = p ? normalized(p, 1.7) : pipFallback();
  if (!p) obj.scale.setScalar(2.7);
  const wings: THREE.Object3D[] = [];
  obj.traverse((o) => {
    if (o.name.startsWith("wing_L") || o.name.startsWith("wing_R")) wings.push(o);
  });
  return { obj, wings, base: wings.map((w) => w.rotation.z) };
}
export function syncVantage(views: HeroPropViews, e: Entity, alpha: number): void {
  const w = views.world;
  const h = e.hero!;
  const hk = w.heroDef(h.type).hooks;
  const on = w.time - (h.stillAt ?? -99) >= (hk.vantageStill ?? 1) && !h.dead;
  const was = views.vantage.get(e.id) ?? false;
  views.vantage.set(e.id, on);
  if (!views.fx || !on) return;
  const p = views.viewPos(e, alpha);
  if (!was) {
    shockwave(views.fx, FX.shock, p.x, p.y + 0.15, p.z, UP, 0.3, 1.4, 0.35, 0xffe08a, 0.7);
    emit(views.fx, {
      tex: FX.twinkle,
      n: 5,
      x: p.x,
      y: p.y + 1.2 * views.heroScale,
      z: p.z,
      color: 0xfff0a0,
      size: [0.25, 0.4],
      life: [0.4, 0.6],
      speed: [0.5, 1.5],
      up: [0.5, 1.2],
      additive: true,
      jitter: 0.6,
    });
  }
  if (Math.random() < 0.08)
    emit(views.fx, {
      tex: FX.twinkle,
      n: 1,
      x: p.x,
      y: p.y + (1.1 + Math.random() * 0.7) * views.heroScale,
      z: p.z,
      color: 0xffe890,
      size: [0.18, 0.3],
      life: [0.35, 0.5],
      speed: [0, 0.3],
      up: [0.3, 0.6],
      additive: true,
      jitter: 0.7,
    });
}
export function syncPip(views: HeroPropViews, e: Entity, alpha: number, dt: number, puff: boolean): void {
  const w = views.world;
  const ps = e.hero!.pip!;
  const costume = costumeOfPlayer(e.hero!.player);
  let v = views.pips.get(e.id);
  if (v && v.costume !== costume) {
    views.root.remove(v.obj);
    v = undefined;
  }
  if (!v) {
    const m = pipModel(costume);
    v = { ...m, prev: new THREE.Vector3(ps.x, ps.y, ps.z), latchT: 0, costume };
    views.root.add(m.obj);
    views.pips.set(e.id, v);
  }
  const pos = new THREE.Vector3(
    ps.px + (ps.x - ps.px) * alpha,
    ps.py + (ps.y - ps.py) * alpha,
    ps.pz + (ps.z - ps.pz) * alpha,
  );
  let flap = 18;
  let yaw: number | null = null;
  let pitch = 0;
  if (ps.phase === "on") {
    const tgt = w.getAny(ps.target);
    if (tgt) {
      const tp = views.viewPos(tgt, alpha);
      const head = tgt.hero
        ? 3.05 * (views.heroScale / 1.5)
        : tgt.neutral
          ? 4.4
          : tgt.unit?.type === "heavy"
            ? 2.4
            : 1.95;
      v.latchT += dt;
      const a = views.t * 2.6 + e.id;
      const r = 0.55;
      const peckCycle = (views.t * 1.8) % 1;
      const peck = peckCycle < 0.18 ? Math.sin((peckCycle / 0.18) * Math.PI) : 0;
      pos.set(
        tp.x + Math.cos(a) * r * (1 - peck * 0.7),
        tp.y + head + 0.25 + Math.sin(views.t * 7) * 0.06 - peck * 0.3,
        tp.z + Math.sin(a) * r * (1 - peck * 0.7),
      );
      yaw = peck > 0.05 ? Math.atan2(tp.x - pos.x, tp.z - pos.z) : Math.atan2(-Math.sin(a), Math.cos(a));
      pitch = peck * 0.9;
      flap = 14;
      if (peck > 0.9 && views.fx && Math.random() < 0.5)
        emit(views.fx, {
          tex: WREN.feather,
          n: 1,
          x: tp.x,
          y: tp.y + head,
          z: tp.z,
          size: [0.16, 0.24],
          life: [0.6, 0.9],
          speed: [0.5, 1.2],
          up: [0.2, 0.8],
          gravity: 1.5,
          drag: 1,
          spin: 5,
        });
    }
  } else {
    v.latchT = 0;
    if (ps.phase === "back") {
      const sh = views.viewPos(e, alpha);
      const d = Math.hypot(sh.x - pos.x, sh.z - pos.z);
      if (d < 2) pos.y = Math.max(pos.y, sh.y + 2.1 * (views.heroScale / 1.5));
    }
  }
  const vel = pos.clone().sub(v.prev);
  if (yaw === null && vel.lengthSq() > 1e-5) {
    yaw = Math.atan2(vel.x, vel.z);
    pitch = -Math.atan2(vel.y, Math.hypot(vel.x, vel.z)) * 0.6;
  }
  v.prev.copy(pos);
  v.obj.position.copy(pos);
  if (yaw !== null) {
    let d = yaw - v.obj.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    v.obj.rotation.y += d * Math.min(1, dt * 14);
  }
  v.obj.rotation.x = pitch;
  v.wings.forEach((wg, i) => {
    const s = wg.name.startsWith("wing_L") ? 1 : -1;
    wg.rotation.z = v!.base[i] + s * Math.sin(views.t * flap) * 0.7;
  });
  if (views.fx && puff && ps.phase !== "on" && vel.lengthSq() > 1e-4)
    emit(views.fx, {
      tex: FX.twinkle,
      n: 1,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      color: 0xff8060,
      size: [0.12, 0.2],
      life: [0.25, 0.35],
      speed: [0, 0.2],
      additive: true,
    });
}
