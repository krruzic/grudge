#!/usr/bin/env node
// Repaint every hero prop / weapon for each costume (tools/costume/prop_costumes.json): Nano Banana Pro edit of the
// hero's prop sheet (/tmp/opencode/propcos/in_<hero>.png, 4 views per prop per row, from prop_costumes.py sheets)
// with the hero wearing the costume as reference (/tmp/opencode/propcos/ref_<hero>_<costume>.jpg). Writes
// /tmp/opencode/propcos/out_<hero>_<costume>.png; prop_costumes.py bake projects them onto the textures.
// usage: node tools/costume/prop_costumes.mjs [hero | hero/costume ...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../..", import.meta.url).pathname;
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY missing (.env)");
const O = "/tmp/opencode/propcos/";
const CFG = JSON.parse(readFileSync(join(root, "tools/costume/prop_costumes.json"), "utf8"));
const only = process.argv.slice(2);

const ROWS = ["first", "second", "third", "fourth"];
const prompt = (hero, cid, rows) =>
  `The first image is a texture-reference sheet: ${rows.length} prop${rows.length > 1 ? "s" : ""}, one per row, each seen from four sides ` +
  `(${rows.map(([, , d], i) => `${ROWS[i]} row: ${d}`).join("; ")}). The second image shows their owner wearing the ` +
  `"${cid.toUpperCase()}" costume${cid === "rosewindow" ? " (a frog made of leaded stained glass: deep green, amber and cobalt panes held by black lead lines, with a warm inner glow, brass fittings and red bell-pull rope)" : ", front and back"}. Repaint every prop so it clearly belongs to that costume - the same ` +
  "colour scheme, materials, metals, trims and motifs as the costume (wood, metal, cloth, stone, ice or bone recoloured " +
  "and re-detailed to match its theme) - in the same hand-painted game texture style. KEEP EVERY SHAPE, EDGE, POSITION AND " +
  `SILHOUETTE EXACTLY THE SAME in all ${rows.length * 4} views; only change colours, materials and painted surface detail, ` +
  "as if repainting the same 3D models. Do not move, add or remove any part. Keep the plain grey background and the exact " +
  "same layout and size. Rich contrast and painted detail, not flat colours.";

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

const uri = (f, mime) => `data:${mime};base64,${readFileSync(f).toString("base64")}`;
const jobs = [];
for (const [hero, cfg] of Object.entries(CFG))
  for (const cid of cfg.costumes)
    if (!only.length || only.includes(hero) || only.includes(`${hero}/${cid}`)) jobs.push([hero, cid, cfg]);

// A few at a time.
for (let k = 0; k < jobs.length; k += 6)
  await Promise.all(
    jobs.slice(k, k + 6).map(async ([hero, cid, cfg]) => {
      try {
        const r = await falRun("fal-ai/nano-banana-pro/edit", {
          prompt: prompt(hero, cid, cfg.rows),
          image_urls: [uri(`${O}in_${hero}.png`, "image/png"), uri(`${O}ref_${hero}_${cid}.jpg`, "image/jpeg")],
          aspect_ratio: "1:1",
          resolution: "2K",
          output_format: "png",
        });
        const img = await fetch(r.images[0].url);
        writeFileSync(`${O}out_${hero}_${cid}.png`, Buffer.from(await img.arrayBuffer()));
        console.log("ok", hero, cid);
      } catch (e) {
        console.log("FAIL", hero, cid, String(e).slice(0, 200));
      }
    }),
  );
