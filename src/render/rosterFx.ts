import * as THREE from "three";
import { DUELIST, ENGINEER, FX, HERALD, RAIDER, SUMMONER } from "./fxKit";
import { chunks, decal, emit, shockwave, tumblers, type FxHost } from "./fxParts";
import { KITS, type HitEvent } from "./kits";

const UP = new THREE.Vector3(0, 1, 0);
const ground = (h: FxHost, x: number, z: number, y: number) => (h.world ? h.world.groundY(x, z) : y);
function dirOf(dx: number, dz: number): THREE.Vector3 {
  const n = new THREE.Vector3(dx, 0, dz);
  if (n.lengthSq() < 1e-4) n.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  return n.normalize();
}
const near = (ev: HitEvent, src: { transform: { pos: { x: number; z: number } } }, r: number) => Math.hypot(src.transform.pos.x - ev.x, src.transform.pos.z - ev.z) <= r;

function core(h: FxHost, ev: HitEvent, dx: number, dz: number, main: THREE.Texture, ring: THREE.Texture, ringColor: THREE.ColorRepresentation, sparks: THREE.Texture, sparkColor?: THREE.ColorRepresentation): { n: THREE.Vector3; px: number; py: number; pz: number; gy: number } {
  const n = dirOf(dx, dz);
  const px = ev.x - n.x * 0.35;
  const pz = ev.z - n.z * 0.35;
  const py = ev.y + 0.3;
  const gy = ground(h, ev.x, ev.z, ev.y - 1);
  const big = ev.big;
  emit(h, { tex: FX.burst2, n: 1, x: px, y: py, z: pz, size: big ? [1.4, 1.4] : [0.9, 0.9], grow: 1.6, life: [0.1, 0.1], speed: [0, 0], additive: true, order: 6 });
  emit(h, { tex: main, n: 1, x: px, y: py, z: pz, size: big ? [2.3, 2.3] : [1.4, 1.4], grow: 1.3, life: [0.2, 0.2], speed: [0, 0], order: 5 });
  shockwave(h, ring, px, py, pz, n, 0.25, big ? 1.9 : 1.1, big ? 0.28 : 0.18, ringColor, 0.9);
  emit(h, { tex: sparks, n: big ? 7 : 4, x: px, y: py, z: pz, color: sparkColor, size: [0.25, 0.45], life: [0.18, 0.35], speed: [5, 9], dir: { x: n.x, y: 0.4, z: n.z }, cone: 0.9, gravity: 12, additive: true });
  emit(h, { tex: FX.dust, n: big ? 3 : 1, x: ev.x, y: gy + 0.35, z: ev.z, size: [0.7, 1], grow: 1.8, life: [0.4, 0.65], speed: [1, 2.2], flatSpread: true, drag: 3, opacity: 0.8 });
  h.shake = Math.max(h.shake, big ? 0.28 : 0.1);
  return { n, px, py, pz, gy };
}

function streakLine(h: FxHost, tex: THREE.Texture, x0: number, y: number, z0: number, x1: number, z1: number, n: number, color: THREE.ColorRepresentation = 0xffffff, width = 1.6, additive = true): void {
  const rot = Math.atan2(-(z1 - z0), x1 - x0);
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    h.after(f * 0.12, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
      s.material.rotation = rot;
      s.position.set(x0 + (x1 - x0) * f, y + (Math.random() - 0.5) * 0.3, z0 + (z1 - z0) * f);
      h.add(s, 0.35, (q) => {
        s.scale.set(width * (1 + q * 0.4), width * 0.5 * (1 - q * 0.5), 1);
        s.material.opacity = 0.9 * (1 - q);
      });
    });
  }
}

