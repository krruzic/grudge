import * as THREE from "three";
import type { World } from "../sim/world";
import { abilities } from "../sim/talents";
import { graveSpots } from "../sim/heroes";
import { cacheCanvas } from "../ui/cacheCanvas";

export interface ReticleReq {
  heroId: number;
  slot: "b" | "r" | "z";
  dx: number;
  dz: number;
  range: number;
}

function ringTex(): THREE.CanvasTexture {
  const c = cacheCanvas();
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.scale(4, 4);
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

function areaTex(fill = "255,220,120", rim = "#ffe070", dark = "#3a1a00", mark = "#ffd23a"): THREE.CanvasTexture {
  const c = cacheCanvas();
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.scale(4, 4);
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  gr.addColorStop(0, `rgba(${fill},0.12)`);
  gr.addColorStop(0.85, `rgba(${fill},0.3)`);
  gr.addColorStop(1, `rgba(${fill},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  g.lineWidth = 5;
  g.strokeStyle = rim;
  g.beginPath();
  g.arc(64, 64, 58, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.save();
    g.translate(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46);
    g.rotate(a + Math.PI / 2);
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(-8, -6);
    g.lineTo(8, -6);
    g.lineTo(0, 6);
    g.fill();
    g.fillStyle = mark;
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
const GRAVE_TEX = areaTex("200,140,255", "#d8a8ff", "#1a0830", "#c890ff");

export class Reticles {
  readonly root = new THREE.Group();
  private pool: { range: THREE.Mesh; area: THREE.Mesh; wall: THREE.Group; pads: THREE.Group; cursor: THREE.Mesh }[] =
    [];

  private make(): { range: THREE.Mesh; area: THREE.Mesh; wall: THREE.Group; pads: THREE.Group; cursor: THREE.Mesh } {
    const mat = (tex: THREE.Texture, op: number) =>
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: op,
        depthWrite: false,
        depthTest: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      });
    const range = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat(RANGE_TEX, 0.55));
    range.rotation.x = -Math.PI / 2;
    range.renderOrder = 5;
    const area = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat(AREA_TEX, 0.95));
    area.rotation.x = -Math.PI / 2;
    area.renderOrder = 6;
    const wall = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.12, 0.9),
        new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.6, depthTest: false }),
      );
      b.renderOrder = 6;
      wall.add(b);
    }
    const pads = new THREE.Group();
    for (let i = 0; i < 24; i++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.14, 1),
        new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.55, depthTest: false }),
      );
      b.renderOrder = 6;
      pads.add(b);
    }
    const cursor = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.9, depthTest: false }),
    );
    cursor.renderOrder = 7;
    this.root.add(range, area, wall, pads, cursor);
    const r = { range, area, wall, pads, cursor };
    this.pool.push(r);
    return r;
  }

  sync(world: World, reqs: ReticleReq[], time: number): void {
    while (this.pool.length < reqs.length) this.make();
    this.pool.forEach((p, i) => {
      const q = reqs[i];
      const e = q ? world.getAny(q.heroId) : undefined;
      const on = !!q && !!e?.alive;
      p.range.visible = p.area.visible = p.wall.visible = p.pads.visible = p.cursor.visible = false;
      if (!on || !q || !e) return;
      const hx = e.transform.pos.x;
      const hz = e.transform.pos.z;
      const tx = hx + q.dx;
      const tz = hz + q.dz;
      const gy = world.groundY(tx, tz);
      const def0 = abilities(world, e)[q.slot];
      const areaMat = p.area.material as THREE.MeshBasicMaterial;
      const dots = p.wall.children as THREE.Mesh[];
      if (def0.kind === "gravewalk") {
        const spots = graveSpots(world, e);
        const RING = 5;
        const hy = world.groundY(hx, hz);
        p.range.visible = true;
        p.range.position.set(hx, hy + 0.1, hz);
        p.range.scale.setScalar(RING + 0.6);
        p.range.rotation.z = time * 0.3;
        p.pads.visible = true;
        let selX = hx;
        let selZ = hz;
        const order = spots
          .map((sp, k) => [Math.hypot(sp.x - hx, sp.z - hz), k])
          .sort((a, b) => a[0] - b[0])
          .map(([, k]) => k);
        const rank = new Array<number>(spots.length);
        order.forEach((k, i) => (rank[k] = i));
        (p.pads.children as THREE.Mesh[]).forEach((b, k) => {
          const sp = spots[k];
          b.visible = !!sp;
          if (!sp) return;
          const dx = sp.x - hx;
          const dz = sp.z - hz;
          const d = Math.hypot(dx, dz) || 1;
          const r = 1.8 + (RING - 2.4) * (spots.length > 1 ? rank[k] / (spots.length - 1) : 1);
          const x = hx + (dx / d) * r;
          const z = hz + (dz / d) * r;
          const sel = Math.hypot(sp.x - tx, sp.z - tz) < 0.5;
          if (sel) {
            selX = x;
            selZ = z;
          }
          const size = (sp.keep ? 0.9 : 0.7) * (sel ? 1.35 + Math.sin(time * 8) * 0.08 : 1);
          b.position.set(x, hy + 0.22, z);
          b.scale.set(size, 1, size);
          b.rotation.y = sel ? time * 1.5 : Math.atan2(dx, dz);
          const m = b.material as THREE.MeshBasicMaterial;
          m.color.setHex(sel ? 0xd8a0ff : sp.keep ? 0xfff0b0 : 0xffe070);
          m.opacity = sel ? 0.9 : 0.6;
        });
        if (selX !== hx || selZ !== hz) {
          p.cursor.visible = true;
          p.cursor.position.set(selX, hy + 0.9 + Math.sin(time * 5) * 0.12, selZ);
          p.cursor.rotation.y = time * 2;
          (p.cursor.material as THREE.MeshBasicMaterial).color.setHex(0xd8a0ff);
        }
        if (Math.hypot(q.dx, q.dz) < 0.5) return;
        p.area.visible = true;
        areaMat.map = GRAVE_TEX;
        p.area.position.set(tx, gy + 0.12, tz);
        p.area.scale.setScalar(((def0.radius ?? 6) + 1.5) * (1 + Math.sin(time * 6) * 0.05));
        p.area.rotation.z = -time * 0.8;
        return;
      }
      areaMat.map = AREA_TEX;
      for (const b of dots) {
        b.rotation.y = 0;
        b.scale.setScalar(1);
        (b.material as THREE.MeshBasicMaterial).color.setHex(0xffe070);
      }
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
      const r =
        def.kind === "zone" || def.kind === "leap" || def.kind === "hex"
          ? (def.radius ?? 2.5)
          : def.kind === "works"
            ? (def.size ?? 2) * 0.9 + 0.5
            : 3;
      p.area.position.set(tx, gy + 0.12, tz);
      p.area.scale.setScalar(r * pulse);
      p.area.rotation.z = -time * 0.8;
    });
  }
}
