import type { PadState } from "./gamepads";
import type { Command, Directive, ShopItem, StructureType, UnitType } from "../sim/types";

type Flick = "up" | "down" | "left" | "right";

const DIRECTIVE_BY_FLICK: Record<Flick, Directive> = { up: "push", down: "hold", left: "follow", right: "defend" };
const TOWER_BY_FLICK: Partial<Record<Flick, StructureType>> = { up: "damage", left: "control" };
const PROD_BY_FLICK: Partial<Record<Flick, StructureType>> = { left: "barracks", up: "range", right: "foundry" };
const SHOP_BY_FLICK: Partial<Record<Flick, ShopItem>> = { up: "bomb", left: "ward", right: "cannon" };
const CALL_BY_FLICK: Partial<Record<Flick, UnitType>> = { left: "grunt", up: "ranged", right: "heavy" };

export interface MapperUi {
  buildMenu: "closed" | "prod" | "tower" | "call" | "shop" | "learn";
  commander: boolean;
  group: UnitType | "all";
  groupAt: number;
  lastOrderAt: number;
  learnReady: boolean;
  charge: { slot: "a" | "b"; k: number } | null;
  reticle: { slot: "r" | "z"; dx: number; dz: number; range: number } | null;
}

export interface AimInfo {
  facing: number;
  r?: number;
  z?: number;
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
    this.ui = { buildMenu: "closed", commander, group: "all", groupAt: -99, lastOrderAt: -99, learnReady: false, charge: null, reticle: null };
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

  private holdAt: Record<"a" | "b" | "r" | "z", number> = { a: -1, b: -1, r: -1, z: -1 };
  private lastNow = 0;

  update(p: PadState, now: number, atPad = false, atHome = false, canLearn = false, aim: AimInfo | null = null): void {
    const c = this.pending;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    c.moveX = p.stickX;
    c.moveZ = p.stickY;
    c.block = p.held.block;
    c.charging = undefined;
    this.ui.charge = null;
    for (const k of ["a", "b"] as const) {
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
    for (const k of ["r", "z"] as const) {
      const btn = k === "r" ? "r" : "z";
      if (k === "z" && p.held.start) continue;
      const range = aim?.[k];
      if (p.pressed[btn]) {
        if (!range) {
          if (k === "r") c.special = true;
          else c.super = true;
          continue;
        }
        this.holdAt[k] = now;
        this.place = { dx: Math.sin(aim!.facing) * Math.min(range, 4), dz: Math.cos(aim!.facing) * Math.min(range, 4) };
      }
      if (this.holdAt[k] < 0) continue;
      const held = now - this.holdAt[k];
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
      this.holdAt[k] = -1;
      if (k === "r") c.special = true;
      else c.super = true;
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
    if (p.pressed.x && !blockDodge) {
      this.xDown = true;
      this.xUsed = false;
      this.tDown = false;
      this.ui.buildMenu = atPad ? "prod" : "call";
    }
    this.ui.learnReady = canLearn;
    if ((atPad || atHome) && !this.xDown && (p.pressed.y || mrPressed)) {
      this.tDown = true;
      this.tUsed = false;
      this.ui.buildMenu = atPad ? "tower" : "shop";
    }
    const f = this.flick(p);
    if (f) {
      if (this.xDown && this.ui.buildMenu === "call") {
        if (f !== "down") c.call = CALL_BY_FLICK[f];
        this.xUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.xDown) {
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
      if (!this.xUsed && this.ui.buildMenu === "call") c.call = "grunt";
      else if (!this.xUsed) c.build = "default";
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
