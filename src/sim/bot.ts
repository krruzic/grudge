import type { World } from "./world.ts";
import type { Command, Directive, Entity, Pad, StructureType, Vec2 } from "./types.ts";
import { buildCost, canBuildOn, canSpec, specCost } from "./structures.ts";
import { learned as learnedOf, options } from "./talents.ts";
import { graveSpots } from "./heroes.ts";
import { clumpScore, healSpotScore } from "./friar.ts";

interface PlanItem {
  zone: Pad["zone"] | "front";
  type: StructureType;
}

const PLAN: PlanItem[] = [
  { zone: "home", type: "barracks" },
  { zone: "home", type: "range" },
  { zone: "home", type: "damage" },
  { zone: "front", type: "foundry" },
  { zone: "front", type: "barracks" },
  { zone: "front", type: "damage" },
  { zone: "front", type: "control" },
  { zone: "home", type: "support" },
  { zone: "front", type: "damage" },
  { zone: "front", type: "control" },
  { zone: "front", type: "damage" },
];
const MAX_OUTPOSTS = 4;

export class Bot {
  private path: Vec2[] = [];
  private pathGoal: Vec2 | null = null;
  private repathAt = 0;
  private progress = { x: 0, z: 0, t: 0 };
  private thinkAt = 0;
  private directiveAt = 0;
  private lastDirective: Directive | null = null;
  private goal: Vec2 | null = null;
  private buildType: StructureType | null = null;
  private buildPad: Pad | null = null;
  private buildSpec: number | null = null;
  private lost = false;
  private healing = false;
  private openedAt = -99;
  private fightId = 0;
  private graveId = 0;
  private graveAt = -99;
  private seed: number;
  private wantAttack = false;
  private wantB = false;
  private wantR = false;
  private wantZ = false;
  private wantDodge = false;
  private wantBlock = false;
  private bombAt = 0;
  picks: number[] | null = null;
  private wantBuy: { item: "bomb" | "ward" | "cannon"; at?: Vec2 } | null = null;
  private tend: Pad | null = null;
  private wantFace: Vec2 | null = null;
  private wantPlace: Vec2 | null = null;
  private wantRecall = false;
  mate: number | null = null;
  role: "solo" | "attack" | "support" = "solo";
  private homeScore = 0.3;
  private roleAt = -99;
  private roleCheckAt = 0;
  private humanOrderAt = -99;
  private sayText: string | null = null;
  private helpSaidAt = -99;
  private lurkUntil = -1;
  private lurkAgain = -99;

  constructor(
    readonly player: number,
    private skill = 0.8,
    seed = 7,
  ) {
    this.seed = seed * 9973 + player * 131;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

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
    if (!me || !me.alive || w.teams[me.team]?.out || !w.core(me.team)) return cmd;
    if (w.time >= this.thinkAt) {
      this.thinkAt = w.time + 0.2 + (1 - this.skill) * 0.3;
      this.think(w, me);
    }
    if (w.time >= this.roleCheckAt) {
      this.roleCheckAt = w.time + 1;
      this.updateRole(w, me);
    }
    if (w.time >= this.directiveAt) {
      this.directiveAt = w.time + 2;
      const cur = w.teams[me.team].directives.grunt;
      if (this.lastDirective && cur !== this.lastDirective) this.humanOrderAt = w.time;
      this.lastDirective = cur;
      const d =
        this.role === "solo"
          ? this.pickDirective(w, me)
          : this.role === "support" && w.time - this.humanOrderAt > 25
            ? this.supportDirective(w, me)
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
      this.ok(w, me, horn) &&
      !w.arena.carrying(me) &&
      !w.entities.some((o) => o.alive && o.hero && o.team !== me.team && w.dist(me, o) < 6)
    )
      this.goal = { x: horn.x, z: horn.z };
    if (this.goal && w.jumpPads.length && !w.arena.carrying(me) && !me.hero?.bomb) {
      const p = me.transform.pos;
      const g = this.goal;
      const direct = Math.hypot(g.x - p.x, g.z - p.z);
      const walled = !w.nav.reachable(p, g);
      let best: Vec2 | null = null;
      let bestCost = walled ? Infinity : direct - 12;
      for (const jp of w.jumpPads) {
        if (w.time < jp.readyAt - 1 || w.mapEvents.sealed(jp.x, jp.z, jp.tx, jp.tz)) continue;
        const toPad = Math.hypot(jp.x - p.x, jp.z - p.z);
        if (toPad > (walled ? 60 : 26)) continue;
        const cost = toPad + Math.hypot(g.x - jp.tx, g.z - jp.tz) + 4;
        if (
          cost < bestCost &&
          w.nav.reachable(p, { x: jp.x, z: jp.z }) &&
          (!walled || w.nav.reachable({ x: jp.tx, z: jp.tz }, g))
        ) {
          bestCost = cost;
          best = { x: jp.x, z: jp.z };
        }
      }
      if (best) this.goal = best;
    }
    if (this.goal) {
      const p = me.transform.pos;
      const dist = Math.hypot(this.goal.x - p.x, this.goal.z - p.z);
      if (dist > 0.6) {
        let wp = this.goal;
        if (!(dist < 8 && w.nav.wideClear(p, this.goal, me.radius * 0.8))) {
          if (
            w.time >= this.repathAt ||
            !this.pathGoal ||
            Math.hypot(this.pathGoal.x - this.goal.x, this.pathGoal.z - this.goal.z) > 2
          ) {
            this.path = w.nav.findPath(p, this.goal, me.transform.y, me.radius * 0.8) ?? [];
            this.lost = !w.nav.lastFound;
            this.pathGoal = { ...this.goal };
            this.repathAt = w.time + 1;
          }
          const sameCell = (q: Vec2) => Math.floor(q.x) === Math.floor(p.x) && Math.floor(q.z) === Math.floor(p.z);
          while (
            this.path.length > 1 &&
            (sameCell(this.path[0]) ||
              Math.hypot(this.path[0].x - p.x, this.path[0].z - p.z) < 0.25 ||
              (Math.hypot(this.path[0].x - p.x, this.path[0].z - p.z) < 0.9 &&
                w.nav.wideClear(p, this.path[1], me.radius * 0.8)))
          )
            this.path.shift();
          if (Math.hypot(p.x - this.progress.x, p.z - this.progress.z) > 0.5)
            this.progress = { x: p.x, z: p.z, t: w.time };
          else if (w.time - this.progress.t > 1 && !me.hero?.action) {
            if (this.path.length > 1) this.path.shift();
            this.repathAt = w.time + 0.5;
            this.progress = { x: p.x, z: p.z, t: w.time };
          }
          if (this.path.length) wp = this.path[0];
          if (
            this.lost &&
            (this.path.length === 0 || (this.path.length === 1 && Math.hypot(wp.x - p.x, wp.z - p.z) < 0.5))
          )
            wp = p;
        }
        const dx = wp.x - p.x;
        const dz = wp.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.01) {
          cmd.moveX = dx / d;
          cmd.moveZ = dz / d;
        }
      }
    }
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

