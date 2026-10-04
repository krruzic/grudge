// Codex demos: the live 3D window on a codex page (menus.codexDemo()).
// While a codex page with a "shot" (one hero ability) or "scene" (map overview, troops, towers, formation,
// morph, the Grudge relic, the keep) is open, the renderer is pointed at a private demo World stepped here, and
// a demo camera frames it inside the page's window (menus.demoRect). Leaving the page restores the real world.
// Ability shots loop: the hero is reset, the button is pressed on a schedule, and pages with several
// evolutions cycle through them (one loop each).
import { World } from "../sim/world";
import { spawnUnit, createStructure, applySpec, upgrade } from "../sim/structures";
import { gainXp, learn } from "../sim/talents";
import type { GameData } from "../sim/config";
import type { Command, Entity } from "../sim/types";
import type { App } from "./app";
import { data, houses, maps, roster } from "./assets";

type Spec = NonNullable<ReturnType<App["menus"]["codexDemo"]>>;
type Pad = Parameters<typeof createStructure>[2];
type Slot = "a" | "b" | "r" | "z";

/** Demo data: no waves, relic, ogre or cannon ever show up. */
const demoData = {
  ...data,
  units: { ...data.units, waves: { ...data.units.waves, firstSeconds: 1e9 } },
  match: {
    ...data.match,
    arena: {
      ...data.match.arena,
      relic: { ...data.match.arena.relic, firstSeconds: 1e9 },
      ogre: { ...data.match.arena.ogre, firstSeconds: 1e9 },
      cannon: { ...data.match.arena.cannon, firstSeconds: 1e9 },
    },
  },
} as GameData;

/** Ability kinds that help allies (the demo adds friendly soldiers for them to affect). */
const ALLY_KINDS = new Set(["warcry", "zone", "repair", "rally", "banner", "keg", "brewfest"]);
/** Big area abilities: wider camera, longer loop. */
const BIG = new Set([
  "quake",
  "zone",
  "summon",
  "gravewalk",
  "rally",
  "warcry",
  "works",
  "ballista",
  "turret",
  "rootcage",
  "stealth",
  "teslatower",
  "palisade",
  "wall",
  "repair",
  "volley",
  "brewfest",
  "heartseeker",
]);
/** Long-reach abilities: the target soldiers stand further away. */
const FAR = new Set(["leap", "dash", "hex", "reach", "shoot", "flurry", "pip", "keg", "powderkeg"]);
/** Where the demo hero stands on the crossing map. */
const SPOT = { x: 23.5, z: 7 };
const BUTTON = { a: "attack", b: "secondary", r: "special", z: "super" } as const;
/** Ability demos (and scenes other than map overviews) play on the crossing. */
const DEMO_MAP = Math.max(
  0,
  maps.findIndex((m) => m.id === "crossing"),
);

interface DemoRun {
  key: string;
  w: World;
  t: number;
  acc: number;
  len: number;
  /** Times (s into the loop) the ability button is pressed. */
  presses: number[];
  /** Distance from the hero to the target soldiers. */
  dist: number;
  btn: keyof Command;
  /** The demo map is already on screen (skip setMap). */
  mapShown: boolean;
  kind: string;
}

const fakePad = (x: number, z: number, index: number): Pad =>
  ({ index, x, z, zone: "forward", side: 0, structureId: 0, rubbleUntil: 0, rubbleTeam: -1 }) as unknown as Pad;

/** Ground point under the demo spot raised by `lift`. */
const spotAt = (w: World, dx: number, lift: number) => ({
  x: SPOT.x + dx,
  y: w.groundY(SPOT.x, SPOT.z) + lift,
  z: SPOT.z,
});

export class CodexDemo {
  private run: DemoRun | null = null;
  /** hero|slot|picks of the ability page; the evolution index cycles per loop while it stays the same. */
  private base = "";
  private loop = 0;

  constructor(private app: App) {}

  /** Steps the demo for this frame. Returns the render interpolation alpha, or null when no demo is shown. */
  update(dt: number): number | null {
    const app = this.app;
    const spec = app.state === "menu" ? app.menus.codexDemo() : null;
    if (!spec || !app.menus.demoRect) {
      if (this.run) {
        this.run = null;
        app.view.demoCam = null;
        app.view.setMap(app.mapViews[app.shownMap], app.world.terrain);
        app.view.setWorld(app.world);
      }
      return null;
    }
    return spec.scene ? this.scene(spec.scene, dt) : this.ability(spec, dt);
  }

