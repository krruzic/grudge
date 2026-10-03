import * as THREE from "three";
import type { World } from "../sim/world";
import type { Entity, Keg } from "../sim/types";
import { composite, FRIAR, FX, WREN } from "./fxKit";
import { chunks, decal, emit, shockwave, tumblers, type FxHost } from "./fxParts";
import { KITS, type HitEvent } from "./kits";
import { prop } from "./props";
import { costumeOfPlayer } from "./costumes";
import brewRingUrl from "../../assets/fx/brewfest_ring.png?url";

const UP = new THREE.Vector3(0, 1, 0);
const ground = (h: FxHost, x: number, z: number, y: number) => (h.world ? h.world.groundY(x, z) : y);
const near = (ev: HitEvent, src: Entity, r: number) => Math.hypot(src.transform.pos.x - ev.x, src.transform.pos.z - ev.z) <= r;
const keep = <T extends THREE.Material>(m: T): T => {
  m.userData.keep = true;
  return m;
};
const model = <T extends THREE.BufferGeometry>(g: T): T => {
  g.userData.model = true;
  return g;
};

export const BUBBLE = FRIAR.bubble;

export const FOAM = FRIAR.foam;

export const ALE_DROP = FRIAR.drop;

export const ALE_SPLASH = FRIAR.splash;

export const HEART = WREN.heart;

export const BEAM = composite(128, (g) => {
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "rgba(255,200,120,0)");
  gr.addColorStop(0.35, "rgba(255,170,90,0.7)");
  gr.addColorStop(0.5, "rgba(255,255,235,1)");
  gr.addColorStop(0.65, "rgba(255,170,90,0.7)");
  gr.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
});

export const MARK_RING = WREN.markRing;

export const VOLLEY_RING = WREN.arrowRing;

export const HEART_RING = WREN.spiral;

function disc(draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  return composite(256, (g) => {
    g.save();
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.clip();
    draw(g);
    g.restore();
  });
}

function speckle(g: CanvasRenderingContext2D, n: number, rMin: number, rMax: number, color: string, size: [number, number], seed: number): void {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rMin + rnd() * (rMax - rMin);
    g.beginPath();
    g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, size[0] + rnd() * (size[1] - size[0]), 0, Math.PI * 2);
    g.fill();
  }
}

export const ZONE_DECALS: Record<string, THREE.Texture> = {
  ale: disc((g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 124);
    gr.addColorStop(0, "rgba(250,190,60,0.78)");
    gr.addColorStop(0.7, "rgba(214,138,24,0.7)");
    gr.addColorStop(0.9, "rgba(240,215,160,0.75)");
    gr.addColorStop(1, "rgba(240,215,160,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    speckle(g, 70, 92, 118, "rgba(255,250,235,0.9)", [3, 8], 7);
    speckle(g, 22, 10, 90, "rgba(255,245,210,0.55)", [2, 5], 11);
    g.strokeStyle = "rgba(255,245,200,0.35)";
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(110, 104, 46, 18, -0.5, 0, Math.PI * 2);
    g.stroke();
  }),
  brewfest: disc((g) => {
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 126);
    gr.addColorStop(0, "rgba(255,210,90,0.18)");
    gr.addColorStop(0.82, "rgba(255,190,60,0.12)");
    gr.addColorStop(0.92, "rgba(255,220,120,0.65)");
    gr.addColorStop(1, "rgba(255,220,120,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    speckle(g, 90, 108, 122, "rgba(255,245,215,0.75)", [2, 5], 3);
    g.strokeStyle = "rgba(255,230,150,0.55)";
    g.lineWidth = 3;
    g.setLineDash([10, 9]);
    g.beginPath();
    g.arc(128, 128, 98, 0, Math.PI * 2);
    g.stroke();
  }),
  tar: disc((g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 124);
    gr.addColorStop(0, "rgba(20,12,8,0.95)");
    gr.addColorStop(0.8, "rgba(34,20,10,0.85)");
    gr.addColorStop(1, "rgba(34,20,10,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(255,120,30,0.55)";
    g.lineWidth = 3;
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * 20, 128 + Math.sin(a) * 20);
      g.lineTo(128 + Math.cos(a + 0.3) * 70, 128 + Math.sin(a + 0.3) * 70);
      g.lineTo(128 + Math.cos(a + 0.1) * 105, 128 + Math.sin(a + 0.1) * 105);
      g.stroke();
    }
    speckle(g, 30, 10, 110, "rgba(120,90,60,0.45)", [3, 7], 5);
  }),
};
ZONE_DECALS.ale = FRIAR.puddle;
ZONE_DECALS.brewfest = (() => {
  const t = new THREE.TextureLoader().load(brewRingUrl);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
})();
ZONE_DECALS.aletrail = ZONE_DECALS.ale;

const WOOD = keep(new THREE.MeshLambertMaterial({ color: 0x9a6232, flatShading: true }));
const WOOD_DARK = keep(new THREE.MeshLambertMaterial({ color: 0x4e3018, flatShading: true }));
const IRON = keep(new THREE.MeshLambertMaterial({ color: 0x55545a, flatShading: true }));
const BRASS = keep(new THREE.MeshLambertMaterial({ color: 0xc8a040, flatShading: true }));
const FUSE = keep(new THREE.MeshLambertMaterial({ color: 0xc8b080 }));
const RED = keep(new THREE.MeshLambertMaterial({ color: 0xd8281c, flatShading: true }));
const RED_DARK = keep(new THREE.MeshLambertMaterial({ color: 0x8a1810, flatShading: true }));
const BEAK = keep(new THREE.MeshLambertMaterial({ color: 0xf0b030, flatShading: true }));
const CREAM = keep(new THREE.MeshLambertMaterial({ color: 0xf0e0c0, flatShading: true }));
const BLACK = keep(new THREE.MeshLambertMaterial({ color: 0x141010 }));
const FEATHER_MAT = keep(new THREE.MeshLambertMaterial({ color: 0xf0e8d8, flatShading: true, side: THREE.DoubleSide }));

const barrelGeo = model((() => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const y = i / 8 - 0.5;
    pts.push(new THREE.Vector2(0.36 + 0.08 * Math.cos(y * Math.PI), y));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  return g;
})());
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

