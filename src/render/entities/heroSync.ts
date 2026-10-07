// Per-frame hero pose and state: recall bar, death/respawn, invulnerability ward glow, action -> animation clip,
// jump/leap lift, stealth fade, charge-up aura and small status ambience. Called by EntityViews.sync() with the
// interpolated facing and a dt that is 0 during hit-stop (so animation freezes on impact).
import * as THREE from "three";
import type { Entity } from "../../sim/types";
import { costumeOfPlayer } from "../costumes";
import { trailOf, FX, tint } from "../fx/atlas";
import { hullMaterial, buildHulls } from "../heroModels";
import { KITS } from "../kits/registry";
import { KIND_ANIM, ANIM_FALLBACK } from "./animation";
import { beeLift } from "../heroProps/rider";
import { makeBar, setBar } from "./bars";
import type { EntityViews } from "./entityViews";
import type { View } from "./view";

export function syncHero(ents: EntityViews, e: Entity, v: View, facing: number, dt: number, time: number): void {
  const h = e.hero!;
  const w = ents.world;
  syncRecallBar(ents, v, h);
  if (h.dead) {
    if (!v.wasDead) {
      v.wasDead = true;
      v.deadAt = w.time;
      if (!ents.play(v, "death", 1, true)) v.root.visible = false;
    }
    if (w.time - (v.deadAt ?? 0) > 2.5) {
      v.root.visible = false;
      v.framed = false;
    }
    v.mixer?.update(dt);
    return;
  }
  v.framed = true;
  if (v.wasDead) {
    v.wasDead = false;
    v.root.visible = true;
    ents.play(v, "idle", 1, true);
    ents.fx.spawnFx(e.transform.pos.x, e.transform.y, e.transform.pos.z, e.team);
  }
  v.root.visible = true;
  syncWard(ents, e, v, dt, time);
  syncDig(ents, e, v, dt, time);
  v.body.rotation.y = facing;
  const a = h.action;
  syncActionAnim(ents, e, v, facing, dt);
  v.body.position.y = heroLift(ents, e, v, dt) - (v.wade ?? 0) / (v.body.parent?.scale.y || 1);
  // Wreck Witch Tide Rising: she swells 3% per stack (eased so stacks gained and lost don't pop).
  if (h.tide !== undefined) {
    v.tideK = (v.tideK ?? 0) + ((h.tide ?? 0) - (v.tideK ?? 0)) * Math.min(1, dt * 4);
    v.body.scale.setScalar(1 + v.tideK * 0.03);
  }
  // Stealthed (or hidden in cover and unseen by the other team): fade the hero's own materials.
  const stealth = w.time < e.status.stealthUntil || (e.status.hidden && e.status.seenBy === 0);
  if (stealth !== v.stealthed) {
    v.stealthed = stealth;
    v.body.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.silProxy) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        m.transparent = stealth;
        m.opacity = stealth ? 0.3 : 1;
        m.needsUpdate = true;
      }
    });
  }
  if (v.blockFx) v.blockFx.visible = h.blocking;
  syncChargeAura(ents, e, v, time);
  // Status ambience: life-steal blood motes, out-of-combat regen pluses on home/tower turf, stun wobble.
  if (e.status.stealUntil && w.time < e.status.stealUntil && !v.stealthed && Math.random() < dt * 8)
    ents.fx.bloodMote(v.root.position.x, v.root.position.y, v.root.position.z);
  if (e.hp < e.maxHp && !v.stealthed && w.calm(e) && Math.random() < dt * 5) {
    const turf = w.turf(e);
    if (turf === "home" || turf === "tower") ents.fx.regen(v.root.position.x, v.root.position.y, v.root.position.z);
  }
  if (w.time < e.status.stunUntil) v.body.rotation.z = Math.sin(time * 20) * 0.08;
  else v.body.rotation.z = 0;
  v.mixer?.update(dt);
  applySlap(ents, e, v, dt);
  if (a && a.kind === "combo" && a.t > a.hitAt * 0.45 && a.t < a.hitAt + 0.07) swingTrail(ents, e, v);
}

