// Mother Kelp, the Wreck Witch: Tide Rising (passive stacks from fighting near enemy champions: +damage, +size),
// the held-A anchor whirl, Dredge (B: anchor on a chain, reels in the first enemy it catches), Bilge (R:
// brine cloud, no healing inside), Davy's Grip (Z: drowned hands root everyone around her, damage scales with
// stacks) and the chain swing dodge (L+X next to a structure or tree: an arc around it).
import { Kind } from "../terrain.ts";
import type { World } from "../world.ts";
import type { AbilityDef } from "../config.ts";
import type { Command, Entity, HeroAction } from "../types.ts";
import { abilities } from "../talents.ts";
import { arcHit } from "./strikes.ts";
import { aimFor, aimTarget, callout } from "./common.ts";

const fx = (
  w: World,
  name: string,
  src: number,
  team: number,
  x: number,
  y: number,
  z: number,
  extra: { radius?: number; tx?: number; tz?: number; seconds?: number; id?: number } = {},
) => w.emit({ type: "heroFx", name, src, team, x, y, z, ...extra });

/** Current Tide Rising stacks (0 for anyone else). */
export function tideOf(e: Entity): number {
  return e.hero?.tide ?? 0;
}

/** Damage multiplier from Tide Rising stacks (1 without stacks). */
export function tideMul(w: World, e: Entity): number {
  const n = e.hero?.tide;
  if (!n) return 1;
  return 1 + n * (w.heroDef(e.hero!.type).hooks.tidePer ?? 0.03);
}

/** Damage taken multiplier from Tide Rising stacks (she swells and hardens as the tide comes in). */
export function tideArmor(w: World, e: Entity): number {
  const n = e.hero?.tide;
  if (!n) return 1;
  return 1 - n * (w.heroDef(e.hero!.type).hooks.tideArmor ?? 0);
}

/** Fraction of damage dealt she drinks back as health at her current Tide Rising stacks. */
export function tideLeech(w: World, e: Entity): number {
  return (e.hero?.tide ?? 0) * (w.heroDef(e.hero!.type).hooks.tideLeech ?? 0);
}

function addTide(w: World, e: Entity, n: number): void {
  const h = e.hero!;
  const max = w.heroDef(h.type).hooks.tideMax ?? 10;
  const before = h.tide ?? 0;
  h.tide = Math.min(max, before + n);
  if (h.tide === before) return;
  const t = e.transform;
  fx(w, "tide", e.id, e.team, t.pos.x, t.y, t.pos.z, { radius: h.tide });
  if (h.tide === max && before < max) callout(w, e, "HIGH TIDE!");
}

/**
 * Passive, every tick: each second spent within tideRadius of a living enemy champion adds a stack (max tideMax);
 * tideDrain seconds out of reach and the stacks ebb away one every half second.
 */
export function tideTick(w: World, e: Entity): void {
  const h = e.hero!;
  const hk = w.heroDef(h.type).hooks;
  const r = hk.tideRadius ?? 6;
  let near = false;
  for (const o of w.entities) {
    if (!o.alive || !o.hero || o.hero.dead || o.team === e.team) continue;
    if (w.dist(e, o) <= r) {
      near = true;
      break;
    }
  }
  if (near) {
    h.tideNearAt = w.time;
    h.tideEbbAt = undefined;
    h.tideT = (h.tideT ?? 0) + w.dt;
    if (h.tideT >= 1) {
      h.tideT -= 1;
      addTide(w, e, 1);
    }
    return;
  }
  h.tideT = 0;
  if (!h.tide || w.time - (h.tideNearAt ?? -99) < (hk.tideDrain ?? 4)) return;
  h.tideEbbAt ??= w.time;
  if (w.time - h.tideEbbAt >= 0.5) {
    h.tideEbbAt = w.time;
    h.tide = Math.max(0, h.tide - 1);
    const t = e.transform;
    fx(w, "tide", e.id, e.team, t.pos.x, t.y, t.pos.z, { radius: h.tide });
  }
}

/** Barnacle Crust talent: a swing that lands on a champion grows the tide (once a second). */
export function tideOnHit(w: World, e: Entity, targets: Entity[]): void {
  const n = abilities(w, e).a.fx?.tideOnHit;
  const h = e.hero!;
  if (!n || !targets.some((o) => o.hero) || w.time < (h.tideHitAt ?? -99) + 1) return;
  h.tideHitAt = w.time;
  addTide(w, e, n);
}

