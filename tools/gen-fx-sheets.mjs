import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("..", import.meta.url).pathname;
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.FAL_KEY;
const SHEETS = {
  common: [
    "a bright white-and-pale-yellow comic impact starburst with sharp uneven spikes",
    "a second jagged white impact burst, rougher, with a hot yellow core",
    "a round puffy tan dust cloud, soft lumpy edges",
    "a smaller tan dust puff, three lumps",
    "a grey smoke puff, lumpy and soft",
    "a thin broken white shockwave ring seen face-on, like a circle drawn with a brush",
    "a horizontal white speed streak, thick on the left tapering to a point on the right",
    "a white four-pointed twinkle spark with a yellow centre",
    "a dark brown ground crack pattern radiating from the centre, seen from above",
    "a single chunky grey-brown rock fragment",
    "a small cluster of three brown rock chips",
    "a thick white crescent swoosh arc, like a sword-swing trail, solid at the middle and fading thin at both tips",
    "an orange-red round hit flash burst with a few spikes",
    "a bright orange fire burst with yellow core",
    "a zig-zag bright cyan electric spark",
    "a white-blue water splash crown",
  ],
  warden: [
    "a single bright green oak leaf",
    "a single orange-brown autumn oak leaf",
    "a splintered brown bark chip",
    "a clump of green moss",
    "a soft glowing green forest-spirit wisp, round with a pale centre",
    "a horizontal thorny bramble vine segment, dark green-brown with sharp thorns, spanning the whole cell width",
    "a ring-shaped thorny bramble wreath seen from above, dark green-brown thorny vines",
    "a tangle of brown tree roots radiating out from the centre, seen from above",
    "an explosive burst of pale wooden splinters flying outward",
    "a green nature impact burst: a spiky pale green starburst with leaves flying out",
    "a square mossy grey stone block, seen from the front",
    "a tan dust cloud with small pebbles",
    "a dark ground crack pattern with green moss in the cracks, seen from above",
    "a single sharp curved dark brown thorn",
    "a small white five-petal wildflower with a yellow centre",
    "a glowing green circular druid rune circle seen from above, with leaf and knot patterns",
  ],
};
const COLS = 4;
const prompt = (items) =>
  `A sprite sheet of ${items.length} separate visual-effect sprites for a 1998 Nintendo 64 fantasy action game, hand-painted game textures like those in Legend of Zelda Ocarina of Time, Banjo-Kazooie and Conker. ` +
  `Laid out in a strict grid of ${COLS} columns and ${items.length / COLS} rows with wide empty gaps, each sprite centred in its own cell, filling most of the cell, never touching another. Reading order left to right, top to bottom:\n` +
  items.map((s, i) => `${i + 1}. ${s}`).join("\n") +
  "\nEach sprite: bold readable shape, painted with a few saturated colours and simple soft shading, slightly chunky low-resolution texture feel, no outline unless natural. " +
  "No text, no letters, no numbers, no frames, no borders, no grid lines, no drop shadows, no scenery. Plain flat pure magenta background (#FF00FF) everywhere.";
async function falRun(model, input) {
  const sub = await fetch(`https://queue.fal.run/${model}`, { method: "POST", headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!sub.ok) throw new Error(`${model} submit ${sub.status}: ${await sub.text()}`);
  const { status_url, response_url } = await sub.json();
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await (await fetch(status_url, { headers: { Authorization: `Key ${KEY}` } })).json();
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(JSON.stringify(st));
  }
  return (await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } })).json();
}
const only = process.argv.slice(2);
await Promise.all(Object.entries(SHEETS).filter(([k]) => !only.length || only.includes(k)).map(async ([name, items]) => {
  const r = await falRun("fal-ai/nano-banana-pro", { prompt: prompt(items), aspect_ratio: "1:1", resolution: "1K", output_format: "png" });
  writeFileSync(join(root, `assets/generated/fx/${name}.png`), Buffer.from(await (await fetch(r.images[0].url)).arrayBuffer()));
  writeFileSync(join(root, `assets/generated/fx/${name}.json`), JSON.stringify({ cols: COLS, rows: items.length / COLS, items }));
  console.log("ok", name);
}));
