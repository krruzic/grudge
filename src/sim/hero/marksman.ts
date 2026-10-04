// Marksman (Wren): vantage (standing still or on high ground boosts damage and range), long-range arrows that
// prefer heroes and Pip-marked targets, Pip the hawk (B: flies to a target, latches on, pecks, slows, interrupts
// channels; rake while latched blinds), Volley (R: timed arrow waves on an area), Heartseeker (Z: piercing line
// shot with ricochet/mark talents) and Skyshot (dodge while Pip is latched: hop back and fire a guaranteed crit).
// Visual-only "heroFx" events are emitted through the local fx() helper.
import type { World } from "../world.ts";
import type { AbilityDef } from "../config.ts";
import type { Command, Entity, HeroAction } from "../types.ts";
import { abilities, applyBleed, fireMissile, mark, zoneAt } from "../talents.ts";
import { aimTarget } from "./common.ts";

const fx = (
  w: World,
  name: string,
  e: Entity,
  x: number,
  y: number,
  z: number,
  extra: { radius?: number; tx?: number; tz?: number; seconds?: number; id?: number } = {},
) => w.emit({ type: "heroFx", name, src: e.id, team: e.team, x, y, z, ...extra });

export function isMarksman(w: World, e: Entity): boolean {
  return !!e.hero && !!w.heroDef(e.hero.type).hooks.vantageMul;
}

/** Remember where/when the hero last stopped moving (vantage needs vantageStill seconds of standing still). */
export function trackStill(w: World, e: Entity): void {
  const h = e.hero!;
  const p = e.transform.pos;
  if (
    h.stillX === undefined ||
    h.stillZ === undefined ||
    Math.hypot(p.x - h.stillX, p.z - h.stillZ) > 0.25 ||
    h.jump ||
    h.action?.name === "dodge"
  ) {
    h.stillX = p.x;
    h.stillZ = p.z;
    h.stillAt = w.time;
  }
}

/** In vantage: still long enough, or at least vantageHeight above the target. */
export function vantage(w: World, src: Entity, target?: Entity | null): boolean {
  if (!src.hero) return false;
  const hk = w.heroDef(src.hero.type).hooks;
  if (!hk.vantageMul) return false;
  if (w.time - (src.hero.stillAt ?? -99) >= (hk.vantageStill ?? 1)) return true;
  return !!target && src.transform.y - target.transform.y >= (hk.vantageHeight ?? 1);
}

export function vantageMul(w: World, src: Entity, target: Entity): number {
  if (!src.hero) return 1;
  const hk = w.heroDef(src.hero.type).hooks;
  return hk.vantageMul && vantage(w, src, target) ? hk.vantageMul : 1;
}

/** Damage bonus against a Pip-latched target, for Wren or her summons. */
export function pipMarkMul(w: World, src: Entity, target: Entity): number {
  const s = target.status;
  if (s.pipUntil === undefined || w.time >= s.pipUntil) return 1;
  const owner =
    src.id === s.pipOwner ? src : src.owner !== undefined && src.owner === s.pipOwner ? w.getAny(src.owner) : undefined;
  if (!owner?.hero) return 1;
  return abilities(w, owner).b.markMul ?? 1.15;
}

function shoulder(e: Entity): { x: number; y: number; z: number } {
  const t = e.transform;
  return { x: t.pos.x + Math.cos(t.facing) * 0.25, y: t.y + 2.0, z: t.pos.z - Math.sin(t.facing) * 0.25 };
}

