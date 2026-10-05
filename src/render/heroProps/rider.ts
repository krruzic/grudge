// Bramble & Mead in the air (Take Wing, hero.wing): the body lifts smoothly to flight height and back down after
// landing (heroSync plays the "fly" clip meanwhile) and sheds pollen and petals. Called from
// heroSync for every hero; it returns 0 and does nothing unless the hero is (or just was) flying.
import type { Entity } from "../../sim/types";
import { RIDER, withCostume } from "../fx/atlas";
import { emit, type FxHost } from "../fx/parts";
import { costumeOfPlayer } from "../costumes";
import type { View } from "../entities/view";

const FLY_HEIGHT = 2.4;
const lifted = new WeakMap<View, { y: number; t: number }>();

/** Extra body height for a flying rider (eases up over ~0.3 s, settles over ~0.35 s after landing). */
export function beeLift(fx: FxHost, e: Entity, v: View, dt: number, time: number): number {
  const h = e.hero!;
  let s = lifted.get(v);
  if (!h.wing && !s) return 0;
  if (!s) lifted.set(v, (s = { y: 0, t: 0 }));
  const target = h.wing ? FLY_HEIGHT + Math.sin(time * 4.2) * 0.12 : 0;
  s.y += (target - s.y) * Math.min(1, dt * (h.wing ? 7 : 9));
  if (!h.wing && s.y < 0.02) {
    lifted.delete(v);
    return 0;
  }
  s.t -= dt;
  if (h.wing && s.t <= 0) {
    s.t = 0.07;
    const p = v.root.position;
    withCostume(costumeOfPlayer(h.player), () => {
      emit(fx, {
        tex: RIDER.pollen,
        n: 1,
        x: p.x,
        y: p.y + s!.y + 0.6,
        z: p.z,
        size: [0.35, 0.55],
        grow: 1.4,
        life: [0.5, 0.8],
        speed: [0.2, 0.6],
        gravity: 1.5,
        opacity: 0.8,
        jitter: 0.6,
      });
      if (Math.random() < 0.35)
        emit(fx, {
          tex: RIDER.petal,
          n: 1,
          x: p.x,
          y: p.y + s!.y + 0.8,
          z: p.z,
          size: [0.14, 0.22],
          life: [0.9, 1.3],
          speed: [0.3, 0.8],
          gravity: 1.2,
          spin: 4,
          jitter: 0.8,
        });
    });
  }
  return s.y;
}
