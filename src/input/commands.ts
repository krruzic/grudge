import type { PadState } from "./gamepads";
import type { Command, Directive, StructureType, UnitType } from "../sim/types";

type Flick = "up" | "down" | "left" | "right";

const DIRECTIVE_BY_FLICK: Record<Flick, Directive> = { up: "push", down: "hold", left: "follow", right: "nearest" };
const TOWER_BY_FLICK: Partial<Record<Flick, StructureType>> = { up: "damage", left: "control", right: "support" };
const PROD_BY_FLICK: Partial<Record<Flick, StructureType>> = { left: "barracks", up: "range", right: "foundry" };
const CALL_BY_FLICK: Partial<Record<Flick, UnitType>> = { left: "grunt", up: "ranged", right: "heavy" };

export interface MapperUi {
  buildMenu: "closed" | "prod" | "tower" | "call";
  typeSelect: UnitType | null;
  commander: boolean;
  group: UnitType | "all";
  orderStage: "none" | "pick" | "order";
  orderGroup: UnitType | "all";
  lastOrderAt: number;
}

const GROUP_BY_FLICK: Record<Flick, UnitType | "all"> = { up: "ranged", left: "grunt", right: "heavy", down: "all" };

const GROUPS: (UnitType | "all")[] = ["all", "grunt", "ranged", "heavy"];

export class CommandMapper {
  private pending: Command = { moveX: 0, moveZ: 0 };
  private armed = true;
  private xDown = false;
  private xUsed = false;
  private yDown = false;
  private lAt = 0;
  private tDown = false;
  private tUsed = false;
  private mouseRightWas = false;
  readonly ui: MapperUi;
  private groupIndex = 0;
  private restAt = -99;
  private smashArmed = true;
  smash = { from: 0.3, to: 0.85, within: 0.12 };

  constructor(private flickThreshold: number, commander = false) {
    this.ui = { buildMenu: "closed", typeSelect: null, commander, group: "all", orderStage: "none", orderGroup: "all", lastOrderAt: -99 };
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

  update(p: PadState, now: number, atPad = false): void {
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

    if (this.ui.commander) {
      if (p.pressed.right || p.pressed.left) {
        this.groupIndex = (this.groupIndex + (p.pressed.right ? 1 : GROUPS.length - 1)) % GROUPS.length;
        this.ui.group = GROUPS[this.groupIndex];
      }
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
    if (atPad && !this.xDown && (p.pressed.y || mrPressed)) {
      this.tDown = true;
      this.tUsed = false;
      this.ui.buildMenu = "tower";
    }
    const holdL = !!p.held.block;
    if (holdL && !this.yDown) {
      this.yDown = true;
      this.lAt = now;
    }
    if (this.yDown && holdL && this.ui.orderStage === "none" && !this.xDown && !this.tDown && now - this.lAt >= 0.3 && !p.held.a) this.ui.orderStage = "pick";

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
      } else if (this.tDown) {
        if (f !== "down") c.build = TOWER_BY_FLICK[f];
        this.tUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.yDown && this.ui.orderStage !== "order") {
        this.ui.orderGroup = GROUP_BY_FLICK[f];
        this.ui.orderStage = "order";
      } else if (this.yDown) {
        c.directive = { type: this.ui.orderGroup, dir: DIRECTIVE_BY_FLICK[f] };
        this.ui.lastOrderAt = now;
      } else {
        c.directive = { type: this.ui.commander ? this.ui.group : "all", dir: DIRECTIVE_BY_FLICK[f] };
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
      if (this.ui.buildMenu === "tower") this.ui.buildMenu = "closed";
    }
    if (this.yDown && !holdL) {
      this.yDown = false;
      this.ui.orderStage = "none";
      this.ui.orderGroup = "all";
    }
    this.ui.typeSelect = this.yDown && this.ui.orderStage === "order" && this.ui.orderGroup !== "all" ? this.ui.orderGroup : null;
  }

  take(): Command {
    const out = this.pending;
    this.pending = { moveX: out.moveX, moveZ: out.moveZ, block: out.block };
    return out;
  }
}
