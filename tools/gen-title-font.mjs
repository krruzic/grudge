import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("..", import.meta.url).pathname;
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.FAL_KEY;
const sample = readFileSync(join(root, "assets/generated/names/warlord_raw.png")).toString("base64");
const ROWS = ["ABCDEFGH", "IJKLMNOP", "QRSTUVWX", "YZ012345", "6789!?'-"];
const prompt = "Using the exact lettering style of the attached image (chunky hand-painted title letters, cream-gold flat fill, thick dark brown outline, slight hand-lettered wobble, same weight and proportions), " +
  "paint a complete font sheet of single characters on a plain flat pure magenta background (#FF00FF). Arrange them in a strict grid of 8 columns and 5 rows, every character the same cap height, centred in its own cell with wide empty gaps so no two characters ever touch:\n" +
  ROWS.map((r, i) => `row ${i + 1}: ${r.split("").join("  ")}`).join("\n") +
  "\nExactly these 40 characters in exactly this order, one per cell, nothing else. No words, no extra letters, no grid lines, no borders, no shadows, no gradients, no 3D.";
const sub = await fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", {
  method: "POST",
  headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ prompt, image_urls: [`data:image/png;base64,${sample}`], resolution: "2K", aspect_ratio: "16:9", output_format: "png" }),
});
if (!sub.ok) throw new Error(await sub.text());
const { status_url, response_url } = await sub.json();
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = await (await fetch(status_url, { headers: { Authorization: `Key ${KEY}` } })).json();
  if (st.status === "COMPLETED") break;
  if (!["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(JSON.stringify(st));
}
const r = await (await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } })).json();
writeFileSync(join(root, "assets/generated/titlefont/sheet.png"), Buffer.from(await (await fetch(r.images[0].url)).arrayBuffer()));
writeFileSync(join(root, "assets/generated/titlefont/sheet.json"), JSON.stringify({ rows: ROWS }));
console.log("ok");
