// Frozen lake (Emberglass Mere): the ice itself is painted into the terrain (terrainMesh's ICE layer, lit and shaded
// like the snow round it); this module draws what happens to it - cracks spreading from weakened patches, ragged
// holes of dark rippling water (with floating chunks) where a patch broke, closing up as it refreezes - as one
// lake-wide overlay redrawn when the lake changes, plus the shards / splash / frost effects on the ice events.
import * as THREE from "three";
import { ARCHITECT, FX } from "../fx/atlas";
import { emit } from "../fx/parts";
import { shockwave } from "../fx/shockwave";
import { cacheCanvas } from "../../ui/cacheCanvas";
import type { MapFx } from "./mapFx";

const UP = new THREE.Vector3(0, 1, 0);
const SHEET = 0.035;

/** Deterministic 0..1 noise for the painted textures. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function canvasTex(size: number, paint: (g: CanvasRenderingContext2D, r: () => number) => void, seed: number) {
  const c = cacheCanvas();
  c.width = c.height = size;
  paint(c.getContext("2d")!, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Icy water: near-black teal with soft ripple bands (scrolled each frame). */
const waterTex = canvasTex(
  256,
  (g, r) => {
    g.fillStyle = "#183c50";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = 0.12 + r() * 0.15;
      g.strokeStyle = r() < 0.5 ? "#5a8aa4" : "#0c2432";
      g.lineWidth = 2 + r() * 5;
      g.beginPath();
      const y = r() * 256;
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 6);
      g.stroke();
    }
    g.globalAlpha = 1;
  },
  53,
);

/** Canvas pixels per metre of the lake overlay (hole mask and cracks). */
const PX = 20;

/**
 * The lake overlay: the ice itself is painted into the terrain (terrainMesh ICE), so it's lit like the snow round
 * it. On top: water seen through the holes (an animated water plane cut out by a hole mask with ragged edges and
 * floating chunks) and the cracks (drawn per weakened patch). Both canvases are redrawn only when the lake changes.
 */
export interface IceOverlay {
  x0: number;
  z0: number;
  hole: HTMLCanvasElement;
  holeTex: THREE.CanvasTexture;
  crack: HTMLCanvasElement;
  crackTex: THREE.CanvasTexture;
  /** Last drawn state per patch: "s<stage>" while whole, "b<refreeze step>" while broken. */
  drawn: string[];
}

function overlayGeometry(x0: number, z0: number, w: number, d: number, y: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [x0, y, z0, x0, y, z0 + d, x0 + w, y, z0, x0 + w, y, z0, x0, y, z0 + d, x0 + w, y, z0 + d];
  const uv = [0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1];
  // Second set in metres for the tiling water texture.
  const uw = [x0, z0, x0, z0 + d, x0 + w, z0, x0 + w, z0, x0, z0 + d, x0 + w, z0 + d].map((v) => v / 5);
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uw, 2));
  g.setAttribute("uv1", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function buildIce(mf: MapFx): void {
  const patches = mf.world.mapEvents.icePatches;
  if (!patches.length) return;
  const t = mf.world.terrain;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of patches)
    for (const i of p.cells) {
      x0 = Math.min(x0, i % t.width);
      z0 = Math.min(z0, Math.floor(i / t.width));
      x1 = Math.max(x1, (i % t.width) + 1);
      z1 = Math.max(z1, Math.floor(i / t.width) + 1);
    }
  x0 -= 2;
  z0 -= 2;
  x1 += 2;
  z1 += 2;
  const w = x1 - x0;
  const d = z1 - z0;
  const y = t.groundHeight(patches[0].x, patches[0].z);
  const canvas = () => {
    const c = cacheCanvas();
    c.width = Math.round(w * PX);
    c.height = Math.round(d * PX);
    return c;
  };
  const hole = canvas();
  const crack = canvas();
  const tex = (c: HTMLCanvasElement) => {
    const tx = new THREE.CanvasTexture(c);
    tx.flipY = false;
    tx.channel = 1;
    return tx;
  };
  const holeTex = tex(hole);
  const crackTex = tex(crack);
  crackTex.colorSpace = THREE.SRGBColorSpace;
  const water = new THREE.Mesh(
    overlayGeometry(x0, z0, w, d, y + 0.02),
    new THREE.MeshLambertMaterial({ map: waterTex, alphaMap: holeTex, transparent: true, depthWrite: false }),
  );
  const cracks = new THREE.Mesh(
    overlayGeometry(x0, z0, w, d, y + 0.025),
    new THREE.MeshLambertMaterial({ map: crackTex, transparent: true, depthWrite: false }),
  );
  for (const m of [water, cracks]) {
    m.renderOrder = 1;
    m.receiveShadow = true;
    mf.root.add(m);
  }
  mf.ice = { x0, z0, hole, holeTex, crack, crackTex, drawn: patches.map(() => "") };
}