/** Recall channel progress bar over the hero's head. */
function syncRecallBar(ents: EntityViews, v: View, h: NonNullable<Entity["hero"]>): void {
  const w = ents.world;
  if (h.recallAt !== undefined && !h.dead) {
    if (!v.work) {
      v.work = makeBar(1.6 * ents.heroScale, new THREE.Color(0x9fe0ff), 3.2 * ents.heroScale);
      v.root.add(v.work.group);
    }
    v.work.group.visible = true;
    const total = w.data.heroes.baseline.recallSeconds;
    setBar(v.work, 1 - (h.recallAt - w.time) / total);
  } else if (v.work) v.work.group.visible = false;
}

/** Golden hull outline while invulnerable (not for dodge/super i-frames); fades in and out via wardK. */
function syncWard(ents: EntityViews, e: Entity, v: View, dt: number, time: number): void {
  const h = e.hero!;
  const w = ents.world;
  const warded = w.time < e.status.invulnUntil && h.action?.name !== "dodge" && h.action?.name !== "z" && !h.wing;
  v.wardK = Math.max(0, Math.min(1, (v.wardK ?? 0) + (warded ? dt * 8 : -dt * 5)));
  if (v.wardK > 0 && !v.ward) {
    const line = hullMaterial(0xffd860, false);
    const glow = hullMaterial(0xffc040, true);
    const body = v.body ?? v.root;
    const hulls = [...buildHulls(body, line.mat, 0), ...buildHulls(body, glow.mat, 4)];
    v.ward = { hulls, line, glow };
  }
  if (v.ward) {
    const W = v.ward;
    const on = v.wardK > 0;
    for (const hl of W.hulls) hl.visible = on;
    if (on) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 7);
      W.line.mat.color.setRGB(1, 0.8 + pulse * 0.14, 0.3 + pulse * 0.35);
      W.line.thick.value = 0.04 * v.wardK + 0.01;
      W.glow.thick.value = 0.09 + 0.05 * pulse;
      W.glow.mat.color.setRGB(1, 0.75, 0.25).multiplyScalar(v.wardK * (0.35 + pulse * 0.25));
    }
  }
}

const DIG_COL = new THREE.Color();

/**
 * Red hull outline while Hogshead is Dug In (like the gold invulnerable glow, in his blood-red), then a fainter
 * throbbing one while the powered-up blow is still banked.
 */
function syncDig(ents: EntityViews, e: Entity, v: View, dt: number, time: number): void {
  const w = ents.world;
  const dug = w.time < (e.status.steadfastUntil ?? 0) && !e.hero!.dead;
  const banked = !!e.hero!.digPower && !e.hero!.dead;
  const want = dug ? 1 : banked ? 0.45 : 0;
  const k = v.digK ?? 0;
  v.digK = Math.max(0, Math.min(1, k + Math.sign(want - k) * Math.min(Math.abs(want - k), dt * (want > k ? 8 : 4))));
  if (v.digK <= 0 && !v.dig) return;
  if (!v.dig) {
    const line = hullMaterial(0xff4030, false);
    const glow = hullMaterial(0xff2010, true);
    const body = v.body ?? v.root;
    v.dig = { hulls: [...buildHulls(body, line.mat, 0), ...buildHulls(body, glow.mat, 4)], line, glow };
  }
  const D = v.dig;
  const on = v.digK > 0;
  for (const hl of D.hulls) hl.visible = on;
  if (!on) return;
  const pulse = 0.5 + 0.5 * Math.sin(time * (dug ? 7 : 4));
  // Blood red, or the costume's Dig In colour (its remap of the kit's 0xff4020: Ice Wine blue, Harvest King gold...).
  const col = DIG_COL.set(tint(0xff4020, costumeOfPlayer(e.hero!.player)));
  D.line.mat.color.copy(col).offsetHSL(0, 0, pulse * 0.05);
  D.line.thick.value = 0.04 * v.digK + 0.01;
  D.glow.thick.value = (0.08 + 0.05 * pulse) * Math.max(0.5, v.digK);
  D.glow.mat.color.copy(col).multiplyScalar(v.digK * (0.45 + pulse * 0.3));
}

