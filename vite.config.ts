import { defineConfig } from "vite";
import { netRelayPlugin } from "./tools/netrelay.ts";

const d = new Date();
const p2 = (n: number) => String(n).padStart(2, "0");
const BUILD = `${String(d.getUTCFullYear()).slice(2)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}.${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [netRelayPlugin()],
  server: { host: true },
  preview: { host: true, allowedHosts: [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app", ".ngrok.io", ".trycloudflare.com"] },
});