/** A ragged ring of points round (cx, cz): `rad` metres with jagged, seeded variation. */
function ragged(cx: number, cz: number, rad: number, seed: number, n: number, rough: number): [number, number][] {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / n);
    const rr = rad * (1 - rough + r() * rough * 1.6) * (k % 2 ? 0.86 : 1);
    pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
  }
  return pts;
}

/** Redraws the hole mask and the cracks when any patch's look changed (stage, broken, refreeze step). */
export function syncIce(mf: MapFx, dt: number): void {
  const o = mf.ice;
  if (!o) return;
  const ev = mf.world.mapEvents;
  const d = ev.iceDef!;
  const t = mf.world.time;
  waterTex.offset.x = (waterTex.offset.x + dt * 0.03) % 1;
  waterTex.offset.y = (waterTex.offset.y + dt * 0.015) % 1;
  const look = ev.icePatches.map((p) => {
    if (p.broken) return `b${Math.floor(Math.max(0, Math.min(1, (p.until - t) / d.refreezeWarn)) * 8)}`;
    const dmg = 1 - p.hp / d.hp;
    return `s${dmg >= 0.66 ? 2 : dmg >= 0.05 ? 1 : 0}`;
  });
  if (look.every((l, i) => l === o.drawn[i])) return;
  o.drawn = look;
  const P = (x: number, z: number): [number, number] => [(x - o.x0) * PX, (z - o.z0) * PX];
  // Holes: white = water shows. Ragged outline about the patch, a couple of ice chunks floating in it, and while
  // refreezing the hole shrinks (frost closing in from the edge).
  const hg = o.hole.getContext("2d")!;
  hg.clearRect(0, 0, o.hole.width, o.hole.height);
  ev.icePatches.forEach((p, i) => {
    if (!p.broken) return;
    const k = Math.max(0, Math.min(1, (p.until - t) / d.refreezeWarn));
    const seed = p.id * 7919 + Math.round(p.until * 10);
    const rad = d.patch * 0.62 * (0.35 + 0.65 * k);
    hg.fillStyle = "#ffffff";
    hg.beginPath();
    ragged(p.x, p.z, rad, seed, 22, 0.35).forEach(([x, z], j) => (j ? hg.lineTo(...P(x, z)) : hg.moveTo(...P(x, z))));
    hg.closePath();
    hg.fill();
    // Floating chunks (black = ice).
    const r = rng(seed + 3);
    hg.fillStyle = "#000000";
    for (let c = 0; c < 3; c++) {
      const cx = p.x + (r() - 0.5) * rad;
      const cz = p.z + (r() - 0.5) * rad;
      hg.beginPath();
      ragged(cx, cz, 0.25 + r() * 0.35, seed + 11 + c, 7, 0.4).forEach(([x, z], j) =>
        j ? hg.lineTo(...P(x, z)) : hg.moveTo(...P(x, z)),
      );
      hg.closePath();
      hg.fill();
    }
    void i;
  });
  o.holeTex.needsUpdate = true;
  // Cracks: branching lines from the patch centre, longer and more of them as it weakens; broken patches have a
  // shattered ring round the hole.
  const cg = o.crack.getContext("2d")!;
  cg.clearRect(0, 0, o.crack.width, o.crack.height);
  cg.lineCap = "round";
  ev.icePatches.forEach((p, i) => {
    const stage = p.broken ? 2 : Number(look[i].slice(1));
    if (!stage && !p.broken) return;
    const r = rng(p.id * 104729 + 17);
    const n = stage >= 2 ? 9 : 5;
    const len = (stage >= 2 ? 2.8 : 1.7) * (d.patch / 4);
    // Hairline cracks: short jittery segments, a faint dark edge and a pale core.
    const branch = (x: number, z: number, a: number, L: number, wdt: number, depth: number) => {
      for (let s = 0; s < 8; s++) {
        const nx = x + Math.cos(a) * (L / 8);
        const nz = z + Math.sin(a) * (L / 8);
        for (const [col, lw] of [
          ["rgba(28,52,72,0.3)", wdt + 1.5],
          ["rgba(238,248,255,0.7)", wdt],
        ] as const) {
          cg.strokeStyle = col;
          cg.lineWidth = lw;
          cg.beginPath();
          cg.moveTo(...P(x, z));
          cg.lineTo(...P(nx, nz));
          cg.stroke();
        }
        x = nx;
        z = nz;
        a += (r() - 0.5) * 1.1;
        if (depth > 0 && r() < 0.18) branch(x, z, a + (r() < 0.5 ? 0.9 : -0.9), L * 0.45, wdt * 0.75, depth - 1);
      }
    };
    const cx = p.x + (r() - 0.5) * 1.2;
    const cz = p.z + (r() - 0.5) * 1.2;
    for (let k = 0; k < n; k++) branch(cx, cz, (k / n) * Math.PI * 2 + r() * 0.6, len, stage >= 2 ? 1.4 : 1.0, 2);
    // A broken patch: snapped pale ice round the hole's ragged edge.
    if (p.broken) {
      const k = Math.max(0, Math.min(1, (p.until - mf.world.time) / d.refreezeWarn));
      const pts = ragged(
        p.x,
        p.z,
        d.patch * 0.62 * (0.35 + 0.65 * k),
        p.id * 7919 + Math.round(p.until * 10),
        22,
        0.35,
      );
      for (const [col, lw] of [
        ["rgba(220,240,252,0.75)", 8],
        ["rgba(250,253,255,0.9)", 2.6],
      ] as const) {
        cg.strokeStyle = col;
        cg.lineWidth = lw;
        cg.beginPath();
        pts.forEach(([x, z], j) => (j ? cg.lineTo(...P(x, z)) : cg.moveTo(...P(x, z))));
        cg.closePath();
        cg.stroke();
      }
    }
  });
  o.crackTex.needsUpdate = true;
}

