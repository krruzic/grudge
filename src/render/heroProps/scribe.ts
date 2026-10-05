// Hollin's props outside her model: Ink Bolts in flight (an ink orb with a dripping trail; charged bolts glow
// gold), her runes on the ground (glowing gold rune circles that write themselves in, turn slowly and fade before
// they expire) and the bees that buzz around her (pages too while Illuminated Manuscript is up).
import * as THREE from "three";
import type { Entity } from "../../sim/types";
import { cv, hd, SCRIBE, tint, useCostume } from "../fx/atlas";
import { emit } from "../fx/parts";
import { costumeOfPlayer } from "../costumes";
import type { HeroPropViews } from "./heroPropViews";

const runeGeo = new THREE.PlaneGeometry(1, 1);
runeGeo.rotateX(-Math.PI / 2);
runeGeo.userData.model = true;

function boltView(charged: boolean): THREE.Object3D {
  const g = new THREE.Group();
  const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: cv(SCRIBE.ink), transparent: true, depthWrite: false }));
  orb.scale.setScalar(charged ? 0.75 : 0.5);
  g.add(orb);
  if (charged) {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cv(SCRIBE.star),
        color: tint(0xffd870),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.scale.setScalar(1.1);
    glow.name = "glow";
    g.add(glow);
  }
  return g;
}

function runeView(): THREE.Mesh {
  const m = new THREE.Mesh(
    runeGeo,
    new THREE.MeshBasicMaterial({
      map: hd(SCRIBE.rune),
      color: tint(0xffe6a0),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    }),
  );
  m.renderOrder = 2;
  return m;
}

export function syncScribe(views: HeroPropViews, alpha: number, dt: number, puff: boolean): void {
  const w = views.world;
  const prevC = useCostume("");
  const seenBolt = new Set<number>();
  for (const b of w.inkBolts) {
    seenBolt.add(b.id);
    const owner = w.getAny(b.ownerId);
    useCostume(costumeOfPlayer(owner?.hero?.player));
    let o = views.inkBolts.get(b.id);
    if (!o) {
      o = boltView(!!b.blot);
      views.inkBolts.set(b.id, o);
      views.root.add(o);
    }
    const back = b.speed * w.dt * (1 - alpha);
    o.position.set(b.x - b.dirX * back, b.y, b.z - b.dirZ * back);
    const glow = o.getObjectByName("glow") as THREE.Sprite | undefined;
    if (glow) glow.material.rotation += dt * 4;
    if (views.fx && puff)
      emit(views.fx, {
        tex: SCRIBE.drop,
        n: 1,
        x: o.position.x,
        y: o.position.y,
        z: o.position.z,
        size: [0.12, 0.2],
        life: [0.3, 0.5],
        speed: [0.2, 0.6],
        gravity: 9,
      });
  }
  for (const [id, o] of views.inkBolts)
    if (!seenBolt.has(id)) {
      views.root.remove(o);
      views.inkBolts.delete(id);
    }

  const seenRune = new Set<number>();
  const r0 = 1.7;
  for (const p of w.players) {
    const e = w.getAny(p.heroId);
    const h = e?.hero;
    if (!e || !h) continue;
    useCostume(costumeOfPlayer(h.player));
    for (const n of h.runes ?? []) {
      seenRune.add(n.id);
      let v = views.runes.get(n.id);
      if (!v) {
        v = { obj: runeView(), born: views.t };
        views.runes.set(n.id, v);
        views.root.add(v.obj);
      }
      const age = views.t - v.born;
      const left = n.until - w.time;
      const m = v.obj as THREE.Mesh;
      m.position.set(n.x, w.groundY(n.x, n.z) + 0.06, n.z);
      const write = Math.min(1, age * 2.5);
      m.scale.setScalar(r0 * 2 * (0.6 + 0.4 * write));
      m.rotation.y += dt * 0.35;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.map = hd(SCRIBE.rune);
      const blink = left < 2 ? 0.55 + 0.45 * Math.sin(views.t * 14) : 1;
      mat.opacity = write * Math.min(1, left / 0.4) * blink * (0.75 + 0.15 * Math.sin(views.t * 2.5 + n.id));
      if (views.fx && puff && Math.random() < 0.06)
        emit(views.fx, {
          tex: SCRIBE.star,
          n: 1,
          x: n.x,
          y: m.position.y + 0.2,
          z: n.z,
          color: 0xffd870,
          size: [0.15, 0.25],
          life: [0.6, 0.9],
          speed: [0, 0.2],
          up: [0.5, 0.9],
          additive: true,
          jitter: r0 * 1.4,
        });
    }
    if (e.alive && !h.dead && w.heroDef(h.type).hooks.runeMax) ambient(views, e, alpha, puff);
  }
  for (const [id, v] of views.runes)
    if (!seenRune.has(id)) {
      views.root.remove(v.obj);
      views.runes.delete(id);
    }
  useCostume(prevC);
}

/** Bees drifting around her hat; during the manuscript window, pages and gold sparks circle her too. */
function ambient(views: HeroPropViews, e: Entity, alpha: number, puff: boolean): void {
  if (!views.fx || !puff || e.status.hidden) return;
  const p = views.viewPos(e, alpha);
  const s = views.heroScale;
  if (Math.random() < 0.35) {
    const a = Math.random() * Math.PI * 2;
    emit(views.fx, {
      tex: SCRIBE.bee,
      n: 1,
      x: p.x + Math.cos(a) * 0.7 * s,
      y: p.y + (1.5 + Math.random() * 0.5) * s,
      z: p.z + Math.sin(a) * 0.7 * s,
      size: [0.12, 0.16],
      life: [0.5, 0.8],
      speed: [0.6, 1.2],
      dir: { x: -Math.sin(a), y: 0, z: Math.cos(a) },
      cone: 0.5,
    });
  }
  const w = views.world;
  if (w.time < (e.hero!.manuscriptUntil ?? 0)) {
    const a = Math.random() * Math.PI * 2;
    emit(views.fx, {
      tex: Math.random() < 0.5 ? SCRIBE.page : SCRIBE.star,
      n: 1,
      x: p.x + Math.cos(a) * 1.1 * s,
      y: p.y + (0.6 + Math.random() * 1.4) * s,
      z: p.z + Math.sin(a) * 1.1 * s,
      color: 0xffffff,
      size: [0.25, 0.4],
      life: [0.5, 0.8],
      speed: [1.2, 2],
      dir: { x: -Math.sin(a), y: 0.2, z: Math.cos(a) },
      cone: 0.3,
      spin: 4,
    });
  }
}
