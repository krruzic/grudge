import type { AbilityDef } from "./config.ts";
export interface Vec2 {
  x: number;
  z: number;
}

export type UnitType = "grunt" | "ranged" | "heavy";
export const UNIT_TYPES: UnitType[] = ["grunt", "ranged", "heavy"];
export type StructureType = "damage" | "control" | "support" | "barracks" | "range" | "foundry" | "outpost";
export const STRUCTURE_TYPES: StructureType[] = ["damage", "control", "support", "barracks", "range", "foundry", "outpost"];
export type Directive = "push" | "hold" | "follow" | "nearest" | "focus" | "defend";
export type TargetClass = UnitType | "hero" | "structure";
export type PadZone = "home" | "forward" | "neutral";

export interface Transform {
  pos: Vec2;
  prevPos: Vec2;
  y: number;
  prevY: number;
  facing: number;
  prevFacing: number;
}

export interface Status {
  slowUntil: number;
  slowMul: number;
  stunUntil: number;
  kvx: number;
  kvz: number;
  buffUntil: number;
  buffDamageMul: number;
  buffSpeedMul: number;
  rallyUntil: number;
  hauntUntil?: number;
  invulnUntil: number;
  lastAttackAt: number;
  lastHitAt: number;
  lastHitX: number;
  lastHitZ: number;
  hidden: boolean;
  supportDamageMul: number;
  auraDamageMul: number;
  stealthUntil: number;
  ambushMul: number;
  stealUntil?: number;
  stealMul?: number;
  guardUntil: number;
  guardMul: number;
  cowedUntil: number;
  hexUntil: number;
  hexOwner: number;
  bleedStacks: number;
  bleedDps: number;
  bleedUntil: number;
  bleedOwner: number;
  shield: number;
  shieldUntil: number;
  shieldBurst: number;
  armorMul: number;
  armorUntil: number;
  ccImmuneUntil: number;
  markUntil: number;
  markTeam: number;
  markOwner: number;
  markMul: number;
  markAll: boolean;
  markWeaken: number;
}

export interface HeroAction {
  name: "a" | "b" | "r" | "z" | "dodge" | "hit" | "shove";
  t: number;
  dur: number;
  hitAt: number;
  fired: boolean;
  combo: number;
  dirX: number;
  dirZ: number;
  kind: string;
  fromX?: number;
  fromZ?: number;
  toX?: number;
  toZ?: number;
  hitIds?: number[];
  power?: number;
  placed?: boolean;
  jab?: boolean;
  fromX2?: number;
  fromZ2?: number;
  pinned?: Record<number, [number, number]>;
}

export interface HeroState {
  type: string;
  player: number;
  speed: number;
  damageMul: number;
  vel: Vec2;
  action: HeroAction | null;
  comboIndex: number;
  comboUntil: number;
  cooldowns: Record<string, number>;
  meter: number;
  blocking: boolean;
  charging?: "a" | "b";
  chargeT?: number;
  dead: boolean;
  respawnAt: number;
  morphAt?: number;
  morphBack?: boolean;
  morphed?: { type: string; level: number; xp: number; maxHp: number; damageMul: number; speed: number; path: Record<string, number[]>; picks: string[]; stepHeight: number; maxSlope: number };
  recallUsed?: boolean;
  recallAt?: number;
  recallFrom?: number;
  lastTargetId: number;
  lastTargetAt: number;
  anim: string;
  animStart: number;
  stepHeight: number;
  maxSlope: number;
  openingUntil: number;
  combatAt: number;
  actionEndAt: number;
  bomb: boolean;
  stuckFor: number;
  xp: number;
  level: number;
  picks: ("a" | "b" | "r" | "z")[];
  path: { a: number[]; b: number[]; r: number[]; z: number[] };
  ab: Record<"a" | "b" | "r" | "z", AbilityDef> | null;
  frenzy: number;
  frenzyUntil: number;
  recastUntil: number;
  empowerMul: number;
  empowerUntil: number;
  onWorks?: boolean;
  aim: { x: number; z: number; until: number } | null;
}

export interface UnitState {
  prog?: { x: number; z: number; t: number };
  detourUntil?: number;
  detourX?: number;
  detourZ?: number;
  type: UnitType;
  damage: number;
  speed: number;
  range: number;
  cooldown: number;
  aggro: number;
  nextAttack: number;
  targetId: number;
  retargetAt: number;
  path: Vec2[];
  pathGoal: Vec2 | null;
  repathAt: number;
  slot: number;
  attackAnimAt: number;
  rank: number;
  kills: number;
  moving: boolean;
  raised?: boolean;
}

