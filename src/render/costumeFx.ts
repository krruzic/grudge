import * as THREE from "three";
import ironUrl from "../../assets/textures/iron.png?url";
import seamUrl from "../../assets/fx/colossus_seam.png?url";
import {
  cv,
  DUELIST,
  ENGINEER,
  FRIAR,
  FX,
  RAIDER,
  setCostumeSwap,
  setCostumeTints,
  setCostumeTrail,
  SUMMONER,
  WARDEN,
  WARLORD,
  WREN,
} from "./fxKit";
import { COSTUME_SKIN, SHARED_CHUNK_GEOS } from "./fxParts";

const TINTS: Record<string, Record<number, number>> = {
  colossus: {
    0xff6060: 0xff60c0,
    0xff3030: 0xff30a0,
    0xa02020: 0xa02070,
    0x24140a: 0x2a1018,
    0xffe0c0: 0xf4eaf4,
    0xffb060: 0xff80d0,
    0xffa060: 0xff78c8,
    0xffd080: 0xffc0e8,
    0xff9060: 0xff70c0,
    0xff8040: 0xff60b0,
    0xffc040: 0xffb0e0,
  },
  calliope: { 0xa0f0ff: 0xe0b0ff, 0xa0e0ff: 0xd8a8ff, 0x9ad0ff: 0xc890ff },
  sporeblight: { 0xc0a0ff: 0xa8ff70, 0x1e2a10: 0x2a0e14 },
  shadowplay: {
    0xc080ff: 0xffc860,
    0xe0c0ff: 0xffe0a0,
    0xd0a0ff: 0xffd080,
    0xb070ff: 0xffb840,
    0xa0ffa0: 0xffe8a0,
    0xd8b0ff: 0xffe0a0,
  },
  drowned: { 0xe8f0ff: 0x80f0ff, 0xd8e8ff: 0x70e8ff },
  suntotem: { 0xe0ffc8: 0xfff0b0, 0x90ff60: 0xffc040, 0xc0ff90: 0xffd870, 0x1e2a10: 0x3a2a14, 0x3a5a1c: 0x8a6a3a },
  starfall: {
    0xe8ffb0: 0xe8c8ff,
    0xd8ffb0: 0xe0b0ff,
    0xf0ffe0: 0xf0e0ff,
    0xffd860: 0xd8a0ff,
    0xff7050: 0xff70e0,
    0xff8060: 0xff80e0,
    0xff6a50: 0xff6ae0,
    0xffb0a0: 0xffb0f0,
    0xff9a50: 0xc080ff,
    0xff9a70: 0xd070ff,
    0xffb090: 0xe0a0ff,
    0xffc0a0: 0xf0c0ff,
    0xffd0a0: 0xf0d0ff,
    0xe0ffb0: 0xe8d0ff,
  },
  celadon: { 0xffc860: 0x9fe0b0, 0xffe6a0: 0xd8f0ff, 0xffd070: 0xa8d8ff, 0xfff0c0: 0xe8f4ff, 0xffe0a0: 0xe0f0ff },
};
for (const [c, m] of Object.entries(TINTS)) setCostumeTints(c, m);

const TRAILS: Record<string, number> = {
  colossus: 0xff70c8,
  calliope: 0xe0b8ff,
  shadowplay: 0xffd080,
  drowned: 0x70e8ff,
  suntotem: 0xffe0a0,
  starfall: 0xd890ff,
  celadon: 0x7fb0ff,
};
for (const [c, col] of Object.entries(TRAILS)) setCostumeTrail(c, "trail", col);
setCostumeTrail("shadowplay", "grave", 0xffc050);

const SWAPS: Record<string, [THREE.Texture, THREE.Texture][]> = {
  colossus: [
    [FX.dust, WARLORD.dust],
    [FX.smoke, WARLORD.dust],
    [FX.fire, WARLORD.lavaGlow],
    [FX.splash, WARLORD.splash],
    [FX.pebbles, WARLORD.pebbles],
    [FX.rock, WARLORD.pebbles],
  ],
  calliope: [
    [FX.dust, ENGINEER.steam],
    [FX.smoke, ENGINEER.oilSmoke],
  ],
  sporeblight: [
    [FX.dust, RAIDER.dust],
    [FX.smoke, RAIDER.smoke],
  ],
  shadowplay: [
    [FX.dust, SUMMONER.trail],
    [FX.smoke, SUMMONER.smoke],
  ],
  drowned: [
    [FX.dust, DUELIST.rapier],
    [FX.smoke, DUELIST.rapier],
  ],
  suntotem: [
    [FX.dust, WARDEN.vine],
    [FX.smoke, WARDEN.pebbleDust],
  ],
  starfall: [
    [FX.dust, WREN.gust],
    [FX.smoke, WREN.gust],
    [FX.twinkle, WREN.glint],
  ],
  celadon: [
    [FX.dust, FRIAR.barley],
    [FX.smoke, FRIAR.smoke],
    [FX.fire, FRIAR.hoop],
    [FX.splash, FRIAR.splash],
  ],
};
for (const [c, list] of Object.entries(SWAPS)) for (const [a, b] of list) setCostumeSwap(c, a, b);