KITS.raider = {
  trail: 0xa0ff90,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.6)) return false;
    const c = core(h, ev, dx, dz, ev.big ? RAIDER.cross : RAIDER.slash, RAIDER.darkSlash, 0xc0a0ff, FX.twinkle, 0xc0ffb0);
    emit(h, { tex: RAIDER.drop, n: ev.big ? 5 : 2, x: c.px, y: c.py, z: c.pz, size: [0.2, 0.32], life: [0.4, 0.6], speed: [2, 4], up: [1.5, 3], dir: { x: c.n.x, y: 0.3, z: c.n.z }, cone: 1, gravity: 14, floor: c.gy + 0.05 });
    if (ev.big) emit(h, { tex: RAIDER.poison, n: 1, x: c.px, y: c.py, z: c.pz, size: [1.6, 1.6], grow: 1.4, life: [0.3, 0.3], speed: [0, 0] });
    return true;
  },
  event(h, ev) {
    if (ev.type === "reach" && ev.style === "afterimage") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      streakLine(h, RAIDER.dashStreak, ev.x, gy + 1.2, ev.z, ev.tx, ev.tz, 6, 0xffffff, 2, false);
      streakLine(h, RAIDER.shadow, ev.x, gy + 1, ev.z, ev.tx, ev.tz, 4, 0xffffff, 1.4, false);
      return true;
    }
    if (ev.type === "blink") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, { tex: RAIDER.smoke, n: 14, x: ev.x, y: gy + 0.8, z: ev.z, size: [1.6, 2.4], grow: 1.8, life: [1.2, 1.8], speed: [0.8, 2.4], flatSpread: true, up: [0.2, 0.8], drag: 1.5, opacity: 0.95, jitter: 1 });
      emit(h, { tex: RAIDER.shadow, n: 6, x: ev.x, y: gy + 1.4, z: ev.z, size: [1, 1.6], grow: 1.4, life: [0.8, 1.2], speed: [0.5, 1.5], up: [1, 2], drag: 1, jitter: 0.8 });
      decal(h, RAIDER.smokeRing, ev.x, gy, ev.z, 2.2, 1.4, { grow: 0.3, spin: 1 });
      emit(h, { tex: RAIDER.glint, n: 2, x: ev.x, y: gy + 1.8, z: ev.z, size: [0.6, 0.8], life: [0.35, 0.35], speed: [0, 0], additive: true, jitter: 0.5 });
      return true;
    }
    if (ev.type === "slam") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, { tex: FX.burst, n: 1, x: ev.x, y: gy + 0.5, z: ev.z, size: [2.4, 2.4], grow: 1.4, life: [0.12, 0.12], speed: [0, 0], additive: true });
      shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.4, ev.radius * 1.1, 0.35, 0xd0ffc0);
      decal(h, FX.crack, ev.x, gy, ev.z, ev.radius * 0.7, 1.4, { grow: 0.06 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        emit(h, { tex: RAIDER.dust, n: 1, x: ev.x, y: gy + 0.4, z: ev.z, size: [0.9, 1.3], grow: 1.8, life: [0.5, 0.8], speed: [ev.radius * 1.2, ev.radius * 1.8], dir: { x: Math.cos(a), y: 0.1, z: Math.sin(a) }, cone: 0.2, drag: 3.5, opacity: 0.85 });
      }
      chunks(h, 4, ev.x, gy + 0.3, ev.z, { size: [0.12, 0.2], speed: [2, 4], up: [4, 6] });
      h.shake = Math.max(h.shake, 0.35);
      return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "leap") {
      emit(h, { tex: RAIDER.dust, n: 5, x: ev.x, y: gy + 0.3, z: ev.z, size: [0.9, 1.2], grow: 1.7, life: [0.4, 0.7], speed: [1, 2.5], flatSpread: true, drag: 3, opacity: 0.85 });
      if (ev.toX !== undefined && ev.toZ !== undefined) streakLine(h, RAIDER.dashStreak, ev.x, gy + 1.8, ev.z, ev.toX, ev.toZ, 5, 0xffffff, 1.8, false);
    }
    if (ev.phase === "start" && ev.kind === "dash") {
      const L = 8;
      emit(h, { tex: RAIDER.glint, n: 1, x: ev.x, y: gy + 1.8, z: ev.z, size: [1.2, 1.2], grow: 1.3, life: [0.25, 0.25], speed: [0, 0], additive: true });
      streakLine(h, RAIDER.dashStreak, ev.x, gy + 1.2, ev.z, ev.x + ev.dirX * L, ev.z + ev.dirZ * L, 7, 0xffffff, 2.2, false);
      streakLine(h, RAIDER.afterimage, ev.x, gy + 1.0, ev.z, ev.x + ev.dirX * L, ev.z + ev.dirZ * L, 5, 0xc0ffb0, 1.6);
      emit(h, { tex: RAIDER.dust, n: 4, x: ev.x, y: gy + 0.3, z: ev.z, size: [0.8, 1.1], grow: 1.7, life: [0.4, 0.6], speed: [1, 2.5], dir: { x: -ev.dirX, y: 0.2, z: -ev.dirZ }, cone: 0.6, drag: 3, opacity: 0.85 });
    }
  },
};