  private pickDirective(w: World, me: Entity): Directive {
    const t = w.teams[me.team];
    const core = w.core(me.team);
    if (core && w.enemiesNear(core, 15, (o) => o.kind === "unit").length >= 3) return "nearest";
    if (t.unitCount >= 7 || w.isSudden()) return "push";
    if (t.unitCount >= 4 && w.time > 90) return "follow";
    return "follow";
  }

  private mateHero(w: World): Entity | undefined {
    if (this.mate === null) return undefined;
    const m = w.heroForPlayer(this.mate);
    return m && m.alive ? m : undefined;
  }

  private enemyHeroes(w: World, me: Entity): Entity[] {
    return w.players
      .filter((k) => k.team !== me.team)
      .map((k) => w.get(k.heroId))
      .filter((e): e is Entity => !!e && e.alive);
  }

  private say(w: World, me: Entity, text: string): void {
    this.sayText = `${w.heroDef(me.hero!.type).name.toUpperCase()}: ${text}`;
  }

  private updateRole(w: World, me: Entity): void {
    if (this.mate === null) {
      this.role = "solo";
      return;
    }
    const slot = w.players.find((k) => k.player === this.mate);
    const mate = this.mateHero(w);
    let want = this.role === "solo" ? "support" : this.role;
    if (slot?.commander) want = "attack";
    else if (mate) {
      const own = w.core(me.team)!;
      const foe = w.foeCore(me.team, own.transform.pos.x, own.transform.pos.z) ?? own;
      const dOwn = w.dist(mate, own);
      const dFoe = w.dist(mate, foe);
      const frac = dOwn / (dOwn + dFoe || 1);
      const fighting = this.enemyHeroes(w, me).some((e) => w.dist(mate, e) < 9);
      const tending =
        w.arena.inShop(mate) ||
        w.pads.some(
          (pd) => pd.side === me.team && Math.hypot(pd.x - mate.transform.pos.x, pd.z - mate.transform.pos.z) < 3,
        );
      const home = fighting ? 0 : frac < 0.36 || tending ? 1 : frac > 0.5 ? 0 : 0.5;
      this.homeScore += (home - this.homeScore) * 0.05;
      if (this.homeScore > 0.68) want = "attack";
      else if (this.homeScore < 0.32) want = "support";
    }
    if (want !== this.role && (this.role === "solo" || w.time - this.roleAt > 12)) {
      if (this.role !== "solo") this.say(w, me, want === "attack" ? "I'LL TAKE THE FIGHT TO THEM" : "I'LL COVER YOU");
      this.role = want as "attack" | "support";
      this.roleAt = w.time;
    }
  }

  private supportDirective(w: World, me: Entity): Directive {
    const t = w.teams[me.team];
    if (this.baseThreat(w, me)) return "defend";
    if (w.isSudden() || t.unitCount >= 9) return "push";
    const lead = w.heroOf(me.team);
    if (lead && lead.alive && lead.id !== me.id) return "follow";
    return t.unitCount >= 6 ? "push" : "follow";
  }

  private baseThreat(w: World, me: Entity): Entity | undefined {
    let worst: Entity | undefined;
    let most = 0;
    for (const o of w.entities) {
      if (!o.alive || o.team !== me.team || !o.structure || o.structure.siege) continue;
      if (o.structure.type !== "core" && !w.arena.isTowerOrKeep(o)) continue;
      const foes = w.enemiesNear(o, 13, (e) => e.kind === "unit" || e.kind === "hero");
      const score = foes.reduce((n, e) => n + (e.hero ? 3 : 1), 0) + (o.structure.type === "core" ? 1 : 0);
      if (score >= 3 && score > most) {
        most = score;
        worst = foes.sort((a, b) => w.dist(a, o) - w.dist(b, o))[0];
      }
    }
    return worst;
  }

