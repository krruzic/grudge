// Per-frame world watching for sounds that have no sim event:
//   statuses   a champion newly stunned / slowed / hexed / poisoned / bleeding / shielded / stealthed / dodging
//   footsteps  champions only, per hero (stride, weight, armour or bark layer) and surface; very faint and
//              ducked under everything else
//   ambience   a stereo bed per map on the ambience bus, positional loops (torches, fountain, cider wells, the
//              dune serpent's churn) whose level follows the nearest emitter, and the odd random critter call
// Audio only reads the world, so none of this touches lockstep.
import { FLAG_DIRT, FLAG_PAVING, Kind } from "../sim/terrain";
import type { World } from "../sim/world";
import type { Entity } from "../sim/types";
import type { Audio } from "./sfx";
import { place, type Hearing } from "./spatial";

/** Map beds: [sample id, level]. Critters: [id, min gap s, max gap s]. */
const BEDS: Record<string, { beds: [string, number][]; critters?: [string, number, number][] }> = {
  crossing: {
    beds: [
      ["bed.meadow", 0.8],
      ["bed.river", 0.35],
    ],
    critters: [["bird.chirp", 6, 14]],
  },
  ruins: {
    beds: [
      ["bed.wind", 0.55],
      ["bed.grass", 0.3],
    ],
    critters: [["crow", 9, 20]],
  },
  shoals: {
    beds: [
      ["bed.surf", 0.8],
      ["bed.gulls", 0.35],
    ],
  },
  frostcross: {
    beds: [
      ["bed.gale", 0.55],
      ["bed.wind", 0.35],
    ],
    critters: [["whistle.wind", 14, 28]],
  },
  gardens: {
    beds: [
      ["bed.birds", 0.7],
      ["bed.meadow", 0.35],
    ],
  },
  hollow: {
    beds: [
      ["bed.grass", 0.6],
      ["bed.forest", 0.35],
    ],
    critters: [
      ["owl", 12, 26],
      ["crow", 15, 30],
    ],
  },
  spires: {
    beds: [
      ["bed.wind", 0.45],
      ["bed.crickets", 0.45],
      ["bed.insects", 0.3],
    ],
    critters: [["owl", 16, 32]],
  },
};

/** Footstep feel per champion: metres per step, rate, level, extra layer. */
const GAIT: Record<string, { stride: number; rate: number; gain: number; layer?: string }> = {
  warlord: { stride: 2.0, rate: 0.85, gain: 1.1, layer: "step.armor" },
  herald: { stride: 1.8, rate: 0.95, gain: 1, layer: "step.armor" },
  engineer: { stride: 1.5, rate: 0.95, gain: 1 },
  friar: { stride: 1.9, rate: 0.82, gain: 1.15 },
  wreckwitch: { stride: 1.8, rate: 0.85, gain: 1.05 },
  vintner: { stride: 2.1, rate: 0.72, gain: 1.25, layer: "step.armor" },
  warden: { stride: 2.2, rate: 0.75, gain: 0.9, layer: "step.bark" },
  raider: { stride: 1.7, rate: 1.1, gain: 0.55 },
  duelist: { stride: 1.7, rate: 1.1, gain: 0.85 },
  marksman: { stride: 1.6, rate: 1.15, gain: 0.75 },
  harpooner: { stride: 1.3, rate: 0.9, gain: 0.8, layer: "step.water" },
  summoner: { stride: 1.6, rate: 1.05, gain: 0.6 },
  scribe: { stride: 1.4, rate: 1.1, gain: 0.55 },
  architect: { stride: 1.4, rate: 1.2, gain: 0.7 },
  // Mead hovers: no footfalls (silent gain), Bramble never touches the ground.
  rider: { stride: 99, rate: 1, gain: 0 },
};
const STEP = 0.075;

interface Seen {
  x: number;
  z: number;
  walked: number;
  stun: number;
  slow: number;
  hex: number;
  poison: number;
  bleed: number;
  shield: number;
  stealth: number;
  action: string;
  charging: string;
}

interface Loop {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan: StereoPannerNode;
}

export class Tracker {
  private seen = new Map<number, Seen>();
  private map = "";
  private beds: Loop[] = [];
  private spots = new Map<string, Loop>();
  private critterAt = new Map<string, number>();
  private world: World | null = null;