/** Break recall, jump-pad wind-up, unfired gravewalk, relic channels and horn captures. Returns true if any. */
function interruptChannels(w: World, o: Entity): boolean {
  const h = o.hero;
  if (!h || !o.alive) return false;
  let any = false;
  if (h.recallAt !== undefined) {
    h.recallAt = undefined;
    w.emit({ type: "notice", team: o.team, text: "RECALL BROKEN" });
    any = true;
  }
  if (h.jump && h.jump.pad >= 0 && w.time < h.jump.start) {
    w.cancelJump(o);
    any = true;
  }
  if (h.action?.kind === "gravewalk" && !h.action.fired) {
    h.action = null;
    any = true;
  }
  const r = w.arena.relic;
  if (
    r.channel > 0 &&
    ((r.state === "carried" && r.carrier === o.id) || (r.state === "shrined" && r.stealer === o.id))
  ) {
    r.channel = 0;
    any = true;
  }
  for (const hn of w.mapEvents.horns) {
    if (
      hn.team === o.team &&
      hn.progress > 0 &&
      Math.hypot(hn.x - o.transform.pos.x, hn.z - o.transform.pos.z) <= 2.8
    ) {
      hn.progress = 0;
      any = true;
    }
  }
  return any;
}

/** Small DoT-flagged Pip hit (no crit/variance), with optional bleed. */
export function peck(w: World, src: Entity, target: Entity): void {
  if (!target.alive || !src.hero) return;
  const b = abilities(w, src).b;
  w.damage(src, target, (b.peck ?? 12) * src.hero.damageMul, {
    tick: true,
    noFlinch: true,
    fromX: target.transform.pos.x,
    fromZ: target.transform.pos.z,
  });
  if (b.fx?.bleed) applyBleed(w, src, target, b.fx.bleed);
  fx(w, "pipPeck", src, target.transform.pos.x, target.transform.y, target.transform.pos.z, { id: target.id });
}

/** Arrow on-hit: cooldown-refund talent vs heroes, and a free peck on Pip's current target. */
export function onArrowHit(w: World, src: Entity, target: Entity): void {
  if (!src.hero) return;
  const af = abilities(w, src).a.fx;
  const h = src.hero;
  if (af?.cdrOnHit && target.hero) {
    const k = af.cdrOnHit.slot;
    h.cooldowns[k] = Math.max(w.time, (h.cooldowns[k] ?? 0) - af.cdrOnHit.seconds);
  }
  const s = target.status;
  if (target.alive && s.pipOwner === src.id && w.time < (s.pipUntil ?? 0)) peck(w, src, target);
}

/** Send Pip at a target; re-launching while latched releases the old target. Pip starts from where it is. */
function launchPip(w: World, e: Entity, target: Entity): void {
  const h = e.hero!;
  const sp = shoulder(e);
  if (h.pip && h.pip.phase === "on") {
    const old = w.getAny(h.pip.target);
    if (old && old.status.pipOwner === e.id) old.status.pipUntil = 0;
  }
  const p = h.pip;
  const x = p ? p.x : sp.x;
  const y = p ? p.y : sp.y;
  const z = p ? p.z : sp.z;
  h.pip = {
    target: target.id,
    phase: "out",
    x,
    y,
    z,
    px: x,
    py: y,
    pz: z,
    until: 0,
    since: w.time,
    peckAt: 0,
    intAt: -99,
  };
  fx(w, "pipLaunch", e, x, y, z, { id: target.id });
}

/** B: choose Pip's target - nearest to the placed point, else best enemy hero in front, else auto-aim. */
export function sendPip(w: World, e: Entity, a: HeroAction, def: AbilityDef): void {
  const h = e.hero!;
  const range = def.range ?? 14;
  let target: Entity | null = null;
  if (a.placed && a.toX !== undefined && a.toZ !== undefined) {
    let best = Infinity;
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o.structure || !w.canSee(e, o)) continue;
      const d = Math.hypot(o.transform.pos.x - a.toX, o.transform.pos.z - a.toZ);
      if (d > 4 + o.radius || w.dist(e, o) > range + 4) continue;
      const sc = d - (o.hero ? 3 : 0);
      if (sc < best) {
        best = sc;
        target = o;
      }
    }
  }
  if (!target) {
    let best = Infinity;
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || !o.hero) continue;
      const d = w.dist(e, o);
      if (!w.canSee(e, o) && d > 7) continue;
      if (d > range) continue;
      const dx = o.transform.pos.x - e.transform.pos.x;
      const dz = o.transform.pos.z - e.transform.pos.z;
      const along = (dx * a.dirX + dz * a.dirZ) / (d || 1);
      const sc = d - along * 4;
      if (sc < best) {
        best = sc;
        target = o;
      }
    }
  }
  target ??= aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, range);
  if (target?.structure) target = null;
  if (!target) {
    w.emit({ type: "notice", team: e.team, text: "PIP FINDS NO PREY" });
    h.cooldowns.b = Math.min(h.cooldowns.b ?? 0, w.time + 1);
    return;
  }
  launchPip(w, e, target);
}

