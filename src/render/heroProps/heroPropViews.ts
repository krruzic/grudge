// HeroPropViews: persistent hero props that live outside the hero model: Wren's Pip (flying, latched, returning)
// and vantage glow, Maddock's thrown kegs and the keg he rides during Keg Rocket, Hollin's ink bolts and runes. Synced once per frame by
// GameRenderer after the entity views, each under its owner's costume.
import * as THREE from "three";
import type { World } from "../../sim/world";
import type { Entity } from "../../sim/types";
import { withCostume } from "../fx/atlas";
import { type FxHost } from "../fx/parts";
import { costumeOfPlayer } from "../costumes";
import { syncRider, syncKegs } from "./friar";
import { syncPip, syncVantage } from "./marksman";
import { syncScribe } from "./scribe";

export class HeroPropViews {
  readonly root = new THREE.Group();
  fx: FxHost | null = null;
  pips = new Map<
    number,
    { obj: THREE.Group; wings: THREE.Object3D[]; base: number[]; prev: THREE.Vector3; latchT: number; costume: string }
  >();
  kegs = new Map<number, { obj: THREE.Object3D; ring?: THREE.Mesh; spark?: THREE.Sprite }>();
  riders = new Map<number, THREE.Object3D>();
  vantage = new Map<number, boolean>();
  inkBolts = new Map<number, THREE.Object3D>();
  runes = new Map<number, { obj: THREE.Object3D; born: number }>();
  t = 0;
  private emitT = 0;

  constructor(
    readonly world: World,
    readonly heroScale: number,
  ) {}

  viewPos(e: Entity, alpha: number): THREE.Vector3 {
    const t = e.transform;
    return new THREE.Vector3(
      t.prevPos.x + (t.pos.x - t.prevPos.x) * alpha,
      t.prevY + (t.y - t.prevY) * alpha,
      t.prevPos.z + (t.pos.z - t.prevPos.z) * alpha,
    );
  }

  sync(alpha: number, dt: number): void {
    const w = this.world;
    this.t += dt;
    this.emitT -= dt;
    const puff = this.emitT <= 0;
    if (puff) this.emitT = 0.06;
    const seenPip = new Set<number>();
    const seenRider = new Set<number>();
    for (const p of w.players) {
      const e = w.getAny(p.heroId);
      const h = e?.hero;
      if (!e || !h) continue;
      if (h.pip) {
        seenPip.add(e.id);
        withCostume(costumeOfPlayer(h.player), () => syncPip(this, e, alpha, dt, puff));
      }
      if (e.alive && h.action?.kind === "kegrocket") {
        seenRider.add(e.id);
        withCostume(costumeOfPlayer(h.player), () => syncRider(this, e, alpha, puff));
      }
      if (e.alive && w.heroDef(h.type).hooks.vantageMul) syncVantage(this, e, alpha);
    }
    for (const [id, v] of this.pips) {
      if (seenPip.has(id)) continue;
      this.root.remove(v.obj);
      this.pips.delete(id);
    }
    for (const [id, o] of this.riders) {
      if (seenRider.has(id)) continue;
      this.root.remove(o);
      this.riders.delete(id);
    }
    syncKegs(this, alpha, puff);
    syncScribe(this, alpha, dt, puff);
  }
}
