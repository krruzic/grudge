// Billboard markers over entities: build/upgrade/shop button hints over pads and shops, status marks (stun,
// slow, mark, hex, ...), the hex shield dome and the builder's gear, and soldier rank badges. All materials here
// are shared by every view (registered in SHARED_VIEW_MATS so disposeTree skips them).
import * as THREE from "three";
import { cacheCanvas } from "../../ui/cacheCanvas";
import { fontReady } from "../../ui/font";
import { padButton } from "../../ui/hud";
import outpostIcon from "../../../assets/ui/talents/p_outpost.png?url";
import towerIcon from "../../../assets/ui/talents/p_tower.png?url";
import upgradeIcon from "../../../assets/ui/talents/p_upgrade.png?url";
import shopIcon from "../../../assets/ui/talents/p_shop.png?url";
import { SHARED_VIEW_MATS } from "./view";

function hintTex(cells: [string, string][]): THREE.CanvasTexture {
  const cv = cacheCanvas();
  cv.width = 128 * cells.length;
  cv.height = 128;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const imgs = cells.map(([, url]) => {
    const im = new Image();
    im.src = url;
    return im;
  });
  const draw = () => {
    const c = cv.getContext("2d")!;
    c.clearRect(0, 0, cv.width, cv.height);
    cells.forEach(([btn], k) => {
      const im = imgs[k];
      c.save();
      c.translate(k * 128, 0);
      c.fillStyle = "#0b0806";
      c.beginPath();
      c.arc(60, 60, 54, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#2a1c12";
      c.beginPath();
      c.arc(60, 60, 50, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = "#c89a40";
      c.beginPath();
      c.arc(60, 60, 47, 0, Math.PI * 2);
      c.stroke();
      if (im.complete && im.naturalWidth) {
        c.imageSmoothingEnabled = true;
        c.drawImage(im, 24, 22, 72, 72);
      }
      c.scale(4, 4);
      padButton(c, 25.5, 25.5, 5.4, "#5a5a66", btn);
      c.restore();
    });
    t.needsUpdate = true;
  };
  draw();
  fontReady.then(draw);
  for (const im of imgs) im.onload = draw;
  return t;
}
export const HINTS = {
  build: new THREE.SpriteMaterial({
    map: hintTex([
      ["X", outpostIcon],
      ["Y", towerIcon],
    ]),
    depthTest: false,
    transparent: true,
  }),
  upgrade: new THREE.SpriteMaterial({ map: hintTex([["X", upgradeIcon]]), depthTest: false, transparent: true }),
  shop: new THREE.SpriteMaterial({ map: hintTex([["Y", shopIcon]]), depthTest: false, transparent: true }),
};

function markTex(draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = cacheCanvas();
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  c.scale(4, 4);
  c.lineJoin = c.lineCap = "round";
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const hexShieldTex = (() => {
  const cv = cacheCanvas();
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  c.strokeStyle = "rgba(255,255,255,0.95)";
  c.lineWidth = 3;
  const r = 12;
  for (let row = -1; row < 7; row++) {
    for (let col = -1; col < 7; col++) {
      const cx = col * r * 1.75 + (row % 2 ? r * 0.87 : 0);
      const cy = row * r * 1.5;
      c.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      c.closePath();
      c.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
export const domeGeo = new THREE.IcosahedronGeometry(1, 1);
domeGeo.userData.model = true;
export const gearMat = new THREE.SpriteMaterial({
  depthTest: false,
  map: (() => {
    const cv = cacheCanvas();
    cv.width = cv.height = 128;
    const c = cv.getContext("2d")!;
    c.scale(4, 4);
    c.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r = k % 2 ? 11 : 15;
      c.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
    }
    c.closePath();
    c.fillStyle = "#e8b840";
    c.fill();
    c.strokeStyle = "#3a2408";
    c.lineWidth = 2;
    c.stroke();
    c.beginPath();
    c.arc(16, 16, 5, 0, Math.PI * 2);
    c.fillStyle = "#3a2408";
    c.fill();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })(),
});

export const MARKS: Record<string, THREE.SpriteMaterial> = {
  bleed: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      c.moveTo(16, 3);
      c.quadraticCurveTo(27, 18, 16, 28);
      c.quadraticCurveTo(5, 18, 16, 3);
      c.fillStyle = "#c01818";
      c.fill();
      c.strokeStyle = "#2a0404";
      c.lineWidth = 2.5;
      c.stroke();
      c.fillStyle = "#ff8080";
      c.fillRect(12, 16, 3, 5);
    }),
  }),
  mark: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      c.arc(16, 16, 11, 0, Math.PI * 2);
      c.strokeStyle = "#1a0404";
      c.lineWidth = 5;
      c.stroke();
      c.strokeStyle = "#ff3a2a";
      c.lineWidth = 2.5;
      c.stroke();
      c.beginPath();
      c.moveTo(16, 1);
      c.lineTo(16, 9);
      c.moveTo(16, 23);
      c.lineTo(16, 31);
      c.moveTo(1, 16);
      c.lineTo(9, 16);
      c.moveTo(23, 16);
      c.lineTo(31, 16);
      c.strokeStyle = "#1a0404";
      c.lineWidth = 4;
      c.stroke();
      c.strokeStyle = "#ffd0c0";
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.arc(16, 16, 3, 0, Math.PI * 2);
      c.fillStyle = "#ff3a2a";
      c.fill();
    }),
  }),
  armor: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      c.moveTo(16, 3);
      c.lineTo(28, 8);
      c.lineTo(26, 20);
      c.lineTo(16, 29);
      c.lineTo(6, 20);
      c.lineTo(4, 8);
      c.closePath();
      c.fillStyle = "#8a8478";
      c.fill();
      c.strokeStyle = "#1a1408";
      c.lineWidth = 2.5;
      c.stroke();
      c.beginPath();
      c.moveTo(10, 11);
      c.lineTo(15, 17);
      c.lineTo(12, 22);
      c.moveTo(19, 9);
      c.lineTo(21, 15);
      c.strokeStyle = "#3a3428";
      c.lineWidth = 1.5;
      c.stroke();
    }),
  }),
  stun: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      for (const [x, y, r] of [
        [8, 14, 6],
        [24, 12, 6],
        [16, 24, 5],
      ]) {
        c.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? r * 0.45 : r;
          c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        c.closePath();
        c.fillStyle = "#ffe040";
        c.fill();
        c.strokeStyle = "#3a2408";
        c.lineWidth = 2;
        c.stroke();
      }
    }),
  }),
  buff: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      c.arc(16, 16, 13, 0, Math.PI * 2);
      c.fillStyle = "#3a0806";
      c.fill();
      c.strokeStyle = "#ff6a2a";
      c.lineWidth = 2.5;
      c.stroke();
      c.beginPath();
      c.moveTo(16, 5);
      c.lineTo(23, 14);
      c.lineTo(19, 14);
      c.lineTo(19, 26);
      c.lineTo(13, 26);
      c.lineTo(13, 14);
      c.lineTo(9, 14);
      c.closePath();
      c.fillStyle = "#ffb040";
      c.fill();
      c.strokeStyle = "#3a0806";
      c.lineWidth = 1.5;
      c.stroke();
    }),
  }),
  slow: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      c.arc(16, 16, 13, 0, Math.PI * 2);
      c.fillStyle = "#081a2a";
      c.fill();
      c.strokeStyle = "#60c0ff";
      c.lineWidth = 2.5;
      c.stroke();
      c.beginPath();
      c.moveTo(16, 26);
      c.lineTo(23, 17);
      c.lineTo(19, 17);
      c.lineTo(19, 6);
      c.lineTo(13, 6);
      c.lineTo(13, 17);
      c.lineTo(9, 17);
      c.closePath();
      c.fillStyle = "#a8e0ff";
      c.fill();
      c.strokeStyle = "#081a2a";
      c.lineWidth = 1.5;
      c.stroke();
    }),
  }),
  guard: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      c.moveTo(16, 3);
      c.lineTo(28, 8);
      c.lineTo(26, 20);
      c.lineTo(16, 29);
      c.lineTo(6, 20);
      c.lineTo(4, 8);
      c.closePath();
      c.fillStyle = "#d8d0b8";
      c.fill();
      c.strokeStyle = "#1a1408";
      c.lineWidth = 2.5;
      c.stroke();
      c.beginPath();
      c.moveTo(16, 7);
      c.lineTo(16, 25);
      c.moveTo(8, 12);
      c.lineTo(24, 12);
      c.strokeStyle = "#b02010";
      c.lineWidth = 3;
      c.stroke();
    }),
  }),
  hex: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      c.arc(16, 16, 12, 0, Math.PI * 2);
      c.fillStyle = "#1a0822";
      c.fill();
      c.strokeStyle = "#c060ff";
      c.lineWidth = 3;
      c.stroke();
      c.beginPath();
      c.moveTo(16, 7);
      c.lineTo(16, 25);
      c.moveTo(9, 12);
      c.lineTo(23, 20);
      c.moveTo(23, 12);
      c.lineTo(9, 20);
      c.strokeStyle = "#e0a8ff";
      c.lineWidth = 2.5;
      c.stroke();
    }),
  }),
  cowed: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      c.moveTo(6, 8);
      c.lineTo(26, 8);
      c.lineTo(16, 26);
      c.closePath();
      c.fillStyle = "#9a9aa2";
      c.fill();
      c.strokeStyle = "#101014";
      c.lineWidth = 3;
      c.stroke();
    }),
  }),
  opening: new THREE.SpriteMaterial({
    depthTest: false,
    map: markTex((c) => {
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
        const r = k % 2 ? 5 : 13;
        c.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
      }
      c.closePath();
      c.fillStyle = "#ffd040";
      c.fill();
      c.strokeStyle = "#3a2008";
      c.lineWidth = 2.5;
      c.stroke();
    }),
  }),
};
for (const m of [...Object.values(HINTS), ...Object.values(MARKS), gearMat]) SHARED_VIEW_MATS.add(m);

function rankTex(rank: number): THREE.CanvasTexture {
  const c = cacheCanvas();
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.scale(4, 4);
  ctx.lineJoin = "miter";
  const chevron = (y: number) => {
    ctx.beginPath();
    ctx.moveTo(6, y + 7);
    ctx.lineTo(16, y);
    ctx.lineTo(26, y + 7);
    ctx.lineTo(26, y + 12);
    ctx.lineTo(16, y + 5);
    ctx.lineTo(6, y + 12);
    ctx.closePath();
    ctx.fillStyle = "#1a1208";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1a1208";
    ctx.stroke();
    ctx.fillStyle = "#ffcc33";
    ctx.fill();
  };
  if (rank >= 3) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 14 : 6;
      ctx.lineTo(16 + Math.cos(a) * r, 17 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#1a1208";
    ctx.stroke();
    ctx.fillStyle = "#ffcc33";
    ctx.fill();
  } else if (rank === 2) {
    chevron(6);
    chevron(15);
  } else {
    chevron(10);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  return t;
}
export const rankTexes = [1, 2, 3].map(rankTex);
