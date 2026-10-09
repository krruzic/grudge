// SimEvent -> effects. CombatFx.handle() calls handleEvent() under the source's costume for every event the sim
// emitted this tick. Hero kits get the first say: kit.act() for ability phases ("act"), kit.hit() for hits, and
// kit.event() for anything else (returning true swallows the generic effect below).
import * as THREE from "three";
import type { SimEvent } from "../../sim/types";
import { trailOf, activeCostume, FX, HERALD } from "../fx/atlas";
import { fxBatch, FxBatch } from "../fx/instances";
import { emit, UP } from "../fx/parts";
import { shockwave } from "../fx/shockwave";
import { KITS } from "../kits/registry";
import { wardenSlap } from "../kits/wardenParts";
import type { CombatFx } from "./combatFx";
import { hitTint, pillarGeo, shardGeo, tmpColor } from "./assets";
import { repair, cannonHit, cannonWarn } from "./fieldFx";
import {
  BLOCK_LABEL,
  CRIT_LABEL,
  MISS_LABEL,
  RANK_LABELS,
  KO_LABEL,
  PARRY_LABEL,
  calloutTex,
  FALL_LABEL,
} from "./floatText";
import {
  glowTex,
  starTex,
  puffTex,
  emblemTex,
  plusTex,
  frostTex,
  talentTexture,
  swirlTex,
  crackTex,
  pillarTex,
  streakTex,
} from "./textures";
import { towerPulse } from "./towers";
import { spikeBatch } from "../kits/warlord";

type Ev<T extends SimEvent["type"]> = Extract<SimEvent, { type: T }>;

