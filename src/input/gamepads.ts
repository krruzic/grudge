// Gamepads: maps every input device onto the 4 local seats and polls them into PadState each frame.
//
// Devices: standard browser gamepads (matched to a profile in data/input.json by id), the keyboard + mouse as
// one virtual pad (KEYBOARD), GameCube adapter ports read over WebHID (GC_BASE - port; skipped when the OS
// driver already exposes them as gamepads) and Switch 2 Pro controllers over WebHID (PRO_BASE - index).
// slots[seat] holds the device index sitting in that seat (null = empty).
//
// Joining: a device takes the first free seat when one of its buttons is pressed (keyboard: any mapped key, or
// using the mouse while no real pad is connected). A released device must let go of every button before it
// can rejoin (waitRelease), so the press that freed it doesn't immediately take a seat again.
import { GcAdapter } from "./gcadapter";
import { NSO_GC_PRODUCT, PRO2_PRODUCT, PRO2_VENDOR, ProCon2 } from "./procon2";
import { ProCon2Waker } from "./procon2wake";
export type ButtonAction =
  "a" | "b" | "x" | "y" | "z" | "r" | "block" | "dodge" | "start" | "up" | "down" | "left" | "right";

interface AxisRef {
  axis: number;
  invert?: boolean;
}

interface AxisButton {
  axis: number;
  min: number;
  max: number;
  threshold: number;
}

interface Profile {
  id: string;
  match: string[];
  stick: { x: AxisRef; y: AxisRef };
  cstick: { x: AxisRef; y: AxisRef };
  buttons: Partial<Record<ButtonAction, number[]>>;
  axisButtons: Partial<Record<ButtonAction, AxisButton>>;
  /** Analog buttons (triggers): held only once the button's value reaches this, instead of the browser's press. */
  thresholds?: Partial<Record<ButtonAction, number>>;
}

type Dir4 = Record<"up" | "down" | "left" | "right", string[]>;

export interface InputConfig {
  stickDeadzone: number;
  cstickFlickThreshold: number;
  profiles: Profile[];
  keyboard?: { stick: Dir4; cstick: Dir4; buttons: Partial<Record<ButtonAction, string[]>>; mouseFlickPx?: number };
}

const KEYBOARD = -1;
const GC_BASE = -10;
const PRO_BASE = -20;
const isGc = (idx: number | null) => idx !== null && idx <= GC_BASE && idx > PRO_BASE;
const isPro = (idx: number | null) => idx !== null && idx <= PRO_BASE;

export interface PadState {
  connected: boolean;
  profile: string;
  padId: string;
  stickX: number;
  stickY: number;
  cX: number;
  cY: number;
  held: Record<ButtonAction, boolean>;
  pressed: Record<ButtonAction, boolean>;
  mouseRight?: boolean;
}

const ACTIONS: ButtonAction[] = [
  "a",
  "b",
  "x",
  "y",
  "z",
  "r",
  "block",
  "dodge",
  "start",
  "up",
  "down",
  "left",
  "right",
];

function emptyButtons(): Record<ButtonAction, boolean> {
  return Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<ButtonAction, boolean>;
}

function emptyState(): PadState {
  return {
    connected: false,
    profile: "",
    padId: "",
    stickX: 0,
    stickY: 0,
    cX: 0,
    cY: 0,
    held: emptyButtons(),
    pressed: emptyButtons(),
  };
}

function radialDeadzone(x: number, y: number, dz: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m < dz) return [0, 0];
  const scaled = Math.min(1, (m - dz) / (1 - dz));
  return [(x / m) * scaled, (y / m) * scaled];
}

export class Gamepads {
  readonly players: PadState[];
  readonly gc = new GcAdapter();
  readonly pro = new ProCon2();
  readonly proWake = new ProCon2Waker(() => {});
  private slots: (number | null)[];

  private keys = new Set<string>();
  private tapped = new Set<string>();
  private keyTouched = false;
  private mouse = { left: false, right: false, x: 0, y: 0, ox: 0, oy: 0 };