/** Whirling: A held past the tap threshold (she spins the anchor around her at charge speed). */
export function whirling(w: World, e: Entity): boolean {
  const h = e.hero!;
  return !!w.heroDef(h.type).hooks.whirlDamage && h.charging === "a" && (h.chargeT ?? 0) > 0.15 && !h.action;
}

/** Held A: every whirlEvery seconds the anchor sweeps 360 degrees around her (Maelstrom: wider, harder, pulls). */
export function whirlTick(w: World, e: Entity): void {
  const h = e.hero!;
  const hk = w.heroDef(h.type).hooks;
  if (!whirling(w, e) || (h.chargeT ?? 0) > (hk.whirlMax ?? 3)) return;
  const every = hk.whirlEvery ?? 0.35;
  const k = Math.floor((h.chargeT! - 0.15) / every);
  if (k === h.whirlN) return;
  h.whirlN = k;
  const m = abilities(w, e).a.fx?.maelstrom;
  const t = e.transform;
  const range = (hk.whirlRange ?? 2.9) + (m?.range ?? 0);
  const dmg = (hk.whirlDamage ?? 22) * (m?.mul ?? 1) * w.damageMulOf(e);
  if (m?.pull) {
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.structure || o.neutral) continue;
      if (w.time < o.status.ccImmuneUntil) continue;
      const dx = t.pos.x - o.transform.pos.x;
      const dz = t.pos.z - o.transform.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.4 || d - o.radius > range + 1.5) continue;
      o.status.kvx += (dx / d) * m.pull;
      o.status.kvz += (dz / d) * m.pull;
    }
  }
  const targets = arcHit(w, e, Math.sin(t.facing), Math.cos(t.facing), range, 360, dmg, m?.pull ? 0 : 3, false);
  tideOnHit(w, e, targets);
  fx(w, "whirl", e.id, e.team, t.pos.x, t.y, t.pos.z, { radius: range });
}

/** B: hurl the anchor down the aim line; the first enemy it catches is reeled in to her feet. */
export function fireDredge(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const reach = def.range ?? 9;
  const width = def.width ?? 0.9;
  let len = reach;
  for (let s = 0.5; s <= reach; s += 0.5) {
    if (w.losHeight(t.pos.x + a.dirX * s, t.pos.z + a.dirZ * s) > t.y + 2.2) {
      len = s;
      break;
    }
  }
  let best: Entity | null = null;
  let bestD = len;
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team || o.neutral || o.structure) continue;
    if (o.hero?.dead) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const along = dx * a.dirX + dz * a.dirZ;
    if (along < 0 || along - o.radius > len) continue;
    if (Math.abs(dx * a.dirZ - dz * a.dirX) > width + o.radius || Math.abs(o.transform.y - t.y) > 3) continue;
    // Champions are what the chain is for: a soldier only catches it if it's clearly in front of them.
    const score = along - (o.hero ? 1.5 : 0);
    if (score < bestD) {
      bestD = score;
      best = o;
    }
  }
  const dist = best ? Math.max(0.8, w.dist(e, best)) : len;
  const flight = 0.08 + dist * (def.speed ? 1 / def.speed : 0.022);
  const tx = best ? best.transform.pos.x : t.pos.x + a.dirX * len;
  const tz = best ? best.transform.pos.z : t.pos.z + a.dirZ * len;
  fx(w, best ? "dredge" : "dredgeMiss", e.id, e.team, t.pos.x, t.y, t.pos.z, {
    tx,
    tz,
    seconds: flight,
    id: best?.id,
  });
  if (!best) return;
  const o = best;
  w.later(flight, () => dredgeCatch(w, e, o, def, mul));
}

/** Hauling speed of the Dredge reel (m/s): a full 9 m chain comes in in under half a second. */
const REEL_SPEED = 22;

/**
 * Reel the catch in along the chain to land 1.6 m in front of her, dragged a tick at a time (walls stop it) and
 * held stunned the whole way. She turns to face them. Emits "dredgeReel" so the anchor stays latched on them.
 */
