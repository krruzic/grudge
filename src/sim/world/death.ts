// Kills and their consequences: bounties, veterancy, hero respawn timers, structure rubble, core loss/elimination,
// plus the gold-loss and tower-rally rules that fire on deaths.
import type { World } from "../world.ts";
import type { Entity, Pad } from "../types.ts";
import { gainXp, onKill } from "../talents.ts";
import { spawnUnit } from "../structures.ts";

type TeamTally = { resource: number; heroKills: number; kills: number };

/**
 * Kill `target` (hp already <= 0 or forced). Credits the killer's team (src's team; in 2-team matches an
 * environmental kill credits the other team), scaled down by the victim's catch-up factor, then dispatches on
 * what died. Heroes stay in w.entities as `dead` until respawn; everything else is removed by World.cleanup.
 */
export function kill(w: World, target: Entity, src: Entity | null): void {
  const tp = target.transform;
  onKillSynergy(w, target, src);
  onKill(w, src, target);
  const kt = src ? src.team : w.teamCount === 2 ? 1 - target.team : -1;
  const killerTeam = kt >= 0 && kt < w.teamCount ? kt : -1;
  const nobody: TeamTally = { resource: 0, heroKills: 0, kills: 0 };
  const killer: TeamTally = killerTeam >= 0 ? w.teams[killerTeam] : nobody;
  const victim = w.teams[target.team];
  const cut = victim ? 1 - victim.catchUp * w.data.match.catchUp.bountyCut : 1;
  target.hp = 0;
  w.emit({
    type: "death",
    id: target.id,
    kind: target.kind,
    x: tp.pos.x,
    y: tp.y,
    z: tp.pos.z,
    team: target.team,
    big: target.kind !== "unit",
  });
  if (target.hero) {
    killHero(w, target, src, killer, cut, killerTeam);
    return;
  }
  target.alive = false;
  if (src?.unit && src.alive && src.team !== target.team)
    w.promote(src, target.unit ? 1 : w.data.units.veterancy.structureKillValue);
  if (target.unit) killUnit(w, target, killer, killerTeam, cut);
  else killStructure(w, target, killer, killerTeam, cut);
}

/** Hero death: respawn timer (longer in big matches, shorter for trailing FFA teams), frozen cooldowns, bounty. */
function killHero(
  w: World,
  target: Entity,
  src: Entity | null,
  killer: TeamTally,
  cut: number,
  killerTeam: number,
): void {
  const hh = target.hero!;
  const victim = w.teams[target.team];
  if (src?.unit && src.alive && src.team !== target.team) w.promote(src, w.data.units.veterancy.heroKillValue);
  target.alive = false;
  hh.dead = true;
  hh.action = null;
  hh.bomb = false;
  hh.aim = null;
  const big = w.ffa || w.players.length > 2 ? (w.data.match.economy.respawnBigMul ?? 1) : 1;
  const catchUpCut = (w.ffa ? (victim?.catchUp ?? 0) : 0) * w.data.match.catchUp.respawnCut;
  const bl = w.data.heroes.baseline;
  const wait = Math.min(
    bl.respawnMax ?? Infinity,
    bl.respawnSeconds * big + (bl.respawnPerMinute ?? 0) * (w.time / 60),
  );
  hh.respawnAt = w.time + wait * (1 - catchUpCut);
  // Cooldowns are stored as absolute times; freeze the remaining durations so they resume on respawn.
  hh.frozenCd = Object.fromEntries(Object.entries(hh.cooldowns).map(([k, v]) => [k, Math.max(0, (v ?? 0) - w.time)]));
  if (hh.meter < w.data.heroes.baseline.superMax) hh.meter = 0;
  killer.resource += w.data.match.economy.bounty.hero * cut;
  killer.heroKills++;
  if (w.tdm) {
    w.tdm.onHeroKill(target, src);
    return;
  }
  w.loseGold(target.team, w.data.match.economy.loss.heroDeath, "HERO DOWN");
  // Losing a champion spills a share of the house's grain store (a beaten house can't bank its way back).
  const spill = w.data.match.economy.grain?.deathLoss ?? 0;
  if (victim && spill > 0) victim.grain *= 1 - spill;
  if (killerTeam >= 0 && killerTeam !== target.team) muster(w, killerTeam, cut);
}

/**
 * A champion kill feeds the killers' army: a grain bounty, and every outpost of theirs sends a quick burst of
 * soldiers (paid from grain as usual), so the army is big and on its way by the time the victim respawns.
 */
