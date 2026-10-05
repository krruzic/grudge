// Hollin (scribe) kit: ink splash hits, Ink Bolt launches / ricochets / blots, rune writing and flares, bee swarm
// casts and calls, Erratum page swaps, Illuminated Manuscript and Page Gust. The bolts in flight, her runes and
// her ambient bees are drawn by heroProps/scribe.ts; the swarm zone itself by hazards/zones.ts (swarmZone below).
import * as THREE from "three";
import { cv, FX, hd, SCRIBE, tint } from "../fx/atlas";
import { type FxHost, emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { shockwave } from "../fx/shockwave";
import { dirOf, ground, streakLine, UP } from "./shared";
import { KITS } from "./registry";

export const INK = 0x1c2448;
export const GOLD = 0xffd060;

function inkSplash(h: FxHost, x: number, y: number, z: number, n: THREE.Vector3, big: boolean): void {
  emit(h, {
    tex: SCRIBE.splat,
    n: 1,
    x,
    y,
    z,
    size: big ? [1.7, 1.7] : [1.1, 1.1],
    grow: 1.35,
    life: [0.2, 0.2],
    speed: [0, 0],
    order: 5,
  });
  emit(h, {
    tex: SCRIBE.drop,
    n: big ? 9 : 5,
    x,
    y: y + 0.1,
    z,
    size: [0.14, 0.26],
    life: [0.45, 0.7],
    speed: [2, 4.5],
    up: [1.5, 3],
    dir: { x: n.x, y: 0.3, z: n.z },
    cone: 1.1,
    gravity: 14,
    floor: (h.world ? h.world.groundY(x, z) : y - 1) + 0.05,
  });
  emit(h, {
    tex: SCRIBE.inkCloud,
    n: big ? 2 : 1,
    x,
    y,
    z,
    size: [0.5, 0.8],
    grow: 1.7,
    life: [0.35, 0.55],
    speed: [0.4, 1],
    opacity: 0.75,
  });
}

function sparkle(h: FxHost, x: number, y: number, z: number, n: number, jitter: number, color = GOLD): void {
  emit(h, {
    tex: SCRIBE.star,
    n,
    x,
    y,
    z,
    color,
    size: [0.22, 0.38],
    life: [0.4, 0.7],
    speed: [0.4, 1.4],
    up: [0.4, 1.2],
    additive: true,
    jitter,
  });
}

function pageBurst(h: FxHost, x: number, y: number, z: number, n: number, speed: number): void {
  emit(h, {
    tex: SCRIBE.page,
    n,
    x,
    y,
    z,
    size: [0.35, 0.55],
    life: [0.6, 1],
    speed: [speed * 0.5, speed],
    up: [1, 2.5],
    gravity: 2.5,
    drag: 1.5,
    spin: 6,
  });
}

function beeBurst(h: FxHost, x: number, y: number, z: number, n: number, r: number): void {
  emit(h, {
    tex: SCRIBE.bee,
    n,
    x,
    y,
    z,
    size: [0.22, 0.32],
    life: [0.5, 0.9],
    speed: [r * 1.2, r * 2.2],
    flatSpread: true,
    up: [0.3, 1.2],
    drag: 2.5,
  });
}

/** Charged-bolt blot / rune flare: a big ink splat on the ground with ink clouds and drops. */
function blotFx(h: FxHost, x: number, gy: number, z: number, r: number, seconds: number): void {
  decal(h, SCRIBE.splat, x, gy + 0.03, z, r, Math.max(1.2, seconds + 0.6), {
    grow: 0.15,
    opacity: 0.95,
    rot: Math.random() * 6,
  });
  emit(h, {
    tex: SCRIBE.inkCloud,
    n: 5,
    x,
    y: gy + 0.6,
    z,
    size: [0.9, 1.4],
    grow: 1.6,
    life: [0.6, 1],
    speed: [1, 2.5],
    flatSpread: true,
    up: [0.3, 0.8],
    drag: 2,
    opacity: 0.8,
  });
  emit(h, {
    tex: SCRIBE.drop,
    n: 14,
    x,
    y: gy + 0.5,
    z,
    size: [0.16, 0.28],
    life: [0.5, 0.8],
    speed: [2, r * 2],
    up: [2.5, 5],
    gravity: 14,
    floor: gy + 0.05,
  });
  shockwave(h, FX.shock, x, gy + 0.15, z, UP, 0.3, r, 0.35, 0x303868, 0.85);
  h.shake = Math.max(h.shake, 0.18);
}

function runeFlash(h: FxHost, x: number, gy: number, z: number, r: number, big: boolean): void {
  decal(h, SCRIBE.rune, x, gy + 0.05, z, r, big ? 0.9 : 0.6, { grow: 0.35, spin: 1.5, additive: true, opacity: 1 });
  emit(h, {
    tex: SCRIBE.sigil,
    n: big ? 3 : 1,
    x,
    y: gy + 1,
    z,
    size: [0.9, 1.3],
    grow: 1.3,
    life: [0.5, 0.8],
    speed: [0.2, 0.5],
    up: [1, 2],
    additive: true,
    jitter: r * 0.5,
  });
  sparkle(h, x, gy + 0.6, z, big ? 12 : 6, r * 1.2);
  shockwave(h, FX.shock, x, gy + 0.2, z, UP, 0.3, r * 1.1, 0.35, 0xffd870, 0.9);
  if (big) {
    const col = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: hd(FX.burst),
        color: tint(0xffe090),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    col.position.set(x, gy + 2, z);
    h.add(col, 0.5, (k) => {
      col.scale.set(r * 0.8 * (1 - k * 0.5), 4.5 * (0.6 + k), 1);
      col.material.opacity = 0.8 * (1 - k);
    });
  }
}

KITS.scribe = {
  trail: 0x2a3a80,
  hit(h, ev, src, dx, dz) {
    const sting =
      !ev.big &&
      (ev.amount ?? 0) < 30 &&
      !!h.world?.zones.some(
        (z) => z.ownerId === src.id && z.style === "swarm" && Math.hypot(z.x - ev.x, z.z - ev.z) <= z.radius + 0.6,
      );
    if (sting) {
      emit(h, {
        tex: SCRIBE.bee,
        n: 1,
        x: ev.x,
        y: ev.y + 0.4,
        z: ev.z,
        size: [0.22, 0.28],
        life: [0.25, 0.35],
        speed: [1, 2],
        jitter: 0.5,
      });
      emit(h, {
        tex: FX.twinkle,
        n: 1,
        x: ev.x,
        y: ev.y + 0.3,
        z: ev.z,
        color: 0xffa040,
        size: [0.2, 0.3],
        life: [0.15, 0.2],
        speed: [0, 0],
        additive: true,
        jitter: 0.6,
      });
      return true;
    }
    const n = dirOf(dx, dz);
    const px = ev.x - n.x * 0.3;
    const pz = ev.z - n.z * 0.3;
    inkSplash(h, px, ev.y + 0.3, pz, n, ev.big);
    emit(h, {
      tex: FX.burst2,
      n: 1,
      x: px,
      y: ev.y + 0.3,
      z: pz,
      color: 0xa0b0ff,
      size: ev.big ? [1.2, 1.2] : [0.8, 0.8],
      grow: 1.5,
      life: [0.1, 0.1],
      speed: [0, 0],
      additive: true,
      order: 6,
    });
    h.shake = Math.max(h.shake, ev.big ? 0.2 : 0.06);
    return true;
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "inkShot":
      case "inkCharged": {
        const big = ev.name === "inkCharged";
        emit(h, {
          tex: SCRIBE.stroke,
          n: 1,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          size: big ? [1.6, 1.6] : [1, 1],
          grow: 1.3,
          life: [0.18, 0.18],
          speed: [0, 0],
        });
        if (big) {
          emit(h, {
            tex: SCRIBE.sigil,
            n: 1,
            x: ev.x,
            y: ev.y + 0.3,
            z: ev.z,
            size: [1, 1],
            grow: 1.5,
            life: [0.35, 0.35],
            speed: [0, 0],
            additive: true,
          });
          sparkle(h, ev.x, ev.y, ev.z, 6, 0.6);
        }
        return true;
      }
      case "inkBounce":
        emit(h, {
          tex: SCRIBE.splat,
          n: 1,
          x: ev.x,
          y: ev.y,
          z: ev.z,
          size: [0.8, 0.8],
          grow: 1.4,
          life: [0.18, 0.18],
          speed: [0, 0],
        });
        sparkle(h, ev.x, ev.y, ev.z, 3, 0.3, 0xc8d0ff);
        return true;
      case "inkHit":
        return true;
      case "inkBlot":
        blotFx(h, ev.x, gy, ev.z, ev.radius ?? 2.4, ev.seconds ?? 1.2);
        return true;
      case "rune":
        emit(h, {
          tex: SCRIBE.quill,
          n: 1,
          x: ev.x,
          y: gy + 0.9,
          z: ev.z,
          size: [0.7, 0.7],
          life: [0.4, 0.4],
          speed: [0.2, 0.2],
          up: [1, 1],
          opacity: 0.9,
        });
        sparkle(h, ev.x, gy + 0.3, ev.z, 5, 1.4);
        return true;
      case "runeUse":
        runeFlash(h, ev.x, gy, ev.z, 2, false);
        return true;
      case "runeFlare":
        runeFlash(h, ev.x, gy, ev.z, ev.radius ?? 2.6, true);
        h.shake = Math.max(h.shake, 0.25);
        return true;
      case "swarm":
      case "greatSwarm": {
        const r = ev.radius ?? 2.6;
        const great = ev.name === "greatSwarm";
        decal(h, SCRIBE.hiveRing, ev.x, gy + 0.04, ev.z, r, 0.6, { grow: 0.3, spin: 0.6, opacity: 0.6 });
        beeBurst(h, ev.x, gy + 1, ev.z, great ? 18 : 10, r);
        emit(h, {
          tex: SCRIBE.comb,
          n: great ? 4 : 2,
          x: ev.x,
          y: gy + 0.8,
          z: ev.z,
          size: [0.3, 0.45],
          life: [0.5, 0.8],
          speed: [2, 3.5],
          up: [2.5, 4],
          gravity: 14,
          spin: 6,
          floor: gy + 0.05,
        });
        shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.35, r, 0.35, 0xffc840, 0.8);
        if (great) runeFlash(h, ev.x, gy, ev.z, r, false);
        return true;
      }
      case "swarmCall": {
        const tx = ev.tx ?? ev.x;
        const tz = ev.tz ?? ev.z;
        streakLine(h, cv(SCRIBE.bees), ev.x, gy + 1.2, ev.z, tx, tz, 7, 0xffffff, 0.9, false);
        beeBurst(h, tx, ground(h, tx, tz, gy) + 1.2, tz, 8, 1.2);
        return true;
      }
      case "erratum": {
        const tx = ev.tx ?? ev.x;
        const tz = ev.tz ?? ev.z;
        const ty = ground(h, tx, tz, gy);
        for (const [x, y, z] of [
          [ev.x, gy, ev.z],
          [tx, ty, tz],
        ] as const) {
          pageBurst(h, x, y + 1, z, 8, 3);
          emit(h, {
            tex: SCRIBE.inkCloud,
            n: 3,
            x,
            y: y + 0.9,
            z,
            size: [0.8, 1.2],
            grow: 1.5,
            life: [0.35, 0.55],
            speed: [0.5, 1.5],
            opacity: 0.7,
          });
          decal(h, SCRIBE.rune, x, y + 0.05, z, 1.6, 0.5, { grow: 0.4, spin: 3, additive: true });
        }
        streakLine(h, SCRIBE.stroke, ev.x, gy + 1, ev.z, tx, tz, 6, 0xffffff, 1.4, false);
        return true;
      }
      case "manuscript": {
        const r = ev.radius ?? 4;
        decal(h, SCRIBE.ring, ev.x, gy + 0.04, ev.z, r * 1.15, 1.6, { grow: 0.3, spin: 0.3, opacity: 0.95 });
        decal(h, SCRIBE.rune, ev.x, gy + 0.06, ev.z, r * 0.8, 1.2, { grow: 0.4, spin: -0.8, additive: true });
        shockwave(h, FX.shock, ev.x, gy + 0.3, ev.z, UP, 0.45, r * 1.2, 0.45, 0xffe090, 1);
        pageBurst(h, ev.x, gy + 1.2, ev.z, 18, 5);
        sparkle(h, ev.x, gy + 1.5, ev.z, 16, 2.5);
        emit(h, {
          tex: SCRIBE.sigil,
          n: 4,
          x: ev.x,
          y: gy + 2,
          z: ev.z,
          size: [0.9, 1.3],
          life: [0.7, 1],
          speed: [1, 2],
          up: [1.5, 2.5],
          additive: true,
          jitter: 1.5,
        });
        h.shake = Math.max(h.shake, 0.4);
        return true;
      }
      case "gust": {
        const tx = ev.tx ?? ev.x;
        const tz = ev.tz ?? ev.z;
        const d = Math.hypot(tx - ev.x, tz - ev.z) || 1;
        emit(h, {
          tex: SCRIBE.pages,
          n: 1,
          x: ev.x,
          y: gy + 1.3,
          z: ev.z,
          size: [1, 1],
          life: [0.4, 0.4],
          speed: [0.5, 0.5],
          up: [0.5, 0.5],
        });
        emit(h, {
          tex: SCRIBE.page,
          n: 8,
          x: ev.x,
          y: gy + 1,
          z: ev.z,
          size: [0.3, 0.5],
          life: [0.5, 0.9],
          speed: [4, 8],
          dir: { x: -(tx - ev.x) / d, y: 0.25, z: -(tz - ev.z) / d },
          cone: 0.7,
          drag: 2,
          spin: 8,
        });
        emit(h, {
          tex: FX.dust,
          n: 5,
          x: ev.x,
          y: gy + 0.3,
          z: ev.z,
          size: [0.7, 1.1],
          grow: 1.7,
          life: [0.4, 0.6],
          speed: [1, 2.5],
          flatSpread: true,
          drag: 3,
          opacity: 0.8,
        });
        shockwave(h, FX.shock, ev.x, gy + 0.8, ev.z, UP, 0.25, 2.4, 0.25, 0xf0e8d0, 0.7);
        return true;
      }
    }
    return false;
  },
  act(h, ev) {
    if (ev.phase !== "start") return;
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.kind === "swarm")
      emit(h, {
        tex: SCRIBE.bee,
        n: 5,
        x: ev.x,
        y: gy + 1.5,
        z: ev.z,
        size: [0.18, 0.26],
        life: [0.4, 0.6],
        speed: [0.8, 1.6],
        jitter: 0.6,
      });
    else if (ev.kind === "manuscript") {
      emit(h, {
        tex: SCRIBE.sigil,
        n: 3,
        x: ev.x,
        y: gy + 1.4,
        z: ev.z,
        size: [0.5, 0.8],
        life: [0.5, 0.7],
        speed: [0.3, 0.8],
        up: [1, 2],
        additive: true,
        jitter: 1,
      });
      sparkle(h, ev.x, gy + 1.5, ev.z, 8, 1.2);
    } else if (ev.kind === "erratum") sparkle(h, ev.x, gy + 1, ev.z, 5, 0.8, 0xc8d0ff);
  },
};

