#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY missing (.env)");

async function falRun(model, input) {
  const sub = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!sub.ok) throw new Error(`${model} submit ${sub.status}: ${await sub.text()}`);
  const { status_url, response_url } = await sub.json();
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await (await fetch(status_url, { headers: { Authorization: `Key ${KEY}` } })).json();
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(`${model} status ${JSON.stringify(st)}`);
  }
  const res = await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`${model} result ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const dataUri = (path, type) => `data:${type};base64,${readFileSync(path).toString("base64")}`;
const [, , step, input, out, promptFile, ...refs] = process.argv;
mkdirSync(dirname(out), { recursive: true });

if (step === "sheet") {
  const prompt = readFileSync(promptFile, "utf8");
  const r = await falRun("fal-ai/nano-banana-pro/edit", { prompt, image_urls: [input, ...refs].map((f) => dataUri(f, "image/jpeg")), aspect_ratio: process.env.ASPECT ?? "16:9", resolution: process.env.RES ?? "2K", output_format: "png" });
  writeFileSync(out, Buffer.from(await (await fetch(r.images[0].url)).arrayBuffer()));
  console.log("sheet", out, r.description ?? "");
} else if (step === "mesh") {
  const r = await falRun("tripo3d/p1/image-to-3d", { image_url: dataUri(input, "image/png"), texture: true, face_limit: Number(process.env.FACES ?? 15000) });
  writeFileSync(out, Buffer.from(await (await fetch(r.model_mesh.url)).arrayBuffer()));
  if (r.rendered_image?.url) writeFileSync(out.replace(/\.glb$/, "_preview.png"), Buffer.from(await (await fetch(r.rendered_image.url)).arrayBuffer()));
  console.log("mesh", out, r.task_id ?? "");
}
