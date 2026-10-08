// Loss tips for the results screen: one short line for a beaten human, read from the two sides' champion classes
// (2v2: the duo's mix against theirs) or, in 1v1, the champions that beat the one you lost to. Built from the sim
// matchup tables (CPU vs CPU, 10 games a matchup): what wins there is what a frustrated new player should try next.

interface Info {
  name: string;
  class?: string;
}

/** 1v1: champions that beat each one most often in the sims (best first). Grim has no hard counter. */
const COUNTERS: Record<string, string[]> = {
  architect: ["raider", "warlord"],
  duelist: ["architect", "warlord"],
  vintner: ["duelist", "scribe"],
  harpooner: ["architect", "friar", "engineer"],
  engineer: ["friar"],
  rider: ["warden", "wreckwitch"],
  summoner: ["scribe", "rider", "friar"],
  marksman: ["friar", "rider"],
  warden: ["summoner", "scribe"],
  wreckwitch: ["scribe", "marksman", "duelist"],
  warlord: ["summoner", "scribe", "marksman"],
  scribe: ["marksman", "architect"],
  friar: ["wreckwitch", "warden", "warlord"],
};

const DIVER = new Set(["assassin", "bruiser"]);
const RANGED = new Set(["marksman", "caster"]);

function list(names: string[]): string {
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} OR ${names[names.length - 1]}`;
}

/**
 * The tip for a side that lost: `mine` / `theirs` are the champion types on each side. Null when nothing useful
 * stands out (or there's no clear "them", e.g. free for all).
 */
export function lossTip(mine: string[], theirs: string[], heroes: Record<string, Info>): string | null {
  if (!mine.length || !theirs.length) return null;
  const name = (t: string) => heroes[t]?.name.toUpperCase().replace(/^MOTHER /, "") ?? t.toUpperCase();
  const cls = (t: string) => heroes[t]?.class ?? "";
  const my = mine.map(cls);
  const their = theirs.map(cls);
  const has = (side: string[], set: Set<string> | string) =>
    side.some((c) => (typeof set === "string" ? c === set : set.has(c)));
  if (mine.length === 1 && theirs.length === 1) {
    const foe = theirs[0];
    const answer = (COUNTERS[foe] ?? []).filter((t) => t !== mine[0]);
    if (!answer.length) return `NOBODY HARD-COUNTERS ${name(foe)}. STAY BY YOUR TOWERS AND MAKE HIM COME TO YOU.`;
    return `LOST TO ${name(foe)}? NEXT TIME TRY ${list(answer.map(name))}.`;
  }
  if (my.every((c) => DIVER.has(c)) && (has(their, "tank") || has(their, RANGED)))
    return "TWO DIVERS GET WALLED AND KITED. PAIR ONE WITH RANGE (WREN, TADWICK, HOLLIN, REMNIL) OR A HEALER (MADDOCK, BRAMBLE).";
  if (my.every((c) => RANGED.has(c)) && has(their, DIVER))
    return "TWO RANGED CHAMPIONS GET DIVED. BRING SOMETHING TOUGH UP FRONT: THORN, HOGSHEAD, WARLORD OR KELP.";
  if (has(their, "support") && !mine.includes("wreckwitch"))
    return "THEY OUT-HEALED YOU. FOCUS THE HEALER FIRST, OR BRING KELP: HER BILGE STOPS ALL HEALING.";
  if (has(their, "tank") && !has(my, RANGED))
    return "A TANK SOAKS MELEE ALL DAY. RANGE (WREN, HOLLIN, REMNIL) WEARS IT DOWN FROM SAFETY.";
  if (has(their, RANGED) && !has(my, "tank") && !has(my, "support"))
    return "THEIR RANGE PICKED YOU APART. SOAK IT WITH A TANK (THORN, HOGSHEAD) OR OUT-HEAL IT (MADDOCK, BRAMBLE).";
  if (has(their, "builder"))
    return "THEIR TOWERS DID THE WORK. FIGHT THEM AWAY FROM THEIR BUILDINGS, OR BREAK THE TOWERS FIRST.";
  return "MIX ROLES: ONE CHAMPION WHO TAKES HITS, ONE WHO DEALS DAMAGE FROM RANGE OR KEEPS THEM ALIVE.";
}
