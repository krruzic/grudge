// Ghost lantern (sim/mapEvents/lantern.ts): the lantern prop (or a procedural bone-and-soul-fire fallback)
// rising from its pit, drifting on a chain to its spot, haloed with wisps; when taken it flies to the hero, when
// it times out it fades (lanternOut keeps the leaving copies animating). Shares bright, additive materials.
import * as THREE from "three";
import { cacheCanvas } from "../../ui/cacheCanvas";
import { FX, SUMMONER } from "../fx/atlas";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { propParts } from "../props";
import type { MapFx } from "./mapFx";
import { chunks, emit } from "../fx/parts";

export const BONE = new THREE.MeshLambertMaterial({ color: 0xe8dcc0 });
BONE.userData.keep = true;
export const SOUL = new THREE.MeshBasicMaterial({
  color: 0x40ff60,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
SOUL.userData.keep = true;
export const LANTERN_SCALE = 1.45;
export const LANTERN_GLOW = { value: 1 };
export function glowTexture(): THREE.Texture {
  const c = cacheCanvas();
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.scale(4, 4);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.25, "rgba(255,255,255,0.55)");
  r.addColorStop(0.6, "rgba(255,255,255,0.12)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const HALO = new THREE.SpriteMaterial({
  map: glowTexture(),
  color: 0x70ff80,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
HALO.userData.keep = true;
export const DECAL = new THREE.MeshBasicMaterial({
  map: SUMMONER.circle,
  color: 0x70ff80,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  polygonOffset: true,
  polygonOffsetFactor: -2,
});
DECAL.userData.keep = true;
export const CHAIN = new THREE.MeshBasicMaterial({
  color: 0x90ffa0,
  vertexColors: true,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
CHAIN.userData.keep = true;
export const coreGeo = new THREE.IcosahedronGeometry(0.16, 1);
export const decalGeo = new THREE.PlaneGeometry(1, 1);
export let chainCache: THREE.BufferGeometry | null = null;
export function chainGeo(): THREE.BufferGeometry {
  if (chainCache) return chainCache;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const t = new THREE.TorusGeometry(0.11, 0.028, 4, 10);
    t.scale(1, 1.45, 1);
    if (i % 2) t.rotateY(Math.PI / 2);
    t.translate(0, 0.12 + i * 0.27, 0);
    parts.push(t.toNonIndexed());
    t.dispose();
  }
  const m = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  const pos = m.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.max(0, 1 - pos.getY(i) / 2.5);
    col.set([f, f, f], i * 3);
  }
  m.setAttribute("color", new THREE.BufferAttribute(col, 3));
  chainCache = m;
  LANTERN_GEOS.add(m);
  return m;
}
export const LANTERN_GEOS = new Set<THREE.BufferGeometry>([coreGeo, decalGeo]);
export const lanternMats = new Map<THREE.Material, THREE.Material>();
export function lanternMat(src: THREE.Material): THREE.Material {
  let m = lanternMats.get(src);
  if (m) return m;
  const c = (src as THREE.MeshLambertMaterial).clone();
  c.userData.keep = true;
  c.onBeforeCompile = (s) => {
    s.uniforms.uGlow = LANTERN_GLOW;
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlow;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\nfloat gk = smoothstep(0.04, 0.2, diffuseColor.g - max(diffuseColor.r, diffuseColor.b));\ntotalEmissiveRadiance += mix(diffuseColor.rgb, vec3(0.3, 1.0, 0.4) * max(diffuseColor.g, 0.4), 0.6) * gk * uGlow * 1.2;",
      );
  };
  c.customProgramCacheKey = () => "lanternGlow";
  lanternMats.set(src, c);
  m = c;
  return m;
}
export function buildLantern(): THREE.Group {
  const p = propParts("event_lantern");
  if (!p) return buildOldLantern();
  if (!p.geo.boundingBox) p.geo.computeBoundingBox();
  const bb = p.geo.boundingBox!;
  const h = bb.max.y - bb.min.y;
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.name = "pivot";
  pivot.position.y = h * 0.5 * LANTERN_SCALE;
  g.add(pivot);
  const spin = new THREE.Group();
  spin.name = "spin";
  spin.scale.setScalar(LANTERN_SCALE);
  pivot.add(spin);
  const body = new THREE.Mesh(p.geo, lanternMat(p.mat));
  body.position.y = -bb.max.y;
  body.castShadow = true;
  spin.add(body);
  const core = new THREE.Mesh(coreGeo, SOUL);
  core.name = "core";
  core.position.y = -bb.max.y + bb.min.y + h * 0.4;
  spin.add(core);
  const halo = new THREE.Sprite(HALO);
  halo.name = "halo";
  halo.position.copy(core.position);
  halo.scale.setScalar(2.4);
  halo.renderOrder = 4;
  spin.add(halo);
  const chain = new THREE.Mesh(chainGeo(), CHAIN);
  chain.name = "chain";
  chain.position.y = 0.05;
  pivot.add(chain);
  const ring = new THREE.Mesh(decalGeo, DECAL);
  ring.name = "decal";
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 3;
  g.add(ring);
  return g;
}
export function buildOldLantern(): THREE.Group {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = new THREE.CylinderGeometry(0.045, 0.06, 0.9, 5);
    b.translate(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32);
    parts.push(b);
    const k = new THREE.SphereGeometry(0.07, 5, 4);
    k.translate(Math.cos(a) * 0.32, 0.46, Math.sin(a) * 0.32);
    parts.push(k);
  }
  for (const y of [-0.48, 0.5]) {
    const r = new THREE.CylinderGeometry(y > 0 ? 0.28 : 0.4, y > 0 ? 0.42 : 0.3, 0.14, 8);
    r.translate(0, y, 0);
    parts.push(r);
  }
  const skull = new THREE.SphereGeometry(0.2, 7, 5);
  skull.scale(1, 0.9, 1.1);
  skull.translate(0, 0.72, 0);
  parts.push(skull);
  const hook = new THREE.TorusGeometry(0.12, 0.03, 4, 8);
  hook.translate(0, 0.95, 0);
  parts.push(hook);
  const cage = new THREE.Mesh(
    mergeGeometries(
      parts.map((q) => q.toNonIndexed()),
      false,
    )!,
    BONE,
  );
  parts.forEach((q) => q.dispose());
  g.add(cage);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), SOUL);
  core.name = "core";
  g.add(core);
  g.scale.setScalar(1.5);
  return g;
}
export function syncLanternOut(mf: MapFx, time: number): void {
  for (let i = mf.lanternOut.length - 1; i >= 0; i--) {
    const o = mf.lanternOut[i];
    const taken = o.kind === "taken";
    const k = Math.min(1, (time - o.start) / (taken ? 0.35 : 0.9));
    if (!o.from) o.from = o.obj.position.clone();
    const hero = taken ? mf.world.getAny(o.hero) : undefined;
    if (hero) {
      const e = k * k;
      o.obj.position.set(
        o.from.x + (hero.transform.pos.x - o.from.x) * e,
        o.from.y + (hero.transform.y + 1.2 - o.from.y) * e + Math.sin(k * Math.PI) * 0.8,
        o.from.z + (hero.transform.pos.z - o.from.z) * e,
      );
    } else o.obj.position.y = o.from.y + k * 1.2;
    o.obj.scale.setScalar(Math.max(0.001, 1 - k * k));
    o.obj.rotation.y += taken ? 0.5 : 0.2;
    if (k < 1) continue;
    mf.root.remove(o.obj);
    o.obj.traverse((m) => {
      const g = (m as THREE.Mesh).geometry;
      if (g && !g.userData.model && !LANTERN_GEOS.has(g)) g.dispose();
    });
    mf.lanternOut.splice(i, 1);
    if (mf.fx && hero) {
      emit(mf.fx, {
        tex: SUMMONER.burst,
        n: 1,
        x: hero.transform.pos.x,
        y: hero.transform.y + 1.2,
        z: hero.transform.pos.z,
        size: [2.0, 2.0],
        grow: 1.5,
        life: [0.3, 0.3],
        speed: [0, 0],
        additive: true,
        color: 0x9cff9c,
      });
      emit(mf.fx, {
        tex: SUMMONER.soulFlame,
        n: 8,
        x: hero.transform.pos.x,
        y: hero.transform.y + 1,
        z: hero.transform.pos.z,
        size: [0.5, 0.8],
        life: [0.4, 0.7],
        speed: [1.5, 3],
        up: [1, 2],
        additive: true,
        color: 0x80ff90,
      });
    }
  }
}
export function syncLantern(mf: MapFx, time: number, dt: number): void {
  const w = mf.world;
  const me = w.mapEvents;
  const l = me.lantern;
  const def = me.lanternDef;
  if ((!l || !def || mf.lanternId !== l.id) && mf.lanternObj) {
    mf.lanternOut.push({ obj: mf.lanternObj, start: time, ...mf.lanternEnd });
    mf.lanternEnd = { kind: "fade", hero: 0 };
    mf.lanternObj = null;
  }
  syncLanternOut(mf, time);
  if (l && def) {
    if (!mf.lanternObj) {
      mf.lanternObj = buildLantern();
      mf.lanternId = l.id;
      mf.lanternPos.set(l.x, l.z);
      mf.lanternTilt.set(0, 0, 0, 0);
      mf.root.add(mf.lanternObj);
    }
    const o = mf.lanternObj;
    const sk = 1 - Math.exp(-dt * 10);
    const px = mf.lanternPos.x;
    const pz = mf.lanternPos.y;
    mf.lanternPos.x += (l.x - px) * sk;
    mf.lanternPos.y += (l.z - pz) * sk;
    const lx = mf.lanternPos.x;
    const lz = mf.lanternPos.y;
    const vx = dt > 0 ? (lx - px) / dt : 0;
    const vz = dt > 0 ? (lz - pz) / dt : 0;
    const ground = w.groundY(lx, lz);
    const hover = 1.9 + Math.sin(time * 2.2) * 0.18;
    let y = ground + hover;
    let rk = 1;
    if (l.state === "rise") {
      rk = Math.min(1, (w.time - l.start) / def.riseSeconds);
      y = ground - 3 + (hover + 3) * (rk * rk * (3 - 2 * rk));
    }
    mf.lanternY = y;
    o.position.set(lx, y, lz);
    const tt = mf.lanternTilt;
    const ax = vz * 0.22 + Math.sin(time * 1.6) * 0.07;
    const az = -vx * 0.22 + Math.cos(time * 1.25) * 0.06;
    tt.z += ((ax - tt.x) * 30 - tt.z * 3.2) * dt;
    tt.w += ((az - tt.y) * 30 - tt.w * 3.2) * dt;
    tt.x += tt.z * dt;
    tt.y += tt.w * dt;
    const pivot = o.getObjectByName("pivot");
    const spin = o.getObjectByName("spin");
    if (pivot && spin) {
      pivot.rotation.set(tt.x, 0, tt.y);
      spin.rotation.y = time * 0.5 + (1 - rk) * (1 - rk) * 9;
      const s = 0.55 + 0.45 * rk;
      pivot.scale.setScalar(s);
      const flick = 0.75 + Math.sin(time * 11) * 0.08 + Math.sin(time * 17.3) * 0.06 + Math.random() * 0.06;
      LANTERN_GLOW.value = 0.85 + flick * 0.5;
      (o.getObjectByName("halo") as THREE.Sprite).material.opacity = (0.45 + flick * 0.35) * rk;
      (o.getObjectByName("core") as THREE.Mesh).scale.setScalar(0.85 + flick * 0.3);
      const chain = o.getObjectByName("chain")!;
      chain.visible = l.state !== "rise";
      CHAIN.opacity = 0.35 + Math.sin(time * 3) * 0.1;
      const decal = o.getObjectByName("decal")!;
      decal.position.y = ground + 0.12 - y;
      decal.rotation.z = -time * 0.4;
      decal.scale.setScalar((2.6 + Math.sin(time * 2.2) * 0.15) * (0.3 + 0.7 * rk));
      DECAL.opacity = (0.5 + flick * 0.2) * rk;
    } else {
      o.rotation.y = time * 0.9;
      o.rotation.z = Math.sin(time * 1.7) * 0.12;
      (o.getObjectByName("core") as THREE.Mesh).scale.setScalar(1 + Math.sin(time * 9) * 0.12);
    }
    if (mf.fx) {
      mf.wispAcc += dt;
      if (mf.wispAcc > 0.06) {
        mf.wispAcc = 0;
        emit(mf.fx, {
          tex: SUMMONER.soulFlame,
          n: 1,
          x: lx,
          y: y + 0.35,
          z: lz,
          size: [0.5, 0.8],
          grow: 0.5,
          life: [0.35, 0.6],
          speed: [0.2, 0.5],
          up: [0.8, 1.3],
          additive: true,
          color: 0x60ff70,
          jitter: 0.25,
        });
        if (Math.random() < 0.3)
          emit(mf.fx, {
            tex: SUMMONER.ghost,
            n: 1,
            x: lx,
            y: y - 0.3,
            z: lz,
            size: [0.6, 0.9],
            grow: 1.2,
            life: [0.8, 1.2],
            speed: [0.4, 0.9],
            up: [0.2, 0.5],
            opacity: 0.5,
            color: 0xc8ffd0,
            jitter: 1.0,
          });
        if (Math.random() < 0.25)
          emit(mf.fx, {
            tex: FX.twinkle,
            n: 1,
            x: lx,
            y: y - 0.2,
            z: lz,
            size: [0.2, 0.35],
            life: [0.6, 1.0],
            speed: [0.3, 0.8],
            up: [-0.6, 0.2],
            additive: true,
            color: 0x80ff90,
            jitter: 0.9,
          });
        if (l.state === "rise" && Math.random() < 0.6)
          emit(mf.fx, {
            tex: SUMMONER.graveHand,
            n: 1,
            x: lx,
            y: ground - 0.2,
            z: lz,
            size: [0.7, 1.0],
            life: [0.6, 0.9],
            speed: [0.2, 0.5],
            up: [1, 2],
            opacity: 0.85,
            color: 0xb8e8b0,
            jitter: 1.6,
          });
      }
    }
  }
  if (!mf.fx) return;
  for (const e of w.entities) {
    if (!e.alive || !e.hero || !(time < (e.status.hauntUntil ?? 0))) continue;
    if (Math.random() > dt * 10) continue;
    const a = Math.random() * Math.PI * 2;
    emit(mf.fx, {
      tex: Math.random() < 0.5 ? SUMMONER.soulFlame : SUMMONER.ghost,
      n: 1,
      x: e.transform.pos.x + Math.cos(a) * 0.7,
      y: e.transform.y + 0.8 + Math.random() * 1.2,
      z: e.transform.pos.z + Math.sin(a) * 0.7,
      size: [0.35, 0.6],
      grow: 0.8,
      life: [0.4, 0.7],
      speed: [0.2, 0.6],
      up: [0.6, 1.2],
      additive: true,
      color: 0x90ff9c,
      opacity: 0.8,
    });
  }
}
export function onLantern(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const l = ev as unknown as { stage: string; x: number; z: number; hero: number };
  if (l.stage === "taken" || l.stage === "fade") mf.lanternEnd = { kind: l.stage, hero: l.hero };
  if (mf.fx && l.stage === "taken") {
    emit(mf.fx, {
      tex: SUMMONER.burst,
      n: 1,
      x: l.x,
      y: mf.lanternY,
      z: l.z,
      size: [2.4, 2.4],
      grow: 1.6,
      life: [0.4, 0.4],
      speed: [0, 0],
      additive: true,
      color: 0x9cff9c,
    });
    emit(mf.fx, {
      tex: SUMMONER.ghost,
      n: 8,
      x: l.x,
      y: mf.lanternY,
      z: l.z,
      size: [0.6, 1.0],
      life: [0.6, 1.0],
      speed: [2, 4],
      additive: true,
      color: 0xb0ffb8,
    });
    emit(mf.fx, {
      tex: SUMMONER.bones,
      n: 5,
      x: l.x,
      y: mf.lanternY,
      z: l.z,
      size: [0.3, 0.5],
      life: [0.6, 0.9],
      speed: [2, 4],
      up: [1, 3],
      gravity: 9,
    });
  } else if (mf.fx && l.stage === "rise") {
    const y = mf.world.groundY(l.x, l.z);
    emit(mf.fx, {
      tex: FX.smoke,
      n: 5,
      x: l.x,
      y: y + 0.3,
      z: l.z,
      size: [1.2, 2.0],
      grow: 1.6,
      life: [0.9, 1.4],
      speed: [0.4, 1.2],
      up: [1, 2],
      opacity: 0.35,
      color: 0x6a9a78,
      jitter: 1.5,
    });
    emit(mf.fx, {
      tex: FX.dust,
      n: 8,
      x: l.x,
      y: y + 0.1,
      z: l.z,
      size: [0.8, 1.3],
      grow: 1.5,
      life: [0.5, 0.8],
      speed: [2, 3.5],
      flatSpread: true,
      opacity: 0.6,
    });
    chunks(mf.fx, 4, l.x, y + 0.2, l.z, { size: [0.08, 0.16], speed: [1.5, 3], up: [3, 5] });
    emit(mf.fx, {
      tex: SUMMONER.skull,
      n: 3,
      x: l.x,
      y: y + 0.6,
      z: l.z,
      size: [0.5, 0.8],
      life: [1.0, 1.4],
      speed: [0.3, 0.8],
      up: [1.5, 2.5],
      additive: true,
      color: 0x90ff9c,
      jitter: 1,
    });
  } else if (mf.fx && l.stage === "fade") {
    emit(mf.fx, {
      tex: SUMMONER.ghost,
      n: 6,
      x: l.x,
      y: mf.lanternY,
      z: l.z,
      size: [0.6, 1.0],
      life: [0.8, 1.2],
      speed: [0.5, 1.5],
      up: [1, 2],
      opacity: 0.6,
      color: 0xc8ffd0,
    });
  }
}