/** Pip state machine, once per tick from updateHero: out (fly to target) -> on (latched) -> back (return). */
export function updatePip(w: World, e: Entity): void {
  const h = e.hero!;
  const p = h.pip;
  if (!p) return;
  p.px = p.x;
  p.py = p.y;
  p.pz = p.z;
  if (h.dead || !e.alive) {
    const o = w.getAny(p.target);
    if (o && o.status.pipOwner === e.id) o.status.pipUntil = 0;
    h.pip = undefined;
    return;
  }
  const def = abilities(w, e).b;
  const dt = w.dt;
  const tgt = w.get(p.target);
  const alive = !!tgt && !tgt.hero?.dead;
  const toward = (x: number, y: number, z: number, speed: number): number => {
    const dx = x - p.x;
    const dy = y - p.y;
    const dz = z - p.z;
    const d = Math.hypot(dx, dy, dz);
    const step = Math.min(d, speed * dt);
    if (d > 1e-4) {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.z += (dz / d) * step;
    }
    return d - step;
  };
  if (p.phase === "out") {
    if (!alive || w.time - p.since > (def.range ?? 14) / (def.speed ?? 8) + 2) p.phase = "back";
    else {
      const left = toward(tgt!.transform.pos.x, tgt!.transform.y + 2.3, tgt!.transform.pos.z, def.speed ?? 24);
      if (left < 0.5) {
        p.phase = "on";
        p.until = w.time + (def.seconds ?? 5);
        p.peckAt = w.time + 0.6;
        tgt!.status.pipUntil = p.until;
        tgt!.status.pipOwner = e.id;
        fx(w, "pipLatch", e, tgt!.transform.pos.x, tgt!.transform.y, tgt!.transform.pos.z, {
          id: tgt!.id,
          seconds: def.seconds ?? 5,
        });
        if (tgt!.hero)
          w.emit({
            type: "callout",
            x: tgt!.transform.pos.x,
            y: tgt!.transform.y,
            z: tgt!.transform.pos.z,
            team: e.team,
            text: "MARKED BY PIP",
            owner: tgt!.id,
          });
        if (interruptChannels(w, tgt!)) {
          p.intAt = w.time;
          w.emit({
            type: "callout",
            x: tgt!.transform.pos.x,
            y: tgt!.transform.y,
            z: tgt!.transform.pos.z,
            team: e.team,
            text: "INTERRUPTED!",
            owner: tgt!.id,
          });
        }
      }
    }
  }
  if (p.phase === "on") {
    if (!alive || w.time >= p.until || tgt!.status.pipOwner !== e.id) {
      if (tgt && tgt.status.pipOwner === e.id) tgt.status.pipUntil = 0;
      p.phase = "back";
    } else {
      const o = tgt!;
      p.x = o.transform.pos.x;
      p.y = o.transform.y + 2.3;
      p.z = o.transform.pos.z;
      o.status.pipUntil = p.until;
      const slow = def.fx?.pipSlow ?? def.slowMul;
      if (slow && !o.structure) {
        o.status.slowMul = Math.min(o.status.slowUntil > w.time ? o.status.slowMul : 1, slow);
        o.status.slowUntil = Math.max(o.status.slowUntil, w.time + 0.2);
      }
      const auto = def.fx?.pipAutoPeck ?? 1.5;
      if (auto && w.time >= p.peckAt) {
        p.peckAt = w.time + auto;
        peck(w, e, o);
      }
      if (interruptChannels(w, o) && w.time - p.intAt > 1) {
        p.intAt = w.time;
        w.emit({
          type: "callout",
          x: o.transform.pos.x,
          y: o.transform.y,
          z: o.transform.pos.z,
          team: e.team,
          text: "INTERRUPTED!",
          owner: o.id,
        });
      }
    }
  }
  if (p.phase === "back") {
    const sp = shoulder(e);
    if (toward(sp.x, sp.y, sp.z, 20) < 0.6) {
      h.pip = undefined;
      fx(w, "pipHome", e, sp.x, sp.y, sp.z);
    }
  }
}

