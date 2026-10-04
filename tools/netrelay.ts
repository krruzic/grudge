// Network relay for online play (WebSocket at /net/ws plus /net/info and /net/stats HTTP endpoints). Used by the
// Vite dev/preview servers (netRelayPlugin) and by the standalone static server (tools/server.ts). Lockstep game
// logic lives in the clients (src/net, src/main.ts); the relay only routes messages between host and peers.
import { networkInterfaces } from "node:os";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

const URL_FILE = join(process.cwd(), ".online-url");

/** Public URL to advertise (PUBLIC_URL env or the .online-url file written by tools/online.mjs). */
export function publicUrl(): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  try {
    return existsSync(URL_FILE) ? readFileSync(URL_FILE, "utf8").trim() : "";
  } catch {
    return "";
  }
}

interface Peer {
  ws: WebSocket;
  id: number;
  name: string;
}

/** host:port for each LAN IPv4 interface (skipping Docker bridge ranges). */
export function lanAddresses(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== "IPv4" || a.internal || /^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) continue;
      out.push(`${a.address}:${port}`);
    }
  }
  return out;
}

export interface RoomMeta {
  name: string;
  mode: string;
  map: string;
  humans: number;
  seats: number;
  phase: string;
}

interface Room {
  id: number;
  host: Peer;
  peers: Map<number, Peer>;
  meta: RoomMeta;
  created: number;
  reported: number;
}

type Rec = { w: number; l: number; d: number };
interface TagRecord extends Rec {
  name: string;
  kills: number;
  heroes: Record<string, Rec>;
  first: number;
  last: number;
}
interface MatchRecord {
  at: number;
  mode: string;
  map: string;
  winner: number;
  secs: number;
  players: { id: string | null; name: string; hero: string; team: number }[];
}
interface StatsFile {
  tags: Record<string, TagRecord>;
  matches: MatchRecord[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const word = (v: unknown, n: number) =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, n);
const int = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

/** Persistent match-result counters (JSON file), served at /net/stats. */
export class StatsStore {
  private data: StatsFile = { tags: {}, matches: [] };
  private timer: ReturnType<typeof setTimeout> | null = null;

  private file: string;

  constructor(file = process.env.STATS_FILE ?? join(process.cwd(), ".grudge-stats.json")) {
    this.file = file;
    try {
      if (existsSync(file)) this.data = { tags: {}, matches: [], ...JSON.parse(readFileSync(file, "utf8")) };
    } catch {
      this.data = { tags: {}, matches: [] };
    }
  }

  record(raw: unknown): boolean {
    const r = (raw ?? {}) as Record<string, unknown>;
    const list = Array.isArray(r.players) ? r.players.slice(0, 8) : [];
    const winner = int(r.winner, -1, 7);
    const players = list.map((q) => {
      const p = (q ?? {}) as Record<string, unknown>;
      const id = typeof p.id === "string" && UUID.test(p.id) ? p.id : null;
      return {
        id,
        name: word(p.name, 6),
        hero: String(p.hero ?? "")
          .replace(/[^a-z0-9_-]/gi, "")
          .slice(0, 24),
        team: int(p.team, 0, 7),
        cpu: !!p.cpu,
        kills: int(p.kills, 0, 999),
      };
    });
    const humans = players.filter((p) => !p.cpu);
    if (new Set(humans.map((p) => p.team)).size < 2) return false;
    if (winner >= 0 && !humans.some((p) => p.team === winner)) return false;
    if (new Set(humans.filter((p) => p.id).map((p) => p.id)).size !== humans.filter((p) => p.id).length) return false;
    const at = Date.now();
    const res = (t: number): keyof Rec => (winner < 0 ? "d" : winner === t ? "w" : "l");
    for (const p of humans) {
      if (!p.id || !p.name) continue;
      const t = (this.data.tags[p.id] ??= {
        name: p.name,
        w: 0,
        l: 0,
        d: 0,
        kills: 0,
        heroes: {},
        first: at,
        last: at,
      });
      t.name = p.name;
      t.last = at;
      t[res(p.team)]++;
      t.kills += p.kills;
      if (p.hero) (t.heroes[p.hero] ??= { w: 0, l: 0, d: 0 })[res(p.team)]++;
    }
    this.data.matches.unshift({
      at,
      mode: word(r.mode, 4),
      map: String(r.map ?? "")
        .replace(/[^a-z0-9_-]/gi, "")
        .slice(0, 24),
      winner,
      secs: int(r.secs, 0, 7200),
      players: players.map((p) => ({
        id: p.cpu ? null : p.id,
        name: p.cpu ? "CPU" : p.name,
        hero: p.hero,
        team: p.team,
      })),
    });
    this.data.matches.length = Math.min(this.data.matches.length, 500);
    this.save();
    return true;
  }

