export interface Vec2 {
  x: number;
  z: number;
}

export type UnitType = "grunt" | "ranged" | "heavy";
export const UNIT_TYPES: UnitType[] = ["grunt", "ranged", "heavy"];
export type StructureType = "damage" | "control" | "support" | "barracks" | "range" | "foundry";
export const STRUCTURE_TYPES: StructureType[] = ["damage", "control", "support", "barracks", "range", "foundry"];
export type Directive = "push" | "hold" | "follow" | "nearest" | "focus";
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
  invulnUntil: number;
  lastAttackAt: number;
  hidden: boolean;
  supportDamageMul: number;
  auraDamageMul: number;
  stealthUntil: number;
  ambushMul: number;
  guardUntil: number;
  guardMul: number;
  cowedUntil: number;
  hexUntil: number;
  hexOwner: number;
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
  dead: boolean;
  respawnAt: number;
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
  aim: { x: number; z: number; until: number } | null;
}

export interface UnitState {
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
  siege?: { cooldown: number; vs: Partial<Record<string, number>>; modId: number };
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
}

export interface Pad {
  index: number;
  x: number;
  z: number;
  zone: PadZone;
  side: number;
  structureId: number;
  rubbleUntil: number;
}

export interface TeamDirectives {
  grunt: Directive;
  ranged: Directive;
  heavy: Directive;
  holdPoint: Record<UnitType, Vec2>;
  focus: Record<UnitType, number>;
}

export interface TeamState {
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
  special?: boolean;
  super?: boolean;
  build?: StructureType | "default" | "upgrade";
  call?: UnitType;
  buy?: ShopItem;
  aimAt?: Vec2;
  directive?: { type: UnitType | "all"; dir: Directive };
}

export type SimEvent =
  | { type: "hit"; x: number; y: number; z: number; team: number; big: boolean; blocked?: boolean; id?: number; amount?: number; src?: number; fx?: number; fz?: number }
  | { type: "miss"; x: number; y: number; z: number }
  | { type: "death"; id: number; kind: Entity["kind"]; x: number; y: number; z: number; team: number; big: boolean }
  | { type: "spawn"; id: number }
  | { type: "rankUp"; id: number; rank: number; x: number; y: number; z: number; team: number }
  | { type: "build"; id: number; padIndex: number; team: number; upgrade: boolean }
  | { type: "slam"; x: number; y: number; z: number; radius: number; team: number }
  | { type: "warcry"; x: number; y: number; z: number; radius: number; team: number }
  | { type: "pulse"; x: number; y: number; z: number; radius: number; team: number }
  | { type: "heal"; x: number; y: number; z: number; team: number }
  | { type: "banner"; team: number; x: number; y: number; z: number; until: number }
  | { type: "rally"; x: number; y: number; z: number; radius: number; team: number }
  | { type: "directive"; team: number; unitType: UnitType | "all"; dir: Directive }
  | { type: "notice"; team: number; text: string }
  | { type: "telegraph"; x: number; y: number; z: number; radius: number; team: number; seconds: number }
  | { type: "blink"; x: number; y: number; z: number; team: number }
  | { type: "parry"; x: number; y: number; z: number; team: number }
  | { type: "mod"; id: number }
  | { type: "shot"; style: string; x: number; y: number; z: number }
  | { type: "modEnd"; id: number }
  | { type: "cannonWarn"; x: number; y: number; z: number; radius: number; seconds: number }
  | { type: "cannonHit"; x: number; y: number; z: number; radius: number }
  | { type: "relic"; state: "taken" | "dropped" | "delivered" | "cracked" | "home"; team: number; player: number; x: number; y: number; z: number }
  | { type: "reach"; x: number; y: number; z: number; tx: number; tz: number; team: number; hit: boolean }
  | { type: "bomb"; state: "planted" | "boom"; x: number; y: number; z: number; team: number; fuse: number }
  | { type: "shove"; x: number; y: number; z: number; team: number }
  | { type: "fall"; x: number; y: number; z: number }
  | { type: "squad"; team: number; unitType: UnitType; x: number; y: number; z: number };

export interface MatchState {
  time: number;
  phase: "play" | "sudden" | "over";
  winner: number;
  reason: string;
}
