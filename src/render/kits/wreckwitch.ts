// Mother Kelp (wreckwitch) kit: brine-splash hits, the anchor whirl, Dredge (a flying anchor on a chain of links,
// whirlpools where the two swap), Bilge (spit stream, gas cloud, no-heal marks over victims), Davy's Grip (HQ ring
// of drowned hands, real drowned-hand props bursting up round the ring and under every victim), the chain swing
// and the Tide Rising wave. The bilge zone decal is drawn by hazards/zones.ts ("bilge" style).
import * as THREE from "three";
import { FX, WITCH } from "../fx/atlas";
import { type FxHost, emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { shockwave } from "../fx/shockwave";
import { prop } from "../props";
import { core, ground, near, UP } from "./shared";
import { KITS } from "./registry";

const SEA = 0x4fc0a8;
const HAND_Y = 1.35;

function splash(h: FxHost, x: number, gy: number, z: number, r: number, n = 1): void {
  emit(h, {
    tex: WITCH.brine,
    n,
    x,
    y: gy + 0.5,
    z,
    size: [r * 1.2, r * 1.4],
    grow: 1.4,
    life: [0.3, 0.4],
    speed: [0, 0.3],
    order: 5,
  });
  emit(h, {
    tex: WITCH.drop,
    n: Math.round(6 + r * 4),
    x,
    y: gy + 0.6,
    z,
    size: [0.14, 0.26],
    life: [0.5, 0.8],
    speed: [1.5, 2 + r * 1.5],
    up: [2.5, 5],
    gravity: 14,
    floor: gy + 0.05,
  });
  emit(h, {
    tex: WITCH.bubble,
    n: 3,
    x,
    y: gy + 0.4,
    z,
    size: [0.15, 0.28],
    life: [0.5, 0.9],
    speed: [0.2, 0.6],
    up: [0.6, 1.2],
    jitter: r,
  });
}

/** A billboard that follows (x, y, z) from `at()` for `dur` seconds. */
function follow(
  h: FxHost,
  tex: THREE.Texture,
  size: number,
  dur: number,
  at: () => THREE.Vector3 | null,
  fade = 0.25,
): void {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.setScalar(size);
  s.renderOrder = 6;
  h.add(s, dur, (k) => {
    const p = at();
    if (!p) {
      s.visible = false;
      return;
    }
    s.position.copy(p);
    const left = (1 - k) * dur;
    s.material.opacity = Math.min(1, k * dur * 6, left / fade);
    s.position.y += Math.sin(k * dur * 6) * 0.06;
  });
}

/** One drowned hand bursting up out of the ground at (x, z), holding for `hold` seconds then sinking back. */
function drownedHand(h: FxHost, x: number, gy: number, z: number, scale: number, hold: number, yaw: number): void {
  const o = prop("drownedhand");
  const g = new THREE.Group();
  if (o) g.add(o);
  else {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: WITCH.hand, transparent: true, depthWrite: false }));
    s.scale.set(1, 1.3, 1);
    s.position.y = 0.6;
    g.add(s);
  }
  g.position.set(x, gy, z);
  g.rotation.y = yaw;
  const rise = 0.14;
  const dur = rise + hold + 0.35;
  h.add(g, dur, (k) => {
    const t = k * dur;
    const up = t < rise ? t / rise : t < rise + hold ? 1 : Math.max(0, 1 - (t - rise - hold) / 0.35);
    const pop = t < rise ? 1 + (1 - t / rise) * 0.3 : 1 + Math.sin(Math.min(1, (t - rise) / 0.2) * Math.PI) * 0.12;
    g.scale.set(scale * pop, scale * Math.max(0.02, up), scale * pop);
    g.position.y = gy - (1 - up) * 0.4 * scale;
    g.rotation.z = Math.sin(t * 9 + x) * 0.06 * up;
  });
  emit(h, {
    tex: WITCH.drop,
    n: 5,
    x,
    y: gy + 0.3,
    z,
    size: [0.12, 0.22],
    life: [0.4, 0.7],
    speed: [1, 2.5],
    up: [2, 4],
    gravity: 14,
    floor: gy + 0.05,
  });
}