  private save(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        writeFileSync(this.file + ".tmp", JSON.stringify(this.data));
        renameSync(this.file + ".tmp", this.file);
      } catch {
        return;
      }
    }, 1000);
  }

  serve(req: IncomingMessage, res: ServerResponse): void {
    const id = new URL(req.url ?? "/", "http://x").searchParams.get("id");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (id) {
      const t = this.data.tags[id];
      res.statusCode = t ? 200 : 404;
      res.end(JSON.stringify(t ? { id, ...t } : { error: "unknown" }));
      return;
    }
    const top = Object.values(this.data.tags)
      .sort((a, b) => b.w - a.w || a.l - b.l)
      .slice(0, 50)
      .map((t) => ({ name: t.name, w: t.w, l: t.l, d: t.d, kills: t.kills }));
    res.end(
      JSON.stringify({
        top,
        matches: this.data.matches
          .slice(0, 20)
          .map((m) => ({ ...m, players: m.players.map((p) => ({ name: p.name, hero: p.hero, team: p.team })) })),
      }),
    );
  }
}

const MAX_ROOMS = 32;

/**
 * Room relay. A host opens a room; peers join it. The relay never runs the game: peer messages ("up") are
 * forwarded to the host, host messages ("send") to one or all peers, and room meta is kept for the lobby list.
 */
export class NetRelay {
  private wss = new WebSocketServer({ noServer: true });
  private rooms = new Map<number, Room>();
  private nextId = 1;
  private nextRoom = 1;
  port = 0;
  stats = new StatsStore();

  constructor() {
    this.wss.on("connection", (ws, req: IncomingMessage) =>
      this.accept(ws, Number((req.headers.host ?? "").split(":")[1] ?? 0) || this.port),
    );
  }

