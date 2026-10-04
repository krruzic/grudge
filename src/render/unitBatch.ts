import * as THREE from "three";

const MAX = 128;

const SKIN_PARS = `
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute vec3 iEmis;
attribute float iSlot;
varying vec3 vInstEmis;
uniform highp sampler2D uBones;
uniform mat4 uBind;
mat4 instBone(float b) {
  int x = int(b) * 4;
  int y = int(iSlot + 0.5);
  return mat4(texelFetch(uBones, ivec2(x, y), 0), texelFetch(uBones, ivec2(x + 1, y), 0), texelFetch(uBones, ivec2(x + 2, y), 0), texelFetch(uBones, ivec2(x + 3, y), 0));
}
mat4 instSkin() {
  mat4 m = skinWeight.x * instBone(skinIndex.x) + skinWeight.y * instBone(skinIndex.y) + skinWeight.z * instBone(skinIndex.z) + skinWeight.w * instBone(skinIndex.w);
  return m * uBind;
}
`;

function skinned(
  mat: THREE.Material,
  withNormals: boolean,
  uniforms: { uBones: { value: THREE.Texture }; uBind: { value: THREE.Matrix4 } },
  key: string,
): void {
  const inner = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    inner(shader, r);
    shader.uniforms.uBones = uniforms.uBones;
    shader.uniforms.uBind = uniforms.uBind;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>\n${SKIN_PARS}`);
    if (withNormals) {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          "#include <beginnormal_vertex>\nmat4 skinM = instSkin();\nobjectNormal = normalize(mat3(skinM) * objectNormal);\nvInstEmis = iEmis;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ntransformed = (skinM * vec4(transformed, 1.0)).xyz;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vInstEmis;")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vInstEmis;",
        );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nmat4 skinM = instSkin();\ntransformed = (skinM * vec4(transformed, 1.0)).xyz;\nvInstEmis = iEmis;",
      );
    }
  };
  const prev = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${prev()}|inst-skin-${key}`;
}

interface Member {
  mesh: THREE.SkinnedMesh;
  anchor: THREE.Object3D;
  flash: () => boolean;
}

class Batch {
  readonly mesh: THREE.Mesh;
  readonly sil: THREE.Mesh | null;
  readonly members: Member[] = [];
  private live: Member[] = [];
  private tex: THREE.DataTexture;
  private data: Float32Array;
  private rows = 0;
  private emis: THREE.InstancedBufferAttribute;
  private slot: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;
  private bones: number;
  private uniforms: { uBones: { value: THREE.Texture }; uBind: { value: THREE.Matrix4 } };
  private tmp = new THREE.Matrix4();

  constructor(src: THREE.SkinnedMesh, material: THREE.Material, silMaterial: THREE.Material | null) {
    this.bones = src.skeleton.bones.length;
    this.data = new Float32Array(0);
    this.tex = new THREE.DataTexture();
    this.uniforms = { uBones: { value: this.tex }, uBind: { value: src.bindMatrix.clone() } };
    this.grow(16);
    const g = new THREE.InstancedBufferGeometry();
    const sg = src.geometry;
    g.index = sg.index;
    for (const [k, a] of Object.entries(sg.attributes)) g.setAttribute(k, a);
    this.emis = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.emis.setUsage(THREE.DynamicDrawUsage);
    this.slot = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.slot.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iEmis", this.emis);
    g.setAttribute("iSlot", this.slot);
    g.instanceCount = 0;
    g.userData.model = true;
    this.geo = g;
    skinned(material, true, this.uniforms, "lit");
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    if (silMaterial) {
      skinned(silMaterial, false, this.uniforms, "sil");
      this.sil = new THREE.Mesh(g, silMaterial);
      this.sil.frustumCulled = false;
      this.sil.renderOrder = 1000;
      this.sil.matrixAutoUpdate = false;
      this.sil.visible = false;
    } else this.sil = null;
  }

  private grow(rows: number): void {
    const old = this.data;
    this.rows = rows;
    this.data = new Float32Array(this.bones * 16 * rows);
    this.data.set(old.subarray(0, Math.min(old.length, this.data.length)));
    this.tex.dispose();
    this.tex = new THREE.DataTexture(this.data, this.bones * 4, rows, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.uniforms.uBones.value = this.tex;
  }

  fill(scene: THREE.Object3D): void {
    this.live.length = 0;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const mb = this.members[i];
      let o: THREE.Object3D | null = mb.anchor;
      let vis = true;
      while (o && o !== scene) {
        if (!o.visible) vis = false;
        o = o.parent;
      }
      if (!o) {
        this.members.splice(i, 1);
        continue;
      }
      if (vis && this.live.length < MAX) this.live.push(mb);
    }
    const n = this.live.length;
    if (n > this.rows) this.grow(Math.min(MAX, Math.max(n, this.rows * 2)));
    for (let k = 0; k < n; k++) {
      const sk = this.live[k].mesh.skeleton;
      const base = k * this.bones * 16;
      for (let b = 0; b < this.bones; b++) {
        this.tmp.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]);
        this.data.set(this.tmp.elements, base + b * 16);
      }
    }
    if (n) this.tex.needsUpdate = true;
  }

  view(): void {
    let n = 0;
    const em = this.emis.array as Float32Array;
    const sl = this.slot.array as Float32Array;
    for (let k = 0; k < this.live.length; k++) {
      const mb = this.live[k];
      let o: THREE.Object3D | null = mb.anchor;
      while (o && o.visible) o = o.parent;
      if (o) continue;
      const f = mb.flash();
      sl[n] = k;
      em[n * 3] = f ? 0.6 : 0;
      em[n * 3 + 1] = f ? 0.58 : 0;
      em[n * 3 + 2] = f ? 0.52 : 0;
      n++;
    }
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (this.sil) this.sil.visible = n > 0;
    if (!n) return;
    for (const a of [this.emis, this.slot]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.tex.dispose();
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
    (this.sil?.material as THREE.Material | undefined)?.dispose();
  }
}

export class UnitBatches {
  readonly root = new THREE.Group();
  readonly silRoot = new THREE.Group();
  private batches = new Map<string, Batch>();

  add(
    mesh: THREE.SkinnedMesh,
    hide: THREE.Object3D,
    key: string,
    make: () => { material: THREE.Material; sil: THREE.Material | null },
    flash: () => boolean,
  ): void {
    let b = this.batches.get(key);
    if (!b) {
      const m = make();
      b = new Batch(mesh, m.material, m.sil);
      this.batches.set(key, b);
      this.root.add(b.mesh);
      if (b.sil) this.silRoot.add(b.sil);
    }
    hide.visible = false;
    b.members.push({ mesh, anchor: hide.parent!, flash });
  }

  fill(scene: THREE.Object3D): void {
    for (const b of this.batches.values()) b.fill(scene);
  }

  view(): void {
    for (const b of this.batches.values()) b.view();
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.root.clear();
    this.silRoot.clear();
  }
}
