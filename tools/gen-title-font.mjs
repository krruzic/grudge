import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("..", import.meta.url).pathname;
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.FAL_KEY;
const sample = readFileSync(join(root, "assets/generated/names/warlord_raw.png")).toString("base64");
const ROWS = ["ABCDEFGHIJ", "KLMNOPQRST", "UVWXYZ0123", "456789!?'-"];
const prompt = "Paint a font sheet for a gritty 1998 Nintendo 64 dark-medieval game title (think Castlevania 64, Gauntlet Legends, Blood Omen box art). Use the attached image only as a reference for colour and the thick dark outline, NOT for its letter shapes. " +
  "Letters: tall, narrow, condensed carved capitals with sharp angular serifs and chiselled wedge ends, like letters hacked into weathered stone or hammered iron; slightly uneven, chipped and worn edges, scratched texture, subtle grime. " +
  "Fill: aged bone-cream to tarnished gold with darker scratches and a little shading at the bottom, thick near-black brown outline. Serious and menacing, absolutely not cartoony, not rounded, not bubbly, not comic. " +
  "Plain flat pure magenta background (#FF00FF). A strict grid of 10 columns and 4 rows, every character the same cap height, centred in its own cell with wide empty gaps so no two characters touch:\n" +
  ROWS.map((r, i) => `row ${i + 1}: ${r.split("").join("  ")}`).join("\n") +
  "\nExactly these 40 characters in exactly this order, one per cell, nothing else. Each character appears exactly once: no repeats, none skipped. No words, no extra letters, no grid lines, no cell borders, no dividing lines, no drop shadows, no 3D extrusion.";
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