/** Chain of link sprites from `a()` to `b()` (both re-read every frame) for `dur` seconds. */
function chain(h: FxHost, dur: number, a: () => THREE.Vector3 | null, b: () => THREE.Vector3 | null): void {
  const g = new THREE.Group();
  const links: THREE.Sprite[] = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: WITCH.link, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.42);
    s.visible = false;
    g.add(s);
    links.push(s);
  }
  h.add(g, dur, () => {
    const p = a();
    const q = b();
    if (!p || !q) {
      g.visible = false;
      return;
    }
    const len = p.distanceTo(q);
    const n = Math.min(links.length, Math.max(2, Math.round(len / 0.32)));
    const sag = Math.min(0.6, len * 0.05);
    const rot = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
    for (let i = 0; i < links.length; i++) {
      const s = links[i];
      s.visible = i < n;
      if (!s.visible) continue;
      const f = (i + 0.5) / n;
      s.position.lerpVectors(p, q, f);
      s.position.y -= Math.sin(f * Math.PI) * sag;
      s.material.rotation = rot + (i % 2 ? Math.PI / 2 : 0) * 0.5;
    }
  });
}

/** The thrown anchor (runtime prop, flies upright and tumbles a little). */
function anchorObj(): THREE.Object3D {
  const o = prop("wreckanchor");
  if (o) {
    const g = new THREE.Group();
    o.position.y = -0.55;
    g.add(o);
    return g;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: WITCH.link, transparent: true, depthWrite: false }));
  s.scale.setScalar(0.9);
  return s;
}

function heroPos(h: FxHost, id: number, lift = HAND_Y): THREE.Vector3 | null {
  const e = h.world?.getAny(id);
  if (!e || !e.alive) return null;
  const t = e.transform;
  return new THREE.Vector3(t.pos.x + Math.sin(t.facing) * 0.45, t.y + lift, t.pos.z + Math.cos(t.facing) * 0.45);
}

function dredge(
  h: FxHost,
  src: number,
  x: number,
  y: number,
  z: number,
  tx: number,
  tz: number,
  sec: number,
  hit: boolean,
  target?: number,
): void {
  const from = new THREE.Vector3(x, y + HAND_Y, z);
  const gy = ground(h, tx, tz, y);
  const to = new THREE.Vector3(tx, gy + 1.1, tz);
  const anchor = anchorObj();
  const back = hit ? 0.12 : Math.max(0.18, sec * 0.8);
  const dur = sec + back;
  const pos = new THREE.Vector3();
  const yaw = Math.atan2(tx - x, tz - z);
  h.add(anchor, dur, (k) => {
    const t = k * dur;
    const hand = heroPos(h, src) ?? from;
    if (t <= sec) {
      const f = t / sec;
      const tgt = hit && target !== undefined ? (heroPos(h, target, 1.1) ?? to) : to;
      pos.lerpVectors(hand, tgt, f);
      pos.y += Math.sin(f * Math.PI) * 0.5;
    } else {
      const f = (t - sec) / back;
      pos.lerpVectors(to, hand, f);
      pos.y += Math.sin(f * Math.PI) * 0.3;
    }
    anchor.position.copy(pos);
    anchor.rotation.set(-1.2, yaw, 0);
    anchor.rotateZ(t * 14);
  });
  chain(
    h,
    dur,
    () => heroPos(h, src) ?? from,
    () => anchor.position.clone(),
  );
  emit(h, {
    tex: WITCH.swoosh,
    n: 1,
    x,
    y: y + HAND_Y,
    z,
    size: [1.4, 1.4],
    grow: 1.3,
    life: [0.18, 0.18],
    speed: [0, 0],
    opacity: 0.85,
  });
  if (!hit)
    h.after(sec, () => {
      splash(h, tx, gy, tz, 1);
      emit(h, {
        tex: FX.dust,
        n: 3,
        x: tx,
        y: gy + 0.3,
        z: tz,
        size: [0.7, 1],
        grow: 1.6,
        life: [0.4, 0.6],
        speed: [1, 2],
        flatSpread: true,
        drag: 3,
        opacity: 0.8,
      });
    });
}

function swirl(h: FxHost, x: number, gy: number, z: number, r: number): void {
  decal(h, WITCH.whirlpool, x, gy + 0.03, z, r, 0.9, { grow: 0.2, spin: -6, opacity: 0.9 });
  splash(h, x, gy, z, r * 0.8);
  shockwave(h, FX.shock, x, gy + 0.2, z, UP, 0.3, r * 1.3, 0.35, 0xb0fff0, 0.8);
}

