import type { StructureType, TargetClass, UnitType } from "./types.ts";

export interface HitDef {
  damage: number;
  range: number;
  arcDeg: number;
  dur: number;
  hitAt: number;
  lunge: number;
  knockback: number;
}

export interface TalentFx {
  wave?: { damage: number; length: number; width: number; stun?: number; style: string };
  waveEnd?: { radius: number; damage: number };
  bolt?: { damage: number; range: number; count: number; spread: number; style: string; splash?: number; splashDamage?: number; slowMul?: number; slowSeconds?: number; chain?: number };
  lifesteal?: number;
  lifestealVsBleed?: number;
  frenzy?: { max: number; speed: number; seconds: number; damage?: number; atMaxArc?: number; atMaxDamage?: number };
  resetOnKill?: "a" | "b" | "r";
  takedownShield?: number;
  stealthOnKill?: number;
  pull?: boolean;
  zoneAfter?: { seconds: number; dps: number; slowMul: number; style: string; radius?: number };
  echo?: { count: number; delay: number; scale: number; step?: number };
  charge?: { range: number; damage: number; knockback?: number; stun?: number };
  armorOnUse?: { mul: number; seconds: number; cc?: boolean };
  cdrOnHit?: { slot: "a" | "b" | "r"; seconds: number };
  healAllies?: number;
  chainAtMax?: { count: number; damage: number };
  structShield?: { amount: number; seconds: number };
  allyShield?: number;
  towerHaste?: { mul: number; seconds: number };
  bleed?: { dps: number; seconds: number; max: number };
  consumeBleed?: number;
  mark?: { seconds: number; mul: number; all?: boolean; burst?: number; weaken?: number };
  recast?: number;
  landShield?: number;
  summonOnKill?: { type: UnitType; seconds: number };
  shieldOnHit?: { amount: number; max: number; seconds: number };
  chain?: { count: number; mul: number };
  orbChain?: number;
  hexOnHit?: number;
  summon?: { type: UnitType; count: number; seconds: number };
  parryShield?: number;
  parryCounter?: { mul: number; stun: number };
  finisherBonus?: { damage?: number; lunge?: number; extra?: number; knock?: number };
  afterimage?: number;
  empowerNextA?: number;
  armorWhileShield?: number;
  shieldBurst?: number;
  finisherStun?: number;
  finisherZone?: { radius: number; seconds: number; dps: number; slowMul: number; style: string };
  pierce?: boolean;
  splinter?: { radius: number; damage: number };
  lifestealAura?: number;
  challenge?: { radius: number; weaken: number; armor: number; seconds: number };
  extendWalls?: number;
  grove?: { heal: number; radius?: number };
  meterOnKill?: number;
  parryMark?: boolean;
  tesla?: boolean;
}

export interface TalentWith {
  id: string;
  slot?: "a" | "b" | "r" | "z";
  set?: Record<string, unknown>;
  add?: Record<string, number>;
  mul?: Record<string, number>;
  fx?: TalentFx;
}

export interface TalentDef {
  id: string;
  name: string;
  desc: string;
  combo?: string;
  with?: TalentWith[];
  set?: Record<string, unknown>;
  add?: Record<string, number>;
  mul?: Record<string, number>;
  fx?: TalentFx;
  next?: TalentDef[];
}

export interface TalentData {
  xp: { levels: number[]; passive: number; vsHero: number; vsUnit: number; vsStructure: number; heroKill: number; unitKill: number; structureKill: number; perLevelHp: number; perLevelDamage: number };
  order: ("a" | "b" | "r" | "z")[];
  heroes: Record<string, Partial<Record<"a" | "b" | "r" | "z", TalentDef[]>>>;
}

export interface AbilityDef {
  kind: string;
  variance?: number;
  crit?: number;
  fx?: TalentFx;
  anim: string;
  hits?: HitDef[];
  comboWindow?: number;
  damage?: number;
  structureDamage?: number;
  radius?: number;
  offset?: number;
  dur?: number;
  hitAt?: number;
  cooldown?: number;
  knockback?: number;
  slowMul?: number;
  slowSeconds?: number;
  damageMul?: number;
  speedMul?: number;
  callout?: string;
  shots?: { damage: number; splash?: number; splashDamage?: number; slowMul?: number; slowSeconds?: number; dur?: number; hitAt?: number }[];
  comboCooldown?: number;
  seconds?: number;
  stunSeconds?: number;
  bot?: "fight" | "allies" | "defend" | "approach" | "repair" | "banner" | "works" | "never";
  botRange?: number;
  heal?: number;
  length?: number;
  width?: number;
  hp?: number;
  range?: number;
  speed?: number;
  delay?: number;
  units?: Partial<Record<UnitType, number>>;
  window?: number;
  counter?: number;
  count?: number;
  interval?: number;
  arcDeg?: number;
  lunge?: number;
  arm?: number;
  max?: number;
  ambushMul?: number;
  dps?: number;
  healFrac?: number;
  resetB?: boolean;
  vsSlowedMul?: number;
  vsStunnedMul?: number;
  stunBonus?: number;
  cowSeconds?: number;
  executeBelow?: number;
  executeMul?: number;
  hexSeconds?: number;
  hexRadius?: number;
  openingSeconds?: number;
  openingMul?: number;
  endTraps?: boolean;
  rearmSeconds?: number;
  size?: number;
  height?: number;
  perchMul?: number;
  perchRadius?: number;
  vs?: Partial<Record<string, number>>;
  guardMul?: number;
  structureMul?: number;
}

export interface HeroDef {
  name: string;
  blurb: string;
  health: string;
  speed: string;
  damage: string;
  defaultBuild: StructureType;
  botRange?: number;
  role?: "hero" | "commander";
  hooks: Record<string, number>;
  abilities: Record<"a" | "b" | "r" | "z", AbilityDef>;
}

