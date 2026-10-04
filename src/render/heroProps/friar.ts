// Maddock's props: keg models (costume props, or procedural barrels), the cask structure body, the keg he rolls
// on during Keg Rocket, and thrown kegs (ballistic arc, then the powder keg's fuse ring and sparks until it blows).
import * as THREE from "three";
import { IRON, BRASS, model, WOOD_DARK, WOOD, normalized, FUSE, keep } from "../kits/shared";
import type { Entity, Keg } from "../../sim/types";
import { cv, FRIAR, FX, useCostume } from "../fx/atlas";
import type { HeroPropViews } from "./heroPropViews";
import { ALE_DROP, FOAM } from "../kits/friar";
import { prop } from "../props";
import { costumeOfPlayer } from "../costumes";
import { emit } from "../fx/parts";

const barrelGeo = model(
  (() => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const y = i / 8 - 0.5;
      pts.push(new THREE.Vector2(0.36 + 0.08 * Math.cos(y * Math.PI), y));
    }
    const g = new THREE.LatheGeometry(pts, 12);
    return g;
  })(),
);
const capGeo = model(new THREE.CircleGeometry(0.37, 12));
const bandGeo = model(new THREE.TorusGeometry(0.4, 0.025, 4, 14));
const fuseGeo = model(new THREE.CylinderGeometry(0.02, 0.025, 0.3, 4));
function barrel(dark: boolean, big = false): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(barrelGeo, dark ? WOOD_DARK : WOOD);
  g.add(body);
  for (const y of [-0.5, 0.5]) {
    const c = new THREE.Mesh(capGeo, dark ? WOOD_DARK : WOOD);
    c.position.y = y;
    c.rotation.x = y < 0 ? Math.PI / 2 : -Math.PI / 2;
    g.add(c);
  }
  for (const y of [-0.34, 0, 0.34]) {
    if (!big && y === 0) continue;
    const b = new THREE.Mesh(bandGeo, big ? BRASS : IRON);
    b.position.y = y;
    b.rotation.x = Math.PI / 2;
    b.scale.setScalar(y === 0 ? 1.08 : 0.98);
    g.add(b);
  }
  return g;
}
function kegModel(kind: Keg["kind"], costume: string): THREE.Object3D {
  const powder = kind === "powder" || kind === "minipowder";
  const mini = kind === "minipowder" || kind === "miniheal";
  const size = (powder ? 0.95 : 0.9) * (mini ? 0.55 : 1) * 1.25;
  const p = prop(powder ? "powderkeg" : "keg", undefined, { hero: "friar", costume });
  if (p) return normalized(p, size);
  const g = new THREE.Group();
  const b = barrel(powder);
  b.position.y = 0.5;
  g.add(b);
  if (powder) {
    const f = new THREE.Mesh(fuseGeo, FUSE);
    f.position.set(0.08, 1.12, 0);
    f.rotation.z = -0.4;
    f.name = "fuse";
    g.add(f);
  } else {
    const foam = new THREE.Sprite(new THREE.SpriteMaterial({ map: cv(FOAM), transparent: true, depthWrite: false }));
    foam.scale.setScalar(0.55);
    foam.position.y = 1.05;
    g.add(foam);
  }
  return normalized(g, size);
}
export function caskMesh(team: THREE.Color, costume?: string): THREE.Group {
  const g = new THREE.Group();
  const p = prop("bigkeg", team, { hero: "friar", costume });
  if (p) {
    g.add(normalized(p, 2.6));
    return g;
  }
  const cradle = new THREE.Group();
  for (const x of [-0.65, 0.65]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 1.5), WOOD_DARK);
    leg.position.set(x, 0.35, 0);
    cradle.add(leg);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 1.7), WOOD_DARK);
    cross.position.set(x, 0.1, 0);
    cradle.add(cross);
  }
  g.add(cradle);
  const b = barrel(false, true);
  b.scale.set(1.9, 2.2, 1.9);
  b.rotation.z = Math.PI / 2;
  b.position.y = 1.2;
  g.add(b);
  const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6), BRASS);
  tap.rotation.z = Math.PI / 2;
  tap.position.set(1.25, 1.0, 0);
  g.add(tap);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 6), BRASS);
  spout.position.set(1.42, 0.88, 0);
  g.add(spout);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.35),
    keep(new THREE.MeshLambertMaterial({ color: team, side: THREE.DoubleSide })),
  );
  flag.position.set(-0.4, 2.55, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 4), WOOD_DARK);
  pole.position.set(-0.62, 2.35, 0);
  flag.name = "spin";
  g.add(flag, pole);
  const foam = new THREE.Sprite(new THREE.SpriteMaterial({ map: cv(FOAM), transparent: true, depthWrite: false }));
  foam.scale.setScalar(0.9);
  foam.position.set(0, 2.25, 0);
  g.add(foam);
  return g;
}
export function syncCask(body: THREE.Object3D, age: number, time: number): void {
  const k = Math.min(1, age / 0.35);
  const bounce = k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1 + Math.sin(time * 3) * 0.015;
  body.scale.set(bounce, k < 1 ? 0.3 + 0.7 * k : bounce, bounce);
  const flag = body.getObjectByName("spin");
  if (flag) flag.rotation.y = Math.sin(time * 4) * 0.3;
}
export function syncRider(views: HeroPropViews, e: Entity, alpha: number, puff: boolean): void {
  let o = views.riders.get(e.id);
  if (!o) {
    o = new THREE.Group();
    const k = kegModel("heal", costumeOfPlayer(e.hero!.player));
    const box = new THREE.Box3().setFromObject(k);
    const sz = box.getSize(new THREE.Vector3());
    k.position.y = -sz.y / 2;
    const lay = new THREE.Group();
    lay.rotation.z = Math.PI / 2;
    lay.add(k);
    const roll = new THREE.Group();
    roll.name = "roll";
    roll.position.y = Math.max(sz.x, sz.z) / 2;
    roll.add(lay);
    o.add(roll);
    o.scale.setScalar(1.3);
    views.root.add(o);
    views.riders.set(e.id, o);
  }
  const p = views.viewPos(e, alpha);
  const a = e.hero!.action!;
  o.position.set(p.x, p.y, p.z);
  o.rotation.y = Math.atan2(a.dirX, a.dirZ);
  const roll = o.getObjectByName("roll");
  if (roll) roll.rotation.x = views.t * 18;
  if (views.fx && puff) {
    emit(views.fx, {
      tex: FOAM,
      n: 1,
      x: p.x - a.dirX * 0.8,
      y: p.y + 0.3,
      z: p.z - a.dirZ * 0.8,
      size: [0.4, 0.6],
      grow: 1.5,
      life: [0.4, 0.6],
      speed: [0.3, 1],
      up: [0.5, 1.2],
      gravity: 3,
    });
    emit(views.fx, {
      tex: ALE_DROP,
      n: 2,
      x: p.x - a.dirX * 0.6,
      y: p.y + 0.5,
      z: p.z - a.dirZ * 0.6,
      size: [0.15, 0.22],
      life: [0.4, 0.6],
      speed: [1, 2.5],
      up: [1.5, 3],
      gravity: 12,
      floor: p.y + 0.05,
    });
    emit(views.fx, {
      tex: FX.dust,
      n: 1,
      x: p.x,
      y: p.y + 0.2,
      z: p.z,
      size: [0.6, 0.9],
      grow: 1.6,
      life: [0.35, 0.5],
      speed: [0.5, 1.2],
      flatSpread: true,
      drag: 3,
      opacity: 0.7,
    });
  }
}
export function syncKegs(views: HeroPropViews, alpha: number, puff: boolean): void {
  const w = views.world;
  const seen = new Set<number>();
  const prevC = useCostume("");
  for (const k of w.kegs) {
    seen.add(k.id);
    let v = views.kegs.get(k.id);
    const owner = w.getAny(k.ownerId);
    useCostume(costumeOfPlayer(owner?.hero?.player));
    if (!v) {
      const obj = kegModel(k.kind, costumeOfPlayer(owner?.hero?.player));
      v = { obj };
      if (k.kind === "powder") {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.9, 1, 32),
          new THREE.MeshBasicMaterial({
            color: 0xff4020,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.visible = false;
        v.ring = ring;
        views.root.add(ring);
        const spark = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: FX.twinkle,
            color: 0xffc040,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        spark.scale.setScalar(0.4);
        v.spark = spark;
        views.root.add(spark);
      }
      views.root.add(obj);
      views.kegs.set(k.id, v);
    }
    const o = v.obj;
    const time = w.time - w.dt * (1 - alpha);
    if (!k.landed || time < k.start + k.dur) {
      const f = Math.max(0, Math.min(1, (time - k.start) / k.dur));
      const d = Math.hypot(k.toX - k.fromX, k.toZ - k.fromZ);
      const hgt = 1.2 + d * 0.28;
      o.position.set(
        k.fromX + (k.toX - k.fromX) * f,
        k.fromY + (k.toY - k.fromY) * f + hgt * 4 * f * (1 - f),
        k.fromZ + (k.toZ - k.fromZ) * f,
      );
      o.rotation.set(f * 7, Math.atan2(k.toX - k.fromX, k.toZ - k.fromZ), f * 3);
      if (views.fx && puff && (k.kind === "powder" || k.kind === "minipowder"))
        emit(views.fx, {
          tex: FX.twinkle,
          n: 1,
          x: o.position.x,
          y: o.position.y + 0.5,
          z: o.position.z,
          color: 0xffb040,
          size: [0.2, 0.3],
          life: [0.2, 0.3],
          speed: [0.5, 1.5],
          gravity: 4,
          additive: true,
        });
      else if (views.fx && puff && Math.random() < 0.5)
        emit(views.fx, {
          tex: ALE_DROP,
          n: 1,
          x: o.position.x,
          y: o.position.y + 0.4,
          z: o.position.z,
          size: [0.14, 0.2],
          life: [0.4, 0.6],
          speed: [0.2, 0.6],
          gravity: 10,
        });
      if (v.ring) v.ring.visible = false;
      if (v.spark) v.spark.position.set(o.position.x, o.position.y + 1.1, o.position.z);
    } else {
      const fuse = Math.max(0.05, k.fuseAt - (k.start + k.dur));
      const heat = Math.max(0, Math.min(1, 1 - (k.fuseAt - time) / fuse));
      o.position.set(k.toX, k.toY, k.toZ);
      o.rotation.set(Math.sin(views.t * 40) * 0.08 * heat, o.rotation.y, Math.cos(views.t * 37) * 0.08 * heat);
      o.scale.setScalar(o.userData.s0 ?? (o.userData.s0 = o.scale.x));
      o.scale.multiplyScalar(1 + heat * 0.15 + (Math.sin(views.t * (8 + heat * 20)) > 0 ? 0.03 : 0));
      const r = w.heroDef(w.getAny(k.ownerId)?.hero?.type ?? "friar").abilities.r.radius ?? 3.2;
      if (v.ring) {
        v.ring.visible = true;
        v.ring.position.set(k.toX, k.toY + 0.12, k.toZ);
        v.ring.scale.setScalar(r * (0.4 + 0.6 * heat));
        (v.ring.material as THREE.MeshBasicMaterial).opacity =
          0.35 + 0.4 * (Math.sin(views.t * (10 + heat * 20)) > 0 ? 1 : 0.3);
      }
      if (v.spark) {
        v.spark.position.set(k.toX, k.toY + 1.25, k.toZ);
        v.spark.scale.setScalar(0.35 + Math.random() * 0.35);
      }
      if (views.fx && puff) {
        emit(views.fx, {
          tex: FX.twinkle,
          n: 2,
          x: k.toX,
          y: k.toY + 1.25,
          z: k.toZ,
          color: 0xffa030,
          size: [0.15, 0.28],
          life: [0.2, 0.35],
          speed: [1, 2.5],
          up: [1, 2],
          gravity: 6,
          additive: true,
        });
        emit(views.fx, {
          tex: FRIAR.spark,
          n: 1,
          x: k.toX,
          y: k.toY + 1.3,
          z: k.toZ,
          additive: true,
          color: 0xffffff,
          size: [0.25, 0.4],
          grow: 0.6,
          life: [0.2, 0.35],
          speed: [0.5, 1.5],
          up: [0.6, 1.2],
          opacity: 0.9,
        });
      }
    }
  }
  useCostume(prevC);
  for (const [id, v] of views.kegs) {
    if (seen.has(id)) continue;
    views.root.remove(v.obj);
    if (v.ring) {
      views.root.remove(v.ring);
      v.ring.geometry.dispose();
    }
    if (v.spark) views.root.remove(v.spark);
    views.kegs.delete(id);
  }
}