KITS.wreckwitch = {
  trail: SEA,
  hit(h, ev, src, dx, dz) {
    if (!near(ev, src, 3.8)) return false;
    const { n, px, py, pz, gy } = core(h, ev, dx, dz, WITCH.brine, FX.shock, 0xc0fff0, WITCH.drop);
    emit(h, {
      tex: WITCH.drop,
      n: ev.big ? 8 : 4,
      x: px,
      y: py + 0.2,
      z: pz,
      size: [0.14, 0.24],
      life: [0.45, 0.7],
      speed: [2, 4],
      up: [1.5, 3],
      dir: { x: n.x, y: 0.3, z: n.z },
      cone: 1,
      gravity: 14,
      floor: gy + 0.05,
    });
    if (ev.big && Math.random() < 0.6)
      emit(h, {
        tex: Math.random() < 0.5 ? WITCH.kelp : WITCH.shell,
        n: 1,
        x: px,
        y: py,
        z: pz,
        size: [0.35, 0.5],
        life: [0.6, 0.9],
        speed: [2, 4],
        up: [2, 4],
        gravity: 12,
        spin: 8,
        floor: gy + 0.05,
      });
    return true;
  },
  event(h, ev) {
    if (ev.type !== "heroFx") return false;
    const gy = ground(h, ev.x, ev.z, ev.y);
    switch (ev.name) {
      case "whirl": {
        const r = ev.radius ?? 2.9;
        const ring = new THREE.Mesh(
          new THREE.PlaneGeometry(r * 2.2, r * 2.2),
          new THREE.MeshBasicMaterial({
            map: WITCH.swoosh,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(ev.x, gy + 0.9, ev.z);
        h.add(ring, 0.32, (k) => {
          ring.rotation.z = -k * Math.PI * 2.2;
          (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
          const s = 0.85 + k * 0.25;
          ring.scale.set(s, s, s);
        });
        emit(h, {
          tex: WITCH.drop,
          n: 8,
          x: ev.x,
          y: gy + 0.9,
          z: ev.z,
          size: [0.12, 0.22],
          life: [0.4, 0.6],
          speed: [4, 6],
          up: [1, 2],
          flatSpread: true,
          gravity: 10,
          floor: gy + 0.05,
        });
        return true;
      }
      case "dredge":
      case "dredgeMiss":
        dredge(
          h,
          ev.src,
          ev.x,
          ev.y,
          ev.z,
          ev.tx ?? ev.x,
          ev.tz ?? ev.z,
          ev.seconds ?? 0.2,
          ev.name === "dredge",
          ev.id,
        );
        return true;
      case "dredgeSwap": {
        const tx = ev.tx ?? ev.x;
        const tz = ev.tz ?? ev.z;
        swirl(h, ev.x, gy, ev.z, 1.6);
        swirl(h, tx, ground(h, tx, tz, ev.y), tz, 1.6);
        h.shake = Math.max(h.shake, 0.25);
        return true;
      }
      case "bilge": {
        const r = ev.radius ?? 3;
        const sx = ev.tx ?? ev.x;
        const sz = ev.tz ?? ev.z;
        const sy = ground(h, sx, sz, ev.y) + 1.6;
        const dx = ev.x - sx;
        const dz = ev.z - sz;
        const len = Math.hypot(dx, dz) || 1;
        for (let k = 0; k < 5; k++)
          h.after(k * 0.03, () =>
            emit(h, {
              tex: WITCH.spit,
              n: 1,
              x: sx + (dx / len) * (0.6 + k * 0.5),
              y: sy - k * 0.12,
              z: sz + (dz / len) * (0.6 + k * 0.5),
              size: [0.9, 1.2],
              grow: 1.4,
              life: [0.22, 0.3],
              speed: [len * 1.2, len * 1.6],
              dir: { x: dx / len, y: -0.25, z: dz / len },
              cone: 0.15,
            }),
          );
        h.after(0.12, () => {
          emit(h, {
            tex: WITCH.cloud,
            n: 1,
            x: ev.x,
            y: gy + 1,
            z: ev.z,
            size: [r * 1.8, r * 1.8],
            grow: 1.3,
            life: [0.7, 0.7],
            speed: [0, 0],
            opacity: 0.9,
            order: 4,
          });
          emit(h, {
            tex: WITCH.cloud,
            n: Math.round(r * 3),
            x: ev.x,
            y: gy + 0.8,
            z: ev.z,
            size: [1.2, 1.9],
            grow: 1.6,
            life: [0.9, 1.4],
            speed: [1, r * 0.9],
            up: [0.2, 0.6],
            flatSpread: true,
            drag: 1.5,
            opacity: 0.8,
          });
          splash(h, ev.x, gy, ev.z, r * 0.5, 1);
          const w = h.world;
          if (!w) return;
          for (const o of w.entities) {
            if (!o.alive || o.team === ev.team || o.structure || !o.hero) continue;
            if (Math.hypot(o.transform.pos.x - ev.x, o.transform.pos.z - ev.z) > r + o.radius) continue;
            follow(h, WITCH.noHeal, 0.7, ev.seconds ?? 3, () => {
              const e = w.getAny(o.id);
              if (!e?.alive || w.time >= (e.status.noHealUntil ?? 0)) return null;
              return new THREE.Vector3(e.transform.pos.x, e.transform.y + 2.7, e.transform.pos.z);
            });
          }
        });
        return true;
      }
      case "davygrip": {
        const r = ev.radius ?? 6;
        const hold = ev.seconds ?? 1.5;
        const stacks = ev.id ?? 0;
        decal(h, WITCH.gripRing, ev.x, gy + 0.04, ev.z, r, hold + 0.6, { grow: 0.15, spin: 0.6, opacity: 0.95 });
        decal(h, WITCH.whirlpool, ev.x, gy + 0.05, ev.z, r * 0.45, hold + 0.4, { grow: 0.3, spin: -3, opacity: 0.8 });
        shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.5, r, 0.5, 0xa0ffe8, 0.9);
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
          const d = r * (0.72 + Math.random() * 0.22);
          const x = ev.x + Math.cos(a) * d;
          const z = ev.z + Math.sin(a) * d;
          h.after(i * 0.025, () =>
            drownedHand(h, x, ground(h, x, z, gy), z, 0.75 + Math.random() * 0.25, hold, -a + Math.PI / 2),
          );
        }
        emit(h, {
          tex: WITCH.wave,
          n: Math.min(12, 4 + stacks),
          x: ev.x,
          y: gy + 0.6,
          z: ev.z,
          size: [0.9, 1.4],
          grow: 1.3,
          life: [0.5, 0.8],
          speed: [r * 0.8, r * 1.3],
          flatSpread: true,
          drag: 2,
        });
        splash(h, ev.x, gy, ev.z, 2, 2);
        h.shake = Math.max(h.shake, 0.45 + stacks * 0.02);
        return true;
      }
      case "grab": {
        const hold = ev.seconds ?? 1.5;
        drownedHand(h, ev.x + 0.25, gy, ev.z - 0.15, 0.6, hold, Math.random() * 6);
        drownedHand(h, ev.x - 0.3, gy, ev.z + 0.2, 0.5, hold, Math.random() * 6);
        decal(h, WITCH.whirlpool, ev.x, gy + 0.06, ev.z, 0.9, hold + 0.3, { spin: -4, opacity: 0.85 });
        return true;
      }
      case "chainSwing": {
        const px = ev.tx ?? ev.x;
        const pz = ev.tz ?? ev.z;
        const pg = ground(h, px, pz, ev.y);
        const pivot = new THREE.Vector3(px, pg + 1.2, pz);
        const anchor = anchorObj();
        anchor.position.copy(pivot);
        h.add(anchor, ev.seconds ?? 0.5, (k) => {
          anchor.rotation.set(0, k * 6, 0.4);
        });
        chain(
          h,
          ev.seconds ?? 0.5,
          () => heroPos(h, ev.src, HAND_Y + 0.4),
          () => pivot,
        );
        emit(h, {
          tex: WITCH.link,
          n: 3,
          x: px,
          y: pg + 1.2,
          z: pz,
          size: [0.25, 0.35],
          life: [0.3, 0.5],
          speed: [2, 3],
          up: [1, 2],
          gravity: 10,
        });
        return true;
      }
      case "tide": {
        const n = ev.radius ?? 0;
        if (n <= 0) return true;
        const w = h.world;
        follow(h, WITCH.wave, 0.45 + n * 0.035, 0.7, () => {
          const e = w?.getAny(ev.src);
          return e?.alive
            ? new THREE.Vector3(e.transform.pos.x, e.transform.y + 2.9 + n * 0.04, e.transform.pos.z)
            : null;
        });
        if (n >= 5)
          emit(h, {
            tex: WITCH.drop,
            n: Math.round(n / 2),
            x: ev.x,
            y: gy + 1.8,
            z: ev.z,
            size: [0.1, 0.18],
            life: [0.4, 0.6],
            speed: [0.3, 0.8],
            gravity: 8,
            jitter: 0.8,
            floor: gy + 0.05,
          });
        return true;
      }
    }
    return false;
  },
  act(h, ev) {
    if (ev.phase !== "start") return;
    const gy = ground(h, ev.x, ev.z, ev.y);
    if (ev.kind === "davygrip") {
      emit(h, {
        tex: WITCH.bubble,
        n: 14,
        x: ev.x,
        y: gy + 0.2,
        z: ev.z,
        size: [0.2, 0.35],
        life: [0.4, 0.6],
        speed: [0.2, 0.5],
        up: [1, 2],
        jitter: 8,
      });
    } else if (ev.kind === "bilge") {
      emit(h, {
        tex: WITCH.bubble,
        n: 4,
        x: ev.x,
        y: gy + 1.9,
        z: ev.z,
        size: [0.15, 0.25],
        life: [0.3, 0.5],
        speed: [0.3, 0.6],
        up: [0.5, 1],
      });
    }
  },
};
