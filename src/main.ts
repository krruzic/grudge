// Browser entry point. Loads every asset, builds the App (src/app/app.ts), picks the first screen from the URL,
// installs the debug API and starts the frame loop; the #boot overlay fades out after the first frame.
//
//   src/app/    client controllers: state machine, select / lobby / match / net glue, frame loop, codex demos
//   src/sim/    deterministic simulation (World)          src/render/  three.js views of a World
//   src/ui/     2D UI canvas: HUD, screens, menus          src/input/   pads, keyboard, GC adapter -> Commands
//   src/net/    lockstep transport and wire helpers        src/audio/   sfx and music
// See docs/architecture.md for how they fit together.
import * as THREE from "three";
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

/** NOW LOADING fills left to right with progress (never goes backwards). */
let shown = 0;
function progress(f: number): void {
  shown = Math.max(shown, Math.min(1, f));
  document.querySelector<HTMLElement>("#boot .now")?.style.setProperty("--p", shown.toFixed(3));
}
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function start(): Promise<void> {
  // Asset files (every three.js loader goes through the default manager) are the first 85%; building the game
  // and its warm-up rehearsal the rest.
  // The file count grows while loading (models pull in textures), so measure against last boot's final count.
  const KEY = "grudge.bootFiles";
  const expect = Number(localStorage.getItem(KEY)) || 600;
  let files = 0;
  THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => {
    files = total;
    progress((loaded / Math.max(expect, total)) * 0.85);
  };
  const assets = await loadAssets();
  localStorage.setItem(KEY, String(files));
  progress(0.9);
  await frame();
  const app = new App(assets);
  progress(0.95);
  await frame();
  app.rehearse();
  progress(1);
  installKeyboardNaming(app);
  startFromUrl(app);
  installDebugApi(app);
  startLoop(app, endBoot);
}

start();