/** The swarm zone: a faint honeycomb ring and bees that circle inside it (animated by animateSwarm). */
export function swarmZone(g: THREE.Group, r: number): void {
  const hive = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2.1, r * 2.1),
    new THREE.MeshBasicMaterial({
      map: hd(SCRIBE.hiveRing),
      transparent: true,
      depthWrite: false,
      opacity: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  hive.rotation.x = -Math.PI / 2;
  hive.position.y = 0.12;
  hive.name = "hive";
  g.add(hive);
  const n = Math.round(10 + r * 6);
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cv(i % 4 === 0 ? SCRIBE.bees : SCRIBE.bee),
        transparent: true,
        depthWrite: false,
      }),
    );
    sp.name = "bee";
    sp.scale.setScalar(i % 4 === 0 ? 0.55 : 0.34 + Math.random() * 0.1);
    sp.userData.phase = Math.random() * Math.PI * 2;
    sp.userData.rad = r * (0.2 + Math.random() * 0.75);
    sp.userData.speed = (1.2 + Math.random() * 1.4) * (Math.random() < 0.5 ? 1 : -1);
    sp.userData.h = 0.5 + Math.random() * 1.6;
    g.add(sp);
  }
}

/** Per frame: bees orbit and bob; a swarm following Hollin glides after her. */
export function animateSwarm(
  o: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  follow: boolean,
  time: number,
  dt: number,
  life: number,
): void {
  if (follow) {
    const k = Math.min(1, dt * 10);
    o.position.x += (x - o.position.x) * k;
    o.position.z += (z - o.position.z) * k;
    o.position.y += (y - o.position.y) * k;
  }
  for (const c of o.children) {
    if (c.name === "hive") {
      c.rotation.z += dt * 0.25;
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.3 * life;
    }
    if (c.name !== "bee") continue;
    const u = c.userData;
    const a = u.phase + time * u.speed;
    const wob = Math.sin(time * 5 + u.phase) * 0.15;
    c.position.set(Math.cos(a) * (u.rad + wob), u.h + Math.sin(time * 3 + u.phase) * 0.25, Math.sin(a) * (u.rad + wob));
    const m = (c as THREE.Sprite).material;
    m.rotation = -a + (u.speed > 0 ? 0 : Math.PI);
    m.opacity = life;
  }
}
