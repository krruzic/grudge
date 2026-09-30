import type { GameData } from "../sim/config";

export interface Rules {
  minutes: number;
  sudden: number;
  popCap: number;
  startGold: number;
  goldRate: number;
  respawn: number;
  mercy: number;
  partners: number;
}

export interface Options {
  music: number;
  sound: number;
  shake: number;
  hints: number;
  split: number;
}

export interface Record3 {
  w: number;
  l: number;
  d: number;
}

export interface TagStats extends Record3 {
  kills: number;
  heroes: Record<string, Record3>;
  last: number;
}

export interface HeroStats extends Record3 {
  picks: number;
}

export interface MatchLog {
  at: number;
  mode: string;
  map: string;
  winner: number;
  secs: number;
  players: { tag: string | null; hero: string; team: number; cpu: boolean }[];
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

export const CAMERA_NAMES = ["SHARED VIEW", "SPLIT · AUTO ZOOM", "SPLIT · D-PAD ZOOM"];

export const RULE_ROWS: Row<Rules>[] = [
  { key: "minutes", label: "MATCH LENGTH", values: [3, 4, 6, 8, 10, 15], fmt: (v) => `${v} MIN`, blurb: "TIME BEFORE THE BELL TOLLS." },
  { key: "sudden", label: "SUDDEN DEATH", values: [0, 30, 60, 120], fmt: (v) => (v ? `${v} SEC` : "NONE"), blurb: "EXTRA TIME WHERE ALL IS CHEAPER AND DEADLIER." },
  { key: "popCap", label: "SOLDIER CAP", values: [8, 12, 16, 20, 24], fmt: String, blurb: "MOST SOLDIERS ONE HOUSE MAY FIELD." },
  { key: "startGold", label: "STARTING GOLD", values: [0, 100, 200, 400, 800], fmt: String, blurb: "GOLD IN THE COFFERS AT THE FIRST HORN." },
  { key: "goldRate", label: "GOLD RATE", values: [0.5, 0.75, 1, 1.5, 2, 3], fmt: (v) => `X ${v}`, blurb: "HOW FAST THE COFFERS FILL." },
  { key: "respawn", label: "HERO RETURNS", values: [3, 6, 10, 15], fmt: (v) => `${v} SEC`, blurb: "HOW LONG A FALLEN CHAMPION STAYS DOWN." },
  { key: "partners", label: "2 VS 2 ALLIES", values: [1, 0], fmt: (v) => (v ? "CHAMPIONS" : "COMMANDERS"), blurb: "IN 2 VS 2, PLAYERS 3 AND 4 FIGHT AS CHAMPIONS OR LEAD AS COMMANDERS." },
  { key: "mercy", label: "MERCY", values: [1, 0], fmt: onOff, blurb: "THE LOSING HOUSE EARNS AND BUILDS FASTER." },
];

export const OPTION_ROWS: Row<Options>[] = [
  { key: "music", label: "MUSIC", values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fmt: String, blurb: "LOUDNESS OF THE MINSTRELS." },
  { key: "sound", label: "SOUND", values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], fmt: String, blurb: "LOUDNESS OF STEEL AND SPELLS." },
  { key: "shake", label: "SCREEN SHAKE", values: [1, 0], fmt: onOff, blurb: "THE GROUND TREMBLES WHEN BLOWS LAND." },
  { key: "split", label: "CAMERA", values: [1, 2, 0], fmt: (v) => CAMERA_NAMES[v], blurb: "SPLIT: EACH PLAYER GETS A VIEW. AUTO ZOOM FOLLOWS THE FIGHT; D-PAD ZOOM USES LEFT/RIGHT." },
  { key: "hints", label: "BUTTON HINTS", values: [1, 0], fmt: onOff, blurb: "SHOW BUILD HINTS ABOVE PADS." },
];

export const DEFAULT_RULES: Rules = { minutes: 6, sudden: 60, popCap: 16, startGold: 200, goldRate: 1, respawn: 6, mercy: 1, partners: 1 };
export const DEFAULT_OPTIONS: Options = { music: 7, sound: 8, shake: 1, hints: 1, split: 1 };

const KEY = "grudge.save.v1";
const MAX_LOG = 30;
export const MAX_TAG = 6;

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
        for (const row of RULE_ROWS) if (!row.values.includes(d.rules[row.key])) d.rules[row.key] = DEFAULT_RULES[row.key];
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

  tagNames(): string[] {
    return Object.entries(this.data.tags).sort((a, b) => b[1].last - a[1].last).map(([k]) => k);
  }

  addTag(name: string): string {
    const n = name.trim().toUpperCase().slice(0, MAX_TAG);
    if (!n) return n;
    if (!this.data.tags[n]) this.data.tags[n] = { w: 0, l: 0, d: 0, kills: 0, heroes: {}, last: Date.now() };
    this.data.tags[n].last = Date.now();
    this.write();
    return n;
  }

  removeTag(name: string): void {
    delete this.data.tags[name];
    this.write();
  }

  record(m: MatchLog, heroKills: number[]): void {
    const res = (team: number): keyof Record3 => (m.winner < 0 ? "d" : m.winner === team ? "w" : "l");
    for (const p of m.players) {
      const h = (this.data.heroes[p.hero] ??= { picks: 0, w: 0, l: 0, d: 0 });
      h.picks++;
      h[res(p.team)]++;
      if (!p.tag || p.cpu) continue;
      const t = (this.data.tags[p.tag] ??= { w: 0, l: 0, d: 0, kills: 0, heroes: {}, last: 0 });
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
  const next = row.values[((i < 0 ? row.values.indexOf(row.values.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a))) : i) + dir + n) % n];
  (obj[row.key] as unknown as number) = next;
}

export function applyRules(base: GameData, r: Rules): GameData {
  const d = structuredClone(base);
  d.match.matchSeconds = r.minutes * 60;
  d.match.suddenDeathSeconds = r.sudden;
  d.units.popCap = r.popCap;
  d.match.economy.start = r.startGold;
  d.match.economy.income = base.match.economy.income * r.goldRate;
  d.heroes.baseline.respawnSeconds = r.respawn;
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
