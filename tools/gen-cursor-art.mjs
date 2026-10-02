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

const PROMPT_ALL = "A sprite sheet of game cursor art for the character select screen of a 1998 Nintendo 64 medieval fantasy brawler, in the style of Legend of Zelda Ocarina of Time item icons and Banjo-Kazooie menu art. " +
  "All items share one consistent hand-painted palette with simple shading and a thick dark outline, viewed straight on, chunky and instantly readable. Laid out in three strict rows with wide empty gaps, every item centred in its own space and never touching another:\n" +
  "Row 1, five round wax-seal medallion tokens of equal size, each a thick lumpy wax disc with a raised rim and big bold embossed letters in the middle: " +
  "1. royal blue wax stamped '1P', 2. crimson red wax stamped '2P', 3. golden yellow wax stamped '3P', 4. emerald green wax stamped '4P', 5. dark iron-grey wax stamped 'CP'.\n" +
  "Row 2, three gauntlet hands of the same right-hand glove, brown leather glove with small riveted iron plates on the knuckles and a flared iron cuff, all the same size: " +
  "6. pointing up-left with the index finger extended and the other fingers curled, 7. a closed fist gripping, seen from the back of the hand, 8. an open hand with fingers spread, palm facing the viewer.\n" +
  "Row 3, four small identical white cloth pennant tags with a notched swallowtail end and a dark brown border, each with big bold dark letters: 9. '1P', 10. '2P', 11. '3P', 12. '4P'.\n" +
  "No other text, no frames, no grid lines, no shadows on the ground, no background scenery. Plain flat pure magenta background (#FF00FF) everywhere.";
const which = process.argv[2] ?? "all";
const style =
  "for the character select screen of a 1998 Nintendo 64 medieval fantasy brawler, in the style of Legend of Zelda Ocarina of Time item icons and Banjo-Kazooie menu art. " +
  "All items share one consistent hand-painted palette with simple shading and a thick dark outline, chunky and instantly readable, every item centred in its own space with wide empty gaps, never touching another. ";
const gloves =
  "Three cursor hands of the same RIGHT hand wearing a brown leather gauntlet with small riveted iron plates over the knuckles and a flared iron cuff, all the same size, " +
  "always seen FROM BEHIND: the viewer looks at the BACK of the hand and the knuckle plates, never the palm, exactly like a mouse cursor hand in a video game menu, wrist at the bottom right, fingers toward the top left: " +
  "1. pointing: index finger extended straight up-left, other fingers curled under, back of the hand facing the viewer; " +
  "2. grabbing: a closed fist seen from the back, knuckle plates facing the viewer, fingers curled away; " +
  "3. open: fingers spread and slightly relaxed, back of the hand and knuckle plates facing the viewer, palm hidden. " +
  "Laid out in one row, left to right.";
const prompt =
  which === "gloves"
    ? `A sprite sheet of game cursor art ${style}${gloves} No text, no frames, no grid lines, no background scenery. Plain flat pure magenta background (#FF00FF) everywhere.`
    : PROMPT_ALL;
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

const r = await falRun("fal-ai/nano-banana-pro", { prompt, aspect_ratio: "4:3", resolution: "1K", output_format: "png" });
const img = await fetch(r.images[0].url);
const dir = join(root, "assets", "generated", "cursor");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, which === "gloves" ? "gloves.png" : "sheet.png"), Buffer.from(await img.arrayBuffer()));
console.log("ok");
