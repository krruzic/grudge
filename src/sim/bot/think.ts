// Bot decision making, run every ~0.2-0.5s from Bot.command(). think() sets intents on the Bot (goal to walk to,
// want* button flags, placement/facing) which command() turns into a Command. Phases, first match wins:
//   shop errands -> objectives (relic, shrine, assist a mate) -> retreat when low -> react to enemy casts ->
//   recall -> ability usage -> map lantern -> fight / kite -> gravewalk -> raid / hunt -> macro (build, army).
// Bots must be deterministic: their only randomness is Bot.rand(), so the order of rand() calls matters.
import type { Bot } from "../bot.ts";
import type { World } from "../world.ts";
import type { Entity, HeroState, Vec2 } from "../types.ts";
import type { AbilityDef, BotPlan, HeroDef } from "../config.ts";
import { buildCost } from "../structures.ts";
import { graveSpots } from "../heroes.ts";
import { clumpScore, healSpotScore } from "../hero/friar.ts";
import {
  assistTarget,
  baseThreat,
  enemyHeroes,
  frontTarget,
  grassCover,
  graveTarget,
  mateHero,
  ok,
} from "./awareness.ts";
import { pickBuild, shop } from "./economy.ts";
import { foesDown, pressing, realThreat } from "./strategy.ts";
import {
  duelistFight,
  engineerFight,
  friarEscape,
  friarPowder,
  heaveDir,
  raiderFight,
  summonerFight,
  vintnerFight,
  wardenFight,
  warlordFight,
  wrenAbilities,
  wrenShoot,
} from "./tactics.ts";

/** What the bot knows about the fight this think. */
interface Senses {
  me: Entity;
  p: Vec2;
  h: HeroState;
  /** Enemy hero currently threatening the bot's mate, if the bot should help. */
  assist: Entity | undefined;
  /** The assist target, else the nearest reachable enemy hero. */
  enemyHero: Entity | undefined;
  ehAlive: boolean | undefined;
  dHero: number;
  plan: BotPlan;
  /** Retreating to heal (unless a kill is right there). */
  lowHp: boolean;
  /** The local fight: > 0.25 advantage, < -0.25 disadvantage (see situation()). */
  edge: number;
  smoked: boolean;
}

/** Ability-usage context, computed once the bot has decided to stay and fight. */
interface Kit {
  nearby: Entity[];
  def: HeroDef;
  ab: HeroDef["abilities"];
  /** Preferred engagement distance (> 3 = ranged kiting hero). */
  prefer: number;
  rdy: (k: string) => boolean;
  allies: number;
  enemyAttacking: boolean | undefined;
  /** Whether the ability's data-driven bot hint says "use it now". */
  useHint: (k: "b" | "r" | "z", d: number) => boolean;
}

export function think(bot: Bot, w: World, me: Entity): void {
  // A held charge is let go unless this think wants it held again.
  bot.wantCharge = null;
  bot.chargeRange = Infinity;
  const s = sense(bot, w, me);
  bot.why = "shop";
  if (!w.tdm && shop(bot, w, me, !!s.ehAlive && s.dHero < 8)) return;
  bot.why = "objective";
  if (objectives(bot, w, s)) return;
  const h = s.h;
  const swarm = w.enemiesNear(me, 6, (o) => !!o.unit).length;
  const graveDef = w.heroDef(h.type).abilities.r;
  const graveReady = graveDef.kind === "gravewalk" && (h.cooldowns.r ?? 0) <= w.time && !h.action;
  if (s.lowHp) {
    bot.why = "heal";
    retreat(bot, w, s, swarm, graveReady);
    return;
  }
  reactToCasts(bot, s);
  if (h.recallAt !== undefined) {
    bot.goal = null;
    return;
  }
  // Recall home when a building at home is really losing its fight and we're far away and out of combat.
  if (!h.recallUsed && w.time - h.combatAt > 3 && !w.enemiesNear(me, 9).length) {
    const threat = realThreat(w, me.team);
    const core = w.core(me.team);
    if (threat && core && w.dist(me, core) > 35 && w.dist(me, threat) > 30) {
      bot.wantRecall = true;
      bot.goal = null;
      return;
    }
  }
  const k = kit(bot, w, s);
  bot.why = "ability";
  if (useAbilities(bot, w, s, k)) return;
  bot.why = "event";

  const lan = w.mapEvents.lantern;
  if (
    lan &&
    lan.state !== "rise" &&
    !s.lowHp &&
    Math.hypot(lan.x - s.p.x, lan.z - s.p.z) < 22 &&
    !(s.ehAlive && s.dHero < 4) &&
    ok(bot, w, me, lan)
  ) {
    bot.goal = { x: lan.x, z: lan.z };
    return;
  }
  // Dune serpent: get out of a breach warning circle.
  const sp = w.mapEvents.serpent;
  if (sp && sp.mode === "warn") {
    const r = (w.mapEvents.serpentDef?.breachRadius ?? 3) + 1.5;
    const dx = s.p.x - sp.x;
    const dz = s.p.z - sp.z;
    const dd = Math.hypot(dx, dz);
    if (dd < r) {
      const k = (r + 1) / (dd || 1);
      bot.goal = { x: sp.x + dx * k, z: sp.z + dz * k };
      return;
    }
  }
  // Cider wells: when nearby wells are about to erupt, step onto one whose landing point is closer to the enemy
  // keep than we are (a free flank), unless we're in a fight.
  const ev = w.mapEvents;
  if (ev.geysers && ev.geyserWarned && !(s.ehAlive && s.dHero < 6)) {
    const foe = w.teams.findIndex((_, t) => t !== me.team && !!w.core(t));
    const fc = foe >= 0 ? w.core(foe) : undefined;
    if (fc) {
      const fx = fc.transform.pos.x;
      const fz = fc.transform.pos.z;
      const mine = Math.hypot(s.p.x - fx, s.p.z - fz);
      for (const wl of ev.geyserWells) {
        if (wl.group !== ev.geyserGroup || Math.hypot(wl.x - s.p.x, wl.z - s.p.z) > 9) continue;
        if (Math.hypot(wl.tx - fx, wl.tz - fz) > mine - 8) continue;
        bot.goal = { x: wl.x, z: wl.z };
        return;
      }
    }
  }
  // Too many enemy units around the enemy hero (beyond the plan's tolerance): don't dive it.
  const heroCrowd = s.ehAlive ? crowdAt(w, me, s.enemyHero!) : 0;
  const crowded =
    s.plan.crowd !== undefined && !s.smoked && heroCrowd > s.plan.crowd && s.enemyHero!.hp > s.enemyHero!.maxHp * 0.35;
  // Every enemy champion is dead: the window is for breaking buildings, not trading with soldiers.
  bot.why = "siege";
  if (foesDown(w, me.team) && siege(bot, w, s)) return;
  bot.why = "fight";
  if (fight(bot, w, s, k, crowded)) return;
  bot.fightId = 0;
  bot.why = "siege";
  if (siege(bot, w, s)) return;
  bot.why = "raid";
  if (gravewalk(bot, w, s, graveReady)) return;
  if (w.tdm) {
    tdmRoam(bot, w, s);
    return;
  }
  if (raidOrHunt(bot, w, s, k, crowded)) return;
  macro(bot, w, s);
}