export function canRake(e: Entity): boolean {
  return e.hero?.pip?.phase === "on";
}

/** B while Pip is latched: Pip rakes the target (damage + blind) and returns. */
export function rake(w: World, e: Entity): void {
  const h = e.hero!;
  const p = h.pip;
  if (!p || p.phase !== "on") return;
  const o = w.get(p.target);
  const def = abilities(w, e).b;
  if (o && o.alive) {
    const ox = o.transform.pos.x;
    const oz = o.transform.pos.z;
    w.damage(e, o, (def.rake ?? 80) * w.damageMulOf(e), { fromX: ox, fromZ: oz, knockback: 0.5, big: true });
    if (def.fx?.bleed) applyBleed(w, e, o, def.fx.bleed);
    if (o.hero || o.unit) {
      o.status.blindUntil = w.time + (def.blindSeconds ?? 2.5);
      o.status.blindMiss = def.blindMiss ?? 0.5;
    }
    interruptChannels(w, o);
    fx(w, "pipRake", e, ox, o.transform.y, oz, { id: o.id, seconds: def.blindSeconds ?? 2.5 });
    w.emit({ type: "callout", x: ox, y: o.transform.y, z: oz, team: e.team, text: "BLINDED!", owner: o.id });
    if (o.status.pipOwner === e.id) o.status.pipUntil = 0;
  }
  p.phase = "back";
}

function pipTarget(w: World, e: Entity): Entity | null {
  const p = e.hero?.pip;
  if (!p || p.phase !== "on") return null;
  return w.get(p.target) ?? null;
}

/** Wren's auto-aim score: favours heroes, Pip-marked targets and the stick direction; avoids structures. */
export function wrenTarget(
  w: World,
  e: Entity,
  dirX: number,
  dirZ: number,
  stick: boolean,
  reach: number,
): Entity | null {
  const t = e.transform;
  let best: Entity | null = null;
  let bs = Infinity;
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team || !w.canSee(e, o)) continue;
    const d = w.dist(e, o) - o.radius;
    if (d > reach) continue;
    const dx = o.transform.pos.x - t.pos.x;
    const dz = o.transform.pos.z - t.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const along = (dx * dirX + dz * dirZ) / len;
    if (stick && along < 0.2) continue;
    const pip = o.status.pipOwner === e.id && w.time < (o.status.pipUntil ?? 0);
    const sc = d * 0.5 + (o.hero ? -6 : 0) + (pip ? -4 : 0) + (o.structure ? 5 : 0) - along * (stick ? 6 : 2);
    if (sc < bs) {
      bs = sc;
      best = o;
    }
  }
  return best;
}

/**
 * A: aimed arrow. Targets beyond base range are only taken in vantage. A fully charged shot (power >= 1.4) becomes
 * a piercing missile; otherwise a homing arrow, or a straight missile when there is no target.
 */
