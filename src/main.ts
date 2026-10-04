// Browser entry point. Loads every asset, builds the App (src/app/app.ts), picks the first screen from the URL,
// installs the debug API and starts the frame loop; the #boot overlay fades out after the first frame.
//
//   src/app/    client controllers: state machine, select / lobby / match / net glue, frame loop, codex demos
//   src/sim/    deterministic simulation (World)          src/render/  three.js views of a World
//   src/ui/     2D UI canvas: HUD, screens, menus          src/input/   pads, keyboard, GC adapter -> Commands
//   src/net/    lockstep transport and wire helpers        src/audio/   sfx and music
// See docs/architecture.md for how they fit together.
import { App } from "./app/app";
import { loadAssets } from "./app/assets";
import { installDebugApi, startFromUrl } from "./app/debug";
import { startLoop } from "./app/loop";
import { installKeyboardNaming } from "./app/select";

function endBoot(): void {
  const el = document.getElementById("boot");
  if (!el) return;
  el.classList.add("gone");
  setTimeout(() => el.classList.add("out"), 450);
  setTimeout(() => el.remove(), 950);
}

async function start(): Promise<void> {
  const app = new App(await loadAssets());
  app.rehearse();
  installKeyboardNaming(app);
  startFromUrl(app);
  installDebugApi(app);
  startLoop(app, endBoot);
}

start();