  attach(server: Server | null | undefined): void {
    if (!server) return;
    server.on("listening", () => {
      const a = server.address();
      if (a && typeof a === "object") this.port = a.port;
    });
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!req.url?.startsWith("/net/ws")) return;
      this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit("connection", ws, req));
    });
  }

  route(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.url?.startsWith("/net/info")) this.info(req, res);
    else if (req.url?.startsWith("/net/stats") && req.method === "GET") this.stats.serve(req, res);
    else return false;
    return true;
  }

  info(req: IncomingMessage, res: ServerResponse): void {
    const port = this.port || Number((req.headers.host ?? "").split(":")[1] ?? 0);
    const rooms = [...this.rooms.values()].map((r) => ({
      id: r.id,
      ...r.meta,
      peers: r.peers.size,
      age: Math.round((Date.now() - r.created) / 1000),
    }));
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(
      JSON.stringify({
        hosting: rooms.length > 0,
        players: rooms.reduce((n, r) => n + r.peers, 0),
        rooms,
        addrs: lanAddresses(port),
        public: publicUrl(),
      }),
    );
  }

  private send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private openRoom(): Room | undefined {
    return [...this.rooms.values()].find((r) => r.meta.phase === "lobby" && r.meta.humans < r.meta.seats);
  }

  private accept(ws: WebSocket, port: number): void {
    let me: Peer | null = null;
    let role: "host" | "peer" | null = null;
    let room: Room | null = null;
    ws.on("message", (raw) => {
      let m: { t: string; [k: string]: unknown };
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!role && m.t === "host") {
        if (this.rooms.size >= MAX_ROOMS)
          return this.send(ws, { t: "error", msg: "THE SERVER IS FULL OF BATTLES · TRY LATER" });
        role = "host";
        me = { ws, id: 0, name: String(m.name ?? "HOST").slice(0, 12) };
        room = {
          id: this.nextRoom++,
          host: me,
          peers: new Map(),
          created: Date.now(),
          reported: 0,
          meta: {
            name: `${me.name.toUpperCase()}'S BATTLE`,
            mode: "1 VS 1",
            map: "",
            humans: 1,
            seats: 4,
            phase: "lobby",
          },
        };
        this.rooms.set(room.id, room);
        return this.send(ws, { t: "hosting", room: room.id, addrs: lanAddresses(port), public: publicUrl() });
      }
      if (!role && m.t === "join") {
        const want =
          m.room !== undefined && m.room !== null
            ? this.rooms.get(Number(m.room))
            : (this.openRoom() ?? [...this.rooms.values()][0]);
        if (!want) return this.send(ws, { t: "error", msg: m.room ? "THAT BATTLE IS OVER" : "NOBODY IS HOSTING YET" });
        role = "peer";
        room = want;
        me = { ws, id: this.nextId++, name: String(m.name ?? "GUEST").slice(0, 12) };
        room.peers.set(me.id, me);
        this.send(ws, { t: "welcome", id: me.id, room: room.id, name: room.meta.name });
        return this.send(room.host.ws, { t: "joined", id: me.id, name: me.name });
      }
      if (!room) return;
      if (role === "host" && m.t === "meta") {
        const v = (m.meta ?? {}) as Partial<RoomMeta>;
        room.meta = {
          name: String(v.name ?? room.meta.name).slice(0, 24),
          mode: String(v.mode ?? room.meta.mode).slice(0, 12),
          map: String(v.map ?? room.meta.map).slice(0, 32),
          humans: Math.max(0, Math.min(8, Number(v.humans ?? room.meta.humans))),
          seats: Math.max(1, Math.min(8, Number(v.seats ?? room.meta.seats))),
          phase: v.phase === "match" ? "match" : "lobby",
        };
        return;
      }
      if (role === "host" && m.t === "send") {
        const text = JSON.stringify(m.msg);
        if (m.to === "all") {
          for (const p of room.peers.values()) if (p.ws.readyState === p.ws.OPEN) p.ws.send(text);
        } else {
          const p = room.peers.get(Number(m.to));
          if (p && p.ws.readyState === p.ws.OPEN) p.ws.send(text);
        }
        return;
      }
      if (role === "host" && m.t === "result") {
        if (room.peers.size === 0 || Date.now() - room.reported < 60000) return;
        if (this.stats.record(m.res)) room.reported = Date.now();
        return;
      }
      if (role === "host" && m.t === "kick") {
        room.peers.get(Number(m.id))?.ws.close();
        return;
      }
      if (role === "peer" && m.t === "up" && me) {
        return this.send(room.host.ws, { t: "from", id: me.id, msg: m.msg });
      }
    });
    ws.on("close", () => {
      if (!room) return;
      if (role === "host" && room.host === me) {
        this.rooms.delete(room.id);
        for (const p of room.peers.values()) {
          this.send(p.ws, { t: "hostgone" });
          p.ws.close();
        }
        room.peers.clear();
      } else if (role === "peer" && me) {
        room.peers.delete(me.id);
        this.send(room.host.ws, { t: "left", id: me.id });
      }
    });
  }
}

/** Vite plugin mounting the relay on the dev/preview server. */
export function netRelayPlugin() {
  const relay = new NetRelay();
  const route = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!relay.route(req, res)) next();
  };
  return {
    name: "grudge-net-relay",
    configureServer(server: { httpServer: Server | null; middlewares: { use: (fn: typeof route) => void } }) {
      relay.attach(server.httpServer);
      server.middlewares.use(route);
    },
    configurePreviewServer(server: { httpServer: Server; middlewares: { use: (fn: typeof route) => void } }) {
      relay.attach(server.httpServer);
      server.middlewares.use(route);
    },
  };
}