KITS.duelist = {
  trail: 0xd8e8ff,
  trailWidth: 0.6,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 4.4)) return false;
    const c = core(h, ev, dx, dz, ev.big ? DUELIST.crit : DUELIST.clash, DUELIST.crescent, 0xffffff, DUELIST.sparkle);
    emit(h, { tex: DUELIST.cut, n: 1, x: c.px, y: c.py, z: c.pz, size: [1.8, 1.8], grow: 1.2, life: [0.16, 0.16], speed: [0, 0], additive: true, order: 7 });
    emit(h, { tex: DUELIST.star, n: 1, x: c.px, y: c.py + 0.2, z: c.pz, size: [0.7, 0.7], grow: 1.6, life: [0.2, 0.2], speed: [0, 0], additive: true, order: 7 });
    if (ev.big) {
      emit(h, { tex: DUELIST.petal, n: 5, x: c.px, y: c.py, z: c.pz, size: [0.3, 0.45], life: [0.9, 1.4], speed: [1.5, 3.5], up: [1, 2.5], gravity: 3, drag: 1.5, spin: 6 });
      emit(h, { tex: DUELIST.fleur, n: 1, x: c.px, y: c.py + 1.3, z: c.pz, size: [0.9, 0.9], grow: 1.2, life: [0.6, 0.6], speed: [0, 0], up: [1, 1], fadeIn: 0.1 });
    }
    return true;
  },
  event(h, ev) {
    if (ev.type === "blink") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, { tex: DUELIST.gust, n: 3, x: ev.x, y: gy + 0.9, z: ev.z, size: [1.2, 1.6], grow: 1.6, life: [0.35, 0.5], speed: [0.5, 1.5], flatSpread: true, opacity: 0.85, jitter: 0.6 });
      emit(h, { tex: DUELIST.glint, n: 1, x: ev.x, y: gy + 1.6, z: ev.z, size: [1.4, 1.4], grow: 1.3, life: [0.2, 0.2], speed: [0, 0], additive: true });
      emit(h, { tex: DUELIST.sparkle, n: 6, x: ev.x, y: gy + 1.2, z: ev.z, size: [0.3, 0.45], life: [0.3, 0.5], speed: [1, 3], up: [0.5, 1.5], additive: true, jitter: 0.6 });
      tumblers(h, [DUELIST.feather, DUELIST.petal], 2, ev.x, gy + 2, ev.z, { speed: [0.3, 1], up: [0.5, 1.5], size: [0.35, 0.45], life: [1.2, 1.6] });
      return true;
    }
    if (ev.type === "parry") {
      emit(h, { tex: DUELIST.clash, n: 1, x: ev.x, y: ev.y + 0.4, z: ev.z, size: [2.6, 2.6], grow: 1.3, life: [0.22, 0.22], speed: [0, 0], additive: true, order: 7 });
      shockwave(h, DUELIST.parryRing, ev.x, ev.y + 0.4, ev.z, UP, 0.5, 2.4, 0.35, 0xffffff);
      emit(h, { tex: DUELIST.crossed, n: 1, x: ev.x, y: ev.y + 1.8, z: ev.z, size: [1.3, 1.3], grow: 1.2, life: [0.7, 0.7], speed: [0, 0], up: [0.8, 0.8], fadeIn: 0.1, order: 8 });
      emit(h, { tex: DUELIST.sparkle, n: 8, x: ev.x, y: ev.y + 0.4, z: ev.z, size: [0.3, 0.5], life: [0.3, 0.5], speed: [4, 7], gravity: 8, additive: true });
      h.shake = Math.max(h.shake, 0.25);
      return false;
    }
    if (ev.type === "reach") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      streakLine(h, DUELIST.speed, ev.x, gy + 1.3, ev.z, ev.tx, ev.tz, 6, 0xe8f0ff, 2);
      streakLine(h, DUELIST.ribbon, ev.x, gy + 1.1, ev.z, ev.tx, ev.tz, 3, 0xffffff, 1.2, false);
      return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "start" && ev.kind === "dash") {
      emit(h, { tex: DUELIST.glint, n: 1, x: ev.x + ev.dirX * 0.6, y: gy + 1.6, z: ev.z + ev.dirZ * 0.6, size: [1.3, 1.3], grow: 1.3, life: [0.2, 0.2], speed: [0, 0], additive: true });
      streakLine(h, DUELIST.speed, ev.x, gy + 1.2, ev.z, ev.x + ev.dirX * 6, ev.z + ev.dirZ * 6, 6, 0xffffff, 1.8);
      emit(h, { tex: DUELIST.gust, n: 2, x: ev.x, y: gy + 0.6, z: ev.z, size: [1, 1.4], grow: 1.6, life: [0.4, 0.5], speed: [1, 2], dir: { x: -ev.dirX, y: 0.2, z: -ev.dirZ }, cone: 0.5, opacity: 0.8 });
      tumblers(h, [DUELIST.feather], 1, ev.x, gy + 2.2, ev.z, { speed: [0.4, 1], up: [1, 2], size: [0.4, 0.5], life: [1.4, 1.8] });
    }
    if (ev.phase === "start" && ev.kind === "parry") {
      emit(h, { tex: DUELIST.parryRing, n: 1, x: ev.x + ev.dirX * 0.6, y: gy + 1.3, z: ev.z + ev.dirZ * 0.6, size: [1.6, 1.6], grow: 1.15, life: [0.5, 0.5], speed: [0, 0], additive: true, opacity: 0.8 });
    }
    if (ev.phase === "start" && ev.kind === "flurry") {
      emit(h, { tex: DUELIST.gust, n: 4, x: ev.x, y: gy + 0.8, z: ev.z, size: [1.2, 1.6], grow: 1.7, life: [0.5, 0.7], speed: [1.5, 3], flatSpread: true, drag: 2, opacity: 0.8 });
      emit(h, { tex: DUELIST.fleur, n: 1, x: ev.x, y: gy + 3, z: ev.z, size: [1.1, 1.1], grow: 1.2, life: [0.7, 0.7], speed: [0, 0], up: [0.8, 0.8], fadeIn: 0.1 });
    }
  },
};

