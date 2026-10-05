import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
// Each champion in a mid-action frame of one of its own clips (hero, clip, fraction, yaw).
const shots = [
  ["herald", "attack_c", 0.45, 0.15], ["warlord", "slam", 0.35, 0.6], ["engineer", "attack_c", 0.4, -0.5],
  ["raider", "attack_b", 0.45, 0.7], ["summoner", "cast", 0.55, -0.6], ["duelist", "attack_a", 0.5, 0.8],
  ["warden", "attack_c", 0.4, 0.5], ["marksman", "attack_a", 0.35, -0.9], ["friar", "throw", 0.4, -0.5],
  ["harpooner", "attack_a", 0.35, -0.8], ["scribe", "cast", 0.5, -0.4], ["wreckwitch", "attack_c", 0.4, 0.6],
  ["architect", "throw", 0.4, -0.5], ["vintner", "crush", 0.3, 0.5], ["rider", "fling", 0.45, -0.6],
];
const b = await chromium.launch({ executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1148/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
p.on("pageerror", (e) => console.log("PAGEERR", e.message));
await p.goto("http://localhost:5199/?screen=menu&debug", { waitUntil: "commit" });
for (let i = 0; i < 180; i++) {
  if (await p.evaluate(() => !!window.grudge?.screens?.portraits).catch(() => false)) break;
  await p.waitForTimeout(500);
}
await p.waitForTimeout(4000);
for (const [h, clip, f, yaw] of shots) {
  const url = await p.evaluate(([h, clip, f, yaw]) => grudge.screens.portraits.actionShot(h, clip, f, 900, 1200, yaw).toDataURL("image/png"), [h, clip, f, yaw]);
  writeFileSync(`/tmp/opencode/splash3/act_${h}.png`, Buffer.from(url.split(",")[1], "base64"));
}
await b.close();
console.log("done");
