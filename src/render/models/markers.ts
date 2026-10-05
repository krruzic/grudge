// Small shared markers attached to models: blob shadows and foot rings (drawn through instanced batches by
// EntityViews), player name tags, markModel() for flagging model geometry as shared, and the Warlord placeholder.
import * as THREE from "three";
import { cacheCanvas } from "../../ui/cacheCanvas";

function part(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  parent: THREE.Object3D,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function warlordPlaceholder(teamColor: THREE.Color): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x7d9a52, flatShading: true });
  const team = new THREE.MeshLambertMaterial({ color: teamColor, flatShading: true });
  const iron = new THREE.MeshLambertMaterial({ color: 0x5a4a3a, flatShading: true });

  part(new THREE.BoxGeometry(0.22, 0.5, 0.26), iron, -0.2, 0.25, 0, g);
  part(new THREE.BoxGeometry(0.22, 0.5, 0.26), iron, 0.2, 0.25, 0, g);
  part(new THREE.BoxGeometry(0.85, 0.65, 0.55), team, 0, 0.82, 0, g);
  part(new THREE.IcosahedronGeometry(0.34, 0), skin, 0, 1.36, 0.04, g);
  part(new THREE.BoxGeometry(0.3, 0.12, 0.12), skin, 0, 1.24, 0.3, g);
  part(new THREE.BoxGeometry(0.22, 0.6, 0.22), skin, -0.56, 0.85, 0, g);
  const arm = part(new THREE.BoxGeometry(0.22, 0.6, 0.22), skin, 0.56, 0.85, 0.05, g);
  const club = part(new THREE.CylinderGeometry(0.16, 0.06, 0.95, 6), iron, 0, -0.35, 0.3, arm);
  club.rotation.x = Math.PI / 2.4;
  return g;
}

export function markModel(o: THREE.Object3D): THREE.Object3D {
  o.traverse((m) => {
    const g = (m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g) g.userData.model = true;
  });
  return o;
}

let blobTex: THREE.Texture | undefined;

export function blobShadow(radius = 0.75): THREE.Mesh {
  if (!blobTex) {
    const n = 32;
    const data = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
        const a = Math.max(0, 1 - d * d) ** 1.2;
        data.set([0, 0, 0, Math.round(a * 255)], (y * n + x) * 4);
      }
    }
    blobTex = new THREE.DataTexture(data, n, n);
    blobTex.magFilter = THREE.LinearFilter;
    blobTex.minFilter = THREE.LinearFilter;
    blobTex.needsUpdate = true;
  }
  blobGeo ??= markGeo(new THREE.PlaneGeometry(2, 2));
  blobMat ??= keepMat(
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.55, depthWrite: false, fog: true }),
  );
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.set(radius, radius, 1);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  m.userData.blob = true;
  return m;
}

let blobGeo: THREE.BufferGeometry | undefined;
let blobMat: THREE.MeshBasicMaterial | undefined;
function markGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.userData.model = true;
  return g;
}
function keepMat<T extends THREE.Material>(m: T): T {
  m.userData.keep = true;
  return m;
}

export function blobBatch(max: number): THREE.InstancedMesh {
  blobShadow();
  const im = new THREE.InstancedMesh(blobGeo!, blobMat!, max);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.count = 0;
  im.frustumCulled = false;
  im.renderOrder = 1;
  im.matrixAutoUpdate = false;
  return im;
}

let ringGeo: THREE.BufferGeometry | undefined;
export function footRing(teamColor: THREE.Color): THREE.Mesh {
  ringGeo ??= markGeo(new THREE.RingGeometry(0.62, 0.8, 16));
  const ring = new THREE.Mesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  ring.userData.footRing = true;
  return ring;
}

export function footRingBatch(max: number): THREE.InstancedMesh {
  ringGeo ??= markGeo(new THREE.RingGeometry(0.62, 0.8, 16));
  const im = new THREE.InstancedMesh(
    ringGeo,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }),
    max,
  );
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.setColorAt(0, new THREE.Color());
  im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  im.count = 0;
  im.frustumCulled = false;
  im.matrixAutoUpdate = false;
  return im;
}

export function playerTag(label: string, teamColor: THREE.Color): THREE.Sprite {
  // The plate grows with the name (signed tags are up to 8 letters), keeping the P1-sized height.
  const c = cacheCanvas();
  const font = "bold 12px monospace";
  const m = c.getContext("2d")!;
  m.font = font;
  const bw = Math.max(32, Math.ceil(m.measureText(label).width) + 8);
  c.width = bw * 4;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.scale(4, 4);
  ctx.fillStyle = `#${teamColor.getHexString()}`;
  ctx.fillRect(0, 0, bw, 16);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, bw - 2, 14);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const hsl = { h: 0, s: 0, l: 0 };
  teamColor.getHSL(hsl);
  ctx.fillStyle = hsl.l > 0.5 && hsl.h > 0.1 && hsl.h < 0.55 ? "#101010" : "#fff";
  ctx.fillText(label, bw / 2, 9);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.owned = true;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.9 * (bw / 32), 0.45, 1);
  s.position.y = 2.75;
  s.renderOrder = 10;
  return s;
}
