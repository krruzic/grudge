// Per-frame structure state: core shield and crystal, construction/upgrade work bars and level reveals, tower
// aim and idle effects, range rings near local players, Maddock's cask and Stig's ballista; plus the build-pad
// markers and button hints for local heroes standing on pads (syncPads).
import { builderRate, padNear, canSpec } from "../../sim/structures";
import type { Entity } from "../../sim/types";
import { towerIdle } from "../combat/towers";
import { syncCask } from "../heroProps/friar";
import { syncBallista } from "./ballista";
import { setBar } from "./bars";
import type { EntityViews } from "./entityViews";
import { WHITE } from "./view";
import { rangeRing } from "./heroOverlays";
import { HINTS } from "./marks";
import type { View } from "./view";

export function syncStructure(ents: EntityViews, e: Entity, v: View, time: number): void {
  const st = e.structure!;
  const w = ents.world;
  if (st.type === "core") {
    if (v.shield) {
      v.shield.visible = st.shielded && !w.isSudden();
      v.shield.scale.setScalar(1 + Math.sin(time * 2) * 0.02);
    }
    if (v.spin) {
      v.spin.rotation.y = time * 0.8 + e.team;
    }
    v.bar.group.visible = true;
    if (v.work) {
      const ward = (st.ward ?? 0) / w.wardMax;
      v.work.group.visible = ward > 0 && !w.isSudden();
      setBar(v.work, ward, 1 / 60, time);
    }
    return;
  }
  v.bar.group.visible = e.hp < e.maxHp || !st.ready;
  if (v.work) {
    const building = !st.ready || !!st.upgrading;
    v.work.group.visible = building;
    if (building) {
      setBar(v.work, st.progress ?? 0, 1 / 60, time);
      const idle = !st.ready && builderRate(w, e) <= 0;
      v.work.fgColor.set(idle && Math.floor(time * 3) % 2 === 0 ? 0x806020 : 0xffd040);
    }
  }
  if (st.cask) {
    v.bar.group.visible = true;
    syncCask(v.body, w.time - st.builtAt, time);
    return;
  }
  if (st.siege) {
    const age = w.time - st.builtAt;
    v.body.scale.set(1, Math.min(1, 0.2 + age * 2), 1);
    syncBallista(v.body, e.transform.facing, w.time - st.lastFireAt, time, 1 / 60);
    return;
  }
  const k = st.ready ? 1 : Math.min(1, st.progress ?? 0);
  v.body.scale.set(1, 0.25 + 0.75 * k, 1);
  if (v.level2) v.level2.visible = st.level > 1;
  if (v.level3) for (const [id, o] of v.level3) o.visible = st.spec === id;
  const bal = st.spec === "ballista" ? v.level3?.get("ballista") : undefined;
  if (bal) {
    let want = (st.aim ?? e.transform.facing) - e.transform.facing;
    const cur = bal.rotation.y;
    want = cur + Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
    bal.rotation.y = cur + (want - cur) * Math.min(1, (1 / 60) * 12);
  }
  if (v.spin) v.spin.visible = st.spec !== "ballista" && st.spec !== "firepot";
  if (st.spec && v.root.visible)
    towerIdle(ents.fx, st.spec, e.transform.pos.x, e.transform.y, e.transform.pos.z, e.transform.facing, 1 / 60);
  const fired = w.time - st.lastFireAt;
  if (v.spin) {
    if (st.type === "damage") {
      v.spin.rotation.y = time * 1.5;
      v.spin.userData.baseY ??= v.spin.position.y;
      v.spin.position.y = v.spin.userData.baseY + Math.sin(time * 2.2) * 0.12;
      v.spin.scale.setScalar(fired < 0.2 ? 1.5 : 1);
    } else if (st.type === "control") v.spin.rotation.y = time * (fired < 0.4 ? 8 : 1.2);
    else if (st.type === "support") {
      v.spin.userData.baseY ??= v.spin.position.y;
      v.spin.position.y = v.spin.userData.baseY + Math.sin(time * 2) * 0.15;
      v.spin.rotation.y = time;
    } else if (st.type === "foundry") v.spin.rotation.z = time * 3;
    else if (st.type === "range" || st.type === "outpost") v.spin.rotation.y = Math.sin(time * 2) * 0.3;
    else if (st.type === "barracks") v.spin.rotation.y = Math.sin(time * 2) * 0.3;
  }
  if (st.ready && (st.type === "damage" || st.type === "control" || st.type === "support")) {
    const key = e.id;
    const ring = ents.rings.get(key);
    const want = Math.round(st.range * 100);
    if (!ring || ring.userData.r !== want) {
      if (ring) {
        ents.root.remove(ring);
        ring.geometry.dispose();
      }
      const r = rangeRing(ents, e);
      r.userData.r = want;
      ents.rings.set(key, r);
      ents.root.add(r);
    }
  }
}
/**
 * Pad rings glow and the build/upgrade/shop hint sprites appear for local human heroes standing on a pad they
 * can use (hidden while that player has a menu open or hints are off).
 */