function muster(w: World, team: number, cut: number): void {
  const m = w.data.match.economy.muster;
  if (!m) return;
  const ts = w.teams[team];
  const grain = Math.round(m.grain * cut);
  ts.grain += grain;
  for (const o of w.entities) {
    const st = o.structure;
    if (!o.alive || o.team !== team || !st?.ready || st.spawnAt === undefined) continue;
    if (st.type === "core" || w.data.structures.types[st.type]?.class !== "production") continue;
    st.burst = m.burst;
    st.spawnAt = Math.min(st.spawnAt, w.time);
  }
  w.emit({ type: "notice", team, text: `CHAMPION SLAIN · +${grain} GRAIN · OUTPOSTS MUSTER` });
}

/** Unit death: the neutral ogre blesses the killing team; regular units pay a rank-scaled bounty. */
function killUnit(w: World, target: Entity, killer: TeamTally, killerTeam: number, cut: number): void {
  const unit = target.unit!;
  const vet = w.data.units.veterancy;
  if (target.neutral) {
    const og = w.data.match.arena.ogre;
    killer.resource += og.bounty;
    if (killerTeam < 0) return;
    for (const o of w.entities) {
      if (!o.alive || o.team !== killerTeam || o.structure) continue;
      o.status.buffUntil = w.time + og.blessSeconds;
      o.status.buffDamageMul = og.blessDamage;
      o.status.buffSpeedMul = og.blessSpeed;
      if (o.hero) {
        gainXp(w, o, og.blessXp);
        w.heal(o, o.maxHp * 0.3);
      }
    }
    w.emit({ type: "notice", team: -1, text: `THE OGRE FALLS · ${w.teamName(killerTeam)} HOUSE IS BLESSED` });
    return;
  }
  if (!unit.guard && !unit.raised) w.arena.unitLost(target);
  const bounty = w.data.units.types[unit.type].bounty + unit.rank * vet.bountyPerRank;
  killer.resource += bounty * cut * (w.data.match.economy.grain?.unitBountyMul ?? 1);
  killer.kills++;
}

/** Structure death: core -> match end / elimination; works anchor -> ends its ramp; pad building -> rubble. */
function killStructure(w: World, target: Entity, killer: TeamTally, killerTeam: number, cut: number): void {
  const tp = target.transform;
  const st = target.structure!;
  if (st.type === "core") {
    w.nav.setBlocked(tp.pos.x, tp.pos.z, w.data.structures.core.radius + 0.4, false);
    if (w.teamCount === 2) {
      w.endMatch(1 - target.team, "core destroyed");
      return;
    }
    w.eliminate(target.team, killerTeam);
    return;
  }
  if (st.works !== undefined) {
    const m = w.mods.find((k) => k.id === st.works);
    if (m && m.until > w.time) {
      m.until = w.time;
      const text =
        m.style === "ice" ? "SNOW FORT BROKEN" : m.style === "lookout" ? "LOOKOUT TOPPLED" : "RAMP DESTROYED";
      w.emit({ type: "notice", team: target.team, text });
    }
    return;
  }
  if (st.padIndex < 0) {
    // Free-standing hero structure (turret, ballista, cask...): just unblock its footprint.
    w.nav.setBlocked(tp.pos.x, tp.pos.z, st.cask ? 0.3 : target.radius, false);
    return;
  }
  const pad = w.pads[st.padIndex];
  pad.structureId = 0;
  w.nav.setBlocked(pad.x, pad.z, w.data.structures.structureRadius + 0.45, false);
  killer.resource += w.data.match.economy.bounty.structure * cut;
  w.teams[target.team].structuresLost++;
  if (w.data.structures.types[st.type as "damage"]?.class === "tower") {
    w.loseGold(target.team, w.data.match.economy.loss.tower, "TOWER LOST");
    if (killerTeam >= 0) w.rally(killerTeam);
  }
  pad.rubbleUntil = w.time + rubbleSeconds(w, pad.zone);
  pad.rubbleTeam = target.team;
}

/** How long a destroyed pad stays unbuildable. */
function rubbleSeconds(w: World, zone: Pad["zone"]): number {
  const s = w.data.structures;
  return zone === "home" ? (s.rubbleHomeSeconds ?? s.rubbleSeconds) : s.rubbleSeconds;
}

/** Kill-triggered hero hooks: killResetsB, Vanish (killHeal / killResetsR), and hexed victims rising as temporary grunts for the hexer. */
function onKillSynergy(w: World, target: Entity, src: Entity | null): void {
  const t = w.time;
  if (src?.hero && w.heroDef(src.hero.type).hooks.killResetsB) {
    if (target.hero || target.structure) src.hero.cooldowns.b = t;
  }
  // Vanish (Grim): a champion kill patches him up and readies Smoke, to get out after the pick.
  const hk = src?.hero ? w.heroDef(src.hero.type).hooks : undefined;
  if (src?.hero && src.alive && target.hero && hk) {
    if (hk.killHeal) w.heal(src, src.maxHp * hk.killHeal);
    if (hk.killResetsR) src.hero.cooldowns.r = t;
  }
  if (target.kind !== "structure" && t < target.status.hexUntil) {
    const owner = w.get(target.status.hexOwner);
    if (!owner?.hero || owner.team === target.team) return;
    const raised = w.entities.filter((o) => o.alive && o.unit && o.owner === owner.id && o.unit.raised).length;
    if (raised >= (w.heroDef(owner.hero.type).hooks.raiseMax ?? 5)) return;
    const u = spawnUnit(w, owner.team, "grunt", target.transform.pos.x, target.transform.pos.z, 1);
    if (u) {
      u.expiresAt = t + (w.heroDef(owner.hero.type).hooks.raiseSeconds ?? 15);
      u.owner = owner.id;
      u.unit!.raised = true;
      w.emit({
        type: "warcry",
        x: target.transform.pos.x,
        y: target.transform.y,
        z: target.transform.pos.z,
        radius: 1.5,
        team: owner.team,
      });
    }
  }
}

