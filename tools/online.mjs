#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 5200);
const urlFile = join(root, ".online-url");
const kids = [];
const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;

const cleanup = () => {
  rmSync(urlFile, { force: true });
  for (const k of kids) k.kill("SIGTERM");
};
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

const tunnelBin = process.env.TUNNEL ?? (has("cloudflared") ? "cloudflared" : has("ngrok") ? "ngrok" : "");
if (!tunnelBin) {
  console.error("Needs cloudflared (pacman -S cloudflared) or ngrok for a public address.");
  process.exit(1);
}

console.log("Building the game...");
const build = spawnSync("npx", ["vite", "build", "--outDir", "release", "--emptyOutDir", "--logLevel", "warn"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);

rmSync(urlFile, { force: true });
const server = spawn("npx", ["vite", "preview", "--outDir", "release", "--port", String(PORT), "--strictPort", "--host"], { cwd: root, stdio: ["ignore", "inherit", "inherit"] });
kids.push(server);

const announce = (url) => {
  writeFileSync(urlFile, url);
  const line = "=".repeat(64);
  console.log(`\n${line}\n  GRUDGE IS ONLINE\n\n  You:      http://localhost:${PORT}  > VERSUS ONLINE > HOST A BATTLE\n  Friends:  ${url}  > VERSUS ONLINE > JOIN A BATTLE\n\n  Keep this window open. Ctrl+C stops it.\n${line}\n`);
};

if (tunnelBin === "cloudflared") {
  const t = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { cwd: root });
  kids.push(t);
  let found = false;
  const scan = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !found) {
      found = true;
      announce(m[0]);
    }
  };
  t.stdout.on("data", scan);
  t.stderr.on("data", scan);
  t.on("exit", (c) => { console.error(`cloudflared stopped (${c})`); process.exit(1); });
} else {
  const t = spawn("ngrok", ["http", String(PORT), "--log", "stdout", "--log-format", "json"], { cwd: root });
  kids.push(t);
  let found = false;
  t.stdout.on("data", (buf) => {
    for (const line of String(buf).split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line);
        if (j.url && String(j.url).startsWith("https://") && !found) {
          found = true;
          announce(j.url);
        }
        if (j.lvl === "eror" || j.err) console.error("ngrok:", j.msg ?? "", j.err ?? "");
      } catch {
        continue;
      }
    }
  });
  t.on("exit", (c) => { console.error(`ngrok stopped (${c})`); process.exit(1); });
}
