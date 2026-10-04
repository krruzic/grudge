import * as THREE from "three";

const HIDDEN_LAYER = 31;
const STRIDE = 13;
const MAPS = 12;

const VERT = `
uniform mat3 uvTransform[${MAPS}];
attribute vec3 iPos;
attribute vec2 iScale;
attribute float iRot;
attribute vec2 iCenter;
attribute vec4 iColor;
attribute float iTex;
varying vec2 vUv;
varying vec4 vColor;
flat varying int vTex;
flat varying int vAdd;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
  vAdd = iTex > ${MAPS * 2}.5 ? 1 : 0;
  vTex = int(iTex + 0.5) - (vAdd == 1 ? ${MAPS * 2 + 1} : 0);
  vUv = vTex < ${MAPS} ? (uvTransform[vTex] * vec3(uv, 1.0)).xy : uv;
  vColor = iColor;
  vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
  vec2 scale = iScale;
  #ifndef SB_ATTEN
  if (isPerspectiveMatrix(projectionMatrix)) scale *= -mvPosition.z;
  #endif
  vec2 alignedPosition = (position.xy - (iCenter - vec2(0.5))) * scale;
  vec2 rotatedPosition;
  rotatedPosition.x = cos(iRot) * alignedPosition.x - sin(iRot) * alignedPosition.y;
  rotatedPosition.y = sin(iRot) * alignedPosition.x + cos(iRot) * alignedPosition.y;
  mvPosition.xy += rotatedPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>
  #include <fog_vertex>
}
`;

const FRAG = `
uniform sampler2D map0;
uniform sampler2D map1;
uniform sampler2D map2;
uniform sampler2D map3;
uniform sampler2D map4;
uniform sampler2D map5;
uniform sampler2D map6;
uniform sampler2D map7;
uniform sampler2D map8;
uniform sampler2D map9;
uniform sampler2D map10;
uniform sampler2D map11;
varying vec2 vUv;
varying vec4 vColor;
flat varying int vTex;
flat varying int vAdd;
#include <common>
#include <alphatest_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
  vec4 diffuseColor = vColor;
  #include <clipping_planes_fragment>
  vec3 outgoingLight = vec3(0.0);
  #include <logdepthbuf_fragment>
  if (vTex == 0) diffuseColor *= texture2D(map0, vUv);
  else if (vTex == 1) diffuseColor *= texture2D(map1, vUv);
  else if (vTex == 2) diffuseColor *= texture2D(map2, vUv);
  else if (vTex == 3) diffuseColor *= texture2D(map3, vUv);
  else if (vTex == 4) diffuseColor *= texture2D(map4, vUv);
  else if (vTex == 5) diffuseColor *= texture2D(map5, vUv);
  else if (vTex == 6) diffuseColor *= texture2D(map6, vUv);
  else if (vTex == 7) diffuseColor *= texture2D(map7, vUv);
  else if (vTex == 8) diffuseColor *= texture2D(map8, vUv);
  else if (vTex == 9) diffuseColor *= texture2D(map9, vUv);
  else if (vTex == 10) diffuseColor *= texture2D(map10, vUv);
  else if (vTex == 11) diffuseColor *= texture2D(map11, vUv);
  #include <alphatest_fragment>
  outgoingLight = diffuseColor.rgb;
  #include <opaque_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #ifdef SB_MIX
  gl_FragColor.rgb *= gl_FragColor.a;
  if (vAdd == 1) gl_FragColor.a = 0.0;
  #endif
}
`;

function quad(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3),
  );
  g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  return g;
}

function mixable(m: THREE.SpriteMaterial): boolean {
  return (
    m.transparent &&
    !m.premultipliedAlpha &&
    (m.blending === THREE.NormalBlending || m.blending === THREE.AdditiveBlending)
  );
}