/**
 * Team deathmatch personalities by champion, so a house doesn't move as one blob:
 *   0 brawler (Warlord, Thorn, Stig)  the nearest enemy, head on
 *   1 flanker (Grim)                  the enemy with the fewest friends around it
 *   2 hunter (Francois)               the weakest enemy in reach (the Grudge carrier first)
 *   3 skirmisher (Wren, Remnil)       the nearest enemy, come at from the side
 *   4 support (Maddock, Herald)       the enemy closest to a hurt friend; otherwise sticks with the house
 */
const TDM_STYLE: Record<string, number> = {
  warlord: 0,
  warden: 0,
  engineer: 0,
  raider: 1,
  duelist: 2,
  marksman: 3,
  summoner: 3,
  friar: 4,
  herald: 4,
  vintner: 0,
};

export function tdmStyle(me: Entity): number {
  return TDM_STYLE[me.hero?.type ?? ""] ?? 0;
}

function tdmPrey(bot: Bot, w: World, me: Entity): Entity | undefined {
  const style = tdmStyle(me);
  // A teammate's callout: fight whoever is around the called spot.
  const call = w.tdm?.calloutOf(me.team);
  if (call) {
    let pick: Entity | undefined;
    let pd = Infinity;
    for (const e of enemyHeroes(bot, w, me)) {
      if (!e.alive || !ok(bot, w, me, e)) continue;
      const d = Math.hypot(e.transform.pos.x - call.x, e.transform.pos.z - call.z);
      if (d < 16 && d < pd) {
        pd = d;
        pick = e;
      }
    }
    if (pick) return pick;
  }
  const carrier = w.arena.relic.state === "carried" ? w.arena.relic.carrier : 0;
  let best: Entity | undefined;
  let bs = Infinity;
  for (const e of enemyHeroes(bot, w, me)) {
    if (!e.alive || !ok(bot, w, me, e)) continue;
    const d = w.dist(me, e);
    if (d > 40) continue;
    let score = d;
    if (style === 1) {
      let friends = 0;
      for (const o of w.entities) if (o !== e && o.alive && o.hero && o.team === e.team && w.dist(o, e) < 8) friends++;
      score = d * 0.4 + friends * 10;
    } else if (style === 2) score = d * 0.3 + (e.hp / e.maxHp) * 25 - (e.id === carrier ? 15 : 0);
    else if (style === 4) {
      // Peel for the most hurt friend nearby.
      let near = Infinity;
      for (const o of w.entities)
        if (o !== me && o.alive && o.hero && o.team === me.team && o.hp < o.maxHp * 0.7)
          near = Math.min(near, w.dist(o, e));
      score = Math.min(near, d + 6) + d * 0.2;
    }
    if (score < bs) {
      bs = score;
      best = e;
    }
  }
  return best;
}

/** Nearest ready power-up within `range` (potions only with `potion`), for team deathmatch. */
function nearPowerup(w: World, me: Entity, range: number, potion = false): Vec2 | null {
  let best: Vec2 | null = null;
  let bd = range;
  for (const p of w.tdm?.powerups ?? []) {
    if (w.time < p.readyAt || (potion && p.kind !== "potion")) continue;
    // A potion can't be drunk at full health: standing on it waiting is how CPUs got parked in corners.
    if (p.kind === "potion" && me.hp >= me.maxHp) continue;
    const d = Math.hypot(p.x - me.transform.pos.x, p.z - me.transform.pos.z);
    if (d < bd) {
      bd = d;
      best = { x: p.x, z: p.z };
    }
  }
  return best;
}

/**
 * Team deathmatch, nothing in reach: top up on a nearby potion when hurt, grab a power-up on the way, else go
 * hunting the nearest enemy champion (the Grudge carrier first), else head for the middle.
 */
