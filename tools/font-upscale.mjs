import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const root = new URL("..", import.meta.url).pathname;
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.FAL_KEY;
const src = readFileSync(join(root, "assets/generated/font/lowres_sheet.png")).toString("base64");
const prompt = "This is a sheet of chunky pixel-art font glyphs (white on black), each centred in its own invisible grid cell. Redraw every glyph as a clean, smooth, high-resolution vector-style letterform with crisp anti-aliased curved edges and no pixel stair-stepping. Keep each glyph exactly the same shape, weight, proportions, slant and hand-drawn cartoon style as the original, in exactly the same position and size. Pure white glyphs on a pure black background. Do not add, remove, reorder or restyle any glyph, no outlines, no shadows, no gradients, no extra text.";
const sub = await fetch("https://queue.fal.run/fal-ai/nano-banana-pro/edit", {
  method: "POST",
  headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ prompt, image_urls: [`data:image/png;base64,${src}`], resolution: "2K", output_format: "png", aspect_ratio: "auto" }),
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
const img = await fetch(r.images[0].url);
writeFileSync(join(root, "assets/generated/font/hires_sheet.png"), Buffer.from(await img.arrayBuffer()));
console.log("ok");