function normalized(o: THREE.Object3D, size: number): THREE.Group {
  const box = new THREE.Box3().setFromObject(o);
  const s = box.getSize(new THREE.Vector3());
  const m = Math.max(s.x, s.y, s.z) || 1;
  const c = box.getCenter(new THREE.Vector3());
  const g = new THREE.Group();
  o.position.sub(c);
  o.position.y += s.y / 2;
  g.add(o);
  g.scale.setScalar(size / m);
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
    const foam = new THREE.Sprite(new THREE.SpriteMaterial({ map: FOAM, transparent: true, depthWrite: false }));
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
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), keep(new THREE.MeshLambertMaterial({ color: team, side: THREE.DoubleSide })));
  flag.position.set(-0.4, 2.55, 0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 4), WOOD_DARK);
  pole.position.set(-0.62, 2.35, 0);
  flag.name = "spin";
  g.add(flag, pole);
  const foam = new THREE.Sprite(new THREE.SpriteMaterial({ map: FOAM, transparent: true, depthWrite: false }));
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

const shaftGeo = model(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5).rotateX(Math.PI / 2));
const tipGeo = model(new THREE.ConeGeometry(0.075, 0.26, 4).rotateX(Math.PI / 2).translate(0, 0, 0.86));
const fletchGeo = model(new THREE.PlaneGeometry(0.16, 0.3).translate(0, 0, -0.6));
const fletch2 = model(fletchGeo.clone().rotateZ(Math.PI / 2));

function arrowMesh(scale: number, glow?: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(shaftGeo, WOOD), new THREE.Mesh(tipGeo, IRON), new THREE.Mesh(fletchGeo, FEATHER_MAT), new THREE.Mesh(fletch2, FEATHER_MAT));
  if (glow !== undefined) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.burst2, color: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.setScalar(0.9);
    s.position.z = 0.7;
    g.add(s);
  }
  g.scale.setScalar(scale);
  return g;
}

function pipFallback(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(model(new THREE.SphereGeometry(0.16, 8, 6)), RED);
  body.scale.set(0.9, 0.85, 1.35);
  const breast = new THREE.Mesh(model(new THREE.SphereGeometry(0.1, 6, 5)), CREAM);
  breast.position.set(0, -0.05, 0.1);
  const head = new THREE.Mesh(model(new THREE.SphereGeometry(0.1, 8, 6)), RED);
  head.position.set(0, 0.09, 0.19);
  const beak = new THREE.Mesh(model(new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(Math.PI / 2)), BEAK);
  beak.position.set(0, 0.07, 0.31);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(model(new THREE.SphereGeometry(0.018, 4, 3)), BLACK);
    eye.position.set(0.065 * s, 0.12, 0.25);
    g.add(eye);
  }
  const tail = new THREE.Mesh(model(new THREE.BoxGeometry(0.14, 0.02, 0.2)), RED_DARK);
  tail.position.set(0, 0.02, -0.24);
  tail.rotation.x = -0.3;
  g.add(body, breast, head, beak, tail);
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = s < 0 ? "wing_L" : "wing_R";
    pivot.position.set(0.1 * s, 0.05, 0);
    const wing = new THREE.Mesh(model(new THREE.BoxGeometry(0.34, 0.02, 0.2)), RED_DARK);
    wing.position.x = 0.17 * s;
    pivot.add(wing);
    g.add(pivot);
  }
  return g;
}

function pipModel(costume: string): { obj: THREE.Group; wings: THREE.Object3D[]; base: number[] } {
  const p = prop("pip", undefined, { hero: "marksman", costume });
  const obj = p ? normalized(p, 0.85) : pipFallback();
  if (!p) obj.scale.setScalar(1.35);
  const wings: THREE.Object3D[] = [];
  obj.traverse((o) => {
    if (o.name.startsWith("wing_L") || o.name.startsWith("wing_R")) wings.push(o);
  });
  return { obj, wings, base: wings.map((w) => w.rotation.z) };
}

export class HeroPropViews {
  readonly root = new THREE.Group();
  fx: FxHost | null = null;
  private pips = new Map<number, { obj: THREE.Group; wings: THREE.Object3D[]; base: number[]; prev: THREE.Vector3; latchT: number; costume: string }>();
  private kegs = new Map<number, { obj: THREE.Object3D; ring?: THREE.Mesh; spark?: THREE.Sprite }>();
  private riders = new Map<number, THREE.Object3D>();
  private vantage = new Map<number, boolean>();
  private t = 0;
  private emitT = 0;

  constructor(private world: World, private heroScale: number) {}

