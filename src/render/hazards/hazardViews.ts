// HazardViews: views for the transient world objects abilities create (World.traps, World.zones, World.mods) and,
// through the MapFx it owns, the map features (gates, lanterns, jump pads, horns, mist, fountain, morph shrines).
// GameRenderer.render forwards mod/map events to handle() and calls sync() once per frame; zone sprites are drawn
// through a SpriteBatches filled per view (fillView).
import * as THREE from "three";
import { costumeOfPlayer } from "../costumes";
import type { World } from "../../sim/world";
import { withCostume } from "../fx/atlas";
import type { FxHost } from "../fx/parts";
import { wardenBrambleCast, wardenWallCrumble, wardenWallBlock } from "../kits/wardenParts";
import { fortBlock, fortCrumble } from "../kits/architect";
import { SpriteBatches } from "../batch/spriteBatch";
import { MapFx } from "../map/mapFx";
import { modMesh, syncWall } from "./terrainMods";
import { easeBack } from "./grow";
import { free } from "./materials";
import { snareMesh, trapMesh } from "./snares";
import { animateZone, zoneMesh } from "./zones";

export class HazardViews {
  readonly root = new THREE.Group();
  private traps = new Map<number, THREE.Object3D>();
  private zones = new Map<number, THREE.Object3D>();
  private mods = new Map<number, THREE.Object3D>();
  private sprites = new SpriteBatches();

  private now = 0;

  dispose(): void {
    this.mapFx.dispose();
    for (const o of [
      ...this.traps.values(),
      ...this.zones.values(),
      ...this.mods.values(),
      ...this.dying.map((d) => d.obj),
    ])
      free(o);
    this.traps.clear();
    this.zones.clear();
    this.mods.clear();
    this.dying = [];
    this.sprites.dispose();
  }

  private mapFx: MapFx;

  constructor(
    readonly world: World,
    readonly teamColors: THREE.Color[],
    readonly fx?: FxHost,
  ) {
    this.root.add(this.sprites.root);
    this.mapFx = new MapFx(world, fx);
    this.mapFx.teamColors = teamColors;
    this.root.add(this.mapFx.root);
  }

  fillView(camera: THREE.Camera): void {
    this.sprites.fill(camera);
  }

  cx = 0;
  cy = 0;
  cz = 0;

  handle(ev: { type: string; id?: number }): void {
    if (
      ev.type === "avalanche" ||
      ev.type === "gates" ||
      ev.type === "lantern" ||
      ev.type === "mist" ||
      ev.type === "morph" ||
      ev.type === "jumppad" ||
      ev.type === "horn" ||
      ev.type === "geyser" ||
      ev.type === "serpent" ||
      ev.type === "powerup"
    ) {
      this.mapFx.handle(ev);
      return;
    }
    if (ev.type === "mod" && ev.id !== undefined) {
      const m = this.world.mods.find((k) => k.id === ev.id);
      const owner = costumeOfPlayer(m?.owner !== undefined ? this.world.getAny(m.owner)?.hero?.player : undefined);
      // Built under the owner's costume, so cm()/atlas cells on the wall (moss tufts etc.) are themed.
      const obj = withCostume(owner, () => modMesh(this, ev.id!));
      if (obj) {
        obj.userData.born = this.now;
        obj.userData.wall = m?.kind === "wall";
        obj.userData.ice = m?.style === "ice";
        // The owner's costume, so the wall's crumble later is themed too.
        obj.userData.costume = owner;
        if (!obj.userData.wall) obj.scale.y = 0.01;
        else if (this.fx) {
          const cells = obj.userData.cells as THREE.Object3D[];
          const c0 = cells[0]?.position;
          const c1 = cells[cells.length - 1]?.position;
          const dx = c1 && c0 ? c1.x - c0.x : 1;
          const dz = c1 && c0 ? c1.z - c0.z : 0;
          const dl = Math.hypot(dx, dz) || 1;
          const fx = this.fx;
          withCostume(
            costumeOfPlayer(m?.owner !== undefined ? this.world.getAny(m.owner)?.hero?.player : undefined),
            () => {
              for (const c of cells)
                if (m?.style === "ice") fortBlock(fx, c.position.x, c.userData.baseY, c.position.z, c.userData.delay);
                else
                  wardenWallBlock(
                    fx,
                    c.position.x,
                    c.userData.baseY,
                    c.position.z,
                    c.userData.delay,
                    dz / dl,
                    -dx / dl,
                    m?.style === "wood",
                  );
            },
          );
        }
        this.mods.set(ev.id, obj);
        this.root.add(obj);
      }
    } else if (ev.type === "modEnd" && ev.id !== undefined) {
      const obj = this.mods.get(ev.id);
      if (obj) {
        this.mods.delete(ev.id);
        if (obj.userData.wall && this.fx) {
          const ice = obj.userData.ice;
          const fx = this.fx;
          withCostume(obj.userData.costume, () => {
            for (const c of obj.userData.cells as THREE.Object3D[])
              (ice ? fortCrumble : wardenWallCrumble)(fx, c.position.x, c.userData.baseY, c.position.z);
          });
          this.dying.push({ obj, at: this.now });
        } else {
          this.root.remove(obj);
          free(obj);
        }
      }
    }
  }

  private dying: { obj: THREE.Object3D; at: number }[] = [];