export interface StructureState {
  type: StructureType | "core";
  padIndex: number;
  level: number;
  builtAt: number;
  ready: boolean;
  nextAction: number;
  range: number;
  damage: number;
  lastFireAt: number;
  shielded: boolean;
  ward?: number;
  progress?: number;
  upgrading?: boolean;
  hasteUntil?: number;
  heroSlow?: number;
  hasteMul?: number;
  siege?: { cooldown: number; vs: Partial<Record<string, number>>; modId: number };
  tesla?: boolean;
}

export interface Entity {
  id: number;
  team: number;
  kind: "hero" | "unit" | "structure";
  radius: number;
  transform: Transform;
  hp: number;
  maxHp: number;
  alive: boolean;
  status: Status;
  hero?: HeroState;
  unit?: UnitState;
  structure?: StructureState;
  expiresAt?: number;
  owner?: number;
  neutral?: boolean;
}

export interface Trap {
  id: number;
  team: number;
  ownerId: number;
  x: number;
  z: number;
  radius: number;
  armAt: number;
  until: number;
  damage: number;
  stun: number;
  bonus?: boolean;
}

export interface Zone {
  id: number;
  team: number;
  ownerId: number;
  x: number;
  z: number;
  radius: number;
  until: number;
  dps: number;
  slowMul: number;
  style?: string;
  heal?: number;
  haste?: number;
}

export interface Delayed {
  id: number;
  team: number;
  ownerId: number;
  at: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  slowMul?: number;
  slowSeconds?: number;
  hexSeconds?: number;
}

export interface TerrainMod {
  id: number;
  kind: "ramp" | "wall" | "works";
  owner?: number;
  style?: string;
  cx?: number;
  cz?: number;
  top?: number;
  team: number;
  cells: number[];
  prevKind: number[];
  prevDeck: number[];
  prevStyle?: string[];
  deck: number[];
  until: number;
}

export interface Missile {
  id: number;
  ownerId: number;
  team: number;
  x: number;
  z: number;
  y: number;
  dirX: number;
  dirZ: number;
  speed: number;
  range: number;
  dist: number;
  width: number;
  damage: number;
  pierce: boolean;
  hit: number[];
  style: string;
  stun?: number;
  slowMul?: number;
  slowSeconds?: number;
  splash?: number;
  splashDamage?: number;
  chain?: number;
  endBurst?: { radius: number; damage: number };
}

export interface Boomerang {
  id: number;
  ownerId: number;
  team: number;
  x: number;
  z: number;
  y: number;
  dirX: number;
  dirZ: number;
  dist: number;
  back: boolean;
  hit: number[];
  damage: number;
  range: number;
}

export interface Projectile {
  id: number;
  team: number;
  sourceId: number;
  targetId: number;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  t: number;
  dur: number;
  ballistic: boolean;
  damage: number;
  style: string;
  prevT: number;
  canMiss: boolean;
  splash?: { radius: number; damage: number; slowMul: number; slowSeconds: number };
  slow?: { slowMul: number; slowSeconds: number };
  talent?: "bolt" | "orb";
}

export interface Pad {
  index: number;
  x: number;
  z: number;
  zone: PadZone;
  side: number;
  structureId: number;
  rubbleUntil: number;
  rubbleTeam?: number;
}

export interface TeamDirectives {
  grunt: Directive;
  ranged: Directive;
  heavy: Directive;
  holdPoint: Record<UnitType, Vec2>;
  focus: Record<UnitType, number>;
}

export const TEAM_NAMES = ["BLUE", "RED", "YELLOW", "GREEN"];

export interface TeamState {
  out?: boolean;
  resource: number;
  coreId: number;
  homeLost: boolean;
  directives: TeamDirectives;
  coreDamageDealt: number;
  kills: number;
  structuresBuilt: number;
  structuresLost: number;
  heroKills: number;
  catchUp: number;
  unitCount: number;
  commanderOrderAt: number;
  banner: { x: number; z: number; until: number } | null;
  callReadyAt: number;
  wardReadyAt: number;
}

export type ShopItem = "bomb" | "ward" | "cannon";

export interface Command {
  moveX: number;
  moveZ: number;
  attack?: boolean;
  secondary?: boolean;
  block?: boolean;
  dodge?: boolean;
  recall?: boolean;
  special?: boolean;
  super?: boolean;
  build?: StructureType | "default" | "upgrade";
  learn?: number;
  buy?: ShopItem;
  aimAt?: Vec2;
  directive?: { type: UnitType | "all"; dir: Directive };
  say?: string;
  charge?: number;
  charging?: "a" | "b";
  place?: { dx: number; dz: number };
  morph?: boolean;
}

