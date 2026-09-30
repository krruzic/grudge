import type { SimEvent } from "../sim/types";

type Screen = (x: number, y: number, z: number) => { x: number; y: number };

const SCALE = [0, 2, 3, 5, 7, 9, 10];

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private budget = new Map<string, number>();
  private musicOn = false;
  private nextNoteTime = 0;
  private step = 0;
  private intensity = 0;

  private musicLevel = 0.32;
  private sfxLevel = 1;

  setLevels(music: number, sound: number): void {
    this.musicLevel = 0.32 * music;
    this.sfxLevel = sound;
    if (this.musicBus) this.musicBus.gain.value = this.musicLevel;
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxLevel;
  }

  constructor(private volume = 0.7) {
    const unlock = () => this.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.volume;
      const comp = c.createDynamicsCompressor();
      this.master.connect(comp).connect(c.destination);
      this.sfxBus = c.createGain();
      this.sfxBus.gain.value = this.sfxLevel;
      this.sfxBus.connect(this.master);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = this.musicLevel;
      this.musicBus.connect(this.master);
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  private allow(key: string, max: number): boolean {
    const n = this.budget.get(key) ?? 0;
    if (n >= max) return false;
    this.budget.set(key, n + 1);
    return true;
  }

  private out(pan: number, gain: number, bus?: AudioNode): GainNode {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = gain;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(bus ?? this.sfxBus);
    return g;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, pan = 0, at = 0, bus?: AudioNode): void {
    const c = this.ctx!;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this.out(pan, 0, bus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(freq: number, q: number, dur: number, gain: number, pan = 0, type: BiquadFilterType = "lowpass", at = 0, sweepTo?: number, bus?: AudioNode): void {
    const c = this.ctx!;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.out(pan, 0, bus);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  ui(kind: "move" | "ok" | "back" | "start"): void {
    if (!this.ready) return;
    if (kind === "move") this.tone("square", 660, 660, 0.06, 0.08);
    else if (kind === "ok") { this.tone("square", 520, 520, 0.08, 0.1); this.tone("square", 780, 780, 0.12, 0.1, 0, 0.08); }
    else if (kind === "back") this.tone("square", 400, 260, 0.12, 0.1);
    else { [392, 523, 659, 784].forEach((f, i) => this.tone("square", f, f, 0.16, 0.12, 0, i * 0.09)); }
  }

  handle(events: SimEvent[], toScreen: Screen): void {
    if (!this.ready) return;
    this.budget.clear();
    const W = window.innerWidth;
    for (const ev of events) {
      const pan = "x" in ev && "z" in ev ? (toScreen(ev.x, ev.y, ev.z).x / W) * 2 - 1 : 0;
      switch (ev.type) {
        case "hit":
          if (!this.allow("hit", 4)) break;
          if (ev.blocked) { this.tone("triangle", 1400, 900, 0.12, 0.12, pan); this.hiss(3000, 2, 0.06, 0.1, pan, "bandpass"); }
          else if (ev.big) { this.tone("sine", 140, 45, 0.22, 0.5, pan); this.hiss(1200, 0.7, 0.18, 0.4, pan); }
          else { this.tone("sine", 190, 70, 0.1, 0.3, pan); this.hiss(1800, 0.8, 0.07, 0.22, pan); }
          break;
        case "miss":
          if (this.allow("miss", 2)) this.hiss(2500, 1, 0.18, 0.12, pan, "bandpass", 0, 700);
          break;
        case "shot":
          if (!this.allow("shot", 3)) break;
          if (ev.style === "ballista") { this.tone("sine", 180, 60, 0.18, 0.4, pan); this.hiss(900, 1.5, 0.12, 0.2, pan); }
          else if (ev.style === "arrow") this.hiss(3500, 3, 0.09, 0.1, pan, "bandpass", 0, 1500);
          else if (ev.style === "magic") { this.tone("sawtooth", 900, 300, 0.2, 0.07, pan); this.tone("sine", 1200, 600, 0.2, 0.08, pan); }
          else this.tone("square", 1200, 200, 0.15, 0.06, pan);
          break;
        case "death":
          if (!this.allow("death", 3)) break;
          if (ev.kind === "unit") { this.hiss(900, 0.6, 0.25, 0.25, pan, "lowpass", 0, 200); this.tone("square", 300, 90, 0.18, 0.05, pan); }
          else if (ev.kind === "hero") { this.tone("sawtooth", 300, 60, 0.7, 0.2, pan); this.hiss(700, 0.5, 0.6, 0.35, pan, "lowpass", 0, 100); }
          else { this.tone("sine", 90, 30, 1.0, 0.7, pan); this.hiss(1500, 0.4, 1.1, 0.6, pan, "lowpass", 0, 120); }
          break;
        case "slam":
          if (this.allow("slam", 2)) { this.tone("sine", 80, 30, 0.45, 0.7, pan); this.hiss(500, 0.5, 0.4, 0.45, pan, "lowpass", 0, 80); }
          break;
        case "banner":
          this.tone("sine", 160, 60, 0.15, 0.4, pan);
          this.tone("triangle", 392, 392, 0.2, 0.08, pan, 0.08);
          this.tone("triangle", 523, 523, 0.3, 0.08, pan, 0.2);
          break;
        case "rally":
          [262, 330, 392, 523].forEach((f, i) => this.tone("sawtooth", f, f * 1.01, 0.5, 0.07, pan, i * 0.06));
          break;
        case "warcry":
          if (this.allow("warcry", 1)) { this.tone("sawtooth", 220, 330, 0.5, 0.12, pan); this.tone("sawtooth", 277, 415, 0.5, 0.1, pan); }
          break;
        case "pulse":
          if (this.allow("pulse", 1)) this.tone("sine", 600, 120, 0.4, 0.15, pan);
          break;
        case "heal":
          if (this.allow("heal", 1)) this.tone("triangle", 880, 1320, 0.15, 0.05, pan);
          break;
        case "build":
          if (this.allow("build", 1)) { this.tone("square", 392, 392, 0.1, 0.1, pan); this.tone("square", 587, 587, 0.18, 0.1, pan, 0.1); this.hiss(600, 0.7, 0.3, 0.2, pan); }
          break;
        case "spawn":
          if (this.allow("spawn", 1)) this.tone("triangle", 500, 800, 0.08, 0.04, pan);
          break;
        case "parry":
          this.tone("triangle", 2000, 1800, 0.4, 0.2, pan);
          this.tone("sine", 3000, 2900, 0.3, 0.1, pan);
          break;
        case "telegraph":
          this.tone("sawtooth", 200, 600, ev.seconds, 0.05, pan);
          break;
        case "blink":
          this.hiss(4000, 1, 0.3, 0.15, pan, "highpass");
          break;
        case "cannonWarn": {
          if (!this.allow("cannonWarn", 2)) break;
          const fly = Math.min(1.3, ev.seconds * 0.6);
          this.tone("square", 70, 70, 0.08, 0.12, pan);
          this.hiss(300, 0.6, 0.25, 0.35, pan, "lowpass", 0.02, 90);
          this.tone("sine", 2400, 700, fly, 0.06, pan, ev.seconds - fly);
          break;
        }
        case "cannonHit":
          if (!this.allow("cannonHit", 2)) break;
          this.tone("sine", 110, 28, 0.9, 0.8, pan);
          this.hiss(900, 0.4, 1.1, 0.7, pan, "lowpass", 0, 90);
          this.hiss(3000, 0.8, 0.25, 0.25, pan, "bandpass", 0.02, 600);
          break;
        case "bomb":
          if (ev.state === "planted") {
            this.tone("square", 900, 900, 0.05, 0.08, pan);
            this.hiss(5000, 1.5, ev.fuse, 0.08, pan, "highpass");
            for (let i = 1; i < ev.fuse * 2; i++) this.tone("square", 1200 + i * 60, 1200 + i * 60, 0.04, 0.06, pan, i * 0.5 * (1 - i / (ev.fuse * 6)));
          }
          break;
        case "reach":
          this.hiss(900, 1, 0.18, 0.2, pan, "bandpass", 0, 300);
          if (ev.hit) this.tone("sine", 220, 80, 0.18, 0.4, pan, 0.1);
          break;
        case "shove":
          this.hiss(700, 0.8, 0.14, ev.team >= 0 ? 0.35 : 0.15, pan, "lowpass", 0, 200);
          if (ev.team >= 0) this.tone("sine", 160, 60, 0.15, 0.3, pan);
          break;
        case "fall":
          this.tone("triangle", 700, 150, 0.3, 0.08, pan);
          this.tone("sine", 90, 40, 0.2, 0.4, pan, 0.28);
          break;
        case "squad":
          [196, 262, 330].forEach((f, i) => this.tone("square", f, f, 0.14, 0.07, pan, i * 0.08));
          this.hiss(500, 0.6, 0.35, 0.18, pan, "lowpass", 0.1);
          break;
        case "relic":
          if (ev.state === "taken") [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, 0.18, 0.1, pan, i * 0.06));
          else if (ev.state === "dropped") [784, 622, 523, 392].forEach((f, i) => this.tone("triangle", f, f * 0.98, 0.16, 0.1, pan, i * 0.06));
          else if (ev.state === "home") this.tone("sine", 392, 784, 0.6, 0.08, pan);
          else if (ev.state === "stolen") {
            [659, 523, 440, 330].forEach((f, i) => this.tone("sawtooth", f, f * 0.97, 0.22, 0.07, pan, i * 0.08));
            this.hiss(900, 0.6, 0.5, 0.3, pan, "lowpass", 0, 200);
          }
          else {
            this.tone("sine", 70, 25, 1.4, 0.8, pan);
            this.hiss(700, 0.4, 1.4, 0.6, pan, "lowpass", 0, 80);
            [262, 330, 392, 523, 659].forEach((f, i) => this.tone("sawtooth", f, f, 0.5, 0.06, 0, 0.3 + i * 0.07));
          }
          break;
        case "mod":
          this.hiss(300, 0.5, 0.4, 0.3, 0, "lowpass");
          this.tone("square", 120, 90, 0.3, 0.06, 0);
          break;
        case "directive":
          if (this.allow("directive", 1)) { this.tone("square", 587, 587, 0.07, 0.07, ev.team ? 0.6 : -0.6); this.tone("square", 880, 880, 0.1, 0.07, ev.team ? 0.6 : -0.6, 0.07); }
          break;
        case "notice":
          if (ev.team < 0) { this.tone("sawtooth", 196, 196, 0.6, 0.15); this.tone("sawtooth", 294, 294, 0.6, 0.12, 0, 0.15); }
          else if (this.allow("notice", 1)) this.tone("square", 220, 180, 0.15, 0.06, ev.team ? 0.6 : -0.6);
          break;
      }
    }
  }

  setMusic(on: boolean, intensity = 0): void {
    this.musicOn = on;
    this.intensity = intensity;
  }

  update(): void {
    if (!this.ready || !this.musicOn) return;
    const c = this.ctx!;
    const bpm = 112 + this.intensity * 28;
    const stepDur = 60 / bpm / 4;
    if (this.nextNoteTime < c.currentTime) this.nextNoteTime = c.currentTime + 0.05;
    while (this.nextNoteTime < c.currentTime + 0.2) {
      this.playStep(this.step, this.nextNoteTime - c.currentTime, stepDur);
      this.step = (this.step + 1) % 128;
      this.nextNoteTime += stepDur;
    }
  }

  private playStep(step: number, at: number, dur: number): void {
    const bar = Math.floor(step / 16) % 8;
    const s = step % 16;
    const prog = [0, 0, 5, 3, 0, 0, 4, 6][bar];
    const root = 110;
    const note = (deg: number, oct = 0) => {
      const o = Math.floor(deg / 7);
      const d = ((deg % 7) + 7) % 7;
      return root * Math.pow(2, (SCALE[d] + 12 * (o + oct)) / 12);
    };
    const bus = this.musicBus;
    if (s % 4 === 0 || s === 14) this.tone("triangle", note(prog, -1), note(prog, -1) * 0.98, dur * 3.5, 0.5, 0, at, bus);
    const arp = [0, 2, 4, 7, 4, 2, 0, 2];
    if (s % 2 === 0) this.tone("square", note(prog + arp[(s / 2) % 8], 1), note(prog + arp[(s / 2) % 8], 1), dur * 1.6, 0.06, 0.3, at, bus);
    const melody = [7, -1, 9, -1, 11, 9, 7, -1, 6, -1, 4, -1, 6, 7, -1, -1];
    const m = melody[(s + bar * 3) % 16];
    if (bar % 2 === 1 && m >= 0 && s % 2 === 0) this.tone("sawtooth", note(prog + m, 1), note(prog + m, 1), dur * 2.5, 0.04, -0.3, at, bus);
    if (s % 8 === 0) { this.tone("sine", 120, 40, 0.18, 0.7, 0, at, bus); }
    if (s % 8 === 4) this.hiss(1800, 0.7, 0.12, 0.35, 0, "bandpass", at, undefined, bus);
    if (this.intensity > 0.5 || s % 2 === 1) this.hiss(7000, 1, 0.03, 0.1, 0.2, "highpass", at, undefined, bus);
  }
}