export function marksmanShot(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const hk = w.heroDef(e.hero!.type).hooks;
  const base = def.range ?? 11;
  const far = base * (hk.vantageRange ?? 1.2);
  const stick = !!a.stick;
  let target = wrenTarget(w, e, a.dirX, a.dirZ, stick, far);
  if (target && w.dist(e, target) - target.radius > base && !vantage(w, e, target))
    target = wrenTarget(w, e, a.dirX, a.dirZ, stick, base);
  let dx = a.dirX;
  let dz = a.dirZ;
  if (target) {
    const ddx = target.transform.pos.x - t.pos.x;
    const ddz = target.transform.pos.z - t.pos.z;
    const dl = Math.hypot(ddx, ddz) || 1;
    dx = ddx / dl;
    dz = ddz / dl;
    t.facing = Math.atan2(dx, dz);
  }
  const pw = a.power ?? 1;
  if (pw >= 1.4) {
    const range = (def.pierceRange ?? 14) * (vantage(w, e, target) ? (hk.vantageRange ?? 1.2) : 1);
    fireMissile(w, e, {
      x: t.pos.x + dx * 0.6,
      z: t.pos.z + dz * 0.6,
      y: t.y + 1.4,
      dirX: dx,
      dirZ: dz,
      speed: 42,
      range,
      width: 0.8,
      damage: (def.damage ?? 40) * mul * (0.9 + pw * 0.7),
      pierce: true,
      style: "powershot",
      arrow: true,
      knockback: 7,
    });
    fx(w, "powershot", e, t.pos.x, t.y, t.pos.z, { tx: t.pos.x + dx * range, tz: t.pos.z + dz * range });
    return;
  }
  const dmg = (def.damage ?? 40) * mul;
  const splash = def.splash
    ? { radius: def.splash, damage: (def.splashDamage ?? 15) * mul, slowMul: 1, slowSeconds: 0 }
    : undefined;
  const speed = def.speed ?? 32;
  if (target) {
    w.fireProjectile(e, target, dmg, speed, false, "longarrow", 1.5, false, splash);
    w.projectiles[w.projectiles.length - 1].arrow = true;
  } else {
    fireMissile(w, e, {
      x: t.pos.x + dx * 0.6,
      z: t.pos.z + dz * 0.6,
      y: t.y + 1.4,
      dirX: dx,
      dirZ: dz,
      speed: speed * 1.2,
      range: base,
      width: 0.7,
      damage: dmg,
      pierce: false,
      style: "longarrow",
      arrow: true,
      knockback: 0.8,
    });
  }
}

/** R: `waves` arrow waves on an area after a short delay, repeated by echo talents. */
export function volley(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const range = def.range ?? 9;
  let x: number;
  let z: number;
  if (a.placed && a.toX !== undefined && a.toZ !== undefined) {
    x = a.toX;
    z = a.toZ;
  } else {
    const tg = aimTarget(w, e, { moveX: a.dirX, moveZ: a.dirZ }, range + 1);
    x = tg ? tg.transform.pos.x : t.pos.x + a.dirX * range * 0.7;
    z = tg ? tg.transform.pos.z : t.pos.z + a.dirZ * range * 0.7;
  }
  x = Math.max(1, Math.min(w.terrain.width - 1, x));
  z = Math.max(1, Math.min(w.terrain.depth - 1, z));
  const r = def.radius ?? 3.5;
  const waves = def.waves ?? 5;
  const gap = def.interval ?? 0.4;
  const delay = def.delay ?? 0.35;
  const ec = def.fx?.echo;
  const reps = 1 + (ec?.count ?? 0);
  for (let rep = 0; rep < reps; rep++) {
    const off = rep * (ec?.delay ?? 0);
    const scale = rep === 0 ? 1 : (ec?.scale ?? 1);
    const start = () => fx(w, "volley", e, x, w.groundY(x, z), z, { radius: r, seconds: delay + waves * gap, id: rep });
    if (off > 0) w.later(off, start);
    else start();
    for (let k = 0; k < waves; k++) w.later(off + delay + k * gap, () => volleyWave(w, e, x, z, r, def, mul * scale));
    if (def.fx?.zoneAfter) {
      const za = def.fx.zoneAfter;
      w.later(off + delay, () => zoneAt(w, e, x, z, r, za));
    }
  }
}