/** Unit veterancy: accumulate kill value and rank up, scaling damage/max hp and healing a little. */
export function promote(w: World, e: Entity, value: number): void {
  const u = e.unit!;
  const vet = w.data.units.veterancy;
  u.kills += value;
  let next = u.rank;
  while (next < vet.names.length && u.kills >= vet.killsForRank[next]) next++;
  if (next <= u.rank) return;
  const dmgK = (1 + vet.damagePerRank * next) / (1 + vet.damagePerRank * u.rank);
  const hpK = (1 + vet.hpPerRank * next) / (1 + vet.hpPerRank * u.rank);
  u.rank = next;
  u.damage *= dmgK;
  e.maxHp *= hpK;
  e.hp = Math.min(e.maxHp, e.hp * hpK + e.maxHp * vet.healOnRank);
  const p = e.transform;
  w.emit({ type: "rankUp", id: e.id, rank: next, x: p.pos.x, y: p.y, z: p.pos.z, team: e.team });
}

/** Lose gold on a setback (reduced by catch-up). */
export function loseGold(w: World, team: number, amount: number, why: string): void {
  const ts = w.teams[team];
  const lost = Math.min(ts.resource, Math.round(amount * (1 - ts.catchUp)));
  if (lost <= 0) return;
  ts.resource -= lost;
  w.emit({ type: "notice", team, text: `${why} · -${Math.round(lost)} GOLD` });
}

/** Felling a tower rallies the killer's army: temporary damage/speed buff. */
export function rally(w: World, team: number): void {
  const r = w.data.match.economy.rally;
  for (const o of w.entities) {
    if (!o.alive || o.team !== team || o.structure) continue;
    o.status.rallyUntil = w.time + r.seconds;
  }
  w.emit({ type: "notice", team, text: `TOWER FELLED · ARMY RALLIES ${r.seconds}S` });
  for (let o = 0; o < w.teamCount; o++)
    if (o !== team)
      w.emit({ type: "notice", team: o, text: `${w.teamName(team)} FELLED A TOWER · THEIR ARMY RALLIES` });
}

/** FFA: a team whose core falls is out; its heroes stay dead and its other entities are removed. */
export function eliminate(w: World, team: number, by: number): void {
  const ts = w.teams[team];
  if (!ts || ts.out) return;
  ts.out = true;
  ts.resource = 0;
  ts.grain = 0;
  for (const e of w.entities) {
    if (e.team !== team || e === w.core(team)) continue;
    // Champions already dead when the keep falls must not come back either (they're waiting on a respawn timer).
    if (e.hero) {
      e.alive = false;
      e.hero.dead = true;
      e.hero.respawnAt = Infinity;
      e.hero.action = null;
      continue;
    }
    if (!e.alive) continue;
    if (e.structure?.padIndex !== undefined && e.structure.padIndex >= 0) {
      const pad = w.pads[e.structure.padIndex];
      pad.structureId = 0;
      w.nav.setBlocked(pad.x, pad.z, w.data.structures.structureRadius + 0.45, false);
      pad.rubbleUntil = w.time + rubbleSeconds(w, pad.zone);
    } else if (e.structure) w.nav.setBlocked(e.transform.pos.x, e.transform.pos.z, e.radius, false);
    e.hp = 0;
    e.alive = false;
    w.emit({
      type: "death",
      id: e.id,
      kind: e.kind,
      x: e.transform.pos.x,
      y: e.transform.y,
      z: e.transform.pos.z,
      team: e.team,
      big: !!e.structure,
    });
  }
  const left = w.teams.map((_, i) => i).filter((i) => w.standing(i));
  w.emit({
    type: "notice",
    team: -1,
    text: by >= 0 ? `${w.teamName(by)} DESTROYS THE ${w.teamName(team)} KEEP` : `THE ${w.teamName(team)} KEEP FALLS`,
  });
  w.emit({ type: "eliminated", team, by });
  if (left.length === 1) w.endMatch(left[0], "last house standing");
}