  private viewPos(e: Entity, alpha: number): THREE.Vector3 {
    const t = e.transform;
    return new THREE.Vector3(t.prevPos.x + (t.pos.x - t.prevPos.x) * alpha, t.prevY + (t.y - t.prevY) * alpha, t.prevPos.z + (t.pos.z - t.prevPos.z) * alpha);
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
        this.syncPip(e, alpha, dt, puff);
      }
      if (e.alive && h.action?.kind === "kegrocket") {
        seenRider.add(e.id);
        this.syncRider(e, alpha, puff);
      }
      if (e.alive && w.heroDef(h.type).hooks.vantageMul) this.syncVantage(e, alpha);
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
    this.syncKegs(alpha, puff);
  }

  private syncVantage(e: Entity, alpha: number): void {
    const w = this.world;
    const h = e.hero!;
    const hk = w.heroDef(h.type).hooks;
    const on = w.time - (h.stillAt ?? -99) >= (hk.vantageStill ?? 1) && !h.dead;
    const was = this.vantage.get(e.id) ?? false;
    this.vantage.set(e.id, on);
    if (!this.fx || !on) return;
    const p = this.viewPos(e, alpha);
    if (!was) {
      shockwave(this.fx, FX.shock, p.x, p.y + 0.15, p.z, UP, 0.3, 1.4, 0.35, 0xffe08a, 0.7);
      emit(this.fx, { tex: FX.twinkle, n: 5, x: p.x, y: p.y + 1.2 * this.heroScale, z: p.z, color: 0xfff0a0, size: [0.25, 0.4], life: [0.4, 0.6], speed: [0.5, 1.5], up: [0.5, 1.2], additive: true, jitter: 0.6 });
    }
    if (Math.random() < 0.08) emit(this.fx, { tex: FX.twinkle, n: 1, x: p.x, y: p.y + (1.1 + Math.random() * 0.7) * this.heroScale, z: p.z, color: 0xffe890, size: [0.18, 0.3], life: [0.35, 0.5], speed: [0, 0.3], up: [0.3, 0.6], additive: true, jitter: 0.7 });
  }

  private syncPip(e: Entity, alpha: number, dt: number, puff: boolean): void {
    const w = this.world;
    const ps = e.hero!.pip!;
    const costume = costumeOfPlayer(e.hero!.player);
    let v = this.pips.get(e.id);
    if (v && v.costume !== costume) {
      this.root.remove(v.obj);
      v = undefined;
    }
    if (!v) {
      const m = pipModel(costume);
      v = { ...m, prev: new THREE.Vector3(ps.x, ps.y, ps.z), latchT: 0, costume };
      this.root.add(m.obj);
      this.pips.set(e.id, v);
    }
    const pos = new THREE.Vector3(ps.px + (ps.x - ps.px) * alpha, ps.py + (ps.y - ps.py) * alpha, ps.pz + (ps.z - ps.pz) * alpha);
    let flap = 18;
    let yaw: number | null = null;
    let pitch = 0;
    if (ps.phase === "on") {
      const tgt = w.getAny(ps.target);
      if (tgt) {
        const tp = this.viewPos(tgt, alpha);
        const head = tgt.hero ? 3.05 * (this.heroScale / 1.5) : tgt.neutral ? 4.4 : tgt.unit?.type === "heavy" ? 2.4 : 1.95;
        v.latchT += dt;
        const a = this.t * 2.6 + e.id;
        const r = 0.55;
        const peckCycle = (this.t * 1.8) % 1;
        const peck = peckCycle < 0.18 ? Math.sin((peckCycle / 0.18) * Math.PI) : 0;
        pos.set(tp.x + Math.cos(a) * r * (1 - peck * 0.7), tp.y + head + 0.25 + Math.sin(this.t * 7) * 0.06 - peck * 0.3, tp.z + Math.sin(a) * r * (1 - peck * 0.7));
        yaw = peck > 0.05 ? Math.atan2(tp.x - pos.x, tp.z - pos.z) : Math.atan2(-Math.sin(a), Math.cos(a));
        pitch = peck * 0.9;
        flap = 14;
        if (peck > 0.9 && this.fx && Math.random() < 0.5) emit(this.fx, { tex: WREN.feather, n: 1, x: tp.x, y: tp.y + head, z: tp.z, size: [0.16, 0.24], life: [0.6, 0.9], speed: [0.5, 1.2], up: [0.2, 0.8], gravity: 1.5, drag: 1, spin: 5 });
      }
    } else {
      v.latchT = 0;
      if (ps.phase === "back") {
        const sh = this.viewPos(e, alpha);
        const d = Math.hypot(sh.x - pos.x, sh.z - pos.z);
        if (d < 2) pos.y = Math.max(pos.y, sh.y + 2.1 * (this.heroScale / 1.5));
      }
    }
    const vel = pos.clone().sub(v.prev);
    if (yaw === null && vel.lengthSq() > 1e-5) {
      yaw = Math.atan2(vel.x, vel.z);
      pitch = -Math.atan2(vel.y, Math.hypot(vel.x, vel.z)) * 0.6;
    }
    v.prev.copy(pos);
    v.obj.position.copy(pos);
    if (yaw !== null) {
      let d = yaw - v.obj.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      v.obj.rotation.y += d * Math.min(1, dt * 14);
    }
    v.obj.rotation.x = pitch;
    v.wings.forEach((wg, i) => {
      const s = wg.name.startsWith("wing_L") ? 1 : -1;
      wg.rotation.z = v!.base[i] + s * Math.sin(this.t * flap) * 0.7;
    });
    if (this.fx && puff && ps.phase !== "on" && vel.lengthSq() > 1e-4) emit(this.fx, { tex: FX.twinkle, n: 1, x: pos.x, y: pos.y, z: pos.z, color: 0xff8060, size: [0.12, 0.2], life: [0.25, 0.35], speed: [0, 0.2], additive: true });
  }

  private syncRider(e: Entity, alpha: number, puff: boolean): void {
    let o = this.riders.get(e.id);
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
      this.root.add(o);
      this.riders.set(e.id, o);
    }
    const p = this.viewPos(e, alpha);
    const a = e.hero!.action!;
    o.position.set(p.x, p.y, p.z);
    o.rotation.y = Math.atan2(a.dirX, a.dirZ);
    const roll = o.getObjectByName("roll");
    if (roll) roll.rotation.x = this.t * 18;
    if (this.fx && puff) {
      emit(this.fx, { tex: FOAM, n: 1, x: p.x - a.dirX * 0.8, y: p.y + 0.3, z: p.z - a.dirZ * 0.8, size: [0.4, 0.6], grow: 1.5, life: [0.4, 0.6], speed: [0.3, 1], up: [0.5, 1.2], gravity: 3 });
      emit(this.fx, { tex: ALE_DROP, n: 2, x: p.x - a.dirX * 0.6, y: p.y + 0.5, z: p.z - a.dirZ * 0.6, size: [0.15, 0.22], life: [0.4, 0.6], speed: [1, 2.5], up: [1.5, 3], gravity: 12, floor: p.y + 0.05 });
      emit(this.fx, { tex: FX.dust, n: 1, x: p.x, y: p.y + 0.2, z: p.z, size: [0.6, 0.9], grow: 1.6, life: [0.35, 0.5], speed: [0.5, 1.2], flatSpread: true, drag: 3, opacity: 0.7 });
    }
  }

  private syncKegs(alpha: number, puff: boolean): void {
    const w = this.world;
    const seen = new Set<number>();
    for (const k of w.kegs) {
      seen.add(k.id);
      let v = this.kegs.get(k.id);
      if (!v) {
        const owner = w.getAny(k.ownerId);
        const obj = kegModel(k.kind, costumeOfPlayer(owner?.hero?.player));
        v = { obj };
        if (k.kind === "powder") {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32), new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
          ring.rotation.x = -Math.PI / 2;
          ring.visible = false;
          v.ring = ring;
          this.root.add(ring);
          const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: FX.twinkle, color: 0xffc040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          spark.scale.setScalar(0.4);
          v.spark = spark;
          this.root.add(spark);
        }
        this.root.add(obj);
        this.kegs.set(k.id, v);
      }
      const o = v.obj;
      const time = w.time - w.dt * (1 - alpha);
      if (!k.landed || time < k.start + k.dur) {
        const f = Math.max(0, Math.min(1, (time - k.start) / k.dur));
        const d = Math.hypot(k.toX - k.fromX, k.toZ - k.fromZ);
        const hgt = 1.2 + d * 0.28;
        o.position.set(k.fromX + (k.toX - k.fromX) * f, k.fromY + (k.toY - k.fromY) * f + hgt * 4 * f * (1 - f), k.fromZ + (k.toZ - k.fromZ) * f);
        o.rotation.set(f * 7, Math.atan2(k.toX - k.fromX, k.toZ - k.fromZ), f * 3);
        if (this.fx && puff && (k.kind === "powder" || k.kind === "minipowder")) emit(this.fx, { tex: FX.twinkle, n: 1, x: o.position.x, y: o.position.y + 0.5, z: o.position.z, color: 0xffb040, size: [0.2, 0.3], life: [0.2, 0.3], speed: [0.5, 1.5], gravity: 4, additive: true });
        else if (this.fx && puff && Math.random() < 0.5) emit(this.fx, { tex: ALE_DROP, n: 1, x: o.position.x, y: o.position.y + 0.4, z: o.position.z, size: [0.14, 0.2], life: [0.4, 0.6], speed: [0.2, 0.6], gravity: 10 });
        if (v.ring) v.ring.visible = false;
        if (v.spark) v.spark.position.set(o.position.x, o.position.y + 1.1, o.position.z);
      } else {
        const fuse = Math.max(0.05, k.fuseAt - (k.start + k.dur));
        const heat = Math.max(0, Math.min(1, 1 - (k.fuseAt - time) / fuse));
        o.position.set(k.toX, k.toY, k.toZ);
        o.rotation.set(Math.sin(this.t * 40) * 0.08 * heat, o.rotation.y, Math.cos(this.t * 37) * 0.08 * heat);
        o.scale.setScalar(o.userData.s0 ?? (o.userData.s0 = o.scale.x));
        o.scale.multiplyScalar(1 + heat * 0.15 + (Math.sin(this.t * (8 + heat * 20)) > 0 ? 0.03 : 0));
        const r = w.heroDef(w.getAny(k.ownerId)?.hero?.type ?? "friar").abilities.r.radius ?? 3.2;
        if (v.ring) {
          v.ring.visible = true;
          v.ring.position.set(k.toX, k.toY + 0.12, k.toZ);
          v.ring.scale.setScalar(r * (0.4 + 0.6 * heat));
          (v.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.4 * (Math.sin(this.t * (10 + heat * 20)) > 0 ? 1 : 0.3);
        }
        if (v.spark) {
          v.spark.position.set(k.toX, k.toY + 1.25, k.toZ);
          v.spark.scale.setScalar(0.35 + Math.random() * 0.35);
        }
        if (this.fx && puff) {
          emit(this.fx, { tex: FX.twinkle, n: 2, x: k.toX, y: k.toY + 1.25, z: k.toZ, color: 0xffa030, size: [0.15, 0.28], life: [0.2, 0.35], speed: [1, 2.5], up: [1, 2], gravity: 6, additive: true });
          emit(this.fx, { tex: FRIAR.spark, n: 1, x: k.toX, y: k.toY + 1.3, z: k.toZ, additive: true, color: 0xffffff, size: [0.25, 0.4], grow: 0.6, life: [0.2, 0.35], speed: [0.5, 1.5], up: [0.6, 1.2], opacity: 0.9 });
        }
      }
    }
    for (const [id, v] of this.kegs) {
      if (seen.has(id)) continue;
      this.root.remove(v.obj);
      if (v.ring) {
        this.root.remove(v.ring);
        v.ring.geometry.dispose();
      }
      if (v.spark) this.root.remove(v.spark);
      this.kegs.delete(id);
    }
  }
}