  // ── Scenes ──

  private scene(scene: string, dt: number): number {
    const app = this.app;
    const key = `scene|${scene}`;
    const mapScene = scene.startsWith("map:") ? Number(scene.slice(4)) : -1;
    const sceneMap = mapScene >= 0 && maps[mapScene] ? mapScene : DEMO_MAP;
    if (!this.run || this.run.key !== key) {
      const w = buildScene(scene, sceneMap, mapScene >= 0);
      app.view.setMap(app.mapViews[sceneMap], w.terrain);
      app.view.setWorld(w);
      this.run = {
        key,
        w,
        t: 0,
        acc: 0,
        len: 1e9,
        presses: [],
        dist: 0,
        btn: "attack",
        mapShown: sceneMap === DEMO_MAP,
        kind: scene,
      };
    }
    const d = this.run;
    const w = d.w;
    d.acc += Math.min(dt, 0.1);
    while (d.acc >= w.dt) {
      d.acc -= w.dt;
      d.t += w.dt;
      w.step(sceneCommands(w, scene, d.t));
      if (scene === "troops") holdTroopsPose(w, d.t);
    }
    const rect = app.menus.demoRect!;
    if (mapScene >= 0) {
      const t = w.terrain;
      app.view.demoCam = {
        rect,
        target: { x: t.width / 2, y: 0, z: t.depth / 2 },
        yaw: Math.sin(d.t * 0.12) * 0.4,
        pitch: 1.0,
        dist: Math.max(t.width, t.depth) * 1.75,
      };
    } else app.view.demoCam = { rect, ...sceneCamera(w, scene, d.t) };
    return d.acc / w.dt;
  }

  // ── Ability shots ──

  private ability(spec: Spec, dt: number): number {
    const app = this.app;
    const base = `${spec.hero}|${spec.slot}|${spec.picks}`;
    if (base !== this.base) {
      this.base = base;
      this.loop = 0;
    }
    app.menus.demoPick = this.loop;
    const pick = spec.picks ? this.loop % spec.picks : -1;
    const key = `${base}|${pick}`;
    if (!this.run || this.run.key !== key) {
      const w = buildAbilityWorld(spec.hero, spec.slot, pick);
      const me = w.heroForPlayer(0)!;
      const kind = (me.hero?.ab ?? w.heroDef(spec.hero).abilities)[spec.slot].kind;
      // Gravewalk needs a tower pad to walk to.
      if (kind === "gravewalk") w.pads.push(fakePad(SPOT.x + 10, SPOT.z, w.pads.length));
      const big = BIG.has(kind);
      const far = FAR.has(kind) || (spec.slot === "a" && kind === "shoot");
      if (!this.run || !this.run.mapShown) app.view.setMap(app.mapViews[DEMO_MAP], w.terrain);
      app.view.setWorld(w);
      this.run = {
        key,
        w,
        t: -1,
        acc: 0,
        len: kind === "works" ? 5.5 : big ? 4.6 : 3.4,
        presses: spec.slot === "a" ? [0.6, 0.95, 1.3, 1.65] : [0.6],
        dist: kind === "works" ? 8 : big ? 4.5 : far ? 6.5 : 2.8,
        btn: BUTTON[spec.slot],
        mapShown: true,
        kind,
      };
    }
    const d = this.run;
    const w = d.w;
    const me = w.heroForPlayer(0)!;
    if (d.t < 0) {
      resetAbilityLoop(w, me, d);
      d.t = 0;
    }
    d.acc += Math.min(dt, 0.1);
    while (d.acc >= w.dt) {
      d.acc -= w.dt;
      const t = d.t;
      d.t += w.dt;
      w.step([abilityCommand(w, me, d, t), { moveX: 0, moveZ: 0 }]);
      if (d.t >= d.len) {
        this.loop++;
        // Several evolutions: rebuild for the next one; otherwise replay.
        if (spec.picks > 1) {
          d.key = "";
          break;
        }
        d.t = 0;
        resetAbilityLoop(w, me, d);
      }
    }
    if (!d.key) {
      d.t = -1;
      return d.acc / w.dt;
    }
    const kind = (me.hero?.ab ?? w.heroDef(spec.hero).abilities)[spec.slot].kind;
    const big = BIG.has(kind);
    const far = FAR.has(kind);
    app.view.demoCam = {
      rect: app.menus.demoRect!,
      target: { x: SPOT.x + d.dist * 0.45, y: me.transform.y + 0.8, z: SPOT.z },
      yaw: 0.22,
      pitch: big ? 0.6 : 0.38,
      dist: big ? 15 : far ? 12.5 : 9.5,
    };
    return d.acc / w.dt;
  }
}