function tdmRoam(bot: Bot, w: World, s: Senses): void {
  const { me } = s;
  // Power-ups are worth a detour: anything ready within 20 m (a potion within 24 m when hurt).
  const pot = me.hp < me.maxHp * 0.75 ? nearPowerup(w, me, 24, true) : null;
  const pw = pot ?? nearPowerup(w, me, 20);
  if (pw) {
    bot.goal = pw;
    return;
  }
  // A teammate called a push: head there (tdmPrey already picks fights around it).
  const call = w.tdm?.calloutOf(me.team);
  if (call && Math.hypot(call.x - me.transform.pos.x, call.z - me.transform.pos.z) > 4) {
    bot.goal = call;
    return;
  }
  const r = w.arena.relic;
  const carrier = r.state === "carried" ? w.getAny(r.carrier) : undefined;
  let prey: Entity | undefined = carrier && carrier.team !== me.team ? carrier : undefined;
  if (!prey) {
    let bd = Infinity;
    for (const e of w.entities) {
      if (!e.alive || !e.hero || e.hero.dead || e.team === me.team) continue;
      const d = w.dist(me, e);
      if (d < bd) {
        bd = d;
        prey = e;
      }
    }
  }
  if (!prey) {
    bot.goal = { ...w.arena.home };
    return;
  }
  const style = tdmStyle(me);
  if (style === 4) {
    // Support: stay a few metres behind the friend nearest the fight.
    let mate: Entity | undefined;
    let md = Infinity;
    for (const o of w.entities) {
      if (o === me || !o.alive || !o.hero || o.hero.dead || o.team !== me.team) continue;
      const dd = w.dist(o, prey);
      if (dd < md) {
        md = dd;
        mate = o;
      }
    }
    if (mate && md < 25) {
      const mp = mate.transform.pos;
      const dx = mp.x - prey.transform.pos.x;
      const dz = mp.z - prey.transform.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      bot.goal = { x: mp.x + (dx / dl) * 3, z: mp.z + (dz / dl) * 3 };
      return;
    }
  }
  // Far off: come at the target from this champion's own side (spread around it) instead of in a conga line.
  const pp = prey.transform.pos;
  const d = w.dist(me, prey);
  if (d > 9) {
    const side = [0, 1.2, -0.7, 1.6, 0][style] ?? 0;
    const ang = Math.atan2(me.transform.pos.x - pp.x, me.transform.pos.z - pp.z) + side * (me.id % 2 ? -1 : 1);
    const r = Math.min(d * 0.6, 8);
    bot.goal = { x: pp.x + Math.sin(ang) * r, z: pp.z + Math.cos(ang) * r };
  } else bot.goal = { x: pp.x, z: pp.z };
}

function sense(bot: Bot, w: World, me: Entity): Senses {
  const h = me.hero!;
  const assist = w.tdm ? undefined : assistTarget(bot, w, me);
  let enemyHero = assist ?? (w.tdm ? tdmPrey(bot, w, me) : undefined);
  if (!enemyHero) {
    let bd = Infinity;
    for (const e of enemyHeroes(bot, w, me)) {
      if (!ok(bot, w, me, e)) continue;
      const d = w.dist(me, e);
      if (d < bd) {
        bd = d;
        enemyHero = e;
      }
    }
  }
  const ehAlive = enemyHero && enemyHero.alive;
  const dHero = ehAlive ? w.dist(me, enemyHero!) : Infinity;
  const plan = w.heroDef(h.type).botPlan ?? {};
  const finish = !!ehAlive && dHero < 4 && enemyHero!.hp < enemyHero!.maxHp * 0.25 && enemyHero!.hp < me.hp;
  // Read the fight before running: ahead -> stay in much lower, behind -> leave earlier. Healing stops at 80%, or
  // sooner once nothing is threatening (or the fight has turned our way).
  const st = situation(w, me);
  const hpf = me.hp / me.maxHp;
  const base = plan.retreatHp ?? 0.3;
  let leaveAt = st.edge > 0.25 ? Math.max(0.12, base - 0.15) : st.edge < -0.25 ? base + 0.12 : base;
  // Every enemy champion is dead: this is the window to break things, only leave if nearly dead.
  const down = foesDown(w, me.team);
  if (down) leaveAt = Math.min(leaveAt, 0.15);
  const enemyWorse = !!ehAlive && dHero < 10 && enemyHero!.hp / enemyHero!.maxHp < hpf - 0.1;
  if (hpf < leaveAt && !(enemyWorse && st.edge >= 0)) bot.healing = true;
  else if (hpf > 0.8 || (st.threat === 0 && hpf > 0.55) || (st.edge > 0.25 && hpf > 0.45) || (down && hpf > 0.25))
    bot.healing = false;
  const lowHp = bot.healing && !finish;
  const smoked = w.time < me.status.stealthUntil;
  return { me, p: me.transform.pos, h, assist, enemyHero, ehAlive, dHero, plan, lowHp, smoked, edge: st.edge };
}

/**
 * The fight around the bot (12 m): our side's strength (champions by hp, soldiers, our towers covering us) against
 * theirs. `edge` -1..1: > 0.25 advantage, < -0.25 disadvantage, else neutral; `threat` = their raw strength.
 */
function situation(w: World, me: Entity): { edge: number; threat: number } {
  let mine = 0;
  let theirs = 0;
  const p = me.transform.pos;
  for (const o of w.entities) {
    if (!o.alive || o.team < 0 || o.neutral) continue;
    const d = Math.hypot(o.transform.pos.x - p.x, o.transform.pos.z - p.z);
    let v = 0;
    if (o.hero && !o.hero.dead && d < 12) v = 0.4 + (o.hp / o.maxHp) * 0.8;
    else if (o.unit && d < 10) v = 0.15 * (1 + o.unit.rank * 0.3);
    else if (o.structure?.ready && o.structure.damage > 0 && d < o.structure.range + 1) v = 0.8;
    if (!v) continue;
    if (o.team === me.team) mine += v;
    else theirs += v;
  }
  return { edge: (mine - theirs) / Math.max(mine, theirs, 0.6), threat: theirs };
}

/** Enemy units near `t` minus own units near the bot. */
function crowdAt(w: World, me: Entity, t: Entity): number {
  let foes = 0;
  let mine = 0;
  for (const o of w.entities) {
    if (!o.alive || !o.unit) continue;
    if (o.team !== me.team && o.team !== -1 && w.dist(o, t) < 5.5) foes++;
    else if (o.team === me.team && w.dist(o, me) < 7) mine++;
  }
  return foes - mine;
}

