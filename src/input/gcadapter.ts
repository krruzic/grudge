interface HIDInputReportEvent extends Event {
  reportId: number;
  data: DataView;
}

interface HIDDeviceLike extends EventTarget {
  opened: boolean;
  vendorId: number;
  productId: number;
  productName: string;
  open(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
}

interface HIDLike extends EventTarget {
  getDevices(): Promise<HIDDeviceLike[]>;
  requestDevice(opts: { filters: { vendorId: number; productId: number }[] }): Promise<HIDDeviceLike[]>;
}

export interface GcPort {
  connected: boolean;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  z: boolean;
  l: boolean;
  r: boolean;
  start: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  stickX: number;
  stickY: number;
  cX: number;
  cY: number;
  lAnalog: number;
  rAnalog: number;
}

const VENDOR = 0x057e;
const PRODUCT = 0x0337;

function emptyPort(): GcPort {
  return {
    connected: false, a: false, b: false, x: false, y: false, z: false, l: false, r: false, start: false,
    up: false, down: false, left: false, right: false, stickX: 0, stickY: 0, cX: 0, cY: 0, lAnalog: 0, rAnalog: 0,
  };
}

export class GcAdapter {
  readonly ports: GcPort[] = [emptyPort(), emptyPort(), emptyPort(), emptyPort()];
  private device: HIDDeviceLike | null = null;
  private center: [number, number, number, number][] = [];
  status = "";
  reports = 0;
  private lastId = -1;
  private lastLen = 0;
  private lastStatus: number[] = [];
  private offset = -1;
  private initTimer = 0;
  private states = 0;
  private tries = 0;

  constructor() {
    const hid = (navigator as unknown as { hid?: HIDLike }).hid;
    if (!hid) {
      this.status = "WEBHID UNAVAILABLE";
      return;
    }
    hid.getDevices().then((ds) => {
      const d = ds.find((k) => k.vendorId === VENDOR && k.productId === PRODUCT);
      if (d) void this.open(d);
    });
    hid.addEventListener("connect", (e) => {
      const d = (e as unknown as { device: HIDDeviceLike }).device;
      if (d.vendorId === VENDOR && d.productId === PRODUCT) void this.open(d);
    });
    hid.addEventListener("disconnect", (e) => {
      if ((e as unknown as { device: HIDDeviceLike }).device === this.device) {
        this.device = null;
        this.ports.forEach((p) => (p.connected = false));
        this.status = "ADAPTER UNPLUGGED";
      }
    });
  }

  get connected(): boolean {
    return !!this.device;
  }

  async adopt(d: HIDDeviceLike): Promise<void> {
    if (!this.device && d.vendorId === VENDOR && d.productId === PRODUCT) await this.open(d);
  }

  async request(): Promise<void> {
    const hid = (navigator as unknown as { hid?: HIDLike }).hid;
    if (!hid || this.device) return;
    try {
      const [d] = await hid.requestDevice({ filters: [{ vendorId: VENDOR, productId: PRODUCT }] });
      if (d) await this.open(d);
    } catch (err) {
      this.status = "ADAPTER: " + String(err).slice(0, 60);
      console.warn("gc adapter request failed", err);
    }
  }

  private async open(d: HIDDeviceLike): Promise<void> {
    try {
      if (!d.opened) await d.open();
      d.addEventListener("inputreport", (e) => this.onReport(e as HIDInputReportEvent));
      this.device = d;
      this.center = [];
      this.status = "GAMECUBE ADAPTER READY";
      await this.init();
      clearInterval(this.initTimer);
      this.initTimer = window.setInterval(() => {
        if (!this.device) return clearInterval(this.initTimer);
        if (this.states > 0) return;
        if (this.tries >= 6) {
          this.status = "LINUX KERNEL DROPS ADAPTER DATA · RUN wii-u-gc-adapter (SEE docs/decisions.md)";
          return clearInterval(this.initTimer);
        }
        void this.init();
      }, 1000);
    } catch (err) {
      this.status = "ADAPTER BLOCKED (CHECK UDEV HIDRAW PERMISSION)";
      console.warn("gc adapter open failed", err);
    }
  }