function streak(h: FxHost, tex: THREE.Texture, x0: number, y: number, z0: number, x1: number, z1: number, n: number, color: THREE.ColorRepresentation, width: number, dur = 0.35, additive = true): void {
  const rot = Math.atan2(-(z1 - z0), x1 - x0);
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    h.after(f * 0.1, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.material.rotation = rot;
      s.position.set(x0 + (x1 - x0) * f, y, z0 + (z1 - z0) * f);
      h.add(s, dur, (q) => {
        s.scale.set(width * (1 + q * 0.4), width * 0.45 * (1 - q * 0.5), 1);
        s.material.opacity = 0.9 * (1 - q);
      });
    });
  }
}

function beam(h: FxHost, x0: number, y: number, z0: number, x1: number, z1: number, width: number, dur: number, color: THREE.ColorRepresentation): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.1) return;
  const geo = new THREE.PlaneGeometry(len, width);
  const mat = new THREE.MeshBasicMaterial({ map: BEAM, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const g = new THREE.Group();
  for (let k = 0; k < 2; k++) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = k ? Math.PI / 2 : 0;
    g.add(m);
  }
  g.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  g.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  h.add(g, dur, (k) => {
    mat.opacity = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    g.scale.set(1, 1 + k * 0.6, 1 + k * 0.6);
  });
}

function flyingArrow(h: FxHost, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, dur: number, scale: number, glow?: number): void {
  const a = arrowMesh(scale, glow);
  const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
  a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  h.add(a, dur, (k) => a.position.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k));
}

function rainArrow(h: FxHost, x: number, gy: number, z: number, lean: number): void {
  const a = arrowMesh(1.05);
  const top = new THREE.Vector3(x + lean * 3, gy + 11, z + lean * 1.5);
  const end = new THREE.Vector3(x, gy + 0.35, z);
  const dir = end.clone().sub(top).normalize();
  a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const fall = 0.28;
  const stay = 1.4;
  h.add(a, fall + stay, (k) => {
    const t = k * (fall + stay);
    if (t < fall) a.position.lerpVectors(top, end, t / fall);
    else {
      a.position.copy(end);
      const fade = Math.max(0, (t - fall - stay * 0.6) / (stay * 0.4));
      a.position.y = end.y - fade * 0.6;
    }
  });
}