/** Relic carry/steal/pickup, chasing an enemy relic carrier, and running to help a mate. */
function objectives(bot: Bot, w: World, s: Senses): boolean {
  const { me, p, h, enemyHero, ehAlive, dHero, lowHp, assist } = s;
  const relic = w.arena.relic;
  if (w.arena.carrying(me) && !w.tdm) {
    // Bring the relic to the nearest own tower/keep.
    let best: Entity | undefined;
    let bd = Infinity;
    for (const o of w.entities) {
      if (!o.alive || o.team !== me.team || !w.arena.isTowerOrKeep(o) || !ok(bot, w, me, o)) continue;
      const d = w.dist(me, o);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) bot.goal = { x: best.transform.pos.x, z: best.transform.pos.z };
    return true;
  }
  const enemyShrine =
    relic.state === "shrined" && relic.team >= 0 && relic.team !== me.team ? w.arena.shrineOf(relic.team) : null;
  if (enemyShrine && !lowHp && w.dist(me, enemyShrine) < 22 && !(ehAlive && dHero < 5) && ok(bot, w, me, enemyShrine)) {
    bot.goal = { x: enemyShrine.transform.pos.x, z: enemyShrine.transform.pos.z };
    return true;
  }
  if ((relic.state === "home" || relic.state === "dropped") && !lowHp && ok(bot, w, me, relic)) {
    const dr = Math.hypot(relic.x - p.x, relic.z - p.z);
    if (dr < 14 || (relic.state === "home" && !(ehAlive && dHero < 6))) {
      bot.goal = { x: relic.x, z: relic.z };
      if (dr > 3) return true;
    }
  }
  if (relic.state === "carried" && relic.carrier === enemyHero?.id && ehAlive && dHero < 16) {
    bot.goal = { x: enemyHero!.transform.pos.x, z: enemyHero!.transform.pos.z };
    if (dHero < 2.2) {
      bot.wantAttack = true;
      bot.wantBlock = bot.rand() < 0.5;
    }
    if (dHero > 2.5) return true;
  }
  if (assist && !lowHp && dHero > 9 + (w.heroDef(h.type).botRange ?? 1.8) && ok(bot, w, me, assist)) {
    bot.goal = { x: assist.transform.pos.x, z: assist.transform.pos.z };
    const ab0 = w.heroDef(h.type).abilities;
    if (ab0.r.bot === "approach" && (h.cooldowns.r ?? 0) <= w.time && dHero < (ab0.r.botRange ?? 10)) bot.wantR = true;
    return true;
  }
  return false;
}

/** Low hp: gravewalk home, recall, use the plan's escape ability, heal, hide in grass, fight only if cornered. */
function retreat(bot: Bot, w: World, s: Senses, swarm: number, graveReady: boolean): void {
  const { me, p, h, enemyHero, ehAlive, dHero, plan } = s;
  // Team deathmatch has no home: run for a potion, else somewhere the enemy isn't.
  const sp = w.tdm ? (nearPowerup(w, me, 30, true) ?? w.tdm.safeFrom(me)) : w.spawnPoint(me.team);
  bot.goal = sp;
  if (h.recallAt !== undefined) {
    bot.goal = null;
    return;
  }
  const home = graveReady ? graveSpots(w, me).find((g) => g.keep) : undefined;
  if (home && !(ehAlive && dHero < 2.5)) {
    bot.wantR = true;
    bot.wantPlace = { x: home.x - p.x, z: home.z - p.z };
    bot.goal = null;
    return;
  }
  const core = w.core(me.team);
  if (!h.recallUsed && dHero > 10 && swarm === 0 && core && w.dist(me, core) > 25 && w.time - h.combatAt > 1.5) {
    bot.wantRecall = true;
    bot.goal = null;
    return;
  }
  const esc = plan.escape;
  if (esc && (h.cooldowns[esc] ?? 0) <= w.time && (dHero < 5 || swarm >= 2)) {
    const ex = sp.x - me.transform.pos.x;
    const ez = sp.z - me.transform.pos.z;
    const el = Math.hypot(ex, ez) || 1;
    bot.wantPlace = { x: (ex / el) * 8, z: (ez / el) * 8 };
    if (esc === "b") bot.wantB = true;
    else bot.wantR = true;
  }
  // Friar: keg at his feet, then KEG ROCKET home (bot/tactics.ts).
  if (w.heroDef(h.type).abilities.b.kind === "keg" && friarEscape(bot, w, me, sp)) return;
  if (plan.healer && (h.cooldowns.b ?? 0) <= w.time && healSpotScore(w, me) >= 80) bot.wantB = true;
  const cover = ehAlive ? grassCover(bot, w, me, enemyHero!, dHero) : null;
  if (cover) bot.goal = cover;
  bot.wantBlock = dHero < 3 && bot.rand() < 0.5;
  if (dHero < 2.6) bot.wantAttack = true;
}

/** Dodge (skill-scaled) or block when the enemy hero starts a B or super close by. */
function reactToCasts(bot: Bot, s: Senses): void {
  const eh = s.enemyHero;
  if (
    s.ehAlive &&
    eh!.hero!.action &&
    (eh!.hero!.action.name === "b" || eh!.hero!.action.name === "z") &&
    s.dHero < 4.5
  ) {
    if (bot.rand() < bot.skill * 0.6) bot.wantDodge = true;
    else if (bot.rand() < 0.5) bot.wantBlock = true;
  }
}

function kit(bot: Bot, w: World, s: Senses): Kit {
  const { me, p, h, ehAlive, dHero } = s;
  const nearby = w.enemiesNear(me, 7);
  const def = w.heroDef(h.type);
  const ab = def.abilities;
  const prefer = def.botRange ?? 1.8;
  const rdy = (k: string) => (h.cooldowns[k] ?? 0) <= w.time;
  const allies = w.entities.filter((o) => o.alive && o.unit && o.team === me.team && w.dist(me, o) < 9).length;
  const enemyAttacking =
    ehAlive && !!s.enemyHero!.hero!.action && s.enemyHero!.hero!.action.name !== "dodge" && dHero < 3.5;
  // Abilities carry a `bot` hint in data/heroes.json describing when to use them.
  const useHint = (k: "b" | "r" | "z", d: number): boolean => {
    const a: AbilityDef = ab[k];
    switch (a.bot) {
      case "fight":
        return d <= (a.botRange ?? 3);
      case "allies":
        return allies >= 3 && nearby.length >= 2;
      // War Cry / Brewfest: in deathmatch (no army) when an enemy champion is close; otherwise in an army brawl.
      case "roar":
        return (
          (!!w.tdm && !!ehAlive && dHero < (a.dm?.cowRadius ?? a.cowRadius ?? 6) - 1) ||
          (allies >= 3 && nearby.length >= 2)
        );
      case "defend":
        return !!enemyAttacking;
      case "approach":
        return !!ehAlive && dHero < (a.botRange ?? 10) && dHero > 4;
      case "banner": {
        const bp = w.rallyPoint(me.team);
        return allies >= 3 && (!bp || Math.hypot(bp.x - p.x, bp.z - p.z) > 10);
      }
      case "works":
        return (
          !w.mods.some((m) => m.kind === "works" && m.owner === me.id) &&
          w.entities.some(
            (o) =>
              o.alive && o.structure && o.team !== me.team && !o.structure.siege && w.dist(me, o) < (a.botRange ?? 12),
          )
        );
      case "repair":
        return (
          w.entities.some(
            (o) =>
              o.alive && o.structure && o.team === me.team && o.hp < o.maxHp * 0.7 && w.dist(me, o) < (a.radius ?? 6),
          ) ||
          (!!w.heroDef(me.hero!.type).hooks.overhaulHeal &&
            nearby.length >= 1 &&
            w.entities.filter((o) => o.alive && o.unit && o.team === me.team && w.dist(me, o) < (a.radius ?? 6))
              .length >= 3)
        );
      case "heal":
        return healSpotScore(w, me) >= (bot.role === "solo" ? 150 : 110);
      default:
        return false;
    }
  };
  return { nearby, def, ab, prefer, rdy, allies, enemyAttacking, useHint };
}