  private async init(): Promise<void> {
    const empty = this.tries++ % 2 === 0;
    try {
      await this.device?.sendReport(0x13, empty ? new Uint8Array(0) : new Uint8Array([0]));
    } catch (err) {
      this.status = "ADAPTER INIT FAILED: " + String(err).slice(0, 50);
      console.warn("gc adapter init failed", err);
    }
  }

  debug(): string {
    if (!this.device) return "";
    const st = this.lastStatus.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    return `REPORTS ${this.reports} · STATE ${this.states} · TRIES ${this.tries} · ID ${this.lastId < 0 ? "-" : "0X" + this.lastId.toString(16)} · LEN ${this.lastLen} · OFS ${this.offset} · PORTS ${st || "-"}`;
  }

  private detectOffset(v: DataView): number {
    const score = (off: number) => {
      let n = 0;
      for (let p = 0; p < 4; p++) {
        const o = off + p * 9;
        if (o >= v.byteLength) return -1;
        const b = v.getUint8(o);
        if ((b >> 4) <= 2 && (b & 0x0b) === 0) n++;
      }
      return n;
    };
    if (v.byteLength >= 37 && v.getUint8(0) === 0x21) return 1;
    return score(1) > score(0) ? 1 : 0;
  }

  private onReport(e: HIDInputReportEvent): void {
    this.reports++;
    this.lastId = e.reportId;
    this.lastLen = e.data.byteLength;
    if (e.reportId !== 0x21 && !(e.reportId === 0 && e.data.byteLength >= 37)) return;
    this.states++;
    const v = e.data;
    if (this.offset < 0 || this.reports % 120 === 0) this.offset = this.detectOffset(v);
    this.lastStatus = [0, 1, 2, 3].map((p) => (this.offset + p * 9 < v.byteLength ? v.getUint8(this.offset + p * 9) : 0));
    for (let p = 0; p < 4; p++) {
      const o = this.offset + p * 9;
      if (o + 8 >= v.byteLength) break;
      const status = v.getUint8(o);
      const type = status >> 4;
      const port = this.ports[p];
      port.connected = type === 1 || type === 2;
      if (!port.connected) {
        this.center[p] = undefined as unknown as [number, number, number, number];
        continue;
      }
      const b1 = v.getUint8(o + 1);
      const b2 = v.getUint8(o + 2);
      const raw: [number, number, number, number] = [v.getUint8(o + 3), v.getUint8(o + 4), v.getUint8(o + 5), v.getUint8(o + 6)];
      if (!this.center[p]) this.center[p] = raw.map((x) => (Math.abs(x - 128) < 40 ? x : 128)) as [number, number, number, number];
      const c = this.center[p];
      const ax = (i: number, range: number) => Math.max(-1, Math.min(1, (raw[i] - c[i]) / range));
      port.a = !!(b1 & 0x01);
      port.b = !!(b1 & 0x02);
      port.x = !!(b1 & 0x04);
      port.y = !!(b1 & 0x08);
      port.left = !!(b1 & 0x10);
      port.right = !!(b1 & 0x20);
      port.down = !!(b1 & 0x40);
      port.up = !!(b1 & 0x80);
      port.start = !!(b2 & 0x01);
      port.z = !!(b2 & 0x02);
      port.r = !!(b2 & 0x04);
      port.l = !!(b2 & 0x08);
      port.stickX = ax(0, 88);
      port.stickY = -ax(1, 88);
      port.cX = ax(2, 76);
      port.cY = -ax(3, 76);
      port.lAnalog = Math.max(0, Math.min(1, (v.getUint8(o + 7) - 30) / 170));
      port.rAnalog = Math.max(0, Math.min(1, (v.getUint8(o + 8) - 30) / 170));
    }
  }
}