export function handleEvent(cfx: CombatFx, ev: SimEvent): void {
  const sid = "src" in ev ? ev.src : undefined;
  const se = sid !== undefined ? cfx.world?.getAny(sid) : undefined;
  const sk = se?.hero ? KITS[se.hero.type] : undefined;
  if (ev.type === "act") {
    // Charged attacks (power > 1.25) get a release burst in the costume's trail colour on top of the kit's act().
    const pw = se?.hero?.action?.power ?? 1;
    if (se && ev.phase === "fire" && pw > 1.25)
      cfx.chargeRelease(ev.x, ev.y, ev.z, ev.dirX, ev.dirZ, pw, trailOf(activeCostume()) ?? sk?.trail ?? 0xfff0b0);
    if (se && sk?.act) sk.act(cfx, ev, se);
    return;
  }
  if (ev.type !== "hit" && se && sk?.event?.(cfx, ev, se)) return;
  switch (ev.type) {
    case "hit":
      hitFx(cfx, ev);
      break;
    case "miss":
      cfx.label(ev.x, ev.y, ev.z, MISS_LABEL);
      break;
    case "rankUp":
      cfx.ring(ev.x, ev.y + 0.05, ev.z, new THREE.Color(1, 0.8, 0.2), 1.6, 0.4);
      cfx.burst(ev.x, ev.y + 1.0, ev.z, starTex, 0xffcc33, 6, 0.35, 0.5, 1.5, true, 1.2);
      cfx.label(ev.x, ev.y + 1.2, ev.z, RANK_LABELS[Math.min(3, ev.rank) - 1]);
      break;
    case "death":
      deathFx(cfx, ev);
      break;
    case "slam":
      slamFx(cfx, ev.x, ev.y, ev.z, ev.radius);
      break;
    case "warcry": {
      const c = cfx.teamColors[ev.team];
      const hot = new THREE.Color(0xff8a30);
      for (let k = 0; k < 3; k++)
        cfx.after(k * 0.12, () => cfx.ring(ev.x, ev.y + 0.2, ev.z, hot.clone().lerp(c, 0.3), ev.radius, 0.55));
      cfx.flash(ev.x, ev.y + 2.2, ev.z, starTex, 0xffb060, 4, 0.35);
      cfx.burst(ev.x, ev.y + 2, ev.z, starTex, 0xff9030, 10, 0.5, 0.6, 3, true, 2.5);
      break;
    }
    case "repair":
      repair(cfx, ev);
      break;
    case "banner": {
      const c = cfx.teamColors[ev.team];
      cfx.ring(ev.x, ev.y, ev.z, c, 2.5, 0.4);
      cfx.burst(ev.x, ev.y + 0.2, ev.z, puffTex, 0xb09878, 8, 0.9, 0.6, 2, false, 0.6);
      cfx.shake = Math.max(cfx.shake, 0.15);
      break;
    }
    case "ping": {
      // Deathmatch callout: where a human told their house's CPUs to push.
      const c = cfx.teamColors[ev.team];
      cfx.ring(ev.x, ev.y + 0.1, ev.z, c, 3, 0.9);
      cfx.ring(ev.x, ev.y + 0.1, ev.z, c, 1.6, 0.6);
      cfx.flash(ev.x, ev.y + 1, ev.z, glowTex, 0xffffff, 3, 0.4);
      break;
    }
    case "rally": {
      cfx.decal(emblemTex, ev.x, ev.y, ev.z, ev.radius, 1.4, 0.25, 0.6);
      cfx.flash(ev.x, ev.y + 2, ev.z, glowTex, 0xffe8a0, 5, 0.6);
      cfx.burst(ev.x, ev.y + 1, ev.z, plusTex, 0xffffff, 12, 1, 1.2, ev.radius * 0.7, false, 1.2);
      break;
    }
    case "pulse":
      if (ev.style && towerPulse(cfx, ev, (pts) => lightning(cfx, pts))) break;
      cfx.decal(frostTex, ev.x, ev.y, ev.z, ev.radius, 0.6, 0.6, 0);
      cfx.burst(ev.x, ev.y + 0.4, ev.z, starTex, 0xbfe8ff, 8, 0.4, 0.5, ev.radius * 0.8, true, 0.6);
      break;
    case "heroFx":
      // Wounded (healing cut): a dark red flash and a few falling red specks over the hit champion.
      if (ev.name === "wounded") {
        cfx.flash(ev.x, ev.y + 1.6, ev.z, glowTex, 0xb01818, 1.4, 0.3);
        cfx.burst(ev.x, ev.y + 1.8, ev.z, glowTex, 0xd02020, 5, 0.18, 0.5, 0.8, false, 0.6);
        break;
      }
      if (ev.name === "healNum" && ev.radius) {
        cfx.number(ev.x, ev.y, ev.z, ev.radius, "#7dff7a", true);
        emit(cfx, {
          tex: HERALD.heal,
          n: 3,
          x: ev.x,
          y: ev.y + 0.6,
          z: ev.z,
          size: [0.45, 0.6],
          life: [0.8, 1.1],
          speed: [0.2, 0.6],
          up: [1, 1.6],
          jitter: 0.8,
        });
      }
      break;
    case "heal":
      emit(cfx, {
        tex: HERALD.heal,
        n: 2,
        x: ev.x,
        y: ev.y + 1.4,
        z: ev.z,
        size: [0.4, 0.55],
        life: [0.8, 1.1],
        speed: [0.2, 0.6],
        up: [1, 1.6],
        jitter: 0.8,
      });
      break;
    case "build":
      break;
    case "telegraph":
      telegraphFx(cfx, ev, trailOf(activeCostume()) ?? sk?.trail ?? 0xfff0b0);
      break;
    case "parry":
      cfx.flash(ev.x, ev.y + 0.3, ev.z, glowTex, 0xfff4b0, 3, 0.25);
      cfx.label(ev.x, ev.y + 0.3, ev.z, PARRY_LABEL);
      cfx.shake = Math.max(cfx.shake, 0.25);
      break;
    case "blink":
      cfx.burst(ev.x, ev.y + 0.8, ev.z, puffTex, 0x3a3a44, 22, 2.2, 1.6, 2.4, false, 0.5);
      cfx.burst(ev.x, ev.y + 1.4, ev.z, puffTex, 0x6a6a78, 12, 1.6, 1.3, 1.6, false, 0.9);
      cfx.flash(ev.x, ev.y + 1, ev.z, glowTex, 0x9a90c0, 3, 0.2);
      break;
    case "cannonWarn":
      cannonWarn(cfx, ev.x, ev.y, ev.z, ev.radius, ev.seconds);
      break;
    case "cannonHit":
      cannonHit(cfx, ev.x, ev.y, ev.z, ev.radius);
      break;
    case "callout":
      calloutFx(cfx, ev);
      break;
    case "chasm":
      cfx.burst(ev.x, ev.y + 0.4, ev.z, starTex, 0xd8f4ff, 12, 0.6, 0.9, 3, true, 3);
      cfx.burst(ev.x, ev.y + 0.3, ev.z, puffTex, 0xf0f8ff, 8, 1.1, 0.9, 2.2, false, 0.5);
      break;
    case "reach":
      if (ev.style === "afterimage") afterimage(cfx, ev.x, ev.y, ev.z, ev.tx, ev.tz, ev.team);
      else {
        const ty = (cfx.world ? cfx.world.groundY(ev.tx, ev.tz) : ev.y) + 1.15;
        const real = ev.src !== undefined && !!cfx.slapArm?.(ev.src, ev.tx, ty, ev.tz);
        wardenSlap(cfx, ev.x, ev.y, ev.z, ev.tx, ev.tz, ev.hit, real);
      }
      break;
    case "levelup": {
      const col = ev.level >= 5 ? "#ffd040" : "#fff0b0";
      pillar(cfx, ev.x, ev.y, ev.z);
      cfx.burst(ev.x, ev.y + 1.5, ev.z, starTex, 0xffe080, 16, 0.7, 1, 2.4, true, 4);
      const { tex, aspect } = calloutTex(`LEVEL ${ev.level}!`, col);
      floatSprite(cfx, tex, aspect, ev.x, ev.y + 5, ev.z, 0.8, 1.6);
      break;
    }
    case "learned": {
      if (cfx.quiet) break;
      const { tex, aspect } = calloutTex(ev.name, "#ffe890");
      floatSprite(cfx, tex, aspect, ev.x, ev.y + 4.4, ev.z, 0.65, 2.2);
      const it = talentTexture(ev.icon);
      if (it) floatSprite(cfx, it, 1, ev.x, ev.y + 5.6, ev.z, 1.5, 2.2);
      cfx.burst(ev.x, ev.y + 2.5, ev.z, starTex, 0xffd060, 10, 0.5, 0.8, 1.2, true, 1.5);
      break;
    }
    case "chain":
      lightning(cfx, ev.pts);
      break;
    case "pull":
      cfx.decal(swirlTex, ev.x, ev.y, ev.z, ev.radius, 0.55, 0, -7);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        cfx.sparks(
          ev.x + Math.cos(a) * ev.radius,
          ev.y + 0.3,
          ev.z + Math.sin(a) * ev.radius,
          -Math.cos(a),
          -Math.sin(a),
          0xd8c8a0,
          1,
          ev.radius * 2.2,
        );
      }
      break;
    case "shieldBreak":
      shieldBreakFx(cfx, ev);
      break;
    case "charge":
      cfx.burst(ev.x, ev.y + 0.3, ev.z, puffTex, 0xb09878, 10, 1.2, 0.7, 2, false, 0.4);
      cfx.shake = Math.max(cfx.shake, 0.2);
      break;
    case "shove":
      cfx.burst(ev.x, ev.y + 0.9, ev.z, puffTex, 0xd8ccb0, 6, 0.9, 0.35, 2.2, false, 0.3);
      if (ev.team >= 0) {
        cfx.flash(ev.x, ev.y + 1, ev.z, starTex, 0xffffff, 2.2, 0.18);
        cfx.shake = Math.max(cfx.shake, 0.2);
      }
      break;
    case "fall":
      cfx.burst(ev.x, ev.y + 0.2, ev.z, puffTex, 0xb09878, 10, 1.2, 0.7, 2.4, false, 0.5);
      cfx.debris(ev.x, ev.y, ev.z, [0x7a6a52, 0x5a4c3a], 5, 0.18, 3);
      cfx.label(ev.x, ev.y + 1.4, ev.z, FALL_LABEL);
      cfx.shake = Math.max(cfx.shake, 0.3);
      break;
    case "squad": {
      const c = cfx.teamColors[ev.team];
      cfx.burst(ev.x, ev.y + 0.3, ev.z, puffTex, 0xd8c8a8, 12, 1.4, 0.8, 2.6, false, 0.7);
      cfx.ring(ev.x, ev.y, ev.z, c, 3, 0.5);
      break;
    }
    case "relic":
      relicFx(cfx, ev);
      break;
  }
}
// ── Shared pieces of the generic effects ──