KITS.summoner = {
  trail: 0xd0a0ff,
  hit(h, ev, src, dx, dz) {
    const c = core(h, ev, dx, dz, SUMMONER.burst, FX.shock, 0xc080ff, SUMMONER.sparkle, 0xe0c0ff);
    emit(h, { tex: SUMMONER.smoke, n: ev.big ? 3 : 1, x: c.px, y: c.py, z: c.pz, size: [0.8, 1.1], grow: 1.6, life: [0.5, 0.7], speed: [0.5, 1.2], up: [0.5, 1], opacity: 0.8 });
    if (ev.big) emit(h, { tex: SUMMONER.bolt, n: 2, x: c.px, y: c.py, z: c.pz, size: [1, 1.4], life: [0.12, 0.2], speed: [0, 0], additive: true, jitter: 0.8 });
    void src;
    return true;
  },
  projectile(h, style) {
    if (style !== "magic" && style !== "orb") return null;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SUMMONER.orb, transparent: true, depthWrite: false }));
    s.scale.setScalar(style === "orb" ? 1.5 : 0.9);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: SUMMONER.sparkle, color: 0xc080ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(style === "orb" ? 2.6 : 1.6);
    s.add(glow);
    void h;
    return s;
  },
  projectileTick(h, obj, x, y, z, dt) {
    const s = obj as THREE.Sprite;
    s.material.rotation += dt * 6;
    (s.children[0] as THREE.Sprite).material.rotation -= dt * 3;
    if (Math.random() < 0.7) emit(h, { tex: SUMMONER.sparkle, n: 1, x, y, z, color: 0xd0a0ff, size: [0.25, 0.45], life: [0.25, 0.4], speed: [0.2, 0.6], additive: true, jitter: 0.3 });
    if (Math.random() < 0.3) emit(h, { tex: SUMMONER.smoke, n: 1, x, y, z, size: [0.4, 0.6], grow: 1.8, life: [0.35, 0.5], speed: [0, 0.3], opacity: 0.5 });
  },
  event(h, ev) {
    if (ev.type === "telegraph") {
      const r = ev.radius;
      const summon = ev.seconds < 0.6;
      decal(h, summon ? SUMMONER.circle : SUMMONER.hex, ev.x, ev.y, ev.z, r * 1.05, ev.seconds + 0.35, { grow: 0.18, spin: summon ? 1.5 : -2, additive: summon, color: summon ? 0xa0ffa0 : 0xffffff });
      emit(h, { tex: SUMMONER.flame, n: 6, x: ev.x, y: ev.y + 0.4, z: ev.z, size: [0.6, 0.9], life: [0.5, 0.9], speed: [0.2, 0.6], up: [1, 2], additive: true, jitter: r * 1.2, opacity: 0.8 });
      h.after(ev.seconds, () => {
        emit(h, { tex: SUMMONER.burst, n: 1, x: ev.x, y: ev.y + 1, z: ev.z, size: [r * 1.6, r * 1.6], grow: 1.3, life: [0.25, 0.25], speed: [0, 0] });
        shockwave(h, FX.shock, ev.x, ev.y + 0.2, ev.z, UP, 0.4, r * 1.2, 0.35, 0xc080ff);
        emit(h, { tex: SUMMONER.ghost, n: summon ? 3 : 2, x: ev.x, y: ev.y + 0.8, z: ev.z, size: [0.9, 1.2], life: [0.9, 1.3], speed: [0.3, 1], up: [1.5, 2.5], opacity: 0.85, jitter: r });
        emit(h, { tex: SUMMONER.smoke, n: 8, x: ev.x, y: ev.y + 0.5, z: ev.z, size: [1, 1.4], grow: 1.7, life: [0.6, 1], speed: [1, 2.5], flatSpread: true, drag: 2, opacity: 0.8 });
        if (summon) {
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const hx = ev.x + Math.cos(a) * r * 0.7;
            const hz = ev.z + Math.sin(a) * r * 0.7;
            const gy = ground(h, hx, hz, ev.y);
            const hand = new THREE.Sprite(new THREE.SpriteMaterial({ map: SUMMONER.graveHand, transparent: true, depthWrite: false }));
            hand.center.set(0.5, 0);
            h.add(hand, 1.1, (k) => {
              const up = k < 0.25 ? k / 0.25 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
              hand.scale.set(1.1, 1.1 * up, 1);
              hand.position.set(hx, gy - 0.1, hz);
            });
          }
          emit(h, { tex: SUMMONER.bones, n: 4, x: ev.x, y: ev.y + 0.4, z: ev.z, size: [0.4, 0.6], life: [0.6, 0.9], speed: [2, 4], up: [3, 5], gravity: 14, spin: 8, floor: ev.y + 0.05 });
        } else emit(h, { tex: SUMMONER.skull, n: 1, x: ev.x, y: ev.y + 1.5, z: ev.z, size: [1, 1], grow: 1.3, life: [0.7, 0.7], speed: [0, 0], up: [1, 1], fadeIn: 0.1 });
      });
      return true;
    }
    return false;
  },
};

