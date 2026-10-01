import type { World } from "./world.ts";
import type { AbilityDef, TalentDef, TalentFx } from "./config.ts";
import type { Entity, Missile } from "./types.ts";
import { spawnUnit } from "./structures.ts";

type Slot = "a" | "b" | "r" | "z";

export type TSlot = "a" | "b" | "r" | "z";
export const TSLOTS: TSlot[] = ["r", "b", "a", "z"];

export function treeOf(w: World, type: string): Partial<Record<TSlot, TalentDef[]>> | undefined {
  return w.data.talents?.heroes[type];
}

export function abilities(w: World, e: Entity): Record<Slot, AbilityDef> {
  return e.hero!.ab ?? w.heroDef(e.hero!.type).abilities;
}

export function learned(w: World, e: Entity, slot: TSlot): TalentDef[] {
  const list = treeOf(w, e.hero!.type)?.[slot];
  const k = e.hero!.path[slot]?.[0];
  return list && k !== undefined && list[k] ? [list[k]] : [];
}

export function allLearned(w: World, e: Entity): TalentDef[] {
  return TSLOTS.flatMap((s) => learned(w, e, s));
}

export function options(w: World, e: Entity): { slot: TSlot; list: TalentDef[] } | null {
  const h = e.hero!;
  const slot = h.picks[0];
  if (!slot) return null;
  const list = treeOf(w, h.type)?.[slot];
  return list && list.length && !h.path[slot].length ? { slot, list } : null;
}

function mergeFx(a: TalentFx | undefined, b: TalentFx | undefined): TalentFx | undefined {
  if (!b) return a;
  const out: Record<string, unknown> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = prev && typeof prev === "object" && v && typeof v === "object" ? { ...(prev as object), ...(v as object) } : v;
  }
  return out as TalentFx;
}

function apply(def: AbilityDef, t: { set?: Record<string, unknown>; add?: Record<string, number>; mul?: Record<string, number>; fx?: TalentFx }): AbilityDef {
  const d = structuredClone(def) as AbilityDef & Record<string, unknown>;
  for (const [k, v] of Object.entries(t.set ?? {})) d[k] = structuredClone(v);
  for (const [k, v] of Object.entries(t.add ?? {})) d[k] = ((d[k] as number | undefined) ?? 0) + v;
  for (const [k, v] of Object.entries(t.mul ?? {})) if (typeof d[k] === "number") d[k] = (d[k] as number) * v;
  d.fx = mergeFx(d.fx, t.fx);
  return d;
}

export function recompute(w: World, e: Entity): void {
  const h = e.hero!;
  const base = w.heroDef(h.type).abilities;
  const out = { ...base } as Record<Slot, AbilityDef>;
  const got = new Set(allLearned(w, e).map((t) => t.id));
  for (const s of TSLOTS) for (const t of learned(w, e, s)) out[s] = apply(out[s], t);
  for (const s of TSLOTS) {
    for (const t of learned(w, e, s)) {
      for (const c of t.with ?? []) if (got.has(c.id)) out[c.slot ?? s] = apply(out[c.slot ?? s], c);
    }
  }
  h.ab = out;
}

export function allFx(w: World, e: Entity): TalentFx {
  const ab = abilities(w, e);
  return mergeFx(mergeFx(mergeFx(ab.a.fx, ab.b.fx), ab.r.fx), ab.z.fx) ?? {};
}

export function learn(w: World, e: Entity, choice: number): void {
  const h = e.hero!;
  const opt = options(w, e);
  if (!opt) {
    if (h.picks.length) h.picks.shift();
    return;
  }
  const t = opt.list[Math.max(0, Math.min(opt.list.length - 1, choice))];
  h.path[opt.slot].push(opt.list.indexOf(t));
  h.picks.shift();
  recompute(w, e);
  const p = e.transform;
  w.emit({ type: "learned", id: e.id, name: t.name, icon: t.id, x: p.pos.x, y: p.y, z: p.pos.z, team: e.team });
  const next = options(w, e);
  if (next && next.list.length === 1) learn(w, e, 0);
}