  update(a: Audio, w: World, h: Hearing, mapId: string, dt: number): void {
    if (w !== this.world) {
      this.world = w;
      this.seen.clear();
    }
    if (mapId !== this.map) this.startBeds(a, mapId);
    for (const e of w.entities) if (e.hero && e.alive && !e.hero.dead) this.hero(a, w, h, e);
    this.emitters(a, w, h);
    this.critters(a, h, mapId);
    void dt;
  }

  stop(a: Audio): void {
    const now = a.now;
    for (const l of [...this.beds, ...this.spots.values()]) {
      l.gain.gain.setTargetAtTime(0, now, 0.4);
      l.src.stop(now + 2);
    }
    this.beds = [];
    this.spots.clear();
    this.map = "";
  }

  // ── Champions ──

  private hero(a: Audio, w: World, h: Hearing, e: Entity): void {
    const st = e.status;
    const hs = e.hero!;
    const p = e.transform.pos;
    const now = w.time;
    let s = this.seen.get(e.id);
    if (!s) {
      s = {
        x: p.x,
        z: p.z,
        walked: 0,
        stun: st.stunUntil,
        slow: st.slowUntil,
        hex: st.hexUntil,
        poison: st.poisonUntil ?? 0,
        bleed: st.bleedStacks,
        shield: st.shield,
        stealth: st.stealthUntil,
        action: hs.action?.name ?? "",
        charging: hs.charging ?? "",
      };
      this.seen.set(e.id, s);
      return;
    }
    const y = e.transform.y;
    const fresh = (until: number, was: number) => until > now + 0.2 && until > was + 0.25 && was < now + 0.05;
    const cues: [boolean, string, number][] = [
      [fresh(st.stunUntil, s.stun), "", 0],
      [fresh(st.slowUntil, s.slow) && st.slowMul < 0.9, "slow", 0.45],
      [fresh(st.hexUntil, s.hex), "root", 0.6],
      [fresh(st.poisonUntil ?? 0, s.poison), "poison", 0.45],
      [st.bleedStacks > s.bleed, "bleed", 0.35],
      [st.shield > s.shield + 5 && s.shield < 1, "shield.up", 0.5],
      [fresh(st.stealthUntil, s.stealth), "blink", 0.35],
    ];
    for (const [hit, id, g] of cues) {
      if (!hit || !a.at(h, p.x, y, p.z, e.id)) continue;
      if (id) a.play(id, g);
      else this.stars(a);
    }
    const act = hs.action?.name ?? "";
    if (act === "dodge" && s.action !== "dodge" && a.at(h, p.x, y, p.z, e.id)) {
      a.play("dodge", 0.5);
      a.play("swing.light", 0.3, { rate: 0.8 });
    }
    const ch = hs.charging ?? "";
    if (ch && !s.charging && (hs.type === "marksman" || hs.type === "harpooner") && a.at(h, p.x, y, p.z, e.id))
      a.play("wren.draw", 0.45);
    s.stun = st.stunUntil;
    s.slow = st.slowUntil;
    s.hex = st.hexUntil;
    s.poison = st.poisonUntil ?? 0;
    s.bleed = st.bleedStacks;
    s.shield = st.shield;
    s.stealth = st.stealthUntil;
    s.action = act;
    s.charging = ch;
    this.steps(a, w, h, e, s);
  }

  /** Little birds circling a stunned head. */
  private stars(a: Audio): void {
    [0, 0.09, 0.18].forEach((t, i) => a.tone("sine", 2400 + i * 300, 2900 + i * 200, 0.07, 0.035, 0, t));
  }

  private steps(a: Audio, w: World, h: Hearing, e: Entity, s: Seen): void {
    const p = e.transform.pos;
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    s.x = p.x;
    s.z = p.z;
    // Teleports, knockbacks and jumps don't count as walking.
    if (d > 1.2 || e.transform.y > w.groundY(p.x, p.z) + 0.3) return;
    const g = GAIT[e.hero!.type] ?? GAIT.engineer;
    s.walked += d;
    if (s.walked < g.stride) return;
    s.walked = 0;
    const where = place(h, p.x, e.transform.y, p.z);
    if (!where || where.gain < 0.2) return;
    if (e.status.hidden && !h.own.has(e.id)) return;
    a.begin(where);
    const duck = a.now < a.busyUntil ? 0.3 : 1;
    const gain = STEP * g.gain * duck;
    a.play(this.surface(w, p.x, p.z), gain, { rate: g.rate, quiet: true, jitter: 0.08 });
    if (g.layer) a.play(g.layer, gain * 0.8, { rate: g.rate, quiet: true });
  }

