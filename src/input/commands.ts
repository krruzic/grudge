import type { PadState } from "./gamepads";
import type { Command, Directive, ShopItem, StructureType, UnitType } from "../sim/types";

type Flick = "up" | "down" | "left" | "right";

const DIRECTIVE_BY_FLICK: Record<Flick, Directive> = { up: "push", down: "hold", left: "follow", right: "defend" };
const TOWER_BY_FLICK: Partial<Record<Flick, StructureType>> = { up: "damage", left: "control" };
const PROD_BY_FLICK: Partial<Record<Flick, StructureType>> = { left: "barracks", up: "range", right: "foundry" };
const SHOP_BY_FLICK: Partial<Record<Flick, ShopItem>> = { up: "bomb", left: "ward", right: "cannon" };

export interface MapperUi {
  buildMenu: "closed" | "prod" | "tower" | "shop" | "learn";
  commander: boolean;
  group: UnitType | "all";
  groupAt: number;
  lastOrderAt: number;
  learnReady: boolean;
  charge: { slot: "a" | "b"; k: number } | null;
  morph: number;
  morphBack: boolean;
  reticle: { slot: "b" | "r" | "z"; dx: number; dz: number; range: number } | null;
}

export interface AimInfo {
  facing: number;
  b?: number;
  r?: number;
  z?: number;
  ready?: { b: boolean; r: boolean; z: boolean };
}

const TAP = 0.2;
const CHARGE_FULL = 0.8;

const GROUPS: (UnitType | "all")[] = ["all", "grunt", "ranged", "heavy"];

export class CommandMapper {
  private place = { dx: 0, dz: 0 };
  private pending: Command = { moveX: 0, moveZ: 0 };
  private armed = true;
  private xDown = false;
  private xUsed = false;
  private tDown = false;
  private tUsed = false;
  private mouseRightWas = false;
  readonly ui: MapperUi;
  private groupIndex = 0;
  private restAt = -99;
  private smashArmed = true;
  smash = { from: 0.3, to: 0.85, within: 0.12 };

  constructor(private flickThreshold: number, commander = false) {
    this.ui = { buildMenu: "closed", commander, group: "all", groupAt: -99, lastOrderAt: -99, learnReady: false, charge: null, reticle: null, morph: 0, morphBack: false };
  }

  private flick(p: PadState): Flick | null {
    const m = Math.hypot(p.cX, p.cY);
    if (m < 0.35) {
      this.armed = true;
      return null;
    }
    if (!this.armed || m < this.flickThreshold) return null;
    this.armed = false;
    if (Math.abs(p.cX) > Math.abs(p.cY)) return p.cX > 0 ? "right" : "left";
    return p.cY > 0 ? "down" : "up";
  }

  private holdAt: Record<"a" | "b" | "r" | "z" | "bp", number> = { a: -1, b: -1, r: -1, z: -1, bp: -1 };
  private lastNow = 0;
  morphable: "to" | "back" | null = null;
  morphHold = 0.6;
  private xHeldFor = -1;