// ── Scene setup ──

function buildScene(scene: string, sceneMap: number, mapOverview: boolean): World {
  const w = new World(maps[sceneMap].data, mapOverview ? data : demoData, 11);
  if (mapOverview) {
    // Map overview: real heroes for every house, parked off the map.
    const n = houses(sceneMap) === 4 ? 4 : 2;
    for (let p = 0; p < n; p++) w.spawnHero(roster[p % roster.length], p, n === 4 ? p : p % 2);
    for (const e of w.entities) if (e.hero) w.teleport(e, -50, -50);
  }
  const me = mapOverview ? w.heroForPlayer(0)! : w.spawnHero(scene === "formation" ? "herald" : "warlord", 0, 0);
  const foe = mapOverview ? w.heroForPlayer(1)! : w.spawnHero("warden", 1, 1);
  const mate = scene === "morph" ? w.spawnHero("raider", 2, 0) : null;
  if (mate) w.teleport(mate, 6, 4);
  // Park both heroes in their corners, frozen and invulnerable.
  for (const h of mapOverview ? [] : [me, foe]) {
    w.teleport(h, h === me ? 4 : 96, h === me ? 4 : 44);
    h.status.stunUntil = 1e9;
    h.status.invulnUntil = 1e9;
  }
  if (scene === "grudge") {
    const r = w.arena.relic;
    r.state = "home";
    r.x = w.arena.home.x;
    r.z = w.arena.home.z;
    r.y = w.groundY(r.x, r.z);
  }
  if (scene === "morph") {
    w.teleport(me, SPOT.x, SPOT.z);
    me.status.stunUntil = 0;
    me.status.invulnUntil = 0;
  }
  if (scene === "formation") {
    w.teleport(me, SPOT.x - 3, SPOT.z);
    me.status.invulnUntil = 0;
    for (let k = 0; k < 9; k++) {
      const type = (["heavy", "grunt", "ranged"] as const)[k % 3];
      const u = spawnUnit(w, 0, type, SPOT.x + (k % 3), SPOT.z - 1 + Math.floor(k / 3), 1);
      if (u?.unit) u.unit.damage = 0;
    }
    w.setDirective(0, "all", "hold", me);
    const hp = { x: SPOT.x + 1, z: SPOT.z };
    for (const t of ["grunt", "ranged", "heavy"] as const) w.teams[0].directives.holdPoint[t] = hp;
  }
  if (scene.startsWith("tower:")) {
    // A finished level-3 tower with the page's spec, facing the incoming soldiers.
    const id = scene.slice(6);
    const kind = w.data.structures.types.damage.specs?.some((q) => q.id === id) ? "damage" : "control";
    const tw = createStructure(w, 0, fakePad(SPOT.x - 3, SPOT.z, -1), kind);
    const st = tw.structure!;
    st.ready = true;
    st.progress = 1;
    st.nextAction = 0;
    tw.hp = tw.maxHp;
    upgrade(w, tw);
    applySpec(w, tw, id);
    tw.transform.facing = tw.transform.prevFacing = Math.PI / 2;
  }
  if (scene === "troops") {
    const types = ["grunt", "ranged", "heavy"] as const;
    types.forEach((t, k) => {
      const u = spawnUnit(w, 0, t, SPOT.x - 2.2 + k * 2.2, SPOT.z, 1);
      if (u?.unit) {
        u.unit.damage = 0;
        u.transform.facing = u.transform.prevFacing = 0;
      }
    });
    const ad = w.teams[0].directives;
    ad.grunt = ad.ranged = ad.heavy = "hold";
    for (const t of types) ad.holdPoint[t] = { x: SPOT.x, z: SPOT.z };
  }
  return w;
}

