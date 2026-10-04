// Wren (marksman) kit: arrow hits, long-arrow and skyshot projectiles, Pip's launch/latch/peck/rake/home events,
// Volley (instanced rain arrows; Starfall uses its silver arrow meshes), Power Shot, Heartseeker and ricochets.
// Pip's persistent model and Wren's vantage glow are drawn by heroProps/marksman.ts.
import * as THREE from "three";
import { activeCostume, composite, tint, FX, WREN } from "../fx/atlas";
import { FEATHER_MAT, ground, IRON, keep, model, UP, WOOD } from "./shared";
import { decal } from "../fx/decals";
import { emit, tumblers, type FxHost } from "../fx/parts";
import { shockwave } from "../fx/shockwave";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fxBatch, FxBatch } from "../fx/instances";
import { KITS } from "./registry";

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
export const shaftGeo = model(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5).rotateX(Math.PI / 2));
export const tipGeo = model(new THREE.ConeGeometry(0.075, 0.26, 4).rotateX(Math.PI / 2).translate(0, 0, 0.86));
export const fletchGeo = model(new THREE.PlaneGeometry(0.16, 0.3).translate(0, 0, -0.6));
export const fletch2 = model(fletchGeo.clone().rotateZ(Math.PI / 2));
export const STAR_SHAFT = keep(new THREE.MeshLambertMaterial({ color: 0xc8cce0, flatShading: true }));
export const STAR_TIP = keep(new THREE.MeshBasicMaterial({ color: 0xd8c8ff }));
export const STAR_FLETCH = keep(
  new THREE.MeshLambertMaterial({ color: 0x9a4ad8, emissive: 0x3a1060, flatShading: true, side: THREE.DoubleSide }),
);
export function arrowMesh(scale: number, glow?: number): THREE.Group {
  const g = new THREE.Group();
  const star = activeCostume() === "starfall";
  g.add(
    new THREE.Mesh(shaftGeo, star ? STAR_SHAFT : WOOD),
    new THREE.Mesh(tipGeo, star ? STAR_TIP : IRON),
    new THREE.Mesh(fletchGeo, star ? STAR_FLETCH : FEATHER_MAT),
    new THREE.Mesh(fletch2, star ? STAR_FLETCH : FEATHER_MAT),
  );
  if (glow !== undefined) {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: FX.burst2,
        color: tint(glow),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    s.scale.setScalar(0.9);
    s.position.z = 0.7;
    g.add(s);
  }
  g.scale.setScalar(scale);
  return g;
}
export function streak(
  h: FxHost,
  tex: THREE.Texture,
  x0: number,
  y: number,
  z0: number,
  x1: number,
  z1: number,
  n: number,
  color: THREE.ColorRepresentation,
  width: number,
  dur = 0.35,
  additive = true,
): void {
  const rot = Math.atan2(-(z1 - z0), x1 - x0);
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    h.after(f * 0.1, () => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: tex,
          color: tint(color),
          transparent: true,
          depthWrite: false,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      );
      s.material.rotation = rot;
      s.position.set(x0 + (x1 - x0) * f, y, z0 + (z1 - z0) * f);
      h.add(s, dur, (q) => {
        s.scale.set(width * (1 + q * 0.4), width * 0.45 * (1 - q * 0.5), 1);
        s.material.opacity = 0.9 * (1 - q);
      });
    });
  }
}
export function beam(
  h: FxHost,
  x0: number,
  y: number,
  z0: number,
  x1: number,
  z1: number,
  width: number,
  dur: number,
  color: THREE.ColorRepresentation,
): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.1) return;
  const geo = new THREE.PlaneGeometry(len, width);
  const mat = new THREE.MeshBasicMaterial({
    map: BEAM,
    color: tint(color),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
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
export function flyingArrow(
  h: FxHost,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  dur: number,
  scale: number,
  glow?: number,
): void {
  const a = arrowMesh(scale, glow);
  const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize();
  a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  h.add(a, dur, (k) => a.position.set(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k));
}
export let rainGeo: THREE.BufferGeometry | null = null;
export function rainArrowGeo(): THREE.BufferGeometry {
  if (rainGeo) return rainGeo;
  const parts: [THREE.BufferGeometry, THREE.MeshLambertMaterial][] = [
    [shaftGeo, WOOD],
    [tipGeo, IRON],
    [fletchGeo, FEATHER_MAT],
    [fletch2, FEATHER_MAT],
  ];
  const geos = parts.map(([g, m]) => {
    const c = g.clone();
    const n = c.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) m.color.toArray(col, i * 3);
    c.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return c;
  });
  rainGeo = model(mergeGeometries(geos, false)!);
  return rainGeo;
}
export function rainArrow(h: FxHost, x: number, gy: number, z: number, lean: number): void {
  const a: THREE.Object3D =
    activeCostume() === "starfall"
      ? arrowMesh(1.05)
      : fxBatch(
          h.root,
          "rainArrow",
          () =>
            new FxBatch(
              rainArrowGeo(),
              new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
            ),
        ).spawn();
  a.scale.setScalar(1.05);
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
    emit(h, {
      tex: FX.burst2,
      n: 1,
      x: px,
      y: py,
      z: pz,
      color: 0xfff0c0,
      size: ev.big ? [1.5, 1.5] : [0.8, 0.8],
      grow: 1.5,
      life: [0.1, 0.1],
      speed: [0, 0],
      additive: true,
      order: 6,
    });
    emit(h, {
      tex: WREN.splinters,
      n: ev.big ? 4 : 2,
      x: px,
      y: py,
      z: pz,
      size: [0.25, 0.4],
      life: [0.35, 0.55],
      speed: [3, 6],
      dir: { x: n.x, y: 0.5, z: n.z },
      cone: 0.9,
      gravity: 14,
      spin: 10,
    });
    emit(h, {
      tex: FX.twinkle,
      n: ev.big ? 6 : 3,
      x: px,
      y: py,
      z: pz,
      color: 0xe8ffb0,
      size: [0.2, 0.35],
      life: [0.15, 0.3],
      speed: [4, 8],
      dir: { x: n.x, y: 0.3, z: n.z },
      cone: 1,
      gravity: 10,
      additive: true,
    });
    tumblers(h, [WREN.feather], ev.big ? 3 : 1, px, py + 0.2, pz, {
      speed: [0.5, 1.5],
      up: [0.5, 1.5],
      size: [0.22, 0.32],
      life: [0.8, 1.2],
    });
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
    if (Math.random() < 0.5)
      emit(h, {
        tex: FX.twinkle,
        n: 1,
        x,
        y,
        z,
        color: obj.children.length > 4 ? 0xffd860 : 0xf0ffe0,
        size: [0.12, 0.2],
        life: [0.15, 0.25],
        speed: [0, 0.2],
        additive: true,
      });
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "pipLaunch":
        tumblers(h, [WREN.feather], 3, ev.x, ev.y, ev.z, {
          speed: [0.5, 1.5],
          up: [0.3, 1],
          size: [0.18, 0.26],
          life: [0.8, 1.1],
        });
        emit(h, {
          tex: FX.twinkle,
          n: 4,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          color: 0xff7050,
          size: [0.2, 0.3],
          life: [0.25, 0.4],
          speed: [1, 2],
          additive: true,
        });
        return true;
      case "pipLatch":
        decal(h, MARK_RING, ev.x, gy, ev.z, 1.1, 0.7, { grow: 0.15, spin: 2 });
        emit(h, {
          tex: WREN.feather,
          n: 6,
          x: ev.x,
          y: ev.y + 2.6,
          z: ev.z,
          size: [0.18, 0.28],
          life: [0.8, 1.2],
          speed: [1, 2.5],
          up: [0.5, 1.5],
          gravity: 2,
          drag: 1,
          spin: 6,
        });
        emit(h, {
          tex: FX.burst2,
          n: 1,
          x: ev.x,
          y: ev.y + 2.5,
          z: ev.z,
          color: 0xff8060,
          size: [1.2, 1.2],
          grow: 1.4,
          life: [0.15, 0.15],
          speed: [0, 0],
          additive: true,
        });
        return true;
      case "pipPeck":
        emit(h, {
          tex: FX.twinkle,
          n: 3,
          x: ev.x,
          y: ev.y + 2.3,
          z: ev.z,
          color: 0xff6a50,
          size: [0.2, 0.32],
          life: [0.2, 0.3],
          speed: [1.5, 3],
          gravity: 6,
          additive: true,
        });
        emit(h, {
          tex: WREN.feather,
          n: 1,
          x: ev.x,
          y: ev.y + 2.4,
          z: ev.z,
          size: [0.16, 0.22],
          life: [0.6, 0.9],
          speed: [0.5, 1.2],
          up: [0.3, 0.8],
          gravity: 1.5,
          spin: 6,
        });
        emit(h, {
          tex: FX.burst2,
          n: 1,
          x: ev.x,
          y: ev.y + 2.1,
          z: ev.z,
          color: 0xffb0a0,
          size: [0.6, 0.6],
          grow: 1.3,
          life: [0.08, 0.08],
          speed: [0, 0],
          additive: true,
        });
        return true;
      case "pipRake": {
        const y = ev.y + 1.6;
        emit(h, {
          tex: WREN.claws,
          n: 1,
          x: ev.x,
          y: y + 0.4,
          z: ev.z,
          size: [1.5, 1.5],
          grow: 1.25,
          life: [0.3, 0.3],
          speed: [0, 0],
          order: 5,
        });
        emit(h, {
          tex: WREN.feathers,
          n: 1,
          x: ev.x,
          y: y + 0.7,
          z: ev.z,
          size: [1.1, 1.1],
          grow: 1.6,
          life: [0.45, 0.45],
          speed: [0, 0.3],
        });
        emit(h, {
          tex: WREN.feather,
          n: 8,
          x: ev.x,
          y: y + 0.6,
          z: ev.z,
          size: [0.2, 0.32],
          life: [0.8, 1.3],
          speed: [2, 4],
          up: [0.5, 2],
          gravity: 2,
          drag: 1,
          spin: 8,
        });
        const secs = ev.seconds ?? 2.5;
        for (let k = 0; k * 0.35 < secs; k++) {
          h.after(0.1 + k * 0.35, () => {
            const o = ev.id !== undefined ? h.world?.get(ev.id) : undefined;
            if (ev.id !== undefined && !o?.alive) return;
            emit(h, {
              tex: WREN.dizzy,
              n: 1,
              x: o ? o.transform.pos.x : ev.x,
              y: (o ? o.transform.y : ev.y) + 2.3,
              z: o ? o.transform.pos.z : ev.z,
              size: [0.85, 0.85],
              life: [0.45, 0.45],
              speed: [0, 0],
              spin: 4,
            });
          });
        }
        return true;
      }
      case "pipHome":
        tumblers(h, [WREN.feather], 2, ev.x, ev.y, ev.z, {
          speed: [0.3, 0.8],
          up: [0.2, 0.6],
          size: [0.16, 0.22],
          life: [0.7, 1],
        });
        return true;
      case "volley": {
        const r = ev.radius ?? 3.5;
        const secs = ev.seconds ?? 2.35;
        decal(h, VOLLEY_RING, ev.x, gy, ev.z, r * 1.05, secs + 0.3, { grow: 0.2, spin: 0.4, opacity: 0.9 });
        decal(h, FX.shock, ev.x, gy, ev.z, r, secs + 0.3, {
          grow: 0.25,
          additive: true,
          color: 0xff9a50,
          opacity: 0.45,
        });
        const lean = Math.random() - 0.5;
        const total = Math.round(r * r * 3.2);
        for (let i = 0; i < total; i++) {
          const at = 0.12 + Math.random() * (secs - 0.15);
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * r;
          const x = ev.x + Math.cos(a) * d;
          const z = ev.z + Math.sin(a) * d;
          h.after(at, () => rainArrow(h, x, ground(h, x, z, ev.y), z, lean));
          h.after(at + 0.28, () =>
            emit(h, {
              tex: FX.dust,
              n: 1,
              x,
              y: ground(h, x, z, ev.y) + 0.3,
              z,
              size: [0.45, 0.7],
              grow: 1.6,
              life: [0.3, 0.45],
              speed: [0.4, 1],
              flatSpread: true,
              drag: 3,
              opacity: 0.75,
            }),
          );
        }
        return true;
      }
      case "volleyWave": {
        const r = ev.radius ?? 3.5;
        shockwave(h, FX.shock, ev.x, gy + 0.15, ev.z, UP, r * 0.3, r, 0.3, 0xffe0b0, 0.5);
        emit(h, {
          tex: WREN.splinters,
          n: 4,
          x: ev.x,
          y: gy + 0.4,
          z: ev.z,
          size: [0.2, 0.35],
          life: [0.3, 0.5],
          speed: [2, 4],
          up: [2, 4],
          gravity: 14,
          spin: 10,
          jitter: r * 1.2,
        });
        h.shake = Math.max(h.shake, 0.1);
        return true;
      }
      case "powershot": {
        const tx = ev.tx ?? ev.x;
        const tz = ev.tz ?? ev.z;
        const dx = tx - ev.x;
        const dz = tz - ev.z;
        const dl = Math.hypot(dx, dz) || 1;
        emit(h, {
          tex: FX.burst,
          n: 1,
          x: ev.x + (dx / dl) * 0.9,
          y: gy + 1.4,
          z: ev.z + (dz / dl) * 0.9,
          color: 0xe0ffb0,
          size: [1.6, 1.6],
          grow: 1.4,
          life: [0.12, 0.12],
          speed: [0, 0],
          additive: true,
        });
        shockwave(
          h,
          FX.shock,
          ev.x + (dx / dl) * 0.9,
          gy + 1.4,
          ev.z + (dz / dl) * 0.9,
          new THREE.Vector3(dx / dl, 0, dz / dl),
          0.2,
          1.4,
          0.25,
          0xd8ffb0,
          0.9,
        );
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
        emit(h, {
          tex: HEART,
          n: 1,
          x: ev.x + (dx / dl) * 1.2,
          y,
          z: ev.z + (dz / dl) * 1.2,
          size: [1.8, 1.8],
          grow: 1.6,
          life: [0.35, 0.35],
          speed: [0, 0],
          additive: true,
          order: 7,
        });
        shockwave(
          h,
          FX.shock,
          ev.x + (dx / dl) * 1.2,
          y,
          ev.z + (dz / dl) * 1.2,
          new THREE.Vector3(dx / dl, 0, dz / dl),
          0.3,
          2.6,
          0.35,
          0xffb090,
          1,
        );
        for (let k = 1; k <= 8; k++) {
          const f = k / 8;
          h.after(f * 0.2, () =>
            emit(h, {
              tex: FX.twinkle,
              n: 3,
              x: ev.x + dx * f,
              y,
              z: ev.z + dz * f,
              color: 0xffc0a0,
              size: [0.25, 0.45],
              life: [0.3, 0.5],
              speed: [0.5, 2],
              additive: true,
              jitter: 0.6,
            }),
          );
        }
        h.after(0.22, () => {
          const ty = ground(h, tx, tz, ev.y);
          emit(h, {
            tex: FX.burst,
            n: 1,
            x: tx,
            y: ty + 1.2,
            z: tz,
            color: 0xffd0a0,
            size: [2.4, 2.4],
            grow: 1.3,
            life: [0.2, 0.2],
            speed: [0, 0],
            additive: true,
          });
          emit(h, {
            tex: FX.dust,
            n: 5,
            x: tx,
            y: ty + 0.4,
            z: tz,
            size: [0.8, 1.2],
            grow: 1.8,
            life: [0.5, 0.8],
            speed: [1, 2.5],
            flatSpread: true,
            drag: 3,
            opacity: 0.85,
          });
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
        tumblers(h, [WREN.feather, WREN.leaves], 4, ev.x, gy + 0.6, ev.z, {
          speed: [0.8, 2],
          up: [1, 2],
          size: [0.25, 0.35],
          life: [0.9, 1.3],
        });
        emit(h, {
          tex: FX.dust,
          n: 4,
          x: ev.x,
          y: gy + 0.3,
          z: ev.z,
          size: [0.8, 1.1],
          grow: 1.7,
          life: [0.4, 0.6],
          speed: [1, 2.5],
          flatSpread: true,
          drag: 3,
          opacity: 0.85,
        });
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
          emit(h, {
            tex: FX.twinkle,
            n: 2,
            x: bx + Math.cos(a) * 1.4,
            y: gy + 1.5 + (Math.random() - 0.5),
            z: bz + Math.sin(a) * 1.4,
            color: 0xffb090,
            size: [0.25, 0.4],
            life: [0.25, 0.3],
            speed: [4.5, 5],
            dir: { x: -Math.cos(a), y: 0, z: -Math.sin(a) },
            cone: 0.1,
            additive: true,
          });
          emit(h, {
            tex: HEART,
            n: 1,
            x: bx,
            y: gy + 1.5,
            z: bz,
            size: [0.5 + k * 0.08, 0.5 + k * 0.08],
            life: [0.12, 0.12],
            speed: [0, 0],
            additive: true,
            opacity: 0.6,
          });
        });
      }
    }
    if (ev.phase === "fire" && ev.kind === "volley") {
      for (let k = 0; k < 6; k++) {
        const x0 = ev.x + ev.dirX * 0.5;
        const z0 = ev.z + ev.dirZ * 0.5;
        h.after(k * 0.04, () =>
          flyingArrow(
            h,
            x0,
            gy + 1.8,
            z0,
            x0 + ev.dirX * 2 + (Math.random() - 0.5),
            gy + 9,
            z0 + ev.dirZ * 2 + (Math.random() - 0.5),
            0.3,
            0.9,
          ),
        );
      }
    }
    if (ev.phase === "fire" && ev.kind === "pip")
      emit(h, {
        tex: FX.twinkle,
        n: 3,
        x: ev.x,
        y: gy + 2.2,
        z: ev.z,
        color: 0xff7050,
        size: [0.2, 0.3],
        life: [0.2, 0.3],
        speed: [1, 2],
        additive: true,
      });
  },
};