/**
 * Starts the clip for a new action: combo hits alternate attack_a/b/c (with dust and, for heroes without a kit
 * weapon trail, a slash arc), dodges, hits, else the ability kind's clip (KIND_ANIM with fallbacks). The clip is
 * time-scaled to the action's duration. Dashes/leaps leave a team trail; with no action: block / run / idle.
 */
function syncActionAnim(ents: EntityViews, e: Entity, v: View, facing: number, dt: number): void {
  const h = e.hero!;
  const w = ents.world;
  const a = h.action;
  if (a && a !== v.lastAction) {
    let anim = "idle";
    let swing = false;
    if (a.kind === "combo") {
      const hits = (w.heroDef(h.type).abilities.a as { hits?: { range?: number; projectile?: unknown }[] }).hits;
      const n = hits?.length ?? 3;
      const k = n > 3 ? (a.combo === n - 1 ? 2 : a.combo % 2) : a.combo % 3;
      anim = ["attack_a", "attack_b", "attack_c"][k];
      const hit = hits?.[a.combo];
      swing = !!hit && !hit.projectile;
      if (hit && !hit.projectile)
        ents.fx.dust(e.transform.pos.x, e.transform.y, e.transform.pos.z, ents.heroScale * 0.5, k === 1 ? 4 : 2, 1.6);
      if (hit && !hit.projectile && !KITS[h.type]?.trail) {
        const p = v.root.position;
        ents.fx.slash(p.x, p.y, p.z, facing, e.team, k, Math.min(3.2, (hit.range ?? 2) * 0.95), a.hitAt * 0.7);
      }
    } else if (a.name === "dodge" && a.kind !== "kegrocket" && a.kind !== "pagegust" && a.kind !== "chainswing") {
      anim = "dodge";
      ents.fx.dust(e.transform.pos.x, e.transform.y, e.transform.pos.z, ents.heroScale * 0.8, 5, 2.2);
    } else if (a.name === "hit") anim = "hit";
    else anim = KIND_ANIM[a.kind] ?? "cast";
    for (let k = 0; k < 3 && !v.actions.has(anim) && ANIM_FALLBACK[anim]; k++) anim = ANIM_FALLBACK[anim];
    const len = ents.clipLen(v, anim);
    const scale = anim === "block" || anim === "idle" ? 1 : len / Math.max(0.15, Math.min(a.dur, 1.2));
    ents.play(v, anim, swing ? Math.min(scale, 2) : scale, true, swing && scale > 2 ? 0.04 : 0.1);
  }
  v.lastAction = a;
  if (
    a &&
    (a.name === "dodge" ||
      a.kind === "dash" ||
      a.kind === "leap" ||
      a.kind === "flurry" ||
      a.kind === "blink" ||
      a.kind === "charge")
  ) {
    v.trailT = (v.trailT ?? 0) - dt;
    if (v.trailT <= 0) {
      v.trailT = 0.035;
      const p = v.root.position;
      ents.fx.trail(p.x, p.y + 1.1 * ents.heroScale + v.body.position.y, p.z, e.team, 1.2 * ents.heroScale);
    }
  }
  if (!a) {
    const speed = Math.hypot(h.vel.x, h.vel.z);
    if (h.charging === "a" && (h.chargeT ?? 0) > 0.15 && v.actions.has("whirl")) ents.play(v, "whirl", 1.6);
    else if (h.blocking) ents.play(v, "block");
    if (h.wing && v.actions.has("fly")) ents.play(v, "fly");
    else if (h.blocking) ents.play(v, "block");
    else if (speed > 0.8) ents.play(v, "run", Math.max(0.6, speed / h.speed) * 1.2);
    else if (!(v.current?.startsWith("attack_") && v.actions.get(v.current)?.isRunning())) ents.play(v, "idle");
  }
}

/**
 * Body lift above the ground: quake/leap hops, keg rocket ride, jump arcs (with forward tilt, trail and the
 * crouch/launch clips), standing on a jump pad.
 */
