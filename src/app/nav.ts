// Menu navigation from pads: turns stick / d-pad state into discrete menu steps with key-repeat, and names the
// connected devices for the PLAYERS page.
import type { PadState } from "../input/gamepads";
import type { Nav } from "../ui/menus";
import { MAX_LOCAL } from "./assets";

/** First repeat after holding a direction, then the repeat interval (seconds). */
const REPEAT_DELAY = 0.38;
const REPEAT_EVERY = 0.1;

const repeat = Array.from({ length: MAX_LOCAL }, () => ({ dir: "", t: 0 }));

/** Dominant 4-way direction of stick + d-pad ("" inside the dead zone). */
function navDir(p: PadState): string {
  const sx = p.stickX + (p.held.right ? 1 : 0) - (p.held.left ? 1 : 0);
  const sy = p.stickY + (p.held.down ? 1 : 0) - (p.held.up ? 1 : 0);
  if (Math.max(Math.abs(sx), Math.abs(sy)) < 0.5) return "";
  if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? "r" : "l";
  return sy > 0 ? "d" : "u";
}

/**
 * Merged menu input of every connected pad (or only pad `only`, e.g. the pauser). A direction fires once when
 * pressed, then repeats while held; A or Start confirm.
 */
export function readNav(pads: PadState[], now: number, only = -1): Nav {
  const n: Nav = { dx: 0, dy: 0, a: false, b: false, y: false };
  pads.forEach((p, i) => {
    if (!p.connected || (only >= 0 && i !== only)) return;
    const dir = navDir(p);
    const r = repeat[i];
    let fire = false;
    if (dir !== r.dir) {
      r.dir = dir;
      r.t = now + REPEAT_DELAY;
      fire = !!dir;
    } else if (dir && now >= r.t) {
      r.t = now + REPEAT_EVERY;
      fire = true;
    }
    if (fire) {
      if (dir === "l") n.dx = -1;
      if (dir === "r") n.dx = 1;
      if (dir === "u") n.dy = -1;
      if (dir === "d") n.dy = 1;
    }
    n.a ||= p.pressed.a || p.pressed.start;
    n.b ||= p.pressed.b;
    n.y ||= p.pressed.y;
  });
  return n;
}

/** Display name of the device in a seat, or null when the seat is empty. */
export function deviceName(p: PadState): string | null {
  if (!p.connected) return null;
  if (p.profile === "keyboard") return "KEYBOARD + MOUSE";
  if (p.profile === "gc-adapter" || p.profile.startsWith("gc_")) return "GAMECUBE CONTROLLER";
  if (p.profile === "procon2") return "SWITCH 2 PRO CONTROLLER";
  const id = p.padId
    .replace(/\(.*?\)/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .toUpperCase();
  return id ? id.slice(0, 30) : "CONTROLLER";
}
