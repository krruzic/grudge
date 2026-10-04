// Hero morph (champion transformations): a spiral of team-coloured twinkles rising around the hero while the
// morph channels, and a burst when it completes.
import * as THREE from "three";
import { FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import type { MapFx } from "./mapFx";

export function syncMorphs(mf: MapFx, dt: number): void {
  const fx = mf.fx;
  for (let i = mf.morphs.length - 1; i >= 0; i--) {
    const m = mf.morphs[i];
    if (mf.now > m.until + 0.05) {
      mf.morphs.splice(i, 1);
      continue;
    }
    const e = mf.world.getAny(m.id);
    if (!fx || !e) continue;
    m.acc += dt;
    if (m.acc < 0.03) continue;
    m.acc = 0;
    const k = (mf.now - m.start) / Math.max(0.01, m.until - m.start);
    const col = mf.teamColors[m.team] ?? new THREE.Color(0xffd040);
    const p = e.transform;
    for (let j = 0; j < 2; j++) {
      const a = mf.now * 9 + j * Math.PI;
      const r = 1.3 - k * 0.6;
      const y = p.y + 0.2 + k * 2.4 + j * 0.3;
      emit(fx, {
        tex: FX.twinkle,
        n: 1,
        x: p.pos.x + Math.cos(a) * r,
        y,
        z: p.pos.z + Math.sin(a) * r,
        size: [0.35, 0.55],
        life: [0.3, 0.5],
        speed: [0.2, 0.6],
        up: [1, 2],
        additive: true,
        color: 0xffe080,
      });
      emit(fx, {
        tex: FX.swoosh,
        n: 1,
        x: p.pos.x + Math.cos(a + 1.6) * r,
        y: y - 0.3,
        z: p.pos.z + Math.sin(a + 1.6) * r,
        size: [0.6, 0.9],
        life: [0.25, 0.4],
        speed: [0.5, 1],
        up: [1.5, 2.5],
        additive: true,
        color: col,
      });
    }
    if (Math.random() < 0.4)
      emit(fx, {
        tex: FX.dust,
        n: 1,
        x: p.pos.x,
        y: p.y + 0.1,
        z: p.pos.z,
        size: [1.0, 1.6],
        grow: 1.5,
        life: [0.4, 0.7],
        speed: [1, 2],
        flatSpread: true,
        opacity: 0.5,
        jitter: 1.2,
      });
  }
}
export function onMorph(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const m = ev as unknown as {
    stage: string;
    id: number;
    team: number;
    x: number;
    y: number;
    z: number;
    seconds: number;
  };
  if (m.stage === "start") mf.morphs.push({ id: m.id, start: mf.now, until: mf.now + m.seconds, team: m.team, acc: 0 });
  else if (mf.fx) {
    const col = mf.teamColors[m.team] ?? new THREE.Color(0xffd040);
    emit(mf.fx, {
      tex: FX.burst,
      n: 1,
      x: m.x,
      y: m.y + 1.2,
      z: m.z,
      size: [4.5, 4.5],
      grow: 1.6,
      life: [0.35, 0.35],
      speed: [0, 0],
      additive: true,
      color: 0xfff0c0,
    });
    emit(mf.fx, {
      tex: FX.streak,
      n: 10,
      x: m.x,
      y: m.y + 0.4,
      z: m.z,
      size: [0.5, 0.9],
      life: [0.5, 0.8],
      speed: [6, 10],
      dir: { x: 0, y: 1, z: 0 },
      cone: 0.25,
      additive: true,
      color: 0xffe080,
      jitter: 0.8,
    });
    emit(mf.fx, {
      tex: FX.twinkle,
      n: 18,
      x: m.x,
      y: m.y + 1.2,
      z: m.z,
      size: [0.3, 0.6],
      life: [0.6, 1.1],
      speed: [3, 6],
      up: [1, 3],
      additive: true,
      color: col,
      gravity: 4,
    });
    emit(mf.fx, {
      tex: FX.smoke,
      n: 8,
      x: m.x,
      y: m.y + 0.4,
      z: m.z,
      size: [1.4, 2.2],
      grow: 1.6,
      life: [0.7, 1.1],
      speed: [2, 3.5],
      flatSpread: true,
      opacity: 0.7,
      color: 0xf0e8d8,
    });
    mf.fx.shake = Math.max(mf.fx.shake, 0.25);
  }
}
