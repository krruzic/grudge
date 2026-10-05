// Bot: AI player that produces one Command per tick for its hero, exactly like a human controller would. Used for
// single-player opponents/allies, headless tools (tools/*.ts) and the determinism check. The class holds the bot's
// memory and turns intents into a Command; the decision logic lives in src/sim/bot/:
//   think.ts     what to do (objectives, retreat, abilities, fights, macro)
//   strategy.ts  team role (solo/attack/support) and unit directives       navigate.ts  goal -> stick direction
//   awareness.ts world queries (threats, targets, cover)                    economy.ts    shop and build orders
// Determinism: a Bot only reads World and its own state, and its randomness is the seeded rand() below.
import type { World } from "./world.ts";
import type { Command, Directive, Entity, Pad, StructureType, Vec2 } from "./types.ts";
import { learned as learnedOf, options } from "./talents.ts";
import { think } from "./bot/think.ts";
import { pickDirective, supportDirective, updateRole } from "./bot/strategy.ts";
import { preferJumpPad, steer } from "./bot/navigate.ts";
import { ok } from "./bot/awareness.ts";
import { duelistReflex } from "./bot/tactics.ts";

/** Pad hold timing (mirrors src/input/commands.ts): a hold counts as charging after TAP, full power after +FULL. */
const CHARGE_TAP = 0.2;
const CHARGE_FULL = 0.8;

export class Bot {
  // State below is shared with the src/sim/bot/* modules (treat as internal).

  // Navigation (bot/navigate.ts)
  /** Where think() wants to be; null = stay put. */
  goal: Vec2 | null = null;
  path: Vec2[] = [];
  pathGoal: Vec2 | null = null;
  repathAt = 0;
  progress = { x: 0, z: 0, t: 0 };
  /** Last path search failed (goal unreachable): stop at the end of the partial path. */
  lost = false;

  // Decision timers & memory
  thinkAt = 0;
  directiveAt = 0;
  lastDirective: Directive | null = null;
  healing = false;
  /** Pressing a lead into the enemy base (bot/think.ts siege), with hysteresis. */
  sieging = false;
  /** Which branch of think() decided the last goal (debug / sims only, never read by the sim). */
  why = "";
  openedAt = -99;
  fightId = 0;
  graveId = 0;
  graveAt = -99;
  bombAt = 0;
  lurkUntil = -1;
  lurkAgain = -99;
  helpSaidAt = -99;

  // Build orders (bot/economy.ts)
  buildType: StructureType | null = null;
  buildPad: Pad | null = null;
  buildSpec: number | null = null;
  /** Pad whose construction/upgrade the bot is waiting next to. */
  tend: Pad | null = null;

  // Intents for the next Command (consumed in command())
  wantAttack = false;
  wantB = false;
  wantR = false;
  wantZ = false;
  wantDodge = false;
  wantBlock = false;
  wantRecall = false;
  wantBuy: { item: "bomb" | "ward" | "cannon"; at?: Vec2 } | null = null;
  wantFace: Vec2 | null = null;
  wantPlace: Vec2 | null = null;
  sayText: string | null = null;

  // Hold-to-charge (same timing as a human on the pad: charging shows after 0.2s, full power after 1.0s)
  /** Button think() wants held down; persists between thinks, cleared by think() to let go. */
  wantCharge: "a" | "b" | null = null;
  /** Entity the charged release should be aimed at. */
  chargeAimId = 0;
  /** Only let go while the aim target is within this distance (keeps holding at full power until in reach). */
  chargeRange = Infinity;
  /** Charge fraction at which to let go (1 = full power; think() resets it each time). */
  chargeAt = 1;
  holdSlot: "a" | "b" | null = null;
  /** Last enemy swing the per-tick reflex rolled for (bot/tactics.ts). */
  reflexKey = 0;
  holdAt = -1;

  // Team play (bot/strategy.ts)
  /** Fixed talent pick order (overrides the hero's botPlan picks). */
  picks: number[] | null = null;
  /** Player index of the teammate this bot plays with, if any. */
  mate: number | null = null;
  role: "solo" | "attack" | "support" = "solo";
  /** Smoothed 0..1 "my mate stays home" estimate driving the role choice. */
  homeScore = 0.3;
  roleAt = -99;
  roleCheckAt = 0;
  humanOrderAt = -99;

  private seed: number;

  constructor(
    readonly player: number,
    /** 0..1: reaction chance multiplier for attacks, dodges and blocks; also slows the think cadence. */
    readonly skill = 0.8,
    seed = 7,
  ) {
    this.seed = seed * 9973 + player * 131;
  }