/** Scripted input for scenes: morph in and out on a 4.5 s cycle, flip formation every 2.6 s, tower waves. */
function sceneCommands(w: World, scene: string, t: number): Command[] {
  const cmds: Command[] = w.players.map(() => ({ moveX: 0, moveZ: 0 }));
  const every = (period: number) => Math.floor(t / period) !== Math.floor((t - w.dt) / period);
  if (scene === "morph") {
    const me = w.heroForPlayer(0)!;
    const cyc = t % 4.5;
    if (cyc > 0.4 && cyc < 1.0 && w.morphState(me)) cmds[0].morph = true;
    if (me.hero?.morphed && cyc > 3.9) {
      w.unmorph(me);
      w.teleport(me, SPOT.x, SPOT.z);
    }
    me.transform.facing = me.transform.prevFacing = 0.15;
  }
  if (scene === "formation" && every(2.6)) cmds[0].formation = true;
  if (scene.startsWith("tower:")) {
    for (const o of w.entities) if (o.structure && o.team === 0 && o.structure.padIndex === -1) o.hp = o.maxHp;
    const foes = w.entities.filter((o) => o.alive && o.unit && o.team === 1).length;
    if (foes < 7 && every(2.2)) {
      for (let k = 0; k < 4; k++) {
        const type = (["grunt", "grunt", "ranged", "heavy"] as const)[k];
        spawnUnit(w, 1, type, SPOT.x + 6 + (k % 2) * 0.9, SPOT.z - 1 + k * 0.7, 1);
      }
    }
  }
  return cmds;
}

/** Troops scene: soldiers stand in a row and slowly turn (posing, not fighting). */
function holdTroopsPose(w: World, t: number): void {
  let k = 0;
  for (const u of w.entities) {
    if (!u.unit) continue;
    u.unit.moving = false;
    u.unit.path = [];
    w.teleport(u, SPOT.x - 2.6 + k++ * 2.6, SPOT.z);
    u.transform.facing = u.transform.prevFacing = 0.22 + Math.sin(t * 0.3) * 0.25;
  }
}

function sceneCamera(w: World, scene: string, t: number) {
  const tower = scene.startsWith("tower:");
  const home = w.arena.home;
  const core = w.core(0)!;
  const target =
    scene === "grudge"
      ? { x: home.x, y: w.groundY(home.x, home.z) + 1.0, z: home.z }
      : scene === "keep"
        ? { x: core.transform.pos.x, y: core.transform.y + 1.6, z: core.transform.pos.z }
        : scene === "formation"
          ? spotAt(w, 1, 0.5)
          : tower
            ? spotAt(w, 1.5, 1.4)
            : spotAt(w, 0, 0.9);
  const sway = 0.22 + Math.sin(t * 0.3) * 0.25;
  const yaw = scene === "keep" ? 0.9 + Math.sin(t * 0.25) * 0.25 : scene === "morph" ? 0.15 : sway;
  const pitch = scene === "keep" ? 0.42 : scene === "formation" ? 0.8 : scene === "morph" ? 0.45 : tower ? 0.5 : 0.3;
  const dist =
    scene === "keep"
      ? 15
      : scene === "grudge"
        ? 8
        : scene === "formation"
          ? 11
          : scene === "morph"
            ? 9
            : tower
              ? 14
              : 7;
  return { target, yaw, pitch, dist };
}

// ── Ability setup ──

/** The demo hero (with the evolution `pick` learned for `slot`, or none when pick < 0) vs a parked foe. */
function buildAbilityWorld(hero: string, slot: Slot, pick: number): World {
  const w = new World(maps[DEMO_MAP].data, demoData, 11);
  const me = w.spawnHero(hero, 0, 0);
  const foe = w.spawnHero(hero === "warlord" ? "warden" : "warlord", 1, 1);
  if (pick >= 0 && me.hero) {
    gainXp(w, me, 99999);
    // Talents are learned in tree order r, b, a, z: take the first option until the demoed slot.
    for (const s of ["r", "b", "a", "z"] as const) {
      learn(w, me, s === slot ? pick : 0);
      if (s === slot) break;
    }
    while (me.hero.picks.length) learn(w, me, 0);
  }
  w.teleport(foe, 96, 44);
  foe.status.stunUntil = 1e9;
  foe.status.invulnUntil = 1e9;
  return w;
}