export function onIce(mf: MapFx, ev: { type: string; [k: string]: unknown }): void {
  const h = mf.fx;
  if (!h) return;
  const x = ev.x as number;
  const y = (ev.y as number) + SHEET;
  const z = ev.z as number;
  if (ev.stage === "crack") {
    emit(h, {
      tex: ARCHITECT.shard,
      n: 6,
      x,
      y: y + 0.2,
      z,
      size: [0.15, 0.3],
      life: [0.5, 0.8],
      speed: [1.5, 3],
      up: [2, 4],
      gravity: 14,
      floor: y,
      spin: 8,
      jitter: 1.2,
    });
    shockwave(h, FX.shock, x, y + 0.05, z, UP, 0.3, 2.2, 0.3, 0xe8f8ff, 0.7);
  } else if (ev.stage === "break") {
    emit(h, {
      tex: ARCHITECT.shard,
      n: 22,
      x,
      y: y + 0.2,
      z,
      size: [0.25, 0.55],
      life: [0.7, 1.1],
      speed: [3, 6],
      up: [4, 8],
      gravity: 16,
      floor: y - 0.2,
      spin: 10,
      jitter: 1.6,
    });
    emit(h, {
      tex: FX.splash,
      n: 6,
      x,
      y: y + 0.1,
      z,
      size: [1.2, 2.2],
      grow: 1.4,
      life: [0.4, 0.7],
      speed: [1, 2.5],
      up: [3, 5],
      gravity: 12,
      color: 0xbfe8ff,
      jitter: 1.4,
    });
    shockwave(h, FX.shock, x, y + 0.05, z, UP, 0.4, 3.6, 0.4, 0x9ad8ff, 0.9);
  } else if (ev.stage === "warn") {
    const secs = (ev.seconds as number) ?? 3;
    const n = Math.round(secs * 5);
    for (let i = 0; i < n; i++)
      h.after((i / n) * secs, () =>
        emit(h, {
          tex: FX.twinkle,
          n: 2,
          x,
          y: y + 0.15,
          z,
          size: [0.2, 0.35],
          life: [0.5, 0.8],
          speed: [0.2, 0.5],
          up: [0.2, 0.6],
          jitter: 1.8,
          color: 0xe8f8ff,
          additive: true,
        }),
      );
  } else if (ev.stage === "refreeze") {
    emit(h, {
      tex: ARCHITECT.flake,
      n: 10,
      x,
      y: y + 0.3,
      z,
      size: [0.2, 0.35],
      life: [0.6, 1],
      speed: [0.5, 1.2],
      up: [0.6, 1.4],
      jitter: 1.6,
    });
    shockwave(h, FX.shock, x, y + 0.05, z, UP, 0.3, 2.4, 0.35, 0xf0fbff, 0.6);
  }
}
