// Save data (localStorage "grudge.save.v1"): match rules, options, signed names (tags) with their records,
// per-hero records and the recent match log. Also the rule / option row definitions shown by the RULES and
// OPTIONS pages, and applyRules(), which derives the GameData a match runs on from the base data and the rules.
import type { GameData } from "../sim/config";

export interface Rules {
  minutes: number;
  sudden: number;
  popCap: number;
  startGold: number;
  goldRate: number;
  troops: number;
  respawn: number;
  mercy: number;
  partners: number;
  pausing: number;
  /** Team deathmatch: kills to win. */
  killLimit: number;
}

export interface Options {
  music: number;
  sound: number;
  shake: number;
  hints: number;
  split: number;
  zoom?: number[];
  kbm: number;
  fps: number;
  /** 3D render resolution in percent of native (100 or 75). */
  renderScale: number;
  /** 1 full effects, 0 reduced (GameRenderer.setLowFx). */
  effects?: number;
}

export interface Record3 {
  w: number;
  l: number;
  d: number;
}

export interface TagStats extends Record3 {
  name: string;
  kills: number;
  heroes: Record<string, Record3>;
  last: number;
}

export interface HeroStats extends Record3 {
  picks: number;
}

export type MatchMode = "1v1" | "2v2" | "ffa" | "tdm" | "ffadm";

export interface MatchLog {
  at: number;
  mode: string;
  map: string;
  winner: number;
  secs: number;
  players: MatchPlayer[];
}

export interface MatchPlayer {
  tag: string | null;
  tagId?: string | null;
  hero: string;
  team: number;
  cpu: boolean;
  /** Match stats (logged since the results cards got them; older entries have none). */
  k?: number;
  d?: number;
  dmg?: number;
  cs?: number;
}

export interface TagRef {
  id: string;
  name: string;
}

export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function cleanTag(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, MAX_TAG);
}

export interface SaveData {
  v: number;
  rules: Rules;
  options: Options;
  tags: Record<string, TagStats>;
  heroes: Record<string, HeroStats>;
  log: MatchLog[];
}

export type Row<T> = { key: keyof T; label: string; values: number[]; fmt: (v: number) => string; blurb: string };

const onOff = (v: number) => (v ? "ON" : "OFF");

export const CAMERA_NAMES = ["SHARED VIEW", "SPLIT VIEW", "SPLIT VIEW"];

export const RULE_ROWS: Row<Rules>[] = [
  {
    key: "minutes",
    label: "MATCH LENGTH",
    values: [3, 4, 6, 8, 10, 15],
    fmt: (v) => `${v} MIN`,
    blurb: "TIME BEFORE THE BELL TOLLS.",
  },
  {
    key: "sudden",
    label: "SUDDEN DEATH",
    values: [0, 30, 60, 120],
    fmt: (v) => (v ? `${v} SEC` : "NONE"),
    blurb: "EXTRA TIME WHERE ALL IS CHEAPER AND DEADLIER.",
  },
  {
    key: "popCap",
    label: "SOLDIER CAP",
    values: [8, 12, 16, 20, 24],
    fmt: String,
    blurb: "MOST SOLDIERS ONE HOUSE MAY FIELD.",
  },
  {
    key: "startGold",
    label: "STARTING GOLD",
    values: [0, 100, 200, 400, 800],
    fmt: String,
    blurb: "GOLD IN THE COFFERS AT THE FIRST HORN.",
  },
  {
    key: "goldRate",
    label: "GOLD RATE",
    values: [0.5, 0.75, 1, 1.5, 2, 3],
    fmt: (v) => `X ${v}`,
    blurb: "HOW FAST THE COFFERS FILL.",
  },
  {
    key: "troops",
    label: "TROOP OUTPUT",
    values: [0.5, 0.75, 1, 1.5, 2, 3],
    fmt: (v) => `X ${v}`,
    blurb: "HOW OFTEN OUTPOSTS SEND SOLDIERS.",
  },
  {
    key: "respawn",
    label: "HERO RETURNS",
    values: [3, 6, 10, 15],
    fmt: (v) => `${v} SEC`,
    blurb:
      "HOW LONG A FALLEN CHAMPION STAYS DOWN IN 1 VS 1. 2 VS 2 AND FREE FOR ALL WAIT ABOUT TWO THIRDS LONGER (6 SEC BECOMES 10).",
  },
  {
    key: "partners",
    label: "2 VS 2 ALLIES",
    values: [1, 0],
    fmt: (v) => (v ? "CHAMPIONS" : "COMMANDERS"),
    blurb: "IN 2 VS 2, PLAYERS 3 AND 4 FIGHT AS CHAMPIONS OR LEAD AS COMMANDERS.",
  },
  { key: "mercy", label: "MERCY", values: [1, 0], fmt: onOff, blurb: "THE LOSING HOUSE EARNS AND BUILDS FASTER." },
  {
    key: "killLimit",
    label: "DEATHMATCH KILLS",
    values: [10, 20, 30, 50],
    fmt: (v) => `${v} KILLS`,
    blurb: "TEAM DEATHMATCH: THE FIRST HOUSE TO THIS MANY CHAMPION KILLS WINS.",
  },
  {
    key: "pausing",
    label: "PAUSING",
    values: [1, 0],
    fmt: onOff,
    blurb: "OFF: START DOES NOTHING DURING A MATCH. NOBODY CAN STOP THE FIGHT.",
  },
];

