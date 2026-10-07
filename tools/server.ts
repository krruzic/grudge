// Standalone production server (npm run serve): serves the built game from STATIC_DIR (default ./release) on PORT
// and hosts the online relay (tools/netrelay.ts).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { NetRelay } from "./netrelay.ts";

const ROOT = resolve(process.env.STATIC_DIR ?? "release");
const PORT = Number(process.env.PORT ?? 80);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function resolveFile(urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const file = normalize(join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) return null;
  try {
    const st = statSync(file);
    if (st.isFile()) return file;
    if (st.isDirectory()) return resolveFile(rel + "/");
  } catch {
    return null;
  }
  return null;
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const file = resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  const hashed = file.startsWith(join(ROOT, "assets") + sep);
  // Precompressed copies from tools/precompress.ts (.br / .gz next to the file), when the browser takes them.
  const accept = String(req.headers["accept-encoding"] ?? "");
  let body = file;
  let encoding: string | undefined;
  for (const [enc, ext] of [
    ["br", ".br"],
    ["gzip", ".gz"],
  ] as const) {
    if (!accept.includes(enc)) continue;
    try {
      if (statSync(file + ext).isFile()) {
        body = file + ext;
        encoding = enc;
        break;
      }
    } catch {
      // no precompressed copy
    }
  }
  const st = statSync(body);
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": st.size,
    ...(encoding ? { "Content-Encoding": encoding } : {}),
    Vary: "Accept-Encoding",
    "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    "Last-Modified": st.mtime.toUTCString(),
    "X-Content-Type-Options": "nosniff",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(body)
    .on("error", () => res.destroy())
    .pipe(res);
}

const relay = new NetRelay();
const server = createServer((req, res) => {
  if (!relay.route(req, res)) serveStatic(req, res);
});
relay.attach(server);
server.on("upgrade", (req, socket) => {
  if (!req.url?.startsWith("/net/ws")) socket.destroy();
});
server.listen(PORT, () => console.log(`grudge serving ${ROOT} on :${PORT}`));

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
