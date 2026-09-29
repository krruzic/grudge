import type { PadState } from "./gamepads";
import type { Command, Directive, StructureType, UnitType } from "../sim/types";
import { UNIT_TYPES } from "../sim/types";

type Flick = "up" | "down" | "left" | "right";

const DIRECTIVE_BY_FLICK: Record<Flick, Directive> = { up: "push", down: "hold", left: "follow", right: "nearest" };
const TOWER_BY_FLICK: Partial<Record<Flick, StructureType>> = { up: "damage", left: "control", right: "support" };
const PROD_BY_FLICK: Partial<Record<Flick, StructureType>> = { left: "barracks", up: "range", right: "foundry" };

export interface MapperUi {
  buildMenu: "closed" | "prod" | "tower";
  typeSelect: UnitType | null;
  commander: boolean;
  group: UnitType | "all";
}

const GROUPS: (UnitType | "all")[] = ["all", "grunt", "ranged", "heavy"];

export class CommandMapper {
  private pending: Command = { moveX: 0, moveZ: 0 };
  private armed = true;
  private xDown = false;
  private xUsed = false;
  private yDown = false;
  private tDown = false;
  private tUsed = false;
  private mouseRightWas = false;
  private yIndex = 0;
  private yNext = 0;
  readonly ui: MapperUi;
  private groupIndex = 0;

  constructor(private flickThreshold: number, commander = false, private cycleSeconds = 0.55) {
    this.ui = { buildMenu: "closed", typeSelect: null, commander, group: "all" };
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
    if (p.pressed.x) {
      this.xDown = true;
      this.xUsed = false;
      this.tDown = false;
      this.ui.buildMenu = "prod";
    }
    if (atPad && !this.xDown && (p.pressed.y || mrPressed)) {
      this.tDown = true;
      this.tUsed = false;
      this.ui.buildMenu = "tower";
    } else if (p.pressed.y && !this.tDown) {
      this.yDown = true;
      this.yIndex = 0;
      this.yNext = now + this.cycleSeconds;
    }
    if (this.yDown && p.held.y && now >= this.yNext) {
      this.yIndex = (this.yIndex + 1) % UNIT_TYPES.length;
      this.yNext = now + this.cycleSeconds;
    }
    this.ui.typeSelect = this.yDown ? UNIT_TYPES[this.yIndex] : null;

    const f = this.flick(p);
    if (f) {
      if (this.xDown) {
        if (f !== "down") c.build = PROD_BY_FLICK[f];
        this.xUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.tDown) {
        if (f !== "down") c.build = TOWER_BY_FLICK[f];
        this.tUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.yDown) {
        c.directive = { type: UNIT_TYPES[this.yIndex], dir: DIRECTIVE_BY_FLICK[f] };
      } else {
        c.directive = { type: this.ui.commander ? this.ui.group : "all", dir: DIRECTIVE_BY_FLICK[f] };
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
      if (this.ui.buildMenu === "tower") this.ui.buildMenu = "closed";
    }
    if (this.yDown && !p.held.y) this.yDown = false;
  }

  take(): Command {
    const out = this.pending;
    this.pending = { moveX: out.moveX, moveZ: out.moveZ, block: out.block };
    return out;
  }
}
