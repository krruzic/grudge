import { defineConfig } from "vite";
import { netRelayPlugin } from "./tools/netrelay.ts";

const BUILD = `${Date.now().toString(36)}`;

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [netRelayPlugin()],
  server: { host: true },
  preview: { host: true, allowedHosts: [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app", ".ngrok.io", ".trycloudflare.com"] },
});
