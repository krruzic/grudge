// CommandMapper: turns one local pad's state into the sim's per-tick Command for that player, and exposes the
// UI state the HUD draws for it (MapperUi: open build menu, order group, charge, aim reticle, morph meter).
//
// Buttons are edge-triggered into a pending Command that take() hands to the sim once per tick (then clears
// the one-shot flags). Tap vs hold: A/B shorter than TAP are taps, holding charges (CHARGE_FULL = full);
// specials can be held to aim a placement reticle. The C-stick (or arrows) flicks give army orders, or pick
// entries in an open build / shop / learn cross. Smash-dodge: a fast stick flick (smash.from -> smash.to
// within smash.within s) dodges. Commanders (2v2 Herald) use the same mapper; their block button cycles the
// army formation instead.
import type { PadState } from "./gamepads";
import type { Command, Directive, ShopItem, StructureType, UnitType } from "../sim/types";

type Flick = "up" | "down" | "left" | "right";

const DIRECTIVE_BY_FLICK: Record<Flick, Directive> = { up: "push", down: "defend", left: "screen", right: "split" };
const TOWER_BY_FLICK: Partial<Record<Flick, StructureType>> = { up: "damage", left: "control" };
const PROD_BY_FLICK: Partial<Record<Flick, StructureType>> = { left: "barracks", up: "range", right: "foundry" };
const SPEC_BY_FLICK: Partial<Record<Flick, number>> = { up: 0, left: 1, right: 2 };
const SHOP_BY_FLICK: Partial<Record<Flick, ShopItem>> = { up: "bomb", left: "ward", right: "cannon" };

export interface MapperUi {
  buildMenu: "closed" | "prod" | "tower" | "shop" | "learn" | "spec";
  commander: boolean;
  group: UnitType | "all";
  groupAt: number;
  lastOrderAt: number;
  learnReady: boolean;
  charge: { slot: "a" | "b"; k: number } | null;
  morph: number;
  morphBack: boolean;
  reticle: {
    slot: "b" | "r" | "z";
    dx: number;
    dz: number;
    range: number;
    at?: { x: number; z: number };
    spots?: number;
  } | null;
  /** Mother Kelp holding dodge: the pivot picked and the swing direction (the renderer previews the swing). */
  swing: { at: { x: number; z: number }; dirX: number; dirZ: number } | null;
}

export interface AimInfo {
  facing: number;
  hx?: number;
  hz?: number;
  b?: number;
  r?: number;
  z?: number;
  spots?: { x: number; z: number }[];
  /** Mother Kelp: chain-swing pivots in reach (a held dodge picks one with the stick). */
  swing?: { x: number; z: number }[];
  ready?: { b: boolean; r: boolean; z: boolean };
}

const TAP = 0.2;
const CHARGE_FULL = 0.8;

const GROUPS: (UnitType | "all")[] = ["all", "grunt", "ranged", "heavy"];

export class CommandMapper {
  private place = { dx: 0, dz: 0 };
  private spotSel: { x: number; z: number } | null = null;
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

  constructor(
    private flickThreshold: number,
    commander = false,
  ) {
    this.ui = {
      buildMenu: "closed",
      commander,
      group: "all",
      groupAt: -99,
      lastOrderAt: -99,
      learnReady: false,
      charge: null,
      reticle: null,
      swing: null,
      morph: 0,
      morphBack: false,
    };
  }

  /** Deathmatch: no army, so the d-pad turns the camera (app) and C-stick flicks become callouts to CPUs. */
  dm = false;
  /** This player's camera yaw (radians), so callouts point where the flick points on screen. */
  yaw = 0;

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
  specReady = false;
  morphHold = 0.6;
  private xHeldFor = -1;
  private swingHeld = -1;
  private swingDir: { x: number; z: number } | null = null;

