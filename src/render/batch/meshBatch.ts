// Static mesh batching: meshes with the same geometry+material key are drawn as one InstancedMesh, hiding the
// originals (moved to a hidden layer) and copying their world matrices each frame; `flash` tints an instance
// for hit flashes.
import * as THREE from "three";

const HIDDEN_LAYER = 31;
const FLASH = new THREE.Color(0.6, 0.58, 0.52);

function instMaterial(src: THREE.Material): THREE.Material {
  const m = src.clone();
  // Each instance's own colour comes through instanceColor (multiplied in), so the batch's base is white.
  if ((m as THREE.MeshLambertMaterial).color) (m as THREE.MeshLambertMaterial).color.set(1, 1, 1);
  const inner = src.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    inner.call(m, shader, r);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 iEmis;\nvarying vec3 vIEmis;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvIEmis = iEmis;");
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vIEmis;\n#define emissive vIEmis",
    );
  };
  const key = src.customProgramCacheKey.call(src);
  m.customProgramCacheKey = () => `${key}|inst-emis`;
  return m;
}

class Batch {
  mesh: THREE.InstancedMesh;
  readonly members: { m: THREE.Mesh; flash: () => boolean }[] = [];
  private emis: THREE.InstancedBufferAttribute;
  private cap: number;

  constructor(private src: THREE.Mesh) {
    this.cap = 0;
    this.emis = new THREE.InstancedBufferAttribute(new Float32Array(0), 3);
    this.mesh = this.build(16);
  }

  private build(cap: number): THREE.InstancedMesh {
    const old = this.mesh as THREE.InstancedMesh | undefined;
    let geo = old?.geometry as THREE.BufferGeometry | undefined;
    if (!geo) {
      geo = new THREE.BufferGeometry();
      for (const k of Object.keys(this.src.geometry.attributes)) geo.setAttribute(k, this.src.geometry.getAttribute(k));
      geo.index = this.src.geometry.index;
      for (const g of this.src.geometry.groups) geo.addGroup(g.start, g.count, g.materialIndex);
      geo.drawRange = { ...this.src.geometry.drawRange };
    }
    this.emis = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.emis.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iEmis", this.emis);
    const mat = old ? (old.material as THREE.Material) : instMaterial(this.src.material as THREE.Material);
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    im.matrixAutoUpdate = false;
    im.renderOrder = this.src.renderOrder;
    this.cap = cap;
    if (old) {
      old.parent?.add(im);
      old.removeFromParent();
      old.dispose();
    }
    return im;
  }

  add(m: THREE.Mesh, flash: () => boolean): void {
    this.members.push({ m, flash });
    if (this.members.length > this.cap) this.mesh = this.build(this.cap * 2);
  }

  fill(scene: THREE.Object3D): void {
    let n = 0;
    const arr = this.emis.array as Float32Array;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const { m, flash } = this.members[i];
      let o: THREE.Object3D | null = m;
      let vis = true;
      while (o && o !== scene) {
        if (!o.visible && !o.userData.batchHidden) vis = false;
        o = o.parent;
      }
      if (!o) {
        this.members.splice(i, 1);
        continue;
      }
      if (!vis) continue;
      this.mesh.setMatrixAt(n, m.matrixWorld);
      const col = (m.material as THREE.MeshLambertMaterial).color;
      if (col) this.mesh.setColorAt(n, col);
      const e = flash() ? FLASH : (m.material as THREE.MeshLambertMaterial).emissive;
      arr[n * 3] = e ? e.r : 0;
      arr[n * 3 + 1] = e ? e.g : 0;
      arr[n * 3 + 2] = e ? e.b : 0;
      n++;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges();
    im.addUpdateRange(0, n * 16);
    im.needsUpdate = true;
    const ic = this.mesh.instanceColor!;
    ic.clearUpdateRanges();
    ic.addUpdateRange(0, n * 3);
    ic.needsUpdate = true;
    this.emis.clearUpdateRanges();
    this.emis.addUpdateRange(0, n * 3);
    this.emis.needsUpdate = true;
  }

  dispose(): void {
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

export class MeshBatches {
  readonly root = new THREE.Group();
  private batches = new Map<string, Batch>();

  /**
   * Batches are per geometry and material look - texture, flat shading, transparency, blending - but not colour
   * or emissive, which go per instance, so both teams' copies of a model share one batch (one draw per view
   * instead of one per team). `key` is kept for callers whose meshes differ in other ways.
   */
  add(mesh: THREE.Mesh, key: string, flash: () => boolean): void {
    const mt = mesh.material as THREE.MeshLambertMaterial;
    const look = `${mt.type}|${mt.map?.uuid ?? ""}|${mt.flatShading}|${mt.transparent}|${mt.opacity}|${mt.side}|${mt.vertexColors}|${mt.customProgramCacheKey?.() ?? ""}`;
    const k = `${mesh.geometry.uuid}|${mt.color ? look : key}`;
    let b = this.batches.get(k);
    if (!b) {
      b = new Batch(mesh);
      this.batches.set(k, b);
    }
    b.add(mesh, flash);
    if (!b.mesh.parent) this.root.add(b.mesh);
    mesh.layers.set(HIDDEN_LAYER);
  }

  addTree(
    root: THREE.Object3D,
    key: string,
    flash: () => boolean,
    ok: (m: THREE.Mesh) => boolean = () => true,
  ): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    root.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        !(o instanceof THREE.SkinnedMesh) &&
        !(o instanceof THREE.InstancedMesh) &&
        !Array.isArray(o.material) &&
        o.geometry.userData.model &&
        ok(o)
      ) {
        this.add(o, key, flash);
        out.push(o);
      }
    });
    return out;
  }

  fill(scene: THREE.Object3D): void {
    for (const b of this.batches.values()) b.fill(scene);
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.root.clear();
  }
}
