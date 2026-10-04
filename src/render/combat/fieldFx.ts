// Effects for things abilities and the shop place in the world: war banners (synced each frame from
// TeamState.banner), the shop cannon barrage (warning ring, incoming ball, impact) and structure repair (flying
// planks and hammers).
import * as THREE from "three";
import { dyeColor } from "../heroModels";
import type { CombatFx } from "./combatFx";
import { ballGeo, ballMat, hammerMesh, plankGeo, shadowGeo, woodMat } from "./assets";
import type { World } from "../../sim/world";
import { targetTex, fillTex, puffTex, starTex, scorchTex, glowTex, plusTex, gearTex } from "./textures";
import type { SimEvent } from "../../sim/types";

export function makeBanner(cfx: CombatFx, team: number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x6a4424, flatShading: true });
  const gold = new THREE.MeshLambertMaterial({ color: 0xc8a040, flatShading: true });
  const cloth = new THREE.MeshLambertMaterial({
    color: dyeColor(cfx.teamColors[team]),
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const trim = new THREE.MeshLambertMaterial({ color: 0xd8c890, side: THREE.DoubleSide, flatShading: true });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6), wood);
  pole.position.y = 1.7;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 5), wood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 3.05;
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), gold);
  tip.position.y = 3.5;
  const shape = new THREE.Shape();
  shape.moveTo(-0.6, 0);
  shape.lineTo(0.6, 0);
  shape.lineTo(0.6, -1.5);
  shape.lineTo(0, -1.15);
  shape.lineTo(-0.6, -1.5);
  shape.closePath();
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), cloth);
  flag.position.y = 3.0;
  flag.name = "flag";
  const band = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.12), trim);
  band.position.set(0, 2.88, 0.01);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 0.2, 7),
    new THREE.MeshLambertMaterial({ color: 0x5a5048, flatShading: true }),
  );
  base.position.y = 0.1;
  g.add(pole, bar, tip, flag, band, base);
  g.visible = false;
  cfx.root.add(g);
  return g;
}
export function syncBanners(cfx: CombatFx, world: World, time: number): void {
  world.teams.forEach((ts, team) => {
    const b = ts.banner;
    const g = (cfx.banners[team] ??= makeBanner(cfx, team));
    const on = !!b && world.time < b.until;
    g.visible = on;
    if (!on) return;
    const y = world.groundY(b!.x, b!.z);
    const left = b!.until - world.time;
    const drop = left < 1 ? (1 - left) * 1.2 : 0;
    g.position.set(b!.x, y - drop, b!.z);
    g.rotation.y = team === 0 ? 0.4 : -0.4;
    const flag = g.getObjectByName("flag")!;
    flag.rotation.y = Math.sin(time * 2.2 + team) * 0.25;
    flag.rotation.x = Math.sin(time * 3.1 + team) * 0.05;
  });
}
export function cannonWarn(cfx: CombatFx, x: number, y: number, z: number, radius: number, seconds: number): void {
  const decal = (tex: THREE.Texture, lift: number, opacity: number, additive: boolean) => {
    const m = cfx.decalInst(tex, opacity, additive);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + lift, z);
    return m;
  };
  const ring = decal(targetTex, 0.12, 0.95, false);
  const fill = decal(fillTex, 0.1, 0.35, true);
  cfx.items.push({
    obj: ring,
    t: 0,
    dur: seconds,
    tick: (k) => {
      const intro = Math.min(1, (k * seconds) / 0.18);
      ring.scale.setScalar(radius * (1.6 - 0.6 * intro));
      ring.rotation.z = k * seconds * 1.4;
      const pulse = 0.5 + 0.5 * Math.sin(k * seconds * (6 + k * 18));
      ring.opacity = 0.65 + 0.35 * pulse;
    },
  });
  cfx.items.push({
    obj: fill,
    t: 0,
    dur: seconds,
    tick: (k) => {
      fill.scale.setScalar(Math.max(0.01, radius * k));
      fill.opacity = 0.25 + 0.35 * k;
    },
  });
  const shadowMat = cfx.pooled(
    "shadow",
    () => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false }),
  );
  shadowMat.opacity = 0;
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(x, y + 0.14, z);
  cfx.root.add(shadow);
  const fly = Math.min(1.3, seconds * 0.6);
  cfx.items.push({
    obj: shadow,
    t: 0,
    dur: seconds,
    tick: (k) => {
      const f = Math.max(0, (k * seconds - (seconds - fly)) / fly);
      (shadow.material as THREE.MeshBasicMaterial).opacity = f * 0.55;
      shadow.scale.setScalar(0.4 + f * 0.8);
    },
  });
  const side = Math.random() < 0.5 ? -1 : 1;
  const sx = x + side * 26;
  const sz = z - 14 + Math.random() * 6;
  cfx.after(seconds - fly, () => {
    const ball = new THREE.Mesh(ballGeo, ballMat);
    cfx.root.add(ball);
    let puffT = 0;
    cfx.items.push({
      obj: ball,
      t: 0,
      dur: fly,
      tick: (k, dt) => {
        ball.position.set(
          sx + (x - sx) * k,
          y + 0.5 + 22 * (1 - k) * (0.35 + 0.65 * (1 - k)) + 3 * Math.sin(k * Math.PI) * (1 - k),
          sz + (z - sz) * k,
        );
        ball.rotation.x += dt * 9;
        ball.rotation.z += dt * 5;
        puffT -= dt;
        if (puffT <= 0) {
          puffT = 0.035;
          const p = cfx.sprite(puffTex, 0x4a4440, false, 0.7);
          p.position.copy(ball.position);
          const sz0 = 0.6 + Math.random() * 0.3;
          cfx.items.push({
            obj: p,
            t: 0,
            dur: 0.7,
            tick: (q) => {
              p.scale.setScalar(sz0 * (1 + q * 1.5));
              p.material.opacity = 0.6 * (1 - q);
            },
          });
        }
      },
    });
  });
}

