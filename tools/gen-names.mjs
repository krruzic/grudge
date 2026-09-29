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

const ALL = ["warlord", "engineer", "raider", "summoner", "duelist", "warden", "herald"];
const names = (process.argv.slice(2).length ? process.argv.slice(2) : ALL).map((a) => (a.includes("=") ? a.split("=") : [a, a.toUpperCase()]));
const out = join(root, "assets", "generated", "names");
mkdirSync(out, { recursive: true });

const prompt = (n) =>
  `The text "${n}" as a hand-painted title logo for a 1998 Nintendo 64 medieval fantasy game. ` +
  "Chunky blackletter-inspired but highly legible capital letters, painted cream-gold fill with a thick dark brown outline, " +
  "slight hand-lettered wobble, flat colours like a painted tavern sign, no gradients, no glow, no bevel, no 3D extrusion, no chrome. " +
  "The word is centred on a plain flat pure magenta background (#FF00FF). Nothing else: no scroll, no banner, no border, no ornaments, " +
  "no other text, spelled exactly " + n.split("").map((c) => (c === " " ? "(space)" : c)).join("-") + ", all on one line.";

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

await Promise.all(
  names.map(async ([n, text]) => {
    const r = await falRun("fal-ai/nano-banana-pro", { prompt: prompt(text), aspect_ratio: "21:9", resolution: "1K", output_format: "png" });
    const img = await fetch(r.images[0].url);
    writeFileSync(join(out, `${n}_raw.png`), Buffer.from(await img.arrayBuffer()));
    console.log(n, "ok");
  }),
);