/**
 * Height in device pixels the 3D view is drawn at full size (window height x pixel ratio, capped at 2 - exactly
 * what the renderer sizes its canvas by): the top of the resolution list. Not screen.height x devicePixelRatio:
 * with fractional desktop scaling (GNOME on Wayland) or text scaling Chromium's pixel ratio doesn't match the
 * screen's, so that read as a taller screen than it is, and picking "1080P" on a 1080p screen drew fewer lines.
 */
export function nativeHeight(): number {
  if (typeof window === "undefined") return 1080;
  return Math.round(window.innerHeight * Math.min(window.devicePixelRatio || 1, 2));
}

/** 3D resolution choices: 0 = native, then common heights below the screen's, down to 540p. */
function renderHeights(): number[] {
  const n = nativeHeight();
  return [0, ...[2160, 1440, 1200, 1080, 900, 720, 540].filter((h) => h < n - 8)];
}

export const OPTION_ROWS: Row<Options>[] = [
  {
    key: "music",
    label: "MUSIC",
    values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    fmt: String,
    blurb: "LOUDNESS OF THE MINSTRELS.",
  },
  {
    key: "sound",
    label: "SOUND",
    values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    fmt: String,
    blurb: "LOUDNESS OF STEEL AND SPELLS.",
  },
  { key: "shake", label: "SCREEN SHAKE", values: [1, 0], fmt: onOff, blurb: "THE GROUND TREMBLES WHEN BLOWS LAND." },
  {
    key: "split",
    label: "CAMERA",
    values: [1, 0],
    fmt: (v) => CAMERA_NAMES[v],
    blurb: "SPLIT: EACH PLAYER GETS A VIEW. EACH PLAYER PICKS AUTO OR D-PAD ZOOM ON THEIR CARD AT CHAMPION SELECT.",
  },
  {
    key: "kbm",
    label: "KEYBOARD + MOUSE",
    values: [1, 0],
    fmt: onOff,
    blurb: "OFF: KEYS AND MOUSE NEVER TAKE A SEAT. CLICK HERE TO TURN BACK ON.",
  },
  {
    key: "renderScale",
    label: "3D RESOLUTION",
    // Recomputed each time: the window may have been resized or gone fullscreen since.
    get values() {
      return renderHeights();
    },
    fmt: (v) => (v === 0 || v > nativeHeight() ? `NATIVE ${nativeHeight()}P` : `${v}P`),
    blurb:
      "HEIGHT THE 3D VIEW IS DRAWN AT (FULL SCREEN). LOWER IT FOR WEAK OR BUILT-IN GRAPHICS. MENUS AND HUD STAY SHARP.",
  },
  {
    key: "effects",
    label: "EFFECTS",
    values: [1, 0],
    fmt: (v) => (v ? "FULL" : "REDUCED"),
    blurb: "REDUCED: FEWER SPARKS AND SMOKE. FOR WEAK OR BUILT-IN GRAPHICS.",
  },
  {
    key: "fps",
    label: "FPS COUNTER",
    values: [1, 0],
    fmt: onOff,
    blurb: "FRAMES PER SECOND IN THE BOTTOM-RIGHT CORNER.",
  },
  { key: "hints", label: "BUTTON HINTS", values: [1, 0], fmt: onOff, blurb: "SHOW BUILD HINTS ABOVE PADS." },
];

export const DEFAULT_RULES: Rules = {
  minutes: 6,
  sudden: 60,
  popCap: 16,
  startGold: 200,
  goldRate: 1,
  troops: 1,
  respawn: 6,
  mercy: 1,
  partners: 1,
  pausing: 1,
  killLimit: 20,
};
export const DEFAULT_OPTIONS: Options = {
  music: 7,
  sound: 8,
  shake: 1,
  hints: 1,
  split: 1,
  kbm: 1,
  fps: 1,
  renderScale: 0,
  effects: 1,
};

const KEY = "grudge.save.v1";
const MAX_LOG = 30;
export const MAX_TAG = 8;

function fresh(): SaveData {
  return { v: 1, rules: { ...DEFAULT_RULES }, options: { ...DEFAULT_OPTIONS }, tags: {}, heroes: {}, log: [] };
}