export function gainXp(w: World, e: Entity | null | undefined, amount: number): void {
  const hero = e?.hero ? e : e?.owner ? w.get(e.owner) : undefined;
  if (!hero?.hero || !(amount > 0)) return;
  const h = hero.hero;
  const cfg = w.data.talents?.xp;
  if (!cfg) return;
  h.xp += amount;
  while (h.level < cfg.levels.length && h.xp >= cfg.levels[h.level]) {
    h.level++;
    const hpK = 1 + cfg.perLevelHp;
    hero.maxHp *= hpK;
    hero.hp = Math.min(hero.maxHp, hero.hp * hpK + hero.maxHp * 0.15);
    h.damageMul *= 1 + cfg.perLevelDamage;
    const tree = treeOf(w, h.type);
    const slot = w.data.talents!.order?.[h.level - 2];
    if (tree && slot && tree[slot]?.length) {
      h.picks.push(slot);
      if (h.picks.length === 1 && tree[slot]!.length === 1) learn(w, hero, 0);
    }
    const p = hero.transform;
    w.emit({ type: "levelup", id: hero.id, level: h.level, x: p.pos.x, y: p.y, z: p.pos.z, team: hero.team });
  }
}

export function xpForDamage(w: World, src: Entity | null, target: Entity, amount: number): void {
  const cfg = w.data.talents?.xp;
  if (!cfg || !src || src.team === target.team) return;
  const k = target.hero ? cfg.vsHero : target.structure ? cfg.vsStructure : cfg.vsUnit;
  gainXp(w, src, amount * k);
}

export function addShield(e: Entity, amount: number, max: number, seconds: number, time: number): void {
  const s = e.status;
  s.shield = Math.min(max, (time < s.shieldUntil ? s.shield : 0) + amount);
  s.shieldUntil = time + seconds;
}

export function heal(w: World, e: Entity, amount: number): void {
  if (amount <= 0 || !e.alive) return;
  w.heal(e, amount);
}

export function applyBleed(w: World, src: Entity, target: Entity, b: NonNullable<TalentFx["bleed"]>): void {
  if (target.structure) return;
  const s = target.status;
  const stacks = w.time < s.bleedUntil ? Math.min(b.max, s.bleedStacks + 1) : 1;
  s.bleedStacks = stacks;
  s.bleedDps = b.dps;
  s.bleedUntil = w.time + b.seconds;
  s.bleedOwner = src.id;
}

export function mark(w: World, src: Entity, target: Entity, m: NonNullable<TalentFx["mark"]>): void {
  if (target.structure) return;
  const s = target.status;
  s.markUntil = w.time + m.seconds;
  s.markTeam = src.team;
  s.markOwner = src.id;
  s.markMul = m.mul;
  s.markAll = !!m.all;
  s.markWeaken = m.weaken ?? 1;
  if (m.burst) {
    const until = s.markUntil;
    w.later(2, () => {
      if (!target.alive || target.status.markOwner !== src.id || target.status.markUntil !== until) return;
      const p = target.transform;
      w.emit({ type: "slam", x: p.pos.x, y: p.y, z: p.pos.z, radius: 1.6, team: src.team });
      w.damage(src.alive ? src : null, target, m.burst! * w.damageMulOf(src), { big: true, fromX: p.pos.x, fromZ: p.pos.z });
    });
  }
}

export function chainLightning(w: World, src: Entity, from: Entity, count: number, damage: number): void {
  const pts: number[] = [from.transform.pos.x, from.transform.y + 1.2, from.transform.pos.z];
  const done = new Set<number>([from.id]);
  let cur = from;
  for (let k = 0; k < count; k++) {
    let best: Entity | null = null;
    let bd = 5.5;
    for (const o of w.entities) {
      if (!o.alive || o.team === src.team || done.has(o.id) || o.structure) continue;
      const d = w.dist(cur, o);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) break;
    done.add(best.id);
    pts.push(best.transform.pos.x, best.transform.y + 1.2, best.transform.pos.z);
    w.damage(src, best, damage, { fromX: cur.transform.pos.x, fromZ: cur.transform.pos.z, knockback: 0.5 });
    cur = best;
  }
  if (pts.length > 3) w.emit({ type: "chain", pts, team: src.team });
}

