// Mother Kelp's chain-swing indicator: while a local Kelp has her dodge ready next to something she can hook
// (a building, tree, rock or wall cell), a ring marks what the anchor would catch, a trail of dots shows the arc
// and a marker shows where she'd land if she pressed L+X now (sim/hero/wreckwitch.ts chainSwingPlan, toward where
// she's heading). Nothing shows when the dodge would be an ordinary roll.
import * as THREE from "three";
import type { World } from "../sim/world";
import { chainSwingPlan } from "../sim/hero/wreckwitch";

const DOTS = 7;
const TEAL = 0x5ee8c8;

interface Hint {
  pivot: THREE.Mesh;
  land: THREE.Mesh;
  dots: THREE.Mesh[];
}

export class SwingHints {
  readonly root = new THREE.Group();
  private pool: Hint[] = [];

  private make(): Hint {
    const mat = (op: number) =>
      new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: op, depthWrite: false, depthTest: false });
    const pivot = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 28), mat(0.75));
    pivot.rotation.x = -Math.PI / 2;
    pivot.renderOrder = 6;
    const land = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.6, 20), mat(0.85));
    land.rotation.x = -Math.PI / 2;
    land.renderOrder = 6;
    const dots: THREE.Mesh[] = [];
    for (let i = 0; i < DOTS; i++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.13, 8), mat(0.7));
      d.rotation.x = -Math.PI / 2;
      d.renderOrder = 6;
      dots.push(d);
    }
    this.root.add(pivot, land, ...dots);
    const h = { pivot, land, dots };
    this.pool.push(h);
    return h;
  }

  /** `heroIds`: the local humans' heroes (only Mother Kelps show anything). */
  sync(w: World, heroIds: number[], time: number): void {
    const kelps = heroIds
      .map((id) => w.getAny(id))
      .filter((e) => !!e?.alive && e.hero && !e.hero.dead && !!w.heroDef(e.hero.type).hooks.swingReach);
    while (this.pool.length < kelps.length) this.make();
    this.pool.forEach((p, i) => {
      const e = kelps[i];
      const plan =
        e && !e.hero!.action && (e.hero!.cooldowns.dodge ?? 0) <= w.time
          ? chainSwingPlan(w, e, e.hero!.vel.x, e.hero!.vel.z)
          : null;
      p.pivot.visible = p.land.visible = !!plan;
      p.dots.forEach((d) => (d.visible = !!plan));
      if (!plan || !e) return;
      const pulse = 1 + Math.sin(time * 6) * 0.06;
      p.pivot.position.set(plan.pv.x, w.groundY(plan.pv.x, plan.pv.z) + 0.12, plan.pv.z);
      p.pivot.scale.setScalar((plan.pv.r + 0.45) * pulse);
      p.land.position.set(plan.x, w.groundY(plan.x, plan.z) + 0.12, plan.z);
      p.land.scale.setScalar(pulse);
      // The arc she'd swing along, from where she stands to the landing.
      const sweep = (plan.deg * Math.PI) / 180;
      p.dots.forEach((d, k) => {
        const f = (k + 1) / (DOTS + 1);
        const ang = plan.base + plan.sign * sweep * f;
        const x = plan.pv.x + Math.cos(ang) * plan.rr;
        const z = plan.pv.z + Math.sin(ang) * plan.rr;
        d.position.set(x, w.groundY(x, z) + 0.12, z);
      });
    });
  }
}