  private surface(w: World, x: number, z: number): string {
    const t = w.terrain;
    const i = t.index(Math.floor(x), Math.floor(z));
    if (i < 0) return "step.dirt";
    if (t.kinds[i] === Kind.Bridge) return "step.wood";
    if (w.groundY(x, z) < t.waterLevel + 0.05) return "step.water";
    if (t.flags[i] & FLAG_PAVING) return "step.stone";
    const snowy = t.surround === "alpine";
    const sandy = t.palette === "desert";
    if (snowy) return "step.snow";
    if (sandy) return "step.sand";
    if (t.flags[i] & FLAG_DIRT) return "step.dirt";
    return "step.grass";
  }

  // ── Ambience ──

  private startBeds(a: Audio, mapId: string): void {
    this.stop(a);
    this.map = mapId;
    for (const [id, level] of BEDS[mapId]?.beds ?? []) {
      const l = this.loop(a, id, level);
      if (l) this.beds.push(l);
    }
  }

  private loop(a: Audio, id: string, level: number): Loop | null {
    const c = a.ctx!;
    const buf = a.bank.pick(id);
    if (!buf) return null;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.setTargetAtTime(level, c.currentTime, 1.2);
    const pan = c.createStereoPanner();
    src.connect(gain).connect(pan).connect(a.ambBus);
    src.start(c.currentTime, Math.random() * Math.max(0, buf.duration - 1));
    return { src, gain, pan };
  }

  /** Positional loops: each kind follows its loudest emitter for the listeners. */
  private emitters(a: Audio, w: World, h: Hearing): void {
    if (!this.beds.length && BEDS[this.map]) this.startBeds(a, this.map);
    const t = w.terrain;
    const kinds: [string, number, { x: number; z: number }[]][] = [
      ["bed.fire", 0.35, t.props.filter((p) => p.type === "torch")],
      ["bed.stream", 0.25, w.mapEvents.fountain ? [w.mapEvents.fountain] : []],
      ["bed.boil", 0.3, w.mapEvents.geyserWells],
    ];
    const sp = w.mapEvents.serpent;
    for (const [id, level, pts] of kinds) {
      if (!pts.length) continue;
      let best: { gain: number; pan: number } | null = null;
      for (const p of pts) {
        const q = place(h, p.x, w.groundY(p.x, p.z), p.z);
        if (q && (!best || q.gain > best.gain)) best = q;
      }
      let l = this.spots.get(id);
      if (!l) {
        l = this.loop(a, id, 0) ?? undefined;
        if (!l) continue;
        this.spots.set(id, l);
      }
      const now = a.now;
      l.gain.gain.setTargetAtTime((best?.gain ?? 0) * level, now, 0.15);
      l.pan.pan.setTargetAtTime(best?.pan ?? 0, now, 0.15);
    }
    if (sp) this.serpent(a, w, h);
  }

  /** The dune serpent's churn: a low sand rumble that follows it while it swims. */
  private serpent(a: Audio, w: World, h: Hearing): void {
    const sp = w.mapEvents.serpent!;
    let l = this.spots.get("serpent");
    if (!l) {
      l = this.loop(a, "bed.gale", 0) ?? undefined;
      if (!l) return;
      l.src.playbackRate.value = 0.45;
      this.spots.set("serpent", l);
    }
    const q = place(h, sp.x, w.groundY(sp.x, sp.z), sp.z);
    const now = a.now;
    l.gain.gain.setTargetAtTime((q?.gain ?? 0) * (sp.mode === "warn" ? 1.2 : 0.7), now, 0.2);
    l.pan.pan.setTargetAtTime(q?.pan ?? 0, now, 0.2);
  }

  /** Occasional birds / crows / owls / gusts near a listener. */
  private critters(a: Audio, h: Hearing, mapId: string): void {
    const now = a.now;
    for (const [id, lo, hi] of BEDS[mapId]?.critters ?? []) {
      const at = this.critterAt.get(id);
      if (at === undefined) {
        this.critterAt.set(id, now + lo + Math.random() * (hi - lo));
        continue;
      }
      if (now < at) continue;
      this.critterAt.set(id, now + lo + Math.random() * (hi - lo));
      a.begin({ gain: 1, pan: Math.random() * 1.6 - 0.8, muffle: Math.random() < 0.5 }, a.ambBus);
      a.play(id, 0.5, { quiet: true });
    }
    void h;
  }
}