export function pullTo(w: World, src: Entity, cx: number, cz: number, radius: number, strength = 1): void {
  w.emit({ type: "pull", x: cx, y: w.groundY(cx, cz), z: cz, radius, team: src.team });
  for (const o of w.entities) {
    if (!o.alive || o.team === src.team || o.structure) continue;
    if (w.time < o.status.ccImmuneUntil) continue;
    const dx = cx - o.transform.pos.x;
    const dz = cz - o.transform.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > radius + o.radius || d < 0.6) continue;
    const k = Math.min(14, d * 3.2) * strength;
    o.status.kvx += (dx / d) * k;
    o.status.kvz += (dz / d) * k;
  }
}

export function zoneAt(w: World, src: Entity, x: number, z: number, radius: number, z0: NonNullable<TalentFx["zoneAfter"]>): void {
  w.zones.push({
    id: w.newId(), team: src.team, ownerId: src.id, x, z, radius: z0.radius ?? radius, until: w.time + z0.seconds,
    dps: z0.dps * w.damageMulOf(src), slowMul: z0.slowMul, style: z0.style,
  });
}

export function fireMissile(w: World, src: Entity, m: Omit<Missile, "id" | "ownerId" | "team" | "dist" | "hit">): void {
  w.missiles.push({ ...m, id: w.newId(), ownerId: src.id, team: src.team, dist: 0, hit: [] });
  w.emit({ type: "shot", style: m.style, x: m.x, y: m.y, z: m.z });
}

function missileBlocked(w: World, m: Missile, x: number, z: number): boolean {
  if (m.style === "rock") {
    const h = w.terrain.heightAt(x, z);
    return !Number.isFinite(h) || Math.abs(h - m.y) > 1.6;
  }
  return w.losHeight(x, z) > m.y + 0.4;
}

export function updateMissiles(w: World): void {
  const dt = w.dt;
  for (let i = w.missiles.length - 1; i >= 0; i--) {
    const m = w.missiles[i];
    const owner = w.get(m.ownerId) ?? null;
    const step = m.speed * dt;
    const nx = m.x + m.dirX * step;
    const nz = m.z + m.dirZ * step;
    let end = m.dist + step >= m.range || missileBlocked(w, m, nx, nz);
    if (!end) {
      m.x = nx;
      m.z = nz;
      m.dist += step;
      if (m.style === "rock") m.y = w.groundY(nx, nz);
    }
    for (const o of w.entities.slice()) {
      if (!o.alive || o.team === m.team || m.hit.includes(o.id)) continue;
      if (Math.hypot(o.transform.pos.x - m.x, o.transform.pos.z - m.z) - o.radius > m.width) continue;
      if (m.style !== "rock" && Math.abs(o.transform.y + 1 - m.y) > 2.5) continue;
      m.hit.push(o.id);
      const dmg = o.structure ? m.damage * 0.5 : m.damage;
      w.damage(owner, o, dmg, {
        fromX: m.x - m.dirX, fromZ: m.z - m.dirZ, knockback: m.style === "rock" ? 3 : 1.5, stun: m.stun, slowMul: m.slowMul, slowSeconds: m.slowSeconds,
        big: m.style === "rock" || m.style === "slash", structureDamage: o.structure ? dmg : undefined,
      });
      if (m.splash) {
        w.emit({ type: "slam", x: o.transform.pos.x, y: o.transform.y, z: o.transform.pos.z, radius: m.splash, team: m.team });
        for (const q of w.entities.slice()) {
          if (!q.alive || q.team === m.team || q === o || q.structure) continue;
          if (Math.hypot(q.transform.pos.x - o.transform.pos.x, q.transform.pos.z - o.transform.pos.z) - q.radius > m.splash) continue;
          w.damage(owner, q, m.splashDamage ?? 30, { fromX: o.transform.pos.x, fromZ: o.transform.pos.z, knockback: 2 });
        }
      }
      if (m.chain && owner) {
        let best: Entity | null = null;
        let bd = 7;
        for (const q of w.entities) {
          if (!q.alive || q.team === m.team || q.id === o.id || q.structure || m.hit.includes(q.id)) continue;
          const d = w.dist(o, q);
          if (d < bd) { bd = d; best = q; }
        }
        if (best) {
          const dx = best.transform.pos.x - o.transform.pos.x;
          const dz = best.transform.pos.z - o.transform.pos.z;
          const dl = Math.hypot(dx, dz) || 1;
          w.missiles.push({ ...m, id: w.newId(), x: o.transform.pos.x, z: o.transform.pos.z, dirX: dx / dl, dirZ: dz / dl, dist: 0, range: dl + 1, hit: [...m.hit], chain: m.chain - 1 });
        }
      }
      if (!m.pierce) {
        end = true;
        break;
      }
    }
    if (end) {
      w.missiles.splice(i, 1);
      if (m.endBurst && owner) {
        const y = w.groundY(m.x, m.z);
        w.emit({ type: "slam", x: m.x, y, z: m.z, radius: m.endBurst.radius, team: m.team });
        for (const o of w.entities.slice()) {
          if (!o.alive || o.team === m.team || o.structure) continue;
          if (Math.hypot(o.transform.pos.x - m.x, o.transform.pos.z - m.z) - o.radius > m.endBurst.radius) continue;
          w.damage(owner, o, m.endBurst.damage * w.damageMulOf(owner), { fromX: m.x, fromZ: m.z, knockback: 5, big: true });
        }
      }
    }
  }
}