function heroLift(ents: EntityViews, e: Entity, v: View, dt: number): number {
  const h = e.hero!;
  const w = ents.world;
  const a = h.action;
  v.body.rotation.x = 0;
  let lift = 0;
  if (a?.kind === "quake" && a.t < a.hitAt) lift = Math.sin((a.t / a.hitAt) * Math.PI) * 1.8;
  if (a?.kind === "leap" && a.t < a.hitAt) lift = Math.sin((a.t / a.hitAt) * Math.PI) * 2.6;
  if (a?.kind === "kegrocket") lift = Math.min(1, a.t / 0.08, (a.dur - a.t) / 0.1) * 0.75;
  if (a?.kind === "chainswing") lift = Math.sin(Math.min(1, a.t / a.dur) * Math.PI) * 1.3;
  lift = Math.max(lift, beeLift(ents.fx, e, v, dt, w.time));
  if (h.jump) {
    const j = h.jump;
    const k = (w.time - j.start) / j.dur;
    if (k < 0) lift = 0.52 - 0.3 * Math.min(1, (k * j.dur + w.jumpCharge) / w.jumpCharge);
    else {
      const f = Math.min(1, k);
      lift = 0.5 * (1 - f) + Math.sin(f * Math.PI) * j.peak;
      v.body.rotation.x = Math.sin(f * Math.PI) * 0.35 - 0.1;
      v.trailT = (v.trailT ?? 0) - dt;
      if (v.trailT <= 0) {
        v.trailT = 0.05;
        const p = v.root.position;
        ents.fx.trail(p.x, p.y + lift + 1.0 * ents.heroScale, p.z, e.team, 1.1 * ents.heroScale);
      }
    }
    if (k >= 0 && k < 0.15) ents.play(v, "dodge", 0.8);
    else if (k < 0) ents.play(v, "block");
  } else if (w.jumpPads.some((p) => Math.hypot(p.x - e.transform.pos.x, p.z - e.transform.pos.z) < 0.95))
    lift = Math.max(lift, 0.5);
  return lift;
}

/** Glow + pulsing ground ring while holding a charged attack, in the costume's trail colour. */
function syncChargeAura(ents: EntityViews, e: Entity, v: View, time: number): void {
  const h = e.hero!;
  if (h.charging && !v.chargeAura) {
    const col = new THREE.Color(
      trailOf(costumeOfPlayer(h.player)) ?? KITS[h.type]?.trail ?? ents.teamColors[e.team].getHex(),
    );
    const g = new THREE.Group();
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: FX.burst,
        color: col,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    glow.position.y = 1.4;
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: FX.shock,
        color: col,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(glow, ring);
    v.root.add(g);
    v.chargeAura = g;
  }
  if (v.chargeAura) {
    v.chargeAura.visible = !!h.charging;
    if (h.charging) {
      const k = Math.min(1, (h.chargeT ?? 0) / 0.8);
      const [glow, ring] = v.chargeAura.children as [THREE.Sprite, THREE.Mesh];
      const full = k >= 1;
      glow.scale.setScalar((1.4 + k * 2.2) * (full ? 1 + Math.sin(time * 30) * 0.15 : 1));
      glow.material.opacity = 0.35 + k * 0.5;
      glow.material.rotation = time * 4;
      const ph = (time * 2.5) % 1;
      ring.scale.setScalar(2.4 - ph * 1.8);
      (ring.material as THREE.MeshBasicMaterial).opacity = (0.4 + k * 0.6) * ph;
      ents.fx.chargeSparks(
        v.root.position.x,
        v.root.position.y,
        v.root.position.z,
        k,
        glow.material.color.getHex(),
        full,
      );
      v.body.position.y -= 0.12 * k;
    }
  }
}

/**
 * Thorn's reach slap on his real rig: arm and forearm turn toward the target, then the forearm bone is stretched
 * (hand counter-scaled) so the hand actually reaches it; out 0.06 s, hold until 0.24 s, retract by 0.5 s.
 */