  update(p: PadState, now: number, atPad = false, atHome = false, canLearn = false, aim: AimInfo | null = null): void {
    const c = this.pending;
    const dt = Math.min(0.1, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    c.moveX = p.stickX;
    c.moveZ = p.stickY;
    c.block = this.ui.commander ? false : p.held.block;
    if (this.ui.commander && p.pressed.block) c.formation = true;
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
      const spots = k === "r" ? aim?.spots : undefined;
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
        if (spots) this.spotSel = spots[0] ?? null;
      }
      if (this.holdAt[slot] < 0) continue;
      const held = now - this.holdAt[slot];
      if (p.pressed.block && range) {
        this.holdAt[slot] = -1;
        continue;
      }
      if (p.held[btn]) {
        if (held > TAP && range && spots) {
          const hx = aim!.hx ?? 0;
          const hz = aim!.hz ?? 0;
          const mag = Math.hypot(p.stickX, p.stickY);
          if (mag > 0.45 && spots.length) {
            const sa = Math.atan2(p.stickX, p.stickY);
            let bd = Infinity;
            for (const q of spots) {
              let d = Math.abs(Math.atan2(q.x - hx, q.z - hz) - sa);
              if (d > Math.PI) d = Math.PI * 2 - d;
              if (d < bd) {
                bd = d;
                this.spotSel = q;
              }
            }
          }
          const sel = this.spotSel;
          const s =
            sel && spots.length
              ? spots.reduce((b, q) =>
                  Math.hypot(q.x - sel.x, q.z - sel.z) < Math.hypot(b.x - sel.x, b.z - sel.z) ? q : b,
                )
              : (spots[0] ?? null);
          this.spotSel = s;
          c.moveX = c.moveZ = 0;
          this.place = s ? { dx: s.x - hx, dz: s.z - hz } : { dx: 0, dz: 0 };
          this.ui.reticle = {
            slot: k,
            dx: this.place.dx,
            dz: this.place.dz,
            range: 0,
            at: s ? { x: s.x, z: s.z } : undefined,
            spots: spots.length,
          };
        } else if (held > TAP && range) {
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
    const blockDodge = p.pressed.x && p.held.block && p.profile !== "keyboard";
    // Mother Kelp next to something hookable: a TAP of dodge is a plain roll (on release). HOLDING it swings round
    // the pivot that lies most the way the stick points (or she faces), and keeps hopping - pivot to pivot, toward
    // the stick, up to 5 swings - for as long as it's held (the sim continues the chain on each landing).
    const swingAt = aim?.swing;
    this.ui.swing = null;
    if ((p.pressed.dodge || blockDodge) && swingAt?.length) this.swingHeld = now;
    else if (p.pressed.dodge || blockDodge) c.dodge = true;
    if (this.swingHeld >= 0) {
      const down = p.held.dodge || (p.held.x && p.held.block);
      const held = now - this.swingHeld;
      if (down) {
        const mag = Math.hypot(p.stickX, p.stickY);
        if (mag > 0.45) this.swingDir = { x: p.stickX / mag, z: p.stickY / mag };
        if (held > TAP && swingAt?.length) {
          const hx = aim!.hx ?? 0;
          const hz = aim!.hz ?? 0;
          const sa = this.swingDir ? Math.atan2(this.swingDir.x, this.swingDir.z) : aim!.facing;
          let bd = Infinity;
          let sel: { x: number; z: number } | null = null;
          for (const q of swingAt) {
            let d = Math.abs(Math.atan2(q.x - hx, q.z - hz) - sa);
            if (d > Math.PI) d = Math.PI * 2 - d;
            if (d < bd) {
              bd = d;
              sel = q;
            }
          }
          if (sel) {
            c.dodge = true;
            c.swing = { ...sel };
            const dx = this.swingDir?.x ?? Math.sin(aim!.facing);
            const dz = this.swingDir?.z ?? Math.cos(aim!.facing);
            c.moveX = dx;
            c.moveZ = dz;
            this.ui.swing = { at: sel, dirX: dx, dirZ: dz };
          }
        }
      } else {
        if (held <= TAP) c.dodge = true;
        this.swingHeld = -1;
        this.swingDir = null;
      }
    }
    const sm = Math.hypot(p.stickX, p.stickY);
    if (sm < this.smash.from) {
      this.restAt = now;
      this.smashArmed = true;
    } else if (sm >= this.smash.to && this.smashArmed && p.profile !== "keyboard") {
      this.smashArmed = false;
      if (p.held.block && now - this.restAt <= this.smash.within) c.dodge = true;
    }

    if (!this.dm && (p.pressed.right || p.pressed.left)) {
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
      this.ui.buildMenu = this.specReady ? "spec" : "prod";
    }
    this.ui.learnReady = canLearn;
    if ((atPad || atHome) && !this.xDown && (p.pressed.y || mrPressed)) {
      this.tDown = true;
      this.tUsed = false;
      this.ui.buildMenu = atPad ? (this.specReady ? "spec" : "tower") : "shop";
    } else if (!this.xDown && (p.pressed.y || mrPressed)) c.recall = true;
    const f = this.flick(p);
    if (f) {
      if (this.xDown) {
        if (f !== "down") {
          if (this.ui.buildMenu === "spec") c.spec = SPEC_BY_FLICK[f];
          else c.build = PROD_BY_FLICK[f];
        }
        this.xUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.tDown && this.ui.buildMenu === "learn") {
        if (f === "left" || f === "right") c.learn = f === "left" ? 0 : 1;
        this.tUsed = true;
        this.ui.buildMenu = "closed";
      } else if (this.tDown && this.ui.buildMenu === "spec") {
        if (f !== "down") c.spec = SPEC_BY_FLICK[f];
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
      } else if (this.dm) {
        // Screen direction of the flick -> world direction under this player's camera yaw.
        const sx = f === "left" ? -1 : f === "right" ? 1 : 0;
        const sz = f === "up" ? -1 : f === "down" ? 1 : 0;
        const cs = Math.cos(this.yaw);
        const sn = Math.sin(this.yaw);
        c.callout = { x: Math.round((cs * sx + sn * sz) * 100) / 100, z: Math.round((-sn * sx + cs * sz) * 100) / 100 };
        this.ui.lastOrderAt = now;
      } else {
        c.directive = { type: this.ui.group, dir: DIRECTIVE_BY_FLICK[f] };
        this.ui.lastOrderAt = now;
      }
    }

    if (this.xDown && !p.held.x) {
      if (!this.xUsed && this.ui.buildMenu !== "spec") c.build = "default";
      this.xDown = false;
      this.ui.buildMenu = "closed";
    }
    if (this.tDown && !p.held.y && !mr) {
      if (!this.tUsed && atPad && this.ui.buildMenu !== "spec") c.build = "upgrade";
      this.tDown = false;
      if (
        this.ui.buildMenu === "tower" ||
        this.ui.buildMenu === "shop" ||
        this.ui.buildMenu === "learn" ||
        this.ui.buildMenu === "spec"
      )
        this.ui.buildMenu = "closed";
    }
  }

  take(): Command {
    const out = this.pending;
    this.pending = { moveX: out.moveX, moveZ: out.moveZ, block: out.block, charging: out.charging };
    return out;
  }
}