function reel(
  w: World,
  e: Entity,
  o: Entity,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { x: number; z: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const l = Math.hypot(dx, dz) || 1;
  let lx = ax + (dx / l) * 1.6;
  let lz = az + (dz / l) * 1.6;
  const i = w.nav.nearestOpen(lx, lz, 2);
  if (i >= 0) {
    lx = (i % w.nav.w) + 0.5;
    lz = Math.floor(i / w.nav.w) + 0.5;
  }
  const dist = Math.hypot(lx - bx, lz - bz);
  if (dist < 0.3) return { x: bx, z: bz };
  const secs = Math.min(0.45, Math.max(0.15, dist / REEL_SPEED));
  const n = Math.max(1, Math.round(secs / w.dt));
  o.status.stunUntil = Math.max(o.status.stunUntil, w.time + secs + 0.1);
  e.transform.facing = e.transform.prevFacing = Math.atan2(dx, dz);
  for (let k = 1; k <= n; k++)
    w.later(k * w.dt, () => {
      if (!o.alive || o.hero?.dead || o.hero?.jump) return;
      const left = n - k + 1;
      w.moveBy(o, (lx - o.transform.pos.x) / left, (lz - o.transform.pos.z) / left);
    });
  fx(w, "dredgeReel", e.id, e.team, bx, o.transform.y, bz, { tx: lx, tz: lz, id: o.id, seconds: secs });
  return { x: lx, z: lz };
}

function dredgeCatch(w: World, e: Entity, o: Entity, def: AbilityDef, mul: number): void {
  if (!e.alive || e.hero!.dead || !o.alive || o.hero?.dead || o.hero?.jump || e.hero!.jump) return;
  const ab = abilities(w, e).b;
  const st = o.status;
  const held = (w.time < st.slowUntil && st.slowMul < 1) || w.time < st.stunUntil;
  const hit = w.damage(e, o, (def.damage ?? 50) * mul, {
    fromX: e.transform.pos.x,
    fromZ: e.transform.pos.z,
    knockback: 0,
    slowMul: def.slowMul ?? 0.6,
    slowSeconds: def.slowSeconds ?? 1.5,
    stun: ab.fx?.dredgeStun ?? def.stunSeconds,
    big: true,
  });
  if (!hit || !o.alive) return;
  const ax = e.transform.pos.x;
  const az = e.transform.pos.z;
  const bx = o.transform.pos.x;
  const bz = o.transform.pos.z;
  const canReel =
    w.time >= st.ccImmuneUntil &&
    !w.mapEvents.sealed(ax, az, bx, bz) &&
    Number.isFinite(w.terrain.heightAt(bx, bz)) &&
    Number.isFinite(w.terrain.heightAt(ax, az));
  const land = canReel ? reel(w, e, o, ax, az, bx, bz) : { x: bx, z: bz };
  if (ab.fx?.tideOnCatch && o.hero) addTide(w, e, ab.fx.tideOnCatch);
  if (ab.fx?.dredgeNoHeal) st.noHealUntil = Math.max(st.noHealUntil ?? 0, w.time + ab.fx.dredgeNoHeal);
  if (ab.fx?.zoneAfter) {
    const z = ab.fx.zoneAfter;
    w.zones.push({
      id: w.newId(),
      team: e.team,
      ownerId: e.id,
      x: land.x,
      z: land.z,
      radius: z.radius ?? 2.2,
      until: w.time + z.seconds,
      dps: z.dps * w.damageMulOf(e),
      slowMul: z.slowMul,
      style: "bilge",
      noHeal: 3,
    });
  }
  // Undertow (team synergy): dragging a foe a partner already slowed or rooted feeds the tide.
  if (held && o.hero) {
    const bonus = synergyStacks(w, e);
    if (bonus > 0) {
      addTide(w, e, bonus);
      callout(w, e, "UNDERTOW!");
    }
  }
}

/** Extra Tide stacks for a Dredge on a held foe, from the partner's class (heroes.json synergy.dredgeStack). */
function synergyStacks(w: World, e: Entity): number {
  const tbl = w.heroDef(e.hero!.type).synergy?.dredgeStack;
  if (!tbl) return 0;
  let best = 0;
  for (const o of w.entities) {
    if (o === e || !o.hero || o.team !== e.team) continue;
    const cls = w.heroDef(o.hero.type).class;
    if (cls) best = Math.max(best, tbl[cls] ?? 0);
  }
  return best;
}

/** R: spit a cloud of brine ahead (or on the placed point / auto target): damage, slow, no healing inside. */
export function fireBilge(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const range = def.range ?? 5;
  const r = def.radius ?? 3;
  let x: number;
  let z: number;
  if (a.placed && a.toX !== undefined) {
    x = a.toX;
    z = a.toZ!;
  } else {
    const tg = aimFor(w, e, a, range + 1);
    const d = tg ? Math.min(range, Math.max(1.5, w.dist(e, tg))) : range * 0.7;
    x = t.pos.x + a.dirX * d;
    z = t.pos.z + a.dirZ * d;
  }
  x = Math.max(1, Math.min(w.terrain.width - 1, x));
  z = Math.max(1, Math.min(w.terrain.depth - 1, z));
  const noHeal = def.seconds ?? 3;
  const linger = def.delay ?? 3;
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.structure || o.neutral) continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > r) continue;
    o.status.noHealUntil = Math.max(o.status.noHealUntil ?? 0, w.time + noHeal);
    w.damage(e, o, (def.damage ?? 35) * mul, {
      fromX: t.pos.x,
      fromZ: t.pos.z,
      knockback: def.stunSeconds ? 0 : 2,
      stun: def.stunSeconds,
    });
  }
  w.zones.push({
    id: w.newId(),
    team: e.team,
    ownerId: e.id,
    x,
    z,
    radius: r,
    until: w.time + linger,
    dps: (def.dps ?? 10) * mul,
    slowMul: def.slowMul ?? 0.75,
    style: "bilge",
    noHeal,
    vuln: def.vulnMul,
  });
  fx(w, "bilge", e.id, e.team, x, w.groundY(x, z), z, { radius: r, seconds: linger, tx: t.pos.x, tz: t.pos.z });
}