  update(p: PadState, now: number, atPad = false, atHome = false, canLearn = false, aim: AimInfo | null = null): void {
    const c = this.pending;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    c.moveX = p.stickX;
    c.moveZ = p.stickY;
    c.block = p.held.block;
    c.charging = undefined;
    this.ui.charge = null;
    const bAims = !!aim?.b;
    for (const k of ["a", "b"] as const) {
      if (k === "b" && bAims) continue;
      const btn = k === "a" ? "a" : "b";
      if (p.pressed[btn]) this.holdAt[k] = now;
      if (this.holdAt[k] < 0) continue;
      const held = now - this.holdAt[k];
      if (p.held[btn] && !p.held.block) {
        if (held > TAP) {
          c.charging = k;
          this.ui.charge = { slot: k, k: Math.min(1, (held - TAP) / CHARGE_FULL) };
        }
        continue;
      }
      this.holdAt[k] = -1;
      if (k === "a") c.attack = true;
      else c.secondary = true;
      if (held > TAP) c.charge = Math.min(1, (held - TAP) / CHARGE_FULL);
    }
    this.ui.reticle = null;
    for (const slot of ["bp", "r", "z"] as const) {
      const k = slot === "bp" ? "b" : slot;
      const btn = k;
      if (k === "z" && p.held.start) continue;
      if (k === "b" && !bAims) continue;
      const range = aim?.[k];
      if (p.pressed[btn]) {
        if (!range || aim?.ready?.[k] === false) {
          this.holdAt[slot] = -1;
          if (k === "r") c.special = true;
          else if (k === "z") c.super = true;
          else c.secondary = true;
          continue;
        }
        this.holdAt[slot] = now;
        this.place = { dx: Math.sin(aim!.facing) * Math.min(range, 4), dz: Math.cos(aim!.facing) * Math.min(range, 4) };
      }
      if (this.holdAt[slot] < 0) continue;
      const held = now - this.holdAt[slot];
      if (p.pressed.block && range) {
        this.holdAt[slot] = -1;
        continue;
      }
      if (p.held[btn]) {
        if (held > TAP && range) {
          this.place.dx += p.stickX * 12 * dt;
          this.place.dz += p.stickY * 12 * dt;
          const d = Math.hypot(this.place.dx, this.place.dz);
          if (d > range) {
            this.place.dx *= range / d;
            this.place.dz *= range / d;
          }
          c.moveX = c.moveZ = 0;
          this.ui.reticle = { slot: k, dx: this.place.dx, dz: this.place.dz, range };
        }
        continue;
      }
      this.holdAt[slot] = -1;
      if (k === "r") c.special = true;
      else if (k === "z") c.super = true;
      else c.secondary = true;
      if (held > TAP && range) c.place = { ...this.place };
    }
    if (p.pressed.dodge) c.dodge = true;
    const blockDodge = p.pressed.x && p.held.block && p.profile !== "keyboard";
    if (blockDodge) c.dodge = true;
    const sm = Math.hypot(p.stickX, p.stickY);
    if (sm < this.smash.from) {
      this.restAt = now;
      this.smashArmed = true;
    } else if (sm >= this.smash.to && this.smashArmed && p.profile !== "keyboard") {
      this.smashArmed = false;
      if (p.held.block && now - this.restAt <= this.smash.within) c.dodge = true;
    }

    if (p.pressed.right || p.pressed.left) {
      this.groupIndex = (this.groupIndex + (p.pressed.right ? 1 : GROUPS.length - 1)) % GROUPS.length;
      this.ui.group = GROUPS[this.groupIndex];
      this.ui.groupAt = now;
    }
    if (this.ui.commander) {
      if (p.pressed.up) c.directive = { type: this.ui.group, dir: "focus" };
      if (p.pressed.down) c.directive = { type: this.ui.group, dir: "hold" };
    }
    const mr = !!p.mouseRight;
    const mrPressed = mr && !this.mouseRightWas;
    this.mouseRightWas = mr;
    const xHeld = !!p.held.x && !p.held.block && !atPad && !!this.morphable;
    if (!xHeld) {
      this.xHeldFor = -1;
      this.ui.morph = 0;
    } else if (this.xHeldFor >= 0) {
      this.xHeldFor += dt;
      this.ui.morph = Math.min(1, this.xHeldFor / this.morphHold);
      this.ui.morphBack = this.morphable === "back";
      if (this.xHeldFor >= this.morphHold) {
        c.morph = true;
        this.xHeldFor = -1e9;
        this.ui.morph = 0;
      }
    } else if (p.pressed.x) this.xHeldFor = 0;
    if (p.pressed.x && !blockDodge && atPad) {
      this.xDown = true;
      this.xUsed = false;
      this.tDown = false;
      this.ui.buildMenu = "prod";
    }
    this.ui.learnReady = canLearn;
    if ((atPad || atHome) && !this.xDown && (p.pressed.y || mrPressed)) {
      this.tDown = true;
      this.tUsed = false;
      this.ui.buildMenu = atPad ? "tower" : "shop";
    } else if (!this.xDown && (p.pressed.y || mrPressed)) c.recall = true;
    const f = this.flick(p);
    if (f) {
      if (this.xDown) {
        if (f !== "down") c.build = PROD_BY_FLICK[f];
        this.xUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.tDown && this.ui.buildMenu === "learn") {
        if (f === "left" || f === "right") c.learn = f === "left" ? 0 : 1;
        this.tUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.tDown && this.ui.buildMenu === "shop") {
        if (f !== "down") c.buy = SHOP_BY_FLICK[f];
        this.tUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.tDown) {
        if (f !== "down") c.build = TOWER_BY_FLICK[f];
        this.tUsed = true;
        this.ui.buildMenu = "closed";
      } else if (canLearn && (f === "left" || f === "right")) {
        c.learn = f === "left" ? 0 : 1;
      } else {
        c.directive = { type: this.ui.group, dir: DIRECTIVE_BY_FLICK[f] };
        this.ui.lastOrderAt = now;
      }
    }

    if (this.xDown && !p.held.x) {
      if (!this.xUsed) c.build = "default";
      this.xDown = false;
      this.ui.buildMenu = "closed";
    }
    if (this.tDown && !p.held.y && !mr) {
      if (!this.tUsed && atPad) c.build = "upgrade";
      this.tDown = false;
      if (this.ui.buildMenu === "tower" || this.ui.buildMenu === "shop" || this.ui.buildMenu === "learn") this.ui.buildMenu = "closed";
    }
  }

  take(): Command {
    const out = this.pending;
    this.pending = { moveX: out.moveX, moveZ: out.moveZ, block: out.block, charging: out.charging };
    return out;
  }
}