KITS.engineer = {
  trail: 0xfff0b0,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.4)) return false;
    const c = core(h, ev, dx, dz, ENGINEER.clang, ENGINEER.ring, 0xa0f0ff, ENGINEER.weld);
    emit(h, { tex: ev.big ? ENGINEER.gear : ENGINEER.gearSmall, n: ev.big ? 3 : 1, x: c.px, y: c.py, z: c.pz, size: [0.35, 0.55], life: [0.6, 0.9], speed: [2, 4], up: [2, 4], gravity: 14, spin: 10, floor: c.gy + 0.1 });
    emit(h, { tex: ENGINEER.nut, n: ev.big ? 2 : 1, x: c.px, y: c.py, z: c.pz, size: [0.25, 0.35], life: [0.5, 0.8], speed: [2, 4], up: [2, 4], gravity: 16, spin: 12, floor: c.gy + 0.08 });
    if (ev.big) emit(h, { tex: ENGINEER.steam, n: 2, x: c.px, y: c.py, z: c.pz, size: [0.9, 1.2], grow: 1.7, life: [0.5, 0.8], speed: [0.5, 1.2], up: [0.8, 1.5], opacity: 0.8 });
    return true;
  },
  event(h, ev) {
    if (ev.type === "repair") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      decal(h, ENGINEER.gear, ev.x, gy, ev.z, 2.2, 1.2, { grow: 0.2, spin: 2.5, opacity: 0.95 });
      shockwave(h, ENGINEER.ring, ev.x, gy + 0.2, ev.z, UP, 0.5, ev.radius, 0.45, 0xa0e0ff, 0.8);
      for (const f of ev.fixed) {
        emit(h, { tex: ENGINEER.weld, n: 3, x: f.x, y: f.y + f.h * 0.6, z: f.z, size: [0.8, 1.2], life: [0.2, 0.3], speed: [0, 0], additive: true, jitter: 1.4 });
        emit(h, { tex: ENGINEER.steam, n: 3, x: f.x, y: f.y + f.h * 0.5, z: f.z, size: [1, 1.4], grow: 1.6, life: [0.7, 1], speed: [0.3, 0.8], up: [1, 1.8], opacity: 0.8, jitter: 1.2 });
        emit(h, { tex: ENGINEER.heal, n: 1, x: f.x, y: f.y + f.h + 0.5, z: f.z, size: [0.9, 0.9], grow: 1.2, life: [0.8, 0.8], speed: [0, 0], up: [1, 1], fadeIn: 0.1 });
      }
      return false;
    }
    if (ev.type === "slam") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, { tex: ENGINEER.clang, n: 1, x: ev.x, y: gy + 0.6, z: ev.z, size: [2, 2], grow: 1.3, life: [0.18, 0.18], speed: [0, 0] });
      shockwave(h, ENGINEER.ring, ev.x, gy + 0.2, ev.z, UP, 0.4, ev.radius * 1.1, 0.35, 0xffffff);
      emit(h, { tex: ENGINEER.gear, n: 4, x: ev.x, y: gy + 0.5, z: ev.z, size: [0.35, 0.55], life: [0.7, 1], speed: [2, 4], up: [3, 5], gravity: 14, spin: 10, floor: gy + 0.1 });
      emit(h, { tex: ENGINEER.oilSmoke, n: 5, x: ev.x, y: gy + 0.5, z: ev.z, size: [1, 1.4], grow: 1.7, life: [0.6, 0.9], speed: [1, 2.5], flatSpread: true, drag: 2, opacity: 0.8 });
      h.shake = Math.max(h.shake, 0.3);
      return true;
    }
    return false;
  },
  act(h, ev) {
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.phase === "fire" && (ev.kind === "works" || ev.kind === "ballista")) {
      emit(h, { tex: ENGINEER.steam, n: 8, x: ev.x + ev.dirX * 2, y: gy + 0.6, z: ev.z + ev.dirZ * 2, size: [1, 1.5], grow: 1.8, life: [0.7, 1.1], speed: [1, 2.5], flatSpread: true, up: [0.5, 1.2], drag: 2, opacity: 0.85, jitter: 2 });
      emit(h, { tex: ENGINEER.weld, n: 6, x: ev.x + ev.dirX * 2, y: gy + 0.8, z: ev.z + ev.dirZ * 2, size: [0.7, 1], life: [0.15, 0.3], speed: [0, 0], additive: true, jitter: 2.5 });
      emit(h, { tex: ENGINEER.plank, n: 3, x: ev.x + ev.dirX * 2, y: gy + 0.6, z: ev.z + ev.dirZ * 2, size: [0.5, 0.7], life: [0.6, 0.9], speed: [1.5, 3], up: [3, 5], gravity: 14, spin: 8, floor: gy + 0.1 });
      emit(h, { tex: ENGINEER.spring, n: 1, x: ev.x, y: gy + 2.6, z: ev.z, size: [0.7, 0.7], grow: 1.2, life: [0.6, 0.6], speed: [0, 0], up: [1, 1], fadeIn: 0.1 });
      h.shake = Math.max(h.shake, 0.2);
    }
  },
};

