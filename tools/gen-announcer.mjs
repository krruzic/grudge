#!/usr/bin/env node
// Announcer name calls for champion select (ElevenLabs eleven-v3 through fal): one voice actor, a different
// delivery per champion via v3 audio tags, drawn-out Smash-style. Writes assets/sfx/name.<hero>.0.ogg (trimmed,
// loudness-normalised with ffmpeg); the game plays it when a seal is placed (Sfx.heroCue).
//
//   node tools/gen-announcer.mjs [hero ...]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY missing (.env)");

const VOICE = "Brian";
const LINES = {
  warlord: "[deep, booming, slow] THE... WAAARLORD!!",
  engineer: "[excited, punchy] STIIIG... THE ENGINEER!",
  raider: "[menacing whisper] Griiim... [shouting] THE RAIDER!",
  summoner: "[ominous, low, slow] Reeemnil... [dramatic] the SUMMONER.",
  duelist: "[theatrical, flamboyant] FRANÇOIIIS... the DUELIST!",
  warden: "[slow, rumbling, deep] THOOORN... THE WARDEN!",
  marksman: "[sharp, crisp, fast] WREN! [proud] The MARKSMAN!",
  friar: "[very deep, jolly, rumbling] BROTHERRR... MADDOOOCK!!",
  harpooner: "[playful, bouncy] BRIIINDLE... TADWIIICK!",
  scribe: "[warm, reverent, then grand] Abbess... HOLLIIIN!",
  wreckwitch: "[creepy, cackling] MOTHERRR... KELP!",
  architect: "[proud, scholarly] PROFESSORRR... HOOOT!",
  vintner: "[gruff, heavy, growling] GRISTLE... THE CELLAR BOAR!!",
  rider: "[cheerful, bright] BRAMBLE... AND... MEEEAD!",
  herald: "[regal, commanding] THE... HERALD!",
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
    await new Promise((r) => setTimeout(r, 2000));
    const st = await (await fetch(status_url, { headers: { Authorization: `Key ${KEY}` } })).json();
    if (st.status === "COMPLETED") break;
    if (st.status && !["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) throw new Error(JSON.stringify(st));
  }
  const res = await fetch(response_url, { headers: { Authorization: `Key ${KEY}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(`${model} ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

const raw = join(root, "assets", "generated", "announcer");
mkdirSync(raw, { recursive: true });
const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LINES);
for (const hero of which) {
  const r = await falRun("fal-ai/elevenlabs/tts/eleven-v3", { text: LINES[hero], voice: VOICE, stability: 0.3 });
  const mp3 = join(raw, `${hero}.mp3`);
  writeFileSync(mp3, Buffer.from(await (await fetch(r.audio.url)).arrayBuffer()));
  // Trim leading / trailing silence, normalise loudness, mono ogg like the rest of the bank.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", mp3,
    "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-14:TP=-1.5",
    "-ac", "1", "-ar", "44100", "-c:a", "libvorbis", "-q:a", "5",
    join(root, "assets", "sfx", `name.${hero}.0.ogg`),
  ]);
  console.log(hero, "ok");
}
