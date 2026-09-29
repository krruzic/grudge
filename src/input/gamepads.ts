import { GcAdapter } from "./gcadapter";
export type ButtonAction =
  | "a" | "b" | "x" | "y" | "z" | "r" | "block" | "dodge" | "start"
  | "up" | "down" | "left" | "right";

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
  "a", "b", "x", "y", "z", "r", "block", "dodge", "start", "up", "down", "left", "right",
];

function emptyButtons(): Record<ButtonAction, boolean> {
  return Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<ButtonAction, boolean>;
}

function emptyState(): PadState {
  return {
    connected: false, profile: "", padId: "",
    stickX: 0, stickY: 0, cX: 0, cY: 0,
    held: emptyButtons(), pressed: emptyButtons(),
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
  private slots: (number | null)[];

  private keys = new Set<string>();
  private tapped = new Set<string>();
  private keyTouched = false;
  private mouse = { left: false, right: false, x: 0, y: 0, ox: 0, oy: 0 };

  constructor(private config: InputConfig, playerCount: number) {
    this.players = Array.from({ length: playerCount }, emptyState);
    this.slots = Array.from({ length: playerCount }, () => null);
    const kb = config.keyboard;
    if (!kb) return;
    const mapped = new Set<string>([
      ...Object.values(kb.stick).flat(), ...Object.values(kb.cstick).flat(), ...Object.values(kb.buttons).flat() as string[],
    ]);
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyG" && !this.gc.connected) void this.gc.request();
      if (!mapped.has(e.code)) return;
      e.preventDefault();
      this.keys.add(e.code);
      this.tapped.add(e.code);
      this.keyTouched = true;
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
      if (e.button === 0) { this.mouse.left = true; this.tapped.add("Mouse0"); }
      if (e.button === 2) { this.mouse.right = true; this.tapped.add("Mouse2"); }
      this.keyTouched = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
  }

  keyboardSlot(): number {
    return this.slots.indexOf(KEYBOARD);
  }

  claimKeyboard(): void {
    this.keyTouched = true;
  }

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
      if (m > 1) { x /= m; y /= m; }
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
    held.dodge = g.l;
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
    if (found.id === "gc_adapter_uinput" && pad.mapping === "standard") return this.config.profiles.find((p) => p.id === "standard") ?? found;
    return found;
  }

  private assignSlots(pads: (Gamepad | null)[]): void {
    for (let s = 0; s < this.slots.length; s++) {
      const idx = this.slots[s];
      if (idx !== null && idx !== KEYBOARD && !pads[idx]?.connected) this.slots[s] = null;
    }
    for (let s = 0; s < this.slots.length; s++) {
      const idx = this.slots[s];
      if (idx !== null && idx <= GC_BASE && !this.gc.ports[GC_BASE - idx]?.connected) this.slots[s] = null;
    }
    const nativeGc = pads.some((pad) => !!pad?.connected && /gamecube (adapter port|controller)/i.test(pad.id));
    this.gc.ports.forEach((gp, p) => {
      if (nativeGc || !gp.connected || this.slots.includes(GC_BASE - p)) return;
      if (!(gp.a || gp.b || gp.x || gp.y || gp.z || gp.start)) return;
      const free = this.slots.indexOf(null);
      if (free >= 0) this.slots[free] = GC_BASE - p;
    });
    if (this.keyTouched && !this.slots.includes(KEYBOARD)) {
      const free = this.slots.indexOf(null);
      if (free >= 0) this.slots[free] = KEYBOARD;
    }
    for (const pad of pads) {
      if (!pad?.connected || this.slots.includes(pad.index)) continue;
      const anyInput = pad.buttons.some((b) => b.pressed);
      const free = this.slots.indexOf(null);
      if (free >= 0 && anyInput) this.slots[free] = pad.index;
    }
  }

  poll(): void {
    const pads = navigator.getGamepads();
    this.assignSlots(pads);
    for (let s = 0; s < this.players.length; s++) {
      const st = this.players[s];
      const idx = this.slots[s];
      if (idx === KEYBOARD) {
        this.pollKeyboard(st);
        continue;
      }
      if (idx !== null && idx <= GC_BASE) {
        this.pollGc(st, GC_BASE - idx);
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
        let on = idxs.some((i) => pad.buttons[i]?.pressed);
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
    for (const pad of pads) {
      if (!pad) continue;
      const axes = pad.axes.map((a, i) => `${i}:${a.toFixed(2)}`).join(" ");
      const btns = pad.buttons.map((b, i) => (b.pressed ? i : null)).filter((b) => b !== null).join(",");
      lines.push(`[${pad.index}] ${pad.mapping || "raw"}  axes ${axes}  btns ${btns}`);
    }
    return lines.join("\n");
  }
}
