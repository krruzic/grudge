// Zones (World.zones): area effects left by abilities, built once per zone in the owner's costume and animated
// every frame by animateZone(). Styles: Thorn's bramble (and Sun Totem's desert variant), sinkhole/crater/lava
// (3D fissures from fx/parts), bones, tesla, smoke, ale/aletrail/brewfest/tar (Maddock), grove.
//
// Every zone's first child is a flat decal disc (ZONE_TEX / ZONE_DECAL). Only Maddock's ale, aletrail, tar and
// brewfest zones show it; for the others it stays hidden since they moved to 3D fissures and props (turning
// those decals back on is a separate decision, see docs/decisions.md). animateZone() fades it via children[0].
import ciderMudUrl from "../../../assets/textures/autumn_mud.png?url";
import * as THREE from "three";
import {
  composite,
  FX,
  ENGINEER,
  hdAlias,
  SUMMONER,
  WARDEN,
  WARLORD,
  RAIDER,
  HERALD,
  hd,
  cv,
  cm,
  withCostume,
} from "../fx/atlas";
import { cacheCanvas } from "../../ui/cacheCanvas";
import { zoneFissures } from "../fx/fissures";
import { isDesert } from "../kits/desert";
import { ZONE_DECALS, BUBBLE, FOAM } from "../kits/friar";
import { PUDDLE_DECAL, RIPTIDE_DECAL, TIDE_BUBBLE, TIDE_FOAM } from "../kits/harpooner";
import { propParts } from "../props";
import type { HazardViews } from "./hazardViews";
import type { Zone } from "../../sim/types";
import { wardenSprout } from "../kits/wardenParts";
import {
  VINE,
  LEAF_B,
  LEAF_A,
  thornGeo,
  THORN,
  thornBig,
  crossQuad,
  FLOWER,
  chunkGeo,
  STONE_CHUNK,
  MOSS_TUFT,
} from "./materials";
import { meshesOf, mergeInto, Piece, GrowU } from "./grow";
import { teslaCoil } from "./tesla";