KITS.marksman = {
  trail: 0xa8e070,
  hit(h, ev, src, dx, dz) {
    const n = new THREE.Vector3(dx, 0, dz);
    if (n.lengthSq() < 1e-4) n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    n.normalize();
    const px = ev.x - n.x * 0.3;
    const pz = ev.z - n.z * 0.3;
    const py = ev.y + 0.3;
    emit(h, { tex: FX.burst2, n: 1, x: px, y: py, z: pz, color: 0xfff0c0, size: ev.big ? [1.5, 1.5] : [0.8, 0.8], grow: 1.5, life: [0.1, 0.1], speed: [0, 0], additive: true, order: 6 });
    emit(h, { tex: WREN.splinters, n: ev.big ? 4 : 2, x: px, y: py, z: pz, size: [0.25, 0.4], life: [0.35, 0.55], speed: [3, 6], dir: { x: n.x, y: 0.5, z: n.z }, cone: 0.9, gravity: 14, spin: 10 });
    emit(h, { tex: FX.twinkle, n: ev.big ? 6 : 3, x: px, y: py, z: pz, color: 0xe8ffb0, size: [0.2, 0.35], life: [0.15, 0.3], speed: [4, 8], dir: { x: n.x, y: 0.3, z: n.z }, cone: 1, gravity: 10, additive: true });
    tumblers(h, [WREN.feather], ev.big ? 3 : 1, px, py + 0.2, pz, { speed: [0.5, 1.5], up: [0.5, 1.5], size: [0.22, 0.32], life: [0.8, 1.2] });
    if (ev.big) {
      shockwave(h, FX.shock, px, py, pz, n, 0.25, 1.6, 0.25, 0xd8ffb0, 0.85);
      h.shake = Math.max(h.shake, 0.2);
    }
    void src;
    return true;
  },
  projectile(h, style) {
    if (style !== "longarrow" && style !== "skyshot") return null;
    void h;
    return arrowMesh(style === "skyshot" ? 0.95 : 0.8, style === "skyshot" ? 0xffd860 : undefined);
  },
  projectileTick(h, obj, x, y, z) {
    const prev = obj.userData.prev as THREE.Vector3 | undefined;
    if (prev) {
      const d = new THREE.Vector3(x - prev.x, y - prev.y, z - prev.z);
      if (d.lengthSq() > 1e-6) obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    }
    obj.userData.prev = new THREE.Vector3(x, y, z);
    if (Math.random() < 0.5) emit(h, { tex: FX.twinkle, n: 1, x, y, z, color: obj.children.length > 4 ? 0xffd860 : 0xf0ffe0, size: [0.12, 0.2], life: [0.15, 0.25], speed: [0, 0.2], additive: true });
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "pipLaunch":
        tumblers(h, [WREN.feather], 3, ev.x, ev.y, ev.z, { speed: [0.5, 1.5], up: [0.3, 1], size: [0.18, 0.26], life: [0.8, 1.1] });
        emit(h, { tex: FX.twinkle, n: 4, x: ev.x, y: ev.y, z: ev.z, color: 0xff7050, size: [0.2, 0.3], life: [0.25, 0.4], speed: [1, 2], additive: true });
        return true;
      case "pipLatch":
        decal(h, MARK_RING, ev.x, gy, ev.z, 1.1, 0.7, { grow: 0.15, spin: 2 });
        emit(h, { tex: WREN.feather, n: 6, x: ev.x, y: ev.y + 2.6, z: ev.z, size: [0.18, 0.28], life: [0.8, 1.2], speed: [1, 2.5], up: [0.5, 1.5], gravity: 2, drag: 1, spin: 6 });
        emit(h, { tex: FX.burst2, n: 1, x: ev.x, y: ev.y + 2.5, z: ev.z, color: 0xff8060, size: [1.2, 1.2], grow: 1.4, life: [0.15, 0.15], speed: [0, 0], additive: true });
        return true;
      case "pipPeck":
        emit(h, { tex: FX.twinkle, n: 3, x: ev.x, y: ev.y + 2.3, z: ev.z, color: 0xff6a50, size: [0.2, 0.32], life: [0.2, 0.3], speed: [1.5, 3], gravity: 6, additive: true });
        emit(h, { tex: WREN.feather, n: 1, x: ev.x, y: ev.y + 2.4, z: ev.z, size: [0.16, 0.22], life: [0.6, 0.9], speed: [0.5, 1.2], up: [0.3, 0.8], gravity: 1.5, spin: 6 });
        emit(h, { tex: FX.burst2, n: 1, x: ev.x, y: ev.y + 2.1, z: ev.z, color: 0xffb0a0, size: [0.6, 0.6], grow: 1.3, life: [0.08, 0.08], speed: [0, 0], additive: true });
        return true;
      case "pipRake": {
        const y = ev.y + 1.6;
        emit(h, { tex: WREN.claws, n: 1, x: ev.x, y: y + 0.4, z: ev.z, size: [1.5, 1.5], grow: 1.25, life: [0.3, 0.3], speed: [0, 0], order: 5 });
        emit(h, { tex: WREN.feathers, n: 1, x: ev.x, y: y + 0.7, z: ev.z, size: [1.1, 1.1], grow: 1.6, life: [0.45, 0.45], speed: [0, 0.3] });
        emit(h, { tex: WREN.feather, n: 8, x: ev.x, y: y + 0.6, z: ev.z, size: [0.2, 0.32], life: [0.8, 1.3], speed: [2, 4], up: [0.5, 2], gravity: 2, drag: 1, spin: 8 });
        const secs = ev.seconds ?? 2.5;
        for (let k = 0; k * 0.35 < secs; k++) {
          h.after(0.1 + k * 0.35, () => {
            const o = ev.id !== undefined ? h.world?.get(ev.id) : undefined;
            if (ev.id !== undefined && !o?.alive) return;
            emit(h, { tex: WREN.dizzy, n: 1, x: o ? o.transform.pos.x : ev.x, y: (o ? o.transform.y : ev.y) + 2.3, z: o ? o.transform.pos.z : ev.z, size: [0.85, 0.85], life: [0.45, 0.45], speed: [0, 0], spin: 4 });
          });
        }
        return true;
      }
      case "pipHome":
        tumblers(h, [WREN.feather], 2, ev.x, ev.y, ev.z, { speed: [0.3, 0.8], up: [0.2, 0.6], size: [0.16, 0.22], life: [0.7, 1] });
        return true;
      case "volley": {
        const r = ev.radius ?? 3.5;
        const secs = ev.seconds ?? 2.35;
        decal(h, VOLLEY_RING, ev.x, gy, ev.z, r * 1.05, secs + 0.3, { grow: 0.2, spin: 0.4, opacity: 0.9 });
        decal(h, FX.shock, ev.x, gy, ev.z, r, secs + 0.3, { grow: 0.25, additive: true, color: 0xff9a50, opacity: 0.45 });
        const lean = Math.random() - 0.5;
        const total = Math.round(r * r * 3.2);
        for (let i = 0; i < total; i++) {
          const at = 0.12 + Math.random() * (secs - 0.15);
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * r;
          const x = ev.x + Math.cos(a) * d;
          const z = ev.z + Math.sin(a) * d;
          h.after(at, () => rainArrow(h, x, ground(h, x, z, ev.y), z, lean));
          h.after(at + 0.28, () => emit(h, { tex: FX.dust, n: 1, x, y: ground(h, x, z, ev.y) + 0.3, z, size: [0.45, 0.7], grow: 1.6, life: [0.3, 0.45], speed: [0.4, 1], flatSpread: true, drag: 3, opacity: 0.75 }));
        }
        return true;
      }
      case "volleyWave": {
        const r = ev.radius ?? 3.5;
        shockwave(h, FX.shock, ev.x, gy + 0.15, ev.z, UP, r * 0.3, r, 0.3, 0xffe0b0, 0.5);
        emit(h, { tex: WREN.splinters, n: 4, x: ev.x, y: gy + 0.4, z: ev.z, size: [0.2, 0.35], life: [0.3, 0.5], speed: [2, 4], up: [2, 4], gravity: 14, spin: 10, jitter: r * 1.2 });
        h.shake = Math.max(h.shake, 0.1);
        return true;
      }
      case "powershot": {
        const tx = ev.tx ?? ev.x;
        const tz = ev.tz ?? ev.z;
        const dx = tx - ev.x;
        const dz = tz - ev.z;
        const dl = Math.hypot(dx, dz) || 1;
        emit(h, { tex: FX.burst, n: 1, x: ev.x + (dx / dl) * 0.9, y: gy + 1.4, z: ev.z + (dz / dl) * 0.9, color: 0xe0ffb0, size: [1.6, 1.6], grow: 1.4, life: [0.12, 0.12], speed: [0, 0], additive: true });
        shockwave(h, FX.shock, ev.x + (dx / dl) * 0.9, gy + 1.4, ev.z + (dz / dl) * 0.9, new THREE.Vector3(dx / dl, 0, dz / dl), 0.2, 1.4, 0.25, 0xd8ffb0, 0.9);
        streak(h, FX.streak, ev.x, gy + 1.4, ev.z, tx, tz, 7, 0xd8ffb0, 2.2);
        h.shake = Math.max(h.shake, 0.15);
        return true;
      }
      case "heartseeker": {
        const tx = ev.tx ?? ev.x;
        const tz = ev.tz ?? ev.z;
        const dx = tx - ev.x;
        const dz = tz - ev.z;
        const dl = Math.hypot(dx, dz) || 1;
        const y = gy + 1.45;
        beam(h, ev.x, y, ev.z, tx, tz, 0.9, 0.55, 0xff9a70);
        beam(h, ev.x, y, ev.z, tx, tz, 0.35, 0.4, 0xffffff);
        flyingArrow(h, ev.x, y, ev.z, tx, ground(h, tx, tz, ev.y) + 1.45, tz, 0.22, 1.6, 0xff7050);
        emit(h, { tex: HEART, n: 1, x: ev.x + (dx / dl) * 1.2, y, z: ev.z + (dz / dl) * 1.2, size: [1.8, 1.8], grow: 1.6, life: [0.35, 0.35], speed: [0, 0], additive: true, order: 7 });
        shockwave(h, FX.shock, ev.x + (dx / dl) * 1.2, y, ev.z + (dz / dl) * 1.2, new THREE.Vector3(dx / dl, 0, dz / dl), 0.3, 2.6, 0.35, 0xffb090, 1);
        for (let k = 1; k <= 8; k++) {
          const f = k / 8;
          h.after(f * 0.2, () => emit(h, { tex: FX.twinkle, n: 3, x: ev.x + dx * f, y, z: ev.z + dz * f, color: 0xffc0a0, size: [0.25, 0.45], life: [0.3, 0.5], speed: [0.5, 2], additive: true, jitter: 0.6 }));
        }
        h.after(0.22, () => {
          const ty = ground(h, tx, tz, ev.y);
          emit(h, { tex: FX.burst, n: 1, x: tx, y: ty + 1.2, z: tz, color: 0xffd0a0, size: [2.4, 2.4], grow: 1.3, life: [0.2, 0.2], speed: [0, 0], additive: true });
          emit(h, { tex: FX.dust, n: 5, x: tx, y: ty + 0.4, z: tz, size: [0.8, 1.2], grow: 1.8, life: [0.5, 0.8], speed: [1, 2.5], flatSpread: true, drag: 3, opacity: 0.85 });
        });
        h.shake = Math.max(h.shake, 0.45);
        return true;
      }
      case "ricochet": {
        const tx = ev.tx ?? ev.x;
        const tz = ev.tz ?? ev.z;
        beam(h, ev.x, ev.y + 1.4, ev.z, tx, tz, 0.5, 0.35, 0xffb090);
        flyingArrow(h, ev.x, ev.y + 1.4, ev.z, tx, ground(h, tx, tz, ev.y) + 1.3, tz, 0.12, 1.2, 0xff7050);
        return true;
      }
      case "skyshot":
        tumblers(h, [WREN.feather, WREN.leaves], 4, ev.x, gy + 0.6, ev.z, { speed: [0.8, 2], up: [1, 2], size: [0.25, 0.35], life: [0.9, 1.3] });
        emit(h, { tex: FX.dust, n: 4, x: ev.x, y: gy + 0.3, z: ev.z, size: [0.8, 1.1], grow: 1.7, life: [0.4, 0.6], speed: [1, 2.5], flatSpread: true, drag: 3, opacity: 0.85 });
        return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "heartseeker") {
      decal(h, HEART_RING, ev.x, gy, ev.z, 1.7, 1.2, { grow: 0.3, spin: 2.5, opacity: 0.85 });
      for (let k = 0; k < 9; k++) {
        h.after(k * 0.09, () => {
          const a = Math.random() * Math.PI * 2;
          const bx = ev.x + ev.dirX * 0.9;
          const bz = ev.z + ev.dirZ * 0.9;
          emit(h, { tex: FX.twinkle, n: 2, x: bx + Math.cos(a) * 1.4, y: gy + 1.5 + (Math.random() - 0.5), z: bz + Math.sin(a) * 1.4, color: 0xffb090, size: [0.25, 0.4], life: [0.25, 0.3], speed: [4.5, 5], dir: { x: -Math.cos(a), y: 0, z: -Math.sin(a) }, cone: 0.1, additive: true });
          emit(h, { tex: HEART, n: 1, x: bx, y: gy + 1.5, z: bz, size: [0.5 + k * 0.08, 0.5 + k * 0.08], life: [0.12, 0.12], speed: [0, 0], additive: true, opacity: 0.6 });
        });
      }
    }
    if (ev.phase === "fire" && ev.kind === "volley") {
      for (let k = 0; k < 6; k++) {
        const x0 = ev.x + ev.dirX * 0.5;
        const z0 = ev.z + ev.dirZ * 0.5;
        h.after(k * 0.04, () => flyingArrow(h, x0, gy + 1.8, z0, x0 + ev.dirX * 2 + (Math.random() - 0.5), gy + 9, z0 + ev.dirZ * 2 + (Math.random() - 0.5), 0.3, 0.9));
      }
    }
    if (ev.phase === "fire" && ev.kind === "pip") emit(h, { tex: FX.twinkle, n: 3, x: ev.x, y: gy + 2.2, z: ev.z, color: 0xff7050, size: [0.2, 0.3], life: [0.2, 0.3], speed: [1, 2], additive: true });
  },
};