export function tickStatus(w: World): void {
  const t = w.time;
  const tick = w.tick % 15 === 0;
  for (const e of w.entities) {
    if (!e.alive) continue;
    const s = e.status;
    if (s.shield > 0 && t >= s.shieldUntil) s.shield = 0;
    if (tick && t < s.bleedUntil && s.bleedStacks > 0) {
      const owner = w.get(s.bleedOwner) ?? null;
      w.damage(owner, e, s.bleedDps * s.bleedStacks * 0.5, { fromX: e.transform.pos.x, fromZ: e.transform.pos.z, tick: true });
    }
    const h = e.hero;
    if (!h) continue;
    if (h.recastUntil && t >= h.recastUntil) {
      h.recastUntil = 0;
      const cd = abilities(w, e).b.cooldown ?? 4;
      h.cooldowns.b = Math.max(h.cooldowns.b ?? 0, t + cd * 0.7);
    }
    if (h.frenzy && t >= h.frenzyUntil) h.frenzy = 0;
  }
}

export function frenzySpeed(w: World, e: Entity): number {
  const f = abilities(w, e).a.fx?.frenzy;
  const h = e.hero!;
  return f && w.time < h.frenzyUntil ? 1 + h.frenzy * f.speed : 1;
}

export interface MeleeResult {
  targets: Entity[];
  damage: number;
}

export function meleeMods(w: World, e: Entity, finisher: boolean, jab: boolean): { dmgMul: number; arc: number | null; knockMul: number; extra: number } {
  const fx = abilities(w, e).a.fx;
  const h = e.hero!;
  let dmgMul = 1;
  let arc: number | null = null;
  let knockMul = 1;
  let extra = 0;
  const f = fx?.frenzy;
  if (f && w.time < h.frenzyUntil) {
    if (f.damage) dmgMul *= 1 + h.frenzy * f.damage;
    if (h.frenzy >= f.max && f.atMaxArc) {
      arc = f.atMaxArc;
      dmgMul *= f.atMaxDamage ?? 1;
    }
  }
  if (finisher && !jab && fx?.finisherBonus) {
    dmgMul *= fx.finisherBonus.damage ?? 1;
    extra += fx.finisherBonus.extra ?? 0;
    knockMul *= fx.finisherBonus.knock ?? 1;
  }
  if (!jab && w.time < h.empowerUntil) {
    dmgMul *= h.empowerMul;
    h.empowerUntil = 0;
  }
  return { dmgMul, arc, knockMul, extra };
}

