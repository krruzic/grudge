#!/usr/bin/env bash
# Downloads every raw CC0 sound library the game's sound effects are cut from into $SFX_RAW
# (default ~/.cache/grudge-sfx). tools/sfx/build.py then cuts, processes and encodes them into assets/sfx/.
# Sources (all CC0 / public domain): Kenney audio packs, OpenGameArt packs (rubberduck, artisticdude, AnyRPG list),
# the cc0-sounds.exi.software mirror of OGA collections, and BigSoundBank (Joseph Sardin).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RAW="${SFX_RAW:-$HOME/.cache/grudge-sfx}"
mkdir -p "$RAW" && cd "$RAW"
enc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1"; }

# Kenney
for a in impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds rpg-audio/8e99002d76-1677590336/kenney_rpg-audio \
  interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds ui-audio/490d233f68-1677590494/kenney_ui-audio \
  voiceover-pack-fighter/6ceb77c6f1-1677589837/kenney_voiceover-pack-fighter \
  music-jingles/f37e530b9e-1677590399/kenney_music-jingles; do
  n=$(basename "$a")
  [ -d "$n" ] || { curl -sL -o "$n.zip" "https://kenney.nl/media/pages/assets/$a.zip" && unzip -qo "$n.zip" -d "$n"; }
done

# OpenGameArt zips
for u in 80-CC0-RPG-SFX_0 80-CC0-creature-SFX_0 80-CC0-creature-sfx-2 100-CC0-SFX_0 sfx_100_v2 rpg_sound_pack; do
  [ -d "oga_$u" ] || { curl -sL -o "oga_$u.zip" "https://opengameart.org/sites/default/files/$u.zip" && mkdir -p "oga_$u" && unzip -qo "oga_$u.zip" -d "oga_$u"; }
done
for pg in death-sounds-0 steampunk-fantasy-voices voice-clip-pack-male-adventurer-rpg zombie-skeleton-monster-voice-effects; do
  [ -d "oga2/$pg" ] && continue
  mkdir -p "oga2/$pg"
  for u in $(curl -sL "https://opengameart.org/content/$pg" | grep -oE 'https://opengameart.org/sites/default/files/[^"]+\.(zip|ogg|wav)' | grep -v "audio_preview\|styles/" | sort -u); do
    f="oga2/$pg/$(basename "$u")"
    curl -sL -o "$f" "$u"
    case "$f" in *.zip) unzip -qo "$f" -d "oga2/$pg" ;; esac
  done
done

# cc0-sounds.exi.software collections (file by file)
for c in "Warrior Voice Pack" "RPG Voice Starter Pack" "Orc Voice Pack" "Micro Pack - Organic Wooshes" "Magic Sound Effects" \
  "NIIIEMAND's explosion sfx" "75-cc0-breaking-falling-hit-sfx" "40-cc0-water-splash-slime-sfx" "25-CC0-mud-sfx" \
  "30-cc0-sfx-loops" "25-CC0-bang-sfx" "Catgirl Fighting SFX" "100-CC0-wood-metal-SFX" "warfork-cc0" "Free Sound Assets" \
  "Free SFX for anything" "slr-sfx" "beast_or_animal" "FREE SFX PACK VOL 1" "FREE SFX PACK VOL 2" "Tower of the Kobito" \
  "metal_interactions" "kenney_voiceoverpack"; do
  [ -d "exi/$c" ] && continue
  curl -sL "https://cc0-sounds.exi.software/collection/$(enc "$c")" | grep -oE 'src="/sounds/[^"]+\.(ogg|wav|mp3)"' |
    sed 's/^src="//;s/"$//' | sort -u | while read -r p; do
      out="exi/${p#/sounds/}"
      mkdir -p "$(dirname "$out")"
      [ -f "$out" ] || curl -sL -o "$out" "https://cc0-sounds.exi.software$(enc "$p")"
    done
done

# BigSoundBank (numbers are their sound ids; https://bigsoundbank.com/<slug>-sNNNN.html)
mkdir -p bsb
for i in $(python3 -c "import sys; sys.path.insert(0, '$HERE'); import manifest; print(' '.join(manifest.bsb_ids()))"); do
  [ -f "bsb/$i.mp3" ] || curl -sL -o "bsb/$i.mp3" "https://bigsoundbank.com/UPLOAD/mp3/$i.mp3"
done
echo "raw sounds in $RAW"
