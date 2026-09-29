import * as THREE from "three";

function part(
  geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D,
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
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.55, depthWrite: false, fog: true }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  m.renderOrder = 1;
  return m;
}

export function footRing(teamColor: THREE.Color): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.8, 16),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  return ring;
}

export function playerTag(label: string, teamColor: THREE.Color): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = `#${teamColor.getHexString()}`;
  ctx.fillRect(0, 0, 32, 16);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 30, 14);
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  ctx.fillText(label, 16, 9);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(0.9, 0.45, 1);
  s.position.y = 2.75;
  s.renderOrder = 10;
  return s;
}