function geo<G extends THREE.BufferGeometry>(g: G, sx = 1, sy = 1, sz = 1): G {
  g.scale(sx, sy, sz);
  g.userData.model = true;
  return g;
}
function cogGeo(): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const n = 8 * 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = i % 4 < 2 ? 0.55 : 0.42;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  sh.holes.push(new THREE.Path().absarc(0, 0, 0.16, 0, Math.PI * 2, true));
  return geo(
    new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2),
  );
}
const rock = [...SHARED_CHUNK_GEOS][0];
const ironTex = new THREE.TextureLoader().load(ironUrl);
ironTex.colorSpace = THREE.SRGBColorSpace;
const seamTex = new THREE.TextureLoader().load(seamUrl);
seamTex.colorSpace = THREE.SRGBColorSpace;
const keep = <M extends THREE.Material>(m: M): M => ((m.userData.keep = true), m);
const lambert = (color: number, map: THREE.Texture | null = null) =>
  keep(new THREE.MeshLambertMaterial({ color, map, flatShading: true }));

COSTUME_SKIN.colossus = {
  chunk: {
    geos: [geo(new THREE.BoxGeometry(1, 0.2, 0.75)), cogGeo(), geo(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 6))],
    colors: [0x9a8a98, 0xe0b048, 0x7a7a84],
    tex: ironTex,
  },
  fisMat: {
    cut: () => lambert(0x3a3040, ironTex),
    lip: () => lambert(0xffffff, cv(WARLORD.slab, "colossus")),
    core: () =>
      keep(
        new THREE.MeshBasicMaterial({
          map: seamTex,
          alphaTest: 0.4,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        }),
      ),
  },
  lipFlat: 0.3,
  decal: new Map([
    [WARLORD.crackRing, "flat"],
    [WARLORD.rune, "gear"],
  ]),
};
COSTUME_SKIN.calliope = {
  chunk: {
    geos: [
      geo(new THREE.IcosahedronGeometry(0.5, 0), 1, 0.85, 1),
      geo(new THREE.BoxGeometry(0.9, 0.08, 0.55)),
      geo(new THREE.ConeGeometry(0.32, 0.8, 8)),
    ],
    colors: [0xfff0c8, 0x9a50e0, 0xe8b840],
    tex: null,
  },
  decal: new Map([[ENGINEER.gear, "flat"]]),
};
COSTUME_SKIN.sporeblight = {
  chunk: {
    geos: [
      geo(new THREE.SphereGeometry(0.5, 8, 6), 1, 0.8, 1),
      geo(new THREE.SphereGeometry(0.55, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)),
      geo(new THREE.IcosahedronGeometry(0.35, 0)),
    ],
    colors: [0xe8dcb8, 0xb02838, 0x7a9a40],
    tex: null,
  },
  fissure: { crack: "moss" },
  decal: new Map([[RAIDER.smokeRing, "flat"]]),
};
COSTUME_SKIN.shadowplay = {
  chunk: {
    geos: [geo(new THREE.BoxGeometry(1, 0.04, 0.7)), geo(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 3))],
    colors: [0x18161c, 0x242028, 0xe0b040],
    tex: null,
  },
};
COSTUME_SKIN.drowned = {
  chunk: {
    geos: [geo(new THREE.ConeGeometry(0.45, 0.5, 7)), geo(new THREE.CylinderGeometry(0.12, 0.2, 1, 5)), rock],
    colors: [0xf0d0c8, 0xf0a0a8, 0x4a5a70],
    tex: null,
  },
};
COSTUME_SKIN.suntotem = {
  chunk: { geos: [...SHARED_CHUNK_GEOS], colors: [0xe8b888, 0xd09868, 0x50c0b8] },
};
COSTUME_SKIN.starfall = {
  chunk: {
    geos: [geo(new THREE.OctahedronGeometry(0.5), 0.7, 1.2, 0.7), geo(new THREE.TetrahedronGeometry(0.5))],
    colors: [0xe0d0ff, 0xb080ff, 0xffffff],
    tex: null,
  },
};
COSTUME_SKIN.celadon = {
  chunk: {
    geos: [geo(new THREE.TetrahedronGeometry(0.55), 1, 0.35, 1), geo(new THREE.BoxGeometry(0.9, 0.08, 0.6))],
    colors: [0xf4f8fa, 0x3a68b8, 0xa8d8b8],
    tex: null,
  },
  fisMat: { lip: () => lambert(0xf0f4f8), cut: () => lambert(0x4a3018) },
  lipFlat: 0.35,
};