function volleyWave(w: World, e: Entity, x: number, z: number, r: number, def: AbilityDef, mul: number): void {
  fx(w, "volleyWave", e, x, w.groundY(x, z), z, { radius: r });
  for (const o of w.entities.slice()) {
    if (!o.alive || o.team === e.team) continue;
    if (Math.hypot(o.transform.pos.x - x, o.transform.pos.z - z) - o.radius > r) continue;
    const dmg = (def.damage ?? 26) * mul * (o.unit ? (def.unitMul ?? 1.5) : 1);
    w.damage(e, o, dmg, {
      fromX: x,
      fromZ: z,
      knockback: 0.4,
      slowMul: def.slowMul,
      slowSeconds: def.slowSeconds,
      noFlinch: true,
      structureDamage: o.structure ? dmg * 0.5 : undefined,
    });
  }
}

/** Z: piercing line shot that locks onto a hero within ~20 degrees; first hero hit takes heroDamage. */
export function heartseeker(w: World, e: Entity, a: HeroAction, def: AbilityDef, mul: number): void {
  const t = e.transform;
  const h = e.hero!;
  const range = def.range ?? 28;
  const width = def.width ?? 1;
  let dx = a.dirX;
  let dz = a.dirZ;
  let lock: Entity | null = null;
  let bestCos = 0.94;
  for (const o of w.entities) {
    if (!o.alive || !o.hero || o.team === e.team || !w.canSee(e, o)) continue;
    const ox = o.transform.pos.x - t.pos.x;
    const oz = o.transform.pos.z - t.pos.z;
    const d = Math.hypot(ox, oz);
    if (d > range || d < 0.5) continue;
    const c = (ox * a.dirX + oz * a.dirZ) / d;
    if (c > bestCos) {
      bestCos = c;
      lock = o;
    }
  }
  if (lock) {
    const ox = lock.transform.pos.x - t.pos.x;
    const oz = lock.transform.pos.z - t.pos.z;
    const d = Math.hypot(ox, oz) || 1;
    dx = ox / d;
    dz = oz / d;
  }
  t.facing = Math.atan2(dx, dz);
  let len = range;
  for (let s = 0.5; s <= range; s += 0.5) {
    if (w.losHeight(t.pos.x + dx * s, t.pos.z + dz * s) > t.y + 2.4) {
      len = s;
      break;
    }
  }
  const hits: { o: Entity; along: number }[] = [];
  for (const o of w.entities) {
    if (!o.alive || o.team === e.team) continue;
    const ox = o.transform.pos.x - t.pos.x;
    const oz = o.transform.pos.z - t.pos.z;
    const along = ox * dx + oz * dz;
    if (along < 0 || along - o.radius > len) continue;
    if (Math.abs(ox * dz - oz * dx) > width + o.radius || Math.abs(o.transform.y - t.y) > 3.5) continue;
    hits.push({ o, along });
  }
  hits.sort((p, q) => p.along - q.along);
  const ex = t.pos.x + dx * len;
  const ez = t.pos.z + dz * len;
  fx(w, "heartseeker", e, t.pos.x, t.y, t.pos.z, { tx: ex, tz: ez });
  let first: Entity | null = null;
  const marked: Entity[] = [];
  for (const { o } of hits) {
    const champ = !!o.hero && !first;
    const dmg = (champ ? (def.heroDamage ?? 260) : (def.damage ?? 110)) * mul;
    const ok = w.damage(e, o, dmg, {
      fromX: t.pos.x,
      fromZ: t.pos.z,
      knockback: champ ? (def.knockback ?? 12) : 5,
      big: true,
      structureDamage: o.structure ? (def.structureDamage ?? 120) * mul : undefined,
    });
    if (champ) first = o;
    if (ok) {
      marked.push(o);
      if (!o.structure) onArrowHit(w, e, o);
    }
  }
  const fz = def.fx;
  if (fz?.mark) for (const o of marked) if (o.alive) mark(w, e, o, fz.mark);
  if (first && fz?.ricochet) {
    const rc = fz.ricochet;
    const from = first;
    let best: Entity | null = null;
    let bd = Infinity;
    for (const o of w.entities) {
      if (!o.alive || o.team === e.team || o === from || o.structure) continue;
      const d = w.dist(from, o);
      if (d > rc.range) continue;
      const sc = d - (o.hero ? 6 : 0);
      if (sc < bd) {
        bd = sc;
        best = o;
      }
    }
    if (best) {
      fx(w, "ricochet", e, from.transform.pos.x, from.transform.y, from.transform.pos.z, {
        tx: best.transform.pos.x,
        tz: best.transform.pos.z,
        id: best.id,
      });
      const target = best;
      w.later(0.12, () => {
        if (!target.alive) return;
        w.damage(e, target, (target.hero ? (def.heroDamage ?? 260) : (def.damage ?? 110)) * mul * rc.mul, {
          fromX: from.transform.pos.x,
          fromZ: from.transform.pos.z,
          knockback: 6,
          big: true,
        });
        onArrowHit(w, e, target);
        if (fz.mark && target.alive) mark(w, e, target, fz.mark);
      });
    }
  }
  if (first && fz?.pipOnHit && first.alive && !h.pip) launchPip(w, e, first);
}

