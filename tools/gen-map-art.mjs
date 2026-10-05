#!/usr/bin/env node
// Map art through fal: painted sheets (ground textures / props) in the game's style from reference images, and
// Tripo 3D models of single props.
//
//   node tools/gen-map-art.mjs sheet <out.png> <prompt.txt> <ref.png> [<ref.png> ...] [--aspect 3:2]
//   node tools/gen-map-art.mjs tripo <prop.png> <out.glb> [--faces 1500]
//
// Sheets are cut up afterwards (textures -> assets/textures/<palette>_*.png, props -> one image each) and props go
// through Tripo into assets/source/map_<name>_tripo.glb for tools/blender/build_map.py.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

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
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const pos = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));

const dataUri = (file) => {
  const ext = extname(file).slice(1).toLowerCase();
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
};

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
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`${model} ${JSON.stringify(st)}`);
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
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log("wrote", file);
}

const [cmd, ...rest] = pos;
if (cmd === "sheet") {
  const [out, promptFile, ...refs] = rest;
  const r = await falRun("fal-ai/nano-banana-pro/edit", {
    prompt: readFileSync(promptFile, "utf8"),
    image_urls: refs.map(dataUri),
    aspect_ratio: opt("aspect", "3:2"),
    resolution: "2K",
    output_format: "png",
  });
  await download(r.images[0].url, out);
} else if (cmd === "tripo") {
  const [img, out] = rest;
  const r = await falRun("tripo3d/p1/image-to-3d", {
    image_url: dataUri(img),
    face_limit: Number(opt("faces", "1500")),
    texture: true,
  });
  const mesh = r.model_mesh?.url ?? r.model_urls?.glb?.url ?? r.model_urls?.pbr_model?.url;
  if (!mesh) throw new Error(`no mesh in ${JSON.stringify(r).slice(0, 300)}`);
  await download(mesh, out);
  if (r.rendered_image?.url) await download(r.rendered_image.url, out.replace(/\.glb$/, "_preview.png"));
} else {
  console.error("usage: gen-map-art.mjs sheet <out.png> <prompt.txt> <refs...> | tripo <prop.png> <out.glb>");
  process.exit(1);
}