/** Z: drowned hands burst up in a ring around her: everyone inside is rooted; damage grows with Tide Rising. */
export function fireDavyGrip(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const r = def.radius ?? 6;
  const n = tideOf(e);
  const dmg = ((def.damage ?? 70) + n * (def.stackDamage ?? 10)) * mul;
  const root = def.rootSeconds ?? 1.5;
  fx(w, "davygrip", e.id, e.team, t.pos.x, t.y, t.pos.z, { radius: r, seconds: root, id: n });
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team || o.neutral) continue;
    if (Math.hypot(o.transform.pos.x - t.pos.x, o.transform.pos.z - t.pos.z) - o.radius > r) continue;
    const hit = w.damage(e, o, o.structure ? dmg * 0.5 : dmg, {
      fromX: t.pos.x,
      fromZ: t.pos.z,
      knockback: 0,
      slowMul: o.structure ? undefined : 0,
      slowSeconds: o.structure ? undefined : root,
      big: true,
    });
    if (hit && !o.structure)
      fx(w, "grab", e.id, e.team, o.transform.pos.x, o.transform.y, o.transform.pos.z, { seconds: root, id: o.id });
  }
}

type Pivot = { x: number; z: number; r: number };

/** Map props tall enough to hook even when they're walk-through decoration (posts, trunks, pillars). */
const HOOKABLE_PROPS = new Set([
  "tree",
  "pine",
  "appletree",
  "deadtree",
  "yew",
  "column",
  "spire",
  "statue",
  "obelisk",
  "torch",
  "banner",
  "brokenpillar",
  "angel",
  "cactus",
  "topiary",
]);

/**
 * Everything the chain swing could hook within reach, nearest first:
 *   - buildings (any side's, and neutral ones)
 *   - map props: every solid one (trees, rocks, towers, statues, carts...) and the tall walk-through ones above
 *   - lookout towers (Hoot's)
 *   - wall cells: map walls and hero walls (stone walls, palisades, snow forts) - the nearest cell per 45-degree
 *     sector, so a long wall offers a few distinct choices rather than dozens.
 * Not cliffs, slopes or water: there's nothing standing up to wrap a chain round.
 */