/**
 * Non-targeted ability usage: Pip vs divers, super, siege-hero works/ballista sequencing, utility R/B by hint,
 * healer powder kegs. Returns true when walking to the bot's works takes over this think.
 */
function useAbilities(bot: Bot, w: World, s: Senses, k: Kit): boolean {
  const { me, p, h, enemyHero, ehAlive, dHero, plan, lowHp } = s;
  const { nearby, ab, prefer, rdy, useHint } = k;
  // Marksman: expert Pip/SKYSHOT/RAKE/interrupt rules, and Heartseeker held for kills (bot/tactics.ts).
  const hk = w.heroDef(h.type).hooks;
  // Raider: ambush with the biggest hit, Execute Dash kept for the wounded.
  const zDecided =
    ab.b.kind === "pip"
      ? wrenAbilities(bot, w, me)
      : ab.b.kind === "leap" && ab.z.kind === "dash" && raiderFight(bot, w, me, ehAlive ? enemyHero : undefined);
  // Warlord: charged slam (bot/tactics.ts).
  if (hk.heaveRange) warlordFight(bot, w, me, ehAlive ? enemyHero : undefined);
  // Engineer: charged Repair as a fight nuke.
  if (ab.b.kind === "repair") engineerFight(bot, w, me, ehAlive ? enemyHero : undefined);
  // Duelist: parry reads, charged lunge, flurry on the stunned.
  if (ab.r.kind === "parry") duelistFight(bot, w, me, ehAlive ? enemyHero : undefined);
  // Warden: charged slap in melee.
  if (ab.r.kind === "wall") wardenFight(bot, w, me, ehAlive ? enemyHero : undefined);
  if (
    hk.heaveRange &&
    rdy("heave") &&
    !h.action &&
    ehAlive &&
    w.time < enemyHero!.status.stunUntil &&
    dHero < hk.heaveRange + 0.6
  ) {
    // Warlord: heave a stunned hero into a friendly tower, else back toward our core.
    bot.wantAttack = true;
    bot.wantBlock = true;
    bot.wantFace = heaveDir(w, me, enemyHero!);
  }
  const full = h.meter >= w.data.heroes.baseline.superMax;
  const siegeHero = ab.z.kind === "ballista";
  const zTarget = plan.zBelow === undefined || (ehAlive && enemyHero!.hp < enemyHero!.maxHp * plan.zBelow);
  if (
    !zDecided &&
    full &&
    zTarget &&
    (!siegeHero || !rdy("r")) &&
    ((ehAlive && useHint("z", dHero)) || (plan.zBelow === undefined && nearby.length >= 4))
  )
    bot.wantZ = true;
  if (!zDecided && bot.wantZ && ehAlive && prefer > 3 && w.canSee(me, enemyHero!)) {
    const zx = enemyHero!.transform.pos.x - p.x;
    const zz = enemyHero!.transform.pos.z - p.z;
    const zl = Math.hypot(zx, zz) || 1;
    bot.wantFace = { x: zx / zl, z: zz / zl };
  }
  if (siegeHero && full && !lowHp) {
    // Engineer: build works first (R), then walk onto it and drop the ballista (Z) on top.
    const works = w.mods.find((m) => m.kind === "works" && m.owner === me.id && m.cx !== undefined);
    if (works) {
      if (Math.hypot(works.cx! - p.x, works.cz! - p.z) < 1.3) bot.wantZ = true;
      else if (!(ehAlive && dHero < 4)) {
        bot.goal = { x: works.cx!, z: works.cz! };
        return true;
      }
    } else if (
      rdy("r") &&
      ((ehAlive && dHero < 10) ||
        nearby.length >= 2 ||
        w.entities.some(
          (o) => o.alive && o.structure && o.team !== me.team && !o.structure.siege && w.dist(me, o) < 16,
        ))
    )
      bot.wantR = true;
  }
  if (rdy("r") && ab.r.bot !== "fight" && ab.r.kind !== "parry" && useHint("r", dHero)) bot.wantR = true;
  if (rdy("b") && (ab.b.bot === "repair" || ab.b.bot === "banner" || ab.b.bot === "heal") && useHint("b", 0))
    bot.wantB = true;
  if (ab.r.kind === "powderkeg") friarPowder(bot, w, me, ehAlive ? enemyHero : undefined, clumpScore(w, me));
  else if (plan.healer && rdy("r") && ab.r.bot === "fight" && clumpScore(w, me) >= 3 && bot.rand() < 0.5)
    bot.wantR = true;
  return false;
}

/**
 * Pick and fight a target. Hit-and-run plans open with their opener then back off (kiting toward nearby enemy
 * units instead) until the opener is ready again; ranged heroes hold `prefer` distance and back away from melee.
 * Returns true when a fight/kite decision was made.
 */
