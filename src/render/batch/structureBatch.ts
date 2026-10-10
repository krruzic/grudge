// Structure batching: baked structure parts are drawn with one THREE.BatchedMesh per team (team-tinted texture
// array material from StructureModels); fillFrame() copies matrices, fillView() applies per-view visibility.
import * as THREE from "three";
import { layerTexture } from "../models/mergedModel";
import { partsMaterial, type StructureModels } from "../structureModels";

const FLASH = new THREE.Color(0.6, 0.58, 0.52);
const BLACK = new THREE.Color(0, 0, 0);
const HIDDEN_LAYER = 31;

const COLOR_VERTEX = `
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
vBEmis = getBatchingColor( getIndirectIndex( gl_DrawID ) ).rgb;
`;

interface Member {
  mesh: THREE.Mesh;
  id: number;
  flash: () => boolean;
}

interface Shared {
  tex: THREE.DataArrayTexture;
  parts: string[];
  geos: Map<THREE.BufferGeometry, THREE.BufferGeometry>;
  verts: number;
  index: number;
}

/** The texture array and remapped part geometries depend only on the models, so every batch shares them. */
const sharedCache = [new WeakMap<StructureModels, Shared | null>(), new WeakMap<StructureModels, Shared | null>()];

function buildShared(models: StructureModels, big: boolean): Shared | null {
  const cache = sharedCache[big ? 1 : 0];
  if (cache.has(models)) return cache.get(models)!;
  const sh = makeShared(models, big);
  cache.set(models, sh);
  return sh;
}

function makeShared(models: StructureModels, big: boolean): Shared | null {
  const kinds = models.bakedKinds(big);
  if (!kinds.length) return null;
  const maps: (THREE.Texture | null)[] = [];
  const parts: string[] = [];
  const geos = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  let verts = 0;
  let index = 0;
  for (const k of kinds) {
    const off = maps.length;
    maps.push(...k.maps);
    parts.push(...k.parts);
    for (const g of k.geos) {
      const c = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(g.attributes)) c.setAttribute(name, name === "aMat" ? a.clone() : a);
      const m = c.getAttribute("aMat") as THREE.BufferAttribute;
      for (let i = 0; i < m.count; i++) m.setX(i, m.getX(i) + off);
      c.setIndex(g.index);
      geos.set(g, c);
      verts += c.getAttribute("position").count;
      index += g.index ? g.index.count : 0;
    }
  }
  return { tex: layerTexture(maps, big ? 1024 : 256), parts, geos, verts, index };
}

type TeamBatch = { mesh: THREE.BatchedMesh; ids: Map<THREE.BufferGeometry, number>; color: string };

/**
 * Emptied team batches from disposed StructureBatches, by models and team colour: building one copies every
 * structure part into a BatchedMesh, so a new world (e.g. the menu backdrop swapping fields) reuses them.
 */
const pool = [
  new WeakMap<StructureModels, Map<string, TeamBatch[]>>(),
  new WeakMap<StructureModels, Map<string, TeamBatch[]>>(),
];

export class StructureBatch {
  readonly root = new THREE.Group();
  private shared: Shared | null | undefined;
  private teams = new Map<number, TeamBatch>();
  private members: Member[] = [];
  private tmp = new THREE.Color();

  /**
   * `big`: this batch draws the large-texture pieces (Tripo building bodies, StructureModels mergeBig), else the
   * small baked parts. EntityViews keeps one of each.
   */
  constructor(
    private models: StructureModels,
    private teamColor: (team: number) => THREE.Color,
    private big = false,
  ) {}

  private team(t: number): TeamBatch | null {
    let b = this.teams.get(t);
    if (b) return b;
    const reuse = pool[this.big ? 1 : 0].get(this.models)?.get(this.teamColor(t).getHexString())?.pop();
    if (reuse) {
      this.teams.set(t, reuse);
      this.root.add(reuse.mesh);
      return reuse;
    }
    if (this.shared === undefined) this.shared = buildShared(this.models, this.big);
    const sh = this.shared;
    if (!sh) return null;
    const mat = partsMaterial(sh.tex, sh.parts, this.teamColor(t), sh.parts.length);
    const inner = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      inner.call(mat, shader, r);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vBEmis;")
        .replace("#include <color_vertex>", COLOR_VERTEX);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vBEmis;\n#define emissive vBEmis",
      );
    };
    const key = mat.customProgramCacheKey();
    mat.customProgramCacheKey = () => `${key}|batched`;
    const mesh = new THREE.BatchedMesh(64, sh.verts, sh.index, mat);
    mesh.frustumCulled = false;
    // No per-instance culling / sorting every view (that rebuilt and re-uploaded the draw list four times a frame
    // in split screen); the GPU skips off-screen buildings cheaply.
    mesh.sortObjects = false;
    mesh.perObjectFrustumCulled = false;
    mesh.matrixAutoUpdate = false;
    const ids = new Map<THREE.BufferGeometry, number>();
    for (const [src, g] of sh.geos) ids.set(src, mesh.addGeometry(g));
    b = { mesh, ids, color: this.teamColor(t).getHexString() };
    this.teams.set(t, b);
    this.root.add(mesh);
    return b;
  }

  add(body: THREE.Object3D, team: number, flash: () => boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    body.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.userData.structKind || !!o.userData.structBig !== this.big) return;
      const b = this.team(team);
      const gid = b?.ids.get(o.geometry);
      if (!b || gid === undefined) return;
      if (b.mesh.instanceCount >= b.mesh.maxInstanceCount) b.mesh.setInstanceCount(b.mesh.maxInstanceCount * 2);
      const id = b.mesh.addInstance(gid);
      b.mesh.setColorAt(id, BLACK);
      o.layers.set(HIDDEN_LAYER);
      o.userData.batchTeam = team;
      this.members.push({ mesh: o, id, flash });
      out.push(o);
    });
    return out;
  }

  fillFrame(scene: THREE.Object3D): void {
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i];
      let o: THREE.Object3D | null = m.mesh;
      while (o && o !== scene) o = o.parent;
      const b = this.teams.get(m.mesh.userData.batchTeam as number)!;
      if (!o) {
        b.mesh.deleteInstance(m.id);
        this.members.splice(i, 1);
        continue;
      }
      b.mesh.setMatrixAt(m.id, m.mesh.matrixWorld);
      this.tmp.copy(m.flash() ? FLASH : BLACK);
      b.mesh.setColorAt(m.id, this.tmp);
    }
  }

  fillView(): void {
    for (const m of this.members) {
      let o: THREE.Object3D | null = m.mesh;
      while (o && (o.visible || o.userData.batchHidden)) o = o.parent;
      this.teams.get(m.mesh.userData.batchTeam as number)!.mesh.setVisibleAt(m.id, !o);
    }
  }

  dispose(): void {
    for (const m of this.members) this.teams.get(m.mesh.userData.batchTeam as number)?.mesh.deleteInstance(m.id);
    const pl = pool[this.big ? 1 : 0];
    let byColor = pl.get(this.models);
    if (!byColor) pl.set(this.models, (byColor = new Map()));
    for (const b of this.teams.values()) {
      const list = byColor.get(b.color) ?? [];
      list.push(b);
      byColor.set(b.color, list);
    }
    this.teams.clear();
    this.members.length = 0;
    this.shared = undefined;
    this.root.clear();
  }
}