export function swingPivots(w: World, e: Entity, reach = w.heroDef(e.hero!.type).hooks.swingReach ?? 0): Pivot[] {
  const p = e.transform.pos;
  const tr = w.terrain;
  const out: (Pivot & { d: number })[] = [];
  const add = (x: number, z: number, r: number) => {
    const d = Math.hypot(x - p.x, z - p.z) - r;
    if (d < reach && !out.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 0.3)) out.push({ x, z, r, d });
  };
  for (const o of w.entities) if (o.alive && o.structure) add(o.transform.pos.x, o.transform.pos.z, o.radius);
  for (const m of w.mods)
    if (m.style === "lookout" && m.until > w.time && m.cx !== undefined) {
      const xs = m.cells.map((c) => c % tr.width);
      add(m.cx, m.cz!, (Math.max(...xs) - Math.min(...xs) + 1) / 2);
    }
  for (const q of tr.props) if (q.solid || HOOKABLE_PROPS.has(q.type)) add(q.x, q.z, q.solid ? 0.5 : 0.35);
  const sector: ((Pivot & { d: number }) | undefined)[] = new Array(8);
  const cx = Math.floor(p.x);
  const cz = Math.floor(p.z);
  const R = Math.ceil(reach);
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      const i = tr.index(x, z);
      if (i < 0 || tr.kinds[i] !== Kind.Wall) continue;
      const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) - 0.5;
      if (d >= reach || out.some((q) => Math.hypot(q.x - x - 0.5, q.z - z - 0.5) < q.r + 0.8)) continue;
      const k = (Math.round(Math.atan2(z + 0.5 - p.z, x + 0.5 - p.x) / (Math.PI / 4)) + 8) % 8;
      if (!sector[k] || d < sector[k]!.d) sector[k] = { x: x + 0.5, z: z + 0.5, r: 0.5, d };
    }
  }
  for (const c of sector) if (c) out.push(c);
  return out.sort((a, b) => a.d - b.d).map(({ x, z, r }) => ({ x, z, r }));
}

/** The pivot at (or nearest to) a requested point, among those in reach; the nearest one with no request. */
function swingPivot(w: World, e: Entity, at?: { x: number; z: number }): Pivot | null {
  const all = swingPivots(w, e);
  if (!all.length) return null;
  if (!at) return all[0];
  return all.reduce((b, q) => (Math.hypot(q.x - at.x, q.z - at.z) < Math.hypot(b.x - at.x, b.z - at.z) ? q : b));
}

/**
 * Where a chain swing would go right now (pivot it hooks, landing spot, arc), or null when she'd just roll.
 * Pure - the renderer calls it every frame for the swing indicator; startChainSwing commits it.
 */
export function chainSwingPlan(
  w: World,
  e: Entity,
  moveX: number,
  moveZ: number,
  at?: { x: number; z: number },
): {
  pv: { x: number; z: number; r: number };
  x: number;
  z: number;
  rr: number;
  base: number;
  deg: number;
  sign: number;
  sx: number;
  sz: number;
} | null {
  const hk = w.heroDef(e.hero!.type).hooks;
  if (!hk.swingReach) return null;
  const pv = swingPivot(w, e, at);
  if (!pv) return null;
  const t = e.transform;
  const rx = t.pos.x - pv.x;
  const rz = t.pos.z - pv.z;
  const rl = Math.hypot(rx, rz) || 1;
  const rad = Math.max(rl, pv.r + 1.4) + 0.3;
  const mag = Math.hypot(moveX, moveZ);
  const sx = mag > 0.2 ? moveX / mag : Math.sin(t.facing);
  const sz = mag > 0.2 ? moveZ / mag : Math.cos(t.facing);
  const pref = rx * sz - rz * sx >= 0 ? 1 : -1;
  const base = Math.atan2(rz, rx);
  // The stick's way round first; if nothing lands that way, the other way round.
  for (const sign of [pref, -pref])
    for (const [deg, rr] of [
      [150, rad],
      [120, rad],
      [150, rad + 0.8],
      [175, rad],
      [95, rad],
      [120, rad + 0.8],
    ]) {
      const ang = base + sign * ((deg * Math.PI) / 180);
      const x = pv.x + Math.cos(ang) * rr;
      const z = pv.z + Math.sin(ang) * rr;
      if (
        !Number.isFinite(w.terrain.heightAt(x, z)) ||
        !w.nav.open(w.nav.index(Math.floor(x), Math.floor(z))) ||
        w.mapEvents.sealed(t.pos.x, t.pos.z, x, z)
      )
        continue;
      return { pv, x, z, rr, base, deg, sign, sx, sz };
    }
  return null;
}

/**
 * Held dodge (cmd.swing names the pivot picked while holding; a tap is a plain roll): she hooks the anchor round
 * that structure or tree and swings in an arc to its far side, in the direction of the stick. Returns false (plain
 * dodge) with no swing asked for, nothing to hook or nowhere to land.
 */
