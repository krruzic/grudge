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
}

export const PRO2_VENDOR = 0x057e;
export const PRO2_PRODUCT = 0x2069;
const RANGE = 1450;

function emptyState(): Pro2State {
  return {
    connected: false, a: false, b: false, x: false, y: false, l: false, r: false, zl: false, zr: false, plus: false, minus: false,
    ls: false, rs: false, c: false, gl: false, gr: false, up: false, down: false, left: false, right: false, stickX: 0, stickY: 0, cX: 0, cY: 0,
  };
}

export class ProCon2 {
  readonly pads: Pro2State[] = [];
  private devices: HIDDeviceLike[] = [];
  private centers: ([number, number, number, number] | null)[] = [];
  status = "";
  reports = 0;

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
    return d.vendorId === PRO2_VENDOR && d.productId === PRO2_PRODUCT;
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
      this.status = `PRO CONTROLLER ${i + 1} READY`;
    } catch (err) {
      this.status = "PRO CONTROLLER BLOCKED (CHECK HIDRAW PERMISSION)";
      console.warn("pro controller open failed", err);
    }
  }

  private onReport(i: number, e: HIDInputReportEvent): void {
    this.reports++;
    const v = e.data;
    const off = e.reportId ? 1 : 0;
    if (v.byteLength + off < 17) return;
    const b = (k: number) => v.getUint8(k - off);
    const p = this.pads[i];
    p.connected = true;
    const b5 = b(5);
    const b6 = b(6);
    const b7 = b(7);
    const b8 = b(8);
    p.y = !!(b5 & 0x01);
    p.x = !!(b5 & 0x02);
    p.b = !!(b5 & 0x04);
    p.a = !!(b5 & 0x08);
    p.r = !!(b5 & 0x40);
    p.zr = !!(b5 & 0x80);
    p.minus = !!(b6 & 0x01);
    p.plus = !!(b6 & 0x02);
    p.rs = !!(b6 & 0x04);
    p.ls = !!(b6 & 0x08);
    p.c = !!(b6 & 0x40);
    p.down = !!(b7 & 0x01);
    p.up = !!(b7 & 0x02);
    p.right = !!(b7 & 0x04);
    p.left = !!(b7 & 0x08);
    p.l = !!(b7 & 0x40);
    p.zl = !!(b7 & 0x80);
    p.gr = !!(b8 & 0x01);
    p.gl = !!(b8 & 0x02);
    const raw: [number, number, number, number] = [
      b(11) | ((b(12) & 0x0f) << 8),
      (b(12) >> 4) | (b(13) << 4),
      b(14) | ((b(15) & 0x0f) << 8),
      (b(15) >> 4) | (b(16) << 4),
    ];
    if (!this.centers[i]) this.centers[i] = raw.map((x) => (Math.abs(x - 2048) < 500 ? x : 2048)) as [number, number, number, number];
    const c = this.centers[i]!;
    const ax = (k: number) => Math.max(-1, Math.min(1, (raw[k] - c[k]) / RANGE));
    p.stickX = ax(0);
    p.stickY = -ax(1);
    p.cX = ax(2);
    p.cY = -ax(3);
  }
}