export function syncPads(ents: EntityViews, time: number): void {
  const w = ents.world;
  const heroes = w.entities.filter((e) => e.hero && e.alive);
  w.pads.forEach((p, i) => {
    const mat = ents.padMarkers[i];
    let near: Entity | undefined;
    for (const h of heroes) {
      if (padNear(w, h) === p) near = h;
    }
    const st = p.structureId ? w.get(p.structureId) : undefined;
    const buildable =
      near &&
      (!st
        ? p.zone === "neutral" || p.side === near.team
        : st.team === near.team && (st.structure!.level < 2 || canSpec(ents.world, st)));
    if (buildable && near) {
      mat.color.copy(ents.teamColors[near.team]).lerp(WHITE, 0.4);
      mat.opacity = 0.55 + Math.sin(time * 8) * 0.3;
    } else if (!st && p.zone === "neutral") {
      mat.color.set(0xffd060);
      mat.opacity = 0.25;
    } else if (!st) {
      mat.color.copy(ents.teamColors[p.side] ?? WHITE);
      mat.opacity = 0.35;
    } else {
      mat.opacity = 0;
    }
    if (mat.opacity <= 0.01) mat.opacity = 0;
    const hint = ents.padHints[i];
    const human = !!near && !!ents.humans[near.hero!.player];
    hint.visible = ents.hints && !!buildable && human && !ents.menus[near!.hero!.player];
    if (hint.visible) {
      const up = !!st;
      hint.material = up ? HINTS.upgrade : HINTS.build;
      const s = 1 + Math.sin(time * 3) * 0.04;
      const k = 1.15 * s;
      hint.scale.set(up ? k : k * 2, k, 1);
      hint.userData.base = [up ? k : k * 2, k];
      hint.position.set(p.x, w.groundY(p.x, p.z) + (up ? 0 : 0.5), p.z);
      if (up) hint.center.set(1 + 1.1 / 1.15, 0.5 + 0.5 / 1.15);
      else hint.center.set(0.5, 0.5);
      hint.userData.anchor = hint.position.clone();
      hint.userData.center = [hint.center.x, hint.center.y];
    }
  });
  ents.shopHints.forEach((hint, team) => {
    const core = w.core(team);
    const shopper = heroes.find(
      (h) =>
        h.team === team &&
        ents.humans[h.hero!.player] &&
        !ents.menus[h.hero!.player] &&
        w.arena.inShop(h) &&
        !padNear(w, h),
    );
    hint.visible = ents.hints && !!core && !!shopper;
    if (!hint.visible || !core) return;
    const s = 1 + Math.sin(time * 3) * 0.03;
    hint.position.set(core.transform.pos.x, core.transform.y, core.transform.pos.z);
    hint.center.set(1 + 1.45 / 1.25, 0.5 + 0.88 / 1.25);
    hint.scale.set(1.25 * s, 1.25 * s, 1);
    hint.userData.base = [1.25 * s, 1.25 * s];
    hint.userData.anchor = hint.position.clone();
    hint.userData.center = [hint.center.x, hint.center.y];
  });
}
