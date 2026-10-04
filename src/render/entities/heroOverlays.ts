// Overlays drawn on top of entity views: talent/status effects (shield dome, grave ring...), the status mark
// over the head, and tower range rings.
import * as THREE from "three";
import type { Entity } from "../../sim/types";
import { costumeOfPlayer } from "../costumes";
import { hd, SUMMONER, trailOf, withCostume } from "../fx/atlas";
import type { EntityViews } from "./entityViews";
import { WHITE } from "./view";
import { domeGeo, hexShieldTex, gearMat, MARKS } from "./marks";
import type { View } from "./view";

/**
 * Talent/status visuals around an entity: the hex-pattern dome while shielded, a spinning gear over hasted
 * structures, the grave ring under structures with a grave active, and (every 0.12 s) status auras through
 * CombatFx.aura: frenzy flames, empower sparks, bleed drips, haste steam, grave spirits.
 */
export function syncTalentFx(ents: EntityViews, e: Entity, v: View, time: number, dt: number): void {
  const w = ents.world;
  const s = e.status;
  const shielded = e.alive && s.shield > 0 && w.time < s.shieldUntil;
  if (shielded && !v.dome) {
    const col = ents.teamColors[e.team] ?? new THREE.Color(1, 1, 1);
    v.dome = new THREE.Mesh(
      domeGeo,
      new THREE.MeshBasicMaterial({
        map: hexShieldTex,
        color: col.clone().lerp(new THREE.Color(1, 0.95, 0.7), 0.55),
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    v.dome.userData.noSil = true;
    v.root.add(v.dome);
  }
  if (v.dome) {
    v.dome.visible = shielded;
    if (shielded) {
      const r = e.structure ? e.radius * 1.9 : e.hero ? 1.25 * ents.heroScale : e.radius * 2.2;
      v.dome.scale.setScalar(r * (1 + Math.sin(time * 5) * 0.03));
      v.dome.position.y = e.structure ? r * 0.9 : r * 0.75;
      v.dome.rotation.y = time * 0.6;
      (v.dome.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.min(0.35, s.shield / 400);
    }
  }
  const st = e.structure;
  const haste = !!st && !!st.hasteUntil && w.time < st.hasteUntil;
  if (haste && !v.gear) {
    v.gear = new THREE.Sprite(gearMat);
    v.gear.renderOrder = 32;
    v.gear.scale.setScalar(1.2);
    v.root.add(v.gear);
  }
  if (v.gear) {
    v.gear.visible = haste;
    v.gear.position.y = 6.2;
    v.gear.material.rotation = time * 4;
  }
  const grave = !!st && !!st.graveUntil && w.time < st.graveUntil && e.alive;
  if (grave && !v.graveRing) {
    v.graveRing = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({
        map: hd(SUMMONER.circle, costumeOfPlayer(e.hero?.player)),
        color: trailOf(costumeOfPlayer(e.hero?.player), "grave") ?? 0xb070ff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    v.graveRing.rotation.x = -Math.PI / 2;
    v.graveRing.renderOrder = 4;
    v.graveRing.userData.noSil = true;
    v.root.add(v.graveRing);
  }
  if (v.graveRing) {
    v.graveRing.visible = grave;
    if (grave) {
      v.graveRing.position.y = 0.12;
      v.graveRing.scale.setScalar(e.radius * 2.3 * (1 + Math.sin(time * 4) * 0.05));
      v.graveRing.rotation.z = time * 0.8;
      (v.graveRing.material as THREE.MeshBasicMaterial).opacity = 0.75 + Math.sin(time * 6) * 0.15;
    }
  }
  if (!e.alive) return;
  v.auraT = (v.auraT ?? 0) - dt;
  if (v.auraT > 0) return;
  v.auraT = 0.12;
  const p = v.root.position;
  const h = e.hero;
  if (h && h.frenzy > 0 && w.time < h.frenzyUntil)
    for (let k = 0; k < h.frenzy; k++) ents.fx.aura("flame", p.x, p.y, p.z);
  if (h && w.time < h.empowerUntil) ents.fx.aura("spark", p.x, p.y, p.z);
  if (w.time < s.bleedUntil && s.bleedStacks > 0 && Math.random() < 0.3 * s.bleedStacks)
    ents.fx.aura("drip", p.x, p.y, p.z);
  if (haste) ents.fx.aura("steam", p.x + (Math.random() - 0.5), p.y + 4.5, p.z + (Math.random() - 0.5));
  if (grave)
    withCostume(costumeOfPlayer(e.hero?.player), () => {
      for (let k = 0; k < 2; k++) ents.fx.aura("grave", p.x, p.y, p.z, e.radius * 1.7);
    });
}
/** The most important status to show over an entity ("" for none), in priority order. */
function markKind(e: Entity, t: number): string {
  const s = e.status;
  if (!e.alive) return "";
  if (t < s.stunUntil) return "stun";
  if (t < s.markUntil) return "mark";
  if (e.hero && t < e.hero.openingUntil) return "opening";
  if (t < s.hexUntil) return "hex";
  if (t < s.bleedUntil && s.bleedStacks > 0) return "bleed";
  if (t < s.armorUntil && s.armorMul < 1) return "armor";
  if (t < s.slowUntil && s.slowMul < 0.95) return "slow";
  if ((t < s.buffUntil && s.buffDamageMul > 1) || t < s.rallyUntil || t < (s.hauntUntil ?? 0)) return "buff";
  if (t < s.guardUntil && s.guardMul < 1) return "guard";
  if (t < s.cowedUntil) return "cowed";
  return "";
}

/** Status mark sprite over the head (above the relic/bomb when carrying one), swapped when the status changes. */
export function syncMark(ents: EntityViews, e: Entity, v: View, time: number): void {
  const kind = markKind(e, ents.world.time);
  if (kind !== v.markKind) {
    v.markKind = kind;
    if (v.mark) {
      v.root.remove(v.mark);
      v.mark = undefined;
    }
    if (kind) {
      v.mark = new THREE.Sprite(MARKS[kind]);
      v.mark.renderOrder = 32;
      v.root.add(v.mark);
    }
  }
  if (v.mark) {
    const s = (e.hero ? 0.75 : 0.55) * (1 + Math.sin(time * 6) * 0.08);
    v.mark.scale.set(s, s, 1);
    const high = !!e.hero && (ents.world.arena.carrying(e) || e.hero.bomb);
    v.mark.position.y = e.hero ? (high ? 3.2 : 2.45) * ents.heroScale : v.bar.group.position.y + 0.4;
    if (v.markKind === "stun") v.mark.material.rotation = time * 5;
  }
}

/** Ground circle at a tower's attack range. */
export function rangeRing(ents: EntityViews, e: Entity): THREE.Mesh {
  const st = e.structure!;
  const r = st.range;
  const n = 72;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const cx = e.transform.pos.x;
  const cz = e.transform.pos.z;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (let k = 0; k < 2; k++) {
      const rr = k ? r : r - 0.18;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const j = (i * 2 + k) * 3;
      pos[j] = x;
      pos[j + 1] = ents.world.groundY(x, z) + 0.12;
      pos[j + 2] = z;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (st.type === "support" && i % 3 === 2) continue;
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const color = ents.teamColors[e.team]
    .clone()
    .lerp(WHITE, st.type === "damage" ? 0.1 : st.type === "control" ? 0.35 : 0.6);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  m.renderOrder = 4;
  return m;
}