  /** Per frame: map features, then hazards matched against the sim lists (views created/freed as they come and go). */
  sync(time: number, dt: number): void {
    this.mapFx.sync(time, dt);
    this.now = time;
    this.syncDyingWalls(time);
    const w = this.world;
    for (const m of w.mods) if (!this.mods.has(m.id)) this.handle({ type: "mod", id: m.id });
    for (const id of [...this.mods.keys()]) if (!w.mods.some((m) => m.id === id)) this.handle({ type: "modEnd", id });
    this.syncTraps(time);
    this.syncZones(time, dt);
    this.raiseMods(time, dt);
  }

  /** Crumbling walls sink back into the ground over 0.5 s after their mod ends. */
  private syncDyingWalls(time: number): void {
    this.dying = this.dying.filter(({ obj, at }) => {
      const k = (time - at) / 0.5;
      for (const c of obj.userData.cells as THREE.Object3D[]) {
        c.position.y = c.userData.baseY - 2.7 * Math.min(1, k * k);
        c.rotation.z = Math.sin(time * 40 + c.position.x) * 0.04;
      }
      syncWall(obj);
      if (k >= 1) {
        this.root.remove(obj);
        free(obj);
      }
      return k < 1;
    });
  }

  /** Thorn's snares (jaws open as they arm) and generic traps (spin fast while arming). */
  private syncTraps(time: number): void {
    const w = this.world;
    const seenT = new Set<number>();
    for (const t of w.traps) {
      seenT.add(t.id);
      let o = this.traps.get(t.id);
      if (!o) {
        const owner = w.getAny(t.ownerId);
        o =
          owner?.hero?.type === "warden"
            ? withCostume(costumeOfPlayer(owner.hero.player), () =>
                snareMesh(this, t.team, t.radius, costumeOfPlayer(owner.hero!.player)),
              )
            : trapMesh(this, t.team);
        o.userData.snare = owner?.hero?.type === "warden";
        o.position.set(t.x, w.groundY(t.x, t.z) + 0.06, t.z);
        this.traps.set(t.id, o);
        this.root.add(o);
      }
      if (o.userData.snare) {
        const arming = w.time < t.armAt;
        const jaws = o.getObjectByName("jaws")!;
        const open = arming ? 0.35 + 0.65 * (1 - (t.armAt - w.time) / 0.6) : 1;
        jaws.scale.set(1, Math.max(0.2, Math.min(1, open)), 1);
        jaws.children.forEach((v, k) => {
          v.rotation.y = Math.sin(time * 1.4 + k) * 0.05;
        });
        const gl = o.getObjectByName("glow") as THREE.Mesh;
        (gl.material as THREE.MeshBasicMaterial).opacity = arming ? 0.2 : 0.35 + 0.2 * Math.sin(time * 3);
      } else o.rotation.y = time * (w.time < t.armAt ? 6 : 0.5);
    }
    for (const [id, o] of this.traps)
      if (!seenT.has(id)) {
        this.root.remove(o);
        free(o);
        this.traps.delete(id);
      }
  }

  /**
   * Zones: new zones are built centred on (cx, cy, cz) under their owner's costume (Thorn's bramble also plays
   * its cast); every zone is then animated by animateZone().
   */
  private syncZones(time: number, dt: number): void {
    const w = this.world;
    const seenZ = new Set<number>();
    for (const z of w.zones) {
      seenZ.add(z.id);
      let o = this.zones.get(z.id);
      if (!o) {
        this.cx = z.x;
        this.cz = z.z;
        this.cy = w.groundY(z.x, z.z);
        const zc = costumeOfPlayer(w.getAny(z.ownerId)?.hero?.player);
        o = withCostume(zc, () => zoneMesh(this, z.radius, z.style, zc));
        o.userData.costume = zc;
        o.position.set(z.x, this.cy, z.z);
        o.userData.born = time;
        o.userData.bramble = (z.style ?? "bramble") === "bramble";
        o.scale.setScalar(1);
        if (o.userData.bramble && this.fx)
          withCostume(zc, () => wardenBrambleCast(this.fx!, z.x, this.cy, z.z, z.radius));
        this.sprites.addTree(o);
        this.zones.set(z.id, o);
        this.root.add(o);
      }
      animateZone(this, z, o, time, dt);
    }
    for (const [id, o] of this.zones)
      if (!seenZ.has(id)) {
        this.root.remove(o);
        free(o);
        this.zones.delete(id);
      }
  }

  /** Terrain mods grow in (ramps/platforms scale up; wall blocks pop up one by one with an overshoot). */
  private raiseMods(time: number, dt: number): void {
    for (const o of this.mods.values()) {
      if (!o.userData.wall) {
        o.scale.y = Math.min(1, o.scale.y + dt * 6);
        continue;
      }
      for (const c of o.userData.cells as THREE.Object3D[]) {
        const t = time - o.userData.born - c.userData.delay;
        const e = t <= 0 ? 0 : t >= 0.26 ? 1 : easeBack(t / 0.26);
        c.position.y = c.userData.baseY - 2.7 * (1 - e);
        c.visible = t > 0;
        c.rotation.z = t > 0 && t < 0.3 ? Math.sin(t * 90) * 0.03 : 0;
      }
      syncWall(o);
    }
  }
}
