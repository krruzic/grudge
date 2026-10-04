// NetLink: browser WebSocket client for the online relay (tools/netrelay.ts). A client is either the host (owns
// the room, broadcasts to peers) or a peer (talks only to the host). Incoming messages are queued and drained by
// the game loop each frame.
export type NetMsg = { t: string; [k: string]: unknown };

export class NetLink {
  role: "host" | "peer" | null = null;
  id = -1;
  status = "";
  addrs: string[] = [];
  private ws: WebSocket | null = null;
  private inbox: NetMsg[] = [];
  closed = false;

  get open(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && !this.closed;
  }

  private connect(url: string, hello: NetMsg): void {
    this.close();
    this.closed = false;
    this.status = "CONNECTING...";
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onmessage = (e) => {
      try {
        this.inbox.push(JSON.parse(String(e.data)));
      } catch {
        return;
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.closed = true;
      this.inbox.push({ t: "closed" });
    };
    ws.onerror = () => {
      this.status = "COULD NOT REACH THE HOST";
    };
  }

  static url(host?: string): string {
    const target = host || location.host;
    const secure = location.protocol === "https:" && !host;
    return `${secure ? "wss" : "ws"}://${target}/net/ws`;
  }

  host(name: string, address?: string): void {
    this.connect(NetLink.url(address), { t: "host", name });
    this.role = "host";
  }

  join(name: string, address?: string, room?: number): void {
    this.connect(NetLink.url(address), { t: "join", name, room: room ?? null });
    this.role = "peer";
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    this.inbox = [];
    this.role = null;
    this.id = -1;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
  }

  drain(): NetMsg[] {
    const out = this.inbox;
    this.inbox = [];
    return out;
  }

  toPeer(to: number | "all", msg: NetMsg): void {
    if (this.open && this.role === "host") this.ws!.send(JSON.stringify({ t: "send", to, msg }));
  }

  report(res: Record<string, unknown>): void {
    if (this.open && this.role === "host") this.ws!.send(JSON.stringify({ t: "result", res }));
  }

  meta(meta: Record<string, unknown>): void {
    if (this.open && this.role === "host") this.ws!.send(JSON.stringify({ t: "meta", meta }));
  }

  toHost(msg: NetMsg): void {
    if (this.open && this.role === "peer") this.ws!.send(JSON.stringify({ t: "up", msg }));
  }
}
