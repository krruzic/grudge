// Remnil (summoner) kit: hex hits, magic orb projectiles with trails, telegraphed curses, the hex idol prop and
// Gravewalk (summoning circle at the start, tombs rising at the destination; costume props for Shadow Play).
import * as THREE from "three";
import { costumeOfPlayer } from "../costumes";
import { SUMMONER, FX, tint } from "../fx/atlas";
import { emit } from "../fx/parts";
import { decal } from "../fx/decals";
import { shockwave } from "../fx/shockwave";
import { prop } from "../props";
import { KITS } from "./registry";
import { core, UP, ground } from "./shared";

KITS.summoner = {
  trail: 0xd0a0ff,
  hit(h, ev, src, dx, dz) {
    const c = core(h, ev, dx, dz, SUMMONER.burst, FX.shock, 0xc080ff, SUMMONER.sparkle, 0xe0c0ff);
    emit(h, {
      tex: SUMMONER.smoke,
      n: ev.big ? 3 : 1,
      x: c.px,
      y: c.py,
      z: c.pz,
      size: [0.8, 1.1],
      grow: 1.6,
      life: [0.5, 0.7],
      speed: [0.5, 1.2],
      up: [0.5, 1],
      opacity: 0.8,
    });
    if (ev.big)
      emit(h, {
        tex: SUMMONER.bolt,
        n: 2,
        x: c.px,
        y: c.py,
        z: c.pz,
        size: [1, 1.4],
        life: [0.12, 0.2],
        speed: [0, 0],
        additive: true,
        jitter: 0.8,
      });
    void src;
    return true;
  },
  projectile(h, style) {
    if (style !== "magic" && style !== "orb") return null;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SUMMONER.orb, transparent: true, depthWrite: false }));
    s.scale.setScalar(style === "orb" ? 1.5 : 0.9);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: SUMMONER.sparkle,
        color: tint(0xc080ff),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.scale.setScalar(style === "orb" ? 2.6 : 1.6);
    s.add(glow);
    void h;
    return s;
  },
  projectileTick(h, obj, x, y, z, dt) {
    const s = obj as THREE.Sprite;
    s.material.rotation += dt * 6;
    (s.children[0] as THREE.Sprite).material.rotation -= dt * 3;
    if (Math.random() < 0.7)
      emit(h, {
        tex: SUMMONER.sparkle,
        n: 1,
        x,
        y,
        z,
        color: 0xd0a0ff,
        size: [0.25, 0.45],
        life: [0.25, 0.4],
        speed: [0.2, 0.6],
        additive: true,
        jitter: 0.3,
      });
    if (Math.random() < 0.3)
      emit(h, {
        tex: SUMMONER.smoke,
        n: 1,
        x,
        y,
        z,
        size: [0.4, 0.6],
        grow: 1.8,
        life: [0.35, 0.5],
        speed: [0, 0.3],
        opacity: 0.5,
      });
  },
  event(h, ev, src) {
    if (ev.type === "telegraph") {
      const r = ev.radius;
      const summon = ev.seconds < 0.6;
      const owner = { hero: "summoner", costume: costumeOfPlayer(src.hero?.player) };
      decal(h, summon ? SUMMONER.circle : SUMMONER.hex, ev.x, ev.y, ev.z, r * 1.05, ev.seconds + 0.35, {
        grow: 0.18,
        spin: summon ? 1.5 : -2,
        additive: summon,
        color: summon ? 0xa0ffa0 : 0xffffff,
      });
      emit(h, {
        tex: SUMMONER.flame,
        n: 6,
        x: ev.x,
        y: ev.y + 0.4,
        z: ev.z,
        size: [0.6, 0.9],
        life: [0.5, 0.9],
        speed: [0.2, 0.6],
        up: [1, 2],
        additive: true,
        jitter: r * 1.2,
        opacity: 0.8,
      });
      h.after(ev.seconds, () => {
        emit(h, {
          tex: SUMMONER.burst,
          n: 1,
          x: ev.x,
          y: ev.y + 1,
          z: ev.z,
          size: [r * 1.6, r * 1.6],
          grow: 1.3,
          life: [0.25, 0.25],
          speed: [0, 0],
        });
        shockwave(h, FX.shock, ev.x, ev.y + 0.2, ev.z, UP, 0.4, r * 1.2, 0.35, 0xc080ff);
        emit(h, {
          tex: SUMMONER.ghost,
          n: summon ? 3 : 2,
          x: ev.x,
          y: ev.y + 0.8,
          z: ev.z,
          size: [0.9, 1.2],
          life: [0.9, 1.3],
          speed: [0.3, 1],
          up: [1.5, 2.5],
          opacity: 0.85,
          jitter: r,
        });
        emit(h, {
          tex: SUMMONER.smoke,
          n: 8,
          x: ev.x,
          y: ev.y + 0.5,
          z: ev.z,
          size: [1, 1.4],
          grow: 1.7,
          life: [0.6, 1],
          speed: [1, 2.5],
          flatSpread: true,
          drag: 2,
          opacity: 0.8,
        });
        if (summon) {
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            const hx = ev.x + Math.cos(a) * r * 0.7;
            const hz = ev.z + Math.sin(a) * r * 0.7;
            const gy = ground(h, hx, hz, ev.y);
            const hand = new THREE.Sprite(
              new THREE.SpriteMaterial({ map: SUMMONER.graveHand, transparent: true, depthWrite: false }),
            );
            hand.center.set(0.5, 0);
            h.add(hand, 1.1, (k) => {
              const up = k < 0.25 ? k / 0.25 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
              hand.scale.set(1.1, 1.1 * up, 1);
              hand.position.set(hx, gy - 0.1, hz);
            });
          }
          emit(h, {
            tex: SUMMONER.bones,
            n: 4,
            x: ev.x,
            y: ev.y + 0.4,
            z: ev.z,
            size: [0.4, 0.6],
            life: [0.6, 0.9],
            speed: [2, 4],
            up: [3, 5],
            gravity: 14,
            spin: 8,
            floor: ev.y + 0.05,
          });
        } else {
          emit(h, {
            tex: SUMMONER.skull,
            n: 1,
            x: ev.x,
            y: ev.y + 1.5,
            z: ev.z,
            size: [1, 1],
            grow: 1.3,
            life: [0.7, 0.7],
            speed: [0, 0],
            up: [1, 1],
            fadeIn: 0.1,
          });
          const idol = prop("hexidol", undefined, owner);
          if (idol) {
            const gy = ground(h, ev.x, ev.z, ev.y);
            const yaw = Math.random() * Math.PI * 2;
            const s = Math.min(1.9, 1.1 + r * 0.2);
            idol.scale.setScalar(s);
            h.add(idol, 1.7, (k) => {
              const rise = k < 0.08 ? k / 0.08 : 1;
              const sink = k > 0.78 ? (k - 0.78) / 0.22 : 0;
              const over = k < 0.08 ? 0 : Math.max(0, 0.18 - (k - 0.08) * 1.2) * Math.sin((k - 0.08) * 40);
              idol.position.set(ev.x, gy - 2.2 * s * (1 - rise) - 2.4 * s * sink * sink, ev.z);
              idol.rotation.set(over * 0.6, yaw + (1 - rise) * 1.2, over * 0.4);
            });
          }
        }
      });
      return true;
    }
    return false;
  },
  act(h, ev, src) {
    if (ev.kind !== "gravewalk" || ev.toX === undefined || ev.toZ === undefined) return;
    const owner = { hero: "summoner", costume: costumeOfPlayer(src.hero?.player) };
    const gy = ground(h, ev.x, ev.z, ev.y);
    const tx = ev.toX;
    const tz = ev.toZ;
    const ty = ground(h, tx, tz, ev.y);
    if (ev.phase === "start") {
      decal(h, SUMMONER.circle, ev.x, gy, ev.z, 2.2, 1.2, { grow: 0.1, spin: 2.2, additive: true, color: 0xb070ff });
      decal(h, SUMMONER.hex, tx, ty, tz, 2.4, 1.3, { grow: 0.15, spin: -1.6, color: 0xffffff, opacity: 0.85 });
      emit(h, {
        tex: SUMMONER.soulFlame,
        n: 6,
        x: tx,
        y: ty + 0.4,
        z: tz,
        size: [0.5, 0.8],
        life: [0.6, 1.0],
        speed: [0.2, 0.5],
        up: [1, 2],
        additive: true,
        jitter: 1.8,
        opacity: 0.85,
      });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const hx = ev.x + Math.cos(a) * 1.5;
        const hz = ev.z + Math.sin(a) * 1.5;
        const hy = ground(h, hx, hz, ev.y);
        const hand = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: SUMMONER.graveHand, transparent: true, depthWrite: false }),
        );
        hand.center.set(0.5, 0);
        h.add(hand, 1.2, (k) => {
          const up = k < 0.3 ? k / 0.3 : k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
          hand.scale.set(1, 1.1 * up, 1);
          hand.position.set(hx, hy - 0.1, hz);
        });
      }
      for (let k = 0; k < 5; k++)
        h.after(k * 0.18, () =>
          emit(h, {
            tex: SUMMONER.ghost,
            n: 2,
            x: ev.x,
            y: gy + 0.5,
            z: ev.z,
            size: [0.7, 1.0],
            life: [0.7, 1.0],
            speed: [0.6, 1.4],
            up: [1.5, 2.6],
            additive: true,
            color: 0xd0a0ff,
            opacity: 0.8,
            jitter: 1.4,
          }),
        );
      return;
    }
    if (ev.phase !== "fire") return;
    emit(h, {
      tex: SUMMONER.burst,
      n: 1,
      x: ev.x,
      y: gy + 1,
      z: ev.z,
      size: [3, 3],
      grow: 1.3,
      life: [0.25, 0.25],
      speed: [0, 0],
    });
    emit(h, {
      tex: SUMMONER.smoke,
      n: 10,
      x: ev.x,
      y: gy + 0.6,
      z: ev.z,
      size: [1.1, 1.5],
      grow: 1.7,
      life: [0.7, 1.1],
      speed: [1, 2.5],
      flatSpread: true,
      drag: 2,
      opacity: 0.85,
    });
    emit(h, {
      tex: SUMMONER.ghost,
      n: 6,
      x: ev.x,
      y: gy + 1,
      z: ev.z,
      size: [0.9, 1.3],
      life: [0.9, 1.3],
      speed: [0.5, 1.5],
      up: [2.5, 4],
      opacity: 0.85,
      jitter: 1,
    });
    shockwave(h, FX.shock, ev.x, gy + 0.2, ev.z, UP, 0.4, 2.6, 0.35, 0xc080ff);
    emit(h, {
      tex: SUMMONER.burst,
      n: 1,
      x: tx,
      y: ty + 1,
      z: tz,
      size: [3.4, 3.4],
      grow: 1.3,
      life: [0.3, 0.3],
      speed: [0, 0],
    });
    shockwave(h, FX.shock, tx, ty + 0.2, tz, UP, 0.45, 3.4, 0.4, 0xc080ff);
    decal(h, SUMMONER.circle, tx, ty, tz, 3, 1.6, { grow: 0.25, spin: 1.5, additive: true, color: 0xa0ffa0 });
    emit(h, {
      tex: SUMMONER.ghost,
      n: 8,
      x: tx,
      y: ty + 0.8,
      z: tz,
      size: [0.9, 1.3],
      life: [1, 1.5],
      speed: [1, 2.5],
      up: [1.5, 3],
      additive: true,
      color: 0xd8b0ff,
      opacity: 0.9,
      jitter: 1.5,
    });
    emit(h, {
      tex: SUMMONER.bones,
      n: 6,
      x: tx,
      y: ty + 0.4,
      z: tz,
      size: [0.4, 0.6],
      life: [0.6, 0.9],
      speed: [2, 4],
      up: [3, 5],
      gravity: 14,
      spin: 8,
      floor: ty + 0.05,
    });
    emit(h, {
      tex: SUMMONER.skull,
      n: 1,
      x: tx,
      y: ty + 2.4,
      z: tz,
      size: [1.1, 1.1],
      grow: 1.3,
      life: [0.8, 0.8],
      speed: [0, 0],
      up: [1, 1],
      fadeIn: 0.1,
    });
    const idol = prop("hexidol", undefined, owner);
    if (idol) {
      const yaw = Math.random() * Math.PI * 2;
      const s = 1.5;
      const ix = tx - (ev.dirX || 0) * 1.4;
      const iz = tz - (ev.dirZ || 0) * 1.4;
      const iy = ground(h, ix, iz, ty);
      idol.scale.setScalar(s);
      h.add(idol, 2.2, (k) => {
        const rise = k < 0.07 ? k / 0.07 : 1;
        const sink = k > 0.8 ? (k - 0.8) / 0.2 : 0;
        const over = k < 0.07 ? 0 : Math.max(0, 0.18 - (k - 0.07) * 1.2) * Math.sin((k - 0.07) * 40);
        idol.position.set(ix, iy - 2.2 * s * (1 - rise) - 2.4 * s * sink * sink, iz);
        idol.rotation.set(over * 0.6, yaw + (1 - rise) * 1.2, over * 0.4);
      });
    }
    for (let i = 0; i < 4; i++) {
      const tomb = prop("tomb", undefined, owner);
      if (!tomb) break;
      const a = (i / 4) * Math.PI * 2 + Math.random() * 0.6;
      const r = 2.2 + Math.random() * 0.6;
      const bx = tx + Math.cos(a) * r;
      const bz = tz + Math.sin(a) * r;
      const by = ground(h, bx, bz, ty);
      const yaw = Math.atan2(bx - tx, bz - tz) + (Math.random() - 0.5) * 0.5;
      const tilt = (Math.random() - 0.5) * 0.3;
      const d = i * 0.06;
      tomb.scale.setScalar(0.9 + Math.random() * 0.3);
      h.add(tomb, 2.4, (k) => {
        const kk = Math.max(0, (k * 2.4 - d) / 2.4);
        const rise = Math.min(1, kk / 0.1);
        const sink = kk > 0.75 ? (kk - 0.75) / 0.25 : 0;
        tomb.position.set(bx, by - 1.4 * (1 - rise) - 1.6 * sink * sink, bz);
        tomb.rotation.set(tilt, yaw, tilt * 0.5);
      });
      emit(h, {
        tex: SUMMONER.smoke,
        n: 2,
        x: bx,
        y: by + 0.3,
        z: bz,
        size: [0.8, 1.1],
        grow: 1.6,
        life: [0.5, 0.8],
        speed: [0.5, 1.2],
        flatSpread: true,
        opacity: 0.8,
      });
    }
    h.shake = Math.max(h.shake, 0.3);
  },
};
