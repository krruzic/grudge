// Effect mesh batching: combat effects create plain meshes per instance (repair planks and hammers, projectile
// models, falling arrows, impact rings, warning decals), each its own draw - and on a slow CPU each draw's uniform
// upload, times four split views, is a large share of the frame. Per view, visible effect meshes that share a
// geometry and the same material look are drawn as one InstancedMesh instead: per-instance transform, colour and
// opacity are copied from each original (transparent ones depth-sorted back to front), and the originals are put
// on a hidden layer for that view. Anything unusual (custom shaders, skinning, multi-material, onBeforeRender
// hooks, morphs) is left alone.
import * as THREE from "three";

const HIDDEN_LAYER = 30;
const DEFAULT_BEFORE_RENDER = new THREE.Mesh().onBeforeRender;
const DEFAULT_BEFORE_COMPILE = new THREE.MeshBasicMaterial().onBeforeCompile;

type Mat = THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;

/** The look a batch shares: everything about the material except colour and opacity (those go per instance). */
function lookKey(o: THREE.Mesh): string | null {
  const m = o.material as Mat;
  if (Array.isArray(o.material) || !(m instanceof THREE.MeshBasicMaterial || m instanceof THREE.MeshLambertMaterial))
    return null;
  if (m.onBeforeCompile !== DEFAULT_BEFORE_COMPILE || o.onBeforeRender !== DEFAULT_BEFORE_RENDER) return null;
  if (!m.visible || o.geometry.morphAttributes.position || o.geometry.groups.length > 1) return null;
  const em = (m as THREE.MeshLambertMaterial).emissive;
  return [
    o.geometry.uuid,
    m.type,
    m.map?.uuid ?? "",
    m.alphaMap?.uuid ?? "",
    em ? em.getHexString() : "",
    m.transparent,
    m.blending,
    m.side,
    m.depthTest,
    m.depthWrite,
    m.alphaTest,
    m.vertexColors,
    (m as THREE.MeshLambertMaterial).flatShading ?? "",
    m.fog,
    m.toneMapped,
    m.polygonOffset ? `${m.polygonOffsetFactor},${m.polygonOffsetUnits}` : "",
    m.colorWrite,
    o.renderOrder,
  ].join("|");
}

/** The source material, white and opaque-alpha, reading per-instance opacity from `iOpa`. */
function batchMaterial(src: Mat): Mat {
  const m = src.clone() as Mat;
  m.color.set(1, 1, 1);
  m.opacity = 1;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float iOpa;\nvarying float vIOpa;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvIOpa = iOpa;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vIOpa;")
      .replace("#include <opaque_fragment>", "diffuseColor.a *= vIOpa;\n#include <opaque_fragment>");
  };
  m.customProgramCacheKey = () => "fx-mesh-batch";
  return m;
}

class Batch {
  mesh: THREE.InstancedMesh;
  private opa: THREE.InstancedBufferAttribute;
  private cap = 0;
  readonly list: THREE.Mesh[] = [];

  constructor(src: THREE.Mesh, root: THREE.Object3D) {
    const geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.geometry.attributes)) geo.setAttribute(k, a);
    geo.index = src.geometry.index;
    geo.drawRange = { ...src.geometry.drawRange };
    this.opa = new THREE.InstancedBufferAttribute(new Float32Array(0), 1);
    this.mesh = new THREE.InstancedMesh(geo, batchMaterial(src.material as Mat), 0);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = src.renderOrder;
    this.grow(16);
    root.add(this.mesh);
  }

  private grow(cap: number): void {
    const old = this.mesh;
    const im = new THREE.InstancedMesh(old.geometry, old.material, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.opa = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.opa.setUsage(THREE.DynamicDrawUsage);
    im.geometry.setAttribute("iOpa", this.opa);
    im.frustumCulled = false;
    im.matrixAutoUpdate = false;
    im.renderOrder = old.renderOrder;
    if (old.parent) {
      old.parent.add(im);
      old.removeFromParent();
    }
    this.mesh = im;
    this.cap = cap;
  }

  /** Normal-blended transparent batches are depth-sorted per view; the rest draw in any order. */
  get sorted(): boolean {
    const m0 = this.list[0]?.material as Mat | undefined;
    return !!m0 && m0.transparent && m0.blending !== THREE.AdditiveBlending && this.list.length > 1;
  }

  /** Writes the instances (back to front from `view` when sorted). */
  fill(view: THREE.Matrix4): void {
    const n = this.list.length;
    if (n > this.cap) this.grow(Math.max(n, this.cap * 2));
    if (this.sorted) {
      const e = view.elements;
      const z = (o: THREE.Mesh) => {
        const w = o.matrixWorld.elements;
        return e[2] * w[12] + e[6] * w[13] + e[10] * w[14];
      };
      this.list.sort((a, b) => z(a) - z(b));
    }
    const opa = this.opa.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const o = this.list[i];
      const m = o.material as Mat;
      this.mesh.setMatrixAt(i, o.matrixWorld);
      this.mesh.setColorAt(i, m.color);
      opa[i] = m.opacity;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    for (const a of [this.mesh.instanceMatrix, this.mesh.instanceColor!, this.opa]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export class FxMeshBatches {
  readonly root = new THREE.Group();
  private batches = new Map<string, Batch>();
  private hidden: THREE.Mesh[] = [];
  private groups = new Map<string, THREE.Mesh[]>();

  private frame = -1;

  /**
   * Per view, before drawing. Once per frame (`frame` changed): puts last frame's originals back, then batches
   * every group of two or more matching visible meshes under `under` (skipping `skip` subtrees: other batches,
   * particles). Other views only re-sort the depth-sorted batches for their camera.
   */
  fillView(under: THREE.Object3D, skip: Set<THREE.Object3D>, cam: THREE.Camera, frame: number): void {
    if (frame === this.frame) {
      for (const b of this.batches.values()) if (b.mesh.visible && b.sorted) b.fill(cam.matrixWorldInverse);
      return;
    }
    this.frame = frame;
    for (const o of this.hidden) o.layers.set(0);
    this.hidden.length = 0;
    for (const g of this.groups.values()) g.length = 0;
    const visit = (o: THREE.Object3D) => {
      if (!o.visible || skip.has(o)) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        if (o.layers.mask === 1) {
          const k = lookKey(mesh);
          if (k) {
            let g = this.groups.get(k);
            if (!g) this.groups.set(k, (g = []));
            g.push(mesh);
          }
        }
      }
      for (const c of o.children) visit(c);
    };
    visit(under);
    for (const [k, g] of this.groups) {
      let b = this.batches.get(k);
      if (g.length < 2) {
        if (b) b.mesh.visible = false;
        continue;
      }
      if (!b) this.batches.set(k, (b = new Batch(g[0], this.root)));
      b.list.length = 0;
      for (const o of g) {
        b.list.push(o);
        o.layers.set(HIDDEN_LAYER);
        this.hidden.push(o);
      }
      b.fill(cam.matrixWorldInverse);
    }
    // Batches whose look didn't come up this view.
    for (const [k, b] of this.batches) if (!this.groups.get(k)?.length) b.mesh.visible = false;
    // Looks that stay unused are dropped (effects come and go; keep the map from growing forever).
    if (this.groups.size > 300) {
      for (const [k, g] of this.groups) if (!g.length) this.groups.delete(k);
    }
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    for (const o of this.hidden) o.layers.set(0);
    this.hidden.length = 0;
  }
}