export class Save {
  data: SaveData;

  constructor() {
    let d = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<SaveData>;
        d = { ...d, ...p, rules: { ...DEFAULT_RULES, ...p.rules }, options: { ...DEFAULT_OPTIONS, ...p.options } };
        for (const row of RULE_ROWS)
          if (!row.values.includes(d.rules[row.key])) d.rules[row.key] = DEFAULT_RULES[row.key];
        const tags: Record<string, TagStats> = {};
        for (const [k, t] of Object.entries(d.tags ?? {})) {
          if (t.name) tags[k] = t;
          else tags[newId()] = { ...t, name: k };
        }
        d.tags = tags;
      }
    } catch {
      d = fresh();
    }
    this.data = d;
  }

  write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      return;
    }
  }

  tagIds(): string[] {
    return Object.entries(this.data.tags)
      .sort((a, b) => b[1].last - a[1].last)
      .map(([k]) => k);
  }

  tagNames(): string[] {
    return this.tagIds().map((k) => this.data.tags[k].name);
  }

  findTag(name: string): TagRef | null {
    const n = cleanTag(name);
    const e = Object.entries(this.data.tags).find(([, t]) => t.name === n);
    return e ? { id: e[0], name: n } : null;
  }

  addTag(name: string): TagRef | null {
    const n = cleanTag(name);
    if (!n) return null;
    const ref = this.findTag(n) ?? { id: newId(), name: n };
    this.data.tags[ref.id] ??= { name: n, w: 0, l: 0, d: 0, kills: 0, heroes: {}, last: 0 };
    this.useTag(ref.id);
    return ref;
  }

  useTag(id: string): void {
    const t = this.data.tags[id];
    if (!t) return;
    t.last = Date.now();
    this.write();
  }

  removeTag(id: string): void {
    delete this.data.tags[id];
    this.write();
  }

  record(m: MatchLog, heroKills: number[]): void {
    const res = (team: number): keyof Record3 => (m.winner < 0 ? "d" : m.winner === team ? "w" : "l");
    for (const p of m.players) {
      if (p.cpu) continue;
      const h = (this.data.heroes[p.hero] ??= { picks: 0, w: 0, l: 0, d: 0 });
      h.picks++;
      h[res(p.team)]++;
      const t = p.tagId ? this.data.tags[p.tagId] : undefined;
      if (!t) continue;
      t[res(p.team)]++;
      t.kills += heroKills[p.team] ?? 0;
      t.last = m.at;
      const th = (t.heroes[p.hero] ??= { w: 0, l: 0, d: 0 });
      th[res(p.team)]++;
    }
    this.data.log.unshift(m);
    this.data.log.length = Math.min(this.data.log.length, MAX_LOG);
    this.write();
  }

  clearRecords(): void {
    for (const t of Object.values(this.data.tags)) Object.assign(t, { w: 0, l: 0, d: 0, kills: 0, heroes: {} });
    this.data.heroes = {};
    this.data.log = [];
    this.write();
  }
}

export function cycle<T>(obj: T, row: Row<T>, dir: number): void {
  const cur = obj[row.key] as unknown as number;
  const i = row.values.indexOf(cur);
  const n = row.values.length;
  const next =
    row.values[
      ((i < 0 ? row.values.indexOf(row.values.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a))) : i) +
        dir +
        n) %
        n
    ];
  (obj[row.key] as unknown as number) = next;
}

export function applyRules(base: GameData, r: Rules): GameData {
  const d = structuredClone(base);
  d.match.matchSeconds = r.minutes * 60;
  d.match.suddenDeathSeconds = r.sudden;
  d.units.popCap = r.popCap;
  d.match.economy.start = r.startGold;
  d.match.economy.income = base.match.economy.income * r.goldRate;
  const gr = base.match.economy.grain;
  if (gr)
    d.match.economy.grain = { ...gr, base: gr.base * r.goldRate, perLevel: gr.perLevel.map((v) => v * r.goldRate) };
  d.heroes.baseline.respawnSeconds = r.respawn;
  if (d.match.tdm) {
    d.match.tdm.killLimit = r.killLimit || d.match.tdm.killLimit;
    d.match.tdm.matchSeconds = r.minutes * 60;
  }
  const troops = r.troops || 1;
  d.units.waves.everySeconds = base.units.waves.everySeconds / troops;
  d.units.waves.rateMul = (base.units.waves.rateMul ?? 1) * troops;
  d.units.waves.firstSeconds = base.units.waves.firstSeconds / Math.min(troops, 2);
  if (!r.mercy) {
    d.match.catchUp.incomeBoost = 0;
    d.match.catchUp.productionBoost = 0;
  }
  return d;
}

export function winRate(r: Record3): string {
  const n = r.w + r.l + r.d;
  return n ? `${Math.round((r.w / n) * 100)}%` : "-";
}