  /** Sidestep direction (+1 / -1) and until when, after getting stuck walking into someone. */
  private sidestep = 0;
  private sidestepUntil = 0;
  private stuckAt = { x: 0, z: 0, t: 0 };

  /**
   * Team deathmatch local avoidance: steer away from friendly champions within 2.2 m, and when the bot has barely
   * moved for 0.8 s while trying to walk (two bots shoving into each other), sidestep perpendicular for 0.7 s.
   */
  private unjam(w: World, me: Entity, cmd: Command): void {
    const p = me.transform.pos;
    const mv = Math.hypot(cmd.moveX, cmd.moveZ);
    if (mv < 0.2) {
      this.stuckAt = { x: p.x, z: p.z, t: w.time };
      return;
    }
    let ax = 0;
    let az = 0;
    for (const o of w.entities) {
      if (o === me || !o.alive || !o.hero || o.hero.dead || o.team !== me.team) continue;
      const dx = p.x - o.transform.pos.x;
      const dz = p.z - o.transform.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2 || d < 1e-3) continue;
      const k = (2.2 - d) / 2.2;
      ax += (dx / d) * k;
      az += (dz / d) * k;
    }
    if (Math.hypot(p.x - this.stuckAt.x, p.z - this.stuckAt.z) > 0.6) this.stuckAt = { x: p.x, z: p.z, t: w.time };
    else if (w.time - this.stuckAt.t > 0.8 && w.time >= this.sidestepUntil) {
      this.sidestep = this.rand() < 0.5 ? 1 : -1;
      this.sidestepUntil = w.time + 0.7;
      this.stuckAt.t = w.time;
    }
    let mx = cmd.moveX / mv + ax * 1.2;
    let mz = cmd.moveZ / mv + az * 1.2;
    if (w.time < this.sidestepUntil) {
      mx += (-cmd.moveZ / mv) * this.sidestep * 1.5;
      mz += (cmd.moveX / mv) * this.sidestep * 1.5;
    }
    const l = Math.hypot(mx, mz) || 1;
    cmd.moveX = (mx / l) * mv;
    cmd.moveZ = (mz / l) * mv;
  }

  /** Bot-local Park-Miller LCG (independent of World.rng). */
  rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Produce this tick's Command for the bot's hero. */
  command(w: World): Command {
    const me = w.heroForPlayer(this.player);
    const cmd: Command = { moveX: 0, moveZ: 0 };
    if (me?.hero?.picks.length) {
      const k = me.hero.path.a.length + me.hero.path.b.length + me.hero.path.r.length;
      const fixed = this.picks ?? w.heroDef(me.hero.type).botPlan?.picks ?? null;
      const opt = fixed ? null : options(w, me);
      const owned = new Set((["r", "b", "a", "z"] as const).flatMap((sl) => learnedOf(w, me, sl).map((t) => t.id)));
      const syn = opt ? opt.list.findIndex((o) => (o.with ?? []).some((q) => owned.has(q.id))) : -1;
      cmd.learn = fixed ? fixed[k % fixed.length] : syn >= 0 ? syn : this.rand() < 0.5 ? 0 : 1;
    }
    if (!me || !me.alive || w.teams[me.team]?.out || (!w.core(me.team) && !w.tdm)) {
      this.holdSlot = this.wantCharge = null;
      return cmd;
    }
    if (w.time >= this.thinkAt) {
      this.thinkAt = w.time + 0.2 + (1 - this.skill) * 0.3;
      think(this, w, me);
    }
    if (w.time >= this.roleCheckAt && !w.tdm) {
      this.roleCheckAt = w.time + 1;
      updateRole(this, w, me);
    }
    if (w.time >= this.directiveAt && !w.tdm) {
      this.directiveAt = w.time + 2;
      const cur = w.teams[me.team].directives.grunt;
      if (this.lastDirective && cur !== this.lastDirective) this.humanOrderAt = w.time;
      this.lastDirective = cur;
      const d =
        this.role === "solo"
          ? pickDirective(this, w, me)
          : this.role === "support" && w.time - this.humanOrderAt > 90
            ? supportDirective(this, w, me)
            : cur;
      if (d !== this.lastDirective) {
        cmd.directive = { type: "all", dir: d };
        this.lastDirective = d;
      }
    }
    const horn = w.mapEvents.horns.find(
      (hn) =>
        w.time >= hn.readyAt &&
        Math.hypot(hn.x - me.transform.pos.x, hn.z - me.transform.pos.z) < 38 &&
        (w.time * 7 + me.id * 13) % 60 < 25,
    );
    if (
      horn &&
      me.hp > me.maxHp * 0.45 &&
      ok(this, w, me, horn) &&
      !w.arena.carrying(me) &&
      !w.entities.some((o) => o.alive && o.hero && o.team !== me.team && w.dist(me, o) < 6)
    )
      this.goal = { x: horn.x, z: horn.z };
    preferJumpPad(this, w, me);
    steer(this, w, me, cmd);
    if (w.tdm) this.unjam(w, me, cmd);
    if (
      this.buildPad &&
      this.buildType &&
      Math.hypot(this.buildPad.x - me.transform.pos.x, this.buildPad.z - me.transform.pos.z) < 2.2
    ) {
      if (this.buildSpec !== null) cmd.spec = this.buildSpec;
      else cmd.build = this.buildType;
      this.buildSpec = null;
      this.tend = this.buildPad;
      this.buildPad = null;
      this.buildType = null;
    }
    if (this.wantBuy) {
      cmd.buy = this.wantBuy.item;
      cmd.aimAt = this.wantBuy.at;
      this.wantBuy = null;
    }
    if (this.sayText) {
      cmd.say = this.sayText;
      this.sayText = null;
    }
    if (this.wantFace) {
      cmd.moveX = this.wantFace.x;
      cmd.moveZ = this.wantFace.z;
      this.wantFace = null;
    }
    if (this.wantPlace) {
      cmd.place = { dx: this.wantPlace.x, dz: this.wantPlace.z };
      if (!this.wantB && !this.wantR) this.wantPlace = null;
    }
    if (w.heroDef(me.hero!.type).abilities.r.kind === "parry") duelistReflex(this, w, me);
    this.chargeInput(w, cmd);
    // Standing on the jump pad it's heading for: hold A to launch (like a human must).
    const g = this.goal;
    if (g && w.jumpPads.some((jp) => Math.abs(jp.x - g.x) < 0.05 && Math.abs(jp.z - g.z) < 0.05))
      if (Math.hypot(g.x - me.transform.pos.x, g.z - me.transform.pos.z) < 1.1) cmd.charging = "a";
    cmd.attack = this.wantAttack;
    cmd.secondary = this.wantB;
    cmd.special = this.wantR;
    cmd.super = this.wantZ;
    cmd.dodge = this.wantDodge;
    cmd.recall = this.wantRecall;
    this.wantRecall = false;
    cmd.block = this.wantBlock && !w.arena.carrying(me);
    this.wantAttack = this.wantB = this.wantR = this.wantZ = this.wantDodge = false;
    this.wantPlace = null;
    if (this.wantBlock && this.rand() < 0.1) this.wantBlock = false;
    return cmd;
  }

  /**
   * Hold-to-charge: keep the wanted button down (cmd.charging, which also slows the hero like a human holding it),
   * and let go once fully charged and the move is ready, or early when think() stops wanting the charge. The release
   * press carries the real hold time as cmd.charge and is aimed at chargeAimId.
   */
  private chargeInput(w: World, cmd: Command): void {
    const me = w.heroForPlayer(this.player)!;
    const h = me.hero!;
    const want = this.wantCharge;
    if (!this.holdSlot && want && (want === "b" || !h.action)) {
      this.holdSlot = want;
      this.holdAt = w.time;
    }
    const slot = this.holdSlot;
    if (!slot) return;
    const held = w.time - this.holdAt;
    const k = Math.min(1, Math.max(0, (held - CHARGE_TAP) / CHARGE_FULL));
    const t = this.chargeAimId ? w.get(this.chargeAimId) : undefined;
    const inReach = !t?.alive || w.dist(me, t) <= this.chargeRange;
    const ready = (h.cooldowns[slot] ?? 0) <= w.time && !h.action && inReach;
    // Holding a button means it can't be tapped meanwhile.
    if (slot === "a") this.wantAttack = false;
    else this.wantB = false;
    if (want === slot && !(k >= this.chargeAt && ready)) {
      if (held > CHARGE_TAP) cmd.charging = slot;
      return;
    }
    this.holdSlot = null;
    if (slot === "a") this.wantAttack = true;
    else this.wantB = true;
    if (held > CHARGE_TAP) cmd.charge = k;
    if (t?.alive && !this.wantDodge) {
      const dx = t.transform.pos.x - me.transform.pos.x;
      const dz = t.transform.pos.z - me.transform.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      cmd.moveX = dx / l;
      cmd.moveZ = dz / l;
    }
  }
}
