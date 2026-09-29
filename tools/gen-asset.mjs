#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY missing (.env)");

const args = process.argv.slice(2);
const name = args[0];
const desc = args[1];
if (!name || !desc) {
  console.error('usage: node tools/gen-asset.mjs <name> "<description>" [--faces 900] [--skip-3d]');
  process.exit(1);
}
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const faces = Number(opt("faces", "1500"));
const model3d = opt("model", "tripo3d/p1/image-to-3d");
const only3d = args.includes("--only-3d");
const skip3d = args.includes("--skip-3d");
const out = join(root, "assets", "generated", name);
mkdirSync(out, { recursive: true });

const STYLE =
  "Nintendo 64 era low-poly 3D game character (like Banjo-Kazooie, Ocarina of Time, Majora's Mask): " +
  "chunky readable silhouette, oversized head, hands and weapon, flat faceted polygons, few hundred triangles.";
const ISOLATE =
  "Only the character by itself, fully in frame head to toe, centered. Pure flat white background (#FFFFFF). " +
  "No shadows, no drop shadow, no ground, no floor, no platform, no pedestal, no base, no stand, no scenery, " +
  "no props apart from what the character holds, no text, no labels, no numbers, no watermark, no border, no UI.";

async function falRun(model, input) {
  const sub = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!sub.ok) throw new Error(`${model} submit ${sub.status}: ${await sub.text()}`);
  const { status_url, response_url, request_id } = await sub.json();
  process.stdout.write(`${model} ${request_id} `);
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await (await fetch(status_url, { headers: { Authorization: `Key ${KEY}` } })).json();
    process.stdout.write(".");
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`${model} status ${JSON.stringify(st)}`);
  }
  const res = await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`${model} result ${res.status}: ${JSON.stringify(data)}`);
  console.log(" done");
  return data;
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${url} ${r.status}`);
  writeFileSync(join(out, file), Buffer.from(await r.arrayBuffer()));
  return join(out, file);
}

const metaPath = join(out, "meta.json");
const meta = only3d || args.includes("--redo-front") ? JSON.parse(readFileSync(metaPath, "utf8")) : { name, desc, created: new Date().toISOString() };
meta.faces = faces;
meta.model3d = model3d;

const sheetPrompt =
  `Character turnaround model sheet of ${desc}. ${STYLE} ` +
  "Show the SAME character four times side by side in one row, evenly spaced, same scale, same neutral A-pose: " +
  "front view, three-quarter view, side view, back view. " +
  "Untextured grey clay 3D render: uniform matte light grey material everywhere, no colours, no textures, no painted details, " +
  "soft even studio lighting so every polygon facet is readable. " +
  ISOLATE;
const onlyFront = args.includes("--redo-front");
if (!only3d) {
if (!onlyFront) {
const sheet = await falRun("fal-ai/nano-banana-pro", { prompt: sheetPrompt, aspect_ratio: "21:9", resolution: "2K", output_format: "png" });
meta.sheet = sheet.images[0].url;
await download(meta.sheet, "sheet.png");
}

const frontPrompt =
  "Render the exact same character from this turnaround sheet as ONE single image: three-quarter front view, neutral A-pose, " +
  `full colour, matching this description exactly: ${desc}. ${STYLE} Colours are flat and saturated like N64 vertex colours and small low-resolution painted textures; ` +
  "Fully painted: skin, metal, cloth and leather each get their own natural colour; nothing may stay grey clay. " +
  "Flat even lighting with no strong highlights and no baked shading. Keep the proportions, gear and silhouette identical to the sheet. " +
  ISOLATE;
const front = await falRun("fal-ai/nano-banana-pro/edit", {
  prompt: frontPrompt,
  image_urls: [meta.sheet],
  aspect_ratio: "1:1",
  resolution: "2K",
  output_format: "png",
});
meta.front = front.images[0].url;
await download(meta.front, "front.png");
}

if (!skip3d) {
  const input = model3d.includes("/p1/")
    ? { image_url: meta.front, face_limit: faces, texture: true }
    : { image_url: meta.front, face_limit: faces, texture: true, pbr: false };
  if (opt("seed")) input.model_seed = Number(opt("seed"));
  const model = await falRun(model3d, input);
  meta.tripo = model;
  const mesh = model.model_mesh?.url ?? model.model_urls?.glb?.url ?? model.model_urls?.pbr_model?.url;
  if (mesh) await download(mesh, "model.glb");
  const render = model.rendered_image?.url;
  if (render) await download(render, `render.${render.split(".").pop().split("?")[0]}`);
}
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`wrote ${out}`);
