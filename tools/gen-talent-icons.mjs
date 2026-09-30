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

const SUBJECT = {
  earthsplitter: "a jagged line of brown rock spikes bursting up out of cracked earth in a row",
  faultline: "a long glowing crack splitting the ground with rock shards and yellow stun stars",
  aftershock: "a rock spike line ending in a big dusty earth explosion",
  bloodlust: "a red axe blade dripping blood with a red heart",
  frenzy: "a flaming red axe spinning in a full circle with fire trails",
  wartrophy: "a horned helmet trophy on a spike with a golden shield behind it",
  magnitude: "a giant stone fist smashing the ground with dust swirling inward",
  sinkhole: "a dark swirling sinkhole pit in brown earth with rocks falling in",
  tremor: "three rings of cracked earth shockwaves expanding",
  shouldercharge: "an armored shoulder pauldron charging forward with dust and speed lines",
  unstoppable: "a steel shield with a charging bull silhouette and grey armor plates",
  bulldoze: "a charging armored ogre knocking small enemies flying with stun stars",
  riveter: "a big iron rivet flying fast with speed lines",
  scattershot: "three iron rivets flying outward in a fan",
  shrapnel: "an iron rivet exploding into orange shrapnel sparks",
  overclock: "a brass cogwheel spinning fast with orange steam and a speed arrow",
  tuneup: "a wrench and a green plus sign over a small wooden tower",
  sparkgap: "two copper coils with a blue lightning bolt arcing between them",
  fortify: "a stone tower wrapped in a glowing blue hexagon shield bubble",
  bulwark: "a large blue kite shield with smaller shields around it",
  overdrive: "a crossbow tower firing two bolts with golden gears and steam",
  shockwrench: "a big wrench crackling with blue electricity",
  teslacoil: "a copper tesla coil tower on a post shooting blue lightning",
  magnet: "a red horseshoe magnet pulling small figures inward",
  serrated: "a jagged serrated dagger with red blood drops",
  hemorrhage: "a burst of red blood droplets exploding outward",
  bloodscent: "a wolf nose sniffing red blood drops with a green heal plus",
  twinfangs: "two curved throwing daggers crossed in an X",
  poisontips: "a dagger tip dripping bright green poison",
  ricochet: "a thrown dagger bouncing between two targets with a zigzag arrow",
  pounce: "a leaping hooded goblin silhouette with a red target crosshair below",
  predator: "a red glowing eye in dark smoke with a dagger",
  rip: "a red crosshair mark exploding with claw slashes",
  doublejump: "a hooded figure jumping with two white dust puff clouds below its feet",
  featherfall: "a white feather floating over a small blue shield",
  crater: "a brown impact crater in the ground with rocks flying up",
  soulsiphon: "a purple soul wisp flowing into a green heart",
  soulharvest: "a skeletal hand rising from the ground holding a purple soul",
  darkpact: "a purple glowing shield with a skull emblem",
  arcbolts: "a purple magic bolt splitting into a second forked bolt",
  stormorb: "a purple magic orb crackling with blue chain lightning",
  hexfire: "a purple hex rune on fire with a small skull",
  gravepull: "a purple vortex swirl pulling bones into its center",
  ossuary: "sharp white bone spikes sticking out of dark ground",
  boneprison: "a cage made of white rib bones with stun stars",
  twinhex: "two purple pentagram hex circles side by side",
  cascade: "three purple hex circles in a row marching forward",
  hungrydead: "a green skeleton grunt clawing out of a purple hex circle",
  engarde: "a thin rapier sword raised in guard pose with a small clock",
  riposte: "a rapier deflecting a strike with a golden spark and a small shield",
  counterstrike: "two crossed rapiers with a bright yellow impact star",
  fleche: "a rapier thrusting forward with long white speed lines",
  windslash: "a white crescent wind slash flying through the air",
  momentum: "a rapier with five stacked orange chevrons rising",
  blinkstep: "a fencer silhouette dashing with two ghostly afterimages",
  afterimage: "a translucent blue ghostly copy of a fencer lunging",
  feint: "a rapier glowing with yellow sparkles of power",
  marked: "a red crosshair target mark over a helmet",
  execute: "a rapier stabbing down through a red skull",
  duel: "a red crosshair over a broken cracked sword",
  thornguard: "a round wooden bark shield covered in green thorns",
  barkskin: "a thick tree bark armor chestplate",
  thornburst: "a bark shield exploding into flying thorns and splinters",
  rootsnare: "green roots wrapping tightly around a boot",
  overgrowth: "a thorny bramble patch with green leaves and thorns",
  uproot: "a tree root flinging a small figure into the air",
  graspingvine: "a long green vine whip grabbing with a leafy hand",
  choke: "a green vine coiled tightly with yellow stun stars",
  tether: "a green vine rope pulling tight with a blue slow snowflake",
  whiplash: "a long wooden arm whip cracking through three small targets",
  flail: "two wooden arm whips swinging in a double arc",
  splinter: "a wooden arm exploding into sharp flying splinters",
};

const out = join(root, "assets", "generated", "talents");
mkdirSync(out, { recursive: true });
const talents = JSON.parse(readFileSync(join(root, "data", "talents.json"), "utf8"));
const HERO_LOOK = {
  warlord: "a hulking green ogre warlord: earthy browns, blood red and iron grey",
  engineer: "a dwarf engineer: brass, copper, iron and orange steam",
  raider: "a hooded goblin raider: dark leather, blood red and poison green",
  summoner: "a necromancer summoner: purple magic, bone white and sickly green",
  duelist: "a swift fencer duelist: steel blue, white and gold",
  warden: "a treant warden: bark brown, leafy green and thorns",
};
const only = process.argv.slice(2);
const flat = (list) => list.flatMap((t) => [t, ...(t.next ?? [])]);
const sheets = Object.entries(talents.heroes)
  .filter(([hero]) => !only.length || only.includes(hero))
  .map(([hero, tree]) => ({ hero, items: [...flat(tree.a), ...flat(tree.b)].map((t) => [t.id, SUBJECT[t.id]]) }));
const COLS = 4;
const ROWS = 3;

const prompt = (hero, items) =>
  `A sprite sheet of ${items.length} separate ability icons for one character, ${HERO_LOOK[hero]}, in a 1998 Nintendo 64 fantasy game. All icons share one consistent palette and painting style, in the style of Legend of Zelda Ocarina of Time item icons and Banjo-Kazooie menu art, ` +
  `laid out in a strict grid of ${COLS} columns and ${ROWS} rows with wide empty gaps, each icon centred in its own cell and never touching another. Reading order left to right, top to bottom:\n` +
  items.map(([, s], i) => `${i + 1}. ${s}`).join("\n") +
  "\nEach icon: chunky, bold, instantly readable silhouette, hand-painted with a few flat saturated colours and simple shading, thick dark outline. " +
  "No text, no letters, no numbers, no frames, no borders, no grid lines, no background scenery. Plain flat pure magenta background (#FF00FF) everywhere.";

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

await Promise.all(sheets.map(async ({ hero, items }, n) => {
  const r = await falRun("fal-ai/nano-banana-pro", { prompt: prompt(hero, items), aspect_ratio: "4:3", resolution: "1K", output_format: "png" });
  const img = await fetch(r.images[0].url);
  const file = join(out, `sheet_${hero}.png`);
  writeFileSync(file, Buffer.from(await img.arrayBuffer()));
  writeFileSync(file.replace(".png", ".json"), JSON.stringify({ cols: COLS, rows: ROWS, ids: items.map(([id]) => id) }));
  console.log("sheet", file, items.map(([id]) => id).join(","));
}));
