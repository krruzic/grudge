import { networkInterfaces } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const URL_FILE = join(process.cwd(), ".online-url");

export function publicUrl(): string {
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

export class NetRelay {
  private wss = new WebSocketServer({ noServer: true });
  private host: Peer | null = null;
  private peers = new Map<number, Peer>();
  private nextId = 1;
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
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ hosting: !!this.host, players: this.peers.size, addrs: lanAddresses(port), public: publicUrl() }));
  }

  private send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private accept(ws: WebSocket, port: number): void {
    let me: Peer | null = null;
    let role: "host" | "peer" | null = null;
    ws.on("message", (raw) => {
      let m: { t: string; [k: string]: unknown };
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!role && m.t === "host") {
        if (this.host) return this.send(ws, { t: "error", msg: "SOMEONE IS ALREADY HOSTING" });
        role = "host";
        me = { ws, id: 0, name: String(m.name ?? "HOST") };
        this.host = me;
        return this.send(ws, { t: "hosting", addrs: lanAddresses(port), public: publicUrl() });
      }
      if (!role && m.t === "join") {
        if (!this.host) return this.send(ws, { t: "error", msg: "NOBODY IS HOSTING YET" });
        role = "peer";
        me = { ws, id: this.nextId++, name: String(m.name ?? "GUEST").slice(0, 12) };
        this.peers.set(me.id, me);
        this.send(ws, { t: "welcome", id: me.id });
        return this.send(this.host.ws, { t: "joined", id: me.id, name: me.name });
      }
      if (role === "host" && m.t === "send") {
        const text = JSON.stringify(m.msg);
        if (m.to === "all") {
          for (const p of this.peers.values()) if (p.ws.readyState === p.ws.OPEN) p.ws.send(text);
        } else {
          const p = this.peers.get(Number(m.to));
          if (p && p.ws.readyState === p.ws.OPEN) p.ws.send(text);
        }
        return;
      }
      if (role === "host" && m.t === "kick") {
        this.peers.get(Number(m.id))?.ws.close();
        return;
      }
      if (role === "peer" && m.t === "up" && this.host && me) {
        return this.send(this.host.ws, { t: "from", id: me.id, msg: m.msg });
      }
    });
    ws.on("close", () => {
      if (role === "host" && this.host === me) {
        this.host = null;
        for (const p of this.peers.values()) {
          this.send(p.ws, { t: "hostgone" });
          p.ws.close();
        }
        this.peers.clear();
      } else if (role === "peer" && me) {
        this.peers.delete(me.id);
        if (this.host) this.send(this.host.ws, { t: "left", id: me.id });
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
