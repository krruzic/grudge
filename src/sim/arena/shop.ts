// Keep shop (core radius or the team banner): buy a core ward patch, a bomb to plant/throw at enemy structures, or
// a cannon strike (aimed via hero.aim). Thrown bombs stick to a structure near where they land.
import type { Arena } from "../arena.ts";
import type { Entity, ShopItem, Vec2 } from "../types.ts";
import type { ThrownBomb } from "../arena.ts";

/** Within shop radius of the own core, or inside the team banner. */
export function inShop(arena: Arena, e: Entity): boolean {
  const core = arena.w.core(e.team);
  if (core && arena.w.dist(e, core) <= core.radius + arena.w.data.match.arena.shop.radius) return true;
  return arena.w.inBanner(e);
}

/** Buy a shop item (prices scale with sudden death). A cannon without aimAt enters aiming mode (hero.aim). */
export function buy(arena: Arena, hero: Entity, item: ShopItem, aimAt?: Vec2): boolean {
  const w = arena.w;
  const team = hero.team;
  const ts = w.teams[team];
  const sh = w.data.match.arena.shop;
  const h = hero.hero!;
  if (!arena.inShop(hero)) {
    w.emit({ type: "notice", team, text: "SHOP IS AT YOUR KEEP" });
    return false;
  }
  const pay = (cost: number) => {
    const c = Math.round(cost * w.costMul());
    if (ts.resource < c) {
      w.emit({ type: "notice", team, text: `NEED ${c}` });
      return false;
    }
    ts.resource -= c;
    return true;
  };
  if (item === "bomb") {
    if (h.bomb) {
      w.emit({ type: "notice", team, text: "ALREADY CARRYING A BOMB" });
      return false;
    }
    const ts = w.teams[team];
    if (w.time < (ts.bombReadyAt ?? 0)) {
      w.emit({ type: "notice", team, text: `NEXT BOMB IN ${Math.ceil((ts.bombReadyAt ?? 0) - w.time)}` });
      return false;
    }
    if (!pay(sh.bomb.cost)) return false;
    ts.bombReadyAt = w.time + (sh.bomb.cooldown ?? 20);
    h.bomb = true;
    w.emit({ type: "notice", team, text: "BOMB! TOUCH AN ENEMY TOWER" });
    return true;
  }
  if (item === "ward") {
    const core = w.core(team)!;
    const st = core.structure!;
    if (w.isSudden()) {
      w.emit({ type: "notice", team, text: "NO SHIELDS IN SUDDEN DEATH" });
      return false;
    }
    if (w.time < ts.wardReadyAt) {
      w.emit({ type: "notice", team, text: `SHIELD READY IN ${Math.ceil(ts.wardReadyAt - w.time)}` });
      return false;
    }
    if ((st.ward ?? 0) >= w.wardMax) {
      w.emit({ type: "notice", team, text: "SHIELD IS FULL" });
      return false;
    }
    if (!pay(sh.ward.cost)) return false;
    st.ward = Math.min(w.wardMax, (st.ward ?? 0) + w.wardMax * (sh.ward.buyFraction ?? 1));
    st.shielded = true;
    ts.wardReadyAt = w.time + sh.ward.cooldown;
    w.emit({ type: "pulse", x: core.transform.pos.x, y: core.transform.y, z: core.transform.pos.z, radius: 4, team });
    w.emit({ type: "notice", team, text: "SHIELD PATCHED" });
    return true;
  }
  const cost = Math.round(sh.cannon.cost * w.costMul());
  if (ts.resource < cost) {
    w.emit({ type: "notice", team, text: `NEED ${cost}` });
    return false;
  }
  if (aimAt) return arena.fireStrike(hero, aimAt.x, aimAt.z);
  const f = hero.transform.facing;
  h.aim = {
    x: hero.transform.pos.x + Math.sin(f) * 8,
    z: hero.transform.pos.z + Math.cos(f) * 8,
    until: w.time + sh.cannon.aimSeconds,
  };
  return true;
}

/** Bought cannon strike: `shots` telegraphed impacts scattered around (x, z) (consumes World.rng). */
export function fireStrike(arena: Arena, hero: Entity, x: number, z: number): boolean {
  const w = arena.w;
  const sh = w.data.match.arena.shop.cannon;
  const ts = w.teams[hero.team];
  const cost = Math.round(sh.cost * w.costMul());
  if (ts.resource < cost) {
    w.emit({ type: "notice", team: hero.team, text: `NEED ${cost}` });
    return false;
  }
  ts.resource -= cost;
  const warn = w.data.match.arena.cannon.warnSeconds;
  for (let i = 0; i < sh.shots; i++) {
    const a = (i / sh.shots) * Math.PI * 2 + w.rng();
    const r = i === 0 ? 0 : sh.spread * (0.5 + w.rng() * 0.5);
    const p = arena.snap(
      Math.max(1, Math.min(w.terrain.width - 1, x + Math.cos(a) * r)),
      Math.max(1, Math.min(w.terrain.depth - 1, z + Math.sin(a) * r)),
    );
    const at = w.time + warn + i * 0.3;
    const shot = { x: p.x, z: p.z, y: w.groundY(p.x, p.z), at, warnAt: w.time, radius: sh.radius, team: hero.team };
    arena.shots.push(shot);
    w.emit({ type: "cannonWarn", x: shot.x, y: shot.y, z: shot.z, radius: shot.radius, seconds: at - w.time });
  }
  w.emit({ type: "notice", team: -1, text: `P${hero.hero!.player + 1} CALLS CANNON FIRE!` });
  return true;
}