/** Ground slam: crack decal, dust, debris; big slams (radius >= 4.5) also push up a ring of rock spikes. */
export function slamFx(cfx: CombatFx, x: number, y: number, z: number, radius: number): void {
  cfx.decal(crackTex, x, y, z, radius * 1.05, 1.8, 0.08, 0);
  cfx.burst(x, y + 0.2, z, puffTex, 0xb09878, 10 + Math.round(radius * 2), 1.2, 0.8, radius * 1.1, false, 0.6);
  cfx.debris(x, y, z, [0x7a6a52, 0x5a4c3a, 0x8a7a66], Math.round(radius * 2), 0.2 + radius * 0.03, 3 + radius);
  if (radius >= 4.5) {
    const spikes = Math.round(radius * 1.6);
    for (let k = 0; k < spikes; k++) {
      const a = (k / spikes) * Math.PI * 2 + Math.random() * 0.4;
      const d = radius * (0.45 + Math.random() * 0.5);
      const sx = x + Math.cos(a) * d;
      const sz = z + Math.sin(a) * d;
      const h = 0.8 + Math.random() * 1.1;
      const rock = spikeBatch(cfx.root, activeCostume()).spawn();
      const rr = 0.35 + Math.random() * 0.2;
      rock.scale.set(rr * 1.6, h / 1.6, rr * 1.6);
      rock.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      const gy = cfx.world ? cfx.world.groundY(sx, sz) : y;
      cfx.add(rock, 1.6, (k2) => {
        const up = k2 < 0.12 ? k2 / 0.12 : k2 > 0.75 ? 1 - (k2 - 0.75) / 0.25 : 1;
        rock.position.set(sx, gy - h / 2 + h * up, sz);
      });
    }
  }
  cfx.shake = Math.max(cfx.shake, radius > 4 ? 0.6 : 0.3);
}
function floatSprite(
  cfx: CombatFx,
  tex: THREE.Texture,
  aspect: number,
  x: number,
  y: number,
  z: number,
  h: number,
  dur: number,
): void {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.renderOrder = 32;
  s.scale.set(h * aspect, h, 1);
  s.position.set(x, y, z);
  cfx.root.add(s);
  cfx.items.push({
    obj: s,
    t: 0,
    dur,
    tick: (k, dt) => {
      const pop = k < 0.1 ? 1 + (1 - k / 0.1) * 0.5 : 1;
      s.scale.set(h * aspect * pop, h * pop, 1);
      s.position.y += dt * 0.6;
      s.material.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    },
  });
}
function pillar(cfx: CombatFx, x: number, y: number, z: number): void {
  const mat = cfx.pooled(
    "pillar",
    () =>
      new THREE.MeshBasicMaterial({
        map: pillarTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
  );
  mat.opacity = 1;
  const m = new THREE.Mesh(pillarGeo, mat);
  m.position.set(x, y + 3.5, z);
  cfx.root.add(m);
  cfx.items.push({
    obj: m,
    t: 0,
    dur: 1.1,
    tick: (k) => {
      m.scale.set(1 - k * 0.6, 0.3 + Math.min(1, k * 4) * 0.7, 1 - k * 0.6);
      m.rotation.y = k * 4;
      (m.material as THREE.MeshBasicMaterial).opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    },
  });
}
export function lightning(cfx: CombatFx, pts: number[]): void {
  for (let seg = 0; seg + 5 < pts.length; seg += 3) {
    const a = new THREE.Vector3(pts[seg], pts[seg + 1], pts[seg + 2]);
    const b = new THREE.Vector3(pts[seg + 3], pts[seg + 4], pts[seg + 5]);
    const path: THREE.Vector3[] = [a];
    const n = 6;
    for (let k = 1; k < n; k++) {
      const p = a.clone().lerp(b, k / n);
      p.x += (Math.random() - 0.5) * 0.9;
      p.y += (Math.random() - 0.5) * 0.9;
      p.z += (Math.random() - 0.5) * 0.9;
      path.push(p);
    }
    path.push(b);
    const curve = new THREE.CatmullRomCurve3(path, false, "catmullrom", 0);
    for (const [r, col] of [
      [0.12, 0x6ab0ff],
      [0.05, 0xffffff],
    ] as const) {
      const mat = cfx.pooled(
        "bolt",
        () => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mat.color.set(col);
      mat.opacity = 1;
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, r, 4, false), mat);
      cfx.root.add(m);
      cfx.items.push({
        obj: m,
        t: 0,
        dur: 0.3,
        tick: (k) => {
          (m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (Math.random() < 0.3 ? 0.4 : 1);
        },
      });
    }
    cfx.flash(b.x, b.y, b.z, starTex, 0xbfe0ff, 1.6, 0.2);
  }
}
export function afterimage(cfx: CombatFx, x: number, y: number, z: number, tx: number, tz: number, team: number): void {
  const c = (cfx.teamColors[team] ?? new THREE.Color(1, 1, 1)).clone().lerp(new THREE.Color(0.8, 0.9, 1), 0.6);
  const n = 8;
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    cfx.after(f * 0.18, () => {
      const px = x + (tx - x) * f;
      const pz = z + (tz - z) * f;
      const s = cfx.sprite(streakTex, c, true, 0.9);
      s.position.set(px, y + 1.2, pz);
      s.material.rotation = Math.atan2(-(tz - z), tx - x);
      cfx.items.push({
        obj: s,
        t: 0,
        dur: 0.4,
        tick: (q) => {
          s.scale.set(2.2, 0.5, 1);
          s.material.opacity = 0.9 * (1 - q);
        },
      });
      cfx.flash(px, y + 1.2, pz, glowTex, c, 1.2, 0.25);
    });
  }
}

// ── Larger event handlers ──

// Generic hit: block flash, or the source kit's hit() (falling back to a star flash + team-tinted sparks), big-hit
// burst and shake, crit label/burst, and the damage number (only for hits that involve a hero or a structure).
function hitFx(cfx: CombatFx, ev: Ev<"hit">): void {
  if (ev.blocked) {
    cfx.flash(ev.x, ev.y + 0.2, ev.z, glowTex, 0x9fd8ff, 1.4, 0.2);
    cfx.label(ev.x, ev.y, ev.z, BLOCK_LABEL);
  } else {
    const tgt = ev.id !== undefined ? cfx.world?.get(ev.id) : undefined;
    const src = ev.src !== undefined ? cfx.world?.get(ev.src) : undefined;
    const dx = ev.fx !== undefined ? ev.x - ev.fx : Math.random() - 0.5;
    const dz = ev.fz !== undefined ? ev.z - ev.fz : Math.random() - 0.5;
    const heroInvolved = !!tgt?.hero || !!src?.hero;
    const kit = src?.hero ? KITS[src.hero.type] : undefined;
    const custom = !!kit?.hit && kit.hit(cfx, ev, src!, dx, dz);
    if (!custom) {
      cfx.flash(ev.x, ev.y + 0.2, ev.z, starTex, 0xffffff, ev.big ? 2.4 : 1.2, ev.big ? 0.22 : 0.14);
      const sc = src ? tmpColor.copy(cfx.teamColors[src.team]).lerp(hitTint, 0.6) : hitTint;
      cfx.sparks(ev.x, ev.y + 0.2, ev.z, dx, dz, sc, ev.big ? 9 : heroInvolved ? 5 : 3, ev.big ? 9 : 6);
    }
    if (ev.big && custom) {
      cfx.shake = Math.max(cfx.shake, 0.22);
    } else if (ev.big) {
      cfx.burst(ev.x, ev.y, ev.z, starTex, 0xffd080, 5, 0.4, 0.3, 4, true, 1);
      if (!cfx.lite || heroInvolved) cfx.ring(ev.x, ev.y - 0.9, ev.z, new THREE.Color(1, 0.9, 0.7), 1.8, 0.25);
      cfx.shake = Math.max(cfx.shake, 0.22);
    } else if (tgt?.hero) {
      cfx.shake = Math.max(cfx.shake, 0.08);
    }
    if (ev.crit) {
      cfx.label(ev.x, ev.y + 1.3, ev.z, CRIT_LABEL);
      emit(cfx, {
        tex: FX.burst,
        n: 1,
        x: ev.x,
        y: ev.y + 0.4,
        z: ev.z,
        color: 0xffe070,
        size: [2.6, 2.6],
        grow: 1.3,
        life: [0.16, 0.16],
        speed: [0, 0],
        additive: true,
        order: 8,
      });
      emit(cfx, {
        tex: FX.twinkle,
        n: 6,
        x: ev.x,
        y: ev.y + 0.4,
        z: ev.z,
        size: [0.35, 0.55],
        life: [0.3, 0.45],
        speed: [4, 7],
        gravity: 8,
        additive: true,
      });
      cfx.shake = Math.max(cfx.shake, 0.3);
    }
    if (ev.amount && (tgt?.hero || tgt?.structure || src?.hero)) {
      const color = ev.crit ? "#ffe040" : tgt?.hero ? "#ff6a4a" : ev.big ? "#ffd84a" : "#ffffff";
      cfx.number(ev.x, ev.y, ev.z, ev.amount, color, ev.big || !!tgt?.hero, ev.crit ? 1.5 : 1, ev.id);
    }
  }
}

function deathFx(cfx: CombatFx, ev: Ev<"death">): void {
  const c = cfx.teamColors[ev.team] ?? new THREE.Color(1, 1, 1);
  if (ev.kind === "unit") {
    cfx.burst(ev.x, ev.y + 0.6, ev.z, puffTex, 0xcfc8bc, 6, 0.9, 0.6, 1.5, false, 0.8);
    cfx.flash(ev.x, ev.y + 0.7, ev.z, glowTex, c, 1.8, 0.25);
    cfx.debris(ev.x, ev.y, ev.z, [c, 0x6a5040], 3, 0.14, 4);
  } else if (ev.kind === "hero") {
    cfx.flash(ev.x, ev.y + 1.2, ev.z, starTex, 0xffffff, 5, 0.3);
    cfx.flash(ev.x, ev.y + 1.2, ev.z, glowTex, c, 7, 0.6);
    cfx.ring(ev.x, ev.y, ev.z, c, 5, 0.5);
    cfx.ring(ev.x, ev.y, ev.z, new THREE.Color(1, 1, 1), 3, 0.3);
    cfx.burst(ev.x, ev.y + 0.4, ev.z, puffTex, 0xcfc8bc, 10, 1.4, 0.9, 3, false, 0.6);
    cfx.debris(ev.x, ev.y, ev.z, [c, 0x8a8a90, 0x6a5040], 8, 0.2, 6);
    cfx.soul(ev.x, ev.y, ev.z, c);
    cfx.label(ev.x, ev.y + 1.6, ev.z, KO_LABEL);
    cfx.shake = Math.max(cfx.shake, 0.45);
  } else {
    cfx.debris(ev.x, ev.y, ev.z, [0x8a8580, 0x6a6560, c], ev.kind === "structure" ? 14 : 6, 0.35, 8);
    cfx.burst(ev.x, ev.y + 1, ev.z, puffTex, 0x8a8078, 16, 2.2, 1.4, 3, false, 1.5);
    cfx.burst(ev.x, ev.y + 1, ev.z, starTex, 0xffa040, 10, 1.2, 0.6, 5, true, 2);
    cfx.flash(ev.x, ev.y + 1.2, ev.z, glowTex, c, 6, 0.5);
    cfx.ring(ev.x, ev.y, ev.z, c, 5, 0.6);
    cfx.shake = Math.max(cfx.shake, ev.kind === "structure" ? 0.5 : 0.3);
  }
}

/**
 * Fallback for a delayed or splash blast whose champion's kit doesn't draw its own (kits claim "telegraph" in event()):
 * a warning ring for a delayed one, then a ring, flash and puff, all in the source's costume trail colour. Deliberately
 * plain - there is no shared rune, so no two champions' blasts look alike.
 */
function telegraphFx(cfx: CombatFx, ev: Ev<"telegraph">, color: number): void {
  const r = ev.radius;
  const col = new THREE.Color(color);
  if (ev.seconds > 0.1) shockwave(cfx, FX.shock, ev.x, ev.y + 0.12, ev.z, UP, r * 0.95, r, ev.seconds, color, 0.55);
  cfx.after(ev.seconds, () => {
    shockwave(cfx, FX.shock, ev.x, ev.y + 0.2, ev.z, UP, 0.3, r * 1.15, 0.35, color, 0.85);
    cfx.flash(ev.x, ev.y + 0.8, ev.z, glowTex, color, r * 1.6, 0.25);
    cfx.burst(
      ev.x,
      ev.y + 0.4,
      ev.z,
      puffTex,
      col.clone().multiplyScalar(0.55).getHex(),
      8,
      1,
      0.7,
      r * 0.8,
      false,
      1.2,
    );
  });
}

// Ability callout ("EARTHQUAKE · STUNS") floating over the caster, tinted by team.
function calloutFx(cfx: CombatFx, ev: Ev<"callout">): void {
  if (cfx.quiet) return;
  const col = ["#b8ccff", "#ffc0b8", "#b8f0c0", "#fff0a0"][ev.team] ?? "#fff0c0";
  const { tex, aspect } = calloutTex(ev.text, col);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.renderOrder = 31;
  const h = 0.62;
  s.scale.set(h * aspect, h, 1);
  s.position.set(ev.x, ev.y + 4.3, ev.z);
  cfx.root.add(s);
  cfx.items.push({
    obj: s,
    t: 0,
    dur: 1.8,
    tick: (k, dt) => {
      s.position.y += dt * 0.5;
      s.material.opacity = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    },
  });
}

function shieldBreakFx(cfx: CombatFx, ev: Ev<"shieldBreak">): void {
  for (let k = 0; k < 12; k++) {
    const m = fxBatch(
      cfx.root,
      "shard",
      () => new FxBatch(shardGeo, new THREE.MeshLambertMaterial({ transparent: true, flatShading: true }), true, true),
    ).spawn();
    m.color.set(ev.burst ? 0x7a5a30 : 0xbfe0ff);
    m.emissive.set(ev.burst ? 0x201008 : 0x203850);
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 4;
    let vy = 3 + Math.random() * 3;
    m.position.set(ev.x, ev.y + 1.2, ev.z);
    cfx.items.push({
      obj: m,
      t: 0,
      dur: 0.8,
      tick: (q, dt) => {
        vy -= 14 * dt;
        m.position.x += Math.cos(a) * sp * dt;
        m.position.z += Math.sin(a) * sp * dt;
        m.position.y += vy * dt;
        m.rotation.x += dt * 9;
        m.opacity = 1 - q;
      },
    });
  }
  if (ev.burst) slamFx(cfx, ev.x, ev.y, ev.z, 3);
  cfx.flash(ev.x, ev.y + 1.2, ev.z, glowTex, ev.burst ? 0xc8a060 : 0xbfe8ff, 3, 0.25);
}

// The grudge relic: pick-up/drop sparkle, shrine eruption, theft, return home.
function relicFx(cfx: CombatFx, ev: Ev<"relic">): void {
  if (ev.state === "taken" || ev.state === "dropped") {
    cfx.flash(ev.x, ev.y + 1.2, ev.z, starTex, 0xffd060, 3.5, 0.3);
    cfx.burst(ev.x, ev.y + 1, ev.z, starTex, 0xffc040, 10, 0.6, 0.6, 3, true, 1.2);
  } else if (ev.state === "shrined") {
    const c = (cfx.teamColors[ev.team] ?? new THREE.Color(1, 1, 1)).clone().lerp(new THREE.Color(0xffd060), 0.5);
    cfx.flash(ev.x, ev.y + 4, ev.z, starTex, 0xffe080, 8, 0.5);
    cfx.burst(ev.x, ev.y + 4, ev.z, starTex, 0xffc040, 24, 0.9, 1.3, 4, true, 2.5);
    cfx.ring(ev.x, ev.y, ev.z, c, 6, 0.8);
    cfx.ring(ev.x, ev.y, ev.z, new THREE.Color(0xffd060), 3.5, 0.6);
    cfx.shake = Math.max(cfx.shake, 0.35);
  } else if (ev.state === "stolen") {
    cfx.flash(ev.x, ev.y + 4, ev.z, starTex, 0xffffff, 6, 0.4);
    cfx.burst(ev.x, ev.y + 3, ev.z, puffTex, 0x6a5a4a, 16, 1.2, 0.9, 4, false, 1.5);
    cfx.debris(ev.x, ev.y + 3, ev.z, [0xc89a40, 0x8a7a68], 8, 0.22, 5);
    cfx.shake = Math.max(cfx.shake, 0.4);
  } else if (ev.state === "home") {
    cfx.burst(ev.x, ev.y + 1.5, ev.z, starTex, 0xffd060, 12, 0.6, 1, 2, true, 2);
  }
}
