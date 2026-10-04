import * as THREE from "three";
import { layerTexture } from "./mergedModel";
import { partsMaterial, type StructureModels } from "./structureModels";

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

function buildShared(models: StructureModels): Shared | null {
  const kinds = models.bakedKinds();
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
  return { tex: layerTexture(maps), parts, geos, verts, index };
}

export class StructureBatch {
  readonly root = new THREE.Group();
  private shared: Shared | null | undefined;
  private teams = new Map<number, { mesh: THREE.BatchedMesh; ids: Map<THREE.BufferGeometry, number> }>();
  private members: Member[] = [];
  private tmp = new THREE.Color();

  constructor(
    private models: StructureModels,
    private teamColor: (team: number) => THREE.Color,
  ) {}

  private team(t: number): { mesh: THREE.BatchedMesh; ids: Map<THREE.BufferGeometry, number> } | null {
    let b = this.teams.get(t);
    if (b) return b;
    if (this.shared === undefined) this.shared = buildShared(this.models);
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
    mesh.matrixAutoUpdate = false;
    const ids = new Map<THREE.BufferGeometry, number>();
    for (const [src, g] of sh.geos) ids.set(src, mesh.addGeometry(g));
    b = { mesh, ids };
    this.teams.set(t, b);
    this.root.add(mesh);
    return b;
  }

  add(body: THREE.Object3D, team: number, flash: () => boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    body.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.userData.structKind) return;
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
    for (const b of this.teams.values()) {
      b.mesh.dispose();
      (b.mesh.material as THREE.Material).dispose();
    }
    this.teams.clear();
    this.members.length = 0;
    this.shared?.tex.dispose();
    this.shared = undefined;
    this.root.clear();
  }
}