function fight(bot: Bot, w: World, s: Senses, k: Kit, crowded: boolean): boolean {
  const { me, p, enemyHero, ehAlive, dHero, plan, lowHp, smoked } = s;
  const { nearby, ab, prefer, rdy, useHint, enemyAttacking } = k;
  if (
    plan.opener &&
    rdy(plan.opener) &&
    ehAlive &&
    !smoked &&
    !crowded &&
    dHero > 3.5 &&
    dHero < (plan.openerRange ?? 14) &&
    !lowHp
  ) {
    if (plan.opener === "r") bot.wantR = true;
    else bot.wantB = true;
    bot.openedAt = w.time;
  }
  const outmatched =
    !!plan.huntRatio &&
    ehAlive &&
    !smoked &&
    w.time - bot.openedAt > 1.5 &&
    enemyHero!.hp > me.hp * plan.huntRatio &&
    dHero > 2.2 &&
    s.edge < 0.25;
  const engage =
    !outmatched &&
    (!plan.hitAndRun ||
      !plan.opener ||
      smoked ||
      w.time - bot.openedAt < plan.hitAndRun ||
      rdy(plan.opener) ||
      (ehAlive && enemyHero!.hp < enemyHero!.maxHp * 0.35) ||
      dHero < 2.2);
  if (ehAlive && !engage && dHero < 12 && !crowded) {
    // Disengage: farm a unit away from the enemy hero, or back off to 9 cells.
    const ex = p.x - enemyHero!.transform.pos.x;
    const ez = p.z - enemyHero!.transform.pos.z;
    const el = Math.hypot(ex, ez) || 1;
    const prey = nearby.find((o) => o.unit && w.dist(o, enemyHero!) > 6);
    bot.fightId = prey?.id ?? 0;
    bot.goal = prey
      ? { x: prey.transform.pos.x, z: prey.transform.pos.z }
      : { x: enemyHero!.transform.pos.x + (ex / el) * 9, z: enemyHero!.transform.pos.z + (ez / el) * 9 };
    if (prey && w.dist(me, prey) < 2.4) bot.wantAttack = true;
    return true;
  }
  let target: Entity | undefined;
  if (ehAlive && dHero < 9 + prefer && w.canSee(me, enemyHero!) && !crowded) target = enemyHero;
  else if (crowded && dHero < 12) {
    const close = nearby.find((o) => w.dist(me, o) < 2.6 && !o.structure);
    if (!close) {
      const ex = p.x - enemyHero!.transform.pos.x;
      const ez = p.z - enemyHero!.transform.pos.z;
      const el = Math.hypot(ex, ez) || 1;
      bot.goal = { x: p.x + (ex / el) * 4, z: p.z + (ez / el) * 4 };
      bot.fightId = 0;
      return true;
    }
    target = close;
  } else if (nearby.length) {
    nearby.sort((a, b) => w.dist(me, a) - w.dist(me, b));
    target =
      nearby.find((o) => (o.kind !== "structure" || w.dist(me, o) < 5) && w.canSee(me, o) && ok(bot, w, me, o)) ??
      undefined;
  }
  if (!target) return false;

  // Chasing a champion under their tower while hurt: back out of the tower's reach (not all the way home) -
  // unless we're clearly winning this fight or the target is nearly dead.
  const tower = w
    .enemiesNear(me, 12, (o) => o.structure?.type === "damage" && o.structure.ready && o.structure.works === undefined)
    .sort((a, b) => w.dist(me, a) - w.dist(me, b))[0];
  if (tower && me.hp < me.maxHp * 0.5 && target.hero && !lowHp && s.edge < 0.25 && target.hp > target.maxHp * 0.3) {
    const ax = p.x - tower.transform.pos.x;
    const az = p.z - tower.transform.pos.z;
    const al = Math.hypot(ax, az) || 1;
    const out = tower.structure!.range + 2;
    bot.goal = { x: tower.transform.pos.x + (ax / al) * out, z: tower.transform.pos.z + (az / al) * out };
    return true;
  }
  bot.fightId = target.id;
  const d = w.dist(me, target) - target.radius;
  const fx = target.transform.pos.x;
  const fz = target.transform.pos.z;
  if (prefer > 3) {
    const dx = p.x - fx;
    const dz = p.z - fz;
    const len = Math.hypot(dx, dz) || 1;
    bot.goal = { x: fx + (dx / len) * prefer, z: fz + (dz / len) * prefer };
  } else if (plan.flank && target.hero && d > 1.6) {
    const f = target.transform.facing;
    bot.goal = { x: fx - Math.sin(f) * 1.6, z: fz - Math.cos(f) * 1.6 };
  } else bot.goal = { x: fx, z: fz };
  const aReach = ab.a.kind === "combo" ? ab.a.hits![0].range - 0.1 : (ab.a.botRange ?? 6);
  if (d < aReach && bot.rand() < bot.skill) bot.wantAttack = true;
  const bOk = plan.gateB !== "opening" || smoked || target.hp < target.maxHp * 0.5 || crowdAt(w, me, target) <= 0;
  if (rdy("b") && ab.b.bot === "fight" && useHint("b", d) && bOk && bot.rand() < 0.35) bot.wantB = true;
  const pp = me.hero?.pip;
  if (
    pp?.phase === "on" &&
    pp.target === target.id &&
    (pp.until - w.time < 1 || target.hp < target.maxHp * 0.3 || (target.hero?.action && d < 4)) &&
    bot.rand() < 0.3 * bot.skill
  )
    bot.wantB = true;
  if (rdy("r") && ab.r.bot === "fight" && ab.r.kind !== "powderkeg" && useHint("r", d) && bot.rand() < 0.35)
    bot.wantR = true;
  if (target.hero?.action?.name === "a" && d < 2.8 && bot.rand() < 0.25 * bot.skill) bot.wantBlock = true;
  if (prefer > 3) {
    const tx = fx - p.x;
    const tz = fz - p.z;
    const tl = Math.hypot(tx, tz) || 1;
    const melee = !!target.hero && (w.heroDef(target.hero.type).botRange ?? 1.8) <= 3;
    if (melee && d < 4.5) {
      bot.goal = { x: p.x - (tx / tl) * 4, z: p.z - (tz / tl) * 4 };
      if (rdy("b") && ab.b.bot === "fight" && bot.rand() < 0.5 * bot.skill) bot.wantB = true;
      if (enemyAttacking && d < 3 && bot.rand() < 0.3 * bot.skill) bot.wantDodge = true;
    }
    if ((bot.wantAttack || bot.wantB || bot.wantR) && !bot.wantDodge) bot.wantFace = { x: tx / tl, z: tz / tl };
    // Marksman: charged Vantage power shots instead of tapping A (bot/tactics.ts).
    if (ab.b.kind === "pip") wrenShoot(bot, w, me, target);
    // Summoner: charged hex, bolt-range spacing.
    if (ab.b.kind === "hex") summonerFight(bot, w, me, target);
  }
  // Gristle: grit stance, wall headbutts, pounds, Switcheroo rescues, anvil curl (bot/tactics.ts).
  if (ab.b.kind === "headbutt") vintnerFight(bot, w, me, target);
  if (plan.healer && ab.a.kind === "combo") {
    // Melee healer: keep swinging at whatever is in reach.
    if (!target.hero) {
      bot.goal = { x: fx, z: fz };
      if (d < aReach && bot.rand() < bot.skill) bot.wantAttack = true;
    }
    const close = nearby
      .filter((o) => !o.structure && w.canSee(me, o) && w.dist(me, o) - o.radius < aReach + 0.2)
      .sort((a, b) => w.dist(me, a) - w.dist(me, b))[0];
    if (close && !bot.wantDodge && bot.rand() < bot.skill) {
      const cx = close.transform.pos.x - p.x;
      const cz = close.transform.pos.z - p.z;
      const cl = Math.hypot(cx, cz) || 1;
      bot.wantAttack = true;
      if (!bot.wantB && !bot.wantR) bot.wantFace = { x: cx / cl, z: cz / cl };
    }
  }
  return true;
}

