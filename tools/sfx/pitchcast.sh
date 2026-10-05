#!/bin/sh
# Pitch-cast a new champion voice from an already-cut one without the raw libraries:
#   tools/sfx/pitchcast.sh <from hero> <to hero> <factor>
# writes assets/sfx/vo.<to>.<line>.<n>.ogg = vo.<from>.<line>.<n>.ogg resampled by <factor> (pitch and speed).
# The same voice is declared in manifest.py so a full rebuild from the raw packs gives the same result.
set -e
cd "$(dirname "$0")/../../assets/sfx"
for f in vo."$1".*.ogg; do
  out=$(echo "$f" | sed "s/^vo\.$1\./vo.$2./")
  ffmpeg -v error -y -i "$f" -af "asetrate=44100*$3,aresample=44100" -ac 1 -c:a libvorbis -q:a 4 "$out"
done