export function afterMelee(w: World, e: Entity, targets: Entity[], dealt: number, finisher: boolean, dirX: number, dirZ: number, reach: number, jab: boolean): void {
  const fx = abilities(w, e).a.fx;
  const t = e.transform;
  if (fx && finisher && !jab) {
    if (fx.wave) {
      fireMissile(w, e, {
        x: t.pos.x + dirX * 0.8, z: t.pos.z + dirZ * 0.8, y: fx.wave.style === "rock" ? t.y : t.y + 1.2, dirX, dirZ, speed: fx.wave.style === "rock" ? 14 : 20,
        range: fx.wave.length, width: fx.wave.width, damage: fx.wave.damage * w.damageMulOf(e), pierce: true, style: fx.wave.style, stun: fx.wave.stun,
        endBurst: fx.waveEnd,
      });
    }
    if (fx.bolt) {
      const b = fx.bolt;
      for (let k = 0; k < b.count; k++) {
        const off = b.count > 1 ? ((k / (b.count - 1)) - 0.5) * 2 * (b.spread * Math.PI / 180) : 0;
        const c = Math.cos(off);
        const s = Math.sin(off);
        fireMissile(w, e, {
          x: t.pos.x + dirX * 0.6, z: t.pos.z + dirZ * 0.6, y: t.y + 1.3, dirX: dirX * c - dirZ * s, dirZ: dirX * s + dirZ * c, speed: 22, range: b.range, width: 0.7,
          damage: b.damage * w.damageMulOf(e), pierce: false, style: b.style, splash: b.splash, splashDamage: (b.splashDamage ?? 0) * w.damageMulOf(e),
          slowMul: b.slowMul, slowSeconds: b.slowSeconds, chain: b.chain,
        });
      }
    }
    if (fx.finisherZone) zoneAt(w, e, t.pos.x + dirX * reach * 0.6, t.pos.z + dirZ * reach * 0.6, fx.finisherZone.radius, fx.finisherZone);
  }
  if (!fx || !targets.length) return;
  const h = e.hero!;
  let ls = fx.lifesteal ?? 0;
  for (const o of targets) {
    if (fx.lifestealVsBleed && w.time < o.status.bleedUntil) ls += fx.lifestealVsBleed / targets.length;
    if (fx.bleed) applyBleed(w, e, o, fx.bleed);
    if (finisher && !jab && fx.finisherStun && o.alive && !o.structure) o.status.stunUntil = Math.max(o.status.stunUntil, w.time + fx.finisherStun);
    if (finisher && !jab && fx.consumeBleed && o.alive && o.status.bleedStacks >= (fx.bleed?.max ?? 3) && w.time < o.status.bleedUntil) {
      o.status.bleedStacks = 0;
      o.status.bleedUntil = 0;
      const p = o.transform;
      w.emit({ type: "slam", x: p.pos.x, y: p.y, z: p.pos.z, radius: 1.4, team: e.team });
      w.damage(e, o, fx.consumeBleed * w.damageMulOf(e), { big: true, fromX: t.pos.x, fromZ: t.pos.z, knockback: 3 });
    }
  }
  if (ls > 0) heal(w, e, dealt * ls);
  if (fx.frenzy) {
    h.frenzy = Math.min(fx.frenzy.max, (w.time < h.frenzyUntil ? h.frenzy : 0) + 1);
    h.frenzyUntil = w.time + fx.frenzy.seconds;
  }
  if (fx.cdrOnHit) {
    const k = fx.cdrOnHit.slot;
    h.cooldowns[k] = Math.max(w.time, (h.cooldowns[k] ?? 0) - fx.cdrOnHit.seconds);
  }
  if (fx.healAllies) {
    for (const o of w.entities) {
      if (!o.alive || o.team !== e.team || o === e || o.hero) continue;
      if (w.dist(e, o) - o.radius > 5) continue;
      heal(w, o, fx.healAllies * (o.structure ? 2 : 1));
    }
  }
  if (fx.chainAtMax && fx.frenzy && h.frenzy >= fx.frenzy.max) chainLightning(w, e, targets[0], fx.chainAtMax.count, fx.chainAtMax.damage * w.damageMulOf(e));
  if (fx.shieldOnHit) addShield(e, fx.shieldOnHit.amount, fx.shieldOnHit.max, fx.shieldOnHit.seconds, w.time);
}

