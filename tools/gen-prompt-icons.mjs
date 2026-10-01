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

const out = join(root, "assets", "generated", "talents");
mkdirSync(out, { recursive: true });
const items = [
  ["p_outpost", "a small wooden army hut with a pointed roof and a little cloth pennant on a pole, seen from a three-quarter angle"],
  ["p_tower", "a stout round stone watchtower with a crenellated top and a mounted crossbow, seen from a three-quarter angle"],
  ["p_upgrade", "a golden smithing hammer striking a glowing anvil with a big bright gold upward chevron above it"],
  ["p_shop", "a bulging brown leather coin purse tied with string, spilling shiny gold coins"],
];
const prompt =
  `A sprite sheet of ${items.length} separate game menu icons in a 1998 Nintendo 64 fantasy game. All icons share one consistent palette and painting style, in the style of Legend of Zelda Ocarina of Time item icons and Banjo-Kazooie menu art, ` +
  `laid out in a strict grid of 2 columns and 2 rows with wide empty gaps, each icon centred in its own cell and never touching another. Reading order left to right, top to bottom:\n` +
  items.map(([, s], i) => `${i + 1}. ${s}`).join("\n") +
  "\nEach icon: chunky, bold, instantly readable silhouette, hand-painted with a few flat saturated colours and simple shading, thick dark outline. " +
  "No text, no letters, no numbers, no frames, no borders, no grid lines, no background scenery. Plain flat pure magenta background (#FF00FF) everywhere.";

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

const r = await falRun("fal-ai/nano-banana-pro", { prompt, aspect_ratio: "1:1", resolution: "1K", output_format: "png" });
const img = await fetch(r.images[0].url);
const file = join(out, "sheet_prompts.png");
writeFileSync(file, Buffer.from(await img.arrayBuffer()));
writeFileSync(file.replace(".png", ".json"), JSON.stringify({ cols: 2, rows: 2, ids: items.map(([id]) => id) }));
console.log("sheet", file);