function batchKey(s: THREE.Sprite): string {
  const m = s.material;
  return `${mixable(m) ? "mix" : m.blending}|${m.depthTest}|${m.depthWrite}|${m.transparent}|${s.renderOrder}|${m.fog}|${m.sizeAttenuation}|${m.alphaTest}|${m.toneMapped}|${m.premultipliedAlpha}`;
}

class SpriteBatch {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly members: THREE.Sprite[] = [];
  readonly maps: THREE.Texture[] = [];
  private uses: number[] = [];
  private buf!: THREE.InstancedInterleavedBuffer;
  private cap = 0;
  private sort: boolean;
  private idx: number[] = [];
  private depth = new Float32Array(16);

  constructor(src: THREE.Sprite) {
    const m = src.material;
    const mix = mixable(m);
    this.sort = mix || m.blending !== THREE.AdditiveBlending;
    const defines: Record<string, string> = {};
    if (mix) defines.SB_MIX = "";
    if (m.sizeAttenuation) defines.SB_ATTEN = "";
    const own: Record<string, THREE.IUniform> = {
      uvTransform: { value: Array.from({ length: MAPS }, () => new THREE.Matrix3()) },
      alphaTest: { value: m.alphaTest },
    };
    for (let i = 0; i < MAPS; i++) own[`map${i}`] = { value: null };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...own },
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines,
      transparent: m.transparent,
      blending: mix ? THREE.CustomBlending : m.blending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthTest: m.depthTest,
      depthWrite: m.depthWrite,
      fog: m.fog,
      alphaTest: m.alphaTest,
      toneMapped: m.toneMapped,
      premultipliedAlpha: m.premultipliedAlpha,
    });
    this.mesh = new THREE.Mesh(quad(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = src.renderOrder;
    this.mesh.visible = false;
    this.grow(16);
  }

  accepts(map: THREE.Texture | null): boolean {
    return !map || this.maps.includes(map) || this.maps.length < MAPS || this.uses.includes(0);
  }

  add(s: THREE.Sprite): void {
    const map = s.material.map;
    if (map) {
      let i = this.maps.indexOf(map);
      if (i < 0) {
        i = this.maps.length < MAPS ? this.maps.length : this.uses.indexOf(0);
        this.maps[i] = map;
        this.uses[i] = 0;
        this.mesh.material.uniforms[`map${i}`].value = map;
      }
      this.uses[i]++;
    }
    this.members.push(s);
  }

  private grow(cap: number): void {
    const old = this.mesh.geometry;
    const g = old.attributes.iPos ? quad() : old;
    this.buf = new THREE.InstancedInterleavedBuffer(new Float32Array(cap * STRIDE), STRIDE);
    this.buf.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iPos", new THREE.InterleavedBufferAttribute(this.buf, 3, 0));
    g.setAttribute("iScale", new THREE.InterleavedBufferAttribute(this.buf, 2, 3));
    g.setAttribute("iRot", new THREE.InterleavedBufferAttribute(this.buf, 1, 5));
    g.setAttribute("iCenter", new THREE.InterleavedBufferAttribute(this.buf, 2, 6));
    g.setAttribute("iColor", new THREE.InterleavedBufferAttribute(this.buf, 4, 8));
    g.setAttribute("iTex", new THREE.InterleavedBufferAttribute(this.buf, 1, 12));
    g.instanceCount = 0;
    if (g !== old) {
      this.mesh.geometry = g;
      old.dispose();
    }
    this.cap = cap;
  }

  fill(camera: THREE.Camera): void {
    const idx = this.idx;
    idx.length = 0;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const s = this.members[i];
      let o: THREE.Object3D | null = s;
      let vis = s.material.visible;
      let top: THREE.Object3D = s;
      while (o) {
        if (!o.visible) vis = false;
        top = o;
        o = o.parent;
      }
      if (!(top as THREE.Scene).isScene) {
        this.members.splice(i, 1);
        for (let k = 0; k < idx.length; k++) idx[k]--;
        continue;
      }
      if (!vis || (s.material.opacity <= 0 && !s.material.depthWrite)) continue;
      idx.push(i);
    }
    this.uses.fill(0);
    for (const s of this.members) {
      const mp = s.material.map;
      if (!mp) continue;
      const i = this.maps.indexOf(mp);
      if (i >= 0) this.uses[i]++;
    }
    for (let k = idx.length - 1; k >= 0; k--) {
      const mp = this.members[idx[k]].material.map;
      if (!mp || this.maps.includes(mp)) continue;
      const free = this.maps.length < MAPS ? this.maps.length : this.uses.indexOf(0);
      if (free < 0) {
        idx.splice(k, 1);
        continue;
      }
      this.maps[free] = mp;
      this.uses[free] = 1;
      this.mesh.material.uniforms[`map${free}`].value = mp;
    }
    const n = idx.length;
    this.mesh.visible = n > 0;
    if (!n) return;
    if (n > this.cap) this.grow(Math.max(n, this.cap * 2));
    if (this.depth.length < this.members.length) this.depth = new Float32Array(this.members.length * 2);
    const v = camera.matrixWorldInverse.elements;
    const d = this.depth;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < n; k++) {
      const e = this.members[idx[k]].matrixWorld.elements;
      cx += e[12];
      cy += e[13];
      cz += e[14];
      d[idx[k]] = v[2] * e[12] + v[6] * e[13] + v[10] * e[14];
    }
    if (this.sort && n > 1) idx.sort((a, b) => d[a] - d[b] || a - b);
    const arr = this.buf.array as Float32Array;
    for (let k = 0; k < n; k++) {
      const s = this.members[idx[k]];
      const e = s.matrixWorld.elements;
      const m = s.material;
      const o = k * STRIDE;
      arr[o] = e[12];
      arr[o + 1] = e[13];
      arr[o + 2] = e[14];
      arr[o + 3] = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
      arr[o + 4] = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
      arr[o + 5] = m.rotation;
      arr[o + 6] = s.center.x;
      arr[o + 7] = s.center.y;
      arr[o + 8] = m.color.r;
      arr[o + 9] = m.color.g;
      arr[o + 10] = m.color.b;
      arr[o + 11] = m.opacity;
      arr[o + 12] =
        (m.map ? this.maps.indexOf(m.map) : MAPS) + (m.blending === THREE.AdditiveBlending ? MAPS * 2 + 1 : 0);
    }
    this.buf.clearUpdateRanges();
    this.buf.addUpdateRange(0, n * STRIDE);
    this.buf.needsUpdate = true;
    this.mesh.geometry.instanceCount = n;
    const uv = this.mesh.material.uniforms.uvTransform.value as THREE.Matrix3[];
    this.maps.forEach((t, i) => {
      if (t.matrixAutoUpdate) t.updateMatrix();
      uv[i].copy(t.matrix);
    });
    this.mesh.matrix.makeTranslation(cx / n, cy / n, cz / n);
    if (this.mesh.parent) this.mesh.matrixWorld.multiplyMatrices(this.mesh.parent.matrixWorld, this.mesh.matrix);
    else this.mesh.matrixWorld.copy(this.mesh.matrix);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}

export class SpriteBatches {
  readonly root = new THREE.Group();
  private batches = new Map<string, SpriteBatch[]>();

  add(s: THREE.Sprite): void {
    const k = batchKey(s);
    const list = this.batches.get(k) ?? [];
    this.batches.set(k, list);
    let b = list.find((q) => q.accepts(s.material.map));
    if (!b) {
      b = new SpriteBatch(s);
      list.push(b);
      this.root.add(b.mesh);
    }
    b.add(s);
    s.layers.set(HIDDEN_LAYER);
  }

  addTree(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (o instanceof THREE.Sprite) this.add(o);
    });
  }

  fill(camera: THREE.Camera): void {
    for (const list of this.batches.values()) for (const b of list) b.fill(camera);
  }

  dispose(): void {
    for (const list of this.batches.values()) for (const b of list) b.dispose();
    this.batches.clear();
  }
}