export function cannonHit(cfx: CombatFx, x: number, y: number, z: number, radius: number): void {
  cfx.flash(x, y + 1.2, z, starTex, 0xfff0b0, radius * 3.2, 0.35);
  cfx.flash(x, y + 1, z, glowTex, 0xff7a20, radius * 2.6, 0.7);
  cfx.burst(x, y + 0.8, z, puffTex, 0xff8a30, 10, 2.2, 0.55, radius * 0.8, false, 2.2);
  cfx.burst(x, y + 1.2, z, puffTex, 0xffd060, 6, 1.6, 0.35, radius * 0.5, true, 2.8);
  cfx.burst(x, y + 0.6, z, starTex, 0xff8a20, 16, 1.4, 0.5, radius * 1.4, true, 2.5);
  cfx.burst(x, y + 0.8, z, puffTex, 0x3a3430, 18, 2.2, 1.8, radius * 0.9, false, 1.8);
  cfx.burst(x, y + 0.3, z, puffTex, 0xa89478, 12, 1.6, 1.1, radius * 1.5, false, 0.4);
  cfx.debris(x, y, z, [0x6a5a44, 0x4a3e30, 0x807060, 0x3a3a3a], 14, 0.28, 7);
  cfx.sparks(x, y + 0.5, z, 1, 0, 0xffc060, 6, 12);
  cfx.sparks(x, y + 0.5, z, -1, 0, 0xffc060, 6, 12);
  cfx.ring(x, y, z, new THREE.Color(0xffc080), radius * 1.3, 0.4);
  const scorch = cfx.decalInst(scorchTex, 0.9, false, -1);
  scorch.rotation.x = -Math.PI / 2;
  scorch.rotation.z = Math.random() * Math.PI * 2;
  scorch.position.set(x, y + 0.08, z);
  scorch.scale.setScalar(radius * 0.9);
  cfx.items.push({
    obj: scorch,
    t: 0,
    dur: 9,
    tick: (k) => {
      scorch.opacity = 0.9 * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    },
  });
  cfx.shake = Math.max(cfx.shake, 0.7);
}
export function repair(cfx: CombatFx, ev: Extract<SimEvent, { type: "repair" }>): void {
  const gear = cfx.decalInst(gearTex);
  gear.rotation.x = -Math.PI / 2;
  gear.position.set(ev.x, ev.y + 0.12, ev.z);
  cfx.items.push({
    obj: gear,
    t: 0,
    dur: 1.1,
    tick: (k) => {
      gear.scale.setScalar(ev.radius * (0.35 + 0.65 * Math.min(1, k * 4)));
      gear.rotation.z = k * 2.5;
      gear.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    },
  });
  const slam = hammerMesh();
  slam.position.set(ev.x + 0.6, ev.y, ev.z);
  slam.scale.setScalar(1.3);
  cfx.root.add(slam);
  cfx.items.push({
    obj: slam,
    t: 0,
    dur: 0.45,
    tick: (k) => {
      slam.rotation.z = k < 0.4 ? 1.4 * (1 - k / 0.4) : 0;
      slam.visible = k < 0.9;
    },
  });
  cfx.after(0.18, () => {
    cfx.sparks(ev.x + 1.2, ev.y + 0.3, ev.z, 1, 0, 0xffd070, 6, 7);
    cfx.sparks(ev.x + 1.2, ev.y + 0.3, ev.z, -1, 0, 0xffd070, 6, 7);
    cfx.burst(ev.x + 1.2, ev.y + 0.2, ev.z, puffTex, 0xc8b898, 6, 0.9, 0.5, 1.5, false, 0.4);
    cfx.shake = Math.max(cfx.shake, 0.18);
  });
  ev.fixed.forEach((f, n) => {
    for (let p = 0; p < 3; p++) {
      const plank = new THREE.Mesh(plankGeo, woodMat);
      const sx = ev.x;
      const sz = ev.z;
      const ty = f.y + f.h * (0.35 + p * 0.22);
      const spin = (Math.random() - 0.5) * 8;
      const off = (p - 1) * 0.5;
      cfx.root.add(plank);
      cfx.items.push({
        obj: plank,
        t: 0,
        dur: 1.6 + n * 0.1,
        tick: (k) => {
          const fly = Math.min(1, k / 0.35);
          const x = sx + (f.x + off - sx) * fly;
          const z = sz + (f.z + 1.1 - sz) * fly;
          const y = ev.y + 1 + (ty - ev.y - 1) * fly + Math.sin(fly * Math.PI) * 2;
          plank.position.set(x, y, z);
          plank.rotation.set(fly < 1 ? k * spin : 0, fly < 1 ? k * spin * 0.7 : 0, fly < 1 ? 0 : (p - 1) * 0.25);
          plank.visible = k < 0.92;
        },
      });
    }
    const ham = hammerMesh();
    ham.scale.setScalar(1.2);
    cfx.root.add(ham);
    let strikes = 0;
    cfx.items.push({
      obj: ham,
      t: 0,
      dur: 1.5 + n * 0.1,
      tick: (k) => {
        const u = Math.max(0, (k * 1.5 - 0.5) / 0.9);
        ham.visible = k * 1.5 > 0.45 && k < 0.95;
        const beat = (u * 3) % 1;
        ham.position.set(f.x + 0.9, f.y + f.h * 0.55, f.z + 1.3);
        ham.rotation.set(0, 0, 0.3 + Math.max(0, 1 - beat * 2.5) * -1.3 + beat * 1.3);
        const hitN = Math.floor(u * 3 + 0.4);
        if (u > 0 && hitN > strikes && strikes < 3) {
          strikes = hitN;
          cfx.sparks(f.x + 0.3, f.y + f.h * 0.55 + 0.9, f.z + 1.3, -1, 0.5, 0xffe080, 5, 6);
        }
      },
    });
    cfx.after(0.9 + n * 0.1, () => {
      if (f.amount > 0) cfx.number(f.x, f.y + f.h - 0.6, f.z, f.amount, "#7dff7a", true);
      cfx.burst(f.x, f.y + f.h * 0.6, f.z, plusTex, 0xffffff, 6, 0.6, 0.9, 1.6, false, 1.4);
    });
  });
}
