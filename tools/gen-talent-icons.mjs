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
  bloodroar: "a roaring ogre mouth with blood-red mist and droplets swirling out",
  challenge: "two heavy iron chains crossing in front of a red gauntlet fist pulling them taut",
  magnitude: "a cracked round crater pulling stones and dust into a dark sinkhole center",
  shouldercharge: "a spiked iron pauldron smashing forward through flying rocks with motion lines",
  earthsplitter: "a jagged rock fissure tearing across the ground with stone spikes bursting upward",
  berserker: "a bloody spiked club with a swirling red rage aura and three red slash marks",
  cataclysm: "a glowing lava crack splitting a boulder in half with fire bursting out, a small plus sign rune carved in gold",
  teslatower: "a copper tesla coil tower crackling with blue lightning",
  palisade: "a wall of sharpened timber stakes bound with rope",
  shockwrench: "a big iron wrench crackling with blue electricity",
  fortify: "a brass-riveted iron shield over a stone tower",
  riveter: "three glowing hot rivets flying in a fan from a rivet gun",
  overclock: "a brass gear spinning fast with orange steam and a small lightning spark",
  greatballista: "a huge wooden siege ballista loaded with a giant iron bolt, a small gold plus rune",
  smokebomb: "a round black smoke bomb with a lit fuse and purple smoke pouring out",
  shadowstep: "a hooded goblin silhouette dissolving into black shadow wisps",
  pounce: "a goblin's clawed hand pouncing down onto a red target mark",
  doublejump: "two green goblin boots kicking off a puff of dust, one above the other",
  serrated: "a jagged serrated dagger dripping dark red blood",
  twinfangs: "two crossed curved daggers dripping green poison",
  deathmark: "a black skull with a red X slashed across it, a small gold plus rune",
  bonegolem: "a hulking skeletal brute made of bones rising from purple flames",
  wraiths: "three ghostly skeleton archers with glowing green eyes",
  gravepull: "a bony hand dragging chains into a purple hex circle",
  cascade: "three purple hex runes falling one after another in a line",
  soulsiphon: "a green soul wisp flowing into a purple magic shield",
  arcbolts: "a purple magic bolt forking into chain lightning",
  legion: "a crowd of skeleton warriors raising spears under a purple banner, a small gold plus rune",
  riposte: "a rapier blade deflecting a sword with a bright gold parry spark",
  volte: "a fencer sidestepping, leaving a blue afterimage and a feather",
  blinkstep: "a pair of light fencing boots with blue speed streaks and a ghost copy",
  marked: "a rapier pinning a red fleur-de-lis target mark",
  fleche: "a rapier thrusting forward with a white wind slash flying ahead of it",
  momentum: "a rapier with five glowing gold stacked chevrons",
  thousandcuts: "a whirlwind of many silver rapier slashes, a small gold plus rune",
  rootcage: "thick gnarled roots bursting from the ground and closing into a cage",
  rampart: "a mossy stone wall with leaves and small white flowers growing on it",
  graspingvine: "a thorny green vine lashing out and coiling around a wrist",
  whiplash: "a long wooden arm whipping forward and bursting into splinters",
  thornguard: "a round bark shield covered in sharp thorns",
  overgrowth: "a tangle of thorny brambles erupting from the ground",
  ancientgrove: "an ancient glowing tree with a ring of flowers and green wisps, a small gold plus rune",
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
const flat = (tree) => ["r", "b", "a", "z"].flatMap((k) => tree[k] ?? []);
const sheets = Object.entries(talents.heroes)
  .filter(([hero]) => !only.length || only.includes(hero))
  .map(([hero, tree]) => ({ hero, items: flat(tree).map((t) => [t.id, SUBJECT[t.id]]) }));
const COLS = 4;
const ROWS = 2;

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