export const BRAMBLE_DECAL = composite(256, (g, img) => {
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
  gr.addColorStop(0, "rgba(34,24,12,0.85)");
  gr.addColorStop(0.75, "rgba(44,34,18,0.6)");
  gr.addColorStop(1, "rgba(44,34,18,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  g.drawImage(img(WARDEN.roots), 8, 8, 240, 240);
  g.globalAlpha = 0.9;
  g.drawImage(img(WARDEN.wreath), 14, 14, 228, 228);
});
hdAlias(BRAMBLE_DECAL, "warden", "zone.bramble");
export function disc(
  draw: (g: CanvasRenderingContext2D, img: (t: THREE.Texture) => CanvasImageSource) => void,
): THREE.CanvasTexture {
  return composite(256, (g, img) => {
    g.save();
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.clip();
    draw(g, img);
    g.restore();
  });
}
/** Cider-well mud: the painted autumn mud tile masked to a soft-edged disc (filled in when the image loads). */
const CIDER_MUD = (() => {
  const c = cacheCanvas();
  c.width = c.height = 512;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const im = new Image();
  im.onload = () => {
    const g = c.getContext("2d")!;
    g.drawImage(im, 0, 0, 512, 512);
    g.globalCompositeOperation = "destination-in";
    const m = g.createRadialGradient(256, 256, 150, 256, 256, 252);
    m.addColorStop(0, "rgba(0,0,0,0.92)");
    m.addColorStop(0.8, "rgba(0,0,0,0.85)");
    m.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = m;
    g.fillRect(0, 0, 512, 512);
    t.needsUpdate = true;
  };
  im.src = ciderMudUrl;
  return t;
})();

const ZONE_DECAL: Record<string, THREE.Texture> = {
  sinkhole: disc((g, img) => {
    const gr = g.createRadialGradient(128, 128, 8, 128, 128, 126);
    gr.addColorStop(0, "rgba(6,4,2,1)");
    gr.addColorStop(0.5, "rgba(40,28,18,0.85)");
    gr.addColorStop(1, "rgba(60,44,30,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.drawImage(img(WARLORD.crackRing), 0, 0, 256, 256);
  }),
  crater: disc((g, img) => {
    g.globalAlpha = 0.95;
    g.drawImage(img(WARLORD.crackRing), 0, 0, 256, 256);
    g.globalAlpha = 0.7;
    g.drawImage(img(FX.crack), 30, 30, 196, 196);
  }),
  lava: disc((g, img) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, "rgba(40,16,6,0.9)");
    gr.addColorStop(0.8, "rgba(50,24,10,0.6)");
    gr.addColorStop(1, "rgba(50,24,10,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.drawImage(img(WARLORD.lavaCrack), 0, 0, 256, 256);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.5;
    g.drawImage(img(WARLORD.lavaCrack), 20, 20, 216, 216);
  }),
  bones: disc((g, img) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, "rgba(30,14,40,0.85)");
    gr.addColorStop(1, "rgba(30,14,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.drawImage(img(SUMMONER.hex), 0, 0, 256, 256);
  }),
  tesla: disc((g, img) => {
    g.drawImage(img(FX.crack), 0, 0, 256, 256);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.8;
    g.drawImage(img(ENGINEER.arc), 20, 90, 216, 76);
    g.translate(128, 128);
    g.rotate(Math.PI / 2);
    g.drawImage(img(ENGINEER.arc), -108, -38, 216, 76);
  }),
  smoke: disc((g) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, "rgba(30,24,40,0.6)");
    gr.addColorStop(1, "rgba(30,24,40,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }),
  grove: disc((g, img) => {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 126);
    gr.addColorStop(0, "rgba(120,200,80,0.45)");
    gr.addColorStop(0.85, "rgba(90,160,60,0.35)");
    gr.addColorStop(1, "rgba(90,160,60,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    g.globalAlpha = 0.8;
    g.drawImage(img(WARDEN.rune), 0, 0, 256, 256);
  }),
};
function groundTex(draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = cacheCanvas();
  cv.width = cv.height = 512;
  const c = cv.getContext("2d")!;
  c.scale(4, 4);
  draw(c, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const blot = (c: CanvasRenderingContext2D, s: number, colors: string[], n: number) => {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.pow(Math.random(), 0.7) * (s / 2 - 6);
    const z = 3 + Math.random() * 9 * (1 - r / (s / 2));
    c.fillStyle = colors[k % colors.length];
    c.fillRect(
      Math.round(s / 2 + Math.cos(a) * r - z / 2),
      Math.round(s / 2 + Math.sin(a) * r - z / 2),
      Math.round(z),
      Math.round(z),
    );
  }
};
const ZONE_TEX: Record<string, THREE.CanvasTexture> = {
  bramble: groundTex((c, s) => blot(c, s, ["rgba(40,28,14,0.8)", "rgba(58,40,20,0.7)", "rgba(50,70,28,0.75)"], 160)),
  sinkhole: groundTex((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2 - 4);
    g.addColorStop(0, "rgba(8,5,3,1)");
    g.addColorStop(0.55, "rgba(46,32,20,0.9)");
    g.addColorStop(1, "rgba(80,60,40,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.lineWidth = 3;
    for (let arm = 0; arm < 5; arm++) {
      c.beginPath();
      for (let k = 0; k <= 30; k++) {
        const f = k / 30;
        const a = arm * ((Math.PI * 2) / 5) + f * 4;
        const r = (1 - f) * (s / 2 - 8) + 6;
        c.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
      }
      c.strokeStyle = "rgba(20,12,6,0.9)";
      c.stroke();
    }
  }),
  crater: groundTex((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 6, s / 2, s / 2, s / 2 - 4);
    g.addColorStop(0, "rgba(30,22,16,0.95)");
    g.addColorStop(0.7, "rgba(70,54,38,0.8)");
    g.addColorStop(1, "rgba(90,70,50,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    blot(c, s, ["rgba(20,14,10,0.6)", "rgba(110,90,66,0.6)"], 60);
  }),
  tesla: groundTex((c, s) => {
    blot(c, s, ["rgba(24,22,26,0.75)", "rgba(40,38,44,0.6)"], 120);
    c.strokeStyle = "rgba(210,130,60,0.9)";
    c.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(s / 2, s / 2);
      let x = s / 2;
      let y = s / 2;
      for (let j = 0; j < 5; j++) {
        x += Math.cos(a + (Math.random() - 0.5)) * 11;
        y += Math.sin(a + (Math.random() - 0.5)) * 11;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  }),
  bones: groundTex((c, s) => {
    blot(c, s, ["rgba(60,50,56,0.7)", "rgba(90,80,84,0.6)", "rgba(40,20,50,0.7)"], 140);
    c.strokeStyle = "rgba(200,120,255,0.8)";
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(s / 2, s / 2, s / 2 - 10, 0, Math.PI * 2);
    c.stroke();
  }),
};
/** Builds a zone view centred on (hz.cx, hz.cy, hz.cz); children are positioned relative to that centre. */
export function zoneMesh(hz: HazardViews, r: number, style = "bramble", costume?: string): THREE.Object3D {
  const g = new THREE.Group();
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2.1, r * 2.1),
    new THREE.MeshBasicMaterial({
      map: ZONE_TEX[style] ?? ZONE_TEX.bramble,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.y = 0.12;
  decal.visible = false;
  g.add(decal);
  const gy = (x: number, z: number) => hz.world.groundY(hz.cx + x, hz.cz + z) - hz.cy;
  if (style === "lava" || style === "crater" || style === "sinkhole") {
    const fis = zoneFissures(gy, r * 0.9, style === "lava" ? "lava" : "crack", costume);
    g.add(fis);
    mergeInto(
      fis,
      meshesOf(fis).map((mesh) => ({ mesh })),
    );
    for (const s of [...fis.children]) if (!(s as THREE.Mesh).isMesh) fis.remove(s);
  }
  const grows: { o: THREE.Object3D; d: number }[] = [];
  const z: ZoneBuild = { g, decal, gy, r, style, costume, grows };
  if (style === "bramble") brambleZone(z);
  else styledZone(z);
  if (grows.length) {
    const u: GrowU = {
      uGrowT: { value: 0 },
      uGrowIn: { value: new THREE.Vector2(1, 1) },
      uGrowMul: { value: new THREE.Vector2(1, 1) },
      uSway: { value: new THREE.Vector2() },
    };
    g.userData.growU = u;
    g.userData.pops = grows
      .filter(({ o }) => o.children.length > 2)
      .map(({ o, d }) => ({ d, p: o.position.clone(), done: false }));
    mergeInto(
      g,
      grows.flatMap(({ o, d }) => meshesOf(o).map((mesh) => ({ mesh, c: o.position.clone(), d, yaw: o.rotation.y }))),
      u,
    );
    for (const { o } of grows) g.remove(o);
  }
  return g;
}

/** Everything a zone builder needs; `gy` is ground height relative to the zone centre. */
interface ZoneBuild {
  g: THREE.Group;
  decal: THREE.Mesh;
  gy: (x: number, z: number) => number;
  r: number;
  style: string;
  costume?: string;
  /** Pieces that grow in with the shared grow shader (merged into one mesh at the end of zoneMesh). */
  grows: { o: THREE.Object3D; d: number }[];
}

/**
 * Thorn's bramble: vine arches, thorn clumps, moss and flowers that grow outward from the centre (Sun Totem:
 * saguaros and desert thorns), plus floating wisps.
 */
function brambleZone({ g, decal, gy, r, costume, grows }: ZoneBuild): void {
  decal.material = new THREE.MeshBasicMaterial({
    map: hd(BRAMBLE_DECAL),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const grow = (o: THREE.Object3D, x: number, z: number) => {
    grows.push({ o, d: (Math.hypot(x, z) / r) * 0.55 + Math.random() * 0.1 });
    g.add(o);
  };
  const cactus = isDesert(costume) ? propParts("cactus", costume) : null;
  const thorns = isDesert(costume) ? propParts("thorns", costume) : null;
  const desert = !!(cactus && thorns);
  if (cactus && thorns) {
    const place = (
      art: { geo: THREE.BufferGeometry; mat: THREE.Material },
      n: number,
      frac: number,
      s0: number,
      s1: number,
    ) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.8;
        const d = (0.25 + Math.random() * 0.75) * r * frac;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const o = new THREE.Group();
        const m = new THREE.Mesh(art.geo, art.mat);
        m.scale.setScalar(s0 + Math.random() * (s1 - s0));
        o.add(m);
        o.position.set(x, gy(x, z) - 0.05, z);
        o.rotation.y = Math.random() * Math.PI * 2;
        grow(o, x, z);
      }
    };
    place(cactus, Math.max(2, Math.round(r * 0.9)), 0.75, 0.95, 1.4);
    place(thorns, Math.round(r * 1.2), 0.9, 0.7, 1.15);
  }
  const arches = desert ? 0 : Math.round(r * 6);
  for (let i = 0; i < arches; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r * 0.85;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const t = Math.random() * Math.PI * 2;
    const len = 1.2 + Math.random() * 1.4;
    const hgt = 0.55 + Math.random() * 0.75;
    const A = new THREE.Vector3(
      (-Math.cos(t) * len) / 2,
      gy(x - (Math.cos(t) * len) / 2, z - (Math.sin(t) * len) / 2) - 0.1,
      (-Math.sin(t) * len) / 2,
    );
    const B = new THREE.Vector3(
      (Math.cos(t) * len) / 2,
      gy(x + (Math.cos(t) * len) / 2, z + (Math.sin(t) * len) / 2) - 0.1,
      (Math.sin(t) * len) / 2,
    );
    const M = A.clone().add(B).multiplyScalar(0.5);
    M.y += hgt * 2;
    const curve = new THREE.QuadraticBezierCurve3(A, M, B);
    const arch = new THREE.Group();
    arch.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.1 + Math.random() * 0.05, 6, false), VINE));
    for (let k = 0; k < 2; k++) {
      const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), k ? cm(LEAF_B) : cm(LEAF_A));
      lf.position.copy(curve.getPoint(0.3 + Math.random() * 0.4)).add(new THREE.Vector3(0, 0.08, 0));
      lf.rotation.set(-1.1 + Math.random() * 0.6, Math.random() * 6, Math.random() - 0.5);
      arch.add(lf);
    }
    for (let k = 0; k < 7; k++) {
      const u = 0.12 + (k / 5) * 0.76;
      const p = curve.getPoint(u);
      const tan = curve.getTangent(u);
      const side = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5)
        .cross(tan)
        .normalize();
      const th = new THREE.Mesh(thornGeo, THORN);
      th.position.copy(p).addScaledVector(side, 0.12);
      th.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side);
      arch.add(th);
    }
    arch.position.set(x, 0, z);
    grow(arch, x, z);
  }
  for (let i = 0; i < (desert ? 0 : Math.round(r * 2.4)); i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r * 0.8;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const clump = new THREE.Group();
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Mesh(thornBig, THORN);
      const ta = (k / 5) * Math.PI * 2 + Math.random();
      sp.position.set(Math.cos(ta) * 0.15, 0.3, Math.sin(ta) * 0.15);
      sp.rotation.set(Math.sin(ta) * 0.5, 0, -Math.cos(ta) * 0.5);
      clump.add(sp);
    }
    clump.position.set(x, gy(x, z) - 0.05, z);
    grow(clump, x, z);
  }
  for (let i = 0; i < Math.round(r * 1.2); i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * r * 0.85;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const f = crossQuad(cm(FLOWER), 0.34, 0.34);
    f.position.set(x, gy(x, z) + 0.02, z);
    f.rotation.y = Math.random() * 3;
    grow(f, x, z);
  }
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: WARDEN.wisp,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.8,
      }),
    );
    w.name = "wisp";
    w.userData.phase = (i / 4) * Math.PI * 2;
    w.userData.rad = r * (0.35 + Math.random() * 0.45);
    w.scale.setScalar(0.55);
    g.add(w);
  }
}