/** Summoner: linger near the grave just walked to for 12s, or gravewalk to a structure under attack. */
function gravewalk(bot: Bot, w: World, s: Senses, graveReady: boolean): boolean {
  const { me, p, h, ehAlive, dHero } = s;
  const gv = h.grave ? w.get(h.grave.id) : undefined;
  if (h.grave && h.grave.id !== bot.graveId) {
    bot.graveId = h.grave.id;
    bot.graveAt = w.time;
  }
  if (gv?.alive && h.grave && w.time < bot.graveAt + 12 && !(ehAlive && dHero < 12)) {
    const gx = gv.transform.pos.x;
    const gz = gv.transform.pos.z;
    const dx = p.x - gx;
    const dz = p.z - gz;
    const dl = Math.hypot(dx, dz) || 1;
    if (dl > gv.radius + 3.5) bot.goal = { x: gx + (dx / dl) * (gv.radius + 2), z: gz + (dz / dl) * (gv.radius + 2) };
    else bot.goal = null;
    return true;
  }
  if (graveReady && (!ehAlive || dHero > 14)) {
    const dest = graveTarget(bot, w, me);
    if (dest) {
      bot.wantR = true;
      bot.wantPlace = { x: dest.x - p.x, z: dest.z - p.z };
      bot.goal = null;
      return true;
    }
  }
  return false;
}

/** Raiders hit undefended enemy structures; hunters stalk a weaker enemy hero from behind. */
function raidOrHunt(bot: Bot, w: World, s: Senses, k: Kit, crowded: boolean): boolean {
  const { me, enemyHero, ehAlive, dHero, plan, lowHp } = s;
  if (plan.raid && !lowHp && (!ehAlive || dHero > 20)) {
    let best: Entity | undefined;
    let bd = plan.raid;
    for (const o of w.entities) {
      if (
        !o.alive ||
        !o.structure ||
        o.team === me.team ||
        o.neutral ||
        o.structure.type === "core" ||
        o.structure.siege
      )
        continue;
      const d = w.dist(me, o);
      if (d >= bd || !ok(bot, w, me, o)) continue;
      if (w.entities.some((u) => u.alive && u.unit && u.team === o.team && w.dist(u, o) < 7)) continue;
      if (o.structure.type === "damage" && o.structure.ready && me.hp < me.maxHp * 0.8) continue;
      bd = d;
      best = o;
    }
    if (best) {
      bot.goal = { x: best.transform.pos.x, z: best.transform.pos.z };
      bot.fightId = best.id;
      if (w.dist(me, best) - best.radius < 2.2) bot.wantAttack = true;
      return true;
    }
  }
  if (
    plan.hunt &&
    ehAlive &&
    !crowded &&
    dHero < plan.hunt &&
    me.hp > me.maxHp * 0.7 &&
    enemyHero!.hp <= me.hp * (plan.huntRatio ?? 99) &&
    (!plan.opener || k.rdy(plan.opener)) &&
    ok(bot, w, me, enemyHero!) &&
    w.canSee(me, enemyHero!)
  ) {
    const f = enemyHero!.transform.facing;
    bot.goal =
      dHero > 16
        ? { x: enemyHero!.transform.pos.x, z: enemyHero!.transform.pos.z }
        : { x: enemyHero!.transform.pos.x - Math.sin(f) * 3, z: enemyHero!.transform.pos.z - Math.cos(f) * 3 };
    return true;
  }
  return false;
}

/**
 * Cashing in a lead: while pressing() holds (champions down, bigger army, building lead) march on the enemy base
 * with the soldiers and break what's in the way - the nearest of their buildings that's no farther from their keep
 * than we are, the keep itself once it's the closest. Keeps going until the lead is gone and the local fight has
 * turned, or we're too hurt.
 */
