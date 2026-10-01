import * as THREE from "three";
import type { World } from "../sim/world";
import { abilities } from "../sim/talents";

export interface ReticleReq {
  heroId: number;
  slot: "r" | "z";
  dx: number;
  dz: number;
  range: number;
}

function ringTex(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const m = 64;
  g.lineWidth = 7;
  g.strokeStyle = "rgba(20,10,0,0.7)";
  g.beginPath();
  g.arc(m, m, 58, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.strokeStyle = "#fff0b0";
  g.setLineDash([10, 7]);
  g.beginPath();
  g.arc(m, m, 58, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function areaTex(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  gr.addColorStop(0, "rgba(255,230,140,0.12)");
  gr.addColorStop(0.85, "rgba(255,220,120,0.3)");
  gr.addColorStop(1, "rgba(255,220,120,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  g.lineWidth = 5;
  g.strokeStyle = "#ffe070";
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.save();
    g.translate(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
    g.rotate(a + Math.PI / 2);
    g.fillStyle = "#3a1a00";
    g.beginPath();
    g.moveTo(-8, -6);
    g.lineTo(8, -6);
    g.lineTo(0, 6);
    g.fill();
    g.fillStyle = "#ffd23a";
    g.beginPath();
    g.moveTo(-5, -4);
    g.lineTo(5, -4);
    g.lineTo(0, 3);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const RANGE_TEX = ringTex();
const AREA_TEX = areaTex();

export class Reticles {
  readonly root = new THREE.Group();
  private pool: { range: THREE.Mesh; area: THREE.Mesh; wall: THREE.Group }[] = [];

  private make(): { range: THREE.Mesh; area: THREE.Mesh; wall: THREE.Group } {
    const mat = (tex: THREE.Texture, op: number) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, depthWrite: false, depthTest: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const range = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat(RANGE_TEX, 0.55));
    range.rotation.x = -Math.PI / 2;
    range.renderOrder = 5;
    const area = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat(AREA_TEX, 0.95));
    area.rotation.x = -Math.PI / 2;
    area.renderOrder = 6;
    const wall = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.6, depthTest: false }));
      b.renderOrder = 6;
      wall.add(b);
    }
    this.root.add(range, area, wall);
    const r = { range, area, wall };
    this.pool.push(r);
    return r;
  }

  sync(world: World, reqs: ReticleReq[], time: number): void {
    while (this.pool.length < reqs.length) this.make();
    this.pool.forEach((p, i) => {
      const q = reqs[i];
      const e = q ? world.getAny(q.heroId) : undefined;
      const on = !!q && !!e?.alive;
      p.range.visible = p.area.visible = p.wall.visible = false;
      if (!on || !q || !e) return;
      const hx = e.transform.pos.x;
      const hz = e.transform.pos.z;
      const tx = hx + q.dx;
      const tz = hz + q.dz;
      const gy = world.groundY(tx, tz);
      p.range.visible = true;
      p.range.position.set(hx, world.groundY(hx, hz) + 0.1, hz);
      p.range.scale.setScalar(q.range);
      p.range.rotation.z = time * 0.3;
      const def = abilities(world, e)[q.slot];
      const pulse = 1 + Math.sin(time * 8) * 0.04;
      if (def.kind === "wall") {
        p.wall.visible = true;
        const len = def.length ?? 6;
        const d = Math.hypot(q.dx, q.dz) || 1;
        const ux = q.dx / d;
        const uz = q.dz / d;
        p.wall.children.forEach((b, k) => {
          const s = -len / 2 + (k / 11) * len;
          const x = tx - uz * s;
          const z = tz + ux * s;
          b.visible = k <= 11;
          b.position.set(Math.floor(x) + 0.5, world.groundY(x, z) + 0.12, Math.floor(z) + 0.5);
        });
        return;
      }
      p.area.visible = true;
      const r = def.kind === "zone" ? def.radius ?? 6 : def.kind === "works" ? (def.size ?? 2) * 0.9 + 0.5 : 3;
      p.area.position.set(tx, gy + 0.12, tz);
      p.area.scale.setScalar(r * pulse);
      p.area.rotation.z = -time * 0.8;
    });
  }
}
