#!/usr/bin/env bash
# Runs every matchup against every hero in parallel and prints the reports.
# Usage: tools/balance.sh [matches]
N=${1:-16}
HEROES=(warlord engineer raider summoner duelist warden)
OUT=$(mktemp -d)
for ((i=0; i<${#HEROES[@]}; i++)); do
  for ((j=i; j<${#HEROES[@]}; j++)); do
    node --experimental-transform-types --no-warnings tools/sim.ts --matches "$N" --a "${HEROES[i]}" --b "${HEROES[j]}" > "$OUT/${HEROES[i]}_${HEROES[j]}.txt" 2>&1 &
  done
  wait
done
cat "$OUT"/*.txt
rm -rf "$OUT"