  private assistTarget(w: World, me: Entity): Entity | undefined {
    const mate = this.mateHero(w);
    if (!mate || this.role === "solo") return undefined;
    const reach = this.role === "support" ? 45 : 22;
    if (w.dist(me, mate) > reach) return undefined;
    const foes = this.enemyHeroes(w, me).filter((e) => w.dist(mate, e) < 9 && w.canSee(me, e));
    if (!foes.length) return undefined;
    const friends = w.players
      .filter((k) => k.team === me.team && k.player !== this.player)
      .map((k) => w.get(k.heroId))
      .filter((e) => e && e.alive && w.dist(mate, e) < 9).length;
    const weak = foes.find((e) => e.hp < e.maxHp * 0.4);
    const outnumbered = foes.length > friends;
    const hurting = mate.hp < mate.maxHp * 0.55;
    if (!(outnumbered || hurting || weak || this.role === "support")) return undefined;
    const t = weak ?? foes.sort((a, b) => w.dist(a, mate) - w.dist(b, mate))[0];
    if (w.time - this.helpSaidAt > 15 && w.dist(me, t) > 12 && (outnumbered || hurting)) {
      this.helpSaidAt = w.time;
      this.say(w, me, weak ? "MOVING IN TO FINISH THEM" : "HOLD ON, I'M COMING");
    }
    return t;
  }

