// Mother Kelp's chain-swing aim: while a local Kelp HOLDS dodge next to something she can hook (a tap is a plain
// roll), small rings mark every pivot in reach, a bright ring the one her stick picked, a trail of dots the arc and
// a marker where she'll land on release (sim/hero/wreckwitch.ts chainSwingPlan / swingPivots).
import * as THREE from "three";
import type { World } from "../sim/world";
import { chainSwingPlan, swingPivots } from "../sim/hero/wreckwitch";

/** One local Kelp holding dodge: the pivot picked and the swing direction (input/commands.ts ui.swing). */
export interface SwingAim {
  heroId: number;
  at: { x: number; z: number };
  dirX: number;
  dirZ: number;
}

const DOTS = 7;
const TEAL = 0x5ee8c8;

interface Hint {
  pivot: THREE.Mesh;
  land: THREE.Mesh;
  dots: THREE.Mesh[];
  others: THREE.Mesh[];
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
    const others: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const o = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24), mat(0.35));
      o.rotation.x = -Math.PI / 2;
      o.renderOrder = 6;
      others.push(o);
    }
    this.root.add(pivot, land, ...dots, ...others);
    const h = { pivot, land, dots, others };
    this.pool.push(h);
    return h;
  }

  sync(w: World, aims: SwingAim[], time: number): void {
    while (this.pool.length < aims.length) this.make();
    this.pool.forEach((p, i) => {
      const aim = aims[i];
      const e = aim ? w.getAny(aim.heroId) : undefined;
      const live = !!e?.alive && !!e.hero && !e.hero.dead && !e.hero.action;
      const plan = live && aim ? chainSwingPlan(w, e!, aim.dirX, aim.dirZ, aim.at) : null;
      p.pivot.visible = p.land.visible = !!plan;
      p.dots.forEach((d) => (d.visible = !!plan));
      // The other pivots she could pick, faint.
      const rest = plan && e ? swingPivots(w, e).filter((q) => q.x !== plan.pv.x || q.z !== plan.pv.z) : [];
      p.others.forEach((o, k) => {
        const q = rest[k];
        o.visible = !!q;
        if (!q) return;
        o.position.set(q.x, w.groundY(q.x, q.z) + 0.1, q.z);
        o.scale.setScalar(q.r + 0.35);
      });
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