  constructor(
    private config: InputConfig,
    playerCount: number,
  ) {
    this.players = Array.from({ length: playerCount }, emptyState);
    this.slots = Array.from({ length: playerCount }, () => null);
    const kb = config.keyboard;
    if (!kb) return;
    const mapped = new Set<string>([
      ...Object.values(kb.stick).flat(),
      ...Object.values(kb.cstick).flat(),
      ...(Object.values(kb.buttons).flat() as string[]),
    ]);
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyG") void this.requestHid();
      if (e.code === "KeyP" && !this.typing) void this.proWake.request();
      if (!mapped.has(e.code)) return;
      e.preventDefault();
      this.keys.add(e.code);
      this.tapped.add(e.code);
      this.keyTouched = true;
      this.kbByMouse = false;
      this.kbHold = false;
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    window.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener("mousedown", (e) => {
      this.mouse.x = this.mouse.ox = e.clientX;
      this.mouse.y = this.mouse.oy = e.clientY;
      if (e.button === 0) {
        this.mouse.left = true;
        this.tapped.add("Mouse0");
      }
      if (e.button === 2) {
        this.mouse.right = true;
        this.tapped.add("Mouse2");
      }
      if (this.mouseClaims || this.slots.includes(KEYBOARD)) {
        if (!this.slots.includes(KEYBOARD)) this.kbByMouse = true;
        this.keyTouched = true;
        this.kbHold = false;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
  }

  async requestHid(): Promise<void> {
    const hid = (
      navigator as unknown as {
        hid?: { requestDevice(o: unknown): Promise<{ vendorId: number; productId: number }[]> };
      }
    ).hid;
    if (!hid) return;
    try {
      const ds = await hid.requestDevice({
        filters: [
          { vendorId: 0x057e, productId: 0x0337 },
          { vendorId: PRO2_VENDOR, productId: PRO2_PRODUCT },
          { vendorId: PRO2_VENDOR, productId: NSO_GC_PRODUCT },
        ],
      });
      for (const d of ds) {
        if (ProCon2.matches(d as never)) await this.pro.open(d as never);
        else if (!this.gc.connected) await this.gc.adopt(d as never);
      }
    } catch (err) {
      console.warn("hid request failed", err);
    }
  }

  /** Seat the keyboard + mouse sit in, or -1. */
  keyboardSlot(): number {
    return this.slots.indexOf(KEYBOARD);
  }

  /** Mouse use with no other pad connected: seat the keyboard + mouse (released again once a real pad joins). */
  claimKeyboard(): void {
    if (!this.kbHold && this.kbmEnabled && !this.slots.includes(KEYBOARD)) this.kbByMouse = true;
    if (!this.kbHold && this.kbmEnabled) this.keyTouched = true;
  }

  private kbmOn = true;
  get kbmEnabled(): boolean {
    return this.kbmOn;
  }
  set kbmEnabled(on: boolean) {
    this.kbmOn = on;
    if (on) return;
    const s = this.keyboardSlot();
    if (s >= 0) this.release(s);
    this.keyTouched = false;
  }

  private kbHold = false;
  mouseClaims = true;
  private kbByMouse = false;
  private waitRelease = new Set<number>();

  /** Moves the device in seat `from` to the empty seat `to` ("SIT HERE"). */
  move(from: number, to: number): boolean {
    if (from === to || this.slots[from] === null || this.slots[to] !== null) return false;
    this.slots[to] = this.slots[from];
    this.slots[from] = null;
    this.players[to] = this.players[from];
    this.players[from] = emptyState();
    return true;
  }

  /** Frees a seat; the device must release all buttons (keyboard: be touched again) before it can rejoin. */
  release(slot: number): void {
    const idx = this.slots[slot];
    if (idx === null || idx === undefined) return;
    if (idx === KEYBOARD) {
      this.kbHold = true;
      this.keyTouched = false;
      this.keys.clear();
      this.tapped.clear();
      this.mouse.left = this.mouse.right = false;
    } else this.waitRelease.add(idx);
    this.slots[slot] = null;
    this.players[slot] = emptyState();
  }

  /** A name entry has the keyboard: only mouse bindings stay live. */
  typing = false;

  private keyDown(codes: string[] | undefined): boolean {
    return !!codes?.some((c) => (!this.typing || c.startsWith("Mouse")) && (this.keys.has(c) || this.tapped.has(c)));
  }

  private pollKeyboard(st: PadState): void {
    const kb = this.config.keyboard!;
    const axis = (d: Dir4): [number, number] => {
      let x = (this.keyDown(d.right) ? 1 : 0) - (this.keyDown(d.left) ? 1 : 0);
      let y = (this.keyDown(d.down) ? 1 : 0) - (this.keyDown(d.up) ? 1 : 0);
      const m = Math.hypot(x, y);
      if (m > 1) {
        x /= m;
        y /= m;
      }
      return [x, y];
    };
    [st.stickX, st.stickY] = axis(kb.stick);
    [st.cX, st.cY] = axis(kb.cstick);
    const m = this.mouse;
    if (m.left || m.right) {
      const dx = m.x - m.ox;
      const dy = m.y - m.oy;
      const d = Math.hypot(dx, dy);
      if (d >= (kb.mouseFlickPx ?? 26)) {
        st.cX = dx / d;
        st.cY = dy / d;
        m.ox = m.x;
        m.oy = m.y;
      }
    }
    const prevHeld = st.held;
    const held = emptyButtons();
    for (const a of ACTIONS) held[a] = this.keyDown(kb.buttons[a]);
    held.x ||= m.left || this.tapped.has("Mouse0");
    st.mouseRight = m.right || this.tapped.has("Mouse2");
    this.tapped.clear();
    const pressed = emptyButtons();
    for (const a of ACTIONS) pressed[a] = held[a] && !prevHeld[a];
    st.held = held;
    st.pressed = pressed;
    st.connected = true;
    st.profile = "keyboard";
    st.padId = "Keyboard";
  }

  private pollPro(st: PadState, i: number): void {
    const g = this.pro.pads[i];
    if (g.gc) return this.pollNsoGc(st, i);
    [st.stickX, st.stickY] = radialDeadzone(g.stickX, g.stickY, this.config.stickDeadzone);
    [st.cX, st.cY] = radialDeadzone(g.cX, g.cY, this.config.stickDeadzone);
    const prevHeld = st.held;
    const held = emptyButtons();
    held.a = g.a;
    held.b = g.b;
    held.x = g.x;
    held.y = g.y;
    held.z = g.zr;
    held.r = g.r;
    held.block = g.l;
    held.dodge = g.zl || g.ls;
    held.start = g.plus;
    held.up = g.up;
    held.down = g.down;
    held.left = g.left;
    held.right = g.right;
    const pressed = emptyButtons();
    for (const a of ACTIONS) pressed[a] = held[a] && !prevHeld[a];
    st.held = held;
    st.pressed = pressed;
    st.connected = true;
    st.profile = "procon2";
    st.padId = `Switch 2 Pro ${i + 1}`;
  }

  /** NSO GameCube controller: played like a GameCube pad on the adapter (pollGc), plus ZL as a dodge. */
  private pollNsoGc(st: PadState, i: number): void {
    const g = this.pro.pads[i];
    [st.stickX, st.stickY] = radialDeadzone(g.stickX, g.stickY, this.config.stickDeadzone);
    [st.cX, st.cY] = radialDeadzone(g.cX, g.cY, this.config.stickDeadzone);
    const prevHeld = st.held;
    const held = emptyButtons();
    held.a = g.a;
    held.b = g.b;
    held.x = g.x;
    held.y = g.y;
    held.z = g.r;
    held.r = g.zr;
    held.dodge = g.l;
    held.block = g.lAnalog > 0.3 || g.zl;
    held.start = g.plus;
    held.up = g.up;
    held.down = g.down;
    held.left = g.left;
    held.right = g.right;
    const pressed = emptyButtons();
    for (const a of ACTIONS) pressed[a] = held[a] && !prevHeld[a];
    st.held = held;
    st.pressed = pressed;
    st.connected = true;
    st.profile = "gc-adapter";
    st.padId = `NSO GameCube ${i + 1}`;
  }

  private pollGc(st: PadState, port: number): void {
    const g = this.gc.ports[port];
    [st.stickX, st.stickY] = radialDeadzone(g.stickX, g.stickY, this.config.stickDeadzone);
    [st.cX, st.cY] = radialDeadzone(g.cX, g.cY, this.config.stickDeadzone);
    const prevHeld = st.held;
    const held = emptyButtons();
    held.a = g.a;
    held.b = g.b;
    held.x = g.x;
    held.y = g.y;
    held.z = g.z;
    held.r = g.r;
    held.dodge = false;
    held.block = g.lAnalog > 0.3;
    held.start = g.start;
    held.up = g.up;
    held.down = g.down;
    held.left = g.left;
    held.right = g.right;
    const pressed = emptyButtons();
    for (const a of ACTIONS) pressed[a] = held[a] && !prevHeld[a];
    st.held = held;
    st.pressed = pressed;
    st.connected = true;
    st.profile = "gc-adapter";
    st.padId = `WUP-028 port ${port + 1}`;
  }

  private profileFor(pad: Gamepad): Profile {
    const id = pad.id.toLowerCase();
    const found =
      this.config.profiles.find((p) => p.match.some((m) => id.includes(m.toLowerCase()))) ??
      this.config.profiles[this.config.profiles.length - 1];
    if (found.id === "gc_adapter_uinput" && pad.mapping === "standard")
      return this.config.profiles.find((p) => p.id === "standard") ?? found;
    return found;
  }

  private held(id: number, on: boolean): boolean {
    if (!this.waitRelease.has(id)) return false;
    if (!on) this.waitRelease.delete(id);
    return true;
  }

  /** Drops disconnected devices from their seats, then seats any device pressing a button (see header). */
  private assignSlots(pads: (Gamepad | null)[]): void {
    for (let s = 0; s < this.slots.length; s++) {
      const idx = this.slots[s];
      if (idx !== null && idx >= 0 && !pads[idx]?.connected) this.slots[s] = null;
    }
    for (let s = 0; s < this.slots.length; s++) {
      const idx = this.slots[s];
      if (isGc(idx) && !this.gc.ports[GC_BASE - idx!]?.connected) this.slots[s] = null;
      if (isPro(idx) && !this.pro.pads[PRO_BASE - idx!]?.connected) this.slots[s] = null;
    }
    // With the OS driver loaded the adapter ports already appear as gamepads; don't seat them twice.
    const nativeGc = pads.some((pad) => !!pad?.connected && /gamecube (adapter port|controller)|wup-028/i.test(pad.id));
    this.gc.ports.forEach((gp, p) => {
      if (nativeGc || !gp.connected || this.slots.includes(GC_BASE - p)) return;
      const on = gp.a || gp.b || gp.x || gp.y || gp.z || gp.start;
      if (this.held(GC_BASE - p, on)) return;
      if (!on) return;
      const free = this.slots.indexOf(null);
      if (free >= 0) this.slots[free] = GC_BASE - p;
    });
    this.pro.pads.forEach((gp, i) => {
      if (!gp.connected || this.slots.includes(PRO_BASE - i)) return;
      const on = gp.a || gp.b || gp.x || gp.y || gp.plus || gp.zr || gp.r;
      if (this.held(PRO_BASE - i, on)) return;
      if (!on) return;
      const free = this.slots.indexOf(null);
      if (free >= 0) this.slots[free] = PRO_BASE - i;
    });
    if (this.keyTouched && this.kbmOn && !this.slots.includes(KEYBOARD)) {
      const free = this.slots.indexOf(null);
      if (free >= 0) this.slots[free] = KEYBOARD;
    }
    for (const pad of pads) {
      if (!pad?.connected || this.slots.includes(pad.index)) continue;
      // A raw Switch 2 Pro pad is read over WebHID (procon2.ts), not through the gamepad API.
      if (/product: 20(69|73)/i.test(pad.id) && !/virtual/i.test(pad.id)) continue;
      const anyInput = pad.buttons.some((b) => b.pressed);
      if (this.held(pad.index, anyInput)) continue;
      const free = this.slots.indexOf(null);
      if (free >= 0 && anyInput) this.slots[free] = pad.index;
    }
  }

  poll(): void {
    const pads = navigator.getGamepads();
    this.assignSlots(pads);
    const kb = this.slots.indexOf(KEYBOARD);
    // A keyboard seat claimed only by mouse use gives way as soon as a real pad joins.
    if (kb >= 0 && this.kbByMouse && this.slots.some((s) => s !== null && s !== KEYBOARD)) {
      this.kbByMouse = false;
      this.release(kb);
      this.kbHold = false;
    }
    for (let s = 0; s < this.players.length; s++) {
      const st = this.players[s];
      const idx = this.slots[s];
      if (idx === KEYBOARD) {
        this.pollKeyboard(st);
        continue;
      }
      if (isPro(idx)) {
        this.pollPro(st, PRO_BASE - idx!);
        continue;
      }
      if (isGc(idx)) {
        this.pollGc(st, GC_BASE - idx!);
        continue;
      }
      const pad = idx === null ? null : pads[idx];
      const prevHeld = st.held;
      if (!pad) {
        this.players[s] = emptyState();
        continue;
      }
      const prof = this.profileFor(pad);
      const axis = (r: AxisRef) => (pad.axes[r.axis] ?? 0) * (r.invert ? -1 : 1);
      [st.stickX, st.stickY] = radialDeadzone(axis(prof.stick.x), axis(prof.stick.y), this.config.stickDeadzone);
      [st.cX, st.cY] = radialDeadzone(axis(prof.cstick.x), axis(prof.cstick.y), this.config.stickDeadzone);
      const held = emptyButtons();
      for (const a of ACTIONS) {
        const idxs = prof.buttons[a] ?? [];
        const t = prof.thresholds?.[a];
        let on = idxs.some((i) => (t === undefined ? pad.buttons[i]?.pressed : (pad.buttons[i]?.value ?? 0) >= t));
        const ab = prof.axisButtons[a];
        if (ab) {
          const v = ((pad.axes[ab.axis] ?? ab.min) - ab.min) / (ab.max - ab.min);
          on = on || v > ab.threshold;
        }
        held[a] = on;
      }
      const pressed = emptyButtons();
      for (const a of ACTIONS) pressed[a] = held[a] && !prevHeld[a];
      st.held = held;
      st.pressed = pressed;
      st.connected = true;
      st.profile = prof.id;
      st.padId = pad.id;
    }
  }

  debugText(): string {
    const pads = navigator.getGamepads();
    const lines: string[] = [];
    this.players.forEach((p, i) => {
      lines.push(`P${i + 1}: ${p.connected ? `${p.profile}  ${p.padId}` : "press any button to join"}`);
    });
    this.pro.last.forEach((l, i) => lines.push(`PRO ${i + 1}: ${l}`));
    for (const pad of pads) {
      if (!pad) continue;
      const axes = pad.axes.map((a, i) => `${i}:${a.toFixed(2)}`).join(" ");
      const btns = pad.buttons
        .map((b, i) => (b.pressed ? i : null))
        .filter((b) => b !== null)
        .join(",");
      lines.push(`[${pad.index}] ${pad.mapping || "raw"}  axes ${axes}  btns ${btns}`);
    }
    return lines.join("\n");
  }
}