  private grassCover(w: World, me: Entity, foe: Entity, dFoe: number): Vec2 | null {
    if (dFoe > 10 || dFoe < 3) return null;
    const p = me.transform.pos;
    if (me.status.hidden && !w.canSee(foe, me) && w.grassPatchAt(p.x, p.z) > 0) {
      if (this.lurkUntil < 0) this.lurkUntil = w.time + 3;
      if (w.time < this.lurkUntil) return { x: p.x, z: p.z };
      return null;
    }
    if (this.lurkUntil >= 0) {
      this.lurkUntil = -1;
      this.lurkAgain = w.time + 6;
    }
    if (w.time < this.lurkAgain) return null;
    const fp = foe.transform.pos;
    const foePatch = w.grassPatchAt(fp.x, fp.z);
    const cx = Math.floor(p.x);
    const cz = Math.floor(p.z);
    let best: Vec2 | null = null;
    let bd = 26;
    for (let dz = -5; dz <= 5; dz++)
      for (let dx = -5; dx <= 5; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 >= bd) continue;
        const x = cx + dx + 0.5;
        const z = cz + dz + 0.5;
        const patch = w.grassPatchAt(x, z);
        if (!patch || patch === foePatch || Math.hypot(x - fp.x, z - fp.z) < dFoe) continue;
        bd = d2;
        best = { x, z };
      }
    return best && this.ok(w, me, best) ? best : null;
  }

  private graveTarget(w: World, me: Entity): Vec2 | null {
    const p = me.transform.pos;
    let best: Vec2 | null = null;
    let bs = 0;
    for (const s of graveSpots(w, me)) {
      if (s.keep || Math.hypot(s.x - p.x, s.z - p.z) < 28) continue;
      const st = w.get(s.id)?.structure;
      if (!st || st.type === "core") continue;
      let foes = 0;
      let heroes = 0;
      let mine = 0;
      for (const o of w.entities) {
        if (!o.alive || o.structure || o.neutral || Math.hypot(o.transform.pos.x - s.x, o.transform.pos.z - s.z) > 14)
          continue;
        if (o.team === me.team) mine += o.unit ? 1 : 0;
        else if (o.hero) heroes++;
        else if (o.unit) foes++;
      }
      if (heroes > 1 || foes + heroes * 3 < 2) continue;
      const prod = w.data.structures.types[st.type].class === "production";
      const score = foes + heroes * 3 + (prod ? mine * 0.5 : 0);
      if (score >= 3 && score > bs) {
        bs = score;
        best = { x: s.x, z: s.z };
      }
    }
    return best;
  }

  private ok(w: World, me: Entity, g: Vec2 | { transform: { pos: Vec2 } }): boolean {
    const q = "transform" in g ? g.transform.pos : g;
    return w.nav.reachable(me.transform.pos, q);
  }

  private think(w: World, me: Entity): void {
    const p = me.transform.pos;
    const h = me.hero!;
    const assist = this.assistTarget(w, me);
    let enemyHero = assist;
    if (!enemyHero) {
      let bd = Infinity;
      for (const e of this.enemyHeroes(w, me)) {
        if (!this.ok(w, me, e)) continue;
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
    if (me.hp < me.maxHp * (plan.retreatHp ?? 0.3)) this.healing = true;
    else if (me.hp > me.maxHp * 0.8) this.healing = false;
    const lowHp = this.healing && !finish;
    const smoked = w.time < me.status.stealthUntil;
    const crowdAt = (t: Entity) => {
      let foes = 0;
      let mine = 0;
      for (const o of w.entities) {
        if (!o.alive || !o.unit) continue;
        if (o.team !== me.team && o.team !== -1 && w.dist(o, t) < 5.5) foes++;
        else if (o.team === me.team && w.dist(o, me) < 7) mine++;
      }
      return foes - mine;
    };

    const shopDone = this.shop(w, me, !!ehAlive && dHero < 8);
    if (shopDone) return;
    const relic = w.arena.relic;
    if (w.arena.carrying(me)) {
      let best: Entity | undefined;
      let bd = Infinity;
      for (const o of w.entities) {
        if (!o.alive || o.team !== me.team || !w.arena.isTowerOrKeep(o) || !this.ok(w, me, o)) continue;
        const d = w.dist(me, o);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best) this.goal = { x: best.transform.pos.x, z: best.transform.pos.z };
      return;
    }
    const enemyShrine =
      relic.state === "shrined" && relic.team >= 0 && relic.team !== me.team ? w.arena.shrineOf(relic.team) : null;
    if (
      enemyShrine &&
      !lowHp &&
      w.dist(me, enemyShrine) < 22 &&
      !(ehAlive && dHero < 5) &&
      this.ok(w, me, enemyShrine)
    ) {
      this.goal = { x: enemyShrine.transform.pos.x, z: enemyShrine.transform.pos.z };
      return;
    }
    if ((relic.state === "home" || relic.state === "dropped") && !lowHp && this.ok(w, me, relic)) {
      const dr = Math.hypot(relic.x - p.x, relic.z - p.z);
      if (dr < 14 || (relic.state === "home" && !(ehAlive && dHero < 6))) {
        this.goal = { x: relic.x, z: relic.z };
        if (dr > 3) return;
      }
    }
    if (relic.state === "carried" && relic.carrier === enemyHero?.id && ehAlive && dHero < 16) {
      this.goal = { x: enemyHero!.transform.pos.x, z: enemyHero!.transform.pos.z };
      if (dHero < 2.2) {
        this.wantAttack = true;
        this.wantBlock = this.rand() < 0.5;
      }
      if (dHero > 2.5) return;
    }
    if (assist && !lowHp && dHero > 9 + (w.heroDef(h.type).botRange ?? 1.8) && this.ok(w, me, assist)) {
      this.goal = { x: assist.transform.pos.x, z: assist.transform.pos.z };
      const ab0 = w.heroDef(h.type).abilities;
      if (ab0.r.bot === "approach" && (h.cooldowns.r ?? 0) <= w.time && dHero < (ab0.r.botRange ?? 10))
        this.wantR = true;
      return;
    }
    const swarm = w.enemiesNear(me, 6, (o) => !!o.unit).length;
    const graveDef = w.heroDef(h.type).abilities.r;
    const graveReady = graveDef.kind === "gravewalk" && (h.cooldowns.r ?? 0) <= w.time && !h.action;
    if (lowHp) {
      const sp = w.spawnPoint(me.team);
      this.goal = sp;
      if (h.recallAt !== undefined) {
        this.goal = null;
        return;
      }
      const home = graveReady ? graveSpots(w, me).find((s) => s.keep) : undefined;
      if (home && !(ehAlive && dHero < 2.5)) {
        this.wantR = true;
        this.wantPlace = { x: home.x - p.x, z: home.z - p.z };
        this.goal = null;
        return;
      }
      const core = w.core(me.team);
      if (!h.recallUsed && dHero > 10 && swarm === 0 && core && w.dist(me, core) > 25 && w.time - h.combatAt > 1.5) {
        this.wantRecall = true;
        this.goal = null;
        return;
      }
      const esc = plan.escape;
      if (esc && (h.cooldowns[esc] ?? 0) <= w.time && (dHero < 5 || swarm >= 2)) {
        const ex = sp.x - me.transform.pos.x;
        const ez = sp.z - me.transform.pos.z;
        const el = Math.hypot(ex, ez) || 1;
        this.wantPlace = { x: (ex / el) * 8, z: (ez / el) * 8 };
        if (esc === "b") this.wantB = true;
        else this.wantR = true;
      }
      if (plan.healer && (h.cooldowns.b ?? 0) <= w.time && healSpotScore(w, me) >= 80) this.wantB = true;
      const cover = ehAlive ? this.grassCover(w, me, enemyHero!, dHero) : null;
      if (cover) this.goal = cover;
      this.wantBlock = dHero < 3 && this.rand() < 0.5;
      if (dHero < 2.6) this.wantAttack = true;
      return;
    }

    if (
      ehAlive &&
      enemyHero!.hero!.action &&
      (enemyHero!.hero!.action.name === "b" || enemyHero!.hero!.action.name === "z") &&
      dHero < 4.5
    ) {
      if (this.rand() < this.skill * 0.6) this.wantDodge = true;
      else if (this.rand() < 0.5) this.wantBlock = true;
    }

    if (h.recallAt !== undefined) {
      this.goal = null;
      return;
    }
    if (!h.recallUsed && w.time - h.combatAt > 3 && !w.enemiesNear(me, 9).length) {
      const threat = this.baseThreat(w, me);
      const core = w.core(me.team);
      if (threat && core && w.dist(me, core) > 35 && w.dist(me, threat) > 30) {
        this.wantRecall = true;
        this.goal = null;
        return;
      }
    }
    const nearby = w.enemiesNear(me, 7);
    const def = w.heroDef(h.type);
    const ab = def.abilities;
    const prefer = def.botRange ?? 1.8;
    const rdy = (k: string) => (h.cooldowns[k] ?? 0) <= w.time;
    const allies = w.entities.filter((o) => o.alive && o.unit && o.team === me.team && w.dist(me, o) < 9).length;
    if (ab.b.kind === "pip") {
      const hb = me.status.hurtBy !== undefined ? w.get(me.status.hurtBy) : undefined;
      const diver = hb?.hero && hb.alive && w.time - (me.status.hurtAt ?? -99) < 0.8 && w.dist(me, hb) < 5 ? hb : null;
      if (diver && rdy("b") && !h.action && !h.pip) this.wantB = true;
      if (diver && h.pip?.phase === "on" && h.pip.target === diver.id && rdy("dodge") && this.rand() < 0.6 * this.skill)
        this.wantDodge = true;
    }
    const enemyAttacking =
      ehAlive && !!enemyHero!.hero!.action && enemyHero!.hero!.action.name !== "dodge" && dHero < 3.5;
    const useHint = (k: "b" | "r" | "z", d: number): boolean => {
      const a = ab[k];
      switch (a.bot) {
        case "fight":
          return d <= (a.botRange ?? 3);
        case "allies":
          return allies >= 3 && nearby.length >= 2;
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
                o.alive &&
                o.structure &&
                o.team !== me.team &&
                !o.structure.siege &&
                w.dist(me, o) < (a.botRange ?? 12),
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
          return healSpotScore(w, me) >= (this.role === "solo" ? 150 : 110);
        default:
          return false;
      }
    };
    const full = h.meter >= w.data.heroes.baseline.superMax;
    const siegeHero = ab.z.kind === "ballista";
    const zTarget = plan.zBelow === undefined || (ehAlive && enemyHero!.hp < enemyHero!.maxHp * plan.zBelow);
    if (
      full &&
      zTarget &&
      (!siegeHero || !rdy("r")) &&
      ((ehAlive && useHint("z", dHero)) || (plan.zBelow === undefined && nearby.length >= 4))
    )
      this.wantZ = true;
    if (this.wantZ && ehAlive && prefer > 3 && w.canSee(me, enemyHero!)) {
      const zx = enemyHero!.transform.pos.x - p.x;
      const zz = enemyHero!.transform.pos.z - p.z;
      const zl = Math.hypot(zx, zz) || 1;
      this.wantFace = { x: zx / zl, z: zz / zl };
    }
    if (siegeHero && full && !lowHp) {
      const works = w.mods.find((m) => m.kind === "works" && m.owner === me.id && m.cx !== undefined);
      if (works) {
        if (Math.hypot(works.cx! - p.x, works.cz! - p.z) < 1.3) this.wantZ = true;
        else if (!(ehAlive && dHero < 4)) {
          this.goal = { x: works.cx!, z: works.cz! };
          return;
        }
      } else if (
        rdy("r") &&
        ((ehAlive && dHero < 10) ||
          nearby.length >= 2 ||
          w.entities.some(
            (o) => o.alive && o.structure && o.team !== me.team && !o.structure.siege && w.dist(me, o) < 16,
          ))
      )
        this.wantR = true;
    }
    if (rdy("r") && ab.r.bot !== "fight" && useHint("r", dHero)) this.wantR = true;
    if (rdy("b") && (ab.b.bot === "repair" || ab.b.bot === "banner" || ab.b.bot === "heal") && useHint("b", 0))
      this.wantB = true;
    if (plan.healer && rdy("r") && ab.r.bot === "fight" && clumpScore(w, me) >= 3 && this.rand() < 0.5)
      this.wantR = true;

    const lan = w.mapEvents.lantern;
    if (
      lan &&
      lan.state !== "rise" &&
      !lowHp &&
      Math.hypot(lan.x - p.x, lan.z - p.z) < 22 &&
      !(ehAlive && dHero < 4) &&
      this.ok(w, me, lan)
    ) {
      this.goal = { x: lan.x, z: lan.z };
      return;
    }
    let fight: Entity | undefined;
    const heroCrowd = ehAlive ? crowdAt(enemyHero!) : 0;
    const crowded =
      plan.crowd !== undefined && !smoked && heroCrowd > plan.crowd && enemyHero!.hp > enemyHero!.maxHp * 0.35;
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
      if (plan.opener === "r") this.wantR = true;
      else this.wantB = true;
      this.openedAt = w.time;
    }
    const outmatched =
      !!plan.huntRatio &&
      ehAlive &&
      !smoked &&
      w.time - this.openedAt > 1.5 &&
      enemyHero!.hp > me.hp * plan.huntRatio &&
      dHero > 2.2;
    const engage =
      !outmatched &&
      (!plan.hitAndRun ||
        !plan.opener ||
        smoked ||
        w.time - this.openedAt < plan.hitAndRun ||
        rdy(plan.opener) ||
        (ehAlive && enemyHero!.hp < enemyHero!.maxHp * 0.35) ||
        dHero < 2.2);
    if (ehAlive && !engage && dHero < 12 && !crowded) {
      const ex = p.x - enemyHero!.transform.pos.x;
      const ez = p.z - enemyHero!.transform.pos.z;
      const el = Math.hypot(ex, ez) || 1;
      const prey = nearby.find((o) => o.unit && w.dist(o, enemyHero!) > 6);
      this.fightId = prey?.id ?? 0;
      this.goal = prey
        ? { x: prey.transform.pos.x, z: prey.transform.pos.z }
        : { x: enemyHero!.transform.pos.x + (ex / el) * 9, z: enemyHero!.transform.pos.z + (ez / el) * 9 };
      if (prey && w.dist(me, prey) < 2.4) this.wantAttack = true;
      return;
    }
    if (ehAlive && dHero < 9 + prefer && w.canSee(me, enemyHero!) && !crowded) fight = enemyHero;
    else if (crowded && dHero < 12) {
      const close = nearby.find((o) => w.dist(me, o) < 2.6 && !o.structure);
      if (!close) {
        const ex = p.x - enemyHero!.transform.pos.x;
        const ez = p.z - enemyHero!.transform.pos.z;
        const el = Math.hypot(ex, ez) || 1;
        this.goal = { x: p.x + (ex / el) * 4, z: p.z + (ez / el) * 4 };
        this.fightId = 0;
        return;
      }
      fight = close;
    } else if (nearby.length) {
      nearby.sort((a, b) => w.dist(me, a) - w.dist(me, b));
      fight =
        nearby.find((o) => (o.kind !== "structure" || w.dist(me, o) < 5) && w.canSee(me, o) && this.ok(w, me, o)) ??
        undefined;
    }
    if (fight) {
      const towerThreat = w.enemiesNear(
        me,
        12,
        (o) => o.structure?.type === "damage" && o.structure.ready && o.structure.works === undefined,
      ).length;
      if (towerThreat && me.hp < me.maxHp * 0.6 && fight.hero && !lowHp) {
        this.goal = w.spawnPoint(me.team);
        return;
      }
      this.fightId = fight.id;
      const d = w.dist(me, fight) - fight.radius;
      const fx = fight.transform.pos.x;
      const fz = fight.transform.pos.z;
      if (prefer > 3) {
        const dx = p.x - fx;
        const dz = p.z - fz;
        const len = Math.hypot(dx, dz) || 1;
        this.goal = { x: fx + (dx / len) * prefer, z: fz + (dz / len) * prefer };
      } else if (plan.flank && fight.hero && d > 1.6) {
        const f = fight.transform.facing;
        this.goal = { x: fx - Math.sin(f) * 1.6, z: fz - Math.cos(f) * 1.6 };
      } else this.goal = { x: fx, z: fz };
      const aReach = ab.a.kind === "combo" ? ab.a.hits![0].range - 0.1 : (ab.a.botRange ?? 6);
      if (d < aReach && this.rand() < this.skill) this.wantAttack = true;
      const bOk = plan.gateB !== "opening" || smoked || fight.hp < fight.maxHp * 0.5 || crowdAt(fight) <= 0;
      if (rdy("b") && ab.b.bot === "fight" && useHint("b", d) && bOk && this.rand() < 0.35) this.wantB = true;
      const pp = me.hero?.pip;
      if (
        pp?.phase === "on" &&
        pp.target === fight.id &&
        (pp.until - w.time < 1 || fight.hp < fight.maxHp * 0.3 || (fight.hero?.action && d < 4)) &&
        this.rand() < 0.3 * this.skill
      )
        this.wantB = true;
      if (rdy("r") && ab.r.bot === "fight" && useHint("r", d) && this.rand() < 0.35) this.wantR = true;
      if (fight.hero?.action?.name === "a" && d < 2.8 && this.rand() < 0.25 * this.skill) this.wantBlock = true;
      if (prefer > 3) {
        const tx = fx - p.x;
        const tz = fz - p.z;
        const tl = Math.hypot(tx, tz) || 1;
        const melee = !!fight.hero && (w.heroDef(fight.hero.type).botRange ?? 1.8) <= 3;
        if (melee && d < 4.5) {
          this.goal = { x: p.x - (tx / tl) * 4, z: p.z - (tz / tl) * 4 };
          if (rdy("b") && ab.b.bot === "fight" && this.rand() < 0.5 * this.skill) this.wantB = true;
          if (enemyAttacking && d < 3 && this.rand() < 0.3 * this.skill) this.wantDodge = true;
        }
        if ((this.wantAttack || this.wantB || this.wantR) && !this.wantDodge)
          this.wantFace = { x: tx / tl, z: tz / tl };
      }
      if (plan.healer && ab.a.kind === "combo") {
        if (!fight.hero) {
          this.goal = { x: fx, z: fz };
          if (d < aReach && this.rand() < this.skill) this.wantAttack = true;
        }
        const close = nearby
          .filter((o) => !o.structure && w.canSee(me, o) && w.dist(me, o) - o.radius < aReach + 0.2)
          .sort((a, b) => w.dist(me, a) - w.dist(me, b))[0];
        if (close && !this.wantDodge && this.rand() < this.skill) {
          const cx = close.transform.pos.x - p.x;
          const cz = close.transform.pos.z - p.z;
          const cl = Math.hypot(cx, cz) || 1;
          this.wantAttack = true;
          if (!this.wantB && !this.wantR) this.wantFace = { x: cx / cl, z: cz / cl };
        }
      }
      return;
    }
    this.fightId = 0;

    const gv = h.grave ? w.get(h.grave.id) : undefined;
    if (h.grave && h.grave.id !== this.graveId) {
      this.graveId = h.grave.id;
      this.graveAt = w.time;
    }
    if (gv?.alive && h.grave && w.time < this.graveAt + 12 && !(ehAlive && dHero < 12)) {
      const gx = gv.transform.pos.x;
      const gz = gv.transform.pos.z;
      const dx = p.x - gx;
      const dz = p.z - gz;
      const dl = Math.hypot(dx, dz) || 1;
      if (dl > gv.radius + 3.5)
        this.goal = { x: gx + (dx / dl) * (gv.radius + 2), z: gz + (dz / dl) * (gv.radius + 2) };
      else this.goal = null;
      return;
    }
    if (graveReady && (!ehAlive || dHero > 14)) {
      const dest = this.graveTarget(w, me);
      if (dest) {
        this.wantR = true;
        this.wantPlace = { x: dest.x - p.x, z: dest.z - p.z };
        this.goal = null;
        return;
      }
    }

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
        if (d >= bd || !this.ok(w, me, o)) continue;
        if (w.entities.some((u) => u.alive && u.unit && u.team === o.team && w.dist(u, o) < 7)) continue;
        if (o.structure.type === "damage" && o.structure.ready && me.hp < me.maxHp * 0.8) continue;
        bd = d;
        best = o;
      }
      if (best) {
        this.goal = { x: best.transform.pos.x, z: best.transform.pos.z };
        this.fightId = best.id;
        if (w.dist(me, best) - best.radius < 2.2) this.wantAttack = true;
        return;
      }
    }

    if (
      plan.hunt &&
      ehAlive &&
      !crowded &&
      dHero < plan.hunt &&
      me.hp > me.maxHp * 0.7 &&
      enemyHero!.hp <= me.hp * (plan.huntRatio ?? 99) &&
      (!plan.opener || rdy(plan.opener)) &&
      this.ok(w, me, enemyHero!) &&
      w.canSee(me, enemyHero!)
    ) {
      const f = enemyHero!.transform.facing;
      this.goal =
        dHero > 16
          ? { x: enemyHero!.transform.pos.x, z: enemyHero!.transform.pos.z }
          : { x: enemyHero!.transform.pos.x - Math.sin(f) * 3, z: enemyHero!.transform.pos.z - Math.cos(f) * 3 };
      return;
    }

    const mate = this.mateHero(w);
    if (this.role === "support") {
      const threat = this.baseThreat(w, me);
      if (threat && !(mate && w.dist(mate, threat) < w.dist(me, threat)) && this.ok(w, me, threat)) {
        this.goal = { x: threat.transform.pos.x, z: threat.transform.pos.z };
        return;
      }
    }
    const maintain = this.role !== "attack" || w.teams[me.team].resource > 450;
    if (!maintain) this.tend = this.buildPad = null;

    if (this.tend) {
      const st = this.tend.structureId ? w.get(this.tend.structureId) : undefined;
      if (!st || st.team !== me.team || (st.structure!.ready && !st.structure!.upgrading) || (ehAlive && dHero < 7))
        this.tend = null;
      else {
        this.goal = { x: this.tend.x + (me.team ? 1.4 : -1.4), z: this.tend.z };
        return;
      }
    }
    if (!this.buildPad && maintain) this.pickBuild(w, me);
    if (this.buildPad) {
      const pad = this.buildPad;
      const st = pad.structureId ? w.get(pad.structureId) : undefined;
      const cost = this.buildType ? buildCost(w, this.buildType, !!st, me.team) : 0;
      if ((st && st.team !== me.team) || w.teams[me.team].resource < cost || !this.ok(w, me, pad)) {
        this.buildPad = null;
      } else {
        this.goal = { x: pad.x, z: pad.z };
        return;
      }
    }

    if (this.role === "attack") {
      const prey = this.enemyHeroes(w, me).find(
        (e) => w.canSee(me, e) && w.dist(me, e) < 20 && e.hp < me.hp * 1.2 && this.ok(w, me, e),
      );
      this.goal = prey ? { x: prey.transform.pos.x, z: prey.transform.pos.z } : this.frontTarget(w, me);
      return;
    }
    if (this.role === "support" && mate) {
      const own = w.core(me.team)!.transform.pos;
      const mp = mate.transform.pos;
      const back = Math.hypot(own.x - mp.x, own.z - mp.z) || 1;
      if (Math.hypot(mp.x - own.x, mp.z - own.z) > 22) {
        this.goal = {
          x: mp.x + ((own.x - mp.x) / back) * 3,
          z: mp.z + ((own.z - mp.z) / back) * 3 + (this.player % 2 ? 1.5 : -1.5),
        };
        return;
      }
    }
    const army = w.entities.filter((o) => o.alive && o.unit && o.team === me.team);
    const d = w.teams[me.team].directives.grunt;
    if (d === "push" && army.length) {
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
      this.goal = { x: cx + (core.transform.pos.x - cx) * f, z: cz + (core.transform.pos.z - cz) * f };
      return;
    }
    if (d === "follow" && army.length >= 5) {
      const enemy = this.frontTarget(w, me);
      this.goal = enemy;
      return;
    }
    const hold = w.teams[me.team].directives.holdPoint.grunt;
    this.goal = army.length < 3 ? { x: hold.x, z: hold.z + (this.player ? 2 : -2) } : this.frontTarget(w, me);
  }

  private frontTarget(w: World, me: Entity): Vec2 {
    let best: Entity | undefined;
    let bestD = Infinity;
    for (const o of w.entities) {
      if (!o.alive || o.team === me.team || !o.structure) continue;
      if (o.structure.type === "core" && o.structure.shielded) continue;
      if (!this.ok(w, me, o)) continue;
      const d = w.dist(me, o);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    if (!best) return w.spawnPoint(w.rival(me.team));
    return { x: best.transform.pos.x, z: best.transform.pos.z };
  }

  private shop(w: World, me: Entity, threatened: boolean): boolean {
    const sh = w.data.match.arena.shop;
    const ts = w.teams[me.team];
    const gold = ts.resource;
    const h = me.hero!;
    if (h.bomb && !threatened) {
      let best: Entity | undefined;
      let bd = Infinity;
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
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      const target = best ?? w.foeCore(me.team, me.transform.pos.x, me.transform.pos.z);
      if (target) {
        this.goal = { x: target.transform.pos.x, z: target.transform.pos.z };
        if (w.dist(me, target) < w.data.match.arena.shop.bomb.throwRange - 1 && this.rand() < 0.3) {
          const dx = target.transform.pos.x - me.transform.pos.x;
          const dz = target.transform.pos.z - me.transform.pos.z;
          const dl = Math.hypot(dx, dz) || 1;
          this.wantFace = { x: dx / dl, z: dz / dl };
          this.wantAttack = true;
        }
        return true;
      }
    }
    const core = w.core(me.team)!;
    const ward = (core.structure!.ward ?? 0) / w.wardMax;
    const wardOk = w.time >= ts.wardReadyAt && !w.isSudden();
    const wantWard =
      wardOk && ward < (this.role === "attack" ? 0.15 : this.role === "support" ? 0.55 : 0.4) && gold >= sh.ward.cost;
    const myArmy = w.teams[me.team].unitCount;
    const wantBomb =
      !h.bomb &&
      w.time >= (ts.bombReadyAt ?? 0) &&
      w.time >= this.bombAt &&
      gold >= sh.bomb.cost + 250 &&
      myArmy >= 4 &&
      w.entities.some(
        (o) =>
          o.alive &&
          o.structure &&
          o.team !== me.team &&
          !o.neutral &&
          o.structure.type !== "core" &&
          w.entities.some((u) => u.alive && u.unit && u.team === me.team && w.dist(u, o) < 20),
      );
    const mate = this.mateHero(w);
    const foes = this.enemyHeroes(w, me);
    const brawl = mate && this.role === "support" ? foes.find((e) => w.dist(mate, e) < 8) : undefined;
    const enemy = brawl ?? foes[0];
    const wantCannon = !!enemy && gold >= sh.cannon.cost + (brawl ? 40 : this.role === "attack" ? 300 : 150);
    if (!(wantWard || wantBomb || wantCannon)) return false;
    if (w.arena.inShop(me)) {
      if (wantWard) this.wantBuy = { item: "ward" };
      else if (wantBomb) {
        this.wantBuy = { item: "bomb" };
        this.bombAt = w.time + 90;
      } else if (enemy) this.wantBuy = { item: "cannon", at: { x: enemy.transform.pos.x, z: enemy.transform.pos.z } };
      return false;
    }
    if (threatened) return false;
    this.goal = { x: core.transform.pos.x + (me.team ? -2.5 : 2.5), z: core.transform.pos.z };
    return true;
  }

  private pickBuild(w: World, me: Entity): void {
    const res = w.teams[me.team].resource;
    const myCore = w.core(me.team)!;
    const pads = w.pads
      .filter(
        (p) => canBuildOn(p, me.team) && (w.time >= p.rubbleUntil || p.rubbleTeam !== me.team) && this.ok(w, me, p),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - myCore.transform.pos.x, a.z - myCore.transform.pos.z) -
          Math.hypot(b.x - myCore.transform.pos.x, b.z - myCore.transform.pos.z),
      );
    const outposts = w.entities.filter(
      (o) =>
        o.alive &&
        o.team === me.team &&
        o.structure &&
        w.data.structures.types[o.structure.type as StructureType]?.class === "production",
    ).length;
    const placed = new Map<string, number>();
    for (const item of PLAN) {
      const key = `${item.zone}|${item.type}`;
      const nth = placed.get(key) ?? 0;
      placed.set(key, nth + 1);
      const have = w.entities.filter(
        (o) =>
          o.alive &&
          o.team === me.team &&
          o.structure?.type === item.type &&
          o.structure.padIndex >= 0 &&
          (item.zone === "front"
            ? w.pads[o.structure.padIndex].zone !== "home"
            : w.pads[o.structure.padIndex].zone === item.zone),
      ).length;
      if (have > nth) continue;
      if (w.data.structures.types[item.type].class === "production" && outposts >= MAX_OUTPOSTS) continue;
      const pad = pads.find(
        (p) => (item.zone === "front" ? p.zone !== "home" : p.zone === item.zone) && !p.structureId,
      );
      if (!pad) continue;
      if (res >= buildCost(w, item.type, false, me.team)) {
        this.buildPad = pad;
        this.buildType = item.type;
      }
      return;
    }
    this.buildSpec = null;
    if (w.time > 150 && res >= 420) {
      for (const pad of pads) {
        const st = pad.structureId ? w.get(pad.structureId) : undefined;
        if (
          st &&
          st.team === me.team &&
          canSpec(w, st) &&
          st.structure!.ready &&
          !st.structure!.upgrading &&
          res >= specCost(w, st.structure!.type as StructureType, me.team) + 170
        ) {
          this.buildPad = pad;
          this.buildType = st.structure!.type as StructureType;
          this.buildSpec = Math.floor(this.rand() * 3);
          return;
        }
      }
    }
    if (res >= 180) {
      for (const pad of pads) {
        const st = pad.structureId ? w.get(pad.structureId) : undefined;
        if (st && st.team === me.team && st.structure!.level < 2 && st.structure!.ready && !st.structure!.upgrading) {
          this.buildPad = pad;
          this.buildType = st.structure!.type as StructureType;
          return;
        }
      }
    }
  }
}
