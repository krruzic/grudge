// Terrain mods (World.mods): Stig's ramps and works decks (plank decks on posts), Thorn's walls (stone or
// palisade cells in the owner's costume). Wall cells are merged into one mesh per material; each vertex keeps
// its cell index (aCellO.w) so the shader can raise, tilt or hide cells individually from the uCell uniform
// array that syncWall() fills from the (invisible) per-cell anchor objects.
import * as THREE from "three";
import { crossQuad, KEEP_GEO, MOSS_STONE, MOSS_TUFT, ROPE, STAKE, stakeGeo, WOOD, WOOD_DARK } from "./materials";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { costumeOfPlayer } from "../costumes";
import { cm } from "../fx/atlas";
import { propParts } from "../props";
import type { HazardViews } from "./hazardViews";
import { mergeInto, meshesOf } from "./grow";

/** Deck plank whose top-face UVs are in world units so planks line up across cells. */
export function deckBox(x: number, z: number, h: number): THREE.BoxGeometry {
  const g = worldBox(1, h, 1);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 8; i < 16; i++) uv.setXY(i, pos.getX(i) + x, pos.getZ(i) + z);
  return g;
}
/** Box with UVs scaled to its size (texture density independent of dimensions). */
export function worldBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}
/** Max cells per wall (uniform array size); hidden cells collapse to their origin. */
export const WALL_CELLS = 64;
export const WALL_HIDDEN = -100;
export const WALL_HEAD = `attribute vec4 aCellO;\nuniform vec2 uCell[${WALL_CELLS}];\n`;
export const WALL_NORMAL = `
vec2 wN = uCell[int(aCellO.w)];
objectNormal.xy = vec2(cos(wN.y) * objectNormal.x - sin(wN.y) * objectNormal.y, sin(wN.y) * objectNormal.x + cos(wN.y) * objectNormal.y);
`;
export const WALL_BODY = `
vec2 wC = uCell[int(aCellO.w)];
vec3 wD = transformed - aCellO.xyz;
wD.xy = vec2(cos(wC.y) * wD.x - sin(wC.y) * wD.y, sin(wC.y) * wD.x + cos(wC.y) * wD.y);
transformed = wC.x < ${WALL_HIDDEN / 2}.0 ? aCellO.xyz : aCellO.xyz + vec3(0.0, wC.x, 0.0) + wD;
`;
export function wallMat(base: THREE.Material, u: { value: Float32Array }): THREE.Material {
  const m = base.clone();
  m.onBeforeCompile = (s) => {
    s.uniforms.uCell = u;
    s.vertexShader =
      WALL_HEAD +
      s.vertexShader
        .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n" + WALL_NORMAL)
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + WALL_BODY);
  };
  m.customProgramCacheKey = () => "wallcells";
  return m;
}
export function mergeWall(g: THREE.Group, cells: THREE.Object3D[]): void {
  const u = { value: new Float32Array(WALL_CELLS * 2) };
  for (let k = 0; k < cells.length; k++) u.value[k * 2] = WALL_HIDDEN;
  g.userData.cellU = u;
  g.userData.cells = cells;
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  cells.forEach((cell, k) => {
    cell.updateMatrixWorld(true);
    for (const mesh of meshesOf(cell)) {
      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (!KEEP_GEO.has(mesh.geometry) && !mesh.geometry.userData.model) mesh.geometry.dispose();
      const n = geo.getAttribute("position").count;
      const o = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        o[i * 4] = cell.position.x;
        o[i * 4 + 1] = cell.position.y;
        o[i * 4 + 2] = cell.position.z;
        o[i * 4 + 3] = k;
      }
      geo.setAttribute("aCellO", new THREE.BufferAttribute(o, 4));
      const mat = mesh.material as THREE.Material;
      const list = by.get(mat) ?? [];
      list.push(geo);
      by.set(mat, list);
    }
    cell.clear();
  });
  for (const [mat, geos] of by) {
    const merged = mergeGeometries(geos)!;
    for (const q of geos) q.dispose();
    merged.computeBoundingSphere();
    merged.boundingSphere!.radius += 0.5;
    g.add(new THREE.Mesh(merged, wallMat(mat, u)));
  }
}
export function syncWall(o: THREE.Object3D): void {
  const a = (o.userData.cellU as { value: Float32Array }).value;
  (o.userData.cells as THREE.Object3D[]).forEach((c, k) => {
    a[k * 2] = c.visible ? c.position.y - c.userData.baseY : WALL_HIDDEN;
    a[k * 2 + 1] = c.rotation.z;
  });
}
export function mergeFlat(parent: THREE.Object3D): void {
  mergeInto(
    parent,
    meshesOf(parent).map((mesh) => ({ mesh })),
  );
  for (const c of [...parent.children]) if (!(c as THREE.Mesh).isMesh && !c.children.length) parent.remove(c);
}
export function modMesh(hz: HazardViews, id: number): THREE.Object3D | null {
  const m = hz.world.mods.find((k) => k.id === id);
  if (!m) return null;
  const g = new THREE.Group();
  const W = hz.world.terrain.width;
  const cells: THREE.Object3D[] = [];
  const c0 = m.cells[0];
  const c1 = m.cells[m.cells.length - 1];
  const wallYaw = -Math.atan2(Math.floor(c1 / W) - Math.floor(c0 / W), (c1 % W) - (c0 % W));
  const modCostume = costumeOfPlayer(m.owner !== undefined ? hz.world.getAny(m.owner)?.hero?.player : undefined);
  m.cells.forEach((c, k) => {
    const x = (c % W) + 0.5;
    const z = Math.floor(c / W) + 0.5;
    if (m.kind !== "wall") {
      const works = m.kind === "works";
      const plank = new THREE.Mesh(deckBox(x, z, works ? 0.22 : 0.14), WOOD);
      plank.position.set(x, m.deck[k] - (works ? 0.11 : 0.07), z);
      g.add(plank);
      const ground = hz.world.terrain.groundHeight(x, z);
      const h = m.deck[k] - Math.min(ground, hz.world.terrain.waterLevel - 0.5);
      if (works && m.deck[k] === m.top && m.cx !== undefined) {
        const ox = Math.abs(x - m.cx) < 0.25 ? 0 : Math.sign(x - m.cx);
        const oz = Math.abs(z - m.cz!) < 0.25 ? 0 : Math.sign(z - m.cz!);
        for (const [sx, sz] of [
          [ox, 0],
          [0, oz],
        ] as const) {
          if (!sx && !sz) continue;
          const ni = hz.world.terrain.index(Math.floor(x + sx), Math.floor(z + sz));
          if (m.cells.includes(ni)) continue;
          const rail = new THREE.Mesh(worldBox(sx ? 0.12 : 1.02, 0.5, sz ? 0.12 : 1.02), WOOD_DARK);
          rail.position.set(x + sx * 0.46, m.deck[k] + 0.25, z + sz * 0.46);
          g.add(rail);
        }
      }
      if (h > 0.3 && (works || k % 3 === 0)) {
        const post = new THREE.Mesh(worldBox(0.16, h, 0.16), WOOD_DARK);
        post.position.set(x, m.deck[k] - (works ? 0.12 : 0.08) - h / 2, z);
        g.add(post);
      }
    } else {
      const y = hz.world.terrain.groundHeight(x, z);
      const cell = new THREE.Group();
      cell.position.set(x, y, z);
      const pal = m.style === "wood" ? propParts("palisade", modCostume) : null;
      const stone = m.style === "wood" ? null : propParts("wallstone", modCostume);
      const art = pal ?? stone;
      if (art) {
        const piece = new THREE.Mesh(art.geo, art.mat);
        piece.rotation.y =
          (pal ? wallYaw : (Math.floor(Math.random() * 4) * Math.PI) / 2) + (Math.random() - 0.5) * 0.2;
        piece.scale.y = 0.92 + Math.random() * 0.16;
        piece.position.y = -0.1;
        cell.add(piece);
        cell.userData.baseY = y;
        cell.userData.delay = Math.abs(k - (m.cells.length - 1) / 2) * 0.05;
        cells.push(cell);
        return;
      }
      if (m.style === "wood") {
        for (let q = 0; q < 3; q++) {
          const st = new THREE.Mesh(stakeGeo, STAKE);
          st.position.set(
            (q - 1) * 0.33 + (Math.random() - 0.5) * 0.06,
            1.1 + Math.random() * 0.2,
            (Math.random() - 0.5) * 0.1,
          );
          st.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * 3, (Math.random() - 0.5) * 0.12);
          cell.add(st);
        }
        for (const hy of [0.7, 1.6]) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.1, 0.42), ROPE);
          band.position.y = hy;
          cell.add(band);
        }
        cell.userData.baseY = y;
        cell.userData.delay = Math.abs(k - (m.cells.length - 1) / 2) * 0.05;
        cells.push(cell);
        return;
      }
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 1.0), MOSS_STONE);
      block.position.y = 1.0;
      block.rotation.y = (Math.random() - 0.5) * 0.2;
      cell.add(block);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.45, 0.72), MOSS_STONE);
      cap.position.set((Math.random() - 0.5) * 0.2, 2.3, (Math.random() - 0.5) * 0.1);
      cap.rotation.y = Math.random() * 0.6;
      cell.add(cap);
      for (let t = 0; t < 2; t++) {
        const tuft = crossQuad(cm(MOSS_TUFT), 0.6, 0.4);
        tuft.position.set((Math.random() - 0.5) * 0.6, 2.05 + (t ? 0.48 : 0), (Math.random() - 0.5) * 0.6);
        tuft.rotation.y = Math.random() * 3;
        cell.add(tuft);
      }
      cell.userData.baseY = y;
      cell.userData.delay = Math.abs(k - (m.cells.length - 1) / 2) * 0.05;
      cells.push(cell);
    }
  });
  if (m.kind === "wall") mergeWall(g, cells);
  else mergeFlat(g);
  return g;
}