function aleSplash(h: FxHost, x: number, gy: number, z: number, r: number, big: boolean): void {
  emit(h, { tex: ALE_SPLASH, n: 1, x, y: gy + 0.6, z, size: [r * 1.4, r * 1.4], grow: 1.4, life: [0.3, 0.3], speed: [0, 0], order: 5 });
  emit(h, { tex: FX.splash, n: big ? 3 : 1, x, y: gy + 0.5, z, color: 0xffc860, size: [r * 0.8, r], grow: 1.5, life: [0.35, 0.5], speed: [0.2, 0.6], up: [0.5, 1] });
  shockwave(h, FX.shock, x, gy + 0.15, z, UP, 0.3, r, 0.4, 0xffe6a0, 0.8);
  emit(h, { tex: ALE_DROP, n: big ? 16 : 6, x, y: gy + 0.6, z, size: [0.18, 0.3], life: [0.5, 0.8], speed: [2, r * 1.6], up: [2.5, 5], gravity: 14, floor: gy + 0.05 });
  emit(h, { tex: FOAM, n: big ? 6 : 2, x, y: gy + 0.4, z, size: [0.5, 0.8], grow: 1.5, life: [0.5, 0.8], speed: [1, 2.5], flatSpread: true, drag: 3 });
  emit(h, { tex: BUBBLE, n: big ? 10 : 4, x, y: gy + 0.3, z, size: [0.18, 0.32], life: [0.6, 1.1], speed: [0.2, 0.6], up: [0.6, 1.4], jitter: r * 1.2 });
  emit(h, { tex: FRIAR.heal, n: big ? 6 : 2, x, y: gy + 0.8, z, size: [0.4, 0.55], life: [0.9, 1.2], speed: [0.2, 0.6], up: [1.2, 2], jitter: r });
}

