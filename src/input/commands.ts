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
}

const GROUPS: (UnitType | "all")[] = ["all", "grunt", "ranged", "heavy"];

export class CommandMapper {
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
    this.ui = { buildMenu: "closed", commander, group: "all", groupAt: -99, lastOrderAt: -99 };
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

  update(p: PadState, now: number, atPad = false, atHome = false, canLearn = false): void {
    const c = this.pending;
    c.moveX = p.stickX;
    c.moveZ = p.stickY;
    c.block = p.held.block;
    if (p.pressed.a) c.attack = true;
    if (p.pressed.b) c.secondary = true;
    if (p.pressed.r) c.special = true;
    if (p.pressed.z && !p.held.start) c.super = true;
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
    if ((atPad || atHome || canLearn) && !this.xDown && (p.pressed.y || mrPressed)) {
      this.tDown = true;
      this.tUsed = false;
      this.ui.buildMenu = atPad ? "tower" : canLearn ? "learn" : "shop";
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
    this.pending = { moveX: out.moveX, moveZ: out.moveZ, block: out.block };
    return out;
  }
}
