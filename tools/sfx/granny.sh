#!/bin/sh
# Granny Hollin's voice from Wren's cut lines: pitched down a fifth-ish with formants kept (an older register, not
# a slowed tape), a little slower, a 6.5 Hz vibrato + tremolo for the elderly quaver, and a thinner band.
#   tools/sfx/granny.sh   writes assets/sfx/vo.scribe.<line>.<n>.ogg from vo.marksman.<line>.<n>.ogg
set -e
cd "$(dirname "$0")/../../assets/sfx"
for f in vo.marksman.*.ogg; do
  out=$(echo "$f" | sed "s/^vo\.marksman\./vo.scribe./")
  ffmpeg -v error -y -i "$f" -af "rubberband=pitch=0.8:tempo=0.92:formant=preserved,vibrato=f=6.5:d=0.35,tremolo=f=6.5:d=0.25,highpass=f=170,lowpass=f=5200,equalizer=f=2600:t=q:w=1.2:g=3,volume=1.15" -ac 1 -c:a libvorbis -q:a 5 "$out"
done