function kegBoom(h: FxHost, x: number, gy: number, z: number, r: number, big: boolean): void {
  emit(h, { tex: FRIAR.blast, n: 1, x, y: gy + 1, z, size: [r * 1.3, r * 1.3], grow: 1.4, life: [0.2, 0.2], speed: [0, 0], order: 6 });
  emit(h, { tex: FX.fire, n: big ? 10 : 4, x, y: gy + 0.8, z, size: [0.9, 1.5], grow: 1.6, life: [0.3, 0.55], speed: [1.5, r * 1.6], up: [1, 2.5], additive: true });
  emit(h, { tex: FRIAR.smoke, n: big ? 10 : 4, x, y: gy + 1, z, size: [1.2, 1.9], grow: 1.8, life: [0.9, 1.5], speed: [1, 2.5], up: [0.8, 1.6], drag: 1.5, opacity: 0.85 });
  emit(h, { tex: FRIAR.spark, n: big ? 12 : 5, x, y: gy + 0.8, z, size: [0.15, 0.25], life: [0.6, 1], speed: [3, 7], up: [2, 5], gravity: 9, additive: true });
  emit(h, { tex: FRIAR.stave, n: big ? 6 : 2, x, y: gy + 0.6, z, size: [0.45, 0.7], life: [0.7, 1], speed: [3, 6], up: [4, 7], gravity: 16, spin: 10, floor: gy + 0.1 });
  shockwave(h, FX.shock, x, gy + 0.3, z, UP, 0.4, r * 1.15, 0.35, 0xffb060, 0.95);
  if (big) {
    decal(h, FX.crack, x, gy, z, r * 0.75, 2.2, { grow: 0.06, opacity: 0.85 });
    chunks(h, 5, x, gy + 0.3, z, { size: [0.12, 0.22], speed: [2, 5], up: [4, 7] });
  }
  h.shake = Math.max(h.shake, big ? 0.5 : 0.2);
}

