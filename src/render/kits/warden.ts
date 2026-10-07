// Thorn (warden) kit: thorn pricks, the Snap vines and the kit registration (hits, root slams, telegraphs).
// His reusable growth pieces (hit leaves, reach arm, walls, sprouts, bramble cast) are in wardenParts.ts.
import * as THREE from "three";
import { activeCostume, FX, WARDEN, hd } from "../fx/atlas";
import { cactusMat, isDesert } from "./desert";
import { decal } from "../fx/decals";
import { emit, tumblers, type FxHost } from "../fx/parts";
import { shockwave } from "../fx/shockwave";
import { KITS } from "./registry";
import { ground } from "./shared";
import { barkTex, LEAVES, tubeBundle, wardenHit } from "./wardenParts";

function wardenPrick(h: FxHost, x: number, y: number, z: number): void {
  const gy = ground(h, x, z, y);
  const thorn = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: hd(WARDEN.thorn), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }),
  );
  const thorn2 = thorn.clone();
  thorn2.rotation.y = Math.PI / 2;
  const g = new THREE.Group();
  g.add(thorn, thorn2);
  g.position.set(x + (Math.random() - 0.5) * 0.6, gy, z + (Math.random() - 0.5) * 0.6);
  g.rotation.y = Math.random() * 6;
  h.root.add(g);
  h.add(g, 0.45, (k) => {
    const up = k < 0.2 ? k / 0.2 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    g.scale.set(0.9, 1.4 * up, 0.9);
    g.position.y = gy + 0.7 * up - 0.1;
  });
  emit(h, {
    tex: WARDEN.natureBurst,
    n: 1,
    x,
    y: gy + 1.0,
    z,
    size: [0.9, 0.9],
    grow: 1.4,
    life: [0.16, 0.16],
    speed: [0, 0],
  });
  emit(h, {
    tex: FX.twinkle,
    n: 2,
    x,
    y: gy + 0.9,
    z,
    size: [0.25, 0.4],
    life: [0.15, 0.25],
    speed: [2, 4],
    dir: { x: 0, y: 1, z: 0 },
    cone: 0.8,
    additive: true,
  });
}

function wardenSnap(h: FxHost, x: number, y: number, z: number, r: number): void {
  const gy = ground(h, x, z, y);
  const mat = isDesert(activeCostume())
    ? cactusMat([4, 1])
    : new THREE.MeshLambertMaterial({ map: barkTex, color: 0xa8b870, flatShading: true });
  const n = 6;
  const vines: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const d = r * 0.7;
    const A = new THREE.Vector3(x + Math.cos(a) * d, gy - 0.2, z + Math.sin(a) * d);
    const top = new THREE.Vector3(
      x + Math.cos(a + 0.9) * 0.25,
      gy + 1.9 + Math.random() * 0.5,
      z + Math.sin(a + 0.9) * 0.25,
    );
    const M1 = A.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, 1.2, Math.sin(a) * 0.6));
    const M2 = top.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.4, Math.sin(a) * 0.5));
    vines.push(new THREE.TubeGeometry(new THREE.CubicBezierCurve3(A, M1, M2, top), 14, 0.11, 5, false));
  }
  const totals = vines.map((g) => g.index!.count);
  tubeBundle(h, vines, mat, 0.9, (k, shown, sink) => {
    const grow = Math.min(1, k / 0.18);
    totals.forEach((total, i) => {
      shown[i] = Math.floor((total * (1 - Math.pow(1 - grow, 3))) / 6) * 6;
      sink[i] = k > 0.6 ? -Math.pow((k - 0.6) / 0.4, 2) * 2.4 : 0;
    });
  });
  if (!mat.userData.keep) mat.dispose();
  emit(h, {
    tex: WARDEN.natureBurst,
    n: 1,
    x,
    y: gy + 1,
    z,
    size: [2.4, 2.4],
    grow: 1.3,
    life: [0.22, 0.22],
    speed: [0, 0],
    order: 5,
  });
  emit(h, {
    tex: FX.dust,
    n: 6,
    x,
    y: gy + 0.4,
    z,
    size: [0.9, 1.3],
    grow: 1.8,
    life: [0.5, 0.8],
    speed: [1.5, 3],
    flatSpread: true,
    drag: 3,
    opacity: 0.85,
  });
  tumblers(h, LEAVES, 8, x, gy + 1.2, z, { speed: [1.5, 3.5], up: [3, 5], size: [0.35, 0.5], life: [1.6, 2.2] });
  emit(h, {
    tex: WARDEN.thorn,
    n: 6,
    x,
    y: gy + 1,
    z,
    size: [0.35, 0.5],
    life: [0.4, 0.6],
    speed: [3, 6],
    up: [1, 3],
    gravity: 14,
    spin: 10,
    floor: gy + 0.05,
  });
  shockwave(h, FX.shock, x, gy + 0.2, z, new THREE.Vector3(0, 1, 0), 0.3, r * 1.4, 0.3, 0xc0ff90);
  h.shake = Math.max(h.shake, 0.3);
}

KITS.warden = {
  trail: 0xd8ffc0,
  hit(h, ev, src, dx, dz) {
    const d = Math.hypot(src.transform.pos.x - ev.x, src.transform.pos.z - ev.z);
    const inZone = h.world?.zones.some(
      (zn) => zn.ownerId === src.id && Math.hypot(zn.x - ev.x, zn.z - ev.z) <= zn.radius + 0.5,
    );
    if (d <= 3.9) wardenHit(h, ev.x, ev.y, ev.z, dx, dz, ev.big);
    else if (inZone) wardenPrick(h, ev.x, ev.y, ev.z);
    else return false;
    return true;
  },
  event(h, ev) {
    if (ev.type === "telegraph" && ev.style === "roots") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      decal(h, WARDEN.roots, ev.x, gy + 0.02, ev.z, ev.radius * 1.1, ev.seconds + 0.6, {
        grow: ev.seconds,
        opacity: 0.95,
      });
      decal(h, WARDEN.rune, ev.x, gy + 0.04, ev.z, ev.radius * 1.15, ev.seconds + 0.2, {
        grow: 0.15,
        spin: 2,
        additive: true,
        color: 0x90ff60,
      });
      emit(h, {
        tex: FX.dust,
        n: 6,
        x: ev.x,
        y: gy + 0.3,
        z: ev.z,
        size: [0.8, 1.1],
        grow: 1.6,
        life: [0.4, 0.6],
        speed: [0.5, 1.5],
        flatSpread: true,
        drag: 2,
        opacity: 0.7,
        jitter: ev.radius,
      });
      emit(h, {
        tex: WARDEN.pebbleDust,
        n: 3,
        x: ev.x,
        y: gy + 0.3,
        z: ev.z,
        size: [0.7, 1],
        life: [0.3, 0.5],
        speed: [0.2, 0.6],
        up: [1, 2],
        jitter: ev.radius,
        opacity: 0.8,
      });
      return true;
    }
    if (ev.type === "slam" && ev.trap) {
      wardenSnap(h, ev.x, ev.y, ev.z, ev.radius / 1.5);
      return true;
    }
    return ev.type === "slam" && !!ev.zone;
  },
};
