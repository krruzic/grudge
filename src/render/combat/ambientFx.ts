// Continuous per-frame effects that entity and relic views request through CombatFx while a state lasts:
// status auras (frenzy flames, empower sparks, bleed drips, haste steam, Remnil's grave ring), charge-up sparks
// and the charged-attack release, relic smoke, regen pluses, build/spawn puffs.
import * as THREE from "three";
import { FX, RAIDER, SUMMONER } from "../fx/atlas";
import { emit, shockwave } from "../fx/parts";
import type { CombatFx } from "./combatFx";
import { starTex, puffTex, glowTex, plusTex } from "./textures";

export function aura(
  cfx: CombatFx,
  kind: "flame" | "spark" | "drip" | "steam" | "grave",
  x: number,
  y: number,
  z: number,
  r = 1,
): void {
  if (kind === "grave") {
    const a = Math.random() * Math.PI * 2;
    const d = r * (0.7 + Math.random() * 0.4);
    const gx = x + Math.cos(a) * d;
    const gz = z + Math.sin(a) * d;
    const gy = cfx.world ? cfx.world.groundY(gx, gz) : y;
    emit(cfx, {
      tex: Math.random() < 0.55 ? SUMMONER.ghost : SUMMONER.soulFlame,
      n: 1,
      x: gx,
      y: gy + 0.4,
      z: gz,
      size: [0.6, 0.95],
      grow: 1.2,
      life: [0.9, 1.4],
      speed: [0.1, 0.4],
      up: [1.2, 2.2],
      additive: true,
      color: 0xc890ff,
      opacity: 0.85,
    });
    if (Math.random() < 0.35)
      emit(cfx, {
        tex: SUMMONER.skull,
        n: 1,
        x,
        y: y + 5 + Math.random(),
        z,
        size: [0.5, 0.7],
        life: [0.6, 0.8],
        speed: [0, 0.2],
        up: [0.6, 1],
        opacity: 0.7,
        jitter: r * 0.5,
      });
    return;
  }
  if (kind === "flame")
    cfx.burst(
      x + (Math.random() - 0.5) * 0.8,
      y + 0.4 + Math.random() * 1.2,
      z + (Math.random() - 0.5) * 0.8,
      starTex,
      0xff7a20,
      1,
      0.45,
      0.45,
      0.2,
      true,
      1.6,
    );
  else if (kind === "spark")
    cfx.burst(
      x + (Math.random() - 0.5) * 0.9,
      y + 1 + Math.random() * 1.2,
      z + (Math.random() - 0.5) * 0.9,
      starTex,
      0xfff0a0,
      1,
      0.35,
      0.35,
      0.3,
      true,
      0.6,
    );
  else if (kind === "steam") cfx.burst(x, y, z, puffTex, 0xe8e8f0, 1, 0.8, 0.8, 0.3, false, 1.2);
  else {
    const s = cfx.sprite(glowTex, 0xa01010, false, 1);
    const sx = x + (Math.random() - 0.5) * 0.6;
    const sz = z + (Math.random() - 0.5) * 0.6;
    let vy = 0;
    s.position.set(sx, y + 1.2 + Math.random() * 0.6, sz);
    s.scale.setScalar(0.22);
    cfx.items.push({
      obj: s,
      t: 0,
      dur: 0.5,
      tick: (k, dt) => {
        vy -= 12 * dt;
        s.position.y += vy * dt;
        s.material.opacity = 1 - k * 0.6;
      },
    });
  }
}
export function smoke(cfx: CombatFx, x: number, y: number, z: number, heat: number): void {
  const s = cfx.sprite(puffTex, heat > 0.7 ? 0x5a4a44 : 0x6a6660, false, 0.7);
  s.position.set(x + (Math.random() - 0.5) * 0.2, y, z + (Math.random() - 0.5) * 0.2);
  const sz = 0.4 + heat * 0.5;
  const drift = (Math.random() - 0.5) * 0.8;
  cfx.items.push({
    obj: s,
    t: 0,
    dur: 0.9 + heat * 0.5,
    tick: (k, dt) => {
      s.position.y += dt * (1.2 + heat);
      s.position.x += dt * drift;
      s.scale.setScalar(sz * (1 + k * 2));
      s.material.opacity = 0.65 * (1 - k);
    },
  });
  if (heat > 0.5 && Math.random() < heat * 0.5) {
    const f = cfx.sprite(starTex, 0xff9030, true, 0.9);
    f.position.set(x, y, z);
    cfx.items.push({
      obj: f,
      t: 0,
      dur: 0.15,
      tick: (k) => {
        f.scale.setScalar(0.5 + k * 0.4);
        f.material.opacity = 0.9 * (1 - k);
      },
    });
  }
}
export function chargeSparks(
  cfx: CombatFx,
  x: number,
  y: number,
  z: number,
  k: number,
  color: THREE.ColorRepresentation,
  full: boolean,
): void {
  if (Math.random() < 0.7) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.5 - k * 0.4;
    const p = cfx.particles.spawn(FX.twinkle, color, true);
    if (p) {
      p.x = x + Math.cos(a) * r;
      p.z = z + Math.sin(a) * r;
      p.y = y + 0.3 + Math.random() * 1.6;
      p.life = 0.3;
      p.vx = (x - p.x) / 0.3;
      p.vz = (z - p.z) / 0.3;
      p.vy = (y + 1.3 - p.y) / 0.3;
      p.size0 = 0.35 + k * 0.3;
    }
  }
  if (full && Math.random() < 0.25)
    emit(cfx, {
      tex: FX.zap,
      n: 1,
      x,
      y: y + 1.3,
      z,
      color,
      size: [0.9, 1.3],
      life: [0.08, 0.14],
      speed: [0, 0],
      additive: true,
      jitter: 0.9,
    });
}
export function chargeRelease(
  cfx: CombatFx,
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirZ: number,
  power: number,
  color: THREE.ColorRepresentation,
): void {
  const k = Math.min(1, (power - 1) / 0.8);
  emit(cfx, {
    tex: FX.burst,
    n: 1,
    x: x + dirX * 1.2,
    y: y + 1.2,
    z: z + dirZ * 1.2,
    color,
    size: [2 + k * 2, 2 + k * 2],
    grow: 1.4,
    life: [0.15, 0.15],
    speed: [0, 0],
    additive: true,
    order: 7,
  });
  shockwave(
    cfx,
    FX.shock,
    x + dirX * 1.2,
    y + 1.1,
    z + dirZ * 1.2,
    new THREE.Vector3(dirX, 0, dirZ),
    0.3,
    1.5 + k * 2,
    0.25,
    color,
  );
  shockwave(cfx, FX.shock, x, y + 0.15, z, new THREE.Vector3(0, 1, 0), 0.4, 1.8 + k * 1.8, 0.35, 0xfff0c0, 0.8);
  emit(cfx, {
    tex: FX.dust,
    n: 4 + Math.round(k * 4),
    x,
    y: y + 0.3,
    z,
    size: [0.9, 1.3],
    grow: 1.8,
    life: [0.4, 0.7],
    speed: [2, 4],
    flatSpread: true,
    drag: 3,
    opacity: 0.85,
  });
  cfx.shake = Math.max(cfx.shake, 0.2 + k * 0.3);
}
export function bloodMote(cfx: CombatFx, x: number, y: number, z: number): void {
  emit(cfx, {
    tex: RAIDER.drop,
    n: 1,
    x: x + (Math.random() - 0.5) * 1.2,
    y: y + 0.6 + Math.random() * 1.4,
    z: z + (Math.random() - 0.5) * 1.2,
    color: 0xff4040,
    size: [0.22, 0.32],
    life: [0.5, 0.8],
    speed: [0, 0.2],
    up: [0.6, 1.2],
    opacity: 0.9,
  });
}
export function regen(cfx: CombatFx, x: number, y: number, z: number): void {
  emit(cfx, {
    tex: plusTex,
    n: 1,
    x: x + (Math.random() - 0.5) * 1.2,
    y: y + 0.8 + Math.random() * 1.2,
    z: z + (Math.random() - 0.5) * 1.2,
    color: 0x90ff90,
    size: [0.32, 0.32],
    grow: 0.7,
    life: [0.9, 0.9],
    speed: [0, 0],
    up: [1.4, 1.4],
    opacity: 0.9,
  });
}
export function buildFx(cfx: CombatFx, x: number, y: number, z: number, team: number): void {
  cfx.burst(x, y + 0.4, z, puffTex, 0xd8c8a8, 10, 1.4, 0.8, 2.5, false, 0.6);
  cfx.flash(x, y + 1.5, z, glowTex, cfx.teamColors[team], 4, 0.4);
}

export function spawnFx(cfx: CombatFx, x: number, y: number, z: number, team: number): void {
  cfx.flash(x, y + 0.8, z, glowTex, cfx.teamColors[team], 2.2, 0.3);
}