export function throwBomb(arena: Arena, e: Entity, tx: number, tz: number): void {
  const w = arena.w;
  const sh = w.data.match.arena.shop.bomb;
  if (!e.hero?.bomb) return;
  e.hero.bomb = false;
  const p = e.transform.pos;
  const x = Math.max(1, Math.min(w.terrain.width - 1, tx));
  const z = Math.max(1, Math.min(w.terrain.depth - 1, tz));
  arena.thrown.push({
    fromX: p.x,
    fromZ: p.z,
    fromY: e.transform.y + 2.2,
    toX: x,
    toZ: z,
    toY: w.groundY(x, z),
    start: w.time,
    dur: sh.throwSeconds,
    ownerId: e.id,
    team: e.team,
  });
  w.emit({ type: "shot", style: "throw", x: p.x, y: e.transform.y + 2, z: p.z });
}

/** A thrown bomb lands: stick to the nearest enemy structure within stickReach (short fuse) or sit on the ground. */
function landBomb(arena: Arena, b: ThrownBomb): void {
  const w = arena.w;
  const sh = w.data.match.arena.shop.bomb;
  let target: Entity | undefined;
  let best = Infinity;
  for (const o of w.entities) {
    if (!o.alive || !o.structure || o.team === b.team || o.neutral || o.structure.siege) continue;
    const d = Math.hypot(o.transform.pos.x - b.toX, o.transform.pos.z - b.toZ) - o.radius;
    if (d <= sh.stickReach && d < best) {
      best = d;
      target = o;
    }
  }
  let x = b.toX;
  let z = b.toZ;
  if (target) {
    const dx = b.toX - target.transform.pos.x;
    const dz = b.toZ - target.transform.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    x = target.transform.pos.x + (dx / dl) * (target.radius + 0.2);
    z = target.transform.pos.z + (dz / dl) * (target.radius + 0.2);
  } else if (!Number.isFinite(w.terrain.heightAt(x, z))) {
    const p = arena.snap(x, z);
    x = p.x;
    z = p.z;
  }
  const fuse = target ? sh.fuse : sh.groundFuse;
  arena.bombs.push({
    x,
    z,
    y: w.groundY(x, z),
    targetId: target?.id ?? 0,
    ownerId: b.ownerId,
    team: b.team,
    at: w.time + fuse,
  });
  w.emit({ type: "bomb", state: "planted", x, y: w.groundY(x, z), z, team: b.team, fuse });
  if (target) w.emit({ type: "notice", team: target.team, text: "BOMB ON YOUR TOWER!" });
}

/** Land thrown bombs, plant carried bombs on touch, and detonate due bombs (structure kill / core damage + splash). */
export function updateBombs(arena: Arena): void {
  const w = arena.w;
  const sh = w.data.match.arena.shop.bomb;
  for (let i = arena.thrown.length - 1; i >= 0; i--) {
    const b = arena.thrown[i];
    if (w.time - b.start < b.dur) continue;
    arena.thrown.splice(i, 1);
    landBomb(arena, b);
  }
  for (const p of w.players) {
    const e = w.get(p.heroId);
    if (!e?.hero?.bomb || !e.alive) continue;
    for (const o of w.entities) {
      if (!o.alive || !o.structure || o.team === e.team || o.neutral || o.structure.siege) continue;
      if (w.dist(e, o) - o.radius - e.radius > sh.plantReach) continue;
      const dx = e.transform.pos.x - o.transform.pos.x;
      const dz = e.transform.pos.z - o.transform.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      const bx = o.transform.pos.x + (dx / dl) * (o.radius + 0.2);
      const bz = o.transform.pos.z + (dz / dl) * (o.radius + 0.2);
      arena.bombs.push({
        x: bx,
        z: bz,
        y: w.groundY(bx, bz),
        targetId: o.id,
        ownerId: e.id,
        team: e.team,
        at: w.time + sh.fuse,
      });
      e.hero.bomb = false;
      w.emit({ type: "bomb", state: "planted", x: bx, y: w.groundY(bx, bz), z: bz, team: e.team, fuse: sh.fuse });
      w.emit({ type: "notice", team: o.team, text: "BOMB ON YOUR TOWER!" });
      break;
    }
  }
  for (let i = arena.bombs.length - 1; i >= 0; i--) {
    const b = arena.bombs[i];
    if (w.time < b.at) continue;
    arena.bombs.splice(i, 1);
    const owner = w.get(b.ownerId) ?? null;
    w.emit({ type: "bomb", state: "boom", x: b.x, y: b.y, z: b.z, team: b.team, fuse: 0 });
    w.emit({ type: "cannonHit", x: b.x, y: b.y, z: b.z, radius: sh.splash + 0.2 });
    const t = b.targetId ? w.get(b.targetId) : undefined;
    if (t?.alive && t.structure) {
      if (t.structure.type === "core") w.damage(owner, t, sh.coreDamage, { big: true, structureDamage: sh.coreDamage });
      else w.damage(owner, t, t.hp + t.maxHp, { big: true, structureDamage: t.hp + t.maxHp });
    }
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === b.team || o === t) continue;
      const d = Math.hypot(o.transform.pos.x - b.x, o.transform.pos.z - b.z) - o.radius;
      if (d > sh.splash) continue;
      if (o.structure) {
        if (!b.targetId) w.damage(owner, o, sh.structureSplash, { big: true, structureDamage: sh.structureSplash });
        continue;
      }
      w.damage(owner, o, sh.splashDamage * (o.unit ? (sh.splashUnitMul ?? 1) : 1), {
        knockback: 9,
        fromX: b.x,
        fromZ: b.z,
        big: true,
        stun: 0.3,
      });
    }
  }
}
