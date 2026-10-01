import type { World } from "./world.ts";
import type { Command, Directive, Entity, Pad, StructureType, Vec2 } from "./types.ts";
import { buildCost, canBuildOn } from "./structures.ts";

interface PlanItem {
  zone: Pad["zone"];
  type: StructureType;
}

const PLAN: PlanItem[] = [
  { zone: "home", type: "barracks" },
  { zone: "home", type: "damage" },
  { zone: "forward", type: "range" },
  { zone: "home", type: "foundry" },
  { zone: "forward", type: "barracks" },
  { zone: "forward", type: "damage" },
  { zone: "neutral", type: "barracks" },
  { zone: "home", type: "range" },
  { zone: "neutral", type: "control" },
  { zone: "forward", type: "foundry" },
];

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
  private fightId = 0;
  private seed: number;
  private wantAttack = false;
  private wantB = false;
  private wantR = false;
  private wantZ = false;
  private wantDodge = false;
  private wantBlock = false;
  picks: number[] | null = null;
  private wantBuy: { item: "bomb" | "ward" | "cannon"; at?: Vec2 } | null = null;
  private tend: Pad | null = null;
  private wantFace: Vec2 | null = null;
  private wantRecall = false;
  mate: number | null = null;
  role: "solo" | "attack" | "support" = "solo";
  private homeScore = 0.3;
  private roleAt = -99;
  private roleCheckAt = 0;
  private humanOrderAt = -99;
  private sayText: string | null = null;
  private helpSaidAt = -99;

  constructor(readonly player: number, private skill = 0.8, seed = 7) {
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
      cmd.learn = this.picks ? this.picks[k % this.picks.length] : this.rand() < 0.5 ? 0 : 1;
    }
    if (!me || !me.alive) return cmd;
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
      const d = this.role === "solo" ? this.pickDirective(w, me) : this.role === "support" && w.time - this.humanOrderAt > 25 ? this.supportDirective(w, me) : cur;
      if (d !== this.lastDirective) {
        cmd.directive = { type: "all", dir: d };
        this.lastDirective = d;
      }
    }
    if (this.goal) {
      const p = me.transform.pos;
      const dist = Math.hypot(this.goal.x - p.x, this.goal.z - p.z);
      if (dist > 0.6) {
        let wp = this.goal;
        if (!(dist < 8 && w.nav.lineClear(p, this.goal))) {
          if (w.time >= this.repathAt || !this.pathGoal || Math.hypot(this.pathGoal.x - this.goal.x, this.pathGoal.z - this.goal.z) > 2) {
            this.path = w.nav.findPath(p, this.goal, me.transform.y) ?? [];
            this.pathGoal = { ...this.goal };
            this.repathAt = w.time + 1;
          }
          const sameCell = (q: Vec2) => Math.floor(q.x) === Math.floor(p.x) && Math.floor(q.z) === Math.floor(p.z);
          while (this.path.length > 1 && (sameCell(this.path[0]) || Math.hypot(this.path[0].x - p.x, this.path[0].z - p.z) < 0.25 || (Math.hypot(this.path[0].x - p.x, this.path[0].z - p.z) < 0.9 && w.nav.lineClear(p, this.path[1])))) this.path.shift();
          if (Math.hypot(p.x - this.progress.x, p.z - this.progress.z) > 0.5) this.progress = { x: p.x, z: p.z, t: w.time };
          else if (w.time - this.progress.t > 1 && !me.hero?.action) {
            if (this.path.length > 1) this.path.shift();
            this.repathAt = w.time + 0.5;
            this.progress = { x: p.x, z: p.z, t: w.time };
          }
          if (this.path.length) wp = this.path[0];
        }
        const dx = wp.x - p.x;
        const dz = wp.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        cmd.moveX = dx / d;
        cmd.moveZ = dz / d;
      }
    }
    if (this.buildPad && this.buildType && Math.hypot(this.buildPad.x - me.transform.pos.x, this.buildPad.z - me.transform.pos.z) < 2.2) {
      cmd.build = this.buildType;
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
    cmd.attack = this.wantAttack;
    cmd.secondary = this.wantB;
    cmd.special = this.wantR;
    cmd.super = this.wantZ;
    cmd.dodge = this.wantDodge;
    cmd.recall = this.wantRecall;
    this.wantRecall = false;
    cmd.block = this.wantBlock && !w.arena.carrying(me);
    this.wantAttack = this.wantB = this.wantR = this.wantZ = this.wantDodge = false;
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
    return w.players.filter((k) => k.team !== me.team).map((k) => w.get(k.heroId)).filter((e): e is Entity => !!e && e.alive);
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
      const tending = w.arena.inShop(mate) || w.pads.some((pd) => pd.side === me.team && Math.hypot(pd.x - mate.transform.pos.x, pd.z - mate.transform.pos.z) < 3);
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
    const foes = this.enemyHeroes(w, me).filter((e) => w.dist(mate, e) < 9 && !(e.status.hidden && w.dist(me, e) > 2.5));
    if (!foes.length) return undefined;
    const friends = w.players.filter((k) => k.team === me.team && k.player !== this.player).map((k) => w.get(k.heroId)).filter((e) => e && e.alive && w.dist(mate, e) < 9).length;
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

  private think(w: World, me: Entity): void {
    const p = me.transform.pos;
    const h = me.hero!;
    const assist = this.assistTarget(w, me);
    let enemyHero = assist;
    if (!enemyHero) {
      let bd = Infinity;
      for (const e of this.enemyHeroes(w, me)) {
        const d = w.dist(me, e);
        if (d < bd) { bd = d; enemyHero = e; }
      }
    }
    const ehAlive = enemyHero && enemyHero.alive;
    const dHero = ehAlive ? w.dist(me, enemyHero!) : Infinity;
    const lowHp = me.hp < me.maxHp * 0.3;

    const shopDone = this.shop(w, me, !!ehAlive && dHero < 8);
    if (shopDone) return;
    const relic = w.arena.relic;
    if (w.arena.carrying(me)) {
      let best: Entity | undefined;
      let bd = Infinity;
      for (const o of w.entities) {
        if (!o.alive || o.team !== me.team || !w.arena.isTowerOrKeep(o)) continue;
        const d = w.dist(me, o);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) this.goal = { x: best.transform.pos.x, z: best.transform.pos.z };
      return;
    }
    const enemyShrine = relic.state === "shrined" && relic.team >= 0 && relic.team !== me.team ? w.arena.shrineOf(relic.team) : null;
    if (enemyShrine && !lowHp && w.dist(me, enemyShrine) < 22 && !(ehAlive && dHero < 5)) {
      this.goal = { x: enemyShrine.transform.pos.x, z: enemyShrine.transform.pos.z };
      return;
    }
    if ((relic.state === "home" || relic.state === "dropped") && !lowHp) {
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
    if (assist && !lowHp && dHero > 9 + (w.heroDef(h.type).botRange ?? 1.8)) {
      this.goal = { x: assist.transform.pos.x, z: assist.transform.pos.z };
      const ab0 = w.heroDef(h.type).abilities;
      if (ab0.r.bot === "approach" && (h.cooldowns.r ?? 0) <= w.time && dHero < (ab0.r.botRange ?? 10)) this.wantR = true;
      return;
    }
    if (lowHp && dHero < 10) {
      const sp = w.spawnPoint(me.team);
      this.goal = sp;
      this.wantBlock = dHero < 3 && this.rand() < 0.5;
      if (dHero < 2.6) this.wantAttack = true;
      return;
    }

    if (ehAlive && enemyHero!.hero!.action && (enemyHero!.hero!.action.name === "b" || enemyHero!.hero!.action.name === "z") && dHero < 4.5) {
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
    const enemyAttacking = ehAlive && !!enemyHero!.hero!.action && enemyHero!.hero!.action.name !== "dodge" && dHero < 3.5;
    const useHint = (k: "b" | "r" | "z", d: number): boolean => {
      const a = ab[k];
      switch (a.bot) {
        case "fight": return d <= (a.botRange ?? 3);
        case "allies": return allies >= 3 && nearby.length >= 2;
        case "defend": return !!enemyAttacking;
        case "approach": return !!ehAlive && dHero < (a.botRange ?? 10) && dHero > 4;
        case "banner": {
          const bp = w.rallyPoint(me.team);
          return allies >= 3 && (!bp || Math.hypot(bp.x - p.x, bp.z - p.z) > 10);
        }
        case "works": return !w.mods.some((m) => m.kind === "works" && m.owner === me.id) && w.entities.some((o) => o.alive && o.structure && o.team !== me.team && !o.structure.siege && w.dist(me, o) < (a.botRange ?? 12));
        case "repair": return w.entities.some((o) => o.alive && o.structure && o.team === me.team && o.hp < o.maxHp * 0.7 && w.dist(me, o) < (a.radius ?? 6));
        default: return false;
      }
    };
    const full = h.meter >= w.data.heroes.baseline.superMax;
    const siegeHero = ab.z.kind === "ballista";
    if (full && (!siegeHero || !rdy("r")) && ((ehAlive && useHint("z", dHero)) || nearby.length >= 4)) this.wantZ = true;
    if (siegeHero && full && !lowHp) {
      const works = w.mods.find((m) => m.kind === "works" && m.owner === me.id && m.cx !== undefined);
      if (works) {
        if (Math.hypot(works.cx! - p.x, works.cz! - p.z) < 1.3) this.wantZ = true;
        else if (!(ehAlive && dHero < 4)) {
          this.goal = { x: works.cx!, z: works.cz! };
          return;
        }
      } else if (rdy("r") && ((ehAlive && dHero < 10) || nearby.length >= 2 || w.entities.some((o) => o.alive && o.structure && o.team !== me.team && !o.structure.siege && w.dist(me, o) < 16))) this.wantR = true;
    }
    if (rdy("r") && ab.r.bot !== "fight" && useHint("r", dHero)) this.wantR = true;
    if (rdy("b") && (ab.b.bot === "repair" || ab.b.bot === "banner") && useHint("b", 0)) this.wantB = true;

    const lan = w.mapEvents.lantern;
    if (lan && lan.state !== "rise" && !lowHp && Math.hypot(lan.x - p.x, lan.z - p.z) < 22 && !(ehAlive && dHero < 4)) {
      this.goal = { x: lan.x, z: lan.z };
      return;
    }
    let fight: Entity | undefined;
    if (ehAlive && dHero < 9 + prefer && !(enemyHero!.status.hidden && dHero > 2.5)) fight = enemyHero;
    else if (nearby.length) {
      nearby.sort((a, b) => w.dist(me, a) - w.dist(me, b));
      fight = nearby.find((o) => o.kind !== "structure" || w.dist(me, o) < 5) ?? undefined;
    }
    if (fight) {
      const towerThreat = w.enemiesNear(me, 12, (o) => o.structure?.type === "damage" && o.structure.ready).length;
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
      } else this.goal = { x: fx, z: fz };
      const aReach = ab.a.kind === "combo" ? ab.a.hits![0].range - 0.1 : ab.a.botRange ?? 6;
      if (d < aReach && this.rand() < this.skill) this.wantAttack = true;
      if (rdy("b") && ab.b.bot === "fight" && useHint("b", d) && this.rand() < 0.35) this.wantB = true;
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
        if ((this.wantAttack || this.wantB || this.wantR) && !this.wantDodge) this.wantFace = { x: tx / tl, z: tz / tl };
      }
      return;
    }
    this.fightId = 0;

    const mate = this.mateHero(w);
    if (this.role === "support") {
      const threat = this.baseThreat(w, me);
      if (threat && !(mate && w.dist(mate, threat) < w.dist(me, threat))) {
        this.goal = { x: threat.transform.pos.x, z: threat.transform.pos.z };
        return;
      }
    }
    const maintain = this.role !== "attack" || w.teams[me.team].resource > 450;
    if (!maintain) this.tend = this.buildPad = null;

    if (this.tend) {
      const st = this.tend.structureId ? w.get(this.tend.structureId) : undefined;
      if (!st || st.team !== me.team || (st.structure!.ready && !st.structure!.upgrading) || (ehAlive && dHero < 7)) this.tend = null;
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
      if ((st && st.team !== me.team) || w.teams[me.team].resource < cost) {
        this.buildPad = null;
      } else {
        this.goal = { x: pad.x, z: pad.z };
        return;
      }
    }

    if (this.role === "attack") {
      const prey = this.enemyHeroes(w, me).find((e) => !e.status.hidden && w.dist(me, e) < 20 && e.hp < me.hp * 1.2);
      this.goal = prey ? { x: prey.transform.pos.x, z: prey.transform.pos.z } : this.frontTarget(w, me);
      return;
    }
    if (this.role === "support" && mate) {
      const own = w.core(me.team)!.transform.pos;
      const mp = mate.transform.pos;
      const back = Math.hypot(own.x - mp.x, own.z - mp.z) || 1;
      if (Math.hypot(mp.x - own.x, mp.z - own.z) > 22) {
        this.goal = { x: mp.x + ((own.x - mp.x) / back) * 3, z: mp.z + ((own.z - mp.z) / back) * 3 + (this.player % 2 ? 1.5 : -1.5) };
        return;
      }
    }
    const army = w.entities.filter((o) => o.alive && o.unit && o.team === me.team);
    const d = w.teams[me.team].directives.grunt;
    if (d === "push" && army.length) {
      let cx = 0;
      let cz = 0;
      for (const u of army) { cx += u.transform.pos.x; cz += u.transform.pos.z; }
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
      const d = w.dist(me, o);
      if (d < bestD) { bestD = d; best = o; }
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
        if (!o.alive || !o.structure || o.team === me.team || o.neutral || o.structure.type === "core" || o.structure.siege) continue;
        const d = w.dist(me, o);
        if (d < bd) { bd = d; best = o; }
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
    const ward = (core.structure!.ward ?? 0) / w.data.structures.core.ward;
    const wardOk = w.time >= ts.wardReadyAt && !w.isSudden();
    const wantWard = wardOk && ward < (this.role === "attack" ? 0.15 : this.role === "support" ? 0.55 : 0.4) && gold >= sh.ward.cost;
    const wantBomb = !h.bomb && gold >= sh.bomb.cost + 120 && w.entities.some((o) => o.alive && o.structure && o.team !== me.team && !o.neutral && o.structure.type !== "core");
    const mate = this.mateHero(w);
    const foes = this.enemyHeroes(w, me);
    const brawl = mate && this.role === "support" ? foes.find((e) => w.dist(mate, e) < 8) : undefined;
    const enemy = brawl ?? foes[0];
    const wantCannon = !!enemy && gold >= sh.cannon.cost + (brawl ? 40 : this.role === "attack" ? 300 : 150);
    if (!(wantWard || wantBomb || wantCannon)) return false;
    if (w.arena.inShop(me)) {
      if (wantWard) this.wantBuy = { item: "ward" };
      else if (wantBomb) this.wantBuy = { item: "bomb" };
      else if (enemy) this.wantBuy = { item: "cannon", at: { x: enemy.transform.pos.x, z: enemy.transform.pos.z } };
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
      .filter((p) => canBuildOn(p, me.team) && (w.time >= p.rubbleUntil || p.rubbleTeam !== me.team))
      .sort((a, b) => Math.hypot(a.x - myCore.transform.pos.x, a.z - myCore.transform.pos.z) - Math.hypot(b.x - myCore.transform.pos.x, b.z - myCore.transform.pos.z));
    for (const item of PLAN) {
      const pad = pads.find((p) => p.zone === item.zone && !p.structureId);
      if (!pad) continue;
      if (res >= buildCost(w, item.type, false, me.team)) {
        this.buildPad = pad;
        this.buildType = item.type;
      }
      return;
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
