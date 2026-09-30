import { defineConfig } from "vite";
import { netRelayPlugin } from "./tools/netrelay.ts";

export default defineConfig({
  plugins: [netRelayPlugin()],
  server: { host: true },
  preview: { host: true },
});