/**
 * Every other zone style: a ground decal plus props and named sprites that animateZone() moves (sinkhole/crater
 * rocks, bones, tesla coil and arcs, lava embers, smoke, ale and tar bubbles, brewfest foam, grove wisps).
 */
function styledZone({ g, decal, gy, r, style, costume, grows }: ZoneBuild): void {
  const sprite = (tex: THREE.Texture, size: number, x: number, z: number, lift = 0, additive = false, name = "") => {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cv(tex),
        transparent: true,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    sp.scale.setScalar(size);
    sp.position.set(x, gy(x, z) + lift + size * 0.4, z);
    if (name) sp.name = name;
    sp.userData.base = sp.position.clone();
    sp.userData.phase = Math.random() * 6;
    g.add(sp);
    return sp;
  };
  const ring = (n: number, frac: [number, number], f: (x: number, z: number, i: number) => void) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = r * (frac[0] + Math.random() * (frac[1] - frac[0]));
      f(Math.cos(a) * d, Math.sin(a) * d, i);
    }
  };
  decal.material = new THREE.MeshBasicMaterial({
    map: cv(ZONE_DECAL[style] ?? ZONE_TEX.bramble),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  if (style === "sinkhole" || style === "crater") {
    const rocks = new THREE.Group();
    rocks.name = "spin";
    g.add(rocks);
    ring(Math.round(r * (style === "sinkhole" ? 2.6 : 2)), [0.4, 0.95], (x, z) => {
      const m = new THREE.Mesh(chunkGeo, cm(STONE_CHUNK));
      const s2 = 0.25 + Math.random() * 0.3;
      m.scale.set(s2, s2 * 0.7, s2);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      m.position.set(x, gy(x, z) + 0.08, z);
      rocks.add(m);
    });
    mergeInto(
      rocks,
      meshesOf(rocks).map((mesh) => ({ mesh })),
    );
    ring(Math.round(r * 1.5), [0.5, 1], (x, z) => sprite(FX.dust, 0.9 + Math.random() * 0.5, x, z, 0, false, "drift"));
  } else if (style === "bones") {
    ring(Math.round(r * 2.4), [0.15, 0.9], (x, z, i) => {
      const sp = sprite(i % 3 === 0 ? SUMMONER.graveHand : SUMMONER.bones, 0.8 + Math.random() * 0.4, x, z, -0.15);
      sp.center.set(0.5, 0.1);
      sp.position.y = gy(x, z) - 0.05;
      sp.name = "rise";
    });
    sprite(SUMMONER.skull, 0.9, 0, 0, 0.1);
    const tomb = propParts("tomb", costume);
    if (tomb) {
      ring(Math.max(2, Math.round(r * 0.9)), [0.35, 0.85], (x, z) => {
        const t = new THREE.Mesh(tomb.geo, tomb.mat);
        t.position.set(x, gy(x, z) - 0.05, z);
        t.rotation.set(
          (Math.random() - 0.5) * 0.25,
          Math.atan2(x, z) + (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.25,
        );
        t.scale.setScalar(0.8 + Math.random() * 0.3);
        grows.push({ o: t, d: Math.random() * 0.3 });
        g.add(t);
      });
    }
    ring(3, [0.2, 0.7], (x, z) => sprite(SUMMONER.ghost, 0.8, x, z, 0.6, true, "wisp"));
  } else if (style === "tesla") {
    const coil = teslaCoil(0.8, costume);
    coil.position.y = gy(0, 0);
    g.add(coil);
    mergeInto(
      coil,
      meshesOf(coil).map((mesh) => ({ mesh })),
    );
    const arc = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: ENGINEER.arc,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    arc.name = "zap";
    arc.userData.top = gy(0, 0) + 2.1;
    g.add(arc);
    ring(5, [0.4, 0.95], (x, z) => sprite(ENGINEER.weld, 0.5, x, z, 0, true, "spark"));
  } else if (style === "lava") {
    ring(Math.round(r * 1.6), [0.2, 0.95], (x, z) =>
      sprite(WARLORD.lavaGlow, 0.9 + Math.random() * 0.6, x, z, -0.2, true, "glow"),
    );
    ring(Math.round(r * 2), [0.1, 1], (x, z) => sprite(WARLORD.ember, 0.3, x, z, 0.2, true, "ember"));
    const chunks: Piece[] = [];
    ring(Math.round(r * 1.2), [0.5, 1], (x, z) => {
      const m = new THREE.Mesh(chunkGeo, cm(STONE_CHUNK));
      const s2 = 0.3 + Math.random() * 0.35;
      m.scale.set(s2, s2 * 0.8, s2);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      m.position.set(x, gy(x, z) + 0.1, z);
      g.add(m);
      chunks.push({ mesh: m });
    });
    mergeInto(g, chunks);
  } else if (style === "smoke") {
    ring(Math.round(r * 4), [0, 1], (x, z) =>
      sprite(RAIDER.smoke, 1.6 + Math.random() * 1.2, x, z, 0.1, false, "smoke"),
    );
    ring(4, [0.2, 0.8], (x, z) => sprite(RAIDER.shadow, 1.2, x, z, 0.6, false, "smoke"));
  } else if (style === "ale" || style === "aletrail") {
    decal.material = new THREE.MeshBasicMaterial({
      map: hd(ZONE_DECALS.ale),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    decal.visible = true;
    ring(style === "ale" ? Math.round(r * 3) : 1, [0.05, 0.85], (x, z) =>
      sprite(BUBBLE, 0.22 + Math.random() * 0.16, x, z, -0.05, false, "bubble"),
    );
    if (style === "ale")
      ring(Math.round(r * 1.5), [0.75, 0.98], (x, z) =>
        sprite(FOAM, 0.45 + Math.random() * 0.3, x, z, -0.2, false, "foam"),
      );
  } else if (style === "cider") {
    // Russet Hollow well mud: a sticky amber puddle with a glossy rim.
    decal.material = new THREE.MeshBasicMaterial({
      map: CIDER_MUD,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    decal.visible = true;
  } else if (style === "tar") {
    decal.material = new THREE.MeshBasicMaterial({
      map: cv(ZONE_DECALS.tar),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    decal.visible = true;
    ring(Math.round(r * 2), [0.05, 0.85], (x, z) =>
      sprite(BUBBLE, 0.25 + Math.random() * 0.2, x, z, -0.05, false, "tarbubble"),
    );
    ring(Math.round(r * 1.5), [0.1, 0.9], (x, z) => sprite(WARLORD.ember, 0.3, x, z, 0.1, true, "ember"));
    ring(Math.round(r * 1.2), [0.1, 0.9], (x, z) =>
      sprite(FX.fire, 0.6 + Math.random() * 0.3, x, z, -0.1, true, "glow"),
    );
  } else if (style === "brewfest") {
    decal.material = new THREE.MeshBasicMaterial({
      map: hd(ZONE_DECALS.brewfest),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    decal.visible = true;
    ring(Math.round(r * 2.2), [0.25, 0.95], (x, z) =>
      sprite(BUBBLE, 0.24 + Math.random() * 0.18, x, z, 0, false, "bubble"),
    );
    ring(Math.round(r * 1.2), [0.3, 0.95], (x, z) => sprite(HERALD.star, 0.35, x, z, 0.8, true, "wisp"));
  } else if (style === "riptide" || style === "puddle") {
    // Brindle: the Riptide whirlpool ring (spins) and his slide puddles.
    const rip = style === "riptide";
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(r * 2.15, r * 2.15),
      new THREE.MeshBasicMaterial({
        map: hd(rip ? RIPTIDE_DECAL : PUDDLE_DECAL),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        opacity: rip ? 0.85 : 0.75,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    const spin = new THREE.Group();
    spin.name = "spin";
    spin.position.y = 0.13;
    spin.add(disc);
    g.add(spin);
    ring(Math.round(r * (rip ? 2.5 : 1.5)), [0.1, 0.9], (x, z) =>
      sprite(TIDE_BUBBLE, 0.18 + Math.random() * 0.14, x, z, -0.05, false, "bubble"),
    );
    if (rip)
      ring(Math.round(r * 2), [0.85, 1], (x, z) => sprite(TIDE_FOAM, 0.6 + Math.random() * 0.4, x, z, -0.2, false, "foam"));
  } else if (style === "grove") {
    ring(Math.round(r * 2.2), [0.1, 0.95], (x, z) => {
      const f = crossQuad(cm(FLOWER), 0.35 + Math.random() * 0.15, 0.35);
      f.position.set(x, gy(x, z), z);
      f.rotation.y = Math.random() * 3;
      grows.push({ o: f, d: Math.random() * 0.4 });
      g.add(f);
    });
    ring(Math.round(r * 1.2), [0.1, 0.9], (x, z) => {
      const t = crossQuad(cm(MOSS_TUFT), 0.6, 0.4);
      t.position.set(x, gy(x, z), z);
      grows.push({ o: t, d: Math.random() * 0.4 });
      g.add(t);
    });
    ring(5, [0.2, 0.8], (x, z) => sprite(WARDEN.wisp, 0.6, x, z, 0.8, true, "wisp"));
  }
}

/**
 * Per-frame zone animation. Children are tagged by name when built: "wisp", "drift", "rise", "glow", "ember",
 * "smoke", "spark", "bubble"/"tarbubble", "foam", "zap", the "spin" group and the "arc" tesla bolt; brambles
 * drive their grow shader uniforms (growU) and sprout pops instead. Everything fades out over the last 0.6 s.
 */
export function animateZone(hz: HazardViews, z: Zone, o: THREE.Object3D, time: number, dt: number): void {
  const w = hz.world;
  const left = z.until - w.time;
  if (o.userData.bramble) {
    const age = time - o.userData.born;
    for (const p of (o.userData.pops ?? []) as { d: number; p: THREE.Vector3; done: boolean }[]) {
      if (p.done || age <= p.d) continue;
      p.done = true;
      const fx = hz.fx;
      if (fx)
        withCostume(o.userData.costume, () =>
          wardenSprout(fx, o.position.x + p.p.x, o.position.y + p.p.y, o.position.z + p.p.z),
        );
    }
    const u = o.userData.growU as GrowU | undefined;
    const out = left < 0.6 ? Math.max(0.001, left / 0.6) : 1;
    if (u) {
      u.uGrowT.value = age;
      u.uGrowIn.value.set(1, out);
      u.uGrowMul.value.set(0.6 + 0.4 * out, 1);
      u.uSway.value.set(0.04, (time * 1.3) % (Math.PI * 2));
    }
    for (const c of o.children) {
      if (c.name === "wisp") {
        const a = c.userData.phase + time * 0.6;
        c.position.set(
          Math.cos(a) * c.userData.rad,
          0.6 + Math.sin(time * 2 + c.userData.phase) * 0.3,
          Math.sin(a) * c.userData.rad,
        );
        (c as THREE.Sprite).material.opacity = 0.7 * Math.min(1, age * 2, left / 0.6);
      }
    }
    const dm = (o.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    dm.opacity = Math.min(1, age * 3, left / 0.6);
  }
  const spin = o.getObjectByName("spin");
  if (spin) {
    spin.rotation.y += dt * (z.style === "sinkhole" ? 1.6 : z.style === "riptide" ? -1.3 : 0.2);
    spin.scale.setScalar(z.style === "sinkhole" ? 0.6 + 0.4 * (left % 1) : 1);
    if (z.style === "riptide" || z.style === "puddle") {
      const m = (spin.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = (z.style === "riptide" ? 0.85 : 0.75) * Math.min(1, left / 0.6);
    }
  }
  const life = Math.min(1, (time - (o.userData.born ?? time)) * 3, left / 0.6);
  for (const c of o.children) {
    const b = c.userData.base as THREE.Vector3 | undefined;
    const ph = c.userData.phase ?? 0;
    if (c.name === "drift" && b) {
      c.position.y = b.y + ((time * 0.4 + ph) % 1) * 0.6;
      (c as THREE.Sprite).material.opacity = 0.6 * life * (1 - ((time * 0.4 + ph) % 1));
    } else if (c.name === "wisp" && b) {
      c.position.set(
        b.x + Math.sin(time + ph) * 0.4,
        b.y + Math.sin(time * 2 + ph) * 0.3,
        b.z + Math.cos(time + ph) * 0.4,
      );
      (c as THREE.Sprite).material.opacity = 0.8 * life;
    } else if (c.name === "rise") {
      const k = Math.min(1, (time - (o.userData.born ?? time)) * 4 - ph * 0.05);
      c.scale.y = Math.max(0.01, c.scale.x * k * (left < 0.5 ? left / 0.5 : 1));
    } else if (c.name === "glow") {
      (c as THREE.Sprite).material.opacity = life * (0.55 + 0.35 * Math.sin(time * 3 + ph));
    } else if (c.name === "ember" && b) {
      const q = (time * 0.7 + ph) % 1;
      c.position.set(b.x, b.y + q * 1.6, b.z);
      (c as THREE.Sprite).material.opacity = life * (1 - q);
    } else if (c.name === "smoke" && b) {
      c.position.set(b.x + Math.sin(time * 0.5 + ph) * 0.3, b.y + Math.sin(time * 0.7 + ph) * 0.15, b.z);
      (c as THREE.Sprite).material.rotation = time * 0.2 + ph;
      (c as THREE.Sprite).material.opacity = 0.9 * life;
    } else if (c.name === "spark") (c as THREE.Sprite).material.opacity = Math.random() < 0.3 ? life : 0;
    else if ((c.name === "bubble" || c.name === "tarbubble") && b) {
      const q = (time * (c.name === "tarbubble" ? 0.45 : 0.8) + ph) % 1;
      c.position.set(b.x, b.y + q * (c.name === "tarbubble" ? 0.25 : 0.7), b.z);
      const s0 = (c.userData.s0 ??= c.scale.x) as number;
      c.scale.setScalar(s0 * (0.5 + q * 0.7));
      (c as THREE.Sprite).material.opacity = life * (q < 0.8 ? 0.9 : (1 - q) * 4.5);
    } else if (c.name === "foam" && b) {
      c.position.set(b.x + Math.sin(time * 0.8 + ph) * 0.08, b.y, b.z + Math.cos(time * 0.7 + ph) * 0.08);
      (c as THREE.Sprite).material.opacity = life * 0.9;
    } else if (c.name === "zap") {
      const sp = c as THREE.Sprite;
      if (Math.random() < 0.4) {
        const a = Math.random() * Math.PI * 2;
        const d = z.radius * (0.3 + Math.random() * 0.5);
        sp.position.set(Math.cos(a) * d * 0.5, (c.userData.top as number) * 0.6, Math.sin(a) * d * 0.5);
        sp.scale.set(d * 1.1, 1.2, 1);
        sp.material.rotation = -a;
      }
      sp.material.opacity = life * (Math.random() < 0.6 ? 1 : 0.2);
    }
  }
  const gu = o.userData.growU as GrowU | undefined;
  if (gu && !o.userData.bramble) {
    const k = left < 0.6 ? left / 0.6 : 1;
    gu.uGrowT.value = time - (o.userData.born ?? time);
    gu.uGrowIn.value.set(k, k);
  }
  if (!o.userData.bramble) ((o.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = life;
  const arc = o.getObjectByName("arc") as THREE.Mesh | undefined;
  if (arc && Math.random() < 0.35) {
    const top = new THREE.Vector3(0, arc.userData.top as number, 0);
    const a = Math.random() * Math.PI * 2;
    const d = z.radius * (0.4 + Math.random() * 0.6);
    const end = new THREE.Vector3(
      Math.cos(a) * d,
      w.groundY(z.x + Math.cos(a) * d, z.z + Math.sin(a) * d) - o.position.y + 0.2,
      Math.sin(a) * d,
    );
    const pts = [top];
    for (let k = 1; k < 5; k++)
      pts.push(
        top
          .clone()
          .lerp(end, k / 5)
          .add(
            new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5),
          ),
      );
    pts.push(end);
    arc.geometry.dispose();
    arc.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0), 10, 0.05, 3, false);
  }
}
