#!/usr/bin/env node
// Themed FX for the original champions' recolour costumes: for each hero/costume in old_costume_themes.json, a Nano
// Banana Pro edit of the hero's base FX atlas (4x4) and, where the hero has HQ paintings, of those paintings (2x2),
// with the costumed hero (/tmp/opencode/propcos/ref_<hero>_<costume>.jpg) as the theme reference.
// Inputs from old_costume_fx.py inputs; outputs /tmp/opencode/oldfx/out/{atlas,hq}_<hero>_<costume>.png, then
// old_costume_fx.py cut. usage: node tools/fx-prompts/old_costume_fx.mjs [hero | hero/costume ...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../..", import.meta.url).pathname;
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KEY = process.env.FAL_KEY;
const W = "/tmp/opencode/oldfx/";
const THEMES = JSON.parse(readFileSync(join(root, "tools/fx-prompts/old_costume_themes.json"), "utf8"));
const only = process.argv.slice(2);

const RULES =
  "Keep each design's role, silhouette, size and position, in exactly the same hand-painted style, brushwork, soft lighting " +
  "and saturation as image 1 - but recolour and re-detail it fully in the costume's palette, materials and motifs so it " +
  "clearly belongs to that costume and NOT to the plain version. No text, no letters, no numbers, no frames, no borders, no " +
  "grid lines, no drop shadows, no black outlines, no pixel art, do not draw the character. The background must be plain " +
  "flat single colour everywhere exactly like image 1 (the same pure magenta or pure green), one uniform colour, no " +
  "gradient, no checkerboard, and no glow tinted by that background colour.";
const atlasPrompt = (cid, theme) =>
  `Image 1 is a finished sheet of 16 visual-effect sprites from our hand-painted fantasy action game: a 4x4 grid, each ` +
  `sprite centred in its own cell on a flat magenta background. Image 2 shows the hero in the costume ${cid.toUpperCase()}: ` +
  `${theme} Repaint EVERY one of the 16 sprites of image 1 in this costume's theme. Keep the same 4x4 grid; every sprite ` +
  `stays centred in its own cell, filling most of it, wide empty gaps, never touching. ${RULES}`;
const hqPrompt = (cid, theme, n) =>
  `Image 1 is a 2x2 grid of ${n} large hand-painted visual-effect paintings from our stylised fantasy action game (ground ` +
  `decals, rings and bursts seen from above or face-on)${n < 4 ? "; the empty quadrant stays empty magenta" : ""}. Image 2 ` +
  `shows the hero in the costume ${cid.toUpperCase()}: ${theme} Repaint the paintings of image 1 in this costume's theme as ` +
  `crisp HIGH-RESOLUTION paintings with the SAME 2x2 layout: each design stays centred in its own quadrant at the same ` +
  `size and shape, never crossing into another quadrant, rings stay perfect circles with empty centres where image 1's ` +
  `are empty. Rich painted detail, sharp clean edges. ${RULES}`;

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
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(JSON.stringify(st));
  }
  return (await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } })).json();
}
// Green screen for the HQ paintings unless the costume itself is green (then magenta, like the atlas).
const GREEN_THEMES = new Set(["friar/hopmaster", "summoner/plague", "warlord/swamp"]);
const uri = (f, mime) => `data:${mime};base64,${readFileSync(f).toString("base64")}`;
const HQN = { warlord: 2, raider: 2, summoner: 3, warden: 4, marksman: 2, friar: 4 };

const jobs = [];
for (const [k, theme] of Object.entries(THEMES)) {
  const [hero, cid] = k.split("/");
  if (only.length && !only.includes(hero) && !only.includes(k)) continue;
  jobs.push(["atlas", hero, cid, theme]);
  if (existsSync(`${W}in/hq_${hero}_mag.png`)) jobs.push(["hq", hero, cid, theme]);
}
for (let i = 0; i < jobs.length; i += 8)
  await Promise.all(
    jobs.slice(i, i + 8).map(async ([kind, hero, cid, theme]) => {
      const out = `${W}out/${kind}_${hero}_${cid}.png`;
      if (existsSync(out) && !process.env.FORCE) return;
      try {
        const r = await falRun("fal-ai/nano-banana-pro/edit", {
          prompt: kind === "atlas" ? atlasPrompt(cid, theme) : hqPrompt(cid, theme, HQN[hero]),
          image_urls: [
            uri(
              `${W}in/${kind}_${hero}${kind === "hq" ? (GREEN_THEMES.has(`${hero}/${cid}`) ? "_mag" : "_grn") : ""}.png`,
              "image/png",
            ),
            uri(`/tmp/opencode/propcos/ref_${hero}_${cid}.jpg`, "image/jpeg"),
          ],
          aspect_ratio: "1:1",
          resolution: "2K",
          output_format: "png",
        });
        writeFileSync(out, Buffer.from(await (await fetch(r.images[0].url)).arrayBuffer()));
        console.log("ok", kind, hero, cid);
      } catch (e) {
        console.log("FAIL", kind, hero, cid, String(e).slice(0, 160));
      }
    }),
  );
