#!/usr/bin/env node
// Champion class glyphs (bruiser, tank, assassin, marksman, caster, support, builder) for champion select, drawn by
// Nano Banana Pro in the style of the existing UI glyph sheet (assets/generated/ui_glyphs_raw.png, passed as the
// style reference). Writes raw sheets to assets/generated/class_glyphs_<n>_raw.png; tools/slice-class-glyphs.py cuts
// them into assets/ui/glyphs/class_<id>.png.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

// Optional CLI override: `node tools/gen-class-glyphs.mjs <tag> "NAME:description" ...` draws one sheet of those
// glyphs instead (assets/generated/glyphs_<tag>_raw.png), e.g. one-off UI glyphs like the SIT chair.
const cli = process.argv[2] && process.argv[3] ? process.argv.slice(3).map((a) => a.split(/:(.*)/s).slice(0, 2)) : null;
const SHEETS = cli
  ? [{ aspect: cli.length > 2 ? "16:9" : "4:3", items: cli, file: `glyphs_${process.argv[2]}_raw.png` }]
  : [
      {
        aspect: "21:9",
        items: [
          ["BRUISER", "a big clenched gauntlet fist smashing down with a few impact cracks"],
          ["TANK", "a heavy round-topped tower shield with rivets and a thick rim"],
          ["ASSASSIN", "a curved dagger held point-down with a small crescent moon behind it"],
          ["MARKSMAN", "a drawn longbow with an arrow nocked, pointing up and to the right"],
        ],
      },
      {
        aspect: "16:9",
        items: [
          ["CASTER", "a gnarled wizard staff topped with a glowing orb and two small sparkles"],
          ["SUPPORT", "a round heart with a bold plus sign cut out of its centre"],
          ["BUILDER", "a claw hammer crossed over a spanner wrench in front of a small brick wall"],
        ],
      },
    ];

const ref = `data:image/png;base64,${readFileSync(join(root, "assets/generated/ui_glyphs_raw.png")).toString("base64")}`;

const prompt = (items) =>
  `Draw a new icon sheet in exactly the same style as this reference sheet: ${items.length} equal tall white panels side by side, ` +
  "separated by thin black vertical lines, each with one bold solid black flat silhouette icon centred in the upper part " +
  "and its name in heavy black capitals underneath. Same chunky rounded shapes, same thick black fills with small white " +
  "cut-out details, same little accent marks, no grey, no gradients, no colour. Panels, left to right:\n" +
  items.map(([n, s], i) => `${i + 1}. ${n}: ${s}`).join("\n") +
  "\nEvery icon about the same size and weight as the reference icons, fully inside its panel, never touching the lines or the label.";

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
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status))
      throw new Error(`${model} ${JSON.stringify(st)}`);
  }
  const res = await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`${model} result ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const only = !cli && process.argv[2] !== undefined ? Number(process.argv[2]) : undefined;
await Promise.all(
  SHEETS.map(async ({ aspect, items, file: name }, n) => {
    if (only !== undefined && only !== n) return;
    const r = await falRun("fal-ai/nano-banana-pro/edit", {
      prompt: prompt(items),
      image_urls: [ref],
      aspect_ratio: aspect,
      resolution: "2K",
      output_format: "png",
    });
    const img = await fetch(r.images[0].url);
    const file = join(root, "assets/generated", name ?? `class_glyphs_${n}_raw.png`);
    writeFileSync(file, Buffer.from(await img.arrayBuffer()));
    console.log(file, items.map(([id]) => id).join(","));
  }),
);
