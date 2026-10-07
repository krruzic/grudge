#!/usr/bin/env node
// Announcer name calls for champion select (ElevenLabs Eleven v4 through fal): one voice actor, a different
// delivery per champion via audio tags, drawn-out Smash-style. Writes assets/sfx/name.<hero>.0.ogg (trimmed,
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
const MODEL = "elevenlabs/tts/eleven-v4";
// Short, punchy, one breath: vowels stretched for the hype, no "..." (that makes long dead pauses).
const LINES = {
  warlord: "[deep booming announcer] The WAAARLORD!",
  engineer: "[punchy excited announcer] STIIIG!",
  raider: "[menacing growl announcer] GRIIIM!",
  summoner: "[ominous low announcer] REEEMNIL!",
  duelist: "[flamboyant theatrical announcer] FRANÇOIIIS!",
  warden: "[slow rumbling deep announcer] THOOORN!",
  marksman: "[sharp crisp announcer] WREN!",
  friar: "[very deep jolly announcer] Brother MADDOOOCK!",
  harpooner: "[playful bouncy announcer] TAAADWICK!",
  scribe: "[warm grand announcer] Granny HOLLIN!",
  wreckwitch: "[creepy raspy announcer] Mother KELP!",
  architect: "[proud scholarly announcer] Professor HOOOT!",
  vintner: "[gruff deep announcer] HOGS-HEEEAD!",
  rider: "[bright cheerful announcer] /ˈbræmbəl/ and MEAD!",
  herald: "[regal commanding announcer] The HERALD!",
};
const TAKES = 2;

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
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
for (const hero of which) {
  // A couple of takes; keep the tightest one (the game cuts long calls anyway).
  let best = null;
  for (let t = 0; t < TAKES; t++) {
    const r = await falRun(MODEL, { text: LINES[hero], voice: VOICE, stability: 0.35, seed: 7 + t * 101 });
    const mp3 = join(raw, `${hero}.${t}.mp3`);
    writeFileSync(mp3, Buffer.from(await (await fetch(r.audio.url)).arrayBuffer()));
    const ogg = join(raw, `${hero}.${t}.ogg`);
    // Trim the ends, squash any pause inside to 0.12 s, normalise, mono ogg like the rest of the bank.
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-i", mp3,
      "-af",
      "silenceremove=start_periods=1:start_threshold=-42dB:stop_periods=-1:stop_duration=0.12:stop_threshold=-42dB,areverse,silenceremove=start_periods=1:start_threshold=-42dB,areverse,loudnorm=I=-14:TP=-1.5",
      "-ac", "1", "-ar", "44100", "-c:a", "libvorbis", "-q:a", "5", ogg,
    ]);
    const d = dur(ogg);
    if (!best || d < best.d) best = { ogg, d };
  }
  execFileSync("cp", [best.ogg, join(root, "assets", "sfx", `name.${hero}.0.ogg`)]);
  console.log(hero, best.d.toFixed(2) + "s");
}