export interface HeroData {
  tiers: { health: Record<string, number>; speed: Record<string, number>; damage: Record<string, number> };
  baseline: {
    radius: number;
    height: number;
    turnRate: number;
    accel: number;
    stepHeight: number;
    maxSlope: number;
    respawnSeconds: number;
    blockMoveMul: number;
    blockFrontalMul: number;
    dodgeSpeed: number;
    dodgeSeconds: number;
    dodgeCooldown: number;
    superMax: number;
    superPerDamageDealt: number;
    superPerDamageTaken: number;
    cowedDamageMul?: number;
    hitStunSeconds: number;
    commanderPriority: number;
    comboCooldown?: number;
    shove: { range: number; arcDeg: number; damage: number; knockback: number; stun: number; cooldown: number; dur: number; hitAt: number };
  };
  heroes: Record<string, HeroDef>;
}

export interface UnitDef {
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  range: number;
  cooldown: number;
  aggro: number;
  projectile: { speed: number; ballistic: boolean; losTolerance: number } | null;
  stepHeight: number;
  maxSlope: number;
  slopeSpeedMul: number;
  vs: Record<TargetClass, number>;
  knockbackResist?: number;
  bounty: number;
}

export interface VeterancyDef {
  names: string[];
  killsForRank: number[];
  heroKillValue: number;
  structureKillValue: number;
  damagePerRank: number;
  hpPerRank: number;
  healOnRank: number;
  heroicRegen: number;
  bountyPerRank: number;
}

export interface UnitData {
  popCap: number;
  waves: { firstSeconds: number; everySeconds: number; core: UnitType[]; growPerMinute: number };
  squads: { size: number; cost: Record<UnitType, number>; cooldown: number; forwardStatMul: number };
  separationPush: number;
  repathSeconds: number;
  hiddenRevealSeconds: number;
  hiddenAdjacent: number;
  veterancy: VeterancyDef;
  types: Record<UnitType, UnitDef>;
}

export interface StructureDef {
  name: string;
  class: "tower" | "production";
  cost: number;
  upgradeCost: number;
  hp: number;
  rangeMul?: number;
  damage?: number;
  cooldown?: number;
  projectile?: { speed: number; ballistic: boolean; losTolerance: number };
  vs?: Record<TargetClass, number>;
  slowMul?: number;
  slowSeconds?: number;
  knockback?: number;
  heal?: number;
  heroHealMul?: number;
  damageMul?: number;
  unit?: UnitType;
  cadence?: number;
  upgrade: Record<string, number>;
}

export interface StructureData {
  padRadius: number;
  buildSeconds: number;
  buildStartHpFrac: number;
  structureRadius: number;
  zoneRange: Record<string, number>;
  core: { hp: number; radius: number; ward: number };
  towerLimit: number;
  upgradeSeconds: number;
  rubbleSeconds: number;
  builderRadius: number;
  builderRates: { hero: number; unit: number; max: number };
  types: Record<StructureType, StructureDef>;
}

export interface MatchData {
  tickRate: number;
  maxTicksPerFrame: number;
  matchSeconds: number;
  suddenDeathSeconds: number;
  suddenDeath: { productionMul: number; costMul: number; unitDamageMul: number };
  economy: { start: number; income: number; bounty: { hero: number; structure: number } };
  catchUp: { resourceScale: number; structureWeight: number; incomeBoost: number; productionBoost: number };
  terrain: {
    highGroundDelta: number;
    highGroundRangeMul: number;
    uphillMissChance: number;
    slopeThreshold: number;
    fordSpeedMul: number;
    wallHeight: number;
    eyeHeight: number;
  };
  positional: { backstabMul: number; ambushMul: number; fallMin: number; fallDamageFrac: number; fallStun: number; knockDropMin: number };
  arena: {
    relic: { pickupRadius: number; deliverReach: number; carrySpeedMul: number; returnSeconds: number; dropLockSeconds: number; firstSeconds: number; enshrineSeconds: number; stealSeconds: number; stealReach: number; towerDamageMul: number; towerRangeMul: number; keepWardRegen: number; incomeMul: number; outpostExtra: number; outpostStatMul: number };
    cannon: { firstSeconds: number; everySeconds: number; volleys: number; spacing: number; warnSeconds: number; radius: number; damage: number; structureDamage: number; knockback: number; spread: number };
    shop: {
      radius: number;
      bomb: { cost: number; fuse: number; coreDamage: number; plantReach: number; throwRange: number; throwSeconds: number; groundFuse: number; stickReach: number; splash: number; splashDamage: number; structureSplash: number };
      ward: { cost: number; cooldown: number };
      cannon: { cost: number; shots: number; radius: number; aimSpeed: number; aimSeconds: number; spread: number };
    };
    ogre: { firstSeconds: number; respawnSeconds: number; hp: number; damage: number; speed: number; radius: number; aggro: number; range: number; cooldown: number; knockback: number; bounty: number; leash: number; blessSeconds: number; blessDamage: number; blessSpeed: number; blessXp: number };
  };
  rolls: { variance: number; critChance: number; critMul: number };
  pacing: {
    homeSpeedMul: number;
    homeRegenFrac: number;
    towerReach: number;
    towerIntruderMul: number;
    calmSeconds: number;
    calmSpeedMul: number;
    commitSeconds: number;
    commitMul: number;
    outpostReach: number;
  };
  directives: { holdLeash: number; followRadius: number; followLeash: number; followEngage: number };
}

export interface GameData {
  talents: TalentData;
  heroes: HeroData;
  units: UnitData;
  structures: StructureData;
  match: MatchData;
}
