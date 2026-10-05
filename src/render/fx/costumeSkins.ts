// Per-costume FX theming, registered at load: colour remaps (setCostumeTints), weapon trail colours
// (setCostumeTrail), common-cell swaps (setCostumeSwap) and procedural skins (COSTUME_SKIN: chunk geometry and
// colours, fissure materials/styles, per-texture decal overrides). Classic costumes have no entry.
import * as THREE from "three";
import ironUrl from "../../../assets/textures/iron.png?url";
import seamUrl from "../../../assets/fx/colossus_seam.png?url";
import {
  ARCHITECT,
  cv,
  DUELIST,
  ENGINEER,
  FRIAR,
  FX,
  RAIDER,
  SCRIBE,
  setCostumeSwap,
  setCostumeTints,
  setCostumeTrail,
  SUMMONER,
  WARDEN,
  WARLORD,
  WITCH,
  WREN,
} from "./atlas";
import { COSTUME_SKIN, SHARED_CHUNK_GEOS } from "./chunks";

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
  // Brindle (harpooner): his sea-water shockwaves and glints.
  tideadmiral: { 0xb8f4ff: 0xffe08a },
  bogtoad: { 0xb8f4ff: 0xc8d090 },
  deepglow: { 0xb8f4ff: 0xc890ff },
  // Hollin: blue-black ink and gold runes become honey, moonlight or red correction ink.
  queenbee: { 0xa0b0ff: 0xffd070, 0x303868: 0x8a5a10, 0xc8d0ff: 0xffe0a0 },
  vigil: {
    0xffd060: 0xc8b8ff,
    0xffd870: 0xd0c4ff,
    0xffe090: 0xe4dcff,
    0xffe6a0: 0xe8e0ff,
    0xffc840: 0xb0a0ff,
    0xa0b0ff: 0xc0a8ff,
    0x303868: 0x403080,
  },
  redink: {
    0xffd060: 0xff5a48,
    0xffd870: 0xff6a58,
    0xffe090: 0xff8a78,
    0xffe6a0: 0xff9888,
    0xffc840: 0xff4838,
    0xa0b0ff: 0xff7060,
    0x303868: 0x701818,
    0xc8d0ff: 0xffb0a0,
  },
  // Mother Kelp (wreckwitch): her shock rings and splash tints follow the costume's sea.
  siren: { 0xc0fff0: 0xffd0e8, 0xb0fff0: 0xffc0dc, 0xa0ffe8: 0xffa8d0 },
  bogqueen: { 0xc0fff0: 0xe8e8a0, 0xb0fff0: 0xd8e090, 0xa0ffe8: 0xc8d870 },
  frostwreck: { 0xc0fff0: 0xf0faff, 0xb0fff0: 0xe0f4ff, 0xa0ffe8: 0xc8ecff },
  // Professor Hoot (architect): his frost/ice kit colours per costume.
  snowy: { 0xa8e8ff: 0xd8b8ff, 0xd8f4ff: 0xf2e6ff, 0xe8fbff: 0xf6eeff, 0xe8f6ff: 0xf2e8ff },
  temple: { 0xa8e8ff: 0x58e0b8, 0xd8f4ff: 0xb8f0d8, 0xe8fbff: 0xd8fff0, 0xe8f6ff: 0xc8f0e0 },
  clockwork: { 0xa8e8ff: 0xffb850, 0xd8f4ff: 0xffe0a0, 0xe8fbff: 0xfff0c8, 0xe8f6ff: 0xd8d0c8 },
  // Gristle (vintner): the wine-pink hit flashes become harvest gold, forge orange and frost blue.
  harvestking: { 0xb0305a: 0xe0a020, 0xffd8e0: 0xfff0b0, 0xffd0e0: 0xfff0c0 },
  forgemaster: { 0xb0305a: 0xff6a10, 0xffd8e0: 0xffc080, 0xffd0e0: 0xffd090, 0xfff0e0: 0xffd8b0, 0xffe080: 0xff9a40 },
  icewine: { 0xb0305a: 0x80c8ff, 0xffd8e0: 0xe0f0ff, 0xffd0e0: 0xe8f4ff, 0xffe080: 0xc8e8ff, 0xffe8a0: 0xd0f0ff },
  // Bramble & Mead: the kit's honey golds become each costume's honey.
  warhornet: {
    0xffd060: 0xff5040,
    0xffe080: 0xff7050,
    0xfff0b0: 0xffb0a0,
    0xffe8a0: 0xff8070,
    0xfff4d0: 0xffc0b0,
    0xfff0c0: 0xffa090,
    0xffc040: 0xff4030,
  },
  lavenderfield: {
    0xffd060: 0xd0a0ff,
    0xffe080: 0xe0b8ff,
    0xfff0b0: 0xf0e0ff,
    0xffe8a0: 0xe8d0ff,
    0xfff4d0: 0xf4ecff,
    0xfff0c0: 0xf0e4ff,
    0xffc040: 0xc890ff,
  },
  queencourier: {
    0xffd060: 0xffe8b0,
    0xffe080: 0xfff0c8,
    0xfff0b0: 0xfff8e8,
    0xffe8a0: 0xd8b0ff,
    0xfff4d0: 0xfffaf0,
    0xfff0c0: 0xf0e0ff,
    0xffc040: 0xc080ff,
  },
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
  tideadmiral: 0xffd060,
  bogtoad: 0xa8b060,
  deepglow: 0xb070ff,
  queenbee: 0xffc840,
  vigil: 0xb0a0ff,
  redink: 0xd02828,
  siren: 0xff8fb8,
  bogqueen: 0x9ab040,
  frostwreck: 0xc8f0ff,
  snowy: 0xd8b8ff,
  temple: 0x58d8b8,
  clockwork: 0xffc060,
  harvestking: 0xe0a020,
  forgemaster: 0xff6a10,
  icewine: 0x80c8ff,
  warhornet: 0xff4a3a,
  lavenderfield: 0xd8a8ff,
  queencourier: 0xb070ff,
  frostbite: 0x9ae8ff,
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
  queenbee: [
    [FX.dust, SCRIBE.inkCloud],
    [FX.twinkle, SCRIBE.star],
  ],
  vigil: [
    [FX.dust, SCRIBE.inkCloud],
    [FX.twinkle, SCRIBE.star],
  ],
  redink: [
    [FX.dust, SCRIBE.inkCloud],
    [FX.twinkle, SCRIBE.star],
  ],
  siren: [[FX.splash, WITCH.brine]],
  bogqueen: [
    [FX.dust, WITCH.cloud],
    [FX.splash, WITCH.brine],
  ],
  frostwreck: [
    [FX.dust, WITCH.cloud],
    [FX.splash, WITCH.brine],
  ],
  snowy: [[FX.twinkle, ARCHITECT.twinkle]],
  temple: [
    [FX.dust, ARCHITECT.chalk],
    [FX.splash, ARCHITECT.spray],
  ],
  clockwork: [
    [FX.dust, ARCHITECT.chalk],
    [FX.smoke, ARCHITECT.snow],
    [FX.twinkle, ARCHITECT.twinkle],
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
  decal: new Map([[WARLORD.crackRing, "flat"]]),
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
COSTUME_SKIN.bogtoad = {
  chunk: { geos: [...SHARED_CHUNK_GEOS], colors: [0x5a4a2a, 0x6a6a30, 0x3a3018] },
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
COSTUME_SKIN.snowy = {
  chunk: {
    geos: [geo(new THREE.OctahedronGeometry(0.45), 0.8, 1.1, 0.8), geo(new THREE.BoxGeometry(0.7, 0.5, 0.6))],
    colors: [0xf4ecff, 0xd8c0ff, 0xffffff],
    tex: null,
  },
};
COSTUME_SKIN.temple = {
  chunk: {
    geos: [rock, geo(new THREE.ConeGeometry(0.3, 0.9, 6)), geo(new THREE.BoxGeometry(0.8, 0.45, 0.6))],
    colors: [0x6a8a70, 0xe8d8b8, 0x4a6a5a],
    tex: null,
  },
};
COSTUME_SKIN.clockwork = {
  chunk: {
    geos: [cogGeo(), geo(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 6)), geo(new THREE.BoxGeometry(0.9, 0.12, 0.6))],
    colors: [0xe0b048, 0xc87a40, 0x8a8a90],
    tex: ironTex,
  },
};
