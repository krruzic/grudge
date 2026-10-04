// Audio: the WebAudio engine. Sound effects are mostly CC0 samples (bank.ts) with a few synth recipes (tone/hiss)
// for UI ticks, chimes and pitch-following loops; music is looping tracks per screen.
//   handle()  places each SimEvent of a frame in 3D (spatial.ts) and plays its recipe (events.ts)
//   track()   per-frame world watching: status changes, footsteps, map ambience (tracker.ts, ambience.ts)
//   ui()      menu sounds; setMusic()/update() pick and cross-fade the music track
// Buses: sfx (effects, voices, UI) and ambience under the sound level, music under the music level, all into
// one compressor. Nothing plays until unlock() after the first user input (browser autoplay rules).
import type { SimEvent } from "../sim/types";
import type { World } from "../sim/world";
import { Bank } from "./bank";
import { playEvent } from "./events";
import { CENTER, lean, place, type Hearing, type Place } from "./spatial";
import { Tracker } from "./tracker";

import menuUrl from "../../assets/music/menu.mp3?url";
import selectUrl from "../../assets/music/select.mp3?url";
import battleUrl from "../../assets/music/battle.mp3?url";
import suddenUrl from "../../assets/music/sudden.mp3?url";
import resultsUrl from "../../assets/music/results.mp3?url";

const MUSIC: Record<string, string> = {
  menu: menuUrl,
  select: selectUrl,
  battle: battleUrl,
  sudden: suddenUrl,
  results: resultsUrl,
};
const LOOP_SECONDS: Record<string, number> = {
  menu: 49.951,
  select: 56.307,
  battle: 127.0588,
  sudden: 123.428,
  results: 41.795,
};

/** Events heard everywhere regardless of distance (map-wide happenings, match flow, orders). */
const GLOBAL = new Set(["gates", "horn", "avalanche", "tide", "mist", "notice", "directive", "eliminated"]);
/** Global events that still lean toward where they happened. */
const LEAN = new Set(["relic"]);
/** Most sample voices at once; past this only priority sounds start. */
const MAX_VOICES = 56;

export type UiSound =
  | "move"
  | "ok"
  | "back"
  | "start"
  | "seal"
  | "peel"
  | "key"
  | "page"
  | "error"
  | "open"
  | "close"
  | "join"
  | "leave"
  | "tick";