KITS.friar = {
  trail: 0xffc850,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.6)) return false;
    const n = new THREE.Vector3(dx, 0, dz);
    if (n.lengthSq() < 1e-4) n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    n.normalize();
    const px = ev.x - n.x * 0.35;
    const pz = ev.z - n.z * 0.35;
    const py = ev.y + 0.3;
    const gy = ground(h, ev.x, ev.z, ev.y - 1);
    emit(h, { tex: FX.burst2, n: 1, x: px, y: py, z: pz, color: 0xfff0c0, size: ev.big ? [1.5, 1.5] : [1, 1], grow: 1.6, life: [0.1, 0.1], speed: [0, 0], additive: true, order: 6 });
    emit(h, { tex: FX.burst, n: 1, x: px, y: py, z: pz, color: 0xffe0a0, size: ev.big ? [2.2, 2.2] : [1.3, 1.3], grow: 1.3, life: [0.18, 0.18], speed: [0, 0], order: 5 });
    emit(h, { tex: ALE_DROP, n: ev.big ? 8 : 4, x: px, y: py + 0.2, z: pz, size: [0.16, 0.26], life: [0.45, 0.7], speed: [2, 4], up: [1.5, 3], dir: { x: n.x, y: 0.3, z: n.z }, cone: 1, gravity: 14, floor: gy + 0.05 });
    emit(h, { tex: FOAM, n: ev.big ? 2 : 1, x: px, y: py, z: pz, size: [0.4, 0.6], grow: 1.6, life: [0.3, 0.45], speed: [0.5, 1.2] });
    emit(h, { tex: FX.dust, n: ev.big ? 2 : 1, x: ev.x, y: gy + 0.35, z: ev.z, size: [0.7, 1], grow: 1.8, life: [0.4, 0.6], speed: [1, 2], flatSpread: true, drag: 3, opacity: 0.8 });
    if (ev.big) shockwave(h, FX.shock, px, py, pz, n, 0.25, 1.8, 0.28, 0xffe0a0, 0.9);
    h.shake = Math.max(h.shake, ev.big ? 0.28 : 0.1);
    return true;
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "kegThrow":
      case "powderThrow":
        emit(h, { tex: FX.swoosh, n: 1, x: ev.x, y: ev.y, z: ev.z, color: 0xfff0d0, size: [1.2, 1.2], grow: 1.3, life: [0.18, 0.18], speed: [0, 0], opacity: 0.8 });
        return true;
      case "kegSplash":
        aleSplash(h, ev.x, gy, ev.z, ev.radius ?? 3, true);
        h.shake = Math.max(h.shake, 0.15);
        return true;
      case "kegSplashSmall":
        aleSplash(h, ev.x, gy, ev.z, ev.radius ?? 2, false);
        return true;
      case "kegLand":
        emit(h, { tex: FX.dust, n: 4, x: ev.x, y: gy + 0.3, z: ev.z, size: [0.7, 1], grow: 1.7, life: [0.4, 0.6], speed: [1, 2], flatSpread: true, drag: 3, opacity: 0.85 });
        h.shake = Math.max(h.shake, 0.08);
        return true;
      case "kegBoom":
        kegBoom(h, ev.x, gy, ev.z, ev.radius ?? 3.2, true);
        return true;
      case "kegPop":
        kegBoom(h, ev.x, gy, ev.z, ev.radius ?? 2, false);
        return true;
      case "brewfest": {
        const r = ev.radius ?? 7;
        emit(h, { tex: FX.dust, n: 12, x: ev.x, y: gy + 0.4, z: ev.z, size: [1, 1.5], grow: 1.8, life: [0.5, 0.9], speed: [2, 4.5], flatSpread: true, drag: 3, opacity: 0.85 });
        shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.5, r, 0.6, 0xffd070, 0.85);
        decal(h, FRIAR.hopRing, ev.x, gy + 0.02, ev.z, r, 1.0, { grow: 0.5, spin: 0.5, opacity: 0.8 });
        emit(h, { tex: FOAM, n: 10, x: ev.x, y: gy + 2.4, z: ev.z, size: [0.5, 0.9], grow: 1.4, life: [0.7, 1.1], speed: [1.5, 3.5], up: [3, 5], gravity: 9 });
        emit(h, { tex: ALE_DROP, n: 18, x: ev.x, y: gy + 2.4, z: ev.z, size: [0.2, 0.32], life: [0.7, 1.1], speed: [2, 4], up: [3, 6], gravity: 12, floor: gy + 0.05 });
        emit(h, { tex: FRIAR.cheers, n: 8, x: ev.x, y: gy + 3, z: ev.z, color: 0xffe090, size: [0.3, 0.45], life: [0.6, 0.9], speed: [1.5, 3], up: [1, 2.5], gravity: 4, additive: true });
        h.shake = Math.max(h.shake, 0.35);
        return true;
      }
      case "lastCall": {
        const r = ev.radius ?? 7;
        emit(h, { tex: ALE_SPLASH, n: 1, x: ev.x, y: gy + 1.5, z: ev.z, size: [r, r], grow: 1.4, life: [0.4, 0.4], speed: [0, 0] });
        shockwave(h, FX.shock, ev.x, gy + 0.3, ev.z, UP, 0.5, r, 0.5, 0xffd070, 1);
        emit(h, { tex: FOAM, n: 14, x: ev.x, y: gy + 1, z: ev.z, size: [0.6, 1.1], grow: 1.5, life: [0.8, 1.2], speed: [2, 5], up: [4, 8], gravity: 10 });
        emit(h, { tex: ALE_DROP, n: 30, x: ev.x, y: gy + 1, z: ev.z, size: [0.2, 0.34], life: [0.8, 1.2], speed: [3, 6], up: [4, 9], gravity: 12, floor: gy + 0.05 });
        emit(h, { tex: FRIAR.heal, n: 10, x: ev.x, y: gy + 0.8, z: ev.z, size: [0.45, 0.6], life: [1, 1.4], speed: [0.3, 1], up: [1.5, 2.5], jitter: r });
        emit(h, { tex: FRIAR.stave, n: 8, x: ev.x, y: gy + 1, z: ev.z, size: [0.5, 0.8], life: [0.8, 1.1], speed: [3, 6], up: [4, 8], gravity: 16, spin: 10, floor: gy + 0.1 });
        h.shake = Math.max(h.shake, 0.5);
        return true;
      }
      case "kegRocket":
        emit(h, { tex: FX.dust, n: 6, x: ev.x, y: gy + 0.3, z: ev.z, size: [0.8, 1.2], grow: 1.7, life: [0.4, 0.7], speed: [1, 2.5], flatSpread: true, drag: 3, opacity: 0.85 });
        emit(h, { tex: FOAM, n: 4, x: ev.x, y: gy + 0.4, z: ev.z, size: [0.5, 0.8], grow: 1.5, life: [0.5, 0.7], speed: [1, 2], up: [1, 2], gravity: 4 });
        return true;
      case "plenty": {
        const w = h.world;
        if (!w) return true;
        const r = ev.radius ?? 7;
        for (const o of w.entities) {
          if (!o.alive || o.team !== ev.team || o.structure || o.hp >= o.maxHp) continue;
          if (Math.hypot(o.transform.pos.x - ev.x, o.transform.pos.z - ev.z) > r) continue;
          emit(h, { tex: BUBBLE, n: 1, x: o.transform.pos.x, y: o.transform.y + 0.8, z: o.transform.pos.z, size: [0.16, 0.26], life: [0.7, 1], speed: [0.1, 0.3], up: [0.8, 1.2], jitter: 0.8 });
          if (o.hero) emit(h, { tex: FRIAR.heal, n: 1, x: o.transform.pos.x, y: o.transform.y + 1.6, z: o.transform.pos.z, color: 0xffe8a0, size: [0.3, 0.4], life: [0.8, 1], speed: [0.1, 0.3], up: [0.8, 1.2], jitter: 0.5, opacity: 0.85 });
        }
        return true;
      }
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "brewfest") {
      emit(h, { tex: FRIAR.cheers, n: 6, x: ev.x, y: gy + 2.6, z: ev.z, color: 0xffe090, size: [0.25, 0.4], life: [0.4, 0.6], speed: [0.5, 1.5], up: [0.5, 1.2], additive: true, jitter: 0.8 });
    }
  },
};
