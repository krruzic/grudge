// Per-frame soldier state: facing, damage-only health bar, rank badge, attack/walk/idle clips (attack clips are
// sped up to fit the unit's cooldown), placeholder weapon swing.
import * as THREE from "three";
import type { Entity } from "../../sim/types";
import type { EntityViews } from "./entityViews";
import { rankTexes } from "./marks";
import type { View } from "./view";

export function syncUnit(ents: EntityViews, e: Entity, v: View, facing: number, time: number, dt: number): void {
  const u = e.unit!;
  const w = ents.world;
  v.root.rotation.y = facing;
  // Freshly raised dead (Remnil's summon ward): a quick white shimmer while nothing can hurt them.
  if (w.time < e.status.invulnUntil && Math.floor(time * 10) % 2 === 0) v.flash = Math.max(v.flash, 0.05);
  v.bar.group.visible = e.hp < e.maxHp;
  if (u.rank !== (v.rank ?? 0)) {
    v.rank = u.rank;
    if (v.badge) {
      v.root.remove(v.badge);
      v.badge.material.dispose();
      v.badge = undefined;
    }
    if (u.rank > 0) {
      v.badge = new THREE.Sprite(
        new THREE.SpriteMaterial({ depthTest: false, transparent: true, map: rankTexes[Math.min(3, u.rank) - 1] }),
      );
      v.badge.renderOrder = 23;
      v.badge.scale.set(0.6, 0.6, 1);
      v.badge.position.y = v.bar.group.position.y + 0.32;
      v.root.add(v.badge);
    }
  }
  if (v.mixer) {
    if (u.attackAnimAt !== v.lastAttack && w.time - u.attackAnimAt < 0.3) {
      v.lastAttack = u.attackAnimAt;
      const clip = v.actions.get("attack")?.getClip();
      ents.play(v, "attack", clip ? clip.duration / Math.min(0.6, u.cooldown * 0.8) : 1, true);
    } else if (
      (v.hitUntil ?? 0) <= performance.now() / 1000 &&
      (v.current !== "attack" || w.time - u.attackAnimAt > Math.min(0.6, u.cooldown * 0.8))
    ) {
      if (u.moving) ents.play(v, "walk", (u.speed * w.speedMul(e)) / 3.2);
      else ents.play(v, "idle");
    }
    v.body.rotation.x = w.time < e.status.stunUntil ? 0.25 : 0;
    v.root.scale.setScalar(w.time < e.status.buffUntil || w.time < e.status.rallyUntil ? 1.08 : 1);
    v.body.position.y = -(v.wade ?? 0) / (v.body.parent?.scale.y || 1);
    v.mixer.update(dt);
    return;
  }
  const phase = time * (u.type === "heavy" ? 7 : 11) + e.id;
  v.body.position.y = (u.moving ? Math.abs(Math.sin(phase)) * 0.09 : 0) - (v.wade ?? 0) / (v.body.parent?.scale.y || 1);
  v.body.rotation.z = u.moving ? Math.sin(phase) * 0.07 : 0;
  if (v.weapon) {
    const k = (w.time - u.attackAnimAt) / 0.3;
    v.weapon.rotation.x = k >= 0 && k < 1 ? -Math.sin(k * Math.PI) * (u.type === "ranged" ? 0.4 : 1.7) : 0;
  }
  v.body.rotation.x = w.time < e.status.stunUntil ? 0.25 : 0;
  const buff = w.time < e.status.buffUntil || w.time < e.status.rallyUntil;
  v.root.scale.setScalar(buff ? 1.08 : 1);
}
