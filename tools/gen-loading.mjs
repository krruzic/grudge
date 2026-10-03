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
if (!ref) throw new Error("usage: gen-loading.mjs <hero_board.png[,more.png]> [art|logo]");
const which = process.argv.slice(3).length ? process.argv.slice(3) : ["art", "logo"];
const out = join(root, "assets", "generated", "loading");
mkdirSync(out, { recursive: true });
const refUris = ref.split(",").map((f) => "data:image/png;base64," + readFileSync(f).toString("base64"));

const jobs = {
  art: {
    model: "fal-ai/nano-banana-pro/edit",
    input: {
      prompt:
        "This image is a reference board of the nine champions as they look in the game (one row, left to right): a hulking green ogre warlord in a riveted iron helmet with curved horns, spiked iron pauldrons, an orange fur tunic, a " +
        "skull on a blue sash and a spiked wooden club; a stout white-bearded dwarf engineer in a leather aviator cap with brass goggles, a brown leather " +
        "tool apron over mustard clothes, blue riveted pauldrons, fur boots and a giant blue-steel and brass pipe wrench; a skinny green goblin assassin " +
        "with long pointed ears in a deep dark hood, blue scarf, leather jerkin with knife bandoliers and a short knife in each hand; a necromancer in a " +
        "purple hood and long wine-red robe with a blue stole and rope belt, a shadowed face with glowing yellow eyes, skeletal hands and a gnarled dark " +
        "staff topped with a blue crystal; a cavalier duellist with long dark curly hair, a curled moustache, a wide cream hat with a big white feather " +
        "plume, white lace-collared doublet with blue shoulders and a blue sash, a rapier, and a long baguette strapped across his back; a huge walking " +
        "treant warden of brown bark with a craggy wooden face, little leafy trees growing from his head, mossy leaf shoulders with orange autumn leaves, a " +
        "blue sash and a round wooden shield; and a knight in full grey plate armour with a closed great helm and plume, a blue tabard, a sword, and a tall " +
        "blue banner with a gold shield emblem on a pole strapped to his back; a young red-haired huntress in a moss-green hood and cloak with a feathered " +
        "mantle, a tall longbow and a quiver, with a bright red hawk perched on her shoulder; and a big round jolly friar with a bald crown ringed by bright " +
        "red hair, a bushy red beard, a deep teal habit with gold hop-vine embroidery, a blue stole, a wine-red rope belt, sandals, a huge wooden tankard and " +
        "an ale keg on his back. Keep each character exactly like the reference: same outfits, colours, " +
        "props, faces and proportions, but pose every one of them in a dynamic BATTLE-READY combat stance, weapons drawn and raised, knees bent, weight forward, braced for the fight, fierce determined expressions, exaggerated action-poster poses with strong diagonals and motion, nobody standing straight or with arms hanging, like the cover of a fighting game: the ogre warlord hefting his spiked club over his shoulder mid-roar, the dwarf engineer gripping his giant wrench two-handed ready to swing, the goblin assassin crouched low with both knives reversed, the necromancer thrusting his crystal staff forward with a crackle of blue light, the duellist en garde with his rapier extended, the warden planting his weapon and bracing, the herald raising his sword with his banner streaming, the huntress drawing her longbow to her cheek with the red hawk screeching and wings spread, and the friar winding up to hurl a keg with his tankard raised in the other hand. Paint brand-new 16:9 box-art key art for a 1998 Nintendo 64 medieval " +
        "tournament brawler with all nine champions: they are grouped in a tight dramatic V-shaped formation charging toward the viewer, big in frame and overlapping slightly, the front figures filling the lower half (two staggered rows are fine, nobody hidden), low camera at chest height, " +
        "across the lower middle of the frame on a trampled jousting field at dusk, all full figures from boots to helmets, torn blue and red " +
        "tournament banners on poles behind them, a wooden palisade and a distant stone keep, warm low sun. Keep the chunky low-poly N64 character " +
        "look with hand-painted textures, like a pre-rendered promotional render from that era. Paint ONE single coherent scene (never repeat or duplicate any character, no ghosted copies, no collage). Leave the upper third as empty open dusk sky for a title and keep " +
        "the bottom-right corner free of characters. No text, no logo, no UI, no border, no glow effects.",
      image_urls: refUris,
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