export function applySlap(ents: EntityViews, e: Entity, v: View, dt: number): void {
  const s = ents.slaps.get(e.id);
  if (!s) return;
  const arm = v.body.getObjectByName("arm_R")!;
  const fore = v.body.getObjectByName("forearm_R")!;
  const hand = v.body.getObjectByName("hand_R")!;
  s.t += dt;
  const out = 0.06;
  const hold = 0.24;
  const dur = 0.5;
  if (s.t >= dur || !e.alive) {
    fore.scale.set(1, 1, 1);
    hand.scale.set(1, 1, 1);
    ents.slaps.delete(e.id);
    return;
  }
  const f =
    s.t < out
      ? 1 - Math.pow(1 - s.t / out, 3)
      : s.t < hold
        ? 1
        : Math.max(0, 1 - Math.pow((s.t - hold) / (dur - hold), 1.6));
  const blend = Math.min(1, f * 2.5);
  fore.scale.set(1, 1, 1);
  hand.scale.set(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const aim = (b: THREE.Object3D) => {
    b.parent!.updateWorldMatrix(true, false);
    b.updateMatrixWorld(true);
    const p = b.getWorldPosition(new THREE.Vector3());
    const dir = s.target.clone().sub(p).normalize();
    const want = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const local = b.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want);
    b.quaternion.slerp(local, blend);
    b.updateMatrixWorld(true);
  };
  aim(arm);
  aim(fore);
  hand.quaternion.slerp(new THREE.Quaternion(), blend);
  fore.updateMatrixWorld(true);
  const elbow = fore.getWorldPosition(new THREE.Vector3());
  const wrist = hand.getWorldPosition(new THREE.Vector3());
  const len = Math.max(0.05, elbow.distanceTo(wrist));
  const reach = Math.max(len, (elbow.distanceTo(s.target) - len * 0.5) * f);
  const k = Math.max(1, reach / len);
  fore.scale.set(1, k, 1);
  hand.scale.set(1, 1 / k, 1);
}

/** Weapon trail ribbon from whichever hand moved most since last frame, in the kit/costume trail colour. */
function swingTrail(ents: EntityViews, e: Entity, v: View): void {
  if (!v.hands) {
    v.hands = [];
    for (const side of ["R", "L"]) {
      const hand = v.body.getObjectByName(`hand_${side}`);
      const arm = v.body.getObjectByName(`forearm_${side}`);
      if (hand && arm) v.hands.push({ hand, arm, last: new THREE.Vector3() });
    }
  }
  if (!v.hands.length) return;
  v.root.updateMatrixWorld(true);
  let best = v.hands[0];
  let moved = -1;
  const tmp = new THREE.Vector3();
  for (const hd of v.hands) {
    hd.hand.getWorldPosition(tmp);
    const d = tmp.distanceToSquared(hd.last);
    if (d > moved) {
      moved = d;
      best = hd;
    }
  }
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const hd of v.hands) {
    hd.hand.getWorldPosition(tmp);
    hd.last.copy(tmp);
  }
  best.hand.getWorldPosition(a);
  best.arm.getWorldPosition(b);
  a.addScaledVector(tmp.subVectors(a, b), 0.35);
  const kit = e.hero ? KITS[e.hero.type] : undefined;
  if (kit?.trailWidth) a.addScaledVector(tmp.subVectors(a, b), kit.trailWidth);
  const ct = trailOf(costumeOfPlayer(e.hero?.player)) ?? kit?.trail;
  const c =
    ct !== undefined ? new THREE.Color(ct) : ents.teamColors[e.team].clone().lerp(new THREE.Color(1, 1, 1), 0.6);
  ents.fx.handTrail(`h${e.id}`, a, b, c);
}

/** Decays the hit jolt (with jitter during hit-stop) and the white hit flash on the view's materials. */
export function applyImpact(v: View, dt: number, frozen: boolean): void {
  if (v.joltX || v.joltZ) {
    const shake = frozen ? (Math.random() - 0.5) * 0.08 : 0;
    v.root.position.x += v.joltX + shake;
    v.root.position.z += v.joltZ;
    const decay = Math.exp(-dt * 18);
    v.joltX *= decay;
    v.joltZ *= decay;
    if (Math.abs(v.joltX) + Math.abs(v.joltZ) < 0.005) v.joltX = v.joltZ = 0;
  }
  if (v.flash > 0 || v.mats[0]?.userData.flashing) {
    v.flash = Math.max(0, v.flash - dt);
    const k = v.flash > 0 ? 1 : 0;
    for (const m of v.mats) {
      const base = m.userData.baseEmissive as THREE.Color;
      if (k) m.emissive.setRGB(0.6, 0.58, 0.52);
      else m.emissive.copy(base);
      m.userData.flashing = k > 0;
    }
  }
}
