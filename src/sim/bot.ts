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
  { zone: "forward", type: "damage" },
  { zone: "neutral", type: "control" },
  { zone: "neutral", type: "support" },
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
  private callAt = 0;
  private callIndex = 0;

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
    if (!me || !me.alive) return cmd;
    if (w.time >= this.thinkAt) {
      this.thinkAt = w.time + 0.2 + (1 - this.skill) * 0.3;
      this.think(w, me);
    }
    if (w.time >= this.directiveAt) {
      this.directiveAt = w.time + 2;
      const d = this.pickDirective(w, me);
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
    if (w.time >= this.callAt) {
      this.callAt = w.time + 1.5 + this.rand() * 2;
      const order = ["grunt", "grunt", "ranged", "heavy"] as const;
      const type = order[this.callIndex % order.length];
      const ts = w.teams[me.team];
      const cost = w.data.units.squads.cost[type];
      if (ts.resource >= cost + (this.buildType ? 60 : 0) && ts.unitCount < w.data.units.popCap) {
        cmd.call = type;
        this.callIndex++;
      }
    }
    if (this.buildPad && this.buildType && Math.hypot(this.buildPad.x - me.transform.pos.x, this.buildPad.z - me.transform.pos.z) < 2.2) {
      cmd.build = this.buildType;
      this.buildPad = null;
      this.buildType = null;
    }
    cmd.attack = this.wantAttack;
    cmd.secondary = this.wantB;
    cmd.special = this.wantR;
    cmd.super = this.wantZ;
    cmd.dodge = this.wantDodge;
    cmd.block = this.wantBlock;
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

  private think(w: World, me: Entity): void {
    const p = me.transform.pos;
    const h = me.hero!;
    const enemyHero = w.heroOf(1 - me.team);
    const ehAlive = enemyHero && enemyHero.alive;
    const dHero = ehAlive ? w.dist(me, enemyHero!) : Infinity;
    const lowHp = me.hp < me.maxHp * 0.3;

    const relic = w.arena.relic;
    if (w.arena.carrying(me)) {
      const core = w.core(1 - me.team);
      if (core) this.goal = { x: core.transform.pos.x, z: core.transform.pos.z };
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

    const nearby = w.enemiesNear(me, 7, (o) => o.kind !== "structure" || !(o.structure?.type === "core" && o.structure.shielded));
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
      return;
    }
    this.fightId = 0;

    if (!this.buildPad) this.pickBuild(w, me);
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

    const army = w.entities.filter((o) => o.alive && o.unit && o.team === me.team);
    const d = w.teams[me.team].directives.grunt;
    if (d === "push" && army.length) {
      let cx = 0;
      let cz = 0;
      for (const u of army) { cx += u.transform.pos.x; cz += u.transform.pos.z; }
      cx /= army.length;
      cz /= army.length;
      const core = w.core(1 - me.team)!;
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
    if (!best) return w.spawnPoint(1 - me.team);
    return { x: best.transform.pos.x, z: best.transform.pos.z };
  }

  private pickBuild(w: World, me: Entity): void {
    const res = w.teams[me.team].resource;
    const myCore = w.core(me.team)!;
    const pads = w.pads
      .filter((p) => canBuildOn(p, me.team))
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
        if (st && st.team === me.team && st.structure!.level < 2 && st.structure!.ready) {
          this.buildPad = pad;
          this.buildType = st.structure!.type as StructureType;
          return;
        }
      }
    }
  }
}