KITS.herald = {
  trail: 0xfff0a0,
  hit(h, ev, src, dx, dz) {
    if (near(ev, src, 3)) {
      core(h, ev, dx, dz, HERALD.star, FX.shock, 0xffe8a0, HERALD.star);
      return true;
    }
    emit(h, { tex: HERALD.star, n: 1, x: ev.x, y: ev.y + 0.3, z: ev.z, size: [0.9, 0.9], grow: 1.4, life: [0.16, 0.16], speed: [0, 0], additive: true });
    emit(h, { tex: FX.twinkle, n: 3, x: ev.x, y: ev.y + 0.3, z: ev.z, size: [0.25, 0.4], life: [0.2, 0.3], speed: [3, 5], gravity: 10, additive: true });
    return true;
  },
  event(h, ev) {
    if (ev.type === "warcry") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, { tex: HERALD.horn, n: 1, x: ev.x, y: gy + 3.4, z: ev.z, size: [1.4, 1.4], grow: 1.2, life: [0.8, 0.8], speed: [0, 0], up: [0.7, 0.7], fadeIn: 0.1, order: 7 });
      for (let k = 0; k < 3; k++) h.after(k * 0.14, () => decal(h, HERALD.halo, ev.x, gy + 0.02 * k, ev.z, ev.radius, 0.6, { grow: 0.5, additive: true, color: 0xffe080, opacity: 0.85 }));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        emit(h, { tex: HERALD.blast, n: 1, x: ev.x, y: gy + 1.6, z: ev.z, size: [1, 1], grow: 2.2, life: [0.5, 0.5], speed: [ev.radius * 0.9, ev.radius * 0.9], dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, cone: 0.01, additive: true });
      }
      return true;
    }
    if (ev.type === "banner") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      emit(h, { tex: HERALD.beams, n: 1, x: ev.x, y: gy + 2, z: ev.z, size: [3.4, 3.4], grow: 1.3, life: [0.4, 0.4], speed: [0, 0], additive: true });
      decal(h, HERALD.laurel, ev.x, gy, ev.z, 2.4, 1.4, { grow: 0.2 });
      emit(h, { tex: HERALD.dust, n: 8, x: ev.x, y: gy + 0.3, z: ev.z, size: [0.9, 1.3], grow: 1.8, life: [0.5, 0.8], speed: [1.5, 3], flatSpread: true, drag: 3, opacity: 0.85 });
      h.shake = Math.max(h.shake, 0.15);
      return true;
    }
    if (ev.type === "rally") {
      const gy = ground(h, ev.x, ev.z, ev.y);
      decal(h, HERALD.laurel, ev.x, gy, ev.z, ev.radius, 1.6, { grow: 0.3, additive: true, color: 0xfff0a0 });
      decal(h, HERALD.halo, ev.x, gy + 0.02, ev.z, ev.radius * 0.6, 1.2, { grow: 0.2, spin: 1, additive: true });
      emit(h, { tex: HERALD.rays, n: 1, x: ev.x, y: gy + 2.4, z: ev.z, size: [5, 5], grow: 1.3, life: [0.6, 0.6], speed: [0, 0], additive: true });
      emit(h, { tex: HERALD.heal, n: 12, x: ev.x, y: gy + 0.6, z: ev.z, size: [0.5, 0.7], life: [1, 1.4], speed: [0.3, 1], up: [1.5, 2.5], jitter: ev.radius * 1.2 });
      emit(h, { tex: HERALD.shield, n: 1, x: ev.x, y: gy + 3.6, z: ev.z, size: [1.4, 1.4], grow: 1.2, life: [0.9, 0.9], speed: [0, 0], up: [0.6, 0.6], fadeIn: 0.1 });
      return true;
    }
    return false;
  },
};