export function startChainSwing(w: World, e: Entity, cmd: Command): boolean {
  if (!cmd.swing) return false;
  if (sameAsLast(w, e, cmd.swing)) return false;
  const hk = w.heroDef(e.hero!.type).hooks;
  const plan = chainSwingPlan(w, e, cmd.moveX, cmd.moveZ, cmd.swing);
  if (!plan) return false;
  const { pv, x, z, rr, base, deg, sign, sx, sz } = plan;
  if (sameAsLast(w, e, pv)) return false;
  e.hero!.swingFrom = { x: pv.x, z: pv.z };
  const t = e.transform;
  const h = e.hero!;
  const dur = hk.swingSeconds ?? 0.5;
  const a: HeroAction = {
    name: "dodge",
    kind: "chainswing",
    dur,
    hitAt: 99,
    combo: sign,
    t: 0,
    fired: false,
    dirX: sx,
    dirZ: sz,
    fromX: pv.x,
    fromZ: pv.z,
    toX: x,
    toZ: z,
    fromX2: base,
    fromZ2: (deg * Math.PI) / 180,
    chargeRange: rr,
  };
  a.hitIds = [];
  h.action = a;
  h.blocking = false;
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + dur);
  // Chaining: another swing within swingChainWindow s of landing continues the chain (up to swingChain swings);
  // a fresh swing or a full chain puts the dodge on its normal cooldown.
  const max = hk.swingChain ?? 5;
  h.swingChain = w.time <= (h.swingChainUntil ?? -1) ? (h.swingChain ?? 0) + 1 : 1;
  h.swingChainUntil = h.swingChain < max ? w.time + dur + (hk.swingChainWindow ?? 0.9) : -1;
  // A full chain rests the dodge longer (swingChainCooldown) so she can't swing laps of the map non-stop.
  h.cooldowns.dodge =
    w.time + dur + (h.swingChain >= max ? (hk.swingChainCooldown ?? 4) : w.data.heroes.baseline.dodgeCooldown + 0.3);
  callout(w, e, h.swingChain > 1 ? `CHAIN SWING x${h.swingChain}` : "CHAIN SWING");
  fx(w, "chainSwing", e.id, e.team, t.pos.x, t.y, t.pos.z, { tx: pv.x, tz: pv.z, seconds: dur, radius: rr });
  return true;
}

/** Per tick of the chain swing: follow the arc around the pivot, settle on the landing spot at the end. */
export function chainSwingTick(w: World, e: Entity, a: HeroAction): void {
  const t = e.transform;
  const f = Math.min(1, a.t / a.dur);
  const ease = f * f * (3 - 2 * f);
  const ang = a.fromX2! + a.combo * a.fromZ2! * ease;
  const x = a.fromX! + Math.cos(ang) * a.chargeRange!;
  const z = a.fromZ! + Math.sin(ang) * a.chargeRange!;
  const nx = Math.max(1, Math.min(w.terrain.width - 1, x));
  const nz = Math.max(1, Math.min(w.terrain.depth - 1, z));
  const fdx = nx - t.pos.x;
  const fdz = nz - t.pos.z;
  if (Math.hypot(fdx, fdz) > 1e-4) t.facing = Math.atan2(fdx, fdz);
  t.pos.x = nx;
  t.pos.z = nz;
  const gy = w.groundY(nx, nz);
  if (Number.isFinite(gy)) t.y = gy;
  // Whack whoever she swings into (once each per swing), knocked out along her path.
  const hk = w.heroDef(e.hero!.type).hooks;
  if (hk.swingDamage) {
    const hit = (a.hitIds ??= []);
    for (const o of w.enemiesNear(e, 1.3, (q) => !!q.hero || !!q.unit)) {
      if (hit.includes(o.id)) continue;
      hit.push(o.id);
      w.damage(e, o, hk.swingDamage * w.damageMulOf(e), {
        fromX: t.pos.x - fdx,
        fromZ: t.pos.z - fdz,
        knockback: hk.swingKnockback ?? 7,
        big: true,
      });
    }
  }
  if (a.t + w.dt >= a.dur) {
    const tx = a.toX!;
    const tz = a.toZ!;
    t.pos.x = tx;
    t.pos.z = tz;
    t.y = w.groundY(tx, tz);
  }
}

/** Mid-chain, the anchor she just swung round (it can't be hooked again straight away). */
export function sameAsLast(w: World, e: Entity, q: { x: number; z: number }): boolean {
  const h = e.hero!;
  const last = h.swingFrom;
  return !!last && w.time <= (h.swingChainUntil ?? -1) && Math.hypot(last.x - q.x, last.z - q.z) < 0.6;
}
