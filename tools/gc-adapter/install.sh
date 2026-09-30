#!/usr/bin/env bash
set -euo pipefail
SRC=$(ls -d /usr/src/hid-gamecube-adapter-r* | grep -v grudge | head -1)
VER="$(basename "$SRC" | sed 's/^hid-gamecube-adapter-//')grudge"
DST=/usr/src/hid-gamecube-adapter-$VER
HERE=$(cd "$(dirname "$0")" && pwd)
rm -rf "$DST"
cp -r "$SRC" "$DST"
patch -d "$DST" -p1 < "$HERE/per-port-parent.patch"
sed -i "s/^PACKAGE_VERSION=.*/PACKAGE_VERSION=\"$VER\"/" "$DST/dkms.conf"
for v in $(dkms status hid-gamecube-adapter | sed -n 's#^hid-gamecube-adapter/\([^,]*\),.*#\1#p' | sort -u); do
  dkms remove "hid-gamecube-adapter/$v" --all || true
done
dkms install "hid-gamecube-adapter/$VER"
modprobe -r hid_gamecube_adapter || true
modprobe hid_gamecube_adapter
sleep 1
grep -A1 -i "gamecube controller" /proc/bus/input/devices | grep -E "^N:|^P:" || true