/** Start of every loop: hero back on the spot at full health / cooldowns, fresh target and ally soldiers. */
function resetAbilityLoop(w: World, me: Entity, d: DemoRun): void {
  const healer = d.kind === "keg" || d.kind === "brewfest";
  w.teleport(me, SPOT.x, SPOT.z);
  me.transform.facing = me.transform.prevFacing = Math.PI / 2;
  me.alive = true;
  me.hp = me.maxHp;
  me.hero!.action = null;
  me.hero!.cooldowns = {};
  me.hero!.meter = 9999;
  me.hero!.pip = undefined;
  // Healing abilities need someone hurt to heal.
  if (healer) me.hp = me.maxHp * 0.45;
  me.status.stealthUntil = 0;
  me.status.hidden = false;
  w.kegs.length = 0;
  for (const u of w.entities)
    if (u.unit || (u.structure && u.structure.padIndex < 0 && u.structure.type !== "core")) u.alive = false;
  w.zones.length = 0;
  w.traps.length = 0;
  for (const m of w.mods) m.until = w.time;

  // Six harmless enemy grunts holding at the ability's reach.
  const cx = SPOT.x + d.dist + 1;
  for (let k = 0; k < 6; k++) {
    const u = spawnUnit(w, 1, "grunt", cx + Math.floor(k / 3) * 1.4, SPOT.z - 1.4 + (k % 3) * 1.4, 1);
    if (u?.unit) {
      u.unit.damage = 0;
      u.transform.facing = u.transform.prevFacing = -Math.PI / 2;
    }
  }
  const td = w.teams[1].directives;
  td.grunt = td.ranged = td.heavy = "hold";
  td.holdPoint.grunt = { x: cx + 0.7, z: SPOT.z };

  if (ALLY_KINDS.has(d.kind)) {
    for (let k = 0; k < 3; k++) {
      const u = spawnUnit(w, 0, "grunt", SPOT.x - 1.2 + (k === 1 ? -0.8 : 0), SPOT.z - 1.6 + k * 1.6, 1);
      if (u?.unit) {
        u.unit.damage = 0;
        if (healer) u.hp = u.maxHp * 0.35;
        u.transform.facing = u.transform.prevFacing = Math.PI / 2;
      }
    }
    const ad = w.teams[0].directives;
    ad.grunt = ad.ranged = ad.heavy = "hold";
    ad.holdPoint.grunt = { x: SPOT.x - 1.4, z: SPOT.z };
  }

  // Gravewalk: a tower of ours on the fake pad to walk to.
  const gravePad = d.kind === "gravewalk" ? w.pads.find((q) => q.x === SPOT.x + 10 && q.z === SPOT.z) : undefined;
  if (gravePad) {
    const old = gravePad.structureId ? w.get(gravePad.structureId) : undefined;
    if (!old?.alive) {
      const tw = createStructure(w, 0, gravePad, "damage");
      tw.structure!.ready = true;
      tw.structure!.progress = 1;
      tw.hp = tw.maxHp;
    }
  }
  // Repair: a damaged building to fix.
  if (d.kind === "repair") {
    const st = w.addEntity(0, "structure", 1.2, SPOT.x - 1, SPOT.z + 3.2, 620);
    st.structure = {
      type: "damage",
      padIndex: -1,
      level: 1,
      builtAt: 0,
      ready: true,
      nextAction: 1e9,
      range: 0,
      damage: 0,
      lastFireAt: -99,
      shielded: false,
    };
    st.hp = 180;
  }
}

/** The demo hero's command at loop time t: walk onto Works ramps, press the ability button on schedule. */
function abilityCommand(w: World, me: Entity, d: DemoRun, t: number): Command {
  const cmd: Command = { moveX: 0, moveZ: 0 };
  if (d.kind === "works" && t > 1.4) {
    const m = w.mods.find((q) => q.owner === me.id && q.kind === "works" && q.cx !== undefined);
    if (m) {
      const dx = m.cx! - me.transform.pos.x;
      const dz = m.cz! - me.transform.pos.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.4) {
        cmd.moveX = dx / dl;
        cmd.moveZ = dz / dl;
      }
    }
  }
  if (d.presses.some((p) => t < p && d.t >= p)) {
    (cmd as unknown as Record<string, unknown>)[d.btn] = true;
    cmd.moveX = 1;
    if (d.kind === "gravewalk") cmd.place = { dx: SPOT.x + 10 - me.transform.pos.x, dz: 0 };
  }
  return cmd;
}
