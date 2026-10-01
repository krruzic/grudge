import { networkInterfaces } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const URL_FILE = join(process.cwd(), ".online-url");

export function publicUrl(): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  try {
    return existsSync(URL_FILE) ? readFileSync(URL_FILE, "utf8").trim() : "";
  } catch {
    return "";
  }
}
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";

interface Peer {
  ws: WebSocket;
  id: number;
  name: string;
}


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
}

const MAX_ROOMS = 32;

export class NetRelay {
  private wss = new WebSocketServer({ noServer: true });
  private rooms = new Map<number, Room>();
  private nextId = 1;
  private nextRoom = 1;
  port = 0;

  constructor() {
    this.wss.on("connection", (ws, req: IncomingMessage) => this.accept(ws, Number((req.headers.host ?? "").split(":")[1] ?? 0) || this.port));
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

  info(req: IncomingMessage, res: ServerResponse): void {
    const port = this.port || Number((req.headers.host ?? "").split(":")[1] ?? 0);
    const rooms = [...this.rooms.values()].map((r) => ({ id: r.id, ...r.meta, peers: r.peers.size, age: Math.round((Date.now() - r.created) / 1000) }));
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ hosting: rooms.length > 0, players: rooms.reduce((n, r) => n + r.peers, 0), rooms, addrs: lanAddresses(port), public: publicUrl() }));
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
        if (this.rooms.size >= MAX_ROOMS) return this.send(ws, { t: "error", msg: "THE SERVER IS FULL OF BATTLES · TRY LATER" });
        role = "host";
        me = { ws, id: 0, name: String(m.name ?? "HOST").slice(0, 12) };
        room = { id: this.nextRoom++, host: me, peers: new Map(), created: Date.now(), meta: { name: `${me.name.toUpperCase()}'S BATTLE`, mode: "1 VS 1", map: "", humans: 1, seats: 4, phase: "lobby" } };
        this.rooms.set(room.id, room);
        return this.send(ws, { t: "hosting", room: room.id, addrs: lanAddresses(port), public: publicUrl() });
      }
      if (!role && m.t === "join") {
        const want = m.room !== undefined && m.room !== null ? this.rooms.get(Number(m.room)) : this.openRoom() ?? [...this.rooms.values()][0];
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

export function netRelayPlugin() {
  const relay = new NetRelay();
  const route = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.startsWith("/net/info")) relay.info(req, res);
    else next();
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