export type SimEvent =
  | { type: "hit"; x: number; y: number; z: number; team: number; big: boolean; blocked?: boolean; id?: number; amount?: number; src?: number; fx?: number; fz?: number; crit?: boolean }
  | { type: "miss"; x: number; y: number; z: number }
  | { type: "death"; id: number; kind: Entity["kind"]; x: number; y: number; z: number; team: number; big: boolean }
  | { type: "eliminated"; team: number; by: number }
  | { type: "tide"; high: boolean }
  | { type: "morph"; stage: "start" | "done"; id: number; to: string; back: boolean; x: number; y: number; z: number; team: number; seconds: number }
  | { type: "mist"; stage: "warn" | "in" | "out"; seconds: number }
  | { type: "lantern"; stage: "rise" | "taken" | "fade"; x: number; y: number; z: number; id: number; hero: number }
  | { type: "gates"; stage: "warn" | "shift"; pattern: number; seconds: number }
  | { type: "avalanche"; stage: "warn" | "slide" | "settle"; arm: number; rect: { x: number; z: number; w: number; h: number }; dx: number; dz: number; seconds: number }
  | { type: "spawn"; id: number }
  | { type: "rankUp"; id: number; rank: number; x: number; y: number; z: number; team: number }
  | { type: "build"; id: number; padIndex: number; team: number; upgrade: boolean }
  | { type: "slam"; x: number; y: number; z: number; radius: number; team: number; zone?: boolean; trap?: boolean; src?: number }
  | { type: "warcry"; x: number; y: number; z: number; radius: number; team: number; src?: number; style?: string }
  | { type: "pulse"; x: number; y: number; z: number; radius: number; team: number }
  | { type: "heal"; x: number; y: number; z: number; team: number; src?: number }
  | { type: "banner"; team: number; x: number; y: number; z: number; until: number; src?: number }
  | { type: "rally"; x: number; y: number; z: number; radius: number; team: number; src?: number }
  | { type: "directive"; team: number; unitType: UnitType | "all"; dir: Directive }
  | { type: "notice"; team: number; text: string }
  | { type: "telegraph"; x: number; y: number; z: number; radius: number; team: number; seconds: number; src?: number; style?: string }
  | { type: "blink"; x: number; y: number; z: number; team: number; src?: number }
  | { type: "act"; src: number; slot: string; kind: string; phase: "start" | "fire"; x: number; y: number; z: number; dirX: number; dirZ: number; combo: number; toX?: number; toZ?: number }
  | { type: "parry"; x: number; y: number; z: number; team: number; src?: number }
  | { type: "mod"; id: number }
  | { type: "shot"; style: string; x: number; y: number; z: number }
  | { type: "modEnd"; id: number }
  | { type: "cannonWarn"; x: number; y: number; z: number; radius: number; seconds: number }
  | { type: "cannonHit"; x: number; y: number; z: number; radius: number }
  | { type: "relic"; state: "taken" | "dropped" | "shrined" | "stolen" | "home"; team: number; player: number; x: number; y: number; z: number }
  | { type: "reach"; x: number; y: number; z: number; tx: number; tz: number; team: number; hit: boolean; style?: string; src?: number }
  | { type: "bomb"; state: "planted" | "boom"; x: number; y: number; z: number; team: number; fuse: number }
  | { type: "callout"; x: number; y: number; z: number; team: number; text: string; owner: number }
  | { type: "repair"; x: number; y: number; z: number; team: number; radius: number; fixed: { x: number; y: number; z: number; amount: number; h: number }[]; src?: number }
  | { type: "levelup"; id: number; level: number; x: number; y: number; z: number; team: number }
  | { type: "learned"; id: number; name: string; icon: string; x: number; y: number; z: number; team: number }
  | { type: "chain"; pts: number[]; team: number }
  | { type: "pull"; x: number; y: number; z: number; radius: number; team: number }
  | { type: "shieldBreak"; x: number; y: number; z: number; team: number; burst: boolean }
  | { type: "charge"; x: number; y: number; z: number; team: number; src?: number }
  | { type: "shove"; x: number; y: number; z: number; team: number; src?: number }
  | { type: "fall"; x: number; y: number; z: number }
  | { type: "squad"; team: number; unitType: UnitType; x: number; y: number; z: number };

export interface MatchState {
  time: number;
  phase: "play" | "sudden" | "over";
  winner: number;
  reason: string;
}
