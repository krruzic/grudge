// Switch 2 Pro Controller and the NSO GameCube controller (Switch 2 family, same protocol) over WebHID: decodes
// input reports (buttons, sticks with RANGE calibration, the GameCube pad's analog triggers) for each opened
// controller. They only send these reports after the USB wake-up in procon2wake.ts.
interface HIDInputReportEvent extends Event {
  reportId: number;
  data: DataView;
}

interface HIDDeviceLike extends EventTarget {
  opened: boolean;
  vendorId: number;
  productId: number;
  open(): Promise<void>;
}

interface HIDLike extends EventTarget {
  getDevices(): Promise<HIDDeviceLike[]>;
  requestDevice(opts: { filters: { vendorId: number; productId: number }[] }): Promise<HIDDeviceLike[]>;
}

export interface Pro2State {
  connected: boolean;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  l: boolean;
  r: boolean;
  zl: boolean;
  zr: boolean;
  plus: boolean;
  minus: boolean;
  ls: boolean;
  rs: boolean;
  c: boolean;
  gl: boolean;
  gr: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  stickX: number;
  stickY: number;
  cX: number;
  cY: number;
  /** NSO GameCube controller: the GC button names apply (see onReport) and these are its analog triggers 0..1. */
  gc: boolean;
  lAnalog: number;
  rAnalog: number;
}

export const PRO2_VENDOR = 0x057e;
export const PRO2_PRODUCT = 0x2069;
/** Nintendo Switch Online GameCube controller (Switch 2). */
export const NSO_GC_PRODUCT = 0x2073;
/** Analog trigger rest and full press (raw byte), from the controller's typical calibration. */
const TRIG_REST = 36;
const TRIG_FULL = 225;
const RANGE = 1450;

function emptyState(): Pro2State {
  return {
    connected: false,
    a: false,
    b: false,
    x: false,
    y: false,
    l: false,
    r: false,
    zl: false,
    zr: false,
    plus: false,
    minus: false,
    ls: false,
    rs: false,
    c: false,
    gl: false,
    gr: false,
    up: false,
    down: false,
    left: false,
    right: false,
    stickX: 0,
    stickY: 0,
    cX: 0,
    cY: 0,
    gc: false,
    lAnalog: 0,
    rAnalog: 0,
  };
}

export class ProCon2 {
  readonly pads: Pro2State[] = [];
  private devices: HIDDeviceLike[] = [];
  private centers: ([number, number, number, number] | null)[] = [];
  status = "";
  reports = 0;
  last: string[] = [];

  constructor() {
    const hid = (navigator as unknown as { hid?: HIDLike }).hid;
    if (!hid) return;
    hid.getDevices().then((ds) => ds.filter(ProCon2.matches).forEach((d) => void this.open(d)));
    hid.addEventListener("connect", (e) => {
      const d = (e as unknown as { device: HIDDeviceLike }).device;
      if (ProCon2.matches(d)) void this.open(d);
    });
    hid.addEventListener("disconnect", (e) => {
      const d = (e as unknown as { device: HIDDeviceLike }).device;
      const i = this.devices.indexOf(d);
      if (i >= 0) this.pads[i] = emptyState();
    });
  }

  static matches(d: HIDDeviceLike): boolean {
    return d.vendorId === PRO2_VENDOR && (d.productId === PRO2_PRODUCT || d.productId === NSO_GC_PRODUCT);
  }

  get count(): number {
    return this.pads.filter((p) => p.connected).length;
  }

  async open(d: HIDDeviceLike): Promise<void> {
    let i = this.devices.indexOf(d);
    if (i < 0) {
      i = this.devices.length;
      this.devices.push(d);
      this.pads.push(emptyState());
      this.centers.push(null);
      d.addEventListener("inputreport", (e) => this.onReport(i, e as HIDInputReportEvent));
    }
    try {
      if (!d.opened) await d.open();
      this.pads[i].gc = d.productId === NSO_GC_PRODUCT;
      this.status = `${this.pads[i].gc ? "GAMECUBE CONTROLLER" : "PRO CONTROLLER"} ${i + 1} READY`;
    } catch (err) {
      this.status = "PRO CONTROLLER BLOCKED (CHECK HIDRAW PERMISSION)";
      console.warn("pro controller open failed", err);
    }
  }

  private onReport(i: number, e: HIDInputReportEvent): void {
    this.reports++;
    const v = e.data;
    const off = e.reportId ? 1 : 0;
    const hex: string[] = [];
    for (let k = 0; k < Math.min(14, v.byteLength); k++) hex.push(v.getUint8(k).toString(16).padStart(2, "0"));
    this.last[i] = `id ${e.reportId} len ${v.byteLength} ${hex.join(" ")}`;
    if (v.byteLength + off < 12) return;
    const b = (k: number) => v.getUint8(k - off);
    const p = this.pads[i];
    p.connected = true;
    const bits = b(3) | (b(4) << 8) | (b(5) << 16);
    const on = (n: number) => !!(bits & (1 << n));
    p.b = on(0);
    p.a = on(1);
    p.y = on(2);
    p.x = on(3);
    p.zr = on(4);
    p.r = on(5);
    p.plus = on(6);
    p.rs = on(7);
    p.down = on(8);
    p.right = on(9);
    p.left = on(10);
    p.up = on(11);
    p.zl = on(12);
    p.l = on(13);
    p.minus = on(14);
    p.ls = on(15);
    // Same byte layout on the GameCube pad, under GC names: byte 3 B A Y X R Z Start, byte 4 Down Right Left Up
    // L ZL - so here zr = R, r = Z, zl = L, l = ZL, plus = Start. Bytes 13 / 14 are its analog triggers.
    p.c = false;
    p.gl = false;
    p.gr = false;
    if (p.gc && v.byteLength + off > 14) {
      const trig = (k: number) => Math.max(0, Math.min(1, (b(k) - TRIG_REST) / (TRIG_FULL - TRIG_REST)));
      p.lAnalog = trig(13);
      p.rAnalog = trig(14);
    }
    const raw: [number, number, number, number] = [
      b(6) | ((b(7) & 0x0f) << 8),
      (b(7) >> 4) | (b(8) << 4),
      b(9) | ((b(10) & 0x0f) << 8),
      (b(10) >> 4) | (b(11) << 4),
    ];
    if (!this.centers[i])
      this.centers[i] = raw.map((x) => (Math.abs(x - 2048) < 500 ? x : 2048)) as [number, number, number, number];
    const c = this.centers[i]!;
    const ax = (k: number) => Math.max(-1, Math.min(1, (raw[k] - c[k]) / RANGE));
    p.stickX = ax(0);
    p.stickY = -ax(1);
    p.cX = ax(2);
    p.cY = -ax(3);
    this.last[i] += ` · L ${p.stickX.toFixed(2)},${p.stickY.toFixed(2)} C ${p.cX.toFixed(2)},${p.cY.toFixed(2)}`;
  }
}
