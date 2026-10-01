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
const ref = process.argv[2];
if (!ref) throw new Error("usage: gen-loading.mjs <hero_lineup.png> [art|logo]");
const which = process.argv.slice(3).length ? process.argv.slice(3) : ["art", "logo"];
const out = join(root, "assets", "generated", "loading");
mkdirSync(out, { recursive: true });
const refUri = "data:image/png;base64," + readFileSync(ref).toString("base64");

const jobs = {
  art: {
    model: "fal-ai/nano-banana-pro/edit",
    input: {
      prompt:
        "Using these six exact characters as reference (same outfits, colours, proportions and faces, left to right: a green ogre warlord in a riveted iron horned helm with an orange fur tunic and a spiked wooden club, a white-bearded dwarf engineer with brass goggles on a leather cap, a yellow apron, big gloves and a golden wrench and steam backpack, a green goblin raider in a deep black hood with a blue scarf and two curved daggers, a purple-robed hooded summoner with a dark face and glowing yellow eyes holding a crystal staff with skull charms, a musketeer duelist with long dark curly ringlets, a moustache, a wide plumed hat, a blue cape and a rapier, and a walking tree warden with branch antlers, green and autumn-orange leaf shoulders, fallen autumn leaves on his bark and a round plank shield), paint box-art key art for a 1998 Nintendo 64" +
        "medieval tournament brawler. The six champions stand in a loose heroic group on a trampled jousting field at dusk, torn blue and red " +
        "tournament banners on poles behind them, a wooden palisade and a distant stone keep, warm low sun. Keep the chunky low-poly N64 character look " +
        "with visible painted textures, like a pre-rendered promotional render from that era. No text, no logo, no UI, no border. Leave the upper third " +
        "as sky for a title.",
      image_urls: [refUri],
      aspect_ratio: "16:9",
      resolution: "2K",
      output_format: "png",
    },
  },
  logo: {
    model: "fal-ai/nano-banana-pro",
    input: {
      prompt:
        'The word "GRUDGE" as the hand-painted title logo of a 1998 Nintendo 64 medieval fantasy game. Big chunky blackletter-inspired but legible ' +
        "capitals, flat blood-red painted fill with a thick dark brown outline and a thin cream inner edge, slight hand-lettered wobble, a crossed sword " +
        "and war-axe behind the letters, flat colours like a painted tavern sign, no gradients, no glow, no bevel, no chrome, no 3D extrusion. Centred on " +
        "a plain flat pure magenta background (#FF00FF). Spelled exactly G-R-U-D-G-E, nothing else, no other text.",
      aspect_ratio: "21:9",
      resolution: "1K",
      output_format: "png",
    },
  },
};

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
  which.map(async (k) => {
    const r = await falRun(jobs[k].model, jobs[k].input);
    const img = await fetch(r.images[0].url);
    writeFileSync(join(out, `${k}_raw.png`), Buffer.from(await img.arrayBuffer()));
    console.log(k, "ok");
  }),
);