export interface PlayOpts {
  rate?: number;
  /** Seconds from now. */
  at?: number;
  /** Random pitch spread (default ±5%). */
  jitter?: number;
  /** Plays even when the voice budget is full. */
  priority?: boolean;
  /** Footsteps and other bed-level detail (ducked under everything else, never extends the busy window). */
  quiet?: boolean;
  loop?: boolean;
  bus?: AudioNode;
}

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  ambBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private budget = new Map<string, number>();
  readonly bank = new Bank();
  private tracker = new Tracker();
  private voices = 0;
  /** Dev builds: plays per sample id (+1000 per request for a missing id), for playtest tooling. */
  readonly log = new Map<string, number>();
  /** ctx time until which "something loud" is playing (footsteps duck under it). */
  busyUntil = 0;
  /** Per champion + voice line: earliest next line (voices would otherwise chatter). */
  private vocalAt = new Map<string, number>();

  private musicLevel = 0.5;
  private sfxLevel = 1;

  setLevels(music: number, sound: number): void {
    this.musicLevel = 0.5 * music;
    this.sfxLevel = sound;
    if (this.musicBus) this.musicBus.gain.value = this.musicLevel;
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxLevel;
    if (this.ambBus) this.ambBus.gain.value = this.sfxLevel * 0.45;
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
      this.ambBus = c.createGain();
      this.ambBus.gain.value = this.sfxLevel * 0.45;
      this.ambBus.connect(this.master);
      this.musicBus = c.createGain();
      this.musicBus.gain.value = this.musicLevel;
      this.musicBus.connect(this.master);
      const len = c.sampleRate;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.bank.load(c);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** At most `max` sounds of this key per frame. */
  allow(key: string, max: number): boolean {
    const n = this.budget.get(key) ?? 0;
    if (n >= max) return false;
    this.budget.set(key, n + 1);
    return true;
  }

  // ── Routing ──

  /** Where the current event's voices go (set per event by begin(); the sfx bus otherwise). */
  private dest: AudioNode | null = null;

  /** Routes the next voices through one placed chain: gain -> (off-screen lowpass) -> pan -> sfx bus. */
  begin(p: Place, bus?: AudioNode): void {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = p.gain;
    const pan = c.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, p.pan));
    if (p.muffle) {
      const f = c.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1200;
      g.connect(f).connect(pan);
    } else g.connect(pan);
    pan.connect(bus ?? this.sfxBus);
    this.dest = g;
  }

  end(): void {
    this.dest = null;
  }

  /** Placed chain for a sound at a world point (null when nobody hears it). */
  at(h: Hearing, x: number, y: number, z: number, owner?: number): boolean {
    const p = place(h, x, y, z, owner);
    if (!p) return false;
    this.begin(p);
    return true;
  }

  private out(pan: number, gain: number, bus?: AudioNode): GainNode {
    const c = this.ctx!;
    const g = c.createGain();
    g.gain.value = gain;
    if (!pan) {
      g.connect(bus ?? this.dest ?? this.sfxBus);
      return g;
    }
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(bus ?? this.dest ?? this.sfxBus);
    return g;
  }

  // ── Voices ──

  /** Plays a random variant of a sample id through the current chain. */
  play(id: string, gain = 1, o: PlayOpts = {}): AudioBufferSourceNode | null {
    if (!this.ctx || gain <= 0.001) return null;
    if (this.voices >= MAX_VOICES && !o.priority) return null;
    const buf = this.bank.pick(id);
    if (import.meta.env.DEV) this.log.set(id, (this.log.get(id) ?? 0) + (buf ? 1 : 1000));
    if (!buf) return null;
    const c = this.ctx;
    const t = c.currentTime + (o.at ?? 0);
    const src = c.createBufferSource();
    src.buffer = buf;
    const j = o.jitter ?? 0.05;
    src.playbackRate.value = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * j);
    src.loop = !!o.loop;
    const g = this.out(0, gain, o.bus);
    src.connect(g);
    src.start(t);
    this.voices++;
    src.onended = () => {
      this.voices--;
      g.disconnect();
    };
    if (!o.quiet && gain > 0.15) this.busyUntil = Math.max(this.busyUntil, t + Math.min(0.5, buf.duration));
    return src;
  }

  /** A champion's voice line (attack / big / hurt / death / taunt / order), rate-limited per champion. */
  vocal(hero: string | undefined, line: string, gain = 0.8, o: PlayOpts & { id?: number; gap?: number } = {}): void {
    if (!hero) return;
    const key = `${o.id ?? hero}:${line === "death" ? "d" : "v"}`;
    const now = this.now;
    if ((this.vocalAt.get(key) ?? 0) > now) return;
    if (this.play(`vo.${hero}.${line}`, gain, { jitter: 0.03, ...o }))
      this.vocalAt.set(key, now + (o.gap ?? (line === "attack" ? 1.6 : 1.1)));
  }

  tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, pan = 0, at = 0, bus?: AudioNode): void {
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

  hiss(
    freq: number,
    q: number,
    dur: number,
    gain: number,
    pan = 0,
    type: BiquadFilterType = "lowpass",
    at = 0,
    sweepTo?: number,
    bus?: AudioNode,
  ): void {
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

  // ── UI ──

  ui(kind: UiSound): void {
    if (!this.ready) return;
    this.dest = null;
    const id: Record<UiSound, string> = {
      move: "ui.move",
      ok: "ui.ok",
      back: "ui.back",
      start: "ann.fight",
      seal: "ui.seal",
      peel: "ui.peel",
      key: "ui.key",
      page: "ui.page",
      error: "ui.error",
      open: "ui.open",
      close: "ui.close",
      join: "ui.join",
      leave: "ui.leave",
      tick: "ui.tick",
    };
    const gain = kind === "move" || kind === "key" ? 0.35 : kind === "start" ? 0.9 : 0.5;
    if (this.play(id[kind], gain, { jitter: 0.02, priority: true })) return;
    // Samples still decoding: the old synth blips.
    if (kind === "move") this.tone("square", 660, 660, 0.06, 0.08);
    else if (kind === "back") this.tone("square", 400, 260, 0.12, 0.1);
    else this.tone("square", 520, 780, 0.1, 0.1);
  }

  /** An announcer line (global, centred). */
  announce(line: string, gain = 0.9): void {
    if (!this.ready) return;
    this.dest = null;
    this.play(`ann.${line}`, gain, { jitter: 0, priority: true });
  }

  // ── Match ──

  handle(events: SimEvent[], hearing: Hearing, w: World): void {
    if (!this.ready) return;
    this.budget.clear();
    for (const ev of events) {
      let where: Place | null = CENTER;
      if (GLOBAL.has(ev.type) || !("x" in ev && "z" in ev)) where = CENTER;
      else if (LEAN.has(ev.type)) where = lean(hearing, ev.x, ev.y, ev.z);
      else {
        const e = ev as { src?: number; id?: number };
        where = place(hearing, ev.x, ev.y, ev.z, e.id !== undefined && hearing.own.has(e.id) ? e.id : e.src);
      }
      if (!where) continue;
      this.begin(where);
      playEvent(this, ev, w);
    }
    this.dest = null;
  }

  /** Per-frame world watching (statuses, footsteps, ambience); `mapId` picks the ambience beds. */
  track(w: World, hearing: Hearing, mapId: string, dt: number): void {
    if (!this.ready) return;
    this.tracker.update(this, w, hearing, mapId, dt);
    this.dest = null;
  }

  /** Silences the map ambience (menus, results). */
  quiet(): void {
    this.tracker.stop(this);
  }

  // ── Music ──

  private tracks = new Map<string, { buf: AudioBuffer | null; loading: boolean }>();
  private playing: { name: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private want: string | null = null;
  private duck = 1;
  private playedDuck = 1;

  setMusic(track: string | null, duck = 1): void {
    this.want = track;
    this.duck = duck;
  }

  private fetchTrack(name: string): AudioBuffer | null {
    const t = this.tracks.get(name);
    if (t) return t.buf;
    const url = MUSIC[name];
    if (!url || !this.ctx) return null;
    const entry = { buf: null as AudioBuffer | null, loading: true };
    this.tracks.set(name, entry);
    const ctx = this.ctx;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => {
        entry.buf = buf;
        entry.loading = false;
      })
      .catch(() => {
        entry.loading = false;
      });
    return null;
  }

  update(): void {
    if (!this.ready) return;
    const c = this.ctx!;
    const now = c.currentTime;
    if (this.playing && this.playing.name !== this.want) {
      const old = this.playing;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + 1.2);
      old.src.stop(now + 1.3);
      this.playing = null;
    }
    if (!this.playing && this.want) {
      const buf = this.fetchTrack(this.want);
      if (buf) {
        const src = c.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.loopStart = 0;
        src.loopEnd = Math.min(buf.duration, LOOP_SECONDS[this.want] ?? buf.duration);
        const gain = c.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.duck, now + 1.2);
        src.connect(gain).connect(this.musicBus);
        src.start(now + 0.05);
        this.playing = { name: this.want, src, gain };
        this.playedDuck = this.duck;
      }
    } else if (this.playing) {
      const next = Object.keys(MUSIC).find((k) => !this.tracks.has(k));
      if (next) this.fetchTrack(next);
    }
    if (this.playing && this.playedDuck !== this.duck) {
      this.playedDuck = this.duck;
      this.playing.gain.gain.cancelScheduledValues(now);
      this.playing.gain.gain.setTargetAtTime(this.duck, now, 0.25);
    }
  }

  /** Briefly dips the music and ambience under a huge impact (core falls, serpent breach, avalanche). */
  impact(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const b of [this.musicBus, this.ambBus]) {
      const base = b === this.musicBus ? this.musicLevel : this.sfxLevel * 0.45;
      b.gain.cancelScheduledValues(now);
      b.gain.setValueAtTime(b.gain.value, now);
      b.gain.linearRampToValueAtTime(base * 0.6, now + 0.05);
      b.gain.setTargetAtTime(base, now + 0.6, 0.5);
    }
  }
}