function siege(bot: Bot, w: World, s: Senses): boolean {
  const { me, p } = s;
  const core = w.foeCore(me.team, p.x, p.z);
  if (!core || w.tdm) return (bot.sieging = false);
  const lead = pressing(w, me.team);
  if (lead) bot.sieging = true;
  else if (bot.sieging && (s.edge < -0.25 || w.teams[me.team].unitCount < 2) && !foesDown(w, me.team))
    bot.sieging = false;
  if (!bot.sieging || me.hp < me.maxHp * 0.35) return false;
  const toCore = w.dist(me, core);
  let target: Entity = core;
  let bd = toCore;
  // A shielded keep only holds its ward while every home pad is built: knock out the nearest home building first.
  if ((core.structure?.ward ?? 0) > 0 && w.homeHeld(core.team)) {
    let hd = Infinity;
    for (const pad of w.pads) {
      if (pad.zone !== "home" || pad.side !== core.team || !pad.structureId) continue;
      const o = w.get(pad.structureId);
      if (!o?.alive || o.team !== core.team || !ok(bot, w, me, o)) continue;
      const d = w.dist(me, o);
      if (d < hd) {
        hd = d;
        target = o;
      }
    }
    bd = hd < Infinity ? hd : bd;
  }
  for (const o of w.entities) {
    if (!o.alive || !o.structure || o.team !== core.team || o.structure.siege || o === core) continue;
    if (w.dist(o, core) > toCore + 2) continue;
    const d = w.dist(me, o);
    if (d < bd && ok(bot, w, me, o)) {
      bd = d;
      target = o;
    }
  }
  if (!ok(bot, w, me, target)) return false;
  // Don't walk in alone ahead of the soldiers: wait near the front of the army until it's close.
  const army = w.entities.filter((o) => o.alive && o.unit && o.team === me.team && !o.unit.guard);
  const near = army.filter((o) => w.dist(o, target) < bd + 4).length;
  const reach = Math.max(2.2, Math.min(8, w.heroDef(me.hero!.type).botRange ?? 1.8));
  if (!foesDown(w, me.team) && near < 2 && army.length >= 2 && bd > 12) {
    let cx = 0;
    let cz = 0;
    for (const u of army) {
      cx += u.transform.pos.x;
      cz += u.transform.pos.z;
    }
    cx /= army.length;
    cz /= army.length;
    bot.goal = { x: cx + (target.transform.pos.x - cx) * 0.2, z: cz + (target.transform.pos.z - cz) * 0.2 };
    return true;
  }
  bot.fightId = target.id;
  const dx = p.x - target.transform.pos.x;
  const dz = p.z - target.transform.pos.z;
  const dl = Math.hypot(dx, dz) || 1;
  const stand = target.radius + reach * 0.8;
  bot.goal = { x: target.transform.pos.x + (dx / dl) * stand, z: target.transform.pos.z + (dz / dl) * stand };
  if (bd - target.radius < reach + 0.4) bot.wantAttack = true;
  return true;
}

/**
 * Nothing to fight: defend the base (support role), tend/build structures, then position with the army according
 * to role and the current unit directive.
 */
function macro(bot: Bot, w: World, s: Senses): void {
  const { me, ehAlive, dHero } = s;
  const mate = mateHero(bot, w);
  if (bot.role === "support") {
    const threat = baseThreat(bot, w, me);
    if (threat && !(mate && w.dist(mate, threat) < w.dist(me, threat)) && ok(bot, w, me, threat)) {
      bot.why = "guard";
      bot.goal = { x: threat.transform.pos.x, z: threat.transform.pos.z };
      return;
    }
  }
  // Attackers leave building to their mate unless gold is piling up.
  const maintain = bot.role !== "attack" || w.teams[me.team].resource > 450;
  if (!maintain) bot.tend = bot.buildPad = null;

  if (bot.tend) {
    // Stand by a structure we just ordered until it finishes building/upgrading.
    const st = bot.tend.structureId ? w.get(bot.tend.structureId) : undefined;
    if (
      !st ||
      st.team !== me.team ||
      (st.structure!.ready && !st.structure!.upgrading) ||
      (ehAlive && dHero < 7) ||
      pressing(w, me.team)
    )
      bot.tend = null;
    else {
      bot.why = "tend";
      bot.goal = { x: bot.tend.x + (me.team ? 1.4 : -1.4), z: bot.tend.z };
      return;
    }
  }
  if (!bot.buildPad && maintain) pickBuild(bot, w, me);
  if (bot.buildPad) {
    const pad = bot.buildPad;
    const st = pad.structureId ? w.get(pad.structureId) : undefined;
    const cost = bot.buildType ? buildCost(w, bot.buildType, !!st, me.team) : 0;
    if ((st && st.team !== me.team) || w.teams[me.team].resource < cost || !ok(bot, w, me, pad)) {
      bot.buildPad = null;
    } else {
      bot.why = "build";
      bot.goal = { x: pad.x, z: pad.z };
      return;
    }
  }

  bot.why = "position";
  if (bot.role === "attack") {
    const prey = enemyHeroes(bot, w, me).find(
      (e) => w.canSee(me, e) && w.dist(me, e) < 20 && e.hp < me.hp * 1.2 && ok(bot, w, me, e),
    );
    bot.goal = prey ? { x: prey.transform.pos.x, z: prey.transform.pos.z } : frontTarget(bot, w, me);
    return;
  }
  if (bot.role === "support" && mate) {
    // Stay within reach of a mate that has pushed far from home.
    const own = w.core(me.team)!.transform.pos;
    const mp = mate.transform.pos;
    const back = Math.hypot(own.x - mp.x, own.z - mp.z) || 1;
    if (Math.hypot(mp.x - own.x, mp.z - own.z) > 22) {
      bot.goal = {
        x: mp.x + ((own.x - mp.x) / back) * 3,
        z: mp.z + ((own.z - mp.z) / back) * 3 + (bot.player % 2 ? 1.5 : -1.5),
      };
      return;
    }
  }
  const army = w.entities.filter((o) => o.alive && o.unit && o.team === me.team);
  const d = w.teams[me.team].directives.grunt;
  if (d === "push" && army.length) {
    // Walk slightly ahead of the army's centroid toward the nearest enemy core.
    let cx = 0;
    let cz = 0;
    for (const u of army) {
      cx += u.transform.pos.x;
      cz += u.transform.pos.z;
    }
    cx /= army.length;
    cz /= army.length;
    const core = w.foeCore(me.team, cx, cz) ?? w.core(me.team)!;
    const f = 0.15;
    bot.goal = { x: cx + (core.transform.pos.x - cx) * f, z: cz + (core.transform.pos.z - cz) * f };
    return;
  }
  if (d === "follow" && army.length >= 5) {
    bot.goal = frontTarget(bot, w, me);
    return;
  }
  const hold = w.teams[me.team].directives.holdPoint.grunt;
  bot.goal = army.length < 3 ? { x: hold.x, z: hold.z + (bot.player ? 2 : -2) } : frontTarget(bot, w, me);
}