/** Dodge replacement while Pip is latched within 14: hop away from the target, then fire a crit arrow mid-air. */
export function skyshot(w: World, e: Entity, cmd: Command): boolean {
  const h = e.hero!;
  const tgt = pipTarget(w, e);
  if (!tgt || w.dist(e, tgt) > 14) return false;
  const t = e.transform;
  let ux = t.pos.x - tgt.transform.pos.x;
  let uz = t.pos.z - tgt.transform.pos.z;
  const ul = Math.hypot(ux, uz) || 1;
  ux /= ul;
  uz /= ul;
  const mag = Math.hypot(cmd.moveX, cmd.moveZ);
  if (mag > 0.3) {
    const mx = cmd.moveX / mag;
    const mz = cmd.moveZ / mag;
    if (mx * ux + mz * uz > -0.2) {
      ux = ux * 0.6 + mx * 0.4;
      uz = uz * 0.6 + mz * 0.4;
      const l = Math.hypot(ux, uz) || 1;
      ux /= l;
      uz /= l;
    }
  }
  if (!w.startJump(e, t.pos.x + ux * 4, t.pos.z + uz * 4, 0.45, 1.8)) return false;
  t.facing = t.prevFacing = Math.atan2(-ux, -uz);
  e.status.invulnUntil = Math.max(e.status.invulnUntil, w.time + 0.5);
  h.cooldowns.dodge = w.time + w.data.heroes.baseline.dodgeSeconds + w.data.heroes.baseline.dodgeCooldown;
  w.emit({ type: "callout", x: t.pos.x, y: t.y, z: t.pos.z, team: e.team, text: "SKYSHOT", owner: e.id });
  fx(w, "skyshot", e, t.pos.x, t.y, t.pos.z, { id: tgt.id });
  w.later(0.47, () => {
    if (!e.alive || !tgt.alive) return;
    const a = abilities(w, e).a;
    const tt = e.transform;
    tt.facing = Math.atan2(tgt.transform.pos.x - tt.pos.x, tgt.transform.pos.z - tt.pos.z);
    w.fireProjectile(e, tgt, (a.damage ?? 42) * 1.3 * w.damageMulOf(e), 46, false, "skyshot", 1.8, false);
    const p = w.projectiles[w.projectiles.length - 1];
    p.crit = true;
    p.arrow = true;
  });
  return true;
}