export function afterShot(w: World, src: Entity, target: Entity, dealt: number, orb: boolean): void {
  if (!src.hero) return;
  const fx = abilities(w, src).a.fx;
  if (!fx) return;
  if (fx.lifesteal) heal(w, src, dealt * fx.lifesteal);
  if (fx.shieldOnHit) addShield(src, fx.shieldOnHit.amount, fx.shieldOnHit.max, fx.shieldOnHit.seconds, w.time);
  if (fx.hexOnHit && !target.structure) {
    target.status.hexUntil = w.time + fx.hexOnHit;
    target.status.hexOwner = src.id;
  }
  if (orb && fx.orbChain) chainLightning(w, src, target, fx.orbChain, dealt * 0.6);
  else if (!orb && fx.chain) chainLightning(w, src, target, fx.chain.count, dealt * fx.chain.mul);
}

export function onKill(w: World, src: Entity | null, target: Entity): void {
  const cfg = w.data.talents?.xp;
  const hero = src?.hero ? src : src?.owner ? w.get(src.owner) : undefined;
  if (cfg && hero) gainXp(w, hero, target.hero ? cfg.heroKill : target.structure ? cfg.structureKill : target.neutral ? 80 : cfg.unitKill);
  if (!hero?.hero || hero.team === target.team) return;
  const fx = allFx(w, hero);
  const h = hero.hero;
  if (target.hero) {
    if (fx.resetOnKill) {
      h.cooldowns[fx.resetOnKill] = w.time;
      w.emit({ type: "callout", x: hero.transform.pos.x, y: hero.transform.y, z: hero.transform.pos.z, team: hero.team, text: "RESET!", owner: hero.id });
    }
    if (fx.takedownShield) addShield(hero, fx.takedownShield, fx.takedownShield, 6, w.time);
    if (fx.meterOnKill) h.meter = Math.max(h.meter, w.data.heroes.baseline.superMax * fx.meterOnKill);
    if (fx.stealthOnKill) {
      hero.status.stealthUntil = w.time + fx.stealthOnKill;
      w.emit({ type: "blink", x: hero.transform.pos.x, y: hero.transform.y, z: hero.transform.pos.z, team: hero.team });
    }
  }
  if (fx.summonOnKill && src === hero && !target.structure && !target.neutral) {
    const p = target.transform.pos;
    const u = spawnUnit(w, hero.team, fx.summonOnKill.type, p.x, p.z, 1);
    if (u) {
      u.expiresAt = w.time + fx.summonOnKill.seconds;
      u.owner = hero.id;
      u.unit!.raised = true;
      w.emit({ type: "telegraph", x: p.x, y: w.groundY(p.x, p.z), z: p.z, radius: 1.4, team: hero.team, seconds: 0.2 });
    }
  }
}

export function onBUse(w: World, e: Entity): void {
  const fx = abilities(w, e).b.fx;
  if (!fx) return;
  if (fx.armorOnUse) {
    e.status.armorMul = fx.armorOnUse.mul;
    e.status.armorUntil = w.time + fx.armorOnUse.seconds;
    if (fx.armorOnUse.cc) e.status.ccImmuneUntil = w.time + fx.armorOnUse.seconds;
  }
}

export function bCooldown(w: World, e: Entity): number {
  const h = e.hero!;
  const def = abilities(w, e).b;
  const cd = def.cooldown ?? 4;
  if (!def.fx?.recast) return w.time + cd;
  if (h.recastUntil && w.time < h.recastUntil) {
    h.recastUntil = 0;
    return w.time + cd;
  }
  h.recastUntil = w.time + def.fx.recast;
  return w.time + 0.35;
}

export function markTargets(w: World, e: Entity, targets: Entity[]): void {
  const m = abilities(w, e).b.fx?.mark;
  if (!m) return;
  for (const o of targets) if (o.alive) mark(w, e, o, m);
}
